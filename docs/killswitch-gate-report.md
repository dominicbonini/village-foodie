# Hiding the card-payments switch from trucks that cannot take cards

**Date:** 11 August 2026
**Result: BUILT. No `next dev`, no `next build`, no commit, no deploy.**
**No migration needed, and none written** — both columns already exist and both were read successfully from the live database during verification.
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

**Three files changed.** `git diff --name-only` returns exactly:

```
app/api/dashboard/route.ts
app/dashboard/[token]/page.tsx
components/dashboard/types.ts
```

⚠️ **`components/dashboard/types.ts` is the third because the client cannot read an undeclared field on `TruckData` without a tsc error.** It is one optional property; it is not in your do-not-touch list, and the change is not satisfiable without it.

---

# 🔴 THE RESULT, UP FRONT

```
  TOTAL trucks=12  VISIBLE=1  HIDDEN=11
```

**Pizzeria Gusto is now HIDDEN** — `stripe_account_id: null`, `stripe_charges_enabled: false`, `online_payments_paused_at: null`, both arms false. **`test-truck` is the only truck that sees the control**, and it is the only one with `stripe_charges_enabled: true`.

✅ **ARM (b) IS PROVEN, NOT ASSERTED.** A truck with readiness revoked *while paused* resolves **VISIBLE**, and the counterfactual was executed alongside it: gating on arm (a) alone gives **HIDDEN** — a paused truck with no way to un-pause.

---

## 1. `app/api/dashboard` — resolving the operator's readiness

**Added immediately before the `NextResponse.json`, following `app/api/menu/[truckId]/route.ts:663-674`:**

```ts
  // ── ⚠️ TEMPORARY — CARD-PAYMENT READINESS FOR THE ONLINE-PAYMENTS SWITCH ────────────────────────
  // Delete this block with the switch (supabase/migrations/20260811_trucks_online_payments_paused_at.sql
  // carries the removal list). It exists so Settings can HIDE a control for a capability the truck does
  // not have — Pizzeria Gusto has no Stripe account and was being shown the switch anyway.
  //
  // 🔴 THE SAME SHAPE AS app/api/menu/[truckId]/route.ts:663-674, AND FOR THE SAME REASON: a SEPARATE
  // query, never an `operators(...)` embed on the truck read above. A named select that cannot resolve
  // fails the WHOLE statement with 42703 — and the truck read is the one this route's silent-empty-board
  // incident came from. Isolated, the worst case is `false`, which hides a control. That is the safe
  // direction: it can never hide the way OUT of a pause, because the client's gate has a second arm on
  // `online_payments_paused_at` for exactly that case.
  //
  // ⚠️ `trucks.operator_id` IS NULLABLE — a demo or token-only truck has none. That is a CHECKED
  // PRECONDITION, not a null-deref: no operator ⇒ not ready ⇒ the control is hidden, which is correct.
  // ⚠️ THIS IS A RENDERING INPUT, NEVER A GATE. Both money gates re-read readiness server-side
  // (/api/menu and /api/stripe/checkout). A stale `true` here can only show a switch, never take a payment.
  let stripeChargesEnabled = false
  if (truck.operator_id) {
    const { data: op, error: opErr } = await supabase
      .from('operators')
      .select('stripe_charges_enabled')
      .eq('id', truck.operator_id)
      .maybeSingle()
    if (opErr) {
      console.error('[dashboard] readiness lookup failed — the card-payments control stays hidden:', opErr.message)
    }
    stripeChargesEnabled = op?.stripe_charges_enabled === true
  }
```

✅ **Same shape as the menu route, point for point:** a separate query rather than an embed; `.maybeSingle()`; `.eq('id', truck.operator_id)`; the error captured and logged rather than dropped; `=== true` rather than truthiness; and the whole thing skipped when there is no operator.

⚠️ **The one deliberate difference is the log's consequence clause.** The menu route says *"falling back to Pay-at-Hatch"*; this one says *"the card-payments control stays hidden"* — because that is what actually happens here, and a copied consequence would be wrong.

🔴 **THE NULLABLE `operator_id` IS A CHECKED PRECONDITION.** `if (truck.operator_id)` guards the read; the initialiser is `false`, so a truck with no operator resolves **not ready** without any property access. **Four of twelve trucks are in that state today** (§ verification (d)).

