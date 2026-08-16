# X-Hub-Signature verification on the three Meta webhooks — ADDED

Scope honoured: **signature verification only.** One new module and three POST handlers. No `next dev`,
no `next build`, no `cap sync`, no deploy, no commit, no database write, no migration, no Meta call.
🔴 **The truck-lookup routing defect is UNTOUCHED**, `phone_number_id` was not added, and the
classifier, the sender and both Messenger/Instagram stubs are unchanged beyond the gate in front of
them.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

The three endpoints are reported **separately**. Every claim is marked **READ** or **INFERRED**.

> ✅ **VERIFIED BY EXECUTION, not by reasoning.** `npx tsc --noEmit` exits 0, **and the helper was
> actually RUN** against nine cases — including a genuine signature, a two-secret list, a SHA-1
> downgrade attempt and the re-serialisation trap. **All nine passed.** Output is quoted at C6.

---

# PART A — THE EXISTING PATTERN AND THE THREE ENDPOINTS

## A1. Stripe's verification — what it hashes, compares, and whether it is timing-safe

**READ** — `lib/stripe/webhook-signature.ts`. ✅ **Its own header names this task:**

```
// The four existing webhook routes (meta/whatsapp, messenger, instagram, twilio-whatsapp)
// authenticate NOTHING on POST — the Meta ones check a shared token on the GET subscription handshake
// only, and act on the POST body unverified. Those routes are out of scope here, but this file is
// deliberately written to be the thing they are eventually fixed against, which is why the verification
// lives in a pure, dependency-free module rather than inline in the route.
```

**What it hashes — READ**, `:139`:

```ts
  const signedPayload = `${timestamp}.${rawBody}`
```

**What it compares, and yes it is timing-safe — READ**, `:94-104` and `:144-150`:

```ts
/** Constant-time hex comparison. Length is compared first and in variable time deliberately: both sides
 *  are fixed-width SHA-256 hex (64 chars), so the length carries no secret, and timingSafeEqual THROWS
 *  on a length mismatch rather than returning false. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}
```

```ts
  let matched = false
  for (const secret of secrets) {
    const expected = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
    for (const candidate of v1) {
      if (safeEqualHex(expected, candidate)) matched = true
    }
  }
  if (!matched) return { ok: false, reason: 'signature_mismatch' }
```

**And the decision this task inherits — READ**, `:128-132`:

```ts
  // 🔴 NO SECRET ⇒ REJECT. NOT "skip verification". Stripe's own quickstart sample is written as
  // `if (endpointSecret) { verify }`, which means a misconfigured deployment silently accepts ANY body
  // from ANYONE. That sample is written for a tutorial; this is a route on the public internet attached
  // to a payment ledger. An unset secret is a broken deployment and must fail closed, loudly.
  if (secrets.length === 0) return { ok: false, reason: 'no_secret_configured' }
```

## A2. The three Meta routes, before

### WhatsApp — `app/api/webhooks/meta/whatsapp/route.ts`

**GET (the handshake) — READ, and UNCHANGED by this task:**

```ts
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  …
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[webhook/meta-whatsapp] verified')
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

**POST, before — READ, the first three lines are the whole problem:**

```ts
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const entry    = body?.entry?.[0]
```

**No signature check of any kind**, and it goes on to look up a truck, call Gemini and send a WhatsApp
message.

### Messenger — `app/api/webhooks/messenger/route.ts`

**GET — READ, UNCHANGED**, identical shape to WhatsApp's. **POST, before:**

```ts
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('[webhook/messenger] incoming:', JSON.stringify(body, null, 2))

    const entry     = body?.entry?.[0]
    const messaging = entry?.messaging?.[0]
    …
    // TODO: Route to classifier
    console.log('[webhook/messenger] message from:', senderId, 'text:', text)

    return NextResponse.json({ ok: true })
