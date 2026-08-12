# `app/trucks/[slug]/order/page.tsx` — measured

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. Nothing extracted, nothing refactored, no plan proposed — this is the measurement, as asked.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

⚠️ **ONE CORRECTION TO THE PREMISE, UP FRONT.** The brief says *"roughly 2,300 lines"*. **It is 2,750.** Reported before anything else because every ratio below is against the real figure.

---

# 🔴 THE ANSWER IN ONE PARAGRAPH

**It is mostly genuine product surface, but not entirely — and the dead parts are concentrated, not scattered.**

**2,750 lines: 1,998 code (72.6%), 581 comment (21.1%), 172 blank (6.3%).** ~57% sits inside a JSX expression. **17 distinct features**, the largest three costing 335, 210 and 190 lines. That accounts for the bulk honestly.

🔴 **BUT: the entire discount-code feature is DEAD.** `applyCode` has zero call sites, `setDiscountInput` has zero call sites, so `appliedCode` is permanently `null`, `discountAmt` is permanently `0`, and the render branch `{discountAmt > 0 && …}` **can never be true**. **Four functions have zero call sites, one state variable is write-only, one is never set, and three imports are unused.**

---

## 1. Exact line count, and where the bulk is

**Source: QUOTED.**

```
$ wc -l app/trucks/[slug]/order/page.tsx
    2750
```

```
total=2751   blank=172   line-comment=376   block-comment=205   code=1998
comment lines total = 581  (21.1%)
code lines          = 1998  (72.6%)
```

⚠️ **21% comment is high for a React component and is a deliberate house property** — most of it is incident-history and rule-statement, not restatement of the code.

### Top-level regions

| Lines | Count | What |
|---|---|---|
| **1-157** | **157** | Module scope: 23 imports, 12 interfaces/types, and **six helper functions** (`getBundleAvailabilityMessage`, `calcDealOriginalPrice`, `cap`, `groupPreorderLabel`, `makeCartKey`, `eventToVillage`) |
| **158-346** | **189** | Component open, `use(params)`, the sticky-stack geometry, and 🔴 **the state block — 58 `useState` pairs** |
| **347-592** | **246** | `fetchSlots`, 13 effects, the hour/minute memos |
| **593-845** | **253** | Basket ops, grouped menu, upsells, deals, totals |
| **846-921** | **76** | 🔴 **`orderBreakdownEl`** — a JSX constant, not a component |
| **922-1131** | **210** | Queue-aware ASAP, backward-occupancy fit, discount, contact validation |
| **1132-1245** | **114** | 🔴 **`submitOrder`** — the single largest function |
| **1246-1468** | **223** | Render branches 1-3 + `eventsRetryCard` |
| 🔴 **1469-2622** | 🔴 **1,154** | 🔴 **THE MAIN FORM — 42% of the file in one return** |
| **2623-2750** | **128** | Six module-scope components: `ItemNoteInput`, `Shell`, `Hdr`, `Sec`, `Fld`, `QBtn` |

### The four render branches — all early returns

```
  :1246  if (loading) return <Shell>…Loading menu…</Shell>              1 line
  :1248  if (error && !submitted) return ( … )                         ~34 lines
  :1283  if (submitted) return ( … the confirmation … )                135 lines
  :1469  return ( … the main form … )                                1,154 lines
```

🔴 **THE BULK IS ONE JSX RETURN.** Lines 1469-2622 are 42% of the file, and 66% of everything after the component opens.

---

## 2. Every hook

**Source: QUOTED.** Counts are `grep`-derived; ⚠️ **read counts for generic identifiers (`name`, `event`, `error`, `notes`, `total`) are INFLATED by unrelated property accesses like `menuItem.name`** — flagged where it matters.

### `useState` — 58 pairs

