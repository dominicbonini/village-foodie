# The `Invalid signature` 400 — two destinations, one secret, and a receipt log that was never the writer

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE THREE THINGS THAT MATTER

1. ✅ **THE COMMA-SEPARATED PAIR IS THE SHAPE THE CODE ALREADY EXPECTS.** `parseSigningSecrets` splits on `,`, trims, drops empties; the verifier then loops **every secret × every offered `v1`**. Adding the second secret does **not** make things worse — a single-secret value was always going to reject one of your two destinations as forged.

2. 🔴 **NOTHING ABOUT VERIFICATION CHANGED TODAY. NOT ONE LINE.** A diff of the route from `4f0f2c5` to `HEAD` produces **zero** added or removed lines touching `req.text`, `rawBody`, `STRIPE_WEBHOOK_SECRET`, `parseSigningSecrets`, `verifyStripeSignature`, `signatureHeader` or `Invalid signature`. `lib/stripe/webhook-signature.ts` has not been touched since `b7f3213` (7 August). **All 15 of your HMAC vectors still test exactly the code that is running.**

3. 🔴 **THE 10 AUGUST DISCREPANCY IS NOT A BROKEN RECEIPT INSERT — IT IS A ROW THE WEBHOOK NEVER WROTE.** `lib/payments/online.ts` **did not exist in any commit until today**, and the route had **zero** occurrences of `payment_intent.succeeded` at `4f0f2c5`. `created_by: 'stripe_webhook'` is a **hardcoded string constant inside `online.ts`**, not evidence of provenance — anything that calls `recordOnlineCardPayment` stamps it.

---

## 1. `lib/stripe/webhook-envelope.ts` IN FULL

**Source: QUOTED.** All 163 lines, unmodified.

