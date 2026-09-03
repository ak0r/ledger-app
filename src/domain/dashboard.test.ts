import { describe, expect, it } from "vitest";
import {
  PANEL_DEFAULT_CONFIG,
  isPanelKey,
  validateDashboard,
  validateDashboardPanelPlacement,
  validatePanelConfiguration,
  type AccountOwnershipRef,
  type BalancesPanelConfig,
} from "./dashboard";

const PROFILE = "profile-1";
const OTHER_PROFILE = "profile-2";

function account(id: string, profileId = PROFILE): AccountOwnershipRef {
  return { id, profileId };
}

const accounts = new Map(
  [account("hdfc"), account("icici"), account("other-profile-account", OTHER_PROFILE)].map((a) => [a.id, a]),
);

describe("isPanelKey", () => {
  it("accepts a known key", () => {
    expect(isPanelKey("BALANCES")).toBe(true);
  });

  it("rejects an unknown key", () => {
    expect(isPanelKey("PORTFOLIO_VALUE")).toBe(false);
  });
});

describe("validateDashboard", () => {
  it("accepts a non-empty name", () => {
    expect(validateDashboard({ profileId: PROFILE, name: "Home" })).toEqual([]);
  });

  it("rejects an empty name", () => {
    expect(validateDashboard({ profileId: PROFILE, name: "  " })).toContainEqual({ code: "NAME_REQUIRED" });
  });
});

describe("validateDashboardPanelPlacement", () => {
  it("accepts a known key with non-negative coordinates", () => {
    expect(validateDashboardPanelPlacement("BALANCES", 0, 0)).toEqual([]);
  });

  it("rejects an unknown key", () => {
    expect(validateDashboardPanelPlacement("PORTFOLIO_VALUE", 0, 0)).toContainEqual({
      code: "UNKNOWN_PANEL_KEY",
      key: "PORTFOLIO_VALUE",
    });
  });

  it("rejects negative coordinates", () => {
    expect(validateDashboardPanelPlacement("BALANCES", -1, 0)).toContainEqual({ code: "INVALID_PLACEMENT" });
  });
});

describe("validatePanelConfiguration", () => {
  it("accepts card panels with an empty config", () => {
    expect(validatePanelConfiguration("NET_WORTH", PROFILE, {}, accounts)).toEqual([]);
    expect(validatePanelConfiguration("BUDGETS_NEEDING_REVIEW", PROFILE, {}, accounts)).toEqual([]);
  });

  describe("BALANCES", () => {
    it("accepts the default 'no selection' config", () => {
      expect(validatePanelConfiguration("BALANCES", PROFILE, PANEL_DEFAULT_CONFIG.BALANCES, accounts)).toEqual([]);
    });

    it("accepts owned selected accounts", () => {
      const config: BalancesPanelConfig = { scope: "SELECTED", accountIds: ["hdfc", "icici"] };
      expect(validatePanelConfiguration("BALANCES", PROFILE, config, accounts)).toEqual([]);
    });

    it("rejects an unowned account", () => {
      const config: BalancesPanelConfig = { scope: "SELECTED", accountIds: ["other-profile-account"] };
      expect(validatePanelConfiguration("BALANCES", PROFILE, config, accounts)).toContainEqual({
        code: "OWNERSHIP_MISMATCH",
        accountId: "other-profile-account",
      });
    });

    it("rejects an unknown account", () => {
      const config: BalancesPanelConfig = { scope: "SELECTED", accountIds: ["ghost"] };
      expect(validatePanelConfiguration("BALANCES", PROFILE, config, accounts)).toContainEqual({
        code: "ACCOUNT_NOT_FOUND",
        accountId: "ghost",
      });
    });

    it("rejects an invalid scope", () => {
      const config = { scope: "EVERYTHING", accountIds: [] } as unknown as BalancesPanelConfig;
      expect(validatePanelConfiguration("BALANCES", PROFILE, config, accounts)).toContainEqual({ code: "INVALID_SCOPE" });
    });
  });

  describe("RECENT_EXPENSES", () => {
    it("accepts a valid period", () => {
      expect(validatePanelConfiguration("RECENT_EXPENSES", PROFILE, { period: "THIS_YEAR" }, accounts)).toEqual([]);
    });

    it("rejects an invalid period", () => {
      expect(
        validatePanelConfiguration("RECENT_EXPENSES", PROFILE, { period: "LAST_WEEK" } as never, accounts),
      ).toContainEqual({ code: "INVALID_PERIOD" });
    });
  });

  describe("RECENT_TRANSACTIONS", () => {
    it("accepts a positive limit", () => {
      expect(validatePanelConfiguration("RECENT_TRANSACTIONS", PROFILE, { limit: 20 }, accounts)).toEqual([]);
    });

    it("rejects a zero limit", () => {
      expect(validatePanelConfiguration("RECENT_TRANSACTIONS", PROFILE, { limit: 0 }, accounts)).toContainEqual({
        code: "INVALID_LIMIT",
      });
    });

    it("rejects a limit over 100", () => {
      expect(validatePanelConfiguration("RECENT_TRANSACTIONS", PROFILE, { limit: 101 }, accounts)).toContainEqual({
        code: "INVALID_LIMIT",
      });
    });
  });
});