| Line | Holds | reads | writes | Flag |
|---|---|---|---|---|
| 186 | `demoBannerH` | 2 | 2 | |
| 197 | `truck` | 113* | 3 | |
| 204 | `menu` | 79* | 2 | |
| 205 | `activeCategory` | 5 | 1 | |
| 207 | `showAllergenModal` | 1 | 2 | |
| 208 | `events` | 34* | 2 | |
| 209 | `event` | 141* | 2 | |
| 210 | `eventLoading` | 7 | 4 | |
| 211 | `noEvents` | 2 | 3 | |
| 215 | `eventsError` | 4 | 4 | |
| 216 | `reloadKey` | 4 | 2 | |
| 217 | `loading` | 3 | 1 | |
| 218 | `error` | 18* | 3 | |
| 221 | `pauseNotice` | 2 | 5 | |
| 224 | `stockNotice` | 2 | 3 | |
| 226 | `rechecking` | 2 | 2 | |
| 230 | `eventEnded` | 8 | 2 | |
| 231 | `submitting` | 2 | 2 | |
| 232 | `submitted` | 2 | 1 | |
| 237 | `payByCard` | 4 | 1 | |
| 239 | `cardFallbackNotice` | 1 | 1 | |
| 240-247 | `submittedOrderId`, `…AutoAccepted`, `…ConfirmedSlot`, `…RequestedSlot`, `…SlotChanged`, `…AsapEstimate` | 2-10 | 1 each | ⚠️ **six variables written once, in one block** |
| 248 | `isScrolled` | 1 | 1 | |
| 250 | `summaryExpanded` | 2 | 1 | |
| 252 | `formSheetOpen` | 3 | 3 | |
| 256 | `sheetSummaryExpanded` | 2 | 1 | |
| 257 | `footerHeight` | 2 | 2 | |
| 262 | `viewportH` | 2 | 1 | |
| 316 | `basket` | 94* | 6 | |
| 317 | `appliedDeals` | 18 | 3 | |
| 318 | `dealModalOpen` | 1 | 3 | |
| 319 | `selectedBundleForModal` | 2 | 1 | |
| 320 | `itemModal` | 23 | 5 | |
| 321 | `modalMods` | 9 | 4 | |
| 322 | `modalNotes` | 4 | 4 | |
| 324 | `modalUpsells` | 5 | 4 | |
| 🔴 **325** | **`discountInput`** | 1 | 🔴 **0** | 🔴 **NEVER SET — `setDiscountInput` has zero call sites** |
| 326 | `appliedCode` | 4 | 2 | ⚠️ both writes are inside dead `applyCode` |
| 🔴 **327** | **`discountError`** | 🔴 **0** | 2 | 🔴 **WRITE-ONLY — never read anywhere** |
| 328-330 | `name`, `email`, `phone` | 131*/17/9 | 1 each | |
| 331-332 | `slotHour`, `slotMinute` | 6/2 | 5 each | |
| 333 | `availableSlots` | 9 | 2 | |
| 334 | `loadingSlots` | 1 | 2 | |
| 336 | `eventTz` | 13 | 1 | |
| 339 | `nowTick` | 7 | 1 | |
| 340 | `asapChosen` | 9 | 4 | |
| 341 | `queueByCat` | 6 | 1 | |
| 342 | `serverCatConfigs` | 8 | 1 | |
| 345 | `capacityInputs` | 21 | 1 | |
| 346 | `notes` | 19* | 1 | |

### `useRef` — 4

| Line | Ref |
|---|---|
| 181 | `demoBannerRef` — measured by a `ResizeObserver` |
| 258 | `footerRef` — measured for `footerHeight` |
| 265 | `menuTopRef` — scroll anchor |
| 266 | `categoryScrollMounted` — a first-render guard |

### `useMemo` — 12

`availableHours` (351) · `availableMinutes` (368) · `asapSlot` (427) · `groupedMenu` (737) · `menuCategories` (745) · `upsellSuggestions` (770) · **the totals destructure** (823) · `customerAsapTime` (930) · `basketByCat` (1036) · `unfittableSlots` (1047) · `backwardAsap` (1071)

### `useCallback` — 1

`refetchMenu` (540)

### `useEffect` / `useLayoutEffect` — 13

