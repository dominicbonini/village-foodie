# features-followups — three fixes from the features-page-restore report

**Date:** 20 October 2026 · **Branch:** main (on top of `4633801c`, with features-page-restore; uncommitted; nothing pushed or deployed)

**Summary.**
- **1 · Billing at phone width: fixed.**
  - The plan table's name column now has a floor, so it can't collapse.
  - Manage › Billing at 375px goes from **0px** row names (one letter per line, 14,765px tall) to a 104px name column
    (3,375px tall), GB and US.
  - At 1440 the grid is identical (534 / 152 / 152 / 152px); GB is pixel-identical, and US differs only by the
    screenshot noise that two captures of the same tree also show.
  - /features is pixel-identical at 1440 and 375.
- **2 · Footer store badges: nothing was removed, so nothing changed.**
  - My last report was wrong. Both badges are on /uk/features, /uk and /us/features.
  - They are lazy-loaded (seo-fixes), and my full-page screenshots were taken without scrolling, so the images hadn't
    loaded.
  - That report is corrected in place.
- **3 · Date flake: fixed.**
  - `demo-rebuild-replace` now runs its whole process at its own fixed "now", so its event dates can never land on the
    real date.
  - It passes 36/36 unpinned, and pinned to 2026-10-19, to today (2026-10-20), to 2026-10-14 and to 2026-10-01.
  - A deliberate collision still fails it.
- **Checks:** tsc clean, build passes, no new lint errors. **Full sweep: 145 of 145 harnesses pass**;
  `event-types-render` did not flake this time.

---

## 1 · Billing at phone width

**The cause** (as reported in `features-page-restore-report.md` §6):
- the default (`card`) `PlanTable` columns were `minmax(0,1fr) repeat(3, minmax(4.4rem, 9.5rem))`;
- the grid grows the plan columns towards 9.5rem **before** the flexible name column gets any space;
- in Manage's 343px content box at 375px the name column came out at **0px**, and with `overflow-wrap: anywhere` every
  row name and group heading broke one letter per line.

**Confirmed on Billing itself, before the fix,** in the real Billing tab render (below):

| | name column | table height | page height |
|---|---|---|---|
| GB, 375 | **0px** | 13,960px | 14,765px |
| US, 375 | **0px** | 13,941px | 14,746px |

**The fix:**
- `components/pricing/PlanTable.tsx:68` (card variant only) is now
  `minmax(6.5rem,1fr) repeat(3, minmax(4rem, 9.5rem))`;
- in `components/pricing/plan-table.css`, below 480px the plan header steps down a size (name 13px, price 11px) and its
  side padding halves (`.15rem`).

**Why these values** (each tried on the real Billing render at 320 / 360 / 375 / 390 / 414px):

| Option | Result |
|---|---|
| Your example `minmax(8rem, 2fr)` / `minmax(4.4rem, 1fr)` | Changes 1440: the name column falls from 534px to about 397px and the plan columns grow to about 198px |
| `minmax(8rem,1fr)` with plan columns `minmax(4.4rem, 9.5rem)` | 1440 identical, but at 375 "Unlimited" stuck out 6px past its 71px column, and at 320–360 the table was wider than the screen (horizontal scroll) |
| 6rem / 7rem floors with the smaller header | Fit, but 7rem scrolls at 320 and 6rem leaves the names narrower than needed |
| **6.5rem floor, 4rem plan minimum, 13px header below 480px** (chosen) | No horizontal scroll at any width from 320 up. No text outside its cell from 360 up; at 320, "Unlimited" sits 2px into its cell edge. The name column is 104px at 360 and 375 |

**Why 1440 is unchanged:**
- wherever the plan columns can reach 9.5rem (every tablet and desktop width), the floor never binds;
- the arithmetic gives the same widths, measured at 1440: `534px 152px 152px 152px`, before and after, GB and US;
- the 480px media rule doesn't apply there.

**How it was captured.** A real Manage page needs a truck's dashboard token, and I didn't pull one into the
transcript. So:
- the screenshots render **the real Billing tab** through the render kit (the pricing-pages §6 views, Pizza Kitchen on
  Pro, GB and US);
- they sit inside Manage's content frame (`px-4`, `pt-6`, `max-w-5xl` from 1400px), with Tailwind compiled from
  `app/globals.css` plus `plan-table.css`;
- headless Chrome took them at 375 and 1440.

**Proof** (`docs/features-followups/`):

