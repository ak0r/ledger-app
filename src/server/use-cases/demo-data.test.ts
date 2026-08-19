import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { findAllMembers } from "../repositories/members";
import { listMembers } from "./members";
import { listTransactions } from "./transactions";
import { createDemoFamilyData } from "./demo-data";

describe("createDemoFamilyData", () => {
  it("inserts the full demo dataset into a real database atomically", () => {
    const db = createTestDb();

    const primaryMember = createDemoFamilyData(db);

    expect(primaryMember.isPrimary).toBe(true);
    expect(findAllMembers(db)).toHaveLength(2);

    const allTransactions = listMembers(db).flatMap((member) => listTransactions(db, member.id));
    expect(allTransactions.length).toBeGreaterThanOrEqual(1000);
  });
});
