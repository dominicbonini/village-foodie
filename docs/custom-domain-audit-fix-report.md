# Custom domain — Stage 6d: limiter-failure direction, and the audit pseudonym

**WHICH OF THE THREE I PERFORMED: A TYPECHECK AND THREE EXECUTIONS.** No standalone parse — `npx tsc
--noEmit` subsumes it and **exits 0**. Three harnesses transpile the **real** route and run it in a
`vm`: **30/30** on the two fixes, **35/35** re-running Stage 6c's security suite, and **96/96 + 5/5** on
old-versus-new equivalence. Eight further assertions are explicitly labelled **PARSE** (§4) — they read
file text, not behaviour.

🔴 **Nothing was deployed. No migration was run and none was needed. No email was sent, no DNS lookup
was made, no domain was touched at the hosting side, and NO SQL WAS EXECUTED** — including the
production check in §3.4, which is written out for you to run by hand. Pizzeria Gusto and Tikka Tonic
are untouched.

**One span of this prompt contradicted itself, I stopped, and you resolved it — §1.1.** Nothing arrived
garbled.

**Files changed — three:**

| File | Change |
|---|---|
| `app/api/manage/route.ts` | 5 hunks, confined to the two limiter branches and the audit write |
| `lib/audit/pseudonymise.ts` | **NEW** — 1 exported function |
| *(`lib/ratelimit.ts` — **unchanged this stage**; both buckets keep 10/10m and 3/24h)* | — |

---

## 1. LIMITER FAILURE

### 1.1 🔴 THE CONTRADICTION, AND WHY I STOPPED

The brief said *"If there is an existing convention, follow it"* and, two sentences later, *"Do not fail
open."* **The existing convention is fail open — unanimously, in four places, each with the direction
argued in a comment:**

```
app/api/demo/route.ts:109-112          "Redis unreachable → FAIL OPEN. A prospect being turned away by
                                        our own infrastructure is worse than a brief loss of throttling,
                                        and the size/type caps still apply."
app/api/demo/build-request/route.ts:45 "Fails open for the same reason."
app/api/signup/route.ts:80-92          "Fail-OPEN if the limiter is unreachable — the limiter being down
                                        must not stop legitimate signups."
app/api/manage/whatsapp-preview:145-50 "Redis unreachable → FAIL OPEN, the same direction
                                        app/api/demo/route.ts takes and for the same reason … and the
                                        length cap and the auth gate both still apply."
```

Both instructions could not be satisfied, so I stopped and asked rather than choosing. **You answered
C — the split — and named the deciding test: every one of those four comments justifies its direction
by naming a control that STILL APPLIES when the limiter is down. Applying that same test to these two
branches gives opposite answers, which is why the split is not a compromise.**

### 1.2 `domain_preflight` → FAIL OPEN, following the convention

```ts
    try {
      const pre = await domainPreflightRatelimit.limit(`preflight:${truck.id}`)
      if (!pre.success) { … return 429 }
    } catch (err) {
      console.error('[domain_preflight] rate-limit check failed, allowing through:', err)
    }
```

**Which convention: the four sites above, and the wording of the log line matches theirs verbatim
(`rate-limit check failed, allowing through`) so a grep finds all five together.**

**The surviving control is the auth gate.** A caller must be an authenticated operator with a role on
this truck, and demo identities are refused outright (Stage 6c). This branch reaches **no third party**
and spends **no shared allowance** — it makes outbound lookups on infrastructure we pay for. The blast
radius during a Redis outage is bounded to real operators typing hostnames.

### 1.3 `domain_send_instructions` → FAIL CLOSED, a deliberate exception

```ts
    let sendLimit: { success: boolean }
    try {
      sendLimit = await domainInstructionsRatelimit.limit(`instructions:${truck.id}`)
    } catch (err) {
      console.error(`[ratelimit] UNAVAILABLE limiter=domain-instructions key=instructions:${truck.id} — refusing (fail closed):`, err)
      await logAction(supabase, {
        action: 'domain_send_instructions_limiter_unavailable',
        truckId: truck.id,
        afterState: { address, recipient_hash: pseudonymiseEmail(to), outcome: 'refused_fail_closed' },
        actor: { actorKind: requestingUserRole === 'owner' ? 'owner' : 'staff', actorId: requestingUserId, actorLabel: null },
        source: resolveActorSource(req, body),
      })
      return NextResponse.json({
        error: 'We could not send that just now. Try again shortly — or copy the details on this screen and email them across yourself, which works just as well.',
      }, { status: 503 })
    }
```

