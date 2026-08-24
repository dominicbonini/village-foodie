# Cost comparison — chrome, CTAs and DRY extraction

**Date:** 23 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` NOT run.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

**Files:** created `components/landing/LandingNav.tsx` and `components/landing/LandingFooter.tsx`;
edited `app/landing/page.tsx`, `app/landing/cost/page.tsx`, `app/landing/cost/CostComparison.tsx`.

---

# §0 — DIAGNOSIS BEFORE EXTRACTING

| | Header (`<nav>`) | Footer |
|---|---|---|
| **Already a component?** | 🔴 **No — inline JSX**, 42 lines | 🔴 **No — inline JSX**, 46 lines |
| **Depends on** | `HEADER_BG`, `HatchGrabWordmark`, **`DemoCta`** | `HEADER_BG`, `HatchGrabWordmark`, `PRIVACY_PATH`, `TERMS_PATH` |
| **Interactive?** | ✅ **No.** No mobile-menu state, no scroll state — the responsive behaviour is pure CSS (`nav-hide-sm`, `nav-only-sm` and media queries in `landing.css`) | ✅ **No** |
| **Server or client?** | **Server component that renders one client child** (`DemoCta`) | **Pure server component** |
| **Already shared?** | ✅ No — neither existed elsewhere, so nothing was duplicated |

## 0.a 🔴 TWO DEPENDENCIES THAT ARE INVISIBLE FROM THE MARKUP AND FATAL IF MISSED

**1. `landing.css` is scoped entirely under `.hg-landing` — 195 of 195 rules.** The wrapper is applied on
the landing at `page.tsx:116`, together with three `next/font` CSS variables. **Outside that wrapper the
extracted chrome renders as unstyled markup** — no nav height, no layout, no breakpoints.

**2. 🔴 ONE OF THOSE RULES IS `.hg-landing * { margin: 0 }`.** That is why the wrapper on the cost page
goes round **the chrome only, never round the calculator**: it would strip every Tailwind margin the
calculator uses — `mt-3`, `mt-5`, and the `space-y-3` stacks, which are margins on children.

⚠️ **This is not speculation. The landing's own footer comment records it happening:** *"`.hg-landing *
{ margin: 0 }` in landing.css ties Tailwind's `mx-auto` on specificity and wins on source order, so
`mx-auto` here was silently doing NOTHING."* **The same rule would have silently flattened the
calculator, and it would have looked like a spacing bug, not a scoping one.**

**3. The nav contains `DemoCta`, and `useDemoModal()` THROWS without a provider:**
`throw new Error('DemoCta/DemoModal must be inside <DemoModalProvider>')`. **A runtime error, not a
silent fallback.**

---

# §1 — TASK 1: THE EXTRACTION, AND THE PROOF

## 1.a 🔴 I COULD NOT CAPTURE RENDERED MARKUP, SO I PROVED THE JSX INSTEAD

**`next dev` was not run**, per scope, so there is no before/after HTML to diff. Your brief anticipated
this: **prove the JSX is byte-identical apart from its new location.** Done, and precisely:

```
  nav     re-indented component JSX == original block : True
  footer  re-indented component JSX == original block : True
```

**Method:** the two blocks were cut from the landing by line range, every line verified to share the
6-space base indent (**0 exceptions in either block**), dedented by a uniform 4 spaces into the
components, then **re-indented by 4 and compared to the original text.** ✅ **Exact string equality.**

✅ **A uniform indent shift is the one transformation JSX provably does not render** — leading
whitespace on element lines is not emitted. **Nothing else changed: same elements, same classes, same
hrefs, same comments.**

## 1.b ✅ THE LANDING PAGE'S COMPLETE DIFF — 91 REMOVED, 6 ADDED, NOTHING ELSE

```
  every ADDED line:
     +// Chrome EXTRACTED 23 August 2026 so /landing/cost renders the same nav and footer from one definition.
     +// 🔴 MOVED, NOT REWRITTEN — proven byte-identical; see docs/cost-comparison-chrome-report.md §1.
     +import { LandingNav } from '@/components/landing/LandingNav'
     +import { LandingFooter } from '@/components/landing/LandingFooter'
     +      <LandingNav />
     +      <LandingFooter />

  removed lines that are NOT part of the two extracted blocks:
     -import { HEADER_BG } from '@/lib/brand'
     -import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
     -import { PRIVACY_PATH, TERMS_PATH } from '@/lib/legal'
