# Kitchen screen — two layout problems, read

**READ ONLY. Nothing was changed except this file.** No fix, no design, no `next dev`, no `next build`.

**PROMPT INTEGRITY.** No span of the brief arrived garbled. No instruction contradicted another.

## 🔴 WHICH FILE THIS IS ABOUT — established first, because there are two "KDS" routes

**Searches:** `find app -path '*kds*' -name '*.tsx'` → four files.

| Route | File | What it is |
|---|---|---|
| `/kds/[kds_token]` | `app/kds/[kds_token]/page.tsx` (35 lines) | 🔴 **NOT THE BOARD.** A server component that resolves `truck_vans.kds_token`, then `redirect(`/dashboard/${truck.dashboard_token}/kds?van_id=…`)` |
| `/dashboard/[token]/kds` | **`app/dashboard/[token]/kds/page.tsx` (3,126 lines)** | 🔴 **THE BOARD. Everything below is this file.** |

⚠️ **`app/kds/[kds_token]/layout.tsx` IS A RED HERRING** — it wraps in `w-screen h-screen overflow-hidden`,
but that route only ever redirects, so the layout that applies is
`app/dashboard/[token]/kds/layout.tsx`. **READ.**

**⚠️ WHICH SURFACE I READ, per the standing rule:** everything here is the **KDS board**. §9 is the one
section that also reads the dashboard Orders screen, and it says so. **A fact about one is not a fact
about the other, and they turn out to differ.**

---

# 1. THE LAYOUT CONTAINER AND EVERY CLASS THAT DECIDES COLUMN COUNT

**`app/dashboard/[token]/kds/page.tsx:2589-2604`** — the queue panel and the board container, quoted:

```tsx
      {/* ── Main layout ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Queue panel ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <div
          className={
            activeLayout === 'grid'
              // BOTH views' grid use the SAME compact auto-fill density (see style below). Window
              // dropped its fixed `grid-cols-2 xl:grid-cols-3` (≈3 wide cards) to match Cook's ≈4-across.
              ? 'grid gap-3 items-stretch p-3'
              : 'flex flex-col gap-3 p-3'
          }
          style={activeLayout === 'grid'
            ? { gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }
            : undefined
          }
        >
```

The full ancestor chain, all **READ**:

| Level | Class | File |
|---|---|---|
| Route layout | `w-screen h-dvh overflow-hidden m-0 p-0` | `app/dashboard/[token]/kds/layout.tsx:10` |
| Page root | `w-full h-full flex flex-col bg-slate-50 overflow-hidden` | `kds/page.tsx:1760` |
| Main layout | `flex flex-1 min-h-0` | `:2588` |
| **Queue panel** | `flex flex-col flex-1 min-w-0 overflow-y-auto` | `:2591` |
| **Board (grid)** | `grid gap-3 items-stretch p-3` + inline `gridTemplateColumns` | `:2592-2604` |

🔴 **THE COLUMN COUNT IS DECIDED BY EXACTLY ONE THING: the inline
`repeat(auto-fill, minmax(240px, 1fr))`.** There is no other input.

⚠️ **THE QUEUE PANEL HAS NO SIBLING.** `flex flex-1 min-h-0` at `:2588` contains only the queue panel;
the Done strip is *inside* the grid. **So on a phone the board gets the full viewport width** — nothing
is stealing space from it. **READ.**

---

# 2. 🔴 THE PORTRAIT CASE — WHAT PRODUCES TWO COLUMNS, AND WHY THEY OVERLAP

## 2.1 It is not a breakpoint, not JS, and not an orientation check

**Searches over `app/dashboard/[token]/kds/page.tsx`:** `innerWidth`, `matchMedia`, `orientation`,
`ResizeObserver`, `clientWidth`, `offsetWidth` → **ZERO HITS**. **READ, from absence, path named.**

- ❌ **No fixed grid-template.** It is `auto-fill`, not `grid-cols-2`.
- ❌ **No Tailwind breakpoint** on the container — `grid gap-3 items-stretch p-3` carries no `sm:`/`md:`.
- ❌ **No JS width measurement.** Nothing measures anything.
- ❌ **No orientation check anywhere in the file.**

