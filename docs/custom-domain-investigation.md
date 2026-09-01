# Custom domain — investigation

**READ ONLY. Nothing was modified, created or deleted except this file.** No migration was written, no
code was changed, nothing was deployed.

**WHICH OF THE THREE I DID: NONE.** No parse, no typecheck, no execution. This was a source read plus
five fetches of Vercel's live documentation. Everything below is quoted from a file on disk or from a
page fetched today; where I could not determine something from a read, it says so in those words.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 0. The three findings that decide whether this is a small feature or a large one

1. 🔴 **EVERY HOST TEST IN THE CODEBASE IS `host.includes('hatchgrab')`, AND EVERY ONE OF THEM
   DEFAULTS TO VILLAGE FOODIE.** `schedule.theirtruck.co.uk` contains neither string, so on an
   operator's own domain the app believes it is Village Foodie — in the root layout's metadata, in the
   discovery API's visibility column, in the client brand helper. There is **no host allowlist
   anywhere** and nothing rejects an unknown host.
2. 🔴 **THE APEX HAZARD IS REAL, UNGUARDED, AND WORSE THAN "THEIR SITE STOPS WORKING".** An operator
   who points their apex at us gets, at `/`, **our Village Foodie consumer discovery map on their own
   domain** — not an error, not their schedule. §6.
3. 🔴 **THE PAGE IS DELIBERATELY UNINDEXABLE AND HAS NO TITLE.** `noindex` in two places, and a
   `<title>` that would resolve to **"Village Foodie"** on their domain. Both are correct for an
   iframe and wrong for a page representing a business. §2, §3.

---

## 1. WHAT SERVES WHAT TODAY

### Every place the request host is inspected

| # | File:line | Code | Runs |
|---|---|---|---|
| 1 | `proxy.ts:87` | `const host = request.headers.get('host') \|\| ''` | **BEFORE** routing — edge middleware |
| 2 | `app/layout.tsx:23` | `const host = headersList.get('host') \|\| ''` | **DURING** render — root `generateMetadata` |
| 3 | `app/contact/page.tsx:38` | `return isHatchGrabHost(headersList.get('host') \|\| '')` | **DURING** render |
| 4 | `app/api/discovery/events/route.ts:73` | `const host = req.headers.get('host') \|\| ''` | **AFTER** routing — inside the API handler |
| 5 | `lib/domain.ts:3` | `window.location.hostname.includes('hatchgrab')` | **AFTER** hydration — client only |
| 6 | `lib/domain.ts:8` | `window.location.hostname.includes('villagefoodie')` | **AFTER** hydration — client only |
| 7 | `app/login/page.tsx:102` | `window.location.hostname.includes('hatchgrab')` | **AFTER** hydration |
| 8 | `app/dashboard/[token]/page.tsx:2775` | `window.location.hostname.includes('hatchgrab')` | **AFTER** hydration |

Plus two helpers in `lib/brand.ts`:

```ts
export function getBrandFromHost(host: string) {
  if (host.includes('hatchgrab')) return BRANDS.HATCHGRAB
  return BRANDS.VILLAGE_FOODIE // default
}

export function isHatchGrabHost(host: string): boolean {
  return host.includes('hatchgrab')
}
```

and its deliberate duplicate on the edge, `proxy.ts:81-82`:

```ts
const isHatchGrab = (host: string) => host.includes('hatchgrab')
```

🔴 **EVERY ONE OF THESE IS A TWO-WAY TEST WITH VILLAGE FOODIE AS THE `else`.** There is no third
answer. A custom domain is not "unknown" to this code — it is **Village Foodie**.

### 🔴 There is no host allowlist and nothing rejects an unknown host

A grep for `allowedHosts`, `knownHost`, `unknown host`, `invalid host` and `hostAllow` across `app/`,
`lib/`, `proxy.ts`, `vercel.json` and `next.config.ts` returns **nothing**. Vercel routes any domain
attached to the project into this app; from that point the app has no opinion about which host it is.

### What would have to change for a third-party host to reach a specific truck's page

**Determined by a read; nothing here exists today.**

