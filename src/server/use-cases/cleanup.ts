import type { Db } from "../db/client";
import { deleteAllTransactions } from "../repositories/transactions";
import { deleteAllAccounts } from "../repositories/accounts";
import { deleteAllCurrencies } from "../repositories/currencies";

// Clean Up Content (docs/onboarding.md §11) — deletes all of one Profile's
// financial content (Transactions, cascaded Postings, Accounts,
// Currencies) while explicitly preserving the Profile itself. One
// db.transaction() so this is all-or-nothing, same pattern as every other
// multi-row mutation in this layer. Order matters for the plain (non-
// cascading) FKs: Transactions first (Postings cascade automatically),
// then Accounts (referenced by Postings, already gone), then Currencies
// (referenced by Accounts, already gone).
//
// Every delete below is explicitly profileId-scoped — this used to be
// safe unscoped when physical per-Family DB isolation meant "the whole
// file" already meant "one Family" (2026-08-19 delta and earlier); that
// premise no longer holds now that all Profiles share one database
// (2026-08-20 User Simplification delta).
export function cleanUpProfileContent(db: Db, profileId: string): void {
  db.transaction((tx) => {
    deleteAllTransactions(tx, profileId);
    deleteAllAccounts(tx, profileId);
    deleteAllCurrencies(tx, profileId);
  });
}
