# Customer ordering can no longer be rate-limited

**Date:** 11 August 2026
**Result: BUILT. Three files changed. No migration needed, and none written — this is configuration and control flow only.**
**No `next dev`, no `next build`, no commit, no deploy.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

**Files changed** — `git diff --name-only`, excluding the manual from an earlier task:

```
lib/ratelimit.ts
proxy.ts
app/trucks/[slug]/order/page.tsx
```

---

# 🔴 THE RESULT IN ONE TABLE

| Scenario | Before | After |
|---|---|---|
| **The journey that broke** (load · change event · back · reload · reload) | 🔴 **2 of 5 refused** | ✅ **0 refused — 4 of 600, 0.7% of budget** |
| **40 customers, one venue wifi, one truck, one mount each** | 🔴 **37 of 40 refused (93%)** | ✅ **0 refused — 40 of 600, 6.7%** |
| …at three mounts each (120 requests) | 🔴 refused | ✅ **0 refused — 20.0%** |
| **A 429, per attempt cycle** | 🔴 **3 requests** (0 / 1000 / 3000 ms) | ✅ **1 request** |
| **Ten Retry taps while limited** | 🔴 **30 requests** | ✅ **10** |
| **`/api/discovery/*`** | 3/min, IP-keyed, `vf_rl_strict` | ✅ **3/min, IP-keyed, `vf_rl_strict` — byte-identical** |

---

## 1. Separate buckets — and the number

**`lib/ratelimit.ts` — the new tier:**

```ts
export const eventsRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(600, '1 m'),
  analytics: true,
  prefix: 'vf_rl_events',
})
```

**`proxy.ts` — the predicates, split:**

```ts
const isCustomerEvents = (p: string) => p === '/api/events'
const isStrictPublic = (p: string) =>
  p === '/api/discovery' || p.startsWith('/api/discovery/')
```

### 🔴 THE NUMBER IS 600 PER MINUTE, JUSTIFIED AGAINST THE CUSTOMER

**One page mount costs ONE `/api/events` request on the success path.** Sized against journeys, not against a harvester:

| Customer scenario | Requests | Headroom |
|---|---|---|
| The full journey that broke — load, change event, back, two reloads | **5** | **120×** |
| Forty customers on one venue wifi, three mounts each | **120** | **5×** |
| Two hundred customers on one wifi, three mounts each | **600** | ⚠️ **AT THE LINE** |

⚠️ **That last row is the honest edge and is recorded in the source rather than rounded away.** It needs two hundred people on **one** address all loading the **same** truck **three** times inside sixty seconds. **If a venue ever approaches it, raise the number** — do not reach for a cleverer key (§2).

### 🔴 WHY THIS ROUTE WAS THE WRONG THING TO PROTECT AT ALL

`/api/events?truck=<slug>` returns **one** truck's next 50 events. Anyone harvesting the schedule wholesale uses **`/api/discovery/events`**, which returns **every** truck in one call and **stays on STRICT at 3/min**. To harvest via `/api/events` you would need the slug list first — which the discovery feed already hands you. **The marginal scraping value here is close to zero; the cost of refusing is a customer who cannot order.**

⚠️ **SO THE LIMITER'S JOB ON THIS ROUTE CHANGED, AND THE SOURCE SAYS SO.** It is no longer anti-scraping — that job belongs to STRICT. It is a **runaway-loop backstop**: a client bug (a re-firing effect, a retry loop, a held-down Retry button) must not become unbounded origin load. **It is deliberately set far above anything human browsing can reach.** Calling it anti-scraping would be a comment that lies about what it does.

---

## 2. The key — `(IP, truck slug)`

**`proxy.ts`:**

```ts
    const truckParam = isEvents ? (request.nextUrl.searchParams.get('truck') || '-') : null
    const key = truckParam ? `${ip}:${truckParam}` : ip

    const { success, remaining } = await limiter.limit(key)
```

**Proven by execution — cross-truck isolation:**

