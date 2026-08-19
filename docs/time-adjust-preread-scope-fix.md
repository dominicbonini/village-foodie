# Quick-time-adjust: the pre-read is now truck-scoped

**One line changed, plus the comment that says why it is on the read and not the write.**

```
-… .eq('order_key', orderKey).single()
+… .eq('order_key', orderKey).eq('truck_id', truck.id).single()
```

✅ **Executable diff: 1 removed, 1 added. 1449 lines before, 1449 after.** No other branch, no write
filter, no capture change, no response change.

**All six established facts re-read and TRUE. No stop condition tripped.**

---

# PHASE 1 · READ-ONLY

## 1 · The branch as it stood

```ts
    // ── adjust_slot ───────────────────────────────────────────────────────────
    if (action?.startsWith('adjust_slot_+')) {
      const mins = parseInt(action.replace('adjust_slot_+', ''))
      if (!orderKey || isNaN(mins)) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
      const { data: ord } = await supabase.from('orders').select('id,slot,event_date,event_id,customer_email,customer_name,items,deals,total,notes,discount_amt').eq('order_key', orderKey).single()
      if (!ord?.slot) return NextResponse.json({ error: 'No slot' }, { status: 400 })
      const [h, m] = ord.slot.split(':').map(Number)
      const newTotal = h * 60 + m + mins
      const newSlot = `${String(Math.floor(newTotal / 60) % 24).padStart(2, '0')}:${String(newTotal % 60).padStart(2, '0')}`
      if (ord.event_date) {
        const full = await supabase.from('orders').select('items, deals').eq('order_key', orderKey).single()
        if (full.data) {
          const itemCatMap = await buildItemCatMap(supabase, truck.id)
          await moveSlotBooking(supabase, truck.id, ord.event_id, ord.slot, newSlot, …)
        }
      }
      await supabase.from('orders').update({ slot: newSlot, status: 'confirmed' }).eq('order_key', orderKey)
      …
      const adjustCapture = await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'time_adjust' })
      if (ord.customer_email) { … formatConfirmationEmail … }
      return NextResponse.json({ success: true, newSlot })
    }
```

## 2 · ✅ THE GUARD SITS IMMEDIATELY AFTER THE READ, WITH NOTHING BETWEEN THEM

**READ — the two lines are adjacent, in this order:**

```ts
      const { data: ord } = await supabase.from('orders').select('…').eq('order_key', orderKey).single()
      if (!ord?.slot) return NextResponse.json({ error: 'No slot' }, { status: 400 })
```

✅ **NO WRITE, NO BOOKING CALL, NO EXTERNAL CALL RUNS BETWEEN THEM.** The only statements ahead of the
read inside this branch are `parseInt` and a `!orderKey || isNaN(mins)` guard that returns 400 — pure
argument validation, no I/O. **So the read filter DOES close the branch**, and the first stop condition
does not trip.

⚠️ **TWO READS RUN EARLIER IN THE HANDLER, BEFORE ANY BRANCH, AND ARE NAMED SO THEY ARE NOT MISSED:**
`resolveActorSafe(req, supabase, truck)` and the `expected_from` replay guard's `select('status')`.
**Both are READS, both are already truck-scoped or harmless, and neither writes anything.** They are not
side effects of this branch.

## 3 · The second read — reachable, and duplicative

```ts
        const full = await supabase.from('orders').select('items, deals').eq('order_key', orderKey).single()
```

⚠️ **IT IS STILL REACHABLE, but only for an order this truck owns.** It runs after `ord` has been found
and the guard has passed, so with the read scoped, a foreign key never gets here. **Its own missing filter
is no longer exploitable from this branch.**

🔴 **AND ITS COLUMNS ARE ALREADY IN `ord`.** The first read selects `items` and `deals`; `full` selects
`items, deals` — **the same two columns, for the same row, one statement later.** It is a redundant round
trip, not a second source of truth.

**§d — YES, I THINK IT SHOULD GO, AND I HAVE NOT TOUCHED IT.** ⚠️ **My reading: delete it and use `ord`
rather than scoping it** — a filter would make a redundant query correct instead of removing it. **But
that changes `full.data` to `ord` at the `if (full.data)` gate, which is a behaviour-shaped edit rather
than a filter, and you asked for one line.** **Reported, not done.**

## 4 · ✅ `truck` is in scope with a usable `truck.id`

**Resolved at the top of the handler by the token + PIN auth, and already used INSIDE this branch four
lines below the read** — `buildItemCatMap(supabase, truck.id)` and `moveSlotBooking(supabase, truck.id, …)`.
**Nothing new had to be plumbed.**

---

# PHASE 2 · STOP CONDITIONS

| Condition | Result |
|---|---|
| A side effect runs before the `!ord?.slot` guard | ❌ **Not tripped** — the two lines are adjacent |
| Scoping the read changes a legitimate adjust | ❌ **Not tripped** — §Verification |
| Instructions contradict | ❌ No |
| Garbled span | ❌ None |

---

# PHASE 3 · THE CHANGE

**The filter, and the comment above it:**

