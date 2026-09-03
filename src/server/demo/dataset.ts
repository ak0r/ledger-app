// Native demo content (docs/onboarding.md §4) — pure data construction, no
// DB access. Names/categories are inspired by docs/demo-data/accounts.json
// (a FinBodhi export the user confirmed is "inspiration only," not a
// literal import source — its schema is foreign and includes modules with
// no Ledger equivalent). Investment-type accounts (stocks/mutual funds/
// metals) from that reference are deliberately dropped: docs/05-mvp-scope.md
// excludes Investments/Stock/Metal accounts, and AGENTS.md rule #11 freezes
// instrument types to the seven used below — this dataset stays entirely
// inside that frozen set (resolved conflict, see the approved plan).
//
// 2026-08-20 User Simplification delta: trimmed to single-Profile scope —
// the demo dataset used to build two Members (a household) inside one
// Family; that container no longer exists, and demo data now seeds into
// one already-existing Profile at /setup time, not a
// multi-person household.
import {
  budgetPeriodWindowAt,
  toMinorUnits,
  validateTransaction,
  type AccountRef,
  type BudgetRecurrenceSchedule,
  type Classification,
  type InstrumentType,
} from "@/domain";
import type { CurrencyRow } from "../repositories/currencies";
import type { AccountRow } from "../repositories/accounts";
import type { TransactionRow, PostingRow } from "../repositories/transactions";
import type { RecurringRuleRow } from "../repositories/recurringRules";
import type { BudgetRow } from "../repositories/budgets";
import type { BudgetPeriodRow } from "../repositories/budgetPeriods";
import type { BudgetAllocationRow } from "../repositories/budgetAllocations";

const SCALE = 2; // INR minor units — matches createInrCurrencyAction.

export interface DemoDataset {
  currencies: CurrencyRow[];
  accounts: AccountRow[];
  transactions: TransactionRow[];
  postings: PostingRow[];
  // Recurring Transactions Phase 1 / Budget Framework deltas — definitions
  // only, same posture as the transactions above: these never generate or
  // post anything themselves (rule: a Recurring Rule/Budget Period never
  // touches the Ledger). Included so demo data actually showcases both
  // deltas instead of only the plain transaction history that predates them.
  recurringRules: RecurringRuleRow[];
  budgets: BudgetRow[];
  budgetPeriods: BudgetPeriodRow[];
  budgetAllocations: BudgetAllocationRow[];
}

// Deterministic PRNG (mulberry32) — reproducible amount/category jitter
// across runs and in tests, no new dependency, nothing security-sensitive.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function money(rupees: number): number {
  return toMinorUnits(rupees, SCALE);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface AccountSpec {
  key: string;
  name: string;
  classification: Classification;
  instrumentType: InstrumentType;
}

const ACCOUNT_SPECS: AccountSpec[] = [
  { key: "bank1", name: "HDFC Bank", classification: "ASSET", instrumentType: "BANK" },
  { key: "bank2", name: "SBI Bank", classification: "ASSET", instrumentType: "BANK" },
  { key: "epf", name: "EPF", classification: "ASSET", instrumentType: "CASH" },
  { key: "fd", name: "Fixed Deposit", classification: "ASSET", instrumentType: "CASH" },
  { key: "homeLoan", name: "Home Loan", classification: "LIABILITY", instrumentType: "LOAN" },
  { key: "creditCard", name: "Credit Card", classification: "LIABILITY", instrumentType: "CREDIT_CARD" },
  { key: "salary", name: "Salary", classification: "INCOME", instrumentType: "INCOME" },
  { key: "freelance", name: "Freelance Income", classification: "INCOME", instrumentType: "INCOME" },
  { key: "interest", name: "Interest Income", classification: "INCOME", instrumentType: "INCOME" },
  { key: "food", name: "Food", classification: "EXPENSE", instrumentType: "EXPENSE" },
  { key: "rent", name: "Rent", classification: "EXPENSE", instrumentType: "EXPENSE" },
  { key: "utilities", name: "Utilities", classification: "EXPENSE", instrumentType: "EXPENSE" },
  { key: "shopping", name: "Shopping", classification: "EXPENSE", instrumentType: "EXPENSE" },
  { key: "restaurants", name: "Restaurants", classification: "EXPENSE", instrumentType: "EXPENSE" },
  { key: "transport", name: "Transport", classification: "EXPENSE", instrumentType: "EXPENSE" },
  { key: "healthcare", name: "Healthcare", classification: "EXPENSE", instrumentType: "EXPENSE" },
  { key: "entertainment", name: "Entertainment", classification: "EXPENSE", instrumentType: "EXPENSE" },
  { key: "homeLoanInterest", name: "Home Loan Interest", classification: "EXPENSE", instrumentType: "EXPENSE" },
  { key: "balancing", name: "Opening Balance", classification: "BALANCING", instrumentType: "BALANCING" },
];

