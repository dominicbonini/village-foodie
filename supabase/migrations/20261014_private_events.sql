-- 20261014_private_events.sql
-- Private events: a built-in "Private" event type, the per-event private flag, the private link token,
-- and the link/QR ordering switch.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. §1 is idempotent and additive only. The last line reloads PostgREST.
--
-- ⛔ IT CHANGES NO EXISTING ROW. Every column added is either NULL-able or has a default that matches
--    today's behaviour, so running it leaves every event and every type exactly as it is:
--      • truck_events.is_private  default FALSE — no event becomes private
--      • event_types.kind         default 'custom' — Market stays a custom type
--      • event_types.private_link_ordering default TRUE — only read for the 'private' row, which does
--        not exist yet, so the default is inert until that row is created
--    §0 is a read-only preview that proves this before anything is altered.
--
-- ⚠️ PIZZERIA GUSTO'S SIX "Private Hire" ROWS ARE NOT TOUCHED, AND THERE IS NO BACKFILL ANYWHERE IN
--    THIS FILE. They are status 'cancelled' (rejected) and must stay exactly as they are — §0 counts
--    them so the preview shows they are seen and left alone. The scraper's new detection applies to
--    rows it creates from now on, not to history.
--
-- ── 🔴 WHY `truck_events.is_private` IS THE SOURCE OF TRUTH AND THE TYPE IS NOT ────────────────────
-- A private event's type IS Private (decision 2), so `event_type_id -> event_types.kind = 'private'`
-- would seem to be enough. It is not, and must never be the thing a public surface reads:
--   • `event_type_id` is `on delete set null`. Deleting a type must not delete events — so if the
--     Private type were ever removed, every private event would silently become a PUBLIC one with its
--     venue, town and coordinates on the map. A visibility rule cannot live on a nullable FK.
--   • Reading it costs a JOIN on every public feed. A boolean on the row is one column in a select
--     that already runs, which is what lets these surfaces fail CLOSED cheaply.
-- So `is_private` is the flag every public surface filters on, and the type is what the OPERATOR sees
-- and configures. One server helper writes both together (lib/private-events/write.ts), and
-- scripts/private-events.cjs asserts nothing else writes either.

set lock_timeout = '3s';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 0 · 🔴 READ-ONLY PREVIEW — RUN THIS ALONE, FIRST. It writes nothing.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Expect:
--   • 'event_types rows'            — 1 (test-kitchen's "Market"), none of them kind='private' yet
--   • 'types already named private' — 0. If this is NOT 0, read the note in §1.2: the lazy creator
--      ADOPTS such a row rather than creating a second one, and that is deliberate.
--   • 'Gusto Private Hire rows'     — 6, all 'cancelled'. NOT CHANGED by this migration.
--   • every 'column already exists' — f, or t if you are re-running.
select 'event_types rows' as what, count(*)::text as n from public.event_types
union all
select 'types already named ''private'' (case-insensitively)', count(*)::text
  from public.event_types where lower(btrim(name)) = 'private'
union all
select 'truck_events rows total', count(*)::text from public.truck_events
union all
-- ⚠️ COUNTED, NOT CHANGED. This is the existing scraper history Dominic flagged: it stays as it is.
select 'rows whose venue/notes mention "private" (left exactly as they are)', count(*)::text
  from public.truck_events
 where coalesce(venue_name, '') ~* '\yprivate\y' or coalesce(notes, '') ~* '\yprivate\y'
union all
select 'column truck_events.is_private already exists', (exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'truck_events' and column_name = 'is_private'))::text
union all
select 'table private_event_links already exists', (exists (
  select 1 from information_schema.tables
   where table_schema = 'public' and table_name = 'private_event_links'))::text
union all
select 'column event_types.kind already exists', (exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'event_types' and column_name = 'kind'))::text;

