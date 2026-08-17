# KDS status badge — Stage 2. Built.

**One file changed: `components/dashboard/OrderCard.tsx`.** `npx tsc --noEmit` passes with no output —
**which is not verification.**

**No commit, no stage, no revert, no stash, no clean.** No build, no `next dev`, no `next build`, no
`cap sync`, no deploy, no SQL, no migration, nothing under `app/api`. **Neither Stage 1 report was
overwritten** — `docs/kds-status-badge-report.md` and `docs/kds-cook-split-build-report-2.md` are both
untouched on disk.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

## ✅ THE STOP CONDITION WAS RE-CHECKED AGAINST THE POST-COOK-SPLIT FILE, AND IS NOT MET

**You said to STOP and quote it if any comment records a deliberate decision to keep the cook header
free of STATUS indicators as well as money. ✅ THERE IS NONE — and the cook split actually strengthened
the case. EXECUTED: every "not in cook" comment in the file today.**

**The only one is money — READ:**

```
  // ⚠️ NOT IN COOK MODE, NOT WHEN `hidePayments`, AND NOT WHEN `hideAmounts`. Cook's header carries no
  // payment chip today; adding a money line would put money on the one screen deliberately without it.
```

🔴 **AND THE COOK SPLIT ADDED A COMMENT THAT ARGUES FOR THIS TASK — READ, the `hideAmounts` prop doc
written last task:**

```
   *  ⚠️ `PAID` AND `CARD HELD` SURVIVE IN COOK, DELIBERATELY. They are STATES, not amounts, and they
   *  tell the operator whether to take money — which is exactly the question a hatch is asking.
```

✅ **A status badge is the same kind of thing: a STATE, not an amount. The file already draws that line
and already places non-money indicators — `buzzerChip`, the late pill — in all three headers.**

---

# THE BUILD — COMPUTED ONCE, PLACED THREE TIMES

## 🔴 THE POINT OF THE TASK, AND THE PROOF IT WAS HONOURED

```
$ occurrences of the badge's <span …${s.bg} ${s.text}…>{s.label}</span>   →  1
$ occurrences of `s.label`                                               →  1
```

✅ **EXECUTED. The markup exists exactly ONCE in the file. No JSX was copied into a second or third
header — the two KDS headers place a value, exactly as they already place `paidChip`.**

## The value — READ, in full

```tsx
  // ── THE STATUS BADGE — COMPUTED ONCE, PLACED THREE TIMES ────────────────────────────────────────
  // 🔴 THIS IS `paidChipStatic`'s PATTERN, AND REPRODUCING IT IS THE POINT OF THE CHANGE. The paid chip
  // survived into both KDS headers because it is computed once here and PLACED by each header that
  // wants it. The status badge did not, because it was written INLINE inside the `viewMode === 'solo'`
  // branch — so the KDS, which never renders 'solo', silently had no badge at all, in every value it
  // can take: Modified, Cooking, Ready, Collected, Rejected, Cancelled. That was an absence, not a
  // gate; no comment anywhere recorded a decision to omit it.
  //
  // ⚠️ IT SITS HERE RATHER THAN BESIDE `paidChipStatic` FOR ONE REASON: it needs `s`, and `s` is
  // declared on the line above. Moving `s` up to reach the chip would be a change nobody asked for.
  // Same SHAPE, same "computed outside every branch" property — one expression, three placements.
  //
  // ⚠️ NOT MONEY, SO `hideAmounts` DOES NOT GATE IT. A status is not an amount. It renders in Cook
  // exactly as `PAID` and `CARD HELD` do, and for the same reason: it tells the operator what the order
  // is doing. The only "not in cook" rule in this file is about money.
  const statusBadgeStatic = !['confirmed', 'pending'].includes(order.status) ? (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>{s.label}</span>
  ) : null
```

⚠️ **ONE DEVIATION FROM "the same place as `paidChipStatic`", DECLARED: it is ~200 lines below the chip,
immediately after `const s = STATUS[order.status] || STATUS.pending`, because the badge READS `s` and
`paidChipStatic` is declared before `s` exists. Hoisting `s` would have been an unrequested change to a
line this task has no business touching. The SHAPE — a const holding markup-or-null, outside every
branch — is identical, and that is the property that makes the pattern work.**

