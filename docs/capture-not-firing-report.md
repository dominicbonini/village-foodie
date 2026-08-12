# Why capture did not fire, and why the held state did not show

**Date:** 14 August 2026
**READ-ONLY DIAGNOSIS. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 TWO SYMPTOMS, TWO DIFFERENT CAUSES. THIS IS THE HEADLINE.

They are **not** one failure. Treating them as one would fix the wrong thing.

| | Cause | Would it recur today? |
|---|---|---|
| 🔴 **Capture did not run** | **A CODE DEFECT.** The auto-accept capture call is on the pay-at-hatch path only — **240 lines after the card fork has already returned** — and `promoteDraft`, which actually creates the card order and writes `'confirmed'`, has **no capture call at all** | 🔴 **YES. Every time. It is unreachable for a card order** |
| ⚠️ **Held state did not show, and the email said "pay at the truck"** | **PROBABLY DEPLOY TIMING.** The code is correct and I proved it returns the right answer for order 19 right now. The commit that added it landed **5 minutes 9 seconds** before the order | ⚠️ **Probably not.** Not established without the Vercel deploy log |

**The single decisive measurement:**

```
961ecd8  utc=2026-08-12T20:35:27Z  "payment fix"   ← added capture.ts AND held-authorisation.ts AND the email branch
order 19            20:40:36Z                       ← 5m 09s later
```

⚠️ **AND YOUR OWN EVIDENCE CORROBORATES IT.** You noted `action_audit_log` has no entry after 20:35 — that is the commit timestamp, not a coincidence. **And the email said "pay at the truck", which is the pre-`cardHeld` constant** — the email branch is in that same commit. **Three symptoms of one un-deployed build.**

🔴 **BUT CAPTURE WOULD HAVE FAILED ANYWAY, FULLY DEPLOYED.** §1 and §2.

**The live state, read now:**
```
DRAFT : {"pi":"pi_3U3iwC2fB4PPCw2D0DwOxtVU","promoted_at":"2026-08-12T20:40:21.021+00:00","cancelled":null,"failed":null,"expires":"2026-08-12T21:09:48.474011+00:00"}
ORDER : {"id":"19","status":"confirmed","payment_status":"unpaid","total_minor":650}
LEDGER: []
THE INTENT NOW: status requires_capture  capture_method manual  capturable 650  received 0
```

🔴 **£6.50 IS STILL HELD ON THAT CUSTOMER'S CARD RIGHT NOW.**

---

## 1. Every call site of the capture function

**Source: QUOTED.** An exhaustive grep across `app/` and `lib/` returns **three**:

| # | File : line | Reached by | Would a CARD order created by promoteDraft pass through it? |
|---|---|---|---|
| 1 | `app/api/orders/submit/route.ts:1069` | `POST /api/orders/submit`, after `place_order_atomic` returns, gated on `autoAccepted` | 🔴 **NO — UNREACHABLE.** See §2 |
| 2 | `app/api/dashboard/action/route.ts:229` | `action === 'confirm'` — the operator's Confirm button, and every offline replay of it | ⚠️ **ONLY IF A HUMAN PRESSES CONFIRM.** Order 19 was auto-accepted, so nobody ever did |
| 3 | `app/api/dashboard/action/route.ts:1671` | `adjust_slot_+N` — quick-time-adjust, offered on **pending** orders only | ⚠️ **NO.** Order 19 was already `confirmed`, so the control is not offered |

🔴 **THERE IS NO FOURTH, AND `promoteDraft` IS NOT AMONG THEM:**
```
$ grep -n "captureOnConfirmation" lib/payments/promote-draft.ts
🔴 NOT PRESENT in promote-draft.ts
```

**INFERRED:** an auto-accepted card order passes through **none** of the three. It is confirmed by `promoteDraft` and never touches a capture call.

---

## 2. 🔴 THE SPECIFIC QUESTION: IS SITE 1 ON THE CARD PATH AT ALL?

**Source: QUOTED. NO. SAID PLAINLY: IT IS NOT.**

### The card fork returns at line 820

