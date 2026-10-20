-- 20261023_trucks_plan_check_live.sql
-- The trucks.plan CHECK as it stands LIVE: 'demo' and 'tester' were added by hand, outside any migration.
--
-- ⛔ ALREADY APPLIED — FILE ONLY, DO NOT RUN. 🔴 THIS FILE IS A RECORD, NOT AN INSTRUCTION.
--    The last migration that wrote this constraint, 20260521_plans_and_trial.sql, allows only
--    ('starter','pro','max','trial'). The live database (read-only, 19 October 2026, pg_constraint) holds:
--      trucks_plan_check  CHECK ((plan = ANY (ARRAY['starter','pro','max','trial','demo','tester'])))
--    Code has written 'demo' (lib/provision-truck.ts, demo profile) and offered 'tester' (admin) for months, so the
--    constraint was widened by hand. This file makes the repo match live, so a fresh database built from
--    supabase/migrations ends where live is. It is idempotent: on live it drops and re-adds the identical constraint.
--    ⚠️ 20261024_plans.sql (next) replaces this CHECK with a foreign key to public.plans.
--    (docs/plans-data-model-report.md)

alter table public.trucks drop constraint if exists trucks_plan_check;
alter table public.trucks add constraint trucks_plan_check
  check (plan in ('starter', 'pro', 'max', 'trial', 'demo', 'tester'));
