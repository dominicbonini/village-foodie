# PLAN FEATURE LIST: "SOCIAL MEDIA POSTS — COMING SOON" ADDED

**6 October 2026 · branch `main`, local. Pushed: no. Deployed: no. Nothing written to the database.**

Display only. No gating, no feature keys, no prices, no other items changed. The reorder recorded in
the previous version of this file is kept intact.

---

## WHAT WAS ADDED

One row, in the one shared list — `lib/plan-features.ts`, `FEATURE_SECTIONS`:

```ts
{ name: 'Social media posts',
  detail: 'Upload your designs — we add your dates, places and times for each week and event automatically.',
  starter: false, pro: 'coming_soon', max: 'coming_soon' },
```

⚠️ **The description was reworded on 6 October**, after the row landed, to
*"Upload your designs — we add your dates, places and times for each week and event automatically."*
It says what the operator does and what we do, in that order, which the first wording did not.
⚠️ **One character was added to your text: the full stop.** All 32 details in this list end with one,
and a single row without would be visible. Say if you want it bare.

| | |
|---|---|
| **Section** | `Online sales & automation` — where the Pro-tier rows live |
| **Position** | directly **above** "Take payment on your phone" |
| **Starter** | — (absent, as instructed: nothing below Pro) |
| **Pro · Max · Trial** | **Coming soon** |
| **Description** | rendered in the list's existing description style (`f-desc` on the landing, the `text-xs text-slate-600` sub-line on Billing) |

⚠️ **Trial has no entry of its own.** `trialFeatureValue()` returns `row.max` for every row but two
("Online ordering — Pay at Hatch" and "SMS order alerts"), so the Trial column follows Max here. That
is asserted rather than assumed — the harness names both exceptions.

---

## ⛔ MY FIRST ATTEMPT WAS WRONG, AND YOUR CORRECTION IS THE BETTER DESIGN

I first built it as the brief read literally: **`pro: true, max: true` with ticks, plus a new "Coming
soon" badge beside the name** — a `comingSoon` flag on the row type, a shared Tailwind pill for Billing
and Admin, `soon-inline` on the landing, and a new `.f-soon` rule in the PDF.

You corrected it mid-build: *"'coming soon' should be mentioned in the table not have ticks so it's
consistent with other items… all tables should agree applying DRY."* That is right on three counts, and
the third one I had already flagged as a hazard in my own code comment:

1. **Consistency.** Every other unbuilt row in this table — "Messenger & Instagram auto-replies", "SMS
   order alerts", "Take payment on your phone", "Customer-facing display", "Digital loyalty stamp
   cards" — says *Coming soon* **in the cells**. A row saying the same thing a second way would be one
   table describing one state in two languages.
