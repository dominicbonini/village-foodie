# WhatsApp reply simulator — the seam, read-only

**Date:** 20 August 2026
**Scope:** read-only. **NO FILE WAS CHANGED, no migration written, no deploy run, `next dev` not run.**
The only file written is this one. **No implementation is proposed** — this read is about whether the
build is small or careful.

**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

**Files read:** `lib/whatsapp-classifier.ts` (all 408 lines), `app/api/webhooks/meta/whatsapp/route.ts`,
`app/api/webhooks/whatsapp/route.ts`, `proxy.ts`, `app/api/manage/route.ts`,
`app/manage/[token]/page.tsx` (the Settings tab), `lib/time-utils.ts`. §20 and
`docs/whatsapp-readiness-report.md` were read for what they settle and are not restated.

---

# Q1 — The seam

## 1.a The function

| | |
|---|---|
| **Name** | `generateWhatsAppReply` |
| **Module** | `lib/whatsapp-classifier.ts` |
| **Signature** | `export async function generateWhatsAppReply(params: ClassifierParams): Promise<WhatsAppReplyResult>` |
| **Returns** | `{ reply: string | null; classification: 'SPECIFIC_QUERY' | 'MENU_QUERY' | 'ALLERGEN_QUERY' | 'IGNORE' }` |

```ts
export interface WhatsAppReplyResult {
  reply: string | null
  classification: 'SPECIFIC_QUERY' | 'MENU_QUERY' | 'ALLERGEN_QUERY' | 'IGNORE'
}
```

✅ **`reply` is `null` on EXACTLY ONE path** — the `IGNORE` bucket:

```ts
  if (classification === 'IGNORE') return { reply: null, classification: 'IGNORE' }
```

Every other path returns a non-empty string. **A simulator must render "the auto-reply would send
nothing" as a real outcome**, not as an error or an empty box — it is the honest answer for spam,
gibberish and catering requests, and it is a behaviour an operator should be able to see.

✅ **It already has two callers**, so it is a real seam and not a single-use function:
`app/api/webhooks/meta/whatsapp/route.ts` (live) and `app/api/webhooks/whatsapp/route.ts` (the dormant
Twilio handler). **A simulator would be the third, and the two existing call sites pass argument-for-
argument identical objects** — which is the best available evidence that the parameter set is the
whole contract.

## 1.b 🔴 IS IT PURE? NO. BUT THE DISTINCTION THAT MATTERS IS NARROWER THAN "PURE"

**It does not only compose a string.** It performs three kinds of I/O:

1. **One or two outbound Gemini calls** (`callGemini` → `fetch` to `generativelanguage.googleapis.com`).
2. **One Supabase READ** — `menu_items_db`, on the `MENU_QUERY` branch only.
3. **`console.error` on two paths** (a menu-query error, a Gemini error).

✅ **BUT IT PERFORMS NO DATABASE WRITE OF ANY KIND, AND SENDS NOTHING TO META.** That is the property
the simulator actually depends on, and it holds: `grep` for `whatsapp_logs` across the repository returns
**zero hits inside `lib/whatsapp-classifier.ts`** other than two explanatory comments, and
`sendMetaWhatsApp` is imported only by the route. **The function is read-only plus outbound-LLM.**

⚠️ **THE MENU READ IS THE ONE THAT SURPRISES.** The function does its own database query, keyed on the
`truckId` you hand it, with a **service-role client** created at module scope:

```ts
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

```ts
      const { data: rows, error } = await supabase
        .from('menu_items_db')
        .select('name, category_id, price, is_available, allergens, dietary_info, menu_categories!category_id(name)')
        .eq('truck_id', truckId)
        .eq('is_active', true)
