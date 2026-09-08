# Privacy policy — the processors Meta is reading for right now

**5 September 2026. Branch `whatsapp-connections-s1-s3`. NOT COMMITTED, not pushed, not deployed. No cap sync, native binary untouched. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

## 🔴 ONE FILE. `content/legal/privacy-policy.md`. NOTHING ELSE.

🧪 **Verified:** `git diff --stat` shows **1 file changed, 6 insertions(+), 4 deletions(-)**. The modified-file count went from 23 to 24; the 24th is this file.

**Method:** 🔎 SOURCE-READ · 🧪 EXECUTED. ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# 🔴 READ THIS FIRST — THE ONE THING I DID NOT ADD, AND WHY

**PostHog is wired and is not in the table.** `app/providers.tsx:54` calls `posthog.init(...)` against `https://eu.i.posthog.com` on every one of our own hosts. **It is third-party product analytics receiving usage data.**

🔴 **I did not add it, because the same page says, four paragraphs above the table:**

> *"We do not use advertising, tracking or third-party analytics cookies, and we do not track you across other websites."*

**Adding PostHog to the table while that sentence stands would ship a policy that contradicts itself — to a reviewer who is reading it for consistency.** That is worse on this specific point than the current state. Fixing it properly means rewriting a cookie declaration, which is a legal-copy decision and not "add the missing processors". 🔴 **It needs your call, and it needs it soon** — but not in the change that has to go out today.

---

# PART A — WHAT IS THERE, AND WHAT ACTUALLY RECEIVES DATA

## A1 — The table as it stood, verbatim

**`content/legal/privacy-policy.md`, lines 100-106**, under `## 6. Who we share data with`, introduced by *"We use a small number of service providers, each of which processes data only on our instructions:"*

| Provider | What it does | Where |
| --- | --- | --- |
| Supabase | Database and authentication | United Kingdom (London) |
| Vercel | Website and application hosting | United Kingdom (London) |
| Brevo | Sending transactional email | European Union |
| Google (Gemini) | Reading menus you upload, to extract their contents | United States |
| Apple and Google | Delivering push notifications to your device | United States |

⚠️ **The page holds no copy of its own.** `app/(legal)/privacy/page.tsx` reads that markdown at build time — *"There is no second copy of the text, so an amendment is an edit to the .md and nothing here changes."*

## A2 — Every third party that actually receives data, read from the code

| Third party | What reaches it | The code path |
|---|---|---|
| **Supabase** | Everything — accounts, trucks, orders, events, `whatsapp_logs` (customer numbers and message text) | `lib/supabase.ts` service-role client, every route |
| **Vercel** | All traffic; hosting. Also **domain provisioning** — `api.vercel.com` receives operator domain names | `lib/custom-domain/vercel.ts` |
| **Brevo** | Recipient email addresses and message bodies — order confirmations, operator alerts, admin alerts | `lib/email.ts` → `api.brevo.com` (13 references) |
| 🔴 **Google (Gemini)** | 🔴 **CUSTOMER WHATSAPP MESSAGE TEXT.** 🧪 Confirmed in source: `Message: "${customerMessage}"` (`lib/whatsapp-classifier.ts:176`) and `Customer message: "${customerMessage}"` (`:296`). **Plus** uploaded menus, schedules, allergen text and geocoding | `callGemini` → `generativelanguage.googleapis.com`, 3 call sites in the classifier; also `menu-extract.ts`, `schedule-extract.ts`, `process-allergens`, `geocode` |
| 🔴 **Meta (WhatsApp)** | 🔴 **Customer phone numbers and message content**, inbound and outbound | webhook `app/api/webhooks/meta/whatsapp/route.ts`; send `lib/meta-whatsapp.ts` → `graph.facebook.com` |
| 🔴 **Stripe** | 🔴 **Customer payment details and order amounts; operator identity for payouts** | `lib/payments/authorize.ts` (`paymentIntents.create`), `lib/stripe/connect.ts` (`v2.core.accounts.create`), 8 API routes |
| **Apple / Google** | Device push tokens | APNs in `orders/submit`; FCM in `lib/fcm.ts` |
| ⚠️ **Upstash (Redis)** | ⚠️ **IP addresses** as rate-limit keys — personal data under UK GDPR | `lib/ratelimit.ts`, `proxy.ts` |
| ⚠️ **PostHog** | ⚠️ Product analytics on our own hosts | `app/providers.tsx:54` → `eu.i.posthog.com` |
| ⚠️ **Tally** | ⚠️ Whatever a visitor types into the contact form | `app/contact/ContactForm.tsx:44`, `app/page.tsx:187` |
| 🟢 Cloudflare / Google DNS | **No personal data** — a hostname lookup only | `lib/custom-domain/dns.ts:32-33` |

