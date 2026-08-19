"use client";

import { useRouter } from "next/navigation";
import { INSIGHTS_RANGE_LABELS, INSIGHTS_RANGE_PRESETS, type InsightsRangePreset } from "@/lib/insights-range";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Insights tab's one shared control — applies to every chart/stat on the
// page (product refresh §3: "the selected range applies to the entire
// Insights page rather than having a separate date selector on every
// chart"), a single `range` query param rather than per-section state.
export function InsightsRangeSelector({
  baseHref,
  current,
}: {
  baseHref: string;
  current: InsightsRangePreset;
}) {
  const router = useRouter();

  return (
    <Select
      value={current}
      onValueChange={(value) => router.push(`${baseHref}?range=${value}`)}
      items={INSIGHTS_RANGE_PRESETS.map((preset) => ({ label: INSIGHTS_RANGE_LABELS[preset], value: preset }))}
    >
      <SelectTrigger aria-label="Date range" className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {INSIGHTS_RANGE_PRESETS.map((preset) => (
          <SelectItem key={preset} value={preset}>
            {INSIGHTS_RANGE_LABELS[preset]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
