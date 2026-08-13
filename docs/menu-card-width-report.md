# The menu card, its width on a phone, and the colour of a "choices needed" box

Date: 13 August 2026
Status: READ-ONLY DIAGNOSIS. **No source file was changed.** This report is the only file created.
No `next dev`, no `next build`, no commit, no deploy. No fix applied.

All line references are to [app/trucks/[slug]/order/page.tsx](app/trucks/[slug]/order/page.tsx) unless
stated.

**On one instruction pair, and my reading of it.** The header says "Do not propose or apply a fix", and
then item 7 asks me to "state the smallest change that reclaims the width", and the closing paragraph
asks me to review a box treatment and pick a best colour. I read "do not propose or apply a fix" as *do
not implement one, and do not go beyond what is asked* — items 7 and the colour review are explicitly
requested answers, so I have given them as analysis with no code and no edits. I did not treat this as a
contradiction worth stopping for. Say so if you meant it more strictly.

Nothing in the prompt arrived garbled.

---

## 1. THE MENU CARD'S CONTAINER, AND WHAT IT COSTS AT 390px

**QUOTED** — `:2386`:

```tsx
{/* MENU — grouped by category */}
<div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-4 mb-4">
```

**QUOTED** — its parent, `:2206`:

```tsx
<main className="flex-1 w-full max-w-lg mx-auto px-4 py-6" style={{ paddingBottom: `${footerHeight + 8}px` }}>
```

**QUOTED** — the page shell, `:3742`:

```tsx
return <div className="min-h-screen bg-slate-50 flex flex-col">{children}</div>
```

Broken out:

| Property | Value | Resolves to |
|---|---|---|
| background | `bg-white` | `#ffffff`, on a `bg-slate-50` page |
| border | `border border-slate-200` | 1px solid, all four sides |
| radius | `rounded-2xl` | 1rem = 16px |
| shadow | `shadow-sm` | no layout cost |
| horizontal padding | `px-4` | 1rem = 16px each side |
| vertical padding | `py-4` | 1rem = 16px |
| gap below | `mb-4` | 1rem = 16px |

### The arithmetic at 390px — **QUOTED inputs, INFERRED total**

Tailwind sets `box-sizing: border-box` globally, so padding and border sit inside the declared width.

| Consumer | Each side | Both sides |
|---|---|---|
| `<main>` `px-4` | 16px | **32px** |
| card `border` | 1px | **2px** |
| card `px-4` | 16px | **32px** |
| | | **66px total** |

- Viewport: **390px** (iPhone 12/13/14/15 logical width)
- Content width available to an item row: **390 − 66 = 324px**
- **Lost to chrome: 66px, or 16.9% of the screen.**
- Of that, **34px (8.7%) belongs to the card itself** (its padding plus its border); the other 32px is
  `<main>`'s own gutter, which every sibling shares.

`max-w-lg` (32rem = 512px) does not bind at 390px — the viewport is the constraint.

---

## 2. WHAT THE CARD IS DOING VISUALLY

**QUOTED evidence, INFERRED conclusion.**

The page background is `bg-slate-50` (`:3742`) and the card is `bg-white`. **That white-on-slate-50
contrast, plus the 1px `border-slate-200` and the 16px radius, is the entire thing that makes the menu
read as a distinct surface.** There is no other separator — no rule, no heading band, no spacer with its
own colour.

What it is separating from, in each direction:

- **Above — the page header** (`:3757`, `bg-slate-900 text-white … h-[60px] sticky top-0 z-50`). This one
  needs no help: dark slate against white is unmistakable, and the card is not adjacent to it anyway —
  the truck name block, the event card and (when present) the deals row sit between them.
- **Above, nearer — the event card and the deals row.** The event card is `TruckListCard` (shared with
  the truck profile page) and the deals cards are `bg-white rounded-2xl border border-orange-200
  shadow-sm` (`:2315`). Both are themselves inset white cards on slate-50. **So the menu card is
  currently separated from them by the slate-50 gutter running between and around them.** Remove the
  menu card's own frame and that gutter stops meaning anything — the menu would bleed while its
  neighbours stay boxed.
