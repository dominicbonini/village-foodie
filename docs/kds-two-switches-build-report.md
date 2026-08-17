# KDS two step switches — BUILT. The wait is derived.

**Option (b) implemented.** Two switches, two keys, no separate wait control. **`npx tsc --noEmit`
passes with no output — which is not verification, see below.**

**Files changed by THIS task: two.** `components/dashboard/OrderCard.tsx` and
`app/dashboard/[token]/kds/page.tsx`. **No commit, no stage, no revert, no stash, no clean.** No
build, no `next dev`, no `next build`, no `cap sync`, no deploy, no SQL, no migration. **Nothing under
`app/api` or `lib/payments` was touched. The `cooking` status was not altered. No truck's
`show_cooking_step` or `order_ready_enabled` was read for writing or changed.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

⚠️ **`docs/kds-two-switches-report.md` was read first.** Its Stage 1 is not repeated here.

---

# C1–C3 — THE REPURPOSING CHECKS. ALL THREE PASS.

| Check | Command | Result |
|---|---|---|
| **C1** | `git show HEAD:components/dashboard/OrderCard.tsx \| grep -c readyStepOff` | 🔴 **0** |
| **C2** | `git show HEAD:app/dashboard/[token]/kds/page.tsx \| grep -c hg_kds_readystep_` | 🔴 **0** |
| **C3** | `git grep -c "hg_kds_readystep_" HEAD --` | 🔴 **0 files** |
| C3b | `git grep -c "readyStepOff" HEAD --` | 🔴 **0 files** |

✅ **THE KEY CARRIES NO STORED VALUE ON ANY DEVICE.** It was never committed, never deployed, never
written. **`hg_kds_readystep_<token>` was therefore free to repurpose, and mapping row 4 was free to
drop — no device is in it.**

---

# WHAT WAS REMOVED, AND THAT IT WAS UNCOMMITTED

**All three removals were of code that exists only in the working tree — `git show HEAD:` returns none
of it.**

| Removed | Where | In HEAD? |
|---|---|---|
| the `readyStepOff` prop, default and doc comment | `OrderCard.tsx` | 🔴 **NO** |
| the `if (readyStepOff) { … }` branch | `OrderCard.tsx` window branch | 🔴 **NO** |
| the `Ready step / No ready step` chip | `kds/page.tsx` header | 🔴 **NO** |
| `const [readyStepOn, setReadyStepOn] = useState(…)` and its localStorage-only writer | `kds/page.tsx` | 🔴 **NO** |
| `showPaymentsPref` / `togglePayments` | `kds/page.tsx` | ✅ **in HEAD — replaced, not deleted; see below** |

✅ **VERIFIED: `grep -rn "readyStepOff" app components lib` now returns nothing.**

⚠️ **`showPaymentsPref` and `togglePayments` DID exist in HEAD and were replaced** by `handoverPref` /
`setHandover`. **That is a rename plus a dual write, not a removal of capability** — the payments
preference and its key are intact.

---

# THE BUILD

## The resolution — four lines, and they are the acceptance test

**READ, `app/dashboard/[token]/kds/page.tsx`:**

```ts
  const handoverOn = handoverPref ?? !showPaidStep
  const readyOn = readyPref ?? !handoverOn
```
```ts
  const hidePayments = !handoverOn
```

**HEAD computed:**

```ts
  const hidePayments = showPaidStep && showPaymentsPref !== true
```

## 🔴 THE MAPPING, ROW BY ROW AGAINST HEAD

**`P` = the stored payments/handover preference. Derived by reading both expressions, not by running
them.**

| Truck | `P` | HEAD `hidePayments` | HEAD branch | NEW `handoverOn` | NEW `readyOn` | NEW `hidePayments` | NEW branch | Same? |
|---|---|---|---|---|---|---|---|---|
| `show_paid_step` **TRUE** | unset | **true** | cook | `!true` = **false** | `!false` = **true** | **true** | cook | ✅ |
| TRUE | `'on'` | false | window | **true** | **false** | false | window | ✅ |
| TRUE | `'off'` | **true** | cook | **false** | **true** | **true** | cook | ✅ |
| **FALSE** | unset | false | window | `!false` = **true** | **false** | false | window | ✅ |
| FALSE | `'on'` | false | window | **true** | **false** | false | window | ✅ |
| FALSE | `'off'` | false | window | 🔴 **false** | **true** | 🔴 **true** | 🔴 **cook** | 🔴 **NO** |

