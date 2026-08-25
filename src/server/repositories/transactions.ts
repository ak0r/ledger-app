import { and, desc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
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

// Profile-scoped (rule #6).
export function findTransactionById(
  db: DbOrTx,
  id: string,
  profileId: string,
): TransactionRow | undefined {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.profileId, profileId)))
    .get();
}

export function findPostingsByTransaction(db: DbOrTx, transactionId: string): PostingRow[] {
  return db.select().from(postings).where(eq(postings.transactionId, transactionId)).all();
}

export function findTransactionsByProfile(db: DbOrTx, profileId: string): TransactionRow[] {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.profileId, profileId))
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
export function deleteTransactionRow(db: DbOrTx, id: string, profileId: string): void {
  db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.profileId, profileId)))
    .run();
}

// Profile-scoped (rule #6) — used by Clean Up Content, which wipes
// financial content for exactly one Profile. This USED TO be unscoped when
// physical per-Family DB isolation meant "the whole file" already meant
// "one Family" (2026-08-19 delta and earlier) — that premise no longer
// holds now that all Profiles share one database (2026-08-20 User
// Simplification delta), so this must filter explicitly or Clean Up
// Content for one Profile would wipe every Profile's Transactions
// instance-wide. Postings cascade at the schema level, same as the
// single-row delete above.
export function deleteAllTransactions(db: DbOrTx, profileId: string): void {
  db.delete(transactions).where(eq(transactions.profileId, profileId)).run();
}
