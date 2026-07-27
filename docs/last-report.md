# Last report — Loop-complete border reverted; order highlight → fading green full-card flash

**Date:** 2026-07-27 · **Files touched:** `app/globals.css`,
`components/dashboard/DemoLoopComplete.tsx`
**Verification:** `npx tsc --noEmit` → **clean, zero errors.** No `next dev`, no `next build`, as
instructed.

This report **overwrites** the previous one (the three-line card tightening), per the rolling
convention.

**Prompt integrity:** no garbles. The prompt arrived intact.

---

# 0. REVERTED — the loop-complete card's border and fill

`components/dashboard/DemoLoopComplete.tsx:172` is back to what it was before last task:

```jsx
<div className="bg-white border-2 border-orange-300 rounded-2xl px-4 py-4 mb-4 shadow-sm text-center">
```

| | Last task | Now |
| --- | --- | --- |
| Fill | `bg-orange-100` | **`bg-white`** |
| Border | *(none)* | **`border-2 border-orange-300`** |
| Shadow | *(removed)* | **`shadow-sm`** |
| Eyebrow | `text-orange-700` | **`text-orange-600`** |
| "Show me" hover | `hover:text-orange-900` | **`hover:text-orange-800`** |

The eyebrow and hover shades went back too — `orange-700`/`orange-900` existed only for contrast
against the `orange-100` fill, so leaving them on a white card would have been a stray half-revert.

**`text-center` is kept** — that came from the centring request, not the colour change, and you didn't
ask for it back. The three-line copy from last task is also untouched.

---

# 1. FULL-CARD WASH, NOT A BORDER

`app/globals.css:66–130`. The `box-shadow` ring is gone entirely; the highlight is now an overlay that
covers the whole card.

```css
.demo-order-highlight::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  border-radius: inherit;
  background-color: rgb(34 197 94);
  opacity: 0;
  animation: demoOrderFlash 2000ms ease-out forwards;
}
```

Your diagnosis was right and it is recorded in the file: **every card on that board already has a
border**, so a ring competed with borders rather than standing out — and an orange one sat next to the
red/amber urgency states, reading as another severity level. A wash has nothing to compete with.

- **`pointer-events: none`** — the card stays fully clickable through the flash. The operator is meant
  to work with this order, not wait for a decoration to finish.
- **`border-radius: inherit`** — the wash follows the card's `rounded-2xl` instead of squaring off the
  corners.

---

# 2. GREEN

`rgb(34 197 94)` — Tailwind **green-500**.

Chosen by elimination, from the board's actual palette (`components/dashboard/helpers.ts:149–158`):

| Colour | Already means | Free? |
| --- | --- | --- |
| red | `late` (`bg-red-50` header, red-500 top rule) | ✗ |
| amber | `warn` and `cooking` | ✗ |
| orange | the primary action ("Save my menu", tab accents) | ✗ |
| slate | `new` | ✗ |
| **green** | `ready` — a *header* state, never a card-wide wash | **✓** |

One honest note: green is not entirely unused — `ready` orders carry a `bg-green-50` header
(`helpers.ts:151`). But `green-50` is a pale wash on a header strip, where this is `green-500` at ~0.5
alpha across the **whole card**, and it lasts two seconds. There is no state in which a card is
uniformly green, so the two cannot be confused. It remains the only family not spoken for by an urgency
meaning.

---

# 3. FADES OUT COMPLETELY — no held state

```css
@keyframes demoOrderFlash {
  0%   { opacity: 0.5; }
  55%  { opacity: 0.42; }   /* hold most of the tint while they arrive, THEN fall away */
  100% { opacity: 0; }
}
```

**2000ms, `ease-out`, `forwards`, ending at `opacity: 0`.** The mid-stop at 55% is what makes it read
as *"here"* rather than as a blink: the wash sits nearly full-strength for the first second — while the
eye is still landing after the scroll — and only then falls away. A linear fade from 0.5 is half gone
before they have looked.

`forwards` pins the final `opacity: 0`, so nothing is held. Exactly the GitHub / Slack / Linear
jump-to-item convention you named.

## The DOM doesn't hold anything either

`DemoLoopComplete.tsx:56–62` and `:150–152`:

```js
const FLASH_MS = 2000
const FLASH_CLEAR_MS = FLASH_MS + 250
…
onHighlight?.(arrived.order_key)
// NO HELD STATE. The CSS fades the wash to nothing; this drops the class once it has, so the
// card carries no spent marker and a later "Show me" can replay the flash.
setTimeout(() => onHighlight?.(null), FLASH_CLEAR_MS)
```

The CSS alone would leave the card visually clean but still carrying `demo-order-highlight`. Dropping
the class afterwards means no spent flag on the element, and a later "Show me" re-adds it and replays
the flash. The 250ms buffer keeps the class from being pulled mid-animation.

---

# 4. 🔴 LAYERING OVER THE LATE-ORDER TINT — handled with `::after`, not `background-color`

**This is the part that would have silently failed.** An `OrderCard` is a white box whose **header
carries its own background** — `bg-red-50` on a late order, `bg-amber-50` cooking/warn, `bg-green-50`
ready (`helpers.ts:151–157`). A `background-color` on the card root paints **behind** those children.
So on the exact card this feature exists for — the 7m-late one with the pink header — the wash would
have been invisible across the strip the eye actually lands on, and visible only on the body below it.

