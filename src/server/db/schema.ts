// Full MVP schema translated from docs/09-data-model.dbml (field-for-field),
// extended by the 2026-08-20 User Simplification delta with AppUser/Session/
// Profile identity tables. One Hosted Instance = one database (this file,
// one physical SQLite file at data/ledger.db) — no more per-Family
// isolation. Money values are integer minor units (ADR-022). Timestamps/
// dates are ISO 8601 strings. Classification/instrument-type enums are
// validated by the domain layer (rule #17) — this file only pins their TS
// shape via `.$type<...>()`; SQLite stores them as plain text.
import { sqliteTable, text, integer, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
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
} from "@/domain";
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
} from "@/domain";

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
export const instruments = sqliteTable("instruments", {
  id: id(),
  type: text("type").notNull().$type<InstrumentBackedType>(),
  name: text("name").notNull(),
  // Free-text pricing-unit hint for commodities, e.g. "10g", "1 barrel"
  // (delta §4 — providers quote commodities in inconsistent units). Null
  // for STOCK/MUTUAL_FUND, where a "unit" is unambiguous.
  unitLabel: text("unit_label"),
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

// Recurring Transactions Phase 1 (docs/pending/2026-08-27-Recurring-Transactions.md)
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
