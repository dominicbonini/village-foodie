-- 20261061_contact_1.sql — contact-1 (2 November 2026, docs/contact-1-report.md): HATCHGRAB'S OWN CONTACT FORM'S MESSAGES.
--
-- One row per message sent from the contact form on hatchgrab.com (app/contact/HatchGrabContactForm.tsx → POST /api/contact →
-- lib/contact-server.ts). Saved FIRST, then emailed to the support inbox through Brevo; email_status records the outcome.
--   topic               'question' | 'account' | 'other' (lib/contact.ts CONTACT_TOPICS)
--   name, email, business_name, message   as typed, trimmed; lengths as the form's rules (counted in characters)
--   country, locale     the page's country (ISO 3166 alpha-2) and language (e.g. de-DE) when it was sent
--   page_path           the page it was sent from (/contact?…)
--   ip_hash             sha256 of the sender's IP address salted with CONTACT_IP_SALT (server-only); null when the salt is unset.
--                       The address itself is never stored.
--   email_status        null until the first send; then 'sent' or 'failed' (a failed send is retried by the hourly job, up to
--                       3 more times — email_attempts counts every try, the first included)
--   provider_message_id Brevo's message id for a sent email
-- Kept for 24 months (the Privacy Policy's "Support correspondence: 24 months"), then deleted by the daily retention job
-- (/api/cron/order-retention, lib/order-retention.ts).
-- Security as faq_items: RLS on, no policies, no grant to anon or authenticated — the service role only.
-- A new table: no existing row is touched; nothing is deleted.

begin;

create table if not exists public.contact_messages (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  topic               text not null check (topic in ('question', 'account', 'other')),
  name                text not null check (char_length(name) between 1 and 100),
  email               text not null check (char_length(email) between 3 and 254 and position('@' in email) > 1),
  business_name       text check (business_name is null or char_length(business_name) between 1 and 120),
  message             text not null check (char_length(message) between 10 and 5000),
  country             text check (country is null or country ~ '^[A-Z]{2}$'),
  locale              text check (locale is null or locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  page_path           text not null default '/contact' check (char_length(page_path) between 1 and 500),
  ip_hash             text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  email_status        text check (email_status is null or email_status in ('sent', 'failed')),
  provider_message_id text,
  email_attempts      smallint not null default 0 check (email_attempts between 0 and 10),
  -- account help names the truck or business, so we can find it (the form's rule, lib/contact.ts businessRequired)
  check (topic <> 'account' or business_name is not null)
);

create index if not exists contact_messages_created_at_idx on public.contact_messages (created_at);
create index if not exists contact_messages_unsent_idx on public.contact_messages (created_at) where email_status is distinct from 'sent';

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated, public;
grant all on public.contact_messages to service_role;

commit;
