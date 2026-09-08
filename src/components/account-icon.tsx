import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Briefcase,
  Building2,
  Coins,
  CreditCard,
  Gift,
  Home,
  Landmark,
  Percent,
  PiggyBank,
  Scale,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import type { AccountType, Classification } from "@/core";
import { cn } from "@/lib/utils";

// Per-Classification fallback — used whenever a caller has no Account Type
// in scope (transaction posting lines, the Classification picker itself)
// or the Account predates the Account Types delta migration/backfill.
const CLASSIFICATION_ICONS: Record<Classification, typeof PiggyBank> = {
  ASSET: PiggyBank,
  LIABILITY: CreditCard,
  INCOME: Building2,
  EXPENSE: ShoppingCart,
  BALANCING: Scale,
};

// Account Type has a central default icon (Account Types, Money
// Representation, Rational Pricing, FX & Liability Details delta §1) —
// one entry per real type, distinct from the coarser per-Classification
// set above.
const ACCOUNT_TYPE_ICONS: Record<AccountType, typeof PiggyBank> = {
  CASH: Banknote,
  BANK: Building2,
  INVESTMENTS: TrendingUp,
  WALLET: Wallet,
  RECEIVABLES: ArrowDownLeft,
  CREDIT_CARD: CreditCard,
  LOAN: Landmark,
  PAYABLES: ArrowUpRight,
  EARNED: Briefcase,
  PASSIVE: Coins,
  WINDFALL: Gift,
  FIXED: Home,
  VARIABLE: ShoppingCart,
  DISCRETIONARY: Sparkles,
  FINANCIAL: Percent,
  INITIAL: Scale,
};

// Category identity lives in the token layer (docs/design/design.md §23),
// not as hardcoded palette classes — each of these resolves to
// --category-* in globals.css, already tuned per light/dark theme. Color
// stays per-Classification (not per-AccountType) — the delta doesn't ask
// for per-type coloring, only a per-type icon glyph.
const COLORS: Record<Classification, string> = {
  ASSET: "text-category-asset",
  LIABILITY: "text-category-liability",
  INCOME: "text-category-income",
  EXPENSE: "text-category-expense",
  BALANCING: "text-category-balancing",
};

// `icon` is the Account's own chosen lucide-react/dynamic name (product-
// polish delta plan #4) — falls back to the Account Type default below
// when unset, itself falling back to the coarser per-Classification default
// when no `accountType` is in scope (many callers — transaction posting
// lines, the Classification picker — only ever have a Classification).
export function AccountIcon({
  classification,
  accountType,
  icon,
  className,
}: {
  classification: Classification;
  accountType?: AccountType | null;
  icon?: string | null;
  className?: string;
}) {
  if (icon) {
    return (
      <DynamicIcon
        name={icon as IconName}
        className={cn("size-4", COLORS[classification], className)}
        aria-hidden="true"
      />
    );
  }
  const Icon = accountType ? ACCOUNT_TYPE_ICONS[accountType] : CLASSIFICATION_ICONS[classification];
  return <Icon className={cn("size-4", COLORS[classification], className)} aria-hidden="true" />;
}