-- And the rows that will NOT be touched, listed so you can see them before and after.
select truck_id, event_date, venue_name, status, source
  from public.truck_events
 where coalesce(venue_name, '') ~* '\yprivate\y'
 order by truck_id, event_date;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · THE CHANGE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- ── 1.1 · event_types.kind ────────────────────────────────────────────────────────────────────────
-- 'custom' = a type the truck made and can rename, reorder and delete.
-- 'private' = THE built-in Private type. One per truck, created lazily, never renamed or deleted.
-- 🔴 NOT NULL DEFAULT 'custom', so every existing type keeps its present meaning with no backfill.
alter table public.event_types
  add column if not exists kind text not null default 'custom';

alter table public.event_types
  drop constraint if exists event_types_kind_check;
alter table public.event_types
  add constraint event_types_kind_check check (kind in ('custom', 'private'));

-- 🔴 AT MOST ONE 'private' ROW PER TRUCK — a partial unique index, because the uniqueness is only
-- claimed for that one value and a plain `unique (truck_id, kind)` would forbid a truck having two
-- CUSTOM types, which is the normal case.
--
-- ⛔ NOTHING MAY EVER UPSERT ONTO THIS INDEX. PostgREST's `on_conflict=` becomes `ON CONFLICT (cols)`
--    and Postgres' conflict inference CANNOT target a partial index — that is exactly the 42P10 that
--    20261013 was written to fix, and this is the same shape that caused it. The Private row is
--    created with SELECT-then-INSERT and a 23505 retry (lib/private-events/type.ts); there is no
--    `onConflict` anywhere near this table, and scripts/event-pricing.cjs §7b enforces that for the
--    whole repository.
-- ⚠️ A PARTIAL INDEX IS STILL THE RIGHT TOOL HERE. The lesson of 20261013 is not "never use a partial
--    unique index" — it is "never make one the target of an upsert". Used as a plain constraint that
--    raises 23505, which is what the insert path handles, it is exactly correct.
create unique index if not exists event_types_one_private_per_truck_uidx
  on public.event_types (truck_id)
  where kind = 'private';

-- ── 1.2 · event_types.private_link_ordering ──────────────────────────────────────────────────────
-- "Take orders by private link and QR code" — the extra service row the Private type has and no other
-- type does. Default TRUE: a truck that turns an event private gets a working link without a second
-- decision, which is decision 1's "switch, default ON".
-- ⚠️ ONLY MEANINGFUL ON THE kind='private' ROW. It is NOT NULL on every row because a three-state
--    column would imply a custom type could inherit it from somewhere, and there is nowhere: no other
--    type offers link ordering at all. The grid draws this row for Private only and leaves the other
--    types' cells blank, with Standard's one spanning cell reading "Open to everyone".
alter table public.event_types
  add column if not exists private_link_ordering boolean not null default true;

-- ── 1.3 · truck_events.is_private ────────────────────────────────────────────────────────────────
-- 🔴 THE SINGLE SOURCE OF TRUTH FOR VISIBILITY ON PUBLIC SURFACES. See the header for why this is a
-- column on the event and not a join through event_type_id.
alter table public.truck_events
  add column if not exists is_private boolean not null default false;

-- 🔴 THE INDEX IS THE ONE THE PUBLIC FEEDS ACTUALLY USE. Every public surface reads
-- "this truck's upcoming events, excluding private ones", so the index is on the shape of that
-- question rather than on `is_private` alone (which would be two values over the whole table and
-- worth nothing to the planner).
create index if not exists truck_events_truck_private_date_idx
  on public.truck_events (truck_id, is_private, event_date);

-- ── 1.4 · truck_events.private_name ──────────────────────────────────────────────────────────────
-- "Sarah & Tom's wedding". Shown to guests at the top of the private order page and to the operator
-- in the Events list and on the dashboard card. ⛔ NEVER on any public surface.
-- ⚠️ THE TRIM AND THE LENGTH ARE BOTH ENFORCED HERE, not only in the handler. The handler trims
--    (lib/private-events/write.ts) — the CHECK is what makes that true of the TABLE, so a future
--    writer cannot store '   ' and give every guest a blank heading.
alter table public.truck_events
  add column if not exists private_name text;

