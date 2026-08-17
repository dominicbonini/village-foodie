# KDS: Window/Cook removed, the view derived, one switch renamed

**All three changes made, plus a one-time migration and two consequences of change 1 that the brief did
not name.** `npx tsc --noEmit` passes with no output — **which is not verification.**

**ONE file changed by this task: `app/dashboard/[token]/kds/page.tsx`.**
🔴 **`components/dashboard/OrderCard.tsx` was NOT touched** — its census is byte-for-byte unchanged.
No commit, no stage, no revert, no stash, no clean. No build, no `next dev`, no `next build`, no
`cap sync`, no deploy, no SQL, no migration file, no schema change. **Nothing under `app/api` or
`lib/payments`.**

**No span of the prompt arrived garbled.** ✅ **The rescinded instruction was taken as rescinded: the
handover switch is labelled `Payment/Collected` and I did not stop on it.**

⚠️ **`docs/kds-two-switches-build-report.md` was read first. Its build stands; the mapping below is
re-derived against the BUILT TREE, not against HEAD, as H1 requires.**

---

# 🔴 TWO CONSEQUENCES OF CHANGE 1 THE BRIEF DID NOT LIST — DECLARED, NOT SLIPPED IN

**H2 declares two expected differences. Deriving `viewMode` produces MORE than two, all on the SAME
device the brief already named — a Window + payments-off device — and all from the same cause.** ⚠️ **I
did not stop, because H2's stop condition is "any OTHER device", and this is the declared device. But
the full list is owed:**

| Consumer of `activeView`/`viewMode` | Window + payments-OFF device, BUILT TREE | After derivation | Declared in brief? |
|---|---|---|---|
| `showPrices` | prices **shown** | prices **hidden** | ✅ **yes** |
| cook card header / padding / grouping / type | window shape | **cook shape** | ⚠️ implied — the brief lists them as consumers that "keep working" |
| **the "To make" pill bar** | **shown** | 🔴 **HIDDEN** | 🔴 **NO** |
| **the "Done today" strip** | **shown** (list layout) | 🔴 **HIDDEN** | 🔴 **NO** |
| `partPaidRow` | already hidden (`hidePayments`) | hidden | no change |
| board membership | `windowOrders` with `hidePayments` → drops `'ready'` | `cookOrders` → drops `'ready'` | **same set** |
| button set | cook set (`hidePayments` disjunct) | cook set (`viewMode === 'cook'`) | **same** |

✅ **All four visible changes are internally consistent: the device is now a cook screen in every
respect rather than a window screen wearing the cook button set.** ⚠️ **But "stops showing prices" was
an incomplete description of what that device loses, and the To-make bar in particular is a working
aid.**

---

# STAGE 1 — READ ONLY

## A. Every consumer of `activeView`, `viewMode` and `hg_kds_view_`

### `activeView` — eleven references in `kds/page.tsx`, and **NOT FOUND anywhere else in the repo**

```
$ grep -rn "activeView" app components lib | grep -v kds/page.tsx
NOT FOUND outside kds/page.tsx
```

| # | Consumer | Derivation preserves it? |
|---|---|---|
| 1 | the definition itself | replaced |
| 2 | `displayOrders` — cook vs window board | ✅ **yes, WITH ONE FIX** — see the guard below |
| 3 | `cardViewMode` → the card's `viewMode` | ✅ yes |
| 4, 5 | the Window/Cook tab classNames | **removed with the control** |
| 6 | the two switches' gate | **removed** — see D |
| 7 | the "Open cook screen" link | 🔴 **removed — it became a link that lied.** See below |
| 8 | the "To make" pill bar | ⚠️ **behaviour changes for one device** — declared above |
| 9 | the "Done today" strip | ⚠️ **behaviour changes for one device** — declared above |

### `viewMode` in `OrderCard` — every live consumer

