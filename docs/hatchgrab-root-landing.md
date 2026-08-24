# hatchgrab.com's root serves the landing — hostname-scoped

**PROMPT INTEGRITY.** No span of the brief arrived garbled. No instruction contradicted another.

🔴 **NOT DEPLOYED. NOTHING WAS PUSHED.** No `next dev`, no `next build`.

**THREE FILES: `middleware.ts` (new, 66 lines), `app/landing/layout.tsx` (+18 / -15),
`app/landing/page.tsx` (+15 / -4).** Nothing else was touched — proven in §4.

🔴 **SUPERSEDED 20 August 2026 — THE `middleware.ts` HALF OF THIS WAS WRONG AND BROKE THE BUILD.** Next
16 refuses to build with both a middleware file and a proxy file present. **The rewrite and the
`/landing` redirect now live in `proxy.ts`, with an added `pathname === '/'` guard**, and
`middleware.ts` is deleted. See §3.g.

---

# 1. PHASE 1 — READ

## 1.1 The root route and its metadata

**`app/page.tsx` — 389 lines, `'use client'`.** Its first lines:

```tsx
'use client';

import { useState, useRef, Suspense, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
...
import EventListCard from '@/components/EventListCard';
import Footer from '@/components/Footer';
import { useVillageData } from '@/hooks/useVillageData';
...
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false, ... });

function VillageFoodieContent() {
```

**What it renders:** the Village Foodie discovery map — a list/map toggle, postcode search, cuisine and
distance filters, `EventListCard`s and a Leaflet `MapView`. **What it fetches:** `useVillageData` →
`GET /api/discovery/events`. **READ.**

🔴 **IT HAS NO METADATA OF ITS OWN.** `grep` for `export const metadata|generateMetadata` in
`app/page.tsx` → **nothing**; a `'use client'` module cannot export it. **The root's metadata comes
entirely from `app/layout.tsx`'s `generateMetadata`** — quoted in §1.2, because it is already
host-aware.

## 1.2 🔴 HOW THE CODEBASE DISTINGUISHES THE TWO HOSTNAMES TODAY

**Stated plainly, because the brief says it decides the approach:**

🔴 **NOTHING DISTINGUISHES THEM AT THE ROUTING LAYER. BOTH DOMAINS RENDER IDENTICAL ROUTES.** There is
no middleware, no rewrite, no redirect and no per-domain config anywhere in this repository.

**Searched:** `find` for `middleware*` over the source tree; `rewrites|redirects|headers` in
`next.config.ts`; the parsed key list of `vercel.json`; `headers().get('host')` across `app` and `lib`.

| Where | What it does | Scope |
|---|---|---|
| **`app/layout.tsx:17-27`** | `generateMetadata` reads `(await headers()).get('host')`, sets `isHG = host.includes('hatchgrab')`, and branches **`siteName`, `description` and `metadataBase`** between HatchGrab and Village Foodie | 🔴 **METADATA ONLY — never which page renders** |
| **`lib/brand.ts:60`** | `export function isHatchGrabHost(host: string) { return host.includes('hatchgrab') }` | one consumer: `app/api/discovery/events/route.ts:74`, choosing `show_on_hg` vs `show_on_vf` — 🔴 **DATA ONLY** |
| **`lib/domain.ts`** | `isHatchGrab()` / `isVillageFoodie()`, both `window.location.hostname`-based | client-side affordances (order CTAs). **Returns `false` during SSR and on the first client frame** |
| **`middleware.ts`** | 🔴 **did not exist** | — |
| **`next.config.ts`** | `serverExternalPackages` + `images` only. **No `rewrites`, no `redirects`, no `headers`** | — |
| **`vercel.json`** | parsed top-level keys: `['functions', 'headers', 'crons']`. **`rewrites`, `redirects`, `domains`, `routes` all ABSENT** | — |

✅ **SO HOST AWARENESS EXISTS AT THE METADATA AND DATA LAYERS AND NOWHERE ELSE.** The same
`app/page.tsx` is served to both domains. That is exactly why the branch can be added outside the page.

## 1.3 The landing page and its gate

**`app/landing/layout.tsx`, as it was, in full:**

