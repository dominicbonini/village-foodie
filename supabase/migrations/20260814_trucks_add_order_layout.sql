-- 20260814_trucks_add_order_layout.sql
-- Per-truck choice of how the dashboard Add Order screen presents the menu:
--   'tabs'   = today's behaviour. Category chips FILTER; one category's items render at a time.
--   'scroll' = one continuous list, sticky category headings, the chips become jump links + scroll-spy.
--
-- CLASSIFICATION: **ADDITIVE. NOT DEPLOY-COUPLED. SAFE TO RUN BEFORE OR AFTER THE DEPLOY.**
--
-- Why additive, checked rather than assumed:
--   1. NOT NULL DEFAULT 'tabs' means every existing row gets 'tabs' at the moment this runs, and 'tabs'
--      is the behaviour those trucks already have. There is no state in which a row means something the
--      code did not previously do. NO BACKFILL IS NEEDED and none is written here.
--   2. Running it BEFORE the deploy is inert: no code reads the column yet, and nothing enumerates the
--      trucks column list to validate it.
--   3. Running it AFTER the deploy is also safe, and this is the half worth stating because it is where
--      the deploy-coupled migrations in this directory differ. /api/dashboard reads trucks with
--      `select('*')` and hands the row to publicTruckFields(), a REDACT list — it never names columns, so
--      PostgREST cannot raise 42703 for a column that does not exist yet. The client reads
--      `truck.add_order_layout ?? 'tabs'`, so a missing column arrives undefined and resolves to 'tabs',
--      which is exactly what the pre-migration behaviour is. Compare
--      20260810_truck_events_completion_presses_override.sql, which IS order-sensitive precisely because
--      its readers use NAMED selects.
--
-- 🔴 DO NOT MAKE THIS NULLABLE. A nullable column would need every reader to carry a `?? 'tabs'` fallback
-- forever and would let a NULL row mean "unset", which is a third state for a two-state setting. The NOT
-- NULL DEFAULT is the whole mechanism by which Pizzeria Gusto's Add Order screen is unchanged until its
-- operator picks the other option.
--
-- ⚠️ NO CHECK CONSTRAINT, deliberately, and this matches trucks.qr_code_style and trucks.display_mode
-- (both plain `text` with a default and no CHECK). The allowed values are enforced where they are
-- written — update_truck's `allowed` array plus a two-button control that can only emit one of them —
-- and read defensively (anything that is not 'scroll' resolves to 'tabs'). Adding a CHECK here would put
-- a second definition of the value set in a place the application cannot see.
--
-- ⚠️ DELIBERATELY NOT trucks.display_mode. That column is the KDS card list/grid switcher, read at
-- exactly one place (app/dashboard/[token]/kds/page.tsx). Overloading it would tie two unrelated screens
-- to one value.

ALTER TABLE trucks
ADD COLUMN IF NOT EXISTS add_order_layout text NOT NULL DEFAULT 'tabs';

COMMENT ON COLUMN trucks.add_order_layout IS
  'Dashboard Add Order menu presentation: ''tabs'' (category chips filter, one category shown) or ''scroll'' (one continuous list with sticky headings and a scroll-spy chip bar). Written by Manage > Settings via update_truck.';
