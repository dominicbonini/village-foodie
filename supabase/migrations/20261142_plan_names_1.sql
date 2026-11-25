-- 20261142_plan_names_1.sql — plan-names-1 (Dominic approved the rename, 25 November 2026; docs/plan-names-1-report.md).
-- Data only. Renames the 90 current plans that are shown or marked on a live comparison page and whose stored name carried helper text
-- (brackets, quotes, "from", "monthly", "yearly", "plans", "per order"…) or English that the vendor's own page doesn't show. The new name
-- is the plan name exactly as the vendor's own page for that country shows it, or — where the vendor names no plan — the vendor's name.
-- ONLY public.competitor_plans.plan_name of the listed ids changes: every other column of every plan is checked by md5 before / after,
-- and so is every other plan's name. The importer's corrected-plans route can't rename (it supersedes and inserts a new plan id).
-- Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight (rolled back).
begin;

create temporary table plan_names_1_map (prefix text, country_code text, old_name text, new_name text);
insert into plan_names_1_map values
  ('c413ad17','LT','ared (one plan)','ared'),
  ('c06e5b78','MA','Asila (monthly)','Asila'),
  ('640ecd44','*','Click & Collect (module)','Click & Collect'),
  ('fedc794a','ZA','Start (1 product, e.g. Online)','Start'),
  ('2c3751b0','IN','Dinehere + own ordering app','Dinehere'),
  ('b94c7a14','HR','DISH Professional Order (12-month term)','DISH Professional Order'),
  ('a207b996','*','Standard (all-in-one: site, app, NF525 till, click & collect)','Standard'),
  ('647628e6','HK','QR code ordering (from)','Eats365'),
  ('58b9820f','NO','Alt-i-ett kassesystem (from)','Alt-i-ett kassesystem'),
  ('662c9884','NL','All-in (bestelsite + kassa + betaalsysteem)','Foodticket'),
  ('d03a6e1f','*','FoxiFood (no monthly fee, per order)','FoxiFood'),
  ('d03a6e1f','DE','Pay-per-Order (einziger Tarif)','FoxiFood'),
  ('d03a6e1f','AT','Pay-per-Order','FoxiFood'),
  ('abd86253','DE','Bestellsystem (monatlich)','Bestellsystem'),
  ('abd86253','AT','Bestellsystem Jährlich','Bestellsystem'),
  ('2f51f8db','NZ','Vendor (single plan shown)','HungryTrucks'),
  ('d4c5de98','TR','TekMenü (per order)','İletmen'),
  ('f44927e4','*','Core + Omni (webshop)','Core + Omni'),
  ('f44927e4','*','Core + Omni (webshop / QR ordering)','Core + Omni'),
  ('26c4e040','SA','Linkin1 PRO (E-Menu)','Linkin1 PRO'),
  ('832a682c','PR','Menufy online ordering','Menufy'),
  ('647a5e78','US','Pioneer (launch pricing)','Pioneer Launch Pricing'),
  ('69a3cfce','EG','Launch (Online Ordering)','Launch'),
  ('69a3cfce','KW','LaunchScale (Online Ordering)','Launch'),
  ('69a3cfce','*','Online Ordering Basic','Basic'),
  ('6dc60fd2','GI','Free (3% per order)','Free'),
  ('1cccb6df','HU','Alapcsomag (base subscription)','Alapcsomag'),
  ('0947b3fc','*','One-off installation (owned site)','Place à emporter'),
  ('0802a7c8','UA','Starter + Poster Site add-on','Starter + Poster Site'),
  ('53395fcb','HU','Alapszolgáltatás (QR menu base)','Alapcsomag'),
  ('c4972b72','HU','SM Max (includes OnlineMágus alap)','SM Max'),
  ('ddc61529','TH','แพ็คเกจเริ่มต้น (Starter)','แพ็คเกจเริ่มต้น'),
  ('d0eb16fa','LU','E-shop (Boutique en ligne)','Boutique en ligne'),
  ('5f28f634','*','Food truck till (from)','Tilby'),
  ('ef9dcbd8','PL','Online ordering tier 1','Zamówienia online'),
  ('462996c6','SE','Seasonal package','säsongspaket'),
  ('430c8cb2','CY','Online storefront','Wiiz Eat'),
  ('aebf5a80','LI','Food truck (from)','Yoveletta'),
  ('797df612','*','Zyda plans (lowest, ''from'')','Zyda'),
  ('e6a09d6e','JP','Single plan','モバレジ'),
  ('da91c9a7','JP','Flat','Takeout');

