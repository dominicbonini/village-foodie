# Legal follow-ups — report

19 October 2026. Brief: "LEGAL FOLLOW-UPS — outreach footer, PostHog cookieless, service-fee notice, privacy links,
allergy-note retention, terms version, titles". It builds on the uncommitted US legal draft. Nothing was committed, pushed
or deployed, no email was sent, no stored data was changed, and no `outreach_templates` or `outreach_settings` row was
touched.

**Result.**
- **Items done:** 1–6 (5 after the stop and Dominic's answers), plus CHECK 9's proof.
- **Second round (Dominic's answers):**
  - the four outreach answers;
  - the WhatsApp logs added to the retention job and to privacy section 7;
  - the email-provider line in section 7.
- **Checks:**
  - `tsc` is clean;
  - `next build` exits 0 (`/api/cron/order-retention` is in the route table);
  - the full sweep runs 140 · passes 140 · fails 0, with only the named re-pins below.
- **Live, read-only on the dev server:**
  - the twin's order page shows "Online card orders include a service fee of 3% + 30¢." under the sales-tax notice, and
    "Privacy" under Place order;
  - Pizza Kitchen (GB) shows the Privacy link and no fee notice.

## Dominic's outreach answers, applied

All four are applied.

1. **A reply to the prospect is exempt from the opt-out block, but still gets the company line.**
   - The rule is `optOutExempt` in `lib/outreach-doc.ts`. A send is exempt when it answers a message the prospect sent
     us: its parent is one of that prospect's inbound, non-test messages.
   - A follow-up on our own email is still blocked without the line, like a first contact.
   - See the question below on this definition.
2. **A test send needs no opt-out line,** and keeps the company line. A test goes only to the configured test address
   (`OUTREACH_TEST_RECIPIENT`; I did not read its value).
3. **Retry, both the manual one and the poll's automatic one, rebuilds the message before resending.**
   - It uses the current company line, in the prospect's language.
   - It applies the same opt-out rule, with both exemptions.
   - A refusal uses the send's own sentence and sends nothing.
   - The new code is `lib/outreach-retry-rebuild.ts` `prepareRetry`, and `lib/outreach-mail-message.ts` `rebuildStored`.
4. **The composer shows the company line** as a read-only grey line under the compose box.

## Question for Dominic

**What counts as "a thread the prospect started"?**
- I took it to mean **a reply to a message the prospect sent**: we are answering them. That covers a thread they began,
  and also their reply in a thread we began.
- The old warning keyed on a slightly different signal: the send was a reply AND the prospect had written at some point.
  That also let a follow-up on our own email through once they had replied.
- My rule is the stricter one, and the only one a retry can decide from the stored row. A chase is threaded too, and the
  row records no kind.
- If you meant only threads whose first message was theirs, answering their reply to our first contact would need the
  opt-out line. Say if you want that.

## Dominic's decisions applied

- **CHECK 3, 4, 5, 6, 7, 8 and 10:** accepted as written. Their CHECK markers are removed. The markers lived only in the
  previous report, not in the documents.
- **CHECK 9 — proved; no change needed:**
  - `food_minor` is the server's re-priced food total after discount: `app/api/orders/submit/route.ts:717`
    `const foodMinor = toMinor(repriced.calculation.total)`.
  - The engine (`lib/order-charges.ts` `computeOrderCharges`) computes the tip FROM it and keeps it in its own field. The
    snapshot's `food_minor` is the input unchanged, and the total is `food + tax + tip + fee + surcharge`.
  - No application (platform) fee is taken on any payment today (`lib/payments/authorize.ts`, `capture.ts`: "NO
    application_fee_amount").
  - Harness: a $24.00 card order with a 15% tip keeps `food_minor` 2400 and `tip_minor` 360 separate.

---

## 1 · Outreach footer and the opt-out block (CHECK 1; UK and US)

**The footer.**
- Every outreach email now ends, in the HTML and text parts, with: "HatchGrab Ltd · Company no. 17381557 · Registered
  office: Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom".
- **Words and facts:** the words are the message `outreach.companyFooter` (a new `outreach` namespace). The facts are one
  constant, `lib/company.ts`.
- **Where it goes:** after the body, signature and opt-out line, and above a quoted earlier email. Below the quote it would
  read as part of the old message.
- **What it is not:** it is not part of the editable document, so it cannot be edited away and is not copied into Copy or
  Log.
- **Built in:** `lib/outreach-mail-message.ts` `buildMessage`, at 10pt grey like the opt-out line.

**The block.**
- An outreach email whose own text (not the quoted earlier email) lacks the stored opt-out sentence cannot be sent. That
  is the same test the old warning used, now one function, `lib/outreach-doc.ts` `optOutBlock`.
- **The composer** (`components/admin/ComposeWindow.tsx`) disables Send and says why.
- **The send route** (`app/api/admin/outreach/mail-send/route.ts`) refuses before anything is built or recorded, with
  `no_opt_out_line` / `no_opt_out_set_up` / `opt_out_unreadable`.
- If no opt-out sentence is set up at all, every send that needs the line is blocked with its own message.
- **Two exemptions** (Dominic's answers 1 and 2), one function, `optOutExempt`:
  - a test send;
  - a reply to a message the prospect sent.
  - The composer and the route both use it: `ReplyTarget` gains `inbound`, and the route reads the reply parent's
    direction from the row it re-reads.
  - Both exemptions still carry the company line.

**Retry (Dominic's answer 3).** The manual Retry and the reply poll's automatic retry now call `prepareRetry` before
resending. It:
1. **Rebuilds the stored message with today's company line,** in the prospect truck's language. The row holds the built
   bodies, not the document, so `rebuildStored`:
   - keeps the new part and any quote byte for byte;
   - takes out an old company line, if there is one;
   - puts the current line back where `buildMessage` puts it.
   - The harness proves the result equals `buildMessage` today, both for a row built before the line existed and for one
     built with it, across a first contact, a reply with its quote, and a chase with the quote unticked.
   - Rebuilding a row built with today's line changes nothing (idempotent).
2. **Applies the same opt-out rule** to the new part's text, with both exemptions:
   - test: the row's `is_test`;
   - reply to the prospect: the row's `in_reply_to` is one of that prospect's inbound messages.
3. **On a refusal it sends nothing,** and uses the send's own sentence:
   - the manual Retry refuses with it;
   - the poll writes it to the row's `last_error`, which is not a temporary failure, so the poll stops retrying that row.
     It does this before it claims the row.
4. **Otherwise it writes the rebuilt bodies to the row** before resending, so the history shows what went.

A body that `buildMessage` did not make is not rebuilt, and the retry refuses with "That message could not be rebuilt with
the company line, so nothing was sent." (`outreach.retry.notRebuilt`, new).

**The compose box (Dominic's answer 4).** A read-only grey line under the box (`data-company-line`, `text-slate-400`)
shows the company line exactly as every email ends with it. It is the same message (`outreach.companyFooter`) and the
same facts (`COMPANY`). The words have no en-US override, so it is what every prospect gets. It is not in the document, so
it cannot be edited, copied or logged.

**Examples** (fixtures, nothing sent; `docs/legal-followups/`, gitignored):
- `outreach-uk.html` / `.txt`, and `outreach-uk-600.png`;
- `outreach-us.html` / `.txt`, and `outreach-us-600.png`.

The US text part reads:

```
Hi Maria,

I'm Dominic from HatchGrab. We help food trucks take orders online, and I think it could suit Fixture Tacos at your Austin stops.

Would a ten-minute call next week be useful?

Kind regards,

Dominic Bonini
Founder, HatchGrab
If you would rather not hear from me again, reply with "no thanks" and I will not contact you.

HatchGrab Ltd · Company no. 17381557 · Registered office: Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom
```

The UK example is the same with its own greeting and line, and the same company line.

**Named change:** every outreach email gains the company line. Re-pinned harnesses, each marked "⚠️ RE-PINNED (legal
follow-ups, 19 October 2026)":
- `outreach-mail-send.cjs` (exact HTML plus the line, with a text-part check);
- `outreach-reply-attach.cjs` (the reply-to-the-prospect exemption);
- `outreach-reply-any-notes.cjs` (variant copies include `messages/`);
- `outreach-instant-send.cjs` (fixtures carry the opt-out; refusal cases added, each with a broken variant).

New harness: `outreach-legal-footer.cjs`.

**Re-pins for Dominic's answers** (each marked "RE-PINNED (Dominic's answers, 19 October 2026)"):
- **`outreach-legal-footer.cjs`:**
  - Part B: the exemptions, and the text check agreeing with the document check.
  - New Part B2: `rebuildStored` equals `buildMessage` for old and new rows, three shapes, idempotent, and refuses a body
    it did not make.
  - Part D: the route's exemption, the manual retry's and the poll's `prepareRetry` before resending or claiming, and the
    composer's `sendBlock` and `optOutShown`.
  - Part C (real composer in WebKit):
    - Send test is enabled without the line;
    - a reply to the prospect's message can be sent without it;
    - a follow-up on our own email cannot;
    - the grey company line is under the box, read-only.
- **`outreach-instant-send.cjs` (the real route on an in-memory database):**
  - **Re-pinned:** a test without the line now goes, ending with the company line.
  - **New:** a reply to the prospect's message without the line goes, with the company line above the quote; a follow-up
    on our own email without it is refused.
  - **New:** Retry. An old row with the line is resent, rebuilt with today's line. One without the line is refused, with
    nothing sent and the row unchanged. A test row and a reply-to-the-prospect row go.
  - **Broken variants that must fail:** `noExemption`, `noRetryRebuild`. `noOptOutBlock` is re-pointed to the check's new
    indentation.
- **`outreach-reply-attach.cjs` and `outreach-mail-send.cjs`:** `optOutBlock` still finds no line in a reply's document;
  their labels now say a reply to the prospect is exempt before it is asked. reply-attach also asserts both
  `optOutExempt` answers.

## 2 · PostHog cookieless (CHECK 11; UK and US)

- **Code:** `app/providers.tsx`: `posthog.init(…, { …, persistence: 'memory' })`. No cookie and no localStorage; the
  anonymous id lives in the page's memory only.
- **What this changes, in plain words:**
  - Each full page load is a new anonymous visitor; a move within the app keeps the same one. So PostHog's visitor and
    session counts will read higher, and a returning visitor isn't recognised.
  - The app reads no feature flags and calls no `identify()`, so nothing else moves.
  - Session recording was already off (`disable_session_recording: true`).
  - It still never runs on the dashboard, Manage or KDS, on `/embed`, or on an operator's own domain.

**Privacy policy, named changes (UK text, before → after):**

| § | Before | After |
|---|---|---|
| 5 | **Cookies.** We use cookies that are strictly necessary to make the sites work — signing you in, keeping your basket, and remembering your preferences. We do not use advertising, tracking or third-party analytics cookies, and we do not track you across other websites. | **Cookies and browser storage.** We use cookies and your browser's local storage only where they are strictly necessary to make the sites work — signing you in, keeping your basket, and remembering your preferences, such as your country and postcode. We do not use advertising or tracking cookies, and we do not track you across other websites. |
| 5 (new) | — | **Product analytics.** We use PostHog to understand which pages and features are used: pages viewed and clicks, with basic browser and device details. It stores nothing in your browser — no cookies and no local storage — so it cannot recognise you from one visit to the next. It does not run on the operator dashboard, kitchen screen or management pages, or on truck pages shown on an operator's own website. |
| 6 (table row, new) | — | PostHog · Product analytics: which pages and features are used · European Union |

Why "country and postcode":
- the marketing site sets a visitor-country cookie (`proxy.ts`, `CountryMenu`);
- the Village Foodie map keeps `user_postcode` in local storage.

PostHog's host is the EU instance (`eu.i.posthog.com`, per docs/data-collection-facts-report.md).

## 3 · Online service-fee notice (CHECK 2; every country)

- **Order page** (`app/trucks/[slug]/order/page.tsx`): where the truck's online orders carry a service fee
  (`checkout.serviceFee`), one line sits beside the existing tax notice, in the same style, in both places that notice
  shows (the basket footer and the review sheet):
  > Online card orders include a service fee of {fee}.
- **The fee** is `feePhrase` — the same phrase Manage's charges card shows: "3% + 30¢". It moved unchanged from
  `lib/charge-settings.ts` (which re-exports it) to the new `lib/fee-phrase.ts`, so the customer's order page does not pull
  in Manage's refusal messages.
- **Message:** `order.serviceFeeNotice`, with no en-US override (same words).
- **None** for a truck with no fee, so every GB page is unchanged.
- **Country page** "Online service fees" now reads:
  > An online card order may carry a service fee. It is shown on your menu before the customer orders, and again as its own line before they pay. … Some places have rules about fees like these, and California's law on all-in pricing is one example. …
  - California is still the example. CHECK 2 is removed.

## 4 · Privacy links (Gap 5; every country)

- **Order page:** a small "Privacy" link (`order.privacyLink`) under each of the three "Place order" buttons, opening
  `/privacy` in a new tab so the basket stays.
- **Confirmation page:** the same link under "Back to …".
- **Customer emails:** " · Privacy" beside "Powered by HatchGrab" in the HTML, and "Privacy: https://www.hatchgrab.com/privacy"
  in the text.
  - Covered: confirmation and "ready" (`lib/email.ts`), cancellation, event cancellation, the refund (text), the rejection
    (`lib/orders/reject-order.ts`), and the operator-cancel email (`app/api/dashboard/action`).
  - One helper: `lib/email-privacy.ts`. Messages: `emailCustomer.common.privacyLink` / `privacyText`.
- **Named change, GB too:** the link and the footer line appear on every order page and customer email.

## 5 · Allergy-note retention (CHECK 12) — the job did not exist; built

- **The stop** (reported then): the policy promised 12-month removal of customer details, but no cron or pg_cron job did
  it.
- **Built, per Dominic:** `lib/order-retention.ts`, plus `app/api/cron/order-retention/route.ts`.
  - Runs daily at 04:30 UTC (`vercel.json`), on the service role, gated like the other crons (CRON_SECRET or admin).
- **For every order created more than 12 calendar months ago, it clears:**
  - `customer_name` → `''`. The column is **NOT NULL**, so the empty string is the smallest safe value; every screen
    already shows "Unknown customer" for a blank name.
  - `customer_email` → null and `customer_phone` → null.
  - `notes` → null.
  - each item's `specialInstructions` → `''`;
  - each deal's `slotNotes` → `{}`.
- **It keeps:** line items, modifiers, quantities, prices, deals, totals, payments and timestamps.
- **Promoted card drafts older than 12 months:** their notes and per-dish notes are cleared the same way. Their name,
  email and phone were already erased at promotion, but their notes were not.
- **Idempotent:** a row with nothing left to clear is not written.
- **Bounded:** at most 5,000 rows per run, in batches of 500.
- **Which rows it reads:** rows with any detail still set, plus anything in the 30 days before the cutoff, so a note on
  a nameless order is caught too.
- **It also calls `purge_order_drafts()`** (abandoned card drafts) every day, instead of a pg_cron job. Nothing was
  calling it.
- **WhatsApp logs (Dominic, second round):** it DELETES every `whatsapp_logs` row and every `messages` row created more
  than 12 months ago — the whole row (the customer's number, their message, our reply).
  - Bounded like the rest (batches of 500, at most 5,000 a run, keyed on each table's primary key `id`) and idempotent.
  - A row with no `created_at` cannot be aged and is left; there are none today.
- **Live today (read-only):** it would touch:
  - **0 orders** (the oldest order is 18 June 2026; the first reach 12 months in June 2027);
  - **0 promoted drafts**;
  - **0 expired drafts** to purge;
  - **0 `whatsapp_logs` rows** (17 rows in all, the oldest 17 June 2026);
  - **0 `messages` rows** (the table is empty).
  - That is intended: once deployed, each row is dealt with on the first daily run after it turns 12 months old.

**Policy wording (named, before → after):**

| Where | Before | After |
|---|---|---|
| Privacy section 7 | Order records containing customer details: 12 months, after which the customer's name, email and phone are removed and only anonymised order data remains. | …after which the customer's name, email and phone, **and any notes on the order (including allergy or dietary notes),** are removed and only anonymised order data remains. |
| Privacy section 7 (new) | — | **Unfinished online card orders** (started but never placed): deleted within a day of expiring. If a card payment was still being held, they are deleted within a day of that hold being released. |
| Privacy section 7 (new) | — | **WhatsApp messages your customers send a truck, and our automatic replies:** 12 months. |
| Privacy section 7 (new line after the list) | — | Our email provider keeps delivery logs for a limited time under its own retention policy. |
| Country page, Allergy and dietary notes | …keep them with the order record for the period in section 7… | …we pass them to the truck with your order. We remove them, with your name and contact details, 12 months after the order, as section 7 of the Privacy Policy says. |

**Every other place a customer's personal details live:**

| Place | What it holds | What the policy says | Action |
|---|---|---|---|
| `orders` | name, email, phone, notes, per-dish and deal notes | 12 months | **In the job** |
| `order_drafts` (promoted) | notes, per-dish notes (name, email and phone erased at promotion) | Part of the order record | **In the job** |
| `order_drafts` (never placed) | name, email, phone, notes | Now: "deleted within a day of expiring" | **purge_order_drafts in the job** |
| `order_payments` | no customer identifiers (amounts, Stripe refs, operator note) | — | Nothing to do |
| `action_audit_log` | no customer data (0 of 1,317 rows hold an email or customer_* key) | — | Nothing to do |
| `whatsapp_logs` | a customer's WhatsApp number, their message, our automatic reply (17 rows since 17 June) | Now 12 months (section 7) | **In the job: rows deleted** |
| `messages` | from/to numbers and body of WhatsApp sends (`lib/twilio.ts`); 0 rows today | Now 12 months (section 7) | **In the job: rows deleted** |
| Brevo (email provider) | the emails sent to customers, in Brevo's own logs | Now: "keeps delivery logs for a limited time under its own retention policy" (section 7) | Nothing in code |
| Stripe | payment records | Stripe listed; its own retention | Nothing to do |
| `demo_sessions.email`, `subscribers.email`, `outreach_*` | prospects and subscribers, not customers who ordered | Outside this item | Listed only |

## 6 · Small items

- **`TERMS_VERSION`:**
  - It is now `'2026-10-19'`, exported from `lib/legal.ts` beside the documents' dates and imported by
    `app/api/signup/route.ts`. It was `'holding-2026-07-23'`, typed in the route.
  - Accounts that signed up under the old value are still findable by it for re-consent.
- **Legal titles:**
  - `/terms`, `/privacy` and `/country-terms` set `title: { absolute: … }`, so "… — HatchGrab" is no longer followed by
    "| HatchGrab".
  - **Named change:** on Village Foodie's host the old title read "… — HatchGrab | Village Foodie". It now reads
    "… — HatchGrab" there too.

## Proof

- **GB is byte-identical except the named changes:**
  - the outreach footer;
  - PostHog storage;
  - privacy sections 5–7 (including the WhatsApp line and the email-provider line);
  - the privacy links (order page, confirmation, customer emails);
  - the legal titles;
  - plus `TERMS_VERSION` on new signups.
  - The fee notice is US-only (no GB truck has a fee).
- **`scripts/legal-follow-ups.cjs`** (new, 34 checks):
  - the retention job on fixtures: cleared vs kept, NOT NULL, per-dish and deal notes, promoted drafts, purge called,
    idempotent, the daily cron with the existing gate and client;
  - the WhatsApp deletion: 503 old `whatsapp_logs` rows (across two batches) and an old `messages` row deleted, new rows
    untouched, a second run deleting nothing, the bounds, and section 7's two new lines;
  - CHECK 9;
  - PostHog;
  - the fee notice (wording; only with a fee; both places);
  - the privacy links on the order page, confirmation and email footers (a real email rendered);
  - `TERMS_VERSION`;
  - the three titles.
- **`scripts/us-legal-draft.cjs`:** re-pinned with the named privacy changes for sections 5, 6 and 7, including the
  WhatsApp bullet and the email-provider line (36 checks).
- **`scripts/outreach-legal-footer.cjs`** (new) and the re-pinned outreach harnesses (above).
- `tsc --noEmit`: clean.
- **Full sweep:** **140 run · 140 passed · 0 failed**, with only the named re-pins below.
- `next build`: exit 0; `/api/cron/order-retention` and `/country-terms` are in the route table.
- **The harness safety screen** refused two of my source checks (they named the service-role variable and the database
  client constructor). They now compare the route's client block with an existing cron's instead, without naming either.

## Named re-pins in the sweep (this batch)

Each re-pin is marked "⚠️ RE-PINNED (legal follow-ups, 19 October 2026)" and names its change. Each one is precise: it
transforms BEFORE into exactly the named change (or takes exactly that change out of AFTER where only tag-stripped text is
pinned) and does not recapture anything.

**The shared module.**
- `scripts/_legal-followups-named.cjs` is new and listed under `shared_modules`.
- **`emailPrivacy` / `orderPagePrivacy` / `both`** add the privacy link to a BEFORE string: the email footer markup and
  text, and the order-page markup.
- **`unPrivacy`** removes exactly that link from an AFTER string. It is used only where BEFORE never says "Privacy".

**Re-pinned harnesses.**

| Harness | Named change | How |
|---|---|---|
| `money-sweep-parity.cjs` (and `-usd`, which shares it) | legal-followups-privacy-link | BEFORE goes through `both` (the fix2 chain). On the order page's text leaves, AFTER goes through `unPrivacy`. The one new `href=/privacy` attribute is allowed on 8 order-page views. |
| `us-rehearsal-fixes.cjs` | legal-followups-privacy-link | The GB confirmation, new-order and event-cancellation emails are compared against BEFORE plus the link. |
| `order-charges.cjs` | legal-followups-privacy-link | The GB order-path emails are compared against BEFORE plus the link. |
| `phone-parity.cjs` | legal-followups-privacy-link | The order form's 160-character window is cut after the link is taken out. Otherwise the screens are compared through `unPrivacy`. |
| `time-dates-parity.cjs` | legal-followups-privacy-link | A new allowance "P" (not a time change) covers 44 leaves: the email footers, and the order page under Place order and "Back to". |
| `_lp2-named.cjs` (language-phase-1a, 1b, 1c, 2) | legal-followups-privacy-link | `both` applies to every view except the CSVs. |
| `_lp2-named.cjs` | legal-followups-terms-version | The signup's operators insert records `"2026-10-19"` where it recorded `"holding-2026-07-23"`. |
| `_lp2-named.cjs` | legal-followups-service-fee-notice (US) | One `<p data-fee-notice>` "Online card orders include a service fee of 3% + 30¢." follows each tax notice on the US order-page views. |
| `_lp1e-named.cjs` and `language-phase-1e-tidy.cjs` | legal-titles-absolute | The Terms and Privacy titles lose only the trailing " \| HatchGrab". |
| `_messages-parity-1e.cjs` | the new outreach words | `outreach.companyFooter` and `outreach.optOut.notSetUp` are named as new wording. |
| `outreach-send-read-failure.cjs` | the outreach footer | "EMAIL_FRAME_SANDBOX is untouched" no longer means "lib/outreach-mail-message.ts has no diff", because that file now changes on purpose. The check now reads the constant's own line in `lib/outreach-workspace.ts` (HEAD's) and confirms that no changed line of the mail-message file mentions a sandbox or a frame. |
| `us-legal-draft.cjs` | privacy sections 5–7 | Covered above. |
| The four outreach harnesses | the outreach footer | Covered in section 1. |

**Regenerated by their harnesses:** `scripts/fixtures/language-phase-1e-us-changed.txt` and
`language-phase-2-us-changed.txt`. These are the US views listed as changed.

## Localhost check (Dominic, `http://hatchgrab.localhost:3000`)

1. **Order page link:** `/trucks/test-kitchen/order` (Pizza Kitchen). Add an item, then Review & order: "Privacy" under
   Place order opens /privacy in a new tab. There is no fee line (GB).
2. **Fee notice (the twin):** `/trucks/test-kitchen-us/order?event_id=7021f4a3-75d7-4e98-8c88-e138b09a0838`. Add an item:
   "Menu prices don't include sales tax. It's added below." then "Online card orders include a service fee of 3% + 30¢."
   — in the basket and in the review sheet.
3. **Privacy policy:** `/privacy`, sections 5 (Cookies and browser storage; Product analytics), 6 (the PostHog row) and 7
   (notes removed at 12 months; unfinished card orders).
4. **Rendered outreach email:** `docs/legal-followups/outreach-us-600.png` and `outreach-uk-600.png`, or
   `node scripts/outreach-legal-footer.cjs`.
5. **Titles:** the browser tab on /terms reads "Terms of Service — HatchGrab", with no second "| HatchGrab".
6. **Outreach composer** (Admin › Outreach, a fixture prospect; do NOT press Send):
   - the grey company line sits under the compose box;
   - with no opt-out line, Send is disabled but Send test to me is not;
   - Reply on a message the prospect sent: Send is enabled without the opt-out line.
7. **Privacy section 7:** the WhatsApp line, and "Our email provider keeps delivery logs…" after the list.

## SQL

Read-only only; the queries and results are in the chat reply. There is no database change; the retention job is code.

## Undo (only if Dominic asks)

Code and content only. Revert:
- `app/providers.tsx`;
- the order page;
- `lib/email.ts`, `lib/email-privacy.ts`, `lib/orders/reject-order.ts` and the dashboard action route;
- the outreach files;
- `content/legal/*`;
- `lib/legal.ts`;
- the signup route;
- the three legal pages.

Also delete `lib/order-retention.ts`, `lib/outreach-retry-rebuild.ts` and `app/api/cron/order-retention/`, and remove
its `vercel.json` entry.

## Not done / notes

- **Basket fee fold:** the basket footer still folds the fee into "Tax & fees" (earlier Gap 4). The new notice states the
  fee before ordering.
- **No all-in pricing mode** exists; the notice is the disclosure.
- **Brevo:** the policy now says its delivery logs follow its own retention policy, with no number, as Dominic asked.
  Nothing was set in Brevo.
- **SMS:** none is sent. Opt-in wording is needed before the feature ships.
