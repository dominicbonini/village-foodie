# WhatsApp per-truck architecture — design pass

**PROMPT INTEGRITY.** No span of the brief arrived garbled.
**STOP CONDITIONS: NEITHER FIRED.** No instruction contradicts another, and Phase 1 found no
unanticipated consumer of the send path — see 1.2, where the complete caller set is two functions with
one call site each.

**WHAT WAS BUILT:** one file, `lib/whatsapp/connection-state.ts` — pure, imported by nothing.
Justified in Phase 4. **Nothing else was created, edited or deleted. No migration was applied. No SQL
was run. The send path was not touched. No `next dev`, no `next build`.**

🔴 **NOTHING HERE HAS BEEN EXERCISED AGAINST META, AND NOTHING HERE CAN BE.** There is no Meta App ID
in this project, no sandbox WABA, and no captured Embedded Signup payload. Every statement about
Meta's behaviour in Phase 2 and Phase 3 is **INFERRED from the external facts supplied in the brief**,
not read from code and not observed. Where a design decision depends on a Meta behaviour I cannot
check, it is marked and the thing that would settle it is named.

---

# 🔴 CORRECTION TO THE PRIOR REPORT, BEFORE ANYTHING ELSE

`docs/whatsapp-current-state-read.md` §6.2 states:

> Notably: **Stripe is a single platform-level `STRIPE_SECRET_KEY`, not Stripe Connect.**
> `grep -rn "stripe_account_id"` over `app`, `lib` and `supabase` returns **nothing** — so there is no
> existing precedent in this repo for "a per-merchant credential obtained through a provider's
> onboarding flow".

**THAT IS WRONG, AND IT IS THE MOST IMPORTANT CLAIM IN THIS TASK.** Stripe Connect is fully built:
`operators.stripe_account_id`, a state machine, a status route, a webhook sync branch and a settings
tab. The grep that produced the false negative was run from inside `supabase/migrations/` as part of a
compound `cd` command, so the paths `app lib supabase` did not resolve and it searched nothing. The
correct search, run from the repository root, returns hits in nine files.

The brief predicted this precedent would be the most useful thing in Phase 1. It was. Sections 1.4 and
2.a are built on it.

---

# PHASE 1 — READ

## 1.1 The full send path, end to end

### The only sender — `lib/meta-whatsapp.ts`, quoted whole (26 lines)

```ts
export async function sendMetaWhatsApp(
  to: string,
  message: string,
  phoneNumberId: string
): Promise<void> {
  const toDigits = to.replace(/^\+/, '')

  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toDigits,
      type: 'text',
      text: { body: message },
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Meta WhatsApp error ${res.status}: ${err}`)
  }
}
```

| Aspect | What is there | Mark |
|---|---|---|
| **URL construction** | `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`. The API version is a hard-coded literal — `v19.0` appears nowhere else and is not configurable. | READ |
| **Auth header** | `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}` — read INSIDE the function, at call time, from the module-global environment. **No truck parameter exists on the signature.** | READ |
| **Token read sites** | 🔴 **EXACTLY ONE, and it is this line.** `grep -rn "META_WHATSAPP_ACCESS_TOKEN"` over the tree outside `docs/` returns one hit. That is the single most useful fact for the rewrite: the blast radius of changing how a token is obtained is one line in one file. | READ |
| **Retries** | 🔴 **NONE.** No loop, no backoff, no retry-after handling, no idempotency key. One attempt. | READ, from absence — the whole file is quoted above |
| **Error handling** | Throws an `Error` carrying the HTTP status and Meta's raw body text. It never returns a failure value. | READ |
| **Rate limiting / windows** | None. No 24-hour-window check, no template fallback, no per-number throttle. | READ, from absence |
| **Return type** | `Promise<void>` — 🔴 **THE CALLER CANNOT LEARN ANYTHING EXCEPT "IT THREW".** No message id, no Meta response, nothing to log. | READ |

### The only call site — `app/api/webhooks/meta/whatsapp/route.ts:262-284`

```ts
    // Fire-and-forget interaction log — never blocks the response
    supabase.from('whatsapp_logs').insert({
      truck_id:        truck.id,
      customer_number: from,
      message_in:      text,
      classification,
      events_found:    events?.length ?? 0,
      response_sent:   reply ?? null,
      possible_miss:   classification === 'SPECIFIC_QUERY' && (events?.length ?? 0) === 0,
    }).then(({ error }) => {
      if (error) console.error('[webhook/meta-whatsapp] log failed:', error)
    })

    if (!reply) {
      // IGNORE bucket — logged above, no message sent
      return NextResponse.json({ ok: true })
    }

    try {
      await sendMetaWhatsApp(from, reply, phoneNumberId)
      console.log('[webhook/meta-whatsapp] reply sent')
    } catch (err) {
      console.error('[webhook/meta-whatsapp] send failed:', err)
    }

    return NextResponse.json({ ok: true })
