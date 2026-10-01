# Conditional lines explained in plain English, instead of accused of being half-written

**1 October 2026 · built on `17775ba` · `lib/outreach-template-render.ts`,
`components/admin/TemplatesPanel.tsx`, `scripts/outreach-templates-layout.cjs`,
`scripts/outreach-templates-render.cjs`**

Built on the current code, not on the v2 report's description: the editor is the single flex column
with Save pinned outside the scroller (`11229e3`), and this change sits inside that shape without
moving it — re-measured in both engines to prove it.

Nothing in the resolver's behaviour changed. `conditionMet` is byte-for-byte what it was; one thin
exported wrapper was added beside it. No `outreach_templates` row was created, edited, seeded or
deactivated; no SQL was run and none is needed; no email was sent; no database change was made;
every sequence guard and `EMAIL_FRAME_SANDBOX` is untouched.

---

## 0 · The premise that was wrong, because everything else follows from it

The red box said:

> **Half of a conditional pair:** `?next_event:` without `?no_next_event:`. Whichever half is
> missing, that branch never renders — the sentence simply disappears for those prospects, with
> nothing on screen to say so.

Every clause of that is **true**. The conclusion drawn from it — that this is a defect — is **wrong**,
and it was wrong in the common case rather than the rare one. A line that appears only when there is
something to say is the ordinary, correct use of this whole tier. *Hatches Up - map only* names the
truck's next pitch when there is one and says nothing when there is not. That is the copy as
written.

So the editor accused the operator of a mistake on **every view of a correct template**. A red box
that is usually wrong is worse than no red box, and the reason is specific rather than aesthetic:
the next red thing on that screen is `{{truck name}}` — a malformed token heading for a real food
business — and an eye trained to skip red skips that too.

**Three things in the editor descended from that same premise**, and all three are addressed here,
because fixing the warning alone would have left its logic running elsewhere:

| | Descended from "a one-sided condition is half-finished" |
|---|---|
| the red warning | fired on every one-sided condition |
| **the Insert condition menu** | offered **pairs only**, one click writing both halves — so seven of today's nine conditions were not in the menu at all |
| **`condPairs` in the panel** | a second copy of "which conditions have a negative half", with no test able to reach it |

---

## 1 · One grey note per conditional line

Under the message box, where the red warning was, in `text-[11px] text-slate-500` — no heading, no
border, no background:

> “I run villagefoodie.co.uk and you…” only appears for trucks with an upcoming event. Right now
> that's 12 of the 105 trucks this template goes to — the other 93 won't see this line.

And when both halves are written, **one** note rather than two:

> This part changes depending on whether the truck has an upcoming event.

**It makes no claim and carries no verdict.** It states who reads the line and how many that is
today, and leaves the decision where it belongs.

### A pair gets one note, and that is not a shortcut

With both halves written, every truck reads one line or the other. Naming an audience for each half
would print "12 of 105 see this" above "93 of 105 see this" — true of each line, and misleading
about the pair, which has no audience because it has no non-readers. What is true is that the
**wording changes**, so that is what it says. Both halves are consumed by the single note.

### An unknown condition gets no grey note at all

A grey note about who would read a line that can never render is the mirror image of the mistake
being undone here. Unknown names go to red (§2) and are excluded from the notes.

### Naming the line by its opening words, not by the condition

The condition name is the wrong handle twice over: a template with two `?next_event:` lines would
get two notes reading identically, and `next_event` is the vocabulary of the mechanism rather than of
the copy. The first few words are what the eye scans the message box for.

⚠️ **Tokens are left exactly as typed** — `{{truck_name}}` stays `{{truck_name}}`. Expanding them
would need a prospect, and the note would then change with whichever one the preview is pointed at,
for a sentence that is about the **template**. A marker on an empty line has no words to quote and
falls back to naming the marker.

### Where the notes sit, and why they did not move

They occupy **exactly the slot the red warning occupied** — after the "Values this message fills in"
box, inside the editor's scroller, above Save. The brief asks for wording and presentation, and
moving a block in this column is neither: §9 of the v2 report is about what happens when blocks in
this column are rearranged, and the measured acceptance (`message ends where the values box begins`,
`8 blocks in order`) pins the order that was arrived at. **Both engines were re-run and report the
identical geometry** (§7). If they would read better directly under the textarea, that is a
one-line move and a re-measure — say so and it is done.

