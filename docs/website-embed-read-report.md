# WEBSITE EMBED — what exists, and what would block an iframe

**READ ONLY.** Nothing in this repository was changed by this task except this file.
No design is proposed, no effort is estimated, no approach is recommended.
`next dev` was not run. Nothing belonging to `pizzeria-gusto` or `tikka-tonic` was touched.
Deploys are frozen pending an App Store review decision; nothing here is urgent or actionable today.

**Prompt integrity:** no span of the instructing prompt arrived garbled, and no instruction
contradicted another. Nothing required stopping to ask.

**Verification performed:** file reads and greps only. **No parse, no typecheck, no execution,
no render.** No page was loaded, no request was issued to any origin, no database was queried.
Every claim below is read from source in the working tree, or explicitly marked otherwise.

**A pre-existing document `docs/website-embed-read.md` (31,183 bytes, 20 August 2026) covers
overlapping ground. It was NOT used as evidence for anything in this report** — the instruction
forbids marking anything READ on the strength of a comment or a cross-reference, and a prior
report is a cross-reference. Every finding here was re-derived from source.

## Marking key

| Mark | Meaning |
|---|---|
| **READ** | I opened the file and read the construct itself. |
| **INFERRED** | Concluded from absence or from structure. The search *and* the paths searched are named. |
| **CANNOT DETERMINE** | Not answerable from this repository. |

---

## 1. FRAME BLOCKING — THE FIRST BLOCKER

### Every place a security header is set

There are exactly **three** places in this repository where any HTTP response header is set.
All three are quoted in full below.

**(a) `vercel.json`** — **READ**, quoted complete:

```json
{
  "functions": {
    "app/api/manage/verify-schedule-url/route.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, noarchive, nosnippet" },
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
  "crons": [ … ]
}
```

Four header assignments across two `source` patterns. `X-Robots-Tag` is a crawler directive;
`X-Content-Type-Options: nosniff` is a MIME-sniffing control. **Neither affects framing.**

Note for the record, since it touches `/trucks/*`: `X-Robots-Tag: noindex, noarchive` is applied
to every path under `/trucks/`, which is where both event-rendering surfaces live.

**(b) `next.config.ts`** — **READ**, quoted complete:

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

**There is no `headers()` function in this file.** The entire config is `serverExternalPackages`
and `images.remotePatterns`.

**(c) `proxy.ts`** (Next 16 renamed middleware; `middleware.ts` does not exist — `ls` returned
`No such file or directory`) — **READ**. A grep for `headers.set(` / `headers.append(` across
`proxy.ts`, `app/` and `lib/` returns **exactly one hit**:

```ts
// proxy.ts:270-272
  if (rlRemaining !== null) {
    supabaseResponse.headers.set('X-RateLimit-Remaining', String(rlRemaining))
  }
```

One header, and it is a rate-limit counter.

The only other header written anywhere in `proxy.ts` is on the 429 refusal path — **READ**,
`proxy.ts:151-160`:

```ts
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
        },
      })
```

**No route handler sets a security header.** A grep for `'Content-Security` / `"Content-Security`
across `app/` and `lib/` returns zero hits.

### Specifically: `X-Frame-Options` and CSP `frame-ancestors`

**NEITHER EXISTS ANYWHERE IN THIS REPOSITORY.**

The search, stated so it can be repeated — case-insensitive extended regex
`x-frame-options|frame-ancestors|content-security-policy|frameguard|SAMEORIGIN|DENY`
over `--include=*.ts --include=*.tsx --include=*.js --include=*.mjs --include=*.json
--include=*.sql --include=*.md --include=*.html`, rooted at the repository root, excluding
`node_modules` and `.next`.

Every hit returned was the standalone word `DENY`/`deny` inside prose about allow-lists and
deny-lists (`app/api/dashboard/route.ts:107`, `lib/whatsapp-classifier.ts:306`,
`lib/payments/order-drafts.ts:12`, and assorted `docs/*.md`), plus the two lines of
`docs/website-embed-read.md` that record the same absence. **Zero hits for `x-frame-options`.
Zero hits for `frame-ancestors`. Zero hits for `content-security-policy`.**

### Verdict

**Nothing in this repository blocks an iframe. Stated plainly: there is no first blocker of this
kind to remove.** — **READ** for the three header sites; **INFERRED from absence** for the
negative, with the search and paths named above.

**CANNOT DETERMINE — and this is the residual risk on this item.** Vercel, Cloudflare, or any
edge layer in front of the deployment may inject `X-Frame-Options` or a CSP without any file in
this repository saying so. Platform-level defaults are not visible from source, and I have issued
no request to the live origin to check. **The only way to settle it is to inspect the response
headers of a live `/trucks/<slug>` request.** Until that is done, "no header is set *by this
codebase*" is the complete and accurate claim, and it is not the same as "no header is served."

---

## 2. THE EVENT-RENDERING SURFACES THAT EXIST TODAY

Four public routes render events. All are **READ**. **None requires auth. None requires a token.**
The proxy's public list is quoted in §7.

### (a) `/trucks/[slug]` — the truck profile. **The closest surface to what is being scoped.**

- **Server file:** `app/trucks/[slug]/page.tsx` (79 lines) — `generateMetadata` plus one line of
  render: `return <TruckClient slug={resolvedParams.slug} />` (`:79`).
- **Client file:** `app/trucks/[slug]/TruckClient.tsx` (346 lines) — all rendering.
- **Auth:** none. No token, no session, no gate.
- **Data:** `useVillageData` → **`GET /api/discovery/events`**. **READ**,
  `hooks/useVillageData.ts:34-37`:

```ts
        const res = await fetch(`/api/discovery/events?t=${Date.now()}`, {
          signal: localController.signal,
          cache: 'no-store' as RequestCache,
        });
```

  🔴 **This fetches EVERY truck's events and EVERY truck's profile, then filters to one truck in
  the browser.** **READ**, `TruckClient.tsx:59-61`:

```ts
  const truckEventsFlat = useMemo(() => {
    return mapEvents.filter(event => createSlug(event.truckName) === slug);
  }, [mapEvents, slug]);
```

  The API accepts a `slug` parameter (`app/api/discovery/events/route.ts:71`,
  `:152`, `:257`) — **this caller does not pass it.**

- **Second network dependency:** `app/trucks/[slug]/page.tsx:6,11` fetches a **Google Sheets CSV**
  server-side for the OpenGraph metadata only. **READ**:

