# LandingNav — optional CTA slot

**Date:** 23 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` NOT run.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

**Files changed:** `components/landing/LandingNav.tsx` and `app/landing/cost/page.tsx`.
✅ **`app/landing/page.tsx` was NOT touched** — it did not need to be, which was the point.

---

# §1 — 🔴 THE LANDING'S DIFF IS EMPTY

```
  EMPTY — app/landing/page.tsx is byte-identical, and its call site is still <LandingNav />
  sha256 before: e6f092f1004d6c019fee95afc5b808268b5a0eca38783b16d1f186c5a65cf7bb
  sha256 after : e6f092f1004d6c019fee95afc5b808268b5a0eca38783b16d1f186c5a65cf7bb
```

✅ **Not "explained line by line" — there are no lines to explain.** Identical hash, byte for byte.

**That is a direct consequence of the design choice in §2:** the prop is optional and its ABSENCE is the
landing's behaviour, so `<LandingNav />` needed no argument and the landing needed no edit. **Your brief
allowed me to change it if the default required it. It did not.**

✅ **And the default arm is provably the original markup.** The `<DemoCta>` block now sits one level
deeper inside a ternary; reversing that uniform 2-space indent gives exact string equality:

```
  default arm, dedented by 2 == original CTA markup: True
```

---

# §2 — TASK 1: THE PROP SHAPE, AND WHY

```ts
export interface NavCta {
  label: string        // desktop
  shortLabel?: string  // below 640px; defaults to label
  href: string
}

export function LandingNav({ cta }: { cta?: NavCta } = {}) { … }
```

## 2.a 🔴 I CHOSE THE DATA PAIR OVER A ReactNode SLOT, AND THE REASON IS THE CHROME, NOT THE CONTENT

Both are defensible, as you said. **What decided it is what is actually subtle about this control**, and
it is not what it says:

1. **`btn btn-primary nav-cta` — three landing.css classes**, one of which tightens padding below 640px
   (`.hg-landing .nav-cta { padding-inline: .9rem }`).
2. 🔴 **THE TWO-SPAN STRUCTURE IS A MECHANISM, NOT DECORATION.** Read from `landing.css`:
   `.hg-landing .cta-short { display: none }` at line 113, and inside the media query at 117-118 the two
   swap. **The button sheds its arrow and shortens its wording on a phone** — and the nav's own comment
   records why that matters: `.nav-r .btn` carries `white-space: nowrap` because *"the CTA must never
   wrap the header"*, with the layout measured to fit *"~360px with no wrap"*.

🔴 **A ReactNode slot hands all of that to every caller**, whose job becomes "remember four classes and
a span pair". ⚠️ **The failure mode is silent and visual**: a caller who forgets the short label gets a
nav that looks correct on a laptop and wraps on a phone — the class of bug nobody finds until someone
opens it on a phone. **The data pair makes that unforgettable, because the component owns it.**

## 2.b ⚠️ WHAT THE SHAPE CANNOT DO, STATED RATHER THAN DISCOVERED LATER

**It cannot express an arbitrary element**, and the default proves the limit: `<DemoCta>` is a **button
that opens a modal**, not a link. **That is why the default is a BRANCH in the JSX rather than a default
VALUE of the prop** — a `{label, href}` default could not have produced it.

**If a third caller ever needs a button rather than a link, make it a discriminated union then.** I did
not widen it now for a caller that does not exist; the comment at the interface says so.

---

# §3 — TASK 2: THE COST PAGE'S CTA

```tsx
<LandingNav cta={{ href: '/signup', label: 'Start free →', shortLabel: 'Start free' }} />
```

✅ **Same destination as the page's primary action.** ✅ **Same appearance as the landing's nav CTA** —
`btn btn-primary nav-cta` is applied by `LandingNav`, not by the caller, so it cannot drift.

⚠️ **It is chrome, not a fourth CTA, and the comment at the call site says so.** The page already carries
three calls to action — the hero pair and the one under the small print — which is exactly why this one
keeps the nav's own styling rather than competing with them.

⚠️ **The short label drops the arrow** (`Start free`), mirroring the landing's own
`Upload my menu →` / `Upload menu` pair, for the nowrap reason in §2.a.

---

# §4 — TASK 3: THE DEMO WIRING IS GONE FROM THE COST PAGE

## 4.a Counted before removing, as instructed

| File | DemoCta (before → after) | DemoModal | Provider |
|---|---|---|---|
| `app/landing/page.tsx` | 5 → **5** | 1 → **1** | 1 → **1** |
| `app/landing/cost/page.tsx` | 0 → 0 | **1 → 0** | **1 → 0** |
| `app/landing/cost/CostComparison.tsx` | 0 → 0 | 0 → 0 | 0 → 0 |
| `components/landing/LandingNav.tsx` | 1 → **1** | 0 → 0 | 0 → 0 |
| `components/landing/LandingFooter.tsx` | 0 → 0 | 0 → 0 | 0 → 0 |

✅ **Nothing else in the cost page's tree needed the provider**, so there was nothing to stop for.
**The `LandingNav` count stays 1 because the default branch still exists** — it is simply not the branch
the cost page takes.

✅ **The landing's provider, modal and five `DemoCta`s are untouched**, as required.

## 4.b The coupling, recorded at the site

⚠️ **The provider's necessity now depends on a prop.** Drop `cta` from the cost page's `<LandingNav />`
and the nav falls to its default branch, `useDemoModal()` runs with no provider, and it **throws at
render**. **That is a loud failure rather than a silent one, which is the right way round** — but it is a
non-obvious coupling between a prop on one line and an import that is no longer there, so the comment in
`page.tsx` states it explicitly.

## 4.c ✅ NO ORPHANED IMPORTS

```
  components/landing/LandingNav.tsx              orphaned: none
  app/landing/cost/page.tsx                      orphaned: none
  app/landing/page.tsx                           orphaned: none
