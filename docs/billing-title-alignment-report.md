# Billing comparison table — feature title alignment and weight

Date: 13 August 2026
Status: FIXED. **One file changed** — [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx), one
line of markup (plus its explanatory comment). `tsc --noEmit` clean. No non-ASCII character class gained.

No `next dev`, no `next build`, no commit, no deploy, no migration. `TRANSACTION_ROWS`, the landing page,
the admin page, the fee rows, the column headers, the price row, the Trial rule and the description
text's own styling are all untouched.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. 🔴 ONE CORRECTION TO THE PREMISE, BEFORE THE FIX

> "Two small things on Manage > Billing's comparison table, **both from the last change**."

**Neither is from the last change.** Both predate this session entirely.

The last change touched `app/admin/page.tsx` only. The change before that touched Manage's **fee** rows
(`px(row.cells[p])`) and the **price header** — not the feature rows. Proved directly:

```
$ diff <(git show HEAD:"app/manage/[token]/page.tsx" | sed -n '10125,10132p') \
       <(sed -n '10125,10132p' "app/manage/[token]/page.tsx")
IDENTICAL — predates this session
```

`git log` confirms the earlier work in this session is now committed (`b361de1 plan features fix`), so
HEAD already contains the fee-cell and price-header changes — and the feature-title block is byte-for-byte
the same in HEAD as it was before any of them.

**Both defects are original to the file.** I am flagging it because you asked me to establish the cause
before changing anything, and "it was introduced last turn" would have sent the next reader to the wrong
diff. The fix below is the same either way.

---

## 1. THE INDENT — CAUSE, QUOTED

**QUOTED**, the two siblings, before:

```tsx
<div className="flex-1 pr-4">
  <div className="text-sm text-slate-800 pl-3 sm:pl-0">
    {row.name}
    {row.footnote && <sup className="text-slate-500 text-[10px] ml-0.5">{row.footnote}</sup>}
  </div>
  {row.detail && <p className="text-xs text-slate-600 mt-0.5">{row.detail}</p>}
</div>
```

### 🔴 `pl-3 sm:pl-0`, on the title `<div>` and on nothing else

`pl-3` is `padding-left: 0.75rem` = **12px**, applied on mobile and cancelled from `sm:` (640px) up.

- The **title** is a `<div>` carrying `pl-3`.
- The **description** is a `<p>`, its **sibling** inside the same `flex-1 pr-4` wrapper, with **no left
  padding at any width** — its only spacing is `mt-0.5`.

So below 640px the title starts 12px right of its own description. At 640px and above `sm:pl-0` cancels
it and they line up, which is why the fault is mobile-only.

**Nothing else contributes.** The chain from the viewport to that wrapper carries no other left offset:

| Level | Class | Left contribution at 390px |
|---|---|---|
| `<main>` | `w-full … px-4 pb-6` | 16px |
| matrix wrapper | `px-0 sm:px-6` | **0px** on mobile |
| section wrapper | `mb-2` | 0px |
| feature row | `flex items-center py-2 border-t border-slate-100` | 0px |
| label wrapper | `flex-1 pr-4` | 0px (right padding only) |
| **title `<div>`** | `pl-3 sm:pl-0` | 🔴 **12px** |
| **description `<p>`** | `text-xs text-slate-600 mt-0.5` | 0px |

⚠️ Note the matrix wrapper is `px-0` on mobile — the table is deliberately full-bleed there. That is
almost certainly what `pl-3` was originally reaching for: some left breathing room for the table when its
container has none. But it was applied to the title alone, so it never achieved that for the row; it only
broke the title away from its own description.

### Removed, not cancelled

```tsx
<div className="text-sm font-semibold text-slate-800">
```

`pl-3 sm:pl-0` is **gone**. No negative margin, no compensating offset, nothing added to the description
to meet it. Both elements now start at the label wrapper's content edge, which is where the description
has always started.

### Why the landing page is correct — **QUOTED**, `app/landing/landing.css`

```css
.hg-landing .cmp2-label { flex: 1; min-width: 0; padding-right: .6rem; }
.hg-landing .f-name { color: var(--head); font-weight: 600; display: block; }
.hg-landing .f-desc { color: var(--ink-soft); font-size: .8rem; line-height: 1.4; display: block; margin-top: .15rem; max-width: 44ch; }
```

**The difference in one sentence: the landing page never gives either element a left inset.**
`.cmp2-label` sets `padding-right` only — there is no `padding-left` anywhere in the label, and `.f-name`
and `.f-desc` are plain blocks whose only spacing is `.f-desc`'s `margin-top`. Two blocks with no left
padding in a container with no left padding share a left edge by construction; there is no value to get
wrong.

Manage had the same structure plus one extra declaration on one of the two children. That declaration
was the whole defect.

⚠️ At ≥900px the landing page moves them side by side (`.cmp2-label { display: flex; }`, `.f-name { width: 12rem }`),
so a shared left edge stops being the question there. Below 900px they stack, exactly as Manage's do at
every width.

---

## 2. THE WEIGHT

**QUOTED, before:**

```tsx
<div className="text-sm text-slate-800 pl-3 sm:pl-0">
```

**No font-weight class at all**, so the title inherited `font-weight: 400`.

**QUOTED, landing:**

```css
.hg-landing .f-name { color: var(--head); font-weight: 600; display: block; }
```

**QUOTED, after:**

```tsx
<div className="text-sm font-semibold text-slate-800">
```

`font-semibold` is `font-weight: 600` — **the same weight the landing page uses**, reached through
Manage's own utility scale rather than by copying a CSS rule.

### What was kept and what was changed

