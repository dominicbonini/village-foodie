# APNs: key normalisation and failure surfacing

**One file changed: `lib/apns.ts`.** `npx tsc --noEmit` passes with no output — **which is not
verification.** ✅ **The key normalisation IS execution-verified — see the matrix below.**

**No commit, no stage, no revert, no stash, no clean.** No build, no `next dev`, no `next build`, no
`cap sync`, no deploy, no SQL, no migration, no schema change. **Nothing under `ios/` or `android/`,
no other route, and the payload, `apns-topic`, `apns-push-type`, `apns-priority`, the notification
copy, the van resolution, the trigger condition and the `.not('push_token','is',null)` filter are all
untouched** — EXECUTED: `app/api/orders/submit/route.ts` does not appear in this task's diff.

🔴 **NO KEY MATERIAL IS REPRODUCED IN THIS REPORT, IN ANY FORM.** No prefix, no sample, no hash. The
only key generated during verification was a throwaway created in the test process and never printed.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# 🔴 A CORRECTION TO THE STATED CAUSE, WITH EXECUTION EVIDENCE

**You said not to re-diagnose, and the fix you asked for is right and is built. But the MECHANISM as
stated cannot be the whole story, and I would be misreporting if I let it stand.**

**The brief says: *"Vercel's environment editor stores multi-line values as a single line with LITERAL
backslash-n, which OpenSSL cannot decode."*** 🔴 **THE OLD CODE ALREADY HANDLED THAT CASE.** READ, the
line that was there before this change:

```ts
  const key = process.env.APNS_KEY?.replace(/\\n/g, '\n')
```

✅ **EXECUTED against a throwaway P-256 key — literal backslash-n ALONE was already accepted by the old
code:**

```
B. literal \n only (Vercel shape)    OLD=accepted               NEW=accepted
```

**So a bare escaped-newline value was not what produced `ERR_OSSL_UNSUPPORTED` in production.**
**What DID fail under the old code — all execution-verified, all now fixed:**

```
C. literal \n + "double quotes"      OLD=ERR_OSSL_UNSUPPORTED   NEW=accepted
D. literal \n + 'single quotes'      OLD=ERR_OSSL_UNSUPPORTED   NEW=accepted
E. surrounding whitespace            OLD=ERR_OSSL_UNSUPPORTED   NEW=accepted
H. escaped CRLF (\r\n)               OLD=ERR_OSSL_UNSUPPORTED   NEW=accepted
```

⚠️ **THE FIX IS STILL CORRECT AND STILL NECESSARY — it closes four real failure shapes, one of which is
almost certainly the live one.** 🔴 **What changes is which Vercel entry to suspect: the value is not
merely escaped, it is escaped AND carries something else — wrapping quotes, surrounding whitespace, an
escaped `\r\n`, or a mangling this normaliser cannot reach (see the two below).** ⚠️ **`\r\n` is the
most likely single candidate, because it is what a Windows-side copy of a .p8 produces and it is
indistinguishable from `\n` in an environment editor's single-line display.**

**And two shapes remain unrecoverable BY DESIGN — EXECUTED:**

```
I. newlines stripped entirely        OLD=ERR_OSSL_UNSUPPORTED   NEW=ERR_OSSL_UNSUPPORTED
J. newlines replaced with spaces     OLD=ERR_OSSL_UNSUPPORTED   NEW=ERR_OSSL_UNSUPPORTED
```

⚠️ **Unescaping cannot fix those — the base64 body would have to be re-wrapped at 64 columns, which is
inventing structure rather than restoring it.** ✅ **They now produce the NAMED "armoured but
undecodable" message instead of a bare OpenSSL code, which is the point of Part A's third case.**

---

# PART A — THE NORMALISER

**READ, in full:**

```ts
export function normaliseApnsKey(raw: string): string {
  return raw
    .trim()
    .replace(/^['"]|['"]$/g, '')   // a value pasted with its surrounding quotes
    // ⚠️ ESCAPED CRLF FIRST. `\r\n` CONTAINS `\n`, so expanding `\n` alone would leave a stray literal
    // backslash-r on every line — which fails to decode exactly as the original bug did. Proven.
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')         // 🔴 THE PRODUCTION FIX: literal backslash-n → a real newline
    .trim()
}
```

