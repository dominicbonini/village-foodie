# Task report — RUNBOOK: all SQL in one place, in order · 2026-07-27

**TRANSIENT.** Overwritten every task. Durable log: `docs/android.md` (append-only, **not
touched** this task). `docs/last-report.md` belongs to a separate workstream — not read, not
written, not opened.

**Nothing was changed. No SQL was run. The migration files were NOT modified** (per item 4).

---

## 0. Prompt integrity — two garbled spots, repaired not silently fixed

| As received | Read as | Basis |
| --- | --- | --- |
| item 2: *"it is **nos** which comes first"* | *"it is **not clear** which comes first"* | Truncated; the sentence is about loose SQL snippets scattered across reports, and the fix requested is numbering. |
| closing: *"anything you could not do**.in chat**, give me only a two-line summary"* | *"anything you could not do. **Then in** chat, …"* | Missing sentence break, same closing instruction as previous prompts. |

Neither changed the work.

---

# ⏱️ THE RUN ORDER — start here

Nine steps. Steps **1–2 can be run right now**. Step **7 is not SQL**. Step **8 is HELD** until
its preconditions are met.

| # | What | Answers | Status |
| --- | --- | --- | --- |
| **1** | **Token verification** (§1) | Did the Android device register an FCM token after the guard removal? | **Run now** — independent of everything below |
| **2** | **Baseline capture** (§2) | What are the current preference values? *Required before #5, because the backfill's arithmetic depends on `van_notification_prefs`, whose contents are unknown to me.* | **Run now**, keep the output |
| **3** | **Migration #1 — create** (§4) | — | Run after #2 |
| **4** | **Verify #1** (§5) | Did the table actually get created, with the right columns, constraints and RLS? | Immediately after #3 |
| **5** | **Migration #2 — backfill** (§6) | — | **Same sitting as #3** |
| **6** | **Verify #2** (§7) | Did every device get 3 rows, and does `order_pending` match the old effective rule *per device*? | Immediately after #5 |
| **7** | *Write + deploy the code, observe a real order* | — | **Not SQL.** Nothing below runs until this is done and observed |
| **8** | **Migration #3 — sweep** (§8) | — | ⛔ **HELD.** Preconditions inside the file |
| **9** | **Verify #3** (§9) | Are the old stores actually gone? | After #8 |

**The one ordering that must never happen:** #8 before #7. Dropping the old stores while
`app/api/orders/submit/route.ts` still reads them breaks customer-order notifications on a
live trading truck.

---

## 1. STEP 1 — token verification (from the guard-removal task)

Confirms the Android FCM token reached `van_devices` after the guard was removed from
`lib/native/push.ts`. **Deliberately does not print the token itself** — it is a device
credential; presence and length are sufficient.

```sql
-- 1a. THE ANSWER: does an Android row exist with a token?
select device_id,
       platform,
       (push_token is not null) as has_push_token,
       length(push_token)       as token_len,
       notify_enabled,
       last_seen
from van_devices
where platform = 'android'
order by last_seen desc nulls last;
```

```sql
-- 1b. FULL PICTURE across every device, to see the Android row alongside the 7 iOS ones.
select device_id,
       platform,
       (push_token is not null) as has_push_token,
       length(push_token)       as token_len,
       notify_enabled,
       last_seen,
       truck_id,
       van_id
from van_devices
order by last_seen desc nulls last;
```

```sql
-- 1c. ONE-LINE SUMMARY, useful before/after the launch.
select coalesce(platform, '(null)') as platform,
       count(*)                                        as devices,
       count(*) filter (where push_token is not null)  as with_token
from van_devices
group by 1
order by 1;
```

**PASS:** 1a returns ≥1 row with `platform = 'android'`, `has_push_token = true`, `token_len`
in the low hundreds (FCM tokens are ~150–200 chars, longer than the 64-char APNs tokens —
informational, not a check). Baseline was 7 rows, all `ios`, **zero** with a token, so 1c
changing from `ios | 7 | 0` to include `android | 1 | 1` is the unambiguous confirmation.

**FAIL modes:**

