import type { ImportDirection } from "@/core";

// Cross-source reconciliation (GPay importer delta) — a wallet/UPI-app
// export and a Bank/CC statement can both describe the *same* real-world
// payment (GPay shows its own view of a UPI transfer, the bank shows that
// same transfer from its account's side), and importing both would
// double-book it. Pure, DB-independent — mirrors merge-eligibility.ts's
// own posture — so the same check runs client-side against live preview
// state without a server round trip; it only ever flags, never removes
// anything itself (this codebase's own "never auto-merge" posture for
// AccountIdentifier applies here just as much — a possible duplicate is
// still only ever a suggestion a person confirms).
export interface DuplicateCandidateRow {
  id: string;
  // The uploaded file this row came from — two rows from the *same*
  // source are never flagged against each other (a real statement/export
  // never lists its own transaction twice; matching within one source
  // would only ever produce false positives, e.g. two genuinely separate
  // same-day same-amount transfers).
  sourceKey: string;
  date: string;
  amountMinor: number;
  direction: ImportDirection;
  // The row's own resolved Account — unresolved rows (still pending a
  // manual pick) never match; two rows can only duplicate each other if
  // they'd both post against the very same real Account.
  accountId: string | null;
  // A UPI transaction ID (UTR) or similar cross-source identifier, when
  // the adapter found one (currently only axisAccountXls.ts's own
  // PARTICULARS-embedded UTR and gpayPdf.ts's "UPI Transaction ID" line) —
  // an exact match here is a near-certain duplicate, not just a
  // heuristic one.
  reference?: string;
  // "HH:MM" 24-hour, when the source shows one — compared only when
  // *both* sides have it (a typical bank statement doesn't).
  time?: string;
  // A comparable counterparty token, when the adapter's own format has
  // one to extract — compared only when *both* sides have it (a self-
  // transfer, ATM withdrawal, bank charge, or similar row legitimately
  // has no "other party").
  counterparty?: string;
}

export interface DuplicateMatch {
  id: string;
  matchedId: string;
  reason: "reference" | "heuristic";
}

// A same-day payment seen on two different clocks (a UPI app's own
// timestamp vs. whenever the bank actually posted/settled it) can
// legitimately drift a few minutes — this is *not* "how close is close
// enough to be the same transaction," it's "how much clock drift is
// normal before two same-day, same-amount rows stop being the same
// transaction and start being two different ones that happen to share a
// day and amount."
const TIME_WINDOW_MINUTES = 30;
// Below this length a token is usually noise (an initial, a truncated
// fragment, or a bank's own boilerplate like "AM"/"P2A") rather than a
// real signal — "IRAVATI R" reduces to {"IRAVATI"} against "iravati
// nath"'s {"IRAVATI","NATH"}, still a real shared-token match; "POONAM
// AM" reduces to {"POONAM"} the same way, "AM" itself never counts.
const MIN_TOKEN_LENGTH = 3;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((token) => token.length >= MIN_TOKEN_LENGTH),
  );
}

// Real bank/wallet narration for the *same* payment often uses
// completely different vocabulary for the counterparty (a self-transfer:
// GPay names the destination bank, the bank itself names the account
// holder; a saved contact nickname vs. the payee's full legal name) — a
// shared token is corroborating evidence when it's there, not a strict
// requirement, which is exactly why this only ever narrows the coarser
// date+amount heuristic pass, never gates the exact-reference one.
function hasSharedToken(a: string, b: string): boolean {
  const tokensA = tokenize(a);
  for (const token of tokenize(b)) {
    if (tokensA.has(token)) return true;
  }
  return false;
}

function timeGapMinutes(a: string, b: string): number {
  const [aHour, aMinute] = a.split(":").map(Number);
  const [bHour, bMinute] = b.split(":").map(Number);
  return Math.abs(aHour! * 60 + aMinute! - (bHour! * 60 + bMinute!));
}

// Same real-world UPI payment, seen from two ends: a bank statement's own
// "Paid by Axis Bank 5245" leg and GPay's own leg both carry the *same*
// UTR — an exact reference match is trusted outright. Without one on
// both sides, falls back to same account + same direction + same date +
// same amount, narrowed further by time-of-day (within
// `TIME_WINDOW_MINUTES`) and counterparty (`hasSharedToken`) whenever
// both sides actually have those — real but coarser (a genuinely
// legitimate same-day same-amount transfer between the same two people
// could still match; this is why it's a suggestion, never an automatic
// exclusion).
//
// ponytail: greedy first-match pairing, not a real bipartite matching —
// two rows in one source both ambiguously matching two rows in another
// (e.g. two identical ₹2,000 same-day heuristic matches) can pair up
// "wrong" specific rows. Harmless here (the flag itself stays directionally
// correct either way, and nothing is ever auto-removed) — upgrade to a
// real assignment algorithm if false pairings turn out to matter once
// this is used at real volume.
export function findPossibleDuplicates(rows: readonly DuplicateCandidateRow[]): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const matched = new Set<string>();

  // Two passes, not one: an exact reference match must win over a merely
  // coincidental heuristic one even when the heuristic candidate happens
  // to come first in iteration order (e.g. a same-day, same-amount, same-
  // account row that's actually a *different* payment, sitting right next
  // to the real match with the matching UTR) — a single combined pass
  // would greedily pair whichever candidate it meets first, reference or
  // not.
  function pass(isMatch: (a: DuplicateCandidateRow, b: DuplicateCandidateRow) => boolean, reason: DuplicateMatch["reason"]) {
    for (let i = 0; i < rows.length; i++) {
      const a = rows[i]!;
      if (!a.accountId || matched.has(a.id)) continue;

      for (let j = i + 1; j < rows.length; j++) {
        const b = rows[j]!;
        if (a.sourceKey === b.sourceKey) continue;
        if (!b.accountId || b.accountId !== a.accountId) continue;
        if (matched.has(b.id)) continue;
        if (a.direction !== b.direction) continue;
        if (!isMatch(a, b)) continue;

        matches.push({ id: a.id, matchedId: b.id, reason });
        matches.push({ id: b.id, matchedId: a.id, reason });
        matched.add(a.id);
        matched.add(b.id);
        break;
      }
    }
  }

  pass((a, b) => Boolean(a.reference && b.reference && a.reference === b.reference), "reference");
  pass((a, b) => {
    // A reference present on *both* sides that doesn't match is real
    // negative evidence (each UTR is unique to one real transaction) —
    // never let the coarser date/amount heuristic override that and
    // pair them anyway. Only falls through when at least one side has
    // no reference at all (a genuine unknown, not a contradiction).
    if (a.reference && b.reference && a.reference !== b.reference) return false;
    if (a.date !== b.date || a.amountMinor !== b.amountMinor) return false;
    // Both "if available" — a bank statement with no time-of-day, or a
    // row with no extractable counterparty (a self-transfer, ATM
    // withdrawal, bank charge), never blocks the match on that criterion
    // alone; only an actual mismatch when both sides do have a value
    // does.
    if (a.time && b.time && timeGapMinutes(a.time, b.time) > TIME_WINDOW_MINUTES) return false;
    if (a.counterparty && b.counterparty && !hasSharedToken(a.counterparty, b.counterparty)) return false;
    return true;
  }, "heuristic");

  return matches;
}
