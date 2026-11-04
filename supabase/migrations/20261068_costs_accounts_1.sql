-- supabase/migrations/20261068_costs_accounts_1.sql — costs-accounts-1 (4 November 2026, docs/costs-accounts-1-report.md).
-- WHAT ONE PORTION OF A DISH COSTS THE TRUCK, WITH ITS HISTORY; AND WHERE A COUNTRY'S TAX YEAR STARTS.
--
-- 1 · public.menu_item_costs — one row per dish per truck-local day the cost was set. A report uses, for each order, the row
--     with the latest effective_from on or before the order's event date (lib/accounts/ledger.ts costOn), so changing a cost
--     never rewrites past profit. Setting it twice on one day replaces that day's row (unique item + day). cost_minor NULL =
--     "no cost from this day" (the operator cleared the box). Minor units of `currency` (the truck's; JPY has no decimals).
--     🔴 PRIVATE: RLS on, no policy, nothing granted to anon or authenticated — read and written only by the service role,
--     through lib/accounts/costs-server.ts, for Manage (owner or manager). It is a separate table ON PURPOSE: every customer
--     surface (the public menu API, the order page, the KDS, tickets) reads menu_items_db, which has no cost column.
-- 2 · public.country_settings.tax_year_start_month / tax_year_start_day — where the country's tax year starts (GB 6 April,
--     AU 1 July, NZ 1 April). Both NULL = the calendar year (1 January). Columns only: this file writes NO row (the values are
--     20261069, a separate file).

begin;

create table if not exists public.menu_item_costs (
  id              bigserial primary key,
  truck_id        text not null references public.trucks(id) on delete cascade,
  item_id         uuid not null references public.menu_items_db(id) on delete cascade,
  cost_minor      integer check (cost_minor is null or (cost_minor >= 0 and cost_minor <= 100000000)),
  currency        text not null check (currency ~ '^[A-Z]{3}$'),
  effective_from  date not null,
  created_at      timestamptz not null default now(),
  created_by      text,
  constraint menu_item_costs_one_per_day_uq unique (item_id, effective_from)
);
create index if not exists menu_item_costs_truck_idx on public.menu_item_costs (truck_id, item_id, effective_from);

alter table public.menu_item_costs enable row level security;
revoke all on public.menu_item_costs from anon, authenticated;
revoke all on sequence public.menu_item_costs_id_seq from anon, authenticated;

comment on table public.menu_item_costs is
  'costs-accounts-1: what one portion of a dish costs the truck (ingredients and packaging), with history. PRIVATE: service role only; never on a customer surface.';

alter table public.country_settings
  add column if not exists tax_year_start_month smallint,
  add column if not exists tax_year_start_day smallint;
alter table public.country_settings drop constraint if exists country_settings_tax_year_start_chk;
alter table public.country_settings add constraint country_settings_tax_year_start_chk check (
  (tax_year_start_month is null and tax_year_start_day is null)
  or (tax_year_start_month between 1 and 12 and tax_year_start_day between 1 and 28)
);

commit;

-- Check (read-only):
--   select relrowsecurity from pg_class where relname = 'menu_item_costs';
--   select grantee, privilege_type from information_schema.role_table_grants where table_name = 'menu_item_costs' and grantee in ('anon','authenticated');
--   select column_name, data_type from information_schema.columns where table_name = 'country_settings' and column_name like 'tax_year%';
