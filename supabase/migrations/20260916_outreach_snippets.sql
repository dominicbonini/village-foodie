-- 20260916_outreach_snippets.sql
-- ⛔ PROPOSED — NOT APPLIED. Apply by hand in the Supabase SQL editor, as every migration here is.
-- 🔴 THIS HEADER MUST BE CORRECTED THE DAY IT IS APPLIED, IN BOTH DIRECTIONS. A stale "NOT APPLIED" on
-- a live file has misled this series once; a report claiming "unapplied" from a file header has misled
-- it the other way. As at writing this file has never been executed against any database.
-- ⚠️ AND RUN THE LAST LINE. `alter`/`create` alone is not enough for this app to see a table: PostgREST
-- answers from a schema cache, and the lead-type column existed for a day while the app reported it
-- absent because nothing told PostgREST to reload.
--
-- ── WHAT AND WHY ────────────────────────────────────────────────────────────────────────────────────
-- ONE new table. A SNIPPET is a named reusable value — the pattern HubSpot and Salesloft use — defined
-- once and pulled into every template that references it by name.
--
-- 🔴 THE PROBLEM IT REPLACES. `[[my rate]]` appears in four of the five seeded templates, and until now
-- a value for it had to be typed into EACH of them: `outreach_templates.placeholder_defaults` is
-- per-template jsonb, so "set my rate" meant four edits and changing it meant four more. A localStorage
-- layer added on 15 September made it one edit but only in one browser. Neither is a library.
--
--   name   text primary key — the text between the brackets, so `[[my rate]]` has name 'my rate'
--   value  text not null default '' — the value to fill in. '' is LEGITIMATE and means "ask me per
--          truck": the compose window leaves the field empty and prompts, exactly as it does today for
--          a name with no snippet at all.
--
-- 🔴 A ROW THAT EXISTS WITH AN EMPTY VALUE IS NOT THE SAME AS NO ROW, AND THAT DISTINCTION IS THE
-- REASON THIS IS A TABLE RATHER THAN A JSON BLOB. "I have decided this one is always typed per truck"
-- and "nobody has looked at this one yet" are different states, and the library shows them differently.
-- Both behave identically at compose time; the difference is for the operator, not the renderer.
--
-- ⚠️ `name` IS THE PRIMARY KEY, NOT A SURROGATE ID. The name IS the identity — it is what the template
-- body contains, and there is no second way to refer to a snippet. A uuid here would be a key nothing
-- joins on. The cost is that renaming a snippet is a delete plus an insert, which is correct: renaming
-- it without editing the bodies that reference it would orphan every one of them.
--
-- 🔴 NO CHECK CONSTRAINT ON `name`, per the house rule (20260903_outreach_tracking): PostgREST exposes
-- no CHECK metadata, so the app cannot read one back, and a constraint with no reader drifts. The name
-- is validated in the API route before every write.
--
-- ── NOTHING IS SEEDED, AND NOTHING IS MIGRATED ──────────────────────────────────────────────────────
-- 🔴 THIS FILE INSERTS NO ROW. The library ships EMPTY and fills as the operator types into it.
-- 🔴 AND IT DOES NOT TOUCH `outreach_templates`. Any value already sitting in a template's
-- `placeholder_defaults` is left exactly where it is — every outreach template requires the operator's
-- explicit sign-off, and copying a value out of one into this table would be writing on his behalf.
-- 🧪 He reports `placeholder_defaults` is `{}` on all 9 rows, so there is nothing to copy today; the
-- app handles the case where there is (the snippet wins, and the template editor says so out loud).

set lock_timeout = '3s';

begin;

create table if not exists public.outreach_snippets (
  name       text primary key,
  value      text        not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.outreach_snippets is
  'Named reusable values pulled into outreach templates by [[name]]. One row per distinct name, '
  'defined once and used by every template that references it. An empty value means "ask me per truck" '
  'and is a deliberate state, distinct from having no row at all.';

comment on column public.outreach_snippets.name is
  'The text between the brackets: [[my rate]] has name ''my rate''. PRIMARY KEY — the name is the '
  'identity, because it is what the template body contains.';

comment on column public.outreach_snippets.value is
  'What to fill in. '''' = ask me per truck (the compose window prompts, as it does with no row).';

-- 🔴 SERVICE-ROLE ONLY, matching outreach_templates. This is admin reference data; no anon or
-- authenticated role has any business reading or writing it.
alter table public.outreach_snippets enable row level security;

drop policy if exists "service_role only" on public.outreach_snippets;
create policy "service_role only" on public.outreach_snippets
  for all to service_role using (true) with check (true);

revoke all on public.outreach_snippets from anon, authenticated, public;

commit;

-- 🔴 RUN THIS LINE. Without it PostgREST keeps serving its cached schema and the app cannot see the
-- new table, which is exactly what happened with lead_type_at_first_contact.
notify pgrst, 'reload schema';
