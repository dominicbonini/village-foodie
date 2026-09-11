# Mobile hero typography — build report

Mobile only (below 640px) and hero only. Desktop, tablet, the grey trust band, /compare and the contact
page are untouched — proved below, not assumed. Nothing was installed, no dev server and no build was
run, nothing was deployed. `--ink-soft` still reads `#5F7A99`, and the whole `:root` token block is
byte-identical to before.

---

## 🔴 ONE THING IN THE BRIEF DOES NOT MATCH THE PAGE — FLAGGED, NOT SILENTLY RESOLVED

> "The line break must stay the same: line 1 ends with 'built', line 2 is 'for food trucks.' at 360, 375,
> 390 and 414px."

**At all four of those widths the H1 does not break there today.** 🧪 Measured, before any edit:

```
360px   L1 "The ordering system"        L2 "built for food trucks."
375px   L1 "The ordering system"        L2 "built for food trucks."
390px   L1 "The ordering system"        L2 "built for food trucks."
414px   L1 "The ordering system"        L2 "built for food trucks."
```

"The ordering system" is 308.3px and the text column at a 360px viewport is 320px — adding "built"
(~80px) cannot fit at any of the four. The break the brief describes is the one that appears from about
480px upward, which is a large phone in landscape or a small tablet, not the widths named.

I did not treat this as a contradiction to stop on, because both readings of the instruction agree on the
same requirement: **the break must not move.** So I held it exactly where it is at all four widths, and
that is what the measurements below prove. If you actually want line 1 to end with "built" at 390px, that
is a different change (the H1 would have to shrink or the copy carry its own `<br />`) and I have not
made it. No other span of the brief arrived garbled.

---

# PART ONE — PLAIN ENGLISH

**The heading breathes.** Its letters were pulled together by 0.96px each; that is now 0.48px, exactly
half, which is the loosest setting the line break survives. The gap between the heading and the grey
supporting line goes from 9.6px to 16px, so they stop reading as one block.

**The supporting line is bigger and darker.** 15.2px → 16px, and the grey moves from the page's
`--ink-soft` (which measures 4.44:1 on white and actually misses the 4.5:1 accessibility floor) to
`#4A627F`, which measures **6.28:1**. It still reads as grey, not navy. "See a working demo in under 60
seconds." still holds on one line at 360, 375 and 390px, and still wraps at 320px, as agreed.

**The two ticks under the button are gone.** In their place, one plain centred sentence: *No signup or
account needed.* 13px, the same darker grey, no icon, no orange. It sits in the same slot in the same
flex row, so the gap below the button is unchanged to the pixel. The tick list's CSS and the small check
icon component were deleted, not hidden.

**One consequence you should know about.** The hero is 10.6px taller on a phone — 6.4px of it is the
bigger heading gap you asked for, the rest the larger supporting line and the slightly taller note. So
everything below the hero, the grey trust band included, sits 10.6px lower on mobile. The band itself is
unchanged: same size, same content, same styling, and byte-identical on tablet and desktop. The
screenshot fan still clears the fold on a 390×844 iPhone, its bottom moving from 640.8px to 651.4px.

---

# PART TWO — THE MEASUREMENTS

## Files changed

| file | change |
|---|---|
| `app/landing/landing.css` | six declaration changes, all under `.hero` selectors (listed below) |
| `app/landing/page.tsx` | the tick `<ul>` replaced by one `<p class="hero-note-sm">`; the `CheckSm` component deleted |

**The complete declaration-level diff** (comments stripped, so this is every rule that can affect a
pixel):