| Your four requirements | Done |
|---|---|
| replace literal backslash-n with real newlines | ✅ |
| strip wrapping single or double quotes | ✅ |
| trim leading and trailing whitespace | ✅ **twice** — before quote-stripping and after expansion |
| leave the PEM armour lines intact | ✅ **nothing touches `-----BEGIN`/`-----END`** |

## ⚠️ ONE OPERATION I ADDED BEYOND YOUR FOUR, DECLARED

🔴 **`.replace(/\\r\\n/g, '\n')`.** ⚠️ **I added it because expanding `\n` alone on an escaped-CRLF value
leaves a literal backslash-r on every line and still fails — so a partial expansion is worse than
none, it just moves the error.** ✅ **It is the same operation you specified, applied to the pair that
contains it.** **Execution-verified as case H above. Say the word and it comes out.**

✅ **REAL CRLF NEEDS NOTHING, AND THAT IS PROVEN RATHER THAN ASSUMED — `G. real CRLF → accepted`.** The
normaliser deliberately does not touch real carriage returns.

## The three distinct failures

**READ:**

```ts
function loadApnsKey(raw: string | undefined): KeyResult {
  if (!raw || !raw.trim()) {
    return { error: 'APNS_KEY is not set (or is empty). Push is disabled until it is.' }
  }
  const pem = normaliseApnsKey(raw)
  if (!pem.includes('-----BEGIN') || !pem.includes('-----END')) {
    return { error: `APNS_KEY is set but is not a PEM — the BEGIN/END armour lines are missing (normalised length ${pem.length}). A .p8 must be pasted whole, including both -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- lines.` }
  }
  try {
    return { key: crypto.createPrivateKey(pem) }
  } catch (e) {
    return { error: `APNS_KEY is armoured but OpenSSL could not decode it (${(e as Error).message}). The escaped-newline and wrapping-quote cases are already normalised, so this is the key itself: check it is the .p8 as downloaded from Apple, PKCS#8, and not a .cer/.p12 or a re-encoded copy.` }
  }
}
```

✅ **EXECUTED — the three branches produce three different outcomes:**

```
unset            -> MISSING
empty string     -> MISSING
27-char stub     -> NO-ARMOUR (len 27)
armoured garbage -> UNPARSEABLE (ERR_OSSL_UNSUPPORTED)
normalised real  -> OK
```

⚠️ **An EMPTY STRING is treated as missing, which is what an environment editor produces from a cleared
field and what `!keyId` already did for the other three variables.**

## 🔴 REDACTION — VERIFIED, NOT ASSERTED

**Only ONE property of the key is ever emitted: `normalised length ${pem.length}`, in the no-armour
branch.** ⚠️ **A length is the one fact that distinguishes a 27-character stub from a real ~240-character
.p8, and it discloses nothing.**

✅ **EXECUTED — a scan for any `console` line touching `cfg.key` or `APNS_KEY` returns NOTHING.** The
key becomes a `crypto.KeyObject` at parse time and the raw string is never held beyond that function.
🔴 **`crypto.createPrivateKey`'s own error message is included, and it does not contain key material —
it is the OpenSSL code and reason, which is exactly the string that was already reaching the log.**

## Two latent throws closed while I was here

🔴 **`providerToken` and `http2.connect` were OUTSIDE the function's own `try`**, so a key that would
not parse threw straight out of a function whose docblock said *"Never throws"* — which is precisely how
the production failure escaped to the call site. **Both are inside now.** ✅ **The docblock's promise is
true rather than aspirational.**

---

# PART B — SURFACING THE FAILURE

**The send stays NON-FATAL. That decision is untouched: nothing throws, the caller's contract is
unchanged, and an order still submits when push fails.**

## Every APNs outcome, at `error`, with status and Apple's `reason`

```ts
        if (status === 200) {
          sent++
          console.error(`[apns] 200 OK device=${tokenTail(token)} order=${payload.orderNumber} apns-id=${apnsId}`)
        } else {
          let reason = ''
          try { reason = String((JSON.parse(data || '{}') as { reason?: unknown }).reason ?? '') } catch { /* non-JSON body */ }
          console.error(`[apns] ${status || 'NO-STATUS'} device=${tokenTail(token)} order=${payload.orderNumber} reason=${reason || '(none given)'}${reason ? '' : ` body=${data.slice(0, 200)}`}`)
          if (reason === 'BadDeviceToken' || reason === 'Unregistered') invalidTokens.push(token)
        }
