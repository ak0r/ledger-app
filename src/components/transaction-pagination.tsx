"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Compact pagination footer (product cleanup pass, item #8) — replaces the
// old two-button page-size row + full-word Previous/Next with a page-size
// dropdown and icon-only first/prev/next/last buttons. `pageSizeHrefs` and
// `first`/`prev`/`next`/`last` are pre-built href *strings* (computed
// server-side by each page's own existing `pageHref` closure, same one the
// old footer already used) rather than a function prop, since a function
// can't cross the server → client component boundary — only the page-size
// `<Select>` actually needs client JS (its `onValueChange` has no native
// href-based equivalent); every arrow button is a plain link.
export function TransactionPaginationControls({
  pageSize,
  pageSizeHrefs,
  page,
  totalPages,
  first,
  prev,
  next,
  last,
}: {
  pageSize: number;
  pageSizeHrefs: Record<number, string>;
  page: number;
  totalPages: number;
  first: string;
  prev: string | null;
  next: string | null;
  last: string;
}) {
  const router = useRouter();
  const pageSizeOptions = Object.keys(pageSizeHrefs).map(Number);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-2 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>Rows per page</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => router.push(pageSizeHrefs[Number(value)])}
          items={pageSizeOptions.map((size) => ({ label: String(size), value: String(size) }))}
        >
          <SelectTrigger aria-label="Rows per page" className="h-7 w-16 px-2 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-2 text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <PagerButton href={page > 1 ? first : null} label="First page" icon={ChevronsLeft} />
        <PagerButton href={prev} label="Previous page" icon={ChevronLeft} />
        <PagerButton href={next} label="Next page" icon={ChevronRight} />
        <PagerButton href={page < totalPages ? last : null} label="Last page" icon={ChevronsRight} />
      </div>
    </div>
  );
}

function PagerButton({
  href,
  label,
  icon: Icon,
}: {
  href: string | null;
  label: string;
  icon: typeof ChevronLeft;
}) {
  if (!href) {
    return (
      <Button variant="outline" size="icon-sm" disabled aria-label={label}>
        <Icon aria-hidden="true" />
      </Button>
    );
  }
  return (
    <Link href={href} className={buttonVariants({ variant: "outline", size: "icon-sm" })} aria-label={label}>
      <Icon aria-hidden="true" />
    </Link>
  );
}
