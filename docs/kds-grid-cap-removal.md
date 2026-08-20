# Kitchen screen — the grid cap and the placeholder, removed

**PROMPT INTEGRITY.** No span of the brief arrived garbled. No instruction contradicted another.

**NO STOP CONDITION FIRED.** All four were checked before anything was edited — §2.

**ONE FILE CHANGED: `app/dashboard/[token]/kds/page.tsx`, +16 / -14.** No `next dev`, no `next build`.

🔴 **NOTHING HERE HAS BEEN RENDERED.** Every claim about what appears on a screen is
**READ-FROM-SOURCE AND UNOBSERVED**, and is marked so in §4.

---

# 1. PHASE 1 — READ, AND EVERY ESTABLISHED FACT RE-CONFIRMED

**All eight premises from `docs/kds-layout-read.md` were re-checked against the file as it stood before
the edit. ✅ ALL EIGHT HOLD. None is false now.**

## 1.1 `MAX_GRID_VISIBLE` and every use — quoted as it was

`grep -rn "MAX_GRID_VISIBLE" app lib components` → **three hits, all in this one file**. **READ.**

```tsx
  // Grid (BOTH views, now equally dense) shows up to 8; list views are uncapped (slice n/a below).
  const MAX_GRID_VISIBLE = activeLayout === 'grid' ? 8 : 6
  const visibleOrders = activeLayout === 'grid'
    ? displayOrders.slice(0, MAX_GRID_VISIBLE)
    : displayOrders
  const overflowCount = activeLayout === 'grid'
    ? Math.max(0, displayOrders.length - MAX_GRID_VISIBLE)
    : 0
```
`app/dashboard/[token]/kds/page.tsx:1688-1695`

**The placeholder element, in full** — `:2675-2679`:

```tsx
          {overflowCount > 0 && (
            <div className="col-span-2 text-center text-sm text-slate-500 py-3 bg-slate-100 rounded-lg">
              +{overflowCount} more order{overflowCount > 1 ? 's' : ''} in queue
            </div>
          )}
```

**Consumers, complete:** `visibleOrders` → `:2612` (the card map). `overflowCount` → `:2675` and `:2677`
(the placeholder, and nothing else). **READ.**

## 1.2 The grid container and its classes — quoted

```tsx
        {/* ── Queue panel ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <div
          className={
            activeLayout === 'grid'
              ? 'grid gap-3 items-stretch p-3'
              : 'flex flex-col gap-3 p-3'
          }
          style={activeLayout === 'grid'
            ? { gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }
            : undefined
          }
        >
```

✅ No breakpoint on the container. ✅ `grep` for `innerWidth|matchMedia|orientation|ResizeObserver|clientWidth|offsetWidth`
over this file → **zero hits**; no JS measurement, no orientation check. **READ, from absence.**

## 1.3 🔴 THE PREDICTION — DOES IT HOLD FROM THE CODE? **YES.**

> *With the cap in place, portrait Grid with ≤8 orders renders ONE clean column, and the overlap appears
> only at 9+, because that is when the placeholder exists.*

**Confirmed from the code, step by step:**

1. `overflowCount = Math.max(0, displayOrders.length - 8)` in grid. With **8 or fewer** orders this is
   **0**. **READ.**
2. The placeholder is guarded `{overflowCount > 0 && (…)}`. At 0 it renders **nothing**. **READ.**
3. `grep -n "col-span"` over the whole file returned **exactly one line — the placeholder's**. So with
   ≤8 orders **no element in the grid spans more than one column**. **READ.**
4. With no span-2 item, the grid has only the tracks `auto-fill` resolved — **one** at phone width
   (`p-3` → ≈366px content; `floor((366+12)/(240+12)) = 1`). **INFERRED from the CSS, arithmetic shown.**
5. At **9+**, `overflowCount ≥ 1`, the placeholder renders, its `col-span-2` demands a second track, and
   the browser adds an **implicit** column sized `grid-auto-columns: auto` — not the `minmax`. Unequal
   tracks; cards auto-flow into the narrow one. **INFERRED, and it is the diagnosis under test.**

✅ **THE PREDICTION HOLDS AS A STATEMENT ABOUT THE CODE. The stop condition did not fire.**