```ts
// ── STRIPE WEBHOOK ENVELOPE EXTRACTION ──────────────────────────────────────────────────────────────
// Pulling the few scalar fields /api/webhooks/stripe records out of an event envelope, for BOTH event
// formats that arrive at that one URL.
//
// ── 🔴 WHY THIS MODULE EXISTS: TWO COLUMNS WERE BEING SILENTLY DROPPED ──────────────────────────────
// A probe on 10 August 2026 captured real v2 thin events and ran the route's own field logic against
// them. Two columns came back NULL on every single thin event, with no error and a 200 response:
//   stripe_created_at — because `created` is a NUMBER on v1 and an ISO-8601 STRING on v2, and the
//                       guard was `typeof created === 'number'`. A string simply failed the test.
//   connected_account — because `account` is a TOP-LEVEL field on v1 Connect events and DOES NOT EXIST
//                       on thin events, where the account is `related_object.id`.
// This is the silent-empty-board family: the data arrived, was discarded, and nothing anywhere said so.
// 🔴 connected_account is the one that matters — it is how a row is attributed to a truck, and it was
// null on exactly the events that are about a connected account.
//
// ── 🔴 WHY EACH EXTRACTOR RETURNS A `source`, NOT JUST A VALUE ──────────────────────────────────────
// A NULL that means "this event genuinely has no connected account" and a NULL that means "we failed to
// read one" must not be the same NULL. The route cannot tell them apart from the value alone, so it is
// not asked to: every extractor returns a CLOSED UNION saying which shape it matched, and the route logs
// it. `not_applicable` is normal; `unreadable` is a defect and is logged at error level.
// The closed-union-of-stable-slugs idiom is deliberately the same one SignatureFailureReason uses in
// lib/stripe/webhook-signature.ts — these strings are read in logs at 7pm and must be greppable.
//
// ⚠️ PURE. No I/O, no clock, no throw. Every failure is a return value, so both extractors can be — and
// are — exercised directly against captured payloads.

/** A thin event (v2) states its own format. v1 snapshot events carry `object: "event"`. */
export function isThinEvent(event: { object?: unknown }): boolean {
  return event.object === 'v2.core.event'
}

// ── created ─────────────────────────────────────────────────────────────────────────────────────────

export type CreatedSource =
  /** v1 snapshot: unix SECONDS as a number. e.g. 1786323355 */
  | 'v1_unix_seconds'
  /** v2 thin: an ISO-8601 string. e.g. "2026-08-10T16:24:41.328027017Z" */
  | 'v2_iso_string'
  /** No `created` field at all. Not reachable for a real Stripe event of either format. */
  | 'absent'
  /** Present but neither shape, or not a real date. 🔴 A DROP — logged loudly by the route. */
  | 'unreadable'

export interface CreatedExtraction {
  /** Ready for a timestamptz column, or null. */
  value: string | null
  source: CreatedSource
}

/**
 * Read an event's creation time from either format.
 *
 * 🔴 THE TWO SHAPES ARE DETECTED AND HANDLED SEPARATELY — neither is coerced into the other's
 * assumption. That is the whole defect being fixed: the old code applied v1's `* 1000` arithmetic as the
 * ONLY path, so a v2 string fell off the end. `Number(created)` would have been the tempting one-line
 * "fix" and it is wrong twice over: it turns the ISO string into NaN, and it would silently accept a
 * numeric string that neither format ever sends.
 *
 * ⚠️ THE v2 STRING IS PASSED THROUGH VERBATIM, NOT ROUND-TRIPPED THROUGH `Date`. Stripe sends
 * NANOSECOND precision ("…41.328027017Z") and JavaScript's Date holds only milliseconds, so
 * `new Date(s).toISOString()` would quietly truncate it to "…41.328Z". Postgres timestamptz stores
 * microseconds, so passing the original string keeps three digits that a round-trip would throw away.
 * `Date.parse` is still used — but only to VALIDATE, never to reformat.
 */
export function extractStripeCreatedAt(created: unknown): CreatedExtraction {
  if (created === undefined || created === null) return { value: null, source: 'absent' }

  // v1 — unix seconds. Finite guard because a NaN or Infinity would become "Invalid Date" and poison
  // the delivery-delay figure this column exists to give.
  if (typeof created === 'number') {
    if (!Number.isFinite(created)) return { value: null, source: 'unreadable' }
    return { value: new Date(created * 1000).toISOString(), source: 'v1_unix_seconds' }
  }

  // v2 — ISO-8601. Validate only; emit the original bytes.
  if (typeof created === 'string') {
    if (Number.isNaN(Date.parse(created))) return { value: null, source: 'unreadable' }
    return { value: created, source: 'v2_iso_string' }
  }

  return { value: null, source: 'unreadable' }
}

// ── connected account ───────────────────────────────────────────────────────────────────────────────

export type AccountSource =
  /** v1 Connect: the top-level `account` field Stripe sets on connected-account events. */
  | 'v1_envelope_account'
  /** v2 thin event ABOUT an account: `related_object.id`, with `related_object.type` proving it. */
  | 'v2_related_object'
  /** v2 thin event FROM an account: the `context` field. ⚠️ Inferred from docs, not probe-proven. */
  | 'v2_context'
  /** No connected account, correctly. A platform-scoped v1 event, or a thin event about a non-account. */
  | 'not_applicable'
  /** The event claims an account and we could not read it. 🔴 A DROP — logged loudly by the route. */
  | 'unreadable'

export interface AccountExtraction {
  /** An `acct_...` id, or null. */
  value: string | null
  source: AccountSource
}

/** The `related_object.type` a thin event uses when the related object IS the connected account. */
const V2_ACCOUNT_TYPE = 'v2.core.account'

/**
 * Find which connected account an event belongs to, in either format.
 *
 * ── 🔴 WHERE THE ACCOUNT ID ACTUALLY LIVES, ESTABLISHED FROM CAPTURED PAYLOADS ────────────────────
 * v1 Connect event — a top-level `account`, per Stripe: "Each event for a connected account contains a
 * top-level `account` property that identifies the connected account."
 *
 * v2 thin event — NO top-level `account` field exists. The captured
 * `v2.core.account[configuration.merchant].capability_status_updated` body was, in full:
 *   {"id":"evt_test_65VCJxaUR4…","object":"v2.core.event",
 *    "type":"v2.core.account[configuration.merchant].capability_status_updated",
 *    "livemode":false,"created":"2026-08-10T16:24:41.328027017Z",
 *    "related_object":{"id":"acct_1U2vgMGhodqxYjqN","type":"v2.core.account",
 *                      "url":"/v2/core/accounts/acct_1U2vgMGhodqxYjqN?include=configuration.merchant"}}
 * 🔴 SO IT IS PRESENT, in `related_object.id` — the column was never unfillable, it was unfilled.
 *
 * ⚠️ `related_object.type` IS CHECKED, NOT ASSUMED. A thin event's related object is whatever the event
 * is about — a meter, a payment — and its `id` is then NOT an account. Taking `related_object.id`
 * unconditionally would file a `mtr_…` under connected_account, which is worse than the NULL it
 * replaced: a wrong attribution reads as a real one.
 *
 * ⚠️ THE `context` ARM IS DOCS-DERIVED AND NOT PROBE-PROVEN. Every event captured on 10 August was
 * ABOUT an account, so the second arm never fired and none carried a `context` at all. Stripe documents
 * `context` as identifying which account an event came from, which is the shape a thin event about a
 * PAYMENT on a connected account would use. It is guarded on the `acct_` prefix so it cannot contribute
 * an organisation context string or anything else that is not an account id. If a future probe shows
 * `context` carries something else, this arm is the one to change — the two above it are proven.
 */
export function extractConnectedAccount(event: {
  account?: unknown
  related_object?: unknown
  context?: unknown
}): AccountExtraction {
  // 1. v1 Connect. Unchanged behaviour, and deliberately first: v1 events still arrive at this URL.
  if (typeof event.account === 'string' && event.account) {
    return { value: event.account, source: 'v1_envelope_account' }
  }

  // 2. v2 thin event about an account.
  const related = event.related_object
  if (related !== null && typeof related === 'object') {
    const { id, type } = related as { id?: unknown; type?: unknown }
    if (type === V2_ACCOUNT_TYPE) {
      if (typeof id === 'string' && id) return { value: id, source: 'v2_related_object' }
      // It says it is about an account and will not say which. That is a drop, not an absence.
      return { value: null, source: 'unreadable' }
    }
  }

  // 3. v2 thin event from an account. See the caveat above.
  if (typeof event.context === 'string' && event.context.startsWith('acct_')) {
    return { value: event.context, source: 'v2_context' }
  }

  return { value: null, source: 'not_applicable' }
}
```

