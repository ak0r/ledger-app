"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCOUNT_TYPES_BY_CLASSIFICATION, type AccountType, type Classification, type ImportDirection } from "@/core";
import type { AccountChoice, AccountResolution, ImportPreview, NewSourceAccountDescriptor } from "@/server/services/imports";
import {
  previewImportAction,
  commitImportAction,
  previewCustomXlsImportAction,
  previewCustomPdfImportAction,
  readRawXlsTableAction,
  getPdfPageCountAction,
  extractPdfCropPreviewAction,
} from "@/server/actions/imports";
import type { ColumnMapping, DateFormat, PdfCropPage, PdfRect, RawTable } from "@/core";
import { DATE_FORMATS } from "@/core";
import { cn, formatDate, formatMoney, humanizeEnum } from "@/lib/utils";
import { paginate } from "@/lib/pagination";
import {
  EMPTY_FILTER_STATE,
  filterTransactions,
  type TransactionFilterState,
} from "@/lib/transaction-filter";
import { findPossibleDuplicates, type DuplicateMatch } from "@/lib/duplicate-detection";
import type { TransactionWithPostings } from "@/server/services/transactions";
import { AccountIcon } from "@/components/account-icon";
import { TransactionFilterDrawer } from "@/components/transaction-filter-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical, X } from "lucide-react";

const PAGE_SIZES = [20, 50] as const;
const NEW_ACCOUNT = "__new__";

interface AccountOption {
  id: string;
  name: string;
  classification: Classification;
  icon?: string | null;
}

type Counterpart =
  | { type: "existing"; accountId: string }
  | { type: "new"; key: string; name: string; classification: "EXPENSE" | "INCOME" };

interface WorkspaceCandidate {
  clientRowId: string;
  fileKey: string;
  date: string;
  description: string;
  amountMinor: number;
  direction: ImportDirection;
  // Account Resolution delta §3 — null defers to the file's own resolved/
  // created account (finalized at commit); non-null is either that file's
  // resolution already confirmed, or a per-row override (GPay importer
  // delta's own per-row source-account resolution — a row whose own
  // identifier exact-matched a known Account, independent of whatever
  // this file's own single resolution came out to). The source/known
  // account is no longer a visible or editable per-row concept in the
  // review table (it lives in the Identified Accounts cards above) — this
  // field still carries the actual value forward to commit.
  knownAccountId: string | null;
  // The adapter-detected reference/UTR, time-of-day, and counterparty for
  // this row, if any (echoed straight from `PreviewCandidate`) — none of
  // these three are shown anywhere in this table, only used by
  // `findPossibleDuplicates` (cross-source reconciliation, GPay importer
  // delta) to spot the same real-world payment appearing in two different
  // uploaded statements.
  reference?: string;
  time?: string;
  counterparty?: string;
  // Server-computed at preview time, against already-*committed* history
  // only (`services/imports.ts`'s own `flagPossibleDuplicatesAgainstHistory`)
  // — the within-*session* cross-file check (`possibleDuplicatesById`
  // below) is a separate, client-computed signal; a row can be flagged by
  // either, both, or neither.
  possibleDuplicateOfCommitted: DuplicateMatch["reason"] | null;
  // GPay importer delta — a row whose own identifier didn't exact-match
  // an existing Account (`knownAccountId` stays null for it). Carries the
  // *full* proposal inline, same posture `counterpart`'s own "new" case
  // already has, rather than a bare key needing a separate lookup map —
  // this is what used to silently fall back to the file's single default
  // account instead of ever becoming its own "new Account" card (the
  // actual bug reported against the running app).
  proposedSourceAccount: NewSourceAccountDescriptor | null;
  counterpart: Counterpart;
}

interface WorkspaceFile {
  fileKey: string;
  filename: string;
  status: "success" | "failed";
  // Only set when status is "failed" — the adapter/parse error message,
  // shown on the file card instead of the count/range/flow lines. A failed
  // file never gets any candidates, so it can't contribute to totals or the
  // transaction preview no matter what.
  errorMessage?: string;
  source: string | null;
  // The adapter-detected identifier + the server's original resolution
  // guess — kept for display context (e.g. "Possible match" vs "Resolved")
  // even after the user overrides `accountChoice` via the ⫶ menu. Null
  // alongside `resolution`/`accountChoice` for a failed file.
  identifier: string | null;
  resolution: AccountResolution | null;
  accountChoice: AccountChoice | null;
  // Retained (unlike before the Ledger Custom Importer delta, which
  // dropped it once `handleFileUploaded` returned) so "Use Custom Importer
  // instead" can re-run configuration against the same bytes without
  // asking the user to re-upload — for a success card as an explicit
  // opt-out of a matched adapter, for a failed card to retry manually.
  fileBase64: string;
}

function isSuccessFile(
  file: WorkspaceFile,
): file is WorkspaceFile & { source: string; resolution: AccountResolution; accountChoice: AccountChoice } {
  return file.status === "success";
}

// "Paid"/"Received" (spec: never show raw Dr/Cr) — debit is money the
// statement's own account paid out, credit is money it received.
function directionLabel(direction: string): string {
  return direction === "debit" ? "Paid" : direction === "credit" ? "Received" : "";
}

function directionColor(direction: string): string {
  return direction === "debit" ? "text-destructive" : "text-success";
}

function defaultAccountChoice(resolution: AccountResolution, accounts: AccountOption[]): AccountChoice {
  if (resolution.status === "resolved" && resolution.resolvedAccountId) {
    return { type: "existing", accountId: resolution.resolvedAccountId };
  }
  if (resolution.status === "possibleMatch" || resolution.status === "ambiguous") {
    // A provisional guess, not a silent decision — the Identified Accounts
    // section always stays visible with the full candidate list, and
    // nothing commits until Approve (delta §13/§15).
    return { type: "existing", accountId: resolution.candidates[0].accountId };
  }
  if (resolution.status === "new" && resolution.proposedName) {
    return { type: "new", name: resolution.proposedName, classification: resolution.proposedClassification, accountType: resolution.proposedAccountType };
  }
  // "unidentified" (e.g. generic CSV) — no statement-derived identity at all.
  return accounts[0]
    ? { type: "existing", accountId: accounts[0].id }
    : { type: "new", name: "", classification: "ASSET", accountType: "BANK" };
}

function accountChoiceKnownAccountId(choice: AccountChoice): string | null {
  return choice.type === "existing" ? choice.accountId : null;
}

// Unified editing shape for the "Change Account" dialog, used for both
// source-account cards (Asset/Liability + Account Type) and counterpart-
// account cards (Expense/Income — the picker itself is hidden for these,
// `showAccountType={false}`, but the server still assigns a default
// Account Type per classification, imports.ts). Converts to/from the
// server's two distinct shapes (`AccountChoice`/`Counterpart`) only at the
// edges (see the `*To*`/`*From*` helpers below).
interface ResolutionChoice {
  type: "existing" | "new";
  accountId?: string;
  name?: string;
  classification?: Classification;
  accountType?: AccountType;
}

function classificationLabel(classification: string): string {
  switch (classification) {
    case "LIABILITY":
      return "Liability";
    case "EXPENSE":
      return "Expense";
    case "INCOME":
      return "Income";
    default:
      return "Asset";
  }
}

// "01491750000077" -> "••••0077" — same masked convention the proposed
// new-account name already uses (delta §16).
function maskIdentifier(identifier: string): string {
  return identifier.length <= 4 ? identifier : `••••${identifier.slice(-4)}`;
}

function accountChoiceToResolutionChoice(choice: AccountChoice): ResolutionChoice {
  return choice.type === "existing"
    ? { type: "existing", accountId: choice.accountId }
    : { type: "new", name: choice.name, classification: choice.classification, accountType: choice.accountType };
}

function resolutionChoiceToAccountChoice(choice: ResolutionChoice): AccountChoice {
  if (choice.type === "existing") return { type: "existing", accountId: choice.accountId ?? "" };
  const classification = choice.classification === "LIABILITY" ? "LIABILITY" : "ASSET";
  return { type: "new", name: choice.name ?? "", classification, accountType: choice.accountType ?? "BANK" };
}

// GPay importer delta — same shape as `accountChoiceToResolutionChoice`,
// for a per-row new-Account proposal instead of a whole file's default.
function proposalToResolutionChoice(proposal: NewSourceAccountDescriptor): ResolutionChoice {
  return { type: "new", name: proposal.name, classification: proposal.classification, accountType: proposal.accountType };
}

// Counterpart accounts (Expense/Income catch-alls) carry no Account Type
// of their own — the picker is hidden for these cards (`showAccountType`
// below), same default-bucket mapping as the server's own
// (imports.ts, "same default bucket as the accountType backfill migration").
function counterpartToResolutionChoice(counterpart: Counterpart): ResolutionChoice {
  return counterpart.type === "existing"
    ? { type: "existing", accountId: counterpart.accountId }
    : {
        type: "new",
        name: counterpart.name,
        classification: counterpart.classification,
        accountType: counterpart.classification === "EXPENSE" ? "VARIABLE" : "EARNED",
      };
}

function resolutionChoiceToCounterpart(choice: ResolutionChoice): Counterpart {
  if (choice.type === "existing") return { type: "existing", accountId: choice.accountId ?? "" };
  const classification = choice.classification === "INCOME" ? "INCOME" : "EXPENSE";
  const name = choice.name ?? "";
  return { type: "new", key: `${classification}:${name.trim().toLowerCase()}`, name, classification };
}

function counterpartGroupKey(counterpart: Counterpart): string {
  return counterpart.type === "existing" ? `existing:${counterpart.accountId}` : `new:${counterpart.key}`;
}

// A source account is identified by its resolved real account (existing) or
// by the statement identifier it carries (new — falls back to the file's
// own key when the adapter found no identifier at all) — two files
// resolving to the same account collapse into one Identified Accounts card
// with combined totals, rather than one card per file.
function sourceGroupKey(file: WorkspaceFile & { accountChoice: AccountChoice }): string {
  return file.accountChoice.type === "existing"
    ? `existing:${file.accountChoice.accountId}`
    : `new:${file.identifier ?? file.fileKey}`;
}

// Resolves a `Counterpart`/source `AccountChoice` into the shape `AccountLabel`
// needs, for both real accounts (looked up by id) and not-yet-created
// proposals (classification comes from the choice itself, no icon yet).
function counterpartAccountView(
  counterpart: Counterpart,
  accountsById: Map<string, AccountOption>,
): { name: string; classification: Classification; icon?: string | null; isNew: boolean } {
  if (counterpart.type === "existing") {
    const account = accountsById.get(counterpart.accountId);
    return { name: account?.name ?? counterpart.accountId, classification: account?.classification ?? "EXPENSE", icon: account?.icon, isNew: false };
  }
  return { name: counterpart.name || "(unnamed)", classification: counterpart.classification, isNew: true };
}

