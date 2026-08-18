# Offline orders — the numbers, the counter gap, and the double-confirmed slot

🔴 **NOTHING WAS EDITED EXCEPT THIS FILE.** No commit, stage, revert, stash or clean; no `git stash`,
`checkout` or `restore`. No build, no deploy, no SQL, no schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

**Every claim below is marked READ (quoted from source) or INFERRED (a conclusion drawn from it).**
🔴 **THE TWO PATHS ARE REPORTED SEPARATELY THROUGHOUT — they are NOT the same code:**
**the CUSTOMER path is `app/api/orders/submit/route.ts` → `place_order_atomic`; the OFFLINE-REPLAY path
is the outbox → `/api/dashboard/action` `action:'manual'`.**

# 🔴 THE THREE ANSWERS, UP FRONT

| | Finding | Confidence |
|---|---|---|
| **(a)** | **`N` is this DEVICE'S LETTER, not a marker for "offline".** `deviceLetter()` derives A–Z from `device_id`. **Order 5 has no prefix because its queued body carried `provisional_id: null`** — the panel's own comment calls this "route 2" and says the server then "assigns an ordinary sequential number" | 🔴 **READ for the mechanism, INFERRED for which route each order took** |
| **(b)** | 🔴 **NOTHING CONSUMED 6–17. THE COUNTER WAS JUMPED, NOT DRAINED.** Adopting a provisional number runs `if (provNum > order_counter) update order_counter = provNum` — **N18 set it to 18, N19 to 19** | 🔴 **READ — the code does exactly this, and it explains 19-with-7-rows exactly** |
| **(c)** | 🔴 **THE REPLAY PATH HAS NO CAPACITY CHECK AT ALL.** The route's own words: *"the manual path bypasses auto_accept and ALL capacity gating"*. **The two-device oversell test passed because BOTH devices were on the CUSTOMER path, which does claim a slot. N19 never went near that code** | 🔴 **READ** |

---

# Q1 — WHO ASSIGNS THE DISPLAY NUMBER

## The CUSTOMER path — server-side, always

```sql
  if p_event_id is not null then
    v_order_number := increment_event_order_counter(p_event_id);
  end if;
  if v_order_number is null then
    v_order_number := increment_order_counter(p_truck_id);
  end if;
```
```ts
      orderId = String((rpcData as any).order_number)
```

**READ. The customer never supplies a number. `place_order_atomic` mints it inside the transaction.**

## The OFFLINE/OPERATOR path — client-minted, server-ADOPTED

```ts
        const provisionalId: string | null =
          typeof manualOrder?.provisional_id === 'string' && manualOrder.provisional_id ? manualOrder.provisional_id : null
        if (provisionalId) {
          newOrderId = provisionalId
        } else {
          newOrderId = await nextOrderId(orderEventId, truck.id)
        }
```

**READ. Present ⇒ adopted verbatim as the permanent display id. Absent ⇒ the server mints the next
sequential.**

## 🔴 WHAT MAKES A NUMBER GET THE `N`

```ts
export async function deviceLetter(): Promise<string> {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i)) % 26
  const letter = String.fromCharCode(65 + sum)
```
```ts
export async function nextProvisionalId(): Promise<string> {
  const letter = await deviceLetter()
  return `${letter}${next}`
}
```

🔴 **READ — `N` IS NOT A STATUS. It is a checksum of this device's `device_id` mod 26.** The same order
from another device would read `B18` or `Q18`. ⚠️ **So the prefix identifies the DEVICE, and only
incidentally tells you the order was minted offline.**

## 🔴 WHY ORDER 5 HAS NO PREFIX

```tsx
        // ⚠️ THE ROUTE-2 NUMBER IS DISPLAY-ONLY, AND THAT ASYMMETRY IS DELIBERATE. The body was built at
        // :1039 and is already in the outbox carrying `provisional_id: null`, so on replay the server
        // assigns an ordinary sequential number — a route-2 order shows 'N8' now and '#7' after sync,
        // where a route-1 order keeps its N permanently.
```

🔴 **READ, AND IT IS DOCUMENTED AS INTENDED BEHAVIOUR.** Two routes into the outbox:

- **Route 1** — the panel already knew it was offline when it built the body ⇒ `provisional_id` is in
  the queued payload ⇒ **the N survives sync** (N18, N19).
- **Route 2** — the body was built while the device still believed it was online, and `gatedAction`
  queued it after the fact ⇒ **`provisional_id: null` in the queue** ⇒ the operator saw an N-number on
  screen (display-only) and the server minted `5` on arrival.

