import { Card, CardContent } from "@/components/ui/card";

// Small supporting statistics, not a wall of KPI cards (product refresh
// §4/§11: "I'd use cards as containers, but not necessarily make every
// statistic a giant KPI card... much more useful than having six separate
// cards"). One `Card` holding a plain label/value row, not one `Card` per
// stat.
export function InsightsStatsStrip({
  stats,
}: {
  stats: { label: string; value: string }[];
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap gap-x-8 gap-y-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{stat.label}</span>
            <span className="font-mono text-base font-medium tabular-nums">{stat.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
