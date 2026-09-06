"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RECENT_EXPENSES_PERIODS,
  PANEL_NAME_BY_KEY,
  type BalancesPanelConfig,
  type PanelConfigByKey,
  type PanelKey,
  type RecentExpensesPanelConfig,
  type RecentTransactionsPanelConfig,
} from "@/core";
import type { DashboardPanelRow } from "@/server/repositories/dashboardPanels";
import { updatePanelConfigurationAction } from "@/server/actions/dashboards";
import { humanizeEnum } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Configure Panel modal (spec §21) — one dialog shell, per-panel-type form
// content inline below rather than a separate pluggable form registry:
// only 3 of the 7 panel keys have any configuration at all
// (domain/dashboard.ts's CONFIGURABLE_PANEL_KEYS), a switch is enough.
export function PanelConfigDialog({
  panel,
  accounts,
  open,
  onOpenChange,
}: {
  panel: DashboardPanelRow;
  accounts: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [configuration, setConfiguration] = useState<PanelConfigByKey[PanelKey]>(panel.configuration);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await updatePanelConfigurationAction({ panelId: panel.id, key: panel.key, configuration });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure {PANEL_NAME_BY_KEY[panel.key]}</DialogTitle>
        </DialogHeader>

        {panel.key === "BALANCES" && (
          <BalancesConfigForm value={configuration as BalancesPanelConfig} onChange={setConfiguration} accounts={accounts} />
        )}
        {panel.key === "RECENT_EXPENSES" && (
          <RecentExpensesConfigForm value={configuration as RecentExpensesPanelConfig} onChange={setConfiguration} />
        )}
        {panel.key === "RECENT_TRANSACTIONS" && (
          <RecentTransactionsConfigForm value={configuration as RecentTransactionsPanelConfig} onChange={setConfiguration} />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BalancesConfigForm({
  value,
  onChange,
  accounts,
}: {
  value: BalancesPanelConfig;
  onChange: (config: BalancesPanelConfig) => void;
  accounts: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Account Scope</Label>
        <Select value={value.scope} onValueChange={(scope) => onChange({ ...value, scope: scope as BalancesPanelConfig["scope"] })}>
          <SelectTrigger>
            <SelectValue>{(v: string) => (v === "ALL" ? "All accounts" : "Selected accounts")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All accounts</SelectItem>
            <SelectItem value="SELECTED">Selected accounts</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.scope === "SELECTED" && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2.5 ring-1 ring-foreground/10">
          {accounts.length === 0 && <p className="text-sm text-muted-foreground">No accounts yet.</p>}
          {accounts.map((account) => (
            <label key={account.id} className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={value.accountIds.includes(account.id)}
                onCheckedChange={(checked) =>
                  onChange({ ...value, accountIds: checked ? [...value.accountIds, account.id] : value.accountIds.filter((id) => id !== account.id) })
                }
              />
              {account.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentExpensesConfigForm({
  value,
  onChange,
}: {
  value: RecentExpensesPanelConfig;
  onChange: (config: RecentExpensesPanelConfig) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Period</Label>
      <Select value={value.period} onValueChange={(period) => onChange({ period: period as RecentExpensesPanelConfig["period"] })}>
        <SelectTrigger>
          <SelectValue>{(v: string) => humanizeEnum(v)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {RECENT_EXPENSES_PERIODS.map((period) => (
            <SelectItem key={period} value={period}>
              {humanizeEnum(period)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RecentTransactionsConfigForm({
  value,
  onChange,
}: {
  value: RecentTransactionsPanelConfig;
  onChange: (config: RecentTransactionsPanelConfig) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="recent-transactions-limit">Number of transactions</Label>
      <Input
        id="recent-transactions-limit"
        type="number"
        min="1"
        max="100"
        step="1"
        value={value.limit}
        onChange={(e) => onChange({ limit: Number(e.target.value) || 1 })}
      />
    </div>
  );
}