🔴 **THIS MODULE IS NOT ON THE FAILURE PATH.** It is imported at `route.ts:40` and first **called** at `route.ts:150` — **32 lines after** the `Invalid signature` return at line 118. It is pure, it never throws, and its worst output is a `null` the route logs and records anyway.

---

## 2. 🔴 THE DECISIVE QUESTION — does the code split on commas?

**Source: QUOTED. ✅ YES. IT SPLITS ON COMMAS AND TRIES EVERY SECRET.**

### The read — `app/api/webhooks/stripe/route.ts:89`

```ts
  const secrets = parseSigningSecrets(process.env.STRIPE_WEBHOOK_SECRET)
```

**Read exactly once, at module-call time inside `POST`. There is no other reference to `STRIPE_WEBHOOK_SECRET` anywhere in the repository** (an exhaustive grep across `app/`, `lib/`, `components/` returns this one line).

### The split — `lib/stripe/webhook-signature.ts:68-71`

```ts
export function parseSigningSecrets(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}
```

| Behaviour | Result |
|---|---|
| `whsec_A` | `['whsec_A']` |
| `whsec_A,whsec_B` | `['whsec_A', 'whsec_B']` |
| `whsec_A, whsec_B` (space after comma) | ✅ `['whsec_A', 'whsec_B']` — **`.trim()` handles it** |
| `whsec_A,,whsec_B` or a trailing comma | ✅ empties dropped by `.filter(Boolean)` |
| unset / `''` | `[]` → fails closed as `no_secret_configured` |

### The loop — `lib/stripe/webhook-signature.ts:139-150`

```ts
  const signedPayload = `${timestamp}.${rawBody}`

  // Try every configured secret against every offered v1. Both loops are small (1–2 secrets, 1–2
  // signatures) and both run to completion rather than short-circuiting on the first mismatch.
  let matched = false
  for (const secret of secrets) {
    const expected = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
    for (const candidate of v1) {
      if (safeEqualHex(expected, candidate)) matched = true
    }
  }
  if (!matched) return { ok: false, reason: 'signature_mismatch' }
```

✅ **Every secret × every offered `v1`. Both loops run to completion.** `matched` is set, never returned early, so ordering within the list is irrelevant.

### 🔴 THE MODULE DOCUMENTS YOUR EXACT SITUATION — `:55-64`, QUOTED

```
 * 🔴 PLURAL, AND THAT IS NOT OVER-ENGINEERING — IT IS REQUIRED BY TWO SEPARATE STRIPE BEHAVIOURS:
 *
 *   1. ONE URL, TWO MODES. A production Connect webhook URL receives BOTH live and test events (Stripe:
 *      "your production webhook URLs receive both live and test webhooks"). Registering the same URL in
 *      test mode and in live mode produces TWO endpoint objects with TWO DIFFERENT signing secrets —
 *      "if you use the same endpoint for both test and live API keys, the secret is different for each
 *      one". A single-secret implementation would verify one mode and reject the other as forged.
 *   2. SECRET ROLLING. When a secret is rolled, Stripe keeps the previous one active for up to 24 hours
 *      and "generates one signature for each secret". Accepting a list is what makes a roll a
 *      zero-downtime config change instead of a cutover.
 *
 * Comma-separated, whitespace tolerated, empties dropped. Order is irrelevant — every secret is tried.
```