1. **A host → truck lookup.** Nothing maps a hostname to a truck. It would be a new column (or table)
   and a lookup on every request — and `proxy.ts` is edge middleware with **no database access
   anywhere in it today**; the one place it deliberately avoids a round-trip is documented at
   `proxy.ts:73-74` (*"Path pattern only — NO database lookup. This runs in edge middleware on every
   request"*). So either the lookup moves out of the proxy, or the proxy gains its first data
   dependency.
2. **A root rewrite keyed on host.** `proxy.ts:370-372` is the only root handler:
   ```ts
   if (pathname === '/' && isHatchGrab(host)) {
     return carrySessionCookies(NextResponse.rewrite(new URL('/landing', request.url)))
   }
   ```
   with the comment above it: *"🔴 EVERY OTHER HOST FALLS THROUGH UNTOUCHED."*
3. **A third branch in every test in the table above**, or a single helper they all defer to. Today
   they are two-way; a custom domain is a third brand state that none of them can express.

---

## 2. THE PAGE ITSELF, JUDGED AS A STANDALONE BUSINESS PAGE

`app/embed/[slug]/page.tsx` renders exactly three things inside a white `<main>`: `TruckIdentity`
(logo or name), `EmbedSchedule` (the event list), `PoweredBy`. That is the whole page.

### 🔴 Missing, and they are omissions rather than decisions

| # | Missing | Evidence |
|---|---|---|
| 1 | **A `<title>`.** The route's metadata sets only `robots` (`page.tsx:48-50`). The root layout's template is `` `%s \| ${siteName}` `` with `default: siteName` (`layout.tsx:35-38`), and `siteName` is `isHG ? 'HatchGrab' : 'Village Foodie'` (`layout.tsx:26`). 🔴 **On the operator's domain the browser tab would read "Village Foodie".** |
| 2 | **Indexability.** `metadata.robots = { index: false, follow: false, nocache: true }` AND `X-Robots-Tag: noindex, noarchive` for `/embed/(.*)` in `vercel.json`. A page at a business's own address that search engines are told to ignore is not a business page. |
| 3 | **A description and a link-preview image.** Neither is set, so a shared link previews as the root layout's Village Foodie defaults (`layout.tsx:40-55`), including `/logos/village-foodie logo-sharing.png`. |
| 4 | **Any way to contact the business.** No phone, no email, no social. The truck profile page has all of these; the embed has none, because inside a frame the surrounding page supplies them. |
| 5 | **A map.** Deliberately excluded from the embed. On a standalone page, "where to find us" without a map is a gap. |
| 6 | **A menu link.** The profile page has one; the embed does not. |
| 7 | **A footer of any kind** — no privacy policy, no terms, no business identity. See §3 for why this is not merely cosmetic. |
| 8 | **A favicon of their own.** The root layout's `manifest.json` is served on every host. |

### ⚠️ Decisions for Dominic, not omissions

- **Whose brand the page wears.** Today: their logo and name at the top, "Powered by HatchGrab" at the
  bottom. On their own domain, is that the right balance, and does "Powered by HatchGrab" stay?
- **Whether it should be indexable at all.** Indexing it competes with their own site for their own
  name — the exact thing `noindex` was added to prevent for the iframe. On a subdomain that reasoning
  weakens but does not vanish.
- **Whether ordering happens on their domain or ours.** See §9 — this is the one that decides whether
  the feature satisfies what is already advertised.
- **Whether the page should carry contact details at all**, or stay deliberately minimal.

**I changed nothing.**

---

## 3. HOST-DEPENDENT BEHAVIOUR — enumerated from the surfaces, worked back

Assumes the intended shape: `schedule.theirtruck.co.uk/` rewritten to the embed route.

| Surface | Today | On the operator's domain |
|---|---|---|
| **Root-layout metadata** (`layout.tsx:21-30`) | `isHG = host.includes('hatchgrab')` | 🔴 **false → Village Foodie.** `siteName` "Village Foodie", `metadataBase` `https://villagefoodie.co.uk`, description "Find local food trucks…". |
| **Page `<title>`** | route sets none | 🔴 Falls back to `default: 'Village Foodie'`. |
| **Canonical / `metadataBase`** | `https://villagefoodie.co.uk` (`layout.tsx:30,33`) | 🔴 Every relative metadata URL resolves against **villagefoodie.co.uk**, not their domain. |
| **OG image** | `/logos/village-foodie logo-sharing.png` | 🔴 Their page previews with the Village Foodie logo. |
| **`X-Robots-Tag`** (`vercel.json`, `/embed/(.*)`) | noindex, noarchive | ⚠️ Header rules are **path-based, host-blind** — so it applies on their domain too, *if* the path is still `/embed/…` after the rewrite. **I could not determine from a read whether Vercel's header rules match the pre-rewrite or post-rewrite path.** |
| **`robots.txt`** (`public/robots.txt`) | static file, no host awareness | 🔴 **Served on every host.** Their domain would serve *our* robots.txt — `Disallow: /api/`, `Disallow: /trucks/`, `Crawl-delay: 10`, and eight AI-crawler blocks. |
| **Order-link destination** (`TruckListCard.tsx:145`) | `/trucks/${slug}/order?event_id=…` — **relative** | ⚠️ Resolves against **their** domain → `schedule.theirtruck.co.uk/trucks/<slug>/order`. That route exists in this app, so it would render — **on their domain, with our order page and Stripe on it.** Whether that is desirable is §9's question, not an accident to fix. |
| **Order link `target`/`rel`** | `_blank` + `noopener noreferrer` when `openOrderInNewTab` (Stage 1b) | ⚠️ Set only by the embed's `EmbedSchedule`. A custom-domain page reusing that component inherits the new tab — **on a standalone page a new tab is probably wrong**, since there is no frame to escape. |
| **Venue name** | plain text when `plainVenueName` (Stage 1b) | Same — inherited, and on a standalone page a venue link might be *wanted*. |
| **"Powered by HatchGrab"** (`page.tsx:252`) | hardcoded `https://hatchgrab.com`, `target="_blank"` | ✅ Absolute, so it works. It is the **only** correct-by-accident absolute URL on the page. |
| **Fallback link** (`page.tsx:42`, used in the denial path) | `process.env.NEXT_PUBLIC_HATCHGRAB_URL \|\| 'https://www.hatchgrab.com'` | ✅ Absolute — sends them to hatchgrab.com, which is right for a lapsed embed and **arguably wrong on their own domain**, where it advertises us on their address. |
| **Truck logo** | `${NEXT_PUBLIC_SUPABASE_URL}/storage/…` | ✅ Absolute, host-independent. |
| **`/api/embed/events`** | called relatively from `EmbedSchedule.tsx:31` | ⚠️ Resolves against their domain. The route exists, so it answers — **but see §5 for the rate-limit consequence.** |
| **PostHog** (`app/providers.tsx`) | init guarded by `window.location.pathname.startsWith('/embed')`; provider guarded by `usePathname()` | 🔴 **BOTH GUARDS READ THE PATH, NOT THE HOST.** On `schedule.theirtruck.co.uk/` the browser path is `/`, so **neither guard fires and PostHog initialises** — setting `localStorage+cookie` on the operator's own domain, with autocapture on their visitors, with no consent gate. **This is the single most consequential item in this table.** ⚠️ Whether `usePathname()` returns the pre- or post-rewrite path is **not determined by a read** — but the module-scope guard reads `window.location.pathname`, which is unambiguously the browser's `/`. |
| **Auth / session cookies** | `proxy.ts` refreshes the Supabase session on every matched request | ⚠️ The matcher (`proxy.ts:391-395`) is path-based and host-blind, so the session refresh runs on their domain too. Cookies are set for **their** host. Whether an operator session leaks across is **not determined by a read** — Supabase cookie domain behaviour was not traced. |
| **`isHatchGrab()` client helper** | `lib/domain.ts:3` | Returns **false** → any component using it takes the Village Foodie branch. |
| **Discovery API visibility** | `route.ts:73-76`, `showCol = isHG ? 'show_on_hg' : 'show_on_vf'` | 🔴 A request from their domain reads **`show_on_vf`** — a column `provision-truck` sets **false** for new trucks. Not used by the embed's own endpoint, but any reuse of the discovery feed on that host would silently apply the wrong visibility. |
| **Operator-route redirect** (`proxy.ts:93-99`) | only when host is exactly `villagefoodie.co.uk`/`www.` | ⚠️ **Does not fire.** `schedule.theirtruck.co.uk/dashboard` would **render the operator dashboard on their domain** rather than redirecting to hatchgrab.com. |
| **The root** (`proxy.ts:370-372`) | rewrite to `/landing` only when host includes `hatchgrab` | 🔴 See §6. |

---

## 4. PROVISIONING — from Vercel's current documentation, fetched 27 August 2026

### Adding the domain

> ```http
> POST /v10/projects/{idOrName}/domains
> ```
> Add a domain to the project by passing its domain name… If the domain is not yet verified to be used
> on this project, the request will return `verified = false`, and the domain will need to be verified
> according to the `verification` challenge via `POST /projects/:idOrName/domains/:domain/verify`.

Body: `name` required. Response required fields: `apexName`, `name`, `projectId`, `verified`, plus:

> `verification`: *"A list of verification challenges, one of which must be completed… If
> `verification.type = TXT` the `verification.domain` will be checked for a TXT record matching
> `verification.value`."*

⚠️ **`409` is the one to plan for**: *"The domain is already assigned to another Vercel project"* /
*"Cannot create project domain since owner already has `domain` on their account, but it's not
verified yet."* An operator whose agency already hosts them on Vercel hits this.

### What verification requires

From *Adding & Configuring a Custom Domain*:

> - **If the domain is in use by another Vercel account**, you will need to verify access to the
>   domain, with a **TXT** record
> - If you're using an **Apex domain** (e.g. example.com), you will need to configure it with an **A**
>   record
> - If you're using a **Subdomain** (e.g. docs.example.com), you will need to configure it with a
>   **CNAME** record

> You can configure **subdomains** with a **CNAME** record. Each project has a unique CNAME record
> e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com`.

✅ **A subdomain needs ONE CNAME and no nameserver change** — the operator's existing website keeps
working untouched. That is the property that makes this feature viable at all.

⚠️ Wildcards are a different animal: *"If using your custom domain as a wildcard domain, you **must
use the nameservers method for verification**."* — so `*.hatchgrab.com`-style tenancy is not what this
is; each operator domain is added individually.

### Certificates

From *Working with SSL Certificates*:

> Vercel will automatically try to generate a certificate for every domain once it is added to a
> project… However, it will only work once the certificate validation request is successful, which
> happens once DNS records are added and propagated.

> Vercel uses LetsEncrypt for certificates. For all non-wildcard domains, we use the HTTP-01 challenge
> method and providing the request can make it to Vercel, then our infrastructure will deal with it.

> The `/.well-known` path is reserved and cannot be redirected or rewritten.

⚠️ **That last line is a live constraint on `proxy.ts`.** Its matcher currently excludes only
`_next`, `favicon.ico`, `apple-touch-icon.png`, `logos`, `photos`, `sw.js`, `manifest.json` and
`offline.html` — **`/.well-known` is NOT excluded**, so the proxy runs on it today. Nothing in the
proxy rewrites that path, so I have no evidence of a present problem; it is a constraint any future
host-based rewrite must respect or **certificate issuance and renewal break**.

### States a domain can be in

`GET /v6/domains/{domain}/config` returns, as required fields:

> `configuredBy`: *"How we see the domain's configuration. - `CNAME`: Domain has a CNAME pointing to
> Vercel. - `A`: Domain's A record is resolving to Vercel. - `http`: Domain is resolving to Vercel but
> may be behind a Proxy. - `dns-01`: Domain is not resolving to Vercel but dns-01 challenge is
> enabled. - `null`: Domain is not resolving to Vercel."*
> `misconfigured`: *"Whether or not the domain is configured AND we can automatically generate a TLS
> certificate."*
> plus `acceptedChallenges`, `recommendedIPv4`, `recommendedCNAME`.

So the observable states are the product of **`verified`** (from the project-domain endpoint) and
**`misconfigured` / `configuredBy`** (from the config endpoint): *added but unverified* · *verified
but not resolving* (`configuredBy: null`) · *resolving but misconfigured* · *serving*.

### Credentials, and where they would have to live

- **A Vercel bearer token** with project-domain write scope, plus the **project id** and, since this is
  a Team account, the **`teamId`**.
- 🔴 **SERVER-SIDE ONLY, AND NOT `NEXT_PUBLIC_*`.** A token that can add domains to the project can
  also point domains at it and read project configuration. Every existing secret in this repo follows
  that convention (`SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`); this must too.
- ⚠️ **It cannot live in `proxy.ts`.** Edge middleware runs on every request and has no business
  holding a project-administration credential.
- ⚠️ **Blast radius is worth stating before anyone creates one:** it is a credential that can modify
  the deployment that serves both brands, and it would be exercised by an operator-triggered action.

---

## 5. RATE LIMITING AND ROUTING ON AN UNKNOWN HOST

`proxy.ts:27-49`, the whole classification:

```ts
const isCustomerEvents = (p: string) => p === '/api/events'
const isStrictPublic = (p: string) =>
  p === '/api/discovery' || p.startsWith('/api/discovery/')
const isGeneralPublic = (p: string) =>
  p === '/trucks' || p.startsWith('/trucks/')
const isEmbedPublic = (p: string) =>
  p === '/embed' || p.startsWith('/embed/') || p.startsWith('/api/embed/')
```

and the scope, `proxy.ts:117-118`:

```ts
  const isEmbed = isEmbedPublic(pathname)
  const inLimitedScope = isStrict || isEvents || isEmbed || isGeneralPublic(pathname)
```

🔴 **EVERY PREDICATE TAKES ONLY `pathname`. RATE LIMITING IS ENTIRELY HOST-BLIND.**

**So for a request arriving on an unknown host:**

- **`schedule.theirtruck.co.uk/`** → matches **none** of the four → `inLimitedScope` is false → 🔴
  **not rate limited at all.** The page an operator's every visitor loads would be the one public
  surface with no limiter.
- **`schedule.theirtruck.co.uk/api/embed/events?slug=…`** → matches `isEmbedPublic` → **the embed
  bucket applies**, 600/min keyed `${ip}:${slug}` via `embedSlug(pathname, searchParams)`
  (`proxy.ts:45-49`). ✅ The data call is covered; the page is not.
- **`schedule.theirtruck.co.uk/trucks/<slug>/order`** → matches `isGeneralPublic` → GENERAL, 60/min
  per IP, **shared with our own discovery pages**. ⚠️ So an operator's checkout traffic would draw
  from the same bucket as villagefoodie.co.uk browsing.

**Would the embed bucket apply?** ✅ **Yes, but only to the paths that still begin `/embed` or
`/api/embed`.** If a custom domain serves at `/`, the page itself escapes the bucket unless the
classification gains a host term — which today it has no way to express.

---

## 6. 🔴 THE APEX HAZARD — nothing stops it, and the failure is worse than "their site breaks"

**Confirmed: nothing today would stop an operator pointing their apex at us.**

- The Vercel API's `POST /v10/projects/…/domains` takes any `name`; apex versus subdomain is only a
  difference in which DNS record the operator then creates (**A** versus **CNAME**).
- Nothing in this repo inspects a hostname's shape. There is no allowlist (§1) and no apex check.
- 🔴 **And the result is not an error page.** `proxy.ts:370-372` rewrites `/` to `/landing` **only**
  when the host includes `hatchgrab`; its own comment says *"🔴 EVERY OTHER HOST FALLS THROUGH
  UNTOUCHED."* So `theirtruck.co.uk/` would fall through to `app/page.tsx` — **the Village Foodie
  consumer discovery map, showing every truck in the network, on their domain.** An operator who
  mis-followed the instructions would replace their homepage with a competitor listing.

**What the guard would have to be** — described, **not built**:

1. **Refuse an apex at the point of entry**, before calling Vercel: a submitted name must have at
   least one label more than its registrable domain. ⚠️ **That test is not trivially correct** —
   `theirtruck.co.uk` has three labels and is an apex, so a label count alone fails on every ccTLD
   with a second level. It needs the public suffix list, which is a dependency this repo does not
   have. **Stated because it is the part most likely to be got wrong.**
2. **Refuse it again on the way out**, in whatever host→truck resolution is built: a host that
   resolves to no truck must return a deliberate response, not fall through to `app/page.tsx`.
3. ⚠️ **Both, not either.** The first is the good error message; the second is what holds when someone
   adds a domain through the Vercel dashboard by hand and bypasses the first entirely.

---

## 7. WHAT BREAKS SILENTLY

| # | Failure | Detected today? | What a check would have to look at |
|---|---|---|---|
| 1 | **DNS moved or deleted** | ❌ Nothing | `GET /v6/domains/{domain}/config` → `configuredBy: null` means *"Domain is not resolving to Vercel"*. ✅ **A scheduled lookup catches this without a visitor.** |
| 2 | **Certificate not renewed** | ❌ Nothing | Same endpoint: `misconfigured` is *"Whether or not the domain is configured AND we can automatically generate a TLS certificate"*. ✅ **Catchable on a schedule.** 🔴 **And it is the worst of these to a visitor** — a browser interstitial saying the site is unsafe, on the operator's own domain, with our name nowhere in sight. |
| 3 | **Domain expired** | ❌ Nothing | DNS stops resolving → same `configuredBy: null` signal, plus a registrar WHOIS/RDAP expiry lookup would give **advance** warning rather than post-hoc detection. ✅ Catchable on a schedule; the only one where a check can warn **before** it breaks. |
| 4 | **Truck deleted** | ⚠️ Partly | `lib/delete-truck.ts` performs a cascade; **whether it would remove a domain row is unknowable — no such row exists.** 🔴 **The domain would remain attached to the Vercel project after the truck was gone**, serving something or nothing on a live domain. A check would compare attached project domains against live truck rows. ✅ Schedulable, and it is a **reconciliation**, not a DNS lookup. |
| 5 | **Plan lapsed** | ✅ **Yes — by construction, and it already behaves well.** `canAccess(plan, 'embed_schedule', …)` is re-evaluated on every render (`app/embed/[slug]/page.tsx`), and the denial path renders the truck's name and a link rather than a 404 or a blank. ⚠️ **But nobody is told.** The operator finds out from a customer. A check would read plan + expiry against the set of trucks with a live domain. |
| 6 | **Opt-in switched off** | ✅ Same path as 5 | Same. |
| 7 | 🔴 **The stamp cannot distinguish 1–6 from health** | ❌ | `trucks.embed_last_seen_at` **fires on the fallback path too** (§35 of the manual, proven in two cases). So a lapsed truck whose every visitor sees the fallback looks perfectly healthy. **Any monitor built on that column alone would report all of 5 and 6 as fine.** |

**A scheduled DNS/config lookup catches 1, 2 and 3 without waiting for a visitor**, and 4 by
reconciliation. **5 and 6 are invisible to DNS entirely** — they are database state, and need a
different check. That split is the design constraint.

---

## 8. WHAT THE EMBED WORK GIVES US — honestly

| Piece | Reusable? | Why |
|---|---|---|
| **The route** (`/embed/[slug]`) | ✅ **Directly.** It is the page. | Chrome-free single-truck schedule is exactly what a custom domain serves. |
| **The plan gate** (`embed_schedule` + `canAccess`) | ✅ **Directly**, and the graceful denial path is already right. | Same Max tier; §7 row 5. |
| **The opt-in flag** (`trucks.embed_enabled`) | ⚠️ **Mechanism yes, meaning no.** | It means "iframe embed is on". A truck could reasonably want a domain and not an iframe, or the reverse. Reusing it conflates two products; a second flag is the honest shape. |
| **The stamp** | ⚠️ **Half.** `embed_last_seen_at` reusable. 🔴 **`embed_last_referer` is iframe-specific and would be dead** — on a custom domain there is no parent document, so the Referer is empty or an internal navigation. The wizard's *"it loaded on X just now"* confirmation loses its evidence. |
| **The wizard** | ⚠️ **Mostly not.** Its spine — pick a builder, follow steps, copy the schedule box, paste it — is entirely about getting markup into someone else's page. A domain wizard is: type a subdomain → we call Vercel → show one CNAME → poll until it serves. **Reusable: the address input, the plan gate, the escape-hatch email pattern, and the polling-verification pattern.** |
| **The platform records** | 🔴 **Entirely dead.** | Their builder is not involved at all. Every field — fingerprints, steps, plan requirement, order-button state — describes a builder we would no longer touch. |
| **Detection** (`detect_platform`) | 🔴 **Dead**, except the SSRF fence, which is a reusable pattern rather than reusable code. |
| **The link version** | ⚠️ **Conceptually dead here** — the domain *is* the link. It stays valuable as the lapsed-plan fallback the route already renders. |

### What would be dead code if the embed were never shipped

**Most of Stages 2, 2b and 2c**: the platform records, the picker, the plan-requirement screen and its
pre-question, `detect_platform`, `scheduleBox()`, `embed_last_referer`, `trucks.embed_plan_answer`,
and `TruckListCard`'s `openOrderInNewTab` and `plainVenueName` props.

**What survives regardless**: the route, the plan gate, the opt-in mechanism, the last-seen stamp and
its throttle, the graceful denial path, and the four §35 invariants — which are knowledge rather than
code and are the most durable thing the workstream produced.

---

## 9. 🔴 THE MARKETING ROW — and a subdomain does NOT satisfy it as written

Verbatim, `lib/plan-features.ts`:

```ts
      // 🔴 THE PAGE IS SERVED AT THEIR ADDRESS. IT IS NOT AN EMBED. The detail deliberately avoids
      // "built into your site", "embedded" and "inside your website" — none of those is what this is,
      // and a marketing string that promises an embed is a promise the product would have to keep.
      // ⚠️ NOT THE QR CODE AND NOT THE ORDER LINK, both of which operators already have on every plan
      // ('QR code' → qr_menu above). Those point AT our address; this one IS theirs.
      { name: 'Order page on your own website', detail: 'Your ordering page available at your own web address, under your own name.', starter: false, pro: false, max: 'coming_soon' },
```

**What it promises:** an **ordering page**, at **their** web address, under **their** name.

**Does serving the embed route on a subdomain satisfy it?**

| Clause | Satisfied? |
|---|---|
| *"at your own web address"* | ✅ Yes — `schedule.theirtruck.co.uk` is theirs. |
| *"under your own name"* | ⚠️ **Partly.** Their logo and name lead the page, but the tab would read "Village Foodie" (§2), the link preview would carry the Village Foodie logo (§3), and "Powered by HatchGrab" sits at the foot. |
| *"Your **ordering** page"* | 🔴 **NO.** The embed route renders a **schedule**. Its Order buttons deep-link to `/trucks/<slug>/order`, and the ordering — including card entry — happens on **our** address. Serving the schedule at their address does not put their *ordering page* there. |

🔴 **So the row is not satisfied by a subdomain serving the embed route.** To satisfy it as written,
the **order page** must also serve on their host — which pulls Stripe, the customer PII surfaces and
`/api/orders/submit` onto an operator-controlled domain, and turns this from "serve one chrome-free
page elsewhere" into a multi-tenant hosting question.

⚠️ **The comment is doing real work and should be read before any scoping decision:** it says
explicitly *"THE PAGE IS SERVED AT THEIR ADDRESS. IT IS NOT AN EMBED"* — so this row was **always**
about this feature and never about the iframe. The iframe was built alongside it, not as it.

✅ **The row is `'coming_soon'` and has no `ROW_FEATURE_MAP` entry** — verified: the map's 24 keys do
not include it. So the parity checker skips it, and renaming or re-scoping it costs nothing today
(§4 of the manual).

---

## 10. What I could not determine from a read

Listed so nothing above reads as more settled than it is.

1. **Whether Vercel's `vercel.json` header rules match the pre- or post-rewrite path.** This decides
   whether `X-Robots-Tag: noindex` would follow the page onto a custom domain. §3.
2. **Whether `usePathname()` returns the pre- or post-rewrite path** for a middleware rewrite. It
   decides half of the PostHog question; the module-scope guard's answer is unambiguous either way.
3. **Whether Supabase auth cookies would be scoped to a custom host** — the cookie-domain behaviour of
   `@supabase/ssr` was not traced.
4. **What `lib/delete-truck.ts` would do about a domain row**, because no such row exists to trace.
5. **Nothing was executed and nothing was rendered.** No domain was added, no Vercel API call was
   made, no page was loaded on any host. Every host-behaviour claim is read from source.
6. **Vercel's certificate *renewal* timing** — the SSL page defers to a knowledge-base article I did
   not fetch. I have quoted issuance, not renewal cadence.
