import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { listTransactions } from "./transactions";
import { createDemoProfileData } from "./demo-data";

describe("createDemoProfileData", () => {
  it("inserts the full demo dataset into a real database atomically", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    createDemoProfileData(db, profile.id);

    const allTransactions = listTransactions(db, profile.id);
    expect(allTransactions.length).toBeGreaterThanOrEqual(800);
  });
});
