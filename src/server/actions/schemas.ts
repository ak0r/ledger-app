// Zod schemas at the Server Action boundary. These mirror the domain
// invariants that don't require a DB lookup (posting shape, >= 2 postings,
// balance) so the client gets fast feedback — but they are NOT the source
// of truth. Ownership and currency-support checks need Account rows from
// the DB and can only happen in the domain/use-case layer (Phase 3/4),
// which every action still runs after this parse succeeds (rule #17).
import { z } from "zod";
import { DATE_FORMATS } from "@/core";
import {
  BALANCES_ACCOUNT_SCOPES,
  BUDGET_FILTER_MATCHES,
  BUDGET_RECURRENCE_UNITS,
  BUDGET_TYPES,
  CLASSIFICATIONS,
  CREATABLE_CLASSIFICATIONS,
  INSTRUMENT_BACKED_TYPES,
  ACCOUNT_TYPES,
  PANEL_KEYS,
  RECENT_EXPENSES_PERIODS,
  RECURRING_FREQUENCIES,
} from "../persistence/schema";

export const createProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export const renameProfileSchema = z.object({
  profileId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
});

export const setProfilePrimaryCurrencySchema = z.object({
  profileId: z.string().min(1),
  currencyId: z.string().min(1),
});

// Indian PAN format (5 letters, 4 digits, 1 letter) — the identifier a CAS
// PDF is usually password-protected with (security/pan.ts). Normalized
// uppercase before validation so "abcde1234f" and "ABCDE1234F" are the
// same input.
export const setProfilePanSchema = z.object({
  profileId: z.string().min(1),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN (e.g. ABCDE1234F)"),
});

export const registerAppUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  // Optional: used only when registration creates a brand-new Profile
  // (falls back to a name derived from the email if omitted); ignored when
  // linking to an already-named existing Profile via `profileId`.
  name: z.string().trim().min(1).optional(),
  // Present when registering via a Primary User's "Registration link"
  // (2026-08-20 User Simplification delta §6) — links to that existing
  // unlinked Profile instead of creating a new one.
  profileId: z.string().min(1).optional(),
});