**The same test, opposite answer.** The surviving control here is *also* the auth gate — but the auth
gate does not constrain **who receives the mail**, and that is what this branch risks. It reaches **a
third party's inbox**, from our domain, on a **shared Brevo allowance whose first casualty when
exhausted is order confirmations for live trucks** (`lib/ratelimit.ts:152-157`). Losing the meter must
close that path, not open it.

⚠️ **503, not 429.** Nothing was counted, so *"too many requests"* would be a lie about why.

🔴 **AND THE REFUSAL CARRIES A WAY THROUGH, which is what stops it being a dead end.** The message names
the alternative, and **the alternative is real, not aspirational**: the record rows are already on
screen with per-row Copy buttons — `components/dashboard/CustomDomainSetup.tsx:278-280` (`copy()` at
`:132`). An operator in a hurry sends the same information from their own address and loses nothing but
our formatting.

### 1.4 🔴 THE CLOSED-FAIL IS LOGGED WHERE ABUSE IS READ, NOT INFERRED FROM AN ABSENCE

A limiter **outage** and a limiter **refusal** are the two reasons a send does not happen, and the first
would otherwise show up only as *fewer rows than expected* — a reading nobody performs. The outage now
writes its own row to `action_audit_log`, under a **distinct action name**
(`domain_send_instructions_limiter_unavailable`), so flapping Redis is **countable next to the sends
themselves**. It carries the truck, the actor, the pseudonymised recipient and
`outcome: 'refused_fail_closed'`. The console line is kept as well, under a different prefix
(`UNAVAILABLE` rather than `REFUSED`) so the two are greppable apart.

### 1.5 EXECUTION — a rejecting limiter, both branches

The harness's limiter **throws** exactly as `@upstash/ratelimit` does when Redis is unreachable.

```
  domain_preflight          → 200  (FAIL OPEN: proceeds, error logged)
  domain_send_instructions  → 503  (FAIL CLOSED)
      "We could not send that just now. Try again shortly — or copy the details on this screen and
       email them across yourself, which works just as well."
  send, limiter DENIES      → 429  (unchanged: over the limit, not an outage)
```

```
  PASS  preflight does NOT throw / 500 on a rejecting limiter
  PASS  🔴 preflight FAILS OPEN — the request completes
  PASS  …and the outage is logged, not swallowed silently
  PASS  send does NOT throw / 500 on a rejecting limiter
  PASS  🔴 send FAILS CLOSED with 503, not 429
  PASS  🔴 …and NO email left
  PASS  …and no outbound lookup was made either
  PASS  🔴 the message says try again shortly
  PASS  🔴 …AND offers the copy-the-details way through
  PASS  🔴 the closed-fail is logged DISTINCTLY, where abuse is read
  PASS  …distinguishable from a normal send row
  PASS  a normal over-limit refusal is still 429, not 503
  PASS  …and writes NO limiter-unavailable row
```

🔴 **The last two matter as much as the rest: an outage and an over-limit refusal must stay
distinguishable**, or the new row would be noise.

### 1.6 ⚠️ ONE THING I FOUND AND DID NOT CHANGE

**`proxy.ts:128` calls `customHostRatelimit.limit()` with NO try/catch at all.** A rejection there
propagates out of the middleware, on the public custom-domain serving path — the one surface where a
Redis outage would take an operator's page down rather than merely un-metering it. **`proxy.ts` is on
this brief's forbidden list, so I did not touch it.** Recorded for a future prompt.

---

## 2. THE RECIPIENT IS PSEUDONYMISED

### 2.1 What changed

`afterState.recipient` (the raw address) → `afterState.recipient_hash`, via a new one-function module:

```ts
export function pseudonymiseEmail(address: string): string {
  const secret = process.env.AUDIT_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createHmac('sha256', secret).update(address.trim().toLowerCase(), 'utf8').digest('hex').slice(0, 32)
}
```

### 2.2 The three decisions inside that line

🔴 **HMAC, NOT A BARE SHA-256. An email address is low-entropy**, so an unkeyed digest is not a pseudonym
— anyone holding the table and a candidate list confirms a guess in one hash. A keyed MAC makes the
digest useless without the key, so the row survives as a **counter** rather than as a **lookup**.

