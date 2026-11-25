-- 20261133_compare_research_4_corrections.sql — compare-research-4 (25 November 2026; docs/compare-research-4-report.md).
-- Corrections to rows already imported that the importer cannot make (it corrects a plan only when its PRICE changes, and replaces an
-- answer only when the stored one is bare). Competitor data only: 3 competitor_plans rows and 1 competitor_feature_values answer.
-- Guarded: any surprise raises and nothing is written. Pre-flighted with scripts/compare-db-proofs.cjs --preflight (rolled back).
--   · Toss Place KR "토스오더 픽업주문" (0 KRW): its own site does not state the pickup-order fee in force today (the 2025 story offers
--     «주문 수수료 0원으로 써보기», the 2024 one planned 3.5 % excl. VAT) → unclear (Dominic: KR must not go live with it counted).
--   · Fudo CL "Tu Delivery" (0 CLP): no quote on fu.do/es-cl states it has no monthly fee (only «Las primeras 25 ventas son sin costo.
--     Luego pagas una tasa de servicio del 1,9% + IVA…») → unclear, as Dominic asked.
--   · Resto ZA "Shop" (R1000): now quoted verbatim from its own site («Resto's simple pricing - R1000/month», resto.co.za) → not unclear.
--   · Pedix `ahead` (every country): the stored quote was only an article title; replaced by a sentence from that article's body
--     (the old answer is superseded, kept as history).
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_plans
   where id in ('99d8a60a-6ea6-534e-bd6b-193b1174e04c', '7ae635e1-f7a8-5ce8-be67-060c9f1fe559') and superseded_at is null and not unclear;
  if n <> 2 then raise exception 'compare-research-4: expected Toss Place KR and Fudo CL plans current and not unclear, found %', n; end if;
  select count(*) into n from public.competitor_plans where id = 'a83cd6f5-4a94-5e89-b740-d27882ec379d' and superseded_at is null and unclear and monthly_minor = 100000 and currency = 'ZAR';
  if n <> 1 then raise exception 'compare-research-4: expected Resto ZA Shop (R1000, unclear) current, found %', n; end if;
  select count(*) into n from public.competitor_feature_values
   where id = 'dc9cfa42-4723-4722-b085-52ddc1fbb073' and competitor_id = 'c615e67d-1760-5314-9a81-b3d5ad2a06f0' and feature_key = 'ahead'
     and country_code is null and superseded_at is null and verified_at is null;
  if n <> 1 then raise exception 'compare-research-4: expected Pedix''s current, unverified every-country ahead answer, found %', n; end if;
end $$;

update public.competitor_plans
   set unclear = true,
       notes = coalesce(notes || ' · ', '') || 'marked unclear (compare-research-4, Dominic 25 Nov): its own site does not state the pickup-order fee in force today (2025: «주문 수수료 0원으로 써보기»; 2024: 3.5 % excl. VAT planned)'
 where id = '99d8a60a-6ea6-534e-bd6b-193b1174e04c' and superseded_at is null and not unclear;

update public.competitor_plans
   set unclear = true,
       notes = coalesce(notes || ' · ', '') || 'marked unclear (compare-research-4, Dominic 25 Nov): no quote on fu.do/es-cl states that Tu Delivery has no monthly fee'
 where id = '7ae635e1-f7a8-5ce8-be67-060c9f1fe559' and superseded_at is null and not unclear;

update public.competitor_plans
   set unclear = false,
       notes = coalesce(notes || ' · ', '') || 'not unclear (compare-research-4, 25 Nov): quoted verbatim from its own site: «Resto''s simple pricing - R1000/month» (https://resto.co.za)'
 where id = 'a83cd6f5-4a94-5e89-b740-d27882ec379d' and superseded_at is null and unclear;

update public.competitor_feature_values set superseded_at = now()
 where id = 'dc9cfa42-4723-4722-b085-52ddc1fbb073' and superseded_at is null;

insert into public.competitor_feature_values (competitor_id, feature_key, country_code, value, note, quote, source_url, checked_on)
values ('c615e67d-1760-5314-9a81-b3d5ad2a06f0', 'ahead', null, 'partial',
        'online ordering for collection at the venue (compare-research-4, 25 Nov: a sentence from the article''s body replaces its bare title); a chosen time is not stated',
        'La opción "Retiro en persona" permite que tus clientes hagan el pedido desde el catálogo online y pasen luego a buscarlo por el local.',
        'https://ayuda.pedix.app/es/article/como-configurar-la-opcion-retiro-en-persona', '2026-11-25');

do $$
declare n int;
begin
  select count(*) into n from public.competitor_plans where id in ('99d8a60a-6ea6-534e-bd6b-193b1174e04c', '7ae635e1-f7a8-5ce8-be67-060c9f1fe559') and unclear;
  if n <> 2 then raise exception 'compare-research-4: Toss / Fudo CL plans not both unclear (%)', n; end if;
  select count(*) into n from public.competitor_plans where id = 'a83cd6f5-4a94-5e89-b740-d27882ec379d' and not unclear;
  if n <> 1 then raise exception 'compare-research-4: Resto ZA still unclear'; end if;
  select count(*) into n from public.competitor_feature_values
   where competitor_id = 'c615e67d-1760-5314-9a81-b3d5ad2a06f0' and feature_key = 'ahead' and country_code is null and superseded_at is null;
  if n <> 1 then raise exception 'compare-research-4: Pedix has % current ahead answers, expected 1', n; end if;
end $$;

commit;
