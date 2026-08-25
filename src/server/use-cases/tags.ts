import type { Db } from "../db/client";
import { findAccountsByProfile } from "../repositories/accounts";
import { findTransactionsByProfile } from "../repositories/transactions";

// Every distinct tag already used anywhere in a Profile's Accounts/
// Transactions — drives TagInput's autocomplete. Not a Tag entity: purely
// a distinct-values read over the existing tags columns, nothing persisted
// (rule #13/#14 — no normalized Tag table).
export function listDistinctTags(db: Db, profileId: string): string[] {
  const tagSet = new Set<string>();
  for (const account of findAccountsByProfile(db, profileId)) {
    for (const tag of account.tags ?? []) tagSet.add(tag);
  }
  for (const transaction of findTransactionsByProfile(db, profileId)) {
    for (const tag of transaction.tags ?? []) tagSet.add(tag);
  }
  return [...tagSet].sort();
}