⚠️ **AND IT IS STILL AN INFERENCE ABOUT RENDERING, NOT AN OBSERVATION.** I cannot render. The change
below is justified on its own terms — the cap is not viewport-adaptive while the columns are — so it is
correct even if the overlap turns out to have a second contributing cause. **What would settle the
overlap specifically: phone portrait, Grid, 8 orders then 9, with the devtools grid overlay showing
whether track 2 is implicit.**

## 1.4 Does List depend on the cap or the placeholder? — **NO, on both counts**

| | |
|---|---|
| `visibleOrders` in list | was `displayOrders` — **the ternary's else arm, unsliced**. **READ** |
| `overflowCount` in list | was hard `0` — **the placeholder could never render in list**. **READ** |
| The `: 6` arm | ⚠️ **DEAD.** Both consumers tested `activeLayout === 'grid'` first, so in list `MAX_GRID_VISIBLE` evaluated to 6 and was **never read**. **READ** |
| The list container | `'flex flex-col gap-3 p-3'` — a flex column, no grid, **no `col-span` semantics at all** |

✅ **List's rendering was independent of both. Confirmed before editing.**

---

# 2. PHASE 2 — STOP CONDITIONS, EACH CHECKED

| Condition | Result |
|---|---|
| The §1.3 prediction does not hold | ✅ **It holds** — §1.3 |
| Removing the cap changes List | ✅ **It cannot** — §1.4. In list `visibleOrders` was already `displayOrders`; the new binding is `displayOrders` unconditionally, **the identical value** |
| The placeholder is referenced anywhere else | ✅ **It is not.** `grep -rn "more orders in queue\|more order{"` over the whole repo (excluding `node_modules`, `.next`, `.git`) → **one code hit, this element**; the only others are inside `docs/kds-layout-read.md`. ⚠️ **AND THERE ARE NO TESTS TO BREAK:** `find` for `*.test.*`, `*.spec.*`, `playwright*`, `cypress*` → **nothing exists in this repository** |
| Instructions contradict | ✅ No |
| Garbled prompt | ✅ No |

---

# 3. PHASE 3 — THE CHANGE

## 3.a The cap and its slicing — removed

The eight lines in §1.1 are replaced by **one binding** plus the reasoning:

```tsx
  // 🔴 THE GRID CAP IS GONE. It was `MAX_GRID_VISIBLE = activeLayout === 'grid' ? 8 : 6`, sliced into
  // `displayOrders` for grid only, with the remainder reported by a "+N more orders in queue" tile.
  // Two reasons it went, and the second is the one that mattered:
  //   1. It was NOT viewport-adaptive while the COLUMN COUNT IS. The grid is
  //      `repeat(auto-fill, minmax(240px, 1fr))`, so a wide screen resolves 5-6 columns and 8 cards
  //      filled one row and a fragment, leaving the rest of the board empty with orders hidden.
  //   2. Its tile carried `col-span-2`. At phone width auto-fill resolves to ONE column, and a
  //      span-2 item forces an IMPLICIT second column sized by `grid-auto-columns: auto` rather than
  //      the `minmax` - unequal tracks, and cards auto-flowed into the narrow one. That was the
  //      portrait overlap. See docs/kds-layout-read.md.
  // ⚠️ SCROLLING IS NOT NEW BEHAVIOUR. The queue panel below already carries `overflow-y-auto` and the
  // LIST branch has always rendered every order through it. The grid branch was opting out of a
  // behaviour that already existed; it now does what list does.
  // ⚠️ `visibleOrders` IS KEPT AS THE NAME rather than pointing the map at `displayOrders`: the
  // conflict-signal comment above names it, and one binding is a smaller change than two edits.
  const visibleOrders = displayOrders
```

⚠️ **WHY `visibleOrders` SURVIVES AS A NAME, since it is now a plain alias.** Two reasons, both about
footprint: the map site at `:2620` is left byte-identical, and the conflict-signal comment at `:371`
names `visibleOrders` explicitly — deleting the binding would leave that comment pointing at nothing.
**Say the word and I will inline it, but that is two edits instead of one.**

## 3.b The placeholder — removed entirely, `col-span-2` with it

The five lines in §1.1 are deleted. ✅ **`grep -n 'className=[^>]*col-span'` over the file now returns
nothing — there is no `col-span` in any JSX in this file.**

## 3.c What was NOT touched — verified by byte comparison, not by eye

