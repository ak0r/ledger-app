import type { Db } from "../db/family-client";
import { insertMember } from "../repositories/members";
import { insertCurrency } from "../repositories/currencies";
import { insertAccount } from "../repositories/accounts";
import { insertTransaction, insertPostings } from "../repositories/transactions";
import { buildDemoDataset, validateDataset } from "../demo/dataset";
import type { MemberRow } from "../repositories/members";

// Copies the native demo dataset into a freshly-provisioned (empty) Family
// database (docs/onboarding.md §4). One db.transaction() around every
// insert — a thrown error rolls back everything, so a failed demo copy
// never leaves the Family half-initialized (§10: "do not intentionally
// leave partially-created accounting data behind"); it's simply retryable
// from /f/[familyId]/setup, which stays reachable exactly because no
// Member exists yet (see resolveFamilyEntryPath).
export function createDemoFamilyData(db: Db): MemberRow {
  const dataset = buildDemoDataset();
  validateDataset(dataset);

  // Chunked: a single INSERT with every posting bound as parameters (2,000+
  // rows x 7 columns) risks SQLite's bound-parameter ceiling. 400 rows/call
  // stays comfortably under it regardless of the SQLite build in use.
  const POSTING_CHUNK_SIZE = 400;

  db.transaction((tx) => {
    for (const member of dataset.members) insertMember(tx, member);
    for (const currency of dataset.currencies) insertCurrency(tx, currency);
    for (const account of dataset.accounts) insertAccount(tx, account);
    for (const transaction of dataset.transactions) insertTransaction(tx, transaction);
    for (let i = 0; i < dataset.postings.length; i += POSTING_CHUNK_SIZE) {
      insertPostings(tx, dataset.postings.slice(i, i + POSTING_CHUNK_SIZE));
    }
  });

  return dataset.members.find((m) => m.id === dataset.primaryMemberId)!;
}