```

**88 of the 91 removed lines are exactly the two extracted blocks** (42 + 46). ✅ **The other three are
imports the extraction orphaned** — verified unused in the landing body afterwards (0 references each,
comments stripped) — and **removing an unused import is compile-time only and cannot change rendered
output.** Your verification step asked me to confirm no orphaned imports; leaving them would have failed it.

✅ **`DemoCta`, `DemoModal`, `DemoModalProvider`, `PLAN_META` and `Image` all remain in use** on the
landing (10 / 1 / 2 / 4 / 1 references), so their imports stayed.

🔴 **I did not "improve" anything.** No class renamed, no link changed, no comment reworded.

---

# §2 — THE COST PAGE'S STRUCTURE

```tsx
<DemoModalProvider>
  <div className={CHROME}><LandingNav /></div>
  <CostComparison />
  <div className={CHROME}><LandingFooter /><DemoModal /></div>
</DemoModalProvider>
```

where `CHROME = 'hg-landing ' + the three next/font variable classes`.

## 2.a ✅ EXACTLY ONE PROVIDER IN THE TREE — COUNTED, NOT ASSUMED

```
  app/landing/cost/page.tsx           <DemoModalProvider>: 1   <DemoModal />: 1   <DemoCta: 0
  app/landing/cost/CostComparison.tsx <DemoModalProvider>: 0   <DemoModal />: 0   <DemoCta: 0
  components/landing/LandingNav.tsx   <DemoModalProvider>: 0   <DemoModal />: 0   <DemoCta: 1
  components/landing/LandingFooter.tsx …: 0                    …: 0               …: 0
```

**The calculator's own provider and modal were removed and moved up**, so the one provider wraps both the
nav and the calculator. **Not nested.**

⚠️ **THE FONTS ARE DECLARED IN THE COST PAGE, NOT IMPORTED FROM THE LANDING.** Moving the landing's
`next/font` declarations into a shared module would change the generated class names in **its** rendered
markup — the one thing this task must not do. Two instances of the same config produce the **same CSS
variable names**, so the chrome styles identically, and `next/font` deduplicates the font files.

## 2.b 🔴 A CONSEQUENCE YOU SHOULD DECIDE ON: THE SHARED NAV STILL SAYS "UPLOAD MY MENU"

The extracted nav contains the landing's own CTA, `<DemoCta>Upload my menu →</DemoCta>`. **It came across
verbatim because Task 1 said extract, not redesign.**

⚠️ **So the cost page now carries, in its header, the exact action Task 2 removed from its body** — and
the reasoning you gave for removing it (a file upload is the wrong ask for someone who has already
entered their figures) **applies to the header too.**

**I did not change it**: parameterising the nav's CTA is an improvement Task 1 forbids, and it is a
product decision. 🔴 **It is also why `DemoModalProvider` and `DemoModal` are still required on this
page** — Task 4's "remove them if `DemoCta` is unused" condition is not met, because the nav uses it.
**Two options if you want it gone: give `LandingNav` an optional CTA slot, or accept it as site chrome.**

---

# §3 — TASK 2: THE PRIMARY CTA

✅ **`/signup` CONFIRMED REACHABLE AND UNGATED**, three ways: no `app/signup/layout.tsx`; no
`verifyAdmin`/`redirect` inside `app/signup/page.tsx` (0 occurrences); and `proxy.ts` lists
`pathname.startsWith('/signup')` in its **explicit public-routes** set. **`/contact` likewise has no
gate** — the landing layout's own comment already relies on it being *"PUBLIC, UNGATED, INDEXABLE"*.

**The CTA is now a plain `<a href="/signup">`, not a `DemoCta`.** Your reasoning is recorded at the site
so it is not converted back.

## 3.a The fallback label — I chose **"Start free →"**

```
  save=   472.1  ->  "Start free and save £472 →"
  save=   0.004  ->  "Start free →"
  save=       0  ->  "Start free →"
  save=    -350  ->  "Start free →"
```

**Why that wording:** it names the same action as the positive branch (so the button does not appear to
do two different things), **makes no saving claim**, and **no longer promises a demo** — the previous
"Try it with your menu →" pointed at an upload that is no longer what the button does.

✅ **The `isRealSaving` guard is unchanged**, so the sub-penny case still takes the fallback.

---

# §4 — TASK 3: THE CONTACT CTA

```tsx
<div className="flex flex-col gap-2 p-4 sm:flex-row sm:gap-3">
  <a href="/signup"  className={`${CTA_PRIMARY} flex-1 px-6 py-4 text-lg`}>…</a>
  <a href="/contact" className={`${CTA_SECONDARY} flex-1 px-6 py-4 text-lg`}>Talk to us</a>
