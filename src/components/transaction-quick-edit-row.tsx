"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Check, X } from "lucide-react";
import { toMinorUnits } from "@/domain";
import { buildTransactionFormSchema } from "@/components/transaction-form";
import { humanizeEnum, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TagInput } from "@/components/tag-input";
import { TableCell, TableRow } from "@/components/ui/table";
import type { TransactionTableRow } from "@/components/transaction-table";
import { editTransactionAction } from "@/server/actions/transactions";

type QuickEditValues = z.infer<ReturnType<typeof buildTransactionFormSchema>>;

// Inline row editor (transactionworkspacedelta.md §5/§19) — replaces a
// normal row's cells in place when `quickEditRowId === row.id`, one real
// `<TableCell>` per column so column widths/alignment stay identical to a
// normal row (no colSpan collapse). Simple-transaction fields only (Date/
// Description/Tags/From/Amount/To) — split rows never reach this component
// (Phase B already disables the trigger for them), so posting-structure
// edits go through Full Edit instead, avoiding partial-field-edit
// ambiguity (doc §9, read conservatively per Phase B's own note).
//
// Enter-submits via a real, hidden `<form>` associated with the Date/
// Description/Amount inputs through the HTML `form=` attribute (not a
// shared row-level keydown handler): that association is per-input and
// bypasses React's event *bubbling* entirely, so it can't be triggered by
// TagInput's own Enter-to-add-tag handling the way a bubbling handler
// would. Select triggers aren't form-associated — Enter on those toggles
// the dropdown, same as everywhere else in the app, not a Quick Edit-
// specific quirk. Escape (row-level, bubbling is fine here) discards the
// draft without saving (doc §19 — persisted data is only touched on Save,
// via the exact same `editTransactionAction` Full Edit uses).
export function TransactionQuickEditRow({
  row,
  profileId,
  accounts,
  currencySymbol,
  currencyScale,
  existingTags,
  onCancel,
}: {
  row: TransactionTableRow;
  profileId: string;
  accounts: { id: string; name: string; classification: string }[];
  currencySymbol: string;
  currencyScale: number;
  existingTags: string[];
  onCancel: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(row.tags ?? []);
  const formId = `quick-edit-${row.id}`;

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<QuickEditValues>({
    resolver: zodResolver(buildTransactionFormSchema(currencyScale)),
    defaultValues: {
      date: row.date,
      description: row.description,
      fromAccountId: row.edit.fromAccountId,
      amount: row.edit.amount,
      toLines: row.edit.toLines,
    },
  });

  const amount = watch("amount");

  const rowRef = useRef<HTMLTableRowElement>(null);
  // Enter (row-level keyboard nav, deltatransactiongridconnectorkeyboard20260818.md
  // §2) swaps this component in without ever touching a focusable element
  // inside it — the row it replaced is gone from the DOM, so the browser's
  // default "focused node removed" behavior drops focus to <body>, and
  // none of this row's own Tab/Escape/Ctrl+Enter handling could ever fire.
  // The existing pencil-icon mouse entry point never had this problem
  // (a click always focuses something). Querying by the Date input's own
  // `aria-label` rather than a merged ref avoids fighting react-hook-form's
  // own `ref` from `register("date")` below.
  useEffect(() => {
    rowRef.current?.querySelector<HTMLInputElement>('input[aria-label="Date"]')?.focus();
  }, []);

  const onSubmit = async (values: QuickEditValues) => {
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

    const result = await editTransactionAction(profileId, {
      profileId,
      date: values.date,
      description: values.description,
      tags: tags.length > 0 ? tags : undefined,
      postings,
      transactionId: row.id,
    });

    if (!result.success) {
      setServerError(result.error);
      return;
    }
    onCancel();
    router.refresh();
  };

  const accountLabel = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account ? `${account.name} — ${humanizeEnum(account.classification)}` : "Select an account";
  };

  const accountOptions = accounts.map((account) => (
    <SelectItem key={account.id} value={account.id}>
      {account.name} — {humanizeEnum(account.classification)}
    </SelectItem>
  ));

  return (
    <TableRow
      ref={rowRef}
      data-state="selected"
      role="row"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }
        // Ctrl/Cmd+Enter saves from anywhere in the row
        // (deltatransactiongridconnectorkeyboard20260818.md §2) — a
        // row-level bubbling handler, unlike the Date/Description/Amount
        // inputs' plain-Enter `form=` association above, so it's reachable
        // from the Select triggers and TagInput too.
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void handleSubmit(onSubmit)();
        }
      }}
    >
      <TableCell role="gridcell" />
      <TableCell role="gridcell">
        <Input
          form={formId}
          type="date"
          aria-label="Date"
          className="h-8 w-32"
          {...register("date")}
        />
        {errors.date && <p className="mt-1 text-xs text-destructive">{errors.date.message}</p>}
      </TableCell>
      <TableCell role="gridcell">
        <Input
          form={formId}
          aria-label="Description"
          className="h-8"
          {...register("description")}
        />
        {errors.description && (
          <p className="mt-1 text-xs text-destructive">{errors.description.message}</p>
        )}
      </TableCell>
      <TableCell role="gridcell" className="min-w-40">
        <TagInput value={tags} onChange={setTags} suggestions={existingTags} />
      </TableCell>
      <TableCell role="gridcell">
        <Controller
          control={control}
          name="fromAccountId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-8 w-40" aria-label="From account">
                <SelectValue placeholder="Select an account">{accountLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>{accountOptions}</SelectContent>
            </Select>
          )}
        />
      </TableCell>
      <TableCell role="gridcell">
        <Input
          form={formId}
          type="number"
          step={10 ** -currencyScale}
          min="0"
          aria-label="Amount"
          className="h-8 w-24"
          {...register("amount", { valueAsNumber: true })}
        />
        {errors.amount && <p className="mt-1 text-xs text-destructive">{errors.amount.message}</p>}
      </TableCell>
      <TableCell role="gridcell" />
      <TableCell role="gridcell">
        <Controller
          control={control}
          name="toLines.0.accountId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-8 w-40" aria-label="To account">
                <SelectValue placeholder="Select an account">{accountLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>{accountOptions}</SelectContent>
            </Select>
          )}
        />
      </TableCell>
      <TableCell role="gridcell" className="whitespace-nowrap font-mono text-sm tabular-nums text-muted-foreground">
        {formatMoney(toMinorUnits(amount || 0, currencyScale), currencySymbol, currencyScale)}
      </TableCell>
      <TableCell role="gridcell">
        <form id={formId} onSubmit={handleSubmit(onSubmit)} className="sr-only" aria-hidden="true" />
        {serverError && <p className="mb-1 text-xs text-destructive">{serverError}</p>}
        <div className="flex justify-end gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel edit" onClick={onCancel}>
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent>Cancel</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="submit"
                  form={formId}
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Save"
                  disabled={isSubmitting}
                >
                  <Check className="size-3.5" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent>Save</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}
