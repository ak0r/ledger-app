"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/nav-items";

// Mobile persistent bottom nav (docs/design/design.md §4.2) — not a
// squeezed copy of the desktop sidebar, a dedicated mobile-first surface.
// Same NAV_ITEMS as SidebarNav, only shown below md.
export function BottomNav({ profileId }: { profileId: string }) {
  const pathname = usePathname();
  const base = `/p/${profileId}`;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname, base);
        return (
          <Link
            key={item.key}
            href={item.href(base)}
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
