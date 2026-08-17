# KDS: the status badge — STAGE 1 ONLY. STOPPED.

# 🔴 STOPPED AT THE Q1 GATE. THEY WOULD BOTH SHOW. NOTHING WAS CHANGED.

**`components/dashboard/OrderCard.tsx` was READ and NOT written.** No file in the repo was written by
this task except this report. **Stage 2 was not started** — no `statusBadge` value was extracted, no
header was edited, nothing was placed.

**No commit, no stage, no revert, no stash, no clean.** No build, no `next dev`, no `next build`, no
`cap sync`, no deploy, no SQL, no migration, nothing under `app/api`.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# Q1 — WOULD THE BADGE AND 🔥 Cooking… BOTH SHOW?

# 🔴 YES. IN FOUR OF THE FIVE KDS CONFIGURATIONS, ON THE SAME CARD, AT THE SAME MOMENT.

## The badge's own condition, and what it produces at `'cooking'`

**READ — the badge, `OrderCard.tsx:1070-1076`:**

```tsx
                {/* Status BADGE (moved here from row 1) — sits between channel/name and price. Same
                    condition as before: shown for modified/cooking/ready (incl. the blue "Ready"),
                    suppressed for the baseline confirmed/pending the section heading already says. This
                    is the status BADGE, NOT the Ready ACTION button (that stays in the bottom row). */}
                {!['confirmed', 'pending'].includes(order.status) && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>{s.label}</span>
                )}
```

**READ — `OrderCard.tsx:734`, the lookup:**

```tsx
  const s         = STATUS[order.status] || STATUS.pending
```

**READ — `components/dashboard/types.ts:280`, the row it resolves to:**

```ts
  cooking:   { label: 'Cooking',   bg: 'bg-amber-100',  text: 'text-amber-700'  },
```

🔴 **`'cooking'` is not in `['confirmed', 'pending']`, so the condition PASSES and the badge renders
the word `Cooking` on an amber pill.**

## Every 🔥 Cooking… in the file — three sites, all in the BUTTON ROW

**READ — site 1, `OrderCard.tsx:856-863`, inside the cook/window-no-money branch:**

```tsx
      if (order.status === 'cooking') {
        return (
          <>
            <span className="flex-1 text-amber-700 font-bold text-sm flex items-center">🔥 Cooking…</span>
            <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
          </>
        )
      }
```

**Its gate — READ, `OrderCard.tsx:842`:**

```tsx
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
```

**READ — site 2, `OrderCard.tsx:889-896`, inside `if (viewMode === 'window')` → `if (readyStepOn)`:**

```tsx
        if (order.status === 'cooking') {
          return (
            <>
              <span className="flex-1 text-amber-700 font-bold text-sm flex items-center">🔥 Cooking…</span>
              <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
            </>
          )
        }
```

**READ — site 3, `OrderCard.tsx:918-925`, the window branch's `else` (the cooking gate, `kdsMode`):**

```tsx
        if (order.status === 'cooking') {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">🔥 Cooking…</span>
              {completionBtnDisabled()}
            </>
          )
        }
```

# 🔴 SITE 3 IS THE ONE THAT SHOULD DECIDE THIS. IT IS ALREADY THE SAME PILL.

| | The badge, if placed | Site 3, already there |
|---|---|---|
| classes | `text-xs font-bold px-2 **py-0.5** rounded-full flex-shrink-0 **bg-amber-100 text-amber-700**` | `text-xs font-bold px-2 **py-1** rounded-full **bg-amber-100 text-amber-700**` |
| text | `Cooking` | `🔥 Cooking…` |

⚠️ **Same size, same weight, same radius, the SAME two colour tokens — `bg-amber-100` and
`text-amber-700` — differing only in `py-0.5` vs `py-1`.** The card would carry **two amber pills that
say the same word**, one above the other, with nothing to distinguish them but a fire emoji and half a
unit of vertical padding.

## Per KDS branch — WOULD BOTH SHOW, AND WHERE EACH WOULD SIT

**The five reachable KDS configurations. `viewMode` is the KDS's `cardViewMode` (`cardMode`);
`hidePayments = !handoverOn`; `kdsMode` is `trucks.kds_mode`; `readyStepOn` is the Ready-step switch.**