```

### Instagram — `app/api/webhooks/instagram/route.ts`

**READ: the same file with `igAccountId = entry?.id` in place of `pageId`.** ⚠️ **Reported separately
as required, and the finding is that they are near-identical — which is exactly why the verification
went into ONE helper rather than three copies.**

## A3. What each does today with an unverified POST, and what it costs

| Endpoint | Unverified POST reaches | Cost per request |
|---|---|---|
| **WhatsApp** | truck lookup → plan gate → `whatsapp_logs` read → **Gemini classification** → **`whatsapp_logs` INSERT** → **`sendMetaWhatsApp`** | 🔴 **A Meta conversation charge AND one or two Google Gemini calls, plus a database write** |
| **Messenger** | parse → `console.log` → `// TODO` → 200 | ⚠️ **Log volume only.** No money, no database. |
| **Instagram** | parse → `console.log` → `// TODO` → 200 | ⚠️ **Log volume only.** No money, no database. |

🔴 **So the money exposure is WhatsApp's alone today — but Messenger and Instagram are stubs that will
grow into the same shape, and adding the gate now costs nothing and means the classifier lands behind
a verified boundary rather than in front of one.**

⚠️ **And a forged WhatsApp POST does not merely cost money — it names the recipient.** The reply goes
to `message.from`, so a caller controls who receives a WhatsApp message from a HatchGrab truck.

## A4. 🔴 How each route read its body — and yes, the refactor was needed

**READ: all three called `await req.json()` as the first statement of the handler.**

🔴 **That is fatal for signature verification, for two independent reasons — and only the second is
widely known:**

1. **The body is a stream and can be read once.** `req.json()` consumes it; a later `req.text()` throws
   *"Body is unusable"*. **There is no way back.**
2. **Even if you could, re-serialising is fatal.** `JSON.stringify(JSON.parse(body))` is a **different
   string** — key order, whitespace, unicode escaping and number formatting all drift — so the HMAC
   differs and **verification fails 100% of the time with a perfectly correct secret.** ⚠️ It presents
   as *"my app secret must be wrong"*, which sends you looking in the wrong place.

**What the refactor involved, per route — and it is the same three lines each time:**

```ts
  let rawBody: string
  try { rawBody = await req.text() } catch (err) { … 400 … }
  …verify…
  const parsed = JSON.parse(rawBody)   // only after verification
```

✅ **The downstream code is then re-pointed from `body` to `parsed` and nothing else changes.**
**READ** — the proof it is a rename and not a rewrite, from the WhatsApp route as committed:

```ts
    const entry    = parsed?.entry?.[0]
    const changes  = entry?.changes?.[0]
    const value    = changes?.value
    const messages = value?.messages
```

⚠️ **And this trap is verified rather than asserted:** the executable test at C6 includes a
**re-serialised body** case, and it fails with `signature_mismatch` exactly as predicted.

---

# PART B — THE SECRET

## B1. What Meta signs with

⚠️ **INFERRED from Meta's documented behaviour — not read from our code, and we have never received a
signed delivery, so this is written against the specification and is unproven against real traffic.**

- Meta signs with the **App Secret** of the Meta app that owns the webhook subscription — **not** the
  verify token, **not** the access token.
- The header is **`X-Hub-Signature-256`**, formatted **`sha256=<hex>`**.
- The signed payload is the **raw request body**, with no timestamp and no prefix.
- ⚠️ **A legacy `X-Hub-Signature` (SHA-1) is also sent.** It is **deliberately ignored** here.

**READ, from the helper as committed:**

```ts
// ⚠️ `X-Hub-Signature` (the older SHA-1 header) IS DELIBERATELY IGNORED. Meta still sends it alongside
// the SHA-256 one for compatibility. Accepting it would let a caller choose the weaker algorithm, which
// is the same downgrade-attack reasoning that makes the Stripe module discard every non-`v1` scheme.
```

🔴 **AND THE DIFFERENCE FROM STRIPE THAT MATTERS MOST: there is no timestamp in Meta's scheme, so there
is NO REPLAY WINDOW to check.** A captured genuine delivery stays valid forever as far as this check is
concerned. ⚠️ **Replay protection, if ever wanted, has to come from idempotency on the message id — not
from this file.** Stated rather than silently omitted.

