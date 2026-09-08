import { describe, expect, it } from "vitest";
import type { Db } from "../persistence/client";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createAccount } from "./accounts";
import { createTransaction } from "./transactions";
import {
  addPanel,
  createStarterDashboard,
  getDashboardForContext,
  getDefaultDashboardWithPanels,
  getExpenseTotalsByPeriod,
  movePanel,
  removePanel,
  updatePanelConfiguration,
} from "./dashboards";
import { findPanelsByDashboard } from "../repositories/dashboardPanels";
import { insertProfile } from "../repositories/profiles";
import { DashboardPanelValidationError, NotFoundError, PanelConfigValidationError } from "./errors";

function setUp(db: Db) {
  const profile = createProfile(db, { name: "Amit" });
  const otherProfile = createProfile(db, { name: "Other" });
  const currency = createCurrency(db, { profileId: profile.id, code: "INR", name: "Indian Rupee", symbol: "₹", minorUnitScale: 2 });
  const bank = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "HDFC Bank", classification: "ASSET", accountType: "BANK" });
  const food = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "Food", classification: "EXPENSE", accountType: "VARIABLE" });
  const travel = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "Travel", classification: "EXPENSE", accountType: "VARIABLE" });
  return { profile, otherProfile, bank, food, travel };
}

describe("createProfile / registerAppUser side effect", () => {
  it("gives every new Profile a Starter Dashboard automatically", () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    const { dashboard, panels } = getDefaultDashboardWithPanels(db, profile.id);
    expect(dashboard.isDefault).toBe(true);
    expect(panels.map((p) => p.key).sort()).toEqual(
      ["ASSETS", "BALANCES", "LIABILITIES", "NET_WORTH", "RECENT_EXPENSES", "RECENT_TRANSACTIONS"].sort(),
    );
  });

  it("gives Balances panel a 'no selection' default, not All accounts", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const { panels } = getDefaultDashboardWithPanels(db, profile.id);
    const balances = panels.find((p) => p.key === "BALANCES")!;
    expect(balances.configuration).toEqual({ scope: "SELECTED", accountIds: [] });
  });
});

