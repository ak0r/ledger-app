"use client";

import type { RecurringFrequency } from "@/core";
import type { RecurringRuleWithNextDue } from "@/server/services/recurring";
import { formatDate, formatMoney } from "@/lib/utils";
import { WEEKDAY_OPTIONS } from "@/components/recurring-form";
import { RecurringFormSheet } from "@/components/recurring-form-sheet";
import { DeleteRecurringRuleButton } from "@/components/delete-recurring-rule-button";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function ordinalSuffix(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "st";
  if (n % 10 === 2 && n % 100 !== 12) return "nd";
  if (n % 10 === 3 && n % 100 !== 13) return "rd";
  return "th";
}

// "Monthly, 7th" / "Weekly, Monday" / "Daily" / "Yearly" (spec §7's own
// Rules table examples) — Yearly has no day suffix since it anchors on the
// rule's `startDate` month/day directly (domain/recurring.ts), same reason
// RecurringForm shows no Day control for it.
export function formatScheduleLabel(rule: {
  frequency: RecurringFrequency;
  byMonthDay: number | null;
  byWeekday: number | null;
}): string {
  switch (rule.frequency) {
    case "DAILY":
      return "Daily";
    case "WEEKLY":
      return `Weekly, ${WEEKDAY_OPTIONS.find((option) => option.value === rule.byWeekday)?.label ?? ""}`;
    case "MONTHLY":
      return `Monthly, ${rule.byMonthDay}${ordinalSuffix(rule.byMonthDay ?? 0)}`;
    case "YEARLY":
      return "Yearly";
  }
}

export function RecurringRulesTable({
  rules,
  accounts,
  currencySymbol,
  currencyScale,
}: {
  rules: RecurringRuleWithNextDue[];
  accounts: { id: string; name: string; classification: string }[];
  currencySymbol: string;
  currencyScale: number;
}) {
  if (rules.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No recurring rules yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Next Due</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => (
            <TableRow key={rule.id}>
              <TableCell className="py-2.5 font-medium">{rule.name}</TableCell>
              <TableCell className="py-2.5">{rule.nextDue ? formatDate(rule.nextDue) : "Ended"}</TableCell>
              <TableCell className="py-2.5">{formatScheduleLabel(rule)}</TableCell>
              <TableCell className="py-2.5 text-right">
                <span className="whitespace-nowrap font-mono tabular-nums">
                  {formatMoney(rule.amountMinor, currencySymbol, currencyScale)}
                </span>
              </TableCell>
              <TableCell className="py-2.5">
                <div className="flex justify-end gap-1.5">
                  <RecurringFormSheet
                    mode="edit"
                    accounts={accounts}
                    currencySymbol={currencySymbol}
                    currencyScale={currencyScale}
                    recurringRule={rule}
                    trigger={
                      <Button type="button" variant="ghost" size="sm">
                        Edit
                      </Button>
                    }
                  />
                  <DeleteRecurringRuleButton recurringRuleId={rule.id} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
