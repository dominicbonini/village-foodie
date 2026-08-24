# Auto-replies card — description, chat-shaped preview, channel rows

**Date:** 21 August 2026
**Status:** built, **NOT deployed, NOT committed, `next dev` NOT run.** Joins the undeployed batch.
**Prompt integrity:** no span arrived garbled. No instruction contradicted another. **Task 4's stop
condition did not fire** — see 4.a. The appended instruction (WhatsApp shown as coming soon and greyed)
created one genuine tension with Task 4's "drive it from the flags" rule, resolved and reported at 4.c
rather than chosen silently.

✅ **ONE FILE CHANGED: `app/manage/[token]/page.tsx`.** `lib/plan-features.ts` is untouched (mtime
09:42:56 yesterday, hours before this session).

---

# TASK 0 — RECONCILIATION: THE SCREENSHOT IS STALE. THE FILE IS CORRECT.

🔴 **BOTH TASKS ARE FULLY APPLIED IN THE FILE. I DID NOT RE-APPLY ANYTHING.**

Read with **fixed-string** counting (not `grep`, for the reason in 0.b):

| String | Count | Verdict |
|---|---|---|
| `See what a customer gets back` | **1** | ✅ the new heading is present |
| `Try your auto-replies` | **0** | ✅ the old heading is gone |
| `The wording varies slightly each time` | **0** | ✅ the separate line was deleted, as reported |
| `Replies are AI-generated and vary slightly each time, and can occasionally be wrong.` | **1** | ✅ the merged footnote is present |
| `Replies are AI-generated and can occasionally be wrong.` | **0** | ✅ the pre-merge footnote is gone |

**So the screenshot predates the edits.** The explanation is consistent with the standing scope rule
across all of these sessions: **nothing has been committed, nothing has been deployed, and `next dev` has
never been run.** Any page being rendered anywhere is therefore serving a build from before Task 4 and 5
landed. The parts of the restructure that DO show in the screenshot — the card title, the removed
website field, the preview above Connect — landed in the *earlier* task, so a build taken between the
two would show exactly the mixture described.

## 0.b ⚠️ AN ARTEFACT WORTH RECORDING, BECAUSE IT ALMOST PRODUCED THE WRONG ANSWER

`grep -c "Replies are AI-generated and can occasionally be wrong."` returned **1**, which reads as *"the
old footnote is still there"*. It is not. **`grep` treats `.` as a wildcard**, so the pattern matched the
landing-page string quoted inside a code comment:

```
          Replies are AI-generated and can occasionally be wrong — you can view every message and reply
```

🔴 **The trailing `.` matched the space before the em dash.** Fixed-string counting returns **0**.
**This is the same class as the JSX-comment trap you warned about** — an artefact in a comment
impersonating the thing being searched for — and it is the second variety of it in this file. **Count
fixed strings, and read the hit before believing it.**

---

# TASK 1 — THE DESCRIPTION LINE

**Used:** `Auto-replies answer customer questions automatically, day or night — using your live menu and schedule.`

**Rendered `text-base text-slate-500`** — larger than the preview's `text-sm` body copy as asked, and
un-bolded so it does not compete with the `text-base font-bold` title above it. **Outside the native
hide**, with the title and the preview (verified positionally in 5.a).

## 1.a Why the subject is the FEATURE, not the reader

Your constraint was that it be true for every reader. **Your suggested line began "Answer customer
questions automatically…", which reads as the second person** — an instruction or a statement about
what *this operator's* setup does. **For a Starter operator that is false**, and the card offers nothing
to correct it.

🔴 **AND THE CARD LOST ITS ONLY CORRECTION DURING THIS TASK.** The `can('whatsapp_replies')` FeatureGate
with `showUpgrade` lived in the WhatsApp row's live branch. Greying that row removes it, so **after this
change there is genuinely no upgrade affordance in the card at all** — exactly the condition your
constraint anticipated. Naming *"Auto-replies"* as the grammatical subject makes the sentence a
description of the feature rather than a claim about the reader's entitlement, and **the three "Coming
soon" rows below now carry the current state for everyone.**

✅ **Names no channel** (Messenger and Instagram are unbuilt; WhatsApp awaits Meta). ✅ **Promises no
viewer for past replies** — no such surface exists.

---

# TASK 2 — THE CHAT-SHAPED RESULT AREA

✅ **ONE BOX, NOT TWO.** The preview remains plain content in the card; **only the result area is
bordered.** No panel was added around the preview.

