# Live-key guard removal, and every other test-mode assumption on the payment path

Date: 13 August 2026
Status: READ-ONLY DIAGNOSIS complete. The contained build is done. **One item is deliberately NOT built
and is flagged below as a contradiction with the WHAT NOT TO TOUCH fence — read section 3.1 before
switching a live key on.**

No live key was used. No Stripe account, test or live, was created, read or modified by this work. The
only live-shaped string that appears anywhere is the literal
`sk_live_NOT_A_REAL_KEY_verification_only`, used in-process to exercise pure functions; it was never sent
to Stripe.

No migration is needed. Nothing in this change adds, alters or reads a column that does not already
exist — `operators.stripe_account_livemode` shipped in
`supabase/migrations/20260811_operators_stripe_account_livemode.sql`.

No environment variable was changed.

---

## 0. A CORRECTION TO THE BRIEF BEFORE ANYTHING ELSE

The brief named two guard locations:

> `lib/stripe/connect.ts:88` and `app/api/stripe/checkout/route.ts:40-47`

**`app/api/stripe/checkout/route.ts` DOES NOT EXIST.** `ls app/api/stripe/` returns exactly one entry,
`connect`. Hosted Checkout was deleted in V11.10 when the Payment Element moved in-page. The guard that
lived in it was not deleted with it — it was **copied into three separate money modules**, and each copy
still says so in its own comment. `lib/payments/authorize.ts` carried the giveaway verbatim:

```
/** ⚠️ The same refusal the hosted-Checkout route made, for the same reason: this build may not move real
 *  money, and a key starting `sk_live_` cannot be mistaken for anything else. */
```

So the count is not two. It is **five** executable refusals, in five files, plus a sixth quieter one that
is not a `throw` at all. Had only the two named locations been changed, a live key would have thrown on
the first authorisation.

---

## 1. THE GUARDS, QUOTED EXACTLY AS THEY STOOD

### 1a. `lib/stripe/connect.ts:85-103` — the named one

```ts
/**
 * 🔴 THE LIVE-ACCOUNT GUARD. Throws rather than returning a boolean, because every caller of this module
 * would otherwise have to remember to check — and the one that forgot would create a real account.
 * ⚠️ Tested on the KEY, not on NODE_ENV, not on a `SANDBOX=true` var, and not on `livemode` in a
 * response. Configuration can disagree with reality; `sk_live_` cannot.
 */
function assertSandboxKey(key: string | undefined): string {
  if (!key) {
    throw new Error('[stripe/connect] STRIPE_SECRET_KEY is not set — nothing can be created without it')
  }
  if (!key.startsWith('sk_test_')) {
    throw new Error(
      '[stripe/connect] REFUSING: STRIPE_SECRET_KEY is not a sandbox key. This build may only create ' +
      'test-mode connected accounts. Remove this guard deliberately, in its own change, when live ' +
      'accounts are switched on.',
    )
  }
  return key
}
```

Reached from `stripeClient()`, which every account create, account read, account session and domain
registration in that module goes through.

### 1b. The three descendants of the deleted Checkout route

`lib/payments/authorize.ts:37-46` — blocks **taking** a payment:

```ts
/** ⚠️ The same refusal the hosted-Checkout route made, for the same reason: this build may not move real
 *  money, and a key starting `sk_live_` cannot be mistaken for anything else. */
function sandboxKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  if (!key.startsWith('sk_test_')) {
    throw new Error('REFUSING: STRIPE_SECRET_KEY is not a sandbox key. This build may not take real payments.')
  }
  return key
}
```

`lib/payments/capture.ts:50-58` — blocks **capturing**:

```ts
/** ⚠️ The same refusal every other money path makes: this build may not move real money. */
function sandboxKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  if (!key.startsWith('sk_test_')) {
    throw new Error('REFUSING: STRIPE_SECRET_KEY is not a sandbox key. This build may not capture real payments.')
  }
  return key
}
```

`lib/payments/refund.ts:29-37` — blocks **refunding**:

```ts
/** ⚠️ The same refusal every other money path makes: this build may not move real money. */
function sandboxKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  if (!key.startsWith('sk_test_')) {
    throw new Error('REFUSING: STRIPE_SECRET_KEY is not a sandbox key. This build may not refund real payments.')
  }
  return key
}
```

### 1c. 🔴 `lib/stripe/connect.ts:394-399` — THE SIXTH, AND IT DOES NOT THROW

