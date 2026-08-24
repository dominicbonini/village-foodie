# Website embed — what exists, and what would block an iframe

**READ ONLY. Nothing was changed except this file.** No design is proposed anywhere below, no snippet
is written, and no `next dev` / `next build` was run.

**PROMPT INTEGRITY.** No span of the brief arrived garbled. No instruction contradicted another, so
there was nothing to stop and ask about.

**WHICH SURFACE I READ.** The brief warns the operator and customer surfaces are near-duplicates. This
report is about the **CUSTOMER / PUBLIC** side throughout: `app/trucks/[slug]/page.tsx` +
`TruckClient.tsx`, `app/trucks/[slug]/order/page.tsx`, `components/EventListCard.tsx`,
`components/Footer.tsx`, `app/layout.tsx`, `app/providers.tsx`, and the public APIs `/api/events`,
`/api/discovery/events` and `/api/menu/[truckId]`. **I did not read the dashboard or KDS event
rendering**, and nothing here is a claim about them.

---

# 🔴 THE HEADLINE

**Nothing blocks an iframe today. There is no `X-Frame-Options` header and no CSP `frame-ancestors`
directive anywhere in this repository** — not globally, not per-route, not in `next.config.ts`, not in
`vercel.json`, and not in middleware, **because there is no middleware at all any more**.

That answers question 1 in the direction that means the least work, and it is the only question here
with a hard blocker in it. Everything else below is shape, not obstruction — with two facts that carry
real consequences: **PostHog analytics initialises unconditionally on every page from the root layout,
and there is no cookie banner**; and **the closest existing surface's chrome is inline JSX in one client
component, not a shared layout**.

---

# 1. 🔴 FRAME BLOCKING — THE FIRST BLOCKER

## 1.1 Every place a security header could be set, and what each does

**PATHS SEARCHED:** `app/`, `lib/`, `components/`, `next.config.ts`, `vercel.json`, and a whole-tree
`find` for middleware. `node_modules/`, `.next/` and `.git/` excluded throughout.

| Location | Exists? | Sets a frame header? |
|---|---|---|
| `next.config.ts` | yes, 19 lines | 🔴 **NO — it has no `headers()` function at all** |
| `vercel.json` | yes, `headers` block present | 🔴 **NO — two rules, neither about framing** |
| `middleware.ts` | 🔴 **DOES NOT EXIST** | n/a |
| Route handlers | many set `Content-Type` / `Cache-Control` / `Retry-After` | 🔴 **NO** |
| `_headers` / `netlify.toml` / `.htaccess` | 🔴 **none exist** | n/a |
| A header helper module | 🔴 **none exists** | n/a |

### `next.config.ts` — quoted in full (19 lines)

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sparticuz/chromium ships the Chromium binary as files that must NOT be bundled/tree-shaken by
  // the server build — keep it (and puppeteer-core, which spawns that binary) external so the binary
  // is present in the verify-schedule-url function at runtime. Without this, launch fails on Vercel.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
```

**READ.** `serverExternalPackages` and `images` are the entire configuration. **There is no `headers()`
key**, so Next.js adds no security headers of its own beyond its defaults, and Next does not set
`X-Frame-Options` by default.

### `vercel.json` — the headers block, quoted verbatim

```json
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "X-Robots-Tag",           "value": "noindex, noarchive, nosnippet" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    },
    {
      "source": "/trucks/(.*)",
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, noarchive" }
      ]
    }
  ],
