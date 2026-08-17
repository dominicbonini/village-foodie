# Offline outbox parity: KDS vs dashboard

**READ-ONLY. Nothing was edited, created or deleted except this report.** No commit, no stage, no
build, no `next dev`, no `next build`, no `cap sync`, no deploy, no SQL.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# 🔴 THE HEAD-vs-WORKTREE QUESTION, SETTLED ONCE, FOR MOST OF THIS REPORT

**EXECUTED — `git diff --quiet HEAD -- <file>` on every module quoted below:**

```
lib/native/outbox.ts                               SAME_AS_HEAD
lib/native/orderGate.ts                            SAME_AS_HEAD
lib/native/reachability.ts                         SAME_AS_HEAD
lib/native/useOfflineStatusOverlay.ts              SAME_AS_HEAD
lib/native/useOutboxConflicts.ts                   SAME_AS_HEAD
lib/native/app.ts                                  SAME_AS_HEAD
components/native/OfflineBanner.tsx                SAME_AS_HEAD
components/WebOfflineBanner.tsx                    SAME_AS_HEAD
app/api/dashboard/action/route.ts                  SAME_AS_HEAD
lib/payments/ledger.ts                             SAME_AS_HEAD
lib/useReadyEmailUndo.ts                           SAME_AS_HEAD
public/sw.js                                       SAME_AS_HEAD
capacitor.config.ts                                SAME_AS_HEAD
```

✅ **Every fact sourced from those thirteen files is true in HEAD AND in the working tree.** Only the
two page files are dirty, and each claim taken from them is marked individually.

**EXECUTED — the KDS's `handleAction` is byte-identical in HEAD and the working tree:**

```
$ diff <(sed -n '752,835p' <HEAD copy>) <(sed -n '853,933p' app/dashboard/[token]/kds/page.tsx)
82,84d81   ← trailing context only; no line inside handleAction differs
```

**EXECUTED — the dashboard's diff contains NO added/removed line matching
`gatedAction|outbox|overlay|queued|drain|offline|removePendingStatusOp` except one comment.** ✅ **So
the write path on BOTH surfaces is unchanged from HEAD.**

---

# Q1 — THE WRITE PATH ON BOTH SURFACES

# 🔴 ANSWER: THEY SHARE ONE IMPLEMENTATION AND DIVERGE AROUND IT. Not two implementations, and not one.

**The shared core is `gatedAction` → `enqueue`. The divergence is entirely in what each surface does
with `result.queued` and `result.data` afterwards.**

## The one gate both surfaces call — READ, `lib/native/orderGate.ts`, `gatedAction`

```ts
  // Native + known-offline → don't burn a timeout, queue immediately.
  if (isNativeApp() && online === false) return queue()

  try {
    const res = await post(url, body)
    const data = await res.json().catch(() => ({}))
    // A server RESPONSE (even an error) is NOT an offline case — return it as-is (web behaviour unchanged).
    return { ok: res.ok, queued: false, status: res.status, data, provisional_id, order_key }
  } catch {
    // Thrown fetch = could not reach the server. Queue on native; on web, surface as a failed (non-queued)
    // result so existing web error handling runs exactly as before.
    if (isNativeApp()) return queue()
    return { ok: false, queued: false, order_key }
  }
```

🔴 **THE QUEUE IS NATIVE-ONLY, ON BOTH SURFACES.** `isNativeApp()` gates both queue paths. **READ —
the enqueue itself:**

```ts
  const queue = async (): Promise<GateResult> => {
    // expected_from rides ONLY on the replayed op → online requests are unchanged; the server guards replays.
    const queuedBody = { ...body, ...(expectedFrom ? { expected_from: expectedFrom } : {}), ...(queuedExtra ?? {}) }
    await enqueue({ kind, order_key, url, body: queuedBody, provisional_id })
    return { ok: false, queued: true, provisional_id, order_key }
  }
```

## Ready → Mark paid → Collected, traced on each surface

### DASHBOARD — `doAction`, READ, `app/dashboard/[token]/page.tsx` (working tree; the gate call is unchanged from HEAD)

```tsx
  const doAction=async(action:string,orderKey:string)=>{
    if(action==='cancel'){…}
    if(action==='reject'){…}
    setActionLoading(`${action}-${orderKey}`)
    try{
      // Offline GATE (mirrors KDS): online → normal write; offline (native) → durable outbox + queued.
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action,order_key:orderKey,...(action==='ready'?{defer_email:true}:{})},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
```

### KDS — `handleAction`, READ, `app/dashboard/[token]/kds/page.tsx` (identical in HEAD)

```tsx
      const result = await gatedAction({
        url: '/api/dashboard/action',
        // 'ready' defers the customer email so the undo toast can cancel it (mirrors the dashboard).
        body: { token, pin, action, order_key: orderKey, ...(action === 'ready' ? { defer_email: true } : {}) },
        kind: 'status', order_key: orderKey, online: isOnline(), expectedFrom: STATUS_REPLAY_EXPECTED_FROM,
      })
```

# ✅ THE TWO GATE CALLS ARE THE SAME CALL — same url, same body shape, same `defer_email` rule, same `kind:'status'`, same `online: isOnline()`, same `expectedFrom`.

**All three actions — `ready`, `mark_paid`, `collected` — are ordinary `action` strings through that one
call on both surfaces. There is no per-action branching before the gate on either.** *(READ. The
dashboard's only pre-gate branches are `cancel` and `reject`, which open modals instead.)*

## 🔴 WHERE THEY DIVERGE — after the gate returns

| | Dashboard `doAction` | KDS `handleAction` |
|---|---|---|
| queued: overlay refresh | `refreshPendingStatus(); refreshPendingPayment()` | `refreshPendingStatus()` only — 🔴 **no payment overlay exists here** |
| queued: prep-pill auto-strike | ✅ `setStruckPrep(…)` for ready/collect | ✗ none *(the KDS has no prep pills)* |
| queued: queued-count state | ✗ none found | ✅ `setPendingSyncCount(c => c + 1)` + `setPendingSync(prev => …add(orderKey))` |
| queued: toast | ✅ **always** — `savedMsg`, with Undo for ready **and** collect | 🔴 **`'ready'` ONLY.** `mark_paid` and `collected` queue **silently** |
| committed: `paymentWarning` | ✅ 20s error toast + "Record payment" | ✅ 20s error toast + "Record payment" |
| committed: `mark_paid` toast | ✅ + Undo | 🔴 **none** |
| committed: `collected` toast | ✅ + Undo | 🔴 **none** |
| committed: `ready` toast | ✅ + Undo + buzzer pill | ✅ + Undo + buzzer pill *(comment says byte-identical)* |
| errors | `if(!result.ok)throw new Error(data.error)` | 🔴 **`} catch {}`** — empty |

**READ — the KDS's queued branch, showing the `'ready'`-only toast:**

```tsx
      if (result.queued) {
        refreshPendingStatus()
        setPendingSyncCount(c => c + 1)
        setPendingSync(prev => new Set(prev).add(orderKey))
        setActionLoading(null)
        if (action === 'ready') {
          …
          showToast(`Order #${num} saved`, 'success', { duration: 7000, action: { label: '↩ Undo', run: offlineUndo } })
        }
        return
      }