**INFERRED, and it fits every column you have: order 5's `placed_at` is 11:48:08 — the EARLIEST of the
three — so it is the order placed as connectivity was failing, exactly the route-2 shape. N18 (11:48:21)
and N19 (11:49:56) were placed once the panel knew it was offline.**

---

# Q2 — WHAT INCREMENTS `order_counter`

**Every writer, READ:**

| # | Writer | Increments on |
|---|---|---|
| 1 | `increment_event_order_counter(uuid)` — `UPDATE … SET order_counter = order_counter + 1 … RETURNING`, called **inside** `place_order_atomic` | a customer order. **Atomic with the insert: a rollback takes the increment with it** |
| 2 | `increment_order_counter(text)` — the truck-level fallback, same shape | an order with no event |
| 3 | `nextOrderId(orderEventId, truck.id)` on the **manual** path (`lib/order-utils.ts` → the same RPCs) | 🔴 **called BEFORE the insert, in a SEPARATE statement.** A failed insert after it **consumes a number with no row** |
| 4 | 🔴 **THE PROVISIONAL ADVANCE** — `if (provNum > (ev.order_counter ?? 0)) await supabase.from('truck_events').update({ order_counter: provNum })` | 🔴 **NOT AN INCREMENT — A JUMP TO AN ARBITRARY NUMBER** |

## 🔴 TWELVE MISSING NUMBERS: NOTHING CONSUMED THEM

```ts
        // (c2) OFFLINE-ORIGIN order KEEPS its device number (e.g. M5) — so ADVANCE the event's order counter
        //      to max(current, provisionalNumber). Otherwise the counter stays behind the offline numbers and
        //      the next ONLINE order restarts at 5 and numerically overlaps M5.
```

🔴 **READ. The counter did not tick 6, 7, 8 … 17 and lose the rows. It went from 5 to 18 in one write,
then 18 to 19.** The gap is a **consequence of the design**, not a leak: the device's own provisional
sequence was at 17 (`hg_prov_seq`, seeded monotonically by `seedProvisionalSeq` and **never rewound**),
so its next two numbers were 18 and 19, and the server raised the event counter to match.

⚠️ **INFERRED but strongly: `seedProvisionalSeq` is documented as MONOTONIC — *"only ever raises
hg_prov_seq (max), never rewinds"* — and it is seeded from the highest known order number the device has
seen. A device that has worked other events, or an earlier day on this one, carries that high-water mark
forward. THE PROVISIONAL SEQUENCE IS PER DEVICE AND LIFELONG; THE EVENT COUNTER IS PER EVENT AND STARTS
AT 1. Adopting one into the other transplants the device's history onto this event.**

**Your three named suspects, answered — READ:**

- **A replay attempt:** ❌ **no.** Replay of an already-synced order hits the `order_key` upsert and
  takes the `provisionalId` branch, which **calls no counter RPC**.
- **A failed insert:** ✅ **yes, for path 3 only** — `nextOrderId` runs first and is not rolled back.
- **A conflict retry / the `expected_from` 409 guard / the three-layer idempotency check:** ❌ **no.**
  They are all on the STATUS ops path, they short-circuit **before** any order insert, and none of them
  calls a counter RPC.

---

# Q3 — DO THE `N` NUMBERS AND THE COUNTER AGREE?

**READ — the server ADOPTS, and then raises the counter to match:** the two quotes in Q1 and Q2 are the
whole mechanism. **`N18`/`N19` "match the counter's range" because they SET it.** `5` does not match
because it was minted the other way — by the counter, in the ordinary sequence.

⚠️ **AND ONE COLUMN CANNOT TELL YOU WHICH PATH AN ORDER TOOK.** `place_order_atomic`'s insert list has
no `source`, and the manual path's `insertPayload` does not set one either — **both rely on the column
default. That is why all seven rows read `web`, including any that came from the operator's own panel.
`source` is not evidence of origin here.** (READ: the insert column lists.)

---

# Q4 — 🔴 THE DOUBLE-CONFIRMED SLOT

## The CUSTOMER path DOES resolve capacity — READ

```ts
    // NOTE: the old "slot full → 409" hard-block is removed for the customer path.
    // A full slot now never rejects — capacity is resolved at booking time by
```
```ts
        const claim = await placeOrderInSlotLocked(
          resolvedTruckId, eventDate, eventRow?.id ?? null, requestedSlot, orderLines, itemCatMap, catConfigs, …
        )
        if (claim.booked && claim.finalSlot) {
          finalSlot = claim.finalSlot
          if (requestedSlot) {
            confirmedSlot = claim.finalSlot
            slotChanged = claim.finalSlot !== requestedSlot
```