</div>
```

- **Secondary is an outline, not a second fill:** `border-2 border-slate-300 bg-white text-slate-700`.
  ⚠️ **Two orange buttons side by side would compete and the eye would have to choose**; the muted one
  reads as the alternative it is.
- **`flex-col` below 640px, `sm:flex-row` above.** At 375px two buttons on one row would leave each about
  150px; stacked, each gets the full width.
- ✅ **The cream "No card needed to set up · Keep your own customers" line still sits below them**,
  unchanged.

⚠️ **THE HERO CARD'S BAND HAS CHANGED CHARACTER.** It was a full-bleed orange bar edge to edge; it is now
a padded white area holding two buttons. **That is what a second, secondary action requires** — but it is
a visible change to the card you have already seen, not just an addition.

---

# §5 — TASK 4: THE BOTTOM CTA, AND ITS SPACING

**Now `<a href="/signup">Start free →</a>`**, same destination as the primary, `CTA_PRIMARY` fill,
`block w-full px-6 py-4 text-base`.

**Its spacing, so you can judge it:**

```
  line 442:  <p className="mt-5 text-xs leading-relaxed text-slate-500">   ← the small print
  line 453:  <a  className={`${CTA_PRIMARY} mt-6 block w-full px-6 py-4 text-base`}>
```

**24px (`mt-6`) below the small print, which itself sits 20px (`mt-5`) below the results card.**

🔴 **I did not change it, and the reason is your own instruction not to add arbitrary spacing.** ⚠️ **But
that 24px is still the only gap on the page never set against something visible** — it was chosen while
the button was invisible and has been carried through two tasks unexamined. **It is now a full-width
orange button under a paragraph of small print; if it reads as crowded, `mt-6` is the number to move.**

## 5.a `DemoCta` is gone from the calculator, but the provider stays

```
  DemoCta / DemoModal / DemoModalProvider / CTA_CLASS in CostComparison.tsx code: 0 / 0 / 0 / 0
```

✅ **The import was removed with them — no orphaned imports in any of the five files** (checked by
matching every imported name against its file's body).

---

# §6 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Landing JSX unchanged | re-indent the component body, compare to the original block | ✅ **exact string equality, both** |
| Landing page's whole diff | full `difflib` | ✅ **88 block lines + 3 dead imports out, 6 lines in** |
| Rendered-markup capture | 🔴 **not possible without the dev server** | see §1.a |
| Exactly one provider | element counts across all four files | ✅ **1** |
| No orphaned imports | every imported name matched against its body | ✅ **none, in all five files** |
| `/signup` ungated | layout, page and `proxy.ts` public list | ✅ **reachable** |
| Fallback label | exercised across 4 savings | ✅ **"Start free →"** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not offered as verification** |
| Character census | NUL / control / carrier-aware selectors | ✅ **clean across all five files** |

---

# §7 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** `next dev` was not run. **The landing has not been loaded since the
   extraction**, and the byte-identity proof is at the JSX level, **not the HTML level.**
2. 🔴 **THE `.hg-landing` SCOPING ON THE COST PAGE IS THE BIGGEST UNKNOWN.** The chrome is wrapped and
   the calculator is not — **that is the correct shape by the CSS, but it has never been seen.** Two
   things could still be wrong and only a browser will say: whether the nav renders at full width outside
   the landing's own page structure, and whether the fonts resolve from a second `next/font` instance.
3. 🔴 **THE MODAL HAS NEVER BEEN OPENED FROM THE SHARED NAV.** You confirmed it works from the old
   in-page CTA; **the nav's `DemoCta` under a provider one level higher is a different tree.**
4. ⚠️ **The two-button band has never been seen**, at any width — including whether an outline button
   beside an orange one reads as secondary or as disabled.
5. ⚠️ **`bg-[#EF8B2C]` still has not been compiled** — carried from the previous report.
6. ⚠️ **Everything else unobserved carries forward:** the range focus ring, 375px behaviour, and the
   gate, which has still never fired.

## 🔴 TWO DECISIONS WAITING ON YOU

- **The nav's "Upload my menu" CTA on the cost page** (§2.b) — the action you just removed from the body.
- **The bottom CTA's `mt-6`** (§5) — still unjudged, now visible.
