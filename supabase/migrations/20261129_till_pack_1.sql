-- 20261129_till_pack_1.sql
-- till-pack-1 (24 November 2026), REWORKED BY till-pack-1b (25 November 2026, docs/till-pack-1b-report.md) BEFORE IT WAS EVER APPLIED.
-- The plan: docs/till-pack-0-report.md §4 C, §5 D, §7 G, §8; the law check's pack-1 changes: docs/till-law-1-report.md §3, changes 1–6.
-- THE TAMPER-EVIDENT CHAIN, IN OBSERVE MODE. Country-neutral, backend only: no route, screen, email or ticket changes, and nothing needs a
-- deploy — database triggers cover the deployed code (origin/main) as it is.
--
-- ✅ CLASSIFICATION: ADDITIVE AND BACKWARD-COMPATIBLE WITH THE DEPLOYED CODE (the live site uses this database):
--    • six NEW tables — till_settings (one row, guard_mode 'observe'), till_chain (append-only), till_chain_heads, till_order_seals (each
--      sealed order's seal state), till_failures, till_guard_events — RLS on, no policy, nothing for anon / authenticated; the service
--      role may read them and write none of the chain, heads or seals.
--    • 🔴 NOTHING IS ADDED TO, AND NOTHING IS EVER WRITTEN TO, orders OR order_payments (Dominic, 25 November: no seal columns on orders).
--      Every till trigger on them is an AFTER trigger that only READS the row and writes till tables: no UPDATE of an order or payment,
--      so no realtime event, no updated_at change, no row lock. The migration itself writes no existing row of any table.
--    • NEW triggers. 🔴 EVERY TRIGGER ON AN ORDER TABLE (and on trucks) NEVER FAILS THE WRITE (the receipt-number pattern, france-records-1):
--      all its work is one guarded block under a 2 s lock_timeout; on ANY error the failure goes to till_failures (itself guarded) and a
--      WARNING is raised, and the write goes through exactly as the code sent it. They:
--        - SEAL an order at ACCEPTANCE (the law check's change 1: inserted accepted, or leaving pending), at its FIRST PAYMENT, or at a
--          FINAL state — collected, cancelled, rejected — whichever comes first (Q1 + change 1); a pending order with none of these stays
--          unsealed. (The day close, the fourth moment, is till-pack-4's.)
--        - chain every new payment (order_payments AFTER INSERT);
--        - GUARD orders and order_payments UPDATE / DELETE in OBSERVE mode: a change to a sealed field is chained as a new version, with a
--          plus/minus DELTA against the previous one (change 5) — automatically, never refused; what ENFORCE mode would refuse (after the
--          trading day's close, a delete of a sealed order or of a till truck's payment) is logged to till_guard_events — and allowed;
--        - write an IDENTITY entry (change 4: legal name, registered address, registration number, VAT number, VAT regime) when those
--          change on trucks, and once before a truck's first sealed entry; every order version names the identity entry in force.
--    • the chain's kinds: order, payment, deletion, identity, event (change 6: mode, version, close, archive, verify, export, till_start,
--      till_end — only till_start is written in this pack), close, archive.
--    • every sealed order version carries a non-null till_id (change 3) and, on every line, its VAT rate and its line total excluding VAT
--      (change 2), reconciling to the order's sealed totals to the minor unit.
--    • action_audit_log becomes APPEND-ONLY (UPDATE / DELETE / TRUNCATE refused by trigger; those privileges revoked from anon,
--      authenticated and service_role). Checked first (till-pack-1 report §5): no code, database function or cron updates or deletes it,
--      and no foreign key cascades into it.
--    • 🔴 DEMO TRUCKS ARE OUTSIDE THE TILL (Q7): plan 'demo' and ids 'demo-…' are skipped by every trigger, so their deletes, cascades
--      (deleteTruckCascade, the demo-cleanup cron) and restarts work exactly as today. scripts/db-rollback-proofs.cjs switches the till
--      on for them INSIDE its rolled-back transaction only (SET LOCAL till.include_demo = 'on').
--    • till_baseline() is CREATED, NOT RUN (Q8: it runs after the next deploy, in a later prompt). It too writes only till tables.
--    • place_order_atomic_v2 is NOT touched (md5 e4b273abcf8e7609c6ca54033ed59332). No drop, no rename, no existing row updated or deleted.
--
-- THE SEALED FORMS (a strict WHITELIST — no customer name, email, phone, order note, line note, slot note, table reference, free-text
-- reason or staff id, ever): till_sealed_order() and till_sealed_payment() below. The payload stored in the chain is the canonical text of
-- a jsonb envelope (jsonb::text: keys sorted shortest first then bytewise, fixed separators — independent of the order keys were written
-- in); timestamps are written as UTC text by till_ts(), so the session's TimeZone cannot change a byte.
-- THE CHAIN, per truck: seq 1, 2, 3 … with no gap; payload_hash = sha256(payload); hash = sha256(prev_hash|seq|kind|ref|payload_hash);
-- the first prev_hash is 64 zeros; seq 1 is the 'till_start' event. scripts/till-verify.cjs checks an export offline; till_verify(truck)
-- checks it in the database.
--
-- VERIFY AFTER APPLYING: the read-only block at the end of this file, then scripts/db-rollback-proofs.cjs --till-1-check.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The tables
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.till_settings (
  id               boolean primary key default true check (id),
  guard_mode       text not null default 'observe' check (guard_mode in ('observe', 'enforce')),
  software_version text not null default '0.1.0' check (software_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  updated_at       timestamptz not null default now()
);
comment on table public.till_settings is 'till-pack-1: the till''s one settings row. guard_mode ''observe'' = log would-be refusals and never block (till-pack-3 switches it to ''enforce''); software_version = the fiscal version stamped on every chain entry (0.x until till-pack-6 sets 1.0.0).';
insert into public.till_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.till_chain (
  truck_id         text not null,
  seq              bigint not null check (seq >= 1),
  kind             text not null check (kind in ('order', 'payment', 'deletion', 'identity', 'event', 'close', 'archive')),
  ref              text not null,
  version          integer check (version is null or version >= 1),
  payload          text not null,
  payload_hash     text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  prev_hash        text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash             text not null check (hash ~ '^[0-9a-f]{64}$'),
  software_version text not null,
  created_at       timestamptz not null default now(),
  primary key (truck_id, seq),
  constraint till_chain_event_types check (kind <> 'event' or ref in ('mode', 'version', 'close', 'archive', 'verify', 'export', 'till_start', 'till_end'))
);
create index if not exists till_chain_ref_idx on public.till_chain (truck_id, kind, ref, seq desc);
comment on table public.till_chain is 'till-pack-1: APPEND-ONLY. Per truck, a gap-free sequence of sealed entries: the till_start event, identity entries, order versions (each with its delta and its identity reference), payments, observed deletions; closes, archives and the other events from later packs. payload = canonical text with NO customer data; payload_hash = sha256(payload); hash = sha256(prev_hash|seq|kind|ref|payload_hash). Written only by public.till_write(). UPDATE, DELETE and TRUNCATE are refused by trigger. No foreign key: the record outlives any truck row.';

create table if not exists public.till_chain_heads (
  truck_id        text primary key,
  last_seq        bigint not null check (last_seq >= 0),
  last_hash       text not null check (last_hash ~ '^[0-9a-f]{64}$'),
  identity_seq    bigint,
  identity_hash   text,
  identity_digest text,
  updated_at      timestamptz not null default now()
);
comment on table public.till_chain_heads is 'till-pack-1: the last seq and hash of each truck''s chain — the per-truck lock that keeps seq gap-free (the receipt_counters pattern) — and the identity entry in force (its seq, hash and the sha256 of its data). till_verify() checks it against the chain.';

create table if not exists public.till_order_seals (
  order_key         uuid primary key,
  truck_id          text not null,
  sealed_at         timestamptz not null default now(),
  version           integer not null check (version >= 1),
  last_seq          bigint not null,
  last_payload_hash text not null check (last_payload_hash ~ '^[0-9a-f]{64}$'),
  last_reason       text not null,
  deleted_at        timestamptz,
  updated_at        timestamptz not null default now()
);
create index if not exists till_order_seals_truck_idx on public.till_order_seals (truck_id);
comment on table public.till_order_seals is 'till-pack-1b: each sealed order''s seal state, kept OFF the orders table (Dominic, 25 November): when it was first sealed, its current sealed version, the chain entry of that version and its payload hash; deleted_at when the order row was deleted (observe mode). Written only by the till functions. No foreign key.';

create table if not exists public.till_failures (
  id         bigserial primary key,
  truck_id   text,
  op         text,
  ref        text,
  sqlstate   text,
  message    text,
  created_at timestamptz not null default now()
);
comment on table public.till_failures is 'till-pack-1: a till trigger that could not chain or seal (it never fails the write). Read by people; a later sweeper seals the backlog.';

create table if not exists public.till_guard_events (
  id         bigserial primary key,
  truck_id   text,
  table_name text not null,
  op         text not null,
  ref        text,
  event      text not null,
  mode       text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);
comment on table public.till_guard_events is 'till-pack-1: what ENFORCE mode would have refused (OBSERVE mode let it through). detail holds field NAMES only, never values. Read before switching to enforce (till-pack-3).';

alter table public.till_settings     enable row level security;
alter table public.till_chain        enable row level security;
alter table public.till_chain_heads  enable row level security;
alter table public.till_order_seals  enable row level security;
alter table public.till_failures     enable row level security;
alter table public.till_guard_events enable row level security;
revoke all on public.till_settings, public.till_chain, public.till_chain_heads, public.till_order_seals, public.till_failures, public.till_guard_events from anon, authenticated;
revoke all on sequence public.till_failures_id_seq, public.till_guard_events_id_seq from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.till_chain from service_role;
revoke insert, update, delete, truncate, references, trigger on public.till_chain_heads from service_role;
revoke insert, update, delete, truncate, references, trigger on public.till_order_seals from service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Small pure helpers
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- A timestamp as UTC text (microseconds, 'Z'), so the session's TimeZone never changes a byte.
create or replace function public.till_ts(p timestamptz)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') $$;

-- The fiscal state an order's status maps to. Kitchen moves (confirmed / modified / cooking / ready) are all 'accepted'.
create or replace function public.till_fiscal_state(p_status text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_status in ('confirmed', 'modified', 'cooking', 'ready') then 'accepted'
    when p_status in ('pending', 'collected', 'cancelled', 'rejected') then p_status
    else 'other'
  end
$$;

-- One object reduced to the whitelisted keys. Any other key is named (never its value) under "_other_keys", so a new field is visible
-- without its content; the note keys are dropped without a trace, so the line-notes move (france-notes-1) changes no sealed byte.
create or replace function public.till_pick(p_obj jsonb, p_keys text[])
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_obj is null or jsonb_typeof(p_obj) <> 'object' then p_obj else
    coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(p_obj) e where e.key = any (p_keys)), '{}'::jsonb)
    || coalesce((select jsonb_build_object('_other_keys', jsonb_agg(e.key order by e.key collate "C")) from jsonb_each(p_obj) e
                  where not (e.key = any (p_keys)) and e.key <> all (array['specialInstructions', 'slotNotes', 'note', 'notes'])
                  having count(*) > 0), '{}'::jsonb)
  end
$$;

-- An array of objects, each reduced to the whitelisted keys (order kept).
create or replace function public.till_pick_all(p_arr jsonb, p_keys text[])
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_arr is null or jsonb_typeof(p_arr) <> 'array' then p_arr else
    coalesce((select jsonb_agg(public.till_pick(x.e, p_keys) order by x.n) from jsonb_array_elements(p_arr) with ordinality x(e, n)), '[]'::jsonb)
  end
$$;

-- A JSON value as a number: a number, or a numeric-looking string; anything else is 0 (lib/order-tax.ts num()).
create or replace function public.till_num(p jsonb)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric
    when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then btrim(p #>> '{}')::numeric
    else 0
  end
$$;

-- A JSON value as a VAT rate (thousandths of a percent): a whole number ≥ 0, else NULL = no rate (lib/order-tax.ts rateOrNull()).
create or replace function public.till_rate(p jsonb)
returns bigint
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when jsonb_typeof(p) = 'number' and (p #>> '{}')::numeric >= 0 and (p #>> '{}')::numeric = trunc((p #>> '{}')::numeric)
                   and (p #>> '{}')::numeric < 9007199254740992 then (p #>> '{}')::numeric::bigint end
$$;

-- A currency's minor digits — lib/currencies.ts's registry (decimals 0 and 3; every other currency 2). scripts/till-pack-1.cjs checks
-- these two lists against the registry.
create or replace function public.till_minor_digits(p_currency text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when upper(coalesce(p_currency, '')) in ('BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'VUV', 'XAF', 'XOF', 'XPF') then 0
    when upper(coalesce(p_currency, '')) in ('BHD', 'JOD', 'KWD', 'OMR', 'TND') then 3
    else 2
  end
$$;

-- `p_total` split by `p_weights`, LARGEST REMAINDER — lib/order-tax.ts allocate(), exactly: each share floor(total × w ÷ W), then the
-- leftover units one each to the largest remainders (ties to the earlier index). Always adds up to the total. All weights 0 → all to the
-- first. Exact integer arithmetic (numeric div / mod).
create or replace function public.till_allocate(p_total numeric, p_weights numeric[])
returns numeric[]
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  n    integer := coalesce(cardinality(p_weights), 0);
  w    numeric[] := '{}';
  s    numeric := 0;
  t    numeric;
  sg   integer;
  base numeric[] := '{}';
  lft  numeric;
  r    record;
  i    integer;
begin
  if n = 0 then return '{}'; end if;
  for i in 1..n loop
    w := array_append(w, case when p_weights[i] > 0 then round(p_weights[i]) else 0 end);
    s := s + w[i];
  end loop;
  if s = 0 then
    for i in 1..n loop base := array_append(base, case when i = 1 then p_total else 0 end); end loop;
    return base;
  end if;
  sg := case when p_total < 0 then -1 else 1 end;
  t := abs(p_total);
  for i in 1..n loop base := array_append(base, div(t * w[i], s)); end loop;
  lft := t - (select sum(x) from unnest(base) x);
  for r in select g.i as idx from generate_series(1, n) g(i) order by mod(t * w[g.i], s) desc, g.i loop
    exit when lft <= 0;
    base[r.idx] := base[r.idx] + 1;
    lft := lft - 1;
  end loop;
  for i in 1..n loop base[i] := sg * base[i]; end loop;
  return base;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The VAT of every line (the law check's change 2): each item, and each part of each deal, with its VAT rate and its line total
--    excluding VAT, reconciling to the order's totals to the minor unit.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- THE LINES: each item (its price × quantity, at its stamped rate — `tax_rate_milli` on the line, france-vat-1 — or, on an older line with
-- no stamp, the order's own rate); each deal's parts as the VAT engine allocated them (`tax_parts`: one part per rate, its share of the deal
-- price), or, for an older deal with no split, the whole deal at the order's rate.
-- THE TARGETS, per rate:
--   'breakdown'  — the order's own tax_breakdown (lib/order-charges.ts): each rate's food after the discount and its tax; the lines' total
--                  excluding VAT at that rate = food − tax where prices include VAT, = food where VAT is added. Used when the breakdown's
--                  rates are the lines' rates and its food adds up to the order's food;
--   'order_rate' — no breakdown (every order before france-vat-1): the food after the discount (food_minor) at the order's one rate —
--                  tax included: food × r ÷ (100 % + r), rounded once; tax added: the order's own tax_minor;
--   'legacy'     — the same, for an order from before the charge columns: its food is (subtotal − discount) in minor units;
--   'recomputed' — a breakdown that does not match the lines: the engine's own rules again, from the lines and the food.
-- Then each rate's total excluding VAT is split across that rate's lines by their prices, largest remainder (the engine's allocate()).
-- So, always: Σ lines at a rate = that rate's excl_vat_minor; Σ rates' food = the order's food; inclusive: excl + vat = food; added:
-- excl = food and Σ vat = tax_minor; and total_minor = food + tax + tip + service fee + surcharge (till_vat_reconciles checks all of it).
create or replace function public.till_vat(o public.orders)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_scale numeric := power(10::numeric, public.till_minor_digits(o.currency));
  v_r0    bigint  := o.tax_rate_milli;
  v_incl  boolean := coalesce(o.tax_inclusive, false);
  v_food  numeric;
  v_basis text;
  l_kind  text[]    := '{}';
  l_idx   integer[] := '{}';
  l_rate  bigint[]  := '{}';
  l_price numeric[] := '{}';
  l_excl  numeric[] := '{}';
  n       integer := 0;
  x       record;
  y       record;
  v_extra numeric;
  g_key   text[]    := '{}';
  g_rate  bigint[]  := '{}';
  g_pre   numeric[] := '{}';
  g_food  numeric[] := '{}';
  g_vat   numeric[] := '{}';
  g_excl  numeric[] := '{}';
  ng      integer := 0;
  b_ok    boolean;
  i       integer;
  j       integer;
  v_w     numeric[];
  v_pos   integer[];
  v_share numeric[];
begin
  -- the lines
  if jsonb_typeof(o.items) = 'array' then
    for x in select t.e, t.n from jsonb_array_elements(o.items) with ordinality t(e, n) order by t.n loop
      n := n + 1;
      l_kind := array_append(l_kind, 'item'::text);
      l_idx := array_append(l_idx, (x.n - 1)::integer);
      if jsonb_typeof(x.e) = 'object' then
        l_price := array_append(l_price, greatest(round(public.till_num(x.e -> 'unit_price') * public.till_num(x.e -> 'quantity') * v_scale), 0));
        l_rate := array_append(l_rate, case when x.e ? 'tax_rate_milli' then public.till_rate(x.e -> 'tax_rate_milli') else v_r0 end);
      else
        l_price := array_append(l_price, 0::numeric);
        l_rate := array_append(l_rate, v_r0);
      end if;
    end loop;
  end if;
  if jsonb_typeof(o.deals) = 'array' then
    for x in select t.e, t.n from jsonb_array_elements(o.deals) with ordinality t(e, n) order by t.n loop
      if jsonb_typeof(x.e) = 'object' and jsonb_typeof(x.e -> 'tax_parts') = 'array' and jsonb_array_length(x.e -> 'tax_parts') > 0 then
        for y in select t.e, t.n from jsonb_array_elements(x.e -> 'tax_parts') with ordinality t(e, n) order by t.n loop
          n := n + 1;
          l_kind := array_append(l_kind, 'deal'::text);
          l_idx := array_append(l_idx, (x.n - 1)::integer);
          l_price := array_append(l_price, greatest(round(public.till_num(y.e -> 'minor')), 0));
          l_rate := array_append(l_rate, public.till_rate(y.e -> 'tax_rate_milli'));
        end loop;
      else
        n := n + 1;
        l_kind := array_append(l_kind, 'deal'::text);
        l_idx := array_append(l_idx, (x.n - 1)::integer);
        if jsonb_typeof(x.e) = 'object' then
          v_extra := coalesce((select sum(public.till_num(m -> 'price'))
                                 from jsonb_each(case when jsonb_typeof(x.e -> 'slotModifiers') = 'object' then x.e -> 'slotModifiers' else '{}'::jsonb end) s,
                                      jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) m), 0);
          l_price := array_append(l_price, greatest(round((public.till_num(x.e -> 'price') + v_extra) * v_scale), 0));
        else
          l_price := array_append(l_price, 0::numeric);
        end if;
        l_rate := array_append(l_rate, v_r0);
      end if;
    end loop;
  end if;

  -- the food after the discount
  v_food := case when o.food_minor is not null then o.food_minor::numeric
                 when o.subtotal is not null then round((o.subtotal - coalesce(o.discount_amt, 0)) * v_scale)
                 when o.total_minor is not null then o.total_minor::numeric
                 when o.total is not null then round(o.total * v_scale)
                 else (select coalesce(sum(z), 0) from unnest(l_price) z) end;

  -- the stored breakdown, when it matches the lines
  b_ok := jsonb_typeof(o.tax_breakdown) = 'array' and jsonb_array_length(o.tax_breakdown) > 0
          and not exists (select 1 from jsonb_array_elements(o.tax_breakdown) r where jsonb_typeof(r) <> 'object');
  if b_ok then
    b_ok := (select count(*) = count(distinct coalesce(public.till_rate(r -> 'rate_milli')::text, 'none')) from jsonb_array_elements(o.tax_breakdown) r)
      and not exists (select 1 from unnest(l_rate, l_price) u(rt, pr)
                       where pr > 0 and coalesce(rt::text, 'none') not in (select coalesce(public.till_rate(r -> 'rate_milli')::text, 'none') from jsonb_array_elements(o.tax_breakdown) r))
      and not exists (select 1 from jsonb_array_elements(o.tax_breakdown) r
                       where round(public.till_num(r -> 'food_minor')) <> 0
                         and coalesce(public.till_rate(r -> 'rate_milli')::text, 'none') not in (select coalesce(rt::text, 'none') from unnest(l_rate) rt))
      and (select coalesce(sum(round(public.till_num(r -> 'food_minor'))), 0) from jsonb_array_elements(o.tax_breakdown) r) = v_food;
    if b_ok then
      v_basis := 'breakdown';
      for x in select r.e, r.n from jsonb_array_elements(o.tax_breakdown) with ordinality r(e, n) order by r.n loop
        ng := ng + 1;
        g_rate := array_append(g_rate, public.till_rate(x.e -> 'rate_milli'));
        g_key := array_append(g_key, coalesce(public.till_rate(x.e -> 'rate_milli')::text, 'none'));
        g_food := array_append(g_food, round(public.till_num(x.e -> 'food_minor')));
        g_vat := array_append(g_vat, round(public.till_num(x.e -> 'tax_minor')));
        g_excl := array_append(g_excl, case when v_incl then g_food[ng] - g_vat[ng] else g_food[ng] end);
      end loop;
    else
      v_basis := 'recomputed';
    end if;
  else
    v_basis := case when jsonb_typeof(o.tax_breakdown) = 'array' and jsonb_array_length(o.tax_breakdown) > 0 then 'recomputed'
                    when o.food_minor is not null then 'order_rate' else 'legacy' end;
  end if;

  -- the engine's rules, when there is no usable breakdown: one group per rate (ascending, no rate first); the food split by their prices
  if v_basis <> 'breakdown' then
    for x in select distinct u.rt from unnest(l_rate) u(rt) order by u.rt nulls first loop
      ng := ng + 1;
      g_rate := array_append(g_rate, x.rt);
      g_key := array_append(g_key, coalesce(x.rt::text, 'none'));
      g_pre := array_append(g_pre, (select coalesce(sum(u.pr), 0) from unnest(l_rate, l_price) u(rt, pr) where coalesce(u.rt::text, 'none') = coalesce(x.rt::text, 'none')));
    end loop;
    if ng = 0 then
      ng := 1;
      g_rate := array_append(g_rate, v_r0);
      g_key := array_append(g_key, coalesce(v_r0::text, 'none'));
      g_pre := array_append(g_pre, 0::numeric);
    end if;
    if ng = 1 then g_food := array[v_food]; else g_food := public.till_allocate(v_food, g_pre); end if;
    for i in 1..ng loop
      g_vat := array_append(g_vat, case
        when g_rate[i] is null or g_rate[i] = 0 then 0::numeric
        when v_incl then case when g_food[i] > 0 then round(g_food[i] * g_rate[i] / (100000 + g_rate[i])) else 0::numeric end
        when ng = 1 and o.tax_minor is not null then o.tax_minor::numeric
        else round(g_food[i] * g_rate[i] / 100000) end);
      g_excl := array_append(g_excl, case when v_incl then g_food[i] - g_vat[i] else g_food[i] end);
    end loop;
  end if;

  -- each rate's total excluding VAT, split across that rate's lines by their prices
  for i in 1..ng loop
    v_w := '{}';
    v_pos := '{}';
    for j in 1..n loop
      if coalesce(l_rate[j]::text, 'none') = g_key[i] then
        v_w := array_append(v_w, l_price[j]);
        v_pos := array_append(v_pos, j);
      end if;
    end loop;
    if cardinality(v_pos) > 0 then
      v_share := public.till_allocate(g_excl[i], v_w);
      for j in 1..cardinality(v_pos) loop l_excl[v_pos[j]] := v_share[j]; end loop;
    end if;
  end loop;
  for j in 1..n loop
    if l_excl[j] is null then l_excl[j] := 0; end if;
  end loop;

  return jsonb_build_object(
    'basis', v_basis,
    'items', coalesce((select jsonb_agg(jsonb_build_object('vat_rate_milli', l_rate[g.k], 'line_price_minor', l_price[g.k]::bigint,
                         'line_total_excl_vat_minor', l_excl[g.k]::bigint) order by g.k) from generate_series(1, n) g(k) where l_kind[g.k] = 'item'), '[]'::jsonb),
    'deals', coalesce((select jsonb_agg(z.parts order by z.d) from (
                select l_idx[g.k] as d, jsonb_agg(jsonb_build_object('vat_rate_milli', l_rate[g.k], 'line_price_minor', l_price[g.k]::bigint,
                         'line_total_excl_vat_minor', l_excl[g.k]::bigint) order by g.k) as parts
                  from generate_series(1, n) g(k) where l_kind[g.k] = 'deal' group by 1) z), '[]'::jsonb),
    'summary', coalesce((select jsonb_agg(jsonb_build_object('vat_rate_milli', g_rate[g.k], 'food_minor', g_food[g.k]::bigint,
                         'excl_vat_minor', g_excl[g.k]::bigint, 'vat_minor', g_vat[g.k]::bigint) order by g.k) from generate_series(1, ng) g(k)), '[]'::jsonb));
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. The sealed forms — a strict whitelist
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- The order lines as sold. items: name, quantity, unit_price, price, item_id, tax_rate_milli, cartKey, source, modifiers / upsells
-- (name, price, quantity). deals: name, price, quantity, bundle_price, original_price, modifierExtra, deal_id, cartKey, source, slots,
-- slotModifiers (each slot's name, price, quantity), tax_parts (tax_rate_milli, minor). specialInstructions / slotNotes never appear.
create or replace function public.till_sealed_lines(p_lines jsonb, p_kind text)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_lines is null or jsonb_typeof(p_lines) <> 'array' then p_lines else
    coalesce((select jsonb_agg(
      case when jsonb_typeof(x.e) <> 'object' then x.e
           when p_kind = 'item' then
             public.till_pick(x.e, array['name', 'quantity', 'unit_price', 'price', 'item_id', 'tax_rate_milli', 'cartKey', 'source', 'modifiers', 'upsells'])
             || case when x.e ? 'modifiers' then jsonb_build_object('modifiers', public.till_pick_all(x.e -> 'modifiers', array['name', 'price', 'quantity'])) else '{}'::jsonb end
             || case when x.e ? 'upsells' then jsonb_build_object('upsells', public.till_pick_all(x.e -> 'upsells', array['name', 'price', 'quantity'])) else '{}'::jsonb end
           else
             public.till_pick(x.e, array['name', 'price', 'quantity', 'bundle_price', 'original_price', 'modifierExtra', 'deal_id', 'cartKey', 'source', 'slots', 'slotModifiers', 'tax_parts'])
             || case when jsonb_typeof(x.e -> 'slotModifiers') = 'object' then jsonb_build_object('slotModifiers',
                  coalesce((select jsonb_object_agg(s.key, public.till_pick_all(s.value, array['name', 'price', 'quantity'])) from jsonb_each(x.e -> 'slotModifiers') s), '{}'::jsonb))
                  else '{}'::jsonb end
             || case when x.e ? 'tax_parts' then jsonb_build_object('tax_parts', public.till_pick_all(x.e -> 'tax_parts', array['tax_rate_milli', 'minor'])) else '{}'::jsonb end
      end order by x.n) from jsonb_array_elements(p_lines) with ordinality x(e, n)), '[]'::jsonb)
  end
$$;

-- 🔴 THE TILL NUMBER (the law check's change 3: « le numéro de la caisse », never null): the van's id when the order has one; 'web' for an
-- online order with no van; else the source the order records today ('manual' for a walk-up or an offline replay — no device id is
-- recorded on an order yet; the device-side hash is till-pack-2's); 'unrecorded' if even that is empty.
create or replace function public.till_till_id(o public.orders)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when o.van_id is not null then o.van_id::text
              when o.source = 'web' then 'web'
              else coalesce(nullif(btrim(o.source), ''), 'unrecorded') end
$$;

-- 🔴 THE SEALED ORDER (till-pack-0 §4 C1 + the law check's changes 2 and 3). Not sealed: customer_name, customer_email, customer_phone,
-- notes, line_notes, table_ref, cancellation_reason, rejection_reason, slot, requested_slot, asap_estimate, cooking_reservation, buzzer_*,
-- capacity_ack_at, status_before_collected, payment_status, amount_paid, paid_at, updated_at, application_fee_minor, card_funding,
-- modify_type, modify_data, deal_savings, extras, bundle, tax_rate_bps — and the notes inside the lines. Every item gains vat_rate_milli,
-- line_price_minor and line_total_excl_vat_minor; every deal gains vat_parts (one per rate, the same three keys); the order gains
-- till_id, vat_basis and vat_summary (one row per rate: vat_rate_milli, food_minor, excl_vat_minor, vat_minor).
create or replace function public.till_sealed_order(o public.orders)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v  jsonb := public.till_vat(o);
  si jsonb := public.till_sealed_lines(o.items, 'item');
  sd jsonb := public.till_sealed_lines(o.deals, 'deal');
begin
  if jsonb_typeof(si) = 'array' then
    si := coalesce((select jsonb_agg(case when jsonb_typeof(x.e) = 'object' then x.e || coalesce(v -> 'items' -> (x.n - 1)::integer, '{}'::jsonb) else x.e end order by x.n)
                      from jsonb_array_elements(si) with ordinality x(e, n)), '[]'::jsonb);
  end if;
  if jsonb_typeof(sd) = 'array' then
    sd := coalesce((select jsonb_agg(case when jsonb_typeof(x.e) = 'object' then x.e || jsonb_build_object('vat_parts', coalesce(v -> 'deals' -> (x.n - 1)::integer, '[]'::jsonb)) else x.e end order by x.n)
                      from jsonb_array_elements(sd) with ordinality x(e, n)), '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'truck_id', o.truck_id, 'order_key', o.order_key, 'receipt_no', o.receipt_no, 'id', o.id,
    'event_date', o.event_date, 'event_id', o.event_id, 'van_id', o.van_id,
    'placed_at', public.till_ts(coalesce(o.placed_at, o.created_at)), 'collected_at', public.till_ts(o.collected_at),
    'source', o.source, 'order_type', o.order_type,
    'items', si, 'deals', sd,
    'discount_code', o.discount_code, 'discount_amt', o.discount_amt,
    'subtotal', o.subtotal, 'total', o.total, 'total_minor', o.total_minor, 'currency', o.currency, 'country', o.country,
    'food_minor', o.food_minor, 'tax_minor', o.tax_minor, 'tax_rate_milli', o.tax_rate_milli, 'tax_inclusive', o.tax_inclusive,
    'tax_label', o.tax_label, 'tax_breakdown', o.tax_breakdown, 'tip_minor', o.tip_minor, 'tip_pct_bps', o.tip_pct_bps,
    'service_fee_minor', o.service_fee_minor, 'service_fee_recipient', o.service_fee_recipient,
    'card_surcharge_minor', o.card_surcharge_minor, 'card_fee_payer', o.card_fee_payer, 'vat_regime', o.vat_regime,
    'fiscal_state', public.till_fiscal_state(o.status),
    'till_id', public.till_till_id(o), 'vat_basis', v ->> 'basis', 'vat_summary', v -> 'summary');
end;
$$;

-- The ORDER columns the sealed form reads, as one text (a cheap "did anything sealed change?" filter for the update guard). Same text ⇒
-- same sealed form, because till_sealed_order reads exactly these columns and nothing else.
create or replace function public.till_order_source(o public.orders)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_array(o.truck_id, o.order_key, o.receipt_no, o.id, o.event_date, o.event_id, o.van_id, o.placed_at, o.created_at,
    o.collected_at, o.source, o.order_type, o.items, o.deals, o.discount_code, o.discount_amt, o.subtotal, o.total, o.total_minor, o.currency,
    o.country, o.food_minor, o.tax_minor, o.tax_rate_milli, o.tax_inclusive, o.tax_label, o.tax_breakdown, o.tip_minor, o.tip_pct_bps,
    o.service_fee_minor, o.service_fee_recipient, o.card_surcharge_minor, o.card_fee_payer, o.vat_regime, public.till_fiscal_state(o.status))::text
$$;

-- 🔴 THE SEALED PAYMENT (till-pack-0 §4 C2). Not sealed: note (free text), created_by (a staff id — the actor stays in
-- action_audit_log), idempotency_key, application_fee_minor, application_fee_refunded_minor, card_funding.
create or replace function public.till_sealed_payment(p public.order_payments)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', p.id, 'order_key', p.order_key, 'truck_id', p.truck_id, 'kind', p.kind, 'channel', p.channel, 'method', p.method,
    'amount_minor', p.amount_minor, 'currency', p.currency, 'state', p.state, 'external_ref', p.external_ref,
    'livemode', p.livemode, 'created_at', public.till_ts(p.created_at))
$$;

-- 🔴 THE TRUCK'S IDENTITY (the law check's change 4: what a receipt shows). Business data from trucks (france-records-1): legal name,
-- registered address (address, town, suburb, region, postcode), registration number, VAT number, VAT regime. Nothing else.
create or replace function public.till_identity_data(p_truck text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'legal_name', t.legal_name,
    'registered_address', public.till_pick(t.registered_address, array['address', 'town', 'suburb', 'region', 'postcode']),
    'registration_number', t.registration_number, 'vat_number', t.vat_number, 'vat_regime', t.vat_regime)
  from (select 1) one left join public.trucks t on t.id = p_truck
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5. The delta (the law check's change 5), and the reconciliation check
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- The elements of array a that b does not hold (a multiset difference: equal elements pair one for one; the order of a is kept).
create or replace function public.till_multiset_minus(p_a jsonb, p_b jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  with a as (select x.e, x.n, row_number() over (partition by x.e::text order by x.n) as k
               from jsonb_array_elements(case when jsonb_typeof(p_a) = 'array' then p_a else '[]'::jsonb end) with ordinality x(e, n)),
       b as (select x.e::text as t, count(*) as c from jsonb_array_elements(case when jsonb_typeof(p_b) = 'array' then p_b else '[]'::jsonb end) x(e) group by 1)
  select coalesce(jsonb_agg(a.e order by a.n), '[]'::jsonb) from a left join b on b.t = a.e::text where a.k > coalesce(b.c, 0)
$$;

-- 🔴 A NEW VERSION'S PLUS / MINUS against the previous sealed version (§ 90: « des opérations de plus et de moins »):
--   minus.items / minus.deals — the previous version's lines this one no longer has (whole sealed lines, with their VAT figures);
--   plus.items  / plus.deals  — this version's lines the previous one did not have;
--   amounts — each money field that changed: from, to, and the change (to − from) when both are numbers;
--   vat     — per rate, the change in the total excluding VAT and in the VAT;
--   fields  — the names of every sealed field that changed.
create or replace function public.till_order_delta(p_old jsonb, p_new jsonb, p_from integer)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'from_version', p_from,
    'minus', jsonb_build_object('items', public.till_multiset_minus(p_old -> 'items', p_new -> 'items'), 'deals', public.till_multiset_minus(p_old -> 'deals', p_new -> 'deals')),
    'plus', jsonb_build_object('items', public.till_multiset_minus(p_new -> 'items', p_old -> 'items'), 'deals', public.till_multiset_minus(p_new -> 'deals', p_old -> 'deals')),
    'amounts', coalesce((select jsonb_object_agg(f.k, jsonb_build_object('from', p_old -> f.k, 'to', p_new -> f.k,
        'change', case when jsonb_typeof(p_old -> f.k) = 'number' and jsonb_typeof(p_new -> f.k) = 'number' then to_jsonb((p_new ->> f.k)::numeric - (p_old ->> f.k)::numeric) end))
      from unnest(array['subtotal', 'discount_amt', 'total', 'total_minor', 'food_minor', 'tax_minor', 'tip_minor', 'service_fee_minor', 'card_surcharge_minor']) f(k)
      where (p_old -> f.k)::text is distinct from (p_new -> f.k)::text), '{}'::jsonb),
    'vat', coalesce((select jsonb_agg(jsonb_build_object('vat_rate_milli', z.rate, 'excl_vat_minor', z.d_excl, 'vat_minor', z.d_vat) order by z.rate nulls first)
      from (select coalesce(a.rate, b.rate) as rate, coalesce(b.excl, 0) - coalesce(a.excl, 0) as d_excl, coalesce(b.vat, 0) - coalesce(a.vat, 0) as d_vat
              from (select coalesce(s ->> 'vat_rate_milli', 'none') as k, (s ->> 'vat_rate_milli')::bigint as rate, sum((s ->> 'excl_vat_minor')::numeric) as excl, sum((s ->> 'vat_minor')::numeric) as vat
                      from jsonb_array_elements(case when jsonb_typeof(p_old -> 'vat_summary') = 'array' then p_old -> 'vat_summary' else '[]'::jsonb end) s group by 1, 2) a
              full join (select coalesce(s ->> 'vat_rate_milli', 'none') as k, (s ->> 'vat_rate_milli')::bigint as rate, sum((s ->> 'excl_vat_minor')::numeric) as excl, sum((s ->> 'vat_minor')::numeric) as vat
                      from jsonb_array_elements(case when jsonb_typeof(p_new -> 'vat_summary') = 'array' then p_new -> 'vat_summary' else '[]'::jsonb end) s group by 1, 2) b
                on a.k = b.k) z
      where z.d_excl <> 0 or z.d_vat <> 0), '[]'::jsonb),
    'fields', coalesce((select jsonb_agg(u.k order by u.k collate "C") from (select jsonb_object_keys(p_old) as k union select jsonb_object_keys(p_new)) u
                         where (p_old -> u.k)::text is distinct from (p_new -> u.k)::text), '[]'::jsonb))
$$;

-- Does a sealed order's VAT reconcile, to the minor unit? Every item and deal part carries its rate and its total excluding VAT; per rate,
-- the lines add up to the summary's excl_vat_minor; the rates' food adds up to the order's food; tax included: excl + vat = food; tax
-- added: excl = food and Σ vat = tax_minor; the breakdown, when it is the basis, is the summary; and the order's own totals add up
-- (total_minor = food + tax + tip + service fee + surcharge; before the charge columns, total = subtotal − discount).
create or replace function public.till_vat_reconciles(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_scale numeric := power(10::numeric, public.till_minor_digits(p ->> 'currency'));
  v_incl  boolean := coalesce((p ->> 'tax_inclusive')::boolean, false);
  v_items jsonb := case when jsonb_typeof(p -> 'items') = 'array' then p -> 'items' else '[]'::jsonb end;
  v_deals jsonb := case when jsonb_typeof(p -> 'deals') = 'array' then p -> 'deals' else '[]'::jsonb end;
  v_sum   jsonb := p -> 'vat_summary';
  v_food  numeric;
  v_n     numeric := 0;
begin
  if jsonb_typeof(v_sum) <> 'array' or jsonb_array_length(v_sum) = 0 then return false; end if;
  -- every line carries its figures
  if exists (select 1 from jsonb_array_elements(v_items) i where jsonb_typeof(i) = 'object'
               and not (i ? 'vat_rate_milli' and jsonb_typeof(i -> 'line_total_excl_vat_minor') = 'number' and jsonb_typeof(i -> 'line_price_minor') = 'number')) then return false; end if;
  if exists (select 1 from jsonb_array_elements(v_deals) d where jsonb_typeof(d) = 'object'
               and (jsonb_typeof(d -> 'vat_parts') <> 'array' or jsonb_array_length(d -> 'vat_parts') = 0
                    or exists (select 1 from jsonb_array_elements(d -> 'vat_parts') q
                                where not (q ? 'vat_rate_milli' and jsonb_typeof(q -> 'line_total_excl_vat_minor') = 'number' and jsonb_typeof(q -> 'line_price_minor') = 'number')))) then return false; end if;
  -- per rate: the lines = the summary
  if exists (
    with l as (
      select coalesce(i ->> 'vat_rate_milli', 'none') as k, (i ->> 'line_total_excl_vat_minor')::numeric as x from jsonb_array_elements(v_items) i where jsonb_typeof(i) = 'object'
      union all
      select coalesce(q ->> 'vat_rate_milli', 'none'), (q ->> 'line_total_excl_vat_minor')::numeric
        from jsonb_array_elements(v_deals) d, jsonb_array_elements(case when jsonb_typeof(d -> 'vat_parts') = 'array' then d -> 'vat_parts' else '[]'::jsonb end) q
       where jsonb_typeof(d) = 'object'),
    lg as (select l.k, sum(l.x) as s from l group by l.k),
    sg as (select coalesce(s ->> 'vat_rate_milli', 'none') as k, sum((s ->> 'excl_vat_minor')::numeric) as e from jsonb_array_elements(v_sum) s group by 1)
    select 1 from lg full join sg on lg.k = sg.k where coalesce(lg.s, 0) <> coalesce(sg.e, 0)) then return false; end if;
  if (select count(*) <> count(distinct coalesce(s ->> 'vat_rate_milli', 'none')) from jsonb_array_elements(v_sum) s) then return false; end if;
  -- the food (the same rule as till_vat)
  select coalesce(sum((i ->> 'line_price_minor')::numeric), 0) into v_n from jsonb_array_elements(v_items) i where jsonb_typeof(i) = 'object';
  v_n := v_n + coalesce((select sum((q ->> 'line_price_minor')::numeric) from jsonb_array_elements(v_deals) d,
           jsonb_array_elements(case when jsonb_typeof(d -> 'vat_parts') = 'array' then d -> 'vat_parts' else '[]'::jsonb end) q where jsonb_typeof(d) = 'object'), 0);
  v_food := case when jsonb_typeof(p -> 'food_minor') = 'number' then (p ->> 'food_minor')::numeric
                 when jsonb_typeof(p -> 'subtotal') = 'number' then round(((p ->> 'subtotal')::numeric - coalesce((p ->> 'discount_amt')::numeric, 0)) * v_scale)
                 when jsonb_typeof(p -> 'total_minor') = 'number' then (p ->> 'total_minor')::numeric
                 when jsonb_typeof(p -> 'total') = 'number' then round((p ->> 'total')::numeric * v_scale)
                 else v_n end;
  if (select sum((s ->> 'food_minor')::numeric) from jsonb_array_elements(v_sum) s) <> v_food then return false; end if;
  -- per rate: included or added
  if exists (select 1 from jsonb_array_elements(v_sum) s
              where case when v_incl then (s ->> 'excl_vat_minor')::numeric + (s ->> 'vat_minor')::numeric <> (s ->> 'food_minor')::numeric
                         else (s ->> 'excl_vat_minor')::numeric <> (s ->> 'food_minor')::numeric end) then return false; end if;
  if not v_incl and jsonb_typeof(p -> 'tax_minor') = 'number'
     and (select sum((s ->> 'vat_minor')::numeric) from jsonb_array_elements(v_sum) s) <> (p ->> 'tax_minor')::numeric then return false; end if;
  -- the breakdown, when it is the basis, IS the summary
  if p ->> 'vat_basis' = 'breakdown' and (select coalesce(jsonb_agg(jsonb_build_array(public.till_rate(b.e -> 'rate_milli'), round(public.till_num(b.e -> 'food_minor')), round(public.till_num(b.e -> 'tax_minor'))) order by b.n), '[]'::jsonb)
                                            from jsonb_array_elements(case when jsonb_typeof(p -> 'tax_breakdown') = 'array' then p -> 'tax_breakdown' else '[]'::jsonb end) with ordinality b(e, n))::text
                                         <> (select coalesce(jsonb_agg(jsonb_build_array((m.e ->> 'vat_rate_milli')::bigint, (m.e ->> 'food_minor')::numeric, (m.e ->> 'vat_minor')::numeric) order by m.n), '[]'::jsonb)
                                            from jsonb_array_elements(v_sum) with ordinality m(e, n))::text then return false; end if;
  -- the order's own totals
  if jsonb_typeof(p -> 'food_minor') = 'number' and jsonb_typeof(p -> 'total_minor') = 'number' then
    if (p ->> 'total_minor')::numeric <> (p ->> 'food_minor')::numeric + coalesce((p ->> 'tax_minor')::numeric, 0) + coalesce((p ->> 'tip_minor')::numeric, 0)
                                          + coalesce((p ->> 'service_fee_minor')::numeric, 0) + coalesce((p ->> 'card_surcharge_minor')::numeric, 0) then return false; end if;
  elsif jsonb_typeof(p -> 'subtotal') = 'number' and jsonb_typeof(p -> 'total') = 'number' then
    if (p ->> 'total')::numeric <> (p ->> 'subtotal')::numeric - coalesce((p ->> 'discount_amt')::numeric, 0) then return false; end if;
  end if;
  return true;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 6. Scope, the trading day, and the writers
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- Is this truck in the till? Not a demo truck (Q7), unless the proof script switched the till on inside its rolled-back transaction.
create or replace function public.till_applies(p_truck text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_truck is null then return false; end if;
  if coalesce(current_setting('till.include_demo', true), '') = 'on' then return true; end if;
  if p_truck like 'demo-%' then return false; end if;
  -- A truck row that is not there (being deleted, as the last step of a cascade) is outside: deleteTruckCascade deletes the orders —
  -- and so their payments — while the truck still exists, so a till truck's records are always seen with their truck.
  return exists (select 1 from public.trucks t where t.id = p_truck and coalesce(t.plan, '') <> 'demo');
end;
$$;

-- The truck's clock: trucks.timezone, else its country's default_timezone, else UTC.
create or replace function public.till_truck_tz(p_truck text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select nullif(t.timezone, '') from public.trucks t where t.id = p_truck),
    (select nullif(cs.default_timezone, '') from public.trucks t join public.country_settings cs on cs.country_code = t.country where t.id = p_truck),
    'UTC')
$$;

-- Is trading day D closed? (Q2: the close of D comes after 06:00 on D+1, truck time.) Used in this pack only to say what ENFORCE
-- mode would refuse, and to give a late payment its own day.
create or replace function public.till_day_closed(p_truck text, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select p_day is not null and now() >= ((p_day + 1) + time '06:00') at time zone public.till_truck_tz(p_truck) $$;

-- Today, truck time.
create or replace function public.till_today(p_truck text)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select (now() at time zone public.till_truck_tz(p_truck))::date $$;

-- 🔴 THE ONLY WRITER OF till_chain. Takes the truck's head row (the per-truck lock), appends seq + 1 with the canonical payload and both
-- hashes, moves the head. Called only by the till functions below (EXECUTE revoked from every API role).
create or replace function public.till_write(p_truck text, p_kind text, p_ref text, p_version integer, p_reason text, p_day date, p_data jsonb,
                                             p_identity jsonb, p_delta jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seq     bigint;
  v_prev    text;
  v_sv      text;
  v_payload text;
  v_ph      text;
  v_hash    text;
begin
  select s.software_version into v_sv from public.till_settings s where s.id;
  v_sv := coalesce(v_sv, '0.1.0');
  insert into public.till_chain_heads (truck_id, last_seq, last_hash) values (p_truck, 0, repeat('0', 64)) on conflict (truck_id) do nothing;
  select h.last_seq, h.last_hash into v_seq, v_prev from public.till_chain_heads h where h.truck_id = p_truck for update;
  v_seq := v_seq + 1;
  v_payload := jsonb_build_object(
    'v', 1, 'kind', p_kind, 'truck_id', p_truck, 'ref', p_ref, 'version', p_version, 'reason', p_reason,
    'trading_day', p_day, 'software_version', v_sv, 'recorded_at', public.till_ts(now()),
    'identity', p_identity, 'delta', p_delta, 'data', p_data)::text;
  v_ph := encode(sha256(convert_to(v_payload, 'UTF8')), 'hex');
  v_hash := encode(sha256(convert_to(v_prev || '|' || v_seq::text || '|' || p_kind || '|' || p_ref || '|' || v_ph, 'UTF8')), 'hex');
  insert into public.till_chain (truck_id, seq, kind, ref, version, payload, payload_hash, prev_hash, hash, software_version)
    values (p_truck, v_seq, p_kind, p_ref, p_version, v_payload, v_ph, v_prev, v_hash, v_sv);
  update public.till_chain_heads set last_seq = v_seq, last_hash = v_hash, updated_at = now() where truck_id = p_truck;
  return v_seq;
end;
$$;

-- The truck's identity entry, written when its data differs from the one in force (or there is none yet). Returns true if it wrote one.
create or replace function public.till_identity_sync(p_truck text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_data   jsonb := public.till_identity_data(p_truck);
  v_digest text  := encode(sha256(convert_to(public.till_identity_data(p_truck)::text, 'UTF8')), 'hex');
  v_cur    text;
  v_seq    bigint;
  v_ver    integer;
begin
  insert into public.till_chain_heads (truck_id, last_seq, last_hash) values (p_truck, 0, repeat('0', 64)) on conflict (truck_id) do nothing;
  select h.identity_digest into v_cur from public.till_chain_heads h where h.truck_id = p_truck for update;
  if v_cur is not distinct from v_digest then return false; end if;
  v_ver := coalesce((select max(c.version) from public.till_chain c where c.truck_id = p_truck and c.kind = 'identity' and c.ref = p_truck), 0) + 1;
  v_seq := public.till_write(p_truck, 'identity', p_truck, v_ver, p_reason, public.till_today(p_truck), v_data, null, null);
  update public.till_chain_heads h set identity_seq = v_seq, identity_hash = (select c.hash from public.till_chain c where c.truck_id = p_truck and c.seq = v_seq),
         identity_digest = v_digest where h.truck_id = p_truck;
  return true;
end;
$$;

-- 🔴 THE APPEND every till trigger uses. Before a truck's first entry, the 'till_start' event (change 6); before every entry, the identity
-- in force (change 4: written again whenever it changed); an order version names that identity entry {seq, hash}.
create or replace function public.till_append(p_truck text, p_kind text, p_ref text, p_version integer, p_reason text, p_day date, p_data jsonb, p_delta jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last bigint;
  v_id   jsonb;
begin
  insert into public.till_chain_heads (truck_id, last_seq, last_hash) values (p_truck, 0, repeat('0', 64)) on conflict (truck_id) do nothing;
  select h.last_seq into v_last from public.till_chain_heads h where h.truck_id = p_truck for update;
  if v_last = 0 then
    perform public.till_write(p_truck, 'event', 'till_start', null, 'first_sealed_entry', public.till_today(p_truck),
      jsonb_build_object('type', 'till_start', 'guard_mode', coalesce((select s.guard_mode from public.till_settings s where s.id), 'observe')), null, null);
  end if;
  perform public.till_identity_sync(p_truck, case when v_last = 0 then 'first_sealed_entry' else 'changed' end);
  if p_kind = 'order' then
    select jsonb_build_object('seq', h.identity_seq, 'hash', h.identity_hash) into v_id from public.till_chain_heads h where h.truck_id = p_truck;
  end if;
  return public.till_write(p_truck, p_kind, p_ref, p_version, p_reason, p_day, p_data, v_id, p_delta);
end;
$$;

-- A failure, logged without ever raising (and a WARNING for the logs).
create or replace function public.till_log_failure(p_truck text, p_op text, p_ref text, p_state text, p_msg text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.till_failures (truck_id, op, ref, sqlstate, message) values (p_truck, p_op, p_ref, p_state, left(p_msg, 500));
  exception when others then
    null;
  end;
  raise warning 'till: % not chained for truck % (%: %)', p_op, p_truck, p_state, left(p_msg, 200);
end;
$$;

-- A guard event (field NAMES only in detail).
create or replace function public.till_guard_event(p_truck text, p_table text, p_op text, p_ref text, p_event text, p_detail jsonb)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.till_guard_events (truck_id, table_name, op, ref, event, mode, detail)
  values (p_truck, p_table, p_op, p_ref, p_event, coalesce((select s.guard_mode from public.till_settings s where s.id), 'observe'), p_detail)
$$;

-- 🔴 SEAL AN ORDER, or chain its next version. READS the order (never locks or writes it): the truck's head is taken FIRST, then the seal
-- state and the order are read, so two transactions on one truck queue at the head and the second sees the first's committed seal.
--   • not sealed yet: version 1 with `p_first_reason` (accepted / final_state / first_payment / baseline);
--   • sealed: compared with its last sealed version — the same → nothing; different → version n + 1, with its delta. 'state_change' when
--     only fiscal_state / collected_at / placed_at moved, else 'edit'; '_after_close' once the trading day is closed, and then a
--     would-be refusal is logged (observe mode never refuses) — except the one-time fill of a missing placed_at (an offline replay).
-- Returns the version written, or 0.
create or replace function public.till_seal(p_key uuid, p_first_reason text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o         public.orders;
  s         public.till_order_seals;
  v_truck   text;
  v_data    jsonb;
  v_prev    jsonb;
  v_changed jsonb;
  v_reason  text;
  v_seq     bigint;
  v_closed  boolean;
begin
  select x.truck_id into v_truck from public.orders x where x.order_key = p_key;
  if v_truck is null then return 0; end if;
  insert into public.till_chain_heads (truck_id, last_seq, last_hash) values (v_truck, 0, repeat('0', 64)) on conflict (truck_id) do nothing;
  perform 1 from public.till_chain_heads h where h.truck_id = v_truck for update;
  select * into o from public.orders x where x.order_key = p_key;
  if not found then return 0; end if;
  select * into s from public.till_order_seals x where x.order_key = p_key;
  v_data := public.till_sealed_order(o);
  if s.order_key is null then
    if p_first_reason is null then return 0; end if;
    v_seq := public.till_append(o.truck_id, 'order', o.order_key::text, 1, p_first_reason, o.event_date, v_data, null);
    insert into public.till_order_seals (order_key, truck_id, version, last_seq, last_payload_hash, last_reason)
      select o.order_key, o.truck_id, 1, v_seq, c.payload_hash, p_first_reason from public.till_chain c where c.truck_id = o.truck_id and c.seq = v_seq;
    return 1;
  end if;
  if s.deleted_at is not null then return 0; end if;
  select (c.payload::jsonb) -> 'data' into v_prev from public.till_chain c where c.truck_id = s.truck_id and c.seq = s.last_seq;
  if v_prev::text = v_data::text then return 0; end if;
  select coalesce(jsonb_agg(u.k order by u.k collate "C"), '[]'::jsonb) into v_changed
    from (select jsonb_object_keys(v_prev) as k union select jsonb_object_keys(v_data)) u
   where (v_prev -> u.k)::text is distinct from (v_data -> u.k)::text;
  v_closed := public.till_day_closed(o.truck_id, (v_prev ->> 'event_date')::date);
  v_reason := case when v_changed <@ '["fiscal_state", "collected_at", "placed_at"]'::jsonb then 'state_change' else 'edit' end
              || case when v_closed then '_after_close' else '' end;
  v_seq := public.till_append(o.truck_id, 'order', o.order_key::text, s.version + 1, v_reason, o.event_date, v_data,
                              public.till_order_delta(v_prev, v_data, s.version));
  update public.till_order_seals x set version = s.version + 1, last_seq = v_seq, last_reason = v_reason, updated_at = now(),
         last_payload_hash = (select c.payload_hash from public.till_chain c where c.truck_id = o.truck_id and c.seq = v_seq)
   where x.order_key = p_key;
  if v_closed and v_changed <> '["placed_at"]'::jsonb then
    perform public.till_guard_event(o.truck_id, 'orders', 'UPDATE', o.order_key::text, 'would_refuse_after_close', jsonb_build_object('fields', v_changed));
  end if;
  return s.version + 1;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 7. The triggers' functions — 🔴 ALL AFTER TRIGGERS: THEY READ THE ROW AND WRITE TILL TABLES ONLY, AND NONE OF THEM EVER FAILS THE WRITE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 7a. order_payments AFTER INSERT: chain the payment; seal its order at its first payment if it is not sealed yet (Q1).
create or replace function public.till_payment_inserted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old  text;
  v_day  date;
  v_ev   date;
begin
  if not public.till_applies(new.truck_id) then return null; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    select o.event_date into v_ev from public.orders o where o.order_key = new.order_key;
    -- A payment belongs to its order's trading day while that day is open; once it is closed, to the day it is recorded (Q2).
    v_day := case when v_ev is not null and not public.till_day_closed(new.truck_id, v_ev) then v_ev else public.till_today(new.truck_id) end;
    perform public.till_append(new.truck_id, 'payment', new.id::text, 1, 'recorded', v_day, public.till_sealed_payment(new), null);
    if not exists (select 1 from public.till_order_seals s where s.order_key = new.order_key) then
      perform public.till_seal(new.order_key, 'first_payment');
    end if;
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(new.truck_id, 'payment_insert', new.id::text, sqlstate, sqlerrm);
  end;
  return null;
end;
$$;

-- 7b. orders AFTER INSERT: an order inserted already ACCEPTED (a walk-up, an auto-accepted order) or in a final state is sealed (change 1,
-- Q1). A pending one stays unsealed. AFTER, so an ON CONFLICT DO NOTHING replay that inserts nothing chains nothing.
create or replace function public.till_order_inserted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
  v_fs  text := public.till_fiscal_state(new.status);
begin
  if v_fs = 'pending' or not public.till_applies(new.truck_id) then return null; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    perform public.till_seal(new.order_key, case when v_fs = 'accepted' then 'accepted' else 'final_state' end);
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(new.truck_id, 'order_insert_seal', new.order_key::text, sqlstate, sqlerrm);
  end;
  return null;
end;
$$;

-- 7c. orders AFTER UPDATE — THE GUARD (observe mode) and the seal at acceptance / a final state.
--   • not sealed: leaving pending (accepted, or straight to a final state) seals it (version 1); a pending order stays unsealed;
--   • sealed: a change to a sealed field is chained as version n + 1, with its delta (never refused); see till_seal.
--   • fields outside the sealed form (personal data, notes, line notes, kitchen moves, caches) change freely: retention, account deletion
--     and the dashboard never make a version — and nothing is looked up beyond the seal row when no sealed column changed.
create or replace function public.till_order_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old    text;
  v_fs     text := public.till_fiscal_state(new.status);
  v_sealed boolean;
begin
  if not public.till_applies(new.truck_id) then return null; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    v_sealed := exists (select 1 from public.till_order_seals s where s.order_key = new.order_key);
    if not v_sealed then
      if v_fs <> 'pending' then
        perform public.till_seal(new.order_key, case when v_fs = 'accepted' then 'accepted' else 'final_state' end);
      end if;
    elsif public.till_order_source(old) is distinct from public.till_order_source(new) then
      perform public.till_seal(new.order_key, null);
    end if;
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(new.truck_id, 'order_update', new.order_key::text, sqlstate, sqlerrm);
  end;
  return null;
end;
$$;

-- 7d. orders AFTER DELETE (observe): a sealed order's delete is logged and chained as a 'deletion' entry, its seal state marked deleted —
-- and the delete goes through.
create or replace function public.till_order_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
  v_ver integer;
begin
  if not public.till_applies(old.truck_id) then return null; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    select s.version into v_ver from public.till_order_seals s where s.order_key = old.order_key and s.deleted_at is null;
    if v_ver is not null then
      perform public.till_append(old.truck_id, 'deletion', old.order_key::text, null, 'observed_delete', public.till_today(old.truck_id),
        jsonb_build_object('table', 'orders', 'ref', old.order_key::text, 'sealed_version', v_ver), null);
      update public.till_order_seals s set deleted_at = now(), updated_at = now() where s.order_key = old.order_key;
      perform public.till_guard_event(old.truck_id, 'orders', 'DELETE', old.order_key::text, 'would_refuse_delete', null);
    end if;
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(old.truck_id, 'order_delete', old.order_key::text, sqlstate, sqlerrm);
  end;
  return null;
end;
$$;

-- 7e. order_payments AFTER UPDATE (observe): a change to a chained payment's sealed fields is chained as a new version and logged
-- (enforce mode will refuse it). The fee fills (application_fee_minor / _refunded_minor) are not sealed and pass silently.
create or replace function public.till_payment_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old   text;
  v_last  integer;
  v_s_new jsonb;
  v_s_old jsonb;
begin
  if not public.till_applies(new.truck_id) then return null; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    v_s_old := public.till_sealed_payment(old);
    v_s_new := public.till_sealed_payment(new);
    if v_s_new::text is distinct from v_s_old::text then
      select max(c.version) into v_last from public.till_chain c where c.truck_id = old.truck_id and c.kind = 'payment' and c.ref = old.id::text;
      if v_last is not null then
        perform public.till_append(new.truck_id, 'payment', new.id::text, v_last + 1, 'changed', public.till_today(new.truck_id), v_s_new, null);
      end if;
      perform public.till_guard_event(new.truck_id, 'order_payments', 'UPDATE', new.id::text, 'would_refuse_payment_change',
        (select jsonb_build_object('fields', coalesce(jsonb_agg(k.key order by k.key), '[]'::jsonb)) from jsonb_each(v_s_new) k where (v_s_new -> k.key)::text is distinct from (v_s_old -> k.key)::text));
    end if;
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(new.truck_id, 'payment_update', new.id::text, sqlstate, sqlerrm);
  end;
  return null;
end;
$$;

-- 7f. order_payments AFTER DELETE (observe): every till truck's payment delete is logged (enforce mode will refuse it — corrections
-- become reversal rows in till-pack-2); a chained one also gets a 'deletion' entry, so the chain still accounts for every row.
create or replace function public.till_payment_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old     text;
  v_chained boolean;
begin
  if not public.till_applies(old.truck_id) then return null; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    v_chained := exists (select 1 from public.till_chain c where c.truck_id = old.truck_id and c.kind = 'payment' and c.ref = old.id::text);
    if v_chained then
      perform public.till_append(old.truck_id, 'deletion', old.id::text, null, 'observed_delete', public.till_today(old.truck_id),
        jsonb_build_object('table', 'order_payments', 'ref', old.id::text, 'order_key', old.order_key), null);
    end if;
    perform public.till_guard_event(old.truck_id, 'order_payments', 'DELETE', old.id::text, case when v_chained then 'would_refuse_delete' else 'would_refuse_delete_unchained' end, null);
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(old.truck_id, 'payment_delete', old.id::text, sqlstate, sqlerrm);
  end;
  return null;
end;
$$;

-- 7g. trucks AFTER UPDATE OF the five identity columns (only when one really changed): a truck already in the chain gets its new identity
-- entry at once (change 4). A truck with no chain yet gets it before its first sealed entry. Never fails the settings save.
create or replace function public.till_truck_identity_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
begin
  if not public.till_applies(new.id) then return null; end if;
  if not exists (select 1 from public.till_chain_heads h where h.truck_id = new.id and h.last_seq > 0) then return null; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    perform public.till_identity_sync(new.id, 'changed');
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(new.id, 'identity_change', new.id, sqlstate, sqlerrm);
  end;
  return null;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 8. Append-only: till_chain and action_audit_log (these DO raise — they are not on an order table, and nothing writes them that way)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.till_refuse_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '% is append-only: % refused', tg_table_name, tg_op using errcode = 'HGT01';
end;
$$;

revoke update, delete, truncate on public.action_audit_log from anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 9. Verify, and the baseline (built, not run)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- till_verify(truck): read-only. The chain (gap-free seq, links, both hashes, the head; seq 1 the till_start event; each order version
-- naming the identity entry in force; versions 1, 2, 3 … per order with each delta equal to the one recomputed from the previous version;
-- a till_id on every version; every version's VAT reconciling), and the rows against their seal state (every sealed order still matches its
-- last sealed version, or has a 'deletion' entry; every chained payment still matches, or has one). Unsealed / unchained rows are counted,
-- not failed (the baseline seals the history).
create or replace function public.till_verify(p_truck text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r          record;
  s          record;
  ro         public.orders;
  v_prev     text := repeat('0', 64);
  v_next     bigint := 1;
  v_n        bigint := 0;
  v_gaps     integer := 0;
  v_links    integer := 0;
  v_phash    integer := 0;
  v_hash     integer := 0;
  v_struct   integer := 0;
  v_idref    integer := 0;
  v_vers     integer := 0;
  v_deltas   integer := 0;
  v_tillid   integer := 0;
  v_recon    integer := 0;
  v_recomp   integer := 0;
  v_hseq     bigint;
  v_hhash    text;
  v_hidseq   bigint;
  v_hidhash  text;
  v_head_ok  boolean;
  v_mis      jsonb := '[]'::jsonb;
  v_p        jsonb;
  v_pp       jsonb;
  v_id_seq   bigint;
  v_id_hash  text;
  v_id_ver   integer := 0;
  v_unsealed integer;
  v_unchained integer;
  v_lpay     text;
  v_lseq     bigint;
begin
  for r in select * from public.till_chain c where c.truck_id = p_truck order by c.seq loop
    v_n := v_n + 1;
    if r.seq <> v_next then v_gaps := v_gaps + 1; end if;
    if r.prev_hash <> v_prev then v_links := v_links + 1; end if;
    if encode(sha256(convert_to(r.payload, 'UTF8')), 'hex') <> r.payload_hash then v_phash := v_phash + 1; end if;
    if encode(sha256(convert_to(r.prev_hash || '|' || r.seq::text || '|' || r.kind || '|' || r.ref || '|' || r.payload_hash, 'UTF8')), 'hex') <> r.hash then v_hash := v_hash + 1; end if;
    v_p := r.payload::jsonb;
    if (r.seq = 1) <> (r.kind = 'event' and r.ref = 'till_start') then v_struct := v_struct + 1; end if;
    if r.kind = 'identity' then
      v_id_ver := v_id_ver + 1;
      if r.version is distinct from v_id_ver or r.ref <> p_truck then v_struct := v_struct + 1; end if;
      v_id_seq := r.seq; v_id_hash := r.hash;
    elsif r.kind = 'order' then
      if v_id_seq is null or v_p -> 'identity' is distinct from jsonb_build_object('seq', v_id_seq, 'hash', v_id_hash) then v_idref := v_idref + 1; end if;
      v_pp := null;
      select c.payload::jsonb into v_pp from public.till_chain c where c.truck_id = p_truck and c.kind = 'order' and c.ref = r.ref and c.seq < r.seq order by c.seq desc limit 1;
      if v_pp is null then
        if r.version is distinct from 1 or jsonb_typeof(v_p -> 'delta') <> 'null' then v_vers := v_vers + 1; end if;
      else
        if r.version is distinct from (v_pp ->> 'version')::integer + 1 then v_vers := v_vers + 1; end if;
        if (v_p -> 'delta')::text is distinct from public.till_order_delta(v_pp -> 'data', v_p -> 'data', (v_pp ->> 'version')::integer)::text then v_deltas := v_deltas + 1; end if;
      end if;
      if coalesce(v_p -> 'data' ->> 'till_id', '') = '' then v_tillid := v_tillid + 1; end if;
      if not public.till_vat_reconciles(v_p -> 'data') then
        v_recon := v_recon + 1;
        v_mis := v_mis || jsonb_build_object('ref', r.ref, 'kind', 'order', 'seq', r.seq, 'problem', 'VAT does not reconcile');
      end if;
      if v_p -> 'data' ->> 'vat_basis' = 'recomputed' then v_recomp := v_recomp + 1; end if;
    end if;
    v_prev := r.hash;
    v_next := r.seq + 1;
  end loop;
  select h.last_seq, h.last_hash, h.identity_seq, h.identity_hash into v_hseq, v_hhash, v_hidseq, v_hidhash from public.till_chain_heads h where h.truck_id = p_truck;
  v_head_ok := (v_n = 0 and (v_hseq is null or v_hseq = 0)) or (v_hseq = v_next - 1 and v_hhash = v_prev and v_hidseq is not distinct from v_id_seq and v_hidhash is not distinct from v_id_hash);

  -- every seal: its entry is the order's latest version, and the row still equals it (or a deletion entry follows)
  for s in select * from public.till_order_seals x where x.truck_id = p_truck loop
    select c.* into r from public.till_chain c where c.truck_id = p_truck and c.seq = s.last_seq;
    if r.seq is null or r.kind <> 'order' or r.ref <> s.order_key::text or r.version is distinct from s.version or r.payload_hash <> s.last_payload_hash
       or exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.kind = 'order' and c.ref = s.order_key::text and c.seq > s.last_seq) then
      v_mis := v_mis || jsonb_build_object('ref', s.order_key, 'kind', 'order', 'problem', 'seal state differs from the chain');
    elsif s.deleted_at is null then
      select o.* into ro from public.orders o where o.order_key = s.order_key;
      if ro.order_key is null then
        v_mis := v_mis || jsonb_build_object('ref', s.order_key, 'kind', 'order', 'problem', 'row gone, no deletion entry');
      elsif ((r.payload::jsonb) -> 'data')::text is distinct from public.till_sealed_order(ro)::text then
        v_mis := v_mis || jsonb_build_object('ref', s.order_key, 'kind', 'order', 'problem', 'row differs from its sealed form');
      end if;
    elsif not exists (select 1 from public.till_chain d where d.truck_id = p_truck and d.kind = 'deletion' and d.ref = s.order_key::text and d.seq > s.last_seq) then
      v_mis := v_mis || jsonb_build_object('ref', s.order_key, 'kind', 'order', 'problem', 'marked deleted, no deletion entry');
    end if;
  end loop;
  -- every order with entries has a seal state
  for r in select distinct c.ref from public.till_chain c where c.truck_id = p_truck and c.kind = 'order'
             and not exists (select 1 from public.till_order_seals x where x.order_key::text = c.ref) loop
    v_mis := v_mis || jsonb_build_object('ref', r.ref, 'kind', 'order', 'problem', 'entries but no seal state');
  end loop;
  -- every chained payment: still equal to its latest entry, or gone with a 'deletion' entry
  for r in select distinct c.ref from public.till_chain c where c.truck_id = p_truck and c.kind = 'payment' loop
    select c.payload, c.seq into v_lpay, v_lseq from public.till_chain c where c.truck_id = p_truck and c.kind = 'payment' and c.ref = r.ref order by c.seq desc limit 1;
    if exists (select 1 from public.order_payments p where p.id::text = r.ref) then
      if ((v_lpay::jsonb) -> 'data')::text is distinct from (select public.till_sealed_payment(p)::text from public.order_payments p where p.id::text = r.ref) then
        v_mis := v_mis || jsonb_build_object('ref', r.ref, 'kind', 'payment', 'problem', 'row differs from its sealed form');
      end if;
    elsif not exists (select 1 from public.till_chain d where d.truck_id = p_truck and d.kind = 'deletion' and d.ref = r.ref and d.seq > v_lseq) then
      v_mis := v_mis || jsonb_build_object('ref', r.ref, 'kind', 'payment', 'problem', 'row gone, no deletion entry');
    end if;
  end loop;
  select count(*) into v_unsealed from public.orders o where o.truck_id = p_truck and public.till_fiscal_state(o.status) <> 'pending'
     and not exists (select 1 from public.till_order_seals x where x.order_key = o.order_key);
  select count(*) into v_unchained from public.order_payments p where p.truck_id = p_truck
     and not exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.kind = 'payment' and c.ref = p.id::text);

  return jsonb_build_object(
    'truck_id', p_truck,
    'ok', v_gaps = 0 and v_links = 0 and v_phash = 0 and v_hash = 0 and coalesce(v_head_ok, false) and v_struct = 0 and v_idref = 0 and v_vers = 0
          and v_deltas = 0 and v_tillid = 0 and v_recon = 0 and jsonb_array_length(v_mis) = 0,
    'entries', v_n, 'gaps', v_gaps, 'bad_links', v_links, 'bad_payload_hashes', v_phash, 'bad_hashes', v_hash, 'head_ok', coalesce(v_head_ok, false),
    'structure', v_struct, 'bad_identity_refs', v_idref, 'bad_versions', v_vers, 'bad_deltas', v_deltas, 'no_till_id', v_tillid,
    'unreconciled', v_recon, 'vat_recomputed', v_recomp,
    'mismatches', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(v_mis) x limit 50) y),
    'mismatch_count', jsonb_array_length(v_mis),
    'unsealed_orders', v_unsealed, 'unchained_payments', v_unchained);
end;
$$;

-- till_baseline(truck or NULL = every till truck): seal every existing non-pending order and chain every existing payment once, as
-- 'baseline' entries (their state that day — marked as not sealed at the time). Idempotent: only unsealed orders and unchained payments.
-- Writes TILL TABLES ONLY — no order or payment row is touched, so no realtime event. 🔴 BUILT, NOT RUN (Q8): it runs after the next
-- deploy, in a later prompt.
create or replace function public.till_baseline(p_truck text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t        record;
  o        record;
  p        public.order_payments;
  v_orders integer := 0;
  v_pays   integer := 0;
  v_trucks integer := 0;
begin
  for t in select tr.id from public.trucks tr where (p_truck is null or tr.id = p_truck) and public.till_applies(tr.id) order by tr.id loop
    v_trucks := v_trucks + 1;
    for o in select x.order_key from public.orders x where x.truck_id = t.id and public.till_fiscal_state(x.status) <> 'pending'
               and not exists (select 1 from public.till_order_seals s where s.order_key = x.order_key)
               order by x.created_at, x.order_key loop
      if public.till_seal(o.order_key, 'baseline') = 1 then v_orders := v_orders + 1; end if;
    end loop;
    for p in select y.* from public.order_payments y where y.truck_id = t.id
               and not exists (select 1 from public.till_chain c where c.truck_id = t.id and c.kind = 'payment' and c.ref = y.id::text)
               order by y.created_at, y.id loop
      perform public.till_append(t.id, 'payment', p.id::text, 1, 'baseline',
        coalesce((select x.event_date from public.orders x where x.order_key = p.order_key), (p.created_at at time zone public.till_truck_tz(t.id))::date),
        public.till_sealed_payment(p), null);
      v_pays := v_pays + 1;
    end loop;
  end loop;
  return jsonb_build_object('trucks', v_trucks, 'orders_sealed', v_orders, 'payments_chained', v_pays);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 10. Who may call what: the triggers' functions and the writers — nobody but the owner; till_verify — the service role too.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- One statement per function (the repo guard scripts/migration-function-grants.cjs reads one signature per revoke).
revoke all on function public.till_ts(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.till_fiscal_state(text) from public, anon, authenticated, service_role;
revoke all on function public.till_pick(jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function public.till_pick_all(jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function public.till_num(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.till_rate(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.till_minor_digits(text) from public, anon, authenticated, service_role;
revoke all on function public.till_allocate(numeric, numeric[]) from public, anon, authenticated, service_role;
revoke all on function public.till_vat(public.orders) from public, anon, authenticated, service_role;
revoke all on function public.till_sealed_lines(jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.till_till_id(public.orders) from public, anon, authenticated, service_role;
revoke all on function public.till_sealed_order(public.orders) from public, anon, authenticated, service_role;
revoke all on function public.till_order_source(public.orders) from public, anon, authenticated, service_role;
revoke all on function public.till_sealed_payment(public.order_payments) from public, anon, authenticated, service_role;
revoke all on function public.till_identity_data(text) from public, anon, authenticated, service_role;
revoke all on function public.till_multiset_minus(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.till_order_delta(jsonb, jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function public.till_vat_reconciles(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.till_applies(text) from public, anon, authenticated, service_role;
revoke all on function public.till_truck_tz(text) from public, anon, authenticated, service_role;
revoke all on function public.till_day_closed(text, date) from public, anon, authenticated, service_role;
revoke all on function public.till_today(text) from public, anon, authenticated, service_role;
revoke all on function public.till_write(text, text, text, integer, text, date, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.till_identity_sync(text, text) from public, anon, authenticated, service_role;
revoke all on function public.till_append(text, text, text, integer, text, date, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.till_log_failure(text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.till_guard_event(text, text, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.till_seal(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.till_payment_inserted() from public, anon, authenticated, service_role;
revoke all on function public.till_order_inserted() from public, anon, authenticated, service_role;
revoke all on function public.till_order_guard() from public, anon, authenticated, service_role;
revoke all on function public.till_order_delete_guard() from public, anon, authenticated, service_role;
revoke all on function public.till_payment_guard() from public, anon, authenticated, service_role;
revoke all on function public.till_payment_delete_guard() from public, anon, authenticated, service_role;
revoke all on function public.till_truck_identity_changed() from public, anon, authenticated, service_role;
revoke all on function public.till_refuse_change() from public, anon, authenticated, service_role;
revoke all on function public.till_verify(text) from public, anon, authenticated, service_role;
revoke all on function public.till_baseline(text) from public, anon, authenticated, service_role;
grant execute on function public.till_verify(text) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 11. The triggers. Created only when missing (no drop): safe to run twice. ALL AFTER triggers on orders / order_payments / trucks: they
--     see the row as every existing BEFORE trigger (receipt number, currency, VAT regime, updated_at) left it, and cannot change it.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'order_payments_till_chain' and tgrelid = 'public.order_payments'::regclass) then
    create trigger order_payments_till_chain after insert on public.order_payments for each row execute function public.till_payment_inserted();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'order_payments_till_guard' and tgrelid = 'public.order_payments'::regclass) then
    create trigger order_payments_till_guard after update on public.order_payments for each row execute function public.till_payment_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'order_payments_till_guard_delete' and tgrelid = 'public.order_payments'::regclass) then
    create trigger order_payments_till_guard_delete after delete on public.order_payments for each row execute function public.till_payment_delete_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_till_seal' and tgrelid = 'public.orders'::regclass) then
    create trigger orders_till_seal after insert on public.orders for each row execute function public.till_order_inserted();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_till_guard' and tgrelid = 'public.orders'::regclass) then
    create trigger orders_till_guard after update on public.orders for each row execute function public.till_order_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_till_guard_delete' and tgrelid = 'public.orders'::regclass) then
    create trigger orders_till_guard_delete after delete on public.orders for each row execute function public.till_order_delete_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trucks_till_identity' and tgrelid = 'public.trucks'::regclass) then
    create trigger trucks_till_identity after update of legal_name, registered_address, registration_number, vat_number, vat_regime on public.trucks
      for each row when (old.legal_name is distinct from new.legal_name or old.registered_address is distinct from new.registered_address
        or old.registration_number is distinct from new.registration_number or old.vat_number is distinct from new.vat_number
        or old.vat_regime is distinct from new.vat_regime)
      execute function public.till_truck_identity_changed();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_chain_append_only' and tgrelid = 'public.till_chain'::regclass) then
    create trigger till_chain_append_only before update or delete on public.till_chain for each row execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_chain_no_truncate' and tgrelid = 'public.till_chain'::regclass) then
    create trigger till_chain_no_truncate before truncate on public.till_chain for each statement execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'action_audit_log_append_only' and tgrelid = 'public.action_audit_log'::regclass) then
    create trigger action_audit_log_append_only before update or delete on public.action_audit_log for each row execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'action_audit_log_no_truncate' and tgrelid = 'public.action_audit_log'::regclass) then
    create trigger action_audit_log_no_truncate before truncate on public.action_audit_log for each statement execute function public.till_refuse_change();
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only). Run after the block above.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The six tables, RLS on:
--   select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname like 'till\_%' and relkind = 'r' order by 1;
-- 2. Nothing added to orders or order_payments:
--   select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('orders', 'order_payments') and column_name like 'seal%';
-- 3. The triggers:
--   select c.relname, t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and (t.tgname like '%till%' or t.tgname like 'action_audit_log_%') order by 1, 2;
-- 4. place_order_atomic_v2 untouched, guard mode observe, nothing chained yet:
--   select md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)), (select guard_mode from public.till_settings), (select count(*) from public.till_chain), (select count(*) from public.till_order_seals);
