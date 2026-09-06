#!/usr/bin/env node
// Runs automatically as `pnpm install`'s postinstall step (package.json) —
// sets up the one non-Node runtime dependency this codebase has
// (scripts/requirements.txt's own comment: Python 3 + casparser, for CAS
// PDF import only). Creates an isolated `.venv` rather than touching the
// system/global Python, so this never fights another project's packages.
//
// Deliberately never fails the overall `pnpm install` — every Ledger
// feature except Portfolio's CAS import works with zero Python at all, so
// a missing/broken Python toolchain here is a loud warning, not a reason
// to block installing the rest of the app.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const venvDir = path.join(root, ".venv");
const isWindows = process.platform === "win32";
const venvPython = path.join(venvDir, isWindows ? "Scripts" : "bin", isWindows ? "python.exe" : "python3");
const requirements = path.join(root, "scripts", "requirements.txt");

function warn(message) {
  console.warn(`\n[setup-python] ${message}\n`);
}

function findSystemPython() {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const systemPython = findSystemPython();
if (!systemPython) {
  warn(
    "No python3/python found on PATH. Portfolio's CAS import feature won't work until " +
      "Python 3 is installed — every other Ledger feature is unaffected. Once Python 3 is " +
      "installed, re-run `pnpm install` (or `node scripts/setup-python.mjs` directly).",
  );
  process.exit(0);
}

if (!existsSync(venvPython)) {
  console.log("[setup-python] creating .venv for CAS import...");
  const created = spawnSync(systemPython, ["-m", "venv", venvDir], { stdio: "inherit" });
  if (created.status !== 0) {
    warn("Failed to create .venv — see output above. Portfolio CAS import will not work until this is fixed.");
    process.exit(0);
  }
}

console.log("[setup-python] installing scripts/requirements.txt into .venv...");
const installed = spawnSync(venvPython, ["-m", "pip", "install", "-q", "-r", requirements], { stdio: "inherit" });
if (installed.status !== 0) {
  warn("Failed to install scripts/requirements.txt — see output above. Portfolio CAS import will not work until this is fixed.");
  process.exit(0);
}

console.log("[setup-python] casparser ready — Portfolio CAS import is available.");
