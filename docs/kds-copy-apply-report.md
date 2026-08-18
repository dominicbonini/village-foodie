# KDS — the three label renames, applied

**File changed:** `app/dashboard/[token]/kds/page.tsx` — **the only source file written.**
✅ **The dashboard, every shared component, `lib` and `app/api` are untouched** — `git diff --stat`
across all four is **empty**.
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `diff` and `show` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

🔴 **TWO THINGS THE SCAN TURNED UP THAT YOU SHOULD SEE BEFORE THE DETAIL, BOTH FLAGGED NOT SOLVED:**
**(1)** the dashboard's opener for the SAME shared menu still reads **`Event actions`**, so the two
surfaces now name one control differently; **(2)** the phone opener's new label **`This screen`
collides with the device sheet's existing `This screen` block heading.** §4 and §5.

---

# 1. WHAT WAS APPLIED

| Old | New | Sites |
|---|---|---|
| `Payment/Collected` | **`Payment & handover`** | the visible label (`&amp;` in JSX) + 3 of this file's own comments |
| `Event actions` | **`Manage event`** | the visible label + 🔴 **the `aria-label` AND the `title`** + 5 of this file's own comments |
| `Steps` | **`This screen`** | the visible label |

**14 replacements, all in one file.**

## The visible strings

```tsx
              <span className="hidden sm:inline text-xs">Payment &amp; handover</span>
```
```tsx
          <span className="font-semibold">This screen</span>
```
```tsx
              aria-label="Manage event"
              title="Manage event — start, pause, change or finish it"
```
```tsx
              <span className="hidden sm:inline">Manage event </span>▾
```

# ✅ THE ACCESSIBLE NAME MOVED WITH THE LABEL, IN THE SAME EDIT.

`aria-label="Manage event"` is **the exact visible string at wide width**, keeping the Dashboard-link
precedent so a voice-control user saying *"Manage event"* still matches. The `title` was rewritten to
**lead with the same two words**, so the tooltip and the accessible name agree. 🔴 **A comment now
states the coupling in the file**, since the previous one only said the wording was an open question:

```tsx
              🔴 THE NAME AND THE ACCESSIBLE NAME MOVE TOGETHER, ALWAYS. This read "Event actions" until
              V11.25 marked the rename; if either the label, the `aria-label` or the `title` is ever changed
              alone, voice control matches NEITHER. Change all three or none. */}
```

---

# 2. THE STATE STRINGS AFTER `This screen`

**Quoted before and after. The four arms are UNCHANGED — only the noun in front of them moved.**

| State | BEFORE | AFTER |
|---|---|---|
| both on | `Steps · Ready + payment` | **`This screen · Ready + payment`** |
| ready only | `Steps · Ready only` | **`This screen · Ready only`** |
| payment only | `Steps · Payment only` | **`This screen · Payment only`** |
| 🔴 unreachable | `Steps · None` | **`This screen · None`** |

**The expression itself is untouched:**

```tsx
          <span>{readyOn && handoverOn ? 'Ready + payment' : readyOn ? 'Ready only' : handoverOn ? 'Payment only' : 'None'}</span>
```

✅ **They read naturally after the new noun** — *"This screen · Ready + payment"* is a sentence about
this board, where *"Steps · Ready + payment"* named our model of it. ⚠️ **`This screen · None` is the
weakest of the four**, but it is unreachable and its job is to be visibly wrong if the `disabled` rule
ever breaks; **a smoother word there would make the broken state easier to miss.**

✅ **THE DEFENSIVE COMMENT IS INTACT** — not one byte of it changed, and it still says both halves: do
not delete the arm as dead, do not ship a path to it.

---

# 3. WHAT WAS NOT APPLIED

| | State |
|---|---|
| `Cook` → `Kitchen` | 🔴 **NOT APPLIED — rejected in V11.25.** `git diff` contains no line touching `Cook` |
| `Ready step` | 🔴 **UNCHANGED, DELIBERATELY.** It matches the dashboard's "Order-ready step" and the settings copy that tells operators the two are set separately per device. `git diff` contains no line touching it |

---

# 4. 🔴 THE FULL SCAN — EVERY REMAINING OCCURRENCE, REPO-WIDE

**EXECUTED across `app/`, `components/`, `lib/` and `supabase/`.**

## `Steps` → ✅ **ZERO visible-string occurrences remain.**

