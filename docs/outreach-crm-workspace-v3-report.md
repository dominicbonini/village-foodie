# Workspace v3 — the six corrections to v2

**30 September 2026 · commit `7bef71f` · deployed and serving on production at 13:30:05Z**

v2 (`3b36b6d`) put three columns on the screen but kept the things that made the page unusable: the
composer still wore its pop-up chrome and a 22rem empty box, which pushed History off a laptop
screen; the notes were a three-line afterthought; and the Call button refused to call. These are the
six fixes, and nothing else changed.

---

## 1 · The Email tab — History is visible

**What was wrong.** The Email tab rendered `ComposeWindow` whole, inline: a bordered card with a
**"Compose — Pig-Casso's"** heading and a **Close** button, inside a page that already names the
prospect in its header and has tabs to leave with. Three nested frames, two redundant labels, and a
`min-height: 22rem` editor — about sixteen lines of nothing — above them all.

**What it is now**, top to bottom:

```
tabs  Email | Call | WhatsApp
To Stephen Connon  stephen@…  ·  Re: Taking orders online  ·  replies to 16 Sept  ·  Show conversation
[Blank] [Chaser — not listed] [Chase 1] More ▾            [Attach file] [+ Plans PDF]  2 files · 1.4 MB
┌ B  Small  Insert signature  Insert opt-out                                              ⤢ ┐
│ Write here, or pick a template                                                            │
└────────────────────────────────────────────────────────────────────────────────────────── ┘
                                            [Send test to me]  [Send · follow up 3 Oct]
HISTORY   All · Conversation · Notes & changes   [search]  Expand all
↗ 16 Sept  Taking orders online · Are you still taking orders by phone?
↙ 15 Sept  Re: Taking orders online · Yes please — how do I sign up?            Waiting
☎ 14 Sept  chase 1 · rang, no answer
```

- No `role="dialog"`, no heading, no Close, **no card** — `className={inline ? 'w-full flex flex-col' : …}`.
- `space-y-2` instead of `space-y-3`: 84px of gaps between eight blocks was three history rows.
- The attach controls **share the chips' row** on a laptop; the Next banner is **one line**.
- The editor floors at **8.5rem (~6 lines)** with the placeholder *"Write here, or pick a template"*,
  and **has no ceiling inline** — `maxHeight={inline || expanded ? undefined : '75vh'}`. It grows line
  by line and the **page** scrolls. (The floating window keeps its cap: it is `position: fixed` and
  something has to scroll.)

### The 1440×800 acceptance — how I measured it

⚠️ **I have no browser and no admin session, so I did not open Safari.** I measured it as
**arithmetic over the rendered heights in the source** — every number below is a class on an element
(`py-1.5`, `min-height: 8.5rem`, `gap-4`), not an estimate:

| Block | px |
|---|---|
| page `py-3` top · header row · `mb-2` | 12 · 38 · 8 |
| Next banner (`px-3 py-1.5`, one line) · `mb-2` | 26 · 8 |
| tab strip (`py-2` + border) · grid `gap-4` | 38 · 16 |
| To/subject line · `space-y-2` | 20 · 8 |
| chips + attach (one row) · `space-y-2` | 28 · 8 |
| editor toolbar (`py-1.5` + border) | 34 |
| send row · grid `gap-4` | 34 · 16 |
| history controls · `mb-2` · border | 30 · 8 · 2 |
| **chrome total, excluding the editor body** | **312** |

A one-line history row is `py-1.5` + an 18px line + a divider = **31px**.

- **Empty editor** (136px): 448px used → **352px left → 11 rows**.
- **A full first-contact template loaded** (~336px: 11 wrapped lines + 4 spacers at 21.6px): 648px
  used → **152px left → 4 rows**, plus the History heading and its controls, which are already
  counted above.

🔴 **This is why the banner and the attach row were compacted.** Before those two changes the
template case came to 716px used — **2 rows**, one short of the acceptance. The arithmetic is what
found that, and the 68px came back from two rows that were mostly empty space.

---

## 2 · Notes — always present, and bigger

| | Before | Now |
|---|---|---|
| Standing notes | "Pinned notes", 3 rows, saved on blur, no confirmation, placeholder longer than the usual contents | **"About this truck"** — 6 rows, `field-sizing: content`, explicit **Save**, a **saved** confirmation, and "unsaved" while dirty |
| A note | the **Note tab** — a tab change, and a "discard what you have typed?" if an email was half-written | **"Add a note"**, always visible under About, 3 growing rows, **Save note**, "added to the history" |

