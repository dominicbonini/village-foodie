# Offline order queue — a stuck item that cannot drain

**DIAGNOSIS ONLY. Nothing was changed.** No file was edited except this report. No build was run.

🔴 **THE COLLISION HYPOTHESIS IS REFUTED against the code as it now stands** (§6) — but with a caveat that
matters more than the refutation: **the code in this repo may not be the code that ran on that iPad
tonight** (§6b). The observed `N38 → 38` renumbering is *not what the current source produces*.

**Every path below is the OPERATOR path** — `AddOrderPanel` → `/api/dashboard/action`. The customer path
(`/api/orders/submit`) was **not** read and nothing here should be generalised to it.

---

## 1 · The offline queue — file, mechanism, shape

**File:** `lib/native/outbox.ts`. **READ.**

**Mechanism:** Capacitor `Preferences` — on iOS an `NSUserDefaults` plist inside the app sandbox. One key
per op, `hg_outbox_op_<op_id>`, so each enqueue is a single atomic set. **READ:**

```ts
import { Preferences } from '@capacitor/preferences'
…
const KEY_PREFIX = 'hg_outbox_op_'
const SEQ_KEY = 'hg_outbox_seq'          // monotonic per-device counter (ordering, clock-independent)
const DEVICE_LETTER_KEY = 'hg_device_letter'
```

**Shape, verbatim. READ:**

```ts
export interface OutboxOp {
  op_id: string          // uuid — dedupe / logging
  kind: OutboxKind
  order_key: string      // uuid, client-minted at create — THE server idempotency key
  url: string            // endpoint to replay to (e.g. /api/dashboard/action)
  body: Record<string, unknown>  // the POST payload (already includes order_key / action / manualOrder)
  seq: number            // per-device monotonic → FIFO replay (a create precedes its own status ops)
  client_ts: number      // display only — NEVER used for reconciliation
  attempts: number
  provisional_id: string // device-prefixed display number for offline creates (e.g. 'A13'); '' for status ops
  state: 'pending' | 'syncing' | 'conflict'
  last_error?: string    // last drain failure (HTTP status + server error, or thrown-fetch) — for the dev inspector
}
```

The `N` in `N38`/`N39` is this device's letter, derived deterministically from `device_id` by
`deviceLetter()` and persisted at `hg_device_letter`. **READ.**

---

## 2 · What triggers a flush

`drainOutbox()` has **exactly two call sites in the entire app**, both in
`components/native/OfflineBanner.tsx`. **READ** (executed grep: no other file calls it).

**Trigger A — reachability transition to online** (`:95`):

```tsx
    const unsub = onReachabilityChange((online) => {
      onlineRef.current = online
      if (!online) { cancelRetry(); retryAttempt.current = 0; setPhase('offline'); return }
      // Back online → drain, re-fetch upstream data, then keep retrying anything still pending.
      void (async () => {
        const pending = await countPendingOps()
        if (pending === 0) { await refreshCounts(); setPhase('online'); return }
        setPhase('syncing')
        const r = await drainOutbox()
        …
        if (r.remaining > 0) scheduleRetry()   // transient failure left pending ops → retry with backoff
```

**Trigger B — the backoff retry chain** (`:72`):

```tsx
  const scheduleRetry = useCallback(() => {
    if (retryTimer.current || !onlineRef.current) return
    const delay = Math.min(5000 * 2 ** retryAttempt.current, 60000)
    retryTimer.current = setTimeout(async () => {
      retryTimer.current = null
      if (!onlineRef.current) return
      retryAttempt.current++
      const r = await drainOutbox()
      …
      if (r.remaining > 0 && onlineRef.current) scheduleRetry()
      else retryAttempt.current = 0
    }, delay)
  }, [refreshCounts])
```

🔴 **THAT IS THE COMPLETE LIST. There is NO visibility-change trigger, NO app-resume trigger, NO manual
"retry now" control, and the 5-second interval does NOT drain** — it only recounts:

```tsx
    const pollCount = setInterval(() => { void refreshCounts() }, 5000)
```

