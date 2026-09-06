"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toMinorUnits, type Classification } from "@/core";
import { humanizeEnum } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker, todayIso } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/tag-input";
import { AccountIcon } from "@/components/account-icon";
import { createTransactionAction, editTransactionAction } from "@/server/actions/transactions";

// Shared account shape every TransactionForm call site enriches its
// account list into — carries each Account's own Currency (Currency
// Catalogue delta, 2026-09-03: Accounts can now have independently
// different currencies) so the form can derive the active currency from
// whichever Account is selected as From, and restrict To/destination
// pickers to the same currency rather than letting a user reach
// MIXED_CURRENCY_UNSUPPORTED with no warning (domain/transaction.ts —
// normal transactions must resolve to exactly one currency; conversion
// transactions are a future phase, out of scope here).
export interface TransactionFormAccount {
  id: string;
  name: string;
  classification: Classification;
  icon?: string | null;
  currencyId: string;
  currencySymbol: string;
  currencyScale: number;
}

// Simple mode (docs/08-ui-principles.md): Date / Description / From /
// Amount / To — no debit/credit language. Split mode extends this into one
// From (credited the full Amount) and N "To" destinations (each debited
// their own share), with a live running Total checked against Amount.
// Simple mode is just Split mode with exactly one destination line, whose
// amount always mirrors the top-level Amount field — same schema and
// submit path for both (ADR-027: Simple/Split are progressive disclosure
// over one generic N-posting model).
//
// Client-local schema — shape-only, for fast UX feedback. The real
// enforcement point is createTransactionSchema/editTransactionSchema in
// src/server/actions/schemas.ts, run again inside the Server Action
// (rule #17). Amount comparisons convert to integer minor units first
// (not raw decimals) to avoid floating-point false negatives.
//
// `accountsById` is closed over so this can resolve each side's own
// Account/Currency directly, rather than assuming one shared currency
// across the whole transaction — Accounts can have independently
// different currencies now (Currency Catalogue delta).
//
// Reconciliation gate (2026-09-03 delta): To Amount is always its own
// editable fact now, never silently derived from From Amount — so the two
// can end up unequal. Three cases, matched exactly to
// domain/transaction.ts's own isConversionShape rule so the client never
// blocks something the server would accept, or vice versa:
//   1. Same currency, equal amounts — the normal, default case. No gate.
//   2. Different currencies — a Currency Conversion. Never a sum/balance
//      check (there's nothing to sum across two currencies) — but must be
//      explicitly confirmed (`reconciled`) before it can submit.
//   3. Same currency, unequal amounts — not a valid shape at all (the
//      domain layer has no "two independent same-currency legs" concept;
//      that would mean money silently appearing or vanishing). Hard
//      rejected with a message that tells the user how to fix it, never
//      silently treated as balanced and never bypassable via `reconciled`.
export function buildTransactionFormSchema(
  currencyScale: number,
  accountsById: ReadonlyMap<string, TransactionFormAccount>,
) {
  return z
    .object({
      date: z.string().min(1, "Date is required"),
      description: z.string().trim().min(1, "Description is required"),
      fromAccountId: z.string().min(1, "From account is required"),
      amount: z.number().positive("Amount must be greater than zero"),
      toLines: z
        .array(
          z.object({
            accountId: z.string().min(1, "Account is required"),
            amount: z.number().positive("Amount must be greater than zero"),
          }),
        )
        .min(1, "At least one destination is required"),
      // UI-only gate, never submitted as part of the Transaction payload
      // (onSubmit never reads it) — same "convenience, not accounting
      // fact" posture as the derived Rate display.
      reconciled: z.boolean(),
    })
    .refine(
      (values) => values.toLines.every((line) => line.accountId !== values.fromAccountId),
      { message: "From and To must be different accounts", path: ["toLines"] },
    )
    .refine((values) => values.date <= todayIso(), {
      message: "Date can't be in the future",
      path: ["date"],
    })
    .superRefine((values, ctx) => {
      if (values.toLines.length > 1) {
        // Split: always one currency, N destinations that must add up to
        // the total — Currency Conversion is exactly two accounts, never
        // reachable once splitting (the destination picker itself already
        // only offers From's currency once a second line exists).
        const total = values.toLines.reduce(
          (sum, line) => sum + toMinorUnits(line.amount, currencyScale),
          0,
        );
        if (total !== toMinorUnits(values.amount, currencyScale)) {
          ctx.addIssue({
            code: "custom",
            path: ["toLines"],
            message: "Split amounts must add up to the total Amount",
          });
        }
        return;
      }

      const fromAccount = accountsById.get(values.fromAccountId);
      const toAccount = accountsById.get(values.toLines[0]!.accountId);
      if (!fromAccount || !toAccount) return; // required-field checks above already cover an unpicked account

      if (fromAccount.currencyId === toAccount.currencyId) {
        const fromMinor = toMinorUnits(values.amount, fromAccount.currencyScale);
        const toMinor = toMinorUnits(values.toLines[0]!.amount, toAccount.currencyScale);
        if (fromMinor !== toMinor) {
          ctx.addIssue({
            code: "custom",
            path: ["toLines"],
            message:
              "From Amount and To Amount must match for a same-currency transfer. To record a currency conversion, choose a different-currency destination account instead.",
          });
        }
      } else if (!values.reconciled) {
        ctx.addIssue({
          code: "custom",
          path: ["reconciled"],
          message: "Confirm the currency conversion before saving.",
        });
      }
    });
}