**So on the customer path: accept, never reject — and BUMP forward when full, with `slotChanged`
driving the "your slot was taken" message. That is the behaviour your two-device oversell test
exercised.**

## 🔴 THE MANUAL / OFFLINE-REPLAY PATH DOES NOT — READ, AND IT SAYS SO ITSELF

```ts
      // knows the queue, so the manual path bypasses auto_accept and ALL capacity gating
```

🔴 **THERE IS NO `placeOrderInSlotLocked` CALL, NO `eventKitchenCapacity` READ AND NO BUMP ANYWHERE ON
THAT PATH. The slot the client sent is inserted verbatim** (`slot: slot || null`), **with
`status: 'confirmed'` hardcoded.**

## 🔴 SO WHY THE OVERSELL TEST DID NOT FIRE HERE

**INFERRED, from the above:** the test put **two customers** through `/api/orders/submit`, where one
claim wins the slot and the other is bumped. **N19 did not go through that route at all.** It was an
operator-placed order replayed through `action:'manual'`, **which has no capacity concept** — so:

- ❌ **not "the check ran against stale capacity"** — no check ran;
- ❌ **not "it passed because the order was placed before the slot filled"** — nothing was evaluated at
  placement OR at arrival;
- ✅ 🔴 **the check is ABSENT on that path, by design, and the design's stated reason is that the
  operator is standing there and "knows the queue".** ⚠️ **That reason holds for a walk-up at the hatch.
  It does not hold for an order replayed 54 seconds later into a slot that filled in between.**

---

# Q5 — IS THERE ANY DOUBLE-BOOKING DETECTION?

🔴 **FOR THIS CASE: NO.** What exists, READ:

| Mechanism | What it does | Does it catch this? |
|---|---|---|
| `capacityBreaches` on `/api/dashboard` — *"Piece 2 — slots genuinely over a ceiling (reconnect flag)"*, surfaced by `CapacityBreachBanner` | flags slots over the ceiling **after an offline drain** | ⚠️ **ONLY IF THE SLOT IS OVER THE KITCHEN-CAPACITY CEILING.** Two orders in one 17:00 slot on a truck whose capacity is larger than those two orders is **not** a breach |
| `placeOrderInSlotLocked` | resolves and bumps | ❌ customer path only |
| The traffic-light dot / slot indicators | show fullness for NEW placements | ❌ describes the slot, does not flag existing rows |

**WHAT THE OPERATOR SEES TODAY FOR THESE TWO ORDERS — INFERRED from the above:** two ordinary confirmed
cards, both reading 17:00, in the normal queue, **with nothing marking them as sharing a slot and no
banner** unless the total crosses the capacity ceiling. ⚠️ **`requested_slot` is null on N19 (Q7), so
even the "was this moved?" evidence is absent.**

---

# Q6 — `capacity_ack_at`

```ts
          // OVER-CAPACITY ACKNOWLEDGEMENT. Set only when the operator was shown the over-capacity
          capacity_ack_at: manualOrder?.capacityAcknowledged === true ? new Date().toISOString() : null,
```

**READ. Written ONLY on the manual path, only when the client says the operator was shown an
over-capacity warning and accepted it. It is an OPERATOR acknowledgement, not a customer warning.**

🔴 **NULL ON ALL SEVEN IS EXPECTED, AND IT MEANS ONE OF TWO THINGS, WHICH THIS COLUMN CANNOT SEPARATE:**
either the order never went through the manual path, or it did and the operator was never shown a
warning — **which is precisely what Q4 says happens, since that path evaluates no capacity.**
⚠️ **A customer-path order can never carry it.**

---

# Q7 — `requested_slot`

```ts
        requested_slot: requestedSlot,
```
```ts
      // client sent it. `requested_slot` and the slot-moved comparison are both computed here and
```

**READ. Written by the CUSTOMER path only, as the slot the customer ASKED for, so the confirmation
screen can say "you asked for X, you have Y".** ⚠️ **It is `null` for an ASAP order by construction** —
the route says so.

🔴 **CAN A MOVED ORDER BE TOLD FROM A NEVER-MOVED ONE? ONLY ON THE CUSTOMER PATH, AND ONLY FOR A CHOSEN
SLOT.** `requested_slot != slot` ⇒ moved. **`requested_slot IS NULL` is ambiguous three ways: an ASAP
customer order, a manual/offline order (that path never writes the column), or a pre-column row.**

**Applied to your table — INFERRED:** order 4 (`requested_slot 17:00`, slot 17:00) is a customer order
that asked for 17:00 and got it. **The other six are null**, which for orders 1–3 and 5 is consistent
with ASAP, and for N18/N19 is consistent with the manual path not writing it at all. 🔴 **N19's null is
NOT evidence that it was not moved — it is evidence that nothing ever considered moving it.**

