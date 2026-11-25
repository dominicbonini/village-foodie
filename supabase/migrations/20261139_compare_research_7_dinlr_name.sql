-- 20261139_compare_research_7_dinlr_name.sql — compare-research-7 (25 November 2026; docs/compare-research-7-report.md).
-- The new competitor Dinlr (SG, MY) was imported under the agent's label "Dinlr (Dinlr Online Order)"; the comparison pages show names, so
-- it becomes "Dinlr" (the plan keeps "Dinlr Waiter + Dinlr Online Order"), as earlier runs did for Fudo, Blink and others.
-- Competitor data only: 1 competitors row. Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight (rolled back).
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitors where name = 'Dinlr (Dinlr Online Order)';
  if n <> 1 then raise exception 'compare-research-7: expected one competitor named "Dinlr (Dinlr Online Order)", found %', n; end if;
  select count(*) into n from public.competitors where lower(name) = 'dinlr';
  if n <> 0 then raise exception 'compare-research-7: a competitor named "Dinlr" already exists'; end if;
end $$;

update public.competitors set name = 'Dinlr' where name = 'Dinlr (Dinlr Online Order)';

do $$
declare n int;
begin
  select count(*) into n from public.competitors where name = 'Dinlr';
  if n <> 1 then raise exception 'compare-research-7: Dinlr was not renamed'; end if;
end $$;

commit;
