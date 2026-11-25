-- 20261129_till_pack_1.sql
-- till-pack-1 (24 November 2026, docs/till-pack-1-report.md; the plan: docs/till-pack-0-report.md §4 C, §5 D, §7 G, §8): THE TAMPER-EVIDENT
-- CHAIN, IN OBSERVE MODE. Country-neutral, backend only: no route, screen, email or ticket changes, and nothing needs a deploy — database
-- triggers cover the deployed code (origin/main) as it is.
--
-- ✅ CLASSIFICATION: ADDITIVE AND BACKWARD-COMPATIBLE WITH THE DEPLOYED CODE (the live site uses this database):
--    • five NEW tables — till_settings (one row, guard_mode 'observe'), till_chain (append-only), till_chain_heads, till_failures,
--      till_guard_events — RLS on, no policy, nothing for anon / authenticated; till_chain also gives the service role SELECT only.
--    • orders.sealed_at, orders.sealed_version: NEW, NULLABLE, no default. Nothing reads them; only the till triggers write them.
--    • NEW triggers. 🔴 EVERY TRIGGER ON AN ORDER TABLE NEVER FAILS A SALE (the receipt-number pattern, france-records-1): all its work is
--      one guarded block under a 2 s lock_timeout; on ANY error the row is written exactly as the code sent it, the failure goes to
--      till_failures (itself guarded) and a WARNING is raised. They:
--        - chain every new payment (order_payments AFTER INSERT) and seal its order at its FIRST payment (Dominic's Q1);
--        - seal an order when it reaches a FINAL state — collected, cancelled, rejected (orders AFTER INSERT / BEFORE UPDATE; Q1);
--        - GUARD orders and order_payments UPDATE / DELETE in OBSERVE mode: a change to a sealed field is chained as a new version
--          (automatically, never refused); a change that ENFORCE mode would refuse (after the trading day's close, a delete of a sealed
--          order or of a till truck's payment, a write to the seal columns) is logged to till_guard_events — and still allowed.
--    • action_audit_log becomes APPEND-ONLY (UPDATE / DELETE / TRUNCATE refused by trigger; those privileges revoked from anon,
--      authenticated and service_role). Checked first (report §3): no code, database function or cron updates or deletes it, and no
--      foreign key cascades into it.
--    • 🔴 DEMO TRUCKS ARE OUTSIDE THE TILL (Q7): plan 'demo' and ids 'demo-…' are skipped by every trigger, so their deletes, cascades
--      (deleteTruckCascade, the demo-cleanup cron) and restarts work exactly as today. scripts/db-rollback-proofs.cjs switches the till
--      on for them INSIDE its rolled-back transaction only (SET LOCAL till.include_demo = 'on').
--    • till_baseline() is CREATED, NOT RUN (Q8: it runs after the next deploy, in a later prompt).
--    • place_order_atomic_v2 is NOT touched (md5 e4b273abcf8e7609c6ca54033ed59332). No drop, no rename, no existing row updated or deleted.
--
-- THE SEALED FORMS (a strict WHITELIST — no name, email, phone, order note, line note, slot note, table reference, free-text reason or
-- staff id, ever): till_sealed_order() and till_sealed_payment() below. The payload stored in the chain is the canonical text of a jsonb
-- envelope (jsonb::text: keys sorted shortest first then bytewise, fixed separators — independent of the order keys were written in);
-- timestamps are written as UTC text by till_ts(), so the session's TimeZone cannot change a byte.
-- THE CHAIN, per truck: seq 1, 2, 3 … with no gap; payload_hash = sha256(payload); hash = sha256(prev_hash|seq|kind|ref|payload_hash);
-- the first prev_hash is 64 zeros. scripts/till-verify.cjs checks an export offline; till_verify(truck) checks it in the database.
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
  kind             text not null check (kind in ('order', 'payment', 'deletion', 'close', 'archive')),
  ref              text not null,
  version          integer check (version is null or version >= 1),
  payload          text not null,
  payload_hash     text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  prev_hash        text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash             text not null check (hash ~ '^[0-9a-f]{64}$'),
  software_version text not null,
  created_at       timestamptz not null default now(),
  primary key (truck_id, seq)
);
create index if not exists till_chain_ref_idx on public.till_chain (truck_id, kind, ref, seq desc);
comment on table public.till_chain is 'till-pack-1: APPEND-ONLY. Per truck, a gap-free sequence of sealed entries (order versions, payments, observed deletions; closes and archives from later packs). payload = canonical text with NO personal data; payload_hash = sha256(payload); hash = sha256(prev_hash|seq|kind|ref|payload_hash). Written only by public.till_append(). UPDATE, DELETE and TRUNCATE are refused by trigger. No foreign key: the record outlives any truck row.';

create table if not exists public.till_chain_heads (
  truck_id   text primary key,
  last_seq   bigint not null check (last_seq >= 0),
  last_hash  text not null check (last_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);
comment on table public.till_chain_heads is 'till-pack-1: the last seq and hash of each truck''s chain — the per-truck lock that keeps seq gap-free (the receipt_counters pattern). till_verify() checks it against the chain.';

create table if not exists public.till_failures (
  id         bigserial primary key,
  truck_id   text,
  op         text,
  ref        text,
  sqlstate   text,
  message    text,
  created_at timestamptz not null default now()
);
comment on table public.till_failures is 'till-pack-1: a till trigger that could not chain or seal (it never fails the sale). Read by people; a later sweeper seals the backlog.';

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
alter table public.till_failures     enable row level security;
alter table public.till_guard_events enable row level security;
revoke all on public.till_settings, public.till_chain, public.till_chain_heads, public.till_failures, public.till_guard_events from anon, authenticated;
revoke all on sequence public.till_failures_id_seq, public.till_guard_events_id_seq from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.till_chain from service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The seal columns on orders
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.orders add column if not exists sealed_at      timestamptz;
alter table public.orders add column if not exists sealed_version integer;
comment on column public.orders.sealed_at is 'till-pack-1: when the order was first sealed into the till chain (first payment, or a final state). NULL = not sealed. Written only by the till triggers.';
comment on column public.orders.sealed_version is 'till-pack-1: the order''s latest sealed version in the till chain (1, 2 …). NULL = not sealed. Written only by the till triggers.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The sealed forms — a strict whitelist
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

-- 🔴 THE SEALED ORDER (till-pack-0 §4 C1). Not sealed: customer_name, customer_email, customer_phone, notes, line_notes, table_ref,
-- cancellation_reason, rejection_reason, slot, requested_slot, asap_estimate, cooking_reservation, buzzer_*, capacity_ack_at,
-- status_before_collected, payment_status, amount_paid, paid_at, updated_at, application_fee_minor, card_funding, modify_type,
-- modify_data, deal_savings, extras, bundle, tax_rate_bps, sealed_at, sealed_version — and the notes inside the lines.
create or replace function public.till_sealed_order(o public.orders)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'truck_id', o.truck_id, 'order_key', o.order_key, 'receipt_no', o.receipt_no, 'id', o.id,
    'event_date', o.event_date, 'event_id', o.event_id, 'van_id', o.van_id,
    'placed_at', public.till_ts(coalesce(o.placed_at, o.created_at)), 'collected_at', public.till_ts(o.collected_at),
    'source', o.source, 'order_type', o.order_type,
    'items', public.till_sealed_lines(o.items, 'item'), 'deals', public.till_sealed_lines(o.deals, 'deal'),
    'discount_code', o.discount_code, 'discount_amt', o.discount_amt,
    'subtotal', o.subtotal, 'total', o.total, 'total_minor', o.total_minor, 'currency', o.currency, 'country', o.country,
    'food_minor', o.food_minor, 'tax_minor', o.tax_minor, 'tax_rate_milli', o.tax_rate_milli, 'tax_inclusive', o.tax_inclusive,
    'tax_label', o.tax_label, 'tax_breakdown', o.tax_breakdown, 'tip_minor', o.tip_minor, 'tip_pct_bps', o.tip_pct_bps,
    'service_fee_minor', o.service_fee_minor, 'service_fee_recipient', o.service_fee_recipient,
    'card_surcharge_minor', o.card_surcharge_minor, 'card_fee_payer', o.card_fee_payer, 'vat_regime', o.vat_regime,
    'fiscal_state', public.till_fiscal_state(o.status))
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

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Scope, the trading day, and the append
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

-- 🔴 THE ONLY WRITER OF till_chain. Takes the truck's head row (the per-truck lock), appends seq + 1 with the canonical payload and
-- both hashes, moves the head. Called only by the till functions below (EXECUTE revoked from every API role).
create or replace function public.till_append(p_truck text, p_kind text, p_ref text, p_version integer, p_reason text, p_day date, p_data jsonb)
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
    'trading_day', p_day, 'software_version', v_sv, 'recorded_at', public.till_ts(now()), 'data', p_data)::text;
  v_ph := encode(sha256(convert_to(v_payload, 'UTF8')), 'hex');
  v_hash := encode(sha256(convert_to(v_prev || '|' || v_seq::text || '|' || p_kind || '|' || p_ref || '|' || v_ph, 'UTF8')), 'hex');
  insert into public.till_chain (truck_id, seq, kind, ref, version, payload, payload_hash, prev_hash, hash, software_version)
    values (p_truck, v_seq, p_kind, p_ref, p_version, v_payload, v_ph, v_prev, v_hash, v_sv);
  update public.till_chain_heads set last_seq = v_seq, last_hash = v_hash, updated_at = now() where truck_id = p_truck;
  return v_seq;
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

