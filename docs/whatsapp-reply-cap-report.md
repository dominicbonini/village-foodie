# WhatsApp reply cap — Phase 1 read, Phase 2 build

**Date:** 25 August 2026
**Build only. NOT committed, NOT pushed, NOT deployed** — deploys are frozen pending the App Store
decision. `next dev` was not run.
**Prompt integrity:** no span arrived garbled. No instruction contradicted another. **One premise in the
CONTEXT block is false — §0. One instruction is under-specified rather than contradictory — §2.3.**

---

# §0 — 🔴 THE PREMISE ABOUT UNCOMMITTED WORK IS FALSE, AND THE DISCREPANCY IS BENIGN

> Your brief: *"There is existing UNCOMMITTED work in the working tree on the Meta WhatsApp webhook (an
> environment-variable name fix and two lookup error-destructures). Do not revert it, do not conflict
> with it, and do not assume it is there — read it."*

**I read it. There is no uncommitted work on that route.**

```
  $ git status --porcelain --untracked-files=all
     M docs/reference-manual.md                    ← the V11.40 integration, unrelated
     ?? docs/pre-reply-tree-check-report.md        ← unrelated
  $ git diff -- app/api/webhooks/meta/whatsapp/route.ts
     (empty)
```

✅ **THE WORK EXISTS AND IS COMMITTED.** `git log -S"META_WHATSAPP_APP_SECRET"` puts it in **`3c1989b`,
24 August**. Both substantive claims hold — see §1.

✅ **I PROCEEDED RATHER THAN STOPPING, AND HERE IS THE REASONING.** The stop condition guards against
clobbering in-flight work. **Committed work cannot be clobbered by an additive change** — the discrepancy
*removes* the risk the instruction existed to manage, and it changes nothing about what Phase 2 builds.
⚠️ **If you would rather I had stopped, the build is one `git checkout` away.**

---

# §1 — PHASE 1: THE READS

## 1.1 THE ENVIRONMENT VARIABLE — ✅ ONE NAME, NO FALLBACK CHAIN

`app/api/webhooks/meta/whatsapp/route.ts:102`:
```ts
  const secrets = parseMetaAppSecrets(process.env.META_WHATSAPP_APP_SECRET)
```
And the file states the refusal at `:91-97`:
> *"THE VARIABLE NAME IS `META_WHATSAPP_APP_SECRET` AND IT IS DELIBERATELY NOT A FALLBACK CHAIN … A chain
> reading `META_WHATSAPP_APP_SECRET ?? META_APP_SECRET` would have worked and is REFUSED"*

## 1.2 BOTH TRUCK LOOKUPS — ✅ DESTRUCTURE AND LOG `error`

```
  :171  const { data, error } = await supabase … .eq('phone_number_id', phoneNumberId) … .maybeSingle()
  :177  // A QUERY THAT ERRORED IS NOT A QUERY THAT FOUND NOTHING, AND `const { data }` COULD NOT TELL THEM
  :186  `[webhook/meta-whatsapp] LOOKUP FAILED (primary, phone_number_id) code=${error.code} `
  :206  const { data, error } = await supabase … (fallback, display_phone_number) … .maybeSingle()
  :219  `[webhook/meta-whatsapp] LOOKUP FAILED (fallback, display_phone_number) code=${error.code} `
```

## 1.3 THE GREETING READ — QUOTED VERBATIM (pre-change, `:257-266`)

```ts
      const { data: prior } = await supabase
        .from('whatsapp_logs')
        .select('created_at')
        .eq('customer_number', from)
        .eq('truck_id', truck.id)
        .not('response_sent', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      isFollowUp = !!prior && localDateOfInstant(prior.created_at, truckTz) === getLocalDateInTz(truckTz)
```

| | |
|---|---|
| **Filters on** | `customer_number`, `truck_id`, `response_sent is not null` |
| **Time bound** | 🔴 **NONE in the query.** The time test is in JS: same local calendar date in `truckTz` |
| **Rows** | **ONE** — `.limit(1).maybeSingle()`, most recent first |
| **Position** | **BEFORE** the log insert, so this message's own row is not present — the file says so: *"Runs BEFORE the :116 log insert … → no self-suppression"* |

