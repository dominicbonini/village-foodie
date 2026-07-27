-- 20260728_device_notification_prefs.sql
-- Per-DEVICE, per-TYPE notification preferences. The single coherent store for all three alert types.
--
-- ⚠️ CLASSIFICATION: **DEPLOY-COUPLED**. The Settings UI and the two push send paths will read this
-- table directly; without it every read 404s/PGRST205s and the notification card cannot render. It MUST
-- be applied BEFORE the code that reads it deploys. It is nonetheless SAFE TO RUN TODAY: nothing in the
-- repo references it yet (this file ships ahead of the code deliberately), so applying it early is a
-- no-op for the running app and removes the coupling risk entirely.
--
-- ── WHY A NEW TABLE, AND WHAT IT REPLACES ───────────────────────────────────────────────────────────
-- Three stores currently hold notification preferences, on three different axes, by accident rather
-- than design:
--   1. van_notification_prefs(van_id, type)     — per-VAN, server-visible. Only type='order_pending'.
--   2. van_devices.notify_enabled               — per-DEVICE, server-visible, but ONE boolean for
--                                                 everything (not per-type).
--   3. Capacitor Preferences on the device       — per-DEVICE, per-type, and INVISIBLE TO THE SERVER
--      (hg_notify_master / hg_notify_offline /     (so it cannot gate a push, which the server sends).
--       hg_notify_neworder)
-- The agreed model is per-device preferences for all three alert types (the same physical-settings model
-- as sound and keep-awake, V9.0). The per-VAN axis cannot express it at all — two devices on one van
-- cannot differ — and the device-local store cannot gate a server-originated push. Hence one table, one
-- axis, server-side.
--
-- ── THE THREE TYPES ─────────────────────────────────────────────────────────────────────────────────
--   'offline_protection' — offline protection kicked in. LOCAL notification, fired by the device itself
--                          (lib/native/useOfflineAlert.ts). Stored here anyway so ONE model serves the
--                          whole Settings card; the device reads its own row and caches it.
--   'order_pending'      — an order needs confirming. PUSH. Routed event -> truck_events.van_id -> van.
--   'schedule_received'  — the scraper bridged new events. PUSH. Routed truck_id -> devices directly
--                          (a scraped truck_events row has van_id NULL, so van routing is unavailable).
--
-- ── WHY device_id (text) AND NOT van_devices.id (uuid) ──────────────────────────────────────────────
-- ⚠️ DELIBERATE DIVERGENCE from the usual "FK to van_devices is uuid" rule — flagged, not accidental.
-- van_devices.device_id is `text NOT NULL UNIQUE` (20260701_van_devices.sql), which satisfies the FK
-- requirement, and it is the key EVERY caller already holds: the client generates it (getDeviceId(),
-- localStorage) and /api/native/bind-device already upserts `onConflict: 'device_id'`. Keying on the
-- uuid PK would force a device_id -> id lookup on every read and write, for no gain: both are stable
-- across re-binding (bind-device UPDATEs the row, it does not replace it). If you would rather this
-- referenced van_devices(id), say so before running — it is a one-line change here plus a lookup in the
-- (not yet written) code, and nothing else depends on it.
--
-- ── DEFAULTS ────────────────────────────────────────────────────────────────────────────────────────
-- `enabled` defaults TRUE and a MISSING ROW MUST BE READ AS ENABLED. This follows the established
-- convention in this codebase (`preorders_enabled !== false`, `notes_require_review !== false`) where a
-- null / pre-migration value reads as the SAFE behaviour. For an ALERT, the safe direction is to fire:
-- a missed offline-protection alert means orders arrive at a device nobody is watching, which is the
-- exact failure the alert exists to prevent. Silence must be an explicit choice, never a default that
-- fell out of a missing row.
-- NOTE this default governs DEVICES CREATED AFTER this migration. Existing devices get EXPLICIT rows
-- from the backfill (20260728_device_notification_prefs_backfill.sql) so their present behaviour is
-- preserved exactly rather than inferred.

create table if not exists device_notification_prefs (
  -- FK to the natural key, not the uuid PK — see the note above.
  device_id  text        not null references van_devices(device_id) on delete cascade,
  type       text        not null,
  enabled    boolean     not null default true,
  updated_at timestamptz not null default now(),
  primary key (device_id, type),
  -- The three agreed types, enforced in the DATA rather than by convention. A fourth type is then a
  -- deliberate migration, not a silent typo that writes a row nothing ever reads. (van_notification_prefs
  -- left `type` unconstrained and shipped exactly one value for its whole life — the constraint costs
  -- nothing and makes the vocabulary discoverable from the schema.)
  constraint device_notification_prefs_type_chk
    check (type in ('offline_protection', 'order_pending', 'schedule_received'))
);

-- NO separate index on device_id: the primary key (device_id, type) is a btree whose LEADING column is
-- device_id, so "all prefs for this device" — the only read shape either the client or the send paths
-- need — is already served. (This corrects the design note in the earlier report, which proposed a
-- redundant index.) Lookups by `type` alone are not a query this system makes.

alter table device_notification_prefs enable row level security;
-- service-role only, no anon policy: every reader is a server route using the service key (the send
-- paths) or an authenticated operator surface proxied through one (/api/native/bind-device). No browser
-- or customer ever touches this table directly — same posture as van_devices and van_notification_prefs.

comment on table device_notification_prefs is
  'Per-device, per-type notification preferences. The single store for all three alert types (offline_protection / order_pending / schedule_received). Replaces the accidental three-way split of van_notification_prefs (wrong axis: per-van), van_devices.notify_enabled (not per-type) and the device-local Capacitor Preferences keys (invisible to the server, so unable to gate a push). Missing row = ENABLED.';

comment on column device_notification_prefs.device_id is
  'FK to van_devices.device_id (text, UNIQUE) — the natural key every client already holds, not the uuid PK. Cascades with the device row.';

comment on column device_notification_prefs.enabled is
  'Missing row reads as ENABLED (see the table comment). For an alert, failing to fire is the dangerous direction, so silence must be explicit.';

notify pgrst, 'reload schema';
