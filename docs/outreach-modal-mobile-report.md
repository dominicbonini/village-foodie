# The outreach prospect modal on a phone

**Built 14 September 2026.** One file changed: `components/admin/OutreachPanel.tsx` — **16 lines, every
one of them adding only `max-sm:`-prefixed classes**. No existing class, no inline style, and no
behaviour was altered. Nothing staged.

⚠️ **I CANNOT SEE A SCREEN.** Every layout statement below is a READ of the style chain, or the output of
a CSS compile. Nothing here was observed rendering. The checklist at the end is the part only Dominic
can do.

---

## 🔴 PREMISES — what was wrong, and what is true instead

1. **"Everything through V13.1 is deployed and the manual update is applied."** The manual update is
   applied to the **working tree but is NOT committed** — `git status` shows `docs/reference-manual.md`
   and `docs/onboarding-flow.md` modified, and `git log` ends at `3a95e9f demo`. The code through V13.1
   *is* committed. Verbatim below.
2. 🔴 **"Logging a contact is the action, the details are reference" — the code says otherwise, and it
   changes the answer to the ordering question you asked me to decide.** READ: the LEFT column carries
   the only tap-to-contact affordances in the modal — `mailto:` on the email row, and a **Call**
   (`tel:${p.phone}`) and **WhatsApp** (`https://wa.me/${waPhone}`) link pair below the phone field. On a
   phone those *are* the action, because the device is the phone. The right column is where you record
   that it happened. **So the details go first**, and the report justifies that below rather than taking
   the framing as given.
3. **§52.9's stacking and Escape rules held exactly as recorded** — re-read this session. **No new layer
   and no new listener was added**, so neither trap was in play. C15 is untouched and still live.
4. **One symptom has a second, independent cause** that the screenshots could not show: the panel is
   `max-h-[calc(100vh-2rem)]`, and on mobile Safari `100vh` is the **largest** viewport. Even with the
   columns fixed, the bottom of a tall modal would sit under the URL bar with no way to scroll to it,
   because the panel itself is `overflow-hidden`. Fixed too (§Phase 1, item 2).

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   docs/onboarding-flow.md
	modified:   docs/reference-manual.md

no changes added to commit (use "git add" and/or "git commit -a")
════
3a95e9f demo
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
9e83a5e migration changes
```

### Scope — everything touched is admin-only

| symbol | where it lives | reachable from |
|---|---|---|
| `OutreachPanel` | `components/admin/OutreachPanel.tsx` | **only** `app/admin/page.tsx` (`<OutreachPanel />`, a tab). `app/admin/outreach/page.tsx` is a server-component `redirect('/admin?tab=outreach')` and renders nothing. |
| `Detail`, `DemoLinkChip`, `HistoryTable`, `ModalThumb`, `DoNotContactToggle`, `WhatsAppBox` | module-local functions **inside** that file | the file exports **only** its default |

🔴 **The one scare, checked and cleared:** a search for `Detail` also hits
`components/dashboard/AddOrderPanel.tsx` and `components/manage/PaymentsTab.tsx` — **both operator
surfaces**. Read in context, both are the English word *"Detail"* inside a JSX comment, not the symbol.
`OutreachPanel`'s `Detail` is declared in that file and used once, in that file.
*Null result:* a search whose pattern never matches anything. *Positive control over the same file set:*
`components/DemoModeBanner` is genuinely shared and comes back in **5** files.
⚠️ `InlineField`, `ConfirmDeleteDialog`, `ScheduleEventsPopup` and `ComposeWindow` **are** shared — but
only among other **admin** components (`EventRowCells`, `DiscoveryEventsPanel`, `CreateDemoModal`). **None
was edited.**

---

# PHASE 0 — DIAGNOSIS

## 0a · The layout chain, and the element that clips

```
overlay   fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4
 panel    bg-white rounded-2xl w-full max-w-6xl flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden
  header  flex items-center gap-3 px-5 py-3 … flex-shrink-0
  meta    flex items-center gap-5 px-5 py-2 … flex-shrink-0 text-xs
  body    flex-1 min-h-0 grid gap-5 p-5   style={{ gridTemplateColumns: '45fr 55fr' }}
           └ <Detail> returns a FRAGMENT of two divs → they are the two grid items
