# KDS — COOK AND FULL NOW CARRY IDENTICAL TYPE

**Task:** no size, weight or padding may branch on `cardStyle`. Cook adopts Full's values for every
element it renders. This CORRECTS `docs/kds-cook-type-report.md`, which enlarged Cook beyond Full.

**File changed:** `components/dashboard/OrderCard.tsx` — the only file touched.
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` was run — `status`, `log`, `diff` and `show` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any migration.

---

## 0. THE ONE THING I DID NOT DO, AND WHY — READ THIS FIRST

Part B says: *"If a single one gates a size, a weight or a padding, name it and STOP."*

**The post-change scan found one.** `OrderCard.tsx:1151`:

```tsx
        <div className={`w-full text-left ${cardStyle === 'window' ? 'px-3 py-2' : 'px-4 py-3'} ${headerCls}`}>
```

That is a **padding expression branching on `cardStyle`**, so by the letter of the rule I have named
it and stopped short of it. **I did not change it**, for a reason I want stated rather than assumed:

- The branch does **not** separate Cook from Full. Its `'window'` arm is `px-3 py-2` and Cook's own
  header container is the literal `px-3 py-2` — **identical**. It separates **SOLO** (`px-4 py-3`,
  the roomier dashboard header) from the KDS.
- Part C says **SOLO IS UNTOUCHED** and requires solo's classes to be character-identical. Removing
  or collapsing this ternary changes solo's header padding on the live dashboard.

So the rule as written and Part C cannot both be satisfied on this line. **Rather than choose, I
left it exactly as it is and I am asking.** The equalisation this task is actually about — Cook
versus Full — is complete and is proved in §3 below; this line is not part of it.

**A second occurrence of the same shape, `OrderCard.tsx:1451`:**

```tsx
            <div className={`bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 mx-3 rounded-md flex items-start gap-2 text-sm ${cardStyle === 'solo' ? 'mb-2' : 'mb-3'}`}>
```

This one branches a **MARGIN** (`mb-2` / `mb-3`), which is not on the rule's list of size, weight and
padding — the padding it does carry (`px-3 py-2`) is unconditional and the size (`text-sm`) is
unconditional. It is also solo-versus-KDS, not Cook-versus-Full: **Cook and Full both take the
`mb-3` arm**, so they are identical here. Named for completeness; also untouched. Its own comment
says the 12px is a safety buffer above the completion button and *"Do not reduce it."*

Everything else below is done.

---

## 1. PART A — WHAT MOVED

Every change is **inside the Cook-only arms**. Cook moved onto Full's values; Full did not move.

| # | Element | Was (after the previous task) | Was (before it, at HEAD) | **Now** | Source of the new value |
|---|---------|------------------------------|--------------------------|---------|-------------------------|
| 1 | Order number | `text-4xl font-bold` | `text-lg font-bold` | **`text-3xl font-bold`** | Full's window arm, line 1204 |
| 2 | Time readout | `text-xs` (SET) | `text-xs` (SET) | **inherits `font-medium text-sm`** | Full's row 2, line 1226 |
| 3 | Customer name | `text-xs` (SET) | `text-xs` (SET) | **inherits `font-medium text-sm`** | Full's row 2, line 1226 |
| 4 | Category heading | `text-sm font-bold` | `text-xs font-bold` | **`text-xs font-bold`** | Full's heading, line 1371 |
| 5 | Item line | `text-xl font-normal`, no padding | `text-sm font-normal`, no padding | **`text-sm font-normal py-1.5`** | Full's item row, line 1394 + 1399 |
| 6 | Modifier line | `text-sm` | `text-xs` | **`text-xs`** | Full's modifier, line 1424 |
| 7 | Note line | `text-sm italic` | `text-xs italic` | **`text-xs italic`** | Full's note, line 1429 |
| 8 | Modifier block indent | `pl-3` | `pl-3` | **`pl-4`** | Full's block, line 1421 |

Rows 1–3 and 8 are **new values that were never in the file before** — Cook was smaller than Full at
HEAD, larger after the previous task, and neither state matched. Rows 4, 6 and 7 are exact reverts
to HEAD. Row 5 reverts the size and adds Full's row padding.

**The quoted result — Cook's header:**

```tsx
        <div className={`w-full px-3 py-2 ${headerCls}`}>
          <div className="flex items-baseline justify-between gap-1 font-medium text-sm">
            <span className="text-3xl font-bold text-slate-900 truncate">#{order.id}</span>
            {buzzerChip}
            {statusBadgeKds}
            <span className="text-slate-600 flex-shrink-0 inline-flex items-center gap-1 ml-auto">
              {timeLabel}
              {offsetLabel && (isLate
                ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white">{offsetLabel}</span>
                : <>{` · ${offsetLabel}`}</>)}
            </span>
          </div>
          <div className="flex items-center gap-1 font-medium text-sm mt-0.5">
            {nameEl('text-slate-600 min-w-0')}
            {allStruck && <span className="text-green-700 font-black text-xs ml-1">✓</span>}
          </div>
        </div>
