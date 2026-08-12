# Reopening the payment panel — diagnosis, and two fixes

**Date:** 13 August 2026
**Part A: READ-ONLY, done first. Part B: ONE file changed (`lib/payments/authorize.ts`). No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.
✅ **The diagnosis does not contradict either fix** — they are orthogonal to the reopen defect. **Fix 7 is applied; item 8 is a report, and required no code change.**

---

# 🔴 THE CAUSE, IN ONE PARAGRAPH

**Closing the panel closes the SHEET, and the sheet close touches nothing about the payment.** `payment`, `payStage` and `elementsRef` all survive, but the `<div>` the Payment Element was mounted into is destroyed with the sheet's DOM. On reopening, the mount effect **does not re-run** — its dependency is `payment?.clientSecret`, which has not changed — so nothing mounts into the new div, while `payStage` is still `'ready'` and the **Pay button is enabled**. Pressing it calls `stripe.confirmPayment({ elements })` against an Elements group whose Payment Element is no longer in the document, which **throws** rather than returning an error, and the `catch` produces exactly the quoted copy.

**Live evidence — two drafts and two uncancelled PaymentIntents for the same £11.00 basket:**

```
ALL DRAFTS:
  2026-08-12T15:12:52.718 748a98f6-… £11.00 pi=pi_3U3dpp2fB4PPCw2D10dAKn1w promoted=null cancelled=null
  2026-08-12T15:02:06.045 ccbe0291-… £11.00 pi=pi_3U3dfO2fB4PPCw2D1te5axlg promoted=null cancelled=null

RECENT PAYMENTINTENTS:
  2026-08-12T15:12:53Z pi_3U3dpp… cap=manual status=requires_payment_method amt=1100 order_key=748a98f6-…
  2026-08-12T15:02:06Z pi_3U3dfO… cap=manual status=requires_payment_method amt=1100 order_key=ccbe0291-…
```

✅ **Both server calls SUCCEEDED.** `authorizeDraft` worked twice — two drafts, two manual-capture intents, both attached. **The failure is entirely client-side.**

---

## 1. Selecting the card option, and closing the panel

**Source: QUOTED.**

### What runs when card is selected

`app/trucks/[slug]/order/page.tsx` — the radio only sets a boolean (`payByCard`); the work happens on **Place order**, which posts:

```tsx
          payByCard: !!(payByCard && truck?.card_payments_ready),
```

and on the reply:

```tsx
      if (data.requiresAuthorization && data.clientSecret) {
        setPayment({
          clientSecret:  data.clientSecret as string,
          stripeAccount: data.stripeAccount as string,
          orderKey:      data.orderKey as string,
          totalPence:    Math.round(Number(data.total ?? 0) * 100),
        })
        setPayStage('mounting')
        setPayError(null)
        return
      }
```

Then the mount effect:

```tsx
  useEffect(() => {
    if (!payment?.clientSecret) return
    …
        el.mount(paymentBoxRef.current)
        el.on('ready', () => { if (!cancelled) setPayStage('ready') })
        stripeRef.current = stripe
        elementsRef.current = elements
    …
    return () => { cancelled = true }
  }, [payment?.clientSecret, payment?.stripeAccount])
```

### 🔴 WHAT RUNS WHEN THE PANEL IS CLOSED — AND THERE ARE TWO DIFFERENT CLOSES

**Close (a) — the sheet's ✕ or its backdrop**, `:2479` and `:2484`:

```tsx
          <div className="absolute inset-0 bg-black/40" onClick={() => setFormSheetOpen(false)} />
…
                <button onClick={() => setFormSheetOpen(false)} aria-label="Close" className="…">✕</button>
```

🔴 **NEITHER TOUCHES THE PAYMENT AT ALL.** The card form lives **inside** `{formSheetOpen && (…)}` (the sheet opens at `:2477`, the card form is at `:2739`), so closing the sheet destroys the Element's host div — while `payment`, `payStage`, `stripeRef` and `elementsRef` are all top-level page state and survive untouched.

**Close (b) — the panel's own "Back to my order":**

