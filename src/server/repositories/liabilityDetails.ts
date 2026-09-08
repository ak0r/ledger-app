import { eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { creditCardDetails, loanDetails } from "../persistence/schema";

export type CreditCardDetailsRow = typeof creditCardDetails.$inferSelect;
export type LoanDetailsRow = typeof loanDetails.$inferSelect;

export function findCreditCardDetailsByAccountId(db: DbOrTx, accountId: string): CreditCardDetailsRow | undefined {
  return db.select().from(creditCardDetails).where(eq(creditCardDetails.accountId, accountId)).get();
}

export function upsertCreditCardDetailsRow(db: DbOrTx, row: CreditCardDetailsRow): void {
  db
    .insert(creditCardDetails)
    .values(row)
    .onConflictDoUpdate({
      target: creditCardDetails.accountId,
      set: {
        creditLimitMinor: row.creditLimitMinor,
        statementEndDay: row.statementEndDay,
        dueDay: row.dueDay,
        network: row.network,
        last4: row.last4,
        expirationDate: row.expirationDate,
        updatedAt: row.updatedAt,
      },
    })
    .run();
}

export function findLoanDetailsByAccountId(db: DbOrTx, accountId: string): LoanDetailsRow | undefined {
  return db.select().from(loanDetails).where(eq(loanDetails.accountId, accountId)).get();
}

export function upsertLoanDetailsRow(db: DbOrTx, row: LoanDetailsRow): void {
  db
    .insert(loanDetails)
    .values(row)
    .onConflictDoUpdate({
      target: loanDetails.accountId,
      set: {
        originalAmountMinor: row.originalAmountMinor,
        disbursedAmountMinor: row.disbursedAmountMinor,
        interestRateBps: row.interestRateBps,
        tenureMonths: row.tenureMonths,
        emiAmountMinor: row.emiAmountMinor,
        emiDay: row.emiDay,
        startDate: row.startDate,
        maturityDate: row.maturityDate,
        updatedAt: row.updatedAt,
      },
    })
    .run();
}
