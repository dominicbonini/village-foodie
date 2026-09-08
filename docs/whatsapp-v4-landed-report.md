# Embedded Signup v4 — LANDED

**4 September 2026. Branch `whatsapp-connections-s1-s3`. NOT COMMITTED, not staged, not pushed, not deployed. No cap sync, native binary untouched. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

**Method:** 🔎 SOURCE-READ · 🧪 EXECUTED · 📄 META DOCS (fetched this session) · 🛠️ **META TOOLING** (the Integration Helper output you supplied).

⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# TASK 1 — THE SWITCH ✅

## The extras object

```js
extras: {
  setup: {},
  featureType: 'whatsapp_business_app_onboarding',
  sessionInfoVersion: '3',
  version: 'v4',
}
```

🔴 **`version: 'v4'` is explicit and load-bearing, and the comment at the site says exactly why:** Meta determines the version *inside* extras, so **omitting the key does not default to the latest — it silently selects v2**, which Meta deprecates on **15 October 2026**. No error, no warning; the flow just runs an old version until the day it stops running at all.

### 🔴 Does Meta's URI include `setup`? **NO — and I kept it anyway.**

The decoded URI is exactly three keys:
```json
{"featureType":"whatsapp_business_app_onboarding","sessionInfoVersion":"3","version":"v4"}
```

**I kept `setup: {}`. Three reasons, and the reasoning is in the code at the line:**
1. 📄 It is **still in the current implementation page's `FB.login` sample** (`extras: { setup: {} }`) — the page that documents the call I am actually making.
2. It is an **empty object**. It carries no data and can change no behaviour; the only thing it can do is be ignored.
3. 🔴 **The generated URI is the LANDING-PAGE form of the flow** (`business.facebook.com/messaging/whatsapp/onboard/?…`), not the `FB.login` form. **An omission there is not evidence that `FB.login` rejects the key.** Given a disagreement I cannot test without HTTPS, keeping the documented key is the lower-risk half: a spurious empty object is inert, whereas dropping a required one breaks the flow.

⚠️ **If the flow refuses to open on the HTTPS host, `setup: {}` is the first thing to remove** — it is one line, and that is the only hypothesis this choice leaves open.

## The configuration id

**Variable: `NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID`** — now `1544768623597981`, in `.env.local` (gitignored, 🧪 verified 0 git entries). 🟢 Correctly `NEXT_PUBLIC_`: not a secret, and Meta's own tooling puts it in a URL.

🧪 **Executed** — `grep -rn "2892063604490064" app lib components .env.local`:
- 🟢 **The old id is not used by any code.** Two matches remain and **both are prose**: a line in `.env.local` recording *why* the id changed, and `lib/whatsapp/connection-state.ts:54` where it is cited as the provenance of the 60-day token claim (see the finding below).
- 🟢 **The old configuration is untouched at Meta.** Nothing in this change deletes or modifies it; the launcher simply stops pointing at it.

## Versions — four pins, all independent

