import { ArrowLeftRight, House, Landmark, type LucideIcon } from "lucide-react";

// Shared nav data consumed by both SidebarNav (desktop) and BottomNav
// (mobile) — same destinations, different presentation (docs/design/
// design.md §20). Deliberately limited to screens that exist: no Insights/
// Settings entries, since neither has a screen yet and design.md §18 calls
// out adding nav destinations with nothing behind them as an anti-pattern.
export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: (base: string) => string;
  isActive: (pathname: string, base: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: "home",
    label: "Home",
    icon: House,
    href: (base) => base,
    isActive: (pathname, base) => pathname === base,
  },
  {
    key: "accounts",
    label: "Accounts",
    icon: Landmark,
    href: (base) => `${base}/accounts`,
    isActive: (pathname, base) => pathname.startsWith(`${base}/accounts`),
  },
  {
    key: "transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    href: (base) => `${base}/transactions`,
    isActive: (pathname, base) => pathname.startsWith(`${base}/transactions`),
  },
];