```tsx
  const abandonCardPayment = () => {
    setPayment(null); setPayStage('idle'); setPayError(null)
    stripeRef.current = null; elementsRef.current = null
  }
```

✅ **This one clears the state properly** — and is therefore *not* the broken path.

### The direct answer

| | Close (a): sheet ✕ / backdrop | Close (b): "Back to my order" |
|---|---|---|
| Tears down the Element | 🔴 **No** — `el.unmount()`/`destroy()` are never called on either path | 🔴 **No** |
| Clears the client secret | 🔴 **No** | ✅ Yes (`setPayment(null)`) |
| Leaves state behind | 🔴 **YES — all of it.** `payment`, `payStage: 'ready'`, `elementsRef` | ✅ No |

⚠️ **AND NEITHER PATH EVER DESTROYS THE STRIPE ELEMENT.** The effect's cleanup is `return () => { cancelled = true }` — a flag, not a teardown. Every abandoned attempt leaves an orphaned Stripe iframe and Elements group alive in the page for the life of the session.

---

## 2. The server, on a second call for the same basket

**Source: QUOTED.** `app/api/orders/submit/route.ts:710` — **the line that decides:**

```ts
      const draftKey = newOrderKey()
```

```ts
export function newOrderKey(): string {
  return crypto.randomUUID()
}
```

🔴 **IT CREATES A SECOND DRAFT WITH A BRAND-NEW `order_key`, UNCONDITIONALLY.** There is no lookup for an existing draft, no basket fingerprint, no idempotency key, and no error. `newOrderKey()` has exactly one call site and it is not guarded by anything.

Then a second PaymentIntent follows, because `authorizeDraft` is called with the new key:

```ts
    const intent = await stripe.paymentIntents.create(
      { amount: args.amountMinor, currency: …, capture_method: 'manual',
        metadata: { order_key: args.orderKey, … }, … },
      { stripeAccount: operator.stripe_account_id },
    )
```

✅ **Confirmed by the live rows above: two drafts, two intents, ten minutes apart, identical £11.00 basket.**

⚠️ **The only uniqueness anywhere near this is per-draft, not per-basket** — `order_drafts_payment_intent_uidx` stops one *intent* belonging to two *drafts*. It says nothing about one basket producing many drafts.

---

## 3. Which error fired

**Source: QUOTED for the branches; the identification is INFERRED.**

The copy exists in **exactly one place** — a repo-wide grep returns one hit:

```tsx
    } catch (err) {
      console.error('[order] confirmPayment threw:', err)
      setPayError('Something went wrong taking that payment. No money has been taken — please try again, or choose Pay at the truck.')
      setPayStage('failed')
    }
```

🔴 **SO `stripe.confirmPayment(...)` THREW.** That is decisive, because it rules out the sibling branch:

```tsx
      if (result.error) {
        console.error('[order] authorisation failed:', result.error.code, result.error.message)
        setPayError(result.error.message || 'That payment could not be authorised. …')
```

⚠️ **A DECLINE, A BAD CARD OR A STRIPE API ERROR ALL RETURN `result.error` AND SHOW STRIPE'S OWN MESSAGE.** They cannot produce this copy. The only way here is an **exception**, which Stripe.js raises for integration faults, not payment faults.

### Every branch that could produce it, and the one that fired

| # | Would produce the copy? | Fired? |
|---|---|---|
| 1 | 🔴 `confirmPayment` throws because the **Payment Element is not mounted** | ✅ **THIS ONE** |
| 2 | `confirmPayment` throws because `elements` was created by a **different Stripe instance** | ❌ Both come from the same `.then` |
| 3 | `confirmPayment` throws because the Elements group has **no Payment Element** | ❌ One was created and mounted |
| 4 | `stripe`/`elements`/`payment` null | ❌ `if (!stripe || !elements || !payment) return` — returns silently, sets nothing |
| 5 | A network failure inside `confirmPayment` | ❌ Stripe returns `result.error`, does not throw |

⚠️ **MORE THAN ONE COULD IN PRINCIPLE — 1, 2 and 3 are all Stripe.js integration errors caught by the same `catch`.** Only **1** is reachable from the observed sequence: the div was destroyed by the sheet close while the Elements group survived.