type TransactionFormValues = z.infer<ReturnType<typeof buildTransactionFormSchema>>;

interface TransactionFormProps {
  accounts: TransactionFormAccount[];
  mode?: "create" | "edit";
  existingTags?: string[];
  defaultFromAccountId?: string;
  cancelHref?: string;
  // Pre-add a blank destination line on mount — the row menu's "Split
  // Transaction" entry point (replaces the old `?split=1` query param now
  // that Full Edit is a Sheet overlay, not a route: a query param has
  // nothing to attach to once there's no route to carry it).
  initialSplit?: boolean;
  // When provided (Sheet usage — TransactionEditDrawer), Cancel closes the
  // Sheet instead of navigating, and a successful submit calls this instead
  // of `router.push`ing to `cancelHref`/the transactions list — there's
  // nowhere to navigate *to* since the form isn't a route in that context,
  // just refresh the underlying page's data and close.
  onCancel?: () => void;
  onSuccess?: () => void;
  // Sheet-usage-only (edit-visual-behaviour delta §12) — see AccountForm's
  // own doc comment on the identical prop for why the confirmation UI
  // lives in the wrapping Sheet, not duplicated per form.
  onDirtyChange?: (dirty: boolean) => void;
  transaction?: {
    id: string;
    date: string;
    description: string;
    tags: string[] | null;
    fromAccountId: string;
    amount: number;
    toLines: { accountId: string; amount: number }[];
  };
}