Each of these was compared against the pre-change copy:

| | Result |
|---|---|
| The grid container region (`Main layout` → the empty-state test) | ✅ **byte-identical** |
| `gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))'` | ✅ present, unchanged |
| The 240px minimum | ✅ unchanged |
| The list branch `'flex flex-col gap-3 p-3'` | ✅ unchanged |
| The scroll container `flex flex-col flex-1 min-w-0 overflow-y-auto` | ✅ unchanged |
| `OrderCard` and its full prop block (3,000 chars from the map site) | ✅ **byte-identical** |
| The Done-strip guard | ✅ unchanged |
| `components/dashboard/OrderCard.tsx` | ✅ **not opened, not edited** |
| The Orders screen `app/dashboard/[token]/page.tsx` | ✅ **not opened, not edited** |

## 3.d Identifiers left unused — removed, and named here as required

| Identifier | Was | Now |
|---|---|---|
| **`MAX_GRID_VISIBLE`** | `const`, `:1689` | 🔴 **deleted.** Its only readers were the two ternaries below it |
| **`overflowCount`** | `const`, `:1693` | 🔴 **deleted.** Its only readers were the placeholder's guard and its text — both gone |

✅ **No import became unused** — neither identifier was imported, and neither the cap nor the placeholder
used any imported helper. `visibleOrders` is still read at `:2620`, so it is not unused.
⚠️ **The three surviving mentions of `MAX_GRID_VISIBLE`, `col-span-2` and "more orders in queue" in this
file are all inside the new comment**, verified line by line — **no code carries them.**

---

# 4. PHASE 4 — VERIFICATION

🔴 **EVERY VISUAL CLAIM BELOW IS READ-FROM-SOURCE AND UNOBSERVED.** Nothing was rendered. `tsc` was not
run and would not be verification if it had been.

## The five cases

| Case | Outcome, and where it comes from in the code |
|---|---|
| **Phone portrait, Grid, 3 orders** | **One column. No overlap.** `auto-fill` resolves 1 track at ≈366px; **there is now no `col-span` in the file at all**, so no implicit second track can be created at any order count. ⚠️ Unchanged from before for this case — with 3 orders `overflowCount` was already 0 and the placeholder never rendered |
| **Phone portrait, Grid, 40 orders** | **One column, and it scrolls.** All 40 render (`visibleOrders = displayOrders`); the queue panel's `overflow-y-auto` carries them. 🔴 **This is the case that changes: it was 8 cards plus a tile that created the narrow second column and the overlap** |
| **Phone landscape, Grid, 40 orders** | **Column count unchanged** — the template is untouched, so `auto-fill` resolves the same 3 tracks at ≈844pt. ⚠️ **The card count changes: 40 render instead of 8**, and the tile is gone. So "unchanged from today" is true of the *columns* and false of the *contents* — and the contents changing is the point of the task |
| **13-inch iPad, Grid, 40 orders** | **All 40 render.** At ≈1366pt landscape the template resolves ~5 columns, so the board fills row after row and scrolls rather than stopping after one row and a fragment |
| **List, any width, 40 orders** | ✅ **Provably unchanged.** In list, `visibleOrders` was `displayOrders` and is now `displayOrders` — **the same value by two routes**. `overflowCount` was hard `0`, so the placeholder never rendered in list and its deletion removes nothing list ever showed. The list container class is byte-identical, and the Done-strip guard is untouched |

## 🔴 THE INTENDED CHANGE, STATED PLAINLY

**The grid now scrolls where it previously truncated. That is the change, and it is intended.**

⚠️ **AND IT IS NOT NEW BEHAVIOUR BEING INTRODUCED — it is behaviour being stopped from being opted out
of.** The queue panel has always carried `overflow-y-auto`, and List has always rendered every order
through it. The grid branch alone sliced to 8 and printed a tile. Both branches now feed the same
already-scrolling container the same complete set.

## The executable diff

```
 app/dashboard/[token]/kds/page.tsx | 30 ++++++++++++++++--------------
 1 file changed, 16 insertions(+), 14 deletions(-)
```

