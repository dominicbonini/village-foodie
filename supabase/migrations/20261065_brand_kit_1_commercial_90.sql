-- 20261065_brand_kit_1_commercial_90.sql — brand-kit-1 part 1 (3 November 2026, docs/brand-kit-1-report.md): COMPETITOR PRICES ARE
-- CHECKED EVERY 90 DAYS.
--
-- WHY: Dominic (brand-kit-1 brief): competitor_check_settings.tier_intervals.commercial 30 → 90; core (90) and secondary (180)
-- unchanged. The checker reads the intervals as data (lib/competitor-check/core.ts tierIntervalsOut), so nothing in code changes.
-- GUARD: only the commercial key is written, and only while the row reads exactly {"commercial": 30, "core": 90, "secondary": 180}
-- (read live on 3 Nov 2026); afterwards it must read {"commercial": 90, "core": 90, "secondary": 180}. Anything else raises.
-- Safe to run twice: the second run finds it already at 90 and changes nothing.

begin;

do $$
declare cur jsonb;
begin
  select tier_intervals into cur from public.competitor_check_settings where id;
  if cur = '{"commercial": 30, "core": 90, "secondary": 180}'::jsonb then
    update public.competitor_check_settings set tier_intervals = jsonb_set(tier_intervals, '{commercial}', '90'::jsonb) where id;
  elsif cur is distinct from '{"commercial": 90, "core": 90, "secondary": 180}'::jsonb then
    raise exception 'brand-kit-1: tier_intervals reads %, not the 30/90/180 this migration expects — stop and ask', cur;
  end if;
  if (select tier_intervals from public.competitor_check_settings where id) is distinct from '{"commercial": 90, "core": 90, "secondary": 180}'::jsonb then
    raise exception 'brand-kit-1: tier_intervals is not 90/90/180 after the update';
  end if;
end $$;

commit;
