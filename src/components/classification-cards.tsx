"use client";

import { CLASSIFICATIONS, type Classification } from "@/domain";
import { humanizeEnum, cn } from "@/lib/utils";
import { AccountIcon } from "@/components/account-icon";

// Compact selectable cards for Account Classification, replacing the plain
// <select> (docs from the product-polish pass: "compact selectable cards...
// keyboard accessible... mobile friendly... do not make these giant
// dashboard cards"). Built as visually-hidden native radio inputs + styled
// labels — the standard accessible card-radio pattern: free keyboard
// support (Tab/Arrow keys/Space), no hand-rolled ARIA needed.
export function ClassificationCards({
  name,
  value,
  onChange,
  classifications = CLASSIFICATIONS,
}: {
  name: string;
  value: Classification;
  onChange: (value: Classification) => void;
  // Defaults to the full set so any other caller is unaffected — Account
  // Form passes `CREATABLE_CLASSIFICATIONS` (excludes Balancing, the
  // system-managed opening-balance mechanism — 2026-08-19 delta §3/§14).
  classifications?: readonly Classification[];
}) {
  return (
    <div role="radiogroup" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {classifications.map((classification) => {
        const selected = classification === value;
        return (
          <label
            key={classification}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center text-xs transition-colors",
              selected
                ? "border-ring bg-accent text-accent-foreground ring-1 ring-ring/50"
                : "border-input hover:bg-accent/50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={classification}
              checked={selected}
              onChange={() => onChange(classification)}
              className="sr-only"
            />
            <AccountIcon classification={classification} className="size-4" />
            {humanizeEnum(classification)}
          </label>
        );
      })}
    </div>
  );
}
