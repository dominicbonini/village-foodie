# Add order — horizontal scroll on phone. Stage 1 only.

🔴 **STOPPED AT STAGE 2, AS THE BRIEF INSTRUCTS. NO CODE WAS CHANGED.**

**Nothing was edited, created or deleted except this report.** No commit, no build, no `next dev`, no
`next build`, no `cap sync`, no deploy, no SQL. 🔴 **No `git stash`, `checkout` or `restore` — the only
git command run was `status`.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# 🔴 WHY I STOPPED: I COULD NOT NAME THE TOO-WIDE ELEMENT FROM SOURCE, AND YOU FORBADE THE HIDING FIX

Your rule: *"IF THE ONLY AVAILABLE FIX IS `overflow-x-hidden`, STOP AND REPORT rather than applying it
— I want to know what is too wide even if hiding it is the eventual answer."*

**I ruled out every candidate you listed and the search did not converge on a culprit.** Applying
`overflow-x-hidden` — or guessing at a width — on Pizzeria Gusto's live Add-order panel without
knowing what is wide would be exactly the change that rule exists to prevent. **§4 names the one cheap
check that settles it.**

---

# 1. THE ANCESTOR CHAIN — AND THE FACT THAT REFRAMES THE WHOLE SEARCH

| Element | Classes |
|---|---|
| `<body>` | `${geistSans.variable} ${geistMono.variable} antialiased`; `globals.css` sets `margin: 0; padding: 0` and **no `overflow-x` rule anywhere** |
| app shell | `bg-slate-50 h-dvh flex flex-col overflow-hidden` |
| header / tab bar / event bar | `shrink-0`, `z-40` / `z-30 relative` |
| 🔴 **`<main>`, ADD TAB** | 🔴 **`w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto flex-1 min-h-0 overflow-hidden px-4`** |
| phone panel (scroll layout) | `md:hidden flex-1 min-h-0 flex flex-col` → header `shrink-0` + `flex-1 min-h-0 overflow-y-auto pb-24` |
| phone panel (tabs layout) | `md:hidden flex-1 min-h-0 overflow-y-auto pb-24` |

# 🔴 BOTH THE SHELL AND `<main>` ARE `overflow-hidden`, SO A TOO-WIDE DESCENDANT IS **CLIPPED, NOT SCROLLABLE**.

**That is the decisive structural fact and it changes what we are looking for.** For the *page* to
scroll horizontally, the wide thing must be **outside those clipping boxes** — something the shell
does not contain: a `fixed`/viewport-positioned element wider than the viewport, or `<body>`/`<html>`
itself being given a width. ⚠️ **A wide element inside the Add-order scroller cannot produce the
reported symptom** — it would be invisible past the edge, not reachable by scrolling.

⚠️ **`viewportFit: 'cover'` IS SET** (`app/layout.tsx:71`), so the page extends under the safe areas
and `env(safe-area-inset-*)` is live. **On an iPhone that is the one mechanism in this stack that can
put real content outside the visual viewport**, and it is the strongest remaining lead.

---

# 2. EVERY CANDIDATE YOU NAMED, CHECKED

