# Over-capacity confirm modal — READ-ONLY readiness review

**Date:** 28 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main` @ `5208cbe`
**Nothing was changed.** No code written, no files touched except this report. Reads and `git show` only.

---

## ⚠️ FLAGGED — garbled spans in the prompt

Four spans do not parse. Not silently repaired; my reading is stated so you can correct it. None changed an answer.

| Span as written | Read as |
|---|---|
| "the current over-capacity prompt in **componeboard**/AddOrderPanel.tsx" | "**components/dash**board/AddOrderPanel.tsx" |
| "The banner's detail (cooking **windoend**, concurrency, ceiling, …)" | "cooking **window start/end**" — I answered for both `startMins` and the window's implied end |
| "what **happenen** an operator edits an order" | "what **happens when** an operator edits an order" |
| "If any span of this prompt reads **asuncated**" | "reads **as garbled or tr**uncated" |

---

## Headline

**You are not misremembering.** A richer slot-select confirmation modal existed, was a real custom component (not `window.confirm`), and was deliberately deleted on **15 June 2026** in commit `448130f "fixes"`. What replaced it is a **native `window.confirm()` at submit time**, not at slot-select time — a different moment, a different trigger, and considerably less detail.

The good news for the intended design: **the removed modal's trigger point is the one you want, and the data it consumed is still fetched and still in client state today.** The gap is not plumbing — it is that nothing currently surfaces *why*.

---

## Q1 — WHAT EXISTS NOW

### It is a native `window.confirm()`, and it fires at SUBMIT, not at slot-select

`components/dashboard/AddOrderPanel.tsx:657-710`, verbatim:

```tsx
    // ── Confirm-time LIVE capacity check (advisory — never blocks) ───────────────
    // FRESH /api/slots read (no-store) → run the SAME backward-fit engine the customer
    // page uses (projectBackwardOccupancy + fitOrderBackward, mirroring its `unfittableSlots`
    // memo) against the CHOSEN slot for THIS exact basket. The manual path books-as-chosen by
    // design, so this is purely advisory: if the basket doesn't fit, warn so the operator can
    // override (book anyway, maybe moving another customer) or cancel and re-pick. The check
    // fetch is for the CHECK ONLY — it does NOT touch the visible slot state (the post-submit
    // refetch below still refreshes the dots). FAILS OPEN — a flaky/missing check never stops a
    // manual order. skipFitCheck re-entry (the "use anyway" path + the stock-override re-entry)
    // avoids re-looping the prompt. Null/ASAP-unresolved slot → nothing to check.
    if (!skipFitCheck && effectiveSlot && manualEvent && isOnline()) {
      try {
        const p = new URLSearchParams({ date: manualEvent.event_date })
        if (manualEvent.start_time) p.set('start', manualEvent.start_time)
        if (manualEvent.end_time) p.set('end', manualEvent.end_time)
        if (manualEvent.id) p.set('event_id', manualEvent.id)
        const checkRes = await fetch(`/api/slots/${truck.id}?${p}`, { cache: 'no-store' })
        const checkData = await checkRes.json()
        const ci = checkData.capacityInputs
        const freshCfgs = checkData.catConfigs || {}
        if (ci) {
          const back = projectBackwardOccupancy(
            ci.productionSlotUnits || {},
            freshCfgs,
            ci.eventStartMins,
            ci.kitchenCapacity ?? null,
            ci.capacityWindowMins ?? 5,
          )
          // SAME now-clamp rule the panel/customer page use: now-mins for a today event,
          // -Infinity for a future-dated event (mins-of-day would mis-compare across days).
          const nowClamp = manualEvent.event_date === getLocalDateInTz(eventTz)
            ? getNowMinsInTz(eventTz)
            : Number.NEGATIVE_INFINITY
          const fit = fitOrderBackward(
            back,
            readyToMins(effectiveSlot),
            basketByCat,
            freshCfgs,
            ci.kitchenCapacity ?? null,
            ci.eventStartMins,
            ci.capacityWindowMins ?? 5,
            nowClamp,
            (ci.productionSlotUnits || {})[effectiveSlot] || {},
          )
          if (!fit.fits) {
            const proceed = window.confirm(
              `This slot is already booked up for what you're adding.\n\nUse it anyway? You may need to move another customer's slot.\n\nOK = book at ${effectiveSlot} anyway   ·   Cancel = pick another slot`
            )
            if (proceed) { await submitManual(override, true); return }
            return // Cancel — keep the basket, operator re-picks the slot
          }
        }
      } catch { /* FAIL OPEN — a flaky check must never block a manual order */ }
    }