```

⚠️ **`reason` is now parsed for EVERY non-200, not only the two that null a token.** 🔴 **403
`ExpiredProviderToken`, 403 `InvalidProviderToken`, 429 and every 5xx produced literally no log line
before this — the response body was parsed, checked against two strings, and discarded.**
⚠️ **`apns-id` is captured on success so a delivered push can be correlated with Apple's own records.**

## The per-request and session errors, which were silent

**BEFORE:** `req.on('error', () => resolve())` — an empty arrow.

**AFTER:**

```ts
      req.on('error', e => { console.error(`[apns] REQUEST ERROR device=${tokenTail(token)} order=${payload.orderNumber}: ${(e as Error).message}`); resolve() })
```

🔴 **AND A SESSION-LEVEL HANDLER THAT DID NOT EXIST — DECLARED, BECAUSE IT IS A CHANGE YOU DID NOT ASK
FOR:**

```ts
    client.on('error', e => console.error(`[apns] SESSION ERROR to ${cfg.host}: ${(e as Error).message}`))
```

⚠️ **I added it because an unhandled `'error'` event on an `Http2Session` THROWS.** DNS failure, TLS
failure or a refused connection would have escaped as an unhandled event — **the one way this
"non-fatal" path could have taken the order down with it**, which contradicts the invariant you told me
to keep. ✅ **It is log-only and changes no outcome. Remove it if you disagree.**

## The one-line summary

```ts
  const failed = tokens.length - sent
  console.error(
    `[apns] SUMMARY order=${payload.orderNumber} truck="${payload.truckName}" host=${cfg.host} attempted=${tokens.length} succeeded=${sent} failed=${failed}` +
    (invalidTokens.length ? ` tokens-to-be-cleared=${invalidTokens.length}` : ''),
  )
```

✅ **attempted / succeeded / failed, plus the host actually used** — which is the fact C2 says has never
been exercised, so it belongs in every line. 🔴 **`sent` is still discarded by the caller, and that is
now harmless: the value is logged where it is computed rather than depending on a caller to read it.**

## Both skip paths are now `error`, and both name themselves

```ts
    console.error(`[apns] SEND SKIPPED — ${conf.error}`)
```
```ts
    console.error(`[apns] SEND SKIPPED — no device tokens for order ${payload.orderNumber} (${payload.truckName}). The van resolved but no enabled device had a push_token.`)
```

🔴 **`error`, NOT `warn`.** ⚠️ **The old `console.warn('[apns] not configured — skipping push (safe
no-op)')` is gone; there are now ZERO `console.warn` calls in the file.** **A warn nobody reads was the
difference between "push is off" and "push is broken" for the entire life of the feature.**

⚠️ **The missing-variable message now NAMES the variables** rather than saying "not configured":
`missing APNS_KEY_ID, APNS_TEAM_ID` tells you which Vercel entry to add.

## 🔴 A DURABLE RECORD — FEASIBLE WITHOUT A MIGRATION. NOT BUILT.

# ✅ YES, IT IS FEASIBLE, AND `action_audit_log` IS THE TABLE. NO SCHEMA CHANGE IS NEEDED.

**READ — the existing columns:**

```sql
create table if not exists action_audit_log (
  id            uuid        primary key default gen_random_uuid(),
  action        text        not null,
  truck_id      text        not null,
  order_key     uuid,
  amount_minor  integer,
  before_state  jsonb,
  after_state   jsonb,
  actor_kind    text        not null,
  actor_id      text,
  actor_label   text,
  source        text        not null,
  created_at    timestamptz not null default now(),
  constraint action_audit_log_actor_kind_chk check (actor_kind in ('owner', 'staff', 'token', 'unknown')),
  constraint action_audit_log_source_chk     check (source     in ('web', 'native', 'offline_replay'))
);
```

