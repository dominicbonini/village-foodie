# APNs: `BadDeviceToken` no longer nulls a token

**One file changed: `lib/apns.ts`.** `npx tsc --noEmit` passes with no output — **which is not
verification.** ✅ **The classification IS execution-verified — matrix below.**

**No commit, no stage, no revert, no stash, no clean.** No build, no `next dev`, no `next build`, no
`cap sync`, no deploy, no SQL, no migration, no schema change. **`lib/fcm.ts` was READ and not edited;
nothing under `ios/` or `android/`; no route; the `action_audit_log` durable record stays unbuilt.**

✅ **EVERYTHING FROM THE PREVIOUS TASK IS INTACT** — EXECUTED, by census and by scan: the normaliser is
character-identical, the nine `console.error` sites are unchanged, both recovered throws stay inside
the `try`, the session-error listener is untouched, and the host selection, payload, `apns-topic`,
`apns-push-type`, `apns-priority` and the absent `apns-priority` are all exactly as they were.

🔴 **NO KEY MATERIAL APPEARS IN THIS REPORT OR IN ANY LOG LINE ADDED.** No key was generated, read or
printed during this task.

**No span of the prompt arrived garbled.** ⚠️ **One requirement cannot be met without touching a file
the DO-NOT list forbids — the `device_id` in the log line. I did NOT touch it, and I say so in full
below rather than silently dropping the field.**

---

# 1 — `lib/fcm.ts`'s CARVE-OUT, QUOTED IN FULL

**FCM does not have one carve-out. It has THREE treatments, and the whole of the decision is which one
`BadDeviceToken` maps to. READ, the classification block in full:**

```ts
      // -- WHICH FAILURES KILL A TOKEN, AND WHICH ARE ONLY A BAD DAY --------------------------------
      // DEAD, null the column:
      //   UNREGISTERED (404) — the app was uninstalled, or the token was rotated. The APNs analogue of
      //                        Unregistered. Unambiguous, and the only code that is dead on its own.
      //   INVALID_ARGUMENT (400) — a malformed registration token. See the circuit breaker below: this
      //                        code is ALSO what a malformed MESSAGE returns, which is why it is not
      //                        trusted on its own.
      // NOT DEAD, leave the column alone:
      //   UNAVAILABLE (503) / INTERNAL (500) / QUOTA_EXCEEDED (429) — transient, retry later.
      //   SENDER_ID_MISMATCH (403) — the token belongs to a DIFFERENT Firebase project. That is a
      //                        deployment mistake (wrong google-services.json, or the service account
      //                        and the app are from two projects), not a dead device. ⚠️ NULLING HERE
      //                        WOULD DESTROY THE EVIDENCE OF THE MISCONFIGURATION and leave a fleet of
      //                        silently unreachable devices — the exact failure mode APNs's
      //                        BadDeviceToken handling has. It is logged loudly and the token is kept.
      //   THIRD_PARTY_AUTH_ERROR (401) — an APNs credential problem for iOS-via-FCM. Not this path.
      if (code === 'UNREGISTERED') {
        invalidTokens.push(token)
      } else if (code === 'INVALID_ARGUMENT' && blamesMessage) {
        // FCM named a field that is NOT the token. The device is fine and the payload is not; nulling
        // here would blame the wrong thing and destroy a working registration.
        console.error(`[fcm] INVALID_ARGUMENT on ${violations.map(v => v.field).join(', ')} - this is a MESSAGE fault, not a dead device. Token KEPT. ${body.error?.message || ''}`)
      } else if (code === 'INVALID_ARGUMENT') {
        invalidTokens.push(token)
        // Only counted as ambiguous when FCM did NOT tell us which field it objected to. A response that
        // explicitly blames message.token is certain, and must not be second-guessed by the breaker.
        if (!blamesToken) invalidArgument.push(token)
      } else if (code === 'SENDER_ID_MISMATCH') {
        console.error('[fcm] SENDER_ID_MISMATCH — this token belongs to another Firebase project. Check that android/app/google-services.json and FCM_SERVICE_ACCOUNT_JSON are from the SAME project. The token was KEPT, deliberately.')
      } else {
        console.warn(`[fcm] send failed (${res.status} ${code || 'unknown'}) — token kept: ${body.error?.message || ''}`)
      }
```

