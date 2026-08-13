# One sold-out sentence, two paths, one place that writes it

COPY AND POSITION. 13 August 2026.

**No `next dev`, no `next build`, no commit, no deploy. No migration.**

> ⚠️ **TWO BRIEFS ARRIVED FOR THIS WORK** — the second (copy **and position**, both paths) supersedes and extends the first (copy only, card path). This report answers the second in full; nothing from the first was left half-applied.

**Four files changed, one created:**

```
lib/payments/sold-out-copy.ts    | NEW — the only place the sentence is written
lib/payments/promote-draft.ts    |  17 +++-
app/api/payments/return/route.ts |  26 ++---
app/trucks/[slug]/order/page.tsx |  89 ++++++++--------
```

`npx tsc --noEmit` exits 0. The guards, the refusals, the hold release, the no-order outcome, capture, promotion, the sweeps and the ledger are untouched.

---

## ESTABLISHED FIRST: WHAT EACH PATH RENDERED, AND WHERE

**They did not share a component.** Two states, two colours, two positions, and — until this change — two different sentences for one event.

### The card path (before)

Composed of **two halves**:

**The server half** — `promoteDraft`, `lib/payments/promote-draft.ts`, quoted as it stood:

```ts
          return { status: 'refused', orderKey, reason: `stock: ${names}`, cancelled,
                   customerMessage: `Sorry — ${shortfall[0].name} sold out while you were paying, so we could not place your order. No money has been taken.` }
```

⚠️ **`shortfall[0].name` — the FIRST name only**, while the page removed every one of them.

**The client half** — `removalSentence` in `page.tsx`, appended to it:

```ts
    return emptied
      ? ` We have taken ${list} out of your order, which leaves it empty — close this and choose something else.`
      : ` We have taken ${list} out of your order — please check it and place it again.`
```

Rendered in `paymentFailedNotice`, a **red** panel at the top of the sheet.

### The pay-at-hatch path (before)

`page.tsx`'s 409 handler, quoted:

```ts
        } else if (emptied) {
          setMenuChangedNotice(
            `Sorry — ${shortItems.map(s => s.name).join(', ')} sold out.${removalSentence(removed, emptied)}`
          )
        } else {
          setStockNotice(
            shortItems.length
              ? shortItems.map(s => `only ${s.remaining} ${s.name} left`).join(', ')
              : 'some items just sold out'
          )
        }
```

`stockNotice` is a **fragment** slotted into a wrapper sentence — the rendered result being *"Sorry — only 0 Fish Cake left now. We've updated your order — please review and confirm."* — in an **amber** panel **~290 lines lower in the sheet, directly above the Place order button**.

🔴 **So a sold-out item produced "only 0 Fish Cake left"** on this path: the count wording applied to a thing that has no count left.

---

## 1 & 2. THE TWO SENTENCES

**One builder, `lib/payments/sold-out-copy.ts`, with one variable clause:**

