"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/server/actions/auth";

// Client-local schema — shape-only, for fast UX feedback. The real
// enforcement point is loginAppUserSchema in src/server/actions/schemas.ts,
// run again inside the Server Action (rule #17).
const loginFormSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export function LoginForm({ next }: { next?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    const result = await loginAction(values, next);
    // loginAction redirects server-side on success — only a failure ever
    // resolves back here.
    if (!result.success) {
      setServerError(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input id="login-email" type="email" placeholder="you@example.com" {...register("email")} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password">Password</Label>
        <Input id="login-password" type="password" {...register("password")} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
