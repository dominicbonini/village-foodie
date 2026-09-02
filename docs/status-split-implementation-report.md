# Status split + keep-state — implementation report

**All six items implemented. Nothing committed, nothing deployed, no SQL, no migration.**

---

## VERIFICATION — read this before the item list

- **`npx tsc --noEmit` → exit 0.** **`eslint` on all four files → identical problem counts to the
  pre-change backups** (page.tsx 109→109, kds 21→21, route.ts 17→17, action/route.ts 20→20).
- 🔴 **THESE ARE BUILD-BREAKAGE SANITY CHECKS AND NOTHING MORE. THEY ARE NOT VERIFICATION.** A
  typecheck cannot tell you a cook sees a banner, that a revoked token still ejects, or that a 503 is
  not reported as a wrong PIN. **Nothing in this change has been run in a browser, on a tablet, or
  against a degraded backend.** The runbook at the end is the actual verification and it has not been
  executed.
- **No span of the prompt arrived garbled. No instruction contradicted another** — the optional sixth
  item was explicitly authorised, so nothing needed stopping on.

### 🔴 Two defects I introduced and caught with those checks — recorded, not hidden

1. **I broke the dashboard build.** My R3 banner anchor matched a *prefix* of a long line, so the
   insertion landed **inside** an existing JSX comment, truncating it and leaving `{/*` unclosed
   (`TS17008: JSX element 'main' has no corresponding closing tag`). **Repaired by restoring the
   original comment byte-for-byte from the backup and placing the banner after it.**
2. **My first R9 gate read a ref during render** — `if ((error && !loadedOnceRef.current) || !truck)`.
   `eslint` flagged *Cannot access refs during render* (1 → 6). ⚠️ **This was a real bug, not a lint
   nit: a ref read in render neither triggers a re-render nor is guaranteed current, so the terminal
   gate could have failed to update.** **Fixed by mirroring the fact into `hasLoaded` state** — the ref
   still serves the closure reads inside `fetchAll`, where a ref is correct. Count back to the
   pre-existing 1.

**Both are the kind of thing only running the code finds. They are the argument for the runbook, not a
substitute for it.**

---

## The six items

### 1 · R1 — `GET /api/dashboard` · `app/api/dashboard/route.ts:86-118`

**Was:** `.single()` then `if (error || !truck) → 401 'Invalid token'`.

🔴 **`.single()` → `.maybeSingle()`, and the change is load-bearing.** `single()` raises `PGRST116` for
**zero rows**, so `error` conflated "no such token" with "the database did not answer" — **the exact
distinction this route exists to make.** `maybeSingle()` returns `{data: null, error: null}` for no
rows, making the two structurally separable rather than requiring a string match on an error code.

```ts
if (error)  → 503 { error: 'Service unavailable', retryable: true }, Retry-After: 10
if (!truck) → 401 { error: 'Invalid token' }
```

Both branches log, and **the log now names which branch fired** and the last 6 characters of the token.

**What an operator sees:** nothing directly — but every downstream message stops lying.
**Failing case:** **T2** — a garbage token against a *healthy* backend must still return **401**. Without
T2, T1 passes for a route that 503s on everything.

---

### 2 · verifyToken — `app/api/dashboard/action/route.ts:90-110, 187-201`

**The one you authorised, and it was the worst of the four: three causes into one 401, one of them a
credential check.**

**Was:** `{ data: truck }` (error discarded) → `if (!truck) return null` → and a wrong PIN returned the
same `null` → route answered **401 Unauthorised** for all three.

**Now** returns an inferred discriminated union — `unavailable` / `no_truck` / `bad_pin` — and the call
site maps them:

```ts
'unavailable' → 503 { retryable: true }
'bad_pin'     → 401 { error: 'Invalid PIN', requiresPin: true }
'no_truck'    → 401 { error: 'Unauthorised' }
```

⚠️ **The return type is INFERRED, not annotated.** An explicit alias needed `truck: any`, which added a
lint error and would have lost every field the call site reads. `as const` on the discriminants gives
the same narrowing with no `any`.

**What an operator sees:** during degradation, an action no longer answers **"Unauthorised"** — a
statement about their credential that was false in the only case that occurred. ⚠️ **The visible change
is small because action failures were already toasts, not screen-blanks** (`useGatedActionResult`
contains no `setError`) — but the *claim* is now true.
**Failing case:** **T11** — inject a read failure, tap Ready, the toast must not say "Unauthorised".

---

### 3 · R2 — the dashboard's 401 branch · `page.tsx:964-983`

**Was the only one of four sibling failure branches that did not consult `authenticatedRef`.**

