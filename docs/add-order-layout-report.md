# Add Order layout setting — tabs or continuous scroll

Date: 14 August 2026
Status: DIAGNOSED, then BUILT. **Four files changed, one migration file written (NOT run).**
`tsc --noEmit` clean. Non-ASCII census **unchanged in all four**, no class gained or lost.

No `next dev`, no `next build`, no commit, no deploy. **The migration is written to disk for you to run.**

🔴 **Pizzeria Gusto's Add Order screen is unchanged.** The column defaults to `'tabs'`, every reader
resolves anything-but-`'scroll'` to `'tabs'`, and the tabs branch is the original JSX with one
substitution that provably evaluates to the same value — section 6.

**Nothing in the prompt arrived garbled. No instruction contradicted another.** Your mid-turn point about
the two surfaces affecting each other is answered in section 1d — it is one column, which is the whole
mechanism, and section 1d says what a future dashboard control would have to do.

⚠️ `git status` also lists **`lib/time-utils.ts`** — that is the **previous** task's uncommitted work
(`docs/event-times-build-report.md`), not part of this change.

---

## PART 1 — DIAGNOSIS (reported before building, as asked)

### a. Does the dashboard Settings tab render truck-level settings, and can it WRITE them?

**🔴 YES to both — it is not the case that it cannot.** Two rows on that tab write `trucks` columns
directly:

[app/dashboard/[token]/page.tsx:1288-1299](app/dashboard/[token]/page.tsx#L1288-L1299):
```tsx
const saveAutoAccept=async(val:boolean)=>{
  setSavingAutoAccept(true)
  try{
    await fetch('/api/dashboard/action',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token,pin,action:'set_auto_accept',value:val})
    })
    …
```

and the handler, [app/api/dashboard/action/route.ts:2269-2273](app/api/dashboard/action/route.ts#L2269-L2273):
```ts
if (action === 'set_auto_accept') {
  const { value } = body
  await supabase.from('trucks').update({ auto_accept: !!value }).eq('id', truck.id)
  return NextResponse.json({ success: true })
}
```

`set_notes_require_review` ([:2334-2338](app/api/dashboard/action/route.ts#L2334-L2338)) is the same
shape, and `set_online_payments_paused` ([:2275](app/api/dashboard/action/route.ts#L2275)) is a third —
flagged in its own comment as *"TRUCK-WIDE, AND UNLIKE EVERY OTHER SETTING ON THE DASHBOARD SETTINGS
TAB"*, and marked **TEMPORARY, delete with the switch**.

### b. Which action, and is it the same `update_truck` allow-list?

**🔴 NO. There is no `update_truck` action in `/api/dashboard/action` and no shared allow-list at all.**

Each truck-level setting on that route is a **bespoke, hardcoded, one-column handler** — `set_auto_accept`
writes `auto_accept` and nothing else. Grepping `/api/dashboard/action/route.ts` for `allowed` / `ALLOWED`
returns only two unrelated comments. **A new setting there means a new named action.** Your brief says
*"Do not invent a new dashboard save path"*, so that door is closed by instruction, not by capability.

### c. Where the control goes — **Manage → Settings. The home does not change.**

Three reasons, in order of weight:

1. **Instruction.** A dashboard control needs a new bespoke action; you forbade inventing one.
2. 🔴 **The dashboard tab has an explicit, documented scope rule**, and this setting would break it.
   [app/dashboard/[token]/page.tsx:3430-3443](app/dashboard/[token]/page.tsx#L3430-L3443):
   > *"**SCOPE IS A PROPERTY OF THE SCREEN, NOT OF EACH SETTING.** Dashboard → Settings is **PER-EVENT**;
   > Manage → Settings is **TRUCK-WIDE**. That holds for **EVERY option on this tab**… This is a DESIGN
   > DECISION, NOT AN UNCLOSED GAP."*
   The one truck-wide exception on that tab flags itself as an exception and is scheduled for deletion.
   **Adding a second would erode a rule the codebase states in capitals.**
3. **Manage already has the exact control shape** (`completion_presses`) and the exact save path
   (`saveSetting` → `update_truck`).

### d. 🔴 YOUR MID-TURN POINT — one column, so the surfaces cannot disagree

You said a change in one place can affect the other and vice versa. **That is exactly the arrangement
built here, and it is deliberate:**

- **One store.** `trucks.add_order_layout`. **No localStorage, no per-device value, no second source.**
- **The dashboard reads it from the same row.** `/api/dashboard` does `select('*')`
  ([app/api/dashboard/route.ts:77](app/api/dashboard/route.ts#L77)) and spreads `publicTruckFields(truck)`
  ([:706](app/api/dashboard/route.ts#L706)), so the column arrives with **no route change** (section 5).
- **Propagation.** The dashboard replaces its whole truck object on every fetch
  ([app/dashboard/[token]/page.tsx:744](app/dashboard/[token]/page.tsx#L744) `setTruck(data.truck)`), and
  a **60-second fallback poll** ([:1020](app/dashboard/[token]/page.tsx#L1020)
  `setInterval(()=>fetchAllRef.current(),60000)`) refreshes it. ⚠️ **So a change in Manage reaches an
  open dashboard within ~60s, or instantly on the next load — it is not live-pushed.**
- **The precedent is `auto_accept`.** The dashboard toggle and Manage's Settings card both write the same
  column; Manage's own comment at [app/manage/[token]/page.tsx:9313-9315](app/manage/[token]/page.tsx#L9313-L9315)
  calls it *"the same truck-level column the dashboard live-toggle writes → the two surfaces mirror on
  next load."*

🔴 **So if you later want this on the dashboard too, the rule is written into the code comment: it must
write THIS column through its own action. Never a parallel per-device value** — that is the only way the
two can drift.

---

## PART 2 — THE COLUMN

### a. The migration — written, NOT run

**[supabase/migrations/20260814_trucks_add_order_layout.sql](supabase/migrations/20260814_trucks_add_order_layout.sql):**

```sql
ALTER TABLE trucks
ADD COLUMN IF NOT EXISTS add_order_layout text NOT NULL DEFAULT 'tabs';

COMMENT ON COLUMN trucks.add_order_layout IS '…';
```

**🔴 CLASSIFICATION: ADDITIVE. NOT DEPLOY-COUPLED. SAFE TO RUN BEFORE OR AFTER THE DEPLOY.**

Stated plainly because this directory contains migrations where the answer is the opposite:

| Order | Outcome |
|---|---|
| **Migration first, then deploy** | Inert. No code reads the column yet |
| **Deploy first, then migration** | 🔴 **Also safe, and this is the half worth checking.** `/api/dashboard` reads trucks with `select('*')` and a **redact** list — it never NAMES columns, so PostgREST cannot raise 42703 for a column that does not exist. The client reads `truck?.add_order_layout === 'scroll' ? …`, so a missing column arrives `undefined` → `'tabs'` → today's behaviour |

⚠️ **Contrast [supabase/migrations/20260810_truck_events_completion_presses_override.sql](supabase/migrations/20260810_truck_events_completion_presses_override.sql)**, whose header says
*"APPLY THIS BEFORE DEPLOYING. THE REVERSE ORDER EMPTIES THE BOARD"* — precisely because **its** readers
use NAMED selects. **Ours does not. That is the whole difference.**

**No backfill is written and none is needed:** `NOT NULL DEFAULT 'tabs'` gives every existing row the
behaviour it already has, at the instant the statement runs.

### b. NOT NULL DEFAULT 'tabs' — kept

Not nullable. The migration carries the reasoning inline: a nullable column would make "unset" a third
state for a two-state setting and force a `?? 'tabs'` on every future reader.

⚠️ **No CHECK constraint**, matching `trucks.qr_code_style` and `trucks.display_mode` (both plain `text`
with a default and no CHECK). Values are enforced where they are written — the allow-list plus a
two-button control that can only emit `'tabs'` or `'scroll'` — and read defensively everywhere.

### c. `update_truck`'s `allowed` array

[app/api/manage/route.ts:854](app/api/manage/route.ts#L854), with the warning kept beside it:

```ts
// 'add_order_layout' (V11.15) is the dashboard Add Order menu presentation, 'tabs' | 'scroll'.
// It MUST stay on this list: the filter below silently drops unlisted keys, so an omission makes the
// Settings control appear to save, return {ok:true}, and write nothing.
const allowed = ['crew_mode', 'kds_mode', 'display_mode', 'add_order_layout', 'extra_wait_mins', …]
```

**Verified in the diff:** the only change to that line is the inserted `'add_order_layout'`; every other
entry, including `'display_mode'`, is byte-identical.

### d. Both `Truck` declarations

| File | Change |
|---|---|
| [components/dashboard/types.ts:154-161](components/dashboard/types.ts#L154-L161) | `add_order_layout?: 'tabs' \| 'scroll'` added to **`TruckData`** (the interface `display_mode` lives on, and the type of `AddOrderPanel`'s `truck` prop), with a doc comment on why it is optional |
| [app/manage/[token]/page.tsx:60](app/manage/[token]/page.tsx#L60) | `add_order_layout?: 'tabs' \| 'scroll'` appended to the inline `interface Truck` |

⚠️ **Optional (`?`) on both, deliberately.** Before the migration runs the key is genuinely absent from
the API response; a required field would be a type that lies for the length of the deploy window.

### e. `trucks.display_mode` — not reused, not touched

A new column, as instructed. `display_mode` appears in the diff **only** as an untouched member of the
two long lines that changed for other reasons (verified by grep over `git diff`).

---

## PART 3 — THE CONTROL

**[app/manage/[token]/page.tsx](app/manage/[token]/page.tsx), a new sub-panel in the Order settings card**, between *Taking payment* and *Opening and closing*:

```tsx
<div className="pt-3 border-t border-slate-100">
  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 divide-y divide-slate-200/70">
    <div className="pb-3">
      <p className={SUBCARD_HEADING}>Adding orders yourself</p>
      <p className="text-xs text-slate-500 mt-0.5">How the menu is laid out on the dashboard&apos;s Add order screen.</p>
    </div>
    <div className="py-3">
      <div className="flex flex-col gap-2">
        {([
          ['tabs', 'Category tabs', 'Tap a category to show just its items. Best with a long menu or one big category — you never scroll past food you are not looking for.'],
          ['scroll', 'One continuous list', 'Every category on one scrolling list with its heading pinned as you pass it. The category buttons jump you down the list and follow where you are. Best with a short menu, where tapping a tab to reveal three items costs more than it saves.'],
        ] as const).map(([v, lbl, help]) => (
          <button type="button" key={v}
            onClick={() => { setForm(p => ({ ...p, add_order_layout: v })); saveSetting('add_order_layout', v) }}
            className="w-full text-left flex items-start gap-2 cursor-pointer">
            <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${addOrderLayout === v ? 'border-orange-500' : 'border-slate-300'}`}>{addOrderLayout === v && <span className="w-2 h-2 rounded-full bg-orange-500" />}</span>
            <span className="text-sm">
              <span className="font-medium text-slate-700">{lbl}</span>
              <span className="block text-xs text-slate-400">{help}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  </div>
</div>
```

**Drawn radio, not `<input type="radio">`** — the file's own note at
[:9445-9449](app/manage/[token]/page.tsx#L9445-L9449) records that a native one renders in the browser's
accent rather than this page's orange. Two named alternatives with their own explanations; neither is the
"on" state of the other.

**The resolver**, beside `completionPresses`:
```tsx
const addOrderLayout: 'tabs' | 'scroll' = form.add_order_layout === 'scroll' ? 'scroll' : 'tabs'
```
🔴 **The identical expression is in `AddOrderPanel`**, so the card cannot show a different answer from
the screen it describes.

⚠️ **NOT in "Your trucks → Display settings", which sounds like the obvious home.** That sub-card is
**inside the per-van loop** and every control in it writes `truck_vans` via `updateVanSetting`
([app/manage/[token]/page.tsx:9855-9934](app/manage/[token]/page.tsx#L9855-L9934)). A `trucks` column
rendered there would print once per van on a multi-van truck and imply a per-vehicle scope it does not
have. **Recorded in the code comment so the next reader does not "fix" it.**

---

## PART 4 — SCROLL MODE

**One new component, `ScrollMenuSections`** ([components/dashboard/AddOrderPanel.tsx:151](components/dashboard/AddOrderPanel.tsx#L151) onward, above `AddOrderPanel`). **It is not mounted at all for a truck on `'tabs'`.**

### a. The chip bar — same place, same styling, jumps instead of filtering

The classes were **lifted verbatim** into `CHIP_BAR_CLASS` / `CHIP_ROW_CLASS` / `chipClass()`:
```tsx
const CHIP_BAR_CLASS = 'sticky top-0 z-10 bg-white pt-3 pb-2 mb-2 border-b border-slate-100'
const CHIP_ROW_CLASS = 'flex gap-1.5 overflow-x-auto scrollbar-hide'
const chipClass = (active: boolean) => `shrink-0 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-black uppercase tracking-wide transition-colors active:scale-95 ${active ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`
```
Same sticky, same `min-h-[44px]`, same orange selected state, same ` 🔒` suffix for a closed category.
⚠️ **The tabs bar still has its own copy of these strings inline** — the two are identical today and the
constant carries a note to restyle both together. **Not unified**, because doing so would edit the tabs
path, which had to stay byte-identical.

**The tap handler** replaces `setActiveMenuCat` with a scroll:
```tsx
const top = sc.scrollTop + (el.getBoundingClientRect().top - sc.getBoundingClientRect().top) - barH
sc.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
```
`- barH` lands the heading **just below** the pinned bar rather than under it.

### b. Sticky category headings

```tsx
<div style={{ top: barH }} className="sticky z-[9] -mx-1 px-1 py-1.5 bg-white/95 backdrop-blur-sm flex items-center gap-2">
```
Pinned at the **measured** bar height, not a constant — a `ResizeObserver` on the bar keeps `barH` current
through OS text scaling or a wrapped chip row, and **the same value is used by the jump**, so "where a
heading pins" and "where a tap lands" cannot disagree. `z-[9]` is below the bar's `z-10`, so a heading
slides **under** it. Sticky is scoped to each `<section>`, so each heading releases as its category ends.

**The closed-category banner moved into the section.** In tabs there is one banner for the one visible
category; in a continuous list a single banner could not say which category it meant.

### c. Scroll-spy — both directions

**Chip → scroll** is (a). **Scroll → chip** is a rAF-throttled listener that answers *which heading was
the last to pass the pin line*:
```tsx
const line = scRect.top + barH + 1
let current = cats[0] ?? null
for (const cat of cats) {
  const el = sectionRefs.current.get(cat)
  if (!el) continue
  if (el.getBoundingClientRect().top <= line) current = cat
  else break
}
setActiveCat(current)
```

🔴 **Plus a bottom clamp, which is the defect this would otherwise ship with:**
```tsx
if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) {
  setActiveCat(cats[cats.length - 1] ?? null); return
}
```
**A short last category can never bring its heading up to the pin line**, so without this the final chip
would be permanently unreachable — Gusto's `Dough Balls` (6 items, last of five) is exactly that shape.
The customer page papers over the same problem by padding its list to a viewport
(`menuMinHeight`, [app/trucks/[slug]/order/page.tsx:2455](app/trucks/[slug]/order/page.tsx#L2455)); this
answers it directly instead.

### d. The scroll container is the pane, not the window

**I did not use `IntersectionObserver`, and the reason is in the code.** IO would have worked with
`root` set to the scroller — never the default viewport — but it answers *"is this element intersecting a
band"* when the question is *"which heading was the last to pass the line"*, which IO only approximates
through `rootMargin` tuning. Asking directly is what makes the bottom clamp and the measured pin line
possible. **This is the repo's first scroll-spy; there was no IO precedent to match.**

**The scroller is resolved by walking up**, because this component renders inside **two different panes**
whose scrollers are different elements:
```tsx
function nearestScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if (oy === 'auto' || oy === 'scroll') return node
    node = node.parentElement
  }
  return null
}
```
🔴 **`window` is never read.** No `window.scrollY`, no `window.scrollTo` — the customer page's approach is
not ported.

⚠️ **BOTH PANES MOUNT AT ONCE.** The tablet split is `hidden md:flex`, the phone column `md:hidden`, so
one instance always lives in a `display:none` subtree. It owns **its own** refs and state (a component,
not shared module state), its scroll listener never fires, and every measurement returns 0 — which
`if (scRect.height === 0) return` turns into a no-op rather than a garbage active category.

### e. The lock, and why the timeout is the contract

```tsx
const onScroll = () => {
  if (lockRef.current !== null) return   // programmatic scroll in flight — do not fight it
  …
}
```
```tsx
setActiveCat(cat)                                   // light the chip on the TAP
releaseLock()
lockRef.current = window.setTimeout(releaseLock, SPY_LOCK_MS)
sc.scrollTo({ … behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
```
plus `sc.addEventListener('scrollend', releaseLock)` to end it early where supported.

🔴 **`SPY_LOCK_MS = 900`, and on the target device the timeout is what ends EVERY lock** — `scrollend` is
unsupported in older WKWebView, which is the iPad this runs on. The constant's comment says so, and says
what happens either side of it: too short re-arms the spy mid-flight (the flicker), too long makes a
manual scroll straight after a tap feel dead. **900ms is ~2× a cross-list smooth scroll — a judgement,
not a measurement.**

### f. ONE filtered array

`ScrollMenuSections` takes a single `cats` prop. **The chips and the sections both `.map()` over that
identical prop**; there is no second derivation anywhere in the component. The caller passes `menuCats`,
the same already-filtered array the tabs layout uses:
```tsx
const menuCats = [
  ...categoryOrder.filter(cat => menuGroups[cat]?.length),
  ...Object.keys(menuGroups).filter(cat => !categoryOrder.includes(cat) && menuGroups[cat]?.length),
]
```
**Empty categories stay dropped** — Gusto's `Specials` (0 items) has no chip and no section, exactly as
it has no tab today.

### g. Start Event pinned above the scroll region

In **scroll** the left pane becomes a flex column:
```tsx
<div className="w-[58%] flex flex-col min-h-0 border-r border-slate-200">
  <div className="shrink-0 px-4 pt-4">{eventBanner}{dealsButton}</div>
  <div className="@container flex-1 min-h-0 overflow-y-auto px-4 pb-4">{menuGrid}</div>
</div>
```
In **tabs** the pane is the **original element, unchanged** — banner and deals inside the single scroller,
scrolling away with the items.

⚠️ **`@container` moves onto the scroller** in the scroll shape, because the tiles' `@sm:grid-cols-3`
resolves against the nearest container. Padding is split `px-4 pt-4` / `px-4 pb-4` so the visible inset
matches the old `p-4`.

⚠️ **The phone column gets the same treatment**, with `pb-24` moved onto the scroller (it is clearance for
the fixed bottom bar, so it must sit on the element that scrolls under it). **On a true phone
`eventBanner` is `hidden sm:block` and renders nothing**, so the pinned header there is the deals button
alone — or an empty zero-height `shrink-0` div.

### h. The pane discipline, and the cart

`shrink-0` header / `flex-1 min-h-0` scroller — the shape already used by the right-hand cart pane.
**The right pane is not in the diff at all**: the cart keeps its own `flex-1 min-h-0 overflow-y-auto` and
`submitPanel` stays outside it. **Nothing here can make the cart scroll with the items.**

---

## PART 5 — NOT TOUCHED

Verified with `git diff --quiet` per file:

| Forbidden | Status |
|---|---|
| Customer order page (`app/trucks/[slug]/order/page.tsx`) | ✅ **UNCHANGED** |
| KDS (`app/dashboard/[token]/kds/page.tsx`) | ✅ **UNCHANGED** |
| Dashboard page (`app/dashboard/[token]/page.tsx`) | ✅ **UNCHANGED** |
| `trucks.display_mode` | ✅ appears in the diff only as an untouched list member |
| The cart | ✅ grep over the `AddOrderPanel` diff for `cartLines`/`submitPanel`/`manualItems =`/`setManualItems` → **no match** |
| Order submission | ✅ same grep — **no match** |

---

## 6. 🔴 TRACE — a truck on the default `'tabs'`

**The claim is that behaviour is identical, and here is why, step by step:**

| Step | Value |
|---|---|
| DB | `add_order_layout = 'tabs'` (or the column absent, pre-migration) |
| `/api/dashboard` | `select('*')` + redact spread → arrives as `'tabs'` (or absent) |
| `AddOrderPanel` | `truck?.add_order_layout === 'scroll' ? 'scroll' : 'tabs'` → **`'tabs'`** |
| Pane markup | the `addOrderLayout === 'scroll' ? … : …` ternary takes the **else** branch, which is the **original `<div className="@container w-[58%] min-h-0 overflow-y-auto border-r border-slate-200 p-4">` verbatim** |
| `menuGrid` | `<div>{categoryTabs}{closedBanner}{selectedMenuCat && renderGridItems(selectedMenuCat)}</div>` |
| `ScrollMenuSections` | 🔴 **never mounted** — no refs, no listeners, no `ResizeObserver`, no timers |

**The one structural change to the tabs path** is that the item block moved from an inline
`{selectedMenuCat && (<div className="grid …">…</div>)}` into `renderGridItems(cat)`, called inline.

🔴 **A plain function returning JSX, not a component — so React sees the identical element tree**, no new
fiber, no state boundary, no remount. Inside it, three references changed from `selectedMenuCat` to the
parameter `cat`:

| Was | Now | In tabs mode |
|---|---|---|
| `menuGroups[selectedMenuCat]` | `menuGroups[cat]` | `cat === selectedMenuCat` → same |
| `categoryStocks.find(s => s.category === selectedMenuCat)` | `… === cat` | same |
| `basketByCat[(selectedMenuCat \|\| '').toLowerCase()]` | `basketByCat[cat.toLowerCase()]` | the call site is guarded by `selectedMenuCat &&`, so `selectedMenuCat` is a non-empty string and `(x \|\| '')` is `x` → same |

**Everything else in both item blocks is byte-identical**, including the sold-out rule, the stock maths,
the tile classes, the corner badge and the per-line mobile rows.

⚠️ **`catSt` / `catBasketQty` are the reason this had to be a parameter.** They are per-CATEGORY values
computed inside a per-ITEM loop; left closed over `selectedMenuCat`, a continuous list would have shown
one category's stock as the "N left" on every tile in every section.

---

## 7. VERIFICATION

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ **clean, exit 0** |
| Non-ASCII census, `app/manage/[token]/page.tsx` | ✅ **176 → 176**, gained none, lost none |
| Non-ASCII census, `components/dashboard/AddOrderPanel.tsx` | ✅ **36 → 36**, gained none, lost none |
| Non-ASCII census, `components/dashboard/types.ts` | ✅ **9 → 9**, gained none, lost none |
| Non-ASCII census, `app/api/manage/route.ts` | ✅ **10 → 10**, gained none, lost none |
| Migration file (new — no "before") | ✅ uses `— ⚠️ 🔴` only, all long-established in `supabase/migrations/` (75 / 38 / 33 files respectively) |
| Files changed | ✅ **4 modified + 1 new migration** |
| Migration run | ✅ **NO** — written for you |

### `add_order_layout` reaches the dashboard with no route change

| Gate | Result |
|---|---|
| Named select that would need the column added? | ✅ **No** — [app/api/dashboard/route.ts:77](app/api/dashboard/route.ts#L77) is `.select('*')` |
| Include list that would omit it? | ✅ **No** — `publicTruckFields` ([:54-61](app/api/dashboard/route.ts#L54-L61)) is a **redact** loop: `if (TRUCK_REDACT.has(k) \|\| SECRETISH.test(k)) continue` |
| In `TRUCK_REDACT`? | ✅ **No** — that set is `dashboard_token`, `dashboard_pin`, `kds_pin`, `messenger_page_token`, `whatsapp_sender`, `sheet_id` |
| Matches `SECRETISH`? | ✅ **No — executed, not eyeballed:** `/(^\|_)(token\|secret\|password\|credential\|pin\|key)(_\|$)/i.test('add_order_layout')` → **`false`** |

**So `/api/dashboard` was not modified and did not need to be.**

---

## 8. 🔴 WHAT I HAVE NOT EXERCISED

**I cannot see the rendered page and I cannot scroll it. Everything in Part 4 is reasoning over code.**

1. **🔴 THE SCROLL LAYOUT HAS NEVER RUN.** No section has ever pinned, no chip has ever lit from a scroll,
   no lock has ever been taken or released. `tsc` proves it compiles. **Nothing proves it behaves.**
2. **🔴 `SPY_LOCK_MS = 900` IS A GUESS, AND IT IS THE NUMBER MOST LIKELY TO BE WRONG.** I did not time a
   smooth scroll on the target hardware. Too short → the flicker returns near the end of a long jump;
   too long → a manual scroll within 900ms of a tap does not move the chip. **This is the parameter to
   check first on the iPad**, and it is the class of bug your brief warned is simulator-masked.
3. **`scrollend` support was not tested anywhere.** The listener is attached unconditionally (harmless
   where unsupported) and the timeout is the real mechanism. I did not verify that the iPad's WKWebView
   lacks it — I took that from your brief.
4. **The two-level sticky stack is unverified.** `barH` measured + `z-[9]` under `z-10` is correct by
   inspection; whether a heading visually tucks under the bar cleanly — especially with
   `backdrop-blur-sm` over scrolling tiles — **has not been seen.**
5. **The hidden-pane reasoning is inferred.** That a `display:none` instance measures 0 and never fires
   scroll is standard DOM behaviour, but **I did not observe both instances mounted**, and if a hidden
   pane ever did report a non-zero height it would write over the visible pane's active chip.
6. **`nearestScrollParent` was not run.** If the resolved ancestor is ever not the intended pane, the spy
   silently does nothing (no crash, no highlight) — **a quiet failure mode, not a loud one.**
7. **The bottom clamp's `- 2` tolerance is a judgement**, guarding sub-pixel scroll heights. Untested.
8. **No data was written or read this turn.** Gusto's 5-visible-category / 46-item shape is carried from
   `docs/add-order-view-report.md`.
9. **The migration has not been run**, so no reader has ever seen a real `'scroll'` value — the scroll
   path can only have been reached in my reasoning, never by a truck.
10. **I did not verify the Manage control renders in the right visual position** within the Order
    settings card, only that it is placed between the correct two sub-panels in the source.