export const loginAppUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const updatePasswordSchema = z.object({
  appUserId: z.string().min(1),
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const createCurrencySchema = z.object({
  profileId: z.string().min(1),
  code: z.string().length(3, "Currency code must be 3 letters"),
  name: z.string().trim().min(1),
  symbol: z.string().trim().min(1),
  minorUnitScale: z.number().int().min(0),
});

export const addCurrencySchema = z.object({
  profileId: z.string().min(1),
  code: z.string().length(3, "Currency code must be 3 letters"),
});

export const upsertCurrencyRateSchema = z.object({
  id: z.string().min(1).optional(),
  profileId: z.string().min(1),
  currencyId: z.string().min(1),
  date: z.string().min(1),
  rateDecimal: z.number().positive(),
});

export const deleteCurrencyRateSchema = z.object({
  profileId: z.string().min(1),
  currencyId: z.string().min(1),
  rateId: z.string().min(1),
});

export const getDefaultCurrencyRateSchema = z.object({
  profileId: z.string().min(1),
  currencyId: z.string().min(1),
  date: z.string().min(1),
});

const dayOfMonthSchema = z.number().int().min(1).max(31).nullable().optional();

export const upsertCreditCardDetailsSchema = z.object({
  profileId: z.string().min(1),
  accountId: z.string().min(1),
  creditLimit: z.number().positive().nullable().optional(),
  statementEndDay: dayOfMonthSchema,
  dueDay: dayOfMonthSchema,
  network: z.string().trim().min(1).nullable().optional(),
  last4: z.string().trim().min(1).nullable().optional(),
  expirationDate: z.string().trim().min(1).nullable().optional(),
});

export const upsertLoanDetailsSchema = z.object({
  profileId: z.string().min(1),
  accountId: z.string().min(1),
  originalAmount: z.number().positive().nullable().optional(),
  disbursedAmount: z.number().positive().nullable().optional(),
  interestRatePercent: z.number().positive().nullable().optional(),
  tenureMonths: z.number().int().positive().nullable().optional(),
  emiAmount: z.number().positive().nullable().optional(),
  emiDay: dayOfMonthSchema,
  startDate: z.string().trim().min(1).nullable().optional(),
  maturityDate: z.string().trim().min(1).nullable().optional(),
});

// Simple opaque tags — a flat list, not key/value (rule #13/#14). Each tag
// trimmed/non-empty; duplicates are a UI concern (TagInput dedupes), not
// rejected here.
const tagsSchema = z.array(z.string().trim().min(1)).optional();

// Balancing is system-managed, not a normal user-creatable classification
// (2026-08-19 delta §3/§14; domain's own CREATABLE_CLASSIFICATIONS doc
// comment has the full reasoning) — restricted here, not just hidden from
// the picker, per rule #17. `editAccountSchema` below deliberately keeps
// the full `CLASSIFICATIONS` set: existing Balancing accounts must remain
// editable for their other fields.
export const createAccountSchema = z.object({
  profileId: z.string().min(1),
  currencyId: z.string().min(1),
  name: z.string().trim().min(1),
  classification: z.enum(CREATABLE_CLASSIFICATIONS),
  accountType: z.enum(ACCOUNT_TYPES),
  instrumentId: z.string().trim().min(1).optional(),
  instrumentLabel: z.string().trim().min(1).optional(),
  tags: tagsSchema,
  icon: z.string().trim().min(1).optional(),
  metadata: z.string().optional(),
});

export const editAccountSchema = z.object({
  profileId: z.string().min(1),
  accountId: z.string().min(1),
  currencyId: z.string().min(1),
  name: z.string().trim().min(1),
  classification: z.enum(CLASSIFICATIONS),
  accountType: z.enum(ACCOUNT_TYPES),
  instrumentId: z.string().trim().min(1).optional(),
  instrumentLabel: z.string().trim().min(1).optional(),
  tags: tagsSchema,
  icon: z.string().trim().min(1).optional(),
  metadata: z.string().optional(),
});

export const archiveAccountSchema = z.object({
  profileId: z.string().min(1),
  accountId: z.string().min(1),
});

export const bulkArchiveAccountsSchema = z.object({
  profileId: z.string().min(1),
  accountIds: z.array(z.string().min(1)).min(1, "Select at least one account"),
});

export const bulkUpdateAccountTagsSchema = z.object({
  profileId: z.string().min(1),
  accountIds: z.array(z.string().min(1)).min(1, "Select at least one account"),
  addTags: z.array(z.string().trim().min(1)).default([]),
  removeTags: z.array(z.string().trim().min(1)).default([]),
});

// Instrument catalogue (Revised Investment Model delta, Phase 4,
// 2026-09-03; search rewritten by the Instrument Catalogue delta,
// 2026-09-04) — not Profile-scoped (schema.ts's own doc comment on the
// `instruments` table), so unlike every schema above there's no
// `profileId` field here.
export const searchInstrumentsSchema = z.object({
  type: z.enum(INSTRUMENT_BACKED_TYPES),
  query: z.string(),
});

export const refreshInstrumentCatalogueSchema = z.object({
  type: z.enum(["STOCK", "MUTUAL_FUND"]),
});

export const createInstrumentSchema = z.object({
  type: z.enum(INSTRUMENT_BACKED_TYPES),
  name: z.string().trim().min(1),
  unitLabel: z.string().trim().min(1).optional(),
});

const postingSchema = z
  .object({
    accountId: z.string().min(1),
    debit: z.number().int().min(0),
    credit: z.number().int().min(0),
    // Instrument-backed postings only (Revised Investment Model delta,
    // Phase 5, 2026-09-03) — the raw domain Quantity integer (6-decimal
    // scale, domain/quantity.ts), converted from the form's human decimal
    // input at the client boundary (`toQuantityMinorUnits`). Omitted for
    // every ordinary posting; the use-case layer falls back to its own
    // mirror-derivation when absent (src/server/services/transactions.ts).
    quantity: z.number().int().positive().optional(),
    // Transaction Form FX UX delta — the standard one-unit quotation ("1
    // JPY = 0.5800 INR") for a posting whose Account currency differs from
    // the Profile Base Currency, confirmed by the user at entry. Omitted
    // for a same-currency posting, or when the caller wants the server's
    // own CurrencyRate default (`resolveCurrencyRate`) rather than an
    // explicit value.
    rateDecimal: z.number().positive().optional(),
  })
  .refine((posting) => (posting.debit > 0 ? 1 : 0) + (posting.credit > 0 ? 1 : 0) === 1, {
    message: "Exactly one of debit/credit must be positive",
  });

const transactionFieldsSchema = z.object({
  profileId: z.string().min(1),
  date: z.string().min(1),
  description: z.string().trim().min(1),
  tags: tagsSchema,
  postings: z.array(postingSchema).min(2, "A transaction needs at least two postings"),
});

// This schema layer never sees Account rows (rule #17's own boundary:
// "Ownership and currency-support checks need Account rows from the DB
// and can only happen in the domain/use-case layer"), so it can't confirm
// currencies itself the way the domain layer can — it only reads the
// client's own explicit signal that a posting is priced against a
// different currency (`rateDecimal` present, Transaction Form FX UX
// delta). A raw same-currency-only sum is meaningless once any posting
// carries a rate (summing JPY + USD + INR minor units directly has no
// meaning), so this check is skipped entirely whenever *any* posting has
// one — deferred to the domain layer's own currency-aware balance rule,
// same "defers where it's caught, never whether" posture the narrower
// 2-posting Conversion-only version of this check always had.
function hasExplicitRate(transaction: z.infer<typeof transactionFieldsSchema>): boolean {
  return transaction.postings.some((posting) => posting.rateDecimal !== undefined);
}

function isBalanced(transaction: z.infer<typeof transactionFieldsSchema>): boolean {
  if (hasExplicitRate(transaction)) return true;
  const totalDebit = transaction.postings.reduce((sum, posting) => sum + posting.debit, 0);
  const totalCredit = transaction.postings.reduce((sum, posting) => sum + posting.credit, 0);
  return totalDebit === totalCredit;
}

const balancedMessage = {
  message: "Postings must balance (sum of debits must equal sum of credits)",
};

export const createTransactionSchema = transactionFieldsSchema.refine(isBalanced, balancedMessage);

export const editTransactionSchema = transactionFieldsSchema
  .extend({ transactionId: z.string().min(1) })
  .refine(isBalanced, balancedMessage);

export const deleteTransactionSchema = z.object({
  profileId: z.string().min(1),
  transactionId: z.string().min(1),
});

export const mergeTransactionsSchema = z.object({
  profileId: z.string().min(1),
  transactionIds: z.array(z.string().min(1)).min(2, "Select at least two transactions to merge"),
});

export const bulkDeleteTransactionsSchema = z.object({
  profileId: z.string().min(1),
  transactionIds: z.array(z.string().min(1)).min(1, "Select at least one transaction"),
});

export const bulkUpdateTagsSchema = z.object({
  profileId: z.string().min(1),
  transactionIds: z.array(z.string().min(1)).min(1, "Select at least one transaction"),
  addTags: z.array(z.string().trim().min(1)).default([]),
  removeTags: z.array(z.string().trim().min(1)).default([]),
});

// Recurring Transactions Phase 1 (docs/completed/2026-08-27-Recurring-
// Transactions.md) — mirrors the domain invariants in domain/recurring.ts
// that don't need a DB lookup; ownership is still enforced server-side in
// use-cases/recurring.ts (rule #17).
const recurringScheduleSchema = z
  .object({
    frequency: z.enum(RECURRING_FREQUENCIES),
    interval: z.number().int().min(1),
    byMonthDay: z.number().int().min(1).max(31).optional(),
    byWeekday: z.number().int().min(0).max(6).optional(),
    startDate: z.string().min(1),
    endDate: z.string().min(1).optional(),
  })
  .refine((schedule) => (schedule.frequency === "MONTHLY" || schedule.frequency === "YEARLY" ? schedule.byMonthDay != null : true), {
    message: "Day of month is required",
    path: ["byMonthDay"],
  })
  .refine((schedule) => (schedule.frequency === "WEEKLY" ? schedule.byWeekday != null : true), {
    message: "Day of week is required",
    path: ["byWeekday"],
  });

const recurringRuleFieldsShape = {
  profileId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  description: z.string().trim().min(1, "Description is required"),
  schedule: recurringScheduleSchema,
};

export const createRecurringRuleSchema = z.object(recurringRuleFieldsShape);

export const editRecurringRuleSchema = z.object({
  ...recurringRuleFieldsShape,
  recurringRuleId: z.string().min(1),
});

export const deleteRecurringRuleSchema = z.object({
  profileId: z.string().min(1),
  recurringRuleId: z.string().min(1),
});

// Import Framework Phase 1 delta (2026-08-25) + Import Workflow delta
// (2026-08-25, 0aa87019 — multi-file workspace) + Account Resolution delta
// (2026-08-26, 0b62d94c — no upfront account selection). `previewImportSchema`
// reads the uploaded file client-side (base64-encoded, uniform for text and
// binary formats) and sends it — no FormData/native file upload plumbing in
// this codebase (rule: mirror existing action conventions, see
// actions/accounts.ts). Called once per uploaded file; `fileKey` is a
// client-assigned opaque id used to merge this file's candidates into the
// client's multi-file workspace state and group them back by file again at
// commit. No `knownAccountId`/`sourceId` — the adapter and source account
// are both detected from the file itself.
export const previewImportSchema = z.object({
  profileId: z.string().min(1),
  filename: z.string().trim().min(1),
  fileBase64: z.string().min(1, "File is empty"),
  fileKey: z.string().min(1),
  // Password-protected import files (Federal Bank Account PDF adapter) —
  // used only for this one preview parse, never persisted (rule: never
  // store a statement password). Absent for every non-encrypted adapter.
  password: z.string().optional(),
});

// Ledger Custom Importer delta — the column mapping and crop-region shapes
// a user confirms in the client's mapping/crop UI, re-validated here
// (rule #17: domain/application validation must not be replaced by UI
// validation) rather than trusted as given. Column references are plain
// indices, not names — see core/ledger/statements/customImport.ts's own
// reasoning.
const amountShapeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("debitCredit"),
    debitColumn: z.number().int().nonnegative(),
    creditColumn: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("amountDirection"),
    amountColumn: z.number().int().nonnegative(),
    directionColumn: z.number().int().nonnegative(),
  }),
]);

