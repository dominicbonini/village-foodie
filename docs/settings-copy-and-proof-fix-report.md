# Two small fixes: the offline-protection copy, and the `.proof` list

**Both are done.** They are in entirely separate files and share no code.

⚠️ **TWO THINGS IN HERE ARE NOT WHAT THE BRIEF EXPECTED, and both are stated up front rather than buried:**

1. 🔴 **Fix 2's defect is not reproducible in the CSS.** `.proof` sits inside `.final`, which already sets
   `text-align: center`, so wrapped lines are **already** centred — unlike the trust strip, which had no
   such ancestor. **I made the change anyway** and it is **inert today**. My earlier report said `.proof`
   carried the defect; **that was wrong, and this corrects it.** §2 shows the inheritance chain.
2. **Fix 1's description already sat before the options** — as the brief allowed for. **Nothing was
   reordered.** Only the sentence changed.

**And one addition you asked for mid-way:** Settings → Van now matches the dashboard card. §1B.

---

# PHASE 1 · READ-ONLY FINDINGS

## 1 · Fix 1 — where the box actually lives

🔴 **THERE ARE TWO OFFLINE-PROTECTION CARDS, and the one you described is the DASHBOARD's Settings tab**,
not Settings → Van. **Established by render order, which matches your description exactly:**

| Your description | `app/dashboard/[token]/page.tsx` | `app/manage/[token]/page.tsx` (before) |
|---|---|---|
| 1 · description line | ✅ `OFFLINE_PROTECTION_CARD_DESCRIPTION` | ✅ `OFFLINE_PROTECTION_SWITCH_HELP` |
| 2 · orange warning | ✅ `⚠️` + LEAD + BODY, amber | ❌ **below the options**, and a different string |
| 3 · two radio options | ✅ | ✅ **above** the orange line |

**The dashboard card, anchored on its identifiers. READ:**

```tsx
<p className="text-sm font-semibold text-slate-800">{OFFLINE_PROTECTION_SWITCH_LABEL}{demoLockChip}</p>
<p className="text-xs text-slate-500 mt-0.5">{OFFLINE_PROTECTION_CARD_DESCRIPTION}</p>
{!isDemo&&<p className="text-xs text-amber-600 mt-1">⚠️ <strong>{OFFLINE_PROTECTION_EXPLAINER_LEAD}</strong> {OFFLINE_PROTECTION_EXPLAINER_BODY}</p>}
```

…then the toggle, then `{!isDemo&&effectiveOfflineProtection&&(` … the `OFFLINE_PROTECTION_MODES` radio
group.

### 1a · The description line, verbatim, and where it sits

**Before — `lib/copy/offlineProtection.ts`:**

```ts
export const OFFLINE_PROTECTION_CARD_DESCRIPTION =
  'What happens when this van loses its connection.'
```

✅ **IT ALREADY SITS BEFORE THE OPTIONS.** Saying so and changing nothing about the ordering, as
instructed. In source order the card is: label → **description** → orange warning → toggle → radio
group. **No JSX was moved, in either card, for the ordering.**

**After:**

```ts
export const OFFLINE_PROTECTION_CARD_DESCRIPTION =
  'Decides what happens to incoming orders when your device drops offline.'
```

✅ **The orange warning is untouched** — same string constants, same `text-xs text-amber-600 mt-1`, same
`⚠️`, same position, same `<strong>` on the lead. ✅ **The two option labels, their help text and the
toggle are untouched.** The whole of Fix 1a is **one string literal**.

## 1B · Settings → Van, matched to the dashboard (your mid-way request)

⚠️ **THIS WENT BEYOND THE ORIGINAL BRIEF BECAUSE YOU ASKED FOR IT MID-TASK**, and it is the larger of the
two edits. **What differed, and what I did:**

| | Dashboard | Settings → Van, before | Now |
|---|---|---|---|
| description | `CARD_DESCRIPTION`, always | `SWITCH_HELP` when ON, *"Off — online orders continue even if this device goes offline"* when OFF | **`CARD_DESCRIPTION`, always** |
| orange line | `⚠️` + **LEAD + BODY**, above the modes | `OFFLINE_PROTECTION_REMINDER`, a shorter paraphrase, **below** the modes, ON only | **`⚠️` + LEAD + BODY, above the modes** |
| on-enable panel | none | *"Got it"* panel repeating **LEAD + BODY** | **removed** |
| modes | radio group from `OFFLINE_PROTECTION_MODES` | the same array | **unchanged** |

