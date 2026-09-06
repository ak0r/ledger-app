import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "../services/profiles";
import { createPortfolioAccountCore } from "./portfolioAccounts.core";
import { createFolioCore } from "./folios.core";

describe("createPortfolioAccountCore", () => {
  it("creates a PortfolioAccount", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    const result = createPortfolioAccountCore(db, {
      profileId: profile.id,
      name: "Zerodha",
      type: "STOCK",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    const result = createPortfolioAccountCore(db, { profileId: profile.id, name: "  ", type: "STOCK" });
    expect(result.success).toBe(false);
  });
});

describe("createFolioCore", () => {
  it("creates a Folio under a PortfolioAccount", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    const account = createPortfolioAccountCore(db, {
      profileId: profile.id,
      name: "CAMS",
      type: "MUTUAL_FUND",
    });
    if (!account.success) throw new Error("setup failed");

    const result = createFolioCore(db, {
      profileId: profile.id,
      portfolioAccountId: account.data.id,
      number: "12345/0",
    });
    expect(result.success).toBe(true);
  });
});
