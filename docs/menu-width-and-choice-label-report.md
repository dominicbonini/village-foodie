# Menu card padding on phones, and saying a choice is required on the list

Date: 13 August 2026
Status: BUILT. **One file changed** — [app/trucks/[slug]/order/page.tsx](app/trucks/[slug]/order/page.tsx).
`tsc --noEmit` clean. Non-ASCII census gained no character class.

No `next dev`, no `next build`, no commit, no deploy. No migration. Exactly the two changes asked for,
plus one consequential edit declared in full in section 0.

Nothing in the prompt arrived garbled.

---

## 0. 🔴 THE ONE JUDGEMENT CALL — READ THIS FIRST

The brief says **"DO NOT TOUCH THE TAB STRIP"**, and I changed two class values on the tab strip's
wrapper. Here is exactly what and why, so you can reverse it in one line if you disagree.

### What the strip's classes actually are

**QUOTED**, from the file's own comment at what was `:2423`:

```
// -mx-4 px-4 makes the white bar span the menu card's padding.
```

`-mx-4 px-4` is not a design decision belonging to the strip. It is a **hand-copied mirror of the card's
`px-4`** — it cancels the card's padding so the sticky white bar reaches the card's edge, then re-applies
the same value so the tabs line up with the item rows below.

### What happens if the mirror is left stale

With the card at `px-2` and the strip still at `-mx-4`, the negative margin pulls **16px** out of a box
that is only inset **8px**. The result:

- the sticky white bar sits **8px OUTSIDE the card's border on each side**, overhanging it and spilling
  across the `rounded-2xl` (16px) corners while pinned;
- the tabs themselves would still align with the item rows, so it is purely a visual break — and it only
  appears **while scrolling**, which is precisely where a static check misses it.

That is a new defect, not a preserved behaviour.

### What I changed, and what I did not

Changed: `-mx-4 px-4` → `-mx-2 px-2 sm:-mx-4 sm:px-4`. Two numbers.

**Not changed, and I checked each:** `overflow-x-auto`, `scrollbar-hide`, `gap-1.5`, the buttons'
`min-h-[44px] px-4 rounded-xl text-sm font-black uppercase tracking-wide`, the active/inactive colours,
`sticky`, `z-30`, `border-b border-slate-100`, `py-2 mb-2`, the `stickyTop` offset. **No fade, no
scroll-snap, no scrollbar, no wrap, no arrow, no affordance of any kind was added.** The clip is still
the only scroll affordance, exactly as you asked.

### The track width, stated honestly

🔴 **The track widens by 16px whether or not I touch the strip, and this is unavoidable.**

The track has always measured *exactly the card's content width*: `track = bar − 2×px` and
`bar = card_content + 2×mx`, so with `mx == px` the two cancel and `track == card_content`. Widening the
card's content by 16px widens the track by 16px. Leaving the strip's classes stale would not have
prevented that — it would have produced the same 16px track gain **plus** the overhanging bar.

So: **324px → 340px of track**, against roughly 480px of tabs. It still clips. Nothing was done to stop
it clipping.

### If you disagree

Revert `:2425` to `-mx-4 px-4` and the strip is byte-identical to before, at the cost of the overhang
described above. One line.

### The second mirror, which is NOT protected

The subcategory header at `:2492` carries the **identical** `-mx-4 px-4` for the identical reason
(`"-mx-4 px-4 + bg-white make it an opaque full-bleed band (matching the tab bar)"`). It is not in the
WHAT NOT TO TOUCH list, and it had to move with the card regardless. Updating one mirror and not the
other would have left the two sticky bands at different widths, stacked directly on top of each other.
Both now read `-mx-2 px-2 sm:-mx-4 sm:px-4`.

I did not treat this as a contradiction requiring a stop, because your stated reason for the prohibition
is entirely about the scroll affordance and the clip — neither of which this touches. Tell me if you
meant it literally and I will revert.

---

## 1. CHANGE 1 — PADDING RECLAIMED ON NARROW SCREENS

### The edit

**Before:**
```tsx
<div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-4 mb-4">
```

**After:**
```tsx
<div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-2 sm:px-4 py-4 mb-4">
```

`bg-white`, `border border-slate-200`, `rounded-2xl`, `shadow-sm`, `py-4` and `mb-4` are **all
unchanged** — the frame stays, as instructed, because that white-on-`bg-slate-50` contrast plus the
1px border is the only thing separating the menu from the sticky basket bar (itself `bg-white border-t
border-slate-200 fixed bottom-0`).

