import { and, desc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "../db/family-client";
import { postings, transactions } from "../db/schema";

export type TransactionRow = typeof transactions.$inferSelect;
export type PostingRow = typeof postings.$inferSelect;

export function insertTransaction(db: DbOrTx, row: TransactionRow): void {
  db.insert(transactions).values(row).run();
}

export function insertPostings(db: DbOrTx, rows: readonly PostingRow[]): void {
  if (rows.length === 0) return;
  db.insert(postings).values([...rows]).run();
}

// Member-scoped (rule #6).
export function findTransactionById(
  db: DbOrTx,
  id: string,
  memberId: string,
): TransactionRow | undefined {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.memberId, memberId)))
    .get();
}

export function findPostingsByTransaction(db: DbOrTx, transactionId: string): PostingRow[] {
  return db.select().from(postings).where(eq(postings.transactionId, transactionId)).all();
}

export function findTransactionsByMember(db: DbOrTx, memberId: string): TransactionRow[] {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.memberId, memberId))
    .orderBy(desc(transactions.date))
    .all();
}

export function findPostingsByTransactionIds(
  db: DbOrTx,
  transactionIds: readonly string[],
): PostingRow[] {
  if (transactionIds.length === 0) return [];
  return db.select().from(postings).where(inArray(postings.transactionId, [...transactionIds])).all();
}

export function deletePostingsByTransaction(db: DbOrTx, transactionId: string): void {
  db.delete(postings).where(eq(postings.transactionId, transactionId)).run();
}

export function updateTransactionFields(
  db: DbOrTx,
  id: string,
  fields: Pick<TransactionRow, "date" | "description" | "tags" | "updatedAt">,
): void {
  db.update(transactions).set(fields).where(eq(transactions.id, id)).run();
}

// Postings cascade on delete at the schema level (onDelete: "cascade",
// verified against a real SQLite file in Phase 2) — this removes the whole
// aggregate atomically (rule #9, ADR-019) in one statement.
export function deleteTransactionRow(db: DbOrTx, id: string, memberId: string): void {
  db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.memberId, memberId)))
    .run();
}

// Unscoped — every Transaction in this Family's database, across every
// Member in it. Used only by Clean Up Content (docs/onboarding.md §11),
// which intentionally wipes financial content for the whole Family, not
// one Member. Safe without a memberId filter because physical per-Family
// isolation already scopes the whole database to one Family (rule #6 is
// about queries needing an explicit memberId when scoping to one Member —
// this deliberately doesn't). Postings cascade at the schema level, same as
// the single-row delete above.
export function deleteAllTransactions(db: DbOrTx): void {
  db.delete(transactions).run();
}