- **No `android` row** → the device never bound. `registerForPush` runs only after binding
  (`OperatorDeviceConfig.tsx:43,49,69`). Check device setup, not push.
- **Row present, `has_push_token = false`** → registration ran, no token: either permission
  denied (`push.ts:39-40` returns early on `perm.receive !== 'granted'`) or
  `registrationError` fired — look for `[push] registration error:` in `chrome://inspect`.
- **App dies on launch** → the Firebase precondition is not satisfied; check logcat for
  `Default FirebaseApp is not initialized`.

⚠️ **A token arriving is NOT push working.** `app/api/orders/submit/route.ts:1077` still
carries the temporary `.or('platform.eq.ios,platform.is.null')` predicate, and there is no FCM
transport in the codebase. An Android row with a valid token is still excluded from every
send. Registration and delivery are separate milestones.

---

## 2. STEP 2 — baseline capture (run BEFORE migration #1)

```sql
-- 2a. The van-level prefs, exactly as they are now. KEEP THIS OUTPUT — the backfill's expected
--     numbers depend on it, and after the sweep it is unrecoverable.
select van_id, type, enabled from van_notification_prefs order by van_id, type;

-- 2b. The device-level flag.
select count(*)                                   as devices,
       count(*) filter (where notify_enabled)     as notify_true,
       count(*) filter (where not notify_enabled) as notify_false
from van_devices;
```

**Expected from the last verified state:** 7 devices, 6 true, 1 false.
**`van_notification_prefs` contents are unknown to me** — I have never been able to query the
DB. If any van is muted there, expect fewer than 6 enabled after the backfill, and confirm
with §7c rather than a round number.

---

## 3. Classification summary

