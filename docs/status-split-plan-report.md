# Implementation plan — the status split and keep-state, as one change

**Plan only. Nothing built, nothing changed, no SQL, no migration, no deploy.**
**Scope:** R1, R2, R3, R9 and both PIN handlers, as a single coherent change.

---

## VERIFICATION

- **Executed:** `grep` and source reads across this repository. **That is execution of my search, not of
  the product.**
- **Not executed:** nothing was built, run, deployed or migrated. **No behaviour was observed.** Every
  line-number and handling claim below is a source read of the working tree **as it stands after
  batch 1, which is uncommitted** — line numbers have moved since the batch-1 report and are re-derived
  here.
- **No typecheck is offered as verification of anything.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 🔴 THE CONFLATION IS IN FOUR PLACES, NOT THREE

**The batch-1 report named three. Planning this properly turned up a fourth, and it is on the write
path.**

```js
// app/api/dashboard/action/route.ts:90-95
async function verifyToken(token: string, pin?: string) {
  const { data: truck } = await supabase                    // ← error DISCARDED in the destructure
    .from('trucks').select('*').eq('dashboard_token', token).single()
  if (!truck) return null                                   // ← read failed AND token absent → same null
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null   // ← AND wrong PIN → same null
  return truck
}
// :174  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
```

🔴 **THIS ONE COLLAPSES THREE CAUSES INTO ONE, NOT TWO: read failed · token absent · PIN wrong.** Every
operator action — accept, ready, collect, reject, cancel, stock — passes through it.

⚠️ **BUT ITS BLAST RADIUS IS SMALLER, AND THE DIFFERENCE MATTERS FOR SCOPE.** Action results flow
through `useGatedActionResult`, which **contains no `setError`** (verified: zero hits). **A 401 from an
action produces a failed toast, never a blank screen.** The four `setError` call sites that can blank a
surface are all on the *read* path:

```
app/dashboard/[token]/page.tsx:956   ← the 401 branch (R2)
app/dashboard/[token]/page.tsx:965   ← non-ok, pre-auth only
app/dashboard/[token]/page.tsx:1075  ← catch, pre-auth only
app/dashboard/[token]/kds/page.tsx:752 ← the KDS catch (R9)
```

**So `verifyToken` is a real defect and not a blocker for this change.** 🔴 **I have NOT added it to
scope, because you scoped this to R1/R2/R3/R9 and the PIN handlers, and widening it silently is exactly
the thing to avoid.** **My recommendation: fix it in the same change** — it is four lines, it shares the
rule, and leaving it means an operator whose backend is degraded is told "Unauthorised" every time they
touch a ticket. **Say the word and I will fold it in; I have costed it as an optional fifth item below.**

---

## 1. Every consumer of every route this change touches

### Which routes' status codes change: **exactly one — `/api/dashboard` (GET)**

**Checked, and deliberately NOT changed:**

| Route | Failure status today | Touched? |
|---|---|---|
| `/api/menu/[truckId]` | **404** `Truck not found` (`:52`) — never 401 | **No** |
| `/api/events/manage` | **404** `Truck not found` (`:22`) | **No** |
| `/api/dashboard/action` | **401** `Unauthorised` (`:174`) | **No — but see the finding above** |
| `/api/auth/me`, `/api/manage`, `/api/slots/*` | not part of this change | **No** |

### Consumers of `GET /api/dashboard` — five

| # | Consumer | File:line | Today | After |
|---|---|---|---|---|
| **1** | Dashboard `fetchAll` | `page.tsx:956` (401) · `:965` (non-ok) · `:1075` (catch) | **401 → `setError('Invalid access link')` unconditionally → blank.** Other non-ok → keep state if authenticated. | **401 → only when `!authenticatedRef.current`.** **503 → falls to `:965`, which already keeps state.** 🔴 **`:965` needs NO change — it is already correct.** |
| **2** | Dashboard `submitPin` | `page.tsx:1593` | `if(!res.ok){setPinError('Incorrect PIN')}` — **any** non-ok reads as a wrong PIN | **401 → "Incorrect PIN". 503 → "Can't reach the server — try again."** |
| **3** | **KDS `fetchAll`** | `kds/page.tsx:~582` (401) · `:~590` (non-ok) · `:752` (catch) | 🔴 **401 throws; every non-ok throws → `setError` → `:1824` full-screen replacement.** Fatal even mid-service. | **Keep the board; degraded banner. Terminal only when never loaded, or a 401 while `loadedOnceRef`.** |
| **4** | KDS `submitPin` | `kds/page.tsx:1426` | `setPinError('Incorrect PIN')` on **any** non-ok | As #2 |
| **5** | **Service worker** | `public/sw.js:113-131` | Network-first; `.catch()` only on a *network rejection*. Post-R6 it caches **only `res.ok`** | 🔴 **UNCHANGED AND CORRECT.** A 503 resolves, so `.catch()` does not fire and no stale snapshot is served **in place of a live error**; R6 already stops the 503 being cached. |