alter table public.truck_events
  drop constraint if exists truck_events_private_name_shape;
alter table public.truck_events
  add constraint truck_events_private_name_shape check (
    private_name is null
    or (private_name = btrim(private_name) and length(private_name) between 1 and 80)
  );

-- ── 1.5 · truck_events.private_token ─────────────────────────────────────────────────────────────
-- The private link's secret. URL-safe, at least 128 bits of entropy, generated when an event becomes
-- private with link ordering on; REPLACED by "Make a new link"; CLEARED on untick.
--
-- 🔴 A PLAIN UNIQUE CONSTRAINT, AND THE NULLs ARE THE POINT. Postgres treats NULLs as DISTINCT, so
-- every non-private event can carry NULL while each real token is unique across the whole table —
-- which is precisely the shape this column needs, and precisely the case where the 20261013 reasoning
-- DOES apply. (There it was wrong because a CHECK made every row's owner non-null; here the nulls are
-- the overwhelming majority and must stay permitted.)
-- ⚠️ UNIQUE ACROSS THE TABLE, NOT PER TRUCK. The token is resolved by itself at /p/<token> with no
--    truck in hand, so two trucks must never be able to hold the same one.
alter table public.truck_events
  add column if not exists private_token text;

alter table public.truck_events
  drop constraint if exists truck_events_private_token_key;
alter table public.truck_events
  add constraint truck_events_private_token_key unique (private_token);

-- ⛔ A TOKEN'S SHAPE IS CONSTRAINED SO A SHORT ONE CANNOT BE WRITTEN BY HAND. 22 characters of
-- base64url is 132 bits; the generator emits 32 (192 bits). The floor is what stops a future writer
-- "simplifying" it to something guessable, which is the failure this whole route has to avoid.
alter table public.truck_events
  drop constraint if exists truck_events_private_token_shape;
alter table public.truck_events
  add constraint truck_events_private_token_shape check (
    private_token is null
    or (private_token ~ '^[A-Za-z0-9_-]+$' and length(private_token) between 22 and 64)
  );

-- ⛔ A TOKEN ONLY EXISTS ON A PRIVATE EVENT. Without this, unticking "Private event" could leave a
-- live token behind on a now-public event — a working private link to a public pitch, which is a
-- confusing surface rather than a dangerous one, but still a state no code should have to reason
-- about. The writer clears the token on untick; this makes that true of the table.
alter table public.truck_events
  drop constraint if exists truck_events_private_token_needs_private;
alter table public.truck_events
  add constraint truck_events_private_token_needs_private check (
    private_token is null or is_private
  );

-- ── 1.6 · truck_events.private_link_ordering_override ────────────────────────────────────────────
-- The per-event hand change: `event override ?? the Private type's value`. Three-state, like every
-- other per-event override in §70.3 — NULL is "follow the type", and `false` is the real, different
-- instruction "no link for THIS event".
alter table public.truck_events
  add column if not exists private_link_ordering_override boolean;