const columnMappingSchema = z.object({
  dateColumn: z.number().int().nonnegative(),
  dateFormat: z.enum(DATE_FORMATS),
  descriptionColumn: z.number().int().nonnegative(),
  amountShape: amountShapeSchema,
  referenceColumn: z.number().int().nonnegative().nullable(),
});

const pdfRectSchema = z
  .object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })
  .refine((rect) => rect.x1 > rect.x0 && rect.y1 > rect.y0, "Invalid crop rectangle");

const pdfCropPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  cropRect: pdfRectSchema,
});

export const previewCustomXlsImportSchema = z.object({
  profileId: z.string().min(1),
  filename: z.string().trim().min(1),
  fileBase64: z.string().min(1, "File is empty"),
  fileKey: z.string().min(1),
  mapping: columnMappingSchema,
});

export const previewCustomPdfImportSchema = z.object({
  profileId: z.string().min(1),
  filename: z.string().trim().min(1),
  fileBase64: z.string().min(1, "File is empty"),
  fileKey: z.string().min(1),
  pages: z.array(pdfCropPageSchema).min(1, "Select at least one page"),
  mapping: columnMappingSchema,
  password: z.string().optional(),
});

// These three read no Profile data at all (pure file parsing) — no
// `profileId` field, unlike every schema above. The action layer still
// requires a logged-in session (`requireActiveProfile()`) before calling
// them, same auth gate as every other action; there's just nothing
// Profile-scoped inside the parse itself. They feed the client's
// page-selector/crop-editor/ColumnMappingForm round-trips, before the
// user has confirmed a mapping/crop yet.
export const readRawXlsTableSchema = z.object({
  fileBase64: z.string().min(1, "File is empty"),
});