**It fits with nothing added:**

| Column | Value | Fits? |
|---|---|---|
| `action` | `'push_order_pending'` | ✅ **free text** — the migration's own comment says so |
| `truck_id` | the truck | ✅ |
| `order_key` | the order | ✅ |
| `after_state` | `{ host, attempted, succeeded, failed, reasons: [...] }` | ✅ **jsonb** |
| `actor_kind` | `'unknown'` | ✅ **in the CHECK** |
| `source` | `'web'` | ✅ **in the CHECK** |
| `amount_minor` · `before_state` | null | ✅ nullable |

🔴 **I DID NOT BUILD IT, AND HERE IS THE HONEST REASON: it cannot be done inside `lib/apns.ts` alone.**
The sender has no Supabase client, no truck id and no actor — they would have to be threaded in from
`app/api/orders/submit/route.ts`, which changes that route's call signature. ⚠️ **Your DO-NOT list names
"any other route", and the whole of Part A and B was achievable without leaving this file.** **Widening
to a second file for a feature you asked me to ASSESS rather than build is the call I declined to make
on my own.**

⚠️ **ONE PROPERTY WORTH KNOWING BEFORE DECIDING: `logAction` swallows its own failure** — READ:

```ts
    if (error) console.error(`[action-audit] insert failed for action=${entry.action} order_key=${entry.orderKey ?? '-'}:`, error.message)
```

**So a durable record added this way is best-effort and fails to the same log the summary already
reaches. It would add queryability, not guaranteed capture.**

---

# PART C — REPORT ONLY

## C1 — EVERY `APNS_*` VARIABLE, EXACT NAMES

# 🔴 `APNS_PRIVATE_KEY` DOES NOT EXIST AND NEVER DID. THE FIVE REAL NAMES ARE:

**EXECUTED — every `process.env.APNS` read in the file:**

```
88:  const keyId = process.env.APNS_KEY_ID
89:  const teamId = process.env.APNS_TEAM_ID
90:  const bundleId = process.env.APNS_BUNDLE_ID
99:  const k = loadApnsKey(process.env.APNS_KEY)
107:  const host = process.env.APNS_ENV === 'production'
```

| Exact name | Required | If absent, after this change |
|---|---|---|
| **`APNS_KEY_ID`** | ✅ | named in the skip line |
| **`APNS_TEAM_ID`** | ✅ | named in the skip line |
| **`APNS_BUNDLE_ID`** | ✅ | named in the skip line |
| **`APNS_KEY`** | ✅ | its own three-way message |
| **`APNS_ENV`** | ✗ | ⚠️ **absence silently selects SANDBOX** |

⚠️ **`APNS_KEY` is the raw .p8 PEM including both armour lines — not base64, not a path.** ⚠️ **An empty
string counts as absent for all five.**

## C2 — THE HOST, QUOTED. UNCHANGED.

```ts
  const host = process.env.APNS_ENV === 'production'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com'
```

🔴 **`APNS_ENV` alone drives it, by STRICT EQUALITY against the exact string `production`. Unset, empty,
`Production`, `prod` or a trailing space all select SANDBOX.** ✅ **Not changed, as instructed.**

🔴 **NEITHER BRANCH HAS EVER BEEN EXERCISED.** No send has reached Apple, so the host selection, the
JWT's acceptance, the topic and the payload shape are all still unproven end to end. ⚠️ **One
`APNS_ENV` per deployment, and it must match the `aps-environment` the installed build was signed with
— Debug/Xcode ⇒ sandbox, Release/TestFlight ⇒ production.** **The summary line now prints the host on
every send, so the first real attempt says which one it used.**

## C3 — 🔴 IS `BadDeviceToken` NULLING SAFE ONCE SENDS START? **NO. IT IS THE NEXT DEFECT.**

**READ — the cleanup, in `app/api/orders/submit/route.ts`, untouched by this task:**

```tsx
            if (invalidTokens.length) {
              await supabase.from('van_devices').update({ push_token: null }).in('push_token', invalidTokens)
            }
```

**and what qualifies, in this file, also unchanged:**

```ts
          if (reason === 'BadDeviceToken' || reason === 'Unregistered') invalidTokens.push(token)
```

