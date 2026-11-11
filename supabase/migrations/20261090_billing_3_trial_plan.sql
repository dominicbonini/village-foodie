-- 20261090_billing_3_trial_plan.sql — billing-3 (11 November 2026; docs/billing-3-report.md §5): THE PLAN A TRIAL ENDS INTO,
-- CHOSEN BY THE TRUCK. During the free trial, Manage › Billing › Change plan stores the owner's choice here; when the trial ends the
-- truck moves to it (lib/plans.ts effectivePlan reads it as the trial's fallback; the hourly run then sets trucks.plan to it). NULL =
-- no choice made = the country's trial-end plan (plan_prices.is_trial_end, else the plans table's expiry fallback), exactly as today.
-- Additive and nullable: no row changes; nothing reads it while billing is off and the truck is not a billing_test truck.
begin;

alter table public.truck_billing add column if not exists trial_end_plan_key text references public.plans(key);

commit;

-- Verify (read only):
-- select column_name, data_type, is_nullable from information_schema.columns where table_name = 'truck_billing' and column_name = 'trial_end_plan_key';