# ✅ ALL THREE MAPPING ROWS REPRODUCE HEAD.

- **Cook view** → `activeView === 'cook'` enters the cook branch regardless of either switch. ✅
- **Window + payments OFF** → rows 1 and 3: `handoverOn` false → `hidePayments` true → cook branch. ✅
- **Window + payments ON** → rows 2, 4, 5: `handoverOn` true → `hidePayments` false → window branch,
  and `readyOn` is false, so the new block does not fire and the window branch is **untouched**. ✅

## 🔴 THE ONE DIVERGENCE, DECLARED RATHER THAN HIDDEN — ROW 6

**A device that stored payments `'off'` while its truck had `show_paid_step` TRUE, on a truck that has
SINCE turned `show_paid_step` off.** HEAD ignores the stored value on such a truck (P3's
short-circuit) and renders the window branch; the new code honours it and renders the cook set.

⚠️ **THIS IS THE WIDENING THE BRIEF REQUIRES, NOT AN ACCIDENT.** *"The payments key's meaning widens to
name the handover step on every truck."* A preference that is honoured on every truck must be honoured
on that truck too. **It is the only combination in which an existing device renders differently, and
it requires the truck's `show_paid_step` to have been flipped after the device stored its
preference.** ✅ **Neither live truck can be in it: both are `show_paid_step` TRUE.**

## 🔴 THE WIDENING — WHAT IT GIVES, AND THAT IT CHANGES NOTHING UNTIL USED

**HEAD gated the chip on the truck — READ:**

```tsx
        {showPaidStep && activeView === 'window' && (
```

**Now — READ:**

```tsx
        {activeView === 'window' && (
```

✅ **An operator on a `show_paid_step`-FALSE truck can now say "this screen does not hand over", which
they could not before** — the control was not rendered to them at all.

✅ **AND IT CHANGES NOTHING UNTIL THEY USE IT.** With nothing stored, `handoverPref` is `null`, so
`handoverOn` falls to `!showPaidStep` = **true** — the window branch, exactly what such a truck renders
today. **Row 4 of the table above.**

## Invariant A — the wait is DERIVED

**READ, the new branch, which returns before the waiting treatment can be reached:**

```tsx
      if (readyStepOn) {
        if (['confirmed', 'modified'].includes(order.status)) {
          return <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        }
        if (order.status === 'cooking') {
          return (
            <>
              <span className="flex-1 text-amber-700 font-bold text-sm flex items-center">🔥 Cooking…</span>
              <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
            </>
          )
        }
        if (order.status === 'ready') {
          return completionBtn()
        }
      }
      if (!kdsMode) {
```

✅ **Wait if and only if `kds_mode` is true AND READY is off.** With READY on, all three
non-terminal statuses return above the `kdsMode` block, so `⏳ Waiting` + `completionBtnDisabled()` is
**unreachable**. With READY off, `readyStepOn` is false and the `kdsMode` block runs exactly as HEAD.
🔴 **No stored value for the wait exists. It is derived from the two switches and `kds_mode`.**

⚠️ **`'cooking'` is listed for the reason the previous branch listed it: without it a cooking order
falls past the window block into solo, which has no `'cooking'` case, and reaches `return null`.**

## The new combination's Ready button — cook styling, no emoji

**READ, side by side:**

| Branch | Label |
|---|---|
| cook | `<Btn label="Ready" colour="green" …>` |
| **new window block** | `<Btn label="Ready" colour="green" …>` — **identical** |
| solo *(dashboard, untouched)* | `` <Btn label={`${truck?.truck_emoji \|\| "🍕"} Ready`} …> `` |

✅ **No truck emoji, as instructed.**

## Both off is forbidden — the refusal is `disabled`

**READ:**