⚠️ **ON THE KEY.** `AUDIT_HASH_SECRET` if set, otherwise `SUPABASE_SERVICE_ROLE_KEY`. The fallback is
deliberate and removes the unset-variable failure mode entirely: this route **cannot run** without the
service-role key, so there is no path where hashing silently degrades to unkeyed. Reusing it is bounded
— the digest is never exposed to a caller, there is no verification oracle, and anyone holding that key
already holds the database this table lives in. 🔴 **Set `AUDIT_HASH_SECRET` before this ships anyway:**
one secret per purpose is the rule, and **rotating the service-role key would silently re-pseudonymise
every future row**, so old and new rows for one address would stop clustering.

🔴 **NORMALISED BEFORE HASHING, AND THAT IS LOAD-BEARING.** `Web@Agency.co.uk` and
`  webperson@agency.co.uk  ` are one inbox. Hashing them unnormalised splits the cluster, and **forty
sends to one person would read as forty sends to forty people** — destroying the exact signal the hash
exists to preserve. ⚠️ Case-folding the local part is not universally correct per RFC 5321, but it is
correct for every mail provider in practice, and **under-clustering is the failure that matters here.**

### 2.3 EXECUTION — the clustering, proved

Six sends: four spellings of one inbox, then two others.

```
  "webperson@agency.co.uk"       → b7e66e428814c9517249a4919aab2891
  "WebPerson@Agency.co.uk"       → b7e66e428814c9517249a4919aab2891
  "  webperson@agency.co.uk  "   → b7e66e428814c9517249a4919aab2891
  "WEBPERSON@AGENCY.CO.UK"       → b7e66e428814c9517249a4919aab2891
  "someone@else.com"             → d6043b5733c32e1e657eced0b14f04af
  "third@party.net"              → ecc9f26cbd868c8ee04367b8eab4f103

  the four spellings of one inbox produced 1 distinct hash
```

```
  PASS  🔴 four spellings of ONE address cluster to ONE hash
  PASS  🔴 two DIFFERENT addresses do not collide with it
  PASS  the hash is stable across processes (deterministic, keyed)
  PASS  …32 hex characters
  PASS  🔴 the raw address appears NOWHERE in the row
  PASS  it is KEYED — a different secret yields a different pseudonym
```

**So abuse remains visible in the shape the requirement asked for: repeated sends to one inbox are one
value repeated, and you can still ask "which inbox" of Brevo, which holds the address itself and — at
three sends per truck per day — holds a short trail.**

---

## 3. THE MODULE'S NO-IDENTIFIERS CLAIM

### 3.1 What the claim is

`lib/audit/actionAudit.ts:21-22`:

> ✅ **VERIFIED LIVE against production on 6 August 2026: 63 rows, NONE containing an email-shaped string
> or a `customer_*` key in `before_state` / `after_state`.** No scrub was needed and none was built.

Stage 6c broke that claim by writing a raw address. **This stage restores it.**

### 3.2 EXECUTION — the same predicate, over every row this code writes

Both audit shapes this route can produce were generated by running the real route and checked with the
predicate the module names:

```
  domain_send_instructions                       email-shaped: no   customer_* key: no
      {"before":null,"after":{"address":"schedule.rtf.co.uk","recipient_hash":"b7e66e…","provider":"cloudflare"}}
  domain_send_instructions_limiter_unavailable   email-shaped: no   customer_* key: no
      {"before":null,"after":{"address":"schedule.rtf.co.uk","recipient_hash":"b7e66e…","outcome":"refused_fail_closed"}}

  PASS  🔴 NO audit row this code writes contains an email-shaped string
  PASS  …nor a customer_* key
  PASS  both audit shapes were checked (normal send + limiter-unavailable)
```

⚠️ **`address` remains in clear and is NOT an identifier of a person** — it is `truck.custom_domain`,
the truck's own web address, already public by construction.

### 3.3 ⚠️ WHAT THIS EXECUTION DOES AND DOES NOT PROVE

It proves **the code can no longer write an offending row**. It does **not** re-run the production check,
because that is a live SQL query and I do not run SQL.

### 3.4 🔴 THE PRODUCTION RE-RUN — FOR YOU, NOT RUN BY ME