```tsx
  const partPaidRow = (hidePayments || viewMode === 'cook' || !effectivePartPaid) ? null : (
  const showPrices = viewMode !== 'cook'
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
    if (viewMode === 'window') {
      {viewMode === 'cook' ? (
        <div className={`w-full text-left ${viewMode === 'window' ? 'px-3 py-2' : 'px-4 py-3'} ${headerCls}`}>
          {viewMode === 'solo' ? (
          {viewMode === 'cook' ? (
                          className={`… ${viewMode === 'solo' || viewMode === 'window' ? 'text-sm' : 'text-base'} …`}
```

✅ **EVERY ONE KEEPS WORKING WITH NO EDIT**, because each reads `viewMode` and none needs to know where
it came from. ✅ **`viewMode === 'solo'` branches are the dashboard's and are unreachable from the KDS
either way.**

# 🔴 NO CONSUMER NEEDS `viewMode` TO BE INDEPENDENT OF THE SWITCHES.

**The one that came closest was `displayOrders`, and it needed a fix rather than a stop — see the guard
below.**

## B. Every read and write of `hg_kds_view_`

**Repo-wide, including `*.swift`, `*.java`, `*.kt`:**

```
app/dashboard/[token]/kds/page.tsx:167:    const v = localStorage.getItem(`hg_kds_view_${token}`)
app/dashboard/[token]/kds/page.tsx:406:    localStorage.setItem(`hg_kds_view_${token}`, viewOverride)
```

✅ **TWO SITES, BOTH IN THAT ONE FILE. "Not found" in native code, in `van_devices`, and in any
`Preferences` call.** ⚠️ **The migration now reads it from Preferences too — that read is NEW and is
the only Preferences reference to this key that has ever existed. It reads; it never writes.**

## C. Both call sites of `can('cook_screen')` — QUOTED, NOT CHANGED

```ts
  const activeView: KdsView = can('cook_screen')
    ? (viewOverride ?? (isDemo ? 'window' : kdsView))
    : 'window'
```
**Gated: whether the Cook view was reachable at all. A non-Max truck was forced to `'window'`.**

```tsx
          {can('cook_screen') && (
```
**Gated: the Cook tab button in the header switcher.**

✅ **`lib/features.ts` and `lib/plan-features.ts` were NOT edited.**

## D. The switches' gate

**BEFORE — `{activeView === 'window' && (`.** ✅ **CONFIRMED.** Removing it makes them always visible,
which is required: the view is now derived FROM them, so gating them on it would be circular — and
hiding them on a making screen would leave no way back.

## E. `showPrices`

```ts
  const showPrices = viewMode !== 'cook'
```

✅ **CONFIRMED: it reads `viewMode` and nothing else.**

---

# THE THREE CHANGES

## 1. The Window/Cook control removed; the view derived

```ts
  const activeView: KdsView = handoverOn ? 'window' : 'cook'
```

**The header pair is gone; List/Grid and its container stay.** ⚠️ **The `<div className="w-px h-4
bg-slate-300 mx-1" />` divider that separated the two pairs went with it — it separated nothing.**

**And the writer is gone:**

```ts
  const storedView = typeof window === 'undefined' ? null : localStorage.getItem(`hg_kds_view_${token}`)
```

✅ **`hg_kds_view_` is now READ ONCE and never written.** ✅ **The cook-branch condition is untouched:**

```tsx
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
```

⚠️ **Its second disjunct is now unreachable** — `viewMode === 'window'` implies `handoverOn`, which
implies `!hidePayments`. **Left exactly as written, not simplified, as instructed.**

## 🔴 THE ONE FIX THE DERIVATION FORCED — THE BOARD GUARD

**`activeView` used to be independent of the switches, so an unreconciled device always took
`windowOrders` and got `boardKeepsReady` for free. Derived, an unreconciled device on a
`show_paid_step`-TRUE truck resolves to `'cook'` and would take `cookOrders`, which has no guard —
dropping every `'ready'` order for the frames before Preferences lands.**