## B2. Every Meta-related env var the codebase reads

**READ — exhaustive:**

| Variable | Read at | Absent → |
|---|---|---|
| `META_WEBHOOK_VERIFY_TOKEN` | `meta/whatsapp:13`, `messenger:5`, `instagram:5` | the GET handshake compares against `undefined` and fails ⚠️ **loud, at setup time** |
| `META_WHATSAPP_ACCESS_TOKEN` | `lib/meta-whatsapp.ts:11` | `Bearer undefined` → Meta 401 → throw → 🔴 **caught and logged at the call site; the log row already claims a reply was sent** |
| `TWILIO_WHATSAPP_NUMBER` | `lib/twilio.ts:6` | non-null assertion — the legacy path only |
| **`META_APP_SECRET`** | 🔴 **DID NOT EXIST** | — |

**READ** — searching the whole tree for `META_APP_SECRET` before this task returned **one hit, in
`docs/whatsapp-onboarding-report.md`, which is the report saying it was absent.** ⚠️ **It is a NEW
variable and it must be set — see Part F.**

## B3. 🔴 THE ABSENT BEHAVIOUR I CHOSE, AND WHY

> 🔴 **NO SECRET ⇒ REJECT EVERYTHING. Fail closed.**

**READ, as committed:**

```ts
  // 🔴 NO SECRET ⇒ REJECT. NOT "skip verification". An unset secret is a broken deployment, not a
  // permission to accept anything from anyone, and this endpoint spends money on two vendors per
  // request. The same decision the Stripe module makes, for the same reason, and it is the one place
  // this file could have been written to fail open — see the route logs, which name this case first.
  if (secrets.length === 0) return { ok: false, reason: 'no_secret_configured' }
```

**Why, and the counter-argument taken seriously:**

⚠️ **The brief is right that both directions can fail silently, and they fail differently:**

| Choice | Failure mode | Who notices |
|---|---|---|
| **Fail OPEN** (skip when unset) | 🔴 **the endpoint stays permanently unauthenticated and nobody ever finds out** — it works, so it looks fine | **nobody, ever** |
| **Fail CLOSED** (chosen) | ⚠️ every genuine delivery is refused until the variable is set | **Meta**, via retries and eventually a flagged subscription — **and the log below** |

🔴 **The deciding argument is the APNs lesson, applied in the correct direction.** APNs failed *open in
effect*: `apnsConfig()` returned `null`, the send became a no-op, and **the silence was mistaken for
success for three weeks.** ✅ **Fail-closed cannot produce that outcome** — a rejected webhook is a
visible, retried, logged event. **Fail-open reproduces it exactly.**

✅ **And this endpoint is not yet load-bearing:** Gusto is not set up on WhatsApp, so **a fail-closed
deployment refuses nothing that anyone is relying on.**

### The log line, quoted

**READ, as committed** — the shared builder, so all three routes emit the identical shape:

```ts
export function metaRefusalLog(
  surface: 'meta-whatsapp' | 'messenger' | 'instagram',
  reason: MetaSignatureFailureReason,
  secretsConfigured: number,
  hasSignature: boolean,
  bodyBytes: number,
): string {
  return (
    `[webhook/${surface}] REFUSED reason=${reason} ` +
    `secretsConfigured=${secretsConfigured} hasSignature=${hasSignature} bodyBytes=${bodyBytes}`
  )
}
```

**So a missing secret prints, unmistakably:**

```
[webhook/meta-whatsapp] REFUSED reason=no_secret_configured secretsConfigured=0 hasSignature=true bodyBytes=1284
```

🔴 **`reason=no_secret_configured` with `secretsConfigured=0` and `hasSignature=true` is the exact
signature of "Meta is delivering correctly and we forgot the variable" — greppable, and it says which
of the four things went wrong.** ⚠️ **`secretsConfigured` is a COUNT, never the values**, and
`bodyBytes` distinguishes an empty probe from a real payload **without logging a single byte of an
unverified body.**

---

# PART C — THE IMPLEMENTATION

