-- 20261015_places_tab.sql
-- The Places tab: a pinned usual event type per place, and the truck's own extra pictures for a place.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. §1 is idempotent and additive only. The last line reloads PostgREST.
--
-- ⛔ IT CHANGES NO EXISTING ROW. One nullable column and one new table; no backfill, no update, no
--    insert. §0 proves that before anything is altered and §2 proves it afterwards.
--
-- ── 🔴 THE TWO ID TYPES WERE CHECKED BEFORE THIS WAS WRITTEN, AS INSTRUCTED ───────────────────────
--   • `public.truck_places.id`  — uuid primary key default gen_random_uuid()  (20261003_truck_places.sql:38)
--   • `public.event_types.id`   — uuid primary key default gen_random_uuid()  (20261009_event_types.sql:39)
-- Both uuid, so the new column and the new table's FK are uuid. ⚠️ `truck_id` is still TEXT, because
-- `trucks.id` is a slug — the same rule truck_places, event_types, truck_vans, whatsapp_alerts and
-- private_event_links all follow. Declaring it uuid fails outright, or silently never matches.
--
-- ⛔ AND NO UPSERT TARGETS A PARTIAL INDEX. Neither object below is partial, nothing upserts onto
--    either, and `scripts/event-pricing.cjs` §7b still guards every `onConflict:` in app/ and lib/
--    against the 42P10 that 20261013 fixed.

set lock_timeout = '3s';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 0 · 🔴 READ-ONLY PREVIEW — RUN THIS ALONE, FIRST. It writes nothing.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Expect:
--   • 'truck_places.id is uuid'      — t. ⛔ IF THIS IS f, STOP: the FK below would fail or never match.
--   • 'event_types.id is uuid'       — t. Same.
--   • 'places total'                 — however many places exist; none of them change.
--   • 'places with a pinned type'    — 0, because the column does not exist yet.
--   • 'place_pictures exists'        — f, or t if you are re-running.
select 'truck_places.id is uuid' as what,
       (select data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'truck_places' and column_name = 'id') = 'uuid' as ok
union all
select 'event_types.id is uuid',
       (select data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'event_types' and column_name = 'id') = 'uuid'
union all
select 'truck_places.truck_id is text (a slug, not a uuid)',
       (select data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'truck_places' and column_name = 'truck_id') = 'text'
union all
select 'column truck_places.usual_event_type_id already exists', exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'truck_places' and column_name = 'usual_event_type_id')
union all
select 'table place_pictures already exists', exists (
  select 1 from information_schema.tables
   where table_schema = 'public' and table_name = 'place_pictures');

select 'places total' as what, count(*)::text as n from public.truck_places
union all
select 'places that are hidden (unchanged by this)', count(*)::text
  from public.truck_places where is_hidden
union all
select 'places that are merged away (unchanged by this)', count(*)::text
  from public.truck_places where merged_into_id is not null
union all
select 'places already carrying a post picture (unchanged by this)', count(*)::text
  from public.truck_places where event_bg_path is not null
union all
select 'event types total (the pin can point at any of these)', count(*)::text
  from public.event_types;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · THE CHANGE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- ── 1.1 · truck_places.usual_event_type_id — THE PIN ─────────────────────────────────────────────
--
-- 🔴 NULL MEANS "AUTOMATIC", AND THAT IS THE WHOLE VOCABULARY. The existing rule — "the newest event
-- at this place supplies the type" (lib/event-types/resolve.ts, §70.3) — is what runs when this is
-- NULL, which is every place today. So the column is inert until an operator pins one, and the
-- Add event pre-selection is unchanged for every truck until they do.
--
-- ⛔ `on delete set null`, NEVER cascade. Deleting an event type must not delete a PLACE. The place
-- falls back to Automatic, which is where it started — the same rule `truck_events.event_type_id`
-- follows and for the same reason (§70.3: "deleting a type must not delete the truck's events").
--
-- ⚠️ IT IS NOT CONSTRAINED TO THIS TRUCK'S OWN TYPES BY THE DATABASE, and it cannot be: a composite
-- FK would need `event_types (id, truck_id)` to be unique, which it is not declared as. The ROUTE
-- validates the id against the token's truck before writing it and resolves an id it does not own to
-- NULL — the same posture `resolveRequestedTypeId` already takes for an event's type. Said out loud
-- so nobody reads the missing constraint as an oversight.
alter table public.truck_places
  add column if not exists usual_event_type_id uuid
  references public.event_types(id) on delete set null;

-- 🔴 AN INDEX ON THE FK, because `on delete set null` makes Postgres scan this table every time a
-- type is deleted. Without it, deleting a type on a truck with many places is a sequential scan.
create index if not exists truck_places_usual_event_type_idx
  on public.truck_places (usual_event_type_id)
  where usual_event_type_id is not null;

comment on column public.truck_places.usual_event_type_id is
  'The event type PINNED for this place, or NULL for "Automatic" — the existing rule that the newest event at this place supplies the type (§70.3). Add event pre-selects `pin ?? the automatic rule`. ⛔ on delete set null: deleting a type must not delete a place; it falls back to Automatic. ⚠️ NOT constrained to the place''s own truck by the database (a composite FK would need event_types (id, truck_id) unique, which it is not) — app/api/manage/route.ts validates the id against the token''s truck and resolves a foreign one to NULL. Added 20261015.';