```

### Answers

**Type:** native `window.confirm()` (`:702`). A browser-chrome dialog — no styling, no structure, no per-line detail, and on iPad it renders as a system alert the operator may well tap through.

**Exact text:**

> This slot is already booked up for what you're adding.
>
> Use it anyway? You may need to move another customer's slot.
>
> OK = book at 18:30 anyway   ·   Cancel = pick another slot

**Trigger:** the **Confirm/submit** button, inside `submitManual` (`:653`), gated on `!skipFitCheck && effectiveSlot && manualEvent && isOnline()` (`:667`). **Not** slot selection — `handleSlotChange` (`:644-646`) is now two lines and does nothing but `setManualSlot(value)`.

**What it consults:** a fresh `GET /api/slots/{truckId}` with `cache: 'no-store'` (`:673`), then `projectBackwardOccupancy` (`:678`) + `fitOrderBackward` (`:690`) **client-side**. It reads only `fit.fits` — a boolean. `fit.tone` and `fit.bound_by` (`"global ceiling"` / `"Pizza 3/2"` / `"too soon (insufficient lead)"`) are returned by the same call and **discarded**.

**On accept:** `await submitManual(override, true)` (`:705`) — re-enters with `skipFitCheck=true` so the prompt can't loop, and the order is written normally. **The acceptance is not recorded anywhere** (see Q6).
**On decline:** bare `return` (`:706`) — basket preserved, panel stays open, no state change, operator re-picks.

**Fail-open conditions** (`:709`, `catch` with an empty body — no logging):

1. `/api/slots` throws or is unreachable — network failure, 5xx, DNS.
2. The response isn't valid JSON (`checkRes.json()` throws) — an HTML error page, a proxy interstitial.
3. Any throw inside `projectBackwardOccupancy` / `fitOrderBackward`.

Plus three **silent skips before** the `try`, which aren't "fail open" but have the same effect:

4. `!isOnline()` — **offline: never checked at all** (`:667`).
5. `!effectiveSlot` — ASAP with no resolvable slot.
6. `ci` falsy — `/api/slots` returned 200 without `capacityInputs` (`:677`).

In all six cases the order is placed with no capacity prompt whatsoever. The server-side manual path has no gate either (`app/api/dashboard/action/route.ts:763-766` — *"bypasses auto_accept and ALL capacity gating"*), so this `confirm()` is the **only** capacity friction on the operator create path.

---

## Q2 — WHAT WAS REMOVED

**Confirmed removed. It was a custom JSX modal, fired at slot-select, and it explained the reason.**

### The removal

**Commit `448130f "fixes"` — Mon 15 Jun 2026 16:57 +0100** (Dominic Bonini). Touched `app/api/orders/submit/route.ts`, `app/dashboard/[token]/page.tsx`, `components/dashboard/AddOrderPanel.tsx` (−74 lines in the panel, 95 deletions overall).

The tombstone is still in the tree — `components/dashboard/AddOrderPanel.tsx:636-643`:

```tsx
  // ── slot change handler ─────────────────────────────────────────────────────
  // Operator can pick ANY visible slot (manual s.10). The ONLY confirmation is capacity
  // Operator picks a slot → place at it directly, no confirmation. The traffic-light dots already
  // show each slot's load + per-category label, so the operator reads them and makes their own call;
  // the over-capacity "This slot is too full … Use anyway?" modal was removed (operator-only friction,
  // Dominic 2026-06). The CUSTOMER path is unaffected — it's hard-blocked server-side by the same fit
  // check (an over-capacity/too-soon slot is never offered to a customer); this only drops the operator
  // prompt. Empty value clears the selection.
