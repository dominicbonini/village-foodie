# The payment step, back inside the order sheet

**Date:** 13 August 2026
**BUILD. One file changed. No migration. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE ANSWER TO YOUR CONSTRAINT: ALL FOUR PROPERTIES SURVIVE, AND HERE IS WHY

**Being a full-screen sibling was never the mechanism that fixed the defect. It was a belt on top of braces.**

The original bug was **not** that the host div lived inside the sheet. It was that the host was a `useRef` — **invisible to a dependency array** — so when the sheet destroyed the div and rebuilt it, the mount effect never re-ran, `payStage` stayed `'ready'`, and the Pay button pointed at a detached Element.

The current design publishes the host node **into state via a callback ref**. That makes the node's identity a real dependency, which means:

> 🔴 **THE SHEET'S CLOSE IS NOW A DEPENDENCY CHANGE.** Detaching the div fires the callback ref with `null`, `paymentBoxEl` changes, and React runs the effect's cleanup — the single teardown. **The sheet cannot destroy the host without tearing down**, because destroying the host *is* what triggers the teardown.

So the step can come back inside the sheet without trading the bug back in. **No STOP needed.**

---

## The four properties, one by one

### 1. `payment` separated from `stageOpen` ✅

```tsx
  const [payment, setPayment] = useState<PendingPayment | null>(null)   // the INTENT
  const [stageOpen, setStageOpen] = useState(false)                     // whether they are LOOKING at it
```

**Unchanged, and location-independent.** Both are top-level page state; neither lives in the sheet's tree. Closing the sheet touches neither.

### 2. The callback ref publishing the host into state ✅

```tsx
  const [paymentBoxEl, setPaymentBoxEl] = useState<HTMLDivElement | null>(null)
```
```tsx
                  <div ref={setPaymentBoxEl} className={elementReady ? '' : 'hidden'} />
```

**Unchanged. `grep -c setPaymentBoxEl` = 3** — the state declaration, the effect dependency, and this one `ref`. **There is exactly one host div in the file.**

### 3. 🔴 THE CLEANUP AS THE SINGLE TEARDOWN NO CLOSE CAN SKIP ✅

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

**Counted, not asserted:** `.mount(` appears once as a call (`:1447`), `.unmount()` once as a call (`:1463`).

🔴 **`paymentBoxEl` IS IN THE DEPENDENCY ARRAY, AND THAT IS WHAT MAKES THE SHEET'S CLOSE SAFE.** Every close route below removes the node from the document; React invokes the callback ref with `null`; the state changes; the cleanup runs. **A close that did not change a dependency would not be a close.**

### 4. The Pay button gated on `elementReady` ✅

```tsx
                    disabled={!elementReady || payStage === 'authorising'}
```
```tsx
        el.on('ready', () => { if (!cancelled) setElementReady(true) })    // set only by Stripe
…
      setElementReady(false)                                              // cleared only by the teardown
```
**And the handler carries the same precondition**, so a keyboard Enter cannot bypass the button:
```tsx
    if (!stripe || !elements || !payment || !elementReady) return
```

---

## What changed

**The payment step now renders inside the sheet, immediately under the sheet's own header, with the review content hidden beneath it:**

```tsx
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-slate-900 text-lg leading-snug">
                  {payingInSheet ? 'Pay by card' : 'Complete your order'}
                </h3>
                {payStage !== 'authorising' && (
                  <button onClick={() => setFormSheetOpen(false)} aria-label="Close" className="…">✕</button>
                )}
              </div>

              {payingInSheet && payment && (
                <div className="mb-2">
                  … Back control · amount · skeleton · host div · error · Pay button …
                </div>
              )}

              <div className={payingInSheet ? 'hidden' : ''}>
                … the entire review: summary, fields, slot picker, notices, Place order, card choice …
              </div>{/* end review, hidden while paying */}
```

**The new derived flag:**
```tsx
  const payingInSheet = formSheetOpen && stageOpen && payment !== null
```

