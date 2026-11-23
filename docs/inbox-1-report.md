# inbox-1 — Admin › Inbox: one place for every incoming email

**23 November 2026 · built on enquiries-backend-1 (`40c27cd4`) · migration run and verified · nothing deployed, nothing pushed, nothing sent**

Admin now has an **Inbox** tab, placed first, with a count of the emails waiting. It shows every email that needs an answer
(enquiries, prospects, partners and customers) in three columns: the list, their message, and your reply. Replies are drafted
in English, shown in the customer's language and sent from the right address. **Nothing is sent unless you press Send**, and
`canAutoSend` is still false.

| | |
|---|---|
| Code | `fbc98a34` (on branch `france-vat-1`, see §7.1) — not pushed |
| Migration | `supabase/migrations/20261123_inbox_1.sql`, committed `09f191df`, **run** (sha256 `0dac3e209c7367d6`), verified read-only |
| Harness | `scripts/inbox-1.cjs` — **164 passed, 0 failed** (in the sweep) |
| Before / after | §6 |
| Deploy | **needed** (yours). The database part is live now and changes nothing on its own |

---

## 0 · Flags about the brief

1. **Two instructions conflict: "SQL inline in chat" and "chat = only a two-line summary".** I followed your usual format: the
   two-line summary, then the SQL as fenced blocks, then the filename. The same conflict came up in enquiries-backend-1.
2. **"Nothing is sent except when Dominic presses Send on the Inbox."** Read literally, this would also stop outreach sends,
   sequences and the partner sends cron. Another hard rule says those must keep working exactly as now, so I read the first rule
   as covering this work only. Nothing in this work sends on its own.
3. Nothing arrived garbled.

---

## 1 · What was built

### The page: `/admin/inbox` (Admin's first tab)

- **The tab:** 📥 **Inbox**, first in Admin's top navigation. Its orange badge counts the emails waiting; the count is fetched
  alongside the page's first load and never holds the page up.
- **The address:** `/admin/inbox` redirects to `/admin?tab=inbox`, the same way `/admin/outreach` works. `?c=<conversation>` is
  carried across, so a link opens with that conversation selected.
- **Layout:** the same on a 16in laptop and a 27in 4K screen. It is full width with no side padding. The three columns fill
  the window below the tab row and each scrolls on its own; the height is measured, not guessed. On a phone they stack.
- **Top bar:** All · Enquiries · Prospects · Partners · Customers, each with its waiting count. The search box (name, email,
  words) is on the right.

**a) The list, 300px wide**
- One row per conversation with a waiting email, oldest unanswered first, under **Older** and **Today**.
- Each row shows:
  - the name, with the organisation in brackets where known, and the time;
  - the coloured type label: Enquiry blue, Prospect violet, Partner teal, Customer amber;
  - the address they wrote to in short form (`bonjour@`, or "contact form"), and the language;
  - a one-line preview.
- The selected row is pale orange with a `#EF8B2C` bar on the left.
- After Send the row says **Sent** and leaves the waiting count at once, on the filter and on the tab.
- When nothing is waiting: "No customer emails waiting."

**b) Their message**
- The heading "Their message", then "in English, translated from French" (or "in English").
- A **Show original / Show English** toggle when the message was translated.
- A line with the name · organisation · email · "to bonjour@hatchgrab.com" (or "through the contact form") · the ENQ ref.
- "Show N earlier messages" opens the whole thread: both directions, newest last.
- The latest message in full at 15px, line height 1.65, never cut short.
- **Mark done** and **Snooze** (tomorrow / in 3 days / in a week), using the same rules as Today (see §7, decision 6).

