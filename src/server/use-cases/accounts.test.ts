import { describe, expect, it } from "vitest";
import type { Db } from "../db/family-client";
import { createTestDb } from "../testing/createTestDb";
import { createMember } from "./members";
import { createCurrency } from "./currencies";
import {
  bulkArchiveAccounts,
  bulkUpdateAccountTags,
  createAccount,
  archiveAccount,
  editAccount,
  getAccount,
  getAccountBalances,
  listAccounts,
} from "./accounts";
import { createTransaction } from "./transactions";
import { NotFoundError } from "./errors";

function setUpMemberWithCurrency(db: Db) {
  const member = createMember(db, { name: "Amit" });
  const currency = createCurrency(db, {
    memberId: member.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  return { member, currency };
}

describe("createAccount", () => {
  it("persists an Account against an existing Currency", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);

    const account = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
    });

    expect(account.memberId).toBe(member.id);
    expect(account.currencyId).toBe(currency.id);
    expect(account.isArchived).toBe(false);
  });

  it("rejects a Currency that does not belong to the Member (rule #6)", () => {
    const db = createTestDb();
    const { currency } = setUpMemberWithCurrency(db);
    const otherMember = createMember(db, { name: "Partner" });

    expect(() =>
      createAccount(db, {
        memberId: otherMember.id,
        currencyId: currency.id,
        name: "Should fail",
        classification: "ASSET",
        instrumentType: "BANK",
      }),
    ).toThrow(NotFoundError);
  });
});

describe("archiveAccount", () => {
  it("marks an Account archived", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const account = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "Old Card",
      classification: "LIABILITY",
      instrumentType: "CREDIT_CARD",
    });

    const archived = archiveAccount(db, { accountId: account.id, memberId: member.id });
    expect(archived.isArchived).toBe(true);
  });

  it("rejects archiving another Member's Account (rule #6)", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const account = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
    });
    const otherMember = createMember(db, { name: "Partner" });

    expect(() =>
      archiveAccount(db, { accountId: account.id, memberId: otherMember.id }),
    ).toThrow(NotFoundError);
  });
});

describe("listAccounts and getAccount", () => {
  it("scopes listAccounts to the given Member", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const otherMember = createMember(db, { name: "Partner" });
    createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
    });

    expect(listAccounts(db, member.id)).toHaveLength(1);
    expect(listAccounts(db, otherMember.id)).toEqual([]);
  });

  it("getAccount returns undefined for another Member's Account", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const otherMember = createMember(db, { name: "Partner" });
    const account = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
    });

    expect(getAccount(db, account.id, member.id)).toEqual(account);
    expect(getAccount(db, account.id, otherMember.id)).toBeUndefined();
  });
});

describe("editAccount", () => {
  it("updates editable fields", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const account = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
    });

    const edited = editAccount(db, {
      accountId: account.id,
      memberId: member.id,
      name: "HDFC Bank — Salary",
      classification: "ASSET",
      instrumentType: "BANK",
      instrumentLabel: "Primary",
    });

    expect(edited.name).toBe("HDFC Bank — Salary");
    expect(edited.instrumentLabel).toBe("Primary");
    expect(edited.currencyId).toBe(currency.id);
  });

  it("round-trips tags (rule #13, changing one record's tags only changes that record)", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const account = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
      tags: ["primary"],
    });
    expect(account.tags).toEqual(["primary"]);

    const edited = editAccount(db, {
      accountId: account.id,
      memberId: member.id,
      name: account.name,
      classification: account.classification,
      instrumentType: account.instrumentType,
      tags: ["primary", "salary"],
    });

    expect(edited.tags).toEqual(["primary", "salary"]);
    expect(getAccount(db, account.id, member.id)?.tags).toEqual(["primary", "salary"]);
  });

  it("rejects editing another Member's Account (rule #6)", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const otherMember = createMember(db, { name: "Partner" });
    const account = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
    });

    expect(() =>
      editAccount(db, {
        accountId: account.id,
        memberId: otherMember.id,
        name: "Hijacked",
        classification: "ASSET",
        instrumentType: "BANK",
      }),
    ).toThrow(NotFoundError);
  });
});