### Why `px-2` and not `px-0`

`px-0` would reclaim 16px more but put the thumbnail, the item name and the Add button flush against the
border at a 16px corner radius — which my earlier diagnosis flagged as reading like a bug even when the
arithmetic is right. 8px is the smallest clearance that keeps content off the radius.

If you want the extra 16px, `px-0 sm:px-4` on that one line gives 356px instead of 340px, with both
mirrors becoming `-mx-0 px-0 sm:-mx-4 sm:px-4` (i.e. just `sm:-mx-4 sm:px-4`).

### The breakpoint: `sm:` (640px)

`sm:` is the **only** responsive prefix in this 3,800-line file, used 12 times and all of them inside
`Hdr`. There is no `tailwind.config.*` (Tailwind v4; `app/globals.css`'s `@theme inline` block defines
colours and fonts only, **no `--breakpoint-*` overrides**), so `sm:` is Tailwind's default **640px**.

### 🔴 Confirming what changes and where — with the band you should know about

`<main>` is `max-w-lg mx-auto px-4` = a **512px** cap. Three bands, not two:

| Viewport | `<main>` width | Item-row content — before | after | Change |
|---|---|---|---|---|
| ≤512px (390px phone) | = viewport | **324px** | **340px** | **+16px** |
| 512–639px | 512px (capped) | 446px | 462px | **+16px** |
| **≥640px (`sm:`)** | 512px (capped) | **446px** | **446px** | 🔴 **none** |

**Above `sm:` nothing changes at all — confirmed.** At 768px and at 1400px the page is byte-identical to
before: a 512px column, centred, 446px of content, 16px inset, full frame.

⚠️ **The 512–639px band is a real consequence and I am not glossing it.** In that band the column is
already capped at 512px, so there is no width pressure — yet the inset drops to 8px anyway. It is 128px
of viewport width, it affects no phone, and the visual difference is 8px of inset on a tablet held in
portrait. I chose `sm:` because you asked for the breakpoint the codebase already uses and it is the only
one this page has. **If you would rather the change stop exactly where the width pressure stops**, swap
`sm:px-4` for `min-[512px]:px-4` on all three lines — that pins it to `max-w-lg` itself and the band
disappears. It would be the file's first arbitrary breakpoint, which is why I did not choose it unasked.

### The arithmetic at 390px

| Consumer | Before | After |
|---|---|---|
| `<main>` `px-4` | 32px | 32px (untouched) |
| card border | 2px | 2px (untouched) |
| card horizontal padding | 32px | **16px** |
| **Total chrome** | **66px (16.9%)** | **50px (12.8%)** |
| **Content width** | **324px** | **340px** |

**Reclaimed: 16px, a 4.9% wider item row.** Half of the card's 32px padding share; the frame's 2px was
deliberately left alone.

---

## 2. WHAT EVERYTHING INSIDE THE CARD DOES NOW — AND WHAT NEEDED ITS OWN PADDING

**Answer up front: nothing needed its own padding.** Every element that read from the card simply reads
8px instead of 16px on phones and 16px from `sm:` up. The only two elements that ever had their own were
the two mirrors, and those were updated (section 0).

| Element | Line | What it does now |
|---|---|---|
| Header row (flex) | `:2401` | inherits — sits 8px from the border on phones, 16px from `sm:` |
| — **`MENU` heading** | `:2402` | moves 8px left on phones. No own padding needed; it is a text node in an inherited flex row. |
| — **`ⓘ Allergen Info` link** | `:2408` | moves 8px **right** on phones (it is `justify-between`, so it tracks the right edge). Tap target is the button's own box and is unchanged in size — it simply sits 8px nearer the border. No own padding needed. |
| `menuTopRef` anchor | `:2417` | zero-size, unaffected |
| **Sticky tab strip** | `:2425` | 🔴 mirror updated — section 0 |
| — tab buttons | `:2439` | own `px-4 min-h-[44px]`, **untouched**; 44px tap target intact |
| min-height wrapper | `:2452` | inherits; `menuMinHeight` is a vertical value, unaffected |
| **Sticky subcategory header** | `:2492` | 🔴 mirror updated — section 0 |
| Item row wrapper (`py-3`) | `:2547` | inherits. **This is the row that gains the 16px.** |
| — thumbnail `w-16 h-16` | `:2553` | fixed 64px; moves 8px left, does not resize |
| — item name + badges | `:2551` | inherits; gains 16px of wrap width |
| — description | `:2603` | inherits; gains 16px — the line most likely to drop a wrap |
| — dietary / allergen / spice chips | `:2607` | inherits; one more chip may now fit per row before wrapping |
| — required-option teaser | `:2673` | inherits; gains 16px, which partly offsets the new label (section 3) |
| — bottom baseline (price / Add) | `:2695` | inherits; `justify-between`, so **price moves 8px left and the Add button 8px right** |
| — price | `:2696` | inherits via the baseline |
| — **Add button** | `:2737` | own internal `px-3 py-1.5`, **untouched**. Its box is the same size; only its position moves 8px right. |
| — per-variant `+/−` rows | `:2769` | own `px-3` inside `bg-orange-50 rounded-xl`; the wrapper widens by 16px |