### 🔴 Would any consumer break? — **No, and here is the one that decides it**

**Consumer 3 (the KDS) is the only one that treats a non-401 as fatal** — and **R9 is in this change
specifically to fix it.** That is precisely why batch 1 stopped: shipping R1 without R9 would have moved
the KDS from "blanks on a 401" to "blanks on a 503", which is no better.

**With all five changes together, no consumer breaks:**

- **Consumer 1** already handles non-401 correctly at `:965`; it gains a 503 it handles by an existing
  path.
- **Consumers 2 and 4** currently mislabel; they gain a correct message.
- **Consumer 3** stops being fatal.
- **Consumer 5** is unaffected — a 503 is not `res.ok`, so it is neither cached nor substituted.

⚠️ **One consumer I cannot fully enumerate: anything outside this repository.** The route is
token-authenticated and I found no external caller, **but an empty grep is not proof of absence** — a
bookmarked URL or a monitoring probe hitting `/api/dashboard` would see 503 where it saw 401. **Low
risk, stated rather than assumed.**

---

## 2. The PIN handlers

### The defect

```js
// page.tsx:1593  and  kds/page.tsx:1426
if (!res.ok) { setPinError('Incorrect PIN'); return }
```

🔴 **ANY non-ok status reads as a wrong PIN — including a timeout, a 500 and (after R1) a 503.** During
the 1 September outage **an operator typing the correct PIN was told it was wrong.** R1 alone moves that
from a 401 to a 503 and **changes nothing the operator sees.**

### The correct behaviour

| Response | What the operator is told | What they can do next |
|---|---|---|
| **200** | *(unlocks)* | — |
| **401 + `requiresPin`** | **"Incorrect PIN"** — the only case that deserves it | Retype. **The only authoritative wrong-PIN answer.** |
| **401 without `requiresPin`** | **"This link is no longer valid."** | Nothing on this screen — the token is genuinely gone (§4) |
| 🔴 **503** | **"Can't reach the server right now. Your PIN is fine — try again in a moment."** | **Retry.** ⚠️ **Naming the PIN as fine is the point** — otherwise they retype a correct PIN repeatedly and conclude they are locked out |
| **Other non-ok (500/502)** | **"Something went wrong. Try again."** | Retry |
| **Aborted / network throw** | **"Can't reach the server. Check your connection and try again."** | Retry |

⚠️ **NO AUTO-RETRY ON THE PIN SCREEN.** A silent retry behind an unchanged error message is how the
current defect reads to an operator. **The button stays live and they choose.**

⚠️ **AND THE DEEPER LIMIT, STATED: the PIN is checked by the same read that fetches the truck.** During
degradation the server cannot evaluate the PIN at all — **so "your PIN is fine" means "we could not
check it", and the copy must not imply it was checked and passed.** The wording above says *can't reach
the server* first for that reason.

---

## 3. The KDS keep-state path

🔴 **This is the highest-risk change in the set. It is cook-facing, mid-service, and a stale ticket
wastes food.**

### Today

```js
:~582  if (res.status === 401) { if (data.requiresPin) {…} throw new Error(data.error ?? 'Unauthorized') }
:~590  if (!res.ok) throw new Error('Failed to fetch')
:752   } catch (e) { … setError('Could not load orders') }
:1824  if (error || !truck) return ( … {error ?? 'Truck not found'} … )
```

**Every failure throws; `:1824` replaces the whole screen.** There is no `authenticatedRef` equivalent —
batch 1 added `loadedOnceRef` for the abort case only.

### What stays on screen

**Everything.** The KDS holds `orders` in state and **nothing clears it on a failure path** — the two
`setOrders([])` calls (`:634`, `:1399` pre-batch-1 numbering) belong to the event-scope-mismatch guard,
not to error handling. **As on the dashboard, the tickets are hidden by a render gate, not discarded.**

### How staleness is shown

🔴 **NOT a toast. A persistent bar the cook cannot miss, and it must state three things:**