```
    busy-truck exhausted at 600 from this IP.
    a customer of quiet-truck on the SAME IP -> ALLOWED  (bucket vf_rl_events:81.2.69.142:quiet-truck, count 1)
    a 601st busy-truck request               -> 429      (bucket vf_rl_events:81.2.69.142:busy-truck, count 601)
```

✅ **One truck's customers can no longer exhaust another truck's budget, and the limit now reads as "requests for this truck from this address".**

⚠️ **`?truck=` is the route's own required parameter** — it 400s without one — so it is present on every legitimate call. **A missing value collapses to a shared `'-'` bucket**, which is correct: those requests are malformed, not customer traffic.

### Is there a better key? — asked and answered before building

🔴 **NO, AND THE REASON MATTERS MORE THAN THE ANSWER.** I considered three alternatives and rejected all of them:

| Candidate | Rejected because |
|---|---|
| **A session or account id** | 🔴 **Customers have none.** There is no login on the ordering path — that is the product. |
| **A device id / first-party cookie** | 🔴 **It does not exist, and inventing one would be a TRACKING IDENTIFIER created for the convenience of a rate limiter.** That is a privacy decision smuggled in as an infrastructure one. Refused. |
| **IP + User-Agent** | Trivially spoofed by the only actor it would stop, while **fragmenting legitimate buckets** — two customers on the same phone model share a bucket, one customer on two browsers gets two. Worse in both directions. |

🔴 **THE REAL DEFENCE AGAINST A SHARED ADDRESS IS NOT A BETTER KEY — IT IS A THRESHOLD A SHARED ADDRESS CANNOT REACH.** Adding the truck fixes cross-truck starvation, which is real; it does not and cannot fix "forty phones behind one NAT". **Only §1's number does that**, which is why the number is the load-bearing half of this change.

---

## 3. The client cannot amplify a refusal

**`app/trucks/[slug]/order/page.tsx`, inside `loadEvents`:**

```tsx
          const res = await fetch(`/api/events?truck=${slug}`)
          // ── 🔴 A 429 IS A REFUSAL, NOT A BLIP. IT MUST NOT BE RETRIED. ──────────────────────────
          // The backoff loop below exists for a transient failure — a cold start, a dropped packet —
          // where trying again is likely to work. A 429 is the server saying the budget for this
          // window is already spent, so retrying spends more of a budget it has just told us is empty
          // AND makes the refusal last longer. On 11 August this loop turned one refusal into three,
          // and the Retry button turned each tap into three more: eight 429s in fifty seconds.
          // Stop immediately, surface the card, and let the window refill.
          if (res.status === 429) {
            if (cancelled) return
            setEventsError(true)
            setEventLoading(false)
            return
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
```

⚠️ **`if (cancelled) return` comes first**, matching the discipline of every other exit in the loop — an unmounted effect must not setState.

⚠️ **The transient path is UNTOUCHED.** A 500 still retries at 0 / 1000 / 3000 ms; only a 429 short-circuits.

### The Retry button

**Unchanged in code** — `onClick={() => setReloadKey(k => k + 1)}`, and `reloadKey` is still in the effect's deps. **It did not need changing:** the requirement was *"must not fire three more requests into an empty bucket"*, and with the 429 branch **a tap now costs exactly one request, not three.** A cooldown timer would be extra state for no additional protection, so none was added.

---

## 4. The copy

```diff
-      <p className="text-slate-600 text-sm font-medium">We couldn&apos;t load the menu right now.</p>
-      <p className="text-slate-400 text-xs mt-0.5 mb-3">Please check your connection and tap to retry.</p>
+      <p className="text-slate-600 text-sm font-medium">We couldn&apos;t load this truck&apos;s events.</p>
+      <p className="text-slate-400 text-xs mt-0.5 mb-3">Give it a moment, then tap to try again.</p>
```

| The old copy said | What was true |
|---|---|
| *"…load the menu…"* | 🔴 **`/api/menu` returned 200 throughout and logged `[MENU API] Returning…`.** The **events** fetch failed |
| *"Please check your connection"* | 🔴 **The connection was fine.** The server answered — with a refusal **we** issued |