| # | Card mode | Switches | Button row at `'cooking'` | Badge in header | 🔴 **BOTH?** |
|---|---|---|---|---|---|
| 1 | **cook** | any | site 1 → `🔥 Cooking…` (plain amber text, `flex-1`) | `Cooking` pill | 🔴 **YES** |
| 2 | **window** | payments OFF (`hidePayments`) | site 1 → `🔥 Cooking…` (plain amber text) | `Cooking` pill | 🔴 **YES** |
| 3 | **window** | payments ON, Ready step ON | site 2 → `🔥 Cooking…` (plain amber text) | `Cooking` pill | 🔴 **YES** |
| 4 | **window** | payments ON, Ready OFF, `kds_mode` **true** | site 3 → `🔥 Cooking…` **as an amber PILL** | `Cooking` pill | 🔴 **YES — and near-identical** |
| 5 | **window** | payments ON, Ready OFF, `kds_mode` **false** | 🔴 **nothing** — falls through to `return null` | `Cooking` pill | ✅ **no** |

**READ — why row 5 alone is clean. The window block's `!kdsMode` arm has no `'cooking'` case:**

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

**and the file's own comment says exactly where such an order lands — READ, `OrderCard.tsx:878-880`:**

```
      // ⚠️ 'cooking' IS LISTED so a truck whose cooking gate is on can still advance an order this
      // screen (or a cook screen) put into it — without it, such an order would fall past the window
      // block into the solo block, which has no 'cooking' case, and reach `return null`.
```

✅ **Confirmed by reading the solo block: `OrderCard.tsx:938-949` tests `confirmed|modified`, `ready`
and `collected`, then `return null`. There is no `'cooking'` case.**

## WHERE ON THE CARD — they are not adjacent, but they are simultaneous

**The badge sits in the HEADER, at the top of the card.** In solo that is header row 2 (`:1068`). On the
KDS it would be in whichever header row is chosen (see Q2).

**Every 🔥 Cooking… sits in the BUTTON ROW at the BOTTOM — READ, `OrderCard.tsx:1305-1324`:**

```tsx
          <div className="flex flex-col gap-2 mt-auto">
…
            <div className="flex gap-2">
              {renderButtons()}
            </div>
```

🔴 **`mt-auto` pins that row to the bottom of the card, and the block containing it is NOT
conditional in practice — READ, `OrderCard.tsx:220`:**

```tsx
  const expanded = true
```

⚠️ **So there is no collapse, no tap, no scroll between them. Header and button row are on screen
together in one paint. "Both show" means both are visible at once on a single card, roughly a card's
height apart.**

## 🔴 THE COLLISION IS `'cooking'` ONLY. THE OTHER FIVE VALUES ARE CLEAN.

| Badge value | Anything in the button row saying the same thing? |
|---|---|
| `Modified` | ✅ **no** — no branch renders the word "Modified" anywhere |
| `Cooking` | 🔴 **YES — three sites, quoted above** |
| `Ready` | ✅ **no.** A `Ready` **button** exists, but only for `confirmed`/`modified`; **at status `'ready'` every branch returns `completionBtn()` or null instead**, so the button and the badge are never on the same card. The badge's own comment already draws this line: *"This is the status BADGE, NOT the Ready ACTION button"* |
| `Collected` | ✅ **no** — and `activeOrders` drops `'collected'` from every KDS board anyway |
| `Rejected` | ✅ **no** |
| `Cancelled` | ✅ **no** |

## ⚠️ ONE MORE FACT THAT BEARS ON YOUR DECISION — the cook card at `'ready'` shows NOTHING today

**READ — the cook branch's fall-through, `OrderCard.tsx:864`:**

```tsx
      return null
```

⚠️ **A card rendered `viewMode === 'cook'` at status `'ready'` renders NO button and, today, NO badge.**
That state is reachable: a handover device (board keeps `'ready'`) whose card display is set to Cook.
**The card sits on the board with no indication of any kind that the order is done.** ✅ **The badge
would be the ONLY element on that card saying so, and at `'ready'` there is nothing for it to collide
with.**

