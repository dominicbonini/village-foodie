# Workspace v4 fixes — the page scrolls, and the email is shown once

**30 September 2026 · commit `21d0cae` · deployed and serving on production at 17:29:12Z**

Six fixes on top of [v4](outreach-crm-workspace-v4-report.md), measured in **Chromium and WebKit**.
Nothing in the sequence build was touched.

---

## 1 · The page did not scroll — the cause

**It was not the reading panel.** The panel is only mounted while an email is open, and it sets no
scroll lock. The cause is in `components/admin/ComposeWindow.tsx`:

```ts
// Background scroll lock, restoring the previous value rather than resetting to ''…
useEffect(() => {
  const prev = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  return () => { document.body.style.overflow = prev }
}, [])
```

🔴 **A modal's scroll lock, inherited by something that has not been a modal since v2.** It runs on
mount and releases on **unmount**. The prospect page mounts this composer **inline**, permanently —
so `body { overflow: hidden }` was set the moment the page rendered and stayed set for as long as the
page was open. Every prospect, every browser, with the panel never opened. It has been there since
the inline composer landed; v4's fixed-height editor is what made the missing page scroll matter,
because the history no longer arrived on screen by itself.

**The fix** gates it to the two things that really are over the page:

```ts
if (inline && !expanded) return          // the page is not a modal
```

The portalled window and the **⤢** full-window writing view still lock, and still restore the
*previous* value rather than clearing it.

### ✅ Measured, in both engines

```
✓ 🔴 CONTROL: the locked page reads body overflow "hidden" — the state the inline composer was leaving it in
  ⚠️ …and note scrollTo still moved it to 1324px: a scripted scroll is not what a trackpad does
✓ 🔴 nothing locks the page: body "visible", html "visible"
✓ 🔴 …the document is taller than the window and scrolls (scrollY 1324)
✓ 🔴 …all the way to the last row of History
```

🔴 **The obvious check would have passed against the bug.** `window.scrollTo` moves the page even
with `body { overflow: hidden }` — in **both** engines — while a wheel or a trackpad does nothing.
So the probe is the **computed `overflow`** on `body` and `html`, with the locked fixture kept as a
control.

⚠️ **The wheel itself is not measured, and that is stated rather than faked.** Neither headless
engine delivered a synthesised wheel to the inner scroller in the fixture — `mouse.wheel` moved
nothing at all, editor or page — so a green tick there would have meant the event never arrived.
What is asserted instead is the structure that makes scroll chaining work, in the harness: the editor
is an `overflow-y: auto` box, **nothing** in the outreach components listens for `wheel`, and nothing
sets `overscroll-behavior`. The behaviour is on the test list below.

---

## 2 · Attach file and Plans PDF

They were rendered **below** the editor with `-mt-8` — a negative margin that pulled them back up
**inside** the box, over the last lines of the email and over the resize grip. The margin was there
to save 36px of page height; it bought that by parking two buttons on the text.

They are now `toolbarExtra` on the editor: **on the toolbar row, after a divider, before ⤢** —

```
B  Small │ Insert signature  Insert opt-out │ Attach file  Plans PDF      …          ⤢
─────────────────────────────────────────────────────────────────────────────────────
 plans-and-features-2026-09-30.pdf  0.4 MB ×      1 file · 0.4 MB of 10 MB
─────────────────────────────────────────────────────────────────────────────────────
 Hi Stephen,
```

— and the chips are `underToolbar`: **directly under the toolbar, inside the same border**, above
the scroller so they never move with the email. The 36px is still saved and nothing overlaps
anything. The attachment **error** line stays under the box, where it belongs.

---

## 3 · The false "You have edited this message"

Two causes, both fixed:

1. `setEdited(true)` fired on **every** `onChange` — including the one the editor emits while it
   normalises the document it was handed. An edit is now a **difference**:
   `docPlainText(d).trim() !== docPlainText(templateDoc).trim()`.
2. The banner explains that the placeholder **fields** no longer rewrite the message. With **Blank**
   there are no fields and no render, so it was explaining nothing: it now also requires
   `templateId`.

Never with Blank, never on an untouched template.

---

## 4 · Pig-Casso's, 15 September — paired by its words

The day rule was right to refuse: two outbound emails, one hand log. The second rule uses what the
day could not supply — **the words**:

- both sides normalised: case, every run of whitespace, line breaks, and the quote characters a
  keyboard and a mail client disagree about (`’ ‘ \`` → `'`, `“ ” → "`);
- **greeting lines skipped on both sides**, by the same rule the previews use, so "Hi Stephen,"
  never matches "Hi George," and never blocks a real match;
- the first **60** meaningful characters compared, both sides cut to the same length;
- 🔴 **pair only when exactly one email matches** — two emails opening with the same words pair
  **nothing**, as before, because a wrong pairing hides a record;
- an email already paired is never claimed twice; an empty key pairs nothing.

**Display only. Nothing is written, nothing is deleted.**

---

## 5 · The contact name

