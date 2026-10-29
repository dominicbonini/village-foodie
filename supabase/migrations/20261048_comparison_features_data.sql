-- supabase/migrations/20261048_comparison_features_data.sql — comparison-features-1 (29 October 2026,
-- docs/comparison-features-1-report.md). RUN 29 Oct 2026 14:41 UTC (219 answers moved; checked read-only afterwards). This
-- version replaces a temporary table with a CTE per statement, so a re-run in the Supabase SQL editor works and changes nothing.
--
-- 1 · MOVES today's fixed feature columns into public.competitor_feature_values, one row per competitor and feature for
--     every country (country_code null), KEEPING their verification and checked date:
--       pre_orders → preorder · whatsapp → whatsapp · social_posts → social · own_domain → domain · ios_app → ipad
--       android_app → android · capacity_slots → capacity · multi_location_schedule → schedule · kds → kds
--       pay_at_truck → payattruck · payment_methods → paymethods (the text as the note) · min_term → term (the text as the note)
--     Only what says something moves: a tri column still 'unknown' with no text has nothing to move. The two texts arrive
--     with value 'unknown' and the text as the note ("as advertised"); the checker gives them a value later.
--     Safe in either order with the importer: a placeholder row the importer may already have written ('unknown', no note,
--     no source) is superseded first, and a row that already says something is never overwritten. Safe to run twice.
-- 2 · RETIRES the old columns (comments only — nothing is dropped; no code reads them after this deploy) and
--     country_benchmarks' app columns (the pricing check reads country_settings' app flags, as the comparison page does).

begin;

-- ── 1 · the move ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Each statement carries the old columns as its own CTE (no temporary table: the Supabase SQL editor does not keep one
-- between statements — the first version's "relation legacy_feature_values does not exist", 29 Oct 2026).

-- A placeholder the importer wrote (unknown, nothing stated) gives way to the moved value.
with legacy as (
  select c.id as competitor_id, m.feature_key, m.value, nullif(left(btrim(coalesce(m.note, '')), 300), '') as note,
         c.features_checked_on as checked_on, c.features_verified_at as verified_at
  from public.competitors c
  cross join lateral (values
    ('preorder',   c.pre_orders,              null::text),
    ('whatsapp',   c.whatsapp,                null),
    ('social',     c.social_posts,            null),
    ('domain',     c.own_domain,              null),
    ('ipad',       c.ios_app,                 null),
    ('android',    c.android_app,             null),
    ('capacity',   c.capacity_slots,          null),
    ('schedule',   c.multi_location_schedule, null),
    ('kds',        c.kds,                     null),
    ('payattruck', c.pay_at_truck,            null),
    ('paymethods', 'unknown',                 c.payment_methods),
    ('term',       'unknown',                 c.min_term)
  ) as m(feature_key, value, note)
  where m.value in ('yes', 'no') or nullif(btrim(coalesce(m.note, '')), '') is not null
)
update public.competitor_feature_values v set superseded_at = now()
from legacy l
where v.competitor_id = l.competitor_id and v.feature_key = l.feature_key and v.country_code is null and v.superseded_at is null
  and v.value = 'unknown' and v.note is null and v.quote is null and v.source_url is null;

with legacy as (
  select c.id as competitor_id, m.feature_key, m.value, nullif(left(btrim(coalesce(m.note, '')), 300), '') as note,
         c.features_checked_on as checked_on, c.features_verified_at as verified_at
  from public.competitors c
  cross join lateral (values
    ('preorder',   c.pre_orders,              null::text),
    ('whatsapp',   c.whatsapp,                null),
    ('social',     c.social_posts,            null),
    ('domain',     c.own_domain,              null),
    ('ipad',       c.ios_app,                 null),
    ('android',    c.android_app,             null),
    ('capacity',   c.capacity_slots,          null),
    ('schedule',   c.multi_location_schedule, null),
    ('kds',        c.kds,                     null),
    ('payattruck', c.pay_at_truck,            null),
    ('paymethods', 'unknown',                 c.payment_methods),
    ('term',       'unknown',                 c.min_term)
  ) as m(feature_key, value, note)
  where m.value in ('yes', 'no') or nullif(btrim(coalesce(m.note, '')), '') is not null
)
insert into public.competitor_feature_values (competitor_id, feature_key, country_code, value, note, checked_on, verified_at)
select l.competitor_id, l.feature_key, null, l.value, l.note, l.checked_on, l.verified_at
from legacy l
where not exists (
  select 1 from public.competitor_feature_values v
  where v.competitor_id = l.competitor_id and v.feature_key = l.feature_key and v.country_code is null and v.superseded_at is null
);

-- ── 2 · retired columns (comments only) ──────────────────────────────────────────────────────────────────────────────
comment on column public.competitors.pre_orders              is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (preorder). No code reads it.';
comment on column public.competitors.whatsapp                is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (whatsapp). No code reads it.';
comment on column public.competitors.social_posts            is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (social). No code reads it.';
comment on column public.competitors.own_domain              is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (domain). No code reads it.';
comment on column public.competitors.ios_app                 is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (ipad). No code reads it.';
comment on column public.competitors.android_app             is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (android). No code reads it.';
comment on column public.competitors.capacity_slots          is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (capacity). No code reads it.';
comment on column public.competitors.multi_location_schedule is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (schedule). No code reads it.';
comment on column public.competitors.kds                     is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (kds). No code reads it.';
comment on column public.competitors.pay_at_truck            is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (payattruck). No code reads it.';
comment on column public.competitors.payment_methods         is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (paymethods, as the note). No code reads it.';
comment on column public.competitors.min_term                is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (term, as the note). No code reads it.';
comment on column public.country_benchmarks.ios_app_available     is 'RETIRED 29 Oct 2026 (comparison-features-1): the pricing check reads country_settings.ios_app_available, as the comparison page does.';
comment on column public.country_benchmarks.android_app_available is 'RETIRED 29 Oct 2026 (comparison-features-1): the pricing check reads country_settings.android_app_available, as the comparison page does.';

commit;

-- Check:
--   select feature_key, value, count(*), count(verified_at) as verified from public.competitor_feature_values where superseded_at is null group by 1, 2 order by 1, 2;
