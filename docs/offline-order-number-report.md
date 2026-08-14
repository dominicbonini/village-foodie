# The missing order number — fixed by making the queue decision the authority

Date: 14 August 2026 · supersedes the diagnosis of the same name
**EDITED: 1 file.** `components/dashboard/AddOrderPanel.tsx` — **+25 / −2**, one derived constant.
`tsc --noEmit`: exit 0 · **0 NUL, 0 control bytes < 0x09** · **no codepoint class gained or lost.**

No `next dev`, no `next build`, no `cap sync`, no deploy, no commit.
**No span of the prompt arrived garbled. No instruction contradicted another.**

---

# THE CHANGE

```diff
       if (result.queued) {
+        const displayId = provisional || await nextProvisionalId()
         const optimistic = {
-          id: provisional, order_key: orderKey,
+          id: displayId, order_key: orderKey,
…
-        showToast(`Order ${provisional} saved on this device — will sync when back online`, 'success')
+        showToast(`Order ${displayId} saved on this device — will sync when back online`, 'success')
```

🔴 **`result.queued` is now the authority — the thing that queued the order decides whether it gets a
placeholder.** `provisional ||` keeps route 1 byte-identical; the fallback mints one for route 2, the
window where reachability still said online.

---

# PART A — THE SEQUENCING, CONFIRMED

## A1. `AddOrderPanel.tsx:1027-1123` — the three decision points, quoted

**The number is decided here, `:1028-1031`:**
```ts
      // Client-mint the identity so an OFFLINE create is idempotent on replay (order_key) and carries a
      // stable device-prefixed provisional number until the server assigns the real one.
      const orderKey = newUuid()
      const provisional = isOnline() ? '' : await nextProvisionalId()
```

**It is baked into the BODY here, `:1045-1047`** — and this is the constraint that shapes the whole fix:
```ts
        // Offline → send the device-prefixed provisional (e.g. 'M3') so the server KEEPS it as the permanent
        // display id (skips its counter) → no renumber on sync. Online → '' → null → server assigns normally.
        provisional_id: provisional || null,
```

**The queue decision happens here, `:1102-1106`:**
```ts
      const result = await gatedAction({
        url: '/api/dashboard/action',
        kind: 'create', order_key: orderKey, provisional_id: provisional, online: isOnline(),
        body: { token, pin, action: 'manual', manualOrder },
      })
```

**And the optimistic object was built here, `:1110-1112` (before the edit):**
```ts
      if (result.queued) {
        const optimistic = {
          id: provisional, order_key: orderKey,
```

🔴 **`provisional` was consumed THREE times — body, op, card — and all three inherited one guess made
before anything had been attempted.**

## A2. ✅ `GateResult` REPORTS IT, AND IT IS AVAILABLE IN TIME. The fix shape is right.

**READ, `lib/native/orderGate.ts:153-160`:**
```ts
export interface GateResult {
  ok: boolean          // server accepted the write
  queued: boolean      // stored offline for later replay (optimistic local state should be applied)
  status?: number      // server HTTP status when a response was received
  data?: any           // parsed server JSON when ok
  provisional_id?: string  // device-prefixed display number for an offline-created order
  order_key: string
}
```
✅ **`queued: boolean` — and its own comment says what it is for: *"optimistic local state should be
applied"*.** It is returned by `await gatedAction(...)` at `:1102` and tested at `:1110`, **so it is
available before the optimistic object is constructed.** **No STOP required.**

⚠️ **`GateResult.provisional_id` is an ECHO of what was passed in, not a value the gate derived** — it
carries `''` on route 2, so it could not have been used as the source of truth. **The useful field is
`queued`.**

## A3. The N-sequence generator — and it CAN be called after `gatedAction`

