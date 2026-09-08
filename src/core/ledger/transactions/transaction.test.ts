import { describe, expect, it } from "vitest";
import { makeRational, type Rational } from "../../shared/rational";
import { computeBaseAmounts } from "./baseAmount";
import { validateTransaction, type AccountRef, type BaseCurrency } from "./transaction";
import type { PostingInput } from "./posting";

// Fixture accounts mirror the worked examples in docs/02-domain-model.md,
// all owned by the same Profile and all INR unless noted (Currency
// Catalogue, 2026-09-03 delta). ZZZ is a deliberately-fake code to exercise
// UNSUPPORTED_CURRENCY.
const PROFILE = "profile-1";
const OTHER_PROFILE = "profile-2";
const BASE_CURRENCY: BaseCurrency = { id: "currency-INR", code: "INR", scale: 2 };

const CURRENCY_SCALE: Record<string, number> = { INR: 2, JPY: 0, USD: 2, ZZZ: 2 };

function account(id: string, profileId = PROFILE, currencyCode = "INR"): AccountRef {
  return { id, profileId, currencyId: `currency-${currencyCode}`, currencyCode, currencyScale: CURRENCY_SCALE[currencyCode] };
}

const accounts = new Map<string, AccountRef>(
  [
    account("hdfc-bank"),
    account("icici-bank"),
    account("food-expense"),
    account("salary-income"),
    account("hdfc-credit-card"),
    account("receivable"),
    account("opening-balance"),
    account("other-profile-bank", OTHER_PROFILE),
    account("jpy-bank", PROFILE, "JPY"),
    account("usd-bank", PROFILE, "USD"),
    account("zzz-bank", PROFILE, "ZZZ"),
  ].map((a) => [a.id, a]),
);

const ONE: Rational = { num: 1, denom: 1 };

// A leg spec for buildTransaction: signed `units` (positive = debit,
// negative = credit — the new sign convention) and its own price ratio
// into the Base Currency (defaults to 1/1, the same-currency case).
interface LegSpec {
  accountId: string;
  units: number;
  price?: Rational;
}

function debitLeg(accountId: string, amount: number, price: Rational = ONE): LegSpec {
  return { accountId, units: amount, price };
}
function creditLeg(accountId: string, amount: number, price: Rational = ONE): LegSpec {
  return { accountId, units: -amount, price };
}

// Builds a real PostingInput[] the way the service layer actually would:
// baseAmount for every leg is computed via the residual-ownership rule
// (baseAmount.ts), not hand-picked — so a fixture built this way can never
// accidentally be "unbalanced" (the construction guarantees SUM === 0).
// `primaryIndex` defaults to the transaction's one credit-side leg (this
// codebase's own "From = credit side" convention).
function buildTransaction(legs: readonly LegSpec[], primaryIndex?: number): PostingInput[] {
  const resolvedPrimaryIndex = primaryIndex ?? legs.findIndex((leg) => leg.units < 0);
  const baseAmounts = computeBaseAmounts(
    legs.map((leg) => ({ units: leg.units, price: leg.price ?? ONE })),
    resolvedPrimaryIndex,
  );
  return legs.map((leg, index) => ({
    accountId: leg.accountId,
    units: leg.units,
    priceNum: (leg.price ?? ONE).num,
    priceDenom: (leg.price ?? ONE).denom,
    baseAmount: baseAmounts[index]!,
  }));
}