```
- .hg-landing .hero { padding: … }
+ .hg-landing .hero { --hero-grey: #4A627F; padding: … }            ← a token declaration; paints nothing itself
- .hg-landing .hero-sub-sm { … font-size: .95rem; … color: var(--ink-soft); … }
+ .hg-landing .hero-sub-sm { … font-size: 1rem;  … color: var(--hero-grey); … }
- .hg-landing .hero-ticks-sm { … }          (list, li and svg rules — all three deleted)
+ .hg-landing .hero-note-sm { display: none; … font-size: .8125rem; line-height: 1.35; color: var(--hero-grey); text-align: center; }
  @media(max-width:639px){
-   .hg-landing .hero-ticks-sm { display: flex; }
+   .hg-landing .hero-note-sm { display: block; }
-   .hg-landing .hero h1 { margin-bottom: .6rem; }
+   .hg-landing .hero h1 { margin-bottom: 1rem; letter-spacing: -.015em; }
  }
```

Every selector names `.hero` or a `hero-*` class. 🧪 grep over `app`, `components` and `lib` (no
extension filter) shows only `app/landing/page.tsx` renders any of them; the contact page's `<h1>` sits
inside `.hg-landing` but outside any `.hero`, which is why `.hero h1` and not `h1` is the selector.

## 1. H1 letter-spacing

| | value at 32px | line 1 ink width |
|---|---|---|
| before | `-.03em` = **-0.96px** (inherited from the base `.hg-landing h1` rule) | 308.3px |
| after | `-.015em` = **-0.48px** (mobile hero only) | 317.4px |

**The break is unchanged at every width named**, and the value I settled on is the full half, not a
reduced one — it did not need reducing:

| viewport | text column | line 1 | line 2 | slack on line 1 |
|---|---|---|---|---|
| 360px | 320px | The ordering system (317.4px) | built for food trucks. (306.8px) | **2.6px** |
| 375px | 335px | The ordering system | built for food trucks. | 17.6px |
| 390px | 350px | The ordering system | built for food trucks. | 32.6px |
| 414px | 374px | The ordering system | built for food trucks. | 56.6px |

⚠️ **2.6px at 360px is the whole margin**, and it is stated in the CSS as well as here. I tested
-.015em, -.018em, -.02em, -.022em and -.025em: all five hold the break, so the constraint did not bind
and the brief's "roughly half" was achievable in full. If you would rather trade some of the opening for
headroom, `-.02em` gives 314.4px and 5.6px of slack. The font, size (32px) and weight (800) are
untouched, and the base rule that /compare and the contact page use is untouched.

## 2. Heading → supporting line gap

🧪 Measured at 390px, top of the supporting line minus bottom of the H1: **9.6px before, 16.00px after.**
It is `margin-bottom` on the heading, so no new spacing mechanism was introduced. The gap between the
supporting line and the button is **17.59px before and 17.59px after** — unchanged, as instructed.

## 3. Supporting line

| | before | after |
|---|---|---|
| size | 15.2px (`.95rem`) | **16px** (`1rem`) |
| colour | `--ink-soft` #5F7A99 | **#4A627F** via a hero-scoped `--hero-grey` |
| contrast on white | **4.44:1** | **6.28:1** |
| family / weight | Public Sans 400 | unchanged |

The colour is new because nothing in `landing.css` sat in the 5.5–7:1 band: `--ink-faint` 2.26:1,
`--ink-soft` 4.44:1, then a jump to `--ink` 9.54:1 and `--head` 13.24:1. `--ink` was rejected for reading
as navy body copy. `#4A627F` is declared as `--hero-grey` **on the `.hg-landing .hero` rule**, not in the
shared token block, so nothing outside the hero can see it; a custom-property declaration paints nothing
by itself, which is why its presence leaves tablet and desktop byte-identical.

**Where line 2 breaks** ("See a working demo in under 60 seconds.", 307.5px at 16px, was 292.1px):

| viewport | column | result |
|---|---|---|
| 320px | 280px | wraps to two lines ("…under 60" / "seconds.") — the accepted outcome |
| 360px | 320px | **one line**, 12.5px spare |
| 375px | 335px | **one line** |
| 390px | 350px | **one line** |

It fits at 360px, so nothing was shrunk and there was nothing to stop for.

## 4. The line under the button

`<p className="hero-note-sm">No signup or account needed.</p>` — 13px (`.8125rem`), weight 400, `#4A627F`
(**6.28:1**), centred, no icon, no orange.