**READ, `lib/native/orderGate.ts:166-173`:**
```ts
export async function nextProvisionalId(): Promise<string> {
  const letter = await deviceLetter()
  const cur = parseInt((await Preferences.get({ key: PROV_SEQ_KEY })).value ?? '0', 10) || 0
  const next = cur + 1
  await Preferences.set({ key: PROV_SEQ_KEY, value: String(next) })
  return `${letter}${next}`
}
```
- **Increments:** every call, by one, persisted to `hg_prov_seq` in Capacitor Preferences.
- **Resets:** 🔴 **NOTHING resets it.** `seedProvisionalSeq` only ever RAISES it
  (`if (highestKnown > cur)`); an app uninstall wipes Preferences and takes it with it (§36).
- ✅ **Callable after `gatedAction`:** it is a plain async function reading and writing device storage,
  with **no dependency on request state, ordering or the network.** `submitManual` is already `async`
  and already `await`s inside the `result.queued` branch's caller scope.

---

# PART B — THE COUNT DISCREPANCY (report only, as instructed)

## B1. ✅ **BOTH ROUTES ENQUEUE IDENTICALLY. There is no discrepancy.**

**READ, `lib/native/outbox.ts:177-179`:**
```ts
export async function countPendingOps(): Promise<number> {
  return (await listOps()).filter(o => o.state !== 'conflict').length
}
```
🔴 **The only predicate is `state !== 'conflict'`.** It does not look at how the op arrived.

**And both routes go through the SAME closure — `orderGate.ts:206-211`:**
```ts
  const queue = async (): Promise<GateResult> => {
    const queuedBody = { ...body, ...(expectedFrom ? { expected_from: expectedFrom } : {}), ...(queuedExtra ?? {}) }
    await enqueue({ kind, order_key, url, body: queuedBody, provisional_id })
    return { ok: false, queued: true, provisional_id, order_key }
  }
```
**Route 1 (`online === false`) and route 2 (the `catch`) both `return queue()`.** ✅ **One `enqueue`, one
op shape, one `state`.**

## B2. ✅ **A ROUTE-2 ORDER IS COUNTED. The concern is unfounded — stated plainly.**

The op is stored by the same call with the same fields, so it appears in `countPendingOps()` and
therefore in the offline banner's *"{n} orders saved on this device"*. **An operator reconnecting is not
under-counted.**

⚠️ **The count has a DIFFERENT pre-existing flaw, already recorded in §11:** it counts every op kind —
`create | status | edit | stock | buzzer` — while the banner labels it *"orders"*. **Unchanged by this
task and not fixed here.**

---

# PART C — THE EDIT

## C1. ✅ Both queue routes now produce an N-prefixed placeholder

```ts
        const displayId = provisional || await nextProvisionalId()
```

| Route | `provisional` | `displayId` | Card |
|---|---|---|---|
| **1. Known-offline** | `'N7'` | `'N7'` — the `||` short-circuits, **nothing new is minted** | `#N7` |
| 🔴 **2. Thrown fetch** | `''` (falsy) | **`'N8'` — minted here** | **`#N8`**, was a bare `#` |
| **Online, sent** | `''` | 🔴 **never evaluated** — the block is inside `if (result.queued)` | server's number |

## C2. ✅ An order that genuinely sent is UNAFFECTED — by position, not by a condition

🔴 **The new line is INSIDE `if (result.queued) { … }`.** When the POST succeeds, `gatedAction` returns
`{ ok, queued: false, status, data, … }` (`orderGate.ts:217-219`), the branch is not entered, **and
`displayId` is never evaluated — so `nextProvisionalId()` is never called and `hg_prov_seq` never
advances.** The order takes its server-assigned number exactly as today.

✅ **This is stronger than a guard: the code cannot run on the online path.**

## C3. ✅ The server's truthy test still gives a route-2 order a normal sequential number

**READ, `app/api/dashboard/action/route.ts:1426-1436` — unchanged, and untouched by this task:**
```ts
        const provisionalId: string | null =
          typeof manualOrder?.provisional_id === 'string' && manualOrder.provisional_id ? manualOrder.provisional_id : null
        if (provisionalId) {
          newOrderId = provisionalId
        } else {
          try {
            newOrderId = await nextOrderId(orderEventId, truck.id)
```