| Requirement | How |
|---|---|
| Inside the sheet, not covering the window | The step is a child of the sheet's content div. The `z-[70]` full-screen overlay is **deleted** |
| Sheet chrome stays | Same header, same ✕, same rounded top, same backdrop — **the title changes and nothing else** |
| Order context visible behind | Unchanged: the sheet is still a bottom sheet over the menu with a `bg-black/40` backdrop |
| **No scrolling to reach the card form** | The step sits **above** the review and the review is `hidden` (`display:none`, zero height). **The card fields are the first thing in the sheet** |
| Back returns to the review, basket intact | `closePaymentStage()` sets `stageOpen(false)`; the review is revealed, not remounted |

⚠️ **THE REVIEW IS HIDDEN, NOT UNMOUNTED, DELIBERATELY.** Every field keeps its value and its focus state, Back is instant, and nothing re-runs. A bare wrapper div is layout-neutral here: the parent is `px-5 pt-5 pb-5` with no flex and no `space-y`.

⚠️ **THE ✕ IS HIDDEN MID-AUTHORISATION**, matching the Back control. It is the only close route that could otherwise fire during `confirmPayment`, leaving the customer on the menu with a hold being placed behind them.

---

## VERIFICATION

### (a) 🔴 EVERY CLOSE ROUTE, AND THAT EACH GOES THROUGH THE ONE TEARDOWN

**Found by grep — these are all of them:**

| # | Route | Line | What it sets | Host detached? | Teardown? |
|---|---|---|---|---|---|
| 1 | **Sheet backdrop click** | `:2570` | `setFormSheetOpen(false)` | ✅ whole sheet unmounts | ✅ ref → null → cleanup |
| 2 | **Sheet ✕** | `:2584` | `setFormSheetOpen(false)` | ✅ | ✅ |
| 3 | **Back to my order** | `:2603` | `closePaymentStage()` → `stageOpen(false)` | ✅ the `payingInSheet &&` block unmounts | ✅ |
| 4 | **Component unmount** (navigate away, successful payment) | — | — | ✅ | ✅ React runs cleanup on unmount |

🔴 **THERE IS NO FIFTH.** `grep -n "setFormSheetOpen(false)\|closePaymentStage()"` returns exactly those three call sites, and route 4 is React's own guarantee.

✅ **AND NONE OF THEM CALLS `unmount()` ITSELF** — the teardown is not something a close has to remember. Routes 1 and 2 do not mention the payment at all, and they still tear down correctly.

**What can be proved from here:** the structure above, the single mount/unmount pair, the dependency array, and that no close route bypasses them. **What needs your hands:** that the Element visibly re-mounts. Steps in (d).

### (b) The Pay button cannot be enabled without a mounted Element

**Proved by construction, quoted in property 4.** `elementReady` has exactly two writers: Stripe's `ready` event and the teardown. **A torn-down Element cannot leave the button enabled, because the same cleanup that unmounts it clears the flag** — and the skeleton reads the identical flag, so what is shown and what is permitted cannot disagree.

### (c) ✅ A CHANGED BASKET STILL CANCELS THE OLD INTENT — exercised against the real route and real Stripe

```
attempt 1 (basket = 1x): 200 draft 72037c28-… pi pi_3U3ekU2fB4PPCw2D0quKYr68
attempt 2 (basket = 2x, supersede sent): 200 draft 6a53fa81-… pi pi_3U3ekV2fB4PPCw2D0sHXLARE

  OLD pi_3U3ekU2fB4PPCw2D0quKYr68 amount 650  -> canceled
  NEW pi_3U3ekV2fB4PPCw2D0sHXLARE amount 1300 -> requires_payment_method
  live intents: 1 pi_3U3ekV2fB4PPCw2D0sHXLARE@1300
  PASS - old cancelled, exactly one live intent at the new amount

CLEANUP: probe orders []  drafts remaining [{"order_key":"a235d4d2-…","customer_name":"Dominic Bonini"}]
```

⚠️ **Writes declared and cleaned:** two drafts and two sandbox intents, all removed; the one remaining draft is yours, from manual testing.

**And reopen for an unchanged basket still makes no server call** — `openCardPayment`'s first branch is three `setState` calls and a `return`, with no `fetch`:
```tsx
    if (payment && payment.fingerprint === basketFingerprint) {
      setPayError(null)
      setPayStage('mounting')
      setStageOpen(true)
      return
    }
```
`createOrderDraft` and `newOrderKey()` have exactly one call site in the repo — `submit/route.ts:751-752` — reachable only through `submitOrder`. **A reopen provably cannot create a draft or an intent.**