export const getPdfPageCountSchema = z.object({
  fileBase64: z.string().min(1, "File is empty"),
  password: z.string().optional(),
});

export const extractPdfCropPreviewSchema = z.object({
  fileBase64: z.string().min(1, "File is empty"),
  pages: z.array(pdfCropPageSchema).min(1, "Select at least one page"),
  password: z.string().optional(),
});

const newAccountDescriptorSchema = z.object({
  key: z.string().min(1),
  classification: z.enum(["EXPENSE", "INCOME"]),
  name: z.string().trim().min(1),
});

const previewCandidateSchema = z.object({
  fileKey: z.string().min(1),
  date: z.string().min(1),
  description: z.string().trim().min(1),
  amountMinor: z.number().int().positive(),
  direction: z.enum(["debit", "credit"]),
  reference: z.string().optional(),
  knownAccountId: z.string().min(1).nullable(),
  counterAccountId: z.string().min(1).nullable(),
  counterAccountKey: z.string().min(1),
});

// The source-account resolution the user confirmed for one file (delta
// §2's "Identified Accounts" section) — existing account, or a new one to
// create atomically with the commit.
const accountChoiceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("existing"), accountId: z.string().min(1) }),
  z.object({
    type: z.literal("new"),
    name: z.string().trim().min(1),
    classification: z.enum(["ASSET", "LIABILITY"]),
    accountType: z.enum(ACCOUNT_TYPES),
  }),
]);

