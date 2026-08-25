import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createProfile, getProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createAccount, listAccounts } from "./accounts";
import { createTransaction, listTransactions } from "./transactions";
import { findCurrenciesByProfile } from "../repositories/currencies";
import { cleanUpProfileContent } from "./cleanup";

function seedProfileData(db: ReturnType<typeof createTestDb>) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, {
    profileId: profile.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  const bank = createAccount(db, {
    profileId: profile.id,
    currencyId: currency.id,
    name: "Bank",
    classification: "ASSET",
    instrumentType: "BANK",
  });
  const income = createAccount(db, {
    profileId: profile.id,
    currencyId: currency.id,
    name: "Salary",
    classification: "INCOME",
    instrumentType: "INCOME",
  });
  createTransaction(db, {
    profileId: profile.id,
    date: "2026-01-01",
    description: "Salary",
    postings: [
      { accountId: income.id, debit: 0, credit: 100000 },
      { accountId: bank.id, debit: 100000, credit: 0 },
    ],
  });
  return { profile, currency };
}

describe("cleanUpProfileContent", () => {
  it("deletes all financial content but preserves the Profile", () => {
    const db = createTestDb();
    const { profile } = seedProfileData(db);

    cleanUpProfileContent(db, profile.id);

    expect(getProfile(db, profile.id)).toEqual(profile);
    expect(listAccounts(db, profile.id)).toHaveLength(0);
    expect(listTransactions(db, profile.id)).toHaveLength(0);
    expect(findCurrenciesByProfile(db, profile.id)).toHaveLength(0);
  });

  it("is a no-op (not an error) on a Profile with no financial content yet", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    expect(() => cleanUpProfileContent(db, profile.id)).not.toThrow();
    expect(getProfile(db, profile.id)).toEqual(profile);
  });
});
