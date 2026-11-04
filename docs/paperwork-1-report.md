# paperwork-1: Manage › Documents (built as "Paperwork", renamed mid-build)

*4 November 2026.*

- **Committed on `main`:** the migration in `b5dde5f8`, the build in `6249530d` (this report in the commit after it). Not pushed, not deployed.
- **Migration 20261066:** run with `scripts/db-migrate.cjs` (one transaction, no error) and verified read-only.
- **Tested** with fixtures, and live on `test-truck` (Pizza Kitchen) only; that live run left nothing behind.
- **No landing-page change.**

**Your mid-build change (4 Nov):** "rename paperwork to Documents and before settings".
- **Every word a truck or organiser sees now says Documents:** the tab, the page title, the feature's name, and the reminder email's heading and button. The words were renamed before translation, so all 28 languages say "Documents" in their own words.
- **The tab sits just before Settings** (after Team), not after Schedule as in the mockup.
- **The internal names stay `paperwork`:** the feature key, the message namespace, `/api/manage/paperwork`, `?tab=paperwork` and the code. Renaming those too would have been churn with nothing visible to show for it. Say if you want them renamed.

| # | Item | Outcome |
|---|---|---|
| 1 | Data | **Done.** Four tables and the private bucket `truck-documents`. RLS is on with no policy and no grant to anon or authenticated. Seeded: GB's own 11 types and the general list of 10. The feature key `paperwork` has no plan row, so it is **on for every plan**. |
| 2 | Manage › Documents | **Done.** The list, counts and selection bar; View; upload (camera, photo or file); the AI read; "Check the details"; renewal as history; Edit; Delete. In all 28 languages plus US English. |
| 3 | Reminders | **Done, email only.** Sent at 28 days, 7 days, on the day, then weekly, in the truck's language, from the existing daily cron. Each stage is sent once. **No push:** the operator push can only send "an order needs confirming". |
| 4 | Send to an organiser | **Done.** The form, the email ("<Truck> via HatchGrab", Reply-To the truck), the rate limit, `/docs/<token>` (always the current version, noindex, no-store, the view count), Download all, the Sent list and Turn off link. |
| 5 | Privacy and deletion | **Done.** Delete removes the files and takes the document off live links. Account deletion and the hard delete remove everything. The Privacy Policy paragraph is in English and 28 translations, re-stamped, with the drift check clean. `PRIVACY_UPDATED` is 4 November 2026. |
| 6 | Proof | `scripts/paperwork-1.cjs` (registered): **114 passed, 0 failed**. `scripts/paperwork-1-screens.cjs` (WebKit, run by hand): **21 passed, 0 failed**; the screenshots are in `docs/paperwork-1/`. Live smoke test on `test-truck`: every step worked (§8). Full sweep: **188 of 189 pass**; the one failure (`faq-1`) fails the same way at HEAD (§8). |

