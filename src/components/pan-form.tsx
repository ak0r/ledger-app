"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setProfilePanAction } from "@/server/actions/profiles";

const panFormSchema = z.object({
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN (e.g. ABCDE1234F)"),
});

type PanFormValues = z.infer<typeof panFormSchema>;

// The PAN a CAS import checks every statement's investor PAN against
// (services/casImport.ts's assertPanMatchesProfile) — set once, replaced
// only by entering a new one. `maskedPan` is server-decrypted display only
// (settings/profiles/[profileId]/edit/page.tsx); the real value here is
// write-only, never round-tripped back to the client.
export function PanForm({ profileId, maskedPan }: { profileId: string; maskedPan: string | null }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PanFormValues>({ resolver: zodResolver(panFormSchema) });

  const onSubmit = async (values: PanFormValues) => {
    setServerError(null);
    setSuccess(false);
    const result = await setProfilePanAction(profileId, { profileId, pan: values.pan });
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    setSuccess(true);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      {maskedPan && (
        <p className="text-sm text-muted-foreground">
          Currently on file: <span className="font-mono">{maskedPan}</span>
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-pan">{maskedPan ? "Replace PAN" : "PAN"}</Label>
        <Input id="profile-pan" placeholder="ABCDE1234F" {...register("pan")} />
        {errors.pan && <p className="text-sm text-destructive">{errors.pan.message}</p>}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      {success && <p className="text-sm text-muted-foreground">PAN saved.</p>}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
