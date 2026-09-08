-- Full rollback. The table is new and nothing reads it, so this is total and safe.
delete from discovery_exclusion_terms where created_by = 'migration-step-2';
-- Or drop the table entirely, reversing the migration as well:
-- drop table if exists public.discovery_exclusion_terms;
-- notify pgrst, 'reload schema';
