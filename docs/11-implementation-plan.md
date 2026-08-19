# Ledger — MVP Implementation Plan

Status: Phase 0 (architecture analysis vs. Paisa) is complete — zero architecture changes indicated. Scope for everything below is `docs/05-mvp-scope.md`, constrained by `AGENTS.md`'s 20 engineering rules and the accepted ADR log (`docs/07-decisions.md`).

## Sequencing philosophy

Build bottom-up: data model → domain invariants → application/service layer → server API → UI, in that order, with each phase gated by tests before the next one starts. This directly follows two engineering rules that are easy to violate under time pressure: rule #17 ("Domain/application validation must not be replaced by UI validation") and rule #19 ("Prefer small, testable changes"). Concretely, that means the double-entry invariants get real unit tests in Phase 3, *before* a single React component exists — not bolted on afterward.

Phases 3–4 (domain core + application layer) are the critical path. They're the part of the codebase docs/01-vision.md calls "the spine," they're the hardest to change safely later, and they're where a mistake would be most expensive. Everything from Phase 6 onward is comparatively low-risk, UI-layer work that can be iterated on quickly once the spine is solid and tested.

## Phase 1 — Project scaffolding

- Next.js (App Router) + TypeScript (strict mode) project init; ESLint/Prettier; Tailwind + shadcn/ui installed.
- Folder structure that makes the domain boundary from `docs/06-architecture.md` physically enforceable:
  - `src/domain/` — pure TypeScript, zero imports from React, Drizzle, or Next. This is where double-entry invariants live.
  - `src/server/` — Drizzle schema, repositories, use-cases (application layer), server actions.
  - `src/app/` — routes and UI only; never imports Drizzle directly, only `src/server` use-cases.
  - Enforced via an ESLint `no-restricted-imports` rule scoped to `src/domain/**` (see `eslint.config.mjs`) — this makes the domain boundary a build-time guarantee, not a convention people can forget.
- Drizzle + SQLite wired up with `drizzle-kit` migrations; Zod installed; `package.json` scripts for `lint`, `typecheck`, `test`, `build`, `db:generate`.
- **Exit criteria:** `pnpm dev` boots an empty shell; `pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm build` all run clean.
- **STATUS (as of this hand-off): ~95% done.** Scaffolding, all dependencies, shadcn/ui components, folder structure, domain-boundary lint rule, Drizzle config + placeholder schema + connection singleton, Vitest wiring are all in place. `pnpm typecheck`, `pnpm test`, and `pnpm db:generate` have been verified clean. `pnpm lint` and `pnpm build` have NOT yet been confirmed clean end-to-end — see `HANDOFF.md` for the exact next step.

## Phase 2 — Schema & migrations

- Translate `docs/09-data-model.dbml` into Drizzle schema exactly: `members`, `currencies`, `accounts`, `transactions`, `postings`, snake_case columns (ADR-017), FKs as specified in the DBML. (Phase 1 only created a placeholder single-table schema to prove the pipeline — this phase replaces it with the real model.)
- Decide and document the Currency-seeding flow: does creating a Member auto-create its INR `Currency` row, or is it an explicit separate step?
- A migration + one smoke test that boots the DB file, runs a trivial insert/select across all five tables, and confirms FK constraints are enforced.
- **Exit criteria:** schema matches the DBML field-for-field; migrations run cleanly from empty; the FK smoke test passes.

## Phase 3 — Domain core (pure, framework-free) — critical path

- Implement, as plain TypeScript functions/types with no DB or UI dependency, in `src/domain/`:
  - Money as integer minor units (ADR-022).
  - The posting invariant: `debit >= 0`, `credit >= 0`, exactly one strictly positive.
  - The transaction invariant: `postings.length >= 2`, `sum(debit) == sum(credit)`.
  - The ownership invariant: every posting's account `member_id` equals the transaction's `member_id`.
  - The currency invariant: every account's currency is INR (MVP-only check, isolated so it's a single deletion point when multi-currency is eventually designed).
- Unit tests — treat the list from `docs/06-architecture.md` "Testing" as a literal checklist: balanced transaction accepted; unbalanced rejected; expense; income; transfer; credit-card purchase; credit-card payment; multi-posting transaction; opening balance; edit preserves balance; delete does not corrupt balance.
- **Exit criteria:** every test in that list passes; `src/domain` has zero imports outside the TypeScript standard library (enforced by the Phase-1 lint rule).

