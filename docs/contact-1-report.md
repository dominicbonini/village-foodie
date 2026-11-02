# contact-1: HatchGrab's own contact form in every language

*2 November 2026. **Done**, committed on `main` (not pushed or deployed). Village Foodie keeps Tally.*

## What to do

1. **Add one variable in Vercel** (Production and Preview; server-only, so not `NEXT_PUBLIC_`): **`CONTACT_IP_SALT`**.
   - Copy its value from `.env.local`, where I created it: 64 hex characters, made with `openssl rand -hex 32`. The value isn't in this report or the chat.
   - It salts the IP hash and signs the form's render time.
   - Without it the form still works, but it stores no IP hash and skips the 3-second check (both are logged).
2. **Check `NEXT_PUBLIC_SUPPORT_EMAIL` in Vercel is `hello@hatchgrab.com`.**
   - The form emails that address.
   - In `.env.local` it is set to something else (checked yes/no, not printed).
   - If the variable is unset in Vercel, the form falls back to hello@hatchgrab.com.
   - The same variable is the sender of the resend-verification and change-email emails, and Manage's support address, so changing it changes those too.
3. **Optional:** `docs/reference-manual.md` §77.12 still lists "the contact form (Tally, English…)" under "Known gaps, kept". That line needs removing. I don't edit the manual (see §4 below).

## 1 · The form

**Where:** the HatchGrab render of `/contact` only (`app/contact/HatchGrabContact.tsx` → `app/contact/HatchGrabContactForm.tsx`, styles in `app/contact/contact-form.css`).
- The page's heading, intro, "Email us" block and language handling are as they were.
- The form heading is now "Or send us a message".

**The fields:**
- "What's it about?" is a native `<select>`, defaulting to "A question about HatchGrab".
- Your name (100 characters) and Email (254) sit side by side on a laptop and stacked on a phone.
- Truck or business name (120; placeholder "e.g. Pizza Kitchen"):
  - "(optional)" while a question or "Something else" is chosen;
  - required, with "(optional)" gone, for "Help with my account".
- Your message (10–5,000 characters).
- "Send message" uses the landing's own `.btn .btn-primary .btn-lg`.
- "We'll use your details only to reply to you." links the visitor's own-language Privacy Policy (`legalPath`): `/privacy`, `/de/privacy`, `/jp/privacy`, `/ae/privacy`, and so on.

**One rule for browser and server:** `lib/contact.ts`.
- Lengths are counted in characters, as Postgres counts them, so an emoji is 1, not 2.

**`?topic=`:** "General Enquiry", every other old Tally value, and anything unrecognised select the first topic. Only the form's own ids (`account`, `other`) pick another. `?venue=` and `?truck=` are ignored on HatchGrab.

**After sending:** the form is replaced by the green box, "Thanks — your message has arrived." / "We'll reply by email to the address you gave.", and focus moves to it.

**Errors:**
- **Field errors** are inline under each field, with `aria-invalid` and `aria-describedby`, and focus goes to the first wrong field.
- **Send errors** appear beside the button (`role="alert"`):
  - too many messages: "You've sent a few messages already — please try again later, or email us at hello@hatchgrab.com.";
  - anything else: "Something went wrong — please email us at hello@hatchgrab.com.".

**Accessibility:**
- Every label is tied to its field.
- The trap field is off-screen, `aria-hidden` and out of the tab order.
- Arabic pages are right to left (as already set), and the select's arrow moves left there.

**The words:**
- **Keys:** 30 under `contactPage` (`formHeading` plus `contactPage.form.*`), in en-GB and all 28 bases, each in the register the page already used.
- **Typography:** apostrophes are typographic, as in the rest of en-GB.
- **Numbers:** limits are formatted in each language (`5.000` in German).
- **Plural-heavy languages:** pl, cs, sk, sl, hr, bg, lt, lv and ar phrase the limits as "maximum number of characters: N", so no number ever needs a plural form.
- **Variants:** en-US needs none; its old "Or fill out the form below" override is gone. es-MX gets three Mexican sentences (the thank-you title and the two send errors).
- **Back-translations:** updated in `docs/i18n/back/`.
- **English stays English** (35.an-20): the email to you, and Admin.

