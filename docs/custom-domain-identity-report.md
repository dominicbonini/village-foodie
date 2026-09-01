# The custom-domain page — logo prominence and the brand line

**Workstream:** custom-domain-page — logo prominence and the brand line
**Date:** 29 August 2026
**Deploys:** frozen. Nothing deployed, no migration run, no column dropped, no domain removed from Vercel, no credential added. Pizzeria Gusto untouched — **no database write of any kind was made in this workstream.**
**Scope:** `TruckIdentity` and `PoweredBy` in `components/embed/EmbedParts.tsx`. Nothing else.

---

## 1. Who renders these — the read that gated the work

**Confirmed: `app/domain/page.tsx` is the only caller of either, and it renders each twice.** Nothing else in the tree renders them, so there was no stop condition.

| Component | Every call site |
|---|---|
| `TruckIdentity` | `app/domain/page.tsx:184` (lapsed-plan fallback) · `app/domain/page.tsx:202` (normal render) |
| `PoweredBy` | `app/domain/page.tsx:195` (fallback) · `app/domain/page.tsx:207` (normal) |

`:181` is `if (!planGrants) {`, so `:184`/`:195` are the fallback and `:202`/`:207` the normal render — **the same two-renders-of-TruckIdentity finding as the last read, still holding.**

⚠️ **TWO NEAR-MISSES IN THE GREP, NAMED SO THEY ARE NOT MISTAKEN FOR CALLERS:**

1. **`truckLogoUrl` matches in `app/admin/page.tsx:726`, `app/dashboard/[token]/page.tsx:3002` and `app/manage/[token]/page.tsx:599` are a different thing entirely** — a *prop* named `truckLogoUrl` on `components/shared/AppHeader.tsx`, not this file's exported function. `AppHeader` does not import from `EmbedParts`.
2. **`app/embed/[slug]/EmbedSchedule.tsx` still exists** after the V11.49 route deletion, but **imports nothing from this file** and renders neither component — grepped and confirmed. The only other reference to `EmbedParts` anywhere is a prose mention in a `lib/custom-host.ts` comment.

---

## 2. The truck identity — logo above the name

**Before:** a 44px round logo *beside* the name in a flex row, 16px name.
**After:** a column — logo above, name beneath, both centred.

```
logo   h-24 (96px)  ·  sm:h-28 (112px)  ·  w-auto  ·  max-w-[80%]  ·  object-contain
name   text-lg / sm:text-xl   with a logo
       text-2xl / sm:text-3xl without one
```

**Measured in a real browser on the live page** (`events.testtruck.test:3000`, Thai Kitchen, whose upload is 1000×1000):

```
phone 390    logo box  96x96    name 18px w700
desktop 1440 logo box 112x112   name 20px w700
```

That is **2.2× the old 44px** on phone and **2.5×** on desktop.

### 🔴 The circular crop is gone, and that is a consequence of the size

`rounded-full` on an `object-contain` box letterboxes any non-square image inside a circle. At 44px that is invisible; at 96px a **wide wordmark — which is what most food-truck logos are** — becomes a thin strip floating in a large empty ring with a border drawn around mostly nothing. A height-capped `w-auto` box respects whatever shape they uploaded rather than imposing ours.

### How each shape behaves — measured, not asserted

Four synthetic logos were loaded into the live element at both widths:

```
                        natural      rendered box   overflow   scale
WIDE wordmark 1000x200  1000x200     293x96  (ph)   no         x0.29
                                     538x112 (dt)   no         x0.54
TALL crest    200x1000  200x1000      19x96  (ph)   no         x0.10
                                      22x112 (dt)   no         x0.11
SQUARE       1000x1000  1000x1000     96x96  (ph)   no         x0.10
LOW-RES tiny    80x40   80x40        192x96  (ph)   no         x2.40
                                     224x112 (dt)   no         x2.80
```

- **WIDE** — `max-w-[80%]` binds before the height does. At phone the container is 366px and the box caps at exactly 293px. **Nothing overflows at any width.** ⚠️ **One correction to my own reasoning:** I had written that a wide logo "renders shorter than 96px". The *ink* does, but the **box stays 96px tall** and the image letterboxes vertically inside it. The visible result is right; my description of it was not.
- **TALL** — a 1:5 crest renders **19px wide**. That is aspect-preservation working exactly as intended and nothing is cropped, but it is honestly a sliver. ⚠️ **It is not a regression** — under the old 44px circle the same logo rendered ~9px wide, so it is now 2.2× larger. A logo that extreme is rare; a fixed-size box would make every logo the same footprint at the cost of reintroducing letterboxing for everyone, which is the trade I did not take.
- **LOW-RESOLUTION** — 🔴 **this one genuinely gets worse and there is no markup fix.** An 80×40 upload is now scaled **×2.4 on phone and ×2.8 on desktop**, where at 44px it was near 1:1. It will look soft. It is the real cost of the change, mitigated only by choosing 96/112px rather than the largest size that would fit. The durable fix is a minimum-resolution check at upload, which is not this workstream. **Both real trucks are unaffected** — Thai Kitchen's upload is 1000×1000 and Pizzeria Gusto's is 1600×1280, so both *downscale*.

