import { fromMinorUnits, toMinorUnits } from "@/core";
import type { AccountRow } from "@/server/repositories/accounts";
import type { TransactionWithPostings } from "@/server/services/transactions";
import type { TransactionTableRow, ToLineSecondary } from "@/components/transaction-table";
import type { MergeCandidateTransaction } from "@/lib/merge-eligibility";
import { formatMoney } from "@/lib/utils";

// Trims to at most `maxDecimals` places without padding — 100 -> "100",
// 72.4567 -> "72.4567", not "72.4567000" (used for both a Quantity's own
// decimal amount and an FX rate; neither is Money, so `formatMoney` doesn't
// apply).
function trimmedNumber(value: number, maxDecimals = 4): string {
  return Number(value.toFixed(maxDecimals)).toString();
}

// FX-rate secondary info for a Currency Conversion's To leg (Revised
// Investment Model delta, Phase 5, 2026-09-03) — the reconciliation
// currency is always the From leg's own currency
// (core/ledger/transactions/transaction.ts), so a differing price only
// ever shows up on a To posting whose currency differs from the From leg.
function toLineSecondary(
  posting: { price: number },
  postingCurrency: { code: string; symbol: string; minorUnitScale: number },
  fromCurrency: { code: string; symbol: string; minorUnitScale: number },
): ToLineSecondary | undefined {
  const isConversion = postingCurrency.code !== fromCurrency.code;
  if (isConversion && posting.price > 0) {
    return { kind: "fx", currencyCode: postingCurrency.code, rate: trimmedNumber(1 / posting.price) };
  }

  return undefined;
}

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
  currency: { code: string; symbol: string; minorUnitScale: number },
  currenciesById: ReadonlyMap<string, { code: string; symbol: string; minorUnitScale: number }> = new Map(),
): TransactionTableRow[] {
  // Each posting's own Account's Currency, not the one shared `currency`
  // default (Currency Catalogue delta, 2026-09-03) — Accounts can have
  // independently different currencies now, and a Currency Conversion's
  // whole point is a To leg in a *different* currency from the From leg.
  // `currency` stays the fallback for an unresolvable account/currency
  // (matches the existing `?? "—"` posture for a missing account name).
  const currencyFor = (accountId: string) => {
    const account = accountsById.get(accountId);
    return (account && currenciesById.get(account.currencyId)) || currency;
  };

  return transactions.map((transaction) => {
    const toPostings = transaction.postings.filter((posting) => posting.debit > 0);
    const fromPostings = transaction.postings.filter((posting) => posting.credit > 0);
    // Safe to sum raw minor units directly: a multi-posting `fromPostings`
    // (Merge's "common From" case) is only reachable for a same-currency
    // N-posting transaction — a Currency Conversion is always exactly one
    // From posting (domain/transaction.ts's isConversionShape), so there's
    // never more than one currency to sum across here.
    const totalFromAmount = fromPostings.reduce((sum, posting) => sum + posting.credit, 0);
    const fromCurrency = currencyFor(fromPostings[0]?.accountId ?? "");

    return {
      id: transaction.id,
      date: transaction.date,
      description: transaction.description,
      // The From leg's Currency code — a Currency Conversion is always
      // exactly one From posting (domain/transaction.ts's
      // isConversionShape), so this is unambiguous even though `fromLines`
      // itself supports Merge's multi-From case.
      fromCurrencyCode: fromCurrency.code,
      fromLines: fromPostings.map((posting) => {
        const account = accountsById.get(posting.accountId);
        const postingCurrency = currencyFor(posting.accountId);
        return {
          account: account?.name ?? "—",
          classification: account?.classification,
          icon: account?.icon,
          amount: formatMoney(posting.credit, postingCurrency.symbol, postingCurrency.minorUnitScale),
        };
      }),
      fromAmount: formatMoney(totalFromAmount, fromCurrency.symbol, fromCurrency.minorUnitScale),
      toLines: toPostings.map((posting) => {
        const account = accountsById.get(posting.accountId);
        const postingCurrency = currencyFor(posting.accountId);
        return {
          account: account?.name ?? "—",
          classification: account?.classification,
          icon: account?.icon,
          amount: formatMoney(posting.debit, postingCurrency.symbol, postingCurrency.minorUnitScale),
          currencyCode: postingCurrency.code,
          secondary: toLineSecondary(posting, postingCurrency, fromCurrency),
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
        amount: fromMinorUnits(fromPostings[0]?.credit ?? 0, fromCurrency.minorUnitScale),
        toLines: toPostings.map((posting) => {
          const postingCurrency = currencyFor(posting.accountId);
          return {
            accountId: posting.accountId,
            amount: fromMinorUnits(posting.debit, postingCurrency.minorUnitScale),
          };
        }),
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
