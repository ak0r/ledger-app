"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PortfolioAccountForm } from "@/components/portfolio-account-form";

export function PortfolioAccountFormSheet() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button">+ New Portfolio Account</Button>} />
      <SheetContent className="md:max-w-md gap-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Portfolio Account</SheetTitle>
        </SheetHeader>
        {open && (
          <PortfolioAccountForm onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}
