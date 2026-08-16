# WhatsApp (and Messenger, and Instagram) — what is genuinely left

READ-ONLY INVESTIGATION. **No file was edited, nothing was committed, no build was run, no deploy, no
database write, no Meta call.** `git status` is in G4. **Nothing is proposed outside Part F.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Operator, customer and server surfaces are reported **separately**. Every claim is marked **READ**,
**INFERRED** or **LIVE-VERIFIED**.

⚠️ **Messenger and Instagram were added to the brief mid-task and are covered in their own section
before Part F**, since you are right that they are structurally the same problem.

---

# 🔴 THE HEADLINE, AND IT CORRECTS THE BRIEF'S PREMISE IN BOTH DIRECTIONS

**The brief says the receive side "exists" and only onboarding is missing. Both halves need adjusting.**

1. ✅ **MORE has been proven than the brief assumes.** The manual records the WhatsApp flow as
   **LIVE-VERIFIED**, twice, with a note that a **Meta number was whitelisted** — so messages have been
   sent and received, not merely compiled. **D1 quotes it.**
2. 🔴 **AND THE RECEIVE SIDE HAS A ROUTING DEFECT THAT WOULD BREAK ON THE FIRST REAL CUSTOMER.** The
   Meta webhook looks the truck up by matching the **CUSTOMER'S phone number** against
   `trucks.whatsapp_sender` — the truck's own number. The older Twilio webhook in the same repository
   matches on the number the message was sent **TO**, which is correct. **C1 quotes both, side by side.**
   **INFERRED: the live verification passed because the tester's own number was in `whatsapp_sender`,
   which is exactly the configuration that makes the wrong field look right.**

> 🔴 **So the answer to "what is genuinely left" is not only onboarding. There is a code defect between
> a customer's message and the right truck, and it is invisible in exactly the test that was run.**

---

# PART A — WHAT EXISTS, END TO END

## A1. An inbound message, from Meta's webhook to a sent reply

**READ** — `app/api/webhooks/meta/whatsapp/route.ts`, every step in order.

### Step 1 — the verify handshake (GET)

```ts
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  console.log('[webhook/meta-whatsapp] verify attempt:', {
    mode,
    token,
    envToken: process.env.META_WEBHOOK_VERIFY_TOKEN,
    match: token === VERIFY_TOKEN,
  })

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[webhook/meta-whatsapp] verified')
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

⚠️ **That `console.log` prints the verify token itself to the server log**, on every attempt including
failures. Not a live-traffic path, but worth knowing before this is exercised in production.

### Step 2 — 🔴 SIGNATURE VERIFICATION: **NOT FOUND**

**Stated plainly: there is none.** Searching `app/` and `lib/` for `x-hub-signature`,
`hub.signature`, `META_APP_SECRET` and `appsecret` returns **nothing**.

⚠️ **The codebase knows how to do this** — `lib/stripe/webhook-signature.ts` exists and is hand-rolled
for exactly this purpose. **READ**, its own header:

```
// `grep -rn "createHmac|timingSafeEqual|X-Hub-Signature|constructEvent"` returned ZERO matches before
```

**INFERRED:** any party that learns the URL can POST a fabricated message payload and cause a real
WhatsApp reply to be sent to any number they name, at HatchGrab's cost. **The endpoint is unauthenticated
in the POST direction.**

### Step 3 — parsing

```ts
    const entry    = body?.entry?.[0]
    const changes  = entry?.changes?.[0]
    const value    = changes?.value
    const messages = value?.messages

    if (!messages?.length) {
      // Status update or other non-message event — acknowledge and ignore
      return NextResponse.json({ ok: true })
    }

    const message       = messages[0]
    const from          = message.from as string  // digits only, no + prefix
    const text          = message.type === 'text' ? (message.text?.body as string) : null
    const phoneNumberId = value?.metadata?.phone_number_id as string