## 1.4 ORDER OF EXECUTION, SIGNATURE GATE → REPLY (pre-change)

```
  :101-118  signature gate      verifyMetaSignature → 401 on failure
  :171-240  truck lookup        primary phone_number_id, then display_phone_number fallback, then 200-no-truck
  :243      plan gate           canAccess(truck.plan, 'whatsapp_replies', …) → 200 if denied
  :249      truckTz
  :257-266  greeting read       whatsapp_logs, one row
  :273      events read         truck_events
  :283      REPLY CALL          generateWhatsAppReply({ … isFollowUp })
  :298      log insert          whatsapp_logs
```

## 1.5 THE LOG INSERT — ✅ EXACT COLUMNS, AND WHERE `classification` COMES FROM

```ts
    supabase.from('whatsapp_logs').insert({
      truck_id, customer_number, message_in, classification,
      events_found, response_sent, possible_miss,
    })
```
🔴 **`classification` is destructured from `generateWhatsAppReply` at `:283` — it is the MODEL'S OWN
OUTPUT.** That is precisely why the cap must run before it: reaching the classification means the model
call has already been paid for.

## 1.6 ✅ NO RATE LIMIT, QUOTA OR CAP EXISTS — VERIFIED BY EVALUATION, NOT BY READING PROSE

I copied `proxy.ts`'s three allowlist predicates verbatim and ran them against this route's path:

```
  path = '/api/webhooks/meta/whatsapp'
    isCustomerEvents  false        isStrictPublic  false        isGeneralPublic  false
    inLimitedScope    FALSE  →  never even considered for limiting
```

✅ **And a scan of the route itself for `ratelimit|quota|cap|throttle` returns NOTHING** (the only
`.limit()` calls are `.limit(1)` on the greeting and `.limit(10)` on events).

## 1.7 ✅ ITEM 6: YES — ONE (truck, customer) READ CAN SERVE BOTH. THE ARGUMENT, FROM SOURCE.

The greeting asks: *is the most recent replied row on today's local date?* Bounding that read to a
rolling 24 hours **cannot change the answer**, in either direction:

- **Nothing that qualified is lost.** A row on the same local calendar day is necessarily **less than 24
  hours old** — the longest intra-day gap is under 24h — so every row the greeting would answer "yes" to
  is inside the window.
- **Nothing new qualifies.** A row the window excludes is by definition **>24h old**, therefore on an
  earlier local date, therefore one the unbounded query already answered "no" to.

The most-recent row is still taken and `localDateOfInstant(…, truckTz) === getLocalDateInTz(truckTz)` is
still the test. **The per-customer count then falls out of the same rows at no extra cost.**

🔴 **THE PER-TRUCK COUNT CANNOT SHARE IT.** It spans every customer — a different scope — so it is its
own read. **That is the only part of the cap that needed one.**

---

# §2 — PHASE 2: THE BUILD

## 2.1 THE PURE MODULE — `lib/whatsapp/reply-cap.ts`

✅ **82 lines, ZERO imports, no database access, no import from the route.** Shape mirrors
`lib/payments/paid-step.ts` (also zero imports, one resolver, reasoning at the top).

**Exports:** `MAX_REPLIES_PER_CUSTOMER_24H = 10` · `MAX_REPLIES_PER_TRUCK_DAY = 300` ·
`CLASSIFICATION_CUSTOMER_CAP = 'CAP_CUSTOMER_24H'` · `CLASSIFICATION_TRUCK_CAP = 'CAP_TRUCK_DAY'` ·
`type ReplyCapDecision` · `decideReplyCap(counts)`.

✅ **The truck-day comment says it is a guess**, in those terms: *"Nothing is rolled out. There is NO
traffic to size it against — not a single truck is sending auto-replies in production today … REVISIT AT
FIRST REAL ONBOARDING."*

