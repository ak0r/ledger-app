import type { Route } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";

// Shared figure layout for the Card panels (Net Worth/Assets/Liabilities/
// Portfolio Value) — a colored icon badge + a big colored number, matching
// the existing `text-category-*` tokens (src/app/globals.css) already used
// for AccountIcon (src/components/account-icon.tsx). A Card is the opposite
// case from a dense list (account-table.tsx): one hero figure, nothing
// else on the panel competing for attention, so color on the primary
// number reinforces meaning instead of becoming noise. Lists stay neutral
// (color on the icon only); Cards can color the figure itself — same
// semantic color system, applied per how much is on screen at once, not a
// decorative per-panel choice.
//
// `href` is optional so this stays reusable for a future signed figure
// with nowhere obvious to link to — every current caller passes one
// (Dashboard panels were otherwise a dead end, no panel linked anywhere).
export function CardPanelFigure({
  amountMinor,
  currency,
  colorClassName,
  icon: Icon,
  href,
}: {
  amountMinor: number;
  currency: { symbol: string; minorUnitScale: number };
  colorClassName: string;
  icon: LucideIcon;
  href?: Route;
}) {
  const figure = (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("font-mono text-2xl tabular-nums", colorClassName)}>
        {formatMoney(amountMinor, currency.symbol, currency.minorUnitScale)}
      </span>
      <Icon className={cn("size-5 shrink-0", colorClassName)} aria-hidden="true" />
    </div>
  );

  if (!href) return figure;

  return (
    <Link href={href} className="-m-1 block rounded-lg p-1 transition-colors hover:bg-muted/50">
      {figure}
    </Link>
  );
}
