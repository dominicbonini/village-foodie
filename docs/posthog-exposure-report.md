# PostHog exposure — what is being sent, and what is stored

**Read-only.** No file changed, no SQL, no migration, no deploy.
**Your established facts are taken as given throughout:** session replay **NOT ENABLED**; network
capture **ON**; console capture **ON**; retention **30 days**; a live Stripe secret key configured.

---

## VERIFICATION

- **Executed:** reads of `app/providers.tsx`, of the **installed `posthog-js` bundle at
  `node_modules/posthog-js/dist/module.js`**, and greps across `app/`, `lib/`, `components/`.
  **That is execution of my analysis, not of the product.**
- **Not executed:** no browser, no network capture inspected, no PostHog UI opened, no query run.
  🔴 **I have not observed a single event leave this application.** Everything below is what the code
  and the bundle are written to do.
- **No typecheck is offered as verification.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 🔴 THE HEADLINE, AND IT CUTS BOTH WAYS

**The dangerous thing is real and it is the URL. The two settings you flagged are, on the evidence in
the bundle, currently inert — but only because replay is off, and that is one toggle away from
changing.**

1. 🔴 **`dashboard_token` in `$current_url` is a live credential leak into a third-party store, and
   nothing in this codebase mitigates it.** `property_denylist` is `[]`, `sanitize_properties` is
   `null`, `before_send` is undefined, `mask_personal_data_properties` is `false`. **Zero
   sanitisation exists.** With 30-day retention, **every dashboard token used in the last 30 days is
   recoverable from PostHog today.**
2. ⚠️ **Network capture and console capture are SESSION-REPLAY sub-features.** The code that implements
   them is **not in the bundle this app loads** — it lives in a separately-fetched `recorder.js`. With
   replay disabled, that script is never fetched, so **no request/response payload and no console line
   is transmitted today.** **The project toggles are armed but have nothing to fire through.**
3. 🔴 **Enabling session replay would, with today's config, immediately begin capturing operator
   screens with customer names, emails and phones, plus request and response bodies.** The two toggles
   are already ON, waiting.

---

## 1. The `posthog.init` call, and every default that therefore applies

**`app/providers.tsx:53-58`, verbatim:**

```js
if (typeof window !== 'undefined' && !IS_EMBED_ENTRY && !IS_CUSTOM_HOST_ENTRY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',
  })
}
```

**Two options are passed. Everything else is the library default.**