```

(Note lines 2–3 are a stale half-sentence from the old comment left mid-edit: *"The ONLY confirmation is capacity"* now runs straight into *"Operator picks a slot → place at it directly, no confirmation."*)

### What it was — recovered from `448130f^`

**Introduced** in `45e8c23` — *"Operator slot selector: show all slots with traffic-light + override"*, Sun 7 Jun 2026. Also touched by `54395ac`, `44fc507`, `1d3d73c`.

**The trigger** (`448130f^:components/dashboard/AddOrderPanel.tsx:486-538`) — fired on **slot change**, and built a human reason from the engine's `bound_by`:

```tsx
  const handleSlotChange = (value: string) => {
    if (!value) { setManualSlot(''); return }
    const s = manualSlots.find(sl => sl.collection_time === value)
    ...
    let reason: string | null = null
    if (s && capacityInputs) {
      const [row] = buildSlotAvailability({
        times: [{ collection_time: s.collection_time, production_slot: s.production_slot }],
        productionSlotUnits: capacityInputs.productionSlotUnits || {},
        catConfigs: serverCatConfigs,
        kitchenCapacity: capacityInputs.kitchenCapacity ?? null,
        ...
        basketByCat,
      })
      if (row && row.tone === 'red') {
        const hhmm = value.slice(0, 5)
        const bb = row.bound_by ?? ''
        // bound_by: "too soon (insufficient lead)" (run-off-front) | "global ceiling" |
        // "<Cat> x/y" (a cooking window has no spare for that category).
        if (bb.startsWith('too soon')) {
          reason = `too soon to make this order by ${hhmm}`
        } else if (bb === 'global ceiling') {
          reason = `over the kitchen's capacity around ${hhmm}`
        } else {
          const cat = bb.split(' ')[0]?.toLowerCase()
          reason = cat && basketByCat[cat]
            ? `too full to make ${basketByCat[cat]} ${capWord(cat)} by ${hhmm}`
            : `too full to make this order by ${hhmm}`
        }
      }
    }

    if (reason) { setPendingSlot({ time: value, reason }); return }
    setManualSlot(value)
  }
```

**The modal** (`448130f^:…:1191-1207`) — a real component, styled, in-page:

```tsx
      {/* ── Slot capacity confirmation ── */}
      {pendingSlot && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-4">
              <div className="text-3xl mb-2">🟡</div>
              <p className="font-bold text-slate-900 text-base">
                {`This slot is ${pendingSlot.reason}. Use anyway?`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setManualSlot(''); setPendingSlot(null) }} className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 text-sm">Cancel</button>
              <button onClick={() => { setManualSlot(pendingSlot.time); setPendingSlot(null) }} className="flex-1 bg-orange-600 text-white font-bold py-3 rounded-xl hover:bg-orange-700 text-sm">Use anyway</button>
            </div>
          </div>
        </div>
      )}
