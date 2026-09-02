# Customer menu row — two-column restructure

**Implemented. Nothing committed, nothing deployed. No SQL, no migrations.**

---

## 1 · 🔴 SURFACES — WHAT RENDERS THIS, AND WHAT IS SHARED

> ## ✅ NOTHING IS SHARED. THE INSTRUCTION IS NOT CONTRADICTORY. I DID NOT NEED TO STOP.

**Every surface that renders this row — established by grep across `app/`, `components/`, `lib/`:**

| Surface | Renders this row? |
|---|---|
| **`app/trucks/[slug]/order/page.tsx:2815-3012`** | 🔴 **THE ONLY ONE.** Inline JSX, not a component |
| `components/dashboard/AddOrderPanel.tsx` (operator Add-order) | ❌ **No.** **`<img>` count: ZERO** — the operator menu has no item photos at all |
| `app/manage/[token]/page.tsx` (manage) | ❌ **No.** Its own markup, its own `image_path` thumbnails at 4072 / 4806 |
| `components/embed/EmbedParts.tsx` | ❌ **No menu list** |
| `components/menu/` | ❌ Contains only `MenuUploadFields.tsx` (the import dropzone) |

**Three independent checks, all READ:**

1. **`photo_url` renders in exactly one place** — `order/page.tsx:2817-2822`. The only other hits are
   `app/api/menu/[truckId]/route.ts:590` (which maps `image_path → photo_url`), `lib/basket-utils.ts:28`
   (the type), and the **discovery** routes, which use `trucks.photo_url` — **a different column, for
   truck/venue photos, not menu items.**
2. **The row's class string `w-16 h-16 rounded-xl object-cover` appears once in the entire repo.**
3. **Nothing imports from the customer order page.**

⚠️ **THE ONE THING THAT LOOKS LIKE SHARING AND IS NOT.** Comments in this very row (lines 3016, 3045)
say *"Measured against `components/dashboard/AddOrderPanel.tsx`, which is the same control on the
operator screen"* and list a px-by-px table. 🔴 **That is HAND-MATCHING, not shared code** — two files
tuned to look alike. **They can drift, and this change drifts them.** ⚠️ **But the drift is in the
customer row only, and the operator panel renders no images, so there is no shared style to break.**

> **Styles are Tailwind utilities written inline on this element. There is no shared CSS class, so no
> other surface can inherit this change.**

---

## VERIFICATION

**What I performed: PARSE and EXECUTION. NOT a rendered measurement.**

| Check | Result |
|---|---|
| **PARSE** — `tsc` syntax-only on the edited file | ✅ **Clean** |
| **PARSE** — same run against the pre-edit backup | Used as the control. 🔴 **It caught a real break I introduced** — my replacement orphaned the tail of the old comment (`TS1381` at 2886). **Fixed, re-parsed clean** |
| **EXECUTION** — `GET /trucks/test-truck/order` | HTTP 200, 33,497 B |
| **EXECUTION** — `GET /api/menu/*` | Real item data, below |
| Diff scope | `app/trucks/[slug]/order/page.tsx` **only**, +35 −9 |

### 🔴 I COULD NOT MEASURE THE RENDERED ROW, AND I AM NOT GOING TO PRETEND OTHERWISE

**The page is `'use client'` (line 1) and the menu is fetched after mount** (`fetch(\`/api/menu/${slug}\`)`,
lines 979 / 1028 / 1869 / 2050). **`curl` returns the shell: `divide-slate-200` and `Menu</h2>` occur
ZERO times, and `flex items-start gap-3` occurs ZERO times in the served HTML.**

> **Every height and column width in sections 3-5 is ARITHMETIC FROM THE CSS, not a measurement.**
> **This is exactly the failure mode of the hero-image rounds, so it is stated once, plainly, and every
> number below inherits it.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 🔴 MEASURED, AND IT CHANGES THE PICTURE: MOST ITEMS HAVE NO PHOTO

**EXECUTION, `/api/menu/` on both test trucks:**

| Truck | Items | **With photo** | **Without → spacer branch** | No description |
|---|---|---|---|---|
| `test-truck` | 29 | **2** | 🔴 **27** | 8 |
| `app-tester` | 29 | **0** | 🔴 **29** | 8 |

> 🔴 **On these menus the placeholder is the NORMAL case, not the exception. 93-100% of rows render an
> empty 104px column, and the row is 116px narrower for text than it was — on a 340px row that is 34%
> of the width given to nothing.**

⚠️ **This is a consequence of item 2 as specified, not a deviation from it. I built what you asked.**
**But you should see the number before this reaches a truck whose operator has uploaded no photos.**
**The switch is one line — §"If you want the column to collapse" below.**

---

## 2 · What was built

**`app/trucks/[slug]/order/page.tsx`, one row, +35 −9.**

