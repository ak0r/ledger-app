# Folioman Architecture — Source-Verified Analysis

Repo: `https://github.com/codereverser/folioman`, cloned read-only to `/tmp/folioman-analysis` for this analysis (not vendored into Ledger). All findings below are from actual source (imports, code quotes, tests), not inferred from directory names, per the task brief.

**Correction to initial premise:** the frontend is **Vue 3**, not React — confirmed in `frontend/package.json` ("Folioman Vue 3 SPA — shared bundle for desktop and hosted"), `app/src/folioman_app/urls.py` ("...and we return index.html and let Vue Router take over"), and `server/Dockerfile` ("# --- Stage 1: build the Vue SPA ---").

## 1. Repository map

```
folioman/
├── app/       folioman-app     — Django ORM models, Django Ninja API, services, tasks
├── core/      folioman-core    — framework-free domain: parsing, FIFO, XIRR, tax, price feeds
├── deploy/    (no package)     — Docker Compose overlays, reverse-proxy config; zero app code
├── desktop/   folioman-desktop — PyWebView shell + Nuitka build spec
├── docs/
├── frontend/  (Vue 3 SPA, Vite/TS/Pinia)
└── server/    folioman-server  — gunicorn/Postgres/JWT entrypoint (2 files, no logic)
```

Four independently-versioned Python packages (`core`/`app`/`server`/`desktop`) in one `uv` workspace — this is the whole story of §1.6 "is the separation intentional and enforced": **enforced**, via `[tool.uv.sources] X = { workspace = true }` + separate `pyproject.toml` dependency lists per package, not just folder convention.

## 2. Actual dependency graph

From each package's `pyproject.toml` `[project.dependencies]`, cross-checked against real imports (`grep -rn "^import\|^from" core/src/folioman_core | grep -iE "django|folioman_app|folioman_server|folioman_desktop|frontend"` → **zero matches**; same null result confirmed for `app/` importing `server/`/`desktop/`):

```
core     : pydantic, casparser, casparser-isin, httpx                 (zero framework/app deps)
app      : core + django, django-ninja, cryptography, whitenoise,
           apscheduler, platformdirs, structlog, rich, environs
           [server extra]: psycopg, django-ninja-jwt, gunicorn
server   : app[server]                                                 (extras-selector only)
desktop  : app (base, no server extras) + pywebview
           [build extra]: nuitka, ordered-set, zstandard, rich
```

```text
        frontend (Vue SPA)
              │  HTTP/JSON only, same-origin, typed via openapi-typescript
              ▼
    ┌─────────────────────┐
    │   server / desktop   │   two hosts, one WSGI app, entrypoint-only difference
    └──────────┬───────────┘
               ▼
              app          (Django ORM, Ninja API, services, tasks — Django-coupled but
               │            delivery-agnostic: same code under gunicorn or wsgiref)
               ▼
              core         (pydantic, zero Django, zero I/O side effects beyond price_feeds' httpx)
```

`desktop` and `server` never import each other. Persistence lives in `app/` (Django ORM). External API calls live in `core/price_feeds/` (httpx). Configuration lives in `app/settings/{base,desktop,server}.py`. Domain models live in `core/models/`. Use-cases/services live in `app/services/` + `app/tasks/`.

## 3. `core/` analysis

Module layout (`core/src/folioman_core/`):
```
cas_reader.py, ecas_parser.py, parser.py    — CAS/eCAS parsing (parser.py: 554 lines)
fifo.py (474 lines)                          — FIFO lot accounting
xirr.py                                      — Newton-Raphson + bisection fallback
reconciliation.py, valuation.py, dividend_attribution.py, corporate_actions*.py
identity_remap.py, opening_lot.py
models/    — base.py, holding.py, investor.py, nav.py, quote.py, security.py, transaction.py, cas.py
price_feeds/ — amfi_bulk, captnemo, casparser_fmv, coingecko, mfapi, nse_*, yfinance_feed
tax/       — india.py, ltcg_stcg.py, models.py, policy.py, schedule_112a.py
```
Plus `core/tests/` — 30 files, plain `pytest`, no Django (`core/tests/conftest.py` defines only a `fixtures_dir` fixture and a `Decimal` helper).

