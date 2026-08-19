import type { Db } from "./db/family-client";
import { getMember, listMembers } from "./use-cases/members";

// Where to land inside a Family once it's the active one (docs/onboarding.md
// §9: "Existing Family → Primary Member → Dashboard"). The Member cookie
// (when given and still valid) wins first — it's the more specific "where
// you personally left off," e.g. a non-primary Member you were actively
// using — then the durable Primary Member, then the Member picker/setup
// flow if neither resolves (no Member exists yet, or none is primary yet:
// onboarding.md §12's FAMILY_CREATED / mid-setup states, fully derived from
// data rather than a persisted flag — see the approved plan's B7).
export function resolveFamilyEntryPath(
  db: Db,
  familyId: string,
  memberCookieId?: string,
): string {
  if (memberCookieId && getMember(db, memberCookieId)) {
    return `/f/${familyId}/m/${memberCookieId}`;
  }

  const primary = listMembers(db).find((member) => member.isPrimary);
  if (primary) return `/f/${familyId}/m/${primary.id}`;

  return `/f/${familyId}/members`;
}
