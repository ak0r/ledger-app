import { describe, expect, it } from "vitest";
import type { AccountWithBalance } from "@/server/use-cases/accounts";
import {
  accountFilterToParams,
  applyAccountFilter,
  hasActiveAccountFilter,
  parseAccountFilter,
  EMPTY_ACCOUNT_FILTER,
} from "./account-filter";

function account(
  id: string,
  name: string,
  classification: string,
  instrumentType: string,
): AccountWithBalance {
  return {
    id,
    profileId: "profile-1",
    currencyId: "currency-1",
    name,
    classification: classification as never,
    instrumentType: instrumentType as never,
    instrumentId: null,
    instrumentLabel: null,
    tags: null,
    icon: null,
    isArchived: false,
    metadata: null,
    createdAt: "now",
    updatedAt: "now",
    balance: 0,
  };
}

describe("parseAccountFilter", () => {
  it("returns the empty state when no params given", () => {
    expect(parseAccountFilter({})).toEqual(EMPTY_ACCOUNT_FILTER);
  });

  it("parses valid comma-separated classification/instrument lists", () => {
    const state = parseAccountFilter({ classification: "ASSET,LIABILITY", instrument: "BANK,CASH" });
    expect(state.classifications).toEqual(["ASSET", "LIABILITY"]);
    expect(state.instrumentTypes).toEqual(["BANK", "CASH"]);
  });

  it("silently drops invalid enum values rather than throwing", () => {
    const state = parseAccountFilter({ classification: "ASSET,BOGUS", instrument: "NONSENSE" });
    expect(state.classifications).toEqual(["ASSET"]);
    expect(state.instrumentTypes).toEqual([]);
  });

  it("trims the search query", () => {
    expect(parseAccountFilter({ q: "  hdfc  " }).search).toBe("hdfc");
  });
});

describe("hasActiveAccountFilter", () => {
  it("is false for the empty state", () => {
    expect(hasActiveAccountFilter(EMPTY_ACCOUNT_FILTER)).toBe(false);
  });

  it("is true if any dimension is set", () => {
    expect(hasActiveAccountFilter({ classifications: ["ASSET"], instrumentTypes: [], search: "" })).toBe(true);
    expect(hasActiveAccountFilter({ classifications: [], instrumentTypes: ["BANK"], search: "" })).toBe(true);
    expect(hasActiveAccountFilter({ classifications: [], instrumentTypes: [], search: "x" })).toBe(true);
  });
});

describe("accountFilterToParams", () => {
  it("round-trips through parseAccountFilter", () => {
    const state = parseAccountFilter({ classification: "ASSET,LIABILITY", instrument: "BANK", q: "hdfc" });
    const params = accountFilterToParams(state);
    expect(parseAccountFilter(params)).toEqual(state);
  });

  it("omits empty dimensions", () => {
    expect(accountFilterToParams(EMPTY_ACCOUNT_FILTER)).toEqual({});
  });
});

describe("applyAccountFilter", () => {
  const bank = account("a1", "HDFC Bank", "ASSET", "BANK");
  const cash = account("a2", "Wallet", "ASSET", "CASH");
  const creditCard = account("a3", "Credit Card", "LIABILITY", "CREDIT_CARD");

  it("returns everything for the empty filter", () => {
    expect(applyAccountFilter([bank, cash, creditCard], EMPTY_ACCOUNT_FILTER)).toHaveLength(3);
  });

  it("filters by classification", () => {
    const result = applyAccountFilter([bank, cash, creditCard], {
      classifications: ["ASSET"],
      instrumentTypes: [],
      search: "",
    });
    expect(result.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("filters by instrument type", () => {
    const result = applyAccountFilter([bank, cash, creditCard], {
      classifications: [],
      instrumentTypes: ["CASH"],
      search: "",
    });
    expect(result.map((a) => a.id)).toEqual(["a2"]);
  });

  it("filters by case-insensitive name search", () => {
    const result = applyAccountFilter([bank, cash, creditCard], {
      classifications: [],
      instrumentTypes: [],
      search: "hdfc",
    });
    expect(result.map((a) => a.id)).toEqual(["a1"]);
  });

  it("combines classification + instrument + search with AND logic", () => {
    const result = applyAccountFilter([bank, cash, creditCard], {
      classifications: ["ASSET"],
      instrumentTypes: ["BANK"],
      search: "hdfc",
    });
    expect(result.map((a) => a.id)).toEqual(["a1"]);

    const empty = applyAccountFilter([bank, cash, creditCard], {
      classifications: ["ASSET"],
      instrumentTypes: ["CREDIT_CARD"],
      search: "",
    });
    expect(empty).toHaveLength(0);
  });
});
