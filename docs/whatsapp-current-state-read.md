# WhatsApp — what exists today, and what an onboarding flow would meet

**READ ONLY. Nothing was changed except this file.** No SQL was run. No `next dev`, no `next build`.
No architecture is proposed anywhere below: every section reports what is in the tree.

**PROMPT INTEGRITY.** No span of the brief arrived garbled. All nine questions were legible and are
answered in order.

---

# 🔴 THE HEADLINE, BEFORE THE DETAIL

Three facts decide the size of the job, and all three are **READ**:

1. **THE SEND USES ONE HATCHGRAB-LEVEL CREDENTIAL FOR EVERY TRUCK.**
   `lib/meta-whatsapp.ts:11` reads `process.env.META_WHATSAPP_ACCESS_TOKEN` — a single environment
   variable, with no truck parameter anywhere in the function signature. There is no per-truck token,
   no lookup, no fallback.
2. **THE ROUTING IS ALREADY PER-TRUCK AND ALREADY CORRECT.** The webhook matches on
   `value.metadata.phone_number_id` — the number the customer messaged **TO** — against
   `trucks.phone_number_id`, protected by a partial unique index. The defect the brief names (matching
   the customer's number against the truck's own) **was real and is fixed**; the fixed code is quoted
   in §3.
3. **THERE IS NO ONBOARDING FLOW OF ANY KIND.** No OAuth, no Meta login button, no JS SDK, no code
   exchange, no callback route, no `WABA id` column. The one button labelled **"Connect"** saves a
   text field and nothing else. Its own source comment says so.

So Embedded Signup is **an addition on the receiving side and a rewrite on the sending side**: the
inbound half already keys off the per-truck identifier Meta delivers; the outbound half has exactly
one credential and one place that reads it.

---

# 1. EVERY WhatsApp-RELATED FILE, TABLE, COLUMN, ROUTE AND ENV VAR

## 1.0 The searches, quoted

```
find . -path ./node_modules -prune -o -path ./.next -prune -o -iname '*whatsapp*' -print
find . -path ./node_modules -prune -o -path ./.next -prune -o \( -iname '*waba*' -o -iname '*wa-*' \) -print
grep -ril "whatsapp" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=docs .
grep -ric "whatsapp" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=docs .
grep -rn "phone_number_id" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=docs .
grep -rn "whatsapp_logs"  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=docs .
grep -rn "messenger_page" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=docs .
grep -rn "sendMetaWhatsApp" ... ; grep -rn "sendWhatsApp\b" ...
grep -rni "embedded_signup|embedded signup|oauth|fbq(|FB.init|facebook-jssdk|connected_accounts|business_token|debug_token|exchange" --exclude-dir=docs .
grep -rni "message_template|message-template|hsm|template_name|/message_templates" .
grep -rhno "process\.env\.[A-Z0-9_]*" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git .
grep -lEi "pgsodium|pgp_sym_encrypt|vault\." supabase/migrations/*.sql
find app/api/webhooks -type f
```

`grep -ric` returned **39 files** outside `docs/`. The table below covers every one that carries
behaviour; the rest are named in §1.5.

## 1.1 Files — the WhatsApp path proper

| File | What it does today | Status |
|---|---|---|
| `lib/meta-whatsapp.ts` | `sendMetaWhatsApp(to, message, phoneNumberId)` — POSTs a `type:'text'` message to `graph.facebook.com/v19.0/<phoneNumberId>/messages` with a bearer token from **one env var**. 26 lines, whole file. | **LIVE.** Its only caller is the Meta webhook. **READ** |
| `lib/whatsapp-classifier.ts` | `generateWhatsAppReply(...)` — Gemini 2.5 Flash classifier into `SPECIFIC_QUERY` / `MENU_QUERY` / `ALLERGEN_QUERY` / `IGNORE`, a deterministic allergen floor, a menu-grounded tier-3 answer with price validation and a caveat-append, and per-bucket fallbacks. Creates its own service-role Supabase client. 408 lines. | **LIVE.** Called by BOTH webhooks. **READ** |
| `lib/meta/webhook-signature.ts` | `parseMetaAppSecrets` / `verifyMetaSignature` / `metaRefusalLog`. HMAC-SHA256 over the raw body against `X-Hub-Signature-256`; fail-closed on a missing secret; SHA-1 header deliberately ignored; timing-safe compare. 138 lines. | **LIVE**, shared by all three Meta routes. **READ** |
| `lib/twilio.ts` | `sendWhatsApp(to, body, from?)` posting to the Twilio Messages API with `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`, plus `logMessage` writing to `messages`. | **LEGACY.** Reachable only from the Twilio webhook (§2.3). **READ** |
| `app/api/webhooks/meta/whatsapp/route.ts` | The live inbound handler. GET verify challenge; POST = raw-body read → signature gate → truck lookup → plan gate → greeting read → events read → classifier → `whatsapp_logs` insert → send. 291 lines. | **LIVE.** **READ** |
| `app/api/webhooks/whatsapp/route.ts` | The Twilio inbound handler. Form-encoded POST, `whatsapp_sender == To` lookup, same classifier, Twilio send, `messages` + `whatsapp_logs` logging. **No signature verification of any kind** (no Twilio `X-Twilio-Signature` check exists). 148 lines. | **DORMANT** — the manual's own RULE calls it dormant, not deleted. Whether any Twilio number still points at the URL is **CANNOT DETERMINE** from the repo; the Twilio console would settle it. **READ (code) / CANNOT DETERMINE (traffic)** |
| `supabase/migrations/20260605_whatsapp_logs.sql` | Creates `public.whatsapp_logs`, RLS on, zero policies (service-role only). | **APPLIED to prod** per the reference manual (V7.7). **READ (file) / INFERRED (applied)** |
| `supabase/migrations/20260523_messaging_schema.sql` | Adds `trucks.whatsapp_sender`, `trucks.messenger_page_id`, `trucks.messenger_page_token`; adds `messages.truck_id`, `messages.inbound_message`. | Columns exist and are read; the two `messenger_page_*` columns are **DEAD** (see §9). **READ** |
| `supabase/migrations/20260816_trucks_phone_number_id.sql` | Adds `trucks.phone_number_id` (text, nullable, no default) + partial unique index `trucks_phone_number_id_key`. | **APPLIED** — the webhook's named `select` would 42703 without it and the route is deployed. **READ (file) / INFERRED (applied)** |