---

## 2 · Red kept for what is actually broken

Two new reds, both derived rather than listed, each saying what is wrong and what to do:

**An unknown condition name.** `conditionMet` returns false for a name it has no branch for, so the
line is dropped for **every truck, every time**, with nothing anywhere saying so. `?next_evnt:` is
not a style choice — it is a sentence that can never render.

> **Unknown condition:** `?next_evnt:` — that is not a condition this system knows, so the line is
> dropped for every truck. Use one from "Insert condition ▾".

**A marker that is not at the start of its line.** `COND_LINE_RE` is anchored, so
`…and ?next_event: they are at the green` is **not a condition at all**: the renderer sees ordinary
prose, substitutes the tokens in it, and **the characters `?next_event:` are emailed to the
prospect**. Same class of failure as a malformed `{{truck name}}` — text the operator believed was a
directive arriving as literal punctuation — and **invisible to every other guard here**, because all
of them read `{{…}}` or `[[…]]`.

> **Condition in the middle of a line:** `?next_event:` — a condition only works as the FIRST thing
> on its line, so this one would be sent as those exact characters. Move it to the start of its own
> line.

### The restraint that keeps these two honest

`misplacedConditionMarkers` reports **only markers whose name is a condition the resolver knows**.
`?next_event:` mid-line is unambiguously a misplaced directive; a bare `?something:` in prose is not,
and a red error on a sentence that is simply a question would be precisely the false alarm this task
exists to remove. 🧪 Checked: `Fancy a demo? Here is the link: {{demo_link}}` reports nothing. A
mistyped name at the **start** of a line is caught by the other red, so neither case is lost.

It also scans **every** occurrence per line rather than the first, so a line that opens with a valid
marker and repeats it later is still reported for the repeat.

**Unchanged and still red:** the malformed-token guard (`malformedTokensIn`) and the must-resolve
stop (`{{demo_link}}` with no live demo). **No red for a one-sided condition, ever** — asserted from
both sides: the string "Half of a conditional pair" and the identifier `halfPairs` are both banned
from the panel, and variant **V17** puts the red box back and is caught.

---

## 3 · The Insert condition menu, in plain words

Every condition the resolver knows, worded for somebody writing copy:

| | |
|---|---|
| `?next_event:` | **Only if they have an upcoming event** |
| `?no_next_event:` | **Only if they have no upcoming event** |
| `?order_url:` | **Only if we have their ordering page** |
| `?website:` | **Only if we have their website** |
| `?contact_name:` | **Only if we have their name** |
| `?lead_hu_ordering:` | **Only if their type is "Hatches Up — ordering"** |
| `?lead_hu_map:` | **Only if their type is "Hatches Up — map only"** |
| `?lead_on_vf:` | **Only if their type is "On the Village Foodie map"** |
| `?lead_not_listed:` | **Only if their type is "Not listed"** |

The plain line is the prominent one; the marker sits under it, smaller and monospaced, because it is
what gets typed into the message but not what the choice is made on. Choosing one inserts that
marker at the start of the current line.

**Still read from the resolver, never a second list.** The names come from
`caseLabelsOf(conditionMet)` exactly as before — the switch's own case labels — so a condition added
to the resolver appears in the menu the day it is written. What was added is **wording for names that
are already derived**, in a description table beside `CONDITION_DESCRIPTIONS`, with a fallback
(`Only if ?name:`) for a condition nobody has worded yet. The four lead conditions are worded from
`LEAD_TYPE_LABELS` rather than from a second set of names for the same four types.

### It now lists nine conditions where it listed one entry

This is the part of the task that was not a wording change. The menu offered **pairs**, and
`?website:`, `?contact_name:`, `?order_url:` and the four `?lead_*` lines **have no negative half
even in principle** — so seven of nine conditions were behind "type it from memory", and the one
pair was offered as a both-halves insert.