```

**Good news for a simulator:** the menu does not have to be supplied — pass `truckId` and the live menu
is fetched. **The obligation it creates:** `truckId` is trusted completely and is the only scoping. **A
caller that lets an operator influence `truckId` reads another truck's menu with service-role
privileges.** In a Manage route the truck is resolved from `dashboard_token`, so this is satisfied by
construction — but it is a property of the CALLER, not of this function.

## 1.c The six side effects, located

| | Side effect | INSIDE the shared function? | Where |
|---|---|---|---|
| **(a)** | the `whatsapp_logs` **insert** | ✅ **NO — OUTSIDE, in the route** | `route.ts`, after the call returns |
| **(b)** | the greeting / `isFollowUp` **read** of `whatsapp_logs` | ✅ **NO — OUTSIDE, in the route** | route computes it, passes the **boolean** in |
| **(c)** | the truck lookup | ✅ **NO — OUTSIDE, in the route** | primary + fallback lookups |
| **(d)** | the plan / feature gate | ✅ **NO — OUTSIDE, in the route** | `canAccess(...)`, before the call |
| **(e)** | the **Gemini call** | 🔴 **YES — INSIDE** | `callGemini`, 1 or 2 per invocation |
| **(f)** | the send to Meta | ✅ **NO — OUTSIDE, in the route** | `sendMetaWhatsApp(from, reply, phoneNumberId)` |

✅ **FIVE OF THE SIX ARE OUTSIDE.** Only the LLM call is inside — and the LLM call is the thing the
simulator exists to exercise. **This is close to the ideal shape for what is being planned.**

⚠️ **A seventh, not on your list, and it IS inside:** the `menu_items_db` read of 1.b.

## 1.d The call sequence, quoted, from truck-match to send

```ts
    if (!canAccess(truck.plan, 'whatsapp_replies', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
      return NextResponse.json({ ok: true })
    }

    const truckTz = 'Europe/London'
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
    } catch (err) {
      console.error('[webhook/meta-whatsapp] follow-up read failed (greeting):', err)
      isFollowUp = false
    }

    const today = new Date().toISOString().split('T')[0]
    const { data: events } = await supabase
      .from('truck_events')
      .select('event_date, start_time, end_time, venue_name, town, postcode, status')
      .eq('truck_id', truck.id)
      .gte('event_date', today)
      .in('status', ['confirmed', 'open', 'unconfirmed'])
      .order('event_date', { ascending: true })
      .limit(10)

    const hgUrl = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? ''
    const { reply, classification } = await generateWhatsAppReply({
      truckName:       truck.name,
      truckEmoji:      truck.truck_emoji ?? '',
      truckId:         truck.id,
      customerMessage: text,
      events:          events ?? [],
      scheduleUrl:     truck.slug ? `${hgUrl}/trucks/${truck.slug}/order` : '',
      orderUrl:        truck.slug ? `${hgUrl}/trucks/${truck.slug}/order` : '',
      isFollowUp,
    })

    console.log('[webhook/meta-whatsapp] classification:', classification, 'reply:', reply)

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
      return NextResponse.json({ ok: true })
    }

    try {
      await sendMetaWhatsApp(from, reply, phoneNumberId)
      console.log('[webhook/meta-whatsapp] reply sent')
    } catch (err) {
      console.error('[webhook/meta-whatsapp] send failed:', err)
    }
