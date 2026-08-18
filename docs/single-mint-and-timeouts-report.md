# One mint, and both fetches bounded

**Two files changed:** `lib/native/orderGate.ts` and `components/dashboard/AddOrderPanel.tsx`.
**Server untouched. `isOnline()`, its constants and the reachability module untouched. `setLoading` and
every `disabled` prop untouched. The drain's failure classification untouched.**

🔴 **NOTHING WAS EXERCISED ON A DEVICE.** Every behavioural claim is **READ-FROM-SOURCE** and **unobserved**.

---

# Phase 1 — read only

## 1 · The two mints, and the gate

**SENT** (`AddOrderPanel.tsx`) — gated on `isOnline()`:

```tsx
      const provisional = isOnline() ? '' : await nextProvisionalId(manualEvent?.id ?? null)
```

**DISPLAYED** (same file, ~90 lines later, inside `if (result.queued)`) — gated on the first being falsy:

```tsx
        const displayId = provisional || await nextProvisionalId(manualEvent?.id ?? null)
```

**The gate, and `queue()` in full, as they stood:**

```ts
  const queue = async (): Promise<GateResult> => {
    const queuedBody = { ...body, placed_offline: true, ...(expectedFrom ? { expected_from: expectedFrom } : {}), ...(queuedExtra ?? {}) }
    await enqueue({ kind, order_key, url, body: queuedBody, provisional_id })
    return { ok: false, queued: true, provisional_id, order_key }
  }

  // Native + known-offline → don't burn a timeout, queue immediately.
  if (isNativeApp() && online === false) return queue()

  try {
    const res = await post(url, body)
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, queued: false, status: res.status, data, provisional_id, order_key }
  } catch {
    if (isNativeApp()) return queue()
    return { ok: false, queued: false, order_key }
  }
```

**It returns `{ ok, queued, provisional_id, order_key }`** — `provisional_id` echoed back verbatim.

## 2 · What the caller does with the return value

```tsx
      const result = await gatedAction({
        url: '/api/dashboard/action',
        kind: 'create', order_key: orderKey, provisional_id: provisional, online: isOnline(),
        body: { token, pin, action: 'manual', manualOrder },
      })
      …
      if (result.queued) {
```