⚠️ **The comment reasons about test-vs-live rather than platform-vs-connected**, but the mechanism is identical: **two Stripe destination objects means two signing secrets**, and one configured value can only ever verify one of them.

**And the route already recorded that this URL has more than one registration — `route.ts:226-227`:**

```ts
  // ⚠️ `format` and the two `…Source` slugs are on every line deliberately. One URL now receives both
  // event formats (see §6.3 of the Connect report — three registrations point at it), so "which shape
```

### ✅ Verdict: adding the comma makes things BETTER, not worse

**QUOTED for the mechanism; INFERRED for the consequence:** with one secret configured and two destinations delivering, events from the unconfigured destination reach `signature_mismatch` and are refused 400 — while events from the configured one succeed. **That is a per-destination failure, not a global one**, and it matches an endpoint that worked over the CLI and refuses one class of production delivery.

⚠️ **`secretsConfigured=N` is printed on every refusal** (`route.ts:114`), so the deployed count is already in your logs. **Not established:** what the value actually is in Vercel now — I did not read the deployed environment, and `.env.local` is not what production uses.

---

## 3. How the raw body is read

**Source: QUOTED.** `route.ts:77-86`:

```ts
  // 🔴 FIRST LINE. See the raw-body note in the header. Nothing may read the body before this.
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch (err) {
    // A body that cannot even be read as text is not a Stripe delivery. Nothing to verify, nothing to
    // record, and no useful retry.
    console.error('[webhook/stripe] REFUSED — could not read request body:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
```

| Question | Answer | Evidence |
|---|---|---|
| **Stream read exactly once?** | ✅ **YES** | `req.text()` appears **once** in the file; `req.json()` appears **zero** times |
| **Parse then re-stringify?** | ✅ **NO** | `JSON.parse(rawBody)` at line 124 produces `event`, used only for field reads. `JSON.stringify` appears **once**, at line 167, inside a **log line** on one scalar |
| **Read twice?** | ✅ **NO** | one call, wrapped so a throw becomes a 400 rather than an unhandled rejection |
| **Parsed object passed where raw bytes are required?** | ✅ **NO** | see below |

**The verifier receives the original string, and the HMAC is computed over it — `webhook-signature.ts:139`:**

```ts
  const signedPayload = `${timestamp}.${rawBody}`
```

**`rawBody` is passed to `verifyStripeSignature` at `route.ts:99` BEFORE `JSON.parse` at line 124.** The parsed `event` object is never passed to anything that verifies.

✅ **The re-serialisation hazard the file's own header warns about at length (lines 8-22) is NOT present.** This is not the cause of the 400.

---

## 4. Every path that returns `Invalid signature`

**Source: QUOTED. EXACTLY ONE.** A grep for `Invalid signature` across the repository returns a single line.

### `route.ts:99-119`

```ts
  const verification = verifyStripeSignature({ rawBody, signatureHeader, secrets })

  if (!verification.ok) {
    // 🔴 THE LOG IS THE 7PM-FRIDAY ARTEFACT, so it names the CAUSE rather than saying "unauthorised",
    // and it carries the three things that distinguish the realistic failures from each other:
    //   no_secret_configured        → STRIPE_WEBHOOK_SECRET is missing in this environment.
    //   missing_signature_header    → something that is not Stripe is POSTing here (a scanner, a probe).
    //   signature_mismatch          → wrong secret for this endpoint, OR the secret for the OTHER mode
    //                                 is the only one configured, OR a genuine forgery.
    //   timestamp_outside_tolerance → a real Stripe signature that is stale (heavily delayed retry, or
    //                                 a replay of a captured request), or this server's clock has drifted.
    // secretsConfigured is a COUNT, never the values. bodyBytes distinguishes an empty probe from a
    // real payload without logging a single byte of an unverified body.
    console.error(
      `[webhook/stripe] REFUSED reason=${verification.reason} ` +
      `secretsConfigured=${secrets.length} hasSignature=${!!signatureHeader} bodyBytes=${rawBody.length}`,
    )
    // ⚠️ The response says nothing. The reason is for our logs, not for whoever sent this — a caller
    // probing the endpoint must not learn whether a secret is configured or which check it tripped.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }
```