**Shipped inside the `truck` object, after the spread:**

```ts
      show_paid_step:       truck.show_paid_step ?? false,        // V9.4 — the third member of the class
      // ⚠️ TEMPORARY — NOT a trucks column. Resolved above from operators.stripe_charges_enabled, and
      // placed here (in the truck object, after the spread) because that is where the customer menu API
      // puts its equivalent `card_payments_ready`. Delete with the switch.
      stripe_charges_enabled: stripeChargesEnabled,
```

⚠️ **It sits in the DELIBERATE-OVERRIDES block, after `...publicTruckFields(truck)`** — the same place the route already puts every value that is not a raw column. It is not a `trucks` column, and the comment says so where someone would otherwise assume it is.

**And the type — `components/dashboard/types.ts`:**

```ts
  /** 🔴 TEMPORARY — delete with the online-payments switch. NOT a trucks column: /api/dashboard resolves
   *  it from operators.stripe_charges_enabled for this truck's operator and places it here, the same way
   *  the customer menu API ships `card_payments_ready`. FALSE when the truck has no operator, which is a
   *  checked precondition rather than a missing value. Renders the switch; NEVER authorises a payment —
   *  both money gates re-read readiness server-side. */
  stripe_charges_enabled?: boolean
```

---

## 2. The gate — both arms, with the reasoning at the gate

**`app/dashboard/[token]/page.tsx:3449`:**

```tsx
            {(truck?.stripe_charges_enabled === true || truck?.online_payments_paused_at != null) && (
```

closed at `:3474` with `)}`.

**The comment immediately above it, as instructed:**

```
                ── 🔴 THE GATE HAS TWO ARMS AND BOTH ARE LOAD-BEARING ─────────────────────────────
                (a) truck.stripe_charges_enabled — the truck can actually take cards. Without this arm
                    the control renders for every truck, including Pizzeria Gusto, which has no Stripe
                    account at all and was being offered a switch for a capability it does not have.
                🔴 (b) truck.online_payments_paused_at — the truck is CURRENTLY PAUSED.
                    THIS ARM IS NOT REDUNDANT AND MUST NOT BE DROPPED. Readiness can be withdrawn at
                    any time: Stripe revokes charges_enabled the moment a requirement falls due, and
                    the account.updated webhook writes that straight to operators. A truck that paused
                    during an incident and then lost readiness would, under (a) alone, have the ONLY
                    control that can clear the pause disappear from the screen — leaving it paused with
                    no way out, and the banner above still telling it to "turn it back on" with nothing
                    to turn. THE WAY OUT MUST NEVER BE HIDDEN. Arm (b) is what guarantees that: a
                    non-null paused_at is exactly the state in which the control is indispensable.
                ⚠️ OR, never AND. (a) alone is a truck that can take cards and is not paused — show it.
                (b) alone is a truck that is paused and cannot take cards — show it, because it needs
                the way out. Both is the ordinary paused-but-ready case. Neither is Gusto.
                ⚠️ The BANNER above is deliberately gated on (b) ONLY and is not touched by this: a
                paused truck must keep seeing why cards are off wherever it is in the app.
```

⚠️ **Two operator choices worth naming:**

- **`=== true` on arm (a)**, not truthiness — so `undefined` (the field absent from an older cached response) hides rather than shows.
- 🔴 **`!= null` on arm (b)**, not `!== null` — true for **both** `null` and `undefined`, so a pre-migration truck reads *not paused*. **This is the same `== null` decision the resolver makes and for the same reason**; the loose operator is deliberate and is the one thing not to "tighten".

✅ **`isOffline` is untouched** — `disabled={isOffline}` on the `<Toggle>` is exactly as it was.
✅ **The persistent banner is untouched** — still `{truck?.online_payments_paused_at && (…)}` at `:2666`, outside `<main>`, on every tab. **Verified by `git diff`: the banner block has no changed lines.**

---

## 3. VERIFICATION — actual values, against real rows

**Read-only script, every query a `select`, deleted afterwards.**

⚠️ **HOW THE GATE WAS EXERCISED, STATED PLAINLY:** JSX is not importable, so the gate expression was reproduced **character-for-character** in the script and printed at the top of the run so the two can be compared by eye. It is not the same object as the source line; it is a copy, and I am naming that rather than implying the JSX itself was executed.

