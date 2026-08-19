"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config: ChartConfig = {
  inflow: { label: "In", color: "var(--color-positive)" },
  outflow: { label: "Out", color: "var(--color-negative)" },
} satisfies ChartConfig;

// Monthly cashflow — minimal grouped bars, semantically coloured (positive/
// negative tokens, same pair used everywhere else in the app for money
// direction), no 3D/gradient/decoration.
export function AccountCashflowChart({
  data,
  currencySymbol,
}: {
  data: { month: string; inflow: number; outflow: number }[];
  currencySymbol: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough activity yet to show cashflow.</p>;
  }

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={48} />
        <ChartTooltip
          content={
            <ChartTooltipContent formatter={(value) => `${currencySymbol}${value.toLocaleString("en-IN")}`} />
          }
        />
        <Bar dataKey="inflow" fill="var(--color-inflow)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="outflow" fill="var(--color-outflow)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
