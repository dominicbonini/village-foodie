# Probe — manual capture on a direct charge, under our posture

**Date:** 11 August 2026
**Result: 🔴 ALL SIX STEPS PASSED. Cancellation creates NO Refund object — the property the whole design rests on is confirmed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

**Scope of what was written:** four PaymentIntents and one Checkout Session on the **sandbox** connected account `acct_1U1oKsGjKNrnUpcM`. **No database call, no code change** — neither script imported the Supabase client. Both deleted, confirmed.

🔴 **One trap found that the documentation does not warn about: an UNCAPTURED charge reports `charge.status: "succeeded"`.** See §7.

---

## The answers, first

| # | Question | Answer |
|---|---|---|
| 1 | Checkout Session + `capture_method: manual` as a direct charge? | ✅ **ACCEPTED** |
| 2–3 | Reaches `requires_capture` with no money moved? | ✅ **YES** — `amount_received: 0`, `balance_transaction: null` |
| 4 | 🔴 **Does cancelling create a Refund?** | ✅ 🔴 **NO. Zero refunds before, zero after.** |
| 5 | Capture on a connected account? | ✅ **Succeeded** |
| 6 | 🔴 `application_fee_amount` **at capture**? | ✅ **ACCEPTED** — and it works despite `fees.payer: 'account'` |

---

## 0. The account, and our posture on it

```
acct_1U1oKsGjKNrnUpcM
charges_enabled : true   details_submitted: true
controller      : {"fees":{"payer":"account"},"is_controller":true,
                   "losses":{"payments":"stripe"},"requirement_collection":"stripe",
                   "stripe_dashboard":{"type":"full"},"type":"application"}
```

✅ **This is exactly our posture** — the truck pays Stripe's fees, Stripe bears losses and collects requirements, full Dashboard. **Everything below was measured on it, not on a default account.**

---

## 1. ✅ Checkout Session with manual capture, as a direct charge

```
✅ ACCEPTED — session cs_test_a1ju1AMoy1CXjTTGohig8zDLLP4guDSW0lwiauK3doNfXRrC1MjYAKnSHU
   livemode: false  amount_total: 1250 gbp
   status: open  payment_status: unpaid
```

**Created with `payment_intent_data: { capture_method: 'manual' }` and the `Stripe-Account` header — the two parameters together, on one call, with no error.**

🔴 **This is the §2 assumption I flagged as unverified, and it is settled.** The absence of a restriction in the docs was correct: `capture_method` and `Stripe-Account` are orthogonal, and Stripe accepts them together under our exact controller configuration.

⚠️ **A hosted Checkout Session cannot be completed without a browser**, so steps 2–6 used PaymentIntents created with the same shape Checkout produces: same connected account, `capture_method: 'manual'`, test card. **The parameter acceptance above is what step 1 could prove; the lifecycle below is what the rest proves.**

---

## 2–3. ✅ Authorization — `requires_capture`, and no money moved

```
[AUTHORIZED] pi_3U3BUOGjKNrnUpcM04vV5uZe
   status                          : requires_capture
   amount / capturable / received  : 1250 / 1250 / 0
   application_fee_amount          : null
   charge.status                   : succeeded
   charge.captured                 : false
   charge.amount_captured          : 0
   charge.balance_transaction      : null   ← null = no money moved
   capture_before                  : 2026-08-18T08:56:52.000Z
   (created 2026-08-11T08:56:52.000Z → window 7.00 days)
```

✅ **`balance_transaction: null` is the proof that nothing moved** — a balance transaction is what exists when money changes hands, and there is none.

✅ **The window is exactly 7.00 days**, matching the documented *"Usually, an authorization for an online card payment is valid for 7 days"* to the second. `capture_before` is on the charge and is machine-readable, so a future implementation can read the deadline rather than assume it.

---

## 4. 🔴 CANCELLATION CREATES NO REFUND — the design property holds

```
refunds on the account BEFORE : 0

[CANCELLED] pi_3U3BUOGjKNrnUpcM04vV5uZe
   status                          : canceled
   amount / capturable / received  : 1250 / 0 / 0
   cancellation_reason             : null
   charge.status                   : succeeded
   charge.refunded                 : false
   charge.amount_refunded          : 0

refunds on the account AFTER  : 0

🔴 NEW REFUND OBJECTS: 0  ✅ NONE — the property the design rests on HOLDS
```

🔴 **This is the answer that matters most, and it is unambiguous.** `amount_capturable` falls to 0, the PaymentIntent goes `canceled`, and **no `Refund` object comes into existence** — `charge.refunded` stays `false` and `amount_refunded` stays `0`.

**Why it matters so much for this design:** under direct charges, a refund is money leaving **the truck's** account, which HatchGrab cannot issue and which the terms assign to the truck. **A cancelled authorization is not a refund — it is the absence of a charge.** So the "cancel on check failure" step in the proposal costs the truck nothing and involves no refund mechanics at all.

⚠️ **`cancellation_reason` came back `null`** because none was passed. It is settable (`requested_by_customer`, `abandoned`, …) and **worth setting deliberately** — it is the only field that would later distinguish "stock ran out" from "we crashed".

---

## 5. ✅ Capture on a connected account

```
authorized pi_3U3BVAGjKNrnUpcM0azUCCbI → requires_capture
```

Then captured — see §6.

---

## 6. 🔴 `application_fee_amount` AT CAPTURE — confirmed

```
[CAPTURED] pi_3U3BVAGjKNrnUpcM0azUCCbI
   status                          : succeeded
   amount / capturable / received  : 1250 / 0 / 1250
   application_fee_amount          : 99
   charge.captured                 : true
   charge.amount_captured          : 1250
   charge.application_fee          : "fee_1U3BVBGjKNrnUpcMQ6klJJDZ"
   charge.application_fee_amount   : 99
   charge.balance_transaction      : present — money moved

✅ application_fee_amount AT CAPTURE: ACCEPTED
```

