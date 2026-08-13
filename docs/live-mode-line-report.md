# The mode line, the key-mismatch check, and the script's last sandbox guard

Date: 13 August 2026
Status: BUILT. **Three files changed** — [components/manage/PaymentsTab.tsx](components/manage/PaymentsTab.tsx),
[app/api/stripe/connect/route.ts](app/api/stripe/connect/route.ts) and
[scripts/register-payment-domain.cjs](scripts/register-payment-domain.cjs). `tsc --noEmit` clean.
**24 of 24 assertions pass.** No file gained a non-ASCII character class.

No `next dev`, no `next build`, no commit, no deploy, no migration. `requireOwner`, the admin read-only
access, the three-way copy split from last turn, and what pressing Connect does are all untouched. No
environment variable was read for its value from any deployment, and none was changed.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 1. THE MODE LINE — NOW DERIVED

### Before — QUOTED, `PaymentsTab.tsx:437`

```tsx
{/* ⚠️ SANDBOX. Said on screen, not only in code — an operator who completes real-looking
    onboarding must not believe they can take real money. */}
<p className="text-[11px] text-slate-400 mt-3">Test mode. No real payments can be taken yet.</p>
```

### After — QUOTED

```tsx
{serverLivemode === false && (
  <p className="text-[11px] text-slate-400 mt-3">Test mode. No real payments can be taken yet.</p>
)}
{serverLivemode === true && (
  <p className="text-xs text-slate-600 mt-3">
    Live mode. Connecting here creates a real Stripe account in your name, and customer payments
    will reach your own bank.
  </p>
)}
```

`serverLivemode` is `status.livemode`, which the route now returns from `platformKeyLivemode()` —
**the mode of the secret key that would actually create the account**, not of the publishable key this
bundle happens to hold.

### The copy, both modes

| Server key | Line | Treatment | Why |
|---|---|---|---|
| `sk_test_` | **"Test mode. No real payments can be taken yet."** | `text-[11px] text-slate-400` | 🔴 **Word-for-word and class-for-class unchanged.** It was right whenever it applied; the fault was that it applied always. |
| `sk_live_` | **"Live mode. Connecting here creates a real Stripe account in your name, and customer payments will reach your own bank."** | `text-xs text-slate-600` | Heavier, as you asked — one step up in both size and contrast. |
| neither / unknown | *nothing rendered* | — | An unrecognised prefix or a pre-upgrade `status` response leaves the mode unknown, and an unknown mode must not be asserted either way. |

**Why the live variant is weightier, and why it stops where it does.** It sits directly above a button
that creates a Stripe account which cannot be deleted (`route.ts:159`), with **no confirmation step
anywhere in the flow**, and the next screen asks for a bank account and photo ID. One step up from a
whisper is proportionate. ⚠️ **It is deliberately not amber or red.** On this page those colours mean
something is wrong, and nothing is wrong — live mode is the state you want to be in. A warning-coloured
notice above the primary action would discourage the thing you are asking operators to do.

### The server side — QUOTED

```ts
import {
  createConnectedAccount, createAccountSession, readAccountReadiness,
  readAccountPosture, postureMismatches, readAccountRequirements,
  registerPaymentMethodDomains, platformKeyLivemode,
} from '@/lib/stripe/connect'
…
  livemode: platformKeyLivemode(),
```

Added to **both** `status` returns (the no-account early return and the with-account one), additively —
every existing field is unchanged and an older client ignoring it behaves exactly as before.
`platformKeyLivemode()` already existed (`lib/stripe/connect.ts:119`) and was written for exactly this:
`true` for `sk_live_`, `false` for `sk_test_`, `null` for anything else, and it refuses to guess.

---

## 2. 🔴 THE MISMATCH CHECK

### Where it runs

**In the browser, on the Payments tab, on every load of that tab** — as a derivation, not a request:

```tsx
const publishableLivemode: boolean | null =
  typeof publishableKey !== 'string' ? null
    : publishableKey.startsWith('pk_live_') ? true
    : publishableKey.startsWith('pk_test_') ? false
    : null
const serverLivemode = status?.livemode ?? null
const keyModeMismatch =
  typeof serverLivemode === 'boolean'
  && typeof publishableLivemode === 'boolean'
  && serverLivemode !== publishableLivemode
```

### 🔴 One value from each side — and this is the whole design

