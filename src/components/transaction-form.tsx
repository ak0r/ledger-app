"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, type Control, type UseFormSetValue, type UseFormWatch } from "react-hook-form";
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
import { getActiveProfileBaseCurrencyAction, getDefaultCurrencyRateAction } from "@/server/actions/currencies";

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
// Transaction Form FX UX delta — any destination line can independently be
// in a different currency from the Profile Base Currency now (no more
// "split destinations must share From's currency" restriction, no more
// "Conversion = exactly 2 accounts, never split" restriction). A line
// whose Account currency differs from the Base Currency needs its own
// confirmed Rate (`rateDecimal`/`reconciled`, ForeignRateBlock below); the
// old single top-level `reconciled` + amounts-imply-the-rate model is
// retired — the Rate now comes from a CurrencyRate default (editable), not
// derived from the two typed amounts, so raw same-currency-style sum/
// equality checks are skipped whenever any line is foreign (there's
// nothing meaningful to sum across currencies) — the real balance
// enforcement is the server's own (rule #17), this is advisory only.
export function buildTransactionFormSchema(
  currencyScale: number,
  accountsById: ReadonlyMap<string, TransactionFormAccount>,
  baseCurrencyId: string | null,
) {
  const isForeignAccount = (accountId: string): boolean => {
    if (!baseCurrencyId) return false;
    const account = accountsById.get(accountId);
    return !!account && account.currencyId !== baseCurrencyId;
  };

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
            // Standard one-unit quotation ("1 JPY = 0.5800 INR"), only
            // meaningful (and required) when this line's Account currency
            // differs from the Base Currency.
            rateDecimal: z.number().positive().optional(),
            reconciled: z.boolean().optional(),
          }),
        )
        .min(1, "At least one destination is required"),
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
      const anyForeign = values.toLines.some((line) => isForeignAccount(line.accountId));

      values.toLines.forEach((line, index) => {
        if (!isForeignAccount(line.accountId)) return;
        if (!line.rateDecimal || line.rateDecimal <= 0) {
          ctx.addIssue({ code: "custom", path: ["toLines", index, "rateDecimal"], message: "Rate is required" });
        }
        if (!line.reconciled) {
          ctx.addIssue({
            code: "custom",
            path: ["toLines", index, "reconciled"],
            message: "Confirm the currency conversion before saving.",
          });
        }
      });

      if (anyForeign) return; // amounts across different currencies aren't summable — server is the real gate

      if (values.toLines.length > 1) {
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
            message: "From Amount and To Amount must match for a same-currency transfer.",
          });
        }
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

