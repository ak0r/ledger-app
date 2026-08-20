// Schema for the application-level database — separate from any Family's
// financial dataset (2026-08-19 Family/Application Architecture delta).
// Stores AppUser identity, Sessions, and Family ownership metadata only. No
// financial data, no dataset path: a Family's per-DB file path is always
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

export const appUsers = sqliteTable("app_users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  ...timestamps,
});

// The session id doubles as the bearer token stored in the cookie — same
// crypto.randomUUID() convention as every other primary key here, not a
// second token concept.
export const sessions = sqliteTable("sessions", {
  id: id(),
  appUserId: text("app_user_id")
    .notNull()
    .references(() => appUsers.id),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

// appUserId is NOT NULL from row one — every Family is created already
// owned by the AppUser who created it (delta's core ownership rule). No
// legacy/nullable escape hatch: app.db starts fresh, not migrated from
// pre-delta data.
export const families = sqliteTable("families", {
  id: id(),
  appUserId: text("app_user_id")
    .notNull()
    .references(() => appUsers.id),
  name: text("name").notNull(),
  ...timestamps,
});
