-- supabase/migrations/20261086_billing_1_correction.sql — billing-1 correction (10 November 2026; docs/billing-1-report.md).
-- Dominic's correction: plan fees IN ADVANCE, usage IN ARREARS; the trial's end and upgrades charged pro rata at once, downgrades on
-- the 1st; plan history; a per-country late-payment fee (0 everywhere); Pay as you go / Pro prepared in BR, MX, MY, SG, TH.
--
--   • billing_charges (NEW)        — every charge HatchGrab computes for a truck: 'monthly' (on the 1st: this month's plan fee and
--                                    extra vans in advance + last month's billed usage + surcharge + anything carried), 'trial_end'
--                                    (the plan fee for the rest of the month the trial ends in) and 'upgrade' (the pro-rata
--                                    difference for the rest of the month). Unique (truck, month, kind, ref): a monthly charge once
--                                    per truck per month; each trial end / upgrade once. Under the minimum → carried (and later
--                                    consumed by one monthly charge: carried_into).
--   • billing_usage                — becomes the USAGE ledger only (the plan, carry and charge columns move to billing_charges);
--                                    state 'open' until a monthly charge bills it ('billed', charge_id).
--   • billing_invoices             — one per CHARGE (charge_id, unique) instead of one per month; + late_fee_minor (null = not yet
--                                    decided; 0 = decided, none) and replaced_stripe_invoice_id (a late fee re-issues the invoice).
--   • country_billing.late_fee_minor — a fixed late-payment fee in the local currency, once per invoice, only if it is still unpaid
--                                    when online ordering pauses. DEFAULT 0 = NONE ANYWHERE (Dominic: "set it to 0 in every country").
--   • truck_billing.pending_plan_key / pending_plan_from — a downgrade waiting for the 1st.
--   • truck_plan_history (NEW)     — every change of trucks.plan / trucks.trial_expires_at, recorded by a trigger ONLY WHILE BILLING
--                                    IS SWITCHED ON (before that nothing is billed, so nothing needs a history). The first change also
--                                    records the state before it (changed_at -infinity). A failure to record never blocks the change.
--   • plan_prices_world_guard      — an OFFERED plan that charges a fee where Stripe forbids application fees is now allowed ONLY when
--                                    billing is switched on AND that country bills the fee monthly (country_billing (b) or (c)). So
--                                    Pay as you go and Pro in BR, MX, MY, SG, TH — their rows already exist with offered = false
--                                    (OBSERVED 10 November) — can be switched on together with billing, and not before.
-- 🔴 NO ROW OF ANY EXISTING TABLE IS UPDATED OR DELETED; nothing is inserted. The billing tables being restructured are EMPTY — the
-- first block refuses to run otherwise. The new trigger on trucks does nothing while platform_switches.billing_enabled is false.

begin;

do $$
begin
  if exists (select 1 from public.billing_invoices) or exists (select 1 from public.billing_usage) or exists (select 1 from public.billing_usage_orders) then
    raise exception 'billing-1 correction: the billing tables are not empty — stop and look before restructuring them';
  end if;
end $$;

-- ── the late-payment fee, 0 everywhere ───────────────────────────────────────────────────────────────────────────────
alter table public.country_billing add column if not exists late_fee_minor integer not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'country_billing_late_fee_minor_check') then
    alter table public.country_billing add constraint country_billing_late_fee_minor_check check (late_fee_minor >= 0);
  end if;
end $$;

-- ── a downgrade waits for the 1st ────────────────────────────────────────────────────────────────────────────────────
alter table public.truck_billing add column if not exists pending_plan_key text references public.plans(key);
alter table public.truck_billing add column if not exists pending_plan_from date;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'truck_billing_pending_plan_chk') then
    alter table public.truck_billing add constraint truck_billing_pending_plan_chk
      check ((pending_plan_key is null) = (pending_plan_from is null) and (pending_plan_from is null or extract(day from pending_plan_from) = 1));
  end if;
end $$;

