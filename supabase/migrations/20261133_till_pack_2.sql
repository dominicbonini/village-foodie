-- 20261133_till_pack_2.sql
-- till-pack-2 (25 November 2026, docs/till-pack-2-report.md; the plan: docs/till-pack-0-report.md §3, §7, §8 till-pack-2; the law check:
-- docs/till-law-1-report.md §3 change 8). REVERSALS INSTEAD OF DELETES, COUNTER REFUNDS, DEVICE FINGERPRINTS, THE ACTOR'S ROLE.
--
-- ✅ CLASSIFICATION: ADDITIVE AND BACKWARD-COMPATIBLE WITH THE DEPLOYED CODE (origin/main):
--    • order_payments gains two NULLABLE columns, no default (no row is rewritten or written):
--        reverses_payment_id uuid → order_payments(id) ON DELETE CASCADE — set only on a REVERSAL row;
--        reason text — a short machine word (undo_collected, undo_mark_paid, refund_failed, order_cancelled, a refund reason …), never
--        free text (checked: lower-case letters and underscores only).
--    • its kind check is WIDENED: charge | refund | REVERSAL. A reversal row points at the payment it cancels (one reversal per payment, a
--      unique partial index), and only a reversal points. 🔴 WHY A NEW KIND: every reader of order_payments in the deployed code filters
--      `kind === 'charge'` / `kind === 'refund'` by name (lib/payments/ledger.ts getOrderBalance and every other), so the deployed code
--      IGNORES a reversal row rather than reading it as a refund. Reversal rows come only from the new code, so none exists until it is
--      deployed (report §3 says what the deployed code would show if one did).
--    • ON DELETE CASCADE on the pointer: the deployed undo DELETEs its charge row; if a reversal of that row ever existed (a code rollback after
--      the new code ran), the pair goes together instead of the delete failing on the foreign key.
--    • two NEW till tables, append-only, RLS on, nothing for anon / authenticated, written only through the functions below:
--        till_device_fingerprints — the device id, the device's sha256 fingerprint and its creation time of an OFFLINE walk-up (law change
--          8), stored BEFORE the order row so the order's first sealed version carries it; till_till_id then prefers the device id over
--          'manual';
--        till_entry_actors — the actor's ROLE (owner / staff / admin / system / unknown — never a name or an id) behind a chain entry made by
--          an edit, an undo, a reversal or a refund, linked by (truck_id, seq).
--    • the sealed forms gain keys ONLY WHERE THE NEW DATA EXISTS: an order with a device fingerprint gains `device`; a payment with a pointer
--      or a reason gains `reverses_payment_id` / `reason`. Every other order and payment seals byte-for-byte as before, so no chain entry
--      written before this migration stops matching (till_verify).
--    • place_order_atomic_v2 is NOT touched (md5 e4b273abcf8e7609c6ca54033ed59332). No existing row of any table is updated or deleted.
--
-- VERIFY AFTER APPLYING: the read-only block at the end of this file, then scripts/db-rollback-proofs.cjs --till-2-check.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. order_payments: the pointer, the reason, the widened kind
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.order_payments add column if not exists reverses_payment_id uuid references public.order_payments (id) on delete cascade;
alter table public.order_payments add column if not exists reason text;
comment on column public.order_payments.reverses_payment_id is 'till-pack-2: on a kind = ''reversal'' row, the payment row it cancels (an undo of a counter collection, a refund that failed). Every reader treats the pair as nothing. NULL on every other row.';
comment on column public.order_payments.reason is 'till-pack-2: why a reversal or a refund was recorded — a short machine word, never free text.';

