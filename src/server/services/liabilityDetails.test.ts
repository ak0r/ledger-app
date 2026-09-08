import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createAccount } from "./accounts";
import { NotFoundError } from "./errors";
import { getCreditCardDetails, getLoanDetails, upsertCreditCardDetails, upsertLoanDetails } from "./liabilityDetails";

function setUp(db: ReturnType<typeof createTestDb>) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, { profileId: profile.id, code: "INR", name: "Indian Rupee", symbol: "₹", minorUnitScale: 2 });
  const card = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "Credit Card", classification: "LIABILITY", accountType: "CREDIT_CARD" });
  const loan = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "Home Loan", classification: "LIABILITY", accountType: "LOAN" });
  return { profile, currency, card, loan };
}

describe("getCreditCardDetails / upsertCreditCardDetails", () => {
  it("returns undefined when no details have been set yet", () => {
    const db = createTestDb();
    const { profile, card } = setUp(db);
    expect(getCreditCardDetails(db, card.id, profile.id)).toBeUndefined();
  });

  it("round-trips major-unit money fields through minor-unit storage", () => {
    const db = createTestDb();
    const { profile, card } = setUp(db);
    const details = upsertCreditCardDetails(db, {
      accountId: card.id,
      profileId: profile.id,
      creditLimit: 150000,
      statementEndDay: 20,
      dueDay: 5,
      network: "VISA",
      last4: "1234",
      expirationDate: "2029-12",
    });
    expect(details).toEqual({
      accountId: card.id,
      creditLimit: 150000,
      statementEndDay: 20,
      dueDay: 5,
      network: "VISA",
      last4: "1234",
      expirationDate: "2029-12",
    });
    expect(getCreditCardDetails(db, card.id, profile.id)).toEqual(details);
  });

  it("upserting again replaces the existing row rather than duplicating it", () => {
    const db = createTestDb();
    const { profile, card } = setUp(db);
    upsertCreditCardDetails(db, { accountId: card.id, profileId: profile.id, creditLimit: 100000 });
    const updated = upsertCreditCardDetails(db, { accountId: card.id, profileId: profile.id, creditLimit: 200000, network: "MASTERCARD" });
    expect(updated.creditLimit).toBe(200000);
    expect(updated.network).toBe("MASTERCARD");
    expect(getCreditCardDetails(db, card.id, profile.id)?.creditLimit).toBe(200000);
  });

  it("throws NotFoundError for an unknown account", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    expect(() => upsertCreditCardDetails(db, { accountId: "does-not-exist", profileId: profile.id, creditLimit: 1000 })).toThrow(
      NotFoundError,
    );
  });

  it("rejects a statementEndDay/dueDay outside 1-31 at the DB CHECK constraint", () => {
    const db = createTestDb();
    const { profile, card } = setUp(db);
    expect(() => upsertCreditCardDetails(db, { accountId: card.id, profileId: profile.id, statementEndDay: 32 })).toThrow();
    expect(() => upsertCreditCardDetails(db, { accountId: card.id, profileId: profile.id, dueDay: 0 })).toThrow();
  });
});

describe("getLoanDetails / upsertLoanDetails", () => {
  it("round-trips money, percent-rate, and plain fields", () => {
    const db = createTestDb();
    const { profile, loan } = setUp(db);
    const details = upsertLoanDetails(db, {
      accountId: loan.id,
      profileId: profile.id,
      originalAmount: 5000000,
      disbursedAmount: 5000000,
      interestRatePercent: 8.5,
      tenureMonths: 240,
      emiAmount: 43391,
      emiDay: 5,
      startDate: "2026-01-01",
      maturityDate: "2046-01-01",
    });
    expect(details.originalAmount).toBe(5000000);
    expect(details.interestRatePercent).toBe(8.5);
    expect(details.tenureMonths).toBe(240);
    expect(getLoanDetails(db, loan.id, profile.id)).toEqual(details);
  });

  it("returns undefined when no details have been set yet", () => {
    const db = createTestDb();
    const { profile, loan } = setUp(db);
    expect(getLoanDetails(db, loan.id, profile.id)).toBeUndefined();
  });

  it("rejects an emiDay outside 1-31 at the DB CHECK constraint", () => {
    const db = createTestDb();
    const { profile, loan } = setUp(db);
    expect(() => upsertLoanDetails(db, { accountId: loan.id, profileId: profile.id, emiDay: 32 })).toThrow();
  });
});