**Vercel variables to add: none.**
- Everything this uses already exists: `GEMINI_API_KEY`, `BREVO_API_KEY`, `UPSTASH_REDIS_REST_URL` / `_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_HATCHGRAB_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- I can't see Vercel, so "they are set there" is inferred from the features that already use them.

**Pizzeria Gusto** will see the new Documents tab after the deploy. Nothing else changes for them: no data of theirs was touched, and no plan row was added.

## 1 · Flags (read these first)

1. **Push reminders: not sent, email only, as the brief allowed.**
   - `lib/apns.ts` and `lib/fcm.ts` send one fixed payload: "order needs confirming" (its own words, the `order_pending` deep link, the `hg_orders` channel).
   - There is no general operator push to carry a reminder.
   - Adding one means a new payload type in both senders and in the app's tap handler. That is an app change.
2. **"The existing daily cron" is `/api/cron/order-retention` (04:30 UTC),** the general daily run.
   - Reminders run as its own step after the retention work. A failure there is logged and reported, and never hides the retention result.
   - Emails therefore leave at about 04:30 UK time and are waiting in the inbox in the morning.
   - The same step removes uploads abandoned for more than a day.
3. **Two additions to the brief's data shape, both small:**
   - `truck_documents.status` also has **`pending`**. The upload has to be filed before the truck presses Save (the brief: "keep the file even if the AI read fails"). A pending row is never listed, never shared and never reminded, and is swept with its file after 24 hours.
   - `paperwork_document_types.date_label` (`expires` / `review_by`) says how the date reads, so the HACCP plan's "review by" date is data, not code.
4. **Delete removes the document and its earlier versions** (the confirmation says so).
   - The files go from storage. The rows stay as `deleted` with every detail cleared (issuer, name, cover, filename, what the AI read, storage path).
   - It also comes off every live link: the link's item for that type, or the custom document itself.
   - Expired or turned-off links keep their items, as history.
5. ⚠️ **Storage keeps serving a just-deleted file for a short while** (OBSERVED live on test-truck, 4 Nov):
   - after `remove`, the object is gone (`storage.objects` empty, the folder listing empty);
   - but the service-role `download` of the same path still returned the old bytes 30 seconds later (Supabase's cache).
   - **The product never issues a new link to a deleted document** (its stored path is cleared, so there is nothing to sign).
   - A link issued *before* the delete may still work until it expires, at most 5 minutes.
6. **"Download all" is a ZIP streamed from the function.** A buffered response is capped at 4.5 MB on Vercel; streaming is how a function sends more. That it holds with several 20 MB files is **UNVERIFIED** until it is tried after the deploy.
7. **One new dependency: `heic-convert` 2.1.0** (ISC, exact version). It decodes with `libheif-js`, which is **LGPL-3.0**, on the server only; nothing of it reaches a browser. It is the only HEIC → JPEG path; Node and the existing packages have none. A real iPhone HEIC file (made with `sips`) converts in the harness.
8. **The upload never passes through our function:** a 20 MB file is past Vercel's 4.5 MB request limit.
   - The browser PUTs it to a signed storage URL (the existing `get_upload_url` pattern).
   - The server then reads the stored bytes, checks the type from them, converts HEIC and runs the AI.
   - A file whose bytes are not an accepted type is deleted at once with its pending row.
9. **Access: owners and managers. Staff are refused**, at the route and by having no tab.
   - The route uses **the same deny-by-default check as `/api/manage`**. I moved `resolveTruckAccess` unchanged into `lib/truck-access.ts`; `/api/manage` keeps a one-line wrapper with the same call, so every harness that stubs it still does.
   - `app/api/event-types` checks only the token, which is weaker; I did not copy that.
10. **"The name on it doesn't look like your business name"** compares the name with the truck's name and the owner's name. There is no legal-name column, and insurance is often in the owner's own name. Company suffixes (Ltd, GmbH…) and accents are ignored.
11. **If a truck has no contact email,** the organiser email still goes, without a Reply-To (replies would come to the sender address), and no reminder is sent.
12. **No account-deletion test existed** (none of the harnesses ran `executeAccountDeletion`), so "extend that path and its test" became: extend the path, and write the test (in `paperwork-1.cjs` §11). The hard delete (`deleteTruckCascade`, test and demo trucks) removes the files too.
13. **The Privacy Policy's processor table and its transfers sentence** still describe Gemini as reading "menus you upload" and WhatsApp messages. The new paragraph says documents go to the same service. The brief asked for one paragraph, so I left the table alone. Updating its row ("…menus and compliance documents you upload…") is a one-line legal change; say if you want it.
14. **Native apps:** the screens are the same web pages in the iPad and Android apps.
    - Open and Download are plain links to short-lived signed URLs. In the apps these open in the system browser or viewer.
    - In the browser, images show inline, and PDFs show inline where the browser can display them (`<object>`), with "This file can't be shown here" otherwise. The Android webview does not render PDFs inline.
    - The camera button uses `capture="environment"`.
    - **Not tried on a device:** UNVERIFIED.
15. **Translations:** 7 agents wrote the 28 bases in parallel, each running translation-check, the back-translations and the legal drift check per language. All are clean. Choices you may want to look at:
    - **The feature name** in the "{feature} is included on {plan}" sentence is "document management" in fr, de, es, it, ja, zh and th (many: no in the European four), because a bare "the documents" read oddly in that sentence. The tab itself is "Documents" everywhere.
    - **fr writes "20 Mo"**, as the French file already does elsewhere.
    - **ar writes "one week" in words** ("أسبوع واحد"), as the file writes "one hour". The checker flags the missing digit 1.
    - **Local equivalents of the UK types:** for example DK smiley report, NO smilefjes, FI Oiva for the hygiene rating; HK 小販牌照 for the street trading licence; PAT test spelled out as "portable electrical appliance test".
    - **US English** got its own sparse words: organizer, license, anymore.
16. **AI cost:** one Gemini call per upload. On the live test a one-page PDF took 3.4 s. No limit was added for reads (each needs a signed-in owner or manager); sends are limited to 10 an hour per truck.

## 2 · The data (migration 20261066, run)

`supabase/migrations/20261066_paperwork_1.sql`, committed in `b5dde5f8` and run with:

```
npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261066_paperwork_1.sql
db-migrate: supabase/migrations/20261066_paperwork_1.sql · sha256 66c677904d12e67c · committed at b5dde5f8
db-migrate: supabase/migrations/20261066_paperwork_1.sql applied — one transaction, no error
```

**What it makes:**
- **`paperwork_document_types`:**
  - columns: key, country_code (NULL = the general list), position, has_expiry, date_label, active;
  - unique on (key, country);
  - seeded **GB:** food_registration, hygiene_rating (no expiry), food_safety_plan (review by), public_liability, employers_liability, gas_safety, pat_test, fire_safety, risk_assessment, allergen_info, street_trading_licence;
  - seeded **general:** food_registration, hygiene_rating, food_safety_plan, public_liability, gas_safety, electrical_safety, fire_safety, risk_assessment, allergen_info, trading_licence;
  - the names are `paperwork.types.<key>` in every language.
- **`truck_documents`:**
  - columns: id, truck_id (FK, cascade), type_key or custom_name, issuer, issued_on, expires_on, name_on_document, cover_amount_minor + currency, storage_path, mime (only the four stored types), size_bytes (≤ 20 MB), original_filename, ai_extracted, status (pending / current / superseded / deleted), superseded_by, the reminder bookkeeping (reminder_stage, reminder_expires_on, reminder_sent_at), created_at, updated_at;
  - **at most one current document per truck and type** (a unique index): a renewal supersedes first, and a second current one is impossible even in a race.
- **`document_shares`:**
  - token (unique; 22–64 base64url characters, a CHECK);
  - organiser_emails (1–5), message (≤ 1000), event_id (FK, set null);
  - expires_at (at most 91 days after it is made: 90 days to the end of the chosen day), revoked_at, created_at, first_opened_at, view_count.
- **`document_share_items`:** share_id (cascade) and EITHER type_key (so a renewal shows by itself) OR document_id (a custom document, cascade), and position.
- **`paperwork_share_viewed(token)`:** counts one view of a live link atomically. Executable by `service_role` only.
- **The bucket `truck-documents`:** private, 20,971,520 bytes, pdf / jpeg / png / heic / heif / webp, and no storage policy.

**Verify (read-only, MCP):**

```sql
select
  (select string_agg(relname || '=' || relrowsecurity, ', ' order by relname) from pg_class where relname in ('paperwork_document_types','truck_documents','document_shares','document_share_items') and relkind='r') as rls,
  (select count(*) from pg_policies where tablename in ('paperwork_document_types','truck_documents','document_shares','document_share_items')) as policies,
  (select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in ('paperwork_document_types','truck_documents','document_shares','document_share_items') and grantee in ('anon','authenticated')) as anon_auth_grants,
  (select string_agg(c || ':' || n, ', ') from (select coalesce(country_code,'*') c, count(*) n from paperwork_document_types group by 1 order by 1) x) as types,
  (select string_agg(key, ',' order by position) from paperwork_document_types where country_code='GB') as gb_order,
  (select string_agg(key || case when not has_expiry then '(no expiry)' when date_label='review_by' then '(review by)' else '' end, ',' order by position) from paperwork_document_types where country_code is null) as general_order,
  (select public::text || ' · ' || file_size_limit || ' · ' || array_to_string(allowed_mime_types, ',') from storage.buckets where id='truck-documents') as bucket,
  (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and (qual ilike '%truck-documents%' or with_check ilike '%truck-documents%')) as bucket_policies;