```

**READ.** Two rules, three headers, and **not one of them concerns framing**. `X-Robots-Tag` is
indexing; `X-Content-Type-Options` is MIME sniffing.

⚠️ **ONE THING WORTH FLAGGING THAT IS NOT A BLOCKER.** `/trucks/(.*)` already carries
`X-Robots-Tag: noindex, noarchive` — so the public truck and ordering pages are **deliberately kept out
of search indexes**. That does not affect iframes at all (framing and indexing are unrelated
mechanisms), but it is a live decision about those exact URLs that an embed task would sit on top of.
**Recorded, not interpreted** — I did not establish why it is set.

### 🔴 THERE IS NO `middleware.ts` — BECAUSE IT WAS RENAMED TO `proxy.ts`, NOT DELETED

This is the one place a frame header would most plausibly hide, so it was checked three ways:

1. `find . -path ./node_modules -prune -o -path ./.next -prune -o -name 'middleware*' -print` →
   **no source file anywhere in the tree.** **READ.**
2. `git ls-files | grep -i middleware` → **nothing tracked.** `git cat-file -e HEAD:middleware.ts` →
   *"path 'middleware.ts' does not exist in 'HEAD'"*. **READ.**
3. 🔴 **CORRECTED 20 August 2026 — IT WAS RENAMED, NOT DELETED, AND THE ROUTING LAYER IS LIVE.**
   `git log --all -- middleware.ts` returns four commits — `f4a8ac2` *"vercel fix"*, `095bada`
   *"redis"*, `fe04fef` *"proxy fix"*, `805cea1` *"hatchgrab domain setup"* — and
   `git log --diff-filter=D` names `f4a8ac2` as a deletion commit. ⚠️ **`--diff-filter=D` NAMES A
   RENAME AS A DELETION.** `git show f4a8ac2` disproves the reading in one command: **the same commit
   that removed `middleware.ts` (−49) created `proxy.ts` and added the Upstash limiter to it (+40).**
   It was a **rename to the Next 16 convention.** ~~**It was removed, not absent by design.**~~
   **The rate limiter, the Supabase session refresh, the `/dashboard` and `/manage` auth guards, the
   Village Foodie → HatchGrab operator redirect and the native-app UA exemption have run continuously
   in `proxy.ts` the whole time.** **READ.**

⚠️ **AND THE LIVE ROUTING LAYER IS `proxy.ts` AT THE REPO ROOT.** A `find`/`git ls-files` sweep for
`middleware*` is the wrong search on Next 16 and returns a confident, wrong "there is none".

⚠️ **A STALE COMPILED ARTEFACT SURVIVES AND MUST NOT BE MISTAKEN FOR A LIVE ONE.**
`.next/dev/server/middleware.js` exists, is 841 bytes, and is dated **24 July 2026** — a build output
from before the deletion. `.next/` is **not** in `.gitignore` (checked), which is why it is sitting in
the working tree. **It does not run.** Anyone grepping for "middleware" and finding that file would
draw the wrong conclusion.

## 1.2 The direct answers

- **`X-Frame-Options`:** `grep -rniE "x-frame-options" app lib components next.config.ts vercel.json`
  → **ZERO HITS.** **READ, from absence, with the path named.**
- **CSP `frame-ancestors`:** `grep -rniE "frame-ancestors"` over the same paths → **ZERO HITS.**
- **Any CSP at all:** `grep -rniE "content-security-policy|contentSecurityPolicy"` → **ZERO HITS.**
- **Any other security header** (`strict-transport`, `referrer-policy`, `permissions-policy`) →
  **ZERO HITS.**

🔴 **SO: NO FRAME BLOCKING EXISTS, GLOBALLY OR PER-ROUTE. Any page on this origin can already be
iframed by any site on the internet, today.** That is the plain answer the brief asked for.

⚠️ **AND THAT CUTS BOTH WAYS, WHICH IS WORTH SAYING ONCE.** The absence that makes an embed easy is
also an absence of clickjacking protection on the **operator dashboard**, the **KDS**, and the
**manage** pages — all of which authenticate on a token in the URL. **I am reporting the state, not
recommending a change**, and no header should be added as a side effect of an embed task without
deciding what it should say for those surfaces too.

⚠️ **CANNOT DETERMINE: whether Vercel's platform adds any header at the edge that this repository does
not declare.** Nothing in the repo can answer that. `curl -I https://www.hatchgrab.com/trucks/<slug>`
against the deployed site would settle it in one command, and is worth running before trusting the
absence above end to end.

---