```ts
const TRUCKS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub?gid=28504033&single=true&output=csv';
…
    const res = await fetch(TRUCKS_CSV_URL, { next: { revalidate: 3600 } }); // Caches for 1 hour to keep it fast
```

  It feeds `<title>` and the social card only; the visible page never reads it.

### (b) `/trucks/[slug]/order` — the customer ordering page

- **File:** `app/trucks/[slug]/order/page.tsx` (4,182 lines).
- **Auth:** none.
- **Data:** three APIs. **READ**:
  - `GET /api/events?truck=${slug}` (`:900`) — this truck's upcoming events.
  - `GET /api/menu/${slug}` or `/api/menu/${slug}?event_id=${event.id}` (`:979`).
  - `GET /api/slots/${truckId}?…` (`:732`).
- It renders events through the **same `TruckListCard` component** as the profile
  (`:16` import, `:2485` and `:2500` usage).

### (c) `/venues/[slug]` — venue profile

- **File:** `app/venues/[slug]/VenueClient.tsx`. **READ**, `:7,16,23`: same `useVillageData`
  (`/api/discovery/events`), filtered by `getVenueSlug(...)` instead of truck slug. Auth: none.

### (d) `/` — the Village Foodie discovery map

- **File:** `app/page.tsx`. **READ**, `:10,51`: same hook, all events. Auth: none.
- On a `hatchgrab` host this route is rewritten to `/landing` by the proxy (§7).

### Not an event surface

`/trucks` (`app/trucks/page.tsx`) is a truck **directory**. **READ**, `:9`: it destructures only
`{ allTrucks, loading }` from the hook. It renders no events.

### What `/api/discovery/events` actually returns — **READ**, and it matters

`app/api/discovery/events/route.ts`:

- `export const revalidate = 300` (`:12`).
- Host-branded: `const isHG = isHatchGrabHost(host)`, `const showCol = isHG ? 'show_on_hg' : 'show_on_vf'` (`:74-76`).
- Scraped discovery events, `.limit(1000)` (`:90`); operator events from `truck_events`,
  `.in('status', ['confirmed', 'open']).gte('event_date', today)`, `.limit(200)` (`:222-226`).
- 🔴 **On a HatchGrab host the scraped feed is dropped entirely** — **READ**, `:323`:

```ts
  const filteredDiscovery = isHG ? [] : (mappedDiscoveryEvents as any[]).filter(e =>
    !operatorKeys.has(`${normalize(e.truckName)}-${e.date}-${normalize(e.venueName)}`)
  )
```

- 🔴 **The `trucks` array it returns is built from `discovery_trucks` ONLY** — **READ**, `:337-356`
  maps `trData`, which comes from `.from('discovery_trucks')` (`:93`). No operator truck appears
  in it unless that truck also has a `discovery_trucks` row with the host's `show_on_*` set.

**INFERRED** (from those two reads combined with `TruckClient.tsx:43-57`, where `truckInfo` is
`allTrucks.find(t => t.cleanKey === slug)`): on `hatchgrab.com`, a truck that exists only as an
operator record — no `discovery_trucks` row — resolves `truckInfo` to `null` and
`/trucks/[slug]` renders its **"Truck not found"** branch. I have not loaded the page to observe
this, and I have not queried the database to establish which trucks have discovery rows.

---

## 3. THE CHROME

Closest existing surface: **`/trucks/[slug]`**. Everything below is **READ** from
`app/trucks/[slug]/TruckClient.tsx`, `app/layout.tsx`, `app/providers.tsx` and
`components/Footer.tsx`.

### What surrounds the event content, and how each piece is rendered

| # | Chrome element | How rendered | Where |
|---|---|---|---|
| 1 | `<html>` / `<body>`, Geist fonts, `globals.css` | **shared root layout** | `app/layout.tsx:79-89` |
| 2 | `<CSPostHogProvider>` — analytics wrapper | **shared root layout** | `app/layout.tsx:84-86` |
| 3 | Site metadata / favicon 🚚 / OG image | **shared root layout** | `app/layout.tsx:17-63` |
| 4 | Tally widget `<Script>` | **inline in the page** | `TruckClient.tsx:115` |
| 5 | Dark sticky header + **Village Foodie logo** linking to `/` | **inline in the page** | `TruckClient.tsx:118-170` |
| 6 | List/Map toggle (mobile) | **inline in the page** | `TruckClient.tsx:154-167` |
| 7 | Hero: truck logo, name, type, website link | **inline in the page** | `TruckClient.tsx:173-211` |
| 8 | **"Own this truck?"** pill → `/contact?topic=Add%20Business` | **inline in the page** | `TruckClient.tsx:175-184` |
| 9 | Action row: Menu / Call / Message / Share / Order | **inline in the page** | `TruckClient.tsx:214-248` |
| 10 | Fixed floating **"Get Weekly Schedule 🍕"** button | **inline in the page** | `TruckClient.tsx:335-342` |
| 11 | **"Are we missing an event?"** dashed panel | **inline in the page** | `TruckClient.tsx:306-319` |
| 12 | Leaflet map, right column | **imported component** (`next/dynamic`) | `TruckClient.tsx:17-20`, `:326` |
| 13 | Event cards themselves | **imported component** | `TruckClient.tsx:11`, `:301` |
| 14 | **Footer** — newsletter block, Hire/Contact/Directory links, disclaimer | **imported component** | `TruckClient.tsx:9`, `:344` |
| 15 | Cookie banner | **DOES NOT EXIST** — see below | — |

The two blocks a truck's own site would most obviously object to, quoted:

**The header logo** — **READ**, `TruckClient.tsx:121-130`:

```jsx
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

**The footer**, in full — **READ**, `components/Footer.tsx:8-59`, rendered as
`<Footer onOpenTally={openTallyPopup} />` at `TruckClient.tsx:344`:

```jsx
export default function Footer({ onOpenTally }: FooterProps) {
  return (
    <div className="bg-slate-900 text-slate-300 p-6 text-center mt-auto pb-24">
      <h3 className="text-white font-bold text-lg mb-2">Never miss a slice 🍕</h3>
      <p className="text-sm mb-4">Get the village food schedule sent to your inbox every week.</p>
      <button onClick={onOpenTally} …>Get the Schedule</button>
      <div className="text-[10px] mt-2 flex flex-col gap-2 items-center">
        <p>No Spam (but maybe Pepperoni). Unsubscribe Anytime.</p>
        <div className="mt-4 text-center">
           <h4 …>Contact Us & Services</h4>
           … Hire a Food Truck | General Enquiry | Add my Business | Report Issue | Truck Directory …
        </div>
        <p className="mt-4 max-w-xs text-center leading-relaxed">
            Disclaimer: Schedules are subject to change by vendors. We do our best, but we are not responsible for cancelled trucks or sold-out burgers. Always check the vendor's social media for last-minute updates.
        </p>
      </div>
    </div>
  );
}
```

### "Powered by HatchGrab"

**It does not appear on this surface, or on any customer-facing page.** — **INFERRED from
absence.** Search: `grep -rn "Powered by"` over `app/`, `components/`, `lib/`. The **only**
occurrence in a rendering context is the QR-poster fallback described in §11
(`app/manage/[token]/page.tsx:8756-8758` names it; the string itself lives in
`lib/generateQRCode.ts`), which is an operator-side PNG generator, not a page.

### Cookie banner

**There is none, anywhere.** — **INFERRED from absence.** Search: case-insensitive
`cookie banner|cookieconsent|cookie consent|consent|gdpr` over `app/` and `components/`,
`--include=*.ts --include=*.tsx`, with comment-only lines excluded. Every surviving hit was
unrelated: `app/signup/page.tsx:131` (a "consent by conduct" line under the signup button),
`app/api/signup/route.ts:29`, `app/(legal)/layout.tsx:100`,
`components/dashboard/AddOrderPanel.tsx:2360`. **No consent UI of any kind exists.** See §5 —
this matters, because the page does set a cookie.

### Layout change, prop, or new route?

**A NEW ROUTE.** The reasoning, from what is read above:

- **It is not a layout change.** The shared layout in play is `app/layout.tsx`, and it contains
  only `<html>`, `<body>`, the font variables and `<CSPostHogProvider>`. **None of items 4–14 —
  the logo, the hero, the buttons, the Tally script, the floating CTA, the footer — is in a
  layout.** There is nothing to strip at the layout level except the analytics provider, which is
  §5's problem, not chrome.
- **It is not a prop.** The chrome is **six separate inline JSX blocks** inside `TruckClient.tsx`
  (items 4, 5, 6, 7+8, 9, 10, 11) **plus one imported component** (item 14). A single prop would
  have to gate seven independent regions of one 346-line component that also owns the event
  rendering.
- Route-group layouts are an established pattern in this repository — **READ**:
  `app/(legal)/layout.tsx`, `app/landing/layout.tsx`, `app/dashboard/[token]/kds/layout.tsx`,
  `app/kds/[kds_token]/layout.tsx`. Four already exist.

⚠️ **One qualification, stated because it survives all three options:** `app/layout.tsx` is the
root layout and wraps **every** route in the application, including any new one. `<CSPostHogProvider>`
at `:84` is therefore unconditional on a new route as much as on this one. A new route removes
items 4–14; it does not remove item 2.

---

## 4. ANY EXISTING EMBED CAPABILITY

Search: case-insensitive `<iframe|iframe|postMessage|embed|widget` over `app/`, `components/`,
`lib/`, `hooks/`, `public/`, `--include=*.ts --include=*.tsx --include=*.js --include=*.html`,
excluding `node_modules`.

### Does this product OFFER an embed today? No.

**INFERRED from absence** (search and paths above): there is no embeddable route, no widget
script, no `<script src>` this product serves to a third party, no embed snippet generator, and
no framing allow-list. Nothing in the codebase is designed to be placed inside someone else's page.

### What it CONSUMES from third parties — all **READ**

**(a) Tally form iframes.** Two direct `<iframe>` elements:

- `app/hire/page.tsx:36-44` — **READ**:

```jsx
          <iframe 
            src="https://tally.so/embed/Y5dWKW?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1" 
```

- `app/contact/ContactForm.tsx:44-58` — **READ**:

```ts
  let tallyUrl = `https://tally.so/embed/7R2Ra2?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1&topic=${encodeURIComponent(topic)}`;
```

  with `/** iframe accessible name. Brand-specific … */` at `:30`.

**(b) The Tally widget script** — `<Script src="https://tally.so/widgets/embed.js" …>` on **four
public pages**: `app/page.tsx:187`, `app/contact/page.tsx:73`,
`app/contact/HatchGrabContact.tsx:38`, `app/venues/[slug]/VenueClient.tsx:100`, and
**`app/trucks/[slug]/TruckClient.tsx:115`** — five sites in total, including the closest surface.
`app/contact/HatchGrabContact.tsx:74` records why: *"`dynamicHeight=1` NEEDS
tally.so/widgets/embed.js TO RESIZE THE FRAME."*

**(c) Stripe Connect embedded components** — operator-side only, `components/manage/PaymentsTab.tsx`
(`:150`, `:242-243`, `:320`, `:548`, `:567`, `:582-591`, `:635-636`) and `lib/stripe/connect.ts`,
`lib/stripe/payments-state.ts`. Manage → Payments hosts Stripe's own iframes.

### `postMessage`

**Two occurrences, both the service worker, both operator-only** — **READ**:

- `lib/native/serviceWorker.ts:19` — `controller.postMessage(…)`
- `public/sw.js:98` — `clients.forEach(client => client.postMessage({ type: 'QUEUE_COUNT', count: newCount }))`
- `public/sw.js:162` — `event.ports[0]?.postMessage({ type: 'QUEUE_COUNT', count })`

**No cross-frame `postMessage` exists.** The service worker is registered only from the dashboard
and the KDS (§5).

### 🔴 One directly relevant thing the search turned up

`lib/plan-features.ts:256-261` — **READ**, quoted in full because it is the product's own
position on this exact question:

```ts
      // 🔴 THE PAGE IS SERVED AT THEIR ADDRESS. IT IS NOT AN EMBED. The detail deliberately avoids
      // "built into your site", "embedded" and "inside your website" — none of those is what this is,
      // and a marketing string that promises an embed is a promise the product would have to keep.
      // ⚠️ NOT THE QR CODE AND NOT THE ORDER LINK, both of which operators already have on every plan
      // ('QR code' → qr_menu above). Those point AT our address; this one IS theirs.
      { name: 'Order page on your own website', detail: 'Your ordering page available at your own web address, under your own name.', starter: false, pro: false, max: 'coming_soon' },
