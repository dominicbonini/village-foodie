# Embedded Signup v4 — BLOCKED ON COEXISTENCE. A decision for you, plus two tasks completed.

**4 September 2026. Branch `whatsapp-connections-s1-s3`. NOT COMMITTED, not staged, not pushed, not deployed. No cap sync, native binary untouched. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

**Method:** 🔎 SOURCE-READ · 🧪 EXECUTED · 📄 META DOCS (fetched this session from developers.facebook.com).

⚠️ **No span of the prompt arrived garbled.**

## WHAT I DID AND DID NOT DO

| Task | Status |
|---|---|
| **1 — switch the launcher to v4** | 🔴 **NOT DONE.** Blocked by Task 2 — see below. The new config `1544768623597981` is **not referenced anywhere in the code**. |
| **2 — establish coexistence under v4** | 🔴 **COULD NOT ESTABLISH FROM ANY META PAGE I FETCHED. STOPPED, as instructed.** |
| **3 — key call 2 on the finish type** | ✅ **DONE.** Independent of the version question. |
| **4 — the environment variable** | ✅ **CONFIRMED** — and it surfaced a live finding in two other routes. |

🔴 **The launcher is still on v2 and I have NOT silently left it that way** — the block, the deprecation date, the evidence and the two options are now recorded at the top of `lib/whatsapp/embedded-signup.ts`, at the exact line that makes it v2.

---

# TASK 2 — WHY I STOPPED

## What Meta's Versions page says — 📄 quoted from the page I fetched

> "The Embedded Signup version is determined inside of the **extras object** of the implementation code."

> **v4 — Login Configuration:** "To use v4: You need to create a new Facebook Login for Business Configuration, and select your desired products. Selecting the products will automatically set you to v4."

> **v4 — Extras Configuration:** `extras: {} // The extras object is purposely empty for v4.`

> "Embedded signup v2 will be deprecated on October 15, 2026."

**And the version table, reproduced from the same page.** 🔴 **The v4 row's "Feature types" cell contains exactly `whatsapp_business_app_onboarding`:**

| Version | Feature types | Session Info Logging | Products (via login config) |
|---|---|---|---|
| `v4` | `whatsapp_business_app_onboarding` | Sent back for all flows | MM API for WhatsApp · CTWA · Conversions API (WhatsApp) |
| `v3` | `whatsapp_business_app_onboarding` | Sent back for all flows | Not supported |
| `v2` | `only_waba_sharing` · `whatsapp_business_app_onboarding` · `marketing_messages_lite` | Partners are required to add a `sessionInfoVersion` to receive the callback | Not supported |

🟢 **Your diagnosis is confirmed exactly.** The current build carries `setup`, `featureType` and `sessionInfoVersion` with **no `version` key**, and `sessionInfoVersion` appears **only** in the v2 row. **It is v2. 41 days.**

## 🔴 THE CONTRADICTION, AND WHY IT IS NOT MINE TO RESOLVE

**v4's extras is "purposely empty". v4's supported feature type is `whatsapp_business_app_onboarding`. If extras is empty, there is nowhere to put a feature type.** Nothing on any page I fetched reconciles those two sentences.

**Every page I read, and what each one gave me:**

| Page (fetched) | On how coexistence is enabled under v4 |
|---|---|
| `…/embedded-signup/versions` | Names the feature type in the v4 row. **Does not say where it is specified.** |
| `…/embedded-signup/version-4` | 📄 Asked for it verbatim; answer: **"How feature types are specified in v4: NOT PRESENT."** One hedged mention that WhatsApp Business app user onboarding "continues to be supported through the `feature_type` parameter" — **a link with no elaboration, and `feature_type` is not even the spelling the v2 flow uses (`featureType`).** |
| `…/embedded-signup/onboarding-business-app-users/` | 📄 **"NOT PRESENT"** for extras / featureType / feature_type / sessionInfoVersion / version. It gives a **dashboard step** — *"Navigate to the App Dashboard > WhatsApp > Configuration panel and subscribe your app to the following WhatsApp Business account webhook topic fields"* — and then a **visual check**: *"If the WABA selection screen has been replaced with a screen that gives you the option to connect your existing WhatsApp Business account, the feature is enabled."* |
| `…/embedded-signup/implementation` (Step 2, verbatim) | The configuration flow offers **products, assets and permissions** — *"Select the products you want to onboard for this configuration."* **Feature-type or coexistence selection: NOT PRESENT.** Its `FB.login` sample still shows `extras: { setup: {} }`. |