## 🔴 REACHABILITY OF `'cooking'` TODAY — the collision is real in code, dormant on both live trucks

**READ — the ONLY control that writes `'cooking'`, `OrderCard.tsx:847-851`:**

```tsx
        return kdsMode ? (
          <>
            <Btn label="Start cooking" colour="amber" loading={isLoading('cooking')} onClick={() => onAction('cooking', order.order_key)} />
            <Btn label="Ready"         colour="green" loading={isLoading('ready')}   onClick={() => onAction('ready', order.order_key)} />
          </>
        ) : (
          <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        )
```

**EXECUTED — a repo-wide scan for other writers of the status. The only one is the handler this button
calls, `app/api/dashboard/action/route.ts:468-470`:**

```ts
    if (action === 'cooking') {
      await supabase.from('orders').update({ status: 'cooking' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      return NextResponse.json({ success: true, status: 'cooking' })
    }
```

**plus the offline replay map, which only mirrors the same action — `lib/native/orderGate.ts:32`:**

```ts
const OFFLINE_STATUS_MAP: Record<string, string> = { confirm: 'confirmed', cooking: 'cooking', ready: 'ready', … }
```

⚠️ **`Start cooking` renders only when `kdsMode` is true, and the values you gave me — `pizzeria-gusto
kds_mode false`, `tikka-tonic kds_mode false` — mean NEITHER LIVE TRUCK CAN PRODUCE `'cooking'`
TODAY.** 🔴 **So the collision would not be seen on Gusto or Tikka Tonic this week. It is a real
collision in the code, latent behind one column, on every truck that ever turns `kds_mode` on — and
row 4, the worst-looking one, is exactly a `kds_mode`-true truck.** **INFERRED that this is why the
defect has not been reported from the field; the badge is missing on statuses that ARE reachable.**

---

# Q2 — THE MARKUP POSITION, AND WHETHER THE KDS HEADERS HAVE AN EQUIVALENT

# ✅ BOTH KDS HEADERS HAVE AN EQUIVALENT POSITION. NOTHING WOULD NEED INVENTING.

## The solo position, quoted exactly

**READ — `OrderCard.tsx:1068-1079`. The badge is the SECOND child of header row 2, between `nameEl` and
the price:**

```tsx
              <div className="flex items-center gap-2 mt-1">
                {nameEl('text-sm opacity-70 min-w-0 flex-1')}
                {/* Status BADGE (moved here from row 1) — sits between channel/name and price. Same
                    condition as before: shown for modified/cooking/ready (incl. the blue "Ready"),
                    suppressed for the baseline confirmed/pending the section heading already says. This
                    is the status BADGE, NOT the Ready ACTION button (that stays in the bottom row). */}
                {!['confirmed', 'pending'].includes(order.status) && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>{s.label}</span>
                )}
                <span className="font-bold text-sm flex-shrink-0">£{Number(order.total).toFixed(2)}</span>
                {paidChip}
              </div>
```

⚠️ **Its neighbours are: the name (`flex-1`, the only element that absorbs pressure), the price, and
`paidChip`. That is the "small indicators beside the identity" row in solo.**

## The window header — the equivalent exists, but solo's ONE row is TWO rows here

**READ — `OrderCard.tsx:1085-1108`:**

```tsx
              {/* Row 1 — order # (left) + total (right) */}
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-3xl font-bold">#{order.id}</span>
                  {buzzerChip}
                </div>
                <div className="flex items-baseline gap-1.5 flex-shrink-0">
                  <span className="font-bold text-base">£{Number(order.total).toFixed(2)}</span>
                  {paidChip}
                  {allStruck && <span className="font-black text-xs opacity-70">✓</span>}
                </div>
              </div>
              {/* Row 2 — customer name + time + lateness */}
              <div className="flex items-center gap-2 font-medium text-sm mt-0.5">
                {nameEl('opacity-80 min-w-0')}
                {timeLabel && <span className="opacity-70 flex-shrink-0 ml-auto">{timeLabel}</span>}
                {offsetLabel !== null && (isLate
                  ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white flex-shrink-0">{offsetLabel}</span>
                  : <span className="opacity-50 flex-shrink-0">· {offsetLabel}</span>)}
              </div>
```

