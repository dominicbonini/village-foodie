# Payments tab — split reverted, banner merged into "Your Stripe details", badge kept

**Date:** 11 August 2026
**Result: Online payments is byte-for-byte back to what it was. The notification banner now lives inside the details card, so it can never be an empty box or a strip touching its neighbours. The badge is untouched.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

**Untouched, as instructed:** the six states, account creation, the webhook, `lib/payments`, and the walk-up section. Every fee figure still resolves from `CARD_FEES`.

---

## 1. 🔴 THE SPLIT IS REVERTED, AND THE REASONING IS KEPT

**Online payments is restored exactly**: heading, intro sentence, and one card containing the status headline and chip, the trial reassurance, the **Connect Stripe** button, **the fee line**, and the test-mode note — in that order, as before.

```jsx
<section>
  <h3>Online payments</h3>
  <p>Customers pay by card when they order. Money goes straight to your own Stripe account — we never hold it.</p>
  <div className="mt-3 bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
    …status headline + chip · trial reassurance · Connect Stripe…
    <p className="text-xs text-slate-500 mt-3">
      Stripe charges {CARD_FEE_ONLINE_LABEL} per payment on standard UK cards. Cards issued outside
      the UK and EEA cost more. HatchGrab&apos;s own fee on online orders depends on your plan — see Billing.
    </p>
    <p className="text-[11px] text-slate-400 mt-3">Test mode. No real payments can be taken yet.</p>
  </div>
</section>
```

✅ **The fee line is back where it was**, with its original `mt-3`, its original position above the test-mode note, and `CARD_FEE_ONLINE_LABEL` unchanged.

### ⚠️ The reasoning is recorded, not lost

**At the section head, so it is found by whoever next opens this file:**

> *A split was tried on 11 August 2026 and reverted. …The argument still stands and is worth revisiting when Tap to Pay ships: `CARD_FEE_ONLINE_LABEL` below is the ONLINE rate, and in-person cards are a DIFFERENT rate (`CARD_FEE_IN_PERSON_LABEL`, already quoted in the walk-up section). The day a truck can take a card at the hatch on this same connection, a card headed "Online payments" carrying the account's own status will be describing two things at once. **Revisit then — not before, and not as a tidy-up.***

### 🔴 The "Your Stripe account" heading was DROPPED, and it had to be

**Your instruction was to keep it only if it cost nothing.** It did not:

**Restoring the previous layout puts the account's status, chip and Connect button back inside the Online-payments card.** A "Your Stripe account" heading over what remains — the onboarding and details cards — would label **only the leftovers**, while the account's actual status sat above it under a different heading. **Two headings splitting one subject reads worse than one heading and an unlabelled group.**

⚠️ **So the group is once again unlabelled, exactly as before this task.** The observation that prompted it — markup says sibling, typography says child — is now recorded in the section comment, so it survives without the structure.

---

## 2. THE BANNER IS MERGED INTO "YOUR STRIPE DETAILS"

```jsx
{shouldOfferAccountManagement(state) && (
  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
    <p className="text-base font-bold">Your Stripe details</p>
    <p className="text-xs text-slate-500 mt-0.5">Change the bank account you get paid into…</p>

    {shouldMountNotificationBanner(state, detailsSubmitted) && (
      <div className="mt-3"><ConnectNotificationBanner /></div>
    )}

    {showManagement ? <ConnectAccountManagement /> : <button>View or edit</button>}
  </div>
)}
```

**It was a bare sibling between two cards.** When it had something to say it appeared as an unpadded strip touching the card above and below; when it had nothing it contributed only the parent's row gap. **Inside a card that always has content it can be neither.**

### 🔴 It moved WHOLE — and your instinct to check that was right

**I can confirm the operator's intent is served, with one thing they should know.**

**Served:** the "Action required" box stops being a loose strip. Whatever Stripe has to say now appears inside a card with proper padding and the page's standard spacing around it.

🔴 **What they should know: this is not a filter.** The banner is **one opaque iframe** carrying **risk interventions and paused payouts** as well as hygiene prompts, and `onNotificationsChange` returns `{total, actionRequired}` — **two numbers with no message text**. We cannot read what it says, so we cannot route part of it.

⚠️ **So "your payouts are paused pending review" will now appear inside a card headed "Your Stripe details", one line under a sentence about changing bank details.** That is a real consequence of merging, and it is the honest cost of it. **It is still better than the strip**, because the message is at least framed and spaced — but it is not the same as giving urgent notices their own treatment, and no amount of markup can separate them while Stripe gives us two integers.

✅ **Mitigating it: the notice is never the only signal.** A truck whose payouts are paused has `disabled_reason` set, which **fires the tab badge and the cross-tab banner** built last task — and those *are* ours to word. **The urgent path does not depend on where the iframe sits.**

### ⚠️ No empty box, and no odd spacing — the defect already fixed once on this page

**The wrapper has no background, no border and no padding of its own** — only `mt-3`. Stripe's components *"grow in height according to the content rendered inside"*, so an empty banner is zero pixels.

**The card itself always has content** — a heading, a sentence and a button — **so it cannot be the empty card the standalone wrapper used to be.** In the empty case the only residue is 12px of margin **inside a card that was already there**.

### 🔴 One consequence I had to accept, flagged rather than buried

**`shouldOfferAccountManagement` now includes `unsupported`.**

The banner mounts in **every** post-onboarding state, `unsupported` included. **Had the gate stayed as it was, moving the banner into this card would have deleted it in that one state — and `unsupported` is precisely where Stripe is most likely to be explaining why an account will never take cards.**

