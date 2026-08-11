# Temporary operator switch — online card payments off, pay-at-hatch fallback

**Date:** 11 August 2026
**Result: BUILT. Migration written, not run. No `next dev`, no `next build`, no commit, no deploy.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE HEADLINE

**🔴 THIS CHANGE IS DEPLOY-COUPLED. THE MIGRATION MUST BE APPLIED BEFORE THE CODE SHIPS.**

The assertion at `lib/payments/paid-step.ts:93-95` — *"`trucks` is read with select('*') everywhere"* — is **TRUE for three of the four paths and FALSE for the one that matters.** `app/api/stripe/checkout/route.ts` uses a **NAMED** select. Deploying first fails that statement with 42703, `truck` comes back null, the route returns its 409, and **every card payment on every truck silently falls back to pay-at-hatch** — indistinguishable from the switch working. Full evidence in §Deploy order.

**Proven by execution:** on `test-truck` (the only truck with `stripe_charges_enabled = true`), setting the column flips `offered` from **`true` to `false`** at **both** gates with `stripe_charges_enabled` untouched — and across all 12 trucks with no column present, the new resolver disagrees with the old expression **0 times**.

---

## The whole feature — 7 files, and that is the complete list

| File | Change |
|---|---|
| 🆕 `supabase/migrations/20260811_trucks_online_payments_paused_at.sql` | the column |
| 🆕 `lib/payments/online-payments-switch.ts` | **the ONE resolver** |
| `app/api/menu/[truckId]/route.ts` | gate 1 (rendering hint) |
| `app/api/stripe/checkout/route.ts` | gate 2 (authoritative) |
| `app/api/dashboard/action/route.ts` | the write action |
| `app/dashboard/[token]/page.tsx` | control + persistent banner |
| `components/dashboard/types.ts` | one optional field on `TruckData` |

✅ **A repo-wide grep for `online_payments_paused_at` or `online-payments-switch` returns exactly these 7 files and nothing else.** The removal list in the migration is therefore complete, and I verified it as a search rather than asserting it.

---

## 1. The migration — `20260811_trucks_online_payments_paused_at.sql`

```sql
alter table trucks
  add column if not exists online_payments_paused_at timestamptz;
```

✅ **Nullable, NO default**, as specified. Every existing row is NULL; NULL means **ENABLED**. No backfill — and none is possible to need, since there is no prior column whose meaning has to be carried forward.

**The migration carries, in its header:** the value semantics, the run-order warning with the named-select evidence, a note that the switch does **not** self-expire and why that is deliberate, an instruction **not** to wire it into the webhook, and 🔴 **the seven-step removal list naming every file to delete or revert**, plus the `drop column`.

**And on the column itself:**

```sql
comment on column trucks.online_payments_paused_at is
  'TEMPORARY (added 2026-08-11). NULL = online card payments offered; a timestamp = an operator paused '
  'them, and when. Read ONLY through lib/payments/online-payments-switch.ts. Truck-wide, does not '
  'self-expire, dashboard-only control. Delete with the switch — see this migration for the file list.';
```

⚠️ **The comment lives on the column so it is discoverable from `psql`, not only from a file someone has to know to open.**

---

## 2. The resolver — one function, one file, no other home

`lib/payments/online-payments-switch.ts` — **the entire exported surface:**

```ts
export function resolveOnlineCardPayments(
  operator: { stripe_charges_enabled?: boolean | null } | null | undefined,
  truck: { online_payments_paused_at?: string | null } | null | undefined,
): { offered: boolean; pausedAt: string | null } {
  const pausedAt = truck?.online_payments_paused_at == null ? null : String(truck.online_payments_paused_at)
  return {
    offered: operator?.stripe_charges_enabled === true && pausedAt === null,
    pausedAt,
  }
}
```

**One export. Structural types on the parameters, so callers pass whatever slice of the row they selected — no shared interface for anything else to import and depend on.**

