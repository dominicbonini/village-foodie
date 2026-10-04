-- 20261009_event_types.sql
-- Event types, stages 1 + 2: a named preset a truck picks when adding an event, which supplies the
-- SERVICE settings for that event unless the truck has changed them on that event by hand.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent, so re-running is safe. The last line reloads PostgREST — do not skip it, or
--    every read below returns PGRST205 and the feature reports no types.
--
-- ── 🔴 RESOLVE ON READ. NOTHING IS COPIED ONTO AN EVENT ───────────────────────────────────────────
-- `truck_events.event_type_id` is the WHOLE state. A type never writes to an event's override columns
-- and never creates a per-event row. Every effective value is computed at read time by one pure
-- function per setting in lib/event-types/resolve.ts:
--
--     effective = the event's own hand-set override  ??  the type's value  ??  today's van/truck default
--
-- That is why this migration adds no per-event snapshot table and no "applied_at" marker: there is
-- nothing to apply, so there is nothing to keep in step, nothing to unwind on a type switch, and
-- switching an event's type is ONE column write.
--
-- ── 🔴 A TRUCK WITH NO TYPES IS UNTOUCHED, AND THE SCHEMA IS WHAT GUARANTEES IT ───────────────────
-- `event_type_id` is NULLABLE WITH NO DEFAULT. Every existing row reads NULL, every resolver returns
-- today's expression unchanged for NULL, and `event_types` is empty until a truck creates one. The
-- nullability is load-bearing, exactly as recorded in
-- 20260730_truck_events_show_paid_step_override.sql: a `NOT NULL DEFAULT` column could not express
-- "no type" at all — every event would be typed the moment it was created.
--
-- ── 🔴 ADDITIVE ONLY. NO COLUMN IS DROPPED, WIDENED OR BACKFILLED ────────────────────────────────
-- `truck_events` gains two nullable columns and nothing else. The stock, deals and price tables are
-- not touched by this build; later stages add their own.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · THE TYPE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.event_types (
  id uuid primary key default gen_random_uuid(),

  -- 🔴 TEXT, NOT uuid. `trucks.id` is TEXT — live ids are slugs like 'pizzeria-gusto'. Declaring this
  -- uuid fails the migration outright, or (with a cast somewhere) silently never matches. Same rule as
  -- truck_places, whatsapp_connections and whatsapp_alerts.
  truck_id text not null references public.trucks(id) on delete cascade,

  -- What the truck calls it: 'Festival', 'Pub', 'Market', 'Private hire', or anything they type.
  name text not null,

  -- The left-to-right order of the columns on the setup screen. Standard is not a row in this table —
  -- it is the absence of a type — so it is always first and needs no sort value.
  sort_order smallint not null default 0,

  -- ── THE SERVICE SETTINGS A TYPE MAY SUPPLY ─────────────────────────────────────────────────────
  -- 🔴 NULL MEANS "SAME AS STANDARD" ON EVERY ONE OF THESE, and that is the whole vocabulary. A type
  -- that sets nothing resolves to exactly what the event would have resolved to without it, so a new
  -- type (which starts as a copy of Standard, i.e. all NULL) changes nothing until the truck edits it.
  -- ⚠️ NULLABLE, NOT "NOT NULL DEFAULT false". `false` is a real, different instruction — "switch this
  -- off for this type" — and a NOT NULL column could not say "leave it alone". The three-state shape
  -- is the same one the per-event override columns use, for the same reason.

  -- The after-order buzzer prompt. Resolves against truck_events.buzzer_prompt, then
  -- "this van has buzzers" (resolveBuzzerPrompt, lib/buzzer.ts). ⚠️ A type can never conjure a prompt
  -- for a van with no buzzer rack — truck_vans.buzzer_count null still wins, because there is nothing
  -- to hand out.
  buzzer_prompt boolean,

  -- Whether this event splits the paid action into Cash/Card. Resolves against
  -- truck_events.takes_cash_override, then trucks.takes_cash (resolvePaidStep,
  -- lib/payments/paid-step.ts). ⚠️ OPERATOR-SIDE ONLY: it adds a button on the dashboard and the KDS.
  -- It is read by no customer surface and by nothing in the fee engine.
  takes_cash boolean,

  -- The "mark ready" step. Resolves against truck_events.order_ready_override, then
  -- truck_vans.order_ready_enabled. 🔴 SEE SECTION 3 — this one needs a second column to work at all.
  order_ready boolean,

  -- The CUSTOMER collection-time grid, in minutes. Resolves against
  -- truck_events.collection_interval_mins_override, then the van's pair (applyEventIntervals,
  -- lib/slot-interval.ts).
  -- ⚠️ THE OPERATOR GRID IS DELIBERATELY NOT HERE. A type sets what customers are offered; the
  -- operator's own grid is a working preference of whoever is on the van that day, and
  -- applyEventIntervals already makes the operator value follow the customer one when it is not set
  -- separately. One column, one meaning.
  -- ⚠️ NOT CONSTRAINED TO THE FIVE CHOICES. `normaliseInterval` (lib/slot-interval.ts:46) already
  -- coerces anything outside {5,10,15,20,30} to the default, so a CHECK here would 500 a write that
  -- the application already handles safely.
  collection_interval_mins integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_types_name_not_blank check (length(btrim(name)) > 0)
);

