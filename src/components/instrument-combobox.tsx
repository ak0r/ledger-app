"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import type { InstrumentBackedType } from "@/core";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createInstrumentAction, searchInstrumentsAction } from "@/server/actions/instruments";

export interface InstrumentOption {
  id: string;
  name: string;
}

const SEARCH_DEBOUNCE_MS = 250;

// Portfolio's own Instrument picker (Portfolio Adoption Plan, 2026-09-05) —
// same search-or-create shape as the Account form's old InstrumentPicker
// (deleted by the Ledger/Portfolio delink, ADR-040), rebuilt for
// InvestmentTransaction's Instrument field instead. The underlying
// catalogue search/create actions are exactly the ones the delink
// deliberately preserved untouched, for exactly this reuse.
export function InstrumentCombobox({
  id,
  type,
  value,
  onChange,
}: {
  id?: string;
  type: InstrumentBackedType;
  value: InstrumentOption | null;
  onChange: (value: InstrumentOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<InstrumentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!open || trimmedQuery.length === 0) return;
    let cancelled = false;

    const timer = setTimeout(() => {
      setLoading(true);
      setCreateError(null);
      searchInstrumentsAction({ type, query: trimmedQuery }).then((result) => {
        if (cancelled) return;
        setOptions(result.success ? result.data : []);
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, type, trimmedQuery]);

  const exactMatch = options.some((option) => option.name.toLowerCase() === trimmedQuery.toLowerCase());

  function select(option: InstrumentOption | null) {
    onChange(option);
    setOpen(false);
    setQuery("");
  }

  async function handleCreate() {
    if (!trimmedQuery) return;
    setCreateError(null);
    setIsCreating(true);
    const result = await createInstrumentAction({ type, name: trimmedQuery });
    setIsCreating(false);
    if (!result.success) {
      setCreateError(result.error);
      return;
    }
    select({ id: result.data.id, name: result.data.name });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            id={id}
            className="flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1 text-left text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          />
        }
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value ? value.name : "Select an instrument"}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <Input
          autoFocus
          placeholder="Search or create…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="mt-2 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          {trimmedQuery.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Type to search…</p>
          ) : loading ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Searching…</p>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => select(option)}
              >
                <span className="truncate">{option.name}</span>
                {value?.id === option.id && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
              </button>
            ))
          )}
          {trimmedQuery && !loading && !exactMatch && (
            <button
              type="button"
              disabled={isCreating}
              onClick={handleCreate}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-primary hover:bg-muted disabled:opacity-50"
            >
              {isCreating ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              Create &ldquo;{trimmedQuery}&rdquo;
            </button>
          )}
        </div>
        {createError && <p className="mt-1 px-2 text-sm text-destructive">{createError}</p>}
      </PopoverContent>
    </Popover>
  );
}