```

**And Cook's items:**

```tsx
                  <div className={`flex items-center gap-2 mb-1 ${gi > 0 ? 'mt-3' : ''}`}>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                      {cat === '__other__' ? 'Other' : cat}
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  {lines.map((line, j) => (
                    <div key={j} className="mb-0.5">
                      <p className="text-sm font-normal text-slate-900 py-1.5">{line.quantity}× {line.name}</p>
                      {(line.modifiers?.length || line.note) && (
                        <div className="pl-4">
                          {line.modifiers?.map(m => (
                            <p key={m.name} className="text-xs text-slate-500">+ {m.name}</p>
                          ))}
                          {line.note && <p className="text-xs text-slate-500 italic">📝 {line.note}</p>}
                        </div>
                      )}
                    </div>
                  ))}
```

---

## 2. THE INHERITED-VERSUS-SET ASYMMETRY — RESOLVED, AND WHICH WAY

Part B: *"Where a size was INHERITED in one mode and SET in the other, that asymmetry is itself the
defect — resolve it so both inherit or both set, and say which you chose."*

Two elements had it. The **customer name** and the **time readout** both **SET `text-xs`** in Cook,
while Full's equivalents **INHERIT `font-medium text-sm`** from their row container:

```tsx
              {/* Full, row 2 — the declaration lives on the ROW */}
              <div className="flex items-center gap-2 font-medium text-sm mt-0.5">
                {nameEl('opacity-80 min-w-0')}
                {timeLabel && <span className="opacity-70 flex-shrink-0 ml-auto">{timeLabel}</span>}