## 1.2 Routes

| Route | Method | Purpose | Status |
|---|---|---|---|
| `/api/webhooks/meta/whatsapp` | GET | `hub.mode`/`hub.verify_token` handshake against `META_WEBHOOK_VERIFY_TOKEN`, echoes `hub.challenge`. ⚠️ It `console.log`s the env token on every attempt (`route.ts:47`). | LIVE |
| `/api/webhooks/meta/whatsapp` | POST | The full inbound pipeline. | LIVE |
| `/api/webhooks/whatsapp` | POST | Twilio inbound. | DORMANT |
| `/api/webhooks/messenger` | GET/POST | §9 | SCAFFOLD |
| `/api/webhooks/instagram` | GET/POST | §9 | SCAFFOLD |
| `/api/manage` (`update_truck`) | POST | The only writer of `whatsapp_sender`. | LIVE |
| `/api/manage` (`update_settings`) | POST | Writes `whatsapp`, `phone_is_whatsapp` (customer contact, NOT the sender). | LIVE |
| `/api/manage` (report) | POST | Reads `whatsapp_logs` for `whatsappStats {total, handled, misses}`. | LIVE |

**There is NO route anywhere that receives a Meta authorisation code, exchanges a token, or handles an
OAuth callback.** The only `exchange` in the tree is `supabase.auth.exchangeCodeForSession` in
`app/auth/callback/route.ts` — Supabase operator login, unrelated. **READ**

## 1.3 Tables and columns

| Table.column | Type | Written by | Read by | Status |
|---|---|---|---|---|
| `trucks.whatsapp_sender` | text | `/api/manage` `update_truck` allow-list (Settings → Auto-replies "Connect"/blur) | Meta webhook fallback lookup; Twilio webhook primary lookup; `lib/email.ts` (customer-facing "WhatsApp us" line); 5 call sites pass it into email params | **LIVE** |
| `trucks.phone_number_id` | text, nullable, partial-unique | 🔴 **NOTHING. No UI, not on any allow-list.** `grep` finds writes in **zero** files. | Meta webhook PRIMARY lookup only | **LIVE but hand-populated** |
| `trucks.whatsapp` | text `NOT NULL DEFAULT ''` | `/api/manage` `update_settings`; `lib/provision-truck.ts:430` | Customer-facing contact rendering | LIVE — **customer contact number, NOT the sender** |
| `trucks.phone_is_whatsapp` | boolean | same as above | contact-method gating, discovery events | LIVE |
| `trucks.preferred_contact_method` | text | `update_truck` allow-list | email + customer surfaces | LIVE |
| `trucks.messenger_page_id` | text | nothing | nothing | **DEAD** |
| `trucks.messenger_page_token` | text | nothing | nothing — explicitly redacted in `app/api/dashboard/route.ts:46` as a credential that "exists, unreferenced here" | **DEAD** |
| `whatsapp_logs` (`id, truck_id, customer_number, message_in, classification, events_found, response_sent, possible_miss, created_at`) | — | both webhooks (fire-and-forget insert) | the greeting-per-day read; `/api/manage` report stats; `lib/delete-truck.ts` cascade | LIVE |
| `messages` (`truck_id`, `inbound_message`, `direction`, `channel`, …) | — | `lib/twilio.ts logMessage` only | nothing on the Meta path | LEGACY — the Meta webhook never writes it |

**There is no `waba_id` column, no `business_account_id` column, and no per-truck token column of any
kind.** `grep -rni "waba"` and the `find` for `*waba*` both return nothing. **READ**

## 1.4 Environment variables

Enumerated with `grep -rhno "process\.env\.[A-Z0-9_]*"` over the whole tree.

