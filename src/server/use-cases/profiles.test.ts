import { describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { createTestDb } from "../testing/createTestDb";
import { findProfileById } from "../repositories/profiles";
import { insertAppUser, type AppUserRow } from "../repositories/app-users";
import {
  createProfile,
  getProfile,
  linkProfileToAppUser,
  listProfiles,
  renameProfile,
  setProfilePrimaryCurrency,
} from "./profiles";
import { createCurrency } from "./currencies";
import { NotFoundError, ProfileAlreadyLinkedError } from "./errors";

// linkProfileToAppUser's appUserId argument is a real FK (profiles.app_user_id
// -> app_users.id), and that column is also UNIQUE (an AppUser owns at most
// one Profile) — so the AppUser under test must be inserted directly
// (bypassing registerAppUser, which always creates/links its own Profile in
// the same transaction) to reproduce the brief unlinked window
// registerAppUser itself relies on this function for.
let appUserCounter = 0;
function insertAnAppUser(db: Db): AppUserRow {
  appUserCounter += 1;
  const now = new Date().toISOString();
  const appUser: AppUserRow = {
    id: crypto.randomUUID(),
    email: `linker-${appUserCounter}@example.com`,
    passwordHash: "not-a-real-hash",
    isPrimary: false,
    createdAt: now,
    updatedAt: now,
  };
  insertAppUser(db, appUser);
  return appUser;
}

describe("createProfile", () => {
  it("persists a Profile and is readable back by id", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    expect(profile.name).toBe("Amit");
    expect(findProfileById(db, profile.id)).toEqual(profile);
  });

  it("defaults appUserId to null (unlinked)", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    expect(profile.appUserId).toBeNull();
  });
});

describe("listProfiles", () => {
  it("returns every Profile", () => {
    const db = createTestDb();
    const a = createProfile(db, { name: "Amit" });
    const b = createProfile(db, { name: "Jenny" });

    expect(listProfiles(db).map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("getProfile", () => {
  it("returns undefined for an unknown id", () => {
    const db = createTestDb();
    expect(getProfile(db, "does-not-exist")).toBeUndefined();
  });
});

describe("linkProfileToAppUser", () => {
  it("links an unregistered Profile to an AppUser", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Jenny" });
    const appUser = insertAnAppUser(db);

    const linked = linkProfileToAppUser(db, profile.id, appUser.id);

    expect(linked.appUserId).toBe(appUser.id);
    expect(findProfileById(db, profile.id)?.appUserId).toBe(appUser.id);
  });

  it("throws NotFoundError for an unknown id", () => {
    const db = createTestDb();
    const appUser = insertAnAppUser(db);
    expect(() => linkProfileToAppUser(db, "does-not-exist", appUser.id)).toThrow(NotFoundError);
  });

  it("throws ProfileAlreadyLinkedError if the Profile already has an AppUser", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Jenny" });
    const first = insertAnAppUser(db);
    const second = insertAnAppUser(db);
    linkProfileToAppUser(db, profile.id, first.id);

    expect(() => linkProfileToAppUser(db, profile.id, second.id)).toThrow(
      ProfileAlreadyLinkedError,
    );
  });
});

describe("renameProfile", () => {
  it("updates the Profile's name", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    const renamed = renameProfile(db, profile.id, "Amit K");

    expect(renamed.name).toBe("Amit K");
    expect(findProfileById(db, profile.id)?.name).toBe("Amit K");
  });

  it("throws NotFoundError for an unknown id", () => {
    const db = createTestDb();
    expect(() => renameProfile(db, "does-not-exist", "New Name")).toThrow(NotFoundError);
  });
});

describe("setProfilePrimaryCurrency", () => {
  it("updates the Profile's primaryCurrencyId", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    const usd = createCurrency(db, {
      profileId: profile.id,
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      minorUnitScale: 2,
    });

    const updated = setProfilePrimaryCurrency(db, profile.id, usd.id);

    expect(updated.primaryCurrencyId).toBe(usd.id);
    expect(findProfileById(db, profile.id)?.primaryCurrencyId).toBe(usd.id);
  });

  it("throws NotFoundError for an unknown Profile id", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    const currency = createCurrency(db, {
      profileId: profile.id,
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      minorUnitScale: 2,
    });

    expect(() => setProfilePrimaryCurrency(db, "does-not-exist", currency.id)).toThrow(NotFoundError);
  });

  it("throws NotFoundError for a Currency that doesn't belong to this Profile (rule #6)", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    const otherProfile = createProfile(db, { name: "Partner" });
    const otherCurrency = createCurrency(db, {
      profileId: otherProfile.id,
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      minorUnitScale: 2,
    });

    expect(() => setProfilePrimaryCurrency(db, profile.id, otherCurrency.id)).toThrow(NotFoundError);
  });
});
