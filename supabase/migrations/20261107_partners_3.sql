-- 20261107_partners_3.sql — partners-3 (16 November 2026, docs/partners-3-report.md): how to reach a partner when there is no
-- verified email — the contact channel and the social links — and the newest evidence that the group is still active.
--
--   partner_orgs.channel           email | contact_form | facebook | instagram | whatsapp | linkedin  (default email)
--   partner_orgs.facebook_url, instagram_url, contact_form_url
--   partner_orgs.last_seen_active  the date of the newest post / news / event found (null = not found)
--   partner_orgs.members_estimate  a Facebook group's member count, or a network's own claim (free text, with its source)
--
-- 🔴 ADDITIVE ONLY: no existing row changes meaning — every existing row is channel 'email' (they were all imported by email), and
-- the new columns are null. Anything without a verified email is sent by hand ("You send / DM"); the scheduler never sends to it
-- (lib/partner-programme.ts ineligible: no email, or not verified).
--
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261107_partners_3.sql --approved-by-dominic
set lock_timeout = '3s';
begin;

alter table public.partner_orgs
  add column if not exists channel          text not null default 'email'
    check (channel in ('email', 'contact_form', 'facebook', 'instagram', 'whatsapp', 'linkedin')),
  add column if not exists facebook_url     text,
  add column if not exists instagram_url    text,
  add column if not exists contact_form_url text,
  add column if not exists last_seen_active date,
  add column if not exists members_estimate text;

comment on column public.partner_orgs.channel is
  'How the partner is reached: email (only a verified one is ever sent automatically), or by hand — contact_form / facebook / instagram / whatsapp / linkedin.';
comment on column public.partner_orgs.last_seen_active is
  'The newest date found showing the group is active (a post, news, an event). Nothing since 2024 → status not_now ("inactive").';

commit;

notify pgrst, 'reload schema';

-- VERIFY (read-only):
-- select column_name, data_type, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'partner_orgs' and column_name in ('channel','facebook_url','instagram_url','contact_form_url','last_seen_active','members_estimate');
