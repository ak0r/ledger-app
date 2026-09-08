import { fromMinorUnits, toMinorUnits, minorRationalToDecimalRate } from "@/core";
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

// FX-rate secondary info for a To leg genuinely priced away from the
// Profile Base Currency (Transaction Form FX UX delta) — `priceNum ===
// priceDenom` (reduced 1/1) is this leg's own signal for "no real FX
// here," the same one `derivePostings`' `hasGenuineFx` uses server-side;
// unlike the old legacy `price` column (retired — dropped by migration
// 0020), this doesn't need to compare against the From leg's currency,
// since a posting's price is always relative to the Base Currency
// regardless of which leg happens to be From.
function toLineSecondary(
  posting: { priceNum: number; priceDenom: number },
  postingCurrency: { code: string; symbol: string; minorUnitScale: number },
  baseCurrencyScale: number,
): ToLineSecondary | undefined {
  if (posting.priceNum === posting.priceDenom) return undefined;
  const rate = minorRationalToDecimalRate(
    { num: posting.priceNum, denom: posting.priceDenom },
    postingCurrency.minorUnitScale,
    baseCurrencyScale,
  );
  return { kind: "fx", currencyCode: postingCurrency.code, rate: trimmedNumber(rate) };
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
  baseCurrencyScale: number = currency.minorUnitScale,
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
    const toPostings = transaction.postings.filter((posting) => posting.units > 0);
    const fromPostings = transaction.postings.filter((posting) => posting.units < 0);
    // Safe to sum raw minor units directly: a multi-posting `fromPostings`
    // (Merge's "common From" case) is only reachable for a same-currency
    // N-posting transaction — rule #15's UI only ever creates one From
    // posting per transaction, so multiple From legs only ever arise from
    // Merge, which requires every input to already share one currency
    // (checkMergeEligibility) — never more than one currency to sum here.
    const totalFromAmount = fromPostings.reduce((sum, posting) => sum + -posting.units, 0);
    const fromCurrency = currencyFor(fromPostings[0]?.accountId ?? "");

    return {
      id: transaction.id,
      date: transaction.date,
      description: transaction.description,
      // The From leg's Currency code — unambiguous for the same reason
      // `totalFromAmount` above is (rule #15's UI + Merge's own currency
      // constraint), even though `fromLines` itself supports Merge's
      // multi-From case.
      fromCurrencyCode: fromCurrency.code,
      fromLines: fromPostings.map((posting) => {
        const account = accountsById.get(posting.accountId);
        const postingCurrency = currencyFor(posting.accountId);
        return {
          account: account?.name ?? "—",
          classification: account?.classification,
          icon: account?.icon,
          amount: formatMoney(-posting.units, postingCurrency.symbol, postingCurrency.minorUnitScale),
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
          amount: formatMoney(posting.units, postingCurrency.symbol, postingCurrency.minorUnitScale),
          currencyCode: postingCurrency.code,
          secondary: toLineSecondary(posting, postingCurrency, baseCurrencyScale),
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
        amount: fromMinorUnits(-(fromPostings[0]?.units ?? 0), fromCurrency.minorUnitScale),
        toLines: toPostings.map((posting) => {
          const postingCurrency = currencyFor(posting.accountId);
          return {
            accountId: posting.accountId,
            amount: fromMinorUnits(posting.units, postingCurrency.minorUnitScale),
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
      { accountId: row.edit.fromAccountId, units: -toMinorUnits(row.edit.amount, currencyScale) },
      ...row.edit.toLines.map((line) => ({
        accountId: line.accountId,
        units: toMinorUnits(line.amount, currencyScale),
      })),
    ],
  };
}