```sql
select count(*) as total,
       count(*) filter (where (coalesce(before_state::text,'') || coalesce(after_state::text,''))
                        ~ '[^@[:space:]"]+@[^@[:space:]"]+\.[^@[:space:]"]+')  as email_shaped,
       count(*) filter (where (coalesce(before_state::text,'') || coalesce(after_state::text,''))
                        ~ '"customer_[a-z_]*"')                                as customer_keys
  from action_audit_log;
-- expect email_shaped = 0 and customer_keys = 0
```

✅ **It should still pass today regardless**, because the raw-address code was never deployed — Stage 6c
is uncommitted and `domain_send_instructions` does not exist at HEAD. **The claim was never actually
broken in production; it was broken in the working tree, and it is now repaired before shipping.**

---

## 4. NOTHING ELSE CHANGED — proved four ways

**(a) EXECUTION — Stage 6c's security suite, re-run: 35/35.** All five actions still refuse a demo
identity with zero outbound effect; the demo carve-out still works for non-domain actions; a real truck
with no session is still 401; the send limit still bites on the fourth send; the preflight limit still
bites on the eleventh; a real owner on Max still completes setup end to end; no caller-supplied text
reaches the email body; the staff gate is unchanged in both directions.

*(One assertion in that suite was updated rather than left passing on stale behaviour: it asserted the
raw recipient was recorded. It now asserts a 32-hex pseudonym is recorded **and** that no `@` appears in
the row. Changed deliberately and named here.)*

**(b) EXECUTION — 96 non-domain cases, original route versus current: 0 mismatches.** Twelve actions ×
four caller shapes × two trucks.

**(c) PARSE — `resolveTruckAccess` is byte-identical to the pre-Stage-6c original.** Extracted from both
and diffed: *"✅ IDENTICAL."* The demo short-circuit is untouched.

**(d) PARSE — scope.** `lib/ratelimit.ts` is **unchanged this stage** (both buckets still 10/10m and
3/24h; lines 1-186 still byte-identical to the pre-6c file). `proxy.ts` mtime is `2026-08-27 10:57`,
predating this session's work — **untouched**. This stage's diff is five hunks, and all twelve deleted
lines are the exact lines being replaced (the two limiter calls, the superseded comment block, and the
raw-recipient field).

---

## 5. Verification summary

```
  npx tsc --noEmit                                   exit 0
  fixes.js      (rejecting limiter, hash, predicate)  30/30 PASS
  domainsec.js  (Stage 6c suite, re-run)              35/35 PASS
  nochange.js   (original route vs current)           96/96 + 5/5 PASS
```

The four things the brief required:

1. ✅ **A rejecting limiter — neither branch 500s.** §1.5. ⚠️ **Note the requirement's wording assumed
   both would refuse; under decision C only the send branch refuses.** Preflight *proceeds*, by design,
   and what is proven is that it does so cleanly and logs the outage.
2. ✅ **Repeated sends to one address still cluster.** §2.3 — four spellings, one hash.
3. ✅ **The no-identifiers predicate passes over every row this code writes.** §3.2. The production
   query is in §3.4 and **was not run**.
4. ✅ **The five actions, the two buckets and every other `/api/manage` action are otherwise
   unchanged.** §4.

---

## 6. What remains unverified

1. **Nothing was rendered in a browser and nothing was deployed.** No operator saw the 503, and the
   copy-the-details path was read from the JSX, not clicked.
2. **No real Upstash bucket was exercised.** The rejecting limiter is a harness throw. What is proven is
   that the route's control flow handles a rejection in the chosen direction — **not** that
   `@upstash/ratelimit` rejects (rather than hangs) when Redis is unreachable. **A HANG, not a
   rejection, is the failure mode neither this change nor the four existing sites handle**: there is no
   timeout on any `.limit()` call in this repo. Worth its own prompt.
3. **No INSERT reached a real database.** `action_audit_log`'s CHECK constraints are satisfied by
   inspection; a 23514 would be swallowed by `logAction`'s best-effort catch and appear only in a log.
4. **The §3.4 production query was not run.**
5. **`AUDIT_HASH_SECRET` is not set anywhere** — the code falls back to the service-role key by design,
   but the recommended variable does not yet exist in any environment.
6. **`proxy.ts:128`'s missing try/catch is unfixed**, being out of scope. §1.6.
7. **`lib/custom-domain/{apex,dns,vercel,copy}` were STUBBED** in all three harnesses; their logic was
   proven in earlier stages.
8. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
9. **Six migrations remain unapplied**, and this stage needed none.
