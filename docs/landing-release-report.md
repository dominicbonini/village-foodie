# Landing page release — gate lifted, /compare linked

**Built. Not deployed, not committed. No SQL, no migrations.**

**GARBLED SPANS: none.** No instruction contradicted another.

**VERIFICATION.** Not a typecheck. Every claim below was **rendered in a browser as an anonymous visitor**
against the running dev server on a hatchgrab host — where the gate is already off, because it was
production-only. That is how item 2 was answered **before** the gate was touched.

## 🔴 THE ONE THING THAT COULD SPOIL THIS DEPLOY

**`/compare` currently answers 307 → /contact**, because `NEXT_PUBLIC_PRICING_PUBLISHED` is not set. **The
link this task adds to the landing page points at it.** Deploy without setting that flag and the pricing
section carries a link that bounces visitors to the contact form. **Set the flag before or with this
deploy — never after.** §3.

---

## 1. The gate — exactly five lines removed

From `app/landing/layout.tsx`:

```ts
import { redirect } from 'next/navigation'
import { verifyAdmin } from '@/lib/auth/admin'
…
  if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) {
    redirect('/contact')
  }
```

**Three lines of gate plus the two imports it was the only user of.** `diff` against the pre-change file
shows **those five removals and nothing else**. `export const dynamic = 'force-dynamic'` is untouched, the
component still returns `<>{children}</>`, and the file's long explanatory header is intact — the removed
condition is quoted in a new comment so the reasoning survives, with a note that restoring it means
restoring those two lines and **not** writing a client-side check (`verifyAdmin` reads `cookies()`).

---

## 2. 🔴 What a logged-out visitor gets — RENDERED

**No stop condition triggered.** Grepped the whole landing tree (`app/landing/page.tsx` and
`components/landing/*`) for `verifyAdmin`, `isAdmin`, `getUser`, `session`, `cookies` — **zero matches.
Nothing in the page body depends on a session**, so nothing renders empty or broken for a visitor.

| | Result |
|---|---|
| Sections rendered | **8**, with all 6 `<h2>` headings present |
| Comparison table | **33 rows** |
| Images | **7 of 7 loaded, 0 broken** |
| **Hero screenshots** | ✅ all three — `kitchen.png`, `dashboard-v4.png`, `customer-order.png` |
| Other images | wordmark ×2, Gusto logo, App Store badge — all loaded |
| Prices shown | **Free / £29 / £49** — real |
| **"TBC" anywhere** | **No** |
| **Page errors** | **none** |
| **Console errors** | **none** |
| **Failed requests** | **none** |

**The demo:** clicking "Upload my menu →" opens the modal, which renders a **file input**, with **no
errors**. `app/api/demo/route.ts` exists.

⚠️ **I did not run a demo end to end.** Completing it uploads a real photo, calls a paid external model
and creates a demo record — a side-effecting external action I would not take unasked. **The modal
opening is not proof the generation works, and this is the hero's entire hook.** See §6.

**CTAs:** six, all `DemoCta` buttons opening that modal — the page's single intended action. Plus the nav
"Log in" → `/login`, and the footer's Pricing / Privacy / Terms / Contact, all resolving (§5).

---

## 3. `NEXT_PUBLIC_PRICING_PUBLISHED` — and the answer to "before or with"

**State: not set anywhere in the repository** (`.env.local`, `vercel.json`, `next.config.*` all checked).
Its production value lives in Vercel and cannot be read from here.

### 🟢 The landing page shows REAL prices with the flag unset, and shows no "TBC" at all

**Measured: `Free / £29 / £49`, and the string "TBC" appears nowhere on the page.** The reason is
structural, not luck: **the landing does not use the price mask.** It renders `PLAN_PRICES` and
`PLAN_ALLOWANCES` directly, with no `maskPrice`/`usePriceMask` import — unlike Billing. It got away with
that because it was admin-gated; from this deploy it is simply publishing real prices, which is what you
want it to do.

**So the flag is NOT required for the landing.** 🔴 **But it is required for the link in §4.**

| | Flag unset | Flag `'true'` |
|---|---|---|
| Landing prices | **real** (unaffected) | real |
| `/compare` | **307 → /contact** | renders |

**Answer: set it BEFORE or WITH this deploy.** After is too late — the window between them is a live
landing page whose pricing section links to a redirect.

⚠️ **And know what else that switch does:** it simultaneously un-masks prices in Manage → Billing,
FeatureGate and the van add-on. One flag, two jobs.

### "the compare page too should be released if not done already"

**It is released by that flag, and I could not do it in code:** item 7 forbids touching the `/compare`
gates. Its remaining gates are the host check (HatchGrab only) and the pricing-flag check. **Setting the
flag releases it. No code change is needed or permitted.**

---

## 4. The link to /compare

**Wording: "Work out what you would pay →"**

**Where, measured in the rendered page:** inside `<section id="pricing">`, **below the plan cards** and
**above the small print** — the first line of `.price-foot`. Rendered in brand orange (`rgb(239,139,44)`)
at 15.2px, slightly larger than the caveats beneath it.

