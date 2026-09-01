# Custom domain — Stage 6c: closing what the actions audit found

**WHICH OF THE THREE I PERFORMED: A TYPECHECK AND TWO EXECUTIONS.** No standalone parse — `npx tsc
--noEmit` subsumes it and **exits 0**. Two harnesses transpile the **real** route and run it in a `vm`:
**34/34** on the security behaviour and **96/96 + 5/5** on old-versus-new equivalence. Six further
assertions in §6 are explicitly labelled **PARSE** — they read file text, not behaviour.

🔴 **Nothing was deployed. No migration was run and none was needed** — the recording lands in
`action_audit_log`, which is already applied. **No email was sent, no DNS lookup was made, and no domain
was added or removed against the real Vercel project:** every outbound call is intercepted inside the
`vm`. Pizzeria Gusto and Tikka Tonic are untouched.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.** In
particular, **no fix required touching anything in the forbidden list**, so there was nothing to stop
for. `resolveTruckAccess` is **byte-identical**, the demo short-circuit is **byte-identical**, the proxy
allowlist is **untouched**, and no limiter was added to any other part of `/api/manage`. §6 proves each.

**Files changed — two:**

| File | Change |
|---|---|
| `lib/ratelimit.ts` | **appended only** — two new buckets; lines 1-186 byte-identical |
| `app/api/manage/route.ts` | 5 hunks, **0 deletions** — imports, one action list, two limiter checks, one audit write |

---

## 1. DEMO IDENTITIES ARE REFUSED AT THESE ACTIONS

### 1.1 What was done, and where

The short-circuit is **not** altered. `resolveTruckAccess:101-103` still reads exactly as before:

```ts
  if (isDemoIdentifier(truck.id)) {
    return { ok: true, role: 'owner', userId: null, operatorId: null, via: 'demo' }
  }
```

Instead the actions opt **out** of it, in the route body beside the existing `staffBlockedActions` gate —
the same shape, at the same level, keyed on the action name:

```ts
  const demoBlockedActions = [
    'domain_preflight', 'domain_status', 'domain_provision', 'domain_confirm', 'domain_send_instructions',
  ]
  if (demoBlockedActions.includes(action) && access.via === 'demo') {
    return NextResponse.json({ error: 'Not available on a demo truck' }, { status: 403 })
  }
```

🔴 **THE REFUSAL IS AT THE ACTION, NOT AT THE IDENTITY LAYER, AND THAT IS THE WHOLE POINT.** Narrowing
`resolveTruckAccess` would change access for ~60 actions and for `GET` as well. This list changes access
for five.

⚠️ **`access.via === 'demo'`, not `!requestingUserId`.** Both are true of the same callers today, but the
second describes a symptom; the first names the branch that granted access, so it cannot quietly start
matching something else.

⚠️ **Five, not four.** `domain_provision` is on the list too. The audit found it was the step that *sets*
`custom_domain` and therefore the step that makes `domain_send_instructions` reachable at all — leaving
it open would have left the chain open. It is named here rather than slipped in.

⚠️ **Defence in depth, not the only guard.** `app/dashboard/[token]/page.tsx:4485` already renders the
setup card behind `!isDemo`, so no demo dashboard shows it. **This closes the API, which is what the
audit found reachable.**

### 1.2 EXECUTION — it bites, shown from the attack path

A demo `dashboard_token`, **no session at all**, exactly as the audit describes:

```
1. THE ATTACK PATH — a demo dashboard_token, NO session
  PASS  domain_preflight           → 403 "Not available on a demo truck"   emails=0 dns=0 vercel=0
  PASS  domain_status              → 403 "Not available on a demo truck"   emails=0 dns=0 vercel=0
  PASS  domain_confirm             → 403 "Not available on a demo truck"   emails=0 dns=0 vercel=0
  PASS  domain_send_instructions   → 403 "Not available on a demo truck"   emails=0 dns=0 vercel=0
  PASS  domain_provision           → 403 "Not available on a demo truck"   emails=0 dns=0 vercel=0
```