**What was built:**

- **A bordered, rounded region** — `rounded-xl border border-slate-200 bg-slate-50 p-3 min-h-[8rem]`.
  ⚠️ **The `min-h-[8rem]` is load-bearing:** every state renders inside it, so the box never resizes
  mid-request and the page does not jump.
- **The question right-aligned in a bubble.** A new `asked` state holds the submitted text separately
  from the input, so the question **stays on screen through the request and after it returns** — which
  is what makes it read as a conversation rather than a form.
- **The reply left-aligned in a bubble**, `whitespace-pre-wrap`, with the truck's emoji sign-off
  rendering exactly as the classifier produces it (untouched).
- **An empty state inside the box** — *"Your preview will appear here."*, vertically centred. Not a void.
- **Loading inside the box**, beneath the question bubble.
- **Errors inside the box**, reported as themselves.
- **The input row and Try it button BELOW the box; chips ABOVE it.**

## 2.a 🔴 A REAL META-IMITATION RISK WAS REMOVED, NOT JUST AVOIDED

The previous version rendered the reply on **`bg-green-50 border-green-200`** — a green message bubble,
which is precisely the WhatsApp client cue your instruction prohibits, sitting in a card about WhatsApp,
with a Meta app review pending. **That was already in the file before this task.**

```
  green-* classes in the preview: NONE
  accent used            : ['bg-orange-100', 'ring-orange-400', 'text-orange-900']
  neutral palette        : ['bg-slate-50','bg-slate-100','bg-slate-200','border-slate-200','text-slate-400', …]
```

✅ **No green, no logo, no tick marks, no wallpaper.** The operator's own message uses the page's
existing orange accent; the reply is white on neutral slate. **A generic chat shape, not a clone.**

## 2.b Both required behaviours preserved

✅ **The null reply is still a RESULT, not an error** — *"No reply would be sent."* with its
explanation, and **deliberately not drawn as a bubble**: the point is that nothing would be sent, so
nothing is drawn as a message.

✅ **The classification label is kept**, with the reason written at the site: it is the live diagnostic
for the missing-API-key degradation, where every question comes back labelled as the menu bucket. The
comment says **"Do not remove this as clutter."**

---

# TASK 3 — PHONE LAYOUT, AND HOW I ESTABLISHED IT

## 3.a 🔴 THE HONEST ANSWER FIRST: I CANNOT ESTABLISH THIS WITHOUT RENDERING, AND I DID NOT RENDER IT.

`next dev` was not run, per scope. **Nothing has been displayed at 375px or at any width.** What follows
is a static audit of the classes actually in the file — it is evidence about the *rules* the layout
follows, **not an observation of the layout.** You asked for that answer if it was the true one; it is.

## 3.b What was implemented, per requirement

| Requirement | Implementation |
|---|---|
| chips wrap without overflow | `flex flex-wrap gap-2` — three chips of 11-19 characters cannot fit one 375px line and wrap rather than overflow |
| input not squeezed to nothing | **`flex flex-col sm:flex-row`** — below 640px the input takes its own full-width line and the button sits under it; above `sm` it returns to one row |
| chat box no horizontal scroll | `overflow-hidden` on the box, **`max-w-[85%] break-words`** on both bubbles, `whitespace-pre-wrap` on the reply |
| WhatsApp row usable | ✅ **the squeeze is gone entirely** — the row is now a label + badge, and the greyed number sits **full width on its own line** rather than competing with a button |

## 3.c The static audit, in full

```
    fixed widths      : ['w-20']
    fluid widths      : ['flex-1', 'min-w-0', 'w-full']
    max widths        : ['max-w-[85%]']
    wrap / stack      : ['flex-col', 'flex-shrink-0', 'flex-wrap', 'sm:flex-row', 'sm:flex-shrink-0']
    overflow/breaking : ['break-words', 'overflow-hidden', 'truncate', 'whitespace-pre-wrap']
    min heights       : ['min-h-[8rem]']

    widest fixed element: w-20 = 80px  (of a 375px viewport)
    label(80) + badge(~90) + gap(8) = ~178px  ->  ~197px of slack on the narrowest row
```

✅ **There is exactly one fixed width in the whole card and it is 80px.** Every text field is `w-full`
or `flex-1` **with `min-w-0`** — the flag that lets a flex child shrink below its content width, which
is the usual cause of a "squeezed to nothing then overflowing" input.

