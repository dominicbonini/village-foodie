# "Test mode. No real payments can be taken yet." — is it true?

Date: 13 August 2026
Status: READ-ONLY DIAGNOSIS. **No file was changed.** This report is the only file created.
No `next dev`, no `next build`, no commit, no deploy. Connect was not pressed and nothing was created at
Stripe.

🔴 **The line was NOT removed.** Not because the app is on test keys — I cannot show that — but because
neither branch of your instruction is satisfied, and the reason is itself the finding. Section 0.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. 🔴 THE ANSWER, AND A CORRECTION TO THE PREMISE

Your question was: *is it stale copy, or a true statement about what the running app holds?*

**It is stale copy. It is not derived from anything.** It is a bare JSX literal with no condition, no
env var, no key check and no build constant behind it. It renders identically for every operator, in
every environment, on every deployment, whatever keys are set.

That voids the concern in your 🔴:

> IF IT IS TRUE, REMOVING IT WOULD DELETE THE ONLY THING TELLING ME AN OPERATOR IS ABOUT TO CONNECT TO SANDBOX.

**It is not telling you that, and it never could.** It says "Test mode" with `sk_live_` set just as
readily as with `sk_test_`. It is not a signal that can go wrong, because it is not connected to
anything — which is precisely why it did not change when you set live keys and rebuilt twice. **That it
did not change is the proof.**

### Why I did not remove it anyway

Your build condition was:

> THEN, ONLY IF (3) CONFIRMS THE APP IS ON LIVE KEYS … IF (3) SHOWS THE APP IS STILL ON TEST KEYS, DO NOT REMOVE

**Neither obtains, and there is a third outcome you did not anticipate:** the repository cannot establish
which keys the *deployment* holds. `.gitignore` line 34 is `.env*`, so no environment file is in the
repo, and the local `.env.local` on this machine is my machine, not Vercel. What I can prove is the
mechanism — **the account's mode is exactly the mode of whatever `STRIPE_SECRET_KEY` the running server
holds, with nothing in the code able to alter that.** What I cannot prove is the value.

Deleting a warning on an unverified assumption is the one move here that could be wrong in the expensive
direction, so I stopped. Section 5 is how you close the gap in about a minute; section 7 is the change,
written out and ready.

---

## 1. THE LINE, AND EVERY CONDITION THAT PRODUCES IT

**QUOTED** — `components/manage/PaymentsTab.tsx:435-437`:

```tsx
{/* ⚠️ SANDBOX. Said on screen, not only in code — an operator who completes real-looking
    onboarding must not believe they can take real money. */}
<p className="text-[11px] text-slate-400 mt-3">Test mode. No real payments can be taken yet.</p>
```

### The conditions governing it: **none. QUOTED.**

Its surroundings, `:431-438`, show it is a **bare sibling** of the fee paragraph inside the always-rendered
card `<div>`:

```tsx
  <p className="text-xs text-slate-500 mt-3">
    Stripe charges {CARD_FEE_ONLINE_LABEL} per payment on standard UK cards. …
  </p>
  {/* ⚠️ SANDBOX. … */}
  <p className="text-[11px] text-slate-400 mt-3">Test mode. No real payments can be taken yet.</p>
</div>
```

No `{cond && …}`, no ternary, no wrapping conditional, no `state ===` test. It does not read a key
prefix, an environment variable, a build constant, `PLAN_META`, `connectConfigured()`, or the `status`
response. **It derives from nothing and is read from nowhere.**

⚠️ Its own comment is the give-away: *"Said on screen, not only in code"* — written when the sandbox
guard in `lib/stripe/connect.ts` genuinely did force test mode. That guard was removed today
(`docs/live-key-guard-report.md`); this sentence was not, and it has been orphaned ever since.

---

## 2. BUILD TIME OR REQUEST TIME?

**Neither — INFERRED from the QUOTED source, and this is the sharpest fact in the report.**

A build-time constant would at least have changed on rebuild. A request-time read would have changed
immediately. **A literal string changes only when someone edits the file**, which is why two rebuilds
moved it not at all.

For contrast, the two values that *do* have timing, because they matter for section 6:

| Value | Where read | When resolved |
|---|---|---|
| `STRIPE_SECRET_KEY` | server only, **inside functions** — `lib/stripe/connect.ts:155`, `authorize.ts:125/221`, `capture.ts:262/292`, `refund.ts:128`, `webhooks/stripe/route.ts:620` | 🔴 **REQUEST time.** `stripeClient()`'s comment: *"Created per call rather than module-scoped so the check runs every time."* |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `components/manage/PaymentsTab.tsx:198` and `app/trucks/[slug]/order/page.tsx:1510`, both **`'use client'`** | 🔴 **BUILD time** — inlined into the JS bundle by Next |

