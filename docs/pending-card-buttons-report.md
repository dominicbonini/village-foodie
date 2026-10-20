# Pending-card buttons on the chooser row — report

19 October 2026. Brief: "PENDING-CARD BUTTONS ON THE CHOOSER ROW (LAPTOP/TABLET) — SMALL LAYOUT FIX".
Nothing was committed, pushed or deployed. No stored data was changed, no SQL was run, and Pizzeria Gusto was not
touched: everything was measured on fixtures (Pizza Kitchen, GB and US).

**Result.**
- **The change:** from 640px up, a "Needs your approval" card's Approve / Edit / Reject sit on the Event type chips' row,
  right-aligned and centred on the chips. The row they used to have at the bottom is gone, so each card is **42px
  shorter** (64px with the "why Approve is off" line).
- **Unchanged:** phones (390px) are pixel-identical to BEFORE; "Needs confirmation" and confirmed cards are unchanged.
- **Checks:**
  - `tsc` is clean;
  - `next build` exits 0;
  - the full sweep runs 140 · passes 140 · fails 0, with only the named re-pins below;
  - the new harness `scripts/pending-card-buttons.cjs` passes 678 checks.

## Note on the brief (no contradiction, but one premise differs)

**"Needs confirmation" cards have no Approve / Edit / Reject row and no type chooser.** These are the operator-added
events (`renderEvent(e)` with `pending = false`). Their Confirm / Copy / Edit / Make post / Cancel are already compact
icons in the card's top row, and they have been since the 18 October phone-card fix.

So only "Needs your approval" cards change. I measured a "Needs confirmation" card anyway, as asked: its height is
unchanged at every width (table below).

## What changed

**`components/manage/EventTypes.tsx` — `EventTypeSelect`** gains two optional slots, `actions` and `actionsNote`.
- **When `actions` is passed:**
  - the chips and the buttons share one wrapping flex line (`sm:flex sm:flex-wrap sm:items-center sm:gap-x-3`), with the
    buttons pushed right (`sm:ml-auto`);
  - the summary line ("Your normal setup") and the note share the line below: the summary on the left, the note
    right-aligned under the buttons.
- **Every new class is `sm:`**, so below 640px these are plain blocks and the phone render is unchanged.
- **Without `actions`** (Add / Edit event) the markup is exactly what it was.
- **While the types are loading**, the control used to draw nothing. With `actions` it now draws the buttons alone, so
  the card is never without an Approve from 640px up.

**`app/manage/[token]/page.tsx` — `renderEvent`.**
- The three buttons are built once (`pendingButtons`) and placed twice:
  - in the chooser's `actions`, inside `max-sm:hidden`;
  - in the bottom row, which is now `mt-3 sm:hidden` wherever the chooser shows.
- Exactly one Approve is ever visible.
- The "why Approve is off" line (`manageSchedule.card.approveNeedsTimes`):
  - from 640px up, it goes in `actionsNote`, directly under the buttons and right-aligned;
  - on a phone it stays in the bottom row, as before.
- **A past pending card has no chooser,** so it keeps the bottom row at every width.

**Why two placements, not one.**
- On a phone the buttons must come after the warnings, but from 640px up they must sit inside the chooser, which is
  above the warnings. CSS cannot move one element between those two places.
- Before 16 October there was a desktop copy too. It sat in the card's MAIN row, beside the details, and squeezed them to
  nothing. This copy sits below the details, inside the chooser, so that cannot happen again; pending-card-render still
  measures that the details are never squeezed.

**Warnings stay where they were.** The private-times prompt and the guessed-location, no-location and conflict boxes are
unchanged, below the chooser.

**Confirmed and "Needs confirmation" cards:** not touched.

## Measurements (WebKit; GB and US; 390 / 640 / 800 / 1180 / 1280px)

**Page A** shows a normal pending card, a private one, one with a guessed-location warning, one with Approve off (no
times), a "Needs confirmation" card and a confirmed card. Its chips are Standard, Private, Festival and Wedding.

**Page B** is the wrap case: a normal pending card with ten chips.

Card height in px, BEFORE → AFTER. The figure is the card's content box. **GB and US are identical.**

| Card | 390 | 640 | 800 | 1180 | 1280 |
|---|---|---|---|---|---|
| Normal pending | 256 = | 208 → 166 | 208 → 166 | 208 → 166 | 208 → 166 |
| Private (panel open) | 493.7 = | 386 → 344 | 368.1 → 326.1 | 368.1 → 326.1 | 368.1 → 326.1 |
| Guessed-location warning | 411.5 = | 324.5 → 282.5 | 305 → 263 | 305 → 263 | 305 → 263 |
| Approve off (no times) | 294 = | 230 → 166 | 230 → 166 | 230 → 166 | 230 → 166 |
| Needs confirmation | 124 = | 108 = | 84 = | 84 = | 84 = |
| Confirmed | 124 = | 84 = | 84 = | 84 = | 84 = |
| Many types (wrap case) | 328 = | 244 → 236 | 244 → 236 | 208 → 200 | 208 → 200 |

