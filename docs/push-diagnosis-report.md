# Push notifications do not arrive — read-only diagnosis

**READ-ONLY. Nothing was edited, created or deleted except this report.** No commit, no build, no
`next dev`, no `next build`, no `cap sync`, no deploy, no SQL, no database write.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# Q1 — WHERE THE SEND ORIGINATES

# 🔴 THE SEND IS NOT `pg_net`. IT IS A NEXT.JS API ROUTE. `net._http_response` WOULD NOT RECORD IT AT ALL.

**Stated in those words, because the whole diagnosis turns on it: the send does not go through
`pg_net`, so the empty `net._http_response` result is NOISE, not evidence.** It tells you the cron
jobs ran. It says nothing whatsoever about push.

## Every APNs send path in the repository — there is exactly one

**EXECUTED — `sendOrderPendingPush` has ONE non-test caller:**

```
app/api/orders/submit/route.ts:1308   const res = await sendOrderPendingPush(iosTokens, …)
```

| Candidate mechanism | Present? | Evidence |
|---|---|---|
| **Next.js API route** | ✅ **YES — the only one** | `app/api/orders/submit/route.ts` → `lib/apns.ts` |
| Postgres trigger using `pg_net` | 🔴 **NO** | ✅ **EXECUTED — `grep -rn "pg_net\|net.http_post"` across every `.sql` and `.ts` returns NOTHING.** `pg_net` is not used anywhere in this repository |
| Supabase Edge Function | 🔴 **NO** | two functions exist — `auto-event-scheduler`, `heartbeat-monitor` — and ✅ **EXECUTED: a scan of `supabase/functions/` for `apns`/`push`/`APNS` returns nothing** |
| Cron job | 🔴 **NO** | the only cron traffic is those two functions |
| Database trigger of any kind | 🔴 **NO** | ✅ **EXECUTED — the only trigger migration touching `orders` is `20260703_orders_updated_at_trigger.sql`, which sets `updated_at` and nothing else** |

## The dispatch call, quoted

**READ — `lib/apns.ts`, the transport. This is a direct HTTP/2 connection from the Node process:**

```ts
  const client = http2.connect(cfg.host)
```
```ts
      const req = client.request({
        ':method': 'POST', ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`, 'apns-topic': cfg.bundleId, 'apns-push-type': 'alert',
      })
```

🔴 **`node:http2` opens a socket from the Vercel serverless function straight to Apple. Postgres is not
involved at any point, so `net._http_response` is structurally incapable of holding a row for it.**

⚠️ **AND THE ROUTE IS ON THE NODE RUNTIME, WHICH IT MUST BE** — ✅ **EXECUTED: the submit route
declares no `export const runtime`, so it takes Next.js's Node default.** `node:http2` does not exist
on the Edge runtime; had the route been Edge, the import itself would fail.

## ⚠️ ONE THING THE "DISPATCH IS NOT A RESULT" RULE DOES **NOT** BITE HERE

**READ — the push block is `await`ed INSIDE the request, before the response is returned:**

```tsx
                const res = await sendOrderPendingPush(iosTokens, { orderKey: …, orderNumber: orderId, truckName: truck.name })