```

State: `const [pendingSlot, setPendingSlot] = useState<{ time: string; reason: string } | null>(null)` (`:170`).

### Old vs current

| | Removed modal (≤ `448130f^`) | Current `confirm()` |
|---|---|---|
| Fires at | **slot selection** | submit |
| Kind | custom JSX, styled, in-page | `window.confirm()` browser chrome |
| Says why | **yes** — 3 variants from `bound_by` | no — one fixed string |
| Names the window | `around ${hhmm}` (the collection time) | the collection time only |
| Category detail | *"too full to make 2 Pizza by 18:30"* | none |
| Data freshness | page-load `capacityInputs` (stale) | **fresh no-store fetch** |
| Cancel behaviour | clears the slot (`setManualSlot('')`) | keeps the slot, aborts submit |
| Engine | `buildSlotAvailability` (basket-inclusive) | `projectBackwardOccupancy` + `fitOrderBackward` |

**Neither ever showed** the cooking window vs the collection slot, the concurrency number, the ceiling, contributing orders, or backward spill. Those have never existed in any operator prompt — see Q3.

### Other search results

- `git log -S "too full"` → `448130f` (removal), `49a27b0` (earlier traffic-light work).
- `git log -S "Use anyway"` → 9 commits: `45e8c23` (introduction) through `448130f` (removal), plus `a74aedd`, `f560cc4`, `54395ac`, `6d13367`, `2c887c5`, `1d3d73c`, `c7cc2be`.
- **No feature flag, no early-return guard, no commented-out block, no dead props** survive in the tree. The removal was clean — only the prose tombstone at `:636-643` remains. Nothing is switched off waiting to be switched back on; it would be a re-build, not a re-enable.

---

## Q3 — WHAT DATA DOES THE CLIENT HAVE AT SLOT-SELECT TIME?

### The fetch

`AddOrderPanel.tsx:430-448` → `GET /api/slots/{truckId}?date&start&end&event_id` → `setApiCapacityInputs(data.capacityInputs)` / `setApiCatConfigs(data.catConfigs)`.

Payload — `app/api/slots/[truckId]/route.ts:277-289`:

```ts
    capacityInputs: {
      productionSlotUnits,
      kitchenCapacity,
      capacityWindowMins,
      eventStartMins,
      eventEndMins: eventEndMins ?? null,
      earliestCollectionMins,
      date,
      nowMins,
      windowSecs: (...) * 60,
    },
