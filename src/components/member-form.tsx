"use client";

import { useEffect, useState } from "react";
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
  onSuccess,
  onCancel,
  onDirtyChange,
}: {
  familyId: string;
  submitLabel: string;
  mode?: "activate" | "add";
  // Modal usage (MemberCreateDialog, "activate" mode only) passes these to
  // close itself instead of relying on createMemberAndActivateAction's own
  // navigation — same optional-override posture as AccountForm/
  // TransactionForm's onCancel/onSuccess/onDirtyChange.
  onSuccess?: () => void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
    // `defaultValues` must include every registered field path or
    // `formState.isDirty` reads true from the first render, before any
    // user interaction (see TransactionForm's identical fix/comment for
    // the full mechanism) — matters here now that MemberCreateDialog's
    // unsaved-changes guard actually reads `isDirty`.
  } = useForm<MemberFormValues>({ resolver: zodResolver(memberFormSchema), defaultValues: { name: "" } });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

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
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="member-name">Name</Label>
        <Input id="member-name" placeholder="e.g. Amit" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Creating…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
