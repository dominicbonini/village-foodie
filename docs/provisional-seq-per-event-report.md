# Provisional sequence — scoped per event

**Two files changed:** `lib/native/orderGate.ts` (key shape + both functions) and
`components/dashboard/AddOrderPanel.tsx` (three call sites, one of which moved). **Server untouched.**

🔴 **NOTHING WAS EXERCISED ON A DEVICE.** Every behavioural claim is **READ-FROM-SOURCE** and
**unobserved**.

✅ **The trap is clear: an event uuid IS available offline at mint time** — it is React state, never a
fetch. No stop condition triggered. ⚠️ **But I found a second trap the brief did not name, and it would
have silently defeated the whole change** — see §The filter that is load-bearing.

---

# Phase 1 — read only

## 1 · The functions, the keys, and every call site

**`lib/native/orderGate.ts`** — the storage key and both functions, as they stood:

```ts
const PROV_SEQ_KEY = 'hg_prov_seq'
```

```ts
export async function nextProvisionalId(): Promise<string> {
  const letter = await deviceLetter()
  const cur = parseInt((await Preferences.get({ key: PROV_SEQ_KEY })).value ?? '0', 10) || 0
  const next = cur + 1
  await Preferences.set({ key: PROV_SEQ_KEY, value: String(next) })
  return `${letter}${next}`
}
```

```ts
export async function seedProvisionalSeq(highestKnown: number): Promise<void> {
  if (!Number.isFinite(highestKnown) || highestKnown <= 0) return
  const cur = parseInt((await Preferences.get({ key: PROV_SEQ_KEY })).value ?? '0', 10) || 0
  if (highestKnown > cur) await Preferences.set({ key: PROV_SEQ_KEY, value: String(highestKnown) })
}
```

**Call sites — three, all in `components/dashboard/AddOrderPanel.tsx`. READ** (executed grep; no other
file imports either function):

| Site | Line | Code |
|---|---|---|
| Seed | `:300-304` | `void seedProvisionalSeq(highest)` inside `useEffect(…, [orders])` |
| Mint 1 | `:1119` | `const provisional = isOnline() ? '' : await nextProvisionalId()` |
| Mint 2 | `:1219` | `const displayId = provisional \|\| await nextProvisionalId()` |

## 2 · 🔴 THE TRAP — is an event identifier available offline at mint time?

**YES. It is local React state, not a fetch. READ.**

```tsx
  const [manualEvent, setManualEvent] = useState<EventRecord | null>(todayEvent)
```

`manualEvent` is seeded once from the `todayEvent` **prop** and thereafter held in component state. **At
both mint sites it is already being read for other purposes**, which is the strongest evidence it is in
scope and populated there:

```tsx
        event_id: manualEvent?.id || null,
        event_date: manualEvent?.event_date || null,
```
```tsx
          slot: effectiveSlot, event_date: manualEvent?.event_date ?? null, event_id: manualEvent?.id ?? null,
```

**Nothing on the mint path fetches anything.** `nextProvisionalId` is called synchronously inside the
submit handler from values already in state. **So the approach does not fail offline, and I did not have
to stop.**

⚠️ **The honest limit:** `manualEvent` originates from a fetch *at some earlier point* (the dashboard's
`/api/dashboard` load, via `todayEvent`). A device **cold-launched offline having never loaded**, or one
where the operator has not selected an event, has `manualEvent === null`. That is the no-event case (§4),
not a failure of the approach.

## 3 · What identifies "the event", and is it stable offline?

**A uuid — `manualEvent.id`.** **READ.**

**Stable while offline: YES.** It is a value in React state; nothing revalidates or refetches it during a
submit. It changes only when the operator picks a different event in the panel, which is a deliberate act
and correctly *should* move the sequence to that event's key.

⚠️ Not the date: a date is not unique (two events can share one), and `event_date` is nullable on the
optimistic row. The uuid is the only stable identity.

## 4 · The no-event case

**Today:** `manualEvent` is null, and the provisional path **does not care at all** — `nextProvisionalId()`
took no argument and always used the one global key. So a no-event order minted from, and advanced, the
same lifelong counter as every event.