describe("createStarterDashboard", () => {
  it("lays out panels without overlap", () => {
    const db = createTestDb();
    const now = new Date().toISOString();
    const profile = {
      id: crypto.randomUUID(),
      name: "Layout Check",
      appUserId: null,
      primaryCurrencyId: null,
      panEncrypted: null,
      panHash: null,
      createdAt: now,
      updatedAt: now,
    };
    insertProfile(db, profile);

    const { dashboard } = createStarterDashboard(db, profile.id);
    const panels = findPanelsByDashboard(db, dashboard.id);
    const seen = new Set<string>();
    for (const panel of panels) {
      const key = `${panel.x},${panel.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

// Dashboard System Phase 1 delta (2026-09-06) — one Dashboard per
// (Profile, context), not one per Profile.
describe("getDashboardForContext", () => {
  it("creates one Dashboard per context, each with the right context column", () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    const financial = getDashboardForContext(db, profile.id, "FINANCIAL");
    const spending = getDashboardForContext(db, profile.id, "SPENDING");
    const income = getDashboardForContext(db, profile.id, "INCOME");

    expect(financial.dashboard.context).toBe("FINANCIAL");
    expect(spending.dashboard.context).toBe("SPENDING");
    expect(income.dashboard.context).toBe("INCOME");
    expect(financial.dashboard.id).not.toBe(spending.dashboard.id);
    expect(spending.dashboard.id).not.toBe(income.dashboard.id);
  });

  it("only the Financial context gets the Starter Panel layout — Spending/Income start empty", () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    const financial = getDashboardForContext(db, profile.id, "FINANCIAL");
    const spending = getDashboardForContext(db, profile.id, "SPENDING");
    const income = getDashboardForContext(db, profile.id, "INCOME");

    expect(financial.panels.length).toBeGreaterThan(0);
    expect(spending.panels).toEqual([]);
    expect(income.panels).toEqual([]);
  });

  it("resolving one context lazily creates all 3, not just the one asked for", () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    getDashboardForContext(db, profile.id, "SPENDING");

    // Financial/Income should already exist too, resolvable without a
    // second lazy-create round-trip.
    const financial = getDashboardForContext(db, profile.id, "FINANCIAL");
    const income = getDashboardForContext(db, profile.id, "INCOME");
    expect(financial.dashboard).toBeDefined();
    expect(income.dashboard).toBeDefined();
  });

  it("is idempotent — calling twice for the same context returns the same row, not a duplicate", () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    const first = getDashboardForContext(db, profile.id, "SPENDING");
    const second = getDashboardForContext(db, profile.id, "SPENDING");

    expect(first.dashboard.id).toBe(second.dashboard.id);
  });
});

describe("getDefaultDashboardWithPanels", () => {
  it("lazily creates a Starter Dashboard for a pre-existing profile with none", () => {
    const db = createTestDb();
    // Simulate a Profile that predates this delta — inserted directly via
    // the repository, bypassing createProfile's own Starter Dashboard side
    // effect, so it genuinely has zero Dashboard rows going in.
    const now = new Date().toISOString();
    const profile = {
      id: crypto.randomUUID(),
      name: "Legacy",
      appUserId: null,
      primaryCurrencyId: null,
      panEncrypted: null,
      panHash: null,
      createdAt: now,
      updatedAt: now,
    };
    insertProfile(db, profile);

    const seeded = getDefaultDashboardWithPanels(db, profile.id);
    expect(seeded.dashboard.isDefault).toBe(true);
    expect(seeded.panels.length).toBeGreaterThan(0);

    // Calling again returns the same Dashboard, not a second one.
    const again = getDefaultDashboardWithPanels(db, profile.id);
    expect(again.dashboard.id).toBe(seeded.dashboard.id);
  });
});

describe("addPanel", () => {
  it("adds a panel below the existing ones with its default configuration", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const { dashboard, panels } = getDefaultDashboardWithPanels(db, profile.id);
    const maxYBefore = Math.max(...panels.map((p) => p.y));

    const added = addPanel(db, { profileId: profile.id, dashboardId: dashboard.id, key: "BUDGETS_NEEDING_REVIEW" });

    expect(added.configuration).toEqual({});
    expect(added.y).toBeGreaterThan(maxYBefore);
  });

  it("rejects an unknown panel key", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const { dashboard } = getDefaultDashboardWithPanels(db, profile.id);

    expect(() => addPanel(db, { profileId: profile.id, dashboardId: dashboard.id, key: "NOT_A_REAL_PANEL" })).toThrow(
      DashboardPanelValidationError,
    );
  });

  it("throws NotFoundError for a dashboard outside the profile", () => {
    const db = createTestDb();
    const { profile, otherProfile } = setUp(db);
    const { dashboard } = getDefaultDashboardWithPanels(db, profile.id);

    expect(() => addPanel(db, { profileId: otherProfile.id, dashboardId: dashboard.id, key: "NET_WORTH" })).toThrow(
      NotFoundError,
    );
  });
});

describe("removePanel", () => {
  it("deletes the panel immediately", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const { dashboard, panels } = getDefaultDashboardWithPanels(db, profile.id);
    const target = panels[0];

    removePanel(db, { panelId: target.id, profileId: profile.id });

    expect(findPanelsByDashboard(db, dashboard.id).find((p) => p.id === target.id)).toBeUndefined();
  });

  it("throws NotFoundError for a panel outside the profile", () => {
    const db = createTestDb();
    const { profile, otherProfile } = setUp(db);
    const { panels } = getDefaultDashboardWithPanels(db, profile.id);

    expect(() => removePanel(db, { panelId: panels[0].id, profileId: otherProfile.id })).toThrow(NotFoundError);
  });
});

describe("movePanel", () => {
  it("updates placement only", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const { panels } = getDefaultDashboardWithPanels(db, profile.id);
    const target = panels[0];

    const moved = movePanel(db, { panelId: target.id, profileId: profile.id, x: 3, y: 9 });

    expect(moved.x).toBe(3);
    expect(moved.y).toBe(9);
    expect(moved.key).toBe(target.key);
  });

  it("rejects negative coordinates", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const { panels } = getDefaultDashboardWithPanels(db, profile.id);

    expect(() => movePanel(db, { panelId: panels[0].id, profileId: profile.id, x: -1, y: 0 })).toThrow(
      DashboardPanelValidationError,
    );
  });
});

describe("updatePanelConfiguration", () => {
  it("accepts a valid Balances selection owned by the profile", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);
    const { panels } = getDefaultDashboardWithPanels(db, profile.id);
    const balances = panels.find((p) => p.key === "BALANCES")!;

    const updated = updatePanelConfiguration(db, {
      panelId: balances.id,
      profileId: profile.id,
      configuration: { scope: "SELECTED", accountIds: [food.id] },
    });

    expect(updated.configuration).toEqual({ scope: "SELECTED", accountIds: [food.id] });
  });

  it("rejects an account owned by another profile", () => {
    const db = createTestDb();
    const { profile, otherProfile } = setUp(db);
    const otherCurrency = createCurrency(db, { profileId: otherProfile.id, code: "INR", name: "Indian Rupee", symbol: "₹", minorUnitScale: 2 });
    const otherAccount = createAccount(db, { profileId: otherProfile.id, currencyId: otherCurrency.id, name: "Other Bank", classification: "ASSET", accountType: "BANK" });
    const { panels } = getDefaultDashboardWithPanels(db, profile.id);
    const balances = panels.find((p) => p.key === "BALANCES")!;

    expect(() =>
      updatePanelConfiguration(db, {
        panelId: balances.id,
        profileId: profile.id,
        configuration: { scope: "SELECTED", accountIds: [otherAccount.id] },
      }),
    ).toThrow(PanelConfigValidationError);
  });
});

describe("getExpenseTotalsByPeriod", () => {
  it("sums expense postings within the period, sorted descending", () => {
    const db = createTestDb();
    const { profile, bank, food, travel } = setUp(db);

    createTransaction(db, { profileId: profile.id, date: "2026-09-05", description: "Groceries", postings: [{ accountId: bank.id, debit: 0, credit: 5000 }, { accountId: food.id, debit: 5000, credit: 0 }] });
    createTransaction(db, { profileId: profile.id, date: "2026-09-06", description: "Flight", postings: [{ accountId: bank.id, debit: 0, credit: 90000 }, { accountId: travel.id, debit: 90000, credit: 0 }] });
    // Outside "this month" if today is well past September — use ALL_TIME to sidestep the real clock.
    const totals = getExpenseTotalsByPeriod(db, profile.id, "ALL_TIME");

    expect(totals).toEqual([
      { accountId: travel.id, accountName: "Travel", totalMinor: 90000 },
      { accountId: food.id, accountName: "Food", totalMinor: 5000 },
    ]);
  });

  it("excludes transactions before the period start", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);
    createTransaction(db, { profileId: profile.id, date: "2020-01-01", description: "Old groceries", postings: [{ accountId: bank.id, debit: 0, credit: 5000 }, { accountId: food.id, debit: 5000, credit: 0 }] });

    const totals = getExpenseTotalsByPeriod(db, profile.id, "THIS_MONTH", new Date("2026-09-15T00:00:00Z"));
    expect(totals).toEqual([]);
  });
});