Each refusal is checked twice: the status **and** that the call caused **zero** outbound effect — no
Brevo send, no DoH lookup, no Vercel request.

🔴 **AND THE SAME HARNESS RUN AGAINST THE PRE-CHANGE ROUTE SHOWS THE HOLE WAS REAL**, rather than my
asserting it from the audit:

```
    ✅ domain_preflight           old 200 → new 403
    ✅ domain_status              old 200 → new 403
    ✅ domain_confirm             old 400 → new 403
    ✅ domain_send_instructions   old 400 → new 403
    ✅ domain_provision           old 200 → new 403
```

The three that previously returned **200** to an anonymous caller are the three with side effects. The
two 400s were refused by a *state* check (`no address set up yet`), never by an authorisation one — the
audit's point, now demonstrated on both sides of the change.

### 1.3 The carve-out still works

```
  PASS  2 a demo identity can STILL use a non-domain action (carve-out intact)   upsert_category → 200
  PASS  2 a REAL truck with no session is still 401 (resolveTruckAccess unchanged)
```

---

## 2. `domain_send_instructions`

### 2.1 The recipient stays caller-supplied

Unchanged: `body.to`, validated by the same regex. The operator is emailing their web person — an
address we do not hold and could not look up — so **the constraint is on the volume, not on the value.**

### 2.2 The limit: 3 per truck per rolling 24 hours

```ts
export const domainInstructionsRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '24 h'),
  analytics: true,
  prefix: 'vf_rl_domain_instructions',
})
```

**Why 3/day.** The legitimate journey is *"send the record to whoever runs our website"* — once, plus a
resend when the first is missed, plus one more for a second person. Three covers that with nothing left
over. It **deliberately matches `signupEmailRatelimit`'s 3/day** rather than inventing a number, because
it is the same risk with the same ceiling behind it: `lib/ratelimit.ts:152-169` already records that
Brevo Free is a **shared 300/day cap that stops sending silently**, and that *"the first casualty is
order confirmations for LIVE trucks."*

⚠️ **The key is the TRUCK, not the recipient — the opposite of `signupEmailRatelimit`, deliberately.**
There the caller is anonymous and the *third party* needs protecting from many senders. Here the caller
is an authenticated operator, so the question is *"how much mail may this truck cause"*; a per-recipient
key would let one truck mail a hundred different addresses three times each.

⚠️ **A rolling window, not a calendar day** — a fixed day would allow six sends across a midnight
boundary.

⚠️ **Checked before the two outbound lookups**, not just before the send, so a refused caller costs us
nothing at all rather than costing us the DNS and Vercel calls.

### 2.3 EXECUTION — proved by EXCEEDING it

```
3. THE SEND LIMIT — four sends against a 3-per-24h bucket
  send 1: → 200  email sent: 1  audit rows: 1
  send 2: → 200  email sent: 1  audit rows: 1
  send 3: → 200  email sent: 1  audit rows: 1
  send 4: → 429  email sent: 0  audit rows: 0   "You have sent these instructions a few times today already. …"

  PASS  3 🔴 send 4 is REFUSED with 429
  PASS  3 🔴 …and NO email left on the refused attempt
  PASS  3 a refused send makes ZERO outbound calls (limiter precedes the lookups)
```

The harness's limiters are **real counting sliding windows**, not always-allow stubs, so the fourth call
is refused by the mechanism under test.

### 2.4 The address is recorded

Into the existing append-only `action_audit_log` — **no migration needed**, because that table is
already applied and its `action` column is free text by design *precisely so a new caller is not
deploy-coupled*:

```ts
    await logAction(supabase, {
      action: 'domain_send_instructions',
      truckId: truck.id,
      afterState: { address, recipient: to, provider: dns.provider?.id ?? null },
      actor: { actorKind: requestingUserRole === 'owner' ? 'owner' : 'staff',
               actorId: requestingUserId, actorLabel: null },
      source: resolveActorSource(req, body),
    })
```