-- 🔴 ONE TYPE PER NAME PER TRUCK, CASE-INSENSITIVELY. "Festival" and "festival" are the same type to
-- the operator who typed them, and two columns with the same heading on the setup screen would be
-- indistinguishable. A functional unique index is the only way to say this; a table constraint cannot
-- hold `lower()`.
create unique index if not exists event_types_truck_name_uidx
  on public.event_types (truck_id, lower(name));

create index if not exists event_types_truck_idx
  on public.event_types (truck_id, sort_order);

comment on table public.event_types is
  'A named preset a truck picks when adding an event. Stages 1-2 carry SERVICE settings only (buzzer prompt, take cash, the mark-ready step, the customer collection grid); prices, items, stock, deals and private visibility are later stages and are NOT in this table yet. Every column is nullable and NULL means "same as Standard" — resolved at READ time by lib/event-types/resolve.ts as `event override ?? type ?? van/truck default`. Nothing is ever copied onto an event: truck_events.event_type_id is the whole state.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · THE EVENT'S TYPE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 `on delete set null`, NEVER cascade. Deleting a type must not delete the truck's EVENTS. Those
-- events become Standard, which is what the delete confirm on the setup screen says happens.
alter table public.truck_events
  add column if not exists event_type_id uuid references public.event_types(id) on delete set null;

create index if not exists truck_events_event_type_idx
  on public.truck_events (event_type_id)
  where event_type_id is not null;