```

Three properties, all **READ**, and all three are load-bearing for the design:

1. 🔴 **`phoneNumberId` COMES FROM META'S OWN PAYLOAD, NOT FROM THE TRUCK ROW.** It is
   `value.metadata.phone_number_id` — echoed straight back. The truck row IS read (and carries
   `phone_number_id`), but the send does not use it. So the send is already addressed per-truck by
   construction and cannot address the wrong number.
2. 🔴 **THE LOG ROW IS WRITTEN BEFORE THE SEND AND IS NEVER CORRECTED.** `response_sent` records the
   text we intended to send. A throw is caught and only `console.error`d. **A row saying a reply was
   sent is not evidence that one was**, and the report surface at `/api/manage` counts those rows as
   "handled".
3. 🔴 **A FAILED SEND IS INVISIBLE TO THE OPERATOR.** There is no column, no banner, no email, no
   counter. It exists only in a Vercel function log.

### The legacy Twilio sender — `lib/twilio.ts:11-34`

```ts
export async function sendWhatsApp(to: string, body: string, from?: string): Promise<void> {
  const toFormatted  = to.startsWith('whatsapp:')   ? to   : `whatsapp:${to}`
  const fromFormatted = from
    ? (from.startsWith('whatsapp:') ? from : `whatsapp:${from}`)
    : fromWa
  ...
      'Authorization': `Basic ${auth()}`,
```

`accountSid` / `authToken` / `fromWa` are module-level `process.env` reads with `!` assertions. Its
only call site is the Twilio webhook, which passes `toNumber` (the truck's `whatsapp_sender`). **Same
shape as Meta's: per-truck FROM, one platform credential.** READ.

## 1.2 Every consumer of a WhatsApp send, and what a missing per-truck token would break

**The complete set, established by `grep -rn "sendMetaWhatsApp"` and `grep -rn "sendWhatsApp\b"` over
the tree excluding `docs/`: four hits total — one definition and one call site each.**

| Consumer | What it is | What breaks if the truck has no token |
|---|---|---|
| **Auto-reply on inbound WhatsApp** (`meta/whatsapp/route.ts:280`) | The only live sender. Customer asks a question, Gemini answers, we reply. | The reply is not sent. **The customer's message is simply never answered.** Today that already happens silently; the design's §2c makes it visible. **The webhook must still return 200** — a non-2xx makes Meta retry a message we will never be able to answer, and repeated non-2xx eventually makes Meta disable the subscription, which would break every OTHER truck on the same app. 🔴 **This is the one hard constraint the send rewrite must not violate.** |
| **Auto-reply on inbound Twilio WhatsApp** (`whatsapp/route.ts:119`) | Dormant duplicate path. | Unaffected — different provider, different credential. It would remain on the platform Twilio account until retired. |
| **The classifier** (`lib/whatsapp-classifier.ts`) | Does **not** send. It returns `{reply, classification}`; the route sends. It does call **Gemini**, which costs money. | Nothing breaks, but 🔴 **a token check placed AFTER the classifier spends a Gemini call on a message that can never be answered.** The design puts the check before it. |
| **Order notifications** | 🔴 **DO NOT EXIST ON WHATSAPP.** `formatWhatsAppOrder` in `app/api/orders/submit/route.ts:75` has **no call site** — its own comment records that a repo-wide grep finds exactly one occurrence, the definition. Order notifications go by **email** (`lib/email.ts`). | Nothing. |
| **`lib/email.ts` "WhatsApp us" line** | Renders a `wa.me/` **link** into customer emails from `whatsappSender ?? contactPhone`. No API call. | Nothing — it is a hyperlink, not a send. But ⚠️ it would show a **stale number** if a truck onboards a different number through Embedded Signup and `whatsapp_sender` is not updated. Named in §2.a. |
| **`components/EventListCard.tsx`** | A `wa.me/` deep link on the discovery card. No API call. | Nothing. |

**✅ STOP CONDITION NOT MET.** There is no scheduled sender, no cron, no order-confirmation send, no
marketing send and no admin broadcast. **A per-truck token can only ever break the inbound auto-reply**,
and the failure mode is bounded to one truck provided the webhook keeps answering 200.

## 1.3 How this codebase stores anything sensitive today

**Every secret is a plain platform environment variable read through `process.env`.** The complete set
read anywhere under `app/` and `lib/`, from `grep -rhno "process\.env\.[A-Z0-9_]*"`:

```
APNS_BUNDLE_ID APNS_ENV APNS_KEY APNS_KEY_ID APNS_TEAM_ID BREVO_API_KEY CRON_SECRET
EMAIL_FROM_ADDRESS FCM_SERVICE_ACCOUNT_JSON GEMINI_API_KEY INBOUND_SCHEDULE_SECRET
META_APP_SECRET META_WEBHOOK_VERIFY_TOKEN META_WHATSAPP_ACCESS_TOKEN ... STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET SUPABASE_SERVICE_ROLE_KEY TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN ...
```

**There is no encryption anywhere.** `grep -lEi "pgsodium|pgp_sym_encrypt|vault\." supabase/migrations/*.sql`
returns **no files**; `lib/crypto.ts` **does not exist**; there is no `ENCRYPTION_KEY`. The reference
manual references both at `:7905` and `:9552` as part of the *parked* Messenger work — they describe an
intention, not an artefact. **READ.**

### The one secret-shaped column that exists, and how it is defended

`trucks.messenger_page_token`, added 23 May 2026, **plaintext `text`, never written, never read**. Its
only defence is at the response boundary — `app/api/dashboard/route.ts`:

```ts
const TRUCK_REDACT = new Set([
  'dashboard_token', 'dashboard_pin', 'kds_pin',
  'messenger_page_token', // Meta provider credential (ditto — exists, unreferenced here)
  'whatsapp_sender', 'sheet_id',
])
/** Segment-anchored: matches dashboard_pin / page_token / api_key / *_secret, not "shipping"/"keyboard". */
const SECRETISH = /(^|_)(token|secret|password|credential|pin|key)(_|$)/i

function publicTruckFields(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(row ?? {})) {
    if (TRUCK_REDACT.has(k) || SECRETISH.test(k)) continue
    out[k] = v
  }
  return out
}
```

🔴 **THAT IS A FILTER, NOT A WALL, AND THE COMMENT ABOVE IT SAYS WHY IT HAS TO BE.** The route reads
`trucks` with `select('*')` — deliberately, because an include-list "fails by OMISSION, which is silent
and breaks things". So every column on `trucks` is fetched into the server's memory on every dashboard
load and is one forgotten redaction away from the wire. **READ.**

### The honest answer to the question asked

**A per-truck WhatsApp business token in a plaintext column WOULD BE CONSISTENT WITH EXISTING PRACTICE
IN FORM AND A DEPARTURE IN CONSEQUENCE.**

- **Consistent in form:** `messenger_page_token` is precisely that column, added deliberately, with a
  comment saying "Treat as secret — do not expose to client". The pattern is already sanctioned.
- **A departure in consequence, in two ways.** First, `messenger_page_token` has **never held a value**,
  so the pattern has never actually been trusted with a live credential. Second, and decisively:
  **every other secret in this codebase lives in the platform environment, where a database dump, a
  backup, a mis-scoped RLS policy or a `select('*')` cannot reach it.** Moving a live sending credential
  from that trust boundary into a table row is a genuine change of risk class, and the brief is right to
  say so. Options and a recommendation are in §2.b.

## 1.4 🔴 THE PRECEDENT: how a per-truck external credential is handled today — Stripe Connect

**This is fully built and it is the pattern to mirror.**

### Storage — `supabase/migrations/20260810_operators_stripe_connect.sql`

```sql
alter table operators
  add column if not exists stripe_account_id text,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_account_synced_at timestamptz;

create unique index if not exists operators_stripe_account_id_key
  on operators (stripe_account_id)
  where stripe_account_id is not null;
```

plus `20260811_operators_stripe_account_livemode.sql` adding `stripe_account_livemode boolean`.

Four decisions in that migration are directly transferable, and all four are **READ** from its own
comments:

1. 🔴 **ON `operators`, NOT `trucks`** — "ONE connected account PER OPERATOR… a per-truck account is not
   needed for multi-truck and would actively get in the way of Terminal later." With the stated
   consequence spelled out: "`charges_enabled` is an ACCOUNT property, so **all of an operator's trucks
   go live together**."
2. 🔴 **READINESS IS A SEPARATE COLUMN FROM EXISTENCE** — "`stripe_account_id` being non-null means an
   account was CREATED. It says nothing about whether that account can take money… the readiness column
   is SEPARATE and is the only thing any consumer may test." And: "NOT NULL DEFAULT false because absent
   must mean NOT READY."
3. ⚠️ **THE READINESS COLUMN IS A CACHE, NOT THE TRUTH** — "Stripe is the truth… If they ever disagree,
   Stripe wins — re-read and overwrite." Kept fresh two ways: the `account.updated` webhook branch and
   reconcile-on-tab-open.
4. 🔴 **UNIQUE ON THE PROVIDER ID** — "Without this a retried create could attach the same `acct_…` to
   two operator rows, and the webhook's `account.updated` branch (which looks the operator up BY account
   id) would then update an arbitrary one of them."

### The read — `lib/payments/authorize.ts:246-261`

```ts
export async function stripeAccountForTruck(
  supabase: SupabaseClient,
  truckId: string,
): Promise<string | null> {
  const { data: truck } = await supabase.from('trucks').select('operator_id').eq('id', truckId).single()
  if (!truck?.operator_id) return null
  const { data: operator } = await supabase
    .from('operators').select('stripe_account_id, stripe_account_livemode').eq('id', truck.operator_id).single()
  const mismatch = describeAccountModeMismatch(operator?.stripe_account_livemode)
  if (mismatch && operator?.stripe_account_id) {
    console.error(
      `[authorize] 🔴 MODE MISMATCH truck=${truckId} account=${operator.stripe_account_id} — ${mismatch}`,
    )
  }
  return operator?.stripe_account_id ?? null
}
```

**ONE resolver, truck-id in, provider-identifier-or-null out, used by every money path** — "capture,
refund, promotion, the submit route's cancel and the stale-authorisation sweep. One read, one log."

### The state machine — `lib/stripe/payments-state.ts`

A pure, import-free module (so a client component can use it) exporting one enum and one derivation:

```ts
export type PaymentsState =
  | 'not_connected' | 'requirements' | 'pending' | 'ready' | 'restricted' | 'unsupported'