### Every distinct condition that reaches it — six, all QUOTED from `webhook-signature.ts`

| # | `reason=` | Condition | Line |
|---|---|---|---|
| 1 | `no_secret_configured` | `secrets.length === 0` — the env var is unset, empty, or all-commas | `:132` |
| 2 | `missing_signature_header` | no `stripe-signature` header on the request | `:133` |
| 3 | `malformed_signature_header` | the header carries no **integer** `t=` element | `:136` |
| 4 | `no_v1_signature` | no `v1=` element. ⚠️ **every other scheme, notably `v0`, is discarded** by design (`:29-30`, `:89`) | `:137` |
| 5 | 🔴 **`signature_mismatch`** | **no configured secret produces an HMAC matching any offered `v1`** | `:150` |
| 6 | `timestamp_outside_tolerance` | `\|now − t\| > 300` seconds. ⚠️ **Only reachable AFTER a signature has already matched** — the check is deliberately second (`:152-157`) | `:159` |

🔴 **Your observed body is `{"error":"Invalid signature"}`, which rules out the other three 400s in the file** — lines 85, 128 and 142 all return `{"error":"Bad request"}`. **So the failure is one of these six and nothing else.**

⚠️ **INFERRED, from the six above plus your evidence:** #2, #3 and #4 are not what Stripe sends; #6 requires a match first. That leaves **#1** (env var missing at the time of the 14:58 delivery) and **#5** (the delivering destination's secret was not among those configured). **Both are consistent with "one secret held, two destinations delivering."** `secretsConfigured=` in the log distinguishes them in one character.

---

## 5. The previous version — what survived

**Source: QUOTED.** Prior sha `4f0f2c5` ("online payments", 10 Aug 16:28). Current `HEAD` = `e018dc2`.

### 🔴 ALL OF IT SURVIVED. THE VERIFICATION PATH IS BYTE-IDENTICAL.

```
$ git diff 4f0f2c5 HEAD -- app/api/webhooks/stripe/route.ts \
    | grep -E "^[-+].*(req\.text|parseSigningSecrets|verifyStripeSignature|rawBody|STRIPE_WEBHOOK_SECRET|signatureHeader|Invalid signature)"

🔴 ZERO ADDED/REMOVED LINES TOUCH VERIFICATION
```

```
$ git diff 4f0f2c5 HEAD -- lib/stripe/webhook-signature.ts
(empty — unchanged)

$ git log --oneline -- lib/stripe/webhook-signature.ts
b7f3213 stripe building          ← 7 August. Not touched since.
```

**The prior route's block, from `git show 4f0f2c5:app/api/webhooks/stripe/route.ts` — compare it to §3 and §4 above, line for line:**

```ts
export async function POST(req: NextRequest) {
  // 🔴 FIRST LINE. See the raw-body note in the header. Nothing may read the body before this.
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch (err) {
    console.error('[webhook/stripe] REFUSED — could not read request body:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const signatureHeader = req.headers.get('stripe-signature')
  const secrets = parseSigningSecrets(process.env.STRIPE_WEBHOOK_SECRET)

  const verification = verifyStripeSignature({ rawBody, signatureHeader, secrets })

  if (!verification.ok) {
    console.error(
      `[webhook/stripe] REFUSED reason=${verification.reason} ` +
      `secretsConfigured=${secrets.length} hasSignature=${!!signatureHeader} bodyBytes=${rawBody.length}`,
    )
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: StripeEventEnvelope
  try {
    event = JSON.parse(rawBody) as StripeEventEnvelope
  } catch {
    console.error('[webhook/stripe] REFUSED reason=signed_but_unparseable')
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
```

| Aspect | `4f0f2c5` | `HEAD` | Changed? |
|---|---|---|---|
| **Body reading** | `await req.text()` once, first statement, try/catch → 400 | identical | 🔴 **NO** |
| **Secret handling** | `parseSigningSecrets(process.env.STRIPE_WEBHOOK_SECRET)` | identical | 🔴 **NO** |
| **Signature verification** | `verifyStripeSignature({ rawBody, signatureHeader, secrets })`, `!ok` → 400 | identical | 🔴 **NO** |
| **`webhook-signature.ts` itself** | unchanged since `b7f3213` | unchanged | 🔴 **NO** |

### ✅ YOUR 15 HMAC VECTORS STILL COVER 100% OF THE VERIFICATION CODE IN PRODUCTION.

### What DID change today

