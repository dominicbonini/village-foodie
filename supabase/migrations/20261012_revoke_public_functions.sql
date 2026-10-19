-- 20261012_revoke_public_functions.sql
-- Three functions in `public` closed to the public (anon) key: place_order_atomic (the pre-v2 order writer, SECURITY
-- INVOKER), find_stranded_authorisations and purge_order_drafts (both SECURITY DEFINER).
--
-- ⛔ ALREADY APPLIED — FILE ONLY, DO NOT RUN. 🔴 THIS FILE IS A RECORD, NOT AN INSTRUCTION.
--    Revoked live on 11–12 October 2026 (docs/definer-functions-report.md, docs/place-order-grant-report.md); REOPENED
--    afterwards by a hand-run `grant execute … to public, anon, authenticated` (most likely those reports' own
--    rollback lines — the reopened ACLs carried PUBLIC, anon and authenticated APPENDED after service_role, the order
--    an appended GRANT leaves; a re-created function lists PUBLIC first); RE-APPLIED by Dominic on 19 October 2026 and
--    verified read-only the same day (docs/us-polish-batch-report.md). Idempotent: re-running it changes nothing.
--    ⚠️ CORRECT THIS HEADER IF IT IS EVER RUN SOMEWHERE ELSE.
--
-- WHAT IT REPRODUCES — the live state read on 19 October 2026 (pg_proc.proacl), on a fresh database where each function
-- was created by its migration (default privileges give PUBLIC, anon, authenticated and service_role EXECUTE):
--   place_order_atomic(jsonb, text, text, uuid, text, date, jsonb)   {postgres=X/postgres,service_role=X/postgres}
--   find_stranded_authorisations(integer, integer)                   {postgres=X/postgres,service_role=X/postgres}
--   purge_order_drafts()                                             {postgres=X/postgres,service_role=X/postgres}
--   has_function_privilege: public / anon / authenticated FALSE; service_role / postgres TRUE (all three).
--   The creating migrations (20260624 … 20260816) now revoke in the same file too, so a fresh database is closed
--   before this file runs; this file is the dated record of the live change.
--
-- DIFFERENCES FROM THE TWO REPORTS (live wins):
--   • definer-functions-report.md also ran `grant execute … to postgres` on the two definer functions. Live shows
--     `postgres=X/postgres`, which is the OWNER's own entry — present whether or not that grant ran. Not repeated here:
--     it would change nothing, and the owner keeps EXECUTE regardless (pg_cron runs purge_order_drafts as postgres).
--   • Both reports' "rollback" blocks (grant … to public, anon, authenticated) are what reopened these. They now carry
--     a "⛔ DO NOT RUN" line; nothing here reverses this file.
--   • `revoke execute` (the reports) and `revoke all` (other migrations) are the same for a function: EXECUTE is its
--     only privilege.
--
-- VERIFY (read-only):
--   select p.oid::regprocedure as fn,
--          has_function_privilege('anon',          p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--          has_function_privilege('service_role',  p.oid, 'execute') as service_role
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.proname in ('place_order_atomic', 'find_stranded_authorisations', 'purge_order_drafts');
--   -- expect three rows: false / false / true

set lock_timeout = '3s';

begin;

revoke execute on function public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb) from public, anon, authenticated;
grant  execute on function public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb) to service_role;

revoke execute on function public.find_stranded_authorisations(integer, integer) from public, anon, authenticated;
grant  execute on function public.find_stranded_authorisations(integer, integer) to service_role;

revoke execute on function public.purge_order_drafts() from public, anon, authenticated;
grant  execute on function public.purge_order_drafts() to service_role;

commit;

notify pgrst, 'reload schema';
