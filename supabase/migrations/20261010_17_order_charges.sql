-- 20261010_17_order_charges.sql
-- Phase 3 foundations: TAX, TIPS AND FEES in the database (docs/phase-3-foundations-report.md).
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL editor.
--
-- ✅ CLASSIFICATION: ADDITIVE. RUN NOW — BEFORE THIS CODE IS TESTED OR DEPLOYED. The new code selects these
--    columns BY NAME (order_drafts' DRAFT_ROW_COLUMNS, the country_settings loader) and calls
--    place_order_atomic_v2, so it needs this first. The code that is live today never reads any of them.
--    • Every new column is NULLABLE or has a DEFAULT. Nothing is backfilled; an existing order keeps NULL
--      in food_minor / tax_inclusive / tax_label / card_fee_payer and 0 in the amount columns.
--    • Safe to run twice: `add column if not exists`, each CHECK added only when missing, and
--      `create or replace` for the new function.
--    • Nothing is dropped. place_order_atomic (20260804) is NOT touched; the new code calls the NEW
--      place_order_atomic_v2 below. The old function stays for any build still running.
--    • Nothing is switched on: the new country_settings columns default to off, and GB and US take the
--      defaults.
--
-- ── WHAT EACH ORDER STORES (decisions D2–D4, D11, D18) ──────────────────────────────────────────────────
--   food_minor             food after the discount, before tax, tip and fees. The platform-fee base (D18).
--   tax_minor              the tax ADDED on top. 0 where prices include tax (GB).
--   tax_rate_bps           the rate used, basis points (825 = 8.25 %). NULL where prices include tax.
--   tax_inclusive          the country's rule at the time: true = prices include tax (GB).
--   tax_label              the tax's name at the time ('VAT', 'Sales tax').
--   tip_minor              the online tip. Never taxed, never in food_minor.
--   tip_pct_bps            the tip as a percentage of food_minor, when a preset was chosen (D14).
--   service_fee_minor      the online service fee, percentage and fixed as one amount (D26).
--   service_fee_recipient  who keeps it: 'truck' or 'hatchgrab'. NULL unless a fee applies.
--   card_surcharge_minor   the card surcharge. Always 0 this phase (the resolver keeps it off).
--   card_funding           credit / debit / prepaid / unknown. Not written this phase.
--   card_fee_payer         who pays the card fee: 'truck' or 'customer'.
--   application_fee_minor  the platform fee (D19, taken at capture). Not written this phase.
--   total_minor            UNCHANGED MEANING: the GRAND total the customer pays.
--                          = food_minor + tax_minor + tip_minor + service_fee_minor + card_surcharge_minor
--
-- VERIFY AFTER APPLYING: the read-only block at the end of this file.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. orders and order_drafts — the snapshot, identical on both (promotion copies one to the other)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.orders add column if not exists food_minor            integer;
alter table public.orders add column if not exists tax_minor             integer not null default 0;
alter table public.orders add column if not exists tax_rate_bps          integer;
alter table public.orders add column if not exists tax_inclusive         boolean;
alter table public.orders add column if not exists tax_label             text;
alter table public.orders add column if not exists tip_minor             integer not null default 0;
alter table public.orders add column if not exists tip_pct_bps           integer;
alter table public.orders add column if not exists service_fee_minor     integer not null default 0;
alter table public.orders add column if not exists service_fee_recipient text;
alter table public.orders add column if not exists card_surcharge_minor  integer not null default 0;
alter table public.orders add column if not exists card_funding          text;
alter table public.orders add column if not exists card_fee_payer        text;
alter table public.orders add column if not exists application_fee_minor integer;

alter table public.order_drafts add column if not exists food_minor            integer;
alter table public.order_drafts add column if not exists tax_minor             integer not null default 0;
alter table public.order_drafts add column if not exists tax_rate_bps          integer;
alter table public.order_drafts add column if not exists tax_inclusive         boolean;
alter table public.order_drafts add column if not exists tax_label             text;
alter table public.order_drafts add column if not exists tip_minor             integer not null default 0;
alter table public.order_drafts add column if not exists tip_pct_bps           integer;
alter table public.order_drafts add column if not exists service_fee_minor     integer not null default 0;
alter table public.order_drafts add column if not exists service_fee_recipient text;
alter table public.order_drafts add column if not exists card_surcharge_minor  integer not null default 0;
alter table public.order_drafts add column if not exists card_funding          text;
alter table public.order_drafts add column if not exists card_fee_payer        text;
alter table public.order_drafts add column if not exists application_fee_minor integer;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. order_payments — what the platform fee was, and what of it went back
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.order_payments add column if not exists application_fee_minor          integer;
alter table public.order_payments add column if not exists application_fee_refunded_minor integer not null default 0;
alter table public.order_payments add column if not exists card_funding                   text;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. trucks — the truck's own settings (D1, D22, D26). NULL = "use the country's".
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.trucks add column if not exists tax_rate_bps            integer;
alter table public.trucks add column if not exists tipping_enabled         boolean;
alter table public.trucks add column if not exists card_fee_payer          text    not null default 'truck';
alter table public.trucks add column if not exists service_fee_enabled     boolean not null default false;
alter table public.trucks add column if not exists service_fee_bps         integer;
alter table public.trucks add column if not exists service_fee_fixed_minor integer;
alter table public.trucks add column if not exists base_region_code        text;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. truck_events — the per-event override of the truck's rate (D1)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.truck_events add column if not exists tax_rate_bps integer;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5. country_settings — the new settings. Every one defaults to OFF; GB and US take the defaults.
--    Reused, not added (see the report's mapping): prices_include_tax, tax_label, service_fee_allowed,
--    tipping_enabled_default, tip_presets_pct, platform_fee_pct, card_surcharge_*.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.country_settings add column if not exists service_fee_recipient            text    not null default 'truck';
alter table public.country_settings add column if not exists service_fee_hatchgrab_bps        integer;
alter table public.country_settings add column if not exists service_fee_hatchgrab_fixed_minor integer;
alter table public.country_settings add column if not exists service_fee_truck_max_bps        integer;
alter table public.country_settings add column if not exists service_fee_truck_max_fixed_minor integer;
alter table public.country_settings add column if not exists platform_fee_enabled             boolean not null default false;
alter table public.country_settings add column if not exists fees_taxed                       boolean not null default false;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 6. CHECKS — each added only when missing, so a second run is a no-op. A NULL passes every one.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  c record;
begin
  for c in
    select * from (values
      -- orders
      ('orders', 'orders_charges_nonneg_chk', 'check (food_minor >= 0 and tax_minor >= 0 and tip_minor >= 0 and service_fee_minor >= 0 and card_surcharge_minor >= 0 and application_fee_minor >= 0)'),
      ('orders', 'orders_charges_bps_chk', 'check (tax_rate_bps between 0 and 10000 and tip_pct_bps between 0 and 10000)'),
      ('orders', 'orders_service_fee_recipient_chk', 'check (service_fee_recipient in (''truck'', ''hatchgrab''))'),
      ('orders', 'orders_card_funding_chk', 'check (card_funding in (''credit'', ''debit'', ''prepaid'', ''unknown''))'),
      ('orders', 'orders_card_fee_payer_chk', 'check (card_fee_payer in (''truck'', ''customer''))'),
      -- order_drafts
      ('order_drafts', 'order_drafts_charges_nonneg_chk', 'check (food_minor >= 0 and tax_minor >= 0 and tip_minor >= 0 and service_fee_minor >= 0 and card_surcharge_minor >= 0 and application_fee_minor >= 0)'),
      ('order_drafts', 'order_drafts_charges_bps_chk', 'check (tax_rate_bps between 0 and 10000 and tip_pct_bps between 0 and 10000)'),
      ('order_drafts', 'order_drafts_service_fee_recipient_chk', 'check (service_fee_recipient in (''truck'', ''hatchgrab''))'),
      ('order_drafts', 'order_drafts_card_funding_chk', 'check (card_funding in (''credit'', ''debit'', ''prepaid'', ''unknown''))'),
      ('order_drafts', 'order_drafts_card_fee_payer_chk', 'check (card_fee_payer in (''truck'', ''customer''))'),
      -- order_payments
      ('order_payments', 'order_payments_application_fee_chk', 'check (application_fee_minor >= 0 and application_fee_refunded_minor >= 0)'),
      ('order_payments', 'order_payments_card_funding_chk', 'check (card_funding in (''credit'', ''debit'', ''prepaid'', ''unknown''))'),
      -- trucks
      ('trucks', 'trucks_tax_rate_bps_chk', 'check (tax_rate_bps between 0 and 10000)'),
      ('trucks', 'trucks_card_fee_payer_chk', 'check (card_fee_payer in (''truck'', ''customer''))'),
      ('trucks', 'trucks_service_fee_chk', 'check (service_fee_bps between 0 and 10000 and service_fee_fixed_minor >= 0)'),
      ('trucks', 'trucks_base_region_code_chk', 'check (base_region_code ~ ''^[A-Z]{2}$'')'),
      -- truck_events
      ('truck_events', 'truck_events_tax_rate_bps_chk', 'check (tax_rate_bps between 0 and 10000)'),
      -- country_settings
      ('country_settings', 'country_settings_service_fee_recipient_chk', 'check (service_fee_recipient in (''truck'', ''hatchgrab''))'),
      ('country_settings', 'country_settings_service_fee_bps_chk', 'check (service_fee_hatchgrab_bps between 0 and 10000 and service_fee_truck_max_bps between 0 and 10000)'),
      ('country_settings', 'country_settings_service_fee_fixed_chk', 'check (service_fee_hatchgrab_fixed_minor >= 0 and service_fee_truck_max_fixed_minor >= 0)')
    ) as v(tbl, name, def)
  loop
    if not exists (
      select 1 from pg_constraint k join pg_class r on r.oid = k.conrelid join pg_namespace n on n.oid = r.relnamespace
       where n.nspname = 'public' and r.relname = c.tbl and k.conname = c.name
    ) then
      execute format('alter table public.%I add constraint %I %s', c.tbl, c.name, c.def);
    end if;
  end loop;
end $$;

comment on column public.orders.food_minor is
  'Food after the discount, before tax, tip and fees, in minor units. The platform-fee base (D18). NULL on orders placed before Phase 3. total_minor stays the GRAND total. Phase 3.';
comment on column public.orders.tax_minor is
  'Tax added on top, minor units, rounded once per order half away from zero (D3). 0 where prices include tax (GB). Phase 3.';
comment on column public.orders.tax_rate_bps is
  'The tax rate used, in basis points (825 = 8.25%), from the event override else the truck (D1). NULL where prices include tax. Phase 3.';
comment on column public.orders.tax_inclusive is
  'The country''s rule when the order was priced: true = prices include tax (GB). Snapshot (D4). Phase 3.';
comment on column public.orders.tax_label is
  'The tax''s name when the order was priced (''VAT'', ''Sales tax''). Snapshot (D4). Phase 3.';
comment on column public.orders.tip_minor is
  'The online tip, minor units: a percentage of food_minor (D11), or a custom amount capped at 100% of it (D12). Never taxed. Online card orders only (D13). Phase 3.';
comment on column public.orders.tip_pct_bps is
  'The tip as basis points of food_minor when a percentage was chosen; an operator edit keeps it (D14). NULL for no tip or a custom amount. Phase 3.';
comment on column public.orders.service_fee_minor is
  'The online service fee, percentage and fixed together as one amount (D26). Online orders only; dropped for pay at the truck (D25). Phase 3.';
comment on column public.orders.service_fee_recipient is
  'Who keeps the service fee: ''truck'' or ''hatchgrab''. NULL unless a fee applies. Phase 3.';
comment on column public.orders.card_surcharge_minor is
  'The card surcharge, minor units. Always 0 in Phase 3. Phase 3.';
comment on column public.orders.card_funding is
  'The card''s funding: credit / debit / prepaid / unknown. Not written in Phase 3. Phase 3.';
comment on column public.orders.card_fee_payer is
  'Who pays the card fee: ''truck'' or ''customer'', from the truck. Phase 3.';
comment on column public.orders.application_fee_minor is
  'The platform fee for this order (D19: taken at capture). Not written in Phase 3. Phase 3.';

comment on column public.order_payments.application_fee_minor is
  'The platform fee on this payment, minor units. Not written in Phase 3. Phase 3.';
comment on column public.order_payments.application_fee_refunded_minor is
  'How much of application_fee_minor was refunded. Phase 3.';
comment on column public.order_payments.card_funding is
  'The card''s funding: credit / debit / prepaid / unknown. Not written in Phase 3. Phase 3.';

comment on column public.trucks.tax_rate_bps is
  'The truck''s own sales-tax rate, basis points (D1). NULL = none set. Ignored where the country''s prices include tax. Phase 3.';
comment on column public.trucks.tipping_enabled is
  'Online tips on or off for this truck. NULL = the country''s tipping_enabled_default. Phase 3.';
comment on column public.trucks.card_fee_payer is
  'Who pays the card fee: ''truck'' (default) or ''customer''. Phase 3.';
comment on column public.trucks.service_fee_enabled is
  'The truck''s own online service fee on or off (when the country lets the truck keep it). Phase 3.';
comment on column public.trucks.service_fee_bps is
  'The truck''s service-fee percentage, basis points, within the country maximum. Phase 3.';
comment on column public.trucks.service_fee_fixed_minor is
  'The truck''s fixed service fee, minor units, within the country maximum. Phase 3.';
comment on column public.trucks.base_region_code is
  'The base state''s two-letter code from Places (D22), e.g. ''TX''. NULL when Places gives none or it is not two letters. Nothing displays it. Phase 3.';

comment on column public.truck_events.tax_rate_bps is
  'A per-event override of the truck''s tax rate, basis points (D1). NULL = the truck''s. Phase 3.';

comment on column public.country_settings.service_fee_recipient is
  'Who keeps the online service fee in this country: ''truck'' (default) or ''hatchgrab''. Phase 3.';
comment on column public.country_settings.service_fee_hatchgrab_bps is
  'HatchGrab''s service fee, basis points, when HatchGrab keeps it. Trucks cannot change it. Phase 3.';
comment on column public.country_settings.service_fee_hatchgrab_fixed_minor is
  'HatchGrab''s fixed service fee, minor units, when HatchGrab keeps it. Phase 3.';
comment on column public.country_settings.service_fee_truck_max_bps is
  'The most a truck may set as its service-fee percentage, basis points, when the truck keeps it. NULL = no percentage allowed. Phase 3.';
comment on column public.country_settings.service_fee_truck_max_fixed_minor is
  'The most a truck may set as its fixed service fee, minor units, when the truck keeps it. NULL = no fixed fee allowed. Phase 3.';
comment on column public.country_settings.platform_fee_enabled is
  'The platform fee (platform_fee_pct of food_minor, taken at capture) switched on. Default OFF. Phase 3.';
comment on column public.country_settings.fees_taxed is
  'Whether the service fee and card surcharge are taxed (D8). Default false. Phase 3.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 7. place_order_atomic_v2 — the 20260804 function, plus the snapshot columns and an explicit total_minor.
--    The OLD function is untouched and never dropped.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function place_order_atomic_v2(
  p_order      jsonb,
  p_final_slot text,
  p_status     text,
  p_event_id   uuid,
  p_truck_id   text,
  p_event_date date,
  p_unit_rows  jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_order_number integer;
  v_order_key    uuid;
  v_row          jsonb;
begin
  -- DISPLAY NUMBER: event counter first, truck-level fallback when there is no event.
  if p_event_id is not null then
    v_order_number := increment_event_order_counter(p_event_id);
  end if;
  if v_order_number is null then
    v_order_number := increment_order_counter(p_truck_id);
  end if;
  if v_order_number is null then
    raise exception 'could not generate order number (truck %, event %)', p_truck_id, p_event_id;
  end if;

  -- INSERT the order (order_key + created_at/updated_at via column defaults; currency and country via
  -- orders_fill_currency_country).
  insert into orders (
    id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
    event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
    total, total_minor, notes, status, payment_status, placed_at,
    food_minor, tax_minor, tax_rate_bps, tax_inclusive, tax_label, tip_minor, tip_pct_bps,
    service_fee_minor, service_fee_recipient, card_surcharge_minor, card_funding, card_fee_payer,
    application_fee_minor
  ) values (
    v_order_number::text,
    p_truck_id,
    p_order->>'customer_name',
    p_order->>'customer_email',
    p_order->>'customer_phone',
    p_final_slot,
    coalesce(p_order->>'order_type', 'collection'),
    p_event_date,
    p_event_id,
    nullif(p_order->>'van_id', '')::uuid,
    coalesce(p_order->'items', '[]'::jsonb),
    p_order->'deals',
    p_order->>'discount_code',
    (p_order->>'subtotal')::numeric,
    coalesce((p_order->>'discount_amt')::numeric, 0),
    (p_order->>'total')::numeric,
    -- 🔴 THE GRAND TOTAL, AS THE CALLER COMPUTED IT IN MINOR UNITS. The old function derived it from
    -- `total`; that fallback is kept for a caller that does not send it, and the two agree by construction
    -- (the route derives `total` from total_minor).
    coalesce((p_order->>'total_minor')::integer, round(coalesce((p_order->>'total')::numeric, 0) * 100)::integer),
    p_order->>'notes',
    p_status,
    coalesce(p_order->>'payment_status', 'unpaid'),
    -- SERVER-MINTED. Never read from p_order.
    now(),
    (p_order->>'food_minor')::integer,
    coalesce((p_order->>'tax_minor')::integer, 0),
    (p_order->>'tax_rate_bps')::integer,
    (p_order->>'tax_inclusive')::boolean,
    p_order->>'tax_label',
    coalesce((p_order->>'tip_minor')::integer, 0),
    (p_order->>'tip_pct_bps')::integer,
    coalesce((p_order->>'service_fee_minor')::integer, 0),
    p_order->>'service_fee_recipient',
    coalesce((p_order->>'card_surcharge_minor')::integer, 0),
    p_order->>'card_funding',
    p_order->>'card_fee_payer',
    (p_order->>'application_fee_minor')::integer
  )
  returning order_key into v_order_key;

  -- BOOK capacity, EVENT-SCOPED: only when there's an event AND TS-computed rows (booked).
  if p_event_id is not null and p_unit_rows is not null then
    delete from production_slot_usage where truck_id = p_truck_id and event_id = p_event_id;
    for v_row in select * from jsonb_array_elements(p_unit_rows) loop
      insert into production_slot_usage (truck_id, event_id, event_date, production_slot, units_by_cat, updated_at)
      values (p_truck_id, p_event_id, p_event_date, v_row->>'production_slot', v_row->'units_by_cat', now());
    end loop;
  end if;

  return jsonb_build_object(
    'order_key',    v_order_key,
    'order_number', v_order_number,
    'slot',         p_final_slot
  );
end;
$$;

-- 🔴 SERVICE ROLE ONLY. The server calls it with the service role; a browser key must not be able to place
-- an order around the route's pricing. (The OLD function carries Postgres's default EXECUTE to PUBLIC —
-- left as found and reported; this phase does not touch it.)
revoke all on function public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb) to service_role;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only). Run after the block above.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Every new column, with its nullability and default (expect 13 + 13 + 3 + 7 + 1 + 7 = 44 rows):
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--      and (   (table_name in ('orders', 'order_drafts') and column_name in ('food_minor','tax_minor','tax_rate_bps','tax_inclusive','tax_label','tip_minor','tip_pct_bps','service_fee_minor','service_fee_recipient','card_surcharge_minor','card_funding','card_fee_payer','application_fee_minor'))
--           or (table_name = 'order_payments' and column_name in ('application_fee_minor','application_fee_refunded_minor','card_funding'))
--           or (table_name = 'trucks' and column_name in ('tax_rate_bps','tipping_enabled','card_fee_payer','service_fee_enabled','service_fee_bps','service_fee_fixed_minor','base_region_code'))
--           or (table_name = 'truck_events' and column_name = 'tax_rate_bps')
--           or (table_name = 'country_settings' and column_name in ('service_fee_recipient','service_fee_hatchgrab_bps','service_fee_hatchgrab_fixed_minor','service_fee_truck_max_bps','service_fee_truck_max_fixed_minor','platform_fee_enabled','fees_taxed')))
--    order by table_name, column_name;
--
-- 2. The 20 CHECKs (expect 20 rows):
--   select r.relname, k.conname from pg_constraint k join pg_class r on r.oid = k.conrelid
--    where k.conname in ('orders_charges_nonneg_chk','orders_charges_bps_chk','orders_service_fee_recipient_chk','orders_card_funding_chk','orders_card_fee_payer_chk',
--                        'order_drafts_charges_nonneg_chk','order_drafts_charges_bps_chk','order_drafts_service_fee_recipient_chk','order_drafts_card_funding_chk','order_drafts_card_fee_payer_chk',
--                        'order_payments_application_fee_chk','order_payments_card_funding_chk',
--                        'trucks_tax_rate_bps_chk','trucks_card_fee_payer_chk','trucks_service_fee_chk','trucks_base_region_code_chk',
--                        'truck_events_tax_rate_bps_chk',
--                        'country_settings_service_fee_recipient_chk','country_settings_service_fee_bps_chk','country_settings_service_fee_fixed_chk')
--    order by 1, 2;
--
-- 3. Both functions exist; the old one is unchanged (expect 2 rows), and v2 is service-role only
--    (expect anon and authenticated = false, service_role = true):
--   select has_function_privilege('anon', 'public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb)', 'execute') as anon,
--          has_function_privilege('authenticated', 'public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb)', 'execute') as authenticated,
--          has_function_privilege('service_role', 'public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb)', 'execute') as service_role;
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--    where proname in ('place_order_atomic', 'place_order_atomic_v2') and pronamespace = 'public'::regnamespace;
--
-- 4. GB and US took the defaults (expect 2 rows: truck, null, null, null, null, false, false):
--   select country_code, service_fee_recipient, service_fee_hatchgrab_bps, service_fee_hatchgrab_fixed_minor,
--          service_fee_truck_max_bps, service_fee_truck_max_fixed_minor, platform_fee_enabled, fees_taxed
--     from public.country_settings order by country_code;
--
-- 5. Nothing switched on for any truck (expect one row: n, 0, 0, 0, 0):
--   select count(*) as n,
--          count(*) filter (where card_fee_payer <> 'truck')      as customer_pays,
--          count(*) filter (where service_fee_enabled)            as fee_on,
--          count(*) filter (where tax_rate_bps is not null)       as rate_set,
--          count(*) filter (where tipping_enabled is not null)    as tipping_set
--     from public.trucks;