```tsx
            <button
              onClick={() => { if (handoverOn) setReady(!readyOn) }}
              disabled={!handoverOn}
```
```tsx
            <button
              onClick={() => { if (readyOn) setHandover(!handoverOn) }}
              disabled={!readyOn}
```

✅ **Each switch is disabled when it is the only one on, so the last one cannot be turned off**, and
the guard is repeated inside `onClick` so a synthetic event cannot bypass the attribute.

## Persistence — dual write, Preferences wins

**READ, the initialisers:**

```ts
  const readLocalPref = (key: string): boolean | null => {
    if (typeof window === 'undefined') return null
    const v = localStorage.getItem(key)
    return v === 'on' ? true : v === 'off' ? false : null
  }
  const [handoverPref, setHandoverPref] = useState<boolean | null>(() => readLocalPref(`hg_kds_payments_${token}`))
  const [readyPref, setReadyPref] = useState<boolean | null>(() => readLocalPref(`hg_kds_readystep_${token}`))
```

**READ, the reconcile:**

```ts
    void Promise.all([
      readOne(`hg_kds_payments_${token}`),
      readOne(`hg_kds_readystep_${token}`),
    ]).then(([pay, rdy]) => {
      if (cancelled) return
      if (pay === 'on' || pay === 'off') setHandoverPref(pay === 'on')
      if (rdy === 'on' || rdy === 'off') setReadyPref(rdy === 'on')
      setPrefsReconciled(true)
    })
```

**READ, the writer — both stores, every change:**

```ts
  const writePref = useCallback((key: string, next: boolean) => {
    try { if (typeof window !== 'undefined') localStorage.setItem(key, next ? 'on' : 'off') } catch { /* private mode */ }
    void Preferences.set({ key, value: next ? 'on' : 'off' }).catch(() => {})
  }, [])
```

🔴 **TRI-STATE IS LOAD-BEARING.** `null` means *nothing stored*, which is not *stored false* — the
unset default differs by truck, so collapsing it would erase the distinction the acceptance test rests
on. ⚠️ **A missing Preferences value does not clobber a localStorage value: only an explicit
`'on'`/`'off'` overrides.**

## 🔴 "NEVER FEWER ORDERS" — the one guard the dual write needs

**READ:**

```ts
  const boardKeepsReady = handoverOn || (handoverPref === null && !prefsReconciled)
  const windowOrders = boardKeepsReady
    ? activeOrders
    : activeOrders.filter(o => o.status !== 'ready')
```

**THE CASE IT CLOSES:** after a WKWebView cold kill, localStorage can be empty while Preferences still
holds *handover on*. For the frames before the reconcile lands, `handoverOn` would fall to its unset
default and — on a `show_paid_step`-TRUE truck — **drop every `'ready'` order from the board.**

✅ **While nothing is stored locally AND the reconcile has not returned, the board does not narrow.**
Showing more is visible and harmless; showing fewer silently drops a ticket. ⚠️ **With anything in
localStorage, or once the reconcile lands, the term is false and the filter is HEAD's exactly.** ⚠️
**The reconcile sets `prefsReconciled` even on a read failure, or a web KDS would stay permanently
un-narrowed.**

⚠️ **BUTTONS ARE NOT GUARDED THE SAME WAY, and that is deliberate:** in that window the card renders
the cook set (one enabled `Ready`) where the stored config wants the window set (one enabled
completion control) — **one button either way, neither fewer.**

## The header copy

**READ:**

```tsx
              <span className="hidden sm:inline text-xs">Marks ready</span>
```
```tsx
              <span className="hidden sm:inline text-xs">Takes payment</span>
```
```tsx
            <span className="hidden lg:inline text-[11px] text-slate-400 shrink-0">
              {readyOn && handoverOn
                ? 'Makes and hands over — orders leave when collected'
                : readyOn
                  ? 'Makes only — orders leave when marked ready'
                  : 'Hands over only — orders leave when collected'}
            </span>
```

✅ **No control is labelled with a bare status word.** The derived line states what the screen handles
and when an order leaves, and is computed from the same two values the card reads, so it cannot drift.