export function derivePaymentsState(input: PaymentsStateInput): PaymentsState {
  if (!input.accountId) return 'not_connected'
  if (input.chargesEnabled) return 'ready'
  if (input.cardPaymentsStatus === 'unsupported') return 'unsupported'
  if (input.cardPaymentsStatus === 'pending') return 'pending'
  return input.detailsSubmitted ? 'restricted' : 'requirements'
}
```

with three companion predicates — `shouldMountNotificationBanner`, `shouldShowOnboarding`,
`shouldOfferAccountManagement` — so the tab renders **exactly one** next action. Its header states the
reason: "at any moment at most ONE of them is the next action, and the others are noise or an empty box."

### The status route and the webhook sync

`app/api/stripe/connect/route.ts` — actions `status` (re-reads Stripe, writes the cache),
`requirements` (single cheap read, writes nothing, badge only), `create_account`, `account_session`.
`app/api/webhooks/stripe/route.ts` — the `account.updated` branch updates
`stripe_charges_enabled` + `stripe_account_synced_at`, **keyed on `stripe_account_id`** (hence the
unique index), with strict-boolean guards so "a missing or non-boolean `charges_enabled` must not be
coerced — reading `undefined` as false would revoke a working truck's readiness on a malformed payload."

### 🔴 WHERE THE PRECEDENT FITS, AND THE ONE PLACE IT DOES NOT

| Dimension | Stripe Connect | WhatsApp / Meta | Transferable? |
|---|---|---|---|
| Provider identifier stored on our side | `stripe_account_id` | `waba_id` | ✅ directly |
| Per-unit sub-identifier | Terminal `Location` per truck (not built) | `phone_number_id` per truck (**column exists**) | ✅ directly |
| Readiness cached separately from existence | `stripe_charges_enabled` | payment-method / messaging readiness | ✅ directly |
| Freshness | webhook + reconcile-on-open, Stripe wins | Meta webhook + reconcile-on-open, Meta wins | ✅ directly |
| Unique index on the provider id | yes, and the reason is stated | yes, same reason | ✅ directly |
| One resolver function, truck-id in | `stripeAccountForTruck` | `whatsAppSenderForTruck` | ✅ directly |
| Pure state machine + one next action | `payments-state.ts` | built in Phase 4 | ✅ directly |
| **Do we hold a per-merchant SECRET?** | 🔴 **NO.** Direct charges call with the **platform key** plus `{ stripeAccount: 'acct_…' }`. The stored value is an **identifier**, not a credential — it is safe in plaintext because holding it grants nothing. | 🔴 **YES.** A Meta business token **is** the credential. Holding it lets its holder send as that truck. | ❌ **DOES NOT TRANSFER** |

**That last row is the whole of the new problem.** Everything else about the WhatsApp design can be a
copy of Connect. The token has no precedent in this repository, which is why §2.b presents options
rather than a decision.

## 1.5 The feature gate, the settings UI, and every surface that would show a connection state

### The gate

`whatsapp_replies` is a member of `PRO_FEATURES`, which `MAX_FEATURES` spreads and `TRIAL_FEATURES`
copies. So: **pro ✅ max ✅ trial ✅ tester ✅ demo ✅ starter ❌**, with a per-truck
`feature_overrides` entry beating plan and trial expiry both, because `canAccess` tests it first.
Enforced in exactly three places — the Meta webhook (`:207`), the Twilio webhook (`:55`), and the
settings row (`can('whatsapp_replies')`). **READ.**

### The settings control today — `app/manage/[token]/page.tsx:8980-9013`

A `type="tel"` input bound to `whatsappSender`, saved on blur and by a button labelled **"Connect"**
that runs `api('update_truck', { data: { whatsapp_sender } })` and toasts *"WhatsApp number saved"*.
Its own comment: *"It does not connect anything and must not be made to look as though it does — the
label is the operator's word for the step they will wire up separately, not a claim about state."*

🔴 **THE ENTIRE SUBSECTION IS HIDDEN IN THE NATIVE APP**, wrapped in `{!isNativeApp() && (<>…</>)}`,
because *"Self-serve WhatsApp onboarding for trucks is not built, so this subsection must not appear in
the build going to App Review."* **This is a hard constraint on where a connection UI may live**: the
moment a real connection flow exists, that wrapper's justification changes, and unwrapping it is an App
Review decision, not a styling one.

### Surfaces that would need a connection state

| Surface | Today | What it would need |
|---|---|---|
| **Manage → Settings → Auto-replies** | free-text number + "Connect" | the primary state card: badge, one next action, and the failure copy. The direct analogue of `components/manage/PaymentsTab.tsx` |
| **Manage → Payments tab badge** | `stripeActionRequired` fetched on mount at `page.tsx:378` | the identical pattern for WhatsApp — a cheap `requirements`-style read that writes nothing |
| **Dashboard** | nothing WhatsApp-related | ⚠️ **the only place an operator is actually looking during service.** A `revoked` connection means customers are being ignored right now. A dashboard notice is the difference between "found out in a week" and "found out in an hour" |
| **Admin console** (`app/admin/page.tsx`) | per-truck `feature_overrides` tickboxes; no Stripe fields | a read-only connection column, for support. `token_missing` is a state only support can act on |
| **`lib/email.ts`** | renders `whatsappSender ?? contactPhone` into a `wa.me/` link | ⚠️ would print a **stale** number if onboarding produces a different one |
| **Native app** | subsection hidden entirely | an explicit decision, not a default. See §3 risk R9 |

---

# PHASE 2 — DESIGN

**Written, not built.** Everything below is a proposal.

## 2.a The data model

### The shape, and why it splits across three places

Meta's model maps onto this codebase's existing split almost exactly:

- **A WABA belongs to a BUSINESS.** An operator is the business. → `operators`, mirroring
  `stripe_account_id`.
- **A phone number belongs to a WABA and is used by one truck.** → `trucks`, where
  `phone_number_id` **already lives**.
- **A token is a credential, not an identifier**, and is the only thing whose storage is a real
  decision. → its own table, for the reasons in §2.b.

```
operators                          trucks                        whatsapp_connections
─────────                          ──────                        ────────────────────
id                                 id                            operator_id  (PK, FK)
stripe_account_id      ← existing  operator_id     ← existing     token_ciphertext
whatsapp_waba_id       ← NEW       phone_number_id ← EXISTS       token_iv / token_tag
whatsapp_status        ← NEW       whatsapp_sender ← existing     token_written_at
whatsapp_synced_at     ← NEW                                      token_revoked_at
whatsapp_coexistence   ← NEW                                      last_send_error_at
whatsapp_payment_ok    ← NEW                                      last_send_error
```

### Column by column

| Column | Type | Mirrors | Notes |
|---|---|---|---|
| `operators.whatsapp_waba_id` | `text` nullable, **partial UNIQUE where not null** | `stripe_account_id` | The Embedded Signup return value. NULL = never onboarded. 🔴 **Non-null does NOT mean ready** — the same warning Connect's comment carries. UNIQUE for the same stated reason: a webhook that looks an operator up BY waba id must not be able to hit an arbitrary row |
| `operators.whatsapp_status` | `text` NOT NULL DEFAULT `'not_connected'` | `stripe_charges_enabled` | **A CACHE, NOT THE TRUTH. Meta is the truth.** Kept fresh by a Meta webhook branch and by reconcile-on-tab-open. Defaulted to the safe value so absent means not connected. ⚠️ Text rather than boolean because WhatsApp has more than two meaningful states (§ the enum in Phase 4) |
| `operators.whatsapp_synced_at` | `timestamptz` nullable | `stripe_account_synced_at` | Diagnostic only. Nothing gates on it. A stale timestamp beside a `ready` status is the signal that reconcile has stopped |
| `operators.whatsapp_payment_method_ok` | `boolean` **nullable** | — | 🔴 **NULLABLE ON PURPOSE, unlike `stripe_charges_enabled`.** NULL means UNREAD. Defaulting it false would tell every operator they have not paid Meta before we have ever asked |
| `operators.whatsapp_coexistence` | `boolean` NOT NULL DEFAULT `false` | — | Did they onboard their EXISTING WhatsApp Business app number? ⚠️ **This is not cosmetic**: under coexistence the operator keeps answering in their own app, so our auto-replies land in a conversation a human is also in. Copy, and possibly the reply policy, differ. Default `false` is the safe direction — it assumes the simpler case and can only be wrong toward showing less |
| `trucks.phone_number_id` | `text`, **already exists**, partial-unique | Terminal `Location` | ✅ **NO MIGRATION NEEDED.** What it needs is a **writer** |
| `whatsapp_connections.*` | see §2.b | — | The token, alone, in its own table |

### Three decisions worth stating

1. 🔴 **WABA ON `operators`, PHONE NUMBER ON `trucks` — AND THE CONSEQUENCE IS THE SAME ONE CONNECT
   ACCEPTED.** An operator onboards once; all their trucks share the WABA, so a revocation takes them
   all out together, exactly as `charges_enabled` takes all their trucks live together. That symmetry
   is worth more than per-truck independence, and Meta's own model does not offer per-truck WABAs to a
   single business anyway. **INFERRED** from the brief's statement that signup returns "a WABA id and a
   phone number id per onboarded customer"; **CANNOT DETERMINE** whether Meta permits one business
   several WABAs — the Meta Business Manager account would settle it, and if it does, this decision
   should be revisited before any migration is applied.
2. ⚠️ **`whatsapp_sender` IS NOT RETIRED AND MUST NOT BE.** It is a **display** number reaching
   customers through `lib/email.ts`, and it is the webhook's routing **fallback** for trucks with no
   `phone_number_id`. Onboarding should **write it from Meta's `display_phone_number`** so the two
   cannot drift — that is the fix for the stale-number risk in §1.5.
3. 🔴 **NOTHING ABOUT THIS TOUCHES THE RECEIVING PATH.** `phone_number_id` routing already works. The
   only change onboarding makes to inbound is that the column finally gets a writer, which lets the
   `whatsapp_sender` fallback be retired later — as its own comment already asks.

## 2.b 🔴 TOKEN STORAGE — OPTIONS, COSTS, AND A RECOMMENDATION

**The decision is yours. What follows is the case for each, honestly costed.**

**The threat, stated plainly so the options can be compared against it:** a Meta business token lets
its holder send WhatsApp messages *as that truck*, to that truck's customers. It is not a read
credential and it is not scoped to our app's data. The realistic attacker is not "someone breaks
Postgres" — it is a **database dump**, a **backup restored somewhere less careful**, a **support
export**, or a **`select('*')` that reaches a response**, all of which this codebase has already
reasoned about once (the `TRUCK_REDACT` comment exists because that class of leak is expected).

### Option 1 — plaintext column

| | |
|---|---|
| **Shape** | `operators.whatsapp_token text`, or a column on the connections table |
| **Complexity cost** | 🟢 **Lowest.** One column, one read, no new dependency, no key management, no local-dev setup. `SECRETISH` already redacts any name containing `token` from the dashboard response |
| **What it buys** | Nothing beyond working |
| **What it costs** | 🔴 The credential is in every database dump, every backup, every PITR snapshot, and every `select('*')` result held in server memory. RLS (service-role only) protects the API surface, not the artefacts |
| **Consistent with practice?** | In FORM yes (`messenger_page_token`); in CONSEQUENCE no — no live credential has ever been stored this way here (§1.3) |

### Option 2 — Supabase Vault / `pgsodium`

| | |
|---|---|
| **Shape** | Token in `vault.secrets`; the row stores a secret id |
| **Complexity cost** | 🟠 **Moderate-to-high, and partly unknown.** ⚠️ **CANNOT DETERMINE whether Vault or `pgsodium` is available on this project** — no migration references either, and `trucks` predates `supabase/migrations/` so the folder is not a complete picture of the database. `select * from pg_extension` or the Supabase dashboard's Extensions page would settle it. Beyond availability: a decrypt call on every send, a key-management story, and local development that no longer works from a plain connection string |
| **What it buys** | 🟢 The strongest at-rest story. A plain dump yields ciphertext |
| **What it costs** | A second secret system with its own failure modes, in a codebase that currently has exactly one (`process.env`) |

### Option 3 — app-level AES-256-GCM, key in the platform environment

| | |
|---|---|
| **Shape** | `token_ciphertext` / `token_iv` / `token_tag`; encrypt/decrypt in a small `lib/whatsapp/token-crypto.ts` with `WHATSAPP_TOKEN_KEY` from `process.env`. **This is the parked `lib/crypto.ts` + `ENCRYPTION_KEY` design the reference manual already describes at `:9552`** |
| **Complexity cost** | 🟡 **Moderate.** Roughly 80 lines using `node:crypto` (already used by `lib/meta/webhook-signature.ts` and `lib/stripe/webhook-signature.ts`), plus a documented rotation procedure. No new dependency, no extension |
| **What it buys** | 🟢 A dump, a backup or a stray `select('*')` yields **ciphertext**. The key lives in the platform environment — **the same trust boundary as `STRIPE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY`**, which is where every other secret here already is |
| **What it costs** | 🔴 It is **not** protection against a compromised server process — anything that can read `process.env` can decrypt. It raises the bar on the artefact classes that actually leak, and no further. **Say that out loud rather than calling it "encrypted at rest" and stopping** |

### Option 4 — do not store it at all

Two variants, and they are not equally viable.

| Variant | Verdict |
|---|---|
| **Re-fetch on demand** | 🔴 **INFERRED NOT POSSIBLE.** A business token is issued once by the code exchange. There is no refresh-token grant to re-derive it from — re-obtaining one means re-running Embedded Signup, which requires the operator to be present. **CANNOT DETERMINE with certainty**; Meta's Embedded Signup v4 token documentation would settle it, and if a refresh grant does exist this option becomes the strongest of the four and should win |
| **Keep sending under the platform token** | This is the **status quo**, and it is not obviously wrong: if every onboarded number sits under WABAs our app is a Tech Provider for, one platform token may address them all. 🔴 **But the brief states Tech Providers use business tokens exclusively**, which contradicts it. ⚠️ **CANNOT DETERMINE** — this is a question for Meta's Tech Provider documentation or partner support, and it is worth asking **before building anything**, because a "yes" removes this entire section |

### 🔴 RECOMMENDATION — Option 3, in a separate table. Not a decision.

**Recommended: app-level AES-256-GCM (Option 3), with the ciphertext in a dedicated
`whatsapp_connections` table rather than on `operators` or `trucks`.**

Four reasons, in order of weight:

1. **It keeps the key inside the trust boundary this codebase already uses for everything else.** No
   new secret system, no availability question, no local-dev cliff.
2. **A separate table is worth as much as the encryption.** `operators` and `trucks` are read with
   `select('*')` by live routes; the dashboard's own comment explains that an include-list "fails by
   OMISSION, which is silent". A token on those tables is one forgotten redaction from the wire. A
   table nothing else selects from cannot be swept up by accident.
3. **It is proportionate to the actual threat** — dumps, backups, exports — without pretending to solve
   process compromise.
4. **It is the design already banked in the manual**, so it is not a new pattern, it is the parked one.

**Take Option 1 instead if** the answer to Option 4's second variant turns out to be "the platform token
works", making per-truck tokens a fallback rather than the mechanism — in which case the encryption
would be ceremony around a value that is rarely used.

**Take Option 2 instead if** Vault turns out to be already enabled AND you expect to store further
per-merchant credentials later, at which point one proper secret system beats three ad-hoc ones.

**🔴 SETTLE OPTION 4's SECOND VARIANT FIRST.** It is one question to Meta and it can delete this entire
section. Do not build token storage before asking it.

## 2.c The send rewrite

**Not built in this task, by instruction. This is the design to read first.**

### The resolver, mirroring `stripeAccountForTruck`

```
resolveWhatsAppSender(supabase, truckId)
  →  { ok: true,  phoneNumberId, token }
  |  { ok: false, reason: 'not_connected' | 'onboarding_incomplete'
                        | 'token_missing' | 'revoked' | 'feature_not_granted' }
