# Add Order item grid — what a category-view setting would change

Date: 14 August 2026
Status: READ-ONLY INVESTIGATION. **No file was edited. No migration written or run. No write of any kind.**
No `next dev`, no `next build`.

🔴 **Pizzeria Gusto was not touched.** One read-only `SELECT` set answered item 5 (menu_categories +
menu_items_db + trucks). Reads only.

**HEADLINE:** the tabs are **one component, one mount point, two render paths** (tablet grid / phone
list) sharing one `categoryTabs` element. Category order **is** operator-controlled and persisted, which
is good news for a scroll view. The blast radius is small — **but there is no `IntersectionObserver`
anywhere in the repo**, so the scroll-spy is genuinely new, and the operator panel's scroll container is
**not** the window, which makes the customer page's existing scroll-pin logic unusable here.

⚠️ **Nothing in the prompt arrived garbled. No instruction contradicted another.** One premise in the
brief needs correcting before you write it up: **`truck_vans.display_layout` is read but has no consumer
anywhere**, and **`trucks.display_mode` has no Settings UI at all any more** — section 4a.

---

## 1. THE CURRENT GRID

### a. The component, the state, and the filter

**`components/dashboard/AddOrderPanel.tsx`** — 2,271 lines. Everything below is in that one file.

**State**, [components/dashboard/AddOrderPanel.tsx:171-172](components/dashboard/AddOrderPanel.tsx#L171-L172):

```tsx
// Operator Add Order: which top-level category tab is selected (null ⇒ default to the first).
const [activeMenuCat, setActiveMenuCat] = useState<string | null>(null)
```

**The category list and the resolved selection**, [:1592-1597](components/dashboard/AddOrderPanel.tsx#L1592-L1597):

```tsx
const menuCats = [
  ...categoryOrder.filter(cat => menuGroups[cat]?.length),
  ...Object.keys(menuGroups).filter(cat => !categoryOrder.includes(cat) && menuGroups[cat]?.length),
]
// Default to the first category; self-heal if the active tab disappears (menu reload / now-empty cat).
const selectedMenuCat = (activeMenuCat && menuCats.includes(activeMenuCat)) ? activeMenuCat : (menuCats[0] ?? null)
```

⚠️ **`menuGroups[cat]?.length` silently drops EMPTY categories.** Gusto's `Specials` has 0 items, so it
has no tab today. **In a continuous scroll you must decide whether an empty category gets a heading** —
today the question never arises.

**The chip bar**, [:1611-1628](components/dashboard/AddOrderPanel.tsx#L1611-L1628):

```tsx
// Sticky, finger-sized (≥44px) category tab bar. Horizontal-scrolls on a narrow width — never off-screen.
const categoryTabs = menuCats.length > 1 ? (
  <div className="sticky top-0 z-10 bg-white pt-3 pb-2 mb-2 border-b border-slate-100">
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
      {menuCats.map(cat => (
        <button key={cat} onClick={() => setActiveMenuCat(cat)}
          className={`shrink-0 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-black uppercase tracking-wide transition-colors active:scale-95 ${
            cat === selectedMenuCat ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}>
          {cat.charAt(0).toUpperCase() + cat.slice(1)}{categoryStocks.find(s => s.category === cat)?.available === false && ' 🔒'}
        </button>
      ))}
    </div>
  </div>
) : null
```

🔴 **The filter is not a `.filter()` — it is an index lookup**, and there are **two** of them:

| Render path | Line | Expression |
|---|---|---|
| `menuGrid` (tablet/desktop, tiles) | [:1656](components/dashboard/AddOrderPanel.tsx#L1656) | `sortMenuItems(menuGroups[selectedMenuCat] \|\| []).map(item => …)` |
| `menuList` (phone, rows) | [:1721](components/dashboard/AddOrderPanel.tsx#L1721) | `sortMenuItems(menuGroups[selectedMenuCat] \|\| []).map(item => …)` |

**Both are gated on `{selectedMenuCat && (…)}`** ([:1644](components/dashboard/AddOrderPanel.tsx#L1644),
[:1719](components/dashboard/AddOrderPanel.tsx#L1719)) and **both render `{categoryTabs}{closedBanner}`
first** ([:1642-1643](components/dashboard/AddOrderPanel.tsx#L1642-L1643),
[:1717-1718](components/dashboard/AddOrderPanel.tsx#L1717-L1718)).

⚠️ **A scroll view has to change BOTH, and they are near-identical but not shared.** The item card
bodies differ (tiles vs rows) but the surrounding "tabs, banner, one category's items" scaffold is
duplicated. **That duplication is where a category-view branch would double into four paths if it is not
factored first.**

⚠️ **Two more things ride on `selectedMenuCat` and would need a new meaning in scroll mode:**

- **`closedBanner`** ([:1632-1638](components/dashboard/AddOrderPanel.tsx#L1632-L1638)) — one banner for
  *the selected* category. In a scroll there is no single selected category; the banner would have to
  become per-section, or follow the scroll-spy.
- **`catBasketQty` / `catSt`** ([:1664](components/dashboard/AddOrderPanel.tsx#L1664),
  [:1672](components/dashboard/AddOrderPanel.tsx#L1672)) — both computed from `selectedMenuCat` **inside
  the item loop**, so in a continuous scroll they would be wrong for every section but one. **These read
  like per-item values and are not.** 🔴 They gate stock counts on the tiles; getting this wrong shows an
  operator the wrong "N left".

**Item sort within a category**, [:1604-1610](components/dashboard/AddOrderPanel.tsx#L1604-L1610): pure
alphabetical today (`sort_priority`/`featured` are read but no such column exists), with a comment
explaining the intended future tier.

### b. Where categories come from, and whether the ORDER is operator-controlled

**🔴 STORED, AND OPERATOR-CONTROLLED BY DRAG AND DROP. The order is deliberate, not incidental.**

The chain, end to end:

| Step | Location |
|---|---|
| Column | `menu_categories.sort_order` |
| Read, ordered | [app/api/menu/[truckId]/route.ts:68-73](app/api/menu/[truckId]/route.ts#L68-L73) — `.order('sort_order', { ascending: true }).order('name')` |
| Delivered as | `truckMenu.categories` (array order = sort_order) |
| Turned into `categoryOrder` | [app/dashboard/[token]/page.tsx:2182-2185](app/dashboard/[token]/page.tsx#L2182-L2185) — `truckMenu?.categories?.map(c => c.name) ?? []` |
| Turned into `menuGroups` | [app/dashboard/[token]/page.tsx:2437](app/dashboard/[token]/page.tsx#L2437) — `groupByCategory(truckMenu.items, truckMenu.categories?.map(c => c.name))` |
| Consumed | `menuCats` above |
| **Written by** | 🔴 **drag-and-drop in Manage → Menu**, [app/manage/[token]/page.tsx:3876-3882](app/manage/[token]/page.tsx#L3876-L3882) — `newCategories.map((c, i) => api('update_category_order', { id: c.id, sort_order: i + 1 }))` |
| Server handler | [app/api/manage/route.ts:626-628](app/api/manage/route.ts#L626-L628) |

`groupByCategory` ([lib/basket-utils.ts:194-230](lib/basket-utils.ts#L194-L230)) emits ordered categories
first, then any stragglers, **de-duplicating by name** — the comment records that two category rows with
the same name previously produced a React duplicate-key warning on the tab bar.

**So the order is stable, intentional and already editable.** ⚠️ **And your instinct in the brief is
right and is confirmed by the data:** Tikka Tonic's stored order is **Starters → Sides → Mains → Dips &
Sauces**. Mains third. A tab bar makes that a shrug; a continuous scroll makes an operator scroll past
starters and sides to reach the food. **The setting will expose an ordering nobody has had to look at.**

### c. Is the component shared? — **NO. One mount point.**

🔴 **`AddOrderPanel` is imported once and mounted once:**
[app/dashboard/[token]/page.tsx:38](app/dashboard/[token]/page.tsx#L38) (import) and
[:3306](app/dashboard/[token]/page.tsx#L3306) (mount).

- **The KDS does NOT use it.** [app/dashboard/[token]/kds/page.tsx:1341](app/dashboard/[token]/kds/page.tsx#L1341)
  passes `categoryOrder` to **`OrderCard`**, a different component. The KDS has no Add Order panel.
- **The customer order page does NOT use it** — section 3.
- **No modal wraps it.** It is rendered inline in the dashboard's tab area, and
  [:3303](app/dashboard/[token]/page.tsx#L3303) records that it is **hidden via CSS, never unmounted**,
  so its state survives tab switches. ⚠️ **That matters for a scroll view: the scroll position would
  also survive a tab switch**, which is probably desirable but is a behaviour you get for free and
  should decide about.

**Shared in the other direction** (children it uses, which a scroll view does not change):
`OrderLineItem`, `OptionStockBadge`, `DemoLockChip` — all shared with other surfaces, none involved in
category navigation.

**Blast radius: one component, one screen, two render paths inside it.**

---

## 2. LAYOUT

### a. The two panes, and what scrolls

[components/dashboard/AddOrderPanel.tsx:1888-1919](components/dashboard/AddOrderPanel.tsx#L1888-L1919):

```tsx
return (
  <>
    {/* ── iPad / desktop: two-column split ── */}
    <div className="hidden md:flex flex-1 min-h-0 -mx-4">

      {/* LEFT — scrollable menu */}
      <div className="@container w-[58%] min-h-0 overflow-y-auto border-r border-slate-200 p-4">
        {eventBanner}
        {dealsButton}
        {truckMenu ? menuGrid : <p className="text-slate-400 text-sm animate-pulse">Loading menu…</p>}
      </div>

      {/* RIGHT — cart + submit */}
      <div className="w-[42%] flex flex-col min-h-0 bg-white overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {hasItems ? cartLines : ( …empty basket… )}
        </div>
        {submitPanel}
      </div>
    </div>

    {/* ── Phone: single column ── */}
    <div className="md:hidden flex-1 min-h-0 overflow-y-auto pb-24">
      {eventBanner}
      {dealsButton}
      {truckMenu ? menuList : <p …>Loading menu…</p>}
    </div>
```

**🔴 YES — the panes scroll independently, and this is the single most favourable fact in the report.**

| Element | Scroll |
|---|---|
| Left menu pane [:1894](components/dashboard/AddOrderPanel.tsx#L1894) | 🔴 **its own `overflow-y-auto`** — `@container`, 58% width |
| Right cart list [:1902](components/dashboard/AddOrderPanel.tsx#L1902) | its own `overflow-y-auto`, `flex-1 min-h-0` |
| Right submit panel [:1910](components/dashboard/AddOrderPanel.tsx#L1910) | outside the scroller — always visible |
| Phone column [:1915](components/dashboard/AddOrderPanel.tsx#L1915) | one `overflow-y-auto`, `pb-24` for the fixed bottom bar |
| Phone bottom bar [:1922](components/dashboard/AddOrderPanel.tsx#L1922) | `fixed bottom-0 … z-20` |

**A continuous scroll is contained to the left pane on tablet and to the single column on phone. The
cart never moves.** And the existing `sticky top-0` on `categoryTabs` already sticks **to that pane**,
not to the window — the comment at [:545-548](components/dashboard/AddOrderPanel.tsx#L545-L548) records
that a measured `--addorder-sticky-top` was **removed** in favour of plain `top-0` precisely because the
header now always lives inside the scroll container.

⚠️ **So the chip bar's sticky is already correct for a scroll view.** What is new is that the **section
headings** need `top-[height-of-chip-bar]`, and that height is `pt-3 pb-2` + a 44px button ≈ **64px** —
**INFERRED from the classes; not measured.** A two-level sticky stack is the part to get right.

### b. Where "Start Event" sits

🔴 **Inside the left scrolling pane, above the menu — so it scrolls away.**

`eventBanner` is rendered at [:1895](components/dashboard/AddOrderPanel.tsx#L1895) (tablet) and
[:1916](components/dashboard/AddOrderPanel.tsx#L1916) (phone), defined at
[:1831-1884](components/dashboard/AddOrderPanel.tsx#L1831-L1884). The **Start Event / Restart Event**
button is at [:1859-1863](components/dashboard/AddOrderPanel.tsx#L1859-L1863), nested inside the
`manualEvent` card:

```tsx
<button onClick={() => isDemo ? onLockedEventAction?.() : onOpenEvent(manualEvent.id)}
  className={`mt-2 w-full font-bold py-2.5 rounded-xl text-sm transition-all …`}>
  {isDemo && <span aria-hidden>🔒 </span>}{liveEvent?.status === 'closed' ? 'Restart Event' : 'Start Event'}
</button>
```

⚠️ **Three things about its position that bear on this work:**

1. **The whole banner is `hidden sm:block`** ([:1832](components/dashboard/AddOrderPanel.tsx#L1832)) —
   so on a phone the Start Event button **does not render at all**, even though `eventBanner` is placed
   in the phone column.
2. **It only renders when `liveEvent?.status !== 'open'`** ([:1831](components/dashboard/AddOrderPanel.tsx#L1831))
   — during trading it is absent, and the menu starts at the top of the pane.
3. 🔴 **It sits ABOVE the sticky chip bar in the same scroller.** Today, scrolling a long category pushes
   the banner away and pins the tabs. In a continuous scroll that is unchanged — **but the deals button
   ([:1896](components/dashboard/AddOrderPanel.tsx#L1896)) is also above the sticky bar**, so a
   scroll-spy that scrolls a section to `top` must account for the chip bar's pinned height or the first
   item of each section lands underneath it. **That is the exact bug the customer page already had and
   fixed** — see 2c.

### c. Existing sticky / scroll-spy patterns — reuse what exists, and know what does not

**🔴 `IntersectionObserver`: ZERO occurrences in the entire repo.** Grepped across `app/`, `lib/`,
`components/`. **The scroll-spy is new code with no in-house precedent.**

**`scrollIntoView` — five call sites, none a scroll-spy:**

| Site | Use |
|---|---|
| [app/manage/[token]/page.tsx:6775](app/manage/[token]/page.tsx#L6775) | scroll to the add-event form |
| [app/trucks/[slug]/order/page.tsx:3176](app/trucks/[slug]/order/page.tsx#L3176) | keep a focused input above the keyboard |
| [components/dashboard/DemoLoopComplete.tsx:172](components/dashboard/DemoLoopComplete.tsx#L172) | demo choreography |
| [components/manage/Walkthrough.tsx:63](components/manage/Walkthrough.tsx#L63) | `inline: 'center'` — centres a tour target |
| [components/manage/PaymentsTab.tsx:305](components/manage/PaymentsTab.tsx#L305) | 🔴 **`behavior: reduceMotion ? 'auto' : 'smooth'`** — the repo's only reduced-motion-aware scroll. **Copy this shape** |

**Smooth scrolling / scroll offsets:**

- [app/landing/landing.css:64](app/landing/landing.css#L64) — `scroll-behavior: smooth` scoped to the
  landing page only, with a `prefers-reduced-motion` cancel at [:149](app/landing/landing.css#L149).
  **Not global**, so a chip tap would need its own `behavior`.
- 🔴 [app/trucks/page.tsx:108](app/trucks/page.tsx#L108) — `className={isFirstOfLetter ? 'scroll-mt-[200px]' : ''}`.
  **This is the closest existing precedent: a jump-to-section index that offsets the target for pinned
  chrome via `scroll-mt`.** It is a class, not JS, and it is exactly the mechanism the sticky chip bar
  needs. **Reuse `scroll-mt-*` rather than computing offsets in an effect.**

**🔴 THE ONE THING THAT LOOKS REUSABLE AND IS NOT** — the customer page's tab-change scroll,
[app/trucks/[slug]/order/page.tsx:456-462](app/trucks/[slug]/order/page.tsx#L456-L462):

```tsx
useEffect(() => {
  if (!categoryScrollMounted.current) { categoryScrollMounted.current = true; return }
  const el = menuTopRef.current
  if (!el) return
  const menuTop = el.getBoundingClientRect().top + window.scrollY
  window.scrollTo({ top: Math.max(0, menuTop - stickyTop), behavior: 'auto' })
}, [activeCategory, stickyTop])
```

It solves the right problem — *land the section under the pinned bar, not at document top* — and the
comment at [:448-455](app/trucks/[slug]/order/page.tsx#L448-L455) records the demo-banner bug it fixed by
using a **measured** `stickyTop` rather than a hardcoded 60. ⚠️ **But it operates on `window.scrollY` /
`window.scrollTo`, and the operator panel's menu is an inner `overflow-y-auto` div.** Ported as-is it
would scroll the page, not the pane. **Take the lesson (measure the pinned height; scroll to
`sectionTop - stickyHeight`; use `'auto'` not `'smooth'` for far jumps), not the code.**

Also worth knowing: [:2455](app/trucks/[slug]/order/page.tsx#L2455) pads a short category to roughly a
viewport (`minHeight: menuMinHeight`) **so the tab bar can actually pin**. 🔴 **A continuous scroll
inherits that problem for its LAST category** — the final section cannot scroll to the top of the pane
unless there is content beneath it, so the scroll-spy will never highlight the last chip. **This is the
single most likely defect in the finished feature.**

---

## 3. THE CUSTOMER ORDER PAGE

### a. Same pattern, **separate implementation** — it shares the problem, not the component

🔴 **Confirmed: the customer page uses the same tabbed-category design, written out again inline in
`app/trucks/[slug]/order/page.tsx`. There is no shared tab component.**

State, [:275](app/trucks/[slug]/order/page.tsx#L275):
```tsx
const [activeCategory, setActiveCategory] = useState<string | null>(null)  // customer menu category tab
```

Resolution, [:1104-1106](app/trucks/[slug]/order/page.tsx#L1104-L1106) — **the same self-heal comment,
almost word for word**:
```tsx
const menuCategories = useMemo(() => groupedMenu.map(([cat]) => cat), [groupedMenu])
// Default to the first category; self-heal if the active tab disappears (menu reload / now-empty cat).
const selectedCategory = (activeCategory && menuCategories.includes(activeCategory)) ? activeCategory : (menuCategories[0] ?? null)
```

The bar, [:2434-2450](app/trucks/[slug]/order/page.tsx#L2434-L2450):
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

And the filter, [:2456](app/trucks/[slug]/order/page.tsx#L2456):
```tsx
{groupedMenu.filter(([category]) => selectedCategory == null || category === selectedCategory).map(…)}
```

**What is shared:** `groupByCategory` (`lib/basket-utils.ts`) and the `menu_categories.sort_order`
ordering. **What is duplicated:** the button classes are **character-for-character identical** to the
operator bar's, and the "default to first / self-heal" logic is a near-verbatim second copy.

**Three differences that matter if you ever unify them** (you said you are not changing it here — noted,
and I have not):

| | Operator (`AddOrderPanel`) | Customer (order page) |
|---|---|---|
| Scroll container | 🔴 an inner `overflow-y-auto` pane | 🔴 **the window** |
| Sticky offset | `top-0` (fixed class) | `style={{ top: stickyTop }}` — **measured**, includes the demo banner |
| Sub-categories | 🔴 **not rendered** ([:1589-1591](components/dashboard/AddOrderPanel.tsx#L1589-L1591) says so explicitly) | **rendered** — `groupBySubcategory` at [:2457](app/trucks/[slug]/order/page.tsx#L2457) |
| Tab-change scroll | none | `window.scrollTo` effect ([:456](app/trucks/[slug]/order/page.tsx#L456)) |

⚠️ **The sub-category difference is the reason a shared component would be a bigger job than it looks**,
and it is also a design question for the scroll view: the customer page already has a two-level heading
hierarchy; the operator screen deliberately has none. **A continuous operator scroll with sticky category
headings moves the operator screen one step toward the customer page's structure without adopting its
sub-categories.**

---

## 4. THE SETTING

### a. Existing per-truck display settings — and two corrections to the brief

| Setting | Stored | Allowed values | Allow-list | Actually consumed? |
|---|---|---|---|---|
| `trucks.crew_mode` | `trucks` | `'solo' \| 'full'` | `update_truck` [:854](app/api/manage/route.ts#L854) | ✅ yes |
| `trucks.kds_mode` | `trucks` | `boolean` | `update_truck` [:854](app/api/manage/route.ts#L854) | ✅ yes |
| 🔴 `trucks.display_mode` | `trucks` | `'list' \| 'grid'` | `update_truck` [:854](app/api/manage/route.ts#L854) | ⚠️ **read at exactly ONE place** — [app/dashboard/[token]/kds/page.tsx:858](app/dashboard/[token]/kds/page.tsx#L858), the KDS card list/grid switcher. **Nothing on the Add Order screen reads it** |
| `trucks.qr_code_style` | `trucks` | `'standard' \| 'branded'` | `update_truck` [:854](app/api/manage/route.ts#L854) | ✅ yes |
| `trucks.completion_presses` | `trucks` | `'one' \| 'two' \| null` | `update_truck` [:854](app/api/manage/route.ts#L854) | ✅ yes |
| `trucks.allergen_display_mode` | `trucks` | `'per_dish' \| 'card' \| 'both' \| null` | 🔴 **`update_settings`**, a *different* list — [app/api/manage/route.ts:798](app/api/manage/route.ts#L798) | ✅ yes |
| `trucks.keep_screen_on` | `trucks` | `boolean` | — (not on `update_truck`) | ✅ yes |
| `truck_vans.show_cooking_step` | `truck_vans` | `boolean` | `update_van_settings` [:977-989](app/api/manage/route.ts#L977-L989) — an **explicit `if (x !== undefined)` chain**, not an array | ✅ yes |
| `truck_vans.order_ready_enabled` | `truck_vans` | `boolean` | `update_van_settings` | ✅ yes |
| 🔴 `truck_vans.display_layout` | `truck_vans` | **unknown** | ❌ **not writable by any action** | 🔴 **NO CONSUMER ANYWHERE** |
| `truck_vans.split_screen` | `truck_vans` | **unknown** | ❌ not writable | 🔴 **no consumer** |

**🔴 TWO CORRECTIONS TO THE BRIEF'S PREMISE:**

1. **`truck_vans.display_layout` is dead.** It is `select`ed at
   [app/api/manage/route.ts:963](app/api/manage/route.ts#L963) alongside `split_screen` and then **never
   read by any component** — grep for `display_layout` / `displayLayout` across `app/` and `components/`
   returns **nothing but that select**. It is not on `update_van_settings`'s allow-list either, so
   nothing can write it. **It is not a precedent to follow; it is a column to be aware of.**
2. **`trucks.display_mode` has no Settings control.** `Manage` holds
   `const [displayMode, setDisplayMode] = useState<'list' | 'grid'>((truck as any).display_mode ?? 'list')`
   ([app/manage/[token]/page.tsx:8351](app/manage/[token]/page.tsx#L8351)) and
   `handleDisplayModeChange` ([:8653-8657](app/manage/[token]/page.tsx#L8653-L8657)) — and **grep finds
   no caller for `handleDisplayModeChange` and no render site for `displayMode`.** The state and its
   saver are orphaned; the value is only changed from the KDS's own session switcher. ⚠️ **So there is
   no existing "display" group in Settings for a new control to join.**

### b. Where a new control would go, and a comparable one quoted

**The natural home is the Manage → Settings card that already holds `completion_presses`** — the page's
established two-option-with-descriptions control. [app/manage/[token]/page.tsx:9421-9475](app/manage/[token]/page.tsx#L9421-L9475):

```tsx
<div className="py-3">
  <p className="text-sm font-semibold text-slate-800">Completing an unpaid order</p>
  <p className="text-xs text-slate-500 mt-0.5">What happens when an unpaid order is ready to hand over.</p>
  <div className="flex flex-col gap-2 mt-2">
    {([
      ['one', 'One press (“Mark paid & collected”)', 'Best when you take the money as you hand the food over. …'],
      ['two', 'Two presses (“Mark paid” & “Collected”)', 'Best when payment and handover happen at different moments — …'],
    ] as const).map(([v, lbl, help]) => (
      <button type="button" key={v}
        onClick={() => { setForm(p => ({...p, completion_presses: v})); saveSetting('completion_presses', v) }}
        className="w-full text-left flex items-start gap-2 cursor-pointer">
        <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${completionPresses === v ? 'border-orange-500' : 'border-slate-300'}`}>{completionPresses === v && <span className="w-2 h-2 rounded-full bg-orange-500" />}</span>
        <span className="text-sm">
          <span className="font-medium text-slate-700">{lbl}</span>
          <span className="block text-xs text-slate-400">{help}</span>
        </span>
      </button>
    ))}
  </div>
</div>
```

⚠️ **Its own comment tells you why this shape and not a toggle**
([:9415-9417](app/manage/[token]/page.tsx#L9415-L9417)): *"RADIO, not a toggle: two named alternatives
that each need their own explanation… A toggle would need a single label that reads true in one direction
only."* **Tabs vs continuous scroll is exactly that case** — neither is the "on" state of the other.

⚠️ And [:9445-9449](app/manage/[token]/page.tsx#L9445-L9449) records that a **native
`<input type="radio">` was tried and rejected** because it renders in the browser's accent rather than
the page's orange. **Use the drawn radio.**

### c. What adding one actually needs — four things, and one of them is easy to forget

| # | Needed? | Detail |
|---|---|---|
| 1 | 🔴 **YES — a migration** | `ALTER TABLE trucks ADD COLUMN IF NOT EXISTS <name> text NOT NULL DEFAULT 'tabs';` — the shape of [supabase/migrations/20260529_qr_code_style.sql](supabase/migrations/20260529_qr_code_style.sql), which is two lines. **A NOT NULL DEFAULT matching today's behaviour makes it inert**, which is what keeps Gusto unchanged |
| 2 | 🔴 **YES — an allow-list entry** | **`update_truck`'s `allowed` array**, [app/api/manage/route.ts:854](app/api/manage/route.ts#L854) — the same list `display_mode`, `qr_code_style` and `completion_presses` are on. ⚠️ **NOT `update_settings`** ([:798](app/api/manage/route.ts#L798)), which is the allergen/profile list |
| 3 | ✅ **NO route change** | [app/api/dashboard/route.ts:77](app/api/dashboard/route.ts#L77) is `.select('*')` and [:706](app/api/dashboard/route.ts#L706) spreads `publicTruckFields(truck)` — a **redact** list ([:44-61](app/api/dashboard/route.ts#L44-L61)), not an include list. Its comment: *"EVERY non-redacted column, so a new trucks.\* setting is delivered WITHOUT anyone remembering to add it here."* ⚠️ **Avoid a name matching `/(^\|_)(token\|secret\|password\|credential\|pin\|key)(_\|$)/i`** or `SECRETISH` will silently redact it |
| 4 | 🔴 **YES — two type declarations** | `Truck` in [components/dashboard/types.ts:154](components/dashboard/types.ts#L154) (beside `display_mode`) **and** the inline `interface Truck` at [app/manage/[token]/page.tsx:60](app/manage/[token]/page.tsx#L60) — a single 6,000-character line that is its own second copy of the truck shape |

🔴 **THE FAILURE MODE THE CODE ITSELF WARNS ABOUT**, [app/manage/[token]/page.tsx:9418-9420](app/manage/[token]/page.tsx#L9418-L9420):

> *"`completion_presses` must stay on update_truck's `allowed` list (app/api/manage/route.ts) — that list
> **SILENTLY DROPS unlisted keys**, so a missing entry means this appears to save, returns `{ok:true}`,
> and writes nothing."*

**Step 2 is the one that fails invisibly.** [:855-857](app/api/manage/route.ts#L855-L857) filters
`body.data` against `allowed` and then updates whatever survives — an unlisted key produces a successful
no-op.

---

## 5. HOW BIG ARE THE MENUS — one read-only SELECT

**Every truck, so you can see the range:**

| Truck | Categories | Items |
|---|---|---|
| 🔴 **Pizzeria Gusto** | **6** | **46** |
| Village Spice | 5 | 29 |
| Test Kitchen / Real Thai Food / TT3 / test truck / 2 demos | 4 | 27 |
| 🔴 **Tikka Tonic** | **4** | **12** |
| Demo Kitchen (4en5jq) | 4 | 12 |
| 2 × Demo Kitchen | 3 | 10 |

**The two you asked about, broken down in stored `sort_order`:**

**Pizzeria Gusto — 6 categories, 46 items, `sort_order` 1–6:**

| # | Category | Items |
|---|---|---|
| 1 | Pizza | 🔴 **23** |
| 2 | Specials | 🔴 **0** |
| 3 | Desserts | 4 |
| 4 | Drinks | 10 |
| 5 | Dips & Sauces | 3 |
| 6 | Dough Balls | 6 |

**Tikka Tonic — 4 categories, 12 items, `sort_order` 1–4:**

| # | Category | Items |
|---|---|---|
| 1 | Starters | 3 |
| 2 | Sides | 5 |
| 3 | Mains | 2 |
| 4 | Dips & Sauces | 2 |

🔴 **The range this has to look good across is 10 items / 3 categories to 46 items / 5 visible
categories — and the two shapes fail differently:**

- **Gusto is the hard case, and it is lopsided.** 23 of its 46 items are in ONE category. In a continuous
  scroll, **half the total scroll length is Pizza**, and Dough Balls sits at the bottom behind everything.
  At 3 tiles per column that is ~8 rows of Pizza before the second heading. **This is the layout to
  mock up.**
- **Tikka Tonic is the case where a scroll is obviously better** — 12 items across 4 categories fit in
  roughly one or two screens, so tabs cost a tap to see almost nothing. ⚠️ **But its `sort_order` puts
  Mains third, behind Starters and Sides.** A scroll view makes that visible immediately.
- 🔴 **`Specials` (0 items) has no tab today**, because `menuCats` filters on `menuGroups[cat]?.length`
  ([:1593](components/dashboard/AddOrderPanel.tsx#L1593)). **Decide explicitly whether an empty category
  gets a heading and a chip in scroll mode** — the current filter would drop it silently, which is
  probably right, but it means the chip bar and any "all categories" heading list must use the *same*
  filtered array or the spy will index off by one.

⚠️ **`available` equals the item count for every truck** — no truck currently has a menu-level
unavailable item, so **the sold-out styling in a long scroll is untested against real data**.

---

## 6. WHAT I HAVE NOT VERIFIED

1. **Nothing was rendered. No browser, no page.** Every layout claim is read from the classes. The
   ~64px chip-bar height in section 2a is **INFERRED** arithmetic (`pt-3` + 44px + `pb-2`), not measured,
   and it is the number a two-level sticky stack depends on.
2. **I did not measure the left pane's width in device pixels.** The `@container` / `@sm:grid-cols-3`
   comment at [:1646-1655](components/dashboard/AddOrderPanel.tsx#L1646-L1655) states iPad landscape
   ≈684pt and portrait ≈476pt; I took those from the comment rather than measuring, so the "~8 rows of
   Pizza" estimate in section 5 is **INFERRED**.
3. **The "no IntersectionObserver" and "no consumer for `display_layout`" claims are grep-based.** A
   dynamic or string-keyed reference would not appear. **INFERRED**, though `display_layout` not being on
   any allow-list corroborates it.
4. **`handleDisplayModeChange` having no caller is likewise grep-based** — I did not read the whole
   Settings tab to confirm no JSX path reaches it by another name.
5. **I did not check plan gating.** Whether a new display setting should sit behind `canAccess` /
   `hasFeature` was not in the brief and I did not investigate it; every setting in 4a that I looked at
   is ungated, but **I did not verify that exhaustively**.
6. **I did not open the Add Order screen for any truck**, so the claim that Gusto shows 5 tabs rather
   than 6 follows from the `menuGroups[cat]?.length` filter and the 0-item `Specials` row, not from
   observation.
7. **No write of any kind, and no schema change proposed as fact.** The column type in 4c is modelled on
   `qr_code_style`; I did not read `menu_categories`' or `trucks`' live column definitions this turn.
8. **Sub-category data was not counted.** The operator screen does not render sub-categories today, so I
   did not check how many of Gusto's 23 Pizza items carry a `subcategory_id` — **relevant if you later
   want sub-headings inside a long scrolled category**, which is the obvious next question after this one.