## C5 first — ONE shared helper, because three copies is how they drift

**NEW FILE: `lib/meta/webhook-signature.ts`.** ✅ **Deliberately the same shape as its Stripe sibling** —
pure, dependency-free, a closed union of failure reasons, timing-safe comparison, fail-closed on a
missing secret. **READ, the parts that are not quoted elsewhere:**

```ts
export type MetaSignatureFailureReason =
  | 'no_secret_configured'
  | 'missing_signature_header'
  | 'malformed_signature_header'
  | 'signature_mismatch'

export type MetaSignatureVerification =
  | { ok: true }
  | { ok: false; reason: MetaSignatureFailureReason }
```

```ts
export function parseMetaAppSecrets(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}
```

⚠️ **PLURAL, AND FOR A DIFFERENT REASON THAN STRIPE'S — stated rather than copied.** Stripe needs a list
because one URL receives both live and test events and because a rolled secret stays valid 24 hours.
**Meta does neither.** The reason here is that **the three products need not share a Meta app**:
WhatsApp, Messenger and Instagram can each sit under a different app with a different secret, and a
single-secret implementation would verify one and reject the other two as forged.

## C1 / C2. The verification, and the timing-safe comparison

**READ, as committed:**

```ts
export function verifyMetaSignature(input: {
  rawBody: string
  /** The `X-Hub-Signature-256` header, verbatim. The SHA-1 `X-Hub-Signature` must NOT be passed here. */
  signatureHeader: string | null | undefined
  secrets: string[]
}): MetaSignatureVerification {
  const { rawBody, signatureHeader, secrets } = input

  if (secrets.length === 0) return { ok: false, reason: 'no_secret_configured' }
  if (!signatureHeader) return { ok: false, reason: 'missing_signature_header' }

  // Meta's format is `sha256=<hex>`. Anything else is malformed — including a bare hex string with no
  // prefix, which is refused rather than guessed at.
  const [scheme, offered] = signatureHeader.split('=', 2)
  if (scheme !== 'sha256' || !offered) return { ok: false, reason: 'malformed_signature_header' }

  // Every configured secret is tried, and the loop runs to completion rather than short-circuiting.
  let matched = false
  for (const secret of secrets) {
    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
    if (safeEqualHex(expected, offered)) matched = true
  }
  if (!matched) return { ok: false, reason: 'signature_mismatch' }

  return { ok: true }
}
```

**C2 — the timing-safe comparison, READ, copied from the Stripe module on purpose:**

```ts
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}
```

⚠️ **The length is compared first and in variable time deliberately:** both sides are fixed-width
SHA-256 hex, so the length carries no secret, and **`timingSafeEqual` THROWS on a length mismatch
rather than returning false.**

## C1 — the three POST handlers, each quoted

