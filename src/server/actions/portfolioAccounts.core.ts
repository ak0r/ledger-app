import type { Db } from "../persistence/client";
import type { PortfolioAccountRow } from "../repositories/portfolioAccounts";
import { createPortfolioAccount } from "../services/portfolioAccounts";
import { createPortfolioAccountSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function createPortfolioAccountCore(db: Db, input: unknown): ActionResult<PortfolioAccountRow> {
  const parsed = createPortfolioAccountSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createPortfolioAccount(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}
