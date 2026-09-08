-- 20260903_outreach_contact_name.sql
-- ⛔ PROPOSED — NOT APPLIED. Apply by hand in the Supabase SQL editor, as every migration here is.
--
-- Adds a nullable free-text contact-person name to outreach_prospects. Nullable, NO default, NO CHECK
-- (per the V12.1 no-CHECK rule — PostgREST cannot expose a CHECK to the UI). NULL = no contact name known.
--
-- The route TREATS THIS COLUMN AS ABSENT until it is applied: its GET probes by attempting to select
-- contact_name and falling back if PostgREST rejects it, and reports `hasContactName` so the page renders
-- the field editable only once the column exists. Nothing is inferred from row values.

set lock_timeout = '3s';

begin;

alter table public.outreach_prospects
  add column if not exists contact_name text;

comment on column public.outreach_prospects.contact_name is
  'Name of the contact person at the truck. Free text, nullable; NULL = not known.';

commit;

-- Make PostgREST aware of the new column.
notify pgrst, 'reload schema';