const CC_CATEGORIES = [
  "food",
  "shopping",
  "restaurants",
  "utilities",
  "transport",
  "healthcare",
  "entertainment",
] as const;
const CC_AMOUNT_RANGE: Record<(typeof CC_CATEGORIES)[number], [number, number]> = {
  food: [100, 400],
  shopping: [200, 2000],
  restaurants: [300, 1200],
  utilities: [600, 1800],
  transport: [40, 300],
  healthcare: [150, 1400],
  entertainment: [150, 1000],
};

function randomInRange(rand: () => number, [min, max]: [number, number]): number {
  return Math.round(min + rand() * (max - min));
}

class DatasetBuilder {
  transactions: TransactionRow[] = [];
  postings: PostingRow[] = [];

  constructor(private readonly now: string) {}

  private buildRow(
    profileId: string,
    date: string,
    description: string,
    legs: { accountId: string; debit: number; credit: number }[],
    tags: string[] | null,
  ): void {
    const transactionId = crypto.randomUUID();
    for (const leg of legs) {
      this.postings.push({
        id: crypto.randomUUID(),
        transactionId,
        accountId: leg.accountId,
        debit: leg.debit,
        credit: leg.credit,
        createdAt: this.now,
        updatedAt: this.now,
      });
    }
    this.transactions.push({
      id: transactionId,
      profileId,
      date,
      description,
      tags,
      importFileId: null,
      createdAt: this.now,
      updatedAt: this.now,
    });
  }

  // From is credited the full amount, To is debited the full amount — same
  // convention as TransactionForm's Simple mode (src/components/
  // transaction-form.tsx): expense = From an Asset/Liability, To an
  // Expense; income = From an Income account, To an Asset.
  simple(
    profileId: string,
    date: string,
    description: string,
    fromAccountId: string,
    toAccountId: string,
    amountMinor: number,
    tags: string[] | null = null,
  ): void {
    this.buildRow(
      profileId,
      date,
      description,
      [
        { accountId: fromAccountId, debit: 0, credit: amountMinor },
        { accountId: toAccountId, debit: amountMinor, credit: 0 },
      ],
      tags,
    );
  }

  // Same From-credited convention, N debited destinations — Split mode's
  // shape (e.g. an EMI: principal to the Loan account, interest to an
  // Expense account, both from the same Bank payment).
  split(
    profileId: string,
    date: string,
    description: string,
    fromAccountId: string,
    toLines: { accountId: string; amountMinor: number }[],
    tags: string[] | null = null,
  ): void {
    const total = toLines.reduce((sum, line) => sum + line.amountMinor, 0);
    this.buildRow(
      profileId,
      date,
      description,
      [
        { accountId: fromAccountId, debit: 0, credit: total },
        ...toLines.map((line) => ({ accountId: line.accountId, debit: line.amountMinor, credit: 0 })),
      ],
      tags,
    );
  }
}

