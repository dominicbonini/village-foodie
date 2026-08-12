# Making a held authorisation visible

**Date:** 14 August 2026
**BUILD. One new module, eight files edited. ONE MIGRATION WRITTEN — comment-only, and you run it. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled.

---

# 🔴 ONE INSTRUCTION CONFLICT, RESOLVED THE WAY YOU RESOLVED IT

**"WHAT NOT TO TOUCH" lists `promoteDraft`. Requirement 3 says "promoteDraft must pass it."**

I did not stop, because **requirement 3 is not ambiguous** — it names the file and states exactly what it must do, which is the answer to the question I would otherwise have asked. I read the do-not-touch list as "do not change what these do", and requirement 3 as an explicit carve-out.

🔴 **THE CARVE-OUT IS EXACTLY ONE LINE**, `cardHeld: !!draft.payment_intent_id`, plus its comment. **Nothing else in `promoteDraft` changed** — not the claim, the checks, the lock, the insert, the capacity rebuild or the other email. **If you meant the list to win, that one line is the whole revert.**

---

# ✅ WHAT ORDER 18 LOOKS LIKE, BEFORE AND AFTER

```
══ (a) ORDER 18 — a promoted draft with a live PaymentIntent ══
  order 18 payment_status: unpaid  ledger rows: 0

  BEFORE:
    balance.status : unpaid   held: false
    order card chip: no chip
    completion btn : Mark paid
    KDS            : £6.00 due
    ticket         : TO PAY                                     £6.00

  readHeldAuthorisations -> ["3a621e2f-92b6-4d70-9d37-c5a0e469426c"]
  AFTER:
    balance.status : unpaid   held: true
    order card chip: CARD HELD (indigo)
    completion btn : Collected
    KDS            : card held
    ticket         : CARD HELD                         DO NOT COLLECT
```

🔴 **`balance.status` IS STILL `unpaid` AND THE LEDGER IS STILL EMPTY.** Nothing about `getOrderBalance`, the ledger or the CHECK constraint moved. The order is unpaid **and** has a card held; both are true and the surfaces now say so.

---

## 1. The single source of truth

**`lib/payments/held-authorisation.ts`** — `readHeldAuthorisations(supabase, orderKeys) → Set<string>`.

```ts
  const { data: drafts, error } = await supabase
    .from('order_drafts')
    .select('order_key, payment_intent_id')
    .in('order_key', orderKeys)
    .not('payment_intent_id', 'is', null)
    .not('promoted_at', 'is', null)
    .is('authorization_cancelled_at', null)
```
then
```ts
  const { data: captured, error: capErr } = await supabase
    .from('order_payments')
    .select('idempotency_key')
    .in('idempotency_key', [...byKey.keys()])
…
  for (const [idemKey, orderKey] of byKey) {
    if (!capturedKeys.has(idemKey)) held.add(orderKey)
  }
```

🔴 **THE CAPTURE CHECK IS THE HALF THAT IS EASY TO MISS.** Capture does not change the draft row — `promoted_at` stays set and `authorization_cancelled_at` stays null — so without it **every captured order would read "held" forever.** Proved in §V(c).

⚠️ **FAILS CLOSED:** any read error returns an empty set and every surface shows exactly what it showed before this existed. *"Being wrong in that direction costs an operator a second look at an order that is already paid for; being wrong the other way would tell them not to collect money that really is owed."*

✅ **Computed ONCE in `/api/dashboard` and shipped as `heldAuthorisations: string[]`.** The card, the KDS and the ticket all read that one answer. **No surface derives it.**

### 🔴 THE PURGE DEPENDENCY — WHAT I WROTE, AND WHERE

**Two places, because a warning in only one of them is a warning someone will not read.**

**(i) In the migration `supabase/migrations/20260814_purge_order_drafts_display_note.sql`** — a `create or replace` whose delete predicate is **character-for-character unchanged**, with the warning inside the function body:

```sql
  -- 🔴 `promoted_at is null` IS NOW LOAD-BEARING FOR DISPLAY, NOT ONLY FOR ERASURE. A PROMOTED draft is
  -- the only record that its order has money held against it, and four customer- and operator-facing
  -- surfaces read it. Widening this delete to promoted rows would make every held order read
  -- "collect at the hatch" again. See the header, and lib/payments/held-authorisation.ts.
```

