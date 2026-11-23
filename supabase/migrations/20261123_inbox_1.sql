-- 20261123_inbox_1.sql — inbox-1 (23 November 2026; docs/inbox-1-report.md): Admin › Inbox, one place for every incoming email.
-- Additive only. Builds on 20261123_enquiries_backend_1.sql. Run once through scripts/db-migrate.cjs (one transaction).
--
--   1 · enquiry_messages: the address each email was written to / sent from, and an outgoing reply's own send record
--   2 · enquiries: a snooze, and when the conversation last had a message (the 24-month retention reads it)
--   3 · inbox_drafts, inbox_comments, inbox_sent: the Inbox's drafts, Dominic's comments for the AI, and what was sent (English beside
--       the version the customer received) — private like the enquiry tables
--   4 · outreach_settings: 'mail_aliases' (the 36 aliases delivered into hello@) and 'enquiries_reply_from_alias' (false)
--   5 · reply_knowledge: the France e-reporting line becomes an approved fact (Dominic, 23 Nov 2026); the till line stays 'suggested'
begin;

-- ── 1 · enquiry_messages ───────────────────────────────────────────────────────────────────────────────────────────────
alter table public.enquiry_messages
  add column if not exists to_address     text check (to_address is null or char_length(to_address) <= 254),
  add column if not exists from_address   text check (from_address is null or char_length(from_address) <= 254),
  add column if not exists send_status    text check (send_status is null or send_status in ('sending', 'sent', 'failed', 'uncertain')),
  add column if not exists attempts       integer not null default 0 check (attempts >= 0),
  add column if not exists last_error     text check (last_error is null or char_length(last_error) <= 2000),
  add column if not exists sent_copy      text check (sent_copy is null or sent_copy in ('server_filed', 'appended', 'absent')),
  add column if not exists idempotency_key text,
  add column if not exists attachments    jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  add column if not exists updated_at     timestamptz not null default now();
create unique index if not exists enquiry_messages_idempotency_uidx on public.enquiry_messages (idempotency_key) where idempotency_key is not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'enquiry_messages_out_has_send_status') then
    alter table public.enquiry_messages add constraint enquiry_messages_out_has_send_status
      check (direction = 'in' or send_status is not null);
  end if;
end $$;

-- ── 2 · enquiries ──────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.enquiries
  add column if not exists snoozed_until   timestamptz,
  add column if not exists last_message_at timestamptz;
update public.enquiries e set last_message_at = m.last_at
  from (select enquiry_id, max(received_at) as last_at from public.enquiry_messages group by enquiry_id) m
  where m.enquiry_id = e.id and e.last_message_at is null;
create or replace function public.enquiry_touch_last_message() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  update public.enquiries
     set last_message_at = greatest(coalesce(last_message_at, new.received_at), new.received_at)
   where id = new.enquiry_id;
  return new;
end $$;
revoke all on function public.enquiry_touch_last_message() from anon, authenticated, public;
drop trigger if exists enquiry_messages_touch_last on public.enquiry_messages;
create trigger enquiry_messages_touch_last after insert on public.enquiry_messages
  for each row execute function public.enquiry_touch_last_message();
create index if not exists enquiries_last_message_idx on public.enquiries (last_message_at);

