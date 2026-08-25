"use client";

import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// /profiles is always reached in-app (app-header's "Manage profiles" item
// is its only link, per audit-driven polish pass) — presenting it as a
// modal over the page the user came from, rather than a full navigation,
// matches that "quick management overlay" feel. `router.back()` on close
// returns to wherever that was; the route itself still renders standalone
// if loaded directly (bookmark, refresh), just without a "came from"
// page underneath the backdrop.
export function ProfilesModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md gap-6 overflow-y-auto sm:max-w-md">
        {children}
      </DialogContent>
    </Dialog>
  );
}
