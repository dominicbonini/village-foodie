# Website-embed investigation — read only

**Nothing was modified, created or deleted except this file.** `docs/reference-manual.md` was read
first, as instructed.

**WHICH OF THE THREE I DID: NONE.** No parse, no typecheck, no execution. This was a source read, and
nothing was compiled or run. Every claim below is quoted from a file on disk; where I could not
determine something from a read, it says so in those words.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 🔴 ONE PREMISE IN THE BRIEF IS FALSE, AND IT CHANGES ITEM 2

The brief says *"There are believed to be two public schedule pages — one Village Foodie branded, one
HatchGrab branded."* **There is one.** `/trucks/[slug]` is a single implementation with a runtime host
branch, and **the HatchGrab branch has no HatchGrab chrome of any kind** — the Village Foodie logo,
footer, newsletter capture and directory links render on `hatchgrab.com` exactly as they do on
`villagefoodie.co.uk`. Item 2 is therefore answered as one page with three host-conditional
differences, not as two inventories. §1 and §2 below.

---

## 1. SCHEDULE ROUTES

### There is ONE public schedule page

| | |
|---|---|
| **Route** | `/trucks/[slug]` |
| **Server file** | `app/trucks/[slug]/page.tsx` — 80 lines, metadata only |
| **Client file** | `app/trucks/[slug]/TruckClient.tsx` — 346 lines, the entire page |
| **Shared or separate?** | **Neither, as the brief frames it — ONE file with a runtime host branch** |

`app/trucks/[slug]/page.tsx:77-80` is the whole server component:

```tsx
export default async function TruckProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  return <TruckClient slug={resolvedParams.slug} />;
}
```

**There is no second file and no HatchGrab-branded route.** `find app -name "page.tsx"` returns 29
pages; none is a second schedule page. The only branded divergence is `isHatchGrab()`, and it is
called at **exactly three places** in the whole render path:

| # | Site | Effect on HatchGrab |
|---|---|---|
| 1 | `TruckClient.tsx:67` | `truckHasOrdering` — hides the "Are we missing an event?" box |
| 2 | `TruckClient.tsx:236` | hides the external "🔗 Order" button |
| 3 | `TruckListCard.tsx:133` | picks `orderLinkHg` instead of `orderLinkVf` for the Order CTA |

`lib/domain.ts`, in full:

```ts
export function isHatchGrab(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.includes('hatchgrab')
}
```

### 🔴 Three findings recorded, not fixed

1. **`isHatchGrab()` RETURNS FALSE ON THE SERVER, ALWAYS.** `typeof window === 'undefined'` is the
   first line. So the server render of `/trucks/<slug>` on `hatchgrab.com` produces the **Village
   Foodie** branch, and hydration flips it. All three sites above are inside a client component, so
   the first painted frame on HatchGrab shows the VF affordances. **Not observed in a browser** — this
   is read from the source, not from a rendered page.
   ⚠️ Note the API does it differently: `app/api/discovery/events/route.ts:74-76` reads the **`host`
   header** via `isHatchGrabHost(host)`. **Two mechanisms answer the same question**, one client-side
   and one server-side.
2. **`generateMetadata` IS HARDCODED TO VILLAGE FOODIE ON BOTH HOSTS.** `page.tsx:48`, `:56`, `:62`:

   ```tsx
   const baseUrl = 'https://villagefoodie.co.uk';
   …
     title: `${truck.name} | Village Foodie`,
   …
       siteName: 'Village Foodie',
   ```

   A HatchGrab schedule URL shared to WhatsApp therefore previews as Village Foodie, with a
   `villagefoodie.co.uk` canonical OG URL.
3. **THE METADATA READS A GOOGLE SHEETS CSV, NOT THE DATABASE.** `page.tsx:6` and `:11`:

   ```tsx
   const TRUCKS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub?gid=28504033&single=true&output=csv';
   …
     const res = await fetch(TRUCKS_CSV_URL, { next: { revalidate: 3600 } });
   ```

   The page **body** comes from `/api/discovery/events`; the **title and link preview** come from a
   published spreadsheet, cached an hour. Two sources of truth for one page.