-- ── 3 · the Inbox's own tables ─────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.inbox_drafts (
  id                uuid primary key default gen_random_uuid(),
  conversation_key  text not null check (conversation_key ~ '^(enquiry|prospect|partner):[0-9a-f-]{36}$'),
  enquiry_id        uuid references public.enquiries(id) on delete cascade,
  source_message_id uuid not null,
  their_language    text check (their_language is null or their_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  their_english     text check (their_english is null or char_length(their_english) <= 40000),
  english_draft     text not null check (char_length(english_draft) <= 40000),
  customer_draft    text check (customer_draft is null or char_length(customer_draft) <= 40000),
  translated_from   text check (translated_from is null or char_length(translated_from) <= 40000),
  back_translation  text,
  asks              jsonb not null default '[]'::jsonb check (jsonb_typeof(asks) = 'array'),
  flags             jsonb not null default '[]'::jsonb check (jsonb_typeof(flags) = 'array'),
  numbers_check     text check (numbers_check is null or numbers_check in ('pass', 'fail')),
  numbers_details   jsonb not null default '{}'::jsonb check (jsonb_typeof(numbers_details) = 'object'),
  model             text,
  cost_usd          numeric(10, 6) not null default 0 check (cost_usd >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists inbox_drafts_conversation_message_uidx on public.inbox_drafts (conversation_key, source_message_id);

create table if not exists public.inbox_comments (
  id                uuid primary key default gen_random_uuid(),
  conversation_key  text not null check (conversation_key ~ '^(enquiry|prospect|partner):[0-9a-f-]{36}$'),
  enquiry_id        uuid references public.enquiries(id) on delete cascade,
  source_message_id uuid not null,
  comment           text not null check (char_length(comment) between 1 and 4000),
  english_before    text check (english_before is null or char_length(english_before) <= 40000),
  english_after     text check (english_after is null or char_length(english_after) <= 40000),
  created_at        timestamptz not null default now(),
  sent_at           timestamptz,
  knowledge_id      uuid references public.reply_knowledge(id) on delete set null
);
create index if not exists inbox_comments_conversation_idx on public.inbox_comments (conversation_key, created_at);

create table if not exists public.inbox_sent (
  id                  uuid primary key default gen_random_uuid(),
  conversation_key    text not null check (conversation_key ~ '^(enquiry|prospect|partner):[0-9a-f-]{36}$'),
  enquiry_id          uuid references public.enquiries(id) on delete cascade,
  source_message_id   uuid not null,
  outreach_message_id uuid references public.outreach_messages(id) on delete set null,
  enquiry_message_id  uuid references public.enquiry_messages(id) on delete cascade,
  language            text check (language is null or language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  english_text        text not null check (char_length(english_text) between 1 and 40000),
  sent_text           text not null check (char_length(sent_text) between 1 and 40000),
  from_address        text not null check (char_length(from_address) <= 254),
  created_at          timestamptz not null default now()
);
create index if not exists inbox_sent_conversation_idx on public.inbox_sent (conversation_key, created_at);

alter table public.inbox_drafts   enable row level security;
alter table public.inbox_comments enable row level security;
alter table public.inbox_sent     enable row level security;
revoke all on public.inbox_drafts   from anon, authenticated, public;
revoke all on public.inbox_comments from anon, authenticated, public;
revoke all on public.inbox_sent     from anon, authenticated, public;
grant all on public.inbox_drafts   to service_role;
grant all on public.inbox_comments to service_role;
grant all on public.inbox_sent     to service_role;

-- ── 4 · the two settings (data, not code) ──────────────────────────────────────────────────────────────────────────────
insert into public.outreach_settings (key, value) values
  ('mail_aliases', '["admin@hatchgrab.com","ahoj@hatchgrab.com","annyeong@hatchgrab.com","billing@hatchgrab.com","bok@hatchgrab.com","bonjour@hatchgrab.com","buna@hatchgrab.com","ciao@hatchgrab.com","czesc@hatchgrab.com","hallo@hatchgrab.com","halo@hatchgrab.com","hei@hatchgrab.com","hej@hatchgrab.com","hola@hatchgrab.com","jambo@hatchgrab.com","konnichiwa@hatchgrab.com","kumusta@hatchgrab.com","labas@hatchgrab.com","marhaba@hatchgrab.com","merhaba@hatchgrab.com","namaste@hatchgrab.com","nihao@hatchgrab.com","ola@hatchgrab.com","privacy@hatchgrab.com","privet@hatchgrab.com","sawasdee@hatchgrab.com","shalom@hatchgrab.com","support@hatchgrab.com","sveiki@hatchgrab.com","szia@hatchgrab.com","tere@hatchgrab.com","tester@hatchgrab.com","xinchao@hatchgrab.com","yassou@hatchgrab.com","zdravei@hatchgrab.com","zdravo@hatchgrab.com"]'::jsonb),
  ('enquiries_reply_from_alias', 'false'::jsonb)
on conflict (key) do nothing;

-- ── 5 · the e-reporting line (Dominic, 23 Nov 2026): a gap → an approved fact ───────────────────────────────────────────
update public.reply_knowledge
   set kind = 'fact',
       topics = array['e-reporting', 'accounting'],
       wording = 'E-reporting (France): HatchGrab will provide the sales records they need to send to their approved e-reporting platform.',
       customer_safe = true,
       countries = array['FR'],
       status = 'approved',
       approved_at = now()
 where source = 'dominic' and source_ref = '23 Nov 2026' and kind = 'gap' and 'e-reporting' = any(topics);

commit;