187 (demo banner resize) · 274 · **284 `useLayoutEffect`** · 292 · 302 (scroll/resize/orientation) · 419 (30 s clock tick) · 433 · 438 (visibilitychange slots refetch) · 449 (events fetch + retry) · 522 (event selection from `?event_id`) · 552 (initial menu fetch) · 569 (30 s menu poll) · 1101

⚠️ **Seven have cleanups** (193, 299, 309, 421, 445, 515, 585); six do not.

---

## 3. Every function, and whether it is called

**Source: QUOTED.** Reference counts are `grep -c` minus the declaration.

| Function | Lines | Refs | Called from |
|---|---|---|---|
| 🔴 **`getBundleAvailabilityMessage`** | 83-98 | 🔴 **0** | 🔴 **NOTHING** |
| `calcDealOriginalPrice` | 99-106 | 2 | `:1348` (confirmation), `:1698` (deals card) |
| `cap` | 110 | 12 | throughout the JSX |
| `groupPreorderLabel` | 116-128 | 2 | the menu render |
| `makeCartKey` | 129-139 | 3 | `addItem`, the modal edit path |
| `eventToVillage` | 140-157 | 2 | `:1617`, `:1641` |
| `fetchSlots` | 394-418 | 2 | the slots effect, the visibility effect |
| `optionAddBlocked` | 593-600 | 3 | `addItem`, the stepper |
| `optionRemainingFor` | 601-603 | 1 | the item row |
| `addItem` | 604-618 | 6 | modal, stepper, upsells |
| `removeItem` | 619-635 | 2 | stepper, basket rows |
| `capBasketToRemaining` | 636-655 | 1 | the 409-stock branch in `submitOrder` |
| `getQty` | 656-658 | 1 | the item row |
| `openItemModal` | 659-671 | 3 | item row, edit, upsell |
| `toggleModalMod` | 672-676 | 2 | the modal |
| `toggleModalUpsell` | 677-680 | 1 | the modal |
| `confirmAddFromModal` | 681-736 | 1 | the modal's Add button |
| `getItemUpsells` | 751-769 | 1 | `openItemModal` |
| 🔴 **`maxDealsApplicable`** | 787-795 | 🔴 **0** | 🔴 **NOTHING** |
| `dealsApplied` | 796-797 | 1 | the deals card |
| `addDeal` | 798-802 | 1 | the deals card |
| `handleApplyDeal` | 803-810 | 1 | `<DealsModal onApply>` |
| `removeDeal` | 811-819 | 1 | the applied-deal row |
| 🔴 **`getSlotOptions`** | 820 | 🔴 **0** | 🔴 **NOTHING** |
| `toMins` | 1027-1031 | 4 | the fit calculations |
| 🔴 **`applyCode`** | 1110-1116 | 🔴 **0** | 🔴 **NOTHING** |
| `handleSubmitClick` | 1130 | 1 | the Place-order button |
| `submitOrder` | 1132-1243 | 1 | `handleSubmitClick` |
| `refetchMenu` | 540-551 | 3 | its effect, the pause "Check again" |
| `ItemNoteInput` | 2623-2663 | 1 | the item modal |
| `Shell` | 2664-2667 | 9 | every render branch |
| `Hdr` | 2668-2725 | 10 | every render branch |
| `Sec` | 2726-2734 | 4 | the main form |
| `Fld` | 2735-2746 | 5 | the main form |
| `QBtn` | 2747-2750 | 2 | the stepper |

### 🔴 FOUR FUNCTIONS WITH ZERO CALL SITES

```tsx
function getBundleAvailabilityMessage(b: Bundle): string | null {   // 83-98,  16 lines
```
```tsx
  const maxDealsApplicable = (bundle: Bundle) => {                  // 787-795,  9 lines
```
```tsx
  const getSlotOptions = (cat: string) => basket.filter(b => b.menuItem.category === cat).map(b => b.menuItem)   // 820, 1 line
```
```tsx
  const applyCode = () => {                                          // 1110-1116, 7 lines
    if (!menu) return
    const found = menu.codes.find(c => c.code === discountInput.trim().toUpperCase())
    if (found) { setAppliedCode(found); setDiscountError('') }
    else { setAppliedCode(null); setDiscountError('Code not recognised') }
  }
```

