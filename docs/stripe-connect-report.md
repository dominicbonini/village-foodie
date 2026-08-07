# Stripe webhook endpoint — build report

**Date:** 7 August 2026
**Supersedes:** the livemode-discriminator build report previously at this path.
**Provenance:** the Stripe Connect readiness audit — no webhook in this repo verified a signature, so there was no pattern to copy.
**Scope built:** the endpoint, signature verification, and event recording. **No payments.**

---

## Summary

| | |
|---|---|
| **Stripe SDK** | **Not installed, and not installed by this task.** Verification is hand-rolled from Stripe's documented manual procedure — which means this endpoint needs **no API key at all** |
| **Files added** | 3, all new. **Zero existing files modified** |
| **Raw body** | `await req.text()` on the first line; `req.json()` never called on this route |
| **Env vars needed** | **one** — `STRIPE_WEBHOOK_SECRET` (accepts a comma-separated list) |
| **Idempotency** | `stripe_webhook_events` table, `UNIQUE (stripe_event_id)`, insert-first and treat 23505 as "already seen" |
| **Migration** | written, **not run** |
| **Verification tested** | 15 vectors exercised against real HMACs — 15 pass, including forgery, replay, downgrade and the re-serialisation trap |
| **`tsc --noEmit`** | exit 0 |
| **ESLint** | rule-for-rule identical to baseline; **both new files produce zero messages** |
| **Gusto** | new route, nothing calls it, no payment code touched — verified below, not assumed |

### 🔴 Two things flagged rather than assumed

**1. One premise in the brief needs correcting, and it changes the fix.** The brief says *"Next.js route handlers parse the body by default."* That is true of the **Pages Router** (`pages/api/*`), where you disable it with `export const config = { api: { bodyParser: false } }`. This repo uses the **App Router**, where a route handler receives a Web `Request` and the body is **not** parsed for you — `.text()` and `.json()` are both available, and that config key does nothing.

**The hazard is real but has a different mechanism, and it is still the most common silent failure.** Two of them:

- The body is a **stream that can only be read once**. Call `req.json()` first and a later `req.text()` throws `Body is unusable`. There is no way back.
- Even if you could, re-serialising is fatal: `JSON.stringify(JSON.parse(body))` is a **different string** — key order, whitespace, unicode escaping, number formatting — so the HMAC differs and verification fails **100% of the time with a perfectly correct secret**, presenting as *"my signing secret must be wrong."*

I have proven that second point rather than asserted it — see the `re-serialised body FAILS` vector below. The discipline the brief asks for is exactly right; only the stated cause differs.

**2. A dating discrepancy on the provenance, carried over from last time.** You date the livemode migration 6 August; the file in the repo is `20260807_order_payments_livemode.sql` and its header is dated 7 August. I take the application and the 50-row figure as given — **I cannot verify either without SQL**, and this audit ran read-only against the database.

---

## Part 1 — Established before writing

### 1. Is the Stripe Node SDK installed?

**No.**

```
$ node -e "console.log(require('./package.json').dependencies.stripe)"
undefined
```

Current published version, checked against the registry today:

```
$ npm view stripe version dist-tags
version = '22.4.0'
dist-tags = { latest: '22.4.0', beta: '18.6.0-alpha.2',
              'public-preview': '22.5.0-beta.1', 'private-preview': '22.5.0-alpha.2' }
```

**`stripe@22.4.0`** is `latest`, and it is also what Stripe's own current quickstart sample pins (`"stripe": "^22.4.0"`). Node here is v22.22.3 — comfortably above its floor. **Not installed, per the brief.**

