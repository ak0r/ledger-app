import { describe, expect, it } from "vitest";
import type { AccountRow } from "@/server/repositories/accounts";
import type { TransactionWithPostings } from "@/server/use-cases/transactions";
import { buildTransactionTableRows } from "./transaction-rows";

const now = "2026-09-03T00:00:00.000Z";

function account(id: string, name: string, currencyId: string): AccountRow {
  return {
    id,
    profileId: "profile-1",
    currencyId,
    name,
    classification: "ASSET",
    instrumentType: "BANK",
    instrumentId: null,
    instrumentLabel: null,
    tags: null,
    icon: null,
    isArchived: false,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  } as unknown as AccountRow;
}

function transaction(
  id: string,
  postings: { accountId: string; debit: number; credit: number }[],
): TransactionWithPostings {
  return {
    id,
    profileId: "profile-1",
    date: "2026-09-03",
    description: "Convert Cash",
    tags: null,
    importFileId: null,
    createdAt: now,
    updatedAt: now,
    postings: postings.map((p, i) => ({
      id: `posting-${i}`,
      transactionId: id,
      accountId: p.accountId,
      debit: p.debit,
      credit: p.credit,
      createdAt: now,
      updatedAt: now,
    })),
  } as unknown as TransactionWithPostings;
}

describe("buildTransactionTableRows — per-Account currency (Currency Catalogue delta)", () => {
  const inrAccount = account("bank", "HDFC Bank", "inr-currency");
  const jpyAccount = account("jpy-cash", "JPY in hand", "jpy-currency");
  const accountsById = new Map([
    ["bank", inrAccount],
    ["jpy-cash", jpyAccount],
  ]);
  const currenciesById = new Map([
    ["inr-currency", { code: "INR", symbol: "₹", minorUnitScale: 2 }],
    ["jpy-currency", { code: "JPY", symbol: "¥", minorUnitScale: 0 }],
  ]);
  const fallbackCurrency = { code: "INR", symbol: "₹", minorUnitScale: 2 };

  it("formats a Currency Conversion's From and To legs each in their own Account's currency, not one shared default", () => {
    const txn = transaction("t1", [
      { accountId: "bank", debit: 0, credit: 1000000 }, // ₹10,000
      { accountId: "jpy-cash", debit: 15000, credit: 0 }, // ¥15,000
    ]);

    const [row] = buildTransactionTableRows([txn], accountsById, fallbackCurrency, currenciesById);

    expect(row!.fromAmount).toBe("₹10,000.00");
    expect(row!.toLines[0]!.amount).toBe("¥15,000");
    // The real bug this guards against: without per-Account currency
    // resolution, the To leg's raw 15000 minor units would be formatted
    // with INR's scale (÷100) as "₹150.00" instead of JPY's real scale.
    expect(row!.toLines[0]!.amount).not.toBe("₹150.00");
  });

  it("derives edit.amount/edit.toLines using each leg's own currency scale, not the fallback's", () => {
    const txn = transaction("t1", [
      { accountId: "bank", debit: 0, credit: 1000000 },
      { accountId: "jpy-cash", debit: 15000, credit: 0 },
    ]);

    const [row] = buildTransactionTableRows([txn], accountsById, fallbackCurrency, currenciesById);

    expect(row!.edit.amount).toBe(10000);
    expect(row!.edit.toLines[0]!.amount).toBe(15000);
  });

  it("falls back to the given default currency when an account/currency can't be resolved", () => {
    const txn = transaction("t1", [
      { accountId: "unknown", debit: 0, credit: 1000 },
      { accountId: "bank", debit: 1000, credit: 0 },
    ]);

    const [row] = buildTransactionTableRows([txn], accountsById, fallbackCurrency, currenciesById);

    expect(row!.fromAmount).toBe("₹10.00");
  });

  it("exposes each side's currency code, for the transaction list's Conversion badge", () => {
    const conversion = transaction("t1", [
      { accountId: "bank", debit: 0, credit: 1000000 },
      { accountId: "jpy-cash", debit: 15000, credit: 0 },
    ]);
    const [conversionRow] = buildTransactionTableRows([conversion], accountsById, fallbackCurrency, currenciesById);
    expect(conversionRow!.fromCurrencyCode).toBe("INR");
    expect(conversionRow!.toLines[0]!.currencyCode).toBe("JPY");

    const normal = transaction("t2", [
      { accountId: "bank", debit: 0, credit: 1000 },
      { accountId: "bank", debit: 1000, credit: 0 },
    ]);
    const [normalRow] = buildTransactionTableRows([normal], accountsById, fallbackCurrency, currenciesById);
    expect(normalRow!.fromCurrencyCode).toBe(normalRow!.toLines[0]!.currencyCode);
  });
});
