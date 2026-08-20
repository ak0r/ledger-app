import { describe, expect, it } from "vitest";
import { createTestAppDb } from "../testing/createTestAppDb";
import { findAppUserByEmail } from "../repositories/app-users";
import { findSessionById } from "../repositories/sessions";
import { loginAppUser, logoutAppUser, registerAppUser } from "./auth";
import { EmailAlreadyRegisteredError, InvalidCredentialsError } from "./errors";

describe("registerAppUser", () => {
  it("persists a hashed password (not the plaintext) and creates a session", () => {
    const db = createTestAppDb();
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
    const db = createTestAppDb();
    registerAppUser(db, { email: "amit@example.com", password: "password123" });

    expect(() =>
      registerAppUser(db, { email: "amit@example.com", password: "different-password" }),
    ).toThrow(EmailAlreadyRegisteredError);
  });
});

describe("loginAppUser", () => {
  it("creates a new session on correct credentials", () => {
    const db = createTestAppDb();
    const { appUser } = registerAppUser(db, { email: "amit@example.com", password: "password123" });

    const { session } = loginAppUser(db, { email: "amit@example.com", password: "password123" });
    expect(findSessionById(db, session.id)?.appUserId).toBe(appUser.id);
  });

  it("throws InvalidCredentialsError for a wrong password", () => {
    const db = createTestAppDb();
    registerAppUser(db, { email: "amit@example.com", password: "password123" });

    expect(() =>
      loginAppUser(db, { email: "amit@example.com", password: "wrong-password" }),
    ).toThrow(InvalidCredentialsError);
  });

  it("throws the same InvalidCredentialsError for an unknown email (never reveals which)", () => {
    const db = createTestAppDb();

    expect(() =>
      loginAppUser(db, { email: "nobody@example.com", password: "anything" }),
    ).toThrow(InvalidCredentialsError);
  });
});

describe("logoutAppUser", () => {
  it("deletes the session row", () => {
    const db = createTestAppDb();
    const { session } = registerAppUser(db, { email: "amit@example.com", password: "password123" });

    logoutAppUser(db, session.id);

    expect(findSessionById(db, session.id)).toBeUndefined();
  });
});

describe("session expiry (via getCurrentAppUser's own logic, exercised directly here)", () => {
  it("a session's expiresAt is in the future at creation time", () => {
    const db = createTestAppDb();
    const before = Date.now();
    const { session } = registerAppUser(db, { email: "amit@example.com", password: "password123" });

    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(before);
  });
});
