# The sold-out refusal: seen, cleared, and explained

BUILD. 13 August 2026.

**No `next dev`, no `next build`, no commit, no deploy. No migration.**

**Two files changed:**

```
app/api/payments/return/route.ts |  19 +++++-
app/trucks/[slug]/order/page.tsx | 132 ++++++++++++++++++++++++++++++++++-----
2 files changed, 132 insertions(+), 19 deletions(-)
```

`npx tsc --noEmit` exits 0. Nothing on the WHAT NOT TO TOUCH list was touched: the guard, the refusal, the hold release and the no-order outcome are untouched; `promoteDraft` is untouched — including its `customerMessage`; capture, promotion, the sweeps and the ledger are untouched. The pay-at-hatch path changed **only where the same defect lives**, which §2 sets out and the brief permits.

---

## 1. THE MESSAGE IS NOW THE FIRST THING IN THE SHEET

**Moved from** the submit-time notice cluster directly above the Place order button **to** immediately below the sheet's own header, above every step:

```tsx
              <div className="flex items-center justify-between mb-4">
                <h3 ...>{payingInSheet ? 'Pay by card' : 'Complete your order'}</h3>
                {payStage !== 'authorising' && (<button onClick={() => setFormSheetOpen(false)} ...>✕</button>)}
              </div>

              {/* ── 🔴 THE PAYMENT-REFUSED NOTICE, AND IT IS THE FIRST THING IN THE SHEET. ──────── */}
              {paymentFailedNotice && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
                  <p className="flex-1 text-red-800 text-sm font-medium">{paymentFailedNotice}</p>
                  <button onClick={() => setPaymentFailedNotice(null)} ...>✕</button>
                </div>
              )}
```

**Why there and not where it was.** The old position is *correct for the notices that share it*: a pay-at-hatch refusal is caused by pressing the button those notices sit above, so the customer is already looking at that spot. This one arrives from somewhere else entirely — a promotion that ran after the card was authorised, or a fresh document Stripe redirected onto — so the sheet can be scrolled anywhere or freshly opened. On a laptop that put it below the fold.

**Measured, from the shipped file:**

```
sheet opens            : 2737
sheet header           : 2750
🔴 paymentFailedNotice : 2774
payment step           : 2791
pause/stock notices    : 3061
Place order button     : 3095
notice is before the payment step? true
notice is before every other notice? true
occurrences of the notice block: 1
```

**It pushes nothing important off screen.** The sheet is `max-h-[90vh] overflow-y-auto`, so it scrolls; the panel is three lines at its longest and `mb-4`; the review, the fields and the Place order button keep their order and are reached by the same scroll they always were. It renders **only when there is a refusal**, so an ordinary order sees the sheet unchanged — the moved block is a single `{paymentFailedNotice && (...)}`, and there is exactly one of them in the file.

**And the sheet is scrolled to it.** The sheet keeps its scroll position across steps, so a notice at the top can still arrive off screen for a customer who was at the card form. One ref, used for nothing else:

```ts
  const sheetScrollRef = useRef<HTMLDivElement | null>(null)
  ...
  sheetScrollRef.current?.scrollTo({ top: 0 })
```

On the redirect leg the document is new and already at the top; the previous build's `useState(!!paymentFailedParam)` opens the sheet so the notice is on screen at all.

---

## 2. THE SOLD-OUT LINES ARE REMOVED

### `capBasketToRemaining` is the right home for half of it, and is used unchanged

**Established before writing anything.** It caps each named line to the server's own `remaining`, drops any line that reaches zero, and touches nothing else — which is exactly the item behaviour wanted, and is already what a pay-at-hatch customer gets. It is **called, not replaced**:

```ts
    capBasketToRemaining(shortItems)
```

What it deliberately does **not** do is deals — its own comment says so ("Deal-routed items aren't trimmed here — the server re-rejects on resubmit"). That is the one case that cannot be left alone, so the deal half is added **around** it rather than inside it, and the item behaviour is byte-identical for every existing caller:

```ts
  const applySoldOutRemoval = (shortItems: { name: string; remaining: number }[]) => {
    const gone = shortItems.filter(s => Math.max(0, s.remaining) === 0).map(s => s.name)
    const keptItems = basket.filter(b => {
      const short = shortItems.find(s => s.name === b.menuItem.name)
      return !short || Math.max(0, short.remaining) > 0
    })
    const doomedDeals = appliedDeals.filter(d =>
      Object.values(d.slots || {}).some(n => n && gone.includes(String(n))))
    const removedItems = basket.filter(b => gone.includes(b.menuItem.name)).map(b => b.menuItem.name)
    const removedDeals = doomedDeals.map(d => d.bundle.name)

    capBasketToRemaining(shortItems)
    if (doomedDeals.length) {
      setAppliedDeals(prev => prev.filter(d =>
        !Object.values(d.slots || {}).some(n => n && gone.includes(String(n)))))
    }

    const removed = [...new Set([...removedItems, ...removedDeals.map(n => `your ${n} deal`)])]
    const emptied = removed.length > 0 && keptItems.length === 0 && appliedDeals.length - doomedDeals.length === 0
    return { removed, emptied }
  }
```

