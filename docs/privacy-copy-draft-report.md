# Privacy copy — proposed corrections, for review

**Draft only. No source file changed, nothing deployed, no SQL, no migration.**
**`content/legal/privacy-policy.md` is UNTOUCHED.** Every replacement below is proposed text for your
review.

---

## VERIFICATION

- **Executed:** reads of `content/legal/privacy-policy.md` (all 173 lines),
  `docs/posthog-exposure-report.md`, `docs/data-collection-facts-report.md`, and the Play declarations
  recorded in `docs/reference-manual.md`. **That is execution of my reading, not of the product.**
- **Not executed:** no browser, no PostHog UI, no Play Console, no network observation. 🔴 **I have not
  observed a single event or cookie. Everything rests on your established facts plus source reads.**
- **No typecheck involved.**

⚠️ **ONE NAMING DISCREPANCY, FLAGGED NOT GUESSED:** you wrote `content/legal/privacy.md`. **The file is
`content/legal/privacy-policy.md`** — there is no `privacy.md`. I have drafted against the file that
exists.

**No span of the prompt arrived garbled.**

---

## 🔴 STOP AND NAME — one thing drafting revealed

**You asked me to stop and name any place the page and the Play declaration would disagree.**

**On the facts themselves they do not disagree — both were filed on the SAME wrong premises** (both omit
PostHog and Stripe; both treat card processing as absent). Correcting one *requires* correcting the
other, which is your point, not a conflict.

🔴 **BUT DRAFTING SURFACED A DIFFERENT DEFECT, AND IT IS STRUCTURAL RATHER THAN A MISSING ROW.**

The page's §2 says, flatly:

> **When you are a customer ordering food from a truck**, the truck is the controller of your order
> data.

**That is true of ORDER data. It is not true of ANALYTICS data.** PostHog runs on
`/trucks/[slug]/order` — the customer's ordering page — and captures that customer's pageviews,
interactions and IP **for our product analytics, decided by us, for our purposes.**

> 🔴 **FOR THAT PROCESSING WE ARE THE CONTROLLER, NOT THE TRUCK'S PROCESSOR.** The page as written
> tells a customer that the truck decides everything about their data. **For analytics, we do.**

**This changes the shape of the correction, not just its content:** §2 and §4 need a controller
statement for analytics that the current structure has nowhere to put. **I have drafted it (§A4
below), but it is a legal-position decision, not a copy fix, and you should read it as such.**

⚠️ **It also affects the Play declaration:** analytics collected from the customer surface is *our*
collection, which is what makes it declarable at all.

---

# A. Proposed replacement copy

**Four sections change. Existing text quoted first, replacement after, in the file's own voice —
plain sentences, bold lead-ins, no hedging.**

---

## A1 · §5 "If you visit our websites" — the cookie defect

### EXISTING (`content/legal/privacy-policy.md:86-92`)

> ## 5. If you visit our websites
>
> We collect basic technical data automatically: IP address, browser type, device type, pages viewed,
> and the site you arrived from. We use this to keep the sites working and secure, and to understand
> which pages are useful.
>
> **Cookies.** We use cookies that are strictly necessary to make the sites work — signing you in,
> keeping your basket, and remembering your preferences. We do not use advertising, tracking or
> third-party analytics cookies, and we do not track you across other websites.
>
> You can block or delete cookies in your browser settings, though parts of the site may stop working
> if you block the necessary ones.

### PROPOSED REPLACEMENT

> ## 5. If you visit our websites or use the apps
>
> We collect basic technical data automatically: IP address, browser type, device type, pages viewed,
> and the site you arrived from. We use this to keep the sites working and secure, and to understand
> which pages are useful.
>
> **Analytics.** We use PostHog, an analytics product, to understand how our sites and apps are used.
> It records the pages you view and the things you click — buttons, links and form fields — along with
> your IP address, the address of the page you are on, and the site you arrived from. It runs on our
> websites and inside the HatchGrab apps.
>
> **It does not record your screen, your keystrokes, or the contents of what you type.** It does not
> record the data your browser sends to or receives from our servers.
>
> **PostHog stores this data in the European Union and we keep it for 30 days**, after which it is
> deleted.
>
> **Cookies.** We use cookies that are strictly necessary to make the sites work — signing you in,
> keeping your basket, and remembering your preferences. **We also set an analytics cookie for
> PostHog, on every page of both sites.** It is used to recognise the same browser across page views so
> that a visit is counted once rather than many times.
>
> **We do not use advertising cookies, we do not sell or share data for advertising, and we do not
> track you across other websites.**
>
> **We do not currently ask for your consent before setting the analytics cookie.** You can block or
> delete cookies in your browser settings, and you can ask us to delete analytics data about you by
> emailing privacy@hatchgrab.com. Blocking the strictly necessary cookies will stop parts of the site
> working.