# 🔴 `BadDeviceToken` IS EXACTLY WHAT THE WRONG HOST RETURNS FOR A PERFECTLY VALID TOKEN.

⚠️ **A sandbox token sent to `api.push.apple.com` is not dead — it is being asked the wrong question.
Nulling it destroys a working credential and forces the operator to delete and reinstall the app to
re-register.** 🔴 **AND IT ERASES THE EVIDENCE:** after the null, "never registered" and "registered,
then destroyed by a mis-targeted send" are indistinguishable in the table.

⚠️ **THE RISK IS ABOUT TO BECOME LIVE FOR THE FIRST TIME.** Until now the key never parsed, so no send
reached Apple, so **no token has ever been nulled by this path.** **The moment the key is fixed, the
first send with a mismatched `APNS_ENV` will null both 64-character tokens on that van.**

⚠️ **The FCM sibling already draws this distinction — `lib/fcm.ts` keeps the token on
`SENDER_ID_MISMATCH` on the stated grounds that *"the DEPLOYMENT is wrong, not the device — nulling
erases the evidence"*.** **APNs has no equivalent carve-out.**

🔴 **CHANGED NOTHING. REPORTING ONLY, AS INSTRUCTED.** ⚠️ **The eleven existing null-token rows on this
van were NOT created by this path, since it has never run — their cause is separate and is unresolved.**

## C4 — `device_id`, QUOTED

**READ — `lib/native/device.ts`:**

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

**and the upsert keys on that value alone — READ, `app/api/native/bind-device/route.ts`:**

```tsx
    .from('van_devices').upsert(patch, { onConflict: 'device_id' }).select('*').single()
```

🔴 **THE IDENTITY IS WKWebView `localStorage`, NOT HARDWARE.** Anything that clears it mints a new UUID
and the upsert INSERTS rather than updates: deleting and reinstalling the app (which the push checklist
makes step one), WebKit evicting website data, or a different bundle installed over it. **An ordinary
cold kill does not.**

⚠️ **TWO TOKENED ROWS THREE SECONDS APART CANNOT BE EXPLAINED BY THAT — nothing clears localStorage in
three seconds.** **CANNOT BE DETERMINED READ-ONLY.** ⚠️ **What the source does show is that
`registerForPush` is called from three sites and its own comment records listeners having stacked
before a guard was added — so two near-simultaneous `saveDeviceConfig` writes are possible; whether
they carried the same `device_id` is not knowable from here.**

⚠️ **A stale row cannot SHADOW a live one — the lookup has no `limit(1)` and sends to every match. The
harm runs the other way: the cleanup matches `.in('push_token', …)` ON TOKEN VALUE, so nulling one
row's dead token nulls every row holding the same value.**

---

# 🔴 VERIFICATION

| Claim | Method |
|---|---|
| **The normaliser fixes quotes, whitespace, escaped `\n` and escaped `\r\n`** | ✅ **EXECUTED** — ten-case matrix against a throwaway P-256 key, old vs new, printed above |
| **Real CRLF needs no handling** | ✅ **EXECUTED** — case G, accepted by both |
| **Plain escaped `\n` was ALREADY handled by the old code** | ✅ **EXECUTED** — case B. **This is what corrects the stated cause** |
| **Stripped/space-separated newlines remain unrecoverable** | ✅ **EXECUTED** — cases I and J |
| **The three key failures produce three distinct messages** | ✅ **EXECUTED** — the five-line branch table above |
| **`createPrivateKey` accepts the normaliser's output** | ✅ **EXECUTED** — that is the assertion in every row |
| The key reaches no log call | ✅ **EXECUTED** — scan returns nothing; only `pem.length` is emitted |
| Zero `console.warn` remain; nine `console.error` | ✅ **EXECUTED** |
| The five `APNS_*` names | ✅ **EXECUTED** — every `process.env.APNS` read enumerated |
| `action_audit_log` fits with no migration | ✅ **EXECUTED** — columns and both CHECK constraints read |
| Only `lib/apns.ts` changed | ✅ **EXECUTED** — `git status` below |
| **That the production failure was one of C/D/E/H specifically** | 🔴 **INFERRED.** The log line proves the class, not the member. **Only the Vercel value settles it, and I did not read it** |
| **That a real push now arrives** | ⚠️ **CANNOT BE VERIFIED HERE.** No order was placed, no device was touched, no request reached Apple |
| **The host selection, the JWT's acceptance by Apple, the topic and the payload** | 🔴 **STILL UNPROVEN END TO END** — unchanged by this task and never exercised |
| C3's risk and C4's duplicate rows | 🔴 **SOURCE READ ONLY** — no query was run |