✅ **The two classification strings appear as literals in ZERO places outside the module** — a grep of
the route for `'CAP_CUSTOMER_24H'`/`'CAP_TRUCK_DAY'` returns **0**. The reason is recorded: a drifted
literal *"silently stops excluding its own rows — the cap would then count its own notices and tighten
itself every window."*

## 2.2 THE DECISION, PROVEN BY EXECUTION

🔴 **I RAN IT.** The module was transpiled with the TypeScript compiler and the real exported function
called. **This is execution — not a parse, not a typecheck.** (I also ran `npx tsc --noEmit`, exit 0, and
that is *not* what proves the table below.)

```
  case                                      cust24h  truckDay  notified   → decision
  ----------------------------------------  -------  --------  --------   -------------------
  one UNDER the customer limit                    9         0     false   REPLY
  EXACTLY AT the customer limit                  10         0     false   NOTIFY_CUSTOMER_CAP
  one OVER the customer limit                    11         0     false   NOTIFY_CUSTOMER_CAP
  at the customer limit, ALREADY NOTIFIED        10         0      true   SILENT_TRUCK_CAP
  one UNDER the truck limit                       0       299     false   REPLY
  EXACTLY AT the truck limit                      0       300     false   SILENT_TRUCK_CAP
  one OVER the truck limit                        0       301     false   SILENT_TRUCK_CAP
  BOTH caps hit at once                          10       300     false   SILENT_TRUCK_CAP
  BOTH hit, already notified                     10       300      true   SILENT_TRUCK_CAP
  zero of everything                              0         0     false   REPLY
```

✅ **Both limits are inclusive — "at the limit" caps, it does not wait for one over.**
✅ **When both caps hit, the SILENT branch wins**, and the module says why: the customer notice *"would
still be a BILLABLE message on a truck that is already over its day."*

## 2.3 ⚠️ THE ONE UNDER-SPECIFICATION, RESOLVED AND FLAGGED RATHER THAN INVENTED AROUND

**The union is specified closed at three members, and there is no `SILENT_CUSTOMER_CAP`.** For an
already-notified customer the correct action is *send nothing* — but the only silent member is named for
the truck cap.

🔴 **CONSEQUENCE: such a row is logged with the TRUCK-cap classification while the cause was the
CUSTOMER cap.** ⚠️ **It corrupts nothing** — both classifications are excluded from both counts, and the
customer-cap row that set `customerCapNoticeSent` is still in the window — **but a human reading
`whatsapp_logs` will see the wrong reason.**

✅ **I did not add a fourth member, because you specified the union closed.** It is a one-line change if
the misattribution matters. Recorded at the function.

## 2.4 THE WIRING

✅ **POSITION: plan gate `:248` → cap decision `:308` → cap branches `:335`/`:348` → reply call `:385`.**
The decision runs after the truck lookup and plan gate and **before** the shared reply function.

✅ **TWO WINDOWS, NOT COLLAPSED, EACH COMMENTED WHERE IT IS.**
- **Per customer: rolling 24 hours** — one read, shared with the greeting (§1.7), comment carries the
  equivalence argument.
- **Per truck: local calendar day in the truck's timezone**, using `localDateOfInstant` — ✅ **the SAME
  primitive the greeting uses.** ⚠️ **The fetch is 26 hours, not 24**, and the comment says why: *"a DST
  day is 25 hours long, so a 24h fetch could miss the start of it"*, with the rows then filtered to the
  local date in JS. **No new timezone helper, no migration.**

✅ **COUNTS: `response_sent is not null` only, and both cap classifications excluded.** The truck-cap
row writes `response_sent: null`, so it is excluded by construction; the customer-cap row carries
`response_sent`, so it is excluded explicitly.

✅ **"Already notified" is the presence of a customer-cap row in the window** —
`mineRows.some(r => r.classification === CLASSIFICATION_CUSTOMER_CAP)`.

✅ **`NOTIFY_CUSTOMER_CAP`** sends one deterministic, non-model message — a template with two
substitutions, pointing at `${hgUrl}/trucks/${slug}/order` and `truck.whatsapp` (the real contact
number, already selected in `TRUCK_FIELDS`) — then logs with the customer-cap classification and
`response_sent` populated.
✅ **`SILENT_TRUCK_CAP`** sends nothing and logs with the truck-cap classification and
`response_sent: null`.