```

✅ **The ordering to note: gate → greeting read → events query → SHARED CALL → log insert → send.**
Everything a simulator must NOT do sits either side of the one call it must make.

---

# Q2 — What it needs to be called with

## 2.a The full parameter set

```ts
interface ClassifierParams {
  customerMessage: string
  truckName: string
  truckEmoji: string
  truckId: string
  orderUrl: string
  scheduleUrl: string
  events: TruckEvent[]
  menuItems?: MenuItem[]
  isFollowUp?: boolean
}
```

| Argument | Route obtains it from | Can a simulator supply it from a truck row alone? |
|---|---|---|
| `customerMessage` | `message.text?.body` (webhook payload) | ✅ **Yes** — it is the operator's typed input. This is the ONLY field the webhook payload contributes, and it is exactly the field the simulator replaces. |
| `truckName` | `truck.name` | ✅ Yes |
| `truckEmoji` | `truck.truck_emoji ?? ''` | ✅ Yes — note the `?? ''` coalesce; see 7.f |
| `truckId` | `truck.id` | ✅ Yes |
| `orderUrl` | `` truck.slug ? `${hgUrl}/trucks/${truck.slug}/order` : '' `` | ✅ Yes, **plus `NEXT_PUBLIC_HATCHGRAB_URL`** |
| `scheduleUrl` | the **same expression, byte-identical** | ✅ Yes — and see 7.e: the two are the same string today |
| `events` | 🔴 **its own `truck_events` query** | 🔴 **NO** — event-scoped, see 2.b |
| `menuItems` | **never passed by either caller** | ⚠️ **Dead parameter** — see 2.d |
| `isFollowUp` | computed from a `whatsapp_logs` read | ✅ Yes — it is a plain boolean; see Q3 |

## 2.b 🔴 `events` IS THE ONE THING NOT DERIVABLE FROM THE TRUCK ROW

The route runs its own query and hands the rows in. A simulator that wants `SPECIFIC_QUERY` ("where are
you Friday?") to answer the way the live path answers **must reproduce that query exactly** — same
columns, same status filter, same `gte`, same order, same `limit(10)`:

```ts
      .select('event_date, start_time, end_time, venue_name, town, postcode, status')
      .eq('truck_id', truck.id)
      .gte('event_date', today)
      .in('status', ['confirmed', 'open', 'unconfirmed'])
      .order('event_date', { ascending: true })
      .limit(10)
```

⚠️ **THIS IS THE MOST LIKELY PLACE FOR THE SIMULATOR TO DRIFT FROM THE LIVE PATH**, and it would drift
QUIETLY: a different status list or a missing `limit(10)` changes what the model is grounded on, and the
reply still looks plausible. **The query is duplicated in the two existing callers already** — the
dormant Twilio route carries its own copy — so **a third copy is the established pattern, and the
established pattern is the risk.**

**The observation that settles whether a simulator matches:** run the same question through both and
byte-compare, or lift the query into a shared helper so there is nothing to compare. **That is a build
decision, not a read finding.**

## 2.c 🔴 TIME-SCOPING — THE FUNCTION REASONS IN **UTC**, AND THE ROUTE'S TIMEZONE HANDLING DOES NOT REACH IT

This matters for your question and it is a real latent defect, not a simulator-only concern.

**Inside the shared function**, the entire `SPECIFIC_QUERY` date reference is built from UTC:

```ts
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
```

```ts
    const dateStr = d.toISOString().split('T')[0]
```

and `formatEventForPrompt` computes its `(TODAY)` / `(TOMORROW)` labels against that same
`todayStr`. **The route's `truckTz` is never passed in** — it exists solely for the greeting:

```ts
    const truckTz = 'Europe/London'
```

🔴 **CONSEQUENCE: BETWEEN 00:00 AND 01:00 BST, `toISOString()` STILL RETURNS YESTERDAY'S DATE.** The
model is then told "Today = <yesterday>", and an event this morning is labelled `(TOMORROW)`. The route's
own `events` query has the same UTC basis, so it can also include a day that has already passed locally.
✅ `lib/time-utils.ts` exports `getLocalDateInTz` and `localDateOfInstant` and they are already used for
the greeting — **the correct primitives exist and are simply not wired to the date reference.**

⚠️ **For the simulator this is a fidelity question, not a new bug: it will reproduce the defect
faithfully, which is correct behaviour for a preview tool.** An operator testing at 00:30 in summer would
see a wrong day — and would be seeing exactly what a customer would see. **Worth knowing before someone
reports the simulator as broken.**

⚠️ **A second, quieter timezone dependency:** `toLocaleDateString('en-GB', …)` is called twice with no
`timeZone` option, so it formats in the **server's** zone. On Vercel that is UTC.

## 2.d ⚠️ `menuItems` IS DECLARED AND NEVER USED

It appears in the interface and **nowhere else in the file** — the destructure at the top of the
function omits it:

```ts
  const { truckName, truckEmoji, truckId, customerMessage, events, scheduleUrl, orderUrl, isFollowUp = false } = params