### Adjacent surfaces that also render schedule content

Recorded because an embed decision touches them, not because they are the page asked about:

| Route | File | Notes |
|---|---|---|
| `/trucks` | `app/trucks/page.tsx` | A–Z truck directory. **VF logo hardcoded** (`:37`), no host branch at all |
| `/venues/[slug]` | `app/venues/[slug]/VenueClient.tsx` | venue-scoped event list |
| `/` | `app/page.tsx` → `VillageFoodieContent` | the discovery map |
| `/trucks/[slug]/order` | `order/page.tsx:2485`, `:2510` | reuses `TruckListCard` for "Where to find us", with `forceOrderButton` |

All four read the same hook, `useVillageData` → `/api/discovery/events` (`hooks/useVillageData.ts:34`).

---

## 2. CHROME INVENTORY

**One page, so one inventory.** The "which page carries which" column is replaced by *which host*,
because that is the only axis that varies.

### `/trucks/[slug]` — everything that is not truck content

| # | Element | File:line | Host |
|---|---|---|---|
| 1 | **Village Foodie logo**, linking to `/` | `TruckClient.tsx:121-129` | 🔴 **BOTH** — unconditional |
| 2 | List / Map mobile toggle | `TruckClient.tsx:154-167` | both |
| 3 | Sticky truck name + logo on scroll | `TruckClient.tsx:132-151` | both (truck content, listed for completeness) |
| 4 | **"Own this truck?"** → `/contact?topic=Add%20Business` | `TruckClient.tsx:175-184` | 🔴 **BOTH** — unconditional |
| 5 | **"Are we missing an event?"** panel → `/contact` | `TruckClient.tsx:304-319` | VF always; HG **only when no operator event exists** |
| 6 | **"Drop us a message to update!"** (empty-schedule state) → `/contact` | `TruckClient.tsx:281-288` | both |
| 7 | **"Get Weekly Schedule 🍕"** fixed newsletter button (Tally popup) | `TruckClient.tsx:335-341` | 🔴 **BOTH** — unconditional |
| 8 | **Tally embed script** `https://tally.so/widgets/embed.js` | `TruckClient.tsx:115` | both |
| 9 | External **"🔗 Order"** button (`truckInfo.orderUrl`) | `TruckClient.tsx:236` | **VF only** — `!isHatchGrab()` |
| 10 | **`<Footer>`** — see the breakdown below | `TruckClient.tsx:344` | 🔴 **BOTH** — unconditional |
| 11 | Leaflet `MapView` | `TruckClient.tsx:326` | both |
| 12 | "Truck not found" → **"View all trucks"** → `/trucks` | `TruckClient.tsx:274-278` | both |

### `<Footer>` — `components/Footer.tsx`, every item is chrome

| Item | Line |
|---|---|
| "Never miss a slice 🍕" newsletter headline + copy | `:11-12` |
| **"Get the Schedule"** newsletter CTA (second capture on the page) | `:14-19` |
| "No Spam (but maybe Pepperoni). Unsubscribe Anytime." | `:22` |
| **"Hire a Food Truck"** → `/hire` | `:28-33` |
| **"General Enquiry"** → `/contact` | `:35-37` |
| **"Add my Business"** → `/contact` | `:39-41` |
| **"Report Issue"** → `/contact` | `:43-45` |
| **"Truck Directory"** → `/trucks` | `:48-50` |
| **Disclaimer** — *"Schedules are subject to change by vendors… we are not responsible for cancelled trucks or sold-out burgers…"* | `:54-56` |

`Footer` takes **one prop, `onOpenTally`** — it has no brand prop and no host awareness.

### `/trucks` (the directory), if it matters to the decision

VF logo `:36-43` · "Browse active food trucks and pop-ups in **the Village Foodie network**" `:52` ·
A–Z jump bar `:63-85` · "← Back to Map" `:145-147`. **No `isHatchGrab()` call anywhere in the file.**

