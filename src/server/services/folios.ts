import type { Db } from "../persistence/client";
import {
  findFolioById,
  findFoliosByPortfolioAccount,
  findFoliosByProfile,
  insertFolio,
  type FolioRow,
} from "../repositories/folios";
import { getPortfolioAccount } from "./portfolioAccounts";
import { NotFoundError } from "./errors";

export interface CreateFolioInput {
  profileId: string;
  portfolioAccountId: string;
  number: string;
  amcCode?: string;
}

export function createFolio(db: Db, input: CreateFolioInput): FolioRow {
  // Confirms the PortfolioAccount belongs to this Profile before creating
  // a Folio under it — the only place `folios` gets Profile-scoped
  // (the table itself carries no `profile_id`, repositories/folios.ts).
  getPortfolioAccount(db, input.portfolioAccountId, input.profileId);

  const now = new Date().toISOString();
  const folio: FolioRow = {
    id: crypto.randomUUID(),
    portfolioAccountId: input.portfolioAccountId,
    number: input.number,
    amcCode: input.amcCode ?? null,
    createdAt: now,
    updatedAt: now,
  };
  insertFolio(db, folio);
  return folio;
}

export function listFolios(db: Db, portfolioAccountId: string): FolioRow[] {
  return findFoliosByPortfolioAccount(db, portfolioAccountId);
}

export function listFoliosForProfile(db: Db, profileId: string): FolioRow[] {
  return findFoliosByProfile(db, profileId);
}

export function getFolio(db: Db, id: string, profileId: string): FolioRow {
  const folio = findFolioById(db, id, profileId);
  if (!folio) {
    throw new NotFoundError(`Folio ${id} not found for profile ${profileId}`);
  }
  return folio;
}
