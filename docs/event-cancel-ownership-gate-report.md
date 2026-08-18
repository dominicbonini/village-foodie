# Event-cancel — one ownership gate

**One file changed: `app/api/events/action/route.ts`. Six executable lines.** One gate, added to the fetch
the branch already made. No per-write filters added. `restore_rejected` and every other branch untouched.

🔴 **NO CANCEL WAS EXERCISED.** Every behavioural claim is **READ-FROM-SOURCE** and **unobserved**.

✅ **All six "already established" facts were re-read and are TRUE.** ✅ **The uncommitted village-fix work
is present exactly as described and survives intact** (verified by execution, §Phase 4). No stop condition
triggered.

---

# Phase 1 — read only

## 1 · Every database write reachable from the `cancel` branch

**Write 1 — `truck_events` UPDATE:**

```ts
    const { error } = await supabase
      .from('truck_events')
      .update({ status: 'cancelled', cancellation_note: fullNote || null, updated_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
```
**Filters:** `id` **AND** `truck_id`. ✅ Scoped — **and confirmed: a zero-row match returns no error, so
`if (error)` does not fire and execution continues.**

**Write 2 — `rejected_event_signatures` INSERT:**

```ts
    if (payload?.suppress && eventRow) {
      const { error: supErr } = await supabase.from('rejected_event_signatures').insert({
        truck_id: truck.id,
        event_date: eventRow.event_date,
        scraped_signature: eventRow.scraped_signature || eventRow.venue_name || '',
      })
      if (supErr) console.warn('[cancel] suppression write failed:', supErr.message)
    }
```
**Filters:** none — it is an INSERT. **Values mix A's `truck_id` with B's `event_date`/`scraped_signature`.**

**Write 3 — the `orders` read that selects the victims:**

```ts
    const { data: affectedOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('event_id', eventId)
      .in('status', ['confirmed', 'pending'])
```
🔴 **Filters: `event_id` and `status`. NO ownership filter of any kind.** Confirmed.

**Write 4 — the `orders` UPDATE:**

```ts
      const orderKeys = affectedOrders.map((o: any) => o.order_key)
      await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancellation_reason: `Event cancelled${fullNote ? ': ' + fullNote : ''}`,
        })
        .in('order_key', orderKeys)
```
🔴 **Filters: `order_key` only** — a list derived entirely from Write 3. **No `truck_id`, and no error
binding either.**

**Write 5 — the slot-usage rebuild:**

```ts
    if (eventRow?.event_date) {
      try {
        await rebuildProductionSlotUsage(supabase, truck.id, eventRow.event_date)
      } catch (err) {
        console.warn('[events/cancel] production_slot_usage rebuild failed (drift risk):', err)
      }
    }
```
**Filters:** internally `.eq('truck_id', truckId).eq('event_date', eventDate)` — **the caller's truck id
against the other truck's date.**

**That is the complete set.** No other write is reachable from this branch.

## 2 · The event fetch as it currently stands

```ts
    const { data: eventRow, error: eventRowErr } = await supabase
      .from('truck_events')
      .select('venue_name, town, event_date, scraped_signature')
      .eq('id', eventId)
      .single()
    if (eventRowErr) console.warn('[cancel] event detail fetch failed — suppression, email locality and slot-usage rebuild will be skipped:', eventRowErr.message)
```

✅ **The uncommitted work is all there:** the bound `error: eventRowErr`, `town` in place of the phantom
`village`, and the `console.warn`. 🔴 **And the filter is `.eq('id', eventId)` ALONE — no `truck_id`.**
Confirmed.

## 3 · Email sends, and what identifies the truck

One send, in a loop over `affectedOrders`:

```ts
          await sendEventCancellationEmail({
            to: order.customer_email,
            customerName: order.customer_name,
            orderId: order.id,
            truckName: truck.name ?? '',
            venueName: eventRow?.venue_name ?? null,
            village: eventRow?.town ?? null,
            eventDate: eventRow?.event_date ?? null,
            note: fullNote || null,
            paymentStatus: order.paid_at ? 'paid' : null,
          })
```

🔴 **`truckName: truck.name` — the AUTHENTICATED caller's name, never the event's owner.** `to` is the
victim truck's customer. **So the email pairs truck A's name with truck B's customer and B's venue.**
Confirmed.

## 4 · Order of operations, and where ownership could be established

| # | Step | Write? |
|---|---|---|
| 1 | `getTruck(token)` → 404 if no truck | — |
| 2 | **event fetch** (`id` only) | — |
| 3 | `truck_events` UPDATE | 🔴 **first write** |
| 4 | error check (cannot fire on zero rows) | — |
| 5 | suppression INSERT | write |
| 6 | orders SELECT (unscoped) | — |
| 7 | orders UPDATE | write |
| 8 | emails | side effect |
| 9 | rebuild | write |