**Server side, for context:** `nextOrderId` falls back to `increment_order_counter(p_truck_id)` when there
is no event id — a truck-level counter. **READ**, unchanged by this task.

## 5 · Anything else reading `hg_prov_seq`, and what a key-shape change invalidates

**Nothing else reads it.** The executed sweep found the constant referenced only inside `orderGate.ts`;
the one other textual hit is a **comment** in `app/api/dashboard/action/route.ts:1610` describing the old
defect.

🔴 **No stored outbox op or UI state is invalidated.** An op stores `provisional_id` as an **already
resolved string** (`'N4'`), not a reference to the counter:

```ts
  provisional_id: string // device-prefixed display number for offline creates (e.g. 'A13'); '' for status ops
```

**So a queued op minted before this change replays with exactly the number it was given.** The key shape
governs only what the *next* mint reads. ✅ **No migration of queued work is needed.**

---

# Phase 2 — stop conditions

| Condition | Result |
|---|---|
| No event identifier reliably available offline at mint | ❌ Available — local state (§2). |
| Per-event scoping breaks monotonicity WITHIN an event | ❌ Cannot — see Phase 4, case 4. |
| Instructions contradict | ❌ No. |
| Garbled span | ❌ None. |

**Proceeded.**

---

# Phase 3 — the change

## a/b/c · Per-event keys, both functions

```ts
const PROV_SEQ_PREFIX = 'hg_prov_seq_'
const PROV_SEQ_NO_EVENT_KEY = 'hg_prov_seq_noevent'

function provSeqKey(eventId: string | null | undefined): string {
  return eventId ? PROV_SEQ_PREFIX + eventId : PROV_SEQ_NO_EVENT_KEY
}
```

```ts
export async function nextProvisionalId(eventId: string | null | undefined): Promise<string> {
  const letter = await deviceLetter()
  const key = provSeqKey(eventId)
  const cur = parseInt((await Preferences.get({ key })).value ?? '0', 10) || 0
  const next = cur + 1
  await Preferences.set({ key, value: String(next) })
  return `${letter}${next}`
}
```

```ts
export async function seedProvisionalSeq(eventId: string | null | undefined, highestKnown: number): Promise<void> {
  if (!Number.isFinite(highestKnown) || highestKnown <= 0) return
  const key = provSeqKey(eventId)
  const cur = parseInt((await Preferences.get({ key })).value ?? '0', 10) || 0
  if (highestKnown > cur) await Preferences.set({ key, value: String(highestKnown) })
}
```

**The raise-only rule is byte-identical** — `if (highestKnown > cur)`. Only the key it applies to changed.
**The device letter is untouched.**

✅ **A prefix-collision trap that does NOT bite, checked rather than assumed:** the old key `hg_prov_seq`
does **not** start with the new prefix `hg_prov_seq_` (it is shorter), and `hg_prov_seq_noevent` can never
equal `hg_prov_seq_<uuid>`. So the three key spaces are cleanly disjoint. *(This is the same class of trap
the outbox module documents, where `hg_outbox_` was a prefix of `hg_outbox_seq` and enumerated a counter
as an op.)*

## d · Call sites

```tsx
      const provisional = isOnline() ? '' : await nextProvisionalId(manualEvent?.id ?? null)
```
```tsx
        const displayId = provisional || await nextProvisionalId(manualEvent?.id ?? null)
```

## 🔴 The filter that is load-bearing — a second trap the brief did not name

```tsx
  useEffect(() => {
    if (!isNativeApp()) return
    if (!manualEvent?.id) return
    const highest = orders
      .filter(o => o.event_id === manualEvent.id)
      .reduce((m, o) => Math.max(m, parseInt(String(o.id).replace(/^\D+/, ''), 10) || 0), 0)
    void seedProvisionalSeq(manualEvent.id, highest)
  }, [orders, manualEvent])
```

