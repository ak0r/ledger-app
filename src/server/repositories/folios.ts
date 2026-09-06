import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { folios, portfolioAccounts } from "../persistence/schema";

export type FolioRow = typeof folios.$inferSelect;

export function insertFolio(db: DbOrTx, row: FolioRow): void {
  db.insert(folios).values(row).run();
}

export function findFoliosByPortfolioAccount(db: DbOrTx, portfolioAccountId: string): FolioRow[] {
  return db.select().from(folios).where(eq(folios.portfolioAccountId, portfolioAccountId)).all();
}

// Profile-scoped via the `portfolio_accounts` join (rule #6) — `folios`
// itself carries no `profile_id` column, same posture as
// `account_identifiers` (repositories/accountIdentifiers.ts).
export function findFolioById(db: DbOrTx, id: string, profileId: string): FolioRow | undefined {
  return db
    .select({
      id: folios.id,
      portfolioAccountId: folios.portfolioAccountId,
      number: folios.number,
      amcCode: folios.amcCode,
      createdAt: folios.createdAt,
      updatedAt: folios.updatedAt,
    })
    .from(folios)
    .innerJoin(portfolioAccounts, eq(folios.portfolioAccountId, portfolioAccounts.id))
    .where(and(eq(folios.id, id), eq(portfolioAccounts.profileId, profileId)))
    .get();
}

export function findFoliosByProfile(db: DbOrTx, profileId: string): FolioRow[] {
  return db
    .select({
      id: folios.id,
      portfolioAccountId: folios.portfolioAccountId,
      number: folios.number,
      amcCode: folios.amcCode,
      createdAt: folios.createdAt,
      updatedAt: folios.updatedAt,
    })
    .from(folios)
    .innerJoin(portfolioAccounts, eq(folios.portfolioAccountId, portfolioAccounts.id))
    .where(eq(portfolioAccounts.profileId, profileId))
    .all();
}
