-- 20261010_08_price_mode_currency_neutral.sql
-- Country settings, Part A, file 8 of 9: price modes that do not name a currency.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent, so re-running is safe.
--
-- ✅ CLASSIFICATION: SAFE TO RUN NOW. The new checks accept EVERY value the old ones accepted, plus two
--    more, so no existing row and no current write can fail them. No stored data is renamed (live, 10 Oct
--    2026: event_types.price_mode is NULL on 5 rows and 'none' on 1 — nothing uses add_gbp / sub_gbp).
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────────────────────────────
--   old:  price_mode is null or price_mode in ('none', 'add_gbp', 'add_pct', 'sub_gbp', 'sub_pct')
--   new:  … the same five, plus 'add_amount' and 'sub_amount'
-- Code moves to add_amount / sub_amount in Part B; add_gbp / sub_gbp are removed in a later migration,
-- once nothing writes them.
--
-- ⚠️ TWO CONSTRAINTS, NOT ONE. 20261011_event_pricing.sql gave truck_events.price_mode the same check
-- ("same vocabulary and same meaning as event_types.price_mode"), and the dashboard's "Prices for this
-- event" sheet seeds those columns as a COPY of the type's setup. Widening only event_types would make
-- that copy fail the day a type holds add_amount. Both are widened here, identically.
--
-- ⚠️ FILE-NAME ORDER. The constraints being replaced were created by 20261011_event_pricing.sql, which
-- sorts AFTER this file. On the live database 20261011 has already run, so this file replaces them. On a
-- fresh replay in file-name order the columns do not exist yet: the guards below skip, and 20261011 then
-- creates the OLD narrow checks — re-run this file after 20261011 in that case.
--
-- VERIFY AFTER APPLYING:
--   select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname in ('event_types_price_mode_check', 'truck_events_price_mode_check');

set lock_timeout = '3s';

begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'event_types' and column_name = 'price_mode'
  ) then
    alter table public.event_types drop constraint if exists event_types_price_mode_check;
    alter table public.event_types
      add constraint event_types_price_mode_check
      check (price_mode is null or price_mode in (
        'none', 'add_gbp', 'add_pct', 'sub_gbp', 'sub_pct', 'add_amount', 'sub_amount'
      ));
    -- The 20261011 comment, unchanged except that the new names replace the old in the list and the old are noted.
    comment on column public.event_types.price_mode is
      'The across-the-board price rule: none | add_amount | add_pct | sub_amount | sub_pct (add_gbp / sub_gbp are the OLD names for add_amount / sub_amount, still accepted until code stops writing them — 20261010_08). ''none'' means TYPED PRICES ONLY (event_item_prices), not "no pricing" — that is price_change_on = false. Applies to EVERY menu item; it does NOT change modifier_options.price_adjustment or bundles_db.bundle_price, which stay as the menu. Read only when price_change_on is true.';
  else
    raise notice 'event_types.price_mode does not exist yet (20261011 not applied) — skipped';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'truck_events' and column_name = 'price_mode'
  ) then
    alter table public.truck_events drop constraint if exists truck_events_price_mode_check;
    alter table public.truck_events
      add constraint truck_events_price_mode_check
      check (price_mode is null or price_mode in (
        'none', 'add_gbp', 'add_pct', 'sub_gbp', 'sub_pct', 'add_amount', 'sub_amount'
      ));
  else
    raise notice 'truck_events.price_mode does not exist yet (20261011 not applied) — skipped';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
