"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { CurrencyDefinition } from "@/domain";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addCurrencyAction } from "@/server/actions/currencies";

const addCurrencyFormSchema = z.object({
  code: z.string().length(3, "Select a currency"),
});

type AddCurrencyFormValues = z.infer<typeof addCurrencyFormSchema>;

// "Add Currency" (2026-09-03 Settings/Backup/Data Management delta §6.2) —
// picks a code from the Currency Catalogue; the Symbol field is read-only
// display, never free-typed ("Currencies are selected from recognised
// currency definitions", not `Create Currency`). `available` excludes
// codes this Profile already has (server-computed — a currency already
// added can't be added twice, use-cases/currencies.ts's
// CurrencyAlreadyAddedError is the backstop if this list ever goes stale).
export function AddCurrencyDialog({ available }: { available: CurrencyDefinition[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm<AddCurrencyFormValues>({
    resolver: zodResolver(addCurrencyFormSchema),
    defaultValues: { code: "" },
  });

  const selectedCode = watch("code");
  const selected = available.find((c) => c.code === selectedCode);

  const onSubmit = async (values: AddCurrencyFormValues) => {
    setServerError(null);
    const result = await addCurrencyAction(values);
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    setOpen(false);
    reset({ code: "" });
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setServerError(null);
          reset({ code: "" });
        }
      }}
    >
      <DialogTrigger render={<Button type="button">+ Add Currency</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Currency</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every currency in the Catalogue has already been added to this Profile.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-currency-code">Currency</Label>
                <Controller
                  control={control}
                  name="code"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="add-currency-code">
                        <SelectValue placeholder="Select Currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((currency) => (
                          <SelectItem key={currency.code} value={currency.code}>
                            {currency.code} — {currency.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-currency-symbol">Symbol</Label>
                <Input id="add-currency-symbol" value={selected?.symbol ?? ""} readOnly disabled />
              </div>
            </>
          )}
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isSubmitting || available.length === 0}>
              {isSubmitting ? "Adding…" : "Add Currency"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