## The `'cooking'` suppression, with the comment you specified

```tsx
  // ── 🔴 THE KDS SUPPRESSES ONE VALUE, AND `Cooking` IS NOT A REDUNDANT LABEL — READ BEFORE "FIXING" ──
  // The two elements are not two labels for one thing. `🔥 Cooking…` sits in the ACTION ROW, where it
  // stands in for a button the operator cannot press yet; the badge is a HEADER LABEL. On the DASHBOARD
  // nothing else states the cooking state, so the badge carries it and still does. On the KDS the action
  // row already says it — and in the `kds_mode`-true window case it says it in the SAME PILL CLASSES
  // (`text-xs font-bold px-2 rounded-full bg-amber-100 text-amber-700`, differing only in py-1 vs
  // py-0.5), a card's height apart, with no collapse between them. Two identical amber pills reading
  // the same word is what this suppression exists to prevent.
  // 🔴 IT IS A DELIBERATE PER-SURFACE DIVERGENCE. This comment is here so the next reader does not
  // "restore" the missing value and re-create the duplicate.
  // ⚠️ LATENT, NOT OBSERVABLE, TODAY: `kds_mode` is false on all thirteen trucks and gates the only
  // Start cooking button, so nothing can currently reach status 'cooking'. That is why this costs
  // nothing now and why it must be written down rather than discovered later.
  const statusBadgeKds = order.status === 'cooking' ? null : statusBadgeStatic
```

✅ **`🔥 Cooking…` was not touched. EXECUTED — all four of its occurrences are unchanged in the diff.**

---

# 🔴 SOLO — BEFORE AND AFTER, AND THE PROOF THEY ARE EQUIVALENT

**BEFORE:**

```tsx
                {!['confirmed', 'pending'].includes(order.status) && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>{s.label}</span>
                )}
```

**AFTER:**

```tsx
                {statusBadgeStatic}
```

**where `statusBadgeStatic` is the const quoted above.**

## The equivalence, in three steps

| | BEFORE | AFTER |
|---|---|---|
| **The condition** | `!['confirmed', 'pending'].includes(order.status)` | 🔴 **the identical expression, character for character** — it moved, it was not rewritten |
| **The element when true** | that `<span>` | 🔴 **that same `<span>`** — same className template, same single expression child `{s.label}`, same `s` |
| **The value when false** | `false` *(the `&&` short-circuit)* | `null` |

# ✅ `false` AND `null` ARE BOTH SKIPPED BY REACT. THE RENDERED OUTPUT IS IDENTICAL IN BOTH CASES.

🔴 **THE PRECEDENT YOU NAMED WAS OBEYED, AND IT IS WHY THE SPAN IS NOT REWRITTEN.** Last task I rejected
my own first version of the line-price gate because collapsing `£{expr}` into a template literal changed
solo's text-node structure while matching the rendered text. **The same trap exists here: rewriting the
child as `` `${s.label}` `` or wrapping the span would change the element tree. It is the ORIGINAL SPAN,
lifted verbatim, with the same one expression child.** ✅ **No text-node structure changed; the `<span>`
has exactly one child before and after.**

⚠️ **The only other solo-visible edit is the comment above the placement, which gained three lines.
Comments render nothing.**

# ✅ NO SOLO OUTPUT DIFFERS. NO STOP CONDITION MET.

---

# THE TWO KDS PLACEMENTS

## Window header — row 1's indicator cluster

```tsx
                <div className="flex items-baseline gap-1.5 flex-shrink-0">
                  {/* The status badge — FIRST in this cluster, mirroring solo, where it precedes the
                      price and the paid chip. This is the row that already carries the small
                      indicators (paidChip, ✓) and is already flex-shrink-0, which the badge is sized
                      for. `Cooking` is suppressed here — see statusBadgeKds. */}
                  {statusBadgeKds}
                  {/* 🔴 THIS IS THE ONE THAT MATTERS. With `viewMode` back on `boardMode`, a HANDOVER
                      device renders this header even when its display is set to Cook — so without this
                      guard the order total would print on a Cook card, which is the first thing Cook
                      exists to remove. */}
                  {!hideAmounts && <span className="font-bold text-base">£{Number(order.total).toFixed(2)}</span>}
                  {paidChip}
                  {allStruck && <span className="font-black text-xs opacity-70">✓</span>}
                </div>
```

