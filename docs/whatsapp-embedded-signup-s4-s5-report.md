# S4 + S5 — the Embedded Signup launcher and the three server-to-server calls

**4 September 2026. Branch `whatsapp-connections-s1-s3`. NOT COMMITTED, not staged, not pushed, not deployed. No cap sync, native binary untouched. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

**Method per item:** 🔎 **SOURCE-READ** · 🧪 **EXECUTED** (I ran it) · 📄 **META DOCS** (fetched from developers.facebook.com this session). **I rendered nothing in a browser, and the flow has never been opened** — Meta requires HTTPS, which localhost is not.

⚠️ **No span of the prompt arrived garbled.** One instruction is in tension with Meta's own documentation — call 2 — and because it is a documentation conflict rather than two contradictory instructions, I built the call, made the skip explicit and one constant wide, and flagged it rather than stopping. **See "THE ONE THING I CHANGED THE SHAPE OF".**

---

# S4 — THE LAUNCHER

**New file: `lib/whatsapp/embedded-signup.ts`.** Client-only by construction — it loads Meta's SDK, opens the flow, and reports one outcome. It makes **no Graph call** and **stores nothing**.

## The SDK and the version question — three versions, three decisions

| Constant | Value | Where | Why it is separate |
|---|---|---|---|
| `SDK_GRAPH_VERSION` | **`v26.0`** | `embedded-signup.ts` (browser `FB.init`) | 📄 Meta: *"Set this to the latest API version"*. ⚠️ **Meta's own sample still prints `v25.0`** — reported, not copied; you established latest as v26.0. |
| `ONBOARDING_GRAPH_VERSION` | **`v21.0`** | `whatsapp-signup/route.ts` | 📄 Meta's tech-provider examples use `v21.0` for the exchange and register calls. |
| `GRAPH_API_VERSION` | **`v19.0`** | `lib/meta-whatsapp.ts:19` — **UNTOUCHED** | 🔴 **REPORTED, NOT CHANGED, AS INSTRUCTED.** Past its deprecation date and **shared by the live send path and both template calls**. Moving it changes customer-facing sends; that is not an S4 decision. |

🟢 **These three are independent and are allowed to differ.** Each carries a comment saying so, because the obvious "tidy-up" is to collapse them and that would silently move the live send path.

## 🔴 Coexistence — the parameter, and how confident I am in it

```js
extras: {
  setup: {},
  featureType: 'whatsapp_business_app_onboarding',
  sessionInfoVersion: '3',
}
```

**Why it is not optional here:** every food truck already has their number on flyers and in the WhatsApp Business app in the van. The **default** flow provisions a *new* Cloud API number — the wrong product for them.

📄 **What I established, and where:**
- **`developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation`** — fetched. Its `FB.login` sample shows **`extras: { setup: {} }` and does NOT name `featureType`.**
- **`…/embedded-signup/onboarding-business-app-users/`** — fetched. It states the requirement, that the customer must be on **WhatsApp Business app 2.24.17 or higher**, that you must *"use Embedded Signup with session logging"*, that the finish event is **`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`**, and that coexistence numbers have **a fixed throughput of 20 mps**. ⚠️ **The page as fetched did not render a code sample**, so I could not read the parameter off Meta's own page.
- The parameter name **`featureType: 'whatsapp_business_app_onboarding'`** and **`sessionInfoVersion: '3'`** came from **a web search result summarising that same Meta page**, not from the page body I could read.

🔴 **SAID PLAINLY: I could not confirm `featureType` verbatim from a Meta page I fetched.** It is consistent across sources and it is the only name in circulation, but **it is the single least-verified line in this build**, and the module says so at the point of use. **If the flow opens and offers to provision a NEW number instead of using the operator's own, this parameter is the first thing to check** — that is exactly what a wrong name looks like.

## Session logging — three payload shapes, all handled

📄 Meta's documented shapes, and 🔴 **the trap in them:**

```js
success      { type:'WA_EMBEDDED_SIGNUP', event:'<FINISH_TYPE>', data:{ waba_id, phone_number_id, business_id } }
abandonment  { type:'WA_EMBEDDED_SIGNUP', event:'CANCEL',        data:{ current_step } }
error        { type:'WA_EMBEDDED_SIGNUP', event:'CANCEL',        data:{ error_message, error_code, session_id } }
```