| Side | Value | Resolved |
|---|---|---|
| Browser | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, read in a `'use client'` component | **BUILD time**, inlined into the bundle |
| Server | `STRIPE_SECRET_KEY` via `platformKeyLivemode()`, arriving in the `status` response | **REQUEST time** |

⚠️ **Comparing the server's own `NEXT_PUBLIC_…` against its own `STRIPE_SECRET_KEY` would have been
easier and would have missed the likelier fault.** That tests whether two *variables* agree; it cannot
see a bundle built before the variable changed. The browser's inlined copy is the one a customer's card
form actually uses, so it is the one that has to be in the comparison.

### What it does when they disagree — it fails loudly and stops

**(a) A red card, above everything else on the tab:**

```tsx
{keyModeMismatch && (
  <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-4">
    <p className="text-sm font-semibold text-red-800">Stripe keys do not match</p>
    <p className="text-xs text-slate-600 mt-1">
      This site's server is using its <strong>{serverLivemode ? 'live' : 'test'}</strong> Stripe key
      while the browser was built with the <strong>{publishableLivemode ? 'live' : 'test'}</strong> one.
      Card payments would fail at the moment a customer tries to pay, so setting up Stripe is
      blocked until they agree.
    </p>
    <p className="text-xs text-slate-500 mt-1">
      Both keys must be set for the same environment, and the site rebuilt afterwards — the
      publishable key is baked in at build time, the secret key is read on every request.
    </p>
  </div>
)}
```

**(b) The Connect button is blocked:**

```tsx
disabled={creating || !!configError || keyModeMismatch}
```

🔴 **Fail loudly rather than proceed, as instructed.** An account created while the keys disagree is a
real, undeletable account whose customers cannot pay. Verified: this is the **only red card** on the tab
— the three from last turn are slate and amber, because a permissions answer and a configuration gap are
ordinary states. This one is a deployment that will take a card and fail.

⚠️ **Null is not a mismatch.** If either side is unknown — no key, an unrecognised prefix, or a `status`
response from before this field existed — `keyModeMismatch` is `false` and nothing is blocked. "We
cannot tell" must never be reported as "they disagree"; that would stop a working install on no
evidence.

⚠️ **No key value or fragment is rendered.** The card names which *side* is in which *mode*, which is
what tells you whether to rebuild or to change the variable, and nothing more.

---

## 3. DOES THE CHECK BELONG ELSEWHERE? — RECOMMENDATION, NOT BUILT

**Yes, and the customer order page is the more important of the two. I have not built it there**, because
it is outside this brief's named scope and you asked for a recommendation rather than an assumption.

### The case for `app/trucks/[slug]/order/page.tsx`

That page mounts the Payment Element with the same inlined publishable key (`:1510`) against a
PaymentIntent created server-side by `authorize.ts` with the secret key. **A mismatch there is the actual
customer-facing failure** — the Payments tab is where an operator would notice it, the order page is
where a customer would suffer it. The Payments tab check is early warning; the order page is the blast
site.

**What I would build there, and it is a different shape:** not a red card. The right behaviour is for
`authorize.ts` to refuse to create the intent and for the page to fall back to Pay-at-Hatch — the same
path it already takes when `cards.offered` is false. A customer must never see a Stripe-keys diagnostic;
they should simply be offered the payment method that works. ⚠️ That is a change to the money path and
to `resolveOnlineCardPayments`'s inputs, which is why it wants its own turn rather than a corner of this
one.

### A third site worth considering

**`lib/payments/authorize.ts`, server-side**, comparing its own `STRIPE_SECRET_KEY` against the server's
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. This catches a *variable* mismatch but **not** a stale bundle, so
it is strictly weaker than the browser comparison — worth adding as a log line rather than a gate, since
it costs nothing and would name the fault in the logs at the moment an intent is created.

### Where it does **not** belong

The webhook route and the capture/refund paths. They never touch the publishable key, so the comparison
is meaningless there.

---

## 4. THE SCRIPT'S SANDBOX REFUSAL — REMOVED

### Before — QUOTED, `scripts/register-payment-domain.cjs:40-45`

```js
const KEY = process.env.STRIPE_SECRET_KEY
if (!KEY) { console.error('STRIPE_SECRET_KEY is not set'); process.exit(1) }
if (!KEY.startsWith('sk_test_')) {
  console.error('REFUSING: STRIPE_SECRET_KEY is not a sandbox key. Remove this guard deliberately when going live.')
  process.exit(1)
}
```