select r.rolname, has_function_privilege(r.rolname, 'public.paperwork_share_viewed(text)', 'execute') as can_execute
from pg_roles r where r.rolname in ('anon','authenticated','service_role');
```

| Check | Result |
|---|---|
| rls | document_share_items=true, document_shares=true, paperwork_document_types=true, truck_documents=true |
| policies | 0 |
| anon_auth_grants | 0 |
| types | *:10, GB:11 |
| gb_order | food_registration, hygiene_rating, food_safety_plan, public_liability, employers_liability, gas_safety, pat_test, fire_safety, risk_assessment, allergen_info, street_trading_licence |
| general_order | food_registration, hygiene_rating (no expiry), food_safety_plan (review by), public_liability, gas_safety, electrical_safety, fire_safety, risk_assessment, allergen_info, trading_licence |
| bucket | false · 20971520 · application/pdf, image/jpeg, image/png, image/heic, image/heif, image/webp |
| bucket_policies | 0 |
| can_execute | anon false · authenticated false · service_role true |

**After the live smoke test (§8), read-only:**
- `select name from storage.objects where bucket_id = 'truck-documents'` → `[]`;
- `test-truck` has 0 documents and 0 links.

## 3 · Manage › Documents (`components/manage/PaperworkTab.tsx`)

The approved layout, phone first. iPad and laptop use Manage's wider column (`max-w-2xl`, sheets centred).

**The list:**
- the country's types in order, then any custom documents;
- each with Up to date / Due soon (within 30 days, today included) / Expired / Upload;
- the line under each name: issuer · cover · "Expires 12 Mar 2027" / "Expires 21 Nov 2026 · in 17 days" / "Expired 2 Oct 2026" / "Review by 1 Jun 2027" / "No expiry" / "Not uploaded yet";
- the counts at the top;
- a labelled checkbox per saved document, and the sticky "N selected · Send to organiser" bar;
- the Sent list below.

**View** (tap a document):
- the file: images inline, PDFs in the browser's viewer;
- Open and Download (signed links of 5 minutes, refreshed every 4 while open);
- the details, Edit details, Upload a new version, Earlier versions (each one openable);
- Delete, with an inline confirmation.

**Upload** ("+ Add a document", or Upload on a missing type):
- Take a photo (`capture="environment"`) or Choose a photo or file: PDF, JPEG, PNG, HEIC, WebP, up to 20 MB;
- size and type are checked in the browser first, then the bytes on the server;
- progress is shown; then "Reading your document…".

**Check the details:**
- every field pre-filled and editable: the type (the list plus "Other…" with a name), issued by, date pickers, name on the document, and insurance cover with currency (shown for the liability types, "Other…", or when the AI found a cover);
- the "We read this from your document" banner;
- **warnings that update as you edit:** couldn't read it, already expired, expires within 30 days, the name doesn't look like yours;
- **Save is the truck's: nothing is saved from the AI alone.**

**Renewing:** a new document of the same type supersedes the current one (kept as history). A custom document is renewed with "Upload a new version".

**Accessibility:**
- every field has a label; dialogs are `role="dialog"` / `aria-modal`, focus goes to the first field, and Escape closes;
- errors are `role="alert"`; the upload bar is a `progressbar`; the selected count is `aria-live`.

**Formats:** dates through the truck's own formatters (`useTruckTime`), amounts through `formatWholeAmount`.

**The tab:**
- "Documents", 📄, just before Settings, for owners and managers;
- shown only while `featureAccessView(…).can('paperwork')`;
- `?tab=paperwork` opens it, and `/manage?tab=paperwork` (the reminder email's tokenless link) now carries the tab through.

**The route** (`app/api/manage/paperwork/route.ts`): `load · upload_url · read · cancel_upload · save · update · delete · file_url · share · revoke`.
- Each action runs the token check, the session check (cookie, or the app's Bearer), the staff refusal and the feature gate.
- A document id only ever reaches a row of the caller's truck.
- No storage path or AI output is sent to the screen.

## 4 · The AI read (`lib/paperwork/ai-read.ts`)

- **The same provider and model as the demo menu reader** (`lib/menu-extract.ts`): Gemini `gemini-2.5-flash`, the file inline, temperature 0, JSON out, `GEMINI_API_KEY`, and the same retry rule (429/503 only; a hang is not retried).
- **It asks for:** the type (from that country's list, or "other" with a suggested name), issuer, issue date, expiry or review date, name on the document, cover amount and currency, each with a confidence.
- **Every value is checked before the screen sees it:**
  - an unknown type becomes "Other…";
  - an impossible date (30 February) is dropped;
  - an amount becomes minor units;
  - the currency falls back to the truck's.
- **What it read is stored in `ai_extracted`** (model, time, details, confidences, raw answer, or the failure reason) for support. It is never sent to the screen.
- **A failed read** (no key, a refusal, not JSON) shows an empty form with "We couldn't read this document…". The file is kept.

## 5 · Reminders (`lib/paperwork/reminders.ts`)

**Stages,** counted in the truck's own calendar:

| Days left | Stage |
|---|---|
| 28 … 8 | d28 |
| 7 … 1 | d7 |
| 0 … −6 | d0 |
| −7 … −13 | w1 |
| −14 … −20 | w2 |
| and so on | weekly |

**The rules:**
- **A stage is sent only when it is later than the last one recorded for that expiry date.** A document saved with 5 days left gets the 7-day reminder, not the 28-day one; a missed day is caught up once.
- A new date (a renewal, or an edit) starts again. An edit that keeps the date keeps its stage.
- The stage is recorded only **after** the email went; a failed send is tried the next day.

**The email:**
- **One per truck per day,** listing every document that reached a new stage;
- to the truck's contact email, in its language;
- linking to `https://www.hatchgrab.com/manage?tab=paperwork`, **without a token** (as the other operator emails, E2).

