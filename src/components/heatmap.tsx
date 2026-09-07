// Generic GitHub-contribution-graph-style heatmap (Dashboard System Phase
// 1 delta §8/§10) — a reusable dashboard primitive, not a one-off spending
// component: it knows nothing about money or Ledger data, only a date
// range, a value per day, and a caller-supplied band/color mapping. No
// recharts (confirmed no calendar-heatmap primitive exists in that
// library or anywhere else in this codebase) — a hand-rolled CSS grid is
// simpler than forcing a bar/line-chart library into a shape it doesn't
// have.
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export interface HeatmapProps {
  from: string; // ISO date, inclusive
  to: string; // ISO date, inclusive
  values: ReadonlyMap<string, number>; // date -> value; a missing date is treated as 0
  bandForValue: (value: number) => number;
  colorForBand: (band: number) => string; // any valid CSS color value
  tooltip: (date: string, value: number) => string;
  legendLabels?: { less: string; more: string };
}

export function Heatmap({ from, to, values, bandForValue, colorForBand, tooltip, legendLabels }: HeatmapProps) {
  const rangeStart = new Date(`${from}T00:00:00Z`);
  const rangeEnd = new Date(`${to}T00:00:00Z`);
  const gridStart = startOfWeek(rangeStart);

  const weekCount = Math.ceil((rangeEnd.getTime() - gridStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  const weeks: Date[][] = Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(gridStart, week * 7 + day)),
  );

  // A month label renders once, above the first week-column whose first
  // in-range day falls in that month — not one label per week, which
  // would be unreadably dense.
  const monthLabelByWeek = new Map<number, string>();
  let lastMonth = -1;
  weeks.forEach((week, weekIndex) => {
    const firstInRangeDay = week.find((day) => day >= rangeStart && day <= rangeEnd);
    if (!firstInRangeDay) return;
    const month = firstInRangeDay.getUTCMonth();
    if (month !== lastMonth) {
      monthLabelByWeek.set(weekIndex, MONTH_LABELS[month]!);
      lastMonth = month;
    }
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1 rounded-lg bg-[#0d1117] p-3">
          <div className="ml-8 flex" style={{ gap: "3px" }}>
            {weeks.map((_, weekIndex) => (
              <div key={weekIndex} className="w-[11px] shrink-0 text-[10px] text-neutral-400">
                {monthLabelByWeek.get(weekIndex) ?? ""}
              </div>
            ))}
          </div>
          <div className="flex" style={{ gap: "3px" }}>
            <div className="flex w-8 shrink-0 flex-col justify-between text-[10px] text-neutral-400">
              {WEEKDAY_LABELS.map((label, i) => (
                <span key={label} className={i % 2 === 0 ? "invisible" : ""}>
                  {label}
                </span>
              ))}
            </div>
            <div className="flex" style={{ gap: "3px" }}>
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col" style={{ gap: "3px" }}>
                  {week.map((day) => {
                    const inRange = day >= rangeStart && day <= rangeEnd;
                    const iso = toIsoDate(day);
                    const value = values.get(iso) ?? 0;
                    const band = bandForValue(value);
                    return (
                      <div
                        key={iso}
                        title={inRange ? tooltip(iso, value) : undefined}
                        className="size-[11px] rounded-[2px]"
                        style={{ backgroundColor: inRange ? colorForBand(band) : "transparent" }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {legendLabels && (
            <div className="ml-8 flex items-center gap-1 text-[10px] text-neutral-400">
              <span>{legendLabels.less}</span>
              {Array.from({ length: 5 }, (_, band) => (
                <div key={band} className="size-[11px] rounded-[2px]" style={{ backgroundColor: colorForBand(band) }} />
              ))}
              <span>{legendLabels.more}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