**33 lines, four functions, zero callers.**

---

## 4. Dead code, dead state, unreachable branches

**Source: QUOTED.**

### 🔴 (a) THE DISCOUNT-CODE FEATURE IS ENTIRELY DEAD — and it is a chain, not an isolated symbol

Every reference to it in the whole file:

```
325:  const [discountInput, setDiscountInput] = useState('')
326:  const [appliedCode, setAppliedCode] = useState<DiscountCode | null>(null)
327:  const [discountError, setDiscountError] = useState('')
823:  const { itemsTotal, dealsTotal, dealSavings, subtotal, discountAmt, total } = useMemo(() => {
832:      appliedCode
910:      {discountAmt > 0 && (
912:          <span className="text-green-600">Code: {appliedCode?.code}</span>
1110:  const applyCode = () => {
1112:    const found = menu.codes.find(c => c.code === discountInput.trim().toUpperCase())
1157:          discountCode: appliedCode?.code || null,
```

🔴 **THE CHAIN, EACH LINK QUOTED:**

1. **`setDiscountInput` has ZERO call sites**, so `discountInput` is permanently `''`. **There is no discount input field rendered anywhere** — a grep finds no `<input>` bound to it.
2. **`applyCode` has ZERO call sites**, so `setAppliedCode` never runs and **`appliedCode` is permanently `null`**.
3. `calculateOrderTotal`'s discount arm is `if (discountCode) { … }`, so **`discountAmt` is permanently `0`**.
4. 🔴 **THEREFORE `{discountAmt > 0 && (` at `:910` IS A CONDITIONAL THAT CAN NEVER BE TRUE:**

```tsx
      {discountAmt > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-green-600">Code: {appliedCode?.code}</span>
          <span className="text-green-600 font-medium">-£{discountAmt.toFixed(2)}</span>
        </div>
      )}
```

5. **And the submit body always sends `discountCode: null` and `discountAmt: 0`** (`:1157-1158`).

⚠️ **`menu.codes` is still fetched, typed (`DiscountCode` at `:49`) and shipped by `/api/menu` — for a consumer that no longer exists on this page.**

### 🔴 (b) `discountError` — SET BUT NEVER READ

```
327:  const [discountError, setDiscountError] = useState('')
```
**0 reads. 2 writes, both inside the dead `applyCode`.**

### ⚠️ (c) THREE UNUSED IMPORTS

Of 61 imported identifiers, **three are never referenced in the body**:

```tsx
import { calculateOrderTotal, calculateDealOriginalPrice, formatModifiers } from '@/lib/order-calculations';
```
🔴 **`calculateDealOriginalPrice` is imported and never used** — the file calls `calcOrigPrice`, the alias of the **`lib/deal-utils`** version, instead.

**Plus `getCatConfig` and `catCookSecs`**, imported and unreferenced.

### (d) Not established

⚠️ **I did not find a fifth category of unreachable code** — no `if (false)`, no post-`return` statements, no impossible type narrowings. **Not established** that none exists; I searched for the named classes rather than proving absence.

---

## 5. Duplicated logic

**Source: QUOTED.**

### 🔴 `makeCartKey` — THREE BYTE-IDENTICAL COPIES

```
app/trucks/[slug]/order/page.tsx:129    function makeCartKey(itemName: string, mods: { name: string }[], notes?: string): string {
app/dashboard/[token]/page.tsx:126      function makeCartKey(itemName: string, mods: { name: string }[], notes?: string): string {
components/dashboard/AddOrderPanel.tsx:51 function makeCartKey(itemName: string, mods: { name: string }[], notes?: string): string {
```

⚠️ **`lib/order-repricing.ts:20-26` already documents this**: *"the three duplicated makeCartKey helpers … all byte-identical"*. **Known, recorded, not fixed.**

### 🔴 `calculateDealOriginalPrice` — TWO NEAR-IDENTICAL LIB COPIES, PLUS A LOCAL WRAPPER

