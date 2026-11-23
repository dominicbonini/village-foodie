-- 20261123_enquiries_backend_1.sql — enquiries-backend-1 (23 November 2026; docs/enquiries-backend-1-report.md).
-- The backend for inbound enquiries to hello@hatchgrab.com: log, translate, draft. NOTHING IS SENT by anything that reads these tables.
--
-- 🔴 ADDITIVE ONLY. Five new private tables, one sequence, one new key in outreach_settings (the switch, OFF). No existing row is
--    changed, no marketing data is touched (plans, prices, countries, FAQ: not named here).
-- 🔴 PRIVATE, AS contact_messages: RLS on, no policies, every grant revoked from anon / authenticated / public; the service role only.
-- 🔴 THE SWITCH: outreach_settings key 'enquiries_intake_enabled' = false. While false the reply poll does exactly what it did before.
--    Switching it on is Dominic's (the report gives the statement). Its updated_at is the moment intake starts reading from.
-- Every statement is guarded (if not exists / on conflict do nothing / where not exists), so a second run changes nothing.
begin;

-- ── the ENQ-0001 numbers ──────────────────────────────────────────────────────────────────────────────────────────────
create sequence if not exists public.enquiry_ref_seq;
-- ENQ-0001 … ENQ-9999, then ENQ-10000 (never truncated: lpad alone would cut a fifth digit off). A function, because a column
-- default may not hold a subquery.
create or replace function public.enquiry_next_ref() returns text
language sql volatile set search_path = public, pg_temp as $$
  select 'ENQ-' || case when s.n < 10000 then lpad(s.n::text, 4, '0') else s.n::text end
  from (select nextval('public.enquiry_ref_seq') as n) s
$$;
revoke all on function public.enquiry_next_ref() from anon, authenticated, public;
grant execute on function public.enquiry_next_ref() to service_role;

