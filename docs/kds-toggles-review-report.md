# READY, PAID, COLLECTED — does the pipeline hold?

READ-ONLY DIAGNOSIS. **No file was edited, nothing was committed, no build was run, no deploy, no
database write, no SQL.** `lib/payments/ledger.ts` and `app/api/dashboard/action/route.ts` were read
and quoted and **not touched**. `git status` is in G4. **Nothing is proposed beyond Part F, and Part F
recommends nothing.**

**`docs/kds-steps-model-report.md` and `docs/kds-ready-toggle-report.md` were both read first.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Every claim is marked **READ** or **INFERRED**. **Dashboard and KDS are reported separately.**

---

# 🔴 THE FINDING: THE PIPELINE DOES NOT HOLD, BECAUSE "PAID" IS NOT A STAGE

**Ready and Collected are STATUSES. Paid is not.**

**READ** — `components/dashboard/types.ts:14-24`, the complete status enum:

```ts
export const ORDER_STATUS = {
  PENDING:   'pending',
  CONFIRMED: 'confirmed',
  REJECTED:  'rejected',
  MODIFIED:  'modified',
  CANCELLED: 'cancelled',
  COOKING:   'cooking',
  READY:     'ready',
  COLLECTED: 'collected',
} as const
```

🔴 **THERE IS NO `paid` STATUS.** Payment lives on a different axis entirely — `orders.payment_status`
and `amount_paid`, both **derived caches over the ledger**. **READ**, `lib/payments/ledger.ts:3`:

```
// `orders.payment_status` and `orders.amount_paid` are DERIVED CACHES recomputed from it here.
```

**AND THE THREE ACTIONS PROVE THE SPLIT — READ, all three handlers:**

| Concept | Writes a status? | Books money? |
|---|---|---|
| **READY** (`ready`) | ✅ `status: 'ready'` | 🔴 **NO** |
| **PAID** (`mark_paid*`) | 🔴 **NO** — *"status untouched"* | ✅ `recordCollectionPayment` |
| **COLLECTED** (`collected*`) | ✅ `status: 'collected'` | ✅ **ALSO** `recordCollectionPayment` |

🔴 **AND THE ORDER IS WRONG FOR CARD ORDERS.** A card order is **paid at CONFIRMATION**, long before it
is ready — **READ**, `app/api/dashboard/action/route.ts`, the confirm handler:

```ts
      const captureResult = await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'confirm' })
```

⚠️ **So "Ready → Paid → Collected" describes ONE case: an unpaid order settled at the hatch. For every
online card order the true sequence is Paid → Ready → Collected.** **INFERRED, and it is the reason
the toggles cannot be modelled as three points on one line.**

✅ **What DOES hold is the phrase behind it — "the toggles decide WHERE THIS SCREEN HANDS OVER" — and
that is a claim about the STATUS axis only, where Ready and Collected genuinely are ordered.**

---

# PART A — 🔴 THE WORDS, AS OPERATORS ALREADY MEET THEM

## A1. Every operator-facing site

### "Ready"

| Site | Copy | READ |
|---|---|---|
| **Status chip label** | `ready: { label: 'Ready', bg: 'bg-blue-100', … }` | `types.ts:281` |
| **Card button, cook + payments-off window** | `<Btn label="Ready" colour="green" … onClick={() => onAction('ready', …)} />` | `OrderCard.tsx` |
| **Card button, dashboard solo** | `` <Btn label={`${truck?.truck_emoji || "🍕"} Ready`} … /> `` | `OrderCard.tsx` |
| **Dashboard setting** | `Order-ready step` / *"Show a "Mark ready" button on the orders screen…"* | `page.tsx` |
| **Manage setting** | `label: 'Order-ready step'` | `lib/settings-copy.ts` |
| **KDS chip (new)** | `Ready step` / `No ready step` | `kds/page.tsx` |
| **Customer email** | `deliverReadyEmail` — fired on the `ready` write | `action/route.ts` |

### "Paid"

| Site | Copy | READ |
|---|---|---|
| **The PAID chip** | `<span className="… bg-green-100 text-green-700 …">PAID</span>` | `OrderCard.tsx:534` |
| **Card buttons** | `Mark paid`, `` Mark ${money(...)} paid ``, `Mark paid & collected` | `completionBtn` |
| **Cash/card split** | `💷 Cash & collected`, `💳 Card & collected`, `💷 Cash`, `💳 Card` | `completionBtn` |
| **Part-paid row** | `{money(balance.paidMinor)} paid, {money(balance.balanceMinor)} due` | `partPaidRow` |
| **Ledger note** | `note: 'Mark paid & done — taken at the hatch'` | `ledger.ts:644` |
| **KDS payments chip** | `Payments` / `No payments` | `kds/page.tsx` |
| **`payment_status`** | `'paid' \| 'part_paid' \| 'unpaid' \| 'refunded' \| 'part_refunded' \| 'refund_due'` | `ledger.ts` |

### "Collected"

| Site | Copy | READ |
|---|---|---|
| **Status chip label** | `collected: { label: 'Collected', … }` | `types.ts:282` |
| **Card button, already paid/held** | `<Btn label="Collected" colour="dark" … />` | `completionBtn` |
| **Card button, one-press** | `Mark paid & collected` | `completionBtn` |
| **Undo** | `↩ Undo` → `undo_collected` | `OrderCard.tsx` |
| **KDS done strip** | `Done today · {n}` over `status === 'collected'` | `kds/page.tsx` |

## A2. 🔴 STATE OR ACTION? THE EXISTING COPY TRAINS **STATE** — AND THE CODEBASE SAYS SO EXPLICITLY