```

⚠️ **Only `entry[0].changes[0].messages[0]` is read** — Meta may batch, and any second message in a
payload is silently dropped. **Text only:** an image, voice note or sticker yields `text === null` and
returns without a reply.

### Step 4 — 🔴 the truck lookup (the defect — see C1)

```ts
    const fromVariants = [
      `+${from}`,
      from,
      from.startsWith('44') ? `0${from.slice(2)}` : null,
    ].filter((v): v is string => v !== null)

    const { data: truck } = await supabase
      .from('trucks')
      .select(`id, name, slug, truck_emoji, whatsapp_sender, whatsapp, plan, feature_overrides, trial_expires_at`)
      .or(fromVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
      .eq('active', true)
      .single()

    if (!truck) {
      console.warn('[webhook/meta-whatsapp] no truck found for number:', from)
      return NextResponse.json({ ok: true })
    }
```

### Step 5 — the plan gate

```ts
    if (!canAccess(truck.plan, 'whatsapp_replies', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
      return NextResponse.json({ ok: true })
    }
```

### Step 6 — the greeting decision, then the events read

```ts
    let isFollowUp = false
    try {
      const { data: prior } = await supabase
        .from('whatsapp_logs')
        .select('created_at')
        .eq('customer_number', from)
        .eq('truck_id', truck.id)
        .not('response_sent', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      isFollowUp = !!prior && localDateOfInstant(prior.created_at, truckTz) === getLocalDateInTz(truckTz)
    } catch (err) { … isFollowUp = false }
```

⚠️ **READ** — the events query uses a **UTC** date, the idiom §7 forbids:

```ts
    const today = new Date().toISOString().split('T')[0]
    const { data: events } = await supabase
      .from('truck_events')
      … .gte('event_date', today)
```

**The greeting logic three lines above is timezone-correct** (`getLocalDateInTz`), so the file uses both
conventions. **INFERRED: between 00:00 and 01:00 BST the events list would still include yesterday.**

### Step 7 — classification, log, reply decision, send

```ts
    const { reply, classification } = await generateWhatsAppReply({ … })

    supabase.from('whatsapp_logs').insert({ truck_id, customer_number: from, message_in: text, classification, events_found, response_sent: reply ?? null, possible_miss: … })

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
```

⚠️ **A send failure is swallowed into a `console.error` and the webhook still returns 200.** Nothing
records that the reply did not go out — the `whatsapp_logs` row was written **before** the send and says
`response_sent: reply`, i.e. **the log asserts a reply that may never have been delivered.**

## A2. The classifier's four buckets

**READ** — `lib/whatsapp-classifier.ts:131`:

```ts
  classification: 'SPECIFIC_QUERY' | 'MENU_QUERY' | 'ALLERGEN_QUERY' | 'IGNORE'
```

**READ** — the prompt that assigns them, `:149-165`:

```
SPECIFIC_QUERY — asking about schedule, location, dates, times, or where the truck is.
…
IGNORE — spam, gibberish, complaints, requests to book the truck for events, or completely unrelated messages.
…
Reply with exactly one word: SPECIFIC_QUERY, MENU_QUERY, ALLERGEN_QUERY, or IGNORE
```

| Bucket | What it does — READ |
|---|---|
| `SPECIFIC_QUERY` | answers from the truck's upcoming events (schedule/location) |
| `MENU_QUERY` | a Gemini answer grounded in the live menu, with price validation and a deterministic fallback |
| `ALLERGEN_QUERY` | 🔴 a **fixed redirect**, never an LLM answer — `return { reply: allergenRedirect(…) }` |
| `IGNORE` | 🔴 `if (classification === 'IGNORE') return { reply: null, classification: 'IGNORE' }` — **logged, nothing sent** |

⚠️ **READ**, `:178` — the fail-open on an unparseable LLM answer:

```ts
      classification = 'MENU_QUERY' // fail open — safer than SPECIFIC_QUERY (no event data needed)
```

✅ And a **deterministic safety floor runs before every branch** — the manual (`:5647`) records it as
**LIVE-VERIFIED**: any absence/safety token redirects regardless of what Gemini chose, *"so the
probabilistic classifier can NEVER be the safety boundary"*.

## A3. `sendMetaWhatsApp`, and where each parameter comes from

**READ** — `lib/meta-whatsapp.ts` in full:

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

| Parameter | Source |
|---|---|
| `to` | **Meta's inbound payload** — `message.from` |
| `message` | the classifier's `reply` |
| `phoneNumberId` | 🔴 **Meta's inbound payload** — `value.metadata.phone_number_id`. **NOT the truck row.** |
| `META_WHATSAPP_ACCESS_TOKEN` | 🔴 **one environment variable — a single global credential** |

🔴 **`trucks.whatsapp_sender` is NEVER passed to Meta.** The reply goes out from whichever business
number received the message, identified by Meta's own id. **The stored number's only role in the send
path is the lookup at step 4 — the one that is wrong.**

## A4. Every environment variable on the WhatsApp path

| Variable | Read at | Absent → | Hard failure or silent skip? |
|---|---|---|---|
| `META_WEBHOOK_VERIFY_TOKEN` | `meta/whatsapp/route.ts:13` | `undefined`; the GET compares `token === undefined` | ⚠️ **Fails the handshake** — Meta cannot subscribe. **Loud, at setup time.** |
| `META_WHATSAPP_ACCESS_TOKEN` | `lib/meta-whatsapp.ts:11` | `Bearer undefined` → Meta returns 401 → `throw` | 🔴 **The throw is CAUGHT and logged at the call site.** The webhook returns 200, the log row already says a reply was sent. **SILENT SKIP in every sense that matters.** |
| `GEMINI_API_KEY` | `lib/whatsapp-classifier.ts:65` | classification falls to `MENU_QUERY`, then the deterministic fallback | ⚠️ **Silent degradation** — a reply still goes out, just a dumber one. |
| `NEXT_PUBLIC_HATCHGRAB_URL` | `meta/whatsapp/route.ts:125` | `?? ''` → the reply contains a **relative, broken link** | 🔴 **Silent** — a customer gets a reply with a dead URL. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `:8-11` | client construction with `!` | throws at module load |
| `TWILIO_WHATSAPP_NUMBER` | `lib/twilio.ts:6` | `!` non-null assertion | ⚠️ the **legacy** path only |

🔴 **THE APNs LESSON APPLIES HERE, AND WORSE.** With APNs, a missing variable made `apnsConfig()` return
`null` and log `skipped: 'not-configured'` — a silent skip that hid a defect for three weeks. **Here the
send failure is caught and discarded with the log row already claiming success**, so the record actively
asserts the opposite of what happened. **Nothing counts sends, failures or misses.**

## A5. The five server call sites consuming `whatsapp_sender`

**READ** — and this is the important part: **not one of them is a send.**

```
app/api/dashboard/action/route.ts:195    whatsappSender: truck.whatsapp_sender ?? null,
app/api/dashboard/action/route.ts:301    whatsappSender: truck.whatsapp_sender ?? null,
app/api/dashboard/action/route.ts:965    whatsappSender: truck.whatsapp_sender ?? null,
app/api/dashboard/action/route.ts:1654   whatsappSender:         truck.whatsapp_sender ?? null,
app/api/dashboard/action/route.ts:2010   whatsappSender: truck.whatsapp_sender ?? null,
app/api/orders/submit/route.ts:1231      whatsappSender:         truck.whatsapp_sender ?? null,
lib/payments/promote-draft.ts:452        whatsappSender:         truck.whatsapp_sender ?? null,
```

**All seven are the same thing: a parameter passed to `formatConfirmationEmail`.** ✅ Plus one read
site — `app/api/dashboard/route.ts:47` includes it in the dashboard payload — and one **write** site,
`app/api/manage/route.ts:861`, where it appears in the `update_truck` allow-list.

---

# PART B — WHAT IS MISSING FOR A TRUCK TO ONBOARD

## B1. What the "Connect" number is actually used for at send time

🔴 **NOTHING. It is a customer-facing display string in emails, and an inbound lookup key. It is never
sent to Meta.**

**READ** — its only consumption, `lib/email.ts:331-342`:

```ts
      whatsapp:  (() => {
        // Customer-facing WhatsApp number: prefer the WhatsApp sender, fall back to the contact phone
        // (Gusto's number lives in contact_phone, not whatsapp_sender). Show the number VISIBLY in the
        // label so the customer can read it even if the link doesn't open, and link to a wa.me URL
        // normalised to UK international digits — strip a leading 0 / accept +44 or 44 → "44…":
        // "07380736226" → "https://wa.me/447380736226".
        const raw = params.whatsappSender ?? params.contactPhone
        if (!raw) return { label: 'WhatsApp us', value: null as string | null, isLink: true }
        const digits = raw.replace(/\D/g, '')
        const intl = digits.startsWith('44') ? digits : digits.startsWith('0') ? `44${digits.slice(1)}` : `44${digits}`
        return { label: `WhatsApp us: ${raw}`, value: `https://wa.me/${intl}`, isLink: true }
      })(),
```

**and `lib/email.ts:468-471`:**

```ts
      if (method === 'whatsapp' && params.whatsappSender) {
        const num = params.whatsappSender.replace(/[^\d+]/g, '')
        return `Questions? Message us on WhatsApp: ${num}`
      }
```

**OPERATOR SURFACE — READ**, the field's own helper text, `app/manage/[token]/page.tsx:9044`:

```
The WhatsApp Business number used to send automated replies to customers (set up with the WhatsApp Business API). This is separate from your contact number above.
```

⚠️ **That sentence is not true of the code.** The number is not used to send anything. **READ** — the
manual already concedes half of it, `:1654`, marked **LIVE-VERIFIED**:

```
relabelled the button "Connect"→"Save" (no real Meta linking yet; Messenger/Instagram keep "Connect / Coming soon")
```

🔴 **The button reads "Connect" in the code today** (`docs/whatsapp-connect-report.md` and the comment at
`page.tsx:8966` both name it), so either the relabel was reverted or the manual entry describes an intent
that did not land. **Stated as an observation, not resolved.**

## B2. What Meta requires for one business to send on behalf of many trucks — 🔴 INFERRED THROUGHOUT

**I am reasoning about Meta's product here, not reading our code. Treat every row as INFERRED and check
it against Meta's current documentation before acting.**

| Model | What it means | Fit |
|---|---|---|
| **One WABA, many phone numbers** | HatchGrab owns one WhatsApp Business Account; each truck gets its **own phone number** added to it. Each number needs its own display-name review. | **INFERRED: this is what the code's shape implies** — one access token, per-truck `phone_number_id`. ⚠️ Meta caps numbers per WABA and each addition is a manual step. |
| **One WABA, ONE shared number** | Every truck's customers message the same HatchGrab number. | ⚠️ **INFERRED: it would break the operator's brand** — the customer sees "HatchGrab", not the truck — and it makes the routing problem in C1 *worse*, because `phone_number_id` would no longer distinguish trucks either. |
| **Tech-Provider / Embedded Signup** | Each truck gets **its own WABA**, connected to HatchGrab through Meta's Embedded Signup flow; HatchGrab holds a system-user token per client. | **INFERRED: this is the model that matches "self-serve onboarding".** It requires HatchGrab to be a verified business and an approved Tech Provider, and it is the only one where a truck brings its own number without HatchGrab touching Meta's console per truck. |

🔴 **The incorporation unblocks business verification, which is a prerequisite for all three — but it is
not sufficient for the third.** ⚠️ **INFERRED: Tech Provider / Solution Partner status is a separate
application.**

## B3. Does the code assume ONE sender or PER-TRUCK senders? — 🔴 BOTH, INCONSISTENTLY

**This is the architectural answer, and the code disagrees with itself.**

| Evidence | Implies |
|---|---|
| `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}` — **one** env var, no truck parameter | **ONE credential for all trucks** |
| `sendMetaWhatsApp(from, reply, phoneNumberId)` with `phoneNumberId` from the inbound payload | **PER-TRUCK numbers** — the reply goes out from whichever number received |
| `trucks.whatsapp_sender` — a **per-truck column** | **PER-TRUCK numbers** |
| **NOT FOUND: any column storing a per-truck `phone_number_id`, WABA id, or access token** | ⚠️ **the identifier Meta actually addresses is never persisted** |

🔴 **So: per-truck numbers, one shared credential, and the per-truck Meta identifier is never stored —
it is only ever borrowed from an inbound message.** **INFERRED, and it is the crux: the system can
REPLY to a truck's customers but cannot INITIATE anything to them, because outside a webhook it has no
`phone_number_id` to send from.**

## B4. Embedded Signup — **NOT FOUND**

**Stated plainly.** Searching `app/`, `lib/` and `components/` for `embedded signup`, `facebook oauth`,
`meta oauth`, `FB.login`, `waba`, `business_management` and `whatsapp_business` returns **zero
matches**. ⚠️ **No OAuth of any kind, no Meta SDK, no redirect handler, no token-exchange route. Nothing
anticipates it.**

## B5. What a truck would have to DO today, and which steps have no UI

| # | Step | UI? |
|---|---|---|
| 1 | Have a phone number not already on consumer WhatsApp | n/a |
| 2 | HatchGrab adds it to a WABA in Meta's console | 🔴 **NO UI — Dominic, by hand, in Meta** |
| 3 | Verify the number (SMS/voice code) | 🔴 **NO UI — a code sent to the truck's phone, relayed to Dominic** |
| 4 | Display-name review by Meta | 🔴 **NO UI — Meta-side, days** |
| 5 | Point the webhook at `/api/webhooks/meta/whatsapp` and subscribe to `messages` | 🔴 **NO UI — Meta console** |
| 6 | Operator types the number into Settings → Auto-replies → **Connect** | ✅ **the only step with a UI** |
| 7 | The plan gate must grant `whatsapp_replies` | ✅ automatic |
| 8 | 🔴 **The inbound routing must find the truck** | 🔴 **BROKEN — see C1** |

🔴 **Seven of the eight steps have no UI, and the one that does only writes a string that the send path
never reads.** ⚠️ **Even completing all eight by hand does not produce working auto-replies for a real
customer**, because of C1.

---

# PART C — THE MULTI-TRUCK QUESTION

## C1. 🔴 DOES THE WEBHOOK ROUTE TO THE RIGHT TRUCK? **NO.**

**READ** — the Meta webhook, `meta/whatsapp/route.ts:52` and `:64-79`:

```ts
    const from          = message.from as string  // digits only, no + prefix
    …
    // whatsapp_sender may be stored as +447..., 447..., or 07... (UK local).
    // Meta always sends digits only (e.g. 447941042253). Build all variants to match any format.
    const fromVariants = [
      `+${from}`,
      from,
      from.startsWith('44') ? `0${from.slice(2)}` : null,
    ].filter((v): v is string => v !== null)

    const { data: truck } = await supabase
      .from('trucks')
      …
      .or(fromVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
      .eq('active', true)
      .single()
```

🔴 **`from` is the CUSTOMER. `whatsapp_sender` is the TRUCK. The lookup asks: "which truck's own
WhatsApp number is equal to this customer's phone number?"** For any real customer the answer is none,
`truck` is null, and the handler returns `{ ok: true }` having sent nothing.

**READ — the sibling webhook in the same repository does it correctly**,
`app/api/webhooks/whatsapp/route.ts:16-17` and `:28-41`:

```ts
    const from = formData.get('From') as string  // e.g. whatsapp:+447700900000
    const to   = formData.get('To')   as string  // e.g. whatsapp:+14155238886
    …
    const toNumber   = to.replace('whatsapp:', '')
    const fromNumber = from.replace('whatsapp:', '')
    …
    const { data: truck } = await supabase
      .from('trucks')
      …
      .eq('whatsapp_sender', toNumber)
      .eq('active', true)
      .single()
```

✅ **Twilio: `.eq('whatsapp_sender', toNumber)` — the number messaged TO. Correct.**
🔴 **Meta: matched against `from` — the number messaged FROM. Wrong field.**

**INFERRED, and it is the identifier that should be used:** the Meta payload already carries
`value.metadata.phone_number_id`, read at `:54` and used only as the send identity at `:159`. **That is
the business number the customer messaged. Nothing maps it to a truck, because no column stores it.**

> 🔴 **THE BLOCKER IS NOT ONBOARDING. Even with a perfectly onboarded truck, a customer message would
> not reach the classifier.** ⚠️ And with two trucks it is worse than useless: `.single()` errors on
> multiple matches, so if two trucks ever did match, **neither** gets a reply.

⚠️ **How this passed a live test — INFERRED, and it fits every fact.** The manual records
*"Meta number now whitelisted"* (D1). In Meta's test setup the **business** number is Meta's sandbox
number and **recipients** are whitelisted. If the tester's own mobile was in `trucks.whatsapp_sender`,
then `from` = the tester = `whatsapp_sender` → **the lookup matches and everything downstream works
perfectly.** ⚠️ **Pizzeria Gusto's `whatsapp_sender` is `07380736226`, and `lib/email.ts:333` notes
"Gusto's number lives in contact_phone, not whatsapp_sender"** — so the value in that column is not
Gusto's contact number. **The test configuration is precisely the one that makes the wrong field look
right.**

## C2. How a customer's number is matched to an order and a truck

**NOT FOUND — there is no order matching at all.** The webhook never queries `orders`, never reads
`customer_phone`, and never looks for an order. **READ** — the only per-customer read is the greeting
history:

```ts
        .from('whatsapp_logs')
        .select('created_at')
        .eq('customer_number', from)
        .eq('truck_id', truck.id)
```

**The truck is resolved from the phone number alone (wrongly, per C1); the customer is never identified
as a customer.** ✅ **INFERRED: that is a reasonable design** — the bot answers "when are you open" and
"what's on the menu", neither of which needs an order.

## C3. A message from a number with no matching order

**Nothing special — because orders are never consulted.** What actually happens is the **no-matching-
TRUCK** path, which today is *every real message*:

```ts
    if (!truck) {
      console.warn('[webhook/meta-whatsapp] no truck found for number:', from)
      return NextResponse.json({ ok: true })
    }
```

🔴 **A `console.warn`, a 200, and silence.** No `whatsapp_logs` row (the insert is below this return),
no alert, no counter. ⚠️ **The customer sees their message delivered and simply never answered**, and
nothing anywhere records that it happened.

---

# MESSENGER AND INSTAGRAM — the mid-task addition

**They are structurally the same problem, and both are further behind than WhatsApp.**

**READ** — `app/api/webhooks/messenger/route.ts`, the POST in full:

```ts
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('[webhook/messenger] incoming:', JSON.stringify(body, null, 2))

    const entry     = body?.entry?.[0]
    const messaging = entry?.messaging?.[0]

    if (!messaging?.message?.text) {
      return NextResponse.json({ ok: true })
    }

    const senderId = messaging.sender?.id
    const text     = messaging.message.text
    const pageId   = entry?.id

    if (!senderId || !pageId) {
      return NextResponse.json({ ok: true })
    }

    // TODO: Route to classifier
    console.log('[webhook/messenger] message from:', senderId, 'text:', text)

    return NextResponse.json({ ok: true })
  } catch (err) { … }
}
```

**READ** — `app/api/webhooks/instagram/route.ts` is the same file with `igAccountId = entry?.id` in place
of `pageId`. **Both carry the identical `// TODO: Route to classifier`.**

| | WhatsApp | Messenger | Instagram |
|---|---|---|---|
| Verify handshake | ✅ | ✅ | ✅ |
| Signature verification | 🔴 **NOT FOUND** | 🔴 **NOT FOUND** | 🔴 **NOT FOUND** |
| Parses an inbound message | ✅ | ✅ | ✅ |
| **Truck lookup** | ⚠️ present but **wrong field** | 🔴 **NOT FOUND** | 🔴 **NOT FOUND** |
| **Classifier call** | ✅ | 🔴 **NOT FOUND — `// TODO`** | 🔴 **NOT FOUND — `// TODO`** |
| **Send function** | ✅ `lib/meta-whatsapp.ts` | 🔴 **NOT FOUND — no module exists** | 🔴 **NOT FOUND — no module exists** |
| Logging | ✅ `whatsapp_logs` | 🔴 `console.log` only | 🔴 `console.log` only |
| Operator UI | ✅ one field | 🔴 **REMOVED 14 Aug** | 🔴 **REMOVED 14 Aug** |

**READ** — why the UI went, `app/manage/[token]/page.tsx:9048-9056`:

```
            {/* ── 🔴 THE MESSENGER AND INSTAGRAM ROWS WERE REMOVED HERE — 14 August 2026 (Guideline 2.1) ──
                Both were a `<label>`, a `disabled` `<input>` whose PLACEHOLDER READ "Coming soon", and a
                `disabled` "Connect" button. That is a control a user can see and cannot operate, which is
                the definition of an incomplete feature under 2.1 …
                🔴 UI REMOVAL ONLY. Nothing was dropped from the database, the `Truck` interface, or any
                allow-list: `social_instagram`, `social_facebook`, `whatsapp` and `whatsapp_sender` are all
                still declared … Re-adding these rows
                when the integrations exist is a JSX change and nothing else.
```

**The routing identifier problem is the same shape and, INFERRED, slightly easier:** Messenger keys on
`entry.id` (the **Page ID**) and Instagram on `entry.id` (the **IG account ID**) — both stable
per-business identifiers that arrive on every message. ⚠️ **But NOT FOUND: any column storing a Page ID
or IG account ID.** `trucks.social_facebook` and `trucks.social_instagram` hold **URLs/handles**, not
numeric platform IDs, so there is nothing to match against.

⚠️ **INFERRED about Meta, not read:** Messenger and Instagram messaging use **Page access tokens
obtained per-Page through Facebook Login**, and the same 24-hour standard-messaging window. **So they
need the OAuth flow that B4 found NOT FOUND — arguably more than WhatsApp does**, because there is no
"add a number in the console" shortcut for a Page you do not own.

---

# PART D — WHAT HAS ACTUALLY BEEN PROVEN

## D1. Evidence any message was ever sent or received in production

🔴 **FOUND, and it corrects the brief. READ**, `docs/reference-manual.md:1631`:

```
Status: **the operator has LIVE-VERIFIED all feature work below on real devices** — including the
**two-device concurrent oversell test** … and the **WhatsApp allergen + greeting flow**
(Meta number now whitelisted)
```

**READ** — `reference-manual.md:5649`:

```
> **GREETING — once per calendar day per sender (V7.7, LIVE-VERIFIED V7.8).** Previously isFollowUp was
hardcoded false → "Hey there 👋" fired on every message. Now the webhook reads whatsapp_logs …
```

**READ** — `reference-manual.md:5647`:

```
> **ALLERGEN ROUTING — presence-confirm vs absence-redirect, with a bucket-independent floor (V7.7,
LIVE-VERIFIED V7.8). SAFETY-CRITICAL.**
```

✅ **So messages HAVE been exchanged**: the greeting fired, was seen to fire on every message, was fixed,
and the fix was verified — which requires at least three real round trips.

⚠️ **But "whitelisted" is the operative word.** It describes Meta's **test** configuration, not a
production business number serving public customers. **INFERRED: what is proven is that the classifier,
the greeting, the allergen floor and the send all work when a message reaches them. What is NOT proven
is that a real customer's message reaches them** — and C1 says it would not.

**NOT FOUND: any record of a message from a member of the public, any send counter, any production
log line, or any evidence involving a truck's own verified business number.**

## D2. Each tier, classified

| Tier | Status |
|---|---|
| Verify handshake (WhatsApp) | **BUILT, LIVE-VERIFIED** — Meta subscribed successfully (`:1631`) |
| Signature verification | 🔴 **NOT BUILT** |
| Classification → four buckets | **BUILT, LIVE-VERIFIED** (`:5647`, `:5649`) |
| ALLERGEN floor (safety-critical) | **BUILT, LIVE-VERIFIED V7.8** |
| Greeting once per day | **BUILT, LIVE-VERIFIED V7.8** |
| Tier-3 MENU_QUERY grounded answers | ⚠️ **BUILT NOT VERIFIED** — `:5625` *"Built V6.9, tsc-clean, NOT live-verified"* |
| Dietary/allergen presence-confirm | ⚠️ **BUILT NOT VERIFIED** — `:5629` *"BUILT V7.0, tsc-clean, NOT live-verified"* |
| `sendMetaWhatsApp` | **BUILT, LIVE-VERIFIED** (replies were received) |
| `whatsapp_logs` | **BUILT + APPLIED** — migration `20260605_whatsapp_logs.sql`; `:5649` confirms *"the migration is applied"* |
| **Inbound truck routing** | 🔴 **BUILT AND WRONG** — verified only in a configuration that masks the defect |
| Multi-truck routing | 🔴 **NOT BUILT** |
| Self-serve onboarding / Embedded Signup | 🔴 **NOT BUILT — NOT FOUND** |
| Messenger / Instagram replies | 🔴 **NOT BUILT — `// TODO`** |
| Allergen `verified` filter in the classifier | 🔴 **NOT BUILT** — `:1462`, `:1531` record it as outstanding |

## D3. Gusto's `07380736226` — normalisation

🔴 **NOTHING normalises it before it reaches Meta, and nothing needs to — because it never reaches Meta.**

**READ** — the write path, `app/api/manage/route.ts:861`, is a bare allow-list:

```ts
    const allowed = ['crew_mode', 'kds_mode', … 'whatsapp_sender', 'preferred_contact_method', …]
```

**NOT FOUND: any E.164 conversion, any `+44` prefixing, any validation** on the write path or anywhere
else touching this column.

**Where the format DOES matter, and where it is handled:**

| Consumer | Handling |
|---|---|
| **Email `wa.me` link** | ✅ **normalised** — `lib/email.ts:339-340` strips non-digits and prefixes `44` |
| **Email plain-text line** | ⚠️ **not normalised** — `raw.replace(/[^\d+]/g, '')` prints `07380736226` |
| **Meta webhook lookup** | ⚠️ **worked around** — three variants built, including `0…`, precisely to cope with this |
| **The Meta API** | 🔴 **never receives it** |

⚠️ **INFERRED about Meta:** it expects E.164 without `+` (`447380736226`). **The stored `07380736226`
would be rejected or mis-addressed if it were ever used as a recipient.**

🔴 **What it actually predicts at onboarding:** the number is not a "sender" in any Meta sense — **there
is no column for the identifier Meta uses (`phone_number_id`)**. Onboarding a real truck means storing
something this schema has no room for, and the format question is downstream of that.

---

# PART E — COMPLIANCE AND COST

## E1. What Meta requires before a business can send — 🔴 INFERRED THROUGHOUT

**Reasoning about Meta's product, not reading our code. Verify against current documentation.**

1. **Business verification** — legal entity, documents. ✅ **INFERRED: incorporating as HatchGrab Ltd is
   what unblocks this, and it was the stated blocker.**
2. **A display name review** per phone number — the name customers see must match the business.
   ⚠️ **INFERRED: per NUMBER, so per truck, and it is not instant.**
3. **Message templates approved in advance** — required for **business-initiated** messages.
   ✅ **INFERRED: not required for our path**, which only ever replies (see E2).
4. **A verified payment method** on the WABA before messages send.
5. ⚠️ **INFERRED, and it is the one for a multi-tenant product:** sending on behalf of other businesses
   is a **Tech Provider / Solution Partner** posture with its own application — separate from being a
   verified business.

## E2. Freeform or templates? — **FREEFORM**

**READ** — `lib/meta-whatsapp.ts:14-19`:

```ts
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toDigits,
      type: 'text',
      text: { body: message },
    }),
```

**`type: 'text'` with a `body`. NOT FOUND: any `type: 'template'`, any `template` object, any
`language`/`components` fields.**

🔴 **Does the code respect the customer-service window? NOT FOUND — there is no window check anywhere.**

✅ **INFERRED, and it is why this has not bitten:** the send happens **only inside the webhook handler
for an inbound message**, so it is structurally within seconds of a customer message and therefore inside
the window by construction. ⚠️ **That is an accident of shape, not a guard.** Anything that ever sends
outside a webhook — a queue, a retry, a scheduled follow-up — would be outside the window with nothing
to stop it, and Meta would reject it or require a template.

## E3. Per-message cost, and metering

**Two costs, and NOT FOUND: any metering, quota, counter or rate limit on either.**

| Cost | Where | Metered? |
|---|---|---|
| **Meta conversation charge** | every `sendMetaWhatsApp` | 🔴 **NOT FOUND** |
| **Gemini API call** | `whatsapp-classifier.ts:65` — one per classification, plus one more per MENU_QUERY | 🔴 **NOT FOUND** |

🔴 **Combined with the missing signature verification (A1), this is the sharp edge: an unauthenticated
POST endpoint that spends money on both Meta and Google per request, with no counter, no rate limit and
no alert.** ⚠️ `whatsapp_logs` records what was classified and what reply was composed, but it is written
**before** the send and does not record success, failure or cost — so it cannot be reconciled against a
Meta bill.

---

# PART F — WHAT IS LEFT

**Shape only. No implementation, no ordering, no recommendation.**

## F1. Separated by kind

### CODE

| # | Item |
|---|---|
| 1 | 🔴 **Inbound truck routing** — the Meta webhook matches the customer's number against `whatsapp_sender`. **This is a defect, not a missing feature.** |
| 2 | 🔴 **Somewhere to store Meta's per-truck identifier** — no column holds a `phone_number_id`, WABA id or per-truck token. |
| 3 | 🔴 **Webhook signature verification** — absent on all three Meta endpoints. |
| 4 | ⚠️ **An onboarding flow** — OAuth / Embedded Signup: **NOT FOUND** in any form. |
| 5 | ⚠️ **Operator UI beyond one text field**, and copy that matches what the field does. |
| 6 | ⚠️ **Send-failure recording** — the log claims a reply that may not have gone out. |
| 7 | ⚠️ **Metering / rate limiting** on a path that spends money per request. |
| 8 | ⚠️ **The UTC `today`** in the events query (§7). |
| 9 | 🔴 **Messenger and Instagram: truck lookup, classifier call and send module — all absent.** Their UI rows were removed and re-adding them "is a JSX change and nothing else". |
| 10 | ⚠️ **The allergen `verified` filter** in the classifier — recorded as outstanding at `:1462` and `:1531`. |

### META CONFIGURATION

| # | Item |
|---|---|
| 11 | Business verification against HatchGrab Ltd |
| 12 | A WABA, and a decision between the three models in B2 |
| 13 | Per-number: add, verify, display-name review |
| 14 | Webhook subscription per product (WhatsApp / Messenger / Instagram) |
| 15 | ⚠️ Tech Provider / Solution Partner application, if the per-truck-WABA model is chosen |
| 16 | A payment method on the WABA |
| 17 | ⚠️ For Messenger/Instagram: a Facebook App with the messaging permissions, and App Review |

### BUSINESS PROCESS

| # | Item |
|---|---|
| 18 | Who owns the number — the truck or HatchGrab — and what happens when a truck leaves |
| 19 | Who pays the per-conversation cost, and how it is recovered |
| 20 | ⚠️ The AI-disclosure question the manual explicitly deferred (`:5625`: *"an AI/auto-reply disclaimer is DEFERRED pending a check of Meta's current business-messaging disclosure rules"*) |
| 21 | Relaying number-verification codes between a truck and Dominic (step 3 of B5) |
| 22 | ⚠️ Allergen liability — the bot answers food-safety questions, and the floor is code-guaranteed while the untagged-defer is prompt-strength (`:5647`) |

## F2. Blocked on something only Dominic can do

| Item | Why |
|---|---|
| 11, 12, 13, 14, 16, 17 | **Meta console + legal identity.** No code can do these. ✅ **Incorporation unblocks 11**, which gates the rest. |
| 15 | An application to Meta, with a decision behind it |
| 18, 19, 21, 22 | Commercial and legal calls |
| 20 | A policy read, then a decision |
| **1, 2, 3, 9** | ⚠️ **NOT blocked on Dominic — these are code**, and item 1 in particular does not need Meta's cooperation to be wrong. |

## F3. The shape, and stop

🔴 **Three layers, and they are not sequential in the way the brief assumes.** There is a **code defect**
between a customer and the right truck; there is a **missing identifier** in the schema that any Meta
model will need; and there is an **onboarding flow that does not exist in any form**. **The incorporation
unblocks the Meta layer. It does not touch the other two.** ⚠️ **And what has been live-verified is the
part after routing — the classifier, the greeting, the allergen floor and the send — which is genuinely
valuable and genuinely proven, and is not what stands between a truck and working auto-replies.**

**Reporting the shape and stopping, as instructed.**

---

# PART G — INTEGRITY

## G1. Byte scan of every file opened — byte-level, never grep

All 14 files scanned for NUL, every control byte below 0x09, the 0x0B/0x0C pair, 0x0E-0x1F and 0x7F:

| File | Bytes | Offending |
|---|---|---|
| `app/api/webhooks/meta/whatsapp/route.ts` | 6,537 | 0 |
| `app/api/webhooks/whatsapp/route.ts` | 5,368 | 0 |
| `app/api/webhooks/messenger/route.ts` | 1,497 | 0 |
| `app/api/webhooks/instagram/route.ts` | 1,509 | 0 |
| `lib/whatsapp-classifier.ts` | 24,445 | 0 |
| `lib/meta-whatsapp.ts` | 705 | 0 |
| `lib/twilio.ts` | 1,920 | 0 |
| `lib/email.ts` | 42,590 | 0 |
| `app/manage/[token]/page.tsx` | 785,054 | 0 |
| `app/api/manage/route.ts` | 78,884 | 0 |
| `app/api/dashboard/action/route.ts` | 174,041 | 0 |
| `supabase/migrations/20260605_whatsapp_logs.sql` | 745 | 0 |
| `docs/reference-manual.md` | 1,536,795 | 0 |
| `docs/whatsapp-connect-report.md` | 14,096 | 0 |

**TOTAL OFFENDING: 0.**

## G2. Byte scan of this report

Separate pass after writing; result below.

## G3. Carrier-aware variation-selector check

🔴 Carriers read from **what actually precedes each U+FE0F**, never from a Unicode-category filter — a
`category == 'So'` filter silently misses bases such as U+2139 INFORMATION SOURCE (category `Ll`).

Per emoji-presentation base, **measured after writing, not predicted**:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+26A0 WARNING SIGN | 47 | 47 | **0** |
| U+1F534 LARGE RED CIRCLE | 68 | 0 | 68 |
| U+2705 WHITE HEAVY CHECK MARK | 24 | 0 | 24 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 4 | 0 | 4 |
| U+1F44B WAVING HAND SIGN | 1 | 0 | 1 |

**Sum of per-base paired = 47 = total U+FE0F count = 47** — every selector has a named carrier, no
orphan, no double-count, **zero bare warning signs**. Bare is correct for the other four: three are
emoji-presentation-by-default (the waving hand is quoted from the manual's `"Hey there"` greeting note),
and U+2500 is a **box-drawing rule** inside quoted source comments. ⚠️ **U+2500 is not an emoji**, and
reporting it as unpaired would be exactly the false positive this method exists to prevent.

**Byte scan of this report (G2), same pass: 41,536 bytes, offending = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR.

## G4. `git status` — proof nothing changed

```
$ git status --porcelain
(no output — 0 lines)
```

🔴 **The working tree is COMPLETELY CLEAN**, which is a change since the last task: everything from the
preceding sessions has been committed. **READ**, `git log --oneline -3`:

```
0665740 ipad ongoing
d051b10 ipad fixes
b175963 ipad fixes
```

✅ **This investigation edited nothing, and the empty `git status` is the strongest possible proof of
it** — there is not even a report file in the diff yet, because this document is being written now.