-- ── enquiries: one per conversation ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.enquiries (
  id                 uuid primary key default gen_random_uuid(),
  ref                text not null unique default public.enquiry_next_ref(),
  source             text not null check (source in ('form', 'email')),
  name               text check (name is null or char_length(name) between 1 and 200),
  email              text not null check (char_length(email) between 3 and 254 and position('@' in email) > 1),
  country            text check (country is null or country ~ '^[A-Z]{2}$'),
  language           text check (language is null or language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  truck_id           text references public.trucks(id) on delete set null,
  contact_message_id uuid unique references public.contact_messages(id) on delete set null,
  status             text not null default 'new' check (status in ('new', 'drafted', 'needs_review', 'answered', 'closed')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (ref ~ '^ENQ-[0-9]{4,}$')
);
create index if not exists enquiries_email_idx on public.enquiries (lower(email));
create index if not exists enquiries_status_idx on public.enquiries (status, updated_at);

-- ── enquiry_messages: every message in or out (out is for later — nothing here sends) ─────────────────────────────────
create table if not exists public.enquiry_messages (
  id                uuid primary key default gen_random_uuid(),
  enquiry_id        uuid not null references public.enquiries(id) on delete cascade,
  direction         text not null check (direction in ('in', 'out')),
  original_text     text not null check (char_length(original_text) between 1 and 20000),
  original_language text check (original_language is null or original_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  english_text      text check (english_text is null or char_length(english_text) <= 40000),
  subject           text check (subject is null or char_length(subject) <= 1000),
  mail_message_id   text check (mail_message_id is null or char_length(mail_message_id) <= 1000),
  in_reply_to       text,
  "references"      text,
  mailbox           text check (mailbox is null or char_length(mailbox) <= 200),
  uid               bigint,
  received_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  check ((mailbox is null) = (mail_message_id is null))
);
-- A re-poll never duplicates: the same Message-ID in the same mailbox is one row (form messages have neither, and are one per
-- contact_messages row through enquiries.contact_message_id).
create unique index if not exists enquiry_messages_mailbox_message_uidx on public.enquiry_messages (mailbox, mail_message_id);
create index if not exists enquiry_messages_enquiry_idx on public.enquiry_messages (enquiry_id, received_at);

-- ── enquiry_drafts: what the model proposed, and why it needs review ──────────────────────────────────────────────────
create table if not exists public.enquiry_drafts (
  id               uuid primary key default gen_random_uuid(),
  enquiry_id       uuid not null references public.enquiries(id) on delete cascade,
  message_id       uuid not null references public.enquiry_messages(id) on delete cascade,
  english_draft    text not null,
  customer_draft   text not null,
  back_translation text,
  asks             jsonb not null default '[]'::jsonb check (jsonb_typeof(asks) = 'array'),
  flags            jsonb not null default '[]'::jsonb check (jsonb_typeof(flags) = 'array'),
  numbers_check    text not null check (numbers_check in ('pass', 'fail')),
  numbers_details  jsonb not null default '{}'::jsonb check (jsonb_typeof(numbers_details) = 'object'),
  model            text not null,
  cost_usd         numeric(10, 6) not null default 0 check (cost_usd >= 0),
  created_at       timestamptz not null default now()
);
create index if not exists enquiry_drafts_enquiry_idx on public.enquiry_drafts (enquiry_id, created_at);
create index if not exists enquiry_drafts_message_idx on public.enquiry_drafts (message_id);

-- ── reply_knowledge: what may be said (facts), what must be flagged (gaps), how to write (guidance — never quoted) ────
create table if not exists public.reply_knowledge (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('fact', 'guidance', 'gap')),
  topics        text[] not null default '{}',
  wording       text not null check (char_length(wording) between 1 and 4000),
  customer_safe boolean not null,
  countries     text[] not null default '{}',
  status        text not null default 'suggested' check (status in ('approved', 'suggested', 'retired')),
  source        text not null check (source in ('dominic', 'edit', 'note')),
  source_ref    text,
  created_at    timestamptz not null default now(),
  approved_at   timestamptz,
  check (kind <> 'guidance' or customer_safe = false),
  check (status <> 'approved' or approved_at is not null)
);
create index if not exists reply_knowledge_status_idx on public.reply_knowledge (status);

-- ── enquiry_spend: the $5-a-month cap's ledger (separate from the FAQ translator's) ───────────────────────────────────
create table if not exists public.enquiry_spend (
  month      text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  usd_spent  numeric(10, 6) not null default 0 check (usd_spent >= 0),
  updated_at timestamptz not null default now()
);

-- ── private: the contact_messages pattern ─────────────────────────────────────────────────────────────────────────────
alter table public.enquiries        enable row level security;
alter table public.enquiry_messages enable row level security;
alter table public.enquiry_drafts   enable row level security;
alter table public.reply_knowledge  enable row level security;
alter table public.enquiry_spend    enable row level security;
revoke all on public.enquiries        from anon, authenticated, public;
revoke all on public.enquiry_messages from anon, authenticated, public;
revoke all on public.enquiry_drafts   from anon, authenticated, public;
revoke all on public.reply_knowledge  from anon, authenticated, public;
revoke all on public.enquiry_spend    from anon, authenticated, public;
revoke all on sequence public.enquiry_ref_seq from anon, authenticated, public;
grant all on public.enquiries        to service_role;
grant all on public.enquiry_messages to service_role;
grant all on public.enquiry_drafts   to service_role;
grant all on public.reply_knowledge  to service_role;
grant all on public.enquiry_spend    to service_role;
grant usage, select on sequence public.enquiry_ref_seq to service_role;

-- ── THE SWITCH: OFF ───────────────────────────────────────────────────────────────────────────────────────────────────
insert into public.outreach_settings (key, value) values ('enquiries_intake_enabled', 'false'::jsonb)
on conflict (key) do nothing;

-- ── THE SEED: Dominic's lines of 23 November 2026 (seven approved, one suggested) ─────────────────────────────────────
insert into public.reply_knowledge (kind, topics, wording, customer_safe, countries, status, source, source_ref, approved_at)
select v.kind, v.topics, v.wording, v.customer_safe, v.countries, v.status, 'dominic', '23 Nov 2026',
       case when v.status = 'approved' then timestamptz '2026-11-23 00:00:00+00' else null end
from (values
  ('guidance', array['prices','trial','fees'], 'Card fees for online card orders (Stripe''s) are always stated separately. "Free" covers the plan fee and HatchGrab fees only, never card fees.', false, array[]::text[], 'approved'),
  ('fact', array['demo'], 'Demo requests: the menu demo shows only a small part of HatchGrab; offer full access to look around everything; ask for their demo link or their menu and Dominic builds it.', true, array[]::text[], 'approved'),
  ('fact', array['forecasting','prep','stock'], 'Forecasting, and a summary of what to prepare for each market from pre-orders, are being built and will be ready in the next few months; ask what they''d like it to do.', true, array[]::text[], 'approved'),
  ('fact', array['preorders'], 'Pre-orders can open up to 7 days before a market and close by a rule (hours before the market starts, or a time on the market day).', true, array[]::text[], 'approved'),
  ('gap', array['preorders','deadline'], 'A deadline typed in as a date and time for each market is not available — describe the rule; flag for review.', true, array[]::text[], 'approved'),
  ('gap', array['e-reporting','accounting'], 'E-reporting (France) is not sent by HatchGrab; sales can be downloaded for their accountant or e-reporting platform; flag for review.', true, array['FR'], 'approved'),
  ('guidance', array['payments'], 'Never mention Pay at Hatch (trial only).', false, array[]::text[], 'approved'),
  ('fact', array['till','stock','card reader'], 'HatchGrab doesn''t connect to other till software; it replaces it — a tablet (iPad or Android) takes counter orders and shows stock per market; they only need a payment terminal.', true, array[]::text[], 'suggested')
) as v(kind, topics, wording, customer_safe, countries, status)
where not exists (select 1 from public.reply_knowledge where source = 'dominic' and source_ref = '23 Nov 2026');

commit;