Checked at every width, for every card:
- nothing overlaps (every pair of visible text and control boxes);
- nothing sticks out of the card, and nothing is clipped;
- the page never scrolls sideways.

From 640px up, on every pending card:
- one visible Approve / Edit / Reject group, inside the chooser and right-aligned with it (±1px), and no bottom row;
- side by side with the chips, the buttons are vertically centred on them (±1px) and to the right of every chip;
- when they can't fit, the buttons are wholly below the chips;
- the summary line is under the chips;
- the "why" line is ≤ 8px under the buttons and right-aligned with them (it measures 4px);
- every warning is below the chooser.

At 390px, all four pages' full screenshots (GB and US, A and B) are **byte-identical** to BEFORE (sha256). The HTML is
not byte-identical: it gains the hidden chips-row copy and plain wrapper divs. What renders is identical.

**The wrap case (page B).** The ten chips need more than the room beside the buttons, so the buttons drop under the chips,
right-aligned, and the summary line comes after them. The summary is still under the chips, but one line lower than on a
card whose chips fit.

**Screenshots** (gitignored), in `docs/us-polish/pending-card-buttons/`:
- `before-{GB,US}-{A,B}-{390,640,800,1180,1280}.png`;
- `after-…`, the same set.

## Re-pins (named; each marked "⚠️ RE-PINNED (pending-card buttons, 19 October 2026)")

| Harness | What it pinned | Now |
|---|---|---|
| `pending-card-render.cjs` | Approve after the chooser, the warning before Approve, at every width | Unchanged below 640px. From 640px, Approve is inside the chooser and the warning follows the chooser. |
| `_lp2-named.cjs` `pendingCardProof` (language-phase-2, 1d, 1d2; 98 views) | Exactly one Approve and one "why" sentence per card | Where the card has the chips-row group: exactly two Approves, one in each place, each with BEFORE's `disabled` / `title`. The group's words must equal the bottom row's buttons' words (proven), and the sentence appears once in each place. |
| `_midnight-manage.cjs` (midnight-events, the waiting cards) | The whole tab's markup = BEFORE + the US-layout changes | Plus a precise transform, `pending-card-buttons`. It wraps the chips in the row, copies the bottom row's own buttons markup into the `max-sm:hidden` group, adds the summary's `sm:` classes (and the note only where the bottom row has one), and makes the bottom row `mt-3 sm:hidden`. Each piece must be found exactly once per card. |
| `schedule-graphics-places.cjs` | The one action row's wrapper line, and no line of the page lost | The companion check reads the new wrapper and the `actions={…}` line. Two rewritten lines are excused, one each: the old wrapper, and the chooser's last prop line, which now continues. |
| `schedule-graphics-places.cjs` | — | us-layout-fix-3's old van line (replaced on 18 October by `vanName`) had been excused only because it shared a `git diff -U0` hunk with a message read. This batch's new lines moved the diff's alignment, so it is now named under us-layout-fix-3, with its new form checked. Not a change of this batch. |
| `private-events.cjs`, `event-types.cjs` | `if (!ready) return null` | That line, or the new `if (!ready) return actions ? <div>{actions}{actionsNote}</div> : null`. The point of the check (the field is never hidden for an empty type list) is unchanged. |

**New harness:** `scripts/pending-card-buttons.cjs`, registered after pending-card-render, with its BEFORE fixture
`scripts/fixtures/pending-card-buttons-before.json` (card heights and the 390px screenshot hashes). It needs the built CSS
(`npx next build`), as pending-card-render does.

## Proof

- `tsc --noEmit`: clean.
- `next build`: exit 0.
- **Full sweep:** **140 run · 140 passed · 0 failed** (139 before, plus the new harness).
- `pending-card-buttons.cjs`: 678 passed, 0 failed.
- `pending-card-render.cjs`: 276 passed.
- `midnight-events.cjs`: 372 passed.
- `schedule-graphics-places.cjs`: 270 passed.
- language-phase-2, 1d and 1d2: all pass, with the pending-card proof run on 98 views.

## Localhost check (Dominic)

Use Manage › Schedule on Pizza Kitchen, with a scraped event waiting for approval; never Pizzeria Gusto.

1. **Laptop width:** Approve / Edit / Reject sit at the right end of the "Event type" chips. Without times, Approve is
   grey and "Approve is off until…" sits right under the buttons.
2. **Narrow the window** below 640px: the full-width buttons are back at the bottom, after any warning.
3. **With many event types:** the buttons drop under the chips, right-aligned.

## Question for Dominic

In the wrap case, the summary line ("Your normal setup") comes after the dropped-down buttons. Is that fine, or should it
stay directly under the chips, with the buttons after it? That would mean the buttons wrap below the summary instead of
right under the chips.

## Not done / notes

- **Before/after screenshots** are for the fixtures only; no live truck was opened.
- **While the types load,** the buttons show on their own, so a slow types read never hides Approve. This was checked in
  code, not in the browser: the harness renders with the types already loaded.