```

Client state: `capacityInputs` (`:195`, with an offline-cache fallback), `serverCatConfigs` (`:202`). Both already feed `slotIndicators` (`:290-300`) and `adjustedAsapSlot` (`:310-341`).

### Verdict per fact

| Fact | Status | How |
|---|---|---|
| **(a) the cooking WINDOW a slot maps to** | **derivable** | `backwardWindowStepMins(serverCatConfigs)`; window = `slotMins − step`. Both exports already imported in this file's dependency graph. `BackwardWindow.startMins`/`.start` come straight off `projectBackwardOccupancy` |
| **(b) concurrency in that window** | **derivable** | `back.byStart.get(slotMins − step)!.total` — `total` **is** `concurrencyAt(intervals, startMins)` (`lib/slot-availability.ts:736, 745`). The panel already builds `back` at `:290-300` |
| **(c) the ceiling** | **available** | `capacityInputs.kitchenCapacity`, used verbatim at `:295` |
| **(d) which existing orders contribute** | **needs a new server response field** | `/api/slots` returns `productionSlotUnits` — a **per-slot aggregate** `{ '18:30': {pizza:5} }`. Order identity is summed away before it leaves the server. The panel does receive an `orders` prop, but it has no per-window mapping, and even server-side `detectCapacityBreaches` only does a slot-string match (see Q6) |
| **(e) that units spill backward from later collection slots** | **derivable, and it's the cheapest win** | Every `CookInterval` in `back.intervals` carries `{startMins, endMins, items}`; a window's contributors are the intervals covering it. What is **not** derivable is *which stored deadline* each interval came from — `CookInterval` has no provenance field (`lib/slot-availability.ts:480-487`), and `ps` is discarded inside the seating loop. Re-deriving it from `productionSlotUnits` + `catConfigs` is a small pure loop the client could run, since it already has both inputs |

**Summary: (a)(b)(c)(e) need no new endpoint. Only (d) — order attribution — requires a server change.** And (d) has a hard limit even server-side: 5 pizzas at 18:30 is the sum of #9 and #14, so the 2 units spilling into 18:15 belong to both jointly and cannot be attributed to one order at all.

---

## Q4 — WOULD THE CLIENT'S VIEW BE CORRECT?

**Two different answers, because there are two different reads.**

### The submit-time `confirm()` — FRESH ✅

`:673` — `fetch(..., { cache: 'no-store' })`, executed at the moment the operator hits Confirm. Deliberately separate from the panel's own state; the comment at `:663-664` says so: *"The check fetch is for the CHECK ONLY — it does NOT touch the visible slot state."*

Residual window: the round-trip between that fetch and the server insert (tens to hundreds of ms). The manual insert **does** hold `acquireEventLock` (`app/api/dashboard/action/route.ts`), but it runs **no capacity check inside the lock**, so the lock doesn't close this gap for capacity. Small, and not the problem.

### The dots and everything derived from `capacityInputs` — CACHED, and can be very stale ⚠️

`fetchManualSlots` is called from exactly five places:

| Call site | When |
|---|---|
| `:499` | controlled-event change |
| `:509` | reconnect after offline |
| `:534` | panel becomes active / `manualEvent` id/date/times change |
| `:836` | after a successful submit |
| `:1580` | operator picks a different event in the picker |

**There is no poll and no realtime invalidation.** `AddOrderPanel` has no `supabase.channel` subscription and no interval touching capacity — the only interval is `:451-454`, a 30 s `nowTick` that re-evaluates *clock* state (ASAP label, `isSlotPast`) and does **not** refetch.

**So: if the panel sits open while customer orders land, the dots do not move.** Staleness is unbounded — it is however long the operator has had the panel open since the last event change or submit. In a service that is realistically minutes.

**Direct consequence for the intended design:** a slot-select modal built on `capacityInputs`, the way the removed one was (`448130f^:504` reads `capacityInputs.productionSlotUnits`), **would be exactly the "tells the operator this slot is fine from stale data" failure you named.** The removed modal had that flaw. The current `confirm()` does not, because it re-fetches. Any rebuilt modal needs the `no-store` fetch pattern from `:673`, or an invalidation the panel does not currently have.

---

## Q5 — THE EDIT PATH

### There is no capacity check. Confirmed, both ends.

**Server:** `grep -n "fitOrderBackward|earliestBackwardFitSlot|buildSlotAvailability|projectBackwardOccupancy" app/api/dashboard/action/route.ts` → **zero matches in the entire file.** The edit handler resolves items, deals, discount, writes the row, then calls `removeOrderFromProductionSlot` / `addOrderToProductionSlot` — it moves the booking without ever asking whether the destination fits.

**Client:** the edit modal has **no equivalent of `submitManual`'s check**. `submitEdit` (`app/dashboard/[token]/page.tsx:1275`) posts straight to `/api/dashboard/action` with no fit call and no fresh fetch.

### What happens

An operator raising a quantity, or dragging an order to a busier slot, writes the breach silently. There is no prompt, no toast, no server rejection. The first anyone hears of it is the red `CapacityBreachBanner` on the **next** `/api/dashboard` read — after the fact, naming only orders whose collection slot string matches, which after an edit may not include the edited order at all.

This is a strictly larger hole than Add Order, because Add Order at least has the `confirm()`.

### Does the edit modal have the same data? **Yes — the plumbing already exists.**

`fetchEditSlots` (`app/dashboard/[token]/page.tsx:1218-1232`) hits the **same** `/api/slots/{truckId}?date&event_id` endpoint and stores:

- `editCapacityInputs` (`:361`) — same shape as the panel's
- `editServerCatConfigs` (`:365`)
- `editSlots` (`:1227`)

and already runs the engine on them — `editSlotIndicators` (`:1561-1572`) calls `buildSlotIndicators(editSlots, editCapacityInputs.productionSlotUnits, editServerCatConfigs, editCapacityInputs.kitchenCapacity, editCapacityInputs.eventStartMins, categoryOrder, editCapacityInputs.capacityWindowMins)`, rendered as the per-slot dot at `:3379`.

It is a **separate fetch** from `AddOrderPanel`'s (different component, different state), but the **same endpoint, same shape, same engine**. Everything in Q3's derivable column applies identically.

**Where a check would have to sit** — findings, not a design:

- **Client, edit modal:** `submitEdit` (`:1275`), mirroring `submitManual:657-710`. Same seam as the re-price confirm that already lives there.
- **Client, slot picker:** the `<select onChange>` at `:3375-3387`, mirroring the removed `handleSlotChange`.
- **Server:** the edit handler in `app/api/dashboard/action/route.ts`, between the order update and `addOrderToProductionSlot`. Note it takes **no event lock**, so a server-side check there would carry the same race the manual path has.

Also relevant: `editCapacityInputs` is fetched once per `startEdit` (`:1235`) and never refreshed while the modal is open — **same staleness profile as Q4**.

---

## Q6 — THE BANNER'S ORIGINAL PURPOSE

`components/dashboard/CapacityBreachBanner.tsx:1-20`, verbatim:

```tsx
'use client'
// PIECE 2 — reconnect "capacity exceeded" banner (WARNING ONLY, non-blocking, dismissible).
//
// Surfaces the server-detected breaches (detectCapacityBreaches, §31) so the operator can find the
// over-subscribed slot(s) and bump/amend BY JUDGMENT. No auto-bump, no gating, no placement change.
//
// Appears whenever the authoritative production_slot_usage has a slot genuinely OVER a ceiling —
// the common cause being an offline order colliding with an online booking on the same slot while the
// truck was offline (accepted as unavoidable; §31 only asks that it be FLAGGED on reconnect). Also
// covers an operator override that pushed a slot over. Dismiss hides it until the breach set CHANGES
// (a new/worse breach re-shows), so it never nags about an already-reviewed slot.

