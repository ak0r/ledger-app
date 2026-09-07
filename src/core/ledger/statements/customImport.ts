// Ledger Custom Importer delta — the shapes a user builds by hand when no
// registered adapter recognized their file (`server/importers/index.ts`'s
// `resolveImport` throwing `UnrecognizedImportFormatError`), or when they
// explicitly opt into Custom Importer instead of a matched one.

// A raw, source-agnostic table — what reading an XLS sheet and cropping a
// PDF region both reduce to, before column mapping is applied. Same shape
// either way so one mapping/row-building function serves both inputs.
// Ragged rows are fine; column mapping indexes defensively.
export interface RawTable {
  rows: string[][];
  headerRowIndex: number | null;
}

export type AmountShape =
  | { kind: "debitCredit"; debitColumn: number; creditColumn: number }
  | { kind: "amountDirection"; amountColumn: number; directionColumn: number };

// A small closed enum, not a format-string parser — grow this list only
// from a real custom-import failure, not speculatively.
export const DATE_FORMATS = ["ISO", "DMY_SLASH", "MDY_SLASH", "DD_MON_YYYY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

// Column references are indices into `RawTable.rows`, not header names —
// deliberate: the whole reason Custom Importer exists is that a file's
// header text didn't match any known alias (or a cropped PDF region may
// have no reliable header row at all). The UI still displays whatever
// header-row text exists as the label for each index, so the user isn't
// picking blind.
export interface ColumnMapping {
  dateColumn: number;
  dateFormat: DateFormat;
  descriptionColumn: number;
  amountShape: AmountShape;
  referenceColumn: number | null;
}

// PDF-only. Coordinates are in PDF point space — the page's own unrotated
// userspace at scale 1, exactly the space `server/importers/
// pdfTextExtraction.ts`'s `TextItem.x`/`y` already uses. Chosen over canvas
// pixels (depends on render scale/device pixel ratio, not stable) and over
// normalized 0-1 fractions (a lossy round-trip for no benefit): pdfjs's own
// `PageViewport.convertToPdfPoint`/`convertToViewportPoint` already gives
// an exact, free two-way conversion to/from whatever pixel space the
// browser rendered at.
export interface PdfRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PdfCropPage {
  pageNumber: number; // 1-based, matches pdfjs's own page numbering
  cropRect: PdfRect;
}
