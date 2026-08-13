# Letting live events through the webhook

Date: 13 August 2026
Status: BUILT and VERIFIED. One file changed. 31 of 31 assertions pass against the real route with real
signature verification and a real database. Every write is declared and its removal proved.

No live key was used. No Stripe API call was made on any path this exercised. No Stripe account, test or
live, was created, read or modified.

No migration. No commit. No deploy. `next dev` and `next build` were not run.

Nothing in the WHAT NOT TO TOUCH list was changed: `promoteDraft`, `captureOnConfirmation`, the refund
writers and the sweeps are byte-identical; the additive ledger rule is byte-identical; signature
verification, the duplicate branch and the 2xx contract are byte-identical. **One file is modified in the
whole repository** — `app/api/webhooks/stripe/route.ts` — and within it only the four gate conditions,
their four log messages, and the comment block above the first one.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 1. THE FOUR EDITS

All four now read `if (livemode === null)`. Line numbers after the change:

| Line | Branch | Was | Is |
|---|---|---|---|
| 317 | `account.updated` | `if (livemode !== false)` | `if (livemode === null)` |
| 414 | `payment_intent.amount_capturable_updated` | `if (livemode !== false)` | `if (livemode === null)` |
| 452 | `payment_intent.succeeded` | `if (livemode !== false)` | `if (livemode === null)` |
| 592 | `charge.refunded` / `refund.created` / `refund.updated` / `refund.failed` | `if (livemode !== false)` | `if (livemode === null)` |

`grep -n "livemode !== false"` now returns nothing outside the historical quotation in the comment.
`grep -n "livemode !== true"` returns nothing at all — the inversion the brief warned against does not
appear anywhere in the file.

The bodies inside each gate are unchanged in structure: same `console.warn`, same
`markHandled(eventId, 'ignored:livemode')`, same `200 {received: true}`. Only the wording of the four
warnings changed, because "sandbox only" and "this build records SANDBOX payments only" were no longer
true statements. Each now names the one condition that actually discards.

---

## 2. THE COMMENT AT THE OLD :299, REWRITTEN

It read:

```
// 🔴 LIVEMODE-GUARDED, AND THE GUARD IS `!== false`, NOT `=== true`. `livemode` is parsed strictly
// above and is `null` when the payload carried a non-boolean. A null here means "we could not tell",
// and an event we cannot classify must NOT be allowed to write a money gate. Only an explicit
// `livemode: false` — a sandbox event, which is all this build may act on — proceeds.
// ⚠️ When live accounts are switched on, this condition is the thing to change, deliberately and in
// its own change. Do not widen it while `lib/stripe/connect.ts` still refuses a live key.
```

It now reads, at `:295-313`:

```
// ── 🔴 THE LIVEMODE GATE, WIDENED ON 13 AUGUST 2026. READ THIS BEFORE CHANGING IT AGAIN. ─────────
// IT USED TO READ `if (livemode !== false)`, on this branch and on the three below, with the note:
//     "When live accounts are switched on, this condition is the thing to change, deliberately and in
//      its own change. Do not widen it while `lib/stripe/connect.ts` still refuses a live key."
// THAT PRECONDITION HAS BEEN MET. The `sk_test_` refusals came out of `lib/stripe/connect.ts`,
// `authorize.ts`, `capture.ts` and `refund.ts` on 13 August 2026 (docs/live-key-guard-report.md), so
// this is the deliberate, own-change widening that note asked for — not an oversight, and not a
// relaxation made to get something to pass.
//
// 🔴 IT IS `=== null`, NOT `!== true`. The condition that discards must stay pinned to the ONE thing
// that was ever unsafe — an event we cannot classify. Both `true` and `false` are classifications and
// both now proceed. Writing `livemode !== true` would merely invert the original defect: live would
// work and every sandbox event would be dropped, silently, with the endpoint still answering 200.
//
// ⚠️ AND `null` CANNOT ACTUALLY REACH HERE — see the malformed-event refusal at the top of this
// handler, which 400s on `livemode === null` long before any dispatch. This is defence in depth
// against that check being loosened later, and it is deliberately kept rather than deleted, because
// "an unclassifiable event must never write a money gate" is the rule, not the line that enforces it.
```

It quotes the old note verbatim, names the precondition, names the date, and names the report that
satisfied it — so the next reader can tell a deliberate widening from a forgotten one without leaving
the file. The three remaining gates carry a one-line pointer back to it rather than repeating it.