This is the one that would have been missed, because it is not a refusal and does not look like a guard:

```ts
export function connectConfigured(): boolean {
  return typeof process.env.STRIPE_SECRET_KEY === 'string'
    && process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')
    && typeof process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === 'string'
    && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.length > 0
}
```

Against a live key this returns `false` — **the platform reports itself unconfigured**. Its docstring
says it exists "to render an honest empty state rather than letting a button throw", so the failure mode
is an operator with perfectly good live keys being shown the not-set-up screen, with nothing in any log.

(It currently has **no call sites** — `grep -rn connectConfigured` finds only its own definition. It is
exported and dead. Left in place and corrected, because a dead honest function is safer than a dead
lying one, but note it is not load-bearing today.)

---

## 2. WHAT WAS REMOVED, AND WHAT REPLACED IT

All six prefix tests are gone. Each is replaced by a presence check only — a key must still be set,
because an intent cannot be created without one. The functions were **renamed** so no caller can read a
name that promises something the body no longer does:

| File | Before | After |
|---|---|---|
| `lib/stripe/connect.ts` | `assertSandboxKey()` | `requireStripeKey()` |
| `lib/payments/authorize.ts` | `sandboxKey()` | `stripeSecretKey()` |
| `lib/payments/capture.ts` | `sandboxKey()` | `stripeSecretKey()` |
| `lib/payments/refund.ts` | `sandboxKey()` | `stripeSecretKey()` |
| `lib/stripe/connect.ts` | `connectConfigured()` required `sk_test_` | requires a non-empty key of any mode |

### 2a. The successor check — key mode against account mode

The brief asked for exactly this and it is the right check, because it catches the failure that actually
bites now:

> a test `acct_` against live keys fails in a way that looks like a permissions bug

Two new exported functions in `lib/stripe/connect.ts:119` and `:141`:

```ts
export function platformKeyLivemode(): boolean | null   // true for sk_live_, false for sk_test_, null otherwise
export function describeAccountModeMismatch(accountLivemode: boolean | null | undefined): string | null
```

`describeAccountModeMismatch` returns a sentence when the two disagree and `null` when they agree **or
when either mode is unknown**. Unknown is never treated as disagreement: an operator onboarded before the
mode column existed reads `null`, and "we do not know" is not evidence.

It is called at every point money touches a connected account:

- `lib/payments/authorize.ts:117` — before `paymentIntents.create`, using the operator row the function
  already reads (`stripe_account_livemode` added to that existing named select).
- `lib/payments/authorize.ts:254` — inside `stripeAccountForTruck`, which is the single funnel for
  **capture, refund, promotion, the submit route's cancel path and the stale-authorisation sweep**. One
  read covers all five.

### 2b. 🔴 IT LOGS. IT DOES NOT THROW. THE REASON MATTERS

The account's mode reaches these call sites from `operators.stripe_account_livemode`, which is a **cache
of what Stripe said at onboarding**, not a live fact. A cache that is wrong must be allowed to be wrong
loudly; it must never be the thing that refuses a real payment on a real account.

So the return value of `stripeAccountForTruck` is **byte-identical to before** — a mismatched account id
is still returned, still passed to Stripe, and still refused by Stripe. Stripe remains the only
authority. What changes is that the refusal now has a stated cause in our own logs:

```
[authorize] 🔴 MODE MISMATCH truck=… account=acct_… — platform key is LIVE but the connected account is
recorded as TEST — Stripe will answer as though the account does not exist, which looks like a
permissions failure and is not one
```

If you would rather it hard-refuse, that is a one-line change and I will make it on request — but I do
not recommend it, for the cache reason above.

### 2c. Stale comments corrected in the same pass

Six comments asserted the refusal as a live invariant and would have become active misinformation:

- `lib/stripe/connect.ts:57` header — "SANDBOX ONLY. NOTHING HERE MAY CREATE A LIVE ACCOUNT."
- `lib/stripe/connect.ts:528` — "The sandbox guard, or a missing key."
- `lib/stripe/connect.ts` domain-registration note — rewritten and **upgraded from ⚠️ to 🔴**, see 7.2.
- `app/api/stripe/connect/route.ts:13` header — "refuses a key that is not `sk_test_`. There is no branch
  in this file that can bypass it."
