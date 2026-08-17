# KDS: status-label extraction, two renames, and the pill audit

**Parts A, B and C are changes. Part D is read-only and nothing in it was changed.**
`npx tsc --noEmit` passes with no output — **which is not verification.**

**Three files changed:** `lib/event-display.ts`, `app/dashboard/[token]/page.tsx`,
`app/dashboard/[token]/kds/page.tsx`. **No commit, no stage, no revert, no stash, no clean.** No build,
no `next dev`, no `next build`, no `cap sync`, no deploy, no SQL, no migration. **Nothing under
`app/api` or `lib/payments` was edited** — the ready handler was READ for Part C and not touched.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# PART C FIRST — THE EMAIL CLAIM, VERIFIED BEFORE ANY COPY WAS WRITTEN

# 🔴 THE EMAIL ALWAYS FIRES. THE SETTING DOES NOT GATE IT. THE MANUAL IS RIGHT.

**READ — `app/api/dashboard/action/route.ts`, the `ready` handler in full:**

```ts
    if (action === 'ready') {
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'ready' }).eq('order_key', orderKey).eq('truck_id', truck.id)
…
      if (order.event_date) await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
      if (!body.defer_email) {
        await deliverReadyEmail(order, truck)
      }
      return NextResponse.json({ success: true, status: 'ready' })
    }
```

🔴 **THE ONLY GUARD IS `body.defer_email`, A CLIENT TIMING FLAG** — the dashboard sets it so a 4-second
undo can cancel the send, and then fires `send_ready_email` itself. **It is not the setting.**

**READ — the second call site, which has no setting check either:**

```ts
    if (action === 'send_ready_email') {
…
      if (order.status !== 'ready') return NextResponse.json({ success: true, skipped: 'not ready' })
      await deliverReadyEmail(order, truck)
```

**READ — and `deliverReadyEmail` itself gates only on the customer having an address:**

```ts
async function deliverReadyEmail(order: any, truck: any) {
  if (!order.customer_email) return
```

✅ **Neither `order_ready_override` nor `effectiveOrderReady` appears anywhere in either path.** ✅
**Model A confirmed. The manual is correct and nothing needs separating.**

⚠️ **CONSEQUENCE FOR THE COPY, AND IT IS WHY THE OLD WORDING WAS WRONG:** an operator who turned this
setting off to stop the emails would still have sent them — from any KDS cook screen, which has a Ready
button unconditionally.

## The rewrite

**BEFORE — READ:**

```tsx
                  <p className="text-xs text-slate-500 mt-0.5">Show a &ldquo;Mark ready&rdquo; button on the orders screen and notify customers by email when their order is ready.</p>
```

**AFTER — READ:**

```tsx
                  <p className="text-xs text-slate-500 mt-0.5">Show a &ldquo;Mark ready&rdquo; button on the orders screen. Kitchen screens have their own Ready step switch, set on each device &mdash; turning this off here does not turn it off there, and turning it on here does not turn it on there. Whenever an order is marked ready on any screen, the customer is emailed.</p>
```

✅ **Your wording, adjusted only to match the verified behaviour: "Whenever an order is marked ready on
any screen, the customer is emailed" — which is exactly what the code does, and it no longer implies
this setting controls it.**

✅ **Text only.** The `set_order_ready_override` action, the `truck_events.order_ready_override` column
and the per-event scope are untouched.

⚠️ **THE ENTITIES WERE KEPT AS ENTITIES.** `&ldquo;` / `&rdquo;` were already there, and `&mdash;`
matches them, so **no raw typographic character entered the file** — the census below shows
`U+201C`/`U+201D`/`U+2014` unchanged in that file, which is the point of running it here.

## 🔴 A SECOND COPY OF THE SAME CLAIM EXISTS AND WAS NOT CHANGED

**READ — `lib/settings-copy.ts:127`, the MANAGE truck-default help:**

```ts
    help: 'Show a “Mark ready” button on the orders screen and notify customers when their order is ready. '
```

⚠️ **It carries the same false implication.** The brief named one description and said to change the
description text only, so **I left it and am flagging it rather than widening the change.** ⚠️ **Note
it uses RAW typographic quotes (`U+201C`/`U+201D`), not entities, unlike the dashboard's.**

---

# PART A — THE STATUS LABELS, EXTRACTED

## The shared mapping — READ, `lib/event-display.ts`