```

A **`coming_soon` plan-matrix row already exists** named *"Order page on your own website"*,
Max-tier, and it is rendered publicly (`app/landing/page.tsx:95`) and in the operator Billing tab
(`app/manage/[token]/page.tsx:10880-10882`). ⚠️ **Its detail string describes a custom-domain
ordering page, and the comment states explicitly that it is deliberately NOT an embed.** Reported
as a fact about the surface, not as a judgement about scope.

---

## 5. COOKIES AND STORAGE ON THE PUBLIC PATH

### PostHog analytics — loaded on every public page, and it sets a cookie

**READ**, `app/providers.tsx`, quoted complete (13 lines):

```ts
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

Mounted unconditionally in the **root layout** — **READ**, `app/layout.tsx:84-86`:

```jsx
        <CSPostHogProvider>
          {children}
        </CSPostHogProvider>
```

**There is no host check, no route check, and no consent gate on this.** It runs on
`/trucks/[slug]`, on `/trucks/[slug]/order`, on `/venues/[slug]` and on `/`.

🔴 **The only config passed is `api_host` and `person_profiles`. No `persistence` option is set,
so the library default applies.** — **READ** (dependency source, `node_modules/posthog-js`
version **1.386.6**): the default is

```
persistence:"localStorage+cookie"
```

with cookie keys prefixed `"ph_"` (`node_modules/posthog-js/dist/module.js`). **So the current
page sets both a first-party cookie and localStorage entries, with no consent UI anywhere in the
product (§3).**

The page also captures events explicitly — **READ**, `TruckClient.tsx:69-72`:

```ts
  const openTallyPopup = () => {
    if (posthog) {
      posthog.capture('clicked_newsletter_subscribe', { source: 'truck_page', truck: truckInfo?.name });
    }
```

### Tally

`<Script src="https://tally.so/widgets/embed.js" strategy="afterInteractive" />` —
**READ**, `TruckClient.tsx:115`. A third-party script from `tally.so` executes on this page.
**CANNOT DETERMINE** what storage it sets: that is Tally's code, not in this repository, and I
have not fetched it.

### The page's own storage

**None.** — **INFERRED from absence.** Search: `localStorage|sessionStorage|document.cookie`
over `app/trucks/[slug]/TruckClient.tsx`, `app/trucks/[slug]/order/page.tsx`,
`app/trucks/page.tsx`, `app/venues/[slug]/page.tsx`. **Zero hits in all four**, including the
4,182-line order page. Neither surface writes browser storage of its own.

### Service worker

**Not registered on any public route.** — **READ.** Search
`serviceWorker.register|registerServiceWorker|navigator.serviceWorker` over `app/`, `components/`,
`lib/`: the only call sites are `app/dashboard/[token]/page.tsx:204` and
`app/dashboard/[token]/kds/page.tsx:850`. Both are operator surfaces.

### Supabase auth cookies

The proxy constructs a Supabase server client and calls `getUser()` on **every** matched request,
including `/trucks/*` — **READ**, `proxy.ts:166-190`:

```ts
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()
```

**INFERRED:** `setAll` is invoked by `@supabase/ssr`, not by this file, and only when the library
has tokens to write. An anonymous visitor carrying no `sb-*` cookie therefore receives none. I
have not executed this path or read `@supabase/ssr` to confirm, so this is inference from the
wiring, not observation. **What is READ is that the machinery is mounted on the public path.**

### API responses

**No public API route sets a cookie.** — **INFERRED from absence.** Search
`cookies().set|cookies.set|Set-Cookie` over `app/api/` (64 route files): **zero hits.**

### Summary for an embed's purposes

| | On `/trucks/[slug]` today |
|---|---|
| First-party cookie | **Yes** — PostHog, `ph_*` (library default, no override) |
| localStorage | **Yes** — PostHog, same default |
| Third-party script | **Yes** — `tally.so/widgets/embed.js` |
| Consent UI | **None anywhere in the product** |
| Page's own storage | None |
| Service worker | Not on public routes |
| Auth cookie | Machinery mounted; writes only with an existing session (inferred) |

---

## 6. PUBLIC TRUCK IDENTIFIER

**A slug.** — **READ.**

### How it is generated

`lib/provision-truck.ts:302-311` — **READ**:

```ts
function operatorIdentity(name: string, slugOverride: string | undefined, attempt: number): Identity {
  const base = createSlug(slugOverride || name)
  const suffixed = attempt === 0 ? base : `${base}-${attempt + 1}`
  return {
    id: suffixed,
    slug: suffixed,
    // Existing convention, kept for support-desk readability: `gusto-3d87b5d15a6f`.
    dashboard_token: `${suffixed.slice(0, 24)}-${randomBytes(6).toString('hex')}`,
  }
}
```

🔴 **For an operator truck, `id` and `slug` are the SAME string, and both are the truck's name
run through `createSlug`.** `lib/utils.ts:177-186` — **READ**:

```ts
export function createSlug(str: string): string {
  if (!str) return '';
  return str.toLowerCase()
      .replace(/&/g, 'and')         
      .replace(/['’]/g, '')         
      .replace(/[^a-z0-9\s-]/g, '') 
      .trim()
      .replace(/\s+/g, '-')         
      .replace(/-+/g, '-');         
}
```

Demo trucks are different — `lib/provision-truck.ts:292-300`, **READ**:

```ts
function demoIdentity(): Identity {
  // id, slug and token are generated INDEPENDENTLY. All three are publicly resolvable (/api/menu and
  // /api/events each accept id or slug), so leaking one must not hand over the others. Costs nothing.
  return {
    id: DEMO_PREFIX + randomToken(DEMO_TOKEN_CHARS),
    slug: DEMO_PREFIX + randomToken(DEMO_TOKEN_CHARS),
    dashboard_token: DEMO_PREFIX + randomToken(DEMO_TOKEN_CHARS),
  }
}
```

### How a public route resolves one

`app/api/events/route.ts:39-52` — **READ**:

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

`/api/menu/[truckId]` uses the same slug-then-id pattern (named as such in the comment above;
route file `app/api/menu/[truckId]/route.ts` — **READ** for `revalidate = 0` at `:18`).

`/trucks/[slug]` resolves entirely client-side against the discovery feed —
`TruckClient.tsx:45`: `allTrucks.find(t => t.cleanKey === slug)`, where `cleanKey` is
`createSlug(t.name)` (`app/api/discovery/events/route.ts:344`).

### Is the identifier sensitive or guessable?