```ts
export function soldOutRefusalMessage(names: string[], stage: SoldOutStage): string | null {
  const named = names.map(n => n.trim()).filter(Boolean)
  if (!named.length) return null
  const pronoun = named.length === 1 ? 'it' : 'them'
  const money = stage === 'paying' ? ' and have not taken any money' : ''
  return `${joinNames(named)} sold out while you were ${stage}. We've removed ${pronoun}${money} — please check your order before placing it again.`
}
```

**Card:** *"Prawn Cracker & Sweet Chili dip sold out while you were **paying**. We've removed it **and have not taken any money** — please check your order before placing it again."*

**Pay at hatch:** *"Prawn Cracker & Sweet Chili dip sold out while you were **ordering**. We've removed it — please check your order before placing it again."*

**"ordering" is used as specified, and it reads correctly for a refusal on tapping Place order.** Alternatives were considered and are worse: *"while you were choosing"* is untrue (they had finished choosing), and *"just now"* drops the causal link the sentence needs.

🔴 **The money clause is absent on the hatch path for the stated reason, and its absence is enforced by the type**, not by a caller remembering: `stage` is `'paying' | 'ordering'` and only `'paying'` emits it.

### What "pluralise" resolves to — a reading, stated because the instruction is ambiguous

**"sold out" is past tense and invariant** — *"Fish Cake sold out"*, *"Fish Cake and Prawn Toast sold out"* — which is what the brief's own example shows. **The word that pluralises is the pronoun: "it" → "them".** That is what the builder does. If a different reading was meant, it is a one-line change in one file.

**Names join naturally:** `A` · `A and B` · `A, B and C`.

### ONE wording, no branching

The **emptied basket has no separate string.** `removalSentence` — which held it — **is deleted**; there is no `emptied` branch left in any copy path. One item, several items and an emptied basket read identically.

### Conventions used

- **Apostrophe: ASCII `'` (U+0027)** in `We've` — proved by inspection of the shipped line. This matches `lib/email.ts` throughout (`We're still confirming your payment`, `We've received your order`).
- **Dash: em dash `—` (U+2014)**, the codebase's universal mid-sentence dash.
- **No new character class in any file** — see the census.

---

## WHERE THE CHANGE WAS MADE, AND WHY THERE

| Route to the customer | Who composes it now |
|---|---|
| Card, customer present (JSON outcome) | `promoteDraft` → the builder |
| Card, Stripe 3DS redirect (`?payment_failed=`) | `promoteDraft` → the builder |
| Card, the other trigger refused first | `/api/payments/return` → **the same builder**, rebuilt from the recorded reason |
| Pay at hatch (409, no server sentence exists) | `page.tsx` → **the same builder** |

🔴 **The sentence had to move into `promoteDraft`'s `customerMessage`**, because that is the half that reaches the two legs where the page is not there to append anything. Composing it client-side would have left the old wording alive on the 3DS and late-webhook legs — the exact "other variant" this brief asks me to eliminate.

🔴 **And `promoteDraft` now names EVERY refused line**, not `shortfall[0]`:

```ts
                   customerMessage: soldOutRefusalMessage(shortfall.map(s => s.name), 'paying') ?? GENERIC_REFUSAL }
```

✅ **The duplication recorded in the previous report is closed.** `/api/payments/return`'s `messageForRecordedReason` no longer re-writes the sold-out wording; it parses the names and calls the builder.

**The page appends nothing:**

```ts
        applySoldOutRemoval((outcome.soldOut ?? []).map(name => ({ name, remaining: 0 })))
        setPaymentFailedNotice(outcome.message || 'We could not place your order. No money has been taken.')
```

---

## 3. POSITION ON THE PAY-AT-HATCH PATH

**It renders at the top of the sheet, immediately under the header, beside the card refusal** — a new `soldOutNotice` panel, because `stockNotice` is a fragment inside a wrapper written for a cap and `menuChangedNotice` describes a different event.

**Measured, from the shipped file:**

```
sheet opens                : 2730
🔴 paymentFailedNotice     : 2767   (card refusal, red)
🔴 soldOutNotice           : 2783   (pay-at-hatch refusal, amber)   <- NEW POSITION
payment step               : 2800
pause / stock / menuChanged: 3070 / 3077 / 3088
Place order button         : 3104
```

**It does not push anything important off screen.** The sheet is `max-h-[90vh] overflow-y-auto`; the panel is two lines and `mb-4`; the review, the fields and Place order keep their order and are reached by the same scroll. It renders **only when there is a refusal**, so an ordinary order sees the sheet unchanged — at any viewport width, since the panel is a full-width block that wraps.

**And the sheet is scrolled to it**, because the customer pressed a button at the bottom of a sheet whose scroll position persists:

```ts
        sheetScrollRef.current?.scrollTo({ top: 0 })
```

⚠️ **Amber, not red, and that is the one deliberate difference between the two panels.** Red on this page means *"your card was authorised and released"*. Nothing was authorised on the hatch path, and borrowing the colour would raise the money question the wording is careful not to raise.

---

## 4. DOES THE PAY-AT-HATCH PATH REMOVE THE ITEM?

**Found: yes for items, no for deals — and that was fixed in the preceding build, not this one.** `capBasketToRemaining` has always capped named lines to the server's `remaining` and dropped any that reach zero, so a sold-out **item** has been removed on this path all along. What it deliberately never did was **deals**, so a bundle whose constituent sold out was left standing and refused again on the next attempt.

**Both paths now go through the same wrapper**, unchanged by this brief:

```ts
        applySoldOutRemoval(shortItems)
```

which calls `capBasketToRemaining` for the item half and removes any deal holding a sold-out constituent. **Nothing about the removal behaviour was changed here.**

---

## VERIFICATION

Rendered from the shipped builder (`lib/payments/sold-out-copy.ts`, imported and executed — not transcribed):

### CARD PATH

```
one item sold out, others remaining
  "Prawn Cracker & Sweet Chili dip sold out while you were paying. We've removed it and have not taken any money — please check your order before placing it again."

