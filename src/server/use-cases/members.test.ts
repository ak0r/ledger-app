import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { findMemberById } from "../repositories/members";
import { createMember, getMember, listMembers, setPrimaryMember } from "./members";
import { NotFoundError } from "./errors";

describe("createMember", () => {
  it("persists a Member and is readable back by id", () => {
    const db = createTestDb();
    const member = createMember(db, { name: "Amit" });

    expect(member.name).toBe("Amit");
    expect(findMemberById(db, member.id)).toEqual(member);
  });
});

describe("listMembers", () => {
  it("returns every Member (no scoping — this is the entry point that picks one)", () => {
    const db = createTestDb();
    const a = createMember(db, { name: "Amit" });
    const b = createMember(db, { name: "Partner" });

    expect(listMembers(db).map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("getMember", () => {
  it("returns undefined for an unknown id", () => {
    const db = createTestDb();
    expect(getMember(db, "does-not-exist")).toBeUndefined();
  });
});

describe("createMember", () => {
  it("defaults isPrimary to false", () => {
    const db = createTestDb();
    const member = createMember(db, { name: "Amit" });
    expect(member.isPrimary).toBe(false);
  });
});

describe("setPrimaryMember", () => {
  it("marks the given Member as primary", () => {
    const db = createTestDb();
    const member = createMember(db, { name: "Amit" });

    const updated = setPrimaryMember(db, member.id);

    expect(updated.isPrimary).toBe(true);
    expect(findMemberById(db, member.id)?.isPrimary).toBe(true);
  });

  it("enforces exactly one primary — setting a new one clears the old one", () => {
    const db = createTestDb();
    const a = createMember(db, { name: "Amit" });
    const b = createMember(db, { name: "Partner" });

    setPrimaryMember(db, a.id);
    setPrimaryMember(db, b.id);

    expect(findMemberById(db, a.id)?.isPrimary).toBe(false);
    expect(findMemberById(db, b.id)?.isPrimary).toBe(true);
    expect(listMembers(db).filter((m) => m.isPrimary)).toHaveLength(1);
  });

  it("throws NotFoundError for an unknown id", () => {
    const db = createTestDb();
    expect(() => setPrimaryMember(db, "does-not-exist")).toThrow(NotFoundError);
  });
});
