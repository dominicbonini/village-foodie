# Menu copy SQL — `test-truck-3-2` → `test-truck-2`

🔴 **NOTHING WAS RUN.** No SQL was executed, no database was queried, no route invoked. The three scripts
below are text in this file. **You run all SQL by hand.**

🔴 **EVERY STATEMENT TOUCHING `test-truck-3-2` IS A `SELECT`.** There is no `INSERT`, `UPDATE` or
`DELETE` anywhere in these scripts whose target rows belong to that truck. §6 lists them individually.

**Prompt integrity:** no span arrived garbled and no instruction contradicted another.

## Which of the three I did — plainly

**None of them.** No parse, no typecheck, no execution. I read source and wrote SQL; **no part of it has
been syntax-checked by a database.** Treat Script 0 as the thing that validates my assumptions before
Script 1 runs.

---

## 🔴 READ THIS BEFORE RUNNING ANYTHING: two assumptions Script 0 exists to settle

The seven menu tables have **no `CREATE TABLE` in `supabase/migrations/`** — they predate the migrations
directory. **I have never seen their schema.** Everything below is written to be robust against that, but
two things must be confirmed from Script 0's output:

1. **`item_modifier_groups.excluded_option_ids` is assumed `uuid[]`.** If Script 0 reports `text[]`, the
   array remap in Script 1 needs its casts adjusted (marked in-line).
2. **`item_modifier_groups` and `category_modifier_groups` are assumed to have NO surrogate `id`
   column** — no code anywhere selects one. **Script 1 does not rely on that assumption: it contains a
   guard that ABORTS if such a column exists**, rather than silently duplicating a primary key.

⚠️ **The scripts use `CREATE TEMP TABLE … AS SELECT *` staging**, deliberately. That copies **every
column, including ones I do not know exist**, and I then overwrite only the ids and references. **An
explicit column list would silently drop any column I failed to guess** — the opposite of "verbatim".

---

## Script 0 — PRE-COPY COUNTS + SCHEMA CHECK. **Run this first and keep the output.**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SCRIPT 0 — BEFORE-FIGURES AND SCHEMA CONFIRMATION.  READ-ONLY.  Run before Script 1.
-- Keep this output: Script 2 compares against it to prove test-truck-3-2 is unchanged.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 0a. Row counts, per table, per truck ───────────────────────────────────────────────────────
-- The last three tables have NO truck_id; they are scoped through their parent.
SELECT 'menu_categories'         AS table_name,
       count(*) FILTER (WHERE mc.truck_id = 'test-truck-3-2') AS source_rows,
       count(*) FILTER (WHERE mc.truck_id = 'test-truck-2')   AS target_rows
  FROM public.menu_categories mc
 WHERE mc.truck_id IN ('test-truck-3-2', 'test-truck-2')
UNION ALL
SELECT 'menu_subcategories',
       count(*) FILTER (WHERE ms.truck_id = 'test-truck-3-2'),
       count(*) FILTER (WHERE ms.truck_id = 'test-truck-2')
  FROM public.menu_subcategories ms
 WHERE ms.truck_id IN ('test-truck-3-2', 'test-truck-2')
UNION ALL
SELECT 'modifier_groups',
       count(*) FILTER (WHERE mg.truck_id = 'test-truck-3-2'),
       count(*) FILTER (WHERE mg.truck_id = 'test-truck-2')
  FROM public.modifier_groups mg
 WHERE mg.truck_id IN ('test-truck-3-2', 'test-truck-2')
UNION ALL
SELECT 'menu_items_db',
       count(*) FILTER (WHERE mi.truck_id = 'test-truck-3-2'),
       count(*) FILTER (WHERE mi.truck_id = 'test-truck-2')
  FROM public.menu_items_db mi
 WHERE mi.truck_id IN ('test-truck-3-2', 'test-truck-2')
UNION ALL
SELECT 'modifier_options',
       count(*) FILTER (WHERE mg.truck_id = 'test-truck-3-2'),
       count(*) FILTER (WHERE mg.truck_id = 'test-truck-2')
  FROM public.modifier_options mo
  JOIN public.modifier_groups  mg ON mg.id = mo.group_id
 WHERE mg.truck_id IN ('test-truck-3-2', 'test-truck-2')
