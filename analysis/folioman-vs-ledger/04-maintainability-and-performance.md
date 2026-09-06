# Maintainability, Extensibility, Performance — Brief Comparison

Companion to files 00-03. Same evidence base, narrowed to three practical questions: which stack is easier to maintain, easier to extend with new modules, and faster — for Ledger's actual context (self-hosted, single-tenant, local-first, no cloud dependency per `docs/06-architecture.md`).

## Maintainability

**Ledger's stack is lower-overhead to maintain.** One language (TypeScript) end to end — domain, server, UI — means one type system, no cross-language contract to keep honest. One package, one lockfile. No codegen step: `import type` gives the UI real server types for free. Folioman needs `openapi-typescript` regeneration on every backend schema change to keep the Vue client type-safe, and file 01 found a concrete case where that safety net has a hole anyway (`ImportJobOut.result: dict` — untyped at the contract level, the frontend hand-declares a matching interface by reading server code). More moving parts (4 Python packages + a `uv` workspace + the frontend's own separate `pnpm-workspace.yaml`) means more version/compatibility surface to maintain, even though each individual package is small.

**Folioman's stack has stronger drift prevention at the boundary.** Package-level enforcement (a `core/` file that imports Django simply fails to resolve) catches a class of mistake that Ledger currently only catches by convention + review everywhere except `domain/` (file 02). For a larger contributor base or a longer-lived project, that mechanical guarantee is worth something Ledger doesn't have yet.

**Net:** for a solo/small-team, fast-iterating project — Ledger's actual situation — one language and zero codegen wins on day-to-day maintenance cost. The gap Folioman's approach would close (enforcement below `domain/`) is real but narrow (file 03, risk #1), and cheaper to close with a second lint rule than by adopting Folioman's whole package-boundary model.

## Adding future modules

**Ledger, evidenced, not theoretical:** the Instrument Catalogue delta (this session) added a new domain concept, an ingestion use-case, a repository, actions, and UI — inside the existing four-layer shape, no new packaging, no schema-generation step, shipped in one session with zero test regressions. Ledger also already has a proven plugin-registry pattern for its highest-variability subsystem: import adapters are keyed `institution.product.format`, registered in explicit priority order with a generic-CSV fallback last (AGENTS.md rule #26) — structurally the same idea as Folioman's import-processor registry (`register_processor`, file 01 §9).

**Folioman's ceremony per new module is heavier but built for large, pluggable additions:** a new domain area needs pydantic models (tested standalone), a Django ORM mirror, mapper functions both directions, a new Ninja router, then a full codegen+rebuild cycle before the Vue UI can even see the new types. That cost buys real pluggability at scale — new tax jurisdictions register into `tax/policy.py`'s registry, new import kinds register into the processor registry, without touching existing ones.

**Net:** for Ledger's actual cadence (small, frequent deltas — several per week in this project's history) the low-ceremony path is faster. If Portfolio work turns out to need many independently-swappable pieces at once (e.g., several pricing providers, several jurisdictions) — which is explicitly deferred per `docs/pending/2026-08-21-Instrument-Model-Pricing-Foundations.md` §9/§13 — a registry pattern (Ledger already has the import-adapter precedent to copy) is the right unit to add, not a wholesale architecture change.

## Performance

**Ledger's read path is structurally faster for this app's actual usage.** Server Components call `db`/use-cases in-process during render — zero network hop, zero JSON marshal/unmarshal, for every read (file 02). Folioman crosses a real HTTP+JSON boundary for every read even in desktop mode, because the Vue SPA only ever talks to the backend over same-origin HTTP (file 01 §7) — a loopback TCP round trip and JSON (de)serialization on every dashboard load, by design, even with zero users. For a local-first, single-user app, that's overhead with no corresponding benefit.

**Folioman's stack has a higher ceiling for concurrent, multi-tenant load** (gunicorn worker processes + Postgres MVCC) — but this is irrelevant to Ledger's stated model: one Hosted Instance, one SQLite file, self-hosted, no cloud dependency. Both apps are single-writer-SQLite in their actual common deployment shape (Folioman desktop, Ledger always) — neither gets Postgres's concurrency advantage there.

**For CPU-bound calculation** (FIFO loops, XIRR root-finding — squarely what Portfolio work would need), Node/V8 generally outperforms CPython on hot numeric loops even with Nuitka's native compilation, since Nuitka speeds up Python execution but doesn't remove CPython's dynamic-typing overhead the way V8's JIT does for monomorphic TypeScript code. This favors implementing Portfolio's FIFO/XIRR directly in Ledger's TypeScript `domain/` over anything resembling a Python subprocess.

**Net:** Ledger's current architecture is faster for its own real workload today (in-process reads, no serialization tax), and its language choice has no performance disadvantage for the calculation-heavy work Portfolio would add later.

## One-line summary per axis

| Axis | Winner for Ledger's context | Why |
|---|---|---|
| Maintainability | Ledger | one language, one package, no codegen, domain boundary already enforced |
| Extensibility | Ledger | evidenced this session; registry pattern already proven (import adapters) for the one place it's needed |
| Performance | Ledger | in-process reads beat Folioman's mandatory HTTP+JSON hop for every read, at Ledger's actual (self-hosted, single-tenant) scale |

Folioman's genuine advantage is narrower than "better stack": a package-enforced domain boundary below what Ledger enforces today, and a real, working answer to serving one codebase from two delivery mechanisms (WSGI) — which is precisely file 03's scoped "minor restructuring" trigger, not a reason to prefer Folioman's stack wholesale.
