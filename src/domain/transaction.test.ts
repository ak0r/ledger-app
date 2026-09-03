import { describe, expect, it } from "vitest";
import { validateTransaction, type AccountRef } from "./transaction";

// Fixture accounts mirror the worked examples in docs/02-domain-model.md,
// all owned by the same Profile and all INR unless noted (Currency
// Catalogue, 2026-09-03 delta — JPY is a real supported currency now,
// ZZZ is a deliberately-fake code to exercise UNSUPPORTED_CURRENCY).
const PROFILE = "profile-1";
const OTHER_PROFILE = "profile-2";

function account(id: string, profileId = PROFILE, currencyCode = "INR"): AccountRef {
  return { id, profileId, currencyCode };
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
    account("zzz-bank", PROFILE, "ZZZ"),
  ].map((a) => [a.id, a]),
);

// docs/06-architecture.md "Testing" checklist, treated literally per
// docs/11-implementation-plan.md Phase 3.
describe("validateTransaction — architecture testing checklist", () => {
  it("accepts a balanced transaction", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "food-expense", debit: 2000, credit: 0 },
          { accountId: "hdfc-bank", debit: 0, credit: 2000 },
        ],
      },
      accounts,
    );
    expect(violations).toEqual([]);
  });

  it("rejects an unbalanced transaction", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "food-expense", debit: 2000, credit: 0 },
          { accountId: "hdfc-bank", debit: 0, credit: 1900 },
        ],
      },
      accounts,
    );
    expect(violations).toContainEqual({
      code: "UNBALANCED",
      totalDebit: 2000,
      totalCredit: 1900,
    });
  });

  it("accepts an expense", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "food-expense", debit: 2000, credit: 0 },
          { accountId: "hdfc-bank", debit: 0, credit: 2000 },
        ],
      },
      accounts,
    );
    expect(violations).toEqual([]);
  });

  it("accepts income", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "hdfc-bank", debit: 100000, credit: 0 },
          { accountId: "salary-income", debit: 0, credit: 100000 },
        ],
      },
      accounts,
    );
    expect(violations).toEqual([]);
  });

  it("accepts a transfer", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "icici-bank", debit: 20000, credit: 0 },
          { accountId: "hdfc-bank", debit: 0, credit: 20000 },
        ],
      },
      accounts,
    );
    expect(violations).toEqual([]);
  });

  it("accepts a credit-card purchase", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "food-expense", debit: 5000, credit: 0 },
          { accountId: "hdfc-credit-card", debit: 0, credit: 5000 },
        ],
      },
      accounts,
    );
    expect(violations).toEqual([]);
  });

  it("accepts a credit-card payment (not another expense)", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "hdfc-credit-card", debit: 5000, credit: 0 },
          { accountId: "hdfc-bank", debit: 0, credit: 5000 },
        ],
      },
      accounts,
    );
    expect(violations).toEqual([]);
  });

  it("accepts a multi-posting (split) transaction", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "food-expense", debit: 2000, credit: 0 },
          { accountId: "receivable", debit: 3000, credit: 0 },
          { accountId: "hdfc-credit-card", debit: 0, credit: 5000 },
        ],
      },
      accounts,
    );
    expect(violations).toEqual([]);
  });

  it("accepts an opening balance via the Balancing account", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "hdfc-bank", debit: 250000, credit: 0 },
          { accountId: "opening-balance", debit: 0, credit: 250000 },
        ],
      },
      accounts,
    );
    expect(violations).toEqual([]);
  });

  // "Edit" has no persisted draft/partial state (ADR-023) — an edit is a
  // full replace of the posting set (docs/11-implementation-plan.md open
  // decision #2, current lean). The domain guarantee edit relies on is that
  // the *new* posting set is independently revalidated, exactly like a
  // fresh transaction — it is never trusted just because the prior version
  // was balanced. Full atomic-swap integration coverage belongs to Phase 4.
  it("edit preserves balance: a balanced replacement set is accepted", () => {
    const original = {
      profileId: PROFILE,
      postings: [
        { accountId: "food-expense", debit: 2000, credit: 0 },
        { accountId: "hdfc-bank", debit: 0, credit: 2000 },
      ],
    };
    expect(validateTransaction(original, accounts)).toEqual([]);

    const edited = {
      profileId: PROFILE,
      postings: [
        { accountId: "food-expense", debit: 2500, credit: 0 },
        { accountId: "hdfc-bank", debit: 0, credit: 2500 },
      ],
    };
    expect(validateTransaction(edited, accounts)).toEqual([]);
  });

  it("edit preserves balance: an unbalanced replacement set is rejected", () => {
    const edited = {
      profileId: PROFILE,
      postings: [
        { accountId: "food-expense", debit: 2500, credit: 0 },
        { accountId: "hdfc-bank", debit: 0, credit: 2000 },
      ],
    };
    const violations = validateTransaction(edited, accounts);
    expect(violations).toContainEqual({
      code: "UNBALANCED",
      totalDebit: 2500,
      totalCredit: 2000,
    });
  });

  // Deletion is a hard delete of the whole aggregate, atomically, in Phase 4
  // (rule #9, ADR-019) — the domain layer performs no persistence. What the
  // domain guarantees is the flip side: it can never validate a partially
  // deleted aggregate as balanced. Dropping one posting from an otherwise
  // balanced transaction — the shape a non-atomic delete would leave behind
  // — always fails validation, which is why deletion must stay atomic.
  it("delete does not corrupt balance: a partially deleted posting set fails validation", () => {
    const fullyPosted = {
      profileId: PROFILE,
      postings: [
        { accountId: "food-expense", debit: 2000, credit: 0 },
        { accountId: "receivable", debit: 3000, credit: 0 },
        { accountId: "hdfc-credit-card", debit: 0, credit: 5000 },
      ],
    };
    expect(validateTransaction(fullyPosted, accounts)).toEqual([]);

    const afterNonAtomicPartialDelete = {
      profileId: PROFILE,
      postings: [
        { accountId: "food-expense", debit: 2000, credit: 0 },
        { accountId: "hdfc-credit-card", debit: 0, credit: 5000 },
      ],
    };
    const violations = validateTransaction(afterNonAtomicPartialDelete, accounts);
    expect(violations).toContainEqual({
      code: "UNBALANCED",
      totalDebit: 2000,
      totalCredit: 5000,
    });
  });
});

