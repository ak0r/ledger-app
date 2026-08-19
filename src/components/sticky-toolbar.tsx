"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Sticks its own content to the viewport top and publishes its rendered
// height as `--toolbar-h` on the document root (AppHeader itself isn't
// sticky today, confirmed in the Member layout, so no extra offset is
// needed here) — TransactionTable's opt-in `stickyHeader` reads that same
// var so the table's column-header row can stick directly beneath a
// toolbar whose height varies with viewport width (quick search can wrap).
// A CSS var on `documentElement` is simpler than prop-drilling a measured
// height down into a sibling subtree, and only one such toolbar is ever
// mounted at a time.
export function StickyToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const setHeight = () => {
      document.documentElement.style.setProperty("--toolbar-h", `${el.offsetHeight}px`);
    };
    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("sticky top-0 z-20 bg-background", className)}>
      {children}
    </div>
  );
}
