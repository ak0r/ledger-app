"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config: ChartConfig = {
  balance: { label: "Balance", color: "var(--chart-1)" },
} satisfies ChartConfig;

// Balance trend — one line, per-day balance. Recharts' Tooltip already
// responds to both mouse hover (desktop) and tap/touch (mobile) without a
// separate mobile-only implementation — same chart, the interaction
// affordance differs by input device, not by component.
export function AccountBalanceTrendChart({
  data,
  currencySymbol,
}: {
  data: { date: string; balance: number }[];
  currencySymbol: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough activity yet to show a trend.</p>;
  }

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <LineChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={48} />
        <ChartTooltip
          content={
            <ChartTooltipContent formatter={(value) => `${currencySymbol}${value.toLocaleString("en-IN")}`} />
          }
        />
        <Line
          dataKey="balance"
          type="monotone"
          stroke="var(--color-balance)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ChartContainer>
  );
}
