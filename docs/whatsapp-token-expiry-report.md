# Token expiry from `expires_in` — and two defects scoped, not built

**4 September 2026. Branch `whatsapp-connections-s1-s3`. NOT COMMITTED, not staged, not pushed, not deployed. No cap sync, native binary untouched. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

**Method:** 🔎 SOURCE-READ · 🧪 EXECUTED · 📄 META DOCS (fetched this session, quoted).

⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# TASK 1 — THE FABRICATION IS GONE ✅

## The constant is deleted, not defaulted

🧪 **Executed sweep** — `grep -rn "TOKEN_LIFETIME_DAYS\|60 \* 24 \* 60 \* 60" app lib` → **NONE in executable code.** The only surviving `TOKEN_LIFETIME_DAYS` string is inside the comment that records why it was removed.

**🔴 There is no fallback. Deliberately.** A fallback constant is the same fabrication wearing a different name: it produces a confident date for a token whose real death nobody observed, and it fails **silently** until a truck stops answering customers mid-service.

**Every place the 60 appeared, and what happened to each:**

| Location | Was | Now |
|---|---|---|
| `whatsapp-signup/route.ts:67` | `const TOKEN_LIFETIME_DAYS = 60` | 🟢 **DELETED** |
| `whatsapp-signup/route.ts:187` | `Date.now() + TOKEN_LIFETIME_DAYS * …` | 🟢 `Date.now() + expiresInSeconds * 1000` |
| `whatsapp-signup/route.ts:57–59` | doc claiming 60 days | 🟢 rewritten as the "no constant, and why" note |
| `connection-state.ts:51–61` | `tokenExpiresAt` doc asserting 60 days | 🟢 rewritten — value comes from `expires_in`, and **null means "no token held", never "permanent"** |
| `connection-state.ts:119` | *"14 days against a 60-day token life"* | ⚠️ **marked unevidenced** — see the finding below |
| `token-crypto.ts:101–102` | *"tokens expire after 60 days, so the population re-onboards on its own cadence"* | ⚠️ weakened — the self-healing window is now of **unknown length**, and was never a substitute for rotation |
| `page.tsx:9975` | *"(60-day tokens)"* | 🟢 removed |
| `supabase/migrations/20260904_…sql:28,74` | comments citing the 60-day template | 🔴 **LEFT ALONE ON PURPOSE.** That migration **has been applied in production**. Editing an applied migration's text rewrites a historical record and would not change the database. The correction lives in the code that reads the column. |

## `expires_in` is validated, not trusted

```ts
const rawExpiresIn = Number(json.expires_in)
expiresInSeconds = Number.isFinite(rawExpiresIn) && rawExpiresIn > 0 ? rawExpiresIn : null
```

⚠️ **Zero and negative are treated as ABSENT, not coerced.** A token that "expires in 0 seconds" would derive `revoked` on the very next read and lock a truck out of a connection that actually works.

## 🔴 THE DECISION WHEN `expires_in` IS ABSENT: WE DO NOT STORE THE TOKEN

**"Store the token with a null expiry" was never actually available.** The table's CHECK —

```sql
check (access_token_ciphertext is null or token_expires_at is not null)
```

— forbids exactly that pair. Choosing it would not produce a null-expiry row; it would produce a **23514 constraint violation and a 500**. 🔴 **So the real choice was between DROPPING THE TOKEN and CHANGING THE SCHEMA** — and a schema change is a hand-applied migration, not something to smuggle into this route.

**I chose to drop the token and keep the identifiers.** The row is written with `waba_id`, `business_id`, `finish_type` and **no ciphertext**, which satisfies the CHECK by making its left-hand side true.

⚠️ **THE COST, STATED PLAINLY: this discards a token that may be perfectly valid.** Meta omits `expires_in` for tokens that **never expire**, so a missing value may mean *permanent*, not *broken*. That cost is accepted deliberately — a permanent token is a change to what this table can represent, and the alternative is inventing a death date for a token we cannot describe. 🟢 **If permanent tokens turn out to be the norm, relax the CHECK in a migration and store a null expiry HONESTLY** rather than defaulting in code.

## 🧪 PROOF J — EXECUTED

