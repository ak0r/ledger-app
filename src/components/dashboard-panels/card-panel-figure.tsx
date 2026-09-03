import type { LucideIcon } from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";

// Shared figure layout for the three Card panels (Net Worth/Assets/
// Liabilities) — a colored icon badge + a big colored number, matching the
// existing `text-category-*` tokens (src/app/globals.css) already used for
// AccountIcon (src/components/account-icon.tsx). A Card is the opposite
// case from a dense list (account-table.tsx): one hero figure, nothing
// else on the panel competing for attention, so color on the primary
// number reinforces meaning instead of becoming noise. Lists stay neutral
// (color on the icon only); Cards can color the figure itself — same
// semantic color system, applied per how much is on screen at once, not a
// decorative per-panel choice.
export function CardPanelFigure({
  amountMinor,
  currency,
  colorClassName,
  icon: Icon,
}: {
  amountMinor: number;
  currency: { symbol: string; minorUnitScale: number };
  colorClassName: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("font-mono text-2xl tabular-nums", colorClassName)}>
        {formatMoney(amountMinor, currency.symbol, currency.minorUnitScale)}
      </span>
      <Icon className={cn("size-5 shrink-0", colorClassName)} aria-hidden="true" />
    </div>
  );
}