```ts
  const displayOrders = (activeView === 'cook' ? (boardKeepsReady ? activeOrders : cookOrders) : windowOrders)
```

✅ **`boardKeepsReady` itself is UNCHANGED (H7). It is now applied on both paths rather than one.**
⚠️ **Without this, change 1 would have silently re-opened the exact hole the previous build closed.**

## 2. The handover switch renamed

```tsx
              <span className="hidden sm:inline text-xs">Payment/Collected</span>
```
✅ **`Marks ready` is unchanged.**

## 3. The derived consequence line removed

✅ **All three strings gone** — `Makes and hands over — orders leave when collected`, `Makes only —
orders leave when marked ready`, `Hands over only — orders leave when collected` — **with the `<span
className="hidden lg:inline …">` that carried them.**

## 🔴 A FOURTH REMOVAL, AS A CONSEQUENCE OF CHANGE 1

**"Open cook screen" opened `?view=cook` in a second tab. `?view=cook` is no longer read by anything,
so the link would have opened an ordinary window board under a label promising a cook screen.** ⚠️ **A
link that lies is worse than no link, and the lie was created by change 1 — so removing it is part of
doing change 1 correctly rather than a fourth change of my own.** **The `kdsView` parse of the URL went
with it, unparsed rather than parsed-and-ignored.**

⚠️ **CAPABILITY LOST, STATED PLAINLY: a `crew_mode === 'full'` truck could open a second cook screen in
one click. Now it opens the KDS on that device and turns `Payment/Collected` off** — per-device, and
it survives a reload, which the URL never did.

---

# STAGE 2 — THE MIGRATION

## The synchronous half — first paint

```ts
  const migrateFromCook = storedView === 'cook'
    && readLocalPref(`hg_kds_payments_${token}`) === null
    && readLocalPref(`hg_kds_readystep_${token}`) === null
  const [handoverPref, setHandoverPref] = useState<boolean | null>(
    () => migrateFromCook ? false : readLocalPref(`hg_kds_payments_${token}`),
  )
  const [readyPref, setReadyPref] = useState<boolean | null>(
    () => migrateFromCook ? true : readLocalPref(`hg_kds_readystep_${token}`),
  )
```

🔴 **THIS IS THE HALF THAT PREVENTS THE NAMED FAILURE.** A `'cook'` device with nothing stored on a
`show_paid_step`-FALSE truck would fall to `handoverOn = true` and paint the window branch — **prices
on a grill screen.** That is a **first-paint** failure, so a mount effect alone cannot close it.

## The persisting half — in the reconcile, after Preferences has had its say

```ts
      const effPay = (pay === 'on' || pay === 'off') ? pay : (localStorage.getItem(`hg_kds_payments_${token}`) ?? null)
      const effRdy = (rdy === 'on' || rdy === 'off') ? rdy : (localStorage.getItem(`hg_kds_readystep_${token}`) ?? null)
      const effView = view ?? storedView
      if (effView === 'cook' && effPay === null && effRdy === null) {
        setReady(true)
        setHandover(false)
      }
```

✅ **`setReady` / `setHandover` are the dual writers, so both stores receive both values.**

## 🔴 HOW ONCE-ONLY IS GUARANTEED — NO FLAG, AND THAT IS THE POINT

**The guard is "both keys unset"; the write SETS BOTH. A second run cannot satisfy its own
precondition.** ✅ **Re-running is a no-op rather than a correction, which is what makes it safe on
every mount, every reload, forever — and idempotent by construction rather than by bookkeeping.**

✅ **A stored switch always wins:** either key holding a value in either store aborts it, so an
operator who has used the switches is never overridden by an old view value.
✅ **`'window'` is never migrated** — it carries nothing the switches cannot already express.
✅ **`hg_kds_view_` is not deleted.** Left in place, harmless and unread.

## What happens if the Preferences read fails

