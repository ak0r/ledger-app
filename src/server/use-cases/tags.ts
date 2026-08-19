import type { Db } from "../db/family-client";
import { findAccountsByMember } from "../repositories/accounts";
import { findTransactionsByMember } from "../repositories/transactions";

// Every distinct tag already used anywhere in a Member's Accounts/
// Transactions — drives TagInput's autocomplete. Not a Tag entity: purely
// a distinct-values read over the existing tags columns, nothing persisted
// (rule #13/#14 — no normalized Tag table).
export function listDistinctTags(db: Db, memberId: string): string[] {
  const tagSet = new Set<string>();
  for (const account of findAccountsByMember(db, memberId)) {
    for (const tag of account.tags ?? []) tagSet.add(tag);
  }
  for (const transaction of findTransactionsByMember(db, memberId)) {
    for (const tag of transaction.tags ?? []) tagSet.add(tag);
  }
  return [...tagSet].sort();
}
