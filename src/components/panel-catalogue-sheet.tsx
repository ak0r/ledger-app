"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PANEL_CATEGORIES, PANEL_CATEGORY_BY_KEY, PANEL_DESCRIPTION_BY_KEY, PANEL_NAME_BY_KEY, type PanelCategory, type PanelKey } from "@/core";
import { addPanelAction } from "@/server/actions/dashboards";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const CATEGORY_LABELS: Record<PanelCategory, string> = { CARD: "Cards", LIST: "Lists", CHART: "Charts" };

// "+ Add Panel" (spec §19) — grouped Cards/Lists/Charts, scoped to the
// current Dashboard's own context (Dashboard System Phase 1 delta,
// 2026-09-06 — `eligiblePanels` is already filtered to this context's
// keys by `listEligiblePanelsForContext`, server-computed since
// eligibility needs a real DB read this Client Component can't do
// itself). An ineligible panel shows its reason instead of being
// addable — never silently hidden (delta §4's own "explain why" rule).
// Selecting an eligible panel creates it with default configuration and
// never forces a configure modal open.
export function PanelCatalogueSheet({
  dashboardId,
  eligiblePanels,
}: {
  dashboardId: string;
  eligiblePanels: { key: PanelKey; eligibility: { eligible: boolean; reason?: string } }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addPanel(key: string) {
    setAdding(key);
    setError(null);
    const result = await addPanelAction({ dashboardId, key });
    setAdding(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button">+ Add Panel</Button>} />
      <SheetContent className="md:max-w-md gap-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Panel</SheetTitle>
        </SheetHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {PANEL_CATEGORIES.map((category) => {
          const entries = eligiblePanels.filter(({ key }) => PANEL_CATEGORY_BY_KEY[key] === category);
          if (entries.length === 0) return null;
          return (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">{CATEGORY_LABELS[category]}</h3>
              <div className="flex flex-col gap-1.5">
                {entries.map(({ key, eligibility }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={adding === key || !eligibility.eligible}
                    onClick={() => addPanel(key)}
                    className="flex flex-col items-start gap-0.5 rounded-xl p-2.5 text-left ring-1 ring-foreground/10 hover:enabled:bg-muted/40 disabled:opacity-50"
                  >
                    <span className="text-sm font-medium">{PANEL_NAME_BY_KEY[key]}</span>
                    <span className="text-xs text-muted-foreground">
                      {eligibility.eligible ? PANEL_DESCRIPTION_BY_KEY[key] : eligibility.reason}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </SheetContent>
    </Sheet>
  );
}
