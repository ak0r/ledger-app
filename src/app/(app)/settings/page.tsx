import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import {
  KeyRound,
  Users,
  Coins,
  DatabaseBackup,
  FolderCog,
} from "lucide-react";
import { requireActiveProfile } from "@/server/authz";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Settings information architecture (2026-09-03 Settings/Backup/Data
// Management delta, supersedes the earlier GENERAL/CURRENT PROFILE grouped
// direction) — five flat, task-oriented sections, not grouped by
// User-level/Profile-level internals. `AppUser` never appears as
// user-facing text (delta §2). Every AppUser can reach this page — Manage
// Profiles still redirects a Normal AppUser back to `/` today
// (requirePrimaryUser in the existing /settings/profiles roster); widening
// that is Phase 3 of this delta, not this shell.
interface SettingsSection {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href: string | null;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: "account",
    label: "Manage Account",
    description: "Update your password.",
    icon: KeyRound,
    href: "/settings/account",
  },
  {
    key: "profiles",
    label: "Manage Profiles",
    description: "Create, rename and switch between Profiles.",
    icon: Users,
    href: "/settings/profiles",
  },
  {
    key: "currencies",
    label: "Currencies",
    description: "Available currencies and each Profile's primary currency.",
    icon: Coins,
    href: "/settings/currencies",
  },
  {
    key: "backups",
    label: "Backups",
    description: "Local and cloud backup of this Ledger instance.",
    icon: DatabaseBackup,
    href: "/settings/backups",
  },
  {
    key: "data",
    label: "Data Management",
    description: "Import, export and reset this Ledger instance's data.",
    icon: FolderCog,
    href: "/settings/data",
  },
];

export default async function SettingsPage() {
  await requireActiveProfile();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      <div className="flex flex-col gap-3">
        {SETTINGS_SECTIONS.map((section) => {
          const body = (
            <Card
              className={cn(
                "transition-colors",
                section.href && "hover:bg-accent/40",
              )}
            >
              <CardContent className="flex items-center gap-3">
                <section.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="flex-1">
                  <CardHeader className="p-0">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {section.label}
                      {!section.href && (
                        <Badge variant="outline" className="font-normal text-muted-foreground">
                          Coming soon
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                </div>
                {section.href && (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
              </CardContent>
            </Card>
          );

          return section.href ? (
            <Link key={section.key} href={section.href}>
              {body}
            </Link>
          ) : (
            <div key={section.key} className="opacity-60">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