---

# INVARIANTS — EACH CHECKED

| Invariant | Status | Evidence |
|---|---|---|
| **A** — wait derived | ✅ | the `readyStepOn` block returns above the `kdsMode` block; no stored wait value exists |
| **B** — `cooking` untouched | ✅ | no writer or reader changed; `app/api` not opened for edit |
| **C** — `show_cooking_step` untouched | ✅ | not referenced by either edit; **still dormant, still a dead prop** |
| **D** — card unchanged | ✅ | `const showPrices` and `const partPaidRow` present once each in HEAD **and** tree; header/padding/grouping/type untouched |
| **E** — `completionBtn` untouched | ✅ | **`diff` of the extracted span against HEAD returned no differences** |
| **F** — Cook view unchanged | ✅ | `hg_kds_view_` and the Window/Cook control untouched; switches gated `activeView === 'window'` |
| **G** — no server/schema/migration | ✅ | `git diff --stat` shows two client files |
| board filter | ✅ | status tests only; **no balance, ledger row or `payment_status` read** |
| 8-cap / `doneOrders` / overlay | ✅ | `MAX_GRID_VISIBLE`, `doneOrders` and `overlayedOrders` unchanged |
| the `'cooking'` fall-through to `return null` | ✅ | **left exactly as it is**, as instructed |
| cook branch condition | ✅ | `if (viewMode === 'cook' \|\| (viewMode === 'window' && hidePayments)) {` — verbatim |

---

# 🔴 VERIFICATION — WHAT WAS VERIFIED HOW

**`tsc` passing is NOT verification and is not counted below.**

| Item | Method |
|---|---|
| C1, C2, C3 | ✅ **EXECUTED** — `git show HEAD:` and `git grep HEAD`, all returning 0 |
| `readyStepOff` fully removed | ✅ **EXECUTED** — repo-wide scan returns nothing |
| `completionBtn` identical to HEAD | ✅ **EXECUTED** — `diff` of the extracted span, no differences |
| `showPrices` / `partPaidRow` unchanged | ✅ **EXECUTED** — occurrence counts equal in HEAD and tree |
| cook branch condition unchanged | ✅ **EXECUTED** — literal match |
| Two files only | ✅ **EXECUTED** — `git diff --stat` |
| Byte scan + census + carrier | ✅ **EXECUTED** — below |
| **Each of the three combinations renders the stated button set** | 🔴 **SOURCE READ ONLY — NOT OBSERVED** |
| **All three mapping rows render identically to HEAD** | 🔴 **SOURCE READ ONLY** — the six-row table is derived by reading two expressions, **not by running them** |
| **Both-off unreachable through the UI** | 🔴 **SOURCE READ ONLY** — `disabled` + the `onClick` guard were read, never clicked |
| **With READY on and `kds_mode` true, the Waiting treatment does not render** | 🔴 **UNOBSERVABLE ON EITHER LIVE TRUCK — see below** |
| **With READY off and `kds_mode` true, it does** | 🔴 **UNOBSERVABLE ON EITHER LIVE TRUCK** |
| **First paint after a cleared localStorage** | 🔴 **SOURCE READ ONLY — NOT OBSERVED.** Requires a cold kill on a device |

## 🔴 WHAT THE LIVE VALUES MAKE UNOBSERVABLE

**Taken as given, verified by your query before this task:**

| Truck | `kds_mode` | `crew_mode` | van `show_cooking_step` | van `order_ready_enabled` |
|---|---|---|---|---|
| pizzeria-gusto | **false** | solo | true | true |
| tikka-tonic | **false** | solo | false | false |

**Both are `show_paid_step` TRUE.**

🔴 **THREE CONSEQUENCES, STATED RATHER THAN TESTED AROUND:**

1. **`kds_mode` is FALSE on both, so the Waiting/disabled treatment CANNOT BE OBSERVED on either.**
   Invariant A's derived wait is **UNOBSERVED**. Verifying it needs a truck with `kds_mode` true.
   ⚠️ **Both directions of the Invariant A test are therefore unobserved, not just one.**
