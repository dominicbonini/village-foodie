-- 20261145_compare_square_1.sql — compare-square-1 (Dominic's decisions of 26 November 2026; docs/compare-square-1-report.md).
-- Competitor and comparison tables only. What the importer can't do (data/compare-square-1/competitors.json did the rest):
--   1 · competitors.food_truck_class (text, null, 'A' or 'B') — foodtruck-audit-1 §2b's classes, plus Eventifood, Hatches Up and
--       What The Truck as A. The publish step ranks A, then B, then the rest (lib/comparison-publish.ts).
--   2 · Chuzmonster's website lme.jp (a third-party article site) → order.yapp.li, its own Takeout page («Takeoutは固定料金…»).
--   3 · What The Truck's cardfee answer: included on its own payment provider (the importer never replaces a quoted answer).
--   4 · Square's per-country answers in its 8 countries (ahead, monthly, cardfee), from its own country pages read on 26 Nov.
--   5 · the shown plan of Square AU (its new Square Online Free) and of What The Truck GB (its new plan).
-- Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight-square (rolled back).
begin;

alter table public.competitors add column food_truck_class text null check (food_truck_class in ('A', 'B'));
comment on column public.competitors.food_truck_class is 'compare-square-1: A built for food-truck vendors, B a general tool that sells to them (foodtruck-audit-1 §2b); null not classed';

create temporary table cs1_class (prefix text, name text, cls text);
insert into cs1_class values
  ('640ecd44','Beau Camion','A'), ('a207b996','Eatch','A'), ('598df7ba','Food Pronto','A'), ('18f621da','Food Truck Pub','A'), ('10aba63d','Goodfynd','A'),
  ('2f51f8db','HungryTrucks','A'), ('647a5e78','Moonrise','A'), ('11e41caa','Nomad (nomadcaisse.fr)','A'), ('6dc60fd2','Ordea','A'), ('0947b3fc','Place à emporter','A'),
  ('a36488cf','Truckly','A'), ('ccd6121e','Where''s The Foodtruck','A'), ('e6a09d6e','モバレジ (Mobaregi, EDDYS FACTORY)','A'), ('6afa79bc','Eventifood','A'),
  ('fbbf6c37','Hatches Up','A'), ('3f0b6c2e','What The Truck','A'),
  ('a9825e32','4SaleFood','B'), ('d06ae0d2','Click & Collection','B'), ('ece796a2','Digitale Menukaart','B'), ('b94c7a14','DISH','B'), ('662c9884','Foodticket','B'),
  ('d03a6e1f','FoxiFood','B'), ('fbfecac2','Frivo','B'), ('7e12931c','Fudo','B'), ('a59dfb20','gastro25','B'), ('abd86253','GastroDok','B'), ('b32f19c9','Grafterr','B'),
  ('5c901b17','iShopo','B'), ('2a0e471f','Jitmeal','B'), ('79fcc90d','Liefersoft','B'), ('b70bbf5e','MenuForma','B'), ('aed7bf67','Order Tiger','B'), ('1cccb6df','Orderly','B'),
  ('000f94fa','Payli','B'), ('c71ae83d','Perkss','B'), ('0802a7c8','Poster','B'), ('3cc2b17f','Qrder','B'), ('53395fcb','QRM.hu','B'), ('b6a1a595','Qromo','B'),
  ('6fa20b90','Rent-a-Shop','B'), ('7734b770','Restomax','B'), ('841dfd9e','Restora POS','B'), ('d41b0ca7','SmakSpace','B'), ('9c855eec','Software Food Good','B'),
  ('c4972b72','StandMágus / OnlineMágus','B'), ('5f28f634','Tilby','B'), ('cff055db','VexMenu','B'), ('462996c6','WEIQ','B'), ('8c7188e7','Y wait','B'), ('aebf5a80','Yoveletta','B');

do $$
declare bad int;
begin
  select count(*) into bad from cs1_class k where (select count(*) from public.competitors c where left(c.id::text, 8) = k.prefix and c.name = k.name) <> 1;
  if bad > 0 then raise exception 'compare-square-1: % class rows do not match exactly one competitor by id prefix and name', bad; end if;
  if (select count(*) from cs1_class) <> 50 then raise exception 'compare-square-1: expected 50 class rows'; end if;
end $$;

update public.competitors c set food_truck_class = k.cls from cs1_class k where left(c.id::text, 8) = k.prefix and c.name = k.name;

-- 2 · Chuzmonster's own site
do $$
begin
  if (select count(*) from public.competitors where left(id::text, 8) = 'da91c9a7' and website = 'https://lme.jp') <> 1 then
    raise exception 'compare-square-1: Chuzmonster (website lme.jp) not found as expected'; end if;
end $$;
update public.competitors
   set website = 'https://order.yapp.li', check_urls = array['https://order.yapp.li/takeout'],
       notes = coalesce(notes || ' · ', '') || 'website corrected (compare-square-1, 26 Nov): lme.jp is a third-party article site; its own page is https://order.yapp.li/takeout («Takeoutは固定料金なので、モバイルオーダーの売上が増えても料金は一切変わりません。»)'
 where left(id::text, 8) = 'da91c9a7' and website = 'https://lme.jp';

-- 3 · What The Truck's cardfee (every country; it sells in GB only)
do $$
begin
  if (select count(*) from public.competitor_feature_values where competitor_id = '3f0b6c2e-8d4a-4b7e-9a51-6e2f1d0c7a93' and feature_key = 'cardfee'
       and country_code is null and superseded_at is null and verified_at is null) <> 1 then
    raise exception 'compare-square-1: What The Truck''s current cardfee answer not found as expected'; end if;
end $$;
update public.competitor_feature_values set superseded_at = now()
 where competitor_id = '3f0b6c2e-8d4a-4b7e-9a51-6e2f1d0c7a93' and feature_key = 'cardfee' and country_code is null and superseded_at is null;
insert into public.competitor_feature_values (competitor_id, feature_key, country_code, value, note, quote, source_url, checked_on)
values ('3f0b6c2e-8d4a-4b7e-9a51-6e2f1d0c7a93', 'cardfee', null, 'yes',
  'included on its own payment provider (card fees are on it, from the first month); its terms §6 say other providers'' fees «are set by them» (https://whatthetruck.ai/terms)',
  '100% of every sale paid with a UK personal card is yours, with nothing deducted. … The offer for free in-person card rates for the first month is subject to the use of our card terminal and payment provider.',
  'https://whatthetruck.ai/pricing', '2026-11-26');

-- 4 · Square's per-country answers (its own country pages, 26 Nov): ahead (Square Online pickup), monthly, cardfee (online · in person)
create temporary table cs1_sq (cc text, k text, v text, note text, quote text, url text);
insert into cs1_sq values
  ('US','ahead','partial','Square Online: customers order online and pick up; a chosen time is not stated for the Free plan','Pickup, local delivery, and shipping','https://squareup.com/us/en/online-store/plans'),
  ('CA','ahead','partial','Square Online: customers order online and pick up; a chosen time is not stated for the Free plan','Offer in-person and curbside pickup, global shipping and delivery by your own staff.','https://squareup.com/ca/en/online-store/plans'),
  ('GB','ahead','partial','Square Online: customers order online and collect; a chosen time is not stated for the Free plan','Offer click and collect, global shipping and delivery by your own staff.','https://squareup.com/gb/en/online-store/plans'),
  ('IE','ahead','partial','Square Online: customers order online and collect; a chosen time is not stated for the Free plan','Offer click and collect, global shipping and delivery by your own staff.','https://squareup.com/ie/en/online-store/plans'),
  ('AU','ahead','partial','Square Online: customers order online and pick up; a chosen time is not stated for the Free plan','Offer in-person and kerbside pickup, global shipping and delivery by your own staff.','https://squareup.com/au/en/online-store/plans'),
  ('JP','ahead','partial','Square Online: customers order online and collect in store; a chosen time is not stated for the Free plan','店舗での受け取り、デリバリー','https://squareup.com/jp/ja/online-store/plans'),
  ('FR','ahead','partial','Square Online: customers order online and collect; a chosen time is not stated for the Free plan','Retrait, livraison locale et expédition','https://squareup.com/fr/fr/online-store/plans'),
  ('ES','ahead','partial','Square Online: customers order online and collect; a chosen time is not stated for the Free plan','Opciones de recogida, entrega a domicilio o envío de pedidos','https://squareup.com/es/es/online-store/plans'),
  ('US','monthly','yes','Square Free $0 a month; Square Plus $49 a month per location (billing period not stated)','$0/mo. | per location','https://squareup.com/us/en/online-store/plans'),
  ('CA','monthly','yes','Free $0; Plus $36 a month billed annually','$0 | No monthly fees','https://squareup.com/ca/en/online-store/plans'),
  ('GB','monthly','yes','Free £0; Plus £20 a month billed annually','£0 | No monthly fees','https://squareup.com/gb/en/online-store/plans'),
  ('IE','monthly','yes','Free €0; Plus €25 a month billed annually','€0 | No monthly fees','https://squareup.com/ie/en/online-store/plans'),
  ('AU','monthly','yes','Free $0; Plus $36 a month billed annually','$0 | No monthly fees','https://squareup.com/au/en/online-store/plans'),
  ('JP','monthly','yes','フリー ¥0; プラス ¥3,780 a month billed monthly (¥3,375 billed yearly)','¥0 | 月額固定費なし','https://squareup.com/jp/ja/online-store/plans'),
  ('FR','monthly','yes','Gratuit 0 €; Plus 25 € HT a month billed annually','0 € | Pas de frais mensuels','https://squareup.com/fr/fr/online-store/plans'),
  ('ES','monthly','yes','Gratuito 0 €; Plus 25 € + IVA a month billed annually','0 € | Sin cuotas mensuales','https://squareup.com/es/es/online-store/plans'),
  ('US','cardfee','yes','Square''s own processing: online 3.3% + 30¢, in person 2.6% + 15¢ (Square Free; Square Plus 2.9% + 30¢ / 2.5% + 15¢)','Tap, dip, or swipe | 2.6% + 15¢ | Online | 3.3% + 30¢','https://squareup.com/us/en/online-store/plans'),
  ('CA','cardfee','yes','Square''s own processing: online 2.8% + $0.30, in person 2.5% (credit cards)','2.5% per transaction* | Card not present | … 2.8% + 30¢ per transaction*','https://squareup.com/ca/en/pricing'),
  ('GB','cardfee','yes','Square''s own processing: online 1.4% + 25p (UK cards), in person 1.75% (UK cards)','1.75% for transactions with UK cards · 1.4% + 25p per UK card','https://squareup.com/gb/en/pricing'),
  ('IE','cardfee','yes','Square''s own processing: online 1.4% + 25c + VAT, in person 1.75% + VAT (EU + EEA cards)','1.75% + VAT per transaction with EU + EEA cards · 1.4% + 25c + VAT per transaction with EU + EEA cards','https://squareup.com/ie/en/pricing'),
  ('AU','cardfee','yes','Square''s own processing: online 2.2%, in person 1.6%','1.6% per in-person transaction · 2.2% per transaction','https://squareup.com/au/en/pricing'),
  ('JP','cardfee','yes','Square''s own processing: online 3.6%, in person 2.5% (under ¥30m a year, major card brands)','対面決済手数料: 2.5%* · オンライン 3.6%','https://squareup.com/jp/ja/pricing'),
  ('FR','cardfee','yes','Square''s own processing: online 1,4 % + 0,25 €, in person from 1,65 % (EU + EEA cards)','Frais de traitement à partir de 1,65 % par transaction avec des cartes en provenance de l’UE et de l’EEE · 1,4 % + 0,25 €','https://squareup.com/fr/fr/pricing'),
  ('ES','cardfee','yes','Square''s own processing: online 1,4 % + 0,25 €, in person 1,25 % + 0,05 € (EU + EEA cards)','1,25 % + 0,05 € Comisión por transacción con tarjeta de la UE y del EEE · 1,4 % + 0,25 €','https://squareup.com/es/es/pricing');

do $$
begin
  if (select count(*) from cs1_sq) <> 24 then raise exception 'compare-square-1: expected 24 Square answers'; end if;
  if exists (select 1 from public.competitor_feature_values v join cs1_sq s on s.cc = v.country_code and s.k = v.feature_key
             where v.competitor_id = '9acae7b6-2af6-4800-93ee-0be972e22314' and v.superseded_at is null) then
    raise exception 'compare-square-1: Square already has a per-country answer for one of these'; end if;
end $$;
insert into public.competitor_feature_values (competitor_id, feature_key, country_code, value, note, quote, source_url, checked_on)
select '9acae7b6-2af6-4800-93ee-0be972e22314', k, cc, v, note, quote, url, '2026-11-26' from cs1_sq;

-- 5 · the shown plans
do $$
begin
  if (select count(*) from public.competitor_plans where id in ('9da9b9d8-029c-512e-b2ef-38305fcceae7', '8c777139-ad56-5b20-93c1-b9f44dc8bb1c') and superseded_at is null) <> 2 then
    raise exception 'compare-square-1: the imported plans (Square AU Free, What The Truck GB) are not there — run the import first'; end if;
end $$;
update public.comparison_entries set primary_plan_id = '9da9b9d8-029c-512e-b2ef-38305fcceae7' where id = '5b395f46-11d1-5ee1-b1e5-b1e8b55bb176' and primary_plan_id = '838091e0-5442-55e8-931b-2c7fd03ceb24';
update public.comparison_entries set primary_plan_id = '8c777139-ad56-5b20-93c1-b9f44dc8bb1c' where id = 'ac889d5d-eda0-4fa6-a1e1-f1f190b5ca77' and primary_plan_id = 'b7e41d58-2c9f-4e06-8a3d-91c5f0e2b647';

do $$
begin
  if (select count(*) from public.competitors where food_truck_class = 'A') <> 16 or (select count(*) from public.competitors where food_truck_class = 'B') <> 34 then
    raise exception 'compare-square-1: the classes were not all written'; end if;
  if (select count(*) from public.comparison_entries where (id = '5b395f46-11d1-5ee1-b1e5-b1e8b55bb176' and primary_plan_id = '9da9b9d8-029c-512e-b2ef-38305fcceae7')
       or (id = 'ac889d5d-eda0-4fa6-a1e1-f1f190b5ca77' and primary_plan_id = '8c777139-ad56-5b20-93c1-b9f44dc8bb1c')) <> 2 then
    raise exception 'compare-square-1: the two entries'' plans were not set'; end if;
  if (select count(*) from public.competitors where left(id::text, 8) = 'da91c9a7' and website = 'https://order.yapp.li') <> 1 then
    raise exception 'compare-square-1: Chuzmonster''s website not set'; end if;
end $$;

drop table cs1_class;
drop table cs1_sq;

commit;