- **Only the named lines go.** Everything else — quantities, modifiers, notes, other deals, the slot, the customer's details — is untouched.
- **A list is handled.** `soldOut` is an array end to end; the server sends every name it refused on.
- **The names come from the server**, so the page never guesses. See §3.

### The card path had no names until now

`promoteDraft` records a machine reason (`stock: Fish Cake, Chicken Satay`) and returns a sentence; the page can act on the first and not the second. The route now parses it — **no new source of truth, no change to `promoteDraft`**:

```ts
function namesFromReason(reason: string | null): string[] {
  if (!reason || !reason.includes(': ')) return []
  return reason.slice(reason.indexOf(': ') + 2).split(', ').map(s => s.trim()).filter(Boolean)
}
```

and adds `soldOut: [...]` to both refused payloads (the fresh refusal and the already-refused-by-the-webhook one). A name that matches no basket line — a category from `category_closed:`, an option name from `option_sold_out:` — removes nothing, which is the correct outcome for both.

### A DEAL loses its whole bundle, and that is a choice

A bundle is priced and served as a unit. A deal with an empty slot is not a cheaper deal — it is **not orderable at all**, and the server would refuse the very next attempt for the same reason, leaving the customer in a loop whose cause they cannot see. So the deal is removed and **named** in the sentence, so they can re-add it with a different choice; the deal picker is two taps away and every other deal is untouched.

### An emptied basket is its own state

> *"We have taken Fish Cake and Chicken Satay out of your order, which leaves it empty — close this and choose something else."*

What the customer can do next: dismiss the sheet (the ✕ or the backdrop) and pick from the menu, which is right behind it and has just been re-fetched so the sold-out items are gone. Placing the order is impossible until they do — the Place order button is already disabled on `!hasItems`, which needed no change.

### The pay-at-hatch path has the same defect, so it gets the same fix

**Stated plainly, as the brief requires.** Its 409 handler already capped items — that half was never broken — but a deal whose constituent sold out was left standing there too, and an emptied basket was told to "review and confirm" an order that no longer existed. Both now go through the shared helper:

```ts
        const { removed, emptied } = applySoldOutRemoval(shortItems)
        ...
        } else if (emptied) {
          setMenuChangedNotice(
            `Sorry — ${shortItems.map(s => s.name).join(', ')} sold out.${removalSentence(removed, emptied)}`
          )
        } else {
          setStockNotice(...)   // unchanged, character for character
        }
```

The emptied case borrows the **menu-change surface**, which exists precisely because it renders a whole sentence unwrapped — the stock notice is a fragment inside "*We've updated your order — please review and confirm*", which is addressed to an order that still exists. **Every other pay-at-hatch refusal is byte-identical**: same state, same fragment, same words, same panel.

---

## 3. THE COPY

**The removal half is composed client-side. `promoteDraft`'s `customerMessage` is untouched.** Three reasons, in order of weight:

1. **Only the page knows what was in the basket.** The server never saw it — under authorize-then-capture the basket lives in a draft the page composed, and what a customer is *holding on screen* at refusal time is not a server fact. A server sentence claiming "we have removed X from your order" would be asserting something it cannot check.
2. **The same sentence reaches customers by routes where nothing is removed.** The Stripe redirect leg (3DS) rebuilds the page with no basket, and the late arrival after a webhook refusal likewise. Appending removal wording server-side would make the sentence **false** on both. Composed client-side, those legs get the server half alone and it still reads correctly — verified below.
3. **The brief fences `promoteDraft`.**

The page's half:

```ts
  const removalSentence = (removed: string[], emptied: boolean): string => {
    if (!removed.length) return ''
    const list = removed.length === 1
      ? removed[0]
      : `${removed.slice(0, -1).join(', ')} and ${removed[removed.length - 1]}`
    return emptied
      ? ` We have taken ${list} out of your order, which leaves it empty — close this and choose something else.`
      : ` We have taken ${list} out of your order — please check it and place it again.`
  }
```

`removed.length === 0` returns the empty string, so the server sentence is rendered exactly as it always was on every route where nothing was removed.

---

## VERIFICATION

### Exercised for real (server)

The route must name what it refused. A real draft holding **two** items the operator marked sold out this morning, a real PaymentIntent, the real route:

```
draft db8e3cea-... pi=pi_3U3wh42fB4PPCw2D1CaCVSF8 (Fish Cake + Chicken Satay, both marked sold out for this event)
[promote] hold released pi=pi_3U3wh42fB4PPCw2D1CaCVSF8 draft=db8e3cea-... (cancelled)
  HTTP 200  body={"outcome":"refused","orderKey":"db8e3cea-...",
                  "message":"Sorry — Fish Cake sold out while you were paying, so we could not place your order. No money has been taken.",
                  "soldOut":["Fish Cake","Chicken Satay"]}
  stripe: canceled   orders: 0
```

**Writes:** one `order_drafts` row (deleted) and one sandbox PaymentIntent (cancelled by the refusal itself, cannot be deleted). No order, no email — `EMAILS TRANSMITTED: 0`.

