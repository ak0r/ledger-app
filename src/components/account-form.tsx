"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPES_BY_CLASSIFICATION,
  CLASSIFICATIONS,
  CREATABLE_CLASSIFICATIONS,
  type AccountType,
  type Classification,
} from "@/core";
import { humanizeEnum } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClassificationCards } from "@/components/classification-cards";
import { TagInput } from "@/components/tag-input";
import { IconPicker } from "@/components/icon-picker";
import { createAccountAction, editAccountAction } from "@/server/actions/accounts";
import { upsertCreditCardDetailsAction, upsertLoanDetailsAction } from "@/server/actions/liabilityDetails";

// Client-local schema — shape-only, for fast UX feedback. The real
// enforcement point is createAccountSchema/editAccountSchema in
// src/server/actions/schemas.ts, run again inside the Server Action
// (rule #17). No Label/Opening-balance fields (product-polish pass): an
// opening balance is a normal double-entry Transaction, not special
// Account-creation state (see src/server/services/accounts.ts).
const accountFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  currencyId: z.string().min(1, "Currency is required"),
  classification: z.enum(CLASSIFICATIONS),
  accountType: z.enum(ACCOUNT_TYPES),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

// Every Classification has a real Account Type vocabulary now (Account
// Types, Money Representation, Rational Pricing, FX & Liability Details
// delta reverses the 2026-08-19 delta §19.1 "Income/Expense have no
// Account Type" posture) — the first listed type is just a sensible
// default selection, not a "no picker" fallback the way it used to be.
function defaultAccountTypeFor(classification: Classification): AccountType {
  return ACCOUNT_TYPES_BY_CLASSIFICATION[classification][0];
}

// Liability supporting information (Account Types, Money Representation,
// Rational Pricing, FX & Liability Details delta §7/§8) — plain string
// state outside react-hook-form, same posture as Tags/Icon above: these
// are a secondary, conditionally-rendered concern, not part of the core
// Account identity the Zod-validated form fields cover. Money/percent
// fields stay strings while being typed, parsed to a number (or `null`
// when left blank) only at submit time.
interface CreditCardFieldsState {
  creditLimit: string;
  statementEndDay: string;
  dueDay: string;
  network: string;
  last4: string;
  expirationDate: string;
}
const EMPTY_CREDIT_CARD_FIELDS: CreditCardFieldsState = {
  creditLimit: "",
  statementEndDay: "",
  dueDay: "",
  network: "",
  last4: "",
  expirationDate: "",
};

interface LoanFieldsState {
  originalAmount: string;
  disbursedAmount: string;
  interestRatePercent: string;
  tenureMonths: string;
  emiAmount: string;
  emiDay: string;
  startDate: string;
  maturityDate: string;
}
const EMPTY_LOAN_FIELDS: LoanFieldsState = {
  originalAmount: "",
  disbursedAmount: "",
  interestRatePercent: "",
  tenureMonths: "",
  emiAmount: "",
  emiDay: "",
  startDate: "",
  maturityDate: "",
};

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringOrNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

interface AccountFormProps {
  currencies: { id: string; code: string; symbol: string; minorUnitScale: number }[];
  // Create mode only — the active Profile's Primary Currency, preselected
  // instead of just "whichever currency sorts first" (Currency Catalogue
  // delta, 2026-09-03: "Account currency defaults to the Profile Primary
  // Currency when creating an account"). Falls back to `currencies[0]` when
  // absent (Profile has no Primary Currency set yet).
  defaultCurrencyId?: string;
  mode: "create" | "edit";
  existingTags?: string[];
  account?: {
    id: string;
    currencyId: string;
    currencyCode: string;
    name: string;
    classification: Classification;
    accountType: AccountType;
    tags: string[] | null;
    icon: string | null;
  };
  // Edit mode only, and only meaningful when `account.accountType` is
  // CREDIT_CARD/LOAN respectively — pre-fills the conditional Liability
  // fields step below. `undefined`/absent is the normal "no details set
  // yet" case, not an error.
  creditCardDetails?: {
    creditLimit: number | null;
    statementEndDay: number | null;
    dueDay: number | null;
    network: string | null;
    last4: string | null;
    expirationDate: string | null;
  } | null;
  loanDetails?: {
    originalAmount: number | null;
    disbursedAmount: number | null;
    interestRatePercent: number | null;
    tenureMonths: number | null;
    emiAmount: number | null;
    emiDay: number | null;
    startDate: string | null;
    maturityDate: string | null;
  } | null;
  // Modal usage (AccountFormSheet) passes these to close itself instead of
  // navigating — same optional-override posture as TransactionForm's own
  // onCancel/onSuccess (transaction-edit-drawer.tsx). Page usages
  // (accounts/new, accounts/[id]/settings) omit them and keep the original
  // router.push behavior unchanged.
  onSuccess?: () => void;
  onCancel?: () => void;
  // Create mode only — fires with the created Account's id/name right after
  // a successful submit, before onSuccess/router.refresh() below. Lets a
  // caller that embeds this form inline (e.g. the Transaction filter's
  // Account picker, transaction-filter-drawer.tsx) apply the new Account
  // immediately instead of waiting for router.refresh() to re-deliver it
  // through server props.
  onCreated?: (account: { id: string; name: string }) => void;
  // Sheet-usage-only (edit-visual-behaviour delta §12) — the wrapping Sheet
  // gates its own close attempts on this rather than the form owning any
  // "are you sure" UI itself, so the confirmation pattern lives in exactly
  // one place (`AccountFormSheet`) instead of duplicated per form.
  onDirtyChange?: (dirty: boolean) => void;
}

