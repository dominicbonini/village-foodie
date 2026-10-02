-- 20260930_outreach_prospects_contact_name_split.sql
-- The contact's name in two columns, so a greeting can say "Hi George" without guessing where to cut.
--
-- ✅ ALREADY APPLIED, AND NEVER COMMITTED UNTIL NOW. Both columns hold data today:
--    docs/outreach-name-tokens-report.md counts 231 prospects, 3 with a first name and 1 with a last,
--    and `{{first_name}}` / `{{last_name}}` have been live tokens since that build. The columns were
--    added by hand and no migration file was written, so the repository's record of the schema was
--    missing two columns that six files read and one route writes.
--
-- ⚠️ RUNNING THIS AGAINST THE LIVE DATABASE IS A NO-OP — `add column if not exists`, twice, plus two
--    idempotent comments. It adds nothing, backfills nothing and drops nothing.
--
-- ── 🔴 WHY IT IS BEING WRITTEN ON 2 OCTOBER 2026 ───────────────────────────────────────────────────
-- The schema census added today (scripts/outreach-schema-census.cjs) checks every column named in a
-- select against supabase/migrations/, because a column that does not exist had just stopped every
-- outreach send for a day. It flagged these two. They are NOT the same kind of finding as that one —
-- they exist, nothing is broken, and the capability probe in app/api/admin/outreach/route.ts
-- (`columnExists('contact_first_name, contact_last_name')`) means the console degrades to a single
-- name field rather than erroring if they ever did not. 🔴 BUT THE CENSUS CANNOT TELL THE TWO APART,
-- AND MUST NOT BE TAUGHT TO. "This column is missing from the migrations but I happen to know it is
-- live" is exactly what someone would have said about `preview` the day before it refused 300 sends.
-- The record is either complete or it is advisory, and an advisory record protects nothing.
--
-- ── WHAT THEY ARE, AND WHAT `contact_name` NOW IS ──────────────────────────────────────────────────
-- `contact_name` (20260903_outreach_contact_name.sql) is FROZEN: the split moved every reader to the
-- two columns below and stopped writing it. It is still selected for one release so an old row stays
-- inspectable and a missed reader fails loudly. Dropping it is a later, separate change, with the
-- drift query in docs/outreach-name-tokens-report.md to run first.
begin;

alter table public.outreach_prospects
  add column if not exists contact_first_name text,
  add column if not exists contact_last_name  text;

comment on column public.outreach_prospects.contact_first_name is
  'The contact person''s first name, for {{first_name}} and the greeting. Free text, nullable; NULL = not known, which renders as the template''s fallback rather than an empty greeting. Written by the console only; never parsed out of contact_name.';

comment on column public.outreach_prospects.contact_last_name is
  'The contact person''s last name, for {{last_name}}. Free text, nullable; NULL = not known. Independent of contact_first_name — a first name with no last name is the common case and is not an incomplete row.';

commit;

-- 🔴 PostgREST caches the schema. Until it reloads, the probe in app/api/admin/outreach/route.ts
--    returns PGRST204, reads it as "absent", and the console offers the single legacy name field.
notify pgrst, 'reload schema';

-- ── VERIFICATION ──────────────────────────────────────────────────────────────────────────────────
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'outreach_prospects'
  and column_name in ('contact_name', 'contact_first_name', 'contact_last_name')
order by column_name;

-- 🧪 The name-tokens report expects 231 prospects, 3 with a first name, 1 with a last.
select count(*)                                                            as prospects,
       count(*) filter (where coalesce(trim(contact_first_name), '') <> '') as with_first,
       count(*) filter (where coalesce(trim(contact_last_name), '')  <> '') as with_last,
       count(*) filter (where coalesce(trim(contact_name), '')       <> '') as with_legacy_name
from public.outreach_prospects;