**and the circuit breaker, also in full:**

```ts
  // -- THE CIRCUIT BREAKER. IT GUARDS ONE CODE, NOT ALL OF THEM. -------------------------------------
  // INVALID_ARGUMENT is returned both for a bad registration token and for a bad message body. A payload
  // regression therefore looks exactly like every device in the van going dead at once — and the cleanup
  // at the call site would NULL the whole fleet's push_token, permanently, from one bad deploy. Nothing
  // in a single response distinguishes the two, so the SHAPE of the batch does it: if nothing succeeded
  // and every rejection was the ambiguous code, the common factor is the message, not the devices.
  // ⚠️ IT IS DELIBERATELY BLIND TO UNREGISTERED, AND THAT IS THE WHOLE REASON FOR THE SECOND LIST. A
  // message fault cannot produce UNREGISTERED — that code means the app was uninstalled — so a van whose
  // two tablets were both wiped must still have both tokens cleared. Guarding on invalidTokens as a whole
  // would have kept them forever, which is the opposite failure and just as silent.
  // The `> 1` clause keeps a single ambiguous rejection actionable: with one token there is no shape to
  // read, and a lone malformed token is far likelier than a payload that only one device rejects.
  if (sent === 0 && invalidArgument.length > 1 && invalidArgument.length === invalidTokens.length) {
    console.error(`[fcm] ALL ${invalidArgument.length} tokens were rejected with INVALID_ARGUMENT and none succeeded. Treating this as a MESSAGE fault, not ${invalidArgument.length} dead devices — no token was marked invalid. Check the payload against the FCM v1 message schema.`)
    return { sent: 0, invalidTokens: [], skipped: 'all-rejected' }
  }
```

# 🔴 WHICH OF THE THREE DOES `BadDeviceToken` MAP TO? THE `SENDER_ID_MISMATCH` ONE — AND FCM SAYS SO ITSELF.

**I did not have to judge this. Both files already name the answer.**

**Evidence 1 — FCM's own comment, quoted above, names APNs explicitly:**

> *"NULLING HERE WOULD DESTROY THE EVIDENCE OF THE MISCONFIGURATION and leave a fleet of silently
> unreachable devices — **the exact failure mode APNs's BadDeviceToken handling has.** It is logged
> loudly and the token is kept."*

**Evidence 2 — the reference manual's policy table, READ:**

```
| `SENDER_ID_MISMATCH` | 🔴 **KEEP the token** | the DEPLOYMENT is wrong, not the device — **nulling erases the evidence**, the `BadDeviceToken` lesson generalised rather than copied |
```

✅ **`SENDER_ID_MISMATCH`'s treatment WAS DERIVED FROM this exact APNs case. Adopting it back is the
lesson coming home, not a new policy.**

## ⚠️ AND THE OTHER CARVE-OUT — THE CIRCUIT BREAKER — DOES **NOT** APPLY. STATED, NOT ASSUMED.

**The breaker guards ONE specific collision: `INVALID_ARGUMENT` means "bad token" OR "bad MESSAGE", so
a payload regression looks like a dead fleet.** 🔴 **APNs has no such collision. A malformed APNs
payload returns `BadMessageId`, `PayloadEmpty`, `PayloadTooLarge` or `BadTopic` — never
`BadDeviceToken`.** ✅ **So copying the breaker would guard against something that cannot happen, and
its `> 1` clause would leave a SINGLE-device van unprotected — which is the common case here.**

⚠️ **THAT `> 1` CLAUSE IS WHY THE SHAPES ARE NOT INTERCHANGEABLE.** FCM justifies it as *"a lone
malformed token is far likelier than a payload that only one device rejects"*. **The reverse is true
for APNs: there is exactly ONE `APNS_ENV` per deployment and it has never been exercised, so a lone
`BadDeviceToken` is at least as likely to be the host as the device.** ✅ **The `SENDER_ID_MISMATCH`
shape has no such threshold — it keeps the token unconditionally — which is why it is the right one
and why I did not need to invent a modified breaker.**

