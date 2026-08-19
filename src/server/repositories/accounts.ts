import { and, eq, inArray, sum as sqlSum } from "drizzle-orm";
import type { AccountRef } from "@/domain";
import type { DbOrTx } from "../db/family-client";
import { accounts, currencies, postings } from "../db/schema";

export type AccountRow = typeof accounts.$inferSelect;

export function insertAccount(db: DbOrTx, row: AccountRow): void {
  db.insert(accounts).values(row).run();
}

// Unscoped — see deleteAllTransactions in repositories/transactions.ts for
// why this is safe without a memberId filter (Clean Up Content only).
export function deleteAllAccounts(db: DbOrTx): void {
  db.delete(accounts).run();
}

// Member-scoped (rule #6).
export function findAccountById(
  db: DbOrTx,
  id: string,
  memberId: string,
): AccountRow | undefined {
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.memberId, memberId)))
    .get();
}

export function findAccountsByMember(db: DbOrTx, memberId: string): AccountRow[] {
  return db.select().from(accounts).where(eq(accounts.memberId, memberId)).all();
}

export function setAccountArchived(
  db: DbOrTx,
  id: string,
  memberId: string,
  isArchived: boolean,
  updatedAt: string,
): void {
  db
    .update(accounts)
    .set({ isArchived, updatedAt })
    .where(and(eq(accounts.id, id), eq(accounts.memberId, memberId)))
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
  | "updatedAt"
>;

export function updateAccountFields(
  db: DbOrTx,
  id: string,
  memberId: string,
  fields: EditableAccountFields,
): void {
  db
    .update(accounts)
    .set(fields)
    .where(and(eq(accounts.id, id), eq(accounts.memberId, memberId)))
    .run();
}

// Feeds the domain layer's ownership/currency invariants (docs/06-architecture.md).
// Not Member-scoped by itself — callers pass the transaction's Member and the
// domain layer flags any account that turns out to belong to someone else.
export function findAccountRefs(
  db: DbOrTx,
  accountIds: readonly string[],
): Map<string, AccountRef> {
  if (accountIds.length === 0) return new Map();

  const rows = db
    .select({
      id: accounts.id,
      memberId: accounts.memberId,
      currencyCode: currencies.code,
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
// totals per Account, Member-scoped via the join (rule #6). Accounts with no
// postings are simply absent from the result; callers default to zero.
export function findPostingTotalsByMember(
  db: DbOrTx,
  memberId: string,
): Map<string, AccountPostingTotals> {
  const rows = db
    .select({
      accountId: postings.accountId,
      totalDebit: sqlSum(postings.debit).mapWith(Number),
      totalCredit: sqlSum(postings.credit).mapWith(Number),
    })
    .from(postings)
    .innerJoin(accounts, eq(postings.accountId, accounts.id))
    .where(eq(accounts.memberId, memberId))
    .groupBy(postings.accountId)
    .all();

  return new Map(
    rows.map((row) => [row.accountId, { totalDebit: row.totalDebit, totalCredit: row.totalCredit }]),
  );
}
