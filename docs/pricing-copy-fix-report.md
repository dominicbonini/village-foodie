# The unpriceable-line copy, and the dependency that makes the ordering safe

**Date:** 12 August 2026
**FIX. Four files changed, three of them comment-only in the parts that matter. No migration. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# ✅ THE TWO RESULTS

**1. The copy.** ✅ **The client stops wrapping** — the menu-change refusal gets its own notice and renders the server's sentence whole. The customer reads:

> **The menu has changed — Nutella Dream is no longer available. Please check your order before placing it.**

**2. The dependency.** ✅ Recorded at **three** ends, not two: in `loadPriceBook`, at the customer pricing call site, and at the walk-up one. §4 explains the third.

✅ **The stock message is byte-identical to HEAD and still renders.** Proved in §5, not asserted.

---

## 1. 🔴 WHICH FIX, AND WHY — THE SERVER COULD NOT SEND A FRAGMENT

The brief offered either. **Only one of them works, and it is worth saying why the other does not.**

**The wrapper, QUOTED (`app/trucks/[slug]/order/page.tsx:2452`):**

```tsx
                  <p className="flex-1 text-amber-800 text-sm font-medium">Sorry — {stockNotice} now. We&apos;ve updated your order — please review and confirm.</p>
```

🔴 **A FRAGMENT FIXES TWO OF THE THREE FAULTS AND CANNOT FIX THE THIRD.** Send `the menu has changed` and the doubled "Sorry" and the stray "now." both go away — but the sentence still ends **"We've updated your order — please review and confirm."**, and that is the fault the brief called out as FALSE. `capBasketToRemaining([])` returns at its own guard (`:728`, `if (!shortItems.length) return`); no line was removed, no quantity capped, nothing was updated. **No choice of fragment can make that clause true**, because the clause is in the template, not the fragment.

⚠️ **And the template could not simply be reworded**, because the brief forbids changing the stock guard's copy — correctly: that message is right for the case it was written for, and real customers see it far more often.

✅ **SO: THE CLIENT STOPS WRAPPING, for the menu-change case only.** A separate notice state, rendered plainly, in a panel styled identically so it reads as the same class of message. **The stock notice is untouched, down to the byte.**

⚠️ **This is not a second error surface.** Same 409, same handler, same menu re-fetch, same basket-kept behaviour, same request count. Only the words differ, which is the entire point.

---

## 2. The server change

**`app/api/orders/submit/route.ts` — BEFORE:**

```ts
      return NextResponse.json(
        {
          error: `Sorry, the menu has changed — ${first.name} is no longer available at the price shown. Please check your order.`,
          stock: true,
          items: [],
        },
        { status: 409 },
      )
```

**AFTER:**

```ts
      // A modifier is named with the dish it was on, because "Truffle Shavings" alone tells a customer
      // nothing about which line to look at.
      const label = first.kind === 'modifier' && first.on ? `${first.name} (on ${first.on})` : first.name
      return NextResponse.json(
        {
          error: `The menu has changed — ${label} is no longer available. Please check your order before placing it.`,
          stock: true,
          menuChanged: true,
          items: [],
        },
        { status: 409 },
      )
```

| Change | Why |
|---|---|
| `Sorry, ` dropped from the front | The wrapper is gone, so the sentence stands alone; "Sorry" twice was the first fault |
| `at the price shown` dropped | It described a price problem to someone who cannot see a price problem. The dish is gone; that is what to say |
| `Please check your order` → `…before placing it` | Makes clear the order was **not** placed. The old wording could read as "we placed it, go look" |
| ⚠️ **`menuChanged: true` added** | The discriminator. Both refusals arrive as `stock: true` and need the same handling but different words |
| ⚠️ **`label`** | An unpriceable **modifier** returns the option name in `first.name` and the dish in `first.on`. "Truffle Shavings" alone names nothing the customer can find |

⚠️ **Why an explicit flag and not `items.length === 0`.** `checkStockShortfall` never returns an empty array, so the inference would work today — but that is *its* invariant to keep, not this branch's to lean on. The comment says so:

```
// Do not drop it, and do not infer
// the case from `items.length === 0` instead — checkStockShortfall never returns an empty array,
// but that is its invariant to keep, not ours to lean on.
```

---

## 3. The client change

**BEFORE** (the `data.error` fallback I added in the previous task — the thing that produced the garble):

```tsx
        setStockNotice(
          shortItems.length
            ? shortItems.map(s => `only ${s.remaining} ${s.name} left`).join(', ')
            : (typeof data.error === 'string' && data.error ? data.error : 'some items just sold out')
        )
```

**AFTER** — the fallback is **removed**, restoring the stock expression to exactly what HEAD has, and the menu-change case branches away before it:

```tsx
        if (data.menuChanged) {
          setMenuChangedNotice(
            typeof data.error === 'string' && data.error
              ? data.error
              : 'The menu has changed. Please check your order before placing it.'
          )
        } else {
          setStockNotice(
            shortItems.length
              ? shortItems.map(s => `only ${s.remaining} ${s.name} left`).join(', ')
              : 'some items just sold out'
          )
        }
```