```

**READ — the dashboard's, which toasts for every action:**

```tsx
        const savedMsg=`Order #${q?.id??''} saved`
        if(action==='ready'||isCollectAction(action)){
          showToast(savedMsg,'success',{duration:7000,action:{label:'↩ Undo',run:offlineUndo}})
        }else{showToast(savedMsg)}
```

🔴 **CONSEQUENCE, READ FROM THE TWO BRANCHES: on the KDS an offline `collected` or `mark_paid` produces
no toast at all.** ⚠️ **The card still moves — the status overlay does that — and the global
`OfflineBanner` still counts it. The per-action confirmation is what is absent.**

## Every shared module, and every duplicated block

**SHARED — one implementation, both surfaces import it (READ, import lines on both files):**

| Module | Role |
|---|---|
| `lib/native/orderGate.ts` | `gatedAction`, `drainOutbox`, `STATUS_REPLAY_EXPECTED_FROM`, the overlay builders |
| `lib/native/outbox.ts` | the queue itself, `removePendingStatusOp` |
| `lib/native/reachability.ts` | `isOnline()`, the ping loop |
| `lib/native/useOfflineStatusOverlay.ts` | the sticky status overlay |
| `lib/native/useOutboxConflicts.ts` | the conflict signal for banner + card |
| `components/native/OfflineBanner.tsx` | banners **and the drain trigger** |
| `components/WebOfflineBanner.tsx` | the web-only indicator |
| `lib/useToasts` · `lib/useReadyEmailUndo` | toasts, deferred ready-email, `undoReady` |
| `components/dashboard/OrderCard.tsx` | the card, incl. `conflict` and `pendingSync` |
| `app/api/dashboard/action/route.ts` | one endpoint, one `expected_from` guard |

**DUPLICATED — written twice, in both page files:**

1. **The gate call itself** — same six arguments, retyped in each file *(the two blocks quoted above)*.
2. **The `paymentWarning` toast** — same copy, same 20s, same "Record payment" repair, written out
   separately in each file.
3. **The committed-`ready` toast with the buzzer pill** — the KDS comment states this is deliberate:
   *"The pill markup below is BYTE-IDENTICAL to the dashboard's so the two surfaces cannot render
   differently"*.
4. **The offline-undo closure** (`removePendingStatusOp` → `dropOverlayEntry` → toast, else fall back
   to the online undo) — the same five steps in both, with different fallbacks.
5. **`resolveConflictLabel`** — the same `orders.find` → `#id` → `provisional_id` chain in both.
6. **The overlay application** — `orders.map(o => …kdsOverlay.get…)` in the KDS vs the dashboard's own
   fold; same idea, separate code.

---

# Q2 — THE OUTBOX ITSELF

# ✅ THERE IS ONE OUTBOX, AND BOTH SURFACES USE IT. The dashboard is not without one.

**READ — `lib/native/outbox.ts`, the storage decision, in the module's own words:**

```
// STORAGE CHOICE — Capacitor Preferences (iOS: NSUserDefaults plist in the app sandbox):
//   • Persists to disk and survives force-quit + device restart (it is NOT WebKit "website data", so — unlike
//     WKWebView IndexedDB/localStorage — it is never evicted under WebKit storage pressure).
//   • We write ONE Preferences key per op (`hg_outbox_op_<op_id>`) so every enqueue is a single atomic set — a
//     hard-kill mid-write can't corrupt the whole queue (no read-modify-write of a shared blob).
```

| | Dashboard | KDS |
|---|---|---|
| **Has an outbox?** | ✅ **YES** — the same one | ✅ **YES** — the same one |
| **Where** | `lib/native/outbox.ts` | identical |
| **Storage** | **Capacitor Preferences** (iOS NSUserDefaults) | identical |
| **Keyed on** | `hg_outbox_op_<op_id>` — **one key per op** | identical |
| **Not memory / localStorage / IndexedDB / a native store of its own** | ✅ READ — the only import is `@capacitor/preferences` | identical |
| **Extra state** | `deviceQueuedOrders` — offline CREATES from AddOrderPanel | 🔴 **zero occurrences** (EXECUTED: `grep -c` → 0). The KDS has no create path |

**READ — the supporting keys:**

```ts
const KEY_PREFIX = 'hg_outbox_op_'
const SEQ_KEY = 'hg_outbox_seq'          // monotonic per-device counter (ordering, clock-independent)
const DEVICE_LETTER_KEY = 'hg_device_letter'
const ACK_KEY = 'hg_outbox_conflict_ack'
```

## 🔴 A SECOND QUEUE EXISTS IN `public/sw.js` AND IS DEAD

**READ — `public/sw.js`:**

```js
const QUEUE_STORE = 'vf-mutation-queue'
```
```js
  // MUTATION REPLAY REMOVED (Phase-1 offline). The SW no longer intercepts POSTs — it is READ-CACHE ONLY.
  // The app-level durable outbox (lib/native/orderGate + lib/native/outbox) owns ALL writes: an offline POST
  // now THROWS and is captured by the gate (conflict-aware + idempotent on order_key), replacing the SW's old
  // conflict-blind, fake-success ({ok:true, queued:true}) queue. (The legacy enqueue/syncMutations helpers +
  // the 'sync' listener below are now inert — nothing enqueues — and are left only to keep this diff minimal.)
```

✅ **EXECUTED — `grep -n "enqueue(" public/sw.js` returns ONE line: the definition at `:41`. Zero call
sites. The IndexedDB queue is genuinely inert.** ⚠️ **The SW is still registered on BOTH surfaces
(`registerServiceWorker()` in each) and still read-caches `GET /api/dashboard` — that part is live.**