```
BEFORE ("Option B")                      AFTER
┌──────┬───────────────┐                 ┌──────────┬──────────────────┐
│ img  │ name          │                 │          │ name             │
│ 64px │               │                 │  image   │ description      │
└──────┴───────────────┘                 │  104px   │ chips            │
  description (full width)               │  square  │ price │ Add      │
  chips (full width)                     └──────────┴──────────────────┘
  price │ Add (full width)
```

| Requirement | How |
|---|---|
| Two columns | `<div className="flex items-start gap-3">` wrapping an image column and one `flex-1 min-w-0` text column holding **name, description, chips, required-group preview, price and Add** |
| **Identical left edge on every row** | ✅ **`<div aria-hidden className="w-[104px] shrink-0" />`** when `photo_url` is null |
| **Top-aligned** | ✅ **`items-start`, not `items-center`.** Centring would float a one-line name down the middle of a 104px image and no two rows would agree |
| Square, current radius | ✅ `w-[104px] h-[104px] … rounded-xl object-cover` — **`rounded-xl` is unchanged**, `object-cover` unchanged |
| Add button on the right | ✅ Untouched — still `flex items-center justify-between` with the button in a `shrink-0` group |
| Size | **104px**, inside your 100-120px. **One value, no new breakpoint** — this file's stated principle is *"NOTHING CHANGES AT sm: AND ABOVE"* (line 2623) because `main` is capped at `max-w-lg` |

### The placeholder — what I used and why

**An empty `aria-hidden` `<div>` with WIDTH ONLY and NO HEIGHT.**

- 🔴 **Not a grey tile.** The manage screen uses a `bg-slate-100` + 📷 tile, which is right there — but
  repeated down a customer menu where 27 of 29 items have no photo, **a grid of empty grey squares reads
  as broken images**, not as "no photo".
- 🔴 **No height, deliberately.** A `h-[104px]` spacer would pad every photo-less row out to 104px of
  nothing. Width-only means **a photo-less row is as tall as its own text** — see §4.
- **`aria-hidden`** so it adds nothing to the accessibility tree.

### Reversing a documented decision

⚠️ The old layout was labelled **"Option B"** and its comment gave the reason: *"a FULL-WIDTH description
+ chips block below it, so the description escapes the narrow flex-1 column."* **That premise is
knowingly reversed here** — the new comment records what it was and why it changed, rather than deleting
the reasoning.

---

## 3 · Price, Add, and row height

**Price and Add now sit BELOW the description and chips, INSIDE the text column** — so the price's left
edge aligns with the description's left edge, not with the image. The Add button is at the text column's
right edge, which is the row's right edge.

### Geometry — ARITHMETIC, not measured

```
row content width = viewport − main px-4 (32) − card px-2 (16) − border (2)
390px viewport → 340px row → text column 340 − 104 − 12 (gap-3) = 224px
320px viewport → 270px row → text column 154px
≥640px (capped)→ 446px row → text column 330px
```

**Row heights, from the Tailwind values (`text-sm` 14px × `leading-snug` 1.375 = 19.25px/line):**

| Case | BEFORE | AFTER | Δ |
|---|---|---|---|
| **Photo, short description (~60 ch), chips** | 192px | **148px** | ✅ **−44px** |
| **Photo, longest real description (153 ch)** | 231px | **206px** | ✅ **−25px** |
| **Photo, NO description** | 124px | **128px** | ⚠️ **+4px** — the 104px image now sets the height |
| 🔴 **NO photo (27 of 29 real items), ~90 ch** | 148px | **168px** | 🔴 **+20px** |

> 🔴 **THE ROW DOES NOT UNIFORMLY GET SHORTER, AND FOR THIS MENU IT MOSTLY GETS TALLER.** The 44px saved
> by moving the name beside the image is partly given back because a 224px column wraps the description
> into more lines than a 340px one — and for a photo-less item there was never an image band to save.

### Items per phone viewport

🔴 **I cannot give you a trustworthy before/after count.** The list's available height depends on the
page header, the sticky category bar (line 2663) and the sticky basket footer — **none of which I
measured, because the page renders client-side and I could not measure anything.**

**Normalised instead, per 500px of list (ARITHMETIC):** photo + short description **2.6 → 3.4 rows**;
photo-less **3.4 → 3.0 rows**.

---

## 4 · Short content — an item with a name and price only

> ✅ **The row KEEPS THE IMAGE HEIGHT. It does not shrink and it does not misalign.**

**With a photo:** the flex row's height is the taller child. Text column ≈ 56px, image 104px → **row is
104px**, name top-aligned on the image's first line, empty space below the price. **Intended.**

**Without a photo:** the spacer has **no height**, so nothing holds the row open → **the row collapses to
its text height (≈56px)**. ✅ **This is why the spacer is width-only.**

⚠️ **THE CONSEQUENCE, STATED PLAINLY: two short items — one with a photo, one without — will be
different heights (104px vs 56px).** The **left edge** is identical, as required; the **row height** is
not. **Forcing them equal would mean giving the spacer a height, which pads every photo-less row with
48px of nothing.** I chose the alignment you specified over a uniform height you did not.

