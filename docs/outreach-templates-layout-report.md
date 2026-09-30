# The Templates tab — two views: Sequence and Templates

**30 September 2026 · commit pending in §7 · measured in Chromium and WebKit**

Layout and presentation only. No behaviour of the sequence, the guards or the editor's saving
changed; the one functional addition is the **Insert token ▾** menu, which the brief asks for.

---

## 0 · The inventory — everything that was on the tab, and where it went

| # | What was there | Where it is now |
|---|---|---|
| 1 | View switch **Templates / Snippets / Signature** | **Replaced** by the segmented **Sequence \| Templates**. Snippets and Signature are links at the **bottom of the Templates view's left pane** — they are global libraries, not templates, and a two-way switch with four things in it is a menu |
| 2 | "**n** templates" count + **New template** button | **New template** is at the top of the **left pane**; the count is the left pane itself, which now says more per row than a number did |
| 3 | The **unsaved-changes bar** (Save-then-switch / Discard / Stay) | **Unchanged**, above both views |
| 4 | The **"needs migration" / load-error** panels | **Unchanged**, above both views |
| 5 | The **sequence grid** (steps as rows, types as columns, a `<select>` per box) | **Sequence view**, axes swapped, static cells — §2 |
| 6 | The **Truck types** panel (four rows: name, count, how decided, Rename) | **Removed as a panel.** Each row label carries an **ⓘ** with the same three things — how it is decided, the live count, and an inline Rename writing the same `outreach_settings` row |
| 7 | The **Changed type since first email** panel | **One amber line** above the grid with **Review**; hidden when there are none |
| 8 | The **template list** (240px, one line per row, `em`/`wa` chip, ↑ ↓ retire) | **Left pane** (270px): **+ New template**, **search**, grouped under **EMAIL** / **WHATSAPP**, each row saying **"Used in n boxes · default"** or **"Not in sequence"**; retired rows in a collapsed **Retired (n)**; ↑ ↓ and retire kept, on hover |
| 9 | Editor **1 · Name it** (name, slug) | **Centre pane**, unchanged |
| 10 | Editor **2 · When to use it** (Send by, read-only tags, "Used in", match count, tag-capability warning) | **Removed as a section.** The channel moved beside the name; **"Used in"** is a row of **clickable chips**; the match count is one sentence under them; the old tags are still shown, greyed, read-only; the capability warning went with the controls it was about (nothing on this screen reads the flag now) |
| 11 | Editor **3 · Write it** (Subject, Message, snippet line, malformed/mistyped warnings, half-pair warning) | **Centre pane**, unchanged, plus the toolbar row above the message |
| 12 | **Discard / Save** and the unsaved indicator | **Unchanged**, at the bottom of the centre pane |
| 13 | Rail tab **Preview** (search, prospect picker, simulate-no-event, subject, body, unresolved, dropped) | **Right pane**, on its own, with its own scroll |
| 14 | Rail tab **Tokens** (token reference, conditional pairs, single conditions, `[[name]]`, notes) | **Replaced by the toolbar's Insert token ▾ and Insert condition ▾.** Both read `resolvedTokenReference()` / `conditionReference()` — the resolver's own vocabulary. ⚠️ **Two things were dropped deliberately and are named here**: the standalone `[[name]]` button (typing two brackets is not a control, and the Snippets screen is where a placeholder gets a value) and the list of *single* conditions with no negative half (`halfPairs` still warns when one is half-written, which is the failure that matters) |
| 15 | **Snippets** and **Signature** panels | **Unchanged screens**, reached from the left pane |
| 16 | The toast | **Unchanged** |

🔴 **Nothing else was on the tab.** Two things are gone rather than moved — item 14's `[[name]]`
button and the single-condition row — and both are called out above rather than left to be noticed.

---

## 1 · Two views

- A **segmented control** at the top with a one-line description beside it: *"Which template each
  kind of truck gets, at each step of the sequence"* / *"The words themselves — write them here and
  the sequence decides who gets them."*
- **Remembered per browser** — `hg.outreach.templatesView.v1`, read in a microtask after mount and
  written on every change, both in `try/catch`. A stored value that is neither reads as Templates.
- **The two views are linked both ways.** A cell's **↗** opens that template in the Templates view;
  a **"Used in" chip** in the editor opens the Sequence view with that box **outlined**.

---

## 2 · The Sequence view

```
                 First contact   Chase 1        Chase 2        Final chase
                 day 0           +3 days        +7 days        +14 days
All trucks       None            Chaser ↗       None           None
(default)
HU — ordering ⓘ  HU rate ↗       Chase 1 ↗      ↳ Nothing yet  ↳ Nothing yet
42 trucks                        ⌜14 due⌝
HU — map only ⓘ  Map only ↗      ↳ Chaser       ↳ Nothing yet  ↳ Nothing yet
On Village…   ⓘ  General ↗       ↳ Chaser       ↳ Nothing yet  ↳ Nothing yet
Not listed    ⓘ  ↳ Nothing yet   ↳ Chaser       ↳ Nothing yet  ↳ Nothing yet

Name its own template · ↳ Name uses the default · red = nothing will be suggested · n due = trucks due now
```