```

**and the `return NextResponse.json({ success: true, … })` comes AFTER the whole block.** ✅ **So the
function cannot be frozen mid-send by returning early — the serverless-freeze failure mode does not
apply.** ⚠️ **The code comment above it says *"fire-and-forget"*, which describes the intent
(non-blocking on failure) rather than the control flow; the call is genuinely awaited.**

# 🔴 CONSEQUENCE: THE `net._http_response` EVIDENCE IS DISCARDED, AND THE DIAGNOSIS MOVES TO THE VERCEL FUNCTION LOG FOR `/api/orders/submit`.

---

# Q2 — WHAT TRIGGERS IT

**It is a CODE BRANCH in the request handler, not a database trigger. READ, the exact condition:**

```tsx
    if (!autoAccepted) {
```

**`autoAccepted` is computed once, earlier in the same request — READ:**

```tsx
    let autoAccepted = false
```
```tsx
          if (
            truck.auto_accept && allItemsAutoAccept && !anyForcesPending
            && !((truck as any).notes_require_review !== false && orderHasNotes)
          ) {
            autoAccepted = true
          }
```

**and the status is derived from the same variable — READ:**

```tsx
      const status = autoAccepted ? 'confirmed' : 'pending'
```

| Question | Answer |
|---|---|
| Fires on INSERT of an order? | **No — it fires inside the SUBMIT HANDLER**, after the save, in the same request |
| On a status transition? | 🔴 **NO. Nothing watches transitions.** An order that becomes `pending` by any other route — a later edit, an admin action, a replayed offline op — sends NOTHING |
| On `pending` specifically? | **Effectively yes**, but via `!autoAccepted`, which is the same variable that produced `status = 'pending'` |
| **Does an order landing `pending` on an `auto_accept`-false truck satisfy it?** | ✅ **YES.** `truck.auto_accept` false ⇒ the `&&` chain fails ⇒ `autoAccepted` stays false ⇒ `!autoAccepted` is true ⇒ **the push block runs** |
| The observed case — a note requiring confirmation | ✅ **ALSO SATISFIES IT.** `orderHasNotes` with `notes_require_review !== false` forces `autoAccepted` false. **This is the `notes_require_review` arm, and it reaches the push block identically** |

✅ **`pg_get_triggerdef` is not needed: there is no database trigger to confirm.** The one trigger on
`orders` is quoted in Q1 and sets `updated_at`.

⚠️ **THE OBSERVED ORDERS REACHED `pending`, WHICH YOU CONFIRMED BY QUERY — so the branch condition was
satisfied. The failure is inside the block, not at its gate.**

---

# Q3 — THE VAN RESOLUTION, QUOTED

**Step 1 — event → van. READ:**

```tsx
        const eid = eventRow?.id ?? null
        let vanId: string | null = null
        if (eid) {
          const { data: evVan } = await supabase.from('truck_events').select('van_id').eq('id', eid).single()
          vanId = (evVan?.van_id as string | null) ?? null
        }
        if (vanId) {
```

**Step 2 — the van-level master toggle. READ:**

```tsx
          const { data: pref } = await supabase
            .from('van_notification_prefs').select('enabled').eq('van_id', vanId).eq('type', 'order_pending').maybeSingle()
          if (!pref || pref.enabled) {
```

⚠️ **DEFAULT-ON: no row means enabled.** A row with `enabled = false` silently stops everything below,
and 🔴 **nothing logs that it did.**

**Step 3 — van → devices. READ, and this is the query that decides who gets it:**

```tsx
            const { data: devices } = await supabase
              .from('van_devices').select('device_id, push_token, platform').eq('van_id', vanId).eq('notify_enabled', true).not('push_token', 'is', null)
```

**Step 4 — platform routing. READ:**

```tsx
            const iosTokens = allDevices.filter(d => d.platform === 'ios' || d.platform == null).map(d => d.push_token as string).filter(Boolean)
```

## MULTIPLE MATCHING ROWS → **ALL OF THEM**, CONCURRENTLY

**READ — `lib/apns.ts`, the fan-out:**

```ts
    await Promise.all(tokens.map(token => new Promise<void>(resolve => {
```

✅ **Every token gets its own HTTP/2 request on one shared connection. There is no `.limit(1)`, no
`order by last_seen`, and no de-duplication.** **Two tokened rows on this van ⇒ two sends.**

## 🔴 NULL TOKENS — FILTERED OUT, TWICE. THEY DO **NOT** ABORT THE BATCH.

| Guard | Where |
|---|---|
| `.not('push_token', 'is', null)` | the Postgres query — **null rows never reach the process** |
| `.filter(Boolean)` | after the `.map`, catching an empty string too |

# ✅ THE ELEVEN NULL-TOKEN ROWS ON THIS VAN ARE EXCLUDED AT THE DATABASE AND CANNOT AFFECT THE SEND.

⚠️ **They are not inert as EVIDENCE, though — see Q6 and Q7. A null `push_token` is also what this code
WRITES when APNs rejects a token, so a null row is ambiguous between "never registered" and
"registered, then destroyed by a failed send".**

---

# Q4 — THE APNs CALL

## The JWT (ES256) — READ, in full

```ts
function providerToken(cfg: ApnsConfig): string {
  const header = { alg: 'ES256', kid: cfg.keyId }
  const payload = { iss: cfg.teamId, iat: Math.floor(Date.now() / 1000) }
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const signingInput = `${b64(header)}.${b64(payload)}`
  const sig = crypto.sign('SHA256', Buffer.from(signingInput), { key: cfg.key, dsaEncoding: 'ieee-p1363' })
  return `${signingInput}.${sig.toString('base64url')}`
}
```

## The headers and payload — READ

| Field | Value | Source |
|---|---|---|
| `apns-topic` | `cfg.bundleId` | `process.env.APNS_BUNDLE_ID` |
| `apns-push-type` | `'alert'` | **hardcoded** |
| **`apns-priority`** | 🔴 **NOT SET AT ALL** | absent from the request object |
| `apns-expiration` | 🔴 **NOT SET** | absent |
| `:path` | `/3/device/${token}` | per token |
| `authorization` | `bearer ${jwt}` | one JWT per batch |

```ts
  const body = JSON.stringify({
    aps: { alert: { title: 'New order to confirm', body: `Order ${payload.orderNumber} — ${payload.truckName}` }, sound: 'default', 'content-available': 1 },
    type: 'order_pending', orderKey: payload.orderKey,   // custom keys → tap deep-link
  })
```

⚠️ **`apns-push-type: alert` carrying `'content-available': 1` is an unusual pairing** — Apple pairs
`content-available` with `apns-push-type: background`. **INFERRED: not the cause of a total
non-delivery**, since the `alert` dictionary is present and well-formed; recorded because it is the
kind of thing that changes delivery behaviour subtly.

## 🔴 THE ENVIRONMENT HOST — CHOSEN BY ONE VARIABLE, AND SANDBOX IS THE DEFAULT

**READ — `lib/apns.ts`:**

```ts
  const host = process.env.APNS_ENV === 'production'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com'
```

🔴 **STRICT EQUALITY AGAINST THE EXACT STRING `production`. Anything else — unset, empty, `Production`,
`prod`, a trailing space — selects SANDBOX.**

## Can the code distinguish which environment a token came from? **NO.**

# 🔴 NOTHING RECORDS THE ENVIRONMENT A STORED TOKEN CAME FROM, AND THE SCHEMA HAS NOWHERE TO PUT IT.

**READ — the entire column list the bind endpoint writes:**

```tsx
  const patch: Record<string, unknown> = { truck_id: truck.id, device_id, last_seen: new Date().toISOString() }
  if (van_id !== undefined) patch.van_id = van_id
  if (default_screen !== undefined) patch.default_screen = default_screen
  if (notify_enabled !== undefined) patch.notify_enabled = !!notify_enabled
  if (push_token !== undefined) patch.push_token = push_token
  if (platform !== undefined) patch.platform = platform
```

✅ **CONFIRMED: `van_devices` has `platform` but NO environment column.** ⚠️ **`platform` answers
"Apple or Google", not "sandbox or production" — those are orthogonal, and only the first is stored.**

**WHAT IT IMPLIES, stated plainly:**

1. 🔴 **A sandbox token and a production token are INDISTINGUISHABLE in the database.** Both are
   64-hex-character strings. **Your query showing `length 64` confirms shape, not environment.**
2. 🔴 **The server cannot route per-token.** There is ONE `APNS_ENV` for the whole deployment, so a
   fleet mixing a Debug iPad and a TestFlight iPad **cannot both work**, by construction.
3. ⚠️ **A mismatch is not visibly an error — it is `BadDeviceToken`, which this code treats as a dead
   device and NULLs.** See Q6.

## Which environment the device registered against — READ, both entitlements files

```xml
	<!-- DEBUG ONLY. Builds run from Xcode onto a device register with the APNs SANDBOX and receive a
	     SANDBOX device token. The server must then send via api.sandbox.push.apple.com, i.e. APNS_ENV
	     must NOT be 'production' (lib/apns.ts picks the host from that one variable). -->
	<key>aps-environment</key>
	<string>development</string>
```
```xml
	<!-- RELEASE ONLY — TestFlight AND the App Store. …
	     🔴 THIS IS THE FILE THAT PREVENTS THE CLASSIC SILENT FAILURE: a TestFlight build carrying
	     'development' obtains a SANDBOX token, which api.push.apple.com rejects with BadDeviceToken.
	     Nothing crashes and nothing is logged on the device — the notification simply never arrives … -->
	<key>aps-environment</key>
	<string>production</string>
```

✅ **THE Debug/Release MAPPING IS CORRECT — I checked the block boundaries rather than the grep order,
and the naive reading is wrong.** EXECUTED, `project.pbxproj`:

```
306: 			isa = XCBuildConfiguration;
310: 				CODE_SIGN_ENTITLEMENTS = App/App.entitlements;      ← development
328: 			name = Debug;                                            ← …belongs to Debug ✅
331: 			isa = XCBuildConfiguration;
334: 				CODE_SIGN_ENTITLEMENTS = App/AppRelease.entitlements; ← production
351: 			name = Release;                                          ← …belongs to Release ✅
```

⚠️ **`name = X;` closes an `XCBuildConfiguration` block, so a line-ordered grep reads the pairing
BACKWARDS. It is correct. I nearly filed the opposite.**

# 🔴 SO THE ENVIRONMENT QUESTION REDUCES TO TWO FACTS, AND ONLY ONE IS READABLE HERE

| Fact | Status |
|---|---|
| Which configuration produced the iPad build (Debug from Xcode ⇒ sandbox token; TestFlight/Release ⇒ production token) | ⚠️ **CANNOT BE DETERMINED READ-ONLY.** Nothing in the repository records which build is installed |
| What `APNS_ENV` is set to **in Vercel** | ⚠️ **CANNOT BE DETERMINED READ-ONLY.** See Q5 |

---

# Q5 — EVERY ENVIRONMENT VARIABLE ON THE SEND PATH

**READ — the complete configuration read, `lib/apns.ts`:**

```ts
function apnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const bundleId = process.env.APNS_BUNDLE_ID
  // .p8 contents (PEM). Support literal newlines or \n-escaped env storage.
  const key = process.env.APNS_KEY?.replace(/\\n/g, '\n')
  if (!keyId || !teamId || !bundleId || !key) return null
```

| Variable | Required | If missing or empty | Where set |
|---|---|---|---|
| `APNS_KEY_ID` | ✅ | 🔴 `apnsConfig()` → `null` ⇒ **entire push skipped** | Vercel env |
| `APNS_TEAM_ID` | ✅ | 🔴 same | Vercel env |
| `APNS_BUNDLE_ID` | ✅ | 🔴 same | Vercel env |
| `APNS_KEY` (.p8 PEM) | ✅ | 🔴 same | Vercel env |
| `APNS_ENV` | ✗ | ⚠️ **not required — absence silently selects SANDBOX** | Vercel env |

🔴 **AN EMPTY STRING COUNTS AS ABSENT** (`!keyId` is true for `''`), **and ANY ONE missing disables push
entirely.**

## 🔴 DOES A MISSING VARIABLE THROW, LOG, OR FAIL SILENTLY? — IT LOGS ONCE, AT `warn`, AND RETURNS SUCCESS-SHAPED.

**READ — the branch, in full:**

```ts
  const cfg = apnsConfig()
  if (!cfg) { console.warn('[apns] not configured — skipping push (safe no-op)'); return { sent: 0, invalidTokens: [], skipped: 'not-configured' } }
```

⚠️ **IT DOES NOT THROW.** It returns a normal result object. The call site reads only
`res.invalidTokens` — which is empty — so **the caller cannot tell a skip from a successful send**, and
nothing downstream branches on `skipped`.

# 🔴 THIS IS THE `EMAIL_FROM_ADDRESS` SHAPE EXACTLY: the operation completes, the request returns `success: true`, the order is saved and shown in-app, and the only trace is one `console.warn` in a serverless log nobody is watching.

## What is readable about the deployed values — and what is not

⚠️ **CANNOT BE DETERMINED READ-ONLY what Vercel has set.** Nothing in the repository can tell you.

⚠️ **`.env.local` IS PRESENT AND IS THE LOCAL DEV ENVIRONMENT ONLY — it is not what production reads.**
Its values are recorded here as context, not as evidence about the deployment:

```
APNS_KEY_ID    present, length 10
APNS_TEAM_ID   present, length 10
APNS_BUNDLE_ID present, length 17
APNS_KEY       present, length 27      🔴 A REAL .p8 PEM IS ~230+ CHARACTERS
APNS_ENV       present, value 'sandbox'
```

🔴 **THE LOCAL `APNS_KEY` IS TRUNCATED, AND THE MANUAL ALREADY RECORDS WHY — READ, §11:**

```
⚠️ **`.env.local` truncates `FCM_SERVICE_ACCOUNT_JSON` to a single `{`** because the JSON is
pretty-printed across 14 lines and dotenv stops at the first newline. **Local testing needs it on one
line; Vercel is unaffected.** The same file truncates `APNS_KEY` to 27 characters for the same reason.
```

⚠️ **So locally, `apnsConfig()` returns a NON-NULL cfg carrying a 27-character "key" — it passes the
truthiness guard and then fails at signing.** **That matters because of where the signing happens —
see Q6.** ✅ **It is a LOCAL-ONLY artefact and says nothing about Vercel.**

---

# Q6 — ERROR HANDLING

## 🔴 THE HEADLINE: A SUCCESSFUL SEND IS RECORDED NOWHERE. THERE IS NO TABLE AND NO LOG LINE TO CHECK.

**READ — the sender counts successes:**

```ts
      req.on('end', () => {
        if (status === 200) sent++
```

**and returns them:**

```ts
  return { sent, invalidTokens }
```

**and the call site — READ — DISCARDS the count:**

```tsx
                const res = await sendOrderPendingPush(iosTokens, { orderKey: …, orderNumber: orderId, truckName: truck.name })
                invalidTokens.push(...res.invalidTokens)
```

✅ **EXECUTED — `res.sent` and `.sent` appear NOWHERE in the submit route.** 🔴 **`sent` is computed,
returned, and thrown away. There is no success log, no counter, no audit row, no table.**

## Every catch and every swallowed error on the path

```ts
      req.on('error', () => resolve())
```
🔴 **A per-request transport error is swallowed with an empty arrow — no log, no counter, nothing.**

```ts
  } catch (e) { console.warn('[apns] send failed:', (e as Error).message) }
  finally { try { client.close() } catch {} }
```

```tsx
              } catch (iosErr) { console.error('APNs push failed (non-fatal, Android unaffected):', iosErr) }
```

```tsx
      } catch (pushErr) {
        console.error('Order-pending push failed (non-fatal, order saved):', pushErr)
      }
```

## 🔴 WHAT A LOG READER WOULD SEE, PER APNs RESPONSE

**READ — the ONLY inspection of a non-200 response:**

```ts
        else { try { const r = JSON.parse(data || '{}'); if (r.reason === 'BadDeviceToken' || r.reason === 'Unregistered') invalidTokens.push(token) } catch {} }
```

| APNs response | What the code does | What a log reader sees | What the operator sees |
|---|---|---|---|
| **200** | `sent++`, then discarded | 🔴 **NOTHING** | nothing |
| **400 `BadDeviceToken`** | 🔴 **NULLs `push_token` for that row** | 🔴 **NOTHING — no log line exists for this** | nothing |
| **403 `ExpiredProviderToken`** | 🔴 **NOTHING AT ALL.** Not in the list, so not collected; `sent` is not incremented | 🔴 **NOTHING** | nothing |
| **410 `Unregistered`** | 🔴 **NULLs `push_token`** | 🔴 **NOTHING** | nothing |
| any other 4xx/5xx | nothing | 🔴 **NOTHING** | nothing |
| transport error | `resolve()` | 🔴 **NOTHING** | nothing |

# 🔴 STATED PLAINLY: EVERY APNs FAILURE IS SWALLOWED. NOT ONE REJECTION REASON IS LOGGED, INCLUDING THE TWO THAT DESTROY DATA.

**READ — the destruction, at the call site:**

```tsx
            if (invalidTokens.length) {
              await supabase.from('van_devices').update({ push_token: null }).in('push_token', invalidTokens)
            }
```

🔴 **A `BadDeviceToken` — which is exactly what an environment mismatch returns — causes the token to be
NULLed. "Never registered" and "registered, then erased by a failed send" become indistinguishable.**
⚠️ **The eleven null-token rows on this van are consistent with either, and nothing in the data
separates them.**

## ⚠️ ONE PLACE THE SENDER CAN THROW, DESPITE ITS DOCBLOCK

**READ — the docblock claims otherwise:**

```ts
 * BadDeviceToken/Unregistered so the caller can clean them (stale-device handling). Never throws.
```

**READ — but two statements sit OUTSIDE the `try`:**

```ts
  const jwt = providerToken(cfg)
```
```ts
  const client = http2.connect(cfg.host)
  const invalidTokens: string[] = []
  let sent = 0
  try {
```

🔴 **`crypto.sign` on a malformed PEM throws, and it throws BEFORE the try block.** ⚠️ **INFERRED, not
executed: I did not run it.** **The throw is caught one level up by `catch (iosErr)`, which DOES log —
so a malformed `APNS_KEY` is the one configuration failure that produces a visible Vercel error line**,
`APNs push failed (non-fatal, Android unaffected): …`.

⚠️ **Also INFERRED: `http2.connect` has no `client.on('error', …)` handler.** A session-level error
(DNS, TLS, refused connection) emitted asynchronously has no listener.

## 🔴 WHERE TO LOOK, NAMED

**There is no table.** The only record of any of this is the **Vercel function log for
`/api/orders/submit`**, and only these four strings can ever appear in it:

```
[apns] not configured — skipping push (safe no-op)
[apns] send failed: <message>
APNs push failed (non-fatal, Android unaffected): <error>
Order-pending push failed (non-fatal, order saved): <error>
[push] N device(s) have a push_token but an unroutable platform (…)
```

⚠️ **AND THE ABSENCE OF ALL FIVE IS ITSELF INFORMATIVE: it means the block ran, found tokens, and APNs
answered something non-200 that is not `BadDeviceToken`/`Unregistered` — or answered 200 and the
notification died after Apple accepted it.**

---

# Q7 — THE DUPLICATE DEVICE ROWS

## `device_id` is a localStorage UUID — READ

```ts
export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = (crypto?.randomUUID?.() ?? `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}
```

## The upsert keys on that value alone — READ

```tsx
  const { data, error } = await supabaseAdmin
    .from('van_devices').upsert(patch, { onConflict: 'device_id' }).select('*').single()
```

# 🔴 YES — ONE PHYSICAL iPAD CAN PRODUCE MANY ROWS, AND THE MECHANISM IS ORDINARY.

**The identity is WKWebView localStorage, not hardware.** Anything that clears it mints a new
`device_id` on the next load and the upsert inserts a NEW row rather than updating the old one:

| Event | New row? |
|---|---|
| **Deleting and reinstalling the app** | ✅ **yes** — and the prior push-registration checklist makes this step one, noting *"it also wipes the local `device_id`, so a new `van_devices` row will appear — expected"* |
| WebKit evicting website data under storage pressure | ✅ yes |
| A different build/bundle installed over it | ✅ likely — INFERRED |
| An ordinary cold kill | ✗ no — localStorage survives that |

⚠️ **TWO TOKENED ROWS THREE SECONDS APART CANNOT BE EXPLAINED BY localStorage CLEARING** — nothing
clears it in three seconds. **CANNOT BE DETERMINED READ-ONLY what produced them.** ⚠️ **What the code
does show is that `saveDeviceConfig` is called from the `registration` listener, and
`registerForPush` is called from three sites; the file's own comment records that the listeners were
being stacked before a guard was added:**

```ts
// from THREE sites in components/native/OperatorDeviceConfig.tsx (:43 already-configured, :49 single-van
// auto-bind, :69 card save) and runSetup can re-run (the Retry button, or a remount), so without this the
// listeners would stack a duplicate set on every call.
```

⚠️ **INFERRED: two rows three seconds apart is the shape of two DIFFERENT `device_id` values writing
almost simultaneously — two WebView contexts, or one context either side of a storage clear. Not
determinable from here.**

## 🔴 CAN A STALE ROW SHADOW A LIVE ONE? — **NO.**

**The lookup has no `.limit(1)`, no ordering and no de-duplication** — it selects every matching row
and Q3 shows all of them are sent to. ✅ **A stale row ADDS a send; it cannot suppress one.**

⚠️ **The one way a stale row DOES cause harm is the reverse of shadowing: if a stale token returns
`BadDeviceToken`, the cleanup runs `.in('push_token', invalidTokens)` — which matches ON TOKEN VALUE,
not on `device_id`. Any OTHER row holding the same token value is NULLed too.** **INFERRED from the
statement's shape; not executed.**

---

# Q8 — THE ONE CHEAPEST CHECK

**The candidates this diagnosis leaves standing, in the order the evidence supports them:**

| # | Candidate | Distinguishing symptom |
|---|---|---|
| **1** | 🔴 **`APNS_*` incomplete in Vercel ⇒ silent skip** | `[apns] not configured` in the log; **both tokens still present afterwards** |
| **2** | 🔴 **`APNS_ENV` / build-environment mismatch ⇒ `BadDeviceToken`** | **no log line at all**, and 🔴 **both `push_token`s become NULL** |
| **3** | `APNS_KEY` malformed in Vercel ⇒ signing throws | `APNs push failed (non-fatal…)` in the log; tokens survive |
| **4** | APNs accepted it (200) and delivery failed after Apple | no log; tokens survive; nothing distinguishes it server-side |
| **5** | `van_notification_prefs.enabled = false` for this van | no log; **the block never reaches the sender**; tokens survive |

# 🔴 THE ONE CHECK: READ THE VERCEL FUNCTION LOG FOR `/api/orders/submit` FOR THE TWO TEST ORDERS.

**It separates 1, 2 and 3 in a single look, costs nothing, and destroys no evidence:**

- `[apns] not configured — skipping push (safe no-op)` ⇒ **candidate 1**, and the diagnosis is over.
- `APNs push failed (non-fatal, Android unaffected): …` ⇒ **candidate 3**.
- 🔴 **Nothing at all** ⇒ the sender ran and APNs answered non-200 silently ⇒ **candidates 2 or 4**,
  and the tie is broken by a fact you already hold: **whether the two `push_token`s are still
  non-NULL now.** Still present ⇒ not `BadDeviceToken` ⇒ not the environment mismatch. Gone ⇒ it was.

⚠️ **WHY THE LOG AND NOT THE TABLE: re-reading `van_devices` is also cheap, but it is a SECOND
observation of something the first send may already have changed. The log is the only artefact that
records what happened rather than what survived.** ✅ **And it is the only place any of this is
recorded at all — see Q6.**

**NOT PERFORMED. RECOMMENDING NOTHING.**

---

# ⚠️ "FIX IN REPO" IS NOT "DEPLOYED"

**Two things this diagnosis cannot settle from source, stated in those words:**

1. ⚠️ **CANNOT BE DETERMINED READ-ONLY whether the deployed Vercel bundle matches this source.** The
   working tree is clean against `HEAD`, but nothing here proves which commit Vercel built. **What
   would settle it: the deployment's commit SHA in the Vercel dashboard against `git rev-parse HEAD`.**
2. ⚠️ **CANNOT BE DETERMINED READ-ONLY which iOS build is on the iPad**, and therefore which APNs
   environment its token belongs to. **What would settle it: whether the app was installed by ⌘R from
   Xcode (Debug ⇒ sandbox) or from TestFlight (Release ⇒ production).**

✅ **The two Edge Functions are not on this path at all, so their deployed-vs-source question does not
arise here.**

---

# 🔴 VERIFICATION

| Claim | Method |
|---|---|
| `pg_net` is used nowhere; no Edge Function or cron sends push | ✅ **EXECUTED** — repo-wide scans, every hit inspected |
| One and only one caller of `sendOrderPendingPush` | ✅ **EXECUTED** |
| The submit route declares no `runtime`, so it is Node | ✅ **EXECUTED** |
| `res.sent` is never read at the call site | ✅ **EXECUTED** — zero occurrences |
| `van_devices` has no environment column | ✅ **EXECUTED** — the full patch object read |
| The Debug/Release entitlements mapping is correct | ✅ **EXECUTED** — block boundaries resolved by line number, not grep order |
| `.env.local` values and lengths | ✅ **EXECUTED** — lengths only; **no secret is reproduced in this report** |
| Every branch, catch and log line quoted | ✅ **EXECUTED** |
| **`providerToken` throwing on a malformed PEM** | 🔴 **INFERRED** — read from its position outside the `try`. **Not executed** |
| **The unhandled `http2` session-error path** | 🔴 **INFERRED** — from the absence of a listener. **Not executed** |
| **What Vercel's `APNS_*` are set to** | ⚠️ **CANNOT BE DETERMINED READ-ONLY** |
| **Which build is on the iPad** | ⚠️ **CANNOT BE DETERMINED READ-ONLY** |
| **Whether the deployed bundle matches source** | ⚠️ **CANNOT BE DETERMINED READ-ONLY** |
| **What APNs actually returned** | ⚠️ **CANNOT BE DETERMINED READ-ONLY — nothing records it** |

🔴 **NOTHING HERE WAS OBSERVED RUNNING. No order was placed, no log was opened, no query was run, no
device was touched. Every claim is a source read or an inference from one.**

---

# INTEGRITY

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. A SEPARATE pass over this report AFTER writing. It is the only file
this task wrote.**

```
  docs/push-diagnosis-report.md   (SEPARATE PASS)    30,757  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 59 | 0 | 59 |
| U+2705 WHITE HEAVY CHECK MARK | 40 | 0 | 40 |
| **U+26A0 WARNING SIGN** | **38** | **38** | ✅ **0** |
| U+2717 BALLOT X | 2 | 0 | 2 |
| U+2318 PLACE OF INTEREST SIGN | 2 | 0 | 2 |

# ✅ EVERY WARNING SIGN IN THIS REPORT IS PAIRED — 38 OF 38, ZERO BARE.

⚠️ **Unlike the recent card reports, this one quotes no source string containing a bare `U+26A0`** —
`lib/apns.ts`, the submit route and the entitlements files carry none — **so 0 is the correct number
here rather than a suppressed one.**

✅ **The report's total `U+FE0F` count is 38, which exactly accounts for the 38 paired warning signs and
leaves none attached to any other base.** ✅ **The four unpaired bases are internally consistent — 0 of
59, 0 of 40, 0 of 2, 0 of 2 — so no base is split across two renderings.** ⚠️ **`U+2318` is bare twice
by necessity: both are the verbatim `⌘R` from the quoted build checklist.

## `git status --porcelain`

```
$ git status --porcelain
 M docs/reference-manual.md
?? docs/push-diagnosis-report.md
```

**Which entries were already there before this pass began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/push-diagnosis-report.md`** | 🔴 **THIS PASS — the only new entry, and the only file written** |
| `M docs/reference-manual.md` | ✅ **pre-existing — the V11.23 update from the previous task.** Not touched here |

⚠️ **The tree was committed between tasks — not by me.** Every other entry that stood earlier in this
session is now in `HEAD` (`8e94837 kds cleanup`, `b22f54f KDS updates`), which is why the list is two
lines rather than thirty-six. **This pass ran no git command other than `status`.**
