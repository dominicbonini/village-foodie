# Offline order numbering — the counter is no longer adoptable, and the prefix means offline

**Files changed — TWO:** `lib/native/orderGate.ts` and 🔴 `app/api/dashboard/action/route.ts`.
**Also written:** `docs/offline-numbering-fix-report.md` (this file).
🔴 **NO SQL WAS EXECUTED and no migration was needed — Fix 4 is reported and STOPPED, §4.**
**Nothing committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or `restore`.
**The outbox drain, the idempotency layers, `order_key` and the customer submit path are untouched.**

**No span of the prompt arrived garbled.** ⚠️ **ONE SCOPE LINE NEEDED READING TOGETHER WITH THE FIXES:**
"nothing under `app/api` beyond the counter write" sits beside Fixes 2 and 3, which can only be done in
the same handler's id assignment. **I read the explicit fixes as the permission and confined the edit to
that one block; nothing else in the route changed.**

---

# FIX 1 — 🔴 THE COUNTER CANNOT BE JUMPED

**Deleted, in full:**
```ts
        if (provisionalId) {
          const provNum = parseInt(provisionalId.replace(/^\D+/, ''), 10)
          if (Number.isFinite(provNum) && provNum > 0) {
            if (orderEventId) {
              const { data: ev } = await supabase.from('truck_events').select('order_counter').eq('id', orderEventId).maybeSingle()
              if (ev && provNum > (ev.order_counter ?? 0)) await supabase.from('truck_events').update({ order_counter: provNum }).eq('id', orderEventId)
```

**EVERY WRITER OF `order_counter` THAT REMAINS — ✅ EXECUTED, by grep over `app/` and `lib/`:**

| Writer | Shape |
|---|---|
| `increment_event_order_counter(uuid)` via `lib/order-utils.ts` | `UPDATE … SET order_counter = order_counter + 1 … RETURNING` |
| `increment_order_counter(text)` via the same helper | the same, truck-level fallback |
| `lib/seed-demo-orders.ts` | calls the same RPC |

🔴 **NOTHING ELSE WRITES THE COLUMN. Every remaining mention of `order_counter` in the action route is a
COMMENT — verified by grep.** **Both writers are `+ 1` and neither takes a value from a request body, so
no client value can reach it by any path.**

---

# FIX 2 — THE NUMBER ON ARRIVAL IS THE NEXT UNUSED ONE

```ts
        try {
          newOrderId = await nextOrderId(orderEventId, truck.id)
        } catch (err: any) { … }
```
**The `if (provisionalId) newOrderId = provisionalId` branch is gone.** A synced offline order takes the
next event number, exactly as an online one does.

## 🔴 THE BAG PROBLEM — PROPOSED, NOT DECIDED

**The operator may have written `N19` on a bag, and the card will now say `ON20`.** Three ways to show
both, with their costs:

1. ⭐ **Show it on the card only, from data the row already carries** — nothing stores the provisional
   today, so this needs the provisional persisted somewhere. **Cost: a column** (`placed_as text`), i.e.
   a migration. **Cheapest honest version of "both".**
2. **Show it in the toast at sync time** — *"Order N19 synced as #ON20"*. **Cost: nothing. No storage, no
   schema.** ⚠️ **But it is gone the moment the toast is.**
3. **Do nothing and let the prefix carry it** — `ON20` says "offline, device N", which is most of what
   the bag number said. **Cost: the operator matches by name/time, not by number.**

⚠️ **I HAVE NOT BUILT ANY OF THE THREE. Today the provisional number is not persisted at all.**

## Two devices offline at once

**TODAY: both mint from their own `hg_prov_seq`, so `N19` and `B19` are distinct on screen but their
NUMBERS collide — and before this change BOTH would have been adopted, each jumping the event counter.**
✅ **ARRIVAL-NUMBERING RESOLVES IT COMPLETELY: neither number survives, both orders take consecutive
server numbers, and the letters still tell the devices apart.**

---

# FIX 3 — THE PREFIX MEANS OFFLINE

```ts
        const placedOffline = (manualOrder as { placed_offline?: unknown })?.placed_offline === true || provisionalId !== null
        if (placedOffline) {
          const deviceLetter = provisionalId && /^[A-Za-z]/.test(provisionalId) ? provisionalId[0].toUpperCase() : ''
          newOrderId = `O${deviceLetter}${newOrderId}`
        }
```

🔴 **`O` MEANS OFFLINE. THE DEVICE LETTER IS KEPT AFTER IT, AND IT IS WORTH KEEPING** — a two-van truck
tells its screens apart by that letter, the code already produces it, and it costs one character:
**`ON20` = offline, device N, event number 20.** **No provisional (the route-2 case) ⇒ plain `O20`.**

## 🔴 THE ROUTE THAT PRODUCED AN UNMARKED ORDER 5 — QUOTED AND FIXED

**Before (`components/dashboard/AddOrderPanel.tsx`, the route-2 case):**
```tsx
        // :1039 and is already in the outbox carrying `provisional_id: null`, so on replay the server
        // assigns an ordinary sequential number — a route-2 order shows 'N8' now and '#7' after sync,
```
**The fix is one line, and it is in the GATE rather than the panel:**
```ts
    const queuedBody = { ...body, placed_offline: true, ...(expectedFrom ? { expected_from: expectedFrom } : {}), ...(queuedExtra ?? {}) }
```
🔴 **`queue()` IS THE ONE PLACE EVERY QUEUED BODY PASSES THROUGH, so both routes are stamped — including
the one whose body was built while the device still believed it was online.** ✅ **It rides on the QUEUED
body only, exactly like `expected_from`: an online request is byte-identical.**

---

# FIX 4 — `source` — 🔴 STOPPED, AS INSTRUCTED

