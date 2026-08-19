import { describe, expect, it } from "vitest";
import { createTestRegistryDb } from "../testing/createTestRegistryDb";
import { findFamilyById } from "../repositories/families";
import { createFamily, deleteFamily, getFamily, listFamilies, renameFamily } from "./families";
import { NotFoundError } from "./errors";

describe("createFamily", () => {
  it("persists a Family and is readable back by id", () => {
    const db = createTestRegistryDb();
    const family = createFamily(db, { name: "Amit's Family" });

    expect(family.name).toBe("Amit's Family");
    expect(findFamilyById(db, family.id)).toEqual(family);
  });
});

describe("listFamilies", () => {
  it("returns every Family", () => {
    const db = createTestRegistryDb();
    const a = createFamily(db, { name: "Family A" });
    const b = createFamily(db, { name: "Family B" });

    expect(listFamilies(db).map((f) => f.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("getFamily", () => {
  it("returns undefined for an unknown id", () => {
    const db = createTestRegistryDb();
    expect(getFamily(db, "does-not-exist")).toBeUndefined();
  });
});

describe("renameFamily", () => {
  it("updates the name without changing the id", () => {
    const db = createTestRegistryDb();
    const family = createFamily(db, { name: "Old name" });

    const renamed = renameFamily(db, family.id, "New name");

    expect(renamed.id).toBe(family.id);
    expect(renamed.name).toBe("New name");
    expect(findFamilyById(db, family.id)?.name).toBe("New name");
  });

  it("throws for an unknown id", () => {
    const db = createTestRegistryDb();
    expect(() => renameFamily(db, "does-not-exist", "New name")).toThrow();
  });
});

describe("deleteFamily", () => {
  it("removes the registry row", () => {
    const db = createTestRegistryDb();
    const family = createFamily(db, { name: "To Delete" });
    const other = createFamily(db, { name: "Untouched" });

    deleteFamily(db, family.id);

    expect(findFamilyById(db, family.id)).toBeUndefined();
    expect(findFamilyById(db, other.id)).toEqual(other);
  });

  it("throws NotFoundError for an unknown id", () => {
    const db = createTestRegistryDb();
    expect(() => deleteFamily(db, "does-not-exist")).toThrow(NotFoundError);
  });
});
