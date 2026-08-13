# The card refusal is handled where the customer is

READ-ONLY DIAGNOSIS, THEN BUILD. 13 August 2026.

**No `next dev`, no `next build`, no commit, no deploy. No migration is needed and none was written.**

**Two files changed**, both of them the ones producing the bad landing:

```
app/api/payments/return/route.ts | 115 ++++++++++++++++++++++++++++++++++-----
app/trucks/[slug]/order/page.tsx |  60 +++++++++++++++++++-
2 files changed, 159 insertions(+), 16 deletions(-)
```

`npx tsc --noEmit` exits 0. Nothing on the WHAT NOT TO TOUCH list was touched: the stock guard, `promoteDraft`'s refusal logic and its `customerMessage`, the pay-at-hatch path, capture, the sweeps and the ledger are all byte-identical. The `page.tsx` diff is **two hunks**, and `git diff` contains **zero** references to `stockNotice`, `capBasketToRemaining` or `data?.stock`.

---

# DIAGNOSIS

## 1. WHAT BUILT THE `payment_failed` REDIRECT

**QUOTED.** `app/api/payments/return/route.ts`, the `case 'refused'` arm, as it stood:

```ts
      const url = new URL(menuUrl)
      url.searchParams.set('payment_failed', res.customerMessage)
      return NextResponse.redirect(url.toString(), { status: 303 })
```

with `menuUrl` built at the top of `GET` from the only two things in the return URL:

```ts
  const draftKey = req.nextUrl.searchParams.get('draft')
  const truck = req.nextUrl.searchParams.get('truck') ?? ''
  const base = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? req.nextUrl.origin
  const menuUrl = `${base}/trucks/${encodeURIComponent(truck)}/order`
```

**Why it carries no event.** The return URL is composed by the client as `/api/payments/return?draft=<key>&truck=<slug>` — nothing more. The route therefore knows the truck and the draft and **not the event**, and `/trucks/<slug>/order` with no `?event_id=` is the truck's **event picker**. The event id does exist — on the draft row, `order_drafts.event_id` — and was simply never read.

🔴 **A second half of this that was not in the report of it.** `paymentFailedNotice` renders inside `{formSheetOpen && (` (`page.tsx:2596`), so on a fresh document the sentence is seeded into state from the query string and **renders nowhere** until the customer happens to open the order sheet. The message survived in the URL; on screen it was invisible.

## 2. HOW THE PAY-AT-HATCH REFUSAL IS HANDLED

**QUOTED.** `page.tsx:1653` (unchanged by this build):

```ts
      if (res.status === 409 && data?.stock) {
        const shortItems = Array.isArray(data.items) ? data.items : []
        capBasketToRemaining(shortItems)
        ...
          setStockNotice(...)
        // Refresh stock_remaining badges from the authoritative menu read.
        if (event?.id) {
          fetch(`/api/menu/${slug}?event_id=${event.id}`, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.menu) { setMenu(d.menu); if (d.truck) setTruck(d.truck) } })
            .catch(() => null)
        }
        return
      }
```

**What it renders and where:** an amber panel inside the order sheet, beside the pause and menu-change notices (`page.tsx:2916`). **What happens to the basket:** it is capped to what remains and otherwise **kept** — no navigation, no page replacement, the sheet stays open, the customer edits and presses again.

🔴 **And the surface the card path needs already sits two panels above it**, in the same block (`page.tsx:2902`):

```tsx
              {paymentFailedNotice && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4 flex items-start gap-2">
                  <p className="flex-1 text-red-800 text-sm font-medium">{paymentFailedNotice}</p>
                  <button onClick={() => setPaymentFailedNotice(null)} ...>✕</button>
                </div>
              )}
```

The component, the placement and the copy shape were all already correct. **Only the route to it was wrong.**

## 3. CAN THE CARD PATH REACH THAT HANDLING? YES — MORE OFTEN THAN THE DESIGN ASSUMED

**QUOTED.** `page.tsx:1508-1524`:

```ts
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      })
```

🔴 **`redirect: 'if_required'`.** For an ordinary card with no 3DS step, Stripe **does not navigate**: `confirmPayment` resolves in the page, and the very next line was

```ts
      window.location.href = returnUrl
```

So the customer **was still on the page**, with the basket, the slot, the details and the event all in memory — and the code threw that away before knowing whether it needed to. What the client knows at that moment: the authorisation succeeded and nothing else. Promotion has not run yet; the refusal is decided afterwards, by whichever of the redirect or the webhook claims the draft.

There are three arrivals, not one:

| | How it arrives | Is the customer present? | Is the basket alive? |
|---|---|---|---|
| **A** | `confirmPayment` resolved in page (no 3DS) | **yes** | **yes, in memory** |
| **B** | Stripe redirected the browser (3DS, wallets) | yes, on a **fresh document** | no — the page was rebuilt |
| **C** | Only the webhook ran (tab closed) | no | no |

