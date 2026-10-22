-- 20261029_allergen_card_only.sql — allergen-card-country (21 October 2026; docs/allergen-card-country-report.md).
-- ⚠️ NOT RUN when written. "RUN NOW" — BEFORE the deploy: the loader (lib/country-settings.ts) names its columns, and
-- the code from this workstream selects this one, so the column must exist first. Adding it changes nothing for the
-- code running today (it never selects it).
--
-- 🔴 Whether a country lets a truck show its allergens as ONE CARD for the whole menu (trucks.allergen_display_mode =
-- 'card'). On everywhere (the default) except where the country's law requires allergen information per dish:
-- Ireland (FSAI — in writing, per dish; "Our food contains…" is not acceptable; docs/address-formats-diagnosis-report.md
-- §3). When off: the allergen wizard and the menu import skip the card-or-per-dish question (per dish), /api/manage
-- refuses 'card', and a truck already on 'card' is shown per dish on its order page with a notice in Manage.
begin;

alter table public.country_settings add column if not exists allergen_card_only_allowed boolean not null default true;
comment on column public.country_settings.allergen_card_only_allowed is
  'Whether trucks in this country may show allergens as one allergen card for the whole menu (allergen_display_mode = card). False where the law requires allergen information per dish (Ireland, FSAI). Admin › Countries.';

update public.country_settings set allergen_card_only_allowed = false, updated_at = now(), updated_by = 'allergen-card-country'
  where country_code = 'IE';

commit;

-- verify — after the commit
select country_code, enabled, allergen_card_only_allowed from public.country_settings order by country_code;
