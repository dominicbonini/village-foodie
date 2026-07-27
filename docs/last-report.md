# Last report — Demo loop-complete: name the order, scroll to it, settle a ring on it

**Date:** 2026-07-27 · **Files touched:** `components/dashboard/DemoLoopComplete.tsx`,
`components/dashboard/OrderCard.tsx`, `app/dashboard/[token]/page.tsx`, `app/globals.css`
**Verification:** `npx tsc --noEmit` → **clean, zero errors.** No `next dev`, no `next build`, as
instructed.

This report **overwrites** the previous one (the Gemini timeout / git-history investigation), per the
rolling convention.

---

## 0. Prompt integrity — two garbled spots, repaired not silently fixed

| As received | Read as | Basis |
| --- | --- | --- |
| item 3: *"Two or three pulse cycles, then **holc tint**."* | *"then **hold the tint**"* | `holc` is not a word; `d`→`c` is one key over, and the sentence that follows — *"Do not animate indefinitely"* — requires the animation to END in a persistent state. "Hold" is the only verb that satisfies it. |
| item 6: *"the event provisioner, **oll**"* | *"the event provisioner, **or the roll**"* | Truncated. The identical do-not list has appeared in four earlier prompts this session, every time ending *"the event provisioner, or the roll"*. |

Neither changed the work.

---

# 1. NAME THE ORDER IN THE CARD

## What the card shows now

```
THAT'S EXACTLY HOW A REAL ORDER ARRIVES
#12 · Sarah Whitfield · £18.40          Show me

Sign up for your free month now
…No card needed, and nothing goes public until you say so.

[ Save my menu ]   Not yet
```

`components/dashboard/DemoLoopComplete.tsx:159–178`.

## The fields available on the arriving order, quoted

From `components/dashboard/types.ts:27–46` — the arrived order is a full `Order`, taken from the
board's own `orders` state, so every field is present:

| Field | Declaration | Used as |
| --- | --- | --- |
| `id` | `:29` — *"Per-event display number ("Order #5"). Human-facing only — never a lookup key."* | **`#12`** |
| `customer_name` | `:32` — `string` | **`Sarah Whitfield`** |
| `total` | `:42` — `number` | **`£18.40`** |
| `order_key` | `:31` — *"UUID row identity. Every lookup, update, React key…"* | The scroll target + highlight key (§4). Never displayed. |

`id` is exactly right for display and exactly wrong for identity — the type says so — which is why
those two roles are split between `id` and `order_key` here.

## Nothing renders blank — every field is checked, not assumed

```jsx
<span className="font-black text-slate-900">#{arrived.id}</span>
{arrived.customer_name?.trim() ? <> · {arrived.customer_name.trim()}</> : null}
{Number.isFinite(arrived.total) ? <> · <span className="font-bold">£{arrived.total.toFixed(2)}</span></> : null}
```

- **`customer_name` can legitimately be empty.** The component's own header notes the card fires for
  an operator-added walk-up too, and `AddOrderPanel` does not force a name. Empty → the separator and
  the name are both dropped, so it reads `#12 · £18.40`, never `#12 ·  · £18.40`.
- **`total`** is `number` and not optional, but `.toFixed()` on a `NaN` would print `£NaN`, so it is
  gated on `Number.isFinite`.
- **`id`** is `string` and non-optional; the whole block only renders when `arrived` is non-null.

**The whole named block is conditional** (`{arrived && !ambiguous && (…)}`, `:159`). If the order
can't be resolved, the card renders exactly what it rendered before — the eyebrow and the offer — with
no gap and no placeholder. See §4 for when that happens.

---

# 2. "SHOW ME" — scrolls the board to that order

`DemoLoopComplete.tsx:127–156` (`showMe`), wired to the button at `:174–177`. Plain text link beside
the order line, not a second solid button — the primary action on this card is still **Save my menu**,
and this must not compete with it.

```jsx
const el = document.getElementById(`demo-order-${arrived.order_key}`)
if (!el) return
onHighlight?.(null)          // clear first, so a second press re-runs the animation
…
el.scrollIntoView({ behavior: 'smooth', block: 'center' })
```

`block: 'center'` rather than `'start'` — the card lands in the middle of the viewport, clear of the
sticky header and the tab bar above it.

**The anchor** is a new optional `anchorId` prop on `OrderCard` (§5), set to
`demo-order-${order_key}` on the demo board only.

---

# 3. HIGHLIGHT — three pulses, then a held ring

## Triggered on scroll COMPLETION, not on the order's arrival

`DemoLoopComplete.tsx:135–150`:

```jsx
let done = false
const settle = () => {
  if (done) return
  done = true
  document.removeEventListener('scrollend', settle, true)
  clearTimeout(timer)
  onHighlight?.(arrived.order_key)
}
const timer = setTimeout(settle, SCROLL_SETTLE_FALLBACK_MS)   // 900ms
document.addEventListener('scrollend', settle, true)

el.scrollIntoView({ behavior: 'smooth', block: 'center' })
```

The ring is armed by `settle`, which runs when the scroll finishes — never before. A pulse spent while
the card is off-screen is spent on nobody.

