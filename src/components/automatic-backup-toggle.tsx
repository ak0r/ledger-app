"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { setAutomaticBackupEnabledAction } from "@/server/actions/backups";

export function AutomaticBackupToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [pending, setPending] = useState(false);

  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch
        checked={checked}
        disabled={pending}
        onCheckedChange={async (next) => {
          setChecked(next);
          setPending(true);
          const result = await setAutomaticBackupEnabledAction({ enabled: next });
          setPending(false);
          if (!result.success) {
            setChecked(!next); // revert on failure
            return;
          }
          router.refresh();
        }}
      />
      Automatic Backup
    </label>
  );
}
