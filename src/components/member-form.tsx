"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMemberAndActivateAction } from "@/server/actions/activeMember";
import { createMemberAction } from "@/server/actions/members";

// Client-local schema — shape-only, for fast UX feedback. The real
// enforcement point is createMemberSchema in src/server/actions/schemas.ts,
// run again inside the Server Action (rule #17).
const memberFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

type MemberFormValues = z.infer<typeof memberFormSchema>;

// "activate" (default): steady-state "Add another Member" — creates and
// immediately switches into the new Member's dashboard, unchanged since
// Phase 6. "add": initial Family setup (docs/onboarding.md §6) — no Member
// is primary yet, so there's nothing to "switch into" — stays on the page
// and refreshes so the Member list/Continue-or-primary-selection step below
// it can react to the new count.
export function MemberForm({
  familyId,
  submitLabel,
  mode = "activate",
}: {
  familyId: string;
  submitLabel: string;
  mode?: "activate" | "add";
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({ resolver: zodResolver(memberFormSchema) });

  const onSubmit = async (values: MemberFormValues) => {
    setServerError(null);
    const result =
      mode === "activate"
        ? await createMemberAndActivateAction(familyId, values)
        : await createMemberAction(familyId, values);
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    if (mode === "add") {
      reset();
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="member-name">Name</Label>
        <Input id="member-name" placeholder="e.g. Amit" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating…" : submitLabel}
      </Button>
    </form>
  );
}
