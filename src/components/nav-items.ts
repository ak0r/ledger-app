import {
  ArrowLeftRight,
  Briefcase,
  House,
  Inbox,
  Landmark,
  Layers,
  PieChart,
  PiggyBank,
  Repeat,
  Settings,
  TrendingUp,
  Upload,
  type LucideIcon,
} from "lucide-react";

// Shared nav data consumed by both SidebarNav (desktop) and BottomNav
// (mobile). Grouped since the Portfolio Adoption Plan (2026-09-05) UI pass
// — Ledger and Portfolio are separate domains (ADR-040) and the sidebar
// makes that visible, not just a longer flat list. `group` is desktop-only
// rendering metadata (SidebarNav); BottomNav deliberately does NOT mirror
// the full list 1:1 anymore — ~14 destinations in a bottom tab bar is
// unusable, so it shows a curated 5-item subset (`mobilePrimary`) and
// leaves the rest reachable by drilling in from Home/Portfolio Overview.
//
// Portfolio UI/Navigation Model delta (2026-09-05) — Portfolio is
// holding-centric, not transaction-centric (its own §13 "Portfolio Mental
// Model"): no top-level Transactions or Holdings entry. Drill-down instead
// — Overview -> Mutual Funds/Stocks (asset class) -> a security's own
// detail page, which is where its read-only Transaction history lives
// (§7 "No Global Portfolio Transaction List"). `Imports` exists in BOTH
// domain groups (contextual, per §10) *and* as the separate global
// "Import Center" below the divider (cross-domain status/review) — two
// different pages, not the same link shown twice.
//
// Still limited to screens that exist (design.md §18's own anti-pattern
// rule) — no Ledger-wide or Portfolio Insights entry yet, neither has a
// screen behind it (this delta's own §11 defines where they'd eventually
// live; building the XIRR/allocation/return machinery they'd show is
// separate, larger work).
export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  primaryOnly?: boolean;
  group?: "ledger" | "portfolio";
  mobilePrimary?: boolean;
}

// Nested routes (e.g. "/portfolio/stocks" under Overview's "/portfolio")
// mean a plain per-item `pathname.startsWith(item.href)` marks every
// ancestor active at once. Active is the single longest href match among
// the rendered items instead.
export function isNavItemActive(pathname: string, item: NavItem, items: readonly NavItem[]): boolean {
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  if (!matches(item.href)) return false;
  return !items.some(
    (other) => other !== item && other.href.length > item.href.length && matches(other.href),
  );
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: "home",
    label: "Home",
    icon: House,
    href: "/",
    mobilePrimary: true,
  },
  // LEDGER — transaction-centric
  {
    key: "transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    href: "/transactions",
    group: "ledger",
    mobilePrimary: true,
  },
  {
    key: "accounts",
    label: "Accounts",
    icon: Landmark,
    href: "/accounts",
    group: "ledger",
    mobilePrimary: true,
  },
  {
    key: "recurring",
    label: "Recurring",
    icon: Repeat,
    href: "/recurring",
    group: "ledger",
  },
  {
    key: "budgets",
    label: "Budgets",
    icon: PiggyBank,
    href: "/budgets",
    group: "ledger",
  },
  {
    key: "ledger-imports",
    label: "Imports",
    icon: Upload,
    href: "/imports",
    group: "ledger",
  },
  // PORTFOLIO — holding-centric: Overview -> asset class -> security ->
  // that security's own read-only transaction history. No Transactions or
  // Holdings entry at this level (delta §1/§7).
  {
    key: "portfolio",
    label: "Overview",
    icon: PieChart,
    href: "/portfolio",
    group: "portfolio",
    mobilePrimary: true,
  },
  {
    key: "portfolio-mutual-funds",
    label: "Mutual Funds",
    icon: Layers,
    href: "/portfolio/mutual-funds",
    group: "portfolio",
  },
  {
    key: "portfolio-stocks",
    label: "Stocks",
    icon: TrendingUp,
    href: "/portfolio/stocks",
    group: "portfolio",
  },
  {
    key: "portfolio-accounts",
    label: "Accounts / Folios",
    icon: Briefcase,
    href: "/portfolio/accounts",
    group: "portfolio",
  },
  {
    key: "portfolio-imports",
    label: "Imports",
    icon: Upload,
    href: "/portfolio/imports",
    group: "portfolio",
  },
  // Global utility — a distinct cross-domain hub (Needs Attention + Recent
  // Imports across both domains, delta §10), not a duplicate of either
  // domain's own contextual "Imports" link above.
  {
    key: "import-center",
    label: "Import Center",
    icon: Inbox,
    href: "/import-center",
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    href: "/settings",
    mobilePrimary: true,
  },
];
