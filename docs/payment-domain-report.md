# Payment method domain registration on connected accounts

**Date:** 13 August 2026
**BUILD. Two files edited, one script created. No migration needed and none written. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE MEASUREMENT THAT PROVES THE DIAGNOSIS

Read live from Stripe, read-only, before anything was built:

```
PLATFORM account domains:
   pmd_1U3dZiGk3iTPlj9EDoI6pHqr  www.hatchgrab.com   enabled=true applePay=active googlePay=active

CONNECTED account acct_1U30w22fB4PPCw2D domains:
   pmd_1U31rA2fB4PPCw2DFlv9MVUv  checkout.stripe.com enabled=true applePay=active googlePay=active
```

🔴 **THE TRUCK'S ACCOUNT HAS `checkout.stripe.com` AND NOTHING ELSE.** That entry was auto-registered by the old hosted Checkout — which is exactly why wallets worked on the hosted page and vanished the moment the Payment Element moved in-page.

✅ **AND `www.hatchgrab.com` IS REGISTERED ON THE PLATFORM, WHERE IT DOES NOTHING FOR A DIRECT CHARGE.** That is the "toggling it on the platform appears to undo itself" symptom, measured rather than assumed.

---

## 1. The SDK — confirmed, not guessed

**Source: QUOTED**, from `node_modules/stripe/cjs/resources/PaymentMethodDomains.d.ts` (stripe **22.4.0**).

✅ **THE SDK EXPOSES IT IN FULL.** The accessor is `stripe.paymentMethodDomains` (`stripe.core.d.ts:188` — `paymentMethodDomains: PaymentMethodDomainResource`).

```ts
export declare class PaymentMethodDomainResource extends StripeResource {
    list(params?: PaymentMethodDomainListParams, options?: RequestOptions): ApiListPromise<PaymentMethodDomain>;
    create(params: PaymentMethodDomainCreateParams, options?: RequestOptions): Promise<Response<PaymentMethodDomain>>;
    retrieve(id: string, params?: PaymentMethodDomainRetrieveParams, options?: RequestOptions): Promise<Response<PaymentMethodDomain>>;
    update(id: string, params?: PaymentMethodDomainUpdateParams, options?: RequestOptions): Promise<Response<PaymentMethodDomain>>;
    validate(id: string, params?: PaymentMethodDomainValidateParams, options?: RequestOptions): Promise<Response<PaymentMethodDomain>>;
}
```

**The exact parameters:**

```ts
export interface PaymentMethodDomainCreateParams {
    /** The domain name that this payment method domain object represents. */
    domain_name: string;
    /** Whether this payment method domain is enabled. If the domain is not enabled, payment methods that
     *  require a payment method domain will not appear in Elements or Embedded Checkout. */
    enabled?: boolean;
    expand?: Array<string>;
}
export interface PaymentMethodDomainListParams extends PaginationParams {
    domain_name?: string;
    enabled?: boolean;
    expand?: Array<string>;
}
```

**And the connected-account header** — `lib.d.ts:94`, on `RequestOptions`:
```ts
    stripeAccount?: string;
```

**The returned object carries a per-wallet status**, which is what makes verification possible:
```ts
    apple_pay: PaymentMethodDomain.ApplePay;   // { status: 'active' | 'inactive' | OtherString, status_details?: { error_message } }
    google_pay: PaymentMethodDomain.GooglePay;
    enabled: boolean;
    livemode: boolean;
```

✅ **Every point in your established list is confirmed by the types or by the measurement above.** ⚠️ **One nuance the types add:** `apple_pay.status` can be `'inactive'` with a `status_details.error_message` — so *registered* and *working* are not the same thing, and the code records both.

---

## 2. Where it runs in onboarding

**Source: QUOTED.** `app/api/stripe/connect/route.ts`, inside `action === 'create_account'`, after the persist and after the posture read:

```ts
      const domainResults = await registerPaymentMethodDomains(account.id)
      for (const r of domainResults) {
        if (r.status === 'failed') {
          console.error(
            `[stripe/connect] 🔴 PAYMENT METHOD DOMAIN NOT REGISTERED — account=${account.id} ` +
            `domain=${r.domain}: ${r.detail}. The account is FINE and can take cards; Apple Pay and ` +
            `Google Pay will NOT appear for this truck until it is registered by hand ` +
            `(scripts/register-payment-domain.cjs).`,
          )
        } else {
          console.log(
            `[stripe/connect] payment method domain ${r.status} account=${account.id} domain=${r.domain} ` +
            `applePay=${r.applePay ?? 'unknown'} googlePay=${r.googlePay ?? 'unknown'}`,
          )
        }
      }
```

### Why exactly there

🔴 **`create_account` IS THE ONLY PLACE AN ACCOUNT COMES INTO EXISTENCE**, and it returns early when one already exists:
```ts
      if (operator?.stripe_account_id) {
        return NextResponse.json({ accountId: operator.stripe_account_id, alreadyExisted: true })
      }
```
✅ **So this runs exactly once per connected account through the normal flow** — and the helper is idempotent anyway, so a retry or a hand-run costs two reads and no writes.

⚠️ **It sits LAST, after the persist and the posture check, deliberately.** Those two decide whether the operator has a usable account and whether HatchGrab is paying their Stripe fees. This decides whether a wallet button appears. **It is last because it matters least.**

---

## 3. Idempotent and non-fatal

### Idempotent — it asks before it writes

```ts
      const existing = await stripe.paymentMethodDomains.list(
        { domain_name: domain, limit: 1 },
        { stripeAccount: accountId },
      )
      const found = existing.data[0]
      if (found) {
        results.push({
          domain, status: 'already',
          applePay: found.apple_pay?.status, googlePay: found.google_pay?.status,
        })
        continue
      }
```

✅ **Filtered by `domain_name` with `limit: 1`, so it is one cheap lookup, not a scan.** Stripe's guidance is not to register a domain more than once per account; **a second run is a pair of reads and no writes.**

### Non-fatal — 🔴 IT CANNOT THROW AT ALL

```ts
export async function registerPaymentMethodDomains(accountId: string): Promise<DomainRegistrationResult[]> {
  const results: DomainRegistrationResult[] = []
  let stripe: Stripe
  try {
    stripe = stripeClient()
  } catch (err) {
    // The sandbox guard, or a missing key. Report it as a failure per domain rather than throwing.
    return paymentMethodDomains().map(domain => ({
      domain, status: 'failed' as const,
      detail: err instanceof Error ? err.message : 'stripe client unavailable',
    }))
  }
```
```ts
    } catch (err) {
      results.push({
        domain, status: 'failed',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
```

🔴 **EVERY FAILURE PATH IS CAPTURED INTO A RESULT ROW — including the sandbox-key guard, which is the one that would otherwise throw on a misconfigured environment.** The function's return type has no failure mode; the caller logs and continues.

**Why, in the code's own words:**
> *"Onboarding must never break over a wallet: the account already exists at Stripe and cannot be deleted, so failing the request now would strand the operator without undoing anything. A truck with no wallet registration still takes cards perfectly well."*

⚠️ **`enabled: true` is passed explicitly** even though it is the default, because *"a domain registered disabled shows no wallets and looks identical to one that was never registered."*

---

## 4. Which domains, and why

🔴 **ONE: `www.hatchgrab.com`. THE BARE DOMAIN IS DELIBERATELY NOT REGISTERED.**

**Measured, not assumed:**
```
hatchgrab.com      -> 307  Location: https://www.hatchgrab.com/
www.hatchgrab.com  -> 200  Location:
```

✅ **The bare host answers 307 to www**, so a customer never has a Payment Element mounted on it. Registering `hatchgrab.com` would verify a domain nothing renders on.

