# LANDING POLISH — HERO, CTA, ICONS, PRICING HEADING, TEXT SIZE

**6 October 2026 · branch `main`, local only. Nothing pushed, nothing deployed, no production request,
no database write, no truck touched, and the menu-upload demo flow was not run.**

⚠️ **TWO PARTS OF THIS WORK WERE SUPERSEDED THE SAME DAY**, by follow-up briefs that arrived while it
was being checked. Both are recorded here as this workstream delivered them, with a pointer to what
replaced them, because the `sizes` attributes and the `priority` flags moved with each change:

| | superseded by |
|---|---|
| §1's hero composition (kitchen largest, three different tilts) | `docs/landing-hero-fan-report.md`, then `docs/landing-hero-fan-sizing-report.md` |
| §3's pale tinted square behind each icon | `docs/landing-icons-inline-report.md` |

---

## 📁 FILES CHANGED

| | |
|---|---|
| `app/landing/page.tsx` | the icon imports and `TileIcon`, six tiles, the CTA zone, the pricing heading, three `sizes` |
| `app/landing/landing.css` | the hero frame and composition, `.hero-cta-note`, the icon rule, the type bump |
| `package.json` / `package-lock.json` | **lucide-react added** — there was no icon library |

**Added:** `docs/landing-polish-shots/before/` and `/after/` — six screenshots, §7.

---

## 🔴 1 · THE HERO SCREENSHOTS

