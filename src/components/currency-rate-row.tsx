"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CurrencyRateFormDialog } from "@/components/currency-rate-form-dialog";
import { deleteCurrencyRateAction } from "@/server/actions/currencies";
import { formatDate } from "@/lib/utils";

interface CurrencyRateDisplay {
  id: string;
  date: string;
  rateDecimal: number;
}

// One rate history row — the standard one-unit FX quotation ("1 JPY =
// ₹0.5800"), never rate_num/rate_denom. Overflow menu offers Edit (reopens
// the same Add/Edit dialog, pre-filled) and Delete (ConfirmDialog,
// controlled — same "MenuItem can't nest a DialogTrigger" reasoning as
// TransactionRowMenu).
function CurrencyRateHistoryRow({
  rate,
  currencyId,
  currencyCode,
  baseCurrencyCode,
}: {
  rate: CurrencyRateDisplay;
  currencyId: string;
  currencyCode: string;
  baseCurrencyCode: string;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <tr>
      <td className="py-2 pr-4 text-sm">{formatDate(rate.date)}</td>
      <td className="py-2 pr-4 font-mono text-sm tabular-nums">
        1 {currencyCode} = {rate.rateDecimal.toFixed(4)} {baseCurrencyCode}
      </td>
      <td className="py-2 text-right">
        <Menu>
          <MenuTrigger
            render={
              <Button type="button" variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontal className="size-3.5" aria-hidden="true" />
              </Button>
            }
          />
          <MenuContent>
            <MenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" aria-hidden="true" />
              <span className="ml-2">Edit</span>
            </MenuItem>
            <MenuItem
              className="text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              <span className="ml-2">Delete</span>
            </MenuItem>
          </MenuContent>
        </Menu>
        <CurrencyRateFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          currencyId={currencyId}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          existingRate={rate}
        />
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete this rate?"
          description={`1 ${currencyCode} = ${rate.rateDecimal.toFixed(4)} ${baseCurrencyCode} on ${formatDate(rate.date)} will be removed. Existing transactions are unaffected.`}
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            const result = await deleteCurrencyRateAction({ currencyId, rateId: rate.id });
            if (result.success) router.refresh();
            return result;
          }}
        />
      </td>
    </tr>
  );
}

// A non-Primary Currency's row — "Show Rates"/"Hide Rates" expands/
// collapses its rate history inline, same list (no separate FX Rates
// page/nav item). `rates` comes straight from the Server Component parent
// (already major-unit decimals, never rate_num/rate_denom) — no local
// copy, so a `router.refresh()` after Add/Edit/Delete naturally reflects
// through re-rendered props.
export function CurrencyRateRow({
  currency,
  baseCurrencyCode,
  rates,
}: {
  currency: { id: string; code: string; symbol: string; name: string };
  baseCurrencyCode: string;
  rates: CurrencyRateDisplay[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="flex flex-col gap-2 rounded-lg border px-4 py-3">
      <div className="flex items-center justify-between">
        <span>
          <span className="font-mono">{currency.symbol}</span> {currency.code} — {currency.name}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "Hide Rates" : "Show Rates"}
        </Button>
      </div>
      {expanded && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <div>
            <CurrencyRateFormDialog
              trigger={
                <Button type="button" variant="outline" size="sm">
                  + Add Rate
                </Button>
              }
              currencyId={currency.id}
              currencyCode={currency.code}
              baseCurrencyCode={baseCurrencyCode}
            />
          </div>
          {rates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rates yet.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs font-semibold text-muted-foreground">
                  <th className="py-1.5 pr-4 font-semibold">Date</th>
                  <th className="py-1.5 pr-4 font-semibold">Rate</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <CurrencyRateHistoryRow
                    key={rate.id}
                    rate={rate}
                    currencyId={currency.id}
                    currencyCode={currency.code}
                    baseCurrencyCode={baseCurrencyCode}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}
