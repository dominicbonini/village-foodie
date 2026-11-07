-- supabase/migrations/20261082_compare_autopublish_1_semi_deep.sql — compare-autopublish-1, THE SEMI-DEEP CHECK (Dominic's Q2 = A + C, 7 November 2026;
-- docs/compare-autopublish-1-report.md). For every switched-on country except the UAE: the competitors its comparison page would show (the
-- four-cap's choice among every entry — the admin view), each ONCE, in this order: GB, US, IE, AU, CA, NZ first, then SG, DE, AT, LI, then
-- the rest by code; within a country in the four's own order.
-- 🔴 IT WAITS FOR THE NEW CHECKER CODE. Only the list is stored here (competitor_check_settings.semi_deep). The checker's first run on the code
-- of this brief (after Dominic pushes main) turns it into ordinary "Check now" requests, staggered in this order, and makes the competitors'
-- core and commercial features without a pages record due (lib/competitor-check/semi-deep.ts) — the normal routine run, queue and budget
-- (requested competitors first; the $8 daily cap spreads them over the next nights). The code running tonight does not read the column, so
-- nothing is checked before the routine check also second-checks every monthly price (needed to publish it automatically).
-- Cost: 73 competitors × (the routine average $0.061 per check over 10 runs + ≈ $0.02 of price second checks) ≈ $5.90; worst case (the
-- dearest run's $0.209 a check + $0.03) ≈ $17.50 — under the brief's $25 stop. The $8 daily cap: one night likely, at most three.

begin;

alter table public.competitor_check_settings add column if not exists semi_deep jsonb;

do $$
declare ids jsonb; n integer;
begin
  with cand as (
    select e.country_code cc, c.id, row_number() over (partition by e.country_code order by e.pinned desc,
             case c.category when 'food_truck' then 0 when 'general_pos' then 1 when 'marketplace' then 2 when 'restaurant' then 3 else 4 end, e.sort_order, c.name) rn
      from public.comparison_entries e
      join public.competitors c on c.id = e.competitor_id
      join public.country_settings cs on cs.country_code = e.country_code and cs.enabled
     where not e.hidden and c.lifecycle = 'active' and not (c.added_as_candidate and c.features_verified_at is null)
       and coalesce(trim(c.website), '') <> '' and e.country_code <> 'AE'),
  ordered as (
    select id, min(coalesce(array_position(array['GB','US','IE','AU','CA','NZ','SG','DE','AT','LI'], cc),
                            100 + (ascii(substr(cc, 1, 1)) - 65) * 26 + (ascii(substr(cc, 2, 1)) - 65)) * 10 + rn) pos
      from cand where rn <= 4 group by id)
  select jsonb_agg(id order by pos), count(*) into ids, n from ordered;
  if n <> 73 then raise exception 'compare-autopublish-1 semi-deep: expected 73 competitors, the list has %', n; end if;
  update public.competitor_check_settings set semi_deep = jsonb_build_object('requested_at', now(), 'status', 'waiting', 'ids', ids, 'features', 'core+commercial without pages');
end $$;

commit;
