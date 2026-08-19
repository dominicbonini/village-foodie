# Live submit timeout — 10 s → 5 s

**One file changed: `lib/native/orderGate.ts`. One executable line.** The drain bound, `isOnline()`,
reachability, the UI, the mint, the stamp, the queue and the server are all untouched.

🔴 **UNOBSERVED.** Nothing was exercised on a device. Every behavioural statement is **READ-FROM-SOURCE**.

⚠️ **The prompt arrived TWICE, byte-identical.** Flagged as instructed. Not a contradiction and not a
garbled span — the two copies agree, so I acted on it once.

---

## Before the edit — the constant and its justification comment

```ts
/** Live-submit bound. An operator is WAITING on this one, and the panel holds seven controls disabled
 *  until it settles — 83 seconds was observed on hardware. 10s is comfortably inside reachability's own
 *  ~30s offline verdict, so a genuinely dead uplink still falls through to the queue rather than being
 *  pre-empted, while a slow-but-working one has ample time to answer a small POST. */
const LIVE_TIMEOUT_MS = 10_000
```

🔴 **The comment NAMED the figure and reasoned from it — twice.** It stated "10s is comfortably inside
reachability's own ~30s offline verdict", and it justified the size with "ample time to answer a small
POST". **Left alone, both clauses would have been false the moment the value changed.** Per the brief, it
was updated with the value.

**For contrast, the drain bound and its comment — quoted to show what was NOT touched:**

```ts
/** Drain bound. Nobody is waiting on a replay, so this is generous — but it MUST exist: an unbounded
 *  fetch here never settles, `drainInFlight` never clears, and every later drainOutbox() returns the same
 *  dead promise. That is what stranded an order for 39 minutes. */
const DRAIN_TIMEOUT_MS = 30_000
```

**That comment states no figure in prose**, so nothing in it needed changing even had it been in scope.

---

## After the edit

```ts
/** Live-submit bound. An operator is WAITING on this one, and the panel holds seven controls disabled
 *  until it settles — 83 seconds was observed on hardware. 5s is comfortably inside reachability's own
 *  ~30s offline verdict, so a genuinely dead uplink still falls through to the queue rather than being
 *  pre-empted, while a slow-but-working one has time to answer a small POST. */
const LIVE_TIMEOUT_MS = 5_000
```

**Two prose edits, both forced by the value:** `10s` → `5s`, and `ample time` → `time`. ⚠️ **"ample" was
dropped rather than kept**: at 5 s it would have been an overstatement, and the point of updating a
justification comment is that it stops being an argument for the old number.

✅ **The reasoning still holds at the new value, which is why the shape of the comment did not change.**
5 s remains inside reachability's ~30 s verdict — in fact further inside it, so the property the comment
claims (a dead uplink falls through to the queue rather than being pre-empted by a bound that fires first)
is *more* comfortably true, not less.

---

## Verification, by EXECUTION

```
1. constant reads 5_000              : True
2. drain bound unchanged             : True
3. no remaining '10_000' in the file : True
   no remaining '10s' in the file    : True
```

**Full diff — 6 changed lines, of which 2 are executable:**

```
    - *  until it settles — 83 seconds was observed on hardware. 10s is comfortably inside reachability's own
    + *  until it settles — 83 seconds was observed on hardware. 5s is comfortably inside reachability's own
    - *  pre-empted, while a slow-but-working one has ample time to answer a small POST. */
    -const LIVE_TIMEOUT_MS = 10_000
    + *  pre-empted, while a slow-but-working one has time to answer a small POST. */
    +const LIVE_TIMEOUT_MS = 5_000
```

```
   of which EXECUTABLE (non-comment): 2
    -const LIVE_TIMEOUT_MS = 10_000
    +const LIVE_TIMEOUT_MS = 5_000
```

🔴 **CHANGED-LINE COUNT: 6 total, 2 executable — a single constant, minus and plus.** The other four are
the two comment lines that named or reasoned from the figure.

**Nothing else moved, counted rather than asserted:**

```
   isOnline                                 before=1 after=1 OK
   AbortSignal.timeout(timeoutMs)           before=1 after=1 OK
   mintedProvisional                        before=7 after=7 OK
   queuedBody.manualOrder                   before=4 after=4 OK
   await post(url, body, LIVE_TIMEOUT_MS)   before=1 after=1 OK
   await post(syncing.url, syncing.body)    before=1 after=1 OK
   MAX_ATTEMPTS                             before=6 after=6 OK
```

✅ **`git diff --stat` on `lib/native/reachability.ts`, `components/dashboard/AddOrderPanel.tsx` and
`app/api/dashboard/action/route.ts` is EMPTY** — reachability, the panel and the server are untouched.

---

## 🔴 What now happens to an order placed while the uplink is dead

**READ-FROM-SOURCE, unobserved.** Two cases, because `isOnline()` decides which route is taken and it lags:

### Case A — reachability has already flipped (`isOnline() === false`)

```ts
  if (isNativeApp() && online === false) return queue()
```

**No fetch is attempted at all.** The panel is locked only for the local work — a `Preferences` read, a
mint and a write, i.e. **milliseconds**. The order queues and **carries a minted number**, shown on the
card because `queue()` returns it.

⚠️ **The new value changes nothing on this path.** There is no timeout to run.

### Case B — inside the stale-true window (`isOnline()` still returning `true`)

This is the case the change is for. `isOnline()` needs **three consecutive failed pings on a 10-second
interval**, so it keeps returning `true` for roughly 30 seconds after real connectivity loss.

1. The live POST is attempted with `AbortSignal.timeout(5_000)`.
2. **The panel is locked for ~5 seconds**, not ~10 and not the 83 observed before any bound existed —
   `setLoading(true)` runs before the await and clears in the `finally`.
3. The abort rejects the fetch → `catch` → `if (isNativeApp()) return queue()`.
4. `queue()` mints the provisional, stamps it into `manualOrder.provisional_id`, enqueues, and returns it.
5. `displayId = result.provisional_id` — **the card shows the number that was sent.**

**So: locked ~5 s, it queues, and it carries a minted number that matches what will be replayed.**

⚠️ **THE BOUND CAPS THE LOCK; IT DOES NOT REMOVE IT.** Five seconds of a dead panel mid-service is still
five seconds, and reaching zero means not disabling the panel on a request that may not return — **a UI
decision, out of scope here and not built.**

⚠️ **And the trade this halves is real in the other direction too:** a slow-but-working uplink that would
have answered between 5 s and 10 s now aborts and queues. **The order is not lost** — it replays with its
number intact, which is the whole point of the mint-at-enqueue work — but it takes the offline path when it
need not have. **On a marginal signal that will happen more often at 5 s than at 10 s.** Stated because the
trade moved, not because the value is wrong.

---

## Not offered as verification

`tsc` was not run and would prove nothing here: `10_000` and `5_000` are both valid numbers. `next dev` and
`next build` were not run. **No submit was exercised.**

**What would settle the behavioural claims:** place an order with the uplink pulled and time the panel
lock, then confirm the card's number matches the resulting `orders.id`.

---

## Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** each write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

**Result: zero NUL bytes and zero other flagged control bytes on both files.** Counts, the non-ASCII class
delta and the per-base carrier-aware variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