⚠️ **The last paragraph states the position rather than defending it.** Per your constraint I have not
drafted a consent banner and have not claimed consent is obtained. 🔴 **"We do not currently ask for
your consent" is an admission with legal consequences under PECR — see the FLAGGED list.**

---

## A2 · §6 provider table and the payment-processor defect

### EXISTING (`:96-114`) — the two defective parts

> | Provider | What it does | Where |
> | --- | --- | --- |
> | Supabase | Database and authentication | United Kingdom (London) |
> | Vercel | Website and application hosting | United Kingdom (London) |
> | Brevo | Sending transactional email | European Union |
> | Google (Gemini) | Reading menus you upload, to extract their contents | United States |
> | Apple and Google | Delivering push notifications to your device | United States |

> As our service grows we may add providers, including a payment processor and an SMS provider. We will
> update this list before they begin processing your data.

### PROPOSED REPLACEMENT

**Table: see section B below — it is the deliverable and I have not duplicated it here.**

**Replacing the closing sentence:**

> As our service grows we may add providers, including an SMS provider. We will update this list before
> they begin processing your data.

**And replacing the international-transfers paragraph (`:112`):**

> **International transfers.** Your account data and order data are stored and processed in the United
> Kingdom. Analytics data is stored in the European Union. Three things are handled outside both: menu
> extraction, which uses a Google service in the United States; push notifications, delivered by Apple
> and Google in the United States; and card payments, which are processed by Stripe. Where data leaves
> the UK, the transfer is covered by UK adequacy regulations or by the International Data Transfer
> Agreement or Addendum, which provide appropriate safeguards. You can ask us for details of the
> safeguards that apply.

---

## A3 · §3 — card processing is live, not future

### EXISTING (`:47`)

> - Payment and billing information, if and when paid subscriptions are activated. Card details are
>   handled by our payment provider and are never stored on our systems.

### PROPOSED REPLACEMENT

> - Payment and billing information. **Card payments are live: when a customer pays by card for an
>   order from your truck, the payment is processed by Stripe.** Card details are entered directly into
>   Stripe's own payment form and **never reach our systems** — we hold only a reference to the payment,
>   its amount and its status. Billing information for paid subscriptions is collected if and when you
>   activate one.

⚠️ **"never reach our systems" is drawn from your established fact that card details are entered into
Stripe's form. It is a strong claim on a live payment path — confirm it before publishing.**

---

## A4 · §2 and §4 — the controller gap for analytics

**This is the change the stop-and-name section is about. New text, no existing sentence removed.**

### ADD to §2, after the existing two paragraphs (`:34`)

> **One exception, stated plainly.** We use analytics on the ordering pages as well as on our own
> sites. **For that analytics data we are the controller, not the truck's processor** — we decide to
> collect it and we decide what it is for. It is separate from your order, and section 5 explains what
> it covers.

### ADD to §4, after the "We do not sell this data" paragraph (`:78`)

> **Analytics on the ordering page.** Separately from your order, we collect analytics about your visit
> to the ordering page — see section 5. **That data is ours, not the truck's**, and you can ask us to
> delete it at privacy@hatchgrab.com.

---

## A5 · §7 retention — one line to add

### ADD after the "Technical and security logs" line (`:125`)

> - **Analytics data:** 30 days.

---

# B. The corrected provider table

**Every third party receiving personal data. Rows marked ⚠️ rest on a fact I could NOT establish and
must be checked before publishing — I have not invented a value for any of them.**

| Provider | What data it receives | Purpose | Where processed |
| --- | --- | --- | --- |
| **Supabase** | All account, truck, menu and order data, including customer name, email, phone and order contents; authentication credentials | Database and authentication | United Kingdom (London) |
| **Vercel** | All request data, including IP address and page addresses | Website and application hosting | United Kingdom (London) |
| **Brevo** | Recipient name and email address, and order contents in confirmation and cancellation emails | Sending transactional email | European Union |
| 🔴 **PostHog** | Pages viewed, interactions with buttons, links and form fields, IP address, page address, referring site, and an analytics cookie identifier | Product analytics — understanding how the sites and apps are used | **European Union** |
| 🔴 **Stripe** | Card details entered directly into Stripe's payment form, the payment amount, and the customer's name and email where provided | Processing card payments for orders | ⚠️ **See note 1** |
| **Google (Gemini)** | Menu images and documents you upload, and the text extracted from them | Reading uploaded menus to extract their contents | United States |
| **Apple and Google** | Device push token, and the content of the notification | Delivering push notifications to your device | United States |
| ⚠️ **Meta** | Message content sent to or from a truck's WhatsApp or Messenger account | Automatic replies to customer messages | ⚠️ **See note 2** |
| ⚠️ **Vercel (domains)** | An operator's own domain name | Setting up a truck's custom web address | ⚠️ **See note 3** |