```tsx
  const refreshCounts = useCallback(async () => {
    setQueued(await countPendingOps())
  }, [])
```

**Which would have fired, given the observed sequence?** **INFERRED.** Trigger A fired on the reconnect
that drained N38 (44 seconds, consistent with a reachability transition plus a drain). After that,
**Trigger A cannot fire again while the device stays online — it is edge-triggered, not level-triggered.**
So everything after that first reconnect depends **entirely on Trigger B**, and Trigger B only re-arms
itself from inside its own completed callback. 🔴 **If one `drainOutbox()` call never resolves, the chain
has no other source of ticks and stops for good.**

---

## 3 · 🔴 Ordering, and head-of-line blocking — the most important answer

**Ordering: YES, strict FIFO by `seq`.** `listOps()` ends `return ops.sort((a, b) => a.seq - b.seq)`.
**READ.**

**Does a failure block the items behind it? IT DEPENDS ON THE FAILURE MODE, and one of them blocks.**
**READ** — the loop verbatim:

```ts
async function drainOnce(): Promise<DrainResult> {
  const ops = (await listOps()).filter(o => o.state !== 'conflict')
  let synced = 0, conflicts = 0
  for (const op of ops) {
    …
    const syncing = { ...op, state: 'syncing' as const, attempts: (op.attempts ?? 0) + 1 }
    await saveOp(syncing)
    let res: Response
    try {
      res = await post(syncing.url, syncing.body)
    } catch (e: unknown) {
      const last_error = `network: ${e instanceof Error ? e.message : 'thrown fetch (no response)'}`
      if (syncing.attempts >= MAX_ATTEMPTS) { await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++; continue }
      await saveOp({ ...syncing, state: 'pending', last_error })
      break
    }
```

| Failure mode | Blocks the queue behind it? |
|---|---|
| **Thrown fetch, `attempts < 5`** | 🔴 **YES — `break` exits the whole loop.** |
| Thrown fetch, `attempts >= 5` | ❌ No — `continue`, flagged `conflict`. |
| HTTP 409 | ❌ No — flagged `conflict`, loop continues. |
| HTTP non-2xx, `attempts >= 5` | ❌ No — flagged `conflict`, loop continues. |
| HTTP non-2xx, `attempts < 5` | ❌ No — left `pending`, **loop continues**. |
| 🔴 **A `fetch` that never settles** | 🔴 **YES, AND PERMANENTLY — see below.** |

**`MAX_ATTEMPTS = 5`** (`lib/native/orderGate.ts:17`). **READ.**

### 🔴 The unbounded fetch

```ts
async function post(url: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
```

**READ: there is NO timeout, NO `AbortController`, and NO `AbortSignal.timeout`.** A `fetch` that hangs
never resolves and never rejects, so it never reaches the `catch`, never increments toward `MAX_ATTEMPTS`,
and never flips to `conflict`.

Combined with the drain lock:

```ts
let drainInFlight: Promise<DrainResult> | null = null

export async function drainOutbox(): Promise<DrainResult> {
  if (drainInFlight) return drainInFlight                        // already running → coalesce (race fix)
  drainInFlight = drainOnce().finally(() => { drainInFlight = null })
  return drainInFlight
}
```

🔴 **One hung `fetch` wedges the queue permanently.** `drainInFlight` never clears, so every later
`drainOutbox()` returns the same never-settling promise; `scheduleRetry`'s callback awaits it forever and
never re-arms; the op stays `state: 'syncing'` with `attempts` frozen. **INFERRED** — the mechanism is
READ, that it is what happened tonight is not.

---

## 4 · Non-2xx handling

**READ**, verbatim:

```ts
    if (res.ok) {
      await removeOp(syncing.op_id); synced++
    } else {
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      const last_error = `HTTP ${res.status}${(data as any)?.error ? ` — ${(data as any).error}` : ''}`
      if (res.status === 409) {
        await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++
      } else if (syncing.attempts >= MAX_ATTEMPTS) {
        await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++   // give up auto-retry → surface for review
      } else {
        await saveOp({ ...syncing, state: 'pending', last_error })                 // transient server error → retry next drain
      }
    }
```

