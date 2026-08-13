# What is disabling "Connect Stripe", and what turning it on involves

Date: 13 August 2026
Status: READ-ONLY DIAGNOSIS. **No file was changed.** This report is the only file created.
No `next dev`, no `next build`, no commit, no deploy. No fix proposed or applied.

Nothing in the prompt arrived garbled. No instruction contradicted another.

No secret value is printed anywhere below — environment variables are reported by **name, presence and
prefix class only**.

---

## 0. 🔴 THE HEADLINE, BEFORE ANYTHING ELSE

Three findings, in the order that matters to you:

1. **There is no gate on the "Connect Stripe" button.** Its only disabler is a client-side variable
   called `configError`, and for **real-thai-food** and **pizzeria-gusto** as their data stands right now,
   that evaluates to `null` — **the button is ENABLED for both**. No plan gate, no feature flag, no truck
   column, no operator column, no environment flag touches it. **QUOTED + live values, section 2.**

2. **The thing that actually stopped trucks onboarding was a server-side guard, and it was removed
   earlier today — by me, at your instruction.** `assertSandboxKey` in `lib/stripe/connect.ts` threw on
   any key not starting `sk_test_`. It is gone from `HEAD` (`docs/live-key-guard-report.md`). That is
   almost certainly the thing you remember disabling: it did not grey the button, it made pressing it
   fail with a red toast.