✅ **It is also the better rule on its own terms:** a truck that has completed onboarding has real bank and business details on file, and being unable to take *cards* is not a reason to lock them out of their own information. **The old exclusion also left a dead end** — a card offering to change bank details with no button to do it.

⚠️ **This is a behaviour change I made without being asked.** The alternative was silently dropping a risk-notice surface. **Recorded at the function and here.**

---

## 3. SPACING — the existing convention, unchanged

| | |
|---|---|
| **Vertical rhythm** | The root is `<div className="space-y-6">` ([:261](../components/manage/PaymentsTab.tsx#L261)) — the page's existing convention. **Nothing new was invented.** |
| **Card treatment** | Every card is `bg-white rounded-2xl shadow-sm border border-slate-200 p-4`, class-for-class: Online payments (:292), onboarding (:430), details (:477), walk-up (:552) |
| **Why they no longer touch** | `ConnectComponentsProvider` renders **no DOM**, so the onboarding and details cards are direct children of `space-y-6` and get the full 24px. **The one element that was not a card — the bare banner — is gone.** |

---

## 4. THE BADGE — untouched

✅ **`readAccountRequirements` unchanged**, including `disabled_reason` in the predicate:

```ts
actionRequired: currentlyDue.length > 0 || pastDue.length > 0 || disabledReason !== null
```

✅ **The countless `(!)` variant unchanged.** ✅ **The `requirements` route action unchanged.** ✅ **The cross-tab banner unchanged.** **Not one line of it was touched by this task.**

---

## VERIFY

### All six states — what renders, and nothing empty or touching

| State | Online payments card | Onboarding card | "Your Stripe details" card | Banner lives in |
|---|---|---|---|---|
| **not_connected** | ✅ always | — | — | not mounted |
| **requirements** | ✅ always | **SHOWN** | — | not mounted (`details_submitted` false) |
| **pending** | ✅ always | — | **SHOWN** | 🔴 **inside the details card** |
| **ready** | ✅ always | — | **SHOWN** | 🔴 **inside the details card** |
| **restricted** | ✅ always | **SHOWN** | **SHOWN** | 🔴 **inside the details card** |
| **unsupported** | ✅ always | — | **SHOWN** | 🔴 **inside the details card** |

**Empty-card check — every rendered card, every state:**

```
not_connected  1 card(s), all non-empty ✅      ready        2 card(s), all non-empty ✅
requirements   2 card(s), all non-empty ✅      restricted   3 card(s), all non-empty ✅
pending        2 card(s), all non-empty ✅      unsupported  2 card(s), all non-empty ✅
```

**Orphaned-strip check — is the banner ever a bare sibling?**

```
not_connected  banner mounted=false                        ✅
requirements   banner mounted=false                        ✅
pending        banner mounted=true  hosted inside a card=true  ✅
ready          banner mounted=true  hosted inside a card=true  ✅
restricted     banner mounted=true  hosted inside a card=true  ✅
unsupported    banner mounted=true  hosted inside a card=true  ✅
```

🔴 **The banner is hosted inside a card in every state where it mounts. There is no state in which it is a loose element.**

### Online payments is back to its previous content

**Heading, intro sentence, and one card with: status headline + chip → trial reassurance (trial + not connected) → Connect Stripe (not connected) → fee line → test-mode note.** Same order, same classes, same strings. **`CARD_FEE_ONLINE_LABEL` still resolves from `CARD_FEES`; no literal exists anywhere on the page.**

### 🔴 GUSTO — not connected

```
Pizzeria Gusto · plan trial · stripe_account_id = null · state = not_connected
  Online payments card : SHOWN — headline, chip, trial banner, Connect Stripe, fee line, test-mode
  Onboarding card      : —
  Your Stripe details  : —
  Notification banner  : not mounted (no connectInstance at all)
  Payments tab badge   : none (route short-circuits — no stripe_account_id)
```

✅ **One card, no badge, no Stripe call.** Their page is **identical to what it was before yesterday's restructure** — the split that briefly moved their fee line into a second section is gone, and every string is one they read two days ago.

### tsc and lint

```
$ npx tsc --noEmit          → TSC EXIT CODE: 0
$ npx eslint .  (rule|severity|count, whole repo)
  diff vs baseline : IDENTICAL — no rule, no severity, no count changed
```

15 rule/severity pairs, unchanged. **Compared as rules, not as a total.**

---

## Files changed — two

| File | Change |
|---|---|
| `components/manage/PaymentsTab.tsx` | Online payments restored in full (fee line back, section heading back, the second section removed); the notification banner moved inside the "Your Stripe details" card; the revisit-when-Tap-to-Pay-ships reasoning recorded at the section head |
| `lib/stripe/payments-state.ts` | `shouldOfferAccountManagement` now includes `unsupported` — a consequence of the merge, documented at the function |

**The badge's three files — `lib/stripe/connect.ts`, `app/api/stripe/connect/route.ts`, `app/manage/[token]/page.tsx` — were not touched.**

---

## Worth your attention

1. 🔴 **The merge is all-or-nothing and you should decide you are happy with it.** A paused-payouts notice will appear inside a card headed "Your Stripe details". **The tab badge and cross-tab banner still fire independently for anything that stops the money**, so the urgent path is covered — but the notice itself sits in a box about bank details, and no markup can change that while Stripe gives us two integers and no text.
2. ⚠️ **`shouldOfferAccountManagement` gained a state.** Small, defensible, and forced by the merge — but it is a behaviour change I made without being asked, and it is the one thing in this task to reject if you disagree.
3. ⚠️ **The fee-line argument is parked, not abandoned.** It becomes correctness rather than tidiness the day a card reader shares this connection.