```tsx
import { redirect } from 'next/navigation'
import { verifyAdmin } from '@/lib/auth/admin'

export const dynamic = 'force-dynamic'

export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) {
    redirect('/')
  }
  return <>{children}</>
}
```

**`app/landing/page.tsx`, the header and the metadata, as they were:**

```tsx
// HatchGrab landing page — HIDDEN preview route at /landing (noindex/nofollow).
// Root `/` is the live site, so this sits at a hidden path until it's ready to promote.
...
export const metadata: Metadata = {
  title: 'HatchGrab — The ordering system built for food trucks',
  robots: { index: false, follow: false },
}
```

524 lines, a server component, wrapping everything in `.hg-landing` with `./landing.css`, `next/font`
faces, `HatchGrabWordmark`, and the pricing tables rendered from `lib/plan-features.ts`. **READ.**

## 1.4 🔴 EVERY INTERNAL LINK TO `/`, BY BRAND

`grep -rn 'href="/"' app components` — **comments excluded, these are the live links:**

| File | Surface | Brand | What `/` means there |
|---|---|---|---|
| `app/venues/[slug]/VenueClient.tsx` ×2 | venue page — logo + "back" CTA | **Village Foodie consumer** | the map |
| `app/trucks/page.tsx` ×2 | truck listing — logo + link | **Village Foodie consumer** | the map |
| `app/trucks/[slug]/TruckClient.tsx` | truck profile — logo | **Village Foodie consumer** | the map |
| `app/trucks/[slug]/order/page.tsx` | 🔴 **customer ORDERING page** — logo | **Village Foodie consumer** | the map |
| `app/hire/page.tsx` ×2 | hire page — logo + link | **Village Foodie consumer** | the map |
| `app/contact/page.tsx` ×2 | contact — logo + "Back" | **Village Foodie consumer** | the map |
| `app/dashboard/[token]/page.tsx` | operator dashboard — a "← {brand}" link | 🔴 **HatchGrab operator** | see below |
| `components/shared/AppHeader.tsx` | 🔴 **EVERY operator header** — dashboard, manage, admin | 🔴 **HatchGrab operator** | see below |

✅ **EVERY VILLAGE FOODIE LINK KEEPS MEANING THE MAP.** All eight sit on consumer pages that are reached
on villagefoodie.co.uk, and on that host `/` is untouched.

⚠️ **BUT THE TWO OPERATOR LINKS CHANGE MEANING ON hatchgrab.com, AND THAT IS THE ONE CONSEQUENCE WORTH
YOUR ATTENTION.** Both files already carry a comment complaining about exactly this. `AppHeader.tsx:74`
and `app/dashboard/[token]/page.tsx` both say, in as many words, that `href="/"` is *"the Village
Foodie DISCOVERY MAP (app/page.tsx), not a HatchGrab page"*, and the contact page's version spells out
the harm: *"a different product, with no back button to return from once a WebView lands there."*

🔴 **AFTER THIS CHANGE, AN OPERATOR ON hatchgrab.com WHO TAPS THAT WORDMARK GETS THE HATCHGRAB LANDING
INSTEAD OF THE MAP.** I did not edit those files and their markup is byte-identical — **what changed is
what `/` resolves to on that host.** Read against those three comments this is the outcome they wanted,
but it IS a behaviour change on an operator surface and it is your call, not mine, so it is flagged
rather than buried. ⚠️ **In the native app it changes nothing**: `BrandHomeLink` with `kind="branding"`
renders a non-navigating span there.

## 1.5 Vercel config — domains, redirects, rewrites

```json
  "headers": [
    { "source": "/api/(.*)",    "headers": [ X-Robots-Tag: "noindex, noarchive, nosnippet",
                                             X-Content-Type-Options: "nosniff" ] },
    { "source": "/trucks/(.*)", "headers": [ X-Robots-Tag: "noindex, noarchive" ] }
  ],
```

Plus `functions` (one memory/duration override) and `crons` (five jobs). **No `domains`, no `redirects`,
no `rewrites`, no `routes`.** ⚠️ **CANNOT DETERMINE which domains point at this deployment** — that is
the Vercel project's Domains tab, not the repo. The whole design assumes both do; `lib/brand.ts`
declaring both and `isHatchGrabHost` existing are strong evidence, but not proof.

