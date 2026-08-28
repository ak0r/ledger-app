import { describe, expect, it } from "vitest";
import { deriveIdentifierVariants, isPossibleIdentifierMatch } from "./accountIdentifier";

describe("deriveIdentifierVariants", () => {
  it("derives last-4 and masked variants from a full account number", () => {
    expect(deriveIdentifierVariants("00001234567890")).toEqual(["7890", "XX7890", "XXX7890"]);
  });

  it("returns no variants for an already-short identifier", () => {
    expect(deriveIdentifierVariants("0077")).toEqual([]);
    expect(deriveIdentifierVariants("66")).toEqual([]);
  });
});

describe("isPossibleIdentifierMatch", () => {
  it("matches masked forms sharing a significant suffix (delta §11-§13 examples)", () => {
    expect(isPossibleIdentifierMatch("XX66", "1234566")).toBe(true);
    expect(isPossibleIdentifierMatch("XXX66", "1234566")).toBe(true);
    expect(isPossibleIdentifierMatch("XXXXX66", "1234566")).toBe(true);
    expect(isPossibleIdentifierMatch("XXXXX66", "XX66")).toBe(true);
  });

  it("does not match unrelated identifiers", () => {
    expect(isPossibleIdentifierMatch("XX66", "1234599")).toBe(false);
    expect(isPossibleIdentifierMatch("1234566", "9876543")).toBe(false);
  });

  it("rejects empty significant suffixes", () => {
    expect(isPossibleIdentifierMatch("XXX", "XX")).toBe(false);
  });
});
