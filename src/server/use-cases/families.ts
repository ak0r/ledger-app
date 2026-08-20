import type { AppDb } from "../db/app-client";
import {
  deleteFamilyRow,
  findAllFamilies,
  findFamilyById,
  insertFamily,
  updateFamilyName,
  type FamilyRow,
} from "../repositories/families";
import { NotFoundError } from "./errors";

export interface CreateFamilyInput {
  name: string;
}

export function createFamily(db: AppDb, appUserId: string, input: CreateFamilyInput): FamilyRow {
  const now = new Date().toISOString();
  const family: FamilyRow = {
    id: crypto.randomUUID(),
    appUserId,
    name: input.name,
    createdAt: now,
    updatedAt: now,
  };
  insertFamily(db, family);
  return family;
}

export function listFamilies(db: AppDb, appUserId: string): FamilyRow[] {
  return findAllFamilies(db, appUserId);
}

export function getFamily(db: AppDb, appUserId: string, familyId: string): FamilyRow | undefined {
  return findFamilyById(db, familyId, appUserId);
}

export function renameFamily(db: AppDb, appUserId: string, familyId: string, name: string): FamilyRow {
  const family = findFamilyById(db, familyId, appUserId);
  if (!family) throw new NotFoundError(`Family not found: ${familyId}`);
  const updatedAt = new Date().toISOString();
  updateFamilyName(db, familyId, appUserId, name, updatedAt);
  return { ...family, name, updatedAt };
}

// Removes the app.db entry only — the caller (deleteFamilyAction) is
// responsible for evicting/deleting the physical isolated dataset via
// evictFamilyDb, since that's a family-client concern, not an app.db one
// (mirrors how provisionFamilyDb/createFamilyAndActivateAction already
// split "app.db row" from "dataset file" at creation time).
export function deleteFamily(db: AppDb, appUserId: string, familyId: string): void {
  const family = findFamilyById(db, familyId, appUserId);
  if (!family) throw new NotFoundError(`Family not found: ${familyId}`);
  deleteFamilyRow(db, familyId, appUserId);
}
