# Custom domain — Stage 4, the serving side

**WHICH OF THE THREE I DID: A TYPECHECK AND TWELVE EXECUTIONS. No standalone parse — `tsc --noEmit`
subsumes it.** `npx tsc --noEmit` exits 0. Twelve harnesses run the **real** transpiled modules in a
`vm`, including two new ones for this stage and ten from the embed workstream re-run.

🔴 **Nothing was deployed. No migration was run. No domain was added to Vercel.** Four migration files
now exist and are unapplied; **no SQL of any kind was executed.** Pizzeria Gusto is untouched.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 0. Scope — eleven files, all of them new or named in the brief

| File | Change |
|---|---|
| `supabase/migrations/20260827_trucks_custom_domain.sql` | **NEW — written, NOT run.** Two columns, one UNIQUE. |
| `lib/custom-host.ts` | **NEW** — the host classifier and the allow-list |
| `app/domain/page.tsx` | **NEW** — host → truck, the gate, the fallback, the metadata |
| `components/embed/EmbedParts.tsx` | **NEW** — `Shell`, `TruckIdentity`, `PoweredBy`, moved verbatim |
| `proxy.ts` | default-deny block for custom hosts, returning before everything else |
| `lib/ratelimit.ts` | `customHostRatelimit` |
| `components/TruckListCard.tsx` | one prop, `orderOrigin`, defaulting to today's relative href |
| `app/embed/[slug]/EmbedSchedule.tsx` | threads `orderOrigin` |
| `app/embed/[slug]/page.tsx` | imports the extracted parts instead of defining them |
| `app/providers.tsx` | the analytics guard now keys on host as well as path |
| `app/layout.tsx` | passes the host it already reads down to the provider; now `async` |

**Verified unchanged versus HEAD:** `app/trucks/[slug]/TruckClient.tsx` ·
`app/trucks/[slug]/order/page.tsx` · `lib/plan-features.ts`. `lib/embed-instructions.ts` (22:53),
`app/api/manage/route.ts` (22:38) and `vercel.json` (21:31) all carry yesterday's timestamps.

⚠️ **ONE THING I DID THAT THE BRIEF DID NOT NAME, AND WHY.** `Shell`, `TruckIdentity` and `PoweredBy`
were module-private inside the embed route. Serving the same page on a custom host meant either
importing them or writing a second copy, and §3 of the manual forbids the second. **They were moved
verbatim — every class string, element and comment is the original.** The embed route's render is
asserted unchanged by execution below. If you would rather I had not touched that file, the
alternative was two copies of the page.

---

## 1. HOST → TRUCK

### The migration — written, not run

```sql
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS custom_domain             text,
  ADD COLUMN IF NOT EXISTS custom_domain_verified_at timestamptz;

ALTER TABLE trucks
  ADD CONSTRAINT trucks_custom_domain_key UNIQUE (custom_domain);
```

🔴 **NOT `embed_enabled`, and the header says so at length.** A truck may reasonably want its own
address and no iframe, or the reverse; one flag for both is how a truck gets the one it did not ask
for, **and the damage is asymmetric — an unwanted iframe is invisible, an unwanted public domain is
not.**

⚠️ **`custom_domain_verified_at` is the serving gate, not a record.** A row can carry a hostname the
moment an operator types it; it carries a timestamp only once the domain was confirmed serving. It is
a timestamp rather than a boolean for the `embed_last_seen_at` reason: *since when* is the fact a
support conversation actually needs.

### Resolution, and what a non-match does

`proxy.ts` rewrites `/` on a custom host to `/domain`; `app/domain/page.tsx` reads the host header and
resolves it. 🔴 **The lookup is in the route and not the proxy, deliberately** — `proxy.ts` runs on the
edge on every request and has no database access anywhere in it, a property its own demo-dashboard
comment is explicit about.

**A host with no match does not fall through — it calls `notFound()`.** Proven for four distinct
non-matches:

```
  PASS  no row at all                      → notFound()
  PASS  row exists but NOT verified        → notFound()
  PASS  row exists but truck INACTIVE      → notFound()
  PASS  host header missing                → notFound()
```

🔴 **That is a 404, not `app/page.tsx`, and not the name-and-link fallback either** — the fallback
exists for a truck we *know* whose plan has lapsed; here there is no truck to name. **The
investigation's §6 fall-through to the Village Foodie discovery map is closed.**

---

## 2. 🔴 DEFAULT DENY ON A CUSTOM HOST — the deny bites