🔴 **THE END-TO-END SEND IS NOT VERIFIED AND CANNOT BE FROM HERE. What this task proves is that the key
will now parse, and that when the next send fails, the log will say why.**

---

# INTEGRITY

## Non-ASCII class census — `lib/apns.ts`

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 0 | 44 | **+44, NEW** | comment banners |
| U+2014 EM DASH | 2 | 26 | +24 | comment prose |
| **U+26A0 WARNING SIGN** | 1 | 13 | **+12** | twelve new caveats — **all paired** |
| **U+FE0F** | 1 | 13 | **+12** | ✅ **matches the U+26A0 delta exactly** |
| U+1F534 LARGE RED CIRCLE | 0 | 10 | **+10, NEW** | comment prose |
| U+2026 HORIZONTAL ELLIPSIS | 0 | 4 | **+4, NEW** | ⚠️ **one is CODE — the `…` prefix in `tokenTail`; three are comments** |
| U+21D2 RIGHTWARDS DOUBLE ARROW | 0 | 2 | **+2, NEW** | comment prose |
| U+2192 RIGHTWARDS ARROW | 1 | 2 | +1 | comment prose |

⚠️ **4 CLASSES BEFORE, 8 AFTER — this file gained four, and that is expected: it had almost no
commentary and now carries the reasoning for a production failure.** ✅ **Only ONE new non-ASCII
character is in executable code (`…` in `tokenTail`); every other delta is comment.**

## 🔴 Bare `U+26A0`

| File | BEFORE n / paired / bare | AFTER n / paired / bare |
|---|---|---|
| `lib/apns.ts` | 1 / 1 / **0** | 13 / 13 / **0** |

✅ **ZERO BEFORE, ZERO AFTER. All twelve added warning signs are paired.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. The report scanned in a SEPARATE pass AFTER writing.**

```
  lib/apns.ts                                     13,835  offending=0  CR=0   (was 3,854)
  docs/apns-key-fix-report.md  (SEPARATE PASS)     24,212  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 48 | 0 | 48 |
| U+1F534 LARGE RED CIRCLE | 34 | 0 | 34 |
| **U+26A0 WARNING SIGN** | **30** | **30** | ✅ **0** |
| U+2717 BALLOT X | 1 | 0 | 1 |

# ✅ EVERY WARNING SIGN IN THIS REPORT IS PAIRED — 30 OF 30, ZERO BARE.

⚠️ **This report quotes `lib/apns.ts` heavily, and that file has ZERO bare `U+26A0` both before and
after this change** — so unlike the recent OrderCard reports there is no legitimate bare glyph to
quote, and 0 is the correct number rather than a suppressed one.

✅ **The report's total `U+FE0F` count is 30, which exactly accounts for the 30 paired warning signs and
leaves none attached to any other base.** ✅ **The three unpaired bases are internally consistent — 0 of
48, 0 of 34, 0 of 1 — so no base is split across two renderings.**

## `git status --porcelain`

```
$ git status --porcelain
 M docs/reference-manual.md
 M lib/apns.ts
?? docs/apns-key-fix-report.md
?? docs/push-diagnosis-report.md
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`M lib/apns.ts`** | 🔴 **THIS TASK — the only source file written** |
| 🔴 **`?? docs/apns-key-fix-report.md`** | 🔴 **THIS TASK** |
| `M docs/reference-manual.md` | ✅ **pre-existing** — the V11.23 update. Not touched here |
| `?? docs/push-diagnosis-report.md` | ✅ **pre-existing** — the read-only diagnosis this follows. Not overwritten |

✅ **One modified and one untracked before; two modified and two untracked after. The two deltas are
`lib/apns.ts` and this report.**