- **The same `notes` column.** No new column, no migration.
- The note writes through the existing `add_note` path into `outreach_events`, exactly as before.
- **The Note tab is gone** — `type Panel = 'email' | 'call' | 'whatsapp'` — and `NoteBox` and
  `PinnedNotes` are **deleted**, not left beside their replacements.
- **`N` focuses the box** (scrolls to it and puts the caret in it) instead of opening a tab, and so
  does the phone bar's **Note** button. One id, `hg-add-note`, so the shortcut, the bar and the box
  cannot disagree.
- On the phone, About and Add-a-note sit under the contact card: the left column is `order-1` below
  768px (the contact card and its three big buttons come first), the composer and history are
  `order-2`, and the Demo/Files cards are their own grid item at `order-3`, explicitly placed in
  column 1 so auto-placement cannot park them under the centre.

---

## 3 · Column widths

| | 1024–1279 | 1280–1919 | ≥1920 |
|---|---|---|---|
| Left | 380 | **380** | **420** |
| Right | 280 | **280** | **320** |
| Centre | the rest | the rest | the rest |

⚠️ **The spec gave widths for 1280+ and the columns start at 1024.** I did not change where the
*column count* breaks (that was "change nothing else"), so 1024–1279 takes the narrow pair — giving
the sides 700px of a 1024px window would leave 320px for the email.

🔴 **The left column is the wide one now**, which is the correction: it holds prose — an address, a
paragraph about the truck, a note being written — and 380px is about 55 characters at 13px. The right
holds buttons.

---

## 4 · Call places the call

```ts
const number = e164 ? `+${e164.replace(/\D/g, '')}` : phone.replace(/[^\d+]/g, '')
const a = document.createElement('a')
a.href = `tel:${number}`          // no target
a.style.display = 'none'
document.body.appendChild(a); a.click(); a.remove()
```

- **Every device, no branch.** `matchMedia` is gone; nothing asks what kind of machine this is.
- **It never copies.** v2's reasoning — that `tel:` hands off to a protocol handler and takes focus —
  was right about the symptom and wrong about the remedy: a Mac hands `tel:` to **FaceTime**, which
  rings through the iPhone on the same Apple ID, which is the thing the button is for.
- **A detached anchor click, not `location.href` and not `window.open`.** `location.href` is a
  *navigation*: the browser starts unloading a page that may hold a half-written email.
  `window.open` leaves a blank tab behind on every call. A clicked anchor with no `target` hands the
  URL to the OS and leaves the document alone.
- **E.164** — `phoneWhatsApp` returns bare international digits for `wa.me`; a dialler needs the `+`,
  or `447700900123` is dialled as a UK national number and fails.
- The number stays **plain selectable text** (`select-all`) beside the button.

### The v2 checks that went

Three, named rather than quietly deleted, with the reason in the harness itself:

| Removed check | Why |
|---|---|
| *"it asks whether this is a handset — the pointer, not the window width"* | nothing branches on pointer type any more |
| *"…dials on a phone…"* | it pinned `location.href = 'tel:…'`, which is now an anchor click |
| *"…and on a desktop COPIES the number instead of yanking focus into FaceTime"* | the decision it asserted has been reversed |

What survives from that block: it is a **button**, there is **no `tel:` anchor in the markup**, and
the number is selectable text. The new behaviour is asserted in full in the v3 harness.

---

## 5 · History — one row per event, useful previews

**De-duplication, display only.** `buildTimeline` already drops a contact **linked** to a message
(everything this app sent). It did not cover an email sent from Outlook and then logged by hand: the
poll later finds it in Sent and records it — correctly — and the history showed one conversation as
two rows.

[`pairHandLoggedEmails`](../lib/outreach-timeline.ts) pairs them when **all** of these hold:

- the contact's channel is `email`, and it has **no** `email_message_id`;
- same **London calendar day** (`londonDay` — and a date-only `contacted_at` is already a day and is
  not shifted);
- same **direction**;
- the message is **not a test send**;
- and **exactly one** of each on that day+direction.

🔴 **Ambiguity pairs nothing.** Two emails and one hand log is a guess, and a wrong guess **hides a
row**. Both cases (2 messages/1 contact, 1 message/2 contacts) are harness-checked and show
everything. 🔴 **Nothing is deleted or edited** — the pairing is a `Map` handed to the builder, and
the harness censuses the lib for `.delete(` / `.remove(`.

The email carries a quiet **"also logged by hand"** marker and, when opened, **"Logged by hand: …"**
above the body — because that sentence is usually Dominic's own and exists nowhere else.