---

## 3. 🔴 THE CENTRAL QUESTION — WHICH KEY THE CONNECT FLOW USES

### The trace, end to end — QUOTED

1. `components/manage/PaymentsTab.tsx:193` — `createAccount` POSTs `{ action: 'create_account' }`.
2. `app/api/stripe/connect/route.ts` — after auth, `create_account` calls:
   ```ts
   const account = await createConnectedAccount({ email: ctx.email, country: ctx.country, businessUrl: null })
   ```
3. `lib/stripe/connect.ts` — `createConnectedAccount` obtains its client from:
   ```ts
   /** The platform client. Created per call rather than module-scoped so the check runs every time. */
   function stripeClient(): Stripe {
     return new Stripe(requireStripeKey(process.env.STRIPE_SECRET_KEY))
   }
   ```
4. `requireStripeKey` — `lib/stripe/connect.ts:102`:
   ```ts
   function requireStripeKey(key: string | undefined): string {
     if (!key) {
       throw new Error('[stripe/connect] STRIPE_SECRET_KEY is not set — nothing can be created without it')
     }
     return key
   }
   ```

**That is the whole chain. `process.env.STRIPE_SECRET_KEY`, read at request time, presence-checked, and
passed to Stripe unmodified.**

### Stated plainly

🔴 **There is no code path anywhere that can force a sandbox account.** The prefix refusal that used to
sit in `requireStripeKey`'s predecessor was removed today; nothing replaced it with a mode decision. The
connected account's mode is **exactly** the mode of the key the running server holds:

- If the Production deployment holds `sk_live_` → **an operator pressing Connect today creates a LIVE
  connected account**, and `operators.stripe_account_livemode` will be written `true` (read back off
  Stripe's own object at `route.ts:190-192`, not inferred).
- If it holds `sk_test_` → a sandbox account, and that column will read `false`.

**Which of those two is the case is a fact about Vercel, not about this repository, and I cannot read
it.** The mechanism is proven; the value is yours to confirm (section 5).

⚠️ **The mode is also self-reporting after the fact.** `route.ts:218` logs
`account created operator=… account=… livemode=…` on every creation, and the column is written in the
same statement as the id. So the first Connect press answers the question permanently — but that is
exactly the press you do not want to make blind.

---

## 4. EVERY STRIPE CLIENT IN THE CODEBASE, AND ITS KEY

`grep -rn "new Stripe("` across `app`, `lib`, `components`, `scripts`. **Ten construction sites, and
every one in the application reads the same variable.**

| # | Site | Key source | Prefix check? | Fallback? |
|---|---|---|---|---|
| 1 | `lib/stripe/connect.ts:155` | `requireStripeKey(process.env.STRIPE_SECRET_KEY)` | none (presence only) | none |
| 2 | `lib/payments/authorize.ts:125` | `stripeSecretKey()` → `process.env.STRIPE_SECRET_KEY` | none | none |
| 3 | `lib/payments/authorize.ts:221` | same | none | none |
| 4 | `lib/payments/capture.ts:262` | `stripeSecretKey()` → same | none | none |
| 5 | `lib/payments/capture.ts:292` | same | none | none |
| 6 | `lib/payments/refund.ts:128` | `stripeSecretKey()` → same | none | none |
| 7 | `app/api/webhooks/stripe/route.ts:620` | 🔴 `process.env.STRIPE_SECRET_KEY!` — **read directly, bypassing the helper** | none | none |
| 8 | `scripts/register-payment-domain.cjs:56` | `process.env.STRIPE_SECRET_KEY` | 🔴 **YES — still refuses any key not `sk_test_`** | none |
| 9 | `scripts/list-stranded-authorisations.cjs:127` | `process.env.STRIPE_SECRET_KEY` | none | none |
| 10 | `lib/stripe/webhook-signature.ts:14` | — a comment only, not a construction | n/a | n/a |

### Findings

- 🔴 **No second variable exists.** Nothing reads `STRIPE_KEY`, `STRIPE_API_KEY`, `STRIPE_TEST_KEY` or
  any per-mode name. There is one secret key in this codebase.
- 🔴 **No client hardcodes a key and none falls back to anything.** A missing key throws (site 1) or
  produces a Stripe constructor error; none silently substitutes a default.
- ⚠️ **Site 7 bypasses the helper** — `new Stripe(process.env.STRIPE_SECRET_KEY!)` with a non-null
  assertion, in the `charge.refunded` branch of the webhook. Same variable, so the mode is identical;
  the difference is only that an unset key produces a less legible failure there. Named because you
  asked for certainty, not because it changes the mode.
- 🔴 **Site 8 is the last surviving `sk_test_` refusal in the repository:**
  ```js
  if (!KEY.startsWith('sk_test_')) {
    console.error('REFUSING: STRIPE_SECRET_KEY is not a sandbox key. Remove this guard deliberately when going live.')
  ```
  It is `scripts/register-payment-domain.cjs`, a **hand-run CLI**, never imported by the app. It is
  worth knowing about for a different reason: it is the manual fallback for registering Apple/Google Pay
  domains, and **it will refuse to run against your live key** — so if you ever need it in live mode, it
  is a two-line edit first.

---

## 5. HOW TO VERIFY FROM THE OUTSIDE, WITHOUT PRESSING CONNECT

Ranked by what each actually proves.

### (a) 🔴 The publishable key — provable from a browser in ten seconds

It is inlined into the client bundle at build time, so it is **visible in the shipped JavaScript**. Open
Manage → Payments (or any truck's order page) with DevTools open, then **Network → filter to JS →
search all responses for `pk_`**. The prefix you find is the one that build shipped:

- `pk_live_` → the last build had the live publishable key
- `pk_test_` → it did not, regardless of what Vercel shows today

⚠️ **This proves the CLIENT half only.** It says nothing about `STRIPE_SECRET_KEY`, which is what creates
the connected account.

### (b) The secret key — only you can see it

Vercel → Project → Settings → Environment Variables → `STRIPE_SECRET_KEY`, **checking the Environment
scope** (Production / Preview / Development are separate values; a key set only on Preview leaves
Production unchanged). This is the definitive answer to section 3 and it is not visible from the repo.

### (c) Stripe Dashboard → Developers → Logs, with the live/test toggle

Any API request the deployment makes appears under one mode or the other. ⚠️ **Caveat that matters
today:** with no truck holding a `stripe_account_id`, the Payments tab makes **zero** Stripe calls —
`status` returns early at `route.ts:98-104` and `requirements` short-circuits the same way. So there may
be no traffic to look at at all, and an empty live log would prove nothing.

### (d) ⚠️ A trap to avoid — the webhook log line does NOT answer this

`[webhook/stripe] RECEIVED id=… livemode=…` reports the mode of an **incoming Stripe event**, which is a
property of the event, not of our key. Sending a test event from Stripe's dashboard logs
`livemode=false` no matter which key the deployment holds. **Do not read that line as an answer to
section 3.**

### (e) 🔴 What does not exist, and arguably should

**No endpoint, response field or log line reveals the server key's mode before a Connect press.**
`platformKeyLivemode()` exists in `lib/stripe/connect.ts:119` and returns exactly this fact — `true` for
`sk_live_`, `false` for `sk_test_`, `null` for neither — but it has no HTTP surface. That gap is what
section 7 proposes closing, and closing it would replace this whole section with "look at the tab".

---

## 6. COULD THE TWO KEYS DISAGREE? YES — AND IT IS THE LIKELIEST WAY THIS BITES

**They resolve at different times (section 2), so they can absolutely diverge:**

- `STRIPE_SECRET_KEY` is read **per request**, so a Vercel change reaches the server on the next request
  after the deployment picks it up.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is **baked into the bundle at build**, so a change reaches
  browsers only via a **new build**. Setting it after the last build, or scoping it to the wrong
  Environment, leaves the old value shipping.

### What happens in each mismatch — INFERRED from the quoted call sites

| Combination | Effect |
|---|---|
| **`sk_live_` server + `pk_test_` bundle** | `authorize.ts:125` creates a **live** PaymentIntent; the customer's browser holds `pk_test_` and cannot confirm a live `client_secret` → **the card form fails at the moment of payment**. In Manage, `loadConnectAndInitialize({ publishableKey })` (`PaymentsTab.tsx:200`) is handed a live account session with a test key → **the embedded onboarding will not mount.** |
| **`sk_test_` server + `pk_live_` bundle** | The mirror image, with the same two failure points. |

### 🔴 Nothing in the app detects this

**No code anywhere compares the two prefixes.** `connectConfigured()` (`lib/stripe/connect.ts:446`)
tests **presence only** — and has zero call sites regardless. The mode-mismatch check added today,
`describeAccountModeMismatch`, compares the **platform key against a connected account**, not the secret
key against the publishable one. So a live/test key split produces two failures that both look like
something else: "the card was declined" and "Stripe's form is broken".

⚠️ Given that you have set both and rebuilt twice, this is probably not your situation — but it is the
one worth ruling out with check (a) above, because its symptoms name neither cause.

---

## 7. THE LINE — RECOMMENDATION, NOT APPLIED

Per your instruction I have not removed it, because section 3 could not confirm the deployment. Here is
what I would do, in order of preference.

### 🔴 Recommended: make it derive, rather than deleting it

The problem was never the sentence — it was that the sentence is a **constant**. Deleting it swaps a
line that is sometimes wrong for **no line at all**, which is worse the day you run a preview
deployment on `sk_test_`: an operator would then connect a sandbox account with nothing on screen
saying so.

The pieces already exist:

- `platformKeyLivemode()` — `lib/stripe/connect.ts:119`, already returns `true` / `false` / `null` from
  the **server's** key, which is the one that creates the account.
- The `status` response already carries an additive server-derived field (`viewer`, added earlier
  today), so there is a precedent and a place to put one more.

Shape: `status` returns `livemode: platformKeyLivemode()`, and the tab renders **one of three lines**:

| Server key | Line | Treatment |
|---|---|---|
| `sk_test_` | **"Test mode — no real payments can be taken, and any account you connect here is a sandbox account."** | the existing quiet `text-[11px] text-slate-400` |
| `sk_live_` | **"Live mode. Connecting here creates a real Stripe account and real customer payments will reach your bank."** | ⚠️ I would give this one weight — `text-xs text-slate-600` at least. See below. |
| neither / unknown | render nothing | — |

### On your point that an operator connecting a real bank account may want to know it is real

**Agreed, and I would go further: it is the more important of the two messages.** The sandbox line
protects against a wasted afternoon. The live line sits directly above a button that creates an
**irreversible** account binding their business to Stripe (`route.ts:159`, *"the account already exists
at Stripe by this line and CANNOT BE DELETED"*) — with no confirmation step anywhere in the flow. A
single quiet sentence is the only thing that would mark that boundary.

⚠️ **It should not be alarming.** Amber on this page means a warning, and connecting is the thing you
want operators to do. Slate-600 at `text-xs`, one step up from the current whisper, states the fact
without discouraging it.

### Second choice: delete it, once you have confirmed live

If you would rather not add a field, deleting the line **and its comment** is a two-line change and is
correct **provided** check (b) shows Production on `sk_live_`. It leaves you with no mode indicator at
all, which is acceptable while there is exactly one deployment and you set its keys yourself.

### Not recommended: deriving it from the publishable key

`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_')` is available to the client with no server
change, and I would still avoid it: it reports the **bundle's** key, which section 6 shows can disagree
with the one that actually creates the account. A mode indicator that can be wrong about the mode is
the problem you already have.

---

## 8. VERIFICATION — WHAT I PROVED AND WHAT ONLY YOU CAN

### Provable from the repository, and proved

- The line has **no condition of any kind** — quoted with its full surroundings.
- It is a **literal**, so neither build-time nor request-time; a rebuild cannot change it.
- The Connect flow's key is `process.env.STRIPE_SECRET_KEY`, read at request time, presence-checked
  only, with **no prefix test and no fallback** — full chain quoted.
- **Ten** `new Stripe(` sites; every one in the app reads that single variable; **no second variable, no
  hardcoded key, no fallback anywhere**.
- One surviving `sk_test_` refusal, in `scripts/register-payment-domain.cjs`, never imported by the app.
- The publishable key is inlined at build; the secret key is read per request; **nothing compares them**.

### Only you can confirm, from Vercel and the browser

- 🔴 **Whether Production's `STRIPE_SECRET_KEY` is `sk_live_`** — the actual answer to section 3.
- Whether the shipped bundle carries `pk_live_` or `pk_test_` — check (a).
- Whether both are scoped to the Production environment rather than only Preview.

### Not done, deliberately

Connect was not pressed. Nothing was created at Stripe. No environment variable was read for its value
from any deployment, and none was changed. **No file was modified**, so there is no before/after
character census to report: `git status` shows this report as the only addition.

---

## 9. WHAT I WOULD DO NEXT, IN ORDER

1. Run check (a) — search the bundle for `pk_`. Thirty seconds, and it rules out the section-6 mismatch.
2. Read `STRIPE_SECRET_KEY` in Vercel, **with the Environment column visible**. That is section 3's
   answer.
3. Tell me which, and I will apply section 7 — the derived three-way line, or the deletion if you prefer.
4. Independently of all of the above: `scripts/register-payment-domain.cjs` will refuse to run on a live
   key, and it is the manual path for Apple/Google Pay domain registration
   (`docs/live-key-guard-report.md` §7.2, the one item that fails completely silently).
