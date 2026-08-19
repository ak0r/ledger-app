"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

// Cycles System → Light → Dark → System (docs/screen-contracts.md §21:
// "Support Light, Dark, System... Default: System"). A single cycling
// button rather than a dropdown menu — no shadcn dropdown-menu component
// is installed, and a 3-state cycle needs no extra UI chrome.
const ORDER = ["system", "light", "dark"] as const;
const ICONS = { system: Monitor, light: Sun, dark: Moon };

// React-recommended replacement for the useState+useEffect "mounted" trick
// (which trips the react-hooks/set-state-in-effect lint rule) — subscribe
// never fires, so this is purely "false on the server, true after hydration".
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

// `rail`: stacked icon+label for the sidebar. `icon`: single icon button
// for the header, both breakpoints (docs/design/design.md §5 — appearance
// control lives in the header, not the nav).
export function ThemeToggle({ variant = "rail" }: { variant?: "rail" | "icon" }) {
  const { theme, setTheme } = useTheme();
  // next-themes' `theme` is undefined until mounted client-side — avoid a
  // hydration mismatch by rendering a stable placeholder until then.
  const mounted = useMounted();

  const current = (mounted ? theme : "system") as (typeof ORDER)[number] | undefined;
  const Icon = ICONS[current ?? "system"];

  const cycle = () => {
    const index = ORDER.indexOf(current ?? "system");
    setTheme(ORDER[(index + 1) % ORDER.length]);
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={cycle}
        aria-label={`Appearance: ${current ?? "system"}. Click to change.`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Icon className="size-4.5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Appearance: ${current ?? "system"}. Click to change.`}
      className="flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
    >
      <Icon className="size-5" />
      {mounted ? current : "system"}
    </button>
  );
}