**`readOne` catches and returns `null` for all three, which is indistinguishable from "not stored". The
localStorage values then decide alone** — which is the best available evidence and is exactly what the
synchronous seed already painted, so the two halves agree.

⚠️ **THE BOUNDED RISK, STATED: the only way to migrate wrongly is for Preferences to hold a switch
value that localStorage lacks AND its read to fail.** The next successful reconcile corrects it,
because Preferences wins there. 🔴 **And `prefsReconciled` is still set on failure, or the board would
stay permanently un-narrowed.**

---

# H1 — THE MAPPING, RE-DERIVED AGAINST THE BUILT TREE

**`v` = `hg_kds_view_`, `P` = handover pref, `R` = ready pref. `sps` = resolved `show_paid_step`.**

| # | `sps` | `v` | `P` | `R` | BUILT TREE: view / handover / ready / branch | NOW: view / handover / ready / branch | Same? |
|---|---|---|---|---|---|---|---|
| 1 | TRUE | unset | unset | unset | window / off / on / **cook** | **cook** / off / on / **cook** | ✅ buttons same |
| 2 | TRUE | `'cook'` | unset | unset | cook / off / on / **cook** | **cook** / off / on / **cook** | ✅ **+ now stored** |
| 3 | TRUE | `'window'` | unset | unset | window / off / on / **cook** | **cook** / off / on / **cook** | ✅ buttons same |
| 4 | TRUE | any | `'on'` | unset | window / on / off / **window** | window / on / off / **window** | ✅ |
| 5 | TRUE | any | `'on'` | `'on'` | window / on / on / **window + Ready** | window / on / on / **window + Ready** | ✅ |
| 6 | FALSE | unset | unset | unset | window / on / off / **window** | window / on / off / **window** | ✅ |
| 7 | FALSE | `'cook'` | unset | unset | 🔴 **cook** / on / off / **window** | 🔴 **cook** / **off** / **on** / **cook** | 🔴 **MIGRATED** |
| 8 | FALSE | any | `'off'` | unset | window / off / on / **cook** | cook / off / on / **cook** | ✅ buttons same |

## ✅ THE THREE COMBINATIONS RENDER WHAT THE PREVIOUS REPORT STATES

- **READY on, HANDOVER off** → `viewMode 'cook'` → the cook branch → `Start cooking` + `Ready`, or
  `Ready` alone when `kds_mode` is false. Order leaves at `'ready'`. ✅
- **READY off, HANDOVER on** → `viewMode 'window'`, `readyStepOn` false → the window branch untouched,
  Waiting/disabled included when `kds_mode` is true. Leaves at `'collected'`. ✅
- **READY on, HANDOVER on** → `viewMode 'window'`, `readyStepOn` true → `Ready` then `completionBtn()`.
  Leaves at `'collected'`. ✅

## H2 — the devices that render differently

| Row | Change | Expected? |
|---|---|---|
| **2** | migrated to READY on / HANDOVER off — **same rendering, now stored** | ✅ **declared by the brief** |
| **7** | 🔴 **rendering CHANGES** — was the window branch, is now the cook set | ✅ **this is the migration's whole purpose: it is the "prices on a grill screen" case** |
| **1, 3, 8** | buttons and board identical; **prices, the To-make bar and the Done strip are lost** | ✅ **the brief's "stops showing prices" — plus the two it did not name** |
| 4, 5, 6 | nothing | — |

🔴 **NO OTHER DEVICE RENDERS DIFFERENTLY.**

---

# 🔴 `can('cook_screen')` NOW GATES NOTHING REACHABLE ON THE KDS

**Both call sites were the two removed above: the `activeView` gate and the Cook tab. A scan of
`kds/page.tsx` for `cook_screen` now returns three hits, all inside comments.**

# ✅ STATED PLAINLY: THE MAKING SCREEN IS NOW AVAILABLE ON EVERY PLAN.