**Domain models are pydantic, with a documented base contract** (`models/base.py`):
```python
class DomainModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
```

`Security` (`models/security.py`) is a frozen, identity-hashed value object — its `__hash__`/`__eq__` deliberately exclude `name` so cosmetic name drift across CAS/eCAS/manual sources can't fork FIFO lot buckets that key dicts on `Security`.

`Transaction` (`models/transaction.py`) carries exactly one acknowledged framework leak: `ledger_id: int | None = None  # Django row pk when round-tripping through the apply engine; ignored by FIFO.` An opaque `int|None` passthrough — not a Django import — and FIFO itself never reads it.

**FIFO/XIRR/tax are pure, no I/O.** `fifo.py`'s `FIFOUnits`/`apply_fifo`/`build_sell_disposals` operate over `Decimal`/`date`, no ORM, no filesystem. Cost is tracked as a lot **total**, not per-unit, specifically to avoid repeating-decimal drift from indivisible split ratios. `xirr.py`'s `compute_xirr` is Newton-Raphson with a bisection fallback, stdlib-only. `tax/india.py`'s `IndiaTaxPolicy` implements FY labeling, Schedule 112A bucket codes, the grandfathering cutoff (`GRANDFATHER_ACQUIRE_CUTOFF = date(2018,1,31)`), and the 23-Jul-2024 transfer-regime change — registered into a small policy registry at import time (a jurisdiction-plugin pattern, for whenever a second country is added).

**External network calls live inside `core/`, deliberately.** `price_feeds/mfapi.py` makes plain `httpx` calls with retry/backoff (`_SLEEP = time.sleep` indirected specifically so tests can stub the wait) and returns parsed pydantic values — no Django settings, no ORM, no Celery. The pyproject's own comment sanctions this: `httpx>=0.27  # MF NAV feed (mfapi.in); also covers the equity/crypto price feeds`. Core owns *all* external price/corporate-action acquisition (`amfi_bulk`, `nse_bhavcopy`, `nse_bse_client`, `yfinance_feed`, `coingecko`, `corporate_actions_fetch`) — a stateless-HTTP-client is treated as acceptable core responsibility, not a framework dependency.

**Persistence: none.** No `open(..., "w")`, no ORM, no SQL anywhere under `core/`. Every function returns pydantic values for the caller to persist.

## 4. `app/` analysis

Module layout (`app/src/folioman_app/`): `api/` (Ninja routers+schemas), `mappers.py`, `middleware.py`, `models/`, `scheduler.py`, `security/` (Fernet, PAN masking), `services/`, `settings/{base,desktop,server}.py`, `tasks/`, `licensing/` (scaffolded, unwired — see weaknesses below).

**The ORM↔core boundary is one named, centralized file.** `mappers.py`'s own docstring: *"Map Django ORM rows to framework-free core (pydantic) value objects... Services convert ORM rows into those at the boundary so the domain logic stays Django-free. This is the single place that conversion lives."* `to_core_transaction(txn) -> CoreTransaction` is where `ledger_id=txn.pk` gets set — confirming that field exists solely to serve this one mapper. The reverse direction (core value → ORM row) is equally centralized in `tasks/_upsert.py` (`upsert_security`, `upsert_folio`, `upsert_amc`), used identically by every import task.

ORM models (`models/ledger.py`) mirror core's shapes but never import pydantic classes — **except** `TRANSACTION_TYPE_CHOICES` and three sibling choice-lists are built by iterating `TransactionType`/`FolioType`/`HoldingSource`/`TransactionSource` imported directly from `folioman_core.models`, so Django's `choices=` source-of-truth is core's enums (a narrow, enum-only coupling — see weaknesses).

**Django Ninja API schemas are hand-written, independent of both ORM and core.** `api/schemas.py` (800 lines, 60+ `Schema` classes) imports only `ninja.Schema` and `pydantic.Field` — no `folioman_core.models`, no `folioman_app.models` import anywhere in the file. Three independently-maintained shapes (ORM row, core pydantic model, API schema) connected by convention + the two mapper modules, not inheritance.