**`lib/order-calculations.ts:51-62`:**
```ts
  export function calculateDealOriginalPrice(
    slots: Record<string, string>,
    menuItems: MenuItem[]
  ): number {
    return Object.values(slots).reduce((sum, itemName) => {
      if (!itemName) return sum
      const item = menuItems.find(i => i.name === itemName)
      return sum + (item?.price || 0)
    }, 0)
  }
```

**`lib/deal-utils.ts:143-151`:**
```ts
  export function calculateDealOriginalPrice(
    slotSelections: Record<string, string>,
    menuItems: MenuItem[]
  ): number {
    return Object.values(slotSelections).reduce((sum, itemName) => {
      const item = menuItems.find(m => m.name === itemName)
      return sum + (item?.price || 0)
    }, 0)
  }
```

⚠️ **The only difference is the `if (!itemName) return sum` guard.** 🔴 **The page imports BOTH** — one under an alias it uses, one it does not use at all.

**And wraps one of them locally, `:99-106`:**
```tsx
function calcDealOriginalPrice(deal: AppliedDeal, menuItems: MenuItem[]): number {
  if (deal.bundle.original_price !== null && deal.bundle.original_price > 0) {
    return deal.bundle.original_price
  }
  return calcOrigPrice(deal.slots, menuItems)
}
```

### ⚠️ `toMins` — EIGHT COPIES REPO-WIDE

```
app/trucks/[slug]/order/page.tsx:1027      app/api/dashboard/route.ts:384
app/api/slots/[truckId]/route.ts:203       lib/slot-display.ts:78
lib/slot-generation.ts:16                  lib/event-conflicts.ts:45
lib/seed-demo-orders.ts:114 (toMinsLocal)  components/dashboard/DayLoadStrip.tsx:20
```

⚠️ **A four-line `"HH:MM" → minutes` helper.** Trivial individually; **eight** is the observation.

---

## 6. Features, and what each costs

**Source: QUOTED** for the line ranges; **INFERRED** for the attribution, since regions overlap.

| # | Feature | ~Lines | Where |
|---|---|---|---|
| 1 | 🔴 **Menu browse** — categories, sticky tabs, sub-groups, thumbnails, descriptions, min-height padding | **~335** | 1742-2076 |
| 2 | 🔴 **Slot picking** — ASAP vs chosen time, hour/minute dropdowns, unfittable slots, grace | **~210** | 2130-2281 + 351-392 + 1047-1100 |
| 3 | 🔴 **The item modal** — modifier groups, required-group rules, notes, upsells | **~190** | 659-736 + modal JSX |
| 4 | **The confirmation** | **~135** | 1283-1417 |
| 5 | **Order submit + every failure branch** (423 paused, 403 ended, 409 retry, 409 stock, card) | **~114** | 1132-1245 |
| 6 | **Queue-aware ASAP + backward-occupancy fit** | **~110** | 922-1100 |
| 7 | **Deals** — cards, apply, remove, savings | **~105** | 787-821 + 1660-1741 |
| 8 | **Basket ops** — add/remove/cap, option pools, per-variant rows | **~100** | 593-658 + 2029-2074 |
| 9 | **The bottom-sheet form overlay** | **~90** | 2090-2129 + sheet state |
| 10 | **Event selection + picker + retry card** | **~85** | 449-521 + 1565-1655 |
| 11 | **The order breakdown** (`orderBreakdownEl`) | **~76** | 846-921 |
| 12 | **The sticky footer with expandable summary** | **~75** | 2384-2460 |
| 13 | **Pre-order labelling** | **~60** | 116-128 + inline pills |
| 14 | **Allergen surface** — modal, chips, verification notice | **~55** | 1746-1756 + chips |
| 15 | **Contact form + validation** | **~50** | 2282-2325 + 1122-1129 |
| 16 | **Pause / closed / time-not-set banners** | **~50** | 1473-1564 |
| 17 | ✅ **The card-payment choice** | **~40** | 233-247 + 1205-1229 + 2333-2372 |
| — | 🔴 **DEAD: the discount code** | 🔴 **~20** | 325-327, 910-915, 1110-1116 |