🔴 **THE "Got it" PANEL HAD TO GO, and this is the one judgement call in the task.** It rendered *exactly*
the LEAD + BODY sentence that now sits permanently near the top of the card, so enabling the switch would
have printed the same paragraph twice, a few rows apart. The dashboard has no such panel — its permanent
line is the acknowledgement. **Its state (`showAutoPauseInfo`) and the two setter calls in
`handleToggleAutoPause` went with it**, and a comment stands where it was saying so.

⚠️ **If you want the on-enable acknowledgement back, say so — it is a revert of one block**, and the copy
constants it used are still exported.

🔴 **THE SCOPE DIFFERENCE IS UNTOUCHED, which is what "use the same rules that exist on that page" asks
for.** Settings → Van writes the **van default, applying to every event**, through
`handleToggleAutoPause` / `updateVanSetting`. The dashboard writes the **live event**, through
`toggleOfflineProtection` / `setOfflineMode`. **Not one write path, gate or argument changed on either
card** — only which sentences render and in what order. The card also keeps its own visual language
(teal card, teal radio dots, `border-teal-200` rules); the dashboard keeps white and orange.

### The two constants this leaves unused

`OFFLINE_PROTECTION_SWITCH_HELP` and `OFFLINE_PROTECTION_REMINDER` now have **no consumers** —
`grep -rn` across `app components` returns nothing for either. ⚠️ **I KEPT THEM, marked as unused with the
reason**, rather than deleting them: restoring either line is then an import, not a rewrite. **Their
comments were corrected**, because both described where they render and neither renders anywhere.

⚠️ **A comment I wrote earlier in this same task became false and was rewritten.** It said the Settings →
Van help *"was left as it was, because that card was not part of the change"* — true for about ten
minutes. It now records that both cards read the one constant.

## 2 · Fix 2 — the `.proof` list, and the finding

**The JSX. Both lists carry the identical three strings. READ — `app/landing/page.tsx`:**

```tsx
<div className="trust-strip">
  <ul className="trust-in wrap">
    <li><Check /> First month 100% free, everything unlocked</li>
```
```tsx
<div className="wrap final">
  …
  <ul className="proof">
    <li><Check /> First month 100% free, everything unlocked</li>
```

**The rule that fixed the first instance. READ — `app/landing/landing.css`:**

```css
.hg-landing .trust-in li { display: flex; align-items: flex-start; gap: .6rem; text-align: center; … }
@media(max-width:720px){
  .hg-landing .trust-in { flex-direction: column; align-items: center; gap: .8rem; }
}
```

**The `.proof` rules, all three of them. READ:**

```css
.hg-landing .proof { list-style: none; display: grid; gap: .6rem; }
.hg-landing .proof li { display: flex; align-items: center; gap: .6rem; font-family: var(--display); font-weight: 700; font-size: 1.02rem; color: var(--head); letter-spacing: -.01em; }
…
.hg-landing .final { text-align: center; }
.hg-landing .final .proof { justify-items: center; margin-top: 1.2rem; }
```

### 🔴 THE FINDING: THE DEFECT IS NOT REPRODUCIBLE HERE, AND I HAD IT WRONG BEFORE

**The brief's diagnosis of the *mechanism* is exactly right** — `justify-items: center` centres each
`<li>` **box** in the grid column and says nothing about the text lines inside it, precisely as
`align-items: center` did in the trust strip. **What differs is the ancestor.**

| | `.trust-in li` | `.proof li` |
|---|---|---|
| own `text-align` | none, before the fix | none |
| **inherited `text-align`** | 🔴 **none — nearest ancestor is `body`, so `start`** | ✅ **`center`, from `.hg-landing .final`** |
| result when an item wraps | second line reads left-aligned — **the reported defect** | **second line is already centred** |