| Exchange response | Token stored | `token_expires_at` | State | Operator sees |
|---|---|---|---|---|
| `expires_in: 5184000` (60d) | **YES** | **+5184000s** ✅ | `ready` (send=true) | "WhatsApp is connected…" |
| `expires_in: 86400` (24h) | **YES** | **+86400s** ✅ | `ready` (send=true) | "WhatsApp is connected…" |
| `expires_in: 7776000` (90d) | **YES** | **+7776000s** ✅ | `ready` (send=true) | "WhatsApp is connected…" |
| **absent** | **no** | **null** ✅ | `onboarding_incomplete` (send=false) | "We linked your WhatsApp Business account but could not complete the connection. Nothing is wrong on your side — please contact us and we will finish it." |
| `expires_in: 0` | no | null ✅ | `onboarding_incomplete` | same |
| `expires_in: -5` | no | null ✅ | `onboarding_incomplete` | same |
| `expires_in: "notanumber"` | no | null ✅ | `onboarding_incomplete` | same |
| `expires_in: null` | no | null ✅ | `onboarding_incomplete` | same |

🟢 **The date tracks `expires_in` exactly across three different lifetimes**, and **no row anywhere carries a fabricated 60-day date** — a surviving fallback would have made every row `+5184000s`.

## 🔴 THE PROOF CAUGHT TWO REAL THINGS

**1. A stale harness.** The first run showed **every** case at `+5184000s` — including the 24-hour and 90-day ones. The harness was executing a pre-edit copy of the route. **Reported because it is the interesting part:** had I copied the numbers out without reading them, this report would have claimed a fix that was not running. The harness is now re-copied from source on every run.

**2. A state I had typed by hand disagreed with the row.** The no-expiry branch returned `state: 'token_missing'`, but the row it had just written derives **`onboarding_incomplete`** — the derivation tests the missing `phone_number_id` *before* the missing token, and that row has no phone number. 🔴 **A literal beside a derived value is a fabricated state waiting to happen.** Fixed structurally, not by patching the label: **all eight success responses now go through one `ok()` helper that reads the connection back and sets `state` from it.** There is nowhere left in this route to type a state by hand.

## ⚠️ A CONSEQUENCE OF NOT KNOWING THE LIFETIME

🧪 **Executed:** `isTokenExpiringSoon(now + 24h)` → **`true`**.

`REAUTHORISE_BEFORE_EXPIRY_DAYS = 14` was sized as *"~23% of a 60-day life"*. 🔴 **If the real lifetime turns out to be short — say 24 hours — 14 days is longer than the token lives, and the amber "needs renewing soon" prompt would show for the token's entire existence**, which is precisely the nag an operator learns to ignore. The constant is marked in place and must be re-sat against the **first observed `expires_in`**. **I did not change it** — guessing a second number to replace a guessed one is not an improvement.

---

# TASK 2 — THE DOUBLE-REPLY DEFECT (SCOPE ONLY, NOTHING BUILT)

## 2a. The `smb_message_echoes` payload — 📄 quoted verbatim

From `developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes`:

> **Trigger:** "A business customer with a WhatsApp Business app phone number…sends a message using the WhatsApp Business app or a companion device to a WhatsApp user or another business."

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",
          "phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"
        },
        "message_echoes": [{
          "from": "<BUSINESS_DISPLAY_PHONE_NUMBER>",
          "to": "<WHATSAPP_USER_PHONE_NUMBER>",
          "id": "<WHATSAPP_MESSAGE_ID>",
          "timestamp": "<WEBHOOK_TRIGGER_TIMESTAMP>",
          "type": "<MESSAGE_TYPE>",
          "<MESSAGE_TYPE>": { "<MESSAGE_CONTENTS>" }
        }]
      },
      "field": "smb_message_echoes"
    }]
  }]
}
```

🔴 **THE TRAP, AND IT WOULD BE EASY TO GET BACKWARDS: the array is `message_echoes`, not `messages`, and THE CUSTOMER IS IN `to`, NOT `from`.** On a normal inbound the customer is `from`; on an echo `from` is the **truck's own number**. Any suppression written by copying the existing handler would key on the truck's number and suppress nothing.

## 2b. Where it is dropped — 🔎 quoted from `app/api/webhooks/meta/whatsapp/route.ts:135-143`

```js
const entry    = parsed?.entry?.[0]
const changes  = entry?.changes?.[0]
const value    = changes?.value
const messages = value?.messages