🔴 **Ownership could be established at step 2 — the branch already reads the row there and simply never
looks at whose it is.** Every write is downstream of it. That is the whole change.

## 5 · Does `restore_rejected` have the same trap? — REPORT ONLY, not changed

```ts
    const { data: eventRow } = await supabase
      .from('truck_events')
      .select('venue_name, event_date, scraped_signature')
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .single()
    if (!eventRow) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
```

**The trap EXISTS structurally but is UNREACHABLE.** Its own UPDATE below is equally a silent zero-row
no-op — but the `if (!eventRow) … 404` returns **before** any write is attempted, because the fetch is
scoped by `truck_id` and `.single()` yields nothing for a foreign event.

⚠️ **It achieves this without binding its error** — it checks the *result*, not the error. **This is the
exact shape the cancel branch was missing, and it is the pattern the new gate follows.** **Not changed.**

## 6 · Every other action branch — size of the class. REPORT ONLY

| Branch | Writes | Ownership established before writing? |
|---|---|---|
| `confirm` | `truck_events` UPDATE (`id` + `truck_id`) | ⚠️ **Incidentally.** Pre-read is scoped (`id`+`truck_id`); a foreign event yields `ev = null` → `hasValidEventTimes(undefined, undefined)` false → **400 before any write**. Correct outcome, wrong reason — the guard is a *time* check, not an ownership check. |
| `open` | `truck_events` UPDATE (`id` + `truck_id`) | ⚠️ Pre-read scoped; write scoped. No explicit gate, but **no cross-truck effect** — worst case a silent no-op. |
| `close` | `truck_events` UPDATE (`id` + `truck_id`) | ❌ **No gate at all.** Foreign id → zero rows, no error, `ok: true`. **Silent no-op, no cross-truck effect.** |
| `update` | `truck_events` UPDATE (`id` + `truck_id`) | ❌ **No gate at all.** Same: silent no-op, no cross-truck effect. |
| 🔴 **`cancel`** | 5 writes, **two of them unscoped** | 🔴 **NONE — the defect.** |
| `restore_rejected` | UPDATE + signature DELETE, both scoped | ✅ **Explicit 404 gate.** |

🔴 **The class is six branches; ONE is exploitable.** `cancel` is the only branch that writes to a table
reached through `event_id` rather than `truck_id`, which is precisely why its missing gate has cross-truck
consequences while the others degrade to a harmless no-op. ⚠️ **`close` and `update` do lie to the caller**
— `ok: true` for a write that changed nothing — but they touch no other truck's data. **Reported, not
fixed.**

---

# Phase 2 — stop conditions

| Condition | Result |
|---|---|
| Any "already established" fact false | ❌ All six re-read and TRUE. |
| Gate cannot be added without changing a LEGITIMATE cancel | ❌ It can — see Phase 4. |
| Village-fix work not present as described | ❌ Present and intact. |
| Instructions contradict | ❌ No. |
| Garbled span | ❌ None. |

**Proceeded.**

---

# Phase 3 — the change

```ts
    const { data: eventRow, error: eventRowErr } = await supabase
      .from('truck_events')
      .select('truck_id, venue_name, town, event_date, scraped_signature')
      .eq('id', eventId)
      .single()
    if (eventRowErr) console.warn('[cancel] event detail fetch failed — suppression, email locality and slot-usage rebuild will be skipped:', eventRowErr.message)
    if (!eventRow || eventRow.truck_id !== truck.id) {
      console.warn(`[cancel] refused: event ${eventId} is not owned by truck ${truck.id} (or could not be read)`)
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
```

| Requirement | Done |
|---|---|
| Single gate at the top, before any write | ✅ Immediately after the existing fetch; all five writes are downstream. |
| Merged into the existing fetch, no second round trip | ✅ `truck_id` added to the select the branch already made. |
| Bound error and `console.warn` kept | ✅ Untouched. |
| 404 using the route's existing shape | ✅ `{ error: 'Event not found' }, { status: 404 }` — **byte-identical to `restore_rejected`'s**, now appearing exactly twice in the file. Nothing invented. |
| No `.eq('truck_id', …)` added to individual writes | ✅ Executable `.eq('truck_id'` count unchanged at 11 (§Phase 4). |
| `restore_rejected` and other branches untouched | ✅ Verified byte-identical. |

🔴 **Why a null row must also 404, stated rather than buried.** Ownership cannot be confirmed without the
row, so "could not verify" has to fail closed — the alternative is the hole itself. **This is a deliberate
behaviour change**, covered in Phase 4.

⚠️ **The orders writes still carry no ownership filter, deliberately.** They cannot: orders are reached
through `event_id`, not `truck_id`. **That is exactly why the gate is upstream** — the class of bug being
removed is "four filters that must all agree", and adding a fifth would re-create it.

