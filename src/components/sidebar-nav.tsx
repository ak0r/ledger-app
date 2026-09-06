"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavItemActive, type NavItem } from "@/components/nav-items";

// Desktop collapsible sidebar (docs/design/design.md §4.1): grouped
// sections, visible text labels, collapses to icon-only while preserving
// nav order. Hidden below md — BottomNav takes over there (§4.2), a
// curated subset of the same NAV_ITEMS data (§20), not a 1:1 mirror
// anymore now that Portfolio doubled the destination count.
export function SidebarNav({ isPrimary }: { isPrimary: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const items = NAV_ITEMS.filter((item) => !item.primaryOnly || isPrimary);
  const home = items.filter((item) => item.key === "home");
  const ledger = items.filter((item) => item.group === "ledger");
  const portfolio = items.filter((item) => item.group === "portfolio");
  // Global utility, pinned below a divider (matches the wireframe: Import
  // Center + Settings sit outside both domain groups).
  const utility = items.filter((item) => !item.group && item.key !== "home");

  const renderGroup = (label: string | null, groupItems: NavItem[]) => (
    <div className="flex flex-col gap-0.5">
      {!collapsed && label && (
        <span className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground">
          {label}
        </span>
      )}
      {groupItems.map((item) => {
        const active = isNavItemActive(pathname, item, items);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-5 shrink-0" aria-hidden="true" />
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
      {renderGroup(null, home)}
      {renderGroup("Ledger", ledger)}
      {renderGroup("Portfolio", portfolio)}
      <div className="flex-1" />
      <div className={cn("flex flex-col gap-0.5", !collapsed && "border-t border-sidebar-border pt-3")}>
        {utility.map((item) => {
          const active = isNavItemActive(pathname, item, items);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-5 shrink-0" aria-hidden="true" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {collapsed ? (
            <ChevronsRight className="size-5 shrink-0" aria-hidden="true" />
          ) : (
            <>
              <ChevronsLeft className="size-5 shrink-0" aria-hidden="true" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