### Exercised for real (client logic, from the shipped source)

`applySoldOutRemoval`, `removalSentence` and `capBasketToRemaining` live inside the page component and cannot be imported, so they were **lexically extracted from `page.tsx` (brace-matched from their own declarations) and executed** against real basket and deal shapes with real `setState` semantics. Nothing was re-implemented: the harness runs the shipped characters.

```
EXTRACTED FROM THE SHIPPED FILE:
  capBasketToRemaining  18 lines
  applySoldOutRemoval   25 lines
  removalSentence        9 lines
```

**One item sold out, others remaining:**

```
BEFORE  items=[1x Fish Cake, 2x Pad Thai, 1x Jasmine Rice]  deals=[]
AFTER   items=[2x Pad Thai, 1x Jasmine Rice]  deals=[]
removed=["Fish Cake"]  emptied=false
CUSTOMER READS: "Sorry — Fish Cake sold out while you were paying, so we could not place your order.
                 No money has been taken. We have taken Fish Cake out of your order — please check it
                 and place it again."
```

**Two items sold out:**

```
BEFORE  items=[1x Fish Cake, 1x Chicken Satay, 1x Jasmine Rice]  deals=[]
AFTER   items=[1x Jasmine Rice]  deals=[]
removed=["Fish Cake","Chicken Satay"]  emptied=false
CUSTOMER READS: "... No money has been taken. We have taken Fish Cake and Chicken Satay out of your
                 order — please check it and place it again."
```

**Every item sold out:**

```
BEFORE  items=[1x Fish Cake, 1x Chicken Satay]  deals=[]
AFTER   items=[]  deals=[]
removed=["Fish Cake","Chicken Satay"]  emptied=true
CUSTOMER READS: "... No money has been taken. We have taken Fish Cake and Chicken Satay out of your
                 order, which leaves it empty — close this and choose something else."
```

**A deal constituent sold out** (with an unrelated item and an unrelated deal alongside):

```
BEFORE  items=[1x Jasmine Rice]  deals=[Lunch Box, Sharing Platter]
AFTER   items=[1x Jasmine Rice]  deals=[Sharing Platter]
removed=["your Lunch Box deal"]  emptied=false
CUSTOMER READS: "... No money has been taken. We have taken your Lunch Box deal out of your order —
                 please check it and place it again."
```

The unrelated deal and the unrelated item both survive. And when the deal was the whole order:

```
BEFORE  items=[]  deals=[Lunch Box]
AFTER   items=[]  deals=[]
removed=["your Lunch Box deal"]  emptied=true
```

**A pay-at-hatch partial cap — unchanged behaviour:**

```
BEFORE  items=[5x Pad Thai, 1x Jasmine Rice]  deals=[]
server said: [{"name":"Pad Thai","remaining":2}]
AFTER   items=[2x Pad Thai, 1x Jasmine Rice]  deals=[]
removed=[]  emptied=false   removalSentence: ""
```

Capped to 2, nothing removed, no appended sentence — so `setStockNotice` renders the words it always did.

### Described from code, not exercised

- **The rendered panel and its position.** Asserted from the file's own structure (line numbers above); rendering the page end to end needs a dev server, which the brief forbids.
- **`sheetScrollRef.current?.scrollTo({ top: 0 })`** — a DOM call with no DOM in the harness.
- **The Stripe-redirect leg's copy.** `paymentFailedNotice` is seeded from the query string and `removalSentence` never runs, so the customer reads the server sentence alone: *"Sorry — Fish Cake sold out while you were paying, so we could not place your order. No money has been taken."* Correct, because on that leg nothing was removed — the basket did not survive the round trip.

---

## NON-ASCII CENSUS

| File | Total before | Total after | Distinct before | Distinct after | Vocabulary |
|---|---|---|---|---|---|
| `app/api/payments/return/route.ts` | 305 | 310 | 6 | 6 | `─—🔴⚠️✅` unchanged |
| `app/trucks/[slug]/order/page.tsx` | 2696 | 2855 | 39 | 39 | `─🔴⇒—⚠️→·●×…’§≤✏≠🎁£📝−–←😕🚚🚫📡⏸🕐⏳✓ⓘ≥⟷⟺✕⌄⚡▾📎` unchanged |

**No file gained a character class.** No other file was modified.

---

## FLAGS

- **Nothing in the prompt arrived garbled**, and no instruction contradicted another.
- ⚠️ **The pay-at-hatch path was changed, deliberately and narrowly**, because the deal half and the emptied-basket message are the same defect from the other direction — which the brief explicitly allows and asks to be stated. Its item capping and its own notice wording are byte-identical.
- ⚠️ **A deal is removed whole rather than partly.** If an operator would rather the customer kept the bundle and swapped the slot, that is a different design and a bigger one — it needs the deal editor to open pre-filled on the missing slot. Recorded, not built.
- ⚠️ **The removal cannot happen on the redirect leg** (Stripe took the browser away for 3DS): the basket did not survive, so there is nothing to remove and the sentence correctly says nothing about it.