2. **`Start cooking` does not render on either truck** — it needs `kdsMode` true in the cook branch —
   **so status `'cooking'` is unwritable there, and any claim about `'cooking'` behaviour on a live
   truck is unobservable.** ⚠️ **The `'cooking'` case in the new block is therefore untestable on live
   data; it is there to close the `return null` hole, not because it can be exercised today.**
3. **Both trucks are `show_paid_step` TRUE, so their unset default is the COOK button set** — mapping
   rows 1 and 3. **The `show_paid_step`-FALSE default path (row 4) is UNOBSERVED on live data** and
   needs a third truck or a temporary event override to exercise.

⚠️ **AND A FOURTH, WORTH KNOWING BEFORE YOU TEST:** with `kds_mode` false, the cook set on both live
trucks is **`Ready` alone** — not `Start cooking` + `Ready`. That is `kdsMode ? … : …` in the cook
branch, unchanged.

🔴 **DO NOT CHANGE `show_cooking_step` OR `order_ready_enabled` TO MAKE A TEST PASS.** Reported only,
as instructed. ⚠️ **Note that `show_cooking_step` would not help in any case: it is dormant (a dead
prop `OrderCard` never reads), so flipping it would change nothing. `kds_mode` is the field that
drives the wait.**

---

# INTEGRITY

## Non-ASCII census, before and after

### `components/dashboard/OrderCard.tsx` — 31 classes BEFORE, **31 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+1F525 FIRE | 3 | 4 | **+1** | the `🔥 Cooking…` span in the new block, copied from the cook branch |
| U+2026 HORIZONTAL ELLIPSIS | 6 | 7 | **+1** | the same span's `Cooking…` |
| U+23F3 HOURGLASS | 4 | 5 | **+1** | ⚠️ **prose only** — a comment naming the `⏳ Waiting` treatment being derived away |
| U+2014 EM DASH | 150 | 153 | **+3** | prose in the new comments |
| U+2500 BOX DRAWINGS | 1292 | 1278 | **−14** | the removed block's rule was longer than the new one's |
| U+26A0 WARNING SIGN | 46 | 47 | **+1** | one caveat marker — **paired** |
| U+FE0F | 44 | 45 | **+1** | ✅ **matches the U+26A0 delta exactly** |
| *all 24 others* | — | — | **0** | unchanged |

### `app/dashboard/[token]/kds/page.tsx` — 33 classes BEFORE, **33 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+00A7 SECTION SIGN | 4 | 3 | **−1** | the removed payments-chip comment cited `(§9)` |
| U+1F534 LARGE RED CIRCLE | 50 | 55 | **+5** | headline markers in the new comments |
| U+2014 EM DASH | 163 | 174 | **+11** | prose |
| U+2500 BOX DRAWINGS | 1489 | 1441 | **−48** | two long chip comments removed, shorter ones added |
| U+26A0 WARNING SIGN | 40 | 41 | **+1** | one caveat marker — **paired** |
| U+FE0F | 40 | 41 | **+1** | ✅ **matches the U+26A0 delta exactly** |
| *all 27 others* | — | — | **0** | unchanged — including `U+1F4B7` (the handover switch's glyph) and `U+2713` (the ready switch's) |

# ✅ NEITHER FILE GAINED OR LOST A CHARACTER CLASS.

⚠️ **Both switch glyphs were chosen from classes each file already carried** — `✓` U+2713 and `💷`
U+1F4B7 — **so no new class was introduced for decoration.**

## 🔴 Carrier-aware variation-selector check — EDITED FILES

