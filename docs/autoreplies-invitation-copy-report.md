# Auto-replies preview — invitation copy

**Date:** 21 August 2026
**Status:** built, **NOT deployed, NOT committed, `next dev` NOT run.** Joins the undeployed batch.
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **PRECONDITION CHECKED FIRST, AS INSTRUCTED.** The block was in exactly the state the tidy report
describes, so I edited the right place:

```
  actual order  : ['heading','intro line','input placeholder','Send button','chips','chat box','empty state','footnote']
  expected      : ['heading','intro line','input placeholder','Send button','chips','chat box','empty state','footnote']
  input+button ABOVE chips : True
  chips ABOVE chat box     : True
  STATE MATCHES TIDY REPORT: True
```

✅ **ONE FILE CHANGED: `app/manage/[token]/page.tsx`.** Four strings, and the comments that explain them.

---

# TASK 1 — THE HEADING

**Was:** `See what a customer gets back`
**Now:** `Try it before you connect`

Unchanged styling — `text-sm font-bold text-slate-700 mb-0.5`, the subsection-heading weight this card
already uses.

✅ **YOUR NOTE ABOUT "before you connect" IS RECORDED AT THE SITE, IN THE DIRECTION YOU ASKED FOR** —
as a decision to protect, not a caveat implying a mistake:

> *"🔴 "BEFORE YOU CONNECT" IS DELIBERATELY FORWARD-LOOKING. DO NOT "CORRECT" IT. There is no connect
> action on this card today — WhatsApp is coming-soon behind WHATSAPP_LIVE — and that is beside the
> point: the preview exists so an operator can try the feature AHEAD of connecting, which is its purpose
> whether or not the control is live this week. This is not an oversight and it is not a stale reference
> to a removed button."*

⚠️ **Worth knowing why that comment earns its place:** this card has already lost a Connect *button* to
the `WHATSAPP_LIVE` switch, so a heading naming an action that has no visible control is exactly the
shape a later reader "tidies away". Naming it as intentional is what stops that.

---

# TASK 2 — THE INTRO LINE

**Was:** `Ask anything a customer might ask. Nothing is sent — this is just a preview.`
**Now:** `Type a question like a customer would ask, and see exactly what they'd get back. Nothing is sent to anyone.`

Unchanged styling — `text-sm text-slate-500`.

⚠️ **The apostrophe is written `&apos;`**, matching how this file escapes apostrophes in JSX text
elsewhere (`You&apos;re on a free trial`). It renders as `they'd`.

✅ **YOUR REASON IS IN THE CODE, PHRASED SO IT CANNOT BE READ AS TASTE:**

> *"🔴 THE HEADING AND THIS LINE INSTRUCT; THEY DO NOT DESCRIBE. … **The invitation is the point of the
> block**, so the copy asks the operator to do something. Do not revert this to descriptive phrasing as a
> stylistic preference — the change of voice is the change."*

---

# TASK 3 — THE INPUT PLACEHOLDER

**Was:** `Ask something a customer might ask`
**Now:** `Try: are you open tonight?`

✅ **Used verbatim. No deviation** — same capitalisation, same colon, same question mark.

✅ **AND IT CLOSES A PROBLEM I FLAGGED IN THE LAST REPORT.** The reorder had left the placeholder
echoing the line directly above it — *"Ask something a customer might ask"* under *"Ask anything a
customer might ask…"*. **A concrete example demonstrates and invites at once, which the abstract
restatement did neither of.** The comment at the site now records it as resolved rather than
outstanding.

⚠️ **One consequence, small and worth naming:** the placeholder is now a *schedule* question, while the
three chips are one schedule question and two menu questions. **The first thing an operator reads
therefore points at the SPECIFIC_QUERY path** — which happens to be the one that best exposes the
missing-API-key degradation (§5 of the layout report), so the bias is in a useful direction.

---

# TASK 4 — THE EMPTY STATE

**Was:** `Your preview will appear here.`
**Now:** `Your reply will appear here`  *(no full stop, exactly as given)*

✅ **Visually subordinate, unchanged:** `text-sm text-slate-400 text-center`, centred by
`flex-1 flex items-center justify-center` inside the box. That is the quietest weight in the box and
lighter than any content that replaces it.

## 4.a ✅ IT CANNOT SHIFT THE BOX HEIGHT — AND THIS ONE IS ARITHMETIC, NOT A GUESS