**and in its `COMMENT`, which survives in the database itself:**

```sql
comment on function purge_order_drafts() is
  'GDPR erasure for ABANDONED order drafts: … '
  'DO NOT WIDEN THIS TO PROMOTED ROWS. A promoted draft is the only record that its order has a held, '
  'uncaptured card authorisation, and the order card, KDS, printed ticket and confirmation email all '
  'read it (lib/payments/held-authorisation.ts). Deleting one would make a held order read as owing '
  'money at the hatch and an operator would collect it twice. Promoted rows carry no PII — erasePii '
  'nulls name, email and phone at promotion — so retaining them retains no personal data.';
```

**(ii) In the module header:**
```
// 🔴 THAT ROW IS NOW LOAD-BEARING FOR DISPLAY. `purge_order_drafts()` has never swept promoted rows —
// its predicate is `promoted_at is null` — but nothing GUARANTEED that, and deleting a promoted draft
// would silently return every held order to reading "collect at the hatch". …
// ⚠️ IF YOU EVER NEED TO SWEEP PROMOTED DRAFTS, the fact must move somewhere else FIRST — an `orders`
// column, or a ledger row of a new kind. Do not delete the answer and then look for it.
```

🔴 **THIS IS THE ONE MIGRATION, AND IT IS COMMENT-ONLY AND BEHAVIOURALLY INERT.** Skipping it costs no behaviour — it costs the warning, which is the entire point of the file.

---

## 2. No new status, no change to the resolver

✅ **`orders_payment_status_check` untouched.** ✅ **`getOrderBalance` untouched** — same return type, same arithmetic, same ledger rows. ✅ **No `payment_status` value added.** The held fact travels **beside** the balance, never inside it.

---

## 3. The four surfaces

| Surface | Before | After |
|---|---|---|
| **Order card — chip** | *nothing at all* | 🔴 **`CARD HELD`**, indigo, with `title="Card authorised — do not collect. Payment is taken when you confirm."` |
| **Order card — button** | 🔴 **`Mark paid`** | **`Collected`** |
| **KDS** | `£6.00 due` (amber) | **`card held`** (indigo) |
| **Ticket** | `TO PAY            £6.00` | **`CARD HELD    DO NOT COLLECT`** |
| **Email** | "Pay at the truck on collection" | **"Your card is held, not charged"** |

### The button — what I did with `Mark paid`

```tsx
    // 🔴 A HELD AUTHORISATION TAKES THE SAME BRANCH AS PAID: COMPLETE, DO NOT COLLECT. That is the whole
    // point of this change — an operator must never be offered `Mark paid` for money that is already
    // held, because pressing it books a SECOND payment at the hatch for an order the customer has
    // already authorised.
    // ⚠️ IT DOES NOT CLAIM THE ORDER IS PAID. The chip above says CARD HELD, the balance still reads
    // unpaid, and `Collected` is a KITCHEN action — it advances handover and books no money.
    if (effectivePaid || heldAuthorisation) {
      return <Btn label="Collected" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
    }
```

⚠️ **The disabled placeholder was changed in the same breath** — the file documents those two branches as drifting if only one is changed.

⚠️ **AND THE HELD CHIP IS NOT TAPPABLE.** The remove-payment modal reverses a *recording*; a held authorisation has no ledger row to remove, so it would offer to undo something that does not exist.

### The colour choice

🔴 **Indigo on all three operator surfaces. Not green, not amber.** *"Green means money received; amber means money outstanding. This is neither, and giving it either colour would be the whole defect again in a different form."*

### The email — the exact sentences a card customer now reads