```

One function, truck-id in, credential-or-a-named-reason out — the shape `stripeAccountForTruck` already
proves in this codebase. 🔴 **It returns a REASON, not `null`.** Connect's resolver returns `null` and
logs; that is right for Connect because "no account" is an ordinary state with a complete alternative
(pay at the hatch). Here there is no alternative — the customer simply gets no answer — so the caller
must be able to say **which** thing is wrong, on the operator's screen.

### `sendMetaWhatsApp` changes shape

```ts
export async function sendMetaWhatsApp(args: {
  to: string
  message: string
  phoneNumberId: string
  accessToken: string          // 🔴 REQUIRED. Passed in. Never defaulted.
}): Promise<SendOutcome>
```

Two rules, and the first is structural rather than a matter of discipline:

1. 🔴 **DELETE THE `process.env.META_WHATSAPP_ACCESS_TOKEN` READ FROM THE MODULE ENTIRELY.** Not "prefer
   the per-truck token" — **remove the fallback so that falling back is not expressible**. A `??`
   between a truck's token and the platform's is a line that will one day send one truck's message
   under another's identity, and no amount of comment prevents it. With the parameter required and the
   env read gone, the type system enforces it.
2. 🔴 **RETURN AN OUTCOME, DO NOT THROW.** `Promise<void>` + throw is why a failed send is invisible
   today. `SendOutcome` should carry `{ ok: true, messageId }` or
   `{ ok: false, status, metaCode, metaMessage }` so the caller can persist it.

### The call site, reordered

```
verify signature → parse → route to truck → 🔴 RESOLVE THE SENDER  → gate on plan
  → classify (Gemini)  → log  → send → 🔴 RECORD THE OUTCOME → 200
