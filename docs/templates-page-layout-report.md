# Templates page — master/detail, a rail, and click-to-insert

---

# 0. WHERE THE CODE AND THE REPORT AGREE, AND ONE THING WORTH KNOWING

Nothing in `docs/outreach-templates-table-report.md` is contradicted by the code. The one fact that
shaped this build, re-derived from the mechanism rather than taken from that report:

🔴 **Only ONE of the five conditions has a negative counterpart.** Read out of `conditionMet`:
`next_event`, `no_next_event`, `order_url`, `website`, `contact_name`. So the pair set is
**`[next_event]`** and the singles are **`[order_url, website, contact_name]`**.

That matters for item (5). Offering a pair for every condition — as "offer the pair for each" reads
literally — would emit `?no_website:`, which `conditionMet` does not know, and its `default: return false`
would drop that line **every single time, silently**. That is exactly the failure item (5) exists to
prevent, so the pair button is offered **only where both halves exist in the code**, and the rest are
offered as singles. Derived, not hardcoded, and it will pick up a new pair automatically.

**Nothing was mid-change:** `tsc --noEmit` on the tree as found was **exit 0, 0 errors**.

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
	docs/truck-name-matching-report.md
	lib/outreach-filter.ts
	lib/outreach-template-render.ts
	lib/schedule-match.ts
	supabase/migrations/20260909_outreach_templates.sql
