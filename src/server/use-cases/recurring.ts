import { nextOccurrence, validateRecurringRule, type RecurringFrequency, type RecurringSchedule } from "@/domain";
import type { Db } from "../db/client";
import { findAccountRefs } from "../repositories/accounts";
import {
  deleteRecurringRuleRow,
  findRecurringRuleById,
  findRecurringRulesByProfile,
  insertRecurringRule,
  updateRecurringRuleFields,
  type RecurringRuleRow,
} from "../repositories/recurringRules";
import { NotFoundError, RecurringRuleValidationError } from "./errors";

function toSchedule(row: {
  frequency: RecurringFrequency;
  interval: number;
  byMonthDay: number | null;
  byWeekday: number | null;
  startDate: string;
  endDate: string | null;
}): RecurringSchedule {
  return {
    frequency: row.frequency,
    interval: row.interval,
    byMonthDay: row.byMonthDay,
    byWeekday: row.byWeekday,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

// Validates against the Phase 1 domain layer before touching the DB (rule
// #17), same posture as assertBalanced in use-cases/transactions.ts.
function assertValid(
  db: Db,
  input: {
    profileId: string;
    name: string;
    fromAccountId: string;
    toAccountId: string;
    amountMinor: number;
    description: string;
    schedule: RecurringSchedule;
  },
): void {
  const accounts = findAccountRefs(db, [input.fromAccountId, input.toAccountId]);
  const violations = validateRecurringRule(
    {
      profileId: input.profileId,
      name: input.name,
      template: {
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amountMinor: input.amountMinor,
        description: input.description,
      },
      schedule: input.schedule,
    },
    accounts,
  );
  if (violations.length > 0) {
    throw new RecurringRuleValidationError(violations);
  }
}

export interface RecurringRuleScheduleInput {
  frequency: RecurringFrequency;
  interval: number;
  byMonthDay?: number | null;
  byWeekday?: number | null;
  startDate: string;
  endDate?: string | null;
}

export interface CreateRecurringRuleInput {
  profileId: string;
  name: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  description: string;
  schedule: RecurringRuleScheduleInput;
}

export function createRecurringRule(db: Db, input: CreateRecurringRuleInput): RecurringRuleRow {
  const schedule: RecurringSchedule = {
    frequency: input.schedule.frequency,
    interval: input.schedule.interval,
    byMonthDay: input.schedule.byMonthDay ?? null,
    byWeekday: input.schedule.byWeekday ?? null,
    startDate: input.schedule.startDate,
    endDate: input.schedule.endDate ?? null,
  };
  assertValid(db, { ...input, schedule });

  const now = new Date().toISOString();
  const rule: RecurringRuleRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    name: input.name,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amountMinor: input.amountMinor,
    description: input.description,
    frequency: schedule.frequency,
    interval: schedule.interval,
    byMonthDay: schedule.byMonthDay ?? null,
    byWeekday: schedule.byWeekday ?? null,
    startDate: schedule.startDate,
    endDate: schedule.endDate ?? null,
    createdAt: now,
    updatedAt: now,
  };
  insertRecurringRule(db, rule);
  return rule;
}

export interface EditRecurringRuleInput extends CreateRecurringRuleInput {
  recurringRuleId: string;
}

export function editRecurringRule(db: Db, input: EditRecurringRuleInput): RecurringRuleRow {
  const existing = findRecurringRuleById(db, input.recurringRuleId, input.profileId);
  if (!existing) {
    throw new NotFoundError(`Recurring rule ${input.recurringRuleId} not found for profile ${input.profileId}`);
  }

  const schedule: RecurringSchedule = {
    frequency: input.schedule.frequency,
    interval: input.schedule.interval,
    byMonthDay: input.schedule.byMonthDay ?? null,
    byWeekday: input.schedule.byWeekday ?? null,
    startDate: input.schedule.startDate,
    endDate: input.schedule.endDate ?? null,
  };
  assertValid(db, { ...input, schedule });

  const now = new Date().toISOString();
  const fields = {
    name: input.name,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amountMinor: input.amountMinor,
    description: input.description,
    frequency: schedule.frequency,
    interval: schedule.interval,
    byMonthDay: schedule.byMonthDay ?? null,
    byWeekday: schedule.byWeekday ?? null,
    startDate: schedule.startDate,
    endDate: schedule.endDate ?? null,
    updatedAt: now,
  };
  updateRecurringRuleFields(db, input.recurringRuleId, input.profileId, fields);
  return { ...existing, ...fields };
}

export interface DeleteRecurringRuleInput {
  recurringRuleId: string;
  profileId: string;
}

export function deleteRecurringRule(db: Db, input: DeleteRecurringRuleInput): void {
  const existing = findRecurringRuleById(db, input.recurringRuleId, input.profileId);
  if (!existing) {
    throw new NotFoundError(`Recurring rule ${input.recurringRuleId} not found for profile ${input.profileId}`);
  }
  deleteRecurringRuleRow(db, input.recurringRuleId, input.profileId);
}

export function getRecurringRule(db: Db, recurringRuleId: string, profileId: string): RecurringRuleRow | undefined {
  return findRecurringRuleById(db, recurringRuleId, profileId);
}

export function listRecurringRules(db: Db, profileId: string): RecurringRuleRow[] {
  return findRecurringRulesByProfile(db, profileId);
}

export interface RecurringRuleWithNextDue extends RecurringRuleRow {
  // null once the schedule has already ended (docs/pending/2026-08-27-
  // Recurring-Transactions.md §7's Rules table still needs a row to show
  // "Ended" for, so this isn't filtered out here).
  nextDue: string | null;
}

// Derived on read, never persisted (Phase 1 has no automation to keep a
// cached "next due" column fresh against — see domain/recurring.ts).
// `today` is injectable for tests, same pattern as resolveInsightsRange.
export function listRecurringRulesWithNextDue(
  db: Db,
  profileId: string,
  today: Date = new Date(),
): RecurringRuleWithNextDue[] {
  return findRecurringRulesByProfile(db, profileId).map((rule) => ({
    ...rule,
    nextDue: nextOccurrence(toSchedule(rule), today),
  }));
}
