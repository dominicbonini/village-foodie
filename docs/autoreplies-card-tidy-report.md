# Auto-replies card — copy and layout tidy

**Date:** 21 August 2026
**Status:** built, **NOT deployed, NOT committed, `next dev` NOT run.** Joins the undeployed batch.
**Prompt integrity:** no span arrived garbled. **No instruction contradicted another**, but Task 1's
supplied copy sits in tension with the rationale quoted beside it — used verbatim as instructed, flagged
at 1.b rather than silently altered.

✅ **ONE FILE CHANGED: `app/manage/[token]/page.tsx`.** `lib/plan-features.ts` untouched (mtime
09:42:56, before this session).

---

# TASK 1 — THE DESCRIPTION LINE

**Now:** `Answer customer questions automatically on your social media, using your menu and schedule.`
**Was:** `Auto-replies answer customer questions automatically, day or night — using your live menu and schedule.`

✅ Still `text-base text-slate-500`, still outside the native hide (verified positionally, §5).
✅ **The repetition you identified is gone** — the old line opened with the card's own title.

## 1.b ⚠️ TWO THINGS ABOUT THIS WORDING, RECORDED RATHER THAN CHANGED

**1. It reads as an imperative, not as a feature-subject line.** Your instruction to *"keep the subject
the feature rather than the reader"* was the reason the previous line began *"Auto-replies answer…"*.
*"Answer customer questions…"* has an implied second-person subject.

✅ **I used your line verbatim, and I think it survives** — but on a different argument than the old
one, which is worth having written down. It reads as a **product bullet** (what the feature does), which
is a conventional voice for exactly this position; **and every one of the three channel rows below now
says "Coming soon"**, so nothing on the card claims to be running for anyone. **The rows are what carry
the truth now, not the sentence.** If those rows ever go live for some plans and not others, this line
becomes second-person again and will need re-reading.

**2. ⚠️ "On your social media" is forward-looking, not accurate about today.** The only implemented
channel is **WhatsApp, which is messaging rather than social media** — that distinction is the reason
this card is called "Auto-replies" and explicitly not "Socials". The two actual social channels are
`coming_soon` and unbuilt. **It describes the destination, not the present.** Recorded, not corrected:
it is your copy and the "Coming soon" rows keep it from misleading.

---

# TASK 2 — THE REDUNDANT LINE IS GONE

**Deleted:** `Built from your live menu and schedule, so set those up first.`
**Kept unchanged:** `Ask anything a customer might ask. Nothing is sent — this is just a preview.`

Fixed-string counts confirm both. The size comment above them described a *"line 2"* that no longer
exists; it now records the deletion and its reason, so nobody reinstates the line without re-reading the
description first.

---

# TASK 3 — REORDER AND RENAME

**Verified order, by position in the component:**

```
    1 heading        "See what a customer gets back"
    2 intro line     "Ask anything a customer might ask. Nothing is sent — this is just a preview."
    3 input          + its button, one row
    4 chips
    5 chat box       min-h-[8rem]
    6 footnote
    correct order: True
```

**Button renamed `Try it` → `Send`** — one occurrence, no `Try it` remains.

✅ **Everything you asked to keep is intact:** the chips still fill the input and run it on tap
(`onClick={() => { setMessage(ex); void run(ex) }}`, unchanged); the box keeps `min-h-[8rem]`; the empty
state, loading state, error and result all still render **inside** the box; the null reply is still a
result with its explanation, deliberately not drawn as a bubble; and the classification label is still
there with its comment saying **"Do not remove this as clutter."**

## 3.a ✅ THE EMPTY STATE STILL READS CORRECTLY IN ITS NEW POSITION — AND HERE IS WHY

You were right to make me check. It now sits **under the chips**, not under the input.

**It survives because it is positional about ITSELF, not about what precedes it:** *"Your preview will
appear here."* points at the box it is inside. 🔴 **Had it read "type a question below" — the obvious
alternative wording, and one I nearly used — the reorder would have made it false**, because the input is
now above it. That is written into the code at the empty state so the next reorder catches it.

## 3.b ⚠️ THE REORDER CREATED A NEW REPETITION. FLAGGED, NOT FIXED.

The input's placeholder is **"Ask something a customer might ask"** and it now sits **directly beneath**
the line **"Ask anything a customer might ask."** They were three elements apart before; they are
adjacent now.

**Left as-is: changing that copy was not in scope.** But it is the same duplication Tasks 1 and 2 exist to
remove, and it is now the most visible instance of it in the block. **Your call.**

---

# TASK 4 — THE WHATSAPP ROW ON ONE LINE

```
    WhatsApp   [ +447700900000 ]   [Coming soon]
```

The disabled number field moved back up from its own line, and the badge sits **where the Connect button
used to be**, so the row keeps a shape the operator already recognises.

## 4.a How the narrow case is handled

- **The row container is now `flex flex-wrap items-center gap-2`.** ⚠️ **`flex-wrap` is the whole
  mechanism:** if the three items cannot fit, the badge wraps to a second line **inside the same flex
  row** — so it stays associated with WhatsApp and **cannot collide with the field**, which is what you
  asked for.