```ts
export function paymentMethodDomains(): string[] {
  const raw = process.env.NEXT_PUBLIC_HATCHGRAB_URL
  if (!raw) return ['www.hatchgrab.com']
  try { return [new URL(raw).hostname] } catch { return ['www.hatchgrab.com'] }
}
```

⚠️ **Derived from `NEXT_PUBLIC_HATCHGRAB_URL`** (`https://www.hatchgrab.com`), so a preview deployment registers its own host rather than silently registering production's.
⚠️ **It returns a LIST and every caller loops**, precisely so that if the redirect is ever removed, adding the bare domain is a one-line change.
⚠️ **`www.villagefoodie.co.uk` is NOT registered.** `NEXT_PUBLIC_BASE_URL` points there, but the card path builds every URL from `NEXT_PUBLIC_HATCHGRAB_URL`. **If the Element is ever served from the Village Foodie host, that host needs its own registration.**

---

## 5. The one-off script

**`scripts/register-payment-domain.cjs`** — created, not run against live writes.

### 🔴 THE EXACT COMMAND

```
node scripts/register-payment-domain.cjs acct_1U30w22fB4PPCw2D
```

**Other forms:**
```
node scripts/register-payment-domain.cjs acct_1U30w22fB4PPCw2D --dry-run   # list only, writes nothing
node scripts/register-payment-domain.cjs --all                             # every operator with an account
```

### What success looks like

**First run:**
```
domains: www.hatchgrab.com
accounts: 1

  acct_1U30w22fB4PPCw2D  www.hatchgrab.com  REGISTERED  id=pmd_… enabled=true applePay=active googlePay=active

registered=1 already=0 failed=0
```

✅ **`registered=1 … failed=0`, and — the part that actually matters — `applePay=active googlePay=active`.**

⚠️ **`applePay=inactive` WOULD MEAN REGISTERED BUT NOT WORKING.** The object carries `status_details.error_message` in that case; the domain exists but the wallet will still not render. **Treat `inactive` as a failure even though the exit code is 0.**

**Second run — safe, and this is the proof it is safe:**
```
  acct_1U30w22fB4PPCw2D  www.hatchgrab.com  ALREADY REGISTERED  id=pmd_… enabled=true applePay=active googlePay=active

registered=0 already=1 failed=0
```
✅ **`already=1` and nothing written.** The exit code is **0** — a rerun is a success, not a no-op to worry about.

**Failure:**
```
  acct_…  www.hatchgrab.com  🔴 FAILED: <stripe message>
registered=0 already=0 failed=1
```
Exit code **1**.

### Guards in the script

- 🔴 **Refuses a non-`sk_test_` key**, the same guard `lib/stripe/connect.ts` applies.
- ✅ **Refuses to do anything without an explicit `acct_…` or `--all`** — it cannot be run by accident.
- ⚠️ **Loads `.env.local` itself** and takes no new dependency.

---

## 6. 🔴 NOTHING RECORDS THAT REGISTRATION SUCCEEDED. THE GAP, STATED PLAINLY.

**Source: QUOTED. There is no column, no table and no flag.**

- **`operators`** carries `stripe_account_id`, `stripe_charges_enabled`, `stripe_account_livemode`, `stripe_account_synced_at` — **and nothing about domains.**
- The onboarding call **logs and moves on**. A failure produces a `console.error` and nothing durable.
- **No migration was written**, per your instruction.

### What that means in practice

| Question | Answerable today? |
|---|---|
| "Did this truck's domain registration succeed?" | 🔴 **Only by asking Stripe** — `paymentMethodDomains.list` with `{ stripeAccount }`, one call per account |
| "Which trucks are missing it?" | 🔴 **Only by iterating every account against Stripe.** `--all` does exactly that and is the closest thing to a report |
| "Did it silently fail during onboarding six weeks ago?" | ⚠️ **Only from Vercel logs**, if they are still in retention |

⚠️ **THE FAILURE IS SILENT AND COSMETIC, WHICH IS THE WORST COMBINATION FOR NOTICING IT.** A truck with no registration takes cards perfectly well and simply never shows a wallet button — nobody complains, because nobody knows what they are not seeing. **That is precisely how `acct_1U30w22fB4PPCw2D` reached today with only `checkout.stripe.com`.**