🔴 **`== null`, NOT `=== null`, AND IT IS LOAD-BEARING.** It is true for **both** `null` (never paused) and `undefined` (the column does not exist yet). `=== null` would read a pre-migration truck as **paused** and switch every card off. The file says so in place so nobody "tightens" it.

⚠️ **Not added to `lib/payments/paid-step.ts`, as instructed** — and the file records why: that resolver answers a permanent, per-event, in-person question with eight callers; folding this in would turn a delete into surgery. `paid-step.ts` is byte-unchanged (**verified**: `grep -c` for the new names returns 0).

⚠️ **`pausedAt` is returned as well as `offered`** because the checkout route logs it and the dashboard reads it. Both facts, one call, no second lookup.

---

## 3. Both gates

### Gate 1 — `app/api/menu/[truckId]/route.ts` (rendering hint)

```diff
-    cardPaymentsReady = op?.stripe_charges_enabled === true
+    cardPaymentsReady = resolveOnlineCardPayments(op, truck).offered
```

✅ **`truck` there is `select('*')`, so this path is TOLERANT** — pre-migration the column is `undefined` and the resolver reads it as not-paused.

### Gate 2 — `app/api/stripe/checkout/route.ts` (authoritative)

```diff
-      .select('id, name, operator_id')
+      .select('id, name, operator_id, online_payments_paused_at')
```

```diff
-    if (!operator?.stripe_account_id || operator.stripe_charges_enabled !== true) {
+    const cards = resolveOnlineCardPayments(operator, truck)
+    if (!operator?.stripe_account_id || !cards.offered) {
+      if (cards.pausedAt) {
+        console.log(
+          `[stripe/checkout] order=${orderKey} truck=${truck.id} — online payments PAUSED by the operator ` +
+          `since ${cards.pausedAt}; falling back to pay-at-hatch`,
+        )
+      }
       return NextResponse.json({ error: 'Card payment is not available', notReady: true }, { status: 409 })
     }
```

🔴 **THE 409 SHAPE IS IDENTICAL** — same `error` string, same `notReady: true`, same status. **No new fallback was built.** `app/trucks/[slug]/order/page.tsx:1195-1215` already handles exactly this shape: the order is placed unpaid, and `setCardFallbackNotice(true)` tells the customer. **That path is untouched.**

⚠️ **A pause is logged, an un-ready account is not** — the two are operationally different and only one is a decision somebody made.

---

## 4. The dashboard control — deliberately OUTSIDE the per-event card

I read the house rule at `app/dashboard/[token]/page.tsx:3245-3255` before placing this:

> *"🔴 DO NOT ADD PER-EVENT SCOPE WORDING TO THESE ROWS. **SCOPE IS A PROPERTY OF THE SCREEN, NOT OF EACH SETTING.**"*

🔴 **That rule is exactly why this control cannot go in that card.** Every row in it is per-event, which is what lets the rule hold. A truck-wide row inside it would make **every neighbouring row's scope a silent lie.** So it sits in its **own separated block immediately after** the card, with its own heading and explicit scope copy — and the code says why, so nobody "tidies" it back in.

### The control

```tsx
                  <p className="text-sm font-semibold text-slate-800">Take card payments online</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Turn this off during a card problem and customers will place orders as normal and pay at the hatch instead. Orders keep coming; only the card step stops.
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    This applies to your whole truck, on every event, and stays off until you turn it back on.
                  </p>
                  {truck?.online_payments_paused_at&&(
                    <p className="text-xs font-semibold text-amber-700 mt-1.5">
                      Off since {String(truck.online_payments_paused_at).slice(0,10)}
                    </p>
                  )}
```

✅ **The copy states both required facts plainly: "your whole truck, on every event" and "stays off until you turn it back on."**

⚠️ **NOT gated on `activeEvent`**, unlike every toggle above it. A truck-wide switch must be reachable during an incident whether or not an event is selected. It **is** gated on `isOffline`.

