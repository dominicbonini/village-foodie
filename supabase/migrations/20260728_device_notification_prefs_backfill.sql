-- 20260728_device_notification_prefs_backfill.sql
-- Seeds device_notification_prefs for every device that ALREADY EXISTS, so no device changes behaviour
-- the moment the new code ships.
--
-- ⚠️ CLASSIFICATION: **DEPLOY-COUPLED (same window as the create)**. Not because code hard-fails without
-- it — the readers tolerate a missing row (missing = enabled) — but because that tolerance is exactly
-- the hazard: without this backfill, a device whose operator had switched notifications OFF would read
-- "no row" and silently switch back ON. Run it in the SAME sitting as
-- 20260728_device_notification_prefs.sql, immediately after, and BEFORE any code deploys.
--
-- Idempotent: `on conflict do nothing` so re-running never overwrites a preference an operator has since
-- changed. Re-running is a safe no-op.
--
-- ── THE RULE THIS FILE IMPLEMENTS ───────────────────────────────────────────────────────────────────
-- Reproduce today's OBSERVABLE behaviour exactly. Where a type has no behaviour today, choose the
-- conservative value and let the operator opt in. A device that currently notifies must not go silent;
-- one that does not must not start.
--
-- ── (b) order_pending — FOLD THE TWO EXISTING SERVER-SIDE GATES INTO ONE ROW ────────────────────────
-- Today's effective rule (app/api/orders/submit/route.ts) is a conjunction of TWO stores:
--     van_notification_prefs(van_id, 'order_pending').enabled   -- default ON when NO ROW exists
--   AND van_devices.notify_enabled                              -- per-device opt-out
-- Both are folded into the single per-device row below. A van that an operator had muted therefore
-- becomes a set of muted DEVICES — the mute is preserved, re-expressed on the new axis. This is the
-- answer to "what happens to existing van_notification_prefs rows": their EFFECT is carried over here;
-- the rows themselves are left in place, dormant (see the sweep migration).
--
-- Today this is gated by offlineAlertsEnabled() (lib/native/notifications.ts), which requires
-- hg_notify_master === 'true' AND hg_notify_offline !== 'false'. hg_notify_master is UNSET out of the
-- box, so for any device whose operator never went into Settings and switched the master on, offline
-- alerts DO NOT FIRE TODAY. Seeding `true` would make those devices start alerting on the first launch
-- after the deploy — a behaviour change nobody asked for, on a device that may sit in a kitchen at 6am.
-- Those prefs are DEVICE-LOCAL and invisible to the server, so this migration cannot read them; `false`
-- is the only value that is faithful for the majority case.
-- ⚠️ CONSEQUENCE, NOT YET BUILT: a device whose operator HAD enabled offline alerts locally will read
-- `false` after this backfill and go silent. The fix belongs in client code (not this phase): on first
-- run of the new Settings card, migrate the local hg_notify_* values into this table with a one-time
-- upsert, then stop reading the local keys. That one-time migration MUST ship in the same release as
-- the new card. Recorded in docs/android.md as an explicit outstanding item.
--
-- ── (c) schedule_received — SEEDED FALSE ────────────────────────────────────────────────────────────
-- Brand new: no device has ever received one. The scraper bridge runs hourly, so defaulting existing
-- devices to ON would start unsolicited alerts across every truck at up to hourly cadence the moment
-- dispatch ships. Existing devices opt IN. (NEW devices created after this migration inherit the
-- column default TRUE — for them there is no prior behaviour to preserve, and on-by-default with a
-- visible toggle is the intended product state.)

-- ── (b) order_pending ───────────────────────────────────────────────────────────────────────────────
insert into device_notification_prefs (device_id, type, enabled)
select d.device_id,
       'order_pending',
       -- The conjunction of both of today's server-side gates. coalesce(...) reproduces
       -- "default ON when no van_notification_prefs row exists".
       coalesce(d.notify_enabled, true) and coalesce(p.enabled, true)
from van_devices d
left join van_notification_prefs p
  on p.van_id = d.van_id
 and p.type   = 'order_pending'
on conflict (device_id,-- ── (a) offline_protection — SEEDED FALSE, and why that is the faithful choice ──────────────────────
 type) do nothing;

-- ── (a) offline_protection ──────────────────────────────────────────────────────────────────────────
insert into device_notification_prefs (device_id, type, enabled)
select d.device_id, 'offline_protection', false
from van_devices d
on conflict (device_id, type) do nothing;

-- ── (c) schedule_received ───────────────────────────────────────────────────────────────────────────
insert into device_notification_prefs (device_id, type, enabled)
select d.device_id, 'schedule_received', false
from van_devices d
on conflict (device_id, type) do nothing;

notify pgrst, 'reload schema';

-- ── EXPECTED RESULT (against the state verified 2026-07-27: 7 van_devices rows, 6 with
--    notify_enabled = true, 1 false; van_notification_prefs contents UNKNOWN — see the verification SQL
--    in the task report, which checks it rather than assuming) ─────────────────────────────────────────
--   21 rows total (7 devices x 3 types)
--   order_pending      : 6 enabled / 1 disabled  — IF van_notification_prefs is empty. If any van is
--                        muted there, expect FEWER enabled. Confirm with the verification query; do not
--                        assume 6.
--   offline_protection : 0 enabled / 7 disabled
--   schedule_received  : 0 enabled / 7 disabled