> **⚠️ Can't reach the server. Showing tickets from 14:32. NEW ORDERS MAY BE MISSING.**

- **Time, from the last successful fetch** — "14:32" is actionable, "stale" is not.
- 🔴 **"New orders may be missing" is mandatory.** Stale-and-complete and stale-and-incomplete are
  different risks, and **only the second can leave a customer waiting for food nobody is cooking.**
- **Visually distinct from the existing offline banner**, or the cook learns to ignore both.

⚠️ **The KDS wording *"Could not load orders"* was the honest message on the day. Keep the words for the
terminal case; the banner is a different, additive surface.**

### What a cook can and cannot do

| Allowed | Why |
|---|---|
| ✅ View every ticket already on screen | Already on the device |
| ✅ Advance status — confirm → cooking → ready → collected | The outbox is built, durable and conflict-aware; a 409 on replay flags rather than overwrites |
| ✅ Assign / clear buzzers | Local meaning, queued |
| ✅ Print a ticket | Local render |

| Blocked, visibly | Why |
|---|---|
| 🔴 **Believing the list is complete** | **The one that wastes food.** Banner, not a tooltip |
| 🔴 **Event switching to an unloaded event** | Already guarded (`loadedEventIds`) — **that guard must survive this change** |
| 🔴 **Refunds / cancel-with-refund** | Money against stale state. Out of scope here; **must not become reachable as a side effect** |
| ⚠️ Trusting stock/capacity numbers | Snapshot; show greyed with "approximate" |

### On reconnect

1. First successful fetch **clears the banner and replaces the board wholesale** — the server is
   authoritative.
2. **The outbox drains** (existing machinery, untouched).
3. 🔴 **Conflicts surface and do NOT auto-dismiss.** `useOutboxConflicts` already exists; **the KDS must
   not clear a conflict by simply re-rendering fresh data**, or a cancelled-under-you ticket disappears
   with no trace.
4. ⚠️ **A ticket that vanishes between the stale board and the fresh one needs a visible note** — "2
   orders were cancelled while you were offline" — **not a silent diff.** A cook who plated it needs to
   know.

⚠️ **Point 4 is a behaviour that does not exist today in either direction, and I am flagging it as the
part of R9 most likely to be under-scoped.**

### When the KDS still goes terminal

**Only two cases**, and both keep the existing screen and wording:

- **Never loaded** (`!loadedOnceRef.current`) — nothing to keep.
- **401 while loaded** — the token is genuinely gone (§4).

---

## 4. Revocation, once all five are in place

### The chain that makes it safe

🔴 **R1 IS WHAT GIVES 401 ITS MEANING BACK. Without it, none of the client changes are safe — and that
is why the batch-1 constraint "R1 and R2 ship together or not at all" was right.**

| After R1 | `/api/dashboard` returns |
|---|---|
| Read errored (timeout, transport, 22P02-class) | **503** — "we could not check" |
| Read succeeded, no row | **401** — **authoritative: this token does not exist** |
| Read succeeded, PIN wrong | **401 + `requiresPin`** |

**So a 401 becomes a positive statement, and the clients can act on it terminally.**

### What happens to a screen holding state when its token is revoked

1. **Rotation writes a new `dashboard_token`.** The old value now matches no row.
2. **Next poll — at most 60 seconds later** — the read **succeeds** and returns no row → **401**.
3. **Both screens treat a 401 as terminal even when loaded:** clear state, show access-denied.

> 🔴 **MAXIMUM EXPOSURE: ONE POLL INTERVAL — up to 60 seconds — and typically less.**

### The honest residuals

⚠️ **Three, none of which this change creates and none of which it removes:**

1. **A rendered page keeps rendering until its next fetch.** **There is no server push that can revoke a
   screen already painted.** Building one is out of scope and was not asked for.
2. 🔴 **If the backend is degraded AND the token is revoked at the same time, the screen holds until the
   backend recovers.** Degradation yields 503 → keep state; only a *successful* read can return the
   authoritative 401. **This is a deliberate trade: we cannot distinguish "revoked" from "unknown" while
   the database is unreachable, and blanking on "unknown" is what caused the incident.**
3. **The 60-second window is not new** — today a revoked token is also only noticed on the next poll.
   **What changes is that a degraded backend no longer produces a false revocation.**

### Is the trade acceptable?