⚠️ **WHAT THE AUDIT CANNOT TELL YOU:** whether the badge's rendered width matches my ~90px estimate,
whether `min-h-[8rem]` is the right height for a two-line reply, and whether the wrapped chip row looks
deliberate or ragged. **All three need a browser.**

---

# TASK 4 — THE CHANNELS BLOCK

## 4.a ✅ THE STOP CONDITION DID NOT FIRE

`FEATURE_SECTIONS` is **already exported** from `lib/plan-features.ts` **and already imported by this
file** for the Billing tab:

```tsx
import { PLAN_PRICES, PLAN_DESCRIPTIONS, TRANSACTION_ROWS, FEATURE_SECTIONS, FOOTNOTES } from '@/lib/plan-features'
```

**No change to that module was needed, and none was made.**

## 4.b ⚠️ ONE ROW GOVERNS BOTH CHANNELS, BECAUSE THE MATRIX HAS ONE ROW

The matrix carries **`'Messenger & Instagram auto-replies'` as a single row** (`pro: 'coming_soon',
max: 'coming_soon'`), with its own comment forbidding a re-merge with the WhatsApp row. **There is no
per-channel flag to read**, so one lookup drives both rendered rows. **Inventing a second flag here would
be a second source of truth** — which is the thing the instruction was protecting against.

```tsx
function isRowComingSoon(rowName: string): boolean {
  for (const section of FEATURE_SECTIONS) {
    const row = section.rows.find(r => r.name === rowName)
    if (row) return row.pro === 'coming_soon' || row.max === 'coming_soon'
  }
  return true
}
```

🔴 **THE NOT-FOUND CASE RETURNS `true`, AND THE DIRECTION IS DELIBERATE.** This is keyed on a row NAME
string — **the same fragility the manual already records for `findPlanParityViolations()`, which reads
the same names and goes silently green when a row is renamed.** An unfound row here therefore renders as
*"coming soon"* (promising nothing) rather than as live (a control that does nothing). **Fail toward the
smaller claim.**

## 4.c 🔴 WHATSAPP'S COMING-SOON STATE DOES **NOT** COME FROM THE MATRIX, AND MUST NOT

Your appended instruction — *"make the whatsapp connect show coming soon as well and grey it out. i'll
switch once we have approval"* — meets Task 4's "drive it from the flags" rule head-on, **because the
matrix says the opposite**: the WhatsApp row reads `pro: true, max: true`.

**That is not a stale flag. It is a different fact.** The matrix describes **which plan tier includes the
feature**; your instruction is about **Meta's approval status**. Editing the matrix to `'coming_soon'`
would do two harmful things:

1. 🔴 **It would rewrite the public landing pricing table and the Billing tab for customers**, turning a
   shipped Pro feature into a roadmap item.
2. 🔴 **It would silence the parity guard on that row.** `findPlanParityViolations()` only inspects
   cells that are a hard `true`; a `'coming_soon'` cell is skipped entirely. **The gate/marketing
   cross-check would go quiet on a live feature.**

**And editing that module is forbidden by this brief anyway.** So it is a local switch, at module scope,
with the reversal condition on it:

```tsx
const WHATSAPP_LIVE: boolean = false
```

⚠️ **Typed `boolean` rather than inferred as `false` on purpose** — it keeps both JSX branches
type-checked and stops a linter reporting the live branch as unreachable. **The live branch is not dead
code; it is the code this switch exists to bring back.** Flip it to `true` and the editable input and the
Connect button return, unchanged.

## 4.d What the block renders

**"Channels"** subheading (`text-sm font-bold text-slate-700`), the **moved caption** *"Requires Business
accounts on each platform."* beneath it — now with three rows as its subject — then:

| Row | Rendered |
|---|---|
| **WhatsApp** | greyed label + `Coming soon` badge, **plus the saved number in a disabled full-width input** so an operator who set one can still see it |
| **Instagram** | greyed label + `Coming soon` badge. No input, no button. |
| **Messenger** | greyed label + `Coming soon` badge. No input, no button. |

⚠️ **Instagram and Messenger are BACK after being removed on 14 August for Guideline 2.1** — and the
comment says why that is now acceptable: they carry **no control at all**, so there is nothing a user can
see and fail to operate; they are a roadmap **label**, which the manual distinguishes from an incomplete
**control**. 🔴 **And they are only acceptable because the native hide covers them** (Task 5).

---

# TASK 5 — THE NATIVE HIDE

