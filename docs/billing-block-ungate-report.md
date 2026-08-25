# Ungating the billing block

**Date:** 25 August 2026
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

🔴 **NOTHING IS OBSERVED ON A DEVICE.** I ran `npx tsc --noEmit` and a comment-aware scanner. I did not
run `next dev`, did not deploy, and did not open the app on any hardware. **The empty card you saw is
still what is deployed until this ships.**

---

# §1 — THE CHANGE

**The `purchaseCtaAllowed()` wrapper is removed. The block renders on every platform, iOS included.**

```diff
- {purchaseCtaAllowed() && (
  <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-3">
    <span className="text-amber-500 flex-shrink-0 mt-0.5">⚙️</span>
    <div>
      <p className="text-sm font-medium text-amber-800">Billing is managed by HatchGrab</p>
      <p className="text-xs text-amber-700 mt-0.5">
-       During early access we set up and adjust plans manually. There is nothing to configure here.
+       During early access we set up and adjust plans manually.
      </p>
    </div>
  </div>
- )}
```

## 1.1 ✅ THE FINAL RENDERED TEXT, EXACTLY AS IT WILL APPEAR

```
  ⚙️  Billing is managed by HatchGrab
      During early access we set up and adjust plans manually.
```

**Two lines. No third sentence. No CTA, no link, no price, no purchase instruction.**

✅ **Confirmed in code, comments excluded:** `"There is nothing to configure here."` → **0**,
`"Payment setup coming soon"` → **0**, `"Billing is managed by HatchGrab"` → **1**,
`"During early access we set up and adjust plans manually."` → **1**.

⚠️ **A raw `grep` still finds both deleted strings once each — they now live only inside the comment
that records their removal.** The scanner above is what settles it; **do not read a raw count as a
failure here.**

## 1.2 🔴 MY OWN COMMENT PREDICTED THIS FAILURE AND THE GATE CAUSED IT ANYWAY

The comment that shipped with the gate said:

> ⚠️ **ONLY THIS BLOCK IS GATED.** The "Billing & payments" heading and the truck/plan line below it are
> NOT — they state which plan the operator is on, which is information rather than payment mechanics,
> **and removing them would leave this card empty on iPad.**

🔴 **The reasoning identified the right failure and the wrong cause.** It guarded the heading and the
plan line against removal, and then the gate emptied the card **from the other direction** — by
suppressing the only content those two elements were framing. **Predicting an outcome is not the same as
preventing it.** The replacement comment records that plainly rather than quietly dropping it.

## 1.3 THE TEST RECORDED AT THE SITE, FOR THE NEXT EDIT

✅ **Why it is safe ungated:** the block carries **no CTA, no link, no price and no purchase
instruction**. It states how billing works today. **Facts about the product are permitted under 3.1.1;
instructions to buy are not.**

⚠️ **The comment also names the condition that would reverse this:** if a future edit adds a price, a
link or a "contact us to upgrade", the gate becomes right again — **but then the block would need
rewriting rather than hiding, because an empty card is a worse outcome than a factual one.**

---

# §2 — THE CALL-SITE COUNT: ✅ **ELEVEN. IT IS BACK WHERE IT WAS.**

Counted with the line-by-line comment-aware scanner, **not a regex** — the regex I used two tasks ago
under-counted and its numbers were withdrawn.

```
  app/manage/[token]/page.tsx : 10
     L431    if (truck?.plan === 'trial' && purchaseCtaAllowed()) setActiveTab('billing')
     L444    if (!purchaseCtaAllowed()) return
     L743    {showTrialReminder && truck && purchaseCtaAllowed() && (
     L10608  {purchaseCtaAllowed() && (                       ← SettingsTab, van upgrade modal
     L10996  ? (purchaseCtaAllowed()                          ← billingCard
     L11005  {purchaseCtaAllowed() && (                       ← billingCard
     L11038  {truck.trial_expires_at && purchaseCtaAllowed() && (
     L11068  {purchaseCtaAllowed() && (
     L11098  {purchaseCtaAllowed() && (
     L11162  {showUpgradeModal && purchaseCtaAllowed() && (
  components/FeatureGate.tsx  : 1
     L58     {purchaseCtaAllowed() && (

  TOTAL: 11
```

✅ **Ten in `app/manage/[token]/page.tsx`, one in `components/FeatureGate.tsx` — exactly as specified,
and exactly the set that existed before the twelfth was added.** Nothing differs; there is nothing to
name.

---

# §3 — WHAT WAS NOT TOUCHED

| Contract | Result |
|---|---|
| The other ten `purchaseCtaAllowed()` call sites | ✅ **all ten present, unchanged** (§2) |
| The "Billing & payments" heading | ✅ **byte-identical** |
| The plan line (`Apple Tester · trial plan`) | ✅ **byte-identical** |
| The trial block | ✅ **byte-identical** |
| The starter block | ✅ **byte-identical** |
| The pro/max block | ✅ **byte-identical** |
| The feature matrix (`matrixContent`) | ✅ **byte-identical** |
| The footnotes (`footnotesContent`) | ✅ **byte-identical** |
| The Auto-replies native hide | ✅ **byte-identical — not re-opened** |
| The amber container and the ⚙️ | ✅ **untouched**: container class 1→1, cog span 1→1, both text classes unchanged |

⚠️ **THE AMBER CONTAINER IS NOW FLAGGED FOR THE THIRD TIME AND STILL NOT CHANGED.** Amber plus a cog
reads as "something is pending", which is arguably the same shape the copy rewrite exists to remove —
and it is now the whole visual treatment of a block that is meant to read as a plain statement of fact.
**Out of scope again, by instruction. Reported, not taken.**

---

# §4 — RAN vs READ

| | |
|---|---|
| **RAN** | `npx tsc --noEmit` → **exit 0**. The line-by-line comment-aware scanner over the file for the call-site count and the copy strings. Byte-comparison of nine spans against a pre-change snapshot. |
| **READ** | The block in place, and the comment that shipped with the gate. |
| **NOT DONE** | 🔴 **No `next dev`. No deploy. No device.** |

🔴 **`tsc` EXIT 0 IS NOT DONE.** It proves the file parses and types. **It cannot tell you the card now
has content on an iPad.**
🔴 **A FIX IN THE REPO IS NOT DEPLOYED.** Until you ship this, the Billing tab on that iPad still shows
a heading and a plan line over nothing — **the exact state you observed.**

⚠️ **What to look for after deploying:** open Manage → Billing on the iPad. The "Billing & payments"
card should carry the amber block with **two lines of text** under the heading, and the
`Apple Tester · trial plan` line below it as before. **On the web it should look identical** — the block
was never hidden there, so nothing about the web render changes except the deleted sentence.
