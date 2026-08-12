# The payment stage — reopen fixed, one mount, one live authorisation

**Date:** 13 August 2026
**BUILD. Two files changed. No migration needed and none written. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE ONE IDEA THAT FIXES ALL SIX REQUIREMENTS

**The authorisation and the view of it were one flag. They are now two.**

```tsx
  const [payment, setPayment] = useState<PendingPayment | null>(null)   // the INTENT — costs money to replace
  const [stageOpen, setStageOpen] = useState(false)                     // whether they are LOOKING at it
```

Closing the stage clears `stageOpen` and keeps `payment`. That single split is why reopen no longer costs a draft or an intent, why the teardown can be unconditional, and why the Pay button can be gated on a fact about the DOM instead of a stage name.

---

## 1. The full-screen stage

**Structure:** a `fixed inset-0 z-[70] bg-white flex flex-col` overlay, rendered as a **SIBLING of the order sheet, not a child** — three-part: a fixed header with the Back control, a scrolling middle holding the Element, and a fixed footer holding the Pay button above the safe-area inset.

🔴 **BEING A SIBLING IS THE STRUCTURAL FIX, NOT A LAYOUT PREFERENCE.** It used to live inside `{formSheetOpen && (…)}`, so the sheet's ✕ and backdrop destroyed the Element's host div while the authorisation state survived. **A sibling cannot be destroyed by closing the sheet.**

```tsx
        {stageOpen && payment && (
        <div className="fixed inset-0 z-[70] bg-white flex flex-col">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
            {payStage !== 'authorising' ? (
              <button onClick={e => { e.preventDefault(); closePaymentStage() }}
                className="text-slate-500 hover:text-slate-800 text-sm font-bold flex items-center gap-1.5 -ml-1 px-1 py-1">
                ← Back to my order
              </button>
            ) : <span className="text-sm font-bold text-slate-400">Authorising…</span>}
          </div>
```

| Decision | Why |
|---|---|
| `z-[70]` | Above the sheet's `z-[60]` and the footer's `z-50`, so nothing shows through and no control behind is reachable mid-payment |
| **No backdrop-click close** | ⚠️ Deliberate. This is a step, not a popover; a stray tap beside a card form must not dismiss it. **The Back control is the only way out** |
| Back hidden while `authorising` | Leaving mid-confirm would drop them on the order form with a hold being placed behind them |
| Footer is `flex-shrink-0` with `env(safe-area-inset-bottom)` | The Pay button is always on screen — no scrolling past the order to find it, which was the complaint |

✅ **The basket is intact on return.** `closePaymentStage` touches `stageOpen`, `payStage` and `payError` — never the basket, the fields or the slot.

---

## 2. 🔴 ONE MOUNT, ONE TEARDOWN — AND HOW A THIRD PATH IS RULED OUT

**Counted, not asserted: `grep -c` in the order page gives `.mount(` = 2 and `.unmount()` = 2 — each is one comment plus one call.**

**THE MOUNT:**
```tsx
        el.mount(paymentBoxEl)                       // ← THE ONE MOUNT
```

**THE TEARDOWN:**
```tsx
    return () => {
      cancelled = true
      // ← THE ONE TEARDOWN. Guarded because a load that never resolved has nothing to unmount, and
      // wrapped because Stripe throws if the node has already gone — which must not break a cleanup.
      try { mounted?.unmount() } catch { /* already detached — nothing to undo */ }
      mounted = null
      stripeRef.current = null
      elementsRef.current = null
      setElementReady(false)
    }
  }, [payment?.clientSecret, payment?.stripeAccount, paymentBoxEl])
```

### 🔴 THE GUARANTEE, AND IT IS NOT DISCIPLINE

```
  // 🔴 HOW A THIRD PATH IS RULED OUT, AND IT IS NOT DISCIPLINE. React runs an effect's cleanup before
  // every re-run and once on unmount. Both things that can close this stage change a DEPENDENCY:
  //   1. closing the stage      → the overlay unmounts → the callback ref fires with null
  //                              → `paymentBoxEl` becomes null → cleanup runs
  //   2. replacing the payment  → `payment.clientSecret` changes → cleanup runs, then the new mount
  // So teardown is not something a close has to REMEMBER to do; it is what React does when the inputs
  // change. A future close that forgets to call anything still tears down, because to close at all it
  // must remove the node or clear the payment. THAT is the guarantee — no reachable close can skip it.
```

**The old design failed precisely because teardown was a thing a close had to remember.** There were two closes; only one remembered. Now teardown is a consequence of the dependency changing, and **any** close must change one of those dependencies to be a close at all.