```

Two changes to the order, both deliberate:

- 🔴 **RESOLVE BEFORE THE CLASSIFIER.** Today the Gemini call happens first. A truck that cannot send
  should not cost a Gemini call per inbound message — that is real money spent to produce a reply that
  is discarded.
- 🔴 **THE LOG ROW MUST STOP LYING.** Either move the insert after the send, or add `send_status` /
  `send_error` and update the row. `response_sent` currently means "what we intended to send", while
  `/api/manage` counts those rows as `handled`. **Whichever is chosen, the operator-facing report must
  not count an unsent reply as handled.**
- ✅ **STILL RETURN 200 IN EVERY CASE.** Non-2xx makes Meta retry and eventually disables the
  subscription for the whole app — which would break every other truck (§1.2).

### 🔴 FAILING VISIBLY — the requirement the brief sets, made concrete

A send that cannot happen must reach the operator through **three** surfaces, because no one of them is
reliably being looked at:

1. **Durable, in the row** — `whatsapp_connections.last_send_error` / `last_send_error_at`, plus the
   per-message `send_status` on `whatsapp_logs`. Without this, nothing else can be built later.
2. **In settings** — the connection card's state badge and its one next action (§2.d).
3. **On the dashboard** — 🔴 **the only screen an operator has open during service.** A `revoked` or
   `token_missing` connection means customers are being ignored **right now**; a settings badge they
   will next see on Tuesday is not a notification.

⚠️ **AN EMAIL IS WORTH CONSIDERING AND IS NOT PROPOSED HERE**, because this codebase's own copy rules
warn against alerts that assert more than was checked, and a first revocation alert deserves its own
decision about wording and frequency.

## 2.d The onboarding flow, from the operator's point of view

**INFERRED THROUGHOUT from the brief's external facts. Nothing here has been exercised against Meta.**

### The steps

| # | Step | Where | What can go wrong |
|---|---|---|---|
| 0 | Operator opens Settings → WhatsApp. Feature gate `whatsapp_replies` decides whether they see a live card or an upsell | our site | plan does not grant it |
| 1 | They read what connecting involves — including 🔴 **that they will pay Meta directly for conversations, and we bill only for our app** — and press **Connect WhatsApp** | our site | — |
| 2 | Meta's Embedded Signup launches (JS SDK, our page) | Meta, in our page | popup blocked; they close it; they have no Facebook Business account |
| 3 | 🔴 **THE COEXISTENCE CHOICE.** Use the existing WhatsApp Business app number, keeping one-to-one chat and history in that app — or create a new number. **The first is the common case: every food truck already has WhatsApp Business on a phone with that number on their flyers** | Meta's flow | they pick "new number" by accident and lose the number customers know |
| 4 | Meta returns an exchangeable **code** to our page | our page | user closes before it arrives → **partial completion, nothing stored** |
| 5 | Our server exchanges the code for a **business token** | our server → Meta | exchange fails, times out, or returns an unusable token → 🔴 **`token_missing`: identifiers may exist, sending cannot** |
| 6 | We store `waba_id`, `phone_number_id`, the token, and write `whatsapp_sender` from `display_phone_number` | our DB | partial write → the state machine must express it |
| 7 | 🔴 **THE OPERATOR ADDS A PAYMENT METHOD IN THEIR OWN WHATSAPP BUSINESS ACCOUNT.** We cannot do this for them and must not imply we have | Meta, outside our site | they never do it → sends fail at Meta with everything on our side correct |
| 8 | We verify and show **Connected** | our site | — |

### 🔴 EVERY STATE THE UI MUST REPRESENT

These are the six in the enum built in Phase 4, with the copy rule for each:

| State | What it means | Next action | 🔴 The copy trap |
|---|---|---|---|
| `not_connected` | never onboarded | **Connect WhatsApp** | ⚠️ Not an error and not a nag. Following `PaymentsTab`'s own correction — *"Not set up", NOT "Not connected"* — a truck that has never wanted this is not broken |
| `onboarding_incomplete` | WABA exists, no phone number id — **abandoned or the number step never finished** | **Finish connecting** | Must be true of both "closed it immediately" and "got halfway", exactly as `payments-state` writes `requirements` to be true of both. We cannot tell them apart |
| `token_missing` | identifiers complete, no usable token | 🔴 **NO BUTTON.** Say it plainly and route to support | A "Reconnect" button here is an instruction that can never succeed. This is the state the enum exists to keep separate |
| `revoked` | was working, access withdrawn at Meta | **Reconnect** | 🔴 The **interruption** state. It must not share copy with `not_connected` — "customers are not getting replies" is the message, not "set this up" |
| `awaiting_payment_method` | our side complete, Meta reports no payment method | **Open Meta's billing settings** | 🔴 Must be explicit that **they pay Meta, not us**, or it reads as our billing failing |
| `ready` | connected and able to send | none | ⚠️ Never say "your customers will get instant replies" — Meta can still refuse on window or rate limits |

⚠️ **DO NOT BUILD A PROGRESS BAR.** `payments-state`'s header records why for Stripe — the provider owns
the steps and warns they "can appear in any order and can repeat". Embedded Signup is Meta's flow inside
our page; the same reasoning applies with equal force.

## 2.e Templates — and why they come BEFORE the wizard

**The claim in the brief is that Meta's app review requires demonstrating template creation. Taking
that as given:**

### What template creation needs

| Requirement | Have we got it? |
|---|---|
| A WABA id to address `POST /<WABA_ID>/message_templates` | 🔴 no column today; **but the platform's own existing WABA can be used** |
| A token with template-management permission | the platform token, presumably | 
| A UI in **our** app that creates one (name, language, category, body, variables) | 🔴 **does not exist at any level** |
| Somewhere to keep name + language + approval status | 🔴 no table |
| A way to SEND one — `type: 'template'` with `components` | 🔴 the sender only emits `type: 'text'` |

### 🔴 WHY IT COMES FIRST — three reasons, and the third is the one that changes the plan

1. **The review video shows OUR app creating a template.** A wizard that onboards trucks does not
   demonstrate that. If review is a gate on going live, the thing the gate tests must be built first.
2. **It is the one piece that is NOT blocked on onboarding.** Template creation needs *a* WABA, not
   *each truck's* WABA — 🔴 **the platform's existing WABA is enough for the demonstration.** The
   chicken-and-egg is only apparent.
3. 🔴 **THE 24-HOUR WINDOW MAKES TEMPLATES A FUNCTIONAL REQUIREMENT, NOT A REVIEW FORMALITY.** The
   current sender emits free-form text and works **only** while the customer's own message keeps the
   window open — which is exactly the auto-reply case and nothing else. **The moment anyone wants a
   business-initiated message — an order-ready notification, a "your collection time moved" — it must
   be a template.** ⚠️ The reference manual already states the rule: *"stay within the 24-hour window;
   customer initiates."* **INFERRED** from the brief plus that manual line; **CANNOT DETERMINE** the
   current window semantics precisely — Meta's messaging-window documentation would settle it.

**So the honest ordering is: templates → app review → Embedded Signup wizard → per-truck sending.**
Building the wizard first produces something that cannot be shipped until a thing that was not built
gets approved.

## 2.f Migration order and coupling

Classified by this repository's own rule, stated in `20260816_trucks_phone_number_id.sql`: a migration
is **DEPLOY-COUPLED** when a **named** PostgREST select would reference the column — a named select on a
missing column raises 42703 and fails the whole statement. It is **ADDITIVE** when every reader uses
`select('*')` or nothing reads it yet.

| # | Migration | Class | Why |
|---|---|---|---|
| 1 | `whatsapp_connections` table (+ RLS on, zero policies) | ✅ **ADDITIVE** | Nothing reads it until the resolver exists. Inert on arrival |
| 2 | `operators.whatsapp_waba_id` + partial unique index | ⚠️ **DEPLOY-COUPLED** | `operators` is read with **named** selects everywhere (`select('stripe_account_id, stripe_account_livemode')`). The moment any of them names this column, the migration must already have run. `20260811_operators_stripe_account_livemode.sql` says exactly this: *"There is NO select('\*') on `operators` anywhere… Migration first. Then deploy."* |
| 3 | `operators.whatsapp_status`, `whatsapp_synced_at`, `whatsapp_payment_method_ok`, `whatsapp_coexistence` | ⚠️ **DEPLOY-COUPLED** | same reason; ship as one statement group with #2 |
| 4 | `whatsapp_logs.send_status`, `send_error` | ⚠️ **DEPLOY-COUPLED** | the webhook writes `whatsapp_logs` with a named insert |
| 5 | `whatsapp_templates` (if built) | ✅ **ADDITIVE** | new table, nothing reads it yet |

### The deploy sequence

```
1. Apply #1 (additive)              — inert, can be done any time
2. Apply #2 + #3 together           — BEFORE the deploy that names them
3. Apply #4                         — BEFORE the deploy that writes them
4. Deploy the code                  — resolver, state helper, settings surface
5. Verify with the STATE queries    — information_schema, not the statement's return
6. notify pgrst, 'reload schema'    — after each, as every migration here does
```

⚠️ **THE SEND REWRITE IS ITS OWN DEPLOY, AFTER ALL OF THE ABOVE, AND AFTER AT LEAST ONE TRUCK HAS
ONBOARDED SUCCESSFULLY.** Until then the platform token still works and there is nothing to gain by
switching. See risk R6.

---

# PHASE 3 — RISKS, RANKED

Ranked by expected harm, which is (how likely) × (how long it goes unnoticed) × (who it affects).

| # | Risk | Why it ranks here | What contains it |
|---|---|---|---|
| **R1** | 🔴 **A silent send failure looks like success.** Present TODAY, before any of this is built: `response_sent` is written before the send, the throw is caught, and `/api/manage` counts the row as `handled` | **Certain, already happening, invisible by construction.** Every other risk below is discovered through this one, so it is discovered late | §2.c: outcome return value, `send_status`, and the report stopping counting unsent replies as handled |
| **R2** | 🔴 **A truck disconnects at Meta's end** — removes the app, changes WABA ownership, or Meta acts on the account. The token stops working with nothing on our side changing | Likely over time; **the operator will not tell us**, and their customers get silence | The `revoked` state; a Meta webhook branch mirroring `account.updated`; reconcile-on-tab-open; a **dashboard** notice, not just a settings badge |
| **R3** | 🔴 **Revoked or expired token, undetected until the next inbound message.** Distinct from R2: the connection may be fine and the token stale | Same silence, different cause. 🔴 **A truck could go a whole event ignoring customers** | Record the failure on the first refusal, flip `whatsapp_status` from the send path itself, and show it where they are looking |
| **R4** | ⚠️ **The operator never adds a payment method at Meta.** Everything on our side is green | Likely at first onboarding; reads as *our* product being broken | Step 7 is an explicit UI state (`awaiting_payment_method`) with copy that says **they pay Meta directly** |
| **R5** | 🔴 **15 October 2026 — Embedded Signup v2 deprecation.** ~2 months from today (19 August 2026) | 🔴 **A hard external deadline that does not move**, on a flow not yet started | **Do not write a line against v2.** Build v4 or nothing. ⚠️ **CANNOT DETERMINE** whether the platform's existing Meta app depends on v2 anywhere — the Meta app dashboard would settle it, and it should be checked now, not in October |
| **R6** | 🔴 **In-flight auto-replies during the send-path migration.** The window between "the send requires a per-truck token" and "trucks have one" is a window in which **every** truck goes silent | Certain if sequenced badly; affects **all** trucks at once, unlike R2/R3 | 🔴 **Sequence, not code.** The send rewrite ships **last**, after at least one truck has onboarded and been proven end to end. And 🔴 **because there is no fallback to the platform token by design (§2.c), the switch is one-way** — that is the correct trade, and it is why the ordering matters more than usual |
| **R7** | ⚠️ **Coexistence surprises.** The operator keeps answering in their own WhatsApp Business app while our bot also replies — customers may see two answers, or ours may contradict a human's | Likely, since coexistence is the **common** path for food trucks | Store the flag; decide reply policy under coexistence deliberately. ⚠️ **CANNOT DETERMINE** whether Meta signals that a human has replied — Meta's coexistence documentation would settle it |
| **R8** | ⚠️ **A stale `whatsapp_sender`.** Onboarding produces a number different from the one in the free-text field, and `lib/email.ts` keeps printing the old one to customers | Moderate likelihood, quiet harm — customers message a number nobody watches | Write `whatsapp_sender` from Meta's `display_phone_number` at onboarding (§2.a decision 2) |
| **R9** | ⚠️ **The native app.** The whole subsection is hidden behind `!isNativeApp()` because self-serve onboarding did not exist. Once it does, unhiding it is an **App Review** decision — an OAuth-like flow to a third party inside an iOS app has its own guideline surface | Certain to arise; blocks nothing until then | Decide explicitly. Web-only is a legitimate answer and needs no code |
| **R10** | ⚠️ **A leaked token sends as the truck.** §2.b's whole subject | Low likelihood, high harm, **and it would be discovered by the customer, not by us** | §2.b's recommendation: separate table + app-level encryption |
| **R11** | ⚠️ **`v19.0` is a hard-coded literal** in the only sender. Graph versions are deprecated on a schedule | Certain eventually, loud when it happens (an HTTP error, not silence) | Not urgent. Worth lifting to a named constant when the file is next touched |
| **R12** | ⚠️ **No replay protection on the webhook.** `lib/meta/webhook-signature.ts` states it: Meta's scheme has no timestamp, so a captured genuine delivery stays valid forever, and there is no message-id idempotency | Pre-existing, unchanged by this design | Out of scope here; recorded so it is not lost |

---

# PHASE 4 — WHAT WAS BUILT, AND WHY IT WAS SAFE

## ✅ BUILT: `lib/whatsapp/connection-state.ts` — one file, 129 lines, imported by nothing

**What it is:** a pure state machine — `WhatsAppConnectionState` (the six states of §2.d),
`deriveWhatsAppConnectionState`, and four predicates (`canSendWhatsApp`, `needsOperatorAction`,
`needsSupportAttention`, `shouldOfferSignup`, `shouldOfferReauthorise`).

**Why it was safe, checked rather than asserted:**

- **It changes no behaviour, because nothing calls it.** `grep -rn "whatsapp/connection-state" app lib components`
  returns exactly one line — the file's own header comment. **READ.**
- **It is pure.** No imports at all, so no I/O, no clock, no `process.env`, no Supabase client. It
  cannot fail at runtime because it is not at any runtime.
- **It needs no Meta App ID and no migration**, so it is not built against a guessed signature. It
  encodes *our* six states, which are decided by the design above, not by Meta's API shape.
- **It mirrors `lib/stripe/payments-state.ts`** — the codebase's existing, reviewed answer to this exact
  problem — rather than inventing a second pattern, which is what Phase 1.4 was for.
- ⚠️ **The columns it names DO NOT EXIST.** Its header says so in the file, so it cannot be misread as
  schema documentation.

**Verification:** it has been read back and censused (§5 below). **`tsc` was not run and would not be
verification if it had been** — a pure function with no callers type-checking clean proves only that it
parses.

## 🔴 DELIBERATELY NOT BUILT

| Not built | Why |
|---|---|
| Embedded Signup button, JS SDK, code exchange, callback route | **Forbidden by the brief, and correctly:** no Meta App ID exists. Building against a guessed signature is worse than not building |
| Any change to `lib/meta-whatsapp.ts` or the webhook | **Forbidden by the brief.** Highest-risk change; the design is to be read first |
| Any applied migration | **Forbidden by the brief.** SQL is provided below to run by hand |
| A settings surface | ⚠️ **Permitted, and left unbuilt on the brief's own "if in doubt" rule.** Every column it would read is absent, so it could only render `not_connected` for everyone — a control that looks live and reports one hard-coded state. It would also mean editing the `!isNativeApp()` subsection, which carries an App Review justification (R9). **Design it, do not build it** |
| `token-crypto.ts` | Blocked on your §2.b decision, and on the Option-4 question that could delete the need |
| Template creation | Needs a WABA id and a token with template permissions. Designed in §2.e, unbuilt |

## 🔴 SQL — FOR YOU TO RUN BY HAND. NOT APPLIED. NOT VERIFIED AGAINST THE DATABASE.

⚠️ **DO NOT RUN ANY OF THIS YET.** It encodes §2.b's *recommendation*, which you have not chosen, and
§2.a's WABA-per-operator decision, which rests on an **INFERRED** claim about Meta's model (§2.a
decision 1). It is here so the shape is concrete and reviewable, not because it is ready.

### Statement 1 — the connections table. ✅ ADDITIVE.

```sql
create table if not exists public.whatsapp_connections (
  operator_id       uuid primary key references public.operators(id) on delete cascade,
  token_ciphertext  text,
  token_iv          text,
  token_tag         text,
  token_written_at  timestamptz,
  token_revoked_at  timestamptz,
  last_send_error   text,
  last_send_error_at timestamptz,
  created_at        timestamptz not null default now()
);
```

### Statement 2 — RLS on, zero policies. ✅ ADDITIVE.

```sql
alter table public.whatsapp_connections enable row level security;
```

⚠️ Zero policies is deliberate and is this codebase's established shape for service-role-only tables —
`whatsapp_logs`, `booking_locks`, `action_audit_log` and `order_payments` all do exactly this.

### Statement 3 — the WABA id. ⚠️ DEPLOY-COUPLED.

```sql
alter table public.operators
  add column if not exists whatsapp_waba_id text;
