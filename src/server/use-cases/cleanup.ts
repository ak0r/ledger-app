import type { Db } from "../db/family-client";
import { deleteAllTransactions } from "../repositories/transactions";
import { deleteAllAccounts } from "../repositories/accounts";
import { deleteAllCurrencies } from "../repositories/currencies";

// Clean Up Content (docs/onboarding.md §11) — deletes all Family-owned
// financial content (Transactions, cascaded Postings, Accounts, Currencies)
// while explicitly preserving the Family and its Members. One
// db.transaction() so this is all-or-nothing, same pattern as every other
// multi-row mutation in this layer. Order matters for the plain (non-
// cascading) FKs: Transactions first (Postings cascade automatically),
// then Accounts (referenced by Postings, already gone), then Currencies
// (referenced by Accounts, already gone).
export function cleanUpFamilyContent(db: Db): void {
  db.transaction((tx) => {
    deleteAllTransactions(tx);
    deleteAllAccounts(tx);
    deleteAllCurrencies(tx);
  });
}
