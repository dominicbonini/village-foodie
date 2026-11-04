-- supabase/migrations/20261069_costs_accounts_1_tax_years.sql — costs-accounts-1 (4 November 2026, docs/costs-accounts-1-report.md).
-- WHERE THE TAX YEAR STARTS, for the three countries the brief names whose tax year is not the calendar year:
--   GB 6 April (to 5 April), AU 1 July (to 30 June), NZ 1 April (to 31 March).
-- Every other country keeps both columns NULL = the calendar year (1 January to 31 December), as the brief says for the US and most
-- countries. Only the two new columns of these three rows change; nothing else in country_settings is touched.
-- ⚠️ A WRITE TO country_settings (a protected table, 35.ao-5): the values are the ones Dominic gave in the costs-accounts-1 brief.

begin;

update public.country_settings set tax_year_start_month = 4, tax_year_start_day = 6 where country_code = 'GB';
update public.country_settings set tax_year_start_month = 7, tax_year_start_day = 1 where country_code = 'AU';
update public.country_settings set tax_year_start_month = 4, tax_year_start_day = 1 where country_code = 'NZ';

commit;

-- Check (read-only):
--   select country_code, tax_year_start_month, tax_year_start_day from country_settings where tax_year_start_month is not null order by 1;
