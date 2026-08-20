"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toMinorUnits } from "@/domain";
import { humanizeEnum } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/tag-input";
import { createTransactionAction, editTransactionAction } from "@/server/actions/transactions";

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
// (rule #17). The balance check compares integer minor units (not raw
// decimals) to avoid floating-point false negatives.
export function buildTransactionFormSchema(currencyScale: number) {
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
    })
    .refine(
      (values) => values.toLines.every((line) => line.accountId !== values.fromAccountId),
      { message: "From and To must be different accounts", path: ["toLines"] },
    )
    .refine(
      (values) => {
        const total = values.toLines.reduce(
          (sum, line) => sum + toMinorUnits(line.amount, currencyScale),
          0,
        );
        return total === toMinorUnits(values.amount, currencyScale);
      },
      { message: "Split amounts must add up to the total Amount", path: ["toLines"] },
    );
}

type TransactionFormValues = z.infer<ReturnType<typeof buildTransactionFormSchema>>;

interface TransactionFormProps {
  familyId: string;
  memberId: string;
  accounts: { id: string; name: string; classification: string }[];
  currencySymbol: string;
  currencyScale: number;
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
  familyId,
  memberId,
  accounts,
  currencySymbol,
  currencyScale,
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
  const schema = useMemo(() => buildTransactionFormSchema(currencyScale), [currencyScale]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty: fieldsAreDirty },
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
        }
      : {
          date: "",
          description: "",
          fromAccountId: defaultFromAccountId ?? "",
          amount: Number.NaN,
          toLines: [{ accountId: "", amount: 0 }],
        },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "toLines" });

  const amount = watch("amount");
  const toLines = watch("toLines");
  const isSplit = fields.length > 1;

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

  // Simple mode: the single destination line always mirrors the top-level
  // Amount field, so there's nothing extra for the user to keep in sync.
  // `amount` is `NaN` (not `undefined`) on a blank create-mode mount — the
  // Amount input's empty string runs through `valueAsNumber` before ever
  // being typed into — so this must guard against NaN too, or it fires a
  // spurious `setValue` on mount that marks the untouched form dirty
  // (surfaced by the unsaved-changes guard's `isDirty`, edit-visual-
  // behaviour delta §12).
  useEffect(() => {
    if (!isSplit && amount !== undefined && !Number.isNaN(amount)) {
      setValue("toLines.0.amount", amount, { shouldValidate: false });
    }
  }, [isSplit, amount, setValue]);

  const totalMinorUnits = (toLines ?? []).reduce(
    (sum, line) => sum + toMinorUnits(line.amount || 0, currencyScale),
    0,
  );
  const amountMinorUnits = toMinorUnits(amount || 0, currencyScale);
  const isBalanced = totalMinorUnits === amountMinorUnits;

  const onSubmit = async (values: TransactionFormValues) => {
    setServerError(null);
    const fromAmountMinorUnits = toMinorUnits(values.amount, currencyScale);
    const postings = [
      { accountId: values.fromAccountId, debit: 0, credit: fromAmountMinorUnits },
      ...values.toLines.map((line) => ({
        accountId: line.accountId,
        debit: toMinorUnits(line.amount, currencyScale),
        credit: 0,
      })),
    ];

    const payload = {
      memberId,
      date: values.date,
      description: values.description,
      tags: tags.length > 0 ? tags : undefined,
      postings,
    };

    const result =
      mode === "create"
        ? await createTransactionAction(familyId, payload)
        : await editTransactionAction(familyId, { ...payload, transactionId: transaction!.id });

    if (!result.success) {
      setServerError(result.error);
      return;
    }
    if (onSuccess) {
      onSuccess();
    } else {
      router.push(cancelHref ?? `/f/${familyId}/m/${memberId}/transactions`);
    }
    router.refresh();
  };

  const accountLabel = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account ? `${account.name} — ${humanizeEnum(account.classification)}` : "Select an account";
  };

  const accountOptions = (
    <>
      {accounts.map((account) => (
        <SelectItem key={account.id} value={account.id}>
          {account.name} — {humanizeEnum(account.classification)}
        </SelectItem>
      ))}
    </>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transaction-date">Date</Label>
        <Input id="transaction-date" type="date" {...register("date")} />
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
        <Label htmlFor="transaction-amount">Amount ({currencySymbol})</Label>
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
                <SelectContent>{accountOptions}</SelectContent>
              </Select>
            )}
          />
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
                    <SelectContent>{accountOptions}</SelectContent>
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
            href={cancelHref ?? `/f/${familyId}/m/${memberId}/transactions`}
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
