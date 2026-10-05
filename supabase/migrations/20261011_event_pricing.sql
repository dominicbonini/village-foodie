-- 20261011_event_pricing.sql
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 CORRECTION, 5 October 2026 — READ THIS BEFORE SECTION 3's INDEXES. SUPERSEDED BY 20261013.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- Section 3 creates the uniqueness as two PARTIAL indexes and argues, in capitals, that plain unique
-- constraints "would NOT hold" because NULLs are distinct in Postgres. **That reasoning is wrong for
-- this table, and the partial predicates broke the feature.**
--
--   • WHY IT BROKE: PostgREST's `on_conflict=` becomes `ON CONFLICT (cols)`, and Postgres' conflict
--     inference **cannot target a partial index**. So every save of a typed per-item price failed with
--     42P10 "there is no unique or exclusion constraint matching the ON CONFLICT specification", at
--     planning time, before writing anything.
--   • WHY PLAIN UNIQUE IS ENOUGH: a TYPE row always has `event_type_id` set, so
--     `UNIQUE (event_type_id, item_id)` is fully enforced for it; an EVENT row always has `event_id`
--     set; and `event_item_prices_one_owner` guarantees exactly one owner, so every row falls under
--     one of the two constraints. The NULLs-are-distinct concern only bites a row with BOTH owners
--     null, which the CHECK makes impossible.
--
-- ⚠️ THIS FILE IS DELIBERATELY NOT EDITED BELOW. It has been APPLIED, and an applied migration is a
-- record of what ran — rewriting it would make the repository disagree with the database's history.
-- `20261013_event_item_prices_unique.sql` drops the two partial indexes and adds the plain
-- constraints. Do not re-derive section 3's argument from the text below; it is kept only as the
-- record of what was created and why it was thought correct at the time.
--
-- EVENT PRICING, stage 3: what an item costs at an event — per event type, and per event.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent, so re-running is safe. The last line reloads PostgREST — do not skip it, or
--    every read below answers PGRST204/PGRST205 and the feature reports that prices are not on.
--
-- ── 🔴 RESOLVE ON READ, LIKE THE SERVICE SETTINGS BEFORE IT ───────────────────────────────────────
-- Nothing is copied onto an event and nothing is copied onto an order until the order is PLACED.
-- Every effective price is computed at read time by one pure function in lib/event-pricing/price.ts:
--
--     effective = the EVENT's own prices (when truck_events.price_own)
--              ?? the TYPE's prices       (when event_types.price_change_on)
--              ?? menu_items_db.price
--
--   and within whichever applies:   that setup's TYPED price for the item  ??  its RULE on the menu price
--
-- So there is no snapshot table, nothing to keep in step, and nothing to unwind when a type changes.
--
-- ── 🔴 A TRUCK WITH NO EVENT TYPES AND NO EVENT OWN-PRICES IS UNTOUCHED ───────────────────────────
-- `price_change_on` and `price_own` are `NOT NULL DEFAULT false`, so every existing row reads false,
-- `resolvePricing` returns "menu prices", and `loadEventPriceBook` returns `loadPriceBook`'s own
-- object by reference. `event_item_prices` is empty until a truck types a price.
--
-- ⚠️ THE TWO SWITCHES ARE `NOT NULL DEFAULT false` WHILE THE SERVICE COLUMNS ARE NULLABLE, AND THAT
-- IS NOT AN INCONSISTENCY. A service setting is three-state — null means "same as Standard" — because
-- a type INHERITS the van's value for it. Pricing has nothing to inherit: there is no per-van price
-- and no truck-level price rule, only the menu. "Off" and "not set" are the same instruction here —
-- charge the menu price — so a boolean says it, and `?? ` has nothing to fall through to.
--
-- ── 🔴 ADDITIVE ONLY. NO COLUMN IS DROPPED, WIDENED OR BACKFILLED. ────────────────────────────────
-- ⚠️ `public.event_price_overrides` EXISTS IN PRODUCTION, HOLDS 0 ROWS AND IS READ BY NOTHING
-- (no code path, no function, no view — searched before this migration was written). It is UNUSED
-- LEGACY and it is deliberately **NOT DROPPED and NOT USED** here: its shape is wrong for this
-- feature (it keys on an `event_name` text column and carries `valid_from`/`valid_until` windows
-- nothing enforces, and it has no per-TYPE form at all). Dominic decides its fate separately.
-- 🔴 DO NOT "TIDY" IT INTO THIS FEATURE. A table with a plausible name and the wrong shape is how a
-- later reader comes to write prices into a column nothing reads.

