# iPad display defects — sticky re-evaluated, and one change applied

**Date:** 6 August 2026. Supersedes the previous native-shell report.
No `cap sync`, no `next dev`, no `next build`. No garbled spans in the brief.
**Three files changed:** `components/shared/AppHeader.tsx`, and the two shells passing one new prop. **`/admin` untouched — verified.**

---

## PART 1 — INVESTIGATION

## 1. 🔴 RE-EVALUATING "VESTIGIAL" — I WAS RIGHT ABOUT POSITIONING AND WRONG TO IMPLY HARMLESS

My previous call was that `sticky` on `AppHeader` is vestigial inside the app-shell. **The positioning half of that is correct and I stand by it. The implication that it therefore does nothing was not warranted, and the external evidence is what exposes the gap.**

### What `sticky` does, per surface

| Surface | Shell | What `position: sticky` does |
|---|---|---|
| **Dashboard** | [:2262](app/dashboard/[token]/page.tsx#L2262) `h-dvh flex flex-col overflow-hidden` | 🔴 **Never applies an offset.** Its scrollport is that root; the root never scrolls. `<main>` is a **SIBLING, not an ancestor**, so the header is not in `<main>`'s scrollport at all |
| **Manage** | [:511](app/manage/[token]/page.tsx#L511) — byte-identical shell | 🔴 **Same — never applies an offset** |
| **`/admin`** | [:653](app/admin/page.tsx#L653) `min-h-screen`, natural flow | ✅ **LOAD-BEARING.** The document scrolls; sticky is the only thing pinning the header |

### What `z-50` does, per surface — and the trap in removing position

**`z-index` is IGNORED on a `position: static` element.** So `z-50` is only in effect *because* the header is positioned. On all three surfaces `sticky` + `z-50` produces a **stacking context**, which is what makes `shadow-md` paint over the tab bar below.

🔴 **Consequence for any fix: dropping `position` entirely would silently disable `z-50` too.** The header would fall to static, lose its stacking context, and change paint order against the chrome beneath it. **That is why the change below uses `relative`, not nothing.**

### ⚠️ THE PART I PREVIOUSLY UNDERWEIGHTED

`position: sticky` is a **compositing hint**. WebKit promotes a sticky element to its own layer so it can be repositioned on the scrolling thread without a main-thread repaint, **and it does that whether or not the element ever actually moves**. `position: relative` carries no such hint.

**So on the two shells we are paying a compositing promotion for positioning behaviour we do not use.** Your external evidence implicates exactly that construct: sticky/fixed headers disappearing in WKWebView while working in iOS Safari on the same page, and blank regions resolved by removing `position: fixed` after height fixes failed. **Our asymmetry is the same shape.**

⚠️ **I cannot evidence WebKit's promotion rules from this repo** — that is engine internals. What I *can* establish is the first half: **sticky does no positioning work on these two shells, so removing it costs nothing even if the hypothesis is wrong.**

## 2. WHERE `AppHeader` RENDERS — three pages, and only one needs sticky

`grep` for `AppHeader` across `app/` and `components/`: **three render sites.**

| Page | Line | Remove `sticky` (keep z-index)? |
|---|---|---|
| **`/admin`** | [:654](app/admin/page.tsx#L654) | 🔴 **BREAKS IT — twice over** |
| **Dashboard** | [:2329](app/dashboard/[token]/page.tsx#L2329) | ✅ **No visible change** |
| **Manage** | [:517](app/manage/[token]/page.tsx#L517) | ✅ **No visible change** |

**✅ CONFIRMED: `/admin` is the one place it matters — and the dependency is worse than "the header scrolls away".**

`/admin`'s tab bar is [:664](app/admin/page.tsx#L664): `<div className="sticky top-[51px] z-40 …">` — a **hardcoded 51px offset that is the header's height**. Remove sticky from the header and the header scrolls away **while the tab bar keeps pinning itself 51px from the top with nothing above it.** Two broken things, not one.

`/setup`, `/login`, `/app` and the KDS do not render `AppHeader` at all.

## 3. STACKING CONTEXTS AND LIKELY COMPOSITING LAYERS IN THE TWO SHELLS

🔴 **The stated chrome z-order — header 50 > tabs 40 > event bar 30 — is NOT what the CSS produces.**

| Element | Classes | Positioned? | Stacking context? | Needed, or incidental? |
|---|---|---|---|---|
| **Header** | `sticky top-0 z-50 shadow-md` | ✅ sticky | ✅ **yes** | **Context needed** (shadow paints over the tabs). **Sticky incidental** on these two shells |
| **Tab bar** — dashboard [:2396](app/dashboard/[token]/page.tsx#L2396), manage [:537](app/manage/[token]/page.tsx#L537) | `shrink-0 z-40` | 🔴 **NO position** | 🔴 **NO** | 🔴 **`z-40` IS INERT — z-index is ignored on a static element.** It has done nothing since it was written |
| **Event bar** — dashboard [:2446](app/dashboard/[token]/page.tsx#L2446) | `shrink-0 z-30 relative` | ✅ relative | ✅ yes | Context real; `relative` looks deliberate |
| **`<main>`** | `flex-1 min-h-0 overflow-y-auto` | ❌ | ❌ (overflow does not create one) | ⚠️ **But a scroll container is the classic candidate for its own composited layer** |
| **`aside`** — dashboard [:2951](app/dashboard/[token]/page.tsx#L2951) | `hidden lg:block lg:sticky lg:top-0` | ✅ at ≥1024px | ✅ at ≥1024px | ✅ **Load-bearing** — it sticks inside `<main>`'s real scrollport |
| Modals | `fixed inset-0 z-50/60/70` | ✅ | ✅ | Only while open |

**So the chrome's z-order works by accident**: the three bars are non-overlapping flex siblings, so ordering barely matters, and the one z-index that is doing real work (the header's) is the one attached to a positioned element.

⚠️ **A second sticky element sits INSIDE the affected scroller** — the `aside` at [:2951](app/dashboard/[token]/page.tsx#L2951). It is `hidden lg:block`, and **iPad landscape is 1024pt, so `lg:` applies there and not in portrait.** That is genuinely load-bearing and **out of scope** — but it makes *"does the defect occur in portrait as well as landscape?"* a sharp discriminating question, recorded below.

## 4. HEADER LAYER × `<main>` SCROLLER LAYER

**What I can establish:**
- ✅ The header is a **positioned element with a stacking context**, a sibling of `<main>`, both inside an `overflow-hidden` root.
- ✅ `<main>` is a **scroll container**; the header is **not inside its scrollport**, so no scroll offset can ever be applied to the header by `<main>`.
- ✅ **Nothing in the codebase sets any other compositing trigger on either** — see §5.

**What is WebKit internals and I will not assert:** whether a sticky-promoted layer and an adjacent overflow-scroller layer interact, share a tile grid, or can leave one another unpainted. **That is the mechanism the external reports describe, and I have no way to evidence it from source.** I am recording it as the hypothesis it is.

## 5. COMPOSITING / OVERSCROLL CSS — ACTUAL VALUES

| Property | On the shell root | On `<main>` | On the header |
|---|---|---|---|
| `overscroll-behavior` | **not set** | **not set** | **not set** |
| `-webkit-overflow-scrolling` | **not set** | **not set** | **not set** |
| `transform` / `translateZ` | **not set** | **not set** | **not set** |
| `will-change` | **not set** | **not set** | **not set** |
| `isolation` | **not set** | **not set** | **not set** |
| `filter`, `opacity < 1` | **not set** | **not set** | **not set** |

**Repo-wide, `overscroll-contain` appears exactly twice** — [manage:7611](app/manage/[token]/page.tsx#L7611) and [:7897](app/manage/[token]/page.tsx#L7897) — both on **modal** bodies, neither on the shell, `<main>` or the header. `globals.css` sets none of them.

🔴 **So `position: sticky` on the header is the ONLY compositing hint anywhere in the shell chrome.** That is what makes it worth removing where it does nothing.

## 6. THE `add` TAB — 🔴 THREE DIFFERENCES, NOT ONE, AND THE THIRD IS THE BETTER DISCRIMINATOR

[dashboard:2509](app/dashboard/[token]/page.tsx#L2509):

```tsx
activeTab==='add' ? 'overflow-hidden px-4' : 'overflow-y-auto px-4 py-4 pb-20'
```

1. **`overflow-hidden` vs `overflow-y-auto`** — the scroller.
2. **Padding differs**: `py-4 pb-20` on the three broken tabs, none on `add`. ⚠️ Named as instructed. **Not a plausible mechanism** — padding creates no layer and no context.
3. 🔴 **The one you asked for.** [:2963](app/dashboard/[token]/page.tsx#L2963): `<div className={activeTab==='add' ? 'h-full min-h-0 flex flex-col' : 'hidden'}>` wrapping `AddOrderPanel`, **which manages its own inner scroll**.

**So the precise discriminator is not "`<main>` has a different overflow value" — it is WHICH ELEMENT IS THE SCROLL CONTAINER.** On the three broken tabs `<main>` itself scrolls. On `add`, `<main>` is not a scroller at all; the scroller is a nested element deeper in the tree, below the header in a different subtree.

**That is a better discriminator because it is the mechanism, not a proxy for it:** the defect tracks *a composited scroller occupying `<main>`'s slot directly beneath the header*, not the value of an overflow property.

---

## PART 2 — THE CONDITION HOLDS, AND ONE CHANGE IS APPLIED

**Established:** `position: sticky` is functionally inert on the dashboard and manage shells (§1) **and** load-bearing on `/admin` (§2). **That is the stated condition, so the change was made.**

### `components/shared/AppHeader.tsx`

```tsx
sticky?: boolean            // defaults to TRUE
…
className={`bg-slate-900 ${sticky ? 'sticky top-0' : 'relative'} z-50 shadow-md`}
```

- 🔴 **Defaults to `true`, so nothing changes by omission.** `/admin` passes nothing and is byte-identical. Any future render site gets the historical behaviour unless it opts out.
- 🔴 **`relative`, not nothing** — `z-index` is ignored on a static element, so removing position would silently disable `z-50`, drop the stacking context and change paint order against the tab bar and the shadow. `relative` keeps all of that and drops only the compositing hint.
- **`z-50` is untouched**, as instructed. `shadow-md`, the `env(safe-area-inset-top)` padding and every child are untouched.

**Two call sites pass `sticky={false}`:** [dashboard:2330](app/dashboard/[token]/page.tsx#L2330) and [manage:518](app/manage/[token]/page.tsx#L518), each with the reasoning above them.

**✅ `/admin` untouched** — `git status --porcelain app/admin/page.tsx` returns nothing.
**No shell restructuring. The right-hand strip was not touched.**

⚠️ **One self-inflicted error, caught and fixed:** the first attempt put the explanatory `{/* … */}` **between JSX attributes**, which is the TS1005 trap this manual already records. `tsc` failed with six errors; the comment moved above the element and it is clean. Noting it because the manual records the same mistake once already.

---

## 🔴 GUSTO — WHAT CHANGES ON THE WEB

**Nothing visible. Traced, not assumed.**

Gusto reaches the dashboard and manage on the web, where the shells are the same `h-dvh flex flex-col overflow-hidden` markup as in the app.

| | Before (`sticky top-0 z-50`) | After (`relative z-50`) |
|---|---|---|
| **Offset applied** | none — the scrollport (the `overflow-hidden` root) never scrolls | none — `relative` with no `top`/`left` set |
| **Positioned** | yes | yes |
| **`z-50` in effect** | yes | **yes** |
| **Stacking context** | yes | **yes** |
| **`shadow-md` over the tab bar** | yes | **yes** |
| **Layout / box model** | unchanged | **unchanged** — neither value removes the element from flow |

**Both resolve to "the header sits at the top of a column that does not scroll, above everything beneath it."** The only difference is a hint to the compositor, which has no rendered form.

✅ **This is a no-op on web, so I proceeded.** ⚠️ Stated precisely: it is a no-op **as far as the CSS can determine**. If a browser somewhere renders a sticky-but-never-offset element differently from a relative one, that would be a rendering bug rather than a behaviour I have changed — and the `/admin` page, which keeps `sticky`, is the control.

**Android:** identical reasoning, same two shells, no visible change.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT: 0
```

| File | Baseline | Now | |
|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | 93 (68 err, 25 warn) | **93 (68, 25)** | ✅ |
| `app/manage/[token]/page.tsx` | 370 (293, 77) | **370 (293, 77)** | ✅ |
| `components/shared/AppHeader.tsx` | 3 (0, 3) — verified by stashing | **3 (0, 3)** | ✅ |
| `app/admin/page.tsx` | 10 (8, 2) | **10 (8, 2)** | ✅ untouched |

The three AppHeader warnings are pre-existing (`Image` unused, two `<img>` LCP notices).

### What to test on the device

1. **The header defect only.** Open a scrolling tab (Orders / Menu & Stock / Settings), scroll down, scroll back up. **If the header now survives, the sticky compositing hint was the cause.** The right-hand strip is expected to be **unchanged** — it was not addressed, deliberately.
2. **`/admin` is the control.** It keeps `sticky` and is untouched: its header must still pin, and the tab bar must still sit flush beneath it. **If admin regressed, the change was wrong.**
3. ⚠️ **Portrait vs landscape.** The `aside` at [:2951](app/dashboard/[token]/page.tsx#L2951) is a second sticky element **inside** the affected scroller and exists only at `lg:` (≥1024pt) — i.e. **iPad landscape, not portrait**. If the defect occurs in landscape only, that element is the next candidate and this change will not have fixed it.
4. **If the header still disappears**, the `window.scrollY` reading from the backlog still applies: **`> 0` means the document scrolled and the outer WKWebView scroller is the mechanism; `0` refutes it.**

### Scope — confirmed untouched

`lib/commerce-policy.ts` and the purchase-CTA gates · pricing and `hide_pricing` · keep-awake · `HGBridgeViewController.swift`, `Main.storyboard`, `project.pbxproj`, `capacitor.config.*` · `/admin` · both shells' structure · the right-hand strip.

### Not determined

- **Whether WebKit's sticky promotion is the actual cause.** Unevidenced from source; this change is cheap and testable rather than proven. **If it does not fix it, nothing has been lost** — sticky was doing no work on those two pages either way.
- **Nothing was run on a device.** `tsc` and lint prove it compiles and holds its baselines; they prove nothing about the iPad.