export function TransactionForm({
  accounts,
  mode = "create",
  existingTags = [],
  defaultFromAccountId,
  cancelHref,
  initialSplit,
  onCancel,
  onSuccess,
  onDirtyChange,
  transaction,
}: TransactionFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(transaction?.tags ?? []);
  // Stable initial value — see AccountForm's identical comment on why
  // `tags` (plain useState, outside react-hook-form) needs its own
  // dirty-check rather than relying on `formState.isDirty` alone.
  const initialTags = useRef(transaction?.tags ?? []).current;
  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  // Fixed, generous internal precision for the split-sums-to-total check
  // (buildTransactionFormSchema) — the real, currency-correct scale for
  // each leg is resolved from that leg's own Account and only applied
  // once, in onSubmit's own toMinorUnits conversion. Since a *split* (as
  // opposed to a Currency Conversion) always shares one currency across
  // every destination, this internal check only needs *a* consistent
  // precision to compare amounts safely, not the real one — 6 decimal
  // places comfortably covers every real currency's actual scale (0-4).
  const schema = useMemo(() => buildTransactionFormSchema(6, accountsById), [accountsById]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty: fieldsAreDirty, dirtyFields },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(schema),
    // Every registered field path must appear here, even for create mode's
    // "nothing yet" state (`date`/`description` as `""`, `amount` as `NaN`
    // — an empty number input reads back as `NaN` via `valueAsNumber`, not
    // `undefined`). A key missing from defaultValues but present on the
    // rendered form makes react-hook-form's `formState.isDirty` true from
    // the very first render, before any user interaction: it diffs the
    // full current-values shape against defaultValues, and an absent key
    // is itself a diff, independent of any single field's own dirty state
    // (`dirtyFields` stays empty even while `isDirty` is true) — invisible
    // until something actually reads `isDirty` (edit-visual-behaviour
    // delta §12's unsaved-changes guard is the first thing that does).
    defaultValues: transaction
      ? {
          date: transaction.date,
          description: transaction.description,
          fromAccountId: transaction.fromAccountId,
          amount: transaction.amount,
          toLines: transaction.toLines,
          // Edit mode: whatever's already saved was already valid — start
          // reconciled, same posture as "no persisted draft" (only a fresh
          // change should ever demand re-confirmation, via the reset effect
          // below). Irrelevant/unused for a same-currency transaction.
          reconciled: true,
        }
      : {
          date: "",
          description: "",
          fromAccountId: defaultFromAccountId ?? "",
          amount: Number.NaN,
          toLines: [{ accountId: "", amount: 0 }],
          reconciled: false,
        },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "toLines" });

  const amount = watch("amount");
  const toLines = watch("toLines");
  const fromAccountId = watch("fromAccountId");
  const isSplit = fields.length > 1;

  // The active (From) currency — falls back to the first Account in the
  // list purely so the Amount field isn't blank/symbol-less before
  // anything's been picked yet (cosmetic only; resolves to the real
  // selection the moment From is set).
  const fromAccount = accountsById.get(fromAccountId) ?? accounts[0];
  const currencySymbol = fromAccount?.currencySymbol ?? "";
  const currencyScale = fromAccount?.currencyScale ?? 2;

  // Reconciliation gate (2026-09-03 delta) — To Amount is always its own
  // editable fact now (never forcibly mirrored once the user touches it),
  // so From/To can end up unequal. Three cases, matching
  // buildTransactionFormSchema's superRefine and domain/transaction.ts's
  // isConversionShape exactly (this is a UI-side read of the same rule,
  // not a separate source of truth) — never reachable during a *split*
  // (2+ destinations): "Currency conversion -> exactly two accounts", so
  // destination pickers only restrict to From's currency once a second
  // destination line exists.
  const toAccount = accountsById.get(toLines[0]?.accountId ?? "");
  const toCurrencySymbol = toAccount?.currencySymbol ?? currencySymbol;
  const toCurrencyScale = toAccount?.currencyScale ?? currencyScale;
  const toAmount = toLines[0]?.amount;
  const isSameCurrency = !!fromAccount && !!toAccount && fromAccount.currencyId === toAccount.currencyId;
  const amountsEqual =
    toMinorUnits(amount || 0, currencyScale) === toMinorUnits(toAmount || 0, toCurrencyScale);
  const reconciliationCase: "normal" | "conversion" | "mismatch" = !toAccount
    ? "normal"
    : isSameCurrency
      ? amountsEqual
        ? "normal"
        : "mismatch"
      : "conversion";
  const isConversion = reconciliationCase === "conversion";
  const compatibleToAccounts =
    isSplit && fromAccount ? accounts.filter((account) => account.currencyId === fromAccount.currencyId) : accounts;

  // Clear a destination that no longer matches From's currency — but only
  // once splitting (2+ destinations): a *single* mismatched destination is
  // the Conversion case and must never be auto-cleared. Fires when From
  // changes (its currency might no longer match an existing split leg) or
  // when a second destination is added while the first was already a
  // different-currency Conversion pairing (that pairing must collapse
  // back to unselected the moment splitting makes it invalid, not linger).
  useEffect(() => {
    if (!fromAccount || !isSplit) return;
    toLines.forEach((line, index) => {
      const account = accountsById.get(line.accountId);
      if (account && account.currencyId !== fromAccount.currencyId) {
        setValue(`toLines.${index}.accountId`, "", { shouldValidate: false });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check when From's currency or split-ness actually changes, not on every toLines edit
  }, [fromAccount?.currencyId, isSplit]);

  const tagsChanged =
    tags.length !== initialTags.length || tags.some((tag, index) => tag !== initialTags[index]);
  const isDirty = fieldsAreDirty || tagsChanged;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // `initialSplit` (Split Transaction row action, product-polish delta plan
  // #5, decision #3): pre-add a blank destination line once on mount, read
  // once via a ref guard so it doesn't re-fire on every render/append.
  const appliedInitialSplit = useRef(false);
  useEffect(() => {
    if (appliedInitialSplit.current) return;
    appliedInitialSplit.current = true;
    if (initialSplit && fields.length === 1) {
      append({ accountId: "", amount: 0 });
    }
  }, [initialSplit, fields.length, append]);

  // Simple mode: the single destination line *defaults* to mirroring the
  // top-level Amount field — but only until the user edits To Amount
  // themselves (`dirtyFields`, react-hook-form's own per-field tracking;
  // this `setValue` call never sets `shouldDirty`, so it can't falsely
  // trip its own guard). Reconciliation gate delta (2026-09-03): "Default
  // behaviour must remain unchanged... but the user must be able to
  // change To Amount independently" — this is that: same default as
  // before, now with a real escape hatch instead of forcibly re-mirroring
  // on every keystroke. `amount` is `NaN` (not `undefined`) on a blank
  // create-mode mount — the Amount input's empty string runs through
  // `valueAsNumber` before ever being typed into — so this must guard
  // against NaN too, or it fires a spurious `setValue` on mount that marks
  // the untouched form dirty (edit-visual-behaviour delta §12's guard).
  const toAmountTouched = !!dirtyFields.toLines?.[0]?.amount;
  useEffect(() => {
    if (!isSplit && !toAmountTouched && amount !== undefined && !Number.isNaN(amount)) {
      setValue("toLines.0.amount", amount, { shouldValidate: false });
    }
  }, [isSplit, amount, toAmountTouched, setValue]);

  // Reconciliation must be re-confirmed after any change to what's being
  // reconciled — never let a stale confirmation silently carry over to a
  // different amount/account pairing. Skips its very first run (mount):
  // edit mode seeds `reconciled: true` for whatever was already saved,
  // which this effect must not immediately stomp before the user has
  // touched anything.
  const toLineAccountId = toLines[0]?.accountId;
  const skipReconciledResetRef = useRef(true);
  useEffect(() => {
    if (skipReconciledResetRef.current) {
      skipReconciledResetRef.current = false;
      return;
    }
    setValue("reconciled", false, { shouldValidate: false });
  }, [fromAccountId, toLineAccountId, amount, toAmount, setValue]);

  // Rate is a display/input convenience over the two real leg amounts,
  // never submitted directly (onSubmit only ever sends the two `amount`
  // fields as postings, same as before) — always derived from them, except
  // for the one tick right after the user edits it themselves
  // (rateEditedRef), so recomputing right back from the amount it just set
  // doesn't visibly snap the input to a rounded-off value the instant they
  // finish typing. The server independently re-derives and persists the
  // same ratio as the posting's `price` (Revised Investment Model delta,
  // 2026-09-03, use-cases/transactions.ts's derivePostings) — Rate was
  // never an accounting fact of its own, and still isn't; it's just no
  // longer discarded once it reaches the server.
  const [rateInput, setRateInput] = useState("");
  const rateEditedRef = useRef(false);
  useEffect(() => {
    if (!isConversion) return;
    if (rateEditedRef.current) {
      rateEditedRef.current = false;
      return;
    }
    if (amount > 0 && toAmount > 0) {
      setRateInput(String(Number((toAmount / amount).toFixed(6))));
    }
  }, [isConversion, amount, toAmount]);

  const totalMinorUnits = (toLines ?? []).reduce(
    (sum, line) => sum + toMinorUnits(line.amount || 0, currencyScale),
    0,
  );
  const amountMinorUnits = toMinorUnits(amount || 0, currencyScale);
  const isBalanced = totalMinorUnits === amountMinorUnits;

  const onSubmit = async (values: TransactionFormValues) => {
    setServerError(null);
    // Each leg converts using *its own* Account's currency scale, not a
    // single shared one — for a Conversion those legitimately differ
    // (JPY's scale is 0, INR's is 2); for a same-currency/split
    // transaction every leg's scale is identical anyway, so this is a
    // strict generalization, not a behavior change for the existing case.
    const fromAmountMinorUnits = toMinorUnits(values.amount, fromAccount?.currencyScale ?? currencyScale);
    const postings = [
      { accountId: values.fromAccountId, debit: 0, credit: fromAmountMinorUnits },
      ...values.toLines.map((line) => {
        const lineAccount = accountsById.get(line.accountId);
        const lineScale = lineAccount?.currencyScale ?? currencyScale;
        return {
          accountId: line.accountId,
          debit: toMinorUnits(line.amount, lineScale),
          credit: 0,
        };
      }),
    ];

    const payload = {
      date: values.date,
      description: values.description,
      tags: tags.length > 0 ? tags : undefined,
      postings,
    };

    const result =
      mode === "create"
        ? await createTransactionAction(payload)
        : await editTransactionAction({ ...payload, transactionId: transaction!.id });

    if (!result.success) {
      setServerError(result.error);
      return;
    }
    if (onSuccess) {
      onSuccess();
    } else {
      router.push(cancelHref ?? "/transactions");
    }
    router.refresh();
  };

  // Icon-colored, matching every other account list in the app (color
  // lives on the icon only, name stays neutral text — account-table.tsx's
  // same rule, dense/scannable lists don't get per-row color noise).
  const accountLabel = (accountId: string) => {
    const account = accountsById.get(accountId);
    if (!account) return "Select an account";
    return (
      <span className="flex items-center gap-2">
        <AccountIcon classification={account.classification} icon={account.icon} />
        {account.name} — {humanizeEnum(account.classification)}
      </span>
    );
  };

  const accountOptionsFor = (list: TransactionFormAccount[]) => (
    <>
      {list.map((account) => (
        <SelectItem key={account.id} value={account.id}>
          <span className="flex items-center gap-2">
            <AccountIcon classification={account.classification} icon={account.icon} />
            {account.name} — {humanizeEnum(account.classification)}
          </span>
        </SelectItem>
      ))}
    </>
  );
  const accountOptions = accountOptionsFor(accounts);
  const toAccountOptions = accountOptionsFor(compatibleToAccounts);

  const onRateChange = (raw: string) => {
    setRateInput(raw);
    const parsedRate = Number(raw);
    if (Number.isFinite(parsedRate) && parsedRate > 0 && amount > 0) {
      rateEditedRef.current = true;
      setValue("toLines.0.amount", Number((amount * parsedRate).toFixed(toCurrencyScale)), {
        shouldValidate: false,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transaction-date">Date</Label>
        <Controller
          control={control}
          name="date"
          render={({ field }) => (
            <DatePicker
              id="transaction-date"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              aria-invalid={!!errors.date}
              maxDate={todayIso()}
            />
          )}
        />
        {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transaction-description">Description</Label>
        <Input
          id="transaction-description"
          placeholder="e.g. Ginza Dinner"
          {...register("description")}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transaction-from">From</Label>
        <Controller
          control={control}
          name="fromAccountId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="transaction-from">
                <SelectValue placeholder="Select an account">{accountLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>{accountOptions}</SelectContent>
            </Select>
          )}
        />
        {errors.fromAccountId && (
          <p className="text-sm text-destructive">{errors.fromAccountId.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transaction-amount">{isSplit ? "Amount" : "From Amount"} ({currencySymbol})</Label>
        <Input
          id="transaction-amount"
          type="number"
          step={10 ** -currencyScale}
          min="0"
          placeholder="0.00"
          {...register("amount", { valueAsNumber: true })}
        />
        {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
      </div>

      {!isSplit ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="transaction-to">To</Label>
              {reconciliationCase === "normal" && (
                <button
                  type="button"
                  onClick={() => append({ accountId: "", amount: 0 })}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  + Split
                </button>
              )}
            </div>
            <Controller
              control={control}
              name="toLines.0.accountId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="transaction-to">
                    <SelectValue placeholder="Select an account">{accountLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>{toAccountOptions}</SelectContent>
                </Select>
              )}
            />
          </div>

          {/* To Amount (2026-09-03 Reconciliation Gate delta) — always its
              own editable fact now, for every transfer, not only a
              Currency Conversion. Defaults to mirroring From Amount
              (effect above) until the user edits it directly. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transaction-to-amount">To Amount ({toCurrencySymbol})</Label>
            <Input
              id="transaction-to-amount"
              type="number"
              step={10 ** -toCurrencyScale}
              min="0"
              placeholder="0.00"
              {...register("toLines.0.amount", { valueAsNumber: true })}
            />
          </div>

          {reconciliationCase === "conversion" && (
            <>
              {/* Currency Conversion — From and To are independent amounts,
                  each the real accounting fact for its own leg; Rate is
                  purely a derived/edit convenience, never submitted
                  (onSubmit only ever sends the two `amount` fields as
                  postings). Must be explicitly reconciled before Save. */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="transaction-rate">
                  Rate (1 {currencySymbol} = ? {toCurrencySymbol})
                </Label>
                <Input
                  id="transaction-rate"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={rateInput}
                  onChange={(e) => onRateChange(e.target.value)}
                />
              </div>
              <Controller
                control={control}
                name="reconciled"
                render={({ field }) => (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="transaction-reconciled"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <Label htmlFor="transaction-reconciled" className="text-sm font-normal">
                      I confirm this currency conversion — 1 {currencySymbol} = {rateInput || "?"}{" "}
                      {toCurrencySymbol}
                    </Label>
                  </div>
                )}
              />
              {errors.reconciled && (
                <p className="text-sm text-destructive">{errors.reconciled.message}</p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>To</Label>
          {fields.map((field, index) => (
            <div key={field.id} className="flex flex-col gap-2 sm:flex-row">
              <Controller
                control={control}
                name={`toLines.${index}.accountId`}
                render={({ field: controllerField }) => (
                  <Select value={controllerField.value} onValueChange={controllerField.onChange}>
                    <SelectTrigger
                      className="sm:flex-1"
                      aria-label={`Destination account ${index + 1}`}
                    >
                      <SelectValue placeholder="Select an account">{accountLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>{toAccountOptions}</SelectContent>
                  </Select>
                )}
              />
              <div className="flex gap-2">
                <Input
                  aria-label={`Destination amount ${index + 1}`}
                  type="number"
                  step={10 ** -currencyScale}
                  min="0"
                  placeholder="0.00"
                  className="w-28"
                  {...register(`toLines.${index}.amount`, { valueAsNumber: true })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                >
                  Remove
                </Button>
              </div>
              {(errors.toLines?.[index]?.accountId?.message ||
                errors.toLines?.[index]?.amount?.message) && (
                <p className="text-sm text-destructive">
                  {errors.toLines[index]?.accountId?.message ??
                    errors.toLines[index]?.amount?.message}
                </p>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => append({ accountId: "", amount: 0 })}
            className="self-start text-sm text-muted-foreground hover:text-foreground"
          >
            + Add destination
          </button>

          <div className="flex items-center justify-between text-sm">
            <span>
              Total: {currencySymbol}
              {(totalMinorUnits / 10 ** currencyScale).toFixed(currencyScale)}
            </span>
            <span className={isBalanced ? "text-success" : "text-destructive"}>
              {isBalanced ? "✓ Balanced" : "✗ Not balanced"}
            </span>
          </div>
        </div>
      )}
      {errors.toLines?.root?.message && (
        <p className="text-sm text-destructive">{errors.toLines.root.message}</p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Tags</Label>
        <TagInput value={tags} onChange={setTags} suggestions={existingTags} />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      {/* Explicit Save/Cancel pair (docs/design/design.md §12) — Cancel
          discards in-progress edits by simply navigating away without
          submitting; there's nothing to roll back server-side since nothing
          was persisted yet (ADR-023, no persisted draft). */}
      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Link
            href={cancelHref ?? "/transactions"}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
        )}
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
