import type { Db } from "../persistence/client";
import { findPortfolioImportsByProfile, type PortfolioImportRow } from "../repositories/portfolioImports";

export function listPortfolioImports(db: Db, profileId: string): PortfolioImportRow[] {
  return [...findPortfolioImportsByProfile(db, profileId)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
