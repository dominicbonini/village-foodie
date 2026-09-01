# Android — what every upgrade / billing / plan control actually does

**Date:** 29 August 2026
**READ-ONLY.** Nothing was changed, built or deployed. Every claim below is marked READ, INFERRED or UNKNOWN.

---

## Headline

🔴 **NOTHING IN THE ANDROID APP CAN CHARGE A CARD FOR A PLAN OR SUBSCRIPTION.** Every upgrade control on
every surface terminates in one of three things: **a tab switch**, **a copy string**, or **a `mailto:`**.
There is no Stripe Checkout, no Payment Element, no subscription object and no plan-change write.

🔴 **AND NO OPERATOR CAN CHANGE THEIR OWN PLAN TIER AT ALL** — with or without payment. `plan` is absent
from both server-side write allowlists.

---

## 1. `purchaseCtaAllowed()` — the predicate and its callers

**READ — `lib/commerce-policy.ts:39-46`, quoted in full:**

```ts
export function purchaseCtaAllowed(): boolean {
  // No Capacitor at all (server render, plain web build) → allowed.
  if (typeof Capacitor === 'undefined') return true
  // Browser, including the Capacitor web shim → allowed.
  if (!Capacitor.isNativePlatform()) return true
  // Native, but Android (or any future native platform) → allowed. Only iOS is restricted.
  return Capacitor.getPlatform() !== 'ios'
}
```

🔴 **ON ANDROID THIS RETURNS `true`.** `isNativePlatform()` is true, `getPlatform()` is `'android'`, so
the final line yields `true`. **Every gated control below is therefore VISIBLE on Android** — the file's
own header says so: *"ANDROID IS DELIBERATELY EXCLUDED FROM THIS RESTRICTION. Google permits steering
users to an external purchase mechanism, so the Android shell keeps the full web behaviour."*

**READ — all 11 call sites (1 definition + 11 calls; the remaining `grep` hits in that file are comments):**

| # | file:line | Context |
|---|---|---|
| — | `lib/commerce-policy.ts:39` | the definition |
| 1 | `app/manage/[token]/page.tsx:464` | auto-switch to the Billing tab for trial accounts |
| 2 | `app/manage/[token]/page.tsx:477` | trial-reminder **trigger** effect (early return) |
| 3 | `app/manage/[token]/page.tsx:796` | trial-reminder popup **render** |
| 4 | `app/manage/[token]/page.tsx:11025` | van-limit modal → "View plans" |
| 5 | `app/manage/[token]/page.tsx:11440` | trial copy — ternary on a **string**, not a control |
| 6 | `app/manage/[token]/page.tsx:11449` | trial billing card → the two upgrade buttons |
| 7 | `app/manage/[token]/page.tsx:11482` | trial reassurance paragraph + fees footnote |
| 8 | `app/manage/[token]/page.tsx:11512` | "⏱ Set up payment before your trial ends" line |
| 9 | `app/manage/[token]/page.tsx:11542` | Starter "Upgrade your plan" panel → two buttons |
| 10 | `app/manage/[token]/page.tsx:11606` | the upgrade-interest **modal** |
| 11 | `components/FeatureGate.tsx:58` | the "Upgrade →" link on a locked feature |

⚠️ **Ten of the eleven are in one file.** `app/manage/[token]/page.tsx` holds every commerce control in
the product except `FeatureGate`'s link — and `FeatureGate` is itself rendered only from that same file
(`:9992`, `:10043`). **INFERRED: the entire commerce surface is the Manage page's Billing tab.**

---

## 2. Every visible control, traced to its terminal destination

| # | Control | Terminal destination |
|---|---|---|
| 1 | Auto-switch to Billing tab | **Tab switch** — `setActiveTab('billing')` |
| 2 | Trial-reminder trigger | **No control** — sets `showTrialReminder` |
| 3 | Trial popup → **"Upgrade here →"** | **Tab switch** |
| 4 | Van modal → **"View plans"** | **Tab switch** — `href="?tab=billing"` |
| 5 | Trial copy ternary | **Copy string only** |
| 6 | **"Upgrade to Max — £49/mo"** / **"Choose Pro — £29/mo"** | **`mailto:`** (via modal) |
| 7 | Trial reassurance paragraph | **Copy string only** |
| 8 | "⏱ Set up payment…" | **Copy string only** — not a link |
| 9 | Starter **"Pro — £29/mo"** / **"Max — £49/mo"** | **`mailto:`** (via modal) |
| 10 | Upgrade modal → **"Email us to upgrade"** | **`mailto:`** — the terminal node |
| 11 | FeatureGate **"Upgrade →"** | **Tab switch** — `href="?tab=billing"` |