⚠️ **PLACED FIRST IN THE CLUSTER, WHICH IS THE SOLO ORDER.** Solo reads name → **badge** → price →
paidChip; window row 1 now reads **badge** → total → paidChip → ✓. **Status precedes money on both
surfaces.** ✅ **This is the position Stage 1's Q2 identified — the cluster where `paidChip` already
survives, already `flex-shrink-0`.**

## Cook header — row 1, beside the buzzer chip and the late pill

```tsx
            {/* Buzzer chip — row 1, beside the order number. See the buzzerChip note. */}
            {buzzerChip}
            {/* The status badge — the same row that already carries the buzzer chip and the late pill,
                which is this header's small-indicator row. It sits before the ml-auto time group, so
                that group stays hard right and nothing below row 1 moves. `Cooking` is suppressed here
                — see statusBadgeKds. ⚠️ A STATUS IS NOT AN AMOUNT: this renders in Cook, where no
                monetary element does. */}
            {statusBadgeKds}
            <span className="text-xs text-slate-600 flex-shrink-0 inline-flex items-center gap-1 ml-auto">
```

⚠️ **BEFORE the `ml-auto` time group, deliberately.** That group pushes itself right regardless, so the
badge joins the left identity cluster and **row 2 (`nameEl` + `✓`) does not move at all.** ✅ **The
file's own buzzer-chip note already argued this row has the slack: *"cook is #order + time only"*.**

## What renders where, after this change

| Status | Solo | KDS Full (window) | KDS Cook |
|---|---|---|---|
| `pending` · `confirmed` | ✗ | ✗ | ✗ |
| `modified` | ✅ `Modified` | ✅ **NEW** | ✅ **NEW** |
| **`cooking`** | ✅ `Cooking` | 🔴 **suppressed** | 🔴 **suppressed** |
| `ready` | ✅ `Ready` | ✅ **NEW** | ✅ **NEW** |
| `collected` | ✅ | ⚠️ n/a — `activeOrders` drops it from every KDS board |
| `rejected` · `cancelled` | ✅ | ⚠️ n/a — same |

---

# WHAT WAS NOT TOUCHED

**EXECUTED — each verified by scan or by absence from the diff:**

- ✅ **`🔥 Cooking…` (4 occurrences), `⏳ Waiting`, the late pill, `buzzerChip`, the `✓` all-struck mark,
  the conflict markers, `Syncing…`** — unchanged.
- ✅ **`paidChipStatic` and its new part-refund split, every money element.**
- ✅ **`hideAmounts` — still exactly TEN code occurrences, all ten money.** The badge is gated by
  neither `hideAmounts` nor any money predicate.
- ✅ **`renderButtons`, `completionBtn`, `completionBtnDisabled`** — absent from the diff.
- ✅ **The line-1138 item rendering, the board filters, `boardMode`, `boardKeepsReady`, the two
  switches, the Full/Cook control, `lib/native/useGatedActionResult.tsx`, the `pendingPayment` prop** —
  all in other files or other regions; none appears in this task's diff.
- ✅ **The unreachable `viewMode === 'window' && hidePayments` disjunct is exactly as it was.**

---

# 🔴 VERIFICATION

**`tsc --noEmit` passes with no output. THAT IS NOT VERIFICATION and is not counted.**