## A3 — Missing, and stale

**MISSING from the table entirely:**
- 🔴 **Meta (WhatsApp)** — added.
- 🔴 **Stripe** — added.
- ⚠️ **Upstash** — **not added.** It genuinely receives IP addresses, but 🔴 **I cannot determine its region from the code**: the REST URL is `https://fond-hornet-115530.<host>` and Upstash hostnames do not encode a region. Every other row states a location, and **writing one I cannot support is the false-claim class the manual records.** Needs your answer from the Upstash console.
- ⚠️ **PostHog** — **not added.** See the top of this report.
- ⚠️ **Tally** — **not added.** It is on the public contact form rather than the operator product; whether it belongs in this table is a scope decision, not a code fact.

**STALE — no longer reflecting the code:**
- 🔴 **`Google (Gemini)` said only "Reading menus you upload".** It has been reading **customer WhatsApp messages** since the classifier shipped. **This is the exact inconsistency with your Meta submission.** Extended, not reworded.
- 🔴 **"Two things are handled outside it"** in the international-transfers paragraph — an exhaustive claim that was already wrong and would have become more wrong.
- 🔴 **"we may add providers, including a payment processor"** — Stripe is live. Future tense about a processor already processing.
- 🟢 Supabase, Vercel, Brevo, Apple/Google push — **still accurate, untouched.**

## A4 — The date

**`**Last updated:** 6 August 2026`, line 3** — and 🧪 the file's own git timestamp is **6 August**, so that was the last substantive update: **a month before WhatsApp auto-replies, Stripe payments and Embedded Signup existed.**

🔴 **Yes, it is visible** — the page renders the document's own line and is deliberately given no `updated` prop. **Changed to 5 September 2026.**

⚠️ **`lib/legal.ts:84` holds `PRIVACY_UPDATED = '6 August 2026'`, and its comment says to change both.** 🧪 **I did not, and here is why: it has ZERO consumers** — `grep` for `PRIVACY_UPDATED` across `app`, `components` and `lib` returns only its own declaration. Nothing renders it. Touching it would have broken the single-file requirement for a time-critical deploy, to correct a value no reader sees. 🔴 **It is now stale and it is two records of one fact — the drift pattern this codebase keeps recording. Fix it in the next change that touches `lib/`.**

---

# PART B — THE UPDATE

## 🔴 The final table, verbatim — compare against what you submitted

```
| Provider | What it does | Where |
| --- | --- | --- |
| Supabase | Database and authentication | United Kingdom (London) |
| Vercel | Website and application hosting | United Kingdom (London) |
| Brevo | Sending transactional email | European Union |
| Google (Gemini) | Reading menus you upload, to extract their contents, and reading messages your customers send you on WhatsApp, to write the automatic replies | United States |
| Apple and Google | Delivering push notifications to your device | United States |
| Meta (WhatsApp) | Carrying WhatsApp messages between your customers and your business number | United States |
| Stripe | Taking payments from your customers and passing them on to you | United States |
```

🟢 **Existing rows unchanged and in their original order.** New rows appended. Same three columns, same sentence-fragment voice, no restyling.