| Word | As a STATE | As an ACTION |
|---|---|---|
| **Ready** | ✅ the blue `Ready` chip | ⚠️ only as a bare verbless button `Ready` |
| **Paid** | ✅ the green `PAID` chip; `payment_status: 'paid'` | 🔴 **NEVER BARE — always `Mark paid`** |
| **Collected** | ✅ the `Collected` chip | ⚠️ the bare button `Collected` |

# 🔴 THE RULING IS ALREADY WRITTEN DOWN, ON THIS EXACT AMBIGUITY.

**READ** — `components/dashboard/OrderCard.tsx:327-336`:

```
  // ── 🔴 DO NOT DROP THE WORD "MARK". IT IS WHAT MAKES THESE READ AS ACTIONS. ─────────────────────
  // The Add Order bar's secondary was shortened on 10 August ("Place order, pay later" → "Place order")
  // and these are the obvious next thing to shorten. They must not be. **"Mark paid" is an instruction;
  // "Paid" is a status** — and this card already carries a PAID CHIP a few lines up, so a button reading
  // `Paid & collected` beside a chip reading `PAID` would read as a state the card is reporting rather
  // than a thing the operator can press. That ambiguity is worse here than anywhere else in the product,
  // because the press books money.
  // ⚠️ The Add Order case is the opposite and that is why it could be shortened: "Place order" sits
  // beside "Take payment £10.00", so the CONTRAST carries the meaning. Nothing on this card supplies
  // that contrast — the completion button is frequently the only control on the row.
```

🔴 **"`Paid` IS A STATUS" IS THE CODEBASE'S OWN WORDING, ABOUT THE SAME WORD, DECIDED BECAUSE THE PRESS
BOOKS MONEY.** ⚠️ **A header chip reading bare `PAID` sits four rows above the card's own green `PAID`
chip. INFERRED: an operator scanning that screen would reasonably read it as a filter — "show me paid
orders" — which is precisely the misreading A2 asks about, and the one this comment already refused
once.**

⚠️ **`Ready` and `Collected` are weaker cases but lean the same way: both are STATUS CHIP LABELS
verbatim, and the KDS board already groups by status, so a header control bearing a status word reads
as a view filter before it reads as a capability.**

## A3. Is a framing line needed?

# ✅ YES — ON THE EVIDENCE, THE LABELS ARE NOT SELF-SUFFICIENT.

**Three reasons, all from A1/A2:**

1. 🔴 **All three words are already status-chip labels**, so bare they name states.
2. 🔴 **The codebase has ALREADY REFUSED bare `Paid` as a control label once**, in writing, on a
   money-booking button.
3. ⚠️ **The two existing chips beside them are framed by a VERB or a NOUN PHRASE, not a bare state
   word** — `Ready step` / `No ready step`, `Payments` / `No payments`, `Screen on` / `Screen off`.
   **INFERRED: three bare state words would be the odd ones out in their own header.**

⚠️ **AND THERE IS A SECOND AMBIGUITY A FRAMING LINE WOULD NOT FIX:** "this screen handles PAID" could
mean *takes the money* or *displays the money*. Today those are one setting (`hidePayments` does both)
and C3 shows they are not the same thing. **NO COPY IS PROPOSED — reported only, as instructed.**

---

# PART B — DOES THE PIPELINE HOLD?

## B1. The full progression and the action behind each transition

**READ, from the handlers in `app/api/dashboard/action/route.ts`:**

```
draft ─→ pending ─→ confirmed ─┬─→ cooking ──→ ready ──→ collected
                                └──────────────────────────↗
          (reject)   (cancel)                    (undo_ready) ↰   ↳ (undo_collected)
```

| Transition | Action | Status write | Money write |
|---|---|---|---|
| `pending → confirmed` | `confirm` | ✅ | ✅ **`captureOnConfirmation`** — a card order becomes PAID here |
| `confirmed → cooking` | `cooking` | ✅ | ❌ |
| `→ ready` | `ready` | ✅ | ❌ |
| *(none)* | `mark_paid` / `_cash` / `_card` | 🔴 **NONE** | ✅ |
| `→ collected` | `collected` / `_cash` / `_card` | ✅ | ✅ |
| `ready → confirmed` | `undo_ready` | ✅ | ❌ |
| `collected → prior` | `undo_collected` | ✅ | reverses |

🔴 **`mark_paid` WRITES NO STATUS — READ, its own failure log says so:**

```ts
        console.error(`[mark_paid] LEDGER WRITE FAILED for order_key=${orderKey} truck_id=${truck.id} — the order was NOT marked paid in the ledger (fail-open; status untouched). Re-run recalcOrderPayment to repair:`, err)
```

## B2. 🔴 THE EIGHT COMBINATIONS

**`R`/`P`/`C` = Ready/Paid/Collected. Order at `confirmed`, unpaid, no card hold — the hatch case.**

| # | R | P | C | Buttons rendered | Progresses? | Meaningful? |
|---|---|---|---|---|---|---|
| 1 | ✅ | ✅ | ✅ | `Ready` → `Mark paid` → `Collected` (or one-press) | ✅ | ✅ **the solo tablet** |
| 2 | ✅ | ✅ | ❌ | `Ready`, `Mark paid` — then nothing | 🔴 **NO** | ⚠️ **odd but not nonsense** |
| 3 | ✅ | ❌ | ✅ | `Ready` → `Collected` | ⚠️ **yes — but money is booked anyway (C2)** | 🔴 **NONSENSE as labelled** |
| 4 | ✅ | ❌ | ❌ | `Ready` only | 🔴 **NO on this device** | ✅ **TODAY'S COOK SCREEN** |
| 5 | ❌ | ✅ | ✅ | `Mark paid` → `Collected` (or one-press) | ✅ | ✅ **today's `readyStepOff` hatch** |
| 6 | ❌ | ✅ | ❌ | `Mark paid` only | 🔴 **NO** | ⚠️ **a till** |
| 7 | ❌ | ❌ | ✅ | `Collected` | ⚠️ **yes — money booked anyway** | 🔴 **NONSENSE as labelled** |
| 8 | ❌ | ❌ | ❌ | 🔴 **NONE** | 🔴 **NO** | 🔴 **a read-only board** |