if (!messages?.length) {
  // Status update or other non-message event — acknowledge and ignore
  return NextResponse.json({ ok: true })
}
```

🔴 **`value.message_echoes` is never read, and `changes.field` is never inspected.** An echo has no `messages` key, so it hits that early return and is **acknowledged with 200 and discarded**. The comment calls it "Status update or other non-message event" — accurate when it was written, and now the line where a human's reply gets thrown away.

## 2c. What suppression would need to look like — riding the existing mechanism

🔴 **No parallel mechanism. `whatsapp_logs` already is this.** 🔎 The webhook's existing per-customer read (`route.ts:313-320`) is:

```js
supabase.from('whatsapp_logs')
  .select('created_at, classification')
  .eq('customer_number', from)
  .eq('truck_id', truck.id)
  .not('response_sent', 'is', null)
  .gte('created_at', since24h)
```

**That query already answers "has this conversation been replied to recently?" — it just cannot see human replies, because nothing writes them.**

**The shape, in four parts:**

1. **Branch on `changes.field === 'smb_message_echoes'` before the `messages` check**, and write one `whatsapp_logs` row per echo: `truck_id`, `customer_number` = **the normalised `to`** (🔴 not `from`), `message_in: null`, `response_sent` = the human's text, `classification` = a **new** `HUMAN_HANDLED` constant, `possible_miss: false`. Reusing the same table means the Reports tab, the 24-hour window and every existing read see it for free.
2. 🔴 **`HUMAN_HANDLED` must NOT join `CAP_CLASSIFICATIONS`.** Those exist to exclude rows from the truck day/month **billing** caps, and the operator's own app message costs us nothing — but the *reason* differs, and `CAP_CLASSIFICATIONS` is also the predicate `isCapRow` uses. It needs its own exclusion in the day and month queries, added to the `or(...)` clause alongside them, or the truck's own replies would eat their monthly allowance.
3. **The suppression check** goes immediately before the classifier call: if a `HUMAN_HANDLED` row exists for `(truck_id, customer_number)` newer than a threshold, log a row and send nothing. ⚠️ **The threshold is a judgement and must be one named constant with its reasoning beside it, exactly as `REAUTHORISE_BEFORE_EXPIRY_DAYS` is** — I am not picking it here. **The 24-hour window is the wrong reuse:** a human answering at noon should not silence the bot for a customer's genuinely new question at 11pm. Something on the order of an active-conversation span, well under an hour, is the shape.
4. **What resets it:** the threshold elapsing is the only reset needed — the rolling window does the work, exactly as the reply cap's does. **No flag to clear, no state to unwind.** A second echo simply refreshes the timestamp, so an operator in an active conversation keeps the bot quiet for as long as they keep typing.

⚠️ **One thing the shape above does NOT solve:** an echo arrives *after* our auto-reply when both fire at once. Suppression is inherently retrospective — it prevents the *next* robot reply, not a simultaneous one. **The unavoidable residue is a race**, and it is worth saying so rather than implying suppression makes double replies impossible.

## 2d. Is it reachable today? 🔴 **LATENT, NOT LIVE**

**Latent.** Nothing can produce an echo yet, for **three independent reasons**, any one of which is sufficient:
1. 🧪 **No truck has a `whatsapp_connections` row.** No signup has ever completed.
2. 🔴 **The whole flow has never successfully run** — it needs HTTPS, which localhost is not.
3. 🔎 **Coexistence engagement is unproven** (Task 4). Without it there is no WhatsApp Business app number in the loop, and echoes only exist for coexistence numbers.

🔴 **WHAT MAKES IT LIVE — precisely: the first truck completing coexistence onboarding and then answering a customer from the app in the van.** There is no other trigger, and it needs no code change to become live. **It goes from latent to live on the first real onboarding**, which is also the moment the 24-hour sync clock starts. Those two are the same event.

## 2e. Is `smb_message_echoes` subscribed? 🔴 **I CANNOT READ META'S DASHBOARD — THIS IS YOURS TO CHECK**

You told me `account_update` is subscribed at app level. **Nothing tells me whether `smb_message_echoes`, `history` or `smb_app_state_sync` are.** 📄 Meta's coexistence page makes this an explicit onboarding step: *"Navigate to the App Dashboard > WhatsApp > Configuration panel and subscribe your app to the following WhatsApp Business account webhook topic fields."*

⚠️ **And subscribing them changes nothing on its own** — 🔎 the webhook drops every field except `messages` (2b). **Subscription and handling are two separate gaps, and both are open.**

---

# TASK 3 — THE 24-HOUR WINDOW (SCOPE ONLY, NOTHING BUILT)

## The clock's start condition — 📄 quoted

> **"After you onboard the business customer, you have 24 hours to synchronize their contacts and messaging history, otherwise they must be offboarded and complete the flow again."**

> **"If you need to perform it again, the customer must first offboard, then complete the Embedded Signup flow again."**

🔴 **"After you onboard" — so the clock starts at flow completion, NOT at the first sync attempt, and not at our first successful send.** In our code that instant is the moment the exchange route returns `ready`. **Nothing observes it, nothing records it, nothing counts down.**

## What the operator actually loses — in words you could say to them

> *"When you connected WhatsApp, we had a one-day window to copy your existing chats and contacts across. We missed it. Your messages are all still on your phone and nothing is lost there — but on our side your customer list starts empty, so the auto-replies won't know anyone you've spoken to before. To get that history across, you'd have to disconnect WhatsApp and go through the setup again."*

**The three concrete losses:**
1. **Contacts** — the business's address book never arrives.
2. **Message history** — prior conversations never arrive. ⚠️ **They remain visible in the operator's own app; this is our side going blank, not theirs.**
3. 🔴 **The recovery is "start again", not "run it later".** After 24 hours the only fix is **offboard and redo the whole wizard.** That is the sharp edge: a silent, irreversible deadline the operator never sees.

## Where the call belongs in the sequence

📄 Two calls, one endpoint: `POST /<BUSINESS_PHONE_NUMBER_ID>/smb_app_data` with `{"messaging_product":"whatsapp","sync_type":"smb_app_state_sync"}` (contacts) and `sync_type:"history"` (messages).

🔴 **After call 3, before Phase B — as calls 4 and 5, inside the same request.**
- **After call 3** because both need the WABA subscribed: the results arrive as **webhooks** (`smb_app_state_sync`, `history`), so firing before the subscription means requesting data that has nowhere to land.
- **Before Phase B** because Phase B is what makes the row derive `ready`, and `ready` is our claim that this connection is complete. **A connection missing its history is not complete.**
- **In the same request** because the 24-hour clock is already running and there is no job runner here that would reliably pick it up. ⚠️ It needs `phone_number_id`, which the flow returned and which is in hand at that point even though it is not yet written to the row.
- ⚠️ **The two syncs are asynchronous** — these calls *request* a sync, and the data arrives later by webhook. So the calls belong in the sequence; **the handling does not** and is a separate piece of work.

## What a failure must do to the state — 🔴 it must not fabricate `ready`

**It must behave exactly as calls 2 and 3 already do: leave `phone_number_id` unwritten, so the row derives `onboarding_incomplete` — not sendable, "Reconnect" offered, token preserved.** 🧪 That path is already proven by execution (Proof C).

⚠️ **But `onboarding_incomplete` is a poor fit here and I would not ship it silently.** A sync failure is not an incomplete onboarding — the connection *works*, it is only missing history — and telling the operator to reconnect **spends the very 24 hours that could still be used**. 🔴 **The honest options are a decision, not an implementation detail:**
- **(a) Fail the connection** — safest and simplest, worst for the operator: a working connection is withheld over history.
- **(b) Complete the connection and flag the sync separately** — needs somewhere to put "connected, history missing", which the current six states cannot express. That is a **seventh state or a separate column**, i.e. a migration.
- **(c) Complete the connection and alert support inside the window** — no schema change, and a human can retry the sync while the clock still runs.

**My read: (c) first, because it needs no migration and preserves the window; (b) if coexistence becomes the normal path.** 🔴 **Not built, as instructed.**

---

# TASK 4 — WHAT THE FLOW ACTUALLY SHOWED

🛠️ **OBSERVED, by you, on the Builder link against the v4 configuration with `featureType` set.** The options presented were:
1. **Create a new number**
2. **Use a display name with a virtual number**

🔴 **The coexistence screen — "connect your existing WhatsApp Business account" — WAS NOT AMONG THEM.**

## How this is recorded

- 🔴 **NOT recorded as working.** It is not.
- 🔴 **NOT recorded as broken.** The test account **had no WhatsApp Business app account to connect**. 📄 Meta requires the customer to be on **WhatsApp Business app 2.24.17 or higher**, and it is entirely plausible that the flow offers only the paths the account can actually take. An option that cannot apply may simply not be shown.
- 🟢 **Recorded as: COEXISTENCE ENGAGEMENT REMAINS UNPROVEN, and the observed screens are EVIDENCE AGAINST IT — weakened, not neutralised, by the account having nothing to connect.**

⚠️ **This is a step down from the previous report.** There, the evidence was merely *absent* (a personal number was refused, which both paths would do). **Here there is evidence pointing the wrong way.** The parameter shape is still proven from Meta's generated URI; **what is unproven is that it does anything.**

## The test that settles it

🔴 **Open the flow on the HTTPS host, signed in as a Meta account that OWNS a number already live in WhatsApp Business app 2.24.17+**, and read the WABA step:

| What appears | Verdict |
|---|---|
| An option to **connect an existing WhatsApp Business account** | ✅ **Coexistence engaged.** 📄 Meta's own criterion: *"If the WABA selection screen has been replaced with a screen that gives you the option to connect your existing WhatsApp Business account, the feature is enabled."* |
| Only **create a new number** / **virtual number** — the two you saw | 🔴 **Coexistence NOT engaged**, and with a qualifying account behind it that result is conclusive. Next suspects, in order: the webhook topic fields in the App Dashboard (2e), then the `featureType` value, then `setup: {}`. |

⚠️ **The account is the variable that matters. Repeating the test on an account with nothing to connect will produce the same two options and prove nothing again.**

---

# VERIFICATION

| Check | Method | Result |
|---|---|---|
| `npx tsc --noEmit` | 🧪 Executed | **exit 0, clean** |
| `findPlanParityViolations()` | 🧪 Executed on the real module | **0 violations** |
| **`token_expires_at` matches `expires_in`** (3 lifetimes) | 🧪 **Executed (J, new)** | ✅ 60d, 24h, 90d all exact |
| **Absent/0/negative/non-numeric/null `expires_in` writes no token and no date** | 🧪 **Executed (J, new)** | ✅ 5 cases |
| No 60-day fabrication anywhere | 🧪 Executed (J + grep) | ✅ |
| Response `state` cannot disagree with the row | 🔎 Source-read (single `ok()` helper) | ✅ 8 responses, 0 hand-typed states |
| No token/code/secret in the client payload | 🧪 Executed (A2) | ✅ |
| No token/code/secret in ANY log line — success | 🧪 Executed (A3) | ✅ |
| …exchange failure, **code echoed in Meta's error body** | 🧪 Executed (E) | ✅ |
| …call-3 failure, **token echoed in Meta's error body** | 🧪 Executed (C) | ✅ |
| State machine derives from a row this route wrote | 🧪 Executed (B) | ✅ `ready`, send=true |
| Duplicate `phone_number_id` → specific error | 🧪 Executed (D) | ✅ |
| Partial failure → `onboarding_incomplete`, never `ready` | 🧪 Executed (C) | ✅ token kept, send=false |
| Idempotent re-run | 🧪 Executed (F) | ✅ 1 row |
| Abandonment + error logged, write nothing | 🧪 Executed (G) | ✅ 0 rows |
| Body-supplied truck id ignored | 🧪 Executed (H) + grep | ✅ |
| Finish-type map, all seven cases | 🧪 Executed (I) | ✅ unchanged |
| `smb_message_echoes` payload shape | 📄 Meta page, quoted | ✅ established |
| Echo dropped at the `messages` check | 🔎 Source-read, quoted | ✅ `route.ts:135-143` |
| Webhook field subscriptions | ❌ **CANNOT READ** | Meta dashboard — yours |
| Coexistence engagement | ❌ **UNPROVEN** | evidence against; test above |

**The harness runs the REAL modules**, re-copied from source on every run, with only import specifiers rewritten. ⚠️ **All launcher and webhook statements are source-read** — no browser rendered anything and no real Meta call has ever been made by this code.

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 staged. No commit, no push, no deploy.**

**MODIFIED this stage — four files:**
| File | Change |
|---|---|
| `app/api/manage/whatsapp-signup/route.ts` | `TOKEN_LIFETIME_DAYS` deleted; `expires_in` read and validated; the no-expiry branch; the `ok()` helper deriving `state` for all 8 success responses |
| `lib/whatsapp/connection-state.ts` | `tokenExpiresAt` doc rewritten; the 14-day reasoning marked unevidenced with the short-lifetime failure named |
| `lib/whatsapp/token-crypto.ts` | the "60-day self-healing" mitigation weakened to an unknown window |
| `app/manage/[token]/page.tsx` | the "(60-day tokens)" comment corrected |

🟢 **Untouched, verified this run:**
| Group | Diff | Status |
|---|---|---|
| **Pre-existing six** — `app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `ios/App/App.xcodeproj/project.pbxproj`, `lib/custom-domain/copy.ts`, `proxy.ts`, `vercel.json` | **6 files, 52+/56−** | 🟢 **byte-for-byte identical to every prior check** — order scan-route rename, derivation extraction and the `ios/` project file all unchanged |
| **Copy workstream** — `lib/plan-features.ts`, `app/landing/page.tsx`, `lib/landing-table.ts`, `lib/meta/webhook-signature.ts` | **4 files, 142+/49−** | 🟢 **unchanged** |
| `docs/reference-manual.md` | 565+/4− | 🟢 unchanged |
| `lib/whatsapp/embedded-signup.ts`, `connection-read.ts`, `app/api/manage/route.ts`, the migration, `.env.local` | — | 🟢 **not touched this stage** |
| Outreach files, `app/order/[id]/page.tsx`, `lib/outreach.ts`, `lib/whatsapp-hint.ts`, outreach migrations, docs | — | 🟢 still untracked, unstaged |

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **What `expires_in` this configuration actually returns.** The fabrication is removed and the code now reports whatever Meta says — **but nobody has yet seen a real value.** The first successful exchange settles it, and `REAUTHORISE_BEFORE_EXPIRY_DAYS = 14` must be re-sat against it.
- 🔴 **Whether the no-expiry path will ever fire.** If this configuration issues permanent tokens, **every onboarding takes it** and no truck can connect. That would be loud and immediate rather than silent — the right failure — but I cannot rule it out from here, and it is the single most likely surprise of this change.
- 🔴 **Coexistence engagement.** Evidence now points *against* it. See Task 4.
- 🔴 **Meta's dashboard — none of it.** Whether `smb_message_echoes` / `history` / `smb_app_state_sync` are subscribed; whether the HTTPS host is on the allowed domains; the app's mode. All yours.
- ⚠️ **The `smb_message_echoes` payload is documentation, not observation.** I quoted Meta's example; **no echo has ever reached this system**, and the trap I flagged (customer in `to`, not `from`) is read off that example, not seen in traffic.
- ⚠️ **The `history` / `smb_app_state_sync` webhook payload shapes** — not fetched. Task 3 was scope-only and the handling is separate work.
- 🔴 **No real Meta call has ever been made by any of this code.** Every proof runs against a scripted Graph.
- ⚠️ **The route has never run inside Next.js** — `runtime`, `maxDuration` and request parsing remain source-read only.
- ⚠️ **Nothing was rendered in a browser this stage.**

