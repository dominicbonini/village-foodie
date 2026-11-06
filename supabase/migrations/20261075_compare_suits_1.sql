-- supabase/migrations/20261075_compare_suits_1.sql — compare-suits-1 (6 November 2026, docs/compare-suits-1-report.md).
-- COMPARISON PAGES: AT MOST FOUR COMPETITORS PER COUNTRY, "ABSENCE MEANS NO", AND THE PAGES EACH CHECK READ.
--   • comparison_entries.pinned / hidden          — Admin's per-country choices (both false). The selection rule (lib/comparison-selection.ts):
--                                                   hidden never shows; pinned first; capped at four. Only Admin writes them.
--   • competitors.category / category_by          — food_truck | general_pos | restaurant | marketplace (null = not known). category_by
--                                                   'auto' (filled from the checker's focus) or 'admin' (Admin's choice — never overwritten).
--   • comparison_features.never_competitor_strength — never produces a "competitor strength" answer (card readers, tills, card payments).
--   • comparison_features.absence_means_no         — a feature a company would certainly advertise: "not mentioned" may be shown as
--                                                   "not listed", ONLY when that check fetched the features and pricing pages (and the
--                                                   help centre where one exists). Both columns are Admin's; the importer never writes them.
--   • competitor_feature_checks.pages_checked     — the pages the check that last asked about a feature read: URL, kind (features /
--                                                   pricing / help / other), whether it fetched, the API's error code, when.
--   • competitor_check_settings.pass_fetch_help   — whether a check also READS the help centre (false: it only notes whether one exists).
-- DATA: the two flags set per the brief; category filled from focus where focus is clear; unverified comparison entries for GB and US
-- from every competitor with a current plan there (Dominic's Q2 = B — never public until verified, like every entry).
-- No protected table is altered or written (trucks, orders, plans, plan_prices, plan_features, country_settings).

begin;

alter table public.comparison_entries add column if not exists pinned boolean not null default false;
alter table public.comparison_entries add column if not exists hidden boolean not null default false;

alter table public.competitors add column if not exists category text;
alter table public.competitors add column if not exists category_by text;
alter table public.competitors drop constraint if exists competitors_category_check;
alter table public.competitors add constraint competitors_category_check
  check (category is null or category in ('food_truck', 'general_pos', 'restaurant', 'marketplace'));
alter table public.competitors drop constraint if exists competitors_category_by_check;
alter table public.competitors add constraint competitors_category_by_check
  check (category_by is null or category_by in ('auto', 'admin'));

alter table public.comparison_features add column if not exists never_competitor_strength boolean not null default false;
alter table public.comparison_features add column if not exists absence_means_no boolean not null default false;

alter table public.competitor_feature_checks add column if not exists pages_checked jsonb;
alter table public.competitor_feature_checks drop constraint if exists competitor_feature_checks_pages_checked_check;
alter table public.competitor_feature_checks add constraint competitor_feature_checks_pages_checked_check
  check (pages_checked is null or jsonb_typeof(pages_checked) = 'object');

alter table public.competitor_check_settings add column if not exists pass_fetch_help boolean not null default false;

-- ── the two feature flags (the brief's lists; every other feature keeps false) ──
update public.comparison_features set never_competitor_strength = true
  where key in ('terminal', 'hardware', 'fiscal', 'cards', 'paymethods', 'cardfee');
update public.comparison_features set absence_means_no = true
  where key in ('whatsapp', 'social', 'schedule', 'ipad', 'android', 'kds', 'perorder', 'domain', 'qr', 'delivery', 'loyalty');

-- ── category from the checker's focus, where it is clear (pop_up, street_food_markets and none stay null) ──
update public.competitors
   set category = case focus when 'food_truck' then 'food_truck' when 'pos' then 'general_pos' when 'nearest_local' then 'restaurant' end,
       category_by = 'auto'
 where category is null and focus in ('food_truck', 'pos', 'nearest_local');

-- ── GB and US: one unverified entry per competitor with a current plan there ──
-- The plan shown: its cheapest current plan that is counted and priced, else its first current plan by name.
insert into public.comparison_entries (country_code, competitor_id, primary_plan_id, sort_order)
select x.country_code, x.competitor_id, x.plan_id,
       100 + row_number() over (partition by x.country_code order by x.name)
  from (
    select distinct on (p.country_code, p.competitor_id)
           p.country_code, p.competitor_id, p.id as plan_id, c.name
      from public.competitor_plans p
      join public.competitors c on c.id = p.competitor_id
     where p.superseded_at is null and p.country_code in ('GB', 'US')
     order by p.country_code, p.competitor_id,
              (p.status = 'counted' and p.monthly_minor is not null and not p.price_hidden) desc,
              p.monthly_minor asc nulls last, p.plan_name asc
  ) x
 where not exists (select 1 from public.comparison_entries e where e.country_code = x.country_code and e.competitor_id = x.competitor_id);

commit;