### 🔴 The finding item 2 exists to surface

**Nine of the twelve elements, and all nine footer items, are Village Foodie chrome that renders on
hatchgrab.com too.** Only #9 is host-gated, and #5 is gated on *ordering*, not brand. For an embed,
**every one of these leaves our surface inside a truck's own site** — two newsletter captures, five
links back to our contact form and directory, our disclaimer, and a logo linking to a competitor-facing
map. **I am recording that, not proposing what to do about it.**

---

## 3. POSTHOG

`app/providers.tsx`, in full — this is the only `posthog.init` in the repository:

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

**Two options are set. `persistence` is NOT one of them, and neither is `disable_cookie`.**

### Persistence and cookies — read from the installed package, not assumed

`posthog-js` **1.386.6**. Its default config object, extracted verbatim from
`node_modules/posthog-js/dist/module.no-external.js`:

```
api_host:"https://us.i.posthog.com", flags_api_host:null, ui_host:null, asset_host:null, token:"",
autocapture:!0, cross_subdomain_cookie:_s(be?.location), persistence:"localStorage+cookie",
persistence_name:"", cookie_persisted_properties:[], loaded:Ho, save_campaign_params:!0,
custom_campaign_params:[], custom_blocked_useragents:[], save_referrer:!0,
capture_pageleave:"if_capture_pageview", defaults:"unset", …
```

**So, stated plainly:**

- **Persistence setting: `"localStorage+cookie"`** — the library default, because our init does not
  override it.
- **Does it set cookies? YES.** That is what the `+cookie` half of the default means, and nothing
  disables it.
- `autocapture` defaults **true**; `save_campaign_params` and `save_referrer` default **true**;
  `cross_subdomain_cookie` is computed from `location`.
- `capture_pageview` resolves through `defaults`, which our init does not pass, so it is `"unset"`.
  ⚠️ **I did not trace which pageview mode `"unset"` resolves to** — the expression is
  `capture_pageview: !e || "2025-05-24" > e || "history_change"` in minified form and I am not willing
  to state a conclusion from it. **Determined by a read: pageview capture is not disabled. Not
  determined: which mode it runs in.**

### Which routes inherit it

`app/layout.tsx:88-91`:

```tsx
        <CSPostHogProvider>
          {children}
          <SessionAlertBanner />
        </CSPostHogProvider>
```

That is the **root layout**, so **every route in the application inherits it** — the schedule page,
the directory, the map, the order page, `/dashboard`, `/manage`, `/admin`, `/kds`, `/app` and
`/login`. There is no host check, route check, platform check or consent gate.

⚠️ Four files call `usePostHog()` to send explicit events: `app/page.tsx:7`,
`app/venues/[slug]/VenueClient.tsx:6`, `app/trucks/[slug]/TruckClient.tsx:7`,
`components/EventListCard.tsx:1`. On the schedule page the only explicit capture is
`clicked_newsletter_subscribe` (`TruckClient.tsx:70-72`).

---

## 4. THE ORDER-LINK AND VISIBILITY FLAGS

### 🔴 The brief's column list does not match the schema, and this is the correction

`supabase/migrations/20260702_discovery_visibility_booleans.sql` is the only migration that creates
them:

```sql
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS show_on_vf    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_on_hg    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS order_link_vf boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_link_hg boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_customer   boolean NOT NULL DEFAULT false;
…
ALTER TABLE discovery_trucks
  ADD COLUMN IF NOT EXISTS show_on_vf boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_on_hg boolean NOT NULL DEFAULT true;
…
ALTER TABLE discovery_events
  ADD COLUMN IF NOT EXISTS show_on_vf boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_on_hg boolean NOT NULL DEFAULT true;
```

- **`order_link_vf` / `order_link_hg` exist on `trucks` ONLY.** They are **not** on `discovery_trucks`.
  The admin UI agrees — `app/admin/page.tsx:1044` and `:1052` render the order-link checkbox only when
  `isOp`, and `na` otherwise.