✅ **The new copy names the right subsystem, blames nobody, and is true for BOTH causes this card can have** — a rate-limit refusal and a genuine network failure — which is why it names neither mechanism. *"Give it a moment"* is honest for a sliding window and harmless for a blip.

⚠️ **`&apos;` entities, matching the line they replaced** — no new apostrophe character was introduced (see the census).

⚠️ **The reasoning is recorded above the card in source**, including that the old sentence *"cost a full audit"* by sending the investigation to `/api/menu` — the route the deploy had just changed.

---

## 5. 🔴 DECIDED — the operator bypass now covers `/api/events`, and still does not cover STRICT

**The expression is textually unchanged; its MEANING changed when the tiers split, so the decision is restated rather than inherited:**

```ts
  const operatorBypass = (hasBearer || hasOperatorSession) && !isStrict
```

**`isStrict` now means `/api/discovery/*` only.** So:

| Tier | Operator exempt? | Why |
|---|---|---|
| **CUSTOMER-EVENTS** (`/api/events`) | ✅ **YES — a change, and deliberate** | 🔴 **The operator who tripped this at 14:53 was loading their own customer order page to check a deploy, carrying a Supabase session cookie the whole time, and was limited exactly like a scraper.** An operator inspecting their own storefront is the most legitimate traffic this route receives. |
| **GENERAL** (`/trucks/*`) | ✅ YES — unchanged | |
| 🔴 **STRICT** (`/api/discovery/*`) | 🔴 **NO — unchanged, deliberately** | A forged or stolen credential must not unlock the bulk feed, and **an operator has no reason to call `/api/discovery/*` at all.** |

⚠️ **This is a widening of a bypass and is named as such.** The cost if a credential leaks: 600/min per (IP, truck) on a route that returns one truck's public schedule. **The benefit: an operator can never be locked out of their own ordering page.** Under the governing principle that is the right way round.

---

## 6. The 429 now logs

```ts
      console.warn(`[ratelimit] REFUSED limiter=${limiterName} key=${key} path=${pathname} — returning 429`)
```

**Names all three: limiter, key, path.** Example line:

```
[ratelimit] REFUSED limiter=events key=81.2.69.142:test-kitchen path=/api/events — returning 429
```

🔴 **CORRECTION TO THE BRIEF'S EXPECTATION, AND IT MATTERS FOR WHERE YOU LOOK.** You asked for it to be greppable *"in the function logs rather than only visible in the edge request log"*. **It cannot be in a function log: the refusal happens in EDGE MIDDLEWARE and the serverless function never runs.** The line lands in the **middleware/edge log stream**. ⚠️ **What this change buys is real but narrower than asked**: the refusal now has **greppable text naming the limiter and key**, instead of a bare status code with no attribution. Search the edge/middleware logs for `[ratelimit] REFUSED`.

⚠️ **The key contains an IP, which is personal data.** Logged because attributing a refusal is impossible without it, and Vercel already records the client IP on every request line. Noted in the source.

⚠️ **One incidental correction:** `Retry-After` was `isStrict ? '300' : '60'` — advertising **five minutes for a one-minute window**. Now `'60'` for every tier, which is true. Nothing reads it today.

---

## VERIFICATION — actual numbers

A read-only script modelled the buckets with the predicates and thresholds **copied verbatim from source and printed at the top of the run for comparison**. ⚠️ **No network, no database, no writes** — it counts requests against the geometry. **The script is deleted.**

```
THE GEOMETRY UNDER TEST
  isCustomerEvents = p === '/api/events'
  isStrictPublic   = p === '/api/discovery' || p.startsWith('/api/discovery/')
  events   limit=600 window=1 m prefix=vf_rl_events
  strict   limit=3 window=1 m prefix=vf_rl_strict
  general  limit=60 window=1 m prefix=vf_rl
```

### (a) The customer journey

