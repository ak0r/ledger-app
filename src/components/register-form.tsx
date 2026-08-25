"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction } from "@/server/actions/auth";

// Client-local schema — shape-only, for fast UX feedback. The real
// enforcement point is registerAppUserSchema in src/server/actions/
// schemas.ts, run again inside the Server Action (rule #17).
const registerFormSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().optional(),
});

type RegisterFormValues = z.infer<typeof registerFormSchema>;

// `profileId` arrives via a Primary User's "Registration link"
// (/register?profileId=<id>, 2026-08-20 User Simplification delta §6) — if
// present, registering links to that existing unlinked Profile instead of
// creating a new one; the Name field is then irrelevant (the Profile
// already has one) but harmless to leave visible/optional either way.
export function RegisterForm({ profileId }: { profileId?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerFormSchema) });

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    const result = await registerAction({ ...values, profileId });
    // registerAction redirects server-side on success — only a failure
    // ever resolves back here.
    if (!result.success) {
      setServerError(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      {!profileId && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-name">Name</Label>
          <Input id="register-name" placeholder="e.g. Amit" {...register("name")} />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          type="email"
          placeholder="you@example.com"
          {...register("email")}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="register-password">Password</Label>
        <Input id="register-password" type="password" {...register("password")} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