You asked me to say if I could not establish this without rendering. **I can establish it**, and here is
the working rather than the assertion:

| | |
|---|---|
| The box | `min-h-[8rem]` = **128px** floor |
| The empty state | **one line** of `text-sm` = 20px line-height |
| Box padding | `p-3` = 12px top + 12px bottom = **24px** |
| **Empty-state content height** | 20 + 24 = **44px** |

**44px is far below the 128px floor, so the min-height governs and the box renders at exactly 128px
while empty.** When the first reply arrives the empty state is replaced by content that is also under
128px for a short reply — so **there is no jump** — and the box grows only when real content genuinely
exceeds the floor, which is what a min-height is for.

⚠️ **THE ARITHMETIC DEPENDS ON THE DEFAULT SCALE, SO I CHECKED THAT TOO.** There is no
`tailwind.config.*` in this repo (Tailwind v4), and `app/globals.css`'s `@theme inline` block overrides
**only colours and fonts** — not `--text-sm`, not `--spacing`. **Nothing redefines the two numbers this
depends on.**

🔴 **THE ONE THING THAT WOULD BREAK IT IS WRITTEN AT THE SITE:** *"Anything that makes this state taller
than 128px would start moving the box; keep it to one short line."* A two-line empty state on a narrow
screen would still be ~64px and safe; a paragraph would not be.

---

# §5 — UNTOUCHED, AS REQUIRED

| Invariant | Count / check | Result |
|---|---|---|
| AI footnote | 1 | ✅ unchanged |
| Classification label | 1 | ✅ unchanged — still the missing-API-key diagnostic |
| Null-reply-as-result | 1 | ✅ unchanged |
| Chips fill the input and run it | `setMessage(ex); void run(ex)` | ✅ unchanged |
| `min-h-[8rem]` | 1 | ✅ unchanged |
| `Send` button | 1 | ✅ unchanged |
| `WHATSAPP_LIVE` | `const WHATSAPP_LIVE: boolean = false` | ✅ unchanged, still a local boolean |
| Native-hide wrapper | comment-blanked compare vs pre-task copy | ✅ **byte-identical** |
| Exactly one wrapper in the card | positional scan | ✅ **1 open (9280), 1 close (9391)** |
| Title / description / preview outside | positional scan | ✅ **9226 / 9242 / 9278, all before 9280** |
| Channels + 3 rows inside | positional scan | ✅ **all between 9280 and 9391** |
| Zero `green-*` in the preview | class scan, comments blanked | ✅ **NONE** |
| Syntax | TypeScript parser | ✅ **parses clean, 0 diagnostics** — a parse check, **not** a typecheck |
| Character census | NUL / control / carrier-aware selectors | ✅ **0 NUL; bare-glyph set identical to HEAD** |

**Native-rendered card:** `<Card>` title + description + preview. **Nothing else.**

## 5.a ⚠️ ONE GREP RESULT THAT LOOKS WRONG AND IS NOT

`"See what a customer gets back"` still returns **1** on the raw file. **It is not rendered:**

```
  occurrences in RENDERED code (comments masked): 0
  occurrences in raw file                       : 1
```

The surviving instance is inside the comment recording what the copy was rewritten *from*. **Same class
as the two comment artefacts already recorded in this file** — a comment quoting the thing being searched
for. Masking comments before counting is the only truthful method here, and it is now the third time that
has mattered.

---

# §6 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** `next dev` was not run, per scope. **None of these four strings has
   been seen on screen**, at any width.
2. ⚠️ **THE BOX-HEIGHT CLAIM IS ARITHMETIC, NOT OBSERVATION** (4.a). The numbers come from Tailwind's
   default scale, which I verified is not overridden — **but I computed the height, I did not measure
   it.** That is a stronger footing than the layout questions in the previous two reports, and it is
   still not a screenshot.
3. ⚠️ **The new intro line is longer than the one it replaces** (108 characters against 76). At 375px it
   will wrap to more lines; whether the block now feels top-heavy before the input is a judgement nobody
   has made.
4. ⚠️ **`&apos;` renders as `'` — verified by convention in this file, not by rendering it.**
5. ⚠️ **The placeholder has never been seen against the chips**, which sit directly below it and are
   also questions. Whether the example reads as an instruction or as clutter next to three tappable
   examples is a visual call.
6. ⚠️ **The preview route has still never been called**, so the chat box has never displayed a real
   reply, and the empty-state-to-reply transition in 4.a has never actually happened.