- `app/api/stripe/connect/route.ts:213` — "a build that is supposed to refuse live keys".
- `lib/payments/ledger.ts:132` — "this build refuses live keys outright", inside the `isLiveRow` docblock,
  i.e. in the one place a reader goes to understand what counts as real money.
- `lib/payments/capture.ts:340` and `lib/payments/refund.ts:246` — both said "`sandboxKey()` has already
  refused anything but sk_test_" as the justification for the `livemode` expression below them.

**The `livemode` expressions themselves were NOT changed** and did not need to be:

```ts
livemode: !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),
```

`capture.ts:343` and `refund.ts:248`. Both were written, in the original author's words, "so that going
live changes it without an edit here" — and that is precisely what has now happened. An `sk_live_` key
makes them `true` and every captured or refunded row starts counting as live money with no edit.

---

## 3. 🔴 EVERY OTHER TEST-MODE ASSUMPTION ON THE PAYMENT PATH

This is the section that matters. The full list, in order of what it costs you.

### 3.1 🔴🔴 THE WEBHOOK IGNORES EVERY LIVE EVENT. FOUR BRANCHES. TOTALLY SILENT. NOT FIXED.

`app/api/webhooks/stripe/route.ts` has four handler branches and **all four are gated the same way**:

| Line | Event | Gate |
|---|---|---|
| 305 | `account.updated` | `if (livemode !== false) { ignore }` |
| 399 | `payment_intent.amount_capturable_updated` | `if (livemode !== false) { ignore }` |
| 434 | `payment_intent.succeeded` | `if (livemode !== false) { ignore }` |
| 571 | `charge.refunded` / `refund.created` / `refund.updated` / `refund.failed` | `if (livemode !== false) { ignore }` |

`livemode` here is copied verbatim from the Stripe event, correctly and strictly. **A live event carries
`livemode: true`, fails `!== false`, and is discarded.** It is marked `ignored:livemode` in
`stripe_webhook_events`, logged as a `console.warn`, and answered `200 {received: true}` — so Stripe sees
a healthy endpoint, retries nothing, and the Stripe dashboard shows green.

What this costs, in order:

- **`amount_capturable_updated` ignored → the draft never promotes.** A live customer authorises a card,
  the hold is placed on their real card, and **no order is ever created**. They get a confirmation
  experience with nothing behind it, the truck never sees the order, and the hold sits on their card
  until it expires. This is the single worst outcome available on this codebase and it produces no error
  anywhere.
- **`payment_intent.succeeded` ignored → the capture ledger row is never written by the webhook.** The
  in-band capture path in `capture.ts` writes its own row, so this is a loss of the redundant recovery
  path rather than of the primary one — but that redundancy is exactly what `capture.ts:346`'s
  "RECOVERABLE WITHOUT US" comment relies on.
- **`refund.created` / `charge.refunded` ignored → a refund issued from the Stripe dashboard is never
  recorded.** Money leaves; the ledger does not know; the order still reads PAID.
- **`account.updated` ignored → `operators.stripe_charges_enabled` never flips.** A live truck completes
  onboarding, Stripe enables charges, and we never hear. `resolveOnlineCardPayments` keeps returning
  not-offered, so **the card option never appears for that truck at all.**

The code's own comment at `:299` states the position:

```
// ⚠️ When live accounts are switched on, this condition is the thing to change, deliberately and in
// its own change. Do not widen it while `lib/stripe/connect.ts` still refuses a live key.
```

Its precondition is now satisfied — `connect.ts` no longer refuses a live key.

**🔴 I HAVE NOT WIDENED THESE, AND THIS IS THE CONTRADICTION I WAS ASKED TO FLAG RATHER THAN RESOLVE.**
The brief's WHAT NOT TO TOUCH list names `capture`, `refunds`, `promotion` and `the sweeps`. Widening
these four gates changes when promotion, capture-recording and refund-recording run, so I read them as
inside the fence. But item 2 says "Remove them, so a live key works", and with these four gates in place
a live key emphatically does **not** work — it takes real money and creates no orders. The two
instructions cannot both be satisfied, so I have satisfied the explicit fence and stopped here rather
than choosing.

**What the change would be**, if you want it — four identical edits, and the shape matters:

```ts
if (livemode === null) { ...ignore, cannot classify... }
```