**My reading: yes, and it is the whole point of the change.** The token is a bearer credential whose
revocation response is rotation, rotation takes effect within one poll, and **the alternative — treating
every unreachable database as a revocation — is what put "Access denied" on a trading truck's board for
two and a half hours.**

⚠️ **But it IS a security decision and it is yours.** Stated so it is decided rather than inherited.

---

## 5. File-by-file change list, ordered so no intermediate state is worse

🔴 **THE ORDERING CONSTRAINT: R1 must land in the SAME DEPLOY as the client changes, never before or
after in a separate one.** Both single-sided orders leave a window:

- **R1 alone:** the dashboard's `:965` keeps state on a 503 (fine), **but both PIN handlers now say
  "Incorrect PIN" over a 503, and the KDS still blanks.** Two surfaces no better, one message wrong.
- **Clients alone (R2/R3/R9 without R1):** a 401 during degradation is treated as transient — **so a
  genuinely revoked token leaves a working board up indefinitely.** 🔴 **This is the dangerous one.**

> ✅ **THEREFORE: ONE DEPLOY, ALL FIVE. The order below is authoring order within that single change.**

| # | File | Change | Live-surface risk |
|---|---|---|---|
| **1** | `app/api/dashboard/route.ts:88-95` | **R1.** Split: `if (error) → 503 { error: 'Service unavailable', retryable: true }`; `if (!truck) → 401 { error: 'Invalid token' }`. Keep the existing `console.error` and **add which branch fired**. | **LOW in isolation.** Every consumer's behaviour is enumerated in §1. |
| **2** | `app/dashboard/[token]/page.tsx:956` | **R2.** `if(res.status===401 && !authenticatedRef.current)` → error; else warn + keep state. **`requiresPin` handling unchanged.** | **LOW.** Matches the three sibling branches. |
| **3** | `app/dashboard/[token]/page.tsx:2828` | **R3.** `if(error && !authenticated)` → full-page; else render the board **plus a degraded banner**. | **MEDIUM.** The board now renders where it previously did not. |
| **4** | `app/dashboard/[token]/page.tsx:1593` | **PIN.** Branch on status per §2. | **LOW.** Copy + branching only. |
| **5** | `app/dashboard/[token]/kds/page.tsx:~582, ~590, 752, 1824` | **R9.** `authenticatedRef` equivalent; stop throwing on non-ok; terminal only when never-loaded or an authoritative 401; degraded banner. | 🔴 **HIGHEST. Cook-facing, mid-service.** |
| **6** | `app/dashboard/[token]/kds/page.tsx:1426` | **PIN.** As #4. | **LOW.** |
| **7** | *(optional, recommended)* `app/api/dashboard/action/route.ts:90-95, 174` | **`verifyToken`:** bind `error`; return a discriminated result so the route can answer **503** for a failed read, **401** for absent, **401+`requiresPin`** for a wrong PIN. | **LOW–MEDIUM.** Touches every operator action, so it needs its own pass — **but it is the same rule.** |

⚠️ **Batch 1 is uncommitted in this same tree.** These build on `inFlightRef`, `READ_TIMEOUT_MS` and
`loadedOnceRef`. **Shipping this change means shipping batch 1 with it** — one deploy, and a store review
is in progress.

---

## 6. The failing case for each — on a device, against a degraded backend

### Simulating the degradation

🔴 **The rig is the hard part, and without it every test passes for the wrong reason.** The failure mode
is **reachable-but-slow**: `/api/ping` fast while `/api/dashboard` is not. **Airplane mode tests
something else entirely.**