```

### Statement 4 — one WABA, one operator. ⚠️ DEPLOY-COUPLED (ships with 3).

```sql
create unique index if not exists operators_whatsapp_waba_id_key
  on public.operators (whatsapp_waba_id)
  where whatsapp_waba_id is not null;
```

### Statement 5 — the cached status and its companions. ⚠️ DEPLOY-COUPLED.

```sql
alter table public.operators
  add column if not exists whatsapp_status text not null default 'not_connected',
  add column if not exists whatsapp_synced_at timestamptz,
  add column if not exists whatsapp_payment_method_ok boolean,
  add column if not exists whatsapp_coexistence boolean not null default false;
```

### Statement 6 — the send outcome on the log. ⚠️ DEPLOY-COUPLED.

```sql
alter table public.whatsapp_logs
  add column if not exists send_status text,
  add column if not exists send_error text;
```

### Statement 7 — schema cache reload. Run after the others.

```sql
notify pgrst, 'reload schema';
```

### Verify after applying — reads resulting STATE, not the statements' return

```sql
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_name = 'operators' and column_name like 'whatsapp%'
 order by column_name;
```

```sql
select count(*) as total,
       count(whatsapp_waba_id) as with_waba,
       count(*) filter (where whatsapp_status = 'ready') as ready
  from public.operators;
