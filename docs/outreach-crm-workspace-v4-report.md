# Workspace v4 — the reading panel, the email box, and two Safari bugs

**30 September 2026 · commit `569594a` · deployed and serving on production at 15:23:39Z**

Four things, one of which is the answer to "why does the Email tab look like the old composer".
Everything below was measured in **WebKit as well as Chromium** — the v3-fixes run was Chromium
only, and that is exactly how a one-line notes box shipped to a Safari user.

| | before | now |
|---|---|---|
| Email tab, no template | the **non-email** branch: no To line, no Send row, a plain `rows={18}` textarea | the email branch: To line, Send row, the rich editor |
| Send with nothing to send | **no buttons at all** | disabled, with the reason on hover |
| Inline editor | grew with content, uncapped, page scrolled | **fixed 12 lines**, own scrollbar, drag grip, remembered per browser |
| Notes box in Safari | **one line** | ten lines, and it grows |
| Opening an email | expanded in the list, ~5 lines above the fold | a **reading panel** from the right |

**SQL:** none. No schema change, no data change, no row touched.

---

## 0 · Why the Email tab looked pre-v3 — the cause

One `?.`, in `components/admin/ComposeWindow.tsx`:

```ts
const isEmailChannel = selected?.channel === 'email'
```

`selected` is the **selected template**. With **Blank** chosen there is no selected template, so
this was `false` — on the Email tab. Everything gated on it disappeared together:

| gated on `isEmail` | what you saw instead |
|---|---|
| the **To … · subject · Show conversation** line | nothing |
| the **Subject** field (first contact) | nothing |
| the **attachments** row | nothing |
| the **Send test to me** / **Send** row (`isEmail && !sendingOff`) | only the sentence explaining what they would do |
| `RichEmailEditor` | the **WhatsApp textarea** — "Choose a template above, or write here.", `rows={18}`, ~300px, with a grip |

So: not a stale component, not a different route, not an unset recipient. **The composer was
rendering its non-email branch on the Email tab**, and had been since reply mode landed. The
symptoms in the brief map onto it exactly, including the old placeholder and the label
*"Message — exactly what will be sent"*, which is the `!isEmailChannel` label.

🔴 **Why no check caught it.** Every census asked whether the blocks were **in the source**. They
were. Nothing asked which branch *renders* for a blank email — and the v3 report's "the inline
editor is ~6 lines" arithmetic was measuring a box that was not on screen.

### The fix

```ts
const isEmailChannel = (selected?.channel ?? 'email') === 'email'
```

The only caller is the prospect page's Email tab, so the fallback is `email`; a selected **WhatsApp**
template still takes the textarea, which is what that branch is for. The **To line and the Send row
now always render**, and Send says why it is off, in one place and in priority order:

| in order | reason shown on hover |
|---|---|
| sending disabled on this environment | the server's own sentence |
| a WhatsApp template is selected | "This is a WhatsApp message — log it from the WhatsApp tab" |
| nothing written | "Write something, or pick a template, first" |
| no address on the prospect | "This prospect has no email address" |

⚠️ **"Is there anything to send" reads the DOCUMENT, not the template body.** `body` holds the
template render; a hand-typed blank email leaves it empty for ever, so the old `!body.trim()` guard
would have disabled Send permanently the moment this row started rendering for blank emails.

---

## 1 · The email box — fixed, resizable, remembered

- **Fixed height with its own scrollbar.** It no longer grows with the content; the page does not
  grow with the email. Default **12 lines (300px)**.
- **The grip at the bottom right changes it**, and the height is saved in this browser
  (`hg.outreach.composeHeight.v1`, every read and write in `try/catch`) and used on every prospect.
- **Clamped between six lines (156px) and 80% of the window.** A height saved on the 27" monitor is
  *clamped* to the laptop rather than discarded — it is still a real choice. Junk (`abc`, `300px`,
  `0`, `-9`) reads as nothing and the default stands; a hostile `999999` becomes 80% of the window,
  not a Send button below the screen.
- ⚠️ **Only a drag writes.** The height goes to storage when the grip is released *and the height
  changed* — never on a click, a keystroke or a window resize. Persisting on every `ResizeObserver`
  callback would freeze whatever the default was on the first visit and make the default impossible
  to change later without clearing everybody's storage.