🔴 **SEVENTEEN LIVE FEATURES. The size IS largely explained by the feature count** — no single feature is disproportionate, and the top three (menu browse, slot picking, item modal) are 735 lines between them, all irreducibly product surface.

⚠️ **What is NOT explained by feature count:** 581 comment lines, 33 lines of uncalled functions, ~20 lines of dead discount code, and the fact that all seventeen live in **one component**.

---

## 7. JSX versus logic

**Source: QUOTED** measurement; **INFERRED** interpretation.

### By region

```
  lines    count   jsx-ish  other   region
   1-157     157        1     143   module scope
 158-346     189       23     158   component open + state
 347-592     246        0     222   effects + fetchSlots + memos
 593-845     253        2     224   basket/menu/deals/totals logic
 846-921      76       33      42   orderBreakdownEl
 922-1131    210        4     185   ASAP, fit, discount, submit-prep
1132-1245    114        0     111   submitOrder
1246-1468    223      100     108   render branches + retry card
1469-2622   1154      440     662   MAIN FORM
2623-2750    128       50      68   module-scope components
```

### Two honest ways to state it, and they differ

| Measure | Result |
|---|---|
| **Lines that CONTAIN a JSX tag** | **653 of 2,578 non-blank = 25.3%** |
| 🔴 **Lines that SIT INSIDE a JSX return expression** (846-921, 1246-1468, 1469-2622, 2623-2750) | 🔴 **~1,581 of 2,750 = ~57%** |

🔴 **~57% OF THE FILE IS INSIDE JSX; only ~25% of lines actually carry a tag.** ⚠️ **The gap is the answer to the question:** the JSX is **verbose rather than dense** — the other ~32% is `className` strings, inline ternaries, and comments *inside* the markup. **The main form alone is 1,154 lines carrying 440 tag-bearing lines.**

⚠️ **The heuristic is a regex on `</?Tag`, `/>`, `{/*`** — it will miss a bare attribute continuation and catch a comparison operator in a string. **Treat both figures as ±5%.**

---

## 8. Blocks extractable with no behaviour change

**Source: QUOTED** for the ranges; **INFERRED** for the prop lists. 🔴 **NOTHING EXTRACTED — identification only.**

| # | Block | Lines | Would need passed in |
|---|---|---|---|
| 1 | ✅ **`orderBreakdownEl`** | **846-921 (76)** | `basket`, `appliedDeals`, `menu`, `itemsTotal`, `dealsTotal`, `dealSavings`, `subtotal`, `discountAmt`, `total`. 🔴 **Already a standalone JSX constant with no hooks — the cleanest candidate in the file** |
| 2 | ✅ **`eventsRetryCard`** | **1455-1468 (14)** | `eventLoading`, `onRetry`. **Already a constant** |
| 3 | ✅ **The confirmation branch** | **1283-1417 (135)** | the six `submitted*` values, `basket`, `appliedDeals`, `menu`, `total`, `email`, `truckName`, `slug`, `cardFallbackNotice`, `selectedSlot`. ⚠️ **Reads no hooks of its own and is already an early return** |
| 4 | ✅ **The item modal** | **~1900-2076** | `itemModal`, `modalMods`, `modalNotes`, `modalUpsells` + four setters, `addItem`, `optionAddBlocked`. ⚠️ **Owns four state values that could move WITH it** |
| 5 | ✅ **Pause / closed / time-not-set banners** | **1473-1564 (92)** | `orderingTimeNotSet`, `isClosed`, `eventEnded`, `isPaused`, `truck`, `stickyTop`, `rechecking`, `refetchMenu` |
| 6 | ✅ **The card-payment choice** | **2333-2372 (40)** | `cardPaymentsReady`, `payByCard`, `setPayByCard` |
| 7 | ✅ **The sticky footer summary** | **2384-2460 (77)** | `total`, `basket`, `summaryExpanded`, `setSummaryExpanded`, `footerRef`, `orderBreakdownEl` |
| 8 | ✅ **The menu list** | **1742-2076 (335)** | `groupedMenu`, `selectedCategory`, `menuCategories`, `setActiveCategory`, `basket`, `addItem`, `removeItem`, `getQty`, `openItemModal`, `menuTopRef` — 🔴 **the largest block, but also the widest prop surface** |
| 9 | ✅ **The deals section** | **1660-1741 (82)** | `menu.bundles`, `appliedDeals`, `dealsApplied`, `addDeal`, `removeDeal`, `calcDealOriginalPrice` |