-- ── 1.2 · public.place_pictures — THE TRUCK'S OWN EXTRA PICTURES ──────────────────────────────────
--
-- ⛔ THESE DO NOT AFFECT POSTS, AND THAT IS THE POINT OF A SEPARATE TABLE. The picture a poster uses
-- is `truck_places.event_bg_path` (20261007) with its width, height and `event_layout` — ONE per
-- place, with text positions placed on it. These are the truck's own reference pictures: a photo of
-- the pitch, a copy of the venue's own artwork, a map of where to park. A second row in the same
-- place column could not express "this one is not for a poster", and the rendering code would have to
-- learn a flag it has no reason to know about.
-- 🔴 SO NOTHING IN lib/weekly-post/ OR app/api/weekly-post/ READS THIS TABLE, and
-- scripts/places-tab.cjs asserts it.
--
-- ⚠️ SAME BUCKET AS THE POST PICTURES (`post-designs`), under the place's own folder, as instructed.
-- One bucket means one set of storage policies to be right about; the folder is what keeps a place's
-- files together when somebody is looking at them in the Supabase console.
create table if not exists public.place_pictures (
  id uuid primary key default gen_random_uuid(),

  -- 🔴 TEXT, NOT uuid — `trucks.id` is a slug. Checked in §0.
  -- ⚠️ IT IS HERE AS WELL AS ON THE PLACE, DELIBERATELY. Every read is "this truck's pictures for this
  -- place", and a tenant filter that needs a join is a tenant filter somebody will forget to write.
  truck_id text not null references public.trucks(id) on delete cascade,

  -- ⚠️ `on delete cascade`: the pictures belong to the place. Deleting the place takes them.
  place_id uuid not null references public.truck_places(id) on delete cascade,

  -- The object path inside the `post-designs` bucket.
  -- ⛔ THE STORAGE OBJECT IS NOT DELETED BY THIS CASCADE. Postgres cannot reach into storage, so a
  -- cascaded delete leaves the file behind. The route deletes the object first and the row second, and
  -- the orphan that a failure between the two leaves is a wasted file rather than a broken screen.
  path text not null,

  -- What the operator called it when they uploaded it, so the list is readable and Download has a name.
  file_name text not null,

  -- For the "name · size" line. `integer` is ample: the route caps uploads at 10MB.
  bytes integer not null,

  -- Null when the file could not be measured. The list then shows the name alone rather than "0×0".
  width integer,
  height integer,

  created_at timestamptz not null default now(),

  constraint place_pictures_path_not_blank check (length(btrim(path)) > 0),
  constraint place_pictures_name_not_blank check (length(btrim(file_name)) > 0),
  -- ⚠️ THE CAP IS IN THE TABLE AS WELL AS THE HANDLER. 10MB, matching MAX_PLACE_PICTURE_BYTES.
  constraint place_pictures_bytes_sane check (bytes > 0 and bytes <= 10485760)
);

-- 🔴 ONE PATH, ONCE. A re-upload that produced two rows for one object would show the operator the
-- same picture twice and make Remove ambiguous. ⚠️ NOT PARTIAL, and nothing upserts onto it — the
-- route inserts and handles 23505 by re-reading, the same pattern the Private type uses.
create unique index if not exists place_pictures_path_uidx
  on public.place_pictures (path);

create index if not exists place_pictures_place_idx
  on public.place_pictures (place_id, created_at desc);

-- ⛔ SERVICE ROLE ONLY, LIKE truck_places AND event_item_prices. Every read happens in a route handler
-- with the service key, authenticated by the truck's dashboard token; a browser must never be able to
-- enumerate another truck's pictures.
alter table public.place_pictures enable row level security;
revoke all on public.place_pictures from anon, authenticated;

comment on table public.place_pictures is
  'The truck''s OWN extra pictures for a place — a photo of the pitch, the venue''s artwork, a parking map. ⛔ THEY DO NOT AFFECT POSTS: the poster''s picture is truck_places.event_bg_path with its own width/height/event_layout, and nothing in lib/weekly-post or app/api/weekly-post reads this table (scripts/places-tab.cjs asserts it). Stored in the `post-designs` bucket under the place''s folder. Service-role only. Added 20261015.';

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · READ-ONLY VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Expect the column as uuid, NULLABLE, no default; and the seven place_pictures columns.
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and (
     (table_name = 'truck_places' and column_name = 'usual_event_type_id')
     or table_name = 'place_pictures'
   )
 order by table_name, ordinal_position;

-- The FK's delete rule. ⛔ Expect SET NULL on usual_event_type_id and CASCADE on both of
-- place_pictures' parents. A CASCADE on the first would mean deleting a type deletes places.
select tc.constraint_name, tc.table_name, kcu.column_name, rc.delete_rule
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
  join information_schema.referential_constraints rc
    on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.constraint_schema
 where tc.constraint_type = 'FOREIGN KEY'
   and tc.table_schema = 'public'
   and (tc.table_name = 'place_pictures'
        or (tc.table_name = 'truck_places' and kcu.column_name = 'usual_event_type_id'))
 order by tc.table_name, kcu.column_name;

-- The indexes. Expect place_pictures_path_uidx UNIQUE with NO `WHERE`, and the pin's index partial
-- (it is an index, never an ON CONFLICT target, so partial is safe and correct here).
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('place_pictures_path_uidx', 'place_pictures_place_idx',
                     'truck_places_usual_event_type_idx')
 order by indexname;

-- ⛔ AND THE PROOF THAT NOTHING MOVED.
select 'places with a pinned type (expect 0 — nothing is backfilled)' as what, count(*)::text as n
  from public.truck_places where usual_event_type_id is not null
union all
select 'extra pictures (expect 0)', count(*)::text from public.place_pictures
union all
select 'places still carrying their post picture', count(*)::text
  from public.truck_places where event_bg_path is not null
union all
select 'places total (unchanged)', count(*)::text from public.truck_places;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA and every select naming the new column or table
-- answers PGRST204/PGRST205 — which the Places tab reads as "the migration is not applied" and shows
-- Automatic for every place with no pictures pane at all.
notify pgrst, 'reload schema';
