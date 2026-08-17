# KDS Cook/Full — Stage 2. STOPPED AT DECISION 2.

# 🔴 A SURVIVING CONFIGURATION STILL REACHES `return null` WITH AN ORDER ON THE BOARD. I NAMED IT AND STOPPED, AS INSTRUCTED.

**Nothing was built.** `components/dashboard/OrderCard.tsx` and `app/dashboard/[token]/kds/page.tsx`
were READ and NOT written. **No `hideAmounts` prop was added, `viewMode` still receives `cardMode`,
line 1138 was not split, `showPrices` was not deleted, the header totals were not gated and
`paidChipStatic` was not split.** No file in the repo was written by this task except this report.

**No commit, no stage, no revert, no stash, no clean.** No build, no `next dev`, no `next build`, no
`cap sync`, no deploy, no SQL, no migration, nothing under `app/api`.
**`lib/native/useGatedActionResult.tsx`, the `pendingPayment` prop and the payment overlay: untouched.**

**No span of the prompt arrived garbled.** ⚠️ **One instruction pair pulls in opposite directions and I
resolved it by obeying the narrower, explicit one — see "The instruction I had to weigh" at the end.**

---

# DECISION 2, PART ONE — ✅ CONFIRMED. A Ready-on/Payment-on DEVICE RENDERS THE WINDOW BRANCH, WHICH HANDLES `'ready'`.

**The chain, quoted. With `viewMode` restored to `boardMode`:**

```tsx
  const handoverOn = handoverPref ?? !showPaidStep
  const readyOn = readyPref ?? !handoverOn
```
```tsx
  const hidePayments = !handoverOn
```
```tsx
  const boardMode: KdsView = handoverOn ? 'window' : 'cook'
```

🔴 **THE COUPLING THAT MAKES THE CONFIRMATION EXACT: `boardMode === 'window'` ⟺ `handoverOn` ⟺
`!hidePayments`.** Payment/Collected ON ⇒ `handoverOn` ⇒ `boardMode === 'window'` ⇒ `viewMode ===
'window'`.

**READ — `renderButtons`, the first gate, and why it is NOT entered:**

```tsx
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
```

✅ **`viewMode` is `'window'`, and `hidePayments` is false because `handoverOn` is true — so BOTH
disjuncts are false and the cook branch is skipped.** 🔴 **With the coupling restored, the second
disjunct `viewMode === 'window' && hidePayments` becomes STRUCTURALLY UNREACHABLE: it requires
`handoverOn` and `!handoverOn` at once.**

**READ — the window branch, and `readyStepOn` is true because Ready is on:**

```tsx
    if (viewMode === 'window') {
```
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
```

# ✅ `'ready'` → `completionBtn()`. DEFECT B IS RESOLVED BY DECISION 1, WITH NO EDIT TO THE COOK BRANCH.

⚠️ **ONE CALL-SITE CONSEQUENCE, NOTED BUT NOT MADE: `readyStepOn` is a LIFECYCLE prop and currently
reads the display control — READ, `kds/page.tsx:1788`:**

```tsx
                readyStepOn={cardViewMode === 'window' && readyOn && handoverOn}