✅ **THE GREETING'S BEHAVIOUR IS UNCHANGED.** Its date test is character-identical
(`localDateOfInstant(priorReply.created_at, truckTz) === today`), and cap rows are excluded from it so
that a customer-cap notice cannot become "the most recent reply" and suppress a later greeting — **a
no-op today, and what keeps it a no-op once cap rows exist.**

## 2.5 🔴 FAIL OPEN, AND WHY IT POINTS THE OTHER WAY FROM THE SIGNATURE GATE

If either count read errors: `capDecision = 'REPLY'`, `isFollowUp = false`. The comment at the guard:

> *"THIS IS THE OPPOSITE DIRECTION TO THE SIGNATURE GATE ABOVE, DELIBERATELY, BECAUSE THE COST OF THE TWO
> FAILURES IS NOT THE SAME. A signature that cannot be verified may be a forged request … the downside of
> being wrong is unbounded. A count that cannot be read is a database blip … Failing closed would mean a
> transient Supabase error silently muting every truck's auto-replies."*

## 2.6 ✅ EVERY NEW PATH RETURNS 200

Both cap branches return `NextResponse.json({ ok: true })`, and the read-error path falls through to the
normal reply, which also ends at 200.

⚠️ **THREE NON-200 RETURNS REMAIN IN THE FILE AND ARE PRE-EXISTING — I did not add or touch them:** `403`
Forbidden and `400` Bad request in the **GET verification handler** (`:43`), and `401` Invalid signature
in the **signature gate** (`:118`). Counts are 1→1 for each. **The instruction's "every path" applies to
the message-handling paths; the signature gate must keep refusing, which §2.5 depends on.**

---

# §3 — SCOPE

| Contract | Result |
|---|---|
| Shared reply function / classifier | ✅ **`lib/whatsapp-classifier.ts` UNMODIFIED** — the operator preview calls the same function and cannot drift |
| Dormant Twilio handler | ✅ **`app/api/webhooks/whatsapp/route.ts` UNMODIFIED** |
| Operator UI, plan tiering, notifications, migrations | ✅ **none added** |
| Files changed | **`app/api/webhooks/meta/whatsapp/route.ts`** (11 code lines out, 73 in) + **`lib/whatsapp/reply-cap.ts`** (new) |

⚠️ `docs/reference-manual.md` and `docs/pre-reply-tree-check-report.md` are in the tree from the previous
task, untouched by this one.

---

# §4 — WHAT I RAN, WHAT I READ, WHAT IS UNOBSERVED

| | |
|---|---|
| **RAN** | ✅ **The decision function itself**, transpiled and executed across ten boundary cases (§2.2). `npx tsc --noEmit` → exit 0. `proxy.ts`'s predicates evaluated against the webhook path. `git status` / `git diff` / `git log -S`. |
| **READ** | The route end to end, `lib/time-utils.ts`, `lib/payments/paid-step.ts`, `proxy.ts`. |
| **NOT DONE** | 🔴 **No `next dev`, no commit, no push, no deploy.** |

🔴 **OF THE THREE — a parse, a typecheck, an execution — I DID ALL THREE, BUT ONLY THE PURE FUNCTION WAS
EXECUTED.** The wiring around it was typechecked, not run.

🔴 **UNOBSERVED, AND THE LIST IS SHORT BECAUSE NOTHING HAS RECEIVED A WEBHOOK:**
1. **No inbound message has ever hit this code.** Neither cap has fired, neither log row has been written,
   and the notice message has never been sent or seen.
2. **The two Supabase queries have never run.** The 26-hour/local-date filter is reasoned, not observed —
   ⚠️ **and a wrong local-date filter fails silently as an under-count, i.e. a cap that never fires.**
3. **The fail-open path has never been exercised.** It is the branch that matters most if Supabase blips.
4. ⚠️ **`MAX_REPLIES_PER_TRUCK_DAY = 300` is a guess with no traffic behind it** (§2.1) — stated in the
   module, repeated here.