🔴 **CLEANEST FIRST: #1 and #2 are already standalone constants with no hooks** — they read only values already in scope, and each is a `const x = (<JSX/>)` that could become a component with a props object and nothing else.

⚠️ **#8 is the biggest win by line count and the worst by coupling** — ten props, several of them functions that close over `basket`.

⚠️ **The six components at 2623-2750 already prove the pattern works in this file.**

---

## 9. `?paid=1` and other dead parameters

**Source: QUOTED.**

### 🔴 `?paid=1` IS NOT REFERENCED ON THIS PAGE

```
$ grep -n "paid=1" app/trucks/[slug]/order/page.tsx
  (no matches)
```

The page reads exactly one search parameter:

```tsx
  const searchParams = useSearchParams()
  const eventIdParam = searchParams.get('event_id')
```

✅ **`event_id` is live and load-bearing** — the deep-link that scopes the page to one event (`:518-521`, `:401`, `:541`, `:573`).

🔴 **`?paid=1` is written by `app/api/stripe/checkout/route.ts:147` as the `success_url` query and READ BY NOTHING.** Its destination, `app/order/[id]/manage/page.tsx`, imports `useParams` and **not `useSearchParams`** — a grep for `searchParams` in that file returns nothing. **It is a dead parameter across the whole product, not just this page.**

### Other dead or inert flags on this page

| Flag | Status |
|---|---|
| 🔴 **`discountInput`** | 🔴 **Permanently `''`** — no setter call site |
| 🔴 **`appliedCode`** | 🔴 **Permanently `null`** — only written by dead `applyCode` |
| 🔴 **`discountError`** | 🔴 **Write-only** |
| ⚠️ `payByCard` | **Defaults `true`** but is only read alongside `truck?.card_payments_ready`, which is false for eleven of twelve trucks — **inert in practice, not dead in code** |
| ⚠️ `menu.codes` | Fetched and typed; **its only consumer is the dead `applyCode`** |

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — `wc -l` and a scripted comment/code split. Region boundaries are **QUOTED** from section markers |
| 2 | **QUOTED** — every hook enumerated by grep; read/write counts scripted. ⚠️ Generic-identifier inflation flagged |
| 3 | **QUOTED** — declarations and reference counts. The four zero-call functions are **QUOTED negative greps** |
| 4 | **QUOTED** — every link in the discount chain, the write-only state, the unused imports |
| 5 | **QUOTED** — all three `makeCartKey` copies, both `calculateDealOriginalPrice` bodies, all eight `toMins` |
| 6 | **QUOTED** line ranges; **INFERRED** attribution where regions overlap |
| 7 | **QUOTED** measurement, two figures given because they answer differently; **INFERRED** interpretation. ⚠️ ±5% |
| 8 | **QUOTED** ranges; **INFERRED** prop lists |
| 9 | **QUOTED** — negative greps on both files |

## Not established

- **Whether any code is unreachable beyond the discount branch.** I searched for named classes (`if (false)`, post-return, impossible narrowing) and found none — that is not a proof of absence.
- **Exact JSX-vs-logic percentages.** Two defensible measures are given (25.3% tag-bearing, ~57% inside a JSX expression) because a single number would misrepresent it.
- **Whether the three unused imports were ever used** — that needs a git-history sweep I did not run.
- **Whether `getBundleAvailabilityMessage`, `maxDealsApplicable` and `getSlotOptions` are recent orphans or long-dead.** Same reason.
- **Whether extracting any block would preserve behaviour under React's rendering semantics.** The prop lists are read off the code; **nothing was extracted or tested**, as instructed.
