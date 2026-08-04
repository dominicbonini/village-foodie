# Slice D — operator emails at signup

**Date:** 3 August 2026
**Scope:** the two operator-facing emails of the self-serve signup chain.
**Migrations written:** none. **SQL run:** none. **`next dev` / `next build`:** not run.

---

## D0. THE TWO REQUIRED READS

### 🔴 The brief's premise about `PLAN_ORDER` is factually wrong — flagged, not repaired

> "PLAN_ORDER in lib/features.ts is `['starter','trial','tester','pro','max']` — 'demo' is NOT in it."

Both halves are wrong:

* There is **no `PLAN_ORDER` in `lib/features.ts`**. The only `PLAN_ORDER` in the codebase is
  [app/admin/page.tsx:159](app/admin/page.tsx#L159).
* It reads `['starter', 'trial', 'tester', 'demo', 'pro', 'max']` — **`'demo'` IS in it.**

I have not changed either file. What follows answers the questions on the real code.

### (a) What plan `'demo'` actually does

| Question | Answer | Evidence |
|---|---|---|
| Is `'demo'` an unrecognised plan? | **No.** It is a first-class member of the `Plan` union. | `lib/features.ts` — `export type Plan = 'starter' \| 'pro' \| 'max' \| 'trial' \| 'tester' \| 'demo'` |
| What does `canAccess()` do with it? | Returns `PLAN_FEATURES['demo']?.has(feature) ?? false`. `PLAN_FEATURES.demo = new Set(TRIAL_FEATURES)`, so **a demo truck has the full trial feature set**. | `lib/features.ts` |
| Does that access expire? | **No.** `canAccess()` applies its expiry check *only* when `plan === 'trial'`. For `'demo'` it never even looks at a date. | `lib/features.ts` |
| `PLAN_META` entry? | Yes — `{ name: 'Demo', price: 'Demo', description: 'Prospect sandbox — full trial before signup (never public)' }` | `lib/features.ts` |
| `PLAN_PRICES` / `PLAN_DESCRIPTIONS`? | Yes, both — they are derived from `PLAN_META`. | `lib/plan-features.ts` |
| What does the Billing tab render? | Plan name **"Demo"**. The trial banner does not render: `trialActive` requires `plan === 'trial'`, and the `plan === 'trial'` block at [app/manage/[token]/page.tsx:8852](app/manage/[token]/page.tsx#L8852) is skipped. | `BillingTab`, [app/manage/[token]/page.tsx:8690](app/manage/[token]/page.tsx#L8690) |

**What a self-serve operator on `'demo'` can access:** everything a trial can, permanently, for free,
with the Billing tab labelling their plan "Demo".

### (b) Trial start / nomination / downgrade

* **Nomination mechanism: does not exist.** There is no UI, no route, no column write. The only
  traces are two comments ([app/api/setup/route.ts:68](app/api/setup/route.ts#L68),
  [lib/provision-truck.ts:248](lib/provision-truck.ts#L248)) and `lib/go-live-checks.ts`, which has
  **zero call sites and is imported by no file**.
* **What writes `trial_expires_at`:** nothing in application code except
  [lib/provision-truck.ts:300](lib/provision-truck.ts#L300), which sets it to **`null`** with the
  comment `// nomination sets this (§8)`. `update_truck`'s allowlist excludes it as admin-owned.
* **Downgrade automation:** none. Nothing flips trial → starter, anywhere.

### 🔴 THE D0 BLOCKING CONDITION IS MET — STOPPING BEFORE THE TRIAL SENTENCE

A self-serve operator is **not on a trial in any meaningful sense**: their plan is `'demo'`, their
access never expires, `trial_expires_at` is null, there is no way to start a trial and no way for one
to end.

Per your instruction I have **not written the D4 trial paragraph**:

> "It's completely free to get going, and you choose which event starts your free trial. You'll never
> be charged unless you choose to upgrade."

The rest of D4 shipped. The paragraph is quoted verbatim in a 🔴 comment in
[lib/email-signup.ts](lib/email-signup.ts) at the exact point it belongs, with the reasoning, so it
can be pasted back the day nomination ships. **No decision has been made about the plan value — I
have not changed it, per your instruction.**

---

## D1. HOW THE TWO EMAILS FIT TOGETHER

| | Email 1 — verification | Email 2 — welcome |
|---|---|---|
| Sent by | `/api/signup`, at account creation | `/api/auth/verify-signup` |
| Trigger | every successful signup | the moment `verified_at` is written |
| Frequency | once | **first successful verification only** |

**The already-verified branch sends nothing.** [app/api/auth/verify-signup/route.ts:72](app/api/auth/verify-signup/route.ts#L72)
returns `back('ok')` *before* the update and before the send. Control never reaches the mail call.

**The double-click race is closed too.** A mail-client prefetch racing the human can put two requests
past the `row.verified_at` check simultaneously. So the UPDATE now carries `.is('verified_at', null)`
with `.select('id')`, and the send is gated on `updated.length > 0`. Exactly one request's UPDATE
matches a row; exactly one mails. The redirect is unchanged for both.

**How a failed welcome send is guaranteed not to break verification — three independent layers:**

1. `sendOperatorWelcomeEmail` catches everything internally and returns `void`. It cannot throw. (Same
   contract as the existing `sendConfirmationEmail`.)
2. The Brevo `fetch` carries `AbortSignal.timeout(8_000)`. This is what makes *"must not block"* true
   rather than merely likely — without it a hung connection would hold the redirect open for the
   platform's whole request budget.
3. The call site is additionally wrapped in `try/catch` (which also covers the `operators` lookup),
   logging and continuing.

And structurally: the redirect status is computed from the UPDATE's `error` alone. **No value produced
by the email path is read when building the response.** A total Brevo outage yields a normal
`?verify=ok` redirect to Manage.

---

## D2. TTL

`VERIFY_TTL_DAYS` 7 → **30** ([app/api/signup/route.ts](app/api/signup/route.ts)), with the reasoning
recorded in a doc comment. No resend was built (slice E).

---

## D3 / D4. THE COPY

Both emails are rendered exactly as briefed, with two deliberate departures, both listed below. ASCII
hyphens standing in for dashes in the brief (`go - so it's`) are rendered as em dashes; the wording is
unchanged.

**D3 — `Confirm your email address`.** Greeting, thanks line, orange `Confirm my email address`
button → `{verify_url}`, the login/order-alerts paragraph, "carry on setting up", the reply
invitation, `Dominic / Founder, HatchGrab`, and the grey fine-print fallback URL.

**D4 — `Welcome to HatchGrab, {first_name}`.** Greeting, the welcome line, the fifteen-minutes line,
an `Open your dashboard` button, `Your dashboard: {manage_url}` + "Worth bookmarking. It works on any
device.", the reply invitation, "Looking forward to seeing {truck_name} trading.", sign-off.

**Departure 1 — the trial paragraph is absent** (D0, above).

**Departure 2 — the subject line drops the name when there isn't one.** With no name, the briefed
subject renders "Welcome to HatchGrab, there". Subject is `Welcome to HatchGrab` in that case, and
`Welcome to HatchGrab, {first_name}` whenever a name exists.

None of D6's excluded items appear: no resend, no go-live gating, the admin create-operator email is
untouched, and there is no mention of native apps, online payments, a setup to-do list, a free month,
a specific trial length, or Terms/Privacy links.

---

## D5. TOKENS, SENDER, FALLBACKS

### `{first_name}`
`firstNameFrom()` takes the first whitespace-delimited word of `operators.name`. **Fallback: `"there"`**
— matching the admin welcome email's existing "Hi there,". The greeting can never render `Hi ,` or
`Hi undefined`: the helper returns `null` for null/empty/whitespace input and the caller substitutes.

⚠️ Worth knowing: `operators.name` is written at signup as `email.split('@')[0]`, so in practice
`{first_name}` is a handle — `dominicbonini`, not `Dominic`. That is the best datum that exists today;
nothing in this slice can improve it. Signup now assigns that expression to one `operatorName` const
used both for the insert and for the email, so the two cannot drift.

### `{truck_name}` — 🔴 the verification email is sent before any truck exists
`/api/signup` deliberately creates no truck (its own header explains why: truck `id` is the name-slug
and is referenced by ~26 tables). So at D3 time the only possible name is the **claimed demo truck's**
— which, on the demo → signup path that produces most signups, is the operator's real business name.

I moved the demo-claim block *above* the email block so that name is in hand, and widened its select
from `id` to `id, name`. The claim behaviour is unchanged and still best-effort.

**Fallback: `"your truck"`** → "Thanks for setting up your truck on HatchGrab." For D4 the truck is
read from the `trucks` query the route already runs (select widened to include `name`), with the same
fallback.

### `{manage_url}`
`${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/manage/<dashboard_token>` — the same base the admin welcome
email uses, falling back to the request origin if the var is unset. If the operator has no truck yet
(signed up, never finished the truck step, then verified), the link points at `/setup`, which is
exactly where the redirect sends them.

### Reply-to
`HATCHGRAB_REPLY_TO = 'hello@hatchgrab.com'`, exported once from
[lib/email-signup.ts](lib/email-signup.ts) and read by both emails. Not inlined anywhere.

> ⚠️ **This mailbox is not live.** It must exist before the first real send, or replies to either
> email bounce.

### Sender identity — ⚠️ read this before opening signup
From-name `HatchGrab`; address `process.env.EMAIL_FROM_ADDRESS`, the existing convention.

Per D5 the fallback is **not** villagefoodie.co.uk — it is `hello@hatchgrab.com`. `EMAIL_FROM_ADDRESS`
is **not set in `.env.local`**, and `lib/email-config.ts` carries a standing TODO that hatchgrab.com
is not yet SPF/DKIM-verified in Brevo. So as things stand:

> 🔴 **Both signup emails will be rejected by Brevo** until either hatchgrab.com is verified there, or
> `EMAIL_FROM_ADDRESS` is set. Previously the verification email sent from
> `donotreply@villagefoodie.co.uk` and arrived. This is a real regression in deliverability, taken
> deliberately on your instruction not to introduce this brand under the old domain. Nothing else is
> affected — the send failure is logged and swallowed, signup and verification both still succeed.
>
> Public signup is still admin-gated (`SIGNUP_PUBLIC !== 'true'`), so no prospect is exposed to it yet.

### Template / branding helpers — which I used, and why not a shared wrapper
**There is no shared email wrapper in this codebase.** I searched for one; the admin welcome email
hand-rolls its own `<div>`. What exists and is reused: `HATCHGRAB_LOGO_URL` from
`lib/email-config.ts` (the PNG absolute URL), and the admin welcome's visual vocabulary — Arial,
`#334155` body text, 600px column, 180px logo, `#ea580c` CTA button at 8px radius.

I factored that into one local `shell()` + `button()` in `lib/email-signup.ts` so **these two emails
cannot drift from each other**. The admin email is left byte-identical.

### Plain text
Both emails send `textContent` alongside `htmlContent`, with the same copy and the URLs inline.

---

## 🔴 THE SHARED-HELPER QUESTION — resolved WITHOUT changing one

`lib/email.ts`'s `sendConfirmationEmail` **cannot carry a reply-to**: its Brevo payload is
`{ sender, to, subject, htmlContent, textContent }` with no `replyTo` field and no parameter for one
([lib/email.ts:363](lib/email.ts#L363)). Its from-address also falls back to
`donotreply@villagefoodie.co.uk`, which D5 forbids.

Adding either to it would have put **live order and cancellation mail** inside the blast radius of a
signup change. Rather than change it and stop, I took the option that needs no change at all: a new
module that posts to Brevo directly — **exactly what `app/api/admin/create-operator/route.ts` already
does** for the admin welcome email, so this is an established pattern here, not a new one.

**`lib/email.ts` and `lib/email-config.ts` are not in the diff.** Verified mechanically.

---

## FILES TOUCHED

| File | Reason |
|---|---|
| `lib/email-signup.ts` | **NEW.** Both emails, the reply-to constant, the sender, the shared shell, `firstNameFrom()`. Isolated from `lib/email.ts` on purpose. |
| `app/api/signup/route.ts` | TTL 7→30; verification email replaced (D3); demo-claim block hoisted above the send and its select widened to `id, name` so `{truck_name}` has a value; `operatorName` hoisted to one const. |
| `app/api/auth/verify-signup/route.ts` | Sends the welcome email on first successful verification; `.is('verified_at', null)` + `.select('id')` closes the double-send race; `trucks` select widened with `name`; verification-row select widened with `email`. |

Nothing else. No migration, no SQL, no schema change.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT CODE: 0

$ npx eslint lib/email-signup.ts app/api/signup/route.ts app/api/auth/verify-signup/route.ts
(no output — clean)
```

**How Gusto and RTF are unaffected.** Neither of the two files this slice sends mail from is on any
path a live truck touches: `/api/signup` creates accounts, `/api/auth/verify-signup` confirms email
addresses. Neither runs for an existing operator. `lib/email.ts` — which carries order confirmations,
cancellations, slot changes and the rest — is **not modified**, so every existing send keeps its exact
current sender, template and trigger, including the `donotreply@villagefoodie.co.uk` from-address that
Brevo has verified. `lib/email-config.ts` is not modified, so `HATCHGRAB_SENDER`,
`VILLAGE_FOODIE_SENDER` and `truckSender()` are unchanged for every consumer. The admin
create-operator email is untouched. Password-reset, email-change, staff-invite, scraper and demo
save-email sends were not opened.

**Garbled spans:** none in the brief. The one factual error — the `PLAN_ORDER` claim — is flagged at
the top of D0 rather than repaired.