function sourceAccountView(
  choice: AccountChoice,
  accountsById: Map<string, AccountOption>,
): { name: string; classification: Classification; icon?: string | null; isNew: boolean } {
  if (choice.type === "existing") {
    const account = accountsById.get(choice.accountId);
    return { name: account?.name ?? choice.accountId, classification: account?.classification ?? "ASSET", icon: account?.icon, isNew: false };
  }
  return { name: choice.name || "(unnamed)", classification: choice.classification, isNew: true };
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Synthesizes a minimal `TransactionWithPostings`-shaped object per
// candidate so the *real* `filterTransactions` (transaction-filter.ts) can
// run unmodified against import rows — same filter engine the Transactions
// page uses, not a second implementation. Posting sides mirror real
// double-entry semantics: a "debit" row means the statement's own account
// was credited (money left it) and the counterpart was debited (money
// arrived there) — reversed for "credit". `accountsById` isn't read by the
// evaluator today (see that file's own comment), so unresolved/"new"
// accounts on either side just need a stable placeholder id, not a real one.
function toFilterableTransaction(
  candidate: WorkspaceCandidate,
  sourceAccountId: string,
): TransactionWithPostings {
  const counterpartId =
    candidate.counterpart.type === "existing" ? candidate.counterpart.accountId : candidate.counterpart.key;
  const [creditAccountId, debitAccountId] =
    candidate.direction === "debit" ? [sourceAccountId, counterpartId] : [counterpartId, sourceAccountId];
  return {
    id: candidate.clientRowId,
    profileId: "",
    date: candidate.date,
    description: candidate.description,
    tags: [],
    importFileId: null,
    reference: candidate.reference ?? null,
    counterparty: candidate.counterparty ?? null,
    createdAt: "",
    updatedAt: "",
    postings: [
      { id: `${candidate.clientRowId}-credit`, transactionId: candidate.clientRowId, accountId: creditAccountId, units: -candidate.amountMinor, priceNum: 1, priceDenom: 1, baseAmount: -candidate.amountMinor, createdAt: "", updatedAt: "" },
      { id: `${candidate.clientRowId}-debit`, transactionId: candidate.clientRowId, accountId: debitAccountId, units: candidate.amountMinor, priceNum: 1, priceDenom: 1, baseAmount: candidate.amountMinor, createdAt: "", updatedAt: "" },
    ],
  };
}

// Small helper used everywhere an account name needs the app's existing
// classification color (account-icon.tsx's `AccountIcon`) applied to the
// name text, not just the icon glyph — no other screen colors account name
// text yet, so this stays local to Import rather than becoming a new
// cross-app component.
const CLASSIFICATION_TEXT_COLOR: Record<Classification, string> = {
  ASSET: "text-category-asset",
  LIABILITY: "text-category-liability",
  INCOME: "text-category-income",
  EXPENSE: "text-category-expense",
  BALANCING: "text-category-balancing",
};

function AccountLabel({
  name,
  classification,
  icon,
  isNew,
}: {
  name: string;
  classification: Classification;
  icon?: string | null;
  isNew?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <AccountIcon classification={classification} icon={icon} />
      <span className={CLASSIFICATION_TEXT_COLOR[classification]}>{name}</span>
      {isNew && (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          New
        </Badge>
      )}
    </span>
  );
}

// Cross-source reconciliation (GPay importer delta) — informational only,
// never pre-selects or excludes the row itself (this codebase's own
// "never auto-merge" posture, same as an AccountIdentifier possible
// match). Two independent signals feed this: `sessionMatch` (client-
// computed, against other candidates in *this* import workspace) and
// `committedReason` (server-computed at preview time, against Postings
// already in the Ledger) — a row can be flagged by either, both, or
// neither. The committed one wins the label when both apply: "already in
// your ledger" is a stronger, more specific claim than "also appears in
// another file you haven't committed yet."
function PossibleDuplicateBadge({
  sessionMatch,
  committedReason,
}: {
  sessionMatch: DuplicateMatch | undefined;
  committedReason: DuplicateMatch["reason"] | null | undefined;
}) {
  const reason = committedReason ?? sessionMatch?.reason;
  if (!reason) return null;

  const isCommitted = Boolean(committedReason);
  const label = reason === "reference" ? "Likely duplicate" : "Possible duplicate";
  const title = isCommitted
    ? reason === "reference"
      ? "Same UPI transaction ID as a Transaction already in your Ledger."
      : "Same date, amount, and account as a Transaction already in your Ledger."
    : reason === "reference"
      ? "Same UPI transaction ID as another uploaded row — almost certainly already recorded elsewhere in this import."
      : "Same date, amount, and account as another uploaded row — may already be recorded elsewhere in this import.";

  return (
    <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground" title={title}>
      {label}
      {isCommitted ? " (in ledger)" : ""}
    </Badge>
  );
}

// No persisted staging (Import Workflow delta §15) — everything below is
// local component state for the length of one review session. Reloading
// the page loses it, same as Phase 1's original single-file flow.
export function ImportWorkspace({
  accounts,
  currencySymbol,
  currencyScale,
}: {
  accounts: AccountOption[];
  currencySymbol: string;
  currencyScale: number;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Password-protected import files (Federal Bank Account PDF adapter) —
  // holds the file bytes only long enough to retry the preview call once
  // the user supplies a password. The password itself never lands in this
  // state; it's a local `useState` inside PasswordPromptDialog, which only
  // mounts while this is non-null and unmounts (discarding it) the moment
  // it's cleared below — never stored beyond that one retry.
  const [pendingPasswordFile, setPendingPasswordFile] = useState<{
    filename: string;
    fileBase64: string;
    fileKey: string;
    incorrect: boolean;
  } | null>(null);

  // Ledger Custom Importer delta — mirrors `pendingPasswordFile` above: no
  // registered adapter recognized this file (`CUSTOM_IMPORTER_REQUIRED`),
  // or the user explicitly chose "Use Custom Importer instead" on an
  // already-uploaded file's menu. Holds only what's needed to configure
  // it; nothing here is persisted until the resulting preview is approved
  // through the exact same commit path every other file uses.
  const [pendingCustomImportFile, setPendingCustomImportFile] = useState<{
    filename: string;
    fileBase64: string;
    fileKey: string;
  } | null>(null);

  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [candidates, setCandidates] = useState<WorkspaceCandidate[]>([]);
  const [resolutionDialog, setResolutionDialog] = useState<
    | { kind: "source"; groupKey: string }
    | { kind: "sourceProposal"; groupKey: string }
    | { kind: "counterpart"; groupKey: string }
    | null
  >(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [bulkDialog, setBulkDialog] = useState<"counterpart" | "direction" | null>(null);

  const [filterState, setFilterState] = useState<TransactionFilterState>(EMPTY_FILTER_STATE);
  const [sort, setSort] = useState<{ field: "date" | "amount"; direction: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);

  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const filesByKey = useMemo(() => new Map(files.map((file) => [file.fileKey, file])), [files]);

  // One card per distinct *resolved* source account, not one per uploaded
  // file — two files resolving to the same account (e.g. two months of one
  // HDFC statement) combine into a single card with summed totals.
  // Three kinds of card now, not one (GPay importer delta — the real bug
  // this fixes: every candidate used to be attributed to its *file's* own
  // single default account, even a row that had actually resolved (or
  // proposed a brand new Account) per-row and had nothing to do with that
  // default at all):
  //   - "file": today's original behavior, unchanged — a file's own
  //     single default, but now only over whichever of its candidates
  //     *didn't* get their own per-row resolution or proposal.
  //   - "resolved": a real Account a candidate resolved to per-row (Stone
  //     1) that differs from every uploaded file's own default — e.g. a
  //     GPay row landing on an already-tracked Axis account with no Axis
  //     statement uploaded this session at all.
  //   - "proposal": a per-row identifier that matched nothing existing —
  //     its own new-Account card, correctly typed (Asset/BANK vs.
  //     Liability/CREDIT_CARD, whatever the adapter determined), instead
  //     of silently vanishing into a "file" card's totals.
  type SourceGroup =
    | { kind: "file"; groupKey: string; fileKeys: string[]; filenames: string[]; accountChoice: AccountChoice; resolution: AccountResolution; identifier: string | null; transactionCount: number; inflowMinor: number; outflowMinor: number }
    | { kind: "resolved"; groupKey: string; accountId: string; transactionCount: number; inflowMinor: number; outflowMinor: number }
    | { kind: "proposal"; groupKey: string; proposal: NewSourceAccountDescriptor; transactionCount: number; inflowMinor: number; outflowMinor: number };

  const sourceGroups = useMemo<SourceGroup[]>(() => {
    const fileDefaultByFileKey = new Map<string, string | null>();
    for (const file of files) {
      if (isSuccessFile(file)) fileDefaultByFileKey.set(file.fileKey, accountChoiceKnownAccountId(file.accountChoice));
    }

    const resolvedById = new Map<string, WorkspaceCandidate[]>();
    const proposalsByKey = new Map<string, { proposal: NewSourceAccountDescriptor; rows: WorkspaceCandidate[] }>();
    const remainderByFileKey = new Map<string, WorkspaceCandidate[]>();

    for (const candidate of candidates) {
      if (candidate.proposedSourceAccount) {
        const key = candidate.proposedSourceAccount.key;
        const entry = proposalsByKey.get(key);
        if (entry) entry.rows.push(candidate);
        else proposalsByKey.set(key, { proposal: candidate.proposedSourceAccount, rows: [candidate] });
        continue;
      }
      const fileDefault = fileDefaultByFileKey.get(candidate.fileKey) ?? null;
      if (candidate.knownAccountId && candidate.knownAccountId !== fileDefault) {
        const list = resolvedById.get(candidate.knownAccountId) ?? [];
        list.push(candidate);
        resolvedById.set(candidate.knownAccountId, list);
        continue;
      }
      const list = remainderByFileKey.get(candidate.fileKey) ?? [];
      list.push(candidate);
      remainderByFileKey.set(candidate.fileKey, list);
    }

    const totals = (rows: WorkspaceCandidate[]) => ({
      transactionCount: rows.length,
      inflowMinor: rows.filter((c) => c.direction === "credit").reduce((s, c) => s + c.amountMinor, 0),
      outflowMinor: rows.filter((c) => c.direction === "debit").reduce((s, c) => s + c.amountMinor, 0),
    });

    const groups: SourceGroup[] = [];
    for (const [accountId, rows] of resolvedById) {
      groups.push({ kind: "resolved", groupKey: `resolved:${accountId}`, accountId, ...totals(rows) });
    }
    for (const [key, entry] of proposalsByKey) {
      groups.push({ kind: "proposal", groupKey: `proposal:${key}`, proposal: entry.proposal, ...totals(entry.rows) });
    }

    const byFileGroupKey = new Map<
      string,
      { groupKey: string; fileKeys: string[]; filenames: string[]; accountChoice: AccountChoice; resolution: AccountResolution; identifier: string | null; rows: WorkspaceCandidate[] }
    >();
    for (const file of files) {
      if (!isSuccessFile(file)) continue;
      const remainder = remainderByFileKey.get(file.fileKey) ?? [];
      if (remainder.length === 0) continue;
      const groupKey = sourceGroupKey(file);
      const entry = byFileGroupKey.get(groupKey);
      if (entry) {
        entry.fileKeys.push(file.fileKey);
        entry.filenames.push(file.filename);
        entry.rows.push(...remainder);
        if (!entry.identifier && file.identifier) entry.identifier = file.identifier;
      } else {
        byFileGroupKey.set(groupKey, {
          groupKey,
          fileKeys: [file.fileKey],
          filenames: [file.filename],
          accountChoice: file.accountChoice,
          resolution: file.resolution,
          identifier: file.identifier,
          rows: [...remainder],
        });
      }
    }
    for (const entry of byFileGroupKey.values()) {
      groups.push({ kind: "file", groupKey: entry.groupKey, fileKeys: entry.fileKeys, filenames: entry.filenames, accountChoice: entry.accountChoice, resolution: entry.resolution, identifier: entry.identifier, ...totals(entry.rows) });
    }

    return groups;
  }, [files, candidates]);

  // One entry per distinct counterpart account actually referenced by any
  // candidate right now — recomputed live from `candidates`, never from the
  // original preview response, so editing a row's counterpart immediately
  // re-groups it (Import Workflow delta §7/§8). Counterpart resolutions are
  // account-resolution results just like the per-file source account —
  // "Unknown (Expense)"/"Unknown (Income)" are proposed accounts, not a
  // special temporary import bucket (Account Resolution delta).
  const counterpartGroups = useMemo(() => {
    const byGroupKey = new Map<
      string,
      { groupKey: string; counterpart: Counterpart; count: number; inflowMinor: number; outflowMinor: number }
    >();
    for (const candidate of candidates) {
      const groupKey = counterpartGroupKey(candidate.counterpart);
      // Mirror of the source account's own perspective: money that left the
      // source (a "debit" row) is money the counterpart received.
      const isInflow = candidate.direction === "debit";
      const entry = byGroupKey.get(groupKey);
      if (entry) {
        entry.count += 1;
        if (isInflow) entry.inflowMinor += candidate.amountMinor;
        else entry.outflowMinor += candidate.amountMinor;
      } else {
        byGroupKey.set(groupKey, {
          groupKey,
          counterpart: candidate.counterpart,
          count: 1,
          inflowMinor: isInflow ? candidate.amountMinor : 0,
          outflowMinor: isInflow ? 0 : candidate.amountMinor,
        });
      }
    }
    return [...byGroupKey.values()];
  }, [candidates]);

  const pendingNewAccounts = useMemo(
    () =>
      counterpartGroups
        .filter((group): group is typeof group & { counterpart: Extract<Counterpart, { type: "new" }> } => group.counterpart.type === "new")
        .map((group) => ({ key: group.counterpart.key, name: group.counterpart.name, classification: group.counterpart.classification })),
    [counterpartGroups],
  );

  // GPay importer delta — mirrors `pendingNewAccounts` above, but for
  // per-row source-Account proposals still present on any candidate
  // (`proposedSourceAccount` is null once a candidate is redirected to an
  // existing Account instead — see `setSourceProposalChoice`).
  const pendingNewSourceAccounts = useMemo(() => {
    const byKey = new Map<string, NewSourceAccountDescriptor>();
    for (const candidate of candidates) {
      if (candidate.proposedSourceAccount) byKey.set(candidate.proposedSourceAccount.key, candidate.proposedSourceAccount);
    }
    return [...byKey.values()];
  }, [candidates]);

  // Per-file stats for the file cards — date range/count/inflow/outflow are
  // never computed server-side beyond the file-level transactionCount at
  // preview time (see imports.ts's own comment), so this derives them from
  // that file's own candidates, same math as the account-level aggregates.
  const fileStatsByKey = useMemo(() => {
    const map = new Map<string, { count: number; inflowMinor: number; outflowMinor: number; dateStart: string | null; dateEnd: string | null }>();
    for (const file of files) {
      const fileCandidates = candidates.filter((c) => c.fileKey === file.fileKey);
      const inflowMinor = fileCandidates.filter((c) => c.direction === "credit").reduce((s, c) => s + c.amountMinor, 0);
      const outflowMinor = fileCandidates.filter((c) => c.direction === "debit").reduce((s, c) => s + c.amountMinor, 0);
      const dates = fileCandidates.map((c) => c.date).sort();
      map.set(file.fileKey, { count: fileCandidates.length, inflowMinor, outflowMinor, dateStart: dates[0] ?? null, dateEnd: dates[dates.length - 1] ?? null });
    }
    return map;
  }, [files, candidates]);

  // Cross-source reconciliation (GPay importer delta) — recomputed live
  // from `candidates`, same posture as every other derived-from-candidates
  // value above. A `Map` keyed by clientRowId so a table row's lookup
  // stays O(1). Purely informational (never removes or auto-excludes a
  // row) — `findPossibleDuplicates` itself is pure/DB-independent, so this
  // is the whole integration, no server round trip.
  const possibleDuplicatesById = useMemo(() => {
    const matches = findPossibleDuplicates(
      candidates.map((c) => ({
        id: c.clientRowId,
        sourceKey: c.fileKey,
        date: c.date,
        amountMinor: c.amountMinor,
        direction: c.direction,
        accountId: c.knownAccountId,
        reference: c.reference,
        time: c.time,
        counterparty: c.counterparty,
      })),
    );
    return new Map<string, DuplicateMatch>(matches.map((m) => [m.id, m]));
  }, [candidates]);

  const summary = useMemo(() => {
    const inflowMinor = candidates.filter((c) => c.direction === "credit").reduce((s, c) => s + c.amountMinor, 0);
    const outflowMinor = candidates.filter((c) => c.direction === "debit").reduce((s, c) => s + c.amountMinor, 0);
    return { fileCount: files.length, transactionCount: candidates.length, inflowMinor, outflowMinor };
  }, [files, candidates]);

  // Effective source account id per candidate — real id when resolved,
  // else a stable per-file placeholder (only used for filtering identity,
  // never sent to the server).
  function effectiveSourceAccountId(candidate: WorkspaceCandidate): string {
    if (candidate.knownAccountId) return candidate.knownAccountId;
    const file = filesByKey.get(candidate.fileKey);
    return `new-source:${file?.identifier ?? candidate.fileKey}`;
  }

  const visibleCandidates = useMemo(() => {
    const filterable = candidates.map((c) => ({ candidate: c, tx: toFilterableTransaction(c, effectiveSourceAccountId(c)) }));
    const matched = new Set(filterTransactions(filterable.map((f) => f.tx), new Map(), filterState).map((tx) => tx.id));
    let result = candidates.filter((c) => matched.has(c.clientRowId));
    if (sort) {
      result = [...result].sort((a, b) => {
        const va = sort.field === "date" ? a.date : a.amountMinor;
        const vb = sort.field === "date" ? b.date : b.amountMinor;
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return sort.direction === "asc" ? cmp : -cmp;
      });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, filterState, sort, filesByKey]);

  const paged = paginate(visibleCandidates, page, pageSize);

  function toggleSort(field: "date" | "amount") {
    setSort((prev) => {
      if (!prev || prev.field !== field) return { field, direction: "asc" };
      if (prev.direction === "asc") return { field, direction: "desc" };
      return null;
    });
  }

  function updateCandidate(clientRowId: string, patch: Partial<WorkspaceCandidate>) {
    setCandidates((prev) => prev.map((c) => (c.clientRowId === clientRowId ? { ...c, ...patch } : c)));
  }

  function removeCandidates(ids: Set<string>) {
    setCandidates((prev) => prev.filter((c) => !ids.has(c.clientRowId)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  function removeFile(fileKey: string) {
    setFiles((prev) => prev.filter((f) => f.fileKey !== fileKey));
    removeCandidates(new Set(candidates.filter((c) => c.fileKey === fileKey).map((c) => c.clientRowId)));
  }

  // Applies a resolved choice to every file in a source group at once — a
  // group can span more than one file (two statements, one account), and
  // "Change Account" must move all of them together, not just the file the
  // menu happened to be opened from.
  function setSourceGroupChoice(fileKeys: string[], choice: AccountChoice, identifier: string | null) {
    const fileKeySet = new Set(fileKeys);
    setFiles((prev) => prev.map((f) => (fileKeySet.has(f.fileKey) ? { ...f, accountChoice: choice, identifier } : f)));
    const knownAccountId = accountChoiceKnownAccountId(choice);
    // Reflected immediately in the transaction preview below, not just on
    // commit — every candidate for these files re-reads its Account cell
    // from this same state. Never touches a candidate that already has
    // its own pending new-Account proposal (GPay importer delta) — that
    // row's resolution is independent of this file's own default and
    // waits on its own approval, not this one's.
    //
    // Known gap, still not fixed here: a row that already resolved
    // per-row to a *different real Account* (Stone 1's own exact
    // identifier match, no proposal involved) is indistinguishable at
    // this point from one that's merely using the file's own default —
    // both just have `knownAccountId` set, and the server already merges
    // "per-row match" and "file default" into that one field before this
    // component ever sees it. Changing the file's fallback here will
    // still reassign that row too. Needs the per-row value tracked
    // separately from the file-level default rather than merged into one
    // mutable field to fix properly.
    setCandidates((prev) => prev.map((c) => (fileKeySet.has(c.fileKey) && !c.proposedSourceAccount ? { ...c, knownAccountId } : c)));
  }

  // GPay importer delta — applies a resolved choice to every candidate
  // sharing one per-row new-Account proposal. "existing" redirects them
  // to a real Account instead (dropping the proposal — nothing gets
  // created for a key nothing points at anymore); "new" just updates the
  // proposal's own name/classification/Account Type in place.
  function setSourceProposalChoice(key: string, choice: ResolutionChoice) {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.proposedSourceAccount?.key !== key) return c;
        if (choice.type === "existing") {
          return { ...c, knownAccountId: choice.accountId ?? null, proposedSourceAccount: null };
        }
        const classification = choice.classification === "LIABILITY" ? "LIABILITY" : "ASSET";
        return {
          ...c,
          knownAccountId: null,
          proposedSourceAccount: {
            ...c.proposedSourceAccount,
            name: choice.name ?? c.proposedSourceAccount.name,
            classification,
            accountType: choice.accountType ?? c.proposedSourceAccount.accountType,
          },
        };
      }),
    );
  }

  // Retargets every candidate currently in this counterpart group at once —
  // e.g. changing "Unknown (Expense)" to "Food Expense" moves every
  // candidate that was pointing at Unknown, immediately visible in the
  // transaction preview (same "reflect immediately" requirement as the
  // source-account case above).
  function setCounterpartGroupChoice(oldGroupKey: string, next: Counterpart) {
    setCandidates((prev) =>
      prev.map((c) => (counterpartGroupKey(c.counterpart) === oldGroupKey ? { ...c, counterpart: next } : c)),
    );
  }

  // Shared by every import source's success case — a registered adapter
  // (`handleFileUploaded` below) and both Custom Importer paths
  // (`handleCustomImportConfigured`) alike, once each has reduced to the
  // same `ImportPreview` shape. Never forked into a second pipeline
  // (Ledger Custom Importer delta).
  function applyImportPreview(fileKey: string, filename: string, fileBase64: string, data: ImportPreview) {
    const { accountResolution } = data;
    const accountChoice = defaultAccountChoice(accountResolution, accounts);
    const knownAccountId = accountChoiceKnownAccountId(accountChoice);

    const newAccountsByKey = new Map(data.newAccounts.map((a) => [a.key, a]));
    const newSourceAccountsByKey = new Map(data.newSourceAccounts.map((a) => [a.key, a]));
    const newCandidates: WorkspaceCandidate[] = data.candidates.map((candidate) => ({
      clientRowId: crypto.randomUUID(),
      fileKey: candidate.fileKey,
      date: candidate.date,
      description: candidate.description,
      amountMinor: candidate.amountMinor,
      direction: candidate.direction,
      // A per-row resolution (GPay importer delta) always wins over this
      // file's own single default — `commitImport` already applies this
      // exact same precedence server-side (`candidate.knownAccountId ??
      // resolvedAccountId`); this was silently discarding it before,
      // always using the file-level default for every row regardless. A
      // pending new-Account proposal (below) also wins over the file
      // default — the real bug this fixes: a row proposing a *new*
      // Account must never quietly get attributed to the file's existing
      // default while its own proposal sits unapproved.
      knownAccountId: candidate.knownAccountId ?? (candidate.proposedSourceAccountKey ? null : knownAccountId),
      proposedSourceAccount: candidate.proposedSourceAccountKey
        ? (newSourceAccountsByKey.get(candidate.proposedSourceAccountKey) ?? null)
        : null,
      reference: candidate.reference,
      time: candidate.time,
      counterparty: candidate.counterparty,
      possibleDuplicateOfCommitted: candidate.possibleDuplicate,
      counterpart: candidate.counterAccountId
        ? { type: "existing", accountId: candidate.counterAccountId }
        : {
            type: "new",
            key: candidate.counterAccountKey,
            name: newAccountsByKey.get(candidate.counterAccountKey)?.name ?? "Unknown",
            classification: newAccountsByKey.get(candidate.counterAccountKey)?.classification ?? "EXPENSE",
          },
    }));

    setFiles((prev) => [
      ...prev.filter((f) => f.fileKey !== fileKey),
      {
        fileKey,
        filename,
        fileBase64,
        status: "success",
        source: data.source,
        identifier: accountResolution.identifier,
        resolution: accountResolution,
        accountChoice,
      },
    ]);
    setCandidates((prev) => [...prev.filter((c) => c.fileKey !== fileKey), ...newCandidates]);
  }

  async function handleFileUploaded(
    filename: string,
    fileBase64: string,
    fileKey: string = crypto.randomUUID(),
    password?: string,
  ) {
    setServerError(null);
    setIsPending(true);
    const result = await previewImportAction({ filename, fileBase64, fileKey, password });
    setIsPending(false);
    if (!result.success) {
      if (result.code === "PASSWORD_REQUIRED" || result.code === "PASSWORD_INCORRECT") {
        setPendingPasswordFile({ filename, fileBase64, fileKey, incorrect: result.code === "PASSWORD_INCORRECT" });
        return;
      }
      // No registered adapter recognized this file — offer Custom
      // Importer instead of a dead-end failed card.
      if (result.code === "CUSTOM_IMPORTER_REQUIRED") {
        setPendingCustomImportFile({ filename, fileBase64, fileKey });
        return;
      }
      // A parse/adapter failure still gets its own removable card (spec:
      // "Parsing status: Success/Failed") — it just never contributes
      // candidates, so it can't affect any total no matter what. The card
      // itself already shows the error message, so no need for a second
      // copy in the standalone banner below (that stays reserved for
      // errors with no card of their own, e.g. a failed commit).
      setFiles((prev) => [
        ...prev,
        {
          fileKey,
          filename,
          fileBase64,
          status: "failed",
          errorMessage: result.error,
          source: null,
          identifier: null,
          resolution: null,
          accountChoice: null,
        },
      ]);
      return;
    }
    setPendingPasswordFile(null);
    applyImportPreview(fileKey, filename, fileBase64, result.data);
  }

  // Ledger Custom Importer delta — completes `pendingCustomImportFile`'s
  // configuration (a confirmed column mapping, plus a crop for PDF) and
  // feeds the result through the exact same `applyImportPreview` path
  // `handleFileUploaded`'s success case uses above, rather than a second
  // preview pipeline.
  async function handleCustomImportConfigured(
    result: Awaited<ReturnType<typeof previewCustomXlsImportAction>>,
  ) {
    if (!pendingCustomImportFile) return;
    const { filename, fileBase64, fileKey } = pendingCustomImportFile;
    setIsPending(false);
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    setPendingCustomImportFile(null);
    applyImportPreview(fileKey, filename, fileBase64, result.data);
  }

  async function handleCommit() {
    if (candidates.length === 0) return;
    const successFiles = files.filter(isSuccessFile);

    const unnamed = successFiles.find((f) => f.accountChoice.type === "new" && !f.accountChoice.name.trim());
    if (unnamed) {
      setServerError(`Name the new account for "${unnamed.filename}" before importing.`);
      return;
    }
    const unnamedProposal = pendingNewSourceAccounts.find((a) => !a.name.trim());
    if (unnamedProposal) {
      setServerError(`Name the new account for identifier "${unnamedProposal.identifier}" before importing.`);
      return;
    }

    setServerError(null);
    setIsPending(true);

    const result = await commitImportAction({
      files: successFiles.map((f) => ({
        fileKey: f.fileKey,
        filename: f.filename,
        source: f.source,
        identifier: f.identifier,
        accountChoice: f.accountChoice,
      })),
      candidates: candidates.map((c) => ({
        fileKey: c.fileKey,
        date: c.date,
        description: c.description,
        amountMinor: c.amountMinor,
        direction: c.direction,
        knownAccountId: c.knownAccountId,
        proposedSourceAccountKey: c.proposedSourceAccount?.key ?? null,
        counterAccountId: c.counterpart.type === "existing" ? c.counterpart.accountId : null,
        counterAccountKey: c.counterpart.type === "existing" ? `existing:${c.counterpart.accountId}` : c.counterpart.key,
      })),
      approvedNewAccounts: pendingNewAccounts,
      approvedNewSourceAccounts: pendingNewSourceAccounts,
    });

    setIsPending(false);
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    router.push("/imports");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Row 1 — every file currently in this import session, plus the
          upload entry point as the trailing card in the same row. */}
      <div className="flex flex-wrap gap-3">
        {files.map((file) => (
          <ImportFileCard
            key={file.fileKey}
            file={file}
            stats={fileStatsByKey.get(file.fileKey)}
            onRemove={() => removeFile(file.fileKey)}
            onUseCustomImporter={() =>
              setPendingCustomImportFile({ filename: file.filename, fileBase64: file.fileBase64, fileKey: file.fileKey })
            }
          />
        ))}
        <NewFileImportCard isPending={isPending} onUpload={handleFileUploaded} />
      </div>

      {pendingPasswordFile && (
        <PasswordPromptDialog
          filename={pendingPasswordFile.filename}
          incorrect={pendingPasswordFile.incorrect}
          isPending={isPending}
          onSubmit={(password) =>
            handleFileUploaded(
              pendingPasswordFile.filename,
              pendingPasswordFile.fileBase64,
              pendingPasswordFile.fileKey,
              password,
            )
          }
          onCancel={() => setPendingPasswordFile(null)}
        />
      )}

      {pendingCustomImportFile && (
        <PendingCustomImportDialog
          filename={pendingCustomImportFile.filename}
          fileBase64={pendingCustomImportFile.fileBase64}
          fileKey={pendingCustomImportFile.fileKey}
          isPending={isPending}
          onPending={setIsPending}
          onConfirm={handleCustomImportConfigured}
          onCancel={() => setPendingCustomImportFile(null)}
        />
      )}

      {/* Row 2 — Identified Accounts is a list of account-resolution
          results, not a "new accounts" summary — a proposed counterpart
          account like Unknown (Expense) is exactly as much a proposed
          account as the source account is (Account Resolution delta), so
          both kinds of resolution get their own card here, each
          independently changeable via the same "Change Account" dialog.
          The Summary card (with the Import button) is the trailing card in
          this same row. */}
      {(sourceGroups.length > 0 || counterpartGroups.length > 0 || candidates.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {sourceGroups.map((group) => {
            if (group.kind === "resolved") {
              // Already a real Account, resolved per-row (Stone 1) —
              // read-only for now, no file of its own to redirect (see
              // `setSourceGroupChoice`'s own doc comment for why this
              // isn't wired up to "Change Account" yet).
              const account = accountsById.get(group.accountId);
              const view = { name: account?.name ?? group.accountId, classification: account?.classification ?? "ASSET", icon: account?.icon, isNew: false };
              return (
                <IdentifiedAccountCard
                  key={group.groupKey}
                  view={view}
                  identifier={null}
                  transactionCount={group.transactionCount}
                  inflowMinor={group.inflowMinor}
                  outflowMinor={group.outflowMinor}
                  currencySymbol={currencySymbol}
                  currencyScale={currencyScale}
                />
              );
            }
            if (group.kind === "proposal") {
              const view = { name: group.proposal.name, classification: group.proposal.classification as Classification, isNew: true };
              return (
                <IdentifiedAccountCard
                  key={group.groupKey}
                  view={view}
                  identifier={group.proposal.identifier}
                  transactionCount={group.transactionCount}
                  inflowMinor={group.inflowMinor}
                  outflowMinor={group.outflowMinor}
                  currencySymbol={currencySymbol}
                  currencyScale={currencyScale}
                  onChange={() => setResolutionDialog({ kind: "sourceProposal", groupKey: group.groupKey })}
                />
              );
            }
            const view = sourceAccountView(group.accountChoice, accountsById);
            return (
              <IdentifiedAccountCard
                key={group.groupKey}
                view={view}
                identifier={group.identifier}
                transactionCount={group.transactionCount}
                inflowMinor={group.inflowMinor}
                outflowMinor={group.outflowMinor}
                currencySymbol={currencySymbol}
                currencyScale={currencyScale}
                onChange={() => setResolutionDialog({ kind: "source", groupKey: group.groupKey })}
              />
            );
          })}
          {counterpartGroups.map((group) => {
            const view = counterpartAccountView(group.counterpart, accountsById);
            return (
              <IdentifiedAccountCard
                key={group.groupKey}
                view={view}
                identifier={null}
                transactionCount={group.count}
                inflowMinor={group.inflowMinor}
                outflowMinor={group.outflowMinor}
                currencySymbol={currencySymbol}
                currencyScale={currencyScale}
                onChange={() => setResolutionDialog({ kind: "counterpart", groupKey: group.groupKey })}
              />
            );
          })}
          {candidates.length > 0 && (
            <SummaryCard
              fileCount={summary.fileCount}
              transactionCount={summary.transactionCount}
              inflowMinor={summary.inflowMinor}
              outflowMinor={summary.outflowMinor}
              currencySymbol={currencySymbol}
              currencyScale={currencyScale}
              isPending={isPending}
              onImport={handleCommit}
            />
          )}
        </div>
      )}

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      {/* Row 3 — the detailed review area: filters, the transaction table,
          pagination. */}
      {candidates.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <TransactionFilterDrawer
              accounts={accounts}
              currency={{ symbol: currencySymbol, minorUnitScale: currencyScale }}
              initialState={filterState}
              onApply={(state) => {
                setFilterState(state);
                setPage(1);
              }}
            />
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2">
              <span className="text-sm text-muted-foreground">{selected.size} selected</span>
              <Menu>
                <MenuTrigger render={<Button type="button" variant="outline" size="sm" />}>Bulk Actions</MenuTrigger>
                <MenuContent>
                  <MenuItem onClick={() => setBulkDialog("counterpart")}>Change Account</MenuItem>
                  <MenuItem onClick={() => setBulkDialog("direction")}>Change Transaction Type</MenuItem>
                  <MenuItem onClick={() => removeCandidates(selected)}>Remove selected</MenuItem>
                </MenuContent>
              </Menu>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          )}

          {/* Desktop: a real table with Description as the one flexible
              column (no width class — table-layout stays `auto`, so it
              absorbs whatever width the fixed columns don't use) and every
              other column pinned to a fixed width so they don't jitter as
              content changes. Mobile: the existing card-list pattern
              (transaction-table.tsx's MobileTransactionCard) instead of
              squeezing this same table horizontally. */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      aria-label="Select all on this page"
                      checked={paged.items.length > 0 && paged.items.every((c) => selected.has(c.clientRowId))}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          for (const c of paged.items) {
                            if (checked) next.add(c.clientRowId);
                            else next.delete(c.clientRowId);
                          }
                          return next;
                        })
                      }
                    />
                  </TableHead>
                  <TableHead className="w-28">
                    <button type="button" onClick={() => toggleSort("date")} className="hover:text-foreground">
                      Date
                    </button>
                  </TableHead>
                  <TableHead className="w-24">Transaction Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-48">Account</TableHead>
                  <TableHead className="w-28 text-right">
                    <button type="button" onClick={() => toggleSort("amount")} className="hover:text-foreground">
                      Amount
                    </button>
                  </TableHead>
                  <TableHead className="w-24">Quick Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.items.map((candidate) =>
                  editingRowId === candidate.clientRowId ? (
                    <EditableCandidateRow
                      key={candidate.clientRowId}
                      candidate={candidate}
                      accounts={accounts}
                      currencyScale={currencyScale}
                      onSave={(patch) => {
                        updateCandidate(candidate.clientRowId, patch);
                        setEditingRowId(null);
                      }}
                      onCancel={() => setEditingRowId(null)}
                    />
                  ) : (
                    <TableRow key={candidate.clientRowId}>
                      <TableCell>
                        <Checkbox
                          aria-label="Select row"
                          checked={selected.has(candidate.clientRowId)}
                          onCheckedChange={(checked) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(candidate.clientRowId);
                              else next.delete(candidate.clientRowId);
                              return next;
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(candidate.date)}</TableCell>
                      <TableCell className={directionColor(candidate.direction)}>{directionLabel(candidate.direction)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          {candidate.description}
                          <PossibleDuplicateBadge
                            sessionMatch={possibleDuplicatesById.get(candidate.clientRowId)}
                            committedReason={candidate.possibleDuplicateOfCommitted}
                          />
                        </span>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const view = counterpartAccountView(candidate.counterpart, accountsById);
                          return <AccountLabel {...view} />;
                        })()}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap font-mono tabular-nums">
                        {formatMoney(candidate.amountMinor, currencySymbol, currencyScale)}
                      </TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditingRowId(candidate.clientRowId)}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-2 md:hidden">
            {paged.items.map((candidate) =>
              editingRowId === candidate.clientRowId ? (
                <MobileEditableCandidateCard
                  key={candidate.clientRowId}
                  candidate={candidate}
                  accounts={accounts}
                  currencyScale={currencyScale}
                  onSave={(patch) => {
                    updateCandidate(candidate.clientRowId, patch);
                    setEditingRowId(null);
                  }}
                  onCancel={() => setEditingRowId(null)}
                />
              ) : (
                <MobileCandidateCard
                  key={candidate.clientRowId}
                  candidate={candidate}
                  accountsById={accountsById}
                  currencySymbol={currencySymbol}
                  currencyScale={currencyScale}
                  sessionDuplicateMatch={possibleDuplicatesById.get(candidate.clientRowId)}
                  selected={selected.has(candidate.clientRowId)}
                  onToggleSelect={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(candidate.clientRowId)) next.delete(candidate.clientRowId);
                      else next.add(candidate.clientRowId);
                      return next;
                    })
                  }
                  onEdit={() => setEditingRowId(candidate.clientRowId)}
                />
              ),
            )}
          </div>

          {/* Same visual language as TransactionPaginationControls
              (transaction-pagination.tsx) — "Rows per page" + plain-number
              Select, "Page X of Y" + icon-only First/Prev/Next/Last —
              onClick instead of href since this workspace has no URL/page
              round-trip, but the look stays identical. */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
                items={PAGE_SIZES.map((size) => ({ label: String(size), value: String(size) }))}
              >
                <SelectTrigger aria-label="Rows per page" className="h-7 w-16 px-2 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              <span className="mr-2 text-muted-foreground">
                Page {paged.page} of {paged.totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="First page"
                disabled={paged.page <= 1}
                onClick={() => setPage(1)}
              >
                <ChevronsLeft aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Previous page"
                disabled={paged.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Next page"
                disabled={paged.page >= paged.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Last page"
                disabled={paged.page >= paged.totalPages}
                onClick={() => setPage(paged.totalPages)}
              >
                <ChevronsRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}

      <BulkEditDialog
        mode={bulkDialog}
        accounts={accounts}
        onClose={() => setBulkDialog(null)}
        onApply={(patch) => {
          setCandidates((prev) => prev.map((c) => (selected.has(c.clientRowId) ? { ...c, ...patch } : c)));
          setBulkDialog(null);
          setSelected(new Set());
        }}
      />

      {resolutionDialog?.kind === "source" &&
        (() => {
          const group = sourceGroups.find((g) => g.groupKey === resolutionDialog.groupKey);
          if (!group || group.kind !== "file") return null;
          const label = group.filenames.length === 1 ? group.filenames[0] : `these ${group.filenames.length} files`;
          return (
            <AccountResolutionDialog
              description={`Which account should ${label}'s transactions post against?`}
              scope="source"
              accounts={accounts}
              initialChoice={accountChoiceToResolutionChoice(group.accountChoice)}
              identifier={group.identifier}
              onClose={() => setResolutionDialog(null)}
              onApply={(choice, identifier) => {
                setSourceGroupChoice(group.fileKeys, resolutionChoiceToAccountChoice(choice), identifier);
                setResolutionDialog(null);
              }}
            />
          );
        })()}

      {resolutionDialog?.kind === "sourceProposal" &&
        (() => {
          const group = sourceGroups.find((g) => g.groupKey === resolutionDialog.groupKey);
          if (!group || group.kind !== "proposal") return null;
          return (
            <AccountResolutionDialog
              description={`Which account should "${group.proposal.name}" transactions post against?`}
              scope="source"
              accounts={accounts}
              initialChoice={proposalToResolutionChoice(group.proposal)}
              identifier={group.proposal.identifier}
              onClose={() => setResolutionDialog(null)}
              onApply={(choice) => {
                setSourceProposalChoice(group.proposal.key, choice);
                setResolutionDialog(null);
              }}
            />
          );
        })()}

      {resolutionDialog?.kind === "counterpart" &&
        (() => {
          const group = counterpartGroups.find((g) => g.groupKey === resolutionDialog.groupKey);
          if (!group) return null;
          return (
            <AccountResolutionDialog
              description="Which account should these transactions post against?"
              scope="counterpart"
              accounts={accounts}
              initialChoice={counterpartToResolutionChoice(group.counterpart)}
              identifier={null}
              onClose={() => setResolutionDialog(null)}
              onApply={(choice) => {
                setCounterpartGroupChoice(group.groupKey, resolutionChoiceToCounterpart(choice));
                setResolutionDialog(null);
              }}
            />
          );
        })()}
    </div>
  );
}

// One card per identified account (source or counterpart) — colored name +
// icon (AccountLabel), identifier when available, transaction count, and
// inflow/outflow in the app's existing semantic colors.
function IdentifiedAccountCard({
  view,
  identifier,
  transactionCount,
  inflowMinor,
  outflowMinor,
  currencySymbol,
  currencyScale,
  onChange,
}: {
  view: { name: string; classification: Classification; icon?: string | null; isNew: boolean };
  identifier: string | null;
  transactionCount: number;
  inflowMinor: number;
  outflowMinor: number;
  currencySymbol: string;
  currencyScale: number;
  onChange?: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-lg border border-border p-3 text-sm sm:w-64">
      <div className="flex items-start justify-between gap-2">
        <AccountLabel {...view} />
        {onChange && (
          <Menu>
            <MenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Account options" />}>
              <MoreVertical />
            </MenuTrigger>
            <MenuContent>
              <MenuItem onClick={onChange}>Change Account</MenuItem>
            </MenuContent>
          </Menu>
        )}
      </div>
      {identifier && <p className="text-muted-foreground">Identifier: {maskIdentifier(identifier)}</p>}
      <p className="text-muted-foreground">
        {transactionCount} transaction{transactionCount === 1 ? "" : "s"}
      </p>
      <div className="flex items-center gap-3">
        <span className="text-success">+{formatMoney(inflowMinor, currencySymbol, currencyScale)}</span>
        <span className="text-destructive">−{formatMoney(outflowMinor, currencySymbol, currencyScale)}</span>
      </div>
    </div>
  );
}

// The session-wide totals + the single Import approval button — the
// trailing card in the Identified Accounts row.
function SummaryCard({
  fileCount,
  transactionCount,
  inflowMinor,
  outflowMinor,
  currencySymbol,
  currencyScale,
  isPending,
  onImport,
}: {
  fileCount: number;
  transactionCount: number;
  inflowMinor: number;
  outflowMinor: number;
  currencySymbol: string;
  currencyScale: number;
  isPending: boolean;
  onImport: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:w-64">
      <p className="font-medium">Summary</p>
      <p className="text-muted-foreground">
        {fileCount} file{fileCount === 1 ? "" : "s"} · {transactionCount} transaction{transactionCount === 1 ? "" : "s"}
      </p>
      <div className="flex items-center gap-3">
        <span className="text-success">+{formatMoney(inflowMinor, currencySymbol, currencyScale)}</span>
        <span className="text-destructive">−{formatMoney(outflowMinor, currencySymbol, currencyScale)}</span>
      </div>
      <Button type="button" onClick={onImport} disabled={isPending} className="mt-1">
        {isPending ? "Importing…" : `Import ${transactionCount} transaction${transactionCount === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}

// One card per file currently in the import session — Success shows the
// same count/range/flow shape as an account card; Failed shows the error
// instead and never contributed any candidates in the first place.
function ImportFileCard({
  file,
  stats,
  onRemove,
  onUseCustomImporter,
}: {
  file: WorkspaceFile;
  stats?: { count: number; inflowMinor: number; outflowMinor: number; dateStart: string | null; dateEnd: string | null };
  onRemove: () => void;
  onUseCustomImporter: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-lg border border-border p-3 text-sm sm:w-64">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate font-medium" title={file.filename}>
          {file.filename}
        </p>
        <div className="flex items-center gap-1.5">
          <Badge variant={file.status === "failed" ? "destructive" : "secondary"}>
            {file.status === "failed" ? "Failed" : "Success"}
          </Badge>
          <Menu>
            <MenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`${file.filename} options`} />}>
              <MoreVertical className="size-3.5" aria-hidden="true" />
            </MenuTrigger>
            <MenuContent>
              <MenuItem onClick={onUseCustomImporter}>Use Custom Importer instead</MenuItem>
            </MenuContent>
          </Menu>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${file.filename}`} onClick={onRemove}>
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {file.status === "failed" ? (
        <p className="text-destructive">{file.errorMessage}</p>
      ) : (
        <>
          {stats && stats.dateStart && stats.dateEnd && (
            <p className="text-muted-foreground">
              {formatDate(stats.dateStart)} – {formatDate(stats.dateEnd)}
            </p>
          )}
          <p className="text-muted-foreground">{stats?.count ?? 0} transaction{(stats?.count ?? 0) === 1 ? "" : "s"}</p>
        </>
      )}
    </div>
  );
}

// The trailing card in the files row — the upload entry point, always
// present rather than a toggled form.
// Same upload entry point as before, now also a drop target — drag-and-
// drop is an additional way to reach the identical `onUpload` call the file
// picker already uses (one call per file, sequential), never a second
// upload/processing path. `isDragging` only drives the border/background
// highlight below; it doesn't gate or change what happens on drop.
function NewFileImportCard({
  isPending,
  onUpload,
}: {
  isPending: boolean;
  onUpload: (filename: string, fileBase64: string) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function uploadFiles(fileList: FileList) {
    for (const file of Array.from(fileList)) {
      fileToBase64(file).then((base64) => onUpload(file.name, base64));
    }
  }

  // Unchanged from before drag-and-drop — the picker stays single-file, the
  // same "normal click-to-browse" behavior the spec says must keep working
  // as-is. Only the drop handler below is new/multi-file.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fileInput = event.currentTarget.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) return;
    fileToBase64(file).then((base64) => onUpload(file.name, base64));
    fileInput.value = "";
  }

  function handleDragOver(event: React.DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  // `dragleave` also fires when the pointer moves over a child element
  // (Label/Input/Button) inside the card, not just when it truly leaves the
  // card — only clear the highlight once the pointer has left the card's
  // own boundary, or it'd flicker on/off while dragging across its content.
  function handleDragLeave(event: React.DragEvent<HTMLFormElement>) {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) uploadFiles(event.dataTransfer.files);
  }

  return (
    <form
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex w-full flex-col justify-between gap-2 rounded-lg border border-dashed p-3 text-sm sm:w-64",
        isDragging ? "border-primary bg-accent" : "border-border",
      )}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="file">New File Import</Label>
        <Input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,application/pdf"
          required
        />
        <p className="text-xs text-muted-foreground">or drag files here</p>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Parsing…" : "Upload"}
      </Button>
    </form>
  );
}

