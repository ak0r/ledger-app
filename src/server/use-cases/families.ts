import type { RegistryDb } from "../db/registry-client";
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

export function createFamily(db: RegistryDb, input: CreateFamilyInput): FamilyRow {
  const now = new Date().toISOString();
  const family: FamilyRow = {
    id: crypto.randomUUID(),
    name: input.name,
    createdAt: now,
    updatedAt: now,
  };
  insertFamily(db, family);
  return family;
}

export function listFamilies(db: RegistryDb): FamilyRow[] {
  return findAllFamilies(db);
}

export function getFamily(db: RegistryDb, familyId: string): FamilyRow | undefined {
  return findFamilyById(db, familyId);
}

export function renameFamily(db: RegistryDb, familyId: string, name: string): FamilyRow {
  const family = findFamilyById(db, familyId);
  if (!family) throw new NotFoundError(`Family not found: ${familyId}`);
  const updatedAt = new Date().toISOString();
  updateFamilyName(db, familyId, name, updatedAt);
  return { ...family, name, updatedAt };
}

// Removes the registry entry only — the caller (deleteFamilyAction) is
// responsible for evicting/deleting the physical isolated dataset via
// evictFamilyDb, since that's a family-client concern, not a registry one
// (mirrors how provisionFamilyDb/createFamilyAndActivateAction already
// split "registry row" from "dataset file" at creation time).
export function deleteFamily(db: RegistryDb, familyId: string): void {
  const family = findFamilyById(db, familyId);
  if (!family) throw new NotFoundError(`Family not found: ${familyId}`);
  deleteFamilyRow(db, familyId);
}