```
  load /trucks/test-kitchen/order              /api/events            tier=events  count=1/600  ALLOWED
  tap "Change event" -> /trucks/test-kitchen   /api/discovery/events  tier=strict  count=1/3    ALLOWED
  back to the order page                       /api/events            tier=events  count=2/600  ALLOWED
  reload #1                                    /api/events            tier=events  count=3/600  ALLOWED
  reload #2                                    /api/events            tier=events  count=4/600  ALLOWED
  --> /api/events requests = 4 of 600 (0.7% of budget)
  --> /api/discovery requests = 1 of 3
  --> REFUSALS: 0
  BEFORE THIS CHANGE: all 4 /api/events calls plus the 1 discovery call shared ONE bucket of 3
                      -> requests 4 and 5 were 429. That is the reported failure.
```

✅ **The exact sequence you named now costs 4 of 600 and stays under the limit with 120× to spare.**

### (b) 🔴 THE VENUE WIFI CASE

```
  40 customers x 1 page mount(s) =  40 requests -> refused 0  (40/600 =  6.7% of budget)
  40 customers x 2 page mount(s) =  80 requests -> refused 0  (80/600 = 13.3% of budget)
  40 customers x 3 page mount(s) = 120 requests -> refused 0  (120/600 = 20.0% of budget)
  40 customers x 5 page mount(s) = 200 requests -> refused 0  (200/600 = 33.3% of budget)
  --> PLAINLY: NONE of the forty is refused, at any of these rates.

  UNDER THE OLD GEOMETRY (3/min, keyed on IP alone):
    40 customers x 1 mount = 40 requests into a bucket of 3 -> 37 REFUSED (93% of customers)
```

🔴 **PLAINLY: NOT ONE OF THE FORTY IS REFUSED — even at five page mounts each.** Under the old geometry **thirty-seven of forty were refused on a single load apiece.**

### (c) The 429 no longer feeds the loop

```
  429 on the first attempt                   requests=1 at t=0ms                    -> stopped on 429 -> eventsError
  500 then 500 then 500 (a real transient)   requests=3 at t=0ms, 1000ms, 3000ms    -> exhausted -> eventsError
  500 then 200                               requests=2 at t=0ms, 1000ms            -> success
  500 then 429                               requests=2 at t=0ms, 1000ms            -> stopped on 429 -> eventsError

  BEFORE: a 429 fell through `if (!res.ok) throw` into the backoff loop -> 3 requests at 0/1000/3000ms.
  AFTER : a 429 returns immediately -> 1 request.  Reduction: 3 -> 1 per attempt cycle.

  THE RETRY BUTTON:
     1 tap(s) while rate-limited: BEFORE  3 requests -> AFTER  1
     3 tap(s) while rate-limited: BEFORE  9 requests -> AFTER  3
    10 tap(s) while rate-limited: BEFORE 30 requests -> AFTER 10
```

✅ **A 429 costs one request. Ten frustrated taps cost ten, not thirty. And the transient path is untouched** — the `500, 500, 500` row still retries at 0/1000/3000 ms, and `500 then 200` still recovers.

### (d) `/api/discovery/*` is unchanged

```
  tier=strict  limit=3  window=1 m  prefix=vf_rl_strict  keyed on: IP alone
  /api/discovery           -> tier=strict  key=81.2.69.142   (no truck in the key, exactly as before)
  /api/discovery/events    -> tier=strict  key=81.2.69.142
  /api/discovery/venues    -> tier=strict  key=81.2.69.142
  request 1 -> ALLOWED (1/3) · 2 -> ALLOWED (2/3) · 3 -> ALLOWED (3/3) · 4 -> 429 · 5 -> 429
  --> 4th and 5th refused, exactly as before. Threshold, window, key and bucket all unchanged.

  AND /api/events NO LONGER TOUCHES THAT BUCKET:
    100 /api/events requests from this IP, then one /api/discovery/events -> ALLOWED (1/3)
    buckets touched: vf_rl_events:203.0.113.7:test-kitchen  |  vf_rl_strict:203.0.113.7
```