**A real service/orchestration layer exists, separate from views.** `services/imports.py::run_import_job` is the use-case entrypoint (traced in full in §10); the Ninja view function itself is ~10 lines of upload-handling + dispatch.

**Desktop-vs-server branching, quoted:**

Auth dispatch (`api/auth.py`):
```python
def __call__(self, request: HttpRequest):
    if getattr(settings, "FOLIOMAN_API_AUTH", "local") == "jwt":
        if self._jwt is None:
            from ninja_jwt.authentication import JWTAuth   # imported lazily — desktop never needs it importable
            self._jwt = JWTAuth()
        return self._jwt(request)
    user = get_local_user()
    request.user = user
    return user
```

Fail-closed server guard (`settings/server.py`), runs at settings-import time (i.e. at gunicorn boot):
```python
if FOLIOMAN_API_AUTH != "jwt":
    raise ImproperlyConfigured(
        "Server mode requires FOLIOMAN_API_AUTH='jwt'. Refusing to start: 'local' "
        "mode treats every request as a superuser (desktop-only) and would expose a "
        "silent auth bypass on a networked deployment."
    )
```
(plus a second guard rejecting the dev `SECRET_KEY` in server mode).

Persistence: `settings/desktop.py` points SQLite at a `platformdirs.user_data_dir()` path with WAL + busy-timeout (request thread and in-process scheduler thread share one file); `settings/server.py` requires `DATABASE_URL` (Postgres) and raises at import if unset.

Scheduler: desktop runs `BackgroundScheduler` in-process via `AppConfig.ready()`; server runs one dedicated `manage.py run_scheduler` process (`BlockingScheduler`) — same 5 registered jobs either way (day-wise valuation, ISIN-DB refresh, corporate-actions refresh, NAV-gap fill), the docstring noting APScheduler is "only the clock," the durable work-list is `Investor` rows themselves, so the tick bodies are scheduler-neutral.

Both auth modes share **one** `NinjaAPI` instance (`api/main.py`) — one API surface, two auth strategies picked at request time by a settings flag, not two API definitions.

## 5. `server/` analysis

`server/src/folioman_server/` is **exactly two files**, `__init__.py` + `__main__.py` (192 lines) — zero domain/API logic, confirming it is purely an entrypoint package. `main()` dispatches four subcommands: `migrate`, `run-scheduler`, `setup-banner`, or (default) `_serve()` — which wraps `django.core.wsgi.get_wsgi_application()` in a `gunicorn.app.base.BaseApplication` subclass. `gunicorn_options()` is deliberately pure (no gunicorn import, no I/O) so it's "unit-testable without the server extra installed" (its own docstring).