UNION ALL
SELECT 'item_modifier_groups',
       count(*) FILTER (WHERE mi.truck_id = 'test-truck-3-2'),
       count(*) FILTER (WHERE mi.truck_id = 'test-truck-2')
  FROM public.item_modifier_groups img
  JOIN public.menu_items_db     mi  ON mi.id = img.menu_item_id
 WHERE mi.truck_id IN ('test-truck-3-2', 'test-truck-2')
UNION ALL
SELECT 'category_modifier_groups',
       count(*) FILTER (WHERE mc.truck_id = 'test-truck-3-2'),
       count(*) FILTER (WHERE mc.truck_id = 'test-truck-2')
  FROM public.category_modifier_groups cmg
  JOIN public.menu_categories          mc ON mc.id = cmg.category_id
 WHERE mc.truck_id IN ('test-truck-3-2', 'test-truck-2')
 ORDER BY 1;

-- ── 0b. Column inventory — CONFIRM THE TWO ASSUMPTIONS AT THE TOP OF THE REPORT ────────────────
--   (i)  excluded_option_ids data_type  → expected 'ARRAY' with udt_name '_uuid'
--   (ii) item_modifier_groups / category_modifier_groups → expected NO column named 'id'
SELECT c.table_name,
       c.ordinal_position,
       c.column_name,
       c.data_type,
       c.udt_name,
       c.is_nullable,
       c.column_default
  FROM information_schema.columns c
 WHERE c.table_schema = 'public'
   AND c.table_name IN ('menu_categories', 'menu_subcategories', 'modifier_groups',
                        'modifier_options', 'menu_items_db', 'item_modifier_groups',
                        'category_modifier_groups')
 ORDER BY c.table_name, c.ordinal_position;

-- ── 0c. Constraints and triggers on those tables — the report could not read these from source ──
SELECT tc.table_name, tc.constraint_type, tc.constraint_name,
       string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
  FROM information_schema.table_constraints tc
  LEFT JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema    = tc.table_schema
 WHERE tc.table_schema = 'public'
   AND tc.table_name IN ('menu_categories', 'menu_subcategories', 'modifier_groups',
                         'modifier_options', 'menu_items_db', 'item_modifier_groups',
                         'category_modifier_groups')
 GROUP BY tc.table_name, tc.constraint_type, tc.constraint_name
 ORDER BY tc.table_name, tc.constraint_type;

SELECT t.event_object_table AS table_name, t.trigger_name, t.action_timing, t.event_manipulation
  FROM information_schema.triggers t
 WHERE t.trigger_schema = 'public'
   AND t.event_object_table IN ('menu_categories', 'menu_subcategories', 'modifier_groups',
                                'modifier_options', 'menu_items_db', 'item_modifier_groups',
                                'category_modifier_groups')
 ORDER BY 1, 2;