⚠️ **Inserting a pair is two clicks now, and that is the right trade.** Writing two lines when one
was wanted is visible and deletable — the operator watches both lines appear. The reverse, a menu
that could not offer `?website:` at all, was invisible.

⚠️ **`ownLines` survives and matters more than before**: a marker is recognised only as the first
thing on its line, and a mid-line one is now red.

---

## 4 · The preview footer says what was hidden

**Was:** `Dropped: next_event`

**Now:**

> Hidden for this truck: “I run villagefoodie.co.uk and you…” — it only shows for trucks with an
> upcoming event.

Three things were wrong with those two words: *dropped* is the renderer's verb for what it did
rather than the operator's for what happened; `next_event` is a case label; and **neither says which
line went**, which is the only thing that lets the message be checked for reading correctly without
it. The line is named by the same opening words the grey notes use, so the note above the box and
the chip below the preview refer to the same thing in the same way.

⚠️ **It is handed `renderTemplate`'s own `droppedConditions` and only looks up the wording.** It
re-decides nothing, which is what keeps **"Simulate no upcoming event"** working exactly as it did:
the checkbox changes the context, the renderer drops a different line, and this names whatever the
renderer reports. 🧪 Asserted in both directions — the same body reports one hidden line with the
event forced off and none with it on.

⚠️ `droppedConditions` carries **one entry per distinct condition**, not per line, so two lines
sharing a condition are reported as `2 lines` rather than one standing in for both.

---

## 5 · The counts, and the four derivations they are made of

"Trucks this template goes to" = the **contactable** prospects in the sequence boxes this template
fills. Every part of that is an existing definition, reused:

| What | Which function | Why not a copy |
|---|---|---|
| contactable | **`channelFor`** | 🧪 the predicate behind the 76/155 split; it gates the work queue and draws the list's reachability ticks |
| a truck's type | **`effectiveLeadType`** | the grid's own call, frozen-value-first, so a truck mid-sequence is counted under the type its sequence started in |
| the render context | **`contextFromProspect`** | the preview's own builder — the count and the rendered preview cannot disagree about a truck |
| does the line keep this truck | **`conditionHolds`** → `conditionMet` | the number under the box is produced by the function that decides it at send time |

A box is (channel, step, lead type). A truck is in it when the channel we would reach it on is the
box's channel and the box's row is either its type or the "All trucks" default.

### Two deliberate differences, both stated rather than assumed

**`channelFor`, not `step.channel`.** The trap OutreachPanel already documents: `nextStep` builds its
`base` with `channel: null` and **every stop returns that base**, so a do-not-contact prospect with
an email reports `step.channel === null`. Reading the step would file reachable trucks under "cannot
be reached" and undercount the audience by exactly the stopped rows.

**Step is not part of this, and it is the one place this differs from the grid's pills.** The grid
answers *who is waiting at this box now* — a work queue, which changes every morning. A note under a
message box answers *who will ever read this sentence* — an audience. A truck on rung 1 today
reaches rung 3 next week and reads the chase then. Counting only today's due rows would print a
number that **shrinks as the work gets done, under copy that did not change**, and the operator would
reasonably read that as the line reaching fewer trucks.

### A template in no box

Counted across every contactable truck, **and the note says so**:

> …Right now that's 12 of the 105 trucks — this template is in no sequence box, so that is across
> every contactable truck — the other 93 won't see this line.

It is pickable by hand in the composer for any of them, so that is the honest denominator; printed
without the clause it would read as a sequence audience the template does not have.

### No count rather than a wrong one

`total` is **null until the prospect list has arrived**. That fetch is allowed to fail silently — the
preview degrades to "pick a prospect" — and `0 of 0 trucks` is a wrong answer stated confidently. The
sentence naming the audience is true without the number, so the number is omitted.

### And no nonsense sentence at either end of the count

A denominator of **zero** gets its own sentence rather than *"0 of the 0 trucks this template goes
to"* — which is arithmetically right and reads as nonsense. It happens for real: a template parked in
a WhatsApp box while no contactable truck is reachable on WhatsApp.

> …only appears for trucks with an upcoming event. No contactable truck is in this template's boxes
> at the moment, so nothing reads it either way.

