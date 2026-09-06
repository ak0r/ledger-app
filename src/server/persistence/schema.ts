// Full MVP schema translated from docs/09-data-model.dbml (field-for-field),
// extended by the 2026-08-20 User Simplification delta with AppUser/Session/
// Profile identity tables. One Hosted Instance = one database (this file,
// one physical SQLite file at data/ledger.db) — no more per-Family
// isolation. Money values are integer minor units (ADR-022). Timestamps/
// dates are ISO 8601 strings. Classification/instrument-type enums are
// validated by the domain layer (rule #17) — this file only pins their TS
// shape via `.$type<...>()`; SQLite stores them as plain text.
import { sqliteTable, text, integer, real, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  CLASSIFICATIONS,
  CREATABLE_CLASSIFICATIONS,
  INSTRUMENT_TYPES,
  INSTRUMENT_BACKED_TYPES,
  RECURRING_FREQUENCIES,
  BUDGET_TYPES,
  BUDGET_RECURRENCE_UNITS,
  BUDGET_FILTER_FIELDS,
  BUDGET_FILTER_MATCHES,
  PANEL_KEYS,
  BALANCES_ACCOUNT_SCOPES,
  RECENT_EXPENSES_PERIODS,
  INVESTMENT_TRANSACTION_TYPES,
  INVESTMENT_TRANSACTION_SOURCES,
  PORTFOLIO_IMPORT_KINDS,
  PORTFOLIO_IMPORT_STATUSES,
} from "@/core";
import type {
  Classification,
  InstrumentType,
  InstrumentBackedType,
  ImportStatus,
  RecurringFrequency,
  BudgetType,
  BudgetRecurrenceUnit,
  BudgetFilterMatch,
  BudgetFilterCondition,
  BudgetScopeSnapshot,
  PanelKey,
  PanelConfigByKey,
  InvestmentTransactionType,
  InvestmentTransactionSource,
  PortfolioImportKind,
  PortfolioImportStatus,
} from "@/core";