🔴 **I also ran a web search. It returned third-party posts (UnifyPort, Dualhook, wcapi) claiming v4 still takes `featureType` alongside an empty `setup`. I am not acting on those** — they are not Meta, they contradict Meta's own "purposely empty for v4", and you asked for a Meta page I fetched, quoted. **I do not have one.**

⚠️ **This also retires the shakiest claim in the previous report.** S4's `featureType` was flagged there as "the least-verified line in this build" because it came from a search summary. It is now **worse than unverified**: the only Meta page that documents the coexistence flow states no code parameter at all.

## 🔵 A HYPOTHESIS — LABELLED AS ONE, NOT ACTED ON

The coexistence page's enablement is **a dashboard webhook subscription plus a visual check, with no code parameter**. That is *consistent* with v4's empty extras: the feature would come from the login configuration and the app's webhook subscriptions, not from the launch call. **That reading fits every sentence I fetched — but no page states it, so it stays a hypothesis.**

🟢 **And it is cheaply falsifiable.** Meta gave the test themselves: open the flow against the v4 config and **look at the first screen**.

---

# 🔴 THE DECISION — WHAT EACH OPTION COSTS

### Option A — v4 now, coexistence dropped
Point at `1544768623597981`, `extras: {}`, ship.
- ✅ No October deadline. Simplest code. Products come from the login config.
- 🔴 **The default flow provisions a NEW phone number.** A truck whose number is on their flyers, on the van and in the WhatsApp Business app gets a **second number nobody has**. **That is not a degraded feature — it is the wrong product**, and it contradicts the requirement this entire workstream was scoped against ("Trucks keep their number in the WhatsApp Business app on their phone — that is coexistence, and it is a requirement, not a nice-to-have").
- ⚠️ Also loses the existing WhatsApp Business app history sync that coexistence gives them.