Worked back from the app's surfaces. `lib/custom-host.ts` names what that enumeration denied: the
schedule page, the dashboard, `/manage`, `/kds`, `/admin`, `/login` and the password routes, the
ordering flow, the customer order page, the discovery map, `/trucks` and its children, `/venues`,
`/contact`, `/hire`, `/signup`, `/setup`, `/app`, `/landing`, `/privacy`, `/terms`, the
order-cancellation page, the embed routes, **every** API route, and the demo-dashboard exception.
**Two entries survive.**

**47 surfaces constructed on `schedule.realthai.co.uk`, every one refused:**

```
  DENIED  404  /dashboard            DENIED  404  /manage/realthaifood-23f8   DENIED  404  /admin
  DENIED  404  /dashboard/demo-abc123  DENIED  404  /kds/abc123              DENIED  404  /login
  DENIED  404  /trucks               DENIED  404  /trucks/real-thai-food/order DENIED 404  /venues/the-bell
  DENIED  404  /landing              DENIED  404  /embed/real-thai-food       DENIED  404  /order/abc/manage
  DENIED  404  /api/dashboard        DENIED  404  /api/manage                 DENIED  404  /api/orders/submit
  DENIED  404  /api/discovery/events DENIED  404  /api/admin                  DENIED  404  /api/stripe/connect
  …
  47 surfaces that must not serve → ALL REFUSED
```

**The pass condition on every line is refusal.** The two that may serve are asserted separately:

```
  PASS  /                        → rewrite https://schedule.realthai.co.uk/domain
  PASS  /api/embed/events?slug=x → next (passes through)
```

⚠️ **A bare 404 from the edge, not a rewrite to a not-found page** — provably outside every route in
the app, leaking nothing about what exists, costing no render.

⚠️ **Returning here also means no Supabase session refresh runs on an operator's domain**, so no
`sb-…-auth-token` cookie is written for their host. The investigation listed that as undetermined;
this makes it **moot rather than answered** — the code path that would set it no longer runs.

### 🔴 The one exemption, and it is not a convenience

```
  PASS  /.well-known/acme-challenge/… → next
  PASS  …and it is NOT rate limited (0 limiter calls)
```

Vercel's SSL documentation: *"The `/.well-known` path is reserved and cannot be redirected or
rewritten."* Certificates are issued **and renewed** by the HTTP-01 challenge served from that path.
**Deny it and the certificate fails to renew months later, as a browser interstitial on the
operator's own domain.** The proxy's matcher does not exclude `/.well-known`, so without this branch
it would have fallen into the default-deny.

---

## 3. THE ORDER LINK

`components/TruckListCard.tsx`, one prop, following the Stage 1b pattern:

```tsx
href={`${orderOrigin ?? ''}/trucks/${slug}/order?event_id=${event.id}`}
```

`undefined` prefixes nothing, so the existing call sites emit the byte-identical relative href.

```
  1296 cases = 3 pre-existing call-site prop shapes x 432 input combinations
  TREE DIFFERENCES: 0
  isHatchGrab() call-count differences: 0
  PASS — THE DIFF WAS EMPTY across all 1296 cases

  PASS  with orderOrigin → the href is ABSOLUTE to our domain
        https://www.hatchgrab.com/trucks/rtf/order?event_id=e1
  PASS  …so it cannot resolve to the operator's own domain
  PASS  without it → the href is RELATIVE, byte-identical to before
        /trucks/rtf/order?event_id=e1
```

and on the custom-domain route itself:

```
  PASS  EmbedSchedule receives orderOrigin   "https://www.hatchgrab.com"
  PASS  …and it is OUR origin, absolute, no trailing slash
```

🔴 **Why this matters more than tidiness:** left relative, the Order button would resolve to
`schedule.theirtruck.co.uk/trucks/<slug>/order` — putting our ordering flow, and the payment
provider's own frame inside it, on a domain we do not control and whose certificate we do not own.

---

## 4. HOST-DEPENDENT BEHAVIOUR

### (a) Title and metadata

🔴 **`title.absolute`, not `title`.** The root layout's template is `` `%s | ${siteName}` `` with
`siteName` resolving to **"Village Foodie"** on any host without "hatchgrab" — a plain `title` would
render **"Real Thai Food | Village Foodie"** in the tab of a page on the operator's own domain.

