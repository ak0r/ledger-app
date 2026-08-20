import { describe, expect, it } from "vitest";
import { createTestAppDb } from "../testing/createTestAppDb";
import { findFamilyById } from "../repositories/families";
import { createFamily, deleteFamily, getFamily, listFamilies, renameFamily } from "./families";
import { NotFoundError } from "./errors";

const APP_USER_ID = "app-user-1";
const OTHER_APP_USER_ID = "app-user-2";

function seedAppUser(db: ReturnType<typeof createTestAppDb>, id: string): void {
  const now = new Date().toISOString();
  db.run(
    // Minimal direct insert — app_users isn't this test file's subject,
    // just a FK that families.appUserId needs to satisfy.
    `INSERT INTO app_users (id, email, password_hash, created_at, updated_at) VALUES ('${id}', '${id}@example.com', 'hash', '${now}', '${now}')` as never,
  );
}

describe("createFamily", () => {
  it("persists a Family owned by the given AppUser and is readable back by id", () => {
    const db = createTestAppDb();
    seedAppUser(db, APP_USER_ID);
    const family = createFamily(db, APP_USER_ID, { name: "Amit's Family" });

    expect(family.name).toBe("Amit's Family");
    expect(family.appUserId).toBe(APP_USER_ID);
    expect(findFamilyById(db, family.id, APP_USER_ID)).toEqual(family);
  });
});

describe("listFamilies", () => {
  it("returns only the calling AppUser's own Families", () => {
    const db = createTestAppDb();
    seedAppUser(db, APP_USER_ID);
    seedAppUser(db, OTHER_APP_USER_ID);
    const a = createFamily(db, APP_USER_ID, { name: "Family A" });
    createFamily(db, OTHER_APP_USER_ID, { name: "Someone else's Family" });

    expect(listFamilies(db, APP_USER_ID).map((f) => f.id)).toEqual([a.id]);
  });
});

describe("getFamily", () => {
  it("returns undefined for an unknown id", () => {
    const db = createTestAppDb();
    seedAppUser(db, APP_USER_ID);
    expect(getFamily(db, APP_USER_ID, "does-not-exist")).toBeUndefined();
  });

  it("returns undefined for another AppUser's Family", () => {
    const db = createTestAppDb();
    seedAppUser(db, APP_USER_ID);
    seedAppUser(db, OTHER_APP_USER_ID);
    const family = createFamily(db, OTHER_APP_USER_ID, { name: "Not yours" });

    expect(getFamily(db, APP_USER_ID, family.id)).toBeUndefined();
  });
});

describe("renameFamily", () => {
  it("updates the name without changing the id", () => {
    const db = createTestAppDb();
    seedAppUser(db, APP_USER_ID);
    const family = createFamily(db, APP_USER_ID, { name: "Old name" });

    const renamed = renameFamily(db, APP_USER_ID, family.id, "New name");

    expect(renamed.id).toBe(family.id);
    expect(renamed.name).toBe("New name");
    expect(findFamilyById(db, family.id, APP_USER_ID)?.name).toBe("New name");
  });

  it("throws for an unknown id", () => {
    const db = createTestAppDb();
    seedAppUser(db, APP_USER_ID);
    expect(() => renameFamily(db, APP_USER_ID, "does-not-exist", "New name")).toThrow();
  });

  it("throws NotFoundError for another AppUser's Family", () => {
    const db = createTestAppDb();
    seedAppUser(db, APP_USER_ID);
    seedAppUser(db, OTHER_APP_USER_ID);
    const family = createFamily(db, OTHER_APP_USER_ID, { name: "Not yours" });

    expect(() => renameFamily(db, APP_USER_ID, family.id, "Hijacked")).toThrow(NotFoundError);
  });
});

describe("deleteFamily", () => {
  it("removes the app.db row", () => {
    const db = createTestAppDb();
    seedAppUser(db, APP_USER_ID);
    const family = createFamily(db, APP_USER_ID, { name: "To Delete" });
    const other = createFamily(db, APP_USER_ID, { name: "Untouched" });

    deleteFamily(db, APP_USER_ID, family.id);

    expect(findFamilyById(db, family.id, APP_USER_ID)).toBeUndefined();
    expect(findFamilyById(db, other.id, APP_USER_ID)).toEqual(other);
  });

  it("throws NotFoundError for an unknown id", () => {
    const db = createTestAppDb();
    seedAppUser(db, APP_USER_ID);
    expect(() => deleteFamily(db, APP_USER_ID, "does-not-exist")).toThrow(NotFoundError);
  });

  it("throws NotFoundError for another AppUser's Family", () => {
    const db = createTestAppDb();
    seedAppUser(db, APP_USER_ID);
    seedAppUser(db, OTHER_APP_USER_ID);
    const family = createFamily(db, OTHER_APP_USER_ID, { name: "Not yours" });

    expect(() => deleteFamily(db, APP_USER_ID, family.id)).toThrow(NotFoundError);
  });
});