⚠️ **The state identifiers `showStepsPanel` / `setShowStepsPanel` remain, deliberately.** They are
**code, not copy**, and this brief forbids touching handlers, keys and state. **Renaming them would be
a structural change made for a copy reason** — and per the stop rule, that is reported rather than
done. *(Everything else the search matched — `wizardSteps`, `TEMPLATE_STEPS`, prose in `app/setup` and
the landing components — is unrelated to this control.)*

## `Payment/Collected` — 3 remain

| Site | Deliberate? |
|---|---|
| `kds/page.tsx:1809` | ✅ **YES — a HISTORICAL reference inside the new comment**: *"It was 'Payment/Collected' — two internal statuses and a slash that reads as 'or'."* Removing it would delete the record of why the name changed |
| `components/dashboard/OrderCard.tsx:138, 144` | ⚠️ **YES, and it is the weakest of the leftovers.** Two prose references in a **SHARED** component's prop documentation (`viewMode` — Payment/Collected…). **Comment-only, so nothing renders differently**, but the file is the dashboard's too and this brief requires the dashboard untouched. **Reported, not changed — say the word and they follow** |

## `Event actions` — 9 remain, and 🔴 **ONE OF THEM IS A LIVE LABEL**

| Site | Deliberate? |
|---|---|
| `kds/page.tsx:2103, 2118` | ✅ **YES** — one names *"the dashboard's Event actions menu"* (which is still called that), the other is the historical note quoted above |
| 🔴 **`app/dashboard/[token]/page.tsx:2994, 2999, 4956`** | 🔴 **YES BY INSTRUCTION, AND IT IS A REAL DIVERGENCE.** These are the **dashboard's own visible label and modal heading** for the SAME shared `EventActionsModal`. The brief renames the KDS only and requires the dashboard unchanged, so **one control now has two names depending on which screen you open it from** — the exact *"two names for one control"* the brief's own rationale warns about, arrived at by following the brief. **Flagged, not solved** |
| `app/dashboard/[token]/page.tsx:2210, 2976, 3147, 3158` | ✅ dashboard comments, consistent with the dashboard's own label |

# 🔴 THE CROSS-SURFACE QUESTION, STATED PLAINLY: DO YOU WANT THE DASHBOARD'S `Event actions` RENAMED TOO? Until it is, an operator moving between the two screens meets two names for one menu. **I did not touch it, because "the dashboard is unchanged" is a hard requirement of this brief.**

---

# 5. ⚠️ A COLLISION THE RENAME CREATED

**`This screen` is now used twice, on two different panels:**

| Where | String |
|---|---|
| The phone opener (new) | `This screen · Ready + payment` — opens the **steps** panel, headed *"What this screen does"* |
| The **device sheet's** first block | `<h3>This screen</h3>` — holds **Keep the screen on** and **New-order sound** |

**Both are accurate and they are different things.** ⚠️ **The device sheet's block heading is the one
to change if either does** — it holds two hardware settings and could be *"This device's screen"* or
*"Screen & sound"* — **but it is the device sheet's contents, which this brief forbids touching.**
**Reported, not changed.**

---

# 6. WIDTH

# ✅ NO ROW COUNT CHANGES AT ANY OF THE FOUR NAMED WIDTHS.

**⚠️ ESTIMATE, NOT MEASUREMENT — nothing was rendered.** Same model as the three previous header
reports (0.515em average advance, 1.15em for emoji, greedy line-fill).

**`Payment & handover` is 18 characters against `Payment/Collected`'s 17 — about +6px.** The other two
renames do not touch the header row: `Manage event` (12 chars) is on the **event bar** and is *shorter*
than `Event actions` (13); `This screen` is on the `sm:hidden` phone opener, which does not render at
any of these widths.

| Viewport | rows BEFORE this task | rows AFTER |
|---|---|---|
| **iPad 9.7/10.2 portrait (768)** | 2 | ✅ **2** |
| **768** | 2 | ✅ **2** |
| **1024** | 2 | ✅ **2** |
| **1366** | 1 | ✅ **1** |

**Row total 1,258 → 1,264px at a typical truck+van name; 1,118 → 1,124px at a short one.**

⚠️ **THE THREE-ROW FINDING AT 640px IS CARRIED FROM THE PREVIOUS TASK, NOT CAUSED BY THIS ONE.**
Returning `Screen on` to the header put 640px at three rows with a typical name; **this rename adds
~6px on top and does not change that verdict at any width.** Restated so it is not read as new.

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `npx tsc --noEmit` exits 0, and `npx eslint` produces a finding
set **byte-identical to HEAD's** (`git show HEAD:…` through `eslint --stdin`, sorted sets diffed).