- **`show_on_vf` / `show_on_hg` exist on THREE tables**, not two: `trucks`, `discovery_trucks` **and
  `discovery_events`**. The third is the one the brief does not mention and it is the one that
  actually gates the scraped feed.

### Per column

| Column · table | What reads it | What it controls | Authority |
|---|---|---|---|
| `trucks.order_link_hg` | `api/discovery/events/route.ts:219`, mapped at `:291` → `orderLinkHg`; consumed at `TruckListCard.tsx:133` and `EventListCard.tsx:132` | Whether an operator event shows the Order/Pre-order CTA **on HatchGrab** | Only table that has it |
| `trucks.order_link_vf` | same, `:218` → `:290` → same consumers | Same CTA **on Village Foodie** | Only table that has it |
| `trucks.show_on_hg` | `route.ts:217`; operator branch | Whether the truck's **operator** events appear on HatchGrab | 🔴 **`trucks` is authoritative for operator events** — `route.ts:185-187` says so |
| `trucks.show_on_vf` | `route.ts:216`; operator branch | Same on Village Foodie | as above |
| `discovery_trucks.show_on_hg` / `_vf` | `route.ts:126` (name-match fallback map) and the join; gate at `route.ts:149` | Truck-level gate on **scraped** events | Authoritative for scraped events at the truck level |
| `discovery_events.show_on_hg` / `_vf` | `route.ts:76` → `.eq(showCol, true)` at `route.ts:87` | **Row-level** gate on scraped events, in the SQL | Authoritative per event; the migration says per-event granularity must not be gated by the parent (`:50-51`) |

**Where both exist, the answer is by event kind, not by table precedence.** `route.ts:185-187`:

```
  // Operator-event visibility is now read DIRECTLY off the truck's own NOT-NULL show_on_vf/show_on_hg —
  // no more "linked discovery_trucks.visibility, default public if unlinked" (that missing-link default was
  // the leak the audit flagged). order_link_vf/order_link_hg drive the per-site Order CTA in the listing.
```

An **operator** event never consults `discovery_trucks`; a **scraped** event never consults `trucks`.
The two paths do not overlap, so there is no precedence rule to state — and `discovery_events` adds a
second, stricter gate on the scraped side only (`route.ts:87` in SQL, then `route.ts:149`
`if (!truck[showCol]) return null` in JS).

### Nothing reads one? — no, all six are read

**Every column in the brief's list is read.** The two that are *written* but whose write path is worth
naming: `app/api/inbound-schedule/route.ts:100-101` writes `show_on_vf: true, show_on_hg: true` on new
scraped events, and `lib/provision-truck.ts:56-59` / `:67-70` overrides all four on `trucks` at
creation with the comment **"DB default is TRUE — must override"**.

⚠️ **`excluded` overrides all of them** — `route.ts:147`, `if (truck.excluded) return null`, and
`20260703_discovery_excluded_boolean.sql:8` calls it the *master hide*.

---

## 5. ORDER vs PRE-ORDER vs NOTHING

**Inline logic, not a helper.** One expression, `components/TruckListCard.tsx:133`:

```tsx
{!hideOrderButton && (forceOrderButton || (isHatchGrab() ? event.orderLinkHg : event.orderLinkVf)) && event.source === 'operator' && (
```

and one two-line local function, `TruckListCard.tsx:63-68`:

```tsx
function isEventLive(status?: string): boolean {
  return status === 'open';
}
…
  const liveNow = isEventLive(event.status);
```

with the label and colour at `:148-152`:

```tsx
                                   ${liveNow ? GREEN_SOLID : ORANGE_SOLID} font-semibold
…
                        {liveNow ? 'Order now' : 'Pre-order'}
```

### The complete input list

