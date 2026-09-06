import type { InstrumentBackedType } from "@/core";
import type { Db } from "../persistence/client";
import {
  findPortfolioAccountById,
  findPortfolioAccountsByProfile,
  insertPortfolioAccount,
  type PortfolioAccountRow,
} from "../repositories/portfolioAccounts";
import { NotFoundError } from "./errors";

export interface CreatePortfolioAccountInput {
  profileId: string;
  name: string;
  type: InstrumentBackedType;
  provider?: string;
}

export function createPortfolioAccount(db: Db, input: CreatePortfolioAccountInput): PortfolioAccountRow {
  const now = new Date().toISOString();
  const account: PortfolioAccountRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    name: input.name,
    type: input.type,
    provider: input.provider ?? null,
    createdAt: now,
    updatedAt: now,
  };
  insertPortfolioAccount(db, account);
  return account;
}

export function listPortfolioAccounts(db: Db, profileId: string): PortfolioAccountRow[] {
  return findPortfolioAccountsByProfile(db, profileId);
}

export function getPortfolioAccount(db: Db, id: string, profileId: string): PortfolioAccountRow {
  const account = findPortfolioAccountById(db, id, profileId);
  if (!account) {
    throw new NotFoundError(`Portfolio Account ${id} not found for profile ${profileId}`);
  }
  return account;
}
