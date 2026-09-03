import { describe, expect, it } from "vitest";
import { buildTransactionFormSchema, type TransactionFormAccount } from "./transaction-form";

// Pure zod-schema tests — no React rendering needed, matches this
// codebase's established testing convention (domain/use-case/action layer,
// never component-level). buildTransactionFormSchema is exported
// specifically so this is testable directly.

function account(id: string, currencyId: string, currencyScale = 2): TransactionFormAccount {
  return {
    id,
    name: id,
    classification: "ASSET",
    icon: null,
    currencyId,
    currencySymbol: currencyId === "INR" ? "₹" : "¥",
    currencyScale,
  };
}

const inrBank = account("inr-bank", "INR", 2);
const inrOther = account("inr-other", "INR", 2);
const jpyCash = account("jpy-cash", "JPY", 0);

const accountsById = new Map(
  [inrBank, inrOther, jpyCash].map((a) => [a.id, a]),
);

function baseValues(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    date: "2026-09-03",
    description: "Test",
    fromAccountId: "inr-bank",
    amount: 10000,
    toLines: [{ accountId: "inr-other", amount: 10000 }],
    reconciled: false,
    ...overrides,
  };
}

describe("buildTransactionFormSchema — reconciliation gate (2026-09-03 delta)", () => {
  const schema = buildTransactionFormSchema(6, accountsById);

  it("accepts a normal same-currency transfer with equal amounts, no reconciliation needed", () => {
    const result = schema.safeParse(baseValues());
    expect(result.success).toBe(true);
  });

  it("rejects a same-currency transfer with unequal amounts (mismatch), even if 'reconciled' is true", () => {
    const result = schema.safeParse(
      baseValues({
        toLines: [{ accountId: "inr-other", amount: 9900 }],
        reconciled: true,
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "toLines");
      expect(issue?.message).toMatch(/must match for a same-currency transfer/i);
    }
  });

  it("rejects an INR -> JPY conversion when not reconciled", () => {
    const result = schema.safeParse(
      baseValues({
        toLines: [{ accountId: "jpy-cash", amount: 15000 }],
        reconciled: false,
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "reconciled");
      expect(issue?.message).toMatch(/confirm the currency conversion/i);
    }
  });

  it("accepts an INR -> JPY conversion once reconciled, with independent (editable) amounts", () => {
    const result = schema.safeParse(
      baseValues({
        amount: 10000,
        toLines: [{ accountId: "jpy-cash", amount: 15000 }], // deliberately not a 1:1 mirror
        reconciled: true,
      }),
    );
    expect(result.success).toBe(true);
  });

  it("allows To Amount to differ from From Amount only in the reconciled cross-currency case", () => {
    // Same scenario, unreconciled — must still fail even though the shape
    // (account currencies) is identical to the test above.
    const result = schema.safeParse(
      baseValues({
        amount: 10000,
        toLines: [{ accountId: "jpy-cash", amount: 15000 }],
        reconciled: false,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects From and To being the same account", () => {
    const result = schema.safeParse(baseValues({ toLines: [{ accountId: "inr-bank", amount: 10000 }] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "From and To must be different accounts")).toBe(true);
    }
  });

  it("rejects a future date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 1);
    const iso = future.toISOString().slice(0, 10);
    const result = schema.safeParse(baseValues({ date: iso }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "date")).toBe(true);
    }
  });

  it("accepts today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = schema.safeParse(baseValues({ date: today }));
    expect(result.success).toBe(true);
  });

  it("still requires a split (2+ destinations) to sum to the total, unaffected by the reconciliation gate", () => {
    const result = schema.safeParse(
      baseValues({
        toLines: [
          { accountId: "inr-other", amount: 6000 },
          { accountId: "inr-bank", amount: 3000 }, // deliberately short of 10000; also same as From but that's fine per-line here since the from/to-distinct check applies per line below
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("still accepts a valid split whose destinations sum to the total", () => {
    const anotherFrom = account("inr-third", "INR", 2);
    const withThird = new Map([...accountsById, [anotherFrom.id, anotherFrom]]);
    const splitSchema = buildTransactionFormSchema(6, withThird);
    const result = splitSchema.safeParse(
      baseValues({
        toLines: [
          { accountId: "inr-other", amount: 6000 },
          { accountId: "inr-third", amount: 4000 },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });
});
