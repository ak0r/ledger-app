import { describe, expect, it } from "vitest";
import type { AccountRow } from "@/server/repositories/accounts";
import type { TransactionWithPostings } from "@/server/services/transactions";
import { buildTransactionTableRows } from "./transaction-rows";

const now = "2026-09-03T00:00:00.000Z";

function account(
  id: string,
  name: string,
  currencyId: string,
  instrumentType: string = "BANK",
): AccountRow {
  return {
    id,
    profileId: "profile-1",
    currencyId,
    name,
    classification: "ASSET",
    instrumentType,
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
  postings: { accountId: string; debit: number; credit: number; quantity?: number; price?: number }[],
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
      // Mirrors the domain's own fallback (price 1, quantity = the
      // posting's own amount) unless a test explicitly overrides it —
      // matches what a real, ordinary (non-Instrument, non-Conversion)
      // posting always looks like.
      quantity: p.quantity ?? p.debit ?? p.credit,
      price: p.price ?? 1,
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

describe("buildTransactionTableRows — FX secondary info (Phase 5 transaction-list decision)", () => {
  const bank = account("bank", "HDFC Bank", "inr-currency");
  const jpyCash = account("jpy-cash", "JPY in hand", "jpy-currency");
  const accountsById = new Map([
    ["bank", bank],
    ["jpy-cash", jpyCash],
  ]);
  const currenciesById = new Map([
    ["inr-currency", { code: "INR", symbol: "₹", minorUnitScale: 2 }],
    ["jpy-currency", { code: "JPY", symbol: "¥", minorUnitScale: 0 }],
  ]);
  const fallbackCurrency = { code: "INR", symbol: "₹", minorUnitScale: 2 };

  it("shows the destination currency badge + effective rate for a Currency Conversion To leg", () => {
    const txn = transaction("t1", [
      { accountId: "bank", debit: 0, credit: 1000000 }, // ₹10,000
      { accountId: "jpy-cash", debit: 15000, credit: 0, price: 10000 / 15000 }, // ¥15,000
    ]);
    const [row] = buildTransactionTableRows([txn], accountsById, fallbackCurrency, currenciesById);
    expect(row!.toLines[0]!.secondary).toEqual({ kind: "fx", currencyCode: "JPY", rate: "1.5" });
  });

  it("shows no secondary info for an ordinary same-currency, non-Instrument transaction", () => {
    const txn = transaction("t1", [
      { accountId: "bank", debit: 0, credit: 2000 },
      { accountId: "bank", debit: 2000, credit: 0 },
    ]);
    const [row] = buildTransactionTableRows([txn], accountsById, fallbackCurrency, currenciesById);
    expect(row!.toLines[0]!.secondary).toBeUndefined();
  });
});