3. 🔴 **Your keys are LIVE.** `STRIPE_SECRET_KEY` has prefix `sk_live_` and
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` has prefix `pk_live_`. With the guard gone, **pressing "Connect
   Stripe" now creates a REAL, live, undeletable Stripe connected account** — see section 5 for exactly
   where that becomes irreversible.

⚠️ **One thing I cannot establish: what is deployed.** The guard removal is in `HEAD` of this working
copy. Whether the running site has that build is not visible from here — you own deploys. If production
is still on the older build, the button is enabled there too but pressing it throws
`"REFUSING: STRIPE_SECRET_KEY is not a sandbox key"`.

---

## 1. THE CONTROL AND EVERY CONDITION — QUOTED

### The control

**QUOTED** — `components/manage/PaymentsTab.tsx:335-343`:

```tsx
{state === 'not_connected' && (
  <button
    onClick={createAccount}
    disabled={creating || !!configError}
    className="mt-3 w-full sm:w-auto px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50"
  >
    {creating ? 'Connecting…' : 'Connect Stripe'}
  </button>
)}
```

`grep -rn "Connect Stripe"` across `app`, `lib` and `components` returns **this file only**. There is no
second Connect control anywhere. **QUOTED.**

### Every condition governing it

| # | Condition | Effect | File:line |
|---|---|---|---|
| **A** | `state === 'not_connected'` | **HIDDEN** when false | `components/manage/PaymentsTab.tsx:335` |
| **B** | `creating` | **GREYED** while true | `components/manage/PaymentsTab.tsx:338` |
| **C** | `!!configError` | **GREYED** while true | `components/manage/PaymentsTab.tsx:338` |
| **D** | `disabled:opacity-50` | the greying itself | `components/manage/PaymentsTab.tsx:339` |
| **E** | tab role `['owner']` | the whole Payments **tab** is hidden from non-owners | `app/manage/[token]/page.tsx:533` |
| **F** | `loading` | the entire tab renders "Checking your Stripe account…" and nothing else | `components/manage/PaymentsTab.tsx:242-244` |

And the two feeding **C** — **QUOTED**, `components/manage/PaymentsTab.tsx:190-192`:

```tsx
const keyMissing = !!status?.accountId && !publishableKey
const configError = fetchError
  ?? (keyMissing ? 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — the embedded components cannot load.' : null)
```

**That is the complete list.** There is nothing else on the button, no wrapper, no `FeatureGate`, no
`pointer-events-none`, no `cursor-not-allowed`.

### ⚠️ THE OTHER GREY THING ON THIS SCREEN, WHICH IS NOT THIS BUTTON

**QUOTED** — `components/manage/PaymentsTab.tsx:568`:

```tsx
<div className="flex items-start gap-2 opacity-60">
  <span className="mt-0.5 w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
  <span className="text-sm min-w-0">
    <span className="font-medium text-slate-700">Through HatchGrab</span>
    <span className="ml-2 … border-slate-200">Coming soon</span>
    <span className="block text-xs text-slate-400 mt-0.5">
      Uses the same Stripe connection as your online payments — a card reader, or contactless
      straight from your phone or tablet.
    </span>
```

🔴 **This row is dimmed unconditionally — `opacity-60` is a literal class with no condition behind it at
all**, and it is the only permanently-grey thing in Manage → Payments. It sits in the **walk-up** card,
one section below the online one, and its description mentions Stripe. Its own comment says why
(`:536-539`): *"'Through HatchGrab' is COMING SOON … dimmed with a badge, never a disabled radio."*

**I cannot see your screen, so I am not going to tell you which of the two you are looking at.** If the
greyed thing carries a **"Coming soon"** badge and a radio circle, it is this row, and there is no toggle
— it is a hardcoded state awaiting Terminal/Tap to Pay. If it is an **orange button reading "Connect
Stripe"**, it is the button above, and section 2 says what would have to be true for it to be grey.

---

## 2. WHERE EACH CONDITION'S VALUE COMES FROM, AND WHAT IT EVALUATES TO

### Live values, read just now

**QUOTED from the database:**

| Column | real-thai-food | pizzeria-gusto |
|---|---|---|
| `trucks.plan` | `trial` | `trial` |
| `trucks.online_payments_paused_at` | `null` | `null` |
| `operators.stripe_account_id` | **`null`** | **`null`** |
| `operators.stripe_charges_enabled` | `false` | `false` |
| `operators.stripe_account_livemode` | `null` | `null` |
| `operators.stripe_account_synced_at` | `null` | `null` |

**Environment (`.env.local`, presence and prefix only):**

| Variable | State |
|---|---|
| `STRIPE_SECRET_KEY` | 🔴 set, prefix **`sk_live_`** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 🔴 set, prefix **`pk_live_`** |
| `STRIPE_WEBHOOK_SECRET` | set, prefix `whsec_` |
| `NEXT_PUBLIC_PRICING_PUBLISHED` | absent |

### Condition by condition

| Condition | Source | real-thai-food | pizzeria-gusto |
|---|---|---|---|
| **A** `state === 'not_connected'` | `derivePaymentsState` (`lib/stripe/payments-state.ts:84`) over four fields returned by `/api/stripe/connect` action `status` | `accountId: null` → **`not_connected`** → button **RENDERS** | identical → **RENDERS** |
| **B** `creating` | React state, set only inside `createAccount` (`:194`, `:211`) | `false` at rest | `false` |
| **C** `configError` | `fetchError ?? (keyMissing ? … : null)` | see below → **`null`** | **`null`** |
| — `fetchError` | thrown by `post('status')` on tab open (`:151-163`); the route returns 403 without owner auth, 500 on any Stripe/DB failure | route's `status` branch returns **200 with `accountId: null` before touching Stripe** (`app/api/stripe/connect/route.ts:98-104`) → **`null`** | **`null`** |
| — `keyMissing` | `!!status?.accountId && !publishableKey` | `accountId` is `null`, so `false` **regardless of the key** | `false` |
| **E** tab role | `{ id: 'payments', label: 'Payments', icon: '💷', roles: ['owner'] }` | tab visible to the **owner only** | same |

**QUOTED**, `app/api/stripe/connect/route.ts:98-104` — the branch that decides it:

```ts
if (action === 'status') {
  if (!operator?.stripe_account_id) {
    return NextResponse.json({
      accountId: null, chargesEnabled: false, syncedAt: null,
      detailsSubmitted: false, cardPaymentsStatus: null,
    })
  }
```

**Result — INFERRED from QUOTED code and QUOTED live values:**

> `disabled={creating || !!configError}` → `false || !!null` → **`false`.**
> **The "Connect Stripe" button is ENABLED for both trucks.**

🔴 **So if it is genuinely rendering grey, the cause is a RUNTIME failure of the `status` POST, not a
setting** — and the amber card at `:264-269` would be on screen directly above it carrying the reason:

```tsx
{configError && (
  <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-4">
    <p className="text-sm font-semibold text-amber-800">Card payments aren&apos;t configured yet</p>
    <p className="text-xs text-slate-500 mt-1">{configError}</p>
  </div>
)}
```

**If that amber card is present, its second line is the exact answer** and I have not had to guess. The
realistic causes are `Unauthorised` (403 — the token is not an owner's) or a 500 from the route.

### ⚠️ YOUR NOTE WAS RIGHT — THE FEATURE FLAGS ARE INERT. RE-VERIFIED.

```
grep -rn "online_ordering_pay_at_hatch\|'online_payments'" --include="*.ts" --include="*.tsx" app lib components
```

**Every hit outside the definitions in `lib/features.ts` / `lib/plan-features.ts` is a single one:**
`app/admin/page.tsx:185`, where `'online_payments'` appears inside `OVERRIDEABLE_FEATURES` — the admin
per-truck override list. **There is no `canAccess`, no `hasFeature`, no `getPlanFeatures` call anywhere
that reads either flag.** They exist, they appear in the comparison tables, and they gate nothing.

Two more that look like gates and are not:

- **`connectConfigured()`** (`lib/stripe/connect.ts:446`) — still **zero call sites**. It is exported,
  dead, and reads like the gate. Until this morning it also required `sk_test_`, so it would have
  returned `false` on your live key — for nobody.
- **`trucks.online_payments_paused_at`** — a real gate on `resolveOnlineCardPayments`, which governs
  whether a **customer** is offered a card at checkout. It is `null` for both trucks and does not touch
  this button.

---

## 3. WHAT WOULD HAVE TO CHANGE TO ENABLE IT

### 🔴 Nothing. There is no gate to turn on.

**For one truck: not established as possible, because no per-truck condition exists.** There is no
column, no override and no flag scoped to a truck that governs this button. `feature_overrides` exists
and `canAccess` honours it, but nothing on this path calls `canAccess`, so setting
`online_payments: true` on one truck would change nothing.

**For all trucks: already done.** The only thing that ever blocked onboarding was the server-side guard,
and it is gone from `HEAD`:

```
$ git show HEAD:lib/stripe/connect.ts | grep -n "assertSandboxKey\|requireStripeKey"
102:function requireStripeKey(key: string | undefined): string {
```

The guard it replaced read, verbatim (from `docs/live-key-guard-report.md`):

```
throw new Error(
  '[stripe/connect] REFUSING: STRIPE_SECRET_KEY is not a sandbox key. This build may only create ' +
  'test-mode connected accounts. Remove this guard deliberately, in its own change, when live ' +
  'accounts are switched on.',
)
```

**It was a code change, not a setting — and so is putting it back.** There is no toggle, no env var and
no admin switch for this, in either direction. **QUOTED.**

### If you want it OFF again, these are the shapes available — stated, not recommended

None of these exists today; each would be new code:

1. Restore a key-prefix refusal in `lib/stripe/connect.ts` — blocks **every** truck, fails at press time
   with a red toast, not a grey button.
2. Gate the button on `canAccess(plan, 'online_payments', overrides)` — would make the two inert flags
   real and give you a **per-truck** switch via `feature_overrides`.
3. An env flag read by the route — blocks everyone, one deploy to flip.

Option 2 is the only one that gives per-truck control, and it is the one the flags were evidently
intended for.

---

## 4. WHAT ELSE THE SAME CONDITION GATES

**`configError` gates exactly two things, both in `PaymentsTab.tsx`:**

1. The amber "Card payments aren't configured yet" card (`:264-269`).
2. The `disabled` on this button (`:338`).

Nothing else in the app reads it. **QUOTED.**

**The wider blast radius of the removed sandbox guard** — `assertSandboxKey` sat inside `stripeClient()`,
so it governed **every** function in `lib/stripe/connect.ts`. With it gone, all of these now run against
whatever key is set:

| Function | Reached from | What it now does live |
|---|---|---|
| `createConnectedAccount` | `create_account` | creates a real account |
| `createAccountSession` | `account_session` | mints a session for the embedded form |
| `readAccountReadiness` | `status` | reads a live account |
| `readAccountRequirements` | `requirements` | reads live requirements |
| `readAccountPosture` | `create_account` | verifies `fees_collector` |
| `registerPaymentMethodDomains` | `create_account` (`route.ts:272`) | registers `www.hatchgrab.com` on the live account |

⚠️ **And separately, the same removal unblocked the money path** — `authorize.ts`, `capture.ts` and
`refund.ts` each had their own copy of the refusal and each lost it today. Those are not gated by this
button, but they are gated by the same decision. **Turning this control on is not a payments-only
change; the payment path is already un-guarded.**

---

## 5. 🔴 WHAT HAPPENS THE INSTANT IT IS PRESSED — AND WHERE YOU CAN STOP

**QUOTED**, the client (`PaymentsTab.tsx:193-212`): `createAccount` sets `creating`, POSTs
`create_account`, and on failure only shows a red toast — it never sets `configError`, so a failed
attempt does **not** grey the button.

**QUOTED**, the server (`app/api/stripe/connect/route.ts`), in execution order:

| Step | Line | What it does | Reversible? |
|---|---|---|---|
| 1 | `:155` | If `operators.stripe_account_id` is already set, **return it and stop.** Idempotent by read, deliberately: *"A duplicate `acct_…` cannot be merged or deleted."* | n/a — nothing happens |
| 2 | 🔴 `:159` | **`createConnectedAccount({ email, country, businessUrl: null })`** → `POST /v2/core/accounts`, `Stripe-Version: 2026-07-29.dahlia`, `fees_collector: 'stripe'` | 🔴 **NO. THIS IS THE POINT OF NO RETURN.** |
| 3 | `:196` | `UPDATE operators SET stripe_account_id, stripe_account_livemode, stripe_account_synced_at` — one statement, so the id and its mode cannot be half-written | the row is editable; the account is not |
| 4 | `:229` | `readAccountPosture` + `postureMismatches` — verifies who pays Stripe's fees. **Best-effort, non-fatal**, logged not shown | yes |
| 5 | `:272` | `registerPaymentMethodDomains(account.id)` — registers `www.hatchgrab.com` for Apple/Google Pay. **Cannot throw**, failures logged | yes |
| 6 | client | `setStatus({ accountId, … })` → state leaves `not_connected` → the embedded Connect onboarding form mounts via `account_session` (`:301`) and the page scrolls to it | yes — the operator can simply not fill it in |

### Where you can stop

- **Before pressing: everywhere.** `operators.stripe_account_id` is `null` for both trucks; nothing
  exists at Stripe for either.
- **After pressing: nowhere.** Step 2 has no confirmation dialogue, no "are you sure", and no dry run.
  The route's own comment at `:165-167` states it: *"The account already exists at Stripe by this line
  and CANNOT BE DELETED."*
- **Steps 4-6 are all recoverable** and none of them is a commitment by the operator. The operator's
  own commitment — bank details and photo ID — happens later, inside Stripe's embedded form, and **not
  filling it in leaves the account existing but `charges_enabled: false`**.

🔴 **With `sk_live_` set, step 2 creates a LIVE account** — `livemode` is read back off Stripe's own
object at `:190-192` and written to `operators.stripe_account_livemode`, so you will see `true` there
the moment it happens. That column is your check that a real account was made.

### The safe way to look without committing — INFERRED, and it is your call, not a recommendation

The only step that cannot be undone is the one function call at `:159`. Everything before it — opening
the tab, the `status` read, the amber card — touches Stripe **not at all** while
`stripe_account_id` is `null`. So the tab can be opened and inspected freely; it is only the button
press that is final.

---

## 6. NOT ESTABLISHED

- **Which greyed element you are actually looking at** — the "Connect Stripe" button (which evaluates to
  enabled) or the "Through HatchGrab / Coming soon" row (which is unconditionally dimmed). Section 1 gives
  the two-second test: a **"Coming soon" badge** means the second one.
- **What is deployed.** The guard removal is in `HEAD` of this working copy; whether production is
  running that build is not visible from here.
- **Whether the `status` POST is currently failing in your browser.** If it is, `configError` carries the
  reason and it is printed on screen in the amber card — I can read the code but not your session.
- **Whether a Stripe live Connect profile exists for the platform.** Section 7.3 of
  `docs/live-key-guard-report.md` records that live mode needs its own platform Connect configuration
  before Stripe will allow live connected accounts to be created. If it is absent, step 2 fails at the
  API rather than creating anything — which would, in practice, be a safety net. **I did not test this,
  because testing it means attempting a live account creation.**