-- ── charges ──────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.billing_charges (
  id                 uuid primary key default gen_random_uuid(),
  truck_id           text not null references public.trucks(id) on delete cascade,
  period             date not null check (extract(day from period) = 1),          -- the month the charge is FOR
  kind               text not null check (kind in ('monthly', 'trial_end', 'upgrade')),
  ref                text not null default '',                                     -- '' for monthly; the event for the others
  currency           text not null,
  plan_key           text not null,
  from_plan_key      text,
  plan_minor         integer not null default 0 check (plan_minor >= 0),
  plan_days          integer not null default 0 check (plan_days >= 0),
  period_days        integer not null check (period_days between 28 and 31),
  vans_minor         integer not null default 0 check (vans_minor >= 0),
  usage_period       date check (usage_period is null or extract(day from usage_period) = 1),
  usage_fee_minor    integer not null default 0 check (usage_fee_minor >= 0),
  surcharge_minor    integer not null default 0 check (surcharge_minor >= 0),
  carried_in_minor   integer not null default 0 check (carried_in_minor >= 0),
  amount_due_minor   integer not null default 0 check (amount_due_minor >= 0),
  charged_minor      integer not null default 0 check (charged_minor >= 0),
  carried_out_minor  integer not null default 0 check (carried_out_minor >= 0),
  carried_into       uuid references public.billing_charges(id),
  min_charge_minor   integer not null default 0 check (min_charge_minor >= 0),
  -- 'invoicing' (claimed; the invoice not finished) · 'invoiced' · 'carried' (under the minimum) · 'nothing' (0 owed)
  state              text not null check (state in ('invoicing', 'invoiced', 'carried', 'nothing')),
  inputs_digest      text not null,
  computed_at        timestamptz not null default now(),
  unique (truck_id, period, kind, ref),
  check (amount_due_minor = charged_minor + carried_out_minor),
  check ((kind = 'monthly') = (ref = ''))
);
create index if not exists billing_charges_carried_idx on public.billing_charges (truck_id) where state = 'carried' and carried_into is null;

-- ── billing_usage: the usage ledger only ─────────────────────────────────────────────────────────────────────────────
alter table public.billing_invoices drop constraint if exists billing_invoices_truck_id_period_fkey;
alter table public.billing_invoices drop constraint if exists billing_invoices_truck_id_period_key;
alter table public.billing_usage drop constraint if exists billing_usage_check1;
alter table public.billing_usage drop constraint if exists billing_usage_state_check;
alter table public.billing_usage
  drop column if exists plan_fee_minor, drop column if exists plan_days, drop column if exists extra_vans_minor,
  drop column if exists carried_in_minor, drop column if exists amount_due_minor, drop column if exists charged_minor,
  drop column if exists carried_out_minor, drop column if exists min_charge_minor;
alter table public.billing_usage add column if not exists charge_id uuid references public.billing_charges(id);
alter table public.billing_usage add constraint billing_usage_state_check check (state in ('open', 'billed'));
alter table public.billing_usage add constraint billing_usage_billed_chk check ((state = 'billed') = (charge_id is not null));
alter table public.billing_usage_orders add column if not exists plan_key text;
alter table public.billing_usage_orders add column if not exists fee_bps integer not null default 0 check (fee_bps >= 0);

-- ── billing_invoices: one per charge ─────────────────────────────────────────────────────────────────────────────────
alter table public.billing_invoices add column if not exists charge_id uuid not null unique references public.billing_charges(id);
alter table public.billing_invoices add column if not exists late_fee_minor integer check (late_fee_minor is null or late_fee_minor >= 0);
alter table public.billing_invoices add column if not exists replaced_stripe_invoice_id text;

-- ── plan history ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.truck_plan_history (
  id                bigserial primary key,
  truck_id          text not null references public.trucks(id) on delete cascade,
  plan_key          text not null,
  trial_expires_at  timestamptz,
  changed_at        timestamptz not null,
  source            text not null check (source in ('before_first_change', 'insert', 'update'))
);
create index if not exists truck_plan_history_truck_idx on public.truck_plan_history (truck_id, changed_at);

