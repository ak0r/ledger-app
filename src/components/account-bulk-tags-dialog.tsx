"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/tag-input";
import { bulkUpdateAccountTagsAction } from "@/server/actions/accounts";

// AccountBulkActionBar's Tags dialog — identical shape to
// BulkTagsDialog (transactions), same add-then-remove independent
// operation split applied server-side by `bulkUpdateAccountTags`.
export function AccountBulkTagsDialog({
  open,
  onOpenChange,
  accountIds,
  existingTags,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountIds: string[];
  existingTags: string[];
}) {
  const router = useRouter();
  const [addTags, setAddTags] = useState<string[]>([]);
  const [removeTags, setRemoveTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setAddTags([]);
      setRemoveTags([]);
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    const result = await bulkUpdateAccountTagsAction({ accountIds, addTags, removeTags });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    handleOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle>
            Edit tags for {accountIds.length} account{accountIds.length === 1 ? "" : "s"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label>Add tags</Label>
          <TagInput value={addTags} onChange={setAddTags} suggestions={existingTags} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Remove tags</Label>
          <TagInput value={removeTags} onChange={setRemoveTags} suggestions={existingTags} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            type="button"
            disabled={isSaving || (addTags.length === 0 && removeTags.length === 0)}
            onClick={handleSave}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
