"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config: ChartConfig = {
  amount: { label: "Amount", color: "var(--chart-1)" },
} satisfies ChartConfig;

// Single-series monthly bar chart — Income/Expense accounts' "Trend"
// (product refresh §8/§9): one number per month, not a two-sided
// inflow/outflow comparison (an Income or Expense account's own "outflow"
// side is just corrections/refunds, not a meaningful second series to plot
// alongside it — AccountCashflowChart's grouped bars are for accounts
// where both directions matter, e.g. Bank/Credit Card).
export function AccountTrendChart({
  data,
  currencySymbol,
}: {
  data: { month: string; amount: number }[];
  currencySymbol: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough activity yet to show a trend.</p>;
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
        <Bar dataKey="amount" fill="var(--color-amount)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
