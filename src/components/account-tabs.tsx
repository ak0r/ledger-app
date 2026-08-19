"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Route-based tabs (Transactions | Insights | Settings — renamed from
// History: "Transactions tell you what happened, Insights tell you what it
// means"), same pattern as
// TrackTabs one level up — not a client-state Tabs primitive, because the
// Transactions tab needs its own query-param-driven pagination/filters
// (?page=/?pageSize=/?q=), which a single-URL tab-state approach would
// collide with. Real, shareable, bookmarkable URLs per tab instead.
export function AccountTabs({ baseHref }: { baseHref: string }) {
  const pathname = usePathname();
  const tabs = [
    { label: "Transactions", href: baseHref, exact: true },
    { label: "Insights", href: `${baseHref}/insights`, exact: false },
    { label: "Settings", href: `${baseHref}/settings`, exact: false },
  ];

  return (
    <nav aria-label="Account" className="flex gap-4 border-b border-border text-sm">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 pb-2 -mb-px",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