**Now:** `requiresPin` handling unchanged; a 401 is **terminal and clears auth state**
(`setAuthenticated(false); authenticatedRef.current=false`), because after R1 a 401 is authoritative —
it means the token was rotated. **A 503 never reaches here**; it falls to the non-ok branch at `:990`,
**which you established already keeps state and which I did not touch.**

Also added: `if(res.ok) setDegradedSince(null)` — any successful answer clears the strip.

**What an operator sees:** 🔴 **the board no longer disappears when the database is unreachable.**
**Failing case:** **T4** — rotate the token in the DB; within one poll (≤60s) the board **must clear**.

---

### 4 · R3 — the render gate + the degraded strip · `page.tsx:282-289, 990, 1094-1098, 2846, 3024-3035`

- **New state `degradedSince`** (`:282`). 🔴 **Derived from this route's own fetch outcomes, NOT from
  `isOnline()`** — the reachability probe pings `/api/ping`, which does no auth and no database work, so
  on 1 September it stayed green at ~106ms while this route took a median of 148 seconds. **Deliberately
  not wired to `lib/native/reachability.ts`: that is batch 2 and separately gated.**
- **Set** on the non-ok branch, on an abort, and on a post-auth throw.
- **The gate** (`:2846`) is now `if(error && !authenticated)`. **The orders were never lost on
  1 September — they sat in React state behind this gate.**
- **The strip** (`:3024`), amber, above the app shell:

> **Can't reach the server. Showing orders from 14:32. New orders may be missing.**

🔴 **"New orders may be missing" is the load-bearing half** — stale-and-complete and stale-and-incomplete
are different risks and only the second costs a customer their food. ⚠️ **It never says anything is
"saved", because rendering it saves nothing.**

**Failing case:** **T3** — load, then inject 503s: board stays, strip shows a time, "Access denied"
never appears.

---

### 5 · Both `submitPin` handlers · `page.tsx:1618-1634`, `kds/page.tsx:1466-1475`

**Was, on both:** `if(!res.ok){ setPinError('Incorrect PIN') }` — **any** non-ok, including a timeout, a
500, and (after R1) a 503.

| Status | What the operator now sees |
|---|---|
| **503** | **"Can't reach the server right now. Your PIN is fine — try again in a moment."** |
| **401 + `requiresPin`** | **"Incorrect PIN"** — the only case that earns it |
| **401** (no `requiresPin`) | **"This link is no longer valid."** |
| other non-ok | **"Something went wrong. Try again."** |

⚠️ **The 503 copy leads with reachability on purpose.** The route validates the PIN against the truck
row it could not fetch — **so "your PIN is fine" means "we could not check it", and the wording must not
imply it was checked and passed.**
⚠️ **No auto-retry.** A silent retry behind an unchanged message is how the old defect read; the button
stays live and the operator chooses.

**Failing case:** **T8** (503 + correct PIN must not say "Incorrect PIN") **and its counter-test T9**
(healthy + wrong PIN must still say it).

---

### 6 · R9 — the KDS keep-state path · `kds/page.tsx:476-486, 604-637, 668, 787-800, 1867, 1877-1886`

🔴 **The highest-risk change here. Cook-facing, mid-service, and a stale ticket wastes food.**

**Was:** 401 threw, **every non-ok threw**, both landed on `setError` → `if (error || !truck)` replaced
the whole screen. Fatal even with a full board of live tickets.

**What stays on screen: everything.** The KDS holds `orders` in state and **nothing clears them on a
failure path** — as on the dashboard, a render gate hid them.