## 4. THE DESIGN QUESTION

- **A needs no navigation at all.** Everything the in-place surface requires is already on screen. It needs the *outcome*, not a new page.
- **B cannot be handled in place** — the document that held the basket is gone. It needs a landing page that is *their event* and a message that is *visible*, which is the redirect plus `event_id` plus opening the sheet.
- **C has nobody to tell.** The refusal is durable on the draft (`promotion_failed_at`, `promotion_failure_reason`) and the hold is already released.

**Can one mechanism serve both?** One *decision* can; one *response shape* cannot. The route already computes the outcome; a browser following a redirect cannot render JSON, and a live page should not be destroyed to read a sentence. So the outcome is computed once and rendered two ways — 303 for a navigation, JSON for a caller that asked. That is the whole change.

🔴 **And the diagnosis turned up a worse case than the one reported.** The webhook fires on `payment_intent.amount_capturable_updated`, which Stripe emits the instant the customer authorises — the same instant the return request starts. Losing that race is ordinary, and `promoteDraft` tells the loser only `{ status: 'already' }` (`promote-draft.ts:124-127`). The route treated `already` as success and sent the customer to `?confirm=<key>`. **When the winner had refused, that is a confirmation screen polling for sixty seconds for an order that will never exist** — strictly worse than the event picker, and reachable by exactly the same customers.

## 5. THE BASKET

**QUOTED — there is no persistence.** `grep -n "localStorage\|sessionStorage" page.tsx` returns **nothing**. The basket is React state.

- **Case A:** alive, because the page never unloaded. It survived Stripe entirely — the Payment Element is an iframe in this document.
- **Cases B and C:** gone by construction, and no change here can recover it.

---

# BUILD

## 6. THE CUSTOMER STAYS IN THEIR ORDER — WHAT WAS REUSED

**Reused, not rebuilt:** `paymentFailedNotice` (state, panel, dismiss button, red styling, server sentence rendered whole), the stock branch's **menu re-fetch**, and the existing card teardown states. **No new component, no new response field on the pay-at-hatch path, and not one new sentence of customer copy.**

`page.tsx`, replacing the unconditional navigation:

```ts
      let outcome: { outcome?: string; orderKey?: string; message?: string } | null = null
      try {
        const r = await fetch(`${returnUrl}&json=1`, { cache: 'no-store' })
        outcome = r.ok ? await r.json() : null
      } catch (fetchErr) {
        console.error('[order] could not read the promotion outcome — falling back to the redirect:', fetchErr)
      }
      if (!outcome?.outcome) { window.location.href = returnUrl; return }

      if (outcome.outcome === 'refused') {
        setPayment(null)
        setPayStage('idle')
        setPayError(null)
        setStageOpen(false)
        setPaymentFailedNotice(outcome.message || 'We could not place your order. No money has been taken.')
        if (event?.id) {
          fetch(`/api/menu/${slug}?event_id=${event.id}`, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.menu) { setMenu(d.menu); if (d.truck) setTruck(d.truck) } })
            .catch(() => null)
        }
        return
      }

      window.location.href = `${window.location.origin}/trucks/${encodeURIComponent(slug)}/order?confirm=${encodeURIComponent(outcome.orderKey || payment.orderKey)}`
```

Four things this is careful about:

- **`payment` is dropped, not kept.** `closePaymentStage()` deliberately *preserves* the authorisation for a customer who backed out — but this authorisation has been **cancelled** by `promoteDraft`. Keeping it would re-present a dead intent on the next tap. Clearing it makes the card button run `submitOrder` afresh, which is what "retryable" has to mean here.
- **The basket is untouched.** No `setBasket`, no capping: nothing sold out *in this basket's terms* that the customer must accept — the item is simply gone from the menu, which the re-fetch shows them.
- **The notice clears itself on retry.** `submitOrder` already calls `setPaymentFailedNotice(null)` at the top (`page.tsx:~1588`), so the next attempt cannot sit under a stale panel. Nothing was added for that.
- **Any failure to ask falls back to the navigation it replaces.** A network blip must never strand a customer whose card is authorised, and the route is idempotent.

**And the route, which now answers in either shape:**

```ts
  const wantsJson = req.nextUrl.searchParams.get('json') === '1'
  const reply = (redirectTo: string, payload: Record<string, unknown>) =>
    wantsJson ? NextResponse.json(payload) : NextResponse.redirect(redirectTo, { status: 303 })
```

Every existing exit became a `reply(...)` with the same URL it already produced, so **case B behaves exactly as before except for the event id** and no other caller can tell the difference.

## 7. CARRYING THE EVENT