**Previews.** `meaningfulPreview` skips greeting-only lines — Hi / Hello / Hey / Dear / Morning /
Good morning / Greetings, with or without a name and a comma — and shows the first line that carries
a fact, falling back to the **subject** when nothing does. ⚠️ A greeting with the sentence on the
*same* line ("Hi there, can you send the plans?") is **not** skipped: that line carries the words.

---

## 6 · The queue label

- The prospect table's queue is **"All prospects"**, not "the list"; Today's four sections already
  carried their own names ("Replies waiting", "Chasers due", "Follow-ups due", "Emails needing a
  look"), so the header now reads **"Follow-ups due ‹ 1 of 5 ›"**.
- 🔴 **Opened with no queue ⇒ no control at all.** The `—` placeholder with two dead arrows is gone;
  the whole `‹ n of m ›` group renders inside `{pos && (…)}`.
- A stored queue with a missing label falls back to "All prospects", because that is the only list it
  could have come from.

---

## 7 · The harness

`scripts/outreach-workspace-v3.cjs` — **NEW**, registered (66 harnesses), **98 checks**, no network,
no mailbox, no database.

```
── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────
✓ FAILED as required  V1 two emails and one hand log on one day are paired anyway — a guess that hides a row
✓ FAILED as required  V2 an outbound email absorbs an INBOUND hand-logged contact
✓ FAILED as required  V3 a contact already linked to its message is paired again
✓ FAILED as required  V4 the preview is the greeting, on every single row
✓ FAILED as required  V5 a greeting-only email shows a blank row instead of its subject
✓ FAILED as required  V6 the notes column is narrower than the buttons column

── ONE ROW PER EVENT, AND NOTHING HIDDEN ON A GUESS ─────────────────────────────────────
  ✓ 🔴 the email and the hand log are one event…   ✓ …with its text kept
  ✓ 🔴 two emails and one hand log that day ⇒ pair NOTHING, show all three
  ✓ 🔴 a different direction is a different event   ✓ 🔴 a CALL logged the same day is not the email
  ✓ ⚠️ a TEST send can never be the logged email
  ✓ 🔴 nothing in the timeline lib deletes anything
  ✓ 🔴 23:30Z in September is the NEXT day in London

── A PREVIEW THAT SAYS SOMETHING ────────────────────────────────────────────────────────
  ✓ 🔴 the greeting is skipped and the first real line shows  (× 10 greeting forms)
  ✓ 🔴 a greeting-only email falls back to its SUBJECT, never to a blank row
  ✓ 🔴 a greeting with the sentence ON THE SAME LINE is NOT skipped

── THE CALL BUTTON PLACES THE CALL ──────────────────────────────────────────────────────
  ✓ 🔴 nothing branches on pointer type any more   ✓ 🔴 …and it never copies the number
  ✓ 🔴 it clicks a programmatically created tel: anchor   ✓ 🔴 with NO target
  ✓ 🔴 …and it does NOT navigate: assigning location.href starts unloading a page holding a draft
  ✓ ⚠️ the number is dialled in E.164

── THE INLINE COMPOSER HAS NO WINDOW CHROME ─────────────────────────────────────────────
  ✓ 🔴 the "Compose — <name>" header and Close render only when NOT inline
  ✓ 🔴 …and inline there is no card, no border and no shadow
  ✓ 🔴 the inline editor has NO ceiling and therefore no inner scrollbar
  ✓ 🔴 the empty editor is ~6 lines, not sixteen   ✓ …and the 22rem box is gone from the code
  ✓ …and in that order: tabs, composer, then history

── NOTES ARE ALWAYS THERE ───────────────────────────────────────────────────────────────
  ✓ 🔴 the standing notes are a labelled "About this truck" box of six growing rows
  ✓ ⚠️ …writing the SAME `notes` column — no new one
  ✓ 🔴 "Add a note" is always visible beneath it   ✓ 🔴 the Note TAB is gone
  ✓ 🔴 …and the components they replaced are deleted, not left beside them

── THE QUEUE SAYS ITS OWN NAME ──────────────────────────────────────────────────────────
  ✓ 🔴 "the list" is gone   ✓ …replaced by "All prospects"
  ✓ 🔴 the ‹ n of m › control renders ONLY when there is a queue

── WHAT v3 DID NOT CHANGE ───────────────────────────────────────────────────────────────
  ✓ 🔴 still one `nextStep` call · one contact writer · two accounted-for `next_action_at` writes
  ✓ 🔴 EMAIL_FRAME_SANDBOX is unchanged, and scripts are still off
  ✓ 🔴 do_not_contact still moves only on a click
```

**Nine stale checks in v1/v2 restated in place**, each with its reason: the editor's floor (11rem →
8.5rem) and ceiling (now none inline); the column widths (300/300 → 380/280, stepping at 1920); the
three Call checks above; the queue counter's markup; and the Note tab's tooltip.

