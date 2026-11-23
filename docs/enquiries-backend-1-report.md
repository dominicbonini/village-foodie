# enquiries-backend-1 — the backend for enquiries to hello@hatchgrab.com: log, translate, draft

*23 November 2026. **Built, tested, migration run. Switched OFF.** Committed on `main` as `40c27cd4` (not pushed, not deployed). Nothing is sent by anything in this work.*

## 0 · In short

- **Built:** five private tables, Dominic's eight knowledge lines, and an enquiry step at the end of the existing reply poll (`/api/cron/outreach-replies`, every 10 minutes). When switched on, it turns contact-form messages and real people's mail to hello@ into enquiries, translates them, lists what was asked, and drafts a reply from an answer pack.
- **Off by default:** `outreach_settings` key `enquiries_intake_enabled` = `false` (checked live after the migration). While it is false the poll does exactly what it did before. This is proved against `5df925d8` on the same fixtures: same summary, same database writes in the same order, same IMAP calls. The only difference is one extra read, of the switch itself.
- **Nothing is sent:** no email, no SMTP, no Brevo, no `appendToSent`. A source census fails if any module the enquiry code can reach (61 files, dynamic imports included) is a send path or the mailbox module, or holds a send call.
- **The mailbox stays read-only:** the same EXAMINE lock, the same header fetch and the same `BODY.PEEK` body read as the outreach walk. The fake mailbox records any write method, and no run called one.
- **Checks:** new harness `scripts/enquiries-backend-1.cjs` **105 passed, 0 failed**, in the sweep. `tsc` clean. ESLint clean on every changed file. The existing outreach and contact harnesses give the same results before and after (§6).
- **Live model:** none. Every model step is tested with a stand-in. Drafting also needs a Claude API login on Vercel, which does not exist today: decision 1.

## 1 · What was built