# FLAGS

- 🟢 **The 60-day fabrication is gone, with no fallback**, and the expiry now comes from Meta or the token is not stored.
- 🔴 **If this configuration issues permanent tokens, no truck can connect** — by design, loudly, rather than silently storing an invented date. Relaxing the CHECK in a migration is the fix if that turns out to be the norm.
- 🔴 **`REAUTHORISE_BEFORE_EXPIRY_DAYS = 14` is now unmoored** — 🧪 executed: a 24-hour token would show the "needs renewing" prompt for its entire life. Re-sit it on the first observed `expires_in`.
- 🔴 **The double-reply defect is LATENT and goes LIVE on the first real coexistence onboarding** — the same event that starts the unbuilt 24-hour sync clock.
- 🔴 **Coexistence engagement now has evidence AGAINST it.** One test with a qualifying WhatsApp Business app account settles it.
- 🔴 **`app/api/webhooks/messenger/route.ts:43` and `instagram/route.ts:43` still read the deleted `META_APP_SECRET`** and will 401 every genuine delivery. Carried forward, still unfixed, still a different app family's decision.
- ⚠️ **`GRAPH_API_VERSION = 'v19.0'`** remains past deprecation and shared with the template calls. Reported, unchanged.

*Nothing committed. Nothing staged. `main` = `2ca66cd`. No Meta call has ever been made by this code.*