| Input | Source | Effect |
|---|---|---|
| `event.source === 'operator'` | set in `api/discovery/events/route.ts` operator branch | **Nothing renders** for a scraped event |
| `event.orderLinkHg` / `orderLinkVf` | `trucks.order_link_hg` / `_vf`, defaulted `?? true` / `?? false` at `route.ts:290-291` | **Nothing renders** if the per-site flag is off |
| host, via `isHatchGrab()` | `window.location.hostname` | chooses which of the two flags is consulted |
| `event.status` | `truck_events.status`, filtered to `['confirmed','open']` at `route.ts:222` | `'open'` → **Order now** (green); otherwise → **Pre-order** (orange) |
| `hideOrderButton` prop | order page's selected-event header | suppresses the CTA |
| `forceOrderButton` prop | order-page chooser only (`order/page.tsx:2510`) | bypasses the host gate |

### 🔴 What it does NOT consume — stated because the brief asked for these specifically

- **No menu item columns.** Nothing about stock, availability or `advance_preordering` reaches this
  decision. `TruckListCard.tsx` imports nothing from the menu layer.
- **No time comparison.** `liveNow` is `status === 'open'` and nothing else — no `Date`, no
  `start_time`/`end_time` test. The comment at `:61-62` states this is deliberate:
  *"live = operator STARTED the event (status==='open' …), NOT the published clock window. Published
  times stay DISPLAY-only."*
- **No plan check.** See §6.

⚠️ **A `confirmed` event with a past date still renders a Pre-order button** as far as this expression
is concerned; the date filter is upstream in SQL (`route.ts:223`, `.gte('event_date', today)`), not
here. **I did not test that; it is read from the two files.**

---

## 6. PLAN GATING

### The helper

**`canAccess`**, `lib/features.ts:98-102`:

```ts
export function canAccess(
  plan: Plan,
  feature: Feature,
  featureOverrides: Record<string, boolean> = {},
  trialExpiresAt: string | null = null
): boolean {
```

A per-truck override wins over everything (`:105-107`). The React wrapper is `lib/useFeatures.ts:39`
(`can: (feature) => canAccess(plan, feature, overrides, trialExpiresAt)`) and the UI wrapper is
`components/FeatureGate.tsx:30`.

### `TRIAL_FEATURES` resolves to

`lib/features.ts:60`:

```ts
const TRIAL_FEATURES: Feature[] = [...MAX_FEATURES]
```

and `:53-54`:

```ts
const MAX_FEATURES: Feature[] = [
  ...PRO_FEATURES,   // includes whatsapp_replies now
```

**`TRIAL_FEATURES` is a copy of `MAX_FEATURES`, which is a superset of `PRO_FEATURES`.** A `trial`
truck carries the full Max set. `PLAN_FEATURES.demo` is also `new Set(TRIAL_FEATURES)` (`:84`).

### Is `trucks.trial_expires_at` read anywhere at all?

**Yes — widely.** ~25 call sites pass it as `canAccess`'s fourth argument, including
`api/manage/route.ts:659`, `api/menu/[truckId]/route.ts:420`, `api/orders/submit/route.ts:513`,
`api/webhooks/meta/whatsapp/route.ts:250`, `lib/orders/auto-accept.ts:79`,
`components/printing/PrintingSettings.tsx:101`, and many display sites in
`app/manage/[token]/page.tsx`. `lib/useFeatures.ts:26` computes a separate `trialExpired` flag.

### What happens when it is null — the comparison, verbatim

`lib/features.ts:123-127`:

```ts
  if (plan === 'trial') {
    if (!trialExpiresAt) return PLAN_FEATURES.trial.has(feature)          // not started yet
    if (new Date(trialExpiresAt) <= new Date()) return false              // expired — UNCHANGED
    return PLAN_FEATURES.trial.has(feature)                               // running
  }
```

**NULL GRANTS THE FULL TRIAL (= Max) SET.** The file's own comment at `:110-111` records that this
line *"used to read `if (!trialExpiresAt) return false` and that is now wrong by design"*, because
self-serve signup writes `trial_expires_at: null` (`lib/provision-truck.ts:415`) and the old form
would have denied every feature to every new operator.

