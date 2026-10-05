# Outreach composer — three fixes: bold switching itself on, Send doing nothing, and the Send button label

**Branch `schedule-graphics` only.** No branch switch, no push, no merge, no deploy. No SQL run. No
`outreach_templates` row created, edited, seeded or deactivated. **No email was sent to anyone** — the
diagnosis needed none, for the reason in §2.3. Nothing killed by name or pattern.

---

## Written for

Dominic, as the operator who reported all three and who will decide what to do about `main`.

---

# 0 · The answer you need first: `main` has all three

Every file involved is **byte-identical** between `origin/main` and this branch's committed HEAD, so
**the live site has all three defects** and these fixes are uncommitted branch-only changes.

| File | vs `main` | Carries which defect |
|---|---|---|
| `components/admin/ComposeWindow.tsx` | **identical** | **2** — the silent `return` on `body` in `askSend` *and* `logNow`; the un-flagged past follow-up date; the suffix on the label |
| `components/admin/RichEmailEditor.tsx` | **identical** | **1** — `setStoredMarks(null)`, `setTextSelection(1)`, and `insertLines` leaving the caret inside bold |
| `lib/outreach-sequence.ts` | **identical** | **3** — `sendButtonLabel` returning "Send reply" / "Send · Chase 1" |
| `lib/outreach-doc.ts` | identical | none (it is correct — see §1.1) |
| `app/api/admin/outreach/mail-send/route.ts` | identical | none — the route was never reached |
| `lib/outreach-send-rules.ts` | identical | none |
| `lib/outreach.ts` | identical | none (`isOverdue` was already there and unused by the composer) |

Verified by `git show origin/main:<file> | grep` for each defect, not by trusting the diff:

```
main:ComposeWindow.tsx:1068     if (!body.trim()) return
main:RichEmailEditor.tsx:330    editor.commands.setTextSelection(1)
main:RichEmailEditor.tsx:442    insertContent(paragraphsFromLines(lines) …)
main:outreach-sequence.ts:396   if (input.isReply) return 'Send reply'
```

🔴 **So yes — a separate fix on the live site is needed**, or these changes have to reach `main` before
the next release. ⛔ **Fix 2 is the one I would not leave on the live site**: a Send button that does
nothing and says nothing is indistinguishable from a broken page, and it fires on the **"Blank"**
template, which is the one you reach for when you want to write something yourself.

---

# 1 · Bold turning itself on

## 1.1 It is not the template, and it is not the document

`docFromTemplateText` emits plain paragraphs; only the **signature lines** carry `bold: true`
(`paragraphsFromLines` adds the mark). And **"Blank" renders an empty body** — the template effect
does `if (!id) { setSubject(''); setBody('') }` — so Blank's document is one plain paragraph, and
typing into it is plain. `lib/outreach-doc.ts` is correct and untouched.

## 1.2 The cause: the caret was left inside a bold run, twice

🔴 **`insertLines` — the Signature button.** It did:

```js
editor.chain().focus().insertContent(paragraphsFromLines(lines)).run()
```

`insertContent` leaves the caret **at the end of what it inserted** — i.e. **inside the bold signature
line**. From there `isActive('bold')` is true (so **B lights up**) and the next character is bold (so
**typing goes bold**), with nothing typed and no mark applied by hand. That is your exact report, on
the exact template you used: Blank gives you a plain box, you press **Signature**, and from that moment
the box types bold.

🔴 **The content effect — `setStoredMarks(null)`.** The second source, and the more surprising one,
because a previous build added that line *to fix this very symptom*:

```js
editor.commands.setTextSelection(1)
editor.view.dispatch(editor.state.tr.setStoredMarks(null))
```

⛔ **`null` does not mean "no marks". It means "I have no stored marks — use the marks AT the caret."**
So on a template whose first line is the signature, position 1 is inside bold text and the line fixed
nothing. Proven, in real ProseMirror, with no browser:

