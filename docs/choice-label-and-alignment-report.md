# Finishing the Billing label alignment, and making the menu's options read as choices

Date: 13 August 2026
Status: FIXED. **Two files changed** — [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) and
[app/trucks/[slug]/order/page.tsx](app/trucks/[slug]/order/page.tsx). `tsc --noEmit` clean. 25 of 25
assertions pass. Neither file gained a non-ASCII character class.

No `next dev`, no `next build`, no commit, no deploy, no migration. Which options are shown, their order
and their prices are unchanged; the modal, the validation rules, the card padding, the tab strip, the
landing page, the admin page, `TRANSACTION_ROWS` and every plan entitlement are untouched.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 1. THE FEE-ROW LABEL — ALIGNMENT FINISHED

**QUOTED, before** (`app/manage/[token]/page.tsx:10093`):

```tsx
<div className="text-sm font-medium text-slate-800 pl-3 sm:pl-0">
```

**QUOTED, after:**

```tsx
<div className="text-sm font-medium text-slate-800">
```

`pl-3 sm:pl-0` is **deleted**, exactly as it was on the feature title — no negative margin, no
compensating padding anywhere else, and nothing added to any sibling to meet it. `text-sm`,
`font-medium` and `text-slate-800` are untouched, so the fee labels keep their own weight and colour;
only the 12px mobile inset is gone.

### Every label in the table now shares one left edge at 390px

The chain from the viewport is unchanged and contributes nothing beyond `<main>`'s gutter:

| Level | Class | Left contribution |
|---|---|---|
| `<main>` | `w-full … px-4 pb-6` | **16px** |
| matrix wrapper | `px-0 sm:px-6` | 0px on mobile |
| section wrapper | `mb-2` | 0px |
| row | `flex … py-2 border-t border-slate-100` | 0px |
| label wrapper | `flex-1 pr-4` | 0px (right padding only) |

| Label type | Class | Before | After |
|---|---|---|---|
| Section header ("Transaction fees", "Core operations") | `flex-1 text-xs font-bold text-slate-900 uppercase tracking-wider` | 16px | **16px** |
| **Fee row label** ("Walk-up orders") | `text-sm font-medium text-slate-800` | 🔴 **28px** | **16px** |
| Feature title ("Discovery map listing") | `text-sm font-semibold text-slate-800` | 16px (fixed last turn) | **16px** |
| Feature description | `text-xs text-slate-600 mt-0.5` | 16px | **16px** |

**All four label types are now at 16px.** Confirmed by grep: `className="[^"]*pl-3[^"]*"` matches
**nothing** anywhere in the file — the only remaining occurrences of the string `pl-3` are inside the two
comments that record what was removed and why.

Nothing changes at `sm:` (640px) and above, where `sm:pl-0` had already zeroed it.

---

## 2. THE REQUIRED-CHOICE LABEL

### What was wrong with "Required · Choose one"

`previewGroups` is filtered to `minRequiredForGroup(g) > 0`, so **every group that reaches this line is
required**. "Required" was therefore printed on every modifier item on the menu and distinguished
nothing — the identical argument that keeps amber off this line. It was five words doing the work of
zero.

`groupRuleLabel` still owns that wording **in the modal** (`:3358`), where the cap and the unmet state
actually vary. It is simply not this line's job. The import is still live and the modal is untouched.

### 🔴 What replaces it — the page's own two patterns, quoted

**(a) The leader: "Choose:" where a group has no visible name.**

A `hide_name` group carries an internal `"Category - Name N"` name that is never shown, so those lines
opened straight onto the options with no leader at all — which is exactly why they read as a description
of the dish. "Choose" is this page's established verb for a decision it needs from the customer:

```tsx
:3130   <span className="text-xs font-black text-slate-300">Choose time</span>       // the slot picker
:3356   <span className="text-slate-500">{group.hide_name ? 'Choose an option' : group.name}</span>   // the modal
:3424   'Choose required options'                                                    // the blocked CTA
```

The trailing colon is the idiom this very line already used for a named group, so both branches now read
the same shape:

```tsx
<span className="font-semibold text-slate-600">{g.hide_name ? 'Choose:' : `${g.name}:`}</span>
```

**(b) The options: weight, which is how this page marks a thing you pick.**