### Option B — v3 with coexistence, migrate before October
📄 v3 extras, from the Versions page: `extras: { setup: "<SETUP_DATA>", features: [{name:"<FEATURE_NAME>"}], featureType: "<FEATURE_TYPE>", version: "v3" }`
- ✅ Coexistence is **documented for v3** (the table's v3 row lists it), and `featureType` demonstrably belongs in v3's extras.
- ✅ Session info **"Sent back for all flows"** — `sessionInfoVersion` is not needed, so all three handlers keep working unchanged.
- ✅ v3 also allows finishing with a verified, unverified **or no** phone number — strictly better than v2.
- 🔴 **It buys no time.** 📄 The same page: *"V3 and preview versions are available until October 2026."* **v3 dies at the same deadline.** You would migrate to v4 anyway.
- ⚠️ Requires the v2 → v3 code change now **and** the v3 → v4 change before October: two migrations instead of one.

### 🟢 MY RECOMMENDATION — settle it empirically first, and it costs one flow open

**Before choosing A or B, run Meta's own test on the HTTPS host you are arranging:** point the launcher at `1544768623597981` with `extras: {}`, open the flow, and **look at the first screen**.

> 📄 *"If the WABA selection screen has been replaced with a screen that gives you the option to connect your existing WhatsApp Business account, the feature is enabled."*

- **If the coexistence screen appears** → the hypothesis holds. **Take Option A** — you are on v4, coexistence works, no deadline, no code parameter, one migration total. **This is the outcome I expect**, because it is the only reading under which both of Meta's v4 sentences are true.
- **If it does not** → **take Option B**, knowing it is a stopgap and the v4 migration still lands before October.

🔴 **I am not running that test and cannot.** It needs HTTPS, and the new config must be on the app's allowed domains — a Meta dashboard setting I cannot read. **The choice is yours either way; this only makes it a five-minute observation instead of an argument.**

---

# TASK 3 — CALL 2 NOW KEYS ON THE FINISH TYPE ✅

**Removed:** `const SKIP_REGISTER_FOR_COEXISTENCE = true`.
**Replaced with:** a named map, keyed on the finish type Meta returns — which is per-truck data already stored on the row, not a build-time decision.

🔴 **The bug this fixes only shows up in production.** A truck completing the **default** flow gets a freshly provisioned Cloud API number that **must** be registered. The constant skipped registration for them too — leaving a number that looks connected and **can never send**.

🔴 **An unknown finish type now REGISTERS.** Meta may add finish types; a new one that provisions a number and is silently skipped is **mute**, whereas registering an already-registered number returns an error we surface. Fail toward the recoverable side.

## Every finish type handled — 🧪 EXECUTED, not asserted

| Finish type | Call 2 (register) | Call 3 (subscribe) | Resulting state | Why |
|---|---|---|---|---|
| `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` | **no** | **YES** | `ready` (send=true) | Coexistence — the operator's own number is already registered |
| `FINISH` | **YES** | **YES** | `ready` (send=true) | Default flow — a new Cloud API number was provisioned |
| `FINISH_OBO_MIGRATION` | **YES** | **YES** | `ready` (send=true) | Migrating in from another provider |
| `FINISH_ONLY_WABA` | no | no | **`onboarding_incomplete`** (send=false) | WABA shared, no phone number |
| `FINISH_GRANT_ONLY_API_ACCESS` | no | no | **`onboarding_incomplete`** (send=false) | Grant-only, no number onboarded here |
| **unknown** (`FINISH_SOMETHING_META_ADDED_LATER`) | **YES** | **YES** | `ready` | 🔴 Registers by default; **stored verbatim**, never rejected |
| **empty / absent** | **YES** | **YES** | `ready` | Same default; `finish_type` stored as `null` |

🟢 **`finish_type` is stored exactly as received in every row** — including the unknown one — so an unrecognised value **stores, never fails**.
⚠️ Registration still needs `WHATSAPP_REGISTRATION_PIN` (6 digits, server-only, **not set, no value invented by me**). Without it the register branch stops at `onboarding_incomplete` with the token kept and the operator told support will finish it — it does **not** fabricate `ready`.

---

# TASK 4 — THE ENVIRONMENT VARIABLE ✅ CONFIRMED, AND A LIVE FINDING

🧪 **Executed.** `.env.local` now defines **`META_WHATSAPP_APP_SECRET`** and **`META_APP_SECRET` is gone — 0 occurrences.** 🟢 **The rename is done.** (It was done in `.env.local` outside this session; I did not edit it.)

🟢 **No fallback chain was added.** `app/api/manage/whatsapp-signup/route.ts:143` reads `process.env.META_WHATSAPP_APP_SECRET` and nothing else — one name, matching the family, exactly as the WhatsApp webhook's recorded rule requires.

## 🔴 BUT TWO ROUTES STILL READ THE OLD NAME — AND IT IS THE SAME FAILURE THE RULE WAS WRITTEN FOR

🧪 `grep -rn "process.env.META_APP_SECRET" app lib`:
```
app/api/webhooks/messenger/route.ts:43    const secrets = parseMetaAppSecrets(process.env.META_APP_SECRET)
app/api/webhooks/instagram/route.ts:43    const secrets = parseMetaAppSecrets(process.env.META_APP_SECRET)
```

🔎 **Source-read consequence, from those files' own code:** with `META_APP_SECRET` deleted from Vercel and now from `.env.local`, `parseMetaAppSecrets(undefined)` returns `[]`, `verifyMetaSignature` fails with `no_secret_configured`, and the route returns **401 to every genuine Meta delivery** — *"a forged request is not from Meta and will never read this, so the code is really an instruction to META about GENUINE deliveries."* **This is the identical drift the WhatsApp route documents having suffered until 20 August 2026.**

⚠️ **Blast radius is small but not zero.** Both handlers "acknowledge and log, and route nothing to the classifier" — Messenger and Instagram are verify-handshake stubs, so **no customer-facing reply is lost**. The risk is that **Meta disables the webhook subscription after sustained failures**, which would need re-enabling in the dashboard when those channels ship.

🔴 **I DID NOT CHANGE THEM, and that is deliberate.** Fixing them means deciding **which secret they should read** — their own `META_MESSENGER_APP_SECRET` / `META_INSTAGRAM_APP_SECRET`, or the WhatsApp one if they are the same Meta app. **That is a decision about a different app family and is outside this brief.** You asked me to confirm no code reads the old name; **two files do, and here they are.**

---

# VERIFICATION

| Check | Method | Result |
|---|---|---|
| `npx tsc --noEmit` | 🧪 Executed | **exit 0, clean** |
| `findPlanParityViolations()` | 🧪 Executed on the real module | **0 violations** |
| Finish-type matrix — call 2 fires for the right ones | 🧪 Executed (Proof I, **new**) | ✅ table above |
| No token/code/secret in the client payload | 🧪 Executed (A2) | ✅ `{"ok":true,"state":"ready","connection":{…4 fields…},"message":…}` |
| No token/code/secret in ANY log line, success | 🧪 Executed (A3) | ✅ |
| …exchange failure, **code echoed in Meta's error body** | 🧪 Executed (E) | ✅ only `status`, `code`, `type` survive |
| …call-3 failure, **token echoed in Meta's error body** | 🧪 Executed (C) | ✅ |
| State machine derives from a row this route wrote | 🧪 Executed (B) | `ready`, expiry 60 days out, `payment_method_present: null` |
| Duplicate `phone_number_id` → specific error | 🧪 Executed (D) | ✅ *"already connected to another HatchGrab account…"* |
| Partial failure → `onboarding_incomplete`, never `ready` | 🧪 Executed (C) | ✅ token kept, send=false, Reconnect offered |
| Idempotent re-run | 🧪 Executed (F) | ✅ 1 row |
| Abandonment + error logged, write nothing | 🧪 Executed (G) | ✅ 0 rows |
| Body-supplied truck id ignored | 🧪 Executed (H) + 🔎 grep | ✅ |
| Old config id `2892063604490064` gone | 🔎 grep | 🔴 **STILL PRESENT** — `.env.local:68` and a comment in `connection-state.ts:54`. **Correct, because the switch did not happen.** |
| New config id `1544768623597981` referenced | 🔎 grep | 🟢 **NOWHERE** — deliberately, per Task 2 |
| SDK `FB.init` version | 🔎 Source-read | `v26.0`, unchanged |
| `GRAPH_API_VERSION` | 🔎 Source-read | 🟢 **still `v19.0`** at `lib/meta-whatsapp.ts:19` — **reported, unchanged, as instructed.** Past deprecation, shared with the send path and both template calls. |
| Session-logging handlers (3 shapes) | 🔎 Source-read | All three kept. ⚠️ **v4's success payload shape: NOT VERIFIED** — see below. |

**The harness ran the REAL route module**, copied with only its import specifiers rewritten so Node can resolve them. Not a re-implementation.

## Success payload under v4 — ⚠️ NOT CONFIRMED

The brief asked me to confirm the success shape is unchanged under v4. 🔴 **I could not.** The v4 detail page returned **"Session info/message event payload shapes: NOT PRESENT"**, and the v4 spec page I read earlier is the same page that shows the v2/v3 `extras`. **What I can say:** the Versions table's v4 row states session info is **"Sent back for all flows"** (versus v2's *"Partners are required to add a `sessionInfoVersion` to receive the callback"*) — so under v4 **all three handlers should fire without `sessionInfoVersion`**, which is why they are kept. **The field list inside the success payload is unverified for v4.**