⚠️ **ONE KDS-ONLY WIRE INTO THE DEAD QUEUE — READ, KDS only, working tree:**

```tsx
  useEffect(() => {
    registerServiceWorker()
    countOps().then(setPendingSyncCount)
    return addSWMessageListener(count => {
      setPendingSyncCount(count)
      if (count === 0) { setPendingSync(new Set()); fetchAllRef.current() }
    })
  }, [])
```

🔴 **The KDS's header counter is seeded from `countOps()` — which counts CONFLICT ops too, unlike the
banner's `countPendingOps()` — and is then driven by service-worker messages that nothing sends.** ✅
**EXECUTED: the dashboard has NO `pendingSyncCount`, no `addSWMessageListener` and no `countOps` call
(grep returns nothing).** ⚠️ **INFERRED, not read: because nothing posts `QUEUE_COUNT`, the listener
never fires and the counter only ever moves via `setPendingSyncCount(c => c + 1)` in `handleAction`.
Whether it is ever reset is not stated anywhere in the source.**

---

# Q3 — SURVIVAL

| Event | Dashboard (native) | KDS (native) | Either surface on WEB |
|---|---|---|---|
| **Page reload** | ✅ survives | ✅ survives | ✗ **nothing to survive** |
| **WKWebView cold kill** | ✅ survives | ✅ survives | ✗ n/a |
| **Background → resume** | ✅ survives | ✅ survives | ✗ n/a |
| **Device restart** | ✅ survives | ✅ survives | ✗ n/a |

🔴 **THE SURVIVAL PROPERTY IS THE STORAGE'S, NOT THE SURFACE'S — which is why the two columns are
identical. Both call the same `enqueue`.**

**READ — the durability claim, and note it is the MODULE'S OWN CLAIM, not something I executed:**

```
//   • Persists to disk and survives force-quit + device restart (it is NOT WebKit "website data", so — unlike
//     WKWebView IndexedDB/localStorage — it is never evicted under WebKit storage pressure).
```

**READ — and the module documents its own residual hole:**

```
//   Caveat (documented): NSUserDefaults flushes writes to disk on the OS's schedule, so a force-quit in the
//   sub-second window after the newest enqueue *could* drop only that last write. For Phase 1 this is the
//   accepted residual; the hardening upgrade is @capacitor-community/sqlite (per-commit fsync) — same
//   interface, swap the storage impl.
```

⚠️ **WHAT THE CODE GUARANTEES vs WHAT I AM INFERRING.** The code guarantees only that each op is
written with `Preferences.set` under its own key:

```ts
  await Preferences.set({ key: KEY_PREFIX + op.op_id, value: JSON.stringify(op) })
```

**Everything about NSUserDefaults surviving a cold kill or a restart is a property of the platform, not
of this repo. I READ the claim; I did not execute it. Nothing in the repository tests it.**
🔴 **CANNOT BE DETERMINED READ-ONLY** whether a real device drops the last write on force-quit. **What
would settle it: killing the app from the iOS app switcher within a second of an offline tap, then
relaunching and reading `hg_outbox_op_*` — a device test, not a source read.**

## The OVERLAY's survival is a separate question, and its answer is different

**The overlay is React state, so it does NOT itself survive anything — it is REBUILT from the outbox.
READ, `useOfflineStatusOverlay`:**

```ts
  useEffect(() => {
    if (!isNativeApp()) return
    refresh()
    const id = setInterval(refresh, 5000)   // matches OfflineBanner's countPendingOps cadence
    return () => clearInterval(id)
  }, [refresh])
```

✅ **Same hook, same 5s cadence, on both surfaces — so the rebuilt overlay is identical.** ⚠️ **INFERRED:
there is therefore a window between mount and the first `refresh()` resolving in which the board shows
un-overlayed server truth. Nothing in the source states its length.**

## WEB — there is nothing to survive

**READ — `gatedAction`'s web branch returns `queued: false` and writes nothing.** **READ — the web
banner says so in its own header:**

```
// WEB-ONLY offline indicator — the counterpart to native/OfflineBanner (which is native-only and backed by a
// durable outbox). The web dashboard has NO offline queue, so this banner deliberately does NOT promise
// "saved — will sync"; it tells the operator plainly that orders won't send until they reconnect…
```

🔴 **BOTH SURFACES ARE EQUALLY UNPROTECTED ON WEB. Parity here is parity in having nothing.**

---

# Q4 — REPLAY AND FAILURE

## What replays, and in what order — ONE drain, shared

**READ — `OfflineBanner`, which is mounted on BOTH surfaces and owns the trigger:**

```tsx
    const unsub = onReachabilityChange((online) => {
      onlineRef.current = online
      if (!online) { cancelRetry(); retryAttempt.current = 0; setPhase('offline'); return }
      void (async () => {
        const pending = await countPendingOps()
        if (pending === 0) { await refreshCounts(); setPhase('online'); return }
        setPhase('syncing')
        const r = await drainOutbox()
        …
        if (r.remaining > 0) scheduleRetry()   // transient failure left pending ops → retry with backoff
```

**READ — the mounts, one per surface:**

```tsx
      <OfflineBanner conflicts={outboxConflicts} resolveLabel={resolveConflictLabel} onAcknowledge={acknowledgeConflicts} onSynced={()=>{reseedRef.current();refreshPendingStatus()}} />
```
```tsx
      <OfflineBanner conflicts={outboxConflicts} resolveLabel={resolveConflictLabel} onAcknowledge={acknowledgeConflicts} onSynced={() => { fetchAllRef.current(); refreshPendingStatus() }} />
```

✅ **Identical except the `onSynced` callback.** **ORDER: FIFO by `seq` — READ, `listOps` ends
`return ops.sort((a, b) => a.seq - b.seq)`, and `drainOnce` iterates that array.**

⚠️ **BOTH SURFACES MOUNT A BANNER, SO A DEVICE WITH BOTH OPEN HAS TWO DRAINERS.** The module guards it:

```ts
let drainInFlight: Promise<DrainResult> | null = null
```

⚠️ **INFERRED, not read: that lock is a module-level variable, so it serialises within ONE JavaScript
context. Two separate WebView contexts would not share it. Nothing in the source addresses that.**

## Every failure outcome — READ, `drainOnce`