⚠️ `lib/settings-copy.ts:34` records that **nothing in application code writes
`trucks.trial_expires_at` except `lib/provision-truck.ts` setting it null** — the admin UI writes it
(`app/admin/page.tsx:643`, `:651`, `:1124`), so a date only ever arrives by hand.

### 🔴 The answer that matters for an embed

**The schedule path performs NO plan check at all.** A grep for `canAccess`, `useFeatures`,
`FeatureGate` and `plan` across `app/trucks/[slug]/page.tsx`, `TruckClient.tsx`,
`components/TruckListCard.tsx`, `app/trucks/page.tsx`, `app/api/discovery/events/route.ts` and
`hooks/useVillageData.ts` returns **one hit, and it is a comment** (`route.ts:234`, "…a plan change
never loses data"). **Visibility on these routes is decided entirely by the four booleans in §4, not
by plan.**

---

## 7. EMBED OPT-IN — searched, and there is none

**No column, flag or setting exists that lets a truck opt in to an embed or an external surface.**

I searched `app/`, `lib/`, `supabase/` and `types.ts` for `embed`, `iframe`, `widget`, `allow_embed`,
`embeddable`, `external_surface`, `public_page` and `share_page`. Every hit is one of three unrelated
things:

| Hit class | Examples |
|---|---|
| **Tally forms we embed** | `app/contact/ContactForm.tsx:44,49`, `app/hire/page.tsx:36-37`, `TruckClient.tsx:115` |
| **Stripe's iframes** | `lib/stripe/connect.ts:273-280`, `lib/stripe/payments-state.ts:72-73`, `order/page.tsx:3119` |
| **PostgREST "embedded selects"** — a different sense of the word | `api/dashboard/route.ts:221`, `api/menu/[truckId]/route.ts:650` |

### 🔴 The nearest thing that exists is a marketing row that deliberately promises the opposite

`lib/plan-features.ts:256-261`:

```
      // 🔴 THE PAGE IS SERVED AT THEIR ADDRESS. IT IS NOT AN EMBED. The detail deliberately avoids
      // "built into your site", "embedded" and "inside your website" — none of those is what this is,
      // and a marketing string that promises an embed is a promise the product would have to keep.
      // ⚠️ NOT THE QR CODE AND NOT THE ORDER LINK, both of which operators already have on every plan
      // ('QR code' → qr_menu above). Those point AT our address; this one IS theirs.
      { name: 'Order page on your own website', detail: 'Your ordering page available at your own web address, under your own name.', starter: false, pro: false, max: 'coming_soon' },
```

⚠️ **That row gates nothing.** `lib/plan-features.ts` is presentation only — its own note at
`:246-248` says *"lib/plan-features.ts is PRESENTATION … and nothing reads it to gate. The enforcement
gate is canAccess in lib/features.ts"* — and `'coming_soon'` is not a `Feature` in the union at all.

**Determined by a read: there is no opt-in mechanism, and the only related artefact is an unbuilt
marketing promise for a *hosted* page, explicitly not an embed.**

---

## 8. RATE LIMITING IN FRONT OF THE SCHEDULE ROUTES

All of it lives in `proxy.ts`, which classifies the path and picks a bucket. `proxy.ts:27-31`:

```ts
const isCustomerEvents = (p: string) => p === '/api/events'
const isStrictPublic = (p: string) =>
  p === '/api/discovery' || p.startsWith('/api/discovery/')
const isGeneralPublic = (p: string) =>
  p === '/trucks' || p.startsWith('/trucks/')
```

**So the schedule page itself IS limited** — `/trucks/<slug>` matches `isGeneralPublic`.

### The limits, quoted from `lib/ratelimit.ts`

```ts
export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  analytics: true,
  prefix: 'vf_rl',
})
```

```ts
export const strictRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '1 m'),
  analytics: true,
  prefix: 'vf_rl_strict',
})
```

```ts
export const eventsRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(600, '1 m'),
  analytics: true,
  prefix: 'vf_rl_events',
})
```

| Tier | Limit | What it covers | Key |
|---|---|---|---|
| **GENERAL** | **60 / minute** | `/trucks` and `/trucks/*` — **the schedule page and the directory** | IP |
| **STRICT** | **3 / minute** | `/api/discovery` and `/api/discovery/*` | IP |
| **EVENTS** | 600 / minute | `/api/events` only | `IP:truckSlug` (`proxy.ts:136-138`) |

### 🔴 The finding an embed decision turns on

**The schedule page's data comes from the STRICT bucket.** `hooks/useVillageData.ts:34`:

```ts
        const res = await fetch(`/api/discovery/events?t=${Date.now()}`, {
```

`/api/discovery/events` matches `isStrictPublic`, so **each page load spends one GENERAL token (of 60)
and one STRICT token (of 3) per minute per IP.** A fourth schedule-page load from the same address
inside a minute fails its data fetch and lands on the retry card at `TruckClient.tsx:255-270`.

⚠️ **And the operator bypass does not help.** `proxy.ts:119`:

```ts
  const operatorBypass = (hasBearer || hasOperatorSession) && !isStrict
```

`&& !isStrict` — deliberately, per the comment at `:109-118`: *"a forged or stolen credential must not
unlock the bulk feed."* Three bypasses do exist (`proxy.ts:123`): `isDev`, `isLoopback`, and that
operator bypass.

⚠️ **`/api/discovery/events` takes no `slug` filter for the schedule page's purposes.** `route.ts:71`
reads a `slug` param, but `useVillageData` does not send one — it fetches the whole feed
(`.limit(1000)` scraped events at `route.ts:89`, `.limit(200)` operator events at `route.ts:227`) and
`TruckClient.tsx:60` filters client-side. **One truck's schedule page downloads every truck's events.**

---

## 9. IFRAME HEADERS

### Nothing anywhere sets them

A repo-wide grep for `x-frame-options`, `frame-ancestors`, `Content-Security-Policy` and `frameguard`
across every `.ts`, `.tsx`, `.js`, `.json` and `.mjs` outside `node_modules` and `.next` returns
**zero hits.**

- **`proxy.ts`** — sets no security headers. Its only response headers are `Content-Type` and
  `Retry-After` on the 429 (`proxy.ts:145-153`).
- **`next.config.ts`** — has **no `headers()` function at all**; the file is 19 lines and contains
  only `serverExternalPackages` and `images.remotePatterns`.
- **`vercel.json`** — has a `headers` block, and it does not contain either header:

```json
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
```

**So: nothing blocks framing today.** Modern browsers do not frame-block by default in the absence of
these headers, so `/trucks/<slug>` is, as far as headers are concerned, already frameable. **I did not
load it in an iframe — this is a read of the header configuration, not an observation of browser
behaviour.**

⚠️ **Worth recording alongside it:** `/trucks/(.*)` already carries **`X-Robots-Tag: noindex,
noarchive`**, so the schedule page is deliberately kept out of search indexes. Whatever that decision
was for, an embed strategy inherits it.

---

## What I could not determine from a read

Listed so nothing above reads as more settled than it is.

1. **Which pageview mode PostHog runs in.** The default expression resolves through a minified
   version-string comparison; I read that capture is not disabled and stopped there (§3).
2. **Whether the SSR/hydration brand flip is visible.** `isHatchGrab()` returning false on the server
   is read from the source; **no page was rendered.**
3. **Whether framing actually works.** No iframe was loaded; §9 is a header-configuration read.
4. **Live column values.** No database was queried. Every default and gate above comes from the
   migration file and the route source.
5. **Whether the Google Sheets CSV in `generateMetadata` still resolves.** The URL is in the file; it
   was not fetched.
6. **`discovery_trucks.order_link_*` truly absent in production.** The migration does not add them and
   no code reads them; **that is a read of the repo, not of `information_schema`.**