### ⚠️ The listener is on `document` in the capture phase, and that detail matters

My first attempt listened on `window`. **It would never have fired.** The board scrolls inside the app
shell's `<main … overflow-y-auto>` (`app/dashboard/[token]/page.tsx:1958`), not the document, so the
scroll never reaches `window`. Scroll events don't bubble — but the **capture path runs regardless of
bubbling**, so one capturing listener on `document` catches whichever element actually moved. Fixed
before typecheck; the reasoning is in the code so it doesn't regress.

The 900ms timer is a real fallback, not a guess at the duration: `scrollend` is unsupported on older
WebKit, **and it does not fire at all when the card is already in view and nothing moves** — which is
a common case here, since the loop-complete card sits directly above the order list.

## What I used, and where

`app/globals.css:66–96` — plain CSS, no new dependency, no JS animation loop:

```css
@keyframes demoOrderPulse {
  0%   { box-shadow: 0 0 0 3px rgb(249 115 22 / 0.55), 0 1px 2px 0 rgb(0 0 0 / 0.05); }
  50%  { box-shadow: 0 0 0 10px rgb(249 115 22 / 0.15), 0 1px 2px 0 rgb(0 0 0 / 0.05); }
  100% { box-shadow: 0 0 0 3px rgb(249 115 22 / 0.55), 0 1px 2px 0 rgb(0 0 0 / 0.05); }
}

.demo-order-highlight {
  /* The HELD state — what remains once the three pulses finish. */
  box-shadow: 0 0 0 3px rgb(249 115 22 / 0.55), 0 1px 2px 0 rgb(0 0 0 / 0.05);
  animation: demoOrderPulse 850ms ease-in-out 3;
}
```

**Three cycles, 850ms each — ~2.5s total, then it stops.** The mechanism for "stops without vanishing"
is deliberate: the keyframes begin and end on **the same ring the base rule declares**, and there is no
`animation-fill-mode`, so when the animation finishes the element simply keeps that ring. No second
class, no timer to remove anything, no state to clean up. The card ends up marked, not flashing.

The base `box-shadow` restates Tailwind's `shadow-sm` (`0 1px 2px 0 rgb(0 0 0 / 0.05)`) because a
single `box-shadow` declaration replaces rather than merges — without it the card would lose its
shadow while highlighted. `globals.css` imports `"tailwindcss"` on line 1, so this rule comes after the
utilities and wins on equal specificity with no `!important`.

## prefers-reduced-motion — ✅ respected, and it was in from the start

`app/globals.css:91–96`:

```css
@media (prefers-reduced-motion: reduce) {
  .demo-order-highlight {
    animation: none;
  }
}
```

**The ring stays; only the movement goes.** Dropping the highlight entirely would be the wrong reading
of the setting — the user has asked for less motion, not for the card to become unfindable after being
scrolled to. With `animation: none` the base rule still applies, so the ring appears immediately and
holds. Same outcome, arrived at without the pulse.

---

# 4. 🔴 KEYED ON THE REAL ORDER ID FROM THE TRIGGERING UPDATE

## Where the id comes from — quoted

`DemoLoopComplete.tsx:96–110`. The detection effect already had to compute which keys were unseen in
order to decide whether to fire; that array **is** the identity of what arrived:

```jsx
const seen = new Set(baseline)
// Same condition as before — `filter(...).length === 0` is `!some(...)`. The array is kept rather
// than discarded so the card can name and locate what arrived; the TRIGGER is unchanged.
const fresh = keys.filter(k => !seen.has(k))
if (fresh.length === 0) return                      // nothing new — loop not completed yet
…
const t = setTimeout(() => { setFreshKeys(fresh); setVisible(true) }, wait)
```

`keys` derives from the `orderKeys` prop, which the dashboard builds as `orders.map(o=>o.order_key)`
(`app/dashboard/[token]/page.tsx:1990`) from the same `orders` state the realtime subscription and the
60s poll write into. So the key is **the row identity carried by the update that fired the card** —
`Order.order_key`, the UUID the type calls *"UUID row identity. Every lookup, update, React key"*.

**The trigger condition is unchanged.** `filter(…).length === 0` is precisely `!some(…)`; the effect
fires on exactly the same input it did before. The only difference is that the array is kept instead of
discarded.

## Not "newest", not a timestamp — and the ambiguous case is handled

`:122–125`:

```jsx
const arrived = freshKeys.length > 0 ? orders.find(o => o.order_key === freshKeys[0]) ?? null : null
const ambiguous = freshKeys.length > 1
```

- **`find` by key, never an index.** The board re-sorts (`sortByTimeThenId`, `page.tsx:1652`/`:1657`)
  and splits by status across two grids, so position is not identity.
- **The hazard you named is real and is why the diff is the right source.** A seeded order landing in
  the same window would be the newest, and would share the window on `created_at` — either heuristic
  would point at the wrong card. The diff cannot: a concurrent seeded order shows up as a **second
  fresh key**, which is detectable rather than silently wrong.