- **Below — the sticky basket bar** (`:3222`):

  ```tsx
  <div ref={footerRef} className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-xl px-4 pt-3 pb-2 z-50" …>
  ```

  🔴 **This is the sharpest point in the whole report.** The basket bar is already `bg-white` and already
  full-bleed, and it is separated from the menu today by *two* things: its own `border-t border-slate-200`
  **and** the slate-50 gutter under the menu card. Take the menu card's white edge-to-edge and the only
  remaining separation between two white surfaces is that single 1px top border. It will still work — a
  1px slate-200 line on white is visible — but the boundary goes from *obvious* to *minimal*, and the
  `shadow-xl` on the bar becomes the thing doing most of the work.

**So: yes. The border and background are the separation, and removing them is not "nothing".** Going
edge-to-edge means deciding, deliberately, what replaces them — most likely keeping the white but
inheriting the separation from the sticky tab strip's existing `border-b border-slate-100` at the top and
the basket bar's `border-t` at the bottom, and accepting that the menu becomes the page rather than a
card on the page.

---

## 3. 🔴 TABLET AND DESKTOP — THIS IS NOT A DESKTOP PROBLEM, AND EDGE-TO-EDGE IS NOT A DESKTOP RISK

**QUOTED.** `<main>` is `max-w-lg mx-auto` (`:2206`). `max-w-lg` = 32rem = **512px**.

**The entire customer order page is a single 512px column, centred, at every viewport above 512px.**
There is no two-column layout, no wider desktop variant, and no `lg:` or `xl:` anything.

At **1400px**, today:

- `<main>` is 512px wide, centred.
- Empty `bg-slate-50` either side: **(1400 − 512) / 2 = 444px per side**.
- The menu card's content column is **512 − 32 (main px-4) − 2 (border) − 32 (card px-4) = 446px**.

At **1400px**, with the card's padding and border removed:

- The column is **still 512px** — `max-w-lg` is unchanged and unaffected.
- Content becomes **512 − 32 = 480px**, a gain of 34px inside an already-centred column.
- The white block would run to the edges of that 512px column and sit as a white stripe on a wide
  slate-50 field, **with the deals card and event card still inset beside it**. That is the only visible
  desktop consequence, and it is a cosmetic regression rather than a functional one.

⚠️ A `-mx-4`-style negative margin **cannot** produce a true viewport-wide bleed here, because the
negative margin only cancels `<main>`'s padding — it is still inside the 512px `max-w-lg` box.
Full-bleed on desktop would require moving the element outside `<main>` entirely, which is a much larger
change than the one being considered.

### Is it a responsive change? **Yes — INFERRED, and clearly so.**

The problem is 100% a narrow-viewport problem (66px matters at 390px, is irrelevant at 512px+), and the
cosmetic cost of the fix lands only at ≥512px. So the change belongs behind a breakpoint.

### The breakpoint this page already uses

**QUOTED.** `sm:` is the **only** responsive prefix anywhere in this 3800-line file, and it appears
exactly 12 times, **all of them inside `Hdr`** (`sm:w-[140px]`, `sm:px-[145px]`, `sm:text-[15px]`,
`sm:max-w-xs`, `sm:h-[48px]`, `sm:gap-2`, `sm:font-black`, `sm:items-center`).

**Inside `<main>` and inside the menu card there are zero responsive prefixes.** The whole ordering UI is
single-breakpoint by construction.

`tailwind.config.*` does not exist — this is Tailwind v4 (`"tailwindcss": "^4"` in package.json) with a
CSS `@theme inline` block in `app/globals.css` that defines **colours and fonts only, no `--breakpoint-*`
overrides**. So `sm:` is Tailwind's default **640px**.

**Established answer: `sm:` (640px) is the only breakpoint precedent on this page, and it is used only in
the header.** There is no existing precedent inside the menu region — whichever breakpoint is chosen for
the menu will be the first one there. 640px is above `max-w-lg`'s 512px, so a `sm:`-gated rule would
restore the inset for every viewport at which the column is already width-capped, which is the behaviour
you would want.

---

## 4. EVERYTHING INSIDE THE CARD, AND WHICH READS FROM ITS PADDING

**QUOTED.** In document order:

| Element | Line | Own horizontal padding? | Reads from the card's `px-4`? |
|---|---|---|---|
| Header row (flex) | `:2387` | no | **yes** |
| — `MENU` heading (`h2`) | `:2388` | no | **yes** (via the row) |
| — `ⓘ Allergen Info` button | `:2394` | no | **yes** (via the row) |
| `menuTopRef` scroll anchor | `:2403` | zero-size | n/a |
| **Sticky tab strip wrapper** | `:2409` | 🔴 **`-mx-4 px-4`** | **no — cancels then re-applies it** |
| — tab scroller (`flex gap-1.5 overflow-x-auto`) | `:2410` | no | inherits the strip's `px-4` |
| — tab buttons (`px-4 min-h-[44px]`) | `:2415` | own internal `px-4` | no |
| min-height wrapper | `:2427` | no | **yes** |
| **Subcategory header (`<p>`)** | `:2466` | 🔴 **`-mx-4 px-4`** | **no — same pattern** |
| Item row wrapper (`py-3`) | `:2521-2523` | **none** | **yes** |
| — thumbnail `w-16 h-16` | `:2527` | no | **yes** |
| — item name + badges (top line) | `:2525` | no | **yes** |
| — description `<p>` | `:2577` | no | **yes** |
| — dietary / allergen / spice chips | `:2581` | no | **yes** |
| — required-option teaser line | `:2609` | no | **yes** |
| — bottom baseline (price left, Add right) | `:2629` | no | **yes** |
| — price `<span>` | `:2630` | no | **yes** (via the baseline) |
| — **Add button** | `:2671` | own internal `px-3` | **yes** for its *position*, no for its own box |
| — per-variant `+/−` rows | `:2703` | own `px-3` inside an `bg-orange-50 rounded-xl` | **yes** for position |

**Summary: everything reads from the card's `px-4` except two elements, and those two are the ones that
matter.**

🔴 **The two exceptions are load-bearing and coupled.** Both `:2409` and `:2466` use the `-mx-4 px-4`
idiom, and the code says why — `:2407`:

```
// -mx-4 px-4 makes the white bar span the menu card's padding.
```

and `:2463`:

```
// (z-30) and the page header bars (z-40) and ABOVE the items. -mx-4 px-4 + bg-white
```

They deliberately **break out of the card's padding to paint a full-width white bar, then re-inset their
own content to line up with the item rows below.** If the card's `px-4` changes, both `-mx-4` values and
both `px-4` values must change with it, or the sticky tab bar and the sticky subcategory header will
misalign against the item text — and because both are `sticky` with `bg-white`, a mismatch shows as a
white bar that is the wrong width while scrolling, which is exactly the sort of thing that only appears
mid-scroll and not in a static screenshot.

---

## 5. THE TAB STRIP — IT ALREADY SCROLLS, AND EDGE-TO-EDGE IMPROVES BUT DOES NOT FIX IT

### Does it already scroll horizontally? **YES — QUOTED**, `:2410`:

```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
```

`overflow-x-auto` gives it horizontal scrolling; `scrollbar-hide` removes the scrollbar. The comment at
`:2407` states the intent: *"Finger-sized (≥44px), horizontal-scroll on narrow."* So the clip you are
seeing is **a scroll container doing its job**, not a broken `overflow: hidden`.

### Where the clip actually happens — **QUOTED / INFERRED**

The strip's wrapper is `-mx-4 px-4`, so the **white bar** reaches the card's padding edge but the
**scrolling content** starts and ends 16px inside it. A partially scrolled tab is therefore cut at the
padding line, 16px in from the card's border, not at the card edge.

### Would edge-to-edge fix it? **No. INFERRED, with the arithmetic.**

- Track width today at 390px: **324px**.
- Track width if all 66px is reclaimed: **390px**.
- The four tabs in your screenshot are `STARTERS`, `SIDES`, `MAINS`, `DIPS & SAUCES`, each
  `px-4` (32px) + `text-sm font-black uppercase tracking-wide`, with `gap-1.5` (6px) between.
- Approximate rendered total: **≈480px** (INFERRED — measured from character counts at 14px in a black
  uppercase face with `tracking-wide`, not from a browser; treat as ±10%).

**So the strip overflows by roughly 156px today and would still overflow by roughly 90px at full bleed.**
Your own statement in the brief is right: four-plus categories will not fit either way.

**Verdict: it relocates the clip and shortens it. It does not remove it.**

### 🔴 And there is a way it makes things *worse*, which is the finding worth having

`scrollbar-hide` means **there is no scrollbar and no arrow and no fade** — so the clipped tab *is* the
only affordance telling a customer the strip scrolls. Today "DIPS & S…" cut mid-word is an ugly but
effective signal. Widen the track by 66px and, for a truck whose categories happen to total between 324
and 390px, the strip stops clipping entirely at rest and looks complete — while a fifth category added
later scrolls off with no cue at all. **Edge-to-edge can convert a visible clip into a silent one.**
Whatever is decided about width, the strip's discoverability is a separate question (a fade mask, a
scroll-snap, or wrapping to two rows) and it is not solved by reclaiming 66px.