**Skipped:** demo trucks, inactive trucks, trucks with no contact email, and trucks whose plan or override switches Documents off.

## 6 · Sending to organisers

**The form:**
- organiser email (one, or up to 5 separated by commas, each checked);
- the event (the truck's upcoming events, optional);
- the selected documents (each can be left out);
- a message (optional);
- "Link works until": the day after the event, otherwise 14 days; at most 90 days, at least tomorrow. The truck's own choice wins.

**The email:**
- **From "Pizza Kitchen via HatchGrab"** at the verified HatchGrab sender, Reply-To the truck's contact email, in the truck's language;
- the message, each document with its date, the event, the link, and how long it works.
- **One email per organiser,** so organisers don't see each other's addresses.
- **Rate limit:** 10 sends an hour per truck (Upstash, rolling). **It fails closed:** if Upstash is down, nothing is sent.
- If no email could be sent, the link is not kept.

**The token:** 24 bytes from the CSPRNG (192 bits) in base64url, 32 characters, which the table's CHECK also enforces.

**`/docs/<token>`:**
- the truck's name and logo, each document's name and date with View and Download, Download all (a ZIP made on the fly, stored not deflated) and the date the link works until;
- **always the CURRENT version of each type;**
- in the truck's language, with `dir="rtl"` only for Arabic.

**Its protections:**
- `noindex` from the page metadata and from `vercel.json`, which also sets `Cache-Control: private, no-store`;
- metered like `/p/` (`proxy.ts` isGeneralPublic);
- not in the sitemap, `/llms.txt` or hreflang.

**What a dead link shows:** an expired or turned-off link reads "This link has expired, ask Pizza Kitchen to send it again." A junk token gets the same message without a truck name, and is refused before any database read.

**What is recorded:** only `first_opened_at` and `view_count` (one per page open). A file or the ZIP counts nothing; nothing else about the organiser is kept.

**Files:** View and Download redirect to a 5-minute signed link, only for a document the link shows today. A superseded version, or a document not on the link, is a 404.

**The Sent list:** who it went to, when, opened or not (with the date and number of views), works until / expired / turned off, and "Turn off link" with a confirmation.

## 7 · Privacy and deletion

- **Delete:** see flag 4.
- **Account deletion** (`lib/account-deletion.ts`, new step 3b, before the truck's contact details are cleared):
  - every file of every truck of the account goes (including any leftover under the truck's folder), plus every document row and every link and its items;
  - a failure stops the deletion, named `delete_paperwork`;
  - the result reports `paperwork: { files, documents, shares }`.
- **Hard delete** (`lib/delete-truck.ts`, test and demo trucks): the files go first; the rows would cascade, the files would not.

**The Privacy Policy (English), section 3, after "Biometric unlock":**

> **Compliance documents.** If you keep your certificates, insurance and other compliance documents in HatchGrab, we store the files and the details you save with them. When you upload one, we send it to Google's Gemini service, the same one that reads menus, to fill in details such as who issued it and when it expires; you check them before anything is saved. Your documents are shared only with the people you choose to send them to, through links that expire, and we keep them until you delete them or close your account.

**Dates and the translations:**
- `**Last updated:** 4 November 2026`; `PRIVACY_UPDATED = '4 November 2026'`;
- `TERMS_VERSION = '2026-11-04'` (it moves with the latest document; it is written only at signup, so no one is asked to accept again);
- all 28 translations carry the paragraph in their own register, re-stamped; the drift check is clean (`legal-languages-1.cjs` 220/220).

## 8 · Proof

**`scripts/paperwork-1.cjs`** (registered): **114 passed, 0 failed**.
- **How it runs:** the real route, store, organiser page, file and ZIP routes, reminders, account deletion and hard delete, over an in-memory database and bucket (`scripts/_paperwork-1-fixtures.cjs`), with the model and Brevo answered from fixtures.
- **1:** migration RLS, grants and the bucket.
- **2:** the type lists (GB, and FR/US get the general list).
- **3:** upload validation by bytes (a program named `certificate.pdf` refused and deleted), 20 MB exactly allowed and 20 MB + 1 refused, a real HEIC converted to JPEG and the JPEG sent to the AI, a PNG named `.pdf` stored as PNG.
- **4:** the AI fixture → the pre-filled draft with confidences; **the row still pending, not listed**; the failed read (empty form, file kept, reason recorded); non-JSON; the answer checks; refused details.
- **5:** renewal (old superseded and pointing at the new; never two current), a custom renewal, Edit.
- **6:** status thresholds (31/30/0/−1, no date, missing) and the warnings.
- **7:** reminder stages; one email listing the five due documents; the stages recorded; the skips; the 30-hour abandoned upload swept and the 2-hour one kept; **run again the same day: nothing**; a week later only the new stages; a failed send records nothing; a plan switch-off; email only; the cron.
- **8:** the token (32 base64url characters, 1,000 unique, CSPRNG); every refusal; the limit and fail-closed; the email (sender, Reply-To, words, link); a failed send keeps no link.
- **9:** the page (current version only, view counted, first opening kept); noindex, no-store, metering, not in the sitemap or llms; the expired, turned-off and junk messages.
- **10:** one file (a 302 to a 300-second signed link, no-store); the download name; 404 for a superseded or unlisted document; Download all is a valid ZIP (entries, CRC-32, bytes).
- **11:** Delete (files, rows cleared, off the live link); another truck's document unreachable; **account deletion** (everything gone, the other truck's file kept); the hard delete.
- **12:** the plan gate **ON by default**, a plan row off → plan, an override off → override; the refusals (feature off, staff, no session); the same access function as `/api/manage`; the tab (Documents, before Settings); **all 161 new strings in en-GB and the 28 bases; translation-check structural 0 in all 28; every back-translation**; the privacy paragraph, dates and drift in all 28; no landing-page file touched.

**`scripts/paperwork-1-screens.cjs`** (by hand; listed with the other screen harnesses): **21 passed, 0 failed**.
- **How it runs:** WebKit, with Tailwind compiled from `app/globals.css` (no build needed). The real component is mounted; the API and storage are answered from fixtures; the organiser page is its real server render.
- **The screenshots in `docs/paperwork-1/`:**
  - `list-390.png`, `check-390.png`, `send-390.png`, `organiser-390.png` (WebKit, 390 px);
  - `list-ipad-820.png`, `check-ipad-820.png` (iPad width).
- **What it checks:**
  - the counts, each row's status and line, and nothing scrolling sideways;
  - the "4 selected" bar, and that a missing document can't be ticked;
  - every checkbox labelled;
  - Check the details pre-filled, with the 17-day warning, in a modal;
  - typing another business name shows the warning at once;
  - Send has the four documents and "the day after the event";
  - the organiser page.

**Live smoke test on `test-truck` (Pizza Kitchen), 4 Nov.** The real store, database, bucket, view counter and Gemini; no email:

| Step | Result |
|---|---|
| pending row + path | `test-truck/<id>/gas-cert.pdf` |
| PUT to the signed upload URL | 200 |
| downloaded / sniffed | 891 bytes / application/pdf |
| the public URL of the file | **400** (the bucket is private) |
| AI read (3.4 s) | gas_safety · "Anglia Gas Services Ltd" · 2025-11-21 → 2026-11-21 · "Pizza Kitchen Ltd" |
| listed before Save | **false** |
| after Save | current · gas_safety · 2026-11-21 |
| opened twice | 2 views, first_opened_at set |
| signed link | 200 application/pdf 891 bytes |
| after Turn off | the link reads as dead |
| delete | 1 file, 1 version (then flag 5) |
| cleanup | test-truck: 0 documents, 0 links; bucket empty |

**Other checks:** `tsc` clean. `eslint` on the new files: 0 errors (two `<img>` notices: signed links and logos can't go through `next/image`).

**Re-pins**, each marked ⚠️ RE-PINNED (paperwork-1) and done by name through the new `scripts/_lp-paperwork-1.cjs`, as tidy-1 and contact-1 did:
- **`_lp-tidy-1.cjs`:** paperwork-1's legal change is taken back first (newest first), so every harness that pins the older legal bytes still matches.
- **`_lp1e-named.cjs`, `language-phase-1e-tidy.cjs`:** the sitemap's /privacy lastmod 2026-11-03 → 2026-11-04.
- **`_lp2-named.cjs`:** a new account's `terms_version` '2026-11-03' → '2026-11-04'.
- **`plans-data-model.cjs`, `legal-languages-1.cjs`, `us-legal-draft.cjs`:** the new privacy date.
- **`tidy-1.cjs`:** its own dates read with paperwork-1 taken back, and the new section-3 paragraph set aside in each translation.
- **`contact-1.cjs`:** `lib/i18n/namespaces.ts` (it gained `paperwork` in Manage's list) compared with that insertion taken back.
- **`legal-languages-1.cjs`:** the route's English type names, sent to the AI, added to the list of deliberate fixed-English translators.
- **`_messages-parity-1e.cjs`, `_lp1d2-named.cjs`, `schedule-graphics-places.cjs`, `messages/de-CH.json`:** see the full sweep below.

**Full sweep** (`node scripts/run-harnesses.cjs`, 189 harnesses including the new one): **188 passed, 1 failed.**
- **The failure, which also fails at HEAD:** **`faq-1`**, "only 20261058 … 20261064 follow it". Its pinned migration list predates brand-kit-1's **20261065**, so it fails at HEAD (`fbca87ba`) for the same reason; this work's 20261066 joins that list. Not fixed here: it is a one-line re-pin, which I can do on request.
- **Fixed on the way, with the re-pins above:**
  - my own harness (a comment had swallowed a brace in its fetch stub; it passed only on its last terminal run, before that edit);
  - `europe-languages-1`: de-CH now has its own four strings with "ss" for "ß";
  - `messages-parity`: the new namespace, its 7 refusals, the tab label and the feature name are registered as new wording in `_messages-parity-1e.cjs`, as compare-de-1 and demo-2 did;
  - `language-phase-1d2`: the tab bar's Documents button is a named change (`_lp1d2-named.cjs`, PRECISE via `_lp-paperwork-1.cjs` tabBar);
  - `schedule-graphics-places`: the `Tab` type and `?tab=` list pins now include `'paperwork'`.

## 9 · Files

**New:**
- `supabase/migrations/20261066_paperwork_1.sql`;
- `lib/paperwork/` (model, sniff, heic, ai-read, share, zip, store, organiser, email, reminders);
- `lib/truck-access.ts` (moved); `app/api/manage/paperwork/route.ts`; `app/docs/[token]/page.tsx`, `…/file/[documentId]/route.ts`, `…/all/route.ts`;
- `components/manage/PaperworkTab.tsx`;
- `scripts/paperwork-1.cjs`, `paperwork-1-screens.cjs`, `_paperwork-1-fixtures.cjs`, `_lp-paperwork-1.cjs`, `fixtures/paperwork-1/sample.heic`;
- the `paperwork` messages (en-GB, en-US, 28 bases) and the generated catalogue;
- `docs/paperwork-1/*.png`.

**Changed:**
- `app/manage/[token]/page.tsx` (the tab); `app/manage/page.tsx` (carries `?tab`); `app/api/manage/route.ts` (the access wrapper);
- `app/api/cron/order-retention/route.ts`; `lib/account-deletion.ts`; `lib/delete-truck.ts`;
- `lib/features.ts`; `lib/manage-links.ts`; `lib/ratelimit.ts`; `lib/i18n/namespaces.ts`; `lib/legal.ts`;
- `proxy.ts`; `vercel.json`;
- `content/legal/privacy-policy.md` and its 28 translations; `docs/i18n/back/*`; `messages/*`;
- `package.json` / `package-lock.json` (heic-convert);
- `scripts/harnesses.json` and the re-pinned harnesses.

The mockup `docs/paperwork-1/paperwork-mockup.png` is yours, committed with the screenshots.

## 10 · Undo (only if Dominic asks)

⛔ DO NOT RUN — for a migration file, only if Dominic asks, and only after the code is reverted:

```sql
begin;
drop function if exists public.paperwork_share_viewed(text);
drop table if exists public.document_share_items;
drop table if exists public.document_shares;
drop table if exists public.truck_documents;
drop table if exists public.paperwork_document_types;
-- the bucket must be empty first (remove its objects through the storage API), then:
delete from storage.buckets where id = 'truck-documents';
commit;
```

**In code:** revert the build commit. The Privacy Policy and its 28 translations would then go back too and must be re-stamped, with the drift harness run (35.an-21).
