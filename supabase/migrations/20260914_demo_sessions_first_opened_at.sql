-- 20260914_demo_sessions_first_opened_at.sql
-- FIRST-OPEN restart: the moment a prospect first opens their demo link, recorded ONCE, server-side.
--
-- ⚠️ NOT YET APPLIED. Written 14 September 2026; apply by hand, then verify with the block at the end.
-- ADDITIVE / RUN-ANYTIME: one nullable column, `if not exists`, no default, no row touched, nothing
-- else changed. Safe to run twice.
--
-- ⚠️ 20260912_demo_sessions_outreach.sql IS APPLIED (confirmed by Dominic, 14 September). Its own header
-- still says "NOT YET APPLIED" — that line is stale and has been corrected in place. This is the FIFTH
-- instance of the family both 20260723_demo_sessions_phase4.sql and 20260728_..._extraction_source.sql
-- record: a belief about the database is not a fact about the database, and a stale "not applied" header
-- is the dangerous direction because it invites someone to append columns to a file whose
-- `add column if not exists` statements will run clean and add NOTHING.
--
-- ── WHY A COLUMN, AND WHY NOT localStorage ──────────────────────────────────────────────────────────
-- The demo dashboard already restarts itself when there is no LIVE event (docs/demo-restart-report.md
-- §2), and that trigger is guarded by a localStorage stamp. This is a DIFFERENT trigger and localStorage
-- cannot carry it: a prospect who opens the link on their phone and then on their laptop is the same
-- person opening the same demo once, and two browsers hold two stamps. Only the server can say "this
-- link has been opened before".
--
-- ── WHY NULLABLE, AND WHAT NULL MEANS ───────────────────────────────────────────────────────────────
-- NULL = never opened. Every existing row is NULL, which is exactly right: a demo built before this
-- column existed has genuinely not had its first open recorded, and the first prospect to open it gets
-- the fresh board the feature exists to give them. NOT NULL with a default would have back-dated every
-- one of them to "already opened" and silently disabled the feature for the demos already in flight.
--
-- ⚠️ IT IS CLAIMED, NOT WRITTEN. The app sets it with a conditional update —
--   update demo_sessions set first_opened_at = now() where truck_id = $1 and first_opened_at is null
-- — and acts only when that matched a row. Two simultaneous opens serialise on the row lock; under READ
-- COMMITTED the second re-evaluates its WHERE against the committed row, sees a non-null value and
-- matches ZERO rows. Exactly one restart, no advisory lock, no transaction management in the app.
alter table demo_sessions add column if not exists first_opened_at timestamptz;

comment on column demo_sessions.first_opened_at is
  'When this demo link was first opened by a prospect, claimed atomically (update ... where first_opened_at is null) by /api/demo/restart. NULL = never opened. Drives the first-open restart, so the prospect lands on a service starting from THEIR moment rather than whenever the demo was built. Never set by an admin preview (the route skips the claim for an admin session) and never set for an anonymous landing-page demo (the claim also requires discovery_truck_id to be non-null).';

-- No index. The only read is by primary key (`truck_id`), which demo_sessions_pkey already serves, and
-- the only write is the conditional update on that same key. An index on a column with one lookup path
-- through the PK would be dead weight.

notify pgrst, 'reload schema';

-- ── VERIFY (run after) ─────────────────────────────────────────────────────────────────────────────
-- Expect one row: first_opened_at, timestamp with time zone, is_nullable YES, no default.
--   select c.column_name, c.data_type, c.is_nullable, c.column_default
--     from information_schema.columns c
--    where c.table_schema = 'public' and c.table_name = 'demo_sessions'
--      and c.column_name = 'first_opened_at';
--
-- And every existing row NULL (nothing back-dated):
--   select count(*) as sessions, count(ds.first_opened_at) as already_opened
--     from public.demo_sessions ds;
