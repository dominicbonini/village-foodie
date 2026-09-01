# Website-embed — Stage 1 build report

**WHICH OF THE THREE I DID: A TYPECHECK AND FIVE EXECUTIONS. No standalone parse — `tsc --noEmit`
subsumes it.** `npx tsc --noEmit` exits 0 across the project, and five harnesses run the **real**
transpiled modules in a `vm` against constructed inputs: the embed page (the gate), the embed API,
`TruckListCard` old-vs-new, `app/providers.tsx`, and the real `proxy()` middleware.

🔴 **NOTHING WAS DEPLOYED. NO MIGRATION WAS RUN.** The migration file is written and unapplied.
Pizzeria Gusto and every other row on that database are untouched — no SQL of any kind was executed.

🔴 **NOTHING HAS BEEN RENDERED IN A BROWSER AND NO IFRAME HAS BEEN LOADED.** Everything below is a
typecheck plus module-level execution. Where that is the limit of what I know, §7 says so.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.** One
instruction pair looked like a conflict and is not — see §1.2.

---

## 0. Everything this task changed

| File | Change |
|---|---|
| `supabase/migrations/20260826_trucks_embed_enabled.sql` | **NEW — written, NOT run** |
| `lib/features.ts` | `'embed_schedule'` added to the `Feature` union and to `MAX_FEATURES` |
| `components/TruckListCard.tsx` | **one** new prop, `assumeHatchGrab`, defaulting `false` |
| `app/api/embed/events/route.ts` | **NEW** — one truck's events, filtered in SQL, edge-cached |
| `app/embed/[slug]/page.tsx` | **NEW** — the route, the gate and the fallback |
| `app/embed/[slug]/EmbedSchedule.tsx` | **NEW** — the client list |
| `lib/ratelimit.ts` | `embedRatelimit` added |
| `proxy.ts` | `isEmbedPublic`, `embedSlug`, and the limiter/key selection |
| `vercel.json` | `X-Robots-Tag: noindex, noarchive` for `/embed/(.*)` |
| `app/providers.tsx` | PostHog init and provider gated off `/embed` |

**Verified unchanged versus HEAD:** `app/trucks/[slug]/TruckClient.tsx` · `lib/plan-features.ts` ·
`lib/domain.ts` · `next.config.ts` · `app/trucks/[slug]/order/page.tsx`.

⚠️ `git status` shows `app/layout.tsx` as modified. **That is not mine** — its mtime is 14:24, hours
before this task began, and it carries the `SessionAlertBanner` mount from an earlier workstream. This
task touched `app/providers.tsx` (21:0x), not the layout.

---

## 1. THE ROUTE

`/embed/[slug]` — `app/embed/[slug]/page.tsx` (server) + `EmbedSchedule.tsx` (client).

### 1.1 Which slug space — the trap that had to be resolved before anything else

🔴 **THERE ARE TWO SLUG SPACES IN THIS CODEBASE AND THEY SHARE A URL SHAPE.**

- `/trucks/[slug]` — the public profile — resolves by **`createSlug(trucks.name)`**
  (`app/api/discovery/events/route.ts:257`, `:344`).
- `/trucks/[slug]/order` and `/api/menu/[truckId]` resolve by the **`trucks.slug` COLUMN**
  (`app/api/menu/[truckId]/route.ts:35`).

They agree only while `trucks.slug === createSlug(trucks.name)`, and `operatorIdentity`
(`lib/provision-truck.ts:302-307`) appends a suffix on collision — which is exactly when they stop.

**`/embed/[slug]` is keyed on the COLUMN**, because the column is authoritative, unique and indexed,
and because the Order button deep-links to `/trucks/<slug>/order`, which resolves in the column's
space. ⚠️ **The one place that needs the other space is the fallback link**, which points at the
profile page — so `page.tsx` calls `createSlug(truck.name)` for that link and only that link.

### 1.2 The instruction pair that looked contradictory and is not

