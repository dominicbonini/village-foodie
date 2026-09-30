# The prospect workspace, reworked to the approved three-column design

**30 September 2026 · commit `3b36b6d` · deployed and serving on production at 12:26:53Z**

The page built yesterday put the prospect on one screen but kept the work behind clicks: four buttons
and nothing open, a composer that had to be summoned, an editor in a fixed 352px box, and an opened
email in a 320px letterbox. This is the layout Dominic signed off — every common action visible
without revealing it, emails readable and writable at full length, one layout for a laptop and a 27"
monitor, and a phone layout.

**Layout and interaction only.** Every rule, refusal and guard is the one that was already there.

---

## 1 · What changed

| | Before (yesterday's page) | Now |
|---|---|---|
| **Columns** | two — left 30% reference, right 70% work | **three** — fixed ~300px left, fluid centre, fixed ~300px right (340/330 past 1800px) |
| **Tablet** | the same two, stacked | **two** — the right column's cards move to the **top of the left** one |
| **Phone** | stacked, desktop controls | **a phone layout** — three big buttons, two-line history rows, a sticky log bar |
| **Composer** | closed; `[Email]` revealed it | **always open**, as the first of four tabs, pre-set from the Next line |
| **Template** | a `<select>` | **chips**, step's first, `More ▾` for the rest, selected one filled dark |
| **To / Subject** | two stacked labelled fields | **one line**: To · subject · thread note · Show conversation |
| **Editor** | fixed `min-height: 22rem` in a fixed box | **grows with the email**; ~8-line floor, scrolls only past 75% of the window; **⤢** opens a full-window writing view |
| **An opened email** | `h-80` — 320px, always | **sized to its content**, capped at 80% of the window, **quoted history collapsed**, ⤢ full screen |
| **Logging a call** | a tab, six controls, and a kind that defaulted wrong | **four one-click buttons** with a derived kind and an 8-second **Undo** |
| **Follow-up** | inside each form, more than once | **one control**, right column, feeding Send, one-click and the tabs |
| **Stage** | the header pill *and* a select in the edit card | **the header pill only** |
| **Next line** | a sentence with a button | **an amber banner**, action + overdue in bold, facts small, **no button** |
| **Call / WhatsApp** | `tel:` link inside a line of text | **buttons** — and Call no longer hands a laptop off to FaceTime (§7) |
| **Demo** | a card with a chip | **compact**: path, then Copy · Insert in email · Rebuild; expiry only within 7 days |
| **Orange** | Save, Add note, Edit, Reply, Send | **Send and the Next banner only** |

---

## 2 · The composer's default

[`composerDefault`](../lib/outreach-workspace.ts) reads the **same `NextAction` the banner renders** —
nothing is derived twice:

| Next line says | Composer opens as |
|---|---|
| a waiting reply | **reply mode on that message** (`replyToMessageId`) |
| a due chase | that rung, turned into a template by **`templateForStep`** |
| a follow-up, or a prospect who has replied | the existing thread (the `threadParent` rule), **Blank** |
| nobody emailed yet | a new thread on the **first-contact** template |

🔴 **It calls no derivation of its own** — the harness censuses the function for `nextStep(`,
`needsAttention(` and `followUpDateFor(` and shows the same census failing on a version that has one.
The page still calls `nextStep` **exactly once**.

---

## 3 · The one-click kind — and the bug it fixes

[`oneClickKind(step, hasReplied)`](../lib/outreach-workspace.ts):

1. **they have replied ⇒ `reply`** — their reply already ended the sequence; a rung would restart it.
2. **mid-sequence (due or scheduled) ⇒ the rung `nextStep` says is next** — read, not redone.
3. **anything else** (complete, stopped, unreadable) **⇒ `reply`** — recognised, and not a rung.

🔴 **This is a fix, not a new rule.** The log form defaulted to the first rung whenever nobody touched
the dropdown, so **a call to a prospect who had already replied was recorded as a first contact** — and
§57 derives the next step from exactly that column. §57.3 records the same failure from the template
path. The harness asserts that **every kind this can return is one `nextStep` recognises**, so it can
never write the blind row that makes a step `unknown`.

Each button writes one contact through the existing `log_contact` path (today, outbound, the button's
own words as the message), applies the follow-up date, and offers **Undo for 8 seconds** — which
deletes **that contact by the id the write returned**, never "the most recent one".

---

## 4 · One follow-up control

Right column: **Tomorrow · +3 days · +1 week · Pick · None**, the resulting date on the selected chip.

🔴 **Its default is whatever `followUpDateFor` would have written** for the action being taken — that
function is *passed into* `defaultFollowUpChoice`, so this module cannot own a second table of
intervals. A date no chip matches selects **Pick, holding that exact date**, never a chip that rounds
it.

🔴 **It is the single source** for Send (whose label reads `Send · follow up 3 Oct`), the four
one-click buttons and the Call/WhatsApp tabs. The chosen date reaches the server through
`applyFollowUp`, the page's one caller of the one writer of `next_action_at`.

⚠️ **The census names the second assignment rather than hiding it.** There are two places on the page
that write that column: `applyFollowUp`, and the delete-contact path, which **reverts** the date a
deleted rung implied and only when the stored value still equals exactly that. The second is an undo
of an earlier write, predates this build, and stops a future date pointing at a contact that no longer
exists. A third would fail the harness.

---

## 5 · Sizing the email frame, and why `allow-same-origin` without scripts is safe

The frame reports its own `document.body.scrollHeight` on load and on resize, and
[`frameHeight`](../lib/outreach-workspace.ts) sets it: **its own height, capped at 80% of the window**,
floor 120px. Above the cap it scrolls internally — a frame taller than the window would make the
*page* scroll past the row it belongs to, taking that row's buttons with it.

🔴 **Measuring requires the origin.** A frame with an opaque origin cannot expose its document at all,
so `sandbox=""` and "size this to its content" are mutually exclusive. `allow-same-origin` gives the
frame our origin back **and nothing else**:

- There is **no `allow-scripts`**, so nothing in the document can run — and a document that cannot run
  code cannot *use* an origin. The two tokens are dangerous **together**; that pair is what lets a
  frame remove its own sandbox.
- There is no `allow-forms` and no `allow-popups`: a quoted email can carry a form, and an email we
  are only reading has no business submitting or opening anything.

The value is `EMAIL_FRAME_SANDBOX`, a constant, with `sandboxIsSafe` and a broken variant standing on
it — so adding `allow-scripts` fails the harness rather than a code review.

**Quoted history** is split off best-effort by [`splitQuotedHtml`](../lib/outreach-quote-split.ts):
Outlook's `divRplyFwdMsg`, our own reference block, `gmail_quote`, `blockquote[type=cite]`, and —
loosest, and requiring **both** signals — Outlook's rule-line *with* a bolded `From:` inside it.
🔴 **No marker found ⇒ the whole email is shown**, and an email that is *only* a quote is shown whole
rather than as an empty message: hiding something a prospect wrote is the one failure worth avoiding.

---

## 6 · The phone (<768px)

- Header: Back, name, Stage pill, ‹ n of m › — all ≥44px; Website/Schedule links drop off.
- The Next card, then the contact card with **Call · WhatsApp · Email** as three large buttons.
- Pinned notes, then the tabs and the composer (Email fills the column).
- History rows are **two lines** — subject · date on the first, the text on the second — because one
  truncated line at 375px shows about four words.
- A **sticky bottom log bar**: No answer · Spoke · Voicemail · Note, each ≥44px, with a spacer so it
  never covers the last row.
- **Today** stacks each section as cards with full-width tap targets; **All prospects** replaces the
  1321px table below `md` with a list of name · stage · next step. The table itself is untouched — it
  is simply not rendered at a width it cannot work at.

---

## 7 · The Call button (asked for mid-build)

> *"add a call button next to the phone number. i dont want to select it like a link. and it shouldn't
> minimise the screen when selected"*

🔴 **A `tel:` link is the wrong control on a laptop.** Clicking one hands the URL to a protocol handler
— FaceTime, or a "choose an application" dialog — which takes focus off the browser: the window
appears to minimise, and whatever was being written is behind something else.

`CallButton` is a **`<button>`**, beside the number, and the number itself is now plain selectable text:

- **On a handset** (`(pointer: coarse)`) it dials, via `location.href` — not `window.open`, which
  leaves a blank tab behind on every call.
- **On a desktop** it **copies the number** and says `Copied`. No navigation, no protocol handler, no
  lost focus.

⚠️ The test is the **pointer, not the window width**: a touch laptop is still a laptop with no SIM, and
a narrow window on a desktop is still a desktop. It is read after mount, because `matchMedia` does not
exist while Next renders on the server.

---

## 8 · The harness

`scripts/outreach-workspace-v2.cjs` — **NEW**, registered (65 harnesses), **116 checks**, no network,
no mailbox, no database.

### Broken variants — shown FAILING first

```
✓ FAILED as required  V1 a call to a prospect who has replied is logged as a FIRST CONTACT
✓ FAILED as required  V2 a stopped step yields a null kind — an unreadable contact row
✓ FAILED as required  V3 a waiting reply does not open the composer in reply mode
✓ FAILED as required  V4 the chip ignores the one interval rule and invents its own
✓ FAILED as required  V5 the email frame is given allow-scripts alongside allow-same-origin
✓ FAILED as required  V6 a 9000px email gets a 9000px frame
✓ FAILED as required  V7 an email with no quote marker is hidden behind Show quoted text
✓ FAILED as required  V8 an email that is nothing but a quote is shown as an empty message
```

### What it proves

```
── THE COMPOSER OPENS ON WHAT THE NEXT LINE SAYS ────────────────────────────────────────
  ✓ 🔴 a waiting reply ⇒ reply mode, on THAT message
  ✓ 🔴 a due chase ⇒ that step's rung, which `templateForStep` turns into a template
  ✓ 🔴 nobody emailed yet ⇒ a new thread on the first-contact template
  ✓ 🔴 `composerDefault` calls no derivation of its own…
  ✓ ⚠️ …and the same census FAILS on a version that does

── ONE CLICK WRITES ONE CONTACT, WITH THE RIGHT KIND ────────────────────────────────────
  ✓ 🔴 they have replied ⇒ `reply` — NOT a rung, so the sequence is not restarted
  ✓ 🔴 mid-sequence ⇒ the rung `nextStep` says is next
  ✓ ⚠️ a finished sequence / an unreadable history ⇒ `reply`, rather than guessing a rung
  ✓ 🔴 every kind it can return is one `nextStep` recognises
  ✓ 🔴 Undo deletes EXACTLY the contact just written, by the id the write returned

── ONE FOLLOW-UP CONTROL ────────────────────────────────────────────────────────────────
  ✓ 🔴 a first contact defaults to the chip matching the ladder's own +3
  ✓ 🔴 a date no chip matches selects Pick HOLDING that date
  ✓ 🔴 exactly two assignments of `next_action_at`, and both are accounted for
  ✓ 🔴 the chosen date is written ONLY by `applyFollowUp`, from the one control
  ✓ 🔴 the old per-form follow-up pickers are gone

── THE EMAIL IS READABLE AT FULL LENGTH ─────────────────────────────────────────────────
  ✓ 🔴 one token, and it is not allow-scripts   ✓ 🔴 …and rejects allow-forms / allow-popups
  ✓ 🔴 a long one is capped at 80% of the window, then scrolls inside
  ✓ 🔴 the fixed 320px box is gone
  ✓ 🔴 the editor has no fixed height at all   ✓ 🔴 …the only ceiling is 75% of the WINDOW
  ✓ and ⤢ opens the writing view   ✓ …and Esc returns

── THE NEW PART OF AN EMAIL, FIRST ──────────────────────────────────────────────────────
  ✓ 🔴 divRplyFwdMsg / our reference block / gmail_quote / blockquote[type=cite] / rule-line all split
  ✓ 🔴 no marker ⇒ no split, and the WHOLE email is shown
  ✓ 🔴 a bordered signature is NOT mistaken for a quote block

── THE LAYOUT ───────────────────────────────────────────────────────────────────────────
  ✓ 🔴 fixed sides, fluid centre   ✓ three columns from 1024, two from 768
  ✓ 🔴 the right column's cards move to the top of the left one between 768 and 1023
  ✓ 🔴 the phone gets a sticky log bar   ✓ …and its targets are 44px
  ✓ 🔴 no orange BUTTON on the page itself — the one orange button is Send

── THE CALL BUTTON ──────────────────────────────────────────────────────────────────────
  ✓ 🔴 there is no `tel:` anchor left on the page
  ✓ 🔴 it asks whether this is a handset — the pointer, not the window width
  ✓ 🔴 …and on a desktop COPIES the number instead of yanking focus into FaceTime
```

### Five stale anchors, restated

| Harness | Anchored on | Restated as |
|---|---|---|
| `outreach-workspace.cjs` | `followUpDateFor(` absent from the lib | the lib **imports** no derivation — that function is now a *parameter*, which is what makes a second interval table impossible |
| `outreach-workspace.cjs` | `title="Compose an email (E)"` | the action buttons became tabs: `Write an email (E)` |
| `outreach-workspace.cjs` | `sandbox=""` in the shared viewer | 🔴 **a deliberate change**: `allow-same-origin` for measuring, with the forbidden-token test as the stronger assertion |
| `outreach-workspace.cjs` | `<EmailBody rowId={m.id} />` exactly | the viewer gained `onOpenFull` |
| `outreach-mail-poll.cjs` | `sandbox=""` in `EmailBody` | the same restatement, pointing at the v2 harness for the argument |

---

## 9 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 5.0s` |
| eslint — `lib/outreach-quote-split.ts` (new) | **clean** |
| eslint — `ProspectWorkspace.tsx` 0, `ProspectTimeline.tsx` 0, `RichEmailEditor.tsx` 0, `lib/outreach-workspace.ts` 0 | **identical to HEAD (all 0)** |
| eslint — `ComposeWindow.tsx` 3, `outreach-shared.tsx` 2, `OutreachPanel.tsx` 6 | **identical to HEAD** |
| `node scripts/outreach-workspace-v2.cjs` | **116 checks, all passed** |
| `node scripts/run-harnesses.cjs` (run alone) | **65 run · 65 passed · 0 failed** |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` ✅ |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` ✅ |

Zero delta on every changed file. No email was sent, no SQL was run, no template or snippet row was
touched, no live trading truck was involved, and nothing about Brevo changed.

---

## 10 · Commit and deploy evidence

**Commit `3b36b6d`**, on `main`, pushed to `origin/main` (`36197b1..3b36b6d`). Twelve files: two new
(the quote splitter and the harness), ten changed.

**Deployed and serving on production, confirmed 2026-09-30T12:26:53Z.**

```
fingerprint at push:  9134896ab8cc510fb7980c2532ad854c
12:25:12Z poll 1:     9134896ab8cc510fb7980c2532ad854c
12:25:32Z poll 2:     9134896ab8cc510fb7980c2532ad854c
12:25:52Z poll 3:     9134896ab8cc510fb7980c2532ad854c
12:26:12Z poll 4:     9134896ab8cc510fb7980c2532ad854c
12:26:33Z poll 5:     9134896ab8cc510fb7980c2532ad854c
12:26:53Z poll 6:     0267eeb73d3caaf839217b070fd1e280     ← DEPLOY LANDED
```

`GET /admin/outreach/p/a5beca7f-…` → **200**, the page shell rendering "Loading…". The shell holds no
authority; `verifyAdmin` refuses the API and the page then says so.

---

## 11 · Test script — ZZ Test Prospect (Dominic) only

`a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`.

1. **Open it on the laptop, then on the 27" monitor.** Same three columns, same fixed sides; only the
   email column is wider. Nothing moves to a fourth column and nothing re-flows.
2. **Type a long email** into the composer — twenty lines. The box **grows with it**; the page scrolls,
   the editor does not, until you pass about three quarters of the window height.
3. **Press ⤢.** The same editor fills the window with the conversation beside it. **Esc** returns, with
   the text intact.
4. **Click a long received email in the history.** It opens at **full length**, with **Show quoted
   text** hiding the thread underneath. Press it to see the rest; **⤢ Open full screen** for the lot.
5. **Press "Called — no answer".** It logs immediately and shows **Logged "Called — no answer" · Undo**.
   Check the timeline: the kind is `Reply` if this prospect has replied, not "First contact". Press
   **Undo** within 8 seconds — the row disappears.
6. **Press +1 week** in Next follow-up. The **Send button's label changes** to `Send · follow up <date>`,
   and the one-click buttons and the Call tab will use that same date.
7. **Call**: on the laptop it says **Call · copy** and copies the number — the window does **not** lose
   focus. On the iPhone it dials.
8. **Safari on the iPhone**: one column; Call / WhatsApp / Email as three large buttons; the history in
   two-line rows; the **sticky log bar** at the bottom. **Today** is a stack of cards with full-width
   rows, and **All prospects** is a readable list of name · stage · next step.

---

## 12 · What was deliberately not done

- **No Log-as-outbound button in the inline composer.** The page has a Log tab and four one-click
  buttons; two ways to do one thing side by side is what this rework removes. It is still there in the
  portalled window, which has no caller in the app.
- **WhatsApp stays an anchor**, because `wa.me` is an ordinary web URL opening in a new tab — it does
  not hand off to a protocol handler, so it does not have the problem Call had.
- **The quote splitter is best-effort and says so.** It reports which marker split an email, so a wrong
  split is diagnosable rather than mysterious.
