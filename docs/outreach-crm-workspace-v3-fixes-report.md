# Workspace v3 fixes — the layout, one notes area, and the contact card

**30 September 2026 · commit `303a260` · deployed and serving on production at 14:23:04Z**

Three fixes on top of [the v3 corrections](outreach-crm-workspace-v3-report.md). One of them is a
real layout bug that v3 introduced and that neither the arithmetic nor the class-name census could
see, so this build also gets a browser to answer the question.

| | v3 | now |
|---|---|---|
| Grid children | **four** — left, Demo/Files (`gridColumn: 1`), centre, right | **three** — left, centre, right, `items-start` |
| Centre column at 1440px | started **668px down**, level with the Demo card | starts at the top, beside the left column |
| Tracks | an inline template beside a class that could never win | one function, `gridTemplateFor(width)` |
| Phone order | a fourth grid item placed by hand | `max-md:contents` under 768px only |
| Notes | "About this truck" (6 rows) **+** "Add a note" (3 rows) | one **Notes** card: a 10-row box, the saved notes in full, then "Earlier notes" |
| Contact card ≥768px | a small Call by the number **and** large Call + WhatsApp under it | the small Call by the number, and nothing repeated |
| Contact card <768px | three 44px buttons | **unchanged** |

**SQL:** none. This build needed none — no schema change, no data change, no row touched.

---

## 1 · The page was pushed down

### What was actually wrong — two things, and only one of them was reported

**(a) A fourth grid item.** v3 put the Demo and Files cards in their own grid item and placed it
explicitly:

```jsx
<div style={{ gridColumn: 1 }} className="… max-lg:order-3">
```

An **explicitly placed** item moves the grid's auto-placement cursor past it. The left column took
(row 1, col 1); this item took (row 2, col 1); and the centre and right columns — both auto-placed
— were then laid out from the cursor, at **(row 2, col 2)** and **(row 2, col 3)**. That is the
"huge empty area": the whole top right of the page, with the composer starting level with the Demo
card.

🔴 The v3 comment beside that line said `display: contents` had "the same problem". It does not, and
that sentence is why the bug shipped: `contents` makes the children grid items **in the same flow**,
which is only a problem if you leave it on at a width where they should be in one container. Gated
to the phone, it is exactly the right tool.

**(b) A class that never applied, at any width, since it was written.** The same element carried:

```jsx
<div className="grid gap-4 max-lg:grid-cols-1" style={{ gridTemplateColumns: columns }}>
```

An inline style declaration beats any selector-based rule that is not `!important`, and Tailwind
emits none — so **`max-lg:grid-cols-1` has never done anything**. Every width, including a phone,
was handed `380px minmax(0, 1fr) 280px`. ⚠️ `scripts/outreach-workspace-v2.cjs` asserted that class
was *in the file* and passed for two builds while it was inert; after v3 deleted it, that same check
would have gone on passing against the **comment** recording the deletion. Both failures are
restated in place, in that file, with this paragraph as the reason.

### The fix

```ts
export function gridTemplateFor(width: number): string {
  if (width < TWO_COL_AT_PX) return 'minmax(0, 1fr)'
  const wide = width >= WIDE_AT_PX
  const left = `${wide ? COL_LEFT_WIDE_PX : COL_LEFT_PX}px`
  if (width < THREE_COL_AT_PX) return `${left} minmax(0, 1fr)`
  return `${left} minmax(0, 1fr) ${wide ? COL_RIGHT_WIDE_PX : COL_RIGHT_PX}px`
}
```

| width | tracks |
|---|---|
| 390, 767 | `minmax(0, 1fr)` |
| 768, 1023 | `380px minmax(0, 1fr)` |
| 1024, 1440, 1919 | `380px minmax(0, 1fr) 280px` |
| 1920, 2560 | `420px minmax(0, 1fr) 320px` |

One decision, in one place, that a harness can ask directly. The breakpoints and widths are the
approved ones, unchanged.

The markup is now exactly three containers, each a direct child, each top-aligned:

```jsx
<div className="grid gap-4 items-start" style={{ gridTemplateColumns: columns }}>
  <div className="flex flex-col gap-3 min-w-0 max-md:contents">   {/* LEFT */}
    <div className="hidden max-lg:flex max-md:hidden …">  actions, 768–1023 only  </div>
    <div className="max-md:order-1"> <ContactCard …/> </div>
    <div className="max-md:order-2"> <NotesCard …/>   </div>
    <div className="… max-md:order-4"> <DemoCard/> <FilesCard/> </div>
  </div>
  <div className="flex flex-col gap-3 min-w-0 max-md:order-3">    {/* CENTRE */}
  <div className="flex flex-col gap-3 min-w-0 max-lg:hidden">     {/* RIGHT  */}
```

- **No `order` is active at 768px or above.** The old `max-lg:order-*` were live from 0 to 1023 —
  a tablet rule that also had to be beaten below 768. Every remaining `order` is `max-md:`.
- **Above 768px no left-column card is a grid item**: the container is an ordinary flex column.
- **Below 768px** it is `display: contents`, its four cards become the grid items of the single
  track, and they take orders 1, 2, 4 around the centre column's 3 — the v3 phone order, unchanged.

### ✅ Measured in a real browser

`scripts/outreach-workspace-render.cjs` — puppeteer, a `file://` fixture, **no network**. It is
**not the live page** (there is no admin session or database here) and says so: it lifts this page's
**own class names out of `ProspectWorkspace.tsx` with regexes that fail loudly if they stop
matching**, renders them against **this build's compiled stylesheet** from `.next/static`, and puts
filler blocks where the cards go. Where the containers land is then a real layout answer.

```
CONTROL, the v3 structure at 1440×800: contact top 34, centre top 702, demo top 702
  ✓ 🔴 REPRODUCED: the fourth grid item pushes the centre column down 668px, onto row two
  ✓ …level with the Demo card, which is what "a huge empty area" was

1440×800  left 380px @x16  centre 716px @x412  right 280px @x1144
          tops: left 34 · centre 34 · right 34
  ✓ 🔴 the three columns share a top edge — the centre is NOT on row two
  ✓ 🔴 …and that edge is the top of the grid, under the Next banner
  ✓ 🔴 left, centre, right — side by side, in that order
  ✓ ⚠️ the side columns are 380 and 280        ✓ ⚠️ …and the email gets the rest (716px)
  ✓ 🔴 Demo and Files are INSIDE the left column, under the notes
2560×1440 left 420px  centre 696px  right 320px      ✓ 🔴 still one row of three
900×1200  left 380px  centre 472px  right hidden     ✓ 🔴 two columns side by side, top aligned
390×844   one column, in order: contact@34 → notes@270 → centre@706 → demo@1514
  ✓ 🔴 contact, notes, composer + history, then demo and files
  ✓ 🔴 …every card the full width of the phone, with nothing at a fixed 380px
  ✓ 🔴 …and nothing scrolls sideways (overflow 0px)

✅ the layout measures correct
```

🔴 **The control matters more than the eight green ticks.** A fixture that only ever renders the
correct structure proves the fixture can be built. This one renders the **v3** structure first and
requires it to still be broken — 668px of push, reproduced.

🔴 **And the measurement caught its own first mistake.** Its first run reported the phone order
broken. It was not: the fixture had **no viewport meta**, so Chromium laid the mobile emulation out
at its default **980px** layout viewport while the numbers said 390. The fixture now carries
`width=device-width`, and a check asserts `app/layout.tsx` still declares the same, so the meta
cannot become a fiction.

### ⚠️ Two things to flag about item 1 as written

1. **"At ≥768px … three column containers side by side."** The DOM is exactly that at every width
   ≥768, and all three are top-aligned. What is *visible* at **768–1023** is **two** of them side by
   side, because the right column is `max-lg:hidden` and its cards render at the top of the left one
   — v2's approved behaviour, which "change nothing else" keeps. I did **not** move the column-count
   breakpoint down to 768: three fixed tracks in a 768px window leaves the email **44px**. The
   measured 900px case above shows what that band actually does.
2. **First paint.** `vw` starts at 1440 and is set from `window.innerWidth` in an effect on mount,
   which runs long before the prospect data arrives and the grid renders. If the data were ever
   served synchronously, a phone would get one desktop frame.

---

## 2 · One notes area