Best-effort and **after** the send: the mail has already left, so failing the response would tell the
operator it did not send when it did. (Contrast `logActionOrThrow`, which exists for actions that
*destroy* evidence.)

```
  PASS  4 an audit row is written per send
  PASS  4 🔴 the RECIPIENT is recorded    {"address":"schedule.rtf.co.uk","recipient":"webperson@agency.co.uk","provider":"cloudflare"}
  PASS  4 …scoped to the truck, with the actor
```

🔴 **ONE CONSEQUENCE I AM FLAGGING RATHER THAN BURYING.** `lib/audit/actionAudit.ts:15-27` instructs that
`before_state`/`after_state` stay free of identifiers, and records a **live check on 6 August 2026 that
found no email-shaped string in the table**. That check will now start failing. The recipient is a third
party rather than a customer, so this is adjacent to the rule rather than a breach of it — but **the
retention consequence is identical: nothing sweeps this table, it has no foreign keys, and the
anonymisation pass cannot reach inside a JSONB blob.** I recorded the address anyway, because **an abuse
log that cannot name the inbox is not an abuse log** — which is what item 2 asked for. If you would
rather it were a hash, that is a one-line change and the trade is: patterns still visible, support
matching still possible by hashing the complainant's address, individual addresses no longer readable.

### 2.5 🔴 IS THE EMAIL BODY CALLER-SUPPLIED? **NO. IT IS COMPOSED SERVER-SIDE, ENTIRELY.**

**Confirmed, and stated as the brief requires.** Every input to `instructionsEmail`
(`lib/custom-domain/copy.ts:49-88`) traces to something the caller does not control:

| Body input | Source | Caller-controlled? |
|---|---|---|
| `truckName` | `truck.name` (database) | **No** |
| `address` | `truck.custom_domain` (database) | **No** |
| `providerLabel` | `DNS_PROVIDERS` record matched by NS lookup | **No** |
| `rows` | `recordRows()` over the provider record + `recommendedCNAME` from the Vercel API | **No** |
| `operatorEmail` | `truck.contact_email` (database) | **No** |
| `subject` | a template literal over `truckName` | **No** |

**`body.to` is the envelope recipient and nothing else. There is no free-text, message or note
parameter, and none of the request body reaches the subject, HTML or text.** The composer additionally
HTML-escapes every interpolation (`const esc = …`).

Proven, not just read — the harness posts a request carrying `message`, `body`, `html`, `subject`,
`truckName`, `address` and `note`, all set to `INJECTED`:

```
  PASS  7 🔴 NO caller-supplied text reaches the subject, html or text body
  PASS  7 the address in the body is the STORED one, not the request's
```

**Nothing to fix here, and nothing was fixed.**

---

## 3. `domain_preflight`

### 3.1 The limit: 10 per truck per 10 minutes

```ts
export const domainPreflightRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 m'),
  analytics: true,
  prefix: 'vf_rl_domain_preflight',
})
```

**Why a limit at all.** One call becomes **three to five outbound requests on a host the caller names** —
a CAA lookup and an NS lookup, each falling through Cloudflare to Google on failure, plus one
authenticated `GET` to `api.vercel.com` spending our API quota. It is the only one of the four whose
fan-out is driven by caller-supplied input.

**Why 10/10min.** Sized to the worst *legitimate* journey, which is a person typing: land on the screen,
mistype, correct, try `schedule.` then `orders.`, back out and return — five or six attempts with
headroom for a double-submit. Ten is roughly double. The ceiling it sets is ~60 preflights an hour per
truck, so ~300 outbound requests an hour rather than an unbounded loop. **It is a ceiling, not a target:
no legitimate operator comes close, which is what makes a 429 here a signal rather than an
inconvenience.**

### 3.2 Where it is enforced, and that it touches nothing else