🔴 **THE BODY WAS BUILT AT `:1039`, BEFORE ANYTHING WAS ATTEMPTED, AND IS ALREADY IN THE OUTBOX.** For
route 2 it carries `provisional_id: '' || null` → **`null`** → the truthy test fails → the order takes
`nextOrderId(...)`, the ordinary per-event sequential. ✅ **Exactly as before this change.**

> ### ⚠️ THE RESULTING ASYMMETRY, STATED PLAINLY BECAUSE IT IS REAL
> **A route-1 order KEEPS its N-number permanently** (the body carried it). **A route-2 order shows
> `N8` on the device and becomes `#7` when it syncs.** The number an operator writes on a bag may not
> be the number the order ends up with.
>
> 🔴 **This is inherent, not a choice I made:** the queued payload was written before the failure was
> known, and rewriting it would mean editing an op already in the outbox — **the outbox's business, and
> out of scope.** **It is strictly better than the bare `#` it replaces**, which could not be written on
> a bag at all.

## C4. Collision risk (earlier report's B4) — ⚠️ **MARGINALLY MORE LIKELY, and only for display**

**The direction, as asked, without attempting a solution:**

- 🔴 **MORE LIKELY, marginally.** Route-2 orders now mint N-numbers where previously they minted none, so
  `hg_prov_seq` advances more often per device. Two devices sharing a letter (a 1-in-26 hash collision,
  `outbox.ts:101-111`) have slightly more opportunities to land on the same value.
- ✅ **The consequence is unchanged and remains display-only.** `order_key` is a client-minted UUID, the
  server upserts on it, and `id` is never a lookup key. **Two identical placeholders would confuse an
  operator; they could not merge, overwrite or lose an order.**
- ⚠️ **And route-2 duplicates are TRANSIENT** — they are replaced by server sequentials on sync (C3),
  so a collision survives only until the drain.

**Not solved here, per the brief.**

---

# PART D — BOUNDARIES

## D1. `git diff --stat`

```
 components/dashboard/AddOrderPanel.tsx |  27 +-
 docs/reference-manual.md               | 498 ++++++++++++++++++++++++++++++++-
```
```
$ git status --porcelain lib/payments lib/native components/dashboard/OrderCard.tsx app/dashboard/[token]/kds/page.tsx
(no output)
```
🔴 **The ledger, the gate (`lib/native/orderGate.ts`), the outbox, the drain, `OrderCard.tsx` and the
KDS are ALL untouched — proven by `git status`, not asserted.** ⚠️ `docs/reference-manual.md` is the
**V11.17 manual update from the previous task**, not this one.

## D2. What changes for each live operator

**Pizzeria Gusto:** a walk-up placed in the ~30 seconds before the iPad admits it is offline now shows a
proper `#N`-number instead of a bare `#`, so it can be called out and written on a bag — **with nothing
changed for orders that send normally.**

**Tikka Tonic:** identical, since both run the same panel and the same gate, and neither truck's
settings enter into it.

## D3. ✅ `order_key` handling is COMPLETELY unchanged

`const orderKey = newUuid()` at `:1030` — **untouched**. It is set on `manualOrder` (`:1040`), passed to
`gatedAction` (`:1104`), set on the optimistic object (`:1112`), and is what the server upserts on and
what the dashboard prunes on. 🔴 **The edit assigns only `id`, the human display number. Nothing here
makes `id` load-bearing.**

---

# PART E — DEVICE VERIFICATION PLAN

⚠️ **Nothing below has been run. The shell loads PRODUCTION, so this change is not on the device until
it is deployed.**

### 1. Route 1 — reachability has ALREADY flipped (the easy one)
Kill the network (aeroplane mode / disable Wi-Fi). **Wait for the offline banner to appear** — that is
the visible proof `isOnline()` has flipped. Then **+ Add order** → place a walk-up.
- **PASS =** the card reads **`#N<number>`** and the toast reads **"Order N<number> saved on this
  device"**.
- **FAILURE =** a bare `#`, or a toast with a gap where the number belongs.
- ✅ **This path is unchanged by the edit** — if it regresses, the `provisional ||` short-circuit is
  wrong.

