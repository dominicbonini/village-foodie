-- 20260912_demo_sessions_outreach.sql
-- Outreach "Create Demo": a demo built FOR a discovery-truck prospect, with a readable URL, a one-month
-- life, and a record of what happened when the prospect later self-served.
--
-- ✅ APPLIED (confirmed by Dominic, 14 September 2026). This header previously read "NOT YET APPLIED";
-- that was true when the file was written and is not true now. Re-running it is harmless but a NO-OP —
-- every statement is `add column if not exists` — so DO NOT ADD COLUMNS HERE expecting them to land.
-- A later addition needs its own file; see 20260914_demo_sessions_first_opened_at.sql, and the same
-- warning in 20260723_demo_sessions_phase4.sql, which exists for exactly this reason.
-- ADDITIVE / RUN-ANYTIME: every statement is `if not exists`, no defaults change, no row is touched.
-- ORDER-REQUIRED: lib/demo-session.ts writes `discovery_truck_id` and `public_ref` for an outreach demo
-- and that write is NOT best-effort (an outreach demo without its link and its URL is useless to the
-- admin who asked for it), so the admin "Create Demo" route fails until this has run. The anonymous
-- landing-page path never sends these columns and is unaffected either way.
--
-- ── WHY THE LINK LIVES HERE AND NOT ON discovery_trucks.hatchgrab_truck_id ─────────────────────────
-- Every reader of `hatchgrab_truck_id` acts on "this discovery row IS an operator truck": the admin
-- console folds the row out of its list, the promote's `.is(null)` guard would refuse the real promotion
-- later, the scraper bridge would write truck_events onto the linked truck, the public feed's read-through
-- would look to it for a logo. A demo satisfies none of that. The demo → discovery link is SESSION state
-- (it dies with the demo, exactly like the email and the expiry), so it sits with the session.
-- 🔴 A DEMO MUST NEVER BE WRITTEN TO hatchgrab_truck_id. The REAL truck a prospect creates from that demo
-- MUST be (see the discovery_link_* columns below and /api/setup create_truck).

-- ── discovery_truck_id ─────────────────────────────────────────────────────────────────────────────
-- NULLABLE: every anonymous landing-page demo has no prospect behind it, and NOT NULL would break all of
-- them. ON DELETE SET NULL: deleting a discovery row must not delete a live demo; the demo simply becomes
-- an unbranded one that nothing can convert into a link.
alter table demo_sessions add column if not exists discovery_truck_id uuid
  references discovery_trucks(id) on delete set null;

comment on column demo_sessions.discovery_truck_id is
  'The discovery (Village Foodie) truck this demo was built FOR by the outreach "Create Demo" action. NULL for an anonymous landing-page demo. Drives the branded name/logo on the demo and the self-serve conversion link; NEVER copied to discovery_trucks.hatchgrab_truck_id.';

-- ── public_ref ─────────────────────────────────────────────────────────────────────────────────────
-- The readable URL segment: /demo/<public_ref>, slugified from the truck name ("pizzeria-gusto"), with a
-- short random suffix only on collision. UNIQUE so a collision is a 23505 the writer can retry, never
-- two demos behind one URL.
-- 🔴 A LOOKUP KEY, NOT A CREDENTIAL. /demo/<public_ref> resolves this to the truck's dashboard_token and
-- redirects; the token stays the boundary. trucks.id / trucks.slug / trucks.dashboard_token are untouched
-- and stay `demo-` + random (lib/provision-truck.ts demoIdentity), which proxy.ts and assertReservedPrefix
-- depend on.
alter table demo_sessions add column if not exists public_ref text;

alter table demo_sessions drop constraint if exists demo_sessions_public_ref_key;
alter table demo_sessions add constraint demo_sessions_public_ref_key unique (public_ref);

comment on column demo_sessions.public_ref is
  'Readable URL segment for /demo/<public_ref>. Slug of the truck name, random-suffixed on collision. Lookup key only — resolves to dashboard_token server-side and is never itself an access credential. NULL for anonymous demos.';

-- ── discovery_link_* — what happened when the prospect self-served ─────────────────────────────────
-- /api/setup create_truck links discovery_trucks.hatchgrab_truck_id = the NEW REAL truck for a demo that
-- carries a discovery_truck_id. Unlike the admin promote it NEVER deletes the operator's just-created
-- truck when that link fails — it creates the truck regardless and records the outcome HERE so the admin
-- can reconcile. Three columns rather than one so the truck id and the reason survive together.
--   status: 'linked'   — hatchgrab_truck_id now points at discovery_link_truck_id
--           'conflict' — the discovery row already carried a non-null hatchgrab_truck_id (the `.is(null)`
--                        guard matched zero rows); NOT overwritten, NOT silent
--           'failed'   — PostgREST returned an error (note carries the message)
-- No CHECK constraint, matching extraction_source: the values are enforced by the TypeScript writer, and
-- the column is diagnostic, not a gate.
alter table demo_sessions add column if not exists discovery_link_status text;
alter table demo_sessions add column if not exists discovery_link_truck_id text;
alter table demo_sessions add column if not exists discovery_link_note text;
alter table demo_sessions add column if not exists discovery_linked_at timestamptz;

comment on column demo_sessions.discovery_link_status is
  'Outcome of the self-serve discovery link attempted by /api/setup create_truck: linked | conflict | failed. NULL = never attempted (anonymous demo, or the prospect has not converted).';
comment on column demo_sessions.discovery_link_truck_id is
  'The REAL operator truck id the self-serve link pointed (or tried to point) discovery_trucks.hatchgrab_truck_id at.';
comment on column demo_sessions.discovery_link_note is
  'Human-readable reason for a conflict or failure, for reconciliation. NULL on success.';
comment on column demo_sessions.discovery_linked_at is
  'When the self-serve link was attempted (any outcome).';

-- ── Indexes ────────────────────────────────────────────────────────────────────────────────────────
-- The outreach modal asks "does this prospect already have a live demo?" by discovery_truck_id; partial,
-- because the anonymous majority is NULL and never queried this way.
create index if not exists demo_sessions_discovery_truck on demo_sessions(discovery_truck_id)
  where discovery_truck_id is not null;
-- /demo/<public_ref> is served by the UNIQUE constraint's own index; no second index.
-- /api/setup finds the operator's claimed outreach demo by claimed_by_operator_id, which
-- 20260723_demo_sessions_phase4.sql already indexes (demo_sessions_claimed).

notify pgrst, 'reload schema';

-- ── VERIFY (run after) ─────────────────────────────────────────────────────────────────────────────
-- Expect six new columns on demo_sessions, the unique constraint, and the partial index.
--   select c.column_name, c.data_type, c.is_nullable
--     from information_schema.columns c
--    where c.table_schema = 'public' and c.table_name = 'demo_sessions'
--      and c.column_name in ('discovery_truck_id','public_ref','discovery_link_status',
--                            'discovery_link_truck_id','discovery_link_note','discovery_linked_at')
--    order by c.column_name;
--
--   select tc.constraint_name, tc.constraint_type
--     from information_schema.table_constraints tc
--    where tc.table_schema = 'public' and tc.table_name = 'demo_sessions'
--      and tc.constraint_name in ('demo_sessions_public_ref_key','demo_sessions_discovery_truck_id_fkey');
--
--   select i.indexname from pg_indexes i
--    where i.schemaname = 'public' and i.tablename = 'demo_sessions'
--      and i.indexname = 'demo_sessions_discovery_truck';