```ts
      return NextResponse.json({
        requiresAuthorization: true,
        orderKey:      draftKey,
        clientSecret:  auth.clientSecret,
        stripeAccount: auth.stripeAccount,
        total:         serverTotal,
      })
    }

    // ── Atomic stock guard + slot placement under ONE per-event lock (Stage 2, Option B) ──
```

### And the line numbers settle it

```
 821:        requiresAuthorization: true,          ← the card path RETURNS here
1031:      const { data: rpcData, error: rpcErr } = await supabase.rpc('place_order_atomic', { …
1069:      await captureOnConfirmation(supabase, {
```

🔴 **THE CAPTURE CALL IS 248 LINES BELOW A `return`.** A card order exits the handler at 826 and never reaches 1031 or 1069. **Site 1 is on the pay-at-hatch path exclusively.**

### And the comment I wrote at that site is factually wrong

```ts
    // ── 🔴 CAPTURE SITE 1 of 3: AUTO-ACCEPT. ──────────────────────────────────────────────────────
    // Auto-accept writes 'confirmed' in the SAME INSERT as the order, inside place_order_atomic, so
    // there is no separate confirmation write to hook. Capture therefore fires inline, immediately
    // after the RPC returns and outside the event lock.
```

⚠️ **THAT IS TRUE OF A PAY-AT-HATCH ORDER AND FALSE OF A CARD ORDER.** A card order's auto-accept is decided and written by `promoteDraft`, not by `place_order_atomic` — so "the same INSERT as the order" names the wrong insert. **The reasoning was sound for the path I was looking at and I did not notice there were two.**

### Where promoteDraft writes the order, and its status

`lib/payments/promote-draft.ts:268-299`:

```ts
      const { data: inserted, error: insertErr } = await supabase
        .from('orders')
        .insert({
          order_key:      draft.order_key,
          id:             orderId,
          …
          status:         autoAccepted ? 'confirmed' : 'pending',
          payment_status: 'unpaid',
```

🔴 **`status: autoAccepted ? 'confirmed' : 'pending'` — THE CONFIRMATION HAPPENS HERE**, in a file with no capture call. That is the whole defect.

---

## 3. What promoteDraft does after the order row exists

**Source: QUOTED.** In order, from `lib/payments/promote-draft.ts`:

| Step | Line | What |
|---|---|---|
| 6 | 268-299 | 🔴 **The INSERT** — `status: autoAccepted ? 'confirmed' : 'pending'`, `payment_status: 'unpaid'` |
| 7a | 318 | `await erasePii(supabase, draft.order_key)` |
| 7b | 320-329 | `rebuildProductionSlotUsage` — capacity, in a try/catch, "REPORTED, NOT ROLLED BACK" |
| — | 331-333 | `finally { await releaseEventLock(...) }` |
| 8 | 336-340 | `enforceStockLimits`, best-effort |
| 9 | 350-395 | 🔴 **The customer confirmation email** — `formatConfirmationEmail`, including `cardHeld` |
| — | 397-418 | The truck's "new order" email |
| — | 421 | `return { status: 'promoted', orderKey, orderId, truckSlug, confirmedSlot }` |

🔴 **THERE IS NO CAPTURE STEP ANYWHERE IN THAT LIST.** Between the insert that writes `'confirmed'` and the return, the function erases PII, rebuilds capacity, releases a lock, enforces stock and sends two emails — and never touches the authorisation it just promoted.

⚠️ **The file's own header explains why `payment_status` stays `'unpaid'`** — *"NOTHING HAS BEEN CAPTURED. The money is held, not taken"* — which was correct when written, because capture was a later phase. **Capture arrived and this file was never revisited.**

---

## 4. The held-authorisation lookup — and it works

**Source: QUOTED**, `lib/payments/held-authorisation.ts`:

```ts
  const { data: drafts, error } = await supabase
    .from('order_drafts')
    .select('order_key, payment_intent_id')
    .in('order_key', orderKeys)
    .not('payment_intent_id', 'is', null)
    .not('promoted_at', 'is', null)
    .is('authorization_cancelled_at', null)
```
then excludes any whose `stripe_pi:<id>` row already exists in `order_payments`.