```

`git add -A` / `git add .` were not run; nothing was staged.

🧪 **This task wrote exactly one file.** `find … -newer` against a snapshot taken before the first edit
returns **`components/admin/TemplatesPanel.tsx`** and nothing else. (`OutreachPanel.tsx` and
`app/admin/page.tsx` show as modified in `git status` from *earlier* tasks in this series.)

---

# 2. (1) MASTER — DETAIL — RAIL

Three columns: **240px list / flexible editor / 360px rail**, set with an **inline
`gridTemplateColumns`**, not `grid-cols-[…]`.

🔴 **Why inline.** An arbitrary Tailwind value used by only one file has no generated rule until the JIT
has scanned that file — that is precisely what left the compose window at `z-index: auto` painting behind
the modal earlier today. If this class went missing, the three panes would collapse into **one stacked
column**, which is the exact layout being fixed. An inline style cannot be absent from a stylesheet.
🧪 Measured: 240 / 776 / 360 at 1440px, 240 / 1016 / 360 at 1680px.

**List rows are one line.** 🧪 Measured **33px** tall: label (truncating, `flex-1`) plus a two-letter
channel badge. The reorder and retire controls are `hidden group-hover:flex`, and forced visible on the
selected row — so **they consume no width when idle** and the label gets the whole row.

🔴 **The slug appears once, in the editor, for the selected template only** — never on a list row. It is
fixed after creation, and its tooltip says why.

---

# 3. (2) THE EDITOR PANE

Label + channel + slug share **one row**; subject; body; **the three placeholder defaults on ONE row**
(`flex` with `flex-1 min-w-0` each, so they share the width and truncate rather than wrap); then the
warnings and Save.

## 🔴 The body height, and why it is 15 rows and not 16

🧪 **404px** — `15 × 26px line-height + 12px padding + 2px border = 404`, matching the measurement
exactly. Font is **16px**, because `text-sm` is **inert** on a textarea here (the unlayered rule forces
`font-size: inherit`), so `rows` is the only thing that can set the height.

**At what viewport the pane fits without scrolling**, measured with the real admin chrome above it
(AppHeader **52px** + tab bar **37px**):

| body | Save button's bottom edge | verdict |
|---|---|---|
| `rows={16}` → 430px | **899px** | a **1px** margin on a 1440×900 laptop — not "fits" |
| **`rows={15}` → 404px** | **873px** | **fits with 27px to spare at 900px** |

So: **every editor control is visible without scrolling at a viewport height of ≥873px**, which covers a
1440×900 MacBook Air. The document is 914px tall, so there is ~14px of scroll from the page's own bottom
padding — that hides nothing. The 26px of body height was traded for that margin deliberately, and the
box is `resize-y`, so it drags taller on a bigger screen.

---

# 4. (3) THE PREVIEW AND TOKEN REFERENCE MOVED TO A RAIL — AND WHY THAT BEATS THE ALTERNATIVES

A **360px right-hand rail with a two-tab strip (Preview | Tokens)**, Preview default.

| option | why not |
|---|---|
| Collapsible panels below the editor | **That is the current fault.** The preview would sit under a 404px textarea, so seeing the conditional branch means scrolling — and item (3) requires it in one action. |
| Tabs that replace the editor | The preview's whole job is showing the effect of an edit. Hiding the body to look at the result makes comparing them impossible. |
| **A rail beside the editor** ✅ | Both on screen at once; Preview↔Tokens is **one click**; the editor never moves. Cost is 360px of width, which a desktop-only page at `max-w-[1800px]` has to spare. |

🔴 **The preview is reachable in zero actions, not one** — it is the default tab. Its prospect picker,
search, and the **"Simulate no upcoming event"** toggle all moved with it, so the conditional branch is
still visible before sending.

---

# 5. 🔴 (4) CLICK-TO-INSERT AT THE CARET

Click, not drag: a drop has to reconstruct a caret from a pointer position and fails by landing text at
the end or in the wrong place after a scroll, with no visible sign. A click uses the field's **own**
`selectionStart`/`selectionEnd`, which is exact.

The palette is **derived** — `resolvedTokenReference()` (8 tokens) and `conditionReference()` (5
conditions), the same functions the reference already used.

## 🔴 If no field has been focused

**It refuses and says so.** The buttons are `disabled` while `lastFocus` is null, the panel shows
*"Click into the subject or body first — then these insert at your cursor,"* and `insertAtCaret` itself
returns early with that message as a second line of defence. **Nothing is inserted anywhere.** Guessing a
field is how text lands somewhere nobody watched.

## Proofs — run against the **compiled** component, so the tested code is the shipped code

🔴 The brief's trap: *an insert that always appends and one that inserts at the caret look identical when
the caret is already at the end.* So the test puts the caret in the **middle**:

```
before: "Hi,\n\nI run villagefoodie.co.uk. Your pitch is soon.\n\nDominic"
caret   : 42  (just after "Your pitch")
after : "Hi,\n\nI run villagefoodie.co.uk. Your pitch {{next_event_venue}} is soon.\n\nDominic"
```
inserted **at** the caret: **true** · trailing text preserved: **true**

| case | result |
|---|---|
| replacing a selection — `"A OLD B"` with `OLD` selected | `"A [[new]] B"` |
| nothing focused | body **unchanged**, message *"Click into the subject or body first…"* |

---

# 6. 🔴 (5) THE CONDITIONAL PAIR AS ONE INSERT

One click inserts **both** lines. `{ ownLines: true }` forces them onto their own lines, because the
marker is only recognised at the **start** of a line — inserted mid-sentence it would be a clause that
never fires.

🧪 Inserted at index 11 of `"Hello there and goodbye"`:

```
1| Hello there
2| ?next_event: 
3| ?no_next_event: 
4|  and goodbye
```
every marker at a line start: **true**, markers: **2**.

## The half-pair warning

🔴 A half-written pair has **no visible failure mode** — the branch simply never renders. 🧪 **5/5**:

| body | warns |
|---|---|
| only `?next_event:` | **yes** — `?next_event: without ?no_next_event:` |
| only `?no_next_event:` | **yes** |
| both halves | no |
| no conditional at all | no |
| `?next_event:` **mid-line** plus `?no_next_event:` at line start | **yes** — correct, because a mid-line marker is not recognised and would never fire |

*A warning that never fires would show `warns=false` on all five.* It does not.

---

# 7. 🔴 ELEMENT ORDER, BEFORE AND AFTER — COMMENTS STRIPPED FIRST

| # | BEFORE | AFTER |
|---|---|---|
| 1 | list column | list column |
| 2 | label field | label field |
| 3 | channel select | channel select |
| 4 | slug field | slug field |
| 5 | subject field | subject field |
| 6 | body textarea | body textarea |
| 7 | mistype warning | **half-pair warning** |
| 8 | defaults block | mistype warning |
| 9 | preview block | defaults block |
| 10 | token reference | **rail tab strip** |
| 11 | — | preview block |
| 12 | — | token reference |
| 13 | — | **insert palette** |

Items 1–9 were a single stacked column before; 10–13 are now the rail beside the editor.

## ⚠️ THE LANDMARK SCAN MISREPORTED THREE TIMES BEFORE IT WAS RIGHT — AGAIN

The brief notes this has happened in three reports in this series. It happened here too, and each was
caught before being reported:

1. **`half-pair warning` reported absent** — my marker was lower-case `'half of a conditional'` against
   rendered text `"Half of a conditional pair"`.
2. **`token reference` reported absent from the AFTER file** — that section was renamed when it became a
   rail tab, so the old marker could not match.
3. **`token reference` then reported absent from the BEFORE file** — the replacement marker
   (`Values from the row`) was new, so it could not match the old file.

Fixed by keying on **`tokenRef.map(`**, present in both versions. **Rendered text is a bad landmark;
identifiers are stable ones** — the same conclusion as the previous report, arrived at the same way.

---

# 8. PROOFS AND SCOPE

**P1 · The preview is still the same code path.** 🧪 `TemplatesPanel` contains **0** `.replace(`, **0**
`matchAll`, **0** `conditionMet`, **0** `?cond:` literals. Its six `[[` occurrences are display strings
(a defaults label, an unresolved chip, the `[[name]]` insert button). Substitution comes only from
`contextFromProspect` / `renderWithFills` / `composeEmail` — 🧪 6 call sites, all imported. The
15-byte-identical-composition guarantee from the previous report is untouched because the render was not
reimplemented, only moved.

**P2 · 🔴 Inertness, all three lessons.** 🧪 Measured in headless Chrome against the project's own
compiled Tailwind with the unlayered block copied verbatim:

| control | class | computed | note |
|---|---|---|---|
| defaults input (`type="text"`) | `text-sm` | **16px** | inert as expected; consistent; iOS-safe |
| the same input **without `type`** | `text-sm` | **14px** | escapes the attribute selector — avoided |
| channel `<select>` | `text-sm` | 16px | inert, consistent |
| body `<textarea rows={15}>` | — | **404px** | sized by `rows`; arithmetic matches exactly |
| channel badge / age chip | `text-[10px]` / `text-[9px]` | 10px / 9px | take effect |
| rail tab / token button / pair button | `text-xs` / `text-[11px]` | 12px / 11px | take effect |

🧪 **All 5 `<input>` elements carry a type** (4 `text`, 1 `checkbox`).
🧪 **Arbitrary-value safety:** `text-[9px]` 3 files, `text-[11px]` 28, `text-[10px]` 27, `text-[12px]` 3,
`w-36` 2, `border-b-2` 7 — all have co-users. The two **layout-critical** values (grid columns, preview
max-height) are **inline styles**, immune to the missing-rule fault.

**P3 · Compiler.** `tsc --noEmit` → **exit 0, 0 errors** at every step.

**P4 · Scope.** 🧪 One file written: `components/admin/TemplatesPanel.tsx` (28,331 → 38,956 bytes). No
template data, no substitution mechanism, no conditional syntax, no guards, no route action, no schema, no
migration. The compose window's `style={{ zIndex: 85 }}` is untouched. The compose window, outreach
filters, chips, media cells, delete guards, events tab and schedule popup were not opened.

---

# 9. EVIDENCE CLASS

- ✅ **Executed, against compiled source:** the caret-insert proofs and the half-pair warning — extracted
  from `TemplatesPanel.tsx` **after** compiling it with the repository's own TypeScript, so the tested
  logic is the shipped logic, not a transcription.
- ✅ **Executed against the mechanism:** the derived pair/single split (1 pair, 3 singles) read from
  `conditionMet` via the compiled module.
- ✅ **Measured in a browser:** every column width, the 404px body, the 33px list row, the 873px Save
  bottom with real chrome heights, and all the font sizes in P2.
- ✅ **Compiler-confirmed:** `tsc --noEmit`, 0 errors.
- ✅ **Structural, extracted from source:** the before/after order (after three marker corrections), the
  zero-substitution-code census, the `<input type>` audit, the arbitrary-value co-user counts, the
  one-file scope via `find -newer`.
- 🔴 **Reasoned only, NOT OBSERVED:** that the three-pane layout reads well, that the hover-revealed row
  controls are discoverable, that the rail is wide enough for a real preview at your zoom level. **No
  admin session is obtainable here — I selected no template, clicked no token, inserted nothing and saved
  nothing.** The measurements come from a faithful harness of the real class strings, not from the
  running page.
- ⚠️ **One limit on the insert proofs.** They exercise the shipped function with a stubbed textarea
  element, so they prove the string arithmetic and the own-lines behaviour. They do **not** prove the
  browser restores focus and caret after the `requestAnimationFrame`, which only a real click can show.
