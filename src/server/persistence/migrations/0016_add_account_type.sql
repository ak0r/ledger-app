ALTER TABLE `accounts` ADD `account_type` text;--> statement-breakpoint
-- Deterministic backfill from the legacy 7-value instrument_type taxonomy
-- (AGENTS.md rule #11) onto the new Account Type vocabulary. BANK/CASH/
-- CREDIT_CARD/LOAN carry over unchanged; EXPENSE/INCOME/BALANCING map to
-- their confirmed default bucket (VARIABLE/EARNED/INITIAL) — individually
-- re-classifiable afterward via the normal Account edit form.
UPDATE `accounts` SET `account_type` = CASE `instrument_type`
  WHEN 'BANK' THEN 'BANK'
  WHEN 'CASH' THEN 'CASH'
  WHEN 'CREDIT_CARD' THEN 'CREDIT_CARD'
  WHEN 'LOAN' THEN 'LOAN'
  WHEN 'EXPENSE' THEN 'VARIABLE'
  WHEN 'INCOME' THEN 'EARNED'
  WHEN 'BALANCING' THEN 'INITIAL'
END;