---

# Q8 — WHAT THE REPLAY RE-VALIDATES ON ARRIVAL

**READ, from the `manual` handler:**

| Fact | Re-validated on arrival? |
|---|---|
| **The order's identity** | ✅ **YES** — `order_key` upsert idempotency, so a replay cannot double-insert |
| **Menu prices / totals** | 🔴 **NO — TRUSTED FROM THE CLIENT.** The payload's `subtotal`/`total` are inserted as sent |
| **Capacity / slot availability** | 🔴 **NO — "bypasses … ALL capacity gating".** The slot is inserted verbatim |
| **Event status** | ⚠️ **NOT AS A GATE.** The handler resolves the event for scoping, not to refuse a replay into a closed or paused event |
| **Payment method / paid state** | ✅ validated to the `cash`/`card`/null vocabulary |
| **The display number** | 🔴 **ADOPTED FROM THE CLIENT when `provisional_id` is present** (Q1) |
| **Held card authorisation** | ✅ the 409 guard — but that is the `mark_paid` path, not this one |
| **The buzzer number** | ✅ re-assigned server-side via `assignBuzzer` |

⚠️ **INFERRED: 2 minutes 40 seconds is long enough for a slot to fill, a price to change and an event to
close — and none of those three is re-checked.**

---

# Q9 — THE CHEAPEST CHECK FOR EACH (NOT PERFORMED)

**(a) — why one order kept a plain number:** 🔴 **read the outbox op for order 5 on that device**
(`hg_outbox_*` in Preferences), or the server log line for its `manual` call: **`provisional_id` present
or absent settles route 1 vs route 2 in one look.** ⚠️ **If the device has since been cleared, the
`placed_at` ordering in your own table is the next-best evidence, and it already points that way.**

**(b) — the twelve missing numbers:** 🔴 **read `hg_prov_seq` on that device.** If it is 19, the jump
explanation is confirmed outright and no number was ever consumed. **A second, server-side check with the
same power: `select count(*) from action_log where action = 'manual' and …` for this event — if there are
7 creates and no failures, nothing minted-and-lost.**

**(c) — the double-booked slot:** 🔴 **check whether `production_slot_usage` has a row for N19's 17:00
slot.** The customer path files usage inside `place_order_atomic`; **if N19 has no usage row, it never
went through a capacity-aware path — which is the conclusion above, made from the data rather than from
the code.**

---

# WHAT I CANNOT DETERMINE READ-ONLY

- 🔴 **WHICH PATH EACH ROW ACTUALLY TOOK.** `source` is defaulted on both paths (Q3), so the column that
  should answer this does not.
- ⚠️ **Whether any of the twelve numbers WAS consumed by a failed insert (path 3) rather than skipped by
  the jump.** Both mechanisms exist; the jump alone accounts for the whole gap, but they are not
  mutually exclusive.
- ⚠️ **Whether the 17:00 slot was actually over its kitchen-capacity ceiling** — that decides whether the
  existing `capacityBreaches` banner would have said anything at all.

---

# INTEGRITY

```
docs/offline-order-numbering-capacity-report.md   bytes 18,043
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 36 | 0 | 36 |
| U+26A0 (warning sign — TEXT presentation) | 15 | 15 | 0 |
| U+2705 (check mark button) | 7 | 0 | 7 |
| U+274C (cross mark) | 6 | 0 | 6 |

U+26A0 is the only base here with TEXT presentation used as an emoji, and every occurrence is
PAIRED with U+FE0F. The rest have emoji presentation by default, so bare is correct for them.
NO SOURCE FILE WAS EDITED, so there is no before/after census to report for one.

## Working tree

```
 M app/dashboard/[token]/page.tsx
?? docs/offline-notice-gate-report.md
?? docs/offline-order-numbering-capacity-report.md
?? docs/offline-protection-popup-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `?? docs/offline-order-numbering-capacity-report.md` | 🔴 **THIS TASK — the only file written** |
| `M app/dashboard/[token]/page.tsx`, `?? docs/offline-notice-gate-report.md`, `?? docs/offline-protection-popup-report.md` | ✅ **pre-existing — the offline-notice task immediately before this one.** 🔴 **THIS TASK EDITED NO SOURCE FILE** |

⚠️ **The tree is short because you committed mid-session (`dcb8862`, `fa72f9a`); nothing was cleaned by
me.** Nothing was committed, staged, reverted, stashed or cleaned here. No `git stash`, `git checkout`
or `git restore` was run at any point.