**How:** from the draft, which is the only thing that still knows.

```ts
/** The refusal landing URL: the customer's own event, then the sentence. Both or neither is wrong. */
function refusedUrl(menuUrl: string, eventId: string | null, message: string): string {
  const url = new URL(menuUrl)
  if (eventId) url.searchParams.set('event_id', eventId)
  url.searchParams.set('payment_failed', message)
  return url.toString()
}
```

`?event_id=` is **the page's existing deep-link** (`page.tsx:218-222`, "Per-event deep-link… → scope the page to that event"), so nothing on the page had to learn a new parameter.

**And the message is now visible on arrival** — one initialiser, in the same idiom the notice itself uses:

```ts
  const [formSheetOpen, setFormSheetOpen] = useState(!!paymentFailedParam)
```

Absent the parameter this is the `false` it has always been.

## 8. THE CUSTOMER WHO IS NOT THERE

**What I did:** made the *late* arrival correct. `already` no longer means "success":

```ts
    case 'already': {
      const outcome = await refusalOnDraft(draftKey)
      if (!outcome.refused) {
        return reply(`${menuUrl}?confirm=${encodeURIComponent(draftKey)}`, { outcome: 'confirmed', orderKey: draftKey })
      }
      const message = messageForRecordedReason(outcome.reason)
      ...
      return reply(refusedUrl(menuUrl, outcome.eventId, message), { outcome: 'refused', orderKey: draftKey, message })
    }
```

`refusalOnDraft` reads the draft **and** the orders table, because an order settles it: if one exists this draft promoted, whatever else is recorded on it. The draft row is durable, so a customer who returns to that URL an hour later gets the refusal rather than a confirmation screen that never fills in.

⚠️ **What I did NOT do, and why.** A customer who closes the tab and never returns to the return URL is reachable only by **email**, and there is no email on the refusal path. Adding one means editing `promoteDraft`'s refusal branches — explicitly fenced off by this brief. **Flagged, not built.**

⚠️ **One unhappy duplication, declared.** `promoteDraft` composes the customer's sentence and returns it but does **not persist** it — only the machine reason (`stock: Fish Cake`) reaches the draft. So the late case has to rebuild the wording, and `messageForRecordedReason` in the route repeats four sentences character for character. The DRY fix is to persist the sentence or export one builder both sides call, and **both mean editing promoteDraft's refusal path**. The function carries that warning in its own docstring.

---

# VERIFICATION

Against the real `GET` of `/api/payments/return`, real drafts, real `promoteDraft`, and the real Stripe sandbox. Emails intercepted at `globalThis.fetch` before any import; **zero transmitted**. The sold-out fixtures are the operator's own toggles from this morning (`Fish Cake`, `Chicken Satay`), read and never written.

### A card refusal with the customer present (case A)

```
[promote] hold released pi=pi_3U3wSq2fB4PPCw2D026wyAAh draft=01e00817-... (cancelled)
HTTP 200  content-type=json
body={"outcome":"refused","orderKey":"01e00817-...",
      "message":"Sorry — Fish Cake sold out while you were paying, so we could not place your order. No money has been taken."}
stripe: canceled   order rows: 0
```

**Step by step, what the customer sees:** they tap Pay · £6.00 → the Element authorises without leaving the page → the page asks the route for the outcome → the payment overlay closes → **the red panel appears in the order sheet they are already looking at**, carrying that exact sentence → the menu behind it refreshes and Fish Cake is gone → **their basket, slot, name, email and event are all still there**, and the Place order button submits afresh. No navigation happened at all.

### A card refusal where the customer has left (cases B and C)

**B — Stripe redirected the browser:**

```
HTTP 303
Location: https://www.hatchgrab.com/trucks/test-kitchen/order
          ?event_id=a79a8313-005b-496f-82eb-764b69489d39
          &payment_failed=Sorry+%E2%80%94+Chicken+Satay+sold+out+while+you+were+paying%2C+...
  event_id       = a79a8313-005b-496f-82eb-764b69489d39
  payment_failed = "Sorry — Chicken Satay sold out while you were paying, so we could not place your order. No money has been taken."
stripe: canceled
```

**What they see:** their **event**, not the picker; the order sheet **open**; the red panel with the sentence. The basket is gone — the document was rebuilt — and nothing can change that.

**C — the webhook refused first and the customer arrives afterwards:**

```
webhook promoteDraft -> refused (stock: Fish Cake)
[promote:redirect] draft=0a5a6532-... not claimed — already promoted, or no such draft
[payments/return] draft=0a5a6532-... was already REFUSED by the other trigger (stock: Fish Cake) —
                  telling the customer instead of sending them to a confirmation that will never fill in.
return (json=1)   -> {"outcome":"refused","orderKey":"0a5a6532-...","message":"Sorry — Fish Cake sold out while you were paying, ..."}
return (redirect) -> 303 .../order?event_id=a79a8313-...&payment_failed=Sorry+%E2%80%94+Fish+Cake+sold+out+...
```