**Guessable: yes, entirely, for an operator truck.** — **READ**, from `operatorIdentity` +
`createSlug` above. The slug is a pure deterministic function of the trading name. Anyone who
knows a truck is called "Pizzeria Gusto" can compute `pizzeria-gusto` without any access.
Collisions append `-2`, `-3`, … (`:304`).

**Sensitive: no — and it is separated by design from the thing that is.** The `dashboard_token`
is a *different* value carrying 6 random bytes (`:309`), and the demo comment at `:293-294`
states the separation principle explicitly. **INFERRED from absence:** `dashboard_token` appears
in no public route's select. Search: `dashboard_token` over `app/api/discovery/`,
`app/api/events/`, `app/api/menu/` — zero hits.

Two consequences of the slug being in page source, reported as facts:

1. `vercel.json` already applies `X-Robots-Tag: noindex, noarchive` to `/trucks/(.*)`. An embed
   URL under that prefix inherits it; one on any other prefix would not.
2. `app/trucks/[slug]/order/page.tsx:218` — **READ** — `const isDemo = isDemoIdentifier(slug)`.
   The `demo-` prefix is self-identifying in the URL, and `proxy.ts:59` keys the
   `/dashboard/demo-*` session-gate exception on the same prefix.

---

## 7. PUBLIC ROUTE PROTECTION

### Every deliberately-public route

`proxy.ts:217-225` — **READ**, quoted complete:

```ts
  // Public routes — always accessible
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/' ||
    pathname.startsWith('/trucks') ||
    pathname.startsWith('/venues') ||
    pathname.startsWith('/help')
```

And its counterpart, `proxy.ts:212-214` — **READ**:

```ts
  const isProtected =
    (pathname.startsWith('/dashboard') && !isDemoDashboard(pathname)) ||
    pathname.startsWith('/manage')
```

⚠️ **Note what this means literally:** `isProtected` names only `/dashboard` and `/manage`.
Every other path — `/landing`, `/contact`, `/hire`, `/setup`, `/kds/[kds_token]`,
`/order/[id]/manage`, the legal pages — is unauthenticated at the proxy, whether or not it is in
the `isPublic` list. `/kds` and `/order/[id]/manage` carry their own token auth; `proxy.ts:209`
records the `/kds` case.

The matcher — `proxy.ts:331-335`, **READ**:

```ts
export const config = {
  matcher: [
    '/((?!_next_next/image|favicon.ico|apple-touch-icon.png|logos|photos|sw.js|manifest.json|offline.html).*)',
  ],
}
```

### How each is protected

**(a) Rate limiting** — a positive allowlist, **READ**, `proxy.ts:27-31`:

```ts
const isCustomerEvents = (p: string) => p === '/api/events'
const isStrictPublic = (p: string) =>
  p === '/api/discovery' || p.startsWith('/api/discovery/')
const isGeneralPublic = (p: string) =>
  p === '/trucks' || p.startsWith('/trucks/')
```

The header comment at `:5-10` states the design: *"INVERTED by design (NOT 'limit every /api/*
minus an exempt list'). Operator surfaces … are STRUCTURALLY OUTSIDE this set."*

Tiers — **READ**, `lib/ratelimit.ts`:

| Tier | Limit | Scope | Key |
|---|---|---|---|
| `strictRatelimit` (`:14-19`) | **3 / min** | `/api/discovery`, `/api/discovery/*` | IP |
| `eventsRatelimit` (`:59-64`) | **600 / min** | `/api/events` **exactly** | **IP + truck slug** |
| `ratelimit` (`:4-9`) | **60 / min** | `/trucks`, `/trucks/*` | IP |
| `demoRatelimit` (`:79-84`) | 5 / hour | `/api/demo` | IP |
| `signupRatelimit` (`:108-113`) | 3 / hour | `/signup` | IP |
| `signupEmailRatelimit` (`:115-120`) | 3 / day | `/signup` | email |

Application and bypass — **READ**, `proxy.ts:118`, `:122`, `:134-139`:

```ts
  const operatorBypass = (hasBearer || hasOperatorSession) && !isStrict
…
  if (inLimitedScope && !isDev && !isLoopback && !operatorBypass) {
…
    const limiter = isEvents ? eventsRatelimit : isStrict ? strictRatelimit : ratelimit
    const limiterName = isEvents ? 'events' : isStrict ? 'strict' : 'general'
    const truckParam = isEvents ? (request.nextUrl.searchParams.get('truck') || '-') : null
    const key = truckParam ? `${ip}:${truckParam}` : ip

    const { success, remaining } = await limiter.limit(key)
```

🔴 **Directly relevant to an embed:** the surface an embed would most naturally reuse —
`/api/discovery/events` — sits on the **3/min** tier, and the operator bypass explicitly does
**not** cover it (`proxy.ts:116-118`: *"STRICT STAYS EXCLUDED, unchanged"*). `/api/events` is on
600/min keyed by (IP, truck). `/trucks/*` page loads are on 60/min. Reported, not evaluated.

**(b) Caching** — **READ**:

| Route | Directive | File:line |
|---|---|---|
| `/api/discovery/events` | `export const revalidate = 300` | `route.ts:12` |
| `/api/events` | `export const revalidate = 0` | `route.ts:8` |
| `/api/menu/[truckId]` | `export const revalidate = 0  // No cache` | `route.ts:18` |
| `/api/slots/[truckId]` | `export const revalidate = 0` | `route.ts:18` |

The client also defeats the discovery cache — `hooks/useVillageData.ts:34-36`:
`` fetch(`/api/discovery/events?t=${Date.now()}`, { … cache: 'no-store' }) `` — a unique query
string per call plus `no-store`.

**(c) Data gates on the public feed** — **READ**, `app/api/discovery/events/route.ts`:
`.eq(showCol, true)` per host (`:86`, `:95`), `if (truck.excluded) return null` (`:146`),
`if (!truck[showCol]) return null` (`:149`), `if (!truck.active) return false` (`:252`),
and a fail-closed catch at `:105-112`:

```ts
    // FAIL CLOSED: on error we drop the scraped-discovery feed entirely rather than fall back to an
    // UNFILTERED query — the old fallback could leak hg_only/hidden rows onto the public Village Foodie
    // site.
```

**(d) `X-Robots-Tag`** — `vercel.json`, quoted in §1: `noindex, noarchive, nosnippet` on
`/api/(.*)`, `noindex, noarchive` on `/trucks/(.*)`.

