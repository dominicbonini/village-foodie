-- 20261064_tidy_2_real_thai_food.sql — tidy-2 item 3 (3 November 2026, docs/tidy-2-report.md): REAL THAI FOOD MOVES TO PAY AS YOU GO.
--
-- WHY: approved by Dominic (tidy-2 brief): Real Thai Food's trial ended on 30 September 2026; it goes onto plan 'payg', is no longer
-- counted as a customer, and has no plan end date.
-- Run by Claude with scripts/db-migrate.cjs --approved-by-dominic (the trucks write is his explicit approval in the tidy-2 brief).
-- GUARD: the one row with slug 'real-thai-food' is changed only if it reads exactly plan = 'trial', is_customer = true,
-- trial_expires_at = 2026-09-30 (read live on 3 Nov 2026: 2026-09-30 00:00:00+00). Otherwise it raises and changes nothing.
-- Only plan, is_customer and trial_expires_at are written; no other column, no other truck. Run twice, the second run raises
-- (the row no longer reads as the guard expects) — that is the guard working, and nothing is written.

begin;

do $$
declare matched integer; changed integer;
begin
  select count(*) into matched from public.trucks
   where slug = 'real-thai-food' and plan = 'trial' and is_customer = true and trial_expires_at = '2026-09-30 00:00:00+00'::timestamptz;
  if matched <> 1 then
    raise exception 'tidy-2: real-thai-food does not read plan = trial, is_customer = true, trial_expires_at = 2026-09-30 — stop and show Dominic the row';
  end if;

  update public.trucks set plan = 'payg', is_customer = false, trial_expires_at = null
   where slug = 'real-thai-food' and plan = 'trial' and is_customer = true and trial_expires_at = '2026-09-30 00:00:00+00'::timestamptz;
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'tidy-2: expected to change exactly 1 truck, changed %', changed;
  end if;
end $$;

commit;