---

# 2. PHASE 2 — STOP CONDITIONS

| Condition | Result |
|---|---|
| **Cannot be scoped to hatchgrab.com without affecting villagefoodie.co.uk** | ✅ **It can.** The branch is a single `host.includes('hatchgrab')` test; every other host falls through to `NextResponse.next()`. §4 proves the map's files are untouched. ⚠️ **One residual cost to Village Foodie is stated honestly in §3.f** — it is latency, not behaviour |
| **No middleware exists and adding one would affect every route on both domains** | ✅ **Does not fire — but the blast radius is described anyway (§3.f).** `config.matcher` is `['/', '/landing']`. **Middleware is not invoked for any other path**, on either domain. Simulated over 14 host/path combinations in §4 |
| **Instructions contradict** | ✅ No. ⚠️ One tension resolved rather than stopped on: Phase 3c says remove the gate, Phase 2 says do not affect Village Foodie — and removing the gate alone would have made villagefoodie.co.uk/landing a **public HatchGrab page**. §3.d closes that |
| **Garbled prompt** | ✅ No |

---

# 3. PHASE 3 — THE CHANGE

## 3.a + 3.b The root, per host — `middleware.ts` (new)

```ts
export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? ''
  const { pathname } = req.nextUrl

  if (pathname === '/landing') {
    return NextResponse.redirect(new URL('/', req.url), 308)
  }

  if (isHatchGrab(host)) {
    return NextResponse.rewrite(new URL('/landing', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/landing'],
}
```

🔴 **A REWRITE, NOT A REDIRECT, FOR THE ROOT.** The URL stays `https://www.hatchgrab.com/` — the string
submitted to Apple as the Marketing URL — while the landing renders beneath it. A redirect would put
`/landing` in the address bar of the page Apple was given.

🔴 **AND EVERY OTHER HOST FALLS THROUGH TO `NextResponse.next()`.** villagefoodie.co.uk's `/` renders
`app/page.tsx` exactly as before.

⚠️ **NO REDIRECT LOOP, AND THIS IS THE ONE THING I CANNOT PROVE HERE.** `/landing` → 308 → `/` →
rewrite → `/landing` renders. That terminates because Next.js does not re-invoke middleware on a
rewrite target. **INFERRED from documented behaviour, UNVERIFIED** — nothing in this repo can exercise
it, and it is the first thing to check on a preview deployment.

## 3.c The gate and the noindex — removed

**`app/landing/layout.tsx`** is now a documented pass-through. `verifyAdmin`, `redirect` and
`export const dynamic = 'force-dynamic'` are all gone — **verified by stripping comments from the file
and searching the remainder: 0 references.** Its executable body is three lines.

⚠️ **`force-dynamic` WENT WITH THE GATE, AND THAT IS THE PERFORMANCE HALF.** It existed only so the
gate's per-request cookie read would be honoured. With no gate, nothing on the route is per-request, so
it can be statically rendered and edge-cached — which is what a front page should be.

**`app/landing/page.tsx`**: `robots: { index: false, follow: false }` → `{ index: true, follow: true }`,
and the file header no longer describes itself as a hidden preview.

⚠️ **THE FILE IS KEPT RATHER THAN DELETED** so the explanation sits where the gate did.

## 3.d /landing keeps working — and this is what protects Village Foodie

`/landing` 308-redirects to `/` **on both hosts**, and the second half is the point:

🔴 **ON VILLAGE FOODIE THIS REPRODUCES TODAY'S OUTCOME EXACTLY.** The gate redirected every non-admin to
`/` in production. Removing it without this line would have turned villagefoodie.co.uk/landing into a
**public HatchGrab page** — a change to Village Foodie, which is forbidden. With it, a non-admin lands
on `/` → the map, precisely as before.

⚠️ **ONE PERSON IS AFFECTED ON VILLAGE FOODIE: AN ADMIN.** They could previously preview the landing at
villagefoodie.co.uk/landing and now get the map. **The same preview is at hatchgrab.com.** That is the
entire behavioural delta on that domain, and it is stated rather than glossed.

## 3.e Untouched

`/app`, `/support`, every operator surface, every customer ordering page and every Village Foodie route
— **proven by `git diff --stat` returning empty for all of them (§4).**

