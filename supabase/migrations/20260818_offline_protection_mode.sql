-- OFFLINE PROTECTION: ONE SWITCH, TWO MODES.
--
-- The switch stays exactly where it is: truck_vans.auto_pause_on_offline (boolean, ON/OFF) with the
-- per-event override truck_events.offline_protection_override (boolean, null = inherit the van).
-- NOTHING ABOUT EITHER COLUMN CHANGES. This migration only adds what the MODE needs.
--
-- 🔴 ADDITIVE, NOT DEPLOY-COUPLED — AND THAT IS THE WHOLE REASON THE ENUM CONVERSION WAS REJECTED.
-- Every column below is nullable or carries a DEFAULT, and no existing column changes type, name,
-- nullability or value. So:
--   • APPLY THIS FIRST, DEPLOY LATER  → nothing reads the new columns yet; behaviour is unchanged.
--   • DEPLOY FIRST, APPLY LATER       → the server reads `select('*')`-style rows on the van path, so a
--     missing column arrives `undefined` and every consumer's `?? 'pause'` fallback resolves to TODAY'S
--     BEHAVIOUR. The one exception is any NAMED select that lists a new column: PostgREST answers 42703
--     and fails the whole statement. THE NAMED SELECTS THAT LIST THESE COLUMNS ARE:
--       - app/api/manage/route.ts  get_vans           (offline_protection_mode)
--       - supabase/functions/heartbeat-monitor        (offline_protection_mode_override, and the van's mode)
--     Both degrade LOUDLY rather than silently — Settings would render no vans, and the monitor would
--     log a stale-van query failure — which is why the honest instruction is: APPLY THIS BEFORE THE
--     DEPLOY. The same rule the buzzer_count column carries.
--
-- 🔴 DEFAULTS PRESERVE TODAY EXACTLY. `'pause'` is what offline protection has always meant, so every
-- existing row — including Pizzeria Gusto's live van with auto_pause_on_offline = true — keeps its
-- current behaviour with no data conversion and no backfill.
--
-- 🚫 NOT RUN. Dominic runs all SQL by hand.

-- ── 1. THE MODE, ON THE SAME SCOPE AS THE SWITCH ───────────────────────────────────────────────────
alter table truck_vans
  add column if not exists offline_protection_mode text not null default 'pause';

alter table truck_vans
  drop constraint if exists truck_vans_offline_protection_mode_check;
alter table truck_vans
  add constraint truck_vans_offline_protection_mode_check
  check (offline_protection_mode in ('pause', 'no_auto_accept'));

comment on column truck_vans.offline_protection_mode is
  'What offline protection DOES when this van goes offline, when the switch (auto_pause_on_offline) is ON. '
  '''pause'' = customers cannot order (today''s behaviour, the default for every existing row). '
  '''no_auto_accept'' = customers can still order but nothing auto-confirms; each order arrives pending '
  'with its slot held, exactly like a normal non-auto-accepted order. Ignored entirely when the switch is OFF.';

-- ── 2. THE PER-EVENT OVERRIDE, MATCHING offline_protection_override's SHAPE ────────────────────────
alter table truck_events
  add column if not exists offline_protection_mode_override text default null;

alter table truck_events
  drop constraint if exists truck_events_offline_protection_mode_override_check;
alter table truck_events
  add constraint truck_events_offline_protection_mode_override_check
  check (offline_protection_mode_override is null
         or offline_protection_mode_override in ('pause', 'no_auto_accept'));

comment on column truck_events.offline_protection_mode_override is
  'Per-event override for the offline-protection MODE. null = use the van default '
  '(truck_vans.offline_protection_mode). Mirrors offline_protection_override''s null-means-inherit rule '
  'so the two resolve through the same chain.';

-- ── 3. THE MARKER THE SUBMIT PATH READS ────────────────────────────────────────────────────────────
-- 🔴 THIS IS THE ANSWER TO STAGE 1'S Q2, AND IT IS OPTION (a): the monitor WRITES a marker and the
-- submit path READS it. The alternative — submit re-deriving staleness from truck_vans.last_heartbeat_at
-- — would put the 30-second threshold in a second place, on a different runtime, with no shared home
-- (STALE_THRESHOLD_SECONDS is a local const inside the Deno edge function and cannot be imported by
-- Vercel code). One owner of the staleness rule; everyone else reads a value.
--
-- ⚠️ IT IS A SEPARATE COLUMN FROM online_paused_until AND MUST STAY ONE. That column is what the
-- customer ordering gate reads — writing it IS the pause, which is the OTHER mode. Storing both in one
-- column would make mode B block ordering, i.e. do exactly what it exists not to do.
--
-- SHAPE MIRRORS online_paused_until DELIBERATELY: an expiry, not a flag, so a monitor that stops running
-- cannot strand a truck in no-auto-accept for ever. The heartbeat clears it on reconnect the same way it
-- clears online_paused_until.
alter table truck_events
  add column if not exists offline_no_autoaccept_until timestamptz default null;

comment on column truck_events.offline_no_autoaccept_until is
  'Set by heartbeat-monitor when this event''s van is offline AND the resolved offline-protection mode is '
  '''no_auto_accept''. While in the future, /api/orders/submit forces new orders to status ''pending'' '
  'instead of auto-confirming them; the slot is still claimed and held. Cleared by /api/heartbeat on the '
  'van''s next successful ping. NEVER blocks ordering — that is online_paused_until, which this is not.';

create index if not exists idx_truck_events_offline_no_autoaccept
  on truck_events (van_id)
  where offline_no_autoaccept_until is not null;