**Precisely:** never dropped, never retried forever. **409 → immediate dead-letter** (`state: 'conflict'`).
**Any other non-2xx → retried up to 5 attempts, then dead-lettered.** The item is **never deleted** —
`removeOp` is called only on `res.ok`.

**4xx vs 5xx: the code does NOT distinguish them.** The only status singled out is **409**. A 400, 401,
403, 404 and a 500 are treated identically: retry to 5, then `conflict`. **READ.**

⚠️ **A dead-lettered op is still fully recoverable** — `clearConflicts()` has zero call sites and the
module's own comment insists it stays that way.

---

## 5 · Is a failure surfaced to the operator?

**An error state EXISTS, and the observed state is the one gap it does not cover.** **READ.**

There is a conflict banner (`listUnacknowledgedConflicts` → `useOutboxConflicts` → `OfflineBanner`),
separate from the sync banner, described in the file's own comment as *"their OWN banners, always
actionable (never a silent stuck 'syncing')"*.

🔴 **But it is reached ONLY via `state === 'conflict'`.** The observed op is not in `conflict` — if it
were, `countPendingOps()` would exclude it and the amber badge would read 0, not 1:

```ts
export async function countPendingOps(): Promise<number> {
  return (await listOps()).filter(o => o.state !== 'conflict').length
}
```

**So why no error appeared: INFERRED — the op never reached a terminal state.** An op stuck at `pending`
or `syncing` has, by construction, no banner of its own; the amber "syncing…" strip is the *only* thing
that renders for it, and it says the same words at minute 1 and minute 40. **There is no elapsed-time
escalation, no "stuck" state, and no surfacing of `last_error` outside the dev-only
`DevOutboxInspector`** (`IS_PROD || !isNativeApp() → return null`). **READ.**

---

## 6 · 🔴 The collision — CONFIRMED AS A DESIGN CONCERN, REFUTED AS TONIGHT'S MECHANISM

### What the queued item carries

`provisional_id` is on the op (`'N39'`), and `AddOrderPanel` also puts it in the POST body
(`provisional_id: provisional || null`) inside `manualOrder`. **READ.** It is derived by stripping the
letter off the highest known id and incrementing:

```tsx
    const highest = orders.reduce((m, o) => Math.max(m, parseInt(String(o.id).replace(/^\D+/, ''), 10) || 0), 0)
    void seedProvisionalSeq(highest)
```

### What the server does with it — it IGNORES it

**READ**, `app/api/dashboard/action/route.ts`, the operator submit path:

```ts
        const provisionalId: string | null =
          typeof manualOrder?.provisional_id === 'string' && manualOrder.provisional_id ? manualOrder.provisional_id : null
        const placedOffline = (manualOrder as { placed_offline?: unknown })?.placed_offline === true || provisionalId !== null
        // THE NUMBER IS ALWAYS THE NEXT UNUSED EVENT NUMBER. The client's provisional number is NEVER
        // adopted as the display id and NEVER written to the counter: a device's own sequence is lifelong
        // and per-device, the event counter is per-event and starts at 1, and adopting one into the other
        // is what left order_counter at 19 with seven rows on 21 August.
        try {
          newOrderId = await nextOrderId(orderEventId, truck.id)
        } catch (err: any) { … }
        if (placedOffline) {
          const deviceLetter = provisionalId && /^[A-Za-z]/.test(provisionalId) ? provisionalId[0].toUpperCase() : ''
          newOrderId = `O${deviceLetter}${newOrderId}`
        }
```

`nextOrderId` is the atomic counter RPC — **READ**, `lib/order-utils.ts`:

```ts
    const { data, error } = await supabase.rpc('increment_event_order_counter', { p_event_id: eventId })
```

### 🔴 Verdict: a queued item CANNOT collide on `(event_id, id)` under this code

**The provisional id never becomes `orders.id`.** A replayed offline create is assigned the next atomic
counter value and then **prefixed** — `O` + device letter + number, e.g. **`ON40`**. An online order is
the bare number, e.g. `40`. `'ON40' ≠ '40'`, so the partial unique index cannot be violated by this
mechanism, and two devices draining at once take different counter values because the RPC is atomic.
**REFUTED, from the code.**