# 2. THE EVENT-RENDERING SURFACES THAT EXIST TODAY

All **READ**. Four public routes render a truck's events; none requires auth or a token.

| Route | File | Auth | Data source |
|---|---|---|---|
| `/trucks/[slug]` | `app/trucks/[slug]/page.tsx` → `TruckClient.tsx` (346 lines) | **none** | `useVillageData` → `GET /api/discovery/events` |
| `/venues/[slug]` | `app/venues/[slug]/page.tsx` → `VenueClient.tsx` | **none** | same hook, same API |
| `/` (home) | `app/page.tsx` | **none** | same hook, same API |
| `/trucks/[slug]/order` | `app/trucks/[slug]/order/page.tsx` (4,182 lines) | **none** | `GET /api/events?truck=<slug>` and `GET /api/menu/[truckId]` |

### 🔴 THE TWO EVENT APIs ARE NOT THE SAME API, AND THE DIFFERENCE MATTERS

**`GET /api/discovery/events`** — `app/api/discovery/events/route.ts`, **no auth**,
`export const revalidate = 300`. It reads the **discovery** world (`discovery_trucks`, `venues`) and
**merges operator events from `truck_events`** (`:191`), gating each on the truck's own
`show_on_vf` / `show_on_hg` booleans (`:76`, `:185-187`) and carrying `source: 'operator'` (`:303`) plus
per-site order-link flags `orderLinkVf` / `orderLinkHg` (`:288-291`). It is host-aware:
`isHatchGrabHost` picks which column to read.

**`GET /api/events?truck=<slug>`** — `app/api/events/route.ts`, **no auth**, `revalidate = 0`. Its own
header says what it is:

```ts
// app/api/events/route.ts
// Returns upcoming confirmed/open events for a truck slug.
// Reads from truck_events (the authoritative source) so all vans are included.
```

```ts
  const { data: rows, error } = await supabase
    .from('truck_events')
    .select('id, event_date, start_time, end_time, venue_name, town, postcode, notes, status, opened_at')
    .eq('truck_id', truck.id)
    .in('status', ['confirmed', 'open'])
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })
    .limit(50)
```

It returns per event: `id, date, date_iso, date_friendly, start_time, end_time, truck_name,
venue_name, village, postcode, notes, status, opened_at` — with `date_friendly` already rendered as
*"Today · Monday 20th August"*, and de-duplicated on `date|venue|start_time`.

⚠️ **`status: 'open'` MEANS LIVE, AND THE CODE SAYS SO EXPLICITLY** — *"'open' = operator-started /
auto-opened = LIVE"*. The comment above the select records that customer surfaces derive "live" from
`status === 'open'`, **not from the clock window**, and that the times are DISPLAY-only.

---

# 3. 🔴 THE CHROME ON THE CLOSEST EXISTING SURFACE

**The closest surface is `/trucks/[slug]`** — a truck's upcoming events, publicly, with no ordering
inline. Its rendering lives in `app/trucks/[slug]/TruckClient.tsx` (346 lines, `'use client'`).

**READ.** Five pieces of chrome surround the event content, and **how each is rendered decides the
answer the brief is after**:

| # | Chrome | How it is rendered | File · line |
|---|---|---|---|
| 1 | **Analytics + fonts + `<html>`/`<body>`** | 🔴 **SHARED ROOT LAYOUT** — every page is wrapped in `CSPostHogProvider` | `app/layout.tsx:84-86` |
| 2 | **Dark sticky header with the Village Foodie logo**, linking to `/` | ⚠️ **INLINE JSX inside `TruckClient`** | `TruckClient.tsx:118-133` |
| 3 | **Scroll-reveal centred truck name + logo** in that header | **INLINE JSX**, same block | `TruckClient.tsx:134-150` |
| 4 | **Fixed bottom "Get Weekly Schedule 🍕" CTA** | **INLINE JSX** | `TruckClient.tsx:334-341` |
| 5 | **`<Footer />`** — newsletter block, Contact/Hire/Report links, `/trucks` link | **AN IMPORTED COMPONENT**, one line | `TruckClient.tsx:344`, `components/Footer.tsx` (59 lines) |
| 6 | **Tally forms script** from `tally.so` | **INLINE `<Script>`** | `TruckClient.tsx:115` |

