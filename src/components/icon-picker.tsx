"use client";

import { useEffect, useRef, useState } from "react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// No manually maintained icon list (product-polish delta plan #4) —
// `iconNames` is lucide-react/dynamic's own ~2025-name export. Nothing
// renders until the user types: that many buttons unfiltered would need
// virtualization, which isn't a dependency here, and an empty picker with a
// search box is a fine first state anyway. Same anchored-panel convention
// as TagInput (bg-popover/ring-foreground/z-50), not a new UI primitive.
const MAX_RESULTS = 60;

export function IconPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (icon: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const results = query.trim()
    ? iconNames.filter((name) => name.includes(query.trim().toLowerCase())).slice(0, MAX_RESULTS)
    : [];

  return (
    <div ref={containerRef} className="relative">
      <Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={() => setOpen((o) => !o)}>
        {value ? (
          <DynamicIcon name={value as IconName} className="size-4" aria-hidden="true" />
        ) : (
          <span className="size-4 rounded border border-dashed border-muted-foreground" aria-hidden="true" />
        )}
        {value ?? "Choose an icon (optional)"}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose an icon"
          className="absolute top-full z-50 mt-1.5 w-72 rounded-xl bg-popover p-2.5 text-popover-foreground ring-1 ring-foreground/10 shadow-md"
        >
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              placeholder="Search icons…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
              }}
            />
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            )}
          </div>

          {query.trim() && (
            <div
              role="listbox"
              aria-label="Icon results"
              className="mt-2 grid max-h-48 grid-cols-6 gap-1 overflow-y-auto"
            >
              {results.length === 0 ? (
                <p className="col-span-6 py-2 text-center text-xs text-muted-foreground">No icons found</p>
              ) : (
                results.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={name === value}
                    aria-label={name}
                    title={name}
                    onClick={() => {
                      onChange(name);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg hover:bg-accent hover:text-accent-foreground",
                      name === value && "bg-accent text-accent-foreground ring-1 ring-ring",
                    )}
                  >
                    <DynamicIcon name={name} className="size-4" aria-hidden="true" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