### Notes — facts I could not establish

1. 🔴 **Stripe's processing location is NOT in your established facts and I have not invented one.**
   Stripe's UK/EU entity and data location depend on the account's country and configuration.
   **Check the Stripe Dashboard (account country and data residency) before publishing.**
2. ⚠️ **Meta is not in your established facts.** It appears in `docs/data-collection-facts-report.md`
   as receiving WhatsApp/Messenger content via `graph.facebook.com`. 🔴 **Whether the feature is live in
   production, and for which trucks, I could not establish. Confirm before publishing — and if it is
   live, its processing location too.**
3. ⚠️ **The Vercel domains API** appears in the same report as receiving operator domain names.
   **A domain name may not be personal data**, depending on whether it identifies an individual. **A
   judgement call, not a fact — decide whether it belongs in a public table at all.**

### Deliberately NOT in the table

- **Google Fonts** — `next/font/google` is **self-hosted at build time** by Next.js, so INFERRED no
  runtime request from a visitor's browser. ⚠️ **INFERRED, not observed** — the earlier report says so
  explicitly. **If you want certainty, watch the network panel on the landing page.**
- **Vercel Analytics / Speed Insights** — ✅ **genuinely absent**; neither package is installed.

---

# C. Google Play data safety — question by question

⚠️ **SCOPE DIFFERENCE, STATED BEFORE THE ANSWERS: the Play declaration covers the ANDROID APP ONLY.**
The privacy page covers both websites and both apps. **They rest on one set of facts but do not have
the same scope — do not sync them naively.**

**"On record" = the declarations recorded in `docs/reference-manual.md` (V11.44).**

| # | Question | Currently on record | Proposed | Fact driving the change |
|---|---|---|---|---|
| 1 | **Does your app collect or share any required user data types?** | Yes | **Yes** — unchanged | — |
| 2 | **Personal info → Name** | Collected (order flow) | **Collected. Shared: yes** (Supabase, Brevo, Stripe) | Unchanged in substance |
| 3 | **Personal info → Email address** | Collected | **Collected. Shared: yes** | Unchanged |
| 4 | **Personal info → Phone number** | Collected | **Collected. Shared: yes** | Unchanged |
| 5 | 🔴 **App activity → App interactions** | ⚠️ **Not recorded in the manual's summary** | 🔴 **COLLECTED — required, not optional.** Purpose: **Analytics.** Shared with PostHog | 🔴 **Autocapture and pageview capture default TRUE, and there is NO consent gate — so it cannot be declared optional** |
| 6 | 🔴 **Device or other IDs** | ⚠️ **Not recorded** | 🔴 **COLLECTED — required.** Purpose: **Analytics** | **PostHog persistence is `localStorage+cookie`, so a per-browser identifier is stored on every route** |
| 7 | 🔴 **App info and performance → Diagnostics** | ⚠️ **Not recorded** | ⚠️ **See the open question below** | `capture_performance` is `undefined` and defers to remote config |
| 8 | 🔴 **Financial info → Purchase history** | **"No financial features"** | 🔴 **COLLECTED — order contents and amounts** | **Card processing is LIVE.** ⚠️ **"No financial features" answered a different question — app *category* features. Purchase history is a data *type* and is separate** |
| 9 | **Financial info → Payment info (card details)** | Not collected | **NOT collected — unchanged** | **Card details go straight to Stripe and never reach our systems** |
| 10 | **Location → Approximate location** | ⚠️ **Not recorded** | ⚠️ **See the open question below** | **IP is received by PostHog and Vercel by construction** |
| 11 | **Is all data encrypted in transit?** | Yes | **Yes** — unchanged | — |
| 12 | **Can users request data deletion?** | Yes | **Yes** — unchanged | In-app deletion plus privacy@hatchgrab.com |
| 13 | **Advertising ID** | **No** | **No — unchanged** | **No ads SDK; PostHog is a web library in the WebView with no access to it** |
| 14 | **Processors declared** | Supabase, Vercel, Brevo, Google (Gemini) | 🔴 **ADD PostHog and Stripe** | **Both receive personal data and both were omitted from the page and the form** |
| 15 | **Data collection is optional?** | ⚠️ **Not recorded** | 🔴 **NO — required** for analytics types | **No consent gate exists** |

### 🔴 Two Play answers I cannot settle from here

- **Q7 Diagnostics.** `capture_performance` is `undefined`, so the **project setting** decides whether
  `$web_vitals` fires. **If it does, Diagnostics is collected.** 🔴 **Check PostHog → Activity for
  `$web_vitals` before answering.**
- **Q10 Approximate location.** IP is received by construction. **Whether Play counts an IP used only
  for analytics and security as "Approximate location" is a judgement about their definitions, not a
  fact about this codebase.** ⚠️ **The earlier report already flagged this as "at minimum approximate,
  arguably precise". Decide it deliberately.**

