import type { Db } from "../db/family-client";
import type { CurrencyRow } from "../repositories/currencies";
import { createCurrency } from "../use-cases/currencies";
import { createCurrencySchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function createCurrencyCore(db: Db, input: unknown): ActionResult<CurrencyRow> {
  const parsed = createCurrencySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createCurrency(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}
