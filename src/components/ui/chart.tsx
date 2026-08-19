"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

// Minimal shadcn-style chart wrapper (docs/design/design.md: charts stay
// "minimal, premium, readable... consistent with Light/Dark/System
// themes") — a thin ChartContainer/ChartTooltip around Recharts, driven by
// the existing --chart-1..--chart-5 CSS variables (globals.css) so series
// colors come from the design token layer, never hardcoded per chart.
export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    color?: string
  }
>

type ChartContextProps = { config: ChartConfig }
const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) throw new Error("Chart components must be used within a ChartContainer")
  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorEntries = Object.entries(config).filter(([, item]) => item.color)
  if (colorEntries.length === 0) return null

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart="${id}"] {\n${colorEntries
          .map(([key, item]) => `  --color-${key}: ${item.color};`)
          .join("\n")}\n}`,
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

interface ChartTooltipItem {
  dataKey?: string | number
  name?: string | number
  value?: number | string
  color?: string
}

function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  formatter,
  labelFormatter,
}: {
  active?: boolean
  payload?: ChartTooltipItem[]
  label?: string | number
  className?: string
  formatter?: (value: number, name: string) => React.ReactNode
  labelFormatter?: (label: string) => React.ReactNode
}) {
  const { config } = useChart()

  if (!active || !payload?.length) return null

  return (
    <div
      className={cn(
        "grid min-w-32 gap-1.5 rounded-xl bg-popover px-2.5 py-1.5 text-xs text-popover-foreground ring-1 ring-foreground/10 shadow-md",
        className,
      )}
    >
      {label !== undefined && (
        <div className="font-medium">{labelFormatter ? labelFormatter(String(label)) : label}</div>
      )}
      <div className="grid gap-1">
        {payload.map((item, index: number) => {
          const key = String(item.dataKey ?? item.name ?? index)
          const itemConfig = config[key]
          const color = item.color ?? `var(--color-${key})`
          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: color }}
                />
                {itemConfig?.label ?? item.name}
              </span>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {formatter && typeof item.value === "number"
                  ? formatter(item.value, key)
                  : item.value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { ChartContainer, ChartTooltip, ChartTooltipContent }
