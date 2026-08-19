import { Building2, CreditCard, PiggyBank, Scale, ShoppingCart } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import type { Classification } from "@/domain";
import { cn } from "@/lib/utils";

// One icon per Classification (docs/screen-contracts.md's FinBodhi
// reference uses a colored icon per account) — bounded to the 5 frozen
// classifications (ADR-024), not per exact instrument type.
const ICONS: Record<Classification, typeof PiggyBank> = {
  ASSET: PiggyBank,
  LIABILITY: CreditCard,
  INCOME: Building2,
  EXPENSE: ShoppingCart,
  BALANCING: Scale,
};

// Category identity lives in the token layer (docs/design/design.md §23),
// not as hardcoded palette classes — each of these resolves to
// --category-* in globals.css, already tuned per light/dark theme.
const COLORS: Record<Classification, string> = {
  ASSET: "text-category-asset",
  LIABILITY: "text-category-liability",
  INCOME: "text-category-income",
  EXPENSE: "text-category-expense",
  BALANCING: "text-category-balancing",
};

// `icon` is the Account's own chosen lucide-react/dynamic name (product-
// polish delta plan #4) — falls back to the per-classification default
// below when unset, so every pre-existing Account keeps working unchanged.
export function AccountIcon({
  classification,
  icon,
  className,
}: {
  classification: Classification;
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
  const Icon = ICONS[classification];
  return <Icon className={cn("size-4", COLORS[classification], className)} aria-hidden="true" />;
}