18px, weight 800, `mb-1` under it, on every screen including the phone. The email and phone lines are
untouched at 13px.

---

## 6 · The reading panel showed the email twice

For Between Buns Royston, 18 September, the "Logged by hand:" block carried the **entire email as
plain text**, above the formatted copy of itself.

- **Always**: a small grey line — **"Also logged by hand · 18 Sep"**.
- **Only when the hand text adds something**: **"Show what was logged by hand"**, collapsed, which
  expands into a small grey box *below* the line. Never expanded by default, never above the email.
- `handTextIsRedundant(hand, email)` decides, on the same normalisation as item 4 applied to the
  whole text: the hand text is **contained in** the email, or the first 200 characters match.
- 🔴 **"I cannot tell" is FALSE, not true.** While the body is still loading, or when it has no text,
  the link is shown — the failure to avoid is hiding something that was written down, not showing one
  extra link.
- The history **row** keeps its "also logged by hand" marker.

---

## 7 · The harness

`scripts/outreach-workspace-v4-fixes.cjs` — **NEW**, registered (70 harnesses), **48 checks**,
**7 broken variants**; `HG_RENDER=1` adds the two-engine measurement.

```
✓ FAILED as required  V1 🔴 an ambiguous day is paired by guess — the first email wins
✓ FAILED as required  V2 the opening words are compared without normalising case or quotes
✓ FAILED as required  V3 🔴 the hand text is called redundant whenever the body has not loaded
✓ FAILED as required  V4 🔴 the scroll lock is left on for the inline composer — the page cannot scroll
✓ FAILED as required  V5 🔴 the attach buttons are pulled back inside the editor box
✓ FAILED as required  V6 the edited banner is shown for Blank again
✓ FAILED as required  V7 🔴 the hand-logged text is a block above the email again
…
✅ all 48 passed
```

### Stale checks, restated in place

| File | Check | Why |
|---|---|---|
| `outreach-workspace-v4.cjs` | "the hand-logged sentence sits above the body" | **it was pinning the bug** — that "sentence" was the whole email. Replaced by: the marker is always shown and the text is reachable when it differs |
| `outreach-workspace-v3.cjs` | "…shows the logged text above the body, in the reading panel" | same, restated twice now and both reasons kept |
| `outreach-workspace-v3.cjs` | the V1 mutation's anchor | the day rule's line changed shape when the words rule was added beside it; the variant still breaks the same rule, and its fixtures carry no matching text so the words rule cannot pair them either |

---

## 8 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 5.0s` |
| eslint — all six changed files | **identical to HEAD** (`EmailReadingPanel`, `RichEmailEditor`, `ProspectWorkspace`, `outreach-timeline` all 0/0) |
| `node scripts/outreach-workspace-v4-fixes.cjs` | **48 checks, all passed**, 7 variants caught |
| `HG_RENDER=1` (Chromium + WebKit) | all measurements correct in both engines |
| `node scripts/run-harnesses.cjs` | **70 run · 70 passed · 0 failed** |
| goldens | `8bdae817…` and `e3f0a880…` ✅ unchanged |

No email sent, no SQL run, no template row touched, no database change. One send path, one contact
writer, one follow-up writer, one `nextStep`, every sequence guard, `EMAIL_FRAME_SANDBOX` unchanged.

Fingerprint `9cc6054a…` at push → `de3cd14d…` at **17:29:12Z**.

---

## 9 · What to test

**ZZ Test Prospect** for anything that sends. **Pig-Casso's** and **Between Buns Royston** for
**viewing history only — send nothing to either.**

### Safari, 16" MacBook Pro

1. **ZZ Test Prospect** ① — scroll the page with the trackpad, with nothing open. It should reach the
   bottom of History. Open an email in the panel, scroll inside it, close with **Esc**, then with
   **×** — the page still scrolls both times.
2. ① Put the pointer **over the email editor** and scroll: the editor scrolls while it has room, then
   the page takes over. This is the one thing the harness could not measure.
3. ② The **Attach file** and **Plans PDF** buttons are on the toolbar row, not over the text. Attach
   something: the chip appears **under the toolbar**, inside the box, and nothing covers the resize
   grip — drag it to check.
4. ③ With **Blank** selected and nothing typed, there is **no** "You have edited this message". Pick a
   template — still none. Type one character — now it appears.
5. ⑤ The contact name is noticeably bigger than the address under it.
6. **Pig-Casso's** ④ — 15 September should show **two** rows, not three: the two emails, one of them
   marked *also logged by hand*. Nothing about that truck is sent.
7. **Between Buns Royston** ⑥ — open "FW: Ordering costs for Between Buns" (18 Sep). The panel shows
   **"Also logged by hand · 18 Sep"** and then the formatted email — **no plain-text copy above it**.
   If you find one where the logged note says something extra, it shows **"Show what was logged by
   hand"** instead, closed.

### iPhone

8. ① The page scrolls. ⑤ The contact name is the headline of the card. ② The toolbar wraps and the
   attach buttons are still on it, not over the email.
