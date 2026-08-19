import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { findCurrenciesByMember } from "../repositories/currencies";
import { createMember } from "./members";
import { createCurrency, listCurrencies } from "./currencies";
import { UnsupportedCurrencyError } from "./errors";

describe("createCurrency", () => {
  it("persists an INR Currency scoped to its Member", () => {
    const db = createTestDb();
    const member = createMember(db, { name: "Amit" });

    const currency = createCurrency(db, {
      memberId: member.id,
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });

    expect(currency.memberId).toBe(member.id);
    expect(currency.code).toBe("INR");
  });

  it("rejects a non-INR currency code (MVP-only, ADR-020)", () => {
    const db = createTestDb();
    const member = createMember(db, { name: "Amit" });

    expect(() =>
      createCurrency(db, {
        memberId: member.id,
        code: "JPY",
        name: "Japanese Yen",
        symbol: "¥",
        minorUnitScale: 0,
      }),
    ).toThrow(UnsupportedCurrencyError);
  });

  it("is Currency creation as a step separate from Member creation", () => {
    // Resolved 2026-08-15 (HANDOFF.md open decisions #1): createMember never
    // implicitly creates a Currency row.
    const db = createTestDb();
    const member = createMember(db, { name: "Amit" });
    expect(findCurrenciesByMember(db, member.id)).toEqual([]);
  });
});

describe("listCurrencies", () => {
  it("scopes to the given Member", () => {
    const db = createTestDb();
    const member = createMember(db, { name: "Amit" });
    const other = createMember(db, { name: "Partner" });
    createCurrency(db, {
      memberId: member.id,
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });

    expect(listCurrencies(db, member.id)).toHaveLength(1);
    expect(listCurrencies(db, other.id)).toEqual([]);
  });
});