```

Neither existing caller passes it. **The menu comes from the internal query of 1.b instead.** Recorded so
nobody builds a simulator that "supplies the menu" through a parameter that is discarded — **it would
appear to work, because the internal query would quietly do the real job.** That is the worst kind of
dead parameter: one whose uselessness is masked by a correct result.

---

# Q3 — The greeting

## 3.a How `isFollowUp` is computed, and what it keys on

Computed **entirely in the route**, quoted in full in 1.d. It keys on:

- **`customer_number`** — the customer's number, digits only, no `+` (Meta's `message.from`)
- **`truck_id`**
- **`response_sent IS NOT NULL`** — so an `IGNORE`/gibberish message, which is logged but unreplied,
  does **not** suppress a later greeting the same day
- **most recent row only** (`order created_at desc`, `limit(1)`, `maybeSingle()`)
- **local-date equality in `Europe/London`**, via `localDateOfInstant(prior.created_at, truckTz) === getLocalDateInTz(truckTz)`

✅ **It is FAIL-OPEN:** any error → `isFollowUp = false` → greet. An extra greeting is benign; a
wrongly suppressed one reads as the bot acting mid-conversation.

Inside the shared function the boolean is threaded through exactly two derived values:

```ts
  const greetingPrefix = isFollowUp ? '' : `${GREETING} `
  const greetingInstruction = isFollowUp
    ? 'Do NOT open with a greeting; start directly with the answer.'
    : `Open with exactly: "${GREETING}"`
```

## 3.b ✅ WHAT A SIMULATOR WOULD PASS AS SENDER IDENTITY: **NOTHING. THERE IS NO SUCH PARAMETER.**

🔴 **`generateWhatsAppReply` NEVER RECEIVES THE SENDER'S IDENTITY AT ALL.** `from` appears in the route
three times — the greeting read, the `whatsapp_logs.customer_number` column, and the send recipient —
and **is not among the nine fields of `ClassifierParams`.** The function receives only the pre-computed
boolean.

**So the simulator supplies a boolean, not an identity.** Either hard-code `false` (always greet, which is
what an operator would expect a "first message" preview to show) or expose a toggle so both variants can
be previewed. **Neither requires inventing a phone number.**

## 3.c ✅ CAN A SIMULATOR SUPPRESS A REAL CUSTOMER'S GREETING? **NO — PROVIDED IT ONLY CALLS THE SHARED FUNCTION.**

The reasoning, stated as a chain because the answer depends on every link:

1. Suppression requires a `whatsapp_logs` row with that customer's `customer_number`, that `truck_id`,
   `response_sent` non-null, and a `created_at` on the same London day.
2. **The shared function writes no such row.** It writes nothing at all (1.b).
3. The insert lives only in the two webhook routes (Q4).
4. → **A simulator that calls the shared function and renders the string is incapable of affecting any
   real sender's greeting.** ✅ **The isolation is structural, not a matter of choosing a safe value.**

🔴 **THE ONE WAY TO CREATE THE RISK IS TO ADD LOGGING TO THE SIMULATOR.** If a simulator were built to
also write a `whatsapp_logs` row — for analytics, or "so the operator can see their test in Reports" —
then the `customer_number` it chose would decide the blast radius:

| What the simulator logs as `customer_number` | Effect on a real customer that day |
|---|---|
| nothing (no insert) | ✅ none |
| a synthetic value (`'simulator'`, the operator's own number) | ✅ none, unless a real customer messages from that exact number |
| the truck's own `whatsapp_sender` | ⚠️ none today, but it is the value §20 already records as having made a routing defect look correct |
| a real customer's number | 🔴 **that customer loses their greeting for the rest of the London day** |

⚠️ **AND IT WOULD ALSO POLLUTE REPORTS.** `app/api/manage/route.ts` already aggregates `whatsapp_logs` by
`classification` and `possible_miss` for the Reports tab — **simulator rows would be counted as real
customer interactions.** That is a second, independent reason not to log.

---

# Q4 — Logging

## ✅ THE INSERT IS NOT REACHABLE FROM THE SHARED FUNCTION. NOTHING NEEDS TO BE MADE OPTIONAL.

Every `whatsapp_logs` occurrence in the repository outside `docs/`:

| File | What it is |
|---|---|
| `app/api/webhooks/meta/whatsapp/route.ts` | the greeting **read**, and the **insert** |
| `app/api/webhooks/whatsapp/route.ts` | the dormant Twilio route's **insert** |
| `app/api/manage/route.ts` | a Reports **read** (classification / possible_miss counts) |
| `lib/whatsapp-classifier.ts` | ✅ **two comments and nothing else** |
| `lib/delete-truck.ts` | the table named in a cascade-deletion list |

✅ **THE ANSWER TO THE SECOND HALF OF THE QUESTION IS THAT IT DOES NOT ARISE.** There is no flag to add,
no parameter to thread, no live path to touch, and no decision for you to take. **The seam is already on
the correct side of this line** — the log insert was written into the route, not the function, and that
choice is what makes the simulator cheap.

⚠️ **Recorded as a property to PRESERVE, not merely to observe.** If per-truck sending is ever built and
someone moves logging into the shared function "so every caller logs consistently", **this simulator
becomes a writer to a live table on that day**, silently. The property is worth an explicit comment at the
seam.

---

# Q5 — Cost and abuse surface

## 5.a Gemini calls per reply, by bucket

Every invocation begins with one classification call:

```ts
    const raw = (await callGemini(classifierPrompt, 0.1)).toUpperCase()