## The three other edits, and why each was forced rather than chosen

🔴 **You said not to touch anything else. These three are not "anything else" — each is a sentence that the additions make FALSE.** Leaving them would have shipped a policy contradicting its own table.

**1. International transfers.** *"Two things are handled outside it"* is an exhaustive claim.
> **Before:** *"Two things are handled outside it: menu extraction, which uses a Google service in the United States, and push notifications, which are delivered by Apple and Google in the United States."*
> **After:** *"Some things are handled outside it: menu extraction and WhatsApp automatic replies, which use a Google service in the United States; WhatsApp message delivery, which is handled by Meta in the United States; payments, which are handled by Stripe in the United States; and push notifications, which are delivered by Apple and Google in the United States."*

**2. The forward-looking sentence.**
> **Before:** *"As our service grows we may add providers, including a payment processor and an SMS provider."*
> **After:** *"As our service grows we may add providers, including an SMS provider."*

**3. The date.** `6 August 2026` → **`5 September 2026`**.

## What the wording does and does not claim

🟢 **Every phrase is supported by a code path in A2.** In particular *"reading messages your customers send you on WhatsApp, to write the automatic replies"* is exactly what `callGemini` receives — 🧪 the message text is interpolated into the prompt at two call sites. **It does not claim Gemini stores, trains on, or has access to anything else**, because the code cannot support that.

⚠️ **The weakest cells are the `Where` values for the two new rows.** I used **United States** for both, matching the table's existing convention for Apple/Google. 🔴 **Neither was verified against a data-processing agreement** — Meta and Stripe both operate EU/UK entities, and if your DPAs name Stripe Payments UK Ltd or Meta Platforms Ireland, these two cells should say so instead. **That is a contract question, not a code question, and I could not answer it from here.**

---

# VERIFICATION

| Check | Method | Result |
|---|---|---|
| `npx tsc --noEmit` | 🧪 Executed | **exit 0** ⚠️ certifies little — a markdown edit, though the page does `readFileSync` at build |
| **One file changed** | 🧪 Executed `git diff --stat` | ✅ **1 file, 6+/4−** |
| Customer message text reaches Gemini | 🔎 Source-read, quoted | `:176`, `:296` |
| Stripe does payments **and** payouts | 🔎 Source-read | `paymentIntents.create`, `v2.core.accounts.create` |
| PostHog host is EU | 🧪 Executed env read | `eu.i.posthog.com` |
| `PRIVACY_UPDATED` has no consumers | 🧪 Executed grep | ✅ declaration only |
| DNS resolvers get no personal data | 🔎 Source-read | hostname lookups only |
| **The rendered page** | ❌ **NOT DONE** | see below |

⚠️ **The proof that would matter most — the page rendering — was not run.** Everything above is the source of the document and the code behind its claims. 🔴 **A markdown file that parses is not a page that renders**; `renderLegalMarkdown` must handle the longer table cell. **Step 2 below is the one that proves it.**

## Safari on macOS — 🟢 you can run this

1. `http://hatchgrab.localhost:3000/privacy` — ⚠️ **not plain `localhost`**, which serves Village Foodie.
2. 🔴 **Scroll to §6 "Who we share data with".** **See: seven rows**, ending **Meta (WhatsApp)** then **Stripe**. 🔴 **Wrong if the table shows five rows** (the build cached the old markdown — restart the dev server; it is `readFileSync` at module scope) **or if the long Gemini cell breaks the table layout.**
3. **Check the top of the page:** *"Last updated: 5 September 2026"*.
4. **Read the "International transfers" paragraph** below the table. **See:** Google, Meta, Stripe and Apple/Google all named. **Wrong if it still says "Two things".**
5. **Read the final line of §6.** **See:** *"including an SMS provider"* — **no mention of a payment processor.**
6. ⚠️ **Narrow the window to phone width.** The Gemini cell is now long. **See:** the table still readable. **This is the only visual risk in the change.**

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 staged. No commit, no push, no deploy.**