- **`flex-1 min-w-0`** on the input lets it shrink rather than force an overflow.
- **`flex-shrink-0`** on the badge stops it being crushed.
- The label keeps `w-20 flex-shrink-0` — still the only fixed width in the card, at 80px.

✅ **Instagram and Messenger are untouched**, and still driven from the matrix via
`isRowComingSoon(MESSENGER_INSTAGRAM_ROW)`.

---

# TASK 5 — THE HELPER CAPTION IS GONE, AND SO IS THE EXPLANATION

**Deleted:** *"The WhatsApp Business number used to send automated replies to customers (set up with the
WhatsApp Business API). This is separate from your contact number above."*

## 5.a 🔴 RECORDED AS YOU ASKED: NOTHING ELSE IN THE CARD EXPLAINS THE DISTINCTION

Scanned the whole Auto-replies card with comments blanked:

```
  card mentions: NONE of: contact number / separate / Business number
```

🔴 **The card no longer says anywhere that this is a different number from the operator's contact
number.** That is a deliberate removal, not an oversight, and this is the record of it.

⚠️ **AND THE OTHER SIDE DOES NOT COVER IT EITHER.** For completeness I checked the Contact Details card
(out of scope, unchanged): it carries *"This number is on WhatsApp"* as a tick on the phone field, and a
warning about that tick. **Neither mentions `whatsapp_sender`.** So an operator who fills the contact
phone, ticks "this number is on WhatsApp", and later sees a greyed WhatsApp field in the Auto-replies
card **has nothing on either screen telling them these are two different numbers.**

⚠️ **The manual records that this exact confusion has already caused a defect** — Gusto's
`whatsapp_sender` holds the tester's mobile rather than a Business API sender, which is the value that
made a routing bug look correct. **The caption was the only place the product drew the line.** It matters
less while the field is greyed and unusable; it matters again the day `WHATSAPP_LIVE` flips.

---

# §6 — UNCHANGED, AS REQUIRED

| Invariant | Check | Result |
|---|---|---|
| `WHATSAPP_LIVE` still a local boolean | declaration read from source | ✅ `const WHATSAPP_LIVE: boolean = false` |
| Not driven from `plan-features.ts` | mtime + no new import | ✅ **module untouched, 09:42:56** |
| Wrapper byte-unchanged | comment-blanked compare vs pre-task copy | ✅ **identical** — `'        {!isNativeApp() && (<>'` |
| Exactly one wrapper in this card | positional scan | ✅ **1 open, 1 close** |
| Title/description/preview outside | positional scan | ✅ **9205 / 9221 / 9257, all before 9259** |
| Channels + 3 rows inside | positional scan | ✅ **all between 9259 and 9370** |
| Native render | derived from the above | ✅ **title, description, preview. Nothing else.** |
| Zero `green-*` in the card | class scan, comments blanked | ✅ **NONE** |
| Syntax | TypeScript parser | ✅ **parses clean, 0 diagnostics** — a parse check, **not** a typecheck |
| Character census | NUL / control / carrier-aware selectors | ✅ **0 NUL; bare-glyph set identical to HEAD** |

---

# §7 — PHONE LAYOUT — THE HONEST ANSWER STILL STANDS

🔴 **I CANNOT ESTABLISH THE NEW INPUT-AND-BUTTON ROW AT 375px WITHOUT RENDERING, AND I DID NOT RENDER
IT.** `next dev` was not run, per scope.

**What I can say from the classes:**

- The input row is unchanged in structure — `flex flex-col sm:flex-row` — so **below 640px the input
  still takes its own full-width line and the button sits under it.** The reorder moved the row; it did
  not change how it stacks.
- ✅ **"Send" is shorter than "Try it"**, so the row cannot be worse at any width than the arrangement
  I audited this morning.
- The WhatsApp row is the one genuinely new narrow-screen case, and **`flex-wrap` is a rule, not a
  measurement**: I know the badge *will* wrap rather than collide, but **not at which width it starts to,
  nor whether the wrapped result looks deliberate.**

⚠️ **What still needs a browser:** the wrap point of the WhatsApp row, whether the badge sitting beside
a truncating input reads as attached to the field or to the label, and whether `min-h-[8rem]` is right now
that the box is lower down the card.

---

# §8 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED, AT ANY WIDTH.** The reordered preview, the one-line WhatsApp row and
   the new description have never been displayed.
2. 🔴 **THE REORDER'S WHOLE POINT IS VISUAL AND IS THEREFORE UNVERIFIED.** Whether input-then-chips reads
   better than chips-then-input is a judgement the audit cannot make.
3. ⚠️ **The empty state's new position is argued, not seen** (3.a). The argument is about the wording
   being self-referential, which is sound; how it looks as the first thing under the chips is not.
4. ⚠️ **The preview route has still never been called and no real model call has been made**, so the
   chat box has never shown a real reply in any layout.
5. ⚠️ **`WHATSAPP_LIVE = true` has still never been rendered** — the live branch is preserved and
   type-checked but unexercised.
6. ⚠️ **No typecheck was run**, only a parse.

## 🔴 TWO THINGS FOR YOU

- **The separate-number explanation is now absent from both sides of the product** (5.a). Low cost while
  the field is frozen; a real gap the day it goes live.
- **The placeholder now echoes the line above it** (3.b) — the same repetition this task removed twice
  elsewhere.
