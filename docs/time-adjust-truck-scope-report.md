# Quick-time-adjust: truck scoping on the status write

🔴 **STOPPED AT PHASE 2. THE FILTER WAS NOT ADDED. NOTHING WAS CHANGED except this report.**

**Both of the first two stop conditions were tested. The first does NOT trip — the hole is real, the
pre-read does not gate it, and one filter would genuinely close the status write. 🔴 THE SECOND DOES
TRIP: `captureOnConfirmation` is ALSO unscoped**, so the one-line fix would close the status write and
leave the money call wide open. **That is the case you said to stop and decide on.**

---

# PHASE 1 · READ-ONLY

## 1 · The branch, whole

**READ — `app/api/dashboard/action/route.ts`, `action?.startsWith('adjust_slot_+')`:**

```ts
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
          await moveSlotBooking(
            supabase, truck.id, ord.event_id, ord.slot, newSlot,
            normaliseOrderLines(full.data.items || [], full.data.deals), itemCatMap
          )
        }
      }
      await supabase.from('orders').update({ slot: newSlot, status: 'confirmed' }).eq('order_key', orderKey)
      …
      const adjustCapture = await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'time_adjust' })

      // Notify customer of time change
      if (ord.customer_email) {
        const paymentState = await resolveEmailPaymentState(supabase, orderKey, adjustCapture)
        …
        const { html, text } = formatConfirmationEmail({ … })
      }
      return NextResponse.json({ success: true, newSlot })
    }
```

## 2 · 🔴 THE PRE-READ DOES **NOT** SCOPE BY TRUCK. THE HOLE IS REACHABLE.

```ts
      const { data: ord } = await supabase.from('orders').select('…').eq('order_key', orderKey).single()
```

❌ **No `.eq('truck_id', truck.id)`.** ⚠️ **AND NEITHER DOES THE SECOND READ** four lines later:

```ts
        const full = await supabase.from('orders').select('items, deals').eq('order_key', orderKey).single()
```

🔴 **SO THIS IS A REAL HOLE, NOT UNTIDINESS.** The branch reads, re-slots, status-writes, captures and
emails on an order it never confirms belongs to the authenticated truck. **THREE unscoped `order_key`
lookups, not one.**

⚠️ **AND THE SLOT BOOKING IS WORSE THAN UNSCOPED — IT IS MISDIRECTED.** `moveSlotBooking(supabase,
truck.id, ord.event_id, …)` takes the **caller's** truck id with the **victim's** event id, so a
cross-truck call would move capacity on the caller's truck for an event that is not theirs. **A filter on
the status write does not touch that.**

⚠️ **The order_key is an unguessable uuid and the route is truck-authenticated, so this is not open to the
public.** It needs a caller who holds one truck's dashboard token AND another truck's order key. **That is
a narrow attacker, and it is also any bug that passes the wrong key.**

## 3 · 🔴 `captureOnConfirmation` DOES NOT VERIFY TRUCK OWNERSHIP EITHER

**READ — `lib/payments/capture.ts`, the draft read:**

```ts
    const { data: draft, error: draftErr } = await supabase
      .from('order_drafts')
      .select('order_key, truck_id, payment_intent_id, authorization_cancelled_at, total_minor')
      .eq('order_key', args.orderKey)
      .maybeSingle()
```

❌ **`args.truckId` is not in that WHERE clause.** **And the Stripe account it then uses:**

```ts
    const account = await stripeAccountForTruck(supabase, draft.truck_id ?? args.truckId)
```

🔴 **IT PREFERS THE DRAFT'S OWN TRUCK OVER THE CALLER'S, AND NEVER COMPARES THE TWO.** `args.truckId` is
a **fallback**, not a check. `grep -n "truck_id" lib/payments/capture.ts` returns four hits: that select,
the account line, its error message and the audit row — **no equality test against `args.truckId`
anywhere.**

### 🔴 SAYING IT PLAINLY, AS ASKED

**Adding `.eq('truck_id', truck.id)` to the status write closes the status write and LEAVES THE MONEY
CALL OPEN.** A caller posting another truck's `order_key` would then get: no status change (the update
matches zero rows), and **`captureOnConfirmation` still runs and still captures** — on the victim truck's
own Stripe account, because that is what `draft.truck_id ?? args.truckId` resolves to.

⚠️ **ONE MITIGATION WORTH STATING, BECAUSE IT MAKES THIS LESS BAD THAN IT SOUNDS.** The money does **not**
cross accounts. The capture lands on the correct truck's Stripe account for the correct order — it is
**an unauthorised trigger, not a misdirected payment.** The customer is charged the amount they
authorised, by the truck they ordered from, at a moment nobody at that truck chose. ⚠️ **CANNOT DETERMINE
whether Stripe would refuse anything here — nothing was exercised, and Stripe has never been live.**

