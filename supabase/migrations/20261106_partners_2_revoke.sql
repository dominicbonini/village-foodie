-- 20261106_partners_2_revoke.sql — partners-2 (16 November 2026, docs/partners-2-report.md): the trigger function that keeps
-- trucks.referred_partner_code_id set-once (20261104_partners_2.sql) is revoked from public, anon and authenticated, as every function
-- in this database is (scripts/migration-function-grants.cjs). 20261104 ran without this line; it has since been added there too.
-- Nothing else changes: the trigger runs as before (a trigger does not need EXECUTE granted to the role making the update).
--
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261106_partners_2_revoke.sql --approved-by-dominic
set lock_timeout = '3s';
begin;
revoke all on function public.trucks_referred_code_immutable() from public, anon, authenticated;
commit;

-- VERIFY (read-only):
-- select grantee, privilege_type from information_schema.routine_privileges
--  where routine_name = 'trucks_referred_code_immutable' and grantee in ('PUBLIC', 'anon', 'authenticated');   -- expect none
