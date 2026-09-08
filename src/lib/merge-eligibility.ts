// Pure, DB-independent eligibility check for Merge Transactions
// (transactionworkspacedelta.md §11) — mirrors transaction-filter.ts's
// posture (operate on already-fetched data, no I/O) so the exact same
// function can run both server-side (defensive re-check against real
// `TransactionWithPostings`/`AccountRow` — rule #17, never trust client
// gating) and client-side (contextual show/hide + live preview, built from
// `TransactionTableRow.edit`'s already-loaded data — no extra fetch).
//
// Typed against minimal structural shapes rather than the server's own
// `TransactionWithPostings`/`AccountRow` so both sides can pass their own
// (differently-sourced) data without one depending on the other's types.
export interface MergeCandidateTransaction {
  id: string;
  date: string;
  postings: readonly { accountId: string; units: number }[];
}

export interface MergeCandidateAccount {
  currencyId: string;
}

export interface MergeEligibilityResult {
  eligible: boolean;
  reason?: string;
}

function getFromAccountId(transaction: MergeCandidateTransaction): string | undefined {
  return transaction.postings.find((posting) => posting.units < 0)?.accountId;
}

function getToAccountIds(transaction: MergeCandidateTransaction): Set<string> {
  return new Set(
    transaction.postings.filter((posting) => posting.units > 0).map((posting) => posting.accountId),
  );
}

// Same date, same currency (every posting's account must share one
// `currencyId`), and a common source account OR common destination account
// across the whole set (transactionworkspacedelta.md §11) — "same Profile"
// isn't checked here since both callers already scope their input to one
// Profile before calling this (the page's own rows, or the DB query by
// `profileId`) — see mergeTransactions' own re-check for where that's
// actually enforced (a mismatched id there is simply not found).
export function checkMergeEligibility(
  transactions: readonly MergeCandidateTransaction[],
  accountsById: ReadonlyMap<string, MergeCandidateAccount>,
): MergeEligibilityResult {
  if (transactions.length < 2) {
    return { eligible: false, reason: "Select at least two transactions to merge." };
  }

  const dates = new Set(transactions.map((transaction) => transaction.date));
  if (dates.size > 1) {
    return { eligible: false, reason: "Transactions must all share the same date." };
  }

  const currencyIds = new Set<string>();
  for (const transaction of transactions) {
    for (const posting of transaction.postings) {
      const account = accountsById.get(posting.accountId);
      if (!account) {
        return { eligible: false, reason: "One or more accounts could not be found." };
      }
      currencyIds.add(account.currencyId);
    }
  }
  if (currencyIds.size > 1) {
    return { eligible: false, reason: "Transactions must all use the same currency." };
  }

  const fromAccountIds = transactions.map(getFromAccountId);
  const commonFrom =
    fromAccountIds[0] !== undefined && fromAccountIds.every((id) => id === fromAccountIds[0]);

  const toAccountIdSets = transactions.map(getToAccountIds);
  const commonTo = [...toAccountIdSets[0]].some((accountId) =>
    toAccountIdSets.every((set) => set.has(accountId)),
  );

  if (!commonFrom && !commonTo) {
    return {
      eligible: false,
      reason: "Transactions must share either a common From account or a common To account.",
    };
  }

  return { eligible: true };
}