⚠️ **`closePaymentStage` deliberately does NOT touch the Element:**
```tsx
  const closePaymentStage = () => { setStageOpen(false); setPayStage('idle'); setPayError(null) }
```
*"Closing the stage unmounts the overlay, which detaches the host node, which fires the ONE teardown. Doing it here as well would be a second path."*

---

## 3. Reopen — how the mount re-runs on a recreated node

🔴 **THE HOST NODE IS STATE, NOT A REF. THAT IS THE FIX.**

```tsx
  const [paymentBoxEl, setPaymentBoxEl] = useState<HTMLDivElement | null>(null)
```
```tsx
              <div ref={setPaymentBoxEl} className={elementReady ? '' : 'hidden'} />
```

**A `useRef` is invisible to a dependency array.** When the stage closed and reopened, React created a brand-new div and quietly repointed the ref; the effect — keyed on the client secret, which had not changed — never re-ran. **A callback ref writing to state makes the node's identity a real dependency**, so a new div is a new value and the effect re-runs. Setting it to `null` on detach is what fires the teardown.

### And the reopen makes no server call at all

```tsx
  const openCardPayment = () => {
    // 🔴 SAME BASKET, LIVE AUTHORISATION ⇒ JUST SHOW IT AGAIN. No fetch, no draft, no intent. The
    // client secret is still held, the Element re-mounts against it, and the customer pays.
    if (payment && payment.fingerprint === basketFingerprint) {
      setPayError(null)
      setPayStage('mounting')
      setStageOpen(true)
      return
    }
    void submitOrder({})
  }
```

✅ **Three `setState` calls and a `return`. No `fetch`.** And `createOrderDraft`/`newOrderKey()` have exactly **one** call site in the whole repo — `app/api/orders/submit/route.ts:751-752` — reachable only through `submitOrder`. **So a reopen provably cannot create a draft or an intent.**

---

## 4. 🔴 THE PAY BUTTON'S CONDITION

```tsx
                disabled={!elementReady || payStage === 'authorising'}
```

**`elementReady` is set by Stripe's own `ready` event and cleared by the single teardown:**
```tsx
        el.on('ready', () => { if (!cancelled) setElementReady(true) })
…
      setElementReady(false)      // in the cleanup
```

🔴 **IT DESCRIBES THE DOM, NOT THE FLOW.** The old gate was `payStage !== 'ready' && payStage !== 'failed'` — and `payStage` is about where the customer is in the process, which happily said `'ready'` over a detached Element. **A torn-down Element cannot leave this enabled, because the same cleanup that unmounts it clears the flag.**

⚠️ **AND THE HANDLER CARRIES THE SAME PRECONDITION**, so a keyboard Enter or a tap landing between renders cannot bypass the button:
```tsx
    if (!stripe || !elements || !payment || !elementReady) return
```

⚠️ The skeleton is driven by the same flag (`{!elementReady && …}`), so what the customer sees and what the button permits **cannot disagree**.

---

## 5. Changed basket — how the change is detected

```tsx
  const basketFingerprint = useMemo(() => JSON.stringify({
    i: basket.map(b => [b.menuItem.name, b.quantity, (b.modifiers || []).map(m => m.name).sort(), b.specialInstructions || '']),
    d: appliedDeals.map(d => [d.bundle.name, d.slots, d.slotModifiers, d.slotNotes]),
    s: asapChosen ? null : (selectedSlot || null),
    c: appliedCode?.code || null,
    t: Math.round(total * 100),
    e: event?.id ?? null,
  }), [basket, appliedDeals, asapChosen, selectedSlot, appliedCode, total, event?.id])
```

🔴 **NOT THE TOTAL ALONE.** Two different baskets can come to the same money — swap a £6.50 item for another £6.50 item and the price is identical while the order is not, **and the draft carries the LINES, not just the sum**. So the fingerprint is the composition: every line with its modifiers and quantity, every deal, the slot, the discount code, the event and the total.

It is stamped onto the authorisation when it is created:
```tsx
          fingerprint:   basketFingerprint,
```
and compared on reopen. **Different ⇒ `submitOrder` runs, carrying the superseded key.**

---

## 6. 🔴 THE GUARD: ONE LIVE AUTHORISATION PER BASKET

**Client — the held key rides along:**
```tsx
          supersedeOrderKey: payment?.orderKey ?? null,
```

**Server — `app/api/orders/submit/route.ts`, the first thing in the card fork:**