✅ **And the capture has its own guards that still apply:** it refuses if the ledger shows a capture, if
the authorisation was cancelled, if the balance says nothing is owed, and if the balance cannot be read.
**A cross-truck trigger cannot double-charge; it can only take a hold early.**

## 4 · Nothing reads the update's result

```ts
      await supabase.from('orders').update({ slot: newSlot, status: 'confirmed' }).eq('order_key', orderKey)
```

❌ **No destructure, no `error` check, no `.select()`.** The result is discarded entirely, and the branch
ends with an unconditional `return NextResponse.json({ success: true, newSlot })`.

🔴 **SO THE FILTER WOULD CONVERT A CROSS-TRUCK WRITE INTO A SILENT NO-OP THAT STILL REPORTS SUCCESS.**
A zero-row update returns **no error** — the trap the cross-truck cancel hole hid behind. The caller would
receive `{ success: true, newSlot }` for an order that did not move. **Reported, not fixed, as instructed.**

⚠️ **AND THE RESPONSE WOULD BE WRONG IN A NEW WAY FOR THE LEGITIMATE CASE TOO** — `newSlot` is computed
before the write and returned regardless, so it already reports the intended slot rather than the stored
one. **Pre-existing; the filter would just widen the gap between them.**

---

# PHASE 2 · STOP CONDITIONS

| Condition | Result |
|---|---|
| The pre-read already scopes by truck, so the hole is unreachable | ❌ **NOT tripped — the pre-read is unscoped. The hole is real** |
| 🔴 `captureOnConfirmation` is also unscoped | 🔴 **TRIPPED. Stopping and reporting** |
| Instructions contradict | ❌ No |
| Garbled span | ❌ None |

✅ **YOUR FIRST CONDITION IS SATISFIED IN THE DIRECTION THAT MATTERS: this filter would not "document a
fear rather than a fact".** The fact is there. **It is the second condition that stops it — the one-line
fix would be a half-fix on a money path, and you said that decision is yours.**

---

# WHAT WAS NOT DONE

❌ **No filter added.** ❌ No status guard, no capture change, no other branch touched, no response
changed. **`git status` shows only this report.**

## The shape of the full fix, for your decision — described, not built

**Four unscoped lookups sit behind this one branch:**

| # | Site | Fix |
|---|---|---|
| 1 | the pre-read (`ord`) | `.eq('truck_id', truck.id)` — and its `!ord?.slot` guard already returns 400, so a foreign key would be refused **before** anything else runs |
| 2 | the second read (`full`) | same, or drop it — it re-reads columns `ord` could have selected |
| 3 | the status write | `.eq('truck_id', truck.id)` — the one line this task proposed |
| 4 | 🔴 `captureOnConfirmation` | **a truck check inside the module**, which is not this route's to make |

⚠️ **MY READING, OFFERED AND NOT ACTED ON: fixing (1) alone closes the whole branch**, because every later
step depends on `ord` and the branch returns 400 when it is missing. **(3) then becomes belt-and-braces
rather than the fix.** But **(4) is reachable from any other caller that passes an order key**, so it is
the one worth deciding on its own. 🔴 **Your call, and I have deliberately not made it.**

---

## Marking

| Claim | Status |
|---|---|
| The branch, whole | ✅ **READ** |
| Three unscoped `order_key` lookups in it | ✅ **READ** — all three quoted |
| `moveSlotBooking` mixes caller truck with victim event | ✅ **READ** |
| `captureOnConfirmation` never compares `args.truckId` to the draft | ✅ **READ** — the select, the account line, and a four-hit `truck_id` grep |
| The capture lands on the victim's own Stripe account | ⚠️ **INFERRED** from `draft.truck_id ?? args.truckId`. **UNOBSERVED — nothing was run, and Stripe has never been live** |
| Nothing reads the update's result | ✅ **READ** |
| A zero-row update returns no error | ✅ **READ** — PostgREST behaviour, and the pattern this codebase uses to detect it |
| Whether Stripe would refuse a cross-truck trigger | ⚠️ **CANNOT DETERMINE** |

**Surface:** one operator route and one payments module, each read on its own. **No fact is carried
between them.**

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. ⚠️ **This report is
the only file written**, so there is no source census — nothing else was touched. The result, the
non-ASCII census and the carrier-aware per-base variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