```ts
export type EventStatusTone = 'paused' | 'live' | 'finished' | 'cancelled' | 'notStarted'

export function eventStatusDisplay(status: string | null | undefined, paused: boolean): EventStatusDisplay {
  if (paused) return { label: '⏸ Paused', tone: 'paused' }
  if (status === 'open') return { label: '● Live', tone: 'live' }
  if (status === 'closed') return { label: '● Finished', tone: 'finished' }
  if (status === 'cancelled') return { label: 'Cancelled', tone: 'cancelled' }
  // 'confirmed' / 'unconfirmed' (or any not-yet-started status) — NOT finished; pairs with Start Event.
  return { label: 'Not started', tone: 'notStarted' }
}

export const EVENT_STATUS_TEXT_ON_DARK: Record<EventStatusTone, string> = {
  paused: 'text-amber-400',
  live: 'text-green-400',
  finished: 'text-slate-400',
  cancelled: 'text-red-400',
  notStarted: 'text-slate-400',
}
```

✅ **"Finished", not "Closed", exactly as instructed.**

🔴 **THE LABEL IS SHARED; THE COLOUR IS NOT, AND THAT IS WHY THE FUNCTION RETURNS A TONE.** The
dashboard's bar is on a DARK header and the KDS's on a WHITE one — `text-slate-400` is correct on one
and unreadable on the other. **A fixed className would have forced one surface to render wrongly.** The
words and the branch order are shared; only the palette is per-surface.

## 🔴 EVERY STATUS IN THE UNION, BEFORE AND AFTER — DASHBOARD

**READ — the union is `'unconfirmed' | 'confirmed' | 'open' | 'closed' | 'cancelled'`
(`components/dashboard/types.ts`), FIVE values, plus the `paused` override.**

| Input | BEFORE — rendered by the dashboard | AFTER — rendered by the dashboard | Identical? |
|---|---|---|---|
| `paused` (any status) | `<span className="text-xs font-medium text-amber-400 flex-shrink-0">⏸ Paused</span>` | `text-xs font-medium text-amber-400 flex-shrink-0` · `⏸ Paused` | ✅ |
| `'open'` | `…text-green-400 flex-shrink-0">● Live` | `…text-green-400 flex-shrink-0` · `● Live` | ✅ |
| `'closed'` | `…text-slate-400 flex-shrink-0">● Finished` | `…text-slate-400 flex-shrink-0` · `● Finished` | ✅ |
| `'cancelled'` | `…text-red-400 flex-shrink-0">Cancelled` | `…text-red-400 flex-shrink-0` · `Cancelled` | ✅ |
| `'confirmed'` | `…text-slate-400 flex-shrink-0">Not started` | `…text-slate-400 flex-shrink-0` · `Not started` | ✅ |
| **`'unconfirmed'`** | `…text-slate-400 flex-shrink-0">Not started` *(the same else-branch)* | **identical** | ✅ |
| an unrecognised value | the else-branch → `Not started` | **identical** — the function's fallback | ✅ |

# ✅ SEVEN INPUTS, SEVEN CHARACTER-IDENTICAL OUTPUTS. NO STOP CONDITION MET.

**The class string is assembled the same way — `` `text-xs font-medium ${…} flex-shrink-0` `` —
producing the same three tokens in the same order.** ⚠️ **`paused` is still tested FIRST, so a paused
open event still reads "Paused", not "Live".**

**READ — the new dashboard call site:**

```tsx
                {(()=>{const st=eventStatusDisplay(activeEvent.status,paused);return(
                  <span className={`text-xs font-medium ${EVENT_STATUS_TEXT_ON_DARK[st.tone]} flex-shrink-0`}>{st.label}</span>
                )})()}
```

## The second copy is GONE

**READ — the KDS now:**

```tsx
          <span className={`text-xs font-medium ${EVENT_STATUS_TEXT_ON_LIGHT[eventStatus.tone]} flex-shrink-0`}>{eventStatus.label}</span>
```

```
$ grep -c "● Live" app/dashboard/[token]/kds/page.tsx
0
$ grep -c "● Live" lib/event-display.ts
1
```

✅ **The KDS's five-branch chain is deleted.** ✅ **The dashboard's one remaining `● Live` is a COMMENT
at `page.tsx:706`** (*"same rule as the '● Live' indicator"*), not a second rendering.

🔴 **THE CENSUS PROVES THE GLYPHS MOVED RATHER THAN BEING RETYPED:** the dashboard lost `U+23F8` ×1 and
`U+25CF` ×2, the KDS lost `U+23F8` ×1 and `U+25CF` ×2, and `lib/event-display.ts` gained exactly
`U+23F8` ×1 and `U+25CF` ×2. **Net zero new characters across the three files.**