two items sold out
  "Fish Cake and Prawn Toast sold out while you were paying. We've removed them and have not taken any money — please check your order before placing it again."

every item sold out (basket emptied)
  "Fish Cake, Chicken Satay and Jasmine Rice sold out while you were paying. We've removed them and have not taken any money — please check your order before placing it again."
```

### PAY AT HATCH

```
one item sold out, others remaining
  "Prawn Cracker & Sweet Chili dip sold out while you were ordering. We've removed it — please check your order before placing it again."

two items sold out
  "Fish Cake and Prawn Toast sold out while you were ordering. We've removed them — please check your order before placing it again."

every item sold out (basket emptied)
  "Fish Cake, Chicken Satay and Jasmine Rice sold out while you were ordering. We've removed them — please check your order before placing it again."
```

**The emptied case is byte-identical to the others on both paths** — there is no branch left that could differ.

**Above the fold in each case:** both panels render at lines 2767 and 2783 of a sheet whose content starts at 2730, above the payment step and ~290 lines above every other notice; the sheet is scrolled to `top: 0` when either is set.

**Who calls the builder:**

```
lib/payments/promote-draft.ts            3 call(s)   (stock, option sold out, option ceiling)
app/api/payments/return/route.ts         1 call(s)   (the late-arrival rebuild)
app/trucks/[slug]/order/page.tsx         1 call(s)   (pay at hatch)
```

### No other variant of this copy survives

```
$ grep -rn "so we could not place your order|We have taken .* out of your order|which leaves it empty|We've removed" --include=*.ts --include=*.tsx app lib

app/api/payments/return/route.ts:120:    ... `${named[0]} closed while you were paying, so we could not place your order. ...`
lib/payments/promote-draft.ts:210:      ... `Sorry — ${closed[0]} closed while you were paying, so we could not place your order. ...`
lib/payments/sold-out-copy.ts:51:      the builder itself
app/trucks/[slug]/order/page.tsx:1792: a code comment quoting "We've removed it"
```

**Two hits remain and neither is this copy: they are the CATEGORY-CLOSED refusal** (*"Starters **closed** while you were paying"*), a different event with a different fact, mirrored server-side and in the late rebuild. ⚠️ **Aligning that sentence's shape to the new one was not asked for and was not done** — flagged rather than assumed.

⚠️ **One case keeps its own words, deliberately: a partial CAP** (`remaining: 2`). The line was **reduced, not removed**, so *"We've removed it"* would be a plain untruth; it renders exactly the fragment it always did, in its original position. **A cap is not a sell-out.** ⚠️ **A mixed response** (one line at 0, another capped) reports the sell-out, because the capped line's new quantity is already on screen and the removed one is not.

---

## NON-ASCII CENSUS

| File | Total before | Total after | Distinct before | Distinct after | Vocabulary |
|---|---|---|---|---|---|
| `lib/payments/sold-out-copy.ts` | — (new file) | 132 | — | 6 | `🔴─—⚠️·` |
| `lib/payments/promote-draft.ts` | 587 | 587 | 7 | 7 | `🔴•—─→⚠️` unchanged |
| `app/api/payments/return/route.ts` | 310 | 311 | 6 | 6 | `─—🔴⚠️✅` unchanged |
| `app/trucks/[slug]/order/page.tsx` | 2855 | 2858 | 39 | 39 | `─🔴⇒—⚠️→·●×…’§≤✏≠🎁£📝−–←😕🚚🚫📡⏸🕐⏳✓ⓘ≥⟷⟺✕⌄⚡▾📎` unchanged |

**No existing file gained a character class.** The new file's set is drawn entirely from the vocabulary its neighbours in `lib/payments/` already use. ⚠️ `promote-draft.ts` is unchanged in total because the em dashes it lost from the deleted sentences are matched by the ones its new comments carry.

---

## FLAGS

- **Nothing in either prompt arrived garbled**, and no instruction contradicted another.
- ⚠️ **"Pluralise the verb" was read as pluralising the pronoun**, since *"sold out"* is invariant in the past tense and the brief's own example leaves it unchanged. Stated above; a one-line change if the other reading was meant.
- ⚠️ **A partial cap keeps its old wording** — different fact, and the new sentence would be false for it.
- ⚠️ **The category-closed refusal still reads in the old shape.** It is a different event; realigning it was not in scope.