set lock_timeout = '3s';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 0 · 🔴 THE SHAPE GUARD — RUN BEFORE ANYTHING IS CHANGED
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Sections 3's foreign keys assume `truck_events.id` and `menu_items_db.id` are BOTH uuid, and
-- `event_item_prices.truck_id` assumes `trucks.id` is TEXT. Every one of those was checked against
-- this repository's own migrations before this file was written (truck_events(id) is the target of
-- three uuid FKs; `item_modifier_groups.excluded_option_ids` is `uuid[]` of menu option ids;
-- `trucks.id` is text — live ids are slugs like 'pizzeria-gusto').
--
-- 🔴 BUT A MIGRATION THAT ASSUMES A TYPE SHOULD PROVE IT, NOT TRUST A GREP. Postgres would refuse the
-- FK anyway — with `foreign key constraint cannot be implemented`, from inside a transaction that has
-- already added four columns to `event_types`. This aborts FIRST, with a sentence, so a wrong
-- assumption costs nothing and says what it was. Same device as docs/event-option-stock-alter.sql.
do $$
declare t text;
begin
  select data_type into t from information_schema.columns
   where table_schema = 'public' and table_name = 'truck_events' and column_name = 'id';
  if t is distinct from 'uuid' then
    raise exception 'ABORT: truck_events.id is %, not uuid. STOP and tell Dominic — the FKs in section 3 assume uuid.', coalesce(t, 'absent');
  end if;

  select data_type into t from information_schema.columns
   where table_schema = 'public' and table_name = 'menu_items_db' and column_name = 'id';
  if t is distinct from 'uuid' then
    raise exception 'ABORT: menu_items_db.id is %, not uuid. STOP and tell Dominic — the FKs in section 3 assume uuid.', coalesce(t, 'absent');
  end if;

  select data_type into t from information_schema.columns
   where table_schema = 'public' and table_name = 'trucks' and column_name = 'id';
  if t is distinct from 'text' then
    raise exception 'ABORT: trucks.id is %, not text. event_item_prices.truck_id assumes text.', coalesce(t, 'absent');
  end if;

  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'event_types') then
    raise exception 'ABORT: public.event_types does not exist. Apply 20261009_event_types.sql first.';
  end if;
end $$;

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · THE TYPE'S PRICES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 THE SWITCH IS SEPARATE FROM THE RULE, AND THAT IS DECISION 1. Switching "Change prices" OFF must
-- KEEP the saved rule and the typed rows so that switching it back on restores exactly what was
-- there. If "off" were expressed by clearing `price_mode` (or by deleting the `event_item_prices`
-- rows) the operator would lose the setup every time they tried charging menu prices for a weekend.
-- Nothing in the application clears a column or deletes a row when the switch goes off.
alter table public.event_types
  add column if not exists price_change_on boolean not null default false;

-- 'none' = TYPED PRICES ONLY — the setup is on and the operator has asked for no across-the-board
-- change. NULL is the same instruction; the application reads anything unrecognised as 'none'.
alter table public.event_types add column if not exists price_mode text;
alter table public.event_types drop constraint if exists event_types_price_mode_check;
alter table public.event_types
  add constraint event_types_price_mode_check
  check (price_mode is null or price_mode in ('none', 'add_gbp', 'add_pct', 'sub_gbp', 'sub_pct'));

-- POUNDS for a £ mode, PERCENT for a % mode. ⚠️ ONE COLUMN FOR BOTH, because the MODE already says
-- which it is and two columns would allow a row that says "+10%" and stores £10 in the other one.
-- `numeric(8,2)` is the same precision every money column in this schema uses.
-- 🔴 `>= 0` AND THE DIRECTION LIVES IN THE MODE. A negative amount under 'add_gbp' would be a second,
-- silent way to express a discount, and the two could disagree on the screen.
alter table public.event_types add column if not exists price_amount numeric(8,2);
alter table public.event_types drop constraint if exists event_types_price_amount_check;
alter table public.event_types
  add constraint event_types_price_amount_check
  check (price_amount is null or price_amount >= 0);

-- ⚠️ `NOT NULL DEFAULT 'none'` HERE, NULLABLE ON truck_events (section 2). On a type the screen always
-- shows a rounding control when the switch is on, so there is always a value; on an event the column
-- is only meaningful when `price_own` is true, and NULL is how a row with no own prices says nothing.
alter table public.event_types
  add column if not exists price_rounding text not null default 'none';
alter table public.event_types drop constraint if exists event_types_price_rounding_check;
alter table public.event_types
  add constraint event_types_price_rounding_check
  check (price_rounding in ('none', 'nearest_1', 'up_1'));

comment on column public.event_types.price_change_on is
  'Does this type change prices at all? false (the default, and every row before 20261011) = events of this type charge menu prices EXACTLY. Switching it off KEEPS price_mode/price_amount/price_rounding and this type''s event_item_prices rows, unused, so switching it back on restores the setup — nothing is cleared and nothing is deleted. See lib/event-pricing/price.ts resolvePricing.';