## 2.2 🔴 AND THE AUTO-FILL ARITHMETIC SAYS ONE COLUMN, NOT TWO

The grid has `p-3` (12px each side). On a 390pt iPhone in portrait the content box is ≈366px. `auto-fill`
fits `floor((366 + 12) / (240 + 12)) = 1` track.

🔴 **SO THE DECLARED GRID RESOLVES TO A SINGLE COLUMN AT PHONE WIDTH ALREADY.** The two columns you are
seeing are **not** coming from `gridTemplateColumns`. Something is adding a track the template did not
ask for.

## 2.3 🔴 THE MECHANISM: `col-span-2` ON THE OVERFLOW PLACEHOLDER FORCES AN IMPLICIT SECOND COLUMN

**`kds/page.tsx:2675-2679`** — and `grep -n "col-span" app/dashboard/[token]/kds/page.tsx` returns
**this line and nothing else in the file**:

```tsx
          {overflowCount > 0 && (
            <div className="col-span-2 text-center text-sm text-slate-500 py-3 bg-slate-100 rounded-lg">
              +{overflowCount} more order{overflowCount > 1 ? 's' : ''} in queue
            </div>
          )}
```

**The chain, and this is the answer to "the mechanism":**

1. `auto-fill` resolves the **explicit** grid to **one** track at phone width (§2.2).
2. `col-span-2` sets `grid-column: span 2 / span 2` on the placeholder — it demands **two** tracks.
3. A grid item spanning past the explicit grid causes the browser to create an **implicit** column.
4. 🔴 **THE IMPLICIT COLUMN IS NOT `minmax(240px, 1fr)`.** Implicit tracks are sized by
   `grid-auto-columns`, which is unset here and therefore defaults to **`auto`**. So column 1 is
   `1fr` (min 240px) and column 2 is `auto` — **two columns sized by different rules, which is exactly
   "the right-hand column is narrower than the left"**.
5. With two columns present, default `grid-auto-flow: row` places the **order cards** across both, so
   cards land in the narrow `auto` track. `1fr + auto` exceeds the 366px container, so their contents
   have less room than they need — **the overlap**.

⚠️ **THIS IS INFERRED, NOT OBSERVED.** The code at every step is **READ**; the rendering consequence is
derived from CSS Grid's implicit-track and auto-placement rules. **I cannot observe real widths or real
overflow.**

🔴 **AND IT MAKES A SHARP, FALSIFIABLE PREDICTION THAT IS WORTH TESTING BEFORE ANYONE CHANGES A LINE:**
the placeholder renders **only when `overflowCount > 0`**, i.e. only in grid view with **more than 8
orders**. So —

> **Portrait + Grid + 8 orders or fewer should render ONE clean column with no overlap.**
> **Portrait + Grid + 9 or more orders should show the narrow second column and the overlap.**

**That is what would settle it:** open the board on a phone in portrait, in Grid, with 8 orders and then
with 9, and watch the second column appear. Devtools' grid overlay will name the second track as
implicit.

⚠️ **AND IT EXPLAINS THE LANDSCAPE ASYMMETRY WITHOUT NEEDING A SECOND CAUSE.** In landscape (≈844pt) the
explicit grid already resolves to 3 tracks, so `col-span-2` fits inside the explicit grid, creates no
implicit track, and everything is uniform.

⚠️ **ONE ALTERNATIVE I CANNOT RULE OUT FROM CODE:** something inside `OrderCard` with a `min-content`
width wider than the track would also overflow. `grep "min-w-\|minWidth\|w-\[" components/dashboard/OrderCard.tsx`
finds only `min-w-[72px]` on a button and several `min-w-0` (which *permit* shrinking). **Nothing there
sets a floor near 240px**, so I do not think it is the cause — but at 240px this codebase has a
documented history of tight fits (reference manual §3.2, and the `Cash & collected` label notes at
`:2251` and `:9289`). **CANNOT DETERMINE without rendering it.**

---

# 3. LIST vs GRID — LAYOUT ONLY, OR DIFFERENT CARDS?