🔴 **ABANDONMENT AND ERRORS SHARE THE `CANCEL` EVENT.** They are told apart by their **data** — `error_code`/`error_message` present means an error — **not** by the event name. Keying on the event name silently reclassifies every Meta failure as "they changed their mind", which would make the diagnostics actively misleading. The listener branches on the data.

🟢 **Origin is checked** (`https://facebook.com` / `https://www.facebook.com`) — any window can post a message.
🟢 **Unknown finish types store rather than fail.** `finishType` is whatever `event` said; the column is free text.
🟢 **Two sources joined:** the `message` event carries the ids and finish type, the `FB.login` callback carries the code. They can arrive in either order; the callback always fires last, so the outcome is assembled there.
🟢 **The SDK loader is memoised** — two presses cannot inject two `<script>` tags — and **rejects loudly if the script is blocked** (ad blockers routinely block `connect.facebook.net`; a silent hang would be reported as "your site is broken").

## 🔴 Meta's four `console.log` lines are NOT reproduced

📄 Meta's sample carries exactly four, each marked `// remove after testing`:
```
console.log('message event: ', data);        console.log('message event: ', event.data);
console.log('response: ', code);             console.log('response: ', response);
```
Two of them print the payload and **the code**. 🧪 **Executed check:** `grep -nE "^\s*console\.[a-z]+\(" lib/whatsapp/embedded-signup.ts` → **NONE**, and the same grep across the new handler region of `page.tsx` → **NONE**. The only three matches for `console.` in the launcher are **comments explaining why the lines are absent**.

## The control