A Starter or Pro truck can turn `Payment/Collected` off and get the cook button set, the cook card and
a board that drops orders at `'ready'` — which `cook_screen` previously reserved for Max.

⚠️ **`lib/features.ts` still grants it to Max and `lib/plan-features.ts` still maps it from
`'Customer-facing display'` with `max: 'coming_soon'`. Neither was changed.** ⚠️ **As
`docs/kds-exit-point-report.md` recorded, that row advertises the feature as NOT YET AVAILABLE, so this
does not give away something currently sold — but the gate is now inert and the flag is dead.**
**Reported, not acted on.**

---

# INVARIANTS

| | Status | Evidence |
|---|---|---|
| **H1** | ✅ | the eight-row table above |
| **H2** | ✅ | rows 2 and 7 expected; 1/3/8 are the declared prices case **plus two consequences named at the top** |
| **H3** | ✅ | `completionBtn`, `partPaidRow`, cook header/padding/grouping/type, `MAX_GRID_VISIBLE`, `doneOrders`, `overlayedOrders` and the `'cooking'` fall-through all untouched — **`OrderCard.tsx` has an identical census** |
| **H4** | ✅ | `cooking`, `show_cooking_step`, `order_ready_enabled`, `app/api`, `lib/payments` untouched; no SQL, no migration file |
| **H5** | ✅ | `disabled={!handoverOn}` and `disabled={!readyOn}` both present, both `onClick` guards intact |
| **H6** | ✅ | dual write unchanged, Preferences still wins, tri-state `null` preserved |
| **H7** | ✅ | `boardKeepsReady` **unchanged**; applied on both paths |

---

# 🔴 VERIFICATION

**`tsc` passing is NOT verification and is not counted.**

| Item | Method |
|---|---|
| No writer of `hg_kds_view_` remains | ✅ **EXECUTED** — scan returns one read + one Preferences read, no write |
| `can('cook_screen')` gone from the KDS | ✅ **EXECUTED** — three hits, all comments |
| `OrderCard.tsx` untouched | ✅ **EXECUTED** — census identical, class for class |
| Cook branch condition intact | ✅ **EXECUTED** — literal match |
| Both-off guards intact | ✅ **EXECUTED** — both `disabled` attributes found |
| H3 untouchables present | ✅ **EXECUTED** — occurrence counts |
| Byte scan, census, carrier | ✅ **EXECUTED** — below |
| **Each of the three combinations renders the stated button set** | 🔴 **SOURCE READ ONLY — NOT OBSERVED** |
| **A `'cook'`-stored device with no switch values migrates** | 🔴 **SOURCE READ ONLY** — the condition was read, never run |
| **A `'window'`-stored device is not migrated** | 🔴 **SOURCE READ ONLY** |
| **`showPrices` false when handover off, true when on** | 🔴 **SOURCE READ ONLY** — derived from two expressions |
| **The header no longer renders the control or the derived line** | 🔴 **SOURCE READ ONLY** — the JSX was removed and re-read, never rendered |
| **Both-off remains unreachable** | 🔴 **SOURCE READ ONLY** — `disabled` was read, never clicked |

⚠️ **AND THE LIVE-TRUCK LIMITS FROM THE PREVIOUS REPORT STILL HOLD: `kds_mode` is false on both trucks,
so the Waiting treatment and status `'cooking'` remain UNOBSERVABLE, and both are `show_paid_step`
TRUE, so row 7 — the migration case this whole stage exists for — CANNOT BE OBSERVED ON EITHER LIVE
TRUCK.** 🔴 **Row 7 needs a `show_paid_step`-FALSE truck with a device holding `hg_kds_view_ = 'cook'`.
I did not create one, and changing a truck's settings to manufacture it is forbidden.**

---

# INTEGRITY

## Non-ASCII class census, before and after