### 🔴 Both branches are deliberate, not one plus a fallback

With no upload **the name is the identity**, so it renders larger than it does under a logo:

```
no logo, phone 390     name 24px w700, centred, box 160x30, images in block: 0
no logo, desktop 1440  name 30px w700, box 201x38
```

A name set at the size it would take *beneath* a logo reads like an image failed to load. Set as the masthead itself, it reads as a decision. **Both branches were rendered from the real component** — markup quoted in §5.

⚠️ **THE `text-center` ON THE `h1` REVERSES AN EARLIER NOTE THAT ARGUED AGAINST IT.** That note was right for a row — a wrapped name beside a logo does read better ranged left under itself. In a centred column a ranged-left second line would be visibly off-axis under the logo. **The reasoning changed because the layout did**, and the comment now says so rather than sitting there contradicting the code.

⚠️ **THE `width={44} height={44}` ATTRIBUTES WERE REMOVED** — they cannot be replaced with fixed numbers when the aspect ratio is an arbitrary upload. **Vertical space is still reserved**, because `h-24` fixes the height in CSS before load; only the width settles. Measured on the live page: **cumulative layout shift 0.0017**, well below the 0.1 "good" threshold.

---

## 3. The brand line — the email treatment, found and quoted

🔴 **IT EXISTS. `lib/email.ts:416`**, in the order confirmation — the version customers see most:

```html
<p style="text-align:center;margin-top:20px;font-size:11px;color:#94a3b8">
  Powered by <a href="https://hatchgrab.com"
                style="color:#ea580c;text-decoration:none;font-weight:700">HatchGrab</a>
</p>
```

**A second in-app twin agrees** — `app/dashboard/[token]/page.tsx:5322`:

```jsx
<p className="text-xs text-slate-500 mt-1">Powered by <span className="font-semibold text-orange-600">HatchGrab</span></p>
```

Both are: **grey "Powered by", the word "HatchGrab" in brand orange, bold, no underline.** They differ only in weight (700 email / 600 app); the email is the named source, so 700.

**Result:**

```jsx
<p className="mt-5 text-center text-xs text-slate-500">
  <a href={process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'}
     className="transition-colors hover:text-slate-700">
    Powered by <span className="font-bold text-orange-600">HatchGrab</span>
  </a>
</p>
```

### 🔴 The email's hex and the app's token are no longer the same colour

**Painted to a canvas and read back as sRGB bytes, not assumed:**

```
"HatchGrab" as rendered   #f54a00
the email's #ea580c       #ea580c     ⚠️ NOT a match
"Powered by" as rendered  #62748e
slate-500                 #62748e     ✅
```

`#ea580c` **was** `orange-600` under Tailwind v3. **This project is on Tailwind 4.3.1, whose `orange-600` paints `#f54a00`.** Copying the email's literal hex would have put a different orange on this one word from every other orange on the same page — `components/TruckListCard.tsx` renders the event dates, links and the Pre-order button in `text-orange-600` too. **So the token is correct here and the hex would have been wrong**, and what is copied is the *treatment*, not the literal value.

⚠️ **`lib/brand.ts:49` still describes "the app's orange-600 (#ea580c, 3.56:1)". That line predates the v4 upgrade and is now stale.** Flagged, not edited — outside this scope.

### Two deliberate departures, both stated

1. **Size is not taken from the email.** The email is also 11px, which is the very thing this change was asked to fix. `text-xs` (12px) with `slate-500` is **the dashboard twin's** size and grey, so the size still comes from an existing treatment rather than being invented. `mt-5` is the email's 20px.
2. **The whole line stays the link.** The email links only the word. Narrowing the anchor would shrink the tap target to roughly 70×12px on a phone, and the brief says the link *stays* — so the extent is unchanged and only the styling is copied. **Say the word and it becomes `Powered by <a>HatchGrab</a>` exactly as the email has it.**

**The href, target and helper are unchanged:**

```
BEFORE  href={process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'}
AFTER   href={process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'}
rendered: <a href="https://www.hatchgrab.com" class="transition-colors hover:text-slate-700">
```

