import type { Db } from "../db/family-client";
import {
  clearAllPrimaryMembers,
  findAllMembers,
  findMemberById,
  insertMember,
  setMemberPrimary,
  type MemberRow,
} from "../repositories/members";
import { NotFoundError } from "./errors";

export interface CreateMemberInput {
  name: string;
}

export function createMember(db: Db, input: CreateMemberInput): MemberRow {
  const now = new Date().toISOString();
  const member: MemberRow = {
    id: crypto.randomUUID(),
    name: input.name,
    isPrimary: false,
    createdAt: now,
    updatedAt: now,
  };
  insertMember(db, member);
  return member;
}

export function listMembers(db: Db): MemberRow[] {
  return findAllMembers(db);
}

export function getMember(db: Db, memberId: string): MemberRow | undefined {
  return findMemberById(db, memberId);
}

// Sets the durable Primary Member for this Family (docs/onboarding.md §7).
// Enforces "exactly one primary" by clearing any existing one first, inside
// one transaction — callers (the initial-setup flow) should only ever call
// this when none exists yet, but this stays correct even if that assumption
// is ever violated.
export function setPrimaryMember(db: Db, memberId: string): MemberRow {
  const member = findMemberById(db, memberId);
  if (!member) throw new NotFoundError(`Member not found: ${memberId}`);

  const now = new Date().toISOString();
  db.transaction((tx) => {
    clearAllPrimaryMembers(tx, now);
    setMemberPrimary(tx, memberId, now);
  });

  return { ...member, isPrimary: true, updatedAt: now };
}