**How it is handled** (`app/globals.css:105–118`):

```css
.demo-order-highlight {
  position: relative;
}

.demo-order-highlight::after {
  position: absolute;
  inset: 0;
  z-index: 5;                          /* above the header strip and body, both static */
  background-color: rgb(34 197 94);
  …
}
```

- **The overlay paints ON TOP of every child**, header included. Positioned elements paint above static
  ones, and the header divs (`OrderCard.tsx:373`, `:398`) are static; `z-index: 5` makes it explicit
  rather than incidental.
- **Uniform regardless of what's underneath.** Over `bg-red-50` (`#FEF2F2`), green-500 at 0.5 alpha
  composites to roughly `#8FDCA9` — unmistakably green, not a pink that has shifted slightly. It reads
  the same over amber, slate and plain white, so the flash means one thing on every card.
- **`position: relative` is set in the CSS rule, not as a Tailwind class**, so a live operator's card
  markup is unchanged — the property only exists while the demo class is on the element.

## One risk I checked rather than assumed

Adding `position: relative` to the card root creates a containing block for any absolutely-positioned
descendant, which could reposition something. **`grep -c "absolute" components/dashboard/OrderCard.tsx`
→ 1**, at `:25`, inside the `Toggle` helper — and its parent is already `relative w-11 h-6`. Nothing in
the card resolves its position against the root, so this cannot move anything.

---

# 5. prefers-reduced-motion — a static tint that clears

`app/globals.css:120–130`:

```css
@keyframes demoOrderFlashStatic {
  0%   { opacity: 0.4; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .demo-order-highlight::after {
    animation: demoOrderFlashStatic 2000ms steps(1, end) forwards;
  }
}
```

`steps(1, end)` is the mechanism: opacity **holds flat at 0.4 for the full two seconds, then jumps to
0** in one step. No interpolation, so there is nothing to watch — but the card is still unambiguously
marked when they arrive, and still clear afterwards.

Exactly your instruction, and worth stating why it isn't `animation: none`: that would leave the
`::after` at its base `opacity: 0`, scrolling a reduced-motion user to a card with no indication at all
— the failure you called out.

---

# 6. UNCHANGED — verified, not assumed

| Item | State |
| --- | --- |
| The **"Show me"** button | Unchanged (`:182–194`) except the hover shade reverted with §0. |
| The **scroll behaviour** | `showMe`'s `getElementById` → `onHighlight(null)` → capturing `scrollend` listener → 900ms fallback → `scrollIntoView({behavior:'smooth', block:'center'})` — all identical. The only line added inside it is the flash-clear timer, which is highlight lifecycle (item 3), not scroll. |
| **Keying on the real `order_key`** | Unchanged. Still the baseline diff (`freshKeys`), still `orders.find(o => o.order_key === freshKeys[0])`, still suppressed when ambiguous. |
| **`isDemo` gating** | Unchanged. `OrderCard`'s `highlight` prop is `isDemo&&o.order_key===highlightOrderKey` (`page.tsx:2321`, `:2327`) — `false` on every live card, so `.demo-order-highlight` never lands and `::after` never exists. **A live operator's board cannot flash.** |
| **The trigger** | Unchanged — baseline detection, snooze, localStorage keys all untouched. |

`OrderCard.tsx` and `app/dashboard/[token]/page.tsx` were **not opened for writing** this task.

---

# 7. NOT TOUCHED, as instructed

`DemoLoopComplete`'s trigger · the scroll logic · the Gemini timeout · `provisionDemo` · `commitMenu` ·
seeding · the event provisioner · the roll.

---

## 8. Files changed

| File | Change |
| --- | --- |
| `app/globals.css` | +47/−19. `demoOrderPulse` ring replaced by `demoOrderFlash` + `.demo-order-highlight::after` overlay; new `demoOrderFlashStatic` for reduced motion. |
| `components/dashboard/DemoLoopComplete.tsx` | Container reverted to `bg-white border-2 border-orange-300 … shadow-sm` (§0); eyebrow/hover shades reverted; `FLASH_MS`/`FLASH_CLEAR_MS` added; one flash-clear timer in `settle`. |
| `docs/last-report.md` | This file, overwritten. |

---

## 9. What I could not do / did not do

- **Could not run `next dev` or `next build`** — instructed not to. `tsc --noEmit` is clean, but this
  is a visual change and four things want your eye:
  1. **Green-500 at 0.5 over the pink `bg-red-50` header** — the compositing is arithmetic, but whether
     it reads as "yours" rather than "a new state" is a judgement only the real board settles.
  2. **The 55% hold** — if it still feels like a blink, raising the mid-stop to ~70% lengthens the
     plateau without touching the 2s total.
  3. **`steps(1, end)`** under an actual reduced-motion setting.
  4. **`z-index: 5`** — correct by inspection (all card children are static), unverified in a browser.
- **Did not tune the opacity per underlying state.** One value for all cards; a late card's pink is
  pale enough that 0.5 green dominates it. If it looks weak specifically on late cards, that's a
  targeted bump rather than a rethink.
- **Did not touch the loop-complete card's copy or layout** beyond the §0 colour revert.
- **Did not commit anything.** The tree also still carries the uncommitted Gemini-timeout work
  (`lib/menu-extract.ts` 90s, `components/landing/DemoUpload.tsx` 75s) and this session's other demo
  and Android edits — all unstaged.