create or replace function public.trucks_record_plan_history() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  -- Nothing is recorded while billing is switched off (nothing is billed, so nothing needs a history).
  if not coalesce((select ps.billing_enabled from public.platform_switches ps where ps.id), false) then
    return new;
  end if;
  begin
    if tg_op = 'INSERT' then
      insert into public.truck_plan_history (truck_id, plan_key, trial_expires_at, changed_at, source)
        values (new.id, new.plan, new.trial_expires_at, now(), 'insert');
    elsif new.plan is distinct from old.plan or new.trial_expires_at is distinct from old.trial_expires_at then
      if not exists (select 1 from public.truck_plan_history h where h.truck_id = new.id) then
        insert into public.truck_plan_history (truck_id, plan_key, trial_expires_at, changed_at, source)
          values (old.id, old.plan, old.trial_expires_at, '-infinity', 'before_first_change');
      end if;
      insert into public.truck_plan_history (truck_id, plan_key, trial_expires_at, changed_at, source)
        values (new.id, new.plan, new.trial_expires_at, now(), 'update');
    end if;
  exception when others then
    -- 🔴 a failure to record never blocks a plan change
    raise warning 'truck_plan_history: could not record % for %: %', tg_op, new.id, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.trucks_record_plan_history() from public, anon, authenticated;
drop trigger if exists trucks_record_plan_history on public.trucks;
create trigger trucks_record_plan_history after insert or update of plan, trial_expires_at on public.trucks
  for each row execute function public.trucks_record_plan_history();

-- ── the world guard: fee plans where Stripe forbids an application fee — only with billing on and the fee billed monthly ─
create or replace function public.plan_prices_world_guard()
returns trigger language plpgsql set search_path to 'public' as $$
declare bad text;
begin
  -- a) an offered row that charges a fee where HatchGrab may not take one FROM THE PAYMENT — unless billing is switched on and
  --    that country bills the fee monthly instead (billing-1: country_billing (b) or (c))
  select string_agg(pp.country_code || ' (' || pp.plan_key || ')', ', ' order by pp.country_code, pp.plan_key) into bad
    from public.plan_prices pp join public.country_settings cs on cs.country_code = pp.country_code
   where pp.offered and pp.fee_bps > 0 and not cs.platform_fee_allowed
     and not (
       coalesce((select ps.billing_enabled from public.platform_switches ps where ps.id), false)
       and exists (select 1 from public.country_billing cb where cb.country_code = pp.country_code and cb.payment_model <> 'fee_from_payment'));
  if bad is not null then
    raise exception 'plan_prices: these offered plans charge a platform fee where HatchGrab may not take one: %', bad
      using errcode = 'check_violation';
  end if;
  -- b) a switched-on country whose trial-end plan is not offered there
  select string_agg(cs.country_code, ', ' order by cs.country_code) into bad
    from public.country_settings cs
   where cs.enabled
     and not exists (
       select 1 from public.plan_prices pp
        where pp.country_code = cs.country_code and pp.offered
          and pp.plan_key = coalesce(
                (select t.plan_key from public.plan_prices t where t.country_code = cs.country_code and t.is_trial_end),
                (select p.key from public.plans p where p.is_expiry_fallback)));
  if bad is not null then
    raise exception 'country_settings: the plan a finished trial drops to is not offered in: %', bad
      using errcode = 'check_violation';
  end if;
  return null;
end $$;
revoke all on function public.plan_prices_world_guard() from public, anon, authenticated;

-- ── security ─────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.billing_charges enable row level security;
alter table public.truck_plan_history enable row level security;
revoke all on public.billing_charges, public.truck_plan_history from anon, authenticated, public;
revoke all on sequence public.truck_plan_history_id_seq from anon, authenticated, public;

commit;

-- ── read-only checks after it runs ───────────────────────────────────────────────────────────────────────────────────
-- select count(*) filter (where late_fee_minor = 0), count(*) from country_billing;                   -- 44, 44
-- select tgname, tgenabled from pg_trigger where tgname = 'trucks_record_plan_history';
-- select count(*) from truck_plan_history; select count(*) from billing_charges;                    -- 0, 0
-- select plan_key, country_code, offered from plan_prices where country_code in ('BR','MX','MY','SG','TH') and plan_key <> 'unlimited';  -- all false