**HTML** (indigo panel, matching the operator's chip):
> **Your card is held, not charged**
> Test Kitchen takes the payment when they confirm your order. Nothing to pay at the truck.

**Plain text:**
> Your card is held, not charged. Test Kitchen takes the payment when they confirm your order — nothing to pay at the truck.

✅ **Both halves branch.** The sentence was a hardcoded constant in *both*, so changing only the HTML would have left the text part — what a stripped-down or accessibility client renders — telling a paying customer to pay again.

**And `promoteDraft` passes it, in the one line requirement 3 named:**
```ts
          cardHeld:     !!draft.payment_intent_id,
```
⚠️ *"TRUE BY CONSTRUCTION AT THIS LINE. `draft.payment_intent_id` is non-null only for a card order, and nothing captures before promotion returns — so an intent here is a HELD one."* No query, and it cannot disagree with the resolver the operator surfaces use.

---

## 4. The confirmation retry window: **60 seconds**

```tsx
    let attempt = 0
    const MAX_ATTEMPTS = 30
    const RETRY_MS = 2000
```

**Set from the measurement, quoted in the code:**
```
    // THE MEASUREMENT (order 18, 12 August): draft 16:38:55 -> Stripe stamped the authorisation
    // 16:39:18 -> webhook received 16:39:19.6 -> order row 16:39:42.3.
    //   1. 22.4s of that was the CUSTOMER at the card sheet. Not our latency, and not what this bounds —
    //      they are not looking at the confirmation yet.
    //   2. 🔴 22.7s IS OURS: webhook receipt to order row. That is the number this must cover.
```

| | |
|---|---|
| Was | 8 × 1s = **~8s** — order 18 missed it and the customer was told their order could not be found |
| Now | 30 × 2s = **60s** |
| Why 60 | ⚠️ **~2.6× the measured 22.7s**, leaving room for a slower cold start without hanging the screen on a genuinely bad key |
| Why 2s not 1s | The first attempt is immediate and usually succeeds, so the interval only costs the waiting case — **and half the requests is politer to a phone on poor coverage** |

⚠️ **THE COST, ACCEPTED:** a bogus key now takes ~60s to report "not found". *"The common case is a customer who has paid, and telling one of those their order does not exist is the worst screen in the product."*

---

## 5. Every string written

| Where | String |
|---|---|
| Order card chip | **`CARD HELD`** |
| Order card chip `title` | **`Card authorised — do not collect. Payment is taken when you confirm.`** |
| Order card button | **`Collected`** (existing string, newly reached) |
| KDS | **`card held`** |
| Ticket | **`CARD HELD`** … **`DO NOT COLLECT`** |
| Email HTML heading | **`Your card is held, not charged`** |
| Email HTML body | **`{truckName} takes the payment when they confirm your order. Nothing to pay at the truck.`** |
| Email plain text | **`Your card is held, not charged. {truckName} takes the payment when they confirm your order — nothing to pay at the truck.`** |

🔴 **THE WORD "PAID" APPEARS IN NONE OF THEM.** Machine-checked:
```
  held email contains the word "paid": false
```

✅ **Each is true for a customer who has authorised and not been charged**, and each tells an operator not to collect.

---

## V. VERIFICATION

⚠️ **Writes declared:** two probe orders, two probe drafts, one probe ledger row. **All cleaned — `probe orders []  drafts []  ledger 0`.** Order 18 untouched.

### (a) Order 18 — above. ✅

### (b) A pay-at-hatch order — byte-identical

```
  order 7 has a draft: false   held set: []
  BEFORE and AFTER (identical):
    balance.status : unpaid   held: false
    order card chip: no chip
    completion btn : Mark paid
    KDS            : £27.50 due
    ticket         : TO PAY                                    £27.50
```
✅ **`held` is false, so every branch takes the path it always took.** The email likewise:
```
  cardHeld FALSE (pay-at-hatch) HTML : "Pay at the truck on collection"
  cardHeld FALSE                TEXT : "Pay at the truck on collection."
  pay-at-hatch email unchanged by the new param: true
```

### (c) A captured order — reads paid, not held

**A real captured order:**
```
  order 1  has a draft: false   held set: []
    balance.status : paid   held: false
    order card chip: PAID (green)
    completion btn : Collected
    KDS            : ✓ paid
    ticket         : PAYMENT                                     PAID
```

**And the load-bearing half — a DRAFT-BACKED order, before and after its capture row:**
```
order + promoted draft with a live intent, NOT cancelled, NO ledger row:
  held -> ["a3b9aa86-…"]  <- correctly HELD

capture ledger row inserted: ok
  held -> []   <- correctly NOT held
```
🔴 **The ledger check does exclude a captured intent.**

⚠️ **AND I MUST CORRECT MY OWN FIRST ATTEMPT AT THIS TEST.** It reported `🔴 FAIL` twice, and **both were faults in the probe, not the code**: the first inserted no `orders` row, so the ledger insert hit `23503 order_payments_order_key_fkey` and no capture row ever existed; the second read the ledger with a raw select, skipping the `account_is_test` annotation `/api/dashboard` applies, so `isLiveRow` dropped a `livemode:false` online row and `balance.status` read `unpaid`. **The real captured order above shows `paid` correctly.** Reported rather than quietly re-run.

### (d) A cancelled authorisation — not held

```
  draft has payment_intent_id AND authorization_cancelled_at set
  held set: []   PASS - NOT held
    order card chip: no chip
    completion btn : Mark paid
    KDS            : £6.00 due
    ticket         : TO PAY                                     £6.00
```
✅ **Correct — the hold was released, so the customer genuinely does owe money.**

### (e) 🔴 THE COST: TWO EXTRA QUERIES PER DASHBOARD LOAD, BATCHED

| | |
|---|---|
| Queries added | **2** — one `order_drafts` `.in(visibleKeys)`, one `order_payments` `.in(idempotencyKeys)` |
| Per order? | ❌ **No.** Batched over the same `visibleKeys` the payments query already uses |
| Scaling | 60 orders on the board ⇒ **still 2** |
| Second query skipped when | no draft rows match — a board with no card orders makes **1** |
| Client-side | **Zero.** The answer arrives as a string array and every surface does a `Set.has()` |

### Gates

```
tsc: clean
eslint — 113 errors before, 113 after, across all nine edited files. ZERO NEW.
```

---

## VI. NON-ASCII CENSUS

| File | Before (total / distinct) | After | New class? |
|---|---|---|---|
| `app/api/dashboard/route.ts` | 558 / 9 | 591 / 9 | ✅ none |
| `components/dashboard/OrderCard.tsx` | 1247 / 31 | 1269 / 31 | ✅ none |
| `app/dashboard/[token]/kds/page.tsx` | 847 / 32 | 854 / 32 | ✅ none |
| `app/dashboard/[token]/page.tsx` | 2454 / 53 | 2459 / 53 | ✅ none |
| `lib/printing/ticket.ts` | 487 / 14 | 494 / 14 | ✅ none |
| `lib/printing/mapOrderToTicket.ts` | 240 / 8 | 243 / 8 | ✅ none |
| `lib/email.ts` | 77 / 16 | 81 / 16 | ✅ none |
| `lib/payments/promote-draft.ts` | 438 / 7 | 453 / 7 | ✅ none |
| `app/trucks/[slug]/order/page.tsx` | 2507 / 39 | 2570 / 39 | ✅ none |
| `lib/payments/held-authorisation.ts` | — (new) | 237 / 7 | — |
| `20260814_purge_order_drafts_display_note.sql` | — (new) | — | — |

⚠️ **TWO VIOLATIONS I INTRODUCED AND CORRECTED.** `lib/email.ts` — the tightest file here at 16 classes and no `🔴`, `⚠️` or `⇒` — went to **20**; and the order page went 39 → **40** on a `•`. Caught by my own census, rewritten in each file's existing vocabulary, both back to baseline. **Reported rather than quietly fixed.**

---

## VII. What was NOT touched

| Constraint | Held? |
|---|---|
| `captureOnConfirmation`, `claimOrderDraft`, the authorisation path, the Payment Element, the cron sweep | ✅ **Not opened** |
| `promoteDraft` | ⚠️ **One line, as requirement 3 directs.** See the top |
| The ledger, `getOrderBalance`, the CHECK constraint | ✅ **Not opened** |
| The pay-at-hatch path's behaviour and copy | ✅ **Proved byte-identical in §V(b)** |

## Flagged

- ⚠️ **`mapOrderToTicket` has no runtime caller today** — only `app/dev/ticket-preview`. The ticket change is to the definition; nothing prints it yet. **The renderer and the mapper are correct and ready.**
- ⚠️ **The `heldAuthorisation` prop defaults to `false`**, so any OrderCard rendered without it (the KDS cook view passes it; a future caller might not) degrades to today's display rather than lying.
- ⚠️ **A held order that reaches `Collected` still has an uncaptured hold** if capture failed at confirmation. The button no longer invites collection, which is the fix asked for — but nothing yet prompts an operator to resolve it. `action_audit_log` where `action = 'capture_failed'` is the list.
- ⚠️ **Reports are unchanged.** An uncaptured hold contributes nothing to takings, which is correct, and was out of scope.
