import { getFamilyDb } from "@/server/db/family-client";
import { listMembers } from "@/server/use-cases/members";
import {
  activateMemberAction,
  finalizePrimaryMemberAction,
  finalizePrimaryMemberFromFormAction,
} from "@/server/actions/activeMember";
import { createDefaultMemberAction } from "@/server/actions/members";
import { DEFAULT_MEMBER_NAME } from "@/server/use-cases/members";
import { MemberForm } from "@/components/member-form";
import { MemberCreateDialog } from "@/components/member-create-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Always shows the full picker — never auto-redirects like "/" does — so
// there's a real way back to switch Members after one is already active.
export default async function MembersPage(props: PageProps<"/f/[familyId]/members">) {
  const { familyId } = await props.params;
  const db = getFamilyDb(familyId);
  const members = listMembers(db);
  const hasPrimary = members.some((m) => m.isPrimary);

  // Steady state (docs/onboarding.md §9: an already-onboarded Family) —
  // unchanged behavior: switch or add another, straight into their
  // dashboard either way.
  if (hasPrimary) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
        <div>
          <h1 className="text-xl font-semibold">Choose a Member</h1>
          <p className="text-sm text-muted-foreground">
            Members are local financial profiles — no login needed.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li key={member.id}>
              <form action={activateMemberAction.bind(null, familyId, member.id)}>
                <Button type="submit" variant="outline" className="w-full justify-start">
                  {member.name}
                </Button>
              </form>
            </li>
          ))}
        </ul>

        <MemberCreateDialog
          familyId={familyId}
          trigger={<Button variant="outline">Add another Member</Button>}
        />
      </main>
    );
  }

  // Initial setup (docs/onboarding.md §6/§7) — no Member is primary yet.
  // Only reachable via the Start-from-Scratch path off /f/[familyId]/setup,
  // or a resumed/interrupted attempt (Family created, setup never
  // finished). Adding a Member here stays on the page instead of jumping
  // into their dashboard, so more than one can be added before continuing.
  const isFirstMember = members.length === 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">
          {isFirstMember ? "Welcome to Ledger" : "Family Members"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isFirstMember
            ? "Create your first Member to get started."
            : "Add more Members, or continue with what you have."}
        </p>
      </div>

      {members.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {members.map((member) => (
            <li key={member.id} className="rounded-lg border border-border px-3 py-2">
              {member.name}
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isFirstMember ? "Create your first Member" : "Add another Member"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <MemberForm familyId={familyId} submitLabel="Add Member" mode="add" />
          <form action={createDefaultMemberAction.bind(null, familyId)}>
            <Button type="submit" variant="secondary" className="w-full">
              Use a default name ({DEFAULT_MEMBER_NAME})
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Single Member: auto-primary, no extra question (docs/onboarding.md
          §7 "One Member"). */}
      {members.length === 1 && (
        <form action={finalizePrimaryMemberAction.bind(null, familyId, members[0].id)}>
          <Button type="submit" className="w-full">
            Continue
          </Button>
        </form>
      )}

      {/* Multiple Members: explicit choice (docs/onboarding.md §7
          "Multiple Members"). */}
      {members.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Who is the primary Member?</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={finalizePrimaryMemberFromFormAction.bind(null, familyId)}
              className="flex flex-col gap-3"
            >
              {members.map((member, index) => (
                <label key={member.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="memberId"
                    value={member.id}
                    defaultChecked={index === 0}
                    required
                  />
                  {member.name}
                </label>
              ))}
              <Button type="submit">Continue</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