🔴 **Before this change both of those returned `?confirm=<key>`** — a confirmation screen polling for an order that will never exist. A customer who never returns at all is not reached; see §8.

### Success is unchanged

```
[promote:redirect] PROMOTED draft=654a97a0-... -> order #65 truck=test-truck slot=17:00 status=confirmed
return (json=1)   -> {"outcome":"confirmed","orderKey":"654a97a0-..."}
return (redirect) -> 303 https://www.hatchgrab.com/trucks/test-kitchen/order?confirm=654a97a0-...
order created: {"id":"65","order_key":"654a97a0-...","status":"confirmed","total":3.5}
```

Same URL, character for character, as before. *(The harness never confirmed that intent at Stripe, so capture logged `expired` — an artifact of the harness, not of this change.)*

### A pay-at-hatch refusal — unchanged

**Proved structurally rather than re-run**, because running the page needs `next dev`, which the brief forbids:

```
$ git diff -U0 app/trucks/[slug]/order/page.tsx | grep "^@@"
@@ -387 +387,8 @@      <- the formSheetOpen initialiser
@@ -1522,2 +1529,49 @@   <- inside payCard, replacing window.location.href

$ git diff app/trucks/[slug]/order/page.tsx | grep -c "stockNotice\|capBasketToRemaining\|data?.stock"
0
```

Two hunks, both inside the card flow. The 409 handler at `:1653`, `capBasketToRemaining`, `setStockNotice` and the amber panel are untouched, so a pay-at-hatch customer sees exactly what they saw yesterday: **"Sorry — only 0 Fish Cake left now. We've updated your order — please review and confirm."**, basket capped, sheet open, retry in place.

⚠️ **Declared limit of this verification.** The route legs ran for real; the client legs are verified by reading the diff and by the route contract they consume. Rendering the order page end to end requires a dev server.

### EVERY WRITE, AND THE CLEANUP

| Write | Undone? |
|---|---|
| 4 `order_drafts` rows (harness drafts) | **yes** — `drafts: 0` |
| 4 Stripe PaymentIntents on the sandbox connected account | **all cancelled**; sandbox intents cannot be deleted: `pi_3U3wSq2fB4PPCw2D026wyAAh`, `pi_3U3wSr2fB4PPCw2D0CBlsr3Q`, `pi_3U3wSt2fB4PPCw2D0uE2asdC`, `pi_3U3wSu2fB4PPCw2D0Dklq4Ee` |
| 1 real order (#65, the success case) + its slot booking | **yes** — deleted and `rebuildProductionSlotUsage` re-run; `orders: 0` |
| Display number 65 | 🔴 **not reversible** — the per-event counter does not go backwards. Declared. |
| `event_item_stock` / `menu_items_db` | **not written at all** — the sold-out fixtures were the operator's own rows |

```
leftovers: {"drafts":0,"orders":0}
EMAILS TRANSMITTED: 0 (intercepted 1)
```

---

## NON-ASCII CENSUS

| File | Total before | Total after | Distinct before | Distinct after | Vocabulary |
|---|---|---|---|---|---|
| `app/api/payments/return/route.ts` | 228 | 305 | 6 | 6 | `─—🔴⚠️✅` unchanged |
| `app/trucks/[slug]/order/page.tsx` | 2627 | 2696 | 39 | 39 | `─🔴⇒—⚠️→·●×…’§≤✏≠🎁£📝−–←😕🚚🚫📡⏸🕐⏳✓ⓘ≥⟷⟺✕⌄⚡▾📎` unchanged |

**No file gained a character class.** No other file was modified — `lib/stock-guard.ts` (188 / 3) is the previous build's work, now committed as `6fdd9cd`, and is untouched here.

---

## FLAGS

- **Nothing in the prompt arrived garbled**, and no instruction contradicted another.
- 🔴 **A worse case than the one reported was found and fixed in passing:** the loser of the webhook race treated `already` as success and sent refused customers to a confirmation screen that polls for sixty seconds for an order that will never exist. Same customers, same refusal, and it was not visible in the URL the report was based on.
- 🔴 **The message was invisible on the redirect leg**, not merely misplaced — `paymentFailedNotice` renders inside a sheet that starts closed. Fixed by the initialiser; worth knowing, because "the message survived" was true of the URL and not of the screen.
- ⚠️ **Copy is duplicated in two files** for the late-arrival case only, because `promoteDraft` does not persist the sentence it composes. The DRY fix is fenced off by this brief. See §8.
- ⚠️ **Nothing reaches a customer who never returns.** Email is the only channel and it lives behind the same fence.