**(e) Infrastructure-level protection — CANNOT DETERMINE.** WAF rules, bot management, DDoS
protection, Vercel Firewall configuration and any edge caching are not represented in this
repository. Nothing in source speaks to them, and I issued no request to find out.

---

## 8. THE TRUCK'S WEBSITE URL

Both columns exist. They are written by different flows and only one is displayed publicly.

### `trucks.website`

- **Written by:** `POST /api/manage` action `update_truck`, via a field allowlist — **READ**,
  `app/api/manage/route.ts:798`:

```ts
      'website', 'allergen_info_url', 'allergen_info_text', 'allergen_display_mode', 'truck_emoji',
```

  The comment two lines above (`:790`) names a past incident with this exact column: *"(The
  trucks.website incident: `website` …"*.

- **Entered at:** Manage → Settings, a field labelled **"Website"** — **READ**,
  `app/manage/[token]/page.tsx:9116-9128`:

```jsx
          label="Website"
          value={form.website || ''}
…
            const val = normaliseUrl(form.website)
```

- **DISPLAYED PUBLICLY: YES.** — **READ**, two hops:
  1. `app/api/discovery/events/route.ts:293` puts it in the public feed:
     `websiteUrl: truck?.website || linked.website || null,` (operator events), and `:172` /
     `:350` for scraped rows.
  2. `app/trucks/[slug]/TruckClient.tsx:54` reads `websiteUrl: truck.websiteUrl`, and `:198-208`
     renders it as a link in the hero:

```jsx
            {truckInfo.websiteUrl && (
                <a 
                    /* V3: one shared helper, byte-identical to the expression it replaces — see lib/url-normalise.ts */
                    href={hrefFromStoredUrl(truckInfo.websiteUrl)}
                    target="_blank" 
                    rel="noopener noreferrer"
                    …
                    <span className="truncate max-w-[200px] md:max-w-xs">{getDisplayWebsite(truckInfo.websiteUrl)}</span>
                </a>
            )}
```

  `getDisplayWebsite` (`:103-111`) rewrites known social hosts to "Facebook Page", "Instagram",
  "TikTok", "X (Twitter)" and otherwise strips the scheme. ⚠️ **So this column already holds
  social-profile URLs in practice, not only websites** — the helper exists because it does.

### `trucks.schedule_url`

- **Column purpose, from the migration** — **READ**,
  `supabase/migrations/20260604_scraper_preference.sql:5,11-12`:

```sql
  add column if not exists schedule_url text,
…
comment on column trucks.schedule_url is
  'URL operator provided for schedule scraping';
```

- **Written by:** `POST /api/manage` `update_settings`, via a second allowlist — **READ**,
  `app/api/manage/route.ts:861` (which contains `'scraper_preference', 'schedule_url', 'scraper_rule'`).

- **Two write paths, both in Manage** — **READ**:
  1. The schedule-enrolment flow, only on a successful verification —
     `app/manage/[token]/page.tsx:3200`:

