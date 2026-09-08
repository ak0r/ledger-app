"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertCurrencyRateAction } from "@/server/actions/currencies";

const rateFormSchema = z.object({
  date: z.string().min(1, "Date is required"),
  rateDecimal: z.number().positive("Rate must be greater than zero"),
});

type RateFormValues = z.infer<typeof rateFormSchema>;

// Add/Edit Rate, one dialog (same "one shared form for create+edit" posture
// as AccountForm/RecurringForm elsewhere) — standard one-unit FX quotation
// only ("1 JPY = [ 0.5800 ] INR"), never rate_num/rate_denom, never a
// 100/1000-unit or currency-specific quote unit. Two ways to open it, same
// duality as ConfirmDialog: an uncontrolled `trigger` (the row's own
// "+ Add Rate" button) or controlled `open`/`onOpenChange` (a Menu's Edit
// item — nesting a DialogTrigger inside a MenuItem doesn't work, see
// ConfirmDialog's own comment on the exact same issue).
export function CurrencyRateFormDialog({
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  currencyId,
  currencyCode,
  baseCurrencyCode,
  existingRate,
}: {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  currencyId: string;
  currencyCode: string;
  baseCurrencyCode: string;
  // Present -> editing that rate; absent -> adding a new one.
  existingRate?: { id: string; date: string; rateDecimal: number };
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RateFormValues>({
    resolver: zodResolver(rateFormSchema),
    defaultValues: {
      date: existingRate?.date ?? new Date().toISOString().slice(0, 10),
      rateDecimal: existingRate?.rateDecimal ?? 0,
    },
  });

  const onSubmit = async (values: RateFormValues) => {
    setServerError(null);
    const result = await upsertCurrencyRateAction({
      id: existingRate?.id,
      currencyId,
      date: values.date,
      rateDecimal: values.rateDecimal,
    });
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setServerError(null);
      }}
    >
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existingRate ? "Edit Rate" : "Add Rate"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-rate-date">Date</Label>
            <Input id="currency-rate-date" type="date" {...register("date")} />
            {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-rate-value">Rate</Label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">1 {currencyCode} =</span>
              <Input
                id="currency-rate-value"
                type="number"
                step="any"
                min="0"
                className="flex-1"
                {...register("rateDecimal", { valueAsNumber: true })}
              />
              <span className="text-muted-foreground">{baseCurrencyCode}</span>
            </div>
            {errors.rateDecimal && <p className="text-sm text-destructive">{errors.rateDecimal.message}</p>}
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save Rate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
