// Full MVP schema translated from docs/09-data-model.dbml (field-for-field),
// extended by the 2026-08-20 User Simplification delta with AppUser/Session/
// Profile identity tables. One Hosted Instance = one database (this file,
// one physical SQLite file at data/ledger.db) — no more per-Family
// isolation. Money values are integer minor units (ADR-022). Timestamps/
// dates are ISO 8601 strings. Classification/instrument-type enums are
// validated by the domain layer (rule #17) — this file only pins their TS
// shape via `.$type<...>()`; SQLite stores them as plain text.
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import {
  CLASSIFICATIONS,
  CREATABLE_CLASSIFICATIONS,
  INSTRUMENT_TYPES,
  INSTRUMENT_BACKED_TYPES,
  RECURRING_FREQUENCIES,
} from "@/domain";
import type {
  Classification,
  InstrumentType,
  InstrumentBackedType,
  ImportStatus,
  RecurringFrequency,
} from "@/domain";

export { CLASSIFICATIONS, CREATABLE_CLASSIFICATIONS, INSTRUMENT_TYPES, INSTRUMENT_BACKED_TYPES, RECURRING_FREQUENCIES };
export type { Classification, InstrumentType, InstrumentBackedType, ImportStatus, RecurringFrequency };

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