```ts
          await api('update_truck', { data: { schedule_url: url, scraper_preference: 'auto' } })
```

     with `:3172` recording the rule: *"ROUTE A — verify the schedule URL, and ONLY on found:true
     enrol (schedule_url + scraper_preference:'auto'…"*.
  2. The Settings field at `:9481-9496`, which clears it on empty
     (`saveSetting('schedule_url', null)`) and saves the normalised value otherwise.

- **DISPLAYED PUBLICLY: NO.** — **INFERRED from absence.** Search: `schedule_url` over the whole
  repository, `--include=*.ts --include=*.tsx --include=*.sql`, excluding `node_modules`,
  `.next` and `docs/`. Every hit is one of: the two migrations, the `/api/manage` allowlist, the
  `Truck` interface and Manage UI in `app/manage/[token]/page.tsx`, or the **admin** panel —
  `app/admin/page.tsx:41`, `:1268-1269`:

```jsx
                  {editingTruck.schedule_url
                    ? <a href={editingTruck.schedule_url} target="_blank" rel="noreferrer" …>{editingTruck.schedule_url}</a>
```

  **It appears in no public API select and on no customer-facing surface.**

### Any other column that could serve

**INFERRED** from the `Truck` interface at `app/manage/[token]/page.tsx:66` (**READ** — it is the
single most complete inventory of the table in the codebase). Columns that hold a URL or a
third-party address:

| Column | What it is | Public? |
|---|---|---|
| `website` | the operator's site or social profile | **Yes** (§8 above) |
| `schedule_url` | scraping source | No |
| `social_instagram` | Instagram handle/URL | Not read on `/trucks/[slug]` — **INFERRED**, no reference in `TruckClient.tsx` or `app/api/discovery/events/route.ts` |
| `social_facebook` | Facebook handle/URL | as above |
| `allergen_info_url` | allergen document | order page only |
| `logo_storage_path`, `cover_image_path` | Supabase storage paths | Yes, as image URLs |

There is also `discovery_trucks.website` (`app/api/discovery/events/route.ts:51`, `:126`), a
**separate** column on a different table, used as the fallback when the operator's own is null
(`:293`: `truck?.website || linked.website`).

**CANNOT DETERMINE:** which of the two columns is populated for any given live truck. That is a
data question, and no database was queried.

---

## 9. THE ORDERING PAGE FROM OUTSIDE

### URL shape — **READ**

`https://<host>/trucks/<slug>/order` — file `app/trucks/[slug]/order/page.tsx`, param read at
`:216`: `const { slug } = use(params)`.

Optional query parameters, all **READ**:

| Param | Meaning | Where |
|---|---|---|
| `?event_id=<truck_events.id>` | scope to one event | `:223` `const eventIdParam = searchParams.get('event_id')` |
| `?confirm=<orderKey>` | render a receipt for an existing order | `:2134`, `:831` |

The canonical form is built in three places — **READ**:

- `components/TruckListCard.tsx:135` — `` href={`/trucks/${slug}/order?event_id=${event.id}`} ``
- `app/api/discovery/events/route.ts:287` —
  `` orderUrl: truck?.slug ? `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order` : null ``
- `app/manage/[token]/page.tsx:8729-8731` —
  `` const orderUrl = truck.slug ? `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order` : null ``

### Does it need an event id? No.

**READ**, `app/trucks/[slug]/order/page.tsx:960-972`:

```ts
  useEffect(() => {
    if (!events.length) { setEvent(null); return }
    const next = isDemo
      ? (events.find(e => e.id === eventIdParam) ?? events[0])
      : eventIdParam
        ? (events.find(e => e.id === eventIdParam) ?? null)
        : (events.length === 1 ? events[0] : null)
    setEvent(next)
    setSlotHour(''); setSlotMinute('')
  }, [eventIdParam, events, isDemo])
```

- **No `event_id`, one event** → auto-selected.
- **No `event_id`, several events** → `null`, and the page renders an in-page chooser of
  `TruckListCard`s (`:2496-2500`).
- **`event_id` present but not in the list** → `?? null`. **For a multi-event truck this is
  indistinguishable from "no event_id"** — the chooser appears, silently.

### What happens if the event has ended — three independent mechanisms, all **READ**

**(1) Client-side filter at fetch time** — `:918-926`:

```ts
            const now = new Date()
            const cutoff = new Date()
            cutoff.setDate(cutoff.getDate() + 14)
            const upcoming = data.events.filter((e: EventData) => {
              // Exclude events whose end time has passed — local time parse per engineering manual
              if (e.date_iso && e.end_time && now >= new Date(`${e.date_iso}T${e.end_time}`)) return false
              const [d, m, y] = e.date.split('/').map(Number)
              return new Date(y, m-1, d) <= cutoff
            })
```

An ended event never enters `events`, so a deep link to it falls through to `?? null`.

**(2) Server status, caught by the menu poll** — `:1009-1013`:

```ts
  // status='closed' (operator finished, possibly early) blocks ordering WITHOUT a submit attempt.
…
  // On a 404 with a closed/cancelled event_status (or ordering_available:false): flip eventEnded.
```

and `:1994`: *"Event ended (403, server status guard): the operator finished the event (possibly early)."*

**(3) Clock backstop** — `:2301-2304`:

```ts
  // Closed = clock backstop (isEventClosed, past published end) OR status-driven (eventEnded, operator
  // finished — possibly early). Either blocks ordering, matching the server's status guard + the
  // finished-early promise.
  const isClosed = isEventClosed || eventEnded
```

The banner it produces — **READ**, `:2379-2380`:

```jsx
                : eventEnded && !isEventClosed
                ? 'This event has ended — no more orders are being taken.'
```

and the buttons flip — `:3518`, `:3612`:

```jsx
                {submitting ? 'Placing order...' : isClosed ? 'Ordering has closed' : isPaused ? 'Ordering paused' : orderingTimeNotSet ? 'Set-up pending' : !eventLoading && !event ? 'No event available' : 'Place order'}
```

**Two further page-level refusals** — **READ**:

- `:2224-2238` — if the truck's plan lacks `advance_preordering`:
  **"Online ordering not available / This truck takes walk-up orders at the hatch."**
- `:2406` — **"This business is no longer taking online orders"**.

**None of these is an HTTP status.** Every one is a client-rendered branch of a 200 response.

---

## 10. THE EMPTY STATE

### `/trucks/[slug]` with no upcoming events

**It exists.** **READ**, `app/trucks/[slug]/TruckClient.tsx:280-291`, quoted exactly:

```jsx
        ) : truckEventsFlat.length === 0 ? (
          <div className="p-12 flex flex-col items-center text-center animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4">😔</div>
            <h2 className="text-xl font-bold text-slate-800">No upcoming events found</h2>
            <p className="text-slate-500 mt-2 max-w-sm">We might be missing some details for this truck. Are you the owner, or do you know their schedule?</p>
            <Link 
              href={`/contact?topic=Add%20Business&truck=${encodeURIComponent(truckInfo.name)}`} 
              className="mt-6 bg-orange-600 text-white font-bold py-3 px-6 rounded-xl shadow-sm hover:bg-orange-700 transition-transform hover:scale-105"
            >
              Drop us a message to update!
            </Link>
          </div>
```

⚠️ **The copy addresses the truck's owner and the general public, not the truck's customers**, and
the CTA links to Village Foodie's contact form with `topic=Add%20Business`. Reported as read.

It is the **fourth** of four mutually exclusive branches — **READ**, `:251-292`. The other three:

| Branch | Line | Heading |
|---|---|---|
| `loading` | `:251-252` | *"Loading schedule..."* |
| `loadError` (after 3 bounded retries) | `:253-266` | 📡 **"Couldn't load"** + Retry button |
| `!truckInfo` | `:267-279` | 🤷‍♂️ **"Truck not found"** + "View all trucks" |
| `truckEventsFlat.length === 0` | `:280-291` | 😔 **"No upcoming events found"** |

The comments distinguishing them are precise — `:254-255`: *"FETCH FAILED (after bounded retries)
— an HONEST error+retry, NOT 'Truck not found'"*; `:268`: *"Fetch SUCCEEDED and the slug genuinely
isn't in the list → real not-found (only here)."*

⚠️ Note what a **HatchGrab-host** embed would hit: per §2, `truckInfo` comes from the
discovery-only `trucks` array, so a truck with no `discovery_trucks` row falls into the **third**
branch — **"Truck not found"** — not the empty state. **INFERRED**, from the two reads in §2.

### `/trucks/[slug]/order` with no upcoming events

**Also exists, with different copy.** **READ**, `:2473-2477`:

```jsx
          ) : noEvents ? (
            <div className="mt-3 bg-slate-100 rounded-xl px-4 py-3">
              <p className="text-slate-500 text-sm font-medium">No upcoming events in the next 2 weeks</p>
              <p className="text-slate-400 text-xs mt-0.5">Check back soon or visit the truck page for updates</p>
            </div>
```

`noEvents` is set at `:931` and `:934` — when the API returns an empty array, **or** when
everything it returned was filtered out by the ended/2-week test at `:921-926`.

### Can the empty state be detected from outside the iframe?

**NO. Not by any mechanism that exists today.** — **READ** for each leg:

1. **No `postMessage`.** §4: the only `postMessage` calls in the repository are service-worker
   messages, and the service worker is not registered on public routes (§5). A parent page
   receives nothing from the frame.
2. **No status-code signal.** All four branches are client-rendered inside one 200 response.
   `TruckClient` is `'use client'` (`:1`) and every branch is decided after the
   `/api/discovery/events` fetch resolves in the browser.
3. **No height signal.** The empty state is a `p-12` block inside the same
   `flex-1 w-full max-w-6xl mx-auto p-4 pb-24` container (`:250`) as the populated state, under
   the same `min-h-screen` root (`:114`) and above the same `<Footer>` (`:344`). Cross-origin
   frames cannot be measured by the parent regardless.
4. **No callback, no `window.name`, no fragment write.** — **INFERRED from absence**; search
   `postMessage|window.name|window.parent|window.top` over `app/trucks/`, `components/`,
   `hooks/`: zero hits other than the two service-worker files already named.

**What IS externally detectable — but only by a separate request, not by reading the frame:**
`GET /api/events?truck=<slug>` is public and unauthenticated (§7), and returns
`{ truck_slug, truck_name, events: [], next_event: null }` for a truck with nothing upcoming.
**READ**, `app/api/events/route.ts:56-64` shows that exact shape being returned for an unresolvable
truck; `:69-79` is the query for a resolvable one. That is a server-to-server check available to
whoever controls the embedding page — it is not a signal the iframe emits.

---

## 11. THE NO-WEBSITE FALLBACK

**Yes — a QR code and a copyable public link both exist today, on every plan.** All **READ**.

### The link

`app/manage/[token]/page.tsx:8729-8731`:

```ts
  const orderUrl = truck.slug
    ? `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order`
    : null
```

Surfaced in **Manage → Settings**, inside a card headed **"Order QR code"** — `:9562-9581`:

```jsx
      {/* QR Code */}
      <Card className="p-4">
        <p className="text-base font-bold text-slate-800 mb-1">Order QR code</p>
        <p className="text-xs text-slate-500 mb-4">
          Print or display this code so customers can scan and pre-order.
          Place it at your hatch, on your van, or share it online.
        </p>
        {orderUrl ? (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-4">
            <p className="text-sm text-slate-600 flex-1 truncate font-mono">{orderUrl}</p>
            <button onClick={handleCopyOrderLink} …>
              {copiedOrderLink ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400 mb-4">No order URL — slug not set</p>
        )}
```

Copy handler at `:8733-8740` (`navigator.clipboard.writeText(orderUrl)`, silent on permission
denial).

### The QR code

`app/manage/[token]/page.tsx:8742-8760`:

```ts
  const handleGenerateQR = async () => {
    if (!orderUrl) return
    setGeneratingQR(true)
    try {
      const { generateQRCodePNG } = await import('@/lib/generateQRCode')
      const showBrandedQr = can('branded_qr_code') && qrCodeStyle === 'branded'
      const dataUrl = await generateQRCodePNG({
        url: orderUrl,
        logoUrl: showBrandedQr && truck.logo_storage_path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${truck.logo_storage_path}`
          : null,
        truckName: truck.name,
        // … ⚠️ The text fallback in lib/generateQRCode.ts is DELIBERATELY KEPT: it is what makes a
        // missing/failed image a degraded poster rather than a blank corner.
        hatchgrabLogoUrl: `${window.location.origin}${HATCHGRAB_LOGO_PNG}`,
      })