| | Behaviour now |
|---|---|
| **401** (authoritative) | Clears `loadedOnceRef` + `hasLoaded`, sets `error`, **goes terminal — even mid-service.** Token rotated ⇒ the board must go. |
| **Non-ok (503/5xx)** | **Board kept**, degraded strip raised. Terminal only if never loaded. |
| **Abort / thrown fetch** | **Board kept** if loaded (widened from batch 1's abort-only case). |
| **Never loaded** | **`setError('Could not load orders')` — wording kept verbatim.** It was the honest message on the day. |

**New state:** `degradedSince`, `lastRefresh` (the KDS had **neither** — no record of when the board was
fetched), and `hasLoaded` (the render-safe mirror; see the second caught defect above).

**The strip**, topmost, amber, **deliberately a different colour and wording from `OfflineBanner`
below it** — a cook who learns to ignore one must not thereby ignore the other:

> **⚠️ Can't reach the server. Showing tickets from 14:32. NEW ORDERS MAY BE MISSING.**

**What a cook can do against stale data:** view every ticket; advance status; assign/clear buzzers;
print. **These queue through the existing outbox, which I did not touch.**
**What they cannot:** trust the list is complete (the strip says so); switch to an unloaded event (the
existing `loadedEventIds` guard is untouched); reach refunds (out of scope and not made reachable).

**On reconnect:** the first successful fetch clears the strip and replaces the board wholesale — the
server is authoritative — and the outbox drains through its existing machinery.

⚠️ 🔴 **ONE THING THE PLAN SPECIFIED THAT I HAVE NOT BUILT, AND IT MATTERS.** §3 point 4 of the plan
said a ticket that vanishes between the stale board and the fresh one **needs a visible note** ("2 orders
were cancelled while you were offline") rather than a silent diff. **That does not exist today in either
direction, and building it means diffing two board snapshots and adding a notice — new behaviour beyond
the six items you scoped.** **I did not build it and I am not going to pretend the reconnect story is
complete without it.** A cook who plated a cancelled order still finds out by the ticket simply being
gone.

**Failing case:** **T5** (tickets stay under 503s) with **counter-test T6** (rotate the token → must go
terminal) and **T7** (cancel server-side while stale → the ticket disappears on reconnect; **this is the
one expected to reveal the gap above**).

---

## Interaction with batch 1 (R4–R7)

**Batch 1 is in the same working tree, unverified and undeployed. I did not modify it.** Confirmed:
`inFlightRef` present in both pages, `maxDuration = 30` intact, `sw.js` `res.ok` check intact
(`git diff` on `sw.js` unchanged at 12 insertions).

| Interaction | Effect |
|---|---|
| **R5's abort → R3/R9 degraded** | An abort now **also** raises the degraded strip. Batch 1 only logged it. **Additive; the abort logic is untouched.** |
| **R5's `loadedOnceRef`** | R9 **reuses** it and adds `hasLoaded` beside it. **The batch-1 line that sets it is unchanged**; my `setLastRefresh`/`setHasLoaded` sit after it. |
| **R4's in-flight guard** | Unaffected. It drops polls before any status is seen. |
| **R6's `res.ok` cache check** | 🔴 **Now more valuable:** a 503 is not `res.ok`, so it is neither cached nor substituted for a live error. **Without R6 this change would have written 503s into `DATA_CACHE`.** |
| **R7's `maxDuration = 30`** | Unaffected; R5's 10s client abort still fires first. |

🔴 **THEY SHIP TOGETHER OR NOT AT ALL.** Both sets are in one working tree, and **the clients-without-R1
window you identified is now closed only because R1 is in the same tree.**

---

## Scope

| Check | Result |
|---|---|
| Files changed by this task | **4:** `api/dashboard/route.ts`, `api/dashboard/action/route.ts`, `dashboard/[token]/page.tsx`, `dashboard/[token]/kds/page.tsx` |
| Batch 2 machinery | **Untouched** — verified by `git diff --quiet`: `reachability.ts`, `orderGate.ts`, `outbox.ts`, `network.ts`, `OfflineBanner.tsx`, `useGatedActionResult.tsx` |
| `:990` non-ok branch | **Not changed**, as you established |
| "Saved" claims | **None added.** The only new strings are two strips and four PIN messages; **not one asserts anything is stored.** |
| Committed / deployed | **Neither.** |

⚠️ `docs/reference-manual.md` and `public/sw.js` also show modified — **from the earlier V11.55 delta and
batch 1 respectively, not this task.**

---

# VERIFICATION RUNBOOK

**Tomorrow, laptop + physical Android tablet. Counter-tests first: a positive test can be passed by
deleting the behaviour; only these fail for the right reason.**

## Setting up a degraded backend

🔴 **The failure is reachable-but-broken. Airplane mode tests something else entirely and will make
every step below pass for the wrong reason.**

- **METHOD A — status injection (use for most steps).** Deploy to a **preview** URL with a temporary
  `if (process.env.FORCE_503) return NextResponse.json({error:'Service unavailable',retryable:true},{status:503})`
  at the top of `GET /api/dashboard`. ⚠️ **Preview only. Never production.**
- **METHOD B — latency injection (use for T3/T5 realism).** Charles or mitmproxy on the tablet's wifi,
  **delay rule on `/api/dashboard` only**, 60s. Leave `/api/ping` untouched.
- **METHOD C — revocation (T4, T6).** Rotate `dashboard_token` in the DB. 🔴 **Tester truck only. NEVER
  Pizzeria Gusto.**

---

## THE COUNTER-TESTS — run these first

**1. [LAPTOP] T2 — a bad token still 401s.**
`curl -i "<preview>/api/dashboard?token=garbage-not-a-real-token"` against a **healthy** backend.
**PASS:** `401`, body `{"error":"Invalid token"}`.
**FAIL:** `503`, or `401` with `retryable`. *(A 503 here means the split inverted and every bad token now
looks like an outage.)*

**2. [LAPTOP] T9 — a wrong PIN is still "Incorrect PIN".**
Healthy backend, PIN-protected truck, enter a **wrong** PIN.
**PASS:** "Incorrect PIN".
**FAIL:** any reachability wording. *(T8 alone is satisfied by deleting the message.)*

**3. [TABLET] T4 — a revoked token still ejects the dashboard.**
Load the dashboard, confirm orders. Rotate the token (Method C). Wait for the poll.
**PASS:** within ≤60s the board **clears** and shows the full-page access-denied screen.
**FAIL:** the board persists past ~90s. 🔴 **This is the security counter-test. If it fails, do not
ship — R2/R3 have made revocation ineffective.**

**4. [TABLET] T6 — a revoked token still ejects the KDS.**
Same, on the KDS with tickets on screen.
**PASS:** goes terminal within ≤60s.
**FAIL:** tickets persist. **Same stop condition.**

---

## THE POSITIVE TESTS

**5. [LAPTOP] T1 — a failed read returns 503.** `FORCE_503` on (Method A), `curl -i` with a **valid**
token. **PASS:** `503`, `retryable: true`, `Retry-After: 10`. **FAIL:** `401`.

**6. [LAPTOP] T3 — the dashboard keeps its board.** Load in Chrome, confirm orders, then enable
Method A (or B). Wait 2 polls (~2 min).
**PASS:** orders still on screen; **amber strip naming a time and saying "New orders may be missing"**;
"Access denied" never appears. **FAIL:** the board blanks, or the strip has no time.

**7. [LAPTOP] T8 — a correct PIN during a 503.** Sign out to the PIN screen, Method A on, enter the
**correct** PIN.
**PASS:** "Can't reach the server right now. Your PIN is fine — try again in a moment."
**FAIL:** "Incorrect PIN". 🔴 **This is the operator-facing defect that started this work.**

**8. [TABLET] T5 — the KDS keeps its tickets.** Load the KDS with a live board, enable Method B (60s
delay), wait 2 polls.
**PASS:** tickets remain; **amber strip, topmost, visually distinct from `OfflineBanner`**;
"Could not load orders" does **not** replace the board.
**FAIL:** the board blanks. ⚠️ **Also judge, standing back from the screen at working distance: is the
strip actually noticeable? "Renders" is not the acceptance criterion — "a cook cannot miss it" is.**

**9. [TABLET] T11 — an action during degradation.** With Method A on, tap **Ready** on a ticket.
**PASS:** the toast does **not** say "Unauthorised"; **and the op is queued or fails honestly — it must
not claim to be saved unless the outbox took it.**
**FAIL:** "Unauthorised", or any "saved" wording with an empty queue.

**10. [TABLET] T7 — reconnect and the vanishing ticket.** With the KDS stale (Method B), **cancel an
order server-side**. Restore the network.
**PASS:** strip clears, board refreshes, the cancelled ticket is gone.
🔴 **EXPECTED PARTIAL FAIL: the cook gets NO notice that it was cancelled.** That gap is named above and
is not built. **Record what you observe; do not mark it green.**

**11. [TABLET] T10 — the cache is not poisoned.** Method A on, then Web Inspector → Storage → Cache
Storage.
**PASS:** `DATA_CACHE` unchanged, and no stale snapshot served in place of the 503.
**FAIL:** a 503 in the cache. ⚠️ **This also finally establishes whether the service worker is active in
the WebView at all — never verified, and R6's value depends on it.**

**12. [TABLET] T-batch1 — no regression in the guard.** Method B on, watch the network trace 3 minutes.
**PASS:** never more than **one** `/api/dashboard` in flight. **FAIL:** two or more. 🔴 **Counting zero
means nothing ran — re-check the rig, do not record a pass.**

---

## Stop conditions

🔴 **Do not ship if step 3 or 4 fails** — revocation is broken and the token is a full credential.
⚠️ **Reconsider if step 8's strip is judged missable by a cook** — a stale board nobody notices is worse
than a blank one.

---

## What I could not establish

1. **That any of this behaves as described.** **Nothing has been run.** tsc and eslint are sanity checks.
2. **Whether the service worker is active in either WebView.** Step 11 settles it.
3. **Whether the KDS strip is noticeable mid-service.** **Cannot be judged on a laptop** — step 8.
4. **Whether a 503 from `/api/dashboard/action` is handled gracefully by every action caller.** I read
   that `useGatedActionResult` has no `setError`; **I did not trace all ~20 action branches** — step 9
   samples one.
5. **The real revocation timing.** Reasoned from the 60s poll; steps 3–4 measure it.
