"use client";

import { useRouter, usePathname } from "next/navigation";
import { DASHBOARD_CONTEXTS, DASHBOARD_CONTEXT_LABEL, type DashboardContext } from "@/core";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";

// Dashboard System Phase 1 delta (2026-09-06) — switches which Dashboard
// context's data the Server Component page fetches, via a `?context=`
// search param (same "URL-driven view state" convention as Account
// Detail's own `?filter=&sort=`, not client-held state) — this component
// only owns the tab UI/navigation, all data fetching stays server-side in
// page.tsx.
export function DashboardContextTabs({ active }: { active: DashboardContext }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        const context = value as DashboardContext;
        router.push(context === "FINANCIAL" ? pathname : `${pathname}?context=${context}`);
      }}
    >
      <TabsList>
        {DASHBOARD_CONTEXTS.map((context) => (
          <TabsTab key={context} value={context}>
            {DASHBOARD_CONTEXT_LABEL[context]}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  );
}