```

⚠️ **`LandingNav` still imports `DemoCta`, and that is correct** — its default branch renders one. **A
consequence worth naming:** the cost page's module graph therefore still reaches `DemoUpload`, so that
client module is still part of its bundle even though nothing on the page renders it. **Not a
correctness problem** (`useDemoModal` never runs, so nothing throws) **and not fixable without either
splitting the default into a second component or making the landing pass its own CTA** — the latter
being the landing edit this task was designed to avoid. **Recorded, not acted on.**

---

# §5 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Landing unchanged | `diff` + SHA-256 | ✅ **empty diff, identical hash** |
| Default arm unchanged | dedent-reversed string comparison | ✅ **exact equality** |
| Element counts before/after | comment-stripped scan of all five files | ✅ **table in §4.a** |
| Nothing else needed the provider | same scan | ✅ **0 across the cost tree** |
| No orphaned imports | every imported name matched against its body | ✅ **none in all three touched files** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not offered as verification** |
| Character census | NUL / control / carrier-aware selectors | ✅ **clean** |

---

# §6 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** `next dev` was not run. **The landing has not been loaded since the
   extraction or since this change**, and its proof is a file hash — **which is stronger than a visual
   check for "did the source change", and says nothing about "does it still render"**. The two are
   different claims and only one is proven.
2. 🔴 **THE COST PAGE'S NAV CTA HAS NEVER BEEN SEEN.** Whether "Start free →" fits the nav at its
   measured width is the exact thing the short label exists for, and the measurement in the nav's comment
   (~530px of 589px at 640px) was made for *"Upload my menu →"*. **"Start free →" is shorter, so it
   should fit with more room, not less** — but that is arithmetic on someone else's measurement, not an
   observation.
3. ⚠️ **The default branch has not been exercised since it moved inside a ternary.** It is provably the
   same markup; it has not been rendered from the new position.
4. ⚠️ **The modal has never been opened from the shared nav** — and now it cannot be, from the cost page,
   which removes that question there but leaves it open on the landing.
5. ⚠️ **Everything else carries forward:** `bg-[#EF8B2C]` uncompiled, the `.hg-landing` chrome scoping
   unrendered, the range focus ring, 375px behaviour, and the gate, which has still never fired.