### 2. 🔴 Route 2 — the ~30-second window. **THE ONE THAT HAS NEVER BEEN REPRODUCIBLE ON DEMAND.**
**How to force it — the ordering is the whole trick:**
1. Start **online**, with the app open on **+ Add order** and a basket **already built**.
2. Kill the network.
3. 🔴 **Tap Confirm IMMEDIATELY — within a few seconds, and definitely before the offline banner
   appears.** The banner is the tell: **if it has appeared you are in route 1 and the test is void.**
- **PASS =** the card reads `#N<number>` and the toast names it.
- 🔴 **FAILURE = a bare `#`** — the fix did not take.
- ⚠️ **A cleaner forcing method exists in dev builds:** `components/native/DevOfflineToggle.tsx` flips
  `setSimulatedOffline(true)`, which bypasses the fail-threshold debounce. **That gives route 1, not
  route 2** — it is the wrong tool here, and worth knowing so it is not mistaken for a reproduction.
- ⚠️ **INFERRED, unverified:** that a fetch fails fast enough in that window. On a Wi-Fi drop the socket
  usually errors quickly; on a dying-uplink it may hang until timeout, in which case the tap lands in
  route 1 anyway.

### 3. Both on screen together
Place one of each. **PASS =** two `#N` cards with **different** numbers. **FAILURE =** a bare `#`, or two
cards showing the **same** N (a collision — record the device letters).

### 4. Online control — must be untouched
Reconnect fully. Place a normal walk-up.
- **PASS =** it takes the ordinary server number (`#12`), no `N` anywhere.
- 🔴 **FAILURE =** an `N` appears online → `displayId` is being evaluated outside the queued branch.

### 5. Reconciliation — and the asymmetry from C3
Let the outbox drain.
- **PASS =** the route-1 order **keeps** its `#N`; the route-2 order **becomes an ordinary `#n`**; both
  keep their items, customer and total; **no duplicates.**
- ⚠️ **The route-2 renumber is EXPECTED (C3), not a failure.** ⚠️ **Watch what an operator does with
  it** — if they wrote `N8` on a bag, the board now says `#7`.

### 6. The KDS, for completeness
**PASS =** queued walk-ups do not appear there at all (they never did) and synced ones show their final
number.

---

# PART F — INTEGRITY

## F1 / F2. Non-ASCII census — `components/dashboard/AddOrderPanel.tsx`

| | Bytes | Lines | Distinct non-ASCII |
|---|---|---|---|
| **BEFORE** | 166,576 | 2,451 | **36** |
| **AFTER** | **168,834** (+2,258) | **2,474** (+23) | **36** |

**GAINED classes: NONE. LOST classes: NONE.**

| Codepoint | Before → After | Why |
|---|---|---|
| `U+2500` ─ | 2134 → 2146 **(+12)** | the comment block's box rule, in the file's house style |
| `U+2014` — | 214 → 217 **(+3)** | three em dashes in the comment |
| `U+1F534` 🔴 | 34 → 37 **(+3)** | three red markers |
| `U+26A0` ⚠ | 39 → 41 **(+2)** | two warning markers |
| `U+FE0F` | 38 → 40 **(+2)** | ✅ **lockstep with U+26A0 — no half-written ⚠️** |
| `U+2026` … | 16 → 17 **(+1)** | one ellipsis |

⚠️ Every codepoint was already present in this file (36 classes). **No class introduced.**

## F3. Byte scan — byte-level tool, never grep

| File | NUL (0x00) | Ctrl < 0x09 | Other C0 (0x0B-0x1F, 0x7F) |
|---|---|---|---|
| `components/dashboard/AddOrderPanel.tsx` | **0** | **0** | **0** |

## F4. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## F5. `git status` and `git diff`

```
$ git status --porcelain
 M components/dashboard/AddOrderPanel.tsx      <- THIS TASK
 M docs/reference-manual.md                    <- the V11.17 update, previous task
?? docs/offline-order-number-report.md
```

