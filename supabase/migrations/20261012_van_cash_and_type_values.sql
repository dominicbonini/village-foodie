-- 20261012_van_cash_and_type_values.sql
-- TWO CHANGES, BOTH FROM ONE REPORT ON LOCALHOST (Pizza Kitchen, Schedule › Event types):
--   "Turning on 'Do you take cash?' for Van 1 also turned it on for Van 2 and showed Market changing."
--
-- 🔴 THAT IS **TWO SEPARATE DEFECTS** WITH THE SAME SYMPTOM, AND EACH NEEDS ITS OWN HALF OF THIS FILE:
--
--   1. "ALSO TURNED IT ON FOR VAN 2" — there was no per-van cash setting at all. `trucks.takes_cash`
--      is ONE column for the whole truck, and the grid drew one switch per van column over that single
--      value, so they moved together. SECTION 1 adds `truck_vans.takes_cash`.
--   2. "AND SHOWED MARKET CHANGING" — an event type's untouched settings were NULL ("same as
--      Standard") and were DRAWN FADED AT THE FIRST VAN'S VALUE. Market never had a cash value of its
--      own; it was displaying Van 1's, and Van 1's had moved. SECTION 2 gives every existing type its
--      own values, which is what removes the subscription.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Section 1 is idempotent. 🔴 SECTION 2 IS NOT RE-RUNNABLE WITHOUT THOUGHT — it fills NULLs,
--    so a second run is a no-op on rows it already filled, but it will also fill a NULL that an
--    operator has since created on purpose. Run it ONCE, after reading the preview.
--
-- 🔴 RUN THE PREVIEW IN SECTION 0 FIRST AND READ IT. It shows every row section 2 would change, with
--    its truck slug, its type name and each column BEFORE → AFTER. Event types are unreleased, so it
--    should list test trucks only; if it names a live trading truck, STOP.

set lock_timeout = '3s';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 0 · 🔴 READ-ONLY PREVIEW — RUN THIS ALONE, FIRST, AND LOOK AT IT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- It writes nothing. Every row listed is a row section 2 would UPDATE, and the `*_after` columns are
-- exactly what it would write. A truck with no active van cannot be resolved and is listed with NULL
-- afters — section 2 skips those rows, leaving them to go on resolving through the chain as they do
-- today.
--
-- ⚠️ `offline_auto_reject_mins` IS NOT IN HERE AND IS NOT BACKFILLED. It is not offered on a type at
-- all (4 October decision), so seeding it would store a value no screen shows and nothing reads.
with first_van as (
  -- "Van 1" = THE OLDEST ACTIVE VAN, which is the one rule that phrase means everywhere in this
  -- product (lib/van-category-settings.ts `firstVanId`). Not "the first row Postgres returned".
  select distinct on (v.truck_id)
         v.truck_id, v.id as van_id, v.name as van_name,
         v.buzzer_count, v.order_ready_enabled, v.auto_pause_on_offline,
         v.offline_protection_mode, v.collection_interval_mins,
         -- ⚠️ `takes_cash` MAY NOT EXIST YET when the preview is run before section 1. Read it through
         -- to_jsonb so the preview works either way instead of failing with 42703.
         (to_jsonb(v) ->> 'takes_cash') as van_takes_cash_txt
    from public.truck_vans v
   where v.active
   order by v.truck_id, v.created_at asc
)
select t.slug                                   as truck,
       fv.van_name                              as van_1,
       et.name                                  as event_type,
       -- buzzer reminder: the van's RACK is the rule (lib/buzzer.ts — no rack, nothing to prompt for)
       et.buzzer_prompt                         as buzzer_before,
       (fv.buzzer_count is not null)            as buzzer_after,
       -- take cash: van ?? truck
       et.takes_cash                            as cash_before,
       coalesce(fv.van_takes_cash_txt::boolean, t.takes_cash, false) as cash_after,
       et.order_ready                           as ready_before,
       coalesce(fv.order_ready_enabled, false)  as ready_after,
       et.collection_interval_mins              as collection_before,
       fv.collection_interval_mins              as collection_after,
       et.offline_protection                    as offline_before,
       coalesce(fv.auto_pause_on_offline, false) as offline_after,
       et.offline_protection_mode               as offline_mode_before,
       coalesce(fv.offline_protection_mode, 'pause') as offline_mode_after
  from public.event_types et
  join public.trucks t      on t.id = et.truck_id
  left join first_van fv    on fv.truck_id = et.truck_id
 where et.buzzer_prompt is null
    or et.takes_cash is null
    or et.order_ready is null
    or et.collection_interval_mins is null
    or et.offline_protection is null
    or et.offline_protection_mode is null
 order by t.slug, et.sort_order, et.name;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · "DO YOU TAKE CASH?" PER VAN