```
  PASS  title is ABSOLUTE — escapes the root layout's "%s | Village Foodie" template   {"absolute":"Real Thai Food"}
  PASS  metadataBase is THEIR host, not villagefoodie.co.uk                            https://schedule.realthai.co.uk/
  PASS  description names the truck                          Where Real Thai Food is trading next.
  PASS  openGraph.siteName is the TRUCK, not a brand of ours
  PASS  preview image is THEIR logo
  PASS  favicon is THEIR logo
  PASS  🔴 noindex is KEPT
  PASS  🔴 NO "Village Foodie" anywhere in the metadata
  PASS  🔴 NO villagefoodie.co.uk anywhere in the metadata
  PASS  🔴 NO village-foodie logo anywhere
  PASS  no logo → EMPTY images, not a fallback to ours
  PASS  unknown host → noindex and nothing else
```

The last three assertions scan the whole serialised metadata object rather than named fields, so a
Village Foodie value arriving through a field I did not think to check would still fail.

⚠️ **Where the truck has no uploaded logo the image array is EMPTY rather than falling back** — no
image at all is better than the wrong company's.

### (b) 🔴 PostHog — the same failure through a different door

Both guards keyed on the **path**, which is right for `/embed/<slug>` and useless at `/` on an
operator's domain. The host is now tested too, via an **allow-list** (`lib/custom-host.ts`), and the
provider takes the host as a **prop from the root layout** — a server component that already reads it
— because a `window`-derived value would render one tree on the server and another on the client.

**How I verified analytics still initialise identically on the four named routes:** by running the
**git HEAD** module and the working-tree module side by side, once per entry path, and comparing the
init arguments verbatim.

```
entry pathname                      HEAD init   NEW init   args identical?
/dashboard                          1           1          YES ✓
/dashboard/realthaifood-23f8/kds    1           1          YES ✓
/manage/realthaifood-23f8           1           1          YES ✓
/trucks/real-thai-food              1           1          YES ✓
  posthog.init("phc_TESTKEY", {"api_host":"https://eu.i.posthog.com","person_profiles":"identified_only"})
  git HEAD, same call:
  posthog.init("phc_TESTKEY", {"api_host":"https://eu.i.posthog.com","person_profiles":"identified_only"})
```

and the new guard:

```
  PASS  www.hatchgrab.com/dashboard          init=1 wrapper=PostHogProvider
  PASS  www.villagefoodie.co.uk/trucks/x     init=1 wrapper=PostHogProvider
  PASS  hg-preview.vercel.app/dashboard      init=1 wrapper=PostHogProvider
  PASS  localhost:3000/dashboard             init=1 wrapper=PostHogProvider
  PASS  schedule.realthai.co.uk/             init=0 wrapper=Fragment
  PASS  schedule.realthai.co.uk/dashboard    init=0 wrapper=Fragment
  PASS  theirtruck.co.uk/                    init=0 wrapper=Fragment
```

⚠️ **`*.vercel.app` is kept on the "ours" side on purpose** — dropping previews would silently turn
analytics off and default-deny on, on the surface used to check work.

⚠️ **`app/layout.tsx` had to become `async`** to read `headers()`. That was caught by the typecheck as
`TS1308`, not in a browser — the same class the dashboard hit during the deny-by-default work.

### (c) 🔴 Rate limiting

`customHostRatelimit`: **600 per minute, sliding window, keyed `${ip}:${host}`.**

```
  PASS  /                        bucket=custom-host key=203.0.113.9:schedule.realthai.co.uk
  PASS  /api/embed/events?slug=x bucket=custom-host key=203.0.113.9:schedule.realthai.co.uk
  PASS  two operators, one address → separate keys
```

**Why 600, and why keyed on host.** Every other predicate in `proxy.ts` takes only `pathname`, so a
custom domain at `/` matched none of them and would have been **the only public surface with no
limiter at all** — which is the wrong way round, because it is the surface whose traffic we least
control. ⚠️ **One page view costs two tokens** (the page and its data fetch are both on this host and
both in this bucket), so 600 is **300 views per minute from one address for one operator**. Keyed on
the host because the host *is* the tenant, and it needs no database read to build the key.
Deliberately the same number as the embed tier — same shape, and a different number would be a
distinction without a reason. ⚠️ Sized pessimistically on caching, as the embed tier is: whether Edge
Middleware runs before the CDN lookup was **not verified**.

### (d) Indexing

**`noindex` kept**, asserted above. Not removed, not weakened.

---

## 5. THE PAGE AS A STANDALONE PAGE