| Constant | Value | Where | Status |
|---|---|---|---|
| `EMBEDDED_SIGNUP_VERSION` | **`v4`** | `embedded-signup.ts:66` | 🟢 **NEW — this is what lands v4** |
| `SESSION_INFO_VERSION` | `3` | `embedded-signup.ts:60` | kept (present in Meta's v4 URI) |
| `SDK_GRAPH_VERSION` | **`v26.0`** | `embedded-signup.ts:75` | 🟢 unchanged, as instructed |
| `ONBOARDING_GRAPH_VERSION` | `v21.0` | `whatsapp-signup/route.ts:54` | unchanged |
| `GRAPH_API_VERSION` | **`v19.0`** | `lib/meta-whatsapp.ts:19` | 🔴 **REPORTED, NOT CHANGED, AS INSTRUCTED.** Past deprecation, **shared by the live send path and both template calls**. |

## Session logging — all three handlers kept

🔎 Success, abandonment and user-reported error are all still handled, and 📄 the Versions table's v4 row says session info is **"Sent back for all flows"** — so all three fire without depending on `sessionInfoVersion`. 🔴 The trap is unchanged and still guarded: **abandonment and errors share the `CANCEL` event** and are told apart by their *data* (`error_code`/`error_message` present ⇒ error), never by the event name.

## 🔴 THE PROVENANCE NOTE — the most important thing in this change

The module header now records, at length, that **this shape came from Meta's Integration Helper and NOT from Meta's documentation**, quotes the Versions page's contradicting `extras: {} // purposely empty for v4`, and states the consequence in plain terms:

> A reader who finds that page will "correct" the four keys to an empty object, and because the version is determined **inside** extras, that silently drops this build to v2.

It also records that this is **the fourth documentation-versus-dashboard disagreement in this workstream**, and the rule that settled it: **where they conflict, the artefact Meta's own systems generated for this app and this configuration wins; the page is only a description of it.**

⚠️ **And my earlier hypothesis is recorded as wrong**, not quietly dropped: I proposed that coexistence had moved into the login configuration under v4. It has not — the Builder exposes a **Feature Type** selector and the parameter is still in `extras`.

---

# TASK 2 — WHAT IS PROVEN AND WHAT IS NOT

## 🟢 PROVEN — the extras shape v4 accepts

🛠️ **From Meta's own generated landing URI**, with config `1544768623597981` and Feature Type `whatsapp_business_app_onboarding`:
```
{"featureType":"whatsapp_business_app_onboarding","sessionInfoVersion":"3","version":"v4"}
```
**v4 takes `featureType` AND `sessionInfoVersion` AND an explicit `version`.** 🔴 **Meta's Versions page is wrong**, not merely ambiguous — the two sentences do not reconcile, one of them is simply stale. That is now recorded in the code so nobody re-derives it.

🟢 **Also proven by the Builder screen:** the v4 configuration **exposes a Feature Type selector with `whatsapp_business_app_onboarding` available** — so coexistence is reachable in v4 and is set in `extras`.

## 🔴 NOT PROVEN — that coexistence actually ENGAGES

The flow was opened and **refused a personal number.** 🔴 **That refusal proves nothing about coexistence.** It is correct behaviour on *both* paths:
- 📄 Coexistence requires the customer to be on **WhatsApp Business app 2.24.17 or higher** — a personal WhatsApp account is not that.
- Standard onboarding would refuse the same number anyway, because it is already registered to consumer WhatsApp.

**The two paths are indistinguishable at that point.** A refusal is not evidence.

## 🟢 WHAT WOULD PROVE IT — one screen

📄 Meta's own test, from the coexistence page:

> *"If the WABA selection screen has been replaced with a screen that gives you the option to connect your existing WhatsApp Business account, the feature is enabled."*

**So: open the flow on the HTTPS host with a number that is genuinely on WhatsApp Business app 2.24.17+, and look at the WABA step.**
- ✅ **Coexistence engaged** if it offers to **connect an existing WhatsApp Business account**.
- 🔴 **Coexistence NOT engaged** if it asks you to **create or select a WABA** — that is the default flow, and it will provision a new number.

🔴 **I cannot run this.** It needs HTTPS, a real WhatsApp Business app number, and the host on Meta's allowed domains.

---

# TASK 3 — 🔴 THE 24-HOUR HISTORY SYNC IS NOT BUILT

## 🔴 NOTHING IN THIS BUILD SYNCHRONISES ANYTHING

🧪 **Executed** — `grep -rn "smb_app_data\|smb_app_state_sync\|smb_message_echoes\|sync_type" app lib` → **NONE.** No call, no handler, no field.

## The endpoint — 📄 established from a Meta page I fetched

From `…/embedded-signup/onboarding-business-app-users/`:

> **"After you onboard the business customer, you have 24 hours to synchronize their contacts and messaging history, otherwise they must be offboarded and complete the flow again."**

**Two calls, same endpoint, different `sync_type`:**
```
POST https://graph.facebook.com/<API_VERSION>/<BUSINESS_PHONE_NUMBER_ID>/smb_app_data
  { "messaging_product": "whatsapp", "sync_type": "smb_app_state_sync" }   ← contacts
  { "messaging_product": "whatsapp", "sync_type": "history" }              ← message history
```

**And three webhook fields carry the results:**
- `smb_app_state_sync` — contacts from the business's address book
- `history` — past messages (or an error if the business declined history sharing)
- `smb_message_echoes` — **new messages the operator sends from the WhatsApp Business app after onboarding**

## 🔴 What an operator loses if it never runs

1. **The recovery is not "run it later" — it is "start again".** 📄 *"If you need to perform it again, the customer must first offboard, then complete the Embedded Signup flow again."* After 24 hours the window is **gone**, and the only fix is to make the operator redo the whole wizard. **This is a silent, irreversible 24-hour deadline that starts the moment our route returns `ready`.**
2. **No contacts and no history on the API side.** The messages stay visible in the operator's own app — coexistence still works for *them* — but our side starts blank.
3. 🔴 **THE ONE THAT AFFECTS CUSTOMERS, AND IT IS NOT ABOUT HISTORY.** `smb_message_echoes` is how we would learn that **the operator already answered from their phone**. 🔎 **Verified in code:** the webhook reads `entry.changes[0].value.messages` and nothing else (`app/api/webhooks/meta/whatsapp/route.ts:136-138`); anything without `messages` hits `if (!messages?.length) return NextResponse.json({ ok: true })` and is **silently dropped**. So an echo field would be discarded even if it arrived. **Consequence: an operator who replies personally from the van, and our auto-reply, can both answer the same customer — the customer gets answered twice, and the second answer is a robot repeating what a human just said.** That is the coexistence failure mode most likely to be noticed, and it is a *messaging* problem, not a *history* problem.

⚠️ **NOT BUILT, AS INSTRUCTED — reported so it is a decision.** My read: the 24-hour window is the urgent half (it expires and cannot be recovered), and `smb_message_echoes` handling is the half that affects customers. **Both need a decision before a real truck is onboarded**, because the clock starts at the first successful signup.

---

# 🔴 A FINDING THE CONFIG SWITCH SURFACED — THE 60-DAY LIFETIME IS NO LONGER EVIDENCED

`token_expires_at` is computed from `TOKEN_LIFETIME_DAYS = 60`. That 60 came from **one specific fact: the old config `2892063604490064` was created from Meta's "WhatsApp Embedded Signup Configuration With 60 Expiration Token" template.**

🔴 **The new config `1544768623597981` was created by selecting PRODUCTS — not from that template.** Nobody has established what token lifetime it issues. **The 60 days is now an assumption, not a fact**, and it is load-bearing: it drives `token_expires_at`, the `revoked` derivation on elapsed expiry, and the 14-day reauthorisation prompt.

**The failure is asymmetric:** guess 60 when the real life is **shorter** and a truck **goes silent before we ever prompt them**; guess 60 when it is **longer** and we merely ask them to reconnect early. **Only one of those is bad.**

🟢 **The fix is small and the data is already in hand:** `/oauth/access_token` returns **`expires_in`** (seconds) when a token is not permanent — **the exchange response already carries the answer and we throw it away.** 🔴 **Deliberately NOT changed here**, because it is a behaviour change to the storage path and this stage was scoped to landing v4. Recorded at both sites (`connection-state.ts` and `TOKEN_LIFETIME_DAYS`) so it is a decision, not a rot.

---

# VERIFICATION

| Check | Method | Result |
|---|---|---|
| `npx tsc --noEmit` | 🧪 Executed | **exit 0, clean** |
| `findPlanParityViolations()` | 🧪 Executed on the real module | **0 violations** |
| No token/code/secret in the client payload | 🧪 Executed (A2) | ✅ |
| No token/code/secret in ANY log line — success | 🧪 Executed (A3) | ✅ |
| …exchange failure, **code echoed in Meta's error body** | 🧪 Executed (E) | ✅ only `status`/`code`/`type` survive |
| …call-3 failure, **token echoed in Meta's error body** | 🧪 Executed (C) | ✅ |
| State machine derives from a row this route wrote | 🧪 Executed (B) | `ready`, send=true, expiry 60 days out, `payment_method_present: null` |
| Duplicate `phone_number_id` → specific error | 🧪 Executed (D) | ✅ *"already connected to another HatchGrab account…"* |
| Partial failure → `onboarding_incomplete`, never `ready` | 🧪 Executed (C) | ✅ token kept, send=false, Reconnect offered |
| Idempotent re-run | 🧪 Executed (F) | ✅ 1 row, re-encrypted |
| Abandonment + error logged, write nothing | 🧪 Executed (G) | ✅ 0 rows |
| Body-supplied truck id ignored | 🧪 Executed (H) + 🔎 grep | ✅ written against the token's truck only |
| **Finish-type map, all seven cases** | 🧪 Executed (I) | ✅ table below |
| Old config id absent from code | 🧪 Executed grep | ✅ prose only |
| Nothing syncs history | 🧪 Executed grep | 🔴 confirmed absent |
| Webhook drops non-`messages` fields | 🔎 Source-read | `route.ts:136-138` |
| `GRAPH_API_VERSION` still `v19.0` | 🔎 Source-read | ✅ unchanged |
| **The v4 flow opening** | ❌ **NOT DONE** | needs HTTPS |

**Proof I — the finish-type map, re-run against the current source:**

| Finish type | Call 2 | Call 3 | State |
|---|---|---|---|
| `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` | **no** | YES | `ready` (send=true) |
| `FINISH` | **YES** | YES | `ready` (send=true) |
| `FINISH_OBO_MIGRATION` | **YES** | YES | `ready` (send=true) |
| `FINISH_ONLY_WABA` | no | no | `onboarding_incomplete` (send=false) |
| `FINISH_GRANT_ONLY_API_ACCESS` | no | no | `onboarding_incomplete` (send=false) |
| unknown (`FINISH_SOMETHING_META_ADDED_LATER`) | **YES** | YES | `ready` — stored verbatim |
| empty / absent | **YES** | YES | `ready` — stored as `null` |

**The harness runs the REAL modules** — `whatsapp-signup/route.ts`, `connection-read.ts`, `connection-state.ts`, `token-crypto.ts`, `embedded-signup.ts` — copied with only their import specifiers rewritten so Node can resolve them. Not a re-implementation.

⚠️ **All S4 launcher statements are SOURCE-READ.** The `extras` object has never been sent to Meta: it needs HTTPS, and no browser rendered any of this.

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 staged. No commit, no push, no deploy.**

**MODIFIED this stage — three code files plus `.env.local`:**
| File | Change |
|---|---|
| `lib/whatsapp/embedded-signup.ts` | v2/blocked note replaced with the v4 provenance note; `EMBEDDED_SIGNUP_VERSION = 'v4'` added; `extras` gains `version` |
| `app/api/manage/whatsapp-signup/route.ts` | `TOKEN_LIFETIME_DAYS` — the 60-day claim marked unevidenced, with the `expires_in` fix named |
| `lib/whatsapp/connection-state.ts` | same finding recorded on `tokenExpiresAt` (+63 lines total on this file across the workstream) |
| `.env.local` | `NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID` → `1544768623597981` (gitignored) |

**🟢 Untouched, verified this run:**
| Group | Diff | Status |
|---|---|---|
| **Pre-existing six** — `app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `ios/App/App.xcodeproj/project.pbxproj`, `lib/custom-domain/copy.ts`, `proxy.ts`, `vercel.json` | **6 files, 52+/56−** | 🟢 **byte-for-byte identical to every prior check** — the order scan-route rename, the derivation extraction and the `ios/` project file all unchanged |
| **Copy workstream** — `lib/plan-features.ts`, `app/landing/page.tsx`, `lib/landing-table.ts`, `lib/meta/webhook-signature.ts` | **4 files, 142+/49−** | 🟢 **unchanged** |
| `docs/reference-manual.md` | 565+/4− | 🟢 unchanged |
| `app/manage/[token]/page.tsx`, `app/api/manage/route.ts`, `connection-read.ts`, `token-crypto.ts`, the migration | — | 🟢 **not touched this stage** |
| Outreach files, `app/order/[id]/page.tsx`, `lib/outreach.ts`, `lib/whatsapp-hint.ts`, outreach migrations, docs | — | 🟢 still untracked, unstaged |

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **The v4 flow has never been opened with these extras.** Needs HTTPS. **Every S4 statement is source-read**, and the `extras` object has never been sent to Meta by this code.
- 🔴 **Coexistence engagement is unproven** — see Task 2. The personal-number refusal does not discriminate.
- 🔴 **Whether `setup: {}` is accepted, ignored, or rejected by a v4 `FB.login`.** Meta's URI omits it; the implementation page's sample keeps it. I chose the documented key and named the one-line fallback.
- 🔴 **What token lifetime config `1544768623597981` actually issues.** The 60 days is now an assumption; `expires_in` on the exchange response would settle it.
- 🔴 **Meta's dashboard — none of it.** Whether the HTTPS host is on the allowed domains, whether the coexistence webhook topic fields are subscribed at app level (📄 the coexistence page's Step 1), and that the app is still in Development mode. All taken from your statements.
- 🔴 **The v4 success-payload field list.** 📄 The v4 page returned "NOT PRESENT" for payload shapes. The handlers assume the v2/v3 shape (`waba_id`, `phone_number_id`, `business_id`). ⚠️ **If a field were renamed in v4, the flow would complete and we would store `null` ids** — which derives `onboarding_incomplete`, so it fails safe, but it would fail confusingly.
- 🔴 **No real Meta call has ever been made by any of this code.** Every S5 proof runs against a scripted Graph.
- ⚠️ **The route has never run inside Next.js** — `runtime`, `maxDuration` and request parsing remain source-read only.
- ⚠️ **`WHATSAPP_REGISTRATION_PIN` still has no value**, so the register branch has only been exercised with a harness PIN.
- ⚠️ **Nothing was rendered in a browser this stage.** No UI file was modified.

# FLAGS

- 🟢 **v4 IS LANDED IN CODE.** Four-key `extras`, explicit `version: 'v4'`, new config id, provenance recorded against the page that contradicts it.
- 🔴 **THE 24-HOUR SYNC WINDOW IS UNBUILT AND STARTS AT THE FIRST SUCCESSFUL SIGNUP.** It expires silently and the only recovery is to offboard the customer and redo the flow.
- 🔴 **`smb_message_echoes` is unhandled and the webhook would drop it** — an operator answering from the van and our auto-reply can both answer the same customer.
- 🔴 **The 60-day token lifetime is no longer evidenced.** `expires_in` is in the exchange response and is currently discarded.
- 🔴 **Coexistence is not proven to engage.** One screen settles it: connect an existing account (✅) versus create/select a WABA (🔴).
- 🔴 **`app/api/webhooks/messenger/route.ts:43` and `instagram/route.ts:43` still read the deleted `META_APP_SECRET`** and will 401 every genuine delivery. Carried forward from the last report, still not fixed — still a different app family's decision.
- ⚠️ **`GRAPH_API_VERSION = 'v19.0'`** remains past deprecation and shared with the template calls. Reported, unchanged.

*Nothing committed. Nothing staged. `main` = `2ca66cd`. No Meta call has ever been made by this code.*
