-- supabase/migrations/20261071_costs_accounts_1_hk_tax_year.sql — costs-accounts-1 follow-up (5 November 2026, docs/costs-accounts-1-report.md).
-- WHERE HONG KONG'S TAX YEAR STARTS: 1 April (to 31 March, the year of assessment), for Reports' "Last tax year" preset.
-- Only the two tax-year columns of the HK row change; nothing else in country_settings is touched.
-- ⚠️ A WRITE TO country_settings (a protected table, 35.ao-5): approved by Dominic on 5 November 2026 (costs-accounts-1, question 2 → A).

begin;

update public.country_settings set tax_year_start_month = 4, tax_year_start_day = 1 where country_code = 'HK';

commit;

-- Check (read-only):
--   select country_code, tax_year_start_month, tax_year_start_day from country_settings where tax_year_start_month is not null order by 1;