### 🔴 RUN READ-ONLY AGAINST ORDER 19, JUST NOW

```
🔴 readHeldAuthorisations([order 19]) -> ["a06c2090-99bd-40da-9f3c-10c5779b964f"]
```

✅ **IT RETURNS THE ORDER. THE RESOLVER IS CORRECT AND THE DATA SATISFIES IT** — `payment_intent_id` set, `promoted_at` set, `authorization_cancelled_at` null, ledger empty.

### Every consumer, and all of them are wired in HEAD

| Surface | Evidence |
|---|---|
| `/api/dashboard` | `git show HEAD:app/api/dashboard/route.ts \| grep -c heldAuthorisations` → **3** |
| Dashboard page | `:216` state, `:767` `if(data.heldAuthorisations !== undefined) setHeldAuthorisations(...)`, and `heldAuthorisation={heldAuthorisations.has(o.order_key)}` on **both** the pending and confirmed grids (`:3083`, `:3089`) |
| KDS | `grep -c heldAuthorisation` → **5** |
| `OrderCard` | `grep -c heldAuthorisation` → **7** |

🔴 **SO THE DISPLAY CODE IS CORRECT, DEPLOYED IN HEAD, AND WOULD SHOW `CARD HELD` FOR ORDER 19 IF LOADED NOW.**

⚠️ **WHY IT DID NOT AT 20:40 IS NOT ESTABLISHED FROM HERE.** The commit landed 5m 09s earlier; a Next.js build of this size plausibly takes longer than that, but **I have no Vercel deploy log and will not assert it.** The alternative — a dashboard tab open from before the deploy — is equally consistent.

---

## 5. The confirmation email for order 19

**Source: QUOTED.** `lib/payments/promote-draft.ts`, in the `formatConfirmationEmail` call:

```ts
          cardHeld:     !!draft.payment_intent_id,
```

**For order 19 that evaluates to `true`** — `payment_intent_id` is `pi_3U3iwC2fB4PPCw2D0DwOxtVU`, read live above. The value comes from **the draft row `promoteDraft` is already holding**, not from a query.

**So the email SHOULD have read:**
> Your card is held, not charged. Test Kitchen takes the payment when they confirm your order — nothing to pay at the truck.

**It read "pay at the truck on collection", which is the pre-change hardcoded constant.**

🔴 **THIS IS THE STRONGEST EVIDENCE FOR THE DEPLOY-TIMING EXPLANATION**, and it is independent of the dashboard. `git log -S"cardHeld" -- lib/email.ts` and `-- lib/payments/promote-draft.ts` both return **`961ecd8 … 20:35:27Z`** — the same commit as capture and held-authorisation. **A running build that had this code could not have sent that sentence.**

⚠️ **NOT ESTABLISHED** beyond that: I cannot see which build served the 20:40 request.

---

## 6. Do the dashboard's two batched queries include order 19?

**Source: QUOTED.** Both are keyed on the same list:

```ts
    const visibleKeys = [...activeOrders, ...doneToday].map(o => o.order_key).filter(Boolean)
    if (visibleKeys.length) {
```

✅ **YES, order 19 would be in `visibleKeys`.** It is `status: 'confirmed'` — neither collected, rejected nor cancelled — and its `event_id` is `a79a8313-…`, the event the board was on. `activeOrders` is event-scoped and confirmed orders are active.

### Does pending vs confirmed change what they return? ❌ **NO.**

- **`visibleKeys`** is `activeOrders + doneToday` and does not filter on pending vs confirmed — both are active.
- **`readHeldAuthorisations`** queries `order_drafts` and `order_payments` **only**. Neither table has an order status. **The predicate cannot see whether the order is pending or confirmed**, so the answer is identical either way.

⚠️ **That is the intended design** — a *pending* card order is exactly the case the held display was built for, since the window there is minutes to hours.

---