---

## 5 · Extremes

**Smallest width accounted for: 🔴 320px** (iPhone SE 1st gen / Android small). Text column **154px**.

| Extreme | Behaviour |
|---|---|
| **Very long item name** | The name sits in `flex flex-wrap` inside `min-w-0`, so it **wraps to as many lines as it needs** and pushes the description down. No truncation, no ellipsis |
| 🔴 **A long UNBROKEN word** (a 30+ character name with no spaces) | 🔴 **IT WILL OVERFLOW.** `min-w-0` lets the column shrink but **there is no `break-words`**, so a single long token cannot wrap. **This risk existed before and my change makes it materially worse — the column went from 340px to 224px.** ⚠️ **See the follow-up below; I did not add the class because you scoped this to the restructure** |
| **Four-line description** | Wraps inside 224px. Row grows; the image does not. Longest real description measured: **153 characters** |
| **3 dietary tags + spiciness** | `flex flex-wrap gap-1` — wraps to a second chip line inside the column. At 154px (320px viewport) expect **2-3 chip lines** |
| **Everything at once at 320px** | Name 2 lines + description 5 lines + 3 chip lines + price row ≈ **250px row.** Tall, but nothing overlaps and nothing is clipped |
| **Price + Add at 154px** | Price ≈ 45px, Add ≈ 55px, `justify-between` → **fits with ~54px to spare** |

---

## 6 · Scope — what was NOT touched

| | |
|---|---|
| Image upload path / storage path | ✅ **UNTOUCHED.** `git diff` contains **0** matches for `image_path`, `upload`, `storage`, `get_upload_url` |
| Menu data model | ✅ **UNTOUCHED** — `app/api/menu/[truckId]/route.ts`, `lib/basket-utils.ts` both clean |
| **Operator manage screen** | ✅ **UNTOUCHED** — and §1 establishes it does not share the component, so no report-before-change was owed |
| `AddOrderPanel`, embed, discovery | ✅ Untouched |
| Add/stepper logic, modal, basket, stock gating | ✅ **Untouched** — only relocated in the tree |
| Committed / deployed | **Neither** |

⚠️ **`lib/plan-features.ts` also shows as modified in `git status`. That is NOT from this task** — it is
the uncommitted WhatsApp/Android "coming soon" change from earlier today.

---

## 7 · What must be verified on a real phone, and the failing cases

🔴 **This is a live customer-facing ordering surface. Pizzeria Gusto is trading.**

### Must be a real phone — a laptop cannot show these

1. 🔴 **THE PHOTO-LESS MENU.** **Load a truck with no item photos** (`app-tester` is 0/29). **The failing
   case: 116px of empty column on every row, and rows ~20px taller than before.** **This is the single
   most likely reason to reject the change**, and a narrowed desktop window will not convey how much of a
   phone's width it costs.
2. 🔴 **A REAL LONG DISH NAME AT 320px.** **The failing case: an unbroken token overflowing the column**
   — the description reflow makes this far more likely than it was. Chrome's device emulation reflows
   text differently from iOS Safari; **this one needs the device.**
3. **iOS "Larger Text" / Dynamic Type.** The chips and description are rem-based **by deliberate design**
   (comments at 2862, 2907). **The failing case: at the largest setting the text column outgrows the
   image by so much that the 104px image reads as a stray thumbnail.** Not simulable by zoom.
4. **Scroll rhythm with the sticky category bar** (line 2663) and the sticky basket footer. **The failing
   case: taller rows mean fewer items between sticky elements, and the pinned category header can end up
   nearly touching the next one.**
5. **A real photo at 104px.** `object-cover` on a **square** crop — **the failing case: a wide dish photo
   losing its subject to a centre crop.** 64px hid this; 104px will not.

### A laptop is enough for

The 320px column arithmetic, `items-start` alignment, the spacer's left edge, and the price/Add row
fitting at 154px.

---

## Follow-ups I did NOT do

1. 🔴 **`break-words` on the item name.** **One class.** My change increases the overflow risk and I am
   flagging rather than silently widening the scope — **but I recommend it before this ships.**
2. 🔴 **If you want the column to collapse on photo-less menus:** compute `anyPhoto` once over the
   category's items and render the image column only when true. **This contradicts "identical on every
   row" as literally written, which is why I did not do it** — it keeps the edge identical *within a
   menu*, not across menus. **Your call, and the 27/29 measurement is the reason to make it.**

## What I could not establish

1. 🔴 **Anything about how this actually looks.** **The menu renders client-side; I measured nothing at
   the client.** Every height in §3-§5 is arithmetic from the CSS.
2. **The list's available viewport height**, hence a real items-per-screen count.
3. **Whether any production truck has photos on most items.** **I measured two test trucks only.** If
   real menus are photo-rich, the §"MEASURED" warning is much less severe than it reads.