- **⤢ still opens the full-window writing view**, still uncapped, Esc still returns.
- ⚠️ Clicking the empty white below the last line focuses the editor — a fixed box is taller than
  its text, and the part below the ProseMirror element would otherwise be dead.

### ✅ The acceptance, measured — not arithmetic

At **1440×800**, a first-contact template loaded, `scripts/outreach-workspace-render.cjs`:

```
            Chromium                         WebKit
 editor     300px                            300px
 Send row   ends at y=587                    ends at y=587
 HISTORY    heading 599–623                  heading 599–623
 rows       4 fully visible (3 required)     4 fully visible (3 required)
 ✓ the editor is exactly its default height, whatever is in it
 ✓ the whole composer including the Send row is on screen
 ✓ …and so is the History heading
 ✓ a long email scrolls inside the editor rather than growing the page
```

🔴 **The v3 check that said the inline editor has no ceiling is now wrong and is restated in place**,
in `scripts/outreach-workspace-v3.cjs`, with this prompt as the reason: v3 removed the cap so a long
email never scrolled inside itself, and what that produced was the Send button and the whole history
below the fold.

---

## 2 · Ten rows means ten rows

`field-sizing: content` is **supported** in both engines — and where it is supported it **replaces
`rows`** and sizes the box to its contents. An empty ten-row note box is therefore **one line**. The
comment beside it claimed the opposite (*"`rows` is the floor everywhere, so nothing depends on that
support"*); it is not a floor, and the shrink is what shipped.

**Reproduced in both engines**, side by side with the fixed box:

```
notes box 242px · the same box WITH field-sizing 37px · this engine implements field-sizing
✓ 🔴 the empty 10-row box is 242px — at least ten lines
✓ 🔴 REPRODUCED: with field-sizing the same box collapses to 37px
```

**Every textarea on the page is now `GrowingTextarea`** (`components/admin/outreach-shared.tsx`):
`rows` is the floor, the growing is five lines of JS, and the floor is **measured from the element's
own computed line-height and padding** rather than guessed — `globals.css` forces 16px on a phone
and `inherit` above 640px, so a hard-coded line height would be wrong on one of them.

| box | rows | was |
|---|---|---|
| Notes — "Add a note…" | 10 | 10 + `field-sizing` ⇒ **1 line** |
| Notes — "Earlier notes" edit | 6 | 6 + `field-sizing` ⇒ **1 line** |
| Log a call / WhatsApp — "What was said" | 2 | 2, no `field-sizing` (unaffected) |
| the composer's WhatsApp box | 8 inline | `rows={18}` |

⚠️ A drag on any of these wins from then on: the auto-size stops touching a box whose height the
operator has set. No `fieldSizing` remains anywhere in `components/`, and the harness bans a raw
`<textarea` on the page so it cannot come back one element at a time.

---

## 3 · The reading panel

Clicking an **email** row opens a panel from the right; **notes, calls, stage changes and
hand-logged contacts still open in place**, because they are one line and there is nothing behind
them.

- **Width `min(55vw, 960px)`** — a pure function, `readingPanelWidth`. 1440 ⇒ 792, 2560 ⇒ 960 (a
  1400px line length is not readable), **below 768 ⇒ the whole screen**, as a sheet with **← Back**.
- **Full height below the page header, with its own scroll.** "Below the header" is measured from
  the header's own bottom edge (`#hg-page-header`), on scroll, through `requestAnimationFrame` —
  not a hard-coded offset.
- **Header:** direction, date, ‹ › , ×, subject, **From** and **To**.
- **Body:** the same `EmailBody` — the one viewer, `EMAIL_FRAME_SANDBOX` unchanged, no scripts —
  keyed by id so stepping refetches rather than showing the previous email's body. **Show quoted
  text** as today, attachments with their download links, and the **"Logged by hand:"** sentence
  above the body where there is one.
- **Buttons, in the footer:** Reply (received, non-test only) — which **closes the panel first**,
  then calls the page's existing `onReply` — plus Mark done, Snooze, Mark as needing reply, log it,
  Save to Sent and Retry. 🔴 They all moved together: a 55vw panel covers most of the history, so a
  control left on the row would have been half behind it.
- **Keyboard:** **Esc** closes (the page's own Escape, one closer, not two that can disagree);
  **↑ / ↓** step to the row above/below, clamped at the ends — 🔴 it does not wrap, because reading
  the same email twice believing it is a new one is worse than stopping.
- **The open row is ringed**, and **focus returns to it** on close.
- 🔴 **A half-written email is never lost.** Opening, stepping and closing change one id; the
  composer is not unmounted and keeps its state. Reply is the only control that touches it.

Two things this uncovered:

- ⚠️ **`tl-<id>` did not exist.** The Files card's "open this attachment's email" called
  `document.getElementById('tl-'+id)?.scrollIntoView()` and no element had ever carried that id —
  it had been returning `null` since it was written. The id is on the row button now, and the panel
  uses the same one to return focus.
- ⚠️ **"Expand all" is now "Expand contacts."** It cannot mean "open fourteen panels"; what it
  expands is the short rows, so that is what it is called.

---

## 4 · Measuring in WebKit

`scripts/outreach-workspace-render.cjs` now runs **Chromium (puppeteer, already in the repo)** and
**WebKit (Playwright)**. Both engines ran; every assertion above passed in both, including the
`field-sizing` collapse, which is the Safari bug this build exists to answer.

⚠️ **Where this could not be done.** It is **not the live page** — there is no admin session or
database in a harness, so the real route cannot be rendered. What is rendered is the page's **own
class names and own numbers**, lifted out of the source by regexes that fail loudly if they stop
matching, against **this build's compiled stylesheet**, with filler where the content goes. The
things it therefore cannot see are behavioural: that ProseMirror focuses, that a drag writes to
localStorage, that the panel's portal lands where it should. Those are asserted by census and by the
"what to test" list below, in the real Safari.

⚠️ **`playwright` was added as a devDependency** (and its WebKit build downloaded, ~78 MB, into
`~/Library/Caches/ms-playwright`). It is dev-only; nothing in the app imports it, and the render
script is **excluded from the sweep** with its reason in `harnesses.json` — it needs a completed
build and local browser binaries, and a sweep that silently skips when either is missing is a sweep
that reports green for a layout nobody measured.

---

## 5 · The harness

`scripts/outreach-workspace-v4.cjs` — **NEW**, registered (68 harnesses), **71 checks**, **12 broken
variants**, no network, no mailbox, no database. `HG_RENDER=1` adds the two-engine measurement.

```
✓ FAILED as required  V1 🔴 the Email tab renders its non-email branch again (the production bug)
✓ FAILED as required  V2 the Send row is hidden again instead of saying why it is off
✓ FAILED as required  V3 🔴 the editor grows with its content again
✓ FAILED as required  V4 🔴 the stored height is used raw — "999999" is obeyed
✓ FAILED as required  V5 🔴 `field-sizing` comes back to the note box — one line in Safari
✓ FAILED as required  V6 the auto-size forgets to reset to `auto` and the box only ever grows
✓ FAILED as required  V7 🔴 an email expands in the list again instead of opening the panel
✓ FAILED as required  V8 🔴 the panel renders the mailbox HTML itself, not through the one viewer
✓ FAILED as required  V9 the panel keeps focus when it closes
✓ FAILED as required  V10 🔴 the panel stepping WRAPS
✓ FAILED as required  V11 🔴 the editor height is no longer clamped to the window
✓ FAILED as required  V12 the panel is a fixed 55% even on a phone — a 214px column
…
✅ all 71 passed
```

⚠️ One census had to be **scoped to the email branch**: `{open && (` is still correct for a contact
row, and a page-wide ban would have outlawed the behaviour being kept in order to assert the one
being removed — the same mistake the v3 `window.open` census made once.

### Stale checks, restated in place with their reasons

| file | check | why |
|---|---|---|
| `outreach-workspace-v3.cjs` | "the inline editor has NO ceiling…" | reversed by item 1, at Dominic's instruction |
| `outreach-workspace-v3.cjs` | "…that grows with what is in it" (`fieldSizing`) | **it was asserting the bug** |
| `outreach-workspace-v3.cjs` | "…shows the logged text when the row is opened" | the row does not open; the panel does |
| `outreach-workspace.cjs` | "the timeline opens an email through that viewer" | `EmailBody` moved into the panel |
| `outreach-crm-today.cjs` | "…which the timeline opens rather than rendering markup of its own" | same move; now asserted across both files |
| `outreach-workspace-v3-fixes.cjs` | "the box floors at NOTE_BOX_ROWS rows and grows" | same floor, different grower |
| `outreach-reply-attach.cjs` | "the timeline's Reply opens the composer on that message" | Reply is in the panel footer and closes it first |

---

## 6 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 5.0s` |
| eslint — all seven changed/new files | **identical to HEAD** (ComposeWindow 2+1, outreach-shared 2, everything else 0 — and `EmailReadingPanel` is 0/0) |
| `node scripts/outreach-workspace-v4.cjs` | **71 checks, all passed**, 12 variants caught |
| `HG_RENDER=1` (Chromium + WebKit) | **all measurements correct in both engines** |
| `node scripts/run-harnesses.cjs` | **68 run · 68 passed · 0 failed** |
| goldens | `8bdae817…82f32660` and `e3f0a880…14d6b29222` ✅ unchanged |

No email sent. No SQL run. No `outreach_templates` or `outreach_snippets` row created, edited,
seeded or deactivated. No schema or data change. No live trading truck involved. One send path, one
contact writer, one follow-up writer, one `nextStep`, `EMAIL_FRAME_SANDBOX` unchanged.

---

## 7 · Commit and deploy evidence

**Commit `569594a`**, on `main`, pushed to `origin/main` (`fc69844..569594a`).

```
fingerprint at push:  379fc4f2ce3a2b7178cb9be1ccfb3044
15:21:57Z poll 1:     379fc4f2ce3a2b7178cb9be1ccfb3044
15:22:17Z poll 2:     379fc4f2ce3a2b7178cb9be1ccfb3044
15:22:37Z poll 3:     379fc4f2ce3a2b7178cb9be1ccfb3044
15:22:58Z poll 4:     379fc4f2ce3a2b7178cb9be1ccfb3044
15:23:18Z poll 5:     379fc4f2ce3a2b7178cb9be1ccfb3044
15:23:39Z poll 6:     bc8bb884b1de683ae82d1bd74436b5e3     ← DEPLOY LANDED
```

`GET https://www.hatchgrab.com/admin/outreach/p/a5beca7f-…` → **200**.

---

## 8 · What to test — ZZ Test Prospect (Dominic) only

`a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`. Nothing below touches another prospect.

### Safari, 16" MacBook Pro

1. **Open it, Email tab, Blank.** ⓪ You should now see the **To … · subject** line, the **rich
   editor** with its B / Small / Insert signature toolbar, and **Send test to me · Send** at the
   bottom right. Hover **Send** with the box empty: *"Write something, or pick a template, first"*.
2. ① The box is about **twelve lines**. Paste a long email — it **scrolls inside the box**; the page
   does not grow and the Send row stays put.
3. ① Drag the **grip at the bottom right** taller. Go to another prospect (J) and back: **the height
   is the one you chose**. Reload: still yours.
4. ① Load a first-contact template: the **History heading and at least 3 rows** are still visible
   without scrolling.
5. ① **⤢** still opens the full-window writing view; **Esc** returns with the text intact.
6. ② The **Notes** box is **ten lines tall when empty** — this is the one that was a single line.
   Type 15 lines: it grows. The **Earlier notes** edit box is six.
7. ③ **Click an email row.** A panel comes in from the right, full height under the header, about
   790px wide. The **left column stays visible**. It shows direction, date, subject, From/To, the
   email in the frame, **Show quoted text**, and attachments if there are any.
8. ③ **↑ / ↓** step through the emails; the arrows grey out at the ends. **Esc** closes, and the row
   you came from is **highlighted and focused**.
9. ③ Type half an email in the composer, then open the panel, step twice, close it: **the draft is
   still there**.
10. ③ On a **received** email, **Reply** — the panel closes and the composer is in reply mode with
    the conversation quoted. On a **sent** email there is no Reply.
11. ③ Click a **call** or a **note** row: it still opens **in place**, no panel.

### Safari, 27" monitor

12. ① The email box opens at the height you last dragged it to **on this machine** — set it taller
    here and confirm the laptop keeps its own.
13. ③ The panel is **960px**, not 55% of 2560.

### iPhone (Safari)

14. ② The Notes box is ten lines, not one.
15. ③ Tapping an email opens a **full-screen sheet** with **← Back** at the top right.
16. ⓪ The Email tab shows the To line and the Send row; the sticky log bar is unchanged.