**And the fee really reached the platform** — an `ApplicationFee` object exists on the platform account, attributed to the connected account:

```
fee_1U3BVBGjKNrnUpcMQ6klJJDZ  amount=99 gbp  charge=ch_3U3BVAGjKNrnUpcM0NoqGEZc  account=acct_1U1oKsGjKNrnUpcM
```

🔴 **The non-obvious part, and it is worth stating plainly: the fee worked despite `fees.payer: 'account'`.** Our posture makes the **truck** pay Stripe's processing fees. That is a *separate axis* from the platform fee — **the truck pays Stripe, and HatchGrab can still take an application fee on top.** The two do not interfere, and I had not verified that before now.

✅ **So the deferred fee is genuinely easier under authorize-then-capture**, exactly as §3 of the audit predicted: the fee is set at capture, which is the moment the order is confirmed and its final value is known.

⚠️ Note the two older fees in the list (`amount=123` each, 7 August) — **pre-existing from earlier testing, not from this probe.**

---

## 7. 🔴 WHAT THE TRUCK SEES — and the trap

```
an UNCAPTURED payment on their account:
   payment_intent.status      : requires_capture
   charge.status              : succeeded        ← 🔴 THIS
   charge.captured            : false
   charge.amount_captured     : 0
   charge.balance_transaction : null
```

🔴 **`charge.status` is `"succeeded"` on a charge where no money has moved.** The Stripe Dashboard renders this correctly as **"Uncaptured"** — it derives the label from `captured`, not from `status` — but **the API field says `succeeded`.**

⚠️ **This is the one thing that behaved differently from what the documentation led me to expect, and it is a live trap for us:**

- ✅ **We are safe today by accident of a good decision.** Our webhook keys on the **`payment_intent.succeeded` EVENT**, which under manual capture only fires at capture. **The event and the field are not the same thing.**
- 🔴 **Anything that ever reads `charge.status === 'succeeded'` to mean "paid" would be wrong** for every uncaptured authorization. That includes any future reconciliation script, any Sigma query, and any human reading the API.

**What the truck sees in their own Dashboard:** a payment listed as **Uncaptured**, for the full amount, with a visible expiry (`capture_before`). ⚠️ **They can capture or cancel it themselves** — they have a full Dashboard and it is their account. That is a real operational consideration this design introduces: **a truck could capture an authorization for an order our checks were about to reject.** The window is seconds in the happy path, but it is not zero.

---

## Anything else that differed from the documentation

| | |
|---|---|
| 🔴 `charge.status: "succeeded"` while uncaptured | §7 — **the significant one** |
| `cancellation_reason: null` after an explicit cancel | Expected only if one is passed; ours was not. Not a defect, but worth setting. |
| The charge object **persists** after cancellation | With `status: succeeded`, `captured: false`, `refunded: false`. So a cancelled authorization leaves a charge record, not a clean absence — **visible to the truck.** |
| Application fees created **asynchronously** | The docs say so, and it held: the `ApplicationFee` object needed a moment to appear after capture. Anything reading it immediately after capture must tolerate a lag. |
| Everything else | Matched the documentation exactly, including the 7-day window to the second |

---

## What was written, and cleanup

| | |
|---|---|
| **Stripe (sandbox)** | 1 Checkout Session (`cs_test_a1ju1AM…`, left `open`, expires by itself) · 4 PaymentIntents: **2 cancelled**, **1 captured** (`pi_3U3BVAGjKNrnUpcM0azUCCbI`, £12.50 with a 99p application fee), 1 cancelled after the Dashboard check |
| **Our database** | **Untouched.** Neither script imported `@supabase/supabase-js`; every call went to `api.stripe.com`. |
| **The repo** | **Unchanged by this probe.** The modified files are earlier tasks'; no source file was edited here. |
| **The scripts** | `_probe_capture.mjs`, `_probe_capture2.mjs` — **deleted, confirmed** |
| **Safety guard** | Both scripts refused any key not starting `sk_test_`, checked before the first request |

⚠️ **One captured payment of £12.50 now sits on `acct_1U1oKsGjKNrnUpcM`** with 99p taken to the platform. It is sandbox money. **I did not refund it deliberately** — a refund would create the very `Refund` object §4 exists to show does not appear, and would muddy the record if you re-check.

---

## What this changes about the design

**Nothing was wrong. One thing is now proven that was assumed, and one new trap is named.**

| | Before this probe | Now |
|---|---|---|
| Checkout + manual capture + direct charge | ⚠️ inferred from the absence of a restriction | ✅ **measured** |
| Cancel ≠ refund | ⚠️ assumed | ✅ 🔴 **proven — 0 refund objects** |
| Fee at capture | ⚠️ read in the API reference | ✅ **proven, and proven compatible with `fees.payer: 'account'`** |
| 7-day window | ⚠️ documented | ✅ **measured at exactly 7.00 days** |
| 🔴 `charge.status` on an uncaptured charge | not considered | 🔴 **reads `succeeded` — never key on it** |
| 🔴 The truck can capture or cancel it themselves | not considered | 🔴 **they have a full Dashboard; it is their account** |

⚠️ **The structural cost from the audit is untouched by this probe and still stands: hosted Checkout is a full page navigation, so the basket needs a server-side draft (§10 of the previous report), and extracting order creation from the 1,139-line submit route is still the piece that dominates the estimate.**

**Stopping here, as instructed. Nothing built, nothing migrated, the checkout route unchanged.**
