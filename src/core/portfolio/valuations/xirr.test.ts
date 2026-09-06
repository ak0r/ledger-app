import { describe, expect, it } from "vitest";
import { cashflowsFromTransactions, computeXirr } from "./xirr";

describe("computeXirr", () => {
  it("returns null for fewer than two flows", () => {
    expect(computeXirr([{ date: "2025-01-01", amount: -1000 }])).toBeNull();
  });

  it("returns null when every flow has the same sign — no root to find", () => {
    expect(
      computeXirr([
        { date: "2025-01-01", amount: -1000 },
        { date: "2025-06-01", amount: -500 },
      ]),
    ).toBeNull();
  });

  it("solves a known case — ₹1000 invested, ₹1100 back exactly one non-leap year later is 10%", () => {
    const rate = computeXirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.1, 4);
  });

  it("solves a loss case — a negative rate for money returned below what was invested", () => {
    const rate = computeXirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 900 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeLessThan(0);
  });
});

describe("cashflowsFromTransactions", () => {
  it("negates invested amounts into outflows and appends the terminal value as an inflow", () => {
    const flows = cashflowsFromTransactions([{ date: "2025-01-01", amount: 1000 }], "2026-01-01", 1100);
    expect(flows).toEqual([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ]);
  });

  it("nets same-date rows into a single flow", () => {
    const flows = cashflowsFromTransactions(
      [
        { date: "2025-01-01", amount: 600 },
        { date: "2025-01-01", amount: 400 },
      ],
      "2026-01-01",
      1100,
    );
    expect(flows).toEqual([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ]);
  });

  it("feeds computeXirr the same known-case answer as building flows by hand", () => {
    const flows = cashflowsFromTransactions([{ date: "2025-01-01", amount: 1000 }], "2026-01-01", 1100);
    expect(computeXirr(flows)!).toBeCloseTo(0.1, 4);
  });
});
