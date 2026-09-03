import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createProfile, getProfile } from "./profiles";
import { listTransactions } from "./transactions";
import { findCurrenciesByProfile } from "../repositories/currencies";
import { createDemoProfileData } from "./demo-data";

describe("createDemoProfileData", () => {
  it("inserts the full demo dataset into a real database atomically", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    createDemoProfileData(db, profile.id);

    const allTransactions = listTransactions(db, profile.id);
    expect(allTransactions.length).toBeGreaterThanOrEqual(800);
  });

  it("sets the seeded Currency as the Profile's Primary Currency", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    expect(profile.primaryCurrencyId).toBeNull();

    createDemoProfileData(db, profile.id);

    const currencies = findCurrenciesByProfile(db, profile.id);
    expect(currencies).toHaveLength(1);
    expect(getProfile(db, profile.id)?.primaryCurrencyId).toBe(currencies[0]!.id);
  });
});