## 3.f 🔴 PERFORMANCE AND CACHING, AS REQUIRED

**Cost, per request, on the two matched paths:**

| | |
|---|---|
| **Invocations** | Only `/` and `/landing`. **Not** `/app`, `/support`, `/dashboard/*`, `/trucks/*`, `/api/*`, `/kds/*`, `/manage/*` |
| **Work done** | One `headers.get('host')`, one string `.includes`, one `URL` construction. **No `await`, no I/O, no network, no database** — verified by grepping the file for `await`, `fetch(`, `upstash`, `createClient`: the only hits are inside the comment describing the deleted rate limiter |
| **Runtime** | Vercel Edge. Sub-millisecond for work of this shape |
| **Path-scoped?** | ✅ **Yes — `matcher: ['/', '/landing']`.** This is the answer to the brief's question: it can be, and it is |

⚠️ **THE ONE REAL COST TO VILLAGE FOODIE, STATED PLAINLY: its root now passes through an edge
middleware invocation it did not before.** The rendered output is identical and no file of the map's
changed, but a request to villagefoodie.co.uk/ now runs this function before the response is served.
**That is latency, not behaviour** — and it is the honest answer to "must not change at all". If even
that is unacceptable, the alternative is a host check inside `app/page.tsx`, which would force dynamic
rendering on both domains and is strictly worse for Village Foodie.

⚠️ **CACHING.** A middleware on `/` means the edge cannot serve that path without invoking it. The
landing itself becomes statically renderable (no more `force-dynamic`), so the rewrite target is
cacheable. **CANNOT DETERMINE the net effect on real cache-hit rates** — that needs Vercel's analytics
after a deploy.

## 3.g 🔴 CORRECTED 20 August 2026 — THIS REPO NEVER DELETED ITS MIDDLEWARE. IT RENAMED IT.

~~`git log --diff-filter=D -- middleware.ts` → **commit `f4a8ac2`, "vercel fix", 5 June 2026.** The file
it removed was an **Upstash Redis rate limiter**~~ — ⚠️ **`--diff-filter=D` NAMES A RENAME AS A
DELETION, AND THIS WAS A RENAME.** `git show f4a8ac2` settles it in one command: **the same commit
removes `middleware.ts` (−49) and creates `proxy.ts` with the limiter in it** (`+import { ratelimit,
strictRatelimit } from '@/lib/ratelimit'`, +40 lines). Next.js 16 renamed the `middleware.ts`
convention to `proxy.ts`; `f4a8ac2` is that rename. **Nothing was lost. The Upstash rate limiter has
run continuously ever since, alongside the Supabase session refresh, the `/dashboard` and `/manage`
auth guards, the Village Foodie → HatchGrab operator redirect and the native-app UA exemption.** The
limiter this section quotes is the one still running:

```ts
  const { success, remaining } = await limiter.limit(ip)
  ...
export const config = { matcher: ['/api/:path*', '/trucks/:path*'] }
```

🔴 **A NETWORK ROUND-TRIP ON EVERY API CALL THE PRODUCT MAKES — AND IT IS STILL MAKING IT.** ~~⚠️
**WHY IT WAS DELETED IS NOT RECORDED and I could not establish it** — the commit message says only
"vercel fix". **CANNOT DETERMINE.**~~ **There is nothing to establish: it was never deleted.**

