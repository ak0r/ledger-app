// Zod schemas at the Server Action boundary. These mirror the domain
// invariants that don't require a DB lookup (posting shape, >= 2 postings,
// balance) so the client gets fast feedback — but they are NOT the source
// of truth. Ownership and currency-support checks need Account rows from
// the DB and can only happen in the domain/use-case layer (Phase 3/4),
// which every action still runs after this parse succeeds (rule #17).
import { z } from "zod";
import { CLASSIFICATIONS, CREATABLE_CLASSIFICATIONS, INSTRUMENT_TYPES } from "../db/schema";

export const createProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export const renameProfileSchema = z.object({
  profileId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
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

export const createCurrencySchema = z.object({
  profileId: z.string().min(1),
  code: z.string().length(3, "Currency code must be 3 letters"),
  name: z.string().trim().min(1),
  symbol: z.string().trim().min(1),
  minorUnitScale: z.number().int().min(0),
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
  instrumentType: z.enum(INSTRUMENT_TYPES),
  instrumentId: z.string().trim().min(1).optional(),
  instrumentLabel: z.string().trim().min(1).optional(),
  tags: tagsSchema,
  icon: z.string().trim().min(1).optional(),
  metadata: z.string().optional(),
});

export const editAccountSchema = z.object({
  profileId: z.string().min(1),
  accountId: z.string().min(1),
  name: z.string().trim().min(1),
  classification: z.enum(CLASSIFICATIONS),
  instrumentType: z.enum(INSTRUMENT_TYPES),
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

const postingSchema = z
  .object({
    accountId: z.string().min(1),
    debit: z.number().int().min(0),
    credit: z.number().int().min(0),
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

function isBalanced(transaction: z.infer<typeof transactionFieldsSchema>): boolean {
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