```

Expect `with_waba = 0` and `ready = 0` — applying this must change nothing for anyone.

---

# 5. INTEGRITY CENSUS

Two files were written this task. Each was censused in a **separate pass after** its write, with a
byte-level tool (`scratchpad/bytecheck.py`) and a carrier-aware variation-selector scanner
(`scratchpad/vscheck.py`) — **never grep**.

## 5.1 `lib/whatsapp/connection-state.ts`

```
--- lib/whatsapp/connection-state.ts  bytes=7828
    NUL(0x00)=0  other control bytes<0x09/0x0B/0x0C/0x0E-0x1F/0x7F=0  TOTAL FLAGGED=0
    allowed control bytes present: TAB(0x09)=0 LF(0x0A)=129 CR(0x0D)=0
    non-ASCII chars=127 distinct=7
         92  U+2500 So BOX DRAWINGS LIGHT HORIZONTAL
         12  U+2014 Pd EM DASH
          9  U+1F534 So LARGE RED CIRCLE
          6  U+26A0 So WARNING SIGN
          6  U+FE0F Mn VARIATION SELECTOR-16
          1  U+00A7 Po SECTION SIGN
          1  U+2705 So WHITE HEAVY CHECK MARK
```

```
    U+2500 BOX DRAWINGS LIGHT HORIZONTAL bare=92   +VS16=0    +VS15=0
    U+26A0 WARNING SIGN                  bare=0    +VS16=6    +VS15=0
    U+2705 WHITE HEAVY CHECK MARK        bare=1    +VS16=0    +VS15=0
    U+1F534 LARGE RED CIRCLE             bare=9    +VS16=0    +VS15=0
    U+FE0F total in file=6  attached to a base above=6  unaccounted=0  leading-orphan=0
