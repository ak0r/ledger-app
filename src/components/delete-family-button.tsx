"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteFamilyAction } from "@/server/actions/families";

// Family deletion (product-polish pass) — the most destructive action in
// the app (Family is the whole dataset boundary), so the confirmation
// names the Family and every kind of data it owns, explicitly, per the
// user's own spec — not a generic "are you sure?".
export function DeleteFamilyButton({ familyId, familyName }: { familyId: string; familyName: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="destructive">
          Delete Family
        </Button>
      }
      title={`Delete "${familyName}"?`}
      description={`This permanently deletes "${familyName}" and all of its data — Members, Accounts, Transactions, Postings, and other Family-owned data. This cannot be undone.`}
      confirmLabel="Delete Family"
      destructive
      onConfirm={async () => {
        const result = await deleteFamilyAction(familyId);
        if (result.success) {
          router.push("/families");
          router.refresh();
        }
        return result;
      }}
    />
  );
}