```

---

## Script 1 — THE COPY. **Do not run until Script 0's output matches the assumptions.**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SCRIPT 1 — COPY test-truck-3-2's MENU ONTO test-truck-2.
--
-- 🔴 test-truck-3-2 IS READ-ONLY HERE. Every reference to it is in a SELECT / FROM / WHERE clause.
--    There is no INSERT, UPDATE or DELETE in this script whose target rows belong to that truck.
--
-- DESIGN:
--   • Explicit old→new id maps in TEMP tables, so the mapping is auditable mid-transaction.
--   • Staging via CREATE TEMP TABLE … AS SELECT *  — carries EVERY column, including any this
--     script's author never saw. Only ids, truck_id and references are then overwritten.
--   • Nothing depends on row ORDER or on counts matching anything.
--   • Guards RAISE and abort rather than letting a partial or cross-linked copy land.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── GUARD 1: the source must exist. A silent zero-row copy is worse than an error. ──────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.menu_categories mc WHERE mc.truck_id = 'test-truck-3-2';
  IF n = 0 THEN
    RAISE EXCEPTION 'ABORT: source truck test-truck-3-2 has no menu_categories — nothing to copy';
  END IF;
END $$;

-- ── GUARD 2: the target must be empty, re-checked here rather than trusted from the pre-flight ──
DO $$
DECLARE n int;
BEGIN
  SELECT (SELECT count(*) FROM public.menu_categories    mc WHERE mc.truck_id = 'test-truck-2')
       + (SELECT count(*) FROM public.menu_subcategories ms WHERE ms.truck_id = 'test-truck-2')
       + (SELECT count(*) FROM public.modifier_groups    mg WHERE mg.truck_id = 'test-truck-2')
       + (SELECT count(*) FROM public.menu_items_db      mi WHERE mi.truck_id = 'test-truck-2')
    INTO n;
  IF n <> 0 THEN
    RAISE EXCEPTION 'ABORT: target truck test-truck-2 already has % menu row(s). This script only runs against an empty target.', n;
  END IF;
END $$;

-- ── GUARD 3: the two join tables must have no surrogate id this script would fail to regenerate ─
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.table_name || '.' || c.column_name, ', ')
    INTO bad
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name IN ('item_modifier_groups', 'category_modifier_groups')
     AND c.column_name = 'id';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: unexpected surrogate key(s) % — this script does not regenerate them. Add a map + UPDATE for each before running.', bad;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 1 — ID MAPS.  old_id → new_id, one row per source row, explicit and auditable.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE map_category (old_id uuid PRIMARY KEY, new_id uuid NOT NULL DEFAULT gen_random_uuid()) ON COMMIT DROP;
CREATE TEMP TABLE map_subcat   (old_id uuid PRIMARY KEY, new_id uuid NOT NULL DEFAULT gen_random_uuid()) ON COMMIT DROP;
CREATE TEMP TABLE map_group    (old_id uuid PRIMARY KEY, new_id uuid NOT NULL DEFAULT gen_random_uuid()) ON COMMIT DROP;
CREATE TEMP TABLE map_option   (old_id uuid PRIMARY KEY, new_id uuid NOT NULL DEFAULT gen_random_uuid()) ON COMMIT DROP;
CREATE TEMP TABLE map_item     (old_id uuid PRIMARY KEY, new_id uuid NOT NULL DEFAULT gen_random_uuid()) ON COMMIT DROP;

INSERT INTO map_category (old_id)
SELECT mc.id FROM public.menu_categories mc WHERE mc.truck_id = 'test-truck-3-2';

INSERT INTO map_subcat (old_id)
SELECT ms.id FROM public.menu_subcategories ms WHERE ms.truck_id = 'test-truck-3-2';

INSERT INTO map_group (old_id)
SELECT mg.id FROM public.modifier_groups mg WHERE mg.truck_id = 'test-truck-3-2';

INSERT INTO map_option (old_id)
SELECT mo.id
  FROM public.modifier_options mo
  JOIN public.modifier_groups  mg ON mg.id = mo.group_id
 WHERE mg.truck_id = 'test-truck-3-2';

INSERT INTO map_item (old_id)
SELECT mi.id FROM public.menu_items_db mi WHERE mi.truck_id = 'test-truck-3-2';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 2 — menu_categories.  Depends on nothing.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE stage_category ON COMMIT DROP AS
SELECT mc.* FROM public.menu_categories mc WHERE mc.truck_id = 'test-truck-3-2';

UPDATE stage_category s SET id = m.new_id FROM map_category m WHERE m.old_id = s.id;
UPDATE stage_category s SET truck_id = 'test-truck-2';

INSERT INTO public.menu_categories SELECT sc.* FROM stage_category sc;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 3 — menu_subcategories.  Depends on: categories.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE stage_subcat ON COMMIT DROP AS
SELECT ms.* FROM public.menu_subcategories ms WHERE ms.truck_id = 'test-truck-3-2';

UPDATE stage_subcat s SET id          = m.new_id FROM map_subcat   m WHERE m.old_id = s.id;
UPDATE stage_subcat s SET category_id = m.new_id FROM map_category m WHERE m.old_id = s.category_id;
UPDATE stage_subcat s SET truck_id    = 'test-truck-2';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM stage_subcat s
   WHERE s.category_id IS NOT NULL
     AND s.category_id NOT IN (SELECT m.new_id FROM map_category m);
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % subcategory row(s) carry an unmapped category_id', n; END IF;
END $$;

INSERT INTO public.menu_subcategories SELECT ss.* FROM stage_subcat ss;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 4 — modifier_groups.  Depends on nothing.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE stage_group ON COMMIT DROP AS
SELECT mg.* FROM public.modifier_groups mg WHERE mg.truck_id = 'test-truck-3-2';

UPDATE stage_group s SET id = m.new_id FROM map_group m WHERE m.old_id = s.id;
UPDATE stage_group s SET truck_id = 'test-truck-2';

INSERT INTO public.modifier_groups SELECT sg.* FROM stage_group sg;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 5 — modifier_options.  🔴 NO truck_id. group_id is the ONLY thing tying it to a truck.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE stage_option ON COMMIT DROP AS
SELECT mo.*
  FROM public.modifier_options mo
  JOIN public.modifier_groups  mg ON mg.id = mo.group_id
 WHERE mg.truck_id = 'test-truck-3-2';

UPDATE stage_option s SET id       = m.new_id FROM map_option m WHERE m.old_id = s.id;
UPDATE stage_option s SET group_id = m.new_id FROM map_group  m WHERE m.old_id = s.group_id;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM stage_option s
   WHERE s.group_id NOT IN (SELECT m.new_id FROM map_group m);
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % option row(s) still point at a source-truck group_id', n; END IF;
END $$;

INSERT INTO public.modifier_options SELECT so.* FROM stage_option so;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 6 — menu_items_db.  Depends on: categories, subcategories.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE stage_item ON COMMIT DROP AS
SELECT mi.* FROM public.menu_items_db mi WHERE mi.truck_id = 'test-truck-3-2';

UPDATE stage_item s SET id             = m.new_id FROM map_item     m WHERE m.old_id = s.id;
UPDATE stage_item s SET category_id    = m.new_id FROM map_category m WHERE m.old_id = s.category_id;
UPDATE stage_item s SET subcategory_id = m.new_id FROM map_subcat   m WHERE m.old_id = s.subcategory_id;
UPDATE stage_item s SET truck_id       = 'test-truck-2';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM stage_item s
   WHERE (s.category_id    IS NOT NULL AND s.category_id    NOT IN (SELECT m.new_id FROM map_category m))
      OR (s.subcategory_id IS NOT NULL AND s.subcategory_id NOT IN (SELECT m.new_id FROM map_subcat   m));
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % item row(s) carry an unmapped category_id or subcategory_id', n; END IF;
END $$;

INSERT INTO public.menu_items_db SELECT si.* FROM stage_item si;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 7 — item_modifier_groups.  🔴 NO truck_id, NO FK on the array. THREE remaps, not two.
-- ⚠️ If Script 0 reported excluded_option_ids as text[] rather than uuid[], change
--    `e.elem` handling below to cast: (SELECT ... array_agg(m.new_id::text ...)).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE stage_link ON COMMIT DROP AS
SELECT img.*
  FROM public.item_modifier_groups img
  JOIN public.menu_items_db        mi ON mi.id = img.menu_item_id
 WHERE mi.truck_id = 'test-truck-3-2';

UPDATE stage_link s SET menu_item_id = m.new_id FROM map_item  m WHERE m.old_id = s.menu_item_id;
UPDATE stage_link s SET group_id     = m.new_id FROM map_group m WHERE m.old_id = s.group_id;

-- GUARD: every uuid inside the array must have a mapping BEFORE the array is rewritten. An unmapped
-- element is the silent cross-link this whole script exists to prevent, so it aborts rather than
-- being coalesced away.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM stage_link s
    CROSS JOIN LATERAL unnest(COALESCE(s.excluded_option_ids, '{}')) AS e(elem)
   WHERE e.elem NOT IN (SELECT m.old_id FROM map_option m);
  IF n > 0 THEN
    RAISE EXCEPTION 'ABORT: % excluded_option_ids element(s) have no mapping — they belong to another truck', n;
  END IF;
END $$;

UPDATE stage_link s
   SET excluded_option_ids = (
        SELECT array_agg(m.new_id ORDER BY e.ord)
          FROM unnest(s.excluded_option_ids) WITH ORDINALITY AS e(elem, ord)
          JOIN map_option m ON m.old_id = e.elem
       )
 WHERE s.excluded_option_ids IS NOT NULL
   AND cardinality(s.excluded_option_ids) > 0;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM stage_link s
   WHERE s.menu_item_id NOT IN (SELECT m.new_id FROM map_item  m)
      OR s.group_id     NOT IN (SELECT m.new_id FROM map_group m)
      OR EXISTS (SELECT 1
                   FROM unnest(COALESCE(s.excluded_option_ids, '{}')) AS e(elem)
                  WHERE e.elem NOT IN (SELECT m.new_id FROM map_option m));
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % link row(s) still reference a source-truck id', n; END IF;
END $$;

INSERT INTO public.item_modifier_groups SELECT sl.* FROM stage_link sl;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 8 — category_modifier_groups.  🔴 NO truck_id. Retired on the customer path, copied for fidelity.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE stage_catlink ON COMMIT DROP AS
SELECT cmg.*
  FROM public.category_modifier_groups cmg
  JOIN public.menu_categories          mc ON mc.id = cmg.category_id
 WHERE mc.truck_id = 'test-truck-3-2';

UPDATE stage_catlink s SET category_id = m.new_id FROM map_category m WHERE m.old_id = s.category_id;
UPDATE stage_catlink s SET group_id    = m.new_id FROM map_group    m WHERE m.old_id = s.group_id;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM stage_catlink s
   WHERE s.category_id NOT IN (SELECT m.new_id FROM map_category m)
      OR s.group_id    NOT IN (SELECT m.new_id FROM map_group    m);
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % category-link row(s) still reference a source-truck id', n; END IF;
END $$;

INSERT INTO public.category_modifier_groups SELECT scl.* FROM stage_catlink scl;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- FINAL GUARD — per-table counts must match the source exactly before committing.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE src int; tgt int;
BEGIN
  SELECT count(*) INTO src FROM public.menu_categories mc WHERE mc.truck_id = 'test-truck-3-2';
  SELECT count(*) INTO tgt FROM public.menu_categories mc WHERE mc.truck_id = 'test-truck-2';
  IF src <> tgt THEN RAISE EXCEPTION 'ABORT: menu_categories % vs %', src, tgt; END IF;

  SELECT count(*) INTO src FROM public.menu_subcategories ms WHERE ms.truck_id = 'test-truck-3-2';
  SELECT count(*) INTO tgt FROM public.menu_subcategories ms WHERE ms.truck_id = 'test-truck-2';
  IF src <> tgt THEN RAISE EXCEPTION 'ABORT: menu_subcategories % vs %', src, tgt; END IF;

  SELECT count(*) INTO src FROM public.modifier_groups mg WHERE mg.truck_id = 'test-truck-3-2';
  SELECT count(*) INTO tgt FROM public.modifier_groups mg WHERE mg.truck_id = 'test-truck-2';
  IF src <> tgt THEN RAISE EXCEPTION 'ABORT: modifier_groups % vs %', src, tgt; END IF;

  SELECT count(*) INTO src FROM public.menu_items_db mi WHERE mi.truck_id = 'test-truck-3-2';
  SELECT count(*) INTO tgt FROM public.menu_items_db mi WHERE mi.truck_id = 'test-truck-2';
  IF src <> tgt THEN RAISE EXCEPTION 'ABORT: menu_items_db % vs %', src, tgt; END IF;
END $$;

COMMIT;
```

