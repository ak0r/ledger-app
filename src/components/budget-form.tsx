"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BUDGET_RECURRENCE_UNITS, EMPTY_BUDGET_FILTER_STATE, type BudgetAllocationInput, type BudgetFilterState, type BudgetRecurrenceUnit, type BudgetType } from "@/core";
import { humanizeEnum } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BudgetFilterBuilder } from "@/components/budget-filter-builder";
import { BudgetAllocationsTable } from "@/components/budget-allocations-table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createBudgetAction, editBudgetAction } from "@/server/actions/budgets";

// One shared form for Create and Edit (same posture as RecurringForm, spec
// AGENTS.md rule 27's "one shared form" precedent carried over to Budgets).
// Editing an active Budget's scope/allocations updates its current Period
// in place server-side (use-cases/budgets.ts's documented interpretation of
// spec §10) — this form itself has no separate "review before applying"
// step; that warning-gate confirmation is the caller's job (a ConfirmDialog
// wrapping submit, Phase D), not baked into the form.
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const budgetFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    type: z.enum(["ONE_TIME", "RECURRING"]),
    recurrenceUnit: z.enum(BUDGET_RECURRENCE_UNITS),
    recurrenceInterval: z.number().int().min(1),
    recurrenceStartDate: z.string().min(1),
    endMode: z.enum(["never", "on-date", "after-occurrences"]),
    recurrenceEndDate: z.string().optional(),
    recurrenceOccurrences: z.number().int().min(1).optional(),
    explicitAccountIds: z.array(z.string()),
    filter: z.custom<BudgetFilterState>(),
    allocations: z.custom<BudgetAllocationInput[]>(),
  })
  .refine((v) => (v.type === "RECURRING" ? v.recurrenceStartDate.length > 0 : true), {
    message: "Start date is required",
    path: ["recurrenceStartDate"],
  })
  .refine((v) => (v.endMode === "on-date" ? !!v.recurrenceEndDate : true), { message: "End date is required", path: ["recurrenceEndDate"] })
  .refine((v) => (v.endMode === "after-occurrences" ? v.recurrenceOccurrences != null : true), {
    message: "Number of occurrences is required",
    path: ["recurrenceOccurrences"],
  });

type BudgetFormValues = z.infer<typeof budgetFormSchema>;

interface BudgetSubmitPayload {
  name: string;
  type: BudgetType;
  recurrence?: {
    unit: BudgetRecurrenceUnit;
    interval: number;
    startDate: string;
    endDate?: string;
    occurrences?: number;
  };
  scope: { explicitAccountIds: string[]; filter: BudgetFilterState };
  allocations: BudgetAllocationInput[];
}

export interface BudgetFormExpenseAccount {
  id: string;
  name: string;
}

export interface BudgetFormExistingBudget {
  id: string;
  name: string;
  type: BudgetType;
  recurrenceUnit: BudgetRecurrenceUnit | null;
  recurrenceInterval: number | null;
  recurrenceStartDate: string | null;
  recurrenceEndDate: string | null;
  recurrenceOccurrences: number | null;
  explicitAccountIds: string[] | null;
  filterMatch: BudgetFilterState["match"] | null;
  filterConditions: BudgetFilterState["conditions"] | null;
  allocations: BudgetAllocationInput[];
}

