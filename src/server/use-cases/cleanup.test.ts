import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createMember } from "./members";
import { createCurrency } from "./currencies";
import { createAccount, listAccounts } from "./accounts";
import { createTransaction, listTransactions } from "./transactions";
import { findAllMembers } from "../repositories/members";
import { findCurrenciesByMember } from "../repositories/currencies";
import { cleanUpFamilyContent } from "./cleanup";

function seedFamilyData(db: ReturnType<typeof createTestDb>) {
  const member = createMember(db, { name: "Amit" });
  const currency = createCurrency(db, {
    memberId: member.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  const bank = createAccount(db, {
    memberId: member.id,
    currencyId: currency.id,
    name: "Bank",
    classification: "ASSET",
    instrumentType: "BANK",
  });
  const income = createAccount(db, {
    memberId: member.id,
    currencyId: currency.id,
    name: "Salary",
    classification: "INCOME",
    instrumentType: "INCOME",
  });
  createTransaction(db, {
    memberId: member.id,
    date: "2026-01-01",
    description: "Salary",
    postings: [
      { accountId: income.id, debit: 0, credit: 100000 },
      { accountId: bank.id, debit: 100000, credit: 0 },
    ],
  });
  return { member, currency };
}

describe("cleanUpFamilyContent", () => {
  it("deletes all financial content but preserves the Member", () => {
    const db = createTestDb();
    const { member } = seedFamilyData(db);

    cleanUpFamilyContent(db);

    expect(findAllMembers(db)).toEqual([member]);
    expect(listAccounts(db, member.id)).toHaveLength(0);
    expect(listTransactions(db, member.id)).toHaveLength(0);
    expect(findCurrenciesByMember(db, member.id)).toHaveLength(0);
  });

  it("is a no-op (not an error) on a Family with no financial content yet", () => {
    const db = createTestDb();
    createMember(db, { name: "Amit" });

    expect(() => cleanUpFamilyContent(db)).not.toThrow();
    expect(findAllMembers(db)).toHaveLength(1);
  });
});
