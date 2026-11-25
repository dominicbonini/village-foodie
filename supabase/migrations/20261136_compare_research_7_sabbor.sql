-- 20261136_compare_research_7_sabbor.sql — compare-research-7 review (25 November 2026; docs/compare-research-7-report.md).
-- Sabbor (GT, 065d9dc6) fails §91's V16.38 rule "not a confirmed live product": its only site is a Cloudflare Pages default host
-- (restaurant-saas-monorepo.pages.dev) and it shows no real customer — sample order cards, "Solicitar demo" / "Empezar prueba gratis",
-- a "Próximamente" plan with a waitlist (docs/compare-research-7/agent-3/raw/V-Sabbor.json). The conservative choice (Dominic's standing
-- instruction for this run): it no longer counts. GT is not live (Sabbor was its only counted tool), so no page changes.
-- Competitor data only: 1 competitors row. Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight (rolled back).
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitors
   where id = '065d9dc6-6975-52b1-9eeb-d4d0b288e9b4' and name = 'Sabbor' and lifecycle = 'active' and website = 'https://restaurant-saas-monorepo.pages.dev';
  if n <> 1 then raise exception 'compare-research-7: expected Sabbor active on its pages.dev host, found % row(s)', n; end if;
  select count(*) into n from public.comparison_publish where country_code = 'GT' and auto_live;
  if n <> 0 then raise exception 'compare-research-7: GT is live — stop (this change must not take a page down)'; end if;
end $$;

update public.competitors
   set lifecycle = 'not_relevant',
       notes = coalesce(notes || ' · ', '') || 'not relevant (compare-research-7, 25 Nov; V16.38 "not a confirmed live product"): its only site is a pages.dev default host and it shows no real customers (sample orders, demo / free-trial buttons, a waitlist)'
 where id = '065d9dc6-6975-52b1-9eeb-d4d0b288e9b4' and lifecycle = 'active';

do $$
declare n int;
begin
  select count(*) into n from public.competitors where id = '065d9dc6-6975-52b1-9eeb-d4d0b288e9b4' and lifecycle = 'not_relevant';
  if n <> 1 then raise exception 'compare-research-7: Sabbor was not marked not relevant'; end if;
end $$;

commit;