const commitImportFileSchema = z.object({
  fileKey: z.string().min(1),
  filename: z.string().trim().min(1),
  source: z.string().min(1),
  identifier: z.string().min(1).nullable(),
  accountChoice: accountChoiceSchema,
});

export const commitImportSchema = z.object({
  profileId: z.string().min(1),
  files: z.array(commitImportFileSchema).min(1, "No files to commit"),
  candidates: z.array(previewCandidateSchema).min(1, "No candidates to commit"),
  approvedNewAccounts: z.array(newAccountDescriptorSchema).default([]),
});

// Budget Framework delta (docs/completed/2026-09-01-Budget-Framework.md) —
// mirrors the domain invariants in domain/budget.ts that don't need a DB
// lookup; scope/allocation account ownership + EXPENSE-only checks are
// still enforced server-side in use-cases/budgets.ts (rule #17).
// A plain union of one variant per field's own operator/value shape (spec
// §7's operator table) rather than a single loosely-typed object + refine —
// this way an invalid field/operator/value combination is a type error for
// any caller building input in TS, not just a runtime rejection, and the
// inferred type lines up with domain/budget.ts's BudgetFilterCondition
// without a cast.
const budgetFilterConditionSchema = z.union([
  z.object({
    id: z.string().min(1),
    field: z.literal("expenseAccount"),
    operator: z.enum(["is", "is-not"]),
    value: z.string().min(1),
  }),
  z.object({
    id: z.string().min(1),
    field: z.literal("date"),
    operator: z.enum(["before", "after"]),
    value: z.string().min(1),
  }),
  z.object({
    id: z.string().min(1),
    field: z.literal("date"),
    operator: z.literal("between"),
    value: z.tuple([z.string().min(1), z.string().min(1)]),
  }),
  z.object({
    id: z.string().min(1),
    field: z.literal("tags"),
    operator: z.enum(["contains", "not-contains"]),
    value: z.string().min(1),
  }),
  z.object({
    id: z.string().min(1),
    field: z.literal("description"),
    operator: z.enum(["contains", "is", "is-not"]),
    value: z.string().min(1),
  }),
]);