## 5.a Positional verification, JSX comments blanked

```
    <Card>                     9194
    title "Auto-replies"       9195      <- OUTSIDE
    description line           9207      <- OUTSIDE
    <WhatsAppReplyPreview/>    9243      <- OUTSIDE
    {!isNativeApp() && (<>     9245      <- hide OPENS
      border-t divider         9251
      "Channels" heading       9258
      caption                  9260
      WhatsApp label           9279
      Instagram label          9341
      Messenger label          9345
    </>)}                      9352      <- hide CLOSES
    </Card>                    9353

    exactly ONE wrapper in this card      : True
    title/description/preview OUTSIDE     : True
    Channels block and all 3 rows INSIDE  : True
```

## 5.b 🔴 THE NATIVE-RENDERED STRUCTURE, STATED EXPLICITLY

With lines 9245-9352 removed:

```
    <Card className="p-4 space-y-3">
      Auto-replies                                                   <- title
      Auto-replies answer customer questions automatically, day …    <- description
      [ the preview block ]                                          <- heading, 2 lines, chips, chat box, input, footnote
    </Card>
```

✅ **Title, description, preview. Nothing else.**

- **No orphaned "Channels" heading** — it is inside.
- **No stray divider** — the `border-t` is inside, on the subsection it separates.
- **No empty caption** — inside.
- **No coming-soon rows** — all three inside. 🔴 **Which is the point: Apple rejects "coming soon"
  placeholders, and this card now has three of them.**

## 5.c ✅ THE WRAPPER IS BYTE-UNCHANGED

```
  WITH JSX COMMENTS BLANKED:
    open   before=1  after=1  same: True
    close  before=1  after=1  same: True
    wrapper line before: ['        {!isNativeApp() && (<>']
    wrapper line after : ['        {!isNativeApp() && (<>']
    => byte-identical: True
```

**Not modified, not narrowed, not re-scoped, and no second wrapper was added.**

---

# §6 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Task 0 reconciliation | fixed-string counts, not grep | ✅ **both applied; screenshot stale** |
| Card structure and order | positional scan, comments blanked | ✅ **as specified** |
| Exactly one wrapper | same scan | ✅ **1 open, 1 close** |
| Wrapper byte-unchanged | comment-blanked line compare vs pre-task copy | ✅ **identical** |
| No WhatsApp imitation | class scan of the preview | ✅ **zero `green-*`** |
| Coming-soon flags from the matrix | `FEATURE_SECTIONS` already imported | ✅ **no module change** |
| `lib/plan-features.ts` untouched | mtime | ✅ **09:42:56 yesterday** |
| Phone layout | 🔴 **static class audit only** | ⚠️ **NOT rendered — see 3.a** |
| Syntax | TypeScript parser, `parseDiagnostics` | ✅ **clean** — a parse check, **not** a typecheck |
| Character census | NUL / control / carrier-aware selectors | ✅ **0 NUL; bare-glyph set identical to HEAD** |

---

# §7 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED, AT ANY WIDTH.** The chat box, the bubbles, the empty state, the
   wrapped chips, the stacked input row and the three channel rows have never been displayed. **The 375px
   answer in Task 3 is a class audit, not an observation.**
2. 🔴 **THE `min-h-[8rem]` HEIGHT IS A GUESS.** It is what stops the box jumping; whether it is the right
   height for a one-line reply versus a four-line one has not been seen.
3. ⚠️ **The `Coming soon` badge width is estimated, not measured** — the ~197px of slack in 3.c depends
   on it.
4. ⚠️ **`WHATSAPP_LIVE = true` has never been rendered either.** The live branch is preserved and
   type-checked, but the path back has not been exercised. **Flip it somewhere you can look before you
   flip it in anger.**
5. ⚠️ **The preview route has still never been called and no real model call has been made through it**,
   so the chat box has never displayed a real reply.
6. ⚠️ **No typecheck was run**, only a parse.

## 🔴 TWO THINGS FOR YOU

- **The card now has no upgrade affordance** (1.a). Greying WhatsApp removed the `FeatureGate`, so a
  Starter operator sees a feature card with no way to buy it. The description is worded to survive that,
  **but if the card should sell the feature, that is a separate build.**
- **The green reply bubble was live in the file before today** (2.a) — a WhatsApp-coloured message
  bubble in a WhatsApp card during a pending Meta review. **It is gone, but it reached the working tree,
  and it reached it from me.**