import type { CapacityBreach } from '@/lib/capacity-breach'

/** Stable signature of the current breach set — dismiss is keyed to this so a NEW breach re-shows. */
export function breachSignature(breaches: CapacityBreach[]): string {
  return (breaches || [])
    .map(b => `${b.collection_time}:${b.over_total}:${b.over_cats.map(c => `${c.cat}${c.over}`).join(',')}`)
    .sort()
    .join('|')
}
```

**Your reading of the original purpose is confirmed by the header** — *"reconnect …"*, *"the common cause being an offline order colliding with an online booking … while the truck was offline"*. The operator-override case was folded in as a secondary (*"Also covers…"*), not the design centre.

### Can `detectCapacityBreaches` distinguish how a breach arose? **No. It has no signal to distinguish with.**

Its entire input (`lib/capacity-breach.ts:47-58`) is `times`, `productionSlotUnits`, `catConfigs`, `kitchenCapacity`, `eventStartMins`, `capacityWindowMins`, and `orders: Array<{ order_key; id; slot; status }>`.

- `productionSlotUnits` is a **per-slot aggregate** — no provenance, no order identity, no path-of-origin.
- The `orders` projection carries **four fields**, none of which records how the order was created or whether anyone acknowledged anything.

### What it would need

**No column exists today.** Verified:

- `grep -rln "capacity_override|acknowledged|over_capacity" supabase/migrations/` → **no matches**.
- The operator override that *does* exist is `manualOrder.override` — a **request-body field only**, consumed at `app/api/dashboard/action/route.ts:783` for the stock guard and **never written to the row**. The `insertPayload` (`:859-873`) has no override/acknowledgement field. An operator who taps OK on the current `confirm()` leaves **no trace whatsoever**.
- The `confirm()` at `AddOrderPanel.tsx:702` doesn't even send a flag — on accept it calls `submitManual(override, true)`, where `skipFitCheck=true` is purely a client-side re-entry guard.

So a breach caused by a deliberate, informed operator override and one caused by an offline sync collision are **byte-identical** in the data. Nothing downstream can tell them apart.

Candidate signals, as findings:

- a persisted per-order flag (a new `orders` column) set when the operator acknowledges — the only one that survives to the `orders` projection `detectCapacityBreaches` already receives;
- an event- or slot-scoped acknowledgement record keyed to the breach signature `breachSignature` already computes (`:16-21`) — note it is currently **client-only and in-memory**, so a dismissal doesn't survive a refresh;
- inferring origin from `van_id IS NULL` / `items[].cartKey` (see the channel discriminators in `docs/capacity-report.md` §9) — but that distinguishes *walk-up vs web*, **not** *acknowledged vs collided*, and a walk-up placed into a fitting slot is not a breach at all.

---

## Q7 — THE CUSTOMER PICKER

**Different mechanism, not duplicated logic — and much blunter.** The customer picker **hides** breaching slots outright. No grey-out, no badge, no warning, no override.

`app/trucks/[slug]/order/page.tsx:2138-2158`:

```tsx
                                    // PAST: ALWAYS live (isSlotPast in the event tz) — never the
                                    // cached server is_past flag (stale once the clock advances).
                                    if (isSlotPast(s, eventTz, eventDateIso)) return false
                                    if (s.too_soon) return false // prep-time constraint (not a clock one) — server flag is fine
                                    if (s.is_grace) return false
                                    // CAPACITY — basket-aware when the customer has a basket: gate on the
                                    // category-aware fitOrderBackward result (unfittableSlots), NOT the
                                    // server's basket-agnostic worst-case s.available. So a window the
                                    // worst-case dot vetoes (e.g. pizza-full 6pm) is still offered when
                                    // THIS order fits the ceiling spare (anchovies: 4 pizzas + 2 = 6 ≤ 6),
                                    // and still hidden when it doesn't (a pizza: batch full). Empty basket
                                    // ⇒ keep the server worst-case default (nothing to fit yet).
                                    if (Object.keys(basketByCat).length > 0) {
                                      if (unfittableSlots.has(s.collection_time)) return false
                                    } else if (!s.available) {
                                      return false
                                    }