The header, quoted:

```tsx
      {/* HEADER */}
      <header className="bg-slate-900 text-white py-3 px-4 sticky top-0 z-50 shadow-md h-[60px] flex items-center">
        <div className="max-w-6xl mx-auto flex justify-between items-center w-full relative">

          <Link href="/" className="flex items-center transition-opacity hover:opacity-90 shrink-0 z-20">
            <Image
              src="/logos/village-foodie-logo-v2.png"
              alt="Village Foodie"
              width={140}
              height={42}
              className="object-contain w-[110px] sm:w-[140px]"
              priority
            />
          </Link>
```

and the foot of the component:

```tsx
      <div className="fixed bottom-6 left-0 right-0 flex justify-center z-40 pointer-events-none">
        <button
          onClick={openTallyPopup}
          className="pointer-events-auto bg-slate-900 text-white font-bold py-3 px-6 rounded-full shadow-lg border border-slate-700 flex items-center gap-2 hover:bg-slate-800 transition-transform hover:scale-105 active:scale-95"
        >
          <span>Get Weekly Schedule 🍕</span>
        </button>
      </div>

      <Footer onOpenTally={openTallyPopup} />
```

## 🔴 WHAT THIS DECIDES — the question the brief asked

**A chrome-free variant is NOT a layout change and NOT a prop. On this surface it is a new route.**
Stated as a finding, not a proposal:

- 🔴 **THERE IS NO LAYOUT TO CHANGE.** `find app -name 'layout.tsx'` returns six files —
  `app/layout.tsx` (root), `(legal)`, `dashboard/[token]/kds`, `dev`, `kds/[kds_token]`, `landing`.
  **`app/trucks/` has none.** The header, the CTA and the `<Footer />` mount are all statements inside
  `TruckClient`'s single `return`, so there is no wrapper to swap.
- ⚠️ **A PROP WOULD MEAN CONDITIONALS THROUGH ONE 346-LINE CLIENT COMPONENT** that also serves the home
  page's sibling surfaces through the same shared hook and the same `EventListCard`. I am not
  recommending against it; I am recording that the chrome is not isolated, so a prop touches the live
  public page rather than sitting beside it.
- ✅ **THE EVENT CONTENT ITSELF IS ALREADY A SEPARATE COMPONENT** — `components/EventListCard.tsx` — and
  the data already arrives from one public API. **The reusable part is reusable; it is the wrapper that
  is not.**
- ⚠️ **THE ROOT LAYOUT STILL APPLIES TO ANY NEW ROUTE**, so PostHog (§5) comes with it unless something
  changes there. That is the one piece of chrome a new route does **not** escape by itself.

⚠️ **ONE MORE, AND IT IS NOT COSMETIC.** The logo on this page is **Village Foodie's**, not
HatchGrab's — `/logos/village-foodie-logo-v2.png`, hardcoded, with no `isHatchGrab()` branch on it. The
brief says the embed should carry "NO HatchGrab logo"; **the closest existing surface does not carry one
either.** `lib/domain.ts` (9 lines, quoted below) is how the code tells the two hosts apart, and it is
used on this page for **ordering affordances**, not for branding:

```ts
export function isHatchGrab(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.includes('hatchgrab')
}
```

🔴 **IT IS `window`-BASED, SO IT IS FALSE DURING SERVER RENDER AND ON THE FIRST CLIENT FRAME.** Anything
that branched brand or ordering on it inside an iframe would behave the same way it does today — which
is to say, it resolves from the **iframe's own URL**, not the parent page's. **READ; the consequence for
an embed is INFERRED and unproven.**

---

# 4. EXISTING EMBED / IFRAME / WIDGET CAPABILITY

