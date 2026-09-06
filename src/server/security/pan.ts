// PAN (Permanent Account Number, the identifier a CAS PDF is usually
// password-protected with) encrypted at rest — Portfolio Adoption Plan
// (2026-09-05) §1 "PAN hash/encryption pattern, adopt now". Node's
// built-in `crypto` (AES-256-GCM), no new dependency — same minimal-
// dependency posture as security/password.ts's scrypt.
//
// The key is a 32-byte secret generated once and persisted as a file
// under DATA_DIR (`pan.key`) — mirrors Folioman's own Fernet-key
// bootstrap (`_ensure_fernet_key()`), and this codebase's existing
// "generate on first use, persist alongside the DB" posture for anything
// instance-level (e.g. `backupSettings`'s singleton row). Never derived
// from a user password — there is no PAN-holder login step to derive one
// from, and the whole point is decrypting server-side without the user
// present (e.g. inside a CAS import).
import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../persistence/client";

const ALGORITHM = "aes-256-gcm";

// `keyDir` defaults to the real DATA_DIR but is overridable — tests inject
// an isolated tmp dir instead of writing a real key file into this repo's
// own `data/` directory (the same reason backups.test.ts/reset.test.ts use
// `mkdtempSync` rather than the real DATA_DIR).
function loadOrCreateKey(keyDir: string): Buffer {
  const keyPath = path.join(keyDir, "pan.key");
  if (!existsSync(/* turbopackIgnore: true */ keyPath)) {
    if (!existsSync(/* turbopackIgnore: true */ keyDir)) {
      mkdirSync(/* turbopackIgnore: true */ keyDir, { recursive: true });
    }
    writeFileSync(/* turbopackIgnore: true */ keyPath, randomBytes(32));
  }
  return readFileSync(/* turbopackIgnore: true */ keyPath);
}

// Encrypts to `iv:authTag:ciphertext`, each base64 — a single text column
// value (schema.ts's `profiles.panEncrypted`), no separate IV/tag columns
// to keep in sync.
export function encryptPan(pan: string, keyDir: string = DATA_DIR): string {
  const key = loadOrCreateKey(keyDir);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(pan, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptPan(encrypted: string, keyDir: string = DATA_DIR): string {
  const key = loadOrCreateKey(keyDir);
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted PAN value");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// SHA-256 digest for equality/lookup without decrypting (`profiles.panHash`)
// — same purpose as Folioman's own `pan_hash`.
export function panHash(pan: string): string {
  return createHash("sha256").update(pan).digest("hex");
}

// Display-only, last 4 kept (e.g. "XXXXXX234F") — never the full value.
export function maskPan(pan: string): string {
  if (pan.length <= 4) return pan;
  return "X".repeat(pan.length - 4) + pan.slice(-4);
}