**Installed version: `posthog-js` 1.386.6** (`node_modules/posthog-js/package.json`). The app resolves
to **`dist/module.js`** (the package's `module` field). **Defaults read out of that file**, not from
documentation:

| Option | Default in 1.386.6 | Consequence here |
|---|---|---|
| `autocapture` | **`true`** | 🔴 Every click, input and pageview on every operator screen |
| `persistence` | **`"localStorage+cookie"`** | Sets a cookie on every route |
| `property_denylist` | **`[]`** | 🔴 **Nothing is stripped** |
| `sanitize_properties` | **`null`** | 🔴 **No hook installed** |
| `before_send` | **`undefined`** | 🔴 **No filter** |
| `mask_personal_data_properties` | **`false`** | 🔴 **No PII masking** |
| `custom_personal_data_properties` | **`[]`** | — |
| `mask_all_text` | **`false`** | Replay-relevant |
| `mask_all_element_attributes` | **`false`** | Replay-relevant |
| `capture_performance` | **`undefined`** | ⚠️ **Defers to remote/project config** — §2 |
| `enable_recording_console_log` | **`undefined`** | ⚠️ **Defers to remote/project config** — §2 |
| `disable_session_recording` | **`false`** | ⚠️ Client does not block replay; **only the project setting does** |
| `save_campaign_params` | **`true`** | `utm_*` captured |
| `save_referrer` | **`true`** | 🔴 `$referrer` captured — §7 |
| `respect_dnt` | **`false`** | Do-Not-Track ignored |
| `opt_out_capturing_by_default` | **`false`** | No consent gate |
| `ip` | **`false`** | Client does not send IP itself (server may still see it) |
| `properties_string_max_length` | **`65535`** | A long URL is not truncated |
| `capture_pageleave` | **`"if_capture_pageview"`** | — |
| `defaults` | **`"unset"`** | Resolves `capture_pageview` to `"history_change"` |

⚠️ **`person_profiles: 'identified_only'` is the one deliberate privacy choice, and it is narrow.** It
suppresses person *profiles* for anonymous users. **It does not suppress events, and it does not strip
any property.** The URL still travels.

---

## 2. What can be controlled from `init` rather than the project UI

**This is the question that decides whether a blocked setting can be closed by code we control.**

| Behaviour | `init` option | Effective value now | Does client-side override the project setting? |
|---|---|---|---|
| **Autocapture** | `autocapture: false` | **`true`** | ✅ **YES — fully client-side.** No remote gate. **A one-line change we control.** |
| **`$current_url` sanitisation** | `sanitize_properties` / `before_send` / `property_denylist` | **none / `[]`** | ✅ **YES — entirely client-side.** 🔴 **There is no project-side equivalent. This can ONLY be fixed in code.** |
| **Network / performance capture** | `capture_performance: false` | **`undefined`** | ⚠️ **Client CAN override.** Undefined means the remote config decides; setting it `false` locally wins. **Two consumers — see below.** |
| **Console capture** | `enable_recording_console_log: false` | **`undefined`** | ⚠️ **Client can set it**, but it only reaches the recorder, which is not loaded when replay is off. |
| **Session replay** | `disable_session_recording: true` | **`false`** | ✅ **YES — a client-side hard off-switch**, independent of the project toggle. |

### 🔴 `capture_performance` has TWO consumers, and only one is replay-gated

Read from `dist/module.js`:

- **`@157901`** — `networkPayloadCapture: f({capturePerformance: t.capturePerformance}, i?.networkPayloadCapture)`
  — composes the **session-recording** config. **Replay path.**
- **`@171543`** — `onRemoteConfig(t){ if("capturePerformance" in t){ … web_vitals … } }`
  — drives **`$web_vitals`** capture. **NOT replay-gated.**

⚠️ **So "network capture ON" plausibly still produces `$web_vitals` events today, independently of
replay.** Those carry metric values and a URL. **I have NOT confirmed whether `$web_vitals` is
currently firing** — that is a PostHog UI question (§10).

---

## 3. Every surface PostHog runs on

**Worked from the mount, not the route list.** `app/layout.tsx:114` wraps the entire app in
`<CSPostHogProvider>`, and `posthog.init` runs at **module scope** — so it fires on *every* route the
root layout serves, before any component renders.

**Two exclusions only** (`providers.tsx:53`): `/embed*` by path, and any host failing
`isCustomHost()`.

| Surface | Token in URL? | Notes |
|---|---|---|
| 🔴 **`/dashboard/[token]`** | **YES — `dashboard_token`** | The full credential. Refunds, every customer's name/email/phone |
| 🔴 **`/dashboard/[token]/kds`** | **YES — `dashboard_token`** | Same token; the KDS runs on it |
| 🔴 **`/manage/[token]`** | **YES — `dashboard_token`** | Menu, settings, pricing |
| ⚠️ **`/kds/[kds_token]`** | **YES — `kds_token`** | Per-vehicle token |
| `/trucks/[slug]/order` | No — slug | Customer surface; `?confirm=<order_key uuid>` — §7 |
| `/o/[slug]` | No — slug | Scan redirect |
| `/login`, `/signup`, `/admin`, `/help`, landing | No | `/admin` is admin-gated |
| **`/embed/*`** | — | ✅ **Excluded by path** |
| **Operator custom domains** | — | ✅ **Excluded by host allow-list** |

🔴 **Three of the four token-bearing surfaces are the operator's daily tools, and the token is in the
path — so it lands in `$current_url` on every `$pageview` and every `$autocapture`.** That matches
what you established was confirmed in production on 26 August.

---

## 4. What network capture actually transmits, at this configuration

🔴 **AT TODAY'S CONFIGURATION: NOTHING. And the reason is structural, not a setting.**

**Established from the installed bundle by presence/absence, not from documentation:**

```
searched dist/module.js (the file this app imports):
  network_payload_capture   NOT FOUND
  recordHeaders             NOT FOUND
  recordBody                NOT FOUND
  $performance_event        NOT FOUND
```

**Those strings exist only in the recorder bundles** — `dist/recorder.js`, `dist/recorder-v2.js`,
`dist/posthog-recorder.js`, `dist/lazy-recorder.js`, and the `.full` variants **which this app does not
import.**

**And the recorder is fetched at runtime, not bundled** (`dist/module.js@22399`):

```js
loadExternalDependency = (t, e, i) => { … "/static/" + e + ".js?v=" + t.version … }
```

> ✅ **THEREFORE: with session replay disabled, `recorder.js` is never fetched, and the code that reads
> request URLs, methods, statuses, timings, headers and bodies never exists in the page.**
> **No request payload of any kind is transmitted today.**

### If replay were enabled — what each field would do

| Field | Captured? | Gate |
|---|---|---|
| URL | Yes | Recorder present |
| Method, status, timings | Yes | Recorder present |
| **Request headers** | ⚠️ **Separately gated** | `recordHeaders`, **default off** |
| **Request body** | 🔴 **Separately gated** | `recordBody`, **default off** |
| **Response body** | 🔴 **Separately gated** | `recordBody`, **default off** |

⚠️ **I could not read the default values of `recordHeaders`/`recordBody` out of a bundle this app
loads, because it does not load one.** I can only report that they are **separate flags** and that
their code path is absent. 🔴 **Whether your "network capture ON" toggle also enabled payload capture
is a PostHog UI question I cannot answer from here (§10).**

---

## 5. Personal data per operator route

**Reachable from the surfaces in §3. These bodies are NOT transmitted today (§4); this is the exposure
that replay would open.**

| Route | Fields |
|---|---|
| 🔴 **`GET /api/dashboard`** | `orders[]` via `select('*')` — **`customer_name`, `customer_email`, `customer_phone`**, `items`, `notes`, `total`, `slot`, `order_key`; plus **`payments`** (order_payments rows) and **`heldAuthorisations`**; `buzzerLosses[].customer_name` (`:852`) |
| 🔴 **`POST /api/dashboard/action`** | Request body: `editedOrder.customerName / customerEmail / customerPhone`; `manualOrder` (walk-up customer details); `rejectionReason`, `cancellationReason`; `refunded_minor` |
| **`GET /api/menu/[truckId]`** | Menu, prices, stock. No customer PII |
| **`POST /api/manage`** | Truck settings, menu, **operator contact email** |
| **`GET /api/events/manage`** | Venues, dates. No customer PII |
| **`GET /api/orders/[id]`** | A single order — same PII set |
| **`GET /api/auth/me`** | **Operator email, first name, `is_admin`** |

⚠️ **The token is in the URL of the *page*, not of these API calls** — the API calls carry it as a
query parameter (`/api/dashboard?token=…`), so **a captured request URL would carry the credential
too.**

---

## 6. Sanitisation configured in this codebase

🔴 **NONE. Stating it plainly, as asked.**

I searched `app/`, `lib/` and `components/` for each of: `sanitize_properties`, `property_denylist`,
`property_blacklist`, `before_send`, `mask_all_text`, `mask_personal_data_properties`,
`custom_personal_data_properties`, `capture_performance`, `opt_out_capturing`,
`disable_session_recording`, `session_recording`.

**Not one appears anywhere.** The only PostHog configuration in the entire codebase is the two options
in §1. ⚠️ **An empty grep is not proof of absence in general — but here the positive statement holds
independently: `providers.tsx` is the only `posthog.init` call, and I read it in full.**

---

## 7. Stripe — what could reach PostHog, and what I ruled out

### ✅ RULED OUT — the secret key

**`STRIPE_SECRET_KEY` is read only in server routes** (`api/webhooks/stripe/route.ts:620`,
`lib/stripe/connect.ts`). **The complete list of `NEXT_PUBLIC_*` variables** — the only ones that reach
the browser — is:

```
NEXT_PUBLIC_BASE_URL · NEXT_PUBLIC_HATCHGRAB_URL · NEXT_PUBLIC_POSTHOG_HOST
NEXT_PUBLIC_POSTHOG_KEY · NEXT_PUBLIC_PRICING_PUBLISHED · NEXT_PUBLIC_SIGNUP_PUBLIC
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY · NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPPORT_EMAIL
```

**The only Stripe key in the browser is the publishable key, which is designed to be public.**
🔴 **The live secret key cannot reach PostHog by any path in this codebase.**

### ✅ RULED OUT — the ordinary card payment

`app/trucks/[slug]/order/page.tsx:1803-1806` uses **`redirect: 'if_required'`**, so for an ordinary
card **Stripe does not navigate at all** — no Stripe-appended parameters land in any URL. The fallback
`window.location.href = returnUrl` (`:1837`) uses a URL **we construct**:
`/api/payments/return?draft=<order_key>&truck=<slug>` — **no Stripe parameters.**

### ✅ RULED OUT — the confirmation page URL

`/api/payments/return` 303s to `${menuUrl}?confirm=<draftKey>` (`:177, 190, 201, 249`). **`confirm` is
an `order_key` UUID, not a Stripe identifier.** That is the URL PostHog captures.

### 🔴 NOT RULED OUT — `$referrer` on the 3DS path

**This is the one Stripe path I cannot close from here, and I am not going to assert either way.**

For a card requiring 3-D Secure, **Stripe navigates to `return_url` and appends
`payment_intent`, `payment_intent_client_secret` and `redirect_status`.** The browser therefore visits:

```
/api/payments/return?draft=…&truck=…&payment_intent=pi_…&payment_intent_client_secret=pi_…_secret_…
```

**PostHog does not run there** — it is an API route returning a 303, with no HTML and no React. But the
next document *does* run PostHog, and `save_referrer` is **`true`**, so `$referrer` is captured from
`document.referrer`.

**Two readings, and I cannot choose between them by reading source:**

- **Likely benign:** browsers generally propagate the *originating* referrer through a server redirect,
  so `document.referrer` would be the Stripe 3DS page — and being cross-origin under the default
  `strict-origin-when-cross-origin` policy, **origin only**, no query string.
- 🔴 **Possibly not:** if any browser sets `document.referrer` to the *redirecting* URL, that URL is
  **same-origin**, and same-origin referrers send the **full URL including the query string** — which
  would put a **`payment_intent_client_secret` into PostHog**.

⚠️ **AND THERE IS NO REFERRER POLICY SET ANYWHERE IN THIS REPOSITORY** — I searched `app/`, `lib/`,
`next.config.ts` and `vercel.json`. **The browser default is doing all the work.**

**How to settle it: §10, item 3.**

### ⚠️ Payment references in bodies

`payments[]` and `heldAuthorisations` on the `/api/dashboard` response carry `payment_intent_id` and
`idempotency_key`. **Not transmitted today (§4). Would be, under replay with body capture.**

---

## 8. Console capture

### What it transmits today: **nothing**

**`enable_recording_console_log` is a session-replay feature.** Its only appearance in `dist/module.js`
is the default declaration itself (`@85435`); the implementation
(`consoleLogRecordingEnabled`) is **NOT FOUND** in the bundle this app loads and lives in the recorder.
🔴 **With replay off, console lines are not transmitted.**

### What would be transmitted if replay were enabled

**Only browser-side lines.** Server `console.*` goes to Vercel logs and never to PostHog. Counts on the
operator surfaces: **dashboard 18, KDS 8, manage 9.**

**Reviewed all 35. The finding is a mild one, and I would rather say so than inflate it:**

| Line | Risk |
|---|---|
| `page.tsx:1316` `console.log('[VansFetch] truckId:', truckId)` | Truck slug. **Low** |
| `page.tsx:1323` `console.log('[VansFetch] result:', d.vans)` | ⚠️ **Whole object** — van names/config. **No customer PII** |
| `page.tsx:1140-1182` `[auto-select]` ×5 | Event UUIDs and counts. **Low** |
| `kds/page.tsx:691, 710, 1480` | Event UUIDs. **Low** |
| `page.tsx:989`, `kds:615, 746, 787, 789, 793` | HTTP status only. **Low** |
| `order/page.tsx:1802` `console.error('[order] authorisation failed:', result.error.code, result.error.message)` | Stripe **error code and customer-facing message**. **No secret, no PAN** |

🔴 **No console line on any operator surface logs a token, a customer name, an email, a phone, or a
payment reference.** ⚠️ **But `[VansFetch] result:` proves the pattern exists — logging a whole response
object — and the next one added might be `orders`.**

---

## 9. Recommendations, in priority order

| # | Change | Where | Independent of the batches in flight? |
|---|---|---|---|
| **1** | 🔴 **Strip the token from `$current_url` before send.** Add `sanitize_properties` or `before_send` to `posthog.init` to rewrite `/dashboard/<token>` → `/dashboard/[token]` in `$current_url`, `$pathname`, `$referrer` and `$initial_current_url`. | `app/providers.tsx:54` | ✅ **YES. Two files never touched by batch 1 or the status split. Ships alone.** 🔴 **Highest priority: it is the live credential leak, and there is NO project-side setting that can do it — code is the only lever.** |
| **2** | 🔴 **Rotate every `dashboard_token` and `kds_token`.** | Operational, not code | ✅ Independent. ⚠️ **Do #1 first or the new tokens leak immediately.** ⚠️ **A rotation invalidates printed/bookmarked links and is operator-visible.** |
| **3** | **Turn OFF network capture and console capture in the project UI.** | **PostHog UI — not code** | ✅ Independent. **They are inert today (§4, §8), so this is disarming a trap, not stopping a leak.** |
| **4** | **`disable_session_recording: true`** in `init` — a client-side hard off-switch. | `app/providers.tsx:54` | ✅ Ships with #1. 🔴 **This is the one that makes #3 durable**: it survives someone toggling replay on in the UI. |
| **5** | **`autocapture: false` on operator surfaces.** The manual already records there is not one explicit `posthog.capture()` on any operator route — **it collects nothing we use while carrying the whole risk.** | `app/providers.tsx` | ✅ Independent. ⚠️ **Would lose click analytics on customer surfaces too unless scoped by path.** |
| **6** | **Set an explicit `Referrer-Policy`** (e.g. `strict-origin-when-cross-origin`, or `no-referrer` on the payment path). | `vercel.json` headers | ✅ Independent. **Closes §7's open path regardless of which reading is right.** |
| **7** | **`mask_personal_data_properties: true`** as defence in depth. | `app/providers.tsx` | ✅ Ships with #1. |

⚠️ **All code items are in `app/providers.tsx`, which neither batch 1 nor the status split touches — so
they can ship in their own deploy.** 🔴 **But a deploy is still an instant release to a shipped iOS app
and an in-review Play build, and batch 1 and the status split are uncommitted in the same tree** — so
"ships independently" means *logically*, not that the tree is clean.

---

## 10. What I cannot establish, and how to settle each

🔴 **I cannot see anything that is already stored in PostHog. Every question below needs the PostHog
UI, and the 30-day retention window means the answers are time-limited.**

| # | Unknown | What to look at |
|---|---|---|
| **1** | 🔴 **How many tokens are stored, and which trucks.** | **Activity → filter `$current_url` contains `/dashboard/`.** Export 30 days. **Every distinct token there is a live credential that must be rotated.** |
| **2** | **Whether `$web_vitals` events are firing** (§2 — the non-replay leg of `capture_performance`). | **Activity → event `$web_vitals`.** If present, check its `$current_url`. |
| **3** | 🔴 **Whether any `$referrer` contains `payment_intent_client_secret`** (§7). | **Activity → filter `$referrer` contains `payment_intent_client_secret` or `pi_`.** ⚠️ **Also test a 3DS card** (`4000 0027 6000 3184`) and watch the resulting event. |
| **4** | **Whether your "network capture ON" includes payload (body/header) capture.** | **Session Replay settings — the sub-toggles under network capture.** |
| **5** | **Whether replay was EVER enabled historically.** | **Session Replay → recordings list.** 🔴 **If any recording exists, assume operator screens with customer PII were captured.** |
| **6** | **Whether any `$autocapture` element text contains a customer name.** | **Activity → `$autocapture`, inspect `$el_text`.** `mask_all_text` is `false`, so order-card text is a plausible carrier. |
| **7** | **Whether `$ip` is stored server-side** despite `ip: false` client-side. | A single event's properties in the UI. |
| **8** | **Who has access to the PostHog project**, and whether tokens have already been viewed. | **Project members + access logs.** |
| **9** | **That any of this behaves as described.** | 🔴 **Nothing was run. This is a source and bundle read.** **Open DevTools on `/dashboard/<token>`, filter network to the PostHog host, and read one payload.** That single observation would confirm or refute §1–§4 in a minute. |