---

## Script 2 — VERIFICATION. **Run after Script 1. Read-only.**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SCRIPT 2 — PROVE THE COPY.  READ-ONLY.
--   A. counts match per table
--   B. 🔴 ZERO target rows reference ANY source-truck id — every FK, and inside the array
--   C. the source's own counts are unchanged (compare by eye against Script 0a)
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── A + C. Per-table counts. `source_rows` must equal Script 0a's `source_rows`, column for column.
SELECT 'menu_categories' AS table_name,
       count(*) FILTER (WHERE mc.truck_id = 'test-truck-3-2') AS source_rows,
       count(*) FILTER (WHERE mc.truck_id = 'test-truck-2')   AS target_rows,
       (count(*) FILTER (WHERE mc.truck_id = 'test-truck-3-2')
      = count(*) FILTER (WHERE mc.truck_id = 'test-truck-2'))  AS counts_match
  FROM public.menu_categories mc
 WHERE mc.truck_id IN ('test-truck-3-2', 'test-truck-2')
UNION ALL
SELECT 'menu_subcategories',
       count(*) FILTER (WHERE ms.truck_id = 'test-truck-3-2'),
       count(*) FILTER (WHERE ms.truck_id = 'test-truck-2'),
       (count(*) FILTER (WHERE ms.truck_id = 'test-truck-3-2')
      = count(*) FILTER (WHERE ms.truck_id = 'test-truck-2'))
  FROM public.menu_subcategories ms
 WHERE ms.truck_id IN ('test-truck-3-2', 'test-truck-2')