### After — QUOTED

```js
const KEY = process.env.STRIPE_SECRET_KEY
if (!KEY) { console.error('STRIPE_SECRET_KEY is not set'); process.exit(1) }
// ⚠️ THE SANDBOX REFUSAL IS GONE — removed 13 August 2026, the last one left in the repository. It read:
//     if (!KEY.startsWith('sk_test_')) {
//       console.error('REFUSING: STRIPE_SECRET_KEY is not a sandbox key. Remove this guard deliberately when going live.')
//       process.exit(1)
//     }
// and it was written to match the guard in lib/stripe/connect.ts, which came out earlier today. Keeping it
// here would have blocked the ONE manual path for registering Apple Pay and Google Pay domains on a LIVE
// connected account — the failure that shows no error at all, just wallets that never appear.
// 🔴 SO THIS SCRIPT NOW RUNS IN WHATEVER MODE THE KEY IS IN, AND IT SAYS SO BEFORE IT ACTS. Domain
// registration does not flow between modes: registering in live covers sandboxes, registering in a
// sandbox covers nothing live. Read the line below before trusting the run.
console.log(`[register-payment-domain] mode=${KEY.startsWith('sk_live_') ? 'LIVE' : KEY.startsWith('sk_test_') ? 'TEST' : 'UNRECOGNISED KEY PREFIX'}`)
```

The prefix test survives, **but as a label rather than a refusal** — the script announces `mode=LIVE`,
`mode=TEST` or `mode=UNRECOGNISED KEY PREFIX` on its first line, because a sandbox run against a live
account is the failure that produces no error at all.

⚠️ **I also corrected the file's header**, which asserted *"🔴 SANDBOX ONLY, BY THE SAME GUARD THE APP
USES. STRIPE_SECRET_KEY must start with sk_test_."* — the opposite of what the code now does. It now
records what it used to say, states the current behaviour, and keeps the mode-does-not-flow-upwards
warning that is still true. This is a genuine finding rather than a tidy-up: I would not have looked at
it had a verification assertion not failed (section 5).

**For Gusto's live account:** `node scripts/register-payment-domain.cjs acct_…` with the live key set.
Check the `mode=LIVE` line before trusting the result.

---

## 5. VERIFICATION

Pure functions and source assertions via jiti. **Read-only: no database, no network, no Stripe call, no
writes.** The only "live" string used anywhere is the literal
`sk_live_NOT_A_REAL_KEY_verification_only`, which is not a credential.

### The rendered line, by key

```
  sk_live_                 platformKeyLivemode()=true   ->  Live mode. Connecting here creates a real Stripe
                                                            account in your name, and customer payments will
                                                            reach your own bank.
                           styling: text-xs text-slate-600
  sk_test_                 platformKeyLivemode()=false  ->  Test mode. No real payments can be taken yet.
                           styling: text-[11px] text-slate-400
  rk_live_ (unrecognised)  platformKeyLivemode()=null   ->  (nothing rendered)
  unset                    platformKeyLivemode()=null   ->  (nothing rendered)
```

### The mismatch matrix — all seven cases

```
  live server     + pk_live_x   -> agree — no card, Connect allowed
  test server     + pk_test_x   -> agree — no card, Connect allowed
  live server     + pk_test_x   -> MISMATCH — red card, Connect BLOCKED
  test server     + pk_live_x   -> MISMATCH — red card, Connect BLOCKED
  unknown server  + pk_live_x   -> unknown — no card, Connect allowed
  live server     + wat         -> unknown — no card, Connect allowed
  live server     + undefined   -> unknown — no card, Connect allowed
```

**What a mismatch produces**, concretely, for a live server with a test bundle:

> **Stripe keys do not match**
> This site's server is using its **live** Stripe key while the browser was built with the **test** one.
> Card payments would fail at the moment a customer tries to pay, so setting up Stripe is blocked until
> they agree.
> Both keys must be set for the same environment, and the site rebuilt afterwards — the publishable key
> is baked in at build time, the secret key is read on every request.

…and the Connect button beside it is disabled.

### Source assertions — 13 of 13

