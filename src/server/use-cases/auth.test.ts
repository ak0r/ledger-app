import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { findAppUserByEmail, findAppUserById } from "../repositories/app-users";
import { findSessionById } from "../repositories/sessions";
import { loginAppUser, logoutAppUser, registerAppUser, updatePassword } from "./auth";
import { EmailAlreadyRegisteredError, IncorrectCurrentPasswordError, InvalidCredentialsError, NotFoundError } from "./errors";

describe("registerAppUser", () => {
  it("persists a hashed password (not the plaintext) and creates a session", () => {
    const db = createTestDb();
    const { appUser, session } = registerAppUser(db, {
      email: "amit@example.com",
      password: "correct horse battery staple",
    });

    expect(appUser.email).toBe("amit@example.com");
    expect(appUser.passwordHash).not.toBe("correct horse battery staple");
    expect(findAppUserByEmail(db, "amit@example.com")).toEqual(appUser);
    expect(findSessionById(db, session.id)?.appUserId).toBe(appUser.id);
  });

  it("rejects a duplicate email", () => {
    const db = createTestDb();
    registerAppUser(db, { email: "amit@example.com", password: "password123" });

    expect(() =>
      registerAppUser(db, { email: "amit@example.com", password: "different-password" }),
    ).toThrow(EmailAlreadyRegisteredError);
  });
});

describe("loginAppUser", () => {
  it("creates a new session on correct credentials", () => {
    const db = createTestDb();
    const { appUser } = registerAppUser(db, { email: "amit@example.com", password: "password123" });

    const { session } = loginAppUser(db, { email: "amit@example.com", password: "password123" });
    expect(findSessionById(db, session.id)?.appUserId).toBe(appUser.id);
  });

  it("throws InvalidCredentialsError for a wrong password", () => {
    const db = createTestDb();
    registerAppUser(db, { email: "amit@example.com", password: "password123" });

    expect(() =>
      loginAppUser(db, { email: "amit@example.com", password: "wrong-password" }),
    ).toThrow(InvalidCredentialsError);
  });

  it("throws the same InvalidCredentialsError for an unknown email (never reveals which)", () => {
    const db = createTestDb();

    expect(() =>
      loginAppUser(db, { email: "nobody@example.com", password: "anything" }),
    ).toThrow(InvalidCredentialsError);
  });
});

describe("logoutAppUser", () => {
  it("deletes the session row", () => {
    const db = createTestDb();
    const { session } = registerAppUser(db, { email: "amit@example.com", password: "password123" });

    logoutAppUser(db, session.id);

    expect(findSessionById(db, session.id)).toBeUndefined();
  });
});

describe("updatePassword", () => {
  it("changes the password hash and rejects the old password afterward", () => {
    const db = createTestDb();
    const { appUser } = registerAppUser(db, { email: "amit@example.com", password: "old-password" });

    updatePassword(db, {
      appUserId: appUser.id,
      currentPassword: "old-password",
      newPassword: "new-password-123",
    });

    expect(() => loginAppUser(db, { email: "amit@example.com", password: "old-password" })).toThrow(
      InvalidCredentialsError,
    );
    const { session } = loginAppUser(db, { email: "amit@example.com", password: "new-password-123" });
    expect(findSessionById(db, session.id)?.appUserId).toBe(appUser.id);

    const updated = findAppUserById(db, appUser.id);
    expect(updated?.passwordHash).not.toBe(appUser.passwordHash);
  });

  it("throws IncorrectCurrentPasswordError when the current password is wrong", () => {
    const db = createTestDb();
    const { appUser } = registerAppUser(db, { email: "amit@example.com", password: "old-password" });

    expect(() =>
      updatePassword(db, {
        appUserId: appUser.id,
        currentPassword: "wrong-password",
        newPassword: "new-password-123",
      }),
    ).toThrow(IncorrectCurrentPasswordError);
  });

  it("throws NotFoundError for an unknown AppUser", () => {
    const db = createTestDb();

    expect(() =>
      updatePassword(db, {
        appUserId: "does-not-exist",
        currentPassword: "anything",
        newPassword: "new-password-123",
      }),
    ).toThrow(NotFoundError);
  });
});

describe("session expiry (via getCurrentAppUser's own logic, exercised directly here)", () => {
  it("a session's expiresAt is in the future at creation time", () => {
    const db = createTestDb();
    const before = Date.now();
    const { session } = registerAppUser(db, { email: "amit@example.com", password: "password123" });

    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(before);
  });
});