| Item | Method |
|---|---|
| **`'modified'` shows the badge on solo, KDS Full and KDS Cook** | 🔴 **SOURCE READ ONLY.** `'modified'` is in neither exclusion list, so `statusBadgeStatic` is non-null and `statusBadgeKds` returns it; all three headers place one of the two. **No card was rendered** |
| **`'ready'` shows the badge on a Payment/Collected-ON device** | 🔴 **SOURCE READ ONLY.** Payment ON ⇒ `handoverOn` ⇒ `boardMode === 'window'` ⇒ the window header, which now places `statusBadgeKds`; `'ready'` is excluded by neither rule. **Not observed** |
| **`'cooking'` shows `🔥 Cooking…` and NO badge on both KDS headers, and the badge on solo** | 🔴 **SOURCE READ ONLY** — from `statusBadgeKds`'s single test and from solo placing `statusBadgeStatic`. ⚠️ **AND UNOBSERVABLE IN PRINCIPLE TODAY: `kds_mode` is false on all thirteen trucks, so no order can reach `'cooking'`. This branch cannot be exercised on a real device until that column changes** |
| **`'confirmed'` and `'pending'` show no badge anywhere** | 🔴 **SOURCE READ ONLY** — one shared condition, unchanged, and both KDS placements read through it |
| **Solo renders identically to before** | 🔴 **SOURCE READ ONLY.** The three-step equivalence above is an ARGUMENT — identical condition, identical span, `false`/`null` both skipped. ✅ **The "markup exists once" and "one `s.label`" facts are EXECUTED.** 🔴 **NO BROWSER WAS OPENED ON GUSTO'S DASHBOARD** |
| **The badge renders in Cook while no monetary amount does** | 🔴 **SOURCE READ ONLY** — the badge is in no `hideAmounts` expression (scan) and every amount is (last task's scan). **Not observed together on a screen** |
| The badge markup exists exactly once | ✅ **EXECUTED** — `1` occurrence of the span, `1` of `s.label` |
| `hideAmounts` still has ten code occurrences, none on the badge | ✅ **EXECUTED** |
| No comment keeps cook free of status indicators | ✅ **EXECUTED** — scans for `cook` beside `no`/`never`/`omit`/`without`/`deliberat`/`not in`; every hit read |
| Census, byte scan, bare `U+26A0` | ✅ **EXECUTED** |

🔴 **NOT ONE RENDERING CLAIM WAS BEHAVIOUR-VERIFIED. No browser, no device, no KDS was opened.**

---

# INTEGRITY

## Non-ASCII class census — `components/dashboard/OrderCard.tsx`

# ✅ 31 CLASSES BEFORE, 31 AFTER. NO CLASS GAINED OR LOST.

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 1372 | 1418 | +46 | comment banners |
| U+2014 EM DASH | 168 | 178 | +10 | comment prose |
| **U+26A0 WARNING SIGN** | 54 | 59 | **+5** | five new caveats — **all paired** |
| **U+FE0F** | 52 | 57 | **+5** | ✅ **matches the U+26A0 delta exactly** |
| U+1F534 LARGE RED CIRCLE | 54 | 57 | +3 | comment prose |
| U+2026 HORIZONTAL ELLIPSIS | 7 | 8 | +1 | the `🔥 Cooking…` **quoted in the suppression comment** |
| U+1F525 FIRE | 4 | 5 | +1 | ⚠️ **the same quotation — a COMMENT, not a fifth render.** The four rendering sites are unchanged |
| U+2713 CHECK MARK | 10 | 11 | +1 | the `✓` named in the window-placement comment |
| *every other class* | — | — | **0** | |

# 🔴 DID THE BADGE MARKUP NET TO ZERO? YES — EXACTLY ZERO, AND THE CENSUS IS THE PROOF.

⚠️ **The badge's markup contains NO non-ASCII character at all** — `<span className={\`text-xs font-bold
px-2 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}\`}>{s.label}</span>` is pure ASCII, and `s.label`
is a runtime value. **So a MOVE of that markup must show a census delta of ZERO for it, and it does: not
one of the eight non-zero rows above is attributable to the badge.** ✅ **Every delta is comment prose,
and the two glyphs a reader would most suspect — `U+1F525` and `U+2026` — gained exactly one each, both
inside the quotation of `🔥 Cooking…` in the suppression comment you asked for.**

⚠️ **The file grew 3,923 bytes while the code shrank: the inline three-line JSX block became
`{statusBadgeStatic}`, and everything else added is comment.**

## 🔴 The 2 pre-existing bare `U+26A0`

| Base | BEFORE n / paired / bare | AFTER n / paired / bare |
|---|---|---|
| U+26A0 | 54 / 52 / **2** | 59 / 57 / **2** |

# ✅ UNCHANGED — STILL EXACTLY 2, AND THE SAME TWO.