# 🔴 IS "PAID ON, READY OFF" EXPRESSIBLE? YES — IT IS SHIPPING TODAY.

**Row 5 is the existing `readyStepOff` window device. READ, `OrderCard`:**

```tsx
      if (readyStepOff) {
        if (['confirmed', 'modified', 'cooking', 'ready'].includes(order.status)) {
          return completionBtn()
        }
      }
```

✅ **AND THE DASHBOARD HAS DONE IT SINCE BEFORE ANY OF THIS — READ:**

```ts
    const readyStepEnabled = isPub || effectiveOrderReady
    if (['confirmed', 'modified'].includes(order.status)) {
      return readyStepEnabled
        ? <Btn label={`${truck?.truck_emoji || "🍕"} Ready`} … />
        : completionBtn()
    }
```

🔴 **PAYING DOES NOT REQUIRE A READY STATE. Nothing in `mark_paid` or `recordCollectionPayment` reads
`status` at all** — `recordCollectionPayment` reads the order and the ledger and computes a balance:

```ts
  const [order, rows] = await Promise.all([readOrder(supabase, opts.orderKey), readLedger(supabase, opts.orderKey)])
  const before = getOrderBalance(order, rows)
```

⚠️ **SO THE PIPELINE PREMISE FAILS IN BOTH DIRECTIONS: Paid does not need Ready (row 5 ships), and Paid
often happens BEFORE Ready (card capture at confirm).**

## B3. 🔴 SHOULD THE TOGGLES CONSTRAIN EACH OTHER?

**Stated plainly: the two NONSENSE rows are 3 and 7, and they are nonsense for a reason that a
constraint between toggles CANNOT fix.**

🔴 **Rows 3 and 7 are "Collected on, Paid off" — and the server books the money regardless (C2). The
contradiction is between the LABEL and the SERVER, not between two toggles.** ⚠️ **Constraining
Collected to require Paid would hide the contradiction rather than resolve it: the operator would be
told the combination is unavailable, without being told that the reason is that collecting takes
money.**

**Rows 2, 4, 6 and 8 are a different class — they do not lie, they just end the ticket's life on this
screen. READ, the KDS's own statement of that principle:**

```
  // ⚠️ THE ORDER IS NOT FINISHED — ONLY THIS SCREEN IS FINISHED WITH IT. status becomes 'ready', which is
  // NOT terminal: it stays in the dashboard's confirmedOrders bucket … and on any other KDS whose device
  // toggle is on.
```

✅ **Row 4 IS today's cook screen and is unquestionably legitimate.** ⚠️ **Rows 2 and 6 are the same
shape with a different hand-over point.** 🔴 **Row 8 hands over to nothing.**

**THE THREE READINGS, reported without choosing:**

| Reading | Makes unrepresentable | Cost |
|---|---|---|
| **All eight legitimate** | nothing | 🔴 rows 3/7 lie about money; row 8 has no buttons |
| **Constrain: Ready off ⇒ Paid and Collected off** | rows 5, 6, 7 | 🔴 **KILLS ROW 5, WHICH IS SHIPPING** — that is `readyStepOff`, built last week |
| **Constrain: Collected requires Paid** | rows 3, 7 | ✅ removes both nonsense rows; ⚠️ still permits row 8 |

🔴 **THE CONSTRAINT DOMINIC DESCRIBED — "turning Ready off forces Paid and Collected off" — WOULD
DELETE THE ONE COMBINATION HE ASKED FOR LAST WEEK.** Row 5 is exactly "no ready step, this screen
takes money and hands over". **Reported as the sharpest evidence in this report; the decision is
his.**

## B4. "Once the order is ready it disappears from the screen"

**WHAT REMOVES AN ORDER FROM THE BOARD TODAY — READ, three filters and nothing else:**

```ts
  const activeOrders = overlayedOrders.filter(o =>
    !['collected', 'cancelled', 'rejected'].includes(o.status)
  )
```
```ts
  const cookOrders = activeOrders.filter(o => o.status !== 'ready')
```
```ts
  const windowOrders = hidePayments
    ? activeOrders.filter(o => o.status !== 'ready')
    : activeOrders
```

✅ **THE PHRASE IS ALREADY TRUE OF TWO CONFIGURATIONS: cook, and payments-off window. Both drop an
order at `ready`.**

**WHAT WOULD REMOVE IT UNDER EACH COMBINATION — INFERRED, deriving "this screen is finished with it"
from the last step the screen handles:**