- 🧪 **One line at every width**: 179.0px against a 280px column at 320px, the narrowest case. It cannot
  wrap at any width this rule applies to.
- 🧪 **Gap below the button is identical**: 13.59px before (button → ticks) and 13.59px after (button →
  note). It is the `.hero-cta-row` flex gap, and the note occupies the same slot in that row, so the
  number could not drift.
- Mobile only, by the same mechanism as the tick list: `display: none` in the base rule, `display: block`
  only inside the `max-width: 639px` block.
- **Deleted, not left behind**: the `.hero-ticks-sm` list, `li` and `svg` rules, the media-block
  `display: flex` line, and the `CheckSm` component in `page.tsx` (🧪 grep over `app`, `components`, `lib`, `scripts` and
  `docs`, no extension filter: the only surviving mentions of `hero-ticks-sm` and `CheckSm` are two
  comment lines in `landing.css` recording what the new rule replaced — no rule and no code references
  either name). The media block's `.trust-strip` comment, which
  quoted the old tick copy, was updated to quote the new sentence.

## Desktop and tablet — confirmation

🧪 Before and after rendered side by side in the same browser, every hero element, the fan, the three
screenshots, the trust band, the header CTA, and the document height compared at each width:

| width | result |
|---|---|
| 640px | ✅ identical |
| 768px | ✅ identical |
| 1024px | ✅ identical |
| 1280px | ✅ identical |
| 1440px | ✅ identical |

The only entries that differ at those widths are the tick list (`display:none` before, absent after) and
the note (absent before, `display:none` after) — neither generates a box in either state, so the layout
is unchanged. Position, size, font size, letter-spacing, colour and margin of every other element match
exactly, document height included.

**The contact page's shape** — `.hg-landing` wrapper, an `<h1>` outside any `.hero`, the shared nav —
🧪 renders identically before and after at 320, 360, 390, 414, 639, 768 and 1280px. **/compare** renders
no element carrying a `hero` class at all (🧪 grep), and the base `.hg-landing h1` rule it does use was
not edited, so no changed declaration can match it.

**The grey trust band**: byte-identical at every width above 639px; on mobile its own box is unchanged
(390×135.7 at 390px, same three points, same styling) and it simply starts 10.6px lower because the hero
above it grew — the direct cost of the 16px heading gap you asked for.

---

# HOW I CHECKED

The page was rendered in a real browser at each width with the real Archivo and Public Sans files taken
from the app's own build output, and measured: computed styles, bounding boxes, and line breaks derived
by measuring each word's own rectangle and grouping by line. The before/after pages differ only in the
stylesheet and that one markup swap. `npx tsc --noEmit` exits **0**. `npx eslint app/landing/page.tsx`
reports **2 warnings before and 2 after** — `TablePlan` and `DETAIL_OVERRIDES`, both pre-existing and
unrelated; the baseline was measured by reconstructing the pre-edit file and linting it, and deleting the
`CheckSm` component is what kept the count from going to 3. No `next dev`, no `next build`, no deploy.

# UNSURE ABOUT, OR DEVIATED ON

1. **The stated H1 break does not match the page at the four named widths** — flagged at the top. I held
   the break where it is rather than moving it to match the description.
2. **2.6px of slack at 360px** on line 1 of the H1 after the change. It holds, and I settled on the full
   half as instructed, but the margin is thin enough that you should know the number; `-.02em` is the
   safer alternative if you want it.
3. **The deleted tick-list comment claimed `--ink-soft` is 4.61:1 on white. It is 4.44:1** — below the
   4.5:1 floor those 12px ticks needed. The claim died with the ticks; the replacement line is 6.28:1.
4. **Everything below the hero sits 10.6px lower on mobile.** Unavoidable given the 16px gap; the band
   and everything else are otherwise unchanged.
5. I did not add `#4A627F` to the shared token block, on the brief's instruction to keep it hero-scoped.
   If it later becomes the page's secondary grey, it should move there rather than being copied.