UNION ALL
SELECT 'modifier_groups',
       count(*) FILTER (WHERE mg.truck_id = 'test-truck-3-2'),
       count(*) FILTER (WHERE mg.truck_id = 'test-truck-2'),
       (count(*) FILTER (WHERE mg.truck_id = 'test-truck-3-2')
      = count(*) FILTER (WHERE mg.truck_id = 'test-truck-2'))
  FROM public.modifier_groups mg
 WHERE mg.truck_id IN ('test-truck-3-2', 'test-truck-2')
UNION ALL
SELECT 'menu_items_db',
       count(*) FILTER (WHERE mi.truck_id = 'test-truck-3-2'),
       count(*) FILTER (WHERE mi.truck_id = 'test-truck-2'),
       (count(*) FILTER (WHERE mi.truck_id = 'test-truck-3-2')
      = count(*) FILTER (WHERE mi.truck_id = 'test-truck-2'))
  FROM public.menu_items_db mi
 WHERE mi.truck_id IN ('test-truck-3-2', 'test-truck-2')
UNION ALL
SELECT 'modifier_options',
       count(*) FILTER (WHERE mg.truck_id = 'test-truck-3-2'),
       count(*) FILTER (WHERE mg.truck_id = 'test-truck-2'),
       (count(*) FILTER (WHERE mg.truck_id = 'test-truck-3-2')
      = count(*) FILTER (WHERE mg.truck_id = 'test-truck-2'))
  FROM public.modifier_options mo
  JOIN public.modifier_groups  mg ON mg.id = mo.group_id
 WHERE mg.truck_id IN ('test-truck-3-2', 'test-truck-2')