comment on column public.event_types.price_mode is
  'The across-the-board price rule: none | add_gbp | add_pct | sub_gbp | sub_pct. ''none'' means TYPED PRICES ONLY (event_item_prices), not "no pricing" — that is price_change_on = false. Applies to EVERY menu item; it does NOT change modifier_options.price_adjustment or bundles_db.bundle_price, which stay as the menu. Read only when price_change_on is true.';
comment on column public.event_types.price_amount is
  'POUNDS when price_mode is add_gbp/sub_gbp, PERCENT when it is add_pct/sub_pct. One column for both because the mode says which. Always >= 0 — the direction is the mode''s, never a sign here. NULL or 0 ⇒ the rule does nothing.';
comment on column public.event_types.price_rounding is
  'Applied AFTER the rule, never to a typed price: none | nearest_1 (to the nearest whole pound, halves up — £11.50 becomes £12) | up_1 (ceiling to the whole pound — £2.20 becomes £3). An item priced £0 on the menu stays £0 under any rule, and where rounding would turn a non-zero price into £0 the unrounded price stands (£0.40 − 10% = £0.36, not free). lib/event-pricing/price.ts applyPriceRule is the only implementation.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · THE EVENT'S OWN PRICES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 "OWN PRICES FOR THIS EVENT" REPLACES THE TYPE'S WHOLE (decision 4). When `price_own` is true the
-- type's pricing is not consulted at all — not the rule, not a typed price this event has no opinion
-- about. What makes that bearable is a COPY at the moment of choosing: the dashboard sheet seeds the
-- event's columns and rows from the type's current setup (or from the menu when the type's switch is
-- off / there is no type). Afterwards the two are independent, and editing the type does not reach
-- this event. Merging them at read time instead would mean an operator who REMOVED a typed price
-- from their event silently got the type's back, with nothing on screen to explain it.
alter table public.truck_events
  add column if not exists price_own boolean not null default false;

alter table public.truck_events add column if not exists price_mode text;
alter table public.truck_events drop constraint if exists truck_events_price_mode_check;
alter table public.truck_events
  add constraint truck_events_price_mode_check
  check (price_mode is null or price_mode in ('none', 'add_gbp', 'add_pct', 'sub_gbp', 'sub_pct'));

alter table public.truck_events add column if not exists price_amount numeric(8,2);
alter table public.truck_events drop constraint if exists truck_events_price_amount_check;
alter table public.truck_events
  add constraint truck_events_price_amount_check
  check (price_amount is null or price_amount >= 0);

-- ⚠️ NULLABLE HERE (section 1 explains the asymmetry). NULL reads as 'none'.
alter table public.truck_events add column if not exists price_rounding text;
alter table public.truck_events drop constraint if exists truck_events_price_rounding_check;
alter table public.truck_events
  add constraint truck_events_price_rounding_check
  check (price_rounding is null or price_rounding in ('none', 'nearest_1', 'up_1'));

-- 🔴 PARTIAL, because true is the rare case. An index over a column that is false on every row in the
-- table would be read by nothing.
create index if not exists truck_events_price_own_idx
  on public.truck_events (truck_id, event_date)
  where price_own;

comment on column public.truck_events.price_own is
  'Does this event have its own prices, REPLACING its type''s whole? false (the default, and every row before 20261011) = this event follows its event type''s prices, or the menu when the type''s switch is off or there is no type. true = price_mode/price_amount/price_rounding on THIS row plus this event''s event_item_prices rows are the whole of it, and the type is not consulted. Set by the dashboard''s "Prices for this event" sheet, which seeds these columns as a COPY of the type''s current setup. Cleared by the card''s Reset and by "Clear my changes".';
comment on column public.truck_events.price_mode is
  'This event''s own price rule, read ONLY when price_own is true. Same vocabulary and same meaning as event_types.price_mode.';
comment on column public.truck_events.price_amount is
  'This event''s own amount, read ONLY when price_own is true. POUNDS or PERCENT per price_mode; always >= 0.';
comment on column public.truck_events.price_rounding is
  'This event''s own rounding, read ONLY when price_own is true. NULL reads as ''none''. Same three values as event_types.price_rounding.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · THE TYPED PER-ITEM PRICES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ONE TABLE FOR BOTH OWNERS, with exactly one of the two owner columns set. The alternative — a
