import { describe, expect, it } from "vitest";
import type { AccountRow } from "@/server/repositories/accounts";
import type { TransactionWithPostings } from "@/server/services/transactions";
import { applySort, buildSortHref, nextSortState, parseSortState, type SortState } from "./transaction-sort";

function account(id: string, classification: string): AccountRow {
  return {
    id,
    profileId: "profile-1",
    currencyId: "currency-1",
    name: id,
    classification: classification as never,
    accountType: "BANK",
    instrumentId: null,
    instrumentLabel: null,
    tags: null,
    icon: null,
    isArchived: false,
    metadata: null,
    createdAt: "now",
    updatedAt: "now",
  };
}

function transaction(
  id: string,
  date: string,
  description: string,
  postings: { accountId: string; debit: number; credit: number }[],
  tags: string[] | null = null,
): TransactionWithPostings {
  return {
    id,
    profileId: "profile-1",
    date,
    description,
    tags,
    importFileId: null,
    reference: null,
    counterparty: null,
    createdAt: "now",
    updatedAt: "now",
    postings: postings.map((posting, index) => ({
      id: `${id}-p${index}`,
      transactionId: id,
      accountId: posting.accountId,
      units: posting.debit - posting.credit,
      priceNum: 1,
      priceDenom: 1,
      baseAmount: posting.debit - posting.credit,
      createdAt: "now",
      updatedAt: "now",
    })),
  };
}

const bank = account("bank", "ASSET");
const creditCard = account("credit-card", "LIABILITY");
const food = account("food", "EXPENSE");
const shopping = account("shopping", "EXPENSE");
const accountsById = new Map([bank, creditCard, food, shopping].map((a) => [a.id, a]));

describe("parseSortState", () => {
  it("returns null when field or direction is missing", () => {
    expect(parseSortState(undefined, undefined)).toBeNull();
    expect(parseSortState("date", undefined)).toBeNull();
    expect(parseSortState(undefined, "asc")).toBeNull();
  });

  it("rejects unknown fields and directions", () => {
    expect(parseSortState("bogus", "asc")).toBeNull();
    expect(parseSortState("date", "sideways")).toBeNull();
  });

  it("parses a valid field/direction pair", () => {
    expect(parseSortState("date", "desc")).toEqual({ field: "date", direction: "desc" });
  });
});

describe("nextSortState", () => {
  it("jumps straight to ascending for a different column, never inheriting direction", () => {
    const current: SortState = { field: "date", direction: "desc" };
    expect(nextSortState(current, "description")).toEqual({ field: "description", direction: "asc" });
  });

  it("cycles the same column asc -> desc -> null (Default)", () => {
    expect(nextSortState(null, "date")).toEqual({ field: "date", direction: "asc" });
    expect(nextSortState({ field: "date", direction: "asc" }, "date")).toEqual({
      field: "date",
      direction: "desc",
    });
    expect(nextSortState({ field: "date", direction: "desc" }, "date")).toBeNull();
  });
});

describe("buildSortHref", () => {
  it("omits the query string entirely for Default with nothing else to preserve", () => {
    expect(buildSortHref("/txns", {}, null)).toBe("/txns");
  });

  it("preserves filter/pageSize and always resets page (never included)", () => {
    const href = buildSortHref("/txns", { filter: "abc", pageSize: "50" }, { field: "date", direction: "asc" });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("filter")).toBe("abc");
    expect(params.get("pageSize")).toBe("50");
    expect(params.get("sort")).toBe("date");
    expect(params.get("dir")).toBe("asc");
    expect(params.has("page")).toBe(false);
  });
});