```ts
      // ── 🔴 OWNERSHIP IS ESTABLISHED HERE, ON THE READ, AND NOT ON THE WRITES BELOW. ─────────────
      // A foreign `order_key` must fail BEFORE any side effect, and this is the only place that can be
      // true: `ord` gates everything that follows — the re-slot, the status write, moveSlotBooking,
      // captureOnConfirmation and the customer email all depend on it, and the guard on the next line
      // returns 400 when it is missing. Scoping the read therefore closes the whole branch.
      // ⚠️ FILTERING THE WRITE INSTEAD WOULD HAVE BEEN WORSE THAN NOTHING. The status update's result is
      // discarded and this branch returns `{ success: true, newSlot }` unconditionally, so a filtered
      // write would report SUCCESS for an order that never moved — while the booking, the capture and
      // the email still ran. That is the silent-no-op trap the cross-truck cancel hole hid behind.
      const { data: ord } = await supabase.from('orders').select('…').eq('order_key', orderKey).eq('truck_id', truck.id).single()
```

✅ **The status write keeps its single `.eq('order_key', orderKey)`.** ✅ **`captureOnConfirmation` is
untouched — it remains unscoped, which is the separate decision you have already taken.** ✅ **The second
read, `moveSlotBooking`, the email and the response are all unchanged.**

---

# PHASE 4 · VERIFICATION

⚠️ **NOTHING WAS EXERCISED.** No request was made, nothing ran against Stripe. **Every behavioural claim
is READ-FROM-SOURCE and unobserved.** `tsc --noEmit` passes and is **not** verification; `next dev` /
`next build` were not run.

## A caller posting ANOTHER truck's `order_key`

| | Before | Now |
|---|---|---|
| Response | `{ success: true, newSlot }`, **200** | `{ error: 'No slot' }`, **400** |
| The order's `slot` and `status` | 🔴 **rewritten** — re-slotted and forced `confirmed` | ✅ untouched |
| `moveSlotBooking` | 🔴 **ran, misdirected** — the caller's `truck.id` with the victim's `event_id` | ✅ never called |
| `captureOnConfirmation` | 🔴 **ran** — a capture triggered by an unauthorised caller | ✅ never called |
| The customer email | 🔴 **sent**, telling the victim's customer a new collection time | ✅ never composed |
| The second read (`full`) | ran | ✅ never reached |

🔴 **EVERY SIDE EFFECT IN THE BRANCH IS NOW BEHIND THE GUARD.** The `.single()` returns no row for a
foreign key, `ord` is null, `!ord?.slot` is true, and the branch returns before line one of the work.

## A caller posting a NON-EXISTENT `order_key`

✅ **UNCHANGED: `{ error: 'No slot' }`, 400 — exactly as before.** `.single()` already found nothing, so
`ord` was already null and the same guard already fired. **The filter only widens what "not found" means;
it does not change what happens when nothing is found.**

⚠️ **AND THAT IS WHY THE 400 IS THE RIGHT ANSWER RATHER THAN A 403.** A foreign key and a fake key are now
indistinguishable to the caller — the same body, the same status. **A caller learns nothing about whether
another truck's order exists**, which is the reasoning `/api/orders/[id]` already states for its own 404.

## A LEGITIMATE time adjust — ✅ UNAFFECTED

**Established from the data, not from confidence.** The filter is `.eq('truck_id', truck.id)`, and
`truck` is the row the request authenticated as. **An operator adjusting their own order matches both
predicates**, so `.single()` returns the same row it returned before and every subsequent line receives
identical values.

⚠️ **THE ONE WAY IT COULD HAVE BITTEN, CHECKED: an order whose `truck_id` disagrees with the event's
truck.** `orders.truck_id` is written from the same `truck.id` on every creation path — `place_order_atomic`
takes `p_truck_id`, the manual insert writes `truck.id`, `promote-draft` writes `draft.truck_id` — so a
legitimately-owned order cannot carry a foreign `truck_id`. ⚠️ **CANNOT DETERMINE against live rows** —
no SQL was run. `select count(*) from orders o join truck_events e on e.id = o.event_id where o.truck_id
<> e.truck_id;` would settle it and should return 0.

## Marking

| Claim | Status |
|---|---|
| The branch, the guard's adjacency, the second read's columns | ✅ **READ** |
| `truck.id` already in scope inside the branch | ✅ **READ** — two existing uses below the read |
| The one-line diff | ✅ **EXECUTED** — comment-stripped comparison, 1 removed / 1 added |
| What a foreign key now gets, and which side effects stop | ⚠️ **READ-FROM-SOURCE and UNOBSERVED** — no request was made |
| A legitimate adjust is unaffected | ⚠️ **READ-FROM-SOURCE.** ⚠️ **CANNOT DETERMINE against live rows;** query given |
| `tsc --noEmit` passes | ⚠️ **A breakage check, NOT verification** |

**Surface:** one branch of one operator route. **`lib/payments/capture.ts` was read previously and is
deliberately untouched here** — its lack of truck scoping is unchanged and remains your open decision.

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** every write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Files: the route and this
report.** The result, the non-ASCII census of characters introduced, and the carrier-aware
variation-selector figures per emoji-presentation base are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
