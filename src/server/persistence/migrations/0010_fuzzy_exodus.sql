ALTER TABLE `postings` ADD `quantity` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `postings` ADD `price` real DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Backfill (Revised Investment Model delta, 2026-09-03): every existing
-- posting predates the quantity/price concept, so `price` stays at its
-- column default of 1 for all of them — correct because no persisted
-- transaction currently spans more than one currency (verified against
-- the real data before writing this migration; a real Currency
-- Conversion row, if any exist by the time this runs elsewhere, would
-- need `price` computed as the real cross-leg ratio instead of 1, which
-- this backfill does not attempt). `quantity` is set to each posting's
-- own decimal amount, in its own account's Currency scale, expressed at
-- the fixed 6-decimal Quantity scale (domain/quantity.ts) — numerically
-- identical to that leg's existing debit-or-credit amount for every
-- posting, since no Instrument postings exist yet either. Plain UPDATE,
-- no PRAGMA/table-recreate involved, safe inside migrate()'s transaction.
UPDATE `postings`
SET `quantity` = CAST(ROUND(
  (CASE WHEN `postings`.`debit` > 0 THEN `postings`.`debit` ELSE `postings`.`credit` END)
  * POW(10, 6 - `c`.`minor_unit_scale`)
) AS INTEGER)
FROM `accounts` `a`
JOIN `currencies` `c` ON `c`.`id` = `a`.`currency_id`
WHERE `postings`.`account_id` = `a`.`id`;