describe("applySort", () => {
  it("returns a new array, untouched order, when sortState is null (Default)", () => {
    const txns = [
      transaction("t1", "2026-01-01", "B", [{ accountId: bank.id, debit: 0, credit: 100 }]),
      transaction("t2", "2026-01-02", "A", [{ accountId: bank.id, debit: 0, credit: 100 }]),
    ];
    const sorted = applySort(txns, accountsById, null);
    expect(sorted).not.toBe(txns);
    expect(sorted.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("sorts by date ascending/descending", () => {
    const txns = [
      transaction("t1", "2026-03-01", "x", [{ accountId: bank.id, debit: 0, credit: 100 }]),
      transaction("t2", "2026-01-01", "x", [{ accountId: bank.id, debit: 0, credit: 100 }]),
      transaction("t3", "2026-02-01", "x", [{ accountId: bank.id, debit: 0, credit: 100 }]),
    ];
    expect(applySort(txns, accountsById, { field: "date", direction: "asc" }).map((t) => t.id)).toEqual([
      "t2",
      "t3",
      "t1",
    ]);
    expect(applySort(txns, accountsById, { field: "date", direction: "desc" }).map((t) => t.id)).toEqual([
      "t1",
      "t3",
      "t2",
    ]);
  });

  it("sorts by description case-insensitively via localeCompare", () => {
    const txns = [
      transaction("t1", "2026-01-01", "banana", [{ accountId: bank.id, debit: 0, credit: 100 }]),
      transaction("t2", "2026-01-01", "Apple", [{ accountId: bank.id, debit: 0, credit: 100 }]),
    ];
    expect(applySort(txns, accountsById, { field: "description", direction: "asc" }).map((t) => t.id)).toEqual([
      "t2",
      "t1",
    ]);
  });

  it("sorts by fromAmount/toAmount using the transaction-level total, not per-posting amounts", () => {
    // A split transaction: one From posting, two To postings (75 + 25 = 100 total).
    const split = transaction("split", "2026-01-01", "x", [
      { accountId: bank.id, debit: 0, credit: 100 },
      { accountId: food.id, debit: 75, credit: 0 },
      { accountId: shopping.id, debit: 25, credit: 0 },
    ]);
    const plain = transaction("plain", "2026-01-01", "x", [
      { accountId: bank.id, debit: 0, credit: 50 },
      { accountId: food.id, debit: 50, credit: 0 },
    ]);
    // 100 (split's total) > 50 (plain's total) — descending puts split first.
    expect(
      applySort([plain, split], accountsById, { field: "toAmount", direction: "desc" }).map((t) => t.id),
    ).toEqual(["split", "plain"]);
    expect(
      applySort([plain, split], accountsById, { field: "fromAmount", direction: "desc" }).map((t) => t.id),
    ).toEqual(["split", "plain"]);
  });

  it("sorts fromAccount/toAccount by the first posting on that side (matches the collapsed row's own display)", () => {
    // Converge transaction (Merge output): two From postings, one To posting.
    const converge = transaction("converge", "2026-01-01", "x", [
      { accountId: bank.id, debit: 0, credit: 60 },
      { accountId: creditCard.id, debit: 0, credit: 40 },
      { accountId: food.id, debit: 100, credit: 0 },
    ]);
    const plain = transaction("plain", "2026-01-01", "x", [
      { accountId: creditCard.id, debit: 0, credit: 50 },
      { accountId: shopping.id, debit: 50, credit: 0 },
    ]);
    // "bank" < "credit-card" alphabetically — converge's *first* From
    // posting (bank) is what "fromAccount" sorts by, not credit-card.
    expect(
      applySort([plain, converge], accountsById, { field: "fromAccount", direction: "asc" }).map((t) => t.id),
    ).toEqual(["converge", "plain"]);
  });

  it("sorts a transaction that is multi-From AND multi-To at once without dropping either total", () => {
    // Verified via a real Merge Transactions test (see transaction-table.tsx's
    // own `isSplit`/`chevronSide` comment) — Merge can leave two separate
    // destination postings on the same account rather than combining them.
    const both = transaction("both", "2026-01-01", "x", [
      { accountId: bank.id, debit: 0, credit: 60 },
      { accountId: creditCard.id, debit: 0, credit: 40 },
      { accountId: food.id, debit: 70, credit: 0 },
      { accountId: shopping.id, debit: 30, credit: 0 },
    ]);
    const plain = transaction("plain", "2026-01-01", "x", [
      { accountId: bank.id, debit: 0, credit: 50 },
      { accountId: food.id, debit: 50, credit: 0 },
    ]);
    // both's total (100) > plain's total (50) on *both* sides.
    expect(
      applySort([plain, both], accountsById, { field: "fromAmount", direction: "desc" }).map((t) => t.id),
    ).toEqual(["both", "plain"]);
    expect(
      applySort([plain, both], accountsById, { field: "toAmount", direction: "desc" }).map((t) => t.id),
    ).toEqual(["both", "plain"]);
  });

  it("sorts tags by the alphabetically-first tag, untagged rows always last regardless of direction", () => {
    const tagged = transaction("tagged", "2026-01-01", "x", [{ accountId: bank.id, debit: 0, credit: 1 }], [
      "zebra",
      "apple",
    ]);
    const untagged = transaction("untagged", "2026-01-01", "x", [{ accountId: bank.id, debit: 0, credit: 1 }], null);
    const otherTagged = transaction(
      "other",
      "2026-01-01",
      "x",
      [{ accountId: bank.id, debit: 0, credit: 1 }],
      ["mango"],
    );

    // tagSortKey("tagged") = "apple" (alphabetically first), "other" = "mango"
    const ascending = applySort([untagged, otherTagged, tagged], accountsById, {
      field: "tags",
      direction: "asc",
    }).map((t) => t.id);
    expect(ascending).toEqual(["tagged", "other", "untagged"]);

    const descending = applySort([untagged, otherTagged, tagged], accountsById, {
      field: "tags",
      direction: "desc",
    }).map((t) => t.id);
    // Untagged still last on desc, not first — real values reverse, the
    // "no tags" tie-break does not.
    expect(descending).toEqual(["other", "tagged", "untagged"]);
  });
});