🔴 **Inside the `if (action === 'domain_preflight')` branch, NOT in `proxy.ts`.** That file's rate-limit
scope is a **positive allowlist of public paths**, and `/api/manage` is structurally outside it — its own
comment says why: *"no future edit to an exempt list can accidentally re-expose them."* Adding
`/api/manage` to that allowlist would put **one bucket in front of ~60 actions**, including every menu
write an operator makes during service. **That is precisely the live-surface change this brief forbids.**

Confirmed by grep — the two limiters are referenced in exactly three places, all inside their own action
branches:

```
  app/api/manage/route.ts:24    import { domainPreflightRatelimit, domainInstructionsRatelimit } …
  app/api/manage/route.ts:1067  const pre = await domainPreflightRatelimit.limit(`preflight:${truck.id}`)
  app/api/manage/route.ts:1220  const sendLimit = await domainInstructionsRatelimit.limit(`instructions:${truck.id}`)
```

**`proxy.ts` contains neither name.** Both buckets carry their own Redis prefixes
(`vf_rl_domain_preflight`, `vf_rl_domain_instructions`), so they share no key space with any existing
tier.

### 3.3 EXECUTION

```
5. THE PREFLIGHT LIMIT — eleven checks against a 10-per-10min bucket
  checks 1-10 allowed; check 11 refused with 429, 0 outbound lookups on the refused call

  PASS  5 the first 10 preflights are allowed
  PASS  5 🔴 the 11th is REFUSED
  PASS  5 🔴 …and the refused call makes ZERO outbound lookups
```

---

## 4. `domain_status` AND `domain_confirm` — NOTHING BEYOND ITEM 1

**Stated plainly, as asked: they need nothing else, and no limiter was added to either.**

- **`domain_status`** reads `truck.custom_domain` — **from the row, never from the body** — and makes a
  Vercel config call **only when that column is already set**. Nothing the caller sends is used. A demo
  truck has no domain, so before item 1 it did not even make the outbound call.
- **`domain_confirm`** writes one timestamp on its own row, scoped `.eq('id', truck.id)`, and refuses
  unless the domain is already live. It is idempotent in effect: unbounded calls cost one UPDATE each.

🔴 **A limiter on either would be symmetry, not security.** It would add a Redis round-trip to a screen
poll and a bucket nobody will ever read, in exchange for capping a write that overwrites only itself.
**They are on the demo-block list because a demo identity has no business in this flow at all; they get
nothing further.**

---

## 5. VERIFICATION SUMMARY

**A typecheck and two executions.** Six assertions are labelled PARSE and counted as such.

```
  npx tsc --noEmit                                        exit 0
  domainsec.js   (the real route, real counting limiters)  34/34 PASS
  nochange.js    (old route vs new route, same inputs)     96/96 + 5/5 PASS
```

The four things the brief required:

1. ✅ **The audit's actual attack path — demo token, then the action — refused at each.** §1.2, with the
   pre-change route showing 200s where the post-change route shows 403s.
2. ✅ **The send limit proved by exceeding it**, not by staying under. §2.3 — four sends, the fourth
   refused, no email on the refusal.
3. ✅ **A real operator on Max completes setup end to end.** §5.1 below.
4. ✅ **Nothing outside these actions changed behaviour.** §6.

### 5.1 A real owner on Max, whole flow, one shared database and one shared limiter set

```
  domain_preflight           → 200  {"ok":true,"address":"schedule.rtf.co.uk","caa":{"state":"clear",…
  domain_provision           → 200  {"ok":true,"address":"schedule.rtf.co.uk","subdomain_label":"schedule",…
  domain_status              → 200  {"address":"schedule.rtf.co.uk","state":"awaiting_dns",…
  domain_send_instructions   → 200  {"success":true}
  domain_confirm             → 200  {"success":true}
  domain_status              → 200  {…"confirmed_at":"2026-08-27T…"}

  PASS  6 the whole journey spent 1 of 3 sends and 1 of 10 preflights
```

