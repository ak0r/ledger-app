import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractCroppedTable, getPageCount, readItems } from "./pdfTextExtraction";

// Reuses the existing synthetic Federal Bank fixture (AGENTS.md rules
// #23-#25 — fabricated account number/name/transactions throughout,
// federalAccountPdf.test.ts's own fixture doc comment has the full
// rationale) rather than hand-building a second synthetic PDF from raw
// bytes — this codebase has no PDF-authoring dependency, and this fixture
// already exercises a real multi-page, positioned-text PDF.
const FIXTURE_PATH = path.join(import.meta.dirname, "../../../fixtures/imports/federal/account/sample.pdf");
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);
const PASSWORD = "AMIT2807";

describe("getPageCount", () => {
  it("returns the real page count for a password-protected PDF", async () => {
    expect(await getPageCount(FIXTURE_BUFFER, PASSWORD)).toBeGreaterThanOrEqual(2);
  });
});

describe("extractCroppedTable", () => {
  it("only includes text whose position falls inside the given crop rect", async () => {
    const items = await readItems(FIXTURE_BUFFER, PASSWORD);
    const page1Items = items.filter((item) => item.page === 1);
    expect(page1Items.length).toBeGreaterThan(0);

    // A real marker from the fixture's own header row (federalAccountPdf's
    // COLUMN.particulars) — everything at or right of it is "inside," a
    // marker known to sit left of it (the date column) is "outside."
    const particularsMarker = page1Items.find((item) => item.str.trim() === "Particulars");
    expect(particularsMarker).toBeDefined();
    const dateMarker = page1Items.find((item) => item.str.trim() === "Date" || item.str.trim() === "Tran Date");

    const wideRect = { x0: 0, y0: -Infinity, x1: Infinity, y1: Infinity };
    const fullTable = await extractCroppedTable(FIXTURE_BUFFER, [{ pageNumber: 1, cropRect: wideRect }], PASSWORD);
    expect(fullTable.rows.length).toBeGreaterThan(0);

    // Crop to everything right of (and including) the Particulars column —
    // narrower than the full page.
    const narrowRect = { x0: particularsMarker!.x - 1, y0: -Infinity, x1: Infinity, y1: Infinity };
    const narrowTable = await extractCroppedTable(FIXTURE_BUFFER, [{ pageNumber: 1, cropRect: narrowRect }], PASSWORD);

    if (dateMarker) {
      // Every row's flattened text should have dropped the date-column
      // content — the crop excluded it.
      const flattened = narrowTable.rows.map((row) => row.join(" ")).join(" ");
      expect(flattened).not.toContain(dateMarker.str);
    }
    // headerRowIndex is always null for a cropped region — no promise a
    // header row exists in an arbitrary crop.
    expect(narrowTable.headerRowIndex).toBeNull();
  });

  it("returns an empty table when the crop rect contains no text", async () => {
    const emptyRect = { x0: 1_000_000, y0: 1_000_000, x1: 1_000_001, y1: 1_000_001 };
    const table = await extractCroppedTable(FIXTURE_BUFFER, [{ pageNumber: 1, cropRect: emptyRect }], PASSWORD);
    expect(table.rows).toEqual([]);
  });

  it("concatenates rows across multiple pages in the caller's given order", async () => {
    const wideRect = { x0: 0, y0: -Infinity, x1: Infinity, y1: Infinity };
    const pageCount = await getPageCount(FIXTURE_BUFFER, PASSWORD);
    if (pageCount < 2) return; // fixture doc comment promises >= 2 pages, guard anyway

    const forwardOrder = await extractCroppedTable(
      FIXTURE_BUFFER,
      [
        { pageNumber: 1, cropRect: wideRect },
        { pageNumber: 2, cropRect: wideRect },
      ],
      PASSWORD,
    );
    const reverseOrder = await extractCroppedTable(
      FIXTURE_BUFFER,
      [
        { pageNumber: 2, cropRect: wideRect },
        { pageNumber: 1, cropRect: wideRect },
      ],
      PASSWORD,
    );

    expect(forwardOrder.rows.length).toBe(reverseOrder.rows.length);
    // Same total rows, different order — proves concatenation follows the
    // caller's page order, not a fixed ascending sort.
    expect(forwardOrder.rows).not.toEqual(reverseOrder.rows);
  });
});
