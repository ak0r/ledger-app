import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared by the Transactions and Accounts tables (extracted from
// transaction-table.tsx during the Accounts table's own sort/filter/bulk
// parity pass) — genuinely generic UI: it doesn't know about either
// table's own `SortField`/`SortState` shape, just an already-built `href`
// (the caller's own sort module computes the 3-state-cycle URL) plus
// whether *this* column is the active one. Clicking cycles Default →
// Ascending → Descending → Default. The icon stays near-invisible until
// hover/active ("only the active sort should have stronger visual
// emphasis") so unsorted columns don't read as a wall of arrows.
export function SortableColumnHeader({
  label,
  href,
  isActive,
  direction,
  align,
}: {
  label: string;
  // `null` renders plain non-interactive header text — lets a caller
  // degrade safely (e.g. sorting not wired up yet) without a broken link.
  href: string | null;
  isActive: boolean;
  direction?: "asc" | "desc";
  align?: "end";
}) {
  if (!href) return <span>{label}</span>;
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <Link
      href={href}
      aria-label={`Sort by ${label}${
        isActive ? `, currently ${direction === "asc" ? "ascending" : "descending"}` : ""
      }`}
      className={cn(
        "group/sort inline-flex items-center gap-1 rounded-sm hover:text-foreground",
        align === "end" && "w-full flex-row-reverse",
        isActive && "font-semibold",
      )}
    >
      {label}
      <Icon
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/sort:opacity-60",
          isActive && "text-foreground opacity-100",
        )}
        aria-hidden="true"
      />
    </Link>
  );
}
