"use client"

import * as React from "react"
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"

import { cn, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Exported for recurring-calendar.tsx's own month grid (Recurring
// Transactions Phase 1, spec §7) — same calendar-math, not a coincidental
// duplicate: sharing it keeps both grids' day/weekday numbering identical
// by construction instead of by two hand-kept-in-sync implementations.
export const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const
export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

export function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function parseIso(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number)
  return { year, month, day }
}

// UTC-anchored throughout (never local `.getDate()`/`.getDay()`/`new
// Date("YYYY-MM-DD")` parsed-then-read-locally) — same reasoning as
// `formatDate`'s own comment in lib/utils.ts: reading a UTC-midnight Date
// back through local-timezone accessors can roll to the wrong day. Pure
// calendar math, not a real moment in time, so UTC is just a stable
// anchor, not a timezone claim.
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
}

export function todayIso(): string {
  const now = new Date()
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

// Custom calendar grid — no existing Shadcn Calendar/react-day-picker in
// this codebase (checked before building), so this is a small, contained,
// dependency-free component rather than pulling in a new package for one
// field. Replaces the raw native `<input type="date">` in the New
// Transaction sheet (design-audit finding: OS chrome visually clashing
// with an otherwise fully custom Flexoki/Shadcn form) — trigger matches
// Input's own classes exactly, displayed date uses the same "01 Jul 2026"
// format the rest of the app already shows dates in, not native
// mm/dd/yyyy segments.
export function DatePicker({
  id,
  value,
  onChange,
  onBlur,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  disabled,
  className,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  "aria-label"?: string
  "aria-invalid"?: boolean
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = value ? parseIso(value) : null
  const anchor = selected ?? parseIso(todayIso())
  const [viewYear, setViewYear] = React.useState(anchor.year)
  const [viewMonth, setViewMonth] = React.useState(anchor.month)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      const current = value ? parseIso(value) : parseIso(todayIso())
      setViewYear(current.year)
      setViewMonth(current.month)
    } else {
      onBlur?.()
    }
  }

  const goToPreviousMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1)
      setViewMonth(12)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const goToNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1)
      setViewMonth(1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const today = todayIso()
  const total = daysInMonth(viewYear, viewMonth)
  const leadingBlanks = firstWeekdayOfMonth(viewYear, viewMonth)
  const days = Array.from({ length: total }, (_, index) => index + 1)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            id={id}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1 text-left text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
              // `aria-invalid` isn't a valid ARIA prop on role=button
              // (jsx-a11y/role-supports-aria-props) — this is a styled
              // trigger, not a real form control, so the invalid state is
              // just a conditional class instead of the `aria-invalid:`
              // variant Input itself uses.
              ariaInvalid && "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40",
              className,
            )}
          />
        }
      >
        <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className={cn(!value && "text-muted-foreground")}>
          {value ? formatDate(value) : "Select a date"}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="flex items-center justify-between px-1 pb-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Previous month"
            onClick={goToPreviousMonth}
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
          </Button>
          <span className="text-sm font-medium">
            {MONTH_LABELS[viewMonth - 1]} {viewYear}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Next month"
            onClick={goToNextMonth}
          >
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 text-center">
          {WEEKDAY_LABELS.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className="flex size-7 items-center justify-center text-xs text-muted-foreground"
            >
              {label}
            </span>
          ))}
          {Array.from({ length: leadingBlanks }, (_, index) => (
            <span key={`blank-${index}`} aria-hidden="true" />
          ))}
          {days.map((day) => {
            const iso = toIso(viewYear, viewMonth, day)
            const isSelected = value === iso
            const isToday = today === iso
            return (
              <button
                key={iso}
                type="button"
                aria-current={isToday ? "date" : undefined}
                aria-pressed={isSelected}
                onClick={() => {
                  onChange(iso)
                  setOpen(false)
                  onBlur?.()
                }}
                className={cn(
                  "flex size-7 items-center justify-center rounded-lg text-sm tabular-nums transition-colors hover:bg-accent hover:text-accent-foreground",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  isToday && !isSelected && "font-semibold text-ring",
                )}
              >
                {day}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
