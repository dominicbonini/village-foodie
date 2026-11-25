-- 20261150_till_pack_5_6.sql
-- till-pack-5-6 (25 November 2026, docs/till-pack-5-6-report.md; the plan: docs/till-pack-0-report.md §6 and §8; the law check:
-- docs/till-law-1-report.md §2 points 5–8, §3 changes 12–13). THE ARCHIVE (pack-5) AND THE VERSION (pack-6). The guard stays in OBSERVE.
--
-- ✅ CLASSIFICATION: ADDITIVE AND BACKWARD-COMPATIBLE WITH THE DEPLOYED CODE (origin/main):
--    • the PRIVATE storage bucket `till-archives` (public = false; NO policy on storage.objects for it, so anon / authenticated can neither
--      read, list nor write it — only the service role); its objects can never be changed or deleted (a trigger refuses UPDATE / DELETE of
--      any object in this bucket, whoever asks — the archives are kept at least 10 years, Q9);
--    • NEW tables (RLS on, nothing for anon / authenticated, no writes for the service role; both APPEND-ONLY):
--        till_archives            one row per archive — truck, reason (year / on_demand / final), period, accounting year, where it is
--                                 stored, the manifest's and the zip's sha256, the chain head it covers, its own chain entry (kind 'archive');
--        till_archive_signatures  the Ed25519 signature of an archive's manifest sha256 (law change 11 — the key lives OUTSIDE the database);
--    • NEW functions (service role only): till_archive_commit (ONE transaction: check the head it covers, chain the manifest hash as kind
--      'archive', write the row, and the signature when there is one), till_sign_archive (an archive written unsigned, signed later);
--    • REPLACED (create or replace; no signature or grant change): till_verify — every archive must be the chain entry it names;
--    • pack-6 (Q13): the till's software is "HatchGrab, till module" 1.0.0 — till_settings.software_name (new column, default) and
--      software_version '1.0.0' (the ONE row of till_settings, a till table), so every chain entry, close and archive from now on carries it;
--      a chained 'version' event is written for every truck already in the till (none today: the live chain is empty).
--    • NOTHING is written to any row of orders, order_payments, action_audit_log or trucks. place_order_atomic_v2 is NOT touched
--      (md5 e4b273abcf8e7609c6ca54033ed59332). Nothing raises a new guard refusal: HGT02–HGT04 stay reserved; the archive's own refusals
--      are HGT20 (outside the till / already archived), HGT21 (the head it covers is not the chain's) and HGT22 (not the registered key).
--
-- VERIFY AFTER APPLYING: the read-only block at the end of this file, then scripts/db-rollback-proofs.cjs --till-5-check and --till-1-check.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The private bucket, and its objects can never change or go
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('till-archives', 'till-archives', false, 524288000, array['application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No policy on storage.objects for this bucket: anon and authenticated users can neither read nor list nor write it.

create or replace function public.till_archive_object_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.bucket_id = 'till-archives' then
    raise exception 'till archive %: archives are kept at least 10 years and are never changed or deleted', old.name using errcode = 'HGT01';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.till_archive_object_guard() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'till_archive_objects_keep' and tgrelid = 'storage.objects'::regclass) then
    create trigger till_archive_objects_keep before update or delete on storage.objects for each row execute function public.till_archive_object_guard();
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The version (pack-6, Q13)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.till_settings add column if not exists software_name text not null default 'HatchGrab, till module';
comment on column public.till_settings.software_name is 'till-pack-6 (Q13): the fiscal software''s name, as the attestation names it. Its version is software_version (lib/till/version.ts is the source; the pin harness scripts/till-version-pin.cjs fails a fiscal change without a MAJOR bump).';

do $$
declare
  v_old text;
  h record;
begin
  select s.software_version into v_old from public.till_settings s where s.id;
  if v_old is distinct from '1.0.0' then
    update public.till_settings set software_version = '1.0.0', updated_at = now() where id;
    for h in select x.truck_id from public.till_chain_heads x where x.last_seq > 0 order by x.truck_id loop
      perform public.till_append(h.truck_id, 'event', 'version', null, 'version_change', public.till_today(h.truck_id),
        jsonb_build_object('type', 'version', 'software', 'HatchGrab, till module', 'from', v_old, 'to', '1.0.0'), null);
    end loop;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The archives (pack-5)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.till_archives (
  id                     uuid primary key default gen_random_uuid(),
  truck_id               text not null,
  reason                 text not null check (reason in ('year', 'on_demand', 'final')),
  period_start           date not null,
  period_end             date not null check (period_end >= period_start),
  accounting_year_start  date not null,
  accounting_year_end    date not null check (accounting_year_end >= accounting_year_start),
  storage_path           text not null unique check (storage_path ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+\.zip$'),
  manifest_sha256        text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  zip_sha256             text not null check (zip_sha256 ~ '^[0-9a-f]{64}$'),
  zip_bytes              bigint not null check (zip_bytes > 0),
  chain_head_seq         bigint not null,
  chain_head_hash        text not null check (chain_head_hash ~ '^[0-9a-f]{64}$'),
  seq                    bigint not null,
  hash                   text not null check (hash ~ '^[0-9a-f]{64}$'),
  software_version       text not null,
  signing_at_commit      text not null check (signing_at_commit in ('signed', 'unsigned')),
  requested_by           text not null check (requested_by in ('system', 'owner', 'admin')),
  created_at             timestamptz not null default now()
);
create unique index if not exists till_archives_one_year on public.till_archives (truck_id, period_start, period_end) where reason = 'year';
comment on table public.till_archives is 'till-pack-5: APPEND-ONLY. The till''s archives — a ZIP of CSV / JSONL files, a README in French and English and a manifest (every file''s sha256, the period, the accounting year, the software version, each day''s chain head), stored in the private bucket till-archives at storage_path, kept at least 10 years (Q9). The manifest''s sha256 is chained (kind ''archive'', seq / hash here). Written only by till_archive_commit.';

create table if not exists public.till_archive_signatures (
  archive_id  uuid primary key,
  truck_id    text not null,
  key_id      text not null,
  signature   text not null,
  signed_at   timestamptz not null default now()
);
comment on table public.till_archive_signatures is 'till-pack-5 (law change 11): APPEND-ONLY. The Ed25519 signature (base64) of an archive''s manifest sha256 (its 64 hex characters, as UTF-8 bytes) by the registered key (till_settings.signing_key_id). An archive with no row here is UNSIGNED; the next run with TILL_SIGNING_KEY signs it.';

alter table public.till_archives           enable row level security;
alter table public.till_archive_signatures enable row level security;
revoke all on public.till_archives, public.till_archive_signatures from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.till_archives from service_role;
revoke insert, update, delete, truncate, references, trigger on public.till_archive_signatures from service_role;

-- 🔴 CHAIN AN ARCHIVE, IN ONE TRANSACTION. The file is already stored (the caller uploaded it, never overwriting). Refusals: HGT20 — the truck
-- is outside the till, or its year is already archived; HGT21 — the chain head the manifest names is not this truck's entry at that seq;
-- HGT22 — a signature by a key that is not the registered one. Returns the archive's id and its chain entry.
create or replace function public.till_archive_commit(p_truck text, p_reason text, p_start date, p_end date, p_year_start date, p_year_end date,
                                                      p_path text, p_manifest_sha text, p_zip_sha text, p_bytes bigint, p_head_seq bigint,
                                                      p_head_hash text, p_key_id text, p_signature text, p_requested_by text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid := gen_random_uuid();
  v_seq  bigint;
  v_hash text;
  v_sv   text;
begin
  if not public.till_applies(p_truck) then raise exception 'till archive: % is outside the till', p_truck using errcode = 'HGT20'; end if;
  if p_reason not in ('year', 'on_demand', 'final') or p_end < p_start then raise exception 'till archive: bad request % % %', p_reason, p_start, p_end using errcode = 'HGT20'; end if;
  if p_path is null or left(p_path, length(p_truck) + 1) <> p_truck || '/' then raise exception 'till archive: the path must be under %/', p_truck using errcode = 'HGT20'; end if;
  insert into public.till_chain_heads (truck_id, last_seq, last_hash) values (p_truck, 0, repeat('0', 64)) on conflict (truck_id) do nothing;
  perform 1 from public.till_chain_heads h where h.truck_id = p_truck for update;
  if p_reason = 'year' and exists (select 1 from public.till_archives x where x.truck_id = p_truck and x.reason = 'year' and x.period_start = p_start and x.period_end = p_end) then
    raise exception 'till archive: the year % – % is already archived', p_start, p_end using errcode = 'HGT20';
  end if;
  if not exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.seq = p_head_seq and c.hash = p_head_hash) then
    raise exception 'till archive: the chain head % it names is not this truck''s', p_head_seq using errcode = 'HGT21';
  end if;
  if p_signature is not null and p_key_id is distinct from (select s.signing_key_id from public.till_settings s where s.id) then
    raise exception 'till archive: key % is not the registered key', p_key_id using errcode = 'HGT22';
  end if;
  if p_signature is not null and p_signature !~ '^[A-Za-z0-9+/=]{80,100}$' then raise exception 'till archive: malformed signature' using errcode = 'HGT22'; end if;
  select s.software_version into v_sv from public.till_settings s where s.id;
  v_seq := public.till_append(p_truck, 'archive', p_reason || ':' || p_start::text || ':' || p_end::text, null, p_reason, public.till_today(p_truck),
    jsonb_build_object('archive_id', v_id, 'manifest_sha256', p_manifest_sha, 'zip_sha256', p_zip_sha, 'zip_bytes', p_bytes, 'storage_path', p_path,
      'period_start', p_start, 'period_end', p_end, 'accounting_year_start', p_year_start, 'accounting_year_end', p_year_end,
      'chain_head', jsonb_build_object('seq', p_head_seq, 'hash', p_head_hash), 'requested_by', p_requested_by,
      'signing', case when p_signature is null then to_jsonb('unsigned'::text) else jsonb_build_object('key_id', p_key_id) end), null);
  select c.hash into v_hash from public.till_chain c where c.truck_id = p_truck and c.seq = v_seq;
  insert into public.till_archives (id, truck_id, reason, period_start, period_end, accounting_year_start, accounting_year_end, storage_path, manifest_sha256,
      zip_sha256, zip_bytes, chain_head_seq, chain_head_hash, seq, hash, software_version, signing_at_commit, requested_by)
    values (v_id, p_truck, p_reason, p_start, p_end, p_year_start, p_year_end, p_path, p_manifest_sha, p_zip_sha, p_bytes, p_head_seq, p_head_hash, v_seq, v_hash,
      coalesce(v_sv, '1.0.0'), case when p_signature is null then 'unsigned' else 'signed' end, p_requested_by);
  if p_signature is not null then
    insert into public.till_archive_signatures (archive_id, truck_id, key_id, signature) values (v_id, p_truck, p_key_id, p_signature);
  end if;
  return jsonb_build_object('archive_id', v_id, 'seq', v_seq, 'hash', v_hash, 'signed', p_signature is not null);
end;
$$;

-- An archive written unsigned, signed later by the registered key. Stored once.
create or replace function public.till_sign_archive(p_truck text, p_archive_id uuid, p_key_id text, p_signature text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not exists (select 1 from public.till_archives x where x.truck_id = p_truck and x.id = p_archive_id) then raise exception 'till signing: no archive %', p_archive_id using errcode = 'HGT22'; end if;
  if p_key_id is distinct from (select s.signing_key_id from public.till_settings s where s.id) then raise exception 'till signing: key % is not the registered key', p_key_id using errcode = 'HGT22'; end if;
  if p_signature !~ '^[A-Za-z0-9+/=]{80,100}$' then raise exception 'till signing: malformed signature' using errcode = 'HGT22'; end if;
  insert into public.till_archive_signatures (archive_id, truck_id, key_id, signature) values (p_archive_id, p_truck, p_key_id, p_signature) on conflict (archive_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
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

  -- till-pack-5-6: every archive is the chain entry it names (its seq, its hash, kind 'archive'), and names a real chain head
  for s in select x.id, x.seq, x.hash, x.chain_head_seq, x.chain_head_hash from public.till_archives x where x.truck_id = p_truck loop
    if not exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.seq = s.seq and c.kind = 'archive' and c.hash = s.hash)
       or not exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.seq = s.chain_head_seq and c.hash = s.chain_head_hash) then
      v_mis := v_mis || jsonb_build_object('ref', s.id::text, 'kind', 'archive', 'problem', 'archive row does not match the chain');
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
-- 4. Who may call what
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
revoke all on function public.till_archive_commit(text, text, date, date, date, date, text, text, text, bigint, bigint, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.till_sign_archive(text, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.till_verify(text) from public, anon, authenticated, service_role;
grant execute on function public.till_archive_commit(text, text, date, date, date, date, text, text, text, bigint, bigint, text, text, text, text) to service_role;
grant execute on function public.till_sign_archive(text, uuid, text, text) to service_role;
grant execute on function public.till_verify(text) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5. The two record tables are append-only (the refusal function is till-pack-1's)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'till_archives_append_only' and tgrelid = 'public.till_archives'::regclass) then
    create trigger till_archives_append_only before update or delete on public.till_archives for each row execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_archives_no_truncate' and tgrelid = 'public.till_archives'::regclass) then
    create trigger till_archives_no_truncate before truncate on public.till_archives for each statement execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_archive_signatures_append_only' and tgrelid = 'public.till_archive_signatures'::regclass) then
    create trigger till_archive_signatures_append_only before update or delete on public.till_archive_signatures for each row execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_archive_signatures_no_truncate' and tgrelid = 'public.till_archive_signatures'::regclass) then
    create trigger till_archive_signatures_no_truncate before truncate on public.till_archive_signatures for each statement execute function public.till_refuse_change();
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only). Run after the block above.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The bucket is private and has no policy:  select id, public from storage.buckets where id = 'till-archives';
--    select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual ilike '%till-archives%' or with_check ilike '%till-archives%');
-- 2. The version and the tables:  select software_name, software_version from public.till_settings;  select count(*) from public.till_archives;
-- 3. place_order_atomic_v2 untouched:  select md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure));
