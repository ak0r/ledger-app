// Full MVP schema translated from docs/09-data-model.dbml (field-for-field).
// Money values are integer minor units (ADR-022). Timestamps/dates are
// ISO 8601 strings. Classification/instrument-type enums are validated by
// the domain layer (rule #17) — this file only pins their TS shape via
// `.$type<...>()`; SQLite stores them as plain text.
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { CLASSIFICATIONS, INSTRUMENT_TYPES } from "@/domain";
import type { Classification, InstrumentType } from "@/domain";

export { CLASSIFICATIONS, INSTRUMENT_TYPES };
export type { Classification, InstrumentType };

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const members = sqliteTable("members", {
  id: id(),
  name: text("name").notNull(),
  // Durable Primary Member per Family (docs/onboarding.md §7) — exactly one
  // row may have this true at a time, enforced by setPrimaryMember (rule
  // #6's ownership scoping doesn't apply here: this is Family-wide, not
  // per-Member data). Active-member *cookie* stays convenience-only as
  // already decided; this is the real, server-persisted default.
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const currencies = sqliteTable("currencies", {
  id: id(),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  minorUnitScale: integer("minor_unit_scale").notNull(),
  ...timestamps,
});

export const accounts = sqliteTable("accounts", {
  id: id(),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id),
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

export const transactions = sqliteTable("transactions", {
  id: id(),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id),
  date: text("date").notNull(),
  description: text("description").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
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