---

## 6. WHAT ELSE ON THIS PAGE USES THE SAME CARD PATTERN

**QUOTED.** The exact class string `bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-4 mb-4`
appears **twice** in the file:

1. `:2386` — the menu card.
2. `:3805` — the `Sec` helper component:

```tsx
function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-4 mb-4">
      <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">{title}</h2>
      {children}
    </div>
  )
}
```

⚠️ `Sec` is not just the same pattern — it is the **same class string and the same heading style**
(`text-xs font-black text-slate-500 uppercase tracking-widest`) as the menu card's `MENU` heading. They
are visually one design, expressed twice.

`Sec` is used twice: `:2949` **Collection time** and `:3100` **Your details** — i.e. the slot picker and
the details form. **But both live inside the checkout bottom sheet**, not in `<main>`:

```tsx
<div ref={sheetScrollRef} className="relative bg-white rounded-t-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" …>
  <div className="px-5 pt-5 pb-5">
```

(`:2785-2786`.) So they are white cards on a **white sheet** with its own `px-5`, a different surface
from the menu card's white-on-slate-50.

### Other inset surfaces that are true siblings of the menu card inside `<main>`

| What | Line | Classes | Same pattern? |
|---|---|---|---|
| Deals / bundle cards | `:2315` | `bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden` | near-identical, orange border, padding pushed to an inner `px-4 py-3.5` |
| Event card | `:2256` | `TruckListCard` — **a separate shared component** | 🔴 also renders on the truck profile page; changing it changes another page |
| "Loading events" | `:2242` | `mt-3 bg-slate-100 rounded-xl px-4 py-3` | different (slate-100, `rounded-xl`, no border) |
| "No upcoming events" | `:2248` | `mt-3 bg-slate-100 rounded-xl px-4 py-3` | same as above |
| Events-retry card | `:2099` | `mt-3 bg-slate-100 rounded-xl px-4 py-4` | same as above |
| Event-chooser block | `:2275` | inline, own padding | different |

### Answer

**Yes — changing the menu card alone makes the page inconsistent, and visibly so.** The menu card is one
of at least four inset surfaces stacked in the same 512px column, and two of them (the event card and the
deals row) sit **directly above it**. A full-bleed menu under a boxed event card and a boxed deals row
would read as a layout bug rather than a decision.

Two lighter observations that follow from that:

- The `Sec` cards are behind the sheet, so they can be left alone without looking inconsistent — a sheet
  is a different surface and users accept different rules there.
- The `TruckListCard` event card is **shared with the truck profile page**. It is the one element here
  that cannot be changed in isolation.

---

## 7. THE SMALLEST CHANGE THAT RECLAIMS THE WIDTH, AND WHAT IT RISKS

**INFERRED throughout — this is analysis, not a proposal to implement.**

### It is only padding. The card itself does not need to go.

Of the 66px, **34px is the card** (32px padding + 2px border) and **32px is `<main>`'s shared gutter**.
The card's *frame* — background, border, radius, shadow — costs **2px of width**. The padding costs 32px.

**So the width problem is a padding problem, and the visual-separation question (section 2) is a frame
question. They are separable, and conflating them is what makes this look like a bigger change than it
is.** Dropping the card's `px-4` on narrow screens while keeping `bg-white`, `border-slate-200`,
`rounded-2xl` and `shadow-sm` reclaims **32px of the 34px available from the card** and leaves every
separation in section 2 intact.

### Ranked smallest-first

| # | Change | Reclaims at 390px | Risk |
|---|---|---|---|
| 1 | Card `px-4` → `px-0`, restored at `sm:` | **32px** (324 → 356) | 🔴 the two `-mx-4 px-4` elements at `:2409` and `:2466` must move in lockstep or the sticky bars misalign. Item text sits flush against the border. |
| 2 | #1, plus `<main>`'s `px-4` → `px-0` at narrow | **64px** (324 → 388) | Everything above moves too — event card, deals, notices all lose their gutter. Contradicts section 6. |
| 3 | Card border + radius + padding removed (true edge-to-edge) | **66px** | All of the above, plus section 2's separation problem and section 6's inconsistency. |
| 4 | Tab strip alone breaks out further (`-mx-8 px-8` style) | 32px, **strip only** | Surgical: fixes the visible symptom without touching the item rows or any other page element. Leaves the item rows inset. |