**Removed from the HatchGrab host (it existed only for Tally):**
- the Tally `<Script>` and iframe;
- the `Suspense` wrapper;
- the `ContactForm` import;
- the keys `contactPage.loadingForm` and `contactPage.formTitle` (the iframe's loading line and accessible name), in every language and back-translation.

`app/contact/ContactForm.tsx` (the Tally embed) stays, for Village Foodie.

**Screenshots** (`docs/contact-1/`, WebKit, real fonts). The live form is mounted in the browser and `/api/contact` is intercepted, so nothing is stored or sent:
- `contact-uk-1440-form.png`, `contact-uk-1440-error.png` ("Please enter your name."), `contact-uk-1440-thanks.png`;
- `contact-de-430-form.png`, `contact-de-430-error.png` (account help with no truck name), `contact-de-430-thanks.png`.

## 2 · The server: `POST /api/contact`

`app/api/contact/route.ts` wires the real dependencies into `lib/contact-server.ts` `submitContact`. It runs on the HatchGrab host only; any other host gets a 404.

1. **Spam, no captcha.** In each case the bot gets "sent", and nothing is stored, sent or counted against a limit:
   - the trap field (`website`) is filled;
   - the signed render time (HMAC with `CONTACT_IP_SALT`) is under 3 seconds old, forged, missing, or in the future.
2. **The same validation as the browser.** Problems come back as a 400 with each field's error.
3. **Upstash limits** (`lib/ratelimit.ts`; rolling windows):
   - 5 an hour per IP address (`hg_rl_contact_ip`, keyed on the salted IP hash);
   - 20 a day per email address (`hg_rl_contact_email`, keyed on sha256 of the lower-cased address).
   - **Over a limit:** 429 and the "too many" message.
   - **An Upstash error fails open**, as every other limiter here does.
4. **Saved first.** A failed save is a 500 with the "something went wrong" message, never a pretend success.
5. **Then emailed through Brevo:**
   - **to** `NEXT_PUBLIC_SUPPORT_EMAIL`, falling back to hello@hatchgrab.com;
   - **from** the verified hello@hatchgrab.com sender;
   - **Reply-To** the visitor;
   - **subject** `[HatchGrab contact] {topic} — {name} ({country}, {language})`, for example "… Help with my account — Ana Müller (Germany, German)";
   - **body:** plain text with every field, the page it came from (`https://www.hatchgrab.com/contact?…`) and the time in UK time ("Monday, 2 November 2026 at 18:30:05 GMT"). The HTML part is the same text escaped, and line breaks are stripped from the subject.
   - **No auto-reply.**
6. **If Brevo fails:**
   - the row stays with `email_status = 'failed'`;
   - the failure is logged (`[contact] email failed for message <id> … kept as 'failed'`);
   - the visitor still sees the thank-you box.
   - **The retry:** the existing hourly job (`/api/cron/demo-cleanup`, schedule `0 * * * *`) also runs `retryContactEmails`, as its own step. It never touches the demo run's result, log row or alert.
     - It retries `failed` rows, and rows still unsent 10 minutes after saving.
     - That is up to 3 retries after the first send (`email_attempts` reaches 4 at most).

## 3 · Data: migration `20261061_contact_1.sql`

- **`contact_messages`**, with the brief's columns:
  - `id`, `created_at`, `topic`, `name`, `email`, `business_name`, `message`, `country`, `locale`, `page_path`, `ip_hash` (sha256 of `salt:IP`), `email_status` (`'sent'` / `'failed'`, null until the first send), `provider_message_id`;
  - **plus one I added:** `email_attempts`, which the "up to 3 retries" rule needs.
- **Checks** mirror the form's rules, and an account-help row must have its business name.
- **Security:** RLS on, no policies, grants revoked from anon and authenticated; the service role only.
- **24 months, then deleted:** by the existing daily retention job (`/api/cron/order-retention`, 04:30 UTC; `lib/order-retention.ts` `CONTACT_RETENTION_MONTHS = 24`, `contactMessagesDeleted` in its result).

**Run** with `scripts/db-migrate.cjs` once committed (9612a345), then verified read-only. ⚠️ **The table was already there when it ran.**
- At **20:40:17 UTC** this exact file was run in the **Supabase dashboard SQL editor**: Postgres logs it as "source: dashboard", from a user session, with pasted line endings. Not by me.
- At 20:42:07 the committed run found everything in place. Its `if not exists` steps skipped, and its `enable row level security`, `revoke` and `grant` re-applied the same settings.
- The live table matches the file exactly, with 0 rows.

```sql
-- the migration as run
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
  check (topic <> 'account' or business_name is not null)
);
create index if not exists contact_messages_created_at_idx on public.contact_messages (created_at);
create index if not exists contact_messages_unsent_idx on public.contact_messages (created_at) where email_status is distinct from 'sent';
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated, public;
grant all on public.contact_messages to service_role;
commit;
-- db-migrate: applied — one transaction, no error (notices: the table and both indexes already existed, skipping)
```

```sql
-- verify (read-only MCP)
select 'columns' k, string_agg(column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'-'), ', ' order by ordinal_position) v from information_schema.columns where table_schema='public' and table_name='contact_messages'
union all select 'rows', count(*)::text from public.contact_messages
union all select 'rls', relrowsecurity::text from pg_class where relname='contact_messages' and relnamespace='public'::regnamespace
union all select 'policies', coalesce(string_agg(policyname, ', '), 'none') from pg_policies where schemaname='public' and tablename='contact_messages'
union all select 'grants', string_agg(distinct coalesce(a.grantee::regrole::text,'PUBLIC') || '=' || a.privilege_type, ', ') from pg_class c cross join lateral aclexplode(c.relacl) a where c.relname='contact_messages' and c.relnamespace='public'::regnamespace
union all select 'checks', string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ') from pg_constraint where conrelid='public.contact_messages'::regclass
union all select 'indexes', string_agg(indexname || ': ' || indexdef, ' | ') from pg_indexes where schemaname='public' and tablename='contact_messages';
-- columns  id:uuid:NO:gen_random_uuid(), created_at:timestamptz:NO:now(), topic:text:NO, name:text:NO, email:text:NO, business_name:text:YES,
--          message:text:NO, country:text:YES, locale:text:YES, page_path:text:NO:'/contact', ip_hash:text:YES, email_status:text:YES,
--          provider_message_id:text:YES, email_attempts:smallint:NO:0
-- rows     0
-- rls      true
-- policies none
-- grants   postgres and service_role only (no anon, no authenticated)
-- checks   the 12 checks and the primary key above, exactly
-- indexes  contact_messages_pkey · contact_messages_created_at_idx · contact_messages_unsent_idx (where email_status is distinct from 'sent')
```

## 4 · The Privacy Policy (35.an-21)

**The surprise:** the Policy never mentioned a contact form or Tally, in any version. So there was nothing to reword and no Village Foodie Tally wording to keep. The smallest true edit is **one short paragraph**:
- placed at the end of section 5 ("If you visit our websites"), after the demo paragraph;
- Brevo is already a listed processor (section 6);
- "Support correspondence: 24 months" is already in section 7.

**English before** (the date, and the end of section 5):

> **Last updated:** 31 October 2026
> …
> Demos we prepare for a food truck we have contacted are kept for up to 30 days and do not ask for an email.
>
> \---
>
> \## 6. Who we share data with

**English after:**

> **Last updated:** 2 November 2026
> …
> Demos we prepare for a food truck we have contacted are kept for up to 30 days and do not ask for an email.
>
> **If you use our contact form**
>
> If you send us a message through the contact form on the HatchGrab website, we handle it ourselves: we keep your message and the details you enter, and send them to our team by email through Brevo. We use them only to reply to you, and keep them for up to 24 months. To stop the form being misused, we also keep a scrambled version of your IP address with your message.
>
> \---
>
> \## 6. Who we share data with

**The IP sentence is my addition.** The table keeps the salted IP hash for as long as the message (24 months), longer than section 7's 90 days for security logs. Saying only "used only to reply" would leave that out. Delete the sentence if you'd rather store no IP hash, and I'll drop the column's use.

**The rest of the legal change:**
- **Translations:** the same paragraph in all 28, in each document's own register, each re-stamped against the new English. The drift harness is clean, and the paragraph names Brevo and the number 24 in every language.
- **Dates:** `PRIVACY_UPDATED` is `'2 November 2026'`. `TERMS_VERSION` is `'2026-11-02'`, because lib/legal.ts moves it with the latest of the three documents. It is only written at signup, so no one is asked to re-accept.
- **The language audit's "known gap":** there was no contact-form exclusion in the audit's code (`EXCLUDE` in `scripts/legal-languages-1-audit.cjs` never named it). The gap existed only as text, in `docs/reference-manual.md` §77.12 and the legal-languages-1 report. I don't edit the manual, so that line is yours to delete.

## 5 · Proof

**`scripts/contact-1.cjs`** (in `harnesses.json`): **191/191**.
1. **The rules:**
   - every limit, at its edge;
   - characters counted, not UTF-16 units;
   - the conditional truck name;
   - the `?topic=` mapping.
2. **The server**, with a fake database, limits and sender:
   - **bots:** the trap field, under 3 s, exactly 3 s (a person), forged, missing and future timestamps. Each answers "sent" with nothing stored, sent or spent;
   - **validation;**
   - **both limits:** 5/hour per address (the 6th refused; an hour later it may send again) and 20/day per email (the 21st refused, in any case), plus the Upstash settings in the source;
   - **save first** (a failed save is a 500, with nothing sent);
   - **the row**, its IP hash (never the address) and its send result;
   - **the email:** inbox, Reply-To, the exact subject, every body line, UK time in GMT and in BST, escaped HTML, a one-line subject;
   - **Brevo fails** → `'failed'`, still thanked, and logged;
   - **no salt** → saved, with the gap logged;
   - **Brevo's request** (fetch mocked, dummy key);
   - **the hourly retry and its attempt limit.**
3. **The real route end to end:** Village Foodie's host gets a 404; the insert, then the update; Brevo down; Upstash down (fails open); over a limit; an unreadable body.
4. **The page in en-GB, de-DE, ja-JP and ar-AE:**
   - the form in each language's words;
   - topics in order;
   - labels tied to fields;
   - the privacy link to the own-language policy;
   - heading, intro and "Email us" kept;
   - no English sentence of the page on the three non-English pages;
   - `?topic=account` makes the truck name required.
5. **No tally.so on HatchGrab's own pages** (rendered: `/contact` in 4 countries, `/uk`, `/de`, `/uk/features`, `/jp/features`; and every source file):
   - Tally remains only in Village Foodie's pages: its `/contact` branch and `ContactForm.tsx`, `app/page.tsx`, `app/hire/page.tsx`, the venue page, and the truck page.
   - On hatchgrab.com, `/hire` and `/venues/<slug>` move to Village Foodie (308), and `/` is the landing page.
   - **Known exception (your decision A):** `/trucks/<slug>` on hatchgrab.com is kept exactly as it is. It loads Tally's script at **`app/trucks/[slug]/TruckClient.tsx:158`**, with its "add your business" popup falling back to `tally.so/r/81xAKx` at **`:118`**. It is unchanged since HEAD (proved).
6. **Village Foodie:**
   - `/contact` is byte-identical to HEAD (3d6228b7) in HTML and metadata, for all six searches its links send (bare, General Enquiry, Add Business + truck, ClaimVenue + venue, Report Issue, Cost Comparison). The baseline was captured in a worktree of 3d6228b7.
   - The venue and truck pages: every one of the source files they bundle is byte-identical to 3d6228b7, so every byte they serve is too.
7. **The words:**
   - en-GB exactly as agreed;
   - all 30 keys in the 28 bases;
   - translation-check structural 0, with no flag on `contactPage`;
   - variants only where they differ.
8. **The legal change:**
   - the English edit is exactly the date and the paragraph;
   - all 28 translations re-stamped and drift-clean, the paragraph their only change;
   - the dates;
   - the 24-month deletion (fake database: the 25-month row deleted, the 23-month one kept);
   - the migration's columns and security.
9. **The language audit:** checked as described below.

**`scripts/contact-1-screens.cjs`:** **19/19** (in the build-dependent screens group). It checks:
- nothing scrolls sideways;
- the laptop pair and the phone stack;
- the orange button;
- the error under its field, with `aria-invalid`, its description and focus;
- "(optional)" leaving for account help;
- one POST carrying the empty trap field, the signed time, the country and the language;
- the thank-you box replacing the form and taking focus.

**The language audit** (`scripts/legal-languages-1-audit.cjs --jobs 4`, all 28):
- **28 of 28 clean.**
- `/contact` is captured in every language, and the capture is the new form in that language (checked in the German, Japanese and Arabic runs).
- There are no findings on any contact view.
- The one contact entry listed as "the capture's own English" (`1e/parts/contact|US|meta` in ja-JP and ar-AE, "The food truck management platform") is the harness's root-metadata fixture, identical at HEAD.
- `docs/legal-languages-1/audit-summary.json` is regenerated.

**legal-languages-1 (the drift harness):** **220/220.** It had been stopping at HEAD (see the next section).

## Re-pinned harnesses (each by name, with a ⚠️ RE-PINNED note)

- **`scripts/_lp-contact-1.cjs`** (new, listed with the named modules):
  - `privacyAsBefore` and `asBefore`: the paragraph, the date, `PRIVACY_UPDATED`, `TERMS_VERSION` and that doc comment, each taken back exactly. It throws if any is not there.
  - `ITEMS`: the sitemap's `/privacy` lastmod 2026-10-31 → 2026-11-02 (precise), and HatchGrab's `/contact` (structural, `contactProof`: the Tally script and the region from the form heading to the section's end are cut from BEFORE, the new form must fill that region, and every other byte is equal).
  - `REMOVED_KEYS`: the two deleted keys.
  - `scripts/_lp-world-countries-2.cjs` `asBefore` now takes contact-1 back first (newest first), so every harness pinning the legal files' older bytes stays exact.
- **legal-languages-1:**
  - §2 compared with "HEAD", meaning the tree the harness was written on. It now uses that tree by name, **3240c536** (2b625a66's parent). 2b625a66 committed this harness together with world-countries-2's legal change, so HEAD carried those edits twice and §2 threw "Terms edit — expected once, found 0". That is the failure this harness has shown at HEAD since.
  - Plus contact-1's Privacy paragraph and dates.
  - Two checks were reached for the first time since that throw, and failed for older reasons. Both are re-pinned:
    - signup's layout now wraps its children in `<TrialMonthsProvider>` (copy-truth-1);
    - `lib/llms-text.ts` is a deliberate fixed-English translator (seo-geo-2's `/llms.txt`).
- **world-countries-3** §2: contact-1 taken back first, and compared with 3d6228b7 rather than HEAD, so it stays right after this commit.
- **us-legal-draft:** `/privacy` shows the new date (its `read` already takes contact-1 back through the chain).
- **legal-follow-ups:** passes through the chain, with no edit of its own.
- **language-phase-1e-tidy** and **`_lp1e-named.cjs`** (language-phase-1e): the sitemap item and the structural `/contact` proof.
- **`_lp1e-words.cjs`**, **`_lp1e-checks.cjs`** and **`_messages-parity-1e.cjs`:** `contactPage.loadingForm` (in Phase 1e's as-moved list of English fixes) may stay in that historical list only while it is absent from en-GB. This is the rule Stage B's removed keys already follow.
- **`_lp2-named.cjs`** (language-phase-1c and language-phase-2): `contact-1-terms-version`, applied after world-countries-2's. A new account records `terms_version` "2026-11-02". Precise: only that field.
- **plans-data-model:**
  - the sitemap's `/privacy` lastmod is 2026-11-02;
  - its two `/contact` views pass the same structural `contactProof`, reported as its own check.
- **faq-1:** 20261061 (contact-1) may follow its migration.

## Sweep

`node scripts/run-harnesses.cjs`, all **183** listed harnesses, after every re-pin: **178 pass, 5 fail. All 5 also fail at HEAD (3d6228b7), on the same check:**

| Harness | The failing check (the same at HEAD) |
|---|---|
| schedule-graphics-places | "…and the Feature gates the tab, the pane, the shortcut and both routes — and nothing else" (1) |
| canada-1 | 1 check (§7–9, as at HEAD) |
| europe-languages-1 | de-CH: no "ß" anywhere (1) |
| world-countries-1 | 1 check (as at HEAD) |
| world-countries-2 | stops at "Terms edit — expected once, found 0: Last updated: 20 October 2026" (its own baseline, as legal-languages-1's was; not re-pinned, since the brief didn't ask for it) |

- **No failure is new.**
- **legal-languages-1, which failed at HEAD, now passes** (220/220).
- **One flake:** in the previous sweep, `add-order-refresh-inputs` (an Add Order capacity test that runs about 5 minutes and touches nothing contact-1 changed) failed once under load. It passed alone, with every "must fail" variant failing as required, and it passed in this final sweep.
- **Lint and types:** `tsc --noEmit` is clean. eslint is clean on every changed file apart from the existing `<a href="/login">` noted below.

## Judgement calls and things to know

- **The mockup's words versus the brief's.**
  - The mockup shows "Support" as the heading, with a slightly different intro.
  - The brief says to keep the page's existing heading and intro, so I kept them (eyebrow "Support", heading "How can we help?") and matched only the layout.
  - The mockup's grey line under the truck name ("Required when you pick 'Help with my account', so we can find your truck.") is English on the German phone, so I read it as an annotation and didn't build it. The required state shows instead: "(optional)" goes, and the error says why ("…so we can find your account").
- **The screenshot addresses.** The brief names `/uk/contact` and `/de/contact`, but HatchGrab's contact page is `/contact` in the visitor's country's language; no `/<country>/contact` route exists. Keeping "the existing language handling", the shots are `/contact?country=GB` and `/contact?country=DE`.
- **`email_attempts`** is a column beyond the brief's list. The "up to 3 retries" rule needs it.
- **Rate limits fail open on an Upstash error**, as every other limiter here does: a person's message matters more than a blocked script.
- **A tidy-up while there:** an old comment in `HatchGrabContact.tsx` said the form's destination "is NOT knowable" (Tally's dashboard). It now says the form emails the support inbox. The page's copy was not changed.
- **Lint:** eslint flags `<a href="/login">` in `HatchGrabContact.tsx`'s nav. It is untouched and predates this work.

## Files

- **New:**
  - `lib/contact.ts`, `lib/contact-server.ts`
  - `app/api/contact/route.ts`
  - `app/contact/HatchGrabContactForm.tsx`, `app/contact/contact-form.css`
  - `supabase/migrations/20261061_contact_1.sql` (committed first, 9612a345)
  - `scripts/contact-1.cjs`, `scripts/contact-1-screens.cjs`, `scripts/_lp-contact-1.cjs`
  - `scripts/fixtures/contact-1-identity.json`
  - `docs/contact-1/*.png` (6)
  - this report
- **Changed:**
  - `app/contact/HatchGrabContact.tsx`, `app/contact/page.tsx` (passes the mapped topic)
  - `lib/ratelimit.ts`, `lib/order-retention.ts`, `app/api/cron/order-retention/route.ts`, `app/api/cron/demo-cleanup/route.ts`
  - `lib/legal.ts`
  - `content/legal/privacy-policy.md` and its 28 translations
  - `messages/*.json` (en-GB, 28 bases, en-US, es-MX), the generated catalogue, `docs/i18n/back/*` (28)
  - `docs/legal-languages-1/audit-summary.json`
  - `.env.local` (`CONTACT_IP_SALT` appended; git-ignored)
  - `scripts/harnesses.json` and the re-pins above

## Undo (only if Dominic asks)

```sql
-- as a committed migration, never ad hoc
begin;
drop table if exists public.contact_messages;
commit;
```

In code: revert the contact-1 commits. The Privacy Policy's paragraph and its 28 translations would then go back too, and must be re-stamped with the drift harness run (35.an-21).
