import type { RawTable, PdfCropPage } from "@/core";
import { PasswordRequiredError } from "../services/errors";

// Shared pdfjs-dist text-position machinery — moved out of
// federalAccountPdf.ts (Ledger Custom Importer delta) so the PDF Custom
// Importer path (`extractCroppedTable`/`getPageCount` below) can reuse the
// same subprocess-free, local-only extraction Federal Bank's own adapter
// already established, instead of a second implementation.

// Header cells that sit close enough in x to merge into one anchor are
// genuinely two lines of the same column label — not two different
// columns. Reused by both federalAccountPdf.ts's header-anchored columns
// and this file's crop-derived columns (mergeAnchors below).
const ANCHOR_MERGE_TOLERANCE = 6;
// Physical text lines within this y-distance are the same visual line
// (font metrics/rounding can put two same-line items a fraction of a
// point apart).
const LINE_MERGE_TOLERANCE = 2;

export interface TextItem {
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

export async function readItems(buffer: Buffer, password: string | undefined): Promise<TextItem[]> {
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

export async function getPageCount(buffer: Buffer, password?: string): Promise<number> {
  await registerWorker();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), password, verbosity: 0 }).promise;
    return doc.numPages;
  } catch (error) {
    if (error instanceof pdfjsLib.PasswordException) {
      throw new PasswordRequiredError(
        error.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD ? "incorrect" : "required",
      );
    }
    throw error;
  }
}

export function mergeAnchors(xs: number[]): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const merged: number[] = [];
  for (const x of sorted) {
    const last = merged[merged.length - 1];
    if (last === undefined || x - last > ANCHOR_MERGE_TOLERANCE) merged.push(x);
  }
  return merged;
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

// Groups same-page items into physical visual lines (y-clustering, not
// exact equality — see LINE_MERGE_TOLERANCE), then buckets each line's
// items into columns by nearest anchor.
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

// Custom Importer's own extraction: unlike federalAccountPdf.ts's
// header-anchored columns (needs a recognizable "Particulars"-style
// marker), a cropped region can't promise a header row exists at all —
// column anchors are instead derived from every in-crop item's own x
// position, across every selected page. Rows from every page are
// concatenated in page order into one RawTable; `headerRowIndex` is always
// null (a cropped region can't reliably promise the first row is a header
// — the column-mapping UI lets the user say so if it is).
export async function extractCroppedTable(
  buffer: Buffer,
  pages: readonly PdfCropPage[],
  password?: string,
): Promise<RawTable> {
  const items = await readItems(buffer, password);
  const cropByPage = new Map(pages.map((p) => [p.pageNumber, p.cropRect]));

  const inCrop = items.filter((item) => {
    const rect = cropByPage.get(item.page);
    if (!rect) return false;
    return item.x >= rect.x0 && item.x <= rect.x1 && item.y >= rect.y0 && item.y <= rect.y1;
  });

  const anchors = mergeAnchors(inCrop.map((item) => item.x));
  if (anchors.length === 0) return { rows: [], headerRowIndex: null };

  // Concatenate in the caller's own page order (not sorted by page number)
  // so a user who selects pages out of visual order still gets rows in
  // the order they intended.
  const rows: string[][] = [];
  for (const page of pages) {
    const pageItems = inCrop.filter((item) => item.page === page.pageNumber);
    const lines = buildLines(pageItems, anchors);
    for (const line of lines) rows.push(line.columns);
  }

  return { rows, headerRowIndex: null };
}
