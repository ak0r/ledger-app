"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFolioAction } from "@/server/actions/folios";

const schema = z.object({
  number: z.string().trim().min(1, "Folio/account number is required"),
  amcCode: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

// Folio create form (Portfolio Adoption Plan §2) — scoped to one
// PortfolioAccount at a time (passed in, not picked here); a Folio always
// lives under exactly one PortfolioAccount.
export function FolioForm({
  portfolioAccountId,
  onSuccess,
  onCancel,
}: {
  portfolioAccountId: string;
  onSuccess: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { number: "", amcCode: "" } });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const result = await createFolioAction({
      portfolioAccountId,
      number: values.number,
      amcCode: values.amcCode || undefined,
    });
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    onSuccess();
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="folio-number">Folio / account number</Label>
        <Input id="folio-number" placeholder="e.g. 12345/0" {...register("number")} />
        {errors.number && <p className="text-sm text-destructive">{errors.number.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="folio-amc">AMC code (optional)</Label>
        <Input id="folio-amc" placeholder="e.g. HDFC" {...register("amcCode")} />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Adding…" : "Add Folio"}
        </Button>
      </div>
    </form>
  );
}