### `app/dashboard/[token]/kds/page.tsx` — 33 classes BEFORE, **33 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 55 | 62 | **+7** | headline markers in the new comments |
| U+2014 EM DASH | 174 | 182 | **+8** | prose |
| U+2500 BOX DRAWINGS | 1441 | 1507 | **+66** | comment rules; the removed control's markup carried none |
| U+26A0 WARNING SIGN | 41 | 48 | **+7** | caveat markers — **all 7 paired** |
| U+FE0F | 41 | 48 | **+7** | ✅ **matches the U+26A0 delta exactly** |
| *all 28 others* | — | — | **0** | unchanged — including `U+1F4B7` and `U+2713`, the two switch glyphs |

### `components/dashboard/OrderCard.tsx` — 31 classes BEFORE, **31 AFTER**

🔴 **NO CHANGE IN ANY CLASS. The file was not edited this task.**

# ✅ NEITHER FILE GAINED OR LOST A CHARACTER CLASS.

## Carrier-aware check — edited file

| File | Base | BEFORE n / paired / bare | AFTER n / paired / bare | Verdict |
|---|---|---|---|---|
| **KDS** | U+26A0 | 41 / 40 / **1** | 48 / 47 / **1** | ✅ **bare unchanged** |
| | U+2705 | 2 / 0 / 2 | 2 / 0 / 2 | ✅ |
| | U+2713 | 4 / 0 / 4 | 4 / 0 / 4 | ✅ |
| | U+1F4B7 | 1 / 0 / 1 | 1 / 0 / 1 | ✅ |
| | U+1F534 | 55 / 0 / 55 | 62 / 0 / 62 | ✅ consistent |
| **OrderCard** | all | *(unchanged)* | *(unchanged)* | ✅ |

🔴 **The one bare U+26A0 is pre-existing and unchanged. Every warning sign added is paired.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. The written file, the untouched sibling, and this report in a SEPARATE
pass.**

```
  app/dashboard/[token]/kds/page.tsx                    128,968  offending=0  CR=0   (was 124,836)
  components/dashboard/OrderCard.tsx                     90,137  offending=0  CR=0   (unchanged)
  docs/kds-view-removal-report.md   (SEPARATE PASS)       22,915  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

**Per emoji-presentation base: how many occurrences are FOLLOWED by U+FE0F. A raw total is not
reported, because it cannot distinguish a bare warning sign from a paired selector on another base.**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 66 | 0 | 66 |
| U+1F534 LARGE RED CIRCLE | 32 | 0 | 32 |
| U+26A0 WARNING SIGN | 19 | **19** | **0** |

**Every warning sign is paired; ZERO are bare — 19 of 19.** The file's total U+FE0F count is **19**,
which accounts for all of them and leaves none attached to any other base. ⚠️ **The two unpaired bases
are each internally consistent (0 of 66, 0 of 32), so neither is split across two renderings.**
✅ **U+2500 does not appear in this report at all.**

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
?? docs/kds-view-removal-report.md
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **PARTLY** — five earlier tasks' work is in this file; **this task made the three changes** |
| `M components/dashboard/OrderCard.tsx` | ✅ **fully pre-existing — NOT touched this task** |
| `M app/dashboard/[token]/page.tsx` | ✅ pre-existing |
| `M app/manage/[token]/page.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/DemoGetStarted.tsx` | ✅ pre-existing — cuisine dropdown |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.22 update |
| `?? components/shared/CuisinePicker.tsx` · `EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/cuisine-field-report.md` · `extend-removal-report.md` · `finish-time-dry-report.md` · `kds-exit-point-report.md` · `kds-ready-toggle-report.md` · `kds-step-switches-report.md` · `kds-steps-model-report.md` · `kds-toggles-review-report.md` · `kds-two-switches-report.md` · `kds-two-switches-build-report.md` | ✅ pre-existing |
| 🔴 `?? docs/kds-view-removal-report.md` | 🔴 **THIS TASK** |

⚠️ **SEVEN TASKS' WORK IS NOW UNCOMMITTED AND `kds/page.tsx` CARRIES SIX OF THEM.**
