import { ArrowLeftRight, House, Landmark, PiggyBank, Repeat, Settings, Upload, type LucideIcon } from "lucide-react";

// Shared nav data consumed by both SidebarNav (desktop) and BottomNav
// (mobile) — same destinations, different presentation (docs/design/
// design.md §20). Deliberately limited to screens that exist: no Insights
// entry, since it has no screen of its own yet and design.md §18 calls out
// adding nav destinations with nothing behind them as an anti-pattern.
// Settings dropped `primaryOnly` (2026-09-03 Settings/Backup/Data
// Management delta) — it's now a real flat IA every AppUser can reach
// (/settings), not just the Primary-only Profiles roster it used to point
// at directly.
//
// Routes are static top-level paths (Profile is app-level context, not a
// URL segment — see requireActiveProfile in src/server/authz.ts), so hrefs
// need no per-request base to be built against.
export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  primaryOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: "home",
    label: "Home",
    icon: House,
    href: "/",
  },
  {
    key: "accounts",
    label: "Accounts",
    icon: Landmark,
    href: "/accounts",
  },
  {
    key: "transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    href: "/transactions",
  },
  {
    key: "imports",
    label: "Imports",
    icon: Upload,
    href: "/imports",
  },
  {
    key: "recurring",
    label: "Recurring",
    icon: Repeat,
    href: "/recurring",
  },
  {
    key: "budgets",
    label: "Budgets",
    icon: PiggyBank,
    href: "/budgets",
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    href: "/settings",
  },
];