**No `target`, no `rel`** — confirmed from the rendered markup, preserving the same-tab decision the file already documents. ⚠️ A `grep -c 'target="_blank"'` returns 1 both before and after, but **that is the comment text explaining why there is no target**, not an attribute; the render is the proof.

---

## 4. Does this tip the balance toward us?

**No — it tips further toward the operator, and the one element pulling the other way is small and at the foot.**

- The logo went from a 44px avatar to a 96–112px masthead, and the name grew with it. **That is a large, above-the-fold gain for their identity.**
- The brand line went from 11px slate-400 to 12px slate-500 with one bold orange word. **It is a credit, not a banner:** one word, 12px, below the schedule, same-tab, no logo of ours anywhere on the page.

⚠️ **The honest caveat: the orange is the page's accent colour**, shared with the Pre-order button and the event dates, so "HatchGrab" now carries the same colour as the page's calls to action. It is the smallest text on the page and sits last, so it reads as attribution — **but it is the one change that pulls toward us, and if you would rather it were quieter, dropping `font-bold` to `font-semibold` (the dashboard twin's weight) is the one-word change.**

---

## 5. Verification

I performed **parse**, **typecheck** and **execution**. All three, in those words.

**Parse.** Both edits were applied by anchored, asserted replacement, each asserting its anchor occurs exactly once before writing.

**Typecheck.** `npx tsc --noEmit` — clean. `npx eslint components/embed/EmbedParts.tsx` — **exit 0**. ⚠️ An earlier run of mine printed "exit: 1"; that was my own shell reading the exit code of a `grep` in the pipeline, not eslint. Re-run directly, eslint is clean.

**Execution.** The real component was transpiled and rendered through `react-dom/server`, and the live page was loaded, measured and screenshotted in a real browser at 390px and 1440px.

### Both branches, rendered from the real component

**Branch 1 — `logo_storage_path` set:**

```html
<div class="mb-4 flex flex-col items-center gap-3">
  <img src="https://…/truck-media/pizzeria-gusto/logo.jpg" alt="Pizzeria Gusto"
       class="h-24 w-auto max-w-[80%] object-contain sm:h-28"/>
  <h1 class="text-center text-lg font-bold leading-tight text-slate-900 sm:text-xl">Pizzeria Gusto</h1>
</div>
```

**Branch 2 — `logo_storage_path` null:**

```html
<div class="mb-4 flex flex-col items-center gap-3">
  <h1 class="text-center text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">Pizzeria Gusto</h1>
</div>
```

**`PoweredBy`:**

```html
<p class="mt-5 text-center text-xs text-slate-500">
  <a href="https://www.hatchgrab.com" class="transition-colors hover:text-slate-700">
    Powered by <span class="font-bold text-orange-600">HatchGrab</span>
  </a>
</p>
```

⚠️ **Branch 2 was measured by injecting that exact markup into the live page**, so it inherited the real compiled stylesheet — the live truck has a logo, so branch 2 does not occur there naturally. **No database write was made to force it.**

### Scope — byte-identical

```
✅ app/embed/[slug]/EmbedSchedule.tsx  — byte-identical   (the schedule list)
✅ components/TruckListCard.tsx        — byte-identical   (the event cards)
✅ app/domain/page.tsx                 — byte-identical   (the calling page)
✅ Shell        (inside the edited file) — byte-identical
✅ truckLogoUrl (inside the edited file) — byte-identical
```

**One file changed: `components/embed/EmbedParts.tsx`**, and within it only `TruckIdentity` and `PoweredBy`.

---

## 6. What remains unobserved

1. **No real device** — headless Chromium only. A physical phone may render the logo's edges differently, and a low-resolution upload's softness is best judged on a real screen.
2. **Only two real logos exist to test with**, both high-resolution squares. The wide, tall and low-resolution cases were **synthetic SVGs injected into the live element** — the measurements are real, the logos are not.
3. **No production build.** Measured against the dev server.
4. **The lapsed-plan branch of the page was not exercised end to end** — `TruckIdentity` renders identically in both, and the component was rendered directly, but the `!planGrants` page was not loaded in a browser in this workstream.
5. **Contrast of `#f54a00` on white was not measured.** `lib/brand.ts` records an accessibility backlog item against the old orange-600; whether the v4 value improves or worsens that is unchecked, and the word is bold 12px rather than body text.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** The one tension was between "copy the email treatment" and "it stays a link, same target, same helper" — resolved by copying the email's *styling* while leaving the link's extent alone, since the brief's only statement about the link is that it stays. Both readings are recorded in §3 with the one-line change to switch.