**(a) Two inline expressions replaced by the envelope module** — both ran, and still run, at ~line 150, **after** the last 400:

```diff
-  const connectedAccount = typeof event.account === 'string' ? event.account : null
-  const stripeCreatedAt =
-    typeof event.created === 'number' && Number.isFinite(event.created)
-      ? new Date(event.created * 1000).toISOString()
-      : null
+  const account = extractConnectedAccount(event)
+  const created = extractStripeCreatedAt(event.created)
+  const connectedAccount = account.value
+  const stripeCreatedAt = created.value
```

**(b) Three optional envelope fields:** `object`, `related_object`, `context` — all `?: unknown`, none validated, none able to reject.

**(c) A whole new `payment_intent.succeeded` branch** (from line 327). **It contains no 400.**

**(d) `markHandled` and richer logging** — all after the insert.

🔴 **EVERY LINE ADDED TODAY RUNS AFTER THE LAST 400.** The commit could not have introduced this refusal.

⚠️ **`e018dc2` "rebuild for webhook secret" (15:26) has an EMPTY file list** — an empty commit to force a rebuild. It changed no code.

---

## 6. Where the insert sits — and how 10 August produced a ledger row with no receipt

### Where the insert sits

**Source: QUOTED.**

```
  line  80  rawBody = await req.text()
  line  89  const secrets = parseSigningSecrets(process.env.STRIPE_WEBHOOK_SECRET)
  line  99  const verification = verifyStripeSignature({ … })
  line 118  return … { error: 'Invalid signature' }, { status: 400 }     ← REFUSAL
  line 124  event = JSON.parse(rawBody)
  line 142  return … { error: 'Bad request' }, { status: 400 }           ← last possible 400
  line 179  await supabase.from('stripe_webhook_events').insert({ … })   ← THE INSERT
  line 252  if (eventType === 'account.updated') { …
  line 327  if (eventType === 'payment_intent.succeeded') { …            ← THE LEDGER WRITE
```

```ts
  const { error: insertErr } = await supabase.from('stripe_webhook_events').insert({
    stripe_event_id: eventId,
    type: eventType,
    livemode,
    connected_account: connectedAccount,
    api_version: apiVersion,
    stripe_created_at: stripeCreatedAt,
  })
```

✅ **The insert is 61 lines AFTER the `Invalid signature` return and 148 lines BEFORE the ledger write.** A 400 writes nothing — which is why today's delivery left no row, and the route says so itself (`:27-28`): *"Nothing is recorded."*

🔴 **AND WITH TODAY'S CODE, THE ORDER IS UNBREAKABLE.** After a `23505` it returns 200 at line 206; after any other insert error it returns **500 at line 215**. **Both return before line 327.** So under `HEAD`, an `order_payments` row from this route **implies** a `stripe_webhook_events` row.

### 🔴 So how did 10 August produce one without the other?

**Source: QUOTED — and the answer is that the webhook was not the writer.**

**FACT 1 — `lib/payments/online.ts` did not exist in any commit before today:**

```
$ git cat-file -e 4f0f2c5:lib/payments/online.ts
fatal: path 'lib/payments/online.ts' exists on disk, but not in '4f0f2c5'
```
It appears as a **new file, +90 lines**, in today's `6fd4b97`.

**FACT 2 — the route had no payment handler at `4f0f2c5`:**

```
$ git show 4f0f2c5:app/api/webhooks/stripe/route.ts | grep -c "payment_intent.succeeded"
0
```

**FACT 3 — `created_by: 'stripe_webhook'` is a HARDCODED CONSTANT, not provenance.** `lib/payments/online.ts:87`:

```ts
    createdBy: 'stripe_webhook',
```

A repo-wide grep for `stripe_webhook` outside `stripe_webhook_events` returns **this one line**. 🔴 **Anything that calls `recordOnlineCardPayment` stamps that string** — the value proves which function ran, **not** which HTTP route, and not that any HTTP request occurred at all.

**FACT 4 — the file's own header requires it to be run against live rows before deploying.** `lib/payments/online.ts:24-25`:

```ts
// ⚠️ THIS FILE IS lib/payments. THE MONEY-PATH INVARIANT APPLIES: exercised against real rows before
// deploying, never merely typechecked.
```

### The two readings, and which the evidence supports

⚠️ **Both are INFERRED. I am not able to inspect code that was never committed.**