---

## 3. 🔴 WHAT THE IGNORED PATH IS NOW FOR — AND NOTHING CAN REACH IT

**Nothing can reach it. All four `ignored:livemode` branches are unreachable, and were already
unreachable for `null` before this change.**

The reason is 155 lines above the first gate, at `:160-168`:

```ts
const livemode = typeof event.livemode === 'boolean' ? event.livemode : null

if (!eventId || !eventType || livemode === null) {
  console.error(
    `[webhook/stripe] REFUSED reason=malformed_event ` +
    `hasId=${!!eventId} hasType=${!!eventType} hasLivemode=${livemode !== null}`,
  )
  return NextResponse.json({ error: 'Bad request' }, { status: 400 })
}
```

An event whose `livemode` is absent, `null`, a string or a number is refused **400 before the
`stripe_webhook_events` insert and before any dispatch**. By the time control reaches `:317`, `livemode`
is provably `true` or `false` and nothing else. Proved empirically in section 6, case 5: four
unclassifiable payloads, four 400s, and **no event row written at all** — not even the receipt.

So `if (livemode === null)` is **defence in depth, not a live path**. It is kept, deliberately, for three
reasons:

1. The rule being enforced is "an unclassifiable event must never write a money gate". That rule belongs
   next to the money gate. The `:162` refusal is *a* place it currently holds, not *the* rule.
2. The `:162` check does three jobs at once — id, type and livemode. A future change that splits it, or
   that decides a missing `livemode` should be recorded rather than refused, would silently remove the
   only thing standing between an unclassifiable payload and `operators.stripe_charges_enabled`.
3. It costs one comparison per event.

**What the path is no longer for:** it is no longer a mode filter. Under `!== false` it was doing the
work of discarding live traffic and the unclassifiable case was almost incidental. That job is gone.

⚠️ Practical consequence for anyone reading logs: **`handler_result = 'ignored:livemode'` should never
appear again.** Existing rows carrying it are the historical record of live events discarded before
today. If a new one appears, `:162` has been changed and that is the thing to look at.

---

## 4. 🔴 THE ADDITIVE LEDGER RULE — BOTH CASES STILL CLASSIFIED CORRECTLY

The predicate, `lib/payments/ledger.ts:161-166`, **unchanged by this build**:

```ts
export function isLiveRow(row: { livemode?: boolean; channel?: PaymentChannel; account_is_test?: boolean }): boolean {
  // ── ARM (a) — UNCHANGED, AND FIRST. Every row that counted yesterday returns here. ────────────────
  if (row.livemode === true) return true
  // ── ARM (b) — test money, from Stripe, on an account that is itself test. Absent flags fail closed. ─
  return row.account_is_test === true && row.livemode === false && row.channel === 'online'
}
```

### Walk 1 — a LIVE payment on a LIVE connected account

1. Customer pays. Stripe emits `payment_intent.succeeded` with `livemode: true`.
2. `:160` parses it strictly: `livemode === true`.
3. `:162` passes — it is a boolean.
4. `:217` writes `stripe_webhook_events.livemode = true`, copied verbatim.
5. `:452` — **the gate.** `livemode === null` is false, so it proceeds. *This is the only step this
   build changed.*
6. `:520` passes `livemode` **verbatim** into `recordOnlineCardPayment`, whose signature is
   `livemode: boolean` (`lib/payments/online.ts:94`) — required, no default, no fallback. The row is
   written with `livemode: true`.
7. **Reading it back:** `annotateTestAccountRows` (`ledger.ts:425`) filters candidates on
   `r.livemode === false && r.channel === 'online'`. This row is `livemode: true`, so it is **not a
   candidate** and `account_is_test` is never set on it — the annotator returns without a single query
   when no candidate exists at all.
8. **The predicate:** `row.livemode === true` → **arm (a) returns true on the first line.** Arm (b) is
   never evaluated.

**Decision: counts as real money, via arm (a).** Identical to how every in-person cash collection has
always counted — `recordCollectionPayment` hardcodes `livemode: true` (`ledger.ts:655`) and takes the
same first line.

### Walk 2 — a TEST payment on the sandbox connected account