---

## 8 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | compiled successfully |
| eslint — every changed file | **identical to HEAD** (`ProspectWorkspace` 0, `ProspectTimeline` 0, `RichEmailEditor` 0, `ComposeWindow` 3, `OutreachPanel` 6, the three libs 0) |
| `node scripts/outreach-workspace-v3.cjs` | **98 checks, all passed** |
| `node scripts/run-harnesses.cjs` (run alone) | **66 run · 66 passed · 0 failed** |
| goldens | `8bdae817…32660` and `e3f0a880…6b29222` ✅ unchanged |

No email sent, no SQL run, no `outreach_templates` or `outreach_snippets` row touched, no database
change of any kind, no live trading truck involved.

**SQL:** none. This build needed none.

---

## 9 · Commit and deploy evidence

**Commit `7bef71f`**, on `main`, pushed to `origin/main` (`c0dcb3c..7bef71f`). Seven files: one new
harness, six changed.

```
fingerprint at push:  5c4abab18050a10712abf90ba059e001
13:24:12Z poll 1:     5c4abab18050a10712abf90ba059e001
13:24:32Z poll 2:     5c4abab18050a10712abf90ba059e001
13:24:53Z poll 3:     5c4abab18050a10712abf90ba059e001
13:25:13Z poll 4:     5c4abab18050a10712abf90ba059e001
13:25:34Z poll 5:     5c4abab18050a10712abf90ba059e001
13:30:05Z poll 6:     13e10d570f9b7237414d727c9e58ac96     ← DEPLOY LANDED
```

`GET /admin/outreach/p/a5beca7f-…` → **200**, the page shell rendering "Loading…", at 13:30:14Z.

---

## 10 · What to test — ZZ Test Prospect (Dominic) only

`a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`. Nothing below touches another prospect.

### On the 16" MacBook Pro (≈1440×800 viewport)

1. **Open it from Today.** ① The composer is open with **no "Compose —" heading and no Close button**,
   and you can see the **HISTORY** heading and **at least 3 rows** without scrolling. Pick the
   first-contact template from the chips — still at least 3 rows visible.
2. **Type 30 lines.** ① The box **grows**; there is **no scrollbar inside it**; the page scrolls. The
   Send button stays at the bottom of the composer, above History.
3. **⤢** opens the full-window writing view; **Esc** returns with the text intact.
4. **Click a long received email** in History. ⑤ It opens at full length with **Show quoted text**
   hiding the thread, and the preview line on the collapsed row is the **first real sentence**, not
   "Hi Dominic,".
5. **Call.** ④ It should **ring through FaceTime / your iPhone**. It must not copy anything, must not
   open a blank tab, and the page must not reload or lose a draft. The number beside it is selectable.
6. **Left column.** ② "About this truck" is six rows — type in it, press **Save**, see **saved**.
   "Add a note" is underneath: type a line, **Save note**, and it appears in History as a dated note.
   Press **N** anywhere (not while typing) — the caret lands in Add-a-note.
7. **Queue.** ⑥ The header reads e.g. **"Replies waiting 1 of 3"**. Now open the page by pasting the
   URL into a new tab: the **‹ n of m › control is not there at all**.
8. **If this prospect has an Outlook email you also logged by hand on the same day** ⑤ — one row, with
   **also logged by hand**; open it and the logged sentence is above the body.

### On the 27" monitor

9. ③ The **same three columns**, no re-flow: the side columns simply go to 420 / 320 and the email
   column takes the rest. Nothing moves to a fourth column.

### On the iPhone (Safari)

10. ② Contact card first, with **Call · WhatsApp · Email** as three large buttons, then **About this
    truck** and **Add a note**, then the composer and History; Demo and Files at the bottom.
11. The sticky bar reads **No answer · Spoke · Voicemail · Note** — the first three log immediately
    (with Undo), and **Note** scrolls to and focuses the Add-a-note box.
12. **Call** dials.

---

## 11 · One thing worth flagging

⚠️ **The acceptance case is tight and will stay tight.** With a full first-contact template loaded, a
1440×800 viewport has **152px** below the Send row — four history rows. A longer template, or a
prospect whose Next banner wraps to two lines, eats one of those. If it ever drops below three in
practice, the next 30px to reclaim is the tab strip (`py-2` → `py-1.5`); I have not taken it yet
because a 38px tab row is already at the lower end of comfortable.
