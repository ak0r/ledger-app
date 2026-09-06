import type { Classification } from "../../shared/accountTypes";

// Normal balance side by classification (standard double-entry
// convention): ASSET/EXPENSE increase on the debit side; LIABILITY/
// INCOME/BALANCING increase on the credit side. Presenting a balance
// against its own normal side keeps it a positive, intuitive number (e.g.
// a credit card's balance owed, income accumulated) instead of a sign
// that flips depending on classification.
const DEBIT_NORMAL: ReadonlySet<Classification> = new Set(["ASSET", "EXPENSE"]);

export function isDebitNormal(classification: Classification): boolean {
  return DEBIT_NORMAL.has(classification);
}

export function accountBalance(
  classification: Classification,
  totalDebit: number,
  totalCredit: number,
): number {
  return isDebitNormal(classification) ? totalDebit - totalCredit : totalCredit - totalDebit;
}
