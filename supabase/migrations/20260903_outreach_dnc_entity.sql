-- 20260903_outreach_dnc_entity.sql
-- ⛔ PROPOSED — NOT APPLIED. Apply by hand in the Supabase SQL editor, as every migration here is.
--
-- Adds to outreach_prospects, all NULLABLE, NO default, NO CHECK (V12.1 no-CHECK rule):
--   do_not_contact  boolean — the truck has asked not to be contacted. NULL = not set.
--   entity_type     text    — "limited company" / "sole trader" / "unknown". Free text, NULL = not set.
--
-- The route TREATS BOTH AS ABSENT until applied, via the same per-column capability probe used for
-- contact_name (attempt to select the column; treat a PostgREST undefined-column error as absent). The
-- page renders each control editable only once its column exists. Nothing is inferred from row values.

set lock_timeout = '3s';

begin;

alter table public.outreach_prospects
  add column if not exists do_not_contact boolean,
  add column if not exists entity_type    text;

comment on column public.outreach_prospects.do_not_contact is
  'Truck has asked not to be contacted. NULL = not set; true = do not contact.';
comment on column public.outreach_prospects.entity_type is
  'Business type: limited company / sole trader / unknown. Free text, nullable; NULL = not set.';

commit;

-- Make PostgREST aware of the new columns.
notify pgrst, 'reload schema';