✅ **Same limiter, same threshold, same window, same key, same bucket. And the separation is proven: 100 events requests leave the discovery budget untouched at 0 of 3.**

### Routes deliberately not limited — unchanged

```
  /api/menu/test-kitchen     -> NOT LIMITED
  /api/slots/test-truck      -> NOT LIMITED
  /api/events/manage         -> NOT LIMITED
  /api/events/action         -> NOT LIMITED
  /api/orders/submit         -> NOT LIMITED
```

### tsc / lint — a gate, not verification

```
$ npx tsc --noEmit -p tsconfig.json   → clean
$ eslint messages on lines I wrote    → 0   (lib/ratelimit.ts 0 total · proxy.ts 1 pre-existing, 0 mine · page.tsx 38 pre-existing, 0 mine)
```

---

## NON-ASCII CENSUS

| File | Before | After | Δ | Per-character |
|---|---|---|---|---|
| `lib/ratelimit.ts` | **D=7 T=75** | **D=7 T=360** | **+285** | `—`+11, `→`+3, `─`+267, `⚠`+2, U+FE0F+2 |
| `proxy.ts` | **D=8 T=184** | **D=8 T=300** | **+116** | `—`+11, `─`+87, `⚠`+9, U+FE0F+9 |
| `app/trucks/[slug]/order/page.tsx` | **D=39 T=1432** | **D=39 T=1505** | **+73** | `—`+5, `─`+66, `🔴`+2 |

```
DISTINCT: 7 → 7 · 8 → 8 · 39 → 39
characters that DROPPED           : 0
NEW character classes introduced  : 0
```

### 🔴 ONE VIOLATION, CAUGHT BY THE CENSUS AND CORRECTED

**My first draft of `lib/ratelimit.ts` used `•` (U+2022) for the three sizing bullets, taking that file from DISTINCT 7 to 8.** `proxy.ts` already contains `•`; **`lib/ratelimit.ts` did not.** The census caught it, and the three bullets were changed to plain ASCII `-`, returning DISTINCT to 7. **Reported rather than quietly fixed** — the check earned its place.

✅ **Every `⚠` delta matches its U+FE0F delta exactly** (+2/+2, +9/+9) — the ratio that catches a half-pasted emoji.
✅ **No `✅` (U+2705) was added to any of the three** — none of them contained it.
✅ **The new copy uses `&apos;` entities**, so U+2019 stayed at 7 in the order page.
✅ **Garble scan:** zero U+FFFD; no `Â` / `â€` / `Ã©` / `ðŸ` mojibake.

---

## WHAT WAS NOT TOUCHED — verified, not asserted

| Instruction | Result |
|---|---|
| **Do not remove or disable rate limiting anywhere** | ✅ **Nothing removed.** One tier added, one re-scoped, one untouched. Every previously-limited path is still limited. |
| **Do not change demo / signup / signup-email limiters** | ✅ **Unchanged** — all three still present and byte-identical in `lib/ratelimit.ts` |
| **Do not change `/api/menu`** | ✅ **Unchanged**, and still not rate-limited at all |
| **Do not change anything else** | ✅ `git diff --name-only` returns the three files plus `docs/reference-manual.md` from an earlier task in this session |

⚠️ **`docs/reference-manual.md` appears in `git diff` from the earlier V11.9 update, not from this task.**

---

## Two things to be aware of

⚠️ **§28 of the manual is now wrong in a new way as well as the old.** It already recorded STRICT as 60/min (it was 3) and claimed `/api/menu` was limited (it is not). It now also predates the events tier entirely. **This change did not touch the manual** — flagging it so §28 is not read as current.

⚠️ **The 600 is a judgement, not a measurement.** It was sized against the journeys in §1 and the venue case in (b), both of which it clears comfortably — but nobody has yet observed a real venue's request rate. **`X-RateLimit-Remaining` is set on every allowed response**, so the actual headroom at a busy event is observable without instrumentation. If it is ever seen to approach zero, raise the number.
