import { spendingHeatmapBand } from "@/core";
import { db } from "@/server/persistence/client";
import { getDailyExpenseTotals } from "@/server/services/dashboardMetrics";
import { formatMoney } from "@/lib/utils";
import { Heatmap } from "@/components/heatmap";

// A calendar of daily spending over the trailing year (Dashboard System
// Phase 1 delta §8/§9) — the first use of the generic Heatmap primitive.
// Colors are the delta's own fixed red-intensity bands (§9); band 0 is
// visually distinct from any real spend (a slightly lighter neutral, not
// the same color a genuine ₹0 posting day would otherwise share with "no
// data").
const BAND_COLORS = ["#161b22", "#4d1a1a", "#7a1f1f", "#b32424", "#ff3b3b"];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function DailySpendingHeatmapPanel({
  profileId,
  currency,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
}) {
  const today = new Date();
  const to = toIsoDate(today);
  const from = toIsoDate(new Date(today.getTime() - 364 * 24 * 60 * 60 * 1000));
  const toIsoExclusive = toIsoDate(new Date(today.getTime() + 24 * 60 * 60 * 1000)); // include `to` itself

  const totalsMinor = getDailyExpenseTotals(db, profileId, from, toIsoExclusive);
  const scale = 10 ** currency.minorUnitScale;
  const totalsMajor = new Map([...totalsMinor.entries()].map(([date, minor]) => [date, minor / scale]));

  return (
    <Heatmap
      from={from}
      to={to}
      values={totalsMajor}
      bandForValue={spendingHeatmapBand}
      colorForBand={(band) => BAND_COLORS[band]!}
      tooltip={(date, value) => `${date}\nSpent ${formatMoney(Math.round(value * scale), currency.symbol, currency.minorUnitScale)}`}
      legendLabels={{ less: "Less", more: "More" }}
    />
  );
}
