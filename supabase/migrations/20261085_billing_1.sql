-- supabase/migrations/20261085_billing_1.sql — billing-1 (10 November 2026; docs/billing-1-report.md).
-- HatchGrab charging trucks: the per-country payment model, the truck's billing facts, the monthly usage ledger and the
-- invoices. BUILT SWITCHED OFF: platform_switches.billing_enabled is FALSE and nothing reads a row of these tables while it is.
--
--   • platform_switches.billing_enabled        — THE GLOBAL SWITCH, false. billing_pause_after_days (5): days an invoice may
--                                                stay unpaid before online ordering pauses.
--   • country_billing                          — one row per country: payment_model, the post-pay surcharge (0) and the
--                                                carry-over minimum charge (about £5 in the country's own currency).
--                                                  fee_from_payment  (a) online payments, the fee taken from each payment
--                                                  billed_online     (b) online payments, the fee billed monthly afterwards
--                                                  billed_at_truck   (c) pay at the truck, the fee billed monthly afterwards
--                                                Seeded: (b) where Stripe forbids an application fee (platform_fee_allowed =
--                                                false: BR, MX, MY, SG, TH), (a) everywhere else, (c) nowhere.
--   • operator_billing                         — the Stripe Customer per truck owner, on HatchGrab's platform account.
--   • truck_billing                            — per truck: post-pay chosen, the payment method on file and its state, the
--                                                cached billing status. A table of its own (not columns on trucks), so no
--                                                existing select('*') of a truck carries it. No row = the defaults.
--   • billing_usage                            — THE LEDGER: one row per truck per month (pre-order value counted, allowance
--                                                used, fee due, fee taken by application fee, fee billed, plan fee,
--                                                surcharge, carried in / out). Rebuilt from orders until it is invoiced.
--   • billing_usage_orders                     — the ledger's lines: every pre-order counted, with its share of the fee and
--                                                how that share was collected. One row per order.
--   • billing_invoices                         — one per truck per month at most (the unique key is the double-billing guard).
-- Every new table: RLS on, no policy, nothing granted to anon or authenticated (service role only).
-- 🔴 NO ROW OF ANY EXISTING TABLE IS UPDATED OR DELETED. country_billing is filled by INSERT … SELECT from country_settings
-- (read only); the only other insert is none. trucks, orders, plans, plan_prices, plan_features and country_settings are
-- untouched; Pizzeria Gusto has no row anywhere here.

begin;

-- ── the global switch ────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.platform_switches add column if not exists billing_enabled boolean not null default false;
alter table public.platform_switches add column if not exists billing_pause_after_days integer not null default 5;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_switches_billing_pause_days_chk') then
    alter table public.platform_switches add constraint platform_switches_billing_pause_days_chk
      check (billing_pause_after_days between 1 and 60);
  end if;
end $$;

-- ── per country ──────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.country_billing (
  country_code                    text primary key references public.country_settings(country_code) on delete cascade,
  payment_model                   text not null check (payment_model in ('fee_from_payment', 'billed_online', 'billed_at_truck')),
  post_pay_surcharge_bps          integer not null default 0 check (post_pay_surcharge_bps between 0 and 10000),
  post_pay_surcharge_fixed_minor  integer not null default 0 check (post_pay_surcharge_fixed_minor >= 0),
  min_charge_minor                integer not null check (min_charge_minor >= 0),
  updated_at                      timestamptz not null default now(),
  updated_by                      text
);

-- About £5 in each currency of the registry (lib/currencies.ts), in its Stripe minor units (JPY whole yen; HUF two-decimal).
-- A currency missing here makes min_charge_minor NULL and the insert FAIL — loud, never a guessed amount.
insert into public.country_billing (country_code, payment_model, min_charge_minor, updated_by)
select cs.country_code,
       case when cs.platform_fee_allowed then 'fee_from_payment' else 'billed_online' end,
       case cs.currency
         when 'GBP' then 500    when 'EUR' then 600    when 'USD' then 700    when 'CAD' then 900
         when 'AUD' then 1000   when 'NZD' then 1100   when 'CHF' then 600    when 'CZK' then 15000
         when 'DKK' then 4500   when 'HUF' then 250000 when 'NOK' then 7000   when 'SEK' then 7000
         when 'PLN' then 2500   when 'RON' then 3000   when 'BRL' then 3500   when 'MXN' then 13000
         when 'JPY' then 1000   when 'SGD' then 900    when 'HKD' then 5000   when 'MYR' then 3000
         when 'AED' then 2500   when 'THB' then 22000
       end,
       'billing-1'
from public.country_settings cs
on conflict (country_code) do nothing;

-- The fee can only be taken from a payment where Stripe allows an application fee (35.an-17).
create or replace function public.country_billing_fee_allowed_guard() returns trigger language plpgsql as $$
begin
  if new.payment_model = 'fee_from_payment'
     and exists (select 1 from public.country_settings cs where cs.country_code = new.country_code and not cs.platform_fee_allowed) then
    raise exception 'country_billing: % cannot take the fee from each payment — Stripe does not allow an application fee there (platform_fee_allowed = false)', new.country_code;
  end if;
  return new;
end $$;
drop trigger if exists country_billing_fee_allowed_guard on public.country_billing;
create trigger country_billing_fee_allowed_guard before insert or update on public.country_billing
  for each row execute function public.country_billing_fee_allowed_guard();

-- ── per truck owner: the Stripe Customer on HatchGrab's platform account ─────────────────────────────────────────────
create table if not exists public.operator_billing (
  operator_id         uuid primary key references public.operators(id) on delete cascade,
  stripe_customer_id  text not null unique,
  livemode            boolean not null,
  created_at          timestamptz not null default now()
);

-- ── per truck ────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.truck_billing (
  truck_id                   text primary key references public.trucks(id) on delete cascade,
  post_pay                   boolean not null default false,
  -- A test truck opts in here; nothing else is ever billed while is_customer is false.
  billing_test               boolean not null default false,
  payment_method_state       text not null default 'none' check (payment_method_state in ('none', 'pending', 'valid', 'failed')),
  payment_method_type        text check (payment_method_type is null or payment_method_type in ('card', 'pix', 'sepa_debit')),
  stripe_payment_method_id   text,
  stripe_setup_intent_id     text,
  payment_method_label       text check (payment_method_label is null or length(payment_method_label) <= 80),
  payment_method_updated_at  timestamptz,
  payment_method_livemode    boolean,
  -- A cache for Admin, written by lib/billing/status.ts refreshTruckBillingStatus. The GATE never reads it: it derives the
  -- status from the facts every time (lib/billing/rules.ts billingStatusOf), so the cache cannot hold ordering paused.
  status                     text check (status is null or status in ('trialling', 'active', 'past_due', 'paused')),
  status_reason              text,
  status_changed_at          timestamptz,
  updated_at                 timestamptz not null default now(),
  updated_by                 text
);

-- ── the ledger ───────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.billing_usage (
  truck_id                 text not null references public.trucks(id) on delete cascade,
  period                   date not null check (extract(day from period) = 1),
  currency                 text not null,
  country_code             text not null,
  payment_model            text not null check (payment_model in ('fee_from_payment', 'billed_online', 'billed_at_truck')),
  post_pay                 boolean not null,
  plan_key                 text not null,
  preorder_count           integer not null default 0 check (preorder_count >= 0),
  counted_online_minor     integer not null default 0 check (counted_online_minor >= 0),
  counted_at_truck_minor   integer not null default 0 check (counted_at_truck_minor >= 0),
  counted_minor            integer not null default 0 check (counted_minor >= 0),
  allowance_minor          integer check (allowance_minor is null or allowance_minor >= 0),   -- null = unlimited
  allowance_used_minor     integer not null default 0 check (allowance_used_minor >= 0),
  fee_bps                  integer not null default 0 check (fee_bps >= 0),
  fee_due_minor            integer not null default 0 check (fee_due_minor >= 0),
  fee_taken_minor          integer not null default 0 check (fee_taken_minor >= 0),          -- by application fee, net of refunds
  fee_billed_minor         integer not null default 0 check (fee_billed_minor >= 0),
  plan_fee_minor           integer not null default 0 check (plan_fee_minor >= 0),
  plan_days                integer not null default 0 check (plan_days >= 0),
  period_days              integer not null check (period_days between 28 and 31),
  extra_vans_minor         integer not null default 0 check (extra_vans_minor >= 0),
  surcharge_minor          integer not null default 0 check (surcharge_minor >= 0),
  carried_in_minor         integer not null default 0 check (carried_in_minor >= 0),
  amount_due_minor         integer not null default 0 check (amount_due_minor >= 0),
  charged_minor            integer not null default 0 check (charged_minor >= 0),
  carried_out_minor        integer not null default 0 check (carried_out_minor >= 0),
  min_charge_minor         integer not null default 0 check (min_charge_minor >= 0),
  inputs_digest            text not null,
  -- 'open' (rebuildable) · 'invoiced' (frozen: an invoice exists) · 'carried' (frozen: under the minimum, carried forward) ·
  -- 'nothing' (frozen: nothing owed).
  state                    text not null default 'open' check (state in ('open', 'invoiced', 'carried', 'nothing')),
  computed_at              timestamptz not null default now(),
  primary key (truck_id, period),
  check (counted_minor = counted_online_minor + counted_at_truck_minor),
  check (amount_due_minor = charged_minor + carried_out_minor)
);

create table if not exists public.billing_usage_orders (
  order_key               uuid primary key,
  truck_id                text not null references public.trucks(id) on delete cascade,
  period                  date not null,
  placed_at               timestamptz not null,
  paid_online             boolean not null,
  food_minor              integer not null check (food_minor >= 0),
  counted_minor           integer not null check (counted_minor >= 0),
  allowance_before_minor  integer not null check (allowance_before_minor >= 0),
  fee_minor               integer not null check (fee_minor >= 0),
  -- how this order's fee share was collected: 'application_fee' (taken from the payment), 'invoice' (billed monthly) or
  -- 'none' (inside the allowance, or a 0% plan)
  fee_via                 text not null check (fee_via in ('application_fee', 'invoice', 'none')),
  fee_taken_minor         integer not null default 0 check (fee_taken_minor >= 0),
  foreign key (truck_id, period) references public.billing_usage(truck_id, period) on delete cascade
);
create index if not exists billing_usage_orders_period_idx on public.billing_usage_orders (truck_id, period);

-- ── invoices ─────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.billing_invoices (
  id                  uuid primary key default gen_random_uuid(),
  truck_id            text not null references public.trucks(id) on delete cascade,
  period              date not null,
  currency            text not null,
  amount_minor        integer not null check (amount_minor > 0),
  livemode            boolean not null,
  stripe_invoice_id   text unique,
  -- 'creating' (claimed, Stripe not finished) · 'open' (finalised, being collected) · 'paid' · 'failed' (a collection attempt
  -- failed; Stripe keeps retrying) · 'void' · 'uncollectible'
  status              text not null default 'creating' check (status in ('creating', 'open', 'paid', 'failed', 'void', 'uncollectible')),
  due_at              timestamptz,
  attempt_count       integer not null default 0,
  last_error          text check (last_error is null or length(last_error) <= 500),
  hosted_invoice_url  text,
  created_at          timestamptz not null default now(),
  finalized_at        timestamptz,
  paid_at             timestamptz,
  updated_at          timestamptz not null default now(),
  -- 🔴 THE DOUBLE-BILLING GUARD: one invoice per truck per month, ever.
  unique (truck_id, period),
  foreign key (truck_id, period) references public.billing_usage(truck_id, period)
);
create index if not exists billing_invoices_unpaid_idx on public.billing_invoices (truck_id) where status in ('open', 'failed');

-- ── security: service role only ──────────────────────────────────────────────────────────────────────────────────────
alter table public.country_billing enable row level security;
alter table public.operator_billing enable row level security;
alter table public.truck_billing enable row level security;
alter table public.billing_usage enable row level security;
alter table public.billing_usage_orders enable row level security;
alter table public.billing_invoices enable row level security;
revoke all on public.country_billing, public.operator_billing, public.truck_billing, public.billing_usage,
  public.billing_usage_orders, public.billing_invoices from anon, authenticated, public;
revoke all on function public.country_billing_fee_allowed_guard() from public, anon, authenticated;

commit;

-- ── read-only checks after it runs ───────────────────────────────────────────────────────────────────────────────────
-- select billing_enabled, billing_pause_after_days from platform_switches;                         -- false, 5
-- select payment_model, count(*) from country_billing group by 1;                                  -- fee_from_payment 39, billed_online 5
-- select country_code from country_billing where payment_model = 'billed_online' order by 1;       -- BR MX MY SG TH
-- select count(*) from truck_billing; select count(*) from billing_usage; select count(*) from billing_invoices;   -- 0 0 0