-- Seal an order that is not sealed yet: lock its row FIRST (the lock order everywhere is: order row, then the truck's head), chain
-- version 1, then stamp sealed_at / sealed_version through an internal update the guard lets through untouched (updated_at kept).
create or replace function public.till_seal_order(p_key uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where order_key = p_key for no key update;
  if not found or o.sealed_version is not null then return false; end if;
  perform public.till_append(o.truck_id, 'order', o.order_key::text, 1, p_reason, o.event_date, public.till_sealed_order(o));
  perform set_config('till.internal', o.order_key::text, true);
  update public.orders set sealed_at = now(), sealed_version = 1 where order_key = p_key;
  perform set_config('till.internal', '', true);
  return true;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5. The triggers on the order tables — 🔴 NONE OF THEM EVER FAILS A SALE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5a. order_payments AFTER INSERT: chain the payment; seal its order at its first payment (Q1).
create or replace function public.till_payment_inserted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old  text;
  v_day  date;
  v_ord  record;
begin
  if not public.till_applies(new.truck_id) then return null; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    select o.order_key, o.event_date, o.sealed_version into v_ord from public.orders o where o.order_key = new.order_key for no key update;
    -- A payment belongs to its order's trading day while that day is open; once it is closed, to the day it is recorded (Q2).
    v_day := case when v_ord.event_date is not null and not public.till_day_closed(new.truck_id, v_ord.event_date) then v_ord.event_date
                  else (now() at time zone public.till_truck_tz(new.truck_id))::date end;
    perform public.till_append(new.truck_id, 'payment', new.id::text, 1, 'recorded', v_day, public.till_sealed_payment(new));
    if v_ord.order_key is not null and v_ord.sealed_version is null then
      perform public.till_seal_order(new.order_key, 'first_payment');
    end if;
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(new.truck_id, 'payment_insert', new.id::text, sqlstate, sqlerrm);
  end;
  return null;
end;
$$;

-- 5b. orders BEFORE INSERT: the seal columns always start empty (whatever an insert names). No lookup, cannot fail.
create or replace function public.till_order_insert_clear()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.sealed_at := null;
  new.sealed_version := null;
  return new;
end;
$$;

-- 5c. orders AFTER INSERT: an order inserted already in a final state is sealed (Q1). AFTER, so an ON CONFLICT DO NOTHING replay that
-- inserts nothing chains nothing.
create or replace function public.till_order_inserted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
begin
  if public.till_fiscal_state(new.status) not in ('collected', 'cancelled', 'rejected') then return null; end if;
  if not public.till_applies(new.truck_id) then return null; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    perform public.till_seal_order(new.order_key, 'final_state');
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(new.truck_id, 'order_insert_seal', new.order_key::text, sqlstate, sqlerrm);
  end;
  return null;
end;
$$;

-- 5d. orders BEFORE UPDATE — THE GUARD (observe mode) and the final-state seal.
--   • not sealed: reaching collected / cancelled / rejected seals it (version 1); anything else passes untouched;
--   • sealed: a change to a sealed field is chained as version n + 1 (never refused). Logged as a would-be refusal when the trading
--     day is closed — except the one-time fill of a missing placed_at (an offline replay), which enforce mode will allow;
--   • the seal columns can be written only by the till itself (any other write to them is undone and logged);
--   • fields outside the sealed form (personal data, notes, line notes, kitchen moves, caches) change freely: retention, account
--     deletion and the dashboard never make a version.
create or replace function public.till_order_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old     text;
  v_s_old   jsonb;
  v_s_new   jsonb;
  v_changed jsonb;
  v_ver     integer;
  v_at      timestamptz;
  v_reason  text;
begin
  if coalesce(current_setting('till.internal', true), '') = new.order_key::text then
    new.updated_at := old.updated_at;   -- the till's own stamp is not an edit
    return new;
  end if;
  if not public.till_applies(new.truck_id) then return new; end if;
  v_ver := old.sealed_version;
  v_at := old.sealed_at;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    if new.sealed_at is distinct from old.sealed_at or new.sealed_version is distinct from old.sealed_version then
      perform public.till_guard_event(new.truck_id, 'orders', 'UPDATE', new.order_key::text, 'would_refuse_seal_columns', jsonb_build_array('sealed_at', 'sealed_version'));
    end if;
    if old.sealed_version is null then
      if public.till_fiscal_state(new.status) in ('collected', 'cancelled', 'rejected') then
        new.sealed_at := null; new.sealed_version := null;
        perform public.till_append(new.truck_id, 'order', new.order_key::text, 1, 'final_state', new.event_date, public.till_sealed_order(new));
        v_ver := 1; v_at := now();
      end if;
    else
      v_s_old := public.till_sealed_order(old);
      v_s_new := public.till_sealed_order(new);
      if v_s_new::text is distinct from v_s_old::text then
        select coalesce(jsonb_agg(k.key order by k.key), '[]'::jsonb) into v_changed
          from (select key from jsonb_each(v_s_new) union select key from jsonb_each(v_s_old)) k
         where (v_s_new -> k.key) is distinct from (v_s_old -> k.key) or (v_s_new -> k.key)::text is distinct from (v_s_old -> k.key)::text;
        v_ver := old.sealed_version + 1;
        -- 'state_change' = only the state moved (accepted → collected, an undo, a cancel; collected_at; the placed_at fill); else 'edit'
        v_reason := case when v_changed <@ '["fiscal_state", "collected_at", "placed_at"]'::jsonb then 'state_change' else 'edit' end
                    || case when public.till_day_closed(new.truck_id, old.event_date) then '_after_close' else '' end;
        perform public.till_append(new.truck_id, 'order', new.order_key::text, v_ver, v_reason, new.event_date, v_s_new);
        if public.till_day_closed(new.truck_id, old.event_date) and v_changed <> '["placed_at"]'::jsonb then
          perform public.till_guard_event(new.truck_id, 'orders', 'UPDATE', new.order_key::text, 'would_refuse_after_close', jsonb_build_object('fields', v_changed));
        end if;
      end if;
    end if;
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    v_ver := old.sealed_version; v_at := old.sealed_at;
    perform public.till_log_failure(new.truck_id, 'order_update', new.order_key::text, sqlstate, sqlerrm);
  end;
  new.sealed_version := v_ver;
  new.sealed_at := v_at;
  return new;
end;
$$;

-- 5e. orders BEFORE DELETE (observe): a sealed order's delete is logged and chained as a 'deletion' entry, then allowed.
create or replace function public.till_order_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
begin
  if old.sealed_version is null or not public.till_applies(old.truck_id) then return old; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    perform public.till_append(old.truck_id, 'deletion', old.order_key::text, null, 'observed_delete', old.event_date,
      jsonb_build_object('table', 'orders', 'ref', old.order_key::text, 'sealed_version', old.sealed_version));
    perform public.till_guard_event(old.truck_id, 'orders', 'DELETE', old.order_key::text, 'would_refuse_delete', null);
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(old.truck_id, 'order_delete', old.order_key::text, sqlstate, sqlerrm);
  end;
  return old;
end;
$$;

-- 5f. order_payments BEFORE UPDATE (observe): a change to a chained payment's sealed fields is chained as a new version and logged
-- (enforce mode will refuse it). The fee fills (application_fee_minor / _refunded_minor) are not sealed and pass silently.
create or replace function public.till_payment_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old  text;
  v_last integer;
  v_s_new jsonb;
  v_s_old jsonb;
begin
  if not public.till_applies(new.truck_id) then return new; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    v_s_old := public.till_sealed_payment(old);
    v_s_new := public.till_sealed_payment(new);
    if v_s_new::text is distinct from v_s_old::text then
      perform 1 from public.orders o where o.order_key = old.order_key for no key update;
      select max(c.version) into v_last from public.till_chain c where c.truck_id = old.truck_id and c.kind = 'payment' and c.ref = old.id::text;
      if v_last is not null then
        perform public.till_append(new.truck_id, 'payment', new.id::text, v_last + 1, 'changed', (now() at time zone public.till_truck_tz(new.truck_id))::date, v_s_new);
      end if;
      perform public.till_guard_event(new.truck_id, 'order_payments', 'UPDATE', new.id::text, 'would_refuse_payment_change',
        (select jsonb_build_object('fields', coalesce(jsonb_agg(k.key order by k.key), '[]'::jsonb)) from jsonb_each(v_s_new) k where (v_s_new -> k.key)::text is distinct from (v_s_old -> k.key)::text));
    end if;
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(new.truck_id, 'payment_update', new.id::text, sqlstate, sqlerrm);
  end;
  return new;
end;
$$;

-- 5g. order_payments BEFORE DELETE (observe): every till truck's payment delete is logged (enforce mode will refuse it — corrections
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
  if not public.till_applies(old.truck_id) then return old; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    perform 1 from public.orders o where o.order_key = old.order_key for no key update;
    v_chained := exists (select 1 from public.till_chain c where c.truck_id = old.truck_id and c.kind = 'payment' and c.ref = old.id::text);
    if v_chained then
      perform public.till_append(old.truck_id, 'deletion', old.id::text, null, 'observed_delete', (now() at time zone public.till_truck_tz(old.truck_id))::date,
        jsonb_build_object('table', 'order_payments', 'ref', old.id::text, 'order_key', old.order_key));
    end if;
    perform public.till_guard_event(old.truck_id, 'order_payments', 'DELETE', old.id::text, case when v_chained then 'would_refuse_delete' else 'would_refuse_delete_unchained' end, null);
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(old.truck_id, 'payment_delete', old.id::text, sqlstate, sqlerrm);
  end;
  return old;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 6. Append-only: till_chain and action_audit_log (these DO raise — they are not on an order table, and nothing writes them that way)
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
-- 7. Verify, and the baseline (built, not run)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- till_verify(truck): the chain (gap-free seq, links, both hashes, the head) and the rows against their latest sealed entry (every sealed
-- order and chained payment still matches it, or has a 'deletion' entry). Unsealed / unchained rows are counted, not failed (the
-- baseline seals the history). Read-only.
create or replace function public.till_verify(p_truck text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r          record;
  ro         public.orders;
  v_prev     text := repeat('0', 64);
  v_next     bigint := 1;
  v_n        bigint := 0;
  v_gaps     integer := 0;
  v_links    integer := 0;
  v_phash    integer := 0;
  v_hash     integer := 0;
  v_hseq     bigint;
  v_hhash    text;
  v_head_ok  boolean;
  v_mis      jsonb := '[]'::jsonb;
  v_lver     integer;
  v_lpay     text;
  v_lseq     bigint;
  v_unsealed integer;
  v_unchained integer;
begin
  for r in select * from public.till_chain c where c.truck_id = p_truck order by c.seq loop
    v_n := v_n + 1;
    if r.seq <> v_next then v_gaps := v_gaps + 1; end if;
    if r.prev_hash <> v_prev then v_links := v_links + 1; end if;
    if encode(sha256(convert_to(r.payload, 'UTF8')), 'hex') <> r.payload_hash then v_phash := v_phash + 1; end if;
    if encode(sha256(convert_to(r.prev_hash || '|' || r.seq::text || '|' || r.kind || '|' || r.ref || '|' || r.payload_hash, 'UTF8')), 'hex') <> r.hash then v_hash := v_hash + 1; end if;
    v_prev := r.hash;
    v_next := r.seq + 1;
  end loop;
  select h.last_seq, h.last_hash into v_hseq, v_hhash from public.till_chain_heads h where h.truck_id = p_truck;
  v_head_ok := (v_n = 0 and (v_hseq is null or v_hseq = 0)) or (v_hseq = v_next - 1 and v_hhash = v_prev);

  -- every sealed order: its latest 'order' entry is its sealed_version and equals its sealed form now
  for ro in select o.* from public.orders o where o.truck_id = p_truck and o.sealed_version is not null loop
    v_lver := null; v_lpay := null;
    select c.version, c.payload into v_lver, v_lpay from public.till_chain c where c.truck_id = p_truck and c.kind = 'order' and c.ref = ro.order_key::text order by c.seq desc limit 1;
    if v_lpay is null then
      v_mis := v_mis || jsonb_build_object('ref', ro.order_key, 'kind', 'order', 'problem', 'sealed but no entry');
    elsif v_lver is distinct from ro.sealed_version then
      v_mis := v_mis || jsonb_build_object('ref', ro.order_key, 'kind', 'order', 'problem', 'version differs');
    elsif ((v_lpay::jsonb) -> 'data')::text is distinct from public.till_sealed_order(ro)::text then
      v_mis := v_mis || jsonb_build_object('ref', ro.order_key, 'kind', 'order', 'problem', 'row differs from its sealed form');
    end if;
  end loop;
  -- every order with entries but no row (or no seal) must have a 'deletion' entry after its last version
  for r in select distinct c.ref from public.till_chain c where c.truck_id = p_truck and c.kind = 'order'
             and not exists (select 1 from public.orders o where o.order_key::text = c.ref and o.sealed_version is not null) loop
    if not exists (select 1 from public.till_chain d where d.truck_id = p_truck and d.kind = 'deletion' and d.ref = r.ref
                    and d.seq > (select max(c2.seq) from public.till_chain c2 where c2.truck_id = p_truck and c2.kind = 'order' and c2.ref = r.ref)) then
      v_mis := v_mis || jsonb_build_object('ref', r.ref, 'kind', 'order', 'problem', 'row gone or unsealed, no deletion entry');
    end if;
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
  select count(*) into v_unsealed from public.orders o where o.truck_id = p_truck and o.sealed_version is null and public.till_fiscal_state(o.status) <> 'pending';
  select count(*) into v_unchained from public.order_payments p where p.truck_id = p_truck
     and not exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.kind = 'payment' and c.ref = p.id::text);

  return jsonb_build_object(
    'truck_id', p_truck, 'ok', v_gaps = 0 and v_links = 0 and v_phash = 0 and v_hash = 0 and coalesce(v_head_ok, false) and jsonb_array_length(v_mis) = 0,
    'entries', v_n, 'gaps', v_gaps, 'bad_links', v_links, 'bad_payload_hashes', v_phash, 'bad_hashes', v_hash, 'head_ok', coalesce(v_head_ok, false),
    'mismatches', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(v_mis) x limit 50) y),
    'mismatch_count', jsonb_array_length(v_mis),
    'unsealed_orders', v_unsealed, 'unchained_payments', v_unchained);
