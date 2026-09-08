-- Backfill step of add -> backfill -> validate -> enforce -> remove legacy
-- (Account Types, Money Representation, Rational Pricing, FX & Liability
-- Details delta). A single UPDATE, embedded directly in migration SQL
-- (same posture as 0016's `account_type` backfill) rather than a separate
-- one-off script — a separate script can't run between "add" (0015-0017)
-- and "enforce" (0019) migrations in practice, since drizzle-orm's
-- migrate() applies every pending migration file in one shared
-- transaction the first time it runs, giving an out-of-band script no
-- window to run in between.
--
-- Only touches `price = 1` rows (this delta's own "inspect existing data,
-- never blindly convert" instruction). Inspecting this deployment's real
-- data ahead of writing this migration found every not-yet-backfilled
-- posting already satisfies that (zero historical FX conversions exist),
-- and every account touched by one of those postings shares its profile's
-- own primary currency — so `units = debit - credit`, `price_num`/
-- `price_denom` = 1/1, `base_amount = units` is exact for every row this
-- touches, not an approximation. A row with a genuine historical
-- `price != 1` (a real past FX conversion, on some other deployment's
-- data) is deliberately left NULL rather than guessed at — migration 0019
-- (enforce NOT NULL) then fails loudly on it instead of silently writing
-- a wrong base_amount, surfacing it for a manual look before proceeding.
UPDATE `postings`
SET `units` = `debit` - `credit`,
    `price_num` = 1,
    `price_denom` = 1,
    `base_amount` = `debit` - `credit`
WHERE `units` IS NULL AND `price` = 1;
