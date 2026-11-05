-- supabase/migrations/20261073_loyalty_1.sql — loyalty-1 (5 November 2026, docs/loyalty-1-report.md).
-- DIGITAL LOYALTY STAMP CARDS: THE DATA AND THE THREE ATOMIC STEPS ONLY, EVERYTHING SWITCHED OFF.
--   • platform_switches.loyalty_enabled  — the global switch, FALSE. The stamping job reads it first and stops there while it is false.
--   • truck_loyalty_settings             — per truck: enabled (false), when it was switched on, stamps needed (8, 2–20), the reward.
--   • loyalty_cards                      — one per truck and customer; the customer is the SAME salted hash reviews-weather-1 uses
--                                          (lib/reviews/model.ts emailHash: sha256 of the truck id and the normalised email), never
--                                          the address. `stamps` is the current count; `lifetime_stamps` every stamp still standing.
--   • loyalty_stamps                     — the ledger: one stamp per order, ever (unique order_key); a reversal is recorded on the row.
--   • loyalty_rewards                    — earned at the threshold; `stamps_used` records the threshold it used, so a reversal can put
--                                          the card back exactly; at most one per stamp; an order redeems at most one reward.
--   • loyalty_apply_stamp / loyalty_reverse_stamp / loyalty_redeem_reward — each ONE transaction with the card's row locked, so the
--                                          job is safe to run twice or in parallel. Executable by the service role only.
-- Every table: RLS on, no policy, nothing granted to anon or authenticated (service role only). Foreign keys to trucks(id) and
-- orders(order_key) (Dominic's approval, loyalty-1 brief). No protected table is altered, inserted into or updated; no row of any
-- existing table is written. The SELF-CHECK at the end runs the three functions against this schema inside a sub-transaction that is
-- ALWAYS rolled back (it reads five of test-truck's existing orders to satisfy the foreign keys, and writes nothing that survives).

begin;

alter table public.platform_switches add column if not exists loyalty_enabled boolean not null default false;

create table if not exists public.truck_loyalty_settings (
  truck_id             text primary key references public.trucks(id) on delete cascade,
  enabled              boolean not null default false,
  enabled_at           timestamptz,
  stamps_required      integer not null default 8 check (stamps_required between 2 and 20),
  reward_type          text check (reward_type is null or reward_type in ('free_item', 'amount_off')),
  reward_menu_item_id  uuid,
  reward_amount_minor  integer,
  reward_label         text check (reward_label is null or length(btrim(reward_label)) between 1 and 80),
  reward_expires_days  integer check (reward_expires_days is null or reward_expires_days between 1 and 3650),
  updated_at           timestamptz not null default now(),
  updated_by           text,
  -- the reward fields match the reward type
  constraint truck_loyalty_settings_reward_chk check (
    (reward_type is null and reward_menu_item_id is null and reward_amount_minor is null)
    or (reward_type = 'free_item' and reward_menu_item_id is not null and reward_amount_minor is null)
    or (reward_type = 'amount_off' and reward_amount_minor between 1 and 100000000 and reward_menu_item_id is null)
  ),
  -- switched on only with a reward, and with the moment it was switched on (orders collected before it never earn a stamp)
  constraint truck_loyalty_settings_enabled_chk check (not enabled or (reward_type is not null and enabled_at is not null))
);

create table if not exists public.loyalty_cards (
  id               uuid primary key default gen_random_uuid(),
  truck_id         text not null references public.trucks(id) on delete cascade,
  customer_key     text not null check (customer_key ~ '^[0-9a-f]{64}$'),
  stamps           integer not null default 0 check (stamps >= 0),
  lifetime_stamps  integer not null default 0 check (lifetime_stamps >= 0),
  created_at       timestamptz not null default now(),
  last_stamp_at    timestamptz,
  constraint loyalty_cards_one_per_customer_uq unique (truck_id, customer_key)
);

create table if not exists public.loyalty_stamps (
  id               uuid primary key default gen_random_uuid(),
  card_id          uuid not null references public.loyalty_cards(id) on delete cascade,
  truck_id         text not null references public.trucks(id) on delete cascade,
  order_key        uuid not null references public.orders(order_key) on delete cascade,   -- orders' primary key (orders.id is per event)
  stamped_at       timestamptz not null,
  reversed_at      timestamptz,
  reversed_reason  text check (reversed_reason is null or reversed_reason in ('cancelled', 'refunded')),
  constraint loyalty_stamps_one_per_order_uq unique (order_key),
  constraint loyalty_stamps_reversal_chk check ((reversed_at is null) = (reversed_reason is null))
);
create index if not exists loyalty_stamps_card_idx on public.loyalty_stamps (card_id);
create index if not exists loyalty_stamps_open_idx on public.loyalty_stamps (truck_id, stamped_at) where reversed_at is null;

create table if not exists public.loyalty_rewards (
  id                    uuid primary key default gen_random_uuid(),
  card_id               uuid not null references public.loyalty_cards(id) on delete cascade,
  truck_id              text not null references public.trucks(id) on delete cascade,
  earned_at             timestamptz not null,
  earned_from_stamp_id  uuid references public.loyalty_stamps(id) on delete set null,
  stamps_used           integer not null check (stamps_used between 2 and 20),
  expires_at            timestamptz,
  redeemed_at           timestamptz,
  redeemed_order_key    uuid references public.orders(order_key) on delete set null,
  voided_at             timestamptz,
  voided_reason         text check (voided_reason is null or voided_reason in ('stamp_reversed')),
  constraint loyalty_rewards_one_per_stamp_uq unique (earned_from_stamp_id),
  constraint loyalty_rewards_one_per_order_uq unique (redeemed_order_key),
  constraint loyalty_rewards_not_both_chk check (redeemed_at is null or voided_at is null),
  constraint loyalty_rewards_void_chk check ((voided_at is null) = (voided_reason is null)),
  constraint loyalty_rewards_redeemed_chk check (redeemed_order_key is null or redeemed_at is not null)
);
create index if not exists loyalty_rewards_card_idx on public.loyalty_rewards (card_id);

alter table public.truck_loyalty_settings enable row level security;
alter table public.loyalty_cards enable row level security;
alter table public.loyalty_stamps enable row level security;
alter table public.loyalty_rewards enable row level security;
revoke all on public.truck_loyalty_settings, public.loyalty_cards, public.loyalty_stamps, public.loyalty_rewards from anon, authenticated;

comment on table public.truck_loyalty_settings is 'loyalty-1: per-truck stamp card settings (off by default). Service role only.';
comment on table public.loyalty_cards is 'loyalty-1: one stamp card per truck and customer; the customer is the salted email hash, never the address.';
comment on table public.loyalty_stamps is 'loyalty-1: the stamp ledger — one per order, ever; a reversal is recorded on the row.';
comment on table public.loyalty_rewards is 'loyalty-1: rewards earned at the threshold; stamps_used lets a reversal restore the card exactly.';

-- ── 1 · a stamp for one collected order (the job decides eligibility; this is the atomic part) ──────────────────────────────────────
-- 'duplicate' when the order already has a stamp (safe to call twice, or from two runs at once); 'wrong_truck' when the order is not
-- this truck's. At the threshold it creates ONE reward (from this stamp) and takes `p_stamps_required` off the card; extra stamps carry.
create or replace function public.loyalty_apply_stamp(p_truck_id text, p_customer_key text, p_order_key uuid, p_stamped_at timestamptz,
  p_stamps_required integer, p_expires_days integer, p_now timestamptz)
returns table (out_result text, out_card_id uuid, out_stamps integer, out_reward_id uuid)
language plpgsql security invoker set search_path = public as $$
declare
  v_card_id uuid; v_stamps integer; v_stamp_id uuid; v_reward_id uuid;
begin
  if p_stamps_required is null or p_stamps_required < 2 or p_stamps_required > 20 then raise exception 'loyalty_apply_stamp: stamps_required must be 2–20'; end if;
  if p_customer_key is null or p_customer_key !~ '^[0-9a-f]{64}$' then raise exception 'loyalty_apply_stamp: bad customer key'; end if;
  if not exists (select 1 from public.orders o where o.order_key = p_order_key and o.truck_id = p_truck_id) then
    return query select 'wrong_truck'::text, null::uuid, null::integer, null::uuid; return;
  end if;
  if exists (select 1 from public.loyalty_stamps s where s.order_key = p_order_key) then
    return query select 'duplicate'::text, null::uuid, null::integer, null::uuid; return;
  end if;
  insert into public.loyalty_cards (truck_id, customer_key) values (p_truck_id, p_customer_key) on conflict (truck_id, customer_key) do nothing;
  select c.id, c.stamps into v_card_id, v_stamps from public.loyalty_cards c where c.truck_id = p_truck_id and c.customer_key = p_customer_key for update;
  insert into public.loyalty_stamps (card_id, truck_id, order_key, stamped_at) values (v_card_id, p_truck_id, p_order_key, p_stamped_at)
    on conflict (order_key) do nothing returning id into v_stamp_id;
  if v_stamp_id is null then
    return query select 'duplicate'::text, null::uuid, null::integer, null::uuid; return;
  end if;
  v_stamps := v_stamps + 1;
  if v_stamps >= p_stamps_required then
    insert into public.loyalty_rewards (card_id, truck_id, earned_at, earned_from_stamp_id, stamps_used, expires_at)
      values (v_card_id, p_truck_id, p_now, v_stamp_id, p_stamps_required,
              case when p_expires_days is null then null else p_now + make_interval(days => p_expires_days) end)
      returning id into v_reward_id;
    v_stamps := v_stamps - p_stamps_required;
  end if;
  update public.loyalty_cards c set stamps = v_stamps, lifetime_stamps = c.lifetime_stamps + 1,
    last_stamp_at = greatest(coalesce(c.last_stamp_at, p_stamped_at), p_stamped_at)
    where c.id = v_card_id;
  return query select 'stamped'::text, v_card_id, v_stamps, v_reward_id;
end
$$;

-- ── 2 · reverse an order's stamp (the order was cancelled or fully refunded) ────────────────────────────────────────────────────────
-- If the stamp completed a reward that is still unredeemed (and not voided), the reward is voided and the card put back exactly as it
-- was before the stamp (its stamps + the reward's stamps_used − 1). Otherwise the card loses the one stamp, never going below zero.
-- 'no_stamp' / 'already_reversed' make it safe to call twice.
create or replace function public.loyalty_reverse_stamp(p_order_key uuid, p_reason text, p_now timestamptz)
returns table (out_result text, out_card_id uuid, out_stamps integer, out_voided_reward_id uuid)
language plpgsql security invoker set search_path = public as $$
declare
  v_stamp_id uuid; v_card_id uuid; v_reversed timestamptz; v_stamps integer;
  v_reward_id uuid; v_reward_used integer; v_reward_redeemed timestamptz; v_reward_voided timestamptz; v_voided uuid;
begin
  if p_reason is null or p_reason not in ('cancelled', 'refunded') then raise exception 'loyalty_reverse_stamp: reason must be cancelled or refunded'; end if;
  select s.card_id into v_card_id from public.loyalty_stamps s where s.order_key = p_order_key;
  if v_card_id is null then
    return query select 'no_stamp'::text, null::uuid, null::integer, null::uuid; return;
  end if;
  -- the card first, then the stamp: the same order loyalty_apply_stamp takes them in
  select c.stamps into v_stamps from public.loyalty_cards c where c.id = v_card_id for update;
  select s.id, s.reversed_at into v_stamp_id, v_reversed from public.loyalty_stamps s where s.order_key = p_order_key for update;
  if v_reversed is not null then
    return query select 'already_reversed'::text, v_card_id, v_stamps, null::uuid; return;
  end if;
  select r.id, r.stamps_used, r.redeemed_at, r.voided_at into v_reward_id, v_reward_used, v_reward_redeemed, v_reward_voided
    from public.loyalty_rewards r where r.earned_from_stamp_id = v_stamp_id for update;
  if v_reward_id is not null and v_reward_redeemed is null and v_reward_voided is null then
    update public.loyalty_rewards r set voided_at = p_now, voided_reason = 'stamp_reversed' where r.id = v_reward_id;
    v_stamps := v_stamps + v_reward_used - 1;
    v_voided := v_reward_id;
  else
    v_stamps := greatest(v_stamps - 1, 0);
  end if;
  update public.loyalty_stamps s set reversed_at = p_now, reversed_reason = p_reason where s.id = v_stamp_id;
  update public.loyalty_cards c set stamps = v_stamps, lifetime_stamps = greatest(c.lifetime_stamps - 1, 0) where c.id = v_card_id;
  return query select 'reversed'::text, v_card_id, v_stamps, v_voided;
end
$$;

-- ── 3 · redeem a reward against an order (for later use; not wired to checkout) ─────────────────────────────────────────────────────
-- 'redeemed' once; the same reward and order again → 'already_redeemed_here' (idempotent); refuses 'not_found', 'already_redeemed'
-- (another order), 'voided', 'expired', 'wrong_order' (not the reward's truck) and 'order_used' (that order already redeemed one).
create or replace function public.loyalty_redeem_reward(p_reward_id uuid, p_order_key uuid, p_now timestamptz)
returns table (out_result text, out_reward_id uuid)
language plpgsql security invoker set search_path = public as $$
declare
  v_truck text; v_expires timestamptz; v_redeemed timestamptz; v_redeemed_order uuid; v_voided timestamptz;
begin
  select r.truck_id, r.expires_at, r.redeemed_at, r.redeemed_order_key, r.voided_at into v_truck, v_expires, v_redeemed, v_redeemed_order, v_voided
    from public.loyalty_rewards r where r.id = p_reward_id for update;
  if v_truck is null then return query select 'not_found'::text, p_reward_id; return; end if;
  if v_redeemed is not null then
    return query select (case when v_redeemed_order = p_order_key then 'already_redeemed_here' else 'already_redeemed' end)::text, p_reward_id; return;
  end if;
  if v_voided is not null then return query select 'voided'::text, p_reward_id; return; end if;
  if v_expires is not null and v_expires <= p_now then return query select 'expired'::text, p_reward_id; return; end if;
  if not exists (select 1 from public.orders o where o.order_key = p_order_key and o.truck_id = v_truck) then
    return query select 'wrong_order'::text, p_reward_id; return;
  end if;
  if exists (select 1 from public.loyalty_rewards r where r.redeemed_order_key = p_order_key) then
    return query select 'order_used'::text, p_reward_id; return;
  end if;
  update public.loyalty_rewards r set redeemed_at = p_now, redeemed_order_key = p_order_key where r.id = p_reward_id;
  return query select 'redeemed'::text, p_reward_id;
end
$$;

revoke all on function public.loyalty_apply_stamp(text, text, uuid, timestamptz, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.loyalty_reverse_stamp(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.loyalty_redeem_reward(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.loyalty_apply_stamp(text, text, uuid, timestamptz, integer, integer, timestamptz) to service_role;
grant execute on function public.loyalty_reverse_stamp(uuid, text, timestamptz) to service_role;
grant execute on function public.loyalty_redeem_reward(uuid, uuid, timestamptz) to service_role;

-- ── SELF-CHECK: the three functions, run once against this schema, inside a sub-transaction that is ALWAYS rolled back ───────────────
-- It reads five of test-truck's existing orders (only to satisfy the foreign key — no order is changed) and fails the WHOLE migration
-- if any answer is wrong. Every row it writes is undone by the sub-transaction, so the new tables are empty afterwards.
do $selfcheck$
declare
  k uuid[]; t constant text := 'test-truck'; key constant text := repeat('a', 64); r record; v_reward uuid; v_old uuid; n integer;
begin
  select array_agg(order_key) into k from (select o.order_key from public.orders o where o.truck_id = t order by o.created_at limit 5) s;
  if coalesce(array_length(k, 1), 0) < 5 then raise notice 'loyalty self-check SKIPPED: test-truck has fewer than 5 orders'; return; end if;
  begin
    -- stamps needed: 2, rewards expire after 30 days
    select * into r from public.loyalty_apply_stamp(t, key, k[1], now(), 2, 30, now());
    if r.out_result <> 'stamped' or r.out_stamps <> 1 or r.out_reward_id is not null then raise exception 'selfcheck: first stamp → %', r; end if;
    select * into r from public.loyalty_apply_stamp(t, key, k[1], now(), 2, 30, now());
    if r.out_result <> 'duplicate' then raise exception 'selfcheck: the same order twice → %', r; end if;
    select * into r from public.loyalty_apply_stamp('no-such-truck', key, k[2], now(), 2, 30, now());
    if r.out_result <> 'wrong_truck' then raise exception 'selfcheck: another truck''s order → %', r; end if;
    select * into r from public.loyalty_apply_stamp(t, key, k[2], now(), 2, 30, now());
    if r.out_result <> 'stamped' or r.out_stamps <> 0 or r.out_reward_id is null then raise exception 'selfcheck: the threshold → %', r; end if;
    v_reward := r.out_reward_id;
    -- reversing the stamp that completed an unredeemed reward: the reward is voided, the card back to 1 (as before that stamp)
    select * into r from public.loyalty_reverse_stamp(k[2], 'refunded', now());
    if r.out_result <> 'reversed' or r.out_stamps <> 1 or r.out_voided_reward_id is distinct from v_reward then raise exception 'selfcheck: reversal → %', r; end if;
    select * into r from public.loyalty_reverse_stamp(k[2], 'refunded', now());
    if r.out_result <> 'already_reversed' then raise exception 'selfcheck: reversal twice → %', r; end if;
    select * into r from public.loyalty_redeem_reward(v_reward, k[5], now());
    if r.out_result <> 'voided' then raise exception 'selfcheck: a voided reward → %', r; end if;
    -- a fresh reward, redeemed once only
    select * into r from public.loyalty_apply_stamp(t, key, k[3], now(), 2, 30, now());
    if r.out_result <> 'stamped' or r.out_stamps <> 0 or r.out_reward_id is null then raise exception 'selfcheck: the threshold again → %', r; end if;
    v_reward := r.out_reward_id;
    select * into r from public.loyalty_redeem_reward(v_reward, k[5], now());
    if r.out_result <> 'redeemed' then raise exception 'selfcheck: redeem → %', r; end if;
    select * into r from public.loyalty_redeem_reward(v_reward, k[5], now());
    if r.out_result <> 'already_redeemed_here' then raise exception 'selfcheck: redeem again, same order → %', r; end if;
    select * into r from public.loyalty_redeem_reward(v_reward, k[4], now());
    if r.out_result <> 'already_redeemed' then raise exception 'selfcheck: redeem again, another order → %', r; end if;
    -- reversing a stamp whose reward was already redeemed: the reward stands, the card loses one stamp but never goes below zero
    select * into r from public.loyalty_reverse_stamp(k[3], 'cancelled', now());
    if r.out_result <> 'reversed' or r.out_stamps <> 0 or r.out_voided_reward_id is not null then raise exception 'selfcheck: reversal after redemption → %', r; end if;
    -- an expired reward is refused (earned 40 days ago with a 30-day expiry)
    select * into r from public.loyalty_apply_stamp(t, key, k[4], now(), 2, 30, now() - interval '40 days');
    v_old := r.out_reward_id;
    if r.out_result <> 'stamped' or v_old is null then
      -- the card stood at 0, so k[4] is its first stamp again: one more to reach the threshold
      select * into r from public.loyalty_apply_stamp(t, key, k[5], now(), 2, 30, now() - interval '40 days');
      v_old := r.out_reward_id;
    end if;
    if v_old is null then raise exception 'selfcheck: no reward to expire'; end if;
    select * into r from public.loyalty_redeem_reward(v_old, k[1], now());
    if r.out_result <> 'expired' then raise exception 'selfcheck: an expired reward → %', r; end if;
    select count(*) into n from public.loyalty_cards where truck_id = t and customer_key = key;
    if n <> 1 then raise exception 'selfcheck: % cards for one customer', n; end if;
    raise exception 'LOYALTY_SELFCHECK_OK';
  exception when others then
    if sqlerrm <> 'LOYALTY_SELFCHECK_OK' then raise; end if;
    raise notice 'loyalty self-check passed (every row it wrote was rolled back)';
  end;
end
$selfcheck$;

commit;

-- Verify (read-only):
--   select loyalty_enabled from platform_switches;
--   select relname, relrowsecurity from pg_class where relname in ('truck_loyalty_settings','loyalty_cards','loyalty_stamps','loyalty_rewards') and relkind = 'r';
--   select count(*) from pg_policies where tablename in ('truck_loyalty_settings','loyalty_cards','loyalty_stamps','loyalty_rewards');