| Method | Fidelity |
|---|---|
| **On-device proxy (Charles / mitmproxy on the tablet's wifi) with a delay or 503-injection rule on `/api/dashboard` only** | 🔴 **The only rig that reproduces the incident.** Use this. |
| Preview deployment with a temporary `if (process.env.FORCE_503)` in the route | Good for status-code tests; **never on production** |
| Rotating `dashboard_token` in the DB | **The only way to test revocation honestly.** ⚠️ Do it on the tester truck, **never on Pizzeria Gusto** |
| `setSimulatedOffline(true)` | ⚠️ **Dev-only, and it tests OFFLINE.** **Not a substitute.** |

### The cases

| # | Change | 🔴 Must bite |
|---|---|---|
| **T1** | **R1** | Inject a read failure. **Response is 503, not 401**, and the log names the error branch. **Counter-test T2 must still give 401.** |
| **T2** | **R1** | Call with a **garbage token** against a *healthy* backend. 🔴 **Must still be 401.** **Without this, T1 passes for a route that 503s on everything.** |
| **T3** | **R2+R3** | Load the dashboard, **then** inject 503s. **Board stays; degraded banner with a time; "Access denied" never appears.** |
| **T4** | **R2+R3** | Load the dashboard, **then rotate the token in the DB.** 🔴 **Within one poll (≤60s) the board must CLEAR and show access-denied.** **This is the security counter-test; without it T3 only proves the screen never blanks.** |
| **T5** | **R9** | Same as T3 on the **KDS**, with tickets on screen. **Tickets stay; banner names the time and says new orders may be missing.** |
| **T6** | **R9** | Same as T4 on the KDS. **Must go terminal.** |
| **T7** | **R9 reconnect** | With the KDS stale, **cancel an order server-side**, then restore. **The ticket disappears AND the cook is told** — §3 point 4. **A silent diff is a fail.** |
| **T8** | **PIN handlers** | Sign out to the PIN screen, inject 503s, **enter the CORRECT PIN.** 🔴 **Must NOT say "Incorrect PIN."** |
| **T9** | **PIN handlers** | Healthy backend, **enter a WRONG PIN.** 🔴 **Must still say "Incorrect PIN."** **T8 without T9 is satisfied by deleting the message.** |
| **T10** | **SW (regression)** | Inject a 503, then inspect Cache Storage. **`DATA_CACHE` unchanged** (R6), **and no stale snapshot served in place of the 503.** |
| **T11** | *(if #7 taken)* | Inject a read failure, **tap Ready.** **Toast must not say "Unauthorised."** |

🔴 **T2, T4, T6 and T9 are the counter-tests, and they are the half most likely to be skipped.** Every
one of them exists because the corresponding positive test can be passed by simply removing a behaviour.

---

## 7. What can be verified without hardware, and what cannot

### Without hardware — a browser and a proxy are enough

| Test | Why |
|---|---|
| **T1, T2** | Server-side; `curl` against a preview deployment |
| **T3, T4** | Desktop Chrome + DevTools request blocking/override. **The dashboard is not native-specific** — `nativeAuthHeader()` returns `{}` on web and the code path is otherwise identical |
| **T8, T9** | Same |
| **T10** | Desktop DevTools → Application → Cache Storage. ⚠️ **Proves the SW logic; does NOT prove the SW is active in a WebView** |

**So the whole status split and both PIN handlers are verifiable on a laptop.**

### Requires hardware — and cannot be substituted

| Test | Why not |
|---|---|
| 🔴 **T5, T6, T7 (the KDS)** | **The KDS is a physical kitchen screen.** A desktop browser cannot show whether a banner is noticeable to a cook two feet away with wet hands mid-service — **and "is this missable?" is the actual acceptance criterion**, not "does it render". |
| 🔴 **Whether the service worker is active in either WebView** | **Never established.** Registration is *called* (`page.tsx:205`, `kds:877`); that is not the same as active. **T10 on desktop does not answer it, and R6's value depends on it.** |
| **Outbox durability across an app kill** | Preferences/NSUserDefaults is native-only |
| **Whether the degraded banner survives backgrounding** | Android reclaims WebView memory; **desktop cannot reproduce it** |
| **The real end-to-end timing of T4/T6** | The 60s poll under a real network |

### 🔴 The honest split

**Roughly 70% of this set — every status code, both PIN handlers, the dashboard keep-state, and the
revocation counter-test — is verifiable without touching a tablet.** **The remaining 30% is the KDS, and
it is both the riskiest change and the one that cannot be signed off on a laptop.**

⚠️ **This argues for splitting the DEPLOY only if you are willing to leave the KDS blanking for another
cycle** — which was batch 1's stopping point and is still the open question. **My recommendation stays
one deploy, with T5–T7 walked on the physical tablet before it ships.**

---

## What I could not establish

1. **Whether any consumer outside this repository calls `/api/dashboard`.** Found none; **an empty grep
   is not proof.**
2. **Whether the service worker is active in either WebView.** **Unverified**, and R6/T10 depend on it.
3. **How the KDS behaves when `orders` is held but the event-scope guard fires.** Read the guard; **did
   not run it.** T7 is where it would show.
4. **Whether any operator relies on the current PIN-error wording** to mean "server down". **Unlikely,
   not established.**
5. **The real cost of item #7 (`verifyToken`).** Read the function; **did not trace every one of the
   route's action branches for a second 401 source.**
6. **That any of this behaves as described.** **Nothing has been built or run. This is a plan.**