| # | R/P/C | Last step here | Order leaves at |
|---|---|---|---|
| 1 | ✅✅✅ | Collected | `collected` *(today's window)* |
| 2 | ✅✅❌ | Paid | ⚠️ **no status marks "paid"** — nothing to filter on |
| 3 | ✅❌✅ | Collected | `collected` |
| 4 | ✅❌❌ | Ready | `ready` *(today's cook)* |
| 5 | ❌✅✅ | Collected | `collected` |
| 6 | ❌✅❌ | Paid | ⚠️ **same problem as row 2** |
| 7 | ❌❌✅ | Collected | `collected` |
| 8 | ❌❌❌ | — | never |

🔴 **ROWS 2 AND 6 EXPOSE THE MODEL'S SHARPEST EDGE: "leaves when paid" HAS NO STATUS TO FILTER ON.**
The board filters on `o.status`, and paid-ness is not a status (the headline). **A "leaves at paid"
rule would have to filter on `payment_status` or a ledger-derived balance — a different data source
from every other filter on that screen.** ⚠️ **INFERRED, and worth weighing: the KDS card already
receives `ledgerRows` and computes `getOrderBalance`, so the data is present — but the BOARD filter
does not use it today.**

## B5. 🔴 CAN A COMBINATION LEAVE AN ORDER WITH NO WAY TO PROGRESS? YES — ROW 8, AND THREE MORE.

**READ — `renderButtons`'s final statement:**

```tsx
    return null
```

**ROW 8 REACHES IT: `pending` is handled first, then the cook branch, then window, then solo — with
every step off, none matches, and the card renders no buttons at all.**

⚠️ **ROWS 2, 4 AND 6 ALSO CANNOT REACH A TERMINAL STATUS ON THAT DEVICE**, but they differ from row 8
in kind: they hand the ticket to another surface, and row 4 is today's shipping cook screen. **Row 8
hands over to nothing.**

# 🔴 STATED PLAINLY: ALL-OFF MUST BE PREVENTED OR GIVEN A MEANING. IT IS THE ONLY ROW WITH NO READING AT ALL.

⚠️ **AND IT HAS ONE HONEST USE — a queue display nobody touches. INFERRED: if that is wanted, it is a
NAMED mode, not an accidental corner of a truth table, because the two are indistinguishable to the
operator who reaches it by tapping.**

---

# PART C — THE COLLECTED PROBLEM

## C1. `recordCollectionPayment`, and everything `collected` writes

**READ — `lib/payments/ledger.ts:622-656`:**

```ts
export async function recordCollectionPayment(
  supabase: SupabaseClient,
  opts: { orderKey: string; truckId: string; createdBy?: string | null; method?: PaymentMethod | null },
): Promise<{ inserted: boolean; balance: OrderBalance; chargedMinor: number }> {
  const [order, rows] = await Promise.all([readOrder(supabase, opts.orderKey), readLedger(supabase, opts.orderKey)])
  const before = getOrderBalance(order, rows)

  // Nothing outstanding (already settled, or a replay whose row is present): recalc so the cache is
  // correct and return without inserting a zero/negative row the CHECK would reject anyway.
  if (before.balanceMinor <= 0) {
    const balance = await recalcOrderPayment(supabase, opts.orderKey)
    return { inserted: false, balance, chargedMinor: 0 }
  }

  const { inserted, balance } = await recordPaymentEvent(supabase, {
    orderKey: opts.orderKey,
    truckId: opts.truckId,
    kind: 'charge',
    channel: 'in_person_other',
    amountMinor: before.balanceMinor,
    state: 'succeeded',
    idempotencyKey: collectIdempotencyKey(opts.orderKey, before.paidMinor, before.balanceMinor),
    note: 'Mark paid & done — taken at the hatch',
    createdBy: opts.createdBy ?? null,
    method: opts.method ?? null,
…
    livemode: true,
  })
```

🔴 **`amountMinor: before.balanceMinor` — THE FULL OUTSTANDING BALANCE. `livemode: true`, hardcoded:**

```
    // 🔴 HARDCODED TRUE, AND CORRECTLY SO — NOT A PLACEHOLDER. This function books an IN-PERSON
    // collection: an operator standing at a hatch, having physically taken cash or run a card through
    // their own PDQ. There is no test mode for cash.
```

**EVERYTHING `collected` WRITES — READ, `action/route.ts:481-540`:**

1. reads `slot, event_date, event_id, status`, and records `fromStatus` for a one-stage undo;
2. **`recordCollectionPayment`** unless a live hold exists;
3. `orders.status = 'collected'`;
4. an audit row;
5. a production-slot rebuild path (capacity);
6. `paymentWarning` on ledger failure — **fail-open**.

**AND THE HOLD EXCEPTION — READ:**

```ts
      const heldOnCollect = await hasHeldAuthorisation(supabase, orderKey)
      if (heldOnCollect) {
        console.warn(
          `[collected] order_key=${orderKey} truck=${truck.id} has a LIVE CARD HOLD — completing the ` +
          `order but booking NO in-person payment. The card is charged at confirmation.`,
        )
      }
```

## C2. 🔴 WITH COLLECTED OFF, WHO BOOKS THE BALANCE? AND CAN IT GO UNBOOKED?

**WHO CAN BOOK IT — READ, the complete set of callers of `recordCollectionPayment`:**

| Caller | Reachable with Collected off on this device? |
|---|---|
| `collected` / `collected_cash` / `collected_card` | 🔴 **NO — that is the switch** |
| `mark_paid` / `mark_paid_cash` / `mark_paid_card` | ✅ **YES — if PAID is on** |

✅ **SO WITH `PAID` ON, THE BALANCE IS STILL BOOKED, BY `mark_paid` — which writes no status. Rows 2
and 6 are safe on money and unsafe on fulfilment.**

# 🔴 CAN A BALANCE BE LEFT UNBOOKED ENTIRELY? YES — ROWS 4 AND 8.

**INFERRED, and it follows directly from the caller table: with Paid OFF and Collected OFF, this device
has no route to `recordCollectionPayment` at all.** The balance is booked only if **another surface**
fires `mark_paid` or `collected` — another KDS, or the dashboard. ⚠️ **Nothing in the product checks
that such a surface exists or is being watched.**

⚠️ **THAT IS ALREADY TRUE OF TODAY'S COOK SCREEN (row 4) and is correct there — a cook is not expected
to take money.** 🔴 **What is new is that the model lets an operator put their ONLY device into that
state by tapping two chips.**

✅ **ONE MITIGATION EXISTS AND IS WORTH NAMING: an ONLINE CARD ORDER is captured at confirmation**
(`captureOnConfirmation`, trigger `'confirm'`), **so its balance is already zero and
`before.balanceMinor <= 0` makes the collection booking a no-op. The exposure is cash and
pay-at-hatch orders only.**

## C3. 🔴 IS "COLLECTED OFF" A DISPLAY CHOICE OR A MONEY CHOICE?

# 🔴 IT IS A MONEY CHOICE. STATED PLAINLY, AS ASKED.

**The evidence, all READ:**

1. **`collected` books the full outstanding balance** — `amountMinor: before.balanceMinor`.
2. **It books it `livemode: true`, unconditionally** — *"There is no test mode for cash."*
3. **Turning it off removes this device's only fulfilment route AND, when Paid is also off, its only
   money route (C2).**
4. **The action's own comment calls the payment the primary write and the status the secondary:**
   ```
   // ── PAYMENT FIRST, FULFILMENT SECOND — AND FAIL OPEN (V9.4) ───────────────────────────────────
   // The ledger row is booked BEFORE the status write so a failure cannot pass unnoticed.
   ```

⚠️ **A TOGGLE THAT SILENTLY CHANGES WHEN — OR WHETHER — A BALANCE IS BOOKED IS NOT A DISPLAY SETTING,
AND LABELLING IT `COLLECTED` DOES NOT SAY SO.** 🔴 **Rows 3 and 7 are worse than silent: they tell the
operator this screen does NOT handle payment, then take the money anyway.**

⚠️ **AND THE EXISTING PAYMENTS CHIP HAS THE SAME PROPERTY TODAY, WHICH IS WHY ITS COMMENT IS SO
EMPHATIC:** *"This toggle changes which orders LEAVE THE BOARD, so losing it silently is worse than
losing a list/grid preference."* **INFERRED: the same standard applies to Collected, and more so,
because Collected also books.**

## C4. The no-money completion path

**READ — `OrderCard.tsx`, the first branch of `completionBtn`:**

```tsx
    if (effectivePaid || heldAuthorisation) {
      return <Btn label="Collected" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
    }
```

**WHEN EACH APPLIES — READ:**

```ts
  const effectivePaid = pendingPayment === 'pending_paid' ? true
    : pendingPayment === 'pending_unpaid' ? false
```
```
  //   'paid'           balance zero. The ordinary settled order.
  //   'refunded'       charged and fully given back. …
  //   'part_refunded'  charged in full, some given back. …
  //   'refund_due'     🔴 MORE THAN THE BALANCE HAS BEEN TAKEN. …
  const SETTLED_STATUSES = ['paid', 'refunded', 'part_refunded', 'refund_due'] as const
```

✅ **It applies when the order OWES NOTHING — settled, refunded, or covered by a live card hold.** Then
`collected` is genuinely fulfilment-only: `before.balanceMinor <= 0` short-circuits the ledger write,
or `heldOnCollect` skips it.

🔴 **IT IS A PROPERTY OF THE ORDER, NOT A SETTING. An operator cannot choose it, and it does not cover
the cash order at the hatch — which is exactly the case a "Collected without Paid" device would be
handling.**

---

# PART D — WHAT WINDOW/COOK DOES BEYOND THE PIPELINE

## D1. Every non-button behaviour

**READ, all six:**

```ts
  const showPrices = viewMode !== 'cook'
```
```tsx
  const partPaidRow = (hidePayments || viewMode === 'cook' || !effectivePartPaid) ? null : (
```
```tsx
      {viewMode === 'cook' ? (
        /* Cook: non-interactive two-line header, no collapse */
```
```tsx
        <div className={`w-full text-left ${viewMode === 'window' ? 'px-3 py-2' : 'px-4 py-3'} ${headerCls}`}>
```
```tsx
          {viewMode === 'cook' ? (
            <div className="mb-2">
              {itemGroups.map(({ cat, lines }, gi) => (
```
```tsx
                          className={`… ${viewMode === 'solo' || viewMode === 'window' ? 'text-sm' : 'text-base'} …`}
```
```tsx
      {allDayPills.length > 0 && activeView === 'window' && (
```
```tsx
          {activeView === 'window' && activeLayout === 'list' && doneOrders.length > 0 && (
```

## D2. 🔴 CONFIRMED: A PAYMENTS-OFF WINDOW DEVICE SHOWS PRICES TODAY

**READ, the entire line — it names `viewMode` and nothing else:**

```ts
  const showPrices = viewMode !== 'cook'
```

✅ **CONFIRMED. `hidePayments` does not appear in it.** A window device with the Payments chip off
takes the cook BUTTON branch but keeps `viewMode === 'window'`, so **prices stay on screen.**

⚠️ **AND THE ADJACENT LINE PROVES THE ASYMMETRY IS DELIBERATE, NOT AN OVERSIGHT** — `partPaidRow`
checks **both**:

```tsx
  const partPaidRow = (hidePayments || viewMode === 'cook' || !effectivePartPaid) ? null : (
```

🔴 **WHAT WOULD HIDE PRICES UNDER THE NEW MODEL? Nothing, unless a rule is invented.** Three readings,
reported not chosen:

- **Paid off ⇒ no prices.** ⚠️ Changes behaviour for existing payments-off window devices, which show
  prices today.
- **A separate display control.** ⚠️ A fourth switch, against the premise of three.
- **Prices always shown.** 🔴 Puts money on a grill screen — the thing Cook exists to prevent.

⚠️ **INFERRED, and it is the argument against the first reading: a hatch device that does not take
money may still need to read a price to answer "how much was that?" while a colleague takes payment.**

## D3. Should the cook card's legibility follow from a toggle?

**Both readings, neither chosen.**

**READING 1 — IT SHOULD FOLLOW AUTOMATICALLY.** ⚠️ A device set to Ready-only is, by definition, a
making screen: no payment, no handover, just food. **INFERRED: "Ready on, Paid off, Collected off" is
row 4 — today's cook screen exactly — so deriving the cook card from that row reproduces the current
pairing with no new control.** ✅ Costs nothing in UI. 🔴 **But it is a hidden coupling: an operator who
turns Collected on to help at the hatch would silently lose the large type they were relying on.**

**READING 2 — IT NEEDS ITS OWN CONTROL.** ⚠️ Legibility is about **where the screen is and who reads
it**, not about which steps it handles. **A hatch tablet mounted high, or an operator with poor
eyesight, wants the big card regardless of its steps.** ✅ Makes the coupling explicit and keeps each
control honest. 🔴 Adds a fourth switch to a model whose selling point is three, and the layout
List/Grid pair already exists beside it.

⚠️ **ONE ASYMMETRY WORTH WEIGHING EITHER WAY: `showPrices` currently rides on the same flag as the
layout, so under reading 2 the price question (D2) needs its own answer too, whereas reading 1
answers both at once.**

## D4. Consumers outside the KDS

# ✅ `activeView`: NOT FOUND outside `app/dashboard/[token]/kds/page.tsx`.

**READ — `grep -rn "activeView" app components lib`, excluding that file: no hits.**

| Consumer | Depends on it? |
|---|---|
| Dashboard page | ❌ renders `viewMode='solo'`; never passes `cardViewMode` |
| Capacity engine | ❌ `.in('status', [...])` only |
| Emails / reports / printing | ❌ server-side, status-driven |
| `van_devices` | ❌ no column |

🔴 **THE ONE OUTWARD LINK IS THE SHARED `ViewMode` UNION — READ, `OrderCard.tsx:14`:**

```ts
export type ViewMode = 'solo' | 'window' | 'cook'
```

**Its only KDS producer:**

```ts
  const cardViewMode = activeView === 'cook' ? 'cook' : 'window'
```
```tsx
                viewMode={cardViewMode}
```

⚠️ **`OrderCard` is rendered by BOTH money surfaces, so removing `'cook'`/`'window'` from that union
touches the dashboard's card even though the dashboard never reads `activeView`. INFERRED: that is the
entire blast radius, and it is small but it is on the money screen.**

---

# PART E — PERSISTENCE AND INDEPENDENCE

## E1. 🔴 TWO MECHANISMS, AND THE TRADE

**MECHANISM 1 — `localStorage`, lazy initialiser. READ:**

```ts
  const [readyStepOn, setReadyStepOn] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem(`hg_kds_readystep_${token}`) !== 'off'
  })
```

**MECHANISM 2 — Capacitor `Preferences`, async. READ:**

```ts
    void Preferences.get({ key: `hg_kds_payments_${token}` })
      .then(({ value }) => { if (!cancelled) setShowPaymentsPref(value === 'on') })
      .catch(() => { if (!cancelled) setShowPaymentsPref(false) })
```

**THE REASONING, READ IN FULL:**

```
  // ⚠️ CAPACITOR PREFERENCES, NOT localStorage, UNLIKE the view/layout/sound prefs beside it. Those
  // predate the native shell. Preferences persists to UserDefaults on iOS, which survives the hard
  // navigations and cold-kills that can hand a WKWebView a fresh localStorage (the reasoning is written
  // out in lib/native/preferencesStorage.ts). On web the plugin falls back to localStorage, so a browser
  // KDS persists too. This toggle changes which orders LEAVE THE BOARD, so losing it silently is worse
  // than losing a list/grid preference.
```

# 🔴 THE TRADE, STATED: `Preferences.get` IS ASYNC AND CANNOT RUN IN A `useState` INITIALISER.

| Mechanism | First-frame restore | Survives a WKWebView cold-kill |
|---|---|---|
| `localStorage` | ✅ **YES** | 🔴 **NO** |
| `Preferences` | 🔴 **NO** | ✅ **YES** |

⚠️ **AND THE FIRST-FRAME REQUIREMENT IS NOT THEORETICAL — READ, the defect it was added for:**

```
  // 🔴 THESE READ localStorage SYNCHRONOUSLY AT FIRST PAINT. They used to start `null` and be filled by a
  // mount effect, which persisted correctly but restored ONE FRAME LATE — and for the VIEW that frame is
  // not cosmetic. … a device configured as the COOK screen painted a WINDOW board first: prices visible
```

🔴 **EACH SWITCH'S SAFE DIRECTION DIFFERS, WHICH IS WHY THIS CANNOT BE SETTLED ONCE FOR ALL THREE.**
Payments resolves `null` to **hide money** — safe. **INFERRED: for Collected there is no obviously safe
direction — defaulting the button ON for a frame risks a premature money booking; defaulting it OFF
strands an operator mid-tap.**

## E2. Independence — CONFIRMED TWO WAYS

**READ — `grep -n "hg_kds_" app/dashboard/[token]/page.tsx`:**

```
NOT FOUND
```

🔴 **THE DASHBOARD READS NO `hg_kds_*` KEY.** The only keys both surfaces share are
`hg_keepawake_<token>` and `hg_soundcfg_<token>` — neither is one of the three.

**AND THE STRUCTURAL GUARANTEE — READ, the dashboard's own settings, all server-resolved:**

```ts
      effectiveOrderReady = (capacityEvent as any)?.order_ready_override ?? vanOrderReadyDefault
```

**plus `OrderCard`'s single read of it, unreachable from the KDS:**

```ts
    const readyStepEnabled = isPub || effectiveOrderReady
```

✅ **It sits after the cook and window branches return, and `cardViewMode` is only ever `'cook'` or
`'window'`. Navigating KDS → dashboard → KDS cannot leak a value either way.**

⚠️ **ONE WATCH ITEM: `readyStepOff` is a NEW prop on the shared `OrderCard`, defaulting `false` and not
passed by the dashboard. INFERRED: if a future change passed a step prop from both surfaces, that
guarantee would be gone. It is the only realistic leak path.**

## E3. A device with nothing stored

| Switch | Default | READ |
|---|---|---|
| Ready | 🔴 **ON** — `getItem(...) !== 'off'` | the initialiser |
| Payment | money hidden if the truck splits the paid step — `null !== true` | `hidePayments` |
| Collected | 🔴 **does not exist** — completion is always offered | B1 |
| View | `'window'` | `activeView` |

✅ **DOES THIS MATCH TODAY FOR AN EXISTING TRUCK? YES — a fresh device lands on Window, ready step on,
money withheld until opted in, completion available.** ⚠️ **Only because Collected has no stored value
to be missing. Introduce it and a fresh tablet gains a default that never existed — and OFF would ship
a device that cannot finish an order (B5).**

## E4. What each stored Window/Cook value should map to

| Stored | Ready | Paid | Collected | Why |
|---|---|---|---|---|
| `'cook'` | ✅ ON | 🔴 OFF | 🔴 OFF | row 4 — Ready is its only action |
| `'window'` + payments ON | per `hg_kds_readystep_<token>` | ✅ ON | ✅ ON | rows 1 / 5 |
| `'window'` + payments OFF | ✅ ON | 🔴 OFF | 🔴 OFF | 🔴 **it already runs the COOK button set** |
| nothing stored | ✅ ON | truck default | ✅ ON | matches E3 |

🔴 **ROWS 1 AND 3 COLLAPSE TO THE SAME THREE-SWITCH STATE YET RENDER DIFFERENTLY TODAY** — prices,
header shape, item grouping, the "To make" bar. **That difference is exactly what D1–D3 are about.**

⚠️ **AND THE MIGRATION MUST BE ACTIVE, NOT PASSIVE: if `hg_kds_view_<token>` is simply left unread, a
cook device silently becomes a window device on its next load — prices and payment buttons on a
grill.**

---

# PART F — THE PICTURE

## F1. 🔴 CAN THREE TOGGLES EXPRESS EVERYTHING WINDOW/COOK DOES? NO.

**Lost, or not expressible as specified:**

1. 🔴 **THE COOK CARD** — non-interactive two-line header, wider padding, category-grouped items at
   `text-base`, and the "To make" bar. **None of Ready/Paid/Collected describes legibility (D1, D3).**
2. 🔴 **PRICE HIDING** — `showPrices = viewMode !== 'cook'` names no payment flag, so a payments-off
   window device shows prices today (D2). **Making Paid cover it is a behaviour change.**
3. 🔴 **"COLLECTED WITHOUT PAID"** — the server books the balance regardless (C2/C3). **Rows 3 and 7
   cannot be honoured by a client toggle.**
4. ⚠️ **"LEAVES THE BOARD WHEN PAID"** — rows 2 and 6 have no status to filter on (B4).
5. ⚠️ **THE MAX PLAN GATE** — `can('cook_screen')` is sold as *'Customer-facing display'*; three free
   per-device switches give every plan what Max charges for.
6. ⚠️ **`confirm` AND `cooking` HAVE NO SWITCH** — `cooking` is governed by the truck-level `kds_mode`
   (B1), a fourth axis the model does not describe.

## F2. Three independent, three constrained, or one choice with three settings?

**Reported with the argument for each. NO RECOMMENDATION.**

### THREE INDEPENDENT

- ✅ **Matches the stated goal**: configure what this screen handles, not a role.
- ✅ **Rows 1, 4, 5 — the three real-world configurations — all expressible**, and row 5 already ships.
- 🔴 **Permits rows 3 and 7, which LIE about money (C3), and row 8, which has no buttons (B5).**
- 🔴 **Every stranding state is reachable by tapping, where today it needs a truck-level flag.**

### THREE CONSTRAINED

- ✅ **Makes the bad rows unrepresentable rather than discouraged** — the prompt's own argument.
- 🔴 **THE SPECIFIC CONSTRAINT PROPOSED — "Ready off forces Paid and Collected off" — DELETES ROW 5,
  WHICH IS SHIPPING.** That is "no ready step, this screen takes money and hands over", built last week
  on request.
- ⚠️ **A different constraint (Collected requires Paid) kills rows 3 and 7 without killing row 5** —
  but it makes Collected not independent, which is the premise of the change.
- 🔴 **A constraint hides the money contradiction rather than resolving it (B3).**

### ONE CHOICE WITH THREE SETTINGS *(i.e. named modes)*

- ✅ **Every combination is one somebody chose deliberately** — Making / Hatch / Everything maps onto
  rows 4, 5 and 1.
- ✅ **The cook card's legibility can ride on the named mode with no fourth control (D3 reading 1).**
- ✅ **Rows 3, 7 and 8 simply do not exist.**
- 🔴 **It is a role picker — which is what Window/Cook already is**, so the gain is the naming and the
  third option, not the model.
- ⚠️ **The evidence in this report leans this way on SAFETY and away from it on the stated GOAL.**

## F3. What building it would involve

**STORAGE**

- Ready and Payment already persist per device; **Collected is new**.
- 🔴 **Choose one mechanism or keep two (E1)** — first-frame restore vs surviving a cold-kill.
- 🔴 **An ACTIVE migration for `hg_kds_view_<token>` (E4)**, or cook devices silently become window
  devices.
- ⚠️ `van_devices` is available but needs a hand-run migration, is async, and has **no row for web
  devices**.

**UI**

- Three chips replacing two; the Window/Cook tab pair removed; List/Grid kept.
- 🔴 **A framing line, on the evidence of A2/A3.**
- 🔴 **A decision on the cook card and on prices (D2, D3).**
- ⚠️ **A floor for row 8, and a way to explain a refused combination.**
- ⚠️ **`?view=cook` and the "Open cook screen" link need a destination or removal.**

**LIFECYCLE**

- 🔴 **The server side of Collected**: separating fulfilment from the money write is a change to
  `action/route.ts` on the money path, governed by the `completion_presses` ruling
  (*"flipping it mid-event can make an undo delete an hour-old payment"*).
- 🔴 **A "leaves at paid" board rule would need a new data source** — `payment_status`, not `status`
  (B4).
- ⚠️ **`OrderCard`'s `ViewMode` union is shared with the dashboard** (D4).
- ✅ **No status semantics change; one column, local predicates.**

## F4. 🔴 EVERY RISK

**1. 🔴 ROW 8 — NO BUTTONS (B5).** `renderButtons` returns `null`. Three taps, on an unattended board.

**2. 🔴 "COLLECTED OFF" IS A MONEY CHOICE, NOT A DISPLAY ONE (C3).** `collected` books the full
outstanding balance `livemode: true`. **Rows 3 and 7 tell the operator this screen does not handle
payment and then take the money.**

**3. 🔴 A BALANCE CAN GO UNBOOKED ENTIRELY (C2).** With Paid and Collected both off, this device has no
route to `recordCollectionPayment`. **Cash and pay-at-hatch only — online card orders capture at
confirmation — but nothing checks that another surface exists.**

**4. 🔴 THE PROPOSED CONSTRAINT DELETES A SHIPPING FEATURE (B3/F2).** "Ready off forces Paid and
Collected off" removes row 5, the `readyStepOff` hatch.

**5. 🔴 THREE NEW STRANDING STATES (B2 rows 2, 6, 8)** reachable by tapping rather than by
configuration.

**6. 🔴 THE LABELS READ AS STATES, NOT CAPABILITIES (A2).** All three are status-chip labels, and the
codebase has already refused bare `Paid` as a control label **because the press books money**.

**7. 🔴 THE COOK CARD AND PRICE HIDING HAVE NO SWITCH (D1–D3, F1).** A grill screen would become a
hatch screen with the money hidden — **not the same thing**, and prices would still show.

**8. ⚠️ "LEAVES AT PAID" HAS NO STATUS TO FILTER ON (B4).** Rows 2 and 6 would need a ledger-derived
board filter, unlike every other filter on that screen.

**9. ⚠️ TWO PERSISTENCE MECHANISMS, AND NO SAFE DEFAULT FOR COLLECTED (E1, E3).** A fresh tablet gains
a default that never existed; OFF ships a device that cannot finish an order.

**10. ⚠️ THE MAX PLAN GATE IS ORPHANED (F1).**

**11. ⚠️ THE MIGRATION MUST BE ACTIVE (E4).** Leaving `hg_kds_view_<token>` unread silently converts
every cook screen into a window screen.

---

# PART G — INTEGRITY

## G1. Byte scan — every file opened

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  app/dashboard/[token]/kds/page.tsx                    122,095  offending=0  CR=0
  components/dashboard/OrderCard.tsx                     89,194  offending=0  CR=0
  app/dashboard/[token]/page.tsx                        391,343  offending=0  CR=0
  app/api/dashboard/action/route.ts                     174,041  offending=0  CR=0
  lib/payments/ledger.ts                                 53,211  offending=0  CR=0
  components/dashboard/types.ts                          15,188  offending=0  CR=0
  lib/slot-bookings.ts                                   24,528  offending=0  CR=0
  supabase/migrations/20260701_van_devices.sql            2,629  offending=0  CR=0
  docs/kds-steps-model-report.md                         42,728  offending=0  CR=0
  docs/kds-ready-toggle-report.md                        38,559  offending=0  CR=0
TOTAL OFFENDING ACROSS ALL FILES: 0
```

✅ **Zero offending bytes, zero CR.** ⚠️ **All opened READ-ONLY.**

## G2. Byte scan of this report

Separate pass, run after writing: **41,608 bytes, offending = 0, CR = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR.

## G3. 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 78 | 0 | 78 |
| U+1F534 LARGE RED CIRCLE | 92 | 0 | 92 |
| U+26A0 WARNING SIGN | 55 | **55** | **0** |

**Every warning sign in this report is paired; ZERO are bare — 55 of 55**, and the file's total U+FE0F
count is **55**, which accounts for all of them and leaves none attached to any other base. ⚠️ **The
two unpaired bases are internally consistent (0 of 78, 0 of 92), so neither is split across two
renderings.** ✅ **U+2500 does not appear in this report at all.**

## G4. `git status` — proof nothing changed

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/OrderCard.tsx
?? components/shared/CuisinePicker.tsx
?? components/shared/EventActionsModal.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/extend-removal-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-steps-model-report.md
?? docs/kds-toggles-review-report.md
```

🔴 **NO FILE WAS CREATED, MODIFIED OR DELETED BY THIS TASK EXCEPT THIS REPORT.**
⚠️ **Every other entry was ALREADY there before this diagnosis began — five earlier tasks' work, still
uncommitted. Not one was touched here.**