🔴 **SOLO'S ROW 2 IS SPLIT ACROSS BOTH WINDOW ROWS, so "the equivalent position" is two candidates, not
one:**

| Candidate | Which of solo's neighbours it keeps | Which it loses |
|---|---|---|
| **Row 1, right cluster** — after `{paidChip}`, before `{allStruck …}` | 🔴 **price and `paidChip`** — the chip family, and the `flex-shrink-0` cluster the badge is already sized for | the name |
| **Row 2**, after `{nameEl(…)}` | the name | price, `paidChip` |

⚠️ **Row 1's right cluster is the closer analogue: it is the INDICATOR cluster (`paidChip` + `✓`), it
is already `flex-shrink-0` like the badge, and it is where the audit found `paidChip` surviving the
copy into this header.** ⚠️ **Row 2 is the tighter row — at the 240px KDS column it already carries
name + time + late pill, and the file's own buzzer-chip note calls that out.** **RECOMMENDING NOTHING;
both exist and neither would be invented.**

## The cook header — an equivalent exists here too

**READ — `OrderCard.tsx:1020-1036`:**

```tsx
        <div className={`w-full px-3 py-2 ${headerCls}`}>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-lg font-bold text-slate-900 truncate">#{order.id}</span>
            {/* Buzzer chip — row 1, beside the order number. See the buzzerChip note. */}
            {buzzerChip}
            <span className="text-xs text-slate-600 flex-shrink-0 inline-flex items-center gap-1 ml-auto">
              {timeLabel}
              {offsetLabel && (isLate
                ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white">{offsetLabel}</span>
                : <>{` · ${offsetLabel}`}</>)}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            {nameEl('text-xs text-slate-600 min-w-0')}
            {allStruck && <span className="text-green-700 font-black text-xs ml-1">✓</span>}
          </div>
        </div>
```

✅ **Row 1 holds small indicators beside the identifier — `buzzerChip` and the red late pill sit there
already.** ✅ **Row 2 is `nameEl` + the `✓`, which is solo's row-2 shape minus the money.** **So the
cook header has BOTH kinds of position and neither has to be invented.**

⚠️ **And the file already argues that this header has room — READ, `OrderCard.tsx:645-647`:**

```
      // Adding a sixth shrink-0 chip there is what would force a THIRD ROW. Row 1 has slack in every mode:
      // solo has an ml-auto gap before the offset pill, window is justify-between with a short left side,
      // cook is #order + time only. NEITHER HEADER GREW A ROW.
```

# ✅ Q2 DOES NOT MEET A STOP CONDITION. Q1 DOES.

---

# 🔴 THE COOK-MODE CHALLENGE YOU ASKED FOR — I FOUND NO DECISION AGAINST IT

**You said to STOP and quote it if any comment or code records a deliberate decision to keep the cook
header free of STATUS indicators as well as money. ✅ THERE IS NONE. I am reporting the search, not an
absence I assumed.**

**EXECUTED — every "not in cook" comment in the file. There is exactly one, and it is about MONEY —
READ, `OrderCard.tsx:623-625`:**

```
  // ⚠️ NOT IN COOK MODE, AND NOT WHEN `hidePayments`. Cook shows no prices at all (`showPrices` is
  // false there) and its header carries no payment chip today; adding a money line would put money on
  // the one screen deliberately without it. It is absent there rather than overflowing there.
```

✅ **"Money", "prices", "payment chip" — every noun in it is a money noun.** ✅ **The buzzer-chip note
quoted above is the opposite kind of evidence: a non-money indicator DELIBERATELY placed in all three
headers, cook included, with the reasoning written down.** 🔴 **So your reasoning holds against the
code: the split is money-vs-not, and the status badge is not money.** ⚠️ **The only thing standing
between Stage 2 and the cook header is Q1's collision, which is a `'cooking'` problem in every card
mode, not a cook-mode problem.**

---

# WHAT I DID NOT DO

- ❌ **No `statusBadge` value extracted.** The badge is still inline in the solo branch, unchanged.
- ❌ **No header edited** — solo, window and cook are all byte-identical to before this task.
- ❌ **Neither cooking element suppressed, reworded, re-coloured or moved.** You said you would decide,
  so I have changed nothing and am recommending nothing.