-- The listed ids: current plans of those names, shown or marked on a LIVE comparison page ('*' = every live country where shown).
create temporary table plan_names_1_ids as
with live as (select country_code, shown from public.comparison_publish where auto_publish and auto_live and not coalesce(admin_off, false)),
onpage as (
  select (x->>'planId')::uuid plan_id from live l, jsonb_array_elements(l.shown) x
  union
  select e.primary_plan_id from public.comparison_entries e join live l on l.country_code = e.country_code
   where e.auto_verified_at is not null and e.primary_plan_id is not null)
select p.id, p.plan_name old_name, m.new_name
  from public.competitor_plans p
  join plan_names_1_map m on left(p.competitor_id::text, 8) = m.prefix and p.plan_name = m.old_name and (m.country_code = '*' or m.country_code = p.country_code)
 where p.superseded_at is null and p.id in (select plan_id from onpage)
   -- left out: the new name is already a current plan of that vendor in that country (two current plans of one name would make the
   -- importer's name match ambiguous) — Eatch FR "Standard"; Perkss GB "Essential", pidopago ES "pidopago", Yoveletta CH "Gastro"
   -- (their map rows removed above). Flagged in the report.
   and not (left(p.competitor_id::text, 8) = 'a207b996' and p.country_code = 'FR');

create temporary table plan_names_1_before as
select (select md5(string_agg((to_jsonb(p) - 'plan_name')::text, '|' order by p.id)) from public.competitor_plans p) other_cols_md5,
       (select md5(string_agg(p.id::text || '=' || p.plan_name, '|' order by p.id)) from public.competitor_plans p
         where p.id not in (select id from plan_names_1_ids)) other_names_md5;

do $$
declare n int; bad int; dup int;
begin
  select count(*) into bad from plan_names_1_map m where (select count(*) from public.competitors c where left(c.id::text, 8) = m.prefix) <> 1;
  if bad > 0 then raise exception 'plan-names-1: % id prefixes do not name exactly one competitor', bad; end if;
  select count(*) into n from plan_names_1_ids;
  if n <> 90 then raise exception 'plan-names-1: expected 90 listed plans, found %', n; end if;
  select count(*) into bad from plan_names_1_map m where not exists (select 1 from plan_names_1_ids i where i.old_name = m.old_name);
  if bad > 0 then raise exception 'plan-names-1: % map rows matched no listed plan', bad; end if;
end $$;

update public.competitor_plans p set plan_name = i.new_name from plan_names_1_ids i where p.id = i.id;

do $$
declare n int; dup int; o text; nm text; ob text; nb text;
begin
  select count(*) into n from public.competitor_plans p join plan_names_1_ids i on i.id = p.id where p.plan_name = i.new_name;
  if n <> 90 then raise exception 'plan-names-1: only % of 90 renamed', n; end if;
  select other_cols_md5, other_names_md5 into ob, nb from plan_names_1_before;
  select md5(string_agg((to_jsonb(p) - 'plan_name')::text, '|' order by p.id)) into o from public.competitor_plans p;
  select md5(string_agg(p.id::text || '=' || p.plan_name, '|' order by p.id)) into nm from public.competitor_plans p where p.id not in (select id from plan_names_1_ids);
  if o <> ob then raise exception 'plan-names-1: a column other than plan_name changed'; end if;
  if nm <> nb then raise exception 'plan-names-1: an unlisted plan''s name changed'; end if;
  -- no renamed plan shares its name with another current plan of its vendor in its country (Grafterr GB's three "Free forever" are older)
  select count(*) into dup from plan_names_1_ids i join public.competitor_plans p on p.id = i.id
   where exists (select 1 from public.competitor_plans q where q.superseded_at is null and q.id <> p.id and q.competitor_id = p.competitor_id
                   and q.country_code = p.country_code and q.plan_name = p.plan_name);
  if dup > 0 then raise exception 'plan-names-1: % renamed plans now share a name with another current plan of their vendor and country', dup; end if;
  raise notice 'plan-names-1: 90 renamed; other columns md5 % = %; other plans'' names md5 % = %', ob, o, nb, nm;
end $$;

drop table plan_names_1_map;
drop table plan_names_1_ids;
drop table plan_names_1_before;

commit;
