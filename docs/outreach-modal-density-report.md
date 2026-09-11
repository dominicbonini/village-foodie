# Outreach prospect modal — density pass

Scope kept to the prospect modal, desktop only. No schema change, no migration, no new route action,
no change to any existing write path. **No Instagram / Messenger / X / social column or field was added**
(0 lines mentioning them in this task's diff; the four that appear in `git diff` against `HEAD` are
pre-existing unstaged work from an earlier task — one of them is literally a
`🔴 NO Instagram or X COLUMNS ADDED` note).

Two things were built (1, 2). The third is numbers only, not built, as instructed.

---

## How the numbers below were produced

Claims are of two kinds and are labelled throughout:

- **Arithmetic** — derived from the CSS.
- **Measured** — real layout numbers from headless Chrome (Puppeteer 24.43.1), rendering the modal
  against **the project's own compiled Tailwind CSS**. The stylesheet was built by running
  `@tailwindcss/postcss` (Tailwind **4.3.1**) over `@import "tailwindcss"` plus the unlayered
  `!important` block copied **verbatim** out of `app/globals.css`, so the real cascade participates.

**Honest limits of the measurement.** The DOM was a transcription of the modal, not the running app —
I could not log into `/admin` headlessly. To stop the transcription drifting from the component, every
structural class string it used was asserted to appear **verbatim** in `OutreachPanel.tsx` before
measuring (10/10 matched). The synthetic history entries average 50.2px each; real `HistoryEntry` rows
will differ by a few px, which shifts the history numbers slightly but changes none of the conclusions.
The harness was deleted afterwards; the working tree contains only the component edit.

---

## 🧪 The `notes` count, re-derived

`outreach_prospects`: header count **231** = rows fetched **231** (no silent page truncation).

| | rows |
|---|---|
| `notes IS NOT NULL` | **0** |
| `notes` non-empty after trim | **0** |

**Empty on 231 of 231.** The brief was right: a full-height box was holding up a column to display nothing.

---

## (1) Notes shrunk — and an inert rule found on the way

```diff
-<label className="block flex-1 min-h-0 flex flex-col">
-  <textarea className={`${fieldCls} flex-1 min-h-[80px] resize-y`} …
+<label className="block flex-shrink-0">
+  <textarea rows={3} className={`${fieldCls} resize-y`} …
```

### 🔴 `text-sm` is inert on this textarea — the row arithmetic is 16px, not 14px

`app/globals.css` carries an **unlayered** iOS-zoom rule:

```css
@media (min-width: 640px) {
  input[type=…], select, textarea { font-size: inherit !important; }
}
```

Unlayered CSS outranks every layered Tailwind utility, so `text-sm` inside `fieldCls` **never applies to
any textarea, input or select in this app on desktop**. Nothing in the ancestor chain sets a font-size
(`body` sets none; no `html`/`:root` rule; the root layout adds only font *variables*), so the textarea
falls back to the browser default.

- **Measured:** `font-size: 16px`, `line-height: 22.8571px`.
- Why 22.86 and not 20: Tailwind v4 defines `--text-sm--line-height: calc(1.25 / 0.875)` — a **unitless
  ratio** (1.4286), not a rem length. A unitless line-height multiplies the *computed* font-size, so the
  forced 16px carries into the line box: 16 × 1.4286 = 22.857px.

**Height at `rows={3}` — arithmetic:** (3 × 22.857) + 12 padding (`py-1.5`) + 2 border = **82.57px**.
**Measured: 82.5px.** The two agree, so the sizing does take effect — the `!important` rule governs
`font-size` only and does not touch `rows`, `height` or `resize`.

`resize-y` is retained, so it still drags larger when there is something to write.

### The left column no longer stretches

`self-start max-h-full` replaces the implicit grid stretch, so the column ends at its content.
It keeps `min-h-0 overflow-y-auto` purely as a safety valve.

**Measured, left column height (empty notes):**

| | before | after |
|---|---|---|
| Notes textarea | 276.8px | **82.5px** |
| Left column | 453.8px | **265.5px** |

A 194px reduction, and the column now ends where its content ends.

---

## (2) Contact history moved above Log a contact

**Rendered order extracted from the source after the change** (JSX comments stripped first — on the
first pass my landmark scan matched the words "No contacts yet." inside a comment I had just written
and reported a false order; stripping comments fixes that):

1. `Contact history` heading
2. history scroll box
3. `No contacts yet.` / entries
4. `Log a contact` heading
5. four-control grid
6. message textarea `rows={8}`
7. `Log contact` button
8. `Follow up on`

Requested order — history, then Log a contact, then Follow up on. ✅

### The mechanism

History is **the only shrinkable item in the column**; every sibling is `flex-shrink-0`.