- ❌ **No filter, no `boardMode`, no `cardMode`, no switch, no key, no default, no persistence touched.**
- ❌ **`paidChipStatic`, `renderButtons`, `completionBtn`, the Waiting element, the late pill, the
  buzzer chip, the `✓` mark, the conflict markers and Syncing… are all untouched.**

---

# 🔴 VERIFICATION

**`tsc` was not the basis of anything here, and nothing was compiled — no file was written, so there
was nothing to typecheck.**

| Claim | Method |
|---|---|
| The badge's condition passes for `'cooking'` | ✅ **EXECUTED** — condition read and the `STATUS` row it resolves to read in `types.ts` |
| There are exactly three 🔥 Cooking… sites | ✅ **EXECUTED** — file-wide scan for `Cooking`; all hits enumerated and each classified |
| `'cooking'` has exactly one writer | ✅ **EXECUTED** — repo-wide scan across `app`, `components`, `lib`; every hit inspected |
| Row 5 renders no cooking element | 🔴 **SOURCE READ ONLY** — traced by reading the branch order (window `!kdsMode` arm → fall-through → solo block → `return null`). **Corroborated by the file's own comment, which is still a source read, NOT a rendering** |
| Rows 1–4 render 🔥 Cooking… | 🔴 **SOURCE READ ONLY** — read from the branch gates. **No KDS was opened; no card was rendered at status `'cooking'`** |
| The two amber pills are near-identical | 🔴 **SOURCE READ ONLY** — class strings compared as text, **not observed side by side on a screen** |
| Header and button row are simultaneously visible | 🔴 **SOURCE READ ONLY** — from `const expanded = true` and `mt-auto`. **Not observed** |
| Cook card at `'ready'` shows nothing | 🔴 **SOURCE READ ONLY** |
| No comment records a status decision for cook | ✅ **EXECUTED** — scans for `badge`, and for `cook` beside `no`/`never`/`omit`/`without`/`deliberat`; every hit read |
| `kds_mode` false on both live trucks | ⚠️ **NEITHER — TAKEN FROM YOU.** Supplied in an earlier task and **not re-queried; I ran no SQL** |
| Nothing was changed | ✅ **EXECUTED** — byte count and census of `OrderCard.tsx` unchanged; `git status --porcelain` below |

🔴 **NOT ONE ITEM IN THIS REPORT WAS BEHAVIOUR-VERIFIED. No browser, no device, no KDS was opened.
Every rendering claim is read from branch structure.**

---

# INTEGRITY

## Non-ASCII class census — `components/dashboard/OrderCard.tsx`

# ✅ 31 CLASSES BEFORE, 31 CLASSES AFTER. EVERY COUNT IDENTICAL. THE FILE WAS NOT WRITTEN.

| Class | BEFORE | AFTER | Δ |
|---|---|---|---|
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 1278 | 1278 | 0 |
| U+2014 EM DASH | 153 | 153 | 0 |
| U+1F534 LARGE RED CIRCLE | 47 | 47 | 0 |
| U+26A0 WARNING SIGN | 47 | 47 | 0 |
| U+FE0F VARIATION SELECTOR-16 | 45 | 45 | 0 |
| U+00A3 · U+2192 · U+2713 · U+2022 · U+2026 | 23 / 22 / 9 / 8 / 7 | identical | 0 |
| U+00A7 · U+21D2 · U+23F3 · U+00D7 · U+270F · U+00B7 · U+1F525 · U+2709 · U+1F4DD | 6 / 5 / 5 / 4 / 4 / 4 / 4 / 4 / 4 | identical | 0 |
| U+1F4B7 · U+1F4B3 · U+21A9 · U+2705 · U+1F514 | 2 each | identical | 0 |
| U+2264 · U+2265 · U+2717 · U+1F355 · U+1F4F1 · U+1F381 · U+2715 | 1 each | identical | 0 |

⚠️ **Because nothing moved, there is no move to prove. Had Stage 2 run, the badge markup contains no
non-ASCII at all — `s.label` is a runtime value — so a correct extraction would have shown a census
delta of ZERO and the byte count rising only by the copied JSX. That test is not available this run.**

