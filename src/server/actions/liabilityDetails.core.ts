import type { Db } from "../persistence/client";
import {
  getCreditCardDetails,
  getLoanDetails,
  upsertCreditCardDetails,
  upsertLoanDetails,
  type CreditCardDetails,
  type LoanDetails,
} from "../services/liabilityDetails";
import { upsertCreditCardDetailsSchema, upsertLoanDetailsSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function upsertCreditCardDetailsCore(db: Db, input: unknown): ActionResult<CreditCardDetails> {
  const parsed = upsertCreditCardDetailsSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(upsertCreditCardDetails(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function getCreditCardDetailsCore(db: Db, accountId: string, profileId: string): CreditCardDetails | undefined {
  return getCreditCardDetails(db, accountId, profileId);
}

export function upsertLoanDetailsCore(db: Db, input: unknown): ActionResult<LoanDetails> {
  const parsed = upsertLoanDetailsSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(upsertLoanDetails(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function getLoanDetailsCore(db: Db, accountId: string, profileId: string): LoanDetails | undefined {
  return getLoanDetails(db, accountId, profileId);
}