```
<p …flex-shrink-0>            Contact history
<div className="min-h-0 shrink overflow-y-auto …">   ← flex-grow:0, flex-shrink:1, flex-basis:auto
<p …flex-shrink-0>            Log a contact
<div …grid grid-cols-4 flex-shrink-0>
<textarea rows={8} …flex-shrink-0>
<button …flex-shrink-0>
<div …flex-shrink-0>          Follow up on
```

- **Empty →** content is one line, the column does not overflow, so nothing shrinks. It collapses to the
  `No contacts yet.` line. **Measured: 34px** at 768 / 900 / 1080px viewports — it does *not* reserve the
  leftover height.
- **Long →** the column overflows; because history is the only item permitted to shrink, **all** the
  shrinkage lands on it. `min-h-0` lets it shrink below content height and `overflow-y-auto` scrolls the
  rest. The compose block and Follow up on keep their height.

**🔴 `flex-1` would have been the wrong tool** — that is `flex-grow: 1`, which fills leftover space *even
when empty*, which is precisely the "reserve the full height" behaviour the brief ruled out. The previous
code used `flex-1`; it is gone.

**Measured — history height, and does the form survive:**

| viewport | empty | 3 entries | 40 entries | right-col overflow | Log button visible | Follow up visible |
|---|---|---|---|---|---|---|
| 768px | 34px | 190.3 (scrolls) | 190.3 (scrolls) | **0** | ✅ | ✅ |
| 900px | 34px | 192.0 | 322.3 (scrolls) | **0** | ✅ | ✅ |
| 1080px | 34px | 192.0 | 502.3 (scrolls) | **0** | ✅ | ✅ |

Right-column overflow is 0 in every case: history never pushes the log form off screen.

**The arithmetic behind it (reconciled against measurement).** Fixed furniture in the column, measured:
heading 16 + heading 16 + control grid 52 + compose 196.8 + button 32 + Follow up 60 + six `gap-2` = **419.7px**.
So `history = (shell inner height − 40px body padding) − 419.7`. At 900px: 742 − 419.7 = **322.3px**,
matching the measured value exactly. (My first pass mis-subtracted from the padding box rather than the
content box and was 40px out — the reconciled figure above is the correct one.)

`HistoryEntry` is untouched: per-entry `open` state, `needsClamp`, `line-clamp-2` and the More/Less
control are byte-for-byte as they were.

**One caveat worth stating.** The left column retains `overflow-y-auto` as a safety valve, so it is
technically a second *potential* scroll region — but it was there before this change, and it is measured
at **overflow = 0 in all nine two-column cases**, so it never actually scrolls. History is the only region
that scrolls in practice.

---

## (3) Two columns vs one full-width column — numbers only, not implemented

The decisive asymmetry: **a two-column layout costs `max(left, right)` in height; a single column costs
`left + right`.** The left column is now only 265.5px while the right is 453.8px at rest, so stacking
them spends 285.5px (265.5 + 20px gap) of vertical budget that the two-column layout gets for free.

Measured, at 40 history entries — the case that matters, since history is the flexible region:

| viewport | **two columns** | one column (left shrinkable) | one column (left pinned) |
|---|---|---|---|
| 768px | **190.3px** history | 112.1px, left crushed 266→58px | 14px history, **Follow up on off screen** |
| 900px | **322.3px** history | 231.1px, left crushed 266→71px | 36.7px history |
| 1080px | **502.3px** history | 393.4px, left crushed 266→89px | 216.7px history |

Both single-column variants are worse, and each fails a rule the brief set:

- **Left shrinkable** — history is 91px *smaller* at 900px, and the left column is crushed from 266px of
  content to 71px, hiding Email / Contact name / Phone / Notes behind **a second scrollbar**. That breaks
  "history must be the only scrolling region."
- **Left pinned** (the obvious fix for the above) — history collapses to **36.7px** at 900px, about one
  entry. At 768px the body overflows by 89px and **Follow up on is pushed off screen** (measured
  `fuVisible: false`) — the exact failure the brief forbids.
- At 768px the shrinkable variant also clips: body overflow 42px with history *empty*.

**I would keep the two-column split.** With Notes shrunk it is no longer earning its place by holding
content — it is earning it by *not spending vertical height*. The left column's 265.5px sits beside the
history rather than above it, and that is worth 91–286px of history depending on variant and viewport.
A single column reads better only if the right column's fixed furniture shrinks too, and that furniture is
mostly the `rows={8}` compose box (196.8px) which was deliberately sized to paste an email into.

If you do want one column later, the honest prerequisite is cutting the compose textarea back down —
that is the 197px that makes the arithmetic fail, not the layout itself.

---

## Verification

- `tsc --noEmit` — **exit 0, 0 errors**.
- Braces balanced 649/649; file 101,766 bytes.
- Diff against a pre-task snapshot: **6 hunks**, confined to the two blocks plus comments. No write path,
  no route, no schema touched.
- `npx next build` was deliberately not run — a dev server is live and building against it has caused
  problems before.
- Not verified: appearance in the real browser against live data. The measurements come from a
  drift-guarded transcription, not from the running admin page.
