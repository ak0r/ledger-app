// pdfjs-dist ships no type declarations for its worker entry point — it's
// only ever imported for its side effect (registering the in-process
// "fake worker" message handler, see federalAccountPdf.ts), never for a
// named export.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