🔴 **The last line is the one that matters for sizing: a complete, successful setup consumes a tenth of
the preflight budget and a third of the send budget.** The limits are nowhere near the real journey.

And the pre-existing staff gate is unchanged in both directions:

```
  PASS  8 staff still 403 on send_instructions (pre-existing gate unchanged)
  PASS  8 staff still reach preflight (pre-existing, deliberately not on the staff list)
```

---

## 6. NOTHING OUTSIDE THE FOUR CHANGED — proved four ways

**(a) EXECUTION — 96 non-domain cases, old route versus new route, identical inputs.** Twelve actions
(`upsert_category`, `update_settings`, `update_truck`, `add_van`, `save_embed_setup`, `get_embed_status`,
`detect_platform`, `send_embed_instructions`, `invite_team_member`, `delete_category`,
`set_item_preorder_bulk`, and an unknown action) × four caller shapes (owner, staff, stranger,
anonymous) × two trucks (real, demo):

```
  cases run: 96      mismatches: 0
  PASS  96 non-domain cases behave identically
```

**(b) PARSE — `resolveTruckAccess` is byte-identical.** Extracted from both files and diffed:
*"✅ resolveTruckAccess IDENTICAL — not one byte changed."* The demo short-circuit at `:101-103` reads
exactly as it did.

**(c) PARSE — the change is five hunks and ZERO deletions.**

```
  @@ -21,6 +21,9 @@      four imports
  @@ -325,6 +328,38 @@    the demoBlockedActions list
  @@ -1023,6 +1058,17 @@   the preflight limiter, inside its branch
  @@ -1165,6 +1211,20 @@   the send limiter, inside its branch
  @@ -1189,6 +1249,34 @@   the audit write, inside its branch
  deletions in my change: 0
```

**(d) PARSE — file inventory.** Only `lib/ratelimit.ts` (appended; lines 1-186 byte-identical, verified
by diff) and `app/api/manage/route.ts` have mtimes from this stage. `proxy.ts`, `lib/custom-host.ts`,
`app/domain/page.tsx`, all four `lib/custom-domain/*` modules, `lib/custom-domain/cadence.ts`,
`components/dashboard/CustomDomainSetup.tsx`, `app/api/cron/custom-domain-check/route.ts`,
`lib/features.ts`, `lib/audit/*` and `vercel.json` all predate it.

---

## 7. WHAT REMAINS UNVERIFIED

1. **Nothing was rendered in a browser and nothing was deployed.** No 429 was seen by an operator; the
   two error strings are proven only as strings.
2. **No real Upstash bucket was exercised.** The harness limiters are real *counting sliding windows*
   written for the harness — they prove the route's control flow refuses at the boundary, **not** that
   `@upstash/ratelimit` behaves as documented against Redis. **If Upstash is unreachable at runtime,
   `.limit()` rejects and these two branches would throw a 500** — I did not test that failure mode and
   did not add a fail-open or fail-closed decision for it. **That is an open question worth your call.**
3. **`action_audit_log`'s CHECK constraints were not exercised.** `actor_kind` is `'owner'|'staff'` and
   `source` comes from `resolveActorSource`, both within the applied constraint sets by inspection — but
   no INSERT reached a real database, and a 23514 here would be swallowed by `logAction`'s best-effort
   catch and appear only as a console line.
4. **`lib/custom-domain/{apex,dns,vercel,copy}` were STUBBED** in both harnesses. Their logic was proven
   in earlier stages; what is proven here is the route's authorisation and limiting around them.
5. **The 96-case equivalence is a sample, not the whole route.** It covers twelve of roughly sixty
   actions. The zero-deletion diff and the identical `resolveTruckAccess` are what carry the rest.
6. **The retention consequence in §2.4 is unresolved by design** — flagged for your decision, not fixed.
7. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
8. **Six migrations remain unapplied**, and this stage needed none.