export function AccountForm({
  currencies,
  defaultCurrencyId,
  mode,
  existingTags = [],
  account,
  creditCardDetails,
  loanDetails,
  onSuccess,
  onCancel,
  onCreated,
  onDirtyChange,
}: AccountFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(account?.tags ?? []);
  const [icon, setIcon] = useState<string | undefined>(account?.icon ?? undefined);
  const [ccFields, setCcFields] = useState<CreditCardFieldsState>(
    creditCardDetails
      ? {
          creditLimit: creditCardDetails.creditLimit?.toString() ?? "",
          statementEndDay: creditCardDetails.statementEndDay?.toString() ?? "",
          dueDay: creditCardDetails.dueDay?.toString() ?? "",
          network: creditCardDetails.network ?? "",
          last4: creditCardDetails.last4 ?? "",
          expirationDate: creditCardDetails.expirationDate ?? "",
        }
      : EMPTY_CREDIT_CARD_FIELDS,
  );
  const [loanFields, setLoanFields] = useState<LoanFieldsState>(
    loanDetails
      ? {
          originalAmount: loanDetails.originalAmount?.toString() ?? "",
          disbursedAmount: loanDetails.disbursedAmount?.toString() ?? "",
          interestRatePercent: loanDetails.interestRatePercent?.toString() ?? "",
          tenureMonths: loanDetails.tenureMonths?.toString() ?? "",
          emiAmount: loanDetails.emiAmount?.toString() ?? "",
          emiDay: loanDetails.emiDay?.toString() ?? "",
          startDate: loanDetails.startDate ?? "",
          maturityDate: loanDetails.maturityDate ?? "",
        }
      : EMPTY_LOAN_FIELDS,
  );
  // `tags`/`icon` live outside react-hook-form (plain useState, same as
  // ever) — `formState.isDirty` below only tracks RHF-registered fields,
  // so a Tags/Icon-only change needs its own comparison against the
  // initial values to count as "dirty" too. `useRef` so the *initial*
  // value stays stable across re-renders (not re-captured every render).
  const initialTags = useRef(account?.tags ?? []).current;
  const initialIcon = useRef(account?.icon ?? undefined).current;
  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty: fieldsAreDirty },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    // Every registered field path must appear here, even for create mode
    // — a key missing from defaultValues but present on the rendered form
    // makes react-hook-form's `formState.isDirty` true from the very first
    // render, before any user interaction (see TransactionForm's identical
    // fix/comment for the full mechanism). `name` was missing here.
    defaultValues: account
      ? {
          name: account.name,
          currencyId: account.currencyId,
          classification: account.classification,
          accountType: account.accountType,
        }
      : {
          name: "",
          currencyId: defaultCurrencyId ?? currencies[0]?.id ?? "",
          classification: "ASSET",
          accountType: defaultAccountTypeFor("ASSET"),
        },
  });

  const tagsChanged =
    tags.length !== initialTags.length || tags.some((tag, index) => tag !== initialTags[index]);
  const isDirty = fieldsAreDirty || tagsChanged || icon !== initialIcon;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const classification = watch("classification");
  const accountType = watch("accountType");
  const typeOptions = ACCOUNT_TYPES_BY_CLASSIFICATION[classification];
  // Editing an account whose classification is Balancing (only ever the
  // one seeded "Opening Balance" account) shows Classification as static
  // text instead of the picker — see the JSX below. Balancing also never
  // gets an Account Type step (rule #22 — system-managed, its one
  // `INITIAL` value is set wherever the system seeds it, never picked).
  const isEditingBalancing = mode === "edit" && account?.classification === "BALANCING";

  const onSubmit = async (values: AccountFormValues) => {
    setServerError(null);

    const result =
      mode === "create"
        ? await createAccountAction({
            currencyId: values.currencyId,
            name: values.name,
            classification: values.classification,
            accountType: values.accountType,
            tags: tags.length > 0 ? tags : undefined,
            icon,
          })
        : await editAccountAction({
            accountId: account?.id,
            currencyId: values.currencyId,
            name: values.name,
            classification: values.classification,
            accountType: values.accountType,
            tags: tags.length > 0 ? tags : undefined,
            icon,
          });

    if (!result.success) {
      setServerError(result.error);
      return;
    }

    // Liability supporting information — a secondary concern submitted as
    // its own call right after the Account itself is saved (the Account
    // must exist first, `accountId` is a real FK). Same account, one form,
    // two writes — never a competing source of truth for the Account
    // fields above.
    if (values.accountType === "CREDIT_CARD") {
      const detailsResult = await upsertCreditCardDetailsAction({
        accountId: result.data.id,
        creditLimit: toNumberOrNull(ccFields.creditLimit),
        statementEndDay: toNumberOrNull(ccFields.statementEndDay),
        dueDay: toNumberOrNull(ccFields.dueDay),
        network: toStringOrNull(ccFields.network),
        last4: toStringOrNull(ccFields.last4),
        expirationDate: toStringOrNull(ccFields.expirationDate),
      });
      if (!detailsResult.success) {
        setServerError(detailsResult.error);
        return;
      }
    } else if (values.accountType === "LOAN") {
      const detailsResult = await upsertLoanDetailsAction({
        accountId: result.data.id,
        originalAmount: toNumberOrNull(loanFields.originalAmount),
        disbursedAmount: toNumberOrNull(loanFields.disbursedAmount),
        interestRatePercent: toNumberOrNull(loanFields.interestRatePercent),
        tenureMonths: toNumberOrNull(loanFields.tenureMonths),
        emiAmount: toNumberOrNull(loanFields.emiAmount),
        emiDay: toNumberOrNull(loanFields.emiDay),
        startDate: toStringOrNull(loanFields.startDate),
        maturityDate: toStringOrNull(loanFields.maturityDate),
      });
      if (!detailsResult.success) {
        setServerError(detailsResult.error);
        return;
      }
    }

    if (mode === "create") {
      onCreated?.(result.data);
    }
    if (onSuccess) {
      onSuccess();
    } else {
      router.push("/accounts");
    }
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-name">Name</Label>
        <Input id="account-name" placeholder="e.g. HDFC Bank" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      {mode === "create" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-currency">Currency</Label>
          <Controller
            control={control}
            name="currencyId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="account-currency">
                  <SelectValue placeholder="Select a currency">
                    {(value: string) => {
                      const currency = currencies.find((c) => c.id === value);
                      return currency ? `${currency.code} (${currency.symbol})` : "Select a currency";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.id} value={currency.id}>
                      {currency.code} ({currency.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      ) : (
        account && (
          <div className="flex flex-col gap-1.5">
            <Label>Currency</Label>
            <p className="text-sm text-muted-foreground">{account.currencyCode} — not editable</p>
          </div>
        )
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Classification</Label>
        {isEditingBalancing ? (
          // Balancing is system-managed (the one seeded "Opening Balance"
          // account) — not reassignable to/from via the normal picker,
          // same "not editable" pattern as Currency above.
          <p className="text-sm text-muted-foreground">Balancing — not editable</p>
        ) : (
          <Controller
            control={control}
            name="classification"
            render={({ field }) => (
              <ClassificationCards
                name="classification"
                value={field.value}
                classifications={CREATABLE_CLASSIFICATIONS}
                onChange={(next) => {
                  field.onChange(next);
                  setValue("accountType", defaultAccountTypeFor(next));
                }}
              />
            )}
          />
        )}
      </div>

      {/* Every Classification has a real Type step now except Balancing
          (rule #22 — system-managed, never user-picked). */}
      {classification !== "BALANCING" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-type">Account Type</Label>
          <Controller
            control={control}
            name="accountType"
            render={({ field }) => (
              // `key={classification}` forces a fresh base-ui Select
              // instance whenever the option set actually changes —
              // `SelectContent`'s children are an entirely different key
              // set per classification (no shared `SelectItem` keys to
              // reconcile against), and reusing the same Select instance
              // across that swap left it permanently showing a blank
              // trigger after the value changed underneath it (reproduced
              // via a real Asset→Liability switch: not just the one-frame
              // `null` the `SelectValue` fallback above guards against —
              // the trigger stayed blank indefinitely). A fresh instance
              // per classification sidesteps whatever internal state
              // caused that rather than fighting it.
              <Select key={classification} value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="account-type">
                  {/* `value` can still be `null` for the instance's first
                      render, briefly, before react-hook-form's `setValue`
                      call (which resets `accountType` to match the new
                      classification) commits — base-ui passes `null` here
                      rather than an unmatched string in that window. */}
                  <SelectValue>{(value: string | null) => (value ? humanizeEnum(value) : "")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humanizeEnum(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      )}

      {/* Liability supporting information (delta §7/§8) — Credit Card
          fields for CREDIT_CARD, Loan fields for LOAN, nothing extra for
          PAYABLES (the delta's own "no specialised form required"). */}
      {accountType === "CREDIT_CARD" && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <Label>Credit Card Details</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-credit-limit">Credit Limit</Label>
              <Input
                id="cc-credit-limit"
                type="number"
                step="any"
                min="0"
                value={ccFields.creditLimit}
                onChange={(e) => setCcFields({ ...ccFields, creditLimit: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-network">Network</Label>
              <Input
                id="cc-network"
                placeholder="e.g. Visa"
                value={ccFields.network}
                onChange={(e) => setCcFields({ ...ccFields, network: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-statement-day">Statement Day</Label>
              <Input
                id="cc-statement-day"
                type="number"
                min="1"
                max="31"
                value={ccFields.statementEndDay}
                onChange={(e) => setCcFields({ ...ccFields, statementEndDay: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-due-day">Due Day</Label>
              <Input
                id="cc-due-day"
                type="number"
                min="1"
                max="31"
                value={ccFields.dueDay}
                onChange={(e) => setCcFields({ ...ccFields, dueDay: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-last4">Last 4 Digits</Label>
              <Input
                id="cc-last4"
                maxLength={4}
                value={ccFields.last4}
                onChange={(e) => setCcFields({ ...ccFields, last4: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-expiration">Expiration</Label>
              <Input
                id="cc-expiration"
                placeholder="MM/YY"
                value={ccFields.expirationDate}
                onChange={(e) => setCcFields({ ...ccFields, expirationDate: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}

      {accountType === "LOAN" && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <Label>Loan Details</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-original-amount">Original Amount</Label>
              <Input
                id="loan-original-amount"
                type="number"
                step="any"
                min="0"
                value={loanFields.originalAmount}
                onChange={(e) => setLoanFields({ ...loanFields, originalAmount: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-disbursed-amount">Disbursed Amount</Label>
              <Input
                id="loan-disbursed-amount"
                type="number"
                step="any"
                min="0"
                value={loanFields.disbursedAmount}
                onChange={(e) => setLoanFields({ ...loanFields, disbursedAmount: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-interest-rate">Interest Rate (%)</Label>
              <Input
                id="loan-interest-rate"
                type="number"
                step="any"
                min="0"
                value={loanFields.interestRatePercent}
                onChange={(e) => setLoanFields({ ...loanFields, interestRatePercent: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-tenure">Tenure (months)</Label>
              <Input
                id="loan-tenure"
                type="number"
                min="1"
                step="1"
                value={loanFields.tenureMonths}
                onChange={(e) => setLoanFields({ ...loanFields, tenureMonths: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-emi-amount">EMI Amount</Label>
              <Input
                id="loan-emi-amount"
                type="number"
                step="any"
                min="0"
                value={loanFields.emiAmount}
                onChange={(e) => setLoanFields({ ...loanFields, emiAmount: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-emi-day">EMI Day</Label>
              <Input
                id="loan-emi-day"
                type="number"
                min="1"
                max="31"
                value={loanFields.emiDay}
                onChange={(e) => setLoanFields({ ...loanFields, emiDay: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-start-date">Start Date</Label>
              <Input
                id="loan-start-date"
                type="date"
                value={loanFields.startDate}
                onChange={(e) => setLoanFields({ ...loanFields, startDate: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-maturity-date">Maturity Date</Label>
              <Input
                id="loan-maturity-date"
                type="date"
                value={loanFields.maturityDate}
                onChange={(e) => setLoanFields({ ...loanFields, maturityDate: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Icon</Label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Tags</Label>
        <TagInput value={tags} onChange={setTags} suggestions={existingTags} />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      {/* Explicit Save/Cancel pair (docs/design/design.md §12). Cancel
          returns to the account detail page when editing (nothing to roll
          back — no persisted draft, ADR-023), or the list when creating —
          unless `onCancel` overrides it (modal usage). */}
      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Link
            href={mode === "edit" && account ? `/accounts/${account.id}` : "/accounts"}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
        )}
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Saving…" : mode === "create" ? "Create account" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