-- ── 1.65 · public.private_event_links — RETIRED TOKENS ONLY ──────────────────────────────────────
--
-- 🔴 THIS TABLE IS NOT IN THE BRIEF AND THE BRIEF CANNOT BE BUILT WITHOUT IT. Decision 7 requires the
-- old link to say **"This link no longer works — [Truck] has replaced it."** Naming the truck means
-- resolving the OLD token after it has been replaced — and if "Make a new link" simply overwrites
-- `truck_events.private_token`, the old value is gone and `/p/<old>` can only 404. A guest holding a
-- printed card would get "not found", which is indistinguishable from mistyping and tells them
-- nothing about what to do next.
--
-- So every token that is replaced or cleared is recorded here, and nothing else is. It is
-- append-only, read only by the private-link route, and it holds no personal data: a random string,
-- the event it belonged to, and when it stopped working.
--
-- ⚠️ THE CURRENT TOKEN STAYS ON `truck_events`, AND THIS TABLE NEVER HOLDS IT. One source of truth
--    for "the live link" (the event row) and one for "links that used to work" (here). A row is
--    written here at the moment the event's column is overwritten, by the same helper, so the two
--    cannot disagree about which is which.
create table if not exists public.private_event_links (
  -- The token IS the key. A lookup at /p/<token> is a primary-key hit, which matters because that
  -- route is public and rate-limited: the cheapest possible answer for a dead link.
  token text primary key,

  -- 🔴 TEXT, NOT uuid — `trucks.id` is a slug. Same rule as event_types, truck_places and
  -- whatsapp_alerts; declaring it uuid fails outright or silently never matches.
  truck_id text not null references public.trucks(id) on delete cascade,

  -- ⚠️ `on delete cascade`: if the event goes, so does the memory of its links. There is nothing left
  --    to tell a guest about.
  event_id uuid not null references public.truck_events(id) on delete cascade,

  retired_at timestamptz not null default now(),

  -- Why it stopped working, so the route can say the right thing. 'replaced' = "Make a new link";
  -- 'made_public' = the operator unticked "Private event".
  reason text not null default 'replaced',

  constraint private_event_links_reason_check check (reason in ('replaced', 'made_public')),
  constraint private_event_links_token_shape check (
    token ~ '^[A-Za-z0-9_-]+$' and length(token) between 22 and 64
  )
);

create index if not exists private_event_links_event_idx
  on public.private_event_links (event_id, retired_at desc);

-- ⛔ SERVICE ROLE ONLY, LIKE event_item_prices. Every read of this table happens in a route handler
-- with the service key; a browser must never be able to enumerate retired tokens, because a token is
-- a secret even after it stops working (it names an event and a truck).
alter table public.private_event_links enable row level security;
revoke all on public.private_event_links from anon, authenticated;

comment on table public.private_event_links is
  'RETIRED private-link tokens only — never the live one, which is truck_events.private_token. Exists so that /p/<old-token> can say "This link no longer works - <Truck> has replaced it" instead of 404ing a printed QR code (decision 7). Append-only, written only by lib/private-events/write.ts at the moment it overwrites or clears the event''s token. Service-role only: a token names an event and a truck, so it stays a secret after it stops working. Added 20261014.';

