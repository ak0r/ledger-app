"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { RECURRING_FREQUENCIES, fromMinorUnits, toMinorUnits, type RecurringFrequency } from "@/core";
import { humanizeEnum } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createRecurringRuleAction, editRecurringRuleAction } from "@/server/actions/recurring";

// One shared form for both entry points (spec §14) — "Recurring → Add New"
// renders it with no `prefill`/`recurringRule` (empty state), "Make
// recurring" on a transaction row renders it with `prefill` seeded from
// that transaction (§3), and editing an existing rule renders it with
// `recurringRule`. Same schema, same submit path for all three.
//
// Interval is fixed to 1 — every mockup in the spec (§6) only ever shows
// "Every month"/"Every week", never an "every N" stepper; the domain/schema
// layer already supports arbitrary `interval` (docs/completed/2026-08-27-
// Recurring-Transactions.md's own model), so a UI control can be added
// later without a data-model change. YEARLY has no Day control — it
// anchors on `startDate`'s own month/day (domain/recurring.ts), matching
// the spec's mockups, which never show one for Yearly either.
export const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isoDayOfMonth(iso: string): number {
  return Number(iso.split("-")[2]);
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Client-local schema — shape-only, for fast UX feedback. The real
// enforcement point is createRecurringRuleSchema/editRecurringRuleSchema in
// src/server/actions/schemas.ts, run again inside the Server Action (rule
// #17). `endMode` is a UI-only concept (Never vs On date, spec §6) that
// collapses to `endDate: undefined` on submit — never persisted as-is.
const recurringFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    fromAccountId: z.string().min(1, "From account is required"),
    toAccountId: z.string().min(1, "To account is required"),
    amount: z.number().positive("Amount must be greater than zero"),
    description: z.string().trim().min(1, "Description is required"),
    frequency: z.enum(RECURRING_FREQUENCIES),
    byMonthDay: z.number().int().min(1).max(31).optional(),
    byWeekday: z.number().int().min(0).max(6).optional(),
    startDate: z.string().min(1, "Start date is required"),
    endMode: z.enum(["never", "on-date"]),
    endDate: z.string().optional(),
  })
  .refine((values) => values.fromAccountId !== values.toAccountId, {
    message: "From and To must be different accounts",
    path: ["toAccountId"],
  })
  .refine(
    (values) => (values.frequency === "MONTHLY" || values.frequency === "YEARLY" ? values.byMonthDay != null : true),
    { message: "Day of month is required", path: ["byMonthDay"] },
  )
  .refine((values) => (values.frequency === "WEEKLY" ? values.byWeekday != null : true), {
    message: "Day of week is required",
    path: ["byWeekday"],
  })
  .refine((values) => (values.endMode === "on-date" ? !!values.endDate : true), {
    message: "End date is required",
    path: ["endDate"],
  });

type RecurringFormValues = z.infer<typeof recurringFormSchema>;

interface RecurringFormProps {
  accounts: { id: string; name: string; classification: string }[];
  currencySymbol: string;
  currencyScale: number;
  mode?: "create" | "edit";
  cancelHref?: string;
  onCancel?: () => void;
  onSuccess?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  // "Make recurring" prefill (spec §3) — seeds the empty form from an
  // existing transaction without modifying it (§10: the two objects stay
  // independent after creation).
  prefill?: {
    name?: string;
    fromAccountId?: string;
    toAccountId?: string;
    amountMinor?: number;
    description?: string;
    startDate?: string;
  };
  recurringRule?: {
    id: string;
    name: string;
    fromAccountId: string;
    toAccountId: string;
    amountMinor: number;
    description: string;
    frequency: RecurringFrequency;
    byMonthDay: number | null;
    byWeekday: number | null;
    startDate: string;
    endDate: string | null;
  };
}