export {
  CLASSIFICATIONS,
  CREATABLE_CLASSIFICATIONS,
  INSTRUMENT_TYPES,
  INSTRUMENT_BACKED_TYPES,
  RECURRING_FREQUENCIES,
  BUDGET_TYPES,
  BUDGET_RECURRENCE_UNITS,
  BUDGET_FILTER_FIELDS,
  BUDGET_FILTER_MATCHES,
  PANEL_KEYS,
  BALANCES_ACCOUNT_SCOPES,
  RECENT_EXPENSES_PERIODS,
  INVESTMENT_TRANSACTION_TYPES,
  INVESTMENT_TRANSACTION_SOURCES,
  PORTFOLIO_IMPORT_KINDS,
  PORTFOLIO_IMPORT_STATUSES,
};
export type {
  Classification,
  InstrumentType,
  InstrumentBackedType,
  ImportStatus,
  RecurringFrequency,
  BudgetType,
  BudgetRecurrenceUnit,
  BudgetFilterMatch,
  BudgetFilterCondition,
  BudgetScopeSnapshot,
  PanelKey,
  InvestmentTransactionType,
  InvestmentTransactionSource,
  PortfolioImportKind,
  PortfolioImportStatus,
};

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const appUsers = sqliteTable("app_users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // Primary User = the very first AppUser ever registered in this Hosted
  // Instance (2026-08-20 User Simplification delta). Distinct from the old
  // (now-retired) members.isPrimary concept, which meant "default landing
  // Member within one Family's own DB file" — a different, per-container
  // idea. Set exactly once, at registration, never toggled again.
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const sessions = sqliteTable("sessions", {
  id: id(),
  appUserId: text("app_user_id")
    .notNull()
    .references(() => appUsers.id),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

// Renamed from `members` (2026-08-20 delta) — the financial-identity
// boundary, now living directly under the single Hosted Instance rather
// than inside a per-Family container.
export const profiles = sqliteTable("profiles", {
  id: id(),
  name: text("name").notNull(),
  // Nullable: a Profile can exist unregistered (Primary User creates one
  // for someone else, who may register later). UNIQUE enforces "an AppUser
  // owns at most one Profile" from this side; "an AppUser must have
  // exactly one Profile" is the complementary application-layer invariant
  // — always created/linked together transactionally at registration
  // (registerAppUser, use-cases/auth.ts), never left dangling.
  appUserId: text("app_user_id")
    .references(() => appUsers.id)
    .unique(),
  // Default currency for newly created Accounts (Currency Catalogue delta,
  // 2026-09-03). Changing it is not retroactive: existing Accounts keep
  // whatever currency they already have. Nullable — a Profile can exist
  // before any Currency has been created for it (currency creation stays a
  // separate step, HANDOFF.md open decisions #1).
  primaryCurrencyId: text("primary_currency_id").references((): AnySQLiteColumn => currencies.id),
  // Portfolio Adoption Plan (2026-09-05) §1 "PAN hash/encryption pattern" —
  // adopted directly onto Profile, not a separate Investor entity (§5 "do
  // not adopt Investor" — Ledger-App's own Profile already is the
  // ownership/identity boundary). `panEncrypted` is AES-256-GCM ciphertext
  // (base64), decrypted only when a CAS import needs the real PAN as the
  // PDF password; `panHash` is a SHA-256 digest for equality/lookup without
  // decrypting (e.g. matching a re-imported statement to the same
  // Profile). Both nullable — most Profiles never touch Portfolio at all.
  panEncrypted: text("pan_encrypted"),
  panHash: text("pan_hash"),
  ...timestamps,
});

export const currencies = sqliteTable("currencies", {
  id: id(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  minorUnitScale: integer("minor_unit_scale").notNull(),
  ...timestamps,
});

// Instrument Model delta (2026-08-21) §2/§18 — NOT Profile-scoped, unlike
// every other table in this file. An Instrument ("HDFC Bank the stock")
// is shared external reference data, not per-Profile data: every Profile
// searches and can reference the same catalogue. Profile-scoping re-enters
// normally at `accounts.instrumentId` below, since `accounts` itself stays
// Profile-scoped as always.
// Instrument Catalogue delta (2026-09-04) — provenance for a catalogue-
// ingested row; null for every user-created Instrument (createInstrument
// never sets these). `(source, sourceId)` is this catalogue's external
// identity when both are present (src/server/repositories/instruments.ts's
// upsertCatalogueInstruments matches on it) — enforced at that call site,
// not a DB unique index, matching this file's existing FK/constraint
// posture (see accounts.instrumentId's own comment below). nseCode/
// bseCode/isin stay independently nullable: the source doesn't guarantee
// any of them, and a user-created Instrument has none.
export type CatalogueSource = "INDIANAPI";

export const instruments = sqliteTable("instruments", {
  id: id(),
  type: text("type").notNull().$type<InstrumentBackedType>(),
  name: text("name").notNull(),
  // Free-text pricing-unit hint for commodities, e.g. "10g", "1 barrel"
  // (delta §4 — providers quote commodities in inconsistent units). Null
  // for STOCK/MUTUAL_FUND, where a "unit" is unambiguous.
  unitLabel: text("unit_label"),
  source: text("source").$type<CatalogueSource>(),
  sourceId: text("source_id"),
  nseCode: text("nse_code"),
  bseCode: text("bse_code"),
  isin: text("isin"),
  // AMFI scheme code — a Mutual Fund's fallback identity when a CAS
  // statement's scheme has no ISIN (a stale/matured scheme still often
  // carries an AMFI code). Also the AMFI bulk NAV feed's own primary key
  // (services/priceFeeds/amfiNav.ts), so a scheme resolved by AMFI code
  // alone can still be priced.
  amfiCode: text("amfi_code"),
  ...timestamps,
});

export const accounts = sqliteTable("accounts", {
  id: id(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  currencyId: text("currency_id")
    .notNull()
    .references(() => currencies.id),
  name: text("name").notNull(),
  classification: text("classification").notNull().$type<Classification>(),
  instrumentType: text("instrument_type").notNull().$type<InstrumentType>(),
  // Revised Investment Model delta (2026-09-03) — deliberately NOT a DB-
  // level FK. SQLite can only add a foreign key to an existing table via a
  // full table-recreate requiring `PRAGMA foreign_keys=OFF`, which is a
  // documented no-op inside a transaction — and drizzle-orm's migrate()
  // wraps an entire migration file in one transaction, so that recreate
  // fails on every fresh database, not just this one (reproduced firsthand
  // applying this exact migration). "Points at a real Instrument row" is
  // enforced at the use-case layer instead — the same posture this
  // codebase already uses for most relationships, DB FKs being the
  // exception rather than the rule.
  instrumentId: text("instrument_id"),
  instrumentLabel: text("instrument_label"),
  // Simple opaque tags — a plain string list, not key/value, not a
  // normalized Tag entity (rule #13/#14). Storage is unchanged (still a
  // JSON text column); only the shape changed from the earlier
  // Record<string,string> — no schema migration needed, see the one-time
  // data-fixup script for existing rows.
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  icon: text("icon"),
  isArchived: integer("is_archived", { mode: "boolean" })
    .notNull()
    .default(false),
  metadata: text("metadata"),
  ...timestamps,
});

// Account Resolution delta (2026-08-26) §11 — a child entity, not a JSON/
// list property on `accounts` (explicitly ruled out by §11): "an account
// can have multiple known representations" (a full account number plus
// masked variants observed across statements), each independently
// queryable/indexed for resolution. No `profileId` column — scope derives
// via the `accountId` join, same as `postings` deriving scope via
// `transactionId`/`accountId`.
export const accountIdentifiers = sqliteTable("account_identifiers", {
  id: id(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  identifier: text("identifier").notNull(),
  ...timestamps,
});

// Import Workflow delta (2026-08-25, 0aa87019) §2/§3 — one row per uploaded
// source file. "Import" (the ephemeral, possibly multi-file review
// workspace) is never itself persisted; "ImportFile" is the persisted
// provenance record — renamed from the original Phase 1 delta's `imports`
// table to match that vocabulary once it existed. Phase 1 only ever
// persists the terminal `successful` state (see use-cases/imports.ts):
// Parse/Normalise/Account Resolution/the editable workspace all run
// in-memory for the request, so there is no persisted "uploaded"/"parsing"/
// "ready" row — a future staging phase can add those without a breaking
// migration, since `status` stays plain text. `accountId`/`newAccountCount`/
// `inflowMinor`/`outflowMinor` added by the Account Resolution delta
// (2026-08-26) §2/§20 for the redesigned import-history table — computed
// once at commit time from data already in hand, not recomputed per view.
export const importFiles = sqliteTable("import_files", {
  id: id(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  filename: text("filename").notNull(),
  // Adapter id, e.g. "hdfc.account.xls" (delta §5) — which parser produced
  // this.
  source: text("source").notNull(),
  status: text("status").notNull().$type<ImportStatus>(),
  // The resolved source Account this file's transactions were posted
  // against — nullable only because it predates this column (Delta 1/2
  // rows); every row committed from here on always sets it.
  accountId: text("account_id").references(() => accounts.id),
  newAccountCount: integer("new_account_count").notNull().default(0),
  inflowMinor: integer("inflow_minor").notNull().default(0),
  outflowMinor: integer("outflow_minor").notNull().default(0),
  dateRangeStart: text("date_range_start"),
  dateRangeEnd: text("date_range_end"),
  transactionCount: integer("transaction_count").notNull(),
  metadata: text("metadata"),
  ...timestamps,
});

export const transactions = sqliteTable("transactions", {
  id: id(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  date: text("date").notNull(),
  description: text("description").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  // Permanent source provenance (Import delta §4/§13) — null for
  // transactions created outside the import workflow. Never cleared after
  // commit, even though the ImportFile itself only ever reaches
  // `committed`.
  importFileId: text("import_file_id").references(() => importFiles.id),
  ...timestamps,
});

// Recurring Transactions Phase 1 (docs/completed/2026-08-27-Recurring-Transactions.md)
// — a definition, not a Transaction (§2): no `postings` row exists until a
// future automation phase explicitly creates one. Structured schedule
// columns rather than a stored RRULE string (domain/recurring.ts's own
// header comment has the full rationale) — `byMonthDay`/`byWeekday` cover
// MONTHLY/YEARLY and WEEKLY respectively, `endDate` null means "Never".
export const recurringRules = sqliteTable("recurring_rules", {
  id: id(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  name: text("name").notNull(),
  fromAccountId: text("from_account_id")
    .notNull()
    .references(() => accounts.id),
  toAccountId: text("to_account_id")
    .notNull()
    .references(() => accounts.id),
  amountMinor: integer("amount_minor").notNull(),
  description: text("description").notNull(),
  frequency: text("frequency").notNull().$type<RecurringFrequency>(),
  interval: integer("interval").notNull().default(1),
  byMonthDay: integer("by_month_day"),
  byWeekday: integer("by_weekday"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  ...timestamps,
});

// Budget Framework delta (docs/completed/2026-09-01-Budget-Framework.md) — a
// Budget is a definition (Name + recurrence), never a Transaction (spec
// §1/§9): actual spending is always derived at read time from `postings`,
// never persisted here. `explicitAccountIds`/`filterMatch`/
// `filterConditions` are the *live* scope (spec §6) — editable, and used
// both to seed the next BudgetPeriod's defaults (§5) and, for an active
// period, to update that period's own `scopeSnapshot` in place when edited
// (§10's warning gate is an application-layer concern, not a schema one).
// Recurrence columns are null for ONE_TIME budgets, same nullable-when-
// inapplicable posture as `recurringRules`.
export const budgets = sqliteTable("budgets", {
  id: id(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  name: text("name").notNull(),
  type: text("type").notNull().$type<BudgetType>(),
  recurrenceUnit: text("recurrence_unit").$type<BudgetRecurrenceUnit>(),
  recurrenceInterval: integer("recurrence_interval"),
  recurrenceStartDate: text("recurrence_start_date"),
  recurrenceEndDate: text("recurrence_end_date"),
  recurrenceOccurrences: integer("recurrence_occurrences"),
  explicitAccountIds: text("explicit_account_ids", { mode: "json" }).$type<string[]>(),
  filterMatch: text("filter_match").$type<BudgetFilterMatch>(),
  filterConditions: text("filter_conditions", { mode: "json" }).$type<BudgetFilterCondition[]>(),
  ...timestamps,
});

// One approved occurrence/window of a Budget (spec §3/§11) — created only
// on explicit user approval (spec §5/§16), never silently. No `profileId`
// column: scope derives via the `budgetId` join, same convention as
// `postings`/`accountIdentifiers` deriving scope via their parent join.
// `startDate`/`endDate` are both null for a ONE_TIME budget's single period
// (spec §4.1 — no transaction date range required). `scopeSnapshot` is the
// frozen copy of the Budget's scope at approval time — authoritative for
// evaluating that period even after the parent Budget's live scope changes
// later (spec §11.1); implementation keeps it as one JSON column rather
// than normalizing into child tables, since nothing here needs it
// independently queryable (contrast `accountIdentifiers`, which does).
export const budgetPeriods = sqliteTable("budget_periods", {
  id: id(),
  budgetId: text("budget_id")
    .notNull()
    .references(() => budgets.id),
  startDate: text("start_date"),
  endDate: text("end_date"),
  scopeSnapshot: text("scope_snapshot", { mode: "json" }).notNull().$type<BudgetScopeSnapshot>(),
  ...timestamps,
});

// A target amount against one Expense Account within one BudgetPeriod
// (spec §8) — not a child Budget (spec §19 "Budget rows are allocations,
// not child Budgets"). No `profileId` column, scope derives via
// `budgetPeriodId` -> `budgetId` -> `profileId`, same convention as above.
// The parent Budget/Period total is always SUM(targetAmountMinor), never
// independently stored (spec §8.1).
export const budgetAllocations = sqliteTable("budget_allocations", {
  id: id(),
  budgetPeriodId: text("budget_period_id")
    .notNull()
    .references(() => budgetPeriods.id),
  expenseAccountId: text("expense_account_id")
    .notNull()
    .references(() => accounts.id),
  targetAmountMinor: integer("target_amount_minor").notNull(),
  ...timestamps,
});

export const postings = sqliteTable("postings", {
  id: id(),
  transactionId: text("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  debit: integer("debit").notNull().default(0),
  credit: integer("credit").notNull().default(0),
  // Revised Investment Model delta (2026-09-03) — posting-level, not
  // instrument-only ("quantity/price should remain generic posting-level
  // fields, not instrument-only"). `debit`/`credit` above stay exactly as
  // they were — still the sole, unchanged source of truth for account
  // balances/exports/everything already built. quantity/price are
  // additive facts, always validated consistent with debit/credit, never
  // a competing source of truth.
  //
  // quantity: integer-scaled at a fixed 6 decimal places (domain/
  // quantity.ts), same reasoning as Money's own integer-minor-units rule
  // (ADR-022) — it gets summed across transactions for holdings
  // derivation, where float drift would compound. For a cash/FX posting,
  // numerically identical to that leg's own decimal amount; for an
  // Instrument posting, the independent fact (units acquired/disposed).
  quantity: integer("quantity").notNull().default(0),
  // price: value of 1 unit of `quantity`, expressed in the transaction's
  // reconciliation currency (the credit-side posting's own currency) —
  // always exactly 1 for a posting already in that currency (every leg of
  // a normal/split/Investment transaction), the real exchange rate only
  // for the debit leg of a cross-currency Conversion. Multiplied once
  // then immediately rounded to the reconciliation currency's own scale,
  // never summed/accumulated the way Money or quantity are — REAL/float
  // carries no meaningful precision risk here.
  price: real("price").notNull().default(1),
  ...timestamps,
});

// Dashboard and Panels delta (docs/completed/2026-09-02-Dashboard-and-Panels.md)
// §27 — a UI composition layer, not a financial data store. Phase 1 is one
// default Dashboard per Profile (`isDefault` always true today), but the
// model allows more later (spec §4) — no uniqueness constraint on
// `isDefault` at the schema level, enforced at the application layer
// instead (same posture as every other cross-row invariant in this file).
export const dashboards = sqliteTable("dashboards", {
  id: id(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  name: text("name").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

// A persisted Panel instance — identity/type (`key`, resolved against the
// application-level Panel Registry, src/lib/panel-registry.tsx),
// configuration, and actual (x, y) placement only (spec §6). No
// `profileId` column, scope derives via the `dashboardId` join, same
// convention as `budget_periods`/`account_identifiers`. Width/height are
// never stored here — always supplied by the registry
// (domain/dashboard.ts's `PANEL_DIMENSIONS_BY_KEY`, spec §14/§26).
export const dashboardPanels = sqliteTable("dashboard_panels", {
  id: id(),
  dashboardId: text("dashboard_id")
    .notNull()
    .references(() => dashboards.id),
  key: text("key").notNull().$type<PanelKey>(),
  configuration: text("configuration", { mode: "json" }).notNull().$type<PanelConfigByKey[PanelKey]>(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  ...timestamps,
});

export type BackupStatus = "completed" | "failed";

// Local Backup history (2026-09-03 Settings/Backup/Data Management delta
// §7-10) — deliberately NOT Profile-scoped (rule #6's documented exemption,
// same posture as `instruments`): a Backup snapshots the whole Ledger
// Instance's single database file, never one Profile's data specifically.
export const backups = sqliteTable("backups", {
  id: id(),
  filePath: text("file_path").notNull(),
  sizeBytes: integer("size_bytes"),
  status: text("status").notNull().$type<BackupStatus>(),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
});

// Singleton row (fixed id "singleton") — the one instance-level Automatic
// Backup preference. Not Profile-scoped for the same reason as `backups`.
export const backupSettings = sqliteTable("backup_settings", {
  id: text("id").primaryKey(),
  automaticBackupEnabled: integer("automatic_backup_enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
});

// ============================================================
// Portfolio (2026-09-05, Portfolio Adoption Plan) — a fully separate
// domain from everything above. No table here ever FKs into `accounts`,
// `transactions`, or `postings`, and none of Ledger's tables reference
// these either (Ledger/Portfolio delink, ADR-040) — the only shared
// reference points are `profiles` (ownership) and `currencies`
// (Profile-scoped, same as an Account's own currency). A mutual-fund
// purchase is a Portfolio event end to end; a user wanting the matching
// cash movement records a separate, ordinary Ledger Transaction by hand
// (plan §9 — no automatic dual-entry linkage in V1).
// ============================================================

// A broker/RTA-level portfolio account (plan §2) — e.g. "Zerodha", "CAMS
// MF folios". `type` reuses the same INSTRUMENT_BACKED_TYPES vocabulary
// Instrument itself uses (MUTUAL_FUND/STOCK/COMMODITY), not a new,
// separately-maintained enum — this Account holds instruments of that one
// kind. `provider` is free text (plan's own shape has no fixed provider
// list yet).
export const portfolioAccounts = sqliteTable("portfolio_accounts", {
  id: id(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  name: text("name").notNull(),
  type: text("type").notNull().$type<InstrumentBackedType>(),
  provider: text("provider"),
  ...timestamps,
});

// A specific folio/demat number within a PortfolioAccount (plan §1/§2) —
// Folioman's own concept, minus everything HUF/investor-specific (plan
// §5). `amcCode` is MF-only, nullable for a demat/equity Folio.
export const folios = sqliteTable("folios", {
  id: id(),
  portfolioAccountId: text("portfolio_account_id")
    .notNull()
    .references(() => portfolioAccounts.id),
  number: text("number").notNull(),
  amcCode: text("amc_code"),
  ...timestamps,
});

// A single Portfolio event — buy/sell/dividend/etc. (plan §2's "basic
// shape"). Deliberately smaller than Folioman's own Transaction: no
// fx_rate_to_inr/fees/stamp_duty/brokerage/cost_total/
// cost_basis_complete yet ("these require separate Ledger-App decisions",
// plan's own words) — add them if/when a real requirement appears, not
// speculatively now. `instrumentId` and `folioId` are deliberately NOT DB
// foreign keys with ON DELETE behaviour beyond a plain reference — same
// posture as `accounts.instrumentId` before it (see that column's own
// historical comment on this file): enforced at the use-case layer.
// `folioId` is nullable (a transaction can be recorded before its Folio
// is known/entered, same as Folioman's own SET_NULL posture). `units`/
// `price`/`amount` are always non-negative — direction is carried by
// `type` alone (core/portfolio/transactions/investmentTransaction.ts).
export const investmentTransactions = sqliteTable("investment_transactions", {
  id: id(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  instrumentId: text("instrument_id").notNull(),
  folioId: text("folio_id"),
  date: text("date").notNull(),
  type: text("type").notNull().$type<InvestmentTransactionType>(),
  units: integer("units").notNull(),
  price: real("price").notNull(),
  amount: integer("amount").notNull(),
  currencyId: text("currency_id")
    .notNull()
    .references(() => currencies.id),
  source: text("source").notNull().$type<InvestmentTransactionSource>(),
  sourceRef: text("source_ref"),
  narration: text("narration"),
  // Content hash for idempotent re-import (Folioman's own `dedup_key`
  // pattern, plan §1 "adopt now") — blank/null for manual entries (no
  // dedup target). Unlike most relationships in this file, a DB-level
  // partial unique index is used here rather than use-case-layer-only
  // enforcement: unlike an FK, SQLite can add a plain (non-FK) unique
  // index without a table recreate, so the usual `PRAGMA foreign_keys`
  // migration limitation (see `accounts.instrumentId`'s comment) doesn't
  // apply — see the migration SQL for the actual
  // `CREATE UNIQUE INDEX ... WHERE dedup_key IS NOT NULL`.
  dedupKey: text("dedup_key"),
  ...timestamps,
});

// An *observed* position snapshot from an import/statement (plan §1) —
// deliberately distinct from the live computed position, which is always
// netted fresh from `investmentTransactions`
// (`netUnitsFromTransactions`, never persisted — same "derived on read"
// posture as Ledger's own `accountBalance`). This table only ever holds a
// real external observation (a CAS/eCAS closing balance, a manually
// entered snapshot), mirroring Folioman's own HoldingSource split
// (ECAS/CAS_PDF/MANUAL are persisted facts; its `LEDGER` source is
// explicitly "derived in-memory, never persisted").
export const holdings = sqliteTable("holdings", {
  id: id(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  instrumentId: text("instrument_id").notNull(),
  folioId: text("folio_id"),
  asOfDate: text("as_of_date").notNull(),
  units: integer("units").notNull(),
  source: text("source").notNull().$type<"MANUAL" | "CAS_PDF" | "CSV_IMPORT" | "ECAS_PDF">(),
  sourceRef: text("source_ref"),
  ...timestamps,
});

// Per-Instrument price history (plan §1 "NAV / price history, adopt now
// if current valuation is part of initial Portfolio") — NOT Profile-
// scoped, same reasoning as `instruments` itself: a NAV is a market fact,
// not per-user data. One row per (instrument, date); `source` is
// provenance-only free text (no live pricing-provider integration yet —
// docs/completed/2026-08-21-Instrument-Model-Pricing-Foundations.md's
// pricing steps 7-9 are still not started, this table is only ever
// written to by whatever eventually fetches/imports a price, manually
// for now).
export const navHistory = sqliteTable("nav_history", {
  id: id(),
  instrumentId: text("instrument_id").notNull(),
  date: text("date").notNull(),
  nav: real("nav").notNull(),
  source: text("source"),
  ...timestamps,
});

// A Portfolio import run (plan §1 "ImportJob, adopt now") — deliberately
// smaller than Folioman's own ImportJobStatus: no `running`/
// `completed_with_warnings`/`needs_confirmation` states, since V1 runs
// synchronously (no task queue, same posture Folioman itself started
// from) and has no partial-history chaining or destructive-eCAS
// confirmation flow yet (plan §3 "Later"). `result` is an open JSON blob
// (`{mode: "json"}`) for whatever summary the importer produced —
// intentionally untyped at this layer, same posture as `accounts.tags`.
export const portfolioImports = sqliteTable("portfolio_imports", {
  id: id(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  kind: text("kind").notNull().$type<PortfolioImportKind>(),
  status: text("status").notNull().$type<PortfolioImportStatus>(),
  filename: text("filename"),
  sourceRef: text("source_ref"),
  result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  ...timestamps,
});
