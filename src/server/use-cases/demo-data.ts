import type { Db } from "../db/client";
import { insertCurrency } from "../repositories/currencies";
import { insertAccount } from "../repositories/accounts";
import { insertTransaction, insertPostings } from "../repositories/transactions";
import { buildDemoDataset, validateDataset } from "../demo/dataset";

// Copies the native demo dataset into an already-existing (empty) Profile
// (docs/onboarding.md §4). One db.transaction() around every insert — a
// thrown error rolls back everything, so a failed demo copy never leaves
// the Profile half-initialized (rule #10 territory: no partially-created
// accounting data); it's simply retryable from /p/[profileId]/setup, which
// stays reachable exactly because no Account exists yet.
export function createDemoProfileData(db: Db, profileId: string): void {
  const dataset = buildDemoDataset(profileId);
  validateDataset(dataset);

  // Chunked: a single INSERT with every posting bound as parameters (2,000+
  // rows x 7 columns) risks SQLite's bound-parameter ceiling. 400 rows/call
  // stays comfortably under it regardless of the SQLite build in use.
  const POSTING_CHUNK_SIZE = 400;

  db.transaction((tx) => {
    for (const currency of dataset.currencies) insertCurrency(tx, currency);
    for (const account of dataset.accounts) insertAccount(tx, account);
    for (const transaction of dataset.transactions) insertTransaction(tx, transaction);
    for (let i = 0; i < dataset.postings.length; i += POSTING_CHUNK_SIZE) {
      insertPostings(tx, dataset.postings.slice(i, i + POSTING_CHUNK_SIZE));
    }
  });
}