```ts
      if (typeof supersedeOrderKey === 'string' && supersedeOrderKey) {
        const prior = await getOrderDraft(supabase, supersedeOrderKey)
        if (prior && prior.payment_intent_id && !prior.promoted_at && !prior.authorization_cancelled_at) {
          const account = await stripeAccountForTruck(supabase, prior.truck_id)
          const cancelled = account
            ? await cancelAuthorization({ paymentIntentId: prior.payment_intent_id, stripeAccountId: account })
            : { ok: false, detail: 'no stripe account for the truck' }
          if (!cancelled.ok) {
            console.error(
              `[submit] 🔴 REFUSED to authorise: could not cancel the superseded intent ` +
              `pi=${prior.payment_intent_id} draft=${supersedeOrderKey} (${cancelled.detail}). NO second ` +
              `intent was created — two live holds for one basket is the one outcome this must never produce.`,
            )
            return NextResponse.json(
              { error: CARD_UNAVAILABLE_MESSAGE, cardUnavailable: true },
              { status: 503 },
            )
          }
          await markAuthorizationCancelled(supabase, supersedeOrderKey)
```

🔴 **CANCEL FIRST, AND REFUSE IF THE CANCEL FAILS.** Creating the replacement first would open exactly the window this closes. A failed cancel is a **503**, not a "carry on" — the customer gets the card-unavailable message, their basket is intact, and the sweep releases the old hold at expiry.

**Why it matters, in the code's own words:** *"the double-promotion guards are all per-DRAFT, so if both were ever authorised BOTH would promote and the customer would get two orders."*

⚠️ **Skipped silently when the prior draft is already promoted, already cancelled, or gone** — all three mean there is nothing live to supersede.

---

## V. VERIFICATION

⚠️ **WRITES DECLARED:** probe drafts, three Stripe intents (sandbox) and one order. **All cleaned; residue proved below.** (b)–(d) ran against the **real route handler**, imported and called directly — no dev server.

### (a) Open card → close → reopen

🔴 **THE CLIENT HALF CANNOT BE REACHED BY A SCRIPT** — it is React lifecycle and a Stripe iframe. What **is** proved statically, and is the whole substance of "no second draft, no second intent":

```
=== every place a draft can be created ===
app/api/orders/submit/route.ts:751:      const draftKey = newOrderKey()
app/api/orders/submit/route.ts:752:      const created = await createOrderDraft(supabase, {

=== mount / unmount call counts in the page ===
2   (one comment + one call)
2   (one comment + one call)
```

✅ **`openCardPayment`'s reopen branch contains no `fetch`** (quoted in full, §3), and drafts have exactly one creation site reachable only via `submitOrder`. **A reopen therefore cannot produce either.**

### 🔴 WHAT MUST BE TESTED BY HAND, AND HOW

| # | Steps | Expected |
|---|---|---|
| 1 | Build a basket → Pay now by card → Place order. Wait for the card fields. Press **← Back to my order**. Press **Place order** again. | The stage reopens and the card fields **render**. The Pay button reads `Pay £X` and is **enabled**. Stripe Dashboard shows **ONE** intent for that amount |
| 2 | Same, but check `order_drafts` between the two opens | **One row.** `select count(*) from order_drafts where customer_name = '<your name>'` unchanged across the reopen |
| 3 | Reopen and pay with `4242 4242 4242 4242` | Authorises; lands on `?confirm=`; the intent goes `requires_capture` |
| 4 | Open the card stage, then **close the ORDER SHEET behind it** if reachable | The stage is above the sheet at `z-[70]`; the sheet's controls are not reachable while it is open |
| 5 | Open card → Back → add an item → Place order | §V(b) below, observed in the browser |
| 6 | Decline with `4000 0000 0000 0002` | Stripe's own message; the Element **stays mounted**; `Try again · £X` is enabled; the basket is intact |

### (b) 🔴 CHANGED BASKET — old cancelled, one new intent, amount matches

```
══ (b) basket CHANGED between attempts ══
  attempt 1: status 200  orderKey df44c45c-c003-4180-973b-334b959a93cb
    intent pi_3U3e1X2fB4PPCw2D1dkIy2hs amount 650 status requires_payment_method
  attempt 2 (basket doubled, supersede sent): status 200  orderKey 00d9b58d-a4e4-4983-b150-bbc5088f913f

    OLD intent pi_3U3e1X2fB4PPCw2D1dkIy2hs amount 650 -> status canceled
    NEW intent pi_3U3e1Z2fB4PPCw2D0MZbwuBy amount 1300 -> status requires_payment_method
    old draft authorization_cancelled_at: "2026-08-12T15:25:00.816+00:00"
    LIVE intents for this basket: 1 pi_3U3e1Z2fB4PPCw2D0MZbwuBy@1300
  PASS - old cancelled at Stripe, ONE live intent, amount 1300 matches the doubled basket
```

✅ **Cancelled at Stripe** (`status: canceled`, read back from the API), ✅ **the draft is marked**, ✅ **the new amount is 1300 for the doubled basket**, ✅ **exactly one live intent.**