# ✅ SO: ONE FCM SHAPE ADOPTED VERBATIM IN STRUCTURE, ONE EXPLICITLY DECLINED WITH ITS REASON. NO THIRD POLICY.

---

# 2 — THE CHANGE

**BEFORE — one line, both reasons treated as death:**

```ts
          // ⚠️ THE INVALID-TOKEN SET IS UNCHANGED. Which reasons null a token is a separate decision and
          // is NOT being revisited here — see docs/apns-key-fix-report.md, C3, for why it carries a real
          // risk now that sends will actually reach Apple.
          if (reason === 'BadDeviceToken' || reason === 'Unregistered') invalidTokens.push(token)
```

**AFTER — READ, in full:**

```ts
          // ── 🔴 WHICH REJECTIONS KILL A TOKEN — TWO-WAY, AND THE SPLIT IS THE WHOLE POINT ───────────
          // `Unregistered` (410) — DEAD, null it. Apple states the token is no longer valid FOR THIS
          //   TOPIC: the app was uninstalled, or the token rotated. Unambiguous, and the only reason that
          //   is dead on its own. The direct analogue of FCM's UNREGISTERED, which nulls for the same
          //   reason and with the same certainty.
          // 🔴 `BadDeviceToken` (400) — AMBIGUOUS, KEEP IT. Apple returns this BOTH for a genuinely bad
          //   token AND for a perfectly valid token presented to the WRONG HOST — a sandbox token at
          //   api.push.apple.com, or the reverse. Nothing in the response distinguishes them, and there
          //   is exactly ONE `APNS_ENV` per deployment, so a mismatch rejects the WHOLE FLEET at once.
          //   Nulling would destroy working credentials, force every iPad to delete-and-reinstall to
          //   re-register, and erase the only evidence that the deployment was misconfigured.
          // 🔴 THIS IS lib/fcm.ts's SENDER_ID_MISMATCH TREATMENT, ADOPTED RATHER THAN INVENTED. That
          //   branch keeps its token and logs loudly on the grounds that "the DEPLOYMENT is wrong, not
          //   the device", and the manual records it as *the `BadDeviceToken` lesson generalised rather
          //   than copied* — so this is the lesson coming home to the case it was learned from.
          // ⚠️ FCM's OTHER carve-out, the INVALID_ARGUMENT circuit breaker, is NOT copied and does not
          //   apply: it guards a MESSAGE fault masquerading as dead devices, and a bad APNs payload
          //   returns BadMessageId/PayloadEmpty/etc., never BadDeviceToken. Copying a breaker for a
          //   collision that cannot occur would be a third policy, not parity.
          if (reason === 'Unregistered') {
            invalidTokens.push(token)
          } else if (reason === 'BadDeviceToken') {
            badDeviceTokens++
            console.error(
              `[apns] BadDeviceToken device=${tokenTail(token)} status=${status} host=${cfg.host} topic=${cfg.bundleId} order=${payload.orderNumber} — TOKEN KEPT, DELIBERATELY. ` +
              `This is EITHER a dead token OR a valid token sent to the wrong APNs host. Check APNS_ENV against the aps-environment the installed build was signed with ` +
              `(Xcode/Debug ⇒ sandbox, TestFlight/Release ⇒ production) BEFORE concluding the device is dead.`,
            )
          }
```

# ✅ `invalidTokens.push` NOW APPEARS EXACTLY ONCE IN THE FILE, AND IT IS THE `Unregistered` ARM.

**EXECUTED — `grep -c "invalidTokens.push"` returns `1`, at line 222.** 🔴 **There is no path by which a
`BadDeviceToken` can reach the caller's `.update({ push_token: null })`.** ✅ **The caller needed no
change: it nulls what is in `invalidTokens`, and the carve-out is upstream of that list.**

## The whole-fleet signal

```ts
  if (sent === 0 && badDeviceTokens > 0 && badDeviceTokens === tokens.length) {
    console.error(
      `[apns] 🔴 ALL ${tokens.length} device(s) rejected with BadDeviceToken and none succeeded, on host ${cfg.host}. ` +
      `That is the signature of an APNS_ENV / aps-environment MISMATCH, not ${tokens.length} dead device(s). NO TOKEN WAS CLEARED.`,
    )
  }
```