replacing `if (livemode !== false)`. That keeps the whole point of the strict parse — an event whose
`livemode` was not a boolean is still discarded, because an unclassifiable event must never write a
money gate — while letting both `true` and `false` through. It must **not** become `if (livemode !==
true)`, which would simply invert the bug and silently drop the sandbox.

Say the word and I will make that as its own change, with the webhook fixture run against both
`livemode: true` and `livemode: false` payloads.

### 3.2 🔴 `pk_test_` LEFT AGAINST AN `sk_live_` SECRET

`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is read in three places —
[order/page.tsx:1510](app/trucks/[slug]/order/page.tsx#L1510) (mounts the Payment Element),
[connect.ts:449](lib/stripe/connect.ts#L449), and
[PaymentsTab.tsx:173](components/manage/PaymentsTab.tsx#L173) (the embedded Connect components).

**Nothing anywhere checks that it matches the secret key's mode.** A live secret creates a live
PaymentIntent; a `pk_test_` client then tries to confirm a live `client_secret` and Stripe rejects it.
The customer sees a card form that fails at the moment of payment, which is the most expensive place to
discover a configuration error. You own the env vars, so this is a note, not a change — but it is the
single easiest one to get wrong on the day, because the two variables are set in different places.

### 3.3 The on-screen sandbox notice becomes a lie

[PaymentsTab.tsx:367](components/manage/PaymentsTab.tsx#L367):

```tsx
<p className="text-[11px] text-slate-400 mt-3">Test mode. No real payments can be taken yet.</p>
```

Static copy, shown to every operator on the payments screen. On a live key it tells a truck taking real
money that it cannot take real money. Not touched — it is outside the named build and removing it while
still on a test key would be worse than leaving it. It needs either deleting or making conditional on
`platformKeyLivemode()` before the first live truck sees it.

### 3.4 Things that look like test-mode assumptions and are NOT — checked and cleared

Listed because each cost time to rule out and the next reader should not have to repeat it.

- **`app/api/stripe/connect/route.ts:190`** — `: !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')`.
  This is only the **fallback arm of a ternary**; the authoritative value is `account.livemode` read back
  off the created v2 Account object. The fallback exists so a Stripe shape change cannot silently write
  `NULL`. Correct for live by construction.
- **`lib/payments/authorize.ts:155`** — takes `livemode` from the Stripe object, explicitly not from a
  prefix. Correct in both modes.
- **`app/api/webhooks/stripe/route.ts:158-166, 217`** — `livemode` parsed strictly and stored verbatim,
  refusing a non-boolean. Correct in both modes. The defect in 3.1 is the *gate*, not the parse.
- **`lib/stripe/webhook-signature.ts:59-63`** — `parseSigningSecrets` already accepts a comma-separated
  list, specifically because "registering the same URL in test mode and in live mode produces TWO
  endpoint objects with TWO DIFFERENT signing secrets". Already correct; needs only the live secret
  appending to the env var (see 7.1).
- **`lib/payments/ledger.ts:644`** — "There is no test mode for cash." Accurate and unaffected.
- **`lib/apns.ts:22`**, **`lib/features.ts:80,150`**, **`lib/native/outbox.ts:7`**,
  **`app/dashboard/[token]/page.tsx:172`** — every other "sandbox" in the codebase. Apple's push sandbox,
  the `demo` plan's prospect sandbox, the iOS app sandbox, demo-token detection. Nothing to do with
  Stripe.

---

## 4. WHAT `operators.stripe_account_livemode` DOES FOR A TRUCK ONBOARDED LIVE

It is set to `true`, from Stripe's own object, and that value **turns off** the only thing it drives.

