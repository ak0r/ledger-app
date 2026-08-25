"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { activateProfileAction } from "@/server/actions/activeProfile";
import { logoutAction } from "@/server/actions/auth";

interface Entry {
  id: string;
  name: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

// Header identity + switching (docs/design/design.md §5). Profile switching
// is a zero-JS server-action form underneath (mirrors the /profiles picker
// page) — each MenuItem renders (via the `render` prop, same composition
// pattern as ConfirmDialog's DialogClose) as the form's actual submit
// button, so Base UI's Menu supplies real keyboard navigation/focus
// management around a still-zero-JS submission. Only the Primary User gets
// a switcher at all (2026-08-20 User Simplification delta) — a Normal
// AppUser has exactly one Profile, so `profiles` is omitted for them and
// this collapses to identity + log out.
function ProfileItems({ profileId, profiles }: { profileId: string; profiles: Entry[] }) {
  return (
    <MenuGroup>
      <MenuGroupLabel>Profile</MenuGroupLabel>
      {profiles.map((profile) => (
        <form key={profile.id} action={activateProfileAction.bind(null, profile.id)}>
          <MenuItem
            aria-current={profile.id === profileId ? "true" : undefined}
            className={profile.id === profileId ? "bg-accent text-accent-foreground" : undefined}
            nativeButton
            render={<button type="submit" className="w-full text-left" />}
          >
            {profile.name}
          </MenuItem>
        </form>
      ))}
      <MenuItem render={<Link href="/profiles" className="text-muted-foreground" />}>
        Manage profiles
      </MenuItem>
      <MenuSeparator />
      <form action={logoutAction}>
        <MenuItem nativeButton render={<button type="submit" className="w-full text-left" />}>
          Log out
        </MenuItem>
      </form>
    </MenuGroup>
  );
}

export function AppHeader({
  profileId,
  profileName,
  profiles,
}: {
  profileId: string;
  profileName: string;
  // Present (and possibly length-1) only for the Primary User; omitted
  // entirely for a Normal AppUser, who has nothing to switch between.
  profiles?: Entry[];
}) {
  const base = `/p/${profileId}`;

  return (
    <header className="flex items-center justify-between border-b border-border px-3 py-2.5 sm:px-4 sm:py-3">
      <Link href={base} className="flex flex-col leading-tight">
        <span className="font-heading text-sm font-semibold sm:text-base">Ledger</span>
        <span className="text-[10px] text-muted-foreground sm:text-xs">v0.1.0</span>
      </Link>

      {/* Desktop: Profile switcher (Primary only), appearance — Normal
          AppUsers get identity + log out (docs/design/design.md §5 desktop
          example). */}
      <div className="hidden items-center gap-2 md:flex">
        <Menu>
          <MenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {initials(profileName)}
            </span>
            {profileName}
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </MenuTrigger>
          <MenuContent>
            {profiles ? (
              <ProfileItems profileId={profileId} profiles={profiles} />
            ) : (
              <MenuGroup>
                <form action={logoutAction}>
                  <MenuItem nativeButton render={<button type="submit" className="w-full text-left" />}>
                    Log out
                  </MenuItem>
                </form>
              </MenuGroup>
            )}
          </MenuContent>
        </Menu>

        <ThemeToggle variant="icon" />
      </div>

      {/* Mobile: one compact trigger holds identity + switching (§5 mobile
          example — "AK ˅"). */}
      <div className="flex items-center gap-1 md:hidden">
        <ThemeToggle variant="icon" />
        <Menu>
          <MenuTrigger className="flex items-center gap-1 rounded-lg py-1.5 pl-1.5 pr-2 text-sm hover:bg-accent hover:text-accent-foreground">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {initials(profileName)}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </MenuTrigger>
          <MenuContent>
            {profiles ? (
              <ProfileItems profileId={profileId} profiles={profiles} />
            ) : (
              <MenuGroup>
                <form action={logoutAction}>
                  <MenuItem nativeButton render={<button type="submit" className="w-full text-left" />}>
                    Log out
                  </MenuItem>
                </form>
              </MenuGroup>
            )}
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}