```

| Bucket / path | Gemini calls | Why |
|---|---|---|
| `IGNORE` | **1** | classify, then `return { reply: null }` immediately |
| `ALLERGEN_QUERY` | **1** | the redirect is a **fixed string** — deliberately no LLM on the safety path |
| **any bucket tripping the allergen floor** | **1** | `mentionsAllergen(customerMessage)` returns before every branch |
| `MENU_QUERY`, normal | **2** | classify + the tier-3 grounded answerer |
| `MENU_QUERY`, menu query errored / no items | **1** | returns `menuFallback` before the answerer |
| `SPECIFIC_QUERY` | **2** | classify + the schedule reply |

✅ **Floor 1, ceiling 2. Model `gemini-2.5-flash`.** §20 records the cost as negligible; nothing here
contradicts that at operator volumes.

🔴 **BUT ONLY ONE OF THE THREE CALL SITES HAS A TIMEOUT.**

```ts
    const llmReply = await callGemini(menuAnswerPrompt, 0.2, 8000)
```

The classifier call and the `SPECIFIC_QUERY` reply call pass **no `timeoutMs`**, so `callGemini` builds no
`AbortController`:

```ts
  const controller = timeoutMs ? new AbortController() : undefined
```

⚠️ **A hung Gemini call on either of those two sites has nothing to abort it.** On the webhook that is
survivable — Meta retries. **In a browser-facing simulator it is a spinner that never resolves**, and
the operator's conclusion will be "the WhatsApp feature is broken". See 7.a.

## 5.b 🔴 INPUT LENGTH CAP: THERE IS NONE. ANYWHERE.

Searched `lib/whatsapp-classifier.ts` and the webhook route for `slice(0,`, `maxLength`, `MAX_LEN` and
length comparisons. **Zero hits.** `customerMessage` is interpolated raw into up to three prompts:

```ts
Message: "${customerMessage}"
```
```ts
Customer message: "${customerMessage}"
```

**On the live path the cap is Meta's own message limit**, which is why this has never mattered. **A
simulator has no such upstream limit** — an operator can paste an arbitrarily large body straight into a
Gemini prompt. **A cap is a caller-side concern and there is no existing one to inherit.**

⚠️ **AND THE INTERPOLATION IS UNESCAPED, INSIDE QUOTES.** An operator can close the quote and write their
own instructions — classic prompt injection. **On the live path the injector is a member of the public;
in a simulator the injector is the operator, previewing into their own page**, so the stakes are far
lower. **Recorded because it is the same string reaching the same prompt, and because "the operator can
make the preview say anything" is a support question waiting to happen.**

## 5.c 🔴 THE RATE-LIMIT TIER A NEW MANAGE ROUTE INHERITS: **NONE. AND §28 OF THE MANUAL IS STALE ON THIS.**

§28 describes a default-limited model — *"GENERAL — 60/min — everything else"*. **The code does the
opposite.** `proxy.ts` limits a **positive allowlist** and nothing else:

```ts
const isCustomerEvents = (p: string) => p === '/api/events'
const isStrictPublic = (p: string) =>
  p === '/api/discovery' || p.startsWith('/api/discovery/')
const isGeneralPublic = (p: string) =>
  p === '/trucks' || p.startsWith('/trucks/')
```

```ts
  const inLimitedScope = isStrict || isEvents || isGeneralPublic(pathname)
```

```ts
  if (inLimitedScope && !isDev && !isLoopback && !operatorBypass) {
```

The file's own header states it: *"Only the public allowlist (`isStrictPublic` / `isGeneralPublic`) is
ever limited — operator surfaces are structurally excluded, so the default is NOT-limited."*

🔴 **`/api/manage` MATCHES NO PREDICATE. IT IS NOT RATE-LIMITED AT ALL**, and neither would a new sibling
route be. **There are then three further bypasses on top** (dev, loopback, and an authenticated-operator
bypass keyed on a `Bearer` header or an `sb-*-auth-token` cookie) — but they never come into play,
because the path is out of scope before they are consulted.

**So the honest answer to what a new route inherits is: unlimited, by construction.** ⚠️ **A route that
spends money at Google on every call, with no rate limit and no input cap, is a combination worth
deciding about explicitly rather than inheriting.** The existing auth is real — `/api/manage` resolves
the truck from a `dashboard_token` query parameter and 401s without a valid one — so this is not open to
the public; **it is unlimited to anyone holding one operator's dashboard token**, including that operator
holding the button down.

⚠️ **§28 should be corrected.** V11.35's `proxy.ts` block already describes the allowlist correctly, so
§28 is the stale half of two adjacent claims — the exact configuration §1 warns about. **Recorded, not
fixed: this is a read-only task.**

---

# Q6 — Where it can live in the UI

## 6.a ✅ THE NATIVE HIDE WRAPS THE ENTIRE SUBSECTION. CONFIRMED IN CODE.

The wrapper opens immediately after the comment block headed
**`🔴 HIDDEN IN THE NATIVE APP ONLY — NOT REMOVED (14 August 2026)`**:

```tsx
        {!isNativeApp() && (<>
        {/* Auto-replies subsection */}
        <div className="border-t border-slate-100 pt-4 mt-1">
          <p className="text-sm font-bold text-slate-700 mb-0.5">Auto-replies</p>
          <p className="text-xs text-slate-400 mb-3">Requires Business accounts on each platform.</p>

          <div className="space-y-3">
```

and closes after the subsection's outer `</div>`:

```tsx
          </div>
        </div>
        </>)}
      </Card>
```

✅ **Everything is inside: the `border-t` divider `<div>`, the `Auto-replies` heading, the
`Requires Business accounts on each platform.` caption, the `space-y-3` wrapper, and the single WhatsApp
row.** The code's own comment states the reason — the WhatsApp row is the last remaining child after the
Messenger and Instagram rows were removed on 14 August, so hiding the row alone would orphan four things.
**§20's V11.18 record of this is accurate.**

## 6.b The nearest sibling positions OUTSIDE the wrapper

Named by surviving identifiers, as asked — no line numbers:

**Position 1 — immediately BEFORE the wrapper, still inside the same `<Card>`.** The preceding sibling
is the website field, identifiable by its placeholder:

```tsx
            placeholder="https://yourtruck.co.uk"
```

A block placed between that field's closing `</div>` and the `{!isNativeApp() && (<>` line sits in the
Contact Details card, above the hidden subsection, and renders on native and web alike.

**Position 2 — immediately AFTER the wrapper, outside the `<Card>` entirely.** The wrapper's close is
followed by `</Card>` and then the next card, identifiable by its comment and class:

```tsx
      {/* Your schedule */}
      <Card className="p-4 space-y-4">
```

A block placed between `</Card>` and `{/* Your schedule */}` becomes its own card between Contact Details
and Your schedule.

⚠️ **Both positions are outside the native hide, which means a simulator placed there WOULD render in
the iPad build.** Whether that is wanted is a product decision, not a code one — but it is the decision
the placement makes implicitly. **If it must be hidden on native too, it needs its own `isNativeApp()`
wrapper; it cannot inherit one from a position.**

## 6.c Role gating in this tab

| | |
|---|---|
| **The tab itself** | `{ id: 'settings', label: 'Settings', icon: '🔧', roles: ['owner', 'manager'] }` — **staff never reach it**, and `userRole === 'staff'` is redirected to `/dashboard` on mount |
| **`SettingsTab`** | receives `userRole` as a prop |
| **Role-gated blocks inside** | ✅ **exactly one:** `{userRole === 'owner' && <DeleteAccountSection … />}` |
| **The Auto-replies subsection** | 🔴 **NOT role-gated.** It is FEATURE-gated: `can('whatsapp_replies')`, where `can` is `canAccess(truck.plan, feature, truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)` |

✅ **So a new block needs no role gate to match convention** — owner and manager see everything in
Settings except account deletion.

⚠️ **It would need a FEATURE gate to match its neighbour**, and the neighbour shows the disabled-input +
`<FeatureGate … showUpgrade={true} />` pattern when `can('whatsapp_replies')` is false. 🔴 **And note
§20's V11.36 entry: a decision has been taken that `whatsapp_replies` should be a PRO feature, while
`lib/features.ts` still grants it at Max/trial/tester only.** A simulator gated on `can('whatsapp_replies')`
inherits that unresolved gate — **a Pro truck would be shown an upgrade prompt for a feature the pricing
matrix already sells them.** That is not a simulator bug; it is the existing defect surfacing on one more
surface.

---

# Q7 — What would break

✅ **THE SEAM ITSELF IS CLEAN, AND I WILL SAY SO PLAINLY.** One exported async function; nine parameters,
eight of them derivable from a truck row; no database write; no Meta call; the log insert and the send
both outside it; the sender identity not even a parameter. **"Call the same function and render the
string" is an accurate description of what the code permits.** The items below are real but none of them
is an obstacle to that sentence.

**(a) 🔴 TWO OF THE THREE GEMINI CALL SITES HAVE NO TIMEOUT** (5.a). On a webhook that is survivable; in
a browser it is an unbounded spinner. **The caller cannot fix this from outside** — `callGemini`'s
`timeoutMs` is not reachable through `generateWhatsAppReply`'s signature. **Any timeout the simulator
wants must be imposed by the route wrapping the call, or by changing the shared function** — and
changing it touches the live path. **This is the single most likely thing to make the build "careful"
rather than "small".**

**(b) ⚠️ THE `events` QUERY MUST BE REPRODUCED, AND IT IS ALREADY DUPLICATED TWICE** (2.b). Drift here is
silent and looks like a working reply.

**(c) ⚠️ THE FUNCTION REASONS IN UTC WHILE THE ROUTE HAS A TIMEZONE IN HAND** (2.c). The simulator will
faithfully reproduce a real off-by-one between 00:00 and 01:00 BST. **Expect it to be reported as a
simulator bug; it is not.**

**(d) ⚠️ `menuItems` IS A DEAD PARAMETER WHOSE UNUSABILITY IS MASKED** (2.d). Passing it appears to work
because the internal query does the real job.

**(e) ⚠️ `orderUrl` AND `scheduleUrl` ARE THE SAME STRING TODAY.** Both callers build
`` `${hgUrl}/trucks/${truck.slug}/order` `` for both fields, and both collapse to `''` when `truck.slug`
is null. **A truck without a slug gets replies ending "End with the order link: " and a bare sign-off** —
which the simulator would display, correctly, as the live behaviour. It also depends on
`NEXT_PUBLIC_HATCHGRAB_URL` being set in whatever environment the simulator runs in.

**(f) ⚠️ `truck_emoji` COALESCES TO `''`, AND §20's V11.36 ENTRY RECORDS A TRUCK THAT HELD NULL.** The
sign-off then renders as `— Thai Kitchen ` with a trailing space. Already documented; the simulator would
make it visible, which is arguably a feature.

**(g) 🔴 THE SERVICE-ROLE CLIENT MEANS `truckId` IS THE ONLY SCOPING ON THE MENU READ** (1.b). Satisfied
by resolving the truck from `dashboard_token`; **broken by any route that accepts a `truckId` from the
request body.**

**(h) ⚠️ `reply: null` IS A REAL OUTCOME, NOT AN ERROR** (1.a). Rendering it as a blank box or a failure
would misrepresent the live behaviour on exactly the bucket an operator is most curious about.

**(i) ⚠️ NO RATE LIMIT AND NO INPUT CAP ON THE ROUTE IT WOULD LIVE ON** (5.b, 5.c). Both are caller-side
and both are absent today.

**(j) ⚠️ THE FEATURE GATE IT WOULD INHERIT IS ITSELF UNDER AN UNAPPLIED DECISION** (6.c).

**(k) ⚠️ `console.error` FROM THE SHARED FUNCTION LANDS IN THE SIMULATOR'S LOGS**, tagged
`[whatsapp menu query]` and `[WhatsApp classifier] Gemini error:` — strings that read as webhook
failures. **Anyone diagnosing a live WhatsApp problem from logs will now be reading a mixture of real
customer traffic and operator previews, with nothing in the line to tell them apart.** Cheap to solve at
the seam; invisible if nobody thinks of it.

---

# What this report does NOT establish

- **That the simulator's reply would be byte-identical to the live reply for the same input.** It cannot
  be, for the same reason two live messages differ: **Gemini is called at temperature 0.1/0.2/0.4, not 0.**
  **The GUARDS are deterministic and would match exactly** — the allergen floor, the fixed redirect, the
  price validation, the caveat append, the deterministic fallbacks — **but the prose will vary between
  runs.** 🔴 **This is worth telling the operator in the UI**, or the first support ticket will be "it
  gave me a different answer the second time".
  **What would settle the fidelity question properly:** run the same input through the live webhook and
  the simulator and compare **classification and guard outcome**, not the prose.
- **Whether `NEXT_PUBLIC_HATCHGRAB_URL` and `GEMINI_API_KEY` are set in every environment the simulator
  would run in.** Both are present in `.env.local` (names read, values not). ⚠️ **If `GEMINI_API_KEY`
  were absent, `GEMINI_URL` is built at module load as `…?key=undefined`, every call returns an error
  body, `callGemini` yields `''`, and the function degrades to its deterministic fallbacks** — so a
  misconfigured simulator would **look like it works** and quietly never exercise the LLM at all. That is
  a trap worth a preflight.
- **Anything about how the operator's input should be validated, capped or debounced.** No implementation
  is proposed, per the brief.
