# Landing page — trust strip and feature block alignment

**One file changed: `app/landing/landing.css`.** No JSX touched, no copy touched, no component touched.
**The change is a single CSS declaration: `text-align: center` on `.hg-landing .trust-in li`.**

🔴 **CHANGE B WAS APPLIED AND THEN REVERTED ON YOUR INSTRUCTION MID-TASK** — "move the headings in what it
does section back to the left the way it was before". **The "what it does" section is now byte-identical to
its pre-task state**, verified by execution (§Phase 3B). Only the trust strip is changed. Phase 1's
read-only findings for the feature block are retained below because they were asked for and remain true.

🔴 **NOTHING IN THIS REPORT IS OBSERVED.** The page was not rendered. Every visual statement is
**READ-FROM-SOURCE** and the behaviour is **unobserved**.

---

# Phase 1 — read only

## 1 · Where the two blocks live

Located by searching the literal copy, not by guessing component names.

| Block | File | Identifier to anchor on |
|---|---|---|
| Trust strip | `app/landing/page.tsx` | `<ul className="trust-in wrap">`, inside `<div className="trust-strip">`; copy `First month 100% free, everything unlocked` |
| Feature block | `app/landing/page.tsx` | `<div className="does">` containing six `<div className="does-item">`; copy `Kill the queue` |

Both are rendered inline by the **default export of `app/landing/page.tsx`** — there is no separate
component for either. The styling lives in `app/landing/landing.css`, a scoped stylesheet where every
selector is prefixed `.hg-landing`.

### ⚠️ THE TRUST-STRIP COPY APPEARS TWICE, IN TWO DIFFERENT BLOCKS

```
app/landing/page.tsx:179:          <li><Check /> First month 100% free, everything unlocked</li>
app/landing/page.tsx:472:            <li><Check /> First month 100% free, everything unlocked</li>
```

- **`:178` — `<ul className="trust-in wrap">`** inside `.trust-strip`. This is *the trust strip*: the
  band under the hero, and the block the report describes.
- **`:471` — `<ul className="proof">`** inside the final "Want to see how easy setup is?" section. **Same
  three strings, different class, different block.** See §9 — it carries the same latent defect and was
  **not** changed, because it is not one of the two blocks named in the brief.

## 2 · Same file? Shared wrapper?

**Same file: yes.** **Shared alignment-carrying wrapper: no.**

Both sit under `.wrap`, but `.wrap` carries no alignment at all:

```css
.hg-landing .wrap { max-width: var(--max); margin: 0 auto; padding-inline: var(--gut); }
```

`max-width`, `margin`, `padding-inline` — no `text-align`, no `align-items`, no `justify-*`. The two
blocks' alignment comes from their own rules (`.trust-in` / `.does-item`), which do not overlap. **They
can be changed independently, so the Phase 2 stop condition does not apply.**

## 3 · The JSX, quoted

**Trust strip — the whole block, and one representative item:**

```jsx
      <div className="trust-strip">
        <ul className="trust-in wrap">
          <li><Check /> First month 100% free, everything unlocked</li>
          <li><Check /> No card needed</li>
          <li><Check /> Cancel anytime, no contract</li>
        </ul>
      </div>
```

⚠️ **The `<li>` carries NO className, and neither does the text.** The text is a **bare text node** — an
anonymous flex item — sitting beside the `<Check />` marker. There is nothing on the row, the marker or
the text node to quote beyond what is above; all styling is by element selector in the stylesheet:

```css
.hg-landing .trust-in { list-style: none; display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem 2.8rem; padding-block: 1.1rem; }
.hg-landing .trust-in li { display: flex; align-items: flex-start; gap: .6rem; font-family: var(--display); font-weight: 700; font-size: .98rem; color: var(--head); letter-spacing: -.01em; }
/* Mobile: stack, each bullet centred on its own line (tick + text as one centred unit). */
@media(max-width:720px){
  .hg-landing .trust-in { flex-direction: column; align-items: center; gap: .8rem; }
}
```

**Feature block — one representative item:**