🔴 **AND THE REAL HAZARD IS THE OPPOSITE ONE — A SECOND ROUTING FILE.** ⚠️ **Next.js 16 refuses to
build with both `middleware.ts` and `proxy.ts` present** (*"Both middleware file … and proxy file …
are detected. Please use ./proxy.ts only."*). **Adding the new `middleware.ts` this report proposes
would take every deploy offline** — which is exactly what happened on 20 August 2026. The two
behaviours belong in `proxy.ts`.

🔴 **AND A MATCHER IS A GUARD.** `middleware.ts` matched `['/', '/landing']`, so its root rewrite
needed no path test — the matcher *was* the test. `proxy.ts`'s matcher covers nearly everything, so
the same rewrite moved across unguarded **would serve the landing page on every operator route on
hatchgrab.com** — dashboard, manage, KDS, login. **It carries a `pathname === '/'` guard in
`proxy.ts` for this reason. Do not drop it.**

---

# 4. PHASE 4 — VERIFICATION

🔴 **NOTHING HAS BEEN RENDERED OR DEPLOYED.** `tsc` was not run and would not be verification.

## 4.1 What a logged-out visitor sees — simulated from the file as written

The matcher and the host test were **parsed out of `middleware.ts`** and run over 14 host/path pairs:

| URL | Result |
|---|---|
| **`hatchgrab.com/`** | rewrite → the landing renders, **URL stays `/`**. Public, indexable, no gate |
| **`hatchgrab.com/landing`** | 308 → `/` → the landing. The URL keeps working |
| **`hatchgrab.com/support`** | 🔴 **middleware not invoked** — unchanged |
| **`hatchgrab.com/app`** | 🔴 **middleware not invoked** — unchanged. **This is the URL the App Store reviewer loads** |
| **`villagefoodie.co.uk/`** | `next()` → `app/page.tsx`, **the discovery map, unchanged** |
| **`villagefoodie.co.uk/landing`** | 308 → `/` → the map — **what a non-admin already got** |
| `/dashboard/*`, `/trucks/*`, `/api/*` on either host | 🔴 **middleware not invoked** |

## 4.2 🔴 PROVING VILLAGE FOODIE IS UNAFFECTED, AND HOW

Three independent checks, each executed:

1. **`git diff --stat app/page.tsx hooks/useVillageData.ts components/EventListCard.tsx
   components/Footer.tsx components/MapView.tsx` → EMPTY.** Not one file the map renders from was
   touched.
2. **The middleware's own fall-through**: any host without `hatchgrab` in it reaches
   `return NextResponse.next()`. Simulated above.
3. **`git diff --stat app/dashboard app/manage app/kds app/trucks app/app app/support components/shared`
   → EMPTY.** No operator or customer surface changed.

⚠️ **THE ONE THING THIS DOES NOT PROVE** is the latency cost in §3.f, which is real and is not visible
in a diff.

## 4.3 The executable diff and line count

| File | Lines | Status | Diff |
|---|---|---|---|
| `middleware.ts` | **66** | **new, untracked** | — |
| `app/landing/layout.tsx` | 21 (was 18) | modified | **+18 / -15** |
| `app/landing/page.tsx` | 535 (was 524) | modified | **+15 / -4** |

```
 app/landing/layout.tsx | 33 ++++++++++++++++++---------------
 app/landing/page.tsx   | 19 +++++++++++++++----
 2 files changed, 33 insertions(+), 19 deletions(-)
```

## 4.4 🔴 EVERY UNCOMMITTED FILE IN THE WORKING TREE

**This is what would ship in the same deploy. An App Store review is in progress.**

| Status | Lines | Path | Mine? |
|---|---|---|---|
| modified | 21 | `app/landing/layout.tsx` | ✅ this task |
| modified | 535 | `app/landing/page.tsx` | ✅ this task |
| **untracked** | 66 | `middleware.ts` | ✅ this task |
| **untracked** | 128 | `app/support/page.tsx` | ✅ the previous task — the Support URL |
| **untracked** | 401 | `docs/hatchgrab-support-page.md` | ✅ previous task, **docs only, not shipped code** |
| modified | 394 | `ios/App/App.xcodeproj/project.pbxproj` | 🔴 **NOT MINE** |

🔴 **THE Xcode PROJECT FILE IS NOT MINE AND YOU SHOULD LOOK AT IT.** Its diff is line-ending or ordering
churn on four existing entries (`HGBridgeViewController.swift`, the two entitlements, `PrivacyInfo.xcprivacy`)
**plus two genuinely new lines: `INFOPLIST_KEY_CFBundleDisplayName = HatchGrab;` in both build
configurations.** That is a **display-name change to the iOS app**, made outside this session — almost
certainly by Xcode. ⚠️ **It does not affect the web deploy** (Vercel does not build `ios/`), but it will
affect the next TestFlight build.

⚠️ **THE LANDING STILL CONTAINS SCREENSHOT PLACEHOLDERS** — `app/landing/page.tsx` renders three
`.shot` divs labelled *"Screenshot"* with a comment addressed to you: *"DOMINIC: swap each .shot for a
real `<img>` … when screenshots are ready."* 🔴 **That is the stated reason not to deploy, and it is
still true.**

## 4.5 What could not be verified

| | What would settle it |
|---|---|
| That the rewrite/redirect pair does not loop | A preview deployment. **The single most important check** |
| That both domains point at this deployment | Vercel → Domains |
| That middleware behaves on this Vercel project | Same preview deploy — see §3.g |
| Net caching effect | Vercel analytics after a deploy |
| Whether the operator-header change (§1.4) is wanted | 🔴 **Your decision** |

---

# 5. INTEGRITY CENSUS

Each file censused in a **separate pass after** its write, with a byte-level tool and a carrier-aware
per-base variation-selector scanner — **never grep**.

| File | bytes | NUL | other disallowed control | TAB | CR |
|---|---|---|---|---|---|
| `middleware.ts` | 4,748 | **0** | **0** | 0 | 0 |
| `app/landing/layout.tsx` | 1,315 | **0** | **0** | 0 | 0 |
| `app/landing/page.tsx` | 37,394 | **0** | **0** | 0 | 0 |
| `docs/hatchgrab-root-landing.md` | 18,698 | **0** | **0** | 0 | 0 |

## Characters introduced, measured against the pre-change copies

**`app/landing/page.tsx` — no new class:**

```
  classes before=19  after=19  NEW = none
    U+2014 EM DASH                  61 -> 63  (+2)
    U+26A0 WARNING SIGN             14 -> 15  (+1)
    U+FE0F VARIATION SELECTOR-16    14 -> 15  (+1)
    U+1F534 LARGE RED CIRCLE         8 -> 10  (+2)
```

**🔴 `app/landing/layout.tsx` — THREE NEW CLASSES, AND THE CENSUS EXISTS TO SURFACE THIS:**

```
  classes before=1  after=4
  NEW = U+1F534 LARGE RED CIRCLE · U+26A0 WARNING SIGN · U+FE0F VARIATION SELECTOR-16
    U+26A0 WARNING SIGN              0 -> 2  (+2)
    U+FE0F VARIATION SELECTOR-16     0 -> 2  (+2)
    U+1F534 LARGE RED CIRCLE          0 -> 1  (+1)
```

⚠️ **THIS FILE HAD NEVER CARRIED A MARKER GLYPH.** It held one non-ASCII class (the em dash) and now
holds four, because the comment explaining the gate's removal uses the house 🔴 / ⚠️ markers. **It is
deliberate, and it is reported rather than passed over** — the manual's own rule is that a file gaining
a character class it never had is exactly what this census is for. `app/contact/page.tsx` carries the
opposite decision in its own comment (*"Comment kept ASCII-only: this file has never held an em dash or
an emoji marker"*). **If you would rather this file stayed as it was, the fix is to reword the comment
in ASCII; nothing executable depends on it.**

## Carrier-aware check, per base

```
  middleware.ts              U+26A0 bare=0  +VS16=4    FE0F total=4   attached=4   orphan=0
  app/landing/layout.tsx     U+26A0 bare=0  +VS16=2    FE0F total=2   attached=2   orphan=0
  app/landing/page.tsx       U+26A0 bare=0  +VS16=15   FE0F total=15  attached=15  orphan=0
  docs/hatchgrab-root-landing.md
                             U+26A0 bare=0  +VS16=16   FE0F total=16  attached=16  orphan=0
```

**NO BASE IS SPLIT ACROSS BOTH CARRIERS IN ANY FILE.** U+26A0 — the only base present whose default
presentation is text — is paired with U+FE0F on **every** occurrence (4 + 2 + 15 + 16 = 37) and bare on
**none**. Every other emoji-presentation base is bare on every occurrence with no selector attached, and
every U+FE0F is accounted for by an immediately preceding U+26A0, none orphaned and none leading a file.

⚠️ **FIXED-POINT NOTE.** Appending this section changed the report it describes, so its byte and line
figures above are from the pass taken after the body was written. A final pass over the completed file
is reported here in ASCII so it cannot move them again: **NUL = 0, other disallowed control bytes = 0,
tabs = 0, CR = 0**, and the per-base carrier result is unchanged — U+26A0 paired on every occurrence
and bare on none.