**Gone:** `AboutCard` (the `notes` column, 6 rows, Save) and `AddNoteCard` (3 rows, Save note).
Both are deleted, with tombstones. **In their place, one card titled "Notes":**

```
NOTES
┌──────────────────────────────────────────────────────────┐
│ Add a note…                                              │   10 rows, grows, full width
│                                                          │
└──────────────────────────────────────────────────────────┘
[ Save note ]
──────────────────────────────────────────────────────────
28 SEP 2026   Rang — he is at Boxpark on Fridays, said to
              try after 3pm. Wants to see the plans PDF
              before he commits to anything.
16 SEP 2026   Sent first contact.
              Show all 9
──────────────────────────────────────────────────────────
EARLIER NOTES                                        ✎ Edit
Ask for Stephen, not the number on the website.
```

- **The box** floors at `NOTE_BOX_ROWS = 10` and grows with `field-sizing: content`; placeholder
  **"Add a note…"**; **Save note** writes through the existing **`add_note`** path into
  `outreach_events`, and the note appears in History exactly as before.
- 🔴 **The same single id, `hg-add-note`.** The **N** shortcut and the phone bar's **Note** button
  scroll to and focus this box. One id is why they cannot disagree.
- **The saved notes** stand under it, **newest first**, each with its date and its **full text** —
  `whitespace-pre-wrap`, no truncation, because a note is already the short version of something.
  `NOTES_SHOWN = 5`, then **"Show all *n*"**.
- ⚠️ The list is a **view over the timeline already loaded** (`timeline.events`, `kind === 'note'`),
  not a second fetch and not a second store — the same relationship `FilesCard` has to it.

### The `notes` column, kept

🔴 **Nothing is migrated, copied, cleared or converted.** The column is read exactly as before and
appears as the **last entry, labelled "Earlier notes"**, read-only until **✎ Edit**, then Save
through the page's one prospect patch — `onPatch({ notes: text || null })`, the identical write
`AboutCard` made. **Empty ⇒ it renders nothing at all**, because an empty box labelled "Earlier
notes" is an invitation to write a note in the wrong place.

The outreach **list** reads that same column and is untouched. The harness pins all of it: the
column is written in **exactly one place** on the page, `add_note` **never carries `p.notes`**, and
a variant that clears the column on Save is caught.

---

## 3 · The contact card

The card repeated itself: the number already had a Call button beside it, and directly underneath
sat a second, larger **Call** — two controls, one action, 4px apart.

- **Above 768px the row is gone.** `className="hidden max-md:flex items-center gap-2 mt-1"`.
- **The small Call button beside the number is unchanged**, and so is what it does: a detached
  `<a href="tel:+44…">` created, clicked and removed — no copy, no pointer branching, no navigation.
  The number stays plain selectable text.
- **Below 768px the three large Call / WhatsApp / Email buttons are exactly what they were.** The
  row is hidden, not deleted; all three keep their 44px targets. The Email button lost its own
  `hidden max-md:block`, because the row is now the gate and two gates for one rule is a thing that
  later gets half-changed.
- **No second WhatsApp button** anywhere on the card — the page has exactly one `wa.me` link and it
  is the phone row's.