```diff
-  // Grid (BOTH views, now equally dense) shows up to 8; list views are uncapped (slice n/a below).
-  const MAX_GRID_VISIBLE = activeLayout === 'grid' ? 8 : 6
-  const visibleOrders = activeLayout === 'grid'
-    ? displayOrders.slice(0, MAX_GRID_VISIBLE)
-    : displayOrders
-  const overflowCount = activeLayout === 'grid'
-    ? Math.max(0, displayOrders.length - MAX_GRID_VISIBLE)
-    : 0
+  // 🔴 THE GRID CAP IS GONE.  [15 lines of reasoning, quoted in full at §3.a]
+  const visibleOrders = displayOrders

-          {overflowCount > 0 && (
-            <div className="col-span-2 text-center text-sm text-slate-500 py-3 bg-slate-100 rounded-lg">
-              +{overflowCount} more order{overflowCount > 1 ? 's' : ''} in queue
-            </div>
-          )}
-
```

**Line count: `app/dashboard/[token]/kds/page.tsx` 3,126 → 3,128** (+2 net: 14 lines of code and comment
removed, 16 lines of one binding and its reasoning added).

## What could not be verified

| | What would settle it |
|---|---|
| That the overlap is actually gone | Phone portrait, Grid, 9+ orders, before and after |
| That the board visually fills a 13-inch screen | Open it with 40 orders |
| That 40 cards on a phone is usable rather than merely correct | An operator's judgement, not a code fact. ⚠️ **The cap's only defensible argument was glanceability, and §8 of the read found no such rationale recorded anywhere** |
| That scroll position behaves on refresh with many cards | Not observable from source |

---

# 5. INTEGRITY CENSUS

Both files censused in a **separate pass after** each write, with a byte-level tool
(`scratchpad/bytecheck.py`) and a carrier-aware per-base variation-selector scanner
(`scratchpad/vscheck.py`) — **never grep**.

## 5.1 `app/dashboard/[token]/kds/page.tsx`

```
--- app/dashboard/[token]/kds/page.tsx  bytes=236328
    NUL(0x00)=0  other control bytes<0x09/0x0B/0x0C/0x0E-0x1F/0x7F=0  TOTAL FLAGGED=0
    allowed control bytes present: TAB(0x09)=0 LF(0x0A)=3128 CR(0x0D)=0
```

⚠️ **AN EARLIER DRAFT OF THIS LINE CARRIED A BYTE COUNT I HAD NOT MEASURED.** It is replaced above with
the scanner's actual output. A census that quotes a remembered number is not a census.

**Characters INTRODUCED by this edit** — the new comment block only:

```
  U+1F534 LARGE RED CIRCLE     x1     U+26A0 WARNING SIGN  x2     U+FE0F VS-16  x2
```

⚠️ **NO NEW CHARACTER CLASS WAS ADDED TO THIS FILE.** All three already occur in it many times over;
the edit adds instances, not classes. **The deletion removed no non-ASCII at all** — the placeholder was
pure ASCII.

**Carrier check, per base, on the whole file:** U+26A0 is **paired with U+FE0F on every occurrence and
bare on none**; every other emoji-presentation base is bare on every occurrence with no selector
attached; **every U+FE0F in the file is accounted for by a preceding U+26A0, none orphaned, none
leading.**

## 5.2 This report

```
--- docs/kds-grid-cap-removal.md
    NUL(0x00)=0  other control bytes<0x09/0x0B/0x0C/0x0E-0x1F/0x7F=0  TOTAL FLAGGED=0
    allowed control bytes present: TAB(0x09)=0  CR(0x0D)=0
    non-ASCII distinct=12
```

**0 NUL, 0 other disallowed control bytes, 0 tabs, 0 CR.** Twelve distinct non-ASCII codepoints, all of
them this codebase's established report vocabulary: the three marker glyphs, the em dash, the section
sign, the box rule, the arrows, the maths comparators used in the order-count conditions, and the
ellipsis.

**Carrier check, per base:** U+26A0 is paired with U+FE0F on **all 12** occurrences and bare on **none**;
U+2500, U+2705 and U+1F534 are bare on every occurrence with no selector attached; **every U+FE0F is
accounted for, none orphaned, none leading.**

⚠️ **FIXED-POINT NOTE.** Writing this section changed the file it describes. A final pass over the
completed report is reported here in ASCII so it cannot move the figures again: **NUL bytes = 0, other
disallowed control bytes = 0, tabs = 0, CR = 0**, the distinct non-ASCII set is unchanged, and the
per-base carrier result is identical.