## 7. 🔴 WHAT HAPPENS TO `pi_3U3iwC2fB4PPCw2D0DwOxtVU` NOW

**Source: QUOTED. IT IS STILL HELD, AND NOTHING IN THIS SYSTEM WILL EVER CANCEL IT.**

```
THE INTENT NOW: status requires_capture  capture_method manual  capturable 650  received 0
```

**The sweep's predicate, `lib/payments/order-drafts.ts:459-467`:**

```ts
  const { data, error } = await supabase
    .from('order_drafts')
    .select('order_key, truck_id, payment_intent_id, expires_at, promotion_failed_at, total_minor')
    .not('payment_intent_id', 'is', null)
    .is('promoted_at', null)
    .is('authorization_cancelled_at', null)
    .lt('expires_at', new Date().toISOString())
```

🔴 **`.is('promoted_at', null)` — AND ORDER 19'S DRAFT HAS `promoted_at: 2026-08-12T20:40:21.021Z`.** The sweep looks for **abandoned** authorisations; this one was promoted, so it is invisible to the job whose purpose is releasing money.

⚠️ **AND THE PURGE CANNOT TOUCH IT EITHER**, for the same reason and by explicit design — `20260814_purge_order_drafts_display_note.sql` now states that `promoted_at is null` is load-bearing for display.

### So the answer

| | |
|---|---|
| Still held? | 🔴 **YES. £6.50, `requires_capture`, right now** |
| Does the cron sweep cancel it? | 🔴 **NO. It cannot see it** — `promoted_at` is not null |
| What ends it? | ⚠️ **Stripe's own expiry, about seven days from 2026-08-12T20:39:48Z — roughly 19 August.** The hold then drops off the customer's card and the money is never taken |
| Does anything record it? | 🔴 **NO.** No ledger row, no `capture_failed` audit row (capture never ran, so nothing recorded a failure), and `promotion_failed_at` is null because promotion **succeeded** |

🔴 **THE GAP THIS EXPOSES: A PROMOTED-BUT-UNCAPTURED DRAFT IS INVISIBLE TO EVERY SAFETY NET.** The sweep skips it as promoted, the purge skips it as promoted, and the audit log has nothing because no capture was attempted. **The only trace is the draft row itself and the Stripe Dashboard.**

⚠️ **Order 18 (12 August, £6.00) is in the same state** — same shape, same cause.

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — the exhaustive grep and all three sites. The "reached by" column is **INFERRED** from each handler's guard |
| 2 | **QUOTED** — the `return` at 820-826, the line numbers, and `promoteDraft`'s insert. "Not on the path" is **QUOTED** by line arithmetic, not inferred |
| 3 | **QUOTED** — every step with its line |
| 4 | **QUOTED** — the resolver, all four consumers in HEAD, and the live result. The 20:40 explanation is explicitly **not established** |
| 5 | **QUOTED** — the `cardHeld` line, the live `payment_intent_id`, and the `git log -S` provenance. `true` is **INFERRED** from those two |
| 6 | **QUOTED** — `visibleKeys` and the resolver's tables. "Status makes no difference" is **QUOTED** (no status column is queried) |
| 7 | **QUOTED** — the sweep predicate, the draft's `promoted_at`, and the live intent status. The ~7-day expiry is **INFERRED** from Stripe's documented behaviour |

## Not established

- 🔴 **Whether the 20:40 request was served by the pre- or post-`961ecd8` build.** The 5m 09s gap and three independent symptoms (no held chip, no `cardHeld` email, no audit row) all point one way, but the Vercel deploy log is the only thing that would settle it. **Capture's failure does not depend on the answer.**
- **Whether the redirect route also ran** for this order. It writes no row.
- **Whether any other order is in this state.** Only 18 and 19 were inspected; the query that would list them is `order_drafts` where `promoted_at is not null and authorization_cancelled_at is null` minus those with a `stripe_pi:` ledger row — the same predicate `readHeldAuthorisations` uses, unbounded by order key.
- **What should happen to the two outstanding holds.** They can be captured or cancelled at Stripe by hand; nothing here does either.