🔴 **The `orders` prop is the dashboard's UNSCOPED list.** `page.tsx` passes `orders={orders}`, **not**
`eventOrders` — the event-scoped array exists on that page and is not what the panel receives. **Without
the `.filter`, seeding event A's key would take the maximum across EVERY event and carry the old global
behaviour straight back in through a per-event key** — the change would have looked correct and done
nothing.

**READ**, from `app/dashboard/[token]/page.tsx`: `const eventOrders = activeEvent ? overlayed.filter(o => o.event_id === activeEvent.id) : overlayed`, and the panel is passed the unfiltered `orders`.

## 🔴 And the effect had to MOVE — a TDZ, not a stale value

The seed effect stood at `:300`, **above** `const [manualEvent, …] = useState(…)` at `:308`. A dep array is
evaluated **during render**, so referencing `manualEvent` from the old position would have been a
**`ReferenceError` on every render**, not a stale read. **The effect is now declared immediately below the
`manualEvent` declaration.** Verified by execution (declaration index < effect index).

## e · The old global key — left in place, unread, deliberately not migrated

**`hg_prov_seq` is never read by the new code and its value is never copied into any event key.** That is
the entire point: **a device sitting at 39 must start the next event from that event's own orders.**

**Left in place rather than removed**, for two reasons: deleting it is a write to a device's storage for
no functional gain, and if this change is ever reverted the old key is still there with its correct value.
It is inert — nothing reads it, and it cannot be matched by the new prefix.

## f · Orphan keys — growth rate, and no sweeper built

**One key per event the device mints an offline order into.** ⚠️ **Only events actually minted into** —
`seedProvisionalSeq` returns early when `highestKnown <= 0`, and `nextProvisionalId` only writes when an
offline order is placed. So a device that never goes offline accumulates **nothing**.

**Growth rate:** bounded by *offline events per device*. A truck trading daily with occasional signal loss
might mint into a few dozen events a year. Each entry is a uuid key plus a short integer — **on the order
of 60 bytes**. **Even 1,000 events is ~60 KB in NSUserDefaults.**

🔴 **NO SWEEPER WAS BUILT, and I do not think one is warranted.** It would not be trivial: a correct
sweeper must know which events are *finished*, which this module has no access to — it would need an
event list, a retention policy, and a guard against deleting the key for an event a queued op has not yet
replayed into. **That is materially more machinery than 60 KB justifies.** Reported for your decision, per
the brief; nothing built.

---

# Phase 4 — verification and honesty

## The five scenarios, worked from the code as written

🔴 **All five are READ-FROM-SOURCE and unobserved.** No device, no replay.

**1 · Online 1, 2, 3, then the device goes offline — what does it mint?**
**`N4`.** The seed effect filters `orders` to this event, takes `max(1,2,3) = 3`, and raises
`hg_prov_seq_<eventId>` to 3. `nextProvisionalId` reads 3, writes 4, returns `N4`.

**2 · Device mints N4, N5, reconnects, they replay — what do they land as, and what does the next ONLINE
order get?**
**They land as `N4` and `N5`, unchanged** — the server adopts `provisional_id` verbatim (built in the
previous task, untouched here). **The next online order gets the next unused COUNTER value.** The counter
was never called for `N4`/`N5`, so if it stood at 3 the next online order is **`4`**. ⚠️ **A bare `4` and
an `N4` coexist on the same event** — different strings, no index collision, and this is the specified
behaviour: the number is an identifier, not a count.

**3 · Same device, a NEW event whose orders are 1, 2 — what does it mint?**
**`N3`.** 🔴 **This is the whole change.** The new event has its own key, absent and therefore 0; the seed
raises it to 2 from that event's own orders; the mint returns `N3`. **Under the old global key it would
have minted `N40`.**

**4 · Device goes offline twice within one event — can it re-issue?**
**No.** Both guarantees hold within the event's key: `nextProvisionalId` is read-add-persist so it never
returns a value twice, and `seedProvisionalSeq` **only raises**, so the reconnect between the two offline
spells re-seeds *above* the numbers already shown (the replayed `N4`/`N5` contribute 4 and 5 through the
prefix-stripping `replace(/^\D+/, '')`). **Monotonicity within an event is preserved exactly as before.**