-- table per owner — would mean two schemas, two readers, two writers and two places for the
-- precedence rule to be implemented slightly differently.
--
-- 🔴 KEYED ON `item_id`, NOT ON `item_name`, AND THAT IS A DELIBERATE DEPARTURE FROM
-- `event_item_stock` (which keys on `item_name`). Two properties follow and both are wanted:
--   • A RENAME KEEPS THE PRICE. "Margherita" becoming "Margherita Pizza" would silently lose a typed
--     price under a name key, with nothing to report it.
--   • A DELETE TAKES THE PRICE WITH IT, through `on delete cascade`, so no row can outlive its dish
--     and quietly price a different one if the name is reused.
-- ⚠️ THE PRICE BOOK IS STILL KEYED BY NAME, because an order line carries a name and no id. The id →
-- name mapping happens ONCE, in loadEventPriceBook, where the names are already in hand.
create table if not exists public.event_item_prices (
  id uuid primary key default gen_random_uuid(),

  -- 🔴 TEXT, NOT uuid. `trucks.id` is TEXT — live ids are slugs like 'pizzeria-gusto'. Declaring this
  -- uuid fails the migration outright, or (with a cast somewhere) silently never matches. Same rule
  -- as event_types, truck_places and whatsapp_connections.
  -- ⚠️ IT IS DENORMALISED ON PURPOSE: the Event types grid needs EVERY type's typed prices in one
  -- read, and without a truck column that is one query per type on a screen an operator opens to
  -- look at five numbers.
  truck_id text not null references public.trucks(id) on delete cascade,

  -- EXACTLY ONE of these two is set — see the CHECK below.
  event_type_id uuid references public.event_types(id) on delete cascade,
  event_id uuid references public.truck_events(id) on delete cascade,

  item_id uuid not null references public.menu_items_db(id) on delete cascade,

  -- POUNDS, like every other price column in this schema (menu_items_db.price,
  -- bundles_db.bundle_price, modifier_options.price_adjustment are all pounds).
  -- 🔴 £0 IS A LEGITIMATE TYPED PRICE — "this is free at festivals" — which is why the application
  -- resolves typed prices with `??` and never `||`.
  price numeric(8,2) not null check (price >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 🔴 EXACTLY ONE OWNER. A row with both set would be read by two different resolvers with two
  -- different precedences; a row with neither would be unreachable and invisible.
  constraint event_item_prices_one_owner
    check ((event_type_id is not null) <> (event_id is not null))
);

-- 🔴 TWO PARTIAL UNIQUE INDEXES, NOT ONE CONSTRAINT ON (event_type_id, item_id, event_id).
-- A plain unique constraint over nullable columns does NOT prevent duplicates: in Postgres NULLs are
-- distinct, so (null, 'festival-id', item) could be inserted twice and both rows would be returned.
-- A partial index scoped to `where <owner> is not null` has no NULLs in it and really is unique.
create unique index if not exists event_item_prices_type_item_uidx
  on public.event_item_prices (event_type_id, item_id)
  where event_type_id is not null;

create unique index if not exists event_item_prices_event_item_uidx
  on public.event_item_prices (event_id, item_id)
  where event_id is not null;

-- The grid's one-read-per-truck path (section 3's denormalisation note).
create index if not exists event_item_prices_truck_idx
  on public.event_item_prices (truck_id);

comment on table public.event_item_prices is
  'A typed per-item price that OVERRIDES its owner''s price rule for that one item, and is NEVER rounded. Exactly one of event_type_id / event_id is set (CHECK event_item_prices_one_owner): a row belongs either to an event TYPE or to a single EVENT. Sparse — a row exists only where the operator typed a price; absence means "use the rule". Keyed on item_id (not item_name, unlike event_item_stock) so a rename keeps the price and a delete cascades it away. Read by lib/event-pricing/read.ts; resolved by lib/event-pricing/price.ts. RLS on, service-role only.';
comment on column public.event_item_prices.price is
  'POUNDS, >= 0. £0 is a legitimate typed price ("free at festivals"), which is why every resolver uses ?? and never ||. Never rounded by price_rounding — it is the number the operator typed, to the penny.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · RLS + GRANTS — SERVICE ROLE ONLY
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 THE SAME THREE DEFENCES AS event_types, truck_places AND truck_post_designs, and the third is
-- the one that does the work: enabling RLS alone leaves Supabase's default grants in place, so the
-- capability is still reachable with the anon key and merely default-denied. The REVOKE removes it.
-- ⚠️ IT HOLDS PRICES CUSTOMERS WILL BE CHARGED. An anon-reachable write here is an anon-reachable
-- price change.
alter table public.event_item_prices enable row level security;
drop policy if exists "service_role only" on public.event_item_prices;
create policy "service_role only" on public.event_item_prices
  for all to service_role using (true) with check (true);
revoke all on public.event_item_prices from anon, authenticated, public;

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: `event_item_prices` reads as absent
--    (PGRST205) and every column above reads as missing (PGRST204 / 42703). The application fails
--    OPEN to menu prices on exactly those codes, so the result is not an outage — it is the feature
--    silently reporting that prices are not switched on, on correct code.
notify pgrst, 'reload schema';