**Searches, over `app/ lib/ components/`:** `iframe`, `<iframe`, `embed`, `widget`, `postMessage`,
`frameborder`, `allow-scripts`. Plus the header searches from §1.

## 🔴 THIS REPOSITORY OFFERS NOTHING TO BE EMBEDDED. It only CONSUMES other people's iframes.

| What | Where | Direction |
|---|---|---|
| **Tally form iframe** (contact form) | `app/contact/page.tsx:20-29`, with `frameBorder="0"` at `:25` | 🔴 **consumes a third party** |
| **Tally form iframe** (hire form) | `app/hire/page.tsx:36-44` | **consumes** |
| **Tally popup script** `tally.so/widgets/embed.js` | `app/page.tsx:187`, `app/contact/page.tsx:36`, `app/venues/[slug]/VenueClient.tsx:100`, `app/trucks/[slug]/TruckClient.tsx:115` | **consumes** |
| **Stripe Connect embedded components** | `app/api/stripe/connect/route.ts:386` (account session), `components/manage/PaymentsTab.tsx` | **consumes** — and `lib/stripe/connect.ts:273-280` and `lib/stripe/payments-state.ts:72` both record hard-won lessons about iframe callbacks arriving *"late, twice, or never"* |
| **Stripe card box** on the customer order page | `app/trucks/[slug]/order/page.tsx:3119` | **consumes** |
| **`postMessage`** | `lib/native/serviceWorker.ts:19` — one call, to the app's own service worker | neither |

**NOTHING OFFERS AN EMBED.** No `/embed` route, no widget script we serve, no partner page, no
`postMessage` API for a host page, no allow-list of parent origins. **READ, from absence, with the
searches and paths named above.**

### ⚠️ AND THERE IS AN EXPLICIT, DELIBERATE DECISION ON RECORD AGAINST CALLING SOMETHING AN EMBED

`lib/plan-features.ts:187-190` — the plan matrix carries a `coming_soon` feature, and its comment is
directly on point:

```ts
      // 🔴 THE PAGE IS SERVED AT THEIR ADDRESS. IT IS NOT AN EMBED. The detail deliberately avoids
      // "built into your site", "embedded" and "inside your website" — none of those is what this is,
      // and a marketing string that promises an embed is a promise the product would have to keep.
      // ⚠️ NOT THE QR CODE AND NOT THE ORDER LINK, both of which operators already have on every plan
      // ('QR code' → qr_menu above). Those point AT our address; this one IS theirs.
      { name: 'Order page on your own website', detail: 'Your ordering page available at your own web address, under your own name.', starter: false, pro: false, max: 'coming_soon' },
```

🔴 **THAT IS A DIFFERENT PRODUCT FROM THE ONE BEING SCOPED, AND IT IS ALREADY ADVERTISED AS COMING SOON
ON MAX.** It promises a page *served at their address* (a custom domain), and the comment says in as
many words that "embedded" was avoided on purpose. **The embed in this brief would be the thing that
comment rules out of that string.** Whether they are the same roadmap item, or two, is a product
decision — **I am reporting the conflict, not resolving it.**

---

# 5. COOKIES, STORAGE AND ANALYTICS ON THE PUBLIC PATH

## 🔴 ANALYTICS LOADS ON EVERY PAGE, FROM THE ROOT LAYOUT, UNCONDITIONALLY

`app/providers.tsx` — **the whole file, 14 lines**:

```tsx
'use client'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',
  })
}

export function CSPostHogProvider({ children }: { children: React.ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
```

mounted in `app/layout.tsx:84-86`:

```tsx
        <CSPostHogProvider>
          {children}
        </CSPostHogProvider>
```

**READ.** Three facts follow, and the brief asked for exactly this:

1. 🔴 **IT IS AT MODULE SCOPE AND UNGATED.** `posthog.init` runs on import, for **every** route under
   the root layout — the public truck page, the ordering page, everything. There is no consent check,
   no route exclusion and no opt-out branch.
