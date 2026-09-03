import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/server/db/client";
import { requirePrimaryUser } from "@/server/authz";
import { BACKUP_DIR, getBackupSettings, listBackupHistory } from "@/server/use-cases/backups";
import { createBackupAction } from "@/server/actions/backups";
import { AutomaticBackupToggle } from "@/components/automatic-backup-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

// Backups (2026-09-03 Settings/Backup/Data Management delta §7-13) —
// instance-level, Primary User only (affects every Profile's data, rule #6
// exemption, same gate as Manage Profiles). Cloud Backup and Backup
// Notifications stay visible-but-unavailable placeholders (§21: "Cloud
// Backup and Restore should remain deferred or clearly unavailable until
// their contracts are defined" — Notifications has no delivery mechanism
// either, same posture).
export default async function BackupsPage() {
  await requirePrimaryUser();
  const settings = getBackupSettings(db);
  const history = listBackupHistory(db);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="text-xl font-semibold">Backups</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Local Backup
            <AutomaticBackupToggle enabled={settings.automaticBackupEnabled} />
          </CardTitle>
          <CardDescription>
            Whole Ledger Instance — every Profile, Account, Transaction and other Ledger data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Backup Location</span>
            <span className="font-mono text-sm text-muted-foreground">{BACKUP_DIR}</span>
            <span className="text-xs text-muted-foreground">
              Location on the Ledger server, not this browser&apos;s computer.
            </span>
          </div>

          <form action={createBackupAction}>
            <Button type="submit">Backup Now</Button>
          </form>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Backup History</span>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No backups yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {history.map((backup) => (
                  <li
                    key={backup.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <span>{new Date(backup.createdAt).toLocaleString()}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">{formatBytes(backup.sizeBytes)}</span>
                      <Badge variant={backup.status === "completed" ? "secondary" : "destructive"}>
                        {backup.status === "completed" ? "Completed" : "Failed"}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Cloud Backup
            <Badge variant="outline">Coming soon</Badge>
          </CardTitle>
          <CardDescription>Not Connected</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" disabled>
            Configure Connection
          </Button>
        </CardContent>
      </Card>

      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Backup Notifications
            <Badge variant="outline">Coming soon</Badge>
          </CardTitle>
          <CardDescription>Notify on backup completed/failed events.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
