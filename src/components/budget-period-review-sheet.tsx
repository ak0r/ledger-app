"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BudgetAllocationInput, BudgetFilterState } from "@/domain";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BudgetFilterBuilder } from "@/components/budget-filter-builder";
import { BudgetAllocationsTable } from "@/components/budget-allocations-table";
import { approveBudgetPeriodAction, previewNextBudgetPeriodAction } from "@/server/actions/budgets";
import type { BudgetPeriodPreview } from "@/server/use-cases/budgets";

// Spec §5/§16's "Review & Create" flow — the *only* place a RECURRING
// Budget's next Period ever gets created (never silently, spec §5). The
// preview is fetched on open rather than passed in as a prop: it has to be
// current as of the moment the user reviews it, not stale from whenever the
// landing page itself last rendered.
export function BudgetPeriodReviewSheet({
  trigger,
  budgetId,
  budgetName,
  expenseAccounts,
  currencySymbol,
  currencyScale,
}: {
  trigger: React.ReactElement;
  budgetId: string;
  budgetName: string;
  expenseAccounts: { id: string; name: string }[];
  currencySymbol: string;
  currencyScale: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger} />
      <SheetContent className="md:max-w-md gap-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Review Next Period — {budgetName}</SheetTitle>
        </SheetHeader>
        {/* Mounted only while open (same posture as RecurringFormSheet/
            RecurringForm) — every fetch/edit state below starts fresh each
            time the sheet opens, no manual reset needed. */}
        {open && (
          <BudgetPeriodReviewContent
            budgetId={budgetId}
            expenseAccounts={expenseAccounts}
            currencySymbol={currencySymbol}
            currencyScale={currencyScale}
            onClose={() => setOpen(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function BudgetPeriodReviewContent({
  budgetId,
  expenseAccounts,
  currencySymbol,
  currencyScale,
  onClose,
}: {
  budgetId: string;
  expenseAccounts: { id: string; name: string }[];
  currencySymbol: string;
  currencyScale: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BudgetPeriodPreview | null>(null);
  const [explicitAccountIds, setExplicitAccountIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<BudgetFilterState>({ match: "ALL", conditions: [] });
  const [allocations, setAllocations] = useState<BudgetAllocationInput[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    previewNextBudgetPeriodAction({ budgetId }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPreview(result.data);
      if (result.data) {
        setExplicitAccountIds(result.data.defaults.scope.explicitAccountIds);
        setFilter(result.data.defaults.scope.filter);
        setAllocations(result.data.defaults.allocations);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [budgetId]);

  const selectedAccounts = expenseAccounts.filter((account) => explicitAccountIds.includes(account.id));

  async function approve() {
    if (!preview) return;
    setSubmitting(true);
    setError(null);
    const result = await approveBudgetPeriodAction({
      budgetId,
      startDate: preview.window.startDate,
      endDate: preview.window.endDate,
      scope: { explicitAccountIds, filter },
      allocations,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!preview) {
    return <p className="text-sm text-muted-foreground">No next Period to review — this Budget&apos;s schedule has ended.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-muted/40 p-2.5 text-sm ring-1 ring-foreground/10">
        <p className="text-muted-foreground">Next Period</p>
        <p className="font-medium">
          {formatDate(preview.window.startDate)} – {formatDate(preview.window.endDate)}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Expense Accounts</Label>
        <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2.5 ring-1 ring-foreground/10">
          {expenseAccounts.map((account) => (
            <label key={account.id} className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={explicitAccountIds.includes(account.id)}
                onCheckedChange={(checked) =>
                  setExplicitAccountIds((prev) => (checked ? [...prev, account.id] : prev.filter((id) => id !== account.id)))
                }
              />
              {account.name}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Filters</Label>
        <BudgetFilterBuilder value={filter} onChange={setFilter} expenseAccounts={expenseAccounts} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Budget Allocations</Label>
        <BudgetAllocationsTable
          accounts={selectedAccounts}
          value={allocations}
          onChange={setAllocations}
          currencySymbol={currencySymbol}
          currencyScale={currencyScale}
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" className="flex-1" disabled={submitting} onClick={approve}>
          {submitting ? "Creating…" : "Create Budget"}
        </Button>
      </div>
    </div>
  );
}