At the other end, a line **every** truck sees says so, rather than *"the other 0 won't see this
line."* Both ends are pinned by checks, because a nonsense sentence under a correct template is the
same failure as the red box this replaced.

### The cost, which is the reason v2 deleted the last derivation like this

v2 removed a `match` derivation that walked all 231 prospects with a `chooseTemplate` call each,
**per render of the editor**, to compute a number nothing rendered any more. This one must not become
that, so it is split:

- **`reachable`** — the 231 `contextFromProspect` + `channelFor` calls — is a `useMemo` on
  **`[prospects]` alone**. It survives every keystroke and every change to the grid.
- Everything keyed on `slots` is a **plain derivation, not a `useMemo`**, for the reason this file
  already documents above `usedIn`: the React Compiler declines to preserve memoisation that closes
  over `slots`, says so as a **build error**, and a `useMemo` it has skipped is a lie about stability
  that reads as an optimisation.

> ⚠️ **The first attempt was exactly that mistake, and the compiler caught it.** `audience` was
> written as `useMemo(…, [prospects, slots, selectedId])` and produced
> `Compilation Skipped: Existing memoization could not be preserved … This dependency may be
> modified later` pointing at `slots`. **The expensive work was moved out of the slots-dependent part
> rather than the error silenced.**

What is left per render: a filter over ~5 boxes, and one `conditionHolds` call per contactable truck
**per condition actually written in the body** — 🧪 ~76 contactable rows and one or two conditions on
a real template, so a few hundred switch evaluations. That is microseconds, and the same price
`usedIn` and `slotTemplates` already pay. Harness check:
*the expensive half is memoised on the prospect list alone — not on the body, not on the grid.*

---

## 6 · Where the sentences live, and why it is not the component

`conditionNotes()` and `hiddenLineNotes()` are **pure functions in
`lib/outreach-template-render.ts`**, beside `conditionMet` and the wording table. The panel renders
what they return and composes no sentence of its own — the discipline this component already follows
for substitution, applied to the text that explains substitution.

The third reason is the one that matters: **the harness can assert the sentences by calling them.**
"A one-sided condition produces a grey note and no red" is a claim about produced **text**. Checked
with a regex over the component it is a claim about markup that happens to sit nearby — and the red
warning was never wrong about its markup either. It was wrong about what it meant.

### What was added to the resolver, and what was not

| Added | |
|---|---|
| `conditionHolds(cond, ctx)` | a **thin wrapper** delegating to the private `conditionMet`. ⚠️ A wrapper rather than exporting the declaration, because `conditionReference` reads that function's **source** through `caseLabelsOf(conditionMet)` and a bundler rewriting the exported text would break the vocabulary |
| `conditionalLinesIn(body)` | the renderer's own `COND_LINE_RE` and `split('\n')`, so what the editor calls a conditional line and what the renderer treats as one cannot drift |
| `misplacedConditionMarkers(body)` | §2 |
| `conditionNotes` / `hiddenLineNotes` | the sentences |
| `CONDITION_PLAIN` | a description table — three phrasings, because one phrasing bent to all three jobs reads wrong in at least two of them |

**`conditionMet` itself is unchanged**, and so is every rendering path. `renderTemplate`,
`renderWithFills`, `substitute` and the line-dropping rule are byte-for-byte what they were.

Three phrasings and not one: `only` for the menu, read before the marker exists; `shownTo` for a note
about a line already written; `axis` for a written pair, where there is no audience to name and what
is needed is the **question being asked**. `axis` is present **only on the positive half** of a pair
— `no_next_event` never leads one, so an axis there would be a sentence nothing can render.

### `condPairs` deleted from the panel

The pair rule — a condition with a `no_` counterpart in the switch — now lives once, inside
`conditionNotes`. The panel's copy was the only other one, and it was the one with no test able to
reach it. Nothing in the panel needed it once the menu stopped offering pairs.

---

## 7 · The harness

`scripts/outreach-templates-layout.cjs` — **126 checks (was 86), 25 broken variants, all failing as
required.**

The wording checks **call the real functions**; the panel checks assert only the wiring.