// Password-protected import files (Federal Bank Account PDF adapter) — the
// password lives only in this component's own `useState`, for exactly as
// long as this dialog is mounted. The parent only mounts it while a
// password is actually needed and unmounts it the moment the retry
// succeeds or the user cancels, discarding whatever was typed — never
// stored anywhere beyond the single retry submission.
function PasswordPromptDialog({
  filename,
  incorrect,
  isPending,
  onSubmit,
  onCancel,
}: {
  filename: string;
  incorrect: boolean;
  isPending: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");

  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-sm gap-3">
        <DialogHeader>
          <DialogTitle>Password required</DialogTitle>
          <DialogDescription>
            &ldquo;{filename}&rdquo; is password-protected. The password is used once to read this file and is
            never stored.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(password);
          }}
          className="flex flex-col gap-3"
        >
          <Input
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Statement password"
          />
          {incorrect && <p className="text-sm text-destructive">Incorrect password.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || password.length === 0}>
              {isPending ? "Checking…" : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Ledger Custom Importer delta — the per-file configuration flow when no
// registered adapter recognized a file, or the user explicitly chose
// "Use Custom Importer instead." XLS/CSV goes straight to column mapping;
// PDF goes page-select -> crop each selected page -> mapping (progressive
// disclosure — never dumping PDF-only config on a spreadsheet upload).
// Whatever step ends in a confirmed mapping calls the real preview action
// and hands the result to `onConfirm`, which feeds it through the exact
// same success path every other import source uses (see
// `applyImportPreview` at the top of this file) — never a second pipeline.
type CustomImportStep =
  | { kind: "loading" }
  | { kind: "needsPassword"; incorrect: boolean }
  | { kind: "pages"; pageCount: number; selected: Set<number> }
  | { kind: "crop"; pageQueue: number[]; index: number; rects: Map<number, PdfRect> }
  | { kind: "mapping"; table: RawTable; suggestedMapping: Partial<ColumnMapping>; pages: PdfCropPage[] | null }
  | { kind: "error"; message: string };

function PendingCustomImportDialog({
  filename,
  fileBase64,
  fileKey,
  isPending,
  onPending,
  onConfirm,
  onCancel,
}: {
  filename: string;
  fileBase64: string;
  fileKey: string;
  isPending: boolean;
  onPending: (pending: boolean) => void;
  onConfirm: (result: Awaited<ReturnType<typeof previewCustomXlsImportAction>>) => void;
  onCancel: () => void;
}) {
  const isPdf = filename.toLowerCase().endsWith(".pdf");
  const [step, setStep] = useState<CustomImportStep>({ kind: "loading" });
  const [password, setPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (isPdf) {
        const result = await getPdfPageCountAction({ fileBase64 });
        if (cancelled) return;
        if (!result.success) {
          if (result.code === "PASSWORD_REQUIRED" || result.code === "PASSWORD_INCORRECT") {
            setStep({ kind: "needsPassword", incorrect: result.code === "PASSWORD_INCORRECT" });
            return;
          }
          setStep({ kind: "error", message: result.error });
          return;
        }
        setStep({ kind: "pages", pageCount: result.data, selected: new Set([1]) });
      } else {
        const result = await readRawXlsTableAction({ fileBase64 });
        if (cancelled) return;
        if (!result.success) {
          setStep({ kind: "error", message: result.error });
          return;
        }
        setStep({ kind: "mapping", table: result.data.table, suggestedMapping: result.data.suggestedMapping, pages: null });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // Password-retry re-runs this explicitly via `retryWithPassword` below,
    // not via this effect re-firing on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function retryWithPassword() {
    onPending(true);
    const result = await getPdfPageCountAction({ fileBase64, password });
    onPending(false);
    if (!result.success) {
      setStep({ kind: "needsPassword", incorrect: result.code === "PASSWORD_INCORRECT" });
      return;
    }
    setStep({ kind: "pages", pageCount: result.data, selected: new Set([1]) });
  }

  async function confirmPages(pageCount: number, selected: Set<number>) {
    const pageQueue = [...selected].sort((a, b) => a - b);
    if (pageQueue.length === 0) return;
    setStep({ kind: "crop", pageQueue, index: 0, rects: new Map() });
  }

  async function confirmCrop(current: { kind: "crop"; pageQueue: number[]; index: number; rects: Map<number, PdfRect> }, rect: PdfRect) {
    const rects = new Map(current.rects);
    rects.set(current.pageQueue[current.index]!, rect);
    if (current.index + 1 < current.pageQueue.length) {
      setStep({ kind: "crop", pageQueue: current.pageQueue, index: current.index + 1, rects });
      return;
    }
    const pages: PdfCropPage[] = current.pageQueue.map((pageNumber) => ({ pageNumber, cropRect: rects.get(pageNumber)! }));
    onPending(true);
    const result = await extractPdfCropPreviewAction({ fileBase64, pages, password: password || undefined });
    onPending(false);
    if (!result.success) {
      setStep({ kind: "error", message: result.error });
      return;
    }
    setStep({ kind: "mapping", table: result.data.table, suggestedMapping: result.data.suggestedMapping, pages });
  }

  async function confirmMapping(mapping: ColumnMapping, pages: PdfCropPage[] | null) {
    onPending(true);
    const result = pages
      ? await previewCustomPdfImportAction({ filename, fileBase64, fileKey, pages, mapping, password: password || undefined })
      : await previewCustomXlsImportAction({ filename, fileBase64, fileKey, mapping });
    onConfirm(result);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-h-[85vh] max-w-2xl gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure &ldquo;{filename}&rdquo; manually</DialogTitle>
          <DialogDescription>
            No known importer recognized this file — set it up manually below, then review before anything is
            imported.
          </DialogDescription>
        </DialogHeader>

        {step.kind === "loading" && <p className="text-sm text-muted-foreground">Reading file…</p>}

        {step.kind === "error" && <p className="text-sm text-destructive">{step.message}</p>}

        {step.kind === "needsPassword" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void retryWithPassword();
            }}
            className="flex flex-col gap-3"
          >
            <Input
              type="password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Statement password"
            />
            {step.incorrect && <p className="text-sm text-destructive">Incorrect password.</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || password.length === 0}>
                {isPending ? "Checking…" : "Continue"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step.kind === "pages" && (
          <PdfPageSelector
            pageCount={step.pageCount}
            selected={step.selected}
            onToggle={(page) => {
              const next = new Set(step.selected);
              if (next.has(page)) next.delete(page);
              else next.add(page);
              setStep({ ...step, selected: next });
            }}
            onCancel={onCancel}
            onConfirm={() => confirmPages(step.pageCount, step.selected)}
          />
        )}

        {step.kind === "crop" && (
          <PdfPageCropEditor
            key={step.pageQueue[step.index]}
            fileBase64={fileBase64}
            password={password || undefined}
            pageNumber={step.pageQueue[step.index]!}
            stepLabel={`Page ${step.index + 1} of ${step.pageQueue.length}`}
            onCancel={onCancel}
            onConfirm={(rect) => confirmCrop(step, rect)}
          />
        )}

        {step.kind === "mapping" && (
          <ColumnMappingForm
            table={step.table}
            suggestedMapping={step.suggestedMapping}
            isPending={isPending}
            onCancel={onCancel}
            onConfirm={(mapping) => confirmMapping(mapping, step.pages)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PdfPageSelector({
  pageCount,
  selected,
  onToggle,
  onConfirm,
  onCancel,
}: {
  pageCount: number;
  selected: Set<number>;
  onToggle: (page: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Which pages have transaction rows?</p>
      <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
          <label
            key={page}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border p-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
          >
            <input type="checkbox" className="size-3.5" checked={selected.has(page)} onChange={() => onToggle(page)} />
            {page}
          </label>
        ))}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={selected.size === 0} onClick={onConfirm}>
          Continue
        </Button>
      </DialogFooter>
    </div>
  );
}

// The one genuinely new interaction pattern in this codebase — renders a
// PDF page to a canvas client-side (pdfjs-dist's browser build, distinct
// from the Node "legacy" build server/importers/pdfTextExtraction.ts
// uses) and lets the user drag out a crop rectangle on top of it with
// plain pointer events (no new dependency — a resizable-rect overlay is
// small enough not to justify one). The rectangle is tracked in canvas-
// pixel space while dragging, then converted to PDF point space via
// pdfjs's own `PageViewport.convertToPdfPoint` on confirm — the same
// space server/importers/pdfTextExtraction.ts's extraction already uses,
// so no coordinate math is duplicated.
function PdfPageCropEditor({
  fileBase64,
  password,
  pageNumber,
  stepLabel,
  onConfirm,
  onCancel,
}: {
  fileBase64: string;
  password?: string;
  pageNumber: number;
  stepLabel: string;
  onConfirm: (rect: PdfRect) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<{ convertToPdfPoint: (x: number, y: number) => number[] } | null>(null);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ startX: number; startY: number; x: number; y: number; width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
        const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
        const doc = await pdfjsLib.getDocument({ data: bytes, password }).promise;
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.3 });
        viewportRef.current = viewport;
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) return;
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        if (!cancelled) setRendered(true);
      } catch (error) {
        if (!cancelled) {
          console.error("PdfPageCropEditor render failed:", error);
          setError("Could not render this page — try Custom Importer with a different page selection.");
        }
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [fileBase64, password, pageNumber]);

  function pointerPosition(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = containerRef.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const { x, y } = pointerPosition(event);
    setDrag({ startX: x, startY: y, x, y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const { x, y } = pointerPosition(event);
    const left = Math.min(drag.startX, x);
    const top = Math.min(drag.startY, y);
    setDrag({ ...drag, x: left, y: top, width: Math.abs(x - drag.startX), height: Math.abs(y - drag.startY) });
  }

  function onPointerUp() {
    // Nothing to do — the rect stays in `drag` until Continue/Back.
  }

  function handleConfirm() {
    if (!drag || !viewportRef.current || drag.width < 4 || drag.height < 4) return;
    // Canvas-pixel (x, y) with y measured top-down -> pdfjs point space
    // (its own convertToPdfPoint handles the y-axis flip internally).
    const [px0, py0] = viewportRef.current.convertToPdfPoint(drag.x, drag.y + drag.height);
    const [px1, py1] = viewportRef.current.convertToPdfPoint(drag.x + drag.width, drag.y);
    onConfirm({ x0: Math.min(px0, px1), y0: Math.min(py0, py1), x1: Math.max(px0, px1), y1: Math.max(py0, py1) });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {stepLabel} — drag a box around the transaction table on this page.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div
        ref={containerRef}
        className="relative max-h-[60vh] touch-none overflow-auto rounded-md border border-border"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <canvas ref={canvasRef} className="block" />
        {!rendered && !error && <p className="p-4 text-sm text-muted-foreground">Loading page…</p>}
        {drag && (
          <div
            className="pointer-events-none absolute border-2 border-primary bg-primary/10"
            style={{ left: drag.x, top: drag.y, width: drag.width, height: drag.height }}
          />
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={!drag || drag.width < 4 || drag.height < 4} onClick={handleConfirm}>
          Continue
        </Button>
      </DialogFooter>
    </div>
  );
}

const AMOUNT_SHAPE_OPTIONS = [
  { value: "debitCredit", label: "Separate Debit / Credit columns" },
  { value: "amountDirection", label: "One Amount column + a Direction column" },
] as const;

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  ISO: "YYYY-MM-DD",
  DMY_SLASH: "DD/MM/YYYY",
  MDY_SLASH: "MM/DD/YYYY",
  DD_MON_YYYY: "DD-Mon-YYYY",
};

// Shared verbatim by the XLS and PDF Custom Importer paths — the actual
// "which raw column means what" step, pre-filled from
// `suggestColumnMapping`'s alias-matching guess (services/imports.ts),
// fully overridable. Column references are indices, shown with whatever
// header text (if any) exists at that index — never trusted as a reliable
// name (core/ledger/statements/customImport.ts's own reasoning).
function ColumnMappingForm({
  table,
  suggestedMapping,
  isPending,
  onConfirm,
  onCancel,
}: {
  table: RawTable;
  suggestedMapping: Partial<ColumnMapping>;
  isPending: boolean;
  onConfirm: (mapping: ColumnMapping) => void;
  onCancel: () => void;
}) {
  const columnCount = Math.max(0, ...table.rows.map((row) => row.length));
  const headerRow = table.headerRowIndex !== null ? table.rows[table.headerRowIndex] : undefined;
  const columnLabel = (index: number) => {
    const header = headerRow?.[index]?.trim();
    return header ? `${header} (Column ${index + 1})` : `Column ${index + 1}`;
  };

  const [dateColumn, setDateColumn] = useState<number | null>(suggestedMapping.dateColumn ?? null);
  const [dateFormat, setDateFormat] = useState<DateFormat>(suggestedMapping.dateFormat ?? "ISO");
  const [descriptionColumn, setDescriptionColumn] = useState<number | null>(suggestedMapping.descriptionColumn ?? null);
  const [amountShapeKind, setAmountShapeKind] = useState<ColumnMapping["amountShape"]["kind"]>(
    suggestedMapping.amountShape?.kind ?? "debitCredit",
  );
  const [debitColumn, setDebitColumn] = useState<number | null>(
    suggestedMapping.amountShape?.kind === "debitCredit" ? suggestedMapping.amountShape.debitColumn : null,
  );
  const [creditColumn, setCreditColumn] = useState<number | null>(
    suggestedMapping.amountShape?.kind === "debitCredit" ? suggestedMapping.amountShape.creditColumn : null,
  );
  const [amountColumn, setAmountColumn] = useState<number | null>(
    suggestedMapping.amountShape?.kind === "amountDirection" ? suggestedMapping.amountShape.amountColumn : null,
  );
  const [directionColumn, setDirectionColumn] = useState<number | null>(
    suggestedMapping.amountShape?.kind === "amountDirection" ? suggestedMapping.amountShape.directionColumn : null,
  );
  const [referenceColumn, setReferenceColumn] = useState<number | null>(suggestedMapping.referenceColumn ?? null);

  const amountShapeComplete =
    amountShapeKind === "debitCredit" ? debitColumn !== null && creditColumn !== null : amountColumn !== null && directionColumn !== null;
  const canConfirm = dateColumn !== null && descriptionColumn !== null && amountShapeComplete;

  function columnSelect(value: number | null, onChange: (value: number) => void, label: string) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{label}</Label>
        <Select value={value === null ? "" : String(value)} onValueChange={(v) => v && onChange(Number(v))} items={Array.from({ length: columnCount }, (_, i) => ({ label: columnLabel(i), value: String(i) }))}>
          <SelectTrigger>
            <SelectValue placeholder="Select a column" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: columnCount }, (_, i) => (
              <SelectItem key={i} value={String(i)}>
                {columnLabel(i)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const previewRows = table.rows.filter((_, i) => i !== table.headerRowIndex).slice(0, 6);

  return (
    <div className="flex flex-col gap-4">
      {previewRows.length > 0 && (
        <div className="max-h-40 overflow-auto rounded-md border border-border">
          <Table>
            <TableBody>
              {previewRows.map((row, i) => (
                <TableRow key={i}>
                  {Array.from({ length: columnCount }, (_, c) => (
                    <TableCell key={c} className="whitespace-nowrap py-1.5 text-xs text-muted-foreground">
                      {row[c] ?? ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {columnSelect(dateColumn, setDateColumn, "Date column")}
        <div className="flex flex-col gap-1.5">
          <Label>Date format</Label>
          <Select value={dateFormat} onValueChange={(v) => v && setDateFormat(v as DateFormat)} items={DATE_FORMATS.map((f) => ({ label: DATE_FORMAT_LABELS[f], value: f }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {DATE_FORMAT_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {columnSelect(descriptionColumn, setDescriptionColumn, "Description column")}
        <div className="flex flex-col gap-1.5">
          <Label>Amount shape</Label>
          <Select
            value={amountShapeKind}
            onValueChange={(v) => v && setAmountShapeKind(v as ColumnMapping["amountShape"]["kind"])}
            items={AMOUNT_SHAPE_OPTIONS as unknown as { label: string; value: string }[]}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AMOUNT_SHAPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {amountShapeKind === "debitCredit" ? (
          <>
            {columnSelect(debitColumn, setDebitColumn, "Debit column")}
            {columnSelect(creditColumn, setCreditColumn, "Credit column")}
          </>
        ) : (
          <>
            {columnSelect(amountColumn, setAmountColumn, "Amount column")}
            {columnSelect(directionColumn, setDirectionColumn, "Direction column")}
          </>
        )}
        {columnSelect(referenceColumn, setReferenceColumn, "Reference column (optional)")}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canConfirm || isPending}
          onClick={() =>
            canConfirm &&
            onConfirm({
              dateColumn: dateColumn!,
              dateFormat,
              descriptionColumn: descriptionColumn!,
              amountShape:
                amountShapeKind === "debitCredit"
                  ? { kind: "debitCredit", debitColumn: debitColumn!, creditColumn: creditColumn! }
                  : { kind: "amountDirection", amountColumn: amountColumn!, directionColumn: directionColumn! },
              referenceColumn,
            })
          }
        >
          {isPending ? "Reviewing…" : "Review"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function CounterpartPicker({
  value,
  accounts,
  onChange,
}: {
  value: Counterpart;
  accounts: AccountOption[];
  onChange: (value: Counterpart) => void;
}) {
  const selectValue = value.type === "existing" ? value.accountId : NEW_ACCOUNT;
  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === NEW_ACCOUNT) {
            onChange({ type: "new", key: `EXPENSE:${crypto.randomUUID()}`, name: "", classification: "EXPENSE" });
          } else {
            onChange({ type: "existing", accountId: v as string });
          }
        }}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Counterpart">
            {(v: string | null) => {
              if (!v || v === NEW_ACCOUNT) return "Create new…";
              const account = accountsById.get(v);
              return account ? <AccountLabel name={account.name} classification={account.classification} icon={account.icon} /> : "";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              <AccountLabel name={account.name} classification={account.classification} icon={account.icon} />
            </SelectItem>
          ))}
          <SelectItem value={NEW_ACCOUNT}>Create new…</SelectItem>
        </SelectContent>
      </Select>
      {value.type === "new" && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="New account name"
            value={value.name}
            onChange={(e) =>
              onChange({
                ...value,
                name: e.target.value,
                key: `${value.classification}:${e.target.value.trim().toLowerCase()}`,
              })
            }
            className="w-32"
          />
          <Select
            value={value.classification}
            onValueChange={(v) =>
              onChange({ ...value, classification: v as "EXPENSE" | "INCOME", key: `${v}:${value.name.trim().toLowerCase()}` })
            }
          >
            <SelectTrigger className="w-28">
              <SelectValue>{(v: string | null) => (v === "INCOME" ? "Income" : "Expense")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EXPENSE">Expense</SelectItem>
              <SelectItem value="INCOME">Income</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// The "Change Account" interaction, generalized (Account Resolution delta):
// one control offering "choose an existing account" or "create new account"
// followed by whichever fields that choice needs — used for both source-
// account cards (Asset/Liability + Account Type) and counterpart-account
// cards (Expense/Income — the picker is hidden, `showAccountType={false}`,
// same default-bucket mapping as the server, imports.ts). Note this only
// edits the *proposed* resolution held in workspace state; the real
// `accounts` row is created solely by `commitImport` on Approve, never from
// here — keeps the whole import atomic (transient preview, one commit).
// Counterpart cards (Expense/Income) never show the picker, so their
// default must match the server's own silent choice (imports.ts's "same
// default bucket as the accountType backfill migration") rather than just
// "first option" — a visible source-account picker can use the plain
// first-option default since the user sees and can change it right there.
function defaultAccountTypeForClassification(classification: Classification, showAccountType: boolean): AccountType {
  if (!showAccountType) {
    return classification === "EXPENSE" ? "VARIABLE" : "EARNED";
  }
  return ACCOUNT_TYPES_BY_CLASSIFICATION[classification][0];
}

function AccountResolutionPicker({
  value,
  accounts,
  allowedClassifications,
  showAccountType,
  onChange,
}: {
  value: ResolutionChoice;
  accounts: AccountOption[];
  allowedClassifications: readonly Classification[];
  showAccountType: boolean;
  onChange: (value: ResolutionChoice) => void;
}) {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const selectValue = value.type === "existing" ? (value.accountId ?? "") : NEW_ACCOUNT;
  const classification = value.classification ?? allowedClassifications[0];
  const typeOptions = showAccountType ? ACCOUNT_TYPES_BY_CLASSIFICATION[classification] : [];

  function withClassification(nextClassification: Classification): ResolutionChoice {
    return {
      type: "new",
      name: value.name ?? "",
      classification: nextClassification,
      accountType: defaultAccountTypeForClassification(nextClassification, showAccountType),
    };
  }

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === NEW_ACCOUNT) onChange(withClassification(allowedClassifications[0]));
          else onChange({ type: "existing", accountId: v as string });
        }}
      >
        <SelectTrigger>
          <SelectValue>
            {(v: string | null) => {
              if (!v || v === NEW_ACCOUNT) return "Create new account";
              const account = accountsById.get(v);
              return account ? <AccountLabel name={account.name} classification={account.classification} icon={account.icon} /> : "";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              <AccountLabel name={account.name} classification={account.classification} icon={account.icon} />
            </SelectItem>
          ))}
          <SelectItem value={NEW_ACCOUNT}>Create new account</SelectItem>
        </SelectContent>
      </Select>
      {value.type === "new" && (
        <>
          <Input
            placeholder="Account name"
            value={value.name ?? ""}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
          <div className="flex gap-2">
            <Select value={classification} onValueChange={(v) => onChange(withClassification(v as Classification))}>
              <SelectTrigger className="w-32">
                <SelectValue>{(v: string | null) => (v ? classificationLabel(v) : "")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allowedClassifications.map((c) => (
                  <SelectItem key={c} value={c}>
                    {classificationLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showAccountType && (
              <Select value={value.accountType} onValueChange={(v) => onChange({ ...value, accountType: v as AccountType })}>
                <SelectTrigger className="w-32">
                  <SelectValue>{(v: string | null) => (v ? humanizeEnum(v) : "")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {humanizeEnum(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AccountResolutionDialog({
  description,
  scope,
  accounts,
  initialChoice,
  identifier,
  onClose,
  onApply,
}: {
  description: string;
  scope: "source" | "counterpart";
  accounts: AccountOption[];
  initialChoice: ResolutionChoice;
  // The statement-detected identifier, editable here (§11/§12's "view/edit
  // detected account identifiers") — null when this resolution has none
  // (every counterpart card, or a source file whose adapter found none).
  identifier: string | null;
  onClose: () => void;
  onApply: (choice: ResolutionChoice, identifier: string | null) => void;
}) {
  const [choice, setChoice] = useState<ResolutionChoice>(initialChoice);
  const [identifierValue, setIdentifierValue] = useState(identifier ?? "");
  const allowedClassifications: readonly Classification[] = scope === "source" ? ["ASSET", "LIABILITY"] : ["EXPENSE", "INCOME"];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Account</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <AccountResolutionPicker
          value={choice}
          accounts={accounts}
          allowedClassifications={allowedClassifications}
          showAccountType={scope === "source"}
          onChange={setChoice}
        />
        {identifier !== null && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="detected-identifier">Detected identifier</Label>
            <Input id="detected-identifier" value={identifierValue} onChange={(e) => setIdentifierValue(e.target.value)} />
          </div>
        )}
        <DialogFooter>
          <Button type="button" onClick={() => onApply(choice, identifier !== null ? identifierValue.trim() || null : null)}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditableCandidateRow({
  candidate,
  accounts,
  currencyScale,
  onSave,
  onCancel,
}: {
  candidate: WorkspaceCandidate;
  accounts: AccountOption[];
  currencyScale: number;
  onSave: (patch: Partial<WorkspaceCandidate>) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(candidate.date);
  const [description, setDescription] = useState(candidate.description);
  const [direction, setDirection] = useState<ImportDirection>(candidate.direction);
  const [amount, setAmount] = useState(String(candidate.amountMinor / 10 ** currencyScale));
  const [counterpart, setCounterpart] = useState<Counterpart>(candidate.counterpart);

  function save() {
    const parsedAmount = Number.parseFloat(amount);
    onSave({
      date,
      description,
      direction,
      amountMinor: Number.isFinite(parsedAmount) ? Math.round(parsedAmount * 10 ** currencyScale) : candidate.amountMinor,
      counterpart,
    });
  }

  return (
    <TableRow>
      <TableCell />
      <TableCell>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-36" />
      </TableCell>
      <TableCell>
        <Select value={direction} onValueChange={(v) => setDirection(v as ImportDirection)}>
          <SelectTrigger className="w-28">
            <SelectValue>{(v: string | null) => (v ? directionLabel(v) : "")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="debit">Paid</SelectItem>
            <SelectItem value="credit">Received</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full" />
      </TableCell>
      <TableCell>
        <CounterpartPicker value={counterpart} accounts={accounts} onChange={setCounterpart} />
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          step={1 / 10 ** currencyScale}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-24 text-right"
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button type="button" size="sm" onClick={save}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// Mobile card list — same pattern as transaction-table.tsx's
// MobileTransactionCard: one card per candidate, no squeezed-horizontal
// table. `hidden`/`md:hidden` on the two sibling containers (desktop table
// vs. this) switches between them at the same breakpoint the rest of the
// app already uses.
function MobileCandidateCard({
  candidate,
  accountsById,
  currencySymbol,
  currencyScale,
  selected,
  onToggleSelect,
  onEdit,
  sessionDuplicateMatch,
}: {
  candidate: WorkspaceCandidate;
  accountsById: Map<string, AccountOption>;
  currencySymbol: string;
  currencyScale: number;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  sessionDuplicateMatch?: DuplicateMatch;
}) {
  const view = counterpartAccountView(candidate.counterpart, accountsById);
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className="pt-0.5">
            <Checkbox aria-label="Select row" checked={selected} onCheckedChange={onToggleSelect} />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{formatDate(candidate.date)}</span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              {candidate.description}
              <PossibleDuplicateBadge sessionMatch={sessionDuplicateMatch} committedReason={candidate.possibleDuplicateOfCommitted} />
            </span>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>
      <div className="mt-2.5 flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className={directionColor(candidate.direction)}>{directionLabel(candidate.direction)}</span>
          <span className="font-mono tabular-nums">{formatMoney(candidate.amountMinor, currencySymbol, currencyScale)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Account</span>
          <AccountLabel {...view} />
        </div>
      </div>
    </div>
  );
}

// Mobile counterpart to `EditableCandidateRow` — same fields/state shape,
// stacked in a card instead of laid out across table cells.
function MobileEditableCandidateCard({
  candidate,
  accounts,
  currencyScale,
  onSave,
  onCancel,
}: {
  candidate: WorkspaceCandidate;
  accounts: AccountOption[];
  currencyScale: number;
  onSave: (patch: Partial<WorkspaceCandidate>) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(candidate.date);
  const [description, setDescription] = useState(candidate.description);
  const [direction, setDirection] = useState<ImportDirection>(candidate.direction);
  const [amount, setAmount] = useState(String(candidate.amountMinor / 10 ** currencyScale));
  const [counterpart, setCounterpart] = useState<Counterpart>(candidate.counterpart);

  function save() {
    const parsedAmount = Number.parseFloat(amount);
    onSave({
      date,
      description,
      direction,
      amountMinor: Number.isFinite(parsedAmount) ? Math.round(parsedAmount * 10 ** currencyScale) : candidate.amountMinor,
      counterpart,
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
      <div className="flex gap-2">
        <Select value={direction} onValueChange={(v) => setDirection(v as ImportDirection)}>
          <SelectTrigger className="w-32">
            <SelectValue>{(v: string | null) => (v ? directionLabel(v) : "")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="debit">Paid</SelectItem>
            <SelectItem value="credit">Received</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          step={1 / 10 ** currencyScale}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1"
        />
      </div>
      <CounterpartPicker value={counterpart} accounts={accounts} onChange={setCounterpart} />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function BulkEditDialog({
  mode,
  accounts,
  onClose,
  onApply,
}: {
  mode: "counterpart" | "direction" | null;
  accounts: AccountOption[];
  onClose: () => void;
  onApply: (patch: Partial<WorkspaceCandidate>) => void;
}) {
  const [direction, setDirection] = useState<ImportDirection>("debit");
  const [counterpart, setCounterpart] = useState<Counterpart>({ type: "existing", accountId: accounts[0]?.id ?? "" });

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "counterpart" && "Change Account"}
            {mode === "direction" && "Change Transaction Type"}
          </DialogTitle>
          <DialogDescription>Applies to every selected transaction.</DialogDescription>
        </DialogHeader>

        {mode === "counterpart" && <CounterpartPicker value={counterpart} accounts={accounts} onChange={setCounterpart} />}

        {mode === "direction" && (
          <Select value={direction} onValueChange={(v) => setDirection(v as ImportDirection)}>
            <SelectTrigger>
              <SelectValue>{(v: string | null) => (v ? directionLabel(v) : "")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="debit">Paid</SelectItem>
              <SelectItem value="credit">Received</SelectItem>
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              if (mode === "counterpart") onApply({ counterpart });
              if (mode === "direction") onApply({ direction });
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