### The switch, and where the step runs
- `lib/outreach-mail-poll.ts` → `runReplyPoll` now calls `enquiriesAfterPoll(...)` as its **last** step: after the walk, adopt, repair, bodies and housekeeping, and still inside the poll lock. No new cron, and `vercel.json` is unchanged.
- `lib/enquiries/run.ts` → `runEnquiries` reads the switch first. If it is false, absent or unreadable, it returns `null` and nothing else happens: no second login, no other read, no write, and no `enquiries` key in the poll's answer.
- When the switch is on, the counts go under `summary.enquiries`. These are **counts only**: no address, subject or text appears in the cron log.
- The step stops starting work 50 s after the run began (the cron's limit is 60 s; the lock goes stale at 2 minutes). A live model call still in flight at that point is aborted.

### Intake (only when on)
**Contact form**
- Messages saved to `contact_messages` **at or after the moment the switch was turned on** (the switch row's `updated_at`) become enquiries with source `form`. The country and language come from the form, and the email is stored in lower case.
- This happens in the cron, not in the form. `app/api/contact/route.ts`, `lib/contact-server.ts`, the form, its wording, its validation and its email are all byte-identical. So it can never make a visitor's send fail: the form path doesn't know it exists. The cost is a delay of up to 10 minutes before the enquiry appears.
- It is idempotent: `enquiries.contact_message_id` is unique.

**hello@ INBOX**
- A second read-only walk of hello@'s INBOX, with **its own watermark** (`outreach_settings` key `enquiries_intake_state`), so it never moves the outreach poll's. Its first look reads from the switch-on moment.
- For each message it asks the same functions the outreach walk uses whether outreach would claim it (`isReplyToTestOnly`, `matchIncoming`, `addPartnerMatch`). The outreach walk itself (`pollOneAccount`) is byte-identical to BASE.
- If outreach would claim the message, it is left alone and counted as `mailLeftToOutreach`.
- **Stored nothing, counted only** (`lib/enquiries/rules.ts` `skipReason`):
  - `contact_form_copy`: the Brevo copy (subject starting `[HatchGrab contact]`);
  - `own_address`: any address on hatchgrab.com or villagefoodie.co.uk, Dominic's included (no loops);
  - `bounce`: mailer-daemon, postmaster, a delivery report, or Return-Path `<>`;
  - `auto_reply`: the poll's own four tests (Auto-Submitted, X-Autoreply, Precedence, out-of-office subjects);
  - `noreply`: no-reply, noreply or donotreply senders;
  - `order_mail`: **a diner's order mail** (Dominic's decision). It is caught in two ways:
    - by address: mail sent to or copied to `donotreply@hatchgrab.com`, the order-mail sender;
    - by subject: after stripping Re:/Fwd:/AW:/TR:…, the subject is one of the 12 emails a diner gets about their own order (confirmed, ready, received, refunded ×2, cancelled, event cancelled, rejected, updated ×3, review request), in every language we have. The patterns are built from the email catalogue itself (`lib/enquiries/order-subjects.ts`); nothing is retyped.
  - The body of a skipped message is **never read**: only kept messages get a body fetch.
- **The model hook:** `ORDER_MAIL_MODEL_HOOK` / the optional `classifyOrderMail` dependency. It is not wired today. When it is, it will be asked about a message before anything is stored, holding the message in memory only.
- **A linked HatchGrab truck's mail** is skipped by outreach (it is "not a prospect"), so it is **not claimed**, and a customer's question becomes an enquiry. See decision 5.
- The truck link is made only when exactly **one** truck has that `contact_email`. With none, or more than one, no link is made; it is never guessed.

**Threading** (`threadFor`). A message joins an existing enquiry only if it comes from **the same address** and one of these holds:
- its In-Reply-To or References names a message we hold;
- its subject carries the enquiry's ENQ ref;
- it is a `Re:` of the contact-form copy (it then joins the person's latest form enquiry).

The same thread id from a different address starts a new enquiry. A joined enquiry goes back to `new` so it gets a fresh draft. A re-poll stores nothing twice: `(mailbox, mail_message_id)` is unique.

**The header comment** of `lib/outreach-mail-poll.ts` now says it exactly: the "unmatched mail is not stored" rule is reversed **for real people's enquiries only**, Dominic approved it on 23 Nov, only while the switch is on, and the outreach and partner behaviour is unchanged. Those two header lines are the only lines removed from that file; every other change is an addition.

### Drafting (pure functions and one model adapter)
At most **3 drafts per run**, oldest first. Each draft is three model calls (`lib/enquiries/model.ts`), each a strict client tool through the competitor checker's `converse`, as the FAQ translator does:

1. **understand** — translate to English and detect the language (the stored language for a form message). It lists each thing asked and tags 1–3 topics from a fixed vocabulary, plus a country guess.
2. **answer pack** (`lib/enquiries/answer-pack.ts`) — **the only thing the model sees besides the message**:
   - the customer's country's plans and prices, the trial, and Stripe's online card fee on its own line, "never free";
   - the /features table rows (English names, which plans have each, coming soon);
   - the published FAQ for their country in its language;
   - **approved** `reply_knowledge` lines whose topics meet the asks' topics and whose countries include theirs (or are empty).
   - Guidance lines go under "DO NOT MENTION — instructions, never quoted".
   - The pack is read through `getCountrySettings`, `getPlanCatalog`, `faqPage`, `offerPlans`, `tableColumns`/`tableCell` and `FEATURE_TABLE` (`lib/enquiries/answer-pack-server.ts`). All of these are called, none changed.
   - The store reads only `status = 'approved'` knowledge. Code, the manual, docs/, notes and other customers' data are never in the pack.
3. **draft** — Dominic's style: friendly, short, answer only what was asked, no technical words. Card fees are stated separately and never inside "free". Each ask is matched to `available` / `limited` / `gap` / `unknown` with its sources.
4. **checked in code** (`settleAsk`):
   - a source not in the pack is dropped and flagged;
   - "available" with no source becomes `unknown`;
   - citing a **gap** line makes the ask `gap`, whatever the model said.
5. **back-translate** — a separate call, so it checks the draft rather than repeating it. It is skipped for English.

**Flags** (any flag means `needs_review`; none means `drafted`):
- `ask_gap`, `ask_limited`, `ask_unknown`;
- `numbers`: a price, percentage, amount or day count in either draft that is not in the pack. Decimal commas, € signs, thousands separators and non-Latin digits are all read;
- `country_guessed`, `country_unknown` (an email with no country: the pack has no prices);
- `card_fees_not_stated` (free or the trial mentioned with no card-fee sentence);
- `mentions_pay_at_hatch`, `note_lines_removed`, `unknown_source`, `no_asks`.

**`canAutoSend(draft)`** returns false with any flag, with a failed numbers check, or with any ask that is not available. **It is false for every draft today**: `AUTO_SEND_BUILT = false`, and no send path exists.

**Spend:** **$5 per calendar month** across all enquiry calls, in its own ledger `enquiry_spend`, separate from the FAQ translator. No call starts once it is reached. The cost of a failed call still counts. Each draft records `cost_usd` and the model. Prices come from `competitor_check_settings.prices`; `claude-sonnet-5-5` is priced there (checked live).

### Learning (backend only, `lib/enquiries/learning.ts`)
- `suggestFromEdit(aiDraft, sentText)`: the sentences Dominic added (greetings and "Note:" lines aside) become one `suggested` fact, with source `edit` and source_ref the enquiry ref.
- "Note:" lines become `suggested` guidance (source `note`, never customer-safe). They are stripped from anything that could reach a customer: drafts are stripped too, and flagged.
- Nothing approves. Only `approved` lines ever reach the pack.
- These functions are not called anywhere yet. They are for the screens to come.

## 2 · Files

**New**
- `lib/enquiries/rules.ts` — the skip rules, threading, the ENQ ref, the numbers check, `canAutoSend`, "Note:" lines;
- `lib/enquiries/order-subjects.ts` — the order-mail subject patterns, from the email catalogue;
- `lib/enquiries/answer-pack.ts` — the pack (pure): `selectKnowledge`, `buildAnswerPack`, `settleAsk`;
- `lib/enquiries/answer-pack-server.ts` — the pack's inputs through the pages' readers, loaded lazily and only when on;
- `lib/enquiries/model.ts` — the three steps, their strict tools and validators, and `liveEnquiryModel`;
- `lib/enquiries/learning.ts` — `suggestFromEdit`, `suggestFromNotes`, `customerTextOf`;
- `lib/enquiries/run.ts` — `runEnquiries`: switch, forms, mail, drafts, caps;
- `lib/enquiries/store.ts` — the database, through the poll's service-role client;
- `supabase/migrations/20261123_enquiries_backend_1.sql`;
- `scripts/enquiries-backend-1.cjs` — the harness.

**Changed**
- `lib/outreach-mail-poll.ts`: the header comment, two imports, the optional `enquiries` summary field, one call after housekeeping, and the enquiry section at the end of the file;
- `scripts/harnesses.json`: `enquiries-backend-1.cjs` added to the sweep.

**Not changed** (proved byte-identical to `5df925d8`, committed and working tree, 70 paths):
- ordering, checkout, payments, KDS, dashboard, Add order, heartbeat, auth, Manage, admin, the apps;
- `app/api/cron` (the route) and `vercel.json`;
- the contact form: `app/contact`, `app/api/contact`, `lib/contact.ts`, `lib/contact-server.ts`;
- every customer page and word: `app/(public)`, `messages`, `content`, `lib/i18n`, `public`, `components`;
- the four shared readers and the plan-feature readers;
- the outreach and partner matching and mail modules, `lib/email*`, `lib/faq`, `lib/competitor-check`.

Pizzeria Gusto and Le Roi du Churrasco appear in no new file and in no fixture.

## 3 · Every SQL statement

### The migration, as run
Run with `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261123_enquiries_backend_1.sql`, after `--probe` (read-only, `transaction_read_only=on`).

Output:
- `sha256 df654dd0782b6ceb · committed at 40c27cd4`;
- `applied — one transaction, no error`.

`db-migrate.cjs` has no switch to skip the page refresh, and I didn't add one. The refresh **did not run**: `REVALIDATE_SECRET` isn't set in this shell, so the script printed its warning and asked the site for nothing. That is right for a migration that touches no marketing data.

```sql
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
```

The seed on its own (the last statement above), all with source `dominic` and source_ref `23 Nov 2026`:

```sql
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
```

### The check after it (read-only, MCP)
```sql
select 'tables' k, string_agg(c.relname || ' rls=' || c.relrowsecurity, ', ' order by c.relname) v from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('enquiries','enquiry_messages','enquiry_drafts','reply_knowledge','enquiry_spend')
union all select 'grants', string_agg(distinct c.relname || ':' || coalesce(a.grantee::regrole::text,'PUBLIC'), ', ') from pg_class c cross join lateral aclexplode(c.relacl) a where c.relnamespace='public'::regnamespace and c.relname in ('enquiries','enquiry_messages','enquiry_drafts','reply_knowledge','enquiry_spend','enquiry_ref_seq')
union all select 'policies', coalesce((select string_agg(tablename||'.'||policyname, ', ') from pg_policies where schemaname='public' and tablename in ('enquiries','enquiry_messages','enquiry_drafts','reply_knowledge','enquiry_spend')), 'none')
union all select 'fn_grants', (select string_agg(coalesce(a.grantee::regrole::text,'PUBLIC') || '=' || a.privilege_type, ', ') from pg_proc p cross join lateral aclexplode(p.proacl) a where p.proname='enquiry_next_ref')
union all select 'switch', (select value::text || ' @ ' || updated_at::text from public.outreach_settings where key='enquiries_intake_enabled')
union all select 'knowledge', (select string_agg(kind || '/' || status || '/' || array_to_string(topics,'|') || '/' || coalesce(nullif(array_to_string(countries,','),''),'all') || '/' || customer_safe, '; ' order by created_at, kind) from public.reply_knowledge)
union all select 'knowledge_src', (select count(*)::text || ' rows, sources ' || string_agg(distinct source || ' ' || source_ref, ',') from public.reply_knowledge)
union all select 'rows', (select (select count(*) from public.enquiries)::text || ' enquiries, ' || (select count(*) from public.enquiry_messages) || ' messages, ' || (select count(*) from public.enquiry_drafts) || ' drafts, ' || (select count(*) from public.enquiry_spend) || ' spend')
union all select 'indexes', (select string_agg(indexname, ', ') from pg_indexes where schemaname='public' and tablename in ('enquiries','enquiry_messages','enquiry_drafts','reply_knowledge','enquiry_spend'))
union all select 'ref_default', (select pg_get_expr(adbin, adrelid) from pg_attrdef where adrelid='public.enquiries'::regclass and adnum=(select attnum from pg_attribute where attrelid='public.enquiries'::regclass and attname='ref'))
union all select 'seq_last', (select last_value::text || ' called=' || is_called from public.enquiry_ref_seq);
```

**What it showed:**
- **Tables:** all five have RLS on and no policies.
- **Grants:** postgres and service_role only, on the five tables and the sequence. No anon, no authenticated.
- **Function:** `enquiry_next_ref()` is executable by postgres and service_role only.
- **Switch:** `false` at 2026-11-23 14:13:09 UTC.
- **Knowledge:** 8 rows, all `dominic 23 Nov 2026`. Seven are approved: 3 facts, 2 gaps (one FR-only), and 2 guidance (not customer-safe). One is suggested: the till line.
- **Rows:** 0 enquiries, 0 messages, 0 drafts, 0 spend.
- **Indexes:** 14, including the unique `(mailbox, mail_message_id)` index and the unique `contact_message_id` index.
- **Ref:** the default is `enquiry_next_ref()`, and the sequence has not been used yet, so the first enquiry will be ENQ-0001.

Two checks were run read-only before the migration: `trucks.id` is text, and `contact_messages` has one row (saved before any switch-on, so intake will never take it).

### Switching it on — Dominic's to run, when he decides (not run)
This only has an effect once the code is live: `40c27cd4` is local, and the live poll doesn't read the switch until the next deploy. Intake starts from the moment of this statement (`updated_at`):
```sql
update public.outreach_settings set value = 'true'::jsonb, updated_at = now() where key = 'enquiries_intake_enabled';
```
To switch it off again (intake stops at the next run; what was stored stays):
```sql
update public.outreach_settings set value = 'false'::jsonb, updated_at = now() where key = 'enquiries_intake_enabled';
```
Drafting also needs decision 1. Without it, intake runs and the enquiries wait as `new` with `draftingHeld: "no_model"`.

## 4 · Checks: `node scripts/enquiries-backend-1.cjs` → 105 passed, 0 failed
It runs with no network, no database, no mailbox, no model and no .env file. It deletes `ANTHROPIC_*`, `OUTREACH_*`, `SUPABASE_*` and `BREVO_*` from its own process at start. It is guarded by the disk guard and `_harness-tmp.cjs`, and it is in the sweep.

1. **Rules.**
   - 16 fixtures:
     - stored nothing: the Brevo copy, two bounces, an auto-reply, two no-reply senders, Dominic's address, two other own-domain addresses, a diner's French "prête" reply, an English refund reply, a German review-request reply, mail to donotreply@;
     - enquiries: a real French enquiry, "How do online orders work?" (not order mail), and a "Re: [HatchGrab contact]" reply from a visitor.
   - Threading: 5 cases, including a thread id from a different person → new.
   - The ref, the numbers check (French commas, an invented 29, Arabic-Indic ٧), and `canAutoSend`.
2. **Answer pack.**
   - The seed is parsed from the migration file itself.
   - The FR pack has the pre-orders fact, the deadline gap, the demo fact and the FR e-reporting gap. It does **not** have the suggested till line.
   - The card-fee guidance is only under DO NOT MENTION.
   - The GB pack never has the FR line.
   - Retired and suggested lines never pass.
   - The pack reads only the pages' readers.
3. **Drafting with the stand-in.** The stand-in writes only from the pack it is given, so its drafts prove what the pipeline handed it.
   - **French enquiry** (modelled on 23 Nov; name, business and town changed to Marc Lenoir, Crêpes du Coin, Valmont-sur-Loire), through the form:
     - **needs_review**;
     - the **deadline ask is a gap**, flagged, citing the approved gap line;
     - the **demo is answered with full access**;
     - **card fees are in their own sentence**, never in the "free" sentence, with no card-fee flag;
     - **numbers check passes**;
     - the till ask is `unknown`, because the till line is only suggested;
     - French draft plus a separate back-translation, cost $0.03 recorded.
   - **French follow-up about e-reporting** (a `RE: [HatchGrab contact]` email): joins ENQ-0001, which reopens, then needs_review with the **FR e-reporting gap** flagged.
   - **Threading:** a second email from the same sender (In-Reply-To his last one) joins the same enquiry, and a re-poll stores nothing.
   - **English enquiry fully covered** (demo and pre-orders):
     - **drafted, no flags**, numbers pass, no back-translation call;
     - linked to the one truck with that address (GB);
     - `canAutoSend` still false.
   - **Invented price** ("29 € a month") → **numbers check fail**, needs_review.
   - A "Note:" line in a draft is removed and flagged.
   - **Spend cap:**
     - with $5 of $5 already spent, **no model call** is made, and the enquiry is logged and left `new`;
     - when the cap is reached mid-draft ($4.995 + $0.01), the next call never starts and the cost is recorded.
   - **3 drafts per run:** 5 enquiries → 3 drafted, 2 left `new`.
   - Switch off → null, no write, no call.
4. **Learning.** `suggestFromEdit` gives one suggested fact (the Note line not part of it). "Note:" lines become suggested guidance and are stripped from customer text. Nothing approves.
5. **The reply poll end to end.** `lib/outreach-mail-poll.ts` is compiled from **`5df925d8` and from this tree** and run on the same fake read-only mailbox (10 messages) and fake database.
   - **switch false** → summary, **every database write (in order)** and **every IMAP call** identical to BASE; the only extra read is the switch;
   - **switch absent** (before the migration) → identical too;
   - **switch true** → the outreach part of the summary and every outreach write are identical to BASE (the outreach reply is still logged by outreach). The enquiry step stores exactly three messages: the form message and Sam's two emails, the second joined to his enquiry.
   - It **stores nothing** for the outreach reply, the Brevo copy, the bounce, the no-reply sender, Dominic's own mail, both diner order emails or the auto-reply. None of their text is anywhere in the database.
   - Drafting is held with `no_model`. The watermark is its own key.
   - Every lock was read-only and no write method was called. There was one extra login, and bodies were read only for the two kept messages.
   - A second run duplicates nothing.
6. **Census.**
   - Of the 61 modules the enquiry code can reach, none is a send path or the mailbox module, no mail package is reachable, and no reachable file holds a send call.
   - No mailbox write appears in the enquiry modules, the poll's enquiry section, or anywhere in the poll file.
   - The step is called last, inside the lock. There is no new cron.
   - No file and no secret is read, except `process.env.ANTHROPIC_API_KEY`, which the poll checks only when the switch is on.
7. **Byte-identical.**
   - 70 protected paths are identical to `5df925d8`.
   - `pollOneAccount` (the outreach walk) is identical.
   - The poll file's only removed lines are the two old header lines.
   - This work changed only its own files.

**tsc:** clean (`node_modules/.bin/tsc --noEmit -p .`, exit 0). **ESLint:** clean on `lib/enquiries`, `lib/outreach-mail-poll.ts` and `scripts/enquiries-backend-1.cjs`.

## 5 · What the stand-in can't prove until 1 December
- **The real model's work:** whether it translates faithfully, splits the asks sensibly, picks topics from the vocabulary, follows "only the pack" and the card-fee rule, and writes in Dominic's voice. The code checks (numbers, sources, gaps, Pay at Hatch, card fees) catch some failures but not tone or a wrong paraphrase.
- **Whether the API accepts the three strict tools** as written. The FAQ translator's first live run got a 400 on `tool_choice`; these send no `tool_choice` and use the same `converse`, but `enum` inside a strict schema hasn't been tried live.
- **Timing:** three calls per draft against the 50-second budget. In practice it may be one draft per run, not three.
- **Real cost** per draft against the $5 cap.
- **The second IMAP login** per run on the real host, which counts sessions. It is logged out in a `finally`.
- **Real subjects and bodies:**
  - Outlook HTML-only mail;
  - diners' replies whose subject was edited (the subject rule misses them until the model hook exists);
  - forwarded order mail.

## 6 · The existing harnesses, before (BASE `5df925d8`, a clean worktree) and after (this tree)
| harness | before | after |
|---|---|---|
| outreach-mail-poll.cjs | ✅ all passed | ✅ all passed |
| outreach-schema-census.cjs | ✅ 42 passed | ✅ 42 passed |
| outreach-log-once.cjs | ✅ 15 passed | ✅ 15 passed |
| outreach-reply-any-notes.cjs | ✅ 54 passed | ✅ 54 passed |
| outreach-mail-send.cjs | ✅ all passed | ✅ all passed |
| outreach-send-read-failure.cjs | ✅ 49 passed | ✅ 49 passed |
| partners-2.cjs | ✅ 78 passed | ✅ 78 passed |
| contact-1.cjs | 252 passed, **1 failed** | 252 passed, **1 failed** (the same one) |
| vercel-cost-1.cjs | — | ✅ 30 passed (after the commit) |

contact-1's one failure exists on BASE too and is not this work: the trucks page's byte-identity check pinned to `3d6228b7` sees the `planTable.json` messages that changed since then (Open items 12).

## 7 · Needs Dominic's decision
1. **How the cron logs in to the Claude API** (drafting is off until this is decided).
   - No Vercel route calls Claude today: the FAQ translator and the competitor checker log in from GitHub Actions by Workload Identity Federation.
   - The code builds the model only if `ANTHROPIC_API_KEY` is set on the environment; otherwise it returns `no_model`.
   - Options:
     - (a) an API key in Vercel, from a workspace with its own low spend limit (**recommended**: the $5 cap in code plus a hard limit at Anthropic);
     - (b) a GitHub Actions job for drafting only. That is not a Vercel cron, but it is a second schedule;
     - (c) federation from Vercel's OIDC token. That would be new work.
2. **Retention.** Enquiry tables are **not** deleted after 24 months yet. The privacy policy says support correspondence is kept for 24 months, and `contact_messages` is purged by `lib/order-retention.ts`, which I did not change (out of scope). The FK goes null when a contact message is deleted, so the enquiry copy would outlive it. A follow-up should add the enquiry tables to the retention job **before switching on**.
3. **The privacy policy and the model.** Drafting sends a customer's message to Anthropic. Check that section 6 names Anthropic, or add it, before drafting is switched on. Intake alone sends nothing outside.
4. **The suggested till line stays suggested.** Pending France's till-software rule (article 286 CGI): a "replaces your till" statement may carry a certification duty. Until it is approved, a till question is `unknown` and goes to review, as the French test shows.
5. **A linked HatchGrab truck's mail becomes an enquiry.** The outreach poll skips it as "not a prospect", so the enquiry step takes it. I read the brief's truck link as wanting this. Say if customers' mail should stay out.
6. **The numbers check is strict.** A number echoed from the customer's own message ("your 2 markets") isn't in the pack, so the draft fails and goes to review. This is safe by default; tell me if their own numbers should be allowed.
7. **Two behaviours to confirm:**
   - Only contact messages and mail **after switch-on** are taken in. To include older ones, set `updated_at` earlier in the switch-on statement.
   - A message whose storage fails is retried every run, and the walk waits at it (the error is in `summary.enquiries.errors`). It never skips past it.

## 8 · Flags on the brief
- **Garbled or wrong path:** "lib/plan-features.ts" doesn't exist. The plan-feature readers are `lib/features.ts`, `lib/feature-table.ts`, `lib/plan-offer.ts` and `lib/plans.ts` (the switches are `public.plan_features`). I treated all four as read-only, and they are in the byte-identical list.
- **Apparent conflict:** "show every SQL statement inline in your chat reply" against "give me only a two-line summary". I followed your usual format: the two-line summary plus the SQL as fenced blocks, labelled (already run / run when you decide). Undo SQL is only below.
- Nothing else contradicted. The france-readiness-1 report was not touched, and neither were the two uncommitted reports already in the tree (`docs/plans-everywhere-5-report.md`, `docs/vercel-cost-1-report.md`).

## 9 · Not done, on purpose
- No screens.
- No sending.
- No deploy, no push.
- No change to the manual. Its Open items list should gain decisions 1–3 and "switch on enquiries" when Dominic is ready.
- No real model call.
- The learning functions aren't called by anything yet: they wait for the screens.

## Undo (only if Dominic asks)
⛔ DO NOT RUN unless Dominic asks. It removes every enquiry row, the knowledge lines and the switch.
```sql
begin;
drop table if exists public.enquiry_drafts;
drop table if exists public.enquiry_messages;
drop table if exists public.enquiries;
drop table if exists public.reply_knowledge;
drop table if exists public.enquiry_spend;
drop function if exists public.enquiry_next_ref();
drop sequence if exists public.enquiry_ref_seq;
delete from public.outreach_settings where key in ('enquiries_intake_enabled', 'enquiries_intake_state');
commit;
```