```
caret at position 1, storedMarks = null
  marks AT the caret        : ["bold"]
  marks the NEXT CHAR gets  : ["bold"]
```

## 1.3 And this is why it took several presses

`toggleBold` on a **collapsed** caret only sets `storedMarks`, which is transient. Measured:

```
with storedMarks = []            → next char gets []        (bold off)
after ANY later transaction      → storedMarks null (dropped)
                                 → next char gets ["bold"]  (bold back)
```

So each press turned bold off, and the next transaction — a click, a caret move, anything — turned it
back on, because the caret was still sitting in bold text. **The B button was never lying.** It was
faithfully reporting a position you had not chosen.

## 1.4 The fix is positional, because a state fix cannot hold

- **`insertLines`** adds a **plain empty paragraph** after the insertion *when the last inserted line
  carries a mark*, puts the caret there, and clears the stored marks. You can carry on typing plain
  text under your signature, which is what you were doing. ⚠️ A plain insertion gets no extra
  paragraph — no stray blank line.
- **The content effect** uses a new `firstPlainPos(doc)`: prefer an **empty** textblock, then the start
  of the first **unmarked** text, falling back to position 1 (what it always did) for a document that
  is bold end to end. And `setStoredMarks([])` — never `null`.
- **Small takes the same path**: the opt-out line is `small: true` and goes through the same
  `insertLines`, and the `lastIsMarked` test checks `bold || small`. **Link** does not have this
  pattern — it wraps a selection and leaves the caret inside the link only when there was a selection
  to wrap, which is the operator's own choice.

**Acceptance, asserted:** a fresh or Blank message types plain text; one press of B on a selection turns
bold on and one turns it off; and the button's state and the typed character read the same source
(`storedMarks ?? marks at caret`), which TipTap's `isMarkActive` already does — so they agree, and now
they agree on *plain*.

---

# 2 · "Send" doing nothing

## 2.1 The cause, in one line

```js
const askSend = (test: boolean) => {
  if (!body.trim()) return          // ← silent. No message. No request.
  …
```

`body` is the **template render**. **"Blank" sets it to `''`.** So with Blank chosen, every press of
Send hit a bare `return`: no state change, no sentence, no network call. The button was not disabled,
because `sendBlock` reads `hasText` — which reads the **document** — so the screen had text in it while
this guard was looking somewhere else entirely.

⛔ **And the file already knew.** `hasText`'s own comment says:

> "`body` holds the template render, so a hand-typed blank email leaves it empty for ever; guarding on
> `body` would have disabled Send permanently the moment this row started rendering for blank emails."

That fix was applied to `hasText` and **missed in `askSend`** — and in **`logNow`**, which had the
identical line, so "Log as sent" was silently dead on Blank too. ⚠️ **Nobody had reported the second
one**, which is what a silent failure buys you.

## 2.2 What else I traced, and found clean

Everything downstream was fine, because **nothing downstream ran**. Checked anyway, since a second
cause would have hidden behind the first:

| Path | Verdict |
|---|---|
| `sendBlock` / `testBlock` disabled states | correct — read `hasText`, i.e. the document |
| §62.4 guards (already sent, not due, shared address, after final, replies) | correct — the route returns `needsConfirm` with sentences and ids, and the client opens the dialog |
| the idempotency key returning an earlier verdict | correct — `json.duplicate === true` sets a visible message |
| a thrown error caught and dropped | not present — `sendNow`'s failure paths all call `setSendError` |
| `json.ok !== true` | handled, with a message |
| the "no step to send: replied" state | correct — a reply is `loggedKindFor` → `'reply'`, not a rung, and sends |
| threading with "Include previous email" on | correct — the quoted parent is a **separate** fetched string, never part of the editor document, and unticking it never touches the threading headers |
| `sendInFlight` re-entrancy gate | correct, and correctly silent (see §2.4) |

## 2.3 Why no email had to be sent to prove it

The failure is **before the request**. A bare `return` in a click handler produces no network call at
all, so a stubbed transport would have had nothing to observe — and a real send would have proven
nothing about the bug while risking an email to Stephen Connon. The proof is the control flow, and it
is now asserted from source. ⛔ **I did not need to ask, and I did not send.**