### The handlers, quoted (READ)

**#3 — trial popup CTA (`:846-850`):**
```jsx
<button onClick={() => { setShowTrialReminder(false); setActiveTab('billing') }} …>
  Upgrade here →
</button>
```

**#4 — van-limit modal (`:11025-11032`), and #11 — FeatureGate (`:58-65`):**
```jsx
{purchaseCtaAllowed() && (<a href="?tab=billing" …>View plans</a>)}
{purchaseCtaAllowed() && (<a href="?tab=billing" …>Upgrade →</a>)}
```
⚠️ Both carry a comment recording that the href *"repointed /pricing → ?tab=billing … /pricing has never
existed and this link has been a 404 for every operator since it shipped."*

**#6 and #9 — all four upgrade buttons (`:11452`, `:11458`, `:11547`, `:11553`):**
```jsx
onClick={() => openUpgrade('max')}    onClick={() => openUpgrade('pro')}
```

**`openUpgrade` (`:11180`) — READ, the whole function:**
```ts
const openUpgrade = (target: 'pro' | 'max') => { setUpgradeTarget(target); setShowUpgradeModal(true) }
```
🔴 **It opens a modal. It performs no network call, no write and no payment.**

**#10 — the modal, which is where all four buttons land (`:11620-11630`):**
```jsx
<p className="text-sm text-slate-700">
  We&apos;re setting up automated billing. To upgrade now, drop us a message and we&apos;ll get you set up within 24 hours.
</p>
<a href={`mailto:${SUPPORT_EMAIL}?subject=Upgrade to ${…} — ${truck.name}&body=Hi, I'd like to upgrade …`} …>
  Email us to upgrade
</a>
```
**`SUPPORT_EMAIL` = `process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hello@villagefoodie.co.uk'`** (`:11135`).

### The `billingCard` — rendered on every plan, and it is not a control

**READ (`:11375-11383`).** It is ungated by design (the comment forbids re-gating it) and contains
**no CTA, no link, no price and no purchase instruction**:

> **Billing is managed by HatchGrab** — *During early access we set up and adjust plans manually.*

**INFERRED: this is the honest description of the whole system** — the mailto is not a stopgap around a
payment page, it is the mechanism.

---

## 3. 🔴 Can any of them charge a card for a plan or subscription?

## No. None of them. Plainly: there is no code path in this application that charges an operator for a plan.

**Evidence — READ, a tree-wide sweep of `app/` and `lib/`:**

- **`stripe.subscriptions.create`** — **does not exist.**
- **`stripe.checkout.sessions.create`** — **does not exist.**
- **`billingPortal`** — **does not exist.**
- **`stripe.prices.*` / `stripe.products.*`** — **do not exist.**

**The complete set of Stripe API calls in the codebase (READ, counted):**

```
stripe.paymentIntents.create / capture / cancel / retrieve
stripe.refunds.create / list
stripe.accounts.retrieve · stripe.accountSessions.create
stripe.paymentMethodDomains.create / list
stripe.webhooks.constructEvent · stripe.elements · stripe.confirmPayment
```

**Every one is on the customer food-order path** (Stripe Connect, Direct charges to the operator's own
account). **INFERRED from the API surface: `paymentIntents` + Connect + refunds is an order-payment
architecture; a subscription product would require `subscriptions`, `prices` or a Checkout Session, and
none of the three appears anywhere.**

⚠️ **`PLAN_MONTHLY_PENCE` exists (`lib/features.ts:165`) but is never charged.** Its only consumers are
`app/landing/cost/CostComparison.tsx` (a public cost calculator) and `PLAN_META` price **labels**. **READ:
no payment call references it.**

✅ **The product's own copy agrees, and was corrected to say so** (`:11485-11500`): *"NOTHING activates.
No operator has a payment method on file and there is no subscription object anywhere."*

---

## 4. Where can an operator change their own plan tier without payment?

## 🔴 Nowhere. There is no plan-change surface at all.

**READ — `plan` is absent from both write allowlists in `app/api/manage/route.ts`:**

- `update_truck` `ALLOWED` (`:1394-1402`): name, description, cuisine_type, contact_email, contact_phone, social_*, auto_accept, logo_storage_path, website, allergen_*, truck_emoji, whatsapp, phone_is_whatsapp, sound_config. **No `plan`.**
- `update_settings` `allowed` (`:1460`): crew_mode, kds_mode, display_mode, extra_wait_mins, paused_until, whatsapp_sender, preferred_contact_method, cancellation_*, default_auto_*, qr_code_style, scraper_*, preorder_*, truck_order_email_enabled, setup_step, show_paid_step, takes_cash, completion_presses. **No `plan`.**