| # | File | Classification |
| --- | --- | --- |
| 1 | `supabase/migrations/20260728_device_notification_prefs.sql` | **DEPLOY-COUPLED** — the Settings card and both send paths will read it; must precede that code. Safe to run today: nothing references it yet. |
| 2 | `supabase/migrations/20260728_device_notification_prefs_backfill.sql` | **DEPLOY-COUPLED** (same window as #1). Not because readers hard-fail, but because they *tolerate* absence as "enabled", so without it a muted device silently unmutes. |
| 3 | `supabase/migrations/20260728_notification_prefs_retire_old_stores.sql` | **DEPLOY-COUPLED IN REVERSE — ⛔ DO NOT RUN YET.** Must run AFTER the new code is deployed and observed. |

Neither #1 nor #2 is ADDITIVE in the strict sense (code will hard-fail without them); #3 is
the inverse case, where the *code* must precede the *migration*.

---

## 4. STEP 3 — migration file #1, verbatim

**Path: `supabase/migrations/20260728_device_notification_prefs.sql`** — **DEPLOY-COUPLED**

```sql
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
```

---

## 5. STEP 4 — verify #1

```sql
-- 5a. Columns, types, nullability, defaults.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'device_notification_prefs'
order by ordinal_position;
-- expect exactly 4 rows:
--   device_id  | text                        | NO | (null)
--   type       | text                        | NO | (null)
--   enabled    | boolean                     | NO | true
--   updated_at | timestamp with time zone    | NO | now()

-- 5b. PK, FK and the type CHECK all present.
select con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
where rel.relname = 'device_notification_prefs'
order by con.contype;
-- expect: PRIMARY KEY (device_id, type)
--         FOREIGN KEY (device_id) REFERENCES van_devices(device_id) ON DELETE CASCADE
--         CHECK (type = ANY (ARRAY['offline_protection','order_pending','schedule_received']))

-- 5c. RLS actually enabled, and NO policies (service-role only).
select relrowsecurity as rls_enabled,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'device_notification_prefs') as policy_count
from pg_class where relname = 'device_notification_prefs';
-- expect: rls_enabled = true, policy_count = 0

-- 5d. PostgREST can see it (the schema reload worked).
select to_regclass('public.device_notification_prefs');   -- expect device_notification_prefs, not NULL
```

---

## 6. STEP 5 — migration file #2, verbatim

**Path: `supabase/migrations/20260728_device_notification_prefs_backfill.sql`** —
**DEPLOY-COUPLED (same window as #1)**

```sql
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
-- ── (a) offline_protection — SEEDED FALSE, and why that is the faithful choice ──────────────────────
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
on conflict (device_id, type) do nothing;

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
```

---

## 7. STEP 6 — verify #2

```sql
-- 7a. Shape of the result: one row per device per type.
select type,
       count(*)                               as rows,
       count(*) filter (where enabled)        as enabled,
       count(*) filter (where not enabled)    as disabled
from device_notification_prefs
group by type
order by type;
-- expect 3 rows, each with rows = (number of van_devices rows) = 7:
--   offline_protection | 7 | 0 | 7
--   order_pending      | 7 | ? | ?   <- must equal the 7c cross-check below
--   schedule_received  | 7 | 0 | 7

-- 7b. Every device covered, none missed (a device added between #1 and #2 would show here).
select d.device_id, d.platform
from van_devices d
left join device_notification_prefs p on p.device_id = d.device_id
group by d.device_id, d.platform
having count(p.type) <> 3;
-- expect 0 rows. Any row = that device has fewer than 3 prefs; re-run #2 (it is idempotent).

-- 7c. THE ONE THAT MATTERS — order_pending must equal the old effective rule, per device.
select d.device_id,
       d.notify_enabled                                        as old_device_flag,
       p.enabled                                               as old_van_pref,
       (coalesce(d.notify_enabled, true) and coalesce(p.enabled, true)) as expected,
       n.enabled                                               as actual,
       (n.enabled = (coalesce(d.notify_enabled, true) and coalesce(p.enabled, true))) as matches
from van_devices d
left join van_notification_prefs p
       on p.van_id = d.van_id and p.type = 'order_pending'
left join device_notification_prefs n
       on n.device_id = d.device_id and n.type = 'order_pending'
order by matches nulls first, d.device_id;
-- expect EVERY row matches = true. Any false/null row means a device's order-notification behaviour
-- would change on deploy — stop and investigate before writing any code against this table.
```

---

## 8. STEP 8 — migration file #3, verbatim ⛔ HELD

**Path: `supabase/migrations/20260728_notification_prefs_retire_old_stores.sql`** —
**DEPLOY-COUPLED IN REVERSE, DO NOT RUN YET**

```sql
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
```

---

## 9. STEP 9 — verify #3

```sql
select to_regclass('public.van_notification_prefs');   -- expect NULL
select column_name from information_schema.columns
 where table_name = 'van_devices' and column_name = 'notify_enabled';   -- expect 0 rows
```

---

# 10. YOUR QUESTION ABOUT THE BACKFILL LOGIC

**Short answer: it is the intent, it is correct, and the specific outcome you describe does
not occur — because the premise has one factual error. But the semantic point underneath it
is real and worth stating.**

### 10.1 The factual correction

> *"…while the other two types take their own defaults."*

**They do not.** For devices that already exist, the backfill writes **explicit `false` rows**
for both other types — it does not leave them to the column default:

```sql
insert into device_notification_prefs (device_id, type, enabled)
select d.device_id, 'offline_protection', false from van_devices d ...

insert into device_notification_prefs (device_id, type, enabled)
select d.device_id, 'schedule_received', false from van_devices d ...
```

The column default `true` governs **only devices created after the migration**. So the device
with `notify_enabled = false` ends up with **all three types false** — not one false and two
defaulted-on.

### 10.2 Why folding it into `order_pending` alone is faithful — verified

I checked every consumer of `notify_enabled` in the repo (grep across `app/`, `lib/`,
`components/`, `supabase/`). It has **exactly one server-side reader**:

```
app/api/orders/submit/route.ts:1076
  .from('van_devices').select('device_id, push_token').eq('van_id', vanId).eq('notify_enabled', true)...
```

Everything else is a **write** (`bind-device:82`), a **UI mirror**
(`NotificationSettings.tsx:59`, `OperatorDeviceConfig.tsx:238`), or a type/comment.

So the premise *"notify_enabled today gates ALL server-side notification for a device"* is
true only **vacuously**: `order_pending` is the only server-side notification that exists.
`notify_enabled` has never gated anything else, so there is nothing else for it to carry
forward to. Mapping it to `order_pending` is not a collapse that loses information — it maps
the flag onto the whole of its actual scope.

**And it never touched offline alerts at all.** Those are LOCAL, fired by the device
(`useOfflineAlert.ts` → `notifyLocal`), gated only by the device-local `hg_notify_*` keys.
`notify_enabled` is a server-side send filter; it cannot suppress a notification the server
does not send.

### 10.3 What that operator experiences, before vs after

For the one device with `notify_enabled = false`:

| | Today | After #1+#2 |
| --- | --- | --- |
| **order needs confirming** (push) | **No** — filtered out at `submit:1076` | **No** — `order_pending = false` |
| **offline protection** (local) | **Depends on their local prefs** — fires only if they had switched `hg_notify_master` on; unset by default | **No** — `offline_protection = false` |
| **schedule received** | Does not exist | **No** — `schedule_received = false` |

**Migration-day result: identical, except in one case** — if that operator had *locally*
enabled offline alerts, they go silent. That is **not** caused by the `notify_enabled`
collapse; it is the already-flagged local-prefs regression that affects **every** device
equally, because those prefs live in device localStorage and SQL cannot read them. The remedy
is the one-time client migration that must ship with the new Settings card.

### 10.4 The real semantic change — intended, and worth naming

There *is* a change, but it is in the future, not at migration time. **Today that operator has
one switch that would automatically suppress any new server-side alert type we ever add.
After, they have three independent switches.** If `schedule_received` is later turned on for
that device, it will fire — even though their old global "off" would have blanket-suppressed
it.

**That is the agreed design, not an artefact:** three independent per-device types was the
stated requirement, and the change requires a deliberate operator action (a toggle) to take
effect. Nothing turns on by itself. I am naming it so it is a known consequence rather than a
surprise.

### 10.5 Verdict

**No change to the migration is needed, and I have made none** (item 4). If you disagree with
§10.4 — i.e. you want a device-level master that suppresses all three — that is a *fourth*
concept, and my §4 design deliberately excluded it: the OS permission grant is the real
master (it genuinely does suppress everything, on both platforms), and re-implementing a
second app-level master is what produced the lying-toggle bug in the first place.

### 10.6 One genuinely new finding from the grep

**Two separate UI surfaces write `notify_enabled`:**

- `components/native/NotificationSettings.tsx:59` — the "New order alerts" toggle
- `components/native/OperatorDeviceConfig.tsx:238` — a checkbox inside `ThisDeviceSettings`

Both must be updated (or one removed) in the Settings-card phase, or one surface will keep
writing a column the other has stopped reading. Not in scope here; flagged so the rewrite
covers both. This is the same "two surfaces, one fact" shape as the existing
order-entry-surfaces gap.

---

## 11. Flagged (carried forward, unchanged)

- **⚠️ The offline-alert regression** the backfill creates for any device whose operator had
  locally enabled alerts. The one-time client migration **must ship in the same release as the
  new Settings card**. Most likely thing to be forgotten.
- **⚠️ The FK divergence** — `device_id` (text) rather than `van_devices.id` (uuid), against
  the usual rule. Deliberate, justified in the file, one-line change if you prefer the PK.
- **`van_notification_prefs` contents unknown to me** — hence step 2 and the per-device
  cross-check at 7c rather than trusting the round number 6.
- **Token ≠ delivery** — the temporary platform predicate at `submit:1077` and the missing FCM
  transport both still stand between a registered Android device and an actual push.

---

## 12. What I could not do / did not do

- **Ran no SQL** — not the migrations, not the verification, not a read. Everything here is
  for you to run.
- **Did not modify the three migration files** (item 4), including after the §10 analysis —
  which concluded no change was needed anyway.
- **Changed nothing at all this task** except this report. Note `git status` also shows
  `docs/android.md` as modified — that is the **previous** task's append, still uncommitted;
  I did not touch it today.
- **Could not confirm** `van_notification_prefs`' contents, the Android token result, or any
  post-migration state — all require running SQL.
- **Did not touch `docs/android.md`** (no append requested) or `docs/reference-manual.md`.
- **Did not touch `docs/last-report.md`** — not read, not written, not opened.
