import { fromMinorUnits, toMinorUnits } from "@/domain";
import type { AccountRow } from "@/server/repositories/accounts";
import type { TransactionWithPostings } from "@/server/use-cases/transactions";
import type { TransactionTableRow } from "@/components/transaction-table";
import type { MergeCandidateTransaction } from "@/lib/merge-eligibility";
import { formatMoney } from "@/lib/utils";

// Shared by the Member-scoped Transactions page and the Account detail
// page (docs/ledger-transaction-list-change.md: "one reusable
// TransactionList... Member scope and Account scope") so the mapping from
// domain Transactions to display rows lives in exactly one place.
//
// MVP transaction *UI* (create/edit forms) supports 1→1 and 1→N (rule #15)
// — but the domain stays generic N-posting, and Merge Transactions
// (transactionworkspacedelta.md §11, "common From OR common To") can
// legitimately produce a transaction with *multiple* credit postings (e.g.
// two same-From-account purchases merged). `fromLines` mirrors `toLines`
// for exactly that reason — a single `.find()`-picked "from" silently
// dropped every credit posting after the first, understating the real
// total (caught via a real merge in testing, not theoretical). Rows with
// `fromLines.length > 1` are display/view-only: Full Edit/Quick Edit/Split/
// Merge all still assume a single From account (rule #15's UI boundary)
// and are disabled for them in transaction-row-menu.tsx.
export function buildTransactionTableRows(
  transactions: readonly TransactionWithPostings[],
  accountsById: ReadonlyMap<string, AccountRow>,
  currency: { symbol: string; minorUnitScale: number },
): TransactionTableRow[] {
  return transactions.map((transaction) => {
    const toPostings = transaction.postings.filter((posting) => posting.debit > 0);
    const fromPostings = transaction.postings.filter((posting) => posting.credit > 0);
    const totalFromAmount = fromPostings.reduce((sum, posting) => sum + posting.credit, 0);

    return {
      id: transaction.id,
      date: transaction.date,
      description: transaction.description,
      fromLines: fromPostings.map((posting) => {
        const account = accountsById.get(posting.accountId);
        return {
          account: account?.name ?? "—",
          classification: account?.classification,
          icon: account?.icon,
          amount: formatMoney(posting.credit, currency.symbol, currency.minorUnitScale),
        };
      }),
      fromAmount: formatMoney(totalFromAmount, currency.symbol, currency.minorUnitScale),
      toLines: toPostings.map((posting) => {
        const account = accountsById.get(posting.accountId);
        return {
          account: account?.name ?? "—",
          classification: account?.classification,
          icon: account?.icon,
          amount: formatMoney(posting.debit, currency.symbol, currency.minorUnitScale),
        };
      }),
      tags: transaction.tags,
      // Raw, editable values — not display strings — so TransactionEditDrawer
      // (Full Edit as a Sheet) can hand this straight to TransactionForm with
      // no extra fetch when it opens (same zero-fetch pattern already used by
      // ViewTransactionDrawer). Only meaningful when `fromLines.length === 1`
      // (rule #15's editable shape) — Edit/Quick Edit are disabled for
      // multi-From rows, so this defensive first-posting fallback is never
      // actually read into a form for them; it exists only so this field
      // stays non-optional rather than requiring every reader to null-check.
      edit: {
        fromAccountId: fromPostings[0]?.accountId ?? "",
        amount: fromMinorUnits(fromPostings[0]?.credit ?? 0, currency.minorUnitScale),
        toLines: toPostings.map((posting) => ({
          accountId: posting.accountId,
          amount: fromMinorUnits(posting.debit, currency.minorUnitScale),
        })),
      },
    };
  });
}

// Reconstructs the minor-units posting shape `checkMergeEligibility` needs
// from a row's already-loaded `.edit` data — used both client-side (Merge
// Transaction's contextual candidate scan / the dialog's live preview) and
// nowhere server-side (the domain op re-derives its own from real
// `TransactionWithPostings` rows, not from display rows).
export function toMergeCandidate(row: TransactionTableRow, currencyScale: number): MergeCandidateTransaction {
  return {
    id: row.id,
    date: row.date,
    postings: [
      { accountId: row.edit.fromAccountId, debit: 0, credit: toMinorUnits(row.edit.amount, currencyScale) },
      ...row.edit.toLines.map((line) => ({
        accountId: line.accountId,
        debit: toMinorUnits(line.amount, currencyScale),
        credit: 0,
      })),
    ],
  };
}
