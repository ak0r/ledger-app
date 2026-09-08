import { describe, expect, it } from "vitest";
import type { AccountWithBalance } from "@/server/services/accounts";
import {
  applyAccountSort,
  buildAccountSortHref,
  nextAccountSortState,
  parseAccountSortState,
  type AccountSortState,
} from "./account-sort";

function account(
  id: string,
  name: string,
  classification: string,
  accountType: string,
  balance: number,
  tags: string[] | null = null,
): AccountWithBalance {
  return {
    id,
    profileId: "profile-1",
    currencyId: "currency-1",
    name,
    classification: classification as never,
    accountType: accountType as never,
    instrumentId: null,
    instrumentLabel: null,
    tags,
    icon: null,
    isArchived: false,
    metadata: null,
    createdAt: "now",
    updatedAt: "now",
    balance,
  };
}

describe("parseAccountSortState", () => {
  it("returns null when missing or invalid", () => {
    expect(parseAccountSortState(undefined, undefined)).toBeNull();
    expect(parseAccountSortState("bogus", "asc")).toBeNull();
    expect(parseAccountSortState("name", "sideways")).toBeNull();
    // Transaction-only fields aren't valid Account sort fields.
    expect(parseAccountSortState("date", "asc")).toBeNull();
  });

  it("parses a valid field/direction pair", () => {
    expect(parseAccountSortState("balance", "desc")).toEqual({ field: "balance", direction: "desc" });
  });
});

describe("nextAccountSortState", () => {
  it("cycles asc -> desc -> null (Default) on the same column", () => {
    expect(nextAccountSortState(null, "name")).toEqual({ field: "name", direction: "asc" });
    expect(nextAccountSortState({ field: "name", direction: "asc" }, "name")).toEqual({
      field: "name",
      direction: "desc",
    });
    expect(nextAccountSortState({ field: "name", direction: "desc" }, "name")).toBeNull();
  });

  it("jumps to ascending for a different column", () => {
    const current: AccountSortState = { field: "name", direction: "desc" };
    expect(nextAccountSortState(current, "balance")).toEqual({ field: "balance", direction: "asc" });
  });
});

describe("buildAccountSortHref", () => {
  it("preserves filter and omits page (Accounts list has no pagination)", () => {
    const href = buildAccountSortHref("/accounts", { filter: "abc" }, { field: "name", direction: "asc" });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("filter")).toBe("abc");
    expect(params.get("sort")).toBe("name");
    expect(params.get("dir")).toBe("asc");
  });

  it("omits the query string entirely for Default with nothing to preserve", () => {
    expect(buildAccountSortHref("/accounts", {}, null)).toBe("/accounts");
  });
});

describe("applyAccountSort", () => {
  const bank = account("a1", "HDFC Bank", "ASSET", "BANK", 500000);
  const food = account("a2", "Food", "EXPENSE", "VARIABLE", 39794);
  const creditCard = account("a3", "Credit Card", "LIABILITY", "CREDIT_CARD", 24205);

  it("returns a new array, untouched order, for Default", () => {
    const accounts = [bank, food, creditCard];
    const sorted = applyAccountSort(accounts, null);
    expect(sorted).not.toBe(accounts);
    expect(sorted.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
  });

  it("sorts by name ascending/descending", () => {
    const accounts = [bank, food, creditCard];
    expect(applyAccountSort(accounts, { field: "name", direction: "asc" }).map((a) => a.name)).toEqual([
      "Credit Card",
      "Food",
      "HDFC Bank",
    ]);
    expect(applyAccountSort(accounts, { field: "name", direction: "desc" }).map((a) => a.name)).toEqual([
      "HDFC Bank",
      "Food",
      "Credit Card",
    ]);
  });

  it("sorts by balance numerically, not lexicographically", () => {
    // Lexicographic would put 24205 before 39794 before 500000 either way
    // by coincidence here — use values that would break under string sort.
    const a = account("x1", "A", "ASSET", "BANK", 9000);
    const b = account("x2", "B", "ASSET", "BANK", 10000);
    expect(applyAccountSort([b, a], { field: "balance", direction: "asc" }).map((x) => x.id)).toEqual([
      "x1",
      "x2",
    ]);
  });

  it("sorts by classification and accountType", () => {
    const accounts = [bank, food, creditCard];
    expect(
      applyAccountSort(accounts, { field: "classification", direction: "asc" }).map((a) => a.classification),
    ).toEqual(["ASSET", "EXPENSE", "LIABILITY"]);
    expect(
      applyAccountSort(accounts, { field: "accountType", direction: "asc" }).map((a) => a.accountType),
    ).toEqual(["BANK", "CREDIT_CARD", "VARIABLE"]);
  });

  it("sorts tags by the alphabetically-first tag, untagged accounts always last", () => {
    const tagged = account("t1", "Tagged", "ASSET", "BANK", 0, ["zebra", "apple"]);
    const untagged = account("t2", "Untagged", "ASSET", "BANK", 0, null);
    const other = account("t3", "Other", "ASSET", "BANK", 0, ["mango"]);

    expect(
      applyAccountSort([untagged, other, tagged], { field: "tags", direction: "asc" }).map((a) => a.id),
    ).toEqual(["t1", "t3", "t2"]);
    expect(
      applyAccountSort([untagged, other, tagged], { field: "tags", direction: "desc" }).map((a) => a.id),
    ).toEqual(["t3", "t1", "t2"]);
  });
});
