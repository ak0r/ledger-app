# Onboarding

The current AppUser/Profile onboarding contract (2026-08-20 User
Simplification delta onward — ADR-029 in `docs/07-decisions.md`).
Supersedes the deleted Family/Member-era onboarding doc, which described a
different, no-longer-existing model (a Family container gating Member
creation).

## Identity model

```text
AppUser (login identity: email/password)
   │
   └── 1:1 ── Profile (financial identity: Accounts/Transactions/Currencies)
```

- Every AppUser links to exactly one Profile.
- A Profile can exist **unlinked** ("Unclaimed") — created by the Primary
  User for someone else, claimable later via a Registration link.
- The Primary User accessing several Profiles (below) is a separate
  concern from this 1:1 link — it doesn't mean an AppUser owns more than
  one Profile directly.

## Registration (`/register`)

1. **First-ever registration** on this Hosted Instance (no AppUser exists
   yet) — always creates a brand-new Profile, and this AppUser becomes the
   **Primary User**, permanently (`is_primary`, set once at registration,
   never toggled again).
2. **Subsequent registration**:
   - Plain `/register` — creates a brand-new Profile for this AppUser.
   - `/register?profileId=<id>` (a **Registration link**, generated from
     `/settings/profiles`) — links this AppUser to that existing unclaimed
     Profile instead. Falls back to creating a new Profile if the link is
     stale (already claimed by someone else).

## First-run setup (`/setup`)

A Profile with zero Accounts lands here right after registration/linking:

- **Start with Demo Data** — atomically seeds a realistic demo dataset
  (accounts, transactions, tags) into this Profile.
- **Start from Scratch** — goes straight to `/accounts` to create the
  first Account manually.

Only reachable while the Profile has no Accounts — once any Account
exists, it redirects to `/accounts`. No persisted onboarding-state
machine: "has this Profile been set up" is fully derived from "does it
have any Accounts," nothing extra to track.

## Primary User: multiple Profiles (`/settings/profiles`)

Only the Primary User can reach this roster of every Profile on the
instance. From there:

- **Switch active Profile** — a single global cookie (`activeProfileId`),
  not per-tab URL state (accepted trade-off, ADR-033).
- **Create a new, initially unclaimed Profile** — no AppUser attached yet.
- **Generate a Registration link** for any unclaimed Profile, to hand to
  whoever should own it.

A Normal (non-Primary) AppUser never sees `/settings/profiles` — it
redirects straight back to `/`.