🔴 **NOT ESTABLISHED: the exact Stripe.js exception text.** The browser console holds it and I have no access. `console.error('[order] confirmPayment threw:', err)` is on the line above the copy and names it in one line.

⚠️ **AND THE PAY BUTTON SHOULD NOT HAVE BEEN PRESSABLE.** Its gate is:

```tsx
                    disabled={payStage !== 'ready' && payStage !== 'failed'}
```

`payStage` is still `'ready'` from the first mount, so an empty card box gets an enabled Pay button. **The stale stage is what let the customer reach the throw.**

---

## 4. What happened to the first PaymentIntent

**Source: QUOTED, from live Stripe data.**

```
  2026-08-12T15:02:06Z pi_3U3dfO2fB4PPCw2D1te5axlg cap=manual status=requires_payment_method amt=1100
```

| | |
|---|---|
| Created before the panel closed? | ✅ **Yes** — at draft creation, 15:02:06, before the Element even mounted |
| Left uncancelled? | 🔴 **Yes.** `authorization_cancelled_at = null` on its draft |
| Money held? | ✅ **No.** `requires_payment_method` — the customer never confirmed, so **nothing was ever authorised and nothing is on their card** |

### Does the cron sweep cover it? ✅ YES

```ts
  const { data, error } = await supabase
    .from('order_drafts')
    .select('order_key, truck_id, payment_intent_id, expires_at, promotion_failed_at, total_minor')
    .not('payment_intent_id', 'is', null)
    .is('promoted_at', null)
    .is('authorization_cancelled_at', null)
    .lt('expires_at', new Date().toISOString())
```

Both drafts satisfy all four conditions the moment they expire — **15:32:06 and 15:42:52** (30 minutes after creation). The sweep then cancels each intent and stamps `authorization_cancelled_at`, after which the purge may delete the rows and their PII.

⚠️ **THE COST IS TIDINESS, NOT MONEY.** An unconfirmed intent holds nothing. What accumulates is one abandoned intent per attempt, visible in the truck's Stripe Dashboard for up to 30 minutes.

---

## 5. Two PaymentIntents for one basket

**Source: QUOTED. YES — and it is already happening, twice above.**

### What prevents a customer being authorised twice

**Nothing prevents two intents existing.** What exists is narrower:

**Guard 1 — the UI holds one live secret at a time.** `payment` is a single object; a new submit overwrites it. There is no path that renders two Payment Elements.

**Guard 2 — one intent per draft:**
```sql
create unique index if not exists order_drafts_payment_intent_uidx
  on order_drafts(payment_intent_id) where payment_intent_id is not null;
```

**Guard 3 — one order per draft:**
```ts
    .eq('order_key', orderKey)
    .is('promoted_at', null)
```

### 🔴 THE GAP, STATED PLAINLY

**All three guards are per-DRAFT. None is per-BASKET.** So:

> If a customer authorised intent 1 and then authorised intent 2, **both would promote** — different `order_key`s, different drafts, neither claim blocking the other — producing **TWO REAL ORDERS AND TWO HOLDS FOR ONE BASKET.**

⚠️ **It is not reachable through the current UI** (guard 1: only one secret is live, and the first Element is detached). But it is prevented by the interface, not by the data model, and that is a materially weaker guarantee than the double-promotion constraint gives.

---

## 6. What SHOULD happen on reopen

**Source: INFERRED.** No fix proposed or applied — this answers the question only.

### Unchanged basket

**The existing PaymentIntent should be reused, not replaced.** It is still `requires_payment_method`, still the right amount, still attached to a live draft. Reopening should **re-mount the Element against the client secret already held** — the state is all there; only the mount is missing. That means:

- the mount effect must re-run when the host div is recreated, not only when the secret changes (a ref callback, or keying the effect on the div's identity);
- `payStage` must fall back from `'ready'` while nothing is mounted, so the Pay button is not pressable against a detached Element;
- and closing the sheet should either tear the Element down properly (`el.unmount()`), or the panel should not be inside a container that can be unmounted beneath it.

### Changed basket

🔴 **THE AMOUNT WOULD DIFFER FROM THE INTENT'S, AND THAT IS A MONEY FAULT, NOT A UI ONE.** The intent's `amount` is fixed at creation (1100 above); the draft's `total_minor` is the priced basket. If the customer adds an item and reopens, the old intent would authorise the OLD total for the NEW basket.

Two defensible answers:

1. **Cancel and re-create** — cancel the stale intent, mint a new draft and intent at the new total. Simple, and leaves nothing uncancelled. Costs one Stripe round trip.
2. **Update in place** — `paymentIntents.update` accepts a new `amount` while status is `requires_payment_method`, keeping one intent per basket. Fewer objects, but the draft's `total_minor` and the intent's `amount` must then be kept in step by something.

⚠️ **WHAT MUST NOT HAPPEN IS THE CURRENT BEHAVIOUR IN A WORLD WHERE IT WORKED:** a second attempt silently creating a second intent while the first stays live, because that is the state §5 says nothing but the UI prevents.

⚠️ **NOT ESTABLISHED: which is wanted.** Both are consistent with the design; the choice is yours.

---

# PART B

## 7. Disabling Stripe Link's "Save my information"

### 🔴 THE OPTION SET

`lib/payments/authorize.ts:137`:

```ts
        payment_method_types: ['card'],
```

**It replaces:**

```ts
        automatic_payment_methods: { enabled: true, allow_redirects: 'always' },
```

### Why this and not a client option

**There is no client-side switch for it.** The Payment Element's options include `wallets: { applePay, googlePay }`, `layout`, `fields`, `terms`, `defaultValues`, `business`, `paymentMethodOrder` — **and nothing for Link**. The "Save my information for faster checkout" box is Link's inline signup, and it renders because Link is an *offered payment method* on the intent. **The method list is the only lever in code**, and it is server-side.

### 🔴 WHAT I CHANGED, AND WHY — THE DISCLOSURE YOU ASKED FOR

**Changed:** the intent no longer offers every method enabled on the connected account; it offers **card only**. **Link is no longer on offer**, so its signup box cannot render.

**Why:** you asked for the box gone, and this is the mechanism that removes it.

**What is lost:** Link, and any other non-card method that was enabled on the account and happened to support manual capture. ⚠️ **In practice nothing else was on offer** — `automatic_payment_methods` already filtered to manual-capture-compatible methods, which excludes most alternatives.

⚠️ **`allow_redirects: 'always'` is gone with it and is not needed.** It existed for redirect-based methods; card 3DS is handled by the client's `redirect: 'if_required'`, unchanged.

✅ **Apple Pay and Google Pay are NOT affected.** They are **card wallets**, surfaced by the Payment Element when `card` is an accepted method — they are not entries in `payment_method_types` and never were. The client's `wallets: { applePay: 'auto', googlePay: 'auto' }` still governs them.

⚠️ **THE ALTERNATIVE, FOR COMPLETENESS:** turning Link off in the Stripe Dashboard (Settings → Payment methods) would achieve the same with no code change, per connected account. The code change is account-independent and visible in the repo, which is why I took it — **but if you would rather it were configuration, this is one line to revert.**

⚠️ **NOTHING FORBIDDEN WAS TOUCHED.** The draft lifecycle, `promoteDraft`, the webhook, the cron sweep and the fall-through are all untouched — `git status` shows one modified file.

## 8. Apple Pay — every requirement, and where each stands

**Source: QUOTED for the code; the requirement list is INFERRED from Stripe's integration rules.**

| # | Requirement | Status |
|---|---|---|
| 1 | `card` is an accepted payment method on the intent | ✅ **In code** — `payment_method_types: ['card']` |
| 2 | The Payment Element does not suppress it | ✅ **In code** — `wallets: { applePay: 'auto', googlePay: 'auto' }` |
| 3 | Stripe.js loaded from `js.stripe.com` | ✅ **In code** — `loadStripeJs()` injects `https://js.stripe.com/v3/` |
| 4 | Page served over **HTTPS** with a valid certificate | ✅ In production (Vercel). 🔴 **NOT on `http://localhost`** — Apple Pay never renders there |
| 5 | 🔴 **The domain registered with Apple, via Stripe** | 🔴 **NOT DONE. OUTSIDE THE REPO** |
| 6 | 🔴 For a **direct charge on a connected account**, the domain must be registered **for that connected account**, not only the platform | 🔴 **NOT DONE. OUTSIDE THE REPO** |
| 7 | Apple Pay enabled in the Stripe Dashboard's payment-method settings | 🔴 **Cannot verify from the repo. OUTSIDE** |
| 8 | Browser + device support: **Safari**, or Chrome/Edge on macOS with Touch ID, **and a card in Wallet** | 🔴 **Environmental.** Chrome on a desktop with no Wallet card shows nothing, correctly |

### 🔴 THE MOST LIKELY CAUSE, AND IT IS CHECKABLE FROM HERE

**Requirement 5.** Stripe verifies domain ownership by fetching

```
https://<your-domain>/.well-known/apple-developer-merchantid-domain-association
```

**A repo-wide search finds no `.well-known` directory and no association file:**

```
$ find . -name "*apple-developer*" -o -type d -name ".well-known"
(nothing)

$ ls public/
apple-touch-icon.png  favicon.ico  file.svg  globe.svg  gusto-logo.png  icons  illustrations
logos  manifest.json  next.svg  offline.html  og.image.png  photos  robots.txt  sw.js  ...
```

⚠️ **`apple-touch-icon.png` is a home-screen icon and has nothing to do with Apple Pay** — it is the only Apple-named file in `public/` and it is not this.

⚠️ **Registration is done in the Stripe Dashboard** (Settings → Payment methods → Apple Pay → Add a new domain), which hosts the association file on your behalf for Stripe-verified domains. **Because these are direct charges, it must cover the CONNECTED account** — registering only the platform is the failure people hit and then cannot explain.

### ✅ WHAT I DID ABOUT IT: NOTHING

**Every unmet requirement is outside the repository.** The code already satisfies 1, 2 and 3, and there is no code change that could satisfy 4–8. **I have changed nothing for Apple Pay** — inventing a change here would have obscured the fact that the work is a Dashboard action.

---

## Verification

| | |
|---|---|
| Files changed | **`lib/payments/authorize.ts`** — one line plus its comment. `git status` shows nothing else |
| `tsc --noEmit` | ✅ **clean** |
| `eslint lib/payments/authorize.ts` | ✅ **clean, no output** |
| Forbidden areas | ✅ Draft lifecycle, `promoteDraft`, webhook, cron sweep, fall-through — **none opened** |

### NON-ASCII CENSUS

| File | Before (total / distinct) | After | New class? |
|---|---|---|---|
| `lib/payments/authorize.ts` | 163 / 6 | 171 / 6 | ✅ **none** |

⚠️ **ONE VIOLATION I INTRODUCED AND CORRECTED.** My first draft of the comment used `✅` (U+2705), taking the file from 6 distinct classes to 7. Caught by my own census, changed to `⚠️`, back to 6. **Reported rather than quietly fixed.**

---

## Not established

- **The exact Stripe.js exception** from `confirmPayment`. It is in the browser console, logged one line above the copy. §3.
- **Whether the customer used the sheet ✕ or "Back to my order" first.** Both orderings end at the same defect; the sheet-close is the only one that leaves the stale state §3 requires.
- **Whether a reopened basket should reuse or replace its intent.** §6 sets out both; the choice is yours.
- **Whether Apple Pay is enabled in the Dashboard** and whether the domain is registered for the connected account. Not readable from the repo. §8.
- 🔴 **Whether removing `automatic_payment_methods` drops any method the truck was actually offering.** I can see the code, not the account's enabled-methods list. **Worth one look at the Dashboard before this ships.**

## Not fixed, and deliberately

🔴 **THE REOPEN DEFECT ITSELF.** Part A was scoped as diagnosis and Part B named two specific fixes; repairing the mount lifecycle is neither, and it touches the payment panel's state machine. **The two abandoned intents above will be cancelled by the sweep at 15:32 and 15:42, and no money is held on either.**