comment on column public.truck_events.event_type_id is
  'Optional event type for this event. NULL = Standard, which is the state of every row before 20261009 and of every event created by the dashboard draft, the inbound/scraper bridge and demo provisioning. When set, lib/event-types/resolve.ts supplies this event''s service settings from the type UNLESS the truck has changed that setting on this event by hand, which always wins. Nullable with NO DEFAULT deliberately: a NOT NULL DEFAULT could not express "no type". on delete set null so deleting a type never deletes events.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · 🔴 THE ONE SETTING THAT COULD NOT OTHERWISE WORK: order_ready_source
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE PROBLEM, stated plainly. `truck_events.order_ready_override` is unlike every other per-event
-- override: it is SEEDED at event creation by all three real creation paths
-- (app/api/manage/route.ts:872, app/api/dashboard/action/route.ts:1209,
-- app/api/inbound-schedule/route.ts:182) and BULK-WRITTEN onto every event when the van default flips
-- (app/api/manage/route.ts:1981-1988, "including events previously toggled on the dashboard (they
-- reset to the new value, by design)"). So the column is NEVER null in practice — which means under
-- `event override ?? type ?? default` a type could NEVER win for the mark-ready step. The setting
-- would be offered on the type screen and silently do nothing.
--
-- THE FIX: record WHO set the value, so "the truck chose this" can be told apart from "this is just
-- what the default was at the time".
--
--   'seed'  — written by a creation path or by the Settings master switch. NOT a choice about THIS
--             event, so a type outranks it.
--   'truck' — written by the dashboard's per-event toggle. A deliberate choice about THIS event, so it
--             outranks the type. This is decision 2, "hand changes win".
--   NULL    — every row that existed before this migration, and every row a path writes without
--             saying. Treated as 'seed' ONLY where it is safe to do so; see the next paragraph.
--
-- 🔴 WHY NULL IS NOT SIMPLY TREATED AS 'seed'. A truck may have toggled the mark-ready step on one
-- event from the dashboard BEFORE this migration, and that row is indistinguishable from a seeded one.
-- Reading every NULL as 'seed' would let a newly-assigned type silently overrule a real choice. So:
--   • NO TYPE ⇒ this column is NOT READ AT ALL and the resolver returns `override ?? vanDefault`,
--     byte-identical to today. Untyped events and untyped trucks cannot be affected by any of this.
--   • A TYPE, and source IS NULL ⇒ the stored value is inferred: if it EQUALS the van's current
--     default it cannot be distinguished from a seed and the type wins; if it DIFFERS, somebody chose
--     it and it wins. The indistinguishable case is harmless by construction — when the stored value
--     equals the default, "the truck chose the default" and "nobody chose anything" produce the same
--     answer for every event that has no type, and for a typed event the type is the more recent and
--     more specific statement.
--   • A TYPE, and source = 'truck' ⇒ the override wins, always.
--
-- ⚠️ NO BACKFILL. Writing 'seed' onto existing rows would assert something about them that is not
-- known, which is the error 20260730_takes_cash_and_payment_method.sql refused to make about
-- order_payments.method. NULL means "not recorded", which is exactly what happened.
--
-- ⚠️ THIS CHANGES NOTHING FOR AN UNTYPED TRUCK. The creation paths keep seeding the same value they
-- seed today; they merely also say that they seeded it. The bulk write keeps writing every event.
alter table public.truck_events
  add column if not exists order_ready_source text;

alter table public.truck_events
  drop constraint if exists truck_events_order_ready_source_check;

alter table public.truck_events
  add constraint truck_events_order_ready_source_check
  check (order_ready_source is null or order_ready_source in ('seed', 'truck'));

comment on column public.truck_events.order_ready_source is
  'Who set truck_events.order_ready_override. ''seed'' = a creation path or the Settings master switch wrote it, so it is not a choice about THIS event and an event type outranks it. ''truck'' = the dashboard''s per-event toggle wrote it, so it outranks the type. NULL = not recorded (every row before 20261009). READ ONLY WHEN THE EVENT HAS A TYPE: with no type the resolver uses `order_ready_override ?? van default` exactly as before, so untyped events are unaffected. Exists because order_ready_override is seeded at creation and bulk-written when the van default changes, so without it a type could never win for the mark-ready step. See lib/event-types/resolve.ts and docs/event-types-stage1-report.md.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · RLS + GRANTS — SERVICE ROLE ONLY
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 THE SAME THREE DEFENCES AS truck_post_designs AND truck_places, and the third is the one that
-- does the work: enabling RLS alone leaves Supabase's default grants in place, so the capability is
-- still reachable with the anon key and merely default-denied. The REVOKE removes it.
alter table public.event_types enable row level security;
drop policy if exists "service_role only" on public.event_types;
create policy "service_role only" on public.event_types
  for all to service_role using (true) with check (true);
revoke all on public.event_types from anon, authenticated, public;

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: `event_types` reads as absent (PGRST205),
--    `event_type_id` and `order_ready_source` read as missing columns (PGRST204 / 42703), and the
--    feature reports no types on correct code.
notify pgrst, 'reload schema';
