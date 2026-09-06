# Target Architecture — Implementation Plan (Phase 1 of 3)

Scope: **only** the Core/App/Host reorganization from file 05. Per the agreed ordering (architecture first, delink second, Portfolio module third), this plan moves existing code into the new shape with **zero behavior change** — no ADR-038/039 deprecation, no new Portfolio content. Those are file 06's and the future portfolio-domain document's job, not this one's.

This file makes file 05's abstract sequencing literal and executable — exact source paths, exact destination paths, exact ESLint config, in shippable-PR-sized steps. No code has been changed by writing this file.

## Two naming corrections file 05 didn't need to make explicit yet

**1. The target's `app/` cannot be a literal top-level folder named `app/` in this repo.** Next.js reserves `app/` (or `src/app/`) as its own App Router directory — Ledger's routes already live at `src/app/`. A second, unrelated `app/` at the repo root would either collide outright (if placed under `src/`) or just be confusing (if placed beside `src/`, since nothing else in this codebase lives outside `src/`). **Resolution: `src/server/` already is this layer, conceptually, today** — it just needs its internals renamed to match the target vocabulary (`use-cases` → `services`, `import-adapters` → `importers`, `db`+`repositories` → `persistence`+`repositories`). No folder needs to move to a new top-level name; `src/server/` keeps its name and gets a clearer internal shape. `core/` has no such collision — `src/domain/` can genuinely become `src/core/{shared,ledger,portfolio}/`, matching the diagram literally.