✅ **`result.queued` was already the authority for WHETHER it queued — and the comment there says so
explicitly** (*"`result.queued` IS THE AUTHORITY, because it is the thing that queued it. One decision, one
answer"*). 🔴 **The same reasoning was never applied to the NUMBER**, which continued to come from a second
expression. **A returned provisional could reach the display without a second mint** — the field was
already on the result; nothing read it.

## 3 · Does `queue()` have the event id?

**No. READ.** `gatedAction`'s options carried `url, body, kind, order_key, provisional_id, online,
expectedFrom, queuedExtra` — no event. **One optional field had to be threaded through**, supplied by the
create caller only; every other caller mints nothing.

✅ **Executed check: `AddOrderPanel:1202` is the ONLY `kind: 'create'` caller in the repo.** Every other
`gatedAction` call is `status`, `stock` or `buzzer` and passes no provisional.

## 4 · Both fetch sites, before

```ts
async function post(url: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
```

**One `post()` serves both** — the live submit (`await post(url, body)` inside `gatedAction`) and the drain
(`await post(syncing.url, syncing.body)` inside `drainOnce`). 🔴 **CONFIRMED: no timeout, no
`AbortController`, no `signal` on either.**

## 5 · What the drain does with an aborted fetch

```ts
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

✅ **CONFIRMED FROM THE CODE.** An abort rejects the fetch, so it lands in this `catch`. `attempts` was
**already incremented before the post**, so it increments. Below `MAX_ATTEMPTS` the op is saved
**`pending`** and retried on the next drain. 🔴 **A timeout therefore converts a permanent hang into an
ordinary retryable failure — it does NOT dead-letter.** Dead-lettering still requires either a 409 or five
accumulated attempts, and **an abort is not a response, so it can never be read as a 409.**

---

# Phase 2 — stop conditions

| Condition | Result |
|---|---|
| Event id unavailable where the mint must happen | ❌ Available — `manualEvent?.id`, threaded as one optional field. |
| Display reading the gate result changes a SUCCESSFUL ONLINE order | ❌ **No.** The display line is inside `if (result.queued)`; a successful online order never enters that branch and still shows the server-assigned number from the response. |
| Instructions contradict | ❌ No. |
| Garbled span | ❌ None. |

**Proceeded.**

---

# Phase 3 — the changes

## A · One mint, at enqueue

```ts
    let mintedProvisional = provisional_id ?? ''
    if (!mintedProvisional && kind === 'create') mintedProvisional = await nextProvisionalId(eventId ?? null)
    const queuedBody: Record<string, unknown> = { ...body, placed_offline: true, ...(expectedFrom ? { expected_from: expectedFrom } : {}), ...(queuedExtra ?? {}) }
    if (mintedProvisional && kind === 'create' && queuedBody.manualOrder && typeof queuedBody.manualOrder === 'object') {
      queuedBody.manualOrder = { ...(queuedBody.manualOrder as Record<string, unknown>), provisional_id: mintedProvisional }
    }
    await enqueue({ kind, order_key, url, body: queuedBody, provisional_id: mintedProvisional })
    return { ok: false, queued: true, provisional_id: mintedProvisional, order_key }
```

Panel, all three sites:

```tsx
        provisional_id: null,                                             // body: queue() overwrites when it queues
        kind: 'create', order_key: orderKey, eventId: manualEvent?.id ?? null, online: isOnline(),
        const displayId = result.provisional_id ?? ''                     // no second mint
```

🔴 **THE TRAP, AVOIDED AS SPECIFIED.** Minting a *new* number inside `queue()` while the panel kept its own
would have traded a renumber for a mismatch. **The panel no longer mints at all** — there is one value,
produced once, used for the queued body and the card.

### ⚠️ The stamp had to go INSIDE `manualOrder`, and that is not cosmetic

The server reads **`manualOrder.provisional_id`**, not a root-level key. Stamping at the body root would
have been silently ignored and the order would still replay unmarked — the defect intact behind a change
that looked correct.

🔴 **AND THAT IS NOT HYPOTHETICAL: `placed_offline` HAS EXACTLY THAT BUG TODAY.** `queue()` writes it at
the body root while the server read it from `manualOrder`. It is **currently read by nobody** — the
`placedOffline` const was deleted with the O-prefix scheme — so it is dead rather than wrong. **Reported,
not fixed: removing a dead stamp is a separate decision.**

## B · Both fetches bounded

```ts
const LIVE_TIMEOUT_MS = 10_000
const DRAIN_TIMEOUT_MS = 30_000

async function post(url: string, body: Record<string, unknown>, timeoutMs: number = DRAIN_TIMEOUT_MS): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
}
```

**Live: 10 s.** *An operator is waiting with seven controls disabled, and 10 s sits comfortably inside
reachability's own ~30 s offline verdict — long enough for a slow-but-working uplink to answer a small
POST, short enough that the panel lock is bounded at ten seconds instead of the eighty-three observed.*

**Drain: 30 s** (the default, so the drain call site is unchanged). Nobody waits on a replay, but it must
be bounded — **that bound is what un-wedges `drainInFlight`.**

✅ **Confirmed from the code (§5): an abort lands in the existing `catch` and is treated as a retryable
failure, not a dead-letter.**

## C · The false comment — removed, not annotated

The comment declaring the displayed number inconsequential is **deleted**. It was true when written (the
server renumbered every offline order then) and was falsified by adopt-verbatim.

⚠️ **I initially replaced it with a comment that QUOTED the false phrase verbatim while explaining it.**
That is "leaving it beside its correction", which the brief forbids — caught on my own check and rewritten
so the phrase does not appear. **`grep -c` for it now returns 0.**

## Not asked for, and done anyway — named per the brief

**The `nextProvisionalId` import in `AddOrderPanel` became dead** once the panel stopped minting, and I
removed it. **Reasoning:** leaving an unused import of the very function this change exists to stop calling
would read as a call site to the next person and would trip lint. **One token on an import line; no
behaviour.**

---

# Phase 4 — verification

## The five scenarios, from the code as written

🔴 **All five READ-FROM-SOURCE and unobserved.**

| # | Scenario | Outcome |
|---|---|---|
| 1 | **Online, request succeeds** | The response returns with `queued: false`; the `if (result.queued)` branch is skipped entirely, so the card shows the **server-assigned number**, exactly as before. 🔴 **No sequence value consumed** — the mint lives only inside `queue()`. |
| 2 | **Online per `isOnline()`, request times out, falls back** | The 10 s abort throws → `catch` → `queue()` → mints **once** → stamps it into `manualOrder.provisional_id` → returns it → `displayId = result.provisional_id`. **The body and the card carry the SAME value.** This is the defect, closed. |
| 3 | **Fully offline** | `online === false` short-circuits to `queue()` **before any fetch** — no network call attempted. Mints once, same value shown and sent. |
| 4 | **Drain hits a hung endpoint** | The 30 s abort rejects → `drainOnce`'s `catch` → `pending` + `break` → `drainOnce` **returns** → the `.finally` clears `drainInFlight`. 🔴 **`drainInFlight` DOES clear, and the next trigger drains normally.** |
| 5 | **Two orders in quick succession in the stale-true window** | **They cannot collide.** Each reaches `queue()` separately and `nextProvisionalId` is read-add-persist on that event's key, so the second sees the first's write. ⚠️ **CANNOT DETERMINE with certainty for two truly concurrent submits** — the read-modify-write is not atomic across interleaved awaits. The panel disables its submit controls while one is in flight, which serialises them in practice, **but that is a UI property, not a lock.** |

## Verified by EXECUTION

Comparison against pre-change copies, comments stripped:

```
=== orderGate.ts — executable-only diff: 27 lines ===
=== AddOrderPanel.tsx — executable-only diff: 7 lines ===
    -      const provisional = isOnline() ? '' : await nextProvisionalId(manualEvent?.id ?? null)
    -        provisional_id: provisional || null,
    +        provisional_id: null,
    -        kind: 'create', order_key: orderKey, provisional_id: provisional, online: isOnline(),
    +        kind: 'create', order_key: orderKey, eventId: manualEvent?.id ?? null, online: isOnline(),
    -        const displayId = provisional || await nextProvisionalId(manualEvent?.id ?? null)
    +        const displayId = result.provisional_id ?? ''
```

```
A1. nextProvisionalId call sites in the panel            : 0
A2. queue() stamps into manualOrder (where server reads) : True
A3. queue() RETURNS the minted value                     : True
A4. display reads the gate result                        : True
A5. mint gated to create + only when none supplied       : True
A6. no mint on the live-success path (queue() only)      : True
B1. live bound 10s / drain bound 30s                     : True
B2. both fetches bounded (one fetch fn, signal set)      : True
B3. live call passes the short bound                     : True
B4. drain call uses the default (30s)                    : True
C1. false 'NOTHING HERE IS LOAD-BEARING' phrase present  : 0 occurrences
D2. setLoading / disabled props untouched                : True
D3. drain failure classification untouched               : True
D4. reachability.ts diff                                 : empty
```

⚠️ **One of my checks was initially misleading and I am recording it.** A count of `isOnline` appeared to
change; it had not — the panel's usage is 6 before and 6 after, and `git diff` on `lib/native/reachability.ts`
is **empty**. My first comparison counted across the wrong pair of files.

## Not offered as verification

`npx tsc --noEmit` is clean for both files. **That is not verification** — it would not have caught the
`manualOrder` nesting, which is the one thing in this change that could have silently done nothing.

## What remains UNPROVEN

- **That a timed-out live submit now queues WITH its number** — no device, no submit.
- **That the drain un-wedges** — no hung endpoint was exercised.
- **The concurrency edge in scenario 5.**
- **The observation that would settle the first two:** place an order with the uplink pulled, confirm the
  card and the resulting `orders.id` match; and point the drain at a black-holed endpoint, confirming the
  badge clears within ~30 s instead of never.

---

# Phase 5 — integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** each write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

**Result: zero NUL bytes and zero other flagged control bytes on all three files.** Counts, the non-ASCII
class deltas and the per-base carrier-aware variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