**c) Your reply**
- The heading "Your reply · in English · you can type in it".
- **Show French** (in the customer's language) shows what they will receive, read-only. If you have edited the English since it
  was translated, it says Send will translate the final English again.
- The English draft box: at least 330px tall and resizable. Then "Your comments for the AI".
- The buttons:
  - **Update reply.** With an empty comment it says "Add a comment first."; afterwards, "Reply rewritten with your comments."
  - **Attach:** a file, or the **Plans PDF**, through the CRM's own attachment paths.
  - "from <address>".
  - **Send**, dark slate. It reads "Send in French" (and so on) for a translated reply, and "Send" for English.
- After Send, a green note: "Sent in French from bonjour@hatchgrab.com. It's in the conversation history."
- **Not on this page** (your decision): review flags, gaps and the back-translation. They are still stored.

### What feeds it: one read model, no data moved (`lib/inbox/read-model.ts`)

| Type | Read from | Waiting means |
|---|---|---|
| Prospect | **The Today route's own GET** (`app/api/admin/outreach/today/route.ts`), called in-process with your sign-in. The rule is not re-implemented | Exactly Today's "Replies waiting" |
| Partner | Inbound `outreach_messages` with a `partner_id` | Received, not a test, not done or snoozed (the same `needsAttention` rule), and nothing sent by us to that partner since |
| Enquiry / Customer | `enquiries` / `enquiry_messages` (enquiries-backend-1) | An incoming message with no reply from us after it, the enquiry not closed (Mark done) and not snoozed |

- **Customer:** an enquiry linked to a truck (`truck_id`), or from the contact address of a discovery truck linked to a
  HatchGrab truck.
- **Counts:** these count **emails**, as Today does; the list shows one row per conversation. So Today's count always equals the
  Inbox's Prospects count (the harness runs the real Today route to check this).

### Today, prospect pages and partner drawers

- **Today › Replies waiting:** the same count. Each row's first button is now **Open in Inbox**, which selects that conversation
  in place. Mark done, Snooze and Open stay.
- **A prospect's timeline:** an incoming email offers **Open in Inbox** instead of Reply, and the **R** key does the same.
  "Follow up on this" (a chase on your own email) stays.
- **A partner's drawer:** their email offers **Open in Inbox** instead of Reply. "Write email" stays.
- **Unchanged:** Chasers due, Compose, first contact, sequences, templates and the partner sends cron.

### Drafts for every type

- **Enquiries and customers:** the enquiries-backend-1 draft, made by the poll.
- **Prospects and partners:** made **when the conversation is first opened** (once per incoming email), with the same drafting
  core the poll uses. That core was moved out of `draftOne` into `composeDraft`, so both share one implementation.
  - The core works from the answer pack (approved knowledge only).
  - For a prospect or partner it adds a **"THIS CONVERSATION"** section: who they are, their current platform (prospects),
    the partner's code and deal (or "no code yet — do not offer one"), and the last six emails.
  - Prospects in English skip translation.
- **Update reply:** sends the current English and your comment to the model, and returns a new English draft plus the
  customer-language version. Every comment is stored in `inbox_comments`.
- **After Send:**
  - each comment becomes **one suggested** `reply_knowledge` line (kind guidance, source `note`, `source_ref` the ENQ ref or
    the conversation key);
  - if you changed the AI's English by hand, what you added becomes a **suggested** fact (source `edit`).
  - Nothing is approved automatically, and none of it appears on this page.
- **Hand edits:** if you edit the English after it was translated, Send first **translates the final English again**, then sends.
  The history keeps the English and the version sent (`inbox_sent`; an enquiry's outgoing message holds both too).
- **No model (no key yet):**
  - Reading works, and you can type a reply by hand.
  - Update reply says "Drafting isn't switched on yet."
  - For a non-English email the page says "Translation isn't switched on yet." and Send is disabled. Send works for English.
- **Numbers check (decision 6):** numbers that appear in the customer's own message (or its English) are now allowed. This
  applies to the poll's drafts too.
- **The $5 a month cap and the run deadline** apply to Inbox model calls as well. They share `enquiry_spend` with the poll.

### Sending: the existing CRM delivery

- **Prospects:** sent through `app/api/admin/outreach/mail-send` POST, the existing route called in-process with your sign-in.
  - It goes from dominic@ with the route's own threading, refusals and contact log.
  - That log marks earlier replies done, so the conversation leaves Today and the Inbox together.
- **Partners:** sent through `app/api/admin/partners/mail-send` POST in the same way, from dominic@.
- **Enquiries and customers:** sent from **hello@**, using `lib/inbox/send.ts`:
  - it logs in with hello@'s own `OUTREACH_MAIL_*` credentials, through a new `accountForInboxReply`;
  - the outreach envelope builds the email (`composeRaw`, `rawMailFor`, `smtpTransportOptions`), with a Message-ID of ours and
    `In-Reply-To` / `References` onto their email;
  - the Sent copy goes into **hello@'s Sent** (`fileSentCopy`: if the server has not filed it, it is appended once);
  - a contact-form enquiry starts a new thread with the subject **"HatchGrab — ENQ-0002"**. The ref in the subject means their
    answer joins the same enquiry.
- **hello@ as a sender:** it was "legacy, read-only". It is now a send account **for Inbox replies to enquiries only**
  (`accountForInboxReply`). Outreach still uses `accountForSend`, which still cannot return hello@.
- **The From address:** an optional `send_from_address` on the envelope that is never a database column. Every outreach send
  leaves it out and composes **byte for byte as before**; the harness compares against the commit before this work.

### Aliases

- `outreach_settings.mail_aliases` holds the 36 addresses as a JSON array: admin, ahoj, annyeong, billing, bok, bonjour,
  buna, ciao, czesc, hallo, halo, hei, hej, hola, jambo, konnichiwa, kumusta, labas, marhaba, merhaba, namaste, nihao, ola,
  privacy, privet, sawasdee, shalom, support, sveiki, szia, tere, tester, xinchao, yassou, zdravei, zdravo, each
  @hatchgrab.com.
- **No loops:** all 36 count as our own addresses (`skipReason` now takes the list), so mail **from** any of them is never taken
  in.
- **The address written to** is recorded on each incoming message (`enquiry_messages.to_address`).
- **`enquiries_reply_from_alias`** is `false`. When it is true, an enquiry's reply comes from the alias they wrote to; when
  false, from hello@.
- **Language hint:** the alias written to (bonjour@ → French, hola@ → Spanish …) is passed to the model as a hint, and used by
  the no-model guess when detection is unsure. admin@, billing@, privacy@, support@ and tester@ give no hint.

### Retention (decision 2)

- **`lib/order-retention.ts`** (the daily job) now deletes each **enquiry 24 months after the conversation's last message**, the
  same 24 months as `contact_messages`.
- **What goes with it:** its messages, drafts and the Inbox's own drafts, comments and sent records (`on delete cascade`).
- **How the last message is known:** `enquiries.last_message_at`, kept up to date by a trigger on every new message in either
  direction. An enquiry with no message at all is aged by its `created_at`.
- **The result:** the job's output now includes `enquiriesDeleted`.

What the daily job does, as SQL (shown for clarity — **not** to run):

```sql
-- the 24-month enquiry rule, as lib/order-retention.ts deleteOldEnquiries applies it (in id-keyed batches of 500)
delete from public.enquiries
 where last_message_at < now() - interval '24 months'
    or (last_message_at is null and created_at < now() - interval '24 months');
-- enquiry_messages, enquiry_drafts, inbox_drafts / inbox_comments / inbox_sent rows of those enquiries go with them (on delete cascade)
```

### The replies list (your 23 Nov update)

The seeded e-reporting line is now an **approved fact**:

- wording: "E-reporting (France): HatchGrab will provide the sales records they need to send to their approved e-reporting
  platform."
- topics: e-reporting, accounting; countries: FR; customer_safe: true.

The till line stays **suggested**.

---

## 2 · Files

**New**
- `components/admin/InboxTab.tsx` — the page.
- `app/api/admin/inbox/route.ts` — GET count / list / thread; POST draft, update_reply, **send**, mark_done, snooze,
  signed_upload, plans_pdf.
- `app/(app)/admin/inbox/page.tsx` — the `/admin/inbox` redirect.
- `lib/inbox/read-model.ts`, `drafting.ts`, `send.ts`, `model-server.ts`, `aliases.ts`, `language.ts`, `types.ts`, `open.ts`.
- `supabase/migrations/20261123_inbox_1.sql`.
- `scripts/inbox-1.cjs`, and the screenshots in `docs/inbox-1/`.

**Changed**
- `app/(app)/admin/page.tsx` — the Inbox tab first, its count, mounted on first visit.
- `components/admin/OutreachPanel.tsx`, `ProspectTimeline.tsx`, `ProspectWorkspace.tsx`, `PartnersTab.tsx` — Open in Inbox.
- `lib/enquiries/run.ts` — `composeDraft` shared; the numbers rule; aliases; `to_address`.
- `lib/enquiries/model.ts` — the revise and translate steps; the language hint.
- `lib/enquiries/rules.ts` — the alias own-address rule.
- `lib/enquiries/store.ts` — reads the aliases.
- `lib/enquiries/learning.ts` — `suggestFromComment`.
- `lib/outreach-mail-envelope.ts` — the optional From.
- `lib/outreach-mail-accounts.ts` — `accountForInboxReply`.
- `lib/order-retention.ts` — the 24 months.
- `scripts/harnesses.json` — inbox-1 added to the sweep.
- `scripts/enquiries-backend-1.cjs`, `scripts/outreach-reply-any-notes.cjs`, `scripts/outreach-reply-attach.cjs`,
  `scripts/outreach-workspace-v4.cjs` — re-pinned or re-anchored, see §6.

**Not touched:**
- ordering, checkout, payments, KDS, dashboard, Add order, heartbeat, auth, Manage;
- the contact form, the landing page, customer pages and words, the legal pages (the harness checks this, §12);
- the outreach send, sequence, template and partner send / cron code;
- no `outreach_templates` row.

---

## 3 · Every SQL statement

**Already run** (the migration, as committed in `09f191df`):

```sql
begin;

-- 1 · enquiry_messages
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

-- 2 · enquiries
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

-- 3 · the Inbox's own tables
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

-- 4 · the two settings
insert into public.outreach_settings (key, value) values
  ('mail_aliases', '["admin@hatchgrab.com","ahoj@hatchgrab.com","annyeong@hatchgrab.com","billing@hatchgrab.com","bok@hatchgrab.com","bonjour@hatchgrab.com","buna@hatchgrab.com","ciao@hatchgrab.com","czesc@hatchgrab.com","hallo@hatchgrab.com","halo@hatchgrab.com","hei@hatchgrab.com","hej@hatchgrab.com","hola@hatchgrab.com","jambo@hatchgrab.com","konnichiwa@hatchgrab.com","kumusta@hatchgrab.com","labas@hatchgrab.com","marhaba@hatchgrab.com","merhaba@hatchgrab.com","namaste@hatchgrab.com","nihao@hatchgrab.com","ola@hatchgrab.com","privacy@hatchgrab.com","privet@hatchgrab.com","sawasdee@hatchgrab.com","shalom@hatchgrab.com","support@hatchgrab.com","sveiki@hatchgrab.com","szia@hatchgrab.com","tere@hatchgrab.com","tester@hatchgrab.com","xinchao@hatchgrab.com","yassou@hatchgrab.com","zdravei@hatchgrab.com","zdravo@hatchgrab.com"]'::jsonb),
  ('enquiries_reply_from_alias', 'false'::jsonb)
on conflict (key) do nothing;

-- 5 · the e-reporting line: a gap → an approved fact
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
```

**Run when you decide — after a test send from an alias** (replies to enquiries then come from the alias they wrote to):

```sql
update public.outreach_settings set value = 'true'::jsonb, updated_at = now() where key = 'enquiries_reply_from_alias';
```

**Still off, from enquiries-backend-1** (intake; it takes effect once the code is deployed):

```sql
update public.outreach_settings set value = 'true'::jsonb, updated_at = now() where key = 'enquiries_intake_enabled';
```

**What the run showed** (MCP, read-only, after the migration):
- RLS is on for all six enquiry and Inbox tables. The three new tables have no policies and are granted to `postgres` and
  `service_role` only.
- The nine new `enquiry_messages` columns, `enquiries.snoozed_until` and `enquiries.last_message_at` exist, and the trigger is
  `enquiry_messages_touch_last`.
- Settings: `mail_aliases` is an array of 36 and `enquiries_reply_from_alias` = false (both 15:47 UTC);
  `enquiries_intake_enabled` is still false.
- `reply_knowledge`: e-reporting is a fact, approved, customer-safe, FR. The till line is a fact, **suggested**. There are 8 rows
  in all.
- The data tables are empty: 0 enquiries, 0 drafts, 0 comments, 0 sent.

The page refresh was not run because REVALIDATE_SECRET isn't set. That warning only matters for the marketing pages; this
migration touches none of them.

---

## 4 · Screenshots (`docs/inbox-1/`)

All are fixture data rendered by the **real admin page**, bundled from source, with the **real Inbox read model's** answers over
the fixtures. Nothing touches a database or mailbox.

| File | What |
|---|---|
| `inbox-laptop-webkit.png`, `inbox-laptop-chromium.png` | 1512×982, the French enquiry selected by deep link |
| `inbox-4k-webkit.png`, `inbox-4k-chromium.png` | 2560×1440, the same layout full width |
| `inbox-laptop-*-show-french.png` | "Show French": what they will receive |
| `inbox-laptop-*-sent.png`, `inbox-4k-*-sent.png` | after Update reply and Send: the green note, the row "Sent", counts 5 → 4 |
| `inbox-laptop-*-prospect.png` | a prospect, "Show 1 earlier message" open, from dominic@ |
| `inbox-laptop-*-no-model.png` | no Claude key: "Translation isn't switched on yet.", Send disabled, "Drafting isn't switched on yet." |
| `inbox-laptop-*-empty.png` | "No customer emails waiting." |
| `inbox-phone-webkit.png`, `inbox-phone-chromium.png` | 390px: stacked, nothing wider than the screen |

---

## 5 · The harness — `scripts/inbox-1.cjs`, 164 passed, 0 failed

- **Isolation:** no network, database, mailbox, model or .env file.
- **The fake mail package:** it composes in memory only. Any SMTP transport records the attempt and refuses; none was made.
- **The model:** a stand-in.
- **`--no-screens`:** skips §13.

| § | What it proves |
|---|---|
| 1 | The Inbox route (compiled) answers 404 to a non-admin for GET and POST, Send included. Five conversations, once each, with the right type, written-to address, organisation and language. Closed, snoozed, answered, a linked truck's outreach mail, a reply to a test send and an answered partner are not listed. Counts are emails; oldest first |
| 2 | The **real** Today route's count equals the Inbox's Prospects count (also with two replies from one prospect: 2 rows in Today, 1 conversation counting 2). The Open in Inbox links and the redirect. The buttons Today, the timeline, the R key and the drawer now offer |
| 3 | A prospect reply goes to the outreach route and a partner reply to the partner route, both carrying no From of their own (so dominic@). An enquiry goes from hello@ (header, envelope and login), threaded, with the Sent copy filed using hello@'s login. With `enquiries_reply_from_alias` true it goes from **bonjour@**; support@ for the customer who wrote to support@; hello@ for the contact form. Each type leaves the waiting list once sent. Pressing Send twice with the same key sends once |
| 4 | The stored 36 match the brief. Mail **from** each is `own_address`; the poll's intake skips a message from hola@ and stores one to hola@ with its address. The alias language hints |
| 5 | Update reply: an empty comment is refused with nothing stored; no model gives "Drafting isn't switched on yet."; with the stand-in, rewritten and the comment stored. The partner and prospect packs carry their own section; English skips translation |
| 6 | Hand-edited English is translated again before Send and the bytes carry the new version. No model plus French is refused; no model plus English is sent. "Note:" lines never reach the customer |
| 7 | Two comments stay unlearned until Send. After Send they are 2 suggested guidance lines (`note`, ENQ-0002) plus the hand edit as 1 suggested fact (`edit`); nothing is approved |
| 8 | Retention deletes only conversations whose last message is older than 24 months (by creation when they have none). The daily run reports `enquiriesDeleted` |
| 9 | Decision 6: the customer's own 200 passes; an invented €12 fails |
| 10 | An outreach row composes **byte-identically** to `12e9a770` (boundaries aside), From dominic@, with the same envelope. Deliver, the poll, sequences, templates, the partner send / cron, Today, timeline and mail-send routes are unchanged since then. No file names `outreach_templates` |
| 11 | Census: `lib/inbox/send.ts` is imported only by the Inbox route. Its POST answers 404 first and calls `sendReply` only in the `send` branch. hello@ as a sender is used only there. No cron or poll reaches the Inbox modules. `canAutoSend` is false. The page posts `send` only from the Send button. No transport was used |
| 12 | Every protected path: no inbox-1 commit and no working-tree file of this work touches one |
| 13 | §4's screenshots, plus the words, colours, 15px / 1.65, the 330px box, the From line, the button labels, the toggles, the count drop, and no page errors — in **WebKit and Chromium** |

---

## 6 · Before / after (the existing harnesses)

The same 37 harnesses ran on the tree before this work (`12e9a770` plus another session's uncommitted edits) and after it.

| Harness | Before | After | Note |
|---|---|---|---|
| 30 outreach harnesses (channel-for, crm-polish, crm-today, dnc-pool, bold-persists, editor-toolbar, list-columns, log-once, logo-latch, mail-format, mail-poll, mail-send, recorded-steps, send-read-failure, send-visible, sequence, stage-advance, step-logging, templates-layout, upload-refresh, workspace, workspace-v2, -v3, -v3-fixes, -v4-fixes, instant-send, legal-footer …) | pass | **pass**, the same counts | — |
| outreach-schema-census | 42/0 | first run 41/1 → **42/0** | My two `.eq()` calls named their column through a variable; the census wants literals. Fixed in the code |
| outreach-reply-any-notes | 54/0 | first run 53/1 → **54/0** | ⚠️ **Re-anchored.** It asserted "Reply on a received email", which the brief replaces with Open in Inbox. Now asserted: received → Open in Inbox, sent → Follow up on this, never a test send |
| outreach-reply-attach | pass | first run 1 failed → **pass** | The same re-anchoring |
| outreach-workspace-v4 | 71/0 | first run 70/1 → **71/0** | The same re-anchoring |
| legal-follow-ups | 34/0 | 34/0 | The retention result has one more field (`enquiriesDeleted`) |
| partners-1, partners-2 | pass, 78/0 | pass, 78/0 | — |
| loyalty-1 | 80/1 | 80/1 | Fails the same way on both; not this work |
| contact-1 | 247/6 | 252/1 | The 5 language-key failures cleared between the runs because of the other session's uncommitted `messages/` edits, not this work. The 1 left is the old planTable.json one |
| enquiries-backend-1 | 103/2 | **105/0** | Its two "byte-identical since 5df925d8" checks compared against the working tree, so later work (france-vat-1, then this) broke them. ⚠️ **Re-pinned** to compare against its own commit `40c27cd4`; everything else in it (drafting, intake, census) passes on the changed code |
| **inbox-1** (new) | — | **164/0** | — |

The three re-anchored assertions are in `scripts/outreach-reply-any-notes.cjs`, `scripts/outreach-reply-attach.cjs` and
`scripts/outreach-workspace-v4.cjs`, each with a dated inbox-1 note. They still protect what they protected before: a test send
is never answerable, and a follow-up on my own email stays on the prospect's page.

---

## 7 · Decisions for you

1. **Where these commits sit.** The working tree was on branch `france-vat-1` (another session's, still active in the same
   folder), so inbox-1's commits are on top of the two france-vat-1 commits. Deploy them together, or cherry-pick inbox-1 onto
   main.
2. **A customer who writes to dominic@ appears nowhere yet.** The poll deliberately skips mail from a linked HatchGrab truck, and
   enquiry intake reads hello@'s INBOX only. A customer's reply to dominic@ is therefore neither a prospect reply nor an enquiry.
   Taking it in would mean the poll reading dominic@'s INBOX for linked trucks. **Recommendation:** yes, as a small follow-up.
3. **Replies from hello@ are seen by the outreach poll.** The poll walks hello@'s Sent folder for Outlook-sent mail. If an
   enquirer's address is also a prospect's or partner's contact address, your Inbox reply is logged on that prospect or partner,
   as an email you sent from Outlook would be today. **Recommendation:** keep — the email was sent to them.
4. **The subject of a reply to a contact-form enquiry:** "HatchGrab — ENQ-0002". It is language-neutral and keeps their answer
   on the same enquiry. Change it if you'd like other wording.
5. **When prospect and partner drafts are made:** when you first open the conversation (once per incoming email, within the $5
   cap), not by the poll. **Recommendation:** keep — no spend on mail you never open.
6. **Mark done and Snooze on the Inbox.** They weren't in the mockup; I added them, using Today's rules, because without them an
   email that needs no answer ("thanks!") could never leave the list. Keep or remove?
7. **Approving suggested lines.** Comments and edits become `suggested` rows, and no screen exists yet to approve them; for now
   that is SQL. A small Knowledge screen is the next step.
8. **Still open from enquiries-backend-1 §7:**
   - The **Claude key on Vercel** (§8).
   - **Anthropic in the privacy policy.**
   - The **till line** (still suggested).
   - Switching **intake** on.
9. **Minor, existing behaviour:** the numbers check also reads "1.5" as 15, so a draft saying "€15" passes when the pack has
   "1.5%" (found while testing; I did not change it).

## 8 · What can't be checked until the API key is in Vercel

- Real drafts and translations:
  - the quality of the French, Spanish and other replies;
  - the strict `record_revision` / `record_translation` tools against the real API;
  - their cost per call (priced from `competitor_check_settings.prices`).
- The model's language detection and how it uses the alias hint.
- Update reply's real rewrite, and the automatic draft when a conversation is opened.
- Until then: reading, English replies typed by hand, Mark done, Snooze and attachments all work; anything needing a model shows
  the "isn't switched on yet" words.

**Can't be checked until deployed** (and with a test send of your own):
- hello@ sending through Namecheap with an alias as From — the aliases must be allowed as senders on hello@. That is the test to
  do before switching `enquiries_reply_from_alias` on.
- The Sent copy in hello@'s Sent.
- The live Open in Inbox from Today.

## 9 · Commits, checks

- `09f191df` — the migration.
- `fbc98a34` — the code, the harness and the screenshots.
- The report itself is in the commit after that.
- **Not pushed. Not deployed.**
- Another session's uncommitted edits in the same folder were left alone: `lib/order-charges.ts`, several `scripts/*`, the
  `messages`-related fixtures, and their own line in `scripts/harnesses.json`. Only inbox-1's one line of that file was
  committed.
- `tsc` is clean. ESLint: the new files are clean, and no changed file has more problems than at HEAD (OutreachPanel 6 → 6,
  admin page 13 → 13, both existing).
- `next build` was not run, because another session is working in the same folder. The admin page was bundled from source with
  esbuild for the screenshots.

## Undo (only if Dominic asks)

```sql
begin;
update public.reply_knowledge set kind = 'gap', wording = 'E-reporting (France) is not sent by HatchGrab; sales can be downloaded for their accountant or e-reporting platform; flag for review.', approved_at = timestamptz '2026-11-23 00:00:00+00'
 where source = 'dominic' and source_ref = '23 Nov 2026' and 'e-reporting' = any(topics);
delete from public.outreach_settings where key in ('mail_aliases', 'enquiries_reply_from_alias');
drop table if exists public.inbox_sent, public.inbox_comments, public.inbox_drafts;
drop trigger if exists enquiry_messages_touch_last on public.enquiry_messages;
drop function if exists public.enquiry_touch_last_message();
drop index if exists public.enquiries_last_message_idx;
alter table public.enquiries drop column if exists snoozed_until, drop column if exists last_message_at;
alter table public.enquiry_messages drop constraint if exists enquiry_messages_out_has_send_status;
drop index if exists public.enquiry_messages_idempotency_uidx;
alter table public.enquiry_messages drop column if exists to_address, drop column if exists from_address, drop column if exists send_status,
  drop column if exists attempts, drop column if exists last_error, drop column if exists sent_copy, drop column if exists idempotency_key,
  drop column if exists attachments, drop column if exists updated_at;
commit;
```
