import { describe, expect, it } from "vitest";
import { resolveImportFrom } from "./index";
import { PasswordRequiredError, UnrecognizedImportFormatError, AmbiguousImportFormatError } from "../services/errors";
import type { ImportAdapter, ParsedFile } from "./types";

// Ledger Custom Importer delta — `resolveImportFrom` is the resolution
// *logic* (try every detected candidate, classify outcomes), tested here
// against stub adapters so it's isolated from any real adapter's own
// parsing (that's each adapter's own *.test.ts file's job).
function stubAdapter(overrides: Partial<ImportAdapter> & { id: string }): ImportAdapter {
  return {
    label: overrides.id,
    institutionLabel: overrides.id,
    detect: () => true,
    parse: async () => ({ rows: [], accountIdentifier: null }) as ParsedFile,
    ...overrides,
  };
}

const BUFFER = Buffer.from("irrelevant");

describe("resolveImportFrom", () => {
  it("returns the single adapter whose parse() succeeds", async () => {
    const parsed: ParsedFile = { rows: [], accountIdentifier: "123" };
    const winner = stubAdapter({ id: "winner", parse: async () => parsed });

    const result = await resolveImportFrom([winner], "file.csv", BUFFER, 2);

    expect(result.adapter.id).toBe("winner");
    expect(result.parsed).toBe(parsed);
  });

  it("skips a candidate whose detect() returns false", async () => {
    const notDetected = stubAdapter({ id: "not-detected", detect: () => false, parse: async () => {
      throw new Error("should never be called");
    } });
    const winner = stubAdapter({ id: "winner" });

    const result = await resolveImportFrom([notDetected, winner], "file.csv", BUFFER, 2);

    expect(result.adapter.id).toBe("winner");
  });

  it("tries the next candidate when one throws UnrecognizedImportFormatError", async () => {
    const notActuallyAMatch = stubAdapter({
      id: "not-actually-a-match",
      parse: async () => {
        throw new UnrecognizedImportFormatError("not this institution after all");
      },
    });
    const winner = stubAdapter({ id: "winner" });

    const result = await resolveImportFrom([notActuallyAMatch, winner], "file.csv", BUFFER, 2);

    expect(result.adapter.id).toBe("winner");
  });

  it("throws UnrecognizedImportFormatError when every candidate is unrecognized", async () => {
    const a = stubAdapter({
      id: "a",
      parse: async () => {
        throw new UnrecognizedImportFormatError("nope");
      },
    });

    await expect(resolveImportFrom([a], "file.csv", BUFFER, 2)).rejects.toThrow(UnrecognizedImportFormatError);
  });

  it("throws UnrecognizedImportFormatError when no adapter's detect() matches", async () => {
    const a = stubAdapter({ id: "a", detect: () => false });

    await expect(resolveImportFrom([a], "file.csv", BUFFER, 2)).rejects.toThrow(UnrecognizedImportFormatError);
  });

  it("throws AmbiguousImportFormatError when more than one candidate succeeds", async () => {
    const a = stubAdapter({ id: "a", label: "Adapter A" });
    const b = stubAdapter({ id: "b", label: "Adapter B" });

    const error = await resolveImportFrom([a, b], "file.csv", BUFFER, 2).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AmbiguousImportFormatError);
    expect((error as Error).message).toContain("Adapter A");
    expect((error as Error).message).toContain("Adapter B");
  });

  it("propagates PasswordRequiredError immediately, without trying further candidates", async () => {
    const needsPassword = stubAdapter({
      id: "needs-password",
      parse: async () => {
        throw new PasswordRequiredError("required");
      },
    });
    const neverCalled = stubAdapter({
      id: "never-called",
      parse: async () => {
        throw new Error("should never be called — password error must stop the loop");
      },
    });

    await expect(resolveImportFrom([needsPassword, neverCalled], "file.csv", BUFFER, 2)).rejects.toThrow(
      PasswordRequiredError,
    );
  });

  it("propagates a genuine parse error immediately, without falling back to another candidate", async () => {
    const recognizedButBroken = stubAdapter({
      id: "recognized-but-broken",
      parse: async () => {
        throw new Error("recognized this institution but a row is malformed");
      },
    });
    const neverCalled = stubAdapter({
      id: "never-called",
      parse: async () => {
        throw new Error("should never be called — a real error must not be treated as 'not mine'");
      },
    });

    await expect(
      resolveImportFrom([recognizedButBroken, neverCalled], "file.csv", BUFFER, 2),
    ).rejects.toThrow("recognized this institution but a row is malformed");
  });
});