```

🔴 **Decision 1 requires this to become `boardMode === 'window' && …` at the same time as
`viewMode`.** **Leaving it on `cardViewMode` would move the fix from one prop to another.** *(Not
edited — the build did not run.)*

---

# DECISION 2, PART TWO — 🔴 THE SURVIVING CONFIGURATION

# 🔴 N1 — COOK BRANCH + STATUS `'ready'`, DURING THE UNRECONCILED WINDOW AFTER A COLD KILL.

**All four conditions, each quoted from the code that produces it:**

| # | Condition | Quoted source |
|---|---|---|
| 1 | `boardMode === 'cook'` ⇒ `viewMode === 'cook'` | `const boardMode: KdsView = handoverOn ? 'window' : 'cook'` |
| 2 | …which needs `handoverOn === false`, and with **no stored preference** that means a `show_paid_step`-TRUE truck | `const handoverOn = handoverPref ?? !showPaidStep` |
| 3 | 🔴 **the board nonetheless KEEPS `'ready'`** | `const boardKeepsReady = handoverOn \|\| (handoverPref === null && !prefsReconciled)` |
| 4 | …and feeds `activeOrders`, not `cookOrders`, to the cook board | `const displayOrders = (boardMode === 'cook' ? (boardKeepsReady ? activeOrders : cookOrders) : windowOrders)` |

**READ — and the file's own comment describes this exact path, in these words:**

```
  // 🔴 THE GUARD NOW HAS TO COVER THE COOK PATH TOO, AND THIS IS THE ONE PLACE THE DERIVATION MOVED A
  // BOARD DECISION. `activeView` used to be independent of the switches, so an unreconciled device
  // always took `windowOrders` and got `boardKeepsReady` for free. With the view derived, an
  // unreconciled device on a show_paid_step-TRUE truck resolves to 'cook' and would take `cookOrders`,
  // which has no guard — dropping every 'ready' order for the frames before Preferences lands. The
  // guard is UNCHANGED (H7); it is applied on both paths rather than one.
```

**READ — where such a card then lands:**

```tsx
      if (order.status === 'cooking') {
        return (
          <>
            <span className="flex-1 text-amber-700 font-bold text-sm flex items-center">🔥 Cooking…</span>
            <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
          </>
        )
      }
      return null
    }