**Modified by this task: `content/legal/privacy-policy.md` — and nothing else.** The tree went from 23 modified files to 24.

🟢 **Every other workstream byte-for-byte unchanged, verified this run:** WhatsApp (`lib/whatsapp/*`, `app/api/manage/route.ts`, `app/manage/[token]/page.tsx`), custom domain (`lib/custom-host.ts`, `lib/custom-domain/*`, `lib/ratelimit.ts`, the cron, `components/dashboard/*`), Android landing (`app/landing/page.tsx`, `lib/plan-features.ts`, `lib/landing-table.ts`), store badges (`components/landing/LandingFooter.tsx`, `public/badges/README.md`), the order scan-route rename and derivation extraction (`app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `proxy.ts`, `vercel.json`, `lib/custom-domain/copy.ts`), the outreach files (untracked), and `ios/App/App.xcodeproj/project.pbxproj`.

## 🟢 `content/legal/privacy-policy.md` is NOT in the `git add -p` set — it carries ONE workstream

**The set is unchanged at six:**

| # | File | Carries |
|---|---|---|
| 1 | `lib/custom-domain/copy.ts` | custom-domain **+** pre-existing |
| 2 | `app/manage/[token]/page.tsx` | custom-domain **+** WhatsApp S1–S5 |
| 3 | `app/api/manage/route.ts` | custom-domain **+** WhatsApp S1–S5 |
| 4 | `app/landing/page.tsx` | WhatsApp copy **+** Android |
| 5 | `lib/plan-features.ts` | WhatsApp copy **+** Android |
| 6 | `lib/landing-table.ts` | WhatsApp copy **+** Android |

🟢 **So this file can be staged by name and committed alone** — `git add content/legal/privacy-policy.md` — with no `-p` and no risk of carrying another workstream. **That is exactly what the deploy needs.**

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **I did not render the page.** No dev server hit, no screenshot. The markdown is correct as source; **that the table renders is unproven** and is step 2 of the click-through.
- 🔴 **I did not read your Meta submission.** The table above is what the code supports; **whether it matches what you declared is a comparison only you can make** — which is why it is reproduced verbatim.
- 🔴 **The two new `Where` values are unverified against any DPA.** "United States" follows the table's existing convention; your contracts may name UK or Irish entities.
- 🔴 **Upstash's region could not be determined** from the code, so it was not added despite genuinely receiving IP addresses.
- 🔴 **PostHog was deliberately not added** — it contradicts the cookie paragraph, and resolving that is a copy decision.
- ⚠️ **`lib/legal.ts:84` is now stale** (`PRIVACY_UPDATED = '6 August 2026'`). Zero consumers, so no reader sees it; still two records of one fact.
- ⚠️ **Whether Tally belongs in an operator-product policy** is a scope judgement I did not make for you.
- ⚠️ **I did not check whether the Google Play Data Safety form or Apple's App Privacy questionnaire now disagree** with this table. `lib/legal.ts` warns that they must agree and that an inconsistency is a rejection reason — **all three are separate declarations, and I can only see one.**

# FLAGS

- 🟢 **ONE FILE: `content/legal/privacy-policy.md`.** Stageable by name, committable alone.
- 🔴 **The Gemini/WhatsApp inconsistency with your Meta submission is closed** — that was the live rejection risk.
- 🔴 **PostHog is wired and unlisted, and the page says we use no third-party analytics.** Not fixed here; needs a copy decision, soon.
- ⚠️ **Upstash receives IP addresses and is unlisted** — blocked only on its region.
- ⚠️ **The two new "Where" cells are convention, not contract.** Check against your DPAs.
- ⚠️ **`lib/legal.ts` PRIVACY_UPDATED is now stale**, deliberately, to keep this a one-file change.
- ⚠️ **The Play Data Safety form and Apple's App Privacy answers may now disagree with this table.**

*Nothing committed. Nothing staged. `main` = `2ca66cd`. One file changed.*
