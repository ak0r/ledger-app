"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFamilyAndActivateAction } from "@/server/actions/activeFamily";
import { renameFamilyAction } from "@/server/actions/families";

// Client-local schema — shape-only, for fast UX feedback. The real
// enforcement point is createFamilySchema/renameFamilySchema in
// src/server/actions/schemas.ts, run again inside the Server Action
// (rule #17). Mirrors member-form.tsx.
const familyFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

type FamilyFormValues = z.infer<typeof familyFormSchema>;

interface FamilyFormProps {
  submitLabel: string;
  mode?: "create" | "edit";
  family?: { id: string; name: string };
}

export function FamilyForm({ submitLabel, mode = "create", family }: FamilyFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FamilyFormValues>({
    resolver: zodResolver(familyFormSchema),
    defaultValues: family ? { name: family.name } : undefined,
  });

  const onSubmit = async (values: FamilyFormValues) => {
    setServerError(null);
    const result =
      mode === "create"
        ? await createFamilyAndActivateAction(values)
        : await renameFamilyAction({ familyId: family!.id, name: values.name });

    if (!result.success) {
      setServerError(result.error);
      return;
    }
    if (mode === "edit") {
      router.push("/families");
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="family-name">Family name</Label>
        <Input id="family-name" placeholder="e.g. Amit's Family" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
