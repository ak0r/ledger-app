import { describe, expect, it } from "vitest";
import { UnrecognizedImportFormatError } from "../services/errors";
import { genericCsvAdapter } from "./genericCsv";

describe("genericCsvAdapter", () => {
  it("parses debit/credit columns into normalized rows", async () => {
    const csv = ["Date,Description,Debit,Credit", "2026-08-01,Coffee,150,", "2026-08-02,Salary,,50000"].join(
      "\n",
    );

    await expect(genericCsvAdapter.parse(Buffer.from(csv), 2)).resolves.toEqual({
      rows: [
        { date: "2026-08-01", description: "Coffee", amountMinor: 15000, direction: "debit", reference: undefined },
        { date: "2026-08-02", description: "Salary", amountMinor: 5000000, direction: "credit", reference: undefined },
      ],
      accountIdentifier: null,
    });
  });

  it("parses amount/type columns into normalized rows", async () => {
    const csv = ["date,narration,amount,type", "2026-08-01,Coffee,150.50,Debit"].join("\n");

    await expect(genericCsvAdapter.parse(Buffer.from(csv), 2)).resolves.toEqual({
      rows: [{ date: "2026-08-01", description: "Coffee", amountMinor: 15050, direction: "debit", reference: undefined }],
      accountIdentifier: null,
    });
  });

  it("skips rows with no recognizable amount", async () => {
    const csv = ["Date,Description,Debit,Credit", "2026-08-01,No amount,,"].join("\n");
    await expect(genericCsvAdapter.parse(Buffer.from(csv), 2)).resolves.toEqual({ rows: [], accountIdentifier: null });
  });

  it("throws when neither column shape is present", async () => {
    const csv = ["Date,Description,Foo", "2026-08-01,Coffee,150"].join("\n");
    await expect(genericCsvAdapter.parse(Buffer.from(csv), 2)).rejects.toThrow(UnrecognizedImportFormatError);
  });

  it("throws when date/description columns are missing", async () => {
    const csv = ["Debit,Credit", "150,"].join("\n");
    await expect(genericCsvAdapter.parse(Buffer.from(csv), 2)).rejects.toThrow(UnrecognizedImportFormatError);
  });

  it("always detects (the fallback adapter)", () => {
    expect(genericCsvAdapter.detect("anything.csv", Buffer.from(""))).toBe(true);
  });
});