## Phase 4 — Application layer (repositories & use-cases)

- Repository functions wrapping Drizzle. Every Member-scoped query takes an explicit `memberId` parameter (rule #6).
- Use-cases, each calling into Phase 3's domain functions before touching the DB: `createMember`, `createAccount`, `archiveAccount`, `createTransaction` (atomic, validates via domain layer first), `editTransaction` (decide semantics — see open decisions below), `deleteTransaction` (hard delete, atomic cascade).
- Integration tests against a real (temp-file or in-memory) SQLite instance, specifically covering atomicity.
- **Exit criteria:** every core mutation has an integration test; an ownership-violating write is rejected here even though the UI would never construct one.

## Phase 5 — Server API surface

- Next.js Server Actions for form-bound mutations; Route Handlers only where a plain data-fetch endpoint is cleaner.
- Zod schemas at this boundary mirror domain invariants for fast client feedback, but are NOT the source of truth — Phase 3/4 remain the real enforcement point.
- Resolve the "active Member" context question (see open decisions) before building UI on top of it.
- **Exit criteria:** a Member, its Accounts, and a Transaction can be created end-to-end through the API layer alone.

## Phase 6 — Core UI shell

- Active-Member switcher and context provider; empty-state onboarding.
- Accounts UI: list, create, edit, archive.
- Dashboard shell (layout only), navigation, mobile-first responsive layout.
- **Exit criteria:** a user can create a Member and a full chart of accounts entirely through the UI.

## Phase 7 — Transaction entry: Simple mode + list

- Simple-mode form (Date / Description / From / Amount / To) per `docs/08-ui-principles.md`, no debit/credit language anywhere in the UI.
- Transaction list via TanStack Table.
- **Exit criteria:** a user can log an expense, income, and transfer through Simple mode.

## Phase 8 — Split mode + tags

- Split-mode entry with live balance validation.
- Tag chips on Accounts and Transactions.
- **Exit criteria:** N-posting transactions creatable/editable through Split mode; tags round-trip correctly.

## Phase 9 — Filters/search + basic reports

- Filters exactly as scoped in `docs/08-ui-principles.md`: Member, date, Account, classification, tag key/value. No query language, no regex — that's explicitly out of current MVP scope (see 09-ledger-gaps in the Paisa research, if it's been folded into `docs/`).
- Basic reports computed read-side from ledger data only.
- **Exit criteria:** dashboard shows real numbers; filters work across all listed fields.

## Phase 10 — Edit/delete hardening + opening balances

- Real edit flow (pre-filled form, atomic replace, full re-validation).
- Delete flow with confirmation; decide whether any lightweight backup/undo mitigation accompanies hard delete in MVP.
- Opening balance UX (already decided — V8-CHANGELOG item 9–10 — this phase is implementation only).
- **Exit criteria:** edit/delete/opening-balance each covered by a domain-level test and a UI-level smoke test.

## Phase 11 — Polish, packaging, MVP acceptance

- Error/empty/loading states; mobile QA; accessibility pass.
- Local deployment packaging only (Docker/Tailscale/Traefik are explicitly post-MVP).
- Walk every bullet in `docs/05-mvp-scope.md` "Included" and confirm implemented+tested; confirm nothing from "Explicitly excluded" crept in.
- **Exit criteria:** MVP scope doc satisfied line-for-line.

## Decisions surfaced during planning that aren't written down anywhere else

1. Currency-seeding flow on Member creation (Phase 2).
2. "Edit transaction" semantics — full replace vs. partial update (Phase 4). Current lean: full replace (validate the complete new posting set, atomically swap old postings for new under the same transaction id) — simplest correct semantics given no persisted draft state (ADR-023) and hard delete (ADR-019), but not yet formally decided.
3. Where "active Member" context lives between requests, given no auth (Phase 5).
4. Whether any lightweight operational backup/undo mitigation accompanies hard delete in MVP, or is explicitly deferred (Phase 10).

Everything else from the Paisa architecture research's open-questions list (bulk editing, rich search, posting-level tags, import candidate persistence, investment quantity type) is correctly out of scope for this MVP plan.