⚠️ **And if it ever did violate:** the insert is a plain `.insert(...).select('order_key').single()` — a
unique violation returns a Postgres error, the route logs it and returns **`{ error: 'Failed to save
order' }` with status 500**. **Not a 409.** So on the drain that is *not* the dead-letter branch — it is
the "retry to 5 then conflict" branch. The order would eventually be flagged, not silently lost. **READ.**

### 6b · 🔴 THE CAVEAT THAT MATTERS MORE THAN THE REFUTATION

**The observation contradicts the current source.** Under the code above, N38 replaying should have
produced **`ON38`-style** (`O` + `N` + the server number), not **`38`**. And you report ids **1..39 with no
gaps** — a set with no `O`-prefixed member at all.

**`git log -S` dates the `O`-prefix scheme to `f9c6972`, 18 Aug 14:41.** The iOS app is a remote-URL shell
loading Vercel, so **what ran tonight is whatever was deployed, which I cannot inspect from here.**

🔴 **CANNOT DETERMINE whether the deployed build contains this renumbering.** The observation is
consistent with an **older deployed build** that adopted the provisional number and stripped its prefix
(`N38 → 38`) — and *that* build is exactly the one in which a collision is reachable, because it would
write a bare number the server counter may also have issued. **What would settle it:** compare the
deployed bundle's behaviour, or place one offline order on the current deployment and read the resulting
`orders.id` — an `ON`-prefixed id proves the fix is live; a bare number proves it is not.

---

## 7 · Live order vs drained queue item — same path or not?

**SAME endpoint, DIFFERENT caller, and they cannot block each other.** **READ.**

Both post to `/api/dashboard/action` with the same `manualOrder` body shape. The difference is **who
posts**:

- **Online:** `AddOrderPanel` → `gatedAction(...)`, which attempts the network directly and returns the
  result. It does **not** touch `drainInFlight`.
- **Queued:** `drainOnce()` → `post(op.url, op.body)`, inside the serialized drain.

🔴 **This is why the third order inserted in 450 ms while N39 sat stuck: the live path never enters the
drain's lock.** A wedged drain has no effect whatever on a new online order. **INFERRED** from the two
call paths; consistent with the observation.

⚠️ The queued body carries extras the live one does not — `gatedAction` merges `expectedFrom` and
`queuedExtra` **into the QUEUED body only**, and stamps `placed_offline`. So the two requests are *not*
byte-identical, and a server-side rejection could in principle affect one and not the other.

---

## 8 · The badge

**Source: `queued`, set from `countPendingOps()`.** **READ:**

```tsx
  } else if (queued > 0) {
    syncBanner = (
      <div className="w-full bg-amber-500 text-white text-sm font-semibold px-4 py-2 text-center">
        {queued} {queued === 1 ? 'change' : 'changes'} saved on this device, syncing…
      </div>
    )
```

**It reflects QUEUE LENGTH excluding conflicts** — `listOps().filter(o => o.state !== 'conflict').length`.
So `pending` **and** `syncing` both count. **It is not a progress indicator and not a network state:** the
word "syncing…" is hard-coded into that branch and is displayed whenever any non-conflict op exists,
whether or not anything is being attempted.

**What clears it:** only `removeOp` on a 2xx, or the op flipping to `conflict`. The count is re-read every
5 s by `pollCount`, so it is live — **the number is right; the word "syncing" is the part that was
untrue.**

---

## 9 · Is the queued item recoverable? — WHAT IS SAFE TO DO TO THAT iPad

**It lives in Capacitor `Preferences` → iOS `NSUserDefaults`, in the app's sandbox, at key
`hg_outbox_op_<op_id>`.** **READ**, from the module header:

```
//   • Persists to disk and survives force-quit + device restart (it is NOT WebKit "website data", so — unlike
//     WKWebView IndexedDB/localStorage — it is never evicted under WebKit storage pressure).
```