2. 🔴 **THERE IS NO COOKIE BANNER ANYWHERE.** Searching `app/ components/ lib/` for
   `cookie banner|cookieconsent|consent` returns only signup/terms prose (`app/signup/page.tsx`,
   `lib/legal.ts`) and one AddOrderPanel comment. **No consent UI exists on any surface.**
   **READ, from absence, paths named.**
3. ⚠️ **`persistence` IS NOT SET**, so PostHog uses its default. **I have NOT read `posthog-js` to
   confirm what that default writes**, and I am not going to assert a third-party library's behaviour
   from memory. **CANNOT DETERMINE from this repository.** Opening the deployed public page and reading
   `document.cookie` plus `localStorage` in devtools would settle it in ten seconds, and it is the one
   check worth doing before an embed goes on anyone else's domain — because **whatever it writes today,
   it would write inside their page.**

**Events are actively captured on the public event card**, not merely initialised:
`components/EventListCard.tsx:1` imports `usePostHog`, `:43` calls it, and `:113-123`:

```tsx
  const trackOrderClick = (method: string, ev: VillageEvent, venueDisplay: string) => {
      if (posthog) {
          posthog.capture('clicked_contact_button', {
              method: method,
              truck_name: ev.truckName,
              venue: venueDisplay,
              village: ev.village,
              cuisine: ev.type
          });
      }
  };
```

`TruckClient.tsx` also captures `clicked_newsletter_subscribe`. **The very component an embed would
reuse is instrumented.**

## Third-party script on the same surface

`TruckClient.tsx:115` loads `https://tally.so/widgets/embed.js` with `strategy="afterInteractive"`,
solely to power the newsletter popup. **A third party's script on the public truck page, unrelated to
events.** **READ.**

## localStorage / sessionStorage / document.cookie

`grep -rn "localStorage" app/trucks app/order components` returns **six files, and not one of them is on
the customer path**: `DemoGetStarted.tsx`, `DashboardIndexNativeFallback.tsx`, `OperatorDeviceConfig.tsx`,
`DemoLoopComplete.tsx`, `dashboard/types.ts`, `DemoWelcome.tsx` — all demo or operator surfaces.

✅ **`app/trucks/[slug]/order/page.tsx` — all 4,182 lines — contains NO `localStorage`, NO
`sessionStorage` and NO `document.cookie`.** **READ, from a direct search of that file.** So the only
storage question on the public path is PostHog's, above.

---

# 6. WHAT IDENTIFIES A TRUCK PUBLICLY

**`trucks.slug`** — the public identifier. From the schema section of the manual: *"slug (V5, unique,
URL-safe — used by /trucks/[slug]/order; prod-verified to EXIST V6.5)"*.

How a public route resolves one — `app/api/events/route.ts:38-53`:

```ts
  // Try slug first, fall back to ID — same pattern as /api/menu/[truckId]
  let truckQuery = await supabase
    .from('trucks')
    .select('id, name')
    .eq('slug', truckSlug)
    .single()

  if (truckQuery.error || !truckQuery.data) {
    truckQuery = await supabase
      .from('trucks')
      .select('id, name')
      .eq('id', truckSlug)
      .single()
  }
```

⚠️ **THE `?truck=` PARAMETER ACCEPTS EITHER THE SLUG OR THE RAW `trucks.id`**, and the comment says
`/api/menu/[truckId]` does the same. `trucks.id` is a **human-readable TEXT primary key** — the seed
script's target is literally `'test-truck'` — not a uuid.

**Is the identifier sensitive or guessable?**

- **Sensitive: no.** A slug is already in every public URL, every QR code and every share link. It
  grants nothing on its own — `/api/events?truck=<slug>` returns venue, date and time for events the
  operator has already published publicly.
- 🔴 **Guessable: YES, EMPHATICALLY, AND THAT IS TRUE TODAY WITH OR WITHOUT AN EMBED.** A slug is
  derived from the truck's name (`createSlug`), and `trucks.id` is a readable string. **Both are
  enumerable.** An embed URL in page source would expose nothing that `/trucks/<slug>` does not already.
