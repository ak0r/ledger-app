"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { INSTRUMENT_BACKED_TYPES, type InstrumentBackedType } from "@/core";
import { humanizeEnum } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPortfolioAccountAction } from "@/server/actions/portfolioAccounts";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(INSTRUMENT_BACKED_TYPES),
  provider: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

// PortfolioAccount create form (Portfolio Adoption Plan §2) — a broker/RTA-
// level account (e.g. "Zerodha", "CAMS MF Folios"). No edit mode yet — V1
// is create-only, same posture as most of this delta's other forms.
export function PortfolioAccountForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: (account: { id: string; name: string }) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", type: "MUTUAL_FUND", provider: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const result = await createPortfolioAccountAction({
      name: values.name,
      type: values.type,
      provider: values.provider || undefined,
    });
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    onSuccess(result.data);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="portfolio-account-name">Name</Label>
        <Input id="portfolio-account-name" placeholder="e.g. Zerodha" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="portfolio-account-type">Type</Label>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="portfolio-account-type">
                <SelectValue>{(value: InstrumentBackedType) => humanizeEnum(value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {INSTRUMENT_BACKED_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {humanizeEnum(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="portfolio-account-provider">Provider (optional)</Label>
        <Input id="portfolio-account-provider" placeholder="e.g. CAMS/KFin" {...register("provider")} />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Creating…" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