**READ — the only write to `trucks.plan` in the entire codebase** is at provisioning:
`app/api/admin/create-truck/route.ts:104` — `plan: body.plan as ProvisionTruckOptions['plan']`, behind
`verifyAdmin`. **A tree-wide sweep of `.update(` calls in `app/api` and `lib` found no other statement
that writes `plan`.**

**READ — the admin console cannot change a plan either.** `updateTruck` (`app/admin/page.tsx:356`) is
typed to exactly six fields: `show_on_vf`, `show_on_hg`, `order_link_vf`, `order_link_hg`, `excluded`,
`active`. There is no plan dropdown wired to a save.

**READ — `feature_overrides` has no operator-writable path either**; a sweep of `app/api` for an update
or allowlist entry naming it returned nothing.

⚠️ **INFERRED, and it matches the `billingCard` copy:** a plan is set once at provisioning and changed
thereafter only by a direct database edit by HatchGrab. **UNKNOWN: whether such edits happen via the
Supabase console** — that is outside the repository and I did not look.

---

## 5. Reachability — dashboard vs manage vs marketing site

**READ — occurrence counts:**

```
app/dashboard/[token]/page.tsx      0
app/dashboard/[token]/kds/page.tsx  0
app/kds/[kds_token]/page.tsx        0
app/manage/[token]/page.tsx        15   (10 calls + 5 comments)
components/FeatureGate.tsx          2   (1 import + 1 call)
```

**READ — what the Android shell opens onto.** `server.url` is `https://www.hatchgrab.com/app`
(`android/app/src/main/assets/capacitor.config.json:6`), and `app/app/page.tsx` routes a signed-in
operator to **`/dashboard/${trucks[0].dashboard_token}`** (`:68`), or `/admin` for an admin (`:65`), or
`/login`.

🔴 **SO THE APP OPENS ONTO THE DASHBOARD, WHICH HAS ZERO COMMERCE CONTROLS.** A grep of the dashboard for
"Upgrade", "Choose a plan", "View plans" or a `£n/mo` price returns **nothing** — the one `upgrade` hit
(`:1300`) is the word in a code comment.

| Surface | Commerce controls | Reachable in the Android app |
|---|---|---|
| **Dashboard** (the launch destination) | **none** | yes — opens here |
| **KDS** (both routes) | **none** | yes |
| **Manage → Billing tab** | **all 11** | yes — via `/manage/${token}` |
| **Admin console** | none (no plan editor) | yes, for an admin |
| **Marketing site** (`/landing`, `/landing/cost`) | prices + cost calculator, **no purchase control** | ⚠️ see below |

⚠️ **The only dashboard→manage link found is "Edit categories"** (`:3348`), which lands on Manage but not
on the Billing tab. **INFERRED: reaching a plan CTA from a cold Android launch requires navigating to
Manage and selecting Billing** — except for trial accounts, where call site #1 auto-opens the Billing tab.

⚠️ **`/landing` is admin-gated and `noindex`** (per §36/§40 and the landing layout), so a normal operator
does not reach the marketing pricing surface from the app. **UNKNOWN: whether `allowNavigation` would
keep `/landing` in the webview** — it is on `www.hatchgrab.com`, so **INFERRED yes**, but the admin gate
would redirect a non-admin. I did not exercise it.

---

## 6. What I could not establish

1. **UNKNOWN — whether Google Play would treat the `mailto:` as an out-of-app purchase steer.** §40
   records that Google permits steering; whether a mailto counts is a policy question, not a code one.
2. **UNKNOWN — whether plan changes are made directly in Supabase.** No code path does it; the mechanism
   is outside this repository.
3. **UNKNOWN — what `NEXT_PUBLIC_SUPPORT_EMAIL` is set to in production.** The fallback is
   `hello@villagefoodie.co.uk`; I did not read any environment.
4. **NOT OBSERVED — nothing was run on a device or emulator.** Every trace is static: the predicate's
   Android return value is derived from Capacitor's documented behaviour, not observed.
5. **UNKNOWN — whether a `mailto:` resolves on an Android device with no mail client configured.** If it
   does not, control #10 is a dead tap. **INFERRED: this is the single most likely real-world failure of
   the upgrade path, and it is unverified.**

---

**No span of this prompt arrived garbled, and no instruction contradicted another.**