`server/Dockerfile` is a 3-stage build: (1) `node:24-slim` builds the Vue SPA via `pnpm gen:api && pnpm build` — `gen:api` regenerates the typed client from the repo-root `openapi.json` before every image build; (2) `python:3.13-slim` builder runs `uv sync --frozen --no-dev --no-editable --package folioman-server` (installs *only* the server package's closure: Django/psycopg/JWT/gunicorn — not pywebview); (3) runtime copies the venv + built SPA, sets `DJANGO_SETTINGS_MODULE=folioman_app.settings.server`, runs non-root, `HEALTHCHECK` hits `/api/health`.

`server/docker-entrypoint.sh`:
```sh
#!/bin/sh
set -e
export FOLIOMAN_SETUP_TOKEN="${FOLIOMAN_SETUP_TOKEN:-$(python -c 'import secrets; print(secrets.token_urlsafe(24))')}"
python -m folioman_server migrate
python -m folioman_server setup-banner
exec "$@"
```
Migrations run automatically, idempotently, on every container boot, before `exec "$@"` hands off to `CMD ["python", "-m", "folioman_server"]` (gunicorn). No `collectstatic` step — the Vue build's hashed assets are baked into the image and served straight from disk by WhiteNoise.

`docker-compose.yml` defines `app` (gunicorn, healthchecked), `scheduler` (same image, `entrypoint: ["python","-m","folioman_server","run-scheduler"]`, commented `DO NOT scale to >1 — the pending select is unguarded`), and `db` (Postgres 17).

## 6. `desktop/` analysis

Module layout: `__main__.py` (launcher sequence), `bootstrap.py` (first-run setup), `server.py` (`DesktopServer`), `webview_api.py` (native bridge), `scheduler/install.py` (OS scheduler templates for a refresh-navs task), `build.py` (Nuitka spec).

**The desktop shell serves the identical Django WSGI app.** `desktop/src/folioman_desktop/server.py`:
```python
def __init__(self) -> None:
    from django.core.wsgi import get_wsgi_application
    self._server = make_server(
        _HOST, 0, get_wsgi_application(),
        server_class=_ThreadingWSGIServer, handler_class=_QuietHandler,
    )
```
(`_HOST = "127.0.0.1"`, port `0` = OS-assigned). Its own docstring: *"The desktop shell serves the same WSGI application the hosted build runs under gunicorn — WhiteNoise serves the built SPA and the API from one local origin, so the PyWebView window just points at `http://127.0.0.1:<port>/`."*

`__main__.py::run_gui()` sequence: `bootstrap()` → `start_background_scheduler()` (imported directly from `folioman_app.scheduler` — the identical module `run-scheduler` uses standalone) → `DesktopServer()` → `webview.create_window(url=server.url, ..., js_api=WebviewApi())`.

`bootstrap.py::bootstrap()`: resolve settings module (`folioman_app.settings.desktop`) → point at the bundled SPA → resolve a `platformdirs` data dir → `django.setup()` → migrate only if behind (`MigrationExecutor.migration_plan()`) → ensure local user / Fernet key / ISIN reference DB.

**Nuitka compiles the whole backend, not just the launcher.** `desktop/build.py`:
```python
_ENTRY = _REPO_ROOT / "desktop" / "src" / "folioman_desktop"
_EXCLUDE_IMPORTS = ("psycopg", "psycopg2", "ninja_jwt", "gunicorn")
_FORCE_INCLUDE_PACKAGES = ("django", "folioman_app", "folioman_core", "whitenoise",
                            "casparser", "casparser_isin")
...
cmd += [f"--nofollow-import-to={name}" for name in _EXCLUDE_IMPORTS]
cmd += [f"--include-package={name}" for name in _FORCE_INCLUDE_PACKAGES]
cmd.append(f"--include-data-dir={_FRONTEND_DIST}=folioman_desktop/frontend_dist")
```
Whole-package force-include is needed because Django's ORM lazily imports submodules on first query (static analysis misses them) and `casparser_isin` ships a ~46MB bundled `isin.db` Nuitka won't auto-bundle as data. Server-only deps (psycopg/gunicorn/ninja_jwt) are explicitly excluded. The built Vue SPA (`frontend/dist`) is bundled as data and located at runtime by `bootstrap.py::_point_at_bundled_spa()` — the same `FOLIOMAN_FRONTEND_DIST`/WhiteNoise mechanism the Docker image uses, just pointed at a bundled path instead of `/app/frontend_dist`.

## 7. `frontend/` analysis

Vue 3.5, Vite, TypeScript, Pinia (state), PrimeVue (UI kit), ECharts, `openapi-fetch` + `openapi-typescript` (typed client, generated at build time), PWA/service-worker support.

**Same-origin by design:**
```ts
export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_BASE ?? '',
})
```
Empty string in production (SPA and API share one origin under both WhiteNoise-serving modes); `VITE_API_BASE` points at a local dev Django server otherwise.

**Generated client, confirmed real.** `"gen:api": "openapi-typescript ../openapi.json --output src/api/schema.d.ts"` — `server/Dockerfile` runs `pnpm gen:api && pnpm build` at every image build, so shipped types are always regenerated from the committed `openapi.json` (itself produced by a Django management command, `export_openapi`).

**No business-logic leakage — verified by exhaustive grep**, not assumption: `grep -rniE "xirr|fifo|capital.?gain|cost.?basis|ltcg|stcg" frontend/src` (excluding tests/`.d.ts`) returns only type re-exports of server schemas, display formatting of server-computed numbers (one `* 100` for percentage display), UI copy strings, and CSV-export formatting of already-fetched rows. Zero FIFO iteration, XIRR root-finding, or tax-bucket logic client-side.

**Auth:** access token held only in memory (gone on reload); refresh token in `localStorage`. `jwtExp()` decodes the JWT payload client-side with `atob()` — **no signature verification** — purely to decide when to proactively refresh (30s skew); the code's own comment acknowledges the 401 path is the real backstop. The auth store is explicitly inert in desktop/local mode: no tokens ever set, login screen never reached.

## 8. `deploy/` analysis

Zero application code:
```
deploy/dev-postgres.yml               — throwaway dev Postgres (explicitly commented as dev-only)
deploy/hosted/Caddyfile.example
deploy/hosted/compose.caddy.yml       — a compose OVERRIDE layering Caddy for TLS
deploy/hosted/README.md
deploy/desktop-release-notes/
```
`compose.caddy.yml` is meant to be combined via `docker compose -f server/docker-compose.yml -f deploy/hosted/compose.caddy.yml up` — its own comment notes the compose *project directory* deliberately stays `server/` so `.env` auto-loading and relative Caddyfile paths keep working. That's real evidence the deploy/server separation is honored down to compose working-directory semantics, not just folder naming.

## 9. End-to-end feature trace: CAS import

```
frontend/src/views/ImportView.vue (submit())
  → frontend/src/api/client.ts (importCas — multipart FormData POST /api/imports/cas)
    → app/src/folioman_app/api/imports.py::import_cas  (Ninja view)
        → _read_upload()        — reads limit+1 bytes regardless of Content-Length (anti-DoS)
        → _parse_cas()          → core/src/folioman_core/cas_reader.py::read_cas
                                    → parser.py::map_cas_data  (MF CAS)  or
                                      ecas_parser.py::map_ecas_data (eCAS)
        → resolve_or_create_investor()   (api/auth.py — Fernet-encrypts+hashes PAN)
        → services/imports.py::run_import_job()          [orchestration layer, NOT the view]
            → tasks/import_cas.py::process_cas()          [registered processor, plugin-registry pattern]
                → persist_mf_statement()
                    → tasks/_upsert.py::upsert_security / upsert_folio
                    → mappers.py::to_core_transaction  → core/fifo.py::net_units_from_transactions
                    → core/parser.py::scheme_history_gap   (chains onto existing ledger history?)
                    → Django ORM: Transaction.objects.get_or_create(dedup_key=sha256(...))
                    → tasks/reconcile.py::reconcile_after_import → core/reconciliation.py::reconcile
                    → tasks/valuation_jobs.py::queue_recompute
    ← Status(201, job)   [serialized via api/schemas.py::ImportJobOut — result: dict, UNTYPED]
  ← router.push({ name: 'dashboard' })
```

Notable design points surfaced by this trace:
- **Processors are a registry, not a switch statement.** `register_processor(ImportKind.CAS.value, process_cas)` runs at import time via `apps.py::ready()` importing `folioman_app.tasks` — a genuine plugin pattern, not hardcoded dispatch in the view.
- **Per-scheme savepoints inside one outer transaction.** One malformed scheme block quarantines itself without aborting the whole statement's import.
- **Order-independent ledger construction.** `PartialBlock` rows + `upgrade_chained_partials()` mean importing statement B before statement A converges to the same end state as A-then-B — described in-code as looping "to a fixpoint."
- **The one place typed contracts break down:** `ImportJobOut.result: dict` is untyped at the Ninja/OpenAPI layer. The actual keys are set ad hoc across three task modules, and the Vue component has to hand-declare a matching `CasResult` interface with a comment admitting it's inferred from reading the server processor's code, not from the generated schema. `openapi-typescript` codegen provides zero real type safety for the single most important response of this feature.

## 10. Architectural strengths (with evidence)

1. `core/` genuinely runs and is tested with zero Django/DB coupling — grep-verified zero framework imports, `core/tests/` needs no DB/Django test runner.
2. One codebase serves two delivery mechanisms via a single divergence point (settings module) — both ultimately call the same `get_wsgi_application()`; Nuitka force-includes the real Django+app+core stack into the desktop binary, not a stripped reimplementation.
3. Translation is centralized in exactly two named modules (`mappers.py`, `tasks/_upsert.py`), used consistently by every import path with no ad hoc bypass found.
4. A real service/orchestration layer (`services/imports.py` + a processor registry) keeps Ninja views to ~10 lines of upload handling.
5. Fail-closed startup guards catch dangerous misconfiguration at process-boot time (`settings/server.py` refuses to boot with `FOLIOMAN_API_AUTH != "jwt"` or the dev `SECRET_KEY`), not at request time.
6. Server-only dependencies are excluded from the desktop binary via `pyproject` optional-extras + one lazy `import ninja_jwt` inside the branch that needs it — not a packaging hack.
7. Idempotent, content-hashed re-import (`dedup_key` = SHA-256 of transaction identity) plus the `PartialBlock` fixpoint mechanism for out-of-order statement imports.
8. Zero client-side financial computation, exhaustively grep-verified.
9. Privacy is enforced in code, not just policy: `CasInvestorIdentity`'s docstring states the PAN must never be logged; the raw uploaded file is processed in memory and never persisted, only its SHA-256 kept.

## 11. Architectural weaknesses (with evidence)

1. **Narrow core→app coupling via enum reuse.** `models/ledger.py` builds Django `choices=` by iterating `TransactionType`/`FolioType`/etc. imported directly from `folioman_core.models` — not pydantic classes leaking into ORM fields, but a core enum rename becomes a Django migration event.
2. **One core field exists solely for a Django round-trip** (`Transaction.ledger_id`), honestly documented, ignored by FIFO — a small, acknowledged crack in "framework-free."
3. **`ImportJobOut.result: dict` is untyped at the API-contract level** — the real shape is documented only in prose/comments across three task modules; the frontend hand-declares a matching interface by reading server code, not the generated schema. A server-side key rename would type-check on both ends and only fail at runtime display.
4. **Two self-acknowledged ceilings, not bugs:** the scheduler container is commented `DO NOT scale to >1 — the pending select is unguarded`; `Transaction.get_or_create` dedup "collapses two genuinely identical transactions... to one — rare, and accepted for v1."
5. **A whole feature (`licensing/`) is scaffolded but unwired** — ed25519 keypair + `.license` verification exists with no API router enforcing it anywhere (`grep -rln "licensing" app/src/folioman_app/api/` → no matches). Dead-until-activated code sitting in the main package rather than behind a flag.
6. **Single point of failure for MF NAV data**: `price_feeds/mfapi.py`'s own docstring calls the feed "well-behaved but unofficial," with retry/backoff but no secondary source for that specific feed.
7. **Client-side JWT expiry check is unauthenticated by design** (`atob()`, no signature check) — reasonable as a UX optimization since the server 401 path is the real boundary, but worth flagging for a reviewer who might mistake it for a security check.

## 12. Folioman's architectural principles (synthesized)

- A domain package should be importable and testable with **zero** knowledge of what will eventually call it — enforced via real package boundaries (separate `pyproject.toml`s in a workspace), not just a folder convention.
- "Two delivery mechanisms, one codebase" is achieved by making the *application* framework (Django/WSGI) itself transport-agnostic, then swapping only the thing that serves the WSGI callable (gunicorn vs. a loopback `wsgiref` server) and the settings module (auth mode, DB engine, scheduler mode).
- Translation between layers (ORM ⇄ domain) lives in exactly one named place per direction — never inline, never duplicated per caller.
- The frontend is a strictly separate, same-origin HTTP client with generated types; it is not trusted to reimplement any business rule, and this is verified (not just intended) by an absence of that logic in its source.
- Optional, host-specific dependencies (Postgres/JWT/gunicorn for server; pywebview/Nuitka for desktop) are expressed as package-manager extras and excluded from the other build, not runtime-conditional imports scattered through shared code.
