-- 20260728_notification_prefs_retire_old_stores.sql
--
-- ⛔ DO NOT RUN YET. ⛔
-- This is the SWEEP. It is written now so the intent is recorded and reviewable, and held until the
-- preconditions below are all true. Running it early breaks live order notifications.
--
-- ⚠️ CLASSIFICATION: **DEPLOY-COUPLED, IN REVERSE**. Every other migration must run BEFORE its code;
-- this one must run AFTER — specifically after the code that reads van_notification_prefs and
-- van_devices.notify_enabled has been REMOVED and DEPLOYED and observed working. Applying it while
-- app/api/orders/submit/route.ts still reads those two stores means every customer order hits a missing
-- table/column on a LIVE TRADING TRUCK.
--
-- ── WHY THE OLD STORES ARE LEFT DORMANT UNTIL NOW, NOT DROPPED WITH THE CREATE ──────────────────────
-- Following the manual's established precedent: leave dormant, sweep later. Keeping them intact through
-- the switchover means the rollback for the whole notification rework is a code revert — no data has
-- been destroyed, the old readers still find what they expect, and the new table is simply ignored.
-- Dropping them in the same sitting as the create would make the switchover irreversible on its riskiest
-- day. Two dormant objects cost nothing; an unrollbackable deploy costs a trading day.
--
-- ── PRECONDITIONS — ALL must be true. Check them, do not assume. ────────────────────────────────────
--   [ ] 1. device_notification_prefs exists and is populated (verification SQL in the task report).
--   [ ] 2. The order-submit push path reads device_notification_prefs and NO LONGER references
--          van_notification_prefs or van_devices.notify_enabled.
--   [ ] 3. The Settings card writes device_notification_prefs and no longer writes notify_enabled.
--   [ ] 4. The one-time client migration of the local hg_notify_* keys has shipped and run (otherwise
--          offline-alert preferences are still only in device localStorage).
--   [ ] 5. That code is DEPLOYED — not merely committed. "tsc-clean" is not deployed.
--   [ ] 6. A real order on a real truck has produced the expected notification behaviour post-deploy.
--   [ ] 7. `grep -rn "notify_enabled\|van_notification_prefs" app/ lib/ components/` returns nothing
--          outside comments.
--
-- ── SNAPSHOT FIRST — a DROP is not reversible ───────────────────────────────────────────────────────
-- Run these two SELECTs and keep the output somewhere durable BEFORE running anything below. They are
-- the only record of the old state once the drop completes.
--     select * from van_notification_prefs order by van_id, type;
--     select device_id, van_id, notify_enabled from van_devices order by device_id;

-- ── 1. van_notification_prefs — the wrong axis (per-VAN; the agreed model is per-DEVICE) ────────────
-- Its EFFECT was folded into device_notification_prefs by the backfill migration, so nothing is lost
-- here that was not already carried across.
drop table if exists van_notification_prefs;

-- ── 2. van_devices.notify_enabled — subsumed by the 'order_pending' row ─────────────────────────────
-- One boolean covering every notification type; superseded by a row per type.
alter table van_devices drop column if exists notify_enabled;

notify pgrst, 'reload schema';

-- ── AFTER RUNNING ───────────────────────────────────────────────────────────────────────────────────
-- Confirm both are actually gone (a statement succeeding proves it ran, not what it did):
--   select to_regclass('public.van_notification_prefs');            -- expect NULL
--   select column_name from information_schema.columns
--    where table_name = 'van_devices' and column_name = 'notify_enabled';   -- expect 0 rows
--
-- NOT SWEPT HERE, deliberately: the device-local Capacitor Preferences keys (hg_notify_master /
-- hg_notify_offline / hg_notify_neworder) live in localStorage on each device and are not reachable
-- from SQL. They are retired by the client code that stops reading them (precondition 4); the stale
-- keys then sit harmlessly until the app is reinstalled.