Written at [connect/route.ts:200](app/api/stripe/connect/route.ts#L200), in the same UPDATE statement as
`stripe_account_id` so the pair can never be half-written, from `account.livemode` read back off the
created account rather than inferred from the key.

It has exactly two consumers, and both ask the same question — *is this account a TEST account?*:

1. **`lib/payments/ledger.ts:453`**, `annotateTestAccountRows`:
   ```ts
   const testOperators = new Set(opRows.filter(o => o.stripe_account_livemode === false).map(o => o.id))
   ```
2. **`app/api/dashboard/route.ts:245`**, the same test client-side, producing `account_is_test`.

For a live account the value is `true`, so it is **not** in `testOperators`, so `account_is_test` is
never stamped on its rows. In `isLiveRow`:

```ts
if (row.livemode === true) return true                                                    // arm (a)
return row.account_is_test === true && row.livemode === false && row.channel === 'online'  // arm (b)
```

a live truck's card payments carry `livemode: true` and count through **arm (a)**, which is the original
arm and is unchanged. Arm (b) — the one added on 11 August for the sandbox — cannot fire for them,
because `account_is_test` is never set.

**So the answer to item 4 is: for a live truck, `stripe_account_livemode` does nothing except keep arm
(b) switched off.** Arm (b) exists solely to make sandbox money visible; a live account has no need of
it. This is the additive design working exactly as intended, and it is why no ledger change was required
by this build. Note also the `=== false` in both consumers, never `!== true`: a `NULL` (no connected
account) does not satisfy it either.

---

## 5. 🔴 THE EXISTING SANDBOX ACCOUNT AND ITS TEST PAYMENTS, ONCE THE PLATFORM KEY IS LIVE

Two different fates, and the distinction is the whole answer.

### 5a. The historical rows: UNTOUCHED, STILL VISIBLE, STILL CORRECTLY CLASSIFIED

`acct_1U30w22fB4PPCw2D`'s existing `order_payments` rows carry `livemode: false`, `channel: 'online'`,
and belong to an operator whose `stripe_account_livemode` is `false`. **None of those three facts is
about the platform key.** `annotateTestAccountRows` re-derives `account_is_test` from the stored
per-account column on every read, so after the key flips it still stamps those rows, arm (b) still admits
them, and every total that included them yesterday includes them tomorrow. Reports, the dashboard and the
order balances do not move by a penny.

This is the direct consequence of the design decision recorded in §37 — storing the mode **with the
account id** rather than deriving it from the key. Had it been derived from the key, every historical
sandbox payment would have silently changed classification the moment the key changed.

### 5b. The account itself: DEAD, AND IT WILL NOT SAY SO CLEARLY

A test `acct_` cannot be addressed by a live key. Every `{ stripeAccount: 'acct_1U30w22fB4PPCw2D' }`
call — authorise, capture, refund, cancel, account session, domain registration — fails, and Stripe's
error is shaped like a permissions or not-found problem rather than a mode problem. That is precisely the
failure the new mismatch line exists to name; without it, this reads as a broken Connect install.

Concretely, for that truck under a live key:

- **New orders**: `authorizeDraft` logs the mismatch, then `paymentIntents.create` fails, and the
  customer's card is refused. Loud at the till, at least.
- **Any hold still open at the moment of the switch**: 🔴 **uncapturable and unreleasable.** Both
  `capture.ts` and `authorize.ts`'s `cancelAuthorization` address the account, and both now fail. The
  hold cannot be captured, cannot be cancelled, and will sit until Stripe expires it — seven days for a
  card. It is test money, so nobody is out of pocket, but the orders will not resolve and the
  stale-authorisation sweep will fail on them every run.
- **Any unrefunded test payment**: cannot be refunded through the app after the switch.

**Before flipping the key, drain that account**: capture or cancel every open hold, issue any refunds you
still owe on it, and let the sweeps run once. Afterwards the option is gone. This is the only part of the
switch that is time-ordered — everything else can be done in either order.

The truck must then re-onboard to get a live `acct_`, which writes a new `stripe_account_id` and
`stripe_account_livemode: true` over the old pair. Its old rows keep working, per 5a, because they are
classified by what was stored on them, not by the current column value. Note that once the operator row
is overwritten, `annotateTestAccountRows` reads `true` for that operator and the old rows' `account_is_test`
stamp stops — but by then they read as historical test money that no longer counts, which is arguably the
correct outcome and is in any case not a change this build makes.

---

## 6. RUNNING TEST AND LIVE SIDE BY SIDE

**Not possible on one deployment as the code stands, and the blocker is not the guards — it is that
there is exactly one `STRIPE_SECRET_KEY` and the mode is read from it globally.** `platformKeyLivemode()`,
`capture.ts:343` and `refund.ts:248` all read `process.env` directly, per call, with no per-truck
parameter. One deployment is one mode.

What would have to change to run both:

1. **The key would have to be resolved per connected account, not per process.** `stripeSecretKey()` and
   `requireStripeKey()` would take the account's `stripe_account_livemode` and return the matching key of
   two configured secrets. That is a signature change through `authorize`, `capture`, `refund`,
   `cancelAuthorization` and every entry point in `lib/stripe/connect.ts`.
2. **`livemode` on written rows would follow the resolved key**, not `process.env`, at `capture.ts:343`
   and `refund.ts:248`.
3. **The webhook would have to stop treating mode as an admission test at all** and route on it instead —
   which is the 3.1 change, but done as a router rather than a widened gate.
4. **The publishable key would have to be chosen per truck at mount time** in
   [order/page.tsx:1510](app/trucks/[slug]/order/page.tsx#L1510), which today reads one build-time
   `NEXT_PUBLIC_` value. This is the hardest of the four: `NEXT_PUBLIC_` variables are inlined at build
   time, so a per-truck publishable key must be delivered by the API alongside the client secret, not read
   from the environment.

Only item 4 needs the env vars you own; the other three are code. **Nothing above is needed to go live —
it is only needed to be in both modes at once.** My recommendation is not to: the mode already lives on
the account row, so the honest version of "side by side" is two deployments against one database, and
even that needs items 1, 2 and 4.

Already correct for a mixed world, and worth knowing: the webhook secret list (3.4), the `livemode`
column on `order_payments` and `stripe_webhook_events`, the per-account `stripe_account_livemode`, and
both arms of `isLiveRow`. The data model is ready for mixed mode; the key resolution is not.

---

## 7. STRIPE-SIDE CONFIGURATION THAT EXISTS ONLY IN SANDBOX TODAY

Everything below exists in your Stripe test mode and has **no live counterpart** until it is created
there. Mode does not flow downwards from live to test or upwards from test to live, with one exception
noted in 7.2.

### 7.1 The webhook endpoint and its signing secret — **fails loudly, but the customer sees silence**

Registering the same URL in test and in live produces two endpoint objects with two different `whsec_`
secrets. The code already handles this: `STRIPE_WEBHOOK_SECRET` is comma-separated and every secret is
tried. **The live endpoint must be created in the Stripe dashboard and its secret appended.**

*Failure mode:* if missed, live events arrive and fail signature verification. That is loud in our logs
and visible as failed deliveries in Stripe. But note the customer-facing effect is identical to 3.1 —
no promotion, no order — so if 3.1 is also outstanding you will be looking at the same symptom with two
possible causes. Fix 3.1 first so this one is distinguishable.

🔴 It must be registered as a **Connect** endpoint, not just an account endpoint. `account.updated` for
connected accounts is a Connect event, and an endpoint listening only to your own account's events will
never receive it.

### 7.2 Payment method domain registration — **🔴 FAILS COMPLETELY SILENTLY. THE WORST ONE.**

`www.hatchgrab.com` must be registered as a payment method domain **on each connected account**, in
**live mode**. Live registration also covers sandboxes; sandbox registration covers nothing in live. Every
registration this build has ever performed was made with a test key and is worth nothing live.

*Failure mode:* **no error of any kind.** The Payment Element renders a card form; Apple Pay and Google
Pay are simply absent. It is indistinguishable from a device that does not support wallets, and it is
exactly the symptom already recorded in `lib/stripe/connect.ts` — the measured case where the connected
account had only `checkout.stripe.com` registered and wallets vanished when the Element moved in-page.

`registerPaymentDomains` runs during onboarding, so a live truck onboarded *through the app* gets it. A
live account linked by hand, or one whose registration call failed (failures are logged per domain, not
thrown), has nothing. I upgraded that comment block from ⚠️ to 🔴 in this pass.

### 7.3 Connect platform configuration in live mode — **fails loudly**

Live mode has its own Connect settings: platform profile, branding, support contact, the statement
descriptor, and the account-configuration posture. The v2 account create sends
`fees_collector: 'stripe'` explicitly and reads it back, so the posture itself is verified per account —
but the **platform's** live Connect profile has to be completed before Stripe will let you create live
connected accounts at all. This one refuses at the API and is unmissable.

### 7.4 Payment methods enabled on the live connected account — **fails loudly**

`payment_method_types: ['card']` is sent explicitly at `authorize.ts:137`, so if card is not enabled on
the live account the intent create errors rather than silently offering a different method. The explicit
list, added to suppress Link, has the side benefit of making this loud.

### 7.5 The publishable key — **fails loudly, at the worst moment**

See 3.2. Loud, but the noise happens in the customer's browser at the instant they try to pay.

### Silent-failure summary

| Item | Fails silently? |
|---|---|
| 3.1 Webhook livemode gates | 🔴 **YES — totally. Green in Stripe, no order created.** |
| 7.2 Payment method domains | 🔴 **YES — wallets just do not appear.** |
| 1c `connectConfigured()` | 🔴 **YES — was; fixed in this build.** |
| 3.3 On-screen "Test mode" notice | 🔴 **YES — it is a lie, not an error.** |
| 7.1 Webhook endpoint / secret | No, but the customer-facing symptom matches 3.1 |
| 7.3 Connect live profile | No |
| 7.4 Card enabled on account | No |
| 3.2 / 7.5 Publishable key mode | No, but only at the point of payment |

---

## 8. VERIFICATION

### Proved, without a live key

A jiti harness exercised the changed code with `STRIPE_SECRET_KEY` set to the literal string
`sk_live_NOT_A_REAL_KEY_verification_only`. No Stripe request was made. **21 of 21 assertions passed.**

- `platformKeyLivemode()` returns `true` / `false` / `null` for `sk_live_` / `sk_test_` / unset, and
  `null` for an unrecognised prefix such as `rk_live_` — it refuses to guess.
- `describeAccountModeMismatch` returns a sentence for live-key-plus-test-account and for
  test-key-plus-live-account; returns `null` when the modes agree, and `null` for both `null` and
  `undefined` account modes.
- `connectConfigured()` returns `true` under a live key (it returned `false` before this change), `true`
  under a test key, and `false` with no key.
- `authorize.ts`, `capture.ts` and `refund.ts` all import and expose their entry points with a live-prefixed
  key present — the only thing that could have thrown was the removed prefix test.
- A source scan confirms **no executable `sk_test_` prefix test survives as a refusal** in any of the five
  files. The three that remain are all mode *readers*: `platformKeyLivemode`'s own body, and the two
  `livemode:` derivations at `capture.ts:343` and `refund.ts:248`.

`npx tsc --noEmit` is clean across the repo.

NON-ASCII census taken before and after on all six modified files. **No file gained a character class.**
Every glyph used appears in that file's existing vocabulary — `authorize.ts` and `refund.ts` in particular
have no `…` and no `•`, and none were introduced.

### NOT proved, and cannot be without a live key

- That a live `sk_live_` key is actually accepted by Stripe for account creation, intent creation,
  capture or refund. The code no longer refuses it; whether Stripe accepts it depends on 7.3.
- That `account.livemode` reads back `true` on a live v2 account create.
- That the live webhook endpoint delivers and its signature verifies.
- That wallets appear after a live domain registration.
- **That any live event is processed at all — because per 3.1 it currently would not be.** This is the
  one item where the code is provably wrong for live and no test can rescue it.

### What I did not do

- No `next dev`, no `next build`.
- No commit, no deploy.
- No migration written; none is needed.
- No environment variable read for its value or changed.
- No live key used. Nothing created on any Stripe account.

---

## 9. FILES CHANGED

| File | Change |
|---|---|
| `lib/stripe/connect.ts` | `assertSandboxKey` to `requireStripeKey`; `connectConfigured` no longer requires `sk_test_`; added `platformKeyLivemode` and `describeAccountModeMismatch`; three comment blocks corrected, one upgraded to 🔴 |
| `lib/payments/authorize.ts` | `sandboxKey` to `stripeSecretKey`; `stripe_account_livemode` added to an existing named select; mismatch logged before intent create and inside `stripeAccountForTruck` |
| `lib/payments/capture.ts` | `sandboxKey` to `stripeSecretKey`; `livemode` comment corrected, expression unchanged |
| `lib/payments/refund.ts` | `sandboxKey` to `stripeSecretKey`; `livemode` comment corrected, expression unchanged |
| `app/api/stripe/connect/route.ts` | Two stale sandbox comments corrected; no logic change |
| `lib/payments/ledger.ts` | **Comment only.** The `isLiveRow` docblock no longer claims the build refuses live keys, and now states why arm (b) is unaffected. No arithmetic, no predicate, no column touched. |

## 10. THE ONE THING TO DECIDE

**Section 3.1.** Four `livemode !== false` gates in the webhook route discard every live event. Until they
are widened to `livemode === null`, a live key will take real money from real customers and create no
orders. I did not touch them because promotion, capture and refunds are inside the WHAT NOT TO TOUCH
fence, and the instruction to make a live key work contradicts it. That is your call, not mine, and it is
a fifteen-minute change once made.