---

# Phase 4 — verification and honesty

## Verified by EXECUTION

Compared against a pre-change copy, **with comments stripped**, so only executable code counts:

```
EXECUTABLE-ONLY DIFF — 6 lines:
    -      .select('venue_name, town, event_date, scraped_signature')
    +      .select('truck_id, venue_name, town, event_date, scraped_signature')
    +    if (!eventRow || eventRow.truck_id !== truck.id) {
    +      console.warn(`[cancel] refused: event ${eventId} is not owned by truck ${truck.id} (or could not be read)`)
    +      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    +    }
```

🔴 **CHANGED EXECUTABLE LINES: 6** — one select rewritten, four added. **The gate and the select, and
nothing else.**

```
  .eq('truck_id' occurrences : before=11 after=11  (delta +0)
  .eq('event_id', eventId)   : before=1 after=1  (delta +0)
  .in('order_key', orderKeys): before=1 after=1
  orders writes/filters unchanged: True
restore_rejected untouched: True
404 shape reused (not invented): True
village-fix work still intact: all four checks True
```

⚠️ **A correction I owe you: my first comparison reported `.eq('truck_id'` rising 11 → 13 and the orders
filter as changed.** Both were **artefacts of my own comment text** quoting those expressions. Re-run
against comment-stripped source, both deltas are **zero**. I am recording the false reading rather than
only the corrected one.

## The legitimate path — what an owner experiences differently

**Nothing.** For an owner cancelling their own event, `eventRow` is non-null and `eventRow.truck_id ===
truck.id`, so the gate falls through and every subsequent statement is byte-identical: same UPDATE, same
orders selected and cancelled, same emails, same `ok: true`, same `cancelledOrders` count. **The only
added work is one extra column in a select that was already being made.** **READ-FROM-SOURCE, unobserved.**

## A cancel for an event id that does not exist AT ALL

**This DOES change, and it is the one legitimate-looking case that behaves differently.**

| | Before | After |
|---|---|---|
| event fetch | `.single()` errors → `eventRowErr` logged, `eventRow` null | same fetch, same log |
| `truck_events` UPDATE | runs, matches 0 rows, **no error** | **never reached** |
| suppression | skipped (`&& eventRow` false) | never reached |
| orders select | runs on a non-existent `event_id` → `[]` | never reached |
| rebuild | skipped | never reached |
| **response** | 🔴 **`{ ok: true, cancelledOrders: 0 }`** | ✅ **`{ error: 'Event not found' }`, 404** |

**Before, a nonexistent id was reported as a successful cancel of zero orders. Now it is a 404.** That is
strictly more honest, and it is the same response a foreign id gets — **which is deliberate: distinguishing
"not yours" from "does not exist" would leak whether an arbitrary uuid is a real event on another truck.**

⚠️ **The same 404 now also covers a transient read failure** (a DB blip on the fetch). Previously such a
cancel proceeded best-effort; now it is refused, and the operator would retry. **Failing closed on an
unverifiable owner is the correct direction, and the `console.warn` distinguishes the two cases in the
logs.** **READ-FROM-SOURCE, unobserved.**

## Not offered as verification

`npx tsc --noEmit` reports nothing for this file. **That is not verification** — the pre-change code
typechecked cleanly for the entire time the hole was open. `next dev` / `next build` not run. **No cancel
was exercised against any database.**

## What remains unproven

That the gate actually refuses a foreign event **in a running system**. The logic is quoted and the
comparison is executed, but **no request was made.** The observation that would settle it: post a cancel
with another truck's event uuid and confirm a 404 with the `[cancel] refused:` line in the logs, and that
the victim's orders are untouched.

---

# Phase 5 — integrity census

## Byte-level NUL / control scan — separate pass, after the write, byte tool, never grep

`open(path,'rb')`, integer comparison. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.
Figures for both files, and the per-base carrier-aware variation-selector counts, are in the chat reply.

**Result: zero NUL bytes and zero other flagged control bytes in every pass, on both files.**

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.

## Non-ASCII introduced

Into `app/api/events/action/route.ts`: **all inside comments**, plus one em dash already present in the
pre-existing `console.warn` string. **The gate's own executable lines — the select literal, the
`eventRow.truck_id !== truck.id` test, the template-literal warn and the 404 response — are pure ASCII.**
Class census delta in the chat reply.

## Carrier-aware variation-selector check

Per emoji-presentation base, bare vs paired, for both files — in the chat reply. The rule they satisfy:
`Emoji_Presentation=Yes` bases 100% bare (VS-16 redundant), `Emoji_Presentation=No` bases 100% paired.
**Per base, not a single total.**
