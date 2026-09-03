"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePasswordAction } from "@/server/actions/auth";

// Client-local schema — shape-only, for fast UX feedback. The real
// enforcement point is updatePasswordSchema in
// src/server/actions/schemas.ts, run again inside the Server Action
// (rule #17).
const updatePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type UpdatePasswordFormValues = z.infer<typeof updatePasswordFormSchema>;

export function UpdatePasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordFormValues>({ resolver: zodResolver(updatePasswordFormSchema) });

  const onSubmit = async (values: UpdatePasswordFormValues) => {
    setServerError(null);
    setSuccess(false);
    const result = await updatePasswordAction({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    setSuccess(true);
    reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input id="current-password" type="password" {...register("currentPassword")} />
        {errors.currentPassword && (
          <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input id="new-password" type="password" {...register("newPassword")} />
        {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input id="confirm-password" type="password" {...register("confirmPassword")} />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      {success && <p className="text-sm text-success">Password updated.</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