```
COLUMN trucks.online_payments_paused_at EXISTS? -> YES
GATE UNDER TEST: truck?.stripe_charges_enabled === true || truck?.online_payments_paused_at != null
```

✅ **The migration you ran by hand is applied.** Both inputs are live columns.

### (a) pizzeria-gusto — HIDDEN

```
  trucks.operator_id                = "814efb07-97e4-448d-a028-5a8acad8c57d"
  operators.stripe_account_id       = null
  operators.stripe_charges_enabled  = false
  trucks.online_payments_paused_at  = null
  -> shipped truck.stripe_charges_enabled = false
  -> arm (a) charges_enabled === true      = false
  -> arm (b) paused_at != null             = false
  -> GATE = false   CONTROL: HIDDEN
```

🔴 **The defect is fixed.** Gusto has an operator row but **no Stripe account at all** — `stripe_account_id` is `null` and `charges_enabled` is `false` — and both arms resolve false.

### (b) test-truck — VISIBLE

```
  operators.stripe_account_id       = "acct_1U30w22fB4PPCw2D"
  operators.stripe_charges_enabled  = true
  trucks.online_payments_paused_at  = null
  -> arm (a) = true   arm (b) = false
  -> GATE = true   CONTROL: VISIBLE
```

✅ **Arm (a) alone carries it**, which is the ordinary ready-and-not-paused case.

### (c) 🔴 ARM (b) ALONE — readiness revoked while paused

**Nothing was written. The row was copied and the copy edited.**

```
  simulated stripe_charges_enabled   = false
  simulated online_payments_paused_at= "2026-08-11T09:15:00.000Z"
  -> arm (a) = false  (FALSE — (a) alone would HIDE it)
  -> arm (b) = true  (TRUE  — this is what saves it)
  -> GATE = true   CONTROL: VISIBLE
  🔴 COUNTERFACTUAL — gating on arm (a) ALONE would give: HIDDEN
     i.e. a paused truck with no way to un-pause. That is the case arm (b) exists for.
```

🔴 **THE COUNTERFACTUAL WAS EXECUTED, NOT ARGUED.** Arm (a) alone evaluates to `HIDDEN` on the same object where the two-arm gate evaluates to `VISIBLE`. **This is the case a wrong implementation gets wrong, and the two answers differ.**

**The full truth table, evaluated rather than asserted:**

```
  charges_enabled | paused_at | arm(a) | arm(b) | GATE
  true            | null      | true   | false  | VISIBLE
  true            | set       | true   | true   | VISIBLE
  false           | null      | false  | false  | HIDDEN
  false           | set       | false  | true   | VISIBLE
  undefined column (pre-migration) + charges false -> HIDDEN
  truck object null                                -> HIDDEN
```

✅ **Exactly one of four states hides the control, and it is the one with no capability and nothing to undo.**
✅ **`truck === null` (pre-load) hides** — the optional chain resolves both arms to falsy, so nothing flashes before the fetch lands.

### (d) Every truck — the blast radius

```
  truck_id | operator_id | stripe_account_id | charges_enabled | paused_at | GATE
  demo-15yy2ecnkemmchrr8np69p29n8 | (none) | null | undefined | null | HIDDEN
  demo-ekwwmqeej70hd5da4d61wzetcw | (none) | null | undefined | null | HIDDEN
  demo-krh2c8ksabdv28ccprswbfhkdk | (none) | null | undefined | null | HIDDEN
  demo-m1y02c2mgqag1y4b79401af4hm | (none) | null | undefined | null | HIDDEN
  pizzeria-gusto | 814efb07-97e4-448d-a028-5a8acad8c57d | null  | false | null | HIDDEN
  real-thai-food | f150ec81-1bbc-4991-ac80-f07077d3b824 | null  | false | null | HIDDEN
  test-truck     | d926161e-33b9-4031-b2a6-21253418538f | acct_1U30w22fB4PPCw2D | true | null | VISIBLE
  test-truck-2   | 9f4c2d4d-2212-40e5-bc9d-fe4b0d611468 | null  | false | null | HIDDEN
  test-truck-3   | 7c7d40de-cb6b-4a48-bc81-ae9e3f300235 | null  | false | null | HIDDEN
  test-truck-3-2 | 1e4308fc-4bdd-42f7-9547-82654fb0c1bb | null  | false | null | HIDDEN
  tt3            | 570ec276-2351-4b13-a098-fbc410fa2009 | null  | false | null | HIDDEN
  village-spice  | 8e41a930-b4f9-4f04-8197-f891f14f61b9 | null  | false | null | HIDDEN

  TOTAL trucks=12  VISIBLE=1  HIDDEN=11
  trucks with NO operator_id (nullable — resolves to NOT ready): 4
```

