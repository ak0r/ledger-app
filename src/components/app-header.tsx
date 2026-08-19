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
import { activateFamilyAction } from "@/server/actions/activeFamily";
import { activateMemberAction } from "@/server/actions/activeMember";

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

// Header identity + switching (docs/design/design.md §5). Family/Member
// switching is a zero-JS server-action form underneath (mirrors the
// /families and /members picker pages) — each MenuItem renders (via the
// `render` prop, same composition pattern as ConfirmDialog's DialogClose)
// as the form's actual submit button, so Base UI's Menu supplies real
// keyboard navigation/focus management around a still-zero-JS submission.
// Desktop shows Family and Member as two separate menus; mobile collapses
// both into one compact trigger to keep the header light (§5 "Mobile: Keep
// header compact").
function FamilyItems({ familyId, families }: { familyId: string; families: Entry[] }) {
  return (
    <MenuGroup>
      <MenuGroupLabel>Family</MenuGroupLabel>
      {families.map((family) => (
        <form key={family.id} action={activateFamilyAction.bind(null, family.id)}>
          <MenuItem
            aria-current={family.id === familyId ? "true" : undefined}
            className={family.id === familyId ? "bg-accent text-accent-foreground" : undefined}
            nativeButton
            render={<button type="submit" className="w-full text-left" />}
          >
            {family.name}
          </MenuItem>
        </form>
      ))}
      <MenuItem render={<Link href="/families" className="text-muted-foreground" />}>
        Manage families
      </MenuItem>
    </MenuGroup>
  );
}

function MemberItems({
  familyId,
  memberId,
  members,
}: {
  familyId: string;
  memberId: string;
  members: Entry[];
}) {
  return (
    <MenuGroup>
      <MenuGroupLabel>Member</MenuGroupLabel>
      {members.map((member) => (
        <form key={member.id} action={activateMemberAction.bind(null, familyId, member.id)}>
          <MenuItem
            aria-current={member.id === memberId ? "true" : undefined}
            className={member.id === memberId ? "bg-accent text-accent-foreground" : undefined}
            nativeButton
            render={<button type="submit" className="w-full text-left" />}
          >
            {member.name}
          </MenuItem>
        </form>
      ))}
      <MenuItem
        render={<Link href={`/f/${familyId}/members`} className="text-muted-foreground" />}
      >
        Manage members
      </MenuItem>
    </MenuGroup>
  );
}

export function AppHeader({
  familyId,
  memberId,
  familyName,
  memberName,
  families,
  members,
}: {
  familyId: string;
  memberId: string;
  familyName: string;
  memberName: string;
  families: Entry[];
  members: Entry[];
}) {
  const base = `/f/${familyId}/m/${memberId}`;

  return (
    <header className="flex items-center justify-between border-b border-border px-3 py-2.5 sm:px-4 sm:py-3">
      <Link href={base} className="flex flex-col leading-tight">
        <span className="font-heading text-sm font-semibold sm:text-base">Ledger</span>
        <span className="text-[10px] text-muted-foreground sm:text-xs">v0.1.0</span>
      </Link>

      {/* Desktop: Family switcher, Member switcher, appearance — each its
          own trigger (docs/design/design.md §5 desktop example). */}
      <div className="hidden items-center gap-2 md:flex">
        <Menu>
          <MenuTrigger className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
            {familyName}
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </MenuTrigger>
          <MenuContent>
            <FamilyItems familyId={familyId} families={families} />
          </MenuContent>
        </Menu>

        <Menu>
          <MenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {initials(memberName)}
            </span>
            {memberName}
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </MenuTrigger>
          <MenuContent>
            <MemberItems familyId={familyId} memberId={memberId} members={members} />
          </MenuContent>
        </Menu>

        <ThemeToggle variant="icon" />
      </div>

      {/* Mobile: one compact trigger holds both switchers (§5 mobile
          example — "AK ˅" — family/member switching stays reachable
          without heavy header chrome). */}
      <div className="flex items-center gap-1 md:hidden">
        <ThemeToggle variant="icon" />
        <Menu>
          <MenuTrigger className="flex items-center gap-1 rounded-lg py-1.5 pl-1.5 pr-2 text-sm hover:bg-accent hover:text-accent-foreground">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {initials(memberName)}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </MenuTrigger>
          <MenuContent>
            <MemberItems familyId={familyId} memberId={memberId} members={members} />
            <MenuSeparator />
            <FamilyItems familyId={familyId} families={families} />
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}
