-- supabase/migrations/20261039_pricing_check.sql — pricing-check-1 (23 October 2026): the admin "Pricing check" tab's
-- three tables. ⛔ NOT RUN — Dominic runs it ("run now": nothing reads these tables until the tab is deployed, and the
-- tab says so plainly while they are missing).
--
-- 🔴 SECURITY MIRRORS country_settings (manual §76.1, §81.2): RLS on, NO policies, every grant revoked from anon,
-- authenticated and public. Only the service role (app/api/admin/pricing-check, behind the admin check) reads or writes.
--
-- 🔴 THE HISTORY RULE: a competitor's price is never edited in place. An edit INSERTS a new competitor_plans row and
-- stamps superseded_at on the old one, so the history is kept and verification starts again on the new row. The same
-- for country_benchmarks (at most one current row per country — the partial unique index below).
--
-- country_code has NO foreign key on purpose: planned countries (BR, MX, JP…) and France have no country_settings row.

begin;

create table public.competitors (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (length(btrim(name)) > 0),
  website              text,
  -- NULL = not recorded (the four tools added from the manual, §21, whose focus it does not state).
  focus                text check (focus in ('food_truck', 'street_food_markets', 'nearest_local', 'pop_up')),
  payment_providers    text,
  pre_orders           text not null default 'unknown' check (pre_orders   in ('yes', 'no', 'unknown')),
  whatsapp             text not null default 'unknown' check (whatsapp     in ('yes', 'no', 'unknown')),
  social_posts         text not null default 'unknown' check (social_posts in ('yes', 'no', 'unknown')),
  own_domain           text not null default 'unknown' check (own_domain   in ('yes', 'no', 'unknown')),
  ios_app              text not null default 'unknown' check (ios_app      in ('yes', 'no', 'unknown')),
  android_app          text not null default 'unknown' check (android_app  in ('yes', 'no', 'unknown')),
  features_checked_on  date,
  features_verified_at timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- The name is unique whatever its case ("MENU TIGER" and "MenuTiger" are one competitor).
create unique index competitors_name_ci_key on public.competitors (lower(btrim(name)));

create table public.competitor_plans (
  id                       uuid primary key default gen_random_uuid(),
  competitor_id            uuid not null references public.competitors (id) on delete restrict,
  country_code             text not null check (country_code ~ '^[A-Z]{2}$'),
  plan_name                text not null,
  currency                 char(3) not null check (currency ~ '^[A-Z]{3}$'),
  price_hidden             boolean not null default false,
  monthly_minor            integer check (monthly_minor >= 0),
  -- The price is only given per month, billed yearly (monthly_minor then holds that per-month figure).
  yearly_only              boolean not null default false,
  setup_minor              integer not null default 0 check (setup_minor >= 0),
  truck_fee_bps            integer not null default 0 check (truck_fee_bps >= 0),
  truck_fee_fixed_minor    integer not null default 0 check (truck_fee_fixed_minor >= 0),
  customer_fee_bps         integer not null default 0 check (customer_fee_bps >= 0),
  customer_fee_fixed_minor integer not null default 0 check (customer_fee_fixed_minor >= 0),
  card_mode                text not null default 'unknown' check (card_mode in ('bundled', 'separate', 'unknown')),
  card_bps                 integer check (card_bps >= 0),          -- NULL = not published
  card_fixed_minor         integer check (card_fixed_minor >= 0),  -- NULL = not published
  card_rate_assumed        boolean not null default false,
  order_cap                integer check (order_cap > 0),
  included_orders          integer check (included_orders >= 0),
  overage_fixed_minor      integer check (overage_fixed_minor >= 0),
  vat                      text not null default 'unknown' check (vat in ('incl', 'excl', 'unknown')),
  status                   text not null default 'counted' check (status in ('counted', 'hidden', 'closed', 'excluded')),
  unclear                  boolean not null default false,   -- their own site is ambiguous
  second_hand              boolean not null default false,   -- the price is from a third party, not their site
  source                   text not null check (source in ('research', 'manual', 'admin')),
  source_url               text,
  checked_on               date not null,
  verified_at              timestamptz,
  verified_by              uuid,
  notes                    text,
  superseded_at            timestamptz,
  created_at               timestamptz not null default now(),
  -- A counted plan has a price; a hidden one may not.
  constraint competitor_plans_counted_has_price check (status <> 'counted' or monthly_minor is not null)
);
create index competitor_plans_current_idx on public.competitor_plans (country_code) where superseded_at is null;
create index competitor_plans_competitor_idx on public.competitor_plans (competitor_id);

create table public.country_benchmarks (
  id                         uuid primary key default gen_random_uuid(),
  country_code               text not null check (country_code ~ '^[A-Z]{2}$'),
  currency                   char(3) not null check (currency ~ '^[A-Z]{3}$'),
  meal_minor                 integer not null check (meal_minor > 0),
  meal_source_label          text,
  meal_source_url            text,
  meal_source_ok             boolean not null default true,   -- false = not the cited source; needs checking
  order_multiplier           numeric not null default 1.3 check (order_multiplier > 0),
  eur_rate                   numeric not null check (eur_rate > 0),   -- units of `currency` per 1 EUR
  eur_rate_date              date not null,
  -- Our online card rate, used ONLY when the country has no country_settings row (planned countries, France).
  card_bps                   integer check (card_bps >= 0),
  card_fixed_minor           integer check (card_fixed_minor >= 0),
  -- Proposed prices for a planned country — shown everywhere as "proposed, not live".
  planned_pro_minor          integer check (planned_pro_minor >= 0),
  planned_pro_included_minor integer check (planned_pro_included_minor >= 0),
  planned_unlimited_minor    integer check (planned_unlimited_minor >= 0),
  ios_app_available          boolean,   -- NULL = unknown
  android_app_available      boolean,   -- NULL = unknown
  -- pricing-check-1: not in the brief's column list, added because two of its own fixes need a note to live in
  -- ("not Numbeo — check", "Stripe takes no cards in Indonesia").
  notes                      text,
  checked_on                 date not null,
  superseded_at              timestamptz,
  created_at                 timestamptz not null default now()
);
create unique index country_benchmarks_one_current on public.country_benchmarks (country_code) where superseded_at is null;

alter table public.competitors        enable row level security;
alter table public.competitor_plans   enable row level security;
alter table public.country_benchmarks enable row level security;

revoke all on table public.competitors        from anon, authenticated, public;
revoke all on table public.competitor_plans   from anon, authenticated, public;
revoke all on table public.country_benchmarks from anon, authenticated, public;

comment on table public.competitors        is 'pricing-check-1: competitor tools and their six key features. Admin only (service role).';
comment on table public.competitor_plans   is 'pricing-check-1: one competitor plan in one country. Never updated in place: an edit inserts a new row and stamps superseded_at on the old.';
comment on table public.country_benchmarks is 'pricing-check-1: a country''s meal price, exchange rate and (planned countries) proposed prices. At most one current row per country.';

commit;