- **Columns are the steps**, in the order they happen, each with **when** underneath. 🔴 That comes
  from `stepOffsetLabel(step, FOLLOW_UP_DAYS)`: the interval stored against a step is the one that
  leads to the *next* one, so a column shows the interval of the step **before** it and the first is
  day 0 by definition. Writing the four numbers out again is how a grid ends up promising a cadence
  the queue does not run.
- **Rows are the default and the four types**, under your names, each with its **live count**.
- **Cells are labels.** Twenty always-open `<select>`s was twenty controls shouting at once, and a
  select shows a truncated value with nowhere to say "↳ inherited". A cell now reads:
  - **dark name + ↗** for its own template, wrapping to two lines (`break-words`, never `truncate`);
  - **"↳ Name"** in grey on a **dashed** box where it uses the default;
  - **red "No template" / "↳ Nothing yet"** for a gap;
  - **grey "None"** for an empty default cell that no type depends on.
- 🔴 **Red means a gap that matters, and nothing else.** `gap = (no own && no inherited) || broken`;
  `matters = gap && (not the default row || something is due there)`. An empty default cell every
  type covers for itself is a decision, not a fault — red there would train the eye to ignore red.
- **Clicking a cell opens the picker in place**: "Same as default" (or "No template" on the default
  row), the channel's **active** templates, then **"+ Write a new one for this box"** — which opens
  the Templates view with the new-template form on that channel and **creates nothing until Save**.
  **Esc** or a click away closes it unchanged; the cell being edited is **outlined**.
- **Due pills** sit on the cell's top-right edge, **only above 0**, red when that box is a gap and
  grey otherwise. 🔴 **"0 due" appears nowhere.**
- **ⓘ** on each type row: how it is decided (the words of `leadTypeOf`), the live count, and an
  inline **Rename** writing the same `outreach_settings` row as before.
- **One amber line** for changed types, with **Review**; nothing at all when there are none.
- **A key under the grid**, in the order the eye meets the things it explains.

---

## 3 · The Templates view

Three panes at **270px / 1fr / 30%**, `height: calc(100vh - 12rem)`, each with its own scrollbar,
and **the page itself does not scroll**.

⚠️ **This does not touch `document.body`.** The v4-fixes bug was a scroll lock the inline composer
left on the whole document; nothing here sets `overflow` on the body or the documentElement, and the
harness asserts it. The prospect page is unaffected — it is a different route.

- **Left**: + New template, a search over name **and slug** (half of these are known by their slug),
  templates grouped **EMAIL** / **WHATSAPP**, each with **"Used in n boxes · default"** or **"Not in
  sequence"**, the selected one highlighted, retired ones in a collapsed **Retired (n)**, and
  **Snippets · Signature** at the bottom.
- **Centre**: the existing editor — name, channel, Active, the **"Used in" chips**, Subject, the
  message with its toolbar, Discard / Save, the unsaved indicator and the switch-away warning.
- **Right**: the preview only — "pick a prospect", the rendered subject, the body as you type, and
  the footer line naming anything unresolved or dropped.

### Insert token ▾

On the toolbar row above the message, beside **Insert condition ▾**.

🔴 **It reads `resolvedTokenReference()`, which reads the labels off the resolver's own switch.**
There is no array of token names in the tab and the harness bans one: a second copy agrees on the
day it is written and then offers a token that expands to nothing, or hides one that works. Each
entry shows the syntax and a one-line description; choosing one inserts it **at the cursor** through
the existing `insertAtCaret`, and it is disabled until a field has been focused, with the reason.
⚠️ **It guards nothing and bypasses nothing** — it writes the characters a person would type, and
`malformedTokensIn` still reads the finished body.

---

## 4 · The phone

- **Sequence**: the table scrolls sideways in its own box, with the row labels **pinned**
  (`sticky left-0` on every row's first cell and on the header's).
- **Templates**: the three panes stack — list, editor, preview (`max-md:grid-cols-1 max-md:h-auto`).

---

## 5 · Measured, in both engines

`scripts/outreach-templates-render.cjs` — Chromium (puppeteer) and WebKit (Playwright), a `file://`
fixture built from the views' **own** structure: the column and row counts come from the code's
`CONTACT_KINDS` and `SLOT_LEAD_TYPES`, and the pane widths, the pane height and the cell class are
lifted out of the source with regexes that fail loudly if they stop matching.

