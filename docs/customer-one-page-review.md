# Customer order page as one continuous scroll — review

Date: 14 August 2026
Status: READ-ONLY REVIEW. **No file was edited. No migration. No write of any kind.**
No `next dev`, no `next build`. Nothing here touches Pizzeria Gusto.

**Nothing in the prompt arrived garbled. No instruction contradicted another.**

**HEADLINE:** the mechanics are more favourable than the operator panel's — the chip bar and the section
list **already derive from one post-filter array**, so item 4d's off-by-one does not exist today and
would only be introduced by a careless build. **The hard part is not the scroll; it is the offset.**
`stickyTop` is correct for the header and the demo banner and **wrong whenever a status banner is
showing**, which is a live, reachable state (closed / paused / time-not-set) in which the menu still
renders. Section 2.

⚠️ **Your closing note changes the design and I have reviewed the version you described** — category
headings **in the list but NOT sticky**, with the chip colour carrying "where am I". That removes the
two-level sticky stack, which is a real simplification. It also creates one consequence worth deciding
on before you brief it: **sub-category headings are sticky today and would become sticky orphans.**
Section 2f.

---

## 1. THE CURRENT IMPLEMENTATION

### a. Chip bar, selection state, item filter

**State** — [app/trucks/[slug]/order/page.tsx:275](app/trucks/[slug]/order/page.tsx#L275):
```tsx
const [activeCategory, setActiveCategory] = useState<string | null>(null)  // customer menu category tab
```

**The derived list and the resolved selection** — [:1098-1106](app/trucks/[slug]/order/page.tsx#L1098-L1106):
```tsx
return groupByCategory(menu.items, menu.categories?.map(c => c.name))
…
const menuCategories = useMemo(() => groupedMenu.map(([cat]) => cat), [groupedMenu])
// Default to the first category; self-heal if the active tab disappears (menu reload / now-empty cat).
const selectedCategory = (activeCategory && menuCategories.includes(activeCategory)) ? activeCategory : (menuCategories[0] ?? null)
```

**The chip bar** — [:2434-2450](app/trucks/[slug]/order/page.tsx#L2434-L2450):
```tsx
{menuCategories.length > 1 && (
  <div style={{ top: stickyTop }} className="sticky z-30 -mx-2 px-2 sm:-mx-4 sm:px-4 py-2 mb-2 bg-white border-b border-slate-100">
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
      {menuCategories.map(cat => (
        <button key={cat} onClick={() => setActiveCategory(cat)}
          className={`shrink-0 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-black uppercase tracking-wide transition-colors active:scale-95 ${
            cat === selectedCategory ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}>
          {cap(cat)}
        </button>
      ))}
    </div>
  </div>
)}
```
⚠️ **The bar is not rendered at all when there is one category** — and that fact is load-bearing for the
sub-category heading offset (section 2a).

**The filter** — [:2456](app/trucks/[slug]/order/page.tsx#L2456):
```tsx
{groupedMenu.filter(([category]) => selectedCategory == null || category === selectedCategory).map(([category, items]) => {
```

🔴 **Note what this already is: a `.filter()` over the full grouped list, not an index lookup.** Deleting
the predicate is, mechanically, most of the change — the map body already renders a category group with
its sub-groups. **The operator panel needed the item block extracting first; this does not.**

⚠️ **There is no category heading in the list today.** The map body renders `catPreorder` (a label, only
when the category is flat *and* every item is a pre-order item, [:2461](app/trucks/[slug]/order/page.tsx#L2461))
and sub-category headings — but nothing that names the category in the normal case. **Your headings are
new content, not a restyle**, which is also why nothing currently reserves vertical space for them.

### b. The `window.scrollTo` pin, in full

[app/trucks/[slug]/order/page.tsx:436-462](app/trucks/[slug]/order/page.tsx#L436-L462):
```tsx
  // Anchor at the menu region's natural top (rendered just above the sticky tab bar) + a first-mount
  // guard, used by the tab-change scroll effect below.
  const menuTopRef = useRef<HTMLDivElement>(null)
  const categoryScrollMounted = useRef(false)

  // On a user TAB CHANGE (activeCategory), pin the tab bar under the fixed header and start the new
  // category's list at the top — WITHOUT scrolling the page to document-top (the event card + meal
  // deals above the menu anchor must stay scrolled away). We scroll so the menu anchor sits exactly
  // where the sticky tabs pin. Skipped on first mount (initial default category) so the page doesn't
  // auto-scroll-down on load. Instant ('auto') — a tap should land at the category immediately;
  // 'smooth' lags between far-apart categories.
  //
  // 🔴 IT SCROLLS TO `stickyTop`, NOT TO A HARDCODED 60, AND THAT IS THE DEMO FIX.
  // The 60 counted the page header and NOT the DEMO MODE banner … In demo the tabs pin 46px lower than
  // this scroll assumed, so the first item of the new category landed UNDER the banner and its name was
  // clipped. …
  useEffect(() => {
    if (!categoryScrollMounted.current) { categoryScrollMounted.current = true; return }
    const el = menuTopRef.current
    if (!el) return
    const menuTop = el.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: Math.max(0, menuTop - stickyTop), behavior: 'auto' })
  }, [activeCategory, stickyTop])
```

| Question | Answer |
|---|---|
| **What is it pinning?** | 🔴 **Not a category — the MENU REGION.** `menuTopRef` is a non-sticky anchor `<div>` at [:2420](app/trucks/[slug]/order/page.tsx#L2420), just above the chip bar. It always scrolls to the same place, because in tabs mode the selected category always starts there |
| **When does it fire?** | On any change of `activeCategory` **or `stickyTop`**, skipping first mount via `categoryScrollMounted` |
| **What does it assume about page height?** | 🔴 **That there is enough content below the anchor to scroll it to the pin line.** A short category cannot be scrolled up that far, so [:2455](app/trucks/[slug]/order/page.tsx#L2455) pads the list: `<div style={{ minHeight: menuMinHeight }}>` with `menuMinHeight = Math.max(0, viewportH - 121)` ([:1200](app/trucks/[slug]/order/page.tsx#L1200)) |

🔴 **THE PADDING HACK GOES INERT EXACTLY WHEN A CONTINUOUS SCROLL WOULD NEED IT.** Its own comment says
it is *"self-cancelling — inert once the category's content exceeds it"*. With every category rendered at
once the list always exceeds it, so **the last category can never be scrolled to the top**: its jump
would under-shoot and, with a spy, its chip would never light. This is the same bottom-clamp problem the
operator panel hit — and here the existing mitigation stops working rather than helping. **JUDGEMENT:
this is the single most likely defect in a naive build.**

### c. How it differs from `ScrollMenuSections`, and what is reusable

| | `ScrollMenuSections` (operator) | Customer page |
|---|---|---|
| Scroll container | an inner `overflow-y-auto` **pane** | 🔴 **the WINDOW** |
| Offset source | `barH`, **measured** via `ResizeObserver` on its own bar | `stickyTop`, a **constant + one measured banner** |
| Sticky depth | chip bar + one heading level | header + demo banner + status banner + chip bar + **sub-category headings** |
| Bottom obstruction | none | 🔴 a **fixed bottom basket bar** |
| Item layout | tile grid (`grid-cols-2 @sm:grid-cols-3`) | 🔴 **one item per row, no grid** |
| Sub-categories | not rendered | rendered, and sticky |
| Spy | rAF scroll listener on the pane | none |

🔴 **PLAINLY: none of that component is reusable here, and it should not be adapted.** Every line that
touches geometry assumes an element scroller (`sc.scrollTop`, `sc.clientHeight`, `sc.scrollHeight`,
`getBoundingClientRect().top - scRect.top`, `sc.addEventListener('scroll')`). On the window you would use
`window.scrollY`, `document.documentElement.scrollHeight` and a listener on `window` — a different
expression in every one of those places, which is a rewrite wearing a shared name.

**What IS transferable is the reasoning, and it is worth taking whole:** derive chips and sections from
one array; clamp the spy at the bottom of the scroll; release the tap-lock on arrival and on
`touchstart`/`wheel` rather than on a timer; never let a programmatic scroll drive the spy.

---

## 2. 🔴 THE STICKY HEADER OFFSET

### a. Every sticky/fixed element, with its offset

The file documents its own stack at [:238-265](app/trucks/[slug]/order/page.tsx#L238-L265):
```
//   page header      sticky top-0            h-[60px]   z-50   (Hdr)
//   DEMO MODE banner sticky top-[60px]       ~46px      z-40   (demo only — Hdr)
//   status banners   sticky HEADER_H(+demo)             z-40   (time-not-set / closed / paused)
//   category tabs    sticky HEADER_H(+demo)  61px       z-30   (multi-category menus only)
//   subcat headings  sticky the above + 61px            z-20
const HEADER_H = 60   // Hdr's h-[60px]
const TABBAR_H = 61   // py-2 (16) + min-h-[44px] button + 1px border
const stickyTop = HEADER_H + (isDemo ? demoBannerH : 0)
```

| Element | Line | Sticky/fixed | Offset | Height |
|---|---|---|---|---|
| Page header | [:3814](app/trucks/[slug]/order/page.tsx#L3814) | `sticky top-0 z-50` | 0 | **`h-[60px]` — a hard Tailwind height** |
| DEMO banner | [:3855](app/trucks/[slug]/order/page.tsx#L3855) | `sticky top-[60px] z-40` | 60 | 🔴 **measured**, fallback 46 |
| Time-not-set banner | [:2119](app/trucks/[slug]/order/page.tsx#L2119) | `sticky z-40` | `stickyTop` | ⚠️ **unmeasured** |
| Closed banner | [:2147](app/trucks/[slug]/order/page.tsx#L2147) | `sticky z-40` | `stickyTop` | ⚠️ **unmeasured** |
| Paused banner | [:2168](app/trucks/[slug]/order/page.tsx#L2168) | `sticky z-40` | `stickyTop` | ⚠️ **unmeasured** |
| Category chips | [:2435](app/trucks/[slug]/order/page.tsx#L2435) | `sticky z-30` | `stickyTop` | `TABBAR_H = 61`, a constant |
| Sub-category headings | [:2495](app/trucks/[slug]/order/page.tsx#L2495) | `sticky z-20` | `menuCategories.length > 1 ? stickyTop + TABBAR_H : stickyTop` | — |
| **Basket bar** | [:3280](app/trucks/[slug]/order/page.tsx#L3280) | 🔴 **`fixed bottom-0 z-50`** | — | **measured** into `footerHeight` |

🔴 **THE DEFECT THIS SURFACED, AND IT EXISTS TODAY.** The status banners and the chip bar are **both
sticky at exactly `stickyTop`**, and the banners are `z-40` against the bar's `z-30`. `stickyTop` does
**not** include a banner's height. The banners are children of `<Shell>` so they stay pinned for the whole
page; the chip bar's containing block is the menu card. **So whenever a status banner is showing and the
customer scrolls into the menu, the pinned chip bar is drawn behind the banner.**

**And the menu really is rendered in those states** — [:2085](app/trucks/[slug]/order/page.tsx#L2085)
`const isOrderingBlocked = isPaused || isClosed || orderingTimeNotSet` only **disables the Add buttons**
([:2710-2713](app/trucks/[slug]/order/page.tsx#L2710-L2713)); the list still renders so a customer can
browse. **INFERRED that the overlap is visible** — I have not rendered it — but the z-order and the equal
`top` make it hard to see how it would not be.

**Why it matters for this build:** any jump arithmetic based on `stickyTop` inherits the same blind spot,
so in those states a jumped-to heading would land **behind the banner**. Today the consequence is a hidden
chip bar; after the change it would be a heading the customer cannot see.

### b. Why demo sits lower — the cause, quoted

[:251-265](app/trucks/[slug]/order/page.tsx#L251-L265):
```tsx
const demoBannerRef = useRef<HTMLDivElement | null>(null)
// MEASURED, not hardcoded. The banner is 46px today (py-2 ×2 + min-h-[1.75rem] + border-b-2), but every
// one of those is a rem, so OS/browser text scaling changes it …
const [demoBannerH, setDemoBannerH] = useState(46)
useEffect(() => {
  const el = demoBannerRef.current
  if (!isDemo || !el || typeof ResizeObserver === 'undefined') return
  const ro = new ResizeObserver(() => setDemoBannerH(el.getBoundingClientRect().height))
  ro.observe(el)
  setDemoBannerH(el.getBoundingClientRect().height)
  return () => ro.disconnect()
}, [isDemo])
const stickyTop = HEADER_H + (isDemo ? demoBannerH : 0)
```

**It is a demo banner**, not a preview bar or a different wrapper: `DemoModeBanner`
([:3855](app/trucks/[slug]/order/page.tsx#L3855)), rendered inside `Hdr` with
`className="sticky top-[60px] z-40"` and gated on `isDemoIdentifier(slug)` — **the slug prefix**, so the
page needs no extra data to know. It is shared with the dashboard and the KDS.

⚠️ **This is already solved and solved well.** The mechanism to copy is *measure, don't assume*, with a
sensible first-paint fallback.

### c. Does the header height vary? — every condition

| Condition | Changes the offset? |
|---|---|
| **Demo mode** | 🔴 **YES** — `+demoBannerH` (~46), and it is **rem-based**, so OS text scaling moves it. Measured |
| **A status banner** (closed / paused / time-not-set) | 🔴 **YES in effect, NO in the arithmetic** — it occupies the same pinned band and `stickyTop` ignores it. §2a |
| **Multi-category** (`menuCategories.length > 1`) | 🔴 **YES for anything below the chips** — `+TABBAR_H` (61), and **61 is a hardcoded constant** while the bar's button is `min-h-[44px]` in rem → **text scaling breaks it, unlike the demo banner** |
| **Viewport width** | **No** — `-mx-2 sm:-mx-4` changes horizontal inset only |
| **Truck logo present** | **No** — the header is `h-[60px]` and the centred logo/name block is `absolute inset-0` ([:3824](app/trucks/[slug]/order/page.tsx#L3824)), so it cannot push height |
| **`scrolled` (`window.scrollY > 120`)** | **No** — it toggles `opacity` on that block only |
| **Event banner / hero / deals** | **No** — all non-sticky content above the menu |
| **OS text scaling on the header itself** | **No** — `h-[60px]` is a hard px height (the file notes the logo was pinned to fixed px for exactly this reason) |

**So: two variable terms (`demoBannerH`, banner presence) and one constant that pretends not to be
(`TABBAR_H = 61`).**

### d. Anything sticky at the BOTTOM?

🔴 **Yes — the basket bar**, [:3280](app/trucks/[slug]/order/page.tsx#L3280):
```tsx
<div ref={footerRef} className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-xl px-4 pt-3 pb-2 z-50" style={{paddingBottom: 'max(8px, env(safe-area-inset-bottom))'}}>
```
Its height is measured in a `useLayoutEffect` **on every render** ([:466-470](app/trucks/[slug]/order/page.tsx#L466-L470)) plus a
`ResizeObserver` backup ([:474-482](app/trucks/[slug]/order/page.tsx#L474-L482)), and fed back as
`<main style={{ paddingBottom: footerHeight + 8 }}>` ([:2206](app/trucks/[slug]/order/page.tsx#L2206)).

| Question | Answer |
|---|---|
| Does it overlay content? | **Mid-scroll yes; at the document end no** — the `paddingBottom` reserves exactly its height |
| Would a jumped-to heading land behind it? | ✅ **No — a jump targets the TOP of the viewport.** The bottom bar is irrelevant to the landing position |
| Is it irrelevant, then? | 🔴 **No.** It shortens the usable viewport, so it makes the **last category's** unreachability worse: the reserved space is `footerHeight + 8`, which is exactly enough to clear the bar and **nothing more** — there is no spare scroll for the final section to reach the top |

⚠️ **The bar grows.** It expands when the basket has items (it shows a peek/breakdown), which is why the
height is re-measured every render rather than once. **So the amount of unreachable tail changes as the
customer orders** — INFERRED from the measurement machinery, not observed.

### e. JUDGEMENT — `scroll-margin-top` vs JS arithmetic

🔴 **`scroll-margin-top`, clearly — and it is the recommendation.**

**Why it wins here:** the browser applies it at scroll time against the element's *current* geometry, so
it cannot go stale between a resize and a render the way a captured `stickyTop` can. It also removes the
`getBoundingClientRect().top + window.scrollY` round-trip, which is the fragile line in
[:460-461](app/trucks/[slug]/order/page.tsx#L460-L461) — and the page already uses the idiom once, at
[app/trucks/page.tsx:108](app/trucks/page.tsx#L108) (`scroll-mt-[200px]` on an A–Z index).

**What you need to make it robust — four things, and the third is the one that is missing today:**

1. **A CSS variable, not a Tailwind class.** `scroll-mt-[121px]` cannot express a measured demo banner.
   Set `--hg-sticky-top` on a wrapper from the same value that already drives the sticky `top`, and use
   `style={{ scrollMarginTop: 'var(--hg-sticky-top)' }}` — **one number feeding both**, so a pinned bar
   and a scroll target can never disagree. That single-source property is what the operator panel's
   `barH` gets right.
2. **`TABBAR_H` measured, not 61.** The bar's button is `min-h-[44px]` in rem, so text scaling moves it —
   the exact bug `demoBannerH` was written to fix, still present one line away. **The chip bar needs the
   same `ResizeObserver` the demo banner has.**
3. 🔴 **The status banners' height added.** They are the uncounted term (§2a). Either measure them into
   `stickyTop`, or move them out of the pinned band. **Nothing works properly until this is decided.**
4. **`scroll-behavior`** is not global — [app/landing/landing.css:64](app/landing/landing.css#L64) scopes
   smooth scrolling to the landing page — so a chip tap must pass `behavior` explicitly, and honour
   `prefers-reduced-motion` as [components/manage/PaymentsTab.tsx:305](components/manage/PaymentsTab.tsx#L305)
   does.

⚠️ **`scroll-margin-top` fixes the JUMP, not the SPY.** A scroll-spy still needs the same number in JS to
know where its pin line is. **So you need the measured value regardless** — `scroll-margin-top` just
stops you needing it in a second place, computed a second way.

### f. 🔴 YOUR REVISED DESIGN — non-sticky headings, chips carry position

**Reviewed as described, and it is the better shape.** What it buys:

- **The whole two-level sticky stack disappears** for category headings. No `stickyTop + TABBAR_H`, no
  z-order between a heading and the bar, no opaque full-bleed band needed to stop items bleeding through.
- **One fewer thing eating the viewport.** On a 667pt phone the pinned band is already ~121px; a third
  pinned row would have taken ~15% of the screen before any food.
- **The chip highlight is a better signal anyway** — it names the category *and* shows the neighbours.

🔴 **THE ONE CONSEQUENCE TO DECIDE ON: sub-category headings are sticky today**
([:2495](app/trucks/[slug]/order/page.tsx#L2495), `sticky z-20`), and the comment at
[:2479-2493](app/trucks/[slug]/order/page.tsx#L2479-L2493) records that this is deliberate — *"pins
directly beneath the category tab bar as you scroll within a category, swapping to the next subcategory
as it arrives"*.

**With category headings non-sticky and sub-category headings still sticky, a customer scrolled deep into
Pizza sees "GARLIC BREADS" pinned under the chips with no "PIZZA" anywhere on screen** — a sticky child
with no sticky parent. **JUDGEMENT: the chip highlight does cover it** (the Pizza chip is orange), so this
is defensible rather than broken — but it is a deliberate inversion of the current hierarchy and should be
a decision in the brief, not a side effect. **Three options: leave it (chips carry the parent), make
sub-headings non-sticky too (consistent, loses the current affordance), or keep sub-headings sticky and
say so explicitly.**

⚠️ **Also: non-sticky headings still need `scroll-margin-top`.** A jump must land the heading *below* the
chip bar, otherwise it lands underneath it and the customer sees the second item of the category as the
first thing. Non-sticky removes the pinning problem, not the landing problem.

---

## 3. MOBILE REALITY

### a. Other reliance on window scroll position

| Site | Use |
|---|---|
| [:456-462](app/trucks/[slug]/order/page.tsx#L456-L462) | 🔴 **the tab-change pin** — `window.scrollY` + `window.scrollTo`. **This is the code the change replaces** |
| [:485](app/trucks/[slug]/order/page.tsx#L485) | `setIsScrolled(window.scrollY > 120)` — drives the header's centred truck logo/name **fade only** (opacity, [:3824](app/trucks/[slug]/order/page.tsx#L3824)). No height change, no threshold behaviour |
| [:1639](app/trucks/[slug]/order/page.tsx#L1639), [:1830](app/trucks/[slug]/order/page.tsx#L1830) | `sheetScrollRef.current?.scrollTo({ top: 0 })` — **inside the order sheet**, a different element |
| [:3176](app/trucks/[slug]/order/page.tsx#L3176) | `scrollIntoView` on input focus, to clear the keyboard |

✅ **No scroll restoration, no sticky-becomes-fixed threshold, no scroll-to-top on category change other
than the pin itself.** `isScrolled` is the only other window-scroll consumer and it is cosmetic.

⚠️ **One interaction to note:** a chip-tap jump will cross the 120px threshold, so the header's truck
name will fade in/out as a side effect. Harmless, and it already happens on a tab change.

### b. iOS Safari address-bar collapse

🔴 **YES — one computed height would be invalidated, and it is the padding hack.**

[:435](app/trucks/[slug]/order/page.tsx#L435) and [:486](app/trucks/[slug]/order/page.tsx#L486):
```tsx
const [viewportH, setViewportH] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800))
…
const onResize = () => setViewportH(window.innerHeight)
window.addEventListener('resize', onResize)
window.addEventListener('orientationchange', onResize)
```
feeding `const menuMinHeight = Math.max(0, viewportH - 121)` ([:1200](app/trucks/[slug]/order/page.tsx#L1200)).

**`window.innerHeight` is exactly the value iOS changes when the address bar collapses**, and Safari fires
`resize` for it — so `menuMinHeight` recomputes **mid-gesture**, changing the document height while the
customer is scrolling. **INFERRED that this is already slightly janky today**; I have not observed it.

🔴 **The good news is that a continuous scroll makes this LESS relevant, not more:** with every category
rendered the list exceeds `menuMinHeight` and the padding goes inert. ⚠️ **The bad news is that the same
inertness is what strands the last category** (§1b). **If you keep a spy, do not solve the last-category
problem with more `viewportH` padding — clamp the spy at the bottom of the scroll instead**, which needs
no height at all and cannot be invalidated by the address bar.

⚠️ `HEADER_H`, `TABBAR_H` and `stickyTop` are unaffected — none derives from viewport height.

### c. Observers and listeners on this page — all of them

**🔴 There is NO `IntersectionObserver` on this page, or anywhere in the repo.**

| Line | What |
|---|---|
| [:257-264](app/trucks/[slug]/order/page.tsx#L257-L264) | `ResizeObserver` on the **demo banner** → `demoBannerH` |
| [:466-470](app/trucks/[slug]/order/page.tsx#L466-L470) | `useLayoutEffect` measuring the **basket bar** every render → `footerHeight` |
| [:474-482](app/trucks/[slug]/order/page.tsx#L474-L482) | `ResizeObserver` on the basket bar (orientation / out-of-render resizes) |
| [:484-496](app/trucks/[slug]/order/page.tsx#L484-L496) | `window` **scroll** (passive) → `isScrolled`; **resize** + **orientationchange** → `viewportH` |
| [:655](app/trucks/[slug]/order/page.tsx#L655) | `document` `visibilitychange` — menu/slot catch-up refresh |
| [:137-138](app/trucks/[slug]/order/page.tsx#L137-L138) | Stripe.js `load`/`error` — unrelated |

✅ **A window scroll listener already exists and is already passive** — a spy could extend it rather than
adding a second one. **JUDGEMENT: extend it.** Two independent scroll listeners on one page is how the
`isScrolled` fade and the spy end up disagreeing about scroll position on a fast fling.

---

## 4. WHAT ELSE FILTERS THE ITEM LIST

### a. 🔴 The allergen gate — SERVER-SIDE, before grouping

[app/api/menu/[truckId]/route.ts:490-504](app/api/menu/[truckId]/route.ts#L490-L504):
```ts
// SAFETY (per-dish visibility gate): in PER-DISH display mode, the CUSTOMER menu HIDES any item whose
// allergens aren't confirmed (allergens_verified === false) … Only explicit false hides; null/legacy +
// true stay visible. Scoped to the CUSTOMER context (!isDashboard) …
items: (items || [])
  .filter(i => {
    // Category ENABLE/DISABLE gate (CUSTOMER-only) …
    if (!isDashboard && disabledCategories.has(((i.menu_categories as any)?.name || '').toLowerCase())) return false
    const perDish = ((truck.allergen_display_mode ?? null) as string) !== 'card'
    if (isDashboard || !perDish) return true                 // operator OR card mode → show everything
    return (i as any).allergens_verified !== false           // customer + per-dish → hide explicit-unconfirmed
  })
