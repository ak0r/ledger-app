import type { Db } from "../persistence/client";
import type { CurrencyRow } from "../repositories/currencies";
import { addCurrencyFromCatalog, createCurrency } from "../services/currencies";
import { addCurrencySchema, createCurrencySchema } from "./schemas";
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

export function addCurrencyCore(db: Db, input: unknown): ActionResult<CurrencyRow> {
  const parsed = addCurrencySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(addCurrencyFromCatalog(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}