// One year ago, matching the opening-balance/EMI-history anchor above —
// these rules describe a pattern that's already been running for that year.
function buildDemoRecurringRules(profileId: string, acc: Map<string, AccountRow>, anchorDate: string, now: string): RecurringRuleRow[] {
  return [
    {
      id: crypto.randomUUID(),
      profileId,
      name: "Rent",
      fromAccountId: acc.get("bank1")!.id,
      toAccountId: acc.get("rent")!.id,
      amountMinor: money(25000),
      description: "Rent",
      frequency: "MONTHLY",
      interval: 1,
      byMonthDay: 1,
      byWeekday: null,
      startDate: anchorDate,
      endDate: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      profileId,
      name: "Home Loan Interest",
      fromAccountId: acc.get("bank1")!.id,
      toAccountId: acc.get("homeLoanInterest")!.id,
      amountMinor: money(7200),
      description: "Home Loan Interest",
      frequency: "MONTHLY",
      interval: 1,
      byMonthDay: 1,
      byWeekday: null,
      startDate: anchorDate,
      endDate: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

// A Recurring Budget covering the current calendar month, so its one
// Period lines up with the real transaction history already generated for
// "this month" and shows non-zero actuals immediately (spec: Budget
// Framework delta §5/§11 — the Period's own scope snapshot, computed the
// same way createBudget would).
function buildDemoBudget(
  profileId: string,
  acc: Map<string, AccountRow>,
  now: Date,
  nowIso: string,
): { budget: BudgetRow; period: BudgetPeriodRow; allocations: BudgetAllocationRow[] } {
  const schedule: BudgetRecurrenceSchedule = {
    unit: "MONTH",
    interval: 1,
    startDate: isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
  };
  const window = budgetPeriodWindowAt(schedule, 0);

  const budget: BudgetRow = {
    id: crypto.randomUUID(),
    profileId,
    name: "Food Expenses",
    type: "RECURRING",
    recurrenceUnit: schedule.unit,
    recurrenceInterval: schedule.interval,
    recurrenceStartDate: schedule.startDate,
    recurrenceEndDate: null,
    recurrenceOccurrences: null,
    explicitAccountIds: [acc.get("food")!.id, acc.get("restaurants")!.id],
    filterMatch: "ALL",
    filterConditions: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const period: BudgetPeriodRow = {
    id: crypto.randomUUID(),
    budgetId: budget.id,
    startDate: window.startDate,
    endDate: window.endDate,
    scopeSnapshot: { explicitAccountIds: budget.explicitAccountIds!, filter: { match: "ALL", conditions: [] } },
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const allocations: BudgetAllocationRow[] = [
    { id: crypto.randomUUID(), budgetPeriodId: period.id, expenseAccountId: acc.get("food")!.id, targetAmountMinor: money(15000), createdAt: nowIso, updatedAt: nowIso },
    { id: crypto.randomUUID(), budgetPeriodId: period.id, expenseAccountId: acc.get("restaurants")!.id, targetAmountMinor: money(8000), createdAt: nowIso, updatedAt: nowIso },
  ];

  return { budget, period, allocations };
}

function buildCurrency(profileId: string, now: string): CurrencyRow {
  return {
    id: crypto.randomUUID(),
    profileId,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: SCALE,
    createdAt: now,
    updatedAt: now,
  };
}

function buildAccounts(
  profileId: string,
  currencyId: string,
  specs: AccountSpec[],
  now: string,
): { accounts: AccountRow[]; byKey: Map<string, AccountRow> } {
  const accounts = specs.map(
    (spec): AccountRow => ({
      id: crypto.randomUUID(),
      profileId,
      currencyId,
      name: spec.name,
      classification: spec.classification,
      instrumentType: spec.instrumentType,
      instrumentId: null,
      instrumentLabel: null,
      tags: null,
      icon: null,
      isArchived: false,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    }),
  );
  return { accounts, byKey: new Map(specs.map((spec, i) => [spec.key, accounts[i]])) };
}

// Builds a full demo dataset for one already-existing Profile: 1 INR
// Currency, realistic Accounts within the frozen classification/
// instrument-type set, and ~1 year of transactions covering income,
// expenses, transfers, credit card spend + payment, loan EMIs (as split
// transactions), interest, and tags (docs/onboarding.md §4.1's
// representative list, minus the explicitly-dropped investment types).
//
// `now`/`seed` are overridable for reproducible tests; production callers
// use the defaults (real current date, fixed seed — only dates are
// naturally different per call since they're anchored to real "now").
export function buildDemoDataset(profileId: string, now: Date = new Date(), seed = 42): DemoDataset {
  const rand = mulberry32(seed);
  const nowIso = now.toISOString();

  const currency = buildCurrency(profileId, nowIso);
  const { accounts, byKey: acc } = buildAccounts(profileId, currency.id, ACCOUNT_SPECS, nowIso);

  const builder = new DatasetBuilder(nowIso);
  const anchorDate = isoDate(new Date(now.getTime() - 365 * 86400000));

  // --- Opening balances (mirrors createAccount's own opening-balance
  // convention: post to the new account's normal-balance side, opposite
  // side to Balancing) ---
  builder.split(profileId, anchorDate, "Opening balance", acc.get("balancing")!.id, [
    { accountId: acc.get("bank1")!.id, amountMinor: money(90000) },
    { accountId: acc.get("bank2")!.id, amountMinor: money(20000) },
    { accountId: acc.get("epf")!.id, amountMinor: money(150000) },
    { accountId: acc.get("fd")!.id, amountMinor: money(200000) },
  ]);
  // Home Loan is a liability — its normal balance side is credit, so the
  // opening entry credits it directly and debits Balancing (rule #12: LOAN
  // is a plain liability ledger account only, matches this exactly).
  builder.simple(
    profileId,
    anchorDate,
    "Opening balance",
    acc.get("balancing")!.id,
    acc.get("homeLoan")!.id,
    money(2500000),
  );

  // --- Daily activity across the ~1 year window ---
  const DAYS = 365;
  let monthlyCardSpend = 0;

  for (let dayOffset = DAYS; dayOffset >= 0; dayOffset--) {
    const date = new Date(now.getTime() - dayOffset * 86400000);
    const dateStr = isoDate(date);
    const dayOfMonth = date.getDate();
    const isMonthStart = dayOfMonth === 1;

    // 2 credit-card spends/day across rotating categories.
    for (let i = 0; i < 2; i++) {
      const category = CC_CATEGORIES[(dayOffset * 2 + i) % CC_CATEGORIES.length];
      const [min, max] = CC_AMOUNT_RANGE[category];
      const amount = money(randomInRange(rand, [min, max]));
      monthlyCardSpend += amount;
      const tags =
        category === "food"
          ? [rand() > 0.5 ? "groceries" : "dining"]
          : category === "shopping" && rand() > 0.6
            ? ["electronics"]
            : null;
      builder.simple(
        profileId,
        dateStr,
        `${acc.get(category)!.name} purchase`,
        acc.get("creditCard")!.id,
        acc.get(category)!.id,
        amount,
        tags,
      );
    }

    // Monthly recurring items, anchored to the 1st of each month.
    if (isMonthStart) {
      builder.simple(profileId, dateStr, "Salary", acc.get("salary")!.id, acc.get("bank1")!.id, money(95000));
      if (rand() > 0.5) {
        builder.simple(
          profileId,
          dateStr,
          "Freelance payment",
          acc.get("freelance")!.id,
          acc.get("bank1")!.id,
          money(randomInRange(rand, [5000, 20000])),
        );
      }
      builder.simple(profileId, dateStr, "Rent", acc.get("bank1")!.id, acc.get("rent")!.id, money(25000));
      builder.split(
        profileId,
        dateStr,
        "Home Loan EMI",
        acc.get("bank1")!.id,
        [
          { accountId: acc.get("homeLoan")!.id, amountMinor: money(15000) },
          { accountId: acc.get("homeLoanInterest")!.id, amountMinor: money(7200) },
        ],
      );
      builder.simple(profileId, dateStr, "EPF contribution", acc.get("bank1")!.id, acc.get("epf")!.id, money(6000));
      if (monthlyCardSpend > 0) {
        builder.simple(
          profileId,
          dateStr,
          "Credit Card payment",
          acc.get("bank1")!.id,
          acc.get("creditCard")!.id,
          monthlyCardSpend,
        );
      }
      monthlyCardSpend = 0;

      // Occasional inter-bank transfer, alternating direction.
      const monthIndex = date.getMonth() + date.getFullYear() * 12;
      if (monthIndex % 2 === 0) {
        builder.simple(
          profileId,
          dateStr,
          "Transfer to SBI Bank",
          acc.get("bank1")!.id,
          acc.get("bank2")!.id,
          money(randomInRange(rand, [2000, 10000])),
        );
      } else {
        builder.simple(
          profileId,
          dateStr,
          "Transfer to HDFC Bank",
          acc.get("bank2")!.id,
          acc.get("bank1")!.id,
          money(randomInRange(rand, [2000, 10000])),
        );
      }
    }

    // Quarterly interest — FD and EPF, from Interest Income.
    if (isMonthStart && (date.getMonth() + 1) % 3 === 0) {
      builder.simple(profileId, dateStr, "FD interest", acc.get("interest")!.id, acc.get("fd")!.id, money(randomInRange(rand, [3000, 5000])));
      builder.simple(profileId, dateStr, "EPF interest", acc.get("interest")!.id, acc.get("epf")!.id, money(randomInRange(rand, [1500, 2500])));
    }
  }

  const recurringRules = buildDemoRecurringRules(profileId, acc, anchorDate, nowIso);
  const { budget, period, allocations } = buildDemoBudget(profileId, acc, now, nowIso);

  return {
    currencies: [currency],
    accounts,
    transactions: builder.transactions,
    postings: builder.postings,
    recurringRules,
    budgets: [budget],
    budgetPeriods: [period],
    budgetAllocations: allocations,
  };
}

// Every generated transaction must satisfy the same balance/ownership
// invariant as a real one (rule #3 has no demo exception). Used by the
// use-case layer as a belt-and-suspenders check before insert, and by unit
// tests to assert zero violations across the whole generated set.
export function validateDataset(dataset: DemoDataset): void {
  const accountRefs = new Map<string, AccountRef>(
    dataset.accounts.map((account) => {
      const currency = dataset.currencies.find((c) => c.id === account.currencyId)!;
      return [account.id, { id: account.id, profileId: account.profileId, currencyCode: currency.code }];
    }),
  );

  const postingsByTransaction = new Map<string, PostingRow[]>();
  for (const posting of dataset.postings) {
    const list = postingsByTransaction.get(posting.transactionId) ?? [];
    list.push(posting);
    postingsByTransaction.set(posting.transactionId, list);
  }

  for (const transaction of dataset.transactions) {
    const postings = postingsByTransaction.get(transaction.id) ?? [];
    const violations = validateTransaction(
      {
        profileId: transaction.profileId,
        postings: postings.map((p) => ({ accountId: p.accountId, debit: p.debit, credit: p.credit })),
      },
      accountRefs,
    );
    if (violations.length > 0) {
      throw new Error(
        `Demo transaction ${transaction.id} (${transaction.description}) failed validation: ${JSON.stringify(violations)}`,
      );
    }
  }
}
