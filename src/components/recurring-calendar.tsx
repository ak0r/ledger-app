"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { occurrencesInRange, type RecurringSchedule } from "@/core";
import { cn, formatMoney } from "@/lib/utils";
import {
  MONTH_LABELS,
  WEEKDAY_LABELS,
  daysInMonth,
  firstWeekdayOfMonth,
  parseIso,
  toIso,
  todayIso,
} from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";

interface CalendarRule {
  id: string;
  name: string;
  amountMinor: number;
  frequency: RecurringSchedule["frequency"];
  interval: number;
  byMonthDay: number | null;
  byWeekday: number | null;
  startDate: string;
  endDate: string | null;
}

// A view over the same recurring rules the Rules tab shows (spec §7: "The
// calendar is a view of recurring rules, not a separate source of truth")
// — occurrences are derived per visible month via domain/recurring.ts's
// `occurrencesInRange`, never persisted. Same UTC-anchored month-grid math
// as ui/date-picker.tsx, reused rather than reimplemented.
export function RecurringCalendar({
  rules,
  currencySymbol,
  currencyScale,
}: {
  rules: CalendarRule[];
  currencySymbol: string;
  currencyScale: number;
}) {
  const today = parseIso(todayIso());
  const [viewYear, setViewYear] = useState(today.year);
  const [viewMonth, setViewMonth] = useState(today.month);

  const goToPreviousMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const total = daysInMonth(viewYear, viewMonth);
  const leadingBlanks = firstWeekdayOfMonth(viewYear, viewMonth);
  const monthStart = toIso(viewYear, viewMonth, 1);
  const monthEnd = toIso(viewYear, viewMonth, total);

  const occurrencesByDay = new Map<string, { ruleId: string; name: string; amountMinor: number }[]>();
  for (const rule of rules) {
    const schedule: RecurringSchedule = {
      frequency: rule.frequency,
      interval: rule.interval,
      byMonthDay: rule.byMonthDay,
      byWeekday: rule.byWeekday,
      startDate: rule.startDate,
      endDate: rule.endDate,
    };
    for (const occurrence of occurrencesInRange(schedule, monthStart, monthEnd)) {
      const existing = occurrencesByDay.get(occurrence) ?? [];
      existing.push({ ruleId: rule.id, name: rule.name, amountMinor: rule.amountMinor });
      occurrencesByDay.set(occurrence, existing);
    }
  }

  const days = Array.from({ length: total }, (_, index) => index + 1);
  const todayIsoValue = todayIso();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous month" onClick={goToPreviousMonth}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <span className="text-sm font-medium">
          {MONTH_LABELS[viewMonth - 1]} {viewYear}
        </span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Next month" onClick={goToNextMonth}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-sm">
        {WEEKDAY_LABELS.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="bg-muted px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <div key={`blank-${index}`} className="min-h-24 bg-background" aria-hidden="true" />
        ))}
        {days.map((day) => {
          const iso = toIso(viewYear, viewMonth, day);
          const occurrences = occurrencesByDay.get(iso) ?? [];
          const isToday = iso === todayIsoValue;
          return (
            <div key={iso} className="flex min-h-24 flex-col gap-1 bg-background p-1.5">
              <span
                className={cn(
                  "self-start text-xs tabular-nums text-muted-foreground",
                  isToday && "flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground",
                )}
              >
                {day}
              </span>
              {occurrences.map((occurrence, index) => (
                <div
                  key={`${occurrence.ruleId}-${index}`}
                  className="truncate rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground"
                  title={`${occurrence.name} — ${formatMoney(occurrence.amountMinor, currencySymbol, currencyScale)}`}
                >
                  <div className="truncate font-medium">{occurrence.name}</div>
                  <div className="truncate tabular-nums">
                    {formatMoney(occurrence.amountMinor, currencySymbol, currencyScale)}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
