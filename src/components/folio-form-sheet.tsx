"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FolioForm } from "@/components/folio-form";

export function FolioFormSheet({ portfolioAccountId }: { portfolioAccountId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="outline" size="sm">+ Add Folio</Button>} />
      <SheetContent className="md:max-w-md gap-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Folio</SheetTitle>
        </SheetHeader>
        {open && (
          <FolioForm
            portfolioAccountId={portfolioAccountId}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
