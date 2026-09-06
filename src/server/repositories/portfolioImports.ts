import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { portfolioImports } from "../persistence/schema";

export type PortfolioImportRow = typeof portfolioImports.$inferSelect;

export function insertPortfolioImport(db: DbOrTx, row: PortfolioImportRow): void {
  db.insert(portfolioImports).values(row).run();
}

export function updatePortfolioImportFields(
  db: DbOrTx,
  id: string,
  profileId: string,
  fields: Partial<PortfolioImportRow>,
): void {
  db
    .update(portfolioImports)
    .set(fields)
    .where(and(eq(portfolioImports.id, id), eq(portfolioImports.profileId, profileId)))
    .run();
}

export function findPortfolioImportsByProfile(db: DbOrTx, profileId: string): PortfolioImportRow[] {
  return db
    .select()
    .from(portfolioImports)
    .where(eq(portfolioImports.profileId, profileId))
    .all();
}

export function deleteAllPortfolioImports(db: DbOrTx, profileId: string): void {
  db.delete(portfolioImports).where(eq(portfolioImports.profileId, profileId)).run();
}