| New variant | What it breaks |
|---|---|
| **V17** | the red "Half of a conditional pair" comes back on a one-sided condition |
| **V18** | the condition menu goes back to a hand-kept list instead of the resolver's own |
| **V19** | "contactable" is re-implemented in the panel instead of asking `channelFor` |
| **V20** | the count stops asking the resolver and tests the date itself |
| **V21** | the audience counts by `leadTypeOf`, ignoring the type frozen at first contact |
| **V22** | the preview footer goes back to `Dropped: next_event` |
| **V23** | the note wording is composed in the panel again, beside the resolver's copy |
| **V24** | a written pair gets a note per half instead of one note |
| **V25** | the plain wording is dropped — every condition reads "Only if `?next_event:`" |

Each is caught by the check written for it, not by an unrelated one:

```
✓ FAILED as required  V17 … caught: 🔴 the red "Half of a conditional pair" warning is GONE, and so is the derivation behind it
                          caught: 🔴 …replaced by grey notes, one per conditional line, with no heading and no error styling
✓ FAILED as required  V19 … caught: 🔴 contactable is `channelFor` — the predicate that gates the work queue, not a copy
✓ FAILED as required  V21 … caught: 🔴 …a truck's type is `effectiveLeadType` — the grid's own call, frozen value first
```

**V21 is the plausible wrong answer, not a nonsense one.** `leadTypeOf` is the live derivation; using
it would count a truck mid-sequence under today's type rather than the one its sequence was framed
in — the exact drift `effectiveLeadType` exists to prevent.

**V25 exists because a check on the LIST is not a check on the WORDS.** With the wording table gone
the menu still lists every condition and still reads the resolver — and every entry says
"Only if `?next_event:`", which is the reference vocabulary this task replaces.

### One stale check, restated in place with its reason — not silently re-pointed

| The v2 check | Why it went stale | What it says now |
|---|---|---|
| `⚠️ the conditional PAIRS keep their own control — one click writes both halves` | **It still PASSED after the menu was rewritten**, because both things it actually tested (`function CondMenu`, `ownLines: true`) are still true. Its *claim* is not. And the claim was the **premise this task overturns**: "one click writes both halves" existed because a half-written pair was treated as a mistake — the same belief behind the red warning. It also had an unwritten cost: a pairs-only menu could not offer seven of today's nine conditions | `🔴 the condition menu offers EVERY condition, one marker per click, on its own line` — pinning `conds={condRef}`, the single-marker insert, the surviving `ownLines`, and **forbidding** `<CondMenu pairs=` |

### `scripts/outreach-templates-render.cjs` — a rename, and the re-measurement that proves it is one

The last block in the fixture's editor column was `warnBox`, containing the literal text
**"Half of a conditional pair"**. Left alone it would read as evidence the red box survives. It is
`notesBox` now, grey, saying what the block is.

🔴 **The geometry is unchanged**: the block's height is pinned at 44px in the markup and the
assertions index it **by id, never by its text or colour**. Both engines were re-run to prove exactly
that rather than to assert it:

| | Chromium | WebKit |
|---|---|---|
| 1440×800 — document vs window | **800 = 800** | **800 = 800** |
| 1440×800 — 8 blocks in order, no overlap | ✓ | ✓ |
| 1440×800 — message ends where the values box begins | **583 ≤ 595** | **583 ≤ 595** |
| 1440×800 — Save on screen, below the scroller | 715–755 | 715–755 |
| 2560×1400 — document vs window | **1400 = 1400** | **1400 = 1400** |
| 2560×1400 — message ends where the values box begins | **1183 ≤ 1195** | **1183 ≤ 1195** |
| panes' measured top / height | 146 / 626 and 146 / 1226 | identical |
| **1440×800 CONTROL — the pre-fix shape** | **REPRODUCED, 134px** | **REPRODUCED, 134px** |
| 1440×600 — message keeps its floor | 112px | 112px |
| 1440×600 — the pane scrolls, the page does not | ✓ | ✓ |

**Every number is identical to the v2 report's.** The control still reproduces, which is what makes
the no-overlap row mean anything.

---

