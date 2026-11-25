-- 20261140_till_pack_4.sql
-- till-pack-4 (25 November 2026, docs/till-pack-4-report.md; the plan: docs/till-pack-0-report.md §5 E and §8 till-pack-4; the law check:
-- docs/till-law-1-report.md §2 point 2, §3 changes 9–11). THE CLOSES (day, month, year), SIGNED, AND WHAT THE GUARD NEEDS BEFORE IT ENFORCES.
-- The guard stays in OBSERVE mode.
--
-- ✅ CLASSIFICATION: ADDITIVE AND BACKWARD-COMPATIBLE WITH THE DEPLOYED CODE (origin/main):
--    • NEW tables (RLS on, nothing for anon / authenticated, no writes for the service role; the two record tables APPEND-ONLY):
--        till_closes            one row per close — truck, day / month / year, the period, its figures (totals jsonb), the grand totals,
--                               the chain head it closed at, its own chain entry (seq, hash), the software version;
--        till_close_signatures  the Ed25519 signature of a close's chain hash (law change 11) — the key lives OUTSIDE the database;
--        till_truck_settings    per truck: the fiscal year end (law change 9 — NULL = the country's tax year) and how far the day closes
--                               have scanned (a day with no activity gets no close, Q12).
--    • till_settings gains signing_public_key / signing_key_id (NULL until the signing key is first used).
--    • NEW functions, called by lib/till/close-run.ts (the cron /api/cron/till-close) with the service role:
--        till_close_context, till_close_commit (ONE transaction: seal the day's leftovers, write the close, chain it, run till_verify
--        and chain its result as an 'event'), till_mark_scanned, till_register_signing_key, till_sign_close;
--      and till_correction_check (Part B: what the guard WOULD refuse — nothing in observe mode).
--    • REPLACED (create or replace; no signature or grant change): till_order_guard — an event / van deletion's FK SET NULL is allowed
--      (the id went NULL and its event / van is gone: no version, no would-be refusal); till_verify — such an order compares with the event / van it was sealed with, and every close
--      must be the chain entry it names.
--    • NOTHING is written to any existing row of any table. place_order_atomic_v2 is NOT touched (md5 e4b273abcf8e7609c6ca54033ed59332).
--      Nothing raises a new refusal: HGT02–HGT04 stay reserved for till-pack-3; the closes' own refusals are HGT20–HGT22 (below).
--
-- VERIFY AFTER APPLYING: the read-only block at the end of this file, then scripts/db-rollback-proofs.cjs --till-4-check and --till-1-check.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The tables
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.till_settings add column if not exists signing_public_key text;
alter table public.till_settings add column if not exists signing_key_id text;
comment on column public.till_settings.signing_public_key is 'till-pack-4: the Ed25519 public key (SPKI DER, base64) whose private half — the server-only TILL_SIGNING_KEY — signs every close. Registered on its first use; never changed silently (till_register_signing_key refuses a different one).';

create table if not exists public.till_truck_settings (
  truck_id              text primary key,
  fiscal_year_end_month smallint check (fiscal_year_end_month between 1 and 12),
  fiscal_year_end_day   smallint check (fiscal_year_end_day between 1 and 31),
  days_scanned_through  date,
  updated_at            timestamptz not null default now(),
  check ((fiscal_year_end_month is null) = (fiscal_year_end_day is null))
);
comment on table public.till_truck_settings is 'till-pack-4: per truck — the fiscal year END (law change 9; NULL = the day before its country''s tax year start, else 31 December) and the last trading day the day closes have scanned (a day with no activity gets no close, Q12). Written only by the till functions.';

create table if not exists public.till_closes (
  id                 bigserial primary key,
  truck_id           text not null,
  period_type        text not null check (period_type in ('day', 'month', 'year')),
  period_start       date not null,
  period_end         date not null check (period_end >= period_start),
  time_zone          text not null,
  currency           text,
  totals             jsonb not null,
  gt_incl_minor      bigint not null,
  gt_excl_minor      bigint not null,
  gt_abs_minor       bigint not null,
  gt_period_minor    bigint not null,
  till_started_at    timestamptz,
  chain_head_seq     bigint not null,
  chain_head_hash    text not null,
  seq                bigint not null,
  hash               text not null check (hash ~ '^[0-9a-f]{64}$'),
  software_version   text not null,
  signing_at_commit  text not null check (signing_at_commit in ('unsigned', 'pending')),
  created_at         timestamptz not null default now(),
  unique (truck_id, period_type, period_start)
);
comment on table public.till_closes is 'till-pack-4: APPEND-ONLY. The till''s closes — day (after 06:00 on D + 1, truck time, only when D had activity), month and year (always, even at zero). totals = lib/till/close.ts computeDayClose / computePeriodClose (the day''s per-rate lines ARE the daily-totals file''s). Each close is also a chain entry (kind ''close'', seq / hash here). Written only by till_close_commit.';

create table if not exists public.till_close_signatures (
  truck_id   text not null,
  seq        bigint not null,
  key_id     text not null,
  signature  text not null,
  signed_at  timestamptz not null default now(),
  primary key (truck_id, seq)
);
comment on table public.till_close_signatures is 'till-pack-4 (law change 11): APPEND-ONLY. The Ed25519 signature (base64) of a close''s chain hash (the 64 hex characters, as UTF-8 bytes), by the key named key_id (till_settings). A close with no row here is UNSIGNED; the next run signs it once TILL_SIGNING_KEY is set.';

alter table public.till_truck_settings   enable row level security;
alter table public.till_closes           enable row level security;
alter table public.till_close_signatures enable row level security;
revoke all on public.till_truck_settings, public.till_closes, public.till_close_signatures from anon, authenticated;
revoke all on sequence public.till_closes_id_seq from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.till_truck_settings from service_role;
revoke insert, update, delete, truncate, references, trigger on public.till_closes from service_role;
revoke insert, update, delete, truncate, references, trigger on public.till_close_signatures from service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The close
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- What the runner needs to decide what is due: is the truck in the till; when its till started (the till_start event); its clock; its
-- fiscal year end (its own, or its country's tax year start); how far the day closes have scanned; its closes so far.
create or replace function public.till_close_context(p_truck text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'now', now(),
    'applies', public.till_applies(p_truck),
    'till_started_at', (select c.created_at from public.till_chain c where c.truck_id = p_truck and c.seq = 1 and c.kind = 'event' and c.ref = 'till_start'),
    'time_zone', public.till_truck_tz(p_truck),
    'currency', (select t.currency from public.trucks t where t.id = p_truck),
    'fiscal_year_end', (select jsonb_build_object('month', s.fiscal_year_end_month, 'day', s.fiscal_year_end_day) from public.till_truck_settings s where s.truck_id = p_truck),
    'country_tax_year_start', (select jsonb_build_object('month', cs.tax_year_start_month, 'day', cs.tax_year_start_day) from public.trucks t join public.country_settings cs on cs.country_code = t.country where t.id = p_truck),
    'days_scanned_through', (select s.days_scanned_through from public.till_truck_settings s where s.truck_id = p_truck),
    'signing_key_id', (select s.signing_key_id from public.till_settings s where s.id),
    'closes', coalesce((select jsonb_agg(jsonb_build_object('type', x.period_type, 'period_start', x.period_start, 'period_end', x.period_end, 'seq', x.seq, 'hash', x.hash,
                 'totals', x.totals, 'signed', exists (select 1 from public.till_close_signatures g where g.truck_id = x.truck_id and g.seq = x.seq)) order by x.period_end, x.period_type)
               from public.till_closes x where x.truck_id = p_truck), '[]'::jsonb))
$$;

-- The day closes have looked at every trading day up to p_day (a day with no activity gets no close).
create or replace function public.till_mark_scanned(p_truck text, p_day date)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.till_truck_settings (truck_id, days_scanned_through) values (p_truck, p_day)
  on conflict (truck_id) do update set days_scanned_through = greatest(coalesce(public.till_truck_settings.days_scanned_through, excluded.days_scanned_through), excluded.days_scanned_through), updated_at = now()
$$;

-- 🔴 THE CLOSE, IN ONE TRANSACTION. Refusals (the run retries the next hour): HGT20 — outside the till, not yet due, or ALREADY CLOSED;
-- HGT21 — a row it was computed from changed since (p_computed_at), so the figures could be stale. Then: seal the day's leftover orders
-- (p_seal_keys, through till_seal — reason 'day_close'), write the close and its chain entry (kind 'close'), run till_verify and chain its
-- result as an 'event' (type 'verify'). Returns the close's seq and hash (what the runner signs), the head it closed at, and the verify result.
create or replace function public.till_close_commit(p_truck text, p_type text, p_start date, p_end date, p_currency text, p_computed_at timestamptz,
                                                    p_input_keys uuid[], p_seal_keys uuid[], p_totals jsonb, p_key_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz      text := public.till_truck_tz(p_truck);
  v_sv      text;
  v_head    bigint;
  v_hhash   text;
  v_seq     bigint;
  v_hash    text;
  v_sealed  integer := 0;
  v_started timestamptz;
  v_ver     jsonb;
  v_vseq    bigint;
  k         uuid;
  v_gt      jsonb := p_totals -> 'gt';
begin
  if not public.till_applies(p_truck) then raise exception 'till close: % is outside the till', p_truck using errcode = 'HGT20'; end if;
  if p_type not in ('day', 'month', 'year') or p_end < p_start then raise exception 'till close: bad period % % %', p_type, p_start, p_end using errcode = 'HGT20'; end if;
  if now() < ((p_end + 1) + time '06:00') at time zone v_tz then raise exception 'till close: % % is not due yet', p_type, p_start using errcode = 'HGT20'; end if;
  insert into public.till_chain_heads (truck_id, last_seq, last_hash) values (p_truck, 0, repeat('0', 64)) on conflict (truck_id) do nothing;
  perform 1 from public.till_chain_heads h where h.truck_id = p_truck for update;
  if exists (select 1 from public.till_closes x where x.truck_id = p_truck and x.period_type = p_type and x.period_start = p_start) then
    raise exception 'till close: % % is already closed', p_type, p_start using errcode = 'HGT20';
  end if;
  if exists (select 1 from public.orders o where o.order_key = any (coalesce(p_input_keys, '{}')) and o.updated_at > p_computed_at)
     or exists (select 1 from public.order_payments p where p.order_key = any (coalesce(p_input_keys, '{}')) and p.created_at > p_computed_at) then
    raise exception 'till close: % % — its rows changed after it was computed', p_type, p_start using errcode = 'HGT21';
  end if;
  if p_type = 'day' then
    foreach k in array coalesce(p_seal_keys, '{}') loop
      -- only an order past 'pending' is sealed (pack-1b: an order seals at acceptance; a pending one is not a sale yet)
      if not exists (select 1 from public.till_order_seals s where s.order_key = k)
         and exists (select 1 from public.orders o where o.order_key = k and o.truck_id = p_truck and public.till_fiscal_state(o.status) <> 'pending') then
        if public.till_seal(k, 'day_close') = 1 then v_sealed := v_sealed + 1; end if;
      end if;
    end loop;
  end if;
  select h.last_seq, h.last_hash into v_head, v_hhash from public.till_chain_heads h where h.truck_id = p_truck;
  select s.software_version into v_sv from public.till_settings s where s.id;
  v_started := (select c.created_at from public.till_chain c where c.truck_id = p_truck and c.seq = 1);
  v_seq := public.till_append(p_truck, 'close', p_type || ':' || p_start::text, null, 'close', p_end,
    p_totals || jsonb_build_object('period_type', p_type, 'period_start', p_start, 'period_end', p_end, 'time_zone', v_tz, 'currency', p_currency,
      'till_started_at', public.till_ts(v_started), 'chain_head', jsonb_build_object('seq', v_head, 'hash', v_hhash), 'sealed_at_close', v_sealed,
      'signing', case when p_key_id is null then to_jsonb('unsigned'::text) else jsonb_build_object('key_id', p_key_id) end), null);
  select c.hash into v_hash from public.till_chain c where c.truck_id = p_truck and c.seq = v_seq;
  insert into public.till_closes (truck_id, period_type, period_start, period_end, time_zone, currency, totals, gt_incl_minor, gt_excl_minor, gt_abs_minor,
      gt_period_minor, till_started_at, chain_head_seq, chain_head_hash, seq, hash, software_version, signing_at_commit)
    values (p_truck, p_type, p_start, p_end, v_tz, p_currency, p_totals, coalesce((v_gt ->> 'gtIncl')::bigint, 0), coalesce((v_gt ->> 'gtExcl')::bigint, 0),
      coalesce((v_gt ->> 'gtAbs')::bigint, 0), coalesce((v_gt ->> 'gtPeriod')::bigint, 0), v_started, v_head, v_hhash, v_seq, v_hash, coalesce(v_sv, '0.1.0'),
      case when p_key_id is null then 'unsigned' else 'pending' end);
  v_ver := public.till_verify(p_truck);
  v_vseq := public.till_append(p_truck, 'event', 'verify', null, 'after_close', public.till_today(p_truck),
    jsonb_build_object('type', 'verify', 'after', p_type || ':' || p_start::text, 'ok', v_ver -> 'ok', 'entries', v_ver -> 'entries', 'mismatch_count', v_ver -> 'mismatch_count',
      'unsealed_orders', v_ver -> 'unsealed_orders', 'unchained_payments', v_ver -> 'unchained_payments'), null);
  if p_type = 'day' then perform public.till_mark_scanned(p_truck, p_end); end if;
  return jsonb_build_object('seq', v_seq, 'hash', v_hash, 'head_seq', v_head, 'head_hash', v_hhash, 'sealed', v_sealed, 'verify_ok', v_ver -> 'ok', 'verify_seq', v_vseq);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Signing (law change 11) — the private key is NEVER in the database
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- The public half of TILL_SIGNING_KEY, registered on its first use. A DIFFERENT key is refused (HGT22): a key is changed by a person, on purpose.
create or replace function public.till_register_signing_key(p_public_key text, p_key_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pub text;
  v_id  text;
begin
  if p_public_key !~ '^[A-Za-z0-9+/=]{40,200}$' or p_key_id !~ '^[0-9a-f]{16}$' then raise exception 'till signing: malformed key' using errcode = 'HGT22'; end if;
  select s.signing_public_key, s.signing_key_id into v_pub, v_id from public.till_settings s where s.id for update;
  if v_id is null then
    update public.till_settings set signing_public_key = p_public_key, signing_key_id = p_key_id, updated_at = now() where id;
    return true;
  end if;
  if v_id = p_key_id and v_pub = p_public_key then return false; end if;
  raise exception 'till signing: TILL_SIGNING_KEY is not the registered key (%) — not signing', v_id using errcode = 'HGT22';
end;
$$;

-- A close's signature, by the registered key. Stored once (a second signature of the same close is ignored).
create or replace function public.till_sign_close(p_truck text, p_seq bigint, p_key_id text, p_signature text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not exists (select 1 from public.till_closes x where x.truck_id = p_truck and x.seq = p_seq) then raise exception 'till signing: no close at seq %', p_seq using errcode = 'HGT22'; end if;
  if p_key_id is distinct from (select s.signing_key_id from public.till_settings s where s.id) then raise exception 'till signing: key % is not the registered key', p_key_id using errcode = 'HGT22'; end if;
  if p_signature !~ '^[A-Za-z0-9+/=]{80,100}$' then raise exception 'till signing: malformed signature' using errcode = 'HGT22'; end if;
  insert into public.till_close_signatures (truck_id, seq, key_id, signature) values (p_truck, p_seq, p_key_id, p_signature) on conflict (truck_id, seq) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Part B — what enforce mode will need (the guard stays OBSERVE; nothing here refuses)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- Would the guard refuse a CORRECTION (an undo, an edit) of this order? 'HGT02' only in ENFORCE mode for a sealed order whose trading day is
-- closed; NULL otherwise — always NULL in observe mode. The undo routes ask this FIRST, so in enforce mode an undo is refused before any write.
create or replace function public.till_correction_check(p_order_key uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when coalesce((select s.guard_mode from public.till_settings s where s.id), 'observe') = 'enforce'
                   and public.till_applies(o.truck_id)
                   and exists (select 1 from public.till_order_seals x where x.order_key = o.order_key)
                   and public.till_day_closed(o.truck_id, o.event_date) then 'HGT02' end
  from public.orders o where o.order_key = p_order_key
$$;

-- An order row as it was sealed when its event or van has since been DELETED (the FK set them NULL): till_verify compares that, not NULL.
create or replace function public.till_row_as_sealed(ro public.orders, d jsonb)
returns public.orders
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders := ro;
begin
  if o.event_id is null and d ->> 'event_id' is not null and not exists (select 1 from public.truck_events e where e.id::text = d ->> 'event_id') then o.event_id := d ->> 'event_id'; end if;
  if o.van_id is null and d ->> 'van_id' is not null and not exists (select 1 from public.truck_vans v where v.id::text = d ->> 'van_id') then o.van_id := d ->> 'van_id'; end if;
  return o;
end;
$$;

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
  v_fk     public.orders;
begin
  if not public.till_applies(new.truck_id) then return null; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    -- 🔴 till-pack-4: an event or a van being DELETED sets orders.event_id / van_id to NULL through the foreign key (ON DELETE SET NULL).
    -- When that is the ONLY change — the id went to NULL AND the event / van it named no longer exists — it is allowed and ignored: no
    -- version, no seal, no would-be refusal, so the deletion can never be refused once the guard enforces. till_verify compares such an
    -- order with the event / van it was sealed with (till_row_as_sealed). (Not pg_trigger_depth(): the foreign key's UPDATE queues this
    -- trigger to the outer statement, so it runs at depth 1.) Clearing an id whose event / van still exists is an edit, as before.
    if (old.event_id is not null and new.event_id is null and not exists (select 1 from public.truck_events e where e.id = old.event_id))
       or (old.van_id is not null and new.van_id is null and not exists (select 1 from public.truck_vans v where v.id = old.van_id)) then
      v_fk := new;
      if v_fk.event_id is null and old.event_id is not null and not exists (select 1 from public.truck_events e where e.id = old.event_id) then v_fk.event_id := old.event_id; end if;
      if v_fk.van_id is null and old.van_id is not null and not exists (select 1 from public.truck_vans v where v.id = old.van_id) then v_fk.van_id := old.van_id; end if;
      if public.till_order_source(v_fk) is not distinct from public.till_order_source(old) then
        perform set_config('lock_timeout', v_old, true);
        return null;
      end if;
    end if;
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
      elsif ((r.payload::jsonb) -> 'data')::text is distinct from public.till_sealed_order(public.till_row_as_sealed(ro, (r.payload::jsonb) -> 'data'))::text then
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

  -- till-pack-4: every close is the chain entry it names (its seq, its hash, kind 'close')
  for s in select x.period_type, x.period_start, x.seq, x.hash from public.till_closes x where x.truck_id = p_truck loop
    if not exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.seq = s.seq and c.kind = 'close' and c.hash = s.hash) then
      v_mis := v_mis || jsonb_build_object('ref', s.period_type || ':' || s.period_start, 'kind', 'close', 'problem', 'close row does not match its chain entry');
    end if;
  end loop;

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

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Who may call what
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- One statement per function (scripts/migration-function-grants.cjs reads one signature per revoke).
revoke all on function public.till_close_context(text) from public, anon, authenticated, service_role;
revoke all on function public.till_mark_scanned(text, date) from public, anon, authenticated, service_role;
revoke all on function public.till_close_commit(text, text, date, date, text, timestamptz, uuid[], uuid[], jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.till_register_signing_key(text, text) from public, anon, authenticated, service_role;
revoke all on function public.till_sign_close(text, bigint, text, text) from public, anon, authenticated, service_role;
revoke all on function public.till_correction_check(uuid) from public, anon, authenticated, service_role;
revoke all on function public.till_row_as_sealed(public.orders, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.till_order_guard() from public, anon, authenticated, service_role;
revoke all on function public.till_verify(text) from public, anon, authenticated, service_role;
grant execute on function public.till_close_context(text) to service_role;
grant execute on function public.till_mark_scanned(text, date) to service_role;
grant execute on function public.till_close_commit(text, text, date, date, text, timestamptz, uuid[], uuid[], jsonb, text) to service_role;
grant execute on function public.till_register_signing_key(text, text) to service_role;
grant execute on function public.till_sign_close(text, bigint, text, text) to service_role;
grant execute on function public.till_correction_check(uuid) to service_role;
grant execute on function public.till_verify(text) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 6. The two record tables are append-only (the refusal function is till-pack-1's)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'till_closes_append_only' and tgrelid = 'public.till_closes'::regclass) then
    create trigger till_closes_append_only before update or delete on public.till_closes for each row execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_closes_no_truncate' and tgrelid = 'public.till_closes'::regclass) then
    create trigger till_closes_no_truncate before truncate on public.till_closes for each statement execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_close_signatures_append_only' and tgrelid = 'public.till_close_signatures'::regclass) then
    create trigger till_close_signatures_append_only before update or delete on public.till_close_signatures for each row execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_close_signatures_no_truncate' and tgrelid = 'public.till_close_signatures'::regclass) then
    create trigger till_close_signatures_no_truncate before truncate on public.till_close_signatures for each statement execute function public.till_refuse_change();
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only). Run after the block above.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The tables, RLS on:  select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_closes', 'till_close_signatures', 'till_truck_settings');
-- 2. Nothing closed or signed yet, the key not registered, place_order_atomic_v2 untouched:
--   select (select count(*) from public.till_closes), (select count(*) from public.till_close_signatures), (select signing_key_id from public.till_settings), md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure));