// One destination line's Rate block (Transaction Form FX UX delta) —
// shown for any To line whose Account currency differs from the Profile
// Base Currency, in both Simple and Split mode alike (rendered once per
// qualifying line, not gated to a single "Conversion" case anymore). The
// standard one-unit quotation ("1 JPY = [ 0.5800 ] INR"), defaulted from
// the CurrencyRate lookup for this line's Account + the Transaction's own
// date, editable, with its own "I confirm" gate — same copy/pattern the
// single-line Conversion case already used, just now a self-contained
// component so it can repeat per line without re-deriving state N times in
// the parent. A local `touchedRef` (not `dirtyFields`, which lives on the
// parent form) stops the default-fetch effect from clobbering a value the
// user already edited.
function ForeignRateBlock({
  control,
  setValue,
  watch,
  index,
  account,
  baseCurrencySymbol,
  date,
}: {
  control: Control<TransactionFormValues>;
  setValue: UseFormSetValue<TransactionFormValues>;
  watch: UseFormWatch<TransactionFormValues>;
  index: number;
  account: TransactionFormAccount;
  baseCurrencySymbol: string;
  date: string;
}) {
  const currentRate = watch(`toLines.${index}.rateDecimal`);
  const touchedRef = useRef(false);

  useEffect(() => {
    touchedRef.current = false;
    let cancelled = false;
    getDefaultCurrencyRateAction({ currencyId: account.currencyId, date: date || todayIso() }).then((result) => {
      if (cancelled || touchedRef.current || !result.success) return;
      setValue(`toLines.${index}.rateDecimal`, result.data.rateDecimal, { shouldValidate: false });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when this line's own Account or the Transaction date changes
  }, [account.id, date]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`transaction-rate-${index}`}>
          Rate (1 {account.currencySymbol} = ? {baseCurrencySymbol})
        </Label>
        <Controller
          control={control}
          name={`toLines.${index}.rateDecimal`}
          render={({ field }) => (
            <Input
              id={`transaction-rate-${index}`}
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              value={field.value ?? ""}
              onChange={(e) => {
                touchedRef.current = true;
                const parsed = e.target.valueAsNumber;
                field.onChange(Number.isFinite(parsed) ? parsed : undefined);
                setValue(`toLines.${index}.reconciled`, false, { shouldValidate: false });
              }}
            />
          )}
        />
      </div>
      <Controller
        control={control}
        name={`toLines.${index}.reconciled`}
        render={({ field }) => (
          <div className="flex items-start gap-2">
            <Checkbox
              id={`transaction-reconciled-${index}`}
              checked={field.value ?? false}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
            <Label htmlFor={`transaction-reconciled-${index}`} className="text-sm font-normal">
              I confirm this currency conversion — 1 {account.currencySymbol} = {currentRate ?? "?"} {baseCurrencySymbol}
            </Label>
          </div>
        )}
      />
    </div>
  );
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
  // Fetched once — every non-Base-Currency destination line needs to know
  // the Base Currency's id (to detect it's foreign at all) and symbol (to
  // label its Rate input). `null` while loading/if the Profile has none yet
  // (no destination is treated as foreign in that window — matches
  // `isForeignAccount`'s own `!baseCurrencyId` guard in the schema below).
  const [baseCurrency, setBaseCurrency] = useState<{ id: string; symbol: string } | null>(null);
  useEffect(() => {
    getActiveProfileBaseCurrencyAction().then((result) => {
      if (result.success) setBaseCurrency({ id: result.data.id, symbol: result.data.symbol });
    });
  }, []);
  // Fixed, generous internal precision for the split-sums-to-total check
  // (buildTransactionFormSchema) — the real, currency-correct scale for
  // each leg is resolved from that leg's own Account and only applied
  // once, in onSubmit's own toMinorUnits conversion. Since a *split* (as
  // opposed to a Currency Conversion) always shares one currency across
  // every destination, this internal check only needs *a* consistent
  // precision to compare amounts safely, not the real one — 6 decimal
  // places comfortably covers every real currency's actual scale (0-4).
  const schema = useMemo(
    () => buildTransactionFormSchema(6, accountsById, baseCurrency?.id ?? null),
    [accountsById, baseCurrency?.id],
  );

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
          // Edit mode never pre-fills a historical rate — a foreign line
          // always re-fetches today's CurrencyRate default (ForeignRateBlock)
          // and needs fresh re-confirmation, same "an edit is never trusted
          // just because the prior version was balanced" posture
          // `editTransaction` itself already documents server-side.
          toLines: transaction.toLines.map((line) => ({ ...line, rateDecimal: undefined, reconciled: false })),
        }
      : {
          date: "",
          description: "",
          fromAccountId: defaultFromAccountId ?? "",
          amount: Number.NaN,
          toLines: [{ accountId: "", amount: 0, rateDecimal: undefined, reconciled: false }],
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

  // Transaction Form FX UX delta — a destination line no longer needs to
  // share From's currency (no more auto-clearing a mismatched split
  // destination); each is independently checked against the Base Currency
  // instead, via `isForeignLine` below. `toAccount` stays for Simple mode's
  // own To-line display, unrelated to foreignness.
  const toAccount = accountsById.get(toLines[0]?.accountId ?? "");
  const toCurrencySymbol = toAccount?.currencySymbol ?? currencySymbol;
  const isForeignLine = (accountId: string): boolean => {
    if (!baseCurrency) return false;
    const account = accountsById.get(accountId);
    return !!account && account.currencyId !== baseCurrency.id;
  };

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
  // trip its own guard) — and never for a foreign destination, where
  // mirroring the same raw number across two different currencies would
  // be actively misleading. `amount` is `NaN` (not `undefined`) on a blank
  // create-mode mount — the Amount input's empty string runs through
  // `valueAsNumber` before ever being typed into — so this must guard
  // against NaN too, or it fires a spurious `setValue` on mount that marks
  // the untouched form dirty (edit-visual-behaviour delta §12's guard).
  const toAmountTouched = !!dirtyFields.toLines?.[0]?.amount;
  const firstLineIsForeign = isForeignLine(toLines[0]?.accountId ?? "");
  useEffect(() => {
    if (!isSplit && !firstLineIsForeign && !toAmountTouched && amount !== undefined && !Number.isNaN(amount)) {
      setValue("toLines.0.amount", amount, { shouldValidate: false });
    }
  }, [isSplit, firstLineIsForeign, amount, toAmountTouched, setValue]);

  const anyLineIsForeign = (toLines ?? []).some((line) => isForeignLine(line.accountId));
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
          // Transaction Form FX UX delta — only sent for a line that's
          // actually foreign; the server falls back to its own
          // CurrencyRate default otherwise (never needed for a same-Base-
          // Currency line, which is always priced 1/1).
          rateDecimal: isForeignLine(line.accountId) ? line.rateDecimal : undefined,
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
  // Transaction Form FX UX delta — a destination is no longer restricted
  // to From's own currency (any Account can be a valid destination now,
  // foreign or not); the picker offers every Account unconditionally.
  const toAccountOptions = accountOptions;

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
              <button
                type="button"
                onClick={() => append({ accountId: "", amount: 0 })}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                + Split
              </button>
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
              own editable fact now, for every transfer. Defaults to
              mirroring From Amount (effect above) for a same-Base-Currency
              destination only, until the user edits it directly. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transaction-to-amount">To Amount ({toCurrencySymbol})</Label>
            <Input
              id="transaction-to-amount"
              type="number"
              step={10 ** -(toAccount?.currencyScale ?? currencyScale)}
              min="0"
              placeholder="0.00"
              {...register("toLines.0.amount", { valueAsNumber: true })}
            />
          </div>

          {toAccount && firstLineIsForeign && baseCurrency && (
            <ForeignRateBlock
              control={control}
              setValue={setValue}
              watch={watch}
              index={0}
              account={toAccount}
              baseCurrencySymbol={baseCurrency.symbol}
              date={watch("date")}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>To</Label>
          {fields.map((field, index) => {
            const lineAccountId = toLines[index]?.accountId ?? "";
            const lineAccount = accountsById.get(lineAccountId);
            const lineIsForeign = isForeignLine(lineAccountId);
            return (
              <div key={field.id} className="flex flex-col gap-2">
                <div className="flex flex-col gap-2 sm:flex-row">
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
                      step={10 ** -(lineAccount?.currencyScale ?? currencyScale)}
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
                </div>
                {(errors.toLines?.[index]?.accountId?.message ||
                  errors.toLines?.[index]?.amount?.message) && (
                  <p className="text-sm text-destructive">
                    {errors.toLines[index]?.accountId?.message ??
                      errors.toLines[index]?.amount?.message}
                  </p>
                )}
                {lineAccount && lineIsForeign && baseCurrency && (
                  <ForeignRateBlock
                    control={control}
                    setValue={setValue}
                    watch={watch}
                    index={index}
                    account={lineAccount}
                    baseCurrencySymbol={baseCurrency.symbol}
                    date={watch("date")}
                  />
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => append({ accountId: "", amount: 0 })}
            className="self-start text-sm text-muted-foreground hover:text-foreground"
          >
            + Add destination
          </button>

          {/* Raw currency-native amounts aren't summable once any
              destination is foreign (Transaction Form FX UX delta) — the
              Total/Balanced indicator only applies to an all-Base-Currency
              split, same as before this delta for that case. */}
          {!anyLineIsForeign && (
            <div className="flex items-center justify-between text-sm">
              <span>
                Total: {currencySymbol}
                {(totalMinorUnits / 10 ** currencyScale).toFixed(currencyScale)}
              </span>
              <span className={isBalanced ? "text-success" : "text-destructive"}>
                {isBalanced ? "✓ Balanced" : "✗ Not balanced"}
              </span>
            </div>
          )}
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
