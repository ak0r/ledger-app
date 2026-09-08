import { describe, expect, it } from "vitest";
import type { Db } from "../persistence/client";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
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

function setUpProfileWithCurrency(db: Db) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, {
    profileId: profile.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  return { profile, currency };
}

describe("createAccount", () => {
  it("persists an Account against an existing Currency", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);

    const account = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });

    expect(account.profileId).toBe(profile.id);
    expect(account.currencyId).toBe(currency.id);
    expect(account.isArchived).toBe(false);
  });

  it("rejects a Currency that does not belong to the Profile (rule #6)", () => {
    const db = createTestDb();
    const { currency } = setUpProfileWithCurrency(db);
    const otherProfile = createProfile(db, { name: "Partner" });

    expect(() =>
      createAccount(db, {
        profileId: otherProfile.id,
        currencyId: currency.id,
        name: "Should fail",
        classification: "ASSET",
        accountType: "BANK",
      }),
    ).toThrow(NotFoundError);
  });
});

describe("archiveAccount", () => {
  it("marks an Account archived", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const account = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "Old Card",
      classification: "LIABILITY",
      accountType: "CREDIT_CARD",
    });

    const archived = archiveAccount(db, { accountId: account.id, profileId: profile.id });
    expect(archived.isArchived).toBe(true);
  });

  it("rejects archiving another Profile's Account (rule #6)", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const account = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });
    const otherProfile = createProfile(db, { name: "Partner" });

    expect(() =>
      archiveAccount(db, { accountId: account.id, profileId: otherProfile.id }),
    ).toThrow(NotFoundError);
  });
});

describe("listAccounts and getAccount", () => {
  it("scopes listAccounts to the given Profile", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const otherProfile = createProfile(db, { name: "Partner" });
    createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });

    expect(listAccounts(db, profile.id)).toHaveLength(1);
    expect(listAccounts(db, otherProfile.id)).toEqual([]);
  });

  it("getAccount returns undefined for another Profile's Account", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const otherProfile = createProfile(db, { name: "Partner" });
    const account = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });

    expect(getAccount(db, account.id, profile.id)).toEqual(account);
    expect(getAccount(db, account.id, otherProfile.id)).toBeUndefined();
  });
});

describe("editAccount", () => {
  it("updates editable fields", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const account = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });

    const edited = editAccount(db, {
      accountId: account.id,
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank — Salary",
      classification: "ASSET",
      accountType: "BANK",
      instrumentLabel: "Primary",
    });

    expect(edited.name).toBe("HDFC Bank — Salary");
    expect(edited.instrumentLabel).toBe("Primary");
    expect(edited.currencyId).toBe(currency.id);
  });

  it("round-trips tags (rule #13, changing one record's tags only changes that record)", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const account = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
      tags: ["primary"],
    });
    expect(account.tags).toEqual(["primary"]);

    const edited = editAccount(db, {
      accountId: account.id,
      profileId: profile.id,
      currencyId: currency.id,
      name: account.name,
      classification: account.classification,
      accountType: account.accountType ?? "BANK",
      tags: ["primary", "salary"],
    });

    expect(edited.tags).toEqual(["primary", "salary"]);
    expect(getAccount(db, account.id, profile.id)?.tags).toEqual(["primary", "salary"]);
  });

  it("rejects editing another Profile's Account (rule #6)", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const otherProfile = createProfile(db, { name: "Partner" });
    const account = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });

    expect(() =>
      editAccount(db, {
        accountId: account.id,
        profileId: otherProfile.id,
        currencyId: currency.id,
        name: "Hijacked",
        classification: "ASSET",
        accountType: "BANK",
      }),
    ).toThrow(NotFoundError);
  });
});

