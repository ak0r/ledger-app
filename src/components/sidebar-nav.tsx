"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/nav-items";

// Desktop collapsible sidebar (docs/design/design.md §4.1): grouped
// sections, visible text labels, collapses to icon-only while preserving
// nav order. Hidden below md — BottomNav takes over there (§4.2), same
// NAV_ITEMS data, different presentation (§20).
export function SidebarNav({ familyId, memberId }: { familyId: string; memberId: string }) {
  const pathname = usePathname();
  const base = `/f/${familyId}/m/${memberId}`;
  const [collapsed, setCollapsed] = useState(false);

  const home = NAV_ITEMS.filter((item) => item.key === "home");
  const track = NAV_ITEMS.filter((item) => item.key !== "home");

  const renderGroup = (label: string, items: typeof NAV_ITEMS) => (
    <div className="flex flex-col gap-0.5">
      {!collapsed && (
        <span className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground">
          {label}
        </span>
      )}
      {items.map((item) => {
        const active = item.isActive(pathname, base);
        return (
          <Link
            key={item.key}
            href={item.href(base)}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4.5 shrink-0" aria-hidden="true" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </div>
  );

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "hidden shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground md:flex",
        collapsed ? "w-16" : "w-56",
      )}
    >
      {renderGroup("Home", home)}
      {renderGroup("Track / Manage", track)}
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        {collapsed ? (
          <ChevronsRight className="size-4.5 shrink-0" aria-hidden="true" />
        ) : (
          <>
            <ChevronsLeft className="size-4.5 shrink-0" aria-hidden="true" />
            <span>Collapse</span>
          </>
        )}
      </button>
    </nav>
  );
}