UNION ALL
SELECT 'item_modifier_groups',
       count(*) FILTER (WHERE mi.truck_id = 'test-truck-3-2'),
       count(*) FILTER (WHERE mi.truck_id = 'test-truck-2'),
       (count(*) FILTER (WHERE mi.truck_id = 'test-truck-3-2')
      = count(*) FILTER (WHERE mi.truck_id = 'test-truck-2'))
  FROM public.item_modifier_groups img
  JOIN public.menu_items_db        mi ON mi.id = img.menu_item_id
 WHERE mi.truck_id IN ('test-truck-3-2', 'test-truck-2')
UNION ALL
SELECT 'category_modifier_groups',
       count(*) FILTER (WHERE mc.truck_id = 'test-truck-3-2'),
       count(*) FILTER (WHERE mc.truck_id = 'test-truck-2'),
       (count(*) FILTER (WHERE mc.truck_id = 'test-truck-3-2')
      = count(*) FILTER (WHERE mc.truck_id = 'test-truck-2'))
  FROM public.category_modifier_groups cmg
  JOIN public.menu_categories          mc ON mc.id = cmg.category_id
 WHERE mc.truck_id IN ('test-truck-3-2', 'test-truck-2')
 ORDER BY 1;

-- ── B. 🔴 THE CROSS-LINK AUDIT.  EVERY ROW BELOW MUST REPORT violations = 0.
WITH src_cat AS (SELECT mc.id FROM public.menu_categories    mc WHERE mc.truck_id = 'test-truck-3-2'),
     src_sub AS (SELECT ms.id FROM public.menu_subcategories ms WHERE ms.truck_id = 'test-truck-3-2'),
     src_grp AS (SELECT mg.id FROM public.modifier_groups    mg WHERE mg.truck_id = 'test-truck-3-2'),
     src_itm AS (SELECT mi.id FROM public.menu_items_db      mi WHERE mi.truck_id = 'test-truck-3-2'),
     src_opt AS (SELECT mo.id FROM public.modifier_options   mo
                   JOIN public.modifier_groups mg ON mg.id = mo.group_id
                  WHERE mg.truck_id = 'test-truck-3-2')

SELECT 'menu_subcategories.category_id → source category' AS check_name, count(*) AS violations
  FROM public.menu_subcategories ms
 WHERE ms.truck_id = 'test-truck-2' AND ms.category_id IN (SELECT id FROM src_cat)
UNION ALL
SELECT 'menu_items_db.category_id → source category', count(*)
  FROM public.menu_items_db mi
 WHERE mi.truck_id = 'test-truck-2' AND mi.category_id IN (SELECT id FROM src_cat)