```

**0 NUL, 0 other disallowed control bytes, 0 tabs, 0 CR.** Seven distinct non-ASCII codepoints, all of
them this codebase's existing comment vocabulary — the box-drawing rule used by every neighbouring
module, the marker glyphs, the em dash and the section sign. ✅ **NO BASE IS SPLIT ACROSS BOTH
CARRIERS:** U+26A0 is paired with U+FE0F on all 6 occurrences and bare on none; U+2500, U+2705 and
U+1F534 are bare on all of theirs with no selector attached; all 6 U+FE0F are accounted for.

## 5.2 This report

Censused after the write; the figures are appended below.

### Byte scan

```
--- docs/whatsapp-per-truck-architecture.md  bytes=57143
    NUL(0x00)=0  other control bytes<0x09/0x0B/0x0C/0x0E-0x1F/0x7F=0  TOTAL FLAGGED=0
    allowed control bytes present: TAB(0x09)=0 LF(0x0A)=863 CR(0x0D)=0
```

### Non-ASCII census

```
    non-ASCII chars=408 distinct=15
        138  U+2014 EM DASH                     35  U+26A0 WARNING SIGN
         69  U+1F534 LARGE RED CIRCLE           35  U+FE0F VARIATION SELECTOR-16
         35  U+2500 BOX DRAWINGS LIGHT HORIZ    25  U+00A7 SECTION SIGN
         25  U+2192 RIGHTWARDS ARROW            21  U+2705 WHITE HEAVY CHECK MARK
          9  U+2190 LEFTWARDS ARROW              7  U+2026 HORIZONTAL ELLIPSIS
          3  U+1F7E2 LARGE GREEN CIRCLE          2  U+00D7 MULTIPLICATION SIGN
          2  U+274C CROSS MARK                   1  U+1F7E0 LARGE ORANGE CIRCLE
          1  U+1F7E1 LARGE YELLOW CIRCLE
```

Fifteen distinct codepoints, each deliberate: the marker glyphs, the traffic-light circles used in the
option costings, both arrow directions used in the data-model diagram, the multiplication sign in the
risk-ranking formula, the em dash, the section sign and the ellipsis inside quoted elisions. No smart
quotes, no non-breaking spaces, no en dashes, no look-alike substitutions.

### Carrier-aware variation-selector check, per base

```
    U+2500 BOX DRAWINGS LIGHT HORIZONTAL bare=35   +VS16=0    +VS15=0
    U+26A0 WARNING SIGN                  bare=0    +VS16=35   +VS15=0
    U+2705 WHITE HEAVY CHECK MARK        bare=21   +VS16=0    +VS15=0
    U+274C CROSS MARK                    bare=2    +VS16=0    +VS15=0
    U+1F534 LARGE RED CIRCLE             bare=69   +VS16=0    +VS15=0
    U+1F7E0 LARGE ORANGE CIRCLE          bare=1    +VS16=0    +VS15=0
    U+1F7E1 LARGE YELLOW CIRCLE          bare=1    +VS16=0    +VS15=0
    U+1F7E2 LARGE GREEN CIRCLE           bare=3    +VS16=0    +VS15=0
    U+FE0F total in file=35  attached to a base above=35  unaccounted=0  leading-orphan=0
```

**NO BASE IS SPLIT ACROSS BOTH CARRIERS.** U+26A0 — the only base here whose default presentation is
text — is paired with U+FE0F on all 35 occurrences and bare on none. The seven default-emoji-presentation
bases are bare on every occurrence with no selector attached to any of them. Every U+FE0F in the file is
accounted for by a preceding U+26A0; none is orphaned.

### Fixed-point note

The figures above are from the pass taken immediately after the report body was written; appending this
census block necessarily moved the totals. A final pass over the completed file was run and is reported
here in ASCII so it cannot move them again: **NUL bytes = 0, other disallowed control bytes = 0, tabs =
0, CR = 0**; the set of distinct non-ASCII codepoints is **unchanged**; the per-base carrier result is
**identical**, with U+26A0 paired on every occurrence and bare on none, every other base bare with no
selector attached, and no orphaned selector anywhere.

### Working tree

```
?? docs/whatsapp-per-truck-architecture.md
?? lib/whatsapp/
```

Two untracked entries, both created by this task. **Neither pre-existed**: the working tree held only
the previous task's untracked report before this one began, and that file is unchanged. No tracked file
was modified, no migration was applied, no SQL was run, and the send path was not touched.