export function BudgetForm({
  expenseAccounts,
  currencySymbol,
  currencyScale,
  mode = "create",
  cancelHref,
  onCancel,
  onSuccess,
  onDirtyChange,
  budget,
}: {
  expenseAccounts: BudgetFormExpenseAccount[];
  currencySymbol: string;
  currencyScale: number;
  mode?: "create" | "edit";
  cancelHref?: string;
  onCancel?: () => void;
  onSuccess?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  budget?: BudgetFormExistingBudget;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingPayload, setPendingPayload] = useState<BudgetSubmitPayload | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: budget
      ? {
          name: budget.name,
          type: budget.type,
          recurrenceUnit: budget.recurrenceUnit ?? "MONTH",
          recurrenceInterval: budget.recurrenceInterval ?? 1,
          recurrenceStartDate: budget.recurrenceStartDate ?? todayIso(),
          endMode: budget.recurrenceOccurrences != null ? "after-occurrences" : budget.recurrenceEndDate ? "on-date" : "never",
          recurrenceEndDate: budget.recurrenceEndDate ?? undefined,
          recurrenceOccurrences: budget.recurrenceOccurrences ?? undefined,
          explicitAccountIds: budget.explicitAccountIds ?? [],
          filter: budget.filterMatch ? { match: budget.filterMatch, conditions: budget.filterConditions ?? [] } : EMPTY_BUDGET_FILTER_STATE,
          allocations: budget.allocations,
        }
      : {
          name: "",
          type: "ONE_TIME",
          recurrenceUnit: "MONTH",
          recurrenceInterval: 1,
          recurrenceStartDate: todayIso(),
          endMode: "never",
          recurrenceEndDate: undefined,
          recurrenceOccurrences: undefined,
          explicitAccountIds: [],
          filter: EMPTY_BUDGET_FILTER_STATE,
          allocations: [],
        },
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const type = watch("type");
  const endMode = watch("endMode");
  const explicitAccountIds = watch("explicitAccountIds");

  const selectedAccounts = expenseAccounts.filter((account) => explicitAccountIds.includes(account.id));

  // Actually calls the Server Action and handles navigation on success —
  // separated from onSubmit below so the edit path can interpose a
  // confirmation (spec §8.3/§10's scope-change warning) between "form is
  // valid" and "change is applied," while create needs no such gate (there
  // is nothing to warn about yet on a brand-new Budget).
  async function submitPayload(payload: BudgetSubmitPayload): Promise<{ success: boolean; error?: string }> {
    setServerError(null);
    const result = mode === "create" ? await createBudgetAction(payload) : await editBudgetAction({ ...payload, budgetId: budget!.id });

    if (!result.success) {
      setServerError(result.error);
      return result;
    }
    if (onSuccess) {
      onSuccess();
    } else {
      router.push(cancelHref ?? "/budgets");
    }
    router.refresh();
    return result;
  }

  const onSubmit = async (values: BudgetFormValues) => {
    const payload: BudgetSubmitPayload = {
      name: values.name,
      type: values.type,
      recurrence:
        values.type === "RECURRING"
          ? {
              unit: values.recurrenceUnit,
              interval: values.recurrenceInterval,
              startDate: values.recurrenceStartDate,
              endDate: values.endMode === "on-date" ? values.recurrenceEndDate : undefined,
              occurrences: values.endMode === "after-occurrences" ? values.recurrenceOccurrences : undefined,
            }
          : undefined,
      scope: { explicitAccountIds: values.explicitAccountIds, filter: values.filter },
      allocations: values.allocations,
    };

    if (mode === "edit") {
      setPendingPayload(payload);
      return;
    }
    await submitPayload(payload);
  };

  return (
    <>
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="budget-name">Budget Name</Label>
        <Input id="budget-name" placeholder="e.g. Japan 2026" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Budget Type</Label>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue>{(value: string) => (value === "ONE_TIME" ? "One-time" : "Recurring")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ONE_TIME">One-time</SelectItem>
                <SelectItem value="RECURRING">Recurring</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {type === "RECURRING" && (
        <>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="budget-interval">Every</Label>
              <Input id="budget-interval" type="number" min="1" step="1" className="w-20" {...register("recurrenceInterval", { valueAsNumber: true })} />
            </div>
            <Controller
              control={control}
              name="recurrenceUnit"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="flex-1">
                    <SelectValue>{(value: string) => humanizeEnum(value)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {BUDGET_RECURRENCE_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {humanizeEnum(unit)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          {errors.recurrenceInterval && <p className="text-sm text-destructive">{errors.recurrenceInterval.message}</p>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-start">Starts</Label>
            <Controller
              control={control}
              name="recurrenceStartDate"
              render={({ field }) => <DatePicker id="budget-start" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
            />
            {errors.recurrenceStartDate && <p className="text-sm text-destructive">{errors.recurrenceStartDate.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-end">Ends</Label>
            <Controller
              control={control}
              name="endMode"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="budget-end">
                    <SelectValue>{(value: string) => (value === "never" ? "Never" : value === "on-date" ? "On date" : "After a number of occurrences")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Never</SelectItem>
                    <SelectItem value="on-date">On date</SelectItem>
                    <SelectItem value="after-occurrences">After a number of occurrences</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {endMode === "on-date" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="budget-end-date">End date</Label>
              <Controller
                control={control}
                name="recurrenceEndDate"
                render={({ field }) => <DatePicker id="budget-end-date" value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} />}
              />
              {errors.recurrenceEndDate && <p className="text-sm text-destructive">{errors.recurrenceEndDate.message}</p>}
            </div>
          )}

          {endMode === "after-occurrences" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="budget-occurrences">Occurrences</Label>
              <Input id="budget-occurrences" type="number" min="1" step="1" {...register("recurrenceOccurrences", { valueAsNumber: true })} />
              {errors.recurrenceOccurrences && <p className="text-sm text-destructive">{errors.recurrenceOccurrences.message}</p>}
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Expense Accounts</Label>
        <Controller
          control={control}
          name="explicitAccountIds"
          render={({ field }) => (
            <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2.5 ring-1 ring-foreground/10">
              {expenseAccounts.length === 0 && <p className="text-sm text-muted-foreground">No Expense Accounts yet.</p>}
              {expenseAccounts.map((account) => (
                <label key={account.id} className="flex items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={field.value.includes(account.id)}
                    onCheckedChange={(checked) =>
                      field.onChange(checked ? [...field.value, account.id] : field.value.filter((id) => id !== account.id))
                    }
                  />
                  {account.name}
                </label>
              ))}
            </div>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Filters</Label>
        <Controller
          control={control}
          name="filter"
          render={({ field }) => <BudgetFilterBuilder value={field.value} onChange={field.onChange} expenseAccounts={expenseAccounts} />}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Budget Allocations</Label>
        <Controller
          control={control}
          name="allocations"
          render={({ field }) => (
            <BudgetAllocationsTable accounts={selectedAccounts} value={field.value} onChange={field.onChange} currencySymbol={currencySymbol} currencyScale={currencyScale} />
          )}
        />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Link href={cancelHref ?? "/budgets"} className={buttonVariants({ variant: "outline" })}>
            Cancel
          </Link>
        )}
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Saving…" : mode === "create" ? "Create Budget" : "Save"}
        </Button>
      </div>
    </form>
    <ConfirmDialog
      open={pendingPayload !== null}
      onOpenChange={(next) => {
        if (!next) setPendingPayload(null);
      }}
      title="Update this budget?"
      description="Changing this Budget can change which transactions are included, current actual spending, derived Expense Accounts, and Budget Allocations. Actual spending is recalculated from Ledger data."
      confirmLabel="Update Budget"
      onConfirm={() => submitPayload(pendingPayload!)}
    />
    </>
  );
}