1. Customer pays with a test card. Stripe emits `payment_intent.succeeded` with `livemode: false`.
2. `:160` parses it: `livemode === false`.
3. `:162` passes.
4. `:217` writes `stripe_webhook_events.livemode = false`.
5. `:452` — the gate. `livemode === null` is false, so it proceeds. **It proceeded before this change
   too** (`!== false` was false for an explicit `false`). *This branch of the walk is behaviourally
   identical to yesterday, step for step.*
6. `:520` passes `livemode: false` verbatim. Row written with `livemode: false`, `channel: 'online'`.
7. **Reading it back:** `annotateTestAccountRows` finds it as a candidate, resolves
   `order_payments.truck_id → trucks.operator_id → operators.stripe_account_livemode`, and because that
   column is `false` for the sandbox account, stamps `account_is_test: true` (`ledger.ts:453`, testing
   `=== false`, never `!== true`).
8. **The predicate:** arm (a) fails (`livemode` is not `true`); arm (b) evaluates
   `account_is_test === true && livemode === false && channel === 'online'` → **all three hold.**

**Decision: counts, via arm (b).** Exactly as it did yesterday.

### 🔴 Why neither can change what it does

`account_is_test` is derived from **`operators.stripe_account_livemode`, a per-account column**. It says
nothing about the platform key, nothing about the webhook, and nothing about which events are admitted.
A live account carries `true` there, is therefore never in `testOperators`, is therefore never stamped,
and therefore can never enter arm (b) — it does not need to, because arm (a) already took it.

The two arms cannot collide: arm (a) requires `livemode === true`, arm (b) requires `livemode === false`.
No row can satisfy both, and a row satisfying neither (`livemode` absent) fails closed under both, which
is the exclude-by-default rule the docblock spends forty lines defending.

**Nothing this build did touches either arm, either input, or the annotator.** What changed is only
whether a `livemode: true` event ever gets as far as producing a row for arm (a) to read. Before today,
it did not.

---

## 5. DOWNSTREAM ASSUMPTIONS THAT LIVEMODE WAS ALWAYS FALSE — GREPPED

`grep -rn "livemode: false|livemode: true|livemode = false|livemode = true"` across `app`, `lib` and
`scripts`, plus a read of every consumer reachable from the four branches.

### Clean — `livemode` is threaded verbatim, no default, no literal

| Site | Finding |
|---|---|
| `route.ts:520` → `recordOnlineCardPayment` | `livemode,` shorthand. Parameter typed `livemode: boolean` at `online.ts:94` — **required**, so a caller that forgot it would not compile. |
| `route.ts:755` → `recordOnlineCardRefund` | Same shape, `online.ts:151`. |
| `online.ts:111, 167` | `livemode: args.livemode` into `recordPaymentEvent`. No coercion. |
| `ledger.ts:566, 590` | `livemode: boolean` required on `recordPaymentEvent`; written as `event.livemode`. |
| `startPromotion` → `promoteDraft` | `grep -n livemode lib/payments/promote-draft.ts` returns **nothing**. Promotion is mode-agnostic: it moves a draft to an order and writes no money row. |
| `removeFailedOnlineRefund` (`online.ts:198`) | Keys solely on `stripe_re:<refundId>`. Reads `livemode` into the audit `before_state` and never tests it. Correct for a live failed refund. |
| `account.updated` handler | Writes `stripe_charges_enabled` and `stripe_account_synced_at` only. No livemode column involved. |
| `logAction` calls in the refund branch | `livemode` is not a parameter and is not in `before_state`/`after_state`. |

### Deliberate literals, checked and correct

- **`ledger.ts:655`** — `recordCollectionPayment` hardcodes `livemode: true`. Correct and documented:
  "There is no test mode for cash." Not reachable from any of the four branches (they only write
  `channel: 'online'` rows).
- **`capture.ts:343`, `refund.ts:248`** — `livemode: !STRIPE_SECRET_KEY?.startsWith('sk_test_')`. These
  are the in-band capture and operator-refund paths, **not** the webhook. Correct by construction, and
  covered in `docs/live-key-guard-report.md`.
- **`app/dev/ticket-preview/page.tsx:81`** — `livemode: true` in a dev fixture, deliberately, so the
  preview counts as paid. Not on any request path.

### Checked and NOT affected, though it looked relevant

- **`ledger.ts:743`** — `.eq('livemode', true)` inside `undoCollection`. This is the **in-person undo**
  path and its query also carries `.neq('channel', 'online')`, so no row written by any of the four
  webhook branches can ever be selected by it. Its sibling at `:781`, `livemode: row.livemode ?? true`,
  inherits from the row being reversed rather than assuming — already the correct shape.