alter table public.order_payments drop constraint if exists order_payments_kind_chk;
alter table public.order_payments add constraint order_payments_kind_chk check (kind = any (array['charge'::text, 'refund'::text, 'reversal'::text]));
alter table public.order_payments add constraint order_payments_reversal_points_chk check ((kind = 'reversal') = (reverses_payment_id is not null));
alter table public.order_payments add constraint order_payments_reason_word_chk check (reason is null or reason ~ '^[a-z_]{1,40}$');
create unique index if not exists order_payments_one_reversal_uidx on public.order_payments (reverses_payment_id) where reverses_payment_id is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The two till tables
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.till_device_fingerprints (
  order_key         uuid primary key,
  truck_id          text not null,
  device_id         text not null check (device_id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  fingerprint       text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  device_created_at timestamptz not null,
  recorded_at       timestamptz not null default now()
);
comment on table public.till_device_fingerprints is 'till-pack-2 (law change 8): an OFFLINE walk-up''s device evidence — the device''s stable id, the sha256 the device computed over the order''s canonical content and its creation time (lib/till/device-fingerprint.ts), and that time. Written once, BEFORE the order row, by till_record_device(); sealed into the order''s chain entries. APPEND-ONLY. No foreign key.';

create table if not exists public.till_entry_actors (
  truck_id    text not null,
  seq         bigint not null,
  role        text not null check (role in ('owner', 'staff', 'admin', 'system', 'unknown')),
  action      text not null check (action ~ '^[a-z_]{1,40}$'),
  recorded_at timestamptz not null default now(),
  primary key (truck_id, seq)
);
comment on table public.till_entry_actors is 'till-pack-2: the ROLE of whoever made a correction (edit, undo, reversal, refund) behind a till_chain entry (truck_id, seq) — owner / staff / admin / system / unknown; never a name or an id (those stay in action_audit_log). APPEND-ONLY. Written only by till_record_actor().';

alter table public.till_device_fingerprints enable row level security;
alter table public.till_entry_actors        enable row level security;
revoke all on public.till_device_fingerprints, public.till_entry_actors from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.till_device_fingerprints from service_role;
revoke insert, update, delete, truncate, references, trigger on public.till_entry_actors from service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The writers the routes call (service role only), and the head they read
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- An offline walk-up's device evidence, stored BEFORE its order row exists (so the order's first sealed version carries it). Nothing is
-- stored for a truck outside the till, or for an order that already exists (a replay of an order an older app already synced: its sealed
-- form must not change). Returns true when a row was written.
create or replace function public.till_record_device(p_order_key uuid, p_truck text, p_device_id text, p_fingerprint text, p_device_created_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if p_order_key is null or not public.till_applies(p_truck) then return false; end if;
  if exists (select 1 from public.orders o where o.order_key = p_order_key) then return false; end if;
  insert into public.till_device_fingerprints (order_key, truck_id, device_id, fingerprint, device_created_at)
    values (p_order_key, p_truck, p_device_id, p_fingerprint, p_device_created_at)
    on conflict (order_key) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- The truck's chain head, so a route can say "the entries after this one are mine" (till_record_actor).
create or replace function public.till_head_seq(p_truck text)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select coalesce((select h.last_seq from public.till_chain_heads h where h.truck_id = p_truck), 0) $$;

-- The actor's role behind the chain entries a route's correction made: every entry of the truck after `p_from_seq` that belongs to the order —
-- its versions and its deletion (ref = the order key), its payments, reversals, refunds and their deletions (the sealed data's order_key).
-- Never overwrites (an entry keeps the first role recorded for it). Returns how many entries it named.
create or replace function public.till_record_actor(p_truck text, p_from_seq bigint, p_order_key uuid, p_action text, p_role text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  insert into public.till_entry_actors (truck_id, seq, role, action)
    select c.truck_id, c.seq, p_role, p_action from public.till_chain c
     where c.truck_id = p_truck and c.seq > coalesce(p_from_seq, 0)
       and (c.ref = p_order_key::text or (c.kind in ('payment', 'deletion') and (c.payload::jsonb -> 'data' ->> 'order_key') = p_order_key::text))
    on conflict (truck_id, seq) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. The sealed forms — new keys only where the new data exists
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 THE TILL NUMBER, now: the van's id when the order has one; 'web' for an online order with no van; the DEVICE's id for an offline walk-up
-- that sent one (law change 8); else the source the order records ('manual'); 'unrecorded' if even that is empty.
create or replace function public.till_till_id(o public.orders)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when o.van_id is not null then o.van_id::text
              when o.source = 'web' then 'web'
              else coalesce((select d.device_id from public.till_device_fingerprints d where d.order_key = o.order_key),
                            nullif(btrim(o.source), ''), 'unrecorded') end
$$;

-- The sealed order: exactly till-pack-1b's 37 fields, plus `device` {device_id, fingerprint, created_at} when the order has device evidence.
create or replace function public.till_sealed_order(o public.orders)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v  jsonb := public.till_vat(o);
  si jsonb := public.till_sealed_lines(o.items, 'item');
  sd jsonb := public.till_sealed_lines(o.deals, 'deal');
  dv jsonb;
begin
  if jsonb_typeof(si) = 'array' then
    si := coalesce((select jsonb_agg(case when jsonb_typeof(x.e) = 'object' then x.e || coalesce(v -> 'items' -> (x.n - 1)::integer, '{}'::jsonb) else x.e end order by x.n)
                      from jsonb_array_elements(si) with ordinality x(e, n)), '[]'::jsonb);
  end if;
  if jsonb_typeof(sd) = 'array' then
    sd := coalesce((select jsonb_agg(case when jsonb_typeof(x.e) = 'object' then x.e || jsonb_build_object('vat_parts', coalesce(v -> 'deals' -> (x.n - 1)::integer, '[]'::jsonb)) else x.e end order by x.n)
                      from jsonb_array_elements(sd) with ordinality x(e, n)), '[]'::jsonb);
  end if;
  select jsonb_build_object('device_id', d.device_id, 'fingerprint', d.fingerprint, 'created_at', public.till_ts(d.device_created_at)) into dv
    from public.till_device_fingerprints d where d.order_key = o.order_key;
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
    'till_id', public.till_till_id(o), 'vat_basis', v ->> 'basis', 'vat_summary', v -> 'summary')
    || case when dv is null then '{}'::jsonb else jsonb_build_object('device', dv) end;
end;
$$;

-- The sealed payment: till-pack-0's 12 fields, plus reverses_payment_id / reason on a row that has them.
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
    || case when p.reverses_payment_id is null then '{}'::jsonb else jsonb_build_object('reverses_payment_id', p.reverses_payment_id) end
    || case when p.reason is null then '{}'::jsonb else jsonb_build_object('reason', p.reason) end
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Who may call what
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- One statement per function (scripts/migration-function-grants.cjs reads one signature per revoke).
revoke all on function public.till_record_device(uuid, text, text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.till_head_seq(text) from public, anon, authenticated, service_role;
revoke all on function public.till_record_actor(text, bigint, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.till_till_id(public.orders) from public, anon, authenticated, service_role;
revoke all on function public.till_sealed_order(public.orders) from public, anon, authenticated, service_role;
revoke all on function public.till_sealed_payment(public.order_payments) from public, anon, authenticated, service_role;
grant execute on function public.till_record_device(uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.till_head_seq(text) to service_role;
grant execute on function public.till_record_actor(text, bigint, uuid, text, text) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 6. The new tables are append-only (the refusal function is till-pack-1's)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'till_device_fingerprints_append_only' and tgrelid = 'public.till_device_fingerprints'::regclass) then
    create trigger till_device_fingerprints_append_only before update or delete on public.till_device_fingerprints for each row execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_device_fingerprints_no_truncate' and tgrelid = 'public.till_device_fingerprints'::regclass) then
    create trigger till_device_fingerprints_no_truncate before truncate on public.till_device_fingerprints for each statement execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_entry_actors_append_only' and tgrelid = 'public.till_entry_actors'::regclass) then
    create trigger till_entry_actors_append_only before update or delete on public.till_entry_actors for each row execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_entry_actors_no_truncate' and tgrelid = 'public.till_entry_actors'::regclass) then
    create trigger till_entry_actors_no_truncate before truncate on public.till_entry_actors for each statement execute function public.till_refuse_change();
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only). Run after the block above.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The columns and the checks:
--   select column_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'order_payments' and column_name in ('reverses_payment_id', 'reason');
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.order_payments'::regclass and conname like 'order_payments_%chk' order by 1;
-- 2. No reversal yet, the two till tables empty, place_order_atomic_v2 untouched:
--   select (select count(*) from public.order_payments where kind = 'reversal'), (select count(*) from public.till_device_fingerprints), (select count(*) from public.till_entry_actors), md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure));