```ts
    if (res.ok) {
      await removeOp(syncing.op_id); synced++
    } else {
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      const last_error = `HTTP ${res.status}${(data as any)?.error ? ` — ${(data as any).error}` : ''}`
      if (res.status === 409) {
        await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++
      } else if (syncing.attempts >= MAX_ATTEMPTS) {
        await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++
      } else {
        await saveOp({ ...syncing, state: 'pending', last_error })
      }
    }
```

| Rejection | Op state | What the operator SEES | Same on both surfaces? |
|---|---|---|---|
| **409 — stale status** *(customer cancelled online while advanced offline)* | 🔴 **`conflict` immediately** | red conflict banner naming the order **+** the card's red marker | ✅ **yes** — same banner, same `conflict` prop |
| **Other 4xx (incl. auth)** | `pending`, retried; **`conflict` at 5 attempts** | ⚠️ **nothing until the 5th attempt.** Then the banner | ✅ yes |
| **5xx** | identical to the above | identical | ✅ yes |
| **Thrown fetch** *(still offline)* | `pending` + **`break`** — the drain STOPS | amber "changes saved on this device" | ✅ yes |
| **Thrown fetch ≥5 attempts** | `conflict`, `continue` | conflict banner | ✅ yes |
| **Malformed op** | `conflict`, never posted | conflict banner | ✅ yes |

**READ — the 409 guard is server-side and applies only to REPLAYS:**

```ts
    if (Array.isArray(body.expected_from) && orderKey && action !== 'manual') {
      …
      if (cur && !body.expected_from.includes(cur.status)) {
        return NextResponse.json({ error: 'conflict', current_status: cur.status }, { status: 409 })
```

**and `STATUS_REPLAY_EXPECTED_FROM` excludes the terminal states — READ:**

```ts
export const STATUS_REPLAY_EXPECTED_FROM = ['pending', 'confirmed', 'modified', 'cooking', 'ready', 'collected']
```

## 🔴 DOES ANYTHING SURFACE THE FAILURE? YES — AND IT IS THE SAME ON BOTH SURFACES.

**Money and status get different bars — READ, `OfflineBanner`:**

```tsx
          <div className="text-base font-black tracking-wide">⚠ PAYMENT NOT RECORDED</div>
          <div className="text-sm font-semibold mt-0.5">
            {nameOrders(paymentConflicts)} — marked as paid on this device, but the server rejected it.
          </div>
```
```tsx
      <span>⚠ {nameOrders(statusConflicts)} — update didn&apos;t sync, needs review</span>
```

**And the per-order marker is passed on both — READ, KDS (working tree):**

```tsx
                conflict={hasUnrecordedPayment(order as never, payments[order.order_key] ?? [], paymentFailures.has(order.order_key))
                  ? 'payment'
                  : conflictByOrder.get(order.order_key)}
```

⚠️ **ONE KDS-SPECIFIC GAP, RECORDED IN THE KDS'S OWN COMMENT (READ, working tree):**

```
  // ⚠️ It renders only `visibleOrders`, so a conflicted order that is filtered out
  // of the columns is NAMED by the banner but carries no card marker on this surface.
```

🔴 **AND NOTHING RETRIES A CONFLICT — READ, `useOutboxConflicts`:**

```
// ⚠️ IT DOES NOT RETRY. A failed replay stays failed. The job here is that the operator KNOWS.
```

---

# Q5 — THE OVERLAY

**READ — where it is applied, KDS (working tree), BEFORE every board filter:**

```tsx
  const overlayedOrders = kdsOverlay.size
    ? orders.map(o => { const ov = kdsOverlay.get(o.order_key); return ov ? ({ ...o, ...ov } as Order) : o })
    : orders

  // Base: exclude terminal statuses for all views
  const activeOrders = overlayedOrders.filter(o =>
    !['collected', 'cancelled', 'rejected'].includes(o.status)
  )
```

✅ **EXECUTED — that block is byte-identical in HEAD** *(compared directly against the HEAD copy)*.

**WHEN APPLIED:** at render, over the merged orders, before the split — and refreshed immediately on
enqueue (`refreshPendingStatus()` in both queued branches) plus every 5s.

**WHEN CLEARED — READ, three exits and only three:**

```ts
      for (const [key, entry] of Array.from(next.entries())) {
        if (folded.has(key)) continue                            // still pending → HOLD
        if (snap.conflictKeys.has(key)) { next.delete(key); continue }  // optimistic rejected → server truth wins
        const o = byKey.get(key)
        if (o && o.status === entry.status) next.delete(key)     // SERVER CAUGHT UP (reflects the target) → clear, no flash
        // else: op drained but server not yet caught up → HOLD across the drain→fetch gap (the fix)
      }
```

plus `dropEntry` — the offline undo. 🔴 **NOTE WHAT IS NOT AN EXIT: the op DRAINING. The entry is held
past the drain until the server's own read shows the target status.**

# 🔴 THE ORDER THAT LEFT THE BOARD AND THEN FAILED — YES, THE OPERATOR GETS IT BACK.

**The mechanism is the second line above: `if (snap.conflictKeys.has(key)) { next.delete(key) }`.**
**READ — the conflict keys are fed from the outbox:**

```ts
      .then(([pending, conflicts]) => setSnap({
        ops: pending,
        conflictKeys: new Set(conflicts.filter(o => o.kind === 'status').map(o => o.order_key)),
      }))
```

**The sequence, READ from those two files:** the op flips to `conflict` in the drain → within ≤5s
`refresh()` picks it up → the overlay entry is deleted → `overlayedOrders` reverts to the server's real
status → the order re-enters `activeOrders` and reappears on the board — **and simultaneously the
conflict banner names it and the card carries its red marker.**

⚠️ **THREE CAVEATS, ALL READ:**

1. **It is a ≤5s poll, not an event.** Nothing pushes; `setInterval(refresh, 5000)` in both the overlay
   hook and `useOutboxConflicts`.
2. **`conflictKeys` filters `o.kind === 'status'`** — every action here is queued as `kind:'status'`
   (payments included, per `orderGate`'s note), **so payment conflicts are included**. READ.
3. 🔴 **This only reverses the DISPLAY.** Nothing re-queues the op, and `useOutboxConflicts` states it
   does not retry. **The operator gets the ticket back; they do not get the action back.**

---

# Q6 — THE TOAST AND UNDO

# 🔴 THE PREMISE IS FALSE AS WRITTEN, AND HERE IS THE EXACT SHAPE OF IT.

**"the KDS shows nothing" is NOT what the code does. The KDS shows a toast WITH Undo for `ready`, on
both the committed and the queued path. It shows NOTHING for `mark_paid` and `collected`.**

**READ — the KDS's committed-ready toast (identical in HEAD):**

```tsx
        showToast(
          readyOrder?.buzzer_number != null
            ? <>Order #{num} ready · {buzzerPill(readyOrder.buzzer_number)}</>
            : `Order #${num} ready`,
          'success', { duration: 4000, action: { label: '↩ Undo', run: () => undoReady(orderKey, num) } })