// docs/06-architecture.md "Testing" checklist, treated literally.
describe("validateTransaction — architecture testing checklist", () => {
  it("accepts a balanced transaction", () => {
    const violations = validateTransaction(
      { profileId: PROFILE, postings: buildTransaction([debitLeg("food-expense", 2000), creditLeg("hdfc-bank", 2000)]) },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toEqual([]);
  });

  it("rejects an unbalanced transaction (malformed input, not reachable through normal construction)", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "food-expense", units: 2000, priceNum: 1, priceDenom: 1, baseAmount: 2000 },
          { accountId: "hdfc-bank", units: -1900, priceNum: 1, priceDenom: 1, baseAmount: -1900 },
        ],
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toContainEqual({ code: "UNBALANCED", totalDebit: 2000, totalCredit: 1900 });
  });

  it("accepts an expense", () => {
    const violations = validateTransaction(
      { profileId: PROFILE, postings: buildTransaction([debitLeg("food-expense", 2000), creditLeg("hdfc-bank", 2000)]) },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toEqual([]);
  });

  it("accepts income", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: buildTransaction([debitLeg("hdfc-bank", 100000), creditLeg("salary-income", 100000)]),
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toEqual([]);
  });

  it("accepts a transfer", () => {
    const violations = validateTransaction(
      { profileId: PROFILE, postings: buildTransaction([debitLeg("icici-bank", 20000), creditLeg("hdfc-bank", 20000)]) },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toEqual([]);
  });

  it("accepts a credit-card purchase", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: buildTransaction([debitLeg("food-expense", 5000), creditLeg("hdfc-credit-card", 5000)]),
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toEqual([]);
  });

  it("accepts a credit-card payment (not another expense)", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: buildTransaction([debitLeg("hdfc-credit-card", 5000), creditLeg("hdfc-bank", 5000)]),
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toEqual([]);
  });

  it("accepts a multi-posting (split) transaction", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: buildTransaction([
          debitLeg("food-expense", 2000),
          debitLeg("receivable", 3000),
          creditLeg("hdfc-credit-card", 5000),
        ]),
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toEqual([]);
  });

  it("accepts an opening balance via the Balancing account", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: buildTransaction([debitLeg("hdfc-bank", 250000), creditLeg("opening-balance", 250000)]),
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toEqual([]);
  });

  it("edit preserves balance: a balanced replacement set is accepted", () => {
    const original = {
      profileId: PROFILE,
      postings: buildTransaction([debitLeg("food-expense", 2000), creditLeg("hdfc-bank", 2000)]),
    };
    expect(validateTransaction(original, accounts, BASE_CURRENCY)).toEqual([]);

    const edited = {
      profileId: PROFILE,
      postings: buildTransaction([debitLeg("food-expense", 2500), creditLeg("hdfc-bank", 2500)]),
    };
    expect(validateTransaction(edited, accounts, BASE_CURRENCY)).toEqual([]);
  });

  it("delete does not corrupt balance: a partially deleted posting set fails validation", () => {
    const fullyPosted = {
      profileId: PROFILE,
      postings: buildTransaction([
        debitLeg("food-expense", 2000),
        debitLeg("receivable", 3000),
        creditLeg("hdfc-credit-card", 5000),
      ]),
    };
    expect(validateTransaction(fullyPosted, accounts, BASE_CURRENCY)).toEqual([]);

    // Dropping one posting from an otherwise balanced set (the shape a
    // non-atomic delete would leave behind) — hand-crafted, since a real
    // partial delete is exactly the malformed-input case buildTransaction
    // can't produce.
    const afterNonAtomicPartialDelete = {
      profileId: PROFILE,
      postings: [
        { accountId: "food-expense", units: 2000, priceNum: 1, priceDenom: 1, baseAmount: 2000 },
        { accountId: "hdfc-credit-card", units: -5000, priceNum: 1, priceDenom: 1, baseAmount: -5000 },
      ],
    };
    const violations = validateTransaction(afterNonAtomicPartialDelete, accounts, BASE_CURRENCY);
    expect(violations).toContainEqual({ code: "UNBALANCED", totalDebit: 2000, totalCredit: 5000 });
  });
});