end;
$$;

-- till_baseline(truck or NULL = every till truck): seal every existing accepted / final order and chain every existing payment once,
-- as 'baseline' entries (their state that day — marked as not sealed at the time). Idempotent: only unsealed orders and unchained
-- payments. 🔴 BUILT, NOT RUN (Q8): it runs after the next deploy, in a later prompt. Each order it seals makes one realtime UPDATE event.
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
    for o in select x.order_key from public.orders x where x.truck_id = t.id and x.sealed_version is null and public.till_fiscal_state(x.status) <> 'pending'
               order by x.created_at, x.order_key loop
      if public.till_seal_order(o.order_key, 'baseline') then v_orders := v_orders + 1; end if;
    end loop;
    for p in select y.* from public.order_payments y where y.truck_id = t.id
               and not exists (select 1 from public.till_chain c where c.truck_id = t.id and c.kind = 'payment' and c.ref = y.id::text)
               order by y.created_at, y.id loop
      perform public.till_append(t.id, 'payment', p.id::text, 1, 'baseline',
        coalesce((select x.event_date from public.orders x where x.order_key = p.order_key), (p.created_at at time zone public.till_truck_tz(t.id))::date),
        public.till_sealed_payment(p));
      v_pays := v_pays + 1;
    end loop;
  end loop;
  return jsonb_build_object('trucks', v_trucks, 'orders_sealed', v_orders, 'payments_chained', v_pays);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 8. Who may call what: the triggers' functions and the writers — nobody but the owner; till_verify — the service role too.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- One statement per function (the repo guard scripts/migration-function-grants.cjs reads one signature per revoke).