- ⚠️ **THE THING THAT WOULD BE SENSITIVE IS A DIFFERENT IDENTIFIER ENTIRELY.** `dashboard_token` and
  `kds_token` are bearer credentials in URLs and are redacted from API responses by name in
  `app/api/dashboard/route.ts`. **They must never appear in an embed URL** — a statement about what
  exists, not a design.

---

# 7. DELIBERATELY PUBLIC, UNAUTHENTICATED ROUTES, AND THEIR PROTECTION

| Route | Auth | Protection in the repo |
|---|---|---|
| `GET /api/events?truck=` | none | 🔴 **`export const revalidate = 0` — NO CACHE, no rate limit.** Two DB reads per call |
| `GET /api/menu/[truckId]` | none | 🔴 **`export const revalidate = 0  // No cache`**, no rate limit |
| `GET /api/discovery/events` | none | ✅ **`export const revalidate = 300`** — 5-minute ISR cache. The only cached one |
| `GET /trucks/[slug]`, `/trucks/[slug]/order`, `/venues/[slug]`, `/` | none | none in-repo; `X-Robots-Tag: noindex` on `/trucks/(.*)` |
| `GET /api/ping` | none | `Cache-Control: no-store` |
| `POST /api/orders/submit` | none (public ordering) | not audited here — outside this brief |

**Rate limiting exists but is narrowly applied.** `grep -rn "ratelimit" app --include=route.ts` returns
**three importers only**: `app/api/demo/route.ts`, `app/api/demo/build-request/route.ts` (both
`demoRatelimit`) and `app/api/signup/route.ts` (`signupRatelimit`, `signupEmailRatelimit`), backed by
Upstash Redis. **`/api/events`, `/api/menu/[truckId]` and `/api/discovery/events` have none.**
**READ, from absence, search and path named.**

⚠️ **CANNOT DETERMINE — and the brief says that is acceptable — what protects these at infrastructure
level.** Vercel's platform DDoS mitigation, firewall rules and edge caching are configured outside this
repository. The Vercel project's Firewall tab would settle it.

🔴 **THE FACT THAT MATTERS FOR AN EMBED, STATED PLAINLY:** the two APIs an events embed would lean on
are the two **uncached, unlimited** ones, and an embed multiplies their call volume by however many
visitors every truck's own website receives. **That is a load observation about existing routes, not a
proposal.**

---

# 8. DOES THE TRUCK RECORD HOLD A WEBSITE URL?

**Yes — and more than one column could serve. All three named, as asked.**

| Column | Written by | What it means today |
|---|---|---|
| **`trucks.website`** | `/api/manage` `update_settings` allow-list (`route.ts:798`), from Manage → Contact Details | 🔴 **THE OBVIOUS CANDIDATE — the truck's own public website.** The allow-list comment records that `website` *"wasn't a column"* once and PostgREST 400'd the whole multi-field update, which is why the allow-list exists |
| **`trucks.schedule_url`** | `/api/manage` `update_truck` allow-list (`route.ts:861`) | ⚠️ **NOT a general website field.** It is the **scraper's** target — it sits beside `scraper_preference` and `scraper_rule`, and `app/api/manage/verify-schedule-url/route.ts` gets 1024 MB and 60 s in `vercel.json` to launch headless Chromium against it. It may be a Facebook page rather than a website |
| **`discovery_trucks.website`** | the discovery/scraper world, not operator input | Selected in `/api/discovery/events` (`:67`, `:126`) and surfaced by `EventListCard.tsx:221` as a link. **A different table for a different population** — scraped trucks, not necessarily HatchGrab operators |

⚠️ **THEY CAN DISAGREE.** An operator-managed truck may have `trucks.website` set while its discovery
counterpart carries a different `discovery_trucks.website`, and `schedule_url` may be neither.
**Which one a connect wizard would trust is a decision, and I am not making it.**

---

# 9. THE ORDERING PAGE'S CONTRACT — where the embed's button would point

**READ**, from `app/trucks/[slug]/order/page.tsx` (4,182 lines).