⚠️ **This is FCM's shape-reading applied as a DIAGNOSTIC rather than as a gate.** ✅ **It changes no
outcome — the tokens were already being kept — it names the pattern so nobody has to infer it.**

## The summary line carries the count

```ts
    (badDeviceTokens ? ` bad-device-token=${badDeviceTokens}(KEPT)` : ''),
```

## ⚠️ THE `device_id` YOU ASKED FOR IS NOT AVAILABLE, AND I DID NOT GO GET IT

🔴 **`sendOrderPendingPush` receives `tokens: string[]`. It never sees a `device_id`** — the caller
selects it and drops it before the sender is called:

```tsx
              .from('van_devices').select('device_id, push_token, platform')…
```
```tsx
            const iosTokens = allDevices.filter(d => d.platform === 'ios' || d.platform == null).map(d => d.push_token as string).filter(Boolean)
```

🔴 **Logging `device_id` therefore requires changing the sender's signature and the caller that builds
that array — and the caller is `app/api/orders/submit/route.ts`, which your DO-NOT list forbids ("or
any route"). Requirement 2 and the DO-NOT list cannot both be satisfied.**

✅ **I did not touch the route. The line carries `device=…{last 6 of the token}` instead, plus `status`,
`reason`, `host` and `topic`.** ⚠️ **The STATED PURPOSE is met — *"so a host mismatch is visible in one
line without a database read"* — because `reason=BadDeviceToken host=api.push.apple.com` is what makes
a mismatch visible; the `device_id` identifies WHICH device, not WHAT went wrong.** **Say the word and
it is a two-line change to the sender's signature plus one `.map` at the call site.**

---

# 3 — `410 Unregistered`: UNCHANGED. IT STILL NULLS.

**What I did: left it nulling, and moved it into its own branch so the two reasons are visibly
different decisions rather than two operands of an `||`.**

**Why it differs from `BadDeviceToken`, in one line each:**

| | `Unregistered` (410) | `BadDeviceToken` (400) |
|---|---|---|
| What Apple asserts | 🔴 **the token is no longer valid FOR THIS TOPIC** — a positive statement about this token | **the token is malformed OR not for this environment** |
| Can a deployment fault produce it? | ✅ **NO.** It requires Apple to have observed the app uninstalled or the token rotated | 🔴 **YES — the wrong host produces it for a perfectly good token** |
| Ambiguous? | ✗ | ✅ |
| Action | **null it** | **keep it** |
| FCM analogue | `UNREGISTERED` → `invalidTokens.push(token)` | `SENDER_ID_MISMATCH` → keep + log |

⚠️ **AND KEEPING `Unregistered` NULLING IS ITSELF A PARITY REQUIREMENT, NOT AN OVERSIGHT.** FCM's
breaker is *"deliberately blind to UNREGISTERED"* on the stated grounds that *"a van whose two tablets
were both wiped must still have both tokens cleared. Guarding on invalidTokens as a whole would have
kept them forever, which is the opposite failure and just as silent."* ✅ **The same reasoning applies
here: a blanket "never null" would be the mirror defect.**

---

# 4 — DOES ANYTHING NOW DISTINGUISH A SANDBOX TOKEN FROM A PRODUCTION ONE?

# 🔴 NO. NOTHING DOES, AND THIS CHANGE DOES NOT ADD IT.

⚠️ **`van_devices` has `platform` — 'ios' / 'android' / 'web' — and NO environment column.** ✅ **Those
axes are orthogonal: `platform` answers "Apple or Google", never "sandbox or production".** **Both
token kinds are 64-character hex strings and are indistinguishable by inspection.**

**What this change adds is not a distinction, it is a SURVIVING SYMPTOM:** the token is no longer
destroyed, so the evidence remains readable after the fact, and the log names the host that rejected
it. ⚠️ **That is diagnosis, not identification.**

## What I would record — DESCRIBED, NOT BUILT. No migration written.

| Field | Value | Where it would come from |
|---|---|---|
| `push_env` | `'sandbox'` \| `'production'` | 🔴 **The DEVICE knows and the server cannot infer it.** iOS exposes the running build's `aps-environment` in its provisioning profile; the registration handler would send it alongside `push_token` |
| `push_token_at` | timestamp | when the token was last written, so a stale token is distinguishable from a current one |

⚠️ **THE HARD PART IS NOT THE COLUMN, IT IS THE SOURCE.** `@capacitor/push-notifications` does not
report the APNs environment — the value would have to come from a native read of the embedded
provisioning profile, or be inferred from the build configuration at compile time and baked in. **A
column added without a trustworthy source would be a field nobody could populate correctly, which is
worse than no field.**

⚠️ **A SECOND OPTION EXISTS AND NEEDS NO SCHEMA AT ALL: send to BOTH hosts and keep whichever
succeeds.** 🔴 **It is a real behaviour change to the send path, doubles the request count, and is
explicitly outside this task. Named for completeness only.**

**NOT BUILT. NO MIGRATION WRITTEN. NO COLUMN ADDED. RECOMMENDING NOTHING.**

---

# 🔴 VERIFICATION

| Claim | Method |
|---|---|
| **`BadDeviceToken` cannot reach `invalidTokens`** | ✅ **EXECUTED** — `grep -c "invalidTokens.push"` returns exactly `1`, in the `Unregistered` arm |
| **The classification over every reason Apple can return** | ✅ **EXECUTED** — the branch copied verbatim into a harness and run over eight batch shapes, below |
| The FCM carve-out is quoted as it stands | ✅ **EXECUTED** — read in full, unedited |
| FCM's own comment names APNs `BadDeviceToken` | ✅ **EXECUTED** — quoted |
| The manual calls `SENDER_ID_MISMATCH` the generalisation of this case | ✅ **EXECUTED** — quoted |
| The caller needs no change for the carve-out | ✅ **EXECUTED** — it nulls only `invalidTokens`, which is built here |
| `device_id` is unavailable to the sender | ✅ **EXECUTED** — the signature and the caller's `.map` both read |
| The previous task's work is intact | ✅ **EXECUTED** — census shows `U+26A0` and `U+FE0F` both unchanged at 13; the normaliser is untouched in the diff |
| **That a real `BadDeviceToken` from Apple takes this branch** | 🔴 **SOURCE READ ONLY.** **No send has ever reached Apple; the branch has never run against a real response** |
| **That the host mismatch is the live cause** | 🔴 **STILL UNPROVEN** — unchanged by this task |
| **End-to-end delivery** | ⚠️ **CANNOT BE VERIFIED until a send reaches Apple** |

## EXECUTED — the classification matrix

```
two sandbox tokens -> production host   {"sent":0,"nulled":0,"badDeviceTokens":2,"fleetSignal":true}
ONE sandbox token -> production host    {"sent":0,"nulled":0,"badDeviceTokens":1,"fleetSignal":true}
one uninstalled app (410)               {"sent":0,"nulled":1,"badDeviceTokens":0,"fleetSignal":false}
one dead + one live                     {"sent":1,"nulled":1,"badDeviceTokens":0,"fleetSignal":false}
one BadDeviceToken + one live           {"sent":1,"nulled":0,"badDeviceTokens":1,"fleetSignal":false}
all delivered                           {"sent":2,"nulled":0,"badDeviceTokens":0,"fleetSignal":false}
403 ExpiredProviderToken x2             {"sent":0,"nulled":0,"badDeviceTokens":0,"fleetSignal":false}
mixed 410 + BadDeviceToken              {"sent":0,"nulled":1,"badDeviceTokens":1,"fleetSignal":false}
```

🔴 **ROW 1 IS THE SCENARIO C3 WARNED ABOUT: two valid 64-character tokens, wrong host, `nulled: 0`.
Under the previous behaviour that row destroyed both.** ✅ **ROW 2 shows the single-device van is
protected too — the `SENDER_ID_MISMATCH` shape has no `> 1` threshold, which is exactly why it was the
right one to adopt.** ✅ **ROW 3 shows a genuinely uninstalled app is still cleaned up.**

⚠️ **The harness replicates the branch; it does not exercise `lib/apns.ts` itself, which needs a live
HTTP/2 session. It proves the DECISION, not the transport.**

---

# INTEGRITY

## Non-ASCII class census — `lib/apns.ts`

# ✅ 8 CLASSES BEFORE, 8 AFTER. NO CLASS GAINED OR LOST.

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 44 | 57 | +13 | the new comment banner |
| U+1F534 LARGE RED CIRCLE | 10 | 15 | +5 | comment prose, **plus one in the fleet-signal log string** |
| U+2014 EM DASH | 26 | 31 | +5 | comment and message prose |
| U+21D2 RIGHTWARDS DOUBLE ARROW | 2 | 4 | +2 | the `Debug ⇒ sandbox` guidance in the new message |
| **U+26A0 WARNING SIGN** | 13 | 13 | **0** | ✅ **unchanged** |
| **U+FE0F** | 13 | 13 | **0** | ✅ **unchanged — matches** |
| U+2026 · U+2192 | 4 / 2 | 4 / 2 | **0** | ✅ **untouched, incl. the `…` in `tokenTail`** |

⚠️ **`U+26A0` AND `U+FE0F` BOTH HOLDING AT 13 IS THE CHECK THAT MATTERS HERE: the previous task added
twelve paired warning signs, and this task added none and disturbed none.**

## Bare `U+26A0`

| File | BEFORE n / paired / bare | AFTER n / paired / bare |
|---|---|---|
| `lib/apns.ts` | 13 / 13 / **0** | 13 / 13 / **0** |

✅ **ZERO BEFORE, ZERO AFTER.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. The report scanned in a SEPARATE pass AFTER writing.**

```
  lib/apns.ts                                        17,118  offending=0  CR=0   (was 13,835)
  docs/apns-token-cleanup-report.md (SEPARATE PASS)   23,701  offending=0  CR=0
TOTAL OFFENDING: 0
```

⚠️ **The file grew 3,283 bytes for a change that replaced ONE line with a two-branch block. Almost all
of it is the reasoning for why `BadDeviceToken` is kept — which is the part that stops someone
"tidying" the branch back into an `||` next time.**

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 37 | 0 | 37 |
| U+1F534 LARGE RED CIRCLE | 23 | 0 | 23 |
| **U+26A0 WARNING SIGN** | **21** | **21** | ✅ **0** |
| U+2717 BALLOT X | 1 | 0 | 1 |

# ✅ EVERY WARNING SIGN IN THIS REPORT IS PAIRED — 21 OF 21, ZERO BARE.

⚠️ **This report quotes `lib/fcm.ts` and `lib/apns.ts` at length and BOTH files carry zero bare
`U+26A0`** — every warning sign in either source is already paired — **so there is no legitimate bare
glyph to quote and 0 is the correct number rather than a suppressed one.**

✅ **The report's total `U+FE0F` count is 21, which exactly accounts for the 21 paired warning signs and
leaves none attached to any other base.** ✅ **The three unpaired bases are internally consistent — 0 of
37, 0 of 23, 0 of 1 — so no base is split across two renderings.**

## `git status --porcelain`

```
$ git status --porcelain
 M docs/reference-manual.md
 M lib/apns.ts
?? docs/apns-key-fix-report.md
?? docs/apns-token-cleanup-report.md
?? docs/kds-reject-parity-report.md
?? docs/push-diagnosis-report.md
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/apns-token-cleanup-report.md`** | 🔴 **THIS TASK — the only NEW entry** |
| `M lib/apns.ts` | ⚠️ **PARTLY** — the previous task's normaliser and logging were already uncommitted here; **this task added the carve-out** |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.23 update |
| `?? docs/apns-key-fix-report.md` | ✅ pre-existing — **the task this continues, not overwritten** |
| `?? docs/push-diagnosis-report.md` · `?? docs/kds-reject-parity-report.md` | ✅ pre-existing |

✅ **Two modified and three untracked before; two modified and four untracked after. The single delta is
this report — `lib/apns.ts` was already modified.**
