# Templates tab — equal panes, and defaults moved to the top

---

# 0. ONE NUMBER IN THE BRIEF, RE-DERIVED

**The split was not "roughly 60/40" — it was 68/32.** 🧪 Measured at a 1440px viewport before any edit:
editor pane **776px**, rail **360px** → **68.3% / 31.7%**. The arithmetic: container `1440 − 32` (the
page's `px-4`) `= 1408`, minus two `gap-4` gaps `= 1376`, minus the 240px list and the fixed 360px rail
leaves **776** for the editor.

Nothing else in the brief is contradicted by the code, and no other task was mid-change — `tsc --noEmit`
on the tree as found was **exit 0, 0 errors**.

---

# 1. `git status`, verbatim, before any edit

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/admin/page.tsx
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/api/admin/discovery-events/
	app/api/admin/outreach-templates/
	components/admin/ComposeWindow.tsx
	components/admin/ConfirmDeleteDialog.tsx
	components/admin/DiscoveryEventsPanel.tsx
	components/admin/EventRowCells.tsx
	components/admin/InlineField.tsx
	components/admin/ScheduleEventsPopup.tsx
	components/admin/TemplatesPanel.tsx
	docs/compose-single-pane-report.md
	docs/compose-window-stacking-report.md
	docs/discovery-events-delete-report.md
	docs/discovery-events-table-report.md
	docs/discovery-run-log-migration-report.md
	docs/outreach-compose-send-report.md
	docs/outreach-compose-window-report.md
	docs/outreach-delete-guard-report.md
	docs/outreach-filter-ux-report.md
	docs/outreach-inline-edit-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-density-report.md
	docs/outreach-modal-flow-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-schedule-popup-report.md
	docs/outreach-table-report.md
	docs/outreach-templates-report.md
	docs/outreach-templates-table-report.md
	docs/templates-page-layout-report.md
	docs/truck-name-matching-report.md
	lib/outreach-filter.ts
	lib/outreach-template-render.ts
	lib/schedule-match.ts
	supabase/migrations/20260909_outreach_templates.sql
```

`git add -A` / `git add .` were not run; nothing was staged. 🧪 **This task wrote exactly one file** —
`find … -newer` against a pre-edit snapshot returns `components/admin/TemplatesPanel.tsx` and nothing else.

---

# 2. (1) EQUAL PANES — MEASURED, NOT ASSERTED

The grid template changed from `240px minmax(0, 1fr) 360px` to
**`240px minmax(0, 1fr) minmax(0, 1fr)`**, still as an **inline style** — an arbitrary Tailwind width in
a file that is the only user of it may have no generated rule at all, and if this one vanished the three
panes would collapse into a single stacked column. 🧪 No new bracketed Tailwind values were introduced:
the set of `[...]` values in the file is **identical** before and after.

🧪 **Measured widths:**

| viewport | editor pane | rail | equal? | list |
|---|---|---|---|---|
| 1440px — before | 776 | 360 | no (68/32) | 240 |
| **1440px — after** | **568** | **568** | **yes** | 240 |
| **1680px — after** | **688** | **688** | **yes** | 240 |

The list keeps its fixed 240px at every width; the two flexible panes share what remains equally.

## 🔴 Does the body still read well at the narrower width? — Yes, and it is BETTER

The brief asked me to say so with numbers if equal width made the body noticeably worse. **It does not
make it worse.** Measured against the real seeded Hatches Up body (681 chars, 14 source lines, longest
prose line 161 chars), with the average advance width measured from that text in that font rather than
assumed — **7.1px per character at 16px**:

| | inner width | **characters per line** |
|---|---|---|
| before | 724px | **101** |
| **after** | **516px** | **72** |

The conventional comfortable measure for prose is **45–75 characters per line**. The old pane was at
**101 — above that range**; the new one is at **72 — inside it**. Making the panes equal moved the body
from too-wide to a normal reading measure.

⚠️ **The one real cost, stated plainly.** The same body now occupies **21 visual lines instead of 17** at
1440px, and the box shows 15 rows — so it is 15-of-21 visible rather than 15-of-17, i.e. about four more
lines of scroll. I did **not** add rows to compensate: the previous task measured the Save button's
bottom at **873px** with 15 rows and **899px** with 16, against a 900px laptop, so a 16th row would put
Save back on the edge of the fold. The textarea is `resize-y` and can be dragged taller on a big screen.

## 🔴 A FINDING THAT AFFECTS WHY YOU ASKED FOR THIS — the breaks still will not align

Your reason for equal width was *"comparing is easier when the line breaks fall in similar places."*
Equal width alone does not achieve that, because **the two panes render at different font sizes**:

| | font | inner width | px/char | **characters per line** | longest prose line wraps to |
|---|---|---|---|---|---|
| body textarea | **16px** | 550px | 7.10 | **77** | **3 lines** |
| preview `<pre>` | **12px** | 542px | 5.56 | **97** | **2 lines** |

At the same pane width the preview still fits **~26% more characters per line**, so the same paragraph
breaks in different places in the two panes.

🔴 **And the body cannot be brought down to 12px.** `text-sm` is **inert** on a textarea — the unlayered
`!important` rule in `globals.css` forces `font-size: inherit`, which resolves to 16px whatever class it
carries. **The only way to align the breaks is to raise the PREVIEW to 16px** (`text-[12px]` →
`text-base` on that `<pre>`), which is a one-word change.

**I have not made it.** You specified two layout changes and this would be a third; making it silently is
exactly the habit this series has been correcting. Say the word and it is one line.

---

# 3. (2) PLACEHOLDER DEFAULTS MOVED TO THE TOP

The defaults block moved from below the body to **above the label/channel row**, still on **one row**
(`flex` with `flex-1 min-w-0` per field, so the three share the width and truncate rather than wrap). The
block itself is unchanged — same fields, same per-placeholder age chips, same Save defaults control.

## 🔴 Element order, before and after — JSX comments stripped first

| # | BEFORE | AFTER |
|---|---|---|
| 1 | list column | list column |
| 2 | label field | **defaults block** |
| 3 | channel select | label field |
| 4 | slug display | channel select |
| 5 | subject field | slug display |
| 6 | body textarea | subject field |
| 7 | half-pair warning | body textarea |
| 8 | mistype warning | half-pair warning |
| 9 | **defaults block** | mistype warning |
| 10 | save button | save button |
| 11 | rail tab strip | rail tab strip |
| 12 | preview block | preview block |
| 13 | token palette | token palette |

**Defaults moved from slot 9 to slot 2; every other element holds its relative order.** All 13 landmarks
were found in both files, so neither column is under-reported.

⚠️ The scan strips `{/* … */}` and `//` comments **before** matching, and keys on identifiers
(`bodyRef`, `saveDraft`, `RAIL_TABS.map`, `tokenRef.map(`) rather than rendered text — the marker style
that misreported order three times earlier in this series. It produced no false readings this time.

---

# 4. PROOFS AND SCOPE

**P1 · The preview is still the same code path.** 🧪 `TemplatesPanel` contains **0** `.replace(`, **0**
`matchAll`, **0** `conditionMet`, **0** `?cond:` literals, and **6** call sites into
`contextFromProspect` / `renderWithFills` / `composeEmail`. The panel was resized and reordered, not
reimplemented, so the 15-byte-identical-composition guarantee with the compose window is untouched.

**P2 · 🔴 Widths measured, not asserted.** *"The widths are now equal"* is the easy claim; the numbers are
in §2 — 568/568 at 1440px and 688/688 at 1680px, with the list fixed at 240px in both.

**P3 · Inertness.** No new bracketed Tailwind values were introduced (the before/after set is identical),
so nothing new can be missing a generated rule. The layout-critical grid remains an **inline style**. The
body's 16px is the *forced* value from the unlayered rule, which is what §2's font-size finding rests on —
and it is measured, not assumed.

**P4 · Compiler.** `tsc --noEmit` → **exit 0, 0 errors**.

**P5 · Scope.** One file written: `components/admin/TemplatesPanel.tsx`. No template data, no substitution
mechanism, no conditional syntax, no guards, no route action, no schema, no migration, no template copy.
The compose window, outreach filters, chips, media cells, delete guards, events tab and schedule popup
were not opened.

---

# 5. EVIDENCE CLASS

- ✅ **Measured in a browser:** every width, the 7.10 and 5.56 px-per-character figures (measured from the
  real seeded body in the real font via canvas `measureText`, not estimated), the 101 → 72 characters-per-line
  change, the 17 → 21 visual-line change, and the body-vs-preview 77 vs 97 comparison. Against the
  project's own compiled Tailwind with the unlayered block copied verbatim.
- ✅ **Executed against real data:** the body used for the wrap measurements is the actual
  `hu_rate_email` body pulled out of the seed in `20260909_outreach_templates.sql`, not a stand-in.
- ✅ **Compiler-confirmed:** `tsc --noEmit`, 0 errors.
- ✅ **Structural, extracted from source:** the before/after element order (comments stripped), the
  zero-substitution-code census, the identical-bracketed-values check, the one-file scope via `find -newer`.
- 🔴 **Reasoned only, NOT OBSERVED:** that 72 characters per line feels right to you in practice, that
  the defaults row at the top reads as the first thing rather than as clutter, and that the extra four
  lines of body scroll are an acceptable trade. **No admin session is obtainable here — I selected no
  template, typed in no field and saved nothing.** The measurements come from a harness built from the
  real class strings, not from the running page.
- ⚠️ **The 45–75 characters-per-line range is a typographic convention, not something I measured on you.**
  It is why I call 72 an improvement over 101; if you prefer a longer measure, the honest reading of the
  numbers is that the old pane suited that better and equal width does not.

---

# 6. FOLLOW-UP APPLIED — THE PREVIEW RAISED TO 16px

You asked for the one-word change §2 flagged. Done: the preview `<pre>` went from `text-[12px]` to
**`text-base`**. That is the entire diff — 🧪 `find … -newer` returns only
`components/admin/TemplatesPanel.tsx`, and the only changed line is that one class.

⚠️ `text-base` is a **core** utility with **25 other users** in the repo, so unlike an arbitrary bracketed
value it cannot be missing a generated rule — the fault that mis-painted the compose window.
`leading-relaxed` resolves to **26px** on it, exactly as it does on the body.

## 🧪 Characters per line at 1440px — measured, both panes

| | font | inner width | px/char | **characters per line** | longest prose line (161 chars) wraps to | whole body |
|---|---|---|---|---|---|---|
| **body textarea** | 16px | 516px | 7.10 | **72** | **3 lines** | **21 visual lines** |
| **preview (now)** | 16px | 520px | 7.10 | **73** | **3 lines** | **21 visual lines** |
| preview (before) | 12px | 520px | 5.56 | 93 | 2 lines | 18 visual lines |

**They no longer differ materially.** The gap went from **72 vs 93** (a 21-character, 29% mismatch) to
**72 vs 73** — a **one-character, 1.4%** difference. The longest prose line wraps to **3 lines in both**,
and the whole body occupies **21 visual lines in both**, so the paragraphs break in the same places and
the panes can be read against each other line for line.

**Where the last character goes.** The 1-character gap is a **4px** difference in inner width, not a
typographic one: both panes are 568px, but the textarea sits inside the editor card's `p-4` and carries
`px-2` (516px inner), while the `<pre>` sits inside the rail's `p-3` and carries `px-2.5` (520px inner).
Same font, same 7.10px per character. Closing it would mean equalising the two containers' padding, which
is not worth a change and would not move a single line break — both already wrap identically.

## ⚠️ The cost, stated rather than glossed

The preview's content is now taller at the same width: **21 lines × 26px = 546px** against its 340px
`maxHeight`, so it scrolls about **222px**, where at 12px it was 18 × 19.5 = 351px and scrolled about
**27px**. More of the preview is behind a scroll than before. I did **not** raise the `maxHeight` —
"nothing else changes" — but that is the one-line follow-up if the scrolling annoys: the box is an inline
`style={{ maxHeight: 340 }}`.

🧪 The panel still contains **zero** substitution code (0 `.replace(`, 0 `matchAll`, 0 `conditionMet`) and
**6** call sites into `contextFromProspect` / `renderWithFills` / `composeEmail`, so the shared code path
with the compose window is untouched. `tsc --noEmit` → **0 errors**.