🔴 **THE SAME CARD COMPONENT, RENDERED BY THE SAME `.map()`, IN THE SAME CONTAINER.** There is exactly
one render path (`kds/page.tsx:2606-2673`):

```tsx
          {displayOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-slate-300 gap-2">
              <span className="text-4xl">✓</span>
              <span className="text-sm">Queue clear</span>
            </div>
          ) : (
            visibleOrders.map(order => (
              <OrderCard
                key={order.order_key}
                …
                viewMode={boardMode}
                cardStyle={cardMode}
```

**`activeLayout` changes only the container** — `grid gap-3 items-stretch p-3` + the inline template,
versus `flex flex-col gap-3 p-3`. **It is not passed to `OrderCard` at all.** The card's appearance is
driven by `cardStyle={cardMode}` (the Full/Cook control) and `viewMode={boardMode}`, **neither of which
is the List/Grid switch**. **READ.**

## 🔴 SO: WOULD A ONE-COLUMN GRID BE IDENTICAL TO LIST? **ALMOST — AND THE DIFFERENCE IS NOT COSMETIC.**

Three differences would survive collapsing the columns, all **READ**:

| | Grid | List |
|---|---|---|
| Container | `display: grid`, one track | `display: flex; flex-direction: column` |
| **Cards shown** | 🔴 **capped at 8** | 🔴 **uncapped** |
| **Overflow placeholder** | rendered when >8 | never rendered (`overflowCount` is hard-zero) |
| Card component | `OrderCard`, same props | `OrderCard`, same props |
| Done-today strip | not rendered | rendered (`boardMode === 'window' && activeLayout === 'list'`, `:2683`) |

**Visually the cards would be identical. The board would not be** — one-column Grid would still stop at
8 and print the placeholder, and would still omit the Done strip.

---

# 4. 🔴 THE CARD LIMIT — WHAT DECIDES IT, AND WHERE IT LIVES

**A plain constant, computed once per render. `kds/page.tsx:1688-1696`, quoted in full:**

```tsx
  // Grid (BOTH views, now equally dense) shows up to 8; list views are uncapped (slice n/a below).
  const MAX_GRID_VISIBLE = activeLayout === 'grid' ? 8 : 6
  const visibleOrders = activeLayout === 'grid'
    ? displayOrders.slice(0, MAX_GRID_VISIBLE)
    : displayOrders
  const overflowCount = activeLayout === 'grid'
    ? Math.max(0, displayOrders.length - MAX_GRID_VISIBLE)
    : 0
```

| | |
|---|---|
| **The number** | 🔴 **8**, in grid view |
| **Where it lives** | `app/dashboard/[token]/kds/page.tsx:1689`. `grep -rn "MAX_GRID_VISIBLE" app lib components` returns **three hits, all in this file** — it is not exported, not shared, not configurable |
| **Kind** | A **hard-coded constant**. Not measured, not per-truck, not a setting |

⚠️ **THE `: 6` ARM IS DEAD CODE.** Both consumers guard on `activeLayout === 'grid'` first, so when the
layout is list, `MAX_GRID_VISIBLE` evaluates to 6 and is then never read — `visibleOrders` is
`displayOrders` and `overflowCount` is `0`. **The 6 has no effect on anything today.** **READ.**

## 🔴 A DISCREPANCY BETWEEN THE CODE AND WHAT YOU SAW, AND IT IS WORTH KNOWING

You observed **six cards and "+27 more"** — 33 orders. The code above yields **eight and "+25"** for 33.

`git log -p -S "MAX_GRID_VISIBLE"` shows the line's **original** form:

```
+  const MAX_GRID_VISIBLE = activeView === 'cook' && activeLayout === 'grid' ? 8 : 6
```

🔴 **UNDER THE ORIGINAL RULE, GRID IN *WINDOW* VIEW CAPPED AT 6 — AND 6 + 27 = 33 EXACTLY.** The cap was
later widened to 8 for both views (reference manual §3.1: *"visible cap 8 for grid"*).

