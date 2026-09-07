import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { db } from "@/server/persistence/client";
import { getAttentionSignals } from "@/server/services/dashboardMetrics";
import { cn } from "@/lib/utils";

// "What deserves my attention right now?" (Dashboard System Phase 1 delta
// §7.10) — consumes signals already computed by the other panels'
// services (spending trend, credit card health, savings rate trend,
// budget health), never a new calculation of its own. Neutral icon +
// color pairing (color never the only signal) per the codebase's own
// color-semantics convention.
export async function AttentionPanel({ profileId }: { profileId: string; currency: { symbol: string; minorUnitScale: number } }) {
  const signals = getAttentionSignals(db, profileId);

  if (signals.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing needs your attention right now.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {signals.map((signal, index) => {
        const Icon = signal.kind === "warning" ? AlertTriangle : CheckCircle2;
        const color = signal.kind === "warning" ? "text-destructive" : "text-success";
        return (
          <li key={index} className="flex items-start gap-2 text-sm">
            <Icon className={cn("mt-0.5 size-4 shrink-0", color)} aria-hidden="true" />
            <span>{signal.message}</span>
          </li>
        );
      })}
    </ul>
  );
}