**If you later want to fill it:** the honest minimum is one nullable `timestamptz` on `operators` written after a successful registration, plus reading it in `go-live-checks`. **Not built, and not proposed as part of this change.**

---

## VERIFICATION

### ✅ Proved from here, read-only

**1. The SDK exposes the method with the exact parameters** — §1, quoted from the installed `.d.ts`.

**2. The connected account's currently registered domains** — the measurement at the top of this report. 🔴 **`www.hatchgrab.com` is absent from `acct_1U30w22fB4PPCw2D` and present on the platform.**

**3. The script runs, resolves the right domain, and writes nothing in dry-run** — executed:
```
DRY RUN — domains: www.hatchgrab.com
accounts: 1

  acct_1U30w22fB4PPCw2D  www.hatchgrab.com  WOULD REGISTER (dry run — nothing written)

registered=0 already=0 failed=0
=== exit code: 0 ===
```
✅ **It correctly identifies that the registration is missing** — which independently confirms the diagnosis through a second code path.

**4. Gates:**
```
tsc: clean
eslint — lib/stripe/connect.ts and app/api/stripe/connect/route.ts: 0 errors before, 0 after
```

### 🔴 NEEDS YOU TO RUN IT

| # | What | How |
|---|---|---|
| 1 | **Register the domain on Test Kitchen** | `node scripts/register-payment-domain.cjs acct_1U30w22fB4PPCw2D` — expect `registered=1 … failed=0` and `applePay=active googlePay=active` |
| 2 | **Confirm the rerun is safe** | Run it again — expect `already=1`, nothing written |
| 3 | 🔴 **Confirm the wallet actually renders** | Open the order page **in Safari, on a device with a card in Wallet**, choose Pay by card. The Apple Pay button should appear above the card fields. **This is the only test that proves the whole chain**; a registration can be `active` and still not render if the device has no card |
| 4 | **New-account path** | Onboard a fresh test operator and check the log for `payment method domain registered account=… applePay=active` |
| 5 | ⚠️ **Before going live** | Re-run with a **live** key against every live connected account. **Sandbox registration does not cover live** |

---

## NON-ASCII CENSUS

| File | Before (total / distinct) | After | New class? |
|---|---|---|---|
| `lib/stripe/connect.ts` | 412 / 9 | 455 / 9 | ✅ **none** |
| `app/api/stripe/connect/route.ts` | 318 / 8 | 335 / 8 | ✅ **none** |
| `scripts/register-payment-domain.cjs` | — (new) | 27 / 7 | — |

✅ **Both edited files keep an identical distinct set.** The new script uses `─ 🔴 — ⚠️ … ✅`, all already in wide use.

---

## What was NOT touched

| Constraint | Held? |
|---|---|
| Payment Element, PaymentIntent creation, `promoteDraft`, webhook, cron sweep | ✅ **Not opened** |
| `payment_method_types` — Link stays disabled | ✅ **Not opened.** `lib/payments/authorize.ts` is untouched by this change |
| Anything else | ✅ Two files edited, one script added |

🔴 **NO MIGRATION IS NEEDED**, and none was written — see §6 for the recording gap that a migration *would* fill, which you asked to know about rather than fill.

## Not established

- 🔴 **Whether the wallet renders after registration.** Registration is necessary, not sufficient: Safari, a device with a card in Wallet, and HTTPS are all still required, and none is checkable from here. **§V test 3.**
- ⚠️ **Whether any OTHER connected account is missing the registration.** Only `acct_1U30w22fB4PPCw2D` was inspected. `--all` would answer it in one run.
- ⚠️ **Whether `apple_pay.status` comes back `active` immediately on creation** for this account. The dry run cannot know; test 1 will show it.
- **Whether Village Foodie's host ever serves the Element.** If it does, it needs its own registration (§4).
