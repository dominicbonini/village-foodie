-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- event_option_stock.truck_id : uuid -> text
--
-- 🔴 RUN BY HAND IN THE SUPABASE SQL EDITOR. This file is deliberately in docs/, NOT in
--    supabase/migrations/, because the deploy freeze is on and a file in that directory could be
--    picked up by a migration runner. Move it there (with a dated filename) when the freeze lifts.
--
-- WHY: truck_id is uuid and every caller passes a slug, so every access has failed with 22P02 since
-- the table was created. The table holds zero rows. It is the only table of 43 where truck_id is not
-- text. truck_id appears in no constraint and no index, and has no foreign key of its own.
--
-- SAFE TO RE-RUN: both guards abort rather than damage anything.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

-- GUARD 1 — the table must be empty. It holds zero rows today because every insert has failed;
-- if that is no longer true, something has changed and this must be inspected before any recast.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.event_option_stock;
  IF n <> 0 THEN
    RAISE EXCEPTION 'ABORT: event_option_stock holds % row(s). Inspect before altering.', n;
  END IF;
END $$;

-- GUARD 2 — the column must still be uuid. Stops a double-apply, and stops this running against a
-- shape it was not written for.
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'event_option_stock' AND column_name = 'truck_id';
  IF t IS NULL   THEN RAISE EXCEPTION 'ABORT: event_option_stock.truck_id does not exist.'; END IF;
  IF t <> 'uuid' THEN RAISE EXCEPTION 'ABORT: truck_id is already %, not uuid. Nothing to do.', t; END IF;
END $$;

ALTER TABLE public.event_option_stock
  ALTER COLUMN truck_id TYPE text USING truck_id::text;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- VERIFY — run this AFTER the block above. Query 2 is the one that matters.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- 1. this table
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'event_option_stock'
ORDER  BY ordinal_position;

-- 2. 🔴 THE CLASS CHECK. Every truck_id in the schema, grouped by type.
--    Expect ONE group: text. Any uuid row is another instance of this same bug.
SELECT data_type, count(*) AS tables, string_agg(table_name, ', ' ORDER BY table_name) AS which
FROM   information_schema.columns
WHERE  table_schema = 'public' AND column_name = 'truck_id'
GROUP  BY data_type;