```diff
$ git diff -- components/dashboard/AddOrderPanel.tsx
       if (result.queued) {
+        // ── 🔴 THE PLACEHOLDER FOLLOWS THE QUEUE DECISION, NOT A SEPARATE CONNECTIVITY GUESS ──────────
+        // DEVICE-CONFIRMED 14 August 2026: a bare '#' card and a '#N7' card on screen at the same time.
+        // TWO things decided the same outcome and disagreed. `isOnline()` at :1031 decided the NUMBER;
+        // `gatedAction` decided whether the order QUEUED — and it has TWO routes into queue(): the
+        // known-offline check on `online === false`, and a CATCH on a thrown fetch. Reachability needs
+        // three consecutive failed pings (~30s) to flip, so inside that window the app believes it is
+        // online (no placeholder minted, `provisional === ''`) while the POST is already failing and the
+        // order queues anyway. The card then rendered `#{order.id}` over an empty string: a bare '#'.
+        // 🔴 `result.queued` IS THE AUTHORITY, because it is the thing that queued it. One decision, one
+        // answer — and it is available here, before the optimistic object exists.
+        // ⚠️ FALLBACK ONLY. `provisional || …` keeps route 1 EXACTLY as it was: when reachability had
+        // already flipped, the number minted at :1031 is the one that went into the queued body, and it
+        // must stay the one shown or the card would disagree with what the server will keep.
+        // ⚠️ THE ROUTE-2 NUMBER IS DISPLAY-ONLY, AND THAT ASYMMETRY IS DELIBERATE. The body was built at
+        // :1039 and is already in the outbox carrying `provisional_id: null`, so on replay the server
+        // assigns an ordinary sequential number — a route-2 order shows 'N8' now and '#7' after sync,
+        // where a route-1 order keeps its N permanently. Changing that would mean rewriting a queued
+        // payload, which is the outbox's business and out of scope here.
+        // 🔴 NOTHING HERE IS LOAD-BEARING. `order_key` (minted at :1030) is the identity key and is
+        // untouched; `id` is the human display number and is never a lookup key.
+        const displayId = provisional || await nextProvisionalId()
         const optimistic = {
-          id: provisional, order_key: orderKey,
+          id: displayId, order_key: orderKey,
…
+        // Same value as the card, for the same reason: on route 2 this read "Order  saved on this
+        // device" with a hole where the number belongs.
-        showToast(`Order ${provisional} saved on this device — will sync when back online`, 'success')
+        showToast(`Order ${displayId} saved on this device — will sync when back online`, 'success')
```

🔴 **Two logic lines changed (`id:` and the toast) plus one added (`displayId`). Everything else is
comment. Nothing committed.**

## F6. ✅ `tsc --noEmit`: **EXIT 0, ZERO OUTPUT** — and it is not verification

🔴 **THE OPTIMISTIC OBJECT IS STILL `as unknown as Order`, so the compiler cannot check `id` at all** —
it could not see the empty string that caused this defect, and it cannot see a correct one now. ⚠️ **It
would be equally happy with `id: ''` today.**

**What tsc DID check:** that `displayId` is a `string` and that `nextProvisionalId()` is awaited.
**What it did not:** that the value is non-empty, that the branch is only reachable when queued, or that
anything renders. **Nothing was run on a device.**

---

# WHAT REMAINS

1. 🔴 **Route 2 has never been reproduced on demand**, and this fix has not been observed. **Step 2 of
   the plan is the only real test.**
2. ⚠️ **The route-1 / route-2 asymmetry is now a documented behaviour** (C3): one keeps its N, the other
   is renumbered on sync. **Closing it means rewriting a queued payload — outbox work, not this.**
3. ⚠️ **The `~30s` window itself is untouched.** This makes the window survivable; it does not shorten
   it. **The underlying disagreement between a polled detector and a reactive failure is the same
   three-detector problem §11 records.**
4. ⚠️ **Collision risk is marginally higher** (C4), transient, and display-only.
5. ✅ **The banner count was never wrong** (B2) — a concern raised and closed by reading `enqueue`.
6. **Nothing was rendered.** Every claim about what the card shows is read from source.