```

🔴 **THE COLUMN IS LAID OUT OFF-CANVAS AND CLIPPED. IT IS NOT "not rendered".** That distinction matters
because the two need opposite fixes, and it is settled by reading the chain rather than the screenshot:

- **The clipping element is the panel**, by `overflow-hidden` — and it is `overflow-hidden` on purpose
  (*"THE MODAL ITSELF NO LONGER SCROLLS … the ONLY scrollable region inside it is contact history"*), so
  overflow is clipped **with no scrollbar in either axis**. That is exactly Dominic's *"cannot be seen
  even with scrolling"*.
- **The declaration that forces the overflow is the inline `gridTemplateColumns: '45fr 55fr'`.** A bare
  `45fr` is `minmax(auto, 45fr)`, so **a grid track will not shrink below its content's min-content
  width**. Both tracks have hard floors:
  - **Left:** `HistoryTable` is `w-full table-fixed` over a `<colgroup>` of **fixed pixel widths** —
    `date 104 + dir 86 + stage 132 + view 46 = 368px` before padding, with `channel` set to `undefined`
    (*"auto: absorbs the remainder"*). At 390px the body's content box is ≈ 318px, so **there is no
    remainder**: Channel collapses to zero and the rest overflow. That is the missing CHANNEL column.
  - **Right:** the log form's rows are `whitespace-nowrap` chips and a four-button follow-up row.
- Their sum exceeds the panel, so the grid overflows to the right and the panel cuts it off. Everything
  Dominic listed falls out of that one mechanism: the right column gone, the meta strip cut mid-word at
  *"LAST CONTACTE"*, the demo link (which lives in the meta strip's `ml-auto` group, i.e. **furthest
  right**) never visible at all, and the WA box half off the edge.
- **The blank white space below NOTES** is the same cause seen from the other side: the grid row's height
  is set by the **taller** track (the right column), and the left column is shorter, so the leftover is
  empty. It is not a spacing bug.
- **The title collapsing to "B…"**: `<h3 … truncate min-w-0>` sits in a nowrap flex row whose other
  children are `whitespace-nowrap` links and a `flex-shrink-0` nav group, so the `h3` absorbs *all* the
  shrinkage.

⚠️ 🔴 **AN INLINE STYLE CANNOT BE OVERRIDDEN BY A MEDIA QUERY.** `grid-template-columns` is set inline, so
no `max-sm:grid-cols-1` could ever beat it. The fix had to change `display` instead — see Phase 1.

## 0b · Height and scroll model

The panel is `max-h-[calc(100vh-2rem)]` and `overflow-hidden`; the **only** scroller is the history box
(`min-h-0 shrink overflow-y-auto`). 🔴 On mobile Safari `100vh` is the **largest** viewport (URL bar
hidden), so the panel may be taller than what is visible while the overlay centres it — and with
`overflow-hidden` and no scroller, **the bottom is unreachable by any gesture**. Same latent class as the
KDS's `max-h-[85vh]` (reported, not fixed, in the KDS report).

## 0c · Existing breakpoints in this component

**There are none.** The only `sm:` in the file is the word inside a comment: *"⚠️ DESKTOP ONLY, as
briefed — no sm: breakpoints, no mobile stacking."* So this change introduces the first responsive system
here, and the house convention it follows is the app's existing `sm:` (640px) phone boundary —
`sm:flex-row` is already used in 8 files, `sm:grid` in 2.

## 0d · Safe areas and the keyboard — REPORT ONLY

- **Safe areas: not accounted for, and it does not currently matter here.** Searching the file for
  `safe-area-inset` / `env(` returns nothing. The modal is centred with `p-4` inside `fixed inset-0`, so
  on a notched phone in portrait the padding keeps it clear of both the notch and the home indicator —
  **as long as the panel is shorter than the safe viewport**, which item 2 of the fix now guarantees via
  `dvh`. A landscape phone, where the side insets bite, is the untested case.
- **The on-screen keyboard: not accounted for.** No `visualViewport` listener and no `scroll-into-view`
  on focus anywhere in the file. With the body now scrollable below `sm`, iOS's own
  scroll-focused-input-into-view applies, which it could not do before (the ancestor was
  `overflow-hidden`, and Safari cannot scroll what has no scroll container). **Improved but unverified** —
  checklist P2.

---

# PHASE 1 — THE FIX

**Mechanism, and why this shape:** every change is an **added `max-sm:` class**. Compiled locally,
`max-sm:` emits `@media (width < 40rem)` and `sm:` emits `@media (width >= 40rem)` — exact complements.
So the new classes are **inert at ≥ 640px by construction**, and no existing class had to be rewritten
mobile-first. That is what makes the desktop proof structural rather than a comparison of renderings.

| # | symptom | change | element |
|---|---|---|---|
| 1 | 390px is tight | `max-sm:p-2` | overlay |
| 2 | 0b — bottom unreachable on iOS | `max-sm:max-h-[calc(100dvh-1rem)]` | panel |
| 3 | title "B…" | `max-sm:flex-wrap max-sm:gap-y-2 max-sm:px-4` + `max-sm:w-full max-sm:order-first` on the `h3` | header |
| 4 | "LAST CONTACTE"; demo link absent | `max-sm:flex-wrap max-sm:gap-x-4 max-sm:gap-y-2 max-sm:px-4`, and `max-sm:ml-0 max-sm:w-full max-sm:flex-wrap max-sm:gap-y-2` on the `ml-auto` group | meta strip |
| 5 | iOS zoom | `max-sm:text-base max-sm:py-1.5` | stage `select` |
| 6 | 🔴 **right column unreachable** | `max-sm:flex max-sm:flex-col max-sm:overflow-y-auto max-sm:p-4` | body |
| 7 | stack compressing instead of scrolling | `max-sm:shrink-0` (+ `max-sm:pr-0` left) | both column roots |
| 8 | iOS zoom, 10 controls | `max-sm:text-base max-sm:py-2` | `fieldCls` |
| 9 | iOS zoom | `max-sm:text-base max-sm:py-2` | follow-up date input |
| 10 | CHANNEL column lost | `max-sm:overflow-x-auto` + `max-sm:w-auto` on the table | history |
| 11 | demo link row | `max-sm:flex-wrap max-sm:gap-y-1` | `DemoLinkChip` |
| 12 | WA box half off the edge | `max-sm:flex-wrap max-sm:gap-y-1` | phone row |

### 🔴 How #6 works without touching the inline style

`max-sm:flex` changes the body's `display` from `grid` to `flex`. **`grid-template-columns` applies only
to grid containers**, so the inline `style={{ gridTemplateColumns: '45fr 55fr' }}` becomes **inert** below
640px — left in the file, byte-for-byte, and fully in force again at `sm` where `display:grid` returns.
No `!important`, no inline-style edit, no restructure.

The one thing that had to be **proved rather than assumed** is the cascade: `.flex` and `.grid` have equal
specificity, so the later rule wins. Compiled output:

```
165:  .flex {
168:  .grid {
171:  .max-sm\:flex {      ← emitted AFTER .grid, so it wins below 40rem
```

### The column order — details first, and why

**Contact details first, log form second** (which is also DOM order, so reading order and focus order
stay aligned and no `order-*` utilities were needed).

The brief framed the details as "reference" and logging as "the action". **The code says the opposite for
a phone.** The left column holds `mailto:`, `tel:${p.phone}` and `https://wa.me/${waPhone}` — the only
tap-to-contact controls in the modal. On a phone the sequence is *open the prospect → tap Call or
WhatsApp → come back → log it*, so the taps come first and the form is one short scroll below. If you
work the other way round — logging calls you made elsewhere — say so and it is a one-line swap
(`max-sm:order-first` on the right column root); I did not build it speculatively.

### CONTACT HISTORY — horizontal scroll, not a stacked layout

`max-sm:overflow-x-auto` on the container and `max-sm:w-auto` on the table, so the `<colgroup>`'s fixed
widths hold and the table becomes ~368px inside a ~342px viewport — **Channel survives and is reachable by
a sideways swipe**. The alternative, stacking each contact into a card, means rewriting `HistoryTable`'s
row renderer — a restructure the brief forbids, and it would lose the glanceable four-column shape the
V13.1 note says the table was deliberately redesigned into.

### Touch targets

`fieldCls` gains `max-sm:py-2` and the stage select `max-sm:py-1.5`, taking text inputs and selects to
≈40px. 🔴 **Still below ~44px on a phone, and reported rather than silently changed:** the header's
Prev/Next/Close buttons (`px-2 py-1.5`, ≈30px), the `linkCls` chips including **Call** and **WhatsApp**
(`px-2 py-1`, ≈26px), the Copy button on the demo chip, and the WA/Do-not-contact checkboxes (`w-4 h-4`,
16px). None of these is a listed symptom, and enlarging them changes the desktop chrome, so they are a
separate decision — see Open items.

### The traps, not re-introduced

**No new layer and no new listener.** Nothing here portals, nothing sets a `z-index`, and no `keydown`
handler was added — so §52.9's inline-`zIndex` rule and the capture-listener rule were never engaged.
🧪 Confirmed: the keydown-listener count in the file is **2 before and 2 after**, and the file's
`z-` tokens are unchanged.

---

# VERIFICATION

**Instruments, and what each would look like if it proved nothing.**

- 🔴 **A REAL TAILWIND COMPILE**, because this file's own history says a class may silently fail to
  generate (the `z-[85]` incident: *"an arbitrary Tailwind value used by exactly one file may have NO
  GENERATED RULE AT ALL"*). Every `max-sm:` token is extracted **from the edited file**, fed through the
  repo's own `@tailwindcss/postcss` against the repo's `node_modules`, and the output grepped for the
  generated rule. *Null result:* a compile that silently fails and reports everything absent — **which is
  exactly what happened on my first two attempts** (module resolution, then `@import "tailwindcss"`
  resolving outside the repo). It was caught because a **negative control class is compiled alongside and
  must be ABSENT**; when everything was absent, so was the signal.
  **Final run: 21 tokens, all GENERATED, control absent.**
- **A structural desktop differ.** *Null result:* a differ too coarse to notice a changed token.
  *Control:* fed a line where `gap-5` became `gap-4`, it reports `removed:['gap-5'] added:['gap-4']`.
- **A wrap-and-comment-aware control audit.** *Null result:* a line-based grep. **Mine was, first time
  round** — it reported 3 uncovered controls, and all three were artefacts: a `className` on the next
  line, a `>` inside an `=>` arrow ending the join early, and `<select>` matched inside a comment. Fixed
  and re-run.

### 1 · Desktop unchanged — the structural proof

**16 changed lines, 0 unpaired insert/delete, 0 lines altering a desktop token.** Every changed line was
compared token-by-token against `HEAD`: **nothing removed, and every added token starts `max-sm:`.**
Combined with the compiled fact that `max-sm:` emits `@media (width < 40rem)`, the desktop cascade is not
merely equivalent — **the new rules cannot match at ≥ 640px.** This is the "added responsive classes that
apply only below a breakpoint" claim, and the desktop class strings are byte-identical with the new
tokens appended.

### 2 · Every control in OBSERVED, traced by symbol

| observed | now reachable because | symbol |
|---|---|---|
| right column entirely missing | body is `display:flex` below sm → inline grid template inert → children stack | body `div` → `Detail`'s two roots |
| CONTACTED ON / CHANNEL / DIRECTION / KIND | inside the right column root, now stacked and in the scroll | `Detail` right column |
| "Compose from template…", message body | same root | `Detail` right column |
| FOLLOW UP ON + Tomorrow/+3 days/+1 week/Clear | same root | `Detail` right column |
| "Log contact" submit | same root | `Detail` right column |
| blank space below NOTES | gone: no grid row, so no taller sibling to match | body `div` |
| "LAST CONTACTE" cut off | meta strip wraps | meta `div` |
| WA checkbox off the edge | phone row wraps | `Detail` phone `label` |
| CONTACT HISTORY's CHANNEL column | table keeps its colgroup widths inside a horizontal scroller | `HistoryTable` + container |
| **demo link + Copy + expiry + Do not contact** | the `ml-auto` group drops `ml-auto`, takes its own full-width row and wraps | meta strip right group + `DemoLinkChip` |
| title truncating to "B…" | `h3` takes its own full-width row first | header `h3` |

### 3 · Input font sizes — before and after

Audited wrap-and-comment-aware across the modal: **13 controls — 11 text controls and 2 checkboxes.**

| control | HEAD | below 640px |
|---|---|---|
| Stage select (meta strip) | `text-xs` **12px** | **16px** |
| Email, Contact name, Phone | `text-sm` **14px** | **16px** |
| Notes textarea | `text-sm` **14px** | **16px** |
| Contacted-on date | `text-sm` **14px** | **16px** |
| Channel / Direction / Kind selects | `text-sm` **14px** | **16px** |
| Message body textarea | `text-sm` **14px** | **16px** |
| Follow-up date | `text-sm` **14px** | **16px** |
| WA + Do-not-contact checkboxes | no text | no text — cannot trigger zoom |

**Uncovered text controls inside the modal: NONE.** ⚠️ `FilterSelect` (the filter bar **above** the
table, not the modal) is still `text-xs` and will zoom on focus — same class of defect, different
surface, not a listed symptom, **not changed**.

### 4 · Nothing else changed

`git status --porcelain` → `M components/admin/OutreachPanel.tsx` plus the two **pre-existing**
uncommitted manual files from the V13.1 update. Diffstat for this task: **1 file, 16 insertions, 16
deletions** — a 1:1 line replacement, which is the same fact the desktop proof rests on.

### 5 · tsc and lint

`tsc --noEmit -p .` exit **0**. ESLint on the file: **rule-for-rule identical to HEAD**.

---

# Open items — reported, not built

1. **Touch targets below ~44px** on a phone: header Prev/Next/Close, the `linkCls` chips (**Call** and
   **WhatsApp** among them — the two most likely to be tapped on a phone), the demo-chip Copy button, and
   the two 16px checkboxes. Enlarging them changes desktop chrome, so it needs your call.
2. **`FilterSelect` is `text-xs`** — iOS will zoom on focus in the filter bar above the table.
3. **C15** — two capture-phase `keydown` listeners on `window` between `ScheduleEventsPopup` and
   `ConfirmDeleteDialog`; one Escape still closes both. Untouched, as instructed.
4. **The table behind the modal** was not in scope and was not looked at; if you work the list itself on
   the phone, that is the next thing to check.
5. **Landscape phone safe areas** — the modal has no `env(safe-area-inset-*)` handling; portrait is
   covered by the overlay padding, landscape side insets are not.

---

# 🔴 CHECKLIST — Safari on the Mac, then the real phone

**Develop → Enter Responsive Design Mode (⌥⌘R)**, open `/admin?tab=outreach`, click a prospect.

### iPhone 390 × 844 and 430 × 932 — RDM
- **R1.** The modal is **one column**: contact details (Email, Contact name, Phone, history, Notes), then
  **LOG A CONTACT** below it. Scrolling down reaches the Log contact button.
- **R2.** 🔴 **The demo row is visible** — `/demo/<ref>`, **Copy**, "expires …" and **Do not contact** —
  on its own line under STAGE / UPCOMING / LAST CONTACTED. This is the V13.1 control that was invisible.
- **R3.** "LAST CONTACTED" reads in full, not "LAST CONTACTE".
- **R4.** The truck name is on its own line at the top and reads in full, not "B…".
- **R5.** The WA checkbox and its label are fully inside the screen.
- **R6.** CONTACT HISTORY: swipe the table sideways — **Channel** is there.
- **R7.** Tap into Notes and the message body: both are reachable and the modal does not clip below them.
- **R8.** Now drag the RDM width from 390 up past **640px**: at 640 it should snap back to the two-column
  desktop layout. 🔴 **At 641px and above nothing should look different from today.**
- **R9.** Desktop sanity at 1280 × 800: two columns, 45/55, exactly as before.

### The real phone — RDM cannot answer these
- **P1.** 🔴 **Tap into any text field. The page must NOT zoom in.** That is the 16px change; RDM does not
  simulate it.
- **P2.** With the keyboard up, can you still see the field you are typing in, and scroll the modal?
- **P3.** Top and bottom: with Safari's URL bar showing **and** hidden, is the whole modal reachable —
  specifically the **Log contact** button at the bottom? (That is the `dvh` change.)
- **P4.** Tap **Call** and **WhatsApp** under the phone number — do they fire? They are small (≈26px);
  tell me if they are hard to hit and I will raise them.
- **P5.** Rotate to landscape: does anything sit under the notch or the home indicator? (Known gap, Open
  item 5.)
- **P6.** Press the demo link's **Copy**, then paste somewhere — the clipboard API can behave differently
  in a real Safari than in RDM.

## Closing `git status`, verbatim (nothing staged)

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   components/admin/OutreachPanel.tsx
	modified:   docs/onboarding-flow.md
	modified:   docs/reference-manual.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-modal-mobile-report.md

no changes added to commit (use "git add" and/or "git commit -a")
```
