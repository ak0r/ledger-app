# Folioman vs. Ledger — Comparison, Risks, and Redesign Trigger Assessment

## Similarities

| | Folioman | Ledger |
|---|---|---|
| Domain isolation | `core/` — zero framework deps, real package boundary | `domain/` — zero framework deps, ESLint-enforced boundary |
| Translation boundary | `mappers.py` (ORM→core) + `_upsert.py` (core→ORM), one named place each | `use-cases` call `domain/validate*` then map to repository rows — same one-way shape, less formally named but consistently one-directional (verified, §02) |
| Frontend trusted with zero business logic | Verified by grep — zero FIFO/XIRR/tax logic in Vue | Verified by architecture — `domain/` runs the *same* code client-side for UX and server-side for enforcement, so there's no separate "frontend implementation" to drift, by construction |
| One layer genuinely reusable in isolation, tested standalone | `core/tests/` — no Django, no DB | `domain/*.test.ts` — no DB, no Next.js (checked: domain tests only import `vitest` + sibling domain modules) |

## Real differences

| | Folioman | Ledger |
|---|---|---|
| Domain scope | Portfolio/investment only — no double-entry ledger exists in Folioman at all | Double-entry ledger (accounts, postings, balance invariant) — the accounting spine (AGENTS.md rule #2) |
| Package boundaries | 4 separately-versioned installable packages in a `uv` workspace; import of a non-dependency package fails at install/type-check time | 1 package; only `domain/` has an enforced boundary (ESLint), everything else convention-only |
| Delivery-mechanism abstraction | WSGI — a real, mature standard both gunicorn and a loopback dev server satisfy identically | None — Server Components read the DB in-process during render; Server Actions are a Next.js-specific RPC primitive, not a portable "call this from any host" API |
| Frontend↔backend contract | Cross-language (Python↔TypeScript) — needs `openapi.json` + generated client for any type safety at all | Same-language (TypeScript↔TypeScript) — `import type` gives free, codegen-free type sharing |
| Desktop packaging | Nuitka compiles the actual Django+app+core stack into one native binary; PyWebView is a thin native-window shell around it | No desktop target exists; Next.js has no direct equivalent of "compile the whole server to one native binary," though `next build` + a bundled Node runtime inside Electron/Tauri is the analogous shape |
| Scheduled/background work | APScheduler, in-process (desktop) or standalone `BlockingScheduler` process (server) — 5 registered valuation/refresh jobs | None yet — no scheduler layer exists in Ledger at all |

## Where each has stronger boundaries

**Stronger in Folioman:** the app/core split is enforced by the package manager, not just a lint rule — a `core/` file literally cannot `import folioman_app` and have it resolve, whereas Ledger's non-domain layers rely on nobody writing the wrong import (mitigated by AGENTS.md + review, not by tooling). Folioman also has a genuine, working answer to "one business-logic layer, two delivery mechanisms" that Ledger has never had to build yet.

**Stronger in Ledger:** the domain/UI split gives Ledger something Folioman structurally cannot have — the *exact same validation code* running client-side (instant feedback) and server-side (authoritative enforcement), because both sides are TypeScript. Folioman's Vue frontend is, by construction, a second implementation surface that has to be kept honest by discipline + grep-auditing (which this analysis did, and which held up — but it's a standing risk category Ledger doesn't carry at all for anything expressed in `domain/`).

## Ledger's architectural debt, named specifically

1. **No lint/package enforcement below `domain/`.** A future contributor (human or agent) could import `server/repositories` from a Client Component with runtime intent (not just `import type`) and nothing would catch it before code review. Bounded risk today (zero instances found), but it's the one place Folioman's mechanism is categorically stronger.
2. **No host-agnostic entrypoint into business logic.** This is the concrete blocker for a Desktop delivery target, not a vague "Next.js is different" observation — Server Actions and direct Server-Component `db` access are both Next.js-request-lifecycle-shaped, and neither has an equivalent of "boot this exact application object under a different server," which is precisely the property `desktop/server.py` relies on.
3. **No scheduler/background-job layer.** If Portfolio work needs periodic valuation refresh or NAV polling (Folioman's APScheduler jobs are the direct precedent), Ledger has nowhere for that to live yet and no established pattern for "day-wise recompute" the way Folioman's `Investor.valuation_status`/`valuation_next_attempt_at` durable-worklist columns demonstrate.

## Does adding Portfolio, by itself, threaten Ledger's current architecture?

**No — evidenced, not assumed.** The Instrument Catalogue delta (this session, `docs/completed/2026-09-04-Instrument-Catalogue.md`) added a real slice of investment-domain functionality — new domain types, posting-level quantity/price with a generalized invariant, external-data ingestion, a new repository, new actions, new UI — entirely inside the existing `domain → repositories → use-cases → actions → components` shape, with zero boundary exceptions and zero test regressions (547/547 passing). Folioman's `core/` doesn't validate "should Ledger+Portfolio share one Core" one way or the other, because Folioman never had two domains to separate in the first place (§01) — it only validates that a calculation-heavy domain *can* stay framework-free and testable, which Ledger's `domain/` already independently proves for itself.

## Does adding a Desktop target threaten Ledger's current architecture?

**Yes, narrowly** — not because `domain/`/`use-cases`/`repositories` are wrong, but because nothing today packages Ledger's business logic as a single object a Desktop shell could boot the way Folioman's `desktop/server.py` boots one Django WSGI app. Two genuinely different fixes exist, worth naming since conflating them would misdirect a future redesign:

- **(a) Wrap the whole existing Next.js server.** `next build` (standalone output) produces a self-contained Node server; an Electron/Tauri shell could spawn it on loopback and point a native window at it — closely mirroring how PyWebView points at Folioman's loopback WSGI server. This requires **no change** to Ledger's current use-case/repository/action layering — only a packaging shell, analogous to Nuitka. This is the cheap option and doesn't require answering the Core/App/Portfolio modeling question at all.
- **(b) Extract `use-cases`/`repositories` as a Next.js-agnostic library** (no `"use server"`, no assumption of running inside a Server Component render pass) that any Node host — a Next.js app, an Electron main process — could import and call directly, mirroring Folioman's "app/ is delivery-agnostic" property more precisely. This is the more invasive option, and the one closer to what the user's proposed Core/App/Desktop/Web diagram implies structurally.

The task brief for this analysis explicitly excludes recommending between (a)/(b) — that's the follow-up design exercise, not this one. It's flagged here only because the *comparison itself* surfaces that they are different-sized changes answering the same symptom, and picking the redesign target before naming both would be choosing based on preference rather than evidence.

## Redesign trigger assessment

Per the brief's own A/B/C/D scale:

- **A. No redesign needed** — too strong; there is a real, evidenced gap (no host-agnostic app boundary) that would block a Desktop target as currently proposed.
- **B. Minor restructuring needed** — supported: the gap is narrow and localized (the `use-cases`/`repositories` boundary's relationship to Next.js's request lifecycle), not a rewrite of `domain/`, not a Ledger+Portfolio domain merger.
- **C. Significant architectural redesign** — not supported by evidence: nothing found in this session's own extension of the domain (Instrument Catalogue) strained the current layering; zero circular dependencies, zero boundary violations, one enforced boundary already holding.
- **D. Major boundary change before further feature work** — not supported: further *ledger/portfolio domain* feature work is not blocked by anything found here; only a *specific delivery-mechanism* addition (Desktop) would be.

**Conclusion: B — minor restructuring, and only if/when Desktop becomes a real target.** The trigger for that restructuring is "we are building a Desktop delivery mechanism," not "we are adding Portfolio to Ledger's domain" — those are two separate decisions this analysis deliberately does not conflate, because Folioman's own repository doesn't conflate them either (its Core/App boundary exists for framework-isolation and testability; its Desktop/Server split exists for delivery, achieved through a completely different mechanism — WSGI — that has no Next.js equivalent yet).

## Recommended next step

Per the brief, this is diagnosis only — no folder structure, no classes, no schema, no migration plan. The one recommendation in scope at this stage: **before any redesign exercise, decide explicitly whether Desktop is an actual near-term goal or a speculative one.** That single fact determines whether "B" ever needs to be acted on at all, and if so, whether option (a) (wrap the existing server) or (b) (extract a host-agnostic app layer) is the right shape to design next — a decision this analysis intentionally leaves open, per its own scope limits.

## Verdict

```
MINOR RESTRUCTURE
```

Scoped narrowly to the `use-cases`/`repositories` boundary's coupling to Next.js's request lifecycle, triggered only by an actual Desktop delivery requirement — not by Portfolio domain growth, which this session's own Instrument Catalogue delta already demonstrated the current architecture absorbs cleanly.
