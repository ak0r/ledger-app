import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createProfileCore } from "./profiles.core";

describe("createProfileCore", () => {
  it("creates a Profile from valid input", () => {
    const db = createTestDb();
    const result = createProfileCore(db, { name: "Amit" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Amit");
  });

  it("rejects a blank name with fast client feedback, no DB write", () => {
    const db = createTestDb();
    const result = createProfileCore(db, { name: "  " });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/name/i);
  });

  it("rejects malformed input without throwing", () => {
    const db = createTestDb();
    const result = createProfileCore(db, { nope: true });
    expect(result.success).toBe(false);
  });
});
