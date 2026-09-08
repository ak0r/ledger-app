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
    currencySymbol: currencyId === "INR" ? "₹" : currencyId === "JPY" ? "¥" : "$",
    currencyScale,
  };
}

const inrBank = account("inr-bank", "INR", 2);
const inrOther = account("inr-other", "INR", 2);
const jpyCash = account("jpy-cash", "JPY", 0);
const usdCash = account("usd-cash", "USD", 2);

const accountsById = new Map([inrBank, inrOther, jpyCash, usdCash].map((a) => [a.id, a]));
const BASE_CURRENCY_ID = "INR";

function baseValues(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    date: "2026-09-03",
    description: "Test",
    fromAccountId: "inr-bank",
    amount: 10000,
    toLines: [{ accountId: "inr-other", amount: 10000 }],
    ...overrides,
  };
}

describe("buildTransactionFormSchema — same-Base-Currency transfers (no FX involved)", () => {
  const schema = buildTransactionFormSchema(6, accountsById, BASE_CURRENCY_ID);

  it("accepts a normal same-currency transfer with equal amounts", () => {
    const result = schema.safeParse(baseValues());
    expect(result.success).toBe(true);
  });

  it("rejects a same-currency transfer with unequal amounts", () => {
    const result = schema.safeParse(baseValues({ toLines: [{ accountId: "inr-other", amount: 9900 }] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "toLines");
      expect(issue?.message).toMatch(/must match for a same-currency transfer/i);
    }
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

  it("still requires an all-same-currency split (2+ destinations) to sum to the total", () => {
    const result = schema.safeParse(
      baseValues({
        toLines: [
          { accountId: "inr-other", amount: 6000 },
          { accountId: "inr-bank", amount: 3000 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("still accepts a valid all-same-currency split whose destinations sum to the total", () => {
    const anotherFrom = account("inr-third", "INR", 2);
    const withThird = new Map([...accountsById, [anotherFrom.id, anotherFrom]]);
    const splitSchema = buildTransactionFormSchema(6, withThird, BASE_CURRENCY_ID);
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

describe("buildTransactionFormSchema — a foreign destination line (Transaction Form FX UX delta)", () => {
  const schema = buildTransactionFormSchema(6, accountsById, BASE_CURRENCY_ID);

  it("rejects a foreign line with neither a rate nor a confirmation", () => {
    const result = schema.safeParse(baseValues({ toLines: [{ accountId: "jpy-cash", amount: 15000 }] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "toLines.0.rateDecimal")).toBe(true);
      expect(result.error.issues.some((i) => i.path.join(".") === "toLines.0.reconciled")).toBe(true);
    }
  });

  it("rejects a foreign line with a rate but no confirmation", () => {
    const result = schema.safeParse(
      baseValues({ toLines: [{ accountId: "jpy-cash", amount: 15000, rateDecimal: 0.65 }] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "toLines.0.reconciled")).toBe(true);
    }
  });

  it("accepts a foreign line with a positive rate and an explicit confirmation, independent of any amount relationship", () => {
    const result = schema.safeParse(
      baseValues({
        amount: 10000,
        toLines: [{ accountId: "jpy-cash", amount: 15000, rateDecimal: 0.65, reconciled: true }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("never requires the raw amount sum to match once any line is foreign — currencies aren't summable", () => {
    const result = schema.safeParse(
      baseValues({
        amount: 999999,
        toLines: [{ accountId: "jpy-cash", amount: 15000, rateDecimal: 0.65, reconciled: true }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a genuine N-leg split with two independently-priced foreign lines", () => {
    const result = schema.safeParse(
      baseValues({
        toLines: [
          { accountId: "jpy-cash", amount: 9000, rateDecimal: 0.65, reconciled: true },
          { accountId: "usd-cash", amount: 5000, rateDecimal: 83, reconciled: true },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a genuine N-leg split when only one of two foreign lines is confirmed", () => {
    const result = schema.safeParse(
      baseValues({
        toLines: [
          { accountId: "jpy-cash", amount: 9000, rateDecimal: 0.65, reconciled: true },
          { accountId: "usd-cash", amount: 5000, rateDecimal: 83 },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "toLines.1.reconciled")).toBe(true);
    }
  });
});