- **`app/api/dashboard/route.ts:307`** and **`ledger.ts:370`** — `.or('livemode.eq.true,and(livemode.eq.false,channel.eq.online)')`.
  A strict superset of `.eq('livemode', true)`: a live row matches the first disjunct. Unchanged and
  correct for both modes.
- **`app/dashboard/[token]/page.tsx:3276`** — `r.livemode===true` gating the reversible-in-person
  affordance. Only in-person rows; unaffected.

### One comment that is now imprecise, reported and NOT changed

`app/api/webhooks/stripe/route.ts:274`:

```
// 🔴 `livemode` is logged EXPLICITLY and on every line. During test-mode bring-up, `livemode=true`
// appearing in these logs means a REAL event has reached this app, and that should be noticed
// immediately rather than discovered later in a table.
```

After this change a `livemode=true` line is expected, not an alarm. **I have deliberately not touched
it**, because the brief's fence says "Do not change anything else" and correcting it is not required to
satisfy any instruction in the brief. It is a one-line comment fix whenever you want it; say the word.

**No type, no default, no literal and no comparison downstream of these four branches assumed
`livemode` was false.** The threading was already correct throughout — the gates were the only thing
standing in front of it. That is why this change is four conditions and nothing else.

---

## 6. VERIFICATION

Harness: `scratchpad/verify-webhook-livemode.mjs`, run against the **real route handler** imported via
jiti, with **real HMAC-SHA256 signature verification**, against the **real database**.

### Declared writes

| What | Where | Cleanup |
|---|---|---|
| 8 rows in `stripe_webhook_events`, ids prefixed `evt_VERIFY_` | the route's own idempotency insert | deleted, then re-read: **0 remain** |
| nothing else | — | — |

Each fixture was shaped to reach **the benign guard immediately after its gate**, so the gate's verdict
is observable in `handler_result` while nothing downstream can write:

- `account.updated` names `acct_VERIFY_NONEXISTENT_*`, so the operators UPDATE matches zero rows and
  lands on `no_operator`.
- both `payment_intent` fixtures carry `metadata: {}`, so they land on `not_ours` before any promotion
  or ledger write.
- the refund fixture names a PaymentIntent with no ledger row, so the correlation lookup finds nothing
  and it lands on `skipped=1`.
- the refund gate is exercised with `refund.created`, **not** `charge.refunded`, because that one type
  would call `stripe.refunds.list`. **No Stripe API call was made.**

`STRIPE_WEBHOOK_SECRET` was overridden **in the harness process only**, to
`whsec_verification_only_not_a_real_secret`, so fixtures could be signed without reading the real
secret. Nothing on disk was modified and no deployment configuration was touched.

### Results — the four branches, both modes

| Branch | `livemode: true` | `livemode: false` |
|---|---|---|
| `account.updated` | 200, `no_operator`, stored `livemode=true` | 200, `no_operator`, stored `livemode=false` |
| `payment_intent.amount_capturable_updated` | 200, `not_ours`, stored `true` | 200, `not_ours`, stored `false` |
| `payment_intent.succeeded` | 200, `not_ours`, stored `true` | 200, `not_ours`, stored `false` |
| `refund.created` | 200, `refund:written=0,pending=0,failed=0,skipped=1`, stored `true` | 200, same, stored `false` |

Every branch: **live and test now reach the identical downstream guard**, and `livemode` is stored
verbatim as the event stated it. `handler_result` is `ignored:livemode` in **none** of the eight.

Actual log lines for the live deliveries, which before this change would have read `IGNORED`:

```
[webhook/stripe] RECEIVED id=evt_VERIFY_acct_true_1 type=account.updated livemode=true format=snapshot …
[webhook/stripe] account.updated NO OPERATOR for account=acct_VERIFY_NONEXISTENT_true — recorded, not acted on
[webhook/stripe] RECEIVED id=evt_VERIFY_cap_true_3 type=payment_intent.amount_capturable_updated livemode=true …
[webhook/stripe] amount_capturable_updated id=… pi=pi_VERIFY_true capturable=1000 order_key=none — not ours or nothing held, ignoring
[webhook/stripe] RECEIVED id=evt_VERIFY_succ_true_5 type=payment_intent.succeeded livemode=true …
[webhook/stripe] payment_intent.succeeded id=… pi=pi_VERIFY_true — no order_key metadata, not ours
[webhook/stripe] RECEIVED id=evt_VERIFY_ref_true_7 type=refund.created livemode=true …
[webhook/stripe] refund.created refund=re_VERIFY_true pi=pi_VERIFY_NO_LEDGER_true — no charge of ours under that intent, ignoring
```

