import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptPan, encryptPan, maskPan, panHash } from "./pan";

// Synthetic PAN only (AGENTS.md rule #24) — this format-matches a real PAN
// (5 letters, 4 digits, 1 letter) but is not a real one.
const FAKE_PAN = "ABCDE1234F";

// Isolated key directory per test — same reasoning as backups.test.ts/
// reset.test.ts's own mkdtempSync usage: never write a real key file into
// this repo's own data/ directory just by running the test suite.
let keyDir: string;
beforeEach(() => {
  keyDir = mkdtempSync(path.join(tmpdir(), "ledger-pan-test-"));
});
afterEach(() => {
  rmSync(keyDir, { recursive: true, force: true });
});

describe("encryptPan / decryptPan", () => {
  it("round-trips", () => {
    expect(decryptPan(encryptPan(FAKE_PAN, keyDir), keyDir)).toBe(FAKE_PAN);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptPan(FAKE_PAN, keyDir)).not.toBe(encryptPan(FAKE_PAN, keyDir));
  });

  it("throws on a malformed value instead of returning garbage", () => {
    expect(() => decryptPan("not-a-real-encrypted-value", keyDir)).toThrow();
  });
});

describe("panHash", () => {
  it("is deterministic for the same PAN", () => {
    expect(panHash(FAKE_PAN)).toBe(panHash(FAKE_PAN));
  });

  it("differs for different PANs", () => {
    expect(panHash(FAKE_PAN)).not.toBe(panHash("ZZZZZ9999Z"));
  });
});

describe("maskPan", () => {
  it("keeps only the last 4 characters", () => {
    expect(maskPan(FAKE_PAN)).toBe("XXXXXX234F");
  });
});
