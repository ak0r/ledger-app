"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setProfilePrimaryCurrencyAction } from "@/server/actions/profiles";

const primaryCurrencyFormSchema = z.object({
  currencyId: z.string().min(1, "Select a currency"),
});

type PrimaryCurrencyFormValues = z.infer<typeof primaryCurrencyFormSchema>;

// Default for newly created Accounts (Currency Catalogue delta,
// 2026-09-03) — changing it is never retroactive to existing Accounts.
// Options are the Profile's own already-instantiated Currencies, not the
// full catalogue — a Profile can only be primary'd on a Currency it
// actually has (Currencies section's Add Currency, Phase 4, is how it
// gains more than one to choose from).
export function PrimaryCurrencyForm({
  profileId,
  currencies,
  primaryCurrencyId,
}: {
  profileId: string;
  currencies: { id: string; code: string; symbol: string }[];
  primaryCurrencyId: string | null;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<PrimaryCurrencyFormValues>({
    resolver: zodResolver(primaryCurrencyFormSchema),
    defaultValues: { currencyId: primaryCurrencyId ?? currencies[0]?.id ?? "" },
  });

  const onSubmit = async (values: PrimaryCurrencyFormValues) => {
    setServerError(null);
    const result = await setProfilePrimaryCurrencyAction(profileId, values);
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    router.refresh();
  };

  if (currencies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This Profile has no Currency yet — add one before choosing a Primary Currency.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="primary-currency">Primary Currency</Label>
        <Controller
          control={control}
          name="currencyId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="primary-currency">
                <SelectValue placeholder="Select a currency">
                  {(value: string) => {
                    const currency = currencies.find((c) => c.id === value);
                    return currency ? `${currency.code} (${currency.symbol})` : "Select a currency";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency) => (
                  <SelectItem key={currency.id} value={currency.id}>
                    {currency.code} ({currency.symbol})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
