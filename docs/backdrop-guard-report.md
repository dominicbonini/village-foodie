# The backdrop stops closing the payment step

BUILD. 13 August 2026.

**No `next dev`, no `next build`, no commit, no deploy. No migration.**

**One file changed this turn, and one line of behaviour in it:**

```
app/trucks/[slug]/order/page.tsx   — the sheet backdrop's onClick, plus two comment blocks
```

*(`git diff --stat` also lists `lib/payments/promote-draft.ts`, `app/api/payments/return/route.ts` and `docs/reference-manual.md` — those are the previous turns' work, still uncommitted. This turn touched neither.)*

`npx tsc --noEmit` exits 0.

🔴 **THE GUARANTEE IS UNTOUCHED.** The mount effect, its dependency array, its cleanup and the callback ref do not appear in this diff at all:

```
$ git diff app/trucks/[slug]/order/page.tsx | grep -E "^[+-].*(paymentBoxEl|elementsRef|stripeRef|mounted\?|useEffect|setElementReady)"
(no output)
```

---

## FIX 1 — THE MID-AUTHORISATION GAP

### Both guards, quoted as they now stand

**The backdrop** (`:2755-2756`):

```tsx
          <div className="absolute inset-0 bg-black/40"
            onClick={() => { if (!payingInSheet) setFormSheetOpen(false) }} />
```

**The ✕** (`:2776-2778`), unchanged:

```tsx
                {payStage !== 'authorising' && (
                  <button onClick={() => setFormSheetOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
                )}
```

### Do they agree? On the case that matters, yes — and the backdrop is stricter beyond it

**QUOTED — the predicate** (`:412`): `const payingInSheet = formSheetOpen && stageOpen && payment !== null`.

**QUOTED — where `authorising` is set** (`confirmCardPayment`, `:1552-1553`):

```tsx
    if (!stripe || !elements || !payment || !elementReady) return
    setPayStage('authorising')
```

**PROVED by construction:** `payStage === 'authorising'` can only be reached from a click on the Pay button, which renders **inside** `{payingInSheet && payment && (`, and the branch returns early unless `payment` is non-null. So **`authorising` implies `payingInSheet`**, and therefore `!payingInSheet` implies `payStage !== 'authorising'`.

| State | Backdrop closes? | ✕ closes? |
|---|---|---|
| Review step (`payingInSheet` false) | **yes** — unchanged behaviour | yes |
| Payment step, idle / ready / failed | **no** — FIX 2 | yes |
| **Payment step, `authorising`** | **NO** | **NO** — they agree |

🔴 **On the mid-authorisation case the two guards now agree: neither route can dismiss the sheet while `confirmPayment` is in flight.** The backdrop is deliberately stricter outside that window, which is FIX 2 layered on top — not a disagreement, and stated in both comments so a future reader is not left to reconcile them.

### The comment that asserted this route could not exist

**Was** (`:2740-2744`):

> *"🔴 THE ✕ IS HIDDEN MID-AUTHORISATION … **It is the only close route that could otherwise fire during those two seconds.**"*

**Now:**

> *"🔴 CORRECTION. This comment used to end "It is the only close route that could otherwise fire during those two seconds." That was TRUE of the ✕ and FALSE as a statement about the sheet: the BACKDROP above had no guard of any kind and could fire throughout. It is guarded now — and more tightly than this control, because it also refuses on the payment step when nothing is being authorised."*

⚠️ **The ✕ keeps the looser guard on purpose**, and the comment now says why: it is one of only two ways out of the payment step, and gating it as tightly as the backdrop would leave a customer with the Back control alone.

---

## FIX 2 — CHOSEN: (a), THE BACKDROP DOES NOT CLOSE THE PAYMENT STEP

### Why, in terms of what a customer on a phone actually does

**The backdrop is not a control. It is the region you hit when you miss one.** On a phone the sheet is anchored to the bottom and the backdrop is the strip above it — exactly where a thumb lands when reaching for the top of the form, scrolling a list that has already hit its end, or steadying the phone. The two deliberate exits are 44px targets at the top of the same sheet: **"← Back to my order"** (top-left of the payment step) and **the ✕** (top-right). A customer who *means* to leave aims at one of them; a customer who taps the dark area is, on the evidence of the report that started this, usually not leaving on purpose.

**And the cost of the two mistakes is not symmetric.** A backdrop tap that fails to close costs one deliberate tap on a control that is already on screen. A backdrop tap that *does* close costs everything typed into a form that cannot be restored — not by us, not by Stripe, not by the customer's browser.

**The review step is untouched**, and that is the other half of the argument: `payingInSheet` is false there, nothing is lost by closing, and the backdrop tap a customer expects to work still works. **Only the step where the tap is destructive stopped acting on it.**

### Why not (b), "ask first"

**Answering the brief's own test: I cannot establish that we can tell.**

**QUOTED — Stripe's change-event documentation, in full, as fetched:**

> *"`element.on(event: 'change', handler: function)` — The change event is triggered when any value in the change event payload changes. The event payload always contains certain keys, in addition to some `Element`-specific keys."*

**The page does not enumerate those keys**, and the fetch of the variant page returned the same text. **Not established: whether the Payment Element's change payload exposes an `empty` (or equivalent) flag, and whether it is set for card *and* wallet entry.** There is no `@stripe/stripe-js` in `package.json` to read types from — **QUOTED** (`:109-113`): *"Stripe REQUIRES js.stripe.com to be the source… Neither is in package.json"* — and this page's own type is a three-method hand-written slice with an argument-less handler: `on: (ev: string, fn: () => void) => void`.

**Per the brief: "if you cannot tell, say so — that would make (a) the answer."** It does.

⚠️ **Two further reasons that hold even if `empty` turns out to be available:** a confirm that fires on an untouched form trains customers to dismiss dialogs mid-payment; and a dialog stacked over a bottom sheet, on a phone, in the two minutes someone is paying, is a second modal to escape from.

### The customer is never trapped

| Exit | Where | Keeps the basket? | Keeps the authorisation? |
|---|---|---|---|
| **"← Back to my order"** | top-left of the payment step, unscrolled | yes | **yes** — QUOTED (`:1653-1657`): *"CLOSING THE STAGE KEEPS THE AUTHORISATION… it is kept and re-presented when they return"* |
| **✕** | top-right of the sheet, unscrolled | yes | yes — the sheet closes; `payment` is untouched |

Both are visible without scrolling because the payment step renders directly under the sheet header. **Neither was changed.**

⚠️ **A stated limit: a refused backdrop tap gives no feedback.** Adding a shake or a toast would mean touching the sheet's structure, which this brief fences off. The mitigation is that both exits are already on screen and labelled; the risk is a customer tapping the dark area twice before looking up. **Flagged, not built.**

---

## VERIFICATION

### What is proved from here

**(a) The backdrop cannot dismiss the sheet during authorisation. PROVED, statically.**

The guard is `if (!payingInSheet)`; `payingInSheet` is `formSheetOpen && stageOpen && payment !== null`; `payStage === 'authorising'` is reachable only from the Pay button, which renders inside `{payingInSheet && payment && (` and whose handler returns early unless `payment` and `elementReady` are set. **Therefore `authorising ⇒ payingInSheet ⇒ !(!payingInSheet)`, and the handler body cannot run.** The ✕'s guard `payStage !== 'authorising'` fails in the same state. **Both refuse; see the table above.**

**(d) The teardown guarantee is intact. PROVED, statically.**

*Every* route that can close the sheet or the stage, from `grep`:

```
1611:        setPayment(null)                       ← card refusal handler
1614:        setStageOpen(false)                    ← card refusal handler
1659:  const closePaymentStage = () => { setStageOpen(false); setPayStage('idle'); setPayError(null) }   ← "Back"
2756:            onClick={() => { if (!payingInSheet) setFormSheetOpen(false) }} />                       ← backdrop
2777:                  <button onClick={() => setFormSheetOpen(false)} ...>✕</button>                     ← ✕
```

plus the successful-authorisation navigation (`window.location.href`), which replaces the document.

**Five routes before this change, five after. None added, none removed, none bypassed.** Each still falsifies a term of `{payingInSheet && payment && (`, which destroys the host div, which fires the callback ref with `null`, which changes `paymentBoxEl`, which runs the one cleanup. **The backdrop now reaches that outcome in strictly fewer situations; it cannot reach it in any situation the others cannot.**

⚠️ **There is a second `bg-black/40` backdrop in this file** (`:3252`, `onClick={() => setItemModal(null)}`) — the **item modal's**, not the sheet's. It closes no payment step and was not touched.

**The effect, its deps, its cleanup and the ref do not appear in the diff** (grep above).

### What needs testing by hand

`next dev` is forbidden here, so the following are exact steps rather than results.

**(b) An accidental backdrop click with details typed**

1. Open a truck's order page, add an item, tap **Place order**, choose **Pay now by card**.
2. Wait for the card form (the skeleton clears).
3. Type a full test card — `4242 4242 4242 4242`, any future expiry, any CVC.
4. **Tap the dark area above the sheet.**
5. **Expect:** nothing happens. The sheet stays, the card form stays, the typed digits are still there. *(Before: the sheet closed and reopening showed an empty form.)*

**(c) A deliberate exit still works and the basket survives**

6. Tap **"← Back to my order"**. Expect the review step, with the basket, name, email, phone, notes and slot exactly as they were.
7. Tap **Pay now by card** again. Expect the card form to reopen with **no new draft and no second authorisation** — the same intent is re-presented — and **empty fields**, because the Element was torn down by the deliberate close. *(That is unchanged and is the documented behaviour of the guarantee.)*
8. Repeat with the **✕** instead of Back; expect the sheet to close and the basket to be intact when it is reopened.

**(a) again, at Stripe, for the mid-authorisation window**

9. With the form filled, tap **Pay**, and **while the button reads "Authorising…"** tap the dark area repeatedly.
10. **Expect:** the sheet does not close, the ✕ and Back are hidden, and the flow completes to the confirmation. *(Before: the sheet could be dismissed, tearing the Element down while `confirmPayment` was in flight.)*

**(e) A decline still leaves the Element mounted with details intact**

11. Repeat steps 1-3 with the decline card `4000 0000 0000 0002`, and tap **Pay**.
12. **Expect:** a red error panel, the button re-labelled **"Try again · £X.XX"**, and **the card fields still populated**.

**Why (e) is expected to be unchanged, PROVED statically:** the decline branch sets only `payError` and `payStage`; **neither is in the effect's dependency array** and **neither gates the host div**, whose render reads `formSheetOpen`, `stageOpen` and `payment`. This build changed none of those. **QUOTED**, the render comment that makes it deliberate (`:2855`): *"never conditionally removed while the step is open — unmounting it on a decline would destroy the card details just typed."*

---

## NON-ASCII CENSUS

| File | Total before | Total after | Distinct before | Distinct after | Vocabulary |
|---|---|---|---|---|---|
| `app/trucks/[slug]/order/page.tsx` | 2858 | 3032 | 39 | 39 | `─🔴⇒—⚠️→·●×…’§≤✏≠🎁£📝−–←😕🚚🚫📡⏸🕐⏳✓ⓘ≥⟷⟺✕⌄⚡▾📎` unchanged |

**No file gained a character class**, and no other file was modified by this turn. The increase is comment text in the file's existing vocabulary.

---

## FLAGS

- **Nothing in the prompt arrived garbled.**
- ⚠️ **FIX 1 and FIX 2 were satisfiable together and are not in conflict**, but they are not the same guard: FIX 2's `!payingInSheet` **implies** FIX 1's `payStage !== 'authorising'`, so one predicate delivers both. They "agree" on the mid-authorisation case; the backdrop is stricter elsewhere, by design. Stated rather than glossed, since the brief asked for agreement.
- 🔴 **Not established, and it is what decided FIX 2:** whether the Payment Element's `change` payload exposes an `empty` flag. Stripe's own change-event page does not enumerate the keys, and there is no Stripe npm package in this repo to read types from.
- ⚠️ **A refused backdrop tap is silent.** Feedback would mean touching the sheet's structure, which is fenced off here.