## 8 · Verification

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npx next build` | **compiled successfully**, 96 static pages |
| `node scripts/outreach-templates-layout.cjs` | **126 passed**, 25 variants failing as required |
| `HG_RENDER=1` render measurement | **0 fails**, Chromium + WebKit, every number unchanged (§7) |
| `node scripts/run-harnesses.cjs` | **73 run · 73 passed · 0 failed** |
| goldens | `batch-rolling-golden.json` `8bdae817748ad334…`, `batch-reservation-golden-on.json` `e3f0a88099fd797c…` — **unchanged** |
| eslint, all four changed files | **14 errors, 0 warnings — identical to a worktree of HEAD.** **No new warnings, no new errors** |
| eslint, the two product files alone | **4 errors, 0 warnings in both trees** — same four rules, same four sites (line numbers shifted by the additions) |

The eslint comparison was run against `git worktree add /tmp/vf-head HEAD` rather than from memory,
over the same four paths in both trees. For the two product files both report `no-explicit-any` ×1 and
`set-state-in-effect` ×2 in the panel, and `no-unsafe-function-type` ×1 in the resolver
(`caseLabelsOf(fn: Function)` — pre-existing, and load-bearing: that function reads another
function's source).

**Nothing was written.** Three product/harness files plus one fixture changed; `git status` shows no
other modification. No `.insert/.update/.delete/.upsert` on `outreach_templates` was added — the
harness re-proves the editor's Save is still the only writer by walking `app`, `lib` and
`components`. No SQL was run and none is required by this change. No email was sent.

---

## 9 · What to test, with *Hatches Up - map only*

**Viewing and preview only. Do not press Save on any template.**

Steps 3 and 4 ask you to type into the message box. Nothing in this tab writes a row until **Save
template** is pressed — the draft lives in the browser, the notes and the preview are derived from it,
and the unsaved-changes guard will stop you leaving the row by accident. If you would rather not type
at all, do steps 1, 2, 5, 6, 7 and 8 and skip the two that need a temporary edit.

1. **The red box is gone.** Open **Templates → Hatches Up - map only**. Under the message, where the
   red *"Half of a conditional pair"* used to be, there is now a **small grey line** naming the
   conditional line by its opening words and saying it only appears for trucks with an upcoming
   event — followed by a count like *"Right now that's 12 of the 105 trucks this template goes to —
   the other 93 won't see this line."* **Nothing red, and no heading.**
2. **The count is believable.** The denominator is the contactable trucks in the boxes this template
   fills — cross-check it against the **Used in** chip: click the chip, and the box it outlines on
   the Sequence view is the one being counted from. Then pick a template that is **in no box**: the
   note says so in words, and counts across every contactable truck.
3. **A pair reads as one note.** In the message box, type `?no_next_event:` on its own line (do not
   Save). The two per-line notes collapse into a single *"This part changes depending on whether the
   truck has an upcoming event."* Delete the line again and the original note comes back.
4. **Red still works, for things that are broken.** Type `?next_evnt:` at the start of a line — red,
   naming it and pointing at the menu. Delete it. Now type `?next_event:` **in the middle** of an
   existing sentence — red, saying it would be sent as those exact characters. Delete that too.
   Leave the template as you found it.
5. **The menu is in plain words.** Click into the message, then **Insert condition ▾**. There are
   **nine** entries, each reading *"Only if …"* with the marker small underneath — including
   **"Only if we have their website"** and **"Only if we have their name"**, which were not in this
   menu before. Choose one: it lands at the start of the current line. Undo.
6. **The preview footer.** Pick a prospect **with** an upcoming event — no hidden-line chip. Pick one
   **without** (the picker marks them *(no upcoming event)*): the chip reads
   **"Hidden for this truck: “…” — it only shows for trucks with an upcoming event."** and names the
   line by the same words as the note above. **No `Dropped: next_event` anywhere.**
7. **"Simulate no upcoming event" still drives it.** With a prospect that *has* an event, tick the
   box: the line disappears from the rendered email and the chip appears, naming it. Untick: both
   reverse.
8. **The layout did not move.** Nothing is drawn across the bottom of the message; **Save** is
   visible without scrolling; make the window short and the editor scrolls inside its own pane with
   Save pinned. Check in Safari on the 16″ and on the 27″.
