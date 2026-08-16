# What removing the Adjust-time row actually changes

READ-ONLY DIAGNOSIS. **No file was edited, nothing was committed, no build was run, no deploy, no
database write.** `lib/payments/` was read and quoted and **not touched**. `git status` is in F4.
**Nothing is proposed outside Part E.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Every claim is marked **READ** or **INFERRED**. **Everything below was re-derived from the code**, not
from the earlier reports — and doing so **refuted two of their conclusions.**

---

# 🔴 TWO THINGS BEFORE THE ANSWER

**1. THE ROW IS ALREADY REMOVED IN THE WORKING TREE.** The previous task removed it.

```
$ grep -c "adjust_slot_+\${mins}" components/dashboard/OrderCard.tsx
0
$ git status --porcelain components/dashboard/OrderCard.tsx
 M components/dashboard/OrderCard.tsx
```

**So this review is retrospective, not a gate.** Everything quoted "before" is read from
`git show HEAD:` — the committed version, which still has the row. ⚠️ **If any finding here had gone
the other way, the working tree would already be wrong.** It does not; see C1.

**2. THE CENTRAL HYPOTHESIS IS REFUTED, AND IT IS THE ONE THAT MATTERED.** *"If `moveSlotBooking` is
only called from that row, Edit may not rebook the capacity slot."* **`moveSlotBooking` IS only called
from that row — and Edit rebooks capacity anyway, using the two primitives `moveSlotBooking` merely
wraps.** C1 has the quote. **The kitchen's load projection does not silently disagree with reality.**

---

# PART A — RE-DERIVING THE CAPTURE CLAIM

## A1. `adjust_slot_+N`'s handler — every call it makes

**READ** — `app/api/dashboard/action/route.ts:1949-2027`. Five distinct effects:

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
…
        const paymentState = await resolveEmailPaymentState(supabase, orderKey, adjustCapture)
…
        const { html, text } = formatConfirmationEmail({ … slot: newSlot, slotAdjustedFrom: ord.slot, … autoAccepted: true, paymentState, … })
…
          subject: `Your order #${ord.id} has been updated`,
```

**Exhaustively: (1) `moveSlotBooking`, (2) an `orders` update writing `slot` AND `status:'confirmed'`,
(3) `captureOnConfirmation(trigger:'time_adjust')`, (4) `resolveEmailPaymentState`, (5) a customer
email.** ⚠️ **No audit row of its own** — see C4.

## A2. `captureOnConfirmation` — 🔴 FIVE call sites, not four

**READ** — `grep -rn "captureOnConfirmation(" app lib`, complete, with each trigger:

| # | Site | Trigger | READ |
|---|---|---|---|
| 1 | `app/api/orders/submit/route.ts:1081` | `'auto_accept'` | inside `if (autoAccepted)` |
| 2 | `app/api/dashboard/action/route.ts:259` | `'confirm'` | the operator Confirm button |
| 3 | `app/api/dashboard/action/route.ts:1977` | `'time_adjust'` | **the row under review** |
| 4 | `lib/payments/stranded-authorisations.ts:165` | `'stranded_sweep'` | the `*/15` cron |
| 5 | `lib/payments/promote-draft.ts:385` | `'promote_auto_accept'` | inside `if (autoAccepted)` |

🔴 **THE IN-CODE NUMBERING IS STALE AND SHOULD NOT BE TRUSTED AS A COUNT.** The confirm branch's
comment says *"CAPTURE SITE 2 of 4"* and the adjust branch's says *"CAPTURE SITE 3 of 4"* — **but there
are five, carrying five distinct triggers.** ⚠️ **The phrase "capture site 3 of 4" that this whole
decision was hung on is therefore an artefact of a comment written when there were four.** Reported as
a defect in its own right at E4.

## A3. 🔴 Which status reaches each site — and `'pending'` is NOT only reachable by `time_adjust`

**REFUTED. Emphatically, and by the confirm handler's own comment.**

| Site | Status on entry | Status after |
|---|---|---|
| `auto_accept` (submit) | *no order yet* — inserted `'confirmed'` | `'confirmed'` |
| **`confirm`** | 🔴 **`'pending'`** | `'confirmed'` |
| **`time_adjust`** | 🔴 **`'pending'`** | `'confirmed'` |
| `stranded_sweep` | `('confirmed','modified','cooking','ready','collected')` | unchanged |
| `promote_auto_accept` | *no order yet* | `'confirmed'` |

**READ** — `app/api/dashboard/action/route.ts:244-259`, and the comment is decisive:

```ts
    if (action === 'confirm') {
      const { data: order } = await supabase.from('orders').select('*')…
      await supabase.from('orders').update({ status: 'confirmed' })…

      // ── 🔴 CAPTURE SITE 2 of 4: THE OPERATOR CONFIRM — AND EVERY OFFLINE REPLAY OF IT. ──────────
      // ⚠️ THIS IS ALSO WHERE A CARD ORDER THAT LANDED `pending` CAPTURES. Its hold sat correctly held
      // from promotion until this tap; site 4 (promote-draft) deliberately did not take it.
…
      const captureResult = await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'confirm' })
