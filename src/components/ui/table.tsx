"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({
  className,
  containerClassName,
  footer,
  ...props
}: React.ComponentProps<"table"> & {
  // Extends (not replaces) the container div's own `overflow-x-auto` —
  // callers that also need vertical bounding/stickiness (e.g. a sticky
  // table header) must apply it *here*, not on a div they wrap around
  // `<Table>` themselves. A second `overflow-x-auto` ancestor between that
  // outer wrapper and `<thead>` would force `overflow-y` to compute as
  // `auto` there too (CSS Overflow §3), making *that* nearer div — not the
  // caller's own wrapper — the sticky positioning reference, silently
  // breaking it. One real scroll container, not two nested ones.
  containerClassName?: string
  // Rendered inside the same container div, after `<table>` — for content
  // that needs to be a sticky sibling of `<thead>` within that one real
  // scroll container (e.g. a `sticky bottom-0` pagination footer), for the
  // same reason as `containerClassName` above.
  footer?: React.ReactNode
}) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
      {footer}
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

// No blanket `whitespace-nowrap` here (product-polish delta plan #5) — it
// used to clip long Account names in a split transaction's stacked "To"
// lines. Apply nowrap per-cell (Date, Amount columns) via `className`
// instead; text that should wrap (Account names, Description) now does.
function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