describe("validateTransaction — ownership and currency invariants", () => {
  it("rejects a posting whose account belongs to a different Profile", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "other-profile-bank", debit: 1000, credit: 0 },
          { accountId: "food-expense", debit: 0, credit: 1000 },
        ],
      },
      accounts,
    );
    expect(violations).toContainEqual({
      code: "OWNERSHIP_MISMATCH",
      accountId: "other-profile-bank",
    });
  });

  it("rejects a posting against an account whose currency isn't in the Currency Catalogue", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "zzz-bank", debit: 1000, credit: 0 },
          { accountId: "food-expense", debit: 0, credit: 1000 },
        ],
      },
      accounts,
    );
    expect(violations).toContainEqual({
      code: "UNSUPPORTED_CURRENCY",
      accountId: "zzz-bank",
      currencyCode: "ZZZ",
    });
  });

  it("rejects a posting against an unknown account", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "does-not-exist", debit: 1000, credit: 0 },
          { accountId: "food-expense", debit: 0, credit: 1000 },
        ],
      },
      accounts,
    );
    expect(violations).toContainEqual({
      code: "ACCOUNT_NOT_FOUND",
      accountId: "does-not-exist",
    });
  });

  it("rejects fewer than two postings", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [{ accountId: "food-expense", debit: 2000, credit: 0 }],
      },
      accounts,
    );
    expect(violations).toContainEqual({ code: "TOO_FEW_POSTINGS" });
  });
});