```jsx
            <div className="does-item"><h3>Kill the queue</h3><p>Customers order ahead and pick a collection time. No shouting over the fryer.</p></div>
```

```css
.hg-landing .does { display: grid; gap: 1.5rem 2.6rem; grid-template-columns: 1fr; }
@media(min-width:760px){ .hg-landing .does { grid-template-columns: 1fr 1fr; } }
.hg-landing .does-item { padding-top: 1.05rem; border-top: 2px solid var(--head); }
.hg-landing .does-item h3 { font-family: var(--display); font-weight: 700; font-size: 1.05rem; color: var(--head); letter-spacing: -.015em; margin-bottom: .25rem; }
.hg-landing .does-item p { color: var(--ink-soft); font-size: .94rem; }
```

**Neither `h3` nor `p` carries a `text-align`** — both inherit `start`.

## 4 · 🔴 Which route renders this — `/` and `/landing` are NOT the same page

**`/` does NOT render this page.** `app/page.tsx` is the **Village Foodie discovery map** — a client
component importing `EventListCard`, `useVillageData`, postcode/distance helpers. Different product,
different file, no import of the landing page.

**Two routes render `app/landing/page.tsx`, and they are the same module:**

| Route | How | noindex? | Gate |
|---|---|---|---|
| `/landing` | the page itself | ✅ **Yes** — `robots: { index: false, follow: false }` in its `metadata` | **Admin-only in production.** `app/landing/layout.tsx` redirects any non-admin to `/` server-side. |
| `/1ng7n4p5omux2gdk9kqvwz` | `export { default, metadata } from '../landing/page'` | ✅ **Yes — the same `metadata` object**, re-exported, so it cannot drift | **None.** Unlisted, deliberately ungated so a reviewer's link opens on the first tap. |

```js
export { default, metadata } from '../landing/page'
```

⚠️ **So the phone that reported this was almost certainly on the unlisted path**, not `/landing` —
`/landing` would have redirected a non-admin to `/`. **Both routes get the fix, because both are the same
module and the same stylesheet.**

## 5 · The dashed placeholder boxes — report only, not changed

**Same file**, `app/landing/page.tsx`, in the hero's `<div className="fan">`:

```jsx
            <div className="shot shot-kds"><span className="lbl">Screenshot</span><span className="hint">Kitchen screen — tickets in cook order</span></div>
            <div className="shot shot-dash"><span className="lbl">Screenshot</span><span className="hint">Orders dashboard — realistic orders, capacity strip visible</span></div>
            <div className="shot shot-phone"><span className="lbl">Screenshot</span><span className="hint">Customer ordering</span></div>
```

⚠️ **The literal strings differ slightly from the brief.** The brief quotes `SCREENSHOT - Orders
dashboard` and `SCREENSHOT - Customer ordering`; the source has `Screenshot` in a `.lbl` span with the
description in a separate `.hint` span (`Orders dashboard — realistic orders, capacity strip visible`).
Same boxes, and the uppercase is presumably a CSS `text-transform`. **Not changed. Not touched.** There
are three, not two — the Kitchen screen box is the third.

## 6 · 🔴 Diagnosis of the trust-strip mechanism — definite

**The two centrings in play centre different things, and only one of them is present.**

```css
@media(max-width:720px){
  .hg-landing .trust-in { flex-direction: column; align-items: center; gap: .8rem; }
}
```

On mobile `.trust-in` becomes a **column flex container** with `align-items: center`. In a column flex
container the cross axis is horizontal, so `align-items: center` **centres each `<li>` BOX horizontally**.
A flex item's cross size is content-based unless stretched, so:

- **Item whose text fits on one line** — the `<li>` box shrink-to-fits its content (tick + gap + text).
  A box that hugs its text, centred in the column, is **visually indistinguishable from centred text**.
  The absence of a `text-align` is invisible.
- **Item whose text wraps** — the box can no longer hug the text; it grows toward the width the column
  allows. The text is a **bare text node**, i.e. an anonymous flex item, and with no `text-align`
  anywhere on `.trust-in`, on `.trust-in li`, or on the inherited chain (`.wrap` carries none), it falls
  back to the initial value **`start`**. Line two therefore begins at the left edge of the text box while
  the one-line neighbours still *appear* centred.