### The risks, stated plainly

1. 🔴 **The `-mx-4 px-4` coupling** (section 4). Two sticky, `bg-white`, z-indexed elements re-derive the
   card's padding by hand. This is the concrete thing most likely to break, and it breaks mid-scroll
   where a static check will not catch it.
2. **Item rows flush to a border.** With `px-0` the thumbnail, the name and the `Add` button touch the
   1px border. On a card that is a 16px radius, content at the corner radius looks wrong even when the
   arithmetic is right.
3. **Inconsistency with the deals and event cards directly above** (section 6).
4. **The basket bar boundary thins to a single 1px line** if the frame goes as well (section 2).
5. **The tab strip is not actually fixed** (section 5), and may lose its only scroll affordance.

### 🔴 The observation I would want to make before choosing

**Option 4 is the only one whose blast radius matches the symptom you actually described.** The complaint
in the brief is the tab strip clipping; the item rows at 324px are tight but not clipping anything. The
strip is *already* an element that breaks out of the card's padding on purpose, so widening its break-out
is a change to one element that already owns this behaviour, with no effect on the item rows, the event
card, the deals row, the basket bar or any breakpoint. It reclaims 32px exactly where the clip is,
leaves every separation in section 2 untouched, and does not make the page inconsistent.

It does not reclaim width for the item rows. If the item rows are the real target, options 1-3 apply and
the coupling in section 4 becomes the thing to get right.

**Not established:** whether the item rows at 324px are causing any actual truncation (no wrapping or
overflow was measured — the descriptions wrap and the prices fit in your screenshot at 477px). Worth
checking at 390px before spending the risk in options 1-3.

---

## 8. THE "CHOICES NEEDED" BOX — COLOUR REVIEW

You suggested light yellow, noting it is used elsewhere for the same formatting. Reviewed below.

### What the option line is today — QUOTED, `:2609`

```tsx
<p key={g.id} className="text-xs text-slate-500 leading-snug flex flex-wrap items-center gap-x-1 gap-y-0.5">
  {!g.hide_name && <span className="font-semibold text-slate-600">{g.name}:</span>}
```

(That is after the contrast fix earlier today — it was `text-[0.625rem] text-slate-400`.) It renders
**required groups only**, sold-out options filtered out.

### 🔴 A finding that matters more than the colour

In your screenshot the line reads `Chicken Tikka (M) · Paneer Tikka (M) · Chicken Tikka (L) +£3.00 · …`
**with no group name.** That is `g.hide_name` being true — an AI-import-inferred group whose internal
name is suppressed (`:2610-2611`).

And `groupRuleLabel`, which produces the customer-facing string **"Required · Choose up to N"**, is
imported into this file at `:30` but called **only at `:3300` — inside the item modal**. It is never
rendered on the menu list.

**So on that truck's menu card there is currently nothing whatsoever that says a choice is required.** No
group name, no "Required", and the button says `Add` — the identical label a no-modifier item gets
(`:2680`). A customer cannot tell from the card that tapping Add opens a chooser.

**INFERRED, but strongly:** the gap you are trying to close with colour is at least as much a *wording*
gap as a *colour* gap, and the codebase already owns the words.

### The palette, as this page actually uses it — QUOTED

| Colour | What it already means here | Sites |
|---|---|---|
| **amber-600 text / amber-300 border** | 🔴 **"required, and not yet chosen"** — the modal's unmet cue | `:3309`, `:3323`; the comment at `:3296-3299` says *"Required+unmet turns it AMBER (the sole unmet cue)"* |
| **amber-50 fill + amber-200 border** | warning / caution notice | `:2168` (sticky notice bar), `:2843`, `:3130`, `:3137`, `:3148`, `:3674` |
| **amber-700 text** | pre-order label (`⏳`) | `:2285` |
| **orange-50 fill + orange-100 border** | **the customer's own choices** — basket variant rows, order summary | `:2703`, `:3437`, `:3588` |
| **orange-600 fill** | primary action / selected | Add button, selected option chips |
| **orange-200 border** | deals / bundles | `:2315` |
| **red-50 + red-200** | refusal / error | `:2827`, `:2891` |
| **slate-50 fill + slate-100 border** | **neutral grouping — "these belong together"** | `:1206`, `:3600` |

`amber` appears 34 times in this file.

### Assessing light yellow (amber-50)

**In favour:** amber genuinely is the codebase's unmet-requirement colour, and it is used for that on
this very page for these very modifier groups. Reusing it would be consistent in a real sense.