```

**It encodes `orderUrl` — the ordering page, not the events page.** The poster carries the
HatchGrab logo, and falls back to the **text "Powered by HatchGrab"** if the image fails to load
(`:8754-8758`).

Two styles — **READ**, `:9582-9594`: **"Standard QR code"** and a branded variant gated on the
`branded_qr_code` feature (`:8619`, `:8747`).

### The same QR on the dashboard

`app/dashboard/[token]/page.tsx` — **READ**: generated at `:1514-1517`
(`generateQRWithLogo`, same `branded_qr_code` gate), reset on logo/style change at `:1358`,
fullscreen at `:5293`, mobile shortcut at `:3077-3101`. `:190` records the intent:
*"REAL TRUCKS KEEP THE ENV VAR, deliberately: their order link and QR get printed and shared…"*

### A third shareable link — the profile URL

`app/trucks/[slug]/TruckClient.tsx:80-99` — **READ**. The **Share** button on the truck profile:

```ts
  const handleProfileShare = async () => {
    if (!truckInfo) return;
    const shareUrl = window.location.href;
    const shareData = {
      title: `${truckInfo.name} Schedule`,
      text: `Check out where ${truckInfo.name} is pitching up next! 🚚\n\n`,
      url: shareUrl
    };
    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert('Profile link copied to clipboard! 📋');
      }
```

⚠️ **This is customer-facing, not operator-facing** — it sits in the public action row, so it is
available to anyone viewing the page, and it shares the **events** page (`window.location.href`),
not the ordering page. It is the only shareable-link affordance that points at a schedule.

### Where the QR and link are NOT

**INFERRED from absence.** Search `qrcode|qr_code|qr-code|\bQR\b` over `app/`, `components/`,
`lib/`: every hit is in `app/manage/[token]/page.tsx`, `app/dashboard/[token]/page.tsx`,
`app/api/dashboard/route.ts:764`, `app/api/manage/route.ts:861`, `app/api/signup/route.ts:8`,
`app/api/orders/submit/route.ts:256`, or the landing marketing copy
(`app/landing/page.tsx:196`, `:290`). **There is no QR or share affordance for a truck's
schedule/events page in the operator UI** — the profile Share button in `TruckClient` is the
customer-facing one described above.

### Related marketing copy already on the landing page

**READ**, `app/landing/page.tsx:196`:

> *"Share your link — Post it on Facebook, stick the QR on the van. Orders land on your screen, in the order you need to cook them."*

and `:290`, a plan bullet: *"QR code & discovery map listing"*.

---

## What remains unobserved

Stated plainly, because none of it was checked:

1. **Live response headers.** No request was made to `hatchgrab.com` or `villagefoodie.co.uk`.
   §1's conclusion is "this codebase sets no framing header", which is not "no framing header is
   served". Vercel or any edge layer may add one. **This is the single most important open item
   on the question as asked.**
2. **Nothing was rendered.** No page was loaded in any browser, in any frame, at any width. Every
   description of what a surface shows is read from JSX, not seen.
3. **No database was queried.** Which trucks have `discovery_trucks` rows, which have `website`
   or `schedule_url` populated, and which have `show_on_hg` set — all unknown here.
4. **Third-party script behaviour.** What `tally.so/widgets/embed.js` does at runtime is not in
   this repository and was not fetched.
5. **PostHog's runtime behaviour.** The default `persistence: "localStorage+cookie"` and the
   `"ph_"` prefix are **read from the installed `posthog-js@1.386.6` bundle**, which is real
   source — but no cookie was observed being set in a browser.
6. **No parse, no typecheck, no execution.** Nothing here was validated by a compiler or a test.
   `next dev` was not run, as instructed.