| Action | Survives? |
|---|---|
| Backgrounding the app | ✅ **YES** — READ |
| Cold launch / force-quit / device restart | ✅ **YES** — READ (explicitly the design requirement) |
| Clearing Safari/WebKit website data | ✅ **YES** — READ; this is not WebKit storage |
| 🔴 **DELETING AND REINSTALLING THE APP** | 🔴 **NO — THIS DESTROYS THE ORDER. THE SANDBOX GOES WITH THE APP AND THE ORDER IS IN NO OTHER PLACE. DO NOT REINSTALL THAT iPad.** — INFERRED from the storage mechanism |
| 🔴 **"Clear storage" / offloading the app** | 🔴 **NO — TREAT AS DESTRUCTIVE. DO NOT DO IT.** — INFERRED |
| Calling `clearAllOps()` / `clearConflicts()` from the dev inspector | 🔴 **NO — DELETES THE OP.** — READ |

⚠️ **One documented residual, from the module's own header:** a force-quit in the sub-second window after
an enqueue could drop that single write, because `NSUserDefaults` flushes on the OS's schedule. **N39 was
enqueued over 40 minutes ago, so that window is long closed** — but it means a force-quit is not *provably*
free, only overwhelmingly likely to be.

🔴 **Safest read-only recovery:** the order's full POST body is in `op.body`. It could be read out via the
dev inspector (dev builds only) or replayed by hand. **Nothing in this report requires touching the
device.**

---

## 10 · Places that parse or sort `orders.id` as a number — data-gathering only

**Executed sweep. Two sites. READ.**

```
components/dashboard/AddOrderPanel.tsx:302
    const highest = orders.reduce((m, o) => Math.max(m, parseInt(String(o.id).replace(/^\D+/, ''), 10) || 0), 0)

components/dashboard/AddOrderPanel.tsx:1092
    .sort((a, b) => a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id))
```

- **`:302`** strips a leading non-digit run before `parseInt`, so `'N39' → 39` and `'ON40' → 40`. It
  **tolerates** the prefix by design. ⚠️ But `|| 0` means an unparseable id silently becomes 0, which
  cannot lower the `Math.max` — a malformed id is invisible rather than loud.
- **`:1092`** sorts ids as **strings**, not numbers: `'10'.localeCompare('9')` is negative, so 10 sorts
  before 9. Pre-existing and unrelated to prefixes.

⚠️ **Reported only, per the brief. No redesign proposed.**

---

## What I could not determine, and what would settle it

**CANNOT DETERMINE: why this specific op has not drained.** Two hypotheses fit every observation and the
code cannot discriminate between them without device state:

| Hypothesis | Predicted op state | Predicted `attempts` |
|---|---|---|
| **A — hung `fetch`** (no timeout; `drainInFlight` wedged) | `syncing` | frozen at some N ≥ 1, not advancing |
| **B — the retry chain simply stopped** (no further reachability edge; `scheduleRetry` never re-armed) | `pending` | 0, or 1–4 with a `last_error` |

🔴 **The single observation that settles it: read the op's `state`, `attempts` and `last_error`.** The dev
inspector (`DevOutboxInspector`) renders exactly those three fields — but it is `IS_PROD || !isNativeApp()
→ return null`, so **it will not render on the production build on that iPad.** Reading them therefore
needs a dev build or direct `NSUserDefaults` inspection.

**Hypothesis A is the one the code makes possible and nothing guards against:** an unbounded `fetch`
behind a promise-coalescing lock, with the only retry source being a chain that re-arms from inside that
same awaited call. **I am not claiming it is what happened.**

**Also CANNOT DETERMINE:** whether the deployed bundle matches this source (§6b) — which governs whether
the collision risk was ever live.

**No instruction in this prompt contradicted another, and no span arrived garbled.**

---

## Integrity census

Byte-level pass with a byte tool (`open(path,'rb')`, integer comparison), run as a **separate pass after**
the file was written — never grep. Figures in the chat reply, including the per-base carrier-aware
variation-selector counts. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

⚠️ This file cannot print its own byte length inside itself — writing the number changes it. The
digit-stable figure is the flagged count: **zero**.