```

🔴 **`'ready'` matches neither inner test. `return null`. A buttonless card, on the board, exactly as you
observed — only now for the frames before the Preferences read resolves rather than permanently.**

⚠️ **BOTH LIVE TRUCKS SATISFY CONDITION 2: `pizzeria-gusto` and `tikka-tonic` both have
`show_paid_step` TRUE, which you supplied earlier in this session and which I did not re-query.** ⚠️ **The
guard exists precisely because a WKWebView cold kill mid-service is the scenario it was written for — so
this is not a theoretical frame, it is the frame someone is looking at after the app is killed during a
service.**

## 🔴 IS N1 NEW? NO. IS IT WIDENED? NO — IT IS NARROWED, SHARPLY.

**BEFORE (today, `viewMode = cardMode = cardModePref ?? boardMode`):**

| Path to a buttonless `'ready'` card | Reachable how? |
|---|---|
| 🔴 **display set to Cook while handover is ON** | **PERMANENT.** `boardMode === 'window'` keeps `'ready'` on the board via `windowOrders`, while `cardMode === 'cook'` sends the card into the cook branch. **A persistent localStorage choice. This is the defect you observed.** |
| N1, the unreconciled transient | also present — `cardModePref` is null there too, so `cardMode` falls to `boardMode === 'cook'` |

**AFTER (Decision 1, `viewMode = boardMode`):**

| Path | Reachable how? |
|---|---|
| display set to Cook while handover is ON | ✅ **GONE.** `viewMode` no longer follows the display control at all |
| N1, the unreconciled transient | 🔴 **survives, unchanged** |

# ✅ SO: ONE OF TWO PATHS IS ELIMINATED; THE OTHER IS UNTOUCHED. THE CHANGE NARROWS, AND WIDENS NOTHING.

## ✅ AND THE KNOWN `'cooking'` FALL-THROUGH IS NARROWED TOO — TO UNREACHABLE

**You exempted it from scope; here is its status anyway, because you asked whether this change moves
it.** **READ — the arm it falls out of:**

```tsx
      if (!kdsMode) {
        if (['confirmed', 'modified'].includes(order.status)) {
          return completionBtn()
        }
        if (order.status === 'ready') {
          return completionBtn()
        }
      } else {
```

**Its configuration is: window branch, `readyStepOn` false, `kdsMode` false, status `'cooking'`.**

🔴 **THAT CONFIGURATION CANNOT PRODUCE A `'cooking'` ORDER. It requires `kdsMode === false`, and
`kdsMode` is what gates the ONLY control that writes the status** — READ:

```tsx
        return kdsMode ? (
          <>
            <Btn label="Start cooking" colour="amber" loading={isLoading('cooking')} onClick={() => onAction('cooking', order.order_key)} />
```

✅ **`kds_mode` is per-TRUCK, so a truck with it false has no Start cooking button on any screen and no
order of that truck can reach `'cooking'`.** ✅ **The fall-through is real in the code and unreachable in
practice, and this change does not move it either way** — except that killing the
`viewMode === 'window' && hidePayments` disjunct removes one route INTO the cook branch entirely.

## The complete post-change reachability table

| viewMode | switches | status | Result |
|---|---|---|---|
| cook | handover OFF | `pending` | Confirm / Reject ✅ |
| cook | handover OFF | `confirmed` / `modified` | **Ready** (or Start cooking + Ready if `kds_mode`) ✅ |
| cook | handover OFF | `cooking` | 🔥 Cooking… + Ready ✅ |
| **cook** | **handover OFF** | **`ready`** | 🔴 **`return null`** — on the board only via N1 |
| window | handover ON, Ready ON | any active status | ✅ every status covered |
| window | handover ON, Ready OFF, `kds_mode` false | `cooking` | 🔴 `return null` — **the exempted one, and unproducible** |
| window | handover ON, Ready OFF, `kds_mode` true | any active status | ✅ Waiting / 🔥 pill / completion |

---

# WHAT I DID NOT DO — DECISIONS 1, 3, 4, 5, 6

**All five are unblocked by analysis and blocked only by the Decision-2 stop. Each is recorded here so
the next run is mechanical, and NONE of it was written to any file.**

| Decision | Status | What it needs |
|---|---|---|
| **1** | ready | `viewMode={boardMode}` and `readyStepOn={boardMode === 'window' && readyOn && handoverOn}` at `kds/page.tsx:1767` and `:1788`; a new `hideAmounts` prop fed from `cardViewMode === 'cook'` |
| **3** | ready | split line 1138: keep the arm selection on `viewMode`, gate the four `£` spans inside the Full arm on `hideAmounts` |
| **4** | ✅ **re-confirmed just now** | `showPrices` still has **zero consumers** — the scan below |
| **5** | ready | gate the two `£{Number(order.total).toFixed(2)}` spans on `hideAmounts` |
| **6** | ⚠️ **needs your answer** | the `REFUNDED` question you asked me to state — below |

## DECISION 4 — the deletion is still safe. Confirmed immediately before writing this line.

**EXECUTED — the complete scan result for `showPrices` in `OrderCard.tsx`:**

```
623   // ⚠️ NOT IN COOK MODE, AND NOT WHEN `hidePayments`. Cook shows no prices at all (`showPrices` is
752   const showPrices = viewMode !== 'cook'
```

✅ **One declaration and one COMMENT. Zero reads. The deletion remains a no-op on behaviour, and the
stale clause at `:623` should go with it.**

## DECISION 5 — what "prove it" will require, and why solo is safe

**READ — the two spans, in the two headers that print a total:**

```tsx
                  <span className="font-bold text-base">£{Number(order.total).toFixed(2)}</span>
```
```tsx
                <span className="font-bold text-sm flex-shrink-0">£{Number(order.total).toFixed(2)}</span>
```

✅ **The dashboard is safe by construction, and the proof is one line — READ, `OrderCard.tsx:93`:**

```tsx
  viewMode = 'solo',
```

⚠️ **`hideAmounts` will default to `false`, and the dashboard passes no such prop, so the solo span's
guard is a constant-false test and its output is character-identical.** **That is an argument, not an
observation, and it is marked as such in the verification table.**

## DECISION 6 — 🔴 THE ONE QUESTION I WILL NOT ANSWER FOR YOU

**READ — the chain, and the split runs down the middle of it:**

```tsx
  const paidChipStatic = hidePayments ? null
    : balance.status === 'refunded' ? <span title="Refunded in full. Nothing to collect." className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 flex-shrink-0 whitespace-nowrap">REFUNDED</span>
    : balance.status === 'part_refunded' ? <span title="Charged in full, then partly refunded. Nothing to collect." className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 flex-shrink-0 whitespace-nowrap">{money(balance.balanceMinor)} REFUNDED</span>
    : effectivePaid ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">PAID</span>
    : heldAuthorisation ? <span title="Card authorised — do not collect. Payment is taken when you confirm." className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 flex-shrink-0 whitespace-nowrap">CARD HELD</span>
    : null
```

**Your rule assigns three of the four arms and leaves one open:**

| Arm | Carries an amount? | Your rule |
|---|---|---|
| `REFUNDED` *(full refund)* | ✗ | ⚠️ **UNSTATED** |
| `{money(…)} REFUNDED` *(part refund)* | 🔴 **YES** | 🔴 **HIDDEN** |
| `PAID` | ✗ | ✅ **UNCHANGED** |
| `CARD HELD` | ✗ | ✅ **UNCHANGED** |

**You asked me to "state what `REFUNDED` without an amount should render as, or hide it entirely in
Cook, and say which you chose and why." Here is the statement; the choice is where I stop.**

🔴 **THE TWO OPTIONS ARE NOT SYMMETRICAL, AND THE ASYMMETRY IS THE WHOLE POINT:**

- **Render the part-refund arm as a bare `REFUNDED` in Cook.** ✅ Consistent with `PAID` and `CARD HELD`
  — a state, no amount. 🔴 **BUT IT MAKES TWO DIFFERENT LEDGER POSITIONS RENDER IDENTICALLY:** a fully
  refunded order and a partly refunded one would both read `REFUNDED` on a Cook card, and the second
  still has money outstanding. **This card is already the one surface that says so.**
- **Hide the part-refund arm entirely in Cook.** ✅ No amount, no ambiguity. 🔴 **BUT AN ORDER WITH A
  REFUND AGAINST IT THEN LOOKS EXACTLY LIKE AN ORDINARY UNPAID ONE**, because the chain's fall-through
  is `null` — and the arms below it (`PAID`, `CARD HELD`) do not run once `part_refunded` has matched.

⚠️ **A third shape exists and you did not name it: keep the arm, drop only the `{money(…)}` prefix, and
change the WORD — e.g. `PART REFUNDED` — so the state is distinguishable without an amount.** **I am
recording it because your rule says "every payment chip carrying an AMOUNT" is hidden, and this option
satisfies that literally while losing nothing an operator needs.** **RECOMMENDING NOTHING.**

---

# 🔴 VERIFICATION

**Nothing was built, so nothing could be verified. `tsc` was not run because no file was written.**

| Item from your list | Method |
|---|---|
| in Cook, `confirmed` shows the same buttons as Full | ⚠️ **NOT APPLICABLE — NOT BUILT** |
| in Cook, `ready` shows the completion control | ⚠️ **NOT APPLICABLE — NOT BUILT** |
| in Cook, no monetary amount renders | ⚠️ **NOT APPLICABLE — NOT BUILT** |
| in Cook, `PAID` and `CARD HELD` still render | ⚠️ **NOT APPLICABLE — NOT BUILT** |
| in Cook, the kitchen item rendering is kept | ⚠️ **NOT APPLICABLE — NOT BUILT** |
| Full/Cook changes no button, board or dimension | ⚠️ **NOT APPLICABLE — NOT BUILT** |
| the dashboard renders identically | ⚠️ **NOT APPLICABLE — NOT BUILT** |
| the payment overlay still renders on a queued `mark_paid` | ⚠️ **NOT APPLICABLE — NOT BUILT.** ✅ It is also untouched: no file this task could have edited contains it |

**What WAS established, and how:**

| Claim | Method |
|---|---|
| `showPrices` has zero consumers | ✅ **EXECUTED** — scan re-run for Decision 4 |
| The switch/board derivation chain as quoted | ✅ **EXECUTED** — every line read at its declaration |
| `viewMode={cardViewMode}` and `readyStepOn={cardViewMode …}` are the two lifecycle call sites | ✅ **EXECUTED** — scan of the call site |
| **N1 is reachable** | 🔴 **SOURCE READ ONLY** — composed from four quoted conditions. **No device was cold-killed; no frame was observed** |
| **N1 is pre-existing and not widened** | 🔴 **SOURCE READ ONLY** — reasoned from `cardModePref ?? boardMode` falling to `boardMode` when unset |
| **The `'cooking'` fall-through is unproducible at `kds_mode` false** | 🔴 **SOURCE READ ONLY** — from the `kdsMode ?` gate on Start cooking |
| **`show_paid_step` is TRUE on both live trucks** | ⚠️ **NEITHER — TAKEN FROM YOU** earlier this session; **not re-queried, no SQL was run** |
| **Solo would be character-identical after Decision 5** | 🔴 **SOURCE READ ONLY, AND PREDICTIVE** — it describes code that does not exist yet |
| Nothing was changed | ✅ **EXECUTED** — byte counts, census, `git status --porcelain` |

🔴 **NOT ONE RENDERING CLAIM IN THIS REPORT WAS BEHAVIOUR-VERIFIED. No browser, no device, no KDS was
opened.**

---

# INTEGRITY

## Non-ASCII class census — the two files read

# ✅ 31 CLASSES BEFORE, 31 AFTER (`OrderCard.tsx`). 33 BEFORE, 33 AFTER (the KDS). EVERY COUNT IDENTICAL — NEITHER FILE WAS WRITTEN.

### `components/dashboard/OrderCard.tsx` — 90,137 bytes before and after

| Class | BEFORE | AFTER | Δ |
|---|---|---|---|
| U+2500 · U+2014 · U+1F534 · U+26A0 · U+FE0F | 1278 / 153 / 47 / 47 / 45 | identical | **0** |
| U+00A3 · U+2192 · U+2713 · U+2022 · U+2026 | 23 / 22 / 9 / 8 / 7 | identical | **0** |
| U+00A7 · U+21D2 · U+23F3 · U+00D7 · U+270F · U+00B7 · U+1F525 · U+2709 · U+1F4DD | 6 / 5 / 5 / 4 / 4 / 4 / 4 / 4 / 4 | identical | **0** |
| U+1F4B7 · U+1F4B3 · U+21A9 · U+2705 · U+1F514 | 2 each | identical | **0** |
| U+2264 · U+2265 · U+2717 · U+1F355 · U+1F4F1 · U+1F381 · U+2715 | 1 each | identical | **0** |

### `app/dashboard/[token]/kds/page.tsx` — 137,629 bytes before and after

**33 classes, every count identical. Unchanged since the post-gate parity task.**

## 🔴 The 2 pre-existing bare `U+26A0` in `OrderCard.tsx`

| Base | BEFORE n / paired / bare | AFTER n / paired / bare |
|---|---|---|
| U+26A0 | 47 / 45 / **2** | 47 / 45 / **2** |

# ✅ UNCHANGED — STILL EXACTLY 2, AND THE SAME TWO.

**They are `⚠ PAYMENT NOT RECORDED — check before releasing` and `⚠ Last update didn't sync`. The file
was not written, so there was no opportunity to disturb them.** ⚠️ **The KDS still carries ZERO bare
`U+26A0` (64 of 64 paired), unchanged from the post-gate extraction.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. The report scanned in a SEPARATE pass AFTER it was written. It is the
only file this task wrote.**

```
  components/dashboard/OrderCard.tsx                     90,137  offending=0  CR=0   (unchanged)
  app/dashboard/[token]/kds/page.tsx                    137,629  offending=0  CR=0   (unchanged)
  docs/kds-cook-split-build-report.md   (SEPARATE PASS)   24,154  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 40 | 0 | 40 |
| U+1F534 LARGE RED CIRCLE | 36 | 0 | 36 |
| **U+26A0 WARNING SIGN** | **26** | **24** | 🔴 **2** |
| U+1F525 FIRE | 5 | 0 | 5 |
| U+2717 BALLOT X | 3 | 0 | 3 |

# 🔴 TWO BARE U+26A0, BOTH ON ONE LINE, BOTH VERBATIM QUOTES.

**Every warning sign I wrote as prose is paired — 24 of 24. The two bare ones are both on the single
line that NAMES `OrderCard.tsx`'s two pre-existing bare glyphs, quoted in the form the source writes
them.** ✅ **EXECUTED — `OrderCard.tsx` measures `U+26A0 n=47 paired=45 bare=2`, and its two bare glyphs
are exactly those two strings.** ⚠️ **Pairing them here would have misquoted the very count this report
certifies as unchanged.**

✅ **The report's total `U+FE0F` count is 24, which exactly accounts for the 24 paired warning signs and
leaves none attached to any other base.** ✅ **The four unpaired bases are internally consistent — 0 of
40, 0 of 36, 0 of 5, 0 of 3 — so no base is split across two renderings.** ⚠️ **`U+1F525` FIRE is bare
five times by necessity: every one is inside a verbatim quote of a `🔥 Cooking…` span, which the
source writes bare.

## `git status --porcelain`

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
 M lib/settings-copy.ts
?? components/shared/CuisinePicker.tsx
?? components/shared/EventActionsModal.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/extend-removal-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-cook-display-split-report.md
?? docs/kds-cook-split-build-report.md
?? docs/kds-event-bar-fix-report.md
?? docs/kds-event-bar-report.md
?? docs/kds-exit-point-report.md
?? docs/kds-pill-audit-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-status-badge-report.md
?? docs/kds-step-switches-report.md
?? docs/kds-steps-model-report.md
?? docs/kds-toggles-review-report.md
?? docs/kds-two-switches-build-report.md
?? docs/kds-two-switches-report.md
?? docs/kds-view-removal-report.md
?? docs/offline-outbox-parity-report.md
?? docs/post-gate-parity-report.md
?? docs/settings-copy-report.md
?? lib/event-display.ts
?? lib/native/useGatedActionResult.tsx
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/kds-cook-split-build-report.md`** | 🔴 **THIS TASK — the ONLY new entry, and the only file written** |
| `M components/dashboard/OrderCard.tsx` | ✅ **PRE-EXISTING — the step switches. 🔴 NOT touched this task** |
| `M app/dashboard/[token]/kds/page.tsx` | ✅ pre-existing — eleven earlier tasks. 🔴 **NOT touched this task** |
| `M app/dashboard/[token]/page.tsx` | ✅ pre-existing — the post-gate extraction and the settings-copy edits |
| `?? lib/native/useGatedActionResult.tsx` | ✅ pre-existing — the post-gate extraction |
| `?? docs/kds-cook-display-split-report.md` | ✅ pre-existing — **last task, the Stage 1 this one continues** |
| `M app/manage/[token]/page.tsx` · `M components/DemoGetStarted.tsx` · `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/dashboard/AddOrderPanel.tsx` · `?? lib/event-display.ts` | ✅ pre-existing — the display extractions |
| `M lib/settings-copy.ts` · `M docs/reference-manual.md` | ✅ pre-existing |
| `?? components/shared/EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/*.md` (seventeen earlier reports) | ✅ pre-existing |

---

# ⚠️ THE INSTRUCTION I HAD TO WEIGH, STATED PLAINLY

**Your title says PROCEED and gives six decisions. Decision 2 says: *"If one can, name it and STOP
rather than papering over it."* One can. Those two pull in opposite directions, and I obeyed the
narrower, explicit one.**

**My reasoning, so you can overrule it in one line:** the only way to satisfy both would be to build
Decisions 1 and 3–6 while a buttonless-card path survives — and the single most likely way to "fix" it
in passing is to add a `'ready'` case to the cook branch, which is precisely the papering-over you
forbade. ⚠️ **I also did not want to hand you a build whose acceptance test — *"in Cook, both switches
on, an order at `ready` shows the completion control"* — passes, while a different, unlisted
configuration still shows nothing.**

## 🔴 WHAT I NEED FROM YOU — TWO ANSWERS, AND STAGE 2 RUNS IN FULL

1. **N1.** Either **(a)** accept it as out of scope like the `'cooking'` fall-through — it is
   pre-existing, transient, and narrowed rather than widened by this change — and I build Decisions 1
   and 3–6 as briefed; or **(b)** name the fix you want and I build that too. ⚠️ **I have not chosen,
   and I have not touched `boardKeepsReady`, which is on your untouchable list either way.**
2. **Decision 6's `REFUNDED` arm** — bare `REFUNDED`, hidden entirely, or the reworded `PART REFUNDED`
   third option above.

**Everything else is settled and mechanical. Answer those two and the build is one pass.**
