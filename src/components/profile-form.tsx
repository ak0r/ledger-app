"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProfileAction, renameProfileAction } from "@/server/actions/profiles";

// Client-local schema — shape-only, for fast UX feedback. The real
// enforcement point is createProfileSchema/renameProfileSchema in
// src/server/actions/schemas.ts, run again inside the Server Action
// (rule #17).
const profileFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

interface ProfileFormProps {
  submitLabel: string;
  mode?: "create" | "edit";
  profile?: { id: string; name: string };
  onSuccess?: () => void;
}

// "create" (Primary-only, /profiles roster): adds a new, initially
// unlinked Profile — no Member-picking dance, a Profile is the whole
// identity now. "edit": renames an existing Profile (the only editable
// field — no deleteProfile use-case exists yet, so there's no delete
// counterpart here).
export function ProfileForm({ submitLabel, mode = "create", profile, onSuccess }: ProfileFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: profile ? { name: profile.name } : undefined,
  });

  const onSubmit = async (values: ProfileFormValues) => {
    setServerError(null);
    const result =
      mode === "create"
        ? await createProfileAction(values)
        : await renameProfileAction(profile!.id, { profileId: profile!.id, name: values.name });

    if (!result.success) {
      setServerError(result.error);
      return;
    }
    router.refresh();
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Name</Label>
        <Input id="profile-name" placeholder="e.g. Amit" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