revoke all on function public.till_ts(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.till_fiscal_state(text) from public, anon, authenticated, service_role;
revoke all on function public.till_pick(jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function public.till_pick_all(jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function public.till_sealed_lines(jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.till_sealed_order(public.orders) from public, anon, authenticated, service_role;
revoke all on function public.till_sealed_payment(public.order_payments) from public, anon, authenticated, service_role;
revoke all on function public.till_applies(text) from public, anon, authenticated, service_role;
revoke all on function public.till_truck_tz(text) from public, anon, authenticated, service_role;
revoke all on function public.till_day_closed(text, date) from public, anon, authenticated, service_role;
revoke all on function public.till_append(text, text, text, integer, text, date, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.till_log_failure(text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.till_guard_event(text, text, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.till_seal_order(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.till_payment_inserted() from public, anon, authenticated, service_role;
revoke all on function public.till_order_insert_clear() from public, anon, authenticated, service_role;
revoke all on function public.till_order_inserted() from public, anon, authenticated, service_role;
revoke all on function public.till_order_guard() from public, anon, authenticated, service_role;
revoke all on function public.till_order_delete_guard() from public, anon, authenticated, service_role;
revoke all on function public.till_payment_guard() from public, anon, authenticated, service_role;
revoke all on function public.till_payment_delete_guard() from public, anon, authenticated, service_role;
revoke all on function public.till_refuse_change() from public, anon, authenticated, service_role;
revoke all on function public.till_verify(text) from public, anon, authenticated, service_role;
revoke all on function public.till_baseline(text) from public, anon, authenticated, service_role;
grant execute on function public.till_verify(text) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 9. The triggers. Created only when missing (no drop): safe to run twice. Names sort after the existing triggers, so each sees the
--    row as the receipt-number, currency and VAT-regime triggers left it.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'order_payments_till_chain' and tgrelid = 'public.order_payments'::regclass) then
    create trigger order_payments_till_chain after insert on public.order_payments for each row execute function public.till_payment_inserted();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'order_payments_till_guard' and tgrelid = 'public.order_payments'::regclass) then
    create trigger order_payments_till_guard before update on public.order_payments for each row execute function public.till_payment_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'order_payments_till_guard_delete' and tgrelid = 'public.order_payments'::regclass) then
    create trigger order_payments_till_guard_delete before delete on public.order_payments for each row execute function public.till_payment_delete_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_till_clear' and tgrelid = 'public.orders'::regclass) then
    create trigger orders_till_clear before insert on public.orders for each row execute function public.till_order_insert_clear();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_till_seal' and tgrelid = 'public.orders'::regclass) then
    create trigger orders_till_seal after insert on public.orders for each row execute function public.till_order_inserted();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_till_guard' and tgrelid = 'public.orders'::regclass) then
    create trigger orders_till_guard before update on public.orders for each row execute function public.till_order_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_till_guard_delete' and tgrelid = 'public.orders'::regclass) then
    create trigger orders_till_guard_delete before delete on public.orders for each row execute function public.till_order_delete_guard();
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
-- 1. The five tables, RLS on:
--   select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname like 'till\_%' and relkind = 'r' order by 1;
-- 2. The two columns, nullable, no default:
--   select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name like 'sealed\_%';
-- 3. The triggers:
--   select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and t.tgname like '%till%' or t.tgname like 'action_audit_log_%' order by 1, 2;
-- 4. place_order_atomic_v2 untouched, guard mode observe, nothing chained yet:
--   select md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)), (select guard_mode from public.till_settings), (select count(*) from public.till_chain);