describe("validateTransaction — ownership and currency invariants", () => {
  it("rejects a posting whose account belongs to a different Profile", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: buildTransaction([debitLeg("other-profile-bank", 1000), creditLeg("food-expense", 1000)]),
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toContainEqual({ code: "OWNERSHIP_MISMATCH", accountId: "other-profile-bank" });
  });

  it("rejects a posting against an account whose currency isn't in the Currency Catalogue", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: buildTransaction([debitLeg("zzz-bank", 1000), creditLeg("food-expense", 1000)]),
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toContainEqual({ code: "UNSUPPORTED_CURRENCY", accountId: "zzz-bank", currencyCode: "ZZZ" });
  });

  it("rejects a posting against an unknown account", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "does-not-exist", units: 1000, priceNum: 1, priceDenom: 1, baseAmount: 1000 },
          { accountId: "food-expense", units: -1000, priceNum: 1, priceDenom: 1, baseAmount: -1000 },
        ],
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toContainEqual({ code: "ACCOUNT_NOT_FOUND", accountId: "does-not-exist" });
  });

  it("rejects fewer than two postings", () => {
    const violations = validateTransaction(
      { profileId: PROFILE, postings: [{ accountId: "food-expense", units: 2000, priceNum: 1, priceDenom: 1, baseAmount: 2000 }] },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toContainEqual({ code: "TOO_FEW_POSTINGS" });
  });
});

describe("validateTransaction — Base Currency price/baseAmount invariants", () => {
  it("rejects a non-1/1 price on a posting whose account currency matches the Base Currency", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "food-expense", units: 2000, priceNum: 2, priceDenom: 1, baseAmount: 2000 },
          { accountId: "hdfc-bank", units: -2000, priceNum: 1, priceDenom: 1, baseAmount: -2000 },
        ],
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toContainEqual({ code: "PRICE_MUST_BE_ONE", accountId: "food-expense" });
  });

  it("a Base Currency posting's baseAmount deviating from units is not itself a violation (the primary leg legitimately absorbs residual)", () => {
    // food-expense (non-primary, base currency) baseAmount deliberately off
    // by 1 from its own units — not independently checked; only the overall
    // SUM(base_amount) === 0 balance rule can catch a genuinely broken value.
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "food-expense", units: 2000, priceNum: 1, priceDenom: 1, baseAmount: 1999 },
          { accountId: "hdfc-bank", units: -2000, priceNum: 1, priceDenom: 1, baseAmount: -1999 },
        ],
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toEqual([]);
  });
});

describe("validateTransaction — genuine N-leg multi-currency (no currency-count gate)", () => {
  it("accepts a single foreign leg reconciled exactly against the Base Currency (today's old Conversion shape)", () => {
    const inrCredit = 1000000; // ₹10,000
    const jpyDebit = 15000; // ¥15,000
    const price = makeRational(inrCredit, jpyDebit);
    const violations = validateTransaction(
      { profileId: PROFILE, postings: buildTransaction([creditLeg("hdfc-bank", inrCredit), debitLeg("jpy-bank", jpyDebit, price)]) },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toEqual([]);
  });

  it("accepts a genuine 1-From/N-To transaction with two independently-priced foreign legs", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: buildTransaction([
          creditLeg("hdfc-bank", 1000000), // ₹10,000 primary
          debitLeg("jpy-bank", 15000, makeRational(1, 3)), // an arbitrary JPY rate
          debitLeg("usd-bank", 5000, makeRational(83, 1)), // an arbitrary USD rate
        ]),
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toEqual([]);
  });

  it("two debit-side foreign legs against one credit-side Base Currency leg still balances", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: buildTransaction([
          creditLeg("hdfc-bank", 20000),
          debitLeg("jpy-bank", 10000, makeRational(1, 2)),
          debitLeg("usd-bank", 100, makeRational(150, 1)),
        ]),
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toEqual([]);
  });

  it("still enforces ownership/currency-support on each leg", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: buildTransaction([creditLeg("hdfc-bank", 1000000), debitLeg("zzz-bank", 1500000)]),
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toContainEqual({ code: "UNSUPPORTED_CURRENCY", accountId: "zzz-bank", currencyCode: "ZZZ" });
  });

  it("still enforces posting shape (nonzero units) on each leg", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "hdfc-bank", units: -1000000, priceNum: 1, priceDenom: 1, baseAmount: -1000000 },
          { accountId: "jpy-bank", units: 0, priceNum: 1, priceDenom: 1, baseAmount: 1000000 },
        ],
      },
      accounts,
      BASE_CURRENCY,
    );
    expect(violations).toContainEqual({ code: "INVALID_POSTING", accountId: "jpy-bank", reason: "INVALID_UNITS" });
  });
});