## 2.4 Silent failure is now structurally impossible

`scripts/outreach-send-visible.cjs` §1 walks `askSend`, `logNow` and `sendNow` and **fails on any bare
`if (…) return`** other than the two re-entrancy gates, which are correctly silent — the first press is
already doing the thing, and a sentence explaining that would be noise on a double-click.

Every refusal now produces a line **next to the button**, in the existing always-visible red box:

- no message → *"Write something, or pick a template, first."*
- `sendBlock` → that reason, as a sentence (e.g. *"This prospect has no email address."*)
- `refusal` → unchanged (the literal-token and must-resolve stops)
- **a follow-up date in the past** → see below

## 2.5 The past follow-up date

Your case: the next follow-up was picked as **2 Oct**, already gone, and nothing said so. A date in the
past produces a follow-up that is **due the instant it is written**, so the prospect reappears in Today
immediately — which reads as a bug rather than as the choice it was.

> *"Your follow-up date (2026-10-02) is in the past — pick a new one or clear it. Press Send again to
> send anyway."*

⚠️ **It warns; it does not block.** Catching up on a missed step is legitimate, and this window's rule
is that only a token which would arrive as literal braces refuses outright.
🔴 **"In the past" is `isOverdue` from `lib/outreach.ts`, imported** — the same function the Today list
and the overdue flag already use. A `<` written in the composer would have been a second answer to one
question, and the first time one changed, the window would warn about a date the list thought was fine.

---

# 3 · The button label

`sendButtonLabel` returns **"Send"** for every case. The page's `sendLabelSuffix` ("· follow up 2 Oct")
is **no longer appended**.

⛔ **The server is untouched.** `loggedKindFor` and `nextStep` still decide and still log exactly what
they logged before — the label was never an input to either, which is why this is a one-line change.
Asserted directly: a reply in a conversation still logs `reply`; a follow-up on your own email still
logs the **step**.

⚠️ **The consequence is still visible, just not on the button.** The button's `title` still says
"…and logs the contact. Follow-up set for \<date\>.", and a date in the **past** is now called out beside
the button *before* the send goes anywhere — which is the information the suffix was carrying, in the
place it can actually be read.

⚠️ **Three things kept deliberately, so nothing looks dropped:** the function's argument (every call
site passes it; two harnesses know the shape), the `sendLabelSuffix` prop (still accepted, simply not
rendered), and `isSlotStep` / `STEP_LABELS` / `LadderKind` — still used by the sequence grid and the
timeline. **"Send test to me" is unchanged.**

---

# 4 · What was run

| | |
|---|---|
| **All 31 outreach harnesses** | ✅ **every one passes** |
| `scripts/outreach-send-visible.cjs` (**new**, registered) | ✅ **36 passed** |
| `scripts/outreach-sequence.cjs` | ✅ 69 passed |
| `scripts/outreach-editor-toolbar.cjs` | ✅ 48 passed |
| `scripts/outreach-log-once.cjs` | ✅ 15 passed |
| `scripts/outreach-reply-any-notes.cjs` | ✅ 54 passed |
| `scripts/outreach-schema-census.cjs` | ✅ 42 passed |
| `npx tsc --noEmit`, `npx next build` | clean |
| ESLint on the three touched files | **2 errors, both pre-existing** (confirmed by stashing my changes and re-running) |
| `run-harnesses.cjs --dry-run` | all **91** listed files pass the source screen |

## 4.1 🔴 A harness was green while the bug was live, and that is the lesson

`outreach-editor-toolbar.cjs` asserted, word for word:

```js
tt('🔴 …and a replaced document lands the caret at the start with no stored marks',
  /editor\.commands\.setTextSelection\(1\)/.test(E) && /setStoredMarks\(null\)/.test(E))
```