**URL shape:** `/trucks/[slug]/order`, with four query parameters read at `:215-236`:

```tsx
export default function OrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  ...
  const searchParams = useSearchParams()
  const eventIdParam = searchParams.get('event_id')
  ...
  const confirmOrderKey = searchParams.get('confirm')
  ...
  const paymentFailedParam = searchParams.get('payment_failed')
```

| Parameter | Required? | Effect |
|---|---|---|
| `slug` (path) | **yes** | resolves via slug, falling back to `trucks.id` (§6) |
| `?event_id=` | ⚠️ **NO — optional** | *"Per-event deep-link (hatchgrab 'Order now' flow). ?event_id present → scope the page to that"* event. Also scopes the slot-capacity read (`:730-731`) |
| `?confirm=` | no | 🔴 *"Present ⇒ this page render is a RECEIPT, not an order form."* |
| `?payment_failed=` | no | a failure banner |

✅ **THE EMBED'S BUTTON SHAPE ALREADY EXISTS IN THIS CODEBASE.** `EventListCard.tsx:174` builds exactly
that link today, appending `event_id` only when the event has one and choosing `?`/`&` correctly:

```tsx
<a href={ev.id ? `${ev.orderUrl}${ev.orderUrl.includes('?') ? '&' : '?'}event_id=${ev.id}` : ev.orderUrl}
   target="_blank" rel="noopener noreferrer" ...>
    🌐 Order
```

⚠️ **AND IT IS ALREADY GATED, PER SITE.** `EventListCard.tsx:132-135`: an **operator** event's order CTA
renders only if `orderLinkHg` (on HatchGrab) or `orderLinkVf` (on Village Foodie) is true — admin
controls, defaulting to `true` at `:291`. The comment explains the distinction: for an operator event
the URL is *"OUR in-app HatchGrab order link"*, whereas for a discovery event it is *"the truck's OWN
channel"*. **An embed reusing this component inherits that gate, which may or may not be wanted.**

**What happens when an event has ended.** The page handles this in several places, and I read the
markers rather than tracing every branch:

- `/api/events` returns only `status in ('confirmed','open')` **and** `event_date >= today`, so a
  finished event **is simply absent from the list**. **READ.**
- The page carries a **"closed" banner** and a **"paused" banner** (`:248`, `:277`, `:291`, `:569`), and
  `:403` handles *"Event finished EARLY (status='closed'/'cancelled') while the customer was already on
  the page"*.
- `:670` — *"Fallback if no event hours: 10:00-23:00"*.
- ⚠️ **CANNOT DETERMINE what the page renders for a slug whose truck has NO upcoming events at all.**
  That needs the render traced through 4,182 lines or the page opened against such a truck; I read the
  route contract, not every branch, and I will not guess at a customer-visible state.

⚠️ **ONE CONTRACT DETAIL WORTH FLAGGING FOR AN EMBED.** `/api/events` returns
`{ truck_slug, truck_name, events: [], next_event: null }` **with HTTP 200** when the truck is not found
— it logs `[events API] truck not found` and returns an empty shell rather than a 404. **A wrong slug in
an embed would render an empty list, not an error.** **READ.**

---

# 10. SUMMARY OF WHAT COULD NOT BE DETERMINED

| Question | Why | What would settle it |
|---|---|---|
| Whether Vercel adds frame headers at the edge | configured outside the repo | `curl -I https://www.hatchgrab.com/trucks/<slug>` |
| What PostHog actually writes to cookies/localStorage | third-party default, `persistence` unset, library not read | devtools on the deployed public page |
| Infrastructure-level abuse protection on the public APIs | Vercel firewall config | the Vercel project's Firewall tab |
| What the order page renders for a truck with no upcoming events | not traced through 4,182 lines | open it against such a truck |
| Why `/trucks/(.*)` is `noindex` | no rationale in the repo | ask, or find the commit |
| Whether the `coming_soon` "Order page on your own website" is the same roadmap item as this embed | a product decision | yours |