**Against — two reasons, and I think they are decisive:**

1. 🔴 **On the list, "unmet" is universal, so it carries no information.** Nothing has been chosen for
   any item yet. Amber-wash every modifier item and amber stops distinguishing anything — it becomes
   decoration. The modal's amber works precisely *because* it is conditional (`isUnmet`) and turns off
   the moment a choice is made. The list has no such state to key off.
2. 🔴 **The established amber cue is an EDGE treatment, not a FILL.** `text-amber-600` and
   `border-amber-300` on a white chip. Every amber **fill** on this page (`bg-amber-50`) is a
   warning banner, and at least two of them (`:2843`, the sticky `:2168`) can appear on the same scroll
   as the menu. A light-yellow fill on every modifier item would put a caution wash across most of the
   menu and compete with genuine warnings — and it would tell the customer they have done something
   wrong when they have not yet done anything.

**Verdict on light yellow: consistent in intent, wrong in application. I would not use amber-50 as a
fill here.**

### The alternatives, reviewed

| Option | Reads as | Assessment |
|---|---|---|
| **`bg-slate-50` + `border-slate-100`** | "these belong together" | 🔴 **My recommendation.** It is the codebase's existing neutral grouping (`:1206`, `:3600` use exactly this pair), it is quiet enough to sit on every modifier item without shouting, and it does the one job the list actually needs — showing that the option line is a *set of choices* rather than a description. It leaves amber free to keep meaning "unmet" in the modal, which is where that state exists. |
| **`bg-orange-50` + `border-orange-100`** | "your choices" | Tempting, and the closest thematic match — but it is already spoken for by *selections the customer has made* (`:2703`, `:3588`). Using it for choices **not yet** made inverts its meaning within one screen. |
| **`bg-amber-50` + `border-amber-200`** | "caution" | Rejected, per above. |
| **A dashed or `border-2` slate outline, no fill** | "fill this in" | Worth considering. Carries the form-field connotation, adds no colour to the page, and is unambiguous. No precedent in this file, so it would be a new idiom. |
| **No box; words instead** | "choices needed" | See below. |

### 🔴 What I would actually recommend, and it is not primarily a colour

**Two changes, in this order of value:**

1. **Say it.** Render `groupRuleLabel(g)` on the list the way the modal does — the function is already
   imported at `:30`, already produces *"Required · Choose up to N"*, and is already shared across the
   manage modal and both order screens. Or change the button label from `Add` to `Choose` for items with
   required groups. Either one closes the real gap: a customer currently has **no** signal, and a
   coloured box is a weaker signal than a word.
2. **Then box it, in `bg-slate-50` / `border-slate-100`**, to group the option line visually. Quiet,
   already in the vocabulary, no collision with amber's warning meaning or orange's selection meaning.

**And a caution on cost, given section 1.** A box adds its own horizontal padding *inside* an item row
that is already only 324px wide at 390px. A `px-3` box would take the option line's usable width down to
~300px. **The boxing idea and the width complaint pull in opposite directions**, and it is worth deciding
which matters more before doing both.

**Not established:** how many items on a typical menu have required groups. If it is most of them, any
per-item box — whatever its colour — becomes background texture and the wording change carries all the
weight.

---

## 9. WHAT WAS AND WAS NOT ESTABLISHED

**Established (QUOTED):** every class string, the 512px column cap, the slate-50 page background, the
white sticky basket bar and its `border-t`, the `overflow-x-auto scrollbar-hide` on the tab strip, the
two `-mx-4 px-4` break-outs, `Sec`'s identical class string and its location inside the sheet, `sm:` as
the file's only breakpoint and its confinement to `Hdr`, the absence of a `tailwind.config.*`, the
amber-as-unmet cue at `:3309` / `:3323`, and `groupRuleLabel` being modal-only.

**Established by calculation (INFERRED):** the 66px / 34px / 32px split, the 324px content width, the
444px desktop margins, and the 34px desktop gain.

**Not established:** the exact rendered pixel width of the four tab labels (estimated ±10% from
character counts, not measured in a browser); whether any item row content actually truncates at 324px;
how many items on a typical live menu carry required groups; and whether any customer has been observed
failing to discover the tab scroll.

**No file was modified**, so no before/after character census applies. This report introduces `£`, `⚠️`,
`🔴`, `—`, `·`, `≥`, `±`, `→` and `ⓘ` — all glyphs already present in the source it quotes.