🔴 **ELEVEN OF TWELVE TRUCKS LOSE A CONTROL THEY SHOULD NEVER HAVE HAD.** ⚠️ **That is the whole change and it is worth stating as a removal:** every one of them was being shown a switch for a capability it does not have, and none of them is paused, so nothing is being hidden that anybody needs.

✅ **The four `operator_id: (none)` rows exercise the nullable branch** — `charges_enabled` reads `undefined` because no operator lookup ran at all, and the initialiser `false` carries them to HIDDEN with no property access on a null.

### tsc / lint — a gate, not verification

```
$ npx tsc --noEmit -p tsconfig.json   → clean
```

⚠️ **All three files carry pre-existing lint errors**, so a bare exit code proves nothing. Checked by line number instead:

```
  app/api/dashboard/route.ts       totalMessages=17  INSIDE_MY_ADDED_LINES=0
  app/dashboard/[token]/page.tsx   totalMessages=87  INSIDE_MY_ADDED_LINES=0
  components/dashboard/types.ts    totalMessages=1   INSIDE_MY_ADDED_LINES=0

  TOTAL LINT MESSAGES ON LINES I WROTE: 0
```

### Script deleted

`gate-exercise.mjs`, its `.log` and the lint JSON were removed; the listing afterwards confirms none remain. **Nothing was written to the database and nothing was written to the repository beyond the three files above.**

---

## NON-ASCII CENSUS

**No file gained a character class it did not already contain. DISTINCT is unchanged on all three.**

| File | Before | After | Δ | Per-character |
|---|---|---|---|---|
| `app/api/dashboard/route.ts` | **D=9 T=447** | **D=9 T=490** | **+43** | `—`+6, `⇒`+2, `─`+26, `⚠`+4, `🔴`+1, U+FE0F+4 |
| `app/dashboard/[token]/page.tsx` | **D=53 T=2405** | **D=53 T=2447** | **+42** | `—`+5, `─`+31, `⚠`+2, `🔴`+2, U+FE0F+2 |
| `components/dashboard/types.ts` | **D=9 T=54** | **D=9 T=57** | **+3** | `—`+2, `🔴`+1 |

```
characters that DROPPED           : 0
characters that VANISHED entirely : 0
NEW character classes introduced  : 0
```

✅ **Every `⚠` delta matches its U+FE0F delta exactly** (+4/+4, +2/+2) — the ratio that catches a half-pasted emoji.
✅ **Garble scan:** zero U+FFFD; no `Â` / `â€` / `Ã©` / `ðŸ` mojibake in any of the three files.

---

## WHAT WAS NOT TOUCHED — verified, not asserted

`git diff --name-only` returns **three** files. Every file on your do-not-touch list shows **no diff at all**:

| Instruction | Result |
|---|---|
| `lib/payments/online-payments-switch.ts` | ✅ **unchanged** — this was a rendering gate, and the resolver was not involved |
| `/api/menu` and `/api/stripe/checkout` payment gates | ✅ **unchanged** |
| `app/api/webhooks/stripe/route.ts` | ✅ **unchanged** |
| `lib/payments/paid-step.ts` | ✅ **unchanged** |
| `app/manage/[token]/page.tsx` | ✅ **unchanged** |
| `lib/features.ts` | ✅ **unchanged** |
| The persistent banner | ✅ **unchanged** — no diff lines inside that block |
| A migration | ✅ **none written, none needed** — both columns read successfully from the live database |

---

## One thing to be aware of

⚠️ **The control's visibility now moves when Stripe changes its mind, and it moves on the dashboard's 60-second poll.** If `account.updated` revokes `charges_enabled` on a truck that is **not** paused, the switch disappears within a minute — correct, but it will look like a control vanishing mid-service. 🔴 **A truck that IS paused keeps it, which is the case that matters and is exactly what arm (b) guarantees.** No change proposed; flagging it so it is not a surprise.