- **When it is ambiguous, nothing is named.** `ambiguous` suppresses the whole block (`:159`), so the
  card falls back to its previous form. Naming the wrong order at the conversion moment is worse than
  naming none.
- **`arrived` is also null if the order has left the board** — status-filtered out, or the event
  switched. Same graceful fallback, via the `?? null`.

---

# 5. DEMO-ONLY — a live operator's board is unchanged

## The gate

`DemoLoopComplete` is already inside `{isDemo&&(…)}` at `page.tsx:1987`, unchanged. Everything new
hangs off it.

## `OrderCard` — two optional props, both inert when unset

```jsx
anchorId,
highlight = false,
```

Root element (`OrderCard.tsx:365`):

```jsx
<div id={anchorId} className={`w-full bg-white rounded-2xl overflow-hidden shadow-sm border transition-opacity flex flex-col ${allStruck ? 'opacity-50' : ''} ${pendingSync ? 'border-amber-300' : 'border-slate-200'}${highlight ? ' demo-order-highlight' : ''}`}>
```

**Why this is byte-for-byte identical on a live board:**

- **`id={undefined}`** — React omits the attribute entirely. Not `id=""`, not `id="undefined"`. The
  rendered element is exactly what it was.
- **`${highlight ? ' demo-order-highlight' : ''}`** appends the empty string when false. It is
  concatenated with **no leading space in the template** — the space lives inside the truthy branch —
  so the class attribute is character-identical, not merely equivalent.
- **The call sites pass demo-conditional values** (`page.tsx:2321`, `:2327`):
  `anchorId={isDemo?\`demo-order-${o.order_key}\`:undefined}` and
  `highlight={isDemo&&o.order_key===highlightOrderKey}`. On a live board those are `undefined` and
  `false` for every card, on every render, for the page's whole life.
- **`highlightOrderKey`** (`page.tsx:376`) is only ever written by `setHighlightOrderKey`, passed
  solely to `DemoLoopComplete`, which only mounts when `isDemo`. On a live board it is `null` from
  mount to unmount.
- **The CSS class is unreachable off the demo path** — `.demo-order-highlight` is applied nowhere else.

**No live operator's board can be scrolled or flashed by any of this.** The scroll is triggered only by
a click on a button inside a demo-only component; there is no automatic scroll anywhere, in either mode.

---

# 6. NOT TOUCHED, as instructed

The order-placement path · the realtime/poll subscription · **`DemoLoopComplete`'s trigger condition**
(§4 shows the `some`→`filter` rewrite is the identical predicate) · the Gemini timeout ·
`provisionDemo` · `commitMenu` · seeding · the event provisioner · the roll.

Also untouched: the baseline-detection scheme, the localStorage keys, the snooze behaviour, the
`SIGNUP_OFFER` copy, and both `DemoGetStarted` presentations.

---

## 7. Files changed

| File | Change |
| --- | --- |
| `components/dashboard/DemoLoopComplete.tsx` | +91/−9 (110 → 201 lines). `orders` + `onHighlight` props; `freshKeys` state; the named-order line; the "Show me" button; the scroll + scroll-completion handler. |
| `components/dashboard/OrderCard.tsx` | +12/−2. Optional `anchorId` and `highlight` props, both inert when unset. |
| `app/dashboard/[token]/page.tsx` | +11/−4. `highlightOrderKey` state (`:376`); two new props on `DemoLoopComplete` (`:1988–1992`); `anchorId`/`highlight` on both `OrderCard` grids (`:2321`, `:2327`). |
| `app/globals.css` | +32. `@keyframes demoOrderPulse`, `.demo-order-highlight`, and the `prefers-reduced-motion` override. |
| `docs/last-report.md` | This file, overwritten. |

---

## 8. What I could not do / did not do

- **Could not run `next dev` or `next build`** — instructed not to. `npx tsc --noEmit` is clean, which
  covers types and props but nothing behavioural. Four things want an eyeball:
  1. **The `scrollend` capture listener actually firing** inside `<main overflow-y-auto>`. The 900ms
     fallback makes the feature correct either way, but which path runs is unverified.
  2. **The three-pulse-then-hold ending on the ring** rather than snapping off — this depends on the
     keyframes' 0%/100% matching the base rule, which is right by inspection but unseen.
  3. **`block: 'center'` clearing the sticky header** on a short viewport.
  4. **The reduced-motion branch**, which needs the OS setting toggled.
- **Did not add a way to clear the ring.** It is a held tint by design (item 3); it persists until the
  card unmounts or the board re-filters. If you'd rather it faded after ~30s, that's a small addition.
- **Did not handle the ambiguous multi-key case beyond suppressing the naming.** Distinguishing the
  visitor's order from a concurrently-seeded one would need a signal the client doesn't have. Falling
  back to the previous card is the honest outcome.
- **Did not commit anything.** The working tree also still carries the uncommitted Gemini-timeout work
  from earlier (`lib/menu-extract.ts` 90s, `components/landing/DemoUpload.tsx` 75s) — those remain
  unstaged and undeployed, and per the last investigation prod is running the committed 120s.