## HTTPS — what cannot run on localhost

🔴 **Everything involving the flow.** Meta requires HTTPS for Embedded Signup domains.
- **Cannot run on localhost:** opening the flow at all; the coexistence screen check that would settle Task 2; any real completion, abandonment or error payload; the exchange, register and subscribe calls.
- **Can run on localhost:** the Settings card rendering, the **Set up** button firing (it will fail at the SDK or return `not_configured`), and the save-on-blur.
- ⚠️ **Additionally, the new HTTPS host must be added to the app's allowed domains in Meta's dashboard** — which I cannot read or set.

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 staged. No commit, no push, no deploy.**

**MODIFIED this stage — two files, both untracked-new from earlier stages:**
| File | Change |
|---|---|
| `lib/whatsapp/embedded-signup.ts` | Five finish types named as exported constants (was one); the v2/deprecation/blocked-decision note added above them. 🔴 **`extras` NOT changed — still v2.** |
| `app/api/manage/whatsapp-signup/route.ts` | `SKIP_REGISTER_FOR_COEXISTENCE` removed; `REGISTRATION_BY_FINISH_TYPE` map added; success log now records `registered` |

**🟢 Untouched, verified this run:**
| Group | Diff | Status |
|---|---|---|
| Pre-existing six (`app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `ios/…/project.pbxproj`, `lib/custom-domain/copy.ts`, `proxy.ts`, `vercel.json`) | **6 files, 52+/56−** | 🟢 **byte-for-byte identical to every prior check** — order rename, derivation extraction and the `ios/` project file all unchanged |
| Copy workstream (`lib/plan-features.ts`, `app/landing/page.tsx`, `lib/landing-table.ts`, `lib/meta/webhook-signature.ts`) | **4 files, 142+/49−** | 🟢 **unchanged** |
| `docs/reference-manual.md` | 565+/4− | 🟢 unchanged |
| S1–S3 (`connection-state.ts`, `connection-read.ts`, `token-crypto.ts`, `app/api/manage/route.ts`, `app/manage/[token]/page.tsx`, the migration) | — | 🟢 **not touched this stage** |
| Outreach files, `app/order/[id]/page.tsx`, `lib/outreach.ts`, `lib/whatsapp-hint.ts`, outreach migrations, docs | — | 🟢 still untracked, unstaged |
| `.env.local` | — | 🟢 **not edited by me this stage.** Gitignored, 0 git entries. |

---

# WHAT I COULD NOT READ OR VERIFY

**Meta's documentation — the blocking gaps:**
- 🔴 **How a feature type is specified under v4.** Asked verbatim of the v4 detail page: **"NOT PRESENT."** This is the whole block.
- 🔴 **How coexistence is enabled under v4.** The coexistence page gives a dashboard webhook step and a visual check, and **"NOT PRESENT"** for every code parameter I asked about.
- 🔴 **Whether `featureType` is accepted at all in a v4 configuration**, or ignored, or an error. Nothing states it.
- ⚠️ **The v4 success-payload field list** — not present on the v4 page.
- ⚠️ **`feature_type` vs `featureType`** — the v4 page's one hedged mention uses the snake_case spelling; the v2 flow uses camelCase. I could not tell whether that is a real distinction or a documentation slip.
- ⚠️ **Whether v3's `features: [{name}]` array is required or optional**, and what `setup: "<SETUP_DATA>"` should contain in v3 — not established, and Option B would need both.

**Meta's dashboard — none of it, I have no admin session:**
- 🔴 Which products/assets/permissions configuration `1544768623597981` actually carries beyond what you stated, and whether it is on the allowed domains for the HTTPS host.
- 🔴 Whether the coexistence webhook topic fields are subscribed at app level (the coexistence page's Step 1).
- 🔴 That the app is still in Development mode. Taken from your statement.

**This repo / environment:**
- 🔴 **No part of the flow has ever been opened, and no real Meta call has ever been made by this code.** Every S5 proof runs against a scripted Graph.
- 🔴 **Nothing was rendered in a browser this stage.** No UI file was touched, so nothing should have moved — a reasoned expectation, not an observation.
- 🔴 **The route has never run inside Next.js** — `runtime`, `maxDuration` and request parsing remain source-read only.
- ⚠️ **`WHATSAPP_REGISTRATION_PIN` still has no value**, so the register branch has only ever been exercised with a harness PIN.
- ⚠️ **The Messenger/Instagram 401 consequence is source-read, not observed.** I did not send a signed delivery to either endpoint.

# FLAGS

- 🔴 **THE LAUNCHER IS STILL v2 AND v2 DIES ON 15 OCTOBER 2026 — 41 DAYS.** Blocked deliberately, recorded in the source, awaiting your decision.
- 🔴 **v3 DIES IN OCTOBER TOO** — Option B buys coexistence, not time.
- 🟢 **Run Meta's own one-screen test on the HTTPS host before choosing.** It settles the question for the cost of opening the flow once.
- 🔴 **`app/api/webhooks/messenger/route.ts:43` and `instagram/route.ts:43` still read the deleted `META_APP_SECRET`** and will 401 every genuine delivery. Reported, not fixed — the fix is a decision about a different app family.
- ⚠️ **`GRAPH_API_VERSION = 'v19.0'`** remains past deprecation and shared with the template calls. Reported, unchanged.
- ⚠️ **The previous report's `featureType` caveat is now stronger, not weaker** — no Meta page documents that parameter for the coexistence flow.

*Nothing committed. Nothing staged. `main` = `2ca66cd`. The launcher is still v2, by decision, not by omission.*