**2. `dashboard.ts` belongs in `core/shared/`, not `app/`/`src/server/`.** File 05 tentatively placed it in "`app/` (or a thin server-side composition module)." That's wrong once it's concrete: `src/components/dashboard-grid.tsx` (a Client Component) imports `PANEL_NAME_BY_KEY`/`PANEL_DIMENSIONS_BY_KEY` etc. directly (ADR-037's own design — these are deliberately "client-safe metadata," kept out of the server-only rendering half specifically so Client Components can use them without pulling in the database driver). `src/server/` will hold real persistence/service code — not something a Client Component should ever import from, even for pure metadata. `core/shared/` is exactly the "framework-free, browser-safe" bucket this already needs, so `dashboard.ts`'s client-safe half moves there, unchanged in content.

## Phase 1a — `src/domain/` → `src/core/{shared,ledger,portfolio}/`

Pure move + import-path rewrite. No logic changes; every existing domain/use-case test is the regression gate (547+ tests, `pnpm test`).

| Current (`src/domain/`) | New location |
|---|---|
| `money.ts`, `currency.ts` | `src/core/shared/` |
| `dashboard.ts` | `src/core/shared/` (see correction #2 above) |
| `account.ts`, `accountIdentifier.ts`, `balance.ts` | `src/core/ledger/accounts/` |
| `transaction.ts`, `posting.ts` | `src/core/ledger/transactions/` |
| `recurring.ts` | `src/core/ledger/transactions/` (a Recurring Rule is a transaction template, AGENTS.md rule #27) |
| `budget.ts` | `src/core/ledger/budgets/` |
| `import.ts` | `src/core/ledger/statements/` |
| `instrument.ts`, `quantity.ts` | `src/core/portfolio/instruments/` |
| `index.ts` | split into `src/core/shared/index.ts`, `src/core/ledger/index.ts`, `src/core/portfolio/index.ts` — each re-exporting only its own subtree |

**Every current `from "@/domain"` import site updates to the new path** (`src/core/ledger`, `src/core/portfolio`, or `src/core/shared`, whichever the specific export now lives in). This is the largest mechanical part of the phase — 35 Client Component files, 19 use-cases, 30 actions, per the counts in file 02 — but it's a rename, not a rewrite; every call site keeps the exact same function signatures.

**ESLint boundary rule** (`eslint.config.mjs`) extends from `src/domain/**` to all three new paths, same restriction set:
```js
{
  files: ["src/core/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [
        { name: "react", message: "src/core must stay framework-free." },
        { name: "drizzle-orm", message: "...Persistence belongs in src/server." },
        { name: "better-sqlite3", message: "src/core must not depend on the DB driver." },
      ],
      patterns: [
        { group: ["next/*"], message: "src/core must stay framework-free." },
        { group: ["@/server/*", "@/app/*", "../server/*", "../../server/*", "../app/*", "../../app/*"],
          message: "src/core must not import from src/server or src/app." },
      ],
    }],
  },
},
```
Additionally: `src/core/portfolio/**` gets a rule forbidding import from `@/core/ledger/*` **except** the one declared dependency file 05 named (the transaction/posting engine) — or, if the delink decision (file 06, already confirmed) means Portfolio's future content genuinely never needs `core/ledger` at all, this restriction can be the simplest possible one: `core/portfolio` forbidden from importing `core/ledger` outright, full stop, enforced from day one of this phase even though `core/portfolio` has almost no content yet (`instrument.ts`/`quantity.ts` don't need it today either). Recommended: add this rule now, in this phase — it costs nothing while `core/portfolio` is small, and means the eventual Portfolio module build (phase 3) can never accidentally reach into `core/ledger`, catching the exact mistake the delink decision exists to prevent.

## Phase 1b — `src/server/{use-cases,repositories,db,import-adapters}` → renamed in place

No folder moves to a new top-level location (per correction #1) — internal renames within `src/server/`:

| Current | New |
|---|---|
| `src/server/use-cases/*` (19 files) | `src/server/services/*` |
| `src/server/repositories/*` (17 files) | unchanged name, unchanged location |
| `src/server/db/*` | `src/server/persistence/*` |
| `src/server/import-adapters/*` (8 files) | `src/server/importers/*` |
| `src/server/actions/*` (30 files) | unchanged — already exactly the "host glue" role phase 1c formalizes |

Every internal cross-import (`use-cases` importing `repositories`, `actions` importing `use-cases`) updates its path. Same regression gate as 1a.

**New ESLint rule for `src/server/{services,repositories,persistence,importers}/**`** (i.e., everything except `actions/`) forbidding Next.js/React coupling:
```js
{
  files: ["src/server/{services,repositories,persistence,importers}/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [
        { name: "react", message: "This layer must stay host-agnostic — no framework coupling." },
      ],
      patterns: [
        { group: ["next/*"], message: "This layer must stay host-agnostic — Server Actions/Components belong in src/server/actions or src/app." },
        { group: ["@/app/*", "@/components/*"], message: "This layer must not import the UI/route layer — dependency runs the other way." },
      ],
    }],
  },
},
```
This is the rule that makes the "no host-agnostic app boundary" gap (file 02/03) an enforced guarantee instead of an audited-by-hand convention, mirroring what `domain/`'s rule already does one layer up.

## Phase 1c — route every read through `services/`, relocate `"use server"` glue

The one step that changes actual call structure, not just paths — should be its own reviewed PR, not folded into 1a/1b's mechanical renames (file 05 already made this point; restated here because it's the step most likely to get silently merged into the rename commits if this plan isn't followed literally).

- Every Server Component currently importing `@/server/db/client` or a repository directly (file 02's examples: `net-worth-panel.tsx` and the other dashboard panels, several route `page.tsx` files) changes to import the equivalent `src/server/services/*` function instead. Where no service function exists yet for what the panel currently does inline via direct `db` access, add one — this is the "one canonical entrypoint per operation" fix, not a new capability.
- `src/server/actions/*.ts` stays exactly as thin as it already is (auth gate + Zod parse + one call into `services/`) — no change expected here beyond import-path updates from phase 1b, since actions already don't contain business logic today (verified throughout this analysis).

Regression gate: full test suite + a manual click-through of the dashboard (since Server Component data-fetching paths are the ones actually changing call shape, and they're not covered by the existing `vitest` suite the same way use-case logic is — this is exactly the "test the golden path in a browser" case).

**Implemented 2026-09-05 — finding: no code change was actually needed.** Checked every Server Component/route file importing from `@/server/persistence` or `@/server/repositories` (28 files) — every one imports only the `db` connection handle and calls it through a `@/server/services/*` function, exactly the "one canonical entrypoint" pattern this step exists to establish. Zero direct repository calls from any Server Component or Server Action (verified by grep, not assumed). The original file 02/03 framing of this as a live violation was imprecise: passing `db` as an explicit parameter into a service function is dependency injection, not a bypass — the same call a Desktop host would make against its own `Db` instance. This step is complete as verified, not as rewritten.

## Explicitly out of scope for this phase

- No `core/portfolio` content beyond the `instrument.ts`/`quantity.ts` move — no `PortfolioAccount`, `Folio`, `InvestmentTransaction`, `Holding`, `NAV`, `Valuation`, `CAS` tables or types. That's phase 3, gated on the portfolio domain document you're preparing.
- No deprecation of `postings.quantity`/`postings.price` or `accounts.instrumentId` — that's phase 2 (the delink), and touches schema/migrations, which this phase deliberately doesn't.
- No Desktop packaging, no PWA, no `app/tasks/` — all independently sequenced in file 05, none blocking or blocked by this phase.

## Suggested PR breakdown

1. Phase 1a (core split) — one PR, mechanical, ESLint rule included.
2. Phase 1b (server/ internal rename) — one PR, mechanical, ESLint rule included.
3. Phase 1c (route Server Components through services, relocate remaining direct-`db` call sites) — one PR, reviewed as a real behavior-preserving-but-structural change, manual dashboard click-through before merge.

Each PR should land with `pnpm typecheck && pnpm lint && pnpm test` green before the next starts — per the existing phase-gate convention, this plan does not assume permission to run 1a→1b→1c back to back without a checkpoint.

**Implemented 2026-09-05 — Phases 1a, 1b, and 1c are all shipped**, landed together rather than as three separate PRs (explicit go-ahead covered the whole sequence through the delink). `src/domain` → `src/core/{shared,ledger,portfolio}` (with the two corrections above — `dashboard.ts` to `shared`, `app/` staying as `src/server`'s internal renaming rather than a new top-level folder); `src/server/{use-cases,db,import-adapters}` → `{services,persistence,importers}`; Phase 1c needed no code change (see its own note above). Both new ESLint boundary rules are live. Full regression: `tsc --noEmit` clean, `eslint .` clean (0 errors, same 6 pre-existing `react-hook-form` warnings), 547/547 tests passing at the close of Phase 1. The delink (file 06) was implemented immediately after as Phase 2 — see ADR-040 in `docs/07-decisions.md` and file 06's own updated status.
