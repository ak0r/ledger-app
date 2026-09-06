"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavItemActive } from "@/components/nav-items";

// Mobile persistent bottom nav (docs/design/design.md §4.2) — not a
// squeezed copy of the desktop sidebar, a dedicated mobile-first surface.
// A curated 5-item subset of NAV_ITEMS (`mobilePrimary`), not a 1:1 mirror
// anymore (Portfolio UI pass, 2026-09-05) — SidebarNav's full ~13-item
// grouped list doesn't fit a bottom tab bar. Deeper Ledger/Portfolio
// destinations are reached by drilling in from Home/Portfolio Overview.
export function BottomNav({ isPrimary }: { isPrimary: boolean }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.mobilePrimary && (!item.primaryOnly || isPrimary));

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        const active = isNavItemActive(pathname, item, items);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