🟢 **Web-only, unchanged.** The whole card is still inside `{!isNativeApp() && (` at `page.tsx:9669`, with the redundant inner wrapper still in place. Nothing in S4 moved either.
🟢 **Still decoupled from `saveWhatsappSender`** — `onWhatsAppSetup` takes no arguments, reads no `lastSavedSender`, and has no value comparison. The only new guard is `if (setupBusy) return`, which is **re-entrancy** (a second press while Meta's window is open) and **can never make the first press do nothing** — the failure the S3 decoupling exists to prevent.
🟢 **Nothing is fabricated.** The result panel's text comes from the route, which **reads the state back out of the database** after writing; the button label flips because the row says so, not because the browser guessed.

⚠️ **Two stale comments corrected while I was in there** (both were factually wrong after S4): the "Connect does not yet connect anything — it saves a number" note, and the native-hide note claiming the button runs `saveWhatsappSender`. The first one's own stated condition (*"Once Embedded Signup exists, Connect becomes the PRIMARY action… swapping these two is correct"*) is now **met** — I recorded that and **did not make the swap**, because reordering a live operator surface is not in this brief.

---

# S5 — THE SERVER SIDE. THREE CALLS.

**New file: `app/api/manage/whatsapp-signup/route.ts`.** 📄 Endpoints, quoted from Meta's *"Onboarding business customers as a Tech Provider or Tech Partner"*:

```
1.  GET  https://graph.facebook.com/v21.0/oauth/access_token
         ?client_id=<APP_ID>&client_secret=<APP_SECRET>&code=<CODE>
2.  POST https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/register
         Authorization: Bearer <BUSINESS_TOKEN>
         { "messaging_product": "whatsapp", "pin": "<6 DIGITS>" }
3.  POST https://graph.facebook.com/<VERSION>/<WABA_ID>/subscribed_apps
         Authorization: Bearer <BUSINESS_TOKEN>
```

🔴 **Why app-level `account_update` does not cover 2 or 3:** the app subscription says which **fields** this app wants; **step 3 says which WABAs it wants them FROM.** Without step 3 the customer's messages never reach our webhook — **the connection looks perfect and answers nothing.**

## 🔴 No truck id from the body — the precedent, quoted

From `app/api/manage/whatsapp-preview/route.ts`, verbatim:

> **🔴 NO `truckId` IS ACCEPTED FROM THE REQUEST. THE TRUCK COMES FROM THE TOKEN.**
> `generateWhatsAppReply` reads `menu_items_db` with a SERVICE-ROLE client scoped by nothing but the `truckId` it is handed. A body-supplied id would therefore read any truck's menu. The token is the only identity this route trusts, exactly as `/api/manage` does.

**The same reasoning, one notch worse: this route WRITES.** A body-supplied id would let anyone holding any dashboard token bind a live Meta credential onto **another truck's** row.

🧪 **Executed (Proof H):** posted `{ ...complete, truckId: 'some-other-truck', truck_id: 'some-other-truck' }` → **rows written under `["pizzeria-gusto"]`** (the token's truck) and nothing else.
🔎 **Source:** `grep -nE "body\.truckId|body\.truck_id|body\['truck"` → the only match is **the comment saying there is none**. Every `truck_id` in the file is `truck.id`, resolved from `.eq('dashboard_token', token).single()`.

## 🔴 The 30-second code

**No queue, no confirmation step, no user interaction between capture and exchange.** The browser posts the moment `launchEmbeddedSignup` resolves; the route's first Graph call is the exchange. Configuration is checked **before** the exchange, deliberately — discovering a missing env var *after* burning the code costs the operator a second run of the whole wizard for a fault that is entirely ours.

**If the exchange fails, the code is dead.** 🧪 **Executed (Proof E):** status **502**, nothing written (**`✅ no row`**), and the operator sees, in plain words:

> *"That took too long and the one-time code from Meta expired. Nothing was saved. Press Set up and run through it again — it should only take a minute."*

**Not a silent failure, and not a retry** — a retry seconds later is guaranteed to fail too.

## 🔴 Partial failure: the two-phase write

This is the answer to *"if call 2 or 3 fails after the token is stored, what state is the row in?"* — and it is why the state machine has `onboarding_incomplete` at all.

- **Phase A**, immediately after the exchange: `waba_id`, `business_id`, `finish_type`, **encrypted token**, `token_expires_at` — and **`phone_number_id: null`**.
- **Phase B**, only after calls 2 and 3 succeed: `phone_number_id`.

**Rejected alternatives, and why:**
- *Write everything up front* → a row deriving **`ready`** while the WABA is **not subscribed**. `ready` means "we can send"; a truck that receives nothing is not ready. **That is a fabricated connected state.**
- *Write nothing until all three succeed* → **discards a token we cannot get again.** The code is spent; a step-3 hiccup would cost the operator the whole wizard.

🧪 **Executed (Proof C)** — call 3 forced to fail:
```
row: phone_number_id=null   token kept=true
→ state onboarding_incomplete   send=false   offerReconnect=true
operator sees: "Your account is linked but Meta would not turn on message delivery.
                Your setup is saved — please contact support rather than running it again."
```
🟢 **Not sendable, token preserved, "Reconnect" offered, and the operator is told NOT to re-run** — re-running burns another wizard for something support can fix in one query.

## 🔴 Idempotency

`upsert` on the **`truck_id` PRIMARY KEY**. 🧪 **Executed (Proof F):** ran the whole flow twice →
```
rows in table: 1        upsert calls: 2, update calls: 2
ciphertext re-encrypted (fresh IV, so differs): true        final state: ready
```
🟢 **Cannot duplicate. Cannot half-write** — the CHECK constraint refuses ciphertext without an expiry in the same statement, so a torn write is rejected by Postgres rather than stored.

## 🔴 Duplicate `phone_number_id` — the partial unique index

🧪 **Executed (Proof D)** — Phase B returns `23505`:
```
state: onboarding_incomplete
operator sees: "That WhatsApp number is already connected to another HatchGrab account.
                A number can only answer for one truck. Contact support and we will move it across."
```
🟢 **Named, not generic.** This is a real case — one operator with two trucks and one WhatsApp number, or a number moved between accounts. A "write failed" would send support hunting through Postgres logs.

## 🔴 The token and the code never reach a log line

🧪 **EXECUTED, on success and on both failure paths**, with `console.log/info/warn/error/debug/trace` all captured and scanned for the code, the token, the app secret **and their base64**:

```
SUCCESS      ✅ absent: the one-time CODE  ✅ absent: the business TOKEN  ✅ absent: the APP SECRET
             [whatsapp-signup] connection established {"truck_id":"pizzeria-gusto",
               "finish_type":"FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING","coexistence":true,
               "register_skipped":"coexistence: number already registered"}

EXCHANGE FAILURE — with the CODE echoed back inside Meta's error body:
             ✅ absent: CODE   ✅ absent: TOKEN   ✅ absent: APP SECRET
             [whatsapp-signup] code exchange failed {"truck_id":"pizzeria-gusto","status":400,
               "code":"100","type":"OAuthException"}

CALL-3 FAILURE — with the TOKEN echoed back inside Meta's error body:
             ✅ absent: CODE   ✅ absent: TOKEN   ✅ absent: APP SECRET
```

🔴 **The adversarial part is the two "echoed back" cases.** I scripted Meta to return an error body **containing the secret**, because that is how this leaks in real life. `redactGraphError()` is the single funnel: **only `error.code` and `error.type` survive; the message never does.** And a thrown fetch is logged as `(e as Error).message` only — never spread or serialised — because a fetch error can carry the request URL, and **that URL holds both the app secret and the code**.

🟢 **No prefix, no length, no "first six characters" anywhere.**

## The client payload

🧪 **Executed (Proof A2):**
```json
{"ok":true,"state":"ready",
 "connection":{"state":"ready","offerSignup":false,"offerReauthorise":false,"expiringSoon":false},
 "message":"WhatsApp is connected. Auto-replies will start answering messages to this number."}
```
✅ absent: the code · ✅ absent: the token · ✅ absent: the app secret · ✅ absent: any ciphertext or id field.

🟢 **`connection` is the S2 view, produced by the same `readWhatsAppConnection`** the Manage payload uses — so this route **cannot invent a richer, leakier shape of its own**, and the browser updates its state from the database rather than from a guess.

## The state machine, on a row this route actually wrote

🧪 **Executed (Proof B):**
```
after phase A + B → ready   send=true
token_expires_at is 60 days out (60-day lifetime)
payment_method_present written as null   (UNREAD — never false)
token stored as ciphertext (v1. envelope): true
🔴 plaintext token in the stored row? ✅ NO
```

## Abandonment and errors — logged, never discarded

🧪 **Executed (Proof G):** both post to the same route, resolve the truck from the token, **write nothing** (`rows written: 0`), and log:
```
[whatsapp-signup] flow did not complete {"truck_id":"pizzeria-gusto","kind":"abandoned",
  "current_step":"PHONE_NUMBER","error_code":null,"error_message":null,"session_id":"sess-1"}
[whatsapp-signup] flow did not complete {"truck_id":"pizzeria-gusto","kind":"error",
  "current_step":null,"error_code":"3","error_message":"Something went wrong","session_id":"sess-2"}
```
⚠️ **THEY GO TO THE SERVER LOG, NOT TO A TABLE.** No table exists for them and this workstream is **not** adding an unrequested migration. **Vercel's log retention is therefore the retention.** If these need to outlive that, they need a table and a migration you apply by hand.

---

# 🔴 THE ONE THING I CHANGED THE SHAPE OF — CALL 2, AND WHY

The brief says three calls. 📄 **Meta's own coexistence page says the opposite for our only supported case:**

> *"skip the phone number registration step, as the number is already registered."*

**Every truck we onboard is coexistence** — that is the requirement this whole workstream was scoped against. So for our real traffic, call 2 is not merely redundant: **re-registering an operator's live WhatsApp Business number is the one call in this file that could disturb the phone in their van.**

**What I built rather than choosing silently:**
- **The call is implemented in full** and **runs for every non-coexistence finish type** (`FINISH`, `FINISH_ONLY_WABA`, `FINISH_OBO_MIGRATION`, `FINISH_GRANT_ONLY_API_ACCESS`).
- It is skipped **only** when `finish_type === FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, gated by one constant: **`const SKIP_REGISTER_FOR_COEXISTENCE = true`**. Flip it to `false` and the call is unconditional.
- 🧪 **Executed:** the coexistence happy path makes exactly **`["GET v21.0/oauth/access_token", "POST v21.0/WABA-77/subscribed_apps"]`** — two Graph calls, and the skip is recorded in the success log line.

🔴 **AND A CREDENTIAL I REFUSED TO INVENT.** Registration requires a **6-digit two-step-verification PIN**. There is no column for it and no environment value. Generating a random PIN nobody can ever recover would be inventing a credential and losing it in the same statement. So the route reads **`WHATSAPP_REGISTRATION_PIN`** (server-only, **new name, no value set by me**) and, if it is absent or not six digits, **stops, keeps the token, leaves the row at `onboarding_incomplete`** and tells the operator support will finish it. ⚠️ **A single platform-wide PIN across all trucks is a real trade-off** — it is what most BSPs do, and the alternative is a per-truck PIN column and a migration. Your call, not mine.

---

# CONFIGURATION

| Variable | Scope | Status |
|---|---|---|
| `NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID` | client | already set — `2892063604490064` |
| `NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID` | client | **added to `.env.local` this session** — `2196172484540444`. 🟢 Correctly `NEXT_PUBLIC_`: **not a secret**, and Meta's own `FB.init` puts it in client JavaScript. |
| `WHATSAPP_TOKEN_ENCRYPTION_KEY` | 🔴 server-only | already set. Never `NEXT_PUBLIC_`. |
| `META_WHATSAPP_APP_SECRET` | 🔴 server-only | **🔴 NOT DEFINED IN `.env.local` — verified, 0 occurrences.** See below. |
| `WHATSAPP_REGISTRATION_PIN` | 🔴 server-only | **NEW NAME. NOT SET. I did not invent a value.** Only needed for non-coexistence onboarding. |

🔴 **`META_WHATSAPP_APP_SECRET` IS MISSING LOCALLY AND THAT WILL BITE.** `.env.local` defines **`META_APP_SECRET`** instead. The WhatsApp webhook already refuses a fallback chain for exactly this reason and records that **production/Vercel defines `META_WHATSAPP_APP_SECRET`** — so this route uses that name and no fallback. **On localhost the route will return `not_configured` before it ever calls Meta**, which is the correct behaviour but will read as "the button doesn't work" if you are not expecting it.

⚠️ **`META_WHATSAPP_APP_SECRET` is a comma-separated list** (`parseMetaAppSecrets`, for signature verification across a rotation). The exchange needs exactly **one** secret, belonging to app `2196172484540444`. **The first entry is used**, and the route logs a warning (no secret) if the list has more than one. 🔴 **I cannot tell from here which entry belongs to which app** — if that list ever carries two, check it, because a wrong secret fails the exchange and kills the code.

⚠️ **A variable set in Vercel is not a variable in the running deployment until a redeploy.**

---

# VERIFICATION SUMMARY

| Check | Method | Result |
|---|---|---|
| `npx tsc --noEmit` | 🧪 Executed | **exit 0, clean** |
| `findPlanParityViolations()` | 🧪 Executed on the real module | **0 violations** |
| No token/code/secret in the client payload | 🧪 Executed (A2) | ✅ |
| No token/code/secret in ANY log line — success | 🧪 Executed (A3) | ✅ |
| …on exchange failure, with the code echoed by Meta | 🧪 Executed (E) | ✅ |
| …on call-3 failure, with the token echoed by Meta | 🧪 Executed (C) | ✅ |
| State machine derives from a row the route wrote | 🧪 Executed (B) | `ready`, 60 days, `payment_method_present: null` |
| Duplicate `phone_number_id` → specific error | 🧪 Executed (D) | ✅ named, not generic |
| Partial failure leaves `onboarding_incomplete` | 🧪 Executed (C) | ✅ not sendable, token kept |
| Idempotent re-run | 🧪 Executed (F) | ✅ 1 row |
| Body-supplied truck id ignored | 🧪 Executed (H) + 🔎 grep | ✅ |
| Meta's four `console.log` lines absent | 🧪 Executed grep | ✅ zero executable `console.` in the launcher |
| Card still web-only | 🔎 Source-read | wrapper unchanged |
| The flow actually opening | ❌ **NOT DONE** | needs HTTPS — see below |

**The harness ran the REAL route module** (`app/api/manage/whatsapp-signup/route.ts`, copied with only its import specifiers rewritten so Node can resolve them) against a scripted Graph and a recording Supabase client. It is not a re-implementation.

---

# SAFARI ON macOS — CLICK-THROUGH

⚠️ **I rendered none of this.** Dev server on **:3000**, hard-refresh (⌘⇧R).

### 🔴 WHAT CANNOT BE RUN ON LOCALHOST — READ THIS FIRST

**Meta requires HTTPS for Embedded Signup domains.** So on `http://localhost:3000`:
- **Steps 4–8 below cannot be run at all.** The flow will not open, or Meta will refuse the domain.
- **Even if it did open, the exchange would fail** — `META_WHATSAPP_APP_SECRET` is not in `.env.local`, so the route returns `not_configured` before calling Meta.
- **Steps 1–3 are the only ones localhost can prove**, and they only prove the control renders and fires.

**Steps 4–8 need the HTTPS address you are arranging**, and that address must be added to the app's allowed domains in Meta's dashboard — **which I cannot check.**

1. **Settings loads** — `http://localhost:3000/manage/<dashboard_token>` → Settings. **See:** the page renders. **Wrong if** it errors — the connection read must degrade, never throw.
2. **The card** — **See:** "Auto-replies", the preview, Channels, the cap line, then the WhatsApp row: an editable number input and an orange **Set up** button. **Wrong if** it still says "Connect".
3. **Press Set up without touching the number.** **See:** the button briefly reads **"Opening…"**, then a **red** panel — on localhost, either *"Meta's setup window could not be opened"* or *"WhatsApp setup is not available right now"*. 🔴 **Wrong if you get a "WhatsApp number saved" toast** — that is the S3 landmine and would mean the button is wired back to the save.
4. **Save still works** — edit the number, click outside (blur). **See:** "WhatsApp number saved". Unchanged by S4.
5. 🔴 **HTTPS ONLY — the flow opens.** Press **Set up**. **See:** Meta's Embedded Signup window. **Wrong if** it offers to **provision a new number** rather than using the operator's own — that is the `featureType` parameter, the least-verified line in this build.
6. 🔴 **HTTPS ONLY — abandonment.** Open the flow, close it partway. **See:** an **amber** panel, *"Setup was closed before it finished. Nothing was changed."* **And check the server log** for `flow did not complete` with the `current_step` you left on.
7. 🔴 **HTTPS ONLY — completion.** Finish the flow on Pizzeria Gusto's own WhatsApp Business number. **See:** a **green** panel, *"WhatsApp is connected…"*, and the button stays **Set up** (state `ready` offers no reconnect). **Wrong if** the panel is green but the row in `whatsapp_connections` has a null `phone_number_id` — that combination cannot happen and would mean the two-phase write is broken.
8. 🔴 **HTTPS ONLY — coexistence held.** After step 7, send a WhatsApp to that number **from a different phone**, and confirm the message **still appears in the operator's WhatsApp Business app**. **This is the requirement.** If the app stops receiving, coexistence did not take.
9. **Native:** the whole card must be **absent** on iPad/Android. Source-confirmed only.

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 files staged. No commit, no push, no deploy.**

**ADDED this stage (untracked):**
1. `lib/whatsapp/embedded-signup.ts` — the S4 launcher
2. `app/api/manage/whatsapp-signup/route.ts` — the S5 three-call route

**MODIFIED this stage:**
| File | Change |
|---|---|
| `app/manage/[token]/page.tsx` | launcher import; `onWhatsAppSetup` now opens the flow and posts the outcome; `setupBusy` + tri-tone `setupNotice`; `onConnectionUpdate` prop threaded from the parent; two stale comments corrected |

**Untouched, verified this run:**
| Group | Diff | Status |
|---|---|---|
| Pre-existing six (`app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `ios/…/project.pbxproj`, `lib/custom-domain/copy.ts`, `proxy.ts`, `vercel.json`) | **6 files, 52+/56−** | 🟢 **byte-for-byte identical to every prior check** |
| Copy workstream (`lib/plan-features.ts`, `app/landing/page.tsx`, `lib/landing-table.ts`, `lib/meta/webhook-signature.ts`) | **4 files, 142+/49−** | 🟢 **unchanged since the FK-fix report** |
| `docs/reference-manual.md` | 1 file, 565+/4− | 🟢 unchanged |
| S1–S3 files (`lib/whatsapp/connection-state.ts`, `connection-read.ts`, `token-crypto.ts`, `app/api/manage/route.ts`, the migration) | — | 🟢 **not touched by S4/S5** |
| Outreach files, `app/order/[id]/page.tsx`, `lib/outreach.ts`, `lib/whatsapp-hint.ts`, outreach migrations, docs | — | 🟢 still untracked, unstaged |

`.env.local` gained one line (`NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID`). 🟢 **It is gitignored — verified, 0 git entries.**

---

# WHAT I COULD NOT READ OR VERIFY

**In Meta's documentation:**
- 🔴 **`featureType: 'whatsapp_business_app_onboarding'` could not be confirmed verbatim from a Meta page I fetched.** The implementation page shows an empty `setup: {}`; the coexistence page describes the requirement but did not render its code sample. The name came from a search summary of that page. **This is the least-verified line in the build and it is the one that decides whether coexistence works.**
- 🔴 **`sessionInfoVersion: '3'`** — same provenance, same caveat.
- ⚠️ **The finish-type list** (`FINISH`, `FINISH_ONLY_WABA`, `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, `FINISH_OBO_MIGRATION`, `FINISH_GRANT_ONLY_API_ACCESS`) came from the v4 spec page. The column stores free text, so an addition cannot break us.
- ⚠️ **Meta's tech-provider page pins `v21.0` in its examples**; whether that is current guidance or a stale sample, I cannot tell.
- ⚠️ **The `register` PIN semantics** — whether a per-number PIN is required or a platform PIN is acceptable — I did not establish.

**In Meta's dashboard — none of it. I have no admin session there:**
- 🔴 Whether the HTTPS address you arrange is in the app's **allowed domains**. Without it the flow will not open, and that is a dashboard setting.
- 🔴 That the app is still in **Development mode** and that you, as admin/developer/tester, will see `whatsapp_business_management` in the authorization screen. Taken from your statement, not read.
- 🔴 Whether `account_update` is genuinely subscribed at app level. Taken from your statement.
- 🔴 Which app secret sits in `META_WHATSAPP_APP_SECRET` in production, and whether it belongs to app `2196172484540444`.

**In this repo / environment:**
- 🔴 **No part of the flow has ever been opened.** Every S4 statement is source-read; every S5 statement is executed **against a scripted Graph**, not against Meta. **No real Meta call has been made by this code, ever.**
- 🔴 **The route has never run inside Next.js.** The harness ran the module directly with stubbed `next/server` and Supabase. Route-level concerns — `runtime = 'nodejs'`, `maxDuration`, request parsing — are **source-read only**.
- 🔴 **`lib/whatsapp/token-crypto.ts` has now been EXECUTED for the first time** (the harness set a key and the route encrypted a token, round-tripping through the `v1.` envelope). ⚠️ That was with a **harness key**, not yours — `decryptToken` still has no caller in the repo, because the send path is S7.
- 🔴 **Nothing was rendered in a browser**, so I am not claiming any panel, colour or button label looks right — only that the code produces those values.
- ⚠️ **No rate limit on the new route.** The sibling preview route carries one (30/hour, keyed on the truck); this one does not, because a signup is not a repeatable spend and every path is token-gated. **Named so it is a decision, not an oversight.**
- ⚠️ **`WHATSAPP_REGISTRATION_PIN` has never been exercised** — no value is set, so the non-coexistence branch has only ever taken its refusal path in testing.

# FLAGS

- ⚠️ **No span of the prompt arrived garbled.**
- 🔴 **Call 2 is skipped for coexistence, on Meta's instruction, against the brief's "three calls" wording.** One constant wide, fully implemented, flagged rather than chosen silently. **If you want it unconditional, say so and it is a one-word change.**
- 🔴 **`featureType` is the least-verified line in this build.** Check it the first time the flow opens.
- 🔴 **`META_WHATSAPP_APP_SECRET` is absent from `.env.local`** — setup will refuse on localhost before calling Meta.
- ⚠️ **`GRAPH_API_VERSION = 'v19.0'` remains past deprecation and shared with the template calls.** Reported, unchanged, as instructed.
- ⚠️ **Abandonment and error diagnostics live in the platform log, not a table.**

*Nothing committed. Nothing staged. `main` = `2ca66cd`. No Meta call has ever been made by this code.*