| File | Shows |
|---|---|
| `billing-GB-375-side.png`, `billing-US-375-side.png` | before / after at 375. Before: letter-per-line names. After: names in a 104px column, plan columns 79px, "Unlimited" fits |
| `billing-GB-1440-before.png` / `-after.png` | **pixel-identical** |
| `billing-US-1440-before.png` / `-after.png` | 163 pixels differ, in the tick column area. **Two captures of the same after-tree differ by the same 163 pixels in the same box**, so this is capture noise (the drawn SVG ticks' anti-aliasing), not a change. The only difference in the rendered HTML is the `--pt-cols` value, and the computed columns are equal |

**No horizontal scroll:**
- `scrollWidth` equals the viewport at 320, 360, 375, 390 and 414 (GB and US), and at 1440;
- `pricing-pages` §11's 375px check on Billing ("no horizontal scroll") still passes.

**/features is unchanged.** Its `features` variant keeps its own columns (`var(--cmp-col)`), and its header rules in
`app/landing/landing.css` (three classes) beat the new two-class phone rule. A production build of /uk/features at 1440
and 375 is **pixel-identical** to the features-page-restore capture (3160px and 7835px tall).

## 2 · Footer store badges

**What I found: nothing was removed.**

- `components/landing/LandingFooter.tsx:128` renders `<StoreBadges className="foot-apps" linkClassName="foot-badge"
  countryCode={country?.current.code} />` on every marketing page that uses the footer, /features included.
- `components/StoreBadges.tsx` renders both badges whenever their URLs are set, and they are (`lib/app-badges.ts`).
- **The live HTML has both badges** on /uk/features, /uk and /us/features (curl, 20 Oct), with the storefront links
  seo-fixes set:
  - /uk → `https://apps.apple.com/gb/app/hatchgrab/id6803543106`;
  - /us → `https://apps.apple.com/app/id6803543106`;
  - Google Play on both.
- **They are `loading="lazy"`** (seo-fixes S7, `components/StoreBadges.tsx`), on purpose: they sit at the bottom of the
  page, and lazy loading stops them competing with the hero image.
  - Headless Chrome with no scrolling: both images `naturalWidth 0` (not yet loaded).
  - After scrolling to the footer: App Store 120px and Google Play 300px, both loaded.
  - Screenshot: `docs/features-followups/features-footer-badges-1440.png`.

**So the "missing badges" in `features-page-restore-report.md` §9 came from my capture,** a full-page screenshot that
never scrolled the footer into view, not from the site.
- Nothing changed in code.
- That report's line is struck and corrected in place.

## 3 · `demo-rebuild-replace`'s date flake

**The cause:**
- the harness hands `provisionDemo` a fixed `now` (2026-10-14 10:00Z);
- the demo event's **date** comes from `demoEventWindow` (`lib/provision-demo-event.ts:87`, `getLocalDateInTz(tz)`),
  which reads the **clock**, not `now`;
- so on the real 20 October the new demo event landed on 2026-10-20, the date of the fixture's "another date" event
  `ev-old-b`;
- the return-visit path then cleared it as "the same date", and §5 "an event on ANOTHER date is kept" failed. It would
  fail on any real date equal to a fixture date.

**The fix** (`scripts/demo-rebuild-replace.cjs`, marked `⚠️ RE-PINNED (features-followups, 20 October 2026)`):
- one line, `kit.setNow(NOW.toISOString())`, which pins the render kit's process clock to the harness's own `NOW`;
- the new event is then 2026-10-14 on any day the harness runs, and can never collide with `ev-old-a` (10-01) or
  `ev-old-b` (10-20);
- no fixture dates changed, and no check was loosened.

**Proof** (real date 2026-10-20):

| Run | Result |
|---|---|
| no clock pin | 36 passed, 0 failed |
| pinned to 2026-10-19 (`node -r <scratchpad>/ffu/clock-pin.cjs`, `PIN_DATE`) | 36 / 0 |
| pinned to **today**, 2026-10-20 | 36 / 0 |
| pinned to 2026-10-14 (the harness's own date) and 2026-10-01 (a fixture date) | 36 / 0 each |
| **Control:** a throwaway copy with `ev-old-b` moved onto 2026-10-14 (a real collision) | **35 / 1**: the check still fails when the dates really collide. The copy was deleted |

⚠️ **For you, not changed (product code, out of scope):** `demoEventWindow(now, tz)` takes its start and end **times**
from `now` but its **date** from the real clock.
- In production every caller's `now` is the current time, so they agree.
- But a caller passing any other `now` gets a date and a time from different instants.
- **The one-line fix** would be `localDateOfInstant(now, tz)` (`lib/time-utils.ts:215`) in place of
  `getLocalDateInTz(tz)`, if you want it.

## 4 · What was executed

- **The Billing render:** before and after captures at 375 and 1440, GB and US (scratchpad `ffu/billcap.cjs`).
  - an overflow probe at 320 / 360 / 375 / 414;
  - five column options tried by injected CSS before choosing (`ffu/try.cjs`);
  - a pixel comparison, plus a same-tree double capture to measure the noise.
- **/features:** `next build` + `next start` on :3100 and full-page captures at 1440 and 375, pixel-compared with the
  features-page-restore capture: identical.
- **Store badges:** curl of the live pages, and headless Chrome before and after scrolling to the footer.
- **The date flake:** unpinned, pinned to four dates, and the collision control.
- **tsc:** `tsc --noEmit`, exit 0.
- **Build:** `next build` passes.
- **Lint:** `components/pricing/PlanTable.tsx`, 0 errors and 0 warnings. The CSS change is checked by the strict
  postcss parse in `seo-fixes` and `pricing-pages`.
- **Full sweep (`node scripts/run-harnesses.cjs`): 145 of 145 harnesses pass**, "✅ every listed harness passed".
  - `demo-rebuild-replace` passes in the sweep with no clock pin.
  - **`event-types-render` passed** (rc=0, 39.6s). It did not flake this time.
  - **No other re-pin was needed.** No harness pins Billing's `--pt-cols` string or its phone header size, and
    `pricing-pages` (145/145) still checks Billing's markup, its highlight and its 375px scroll width.

## 5 · Files

- `components/pricing/PlanTable.tsx`: the card variant's `--pt-cols`.
- `components/pricing/plan-table.css`: the `max-width: 479px` header rule.
- `scripts/demo-rebuild-replace.cjs`: the clock pin.
- `docs/features-page-restore-report.md`: §9's badge line corrected.
- `docs/features-followups/`: the screenshots.

**Still parked:** europe-readiness, waiting for your answer on where the SQL queries should go (report or chat).