**INFERRED, and the most likely explanation: the build you were looking at predates that change** — or
the observation does. **CANNOT DETERMINE which**; checking the deployed bundle, or reloading and
counting again, would settle it. ⚠️ **It matters, because "six" and "eight" point at different code.**

---

# 5. IS THE LIMIT ADAPTIVE TO VIEWPORT?

## 🔴 NO. NOT IN ANY WAY.

**Stated plainly, as asked: the same number of cards renders on a phone and on a 13-inch iPad — eight.**

`MAX_GRID_VISIBLE` is a literal. Nothing in its expression reads a width, a breakpoint, a device class,
an orientation or a container size — and §2.1's search confirms the file measures nothing at all.
**READ.**

⚠️ **THIS IS EXACTLY THE MISMATCH BEHIND PROBLEM 2.** The *columns* are viewport-adaptive
(`auto-fill`); the *card count* is not. On a wide desktop the grid resolves to 5–6 tracks, so 8 cards
fill **one row and a fragment of a second**, and the rest of the height is the placeholder plus empty
space — which is the "six cards then a large empty region" you saw. **The two halves of the layout
disagree, and only one of them knows how big the screen is.**

---

# 6. THE "+N MORE ORDERS IN QUEUE" ELEMENT

Quoted in full at §2.3 above. `kds/page.tsx:2675-2679`.

| | |
|---|---|
| **Element** | a plain `<div>` |
| **Interactive?** | 🔴 **NO.** No `onClick`, no `onKeyDown`, no `role`, no `tabIndex`, no `href`, no `button` |
| **What happens if tapped** | 🔴 **NOTHING. It is not a control.** It cannot be expanded, and there is no "show all" anywhere on this surface |
| **Styling** | `col-span-2 text-center text-sm text-slate-500 py-3 bg-slate-100 rounded-lg` — ⚠️ **grey, not a button colour, so it does not invite a tap** |

⚠️ **AND ITS ONE FUNCTIONAL CLASS IS THE `col-span-2` FROM §2.3.** The element that reports the overflow
is also the element that breaks the portrait grid. **The two problems in this brief share a line.**

---

# 7. DOES THE BOARD SCROLL?

## ✅ YES — the queue panel scrolls vertically. It is not a fixed-height, overflow-hidden board.

The chain, **READ**, outermost first:

```
layout.tsx:10   w-screen h-dvh overflow-hidden m-0 p-0        ← the window is pinned, no page scroll
page.tsx:1760   w-full h-full flex flex-col … overflow-hidden ← the page fills it, no page scroll
page.tsx:2588   flex flex-1 min-h-0                           ← min-h-0 lets the child actually shrink
page.tsx:2591   flex flex-col flex-1 min-w-0 overflow-y-auto  ← 🔴 THE SCROLLER
```

🔴 **SO THE PRODUCT DECISION THAT WAS BUILT IS: THE PAGE DOES NOT SCROLL, THE QUEUE DOES.** The header,
the event bar and the To-make strip stay pinned; the order area scrolls under them.

🔴 **WHICH MAKES THE 8-CARD CAP THE ODD ONE OUT.** In **list** view the same panel scrolls through
**every** order, uncapped. In **grid** view it scrolls through at most 8 and then stops. **The container
was built to scroll; the grid branch is what prevents it.** That is a statement about what is there, not
a proposal.

⚠️ **The `overflow-hidden` on the two ancestors is deliberate and documented** — `layout.tsx:3-9`
records the `h-screen` → `h-dvh` change made because, in mobile Safari, `100vh` put the bottom of the
board under the address bar *"and the shell's overflow-hidden meant it could not be scrolled to"*.

---

# 8. IS THE CAP EXPLAINED ANYWHERE? — 🔴 THE HISTORY IS ALMOST SILENT

**Searched:** the code comment at `:1688`; `grep -rn "MAX_GRID_VISIBLE"` across `app lib components`;
`docs/reference-manual.md` for `MAX_GRID_VISIBLE`, `more orders in queue`, `cap`, `glanceable`,
`at a glance`, `auto-fill`, `240px`.

**Everything that exists about it:**

