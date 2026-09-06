import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { portfolioAccounts } from "../persistence/schema";

export type PortfolioAccountRow = typeof portfolioAccounts.$inferSelect;

export function insertPortfolioAccount(db: DbOrTx, row: PortfolioAccountRow): void {
  db.insert(portfolioAccounts).values(row).run();
}

// Profile-scoped (rule #6).
export function findPortfolioAccountById(
  db: DbOrTx,
  id: string,
  profileId: string,
): PortfolioAccountRow | undefined {
  return db
    .select()
    .from(portfolioAccounts)
    .where(and(eq(portfolioAccounts.id, id), eq(portfolioAccounts.profileId, profileId)))
    .get();
}

export function findPortfolioAccountsByProfile(db: DbOrTx, profileId: string): PortfolioAccountRow[] {
  return db.select().from(portfolioAccounts).where(eq(portfolioAccounts.profileId, profileId)).all();
}

// Profile-scoped (rule #6) — same "Clean Up Content" posture as
// deleteAllAccounts in repositories/accounts.ts.
export function deleteAllPortfolioAccounts(db: DbOrTx, profileId: string): void {
  db.delete(portfolioAccounts).where(eq(portfolioAccounts.profileId, profileId)).run();
}