### Results — unclassifiable livemode

Four payloads, each otherwise valid and each carrying `order_key: 'VERIFY-SHOULD-NEVER-PROMOTE'` so that
reaching the handler would have been visible:

| `livemode` | Result |
|---|---|
| absent | **400** `REFUSED reason=malformed_event hasLivemode=false`, **no row written** |
| `"true"` (string) | **400**, no row |
| `1` (number) | **400**, no row |
| `null` | **400**, no row |

All four discarded **before** the idempotency insert and **before** dispatch — which is also the direct
proof of section 3: the `=== null` gates were not reached, and cannot be.

### Counts

**31 of 31 assertions passed.** `npx tsc --noEmit` is clean across the repo.

### 🔴 A FALSE PASS I CAUGHT AND FIXED, STATED BECAUSE IT MATTERED

The first run of this harness signed every fixture with a hardcoded past timestamp. All twelve were
refused `timestamp_outside_tolerance` at the signature gate — and because every "was it ignored?"
assertion was phrased as `handlerResult !== 'ignored:livemode'`, and a refused request has no
`handler_result` at all, **twelve of the assertions passed while proving nothing.** The harness now
signs with the current timestamp and, before any other assertion, asserts that both deliveries were
**accepted** (200 with a recorded row). That check is what makes the rest meaningful.

### Proved

- Live events reach all four handlers.
- Test events still reach all four handlers, at the same downstream guard, with the same result.
- `livemode` is stored and threaded verbatim in both modes.
- Unclassifiable payloads are still discarded, with no record written.
- No collateral write: `order_payments`, `orders` and `action_audit_log` each show **0 rows created in
  the last 30 minutes**, verified by an independent query outside the harness.

### Not proved, and not provable here

- That a real Stripe live event verifies against the real live signing secret. That needs the live
  webhook endpoint registered and its `whsec_` appended to `STRIPE_WEBHOOK_SECRET` — section 7.1 of
  `docs/live-key-guard-report.md`, and still outstanding. **Until that is done, live events will be
  refused at the signature gate rather than at the livemode gate**, with the same customer-facing
  symptom, so do that next and the two causes stay distinguishable.
- That a live promotion completes end to end. That needs a live authorisation.

---

## 7. NON-ASCII CENSUS

`app/api/webhooks/stripe/route.ts`, the only modified file:

| Glyph | Before | After |
|---|---|---|
| `§` U+00A7 | 1 | 1 |
| `—` U+2014 | 98 | 102 |
| `…` U+2026 | 5 | 5 |
| `→` U+2192 | 7 | 7 |
| `─` U+2500 | 934 | 945 |
| `⚠` U+26A0 | 35 | 35 |
| `️` U+FE0F | 35 | 35 |
| `🔴` U+1F534 | 56 | 60 |

Eight classes before, the same eight after. **No character class gained.** Counts moved only for glyphs
already in the file's vocabulary.

---

## 8. WHAT IS NOW TRUE, AND WHAT IS STILL OUTSTANDING

**Now true:** a live event reaching this endpoint is verified, recorded with its own `livemode`,
dispatched to its handler, and — for a live authorisation — promoted into a real order. The single
worst outcome available on this codebase, a real card charged with no order created, is closed.

**Still outstanding before real money**, all from `docs/live-key-guard-report.md`, none of them code in
this repository:

1. **The live webhook endpoint and its signing secret**, registered as a **Connect** endpoint —
   otherwise `account.updated` for connected accounts never arrives at all. Section 7.1.
2. **Payment method domain registration in live mode, per connected account.** Fails completely
   silently: wallets simply do not appear. Section 7.2.
3. **`pk_live_` matching the live secret.** Section 3.2.
4. **The on-screen "Test mode. No real payments can be taken yet." notice** in
   `components/manage/PaymentsTab.tsx:367`, which becomes a lie. Section 3.3.
5. **Drain the sandbox connected account** — capture or cancel every open hold before the key flips.
   Section 5b.