### WhatsApp — the gate, as committed

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

  // THE GATE. THERE IS NO PATH AROUND THIS AND NO FLAG THAT SKIPS IT.
  // `rawBody` is NOT parsed, NOT inspected and NOT logged before this call — the only thing that happens
  // to an unverified body is that its LENGTH is measured for the refusal log. Deliberately no env-var
  // bypass and no development shortcut: this endpoint spends money at Meta AND at Google per request.
  // The SHA-1 `x-hub-signature` header is NOT read. See the downgrade note in the helper.
  const signatureHeader = req.headers.get('x-hub-signature-256')
  const secrets = parseMetaAppSecrets(process.env.META_APP_SECRET)
  const verification = verifyMetaSignature({ rawBody, signatureHeader, secrets })

  if (!verification.ok) {
    console.error(metaRefusalLog('meta-whatsapp', verification.reason, secrets.length, !!signatureHeader, rawBody.length))
    …
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // VERIFIED. Only now is the body trusted enough to parse.
  try {
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      // Signed by Meta but not JSON. Not reachable in practice; refused rather than assumed.
      console.error('[webhook/meta-whatsapp] verified but body is not JSON')
      return NextResponse.json({ ok: true })
    }
    const parsed = body as any
```

### Messenger — the gate, as committed

**ASCII-only, because that file has never held a non-ASCII byte — see E2:**

```ts
export async function POST(req: NextRequest) {
  // FIRST LINE. Nothing may read the body before this.
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch (err) {
    console.error('[webhook/messenger] REFUSED - could not read request body:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // THE GATE. There is no path around this and no flag that skips it. rawBody is not parsed, not
  // inspected and not logged before this call - only its LENGTH is measured, for the refusal log.
  // The SHA-1 x-hub-signature header is deliberately NOT read; see the downgrade note in the helper.
  const signatureHeader = req.headers.get('x-hub-signature-256')
  const secrets = parseMetaAppSecrets(process.env.META_APP_SECRET)
  const verification = verifyMetaSignature({ rawBody, signatureHeader, secrets })

  if (!verification.ok) {
    console.error(metaRefusalLog('messenger', verification.reason, secrets.length, !!signatureHeader, rawBody.length))
    …
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
```

### Instagram — the gate, as committed

**Byte-identical to Messenger's apart from the surface name** (`'instagram'` in both the log calls and
the refusal builder). ⚠️ **Reported separately as required: they really are the same, and that sameness
is now expressed by both calling one helper rather than by two similar blocks of inline code.**

## C3. The status code on a bad signature — **401**, and why

🔴 **401 Unauthorized. Deliberately NOT 200, and deliberately not the 400 its Stripe sibling uses.**

**The reasoning, and it hinges on who actually reads the response:**

- **A forged request is not from Meta**, so whoever sent it learns only that they were refused. The code
  is almost irrelevant to them, and the body says nothing either way.
- 🔴 **The code is really an instruction to META about GENUINE deliveries.** A `200` on a failed check
  would mean a **misconfigured secret silently swallowed every real message** — the APNs silent-skip
  failure again. **A non-2xx makes Meta retry and eventually flag the subscription, which is loud.**
- **401 over 400** because the condition *is* "unauthenticated", and the log already carries the precise
  reason. ⚠️ **The divergence from Stripe's 400 is deliberate and is the one place this file does not
  copy its sibling:** Stripe's comment justifies 400 as *"the request is not from Stripe, or is not
  parseable"* and its concern is not earning a three-day retry. Both avoid a 2xx, which is the property
  that matters.

⚠️ **THE RISK, STATED PLAINLY: Meta can disable a webhook subscription after sustained failures.** So a
wrong or missing `META_APP_SECRET` will eventually **turn the subscription off** rather than merely
erroring. **That is the cost of failing closed, it is visible, and it is why Part F exists.**

## C4. ✅ The GET handshake is UNCHANGED on all three

**Confirmed from the diff: not one `+` or `-` line touches any `GET` function.** All three still compare
`hub.verify_token` against `META_WEBHOOK_VERIFY_TOKEN` and echo `hub.challenge`. 🔴 **It uses a
different mechanism entirely — a shared token, not an HMAC — and Meta calls it when configuring the
endpoint, so breaking it breaks setup.**

## C6. ✅ A VALID SIGNATURE STILL PASSES — PROVEN BY EXECUTION

**The helper was RUN, not reasoned about.** `node --experimental-strip-types` against the real module:

```
  PASS  VALID signature                      -> ok=true
  PASS  valid, 2nd of 2 secrets              -> ok=true
  PASS  tampered body                        -> ok=false reason=signature_mismatch
  PASS  wrong secret                         -> ok=false reason=signature_mismatch
  PASS  no secret configured                 -> ok=false reason=no_secret_configured
  PASS  missing header                       -> ok=false reason=missing_signature_header
  PASS  sha1 downgrade attempt               -> ok=false reason=malformed_signature_header
  PASS  bare hex, no scheme                  -> ok=false reason=malformed_signature_header
  PASS  RE-SERIALISED body (the trap)        -> ok=false reason=signature_mismatch
  parseMetaAppSecrets("a, b ,,c") -> ["a","b","c"]
  parseMetaAppSecrets(undefined)  -> []
  ALL ASSERTIONS PASSED
```

⚠️ **The test file lives in the scratchpad and is NOT part of the diff** — it was a verification, not a
deliverable.

**The path a genuine Meta POST takes after verification — READ, unchanged from before this task:**

1. `JSON.parse(rawBody)` → `parsed`
2. `parsed.entry[0].changes[0].value.messages[0]` → `from`, `text`, `phoneNumberId`
3. 🔴 **the truck lookup — UNTOUCHED, including its defect**
4. `canAccess(… 'whatsapp_replies' …)` plan gate
5. the `whatsapp_logs` follow-up read → `isFollowUp`
6. the `truck_events` read
7. `generateWhatsAppReply(…)` → `{ reply, classification }`
8. the `whatsapp_logs` insert
9. `sendMetaWhatsApp(from, reply, phoneNumberId)`
10. `NextResponse.json({ ok: true })`

⚠️ **Steps 3 to 10 are byte-identical to before.** The only change is that they now sit behind a gate.

---

# PART D — BOUNDARIES

## D1. `git diff --stat`

```
 app/api/webhooks/instagram/route.ts     |  48 ++-
 app/api/webhooks/messenger/route.ts     |  48 ++-
 app/api/webhooks/meta/whatsapp/route.ts |  59 +++-
 docs/reference-manual.md                | 519 +++++++++++++++++++++++++++++++-
```

plus **`lib/meta/`**, untracked (the new helper).

⚠️ **THE TREE HAS BEEN DIRTY FOR TWO DAYS, so this task's entries are named explicitly:** the three
webhook routes, `lib/meta/webhook-signature.ts`, and this report. **`docs/reference-manual.md` is the
V11.20 update from the previous task.**

**Untouched, counted from the diff by path:**

| Path | Files in the diff |
|---|---|
| `lib/whatsapp-classifier.ts` | **0** |
| `lib/meta-whatsapp.ts` (the sender) | **0** |
| `lib/payments/` | **0** |
| `supabase/migrations/` | **0** |
| `lib/twilio.ts` | **0** |

🔴 **And the truck lookup specifically — READ, still exactly as it was:**

```
app/api/webhooks/meta/whatsapp/route.ts:128:      .or(fromVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
```

✅ **The routing defect is untouched, as instructed. It remains the next task, and it needs a migration.**

## D2. No migration, no column, no type change

✅ **Confirmed.** `supabase/migrations/` is not in the diff; no `ALTER`, no new column, no change to any
database-facing type. **The only new type is `MetaSignatureFailureReason`, which is a TypeScript union
inside the new helper and touches nothing persisted.**

## D3. The Messenger and Instagram stubs still do exactly what they did

✅ **Confirmed by reading the committed files.** After the gate, both still:

```ts
    const entry     = parsed?.entry?.[0]
    const messaging = entry?.messaging?.[0]

    if (!messaging?.message?.text) {
      return NextResponse.json({ ok: true })
    }
    …
    // TODO: Route to classifier
    console.log('[webhook/messenger] message from:', senderId, 'text:', text)

    return NextResponse.json({ ok: true })
```

🔴 **The `// TODO: Route to classifier` is untouched in both.** No truck lookup was added, no classifier
call, no send module. **Acknowledge and log — just with verification in front.**

## D4. What an operator or customer would notice

**Nothing.** 🔴 **Zero operator surfaces and zero customer surfaces are in the diff.** These are
server-to-server endpoints; no page, no email, no push, no database write changes.

⚠️ **The one observable difference is invisible to both and matters only to Meta:** until
`META_APP_SECRET` is set, these endpoints refuse deliveries with 401. **Gusto is not set up on WhatsApp,
so nothing anyone relies on is being refused** — but see Part F, because Meta's own delivery must not
stay broken.

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census, side by side

| File | bytes | classes before → after | Gained | Lost |
|---|---|---|---|---|
| `app/api/webhooks/meta/whatsapp/route.ts` | 6,537 → 10,050 | **2 → 2** | **NONE** | NONE |
| `app/api/webhooks/messenger/route.ts` | 1,497 → 3,892 | **0 → 0** | **NONE** | NONE |
| `app/api/webhooks/instagram/route.ts` | 1,509 → 3,904 | **0 → 0** | **NONE** | NONE |
| `lib/meta/webhook-signature.ts` | — → 7,991 | **new file, 8** | n/a | n/a |

**Every difference explained:**

- **WhatsApp route** — the only delta is **U+2014 EM DASH, 5 → 9 (+4)**. U+2192 RIGHTWARDS ARROW is
  unchanged at 3. **No new class.**
- **Messenger and Instagram** — 🔴 **both were PURE ASCII and still are.** Every comment added to them
  was written ASCII-only, using plain hyphens where the house style would use an em dash.
- **The new helper** — no baseline exists, so its 8 classes are permitted. It uses the house vocabulary
  of its Stripe sibling deliberately.

### 🔴 A CENSUS VIOLATION I MADE AND THE CHECK CAUGHT

**The first draft of the WhatsApp route's comments used the house marker glyphs, and the after-census
reported FOUR new classes on a file whose baseline was two** — a box-drawing rule, a warning sign, a
variation selector and a coloured circle. **I rewrote the block to the file's existing vocabulary and
re-ran the census.** ⚠️ **This is the second consecutive task in which the reflex to reach for the house
glyphs added classes to a file that had never held them**, and the code now says so:

```
// NOTE ON THE COMMENT STYLE IN THIS BLOCK: no coloured markers, deliberately. This file's non-ASCII
// vocabulary was an em dash and a right arrow, and the house marker glyphs would have added four new
// codepoint classes to it. Naming a rule is not a licence to break it.
```

## E3. Carrier-aware variation-selector check

🔴 Carriers read from **what actually precedes each U+FE0F**, never from a Unicode-category filter — a
`category == 'So'` filter silently misses bases such as U+2139 INFORMATION SOURCE (category `Ll`).

| File | U+26A0 (n / paired / bare) | sum(carriers) = total U+FE0F |
|---|---|---|
| `app/api/webhooks/meta/whatsapp/route.ts` | 0 / 0 / 0 | 0 = 0 ✅ |
| `app/api/webhooks/messenger/route.ts` | 0 / 0 / 0 | 0 = 0 ✅ |
| `app/api/webhooks/instagram/route.ts` | 0 / 0 / 0 | 0 = 0 ✅ |
| `lib/meta/webhook-signature.ts` | 4 / 4 / **0** | 4 = 4 ✅ |

✅ **Every warning sign in the new helper is paired; the three routes contain none at all.**

**This report, measured after writing, not predicted:**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+26A0 WARNING SIGN | 32 | 32 | **0** |
| U+1F534 LARGE RED CIRCLE | 31 | 0 | 31 |
| U+2705 WHITE HEAVY CHECK MARK | 20 | 0 | 20 |

**Sum of per-base paired = 32 = total U+FE0F count = 32** — every selector has a named carrier, no
orphan, no double-count, **zero bare warning signs**. The other two bases are
emoji-presentation-by-default and correctly take no selector. ✅ **Only three emoji-presentation bases
appear at all**, because this report quotes source that is largely ASCII by design.

## E4. Byte scan of every edited file — byte-level, never grep

All four scanned for NUL, every control byte below 0x09, the 0x0B/0x0C pair, 0x0E-0x1F and 0x7F.
**Offending: 0 in every file. CRLF: 0. Lone CR: 0.**

## E5. Byte scan of this report

Separate pass after writing: **33,484 bytes scanned, offending = 0** — no NUL, no
control byte below 0x09, no CRLF, no lone CR.

## E6. `git status` and `git diff --stat`

```
 M app/api/webhooks/instagram/route.ts
 M app/api/webhooks/messenger/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M docs/reference-manual.md
?? docs/whatsapp-onboarding-report.md
?? lib/meta/
```

**THIS TASK: the three webhook routes, `lib/meta/webhook-signature.ts`, and this report.**
⚠️ `docs/reference-manual.md` is the previous task's V11.20 update and
`docs/whatsapp-onboarding-report.md` is the task before that. **Nothing staged, branch still `main`.**

---

# PART F — WHAT YOU MUST DO

## 1. Set `META_APP_SECRET` in Vercel

**Name, exactly:** `META_APP_SECRET`

**Where to find the value in Meta's dashboard:**
⚠️ **INFERRED — the console changes, so read the screen rather than this description** (§35, P15):

1. **developers.facebook.com** → **My Apps** → the app that owns the webhook subscription.
2. **App settings → Basic.**
3. **App Secret** → **Show** (it will ask for your password).
4. Copy the value.

**Set it for the environments the webhook runs in — Production at minimum.**

⚠️ **If WhatsApp, Messenger and Instagram sit under DIFFERENT Meta apps**, set it to a
**comma-separated list** of all their app secrets: `secret_one,secret_two`. **The helper tries every
one**, and `parseMetaAppSecrets` trims whitespace and drops empties — verified in the C6 run.

🔴 **A redeploy is required.** Vercel injects environment variables at build/runtime; setting the
variable without redeploying leaves the running deployment refusing everything with
`reason=no_secret_configured`.

## 2. Confirm verification works WITHOUT waiting for a real customer message

**Three checks, in increasing strength. None needs a customer.**

### Check A — the negative case, from your own machine (10 seconds)

```bash
curl -i -X POST https://www.hatchgrab.com/api/webhooks/meta/whatsapp \
  -H 'Content-Type: application/json' \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"447700900000","type":"text","text":{"body":"hi"}}],"metadata":{"phone_number_id":"x"}}}]}]}'
```

- ✅ **PASS: `HTTP/1.1 401` and `{"error":"Invalid signature"}`.** Before this change the same request
  would have returned `200` **and could have sent a WhatsApp message.**
- 🔴 **FAIL: a 200.** The gate is not in the deployed build.
- **The log should read** `reason=missing_signature_header`.

### Check B — the positive case, self-signed (proves the secret is right)

```bash
SECRET='<the value you pasted into Vercel>'
BODY='{"entry":[{"changes":[{"value":{"messages":[]}}]}]}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"
curl -i -X POST https://www.hatchgrab.com/api/webhooks/meta/whatsapp \
  -H 'Content-Type: application/json' -H "X-Hub-Signature-256: $SIG" -d "$BODY"
```

- ✅ **PASS: `HTTP/1.1 200` and `{"ok":true}`.** ⚠️ **That body has no `messages`, so it is
  acknowledged and ignored** — **it verifies the signature path without touching Meta, Gemini or the
  database.**
- 🔴 **FAIL: 401 with `reason=signature_mismatch`** → the secret in Vercel differs from `$SECRET`.
- 🔴 **FAIL: 401 with `reason=no_secret_configured`** → the variable is not set **in the environment
  that served this request**, or you have not redeployed.
- ⚠️ **`printf '%s'`, not `echo`** — `echo` appends a newline, which changes the body and therefore the
  HMAC. **That is the re-serialisation trap in miniature.**

### Check C — Meta's own delivery

In the app's **WhatsApp → Configuration → Webhook** panel, use **Test** on the `messages` field.

- ✅ **PASS: Meta reports a 200**, and the log shows no `REFUSED` line.
- 🔴 **FAIL: Meta reports a non-2xx** → read the `REFUSED reason=` line; it names which of the four
  checks tripped.

⚠️ **Repeat Check A against `/api/webhooks/messenger` and `/api/webhooks/instagram`** — same expected
401. **They are separate endpoints and a per-app secret could be right for one and wrong for another.**

⚠️ **And confirm the GET handshake still works** by re-verifying the callback URL in Meta's console.
✅ **It was not changed, but it is the one thing that breaks setup rather than traffic, so it is worth
one click.**

🔴 **FINALLY, AND IT IS NOT PART OF THIS TASK: even with verification working, a real customer message
still will not produce a reply** — the truck lookup matches the customer's number against
`trucks.whatsapp_sender`. **Check B passing means the gate works, not that WhatsApp works.**
