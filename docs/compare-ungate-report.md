# /compare ungated, and the switching block finished

**Built. Not deployed, not committed. No SQL, no migrations.**

**GARBLED SPANS: none.** ⚠️ Minor, not garbled: the brief says "Four changes" then numbers seven items —
items **1, 3, 4, 5** are the changes; **2 and 6** are verification and **7** is a constraint. That reading
is consistent throughout and nothing was ambiguous.

**VERIFICATION.** Not a typecheck. Everything below was **rendered and measured in a browser** against the
running dev server — including, for the first time, `/compare` on the **user's own dev server**, because
removing the flag gate made an isolated server unnecessary.

---

## 1. 🔴 The pricing-flag gate is gone

**Removed from `app/compare/page.tsx` — three executable lines:**

```ts
if (!PRICING_PUBLISHED && !(await verifyAdmin())) {
  redirect('/contact')
}
```

**Plus the three imports it was the only user of** — `redirect` (kept `notFound`), `verifyAdmin`,
`PRICING_PUBLISHED` — and a four-line comment that described the removed gate and was now false. The
removed condition is quoted verbatim in a replacement comment so the history survives.

**The component body is now exactly this:**

```ts
export default async function CostPage() {
  if (!(await onHatchGrab())) {
    notFound()
  }
  …
}
```

### The host gate is intact — measured, both hosts, anonymous, flag unset

| Host | `/compare` |
|---|---|
| `hatchgrab.*` | **200 — renders** |
| `villagefoodie.*` | **404** |

**One gate remains and it is the brand one.** Village Foodie still gets `notFound()`, before any other
work, exactly as before.

### 🔴 `lib/pricing.ts` and the flag are untouched — and still govern the other surfaces

**`git diff lib/pricing.ts` returns nothing.** `PRICING_PUBLISHED` is still defined there and still read
by everything that masked prices before:

| Surface | How it still reads the flag |
|---|---|
| **Manage → Billing** | `usePriceMask` (`app/manage/[token]/page.tsx:9110`, `:11256`) |
| **FeatureGate** | `usePriceMask` (`components/FeatureGate.tsx:28`) |
| **The van add-on** | the same hook via `PricingPolicy` |
| `components/PricingPolicy.tsx` | `maskPriceFor` / `pricesVisibleFor` from `lib/pricing.ts` |

🔴 **This change decoupled ONE page from that decision; it did not make the decision.** Setting or not
setting `NEXT_PUBLIC_PRICING_PUBLISHED` still controls whether an operator sees real prices in Billing,
and that remains open and yours. **Do not read this as "the flag no longer does anything."** It is
recorded in the file so nobody does.

---

## 2. /compare rendered — anonymous, hatchgrab host, flag unset

| Check | Result |
|---|---|
| **HTTP status** | **200**, final URL `/compare` — no redirect |
| **Real prices** | **£49 and 0.99% rendered** |
| **"TBC" anywhere** | **No** — before *and* after driving the form |
| **Calculator end to end** | ✅ completed — plan suggestion and saving language both appear; visible text grew **1,067 → 1,612 chars** as the result rendered |
| **CTA 1 — `/signup`** | ✅ **3 live links** |
| **CTA 2 — `/contact?topic=Cost Comparison`** | ✅ **1 live link** |
| Nav / footer | ✅ both present |
| **Page errors** | **none** |
| **Console errors** | **none** |
| **Failed requests** | **none** |

⚠️ **£29 did not appear, and that is correct.** I entered 2 trucks and "two or more" staff, for which the
calculator recommends **Max** and prints £49. The £29 path is the Pro recommendation. Nothing is missing.

---

## 3. The switching block now matches the plan card row

**`max-width: 34rem` removed** — the block had been capped and centred.

| Width | Plan cards | Block | Left edge | Right edge | |
|---|---|---|---|---|---|
| **1280px** | 1060.0 | **1060.0** | **0.0** | **0.0** | **flush** |
| 390px | 350.0 | **350.0** | 0.0 | 0.0 | flush — **unchanged** |
| 320px | 280.0 | **280.0** | 0.0 | 0.0 | flush — **unchanged** |

**390px and 320px are unchanged**, as required: both were already the full column width, because the cap
was 34rem (544px) and those viewports are narrower than that. **Only the laptop view changed.**

🟢 **The cap was removed rather than replaced with a matching number.** `.plans` is a grid with no
max-width of its own — it fills the section's `.wrap` — so dropping the cap makes the two edges line up
**by construction**. A hardcoded width would have drifted the first time `.wrap` changed.

**Spacing is untouched at every width:** 32.0px above, 28.8px below. No horizontal overflow anywhere.

---

## 4. The arrow is gone

`Compare what you're paying →` → **`Compare what you’re paying`**

Confirmed in the rendered DOM: the link text contains **no `→`**. Your reasoning is now recorded beside
it — every other CTA on the page is a filled button, so an arrow on a text link was borrowing a button's
affordance without being one.

---

## 5. Apostrophes are curly

Both instances now use **U+2019**, matching the rest of the page:

- *"See what you**’**d be paying on HatchGrab for the same orders. Takes about a minute."*
- *"Compare what you**’**re paying"*

Confirmed in the rendered text, not just the source. Previously `&apos;` (U+0027), which sat visibly
against the page's "can’t" and "won’t".

---

## 6. The journey, end to end — clicked, not typed

| Step | Result |
|---|---|
| 1. Land on the hatchgrab root | **HTTP 200** — *"HatchGrab — The ordering system built for food trucks"* |
| 2. Switching block present | *"Switching from another platform? \| See what you’d be paying on HatchGrab for the same orders. Takes about a minute. \| Compare what you’re paying"* → `/compare` |
| 3. Click the link | lands on **`/compare`**, heading *"Compare your online ordering costs"* |
| **Redirects on the way** | **NONE** |
| **404** | **no** |
| **TBC** | **no** |
| Calculator | **5 inputs ready** |
| Page errors | **none** |

🟢 **The broken promise flagged in the last report is closed.** The block says it takes about a minute and
now delivers a working calculator, rather than bouncing the reader to a contact form.

---

## 7. What was not touched

| | |
|---|---|
| The three protected strings | ✅ untouched |
| `lib/features.ts` | ✅ untouched |
| `app/landing/layout.tsx` (landing layout) | ✅ untouched |
| **`lib/pricing.ts` and the flag** | ✅ **untouched** — §1 |
| Billing / FeatureGate / van add-on | ✅ **unaffected** — still read the flag, unchanged |
| `CostComparison.tsx` (the calculator) | ✅ untouched |

---

## Files changed

```
app/compare/page.tsx      the pricing-flag gate removed (3 executable lines) + 3 orphaned imports
                          + a stale comment; the host gate untouched
app/landing/page.tsx      the switching block: arrow removed, apostrophes curled
app/landing/landing.css   .switch-block max-width cap removed so it matches the plan card row
```

## State after this change

**`/compare` is now public on a hatchgrab host, unconditionally, and linked from the landing page.** The
only thing standing between it and any visitor is the brand check. **Nothing now depends on
`NEXT_PUBLIC_PRICING_PUBLISHED` on the public surfaces** — it governs the operator-facing price masking
only, which is still your open decision.

**Nothing deployed. Nothing committed.**
