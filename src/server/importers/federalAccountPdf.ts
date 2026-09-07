import { toMinorUnits, type ImportDirection, type NormalizedImportRow } from "@/core";
import { UnrecognizedImportFormatError } from "../services/errors";
import { MONTHS, parseAmount } from "./shared";
import { readItems, mergeAnchors, type TextItem } from "./pdfTextExtraction";
import type { ImportAdapter, ParsedFile } from "./types";

// First PDF adapter — a genuinely different shape from the XLS/CSV
// adapters: no cells/rows, just positioned text. Federal Bank statements
// are password-protected by the bank itself (never handled here at rest —
// the password is used once, for the single `getDocument()` call inside
// `readItems`, and is never written to a variable that outlives this
// function, let alone to disk/DB/logs). The pdfjs-dist text-extraction
// machinery itself (`readItems`/`mergeAnchors`/`TextItem`) lives in
// `pdfTextExtraction.ts` — shared with the PDF Custom Importer path,
// which needs the same positioned-text primitive but derives its own
// column anchors from a user-drawn crop region instead of this adapter's
// header-anchored approach.
const PDF_MAGIC = "%PDF-";
const DATE_ROW_PATTERN = /^\d{2}-[A-Za-z]{3}-\d{4}$/;
const ACCOUNT_NUMBER_PATTERN = /Account Number\s*:\s*(\d+)/i;
const INSTITUTION_MARKER = /Federal Bank/i;
// Column order in the "Tran Date / Value Date / Particulars / Tran Type /
// Tran ID / Cheque Details / Withdrawals / Deposits / Balance / DR/CR"
// table — fixed left-to-right, matches the x-anchors derived from the
// header row at parse time (index 2 is Particulars regardless of the
// header text's own exact wording).
const COLUMN = {
  date: 0,
  particulars: 2,
  tranId: 4,
  withdrawals: 6,
  deposits: 7,
} as const;
// Physical text lines within this y-distance are the same visual line
// (font metrics/rounding can put two same-line items a fraction of a point
// apart) — much smaller than the ~8.4pt gap observed between a
// transaction's first line and its wrapped Particulars continuation line.
const LINE_MERGE_TOLERANCE = 2;

// Column anchors come from wherever "Particulars" appears in the header —
// its own x plus every other header-row item's x, on that same page/line
// band. Deriving them from the header (rather than hardcoding pixel
// positions) survives minor per-statement layout drift, same "scan for the
// known header cells" principle the other adapters use for row indices.
function findColumnAnchors(items: TextItem[]): number[] | null {
  const marker = items.find((item) => item.str.trim() === "Particulars");
  if (!marker) return null;
  const band = items.filter((item) => item.page === marker.page && Math.abs(item.y - marker.y) < 15);
  return mergeAnchors(band.map((item) => item.x));
}

function nearestAnchorIndex(x: number, anchors: number[]): number {
  let best = 0;
  let bestDistance = Infinity;
  anchors.forEach((anchor, index) => {
    const distance = Math.abs(x - anchor);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

// Groups same-page items into physical visual lines (y-clustering, not an
// exact-equality check — see LINE_MERGE_TOLERANCE), then buckets each
// line's items into columns by nearest anchor. A transaction's wrapped
// Particulars continuation is its own physical line with content only in
// the Particulars bucket — real bank-statement text, not a synthetic
// alignment.
function buildLines(items: TextItem[], anchors: number[]): { page: number; y: number; columns: string[] }[] {
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    if (!byPage.has(item.page)) byPage.set(item.page, []);
    byPage.get(item.page)!.push(item);
  }

  const lines: { page: number; y: number; columns: string[] }[] = [];
  for (const [page, pageItems] of byPage) {
    const sorted = [...pageItems].sort((a, b) => b.y - a.y || a.x - b.x);
    let current: TextItem[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const columns = Array.from({ length: anchors.length }, () => "");
      for (const item of [...current].sort((a, b) => a.x - b.x)) {
        const index = nearestAnchorIndex(item.x, anchors);
        columns[index] = columns[index] ? `${columns[index]} ${item.str}`.trim() : item.str;
      }
      lines.push({ page, y: current[0].y, columns });
      current = [];
    };
    for (const item of sorted) {
      if (current.length > 0 && Math.abs(item.y - current[0].y) > LINE_MERGE_TOLERANCE) flush();
      current.push(item);
    }
    flush();
  }
  return lines;
}

// "04-APR-2026" -> "2026-04-04".
function toIsoDate(ddMonYyyy: string): string {
  const [dd, mon, yyyy] = ddMonYyyy.split("-");
  return `${yyyy}-${MONTHS[mon.toLowerCase()]}-${dd}`;
}

function findAccountIdentifier(items: TextItem[]): string | null {
  for (const item of items) {
    const match = ACCOUNT_NUMBER_PATTERN.exec(item.str);
    if (match) return match[1];
  }
  return null;
}

export const federalAccountPdfAdapter: ImportAdapter = {
  id: "federal.account.pdf",
  label: "Federal Bank Account (PDF)",
  institutionLabel: "Federal Bank",
  detect(filename: string, buffer: Buffer): boolean {
    if (!/\.pdf$/i.test(filename)) return false;
    return buffer.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC;
  },
  async parse(buffer: Buffer, minorUnitScale: number, password?: string): Promise<ParsedFile> {
    const items = await readItems(buffer, password);

    if (!items.some((item) => INSTITUTION_MARKER.test(item.str))) {
      throw new UnrecognizedImportFormatError(`expected a Federal Bank account statement`);
    }

    const anchors = findColumnAnchors(items);
    if (!anchors) {
      throw new UnrecognizedImportFormatError(`expected a Federal Bank account statement with a "Particulars" column`);
    }

    const accountIdentifier = findAccountIdentifier(items);
    const lines = buildLines(items, anchors);

    const normalized: NormalizedImportRow[] = [];
    let open: { date: string; particulars: string[]; tranId: string; withdrawals: string; deposits: string } | null =
      null;

    const finalize = () => {
      if (!open) return;
      const withdrawals = parseAmount(open.withdrawals);
      const deposits = parseAmount(open.deposits);
      let direction: ImportDirection | undefined;
      let amount = 0;
      if (withdrawals > 0) {
        direction = "debit";
        amount = withdrawals;
      } else if (deposits > 0) {
        direction = "credit";
        amount = deposits;
      }
      if (direction) {
        normalized.push({
          date: open.date,
          description: open.particulars.join(" ").trim(),
          amountMinor: toMinorUnits(amount, minorUnitScale),
          direction,
          reference: open.tranId || undefined,
        });
      }
      open = null;
    };

    for (const line of lines) {
      const dateCell = line.columns[COLUMN.date].trim();
      if (DATE_ROW_PATTERN.test(dateCell)) {
        finalize();
        open = {
          date: toIsoDate(dateCell),
          particulars: [line.columns[COLUMN.particulars].trim()].filter(Boolean),
          tranId: line.columns[COLUMN.tranId].trim(),
          withdrawals: line.columns[COLUMN.withdrawals],
          deposits: line.columns[COLUMN.deposits],
        };
      } else if (open) {
        const continuation = line.columns[COLUMN.particulars].trim();
        if (continuation) open.particulars.push(continuation);
      }
    }
    finalize();

    return { rows: normalized, accountIdentifier };
  },
};