**The new render, immediately below the stock panel:**

```tsx
              {/* 🔴 THE SERVER'S SENTENCE, RENDERED WHOLE. No "Sorry — " prefix, no " now." suffix, and
                  no "We've updated your order" — because nothing was updated. Same panel styling and
                  same dismiss affordance as the stock notice above, so it reads as the same class of
                  message; only the wrapping differs, which is the entire point of it being separate. */}
              {menuChangedNotice && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4 flex items-start gap-2">
                  <p className="flex-1 text-amber-800 text-sm font-medium">{menuChangedNotice}</p>
                  <button onClick={() => setMenuChangedNotice(null)} className="text-amber-400 hover:text-amber-600 text-sm font-bold leading-none mt-0.5">✕</button>
                </div>
              )}
```

⚠️ **And it is cleared on every submit, beside the other two** — otherwise a customer who fixed a menu change and then hit a sold-out line would see both panels and not know which still applied:

```tsx
    setPauseNotice(null)
    setStockNotice(null)
    // Cleared alongside the other two, for the same reason: a notice from the PREVIOUS attempt must
    // not sit under the one this attempt produces. …
    setMenuChangedNotice(null)
```

---

## 4. The dependency comments — exact wording

### End one — `lib/order-repricing.ts`, on `loadPriceBook`

```
 * ── 🔴 EVERY QUERY BELOW FILTERS ON truck_id AND NOTHING ELSE. DO NOT ADD AN AVAILABILITY FILTER. ──
 *
 * `menu_items_db` carries is_active, is_available, stock_count and default_stock. `modifier_options`
 * carries is_active, available and stock_count. None of them is read here, and that is deliberate:
 * THIS FUNCTION ANSWERS "WHAT DOES IT COST", NOT "CAN IT BE ORDERED". Those are different questions
 * with different owners, and the price of a sold-out dish is still its price.
 *
 * ── WHY IT MATTERS AT SERVICE ──────────────────────────────────────────────────────────────────
 * Both order-creation paths price BEFORE the stock guard runs, and an unpriceable line REFUSES the
 * order (app/api/orders/submit/route.ts). A sold-out item survives pricing only because it is still a
 * row here with a name and a price; it then reaches checkStockShortfall and the customer gets that
 * guard's own message, which names the item and the number left.
 *
 * 🔴 SO ADDING `.eq('is_active', true)` OR `.eq('is_available', true)` — which reads like an obvious
 * tightening — WOULD BREAK ORDERING DURING SERVICE. Every sold-out item would become unpriceable, the
 * pricing refusal would fire first, and customers would be told the menu had changed instead of that
 * the dish had sold out. The price book must stay a STRICT SUPERSET of what the menu offers: /api/menu
 * applies `.eq('is_active', true)` and this must not, so anything orderable is always priceable.
 *
 * The one legitimate exclusion is per-dish and lives below: item_modifier_groups.excluded_option_ids
 * removes an option a dish does not OFFER, which is a question about the menu's shape, not its stock.
```

✅ **No query touched. No filter added or removed.** A doc comment above the function signature.

### End two — the customer pricing call site, `app/api/orders/submit/route.ts`

```
    // ── 🔴 THIS RUNS BEFORE THE STOCK GUARD, AND THAT IS ONLY SAFE FOR ONE REASON. ────────────────
    // The order of this route is: PRICE (here) → sold-out option backstop (:~830) → event lock →
    // checkClosedCategories → checkStockShortfall → checkOptionCeilingShortfall → INSERT. So an
    // unpriceable line refuses the order BEFORE anything has been asked about stock.
    //
    // 🔴 A SOLD-OUT ITEM MUST STILL PRICE, or the customer gets a "menu has changed" refusal in place
    // of "only 2 Margherita left" — during service, on a dish the truck deliberately ran down.
    // It does price, because loadPriceBook filters on truck_id and NOTHING else: not is_active, not
    // is_available, not available, not stock_count. Sold out is a STATE on a row that still exists, and
    // only a MISSING row (a deleted or renamed item) is unpriceable. See the header on loadPriceBook in
    // lib/order-repricing.ts, which carries the other half of this note.
    //
    // ⚠️ IF THAT EVER CHANGES, THIS ORDERING BECOMES A LIVE DEFECT. Either the price book must keep no
    // availability filter, or this block must move below checkStockShortfall. Do not change one end
    // without the other.
```

### ⚠️ END THREE — WHICH THE BRIEF DID NOT ASK FOR, AND WHY I ADDED IT

The brief said "BOTH ends" and named two. **There are two call sites, not one** — the walk-up path prices before its stock guards for exactly the same reason. Leaving it unmarked would mean the next person editing that file has no signal at all, which is the failure mode this task exists to close. It is a comment; it changes nothing. `app/api/dashboard/action/route.ts`:

```
      // 🔴 THIS RUNS BEFORE THE STOCK GUARDS HERE TOO (lock → checkClosedCategories →
      // checkStockShortfall → checkOptionCeilingShortfall → findSoldOutOption → INSERT, all below), and
      // it is safe for the SAME single reason: loadPriceBook filters on truck_id and nothing else, so a
      // sold-out item still prices and still reaches its own guard. Adding an availability filter there
      // would turn every sold-out line into a needsPriceConfirm prompt at the hatch. See the header on
      // loadPriceBook in lib/order-repricing.ts and the matching note in app/api/orders/submit/route.ts.
```

⚠️ **Flagged rather than slipped in.** If you would rather it were not there, it is one comment block to delete.

---

## 5. 🔴 VERIFICATION

Strings composed **by extracting the templates from the source**, not typed from memory.

### The exact rendered customer-facing string

```
BEFORE (server sentence spliced into the stock wrapper):
  Sorry — Sorry, the menu has changed — Nutella Dream is no longer available at the price shown. Please check your order. now. We've updated your order — please review and confirm.

AFTER (server sentence rendered whole, no wrapper):
  The menu has changed — Nutella Dream is no longer available. Please check your order before placing it.

AFTER, modifier case (label = name + the dish it was on):
  The menu has changed — Truffle Shavings (on Chicken Satay) is no longer available. Please check your order before placing it.

UNCHANGED, a real sold-out line (stock branch, untouched):
  Sorry — only 2 Margherita left now. We've updated your order — please review and confirm.
```

✅ **All three faults gone.** No doubled "Sorry". No stray "now.". **No claim that anything was updated** — and nothing was.
✅ **It says the menu has changed and asks them to check their order**, as required.

### The stock message is unchanged — proved against HEAD

```
stock fragment (per-item)    HEAD x1  NOW x1  UNCHANGED
stock fallback phrase        HEAD x1  NOW x1  UNCHANGED
stock render template        HEAD x1  NOW x1  UNCHANGED

capBasketToRemaining early-return guard present: True
```

Each pattern matched **exactly once in `git show HEAD:` and exactly once now**: `` `only ${s.remaining} ${s.name} left` ``, `'some items just sold out'`, and `Sorry — {stockNotice} now. We&apos;ve updated your order — please review and confirm.`

**And `git diff` on those lines shows only a re-indent** (they moved inside the new `else`):

```
-            ? shortItems.map(s => `only ${s.remaining} ${s.name} left`).join(', ')
-            : 'some items just sold out'
+              ? shortItems.map(s => `only ${s.remaining} ${s.name} left`).join(', ')
+              : 'some items just sold out'
```

⚠️ **The `data.error` fallback I added last task is GONE**, so the stock expression is now byte-identical to HEAD apart from indentation. **That branch is closer to HEAD after this fix than it was before it.**

**The server's stock refusal, still present and untouched** (`submit/route.ts:892`):

```ts
            { error: 'Some items just sold out', stock: true, items: shortfall },
```

### Gates

```
tsc: clean
eslint errors now:     action 19, submit 23, order page 18  — total 60
eslint errors at HEAD: action 20, submit 23, order page 18  — total 61
```

✅ **One fewer error than HEAD across the four files. Zero new.**

⚠️ **Not run:** `next build`, any deployment, any commit. **No migration** — nothing schema-shaped changed.

---

## 6. NON-ASCII CENSUS

| File | Before (total / distinct) | After (total / distinct) | New class? |
|---|---|---|---|
| `app/api/orders/submit/route.ts` | 1205 / 19 | 1240 / 19 | ✅ none |
| `app/trucks/[slug]/order/page.tsx` | 1881 / 39 | 1941 / 39 | ✅ none |
| `lib/order-repricing.ts` | 867 / 7 | 943 / 7 | ✅ none |
| `app/api/dashboard/action/route.ts` | 2657 / 16 | 2663 / 16 | ✅ none |

✅ **Every distinct set is identical to its baseline. No file gained a character class it did not already contain.**

⚠️ **`lib/order-repricing.ts` is the tight one — seven classes and no `⚠` among them** (`─ — → 🔴 · × ÷`). The comment written into it uses `🔴`, `—` and `─` only; the warning marker used freely elsewhere in this report is deliberately absent from that file.

---

## 7. What was NOT touched

| Constraint | Held? |
|---|---|
| `loadPriceBook`'s queries — no filter added or removed | ✅ **Doc comment above the signature only. Four queries byte-identical** |
| The stock guard, its copy, its ordering | ✅ **Proved byte-identical against HEAD, §5** |
| Pricing logic, the override, the server-pricing build | ✅ **Untouched.** The only server change is the 409 body's `error` string and the added `menuChanged` flag |
| Anything else | ✅ Two comment blocks, one string, one flag, one client state, one render block, one clear-on-submit line |

## Not established

- **Whether the third comment (§4, the walk-up call site) is wanted.** Added on judgement, flagged, trivially removable.
- **Whether the wording is the wording you want.** It satisfies the three stated requirements — says the menu changed, asks them to check, claims nothing — but the phrasing is mine.
- ⚠️ **Unchanged from the previous report:** `checkStockShortfall` reads `event_item_stock`'s `stock_count` and `no_item_cap` but not `available`, so an item toggled manually unavailable without an exhausted count still has no submit-side refusal. Pre-existing, out of scope here, not chased.