**The class responsible:** `.hg-landing .trust-in li` — specifically its **absence of `text-align`**.
The centring that was doing all the visible work is `align-items: center` on `.hg-landing .trust-in`
inside `@media(max-width:720px)`, and it only ever centred the box.

**This is a definite answer, not a plausible one**, and it explains the platform split in the report: it
depends purely on whether the first item wraps, which depends on viewport width and font metrics. At
~380px Android it wraps; on a wider iPhone viewport, or on a laptop where the row is horizontal, it does
not. ⚠️ Still **READ-FROM-SOURCE** — I did not measure the wrap point on any device.

⚠️ **`align-items: flex-start` on the `<li>` is NOT the cause and was not changed.** It is a cross-axis
rule inside the row-direction `<li>`, keeping the tick level with the first line when the text runs to two
lines. Removing it would drop the tick to the vertical centre of a two-line block — a spacing change the
brief forbids.

---

# Phase 2 — stop conditions

| Condition | Result |
|---|---|
| Blocks share a wrapper whose alignment drives both | ❌ **No.** `.wrap` carries only `max-width`/`margin`/`padding-inline` (§2). Independent. |
| Mobile alignment cannot change without altering the laptop side-by-side | ❌ **No.** The side-by-side is `@media(min-width:760px)`; the change is gated `@media(max-width:759px)` — the two cannot both match. |
| Instructions contradict each other | ❌ **No.** |
| Garbled span | ❌ **None.** |

**Proceeded.**

---

# Phase 3 — the changes

## A · Trust strip

```css
.hg-landing .trust-in li { display: flex; align-items: flex-start; gap: .6rem; text-align: center; font-family: var(--display); … }
```

**One declaration inserted. Verified by execution:**

```
  declarations before: 8  after: 9  added: ['text-align: center']  removed: []
  after minus the inserted declaration == before : True
```

**Ungated by breakpoint**, because the brief requires the text to stay centred when it wraps **at any
viewport width**. It is **inert wherever the text does not wrap** — `text-align` has no observable effect
on a single line whose box hugs it.

⚠️ **STATED PRECISELY, NOT GLOSSED:** this does change the *computed style* of `.trust-in li` above 720px
from `start` to `center`. It changes the *rendering* above 720px **only if an item wraps there**, and if
one does, centring it is the requested behaviour. So the desktop trust strip is **rendering-identical
while nothing wraps, and behaviour-identical to the brief's intent when something does** — it is not
"byte-identical", and I am not claiming it is.

## B · Feature block — 🔴 APPLIED, THEN REVERTED ON REQUEST

This was applied as:

```css
@media(max-width:759px){
  .hg-landing .does-item h3 { text-align: center; }
  .hg-landing .does-item p  { text-align: left; }
}
```

