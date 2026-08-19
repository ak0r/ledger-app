"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Tags are a flat list of opaque strings (rule #13/#14) — no key/value, no
// normalized Tag entity, no typed/hierarchical taxonomy. `suggestions`
// (existing tags already used elsewhere in the Family, passed down from
// the page's own read of listDistinctTags) drive a lightweight
// autocomplete — same anchored-panel visual language as AppHeader's
// switcher panels (bg-popover/ring-foreground/z-50), not a one-off style.
export function TagInput({
  value,
  onChange,
  suggestions = [],
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setDraft("");
    setOpen(false);
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const filteredSuggestions = suggestions.filter(
    (tag) => !value.includes(tag) && tag.toLowerCase().includes(draft.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="outline" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div ref={containerRef} className="relative">
        <Input
          placeholder="Add a tag…"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a click on a suggestion registers before the panel
            // unmounts (a plain blur would close it first).
            window.setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag(draft);
            } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
              removeTag(value[value.length - 1]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {open && filteredSuggestions.length > 0 && (
          <div
            role="listbox"
            aria-label="Tag suggestions"
            className="absolute top-full z-50 mt-1.5 w-full max-h-48 overflow-auto rounded-xl bg-popover p-1.5 text-popover-foreground ring-1 ring-foreground/10 shadow-md"
          >
            {filteredSuggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => addTag(tag)}
                className={cn(
                  "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