**Why there:** it is the moment the reader is weighing cost, and the calculator answers exactly the
question the three cards raise.

⚠️ **It is a plain link, not a button, deliberately.** Every other control in that section is a `DemoCta`
opening the upload modal; a fourth button would compete with the page's primary action. This is a
secondary route for someone who wants to do the arithmetic.

---

## 5. Every other surface — probed, both hosts, anonymous

| Path | hatchgrab host | villagefoodie host |
|---|---|---|
| `/` | **200 — the landing, now public** | 200 — Village Foodie, unchanged |
| `/landing` | **308 → `/`** (unchanged) | — |
| `/contact` | **200 — still directly reachable** | 200 |
| `/compare` | **307 → /contact** (flag unset) | **404** (host gate) |

🔴 **Confirmed: lifting this gate publishes hatchgrab.com's ROOT, not just `/landing`.** `proxy.ts`
rewrites `/` to this route on a hatchgrab host, so the domain given to Apple as the Marketing URL now
serves the landing page to anyone. That is the intended outcome, but it is not visible from the layout
file and is now recorded in it.

✅ **`/contact` is unaffected** — it was the gate's redirect target and is reachable directly on both
hosts. Village Foodie is untouched throughout.

---

## 6. 🔴 What is still aspirational — the last look before it is public

### The four blockers the manual records against this page are all cleared

| Recorded blocker | Now |
|---|---|
| (a) hero fan is **dashed placeholder boxes** | ✅ **three real PNGs**, all loaded |
| (b) testimonial **invented, no permission** | ✅ real words; **you state written permission is granted** |
| (c) **Privacy + Terms unwritten** | ✅ 1,600 and 3,227 words; `/privacy` and `/terms` both **200** |
| (d) the **demo is not built** | ✅ modal + file input + `app/api/demo/route.ts` |

### Everything unbuilt is labelled — 8 rows and 5 bullets

**Compare table "Coming soon":** Android kitchen app · WhatsApp, Messenger & Instagram auto-replies ·
Take payment on your phone · Advanced reporting · SMS order alerts · Customer-facing display · Event &
festival pricing · Digital loyalty stamp cards.

**Plan-card bullets "Coming soon":** Android kitchen app · WhatsApp/Messenger/Instagram · Take payment on
your phone · Event & festival pricing · Digital loyalty stamp cards.

**The footnotes carry the caveats honestly** — 1: in-person card payments via Stripe *"are coming soon"*;
3: *"Device not supplied… Android coming soon"*; 5: printer *"neither supplied"*.

### 🟢 One alarm I raised and then disproved — worth recording

The manual states kitchen ticket printing was **gate-enabled but a `createStubTransport` with no physical
print**, and the table shows it **✓ for Trial and Max**. That would have been a false promise on a public
page.

**It is not.** I read the code: `getPrinterTransport()` returns the **real BLE backend** on native
(`lib/printing/bleTransport.ts`, 22 KB, 57 BLE calls, real GATT discovery) and only falls back to the
honest stub on web, where *"a browser has no printer"*. The watcher is mounted on the dashboard
(`app/dashboard/[token]/page.tsx:2861`). **The ✓ is correct and footnote 5 states the prerequisites
accurately.** ⚠️ **The manual's entry is stale on this point** and should be corrected separately.

### ⚠️ The two things I would still look at

1. 🔴 **"See it working in under 60 seconds" appears twice, and I could not verify it.** The demo opens
   and accepts a file; **a full generation was never run.** It is the hero's whole hook and a **timing
   claim** — *"under 60 seconds"* is measurable and falsifiable by the first visitor. **Run one real
   upload end to end and time it before this goes public.** If it takes ninety seconds, the sentence is
   wrong on the most prominent line of the page.
2. ⚠️ **The Starter card is now visibly shorter than Pro and Max** — a cosmetic consequence of removing
   the sold-out-toggle bullet earlier today. Nothing is wrong; the column just looks thin beside the
   other two. Worth one line of copy if it bothers you.

---

## 7. What was not touched

| | |
|---|---|
| The three protected strings | ✅ untouched |
| `lib/pricing.ts` (price mask set) | ✅ untouched |
| `lib/features.ts` | ✅ untouched |
| `/compare` gates | ✅ untouched — release is via the flag (§3) |
| `proxy.ts` | ✅ untouched |
| Village Foodie surfaces | ✅ unaffected on every probe |

---

## Files changed

```
app/landing/layout.tsx    the admin gate removed (3 lines) + its 2 now-unused imports;
                          the removed condition quoted in a comment with what it also published
app/landing/page.tsx      the /compare link, under the plan cards in the pricing section
app/landing/landing.css   .price-foot .compare-link — styling for that one link
```

## Before you deploy

1. 🔴 **Set `NEXT_PUBLIC_PRICING_PUBLISHED=true` in Vercel, before or with this deploy** — or the new link
   lands on a redirect, and `/compare` stays closed.
2. 🔴 **Run one real demo upload and time it** against the "under 60 seconds" claim.
3. ⚠️ Remember this publishes **hatchgrab.com's root**, not just `/landing`.

**Nothing deployed. Nothing committed.**