The brief says *"Import the existing event/order-button components as they are"* and *"Do NOT call
`isHatchGrab()` on this route."* `TruckListCard.tsx:133` calls `isHatchGrab()` internally, so those
two read as incompatible — but the brief resolves it itself: *"If those components need a new prop to
work here, add it with a default that preserves every existing call site's behaviour exactly."* That
is what was done. **No stop was warranted.**

### 1.3 The one prop added to `TruckListCard`, and why the short-circuit matters

```tsx
{!hideOrderButton && (forceOrderButton || ((assumeHatchGrab || isHatchGrab()) ? event.orderLinkHg : event.orderLinkVf)) && event.source === 'operator' && (
```

`assumeHatchGrab` defaults `false`, so the expression collapses to the original `isHatchGrab()`. When
it is `true`, `||` short-circuits and **`isHatchGrab()` is never called at all** — which is the
requirement, not a side effect. It selects **which flag is consulted**; `trucks.order_link_hg` must
still be true.

**Call sites verified unchanged — all three, by execution, not by reading:**

| Call site | Props passed | Passes the new prop? |
|---|---|---|
| `app/trucks/[slug]/TruckClient.tsx:301` | `event, slug` | no |
| `app/trucks/[slug]/order/page.tsx:2485` | `event, slug, hideOrderButton, compact, cornerAction` | no |
| `app/trucks/[slug]/order/page.tsx:2510` | `event, slug, forceOrderButton` | no |

The old component (from `git show HEAD`) and the new one were both transpiled and **run over the same
216-case matrix** — 3 call-site prop shapes × 72 input combinations (host × source × status ×
`orderLinkHg` × `orderLinkVf`), comparing the rendered button label, its colour token, and the number
of times `isHatchGrab()` was called:

```
  216 comparisons across the 3 existing call-site prop shapes x 72 input combinations
  behavioural differences: 0   host-read count differences: included above
  PASS — every existing call site is byte-identical in outcome
```

And the embed shape, on both hosts:

```
input                                   host   outcome              isHatchGrab() called?
orderLinkHg true,  status open          VF     Order now / green    NO ✓
orderLinkHg true,  status confirmed     VF     Pre-order / orange   NO ✓
orderLinkHg FALSE (must suppress)       VF     NO BUTTON            NO ✓
source discovery (must suppress)        VF     NO BUTTON            NO ✓
orderLinkHg true,  status open          HG     Order now / green    NO ✓
…
  PASS — the embed shape reads orderLinkHg on BOTH hosts and never calls isHatchGrab()
```

---

## 2. OPT-IN AND GATE

### 2.1 The migration — written, not run

`supabase/migrations/20260826_trucks_embed_enabled.sql`:

```sql
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS embed_enabled boolean NOT NULL DEFAULT false;
```

Additive; the default puts every existing row in the state it is already in. 🔴 **It must be applied
BEFORE this code is deployed** — `page.tsx` names `embed_enabled` in its select, and against a
database without the column PostgREST errors and every truck falls through to the fallback. The
ordering only fails in one direction; applying early is a no-op.

### 2.2 The Feature

`'embed_schedule'`, added to the `Feature` union and to `MAX_FEATURES` in `lib/features.ts`.
`lib/plan-features.ts` is **untouched**, as instructed.

⚠️ **`findPlanParityViolations()` cannot fire on this.** It iterates matrix *rows* and `continue`s
when a row has no `ROW_FEATURE_MAP` entry (`plan-features.ts:384-386`), so a Feature with no matrix
row contributes nothing to iterate.

### 2.3 🔴 WHAT THE TRIAL BEHAVIOUR MEANS FOR THIS GATE — asked for, and it is the important part

`lib/features.ts:123-127`, unchanged by me:

```ts
  if (plan === 'trial') {
    if (!trialExpiresAt) return PLAN_FEATURES.trial.has(feature)          // not started yet
    if (new Date(trialExpiresAt) <= new Date()) return false              // expired — UNCHANGED
    return PLAN_FEATURES.trial.has(feature)                               // running
  }
```

`TRIAL_FEATURES` is `[...MAX_FEATURES]`, and self-serve signup writes `trial_expires_at: null`
(`lib/provision-truck.ts:415`).

**So: every self-serve truck passes the plan half of this gate on the day it signs up.** The plan
check denies `starter` and `pro`, and denies an expired trial — real cases, all proven below — but it
is **not** what stands between a random truck and a public embed.

🔴 **`trucks.embed_enabled`, NOT NULL DEFAULT false, is the condition that actually bites**, and it is
the reason the column exists rather than the plan check being used alone. This is written into the
migration's header, the route's header and the `features.ts` comment, so the next reader cannot
mistake the plan gate for the protection.

### 2.4 The gate, made to bite — 12 constructed cases, executed

The **real** server component, transpiled and run, with the **real** `canAccess` and the **real**
`createSlug` loaded as modules rather than stubbed:

```
case                                                      expected    got         verdict
ALLOW  max plan, embed_enabled true                       SCHEDULE    SCHEDULE    PASS
DENY   embed_enabled FALSE (plan is max)                  FALLBACK    FALLBACK    PASS
DENY   plan STARTER (embed_enabled true)                  FALLBACK    FALLBACK    PASS
DENY   plan PRO (embed_enabled true)                      FALLBACK    FALLBACK    PASS
DENY   both false                                         FALLBACK    FALLBACK    PASS
DENY   truck INACTIVE                                     FALLBACK    FALLBACK    PASS
ALLOW  trial, expiry NULL  (the documented consequence)   SCHEDULE    SCHEDULE    PASS
DENY   trial EXPIRED                                      FALLBACK    FALLBACK    PASS
ALLOW  trial RUNNING                                      SCHEDULE    SCHEDULE    PASS
DENY   starter + feature_overrides OFF beats everything   FALLBACK    FALLBACK    PASS
UNKNOWN slug (no row)                                     UNAVAILABLE UNAVAILABLE PASS
ALLOW  logo NULL → name as text, no <img>                 SCHEDULE    SCHEDULE    PASS

  gate: 12/12 pass
```

**Six of the twelve are denials, and the pass condition for each is that the FALLBACK rendered —
not that "nothing changed".** The two the brief named specifically — `embed_enabled false`, and a
non-Max plan — are rows 2 and 3.

The fallback's actual output, captured from the run:

```
    text  : Real Thai Food | View | Real Thai Food | 's schedule | Powered by HatchGrab
    links : ["https://www.hatchgrab.com/trucks/real-thai-food", "https://hatchgrab.com"]
```

Truck name, one link onward, brand line. **No 404, no blank, no apology.**

---

## 3. DATA

`app/api/embed/events/route.ts`. **`/api/discovery/events` is not used and not imported.**

Executed; these are the queries it actually issued:

```
  trucks:       select(id, name, slug, active, embed_enabled, order_link_hg) . eq(slug, real-thai-food)
  truck_events: select(id, event_date, start_time, end_time, venue_name, town, postcode, notes, status)
                . eq(truck_id, t1) . in(status, ["confirmed","open"]) . gte(event_date, 2026-08-26)
                . order(event_date, {"ascending":true}) . order(start_time, {"ascending":true,"nullsFirst":false})
```

**Filtered in SQL — `eq(truck_id)`, `in(status)`, `gte(event_date)` — with no client-side filter
anywhere.** The truck select carries no `dashboard_token` and no pin. Also proven by execution:
`embed_enabled false`, an inactive truck and an unknown slug each return `{ events: [] }` with **200**
and **never query `truck_events` at all**; a missing `slug` returns 400.