### (d) 🔴 WHAT YOU WILL SEE, STEP BY STEP

| Step | What you do | What you should see |
|---|---|---|
| 1 | Build a basket, tap **Review & order** | The sheet slides up. Header: **"Complete your order"** with a **✕**. Summary, fields, slot picker, **Place order**, and the Pay-now-by-card / Pay-at-the-truck choice |
| 2 | Leave **Pay now by card** selected, tap **Place order** | 🔴 **The sheet's content swaps in place.** Header becomes **"Pay by card"**. **"← Back to my order"** on the left, **£18.00** on the right, then three pulsing grey bars and *"Loading secure card form…"*. Button reads **`Preparing…`**, disabled. **The sheet does not grow or move; the menu is still behind it** |
| 3 | Wait ~1s | The skeleton is replaced by Stripe's card fields (and Apple Pay / Google Pay if the device supports them and the domain is registered). Button becomes **`Pay £18.00`**, enabled |
| 4 | 🔴 **Tap the ✕** | The sheet closes. You are on the menu, basket intact |
| 5 | 🔴 **Tap Review & order again** | 🔴 **THE TEST THAT MATTERS.** The sheet reopens **on the card form**, not the review — brief skeleton, then the fields re-render and **`Pay £18.00`** is enabled again. **Stripe Dashboard must still show ONE PaymentIntent for £18.00** |
| 6 | Repeat with the **backdrop** instead of the ✕ | Identical to steps 4-5 |
| 7 | Tap **← Back to my order** | The review returns instantly — same basket, same name, email and slot, nothing re-fetched. **Still one intent** |
| 8 | Add an item, tap **Place order** | New card form at the new total. 🔴 **Stripe shows the old intent `canceled` and exactly one new one at the new amount** — the behaviour proved in (c) |
| 9 | Pay with `4242 4242 4242 4242` | Authorises, lands on the confirmation. The intent goes `requires_capture` |
| 10 | Decline with `4000 0000 0000 0002` | Stripe's own message in a red panel; the Element **stays mounted**; **`Try again · £18.00`** enabled; basket intact |
| 11 | While it says **`Authorising…`** | 🔴 **The ✕ and the Back control are both gone.** Nothing can dismiss the sheet mid-confirm |

⚠️ **Step 5 is the regression test for the original defect.** Before the fix it showed an empty box with a live Pay button; if it ever does again, this is the step that catches it.

### Gates

```
tsc: clean
eslint — order page 18 errors (baseline 18). ZERO NEW.
```

---

## NON-ASCII CENSUS

| File | Before (total / distinct) | After | New class? |
|---|---|---|---|
| `app/trucks/[slug]/order/page.tsx` | 2507 / 39 | 2539 / 39 | ✅ **none** |

✅ **Identical distinct set.** No other file was touched.

---

## What was NOT touched

| Constraint | Held? |
|---|---|
| PaymentIntent creation, `promoteDraft`, `claimOrderDraft`, webhook, cron sweep, refusal behaviour | ✅ **Not opened** |
| `payment_method_types` — Link stays disabled | ✅ **`lib/payments/authorize.ts` untouched** |
| Server-side pricing, the pay-at-hatch path | ✅ **Not opened.** The Place-order button still routes to `handleSubmitClick()` when card is not selected |
| Order card, customer name affordance, dashboard | ✅ **Not opened** |
| Anything else | ✅ **One file** |

## Flagged

- ⚠️ **Closing the sheet mid-payment keeps `stageOpen`, so reopening returns to the card form rather than the review.** Deliberate — they were mid-payment, and the Back control is the top-left of that step. **If you would rather the ✕ dropped them back to the review, that is one line** (`closePaymentStage()` alongside `setFormSheetOpen(false)`).
- ⚠️ **`paying` now requires the sheet to be open**, so the four background behaviours (slots-on-focus, clock tick, menu poll, `fetchSlots`) **resume while the sheet is closed mid-payment**. That is correct — nothing is on screen to be disturbed, and the intent's amount is fixed server-side either way. The one edge: the poll could set `eventEnded` while a hold is outstanding; the sweep cancels it at expiry.
- ⚠️ **Steps 5, 6 and 8 have not been run in a browser.** Everything provable from here is proved; the visible re-mount is not one of those things.