### (c) Drafts and intents per basket, every path

```
  probe drafts: 2
    df44c45c-… £6.50  pi=pi_3U3e1X…  cancelled=2026-08-12T15:25:00.816+00:00
    00d9b58d-… £13.00 pi=pi_3U3e1Z…  cancelled=null
  UNCANCELLED intents across all probe drafts: 1 pi_3U3e1Z2fB4PPCw2D0MZbwuBy@1300
  PASS - exactly one live authorisation survives
```

✅ **Each intent's status was read back from Stripe individually, not inferred from our own column.** Two drafts exist as history; **one authorisation is live.**

**The three paths, and why only one intent can be live on each:**

| Path | Draft | Intent |
|---|---|---|
| First card attempt | 1 new | 1 new |
| Reopen, unchanged basket | 🔴 **0** — no server call | 🔴 **0** |
| Reopen, changed basket | 1 new | 1 new, **and the old one cancelled first, or the request is refused** |

### (d) Pay-at-hatch unchanged

```
  status 200 {"success":true,"orderId":"2","orderKey":"983efd2e-575f-4f74-bbfd-94fbf8b25f0d","slot":"12:00","total":6.5}
  the row: {"status":"confirmed","payment_status":"unpaid","total":6.5,"total_minor":650}
  PASS - created directly, unpaid, as before
```

✅ **No `payByCard` ⇒ the fork is not entered.** The button routes to `handleSubmitClick()` untouched:
```tsx
              <button onClick={e => { e.preventDefault(); if (payByCard && truck?.card_payments_ready) openCardPayment(); else handleSubmitClick() }}
```
✅ **The Pay-at-the-truck option is still offered on every truck**, exactly as before.

### Residue and gates

```
CLEANUP: probe orders []  drafts remaining [ccbe0291-… "Dom", 748a98f6-… "Dom", 7da41794-… "Dom"]
```
✅ **Every probe row and probe intent removed.** ⚠️ The three remaining drafts are **yours**, from manual testing (`customer_name: "Dom"`) — not residue from this run. Two of them are the pair from the diagnosis; all have no authorisation left to worry about once the sweep runs.

```
tsc: clean
eslint — order page 18 (baseline 18), submit 23 (baseline 23). ZERO NEW.
```

---

## VI. NON-ASCII CENSUS

| File | Before (total / distinct) | After | New class? |
|---|---|---|---|
| `app/trucks/[slug]/order/page.tsx` | 2343 / 39 | 2507 / 39 | ✅ **none** |
| `app/api/orders/submit/route.ts` | 1351 / 19 | 1377 / 19 | ✅ **none** |

⚠️ **ONE VIOLATION I INTRODUCED AND CORRECTED.** My comments took the order page to **41** distinct by adding `•` (U+2022) and `✅` (U+2705). Caught by my own census, rewritten to `1.`/`2.` and `🔴`, back to 39. **Reported rather than quietly fixed.**

⚠️ `lib/payments/authorize.ts` also shows as modified in `git status` — that is **last turn's `payment_method_types: ['card']` change**, not this one. Untouched here.

---

## VII. What was NOT touched

| Constraint | Held? |
|---|---|
| `promoteDraft`, `claimOrderDraft`, the webhook, the cron sweep | ✅ **Not opened** |
| The fall-through refusal behaviour | ✅ Unchanged — every card failure still returns 503 and creates no order |
| Server-side pricing | ✅ **Not opened** |
| Pay-at-hatch, on all trucks | ✅ **Proved in §V(d)**, and still offered everywhere |
| Anything else | ✅ Two files |

🔴 **NO MIGRATION IS NEEDED.** `supersedeOrderKey` is a request field; `authorization_cancelled_at`, `promotion_failed_at` and `promotion_failure_reason` already exist from `20260813_order_drafts_authorization.sql`. Nothing schema-shaped changed.

## Flagged, and deliberately not fixed

- ⚠️ **A held authorisation is not cancelled if the customer switches to Pay at the truck.** They open the card stage, go Back, pick Pay at the truck, and place the order — the intent lingers until the sweep cancels it at expiry. **Fixing it means adding a cancel step to the pay-at-hatch path, which you told me not to change.** No money is at risk: the intent is `requires_payment_method`, so nothing is held, and the sweep covers it.
- ⚠️ **The fingerprint compares client-side values.** A menu price change between authorising and reopening would not move it — but server-side pricing already refuses a stale basket at promotion, and the amount on the intent came from the server.
- ⚠️ **Requirement (a) is proved statically, not exercised.** The six hand-tests in §V(a) are what remains, and test 1 is the one that would have caught the original defect.