**Consequence, and it turned out to be a benefit worth keeping.** Since the SDK is unavailable, `stripe.webhooks.constructEvent` is unavailable, so verification is hand-rolled from [Stripe's documented manual procedure](https://docs.stripe.com/webhooks) — a path Stripe explicitly supports (*"you can create a custom solution by following this section"*).

🔴 **This removes a requirement rather than adding one.** `new Stripe(...)` requires an API key, so importing the SDK would have meant giving the most publicly-reachable route in the app a `STRIPE_SECRET_KEY` **purely to construct a client it never makes an API call with**. Hand-rolling means this endpoint holds **no API key at all** — only the signing secret, which is useless for anything except verifying signatures. When the SDK does land (for PaymentIntents), swapping this module for `constructEvent` is behaviour-identical and the module can be deleted.

### 2. The existing pattern for an inbound API route

Read from `app/api/inbound-schedule/route.ts`, `app/api/webhooks/meta/whatsapp/route.ts` and `app/api/cron/*`. The house shape, followed here:

| Convention | Where seen | Followed |
|---|---|---|
| `import { NextRequest, NextResponse } from 'next/server'` | all inbound routes | ✅ |
| Module-scope service-role client, `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)` | [inbound-schedule:8-11](app/api/inbound-schedule/route.ts#L8-L11), [meta/whatsapp:8-11](app/api/webhooks/meta/whatsapp/route.ts#L8-L11) | ✅ |
| `export async function POST(req: NextRequest)` | all | ✅ |
| `NextResponse.json({ error: '…' }, { status: N })` | [inbound-schedule:41](app/api/inbound-schedule/route.ts#L41) | ✅ |
| Bracketed log tag, `console.log('[webhook/meta-whatsapp] …')` | throughout the webhook routes | ✅ as `[webhook/stripe]` |
| Secrets read from `process.env` at module scope | [inbound-schedule:26](app/api/inbound-schedule/route.ts#L26) | ✅ (read per-request, so a rolled secret takes effect on redeploy without a cold-start dependency) |
| `export const runtime = 'nodejs'` when Node APIs are needed | [verify-schedule-url:10](app/api/manage/verify-schedule-url/route.ts#L10) | ✅ |

⚠️ **One convention deliberately NOT followed.** The four existing webhook routes do `const body = await req.json()` as their first act and then process it **unauthenticated** — the Meta ones check a shared token only on the `GET` subscription handshake, never on `POST`; the Twilio one checks nothing at all. Copying that shape here would defeat the entire task. This route is written to be the thing those four are eventually fixed *against*, which is why verification lives in a pure, reusable module rather than inline.

⚠️ Also noted while reading, out of scope, but do not copy it into a money route: [meta/whatsapp:22-27](app/api/webhooks/meta/whatsapp/route.ts#L22-L27) logs `process.env.META_WEBHOOK_VERIFY_TOKEN` in plaintext on every verification attempt.

### 3. 🔴 The raw body in this Next.js version

**Next 16.1.6, App Router.** Route handlers receive a Web `Request`; **nothing parses the body for you**.

```ts
const rawBody = await req.text()      // ✅ the exact bytes Stripe signed
```

**What happens if the body is parsed first — both failure modes:**

| If you… | What happens |
|---|---|
| `await req.json()` then `await req.text()` | **Throws.** The body is a single-use stream; once consumed it cannot be re-read. |
| `JSON.stringify(await req.json())` as the payload | **Verification fails every time, with a correct secret.** The re-serialised string differs from Stripe's bytes in key order, whitespace, unicode escaping and number formatting, so the HMAC differs. |

The second is the one that wastes an afternoon, because it looks like a configuration problem. **Proven, not asserted** — the `re-serialised body FAILS` vector in the test table below feeds a correctly-signed payload through `JSON.stringify(JSON.parse(body), null, 2)` and gets `signature_mismatch`.

**And the fix that does *not* apply here:** `export const config = { api: { bodyParser: false } }` is a **Pages Router** directive. In the App Router it is inert. Adding it would be cargo-cult and would give false confidence.

**`export const runtime = 'nodejs'` is pinned**, because `node:crypto`'s `createHmac` / `timingSafeEqual` do not exist on the edge runtime. Without it the route would build cleanly and fail at runtime on every single request.

### 4. Environment variables — exactly one new

| Variable | Purpose | Notes |
|---|---|---|
| **`STRIPE_WEBHOOK_SECRET`** | The endpoint signing secret(s) used to verify `Stripe-Signature`. | 🔴 **Accepts one OR MORE, comma-separated.** See below — this is not a convenience. |

**Already set, reused unchanged:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Explicitly NOT needed, and deliberately so:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, any Connect client id. This route makes no Stripe API calls.

🔴 **Why the secret is plural.** Two independent Stripe behaviours require it:

1. **One URL, two modes.** A production Connect webhook URL receives **both live and test** events. Registering the same URL in test mode and in live mode creates two endpoint objects with **two different signing secrets** — Stripe: *"if you use the same endpoint for both test and live API keys, the secret is different for each one."* A single-secret implementation would verify one mode and reject the other **as a forgery**.
2. **Secret rolling.** When a secret is rolled, Stripe keeps the previous one active for up to 24 hours and *"generates one signature for each secret"*. Accepting a list makes a roll a zero-downtime config change instead of a cutover.

Both cases are covered by test vectors below (`2 secrets, live one 2nd` and `roll: 2 sigs, old secret`).

---

## Part 2 — What was built

Three new files. **No existing file was modified** — `git status` shows three untracked paths and nothing else.

| File | Role |
|---|---|
| [lib/stripe/webhook-signature.ts](lib/stripe/webhook-signature.ts) | Pure, dependency-free signature verification. No I/O, no throw — every failure is a return value. |
| [app/api/webhooks/stripe/route.ts](app/api/webhooks/stripe/route.ts) | The endpoint. |
| `supabase/migrations/20260807_stripe_webhook_events.sql` | The receipt log. **Written, not run.** |

### The endpoint's contract

**Verify, always, with no bypass.** [route.ts:88](app/api/webhooks/stripe/route.ts#L88) is the only gate and there is no path around it: no env-var flag, no `NODE_ENV === 'development'` shortcut, and — critically — **no "skip verification if no secret is configured"**. Stripe's own quickstart sample is written `if (endpointSecret) { verify }`, which means a deployment that forgot the variable **accepts any body from anyone**. That is a tutorial convenience and it is refused here: an unset secret is a broken deployment and it fails closed ([webhook-signature.ts:126-131](lib/stripe/webhook-signature.ts#L126-L131)).

**Status codes are a retry instruction, not a formality.** Stripe retries any non-2xx for up to three days:

| Code | When | Why |
|---|---|---|
| **400** | not from Stripe, or unparseable | Retrying cannot help, and a forged request must never earn a retry. **Nothing is recorded.** |
| **500** | verified and well-formed, but the insert failed | 🔴 **Retry is exactly what we want** — we hold no record, so re-delivery is the recovery path. The one branch where a non-2xx is correct rather than a bug. |
| **200** | recorded / duplicate / unhandled type | All three mean "do not send this again". |

The 2xx is returned as soon as the event is **durably recorded** and no later. Nothing slow and nothing that can throw runs between verification and the response.

**Unrecognised event types are normal.** No handler exists for any type yet — that is this pass's scope, not an oversight. Every verified event is recorded and acknowledged whatever its type ([route.ts:210-216](app/api/webhooks/stripe/route.ts#L210-L216)). Returning non-2xx for an unhandled type would make Stripe retry it for three days to no purpose and eventually disable the endpoint.

**The 7pm-Friday log.** One line per event, bracketed tag, and it names the **cause** rather than saying "unauthorised":

```
[webhook/stripe] RECEIVED id=evt_1Abc… type=account.updated livemode=false account=acct_1Xyz… apiVersion=2026-…
[webhook/stripe] DUPLICATE id=evt_1Abc… type=account.updated livemode=false — already recorded, ignoring
[webhook/stripe] REFUSED reason=signature_mismatch secretsConfigured=1 hasSignature=true bodyBytes=1842
[webhook/stripe] PERSIST FAILED id=evt_1Abc… … — returning 500 so Stripe retries. 42P01 relation does not exist
```

The refusal line carries the three facts that separate the realistic causes — `no_secret_configured` (env var missing), `missing_signature_header` (a scanner probing the URL), `signature_mismatch` (wrong secret, or **only the other mode's secret configured**, or a genuine forgery), `timestamp_outside_tolerance` (a real Stripe signature that is stale, or this server's clock has drifted). `secretsConfigured` is a **count, never the values**, and `bodyBytes` distinguishes an empty probe from a real payload **without logging a single byte of an unverified body**.

### 🔴 Idempotency

**Yes — seen event ids are stored, in a new table.** Stripe guarantees at-least-once, retries for up to three days, allows manual resend for 15 days (Dashboard) / 30 days (CLI), and **does not guarantee ordering**. A handler that assumes one delivery per event is wrong on all four counts.

**The mechanism is the UNIQUE constraint, not a read-then-write check.** The route INSERTs first and treats `23505` as *"already seen, acknowledge and stop"* ([route.ts:155-179](app/api/webhooks/stripe/route.ts#L155-L179)). A `select … then insert if absent` would be wrong: two concurrent deliveries of the same event — which is exactly what a retry racing a slow first attempt looks like — would both read "not seen" and both proceed. Only the database can arbitrate that, so it is asked to.

This deliberately mirrors the idiom the payment ledger already uses (`order_payments_idempotency_key_uidx` plus "treat 23505 as a successful no-op"), so idempotency is done **one way** in this codebase rather than two.

### The migration — written, NOT run

```sql
-- 20260807_stripe_webhook_events.sql
-- The STRIPE EVENT RECEIPT LOG. One row per webhook event this app has accepted. Groundwork only —
-- nothing in it moves money, and it is NOT order_payments.
--
-- ✅ CLASSIFICATION: **ADDITIVE**. A brand-new table that nothing currently deployed reads or writes.
-- Applying it changes nothing for the running app, so it is SAFE TO RUN AT ANY TIME.
-- RUN ORDER: apply BEFORE deploying /api/webhooks/stripe. That route INSERTs here, and PostgREST returns
-- PGRST205 for a table it cannot see. The consequence of getting it wrong is bounded but ugly: the route
-- would verify signatures correctly and then fail to record, returning 500, and Stripe would retry the
-- same event for three days. No money is involved either way. The reverse order is a no-op — the table
-- would simply sit empty until the deploy lands.
--
-- ── WHY THIS TABLE EXISTS: STRIPE GUARANTEES AT-LEAST-ONCE, NOT EXACTLY-ONCE ────────────────────────
-- Stripe's own words: "Webhook endpoints might occasionally receive the same event more than once. You
-- can guard against duplicated event receipts by logging the event IDs you've processed, and then not
-- processing already-logged events." They also automatically retry for UP TO THREE DAYS with exponential
-- backoff, allow a manual resend for 15 days (Dashboard) or 30 days (CLI), and explicitly do NOT
-- guarantee ordering. A handler that assumes one delivery per event is wrong on all four counts.
-- This table is the "logging the event IDs you've processed" half, made durable.
--
-- 🔴 THE UNIQUE CONSTRAINT IS THE IDEMPOTENCY MECHANISM — NOT A READ-THEN-WRITE CHECK.
-- The route INSERTs FIRST and treats a 23505 unique violation as "already seen, acknowledge and stop".
-- It deliberately does NOT `select ... then insert`: two concurrent deliveries of the same event (which
-- is exactly what a retry racing a slow first attempt looks like) would both read "not seen" and both
-- proceed. The database is the only thing that can arbitrate that, so it is asked to.
-- This mirrors the idiom the payment ledger already uses — order_payments_idempotency_key_uidx plus
-- "treat 23505 as a successful no-op" (20260729_order_payments_ledger.sql:29-37) — deliberately, so
-- there is ONE way idempotency is done in this codebase rather than two.
--
-- ── 🔴 NO PAYLOAD COLUMN. THE FULL EVENT BODY IS DELIBERATELY NOT STORED. ───────────────────────────
-- The obvious design is a `payload jsonb` for debugging. It is refused, and the precedent is recorded in
-- lib/audit/actionAudit.ts: "NOTHING SWEEPS THIS TABLE… the anonymisation pass nulls named COLUMNS on
-- `orders` — it cannot reach inside a JSONB blob. Anything personal written into these snapshots is
-- therefore retained indefinitely and would outlive the erasure the privacy policy promises."
-- A Stripe Checkout/PaymentIntent event carries `customer_details.email`, `.name`, `.phone` and a
-- billing address. Storing the raw event would put customer identifiers in a table with no foreign keys
-- and no sweeper — a GDPR erasure hole created for developer convenience.
-- ✅ THE DEBUGGING NEED IS MET WITHOUT IT: `stripe_event_id` is the join key to Stripe's own Dashboard,
-- which retains the complete payload and its delivery history. This table answers "did we receive it,
-- when, and did we act on it"; Stripe answers "what was in it". That split is correct, not a compromise.
-- ⚠️ DO NOT ADD A PAYLOAD COLUMN LATER WITHOUT SOLVING THE SWEEP. If a future handler genuinely needs
-- event contents, store the specific scalar fields it needs (ids, amounts, statuses), never the blob.
--
-- ── 🔴 livemode IS NOT NULL WITH NO DEFAULT, AND THAT IS THE OPPOSITE OF order_payments.livemode ────
-- order_payments.livemode carries `default true` because it had to classify 50 pre-existing rows of real
-- money taken before the column existed (20260807_order_payments_livemode.sql). This table has NO
-- pre-existing rows and NO legacy writer, so there is nothing a default would rescue and everything it
-- could hide: every row here is born from a Stripe event, and every Stripe event states its own mode in
-- a field. A default would let a writer that forgot silently record a test event as live.
-- NOT NULL, NO DEFAULT ⇒ omission is a 23502 at the database, on top of the value being a required
-- parameter in TypeScript. Both doors shut, and neither costs availability because no deployed code
-- inserts here yet.
--
-- ── NO FOREIGN KEYS ────────────────────────────────────────────────────────────────────────────────
-- `connected_account` holds a Stripe `acct_...` and is a plain text value. There is nothing to reference
-- — no Connect account is stored anywhere in this schema yet, deliberately (§37 leaves the account's
-- home an open decision). Following action_audit_log rather than order_payments here: a receipt log must
-- survive deletion of whatever it describes, and order_payments cascading on BOTH orders and trucks is
-- recorded in the audit-log migration as the mistake not to inherit.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   -- table + every column
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns where table_name = 'stripe_webhook_events' order by ordinal_position;
--   select count(*) as col_count from information_schema.columns
--    where table_name = 'stripe_webhook_events';                                  -- expect 9
--   -- livemode must be NOT NULL with NO default (see the note above)
--   select is_nullable, column_default from information_schema.columns
--    where table_name = 'stripe_webhook_events' and column_name = 'livemode';     -- expect NO | null
--   -- the unique constraint that IS the idempotency mechanism
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'stripe_webhook_events'::regclass and contype = 'u';
--   -- expect stripe_webhook_events_event_id_uniq UNIQUE (stripe_event_id)
--   -- NO foreign keys
--   select count(*) as fk_count from information_schema.table_constraints
--    where table_name = 'stripe_webhook_events' and constraint_type = 'FOREIGN KEY';  -- expect 0
--   -- indexes
--   select indexname, indexdef from pg_indexes
--    where tablename = 'stripe_webhook_events' order by indexname;
--   -- RLS on, ZERO policies — same posture as order_payments and action_audit_log
--   select relrowsecurity from pg_class where relname = 'stripe_webhook_events';  -- expect t
--   select count(*) as policy_count from pg_policies
--    where tablename = 'stripe_webhook_events';                                   -- expect 0
--   -- and, once the endpoint is live, the sanity read that matters:
--   select livemode, count(*) from stripe_webhook_events group by 1;
--   -- during test-mode bring-up expect ONLY `f` rows. A `t` row means a LIVE event reached this app.

create table if not exists stripe_webhook_events (
  id                uuid        primary key default gen_random_uuid(),
  -- Stripe's own event id (`evt_...`). THE idempotency key, and the join key to Stripe's Dashboard.
  stripe_event_id   text        not null,
  -- e.g. 'payment_intent.succeeded', 'account.updated'. Free text, no CHECK: Stripe adds event types
  -- continuously and a CHECK would make every new one a deploy-coupled migration — the same reasoning
  -- action_audit_log.action records for the same decision.
  type              text        not null,
  -- 🔴 FROM THE EVENT'S OWN `livemode` FIELD. Never from an env var, a key prefix, or which endpoint
  -- received the callback — a production Connect URL receives BOTH modes, so neither the endpoint nor
  -- the key can tell you which one this was. See the column comment.
  livemode          boolean     not null,
  -- The connected account (`acct_...`) for a Connect event, from the event's top-level `account` field.
  -- NULL for platform-scoped events. No FK — nothing to reference yet.
  connected_account text,
  -- The Stripe API version that shaped this event's payload. Recorded because an event's structure is
  -- fixed at creation and does NOT follow later API-version changes; without it, a handler debugging an
  -- unexpected shape has no way to know which schema it was looking at.
  api_version       text,
  -- When STRIPE created the event, from the event's `created` (unix seconds). Distinct from received_at
  -- on purpose: the gap between them IS the delivery delay, and on a retry it can be days.
  stripe_created_at timestamptz,
  received_at       timestamptz not null default now(),
  -- ⚠️ ALWAYS FALSE TODAY, AND THAT IS HONEST RATHER THAN SPECULATIVE. This endpoint records that an
  -- event arrived; it does not act on one, because no handler exists yet (deliberately out of scope).
  -- The column exists now because the unique constraint alone cannot distinguish "seen" from
  -- "finished" — a crash between the INSERT and a future handler would look identical to a completed
  -- delivery, and the retry would be skipped as a duplicate having done nothing. That is a correctness
  -- requirement for the next pass, not a guess about it.
  handled           boolean     not null default false,

  constraint stripe_webhook_events_event_id_uniq unique (stripe_event_id)
);

-- "What has arrived recently, in this mode" — the operational read. Ordering by received_at (our clock)
-- not stripe_created_at (theirs), because when triaging you want arrival order, and a three-day retry
-- would sort into the distant past under the other column.
create index if not exists stripe_webhook_events_livemode_received_idx
  on stripe_webhook_events (livemode, received_at desc);

-- "Everything for this connected account" — the read for diagnosing one truck's onboarding or payments.
-- Partial: platform-scoped events have a NULL account and are never the subject of this question.
create index if not exists stripe_webhook_events_account_idx
  on stripe_webhook_events (connected_account, received_at desc) where connected_account is not null;

alter table stripe_webhook_events enable row level security;
-- service-role only, no anon policy: the only writer is a server route using the service key
-- (app/api/webhooks/stripe). No browser and no customer ever touches this table — same posture as
-- order_payments, action_audit_log, device_notification_prefs, booking_locks and whatsapp_logs.

comment on table stripe_webhook_events is
  'One row per Stripe webhook event ACCEPTED by /api/webhooks/stripe (signature verified). This is a RECEIPT LOG, not a ledger — it records that an event arrived, never that money moved. order_payments remains the canonical money record and this table must never be summed, joined into a balance, or treated as evidence of payment. The UNIQUE constraint on stripe_event_id IS the idempotency mechanism: the route inserts first and treats 23505 as "already seen", because Stripe guarantees at-least-once delivery and retries for up to three days. Deliberately stores NO event payload — see the migration header for the GDPR reasoning.';

comment on column stripe_webhook_events.livemode is
  'Copied verbatim from the Stripe event''s own `livemode` field. 🔴 NEVER derived from STRIPE_SECRET_KEY, from an sk_test_/sk_live_ prefix, from NODE_ENV, or from which endpoint received the callback. Stripe documents that a production Connect webhook URL receives BOTH live and test events, so the endpoint proves nothing and the key proves nothing about a callback that arrived unbidden. The event is the only artefact that knows which mode produced it, and it says so in this field. NOT NULL with NO DEFAULT so an omission is a loud 23502 rather than a silent misclassification — unlike order_payments.livemode, which needed a default to classify rows that predated the column.';

comment on column stripe_webhook_events.stripe_event_id is
  'Stripe''s `evt_...` id. UNIQUE — this is what makes a duplicate delivery a no-op. Also the join key to Stripe''s own Dashboard, which holds the full payload and delivery history this table deliberately does not.';

comment on column stripe_webhook_events.handled is
  'FALSE on every row today: the endpoint records receipt and does not act. Exists so a future handler can distinguish "seen" from "finished" — the unique constraint alone cannot, and a crash between insert and handling would otherwise be indistinguishable from a completed delivery whose retry is then skipped.';

notify pgrst, 'reload schema';
```

**Two design calls in there worth surfacing:**

🔴 **No payload column.** The obvious design stores the raw event JSON for debugging. It is refused, on the precedent already recorded in [lib/audit/actionAudit.ts](lib/audit/actionAudit.ts): *"NOTHING SWEEPS THIS TABLE… the anonymisation pass nulls named COLUMNS on `orders` — it cannot reach inside a JSONB blob."* A Stripe Checkout event carries `customer_details.email`, `.name`, `.phone` and a billing address. Storing it would create a GDPR erasure hole in a table with no foreign keys and no sweeper, for developer convenience. The debugging need is met instead by `stripe_event_id`, which is the join key to Stripe's own Dashboard — that holds the full payload and delivery history. **This table answers "did we receive it"; Stripe answers "what was in it."**

🔴 **`livemode` is NOT NULL with NO default here — the opposite of `order_payments.livemode`.** That column needed `default true` to classify 50 rows of real money that predated it. This table has no pre-existing rows and no legacy writer, so a default would rescue nothing and could hide everything: an omission would silently record a test event as live. No default ⇒ omission is a loud 23502.

### 🔴 Livemode

Recorded at the write site, [route.ts:157-168](app/api/webhooks/stripe/route.ts#L157-L168):

> `event.livemode`, copied verbatim. NEVER from `STRIPE_WEBHOOK_SECRET`'s shape, never from an `sk_test_`/`sk_live_` prefix, never from `NODE_ENV`, and never from the fact that this is the production endpoint. Stripe documents that *"your production webhook URLs receive BOTH live and test webhooks… We recommend that you check the `livemode` value"* — so the endpoint proves nothing, and the key proves nothing about a callback that arrived unbidden. The event is the **ONLY** artefact that knows which mode produced it, and it states it in this field. Deriving it from configuration would look correct and be wrong exactly when it mattered: the day a test payment landed on a truck trading real money.

**Strict boolean, not truthiness** ([route.ts:130](app/api/webhooks/stripe/route.ts#L130)): `typeof event.livemode === 'boolean' ? event.livemode : null`. A payload whose `livemode` is absent or non-boolean is **refused with 400**, not guessed at — there is no safe default for this field, so there isn't one.

---

## Part 3 — What was deliberately not done

| Prohibited | Status |
|---|---|
| Write to `order_payments` | **Not done.** The string `order_payments` appears in the new route only inside comments explaining that this table is *not* it. |
| Create PaymentIntents / Connect accounts / onboarding | **Not done.** No Stripe API call exists anywhere in the repo. |
| Install the Stripe SDK | **Not done.** `package.json` unmodified. |
| Touch the customer order path, `resolvePaidStep`, `getOrderBalance`, anything in `lib/payments` | **Not done.** `git status` shows **zero modified files**. |
| Touch Manage or add a Payments tab | **Not done.** |

```
$ git status --short
?? app/api/webhooks/stripe/
?? lib/stripe/
?? supabase/migrations/20260807_stripe_webhook_events.sql
```

Three untracked additions. Nothing modified, nothing deleted.

---

## Verify

### What a forged request receives, and the proof there is no unverified path

**HTTP 400 with `{"error":"Invalid signature"}` and nothing else.** The response deliberately does not say *which* check failed — a caller probing the endpoint must not learn whether a secret is configured or which condition it tripped. The precise reason goes to our logs only.

**No path processes an unverified body.** Between `req.text()` and the verification call, the only thing that happens to `rawBody` is that its **length is measured** for the log line. It is not parsed, not inspected, not stored, and not echoed. `JSON.parse` is called at [route.ts:117](app/api/webhooks/stripe/route.ts#L117) — **after** the `if (!verification.ok) return` at [:98-110](app/api/webhooks/stripe/route.ts#L98-L110). There is no bypass flag, no dev-mode shortcut, and no "skip if unconfigured" branch.

**Exercised against real HMACs**, not asserted — 15 vectors, all passing:

| Vector | Result |
|---|---|
| valid signature | `ok` |
| forged: wrong secret | `signature_mismatch` |
| forged: tampered body (valid sig for the original) | `signature_mismatch` |
| forged: no `Stripe-Signature` header | `missing_signature_header` |
| forged: garbage header | `malformed_signature_header` |
| forged: `t=` present but no `v1` | `no_v1_signature` |
| no secret configured (valid signature offered) | `no_secret_configured` |
| replay: 6 minutes stale | `timestamp_outside_tolerance` |
| replay: 4 minutes stale | `ok` (inside the 5-min tolerance) |
| downgrade: `v0`-only header | `no_v1_signature` |
| downgrade: `v0` valid + `v1` garbage | `signature_mismatch` |
| `v0` garbage + `v1` valid | `ok` (v0 ignored, v1 honoured) |
| **two secrets, matching one listed second** | `ok` — the live/test-on-one-URL case |
| **secret roll: two signatures, we hold only the old secret** | `ok` |
| 🔴 **re-serialised body** (`JSON.stringify(JSON.parse(body), null, 2)`) | `signature_mismatch` — the trap in §Part 1.3, demonstrated |

⚠️ Honest note on the tenth row: my first run expected `signature_mismatch` there and got `no_v1_signature`. The **code was right and the expectation was wrong** — a `v0`-only header has its v0 discarded (that *is* the downgrade protection) leaving zero v1 signatures, so the more precise refusal is correct. Expectation corrected; no code changed.

### Duplicate delivery of the same event id

The insert hits `stripe_webhook_events_event_id_uniq`, Postgres returns **23505**, and the route:

1. logs `[webhook/stripe] DUPLICATE id=evt_… type=… livemode=… — already recorded, ignoring`
2. returns **200** `{"received":true,"duplicate":true}`

**No second row. No error. Stripe stops retrying.** Because the insert is attempted *before* any check, two concurrent deliveries cannot both win — the database arbitrates, not application logic.

### 🔴 Both live and test events on one endpoint

**Handled, and recorded.** Three separate mechanisms:

1. **Verification accepts either mode's secret.** `STRIPE_WEBHOOK_SECRET` takes a comma-separated list and every secret is tried. Without this, one mode would be rejected as a forgery — proven by the `2 secrets, live one 2nd` vector.
2. **The mode is recorded from the event**, never inferred — `livemode` column, NOT NULL, strict boolean, 400 if absent.
3. **The mode is on every log line.** During test-mode bring-up, `livemode=true` appearing in the logs means a **real** event has reached this app, and that is visible immediately rather than discovered later in a table.

The migration's verify block includes the standing check:

```sql
select livemode, count(*) from stripe_webhook_events group by 1;
-- during test-mode bring-up expect ONLY `f` rows. A `t` row means a LIVE event reached this app.
```

### 🔴 Gusto — verified, not assumed

**Zero effect. Established three ways rather than by reasoning about intent:**

1. **Nothing calls it.** A repo-wide grep for `webhooks/stripe`, `webhook-signature` and `stripe_webhook_events` returns **only self-references inside the two new files**. No import, no fetch, no link, no redirect, no config entry anywhere else.
2. **Nothing existing changed.** `git status` shows three untracked paths and **zero modified files**. Their hatch flow runs entirely through `recordCollectionPayment` → `order_payments`, and neither that function, nor `lib/payments/*`, nor the dashboard, KDS, OrderCard or customer order path was opened for writing.
3. **The route is inert without configuration.** With `STRIPE_WEBHOOK_SECRET` unset it refuses every request with `no_secret_configured` — so even a mistaken deployment ahead of the migration cannot record anything, and cannot touch money in any case because it has no code path to `order_payments`.

A new file that nothing imports cannot change a running behaviour. Their live path is byte-identical.

### Checks

```
$ npx tsc --noEmit ; echo $?
0

$ npx eslint app/api/webhooks/stripe/route.ts lib/stripe/webhook-signature.ts ; echo $?
0                                    # zero messages from either new file

$ diff lint-before.txt lint-after.txt
LINT RULE PROFILE IDENTICAL TO BASELINE     # 912 messages across the same 15 rules
```

**Not run, per standing instruction:** the migration, `next build`, `next dev`, `npx cap sync`.

⚠️ **What that bounds.** The verification logic is genuinely exercised (15 vectors above, real HMACs, real `node:crypto`). The **route** is not: it has never handled an HTTP request, and the insert has never run against a database that has the table. The first end-to-end proof is step 5 below.

---

## What to set, in order

### A. Apply the migration (before deploying)

```
supabase/migrations/20260807_stripe_webhook_events.sql
```

Then run its `VERIFY AFTER APPLYING` block — in particular `col_count` = 9 and `livemode` = `NO | null`.

### B. Deploy the code

The endpoint goes live and **refuses everything** with `no_secret_configured` until step D. That is safe and intended — it fails closed.

### C. Stripe Dashboard — **test mode**

1. Switch to **test mode** (the toggle in the Dashboard).
2. **Workbench → Webhooks → Create an event destination.**
3. **Events from:** 🔴 the scope matters and there are two. Choose **Connected accounts** for events belonging to trucks (`account.updated`, and direct-charge `payment_intent.succeeded`); choose **Your account** for platform-scoped events. They are separate destinations with separate secrets. **For groundwork, create the *Connected accounts* one first** — that is where Connect onboarding and direct charges will report.
4. **Endpoint URL:** `https://<your-domain>/api/webhooks/stripe`
5. **Events:** do not select "all events". Start with `account.updated` (onboarding readiness), plus `checkout.session.completed` and `payment_intent.succeeded` when payments begin. Stripe: *"Listening for extra events puts undue strain on your server and we don't recommend it."*
6. Create it, then **Click to reveal** the signing secret (`whsec_…`) and copy it.

### D. Vercel

Set, for **Production** (and Preview if you will test there):

```
STRIPE_WEBHOOK_SECRET = whsec_…            (the value from step C6)
```

**Then redeploy** — Vercel env vars only take effect on a new deployment.

### E. Prove it end to end

```bash
stripe login
stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe   # local
stripe trigger --stripe-account acct_… account.updated                  # connected-account scope
```

Against the deployed URL, use the Dashboard's **Send test event**, then check:

- Vercel logs show `[webhook/stripe] RECEIVED id=evt_… type=account.updated livemode=false`
- `select * from stripe_webhook_events` has exactly one row, `livemode = false`
- **Resend the same event** from the Dashboard → logs show `DUPLICATE`, still one row

### F. Later, when going live

Create the **live-mode** destination on the **same URL**. It gets a **different** signing secret. Then set both, comma-separated:

```
STRIPE_WEBHOOK_SECRET = whsec_live_…,whsec_test_…
```

and redeploy. This is exactly the case the plural-secret design exists for, and the `2 secrets, live one 2nd` vector covers it.

---

## What this unblocks, and what is still ahead

**Unblocked:** verified events now arrive and are recorded idempotently, with their mode. A handler can be written against a trustworthy input.

**Still ahead, unchanged from the readiness audit:**

- **A handler** — a new caller of `recordPaymentEvent` passing `channel: 'online'`, `externalRef: pi_…`, and `livemode` from the event. It must set `handled = true` on the receipt row.
- **The idempotency key for the money write.** `collect:{orderKey}:{paidBefore}:{balance}` survives redelivery but **collides on a legitimate second charge of the same amount**. Use the Stripe object id — which [ledger.ts:170](lib/payments/ledger.ts#L170) already names as the only complete answer.
- **Connect onboarding**, and the open decision of where the `acct_…` lives (§37 recommends `operators`; there is no column waiting — §13 records that `operators.stripe_customer_id` has never existed).
- **The fee columns** §37 designed and nobody built.
- **Phase two of the livemode migration** — `alter column livemode drop default` on `order_payments`, once the deploy is live everywhere.
- **`trucks.currency` / `trucks.country`** remain **unverified** — asserted by §37, no migration creates them, no code reads them. Check `information_schema` before anything depends on them.
- **The four unverified webhook routes.** Meta ×3 and Twilio still process POST bodies with no authentication. Out of scope here; [lib/stripe/webhook-signature.ts](lib/stripe/webhook-signature.ts) is deliberately shaped to be the pattern they are fixed against.