⛔ **It required both halves of the defect.** It was asserting the *mechanism somebody had written*
rather than the *property the operator needs* — so it stayed green through every run while bold kept
turning itself on. It now asserts the property: the caret lands somewhere **plain**, the marks are
**explicitly** cleared, and `setStoredMarks(null)` and the unconditional `setTextSelection(1)` are both
asserted **absent**.

That is the same failure class as the vacuous assertions in the previous build, in a new costume: an
assertion is only worth the property it names.

## 4.2 Two failures that were not this build's

`outreach-schema-census.cjs` pins `truck_places`'s column count, and it moved from 18 to **19** when the
Places-tab build added `usual_event_type_id`. That build ran only the harnesses it touched (§72.2), so
the census arrived here one prompt later. Updated to 19, with the new column asserted as censused.
⚠️ **That is the right cost:** a pinned count nobody has to update is a count nobody is checking.

`outreach-log-once.cjs` and `outreach-reply-any-notes.cjs` asserted the two lines this build changed —
the `!body.trim()` guard and the stepped label. Both re-aimed at the claims that survive.

---

# 5 · Test list — "Send test to me" only

⛔ **Do not press the orange Send on a real prospect while testing.** Every step below uses
**"Send test to me"**, which goes to `OUTREACH_TEST_RECIPIENT`.

**Bold**
1. Open Pig-Casso's. Template **Blank**. Type a sentence — it is **plain**, and **B is not highlighted**.
2. Press **Signature**. The caret lands on a **new empty line under the signature**. Type — **plain**.
   *(This is the bug: before, typing here went bold.)*
3. Press **B** once → the button highlights and typing is bold. Press **B** once more → it unhighlights
   and typing is plain. **One press each way.**
4. Select a word, press **B** → bold. Press **B** again → not bold.
5. Press **Opt-out** (it inserts a 10pt line). The caret lands on a plain line and typing is **normal
   size** — the same check for Small.
6. Pick a real template, e.g. one ending in the signature. The caret lands at the **start** and typing
   is plain, with B unhighlighted.

**Send**
7. Template **Blank**, type one sentence, press **Send test to me** → it sends to your test address.
   *(Before: with Blank, both Send and "Log as sent" did nothing at all.)*
8. Clear the box completely and press **Send test to me** → a red line says
   *"Write something, or pick a template, first."* — **not silence**.
9. Set the follow-up to a date **in the past** (2 Oct). Press **Send test to me** → a red line names
   the date and says to pick a new one or clear it, and that **pressing again sends anyway**. Press
   again → it sends.
10. Pick a future follow-up date → no warning, and the button's hover text says
    *"Follow-up set for \<date\>."*
11. Leave a `[[placeholder]]` in → the existing "send anyway" dialog still appears.
12. Try a prospect with no email address → the red line says so instead of nothing happening.

**The label**
13. On a prospect mid-ladder, the orange button reads **"Send"** — not "Send · Chase 1".
14. On a prospect who has replied (Pig-Casso's), with "Include previous email" ticked, it still reads
    **"Send"** — not "Send reply".
15. **"Send test to me"** is unchanged.
16. After a real send (when you choose to do one), check the timeline logs the **same kind** it always
    did — a reply as `reply`, a chaser as its step. The label change touched none of that.

---

# 6 · Open, and named rather than hidden

- **`EventTypeDashboardControl`-style dead code is not an issue here**, but one thing is worth knowing:
  `sendLabelSuffix` is now a prop that is accepted, passed by the page at two call sites, and rendered
  nowhere. I left it rather than widen the diff across two components and two harnesses for no
  behaviour change. Say the word and it goes.
- **`window.prompt` for the Link URL** is still what it was — recorded in the editor's own header as
  worth revisiting. Not touched here.
- **The transient nature of `storedMarks` is unchanged, and is correct.** Pressing B with a collapsed
  caret is a "next character" instruction in every editor; what was wrong was the *position*, not the
  transience. If you ever want B on a collapsed caret to re-format the surrounding word durably (as
  some editors do), that is a different decision and a different change.