| Var | Read at | Purpose | Status |
|---|---|---|---|
| `META_WHATSAPP_ACCESS_TOKEN` | `lib/meta-whatsapp.ts:11` | 🔴 **THE ONE SENDING CREDENTIAL, FOR EVERY TRUCK.** | LIVE |
| `META_APP_SECRET` | `meta/whatsapp:91`, `messenger:43`, `instagram:43` | HMAC secret; comma-separated list supported | LIVE |
| `META_WEBHOOK_VERIFY_TOKEN` | all three routes | GET handshake only | LIVE |
| `GEMINI_API_KEY` | `lib/whatsapp-classifier.ts:65` | the classifier + menu answerer | LIVE |
| `NEXT_PUBLIC_HATCHGRAB_URL` | both webhooks | builds the order/schedule links in replies | LIVE |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_NUMBER` | `lib/twilio.ts:4-6` | the legacy path only | LEGACY |

⚠️ **`.env.local` (local dev) declares `META_WEBHOOK_VERIFY_TOKEN` and `META_WHATSAPP_ACCESS_TOKEN`
but does NOT declare `META_APP_SECRET`.** **READ** — variable names only were inspected; no values are
reproduced here. What that means locally: `parseMetaAppSecrets(undefined)` returns `[]`, so
`verifyMetaSignature` returns `no_secret_configured` and every local POST to all three Meta endpoints
is refused 401. **Whether `META_APP_SECRET` is set in Vercel production is CANNOT DETERMINE from this
repo** — the Vercel project's environment-variable list would settle it, and the loud symptom would be
`REFUSED reason=no_secret_configured` in the production logs.

⚠️ **The reference manual is stale on the variable names.** `docs/reference-manual.md:7885` states the
env set is `META_WHATSAPP_APP_SECRET, META_WHATSAPP_PHONE_NUMBER_ID, META_WHATSAPP_ACCESS_TOKEN,
META_WEBHOOK_VERIFY_TOKEN, META_WHATSAPP_BUSINESS_ACCOUNT_ID`. **READ:** of those five, only
`META_WHATSAPP_ACCESS_TOKEN` and `META_WEBHOOK_VERIFY_TOKEN` appear anywhere in the code. There is no
`META_WHATSAPP_APP_SECRET` (the code reads `META_APP_SECRET`), no `META_WHATSAPP_PHONE_NUMBER_ID`, and
no `META_WHATSAPP_BUSINESS_ACCOUNT_ID`. The last one matters for this brief: **the codebase has never
held a WABA id in any form.**

## 1.5 The remaining `whatsapp` hits — none of them integration code

`app/landing/page.tsx` (marketing copy), `app/trucks/[slug]/page.tsx` and `app/venues/[slug]/page.tsx`
(OG-image comments about WhatsApp link previews), `components/EventListCard.tsx` (a `wa.me/` deep link
for the customer to message the truck by hand), `components/DemoGetStarted.tsx` and
`app/api/setup/route.ts` and `lib/provision-truck.ts` (the signup wizard's "this number is on WhatsApp"
tick), `app/api/discovery/events/route.ts` (contact-method label), `lib/email.ts` (a "WhatsApp us:
<number>" line in customer emails), `app/admin/page.tsx` and `lib/delete-truck.ts` (deletion cascade
prose), `app/api/orders/submit/route.ts` (`formatWhatsAppOrder` — **dead: its own comment records that
a repo-wide grep finds exactly one occurrence, the definition itself**), plus five call sites that
merely pass `whatsappSender` into email params. **READ**

---

# 2. THE SENDING PATH

## 2.1 The sender, quoted in full — `lib/meta-whatsapp.ts`

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

That is the **entire file**. **READ.**

## 2.2 🔴 ONE NUMBER OR PER-TRUCK? — THE ANSWER IS SPLIT, AND THAT IS THE FINDING

| Dimension | What the code does | Verdict |
|---|---|---|
| **Which number the message is sent FROM** | The `phoneNumberId` path segment. Its value at the only call site (`meta/whatsapp/route.ts:280`) is `value.metadata.phone_number_id` — **the number the customer messaged, echoed straight back from Meta's own payload.** | **PER-TRUCK, structurally.** The send never reads the truck row for it. **READ** |
| **Which credential authorises the send** | `process.env.META_WHATSAPP_ACCESS_TOKEN` — one variable, no truck argument. | 🔴 **ONE HATCHGRAB-LEVEL CREDENTIAL FOR ALL TRUCKS.** **READ** |

The call site, quoted:

```ts
await sendMetaWhatsApp(from, reply, phoneNumberId)
```

`from` is the customer; `phoneNumberId` is the business number they wrote to. **The function is
already shaped for per-truck numbers and is not shaped for per-truck tokens.**

**What that means for Embedded Signup — stated as consequence, not as a proposal.** Today one Meta
access token has to be able to send on behalf of every `phone_number_id` that reaches the webhook.
That works only while every number sits under one WABA that this token can address. A per-truck WABA
obtained through Embedded Signup would produce a token this function has nowhere to read from: there
is no column, no argument, and no lookup. The `phoneNumberId` half needs nothing; the `Bearer` half is
the rewrite.

**⚠️ There is no `to`-number allow-list, no 24-hour-window check, and no template fallback in this
function.** It sends a free-form `type:'text'` body unconditionally and lets Meta reject it. Whether
production sends currently succeed is **CANNOT DETERMINE** from the repo — the Meta app's message logs
or `whatsapp_logs` rows compared against delivery would settle it.

**⚠️ A FAILED SEND IS INVISIBLE IN THE LOG ROW.** `whatsapp_logs.response_sent` is written **before**
the send is attempted (`route.ts:262` insert, `route.ts:280` send), and the send's `throw` is caught
and only `console.error`d. So a row saying a reply was sent is not evidence that one was. **READ.**

## 2.3 The legacy Twilio sender, for completeness

`lib/twilio.ts:11` `sendWhatsApp(to, body, from?)` — `from` defaults to `TWILIO_WHATSAPP_NUMBER` (one
global number) but the Twilio webhook always passes `toNumber`, i.e. the truck's own
`whatsapp_sender`. Account SID + auth token are again **one global credential**. **READ.**

---

# 3. THE RECEIVING PATH

## 3.1 Signature verification, quoted (`app/api/webhooks/meta/whatsapp/route.ts:75-103`)

```ts
export async function POST(req: NextRequest) {
  // FIRST LINE. Nothing may read the body before this.
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch (err) {
    console.error('[webhook/meta-whatsapp] REFUSED - could not read request body:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const signatureHeader = req.headers.get('x-hub-signature-256')
  const secrets = parseMetaAppSecrets(process.env.META_APP_SECRET)
  const verification = verifyMetaSignature({ rawBody, signatureHeader, secrets })

  if (!verification.ok) {
    console.error(metaRefusalLog('meta-whatsapp', verification.reason, secrets.length, !!signatureHeader, rawBody.length))
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
```

And the check itself (`lib/meta/webhook-signature.ts:84-113`):

```ts
  if (secrets.length === 0) return { ok: false, reason: 'no_secret_configured' }
  if (!signatureHeader) return { ok: false, reason: 'missing_signature_header' }

  const [scheme, offered] = signatureHeader.split('=', 2)
  if (scheme !== 'sha256' || !offered) return { ok: false, reason: 'malformed_signature_header' }

  let matched = false
  for (const secret of secrets) {
    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
    if (safeEqualHex(expected, offered)) matched = true
  }
  if (!matched) return { ok: false, reason: 'signature_mismatch' }
```

Properties, all **READ**: raw body read first and `req.json()` never called; fail-closed on a missing
secret; SHA-1 `X-Hub-Signature` deliberately not accepted (downgrade); timing-safe hex compare;
multiple comma-separated secrets tried, loop runs to completion; **no timestamp and therefore no
replay window** — the helper says so explicitly and notes that replay protection would have to come
from message-id idempotency, which does not exist here. **⚠️ There is no message-id idempotency
anywhere on this path** — a replayed genuine delivery would re-run the classifier and re-send.
**READ (from absence — `grep` for the message `id` field finds it destructured nowhere).**

## 3.2 The routing — the prior defect, and the current logic

**THE DEFECT WAS REAL.** The route's own comment preserves the old line
(`route.ts:145-153`):

```
// WHAT WAS WRONG, AND IT IS WORTH SPELLING OUT BECAUSE IT PASSED A LIVE TEST. This matched
// `whatsapp_sender` — the TRUCK's own number — against `from`, which is the CUSTOMER's number:
//     .or(fromVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
// For any real customer that finds nothing. It only ever appeared to work because the tester's own
// mobile was sitting in `whatsapp_sender` ...
```

**THE CURRENT LOGIC — CONFIRMED FIXED.** Two lookups, in order:

```ts
    const phoneNumberId       = value?.metadata?.phone_number_id as string
    const displayPhoneNumber  = value?.metadata?.display_phone_number as string | undefined
...
    // PRIMARY
    let truck: TruckRow | null = null
    {
      const { data } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .eq('phone_number_id', phoneNumberId)
        .eq('active', true)
        .maybeSingle()
      truck = (data as TruckRow | null) ?? null
    }

    // FALLBACK
    if (!truck && displayPhoneNumber) {
      const digits = displayPhoneNumber.replace(/\D/g, '')
      const toVariants = [
        `+${digits}`,
        digits,
        digits.startsWith('44') ? `0${digits.slice(2)}` : null,
      ].filter((v): v is string => v !== null)
      const { data } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .or(toVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
        .eq('active', true)
        .maybeSingle()
      truck = (data as TruckRow | null) ?? null
      if (truck) { console.warn(... 'routed by whatsapp_sender FALLBACK, not phone_number_id' ...) }
    }
```

**✅ CONFIRMED: neither lookup touches `from`.** Both key off the business number the customer messaged
**TO** — the primary on Meta's opaque `phone_number_id`, the fallback on the human-readable
`display_phone_number` normalised to three shapes and compared against `whatsapp_sender`. The
customer's number is used only as the reply address and as `whatsapp_logs.customer_number`; it is
deliberately not logged. **READ.**

Uniqueness is enforced in the database, not just in code:
`CREATE UNIQUE INDEX ... ON trucks (phone_number_id) WHERE phone_number_id IS NOT NULL`. Two trucks
cannot claim the same Meta number. **READ.**

**No truck matched ⇒ 200 + a warning naming both identifiers, and nothing is sent.**
**Plan gate not passed ⇒ 200, silently, nothing sent** (`route.ts:207-209`).

⚠️ **The fallback is a bridge with a stated retirement condition**: "delete it once every WhatsApp
truck has a `phone_number_id`". It exists precisely because **there is no UI to set the column**.
**READ.**

⚠️ **The manual's Section-27 RULE at `docs/reference-manual.md:7887` still describes the OLD
sender-match model** ("The webhook matches the inbound SENDER's number against `whatsapp_sender`") and
calls recipient-routing a "GO-LIVE MODEL (banked, blocker)". **That is stale — the code was changed on
16 August 2026.** Recorded here rather than fixed, because this task changes nothing but its own report.

## 3.3 The Twilio receiving path, beside it

```ts
    const { data: truck } = await supabase
      .from('trucks')
      .select(`...`)
      .eq('whatsapp_sender', toNumber)
      .eq('active', true)
      .single()
```

Correct by the same rule (`toNumber`, never `fromNumber`) and always was — the Meta route's comment
says so. **But it has NO signature verification at all**: `req.formData()` is read and acted on with
no `X-Twilio-Signature` check. **READ (from absence — no `twilio` signature helper exists in the
tree).**

---

# 4. PER-TRUCK WhatsApp CONFIG, AND WHAT AN OPERATOR CAN SET

## 4.1 The columns

| Column | Set by an operator? | How |
|---|---|---|
| `trucks.whatsapp_sender` | **YES** | Settings → Contact/Connect card → **Auto-replies → WhatsApp**, a `type="tel"` input, saved on blur and on the "Connect" button |
| `trucks.phone_number_id` | 🔴 **NO** | No control, no allow-list entry. Supabase by hand only |
| `trucks.whatsapp`, `trucks.phone_is_whatsapp` | YES | Settings → Contact Details → Phone + "This number is on WhatsApp" tick. **Customer contact, not the sender** |
| `trucks.messenger_page_id`, `trucks.messenger_page_token` | NO | dead columns, no writer |

The server allow-list that permits the write (`app/api/manage/route.ts:861`) contains
`'whatsapp_sender'` and **does not contain `'phone_number_id'`**. The route's own comment warns that
unlisted keys are dropped **silently**. **READ.**

## 4.2 The settings control, quoted (`app/manage/[token]/page.tsx:8980-9013`)

```tsx
            {/* WhatsApp */}
            <div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600 w-20 flex-shrink-0">WhatsApp</label>
                {can('whatsapp_replies') ? (
                  <>
                    <input
                      type="tel"
                      value={whatsappSender}
                      onChange={e => setWhatsappSender(e.target.value)}
                      onBlur={saveWhatsappSender}
                      placeholder="+447700900000"
                      ...
                    />
                    <button
                      onClick={saveWhatsappSender}
                      className="flex-shrink-0 text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
                    >
                      Connect
                    </button>
```

and the handler (`:8554-8561`):

```ts
  const saveWhatsappSender = async () => {
    if (whatsappSender === lastSavedSender.current) return
    ...
      await api('update_truck', { data: { whatsapp_sender: whatsappSender } })
      lastSavedSender.current = whatsappSender
      onTruckUpdate({ whatsapp_sender: whatsappSender })
      showToast('WhatsApp number saved')
```

🔴 **THE LABEL SAYS CONNECT; THE BEHAVIOUR IS SAVE.** The button's own source comment states it:
*"It does not connect anything and must not be made to look as though it does — the label is the
operator's word for the step they will wire up separately, not a claim about state."* There is no
connected/disconnected state, no status read, and no request to Meta. **READ.**

⚠️ **THE WHOLE SUBSECTION IS HIDDEN IN THE NATIVE APP.** It is wrapped in `{!isNativeApp() && (<>…</>)}`
with the recorded reason: *"Self-serve WhatsApp onboarding for trucks is not built, so this subsection
must not appear in the build going to App Review."* On the web it renders unchanged. **READ.**

The caption under the field, verbatim:

> The WhatsApp Business number used to send automated replies to customers (set up with the WhatsApp
> Business API). This is separate from your contact number above.

That sentence is the whole of the operator-facing onboarding instruction: **the operator is told to go
and set up the WhatsApp Business API themselves, elsewhere.**

---

# 5. IS THERE AN ONBOARDING OR CONNECTION FLOW?

## 🔴 NO. NOTHING. Stated plainly.

**READ, from a targeted search whose terms are quoted in §1.0.** Searching the whole tree (excluding
`docs/`) for `embedded_signup`, `embedded signup`, `oauth`, `fbq(`, `FB.init`, `facebook-jssdk`,
`connected_accounts`, `business_token`, `debug_token` and `exchange` returns:

- `app/auth/callback/route.ts:11` — `supabase.auth.exchangeCodeForSession`, the **operator login**
  callback. Nothing to do with Meta.
- `lib/fcm.ts` — Google **OAuth2 service-account** flow for Android push. Nothing to do with Meta.
- `supabase/migrations/20260523_messaging_schema.sql:17,20` — two column **comments** saying "Set
  during OAuth flow", describing a Messenger flow that was never built.
- `android/app/google-services.json` — Firebase config.

**Not found, each confirmed by its own search:** any Meta JS SDK `<script>` tag; any `FB.login`; any
`launchWhatsAppSignup`; any `config_id`; any route under `app/api` that accepts a Meta `code`; any
`/oauth/access_token` call to `graph.facebook.com`; any `WABA`/`waba` identifier; any
`business_management` or `whatsapp_business_management` scope string.

The only Graph API call in the entire repo is the single `POST .../messages` in `lib/meta-whatsapp.ts`.

**INFERRED (and consistent with three independent statements in the tree):** the intended model today
is that HatchGrab sets each truck up by hand inside its own Meta Business account. The three
statements are the migration comment (*"Set by hand: there is no UI"*), the manage-page wrapper
comment (*"Self-serve WhatsApp onboarding for trucks is not built"*), and the reference manual's
banked go-live note.

---

# 6. TOKEN STORAGE — WHAT EXISTS

🔴 **REPORTING ONLY. No storage design is proposed.**

## 6.1 What secure storage this codebase has

**There is no secret store.** **READ**, from three searches:

- `grep -lEi "pgsodium|pgp_sym_encrypt|vault\." supabase/migrations/*.sql` → **no files**.
- `lib/crypto.ts` → **does not exist** (`ls` errors). The reference manual references it twice, at
  `:7905` and `:9552`, together with an `ENCRYPTION_KEY` — **neither the file nor the variable exists
  anywhere in the code.** Both manual lines describe the *parked* Messenger/Instagram work, not
  something built.
- There is no `secrets`, `credentials`, `connections` or `integrations` table in `supabase/migrations/`.

## 6.2 How every other secret in this codebase is actually held

**Every one is a plain platform environment variable read through `process.env`.** The complete list
of env names read anywhere under `app/` and `lib/`:

```
APNS_BUNDLE_ID APNS_ENV APNS_KEY APNS_KEY_ID APNS_TEAM_ID BREVO_API_KEY CRON_SECRET
EMAIL_FROM_ADDRESS FCM_SERVICE_ACCOUNT_JSON GEMINI_API_KEY INBOUND_SCHEDULE_SECRET
META_APP_SECRET META_WEBHOOK_VERIFY_TOKEN META_WHATSAPP_ACCESS_TOKEN NEXT_PUBLIC_BASE_URL
NEXT_PUBLIC_HATCHGRAB_URL NEXT_PUBLIC_POSTHOG_HOST NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_PRICING_PUBLISHED NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPPORT_EMAIL NODE_ENV SIGNUP_PUBLIC STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_NUMBER
```

Notably: **Stripe is a single platform-level `STRIPE_SECRET_KEY`, not Stripe Connect.**
`grep -rn "stripe_account_id"` over `app`, `lib` and `supabase` returns **nothing** — so there is no
existing precedent in this repo for "a per-merchant credential obtained through a provider's
onboarding flow". **READ.**

## 6.3 The only per-truck credential-shaped column that exists

`trucks.messenger_page_token`, added 23 May 2026 with the comment *"Facebook Page Access Token for
Messenger API. Set during OAuth flow. Treat as secret — do not expose to client."* It is **plaintext
`text`**, **never written**, **never read**, and is defended only at the read boundary:
`app/api/dashboard/route.ts` redacts it by name and, as a second layer, by the regex
`/(^|_)(token|secret|password|credential|pin|key)(_|$)/i`. That regex is the codebase's only
generalised protection for a secret-shaped column, and it is a **response-shaping** measure, not
storage security. **READ.**

## 6.4 What is therefore true, and what is not knowable from here

- **READ:** a per-truck business token has **no home** today — no column, no table, no encryption
  helper, no key.
- **READ:** if one were put on `trucks`, `publicTruckFields`'s `SECRETISH` regex would already keep it
  out of dashboard responses provided its name contains `token`/`secret`/`key` as a whole segment.
  That is an observation about existing code, not a recommendation.
- **CANNOT DETERMINE:** whether the production Supabase project has Vault or `pgsodium` enabled. This
  repo predates `supabase/migrations/` for the `trucks` table (`lib/delete-truck.ts:9-10` makes that
  point explicitly), so the migration folder is **not** a complete picture of the database. The
  Supabase dashboard's Database → Extensions page, or `select * from pg_extension`, would settle it.

---

# 7. THE `whatsapp_replies` FEATURE GATE

## 7.1 The gate, quoted

Declaration (`lib/features.ts:29`), under a `// Max` comment that is now misleading:

```ts
  // Max
  | 'ticket_printing'
  | 'multi_device_kds'
  | 'cook_screen'
  | 'whatsapp_replies'
```

Grant (`lib/features.ts:31-58`):

```ts
const PRO_FEATURES: Feature[] = [
  ... 
  'whatsapp_replies',   // Pro+Max — moved from Max-only: a Pro truck was sold WhatsApp replies and the gate silently blocked it (canAccess('pro',…)===false)
]

const MAX_FEATURES: Feature[] = [
  ...PRO_FEATURES,   // includes whatsapp_replies now
  'ticket_printing',
  'multi_device_kds',
  'cook_screen',
]

const TRIAL_FEATURES: Feature[] = [...MAX_FEATURES]
```

## 7.2 Which plans have it

| Plan | `whatsapp_replies` | Why |
|---|---|---|
| `starter` | ❌ | its `Set` is enumerated literally and does not include it |
| `pro` | ✅ | `new Set(PRO_FEATURES)` |
| `max` | ✅ | `MAX_FEATURES` spreads `PRO_FEATURES` |
| `trial` | ✅ | `TRIAL_FEATURES = [...MAX_FEATURES]` |
| `tester` | ✅ | `new Set(MAX_FEATURES)` |
| `demo` | ✅ | `new Set(TRIAL_FEATURES)` |

**A per-truck `feature_overrides` entry beats all of the above** — `canAccess` checks
`if (feature in featureOverrides) return featureOverrides[feature] === true` **first**, before plan and
before trial expiry. **READ.**

`lib/plan-features.ts:301` maps the marketing label **"WhatsApp auto-replies"** → `whatsapp_replies`,
and `findPlanParityViolations()` exists to assert the matrix and the gate agree.

## 7.3 Where it is enforced — three places, all **READ**

1. `app/api/webhooks/meta/whatsapp/route.ts:207` — `canAccess(truck.plan, 'whatsapp_replies', truck.feature_overrides ?? {}, truck.trial_expires_at)`; failing it returns 200 and sends nothing.
2. `app/api/webhooks/whatsapp/route.ts:55` — the same call on the Twilio path.
3. `app/manage/[token]/page.tsx:8984` — `can('whatsapp_replies')` decides whether the input is live or a disabled field beside a `<FeatureGate … showUpgrade>` upsell.

⚠️ **The reference manual is stale here too.** `docs/reference-manual.md:7891` records a
"FEATURE-GATE DISCREPANCY (V7.6, backlog bug)" saying `features.ts` grants it to Max only while
`plan-features.ts` advertises Pro+Max. **That discrepancy has been resolved in the code** — the grant
line's own comment records the move. The manual's line 7912 (*"Instagram/Messenger are Pro; WhatsApp is
Max only"*) is stale for the same reason.

---

# 8. TEMPLATES

## 🔴 NOTHING IN THIS REPO CREATES, MANAGES, SENDS OR NAMES A WhatsApp MESSAGE TEMPLATE.

**READ, from absence, naming the searches:**

- `grep -rni "message_template|message-template|hsm|template_name|/message_templates"` over the whole
  tree → the only hit is an unrelated base64 fragment inside `package-lock.json`.
- `grep -rn "'template'"` → every hit is the **demo menu template** feature (`demo_sessions.extraction_source = 'template'`, `lib/demo-templates.ts`, the admin console's "Template menu:" label). None is a WhatsApp template.
- `lib/meta-whatsapp.ts` sends `type: 'text'` with a `text.body`. There is no `type: 'template'`
  branch, no `template` object, no `language` / `components` payload, and no call to
  `graph.facebook.com/v19.0/<WABA_ID>/message_templates`.

**Consequence, stated as fact not proposal:** the capability Meta's app review asks you to demonstrate
— creating a message template — **does not exist here at any level**: no API call, no admin UI, no
storage for a template name or status, and no WABA id to address the endpoint with (§1.4).

**CANNOT DETERMINE:** whether templates have been created by hand in the Meta Business Manager UI for
the existing app. Only the Meta account's WhatsApp Manager → Message Templates page would settle that.

---

# 9. EVERY OTHER META ENDPOINT IN THIS REPO

The manual's three-endpoint count is **CONFIRMED**: `find app/api/webhooks -type f` returns exactly
five files, three of which are Meta.

| Endpoint | What it is for | GET | POST | Status |
|---|---|---|---|---|
| **`/api/webhooks/meta/whatsapp`** | WhatsApp Cloud API inbound messages → classifier → auto-reply | verify challenge | **fully wired** — signature gate, truck lookup, plan gate, greeting, events, classifier, log, send | **LIVE** |
| **`/api/webhooks/messenger`** | Facebook Messenger inbound (Page DMs) | verify challenge, same shared `META_WEBHOOK_VERIFY_TOKEN` | **signature-verified, then logs and returns 200.** Reads `entry[0].messaging[0]`, extracts `senderId`, `text`, `pageId`, and stops at a literal `// TODO: Route to classifier` | **SCAFFOLD.** No send helper, no truck lookup, no classifier |
| **`/api/webhooks/instagram`** | Instagram DM inbound | ditto | identical shape; extracts `senderId`, `text`, `igAccountId`; same `// TODO: Route to classifier` | **SCAFFOLD** |

All three call the same helper with the same three lines:

```ts
  const signatureHeader = req.headers.get('x-hub-signature-256')
  const secrets = parseMetaAppSecrets(process.env.META_APP_SECRET)
  const verification = verifyMetaSignature({ rawBody, signatureHeader, secrets })
```

and differ only in the `surface` string passed to `metaRefusalLog` (`'meta-whatsapp'` | `'messenger'` |
`'instagram'`), which is a closed union in the helper's signature. **READ.**

Both scaffolds are **feature-gated in the plan matrix but not in code**: `instagram_messenger_replies`
exists as a `Feature` in `lib/features.ts:22` and is granted to Pro+, but **no route calls `canAccess`
with it** — because neither route does anything a gate would protect. **READ, from absence.**

Their columns exist and are dead: `trucks.messenger_page_id` and `trucks.messenger_page_token` (§1.3).
There is no Instagram equivalent column at all.

**⚠️ ONE SHARED VERIFY TOKEN AND ONE SHARED APP-SECRET LIST ACROSS ALL THREE.** The helper's own
comment explains the plural-secret design: *"THE THREE PRODUCTS NEED NOT SHARE A META APP… a
single-secret implementation would verify one product and reject the other two as forged."* The verify
token, by contrast, is a single variable with no such flexibility. **READ.**

---

# 10. WHAT IS NOT KNOWABLE FROM THE REPOSITORY

Every item below is **CANNOT DETERMINE**, each with the thing that would settle it.

| Question | What would settle it |
|---|---|
| Is `META_APP_SECRET` set in Vercel production? | The Vercel project's env-var list. Symptom if not: `REFUSED reason=no_secret_configured` on every delivery, and 401s to Meta. |
| Is `META_WHATSAPP_ACCESS_TOKEN` valid / unexpired? | A Graph API call, or the Meta app's System User token page. Symptom if not: `Meta WhatsApp error 401` in the logs while `whatsapp_logs.response_sent` still records a reply. |
| Which trucks have a non-null `phone_number_id`? | `select id, name, whatsapp_sender, phone_number_id from trucks where active` — **a query for you to run; none was run here.** |
| Is any Twilio number still pointed at `/api/webhooks/whatsapp`? | The Twilio console's messaging-service webhook config. |
| Does the production database have Vault / `pgsodium`? | `select * from pg_extension`, or Supabase → Database → Extensions. |
| Do WhatsApp templates already exist in the Meta account? | Meta WhatsApp Manager → Message Templates. |
| Is the existing Meta app in dev mode with a recipient allow-list? | The Meta app dashboard. The manual notes at `:7887` that in dev mode a sender not on the allow-list fails **silently**. |
| Which WABA the current number sits under, and whether one token can address additional numbers | Meta Business Manager. **This is the fact that decides whether §2.2's rewrite is needed.** |

---

# 11. STALE DOCUMENTATION FOUND WHILE READING (recorded, not fixed)

All **READ**. Nothing was edited.

1. `docs/reference-manual.md:7885` — names five env vars, three of which do not exist in the code
   (`META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_BUSINESS_ACCOUNT_ID`)
   and omits the one that does (`META_APP_SECRET`).
2. `docs/reference-manual.md:7887` — describes sender-match routing as current and recipient-match as
   a "banked blocker". The code has done recipient-match since 16 August 2026.
3. `docs/reference-manual.md:7891` and `:7912` — record the Pro-vs-Max gate discrepancy as an open
   backlog bug and say "WhatsApp is Max only". `lib/features.ts` grants it to Pro.
4. `docs/reference-manual.md:7905` and `:9552` — reference `ENCRYPTION_KEY` and `lib/crypto.ts`.
   Neither exists.

Four earlier reports remain accurate on their own subjects and are the fuller history:
`docs/whatsapp-onboarding-report.md` (15 Aug), `docs/whatsapp-signature-report.md` (16 Aug),
`docs/whatsapp-routing-report.md` (16 Aug), `docs/whatsapp-connect-report.md` (14 Aug). Where this
report and `whatsapp-onboarding-report.md` differ — it records the routing defect as **live** and
signature verification as **NOT FOUND** — this report supersedes it: both were fixed the following day.

---

# 12. INTEGRITY CENSUS

Run as a **separate pass after** the write. Results are appended below by the census section of this
task's execution, using a byte-level tool (`scratchpad/bytecheck.py`) and a carrier-aware
variation-selector scanner — **never grep** — over this file.

See the census block appended at the end of this document.

---

## 12.1 Byte-level scan — a byte tool, never grep

`python3 scratchpad/bytecheck.py docs/whatsapp-current-state-read.md`, run as a separate pass after
the file was written:

```
--- docs/whatsapp-current-state-read.md  bytes=39538
    NUL(0x00)=0  other control bytes<0x09/0x0B/0x0C/0x0E-0x1F/0x7F=0  TOTAL FLAGGED=0
    allowed control bytes present: TAB(0x09)=0 LF(0x0A)=691 CR(0x0D)=0
```

**0 NUL bytes. 0 other disallowed control bytes. 0 tabs. 0 CR — LF line endings throughout.**

## 12.2 Non-ASCII census — every character introduced

```
    non-ASCII chars=149 distinct=10
         67  U+2014 Pd EM DASH
         26  U+2192 Sm RIGHTWARDS ARROW
         11  U+26A0 So WARNING SIGN
         11  U+FE0F Mn VARIATION SELECTOR-16
         10  U+00A7 Po SECTION SIGN
         10  U+1F534 So LARGE RED CIRCLE
          6  U+2705 So WHITE HEAVY CHECK MARK
          5  U+2026 Po HORIZONTAL ELLIPSIS
          2  U+21D2 Sm RIGHTWARDS DOUBLE ARROW
          1  U+274C So CROSS MARK
```

Ten distinct codepoints, every one deliberate: the house marker glyphs, the em dash, two arrow forms,
the section sign used for cross-references, and the ellipsis inside quoted code elisions. **No smart
quotes, no non-breaking spaces, no en dashes, no look-alike substitutions.**

## 12.3 Carrier-aware variation-selector check — bare vs paired, PER BASE

`python3 scratchpad/vscheck.py docs/whatsapp-current-state-read.md`:

```
    U+26A0 WARNING SIGN                 bare=0    +VS16=11   +VS15=0
    U+2705 WHITE HEAVY CHECK MARK       bare=6    +VS16=0    +VS15=0
    U+274C CROSS MARK                   bare=1    +VS16=0    +VS15=0
    U+1F534 LARGE RED CIRCLE            bare=10   +VS16=0    +VS15=0
    U+FE0F total in file=11  attached to a base above=11  unaccounted=0  leading-orphan=0
```

**✅ NO BASE IS SPLIT ACROSS BOTH CARRIERS.** U+26A0 — the only base here whose default presentation is
text — is paired with U+FE0F on **all 11** occurrences and appears bare **zero** times. U+2705, U+274C
and U+1F534 are default-emoji-presentation and are bare on **all** of their occurrences, with no stray
selector attached to any of them. Every one of the 11 U+FE0F codepoints in the file is accounted for by
a U+26A0 immediately preceding it; there are no orphaned or floating selectors.

### 12.4 Fixed-point note

The figures quoted in 12.1 and 12.2 are from the pass taken immediately after the report body was
written. Appending this census block necessarily changed the totals (it adds em dashes and one check
mark of its own). A final pass over the completed file was run and is reported here in ASCII so that
it cannot move the census again: **NUL bytes = 0, other disallowed control bytes = 0, tabs = 0, CR =
0**; the set of distinct non-ASCII codepoints is **unchanged at the same 10**; and the per-base
carrier result is **identical** - U+26A0 paired on every occurrence and bare on none, U+2705, U+274C
and U+1F534 bare on every occurrence with no selector attached, and every U+FE0F in the file accounted
for by a preceding U+26A0.

### 12.5 Working tree

`git status --porcelain` reports exactly one entry:

```
?? docs/whatsapp-current-state-read.md
```

**Untracked, meaning this file is new** - the brief allowed for overwriting an existing report, but
none was there. **Nothing else in the tree changed, and no entry pre-existed this task**: the working
tree was clean before the report was written. No file under `app/`, `lib/`, `supabase/` or `docs/`
other than this one was created, edited or deleted, and no SQL was executed.