The options were `text-slate-500` at normal weight — **the same treatment as the item description two
lines above**, which is precisely why they read as part of it. They are now `font-semibold text-slate-700`,
one step below the modal's own idiom for a selectable option:

```tsx
:3371   className={`flex items-center gap-1.5 text-sm font-bold px-3.5 py-2 … bg-white text-slate-700 …`}
```

Semibold rather than bold because the list is a teaser, not a control. The separator stays `text-slate-400`
and is now explicitly `font-normal`, so it stays lighter than the emphasised alternatives it divides —
between two bold options a `·` reads as a divider ("or"), where between two normal-weight words it read
as the comma of an ingredient list.

### ⚠️ No amber, no box — verified, not just asserted

The executable `className` strings on the whole preview line are:

```
"text-xs text-slate-500 leading-snug flex flex-wrap items-center gap-x-1 gap-y-0.5"
"font-semibold text-slate-600"
"inline-flex items-center gap-1 font-semibold text-slate-700"
"text-slate-400 font-normal"
```

No `amber`, no `bg-`, no `border-`, no `rounded`. **The change costs zero horizontal pixels** — weight
and a six-character prefix, inside rows that were widened by 16px earlier today.

---

## 3. THE THREE LINES, RENDERED

```
  hide_name required group
    BEFORE  Required · Choose one Chicken Tikka (M) · Paneer Tikka (M)
    AFTER   Choose: Chicken Tikka (M) · Paneer Tikka (M)

  named group
    BEFORE  Protein: Required · Choose one Chicken · Paneer
    AFTER   Protein: Chicken · Paneer

  options with a price difference
    BEFORE  Protein: Required · Choose one Chicken · Beef +£0.50
    AFTER   Protein: Chicken · Beef +£0.50
```

With the styling that carries the meaning:

| Fragment | Class |
|---|---|
| `Choose:` / `Protein:` | `font-semibold text-slate-600` |
| `Chicken Tikka (M)`, `Beef +£0.50` | `font-semibold text-slate-700` |
| `·` | `text-slate-400 font-normal` |
| the `<p>` itself | `text-xs text-slate-500 leading-snug flex flex-wrap …` |

**What each reads for:**

- **hide_name group** → `Choose:` then the options. The line now opens with a verb addressed to the
  customer. Previously it opened with a proper noun ("Chicken Tikka (M)"), which is indistinguishable
  from an ingredient.
- **named group** → the group's own name and colon, unchanged from what this line has always done, then
  the options. "Protein:" is already a question; the bolder options are its answers.
- **priced options** → identical, with `+£0.50` still appended verbatim inside the same emphasised span,
  so the price delta rides with the option it belongs to and is emphasised with it.

### 🔴 Why the new line reads as a choice rather than a description

Three things, none of which was true before:

1. **The options no longer share the description's styling.** At `text-slate-500` normal they were
   typographically identical to "Chunky chips, 38hr makhani sauce, Pickle onion & chutney." above them —
   same colour family, same weight, same kind of comma-separated run. At `font-semibold text-slate-700`
   they are visibly a different class of content on the card.
2. **A `·` between two emphasised nouns reads as alternation; between two plain nouns it reads as a
   list.** The separator did not change, but what it separates did, and that changes what it means.
3. **Every line now has a leader.** The `hide_name` case had none at all, so there was nothing to mark
   where the description ended and the choices began.

**And the reason the label was added still stands — it is now carried by form instead of words.** The
point was never that a customer needs to read the rule; it was that they must not mistake a chooser for
an ingredient list. Emphasis does that in less space and without repeating "Required" on every item.

⚠️ **One thing this does not do, stated plainly:** the line no longer says how MANY may be chosen. For a
`max_choices: 2` group a customer sees the options and learns the cap in the modal. That was true before
today as well — the cap only reached the list in the label added this session, and it is deliberately
gone with it.

---

## 4. VERIFICATION

Run against the real `lib/modifier-rules.ts` with string assembly mirroring the JSX. **Read-only: no
database, no network, no writes.**