**Neither path sets it:** `place_order_atomic`'s insert list does not name `source`, and the manual
`insertPayload` does not either. Both rely on the column default, which is why all seven rows read
`web`.

**What it would take to make it honest:** each path writing its own value — `'web'` on the customer
route, `'manual'` (or `'offline'`) on this one. 🔴 **THAT IS A ONE-LINE WRITE PER PATH AND NEEDS NO
MIGRATION *IF* THE COLUMN HAS NO CHECK CONSTRAINT — AND I CANNOT SEE WHETHER IT DOES WITHOUT RUNNING
SQL, WHICH I AM NOT PERMITTED TO DO.** ⚠️ **So it is stopped: if there is a CHECK, a new value is a
migration and your call; if there is not, it is two lines. The check that settles it is
`\\d+ orders` or a query on `information_schema.check_constraints`.**

---

# ⚠️ `id` IS NOT A KEY — CONFIRMED

✅ **Nothing in this change treats `id` as a lookup key.** The insert's identity is `order_key` (minted
client-side, the upsert's conflict target); `newOrderId` is written to the `id` column and is read by
nothing in this handler afterwards. **The prefix change alters a display string only.**

## ⚠️ EXISTING ROWS AND COUNTERS

🔴 **NO ROW IS RENUMBERED AND NO COUNTER IS REWOUND.** There is no backfill, no UPDATE over history, and
no SQL at all in this change. **Test Kitchen's `order_counter` stays at 19 and its next order is 20**
(displayed `O20`/`ON20` if placed offline). **Gusto's history is untouched.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0.** **`npx eslint`: action route 19 errors / 1 warning — unchanged from
before this edit; `orderGate.ts` 3/0.**

| Required claim | Method |
|---|---|
| The counter cannot be jumped by any client value | ✅ **EXECUTED** — grep over `app/` and `lib/`: the only writers are the two `+ 1 … RETURNING` RPCs; every surviving mention in the route is a comment |
| A synced offline order takes the next unused number | ✅ **EXECUTED (source)** — the adoption branch is deleted; `nextOrderId` is now unconditional. 🔴 **Not exercised — no order was synced** |
| Every offline order is marked, including the `provisional_id: null` route | ✅ **EXECUTED (source)** — the stamp is in `queue()`, which every queued body passes through, and `placedOffline` ORs it with the provisional so an older queued body still marks |
| No existing row is renumbered | ✅ **EXECUTED** — no UPDATE, no backfill, no SQL in the diff |
| The customer submit path is unchanged | ✅ **EXECUTED** — `app/api/orders/submit/route.ts` and `place_order_atomic` are not in this task's diff |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RUN OR SYNCED.** No order placed, no outbox drained, no counter read after the change.
- ⚠️ **An order already sitting in an outbox right now carries no `placed_offline`** — it will still be
  marked, because `provisionalId !== null` is the second arm of `placedOffline`, **unless it is a
  route-2 body, which has neither.** 🔴 **Those in-flight route-2 orders will sync unmarked; only new
  ones are covered.**
- ⚠️ **`O` before a number is a display choice made here, not tested with an operator.** `O20` beside a
  handwritten `N19` on a bag is the reconciliation problem Fix 2's proposals address.

---

# INTEGRITY

```
lib/native/orderGate.ts               20,365 → 21,011 bytes · classes 8 → 8
app/api/dashboard/action/route.ts    175,225 → 177,135 bytes · classes 14 → 14
BOTH: NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0 · added vs HEAD: NONE
```

✅ **Neither file gained or lost a non-ASCII class — the new comments are ASCII by construction.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/offline-numbering-fix-report.md   bytes 11,520
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 21 | 0 | 21 |
| U+26A0 (warning sign — TEXT presentation) | 9 | 9 | 0 |
| U+2705 (check mark button) | 12 | 0 | 12 |
| U+2B50 (star) | 1 | 0 | 1 |

U+26A0 is the only TEXT-presentation base here and every occurrence is PAIRED with U+FE0F.
The rest have emoji presentation by default, so bare is correct for them.

## Working tree

```
 M app/api/dashboard/action/route.ts
 M app/api/dashboard/route.ts
 M app/api/heartbeat/route.ts
 M app/api/manage/route.ts
 M app/api/orders/submit/route.ts
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/CapacityBreachBanner.tsx
 M lib/copy/offlineProtection.ts
 M lib/native/orderGate.ts
 M supabase/functions/heartbeat-monitor/index.ts
?? docs/breach-banner-copy-report.md
?? docs/breach-banner-safe-area-report.md
?? docs/offline-fit-check-report.md
?? docs/offline-notice-gate-report.md
?? docs/offline-numbering-fix-report.md
?? docs/offline-order-numbering-capacity-report.md
?? docs/offline-protection-modes-build.md
?? docs/offline-protection-modes-review.md
?? docs/offline-protection-popup-report.md
?? docs/oversell-warning-review-report.md
?? supabase/migrations/20260818_offline_protection_mode.sql
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M lib/native/orderGate.ts` | 🔴 **THIS TASK — clean at HEAD before it** |
| 🔴 `M app/api/dashboard/action/route.ts` | ⚠️ already `M` from the offline-protection-modes build; 🔴 **THIS TASK wrote to it again** |
| 🔴 `?? docs/offline-numbering-fix-report.md` | 🔴 **THIS TASK** — this file |
| `M components/dashboard/AddOrderPanel.tsx` | ✅ pre-existing — the offline fit-check task |
| the other `M` files, `?? supabase/migrations/20260818_…sql` and every other `?? docs/*.md` | ✅ pre-existing — earlier tasks this session |

No `git stash`, `git checkout` or `git restore` was run at any point.