**5 · 🔴 Device offline, has NEVER loaded that event's orders — what does it mint, and can it collide?**

**It mints `N1`. And YES, that is reachable, and yes it can show the same digit as a server-issued `1`.**

The seed effect requires `orders` to contain rows for `manualEvent.id`. If the device has never loaded
them — a cold launch offline, or an event switched to while offline — the filter yields an empty array,
`highest` is 0, `seedProvisionalSeq` returns early on its `<= 0` guard, the event's key is absent, and the
mint returns **`N1`**. If the server has meanwhile issued `1` to an online customer, **two tickets show
the digit 1** — one as `N1`, one as `1`.

**Answering the question you actually asked, honestly:**
- **It is NOT a database collision.** `'N1'` and `'1'` are different TEXT values; the `(event_id, id)`
  unique index is satisfied and the insert succeeds.
- **It IS two tickets showing the same digit**, distinguished only by the `N`. On a printed ticket or
  called across a counter, "number one" is ambiguous.
- **It is REACHABLE**, and the change does not remove it. ⚠️ **It is not made worse by this change
  either** — under the old global key the same cold-start would have minted `N1` too, from an unseeded
  global counter. The difference is that per-event scoping makes a *fresh* key the normal case rather than
  the rare one, so **the window is entered more often**, even though each entry is no worse.
- **What would close it:** refusing to mint offline until that event's orders have been loaded at least
  once, or persisting a per-event high-water mark at load time rather than at mint time. **Neither is in
  scope here and I have built neither.**

## Verified by EXECUTION

Compared against pre-change copies with comments stripped, so only executable code counts:

```
=== lib/native/orderGate.ts — executable-only diff: 20 lines ===
    -const PROV_SEQ_KEY = 'hg_prov_seq'
    +const PROV_SEQ_PREFIX = 'hg_prov_seq_'
    +const PROV_SEQ_NO_EVENT_KEY = 'hg_prov_seq_noevent'
    +function provSeqKey(eventId: string | null | undefined): string {
    +  return eventId ? PROV_SEQ_PREFIX + eventId : PROV_SEQ_NO_EVENT_KEY
    +}
    -export async function nextProvisionalId(): Promise<string> {
    +export async function nextProvisionalId(eventId: string | null | undefined): Promise<string> {
    …
    -export async function seedProvisionalSeq(highestKnown: number): Promise<void> {
    +export async function seedProvisionalSeq(eventId: string | null | undefined, highestKnown: number): Promise<void> {

=== components/dashboard/AddOrderPanel.tsx — executable-only diff: 17 lines ===
    (effect moved below the manualEvent declaration; filter added; 2 mint sites take the event id)
```

```
a. one key per event id                 : True
   no-event has its OWN separate key    : True
b. nextProvisionalId takes the event id : True
c. seedProvisionalSeq still ONLY RAISES : True
d. all call sites updated (0 bare calls) : True
   mint sites pass the event id         : True
   seed passes event id + filters orders : True
e. old global key never read/migrated   : True
   old key is NOT matched by new prefix : True
   device letter untouched              : True
TDZ check — declaration idx 18881 < effect idx 20316 : True
```

**Untouched, confirmed:** adopt-verbatim on the server, the 409 duplicate response, the online counter
path, and `deviceLetter`.

## Not offered as verification

`npx tsc --noEmit` is clean for both files. **That is not verification** — and this task is a good example
of why: it would not have caught the missing `.filter`, which would have compiled perfectly and silently
reinstated the defect.

## What remains UNPROVEN

- **The whole replay path**, as before — no device, no offline order, no drain was run.
- **That `manualEvent` is populated at mint time in practice.** It is in scope and read by adjacent lines,
  but I have not observed a real offline submit.
- **What would settle it:** place an offline order on a fresh event whose orders are 1, 2, and confirm the
  device shows `N3` rather than `N40`.

---

# Phase 5 — integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) as a **separate pass after** each write — never
grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

**Result: zero NUL bytes and zero other flagged control bytes on all three files.** Exact counts, the
non-ASCII class deltas and the per-base carrier-aware variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
