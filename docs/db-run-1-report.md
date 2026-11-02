# db-run-1 — run migrations from Claude Code, starting with the FAQ

*2 November 2026. Status: **done.** The FAQ migration is verified live; it had already been applied before this task,
byte-for-byte as committed, so I didn't run it. psql couldn't be installed (no Homebrew), so on your decision (Q1 → C)
migrations now run through Node and the `pg` driver via npx (§5). That path is proven with a read-only query. No migration
was run.*

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

`.cursor/rules/working-rules.mdc` (the always-applied rules file), section "Running migrations (db-run-1)", now reads:

- write the migration as a file in `supabase/migrations/`, commit it, show the full SQL in chat, then run the committed file
  yourself with Node and `pg` through npx (never added to the project):
  `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/<file>.sql`
  It runs as one transaction that stops on the first error and rolls back. Then verify read-only with the MCP and report;
- `--probe` is the read-only check that the path works;
- never `supabase db push`;
- **stop and ask** before anything that deletes or updates existing rows in `trucks`, `orders`, `plans`, `plan_prices`,
  `plan_features` or `country_settings`, or that touches `pizzeria-gusto`. The script refuses such a file unless
  `--approved-by-dominic` is passed, and that flag is passed only after you've said yes in the session;
- never ad-hoc write SQL outside a committed file (the script has no "run this string" mode);
- the read-only MCP stays read-only;
- never print `SUPABASE_DB_URL` or list `.env.local`'s other keys.

My memory was updated to match (it had said never to run SQL myself).

## 5 · The migration path: Node and pg via npx (your decision, Q1 → C)

**`scripts/db-migrate.cjs`** (new). It writes to production, so it is in `scripts/harnesses.json`'s `operational_refused`
group, and no sweep runs it.

- **The driver:** `pg@8.13.1` comes from npx's cache (`npx -y -p pg@8.13.1 …`). The script finds it on npx's PATH entry.
  It is not in `package.json`, `package-lock.json` or `node_modules`.
- **The connection:** the script reads `SUPABASE_DB_URL`, that one line of `.env.local` only. It never prints it, and it
  scrubs the URL, password and user@host from any error message.
- **TLS:** encrypted, certificate not verified — what psql's `sslmode=require` does.
- **What it refuses, before connecting:**
  - any file not under `supabase/migrations/`;
  - a file not committed, or different from HEAD;
  - a file that UPDATEs, DELETEs FROM or TRUNCATEs a protected table, or names `pizzeria-gusto`, without
    `--approved-by-dominic`;
  - anything but `--probe` or exactly one file.
- **One transaction, stops on the first error:** the whole file goes as one simple query. Postgres runs a multi-statement
  simple query as one transaction (or inside the file's own `begin; … commit;`) and runs nothing after an error. The script
  then sends ROLLBACK and exits non-zero. (So there are no psql `-1` double-transaction warnings.)

**Proof (read-only, no migration run):**

```
$ npx -y -p pg@8.13.1 node scripts/db-migrate.cjs --probe
db-migrate --probe: current_user=postgres · now()=2026-11-02T10:41:54.538Z · transaction_read_only=on · server 17.6
```

It ran `begin read only; select current_user, now(), …; rollback`.

**Refusals, checked offline** (each stopped before any connection):

| Case | Message |
|---|---|
| 20261042 (it updates `country_settings`), no approval | "updates/deletes a protected table — STOP and ask Dominic first (then pass --approved-by-dominic)" |
| `package.json` | "is not a file under supabase/migrations/" |
| a new, uncommitted `.sql` | "is not committed" |
| no arguments | the usage line |

## 6 · Files

- `scripts/db-migrate.cjs` (new): the runner.
- `scripts/harnesses.json`: the runner added to `operational_refused`. `_lp-copy-truth-1.cjs`, my copy-truth-1 module that
  was never registered, added to `shared_modules`. The dry run's other 12 unregistered files predate this work.
- `.cursor/rules/working-rules.mdc`: the standing rule.
- `docs/db-run-1-report.md`: this report.
- No migration was run, and no data changed.

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