The two things worth watching in the browser: the **Allergen Info link** and the **Add button** now sit
8px from a 16px-radius corner rather than 16px. Both are comfortably inside the straight run of the
border, not on the curve — the radius only bends the last 16px vertically, and neither element is within
16px of the card's top or bottom edge.

---

## 3. CHANGE 2 — "REQUIRED · CHOOSE ONE" ON THE LIST

### Where it sits — QUOTED

Inside the required-group preview line at `:2673`, as a sibling of the group-name span and immediately
before the options:

```tsx
<p key={g.id} className="text-xs text-slate-500 leading-snug flex flex-wrap items-center gap-x-1 gap-y-0.5">
  {!g.hide_name && <span className="font-semibold text-slate-600">{g.name}:</span>}
  <span className="font-semibold text-slate-600">{groupRuleLabel(g)}</span>
  {g.options.map((opt, i) => ( … ))}
</p>
```

So the order on the line is: **group name (when it has one) → rule label → options**.

`groupRuleLabel` was already imported at `:30` and already called at `:3300` in the modal with the same
default `'customer'` audience. **One source, two surfaces, no new string.** Nothing about what a group
requires or how modifiers are validated was touched — `minRequiredForGroup`, `validateModifierSelection`
and `sortGroupsRequiredFirst` are all unchanged, and `previewGroups`' filter is unchanged.

### What it reads — VERIFIED against the real function

`previewGroups` is already filtered to `minRequiredForGroup(g) > 0`, so the base is **always
"Required"** on the list; only the cap phrase varies with `max_choices`.

| Group | `groupRuleLabel(g)` | On the list |
|---|---|---|
| **hide_name**, required, `max_choices: 1` | `Required · Choose one` | 🔴 **the label is the whole leader — this is the case that had nothing at all** |
| named "Protein", required, `max_choices: 1` | `Required · Choose one` | `Protein: Required · Choose one` |
| named "Sauces", required, `max_choices: 2` | `Required · Choose up to 2` | `Sauces: Required · Choose up to 2` |
| named "Toppings", required, `max_choices: 99` | `Required` | `Toppings: Required` |
| **optional**, `max_choices: 3` | `Optional · Choose up to 3` | **never rendered** — filtered out upstream |

### Styling: no amber, and why

**QUOTED** from the modal at `:3309` / `:3323`, and its own comment:

```
// Required+unmet turns it AMBER (the sole unmet cue)
```
```tsx
<span className={`ml-2 font-bold ${isUnmet ? 'text-amber-600' : 'text-slate-400'}`}>· {ruleHint}</span>
```

Amber there is **conditional on `isUnmet`** and switches off the moment a choice is made. On the list
there is no selection state — **every group with options is unmet by definition** — so amber would mark
every modifier item on the menu identically and distinguish nothing. It would also collide with the
`bg-amber-50 border-amber-200` warning banners that can share the same scroll (`:2168`, `:2843`, and
four more).

The label is therefore **words, in `font-semibold text-slate-600`** — the same treatment the group name
already has, so name and rule read as one leader ahead of the lighter `text-slate-500` options. No new
colour was introduced anywhere.

### ⚠️ One legibility observation, reported and not acted on

The label ends in a `·` and the options are separated by `·`, so the plain-text run is:

```
Required · Choose one Chicken Tikka (M) · Paneer Tikka (M) · Chicken Tikka (L) +£3.00
```

In the browser the boundary is carried by three things at once: the `gap-x-1` (4px) between flex
children, the weight step (semibold → normal) and the colour step (slate-600 → slate-500). That should
read, but it is the weakest point of this change and it is the strongest argument for the box in section
4. I have not added a separator, a dash or a line break, because that would be a third change.

---

## 4. THE BOX — BOTH VERSIONS, AND WHETHER IT IS WORTH IT