**`text-align` is an inherited property**, `<ul className="proof">` is a child of
`<div className="wrap final">`, and `.hg-landing .final { text-align: center; }` is **ungated** — I
checked its nesting depth mechanically rather than by eye, and the brace balance immediately before that
rule is **0**, so it is not inside any `@media` block. The trust strip has no equivalent ancestor: its
containers are `.trust-strip` and `.trust-in`, neither of which sets `text-align`.

⚠️ **The anonymous flex item does not break the chain.** In `.proof li { display: flex }` the bare text
run becomes an anonymous block-level flex item, which inherits from the flex container — so it inherits
`center` too, exactly as it does in the fixed `.trust-in li`.

**So my earlier report, which listed `.proof` as carrying the trust-strip defect, was wrong.** It reasoned
from the missing declaration and did not follow the inheritance.

### What I changed, and why anything at all

```css
.hg-landing .final .proof li { text-align: center; }
```

**One declaration, on the `<li>` — the same property, the same value and the same element as the trust
strip's fix**, which is what "follow what the trust strip does rather than inventing a second approach"
asks for. ⚠️ **It changes no pixel today** and the comment above it says so in as many words. **What it
buys** is that the centring becomes a property of the list rather than of an ancestor: move `.proof` out
of `.final`, or drop that `text-align`, and the defect would otherwise return silently.

⚠️ **If you would rather not carry an inert rule, delete that one line and the comment above it** — there
is nothing else to unpick.

## 3 · Shared code between the two fixes: none

| | Fix 1 | Fix 2 |
|---|---|---|
| `lib/copy/offlineProtection.ts` | ✅ | — |
| `app/manage/[token]/page.tsx` | ✅ | — |
| `app/landing/landing.css` | — | ✅ |

✅ **No file, import, class name or string is common to both.** The landing page does contain the string
`'Offline Order Protection'` (`app/landing/page.tsx`, a feature-list key) — ⚠️ **it is a separate literal
in a separate file, it does not import the copy module, and neither fix touches it.**

---

# PHASE 2 · STOP CONDITIONS

| Condition | Result |
|---|---|
| Description cannot move before the options without moving the orange warning | ❌ **Not applicable — it was already before them.** Nothing moved |
| Fixing `.proof` would alter the desktop layout | ❌ **It alters no layout at any width.** §3 below |
| Instructions contradict | ❌ None. The mid-task request extended the brief; it did not conflict with it |
| Garbled span | ❌ None |

**None tripped.**

---

# PHASE 3 · VERIFICATION

**Method:** comment-stripped comparison of each file against a copy taken before the first edit (block and
JSX comments removed, so prose cannot register as a change). **`tsc --noEmit` passes and I am NOT offering
that as verification** — it is a breakage check. **Neither `next dev` nor `next build` was run.**

## Fix 1a · `lib/copy/offlineProtection.ts`

**28 executable lines before, 28 after. 1 removed, 1 added.**

```
-'What happens when this van loses its connection.'
+'Decides what happens to incoming orders when your device drops offline.'
```

## Fix 1b · `app/manage/[token]/page.tsx`

**8504 executable lines before, 8476 after. 31 removed, 3 added.** The whole diff:

```
-import { … OFFLINE_PROTECTION_SWITCH_HELP, … OFFLINE_PROTECTION_REMINDER } from '@/lib/copy/offlineProtection'
+import { … OFFLINE_PROTECTION_CARD_DESCRIPTION, … } from '@/lib/copy/offlineProtection'
-const [showAutoPauseInfo, setShowAutoPauseInfo] = useState<string | null>(null)
-if (enabled) { setShowAutoPauseInfo(vanId) } else { setShowAutoPauseInfo(null) }        (5 lines)
-<p className="text-xs text-slate-500 mt-0.5">{van.auto_pause_on_offline ? SWITCH_HELP : 'Off — …'}</p>  (6 lines)
+<p className="text-xs text-slate-500 mt-0.5">{OFFLINE_PROTECTION_CARD_DESCRIPTION}</p>
+<p className="text-xs text-amber-600 mt-1">⚠️ <strong>{…EXPLAINER_LEAD}</strong> {…EXPLAINER_BODY}</p>
-{van.auto_pause_on_offline && (<p className="mt-2 text-xs font-semibold text-amber-700">{REMINDER}</p>)}  (5 lines)
-{van.auto_pause_on_offline && showAutoPauseInfo === van.id && ( … "Got it" panel … )}    (13 lines)
```