```

🔴 **THE CODE ITSELF SAYS CONFIRM IS WHERE A PENDING CARD ORDER CAPTURES.** `time_adjust` is a
**second, redundant** route to the same capture on the same status — not the only one, and not the
designed one. **The earlier "only site that fires on a pending order" claim is wrong.**

## A4. The row's render condition — confirmed

**READ** — `git show HEAD:components/dashboard/OrderCard.tsx`:

```tsx
          {order.status === 'pending' && order.slot && viewMode !== 'cook' && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-xs text-slate-400 font-medium shrink-0">Adjust time:</span>
              {[5, 10, 20].map(mins => (
                <button key={mins}
                  onClick={() => onAction(`adjust_slot_+${mins}`, order.order_key)}
```

✅ **CONFIRMED: `status === 'pending'` only**, plus `order.slot` (so never on an ASAP order) and
`viewMode !== 'cook'`.

---

# PART B — 🔴 WHAT IF IT IS NEVER TAPPED?

## B1. A pending card order, placement to collection, without the row

**READ**, the path:

1. **Customer pays by card** → `paymentIntents.create` with `capture_method: 'manual'` → a **hold**.
2. **Promotion** (`promote-draft.ts:382-389`) — and it deliberately does **not** capture unless
   auto-accept is on:
   ```ts
    if (autoAccepted) {
      captureResult = await captureOnConfirmation(supabase, { … trigger: 'promote_auto_accept' })
      captureNote = captureResult.status
    } else if (draft.payment_intent_id) {
      captureNote = 'held, pending confirmation'
    }
   ```
   **The order is `'pending'` with a live hold.**
3. **The operator taps Confirm** → `action === 'confirm'` → `status: 'confirmed'` → **`captureOnConfirmation(trigger:'confirm')`. THE MONEY IS TAKEN HERE.**
4. Cooking, ready, collected — no further capture.

✅ **Capture happens at step 3, and step 3 is unavoidable: a pending order cannot be cooked, marked
ready or collected without being confirmed.** ⚠️ **INFERRED, and it is the whole point: the only way to
reach collection without Confirm is not to serve the customer at all.**

## B2. Does removing the row change anything for an untapped order?

# 🔴 NO. NOTHING. NOT ONE THING.

**The evidence, all READ:**

- The row **renders only on `'pending'`** (A4).
- A pending order **must** pass through `confirm` to be served, and `confirm` **captures** (A3, B1).
- The row's other four effects — the slot move, the status write, the payment-state resolve and the
  email — **all only happen when the button is pressed.**
- **Nothing polls it, nothing depends on its presence, and no other code path references
  `adjust_slot`** outside the handler itself.

**For an order nobody taps it on, the row is inert markup. Removing inert markup changes nothing.**

## B3. 🔴 The earlier analysis DID overstate the risk

**Stated plainly, as asked.** *"Capture site 3 of 4"* is **a true fact about the handler** and it was
**never a reason not to remove the button**. Three things were conflated:

| Claim | Verdict |
|---|---|
| `adjust_slot_+N` calls `captureOnConfirmation` | ✅ **TRUE** — A1 |
| It is one of the sites that can capture a **pending** order | ✅ **TRUE** — A3 |
| **It is the ONLY site that can** | 🔴 **FALSE** — `confirm` does too, and the code says so in a comment |
| **Therefore removing the button risks money** | 🔴 **FALSE, and it does not follow even from the true claims** |

⚠️ **The reasoning error is worth naming: a capture SITE was treated as a capture ROUTE.** The handler
is still there and still captures; only one way of reaching it was removed, and it was the redundant
one. ⚠️ **And your audit-log evidence closes it from the other end** — see B5.

## B4. What changes for an operator who DOES tap it

**They no longer can, so the time change goes through Edit instead.** Five differences, all READ:

| | Row (`adjust_slot_+N`) | Edit |
|---|---|---|
| **Slot** | `+5/+10/+20` from the current slot, blind | operator picks any slot, **with the capacity traffic light** |
| **Status** | 🔴 `'confirmed'` — **confirms the order** | `'modified'` — **does not confirm** |
| **Capture** | 🔴 **immediate**, `trigger:'time_adjust'` | 🔴 **NONE on this path** |
| **Capacity** | `moveSlotBooking` | ✅ **remove + add, inline** — C1 |
| **Email** | `formatConfirmationEmail` with `slotAdjustedFrom`, `autoAccepted: true` | `formatConfirmationEmail`, no `slotAdjustedFrom` |

**READ** — the edit branch says so itself:

```
        // ⚠️ NO CAPTURE HAPPENS ON THIS PATH, so this reads. An edit does not confirm anything.
```

🔴 **SO THE ONE REAL CHANGE IS THE CAPTURE'S TIMING, AND ONLY FOR A PENDING CARD ORDER.** Editing a
pending order leaves it `'modified'` and uncaptured until either the operator confirms it (immediate)
or the stranded sweep collects it. **READ** — the deferral:

```sql
    and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')
```

⚠️ **Up to ~25 minutes** — a 10-minute grace plus a 15-minute cron. **INFERRED, and it softens the
figure: an operator who edits a pending order will normally confirm it moments later, and Confirm
captures immediately.** The 25 minutes is the worst case where they edit and then leave it pending.

## B5. Has `'time_adjust'` ever fired? — ANSWERED, and the limit recorded precisely

**Taken as given, not re-investigated, as instructed: `action_audit_log` holds 448 rows across three
weeks and contains no `adjust_slot_+N` action of any kind.**

⚠️ **THE LIMIT OF THAT EVIDENCE, STATED EXACTLY AS YOU FRAMED IT — and the code supports the
distinction.** That table records **payment** actions. **READ** — the adjust handler writes **no audit
row of its own** (A1); the only audit row it could produce comes from **inside**
`captureOnConfirmation`, and only when there is an authorisation to act on. **So the absence proves no
CAPTURE has ever fired from this button. It does not prove nobody ever tapped it** — a tap on an order
with no held authorisation moves the slot, writes `'confirmed'`, sends the email, and leaves no trace
in that table.

✅ **Which is sufficient for the question asked:** the concern was money, and **no money has ever moved
through this control.**

---

# PART C — EVERYTHING ELSE THE ROW DOES

## C1. 🔴 `moveSlotBooking` — the hypothesis is REFUTED. Edit rebooks capacity.

**READ** — `moveSlotBooking` in full, `lib/slot-bookings.ts:512-527`. **It is a two-line wrapper:**

```ts
export async function moveSlotBooking(
  supabase: SupabaseClient, truckId: string, eventId: string | null,
  fromSlot: string | null, toSlot: string | null,
  items: { name: string; quantity: number }[], itemCatMap: Record<string, string>
) {
  if (fromSlot && fromSlot !== toSlot) {
    await removeOrderFromProductionSlot(supabase, truckId, eventId, fromSlot, items, itemCatMap)
  }
  if (toSlot && fromSlot !== toSlot) {
    await addOrderToProductionSlot(supabase, truckId, eventId, toSlot, items, itemCatMap)
  }
}
```

✅ **Your premise is correct that it has exactly one call site:**

```
$ grep -rn "moveSlotBooking(" app lib
app/api/dashboard/action/route.ts:1961:          await moveSlotBooking(
```

🔴 **BUT THE CONCLUSION DOES NOT FOLLOW, BECAUSE EDIT CALLS THE TWO PRIMITIVES DIRECTLY.** **READ** —
`app/api/dashboard/action/route.ts:863-889`, inside the edit branch:

```ts
      // Slot re-booking is reported, NOT rolled back: the order above is already saved and correct.
      // A capacity-board write failure is a display/planning problem that the next rebuild self-heals
      // — losing the operator's edit over it would be far worse.
      let slotWarning: string | null = null
      if (order.event_date && (items || slot !== undefined)) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        // REMOVE uses the PRIOR stored state (old items + old deals) to subtract exactly
        // what was previously booked. ADD uses the EDITED state — the SAME items+deals
        // written to the row above — so a deal CHANGE re-counts production usage correctly
        // (Gap 4). Deal constituents are counted via normaliseOrderLines' deals arg.
        const oldLines = normaliseOrderLines(order.items || [], order.deals)
        const newDeals = editedDeals !== undefined ? editedDeals : order.deals
        const newLines = normaliseOrderLines(items || order.items || [], newDeals)
        // No slot gate: order.slot / newSlot may be null (ASAP) — both resolve to the
        // event-start window inside the helpers, so old usage is freed and new re-booked.
        const unbooked = await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_id, order.slot, oldLines, itemCatMap
        )
        const rebooked = await addOrderToProductionSlot(
          supabase, truck.id, order.event_id, newSlot, newLines, itemCatMap
        )
        const slotErrors = [unbooked.error, rebooked.error].filter(Boolean)
        if (slotErrors.length) {
          console.error('[edit] production slot re-booking failed (order WAS saved):', slotErrors.join(' | '))
          slotWarning = 'Order saved, but the kitchen capacity board could not be updated — check the slot before relying on it.'
        }
      }
```

🔴 **`removeOrderFromProductionSlot` + `addOrderToProductionSlot` ARE the entire body of
`moveSlotBooking`.** The edit path does the same work, inline, without the wrapper.

✅ **AND IT DOES STRICTLY MORE than the row it replaces:**

| | `moveSlotBooking` (the row) | Edit's inline pair |
|---|---|---|
| Slot change | ✅ | ✅ |
| **Item / deal change** | 🔴 **NO** — passes the same lines to both sides | ✅ **old lines out, NEW lines in** |
| ASAP (null slot) | ⚠️ guarded out by `if (fromSlot …)` | ✅ *"No slot gate … both resolve to the event-start window"* |
| Failure reporting | 🔴 **none** — the return values are discarded | ✅ `slotWarning` surfaced to the operator |
| Same-slot no-op | ✅ skips when `fromSlot === toSlot` | ⚠️ always removes then adds (**net zero**, two extra writes) |

**INFERRED, and this is the answer to the question you actually asked: the kitchen's load projection
does NOT silently disagree with when food is needed.** Every route that changes a slot updates
`production_slot_usage` — the row did it through the wrapper, Edit does it inline, and **Edit
additionally handles the case the wrapper cannot (a changed basket).**

⚠️ **I nearly reported the opposite.** `grep moveSlotBooking` returns one call site, and stopping there
gives exactly the conclusion you feared. **The wrapper is the thing with one call site; the WORK has
two.** ⚠️ **`moveSlotBooking` becomes dead code the day the `adjust_slot` handler goes** — reported at
E4, not acted on.

**READ** — and `production_slot_usage` is a persisted cache that only self-heals when **empty**, which
is why this mattered:

```ts
  if (!data?.length) {
    // Lazy reseed (covers the empty table between migration and backfill)…
```

**INFERRED: a stale non-empty cache would NOT self-correct on read.** Had Edit skipped the rebooking,
the projection would have stayed wrong until some unrelated action on that date called
`rebuildProductionSlotUsage`. **It does not skip it.**

## C2. `'confirmed'` versus `'modified'`

**READ** — the row wrote `'confirmed'` **unconditionally**; Edit writes `'modified'`. **Every consumer
was swept and the two are treated alike everywhere that matters:**

```
lib/printing/printWatcher.ts:61        const DEFAULT_ELIGIBLE = ['confirmed', 'modified', 'cooking', 'ready']
app/api/orders/cancel/route.ts:68      if (!['pending', 'confirmed', 'modified'].includes(order.status)) {
app/dashboard/[token]/page.tsx:2490    if(o.status!=='pending'&&o.status!=='confirmed'&&o.status!=='modified'){ …continue }
app/dashboard/[token]/page.tsx:2695    const confirmedOrders=eventOrders.filter(o=>['confirmed','modified','cooking','ready'].includes(o.status))
supabase/migrations/20260816_find_stranded_authorisations_settled.sql:96
                                       and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')
```

🔴 **ONE REAL DIFFERENCE, AND IT IS THE CAPTURE:** `'confirmed'` written by the row came **with** an
inline capture; `'modified'` written by Edit comes **without one**. Everything else — the board, the
ticket, the due alert, the customer's ability to cancel, the sweep — treats them identically.

⚠️ **A SECOND, SUBTLER DIFFERENCE WORTH STATING: the row CONFIRMED an order the operator may not have
meant to confirm.** It rendered on `'pending'` and wrote `'confirmed'` unconditionally, so *"push this
customer back ten minutes"* also **accepted the order**. **Edit does not**, and its own comment says
so. **INFERRED: for an operator using the row to buy time on an order they had not yet decided about,
removal changes the meaning of the gesture — arguably for the better.**

✅ **Checked and NOT a difference:** `kds/page.tsx:593`'s `st === 'confirmed' || st === 'pending'` is
an **INSERT**-event sound gate; a newly inserted order can never be `'modified'`.

## C3. The customer notification

**Both send one, and both go through the same formatter. READ:**

| | Row | Edit |
|---|---|---|
| Builder | `formatConfirmationEmail` | `formatConfirmationEmail` |
| Subject | `Your order #N has been updated` | `Order #N updated - now £X (was £Y)` |
| `slotAdjustedFrom` | ✅ **passed** — the old slot | ❌ not passed |
| `autoAccepted` | `true` | resolved from state |
| Payment sentence | from `resolveEmailPaymentState(…, adjustCapture)` | from the resolver, no capture result |

⚠️ **THE ONE THING THE CUSTOMER LOSES IS `slotAdjustedFrom`** — the row's email could say the time
moved *from* the old slot; the edit email states the new time and the totals. **INFERRED: a small
copy regression for the customer, and only for the pending-order case.**

✅ **Edit's email is not weaker in general** — §37 records it being brought onto
`formatConfirmationEmail` precisely so the money fact renders in a bordered amber box rather than 12px
grey.

## C4. Anything else — an audit row, a projection, an email?

**Swept. READ:**

- **Audit row:** 🔴 **NONE of its own.** The handler calls `logAction` nowhere. Any audit row comes from
  inside `captureOnConfirmation`. **This is why B5's evidence has the limit it has.**
- **Projection:** `production_slot_usage`, via `moveSlotBooking` — matched by Edit (C1).
- **Email:** one, C3.
- **Slot-booking counters:** `incrementSlotBooking` / `decrementSlotBooking` are **not** called by
  either path.
- **Response:** `{ success: true, newSlot }` — the client uses it to update the card.
- **Offline:** ⚠️ `adjust_slot_+N` is **not** in `PAYMENT_ACTIONS`, so the outbox treats it as a plain
  status op. **INFERRED: a queued tap would still replay against the surviving server handler.**

---

# PART D — ARE THE BLOCKERS ACTUALLY CLEARED?

**All four re-verified from the files themselves, not from any report.**

## D1. ✅ Stranded sweep allow-list

```sql
-- supabase/migrations/20260816_find_stranded_authorisations_settled.sql:96
    and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')
```

## D2. ✅ `printWatcher` DEFAULT_ELIGIBLE

```ts
// lib/printing/printWatcher.ts:61
const DEFAULT_ELIGIBLE = ['confirmed', 'modified', 'cooking', 'ready']
```

## D3. ✅ Customer cancel path

```ts
// app/api/orders/cancel/route.ts:68
    if (!['pending', 'confirmed', 'modified'].includes(order.status)) {
```

## D4. ✅ Dashboard due-alert scan

```ts
// app/dashboard/[token]/page.tsx:2490  — 'modified' absent from the EXCLUSION, i.e. present in the scan
        if(o.status!=='pending'&&o.status!=='confirmed'&&o.status!=='modified'){ prevUrgencyRef.current.delete(o.order_key); continue }
```

## D5. ✅ None is missing

**All four name `'modified'`.** No path is made routine-but-broken by routing time changes through
Edit.

---

# PART E — THE HONEST ANSWER

## E1. What removing the row changes, in plain English

**For an operator who never taps it: nothing.** The row rendered only on pending orders, did nothing
until pressed, and no other code depended on its presence. Their pending card orders capture at
Confirm, exactly as they always did — **that is the designed route, and the code says so in a comment
at the Confirm handler.**

**For an operator who does tap it:** they now change a collection time through **Edit**. They gain the
capacity traffic light and lose a two-tap shortcut. The order becomes `'modified'` instead of
`'confirmed'`, so **the time change no longer silently accepts the order** — and if it was a **pending
card** order, the hold is not captured at that moment; it captures when they confirm, or within about
25 minutes via the sweep. The customer's email no longer mentions the previous time.

## E2. What would BREAK versus what merely becomes deferred

**BREAKS: nothing.**

- ✅ No capture is lost — Confirm captures pending card orders (A3).
- ✅ No capacity drift — Edit rebooks, and handles basket changes the row could not (C1).
- ✅ No path becomes silently broken — all four `'modified'` consumers are clear (D).
- ✅ No customer stops being notified (C3).

**MERELY DEFERRED OR CHANGED:**

- ⚠️ Capture timing on a pending card order that is edited and left pending: **immediate → up to ~25
  minutes**.
- ⚠️ Two extra taps for a time change.
- ⚠️ `slotAdjustedFrom` no longer appears in the customer email.
- ⚠️ **The status a time change produces** — `'confirmed'` → `'modified'`. **Arguably a correction.**

## E3. 🔴 Does "capture site 3 of 4" still stand as a reason not to remove it?

# NO. It is a true fact that does not block removal.

**Three independent reasons, each from the code:**

1. 🔴 **It is not the only site that captures a pending order.** `confirm` does, and its own comment
   says *"THIS IS ALSO WHERE A CARD ORDER THAT LANDED `pending` CAPTURES."* (A3)
2. 🔴 **Removing the button does not remove the site.** The handler, `captureOnConfirmation` and
   `moveSlotBooking` all remain; only one caller of one action was deleted. (B2)
3. 🔴 **The site has never fired.** Your audit-log evidence: 448 rows, three weeks, **no
   `adjust_slot_+N` of any kind** — so no capture has ever moved through it. (B5)

⚠️ **The objection was correct as a FACT and wrong as an INFERENCE**, and the numbering it rested on is
itself stale (A2). **The honest reading: it was a good instinct to stop and check, and the check now
says the coast is clear.**

## E4. Defects found in their own right, regardless of this decision

**1. ⚠️ The in-code capture-site numbering is wrong.** Two comments say *"of 4"*; there are **five**
sites with five triggers (A2). **Anyone auditing captures by following those comments will look for
four and stop.**

**2. ⚠️ `moveSlotBooking` becomes dead code.** With the button gone, its only caller is a handler that
can now only be reached by an outbox replay or a direct POST. **READ** — its entire body is duplicated
inline in the edit branch. **Not removed here; `lib/slot-bookings.ts` is out of scope.**

**3. 🔴 THE DEFERRED CAPTURE PATH HAS DEMONSTRABLY FAILED IN PRACTICE.** Your evidence:
**`capture_failed` ×5, `capture_missing` ×2, `capture_recovered` ×2**, all inside about eight minutes
on 12–13 August. **Not investigated, as instructed. What it implies about reliability:**

- ✅ **The backstop works.** `capture_missing` is written **before** any repair — **READ**,
  `stranded-authorisations.ts` records the defect first — and two of those became `capture_recovered`.
  **The two orders that were stranded were collected.**
- 🔴 **But five captures failed at their primary site**, which is the thing the sweep exists to catch.
  **The mechanism this removal makes more load-bearing is one that has needed to fire, and fired
  correctly, within the last week.**
- ⚠️ **AND THE SWEEP'S OWN COMMENT NAMES THE COST OF THAT: *"A RECOVERY IS A DEFECT REPORT, NOT A
  SUCCESS STORY."*** Routing ordinary time-change captures through it **dilutes exactly the signal
  those nine rows represent** — a future `capture_missing` becomes harder to read as an alarm.
- ⚠️ **INFERRED, and stated as the honest bound: this does not make the removal unsafe** — the money is
  collected either way — **but it does mean the deferred path is not theoretical, and its failure rate
  is not zero.**

**4. ⚠️ `slotWarning` is computed and may never be shown.** **READ** — the edit branch sets it on a
capacity-write failure, with the operator-facing sentence *"Order saved, but the kitchen capacity board
could not be updated"*. **Not traced to a render in this task.** Flagged because C1's reassurance rests
on that rebooking succeeding.

## E5. No recommendation

**Reported, not recommended.** The decision is yours; this report states what the code does.

---

# PART F — INTEGRITY

## F1. Byte scan — every file opened

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  app/api/dashboard/action/route.ts             174,041 bytes  offending=0  CR=0
  app/api/orders/submit/route.ts                 83,547 bytes  offending=0  CR=0
  app/api/orders/cancel/route.ts                  6,819 bytes  offending=0  CR=0
  lib/slot-bookings.ts                           24,528 bytes  offending=0  CR=0
  lib/payments/stranded-authorisations.ts        15,268 bytes  offending=0  CR=0
  lib/payments/promote-draft.ts                  33,099 bytes  offending=0  CR=0
  lib/payments/capture.ts                        31,097 bytes  offending=0  CR=0
  lib/printing/printWatcher.ts                   16,947 bytes  offending=0  CR=0
  components/dashboard/OrderCard.tsx             87,216 bytes  offending=0  CR=0
  app/dashboard/[token]/page.tsx                390,162 bytes  offending=0  CR=0
  app/dashboard/[token]/kds/page.tsx            109,046 bytes  offending=0  CR=0
  supabase/migrations/20260816_find_stranded_…sql   7,985 bytes  offending=0  CR=0
TOTAL OFFENDING ACROSS ALL FILES: 0
```

✅ **Zero offending bytes, zero CR.** ⚠️ **All were opened READ-ONLY.**

## F2. Byte scan of this report

Separate pass, run after writing: **30,175 bytes, offending = 0, CR = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR.

## F3. 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 28 | 0 | 28 |
| U+1F534 LARGE RED CIRCLE | 32 | 0 | 32 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 12 | 0 | 12 |
| U+26A0 WARNING SIGN | 30 | **30** | **0** |

**Every warning sign is paired; ZERO are bare — 30 of 30.** Total U+FE0F in the file = **30**, which
accounts for all of them and none is attached to any other base. ⚠️ **The three unpaired bases are the
carrier-correct state, not a defect:** U+2705, U+1F534 and U+2500 are consistent within this file (0 of
28, 0 of 32, 0 of 12 respectively), so no base is split across two renderings. **13 distinct non-ASCII
classes**, all of which appear in the source files this report quotes.

## F4. `git status` — proof nothing changed

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
 M lib/native/statusBar.ts
?? docs/adjust-time-removal-report.md
?? docs/kds-fixes-report.md
```

🔴 **NO FILE WAS CREATED, MODIFIED OR DELETED BY THIS TASK EXCEPT THIS REPORT.**
⚠️ **`components/dashboard/OrderCard.tsx`, `app/dashboard/[token]/kds/page.tsx`,
`lib/native/statusBar.ts` and `docs/reference-manual.md` were ALREADY modified before this task began**
— the previous two turns' work, uncommitted. **Not one of them was touched by this diagnosis.**