UNION ALL
SELECT 'menu_items_db.subcategory_id → source subcategory', count(*)
  FROM public.menu_items_db mi
 WHERE mi.truck_id = 'test-truck-2' AND mi.subcategory_id IN (SELECT id FROM src_sub)
UNION ALL
-- 🔴 modifier_options has NO truck_id: a target option is one whose group belongs to test-truck-2.
SELECT 'modifier_options.group_id → source group', count(*)
  FROM public.modifier_options mo
  JOIN public.modifier_groups  mg ON mg.id = mo.group_id
 WHERE mg.truck_id = 'test-truck-2' AND mo.group_id IN (SELECT id FROM src_grp)
UNION ALL
SELECT 'item_modifier_groups.group_id → source group', count(*)
  FROM public.item_modifier_groups img
  JOIN public.menu_items_db        mi ON mi.id = img.menu_item_id
 WHERE mi.truck_id = 'test-truck-2' AND img.group_id IN (SELECT id FROM src_grp)
UNION ALL
SELECT 'item_modifier_groups.menu_item_id → source item', count(*)
  FROM public.item_modifier_groups img
  JOIN public.menu_items_db        mi ON mi.id = img.menu_item_id
 WHERE mi.truck_id = 'test-truck-2' AND img.menu_item_id IN (SELECT id FROM src_itm)
UNION ALL
-- 🔴 THE ARRAY. Not an FK, so nothing else in this audit would catch it.
SELECT 'item_modifier_groups.excluded_option_ids[] → source option', count(*)
  FROM public.item_modifier_groups img
  JOIN public.menu_items_db        mi ON mi.id = img.menu_item_id
 WHERE mi.truck_id = 'test-truck-2'
   AND EXISTS (SELECT 1
                 FROM unnest(COALESCE(img.excluded_option_ids, '{}')) AS e(elem)
                WHERE e.elem IN (SELECT id FROM src_opt))
UNION ALL
SELECT 'category_modifier_groups.category_id → source category', count(*)
  FROM public.category_modifier_groups cmg
  JOIN public.menu_categories          mc ON mc.id = cmg.category_id
 WHERE mc.truck_id = 'test-truck-2' AND cmg.category_id IN (SELECT id FROM src_cat)
UNION ALL
SELECT 'category_modifier_groups.group_id → source group', count(*)
  FROM public.category_modifier_groups cmg
  JOIN public.menu_categories          mc ON mc.id = cmg.category_id
 WHERE mc.truck_id = 'test-truck-2' AND cmg.group_id IN (SELECT id FROM src_grp)
UNION ALL
-- Belt and braces: no id is shared between the two menus at all.
SELECT 'any shared id between the two menus', (
    (SELECT count(*) FROM public.menu_categories a JOIN public.menu_categories b ON a.id = b.id
      WHERE a.truck_id = 'test-truck-3-2' AND b.truck_id = 'test-truck-2')
  + (SELECT count(*) FROM public.menu_items_db a JOIN public.menu_items_db b ON a.id = b.id
      WHERE a.truck_id = 'test-truck-3-2' AND b.truck_id = 'test-truck-2')
  + (SELECT count(*) FROM public.modifier_groups a JOIN public.modifier_groups b ON a.id = b.id
      WHERE a.truck_id = 'test-truck-3-2' AND b.truck_id = 'test-truck-2')
 )
 ORDER BY 1;

-- ── D. Content equivalence — names, prices and allergen data carried verbatim.
--    Both sides must return ZERO rows.
SELECT 'in source, missing/differing in target' AS direction, s.name, s.price
  FROM (SELECT mi.name, mi.price, mi.allergens, mi.dietary_info, mi.sort_order
          FROM public.menu_items_db mi WHERE mi.truck_id = 'test-truck-3-2') s
 EXCEPT ALL
SELECT 'in source, missing/differing in target', t.name, t.price
  FROM (SELECT mi.name, mi.price, mi.allergens, mi.dietary_info, mi.sort_order
          FROM public.menu_items_db mi WHERE mi.truck_id = 'test-truck-2') t;