export function RecurringForm({
  accounts,
  currencySymbol,
  currencyScale,
  mode = "create",
  cancelHref,
  onCancel,
  onSuccess,
  onDirtyChange,
  prefill,
  recurringRule,
}: RecurringFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const defaultStartDate = recurringRule?.startDate ?? prefill?.startDate ?? todayIso();

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema),
    defaultValues: recurringRule
      ? {
          name: recurringRule.name,
          fromAccountId: recurringRule.fromAccountId,
          toAccountId: recurringRule.toAccountId,
          amount: fromMinorUnits(recurringRule.amountMinor, currencyScale),
          description: recurringRule.description,
          frequency: recurringRule.frequency,
          byMonthDay: recurringRule.byMonthDay ?? isoDayOfMonth(defaultStartDate),
          byWeekday: recurringRule.byWeekday ?? isoWeekday(defaultStartDate),
          startDate: recurringRule.startDate,
          endMode: recurringRule.endDate ? "on-date" : "never",
          endDate: recurringRule.endDate ?? undefined,
        }
      : {
          name: prefill?.name ?? "",
          fromAccountId: prefill?.fromAccountId ?? "",
          toAccountId: prefill?.toAccountId ?? "",
          amount: prefill?.amountMinor != null ? fromMinorUnits(prefill.amountMinor, currencyScale) : Number.NaN,
          description: prefill?.description ?? "",
          frequency: "MONTHLY",
          byMonthDay: isoDayOfMonth(defaultStartDate),
          byWeekday: isoWeekday(defaultStartDate),
          startDate: defaultStartDate,
          endMode: "never",
          endDate: undefined,
        },
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const frequency = watch("frequency");
  const endMode = watch("endMode");

  const onSubmit = async (values: RecurringFormValues) => {
    setServerError(null);
    const payload = {
      name: values.name,
      fromAccountId: values.fromAccountId,
      toAccountId: values.toAccountId,
      amountMinor: toMinorUnits(values.amount, currencyScale),
      description: values.description,
      schedule: {
        frequency: values.frequency,
        interval: 1,
        byMonthDay: values.frequency === "MONTHLY" || values.frequency === "YEARLY" ? values.byMonthDay : undefined,
        byWeekday: values.frequency === "WEEKLY" ? values.byWeekday : undefined,
        startDate: values.startDate,
        endDate: values.endMode === "on-date" ? values.endDate : undefined,
      },
    };

    const result =
      mode === "create"
        ? await createRecurringRuleAction(payload)
        : await editRecurringRuleAction({ ...payload, recurringRuleId: recurringRule!.id });

    if (!result.success) {
      setServerError(result.error);
      return;
    }
    if (onSuccess) {
      onSuccess();
    } else {
      router.push(cancelHref ?? "/recurring");
    }
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-name">Name</Label>
        <Input id="recurring-name" placeholder="e.g. Home Loan Interest" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-from">From Account</Label>
        <Controller
          control={control}
          name="fromAccountId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="recurring-from">
                <SelectValue placeholder="Select an account">{accountLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>{accountOptions}</SelectContent>
            </Select>
          )}
        />
        {errors.fromAccountId && <p className="text-sm text-destructive">{errors.fromAccountId.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-to">To Account</Label>
        <Controller
          control={control}
          name="toAccountId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="recurring-to">
                <SelectValue placeholder="Select an account">{accountLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>{accountOptions}</SelectContent>
            </Select>
          )}
        />
        {errors.toAccountId && <p className="text-sm text-destructive">{errors.toAccountId.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-amount">Amount ({currencySymbol})</Label>
        <Input
          id="recurring-amount"
          type="number"
          step={10 ** -currencyScale}
          min="0"
          placeholder="0.00"
          {...register("amount", { valueAsNumber: true })}
        />
        {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-description">Description</Label>
        <Input id="recurring-description" placeholder="e.g. Home Loan Interest" {...register("description")} />
        {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-start">Start</Label>
        <Controller
          control={control}
          name="startDate"
          render={({ field }) => (
            <DatePicker id="recurring-start" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
          )}
        />
        {errors.startDate && <p className="text-sm text-destructive">{errors.startDate.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-repeat">Repeat</Label>
        <Controller
          control={control}
          name="frequency"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="recurring-repeat">
                <SelectValue>{(value: string) => `Every ${humanizeEnum(value).toLowerCase()}`}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RECURRING_FREQUENCIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    Every {humanizeEnum(value).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {frequency === "MONTHLY" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recurring-month-day">Day</Label>
          <Input
            id="recurring-month-day"
            type="number"
            min="1"
            max="31"
            step="1"
            {...register("byMonthDay", { valueAsNumber: true })}
          />
          {errors.byMonthDay && <p className="text-sm text-destructive">{errors.byMonthDay.message}</p>}
        </div>
      )}

      {frequency === "WEEKLY" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recurring-weekday">Day</Label>
          <Controller
            control={control}
            name="byWeekday"
            render={({ field }) => (
              <Select
                value={field.value != null ? String(field.value) : undefined}
                onValueChange={(value) => field.onChange(Number(value))}
              >
                <SelectTrigger id="recurring-weekday">
                  <SelectValue placeholder="Select a day">
                    {(value: string) => WEEKDAY_OPTIONS.find((option) => String(option.value) === value)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.byWeekday && <p className="text-sm text-destructive">{errors.byWeekday.message}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-end">End</Label>
        <Controller
          control={control}
          name="endMode"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="recurring-end">
                <SelectValue>{(value: string) => (value === "never" ? "Never" : "On date")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="on-date">On date</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {endMode === "on-date" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recurring-end-date">End date</Label>
          <Controller
            control={control}
            name="endDate"
            render={({ field }) => (
              <DatePicker
                id="recurring-end-date"
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          {errors.endDate && <p className="text-sm text-destructive">{errors.endDate.message}</p>}
        </div>
      )}

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Link href={cancelHref ?? "/recurring"} className={buttonVariants({ variant: "outline" })}>
            Cancel
          </Link>
        )}
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Saving…" : mode === "create" ? "Create" : "Save"}
        </Button>
      </div>
    </form>
  );
}