```
── ASSERTIONS ───────────────────────────────────────────────────────────────────────
  PASS  hide_name required group: no "Required" on the line
  PASS  hide_name required group: every option kept, in order, with its price
  PASS  hide_name required group: still a required group (filter unchanged)
  PASS  named group: no "Required" on the line
  PASS  named group: every option kept, in order, with its price
  PASS  named group: still a required group (filter unchanged)
  PASS  options with a price difference: no "Required" on the line
  PASS  options with a price difference: every option kept, in order, with its price
  PASS  options with a price difference: still a required group (filter unchanged)
  PASS  hide_name group now has a leader ("Choose:")
  PASS  named group keeps its name as the leader
  PASS  price delta preserved verbatim   [Protein: Chicken · Beef +£0.50]

── THE FENCES ───────────────────────────────────────────────────────────────────────
  PASS  no amber on the preview line
  PASS  no container/box added (no bg-/border- utility on the line)
  PASS  groupRuleLabel still called by the modal
  PASS  modal option chips untouched
  PASS  card padding untouched
  PASS  tab strip untouched

── MANAGE LABEL ALIGNMENT ───────────────────────────────────────────────────────────
  PASS  no executable pl-3 remains in the billing table   [none]
  PASS  fee label is now text-sm font-medium text-slate-800 (no padding)
  PASS  feature title is text-sm font-semibold text-slate-800 (no padding)

ALL PASSED
```

`minRequiredForGroup` is asserted per case to confirm the `previewGroups` filter is unchanged — the same
groups reach the line as before, only their rendering differs.

### ⚠️ Two false failures in my own harness, and one listing quirk

1. `!/amber/.test(...)` and `!/(bg-|border-)/.test(...)` sliced the raw source and **failed while the
   code was correct** — they were matching the new comments, which quote the modal's chip classes
   (`bg-white text-slate-700`) and explain *why* amber is excluded. Narrowed to the executable
   `className="…"` strings only.
2. The printed `classNames` list includes `"text-xs font-black text-slate-300"`. That string is **inside
   a comment** — the quotation of `:3130`'s `Choose time` — not a class on the line. It carries no
   `amber`, `bg-` or `border-`, so both assertions hold regardless, but the listing should not be read as
   five live classes.

### Typecheck

`npx tsc --noEmit` — clean. `groupRuleLabel` remains imported and is still called at `:3358` by the
modal, so the import is live rather than orphaned.

---

## 5. NON-ASCII CENSUS

Character **classes** per file, before → after, against `git show HEAD:<file>`:

| File | Before | After | Gained |
|---|---|---|---|
| `app/manage/[token]/page.tsx` | 176 | 176 | **none** |
| `app/trucks/[slug]/order/page.tsx` | 39 | 39 | **none** |
| `app/landing/page.tsx` | 19 | 19 | **none** (untouched) |
| `app/admin/page.tsx` | 26 | 26 | **none** (untouched this turn) |

⚠️ The `HEAD` baseline for `app/manage/[token]/page.tsx` predates the previous turn's still-uncommitted
title fix, so its diff spans both turns' edits to that file. No class was gained across either.

Both comments added this turn use `🔴`, `⚠️`, `—`, `·`, `£` and `─`, all already in their files'
vocabularies.

---

## 6. WHAT WAS NOT TOUCHED

- **Which options are shown, their order, their prices** — `previewGroups` (the
  `minRequiredForGroup > 0` filter, the `isModifierAvailable` filter, `sortGroupsRequiredFirst`) and the
  option map are unchanged apart from the class on the wrapping `<span>`. `+£{price_adjustment}` is
  byte-identical, as is `<OptionStockBadge>`.
- **The modal** — `:3346-3395` untouched, including its `groupRuleLabel` call, its amber unmet cue and
  its option chips.
- **What any group requires / how modifiers are validated** — `lib/modifier-rules.ts` was **read only**.
  `minRequiredForGroup`, `validateModifierSelection`, `toggleWithGroupRules`, `groupRuleLabel`,
  `hasUnsatisfiableRequiredGroup`: all unchanged.
- **The card padding and the tab strip** — `px-2 sm:px-4` and `-mx-2 px-2 sm:-mx-4 sm:px-4` verified
  present and unchanged.
- **The landing page, the admin page, `TRANSACTION_ROWS`, plan entitlements** — not opened.
- **The item description's styling, the item name, the price row, the Add button** — unchanged.
