import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("round-trips: the original password verifies against its own hash", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong password", hash)).toBe(false);
  });

  it("salts each call, so two hashes of the same password differ", () => {
    const a = hashPassword("same password");
    const b = hashPassword("same password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same password", a)).toBe(true);
    expect(verifyPassword("same password", b)).toBe(true);
  });

  it("rejects a malformed stored value", () => {
    expect(verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});