### 🔴 The persistent indicator — on every tab

Placed **outside `<main>`**, so it renders on Orders, Add, Stock and Settings alike, and is not inside the scroll container the Add tab manages itself:

```tsx
      {truck?.online_payments_paused_at&&(
        <div className="w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto px-4 pt-3">
          <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-amber-500">⚠️</span>
              <p className="text-sm font-medium text-amber-800">
                Card payments are off — customers are paying at the hatch. This stays off, on every event, until you turn it back on.
              </p>
            </div>
            <button onClick={()=>saveOnlinePaymentsPaused(false)} disabled={isOffline||savingOnlinePaymentsPause}
              className="text-sm font-semibold text-amber-700 border border-amber-300 bg-white rounded-lg px-3 py-1.5 hover:bg-amber-50 whitespace-nowrap">
              Turn back on
            </button>
          </div>
        </div>
      )}
```

✅ **It carries the way out, not just the warning** — the same save path as the toggle, so there is one write, not two.

⚠️ **Reuses the existing amber `⚠️` + white-button vocabulary** from the "No event selected" banner at `:2645`. No new component, no new colour.

⚠️ **NO `toLocaleString` ANYWHERE.** This is a client component that Next also renders on the server, and a locale-formatted date is a hydration mismatch. The date is rendered by `.slice(0,10)` off the ISO string — deterministic, no locale, no clock. **The card shows the day; the banner shows none, because it does not need one to do its job.**

### The save handler — server-confirmed, not optimistic

```tsx
      const d=await res.json().catch(()=>({}))
      setTruck(t=>t?{...t,online_payments_paused_at:d?.online_payments_paused_at??null}:t)
```

✅ **State is set from the timestamp the SERVER minted**, so the "Off since" line can never disagree with the row.

---

## 5. The write action — same contract as `set_show_paid_step_override`

`app/api/dashboard/action/route.ts`:

```ts
    if (action === 'set_online_payments_paused') {
      const { value } = body
      if (typeof value !== 'boolean') {
        return NextResponse.json({ error: 'value must be true or false' }, { status: 400 })
      }
      const { data: rows, error } = await supabase.from('trucks')
        .update({ online_payments_paused_at: value ? new Date().toISOString() : null })
        .eq('id', truck.id)
        .select('*')
      if (error) {
        console.error('[set_online_payments_paused] update failed:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({
        success: true,
        online_payments_paused_at: rows?.[0]?.online_payments_paused_at ?? null,
      })
    }
```