---

# D. Every drafted sentence resting on a fact NOT in your established list

🔴 **Check each before publishing. I have not invented values — where I could not establish something I
marked it rather than filling it in.**

| # | Drafted text | The unestablished fact |
|---|---|---|
| 1 | *"It is used to recognise the same browser across page views so that a visit is counted once."* | **The cookie's PURPOSE as I have described it.** Established: persistence is `localStorage+cookie`. **What PostHog does with it is my characterisation.** |
| 2 | *"records the pages you view and the things you click — buttons, links and form fields"* | **That autocapture covers form fields.** Established: autocapture defaults true. **Its exact element coverage I did not read out of the bundle.** |
| 3 | *"It does not record your keystrokes, or the contents of what you type."* | ⚠️ **Established only that replay is off.** **Autocapture may capture element text and input names. I did NOT verify it never captures typed values** — `mask_all_text` is false. 🔴 **The strongest claim in the draft and the one I am least sure of.** |
| 4 | *"an analytics cookie, on every page of both sites"* | **That it is exactly ONE cookie.** Established: persistence sets cookies. **The count and names I did not read.** |
| 5 | *"Card details are entered directly into Stripe's own payment form"* | **The Stripe Elements integration detail.** Established: a live key and that card details never reach our servers. |
| 6 | *"we hold only a reference to the payment, its amount and its status"* | **Which Stripe fields are stored.** From `order_payments` columns in earlier reports, **not from your list.** |
| 7 | Stripe row: *"the customer's name and email where provided"* | **Whether name/email are actually passed to Stripe.** ⚠️ **Not established. Check the PaymentIntent creation call.** |
| 8 | Meta row entirely | **Not in your list.** From an earlier report. **Confirm the feature is live.** |
| 9 | Vercel domains row entirely | **Not in your list**, and whether a domain name is personal data is a judgement. |
| 10 | Brevo: *"order contents in confirmation and cancellation emails"* | **Which emails carry order contents.** From the earlier report's 13 call sites. |
| 11 | Supabase: *"authentication credentials"* | **That Supabase Auth holds credentials.** Reasonable, **not in your list.** |
| 12 | Play Q5/Q6/Q15 *"required, not optional"* | **My reading of Play's optional/required definition.** A form-definition judgement. |
| 13 | Play Q8 *Purchase history collected* | **My reading that order contents are "purchase history"** under Play's taxonomy. |
| 14 | *"PostHog stores this data in the European Union"* | ✅ **Established.** ⚠️ **But "PostHog, an analytics product" naming the vendor publicly is a choice, not a fact.** |
| 15 | §A4 controller wording | 🔴 **A LEGAL POSITION, NOT A FACT.** See the stop-and-name section. **Take advice.** |
| 16 | Registered address in §1 and §12 | Carried over unchanged from the existing file; **I did not verify it.** |

---

# FLAGGED, NOT DRAFTED

**Per your constraint. Named so they are decided, not inherited.**

1. 🔴 **The cookie consent position.** The draft says plainly that consent is not currently asked for.
   **Under PECR, a non-essential analytics cookie requires consent before it is set.** ⚠️ **Publishing
   this sentence documents the gap in your own words. The alternatives — a consent banner, or
   disabling the analytics cookie — are code and product decisions I was told not to draft.**
   🔴 **Note the ordering risk: publishing the admission before fixing the cause is a deliberate choice
   and should be a deliberate one.**
2. **ICO registration.** Recorded elsewhere as not yet done. **Not referenced in this draft.**
3. **The terms' operator-website and custom-domain gaps.** Separate document, separate decision.
4. ⚠️ **Whether to name PostHog and Stripe as vendors publicly**, rather than "an analytics provider"
   and "a payment provider". **I drafted with names, because the existing table names every other
   provider — but it is your call.**
5. 🔴 **Rotating the leaked dashboard tokens.** Not a copy question, **but the privacy page will now
   describe analytics collection while `docs/posthog-exposure-report.md` records that operator
   credentials are sitting in that same analytics store.** **Correcting the page does not correct
   that.**

---

## What I could not establish

1. **Whether `$web_vitals` is firing** — drives Play Q7. PostHog → Activity.
2. **Stripe's processing location** for this account — Stripe Dashboard.
3. **Whether the Meta integration is live in production.**
4. **Whether autocapture ever captures typed input values** — item D3, the claim I am least sure of.
   **Read one `$autocapture` payload in DevTools.**
5. **The exact cookie names and count** PostHog sets.
6. **Whether name/email are passed to Stripe** on PaymentIntent creation.
7. **What the Play form currently says** for the questions marked "not recorded" — the manual's summary
   is not the form. 🔴 **Open the Play Console Data safety section and read the current answers before
   changing any of them.**