**Edge cache:** `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

⚠️ **The cost of those 60 seconds, stated rather than glossed.** `status` flips `'confirmed'` →
`'open'` when the operator presses Start, and that flip is what turns "Pre-order" into "Order now". A
cached response can show "Pre-order" for up to a minute after service opens, and longer while the CDN
serves stale. **The link works either way** — the order page resolves the event itself — so this is a
display lag, not a wrong action. It was chosen over `no-store` because an embed without a cache is a
database read for every visitor to a third party's website.

### The rate-limit tier, and the limit I chose

`embedRatelimit`, prefix `vf_rl_embed`: **600 per minute, sliding window, keyed `(IP, slug)`.**

`isEmbedPublic` covers `/embed`, `/embed/*` **and** `/api/embed/*` — both halves deliberately, because
the page and its fetch are one visitor action.

**Why 600, and why not the other tiers:**

- **Not STRICT (3/min).** That is correct for a bulk-harvest feed and catastrophic for a widget on a
  business's homepage: the fourth visitor behind one shared address in any minute would see a broken
  box on their local pizza place's site. CGNAT and office NAT make "four visitors from one IP" routine.
- **Not GENERAL (60/min).** An embed's traffic is the *operator's* traffic, and it must not be able to
  exhaust a bucket shared with our own discovery pages. Its own prefix means an embed surge cannot
  429 `/trucks/*`.
- **600, in the right units.** ⚠️ **One embed view costs TWO tokens** — the page and the API are both
  in this bucket — so 600 is **300 embed views per minute from one address for one truck.** Sized like
  the events tier: a runaway-loop backstop set far above anything human browsing reaches.
- **Keyed `(IP, slug)`** so one operator's embed cannot exhaust another's budget. Proven: two trucks
  from one IP produced `203.0.113.9:aaa` and `203.0.113.9:bbb`.

⚠️ **Sized pessimistically on the cache.** Whether Vercel's Edge Middleware runs *before* the CDN
lookup — and therefore spends a token even on a cache hit — **was not verified.** 600 assumes it does.
If the CDN short-circuits the middleware the headroom is larger, and nothing needs changing either way.

**The real `proxy()` was executed** — bucket and key for every path, plus the regressions this change
could have caused:

```
/embed/real-thai-food                    embed    203.0.113.9:real-thai-food   PASS
/api/embed/events?slug=real-thai-food    embed    203.0.113.9:real-thai-food   PASS
/api/embed/events                        embed    203.0.113.9:-                PASS
/api/discovery/events                    strict   203.0.113.9                  PASS
/api/events?truck=real-thai-food         events   203.0.113.9:real-thai-food   PASS
/trucks/real-thai-food                   general  203.0.113.9                  PASS
/dashboard/tok                           (none)   (not limited)                PASS
/api/manage                              (none)   (not limited)                PASS
…  11/11 pass

  /api/discovery/events still STRICT and keyed on IP alone : YES ✓
  /api/events still EVENTS and keyed (IP, truck)           : YES ✓
  /trucks/* still GENERAL and keyed on IP alone            : YES ✓
  /embed is NOT redirected or session-gated                : YES ✓ (falls through)
```

---

## 4. HEADERS

`vercel.json` gains one block, mirroring `/trucks/(.*)`:

```json
    {
      "source": "/embed/(.*)",
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, noarchive" }
      ]
    }
```

The file was re-parsed as JSON after the edit. The page also carries `robots: { index: false, follow:
false, nocache: true }` in its `metadata` export — the same instruction in the markup, so the embed
cannot compete with the operator's own page even if the header is ever lost in a config edit.

✅ **No `X-Frame-Options` and no CSP `frame-ancestors` was added anywhere.** A repo-wide grep after the
change returns zero hits. **Framing keeps working.**

---

## 5. POSTHOG

### What I changed

`app/providers.tsx`, two edits:

```tsx
const IS_EMBED_ENTRY =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/embed')

if (typeof window !== 'undefined' && !IS_EMBED_ENTRY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',
  })
}
```

```tsx
  const pathname = usePathname()
  if (pathname?.startsWith('/embed')) return <>{children}</>
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
```

**The init call, its arguments and its module-evaluation timing are untouched.** One condition was
added, and it is true for every path that is not `/embed`.

⚠️ **The provider uses `usePathname()`, not the module constant, and that difference is a hydration
bug avoided.** `IS_EMBED_ENTRY` is derived from `window`, so it is `false` during server render and
`true` on the client — branching the returned tree on it would render `<PostHogProvider>` on the
server and a bare fragment on the client. `usePathname()` returns the same value in both.

### How I determined the four named routes are unaffected

**By execution, not by reading.** The real `providers.tsx` and the **git HEAD** version were both
transpiled and run once per entry path, with `window.location.pathname` set to each:

```
entry pathname                      HEAD init   NEW init   args identical?      provider rendered
/dashboard                          1           1          YES ✓                PostHogProvider
/dashboard/realthaifood-23f8/kds    1           1          YES ✓                PostHogProvider
/manage/realthaifood-23f8           1           1          YES ✓                PostHogProvider
/kds/abc123                         1           1          YES ✓                PostHogProvider
/trucks/real-thai-food              1           1          YES ✓                PostHogProvider
/trucks                             1           1          YES ✓                PostHogProvider
/                                   1           1          YES ✓                PostHogProvider
/login                              1           1          YES ✓                PostHogProvider
/admin                              1           1          YES ✓                PostHogProvider
/app                                1           1          YES ✓                PostHogProvider
/embed/real-thai-food               1           0          must not init        Fragment
/embed                              1           0          must not init        Fragment

  The init call on every non-embed route, verbatim from the run:
    posthog.init("phc_TESTKEY", {"api_host":"https://eu.i.posthog.com","person_profiles":"identified_only"})
  git HEAD, same call:
    posthog.init("phc_TESTKEY", {"api_host":"https://eu.i.posthog.com","person_profiles":"identified_only"})

  SERVER RENDER (no `window`):
    HEAD init calls 0, NEW init calls 0  → both 0 ✓
    NEW server-side wrapper on /embed: Fragment  → matching the client ✓ (no hydration mismatch)
```

**🔴 SOURCE-READ IS NOT BEHAVIOUR-VERIFIED, AND I DID NOT RUN THIS IN A BROWSER.** The above is the
real module executed in a `vm` with a stubbed `window` and a recording `posthog` stub. No page was
loaded, no cookie jar was inspected, and no `document.cookie` was read on any route.

### Two limits, stated rather than glossed

1. ⚠️ **The init guard reads `window.location.pathname` ONCE, at module evaluation** — so it is
   decided by the **entry URL**. A client-side navigation from another route *into* `/embed` would
   arrive with PostHog already initialised. Nothing in the app links to `/embed`, and an iframe always
   performs a fresh document load, so that path does not exist today. **If an in-app link to `/embed`
   is ever added, this guard does not cover it.**
2. ⚠️ **The bundle still loads.** `posthog-js` is a static import, so it is still in the JavaScript the
   embed downloads. What does not happen is `init` — **no cookie, no autocapture, no network call**.
   "No PostHog cookie" is exact; **"loads no PostHog" would not be**, and I am not claiming it.

---

## 6. VERIFICATION

### The chrome inventory — worked BACK from the report, not forward from what I added

The harness asserts against the list in `docs/website-embed-report.md` §2 and §Footer, evaluated over
all twelve gate cases:

```
  text  "Village Foodie"        absent ✓      text  "Add my Business"     absent ✓
  text  "Own this truck"        absent ✓      text  "Report Issue"        absent ✓
  text  "Are we missing an event" absent ✓    text  "Truck Directory"     absent ✓
  text  "Get Weekly Schedule"   absent ✓      text  "Disclaimer"          absent ✓
  text  "Get the Schedule"      absent ✓      text  "Unsubscribe"         absent ✓
  text  "Never miss a slice"    absent ✓      text  "Drop us a message"   absent ✓
  text  "Hire a Food Truck"     absent ✓      text  "Back to Map"         absent ✓
  text  "General Enquiry"       absent ✓      text  "View all trucks"     absent ✓
  link= /contact  /hire  /trucks  /           absent ✓
  link~ tally.so  village-foodie-logo  ?topic= absent ✓
  cmpt  Footer  MapView  Script  TruckListCard absent ✓

  EVERY href/src the route emitted, across all 12 cases:
    https://db.example.co/storage/v1/object/public/truck-media/logos/rtf.png
    https://hatchgrab.com
    https://www.hatchgrab.com/trucks/real-thai-food

  chrome: CLEAN
```

Three URLs, all intended: the truck's own logo, the brand line, the fallback.

⚠️ **THE FIRST RUN OF THIS HARNESS PRODUCED TWO FALSE RESULTS AND I AM RECORDING BOTH**, because a
harness that reports absence it never looked for is worse than none.

1. The jsx stub captured `<PoweredBy />` and `<TruckIdentity />` as elements but **never invoked
   them**, so their bodies never ran and both assertions came back "NO" when the truth was "not
   exercised". Fixed by having the stub call function components.
2. A substring test for `/trucks` flagged the **specified** fallback link
   `https://www.hatchgrab.com/trucks/<slug>` as forbidden chrome. That is the grep-false-failure class
   this project has been bitten by before. Fixed by making the link checks exact-match, and by printing
   every emitted href so the check is auditable rather than a boolean.

### Other confirmations from the same run

- **"Powered by HatchGrab" present on every one of the twelve cases** — including both fallback
  variants and the unknown-slug case.
- **Logo `null` → no `<img>` at all, truck name rendered as text.** Never a broken image.
- **The empty state names the truck and links nowhere** — `EmbedSchedule.tsx` renders "No upcoming
  events listed for {truckName}." with no contact link, deliberately unlike
  `TruckClient.tsx:281-288`, whose equivalent sends the reader to our contact form.

---

## 7. 🔴 TWO THINGS THAT WILL SURPRISE ON FIRST USE — RECORDED, NOT FIXED

Both come from reusing `TruckListCard` unmodified, which the brief required. Fixing either means
editing that component's markup for all three existing call sites — outside this workstream's scope.

1. **The Order/Pre-order button opens IN THE FRAME.** Its href is `/trucks/<slug>/order?event_id=…` —
   relative, so inside an iframe it resolves against our origin and loads **inside the operator's
   widget-sized box**. A full ordering flow in a 400px-tall frame is not what anyone wants. The fix is
   a `target="_blank"` behind another default-off prop; it is a one-line change and it was **not made,
   because it was not asked for.**
2. **The venue name links to `/venues/<slug>`, a full Village Foodie surface.** Same relative-link
   mechanics. So although no VF chrome *renders* in the embed — proven above — one click on a venue
   name navigates the frame to a page that is entirely VF chrome. Not in the report's inventory
   (that inventoried what renders), but it is the same concern one hop away.

---

## 8. What remains unverified

1. **Nothing was rendered.** No browser, no iframe, no screenshot. The gate, the chrome absence and
   the PostHog behaviour are module-level executions with stubbed hosts and stubbed React.
2. **The migration has not been applied**, so `trucks.embed_enabled` does not exist yet. Until it does,
   this route would fall through to the fallback for every truck. **Apply before deploying.**
3. **No `document.cookie` was inspected on any route** — see §5's plain statement.
4. **The Vercel middleware/CDN ordering** behind the rate-limit sizing — §3.
5. **`next build` was not run.** `tsc --noEmit` is clean; that is a typecheck, not a build, and it does
   not exercise route collection, static analysis of `metadata`, or the `usePathname` boundary.
6. **No live data was read.** Every truck row in every harness was constructed.
