import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { accountIdentifiers, accounts } from "../db/schema";

export type AccountIdentifierRow = typeof accountIdentifiers.$inferSelect;

export function insertAccountIdentifier(db: DbOrTx, row: AccountIdentifierRow): void {
  db.insert(accountIdentifiers).values(row).run();
}

// Profile-scoped via the `accounts` join (rule #6) — `account_identifiers`
// itself carries no `profile_id` column (domain/accountIdentifier.ts's
// matching functions are pure and profile-agnostic; this is the only
// DB-touching boundary that scopes them to one Profile).
export function findAccountIdentifiersByProfile(
  db: DbOrTx,
  profileId: string,
): (AccountIdentifierRow & { accountName: string })[] {
  return db
    .select({
      id: accountIdentifiers.id,
      accountId: accountIdentifiers.accountId,
      identifier: accountIdentifiers.identifier,
      createdAt: accountIdentifiers.createdAt,
      updatedAt: accountIdentifiers.updatedAt,
      accountName: accounts.name,
    })
    .from(accountIdentifiers)
    .innerJoin(accounts, eq(accountIdentifiers.accountId, accounts.id))
    .where(eq(accounts.profileId, profileId))
    .all();
}

export function findAccountIdByIdentifier(
  db: DbOrTx,
  profileId: string,
  identifier: string,
): string | undefined {
  return db
    .select({ accountId: accountIdentifiers.accountId })
    .from(accountIdentifiers)
    .innerJoin(accounts, eq(accountIdentifiers.accountId, accounts.id))
    .where(and(eq(accounts.profileId, profileId), eq(accountIdentifiers.identifier, identifier)))
    .get()?.accountId;
}
