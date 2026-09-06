// Node -> Python subprocess bridge (Portfolio Adoption Plan, 2026-09-05 —
// the CAS-parsing decision: run the real `casparser` library locally
// rather than a from-scratch TS parser or a remote API, per Import
// Privacy, AGENTS.md rule #23). This module owns *only* the subprocess
// invocation; mapping the parsed result into Ledger's own rows lives in
// services/casImport.ts, which depends on this only through the
// `CasParserRunner` interface below — injectable so that mapping logic is
// unit-testable against a synthetic JSON fixture without spawning a real
// Python process (same DI posture as services/catalogue.ts's own
// injectable `fetchJson`).
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PasswordRequiredError, UnsupportedImportFormatError } from "../services/errors";

// `scripts/setup-python.mjs` (this repo's own `postinstall`) provisions an
// isolated `.venv` with `casparser` rather than touching the system
// Python — auto-detected here so CAS import works out of the box after a
// plain `pnpm install`, with no manual `LEDGER_PYTHON` env var required.
// `LEDGER_PYTHON` still wins when set, for anyone pointing at a different
// interpreter on purpose (a container image, a non-standard venv path).
function resolvePythonBin(): string {
  if (process.env.LEDGER_PYTHON) return process.env.LEDGER_PYTHON;
  const venvPython = path.join(
    process.cwd(),
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python3",
  );
  if (existsSync(venvPython)) return venvPython;
  return "python3";
}

// Raw shape `casparser`'s own `output="json"` produces (verified against
// the real installed library — `casparser.types.{CASData,NSDLCASData}` —
// via `.venv/bin/python3 -c "...model_json_schema()..."`, not guessed).
// `casparser.read_cas_pdf` auto-detects the statement type from the PDF
// itself and returns one of two shapes; `file_type` is present on both and
// is the clean discriminator (`isEcasResult` below) — CAMS/KFin CAS has
// `folios` (mapped since the original Portfolio Adoption Plan), NSDL/CDSL
// eCAS has `accounts` (demat holdings, no transaction history — Stock
// tradebook import plan, Phase 3).
export type CasFileType = "CAMS" | "KFINTECH" | "CDSL" | "NSDL" | "UNKNOWN";

export interface CasParserFolio {
  folio: string;
  amc: string;
  PAN: string;
  schemes: CasParserScheme[];
}

export interface CasParserScheme {
  scheme: string;
  isin: string | null;
  amfi: string | null;
  type: string;
  close: number;
  transactions: CasParserTransaction[];
}

export interface CasParserTransaction {
  date: string;
  description: string;
  amount: number | null;
  units: number | null;
  nav: number | null;
  balance: number | null;
  type: string;
}

export interface CasParserResult {
  file_type: CasFileType;
  folios: CasParserFolio[];
  statement_period: { from_: string; to: string };
}

// NSDL/CDSL eCAS — a holdings *snapshot* across one or more demat accounts,
// no transaction history at all (casparser.types.NSDLCASData). Only the
// `equities` array is read by Ledger's own mapping (services/
// ecasImport.ts) — `mutual_funds`/`bonds` exist on the real type but are a
// deliberate V1 cut (demat-held MF already has its own path via MF CAS;
// Ledger has no BOND instrument type to receive one), so they're typed as
// `unknown[]` here — present in the JSON, intentionally never read.
export interface EcasParserOwner {
  name: string;
  PAN: string;
}

export interface EcasParserEquity {
  name: string;
  isin: string | null;
  num_shares: number;
  price: number | null;
  value: number | null;
  // casparser backfills these from its own ISIN database when the eCAS
  // itself only prints the ISIN — exactly what unlocks NSE/Yahoo pricing
  // for an eCAS-only holding (services/ecasImport.ts).
  symbol: string | null;
  exchange: string | null;
}

export interface EcasParserAccount {
  name: string;
  type: string;
  dp_id: string | null;
  client_id: string | null;
  owners: EcasParserOwner[];
  equities: EcasParserEquity[];
  mutual_funds: unknown[];
  bonds: unknown[];
}

export interface EcasParserResult {
  file_type: CasFileType;
  accounts: EcasParserAccount[];
  statement_period: { from_: string; to: string };
}

export function isEcasResult(parsed: CasParserResult | EcasParserResult): parsed is EcasParserResult {
  return parsed.file_type === "CDSL" || parsed.file_type === "NSDL";
}

export type CasParserRunner = (
  pdfBytes: Buffer,
  password: string,
) => Promise<CasParserResult | EcasParserResult>;

const EXIT_BAD_PASSWORD = 2;

// Real implementation — writes the PDF to a throwaway temp file (casparser
// needs a path, not a Buffer), runs the bridge script, always deletes the
// temp file whether parsing succeeded or not. The PDF's bytes and the
// password never touch anything but this one local subprocess and a temp
// file on the same machine — nothing is sent anywhere (rule #23), and
// nothing is left behind afterward (rule #24 — no import artifact becomes
// a persisted file).
export const runCasParser: CasParserRunner = async (pdfBytes, password) => {
  const tmpPath = path.join(tmpdir(), `ledger-cas-${crypto.randomUUID()}.pdf`);
  writeFileSync(tmpPath, pdfBytes);

  try {
    const { stdout, stderr, exitCode } = await runPython(tmpPath, password);
    if (exitCode === EXIT_BAD_PASSWORD) {
      throw new PasswordRequiredError("incorrect");
    }
    if (exitCode !== 0) {
      throw new UnsupportedImportFormatError(stderr.trim() || "could not parse this CAS PDF");
    }
    return JSON.parse(stdout) as CasParserResult | EcasParserResult;
  } finally {
    unlinkSync(tmpPath);
  }
};

function runPython(
  pdfPath: string,
  password: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const pythonBin = resolvePythonBin();
    const scriptPath = path.join(process.cwd(), "scripts", "cas_parser.py");
    const child = spawn(pythonBin, [scriptPath, pdfPath, password]);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode: exitCode ?? 1 }));
  });
}