```

`unfittableSlots` (`:1024-1043`) runs the **same** `projectBackwardOccupancy` + `fitOrderBackward` the operator's `confirm()` uses, per slot, over the whole list. Its header states the intent (`:1009-1012`):

> *The customer is HARD-BLOCKED from a slot whose backward cooking windows (ending at it) can't hold the order (no spare, or run-off-front) — no override on this surface.*

`45e8c23`'s message records the deliberate split: *"Customer page: no traffic-light — only cleanly available slots render; full slots hidden entirely (previously shown disabled with '· Full')."*

### Operator vs customer

| | Customer | Operator |
|---|---|---|
| Breaching slot | **removed from the list** | selectable, dot only |
| Override | **none** | yes (`confirm()`, and the server never gates) |
| Explanation shown | none — the slot silently isn't there | one fixed sentence |
| Engine | `fitOrderBackward` | `fitOrderBackward` |
| Data freshness | one page-load snapshot (`:392`), same staleness class as Q4 | fresh `no-store` at submit |
| Server backstop | yes — `earliestBackwardFitSlot` in `submit/route.ts:287`, inside the event lock | **none** |

**They share the engine, not the mechanism.** A rebuilt operator modal would be reusing `fitOrderBackward` — which both surfaces already call — but the customer side has nothing to reuse in terms of presentation: it has no explanatory UI at all, because it never asks.

Worth noting for the intended design: the *shape* the customer already has — filter, don't warn — is the opposite of informed consent, so there is genuinely nothing to lift across.

---

## What I could not verify

1. **Nothing was executed.** No `next dev`, no `next build`, no queries, no test harness. All findings are from reading the tree and `git show`.
2. **The removed modal was never rendered by me.** Its appearance and copy are read from `448130f^`, not observed.
3. **Whether `448130f` also removed a related prompt elsewhere.** It touched `app/dashboard/[token]/page.tsx` (−24) and `app/api/orders/submit/route.ts` (+21/−?) in the same commit; I traced only the `AddOrderPanel` hunks. If a sibling was removed from the dashboard page, I did not find it.
4. **`git log -S` only finds commits where the literal count changed.** A modal renamed or refactored without those strings would not surface. I searched `"too full"`, `"Use anyway"`, `"booked up"`, `"pendingSlot"`; I did not search every plausible phrasing.
5. **INFERRED — the staleness window in Q4.** That `capacityInputs` has no poll/subscription is verified by reading every `fetchManualSlots` call site and every interval in the file. How stale it gets *in practice* depends on operator behaviour, which I have not measured.
6. **INFERRED — that `window.confirm` renders as a tap-through system alert on the operator's iPad.** Standard platform behaviour; not observed on the device.
7. **Q3(d)/(e) derivability is a code-reading judgement**, not a prototype. I did not write the derivation to prove it compiles or that the numbers come out right.