```
  PASS  the Test-mode literal is now guarded, not bare
  PASS  the test line now renders only when serverLivemode === false
  PASS  the live line renders only when serverLivemode === true
  PASS  server sends livemode from platformKeyLivemode()          (both status returns)
  PASS  Connect is blocked on a mismatch
  PASS  the mismatch card is the only red CARD
  PASS  no key value or fragment is rendered
  PASS  script sandbox refusal removed
  PASS  script header no longer asserts sandbox-only
  PASS  script now announces its mode
  PASS  the three-way copy split from last turn is untouched
  PASS  admin read-only note untouched
  PASS  requireOwner untouched
```

### 🔴 FOUR FAILING ASSERTIONS, AND ONE OF THEM WAS REAL

The first run reported four failures. I checked each against the source rather than assuming:

| Assertion | Verdict |
|---|---|
| "the unconditional Test-mode literal is gone" | **Assertion bug.** The literal appears twice — guarded at `:512`, and quoted at `:495` inside the comment recording what it used to be. Rewritten to assert the guard and the literal **as a pair**. |
| "the mismatch card is the only red one" | **Assertion bug.** `border-red-200` also appears twice in `HEADER` as the `restricted` / `unsupported` **chip** class, pre-existing. Narrowed to the card's full class string. |
| "script sandbox refusal removed" | 🔴 **Assertion bug that exposed a real defect.** The bare `sk_test_` test matched the new mode *announcement*. But narrowing it surfaced that the file's header still asserted **"SANDBOX ONLY … must start with sk_test_"** — stale, and now the opposite of the code. **Fixed** (section 4). |
| "the three-way copy split untouched" | **Assertion bug.** Two of the three headlines live in a JS ternary with plain apostrophes; only the JSX one uses `&apos;`. |

⚠️ Three of the four were the same trap I have now hit on four consecutive turns: **an assertion matching
the comment that documents the change rather than the code that makes it.** Worth naming as a pattern —
prose that quotes the old code is a feature of this codebase's style, and blunt substring assertions will
keep colliding with it.

### What I can prove from the repo

- `platformKeyLivemode()` returns `true` / `false` / `null` for `sk_live_` / `sk_test_` / anything else,
  and the line renders accordingly with the stated classes.
- The mismatch predicate is correct across all seven combinations, including all three unknown cases.
- The route returns `livemode` on both `status` paths.
- Connect is disabled when the modes disagree, and the mismatch card is the only red card.
- The script's refusal and its stale header are gone; the mode announcement is in place.
- Nothing fenced was touched.

### 🔴 What needs you, on Vercel

- **That Production's `STRIPE_SECRET_KEY` really is `sk_live_`.** Your Stripe error — *"The provided key
  sk_live_… does not have access to account acct_1U30w22fB4PPCw2D"* — is strong evidence and I have taken
  it as established, but it is a fact about the deployment and not something the repo can confirm.
  ⚠️ That error is also exactly the sandbox-account-under-a-live-key case predicted in
  `docs/live-key-guard-report.md` §5b.
- **Whether the shipped bundle carries `pk_live_` or `pk_test_`.** Until this deploys, the new card
  cannot tell you — it needs the build that contains it. After deploying: if the red card appears, the
  keys disagree and the fix is in the card; if the line reads "Live mode", both agree and are live.
- **The `mode=` line** the next `register-payment-domain.cjs` run prints.

---

## 6. NON-ASCII CENSUS

| File | Classes before | Classes after | Gained |
|---|---|---|---|
| `app/api/stripe/connect/route.ts` | 8 | 8 | **none** |
| `components/manage/PaymentsTab.tsx` | 10 | 10 | **none** |
| `scripts/register-payment-domain.cjs` | 7 | 7 | **none** |

Every glyph added — `🔴`, `⚠️`, `—`, `─` — was already in each file's vocabulary.

---

## 7. WHAT WAS NOT TOUCHED

- **`requireOwner`** — byte-identical; asserted.
- **The platform-admin read-only access** — `requirePlatformAdmin`, `ADMIN_READABLE_ACTIONS` and the
  "Viewing as platform admin" note are unchanged; asserted.
- **The three-way copy split from last turn** — the permissions, configuration and reachability cards are
  unchanged; asserted. The new red card sits **above** them and replaces none of them.
- **What pressing Connect does** — `createAccount`, `create_account`, `createConnectedAccount`, the
  persist, the posture read and the domain registration are all unchanged. Only *when the button is
  pressable* changed, which is what "fail loudly rather than proceed" requires.
- **The customer order page** — not opened; section 3 is a recommendation only.
- **Environment variables** — none read for its value from any deployment, none changed.
