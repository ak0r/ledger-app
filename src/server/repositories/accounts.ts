import { and, eq, inArray, sum as sqlSum } from "drizzle-orm";
import type { AccountRef } from "@/core";
import type { DbOrTx } from "../persistence/client";
import { accounts, currencies, postings } from "../persistence/schema";

export type AccountRow = typeof accounts.$inferSelect;

export function insertAccount(db: DbOrTx, row: AccountRow): void {
  db.insert(accounts).values(row).run();
}

// Profile-scoped (rule #6) — see deleteAllTransactions in
// repositories/transactions.ts for why this must filter explicitly now
// that all Profiles share one database (Clean Up Content only).
export function deleteAllAccounts(db: DbOrTx, profileId: string): void {
  db.delete(accounts).where(eq(accounts.profileId, profileId)).run();
}

// Profile-scoped (rule #6).
export function findAccountById(
  db: DbOrTx,
  id: string,
  profileId: string,
): AccountRow | undefined {
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.profileId, profileId)))
    .get();
}

export function findAccountsByProfile(db: DbOrTx, profileId: string): AccountRow[] {
  return db.select().from(accounts).where(eq(accounts.profileId, profileId)).all();
}

export function setAccountArchived(
  db: DbOrTx,
  id: string,
  profileId: string,
  isArchived: boolean,
  updatedAt: string,
): void {
  db
    .update(accounts)
    .set({ isArchived, updatedAt })
    .where(and(eq(accounts.id, id), eq(accounts.profileId, profileId)))
    .run();
}

export type EditableAccountFields = Pick<
  AccountRow,
  | "name"
  | "classification"
  | "instrumentType"
  | "instrumentId"
  | "instrumentLabel"
  | "tags"
  | "icon"
  | "metadata"
  | "currencyId"
  | "updatedAt"
>;

export function updateAccountFields(
  db: DbOrTx,
  id: string,
  profileId: string,
  fields: EditableAccountFields,
): void {
  db
    .update(accounts)
    .set(fields)
    .where(and(eq(accounts.id, id), eq(accounts.profileId, profileId)))
    .run();
}

// Feeds the domain layer's ownership/currency invariants (docs/06-architecture.md).
// Not Profile-scoped by itself — callers pass the transaction's Profile and
// the domain layer flags any account that turns out to belong to someone
// else.
export function findAccountRefs(
  db: DbOrTx,
  accountIds: readonly string[],
): Map<string, AccountRef> {
  if (accountIds.length === 0) return new Map();

  const rows = db
    .select({
      id: accounts.id,
      profileId: accounts.profileId,
      currencyCode: currencies.code,
      currencyScale: currencies.minorUnitScale,
    })
    .from(accounts)
    .innerJoin(currencies, eq(accounts.currencyId, currencies.id))
    .where(inArray(accounts.id, [...accountIds]))
    .all();

  return new Map(rows.map((row) => [row.id, row]));
}

export interface AccountPostingTotals {
  totalDebit: number;
  totalCredit: number;
}

// Feeds domain's accountBalance (docs/03-accounting-principles.md) — all-time
// totals per Account, Profile-scoped via the join (rule #6). Accounts with
// no postings are simply absent from the result; callers default to zero.
export function findPostingTotalsByProfile(
  db: DbOrTx,
  profileId: string,
): Map<string, AccountPostingTotals> {
  const rows = db
    .select({
      accountId: postings.accountId,
      totalDebit: sqlSum(postings.debit).mapWith(Number),
      totalCredit: sqlSum(postings.credit).mapWith(Number),
    })
    .from(postings)
    .innerJoin(accounts, eq(postings.accountId, accounts.id))
    .where(eq(accounts.profileId, profileId))
    .groupBy(postings.accountId)
    .all();

  return new Map(
    rows.map((row) => [row.accountId, { totalDebit: row.totalDebit, totalCredit: row.totalCredit }]),
  );
}