```

---

## What this copy does NOT carry across, and why

**Nothing is deliberately dropped from the seven menu tables — the `SELECT *` staging carries every
column verbatim, including any I have never seen.** What follows is what that means in practice.

| Not carried / carried-but-wrong | Why |
|---|---|
| 🔴 **`menu_items_db.image_path` IS carried, and it will be WRONG** | `get_upload_url` builds storage paths as `${truck.id}/…`, so every copied path points into **`test-truck-3-2`'s storage prefix**. It is not an FK and nothing validates it. **The images will either render from the source truck's folder or 404.** ⚠️ **This is the one field I would null out** — say the word and I will add the statement. |
| ⚠️ **`stock_count` / `default_stock` are carried** | Live per-service trading state, not menu shape. Harmless on an empty target but they are a snapshot of Apple Tester mid-review. |
| ⚠️ **Soft-deleted rows are carried** (`is_active = false`) | **Deliberate** — your verification requires *"row counts match per table"*, and filtering `is_active` would make them differ. The Manage UI hides these, so the copy will look identical while the tables match exactly. |
| ⚠️ **`created_at` / `updated_at` are carried** if those columns exist | `SELECT *` copies them, so the new rows claim the source's timestamps rather than now(). Cosmetic. |
| **Per-event stock** (`event_option_stock`, `event_item_stock`, `category_stock`) | Keyed to **events**, not to the menu. Out of scope. |
| **`bundles_db`, `discount_codes_db`, `upsell_rules`** | Truck-scoped and menu-adjacent, but **not part of "the menu"** as your report scoped it. `upsell_rules` references categories by name and `bundles_db` references category slots — **both would need their own remap.** Not included; say if you want them. |
| **Orders, events, vans, allergen audit log** | Not menu tables. |
| **`allergen_audit_log` entries** | The copy writes rows directly, so **no audit trail is generated** — unlike the app paths, which call `logAllergenChanges`. The copied `allergens` / `allergens_verified` values themselves are carried verbatim. |

⚠️ **AND ONE BEHAVIOURAL CONSEQUENCE WORTH KNOWING BEFORE YOU LOOK AT THE RESULT:** if the copied items
carry `allergens_verified = false` and `test-truck-2`'s `allergen_display_mode` is `'per_dish'`, **the
customer menu filters unverified items out and renders EMPTY** — the trap recorded at
`lib/provision-truck.ts:192-194`. Check `trucks.allergen_display_mode` on the target before concluding
the copy failed.

---

## 🔴 Every statement that touches `test-truck-3-2`, and its verb

| Script | Statement | Verb |
|---|---|---|
| 0 | 0a counts, 0b/0c catalogue reads | **SELECT** |
| 1 | Guard 1 source-exists count | **SELECT** |
| 1 | Five `INSERT INTO map_* … SELECT … WHERE truck_id = 'test-truck-3-2'` | **SELECT** (the INSERT targets a **TEMP** table) |
| 1 | Seven `CREATE TEMP TABLE stage_* AS SELECT … WHERE truck_id = 'test-truck-3-2'` | **SELECT** (the CREATE targets a **TEMP** table) |
| 1 | Final-guard source counts | **SELECT** |
| 2 | All of A, B, C, D | **SELECT** |

**Every `UPDATE` in Script 1 targets a `stage_*` TEMP table. Every `INSERT … SELECT` targets a
`public.*` table with `truck_id = 'test-truck-2'` or a row reachable only from it. There is no `DELETE`
anywhere in any script.**

✅ **No statement in any of the three scripts writes to `test-truck-3-2` or to any row belonging to it.**

---

## What remains unverified

1. 🔴 **NONE OF THIS SQL HAS BEEN RUN OR PARSED.** No database has seen it. **It is unproven text**, and
   a syntax error is entirely possible — Script 1 is wrapped in `BEGIN`/`COMMIT` precisely so a failure
   leaves nothing behind.
2. 🔴 **I have never seen these tables' schema.** Script 0b/0c exist to confirm the two assumptions at
   the top; **if either is wrong, Script 1 must be adjusted before it runs** (the array-cast note and
   Guard 3 are the two places).
3. **The `EXCEPT ALL` check in 2D compares five columns only** (name, price, allergens, dietary_info,
   sort_order) — chosen because they are the fields your fake-order script would key on. **It is not a
   full row diff.**
4. **`test-truck-2`'s emptiness is your pre-flight**, re-checked by Guard 2 rather than trusted.
5. **`image_path` is a known-wrong carry, flagged above and NOT fixed** — I did not add a null-out
   without asking, because it is a deliberate change to the data rather than a copy of it.