**They are `⚠ PAYMENT NOT RECORDED — check before releasing` and `⚠ Last update didn't sync`, the two
conflict markers. All five warning signs added this task are PAIRED, which is why the total rose by five
and the bare count did not move.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. The report scanned in a SEPARATE pass AFTER writing.**

```
  components/dashboard/OrderCard.tsx                     99,800  offending=0  CR=0   (was 95,877)
  docs/kds-status-badge-stage2-report.md (SEPARATE PASS)  21,263  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 48 | 0 | 48 |
| U+1F534 LARGE RED CIRCLE | 30 | 0 | 30 |
| **U+26A0 WARNING SIGN** | **21** | **19** | 🔴 **2** |
| U+1F525 FIRE | 7 | 0 | 7 |
| U+2713 CHECK MARK | 6 | 0 | 6 |
| U+2717 BALLOT X | 3 | 0 | 3 |
| U+23F3 HOURGLASS WITH FLOWING SAND | 2 | 0 | 2 |

# 🔴 TWO BARE U+26A0, BOTH ON ONE LINE, BOTH VERBATIM QUOTES.

**Every warning sign I wrote as prose is paired — 19 of 19. The two bare ones are both on the single
line that NAMES `OrderCard.tsx`'s two pre-existing bare glyphs, quoted in the form the source writes
them.** ✅ **EXECUTED — `OrderCard.tsx` measures `U+26A0 n=59 paired=57 bare=2` after this task, and its
two bare glyphs are exactly those two strings.** ⚠️ **Pairing them here would have misquoted the very
count this report certifies as unchanged.**

✅ **The report's total `U+FE0F` count is 19, which exactly accounts for the 19 paired warning signs and
leaves none attached to any other base.** ✅ **The six unpaired bases are internally consistent — 0 of
48, 0 of 30, 0 of 7, 0 of 6, 0 of 3, 0 of 2 — so no base is split across two renderings.** ⚠️ **`U+1F525`
and `U+23F3` are bare because every occurrence quotes the card's own `🔥 Cooking…` and
`⏳ Waiting`, which the source writes bare.

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
?? docs/kds-cook-split-build-report-2.md
?? docs/kds-cook-split-build-report.md
?? docs/kds-event-bar-fix-report.md
?? docs/kds-event-bar-report.md
?? docs/kds-exit-point-report.md
?? docs/kds-pill-audit-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-status-badge-report.md
?? docs/kds-status-badge-stage2-report.md
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
| 🔴 **`?? docs/kds-status-badge-stage2-report.md`** | 🔴 **THIS TASK — the only NEW entry** |
| `M components/dashboard/OrderCard.tsx` | ⚠️ **PARTLY** — the step switches and last task's cook split were already there; **this task extracted and placed the badge** |
| `M app/dashboard/[token]/kds/page.tsx` | ✅ pre-existing — twelve earlier tasks. 🔴 **NOT touched this task** |
| `M app/dashboard/[token]/page.tsx` | ✅ pre-existing — the post-gate extraction and the settings-copy edits. 🔴 **NOT touched** |
| `?? lib/native/useGatedActionResult.tsx` | ✅ pre-existing — the post-gate extraction |
| `?? docs/kds-status-badge-report.md` | ✅ pre-existing — **Stage 1 of THIS task, not overwritten** |
| `?? docs/kds-cook-display-split-report.md` · `?? docs/kds-cook-split-build-report.md` · `?? docs/kds-cook-split-build-report-2.md` | ✅ pre-existing — the cook-split trilogy, **none overwritten** |
| `M app/manage/[token]/page.tsx` · `M components/DemoGetStarted.tsx` · `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/dashboard/AddOrderPanel.tsx` · `?? lib/event-display.ts` | ✅ pre-existing — the display extractions |
| `M lib/settings-copy.ts` · `M docs/reference-manual.md` | ✅ pre-existing |
| `?? components/shared/EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/*.md` (nineteen earlier reports) | ✅ pre-existing |

✅ **Eight modified and twenty-three untracked before; eight modified and twenty-four untracked after.
The single delta is this report. Only `OrderCard.tsx` was written among source files, as instructed.**