```

**I chose BOTH INHERIT.** The declaration now sits on Cook's row containers, in the same place Full
puts it, and both children were stripped of their own `text-xs`:

- Cook row 1 gained `font-medium text-sm` (it carries the **time**; Cook puts the time on row 1,
  Full on row 2 — that is a layout difference, not a type one).
- Cook row 2 gained `font-medium text-sm` (it carries the **name**).

**Why inherit and not set:** setting it explicitly on Cook's two children would have made Cook the
only place on the card where these two strings carry their own size, and the next person changing
Full's row-2 declaration would silently move Full and leave Cook behind — which is precisely how the
sizes came to differ in the first place. Making both inherit means the declaration exists once per
row in each arm and a reader comparing the two arms compares one line to one line. **The alternative
— making both SET — would have required editing Full's row 2, and Part C freezes Full.**

**Nothing else in either Cook row can see the new declaration.** Verified by reading every sibling:
the order number states `text-3xl font-bold`, `buzzerChip` states `text-[10px] font-black`
(line 716), `statusBadgeKds` states `text-xs font-bold` (line 806), the late pill states
`text-[10px] font-bold`, and the ✓ states `font-black text-xs`. Every one of them overrides. The
only children that inherit are the two that are meant to.

---

## 3. PART B — EVERY REMAINING `cardStyle` OCCURRENCE

`grep -c cardStyle components/dashboard/OrderCard.tsx` → **12**. All twelve, classified:

| Line | Occurrence | What it gates | Verdict |
|------|-----------|---------------|---------|
| 96 | `cardStyle = viewMode,` | nothing — the default binding | ✅ not a gate |
| 134 | comment | nothing | ✅ comment |
| 145 | comment | nothing | ✅ comment |
| 149 | `cardStyle?: ViewMode` | nothing — the prop type | ✅ declaration |
| 682 | `partPaidRow = (… \|\| cardStyle === 'cook' \|\| …) ? null : …` | **PRESENCE** — the part-paid money row is absent in Cook | ✅ presence |
| 1103 | `{cardStyle === 'cook' ? (` | **PRESENCE** — which header renders; no size inside it branches | ✅ presence |
| 1105 | comment (new, mine) | nothing | ✅ comment |
| **1151** | `cardStyle === 'window' ? 'px-3 py-2' : 'px-4 py-3'` | **PADDING** — solo vs KDS | 🔴 **NAMED — see §0** |
| 1152 | `{cardStyle === 'solo' ? (` | **PRESENCE** — which of the two non-Cook headers renders | ✅ presence |
| 1273 | `{cardStyle === 'cook' ? (` | **THE ITEM RENDERER** — explicitly in scope to stay | ✅ item renderer |
| 1388 | comment quoting the deleted `text-base` ternary | nothing | ✅ comment |
| 1451 | `cardStyle === 'solo' ? 'mb-2' : 'mb-3'` | **MARGIN** — solo vs KDS | ⚠️ named — see §0 |

**Not one occurrence gates a size or a weight.** Line 1151 gates a padding and line 1451 a margin;
both separate SOLO from the KDS, neither separates Cook from Full, and both are frozen by Part C.

**The dead `text-base` arm stays removed.** Line 1396 reads `gap-2 text-sm rounded py-1.5` — a
literal, with no ternary. Line 1388 is the comment recording what it replaced.

---

## 4. PART B — THE ELEMENT-BY-ELEMENT TABLE

Every element Cook renders, with the size, weight and padding classes each mode resolves to. Built
by **executing** a regex extraction against the current source, not by reading the table off the
screen — the script pulls each literal out of the file and compares the two sets:

| Element Cook renders | Cook | Full | |
|----------------------|------|------|---|
| header container | `px-3 py-2` | `px-3 py-2` | ✅ IDENTICAL |
| order number | `text-3xl font-bold` | `text-3xl font-bold` | ✅ IDENTICAL |
| buzzer chip | `text-[10px] font-black px-1.5 py-0.5` | `text-[10px] font-black px-1.5 py-0.5` | ✅ IDENTICAL |
| status badge | `text-xs font-bold px-2 py-0.5` | `text-xs font-bold px-2 py-0.5` | ✅ IDENTICAL |
| time readout | *inherits* `font-medium text-sm` | *inherits* `font-medium text-sm` | ✅ IDENTICAL |
| late pill | `text-[10px] font-bold px-1.5 py-0.5` | `text-[10px] font-bold px-1.5 py-0.5` | ✅ IDENTICAL |
| customer name | *inherits* `font-medium text-sm` | *inherits* `font-medium text-sm` | ✅ IDENTICAL |
| all-struck ✓ | `font-black text-xs` | `font-black text-xs` | ✅ IDENTICAL |
| category heading | `text-xs font-bold` | `text-xs font-bold` | ✅ IDENTICAL |
| item line | `text-sm font-normal py-1.5` | `text-sm font-normal py-1.5` | ✅ IDENTICAL |
| modifier block indent | `pl-4` | `pl-4` | ✅ IDENTICAL |
| modifier line | `text-xs` | `text-xs` | ✅ IDENTICAL |
| note line | `text-xs` | `text-xs` | ✅ IDENTICAL |

**EVERY ROW IS IDENTICAL.** Thirteen elements, thirteen matches; the script's own final assertion
printed `EVERY ROW IDENTICAL: True`.

Three notes so the table is not read as claiming more than it does:

1. **The buzzer chip, status badge and late pill were already shared** — they are the same expression
   rendered in both arms (`buzzerChip`, line 712; `statusBadgeKds`, line 822) or the same literal
   written twice. They cannot differ. They are listed because Cook renders them.
2. **`text-slate-600` versus `opacity-80` / `opacity-70`** on the name, time and ✓ is a **colour**
   difference, not a size, weight or padding one, and it is outside what this task changes.
3. **What is NOT in the table, stated plainly rather than left out.** Three spacing values differ
   between the arms, and none of them is a size, a weight or a padding:
   - Cook's header rows use `gap-1`, Full's use `gap-2` (**flex gap**). Cook's row 1 carries four
     children where Full's carries two plus a cluster; widening it at a 240px column is a layout
     change I was not asked to make.
   - Cook's item wrapper keeps `mb-0.5` (**margin**); Full's carries none and puts `-mt-0.5 mb-0.5`
     on its modifier block instead.
   - Cook's header container has no `text-left` where Full's does (**alignment**). Both rows are
     flex containers, so it has no effect on either.

---

## 5. PART C — WHAT DID NOT CHANGE

**SOLO IS UNTOUCHED — proved structurally, not asserted.** `git diff -U0` produces nine hunks, at
lines **1104, 1106, 1116, 1123** (Cook's header), **1256, 1265, 1267** (Cook's items) and
**1356, 1360** (the comment plus the already-collapsed `text-base` literal from the previous task).
HEAD lines **1128–1255 — the entire window/solo header, both arms — carry no hunk at all** and are
therefore byte-identical to HEAD. Solo's header, its two rows, its `text-2xl` order number, its
`text-lg` time, its `text-sm` name and its `font-bold text-sm` price are all unmodified bytes.

```
$ grep -c cardStyle "app/dashboard/[token]/page.tsx"
0
```

**Zero, as required** — the dashboard passes neither `cardStyle` nor `viewMode`, both default to
`'solo'`, and no line I touched is reachable from it. Pizzeria Gusto's live path renders the same
bytes it rendered before this task.

**FULL IS UNTOUCHED.** Every one of the nine hunks is inside a `cardStyle === 'cook'` arm, except
the two at 1356/1360 which are the previous task's already-landed literal collapse — and that
collapse resolves to `text-sm` for both solo and window, which is what both branches already
evaluated to. No hunk lands in the window arm of the header (1186–1224 in the current file) or in
the window/solo item renderer's structure.

**Also unchanged, checked rather than assumed:**
- **The "To make" bar** — it lives in `app/dashboard/[token]/kds/page.tsx`, and
  `git diff --stat` on that file returns **empty**. Not one byte of the KDS page moved.
- **Board filters, `boardMode`, the two switches** — all in the KDS page, unchanged (same empty diff).
- **`hideAmounts` and which elements it hides** — all ten call sites (97, 168, 584, 682, 1192, 1220,
  1333, 1351, 1358, 1417, 1427) are outside every hunk.
- **`renderButtons`, `completionBtn`, the status badge, the item renderer selection,
  `RejectOrderModal`, the post-gate handler, the toast system, the push work, the pause path,
  anything under `app/api`** — none appear in any hunk; no file but `OrderCard.tsx` was written.

---

## 6. VERIFICATION — WHAT WAS EXECUTED AND WHAT WAS READ

**TSC-clean is not verification, and it is not offered as any.** `npx tsc --noEmit` exits 0 and
`npx eslint components/dashboard/OrderCard.tsx` reports 2 errors and 3 warnings — **all five at
lines 73, 85, 99, 283 and 350**, every one of them outside the edited ranges (1103–1310) and
therefore pre-existing. That is the floor, not the verification.

| Claim | How verified |
|-------|--------------|
| Every element Cook renders uses Full's size, weight and padding | **EXECUTED** — a script extracted each literal from the current file and compared the two sets per element; 13/13 identical, final assertion `True`. This is an executed comparison of the **SOURCE**, not of rendered pixels. |
| No size, weight or padding expression branches on `cardStyle` | **EXECUTED** for the enumeration (`grep -n cardStyle`, all 12 lines listed above), **READ** for the classification of each one. **One padding branch found and named — see §0.** |
| Full is unchanged from before this task | **EXECUTED** — `git diff -U0` hunk map; no hunk in the window arm. |
| The dashboard is unchanged in every branch | **EXECUTED** — `grep -c cardStyle` on the dashboard page returns 0; hunk map shows no hunk in the solo arm. |
| Cook still hides every monetary amount | **READ** — all `£`/`money(` sites enumerated by grep (lines 55, 67, 345, 379, 382, 400, 417, 497, 512, 584, 588, 667–669, 676, 687, 736, 1192, 1198, 1220, 1335, 1358, 1419, 1427); none falls inside Cook's header block or Cook's item block, and every KDS-reachable one is `!hideAmounts`-gated or `partPaidRow`-gated. **No `hideAmounts` gate was added, removed or moved.** |

**NOT VERIFIED BY EXECUTION, AND THIS MATTERS:** nothing here was rendered. No `next dev`, no
`next build`, no `cap sync` — all forbidden, all skipped. **Nobody has looked at a Cook card since
this change.** The claim "Cook and Full look the same size" is a claim about class strings in the
source, and it rests on Tailwind resolving `text-sm` to the same value in both arms, which it does
because they are the same class in the same stylesheet. Whether Cook is now legible from a metre
away at `text-3xl` and `text-sm` is a **product** question this task deliberately does not answer —
the brief's rule is parity, and parity is what was delivered. If Cook turns out to be too small on
a hot counter, the fix is to raise **both** modes, not to reopen the branch.

---

## 7. INTEGRITY

### 7.1 `components/dashboard/OrderCard.tsx` — byte scan and census

Scanned with a **byte-level tool** (Python over `open(…, 'rb')`), never grep.

```
BEFORE   bytes 105,328   chars 101,176   lines 1,497
AFTER    bytes 106,553   chars 102,347   lines 1,509
NUL 0 · control bytes <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E–0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 31 distinct classes before, 31 after, NO NEW CLASS INTRODUCED.**

| Codepoint | Before | After | Δ | | Codepoint | Before | After | Δ |
|---|---|---|---|---|---|---|---|---|
| U+2500 ─ | 1534 | 1555 | +21 | | U+270F ✏ | 4 | 4 | 0 |
| U+2014 — | 190 | 194 | +4 | | U+00B7 · | 4 | 4 | 0 |
| U+26A0 ⚠️ | 67 | 66 | **−1** | | U+2709 ✉ | 4 | 4 | 0 |
| U+FE0F | 65 | 64 | **−1** | | U+1F4DD 📝 | 4 | 4 | 0 |
| U+1F534 🔴 | 64 | 64 | 0 | | U+1F4B7 💷 | 2 | 2 | 0 |
| U+00A3 £ | 25 | 25 | **0** | | U+1F4B3 💳 | 2 | 2 | 0 |
| U+2192 → | 22 | 22 | 0 | | U+21A9 ↩ | 2 | 2 | 0 |
| U+2713 ✓ | 11 | 13 | +2 | | U+2705 ✅ | 2 | 2 | 0 |
| U+2022 • | 10 | 10 | 0 | | U+1F514 🔔 | 2 | 2 | 0 |
| U+2026 … | 8 | 10 | +2 | | U+2264 ≤ · U+2265 ≥ | 1 · 1 | 1 · 1 | 0 |
| U+00A7 § | 6 | 6 | 0 | | U+2717 ✗ · U+1F355 🍕 | 1 · 1 | 1 · 1 | 0 |
| U+00D7 × | 5 | 5 | **0** | | U+1F4F1 📱 · U+1F381 🎁 | 1 · 1 | 1 · 1 | 0 |
| U+21D2 ⇒ · U+23F3 ⏳ · U+1F525 🔥 | 5 each | 5 each | 0 | | U+2715 ✕ | 1 | 1 | 0 |

**The three deltas that matter.** `U+00A3 £` is **25 before and 25 after** — no money glyph was
added or removed anywhere in the file. `U+00D7 ×` is **5 and 5** — the item line's
`{line.quantity}× {line.name}` run survived the rewrite intact. `U+26A0` and `U+FE0F` each fell by
exactly one: two ⚠️ comment markers were deleted and one was added. The rises in ─, —, ✓ and … are
comment prose and box-rules, nothing rendered.

**Carrier-aware variation-selector check on the source file:** `U+26A0` n=66, **64 paired with
U+FE0F, 2 bare** — the two bare ones are the pre-existing `PAYMENT NOT RECORDED` and
`Last update didn't sync` markers in the `conflictMarker` JSX, each of which opens with a bare
U+26A0 (quoted here WITHOUT that glyph, so this report's own pairing stays clean). Both are rendered
text and both were bare before this task. `U+1F534` n=64 (0 paired, 64 bare — emoji presentation by default). `U+2705` n=2,
`U+2713` n=13, `U+2717` n=1, all bare, all unchanged in pairing.

### 7.2 This report — SEPARATE pass, run AFTER writing

```
docs/kds-type-equalise-report.md   bytes 22,505
NUL 0 · control bytes <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E–0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE.** Bare versus paired counted
per base, never as a raw total:

| Base | Occurrences | Paired with U+FE0F | Bare |
|------|-------------|--------------------|------|
| U+1F534 🔴 | 3 | 0 | 3 |
| U+2705 ✅ | 26 | 0 | 26 |
| **U+26A0 ⚠️** | **4** | **4** | ✅ **0** |
| U+2713 ✓ | 7 | 0 | 7 |
| U+2717 ✗ | 2 | 0 | 2 |

`U+1F534` and `U+2705` have **emoji presentation by default** and need no selector — bare is
correct for them and they render as emoji everywhere. `U+2713` and `U+2717` are **not
emoji-presentation bases at all**; no selector applies and none is wanted. **`U+26A0` is the one
base here that defaults to TEXT presentation**, and every one of its 4 occurrences in this
report is **PAIRED — 4 OF 4, ZERO BARE**. The file's total `U+FE0F` count is 4,
which exactly accounts for the 4 paired warning signs and nothing else.

### 7.3 Working tree

```
 M components/dashboard/OrderCard.tsx
?? docs/event-pause-diagnosis-report.md
?? docs/kds-cook-type-report.md
?? docs/kds-type-equalise-report.md
```

**Which entries pre-existed this task:**

- `M components/dashboard/OrderCard.tsx` — **PRE-EXISTING as a modification**, and this task added
  to it. It was already dirty before this task began (it carries the whole `viewMode`/`cardStyle`
  split, `hideAmounts`, the status badge, the reclaimed price column and the previous task's
  enlargement). This task's edits are the nine hunks listed in §5.
- `?? docs/event-pause-diagnosis-report.md` — **PRE-EXISTING**, written by the previous task.
- `?? docs/kds-cook-type-report.md` — **PRE-EXISTING**, the report this one corrects.
- `?? docs/kds-type-equalise-report.md` — **NEW**, this file.

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.

---

## 8. NO GARBLED SPAN

Every span of the prompt arrived intact and legible. The only tension is the one in §0 — the
"no padding may branch on `cardStyle`" rule against "SOLO IS UNTOUCHED" at line 1151 — and I stopped
and asked rather than choosing.