const budgetFilterStateSchema = z.object({
  match: z.enum(BUDGET_FILTER_MATCHES),
  conditions: z.array(budgetFilterConditionSchema),
});

const budgetScopeSchema = z.object({
  explicitAccountIds: z.array(z.string().min(1)),
  filter: budgetFilterStateSchema,
});

const budgetRecurrenceSchema = z
  .object({
    unit: z.enum(BUDGET_RECURRENCE_UNITS),
    interval: z.number().int().min(1),
    startDate: z.string().min(1),
    endDate: z.string().min(1).optional(),
    occurrences: z.number().int().min(1).optional(),
  })
  .refine((schedule) => !(schedule.endDate && schedule.occurrences != null), {
    message: "Choose either an end date or a number of occurrences, not both",
    path: ["endDate"],
  });

const budgetAllocationSchema = z.object({
  expenseAccountId: z.string().min(1),
  targetAmountMinor: z.number().int().positive(),
});

const budgetFieldsShape = {
  profileId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(BUDGET_TYPES),
  recurrence: budgetRecurrenceSchema.optional(),
  scope: budgetScopeSchema,
  allocations: z.array(budgetAllocationSchema).default([]),
};

function refineBudgetTypeRecurrence(data: { type: string; recurrence?: unknown }, ctx: z.RefinementCtx): void {
  if (data.type === "RECURRING" && !data.recurrence) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Recurrence is required for a recurring budget", path: ["recurrence"] });
  }
  if (data.type === "ONE_TIME" && data.recurrence) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Recurrence is not allowed for a one-time budget", path: ["recurrence"] });
  }
}

export const createBudgetSchema = z.object(budgetFieldsShape).superRefine(refineBudgetTypeRecurrence);

export const editBudgetSchema = z
  .object({ ...budgetFieldsShape, budgetId: z.string().min(1) })
  .superRefine(refineBudgetTypeRecurrence);

export const deleteBudgetSchema = z.object({
  profileId: z.string().min(1),
  budgetId: z.string().min(1),
});

export const previewNextBudgetPeriodSchema = z.object({
  profileId: z.string().min(1),
  budgetId: z.string().min(1),
});

export const approveBudgetPeriodSchema = z.object({
  profileId: z.string().min(1),
  budgetId: z.string().min(1),
  startDate: z.string().min(1).nullable(),
  endDate: z.string().min(1).nullable(),
  scope: budgetScopeSchema,
  allocations: z.array(budgetAllocationSchema).default([]),
});

// Dashboard and Panels delta (docs/completed/2026-09-02-Dashboard-and-Panels.md)
// — mirrors the domain invariants in domain/dashboard.ts that don't need a
// DB lookup; account-ownership checks for Balances still run server-side
// in use-cases/dashboards.ts (rule #17).
export const addPanelSchema = z.object({
  profileId: z.string().min(1),
  dashboardId: z.string().min(1),
  key: z.enum(PANEL_KEYS),
});

export const removePanelSchema = z.object({
  profileId: z.string().min(1),
  panelId: z.string().min(1),
});

export const movePanelSchema = z.object({
  profileId: z.string().min(1),
  panelId: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});

// A discriminated union on `key` — same reasoning as createBudgetSchema's
// filter condition union: keeps each branch's `configuration` shape
// precisely typed (so it lines up with domain/dashboard.ts's
// PanelConfigByKey without a cast) instead of one loosely-typed object.
// The server always re-derives the panel's real key from its own DB row
// for authority (use-cases/dashboards.ts's updatePanelConfiguration) — the
// client-supplied `key` here only drives which branch this schema
// validates against.
const noPanelConfigSchema = z.object({});

