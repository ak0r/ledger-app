import { toMinorUnits, type ImportDirection, type NormalizedImportRow } from "@/core";
import { PasswordRequiredError, UnsupportedImportFormatError } from "../services/errors";
import { MONTHS, parseAmount } from "./shared";
import type { ImportAdapter, ParsedFile } from "./types";

// First PDF adapter — a genuinely different shape from the XLS/CSV
// adapters: no cells/rows, just positioned text. Federal Bank statements
// are password-protected by the bank itself (never handled here at rest —
// the password is used once, for the single `getDocument()` call below,
// and is never written to a variable that outlives this function, let
// alone to disk/DB/logs).
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
// Header cells that sit close enough in x to merge into one anchor are
// genuinely two lines of the same column label (e.g. "Tran"/"Type",
// "Cheque"/"Details") — not two different columns.
const ANCHOR_MERGE_TOLERANCE = 6;
// Physical text lines within this y-distance are the same visual line
// (font metrics/rounding can put two same-line items a fraction of a point
// apart) — much smaller than the ~8.4pt gap observed between a
// transaction's first line and its wrapped Particulars continuation line.
const LINE_MERGE_TOLERANCE = 2;

interface TextItem {
  str: string;
  x: number;
  y: number;
  page: number;
}

// pdfjs-dist's Node ("legacy") build normally spins up its text-extraction
// work via a dynamically-`import()`ed worker module — that dynamic import
// uses a runtime-computed path pdfjs builds internally, which Turbopack's
// server bundle can't resolve (it isn't a static specifier it can trace).
// Registering the worker module on `globalThis.pdfjsWorker` up front makes
// pdfjs use it directly instead, skipping that broken dynamic import
// entirely — the standard workaround for pdfjs-dist under bundlers other
// than webpack/vite (which its own internal import is hand-tuned for).
let workerRegistered = false;
async function registerWorker(): Promise<void> {
  if (workerRegistered) return;
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  workerRegistered = true;
}

async function readItems(buffer: Buffer, password: string | undefined): Promise<TextItem[]> {
  await registerWorker();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let doc;
  try {
    doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), password, verbosity: 0 }).promise;
  } catch (error) {
    if (error instanceof pdfjsLib.PasswordException) {
      throw new PasswordRequiredError(
        error.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD ? "incorrect" : "required",
      );
    }
    throw error;
  }

  const items: TextItem[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      // `getTextContent()` items can be `TextMarkedContent` (no `str`) —
      // narrow to the text-bearing shape before reading its position.
      if (!("str" in item) || item.str.trim() === "") continue;
      items.push({ str: item.str, x: item.transform[4], y: item.transform[5], page: pageNumber });
    }
  }
  return items;
}

function mergeAnchors(xs: number[]): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const merged: number[] = [];
  for (const x of sorted) {
    const last = merged[merged.length - 1];
    if (last === undefined || x - last > ANCHOR_MERGE_TOLERANCE) merged.push(x);
  }
  return merged;
}

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
      throw new UnsupportedImportFormatError(`expected a Federal Bank account statement`);
    }

    const anchors = findColumnAnchors(items);
    if (!anchors) {
      throw new UnsupportedImportFormatError(`expected a Federal Bank account statement with a "Particulars" column`);
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