-- ════════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- 🔴 NULLABLE, WITH **NO BACKFILL**, AND THAT IS WHAT MAKES THIS CHANGE A NO-OP FOR EVERY EXISTING
-- TRUCK. NULL means "use `trucks.takes_cash`", so every van resolves to exactly what it resolves to
-- today and only a van the operator explicitly sets differs.
--
-- ⚠️ `NOT NULL DEFAULT false` WOULD HAVE BEEN A SILENT REGRESSION: every van on a truck whose
-- `trucks.takes_cash` is TRUE would have had the cash split turned off at the next service, with
-- nothing on screen to say why. The three-state shape is the same one the per-event override columns
-- use, for the same reason — and `resolveTakesCashWithType` uses `??` throughout so `false` is a real
-- instruction and not read as unset.
alter table public.truck_vans
  add column if not exists takes_cash boolean;

comment on column public.truck_vans.takes_cash is
  'Does THIS van split the paid action into Cash/Card? NULL (the default, and every row before 20261012) = follow trucks.takes_cash, so nothing changes for a truck that never touches it. Resolved as `event.takes_cash_override ?? event type ?? truck_vans.takes_cash ?? trucks.takes_cash ?? false` by lib/event-types/resolve.ts resolveTakesCashWithType, reached through lib/payments/paid-step.ts resolvePaidStep — the ONE place that chain lives. Read through the probed lib/payments/van-cash.ts, never as a column on an existing truck_vans select (a 42703 on /api/dashboard''s van select degrades capacity, the cooking step and order-ready). Exists because trucks.takes_cash is one column for the whole truck, so the Event types grid drew one switch per van column over a single value and they moved together. Copied by Settings'' "Same as Van 1" (it is in VAN_COPY_FIELDS).';

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · EVERY EXISTING EVENT TYPE GETS ITS OWN VALUES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 WHY A BACKFILL IS NEEDED AT ALL. From 5 October a NEW type is created as a COPY of Van 1's
-- resolved values, so every column has a real value and no Standard edit can reach it. Types that
-- already EXIST still have NULLs, and a NULL still falls back through the resolver — which is correct
-- (nothing breaks before this runs) but leaves exactly the behaviour the report was about: change
-- Van 1 and those types appear to change with it.
--
-- ⚠️ THE RESOLVER CHAIN IS NOT CHANGED BY THIS BUILD. A NULL goes on falling back to the van, so this
-- migration is a DATA change and the code works identically with or without it. That is deliberate:
-- the two can be applied in either order and neither is a deploy-coupled risk.
--
-- 🔴 ONLY ROWS THAT EXIST ARE TOUCHED, AND ONLY THEIR NULL COLUMNS. `coalesce(et.col, <van value>)`
-- per column, so a value the operator has already chosen is never overwritten.
-- ⚠️ A TRUCK WITH NO ACTIVE VAN IS SKIPPED (`where fv.van_id is not null`): there is nothing to copy
-- from, and writing `false` for it would be asserting something that is not known.
begin;

with first_van as (
  select distinct on (v.truck_id)
         v.truck_id, v.id as van_id,
         v.buzzer_count, v.order_ready_enabled, v.auto_pause_on_offline,
         v.offline_protection_mode, v.collection_interval_mins, v.takes_cash
    from public.truck_vans v
   where v.active
   order by v.truck_id, v.created_at asc
)
update public.event_types et
   set buzzer_prompt            = coalesce(et.buzzer_prompt, fv.buzzer_count is not null),
       takes_cash               = coalesce(et.takes_cash, fv.takes_cash, t.takes_cash, false),
       order_ready              = coalesce(et.order_ready, fv.order_ready_enabled, false),
       -- ⚠️ THE CUSTOMER GRID ONLY. A type sets what customers are offered; the operator's own grid
       -- follows it when it is not set separately (applyEventIntervals), and a type has never set it.
       collection_interval_mins = coalesce(et.collection_interval_mins, fv.collection_interval_mins),
       offline_protection       = coalesce(et.offline_protection, fv.auto_pause_on_offline, false),
       -- ⚠️ `'pause'` IS THE LAST LINK, matching the resolver and heartbeat-monitor/index.ts:106:
       -- "'pause' is what offline protection has always meant".
       offline_protection_mode  = coalesce(et.offline_protection_mode, fv.offline_protection_mode, 'pause'),
       updated_at               = now()
  from first_van fv, public.trucks t
 where fv.truck_id = et.truck_id
   and t.id = et.truck_id
   and fv.van_id is not null
   and (et.buzzer_prompt is null
     or et.takes_cash is null
     or et.order_ready is null
     or et.collection_interval_mins is null
     or et.offline_protection is null
     or et.offline_protection_mode is null);

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA and `truck_vans.takes_cash` reads as a missing
--    column (PGRST204 / 42703). The application fails OPEN on exactly those codes — every van follows
--    `trucks.takes_cash`, which is today's behaviour — so the result is not an outage; it is the
--    per-van switch silently not appearing on correct code.
notify pgrst, 'reload schema';