2. **DRY.** `'coming_soon'` is already understood by **all four renderers**. Adding the row therefore
   changed **one file and nothing else** — where the badge version added four new call sites across
   three styling systems (landing CSS, Tailwind, the PDF's inline CSS) for a single fact.
3. ⛔ **And ticks would have been unchecked.** `findPlanParityViolations()` only inspects rows that have
   a `ROW_FEATURE_MAP` entry — it `continue`s past an unmapped row rather than failing. A hard `true`
   on an unbuilt row with no feature key would have been a promise **nothing verified**. A
   `'coming_soon'` cell is explicitly exempt from that guard because it promises nothing.

**The badge approach was reverted completely** — `git checkout` of all five files — and rebuilt as a
single row. The whole diff is now:

```
 lib/plan-features.ts | 26 ++++++++++++++++++++++++++
 1 file changed, 26 insertions(+)
```

…of which 25 lines are the comment explaining the above. **One row of data, no render-site code.**

---

## ⛔ ONE THING I STOPPED AND ASKED ABOUT FIRST

The brief said *"the LAST item in each of those plan lists"*. This table is **not split per plan** — it
is one list with Pro/Max/Trial as **columns** and three section headings — so "last" had two readings
that disagreed about which heading the row lands under:

| Reading | Lands under |
|---|---|
| last row of the **whole table** | `Max tier` — while being a Pro feature |
| last row of **`Online sales & automation`** | a heading that fits it |

The first would have recreated exactly what you had me fix the day before, when **"Private events" was
moved *out* of `Max tier`** for being the only Pro-tier row under that heading. **You chose `Online
sales & automation`**, and then refined the position to *above "Take payment on your phone"*.

I also asked whether the landing page's two hand-written **pricing cards** should get the bullet.
**You said no — table only.** They are unchanged.

---

## THE SECTION, BEFORE AND AFTER

`Online sales & automation` — the other two sections are untouched.

| Before | After |
|---|---|
| Offline Order Protection | Offline Order Protection |
| Online payments | Online payments |
| Advance pre-ordering | Advance pre-ordering |
| Pre-order deadline | Pre-order deadline |
| Customer time slot selection | Customer time slot selection |
| Smart Slot Management | Smart Slot Management |
| Automated stock countdown | Automated stock countdown |
| Auto-accept online orders | Auto-accept online orders |
| Branded QR code | Branded QR code |
| Private events | Private events |
| WhatsApp auto-replies | WhatsApp auto-replies |
| Messenger & Instagram auto-replies | Messenger & Instagram auto-replies |
| | 🟢 **Social media posts** ← added |
| Take payment on your phone | Take payment on your phone |
| Advanced reporting | Advanced reporting |
| SMS order alerts | SMS order alerts |

⚠️ "WhatsApp auto-replies" is a conditional row — its own row only while `WHATSAPP_LIVE` is on (it is).

**The reorder from the previous build is intact:** "Private events" directly after "Branded QR code",
"Custom event types & pricing" directly after "Schedule page on your own website". Both still asserted.

---

## ALL FOUR TABLES AGREE — BECAUSE NONE OF THEM WAS TOUCHED

`lib/plan-features.ts` → **`FEATURE_SECTIONS`**, rendered by:

| File | Surface | How it draws a `coming_soon` cell |
|---|---|---|
| `app/landing/page.tsx` | the public comparison table | `cellLabel()` → `'Coming soon'`, in `.soon` |
| `app/manage/[token]/page.tsx` | **Billing** | `val === 'coming_soon'` → italic grey "Coming soon" |
| `app/admin/page.tsx` | the admin plan view | `val === 'coming_soon'` → "Coming soon" |
| `lib/plans-pdf.ts` | the plans PDF | `cellHtml()` → `class="soon"` |

**Every one of them already handled the value**, which is the whole argument for using it. The harness
asserts all four still do, so a renderer that quietly stopped would fail rather than silently disagree.

### Rendered, and what I could not render

🔴 **The landing page: rendered for real.** `npx next start -p 3123` (PID recorded, stopped by that
PID), `curl -H "Host: hatchgrab.com"`, and the row read out of the returned HTML:

```html
<div class="cmp2-row">
  <div class="cmp2-label">
    <span class="f-name">Social media posts</span>
    <span class="f-desc">Upload your designs — we add your dates, places and times for each week and event automatically.</span>
  </div>
  <div class="cmp2-cell"><span class="soon">Coming soon</span></div>   <!-- Trial   -->
  <div class="cmp2-cell"><span class="no">—</span></div>               <!-- Starter -->
  <div class="cmp2-cell"><span class="soon">Coming soon</span></div>   <!-- Pro     -->
  <div class="cmp2-cell"><span class="soon">Coming soon</span></div>   <!-- Max     -->
</div>
```

…sitting directly above "Take payment on your phone", with the column order confirmed from the table
header (**Trial · Starter · Pro · Max**).

⚠️ **Billing I could not open, and I will not claim otherwise.** `/manage/<token>` needs an operator
session and your rules forbid writing to the database, so I cannot mint one. (The plans PDF route is
admin-gated and returns 404 without a session — correctly.) What stands in its place: Billing reads the
**same array** and draws `'coming_soon'` with its own branch, both asserted — and this change added no
render-site code at all, so there is nothing new in Billing that could differ.

---

## CHECKS

| | |
|---|---|
| `tsc --noEmit` | clean |
| `npx next build` | ✓ compiled |
| **ESLint** | identical to baseline, measured both ways |
| **Full sweep** | `node scripts/run-harnesses.cjs` — **95 run, 95 passed, 0 failed** |

### `scripts/plan-feature-order.cjs` — extended

**27 checks** (was 22). The new ones:

- the row is **Coming soon on Pro and Max, absent from Starter** — ⛔ *"if somebody promotes this to
  `true` without giving it a feature key, that is an unchecked promise and this fails"*;
- the Trial column follows Max, asserted by naming the two rows that are exceptions;
- the row has **no `ROW_FEATURE_MAP` entry** — asserted as an absence on purpose: a key would make the
  cells enforceable, and the cells say "coming soon", which `canAccess` cannot grant;
- **exactly one coming-soon mechanism exists** (`!/comingSoon/`), so the badge idea cannot creep back
  as a second thing to keep in step;
- **every renderer still knows how to draw a `coming_soon` cell** — the DRY claim, checked;
- the full pinned list updated to include the new row in its position.

⚠️ **One harness bug found and fixed while doing that.** The "no feature key" check sliced the source
from `indexOf('ROW_FEATURE_MAP')` — which is first **mentioned in a comment at the top of the file** —
so the slice covered almost the whole file, found the row in it, and failed on correct code. Anchored
on the declaration now. **Fifth time this project has met a slice whose anchor was not where it looked.**

---

## Files

| File | |
|---|---|
| `lib/plan-features.ts` | one row added; 25 lines of comment recording why it is a `'coming_soon'` cell and what must change the day it ships |
| `scripts/plan-feature-order.cjs` | the new row pinned, plus five checks about its state and the DRY claim |

## Open items for you

| | |
|---|---|
| **Deploy** | not done — you deploy by hand |
| ⛔ **The day Social media posts ships** | it needs a `Feature` key, a `ROW_FEATURE_MAP` entry **and** `true` cells — all three together. With only the ticks it becomes a promise `findPlanParityViolations()` does not check. The code comment and the harness both say so |
| ⚠️ **The landing pricing cards** | still unchanged, as you chose. They are hand-written per-plan bullet lists that nothing checks against the table, so the Pro card does not mention Social media posts while the table on the same page does |