```

**READ — the KDS's queued-ready toast, with its OWN offline undo:**

```tsx
          const offlineUndo = async () => {
            const removed = await removePendingStatusOp(orderKey)
            if (removed) {
              dropOverlayEntry(orderKey); refreshPendingStatus()
              setPendingSync(prev => { const n = new Set(prev); n.delete(orderKey); return n }); setPendingSyncCount(c => Math.max(0, c - 1))
              showToast(`Order #${num} reverted`)
            } else { undoReady(orderKey, num) }
          }
          showToast(`Order #${num} saved`, 'success', { duration: 7000, action: { label: '↩ Undo', run: offlineUndo } })
```

✅ **Both surfaces use the SAME `useToasts` + `ToastStack` + `useReadyEmailUndo`.** ✅ **EXECUTED — the
KDS imports all three.**

| Toast | Dashboard | KDS |
|---|---|---|
| `ready` committed, + Undo | ✅ | ✅ |
| `ready` queued, + offline Undo | ✅ | ✅ |
| `mark_paid` committed, + Undo | ✅ | 🔴 **NONE** |
| `collected` committed, + Undo | ✅ | 🔴 **NONE** |
| `collected`/`mark_paid` **queued** | ✅ `savedMsg` (+Undo for collect) | 🔴 **NONE — silent** |
| `undo_mark_paid` / `undo_collected` confirmations | ✅ | 🔴 **NONE** |
| `paymentWarning` on a 200 | ✅ | ✅ |

## What Undo actually reverses, per action

### `ready` → `undo_ready`. READ, `lib/useReadyEmailUndo.ts`:

```ts
  const undoReady = (orderKey: string, displayId: string | number) => {
    const t = pendingReadyEmails.current.get(orderKey); if (t) clearTimeout(t); pendingReadyEmails.current.delete(orderKey)
    onUndoRestore?.(orderKey)
    fetch('/api/dashboard/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, pin, action: 'undo_ready', order_key: orderKey }) }).then(() => refetch()).catch(() => {})
    showToast(`Order #${displayId} reverted`)
  }
```

**READ — the server side:**

```ts
    if (action === 'undo_ready') {
      const { data: order } = await supabase.from('orders').select('event_date').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      await supabase.from('orders').update({ status: 'confirmed' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      // RE-BOOK: 'confirmed' occupies capacity again, so rebuild to reclaim the slot ready had freed —
      if (order?.event_date) await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
```

| | |
|---|---|
| **Columns** | `orders.status` → **hardcoded `'confirmed'`** 🔴 *(an order that was `'modified'` comes back as `'confirmed'` — READ, there is no from-status capture here)* |
| **Side effects** | `production_slot_usage` rebuilt (capacity re-booked) |
| **Reverses the customer email?** | ✅ **YES, but only within 4s** — by clearing the timer before it fires |
| **Reverses a money write?** | **N/A** — `ready` writes no ledger row |

⚠️ **THE EMAIL IS ONLY CANCELLED IF IT HAS NOT FIRED. READ — the flush on unmount/tab-close sends it
immediately via `sendBeacon`, and the server's only guard is `order.status !== 'ready'`.**

### `mark_paid` → `undo_mark_paid`. READ, the server:

```ts
    if (action === 'undo_mark_paid') {
      try {
        await reverseCollectionPayment(supabase, {
          orderKey, truckId: truck.id, createdBy: actor.actorId,
          beforeDelete: async (deletedRow) => { await logActionOrThrow(…) },
        })
      } catch (err) {
        console.error(`[undo_mark_paid] REFUSED …`)
        return NextResponse.json({ error: … }, { status: 500 })
```

| | |
|---|---|
| **Columns** | **DELETES the `order_payments` ledger row.** No status column changes |
| **Side effects** | audit row written **before** the delete, and it **fails CLOSED** (`logActionOrThrow`) |
| **Reverses money?** | ✅ **YES — this is the money reversal.** It removes the ledger row, not a Stripe charge |
| **Reverses an email?** | **N/A** |

### `collected` → `undo_collected`. READ, the server:

```ts
    if (action === 'undo_collected') {
      const { data: order } = await supabase.from('orders').select('slot, event_date, event_id, status_before_collected').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      // Revert ONE stage, to the order's ACTUAL previous status (recorded by 'collected'): 'ready' if it
      // was ready, 'confirmed'/'modified' if collected directly. Fallback 'confirmed' for legacy rows…
```

| | |
|---|---|
| **Columns** | `status` → `status_before_collected` (**not** hardcoded, unlike `undo_ready`) |
| **Side effects** | capacity rebuilt |
| **Reverses money?** | 🔴 **NO.** The dashboard comment states it: *"Undoing 'Done' leaves the payment standing (the server does the same — see undo_collected's splitPaidStep branch)"* — READ |
| **Reverses an email?** | **N/A** |

## 🔴 IS UNDO REACHABLE WHILE AN ACTION IS STILL QUEUED AND UNSENT?

# ✅ YES — ON BOTH SURFACES, BUT FOR DIFFERENT ACTIONS, AND IT IS A DIFFERENT UNDO.

**READ — the offline undo removes the op rather than compensating for it:**

```ts
/** Offline UNDO of a queued status change: remove the LATEST still-PENDING (non-conflict) status op for an
 *  order — clean revert, as-if-never-happened, no compensating op. Returns true if one was removed (false ⇒
 *  it already synced/drained → the caller falls back to the online compensating undo). */
export async function removePendingStatusOp(order_key: string): Promise<boolean> {
```

| | Dashboard | KDS |
|---|---|---|
| Offline Undo offered for | 🔴 **`ready` AND every collect action** | 🔴 **`ready` ONLY** |
| What it does | deletes the pending op → `dropEntry` → card reverts | identical |
| If the op already drained | falls back: `undoReady` for ready, **`doAction('undo_collected')` for collect**, else `fetchAll()` | falls back to `undoReady` only |

**READ — the dashboard's richer fallback chain:**

```tsx
          }else if(action==='ready'){undoReady(orderKey,q?.id??'')}
          else if(isCollectAction(action)){doAction('undo_collected',orderKey)}
          else{fetchAll()}
```

🔴 **AND A DIVERGENCE INSIDE THE SHARED MODULE: `undoReady` posts with a BARE `fetch`, not through
`gatedAction`.** *(READ — quoted above.)* ⚠️ **So an undo taken while offline, after the op has already
drained, is not itself queued — it is a throw-away request. Nothing in the source handles that
rejection: the `.catch(() => {})` swallows it, and the toast `Order #… reverted` has ALREADY been
shown unconditionally.** **This is identical on both surfaces, because the module is shared.**

---

# Q7 — THE MONEY CASE

# ✅ THERE IS AN IDEMPOTENCY GUARD, AND IT IS THREE LAYERS DEEP.

**READ — `lib/payments/ledger.ts`, `recordCollectionPayment`, layer 1 — the balance short-circuit:**

```ts
  // Nothing outstanding (already settled, or a replay whose row is present): recalc so the cache is
  // correct and return without inserting a zero/negative row the CHECK would reject anyway.
  if (before.balanceMinor <= 0) {
    const balance = await recalcOrderPayment(supabase, opts.orderKey)
    return { inserted: false, balance, chargedMinor: 0 }
  }
```

**Layer 2 — the key itself:**

```ts
export function collectIdempotencyKey(orderKey: string, paidBeforeMinor: number, balanceMinor: number): string {
  return `collect:${orderKey}:${paidBeforeMinor}:${balanceMinor}`
}
```

**READ — and it is passed on every in-person collection, alongside the `livemode: true` the question
names:**

```ts
    idempotencyKey: collectIdempotencyKey(opts.orderKey, before.paidMinor, before.balanceMinor),
```
```ts
    // 🔴 HARDCODED TRUE, AND CORRECTLY SO — NOT A PLACEHOLDER. This function books an IN-PERSON
    // collection: an operator standing at a hatch, having physically taken cash or run a card through
    // their own PDQ. There is no test mode for cash.
    livemode: true,
```

**Layer 3 — the expected-vs-actual detector, which turns a WRONG swallow into a throw:**

```ts
  const swallowedButNothingSettled = !inserted && balance.balanceMinor === before.balanceMinor
  if (swallowedButNothingSettled) {
    throw new Error(
      `[ledger] charge of ${before.balanceMinor} for ${opts.orderKey} was SWALLOWED as a duplicate but the ` +
      `balance is unchanged (${balance.balanceMinor}) — an idempotency-key collision, not a replay. ` +
      `The payment has NOT been recorded.`,
    )
  }
```

## The two scenarios asked about

### Replayed TWICE

**READ, following the code:** the first replay books the balance → the balance becomes 0 → **the second
replay hits `before.balanceMinor <= 0` and returns `chargedMinor: 0`, inserting nothing.** ✅ **No double
charge.** ⚠️ **If both replays raced past the guard, the shared `collect:<key>:<paid>:<balance>` key
makes the second insert a duplicate; `inserted` is false and the balance HAS moved, so the detector
stays silent — which the comment states is the correct reading of a genuine replay.**

### Replayed AFTER the balance was settled elsewhere

**Same first guard — `balanceMinor <= 0` → nothing inserted, `chargedMinor: 0`.** 🔴 **AND THE STATUS
STILL APPLIES: the `collected` handler runs the status write regardless of what the ledger did.** READ:

```ts
      const { error: collectErr } = await supabase.from('orders').update({ status: 'collected', paid_at: now, collected_at: now, ...(fromStatus ? { status_before_collected: fromStatus } : {}) }).eq('order_key', orderKey).eq('truck_id', truck.id)
```

⚠️ **AND `fromStatus` GUARDS THE RE-FIRE — READ:**

```ts
      const fromStatus = order?.status && order.status !== 'collected' ? order.status : null
```

✅ **So a second `collected` cannot overwrite `status_before_collected` with `'collected'` and destroy
the undo target.**

⚠️ **ONE MORE MONEY BRANCH, READ: a live card hold suppresses the in-person booking entirely:**

```ts
      const heldOnCollect = await hasHeldAuthorisation(supabase, orderKey)
```
```ts
        const res = heldOnCollect
          ? { chargedMinor: 0 }
          : await recordCollectionPayment(supabase, { orderKey, truckId: truck.id, createdBy: actor.actorId, method: collectMethod })
```

🔴 **NONE OF THIS IS SURFACE-SPECIFIC. It is one server handler; the KDS and the dashboard reach it
with the same body. There is no money parity gap on the SERVER side — the gap is that the KDS shows no
toast when it happens.**

---

# Q8 — NATIVE vs WEB

| | Native (Capacitor iOS/Android) | Web |
|---|---|---|
| **Queue on write failure** | ✅ `gatedAction` → `enqueue` | 🔴 **NO** — `return { ok: false, queued: false, order_key }` |
| **Storage** | Capacitor Preferences | 🔴 **none** |
| **Network detection** | `@capacitor/network` events **as a hint**, + `HEAD /api/ping` every 10s, **3 consecutive failures** → offline, **1 success** → online | `WebOfflineBanner`'s OWN copy of that loop — `navigator.onLine` + the same ping, same thresholds |
| **Which module owns `isOnline()`** | `lib/native/reachability.ts` | 🔴 **web never calls it** — the web banner states it *"does NOT touch the shared reachability module / isOnline()"* |
| **Banner** | `OfflineBanner` (counts, syncing, conflicts) | `WebOfflineBanner` — *"orders won't send until you reconnect"* |
| **Drain** | `drainOutbox()` on reconnect + backoff | **nothing to drain** |
| **Background handling** | `onAppResume` exists — 🔴 **but see below** | browser tab rules |
| **Service worker** | registered; **read-cache only** | identical |

**READ — the native/web split in `network.ts`:**

```ts
export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (!Capacitor.isNativePlatform()) {
    return navigator.onLine ? 'online' : 'offline'
  }
  const status = await Network.getStatus()
  return status.connected ? 'online' : 'offline'
}
```

## 🔴 `onAppResume` IS WIRED ON THE DASHBOARD AND NOT ON THE KDS

**EXECUTED — every consumer:**

```
app/dashboard/[token]/page.tsx:1155     onAppResume(…)
components/native/AppLockGate.tsx:49    onAppResume(…)
lib/printing/usePrinting.ts:145         onAppResume(…)
```

**READ — and what the dashboard's does is a HEARTBEAT ping, not a drain:**

```tsx
    return onAppResume(()=>{
      if(typeof navigator!=='undefined'&&!navigator.onLine)return
      fetch('/api/heartbeat',{method:'POST',…}).catch(()=>{})
    })
```

✅ **So nothing on EITHER surface drains the outbox on resume.** ⚠️ **INFERRED, not read: recovery after
a resume therefore waits for the reachability tick (≤10s, or up to ~30s if the failure debounce has to
unwind) rather than firing on the resume event. Nothing in the source contradicts that, and nothing
states it either.**

## THE REMOTE-URL SHELL — what happens when the origin is unreachable

**READ — `capacitor.config.ts`:**

```ts
const CAP_SERVER_BASE = process.env.CAP_SERVER_URL || 'https://www.hatchgrab.com'
```
```ts
  server: {
    url: `${CAP_SERVER_BASE}/app`,
```

🔴 **THE WEBVIEW LOADS THE APP OVER THE NETWORK. `webDir: 'out'` exists but `server.url` overrides it,
and I found NO offline fallback page, no `errorPath`, and no local bundle served on failure.**

**What happens to a queued action — stated precisely, and the two halves have different confidence:**

- ✅ **READ: the op is in Capacitor Preferences, which is NATIVE storage, not WebView storage.** Nothing
  about the WebView failing to load can touch it. The module's header makes exactly this distinction:
  *"it is NOT WebKit 'website data', so — unlike WKWebView IndexedDB/localStorage — it is never evicted
  under WebKit storage pressure"*.
- 🔴 **READ: but every DRAINER is JavaScript inside that page.** `drainOutbox` is called only from
  `OfflineBanner`, which is a React component. **If the WebView cannot load the origin, no React
  renders, no banner mounts, and nothing drains.**
- ⚠️ **INFERRED: the op therefore sits in Preferences until a launch that successfully loads the page,
  at which point the banner mounts and the normal reconnect drain runs. There is no background task,
  no BGTaskScheduler, no native replay — EXECUTED: nothing in `lib/native/` or `ios/App/App/` performs
  a replay outside the WebView.**

🔴 **CONSEQUENCE, AND IT IS IDENTICAL ON BOTH SURFACES: an operator who force-quits offline and
relaunches while still offline gets a blank/failed shell with their queued money sitting in
NSUserDefaults, invisible and undrainable, until connectivity returns far enough to load a page.**
**CANNOT BE DETERMINED READ-ONLY what the WebView actually renders in that state — that is Capacitor
and WKWebView behaviour, not this repo. What would settle it: launching the built app in Airplane Mode
and observing the screen.**

---

# Q9 — THE DOCUMENTED MODEL vs THE CODE

**READ — the manual, `docs/reference-manual.md:2051`. ✅ EXECUTED: this line is present in HEAD as well
as the working tree, so the documented model is not something this session's edits introduced:**

```
- **6.1 Offline protection: screen-presence → connectivity, tied to the iPad/native app.** Principle:
  offline protection = **deliverability only** (can an order physically reach the device); NOT operator
  attentiveness … Correct signal = device→server **reachability**, not screen-presence …
```

**and `:1987`:**

```
- **Offline = deliverability only** (post-trial, native Capacitor app) — unchanged from prior.
```

# 🔴 THE CODE EXCEEDS THAT DESCRIPTION SUBSTANTIALLY. It is not a deliverability model any more.

**Where it MATCHES:**

✅ **"reachability, not screen-presence"** — implemented exactly. **READ:**

```
// "Can we actually reach the server right now?" — NOT navigator.onLine (which is true on a connected-but-
// dead uplink). A lightweight periodic health-check (HEAD /api/ping) with DEBOUNCE thresholds…
```

✅ **"requires the native Capacitor app"** — every queue path is behind `isNativeApp()`.

**Where it EXCEEDS — none of this is inbound deliverability:**

| Built | Which direction? |
|---|---|
| A durable **outbox of OUTBOUND operator mutations** | 🔴 **device → server.** The manual's principle is about orders reaching the device |
| FIFO replay with `expected_from` **conflict arbitration** | 🔴 beyond deliverability entirely |
| A **payment** overlay publishing `pending_paid` | 🔴 money |
| Ledger **idempotency keys** for replayed collections | 🔴 money |
| A conflict banner that **names orders** and separates money from status | 🔴 failure reporting |
| An **offline undo** that removes a queued op | 🔴 operator workflow |

**Where it FALLS SHORT of the manual's own framing:**

⚠️ **The manual ties the model to "the iPad/native app" — and that is exactly right, because WEB has
none of it. READ: `WebOfflineBanner` exists only to say "orders won't send".** 🔴 **An operator running
the KDS or the dashboard in Safari has NO offline protection of any kind, in either direction.**

⚠️ **The manual's §6.2 prerequisite is recorded as UNRESOLVED — READ, `:2052`:**

```
- **6.2 Multi-van heartbeat scoping (prerequisite for 6.1):** the heartbeat is per-van but a no-`vanId`
  dashboard/Manage ping stamps ALL the truck's vans → one online screen keeps every van "online" …
  Unresolved.
```

🔴 **AND THE MANUAL FILES 6.1 UNDER "Post-trial design decisions (banked, NOT pre-trial)" WHILE THE
OUTBOX IS BUILT AND SHIPPING.** ⚠️ **INFERRED: the manual entry describes the DESIGN DECISION taken
before the work, and was not revised after it. It is stale rather than wrong.**

---

# 🔴 THE ANSWER TO THE HEADLINE QUESTION

**Does the KDS continue to operate using the SAME logic as the dashboard when connectivity drops?**

# ✅ THE MECHANISM: YES, ALMOST ENTIRELY. 🔴 THE FEEDBACK: NO.

**Shared and identical:** the gate, the outbox, the storage, the keys, the FIFO ordering, the drain,
the retry/backoff, the 409 handling, the conflict classification, the conflict banner, the per-order
card marker, the status overlay and every one of its clear conditions, the reachability loop, and the
server handler with its idempotency guards.

**Divergent on the KDS:**

1. 🔴 **No toast for a queued `collected` or `mark_paid`** — the two money actions queue silently.
2. 🔴 **No toast for a committed `collected` or `mark_paid`, and therefore no Undo for either.**
3. 🔴 **Offline Undo is offered for `ready` only**, where the dashboard also offers it for collects.
4. 🔴 **No payment overlay** — `useOfflinePaymentOverlay` has zero occurrences, and no `pendingPayment`
   prop is passed, so a queued payment does not render as paid on this surface.
5. 🔴 **`} catch {}`** — a thrown error is swallowed with no operator signal.
6. ⚠️ **`pendingSyncCount` counts CONFLICT ops too** (`countOps`, not `countPendingOps`) and is driven
   by service-worker messages nothing sends.
7. ⚠️ **The card marker renders only for `visibleOrders`** — its own comment records this.

**Divergent on the DASHBOARD:** `deviceQueuedOrders` and the prep-pill auto-strike, both of which
correspond to features the KDS does not have.

**RECOMMENDING NOTHING. Facts only.**

---

# 🔴 VERIFICATION

**Nothing was compiled and no device was used. There is no behaviour verification in this report.**

| Claim | Method |
|---|---|
| The thirteen quoted modules are identical in HEAD | ✅ **EXECUTED** — `git diff --quiet HEAD` per file |
| The KDS's `handleAction` is unchanged from HEAD | ✅ **EXECUTED** — direct `diff` of both extracts |
| The dashboard's offline path is unchanged from HEAD | ✅ **EXECUTED** — filtered `git diff -U0` |
| The KDS has no payment overlay / no `deviceQueuedOrders` | ✅ **EXECUTED** — `grep -c` → 0 for each |
| The SW's queue is inert | ✅ **EXECUTED** — one `enqueue(` hit, the definition |
| `onAppResume` has three consumers, none of them the KDS | ✅ **EXECUTED** — repo-wide scan |
| Both surfaces mount `OfflineBanner` + `useOutboxConflicts` | ✅ **EXECUTED** — scan, both call sites quoted |
| Every quoted branch, gate and condition | ✅ **EXECUTED** — read in full, quoted verbatim |
| **What an operator SEES in each failure case** | 🔴 **SOURCE READ ONLY** — traced from branch structure. **No banner was rendered** |
| **Preferences survives cold kill / restart** | 🔴 **NOT VERIFIED AT ALL** — the module's own claim, restated. Nothing here tests it |
| **The overlay reappears an order after a conflict** | 🔴 **SOURCE READ ONLY** |
| **A double replay charges once** | 🔴 **SOURCE READ ONLY** — read from three guards, not executed against a database |
| **What the WebView shows when the origin is unreachable** | ⚠️ **CANNOT BE DETERMINED READ-ONLY** |
| **Whether `pendingSyncCount` is ever reset** | ⚠️ **CANNOT BE DETERMINED READ-ONLY** — no source states it |

---

# INTEGRITY

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. A SEPARATE pass over this report AFTER it was written. It is the only
file this task wrote.**

```
  docs/offline-outbox-parity-report.md   (SEPARATE PASS)     50,294  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 80 | 0 | 80 |
| U+1F534 LARGE RED CIRCLE | 70 | 0 | 70 |
| **U+26A0 WARNING SIGN** | **33** | **29** | 🔴 **4** |
| U+2717 BALLOT X | 6 | 0 | 6 |
| U+21A9 LEFTWARDS ARROW WITH HOOK | 4 | 0 | 4 |

# 🔴 THIS REPORT HAS FOUR BARE U+26A0, AND ALL FOUR ARE CORRECT. HERE IS WHY.

**Every warning sign I wrote is paired — 29 of 29. The bare ones are TWO STRINGS, each appearing twice
(once in Q4 and once quoted again here), and both are VERBATIM QUOTES of
`components/native/OfflineBanner.tsx`'s own bare glyphs:**

```
          <div className="text-base font-black tracking-wide">⚠ PAYMENT NOT RECORDED</div>
      <span>⚠ {nameOrders(statusConflicts)} — update didn&apos;t sync, needs review</span>
```

✅ **EXECUTED — `OfflineBanner.tsx` itself measures `U+26A0 n=4 paired=2 bare=2`, and its two bare
glyphs are exactly these two strings.** ⚠️ **Pairing them here would have misquoted the banner copy
this report is reporting on** — which is the case the per-base form exists to expose, and which a raw
total would have hidden.

✅ **The report's total `U+FE0F` count is 29, which exactly accounts for the 29 paired warning signs and
leaves none attached to any other base.** ✅ **The four unpaired bases are internally consistent — 0 of
80, 0 of 70, 0 of 6, 0 of 4 — so no base is split across two renderings.** ⚠️ **`U+1F4F4` (📴) does NOT
appear in this report: both banner strings that carry it were quoted without their emoji line.**

## `git status --porcelain`

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
 M lib/settings-copy.ts
?? components/shared/CuisinePicker.tsx
?? components/shared/EventActionsModal.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/extend-removal-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-event-bar-fix-report.md
?? docs/kds-event-bar-report.md
?? docs/kds-exit-point-report.md
?? docs/kds-pill-audit-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-status-badge-report.md
?? docs/kds-step-switches-report.md
?? docs/kds-steps-model-report.md
?? docs/kds-toggles-review-report.md
?? docs/kds-two-switches-build-report.md
?? docs/kds-two-switches-report.md
?? docs/kds-view-removal-report.md
?? docs/offline-outbox-parity-report.md
?? docs/settings-copy-report.md
?? lib/event-display.ts
```

**Which entries were already there before this pass began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/offline-outbox-parity-report.md`** | 🔴 **THIS PASS — the ONLY new entry, and the only file written** |
| `M app/dashboard/[token]/kds/page.tsx` · `M app/dashboard/[token]/page.tsx` | ✅ pre-existing — nine earlier tasks. **READ ONLY here** |
| `M components/dashboard/OrderCard.tsx` | ✅ pre-existing — the step switches, 42 lines. **Not touched** |
| `M app/manage/[token]/page.tsx` · `M components/DemoGetStarted.tsx` · `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/dashboard/AddOrderPanel.tsx` · `?? lib/event-display.ts` | ✅ pre-existing — the display extractions |
| `M lib/settings-copy.ts` | ✅ pre-existing — the settings copy task |
| `M docs/reference-manual.md` | ✅ pre-existing — V11.22 |
| `?? components/shared/EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/*.md` (fourteen earlier reports) | ✅ pre-existing |

✅ **Eight modified and twenty untracked before this pass; eight modified and twenty-one untracked
after. The single delta is this report.**