| Contract element from `:1591-1613` | Followed? |
|---|---|
| **Validated, not coerced** (`!!value` would read a typo'd string as `true`) | ✅ — `typeof value !== 'boolean'` → 400 |
| **`select('*')`, never a named list** (42703 fails the whole statement) | ✅ |
| **No `.single()`** (PGRST116 would turn a no-op into a 500) | ✅ |
| **Row absent still means success** | ✅ |
| **Returns the value so the client sets state from the response** | ✅ |

🔴 **ONE DELIBERATE DEPARTURE, AND IT IS A SECURITY ONE.** `set_show_paid_step_override` returns the whole `truck_events` row. **This does not return the whole `trucks` row** — `trucks` carries the dashboard token and PIN, which `/api/dashboard` strips through `publicTruckFields` before anything reaches a browser. **Only the one column is echoed back**, which is all the client needs.

⚠️ **No `null` in the vocabulary.** The three per-event overrides accept `null` for "inherit". This column has no third state — `false` **is** the un-paused value — so accepting `null` would invent a meaning that does not exist.

⚠️ **The timestamp is server-minted.** The client sends a boolean intent and never a time it could backdate.

---

## 🔴 DEPLOY ORDER — ESTABLISHED, NOT ASSUMED

I checked each path myself rather than trusting `paid-step.ts:93-95`.

| Path | How `trucks` is read | Line | Tolerant? |
|---|---|---|---|
| **Menu route** | `.select('*')` (twice — by slug, then by id) | `menu/[truckId]/route.ts:32, 39` | ✅ **TOLERANT** |
| 🔴 **Checkout route** | **`.select('id, name, operator_id')` — NAMED** | `stripe/checkout/route.ts:79` | 🔴 **NOT TOLERANT** |
| **Dashboard hydration** | `.select('*')` — with the in-line comment *"select('*') avoids 401 errors from missing columns"* | `api/dashboard/route.ts:76` | ✅ **TOLERANT** |
| **Action route** (`verifyToken`) | `.select('*')` | `api/dashboard/action/route.ts:73` | ✅ **TOLERANT** |

### 🔴 VERDICT: **DEPLOY-COUPLED. APPLY THE MIGRATION FIRST.**

**The assertion in `paid-step.ts` is 3-for-4, and the exception is the authoritative money gate.** Concretely, deploying before migrating:

1. `.select('id, name, operator_id, online_payments_paused_at')` names a column PostgREST cannot see → **42703**, and PostgREST fails the **whole** statement, not just that field.
2. `truck` comes back `null`.
3. `if (!truck?.operator_id)` fires → **409 `notReady`**.
4. The order page takes its existing fallback: order placed unpaid, `cardFallbackNotice` shown.
5. 🔴 **Every card payment on every truck falls back to pay-at-hatch, on every order, with no error and nothing in any log** — the switch appears to be working, globally, for everyone.

⚠️ **This is the same failure class as the silent-empty-board incident recorded at `api/dashboard/route.ts:147-155`**, and it is warned about in the migration header, in the checkout route above the select, and in the resolver.

⚠️ **The dashboard control is separately tolerant either way** — pre-migration the column is undefined, the toggle reads ON, and pressing it would 42703 on the `update`, returning a 500 the operator sees. Loud, not silent. **But the checkout route decides the order, so: migration first.**

---

## VERIFICATION — actual values

The resolver was transpiled from the working tree and imported; **not reimplemented**. Every query was a `select`. **The column does not exist yet** (the migration is unrun, by your instruction), which is what makes (b) a real test rather than a hypothetical:

```
COLUMN online_payments_paused_at EXISTS? -> NO — column trucks.online_payments_paused_at does not exist
trucks: 12   operators: 8
```

### (a) pizzeria-gusto — current resolved state, with the columns behind it

```
  trucks.id                          = "pizzeria-gusto"
  trucks.operator_id                 = "814efb07-97e4-448d-a028-5a8acad8c57d"
  trucks.online_payments_paused_at   = undefined   (column not yet added)
  operators.stripe_account_id        = null
  operators.stripe_charges_enabled   = false
  -> resolveOnlineCardPayments(...)  = {"offered":false,"pausedAt":null}
  -> CARD OFFERED?                     NO
```

⚠️ **Gusto does not offer cards today, and this change does not alter that.** The cause is `stripe_charges_enabled = false` with **no** connected account — not the switch. **`pausedAt` is `null`, so the new input contributes nothing.**

### (b) Every truck, with no column present — nothing changes for anyone

```
  truck_id | operator_id | charges_enabled | paused_at (raw) | offered | pausedAt
  demo-15yy2ecnkemmchrr8np69p29n8 | (none) | undefined | undefined | false | null
  demo-ekwwmqeej70hd5da4d61wzetcw | (none) | undefined | undefined | false | null
  demo-krh2c8ksabdv28ccprswbfhkdk | (none) | undefined | undefined | false | null
  demo-m1y02c2mgqag1y4b79401af4hm | (none) | undefined | undefined | false | null
  pizzeria-gusto | 814efb07-…  | false | undefined | false | null
  real-thai-food | f150ec81-…  | false | undefined | false | null
  test-truck     | d926161e-…  | true  | undefined | true  | null
  test-truck-2   | 9f4c2d4d-…  | false | undefined | false | null
  test-truck-3   | 7c7d40de-…  | false | undefined | false | null
  test-truck-3-2 | 1e4308fc-…  | false | undefined | false | null
  tt3            | 570ec276-…  | false | undefined | false | null
  village-spice  | 8e41a930-…  | false | undefined | false | null

  TOTAL trucks=12  offered=1  paused=0  column-undefined=12
  OLD expression (op?.stripe_charges_enabled === true) vs NEW resolver: DISAGREEMENTS = 0
```

🔴 **12 of 12 trucks arrive with the column `undefined`, and the new resolver agrees with the old expression on all 12. ZERO disagreements. Nothing changes for anyone today.**

**Edge cases behind that result, each executed:**

```
  column undefined (pre-migration)   -> {"offered":true,"pausedAt":null}
  column null (never paused)         -> {"offered":true,"pausedAt":null}
  truck object itself null           -> {"offered":true,"pausedAt":null}
  a timestamp                        -> {"offered":false,"pausedAt":"2026-08-11T09:15:00.000Z"}
  charges_enabled false + not paused -> {"offered":false,"pausedAt":null}
  operator null       + not paused   -> {"offered":false,"pausedAt":null}
```

✅ **The first three all resolve to ENABLED — which is what `== null` buys, and what a `=== null` would have broken.**

### (c) A simulated paused truck, at BOTH gates

⚠️ **Run on `test-truck`, not Gusto, ON PURPOSE.** Gusto's cards are already off for an unrelated reason, so pausing it would prove nothing. `test-truck` is **the only truck in the database with `stripe_charges_enabled = true`**, so the pause is the **sole** cause of the flip. **Nothing was written — the row was copied and the copy was paused.**

```
=== (c) test-truck — THE ONLY TRUCK WITH CARDS CURRENTLY ON ===
  operators.stripe_account_id      = "acct_1U30w22fB4PPCw2D"
  operators.stripe_charges_enabled = true
  trucks.online_payments_paused_at = undefined  (column not yet added)

  BEFORE (live row)  -> {"offered":true,"pausedAt":null}
    GATE 1 /api/menu            card_payments_ready = true
    GATE 2 /api/stripe/checkout 409 notReady? false   (session WOULD be created)

  AFTER  (same row, online_payments_paused_at = 2026-08-11T09:15:00.000Z)
                     -> {"offered":false,"pausedAt":"2026-08-11T09:15:00.000Z"}
    GATE 1 /api/menu            card_payments_ready = false  -> no card choice rendered
    GATE 2 /api/stripe/checkout 409 notReady? true  -> pay-at-hatch fallback fires

  ONLY the truck column changed. stripe_charges_enabled is still true.
  offered flipped true -> false. The pause is the SOLE cause.

  UN-PAUSED (null)   -> {"offered":true,"pausedAt":null}   identical to BEFORE? true
```

🔴 **`offered` flips `true → false` at BOTH gates from the truck column alone, and returns to `true` on un-pause.**

### tsc / lint — a gate, not verification

```
$ npx tsc --noEmit -p tsconfig.json                 → clean
$ npx eslint lib/payments/online-payments-switch.ts → NEWFILE_ESLINT_EXIT=0
```

⚠️ **The five edited files carry pre-existing lint errors** (mostly `no-explicit-any`), so a bare exit code proves nothing. I checked by line number instead:

```
  app/api/dashboard/action/route.ts   totalMessages=21  INSIDE_MY_ADDED_LINES=0
  app/api/menu/[truckId]/route.ts     totalMessages=33  INSIDE_MY_ADDED_LINES=0
  app/api/stripe/checkout/route.ts    totalMessages=0   INSIDE_MY_ADDED_LINES=0
  app/dashboard/[token]/page.tsx      totalMessages=87  INSIDE_MY_ADDED_LINES=0
  components/dashboard/types.ts       totalMessages=1   INSIDE_MY_ADDED_LINES=0

  TOTAL LINT MESSAGES ON LINES I WROTE: 0
```

### Scripts deleted

`switch-exercise.mjs`, `switch-exercise2.mjs`, their two `.log` files, the transpiled `online-payments-switch.js` and the lint JSON were all removed; the listing afterwards confirms none remain. **Nothing was written to the repository beyond the seven files above, and nothing was written to the database.**

---

## NON-ASCII CENSUS

**No file gained a character class it did not already contain. DISTINCT is unchanged for all five edited files.**

| File | Before | After | Δ | Per-character |
|---|---|---|---|---|
| `app/api/menu/[truckId]/route.ts` | **D=10 T=206** | **D=10 T=212** | **+6** | `—`+2, `⚠`+2, U+FE0F+2 |
| `app/api/stripe/checkout/route.ts` | **D=5 T=140** | **D=5 T=150** | **+10** | `—`+4, `⚠`+3, U+FE0F+3 |
| `app/api/dashboard/action/route.ts` | **D=16 T=2501** | **D=16 T=2538** | **+37** | `§`+1, `—`+7, `─`+18, `⚠`+4, `🔴`+3, U+FE0F+4 |
| `app/dashboard/[token]/page.tsx` | **D=53 T=2314** | **D=53 T=2405** | **+91** | `—`+14, `…`+1, `⇒`+1, `─`+53, `⚠`+8, `🔴`+6, U+FE0F+8 |
| `components/dashboard/types.ts` | **D=9 T=52** | **D=9 T=54** | **+2** | `—`+1, `🔴`+1 |
| 🆕 `lib/payments/online-payments-switch.ts` | — | **D=5 T=146** | new file | `—`8, `─`132, `⚠`2, `🔴`2, U+FE0F 2 |

```
characters that DROPPED           : 0
characters that VANISHED entirely : 0
NEW character classes introduced  : 0
```

✅ **Every `⚠` delta matches its U+FE0F delta exactly** (+2/+2, +3/+3, +4/+4, +8/+8) — the ratio that catches a half-pasted emoji.
✅ **The new file's five classes (`—`, `─`, `⚠`, `🔴`, U+FE0F) are all present in `checkout/route.ts`, whose set is identical.**
✅ **Garble scan:** zero U+FFFD; no `Â` / `â€` / `Ã©` / `ðŸ` mojibake in any of the six files.

---

## WHAT WAS NOT TOUCHED — verified, not asserted

| Instruction | Check | Result |
|---|---|---|
| Do not modify `app/api/webhooks/stripe` | `grep -c` for the new names | **0** ✅ |
| Do not modify `lib/payments/paid-step.ts` or the three per-event overrides | `grep -c` | **0** ✅ |
| Do not add anything to Manage | `grep -c` in `app/manage/[token]/page.tsx` | **0** ✅ |
| Do not change `lib/features.ts` | `grep -c` | **0** ✅ |
| Nothing else | repo-wide grep for the column / module | **exactly the 7 files listed** ✅ |

⚠️ **`git status` shows other modified files** (`app/api/webhooks/stripe/route.ts` among them) — those are **uncommitted work from earlier tasks in this session**, not this build. The greps above are the evidence that this task touched none of them.

---

## Two things to be aware of

⚠️ **A payment in flight still completes, and must.** The switch stops a **new** Checkout Session being created. A customer already on Stripe's hosted page will still pay, and the webhook will still write the ledger row — deliberately untouched. **The exposure window is one customer's time on Stripe's page. It cannot be closed to zero and should not be.**

⚠️ **A truck can be left paused indefinitely.** There is no auto-expiry, by design — an outage does not end because the service did. The persistent banner is the only thing preventing this being forgotten, which is why it renders on **every** tab and carries the "Turn back on" button rather than just a warning. **If that trade is wrong, the fix is a reminder, not an expiry** — an expiry would silently switch cards back on mid-incident.