Added: **title, description, link-preview image, favicon** — the four the investigation listed as
omissions. 🔴 **Not added: contact details, a map, a menu link, a footer** — those are decisions for
you and are out of scope. **What the page renders is unchanged**, asserted by the embed route's own
harness after the extraction:

```
  gate: 12/12 pass   chrome: CLEAN
```

---

## 6. 🔴 THE APEX GUARD — recorded, not built

There is no provisioning path yet, so there is nothing to guard at entry today. **The later stage
cannot be written without this, so it is recorded here rather than in a comment nobody will open.**

**It must be two guards, not either:**

1. **At entry, before calling Vercel.** The submitted name must have at least one label more than its
   registrable domain. 🔴 **A LABEL COUNT ALONE IS WRONG AND WILL LOOK RIGHT** — `theirtruck.co.uk`
   has three labels and *is* an apex, so a naive `labels > 2` test passes every `.co.uk` apex in the
   country, which is most of this customer base. It needs the **public suffix list**, which this repo
   does not currently depend on. **This is the part most likely to be got wrong, and getting it wrong
   replaces an operator's homepage.**
2. **At resolution, in `app/domain/page.tsx`.** ✅ **This half already exists as of this stage** — a
   host that resolves to no verified, active truck gets `notFound()`, proven above. It holds even when
   someone adds a domain through the Vercel dashboard by hand and bypasses guard 1 entirely.

**Where guard 1 has to live:** in the provisioning action, *before* the `POST /v10/projects/…/domains`
call — not in `proxy.ts` (edge, every request, no data access) and not in the wizard's client code
(a client check is a courtesy, not a control).

⚠️ **And the failure it prevents is not "their site breaks".** Before this stage an apex pointed at us
served the Village Foodie consumer discovery map on the operator's own domain. That specific
fall-through is closed; **guard 1 remains necessary** so an operator never gets that far and never has
their apex attached to our project at all.

---

## 7. Verification summary

**Which of the three: a typecheck and twelve executions.** No standalone parse.

```
  embed-gate PASS   embed-api PASS   posthog PASS   proxy-embed PASS   card-parity-1b PASS
  stamp-throttle PASS   embed-actions PASS   detect PASS   wizard-2b PASS   single-source PASS
  custom-host-deny PASS   domain-route PASS
```

**Existing behaviour on both current hosts, asserted rather than assumed:**

```
  PASS  www.hatchgrab.com/                             → rewrite …/landing        buckets=none
  PASS  www.hatchgrab.com/dashboard/tok                → redirect …/login?next=…  buckets=none
  PASS  www.villagefoodie.co.uk/                       → next                     buckets=none
  PASS  www.villagefoodie.co.uk/trucks/real-thai-food  → next                     buckets=general
  PASS  villagefoodie.co.uk/manage/tok                 → redirect hatchgrab.com   buckets=none
  PASS  localhost:3000/                                → next                     buckets=none
  PASS  hatchgrab-preview.vercel.app/                  → rewrite …/landing        buckets=none
  the custom-host bucket never fires on hatchgrab.com  : YES ✓
```

⚠️ **Three harness defects were found and are recorded rather than smoothed over**, all of them the
harness rather than the code: a walker that never recorded the props of function components (so
`orderOrigin` looked absent when it was present), and two stale stubs that had not been told about
this stage's new imports.

---

## 8. What remains unverified

1. **Nothing was rendered in a browser and no domain exists.** No DNS record was created, no
   certificate was issued, no request has ever arrived on a custom host. Every result is a typecheck
   plus module-level execution against stubbed React, Supabase and Next primitives.
2. **The rewrite's effect on `vercel.json` header rules is still undetermined** — the investigation
   flagged it and this stage did not resolve it. It does not matter for `noindex`, which is in the
   document's metadata, but it would matter for any future header keyed on `/domain`.
3. **Whether `next build` accepts an `async` root layout in this configuration** — `tsc --noEmit` is a
   typecheck, not a build, and no build was run.
4. **Four migrations are unapplied**: the embed flag, the last-seen/referrer pair, the plan answer,
   and now the two custom-domain columns. **Apply all four before deploying**, outside a trading
   truck's service hours with a short `lock_timeout`.
5. **`custom_domain` is written by nothing**, so the serving path is unreachable in production. That
   is the intended state for this stage and the reason it was safe to build routing first.
6. **The `/.well-known` pass-through is reasoned from Vercel's documentation, not observed.** No
   certificate has been issued through this code path.