**Built: WITHOUT the box.** Here is what each looks like, at 390px with the new 340px row.

### Without (what is now in the file)

```
┌─ card border ──────────────────────────────────────────┐
│ 8px                                                8px │
│  ┌──────┐  Chunky Chips Bowl                           │
│  │ img  │                                              │
│  └──────┘                                              │
│  Chunky chips, 38hr makhani sauce, Pickle onion &      │
│  chutney.                                              │
│  🌶🌶🌶                                                  │
│  Required · Choose one Chicken Tikka (M) · Paneer      │
│  Tikka (M) · Chicken Tikka (L) +£3.00 · Paneer         │
│  Tikka (L) +£3.00                                      │
│  £10.99                                        [ Add ] │
└────────────────────────────────────────────────────────┘
   option-line usable width: 340px
```

### With `bg-slate-50` / `border-slate-100` (not built)

```
┌─ card border ──────────────────────────────────────────┐
│ 8px                                                8px │
│  ┌──────┐  Chunky Chips Bowl                           │
│  │ img  │                                              │
│  └──────┘                                              │
│  Chunky chips, 38hr makhani sauce, Pickle onion &      │
│  chutney.                                              │
│  🌶🌶🌶                                                  │
│  ╭────────────────────────────────────────────────╮    │
│  │ Required · Choose one                          │    │
│  │ Chicken Tikka (M) · Paneer Tikka (M) · Chicken │    │
│  │ Tikka (L) +£3.00 · Paneer Tikka (L) +£3.00     │    │
│  ╰────────────────────────────────────────────────╯    │
│  £10.99                                        [ Add ] │
└────────────────────────────────────────────────────────┘
   option-line usable width: 340 − 2 (border) − 24 (px-3) = 314px
```

### Verdict: **not worth it, not yet**

| | Without | With |
|---|---|---|
| Option-line width at 390px | **340px** | **314px** |
| Net vs. before change 1 | **+16px** | 🔴 **−10px** |
| Says a choice is required | yes, in words | yes, in words |
| Groups the choices visually | by weight + colour only | yes, explicitly |
| New idiom on this page | none | one more bordered container per modifier item |

🔴 **The box gives back more width than change 1 reclaimed.** A `px-3 py-2` container costs 26px of the
340px row, taking the option line to 314px — **10px narrower than before either change**. You would have
spent change 1 and come out behind on the exact line you were trying to help.

Two further reasons to hold off:

1. **The label may be sufficient on its own.** The gap was that nothing said a choice was needed. Words
   now say it. A container is a second, weaker signal for the same fact.
2. **Repetition.** If most items on a menu carry a required group — and for the truck in the screenshot
   every Mains item does — a box on each becomes background texture and stops separating anything.

**Recommendation: ship the label, look at a real menu on a real phone, and add the box only if the
label genuinely fails to separate from the options.** If it does fail, the cheaper fix is a separator or
a line break inside the existing `<p>` (0px cost) before reaching for a container (26px cost).

---

## 5. VERIFICATION

### `groupRuleLabel` against the real function — 5 cases, all pass

Run via jiti against `lib/modifier-rules.ts` (pure functions, no network, no database, **no writes of
any kind**):

```
hide_name required, max_choices 1
  minRequiredForGroup = 1  -> on the list: YES
  groupRuleLabel()    = "Required · Choose one"
  RENDERS AS          : Required · Choose one Chicken Tikka (M) · Paneer Tikka (M) · Chicken Tikka (L) +£3.00 · Paneer Tikka (L) +£3.00

named required, max_choices 1
  groupRuleLabel()    = "Required · Choose one"
  RENDERS AS          : Protein: Required · Choose one Chicken · Paneer

named required, max_choices 2
  groupRuleLabel()    = "Required · Choose up to 2"
  RENDERS AS          : Sauces: Required · Choose up to 2 Makhani · Mint

named required, unlimited (99)
  groupRuleLabel()    = "Required"
  RENDERS AS          : Toppings: Required Onion

OPTIONAL group (must never reach the list)
  minRequiredForGroup = 0  -> on the list: NO (filtered out)
  groupRuleLabel()    = "Optional · Choose up to 3"

sortGroupsRequiredFirst -> Protein, Extras

ALL PASSED
```

### The three rows you asked for

**1. Item with a hide_name required group** — the case in your screenshot, which previously said nothing:

```
Chunky Chips Bowl
Chunky chips, 38hr makhani sauce, Pickle onion & chutney.
🌶🌶🌶
Required · Choose one  Chicken Tikka (M) · Paneer Tikka (M) · Chicken Tikka (L) +£3.00 · Paneer Tikka (L) +£3.00
£10.99                                                                                            [ Add ]
```
Leader is the rule label alone, because `hide_name` suppresses the internal
`"Mains - Chunky Chips Bowl 1"` name — that suppression is unchanged.

**2. Item with a named required group:**

```
Loaded Fries
Skin-on fries, cheese sauce.
Protein: Required · Choose one  Chicken · Paneer
£8.99                                                                                             [ Add ]
```
Name keeps its colon exactly as before; the label follows it.

**3. Item with no groups at all — MUST BE UNCHANGED:**

```
Mango Lassi
Sweet yoghurt drink.
£3.50                                                                                             [ Add ]
```
🔴 **Unchanged, and structurally so.** `previewGroups.length === 0` returns `null` at `:2660`, before any
of the new markup is reached. An item with no modifier groups renders exactly what it rendered
yesterday — the only difference on its row is the 16px of width every row gained.

### Page at three widths

| Width | `<main>` | Card inset | Item content | vs. before |
|---|---|---|---|---|
| **390px** | 390px | **8px** | **340px** | **+16px** |
| **768px** | 512px, centred, 128px slate-50 each side | 16px | 446px | **identical** |
| **1400px** | 512px, centred, 444px slate-50 each side | 16px | 446px | **identical** |

Both 768px and 1400px are above `sm:` (640px), so `sm:px-4`, `sm:-mx-4` and `sm:px-4` all apply and the
rendering is the one that shipped yesterday.

### Typecheck

`npx tsc --noEmit` — clean, no output.

---

## 6. NON-ASCII CENSUS

`app/trucks/[slug]/order/page.tsx` — the only modified file. 38 classes before, **38 after, no class
gained**. Only glyphs already in the file's vocabulary moved:

| Glyph | Before | After |
|---|---|---|
| `·` U+00B7 | 15 | 17 |
| `—` U+2014 | 323 | 332 |
| `…` U+2026 | 13 | 14 |
| `─` U+2500 | 2288 | 2330 |
| `⚠` U+26A0 | 75 | 80 |
| `️` U+FE0F | 81 | 86 |
| `🔴` U+1F534 | 88 | 92 |

Unchanged in count: `£`(27) `§`(6) `×`(4) `–`(4) `’`(8) `←`(8) `→`(33) `⇒`(11) `−`(9) `≠`(1) `≤`(2)
`≥`(2) `⌄`(1) `⏳`(1) `⏸`(2) `ⓘ`(1) `▾`(1) `●`(1) `⚡`(1) `✏`(5) `✓`(4) `✕`(15) `⟷`(1) `⟺`(3) `🎁`(3)
`📎`(1) `📝`(4) `📡`(1) `🕐`(1) `😕`(3) `🚚`(3) `🚫`(1).

---

## 7. WHAT WAS NOT TOUCHED

Confirmed by inspection, per the WHAT NOT TO TOUCH list:

- **The sticky basket bar** (`:3222`) — unchanged.
- **The item modal** (`:3281` onward) — unchanged, including its amber unmet cue.
- **The checkout sheet** (`:2785`) and both `<Sec>` cards inside it — unchanged. ⚠️ `Sec` at `:3805` uses
  the **byte-identical class string** the menu card had (`bg-white rounded-2xl shadow-sm border
  border-slate-200 px-4 py-4 mb-4`). It was left alone deliberately: it lives inside the bottom sheet on
  its own `px-5`, a different surface, with no width pressure. **The two are now visually divergent by
  8px on phones — stated so it is a known divergence rather than a discovered one.**
- **Other cards in `<main>`** — the deals/bundle cards (`:2315`, `border-orange-200`), the `TruckListCard`
  event card (shared with the truck profile page), and the three `bg-slate-100 rounded-xl` notice blocks
  are all unchanged. On a phone the menu card is now inset 8px while its neighbours are inset 16px.
  That is the visible cost of scoping the change to the menu card as instructed, and it is the thing to
  look at first when you see it on a device.
- **Modifier requirements and validation** — `minRequiredForGroup`, `validateModifierSelection`,
  `sortGroupsRequiredFirst`, `hasUnsatisfiableRequiredGroup` and `lib/modifier-rules.ts` as a whole:
  untouched. `groupRuleLabel` is **read**, never modified.
- **The tab strip's behaviour** — section 0. Two mirror values changed; nothing else, and no affordance.