-- ── 1.7 · COMMENTS ───────────────────────────────────────────────────────────────────────────────
comment on column public.event_types.kind is
  '''custom'' = a type the truck made (renameable, reorderable, deletable). ''private'' = THE built-in Private type: one per truck (event_types_one_private_per_truck_uidx, a PARTIAL index — ⛔ never an ON CONFLICT target, see 20261013), created lazily as a copy of Van 1''s resolved service values, never renamed, reordered or deleted, always the LAST column on the grid. Added 20261014.';
comment on column public.event_types.private_link_ordering is
  'Private type only: "Take orders by private link and QR code" (default on). Resolved per event as truck_events.private_link_ordering_override ?? this. When false there is no token and no online ordering — the event still appears on the public schedule as "Private event". Other types do not offer link ordering at all, which is why this is NOT NULL rather than three-state. Added 20261014.';
comment on column public.truck_events.is_private is
  'THE SINGLE SOURCE OF TRUTH for whether this event is hidden from public surfaces. Public feeds must filter or redact on THIS column and must fail CLOSED when it cannot be read. ⛔ Deliberately NOT derived from event_type_id -> event_types.kind: that FK is ON DELETE SET NULL, so deleting the Private type would turn every private event public with its venue and coordinates. Written only by lib/private-events/write.ts, together with event_type_id, private_name and private_token. Added 20261014.';
comment on column public.truck_events.private_name is
  'Optional name for a private event ("Sarah & Tom''s wedding"), shown to guests at the top of the private order page and to the operator in the Events list and dashboard card. ⛔ NEVER on any public surface — the public schedule shows "Private event" with the date and times only. Trimmed, 1-80 chars, enforced by truck_events_private_name_shape. Added 20261014.';
comment on column public.truck_events.private_token is
  'The private link''s secret: base64url, >=132 bits, resolved at /p/<token>. Replaced by "Make a new link" (the old link then shows the "no longer works" message); cleared when the event is made public. UNIQUE across the whole table because the token is resolved with no truck in hand. ⛔ An order for a private event is accepted ONLY against this token — the event id alone is refused (app/api/orders/submit/route.ts). Added 20261014.';
comment on column public.truck_events.private_link_ordering_override is
  'Per-event hand change for link ordering: NULL = follow the Private type, false = no link for THIS event. Three-state for the §70.3 reason — false is a real instruction, not an absence. Added 20261014.';

-- 🔴 THE TABLE COMMENT SAID PRIVATE VISIBILITY WAS "A LATER STAGE". It is this one.
comment on table public.event_types is
  'A named preset a truck picks when adding an event. Carries SERVICE settings (buzzer prompt, take cash, the mark-ready step, the customer collection grid), PRICES (20261011: price_change_on/price_mode/price_amount/price_rounding plus event_item_prices), and — on the one kind=''private'' row — private link ordering (20261014). Items, stock and deals are still later stages. A custom type''s service columns are nullable and NULL means "same as Standard", resolved at READ time by lib/event-types/resolve.ts as `event override ?? type ?? van/truck default`. Nothing is ever copied onto an event: truck_events.event_type_id is the whole state, except that a private event ALSO carries truck_events.is_private, which is the visibility source of truth.';

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · READ-ONLY VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Expect the six new columns, with is_private NOT NULL default false and kind NOT NULL default
-- 'custom'. ⛔ If is_private is nullable, the public feeds' fail-closed reasoning does not hold.
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and (
     (table_name = 'truck_events' and column_name in
       ('is_private', 'private_name', 'private_token', 'private_link_ordering_override'))
     or (table_name = 'event_types' and column_name in ('kind', 'private_link_ordering'))
   )
 order by table_name, column_name;

-- The constraints. Expect: event_types_kind_check, truck_events_private_name_shape,
-- truck_events_private_token_key (UNIQUE), truck_events_private_token_shape,
-- truck_events_private_token_needs_private.
select conrelid::regclass as "table", conname, contype, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid in ('public.event_types'::regclass, 'public.truck_events'::regclass)
   and conname like any (array['%private%', '%kind%'])
 order by 1, 2;

-- The indexes. Expect event_types_one_private_per_truck_uidx WITH a `WHERE kind = 'private'` clause
-- (it is deliberately partial) and truck_events_truck_private_date_idx with no WHERE.
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('event_types_one_private_per_truck_uidx', 'truck_events_truck_private_date_idx')
 order by indexname;

-- ⛔ AND THE PROOF THAT NOTHING MOVED. Expect 0 private events and 0 tokens, and Gusto's six rows
-- still 'cancelled' with their venue names intact.
select 'private events (expect 0 — nothing is backfilled)' as what, count(*)::text as n
  from public.truck_events where is_private
union all
select 'tokens issued (expect 0)', count(*)::text
  from public.truck_events where private_token is not null
union all
select 'private-type rows (expect 0 — created lazily by the app)', count(*)::text
  from public.event_types where kind = 'private'
union all
select 'retired link rows (expect 0 — nothing has been replaced yet)', count(*)::text
  from public.private_event_links
union all
select 'rows mentioning "private" that are still ''cancelled''', count(*)::text
  from public.truck_events
 where coalesce(venue_name, '') ~* '\yprivate\y' and status = 'cancelled';

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA and every select naming a new column 404s with
-- PGRST204 — which the app treats as "cannot read", so every public feed would fail CLOSED and show
-- no events at all until the cache turned over.
notify pgrst, 'reload schema';