| | Landing `.f-name` | Manage before | Manage after | Verdict |
|---|---|---|---|---|
| **Weight** | `600` | 400 (inherited) | `font-semibold` = **600** | 🔴 **CHANGED — now matches** |
| **Left inset** | none | `pl-3` (12px, mobile) | none | 🔴 **CHANGED — now matches** |
| Size | `1rem` inherited from `.cmp2` (`.9rem`) | `text-sm` (14px) | `text-sm` (14px) | **KEPT** — Manage's scale |
| Colour | `var(--head)` | `text-slate-800` | `text-slate-800` | **KEPT** — Manage's palette |
| Footnote `<sup>` | `.f-note` (`.7rem`, `--ink-faint`) | `text-slate-500 text-[10px] ml-0.5` | unchanged | **KEPT** |
| Description | `.f-desc` | `text-xs text-slate-600 mt-0.5` | **unchanged** | **KEPT** — explicitly out of scope |

Only two properties changed, and both are the two you named: **weight and alignment**. Size, colour,
spacing and the description's styling are untouched.

---

## 3. ⚠️ A CONSEQUENCE YOU SHOULD KNOW ABOUT, NOT FIXED BECAUSE IT IS FENCED

The **fee** rows carry the identical `pl-3 sm:pl-0`, at `app/manage/[token]/page.tsx:10093`:

```tsx
<div className="text-sm font-medium text-slate-800 pl-3 sm:pl-0">
```

The brief says *"Do not change the fee rows"*, so it stays. The visible effect on mobile:

| | Before | After |
|---|---|---|
| Fee row labels ("Walk-up orders") | 28px | **28px** (unchanged) |
| Feature titles ("Discovery map listing") | 28px | **16px** |
| Feature descriptions | 16px | 16px |

**So one misalignment is traded for another**: the title now agrees with its description, but the fee
labels above it sit 12px further right than the feature titles below. Before the change the two sections
agreed with each other and disagreed with the descriptions.

This is satisfiable as instructed — the feature titles are fixed — so I have not stopped. But the
complete fix is **deleting the same two tokens from line 10093**, one line, whenever you want it. I did
not do it because it is explicitly out of scope, and I am stating it rather than leaving you to find it
on a device.

⚠️ Note the fee rows have **no descriptions** (`TRANSACTION_ROWS` carries `name` and `footnote` only), so
their `pl-3` misaligns nothing *within* their own rows — it only separates them from the feature titles.

---

## 4. VERIFICATION

### Rendered markup, before and after

**BEFORE**
```tsx
<div className="flex-1 pr-4">
  <div className="text-sm text-slate-800 pl-3 sm:pl-0">
    Discovery map listing
  </div>
  <p className="text-xs text-slate-600 mt-0.5">Your truck appears on the public HatchGrab map so nearby customers can find you.</p>
</div>
```

**AFTER**
```tsx
<div className="flex-1 pr-4">
  <div className="text-sm font-semibold text-slate-800">
    Discovery map listing
  </div>
  <p className="text-xs text-slate-600 mt-0.5">Your truck appears on the public HatchGrab map so nearby customers can find you.</p>
</div>
```

### Left offset at 390px

Measured by summing the declared left contributions of every ancestor (see the table in section 1); the
label wrapper's content edge is at 16px in both cases, since nothing above it changed.

| Element | Before | After |
|---|---|---|
| Title "Discovery map listing" | 16 + 12 = **28px** | 16 + 0 = **16px** |
| Description "Your truck appears on the public HatchGrab map…" | 16 + 0 = **16px** | 16 + 0 = **16px** |
| **Difference** | 🔴 **12px** | ✅ **0px — equal** |

At `sm:` (640px) and above the title was already at 0 via `sm:pl-0`, so **nothing changes at or above
640px**; the offset there was, and remains, equal.

### Landing page byte-identical

```
$ git diff --stat app/landing/page.tsx app/landing/landing.css
(no output)
```

Neither the landing page nor its stylesheet was opened. Confirmed by `git status --short`, which lists
only `app/admin/page.tsx` (last turn's committed-pending work) and `app/manage/[token]/page.tsx`.

### Diff size

```
$ git diff --stat "app/manage/[token]/page.tsx"
 app/manage/[token]/page.tsx | 16 +++++++++++++++-
 1 file changed, 15 insertions(+), 1 deletion(-)
```

One markup line replaced; the other 14 insertions are the explanatory comment.

### Typecheck

`npx tsc --noEmit` — clean.

---

## 5. NON-ASCII CENSUS

Character **classes** per file, before → after, against `git show HEAD:<file>`:

| File | Before | After | Gained |
|---|---|---|---|
| `app/manage/[token]/page.tsx` | 176 | 176 | **none** |
| `app/landing/page.tsx` | 19 | 19 | **none** (untouched) |
| `app/admin/page.tsx` | 26 | 26 | **none** (untouched this turn) |
| `lib/plan-features.ts` | 12 | 12 | **none** (untouched) |

The comment added to `app/manage/[token]/page.tsx` uses `🔴`, `⚠️`, `—` and `─`, all already in that
file's vocabulary (it carries 83 `🔴` and 79 `⚠` at HEAD).

---

## 6. WHAT WAS NOT TOUCHED

- **`TRANSACTION_ROWS`, every value, every plan entitlement** — `lib/plan-features.ts` and
  `lib/features.ts` were not opened.
- **The landing page and the admin page** — verified byte-identical this turn.
- **The fee rows, the column headers, the price row and the Trial rule** — all four were fixed and
  verified last turn and are unchanged, including the fee label's own `pl-3 sm:pl-0` (section 3).
- **The description text's own styling** — `text-xs text-slate-600 mt-0.5`, untouched. It did not move;
  the title moved to meet it.
- **The footnote `<sup>`, the tick/dash/coming-soon cells, `billingPlans`, `showTrialColumn`, the section
  headers and `footnotesContent`** — unchanged.