describe("getAccountBalances", () => {
  it("computes each Account's all-time balance from its postings", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const bank = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
    });
    const food = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "Food",
      classification: "EXPENSE",
      instrumentType: "EXPENSE",
    });
    const salary = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "Salary",
      classification: "INCOME",
      instrumentType: "INCOME",
    });

    createTransaction(db, {
      memberId: member.id,
      date: "2026-08-15",
      description: "Salary",
      postings: [
        { accountId: bank.id, debit: 100000, credit: 0 },
        { accountId: salary.id, debit: 0, credit: 100000 },
      ],
    });
    createTransaction(db, {
      memberId: member.id,
      date: "2026-08-16",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    const balances = new Map(
      getAccountBalances(db, member.id).map((account) => [account.id, account.balance]),
    );

    expect(balances.get(bank.id)).toBe(98000);
    expect(balances.get(food.id)).toBe(2000);
    expect(balances.get(salary.id)).toBe(100000);
  });

  it("defaults to zero for an Account with no postings", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const account = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "New Account",
      classification: "ASSET",
      instrumentType: "BANK",
    });

    const balances = getAccountBalances(db, member.id);
    expect(balances.find((a) => a.id === account.id)?.balance).toBe(0);
  });
});

describe("bulkArchiveAccounts", () => {
  it("archives every account in the selection", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const a1 = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "A1",
      classification: "ASSET",
      instrumentType: "BANK",
    });
    const a2 = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "A2",
      classification: "EXPENSE",
      instrumentType: "EXPENSE",
    });

    bulkArchiveAccounts(db, { memberId: member.id, accountIds: [a1.id, a2.id] });

    expect(getAccount(db, a1.id, member.id)?.isArchived).toBe(true);
    expect(getAccount(db, a2.id, member.id)?.isArchived).toBe(true);
  });

  it("rejects the whole batch when one id doesn't belong to this Member, archiving nothing (atomicity)", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const otherMember = createMember(db, { name: "Priya" });
    const a1 = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "A1",
      classification: "ASSET",
      instrumentType: "BANK",
    });
    const otherCurrency = createCurrency(db, {
      memberId: otherMember.id,
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });
    const otherAccount = createAccount(db, {
      memberId: otherMember.id,
      currencyId: otherCurrency.id,
      name: "Not this member's",
      classification: "ASSET",
      instrumentType: "BANK",
    });

    expect(() =>
      bulkArchiveAccounts(db, { memberId: member.id, accountIds: [a1.id, otherAccount.id] }),
    ).toThrow(NotFoundError);

    expect(getAccount(db, a1.id, member.id)?.isArchived).toBe(false);
  });
});

describe("bulkUpdateAccountTags", () => {
  it("adds and removes tags across the selection, preserving every other field", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const a1 = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "A1",
      classification: "ASSET",
      instrumentType: "BANK",
      tags: ["old", "keep"],
    });
    const a2 = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "A2",
      classification: "EXPENSE",
      instrumentType: "EXPENSE",
    });

    bulkUpdateAccountTags(db, {
      memberId: member.id,
      accountIds: [a1.id, a2.id],
      addTags: ["new"],
      removeTags: ["old"],
    });

    const updated1 = getAccount(db, a1.id, member.id);
    const updated2 = getAccount(db, a2.id, member.id);
    expect(updated1?.tags).toEqual(["keep", "new"]);
    expect(updated1?.name).toBe("A1");
    expect(updated1?.classification).toBe("ASSET");
    expect(updated2?.tags).toEqual(["new"]);
  });

  it("rejects the whole batch when one id doesn't belong to this Member, changing nothing (atomicity)", () => {
    const db = createTestDb();
    const { member, currency } = setUpMemberWithCurrency(db);
    const a1 = createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "A1",
      classification: "ASSET",
      instrumentType: "BANK",
      tags: ["keep"],
    });

    expect(() =>
      bulkUpdateAccountTags(db, {
        memberId: member.id,
        accountIds: [a1.id, "does-not-exist"],
        addTags: ["new"],
        removeTags: [],
      }),
    ).toThrow(NotFoundError);

    expect(getAccount(db, a1.id, member.id)?.tags).toEqual(["keep"]);
  });
});