1. The in-code comment, which states the rule and not the reason:
   > `// Grid (BOTH views, now equally dense) shows up to 8; list views are uncapped (slice n/a below).`
2. The reference manual, §3.1 of the KDS suite (`docs/reference-manual.md:3417`):
   > **3.1 Window grid density:** unified both views' grid to `repeat(auto-fill, minmax(240px, 1fr))`
   > (~4 across; was Window's fixed `grid-cols-2 xl:grid-cols-3` ~3 across); **visible cap 8 for grid**;
   > per-mode nudges gated `viewMode==='window'` so Solo is unaffected.
3. The original commit (`1d3d73c`, *"building"*) introduced the cap with **no rationale in the message**.

🔴 **NO GLANCEABLE-BOARD ARGUMENT IS RECORDED ANYWHERE.** The manual documents the *density* decision at
length — why 240px, why ~4 across, why the two-row header — and records the cap only as a number
alongside it. **`grep` for "glanceable" returns nothing; "at a glance" returns two hits, neither about
this cap.**

⚠️ **INFERRED, AND ONLY THAT:** "8" reads like a number chosen to fill **two rows of four** at the
~4-across density §3.1 was tuning — which would make it a *fit* judgement for one viewport, hard-coded,
and never revisited when the columns became viewport-adaptive. **The history does not say this and I
cannot verify it.** The commit author would settle it.

---

# 9. WHAT ELSE USES THIS LAYOUT? — 🔴 THE ORDERS SCREEN DOES **NOT** SHARE IT

**I read `app/dashboard/[token]/page.tsx` for this section**, and it is a different implementation.

```tsx
<div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 gap-3">{pendingOrders.map(o=><OrderCard …/>)}</div>
```
`app/dashboard/[token]/page.tsx:3677` (pending) and `:3683` (confirmed).

| | KDS board | Dashboard Orders |
|---|---|---|
| Column rule | inline `repeat(auto-fill, minmax(240px, 1fr))` | **Tailwind container queries** `grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3` |
| Responds to | the **container's** free width, continuously | the **container's** width, at 2 breakpoints |
| **Card cap** | 🔴 **8 in grid** | ✅ **none** — `grep "MAX_GRID\|slice(0, 8)\|slice(0, 6)\|overflowCount"` over that file returns **nothing** |
| Overflow placeholder | yes | **no** |
| One grid or several | one | **several — one per status bucket** (pending, confirmed, …) |
| Card component | `OrderCard` | `OrderCard` — 🔴 **the same component** |

🔴 **SO THE TWO SURFACES SHARE THE CARD AND NOTHING ELSE ABOUT THE LAYOUT.** The dashboard already does
the thing Problem 2 is asking for — it renders every order and lets the page scroll. **Changing the KDS
grid cannot affect the Orders screen, and vice versa.** **READ.**

⚠️ **ONE SHARED CONSTRAINT THAT WOULD FOLLOW ANY CHANGE:** `OrderCard` is the same component on both, so
its internals are tuned for **the narrower of the two**, which is the KDS's 240px column. The manual
records that tuning repeatedly (§3.2's two-row header *"fixes overflow at 240px"*; the `Cash & collected`
label that *"cannot be labelled honestly at a 240px KDS column"*). **Anything that changes the KDS
column width changes the environment those decisions were made in.**

---

# 10. WHAT COULD NOT BE DETERMINED

| Question | Why | What would settle it |
|---|---|---|
| Whether the implicit-column mechanism (§2.3) is the real cause | it is a CSS-semantics inference; I cannot render | Phone portrait, Grid, with 8 orders then 9. Devtools grid overlay will name the second track implicit |
| Whether an `OrderCard` internal min-width also contributes | nothing near 240px found, but the card is 1,200+ lines | same session, inspect a card's computed `min-content` width |
| Why you saw 6 cards and not 8 | the code says 8; the *original* logic said 6 for window+grid | check the deployed bundle, or reload and recount |
| Whether the 8 was a two-rows-of-four fit judgement | no rationale is recorded anywhere | ask the author of `1d3d73c` |
| Actual rendered widths and real overflow | not observable from source | devtools |