describe("getAccountBalances", () => {
  it("computes each Account's all-time balance from its postings", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const bank = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });
    const food = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "Food",
      classification: "EXPENSE",
      accountType: "VARIABLE",
    });
    const salary = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "Salary",
      classification: "INCOME",
      accountType: "EARNED",
    });

    createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Salary",
      postings: [
        { accountId: bank.id, debit: 100000, credit: 0 },
        { accountId: salary.id, debit: 0, credit: 100000 },
      ],
    });
    createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-16",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    const balances = new Map(
      getAccountBalances(db, profile.id).map((account) => [account.id, account.balance]),
    );

    expect(balances.get(bank.id)).toBe(98000);
    expect(balances.get(food.id)).toBe(2000);
    expect(balances.get(salary.id)).toBe(100000);
  });

  it("defaults to zero for an Account with no postings", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const account = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "New Account",
      classification: "ASSET",
      accountType: "BANK",
    });

    const balances = getAccountBalances(db, profile.id);
    expect(balances.find((a) => a.id === account.id)?.balance).toBe(0);
  });
});

describe("bulkArchiveAccounts", () => {
  it("archives every account in the selection", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const a1 = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "A1",
      classification: "ASSET",
      accountType: "BANK",
    });
    const a2 = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "A2",
      classification: "EXPENSE",
      accountType: "VARIABLE",
    });

    bulkArchiveAccounts(db, { profileId: profile.id, accountIds: [a1.id, a2.id] });

    expect(getAccount(db, a1.id, profile.id)?.isArchived).toBe(true);
    expect(getAccount(db, a2.id, profile.id)?.isArchived).toBe(true);
  });

  it("rejects the whole batch when one id doesn't belong to this Profile, archiving nothing (atomicity)", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const otherProfile = createProfile(db, { name: "Priya" });
    const a1 = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "A1",
      classification: "ASSET",
      accountType: "BANK",
    });
    const otherCurrency = createCurrency(db, {
      profileId: otherProfile.id,
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });
    const otherAccount = createAccount(db, {
      profileId: otherProfile.id,
      currencyId: otherCurrency.id,
      name: "Not this profile's",
      classification: "ASSET",
      accountType: "BANK",
    });

    expect(() =>
      bulkArchiveAccounts(db, { profileId: profile.id, accountIds: [a1.id, otherAccount.id] }),
    ).toThrow(NotFoundError);

    expect(getAccount(db, a1.id, profile.id)?.isArchived).toBe(false);
  });
});

describe("bulkUpdateAccountTags", () => {
  it("adds and removes tags across the selection, preserving every other field", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const a1 = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "A1",
      classification: "ASSET",
      accountType: "BANK",
      tags: ["old", "keep"],
    });
    const a2 = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "A2",
      classification: "EXPENSE",
      accountType: "VARIABLE",
    });

    bulkUpdateAccountTags(db, {
      profileId: profile.id,
      accountIds: [a1.id, a2.id],
      addTags: ["new"],
      removeTags: ["old"],
    });

    const updated1 = getAccount(db, a1.id, profile.id);
    const updated2 = getAccount(db, a2.id, profile.id);
    expect(updated1?.tags).toEqual(["keep", "new"]);
    expect(updated1?.name).toBe("A1");
    expect(updated1?.classification).toBe("ASSET");
    expect(updated2?.tags).toEqual(["new"]);
  });

  it("rejects the whole batch when one id doesn't belong to this Profile, changing nothing (atomicity)", () => {
    const db = createTestDb();
    const { profile, currency } = setUpProfileWithCurrency(db);
    const a1 = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "A1",
      classification: "ASSET",
      accountType: "BANK",
      tags: ["keep"],
    });

    expect(() =>
      bulkUpdateAccountTags(db, {
        profileId: profile.id,
        accountIds: [a1.id, "does-not-exist"],
        addTags: ["new"],
        removeTags: [],
      }),
    ).toThrow(NotFoundError);

    expect(getAccount(db, a1.id, profile.id)?.tags).toEqual(["keep"]);
  });
});
