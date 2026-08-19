// Schema for the Family registry — a separate database from any Family's
// financial dataset (docs/v9-delta/family-concept-contract.md §5). Stores
// no financial data, no dataset path: a Family's per-DB file path is always
// derived deterministically from its id (see family-client.ts).
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const families = sqliteTable("families", {
  id: id(),
  name: text("name").notNull(),
  ...timestamps,
});
