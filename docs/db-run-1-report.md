# db-run-1 — run migrations from Claude Code, starting with the FAQ

*2 November 2026. Status: **the FAQ migration is verified live, but I did not run it**. It had already been applied before
this task, byte-for-byte as committed. **psql is not installed, and can't be with the brief's command, because this Mac has
no Homebrew.** One decision is needed from you (§5).*

## 1 · Setup checks

| Check | Result |
|---|---|
| `.env.local` contains `SUPABASE_DB_URL` | **present** (checked with `grep -q` on that one key name only; no value, and no other key, was printed or written anywhere) |
| `.env.local` is git-ignored | **yes** (`git check-ignore`), and not tracked (`git ls-files`) |
| `psql` installed | **no**: not on PATH, and not at `/opt/homebrew/opt/libpq/bin` or `/usr/local/opt/libpq/bin` |
| `brew install libpq` | **could not run**: Homebrew isn't installed (no `brew` on PATH, none at `/opt/homebrew/bin` or `/usr/local/bin`; Apple Silicon, arm64) |
| Any other Postgres client | none: no `pg` / `postgres` package in `node_modules`, no Docker, no Supabase CLI, no Postgres.app |
| `supabase db push` | not used, as instructed |

No shell profile was touched. Nothing was installed.

## 2 · The FAQ migration

- **File:** `supabase/migrations/20261056_faq_1.sql`, identical to commit `82c5adee` in both HEAD and the working tree
  (`git diff --quiet`; sha256 starts `0d100b559e3b4ccc`).
- **Not run by me.** Before running, I checked the live tables read-only. **Both already existed**, holding exactly this
  file's seed. They didn't exist when faq-1b checked earlier today, so the file was run in between (every row has
  `created_at` 2 November and `updated_by` 'faq-1 seed'). Presumably you ran it by hand. The file is idempotent
  (`create table if not exists`, `on conflict (id) do nothing`), so running it now would change nothing. The brief's
  command also couldn't run without psql.
- **A note on the command for later:** `psql -1` wraps the file in its own transaction, and this file also says
  `begin; … commit;`. psql will print two warnings ("there is already a transaction in progress" at the file's `begin`, and
  "there is no transaction in progress" at the end). Neither is an error, `ON_ERROR_STOP` doesn't trigger, and every
  statement still runs in one transaction (the file's). Harmless; recorded so the warnings don't look like a failure.

## 3 · Read-only verification (Supabase MCP)

Everything you asked for checks out:

| Check | Live |
|---|---|
| Both tables exist | `faq_sections`, `faq_items` |
| RLS on | `faq_items=true, faq_sections=true` |
| Policies | **none** |
| Grants (table ACLs via `aclexplode(relacl)`) | `postgres` (the owner) and `service_role` only — no `anon`, `authenticated` or `PUBLIC` |
| Sections | **5** |
| Questions per section | **5 · 4 · 9 · 4 · 4** |
| Questions / drafts | **26 / 26** |
| Notes starting "CHECK (Cursor): " | **9** (questions …0001, 0003, 0006, 0014, 0015, 0021, 0022, 0024, 0027) |
| Row …0017 | **absent** (0 rows) |
| App flags | GB true / true; the other 43 of 44 rows false / false — unchanged |
| **Byte-for-byte against the file** | md5 of every item's id, section, position, question, answer, single-plan answer, show_in, note, status and updated_by: live `bde6aa899ff0791b86d9a105e140d5c2`, committed file (parsed) `bde6aa899ff0791b86d9a105e140d5c2`. Sections: live `18250219963d886712cf9c803c38ab62`, file `18250219963d886712cf9c803c38ab62`. **Identical.** |

`information_schema.role_table_grants` returned no rows to the MCP's role (that view only shows grants the asking role can
see), so the grants were read from `pg_class.relacl` instead.

## 4 · The standing rule

Added to `.cursor/rules/working-rules.mdc` (the always-applied rules file) as "Running migrations (db-run-1)":
- write the migration, commit it, show the full SQL in chat, run it with psql exactly as the brief gives it, verify
  read-only, and report;
- never `supabase db push`;
- stop and ask before anything that deletes or updates existing rows in `trucks`, `orders`, `plans`, `plan_prices`,
  `plan_features` or `country_settings`, or that touches `pizzeria-gusto`;
- never ad-hoc write SQL outside a committed migration file;
- the read-only MCP stays read-only;
- never print `SUPABASE_DB_URL` or list `.env.local`'s other keys.

My own memory was updated to match. It had said never to run SQL myself.

## 5 · Decision needed: how to get psql

The brief's install (`brew install libpq`) needs Homebrew, which isn't here. Installing Homebrew itself needs your admin
password, which I can't type. The question is in the chat reply. Until it's answered, a migration can be written and
committed, but not run by me.

## 6 · Files

- `.cursor/rules/working-rules.mdc`: the standing rule (appended).
- `docs/db-run-1-report.md`: this report.
- No migration, code or data changed.

## Verify SQL used (read-only)

```sql
select 'rls' as k, string_agg(relname || '=' || relrowsecurity::text, ', ' order by relname) as v from pg_class where relnamespace = 'public'::regnamespace and relname in ('faq_sections','faq_items')
union all select 'policies', coalesce(string_agg(tablename || ':' || policyname, ', '), 'none') from pg_policies where schemaname='public' and tablename in ('faq_sections','faq_items')
union all select 'per_section', string_agg(n::text, ' · ' order by position) from (select s.position, count(i.id) n from public.faq_sections s left join public.faq_items i on i.section_id=s.id group by s.id, s.position) x
union all select 'sections', count(*)::text from public.faq_sections
union all select 'items/drafts', count(*)::text || '/' || count(*) filter (where status='draft')::text from public.faq_items
union all select 'check_notes', count(*) filter (where note like 'CHECK (Cursor): %')::text from public.faq_items
union all select 'row_0017', count(*)::text from public.faq_items where id = 'fa000002-0000-4000-8000-000000000017'
union all select 'app_flags_true', coalesce(string_agg(country_code || ':' || ios_app_available::text || '/' || android_app_available::text, ', '), 'none') from public.country_settings where ios_app_available or android_app_available
union all select 'app_flags_rows', count(*)::text || ' rows; ' || count(*) filter (where not ios_app_available and not android_app_available)::text || ' false/false' from public.country_settings
union all select 'items_md5', md5(string_agg(i.id::text || '|' || i.section_id::text || '|' || i.position || '|' || i.question_en || '|' || i.answer_en || '|' || coalesce(i.answer_single_plan_en,'∅') || '|' || i.show_in || '|' || coalesce(i.note,'∅') || '|' || i.status || '|' || coalesce(i.updated_by,'∅'), E'\n' order by i.id)) from public.faq_items i
union all select 'sections_md5', md5(string_agg(id::text || '|' || position || '|' || title_en, E'\n' order by id)) from public.faq_sections;

select c.relname, coalesce(a.grantee::regrole::text, 'PUBLIC') as grantee, string_agg(a.privilege_type, ', ' order by a.privilege_type) as privileges
from pg_class c cross join lateral aclexplode(c.relacl) a
where c.relnamespace = 'public'::regnamespace and c.relname in ('faq_sections','faq_items')
group by c.relname, a.grantee order by 1, 2;
```
