-- 20261010_02_country_settings.sql
-- Country settings, Part A, file 2 of 9: ONE row per country, holding every price, fee, tax rule, format
-- and allowed option the app needs per country — plan prices included (one table, not two).
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent, so re-running is safe.
--
-- ✅ CLASSIFICATION: ADDITIVE. A brand-new table that no deployed code reads. SAFE TO RUN NOW.
--    Nothing reads it until Part B; until then every UK value still comes from the code constants.
--
-- ── 🔴 SERVICE ROLE ONLY: RLS ON, NO POLICIES, NO GRANTS TO anon / authenticated ──────────────────────
-- V12.1 (3 September 2026): a policy named "service role full access" was granted to `public`, and the
-- anon key in the page source returned every truck's dashboard token. The service role bypasses RLS by
-- construction and never needs a policy. So this table gets NONE: with RLS enabled and zero policies,
-- anon and authenticated read nothing — and the REVOKE removes the default grants as well, so it is not
-- merely default-denied. The app reads it server-side with the service role only.
--
-- ── NULL PRICES ARE "NOT DECIDED", AND THE SCHEMA STOPS AN UNDECIDED COUNTRY OPENING ─────────────────
-- The six plan price columns are nullable so a country can be described before its prices are decided
-- (the US row, 20261010_04). country_settings_enabled_needs_prices_chk refuses enabled = true while any
-- of the six is NULL, so a country cannot accept signups with no price to show or charge. The app must
-- treat a NULL here as a LOUD failure, never as a fallback to the GB figure (manual, "Currency and
-- country": an unknown (country, plan) is a loud failure).
--
-- ── UNITS ───────────────────────────────────────────────────────────────────────────────────────────
-- *_minor columns: integer minor units of THIS ROW'S currency (pence for GBP, cents for USD). Never
-- pounds, never numeric — same rule as order_payments.amount_minor.
-- *_pct columns: percent as written, numeric(5,2): 0.99 means 0.99%, 1.50 means 1.5%.
--
-- VERIFY AFTER APPLYING:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'country_settings' order by ordinal_position;
--   -- expect 40 rows
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.country_settings'::regclass order by conname;
--   select relrowsecurity from pg_class where oid = 'public.country_settings'::regclass;  -- expect t
--   select count(*) from pg_policies where schemaname = 'public' and tablename = 'country_settings';  -- expect 0
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'country_settings'
--      and grantee in ('anon', 'authenticated', 'public');   -- expect 0 rows

set lock_timeout = '3s';

begin;

create table if not exists public.country_settings (
  -- ── identity ──
  country_code                    text          primary key,
  name                            text          not null,
  enabled                         boolean       not null default false,

  -- ── money and formats ──
  currency                        text          not null,
  locale                          text          not null,
  time_format                     text          not null,
  date_order                      text          not null,
  week_start                      text          not null,
  phone_country_code              text          not null,
  address_format                  text          not null,
  timezones                       text[]        not null,
  default_timezone                text          not null,

  -- ── tax ──
  prices_include_tax              boolean       not null,
  tax_label                       text          not null,

  -- ── what a truck in this country may switch on ──
  card_surcharge_allowed          boolean       not null default false,
  card_surcharge_cap_pct          numeric(5,2),
  card_surcharge_credit_only      boolean       not null default true,
  card_surcharge_excluded_regions text[]        not null default '{}',
  service_fee_allowed             boolean       not null default false,
  tipping_enabled_default         boolean       not null default false,
  tip_presets_pct                 numeric(5,2)[] not null default '{}',
  allergen_set                    text          not null,

  -- ── HatchGrab plan prices (NULL = not decided; see the enabled check) ──
  starter_monthly_minor           integer,
  pro_monthly_minor               integer,
  max_monthly_minor               integer,
  pro_allowance_minor             integer,
  max_allowance_minor             integer,
  platform_fee_pct                numeric(5,2),

  -- ── Stripe's card fees as we quote them ──
  card_fee_online_pct             numeric(5,2)  not null,
  card_fee_online_fixed_minor     integer       not null,
  card_fee_in_person_pct          numeric(5,2)  not null,
  card_fee_in_person_fixed_minor  integer       not null,
  tap_to_pay_fixed_minor          integer       not null,
  card_fee_region_label           text          not null,

  -- ── the cost comparison's prefilled competitor ──
  competitor_name                 text,
  competitor_pct                  numeric(5,2),
  competitor_fixed_minor          integer,

  support_hours                   text,

  updated_at                      timestamptz   not null default now(),
  updated_by                      text,

  -- ── CHECKS ──
  constraint country_settings_code_chk      check (country_code ~ '^[A-Z]{2}$'),
  constraint country_settings_currency_chk  check (currency ~ '^[A-Z]{3}$'),
  constraint country_settings_phone_chk     check (phone_country_code ~ '^[1-9][0-9]{0,2}$'),

  constraint country_settings_time_format_chk    check (time_format    in ('24h', '12h')),
  constraint country_settings_date_order_chk     check (date_order     in ('dmy', 'mdy')),
  constraint country_settings_week_start_chk     check (week_start     in ('monday', 'sunday')),
  constraint country_settings_address_format_chk check (address_format in ('postcode', 'zip_state')),
  constraint country_settings_allergen_set_chk   check (allergen_set   in ('uk14', 'us9')),

  constraint country_settings_default_tz_chk check (default_timezone = any (timezones)),

  -- every percentage 0–100 (a NULL passes, as a CHECK on NULL is not false)
  constraint country_settings_surcharge_cap_pct_chk check (card_surcharge_cap_pct between 0 and 100),
  constraint country_settings_platform_fee_pct_chk  check (platform_fee_pct       between 0 and 100),
  constraint country_settings_online_pct_chk        check (card_fee_online_pct    between 0 and 100),
  constraint country_settings_in_person_pct_chk     check (card_fee_in_person_pct between 0 and 100),
  constraint country_settings_competitor_pct_chk    check (competitor_pct         between 0 and 100),
  constraint country_settings_tip_presets_chk       check (
    array_position(tip_presets_pct, null) is null
    and 0 <= all (tip_presets_pct)
    and 100 >= all (tip_presets_pct)
  ),

  -- every *_minor >= 0
  constraint country_settings_minor_nonneg_chk check (
        starter_monthly_minor          >= 0
    and pro_monthly_minor              >= 0
    and max_monthly_minor              >= 0
    and pro_allowance_minor            >= 0
    and max_allowance_minor            >= 0
    and card_fee_online_fixed_minor    >= 0
    and card_fee_in_person_fixed_minor >= 0
    and tap_to_pay_fixed_minor         >= 0
    and competitor_fixed_minor         >= 0
  ),

  -- 🔴 a country that accepts signups must have every plan price decided
  constraint country_settings_enabled_needs_prices_chk check (
    not enabled or (
          starter_monthly_minor is not null
      and pro_monthly_minor     is not null
      and max_monthly_minor     is not null
      and pro_allowance_minor   is not null
      and max_allowance_minor   is not null
      and platform_fee_pct      is not null
    )
  )
);

-- ⚠️ minor_nonneg_chk is ONE check over nine nullable columns. `a >= 0 and NULL >= 0` is NULL when a
-- is fine, and a CHECK that evaluates to NULL PASSES — so a NULL column never trips it, and a negative
-- non-NULL column makes the whole expression false. That is the intended reading.

alter table public.country_settings enable row level security;
-- NO policies. See the header: V12.1.
revoke all on public.country_settings from anon, authenticated, public;
grant select, insert, update, delete on public.country_settings to service_role;

comment on table public.country_settings is
  'ONE row per country: plan prices, allowances, platform fee, Stripe card fees as quoted, tax treatment, formats, and the options a truck in that country may switch on. Every country-specific value is read from here — nothing country-specific stays hardcoded. SERVICE ROLE ONLY: RLS is enabled with NO policies and anon/authenticated hold no grants, so the app reads it server-side with the service role and never from a browser. Reason: the V12.1 incident (3 September 2026), where a policy named for the service role was granted to public and the anon key returned every dashboard token. Do not add a policy here.';
comment on column public.country_settings.enabled is
  'Can trucks sign up from this country. Cannot be true while any of the six plan price columns is NULL (country_settings_enabled_needs_prices_chk).';
comment on column public.country_settings.prices_include_tax is
  'Whether MENU prices a truck shows its customers include sales tax / VAT (true for GB: VAT-inclusive; false for US: tax added at checkout). NOT about HatchGrab''s own plan prices, which the GB Terms state are ex-VAT.';
comment on column public.country_settings.card_fee_region_label is
  'Which cards the quoted card fees apply to, as shown to operators: GB ''UK cards'', US ''US cards''. One label for both the online and in-person rates (decision 10 October 2026).';
comment on column public.country_settings.starter_monthly_minor is
  'Monthly plan price in minor units of this row''s currency. NULL = not decided; the app must fail loudly, never fall back to another country''s figure.';
comment on column public.country_settings.platform_fee_pct is
  'HatchGrab''s own fee on online-order value above the plan allowance, percent as written (0.99 = 0.99%). Ours, unlike the card_fee_* columns, which are Stripe''s.';
comment on column public.country_settings.tap_to_pay_fixed_minor is
  'ADDITIONAL per-authorisation charge for contactless taken on a phone or tablet with no dedicated reader, minor units. Stated separately, never folded into the in-person rate.';
comment on column public.country_settings.competitor_name is
  'The provider the cost comparison page prefills as "what you pay today". Display and prefill only; NULL hides the prefill.';

commit;

notify pgrst, 'reload schema';
