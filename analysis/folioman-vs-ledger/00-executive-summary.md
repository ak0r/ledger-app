# Executive Summary — Folioman as an Architecture Reference for Ledger

**Scope note:** this is analysis only. No Ledger code changed. No redesign proposed. Per the task brief, this is diagnosis before a separate design exercise.

## What Folioman actually is

Folioman is a personal net-worth/tax tracker for Indian mutual-fund and equity investors — Consolidated Account Statement (CAS) import, FIFO lot accounting, XIRR, capital-gains tax computation. It has **no double-entry ledger**: no debits/credits, no postings, no balance invariant. Its domain is investor → folio → transaction → holding, not accounts and transactions in Ledger's sense. This matters for the comparison (§03) — Folioman cannot validate "should Ledger and Portfolio share one Core," because Folioman never had two domains to begin with.

What Folioman *does* demonstrate well is something directly transferable: a calculation-heavy domain (FIFO, XIRR, tax brackets, statement parsing) kept **completely framework-free**, tested standalone, and reused byte-for-byte across two delivery mechanisms (a self-hosted Docker server and a compiled desktop binary) that differ only in a settings module and which process serves the same WSGI application.

Frontend is **Vue 3**, not React (corrected from this task's premise — confirmed independently in `frontend/package.json`, `app/src/folioman_app/urls.py`, and `server/Dockerfile`).

## The mechanism that makes Folioman's Desktop/Server split cheap

Four separately-versioned Python packages in one `uv` workspace:

```
folioman-core     → pydantic, casparser, httpx only. Zero Django. Zero app/server/desktop.
folioman-app      → folioman-core + Django + django-ninja (+ optional [server] extra: psycopg, JWT, gunicorn)
folioman-server   → folioman-app[server]  (an entrypoint package — no logic of its own)
folioman-desktop  → folioman-app (base, no server extras) + pywebview
```

Desktop and Server both boot the **identical** Django WSGI application (`get_wsgi_application()`) — Desktop serves it via a threaded `wsgiref` server on loopback, pointed at by a native PyWebView window; Server serves it via gunicorn behind a reverse proxy. One codebase, one settings-module switch (`FOLIOMAN_API_AUTH`, `DATABASES`, scheduler in-process-vs-standalone), two hosts. Nuitka then compiles the *whole* stack (Django + folioman_app + folioman_core, server-only deps excluded) into one native binary for the desktop build.

This works because Python/Django ships a genuine transport-agnostic abstraction — WSGI — that gunicorn and a loopback dev server both satisfy identically, and because the Vue SPA only ever talks to the backend over same-origin HTTP/JSON, making the frontend 100% delivery-mechanism-agnostic.

## The honest gap when mapped onto Ledger

Ledger already has Folioman's *first* property: `src/domain` is genuinely zero-dependency TypeScript, and — unlike Folioman's workspace-boundary enforcement — Ledger enforces it with a single ESLint `no-restricted-imports` rule (`eslint.config.mjs`), verified by grep to have zero violations across 14 domain files.

Ledger does **not** have Folioman's second property. Next.js has no WSGI-equivalent: Server Components read the database directly in-process during render (no transport hop at all for reads), and Server Actions are a Next.js-specific mechanism, not a portable "call this business logic from any host" API the way a WSGI app is. There is currently no single, host-agnostic entrypoint into Ledger's business logic that a Desktop shell could boot the way `desktop/server.py` boots Folioman's WSGI app.

## Verdict, ahead of the full reasoning in file 03

**B — Minor restructuring, narrowly scoped.** Not a Core/Ledger+Portfolio merge (unsupported by evidence — see §03), and not a rewrite. The concrete, bounded gap is: `src/server/use-cases` and `src/server/repositories` are not currently host-agnostic (some Server Components call them directly, bypassing even the existing `actions` layer) the way Folioman's `app/` is agnostic to gunicorn-vs-wsgiref. If Desktop ever becomes a real target, that's the one seam worth tightening — and it's an extension of a split Ledger already has (`use-cases` vs `actions`), not a new one to invent.

Full reasoning, evidence, and the point-by-point Folioman analysis: see `01-folioman-architecture.md`, `02-ledger-current-architecture.md`, `03-comparison-and-verdict.md`.