**Frame, on all three:** 12px corners on the two big screens, **22px on the phone** (a phone's corners
are visibly rounder than a tablet's, and one radius for both made it read as a small tablet), a **1px
`rgba(15,23,42,.08)` border**, and the brief's shadow `0 25px 50px -12px rgba(15,23,42,.25)`.
⚠️ The border is 1px rather than 2 because these frames were rotated at the time, and a 2px border on a
rotated box renders visibly uneven along its two near-horizontal edges.

**Composition, as this workstream left it** (since replaced — see the note above): kitchen largest and
front-left at 430px, dashboard behind and up-right at 364px, phone in front at 166px, `.fan` min-height
raised to 525px. ⛔ **The hero text was not touched**: `.hero-grid` stayed `.9fr 1.1fr`, so the group
grew into the column it already occupied and the heading kept its 3 lines and the button its one.

🔴 **A FAINT TINT WAS ADDED AND IS NOW GONE.** `.fan::before`, a plain `--wash` rounded rectangle — no
gradient, glow, blob or pattern, which the brief ruled out by name. It was removed by the hero rebalance
brief two steps later.

⚠️ **No animation was added.** The pre-existing `hg-rise` entrance on `.fan` was left alone; removing it
was not asked for.

### ⛔ 1a · THE BRIEF'S PREMISE WAS FALSE: NOTHING REQUESTED 3840px IMAGES

The brief said the three hero screenshots "currently request w=3840". **Measured before any edit, across
three viewports × three device pixel ratios, none of them did:**

| | 390 dpr1 | 390 dpr2 | 1440 dpr1 | 1440 dpr2 | 1728 dpr3 |
|---|---|---|---|---|---|
| `kitchen.png` | 384 | 640 | 384 | 640 | 1080 |
| `dashboard-v4.png` | 640 | 640 | 640 | 828 | 1200 |
| `customer-order.png` | 256 | 256 | 256 | 384 | 640 |

All three already carried a correct `sizes` matching their CSS caps. `w=3840` is what `fill` or
`sizes="100vw"` produces, and these had neither. The `sizes` values were still updated — three times, as
the composition changed three times — but to **track the caps**, not to fix a 3840 that never existed.

---

## 🔴 2 · THE HERO CTA ZONE

**Removed:** the block beside the button — a bold 1.12rem line and a grey one. Two sentences in two
weights, next to a button that already says "Upload my menu": the hero was making its offer three times.

**Added, directly under the button:**

> No signup, no card. See it working in under 60 seconds.

⚠️ **It is a sibling of `.hero-cta-row`, not a child.** That row is `flex-direction: row` above 940px, so
a third child would have sat *beside* the button — the arrangement being removed. As a sibling it stacks
under the button at every width with no second rule.

⚠️ **`--hero-grey` (#3E5472, 7.73:1), not `--ink-soft` (#5F7A99, 4.44:1).** This is small secondary text
and `--ink-soft` **misses** the 4.5:1 floor. The token was already declared on `.hero` for exactly this
job, so nothing new entered the stylesheet.

### 🔴 2a · THE PHONE SUB-LINE DECISION

`.hero-sub-sm` (below 640px) read *"Upload your menu, no signup needed. / See a working demo in under 60
seconds."* The new line reads *"No signup, no card. See it working in under 60 seconds."* — **the same two
facts**, so a phone would have carried them above *and* below the button.

🟢 **The brief decides: "keep only the new line under the button."** So `.hero-sub-sm` is switched off
below 640px. ⚠️ **Its rule and its markup are left in place**, not deleted: that element carries a
measured width note (it holds on one line from 360px up) that would be expensive to rediscover, and it
costs nothing while `display: none`. One line turns it off, and `.hero-cta-text { display: none }` was
deleted from the same media block with the element it referred to.

---

## 🔴 3 · THE SIX TILE ICONS

**Icon library: there was none.** Checked across `package.json` and every import in `app/`, `components/`
and `lib/`. **`lucide-react` was added**, as the brief directed.

⛔ **Six named imports, not `import * as icons`.** lucide ships ~1,500 components; a namespace import or
a dynamic `icons[name]` lookup defeats tree-shaking and pulls the lot into the landing bundle.
⚠️ **`Image` is aliased to `ImageIcon`** — `next/image` is already imported into that file under that
name, and the two would collide in a way TypeScript reports at the wrong place.

| Tile | Icon |
|---|---|
| Kill the queue | `Clock` |
| Never promise a time you can't hit | `Gauge` |
| Works on any device | `MonitorSmartphone` |
| Your social media posts, made for you | `Image` |
| WhatsApp auto-replies | `MessageCircle` |
| No signal? Keep serving. | `WifiOff` |

⚠️ **The brief listed that fourth tile as "Your social posts, made for you"**; it is actually **"Your
social media posts, made for you"** after a rename earlier the same day. Mapped to the right tile.

🔴 **One `TileIcon` component so all six are one set** — six separate inline wrappers is how a set
drifts. ⚠️ **`aria-hidden` on the wrapper**: decorative, since every tile states its point in the heading
beside it. ⚠️ **Seven call sites, not six** — the WhatsApp tile has two `WHATSAPP_LIVE` branches.

**As this workstream left it:** a 2.6rem rounded square in `--orange-wash` above the heading, with a 26px
navy glyph. ⛔ **That square was removed hours later** — see `docs/landing-icons-inline-report.md`.

---

## 🔴 4 · THE PRICING HEADING

> ~~Start free. Stay free, if that's all you need.~~ → **Start free. Upgrade when you need to.**

⛔ **Nothing else in that section changed**: the fee paragraph, the orange trial banner, the three cards,
the button, the switching block and the small print are untouched. Verified as an absence too — the old
sentence appears nowhere on the page.

---

## ⛔ 5 · THE TEXT SIZE — **BUMPED, THEN REVERTED THE SAME DAY**

> 🔴 **THIS SECTION'S CHANGE NO LONGER APPLIES.** Dominic, on seeing it: *"the text size in what it does
> has been changed. its larger than it was before. change it back to how it used to be."* — and a minute
> later *"i think the text size in getting going has also been changed."* It had; same brief, same bump.
> **All four values are back at their originals** (`.does-item h3` 1.05rem, `.does-item p` .94rem,
> `.step h3` 1.12rem, `.step p` .95rem). What follows is what this workstream did, for the record.
> ⚠️ **Only the `font-size`s went back.** `.does-item h3` is still a flex row — that is the inline-icon
> layout from `docs/landing-icons-inline-report.md`, a different change, and it stays.

⛔ **THERE IS NO TYPE SCALE IN `landing.css` TO USE.** The brief said to prefer an existing scale over
one-off sizes. I looked: `clamp()` appears on `h1`, `h2` and `blockquote` only; every other size in the
file is a per-rule literal. There is no `--fs-*` ladder, and inventing one inside a visual-polish task
would be a refactor nobody asked for. These are therefore literals, like their neighbours — **recorded
rather than quietly done**.

| | before | after | |
|---|---|---|---|
| `.does-item h3` | 1.05rem (16.8px) | **1.18rem (18.88px)** | +12.4% |
| `.does-item p` | .94rem (15.04px) | **1.05rem (16.8px)** | +11.7% |
| `.step h3` | 1.12rem (17.92px) | **1.25rem (20px)** | +11.6% |
| `.step p` | .95rem (15.2px) | **1.06rem (16.96px)** | +11.6% |

All four inside the brief's 10–15% band and moved **together**, so the heading/body relationship is
unchanged and the two lists — which read as siblings — do not end up at two different body sizes.

**Measured at 1440px:** "What it does" is still **two** columns and "Getting going" still **three**. No
awkward wrap at 390px; one heading wraps to two lines there, which it did before.

---

## ✅ 6 · CHECKS

| | |
|---|---|
| **browser assertions** | **79 · all passing** at 390 and 1440, plus scroll checks at 360/768/940/1728 |
| no horizontal page scroll | ✓ at 360, 390, 768, 940, 1440, 1728 |
| no hero frame clipped by the hero's edge | ✓ at every width |
| `npx tsc --noEmit` | **clean** |
| `npx eslint` on the touched files | **0 errors, 0 warnings** |
| `npx next build` | **✓ Compiled successfully** |
| `findPlanParityViolations()` | **0** |
| `lib/landing-table.ts`, `lib/features.ts` | **unchanged** (`git diff --quiet`) |
| `lib/plan-features.ts` | **changed, but not by this workstream** — see `docs/landing-trim-2-report.md` §0 |

### LCP and weight

| | before | after this workstream |
|---|---|---|
| LCP element, 390 / 1440 | `h1` / `h1` | `h1` / `h1` — **unchanged** |
| LCP time, 390 / 1440 | 56ms / 60ms | 60ms / 60ms — **not worse** (within run-to-run noise) |
| landing transferred | 588.5 KB | 588.5 KB at this point; **571.4 KB** after the later hero passes |

### lucide-react's added size

**5.0 KB raw / 2.9 KB gzipped**, as the six icon modules plus `createLucideIcon` on disk:

```
clock 549B · gauge 552B · monitor-smartphone 769B · image 670B
message-circle 671B · wifi-off 898B · createLucideIcon 961B
```

⚠️ **That is the source-module size, not a measured route delta.** This Next version prints no per-route
byte column, and the landing's total moved by −17.1 KB across the same period for a different reason —
the hero images got smaller. I could not cleanly separate the two from the totals, so the honest figure
is the one above, labelled as what it is.

### Two assertions that failed on correct code, and were my error

1. ⚠️ **`borderStyle` reads `solid` on an element with no border** — Tailwind's preflight sets
   `*, ::before, ::after { border-width: 0; border-style: solid }`. `borderTopWidth` is what decides it.
2. ⚠️ **A button's line count is not `height / line-height`** — 15.2px of padding top and bottom plus a
   1px border makes that ratio read 2 on a single-line button.

---

## 📸 7 · SCREENSHOTS

`docs/landing-polish-shots/before/` and `docs/landing-polish-shots/after/`, DPR 2:

```
hero-390.png            hero-1440.png
what-it-does-390.png    what-it-does-1440.png
pricing-390.png         pricing-1440.png
```

⚠️ **The `after/` set shows this workstream's hero**, which two later briefs replaced. The current hero
is in `docs/landing-polish-shots/hero-fan-sizing/`.

---

## ⚠️ 8 · WHAT I COULD NOT VERIFY

1. ⚠️ **lucide's own route-bundle delta** — §6.
2. ⚠️ **Real devices and Safari.** Everything here is headless Chromium.
3. ⚠️ **LCP on a real network.** These are localhost numbers, 56–64ms; the *element* is the honest part
   of that comparison, the *time* is not representative of a visitor's.
4. ⚠️ **No visual-regression baseline existed**, so "the other five tiles are unchanged" rests on the
   diff touching one `does-item` and on the tile count, not on a pixel comparison.