- **The 52px this freed** (44px button + `mt-1` + the card's `gap-1`) is why the Notes card starts
  higher in the left column.

⚠️ **One consequence, stated rather than worked around.** The WhatsApp **tab** and the **"WhatsApp
sent"** one-click log both *record* a WhatsApp; the only control that *opens* WhatsApp for this
number was that row's link, so above 768px there is now no one-click way to open WhatsApp Web from
this page. That follows directly from "add no other WhatsApp button to the card", so I have not
added one — but if opening the chat from a laptop turns out to matter, the place for it is the
WhatsApp tab, not the card.

---

## 4 · The harness

`scripts/outreach-workspace-v3-fixes.cjs` — **NEW**, registered (67 harnesses), **65 checks**, **10
broken variants**, no network, no mailbox, no database.

```
── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────
✓ FAILED as required  V1 🔴 the Demo/Files cards are their own grid item again — the bug this build fixes
✓ FAILED as required  V2 the tablet order flip comes back, and is active at 768–1023
✓ FAILED as required  V3 🔴 the `notes` column is CLEARED by its own Save instead of written
✓ FAILED as required  V4 🔴 "Earlier notes" renders an empty box when the column is empty
✓ FAILED as required  V5 the saved notes are truncated to one line each
✓ FAILED as required  V6 the large Call and WhatsApp buttons are back on every screen
✓ FAILED as required  V7 🔴 the row is hidden EVERYWHERE — the iPhone loses its three thumb targets
✓ FAILED as required  V8 🔴 the compact button went with the big one — a laptop cannot ring anybody
✓ FAILED as required  V9 🔴 a phone is handed the three-column grid — which is what the dead class allowed
✓ FAILED as required  V10 the note box is three rows again

── 1 · THE TRACKS, FROM ONE FUNCTION ───────────────────────────────────────────────────
  ✓ 🔴 a phone (390) gets ONE track   ✓ 767 still a phone   ✓ 🔴 768 is two columns   ✓ 1023 too
  ✓ 🔴 1024 is three   ✓ 1440 is the same three   ✓ ⚠️ the sides step up at 1920, and only there
  ✓ 🔴 the note box floors at ten rows   ✓ five notes before "Show all"
  ✓ ⚠️ the approved breakpoints and widths are unchanged   ✓ 🔴 EMAIL_FRAME_SANDBOX untouched

── 1–3 · THE PAGE ──────────────────────────────────────────────────────────────────────
  ✓ 🔴 the grid has EXACTLY three direct children      ✓ 🔴 no `gridColumn` anywhere
  ✓ 🔴 every container is aligned to the top           ✓ 🔴 no `order` active at 768px or above
  ✓ ⚠️ the dead `max-lg:grid-cols-1` is gone
  ✓ 🔴 the left column is one container… ✓ ContactCard ✓ NotesCard ✓ DemoCard ✓ FilesCard inside it
  ✓ 🔴 the phone order is `max-md:contents`            ✓ contact, notes, centre, then demo and files
  ✓ 🔴 "About this truck" is gone   ✓ 🔴 …and so are both components it was made of
  ✓ 🔴 one Notes card, titled "Notes"  ✓ 🔴 ten rows and grows  ✓ full width  ✓ "Add a note…"
  ✓ 🔴 the SAME `add_note` path       ✓ ⚠️ the one id the shortcut and the phone bar focus
  ✓ 🔴 the saved notes, newest first  ✓ each in full, no truncation  ✓ five, then "Show all"
  ✓ ⚠️ a VIEW over the timeline already loaded, not a second fetch
  ✓ 🔴 the `notes` column kept as "Earlier notes"  ✓ 🔴 invisible when empty  ✓ 🔴 shown in full
  ✓ 🔴 …written the SAME way, in exactly ONE place  ✓ 🔴 nothing copies it into a note
  ✓ 🔴 the compact Call is still beside the number  ✓ 🔴 …and calls exactly as v3 does
  ✓ 🔴 the LARGE row renders only below 768px       ✓ 🔴 …hidden, not deleted: three 44px targets
  ✓ 🔴 no second gate on Email   ✓ 🔴 exactly one wa.me on the page
  ✓ 🔴 one `nextStep` · one contact writer · one `applyFollowUp` · one stage control
  ✓ 🔴 do_not_contact still moves only on a click   ✓ 🔴 the phone's sticky log bar untouched

✅ all 65 passed
```

`scripts/outreach-workspace-render.cjs` is **excluded from the sweep, with the reason written into
`harnesses.json`**: it needs a completed build and a local Chromium, and a sweep that silently skips
when either is missing is a sweep that reports green for a layout nobody measured. Run it directly,
or set `HG_RENDER=1` on the harness above.

### Stale checks, restated in place with their reasons

**`outreach-workspace-v2.cjs` — three**, replaced by two that are true:
*"below 1024px it is one grid column…"* (the class that never applied — see §1b),
*"…with the centre column FIRST and the reference column second"* (no tablet flip any more),
*"fixed sides, fluid centre — an inline style…"* (`minmax(0, 1fr)` moved into the lib).

**`outreach-workspace-v3.cjs` — six on the notes**: *"the standing notes are a labelled 'About this
truck' box…"*, *"…of six rows…"*, *"…with a confirmation after Save"*, *"and 'Add a note' is always
visible beneath it"*, *"…writing through the existing note path"* (`prospect_id: prospectId`), and
the `notes`-column write, which moved. **Two on the layout**: *"fixed sides, fluid centre, from
those constants"* and *"…and the step is read from the window"*, both of which pinned the inline
template string and are now asserted against `gridTemplateFor` at seven widths.

**`outreach-crm-today.cjs` — one, and it had been lying.** *"the standing notes field is still
labelled Pinned notes"* read the **raw** page. v3 renamed that field, left a tombstone quoting the
old label, and the check went on passing **against the comment about its own deletion**; it only
failed today because this build rewrote that tombstone. It now reads stripped source and asserts
what it was always for: the standing `notes` column still has a field on the page.

---

## 5 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 4.9s`, 96 static pages |
| eslint — `ProspectWorkspace.tsx`, `outreach-workspace.ts` | **0 problems, identical to HEAD** (checked against a `git worktree` of HEAD) |
| `node scripts/outreach-workspace-v3-fixes.cjs` | **65 checks, all passed**, 10 variants caught |
| `node scripts/outreach-workspace-render.cjs` | **all measurements correct**, control reproduced |
| `node scripts/run-harnesses.cjs` | **67 run · 67 passed · 0 failed** |
| goldens | `8bdae817…82f32660` and `e3f0a880…14d6b29222` ✅ unchanged |

No email sent. No SQL run. No `outreach_templates` or `outreach_snippets` row created, edited,
seeded or deactivated. No schema or data change. No live trading truck involved. One send path, one
contact writer, one follow-up writer, one `nextStep`, `EMAIL_FRAME_SANDBOX` unchanged.

---

## 6 · Commit and deploy evidence

**Commit `303a260`**, on `main`, pushed to `origin/main` (`9d6a0e7..303a260`). Eight files: two new
(the harness and the render module), six changed.

```
fingerprint at push:  4b2ad283b6524105d720dbf0f226fe54
14:21:42Z poll 1:     4b2ad283b6524105d720dbf0f226fe54
14:22:03Z poll 2:     4b2ad283b6524105d720dbf0f226fe54
14:22:23Z poll 3:     4b2ad283b6524105d720dbf0f226fe54
14:22:43Z poll 4:     4b2ad283b6524105d720dbf0f226fe54
14:23:04Z poll 5:     abbe150d8c7dbf09dc49c4b25bc657fa     ← DEPLOY LANDED
```

`GET https://www.hatchgrab.com/admin/outreach/p/a5beca7f-…` → **200** at 14:23:10Z, the page shell
rendering "Loading…". The shell holds no authority; `verifyAdmin` refuses the API and the page then
says so.

---

## 7 · What to test — ZZ Test Prospect (Dominic) only

`a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`. Nothing below touches another prospect.

### 16" MacBook Pro

1. **Open it.** ① The composer and the History start **level with the contact card**, immediately
   under the Next banner. No empty band across the top right.
2. **Left column**: contact, then **Notes**, then Demo, then Files — all in one column, nothing
   stranded beside the composer.
3. ② The **Notes** box is about ten lines tall and empty, placeholder "Add a note…". Type a couple
   of lines, **Save note** — it appears immediately in the list under the box **and** in History.
4. ② Below the list: **Earlier notes** with whatever "About this truck" held, in full. Click **✎
   Edit**, change a word, **Save** — reload and it is still there. Then check the **outreach list**
   still shows that same text for this prospect.
5. ② Press **N** (not while typing) — the caret lands in the note box.
6. ③ The contact card has **one** Call button, beside the number. Click it: FaceTime / your iPhone
   should ring. No copy, no blank tab, no page reload, and a half-written email survives it.
7. ③ There is **no** large Call or WhatsApp button under the number.

### 27" monitor

8. ① Same three columns, sides at **420 / 320**, everything still top-aligned on one row.

### iPhone

9. ①② In order down the page: **contact card** (with the three large **Call · WhatsApp · Email**
   buttons, unchanged), **Notes**, then tabs + composer + History, then **Demo** and **Files** last.
10. ③ **Call** dials. ② The sticky bar's **Note** button scrolls to and focuses the note box.
11. Nothing scrolls sideways at any point.
