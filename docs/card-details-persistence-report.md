# Typed card details do not survive an accidental close

READ-ONLY DIAGNOSIS. 13 August 2026.

**No file was changed. No file was created except this one. No `next dev`, no `next build`, no commit, no deploy. No fix is proposed or applied.** Every answer is labelled **QUOTED** (from source, or verbatim from Stripe's documentation) or **INFERRED**. Where the evidence does not reach, it says **not established** rather than guessing.

---

## THE SHORT VERSION

🔴 **The details are inside Stripe's iframe, and every close route destroys the host node, which destroys the iframe.** That is not incidental — it is the mechanism the current design *relies on* to guarantee teardown.

🔴 **Stripe's API does distinguish `unmount()` from `destroy()`**, and documents that an unmounted Element can be re-attached with `mount()`. **The current code discards the Element and the Elements instance on every cleanup**, so that documented path is not available today. **Whether the typed VALUES survive an unmount/re-mount round trip is not stated in any Stripe page I could quote — not established.**

⚠️ **And the diagnosis turned up a second defect on the same line of code.** The backdrop closes the sheet **with no `payStage` guard**, so it can dismiss the sheet *mid-authorisation* — the exact thing the ✕ is gated against, with a comment beside the ✕ asserting it is "the only close route that could otherwise fire during those two seconds". **That assertion is false.**

---

## 1. THE MOUNT EFFECT, ITS DEPENDENCIES AND ITS CLEANUP

**QUOTED — `app/trucks/[slug]/order/page.tsx:1497-1544`:**

```tsx
  useEffect(() => {
    if (!payment?.clientSecret || !paymentBoxEl) return
    let cancelled = false
    let mounted: StripeElement | null = null
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!pk) {
      console.error('[order] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — cannot mount the card form')
    }
    ;(pk ? loadStripeJs() : Promise.reject(new Error('no publishable key')))
      .then(StripeCtor => {
        if (cancelled || !pk) return
        const stripe = StripeCtor(pk, { stripeAccount: payment.stripeAccount })
        const elements = stripe.elements({
          clientSecret: payment.clientSecret,
          appearance: { theme: 'flat', variables: { ... } },
        })
        const el = elements.create('payment', {
          layout: { type: 'accordion', defaultCollapsed: false, radios: true, spacedAccordionItems: false },
          wallets: { applePay: 'auto', googlePay: 'auto' },
        })
        el.mount(paymentBoxEl)                       // ← THE ONE MOUNT
        mounted = el
        el.on('ready', () => { if (!cancelled) setElementReady(true) })
        stripeRef.current = stripe
        elementsRef.current = elements
      })
      .catch(err => { ... setPayError(...); setPayStage('failed') })
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

**Dependency array:** `[payment?.clientSecret, payment?.stripeAccount, paymentBoxEl]`.

🔴 **The cleanup does three things beyond unmounting:** it nulls `stripeRef.current`, nulls `elementsRef.current`, and clears `elementReady`. **`el` itself is dropped with the closure.** So after any teardown there is no Element object, no Elements instance and no Stripe instance left to re-attach anything to — the next mount builds all three from scratch, against the same client secret.

**QUOTED — the design note above it (`:1482-1496`)**, which is the constraint the brief names:

> *"React runs an effect's cleanup before every re-run and once on unmount. Both things that can close this stage change a DEPENDENCY: 1. closing the stage → the overlay unmounts → the callback ref fires with null → `paymentBoxEl` becomes null → cleanup runs … So teardown is not something a close has to REMEMBER to do; it is what React does when the inputs change."*

---

## 2. EVERY ROUTE THAT CLOSES THE SHEET OR THE STAGE

**QUOTED — the host div and its two conditional ancestors:**

```tsx
        {formSheetOpen && (                                      // :2730
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFormSheetOpen(false)} />   // :2732
...
              {payingInSheet && payment && (                      // :2800
...
                  <div ref={setPaymentBoxEl} className={elementReady ? '' : 'hidden'} />   // :2829
```

with `const payingInSheet = formSheetOpen && stageOpen && payment !== null` (`:412`).

| # | Route | Code | Host destroyed? | Gated? |
|---|---|---|---|---|
| 1 | **Backdrop tap** | `:2732` `onClick={() => setFormSheetOpen(false)}` | **YES** — `{formSheetOpen && (` goes false, the whole overlay unmounts | 🔴 **NO GATE AT ALL** |
| 2 | **✕ in the header** | `:2746` `onClick={() => setFormSheetOpen(false)}` | **YES** — same subtree | yes: rendered only when `payStage !== 'authorising'` |
| 3 | **"← Back to my order"** | `:2806` → `closePaymentStage()` (`:1659`) | **YES** — `stageOpen` false ⇒ `payingInSheet` false ⇒ `{payingInSheet && payment && (` goes false | yes: rendered only when `payStage !== 'authorising'` |
| 4 | **A refused promotion** | `:1610-1614` `setPayment(null); setPayStage('idle'); setStageOpen(false)` | **YES**, deliberately — the authorisation has been cancelled at Stripe | n/a |
| 5 | **A successful authorisation** | `window.location.href = …?confirm=…` | **YES** — the whole document is replaced | n/a |

**INFERRED:** there is **no Escape-key handler** (`grep` for `Escape` in the file returns nothing), so routes 1–3 are the whole set of customer-initiated closes.

🔴 **Every route destroys the host.** That is by construction: the host's render is gated on `payingInSheet && payment`, and every close falsifies one of those terms. **The teardown guarantee holds, and the symptom is its direct consequence.**

⚠️ **AND ROUTE 1 IS UNGATED, WHICH THE CODE BESIDE ROUTE 2 DENIES.** QUOTED, `:2740-2744`:

> *"🔴 THE ✕ IS HIDDEN MID-AUTHORISATION, for the same reason the Back control is: dismissing the sheet while confirmPayment is in flight would leave the customer on the menu with a hold being placed behind them. **It is the only close route that could otherwise fire during those two seconds.**"*

**The backdrop has no such guard.** A tap outside the sheet during `payStage === 'authorising'` unmounts the overlay, which tears the Element down while `stripe.confirmPayment` is still awaiting. **INFERRED consequence, not exercised:** the promise resolves against an Element that no longer exists, and the customer is on the menu with an authorisation possibly being placed behind them — the precise outcome the ✕ gate was written to prevent.

---

## 3. WHERE THE TYPED DETAILS LIVE

**QUOTED — Stripe's `element.mount` documentation:**

> *"You need to create a container DOM element to mount an `Element`. Add an empty placeholder `div` to your payment form for each Element that you'll mount. **Stripe inserts an iframe into each `div` to securely collect payment information.**"*

**QUOTED — our div is exactly that empty placeholder** (`:2829`): `<div ref={setPaymentBoxEl} className={elementReady ? '' : 'hidden'} />`.

✅ **CONFIRMED: the card number, expiry, CVC and postcode are inside a cross-origin iframe served by `js.stripe.com`.** Our code cannot read them, cannot write them, and cannot serialise them — that is the PCI property the design exists for, not a limitation to work around. **There is no version of "save what they typed and put it back" that this page can implement.**

**What survives a teardown** (all page-level React state, untouched by the effect): the basket, `name`, `email`, `phone`, `notes`, the slot / ASAP choice, the applied discount code, and **`payment` itself** — `orderKey`, `clientSecret`, `stripeAccount`, `totalPence`, `fingerprint`. **The authorisation is not abandoned by a close** (see §8).

**What does not survive:** the iframe and everything typed into it; `elementReady` (set false in the cleanup); `stripeRef.current`; `elementsRef.current`; and the `el` object itself.

---

## 4. CAN TYPED INPUT BE PRESERVED ACROSS UNMOUNT AND REMOUNT?

**QUOTED — `element.unmount()`** (docs.stripe.com/js/element/other_methods/unmount):

> *"Unmounts the Element from the DOM. **Call `element.mount` to re-attach it to the DOM.**"*

**QUOTED — `element.destroy()`** (docs.stripe.com/js/element/other_methods/destroy):

> *"Removes the Element from the DOM and destroys it. **A destroyed Element can not be re-activated or re-mounted to the DOM.**"*

**QUOTED — `elements.getElement(type)`** (docs.stripe.com/js/elements_object/get_element):

> *"This method looks up a previously created Element by its type."*

**So the API is explicit that `unmount()` is reversible and `destroy()` is not, and that a created Element can be looked back up from its Elements instance.** ✅ **The mechanism for keeping an Element alive across a detach exists and is documented.**

🔴 **BUT WHETHER THE ENTERED VALUES SURVIVE THAT ROUND TRIP IS NOT STATED ON ANY OF THOSE PAGES — NOT ESTABLISHED.** None of the three quotes mentions state, values or input retention. It cannot be settled from the installed packages either: **QUOTED, `:109-114`** —

> *"🔴 STRIPE.JS, LOADED FROM STRIPE'S OWN CDN. NOT AN npm PACKAGE… `@stripe/stripe-js` is a ~2kB loader around exactly this script tag… Neither is in package.json"*

and `ls node_modules/@stripe` returns only `connect-js` and `react-connect-js`. **There are no Stripe.js types or source in the repo to read**, and the page's own type is a three-method hand-written slice:

```ts
type StripeElement = { mount: (el: HTMLElement) => void; unmount: () => void; on: (ev: string, fn: () => void) => void }
```

⚠️ **Settling it needs a browser** — mount, type, unmount, re-mount, look — which needs `next dev`, which this brief forbids. **Not established, and deliberately not inferred: the answer decides whether §5 is worth attempting at all.**

**What IS established:** today the question is moot. The cleanup nulls `elementsRef.current` and drops `el`, so **there is no surviving instance to re-mount** even if re-mounting preserved everything. **Keeping the instance alive is a precondition for any version of this, and the current teardown is written specifically to not keep it.**

---

## 5. COULD THE ELEMENT STAY MOUNTED BUT HIDDEN?

**The precedent is nine lines below it.** QUOTED, `:2854-2860`:

> *"🔴 THE REVIEW, HIDDEN RATHER THAN UNMOUNTED WHILE PAYING. `hidden` is `display:none`, so it takes no space… **while every field keeps its value and its focus state**, and Back is instant."*
> ```tsx
>               <div className={payingInSheet ? 'hidden' : ''}>
> ```

**So the pattern is already in this sheet, doing exactly this job for the review fields.**

**What would have to change, INFERRED:**

1. The host div would have to render whenever `payment !== null`, **not** when `payingInSheet` — i.e. it must leave the `{payingInSheet && payment && (` subtree.
2. It would also have to leave the `{formSheetOpen && (` subtree, **because that whole overlay unmounts on close** — so the host would have to live at page level (outside the sheet), positioned or hidden by class, with the sheet's card area no longer containing it. ⚠️ **That is a structural move of the one node the whole lifecycle hangs on**, not a class change.
3. `payStage`, `elementReady` and the Pay button would be unchanged — they already do not gate the host.

### 🔴 COULD "HIDDEN" BECOME "DETACHED"?

**Yes — that is precisely the risk**, and it is worth being exact about what would and would not prevent it.

**What would NOT prevent it:** discipline, or a comment. Any ancestor that unmounts takes the host with it, and a page-level host has ancestors too (the route, a Suspense boundary, an error boundary, a future conditional wrapper). **A `hidden` class is a promise about CSS, not about the React tree.**

**What WOULD prevent the original bug returning, QUOTED — the callback ref itself:**

```tsx
                  <div ref={setPaymentBoxEl} className={elementReady ? '' : 'hidden'} />
```

with `paymentBoxEl` in the dependency array. **That property is independent of where the div renders.** If the node is detached by *any* route — an ancestor unmounting, a conditional flipping, a future refactor — React invokes the callback ref with `null`, `paymentBoxEl` becomes `null`, the dependency changes, and the cleanup runs. **The guarantee is a consequence of the ref being a callback publishing into state, not of the div's position.** So a move to "hidden" preserves it **provided both of those are kept**: the callback ref, and `paymentBoxEl` as a dependency.

⚠️ **But it introduces a risk the current design does not have, and I cannot rule it out:** whether Stripe supports an Element that is mounted while its container is `display:none`, or whose container becomes hidden after mounting. The quoted mount documentation says nothing about it. **Not established.** Iframes in `display:none` containers are a known source of layout and focus quirks; a Payment Element that renders at zero height on reveal would be a worse defect than the one being fixed.

⚠️ **And a second, quieter cost:** an Element mounted for the whole session against a client secret means a live Stripe iframe on the page while the customer browses the menu. **Not established** whether that has any bearing on the intent's lifetime, on wallet button behaviour, or on the memoised script load.

---

## 6. THE INTERACTION ANGLE

### What closes the payment step today

**QUOTED, and it is the whole list:** the backdrop (`:2732`, ungated), the ✕ (`:2746`, gated on `payStage !== 'authorising'`), and "← Back to my order" (`:2806` → `closePaymentStage()`, rendered only when not authorising). **No Escape handler. No confirmation on any of them.**

### Should the backdrop close it at all?

**INFERRED, and this is a judgement about interaction rather than a fact about code:**

- **On the review step, the backdrop close is right.** Nothing is lost — every field is page-level state and the review is hidden, not unmounted. A stray tap costs one tap to undo.
- **On the payment step it is wrong twice over.** It silently discards work the customer cannot recover *and cannot even be asked about*, because the values are inside an iframe we cannot read. And it is the only close route that can fire **mid-authorisation** (§2), which the code beside the ✕ explicitly believes impossible.

**The relevant asymmetry:** the ✕ and Back are *deliberate* — the customer aimed at a control. The backdrop is *the region you hit when you miss*. Applying the same consequence to both is what produced this report.

### Which is less risky, and which is better for the customer?

| | Interaction change (gate or confirm the backdrop while paying) | Lifecycle change (keep the Element mounted, hidden) |
|---|---|---|
| **Blast radius** | one `onClick` handler | the position of the one node the whole teardown guarantee hangs on |
| **Touches the teardown guarantee?** | **No.** Every close route still destroys the host exactly as today | Yes — the guarantee survives *if* the callback ref and the dependency are kept, and that must be re-argued |
| **Depends on anything unestablished?** | No | **Yes, twice** — §4 (do values survive a re-mount) and §5 (is a hidden-container mount supported) |
| **Fixes the reported symptom?** | Yes, for the accidental case, which is the one reported | Yes, for accidental **and** deliberate closes |
| **What it does not fix** | a customer who taps ✕ or Back on purpose still loses the details | nothing, if it works |

🔴 **The interaction change is markedly less risky, and it also closes the mid-authorisation hole**, which is a money-path defect rather than a convenience one. **The lifecycle change is the only one that preserves details across a deliberate close — and it rests on two things that are not established.**

**INFERRED, offered as a comparison and not as a specification:** the two are not alternatives so much as different sizes of the same answer, and the second is only worth attempting once §4 has been settled in a browser.

---

## 7. AFTER A DECLINE

**CONFIRMED from code. The previous report was right.** QUOTED, `:1573-1582`:

```tsx
      if (result.error) {
        // ⚠️ DECLINED, OR THE DETAILS WERE WRONG. NOT page-replacing: the basket, the slot and the
        // customer's details are all still here, and the Element stays mounted so they can correct the
        // card and press again. Stripe's own message is shown — it is written for customers.
        console.error('[order] authorisation failed:', result.error.code, result.error.message)
        setPayError(result.error.message || 'That payment could not be authorised. …')
        setPayStage('failed')
        return
      }
```

**Why it holds, mechanically:** the branch sets only `payError` and `payStage`. **Neither is in the effect's dependency array**, and **neither gates the host div** — `{payingInSheet && payment && (` reads `formSheetOpen`, `stageOpen` and `payment`, none of which the decline touches. The host is not re-created, the ref does not fire, the cleanup does not run, and the iframe is untouched. The Pay button re-labels itself `Try again · £X.XX` (`:2846`) against the **same** mounted Element.

**QUOTED — the render comment that makes this deliberate rather than lucky** (`:2824-2828`):

> *"Hidden under the skeleton, **never conditionally removed while the step is open — unmounting it on a decline would destroy the card details just typed.**"*

⚠️ **Still not exercised.** Confirming it in a browser needs `next dev`. The claim is now established from three independent places in the code rather than one, but it remains a code reading.

---

## 8. WHAT ELSE IS LOST ON AN ACCIDENTAL CLOSE

**Nothing. Only the card details.** QUOTED, `:2726-2729`:

> *"Opening/closing only toggles `formSheetOpen`; **basket + field values are untouched.**"*

- **Name, email, phone, notes, slot / ASAP, discount code, basket** — all page-level `useState`, none referenced by the effect or its cleanup. The review subtree is `hidden`, not unmounted, so even focus and scroll survive.
- **The authorisation survives too**, deliberately. QUOTED, `:1653-1657`:
  > *"🔴 CLOSING THE STAGE KEEPS THE AUTHORISATION. The customer is going back to look at their order, not abandoning payment. The PaymentIntent is still `requires_payment_method` and still the right amount, so it is kept and re-presented when they return — which is what makes reopen cost no second draft and no second intent."*
- **Reopening re-presents it** — QUOTED, `:1684-1690`: `if (payment && payment.fingerprint === basketFingerprint) { setPayError(null); setPayStage('mounting'); setStageOpen(true); return }` — no fetch, no new draft, no new intent. **A fresh Element is built against the same client secret**, which is exactly why the customer sees an empty but working form rather than an error.

🔴 **So the reported experience is the narrowest possible version of the problem:** everything the customer typed into *our* form is still there; only the fields we are forbidden from touching are blank. **INFERRED — that is also why it reads as a bug rather than as a reset:** the sheet comes back looking identical, with one box emptied.

---

## FLAGS

- **Nothing in the prompt arrived garbled**, and no instruction contradicted another.
- 🔴 **A second defect found on the same line as the first:** the backdrop (`:2732`) has no `payStage` guard and can dismiss the sheet **mid-authorisation**, tearing down the Element while `confirmPayment` is in flight. The comment beside the ✕ asserts that route cannot exist. **It does.**
- ⚠️ **The teardown guarantee is intact and is the cause of the symptom**, not a bug beside it. Any change must keep the callback ref and `paymentBoxEl` in the dependency array; that pairing, not the div's position, is what makes every close route tear down.

## NOT ESTABLISHED

- **Whether typed values survive `unmount()` → `mount()` on the same Element instance.** Stripe documents that the round trip is possible and that `destroy()` is not reversible; it says nothing about entered values. Settling it needs a browser.
- **Whether a Payment Element can be mounted into, or hidden inside, a `display:none` container** without rendering or focus defects.
- **Whether a session-long mounted Element has any bearing** on the PaymentIntent's lifetime or on wallet button behaviour.
- **What actually happens if the backdrop is tapped during `authorising`** — the code path is clear; the outcome at Stripe was not exercised.