| File | Base | BEFORE n / paired / bare | AFTER n / paired / bare | Verdict |
|---|---|---|---|---|
| **OrderCard** | U+26A0 | 46 / 44 / **2** | 47 / 45 / **2** | ✅ **bare unchanged** |
| | U+2705 | 2 / 0 / 2 | 2 / 0 / 2 | ✅ |
| | U+2713 | 9 / 0 / 9 | 9 / 0 / 9 | ✅ |
| | U+1F4B7 | 2 / 0 / 2 | 2 / 0 / 2 | ✅ |
| | U+1F534 | 47 / 0 / 47 | 47 / 0 / 47 | ✅ |
| **KDS** | U+26A0 | 40 / 39 / **1** | 41 / 40 / **1** | ✅ **bare unchanged** |
| | U+2705 | 2 / 0 / 2 | 2 / 0 / 2 | ✅ |
| | U+2713 | 4 / 0 / 4 | 4 / 0 / 4 | ✅ |
| | U+1F4B7 | 1 / 0 / 1 | 1 / 0 / 1 | ✅ |
| | U+1F534 | 50 / 0 / 50 | 55 / 0 / 55 | ✅ consistent — all bare |

🔴 **The bare U+26A0s (2 and 1) are pre-existing and both counts are unchanged. Every warning sign
added is paired.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. Both written files, plus this report in a SEPARATE pass.**

```
  components/dashboard/OrderCard.tsx                     90,137  offending=0  CR=0   (was 89,194)
  app/dashboard/[token]/kds/page.tsx                    124,836  offending=0  CR=0   (was 122,095)
  docs/kds-two-switches-build-report.md (SEPARATE PASS)   23,337  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

**Per emoji-presentation base: how many occurrences are FOLLOWED by U+FE0F. A raw total is not
reported, because it cannot distinguish a bare warning sign from a paired selector on another base.**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 67 | 0 | 67 |
| U+1F534 LARGE RED CIRCLE | 33 | 0 | 33 |
| U+26A0 WARNING SIGN | 18 | **18** | **0** |
| U+1F4B7 BANKNOTE WITH POUND SIGN | 1 | 0 | 1 |
| U+1F525 FIRE | 2 | 0 | 2 |
| U+23F3 HOURGLASS WITH FLOWING SAND | 2 | 0 | 2 |

**Every warning sign is paired; ZERO are bare — 18 of 18.** The file's total U+FE0F count is **18**,
which accounts for all of them and leaves none attached to any other base. ⚠️ **The five unpaired
bases are each internally consistent (0 of 67, 0 of 33, 0 of 1, 0 of 2, 0 of 2), so no base is split
across two renderings** — the banknote, fire and hourglass glyphs are quoted verbatim from the source
and are bare there too.

## `git status --porcelain`

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
?? components/shared/CuisinePicker.tsx
?? components/shared/EventActionsModal.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/extend-removal-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-exit-point-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-step-switches-report.md
?? docs/kds-steps-model-report.md
?? docs/kds-toggles-review-report.md
?? docs/kds-two-switches-build-report.md
?? docs/kds-two-switches-report.md
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **PARTLY** — four earlier tasks' work is in this file; **this task added the two switches** |
| `M components/dashboard/OrderCard.tsx` | ⚠️ **PARTLY** — the ready-step toggle was already here; **this task replaced it** |
| `M app/dashboard/[token]/page.tsx` | ✅ pre-existing — finish-time extraction, shared menu, extend removal |
| `M app/manage/[token]/page.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/DemoGetStarted.tsx` | ✅ pre-existing — cuisine dropdown |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.22 update |
| `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing |
| `?? components/shared/EventActionsModal.tsx` | ✅ pre-existing |
| `?? components/shared/EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/cuisine-field-report.md` | ✅ pre-existing |
| `?? docs/extend-removal-report.md` | ✅ pre-existing |
| `?? docs/finish-time-dry-report.md` | ✅ pre-existing |
| `?? docs/kds-exit-point-report.md` | ✅ pre-existing |
| `?? docs/kds-ready-toggle-report.md` | ✅ pre-existing |
| `?? docs/kds-step-switches-report.md` | ✅ pre-existing |
| `?? docs/kds-steps-model-report.md` | ✅ pre-existing |
| `?? docs/kds-toggles-review-report.md` | ✅ pre-existing |
| `?? docs/kds-two-switches-report.md` | ✅ pre-existing |
| 🔴 `?? docs/kds-two-switches-build-report.md` | 🔴 **THIS TASK** |

⚠️ **SIX TASKS' WORK IS NOW UNCOMMITTED AND `kds/page.tsx` CARRIES FIVE OF THEM.**