| Reading | Support |
|---|---|
| 🔴 **(A) `recordOnlineCardPayment` was invoked directly — a bring-up exercise against the real database, not an HTTP delivery.** It writes `order_payments` and touches `stripe_webhook_events` **not at all**, so the absence of a receipt row is expected rather than a failure. | ✅ **Strongest.** Explains the discrepancy completely, requires no broken insert, and is exactly what FACT 4 mandates. Consistent with FACTS 1-3: the route could not have done it. |
| **(B) An uncommitted working-tree build ran locally over Stripe CLI forwarding against this same Supabase project, with the handler ordered before the insert, or the insert failing.** | ⚠️ **Possible but unsupported.** It requires the 10 August working tree to differ structurally from what was committed six hours later, and **that code is not in git.** |

🔴 **UNDER EITHER READING, THE RECEIPT INSERT IS NOT SHOWN TO BE BROKEN.** The 7 August rows prove it worked; the current code path is quoted above and is ordered correctly; and reading (A) explains the gap without any insert having been attempted.

⚠️ **What WOULD have shown a broken insert is absent:** a failed insert returns **500**, not 200, and logs `PERSIST FAILED` (`:211-215`). **Not established** whether any such log exists — that needs the 10 August logs.

**Not established:** which of (A) or (B) actually happened. The `order_payments` row's `created_at`, `external_ref` and `idempotency_key` (`stripe_pi:pi_…`) would narrow it against Stripe's own delivery record for that PaymentIntent, and I did not read the database.

---

## 7. Does anything write `handled` / `handled_at` / `handler_result`?

**Source: QUOTED. ✅ YES — `markHandled`, added in TODAY'S commit.**

`route.ts:418-433`:

```ts
/**
 * Record that a handler ran, and what it decided.
 * ⚠️ BEST-EFFORT AND DELIBERATELY SO. This is a diagnostic, not the work — failing to mark an event
 * handled must never turn a successful update into a 500 that makes Stripe redeliver it.
 * ⚠️ `handled_at` / `handler_result` arrive with supabase/migrations/20260810_stripe_webhook_events_
 * account_updated.sql. Before that migration this write fails harmlessly and logs; the money-gate update
 * above has already committed either way.
 */
async function markHandled(eventId: string | null, result: string) {
  if (!eventId) return
  const { error } = await supabase
    .from('stripe_webhook_events')
    .update({ handled: true, handled_at: new Date().toISOString(), handler_result: result })
    .eq('stripe_event_id', eventId)
  if (error) console.error(`[webhook/stripe] could not mark ${eventId} handled (${result}):`, error.message)
}
```

**All three columns in one `update`. Nine call sites, every one AFTER the insert:**

| Line | `handler_result` |
|---|---|
| 258 | `ignored:livemode` (`account.updated`) |
| 275 | `incomplete_payload` |
| 300 | `no_operator` |
| 308 | `charges_enabled:true` / `:false` |
| 333 | `ignored:livemode` (`payment_intent.succeeded`) |
| 350 | `not_ours` |
| 358 | `incomplete_payload` |
| 378 | `unknown_order` |
| 396 | `online_payment:{status}` |

### Why your four rows are still `false` / `null` — and it is not a defect

**INFERRED from three quoted facts:**

1. `markHandled` **did not exist at `4f0f2c5`** — it appears wholly as `+` lines in today's diff.
2. `handled_at` and `handler_result` arrive in `supabase/migrations/20260810_stripe_webhook_events_account_updated.sql`, whose own header says: *"the four existing rows must be untouched — no backfill… expect a single row: `false | null | null | 4`"*.
3. Your four rows are from **7 August** — before both.

✅ **The migration PREDICTED exactly the state you are seeing, and it is the intended one.**

⚠️ **Three further points, each QUOTED:**

- 🔴 **`markHandled` swallows its own error.** A failure logs and returns; the 200 still goes out. **So `handled = false` can never prove a handler did not run** — only that the mark did not stick.
- 🔴 **It is UNREACHABLE for today's delivery.** Every call site is after line 179; the 400 returns at line 118. **A refused event has no row to mark.**
- ⚠️ **The two `500` returns do NOT call it** (`:293`, `:406`). Correct — the work did not complete, so nothing should claim it did.

---

## 8. Does the route read or require `connected_account`?

**Source: QUOTED. It is READ AND STORED, but REQUIRED BY NOTHING.**

Every occurrence in the route — an exhaustive grep for `connectedAccount`:

| Line | Use | Load-bearing? |
|---|---|---|
| 152 | `const connectedAccount = account.value` | assignment |
| 193 | `connected_account: connectedAccount,` — into the insert | **stored only** |
| 204 | interpolated into the DUPLICATE log | log |
| 232 | interpolated into the RECEIVED log | log |
| 265 | `const accountId = connectedAccount ?? (typeof dataObject?.id === 'string' ? dataObject.id : null)` | 🔴 **the ONLY functional read — and only inside `account.updated`** |

🔴 **THE `payment_intent.succeeded` BRANCH NEVER READS IT.** It resolves the truck from the order row instead — `route.ts:362-369`:

```ts
    // 🔴 THE ORDER ROW IS THE AUTHORITY FOR truck_id, not the metadata. Metadata is ours and therefore
    // trustworthy, but the ledger's truck_id drives per-truck money rollups — so it is read from the
    // row that owns it. This also proves the order still exists before writing money against it.
    const { data: order } = await supabase
      .from('orders')
      .select('order_key, truck_id')
      .eq('order_key', orderKey)
      .maybeSingle()
```

✅ **So a NULL `connected_account` cannot block a payment from being recorded.** It is a receipt-log field, not a gate.

**And the column is nullable — `20260807_stripe_webhook_events.sql:102`:**

```sql
  connected_account text,
```

⚠️ Contrast `livemode` at `:99`: `boolean not null`. **`connected_account` has no NOT NULL and no default**, so a null cannot fail the insert.

### Would a direct charge on a connected account populate it?

⚠️ **INFERRED, not probe-proven for this event type.**

`payment_intent.succeeded` for a direct charge is a **v1 snapshot** event delivered on the connected-account scope. Per the Stripe documentation quoted inside the envelope module (`webhook-envelope.ts:111-112`):

> *"Each event for a connected account contains a top-level `account` property that identifies the connected account."*

**Arm 1 of `extractConnectedAccount` handles exactly that:**

```ts
  if (typeof event.account === 'string' && event.account) {
    return { value: event.account, source: 'v1_envelope_account' }
  }
```

✅ **So it SHOULD populate, with `source: 'v1_envelope_account'`** — and the RECEIVED log line prints that slug (`:232`), so the first successful delivery will state it outright.

🔴 **BUT THIS IS UNPROVEN HERE.** The 10 August probe captured only **v2 thin events about accounts**; no `payment_intent.succeeded` has ever reached this code in production, and none was captured. **Not established** by observation — only by Stripe's documentation and the code path that implements it.

⚠️ **If it turns out to arrive as a v2 thin event instead**, arm 2 requires `related_object.type === 'v2.core.account'` — which a payment's related object would not be — and arm 3's `context` path is itself flagged in the module as *"docs-derived and not probe-proven"*. **In that case `connected_account` would land `not_applicable` (null).** ✅ **Still harmless**: nothing requires it, and the payment branch reads the truck from the order row regardless.

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — all 163 lines |
| 2 | **QUOTED** — the read, the split, the loop, and the module's own rationale. The two-destination consequence is **INFERRED** |
| 3 | **QUOTED** — the read plus **exhaustive negative searches** for `req.json` and `JSON.stringify` |
| 4 | **QUOTED** — the single site and all six reasons. The narrowing to #1/#5 is **INFERRED** |
| 5 | **QUOTED** — the git diffs, the git log, and the prior file verbatim |
| 6 | **QUOTED** for the ordering, the insert, and FACTS 1-4. Readings (A) and (B) are **INFERRED** and labelled |
| 7 | **QUOTED** — `markHandled`, its nine call sites, and the migration's own prediction |
| 8 | **QUOTED** — every `connectedAccount` use and the column definition. The direct-charge population is **INFERRED** from documentation |

## Not established

- **Which of the six `reason=` slugs fired at 14:58.** It is in the production log at `route.ts:112`, alongside `secretsConfigured=` and `hasSignature=`. **This single line settles §2 and §4 outright** and is the one fact I cannot read from the repository.
- **What `STRIPE_WEBHOOK_SECRET` now holds in Vercel**, or how many values it splits into. I did not read the deployed environment.
- **Which of the two destinations delivered the 14:58 event**, and whether its secret is among those configured.
- **Whether the 10 August `order_payments` row came from a direct call or an uncommitted local build** — reading (A) is better supported, but the row's `created_at` and `external_ref` against Stripe's delivery record for that PaymentIntent would decide it, and I read no data.
- **Whether any `PERSIST FAILED` log exists from 10 August** — that would be the only evidence of an actually-broken receipt insert.
- **Whether `payment_intent.succeeded` arrives here as a v1 snapshot or a v2 thin event.** No such event has ever been successfully processed by this code.
