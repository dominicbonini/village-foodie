-- 20260806_trucks_print_trigger_mode.sql
-- 🔴 WRITTEN, NOT RUN. Hand-apply when the printing build reaches the point of reading it.
--
-- ── WHY THE TRUCK AND NOT THE DEVICE ────────────────────────────────────────────────────────────────
-- The four existing printing settings (printer name, lead minutes, paper width, enabled) are DEVICE-local
-- in Capacitor Preferences, and correctly so: the printer is paired to one iPad over Bluetooth, so which
-- printer, what paper and whether this device prints at all are properties of the DEVICE.
--
-- 🔴 THE TRIGGER MODE IS NOT. It is a WORKFLOW POLICY — "we print when we accept" vs "we print ten minutes
-- before collection" — and it is the same answer for every device in the truck. Two devices holding
-- DIFFERENT modes is strictly worse than two devices holding the same one: the same order would produce
-- two tickets at two DIFFERENT times, which reads as a malfunction rather than as a duplicate. Duplicates
-- are an understandable problem an operator can reason about; two contradictory tickets are not.
--
-- ⚠️ DOES THIS MAKE MULTI-DEVICE DE-DUPLICATION EASIER OR HARDER LATER? EASIER, but only slightly, and it
-- is not the hard part. Dedup needs a SHARED RECORD of what has already printed — a server-side
-- `printed_at` or a print_jobs table — which is a server concern either way. What a truck-level mode buys
-- is that every device agrees on WHEN a ticket is due, so a shared record has a single rule to dedupe
-- against instead of two. It does not build the record. NO DE-DUPLICATION IS BUILT HERE.
--
-- ── CLASSIFICATION: ADDITIVE, deploy-order-independent ──────────────────────────────────────────────
-- Nothing reads this column yet. `/api/dashboard` and `/api/manage` both read `trucks` with `select('*')`,
-- which DEGRADES — so code shipped before the migration simply sees `undefined` and falls back to the
-- default. ⚠️ The one hand-maintained list to check before that changes is `/api/admin`'s explicit trucks
-- select, which would 42703 the whole admin table if it ever names this column before the migration runs.
alter table trucks
  add column if not exists print_trigger_mode text not null default 'lead_time'
  check (print_trigger_mode in ('on_confirmed', 'lead_time'));

comment on column trucks.print_trigger_mode is
  'When a kitchen ticket prints. ''lead_time'' (DEFAULT) = X minutes before the collection time, X being the per-device hg_print_lead_mins. ''on_confirmed'' = as soon as the order is ACCEPTED, which for an advance pre-order can be hours before collection. Truck-level because it is a workflow policy, not a device capability — the printer itself stays device-local. Both modes anchor on acceptance: a pending order never prints, and a rejected one never prints.';

notify pgrst, 'reload schema';

-- ── VERIFY (run after) ────────────────────────────────────────────────────────────────────────────
-- Expect: text, NOT NULL, default 'lead_time' — and EVERY existing truck on 'lead_time', i.e. nobody's
-- behaviour changes by the migration alone.
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'trucks' and column_name = 'print_trigger_mode';
--
--   select print_trigger_mode, count(*) from trucks group by print_trigger_mode;
--
-- 🔴 "add column if not exists" succeeds whether or not it added anything (§35). The count is the only
-- thing that proves the column is really there and really defaulted.