| Candidate | Verdict |
|---|---|
| **Fixed width / `min-w-*` exceeding a phone viewport** | ✅ **None reachable at phone width.** The only fixed widths in the panel are `w-[58%]` / `w-[42%]` (`:2087, :2097, :2105`) and they live inside `hidden md:flex` — **`display:none`, so they generate no box at all.** The only `min-w-*` is `min-w-[2.75rem]` (44px, the edit button's tap target) |
| **A flex row that does not wrap at phone width** | ⚠️ **Several, and all are guarded.** Every list row is `flex items-center gap-3` with `flex-1 min-w-0` on the text and `shrink-0` on the controls; the widest shrink-0 run (qty −/count/+ · edit · price · gaps · `pl-3`) totals **~206px against 358px available**. **None can force width** |
| **A grid whose column count is not reduced below `sm:`** | ✅ **The grid is `@sm:grid-cols-3` inside `@container`**, which resolves against the container, not the viewport — **and the tile grid is the md:/tablet pane. The phone branch renders `menuList`, a LIST, not a grid** |
| 🔴 **A negative margin without matching parent padding** | ⚠️ **THE CLOSEST THING TO A CULPRIT, AND IT DOES NOT REACH.** `:208` — `sticky top-0 z-10 -mx-1 px-1 py-1.5` on the category heading — pulls **4px outside its parent's content box on each side, 8px total.** ✅ **But `<main>` supplies `px-4` (16px), so it bleeds into padding and never reaches the viewport edge.** ⚠️ **Worth naming because 8px is close to the one-character clip observed**, and if `<main>`'s `px-4` were ever removed for the add tab this becomes real overflow |
| **`-mx-4` inside a padded ancestor** | ✅ `:2071` — `hidden md:flex flex-1 min-h-0 -mx-4`. **`display:none` at phone.** At md+ it is the deliberate bleed that cancels `<main>`'s `px-4` for the two-column split |
| **`w-screen` / `100vw`** | ✅ **EXECUTED — zero occurrences** in `AddOrderPanel.tsx`, `AppHeader.tsx` or `globals.css` |
| **A long unbroken string with no `min-w-0`** | ✅ **Guarded.** Item names are `truncate` inside `flex-1 min-w-0`; modifier and note lines are `break-words`; prices are `shrink-0 tabular-nums` |
| 🔴 **The sticky bottom bar** | ⚠️ **NOT RULED OUT.** `md:hidden fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-3 flex items-center justify-between gap-3 z-20`. **`left-0 right-0` is viewport width and `px-4` is inside it, so by the box model it cannot overflow** — but it is `fixed`, i.e. **outside both clipping ancestors**, which is the only category of element that can produce the reported symptom. Its children are a text block and `flex-1 max-w-xs` — both bounded |

---

# 3. Q3, Q4, Q5 — ANSWERED

**Q3 — two-column at tablet, one-column at phone, and the second column is REMOVED, not wrapped.**
`{/* iPad / desktop */}<div className="hidden md:flex …">` and `<div className="md:hidden …">` are
**two separate subtrees at the `md:` (768px) breakpoint.** ✅ **The phone branch never renders the
`w-[42%]` cart column at all**, so no `min-w` from it can force width — the failure mode you asked
about is structurally absent.

**Q4 — the other tabs, reported separately.** ⚠️ **All source-read; none was rendered.**

| Tab | `<main>` classes | Shares the defect? |
|---|---|---|
| **Add** | `overflow-hidden px-4` | 🔴 the reported one |
| **Orders** | `overflow-y-auto lg:overflow-hidden px-4 py-4 pb-20 lg:pb-4` | ⚠️ **Different container, same page and same `fixed` bottom bar is absent here.** Not reported, not ruled out |
| **Menu & Stock, Settings** | `overflow-y-auto px-4 py-4 pb-20` | ⚠️ same — not reported, not ruled out |

🔴 **THAT IS THE MOST USEFUL UNANSWERED QUESTION IN THIS REPORT.** If the other tabs scroll
horizontally too, the cause is in the **shell or the body**, and nothing in `AddOrderPanel` is
implicated. If only Add does, the cause is inside its subtree. **One swipe on each tab settles it, and
I could not do it from here.**

**Q5 — root overflow and viewport.** `<body>` carries only font variables + `antialiased`;
`globals.css` sets `margin: 0; padding: 0` and **no `overflow-x`, no `overscroll-behavior`, nothing on
`html`**. The viewport is `viewportFit: 'cover'`. ✅ **Nothing sets `overflow-x` today** — which is
consistent with the page being able to scroll horizontally at all.

---

# 4. 🔴 THE ONE CHEAP CHECK THAT WOULD NAME IT

**In Safari's inspector on the phone, with the Add tab open, run:**

```js
[...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
```

**It returns the elements whose right edge is past the viewport — the answer, by name, in one line.**
`document.scrollingElement.scrollLeft` beside it confirms the page (not a child) is the scroller.

⚠️ **And the cheaper half: swipe sideways on Orders and Settings.** If they scroll too, this is not an
Add-order defect at all.

---

# 5. VERIFICATION

| Required claim | Method |
|---|---|
| **The widest element at 390px, named, before and after** | 🔴 **NOT ESTABLISHED — this is why the task stopped.** Every candidate is ruled out or bounded in §2; **nothing was rendered and no element was measured** |
| No element exceeds the viewport after the fix | 🔴 **N/A — no fix was applied** |
| Vertical scrolling unchanged | ✅ trivially — **no code changed** |
| The sticky bottom bar unchanged | ✅ trivially — **no code changed** |
| Tablet and desktop unchanged | ✅ trivially — **no code changed.** At 768/1024/1366 the `hidden md:flex` two-column branch renders exactly as today |
| Whether the other tabs share the defect | 🔴 **UNKNOWN — source-read only.** §3, Q4 |

🔴 **NOTHING WAS RENDERED, MEASURED OR TAPPED.** Every statement here is about class strings.

---

# 6. INTEGRITY

## This report — SEPARATE byte-level pass, run AFTER writing

**Byte-level tool (Python over `open(…,'rb')`), never grep. It is the only file this task wrote, so
there is no source census to report — no source file was edited.**

```
docs/add-order-overflow-report.md   bytes 10,606
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
TOTAL OFFENDING: 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE:**

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 18 | 0 | 18 |
| U+2705 ✅ | 17 | 0 | 17 |
| **U+26A0 ⚠️** | **12** | **12** | ✅ **0** |

`U+1F534` and `U+2705` have **emoji presentation by default** — bare is correct for both. **`U+26A0`
is the only base here that defaults to TEXT presentation**, and ✅ **every one of its 12
occurrences is PAIRED — 12 OF 12, ZERO BARE.** ⚠️ **No other emoji-presentation base occurs
in this report.** Total `U+FE0F` = 12, which exactly accounts for the 12 paired warnings.

## Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M docs/reference-manual.md
?? docs/add-order-overflow-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-screen-on-header-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `?? docs/add-order-overflow-report.md` | 🔴 **THIS PASS — the only new entry, and the only file written** |
| `M docs/reference-manual.md` · `?? docs/kds-event-isolation-report.md` | ✅ pre-existing — **left alone, as instructed** |
| `M app/dashboard/[token]/kds/page.tsx` · `M app/dashboard/[token]/page.tsx` · `M app/api/dashboard/action/route.ts` · `M lib/native/orderGate.ts` · `M lib/native/useGatedActionResult.tsx` · `M components/dashboard/PaymentActionsModal.tsx` | ✅ pre-existing — earlier tasks this session |
| the ten other `?? docs/*.md` | ✅ pre-existing — the preceding tasks' reports |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