describe("validateTransaction — mixed-currency rejection (non-Conversion shapes)", () => {
  it("accepts a same-currency balanced transaction", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "food-expense", debit: 2000, credit: 0 },
          { accountId: "hdfc-bank", debit: 0, credit: 2000 },
        ],
      },
      accounts,
    );
    expect(violations).toEqual([]);
  });

  it("rejects three postings across two currencies as MIXED_CURRENCY_UNSUPPORTED (not the recognised 2-posting Conversion shape)", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "hdfc-bank", debit: 0, credit: 10000 },
          { accountId: "jpy-bank", debit: 5000, credit: 0 },
          { accountId: "food-expense", debit: 5000, credit: 0 },
        ],
      },
      accounts,
    );
    expect(violations).toContainEqual({ code: "MIXED_CURRENCY_UNSUPPORTED" });
    expect(violations).not.toContainEqual(expect.objectContaining({ code: "UNBALANCED" }));
  });

  it("rejects two same-direction postings across two currencies as MIXED_CURRENCY_UNSUPPORTED (not one debit + one credit)", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "hdfc-bank", debit: 10000, credit: 0 },
          { accountId: "jpy-bank", debit: 15000, credit: 0 },
        ],
      },
      accounts,
    );
    expect(violations).toContainEqual({ code: "MIXED_CURRENCY_UNSUPPORTED" });
  });

  it("missing/invalid account handling is unchanged: unknown account still reports ACCOUNT_NOT_FOUND", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "does-not-exist", debit: 1000, credit: 0 },
          { accountId: "food-expense", debit: 0, credit: 1000 },
        ],
      },
      accounts,
    );
    expect(violations).toContainEqual({ code: "ACCOUNT_NOT_FOUND", accountId: "does-not-exist" });
    expect(violations).not.toContainEqual(
      expect.objectContaining({ code: "MIXED_CURRENCY_UNSUPPORTED" }),
    );
  });

  it("missing/invalid account handling is unchanged: other-profile ownership mismatch still reported", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "other-profile-bank", debit: 1000, credit: 0 },
          { accountId: "food-expense", debit: 0, credit: 1000 },
        ],
      },
      accounts,
    );
    expect(violations).toContainEqual({ code: "OWNERSHIP_MISMATCH", accountId: "other-profile-bank" });
  });
});

describe("validateTransaction — Currency Conversion shape", () => {
  it("accepts exactly two postings, two currencies, one debit + one credit — no balance check applies", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "hdfc-bank", debit: 0, credit: 1000000 }, // ₹10,000 out
          { accountId: "jpy-bank", debit: 1500000, credit: 0 }, // ¥15,000 in — deliberately unequal, that's the point
        ],
      },
      accounts,
    );
    expect(violations).toEqual([]);
  });

  it("still enforces ownership/currency-support on each leg of a Conversion", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "hdfc-bank", debit: 0, credit: 1000000 },
          { accountId: "zzz-bank", debit: 1500000, credit: 0 },
        ],
      },
      accounts,
    );
    expect(violations).toContainEqual({
      code: "UNSUPPORTED_CURRENCY",
      accountId: "zzz-bank",
      currencyCode: "ZZZ",
    });
  });

  it("still enforces posting shape (non-negative, exactly one side) on each leg of a Conversion", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "hdfc-bank", debit: 0, credit: 1000000 },
          { accountId: "jpy-bank", debit: 1500000, credit: 500000 },
        ],
      },
      accounts,
    );
    expect(violations).toContainEqual({
      code: "INVALID_POSTING",
      accountId: "jpy-bank",
      reason: "NOT_EXACTLY_ONE_SIDE",
    });
  });

  it("a same-currency pair is never treated as a Conversion — ordinary balance rule still applies", () => {
    const violations = validateTransaction(
      {
        profileId: PROFILE,
        postings: [
          { accountId: "hdfc-bank", debit: 0, credit: 1000 },
          { accountId: "icici-bank", debit: 900, credit: 0 },
        ],
      },
      accounts,
    );
    expect(violations).toContainEqual({ code: "UNBALANCED", totalDebit: 900, totalCredit: 1000 });
  });
});