```

🔴 **Relative to category grouping: it happens BEFORE, on the server, and the client never sees the
hidden items.** `menu.items` arrives pre-filtered, and only then does
[:1098](app/trucks/[slug]/order/page.tsx#L1098) call `groupByCategory(menu.items, …)`.

**That is the whole reason 4d is not a problem today** — see below.

### b. Sold-out items — SHOWN, greyed, not hidden

[:2510](app/trucks/[slug]/order/page.tsx#L2510):
```tsx
const isSoldOut = !(item.available ?? true)
```
and the row renders regardless — [:2562](app/trucks/[slug]/order/page.tsx#L2562)
`${isSoldOut ? 'text-slate-400 line-through' : 'text-slate-900'}` plus a badge at
[:2576-2578](app/trucks/[slug]/order/page.tsx#L2576-L2578):
```tsx
{isSoldOut && (
  <span className="text-[0.625rem] font-black text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">Sold out</span>
)}
```
✅ **A sold-out item still occupies a row**, so it cannot empty a category or shorten a section.

### c. Everything else that removes an item from a customer's view

| Filter | Where | Removes the row? |
|---|---|---|
| **Disabled category** | menu API [:500](app/api/menu/[truckId]/route.ts#L500) | 🔴 **YES — the whole category vanishes for the customer** |
| **Unconfirmed allergens, per-dish mode** | menu API [:503](app/api/menu/[truckId]/route.ts#L503) | 🔴 **YES, item by item** |
| **Pre-order past a `sold_out` deadline** | menu API [:533-540](app/api/menu/[truckId]/route.ts#L533-L540) | **No — marked unavailable**, so it renders as sold out (§4b) |
| **Stock exhausted** | menu API [:510-526](app/api/menu/[truckId]/route.ts#L510-L526) | **No** — `stock_remaining` / `available:false` → greyed |
| **`is_available` off in Settings** | same AND-composition | **No** — greyed |
| **Pre-order before its open window** | menu API [:545](app/api/menu/[truckId]/route.ts#L545) | **No** — labelled, not removed |
| **Empty sub-category** | client [:2457](app/trucks/[slug]/order/page.tsx#L2457) `.filter(g => g.items.length > 0)` | Removes the **heading**, not items |

### d. 🔴 Can a category be EMPTY for a customer but not for the operator?

**YES — by two independent routes:** a **disabled category** (every item omitted) and **per-dish allergen
gating** (enough items unconfirmed that none survives).

**But the current code already handles it, and this is the good news:**

```tsx
// lib/basket-utils.ts:216-221 — groupByCategory
orderedCategories.forEach(cat => {
  if (groups[cat] && !seen.has(cat)) { seen.add(cat); result.push([cat, groups[cat]]) }
})
```
`groups` is built **only from the items that arrived**, so a category with none is never emitted. Then:
```tsx
const menuCategories = useMemo(() => groupedMenu.map(([cat]) => cat), [groupedMenu])   // :1104
{groupedMenu.filter(([category]) => …)}                                                // :2456
```

🔴 **The chip bar and the section list BOTH derive from `groupedMenu` — one post-filter array. Today's
code does not have this problem, and the misalignment would be NEW, introduced only by a build that
derives the sections from `menu.categories` instead.**

⚠️ **The trap is real and easy to fall into**, because the raw category list is right there:
`menu.categories` is in scope and used for sub-categories at [:2457](app/trucks/[slug]/order/page.tsx#L2457)
and passed to a modal at [:3450](app/trucks/[slug]/order/page.tsx#L3450). **Gusto proves it matters: its
`Specials` category holds 0 items and is already absent from `menuCategories`.** A build that iterated
`menu.categories` would render a Specials heading with nothing under it and shift every jump target after
it by one.

**The brief for this work should say, in one line: chips and sections both map `groupedMenu`.**

---

## 5. SCALE

### a. Items per row at mobile width

🔴 **ONE. There is no grid — `grep "grid-cols"` over this page returns nothing.**

It is a vertical list of rows separated by `divide-y divide-slate-200`
([:2507](app/trucks/[slug]/order/page.tsx#L2507)), inside a `max-w-lg` (512px) column
([:2206](app/trucks/[slug]/order/page.tsx#L2206)) with the card at `px-2 sm:px-4`
([:2402](app/trucks/[slug]/order/page.tsx#L2402)).

⚠️ **This is the biggest single difference from the operator panel**, where 3 tiles per row make a
46-item menu about 16 rows. **Here 46 items is 46 rows.**

### b. JUDGEMENT — how far down does Gusto's second heading land?

**Estimating a row height first, from the markup rather than a measurement:** name line + full-width
description (`text-sm`, [:2599](app/trucks/[slug]/order/page.tsx#L2599)) + allergen/dietary chips + the
quantity control, at `py-` spacing, with an optional 64px thumbnail (`w-16 h-16`,
[:2557](app/trucks/[slug]/order/page.tsx#L2557)) setting a floor. **JUDGEMENT: ~110–140px per row**, and
**more for Gusto specifically**, whose pizza descriptions are long enough that the file singles them out
("hot 38hr makhani sauce on top").

| | Estimate |
|---|---|
| Gusto's Pizza category, 23 items | **~2,500–3,200px** |
| A 667pt phone's usable height (viewport − ~121 pinned − ~80 basket bar) | **~460px** |
| **Pizza in screen-heights** | 🔴 **roughly 5.5 to 7** |
| **Where the second heading (Desserts) lands** | 🔴 **~6 screens of continuous scrolling below the first** |

**All of this is INFERRED and JUDGEMENT** — I have rendered nothing and measured nothing.

🔴 **THE HONEST CONCLUSION: for Gusto, "one continuous scroll" is mostly "one continuous scroll of
pizzas."** A customer who wants a dessert must either use a chip or scroll six screens. **The chips stop
being a nice-to-have and become the primary navigation** — which is an argument for building the jump and
the spy properly rather than for abandoning the idea, but it does mean **the feature's value is
concentrated in the small-menu case.** Tikka Tonic's 12 items across 4 categories is roughly 1.5 screens
in total: **that truck is unambiguously better off**, and Gusto is the one to mock up before deciding.

⚠️ **`Specials` (0 items) already renders no chip and no section** (§4d), so Gusto is **5 visible
categories**, not 6.

---

## 6. THE ORDER PATH — what is NOT affected

### a. Traced, and the answer is plainly nothing

| Surface | Reads `selectedCategory` / `activeCategory`? | Verdict |
|---|---|---|
| Item selection / `openItemModal` | No — [:2710](app/trucks/[slug]/order/page.tsx#L2710) takes `(item, catModGroups, itemUpsells)` from the row | ✅ untouched |
| Modifiers | No — `item.modifierGroups`, per item ([:2517](app/trucks/[slug]/order/page.tsx#L2517)) | ✅ untouched |
| Cart / `basket` | No — keyed by item name + modifiers | ✅ untouched |
| `basketByCat` (category caps) | Reads **`item.category`**, the item's own field ([:2529](app/trucks/[slug]/order/page.tsx#L2529)) — never the selected tab | ✅ untouched |
| Collection-time picker | No — driven by event times + `/api/slots` | ✅ untouched |
| Submission | No | ✅ untouched |

🔴 **The complete list of `activeCategory` / `selectedCategory` readers is six lines** — [:275](app/trucks/[slug]/order/page.tsx#L275),
[:462](app/trucks/[slug]/order/page.tsx#L462), [:1106](app/trucks/[slug]/order/page.tsx#L1106),
[:2442](app/trucks/[slug]/order/page.tsx#L2442), [:2456](app/trucks/[slug]/order/page.tsx#L2456) — plus
`menuCategories.length > 1` for the bar's presence and the sub-heading offset. **Nothing on the order path
touches it.**

⚠️ **The one genuine coupling is `menuCategories.length > 1`**, which today decides both *"is there a chip
bar"* and *"do sub-headings pin at `stickyTop + TABBAR_H` or at `stickyTop`"*
([:2495](app/trucks/[slug]/order/page.tsx#L2495)). **A single-category truck renders no bar**, so any new
offset must keep that branch or single-category trucks get 61px of dead space at every heading.

### b. Is the category selection persisted or read elsewhere?

**No, in every sense checked:**

| Channel | Result |
|---|---|
| URL params | ✅ only `event_id`, `confirm`, `payment_failed` ([:223](app/trucks/[slug]/order/page.tsx#L223), [:232](app/trucks/[slug]/order/page.tsx#L232), [:236](app/trucks/[slug]/order/page.tsx#L236)) — **no category param, so no deep link to break** |
| localStorage / sessionStorage | ✅ no category key |
| Analytics | ✅ **grep for `posthog` / `capture(` / `track(` on this page returns nothing** — no event names the category |
| Server | ✅ never sent |

🔴 **So removing the selection state costs nothing downstream.** It is purely a render-time value.

---

## 7. RISK REGISTER — ranked, in terms of what a live customer would see

| # | Risk | What the customer sees | Likelihood |
|---|---|---|---|
| **1** | 🔴 **The jump lands behind a status banner.** `stickyTop` omits the closed/paused/time-not-set banners, which pin in the same band (§2a) | Taps "Desserts" while the truck is paused; the heading and first item land **under the amber banner**. Currently this bug hides the chip bar; afterwards it hides the food | **HIGH** — the arithmetic is already wrong; the change makes it visible |
| **2** | 🔴 **The last category is unreachable.** `menuMinHeight` goes inert once the list exceeds a viewport, which is always in a combined list (§1b) | Taps the last chip; the page moves a little and stops short. With a spy, that chip **never lights**, so the page looks stuck on the second-to-last | **HIGH** unless a bottom clamp is built in |
| **3** | ⚠️ **Six screens of pizza.** 46 rows, one per row, 23 in one category (§5b) | Opens Gusto, scrolls, and does not reach a second category heading for ~6 screens. **Dessert and drinks sales are the ones at risk** | **CERTAIN** for Gusto — a product judgement, not a defect |
| **4** | ⚠️ **`TABBAR_H = 61` is a hardcoded constant against a rem-sized bar** (§2c) | A customer with OS "Larger Text" gets headings landing a few px under the chips, or a gap above them | **MEDIUM** — pre-existing, but the change relies on it more |
| **5** | ⚠️ **Spy vs programmatic scroll.** The lesson learned on the operator panel (lock on tap, release on arrival / touch) | Taps a chip; the highlight **flickers through every category in transit** before settling | **HIGH if not designed in**, zero if it is |
| **6** | ⚠️ **Sticky sub-headings orphaned** by non-sticky category headings (§2f) | Deep in Pizza, sees "GARLIC BREADS" pinned with no "PIZZA" — mitigated by the orange chip | **CERTAIN** — a design consequence to accept or fix |
| **7** | ⚠️ **A second scroll listener** alongside the existing `isScrolled` one (§3c) | On a fast fling, the header's truck-name fade and the chip highlight disagree for a frame | **LOW**, avoidable by extending the existing listener |
| **8** | ⚠️ **`menuMinHeight` recomputing on iOS address-bar collapse** (§3b) | A small scroll judder mid-gesture | **LOW** — and the change makes it rarer, not worse |
| **9** | 🔴 **A build deriving sections from `menu.categories`** instead of `groupedMenu` (§4d) | An empty "Specials" heading on Gusto, and **every jump after it lands on the wrong category** | **LOW if briefed, SEVERE if it happens** |
| **10** | **Mid-order disruption on deploy.** The page polls the menu and re-renders | A customer with a basket, mid-scroll, sees the list reflow when the new bundle loads. **The basket is React state and would survive a re-render but not a reload** | **LOW** — and no worse than any other deploy to this page |

🔴 **Nothing in the register touches money, stock or submission** (§6a). The failure modes are all
navigational: a customer who cannot find or cannot reach an item. **That is the right shape of risk for a
live page — recoverable by scrolling — but item 3 is the one that decides whether this is worth
building at all, and it is a judgement about Gusto's menu rather than about the code.**

---

## 8. WHAT I HAVE NOT VERIFIED

1. **Nothing was rendered. No browser, no phone, no scroll.** Every geometric claim is read from classes
   and constants.
2. **🔴 The status-banner overlap (§2a, risk 1) is INFERRED**, not observed. The z-order and the equal
   `top` make it near-certain, but **I did not load a paused truck's page.** It is the single thing I
   would check first, and it is checkable today without building anything.
3. **All of §5b is JUDGEMENT.** Row height, screen-heights, where the second heading lands — estimated
   from markup. **I measured nothing** and did not open Gusto's menu.
4. **`TABBAR_H = 61` was not verified against a rendered bar**, nor tested under OS text scaling.
5. **I did not test `menuMinHeight`'s behaviour on iOS.** The address-bar reasoning is from
   `window.innerHeight` semantics, not from a device.
6. **No data was read this turn.** Gusto's 6/46/23/0 and Tikka Tonic's 4/12 are carried from
   `docs/add-order-view-report.md`.
7. **The "no analytics" claim is a grep** over this page only. A wrapper or provider elsewhere could
   capture navigation events without naming the category here.
8. **I have not estimated build size.** This review says what would break, not how long it would take.
9. **I did not review the confirmation screen or the event-chooser screen**, both of which render through
   the same `Hdr` and would inherit any change to `stickyTop`.