⚠️ **The KDS's dot now reads the same tone**, so dot and label cannot drift:

```tsx
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_STATUS_DOT[eventStatus.tone]}`} />
```

---

# PART B — ONE SWITCH RENAMED

**`Marks ready` → `Ready step`. `Payment/Collected` unchanged.**

```tsx
              <span className="hidden sm:inline text-xs">Ready step</span>
```

✅ **Label text only.** `hg_kds_readystep_<token>`, the tri-state, the `readyPref ?? !handoverOn`
default, the dual write and the migration are all untouched — verified by scan.

---

# PART D — THE PILL AUDIT. READ-ONLY. NOTHING CHANGED.

## Every pill, badge, chip and indicator in `OrderCard.tsx`

| Indicator | Gate, quoted | Reads `viewMode`? | Solo | KDS full | KDS cook | Driven by |
|---|---|---|---|---|---|---|
| **⚠ PAYMENT NOT RECORDED** | `conflict === 'payment'` | no | ✅ | ✅ | ✅ | `conflict` prop |
| **⚠ Last update didn't sync** | `conflict === 'status'` | no | ✅ | ✅ | ✅ | `conflict` prop |
| **⏳ Syncing…** | `if (pendingSync)` — replaces the whole button row | no | ✅ | ✅ | ✅ | `pendingSync` prop |
| 🔴 **STATUS BADGE** (`New`/`Confirmed`/`Modified`/`Cooking`/**`Ready`**/`Collected`/`Rejected`/`Cancelled`) | `!['confirmed', 'pending'].includes(order.status) && (` — **nested inside `{viewMode === 'solo' ? (`** | 🔴 **YES — solo only** | ✅ | 🔴 **✗** | 🔴 **✗** | `order.status` → `STATUS[…]` |
| **PAID** | `: effectivePaid ? …` inside `paidChipStatic = hidePayments ? null : …` | placement only | ✅ | ✅ *(if handover on)* | 🔴 **✗** | ledger → `getOrderBalance` |
| **CARD HELD** | `: heldAuthorisation ? …` (same chain) | placement only | ✅ | ✅ | 🔴 **✗** | `heldAuthorisation` prop |
| **REFUNDED** | `balance.status === 'refunded' ?` | placement only | ✅ | ✅ | 🔴 **✗** | ledger |
| **£X REFUNDED** | `balance.status === 'part_refunded' ?` | placement only | ✅ | ✅ | 🔴 **✗** | ledger |
| **£X paid, £Y due** (`partPaidRow`) | `(hidePayments \|\| viewMode === 'cook' \|\| !effectivePartPaid) ? null` | 🔴 **YES — excludes cook** | ✅ | ✅ | 🔴 **✗** | ledger |
| **Buzzer chip** | `!onBuzzer ? null : …` | no | ✅ | ✅ | ✅ | `onBuzzer` + buzzer state |
| **Late pill** (`{offsetLabel}` red) | `isLate` — rendered separately in all three headers | rendered thrice | ✅ | ✅ | ✅ | `slot` vs now |
| **✓ all-struck** | `allStruck &&` — in all three headers | rendered thrice | ✅ | ✅ | ✅ | local tap state |
| **⏳ Waiting** | window branch, `kdsMode`, `readyStepOn` false | 🔴 **window only** | ✗ | ✅ *(gate on)* | ✗ | `kds_mode` + switches |
| **🔥 Cooking…** | cook branch `order.status === 'cooking'` **and** window branch `kdsMode` | 🔴 **yes, two copies** | ✗ | ✅ | ✅ | `order.status` |

## D1 — Why the ready pill does not render on the KDS

🔴 **IT IS AN ABSENCE, NOT A GATE. The badge sits inside the `viewMode === 'solo'` branch of the
header, and the KDS never renders `'solo'`.**

**READ — the header's top-level split:**

```tsx
        <div className={`w-full text-left ${viewMode === 'window' ? 'px-3 py-2' : 'px-4 py-3'} ${headerCls}`}>
          {viewMode === 'solo' ? (
```

**READ — the badge, nested inside that branch:**

```tsx
                {/* Status BADGE (moved here from row 1) — sits between channel/name and price. Same
                    condition as before: shown for modified/cooking/ready (incl. the blue "Ready"),
                    suppressed for the baseline confirmed/pending the section heading already says. This
                    is the status BADGE, NOT the Ready ACTION button (that stays in the bottom row). */}
                {!['confirmed', 'pending'].includes(order.status) && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>{s.label}</span>
                )}
```

⚠️ **The badge's OWN condition would pass for `'ready'`** — it excludes only `confirmed` and `pending`.
🔴 **It never runs, because the `viewMode === 'solo' ?` above it is false on the KDS.** ✅ **So the
answer is: a `viewMode === 'solo'` branch, and within it an absence — the window and cook headers
simply have no equivalent element.**

## D2 — Why the paid pill renders when the ready badge does not

🔴 **THE DIFFERENCE IS PLACEMENT, NOT CONDITION. `paidChip` is rendered in TWO headers; the status
badge in ONE.**

| | Solo header | Window header | Cook header |
|---|---|---|---|
| `{paidChip}` | ✅ line ~1078 | ✅ line ~1097 | 🔴 **absent** |
| status badge | ✅ line ~1075 | 🔴 **absent** | 🔴 **absent** |

**`paidChip` is computed ONCE, outside every branch** (`const paidChipStatic = hidePayments ? null : …`)
**and then placed by each header that wants it.** The status badge is written INLINE inside solo's JSX
and exists nowhere else. **INFERRED: the paid chip was built as a reusable value and the status badge as
part of one layout — which is why one survived the copy into the KDS headers and the other did not.**

## D3 — Everything missing on the KDS

**Missing on the KDS entirely (renders on the dashboard, on neither KDS card mode):**

1. 🔴 **The STATUS BADGE, in every value it can take** — `Modified`, `Cooking`, **`Ready`**,
   `Collected`, `Rejected`, `Cancelled`. **This is the observed defect, and it is six labels, not one.**

**Missing in cook-card mode but present in full-card mode:**

2. **PAID**
3. **CARD HELD**
4. **REFUNDED**
5. **£X REFUNDED**
6. **£X paid, £Y due** (`partPaidRow`)

**Present everywhere:** both conflict markers, Syncing…, the buzzer chip, the late pill, the ✓
all-struck mark, 🔥 Cooking….

⚠️ **⏳ Waiting is the reverse case — it renders ONLY on the KDS full card and never on the
dashboard.**

## D4 — Deliberate or incidental, per item

| Missing item | Verdict | Evidence |
|---|---|---|
| **Status badge on the KDS** | 🔴 **INCIDENTAL** | **No comment anywhere records a decision to omit it.** Its own comment is a solo-layout note — *"moved here from row 1 … sits between channel/name and price"* — written about where it sits WITHIN solo, not about the other two headers. It sits in a branch the KDS never reaches |
| **paidChip in cook mode** | ✅ **DELIBERATE** | The cook header has no money element at all, and `partPaidRow`'s comment states the rule: *"NOT IN COOK MODE… Cook shows no prices at all (`showPrices` is false there) and its header carries no payment chip today; adding a money line would put money on the one screen deliberately without it"* |
| **REFUNDED / £X REFUNDED / CARD HELD in cook** | ✅ **DELIBERATE** | same chain, same `paidChipStatic`, same placement decision |
| **partPaidRow in cook** | ✅ **DELIBERATE** | `viewMode === 'cook'` is an explicit disjunct in its own gate |

🔴 **SO THE SPLIT IS CLEAN: everything missing in COOK mode is a recorded money decision; the one thing
missing on the KDS ENTIRELY is the status badge, and nothing records a decision about it.**

## D5 — Where an order is absent because it LEFT THE BOARD rather than because a pill is gated

# 🔴 YES — AND IT IS EXACTLY THE READY-STEP-ON / PAYMENT-COLLECTED-OFF DEVICE.

**READ — that device resolves `boardMode === 'cook'`, and:**

```ts
  const cookOrders = activeOrders.filter(o => o.status !== 'ready')
```

🔴 **A `'ready'` order is not on that board at all.** ✅ **So on THAT device the missing "Ready" badge
is moot — there is no card to put it on.** ⚠️ **The order is not finished; it is on the dashboard and
on any device whose Payment/Collected is on.**

**Where the badge's absence is a REAL gap rather than a board filter:**

| Device | `'ready'` order on the board? | Badge absence matters? |
|---|---|---|
| Ready on / Payment off (`boardMode` cook) | 🔴 **NO — filtered out** | ✗ moot |
| Ready off / Payment on | ✅ **yes** — `windowOrders` keeps it | 🔴 **YES — the card is there with no Ready badge** |
| Ready on / Payment on | ✅ **yes** | 🔴 **YES** |
| Dashboard | ✅ yes | ✓ badge renders |

⚠️ **AND THE SAME DISTINCTION APPLIES TO `Collected`:** `activeOrders` drops `'collected'` on every KDS
board, so that badge value can never appear there regardless — the orders live in the separate
`doneOrders` strip instead.

🔴 **`Modified`, `Cooking`, `Rejected` and `Cancelled` have no such excuse on a handover device:**
`'modified'` and `'cooking'` are in `activeOrders`, so those cards ARE on the board, with no badge.

**RECOMMENDING NOTHING. Facts only.**

---

# 🔴 VERIFICATION

**`tsc` passing is NOT verification and is not counted.**

| Item | Method |
|---|---|
| **Part C: the email is not gated by the setting** | ✅ **EXECUTED** — both `deliverReadyEmail` call sites enumerated; scan for `order_ready`/`effectiveOrderReady` in the route |
| Part A: seven inputs → seven identical outputs | 🔴 **SOURCE READ ONLY** — the table is derived by reading both expressions, **not by rendering them** |
| Part A: the KDS's second copy is gone | ✅ **EXECUTED** — `grep -c "● Live"` returns 0 there, 1 in the shared module |
| Part A: glyphs moved rather than retyped | ✅ **EXECUTED** — census deltas balance across the three files |
| Part B: keys/defaults/behaviour untouched | ✅ **EXECUTED** — scan |
| Part C: the manage sibling still holds the old claim | ✅ **EXECUTED** — scan |
| Part D: every branch and gate quoted | ✅ **EXECUTED** — scans; **the render matrix itself is INFERRED from branch structure** |
| Census, byte scan, carrier | ✅ **EXECUTED** |
| **The dashboard bar renders identically after the extraction** | 🔴 **NOT OBSERVED — no browser was opened** |
| **The KDS switch reads "Ready step"** | 🔴 **SOURCE READ ONLY** |
| **The new settings copy fits its container** | 🔴 **NOT OBSERVED — it is roughly 3× longer than the string it replaces** |

⚠️ **THAT LAST ONE IS WORTH A LOOK ON DEVICE.** The description sits in a `text-xs` paragraph inside a
settings card; **it went from one line to three or four**, which no test here can catch.

---

# INTEGRITY

## Non-ASCII class census, before and after

### `lib/event-display.ts` — 7 classes BEFORE, **9 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| **U+23F8 DOUBLE VERTICAL BAR** | 0 | 1 | 🔴 **+1, NEW** | the `⏸` in `⏸ Paused` — **moved here from both call sites, which each lost one** |
| **U+25CF BLACK CIRCLE** | 0 | 2 | 🔴 **+2, NEW** | the `●` in `● Live` and `● Finished` — **same, moved not retyped** |
| U+1F534 · U+2014 · U+2500 | 2 / 5 / 51 | 4 / 15 / 99 | +2 / +10 / +48 | comment prose and rules |
| U+26A0 | 4 | 8 | +4 | caveats — **all paired** |
| U+FE0F | 4 | 8 | +4 | ✅ **matches the U+26A0 delta exactly** |

✅ **The two new classes are the two the call sites lost. This is a MOVE, and the arithmetic proves
it.**

### `app/dashboard/[token]/page.tsx` — 53 classes BEFORE, **53 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+23F8 | 2 | 1 | **−1** | `⏸ Paused` moved to the shared module |
| U+25CF | 3 | 1 | **−2** | `● Live` and `● Finished` moved |
| *everything else* | — | — | **0** | 🔴 **including `U+201C`, `U+201D` and `U+2014` — Part C's new copy used HTML ENTITIES, so no typographic character entered the file** |

### `app/dashboard/[token]/kds/page.tsx` — 34 classes BEFORE, **34 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+23F8 | 2 | 1 | **−1** | second copy deleted |
| U+25CF | 3 | 1 | **−2** | second copy deleted |
| U+26A0 | 62 | 64 | **+2** | two caveats — **both paired** |
| U+FE0F | 62 | 64 | **+2** | ✅ **matches exactly** |

# ✅ NO PAGE FILE GAINED OR LOST A CLASS. THE SHARED MODULE GAINED THE TWO THE PAGES LOST.

## Carrier-aware check — edited files

| File | Base | BEFORE n / paired / bare | AFTER n / paired / bare | Verdict |
|---|---|---|---|---|
| `lib/event-display.ts` | U+26A0 | 4 / 4 / **0** | 8 / 8 / **0** | ✅ all paired |
| dashboard | U+26A0 | 78 / 75 / **3** | 78 / 75 / **3** | ✅ **identical** |
| KDS | U+26A0 | 62 / 61 / **1** | 64 / 63 / **1** | ✅ **bare unchanged** |

🔴 **Every pre-existing bare count is unchanged. Every warning sign added is paired.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. All three written files, plus this report in a SEPARATE pass.**

```
  lib/event-display.ts                                    6,795  offending=0  CR=0   (was 3,256)
  app/dashboard/[token]/page.tsx                        390,302  offending=0  CR=0   (was 390,443)
  app/dashboard/[token]/kds/page.tsx                    137,375  offending=0  CR=0   (was 137,463)
  docs/kds-pill-audit-report.md     (SEPARATE PASS)      25,743  offending=0  CR=0
TOTAL OFFENDING: 0
```

⚠️ **Both page files SHRANK despite gaining comments — the two deleted branch chains were larger than
the calls that replaced them.**

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 80 | 0 | 80 |
| U+1F534 LARGE RED CIRCLE | 49 | 0 | 49 |
| 🔴 **U+26A0 WARNING SIGN** | **23** | **17** | 🔴 **6** |
| U+23F8 DOUBLE VERTICAL BAR | 6 | 0 | 6 |
| U+25CF BLACK CIRCLE | 16 | 0 | 16 |
| U+23F3 HOURGLASS WITH FLOWING SAND | 3 | 0 | 3 |
| U+1F525 FIRE | 2 | 0 | 2 |

# 🔴 THIS REPORT HAS TWO BARE U+26A0, AND THEY ARE CORRECT. HERE IS WHY.

**Every warning sign I wrote is paired — 17 of 17. The six bare ones are VERBATIM QUOTES of
`OrderCard.tsx`'s own bare glyphs: the two strings below, each appearing three times — once in the
Part D table, once in the illustration here, and once in the source quote beneath it:**

```
| **⚠ PAYMENT NOT RECORDED** | …
| **⚠ Last update didn't sync** | …
```

**READ — the source, and the match is exact:**

```
OrderCard.tsx:998   ⚠ PAYMENT NOT RECORDED — check before releasing
OrderCard.tsx:1002  ⚠ Last update didn&apos;t sync
```

🔴 **`OrderCard.tsx` HAS EXACTLY 2 BARE U+26A0, AND THEY ARE THESE TWO STRINGS** — the same two I have
reported as pre-existing in every census for the last several tasks. **Pairing them here would have
misquoted the source and broken the audit's purpose, which is to say what the card actually renders.**

⚠️ **The correct reading of the carrier check is therefore "17 written, all paired; 6 quoted, bare
because the source is bare" — which a raw total would have hidden, and which is exactly the case the
per-base form exists to expose.** ✅ **The four other unpaired bases are internally consistent (0 of 80,
0 of 49, 0 of 6, 0 of 16, 0 of 3, 0 of 2), so no base is split across two renderings.**

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
?? docs/kds-step-switches-report.md
?? docs/kds-steps-model-report.md
?? docs/kds-toggles-review-report.md
?? docs/kds-two-switches-build-report.md
?? docs/kds-two-switches-report.md
?? docs/kds-view-removal-report.md
?? lib/event-display.ts
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| `?? lib/event-display.ts` | ⚠️ **PARTLY** — created last task; **this task added the status mapping** |
| `M app/dashboard/[token]/page.tsx` | ⚠️ **PARTLY** — **this task did Parts A and C** |
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **PARTLY** — eight earlier tasks; **this task did Parts A and B** |
| `?? docs/kds-pill-audit-report.md` | 🔴 **THIS TASK — the only new entry** |
| `M components/dashboard/AddOrderPanel.tsx` | ✅ pre-existing — last task's `fmtVenue` extraction |
| `M app/manage/[token]/page.tsx` · `M components/DemoGetStarted.tsx` · `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/dashboard/OrderCard.tsx` | ✅ pre-existing — the step switches. 🔴 **NOT touched this task; Part D was read-only** |
| `M docs/reference-manual.md` | ✅ pre-existing — V11.22 |
| `?? components/shared/EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/*.md` (twelve earlier reports) | ✅ pre-existing |

⚠️ **TEN TASKS' WORK IS NOW UNCOMMITTED, ACROSS SEVEN SOURCE FILES.**