**gated at `max-width: 759px`** — the exact complement of the block's own
`@media(min-width:760px){ .hg-landing .does { grid-template-columns: 1fr 1fr; } }`, so the two queries were
mutually exclusive by construction and the side-by-side layout could not be reached. (Not 720px, the trust
strip's breakpoint: that would have left 720–759px single-column but unstyled — a band that is neither.)

**You then asked mid-task for the headings to go back to the left, so the whole block was removed.**

### The revert is complete, verified by execution

```
WHAT-IT-DOES SECTION byte-identical to before: True
any max-width:759px left: False
media queries in file identical to before: True

does-item h3/p rules now:
    .hg-landing .does-item h3 { font-family: var(--display); font-weight: 700; font-size: 1.05rem; color: var(--head); letter-spacing: -.015em; margin-bottom: .25rem; }
    .hg-landing .does-item p { color: var(--ink-soft); font-size: .94rem; }
```

The whole `/* ---------- what it does ---------- */` section, compared character by character against a
pre-task copy of the file, is **identical** — no leftover rule, no leftover media query, no stray
whitespace. The set of media queries in the file is back to exactly what it was. **The feature-block
headings inherit `start` again, as before.**

⚠️ **Nothing about the feature block is now changed by this task**, so the Phase 3B/Phase 4 questions about
its breakpoint are moot in the shipped diff. The reasoning is kept above because it records what was tried
and why, not because it is live.

## What was not changed

No copy. No spacing, colours, icons or order. No JSX. The feature block (reverted), the `.proof` list
(§9), the placeholder screenshot boxes, `align-items: flex-start`, and every other component: untouched.

---

# Phase 4 — verification and honesty

## 🔴 Every visual claim is READ-FROM-SOURCE and unobserved

The page was **not rendered**. `next dev` and `next build` were not run, no browser was opened, no device
was used. **I cannot and do not claim either block "looks correct".** What follows is CSS reasoning over
quoted rules.

## The 320px case — do all three items wrapping still hold?

**READ-FROM-SOURCE reasoning.** At 320px the column is ~320px minus `--gut` padding on each side. All
three strings may wrap; the shortest, `No card needed`, is the least likely.

- `.trust-in` stays `flex-direction: column; align-items: center`, so **each `<li>` box is still centred**.
- Each `<li>` is a row flex container: `<Check />` then the anonymous text item. The text item takes the
  remaining width and wraps within it.
- `text-align: center` now applies to the `<li>`, and is **inherited by the anonymous text item**, so its
  lines centre inside their own box.

**When all three wrap:** all three boxes grow to about the same available width, so their left edges
align and each text block is centred within its own box. **They should read as aligned with one another —
which is the reported failure mode's opposite.** ✅ The change holds in that case; it is in fact the case
it most clearly improves, because with all three wrapping the old behaviour would have left all three
ragged.

⚠️ **ONE HONEST LIMIT ON WHAT "CENTRED" MEANS HERE.** The tick is a **sibling** of the text, not part of
it, and `align-items: flex-start` keeps it on line one. So the centred thing is the **text block to the
right of the tick**, not the tick-plus-text unit. On a wrapped item the tick sits left of a centred
paragraph. That is inherent to the existing markup — the tick is `<Check />` outside the text node — and
changing it would mean restructuring the row, which the brief forbids. **If the desired look is
tick-and-text centred together as one unit, this change does not deliver that and a markup change would
be needed.**

## Desktop side-by-side: established how

**By comparing the file against a pre-task copy, programmatically — and after the revert the answer is
stronger than "unchanged behaviour":**

```
WHAT-IT-DOES SECTION byte-identical to before: True
media queries in file identical to before: True
NON-COMMENT changed lines in the whole file: 1 rule
    -.hg-landing .trust-in li { … gap: .6rem; font-family: … }
    +.hg-landing .trust-in li { … gap: .6rem; text-align: center; font-family: … }
```

1. **The entire `.does` section is byte-identical**, so the laptop side-by-side layout is not merely
   behaviourally unchanged — **the bytes that produce it were never left modified.**
2. **No media query was added or removed**; the file's query set matches the pre-task set exactly.
3. The only rule that differs anywhere in the stylesheet is `.hg-landing .trust-in li`, and it differs by
   exactly one inserted declaration.

⚠️ **The trust strip is the exception and is stated separately above:** its one declaration is ungated by
design, per the brief's "at any viewport width".

## Summary of claim status

| Claim | Status |
|---|---|
| One declaration added, on `.trust-in li`, and nothing else | ✅ **Verified by execution** (file compared against a pre-task copy) |
| The whole "what it does" section is byte-identical to before | ✅ **Verified by execution** (revert complete) |
| No media query added or removed | ✅ **Verified by execution** |
| The two blocks share no alignment-carrying wrapper | ✅ Verified by reading `.wrap` |
| The trust strip will now centre wrapped text | ⚠️ **READ-FROM-SOURCE, unobserved** |
| Feature headings return to left-aligned | ✅ **Verified by execution** — the section is byte-identical to its pre-task state |
| The 380px Android rendering is fixed | 🔴 **NOT CLAIMED.** Never rendered. |

---

# 9 · ⚠️ Reported, not changed: the second list has the same defect

`app/landing/page.tsx:471`, in the final CTA section:

```jsx
          <ul className="proof">
            <li><Check /> First month 100% free, everything unlocked</li>
            <li><Check /> No card needed</li>
            <li><Check /> Cancel anytime, no contract</li>
          </ul>
```

```css
.hg-landing .proof { list-style: none; display: grid; gap: .6rem; }
.hg-landing .proof li { display: flex; align-items: center; gap: .6rem; … }
.hg-landing .final .proof { justify-items: center; margin-top: 1.2rem; }
```

**Identical mechanism:** `justify-items: center` centres each grid item's **box**; `.proof li` has **no
`text-align`**, so a wrapping item's second line falls back to `start`. At ~380px the same first string
would wrap and the same misalignment would appear.

🔴 **NOT CHANGED, DELIBERATELY.** It is a different block with a different class in a different section,
and the brief's scope is "these two blocks and nothing else". **Say the word and it is a one-line
addition** (`text-align: center` on `.hg-landing .proof li`).

⚠️ Note `.proof li` uses `align-items: center`, not `flex-start`, so a wrapped item there would also
centre its tick vertically against the two-line block — a slightly different look from the trust strip.

---

# Phase 5 — integrity census

## Byte-level NUL / control-byte scan — separate pass, after writing, byte tool, never grep

Python `open(path, 'rb')` with integer comparison. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`,
`0x0E–0x1F`, `0x7F`.

| File | | Bytes | NUL | Other flagged | **Total flagged** | TAB / LF / CR |
|---|---|---|---|---|---|---|
| `app/landing/landing.css` | before | 33198 | 0 | 0 | **0** | 0 / 374 / 0 |
| `app/landing/landing.css` | after (post-revert) | 34106 | 0 | 0 | **0** | 0 / 383 / 0 |
| `docs/landing-alignment-report.md` | after | *(see chat)* | 0 | 0 | **0** | 0 / LF only / 0 |

**Non-ASCII class census on the stylesheet, before → after: 11 classes → 11 classes, and the ONLY count
that moved is `U+2014 EM DASH 40 → 42`.** No class added, none removed, no emoji introduced — which
matches the claim below that everything added is ASCII plus two em dashes in one comment.

**Zero NUL bytes and zero other flagged control bytes in every pass.** No sanitisation needed or
performed.

## Non-ASCII census of characters introduced

Into `app/landing/landing.css`, after the revert — **all inside the one CSS comment**, none in any
selector or value:

| Char | Count added | Name |
|---|---|---|
| U+2014 | 2 | EM DASH |

**No non-ASCII character was introduced into any CSS selector, property or value** — the single rule added
is pure ASCII (`text-align: center`).

## Carrier-aware variation-selector check — per base, bare vs paired

Counts for the report file are in the chat reply. For `app/landing/landing.css`, per emoji-presentation
base, counting occurrences **followed by U+FE0F** against bare ones:

**After the revert, `app/landing/landing.css` contains no emoji-presentation base characters at all in the
lines this task added** — the surviving comment is em dashes and ASCII only. The file's pre-existing emoji
were not touched. Per-base counts for the report file are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes the file, which changes the number. The digit-stable figure, and the one that matters, is
the flagged count: **zero**.

## `git status --porcelain`

Printed in the chat reply.

| Entry | Pre-existed this task? |
|---|---|
| `M docs/reference-manual.md` | ✅ **YES** — the V11.29 update, uncommitted. Not touched here. |
| `M app/dashboard/[token]/kds/page.tsx` | ✅ **YES** — the KDS header swap from the previous turn. Not touched here. |
| `?? docs/kds-header-screen-on-swap-report.md` | ✅ **YES** — that task's report. |
| `M app/landing/landing.css` | ❌ No — **this task's only code change.** |
| `?? docs/landing-alignment-report.md` | ❌ No — this report. |

Nothing was committed, staged, reverted, stashed or cleaned. **No `git stash`, `git checkout` or
`git restore`.**
