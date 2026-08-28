// Import Framework & Account Resolution delta (2026-08-26) §11-§14 — pure
// matching logic, no DB. An imported statement's account identifier is a
// source representation (a full account number, or a masked form like
// "XX0077"), not necessarily the exact string already on file — these two
// functions are the whole deterministic (non-ML) matching engine.

const MASK_PREFIX = /^[Xx*•]+/;

// A newly created Account gets these variants stored alongside the raw
// detected identifier (§13's example, illustrative account number:
// 00001234567890 -> 7890/XX7890/XXX7890) so a future statement showing any
// masked form of the same number resolves by exact match, not just the
// fuzzy path below.
export function deriveIdentifierVariants(identifier: string): string[] {
  if (identifier.length <= 4) return [];
  const last4 = identifier.slice(-4);
  return [last4, `XX${last4}`, `XXX${last4}`];
}

// Two identifiers are a "possible match" when one's significant (unmasked)
// suffix is a trailing suffix of the other's full string — covers every
// §11-§13 example: "XX66"/"XXX66"/"1234566" all share significant suffix
// "66"; a new "XXXXX66" observation matches all three the same way.
export function isPossibleIdentifierMatch(a: string, b: string): boolean {
  const sigA = a.replace(MASK_PREFIX, "");
  const sigB = b.replace(MASK_PREFIX, "");
  if (!sigA || !sigB) return false;
  return a.endsWith(sigB) || b.endsWith(sigA);
}