⚠️ **Nothing else in the file is in the diff** — not the radio group, not `updateVanSetting`, not the
toggle button, not the card's container classes, not the surrounding Display-settings or Kitchen-capacity
sub-panels.

## Fix 2 · `app/landing/landing.css`

**223 declaration lines before, 224 after. 0 removed, 1 added.**

```
+.hg-landing .final .proof li { text-align: center; }
```

## 🔴 Reasoning about a 320px viewport, Fix 2

**READ-FROM-SOURCE. I cannot render the page and have not seen it.**

At 320px the `.wrap` gutter leaves roughly 280px of column. `.proof` is a single-column grid, so each
`<li>` is a grid item with `justify-self: center`:

- **The longest item, *"First month 100% free, everything unlocked"*** at `font-size: 1.02rem`, weight 700
  in the display face, **cannot fit 280px on one line.** The item's max-content width exceeds the column,
  so the box fills the column and the text wraps to two lines.
- **The second line's alignment comes from the anonymous flex item's `text-align`**, which is `center` —
  **inherited from `.final` before this change, and now also stated on the `<li>` itself. The computed
  value is `center` either way, so the rendering is the same before and after.**
- **All three items wrapping at once** is the same case three times over: each `<li>` fills the column,
  each wraps, each line centres. **No interaction between them** — `gap: .6rem` is a row gap in a
  single-column grid, and no item's height affects another's alignment.
- **The tick.** `.proof li` is `display: flex` with `align-items: center`, so the `<Check />` stays
  vertically centred against the **whole** two-line text block, and the text column starts to its right.
  A centred wrapped line therefore centres within the **text column**, not within the full `<li>` —
  **identical to what the fixed `.trust-in li` does**, which is the behaviour the brief asked me to match
  rather than improve on.

## Desktop, and how I established it

✅ **Unaffected, and this is established from the cascade rather than from looking.** Three facts, each
checked mechanically:

1. **`.hg-landing .final { text-align: center; }` is ungated** — brace-balance depth immediately before it
   is 0, so it is inside no `@media` block, and it therefore already applies at desktop widths.
2. **`text-align` inherits**, and `<ul class="proof">` is a descendant of `<div class="wrap final">` —
   the only `.proof` in the codebase (`grep` returns one JSX occurrence).
3. **The new declaration sets the value the element already computes.** Setting a property to the value it
   already has changes no layout at any width — and on desktop the items do not wrap at all, so even a
   changed value would have had nothing to act on.

⚠️ **The new rule is likewise ungated**, deliberately and for the trust strip's stated reason: an item can
wrap at any width, so a fix that only holds below a breakpoint is not a fix.

## Marking

| Claim | Status |
|---|---|
| Every JSX and CSS quotation above | ✅ **READ-FROM-SOURCE** |
| Executable line counts and diffs | ✅ **EXECUTED** — comment-stripped comparison against pre-change copies |
| `.hg-landing .final` is outside every `@media` | ✅ **EXECUTED** — brace-balance count, not eyeballed |
| Both cards' render order | ✅ **READ-FROM-SOURCE** — source order in the JSX |
| `SWITCH_HELP` / `REMINDER` now have no consumers | ✅ **EXECUTED** — `grep -rn … app components` returns nothing |
| **How either page LOOKS** | ⚠️ **READ-FROM-SOURCE and UNOBSERVED.** Neither page was rendered, at any width. Nothing here is verified visually |
| The 320px wrap reasoning | ⚠️ **READ-FROM-SOURCE and UNOBSERVED.** Whether that string wraps at 280px is inferred from its length and the declared font size, not measured |

**Surfaces, kept apart:** §1 covers the **dashboard** Settings tab; §1B covers **Settings → Van** in
manage — near-duplicate cards in different files, each read separately, and no fact from one is claimed of
the other. §2 is the **public landing page** and shares nothing with either.

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** every write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Files: the three source files
and this report.** The result, the non-ASCII census of characters introduced, and the carrier-aware
variation-selector figures per emoji-presentation base are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