export const updatePanelConfigurationSchema = z
  .object({ profileId: z.string().min(1), panelId: z.string().min(1) })
  .and(
    z.union([
      z.object({ key: z.literal("NET_WORTH"), configuration: noPanelConfigSchema }),
      z.object({ key: z.literal("ASSETS"), configuration: noPanelConfigSchema }),
      z.object({ key: z.literal("LIABILITIES"), configuration: noPanelConfigSchema }),
      z.object({ key: z.literal("BUDGETS_NEEDING_REVIEW"), configuration: noPanelConfigSchema }),
      z.object({
        key: z.literal("BALANCES"),
        configuration: z.object({
          scope: z.enum(BALANCES_ACCOUNT_SCOPES),
          accountIds: z.array(z.string().min(1)),
        }),
      }),
      z.object({
        key: z.literal("RECENT_EXPENSES"),
        configuration: z.object({ period: z.enum(RECENT_EXPENSES_PERIODS) }),
      }),
      z.object({
        key: z.literal("RECENT_TRANSACTIONS"),
        configuration: z.object({ limit: z.number().int().min(1).max(100) }),
      }),
    ]),
  );

export const setAutomaticBackupEnabledSchema = z.object({
  enabled: z.boolean(),
});

export const resetLedgerSchema = z.object({
  confirmation: z.literal("RESET", { message: 'Type "RESET" to continue' }),
});

// Portfolio (Portfolio Adoption Plan, 2026-09-05) — `profileId` present on
// every schema here, unlike `instruments`' own schemas: PortfolioAccount/
// Folio/InvestmentTransaction are Profile-scoped (schema.ts's own
// comments on those tables), Instrument itself is not.
export const createPortfolioAccountSchema = z.object({
  profileId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(INSTRUMENT_BACKED_TYPES),
  provider: z.string().trim().min(1).optional(),
});

export const createFolioSchema = z.object({
  profileId: z.string().min(1),
  portfolioAccountId: z.string().min(1),
  number: z.string().trim().min(1, "Folio/account number is required"),
  amcCode: z.string().trim().min(1).optional(),
});

// Portfolio investment transactions are import-derived, read-only records
// (Portfolio UI/Navigation Model delta, 2026-09-05, §6/§9) — no user-facing
// create/edit/delete schema for them. `createInvestmentTransaction`
// (services/investmentTransactions.ts) still exists and is still Zod-
// validated at its own layer, called only by services/casImport.ts.

export const runCasImportSchema = z.object({
  profileId: z.string().min(1),
  password: z.string(),
  filename: z.string().optional(),
  currencyId: z.string().min(1),
});

// Preview needs no currencyId — it only counts what a commit would create,
// never converts an amount into a Money value (UX review, 2026-09-05
// accepted correction: CAS import gets a real review step before commit).
export const previewCasImportSchema = z.object({
  profileId: z.string().min(1),
  password: z.string(),
});

// A tradebook carries no PAN/investor identity and needs no password — the
// user has already picked/created the destination PortfolioAccount+Folio
// before this ever runs (services/tradebookImport.ts's own rationale).
export const previewTradebookImportSchema = z.object({
  profileId: z.string().min(1),
  folioId: z.string().min(1),
});

export const runTradebookImportSchema = z.object({
  profileId: z.string().min(1),
  portfolioAccountId: z.string().min(1),
  folioId: z.string().min(1),
  currencyId: z.string().min(1),
});

// Demat eCAS import — no currencyId (it only ever records Holding
// snapshots, never a Money-valued InvestmentTransaction) and no
// account/folio picker (both are auto-resolved from the file's own
// dp_id/client_id, services/ecasImport.ts), same PDF+password shape as
// MF CAS otherwise.
export const previewEcasImportSchema = z.object({
  profileId: z.string().min(1),
  password: z.string(),
});

export const runEcasImportSchema = z.object({
  profileId: z.string().min(1),
  password: z.string(),
  filename: z.string().optional(),
});