```
── Chromium ──                                   ── WebKit ──
1440×800 sequence: grid 96–502, key ends 489     1440×800 sequence: grid 96–502, key ends 489
✓ 🔴 four step columns (4)                        ✓ 🔴 four step columns (4)
✓ 🔴 five rows — the default and the four types   ✓ 🔴 five rows — the default and the four types
✓ 🔴 THE ACCEPTANCE: the whole grid AND its key fit in 800px (key ends 489)
✓ 🔴 …with nothing to scroll                      ✓ …with nothing to scroll
✓ 🔴 the four columns are side by side, in order
2560×1400 sequence: identical — no re-flow

1440×800 templates: left 270 @x16 · centre 684 · right 422 · panes 608px tall
2560×1400 templates: left 270 · centre 936 · right 530 · panes 1208px tall
✓ 🔴 the three panes are side by side, top aligned
✓ 🔴 each pane scrolls on its own (leftScroll, centre, rightScroll)
✓ 🔴 …and the PAGE itself does not

✅ both views measure correct
```

🔴 **The acceptance holds with 311px to spare** at 1440×800: the grid and its key end at **489px** of
800. **The 27" monitor is the same layout** — the sequence grid measures identically (the columns are
fixed widths, so it does not re-flow), and the three panes simply get wider.

---

## 6 · The harness

`scripts/outreach-templates-layout.cjs` — **NEW**, registered (73 harnesses), **57 checks**, **8
broken variants**, no network, no mailbox, no database. `HG_RENDER=1` adds the two-engine run.

```
✓ FAILED as required  V1 🔴 the Final chase column is dropped from the grid
✓ FAILED as required  V2 🔴 a red pill on a filled cell — red stops meaning "a gap"
✓ FAILED as required  V3 🔴 "0 due" is printed on every empty box
✓ FAILED as required  V4 🔴 the token list is hard-coded beside the resolver instead of read from it
✓ FAILED as required  V5 🔴 a cell goes back to an always-open dropdown
✓ FAILED as required  V6 🔴 the truck-types panel comes back as a standing block
✓ FAILED as required  V7 🔴 the Templates view scrolls as one page again
✓ FAILED as required  V8 🔴 the column headings invent their own cadence
…
✅ all 57 passed
```

It covers every item the brief lists: both views and the remembered choice; four step columns and
five rows; **no `<select>` anywhere in the grid**; the due pill only above 0; red only for gaps; the
truck-types panel gone and the ⓘ popover carrying Rename; the three panes scrolling independently
while the page does not; the Insert token menu reading the resolver's vocabulary and inserting at the
cursor; and **the only writer of `outreach_templates` still being the editor's Save** (a repo-wide
census of `from('outreach_templates').insert|update|delete|upsert`).

⚠️ Every census variant is checked for **having changed something** before it runs — a mutation whose
anchor has drifted runs over correct source and reports "THE HARNESS PROVES NOTHING" without saying
why, which cost a minute earlier today.

---

## 7 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 5.0s` |
| eslint — all changed files | **identical to HEAD** (`TemplatesPanel` 3 errors, all pre-existing; `SequenceGrid` and both libs 0/0) |
| `node scripts/outreach-templates-layout.cjs` | **57 checks, all passed**, 8 variants caught |
| `node scripts/outreach-templates-render.cjs` | **both views correct in Chromium and WebKit** |
| `node scripts/run-harnesses.cjs` | **73 run · 73 passed · 0 failed** |
| goldens | `8bdae817…` and `e3f0a880…` ✅ unchanged |

No SQL, no database change, no `outreach_templates` row created, edited, seeded or deactivated, no
email sent. One send path, one contact writer, one follow-up writer, one `nextStep` per page, every
sequence guard, `EMAIL_FRAME_SANDBOX` unchanged.

---

## 8 · What to test

Viewing and template editing only — nothing here sends. **ZZ Test Prospect** if you want to check the
composer still opens on the right template afterwards.

1. **The switch.** Pick **Sequence**, reload the page — it comes back on Sequence. Pick **Templates**,
   reload — Templates.
2. **The grid at 1440×800**: the whole thing, including the key line, without scrolling. Same on the
   27" — wider, not different.
3. **Click a cell.** The picker opens in place, the cell is outlined. **Esc** closes it with nothing
   changed; so does clicking away. Choose a template: "saved", and **Undo** puts it back.
4. **"+ Write a new one for this box"** on an empty cell → the Templates view with the new-template
   prompt, on that box's channel. Cancel it and check **no row was created**.
5. **↗** on a filled cell opens that template in the Templates view.
6. **A "Used in" chip** in the editor takes you back to the Sequence view with that box outlined.
7. **ⓘ** on a truck type: how it is decided, the count, and **Rename** — rename one and check it
   changes on the grid, on the prospect page's contact card and in the composer's suggestion line.
8. **No "0 due" anywhere**, and red only where a box would suggest nothing.
9. **Templates view**: scroll the left list — the editor and the preview stay put. Scroll the editor
   — the list stays put. The page itself should not move.
10. **Insert token ▾**: click into the body, open it, pick `{{demo_link}}` — it lands at the cursor.
    Check the list matches what the preview actually fills in.
11. **The prospect page still scrolls** (the v4-fixes bug): open any prospect and scroll to the
    bottom of its history.
