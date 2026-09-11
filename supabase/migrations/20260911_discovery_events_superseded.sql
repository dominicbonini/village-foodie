-- 20260911_discovery_events_superseded.sql
-- Superseded (duplicate) marking on discovery_events.
--
-- ⛔ NOT APPLIED. Run by hand in the Supabase SQL editor.
-- 🔴 AFTER APPLYING, RUN THE LAST LINE: `notify pgrst, 'reload schema';` — PostgREST caches the schema
--    and answers PGRST204 for a column it has not been told about, which reads as "the migration failed".
--
-- WHY A NEW COLUMN FAMILY AND NOT `visibility` / `show_on_vf` / `show_on_hg`:
--   those three can HIDE a row (the public feed filters on show_on_*), and the gate does flip show_on_*
--   off on a loser — but none of them can say WHY a row is hidden, WHICH row replaced it, how far apart
--   the two venues were, or what the sources and the time gap were. `visibility = 'hidden'` is also
--   already reserved for operator suppression, so reusing it would conflate two meanings. Duplicates
--   are STORED, never deleted; these columns are the record.
--
-- Idempotent: every statement is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

begin;

alter table public.discovery_events
  add column if not exists superseded_by     uuid references public.discovery_events(id) on delete set null,
  add column if not exists superseded_reason text check (superseded_reason in ('postcode', 'distance')),
  add column if not exists superseded_meta   jsonb,
  add column if not exists superseded_at     timestamptz;

comment on column public.discovery_events.superseded_by is
  'Set when this row was judged a duplicate of a NEWER row (same date, same truck, same full postcode OR venues within 500 m). Points at the winner. The row is kept, not deleted; the public feed hides it.';
comment on column public.discovery_events.superseded_reason is
  'Which half of the rule fired: postcode (same full postcode) or distance (<= 500 m).';
comment on column public.discovery_events.superseded_meta is
  '{ metres, postcode, time_gap_min, winner_source, loser_source, winner_key } — recorded for tuning; time is NOT part of the rule.';

-- the public feed asks "superseded_by is null" on every request; keep that cheap
create index if not exists idx_discovery_events_superseded_by
  on public.discovery_events (superseded_by) where superseded_by is not null;

commit;

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────────────────────────
--   select count(*) filter (where superseded_by is not null) as superseded, count(*) as total
--   from public.discovery_events;
-- Expected immediately after applying: superseded 0 (nothing is marked until the backfill is run with --apply).

notify pgrst, 'reload schema';