## Carrier-aware check — `OrderCard.tsx`, unchanged

| Base | BEFORE n / paired / bare | AFTER n / paired / bare |
|---|---|---|
| U+26A0 | 47 / 45 / **2** | 47 / 45 / **2** |

✅ **The 2 bare warning signs are the two pre-existing conflict-marker strings, reported as pre-existing
in every census for the last several tasks. Unchanged, because the file was not written.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. The report scanned in a SEPARATE pass AFTER it was written.**

```
  components/dashboard/OrderCard.tsx                     90,137  offending=0  CR=0   (unchanged)
  docs/kds-status-badge-report.md   (SEPARATE PASS)       26,481  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 32 | 0 | 32 |
| U+2705 WHITE HEAVY CHECK MARK | 33 | 0 | 33 |
| **U+26A0 WARNING SIGN** | **16** | **16** | 🔴 **0** |
| U+1F525 FIRE | 14 | 0 | 14 |
| U+274C CROSS MARK | 5 | 0 | 5 |
| U+2713 CHECK MARK | 5 | 0 | 5 |

# ✅ EVERY WARNING SIGN IN THIS REPORT IS PAIRED — 16 OF 16, ZERO BARE.

⚠️ **This report quotes `OrderCard.tsx` heavily but happens to quote NONE of its two bare
`U+26A0` strings** — the conflict markers are not part of this task — **so unlike the last report there is
no legitimate bare warning sign here, and 0 is the correct number rather than a suppressed one.**

✅ **The report's total `U+FE0F` count is 16, which exactly accounts for the 16 paired warning signs
and leaves none attached to any other base.** ✅ **The five unpaired bases are internally consistent
— 0 of 32, 0 of 33, 0 of 14, 0 of 5, 0 of 5 — so no base is split across two renderings.**
⚠️ **`U+1F525` FIRE is bare 14 times BY NECESSITY: every one is inside a verbatim quote of
`OrderCard.tsx`'s own `🔥 Cooking…`, which the source writes bare. Pairing them would have
misquoted the code this whole report is about.**

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
?? docs/settings-copy-report.md
?? lib/event-display.ts
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/kds-status-badge-report.md`** | 🔴 **THIS TASK — the ONLY new entry, and the only file written** |
| `M components/dashboard/OrderCard.tsx` | ✅ **PRE-EXISTING — the 42 lines from the step-switch tasks. 🔴 NOT touched this task; Stage 1 was read-only and Stage 2 never ran** |
| `M app/dashboard/[token]/kds/page.tsx` | ✅ pre-existing — nine earlier tasks |
| `M app/dashboard/[token]/page.tsx` · `M lib/settings-copy.ts` | ✅ pre-existing — last task's settings copy |
| `M app/manage/[token]/page.tsx` · `M components/DemoGetStarted.tsx` · `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/dashboard/AddOrderPanel.tsx` · `?? lib/event-display.ts` | ✅ pre-existing — the `fmtVenue` / status-label extractions |
| `M docs/reference-manual.md` | ✅ pre-existing — V11.22 |
| `?? components/shared/EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/*.md` (thirteen earlier reports) | ✅ pre-existing |

---

# 🔴 WHAT I NEED FROM YOU TO RUN STAGE 2

**One decision, on `'cooking'` only. Everything else in the brief is unblocked: the extraction shape is
settled, both KDS headers have a position, no comment opposes cook mode, and the other five badge values
collide with nothing.**

**The facts the decision rests on, with no recommendation attached:**

1. **The duplication is confined to status `'cooking'`, in four of five configurations.**
2. **It is invisible on both live trucks today** — neither can produce `'cooking'` with `kds_mode`
   false — **and it becomes visible the moment any truck turns that column on.**
3. **The two elements are not equals in kind: one is a header STATUS readout, the other a button-row
   PROGRESS line that in row 4 is dressed as the same pill.**
4. **Placing the badge in all three headers with no other change is a valid outcome** — it would mean a
   `kds_mode`-true truck sees the cooking state twice.

**I have not chosen between those. Tell me which and I will run Stage 2 exactly as briefed.**