| Required claim | Method |
|---|---|
| All three strings renamed everywhere, with the scan result | ✅ **EXECUTED** — the full repo scan is §4. **`Steps` has zero visible occurrences left; `Payment/Collected` has 3 and `Event actions` 9, every one enumerated with a reason** |
| `Manage event`'s `aria-label` and `title` match the new visible string | ✅ **EXECUTED** — all three quoted from source in §1; the `aria-label` is the exact visible string |
| `Cook` and `Ready step` are unchanged | ✅ **EXECUTED** — `git diff` contains no line touching either |
| The state strings read naturally after `This screen` | ✅ **Source read** — all four quoted before and after. ⚠️ **Never rendered, never read by an operator** |
| The diff is copy-only | ✅ **EXECUTED** — the only changed lines carrying a `className` are the two label spans, and **their class strings are character-identical; only the text node moved.** No `onClick`, `useState`, `useCallback`, `disabled`, `hidden sm:contents`, `sm:hidden`, `localStorage`, `Preferences` or `hg_kds_*` line is in this task's edits. The census corroborates: **+3 non-ASCII occurrences, all comment prose** |
| The header's row count at each width | 🔴 **ESTIMATE, NOT MEASUREMENT** — §6, labelled as such |
| The dashboard is unchanged | ✅ **EXECUTED** — `git diff --stat app/dashboard/[token]/page.tsx components lib app/api` is **empty** |

## 🔴 NOT VERIFIED

- **NOTHING WAS RENDERED.** No `next dev`, no `next build`, no `cap sync`, no device, **no screen
  reader and no voice control** — so the claim that voice control still matches `Manage event` is a
  claim about an attribute, not an observation.
- **The new wording has never been read by an operator**, which is the only test that settles §5's
  collision or the labels themselves.

---

# INTEGRITY

## `app/dashboard/[token]/kds/page.tsx`

**Byte-level tool (Python over `open(…,'rb')`), never grep.**

```
BEFORE   bytes 187,261   chars 181,073   lines 2,644
AFTER    bytes 187,616   chars 181,421   lines 2,647
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after. NO NEW CLASS, NONE REMOVED.**

| Codepoint | Before | After | Δ | |
|---|---|---|---|---|
| U+2014 — | 308 | 310 | +2 | comment prose |
| U+1F534 🔴 | 132 | 133 | +1 | the new coupling comment |
| U+26A0 ⚠️ | 110 | 110 | +0 | unchanged |
| U+FE0F | 112 | 112 | +0 | unchanged |
| **every other class** | — | — | **0** | |

✅ **NO NEW CLASS AND NONE REMOVED**, and **occurrences moved by only +3 — the smallest census delta of
any task this session, which is what a copy-only change should look like.** **Carrier-aware check on
the source: `U+26A0` n=110, 110 paired, 0 bare.**

## This report — SEPARATE pass, run AFTER writing

```
docs/kds-copy-apply-report.md   bytes 13,825
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE:**

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 19 | 0 | 19 |
| U+2705 ✅ | 26 | 0 | 26 |
| **U+26A0 ⚠️** | **13** | **13** | ✅ **0** |

`U+1F534` and `U+2705` have **emoji presentation by default** — bare is correct for both. **`U+26A0`
is the only base here that defaults to TEXT presentation**, and ✅ **every one of its 13
occurrences is PAIRED — 13 OF 13, ZERO BARE.** ⚠️ **`U+25BE ▾` is quoted as a label glyph and
is not an emoji-presentation base** — no selector applies. The total `U+FE0F` count is 13, which
exactly accounts for the 13 paired warning signs.

## Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M docs/reference-manual.md
?? docs/kds-copy-apply-report.md
?? docs/kds-screen-on-header-report.md
```

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **BOTH** — already modified by seven earlier tasks this session; **this task added 14 copy replacements to it** |
| 🔴 `?? docs/kds-copy-apply-report.md` | 🔴 **THIS TASK** — this file, the only new entry |
| `M docs/reference-manual.md` · `?? docs/kds-event-isolation-report.md` | ✅ pre-existing — **left alone, as instructed** |
| `M app/dashboard/[token]/page.tsx` · `M app/api/dashboard/action/route.ts` · `M lib/native/orderGate.ts` · `M lib/native/useGatedActionResult.tsx` · `M components/dashboard/PaymentActionsModal.tsx` | ✅ pre-existing — the payment-method and modal-backdrop tasks |
| the nine other `?? docs/*.md` | ✅ pre-existing — the preceding tasks' reports. ⚠️ **Not named in the brief's two-entry list; left alone on the same footing** |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
