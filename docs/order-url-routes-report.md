# /o/ decider + customer-order-URL surface — diagnosis

**Diagnosis only. No file changed, no deploy, no write.** All DB reads were `SELECT`s via the service-role key; the live checks were anonymous GETs.

## 🔴 FLAG — a premise in the prompt is incorrect
"There is no custom-domain column on `trucks` and no domains table" is **false**. The custom-domain config **is** stored as **columns on `trucks`**, and `redirect-target.ts` reads them directly (confirmed present on the live table — 9 trucks, all active). No separate domains table is involved. This changes the answer to item 1 and is load-bearing for item 3.

---

## Headline
**The `/o/<slug>` decider currently does NOTHING for any truck — it redirects 100% of trucks to `/trucks/<slug>/order`.** `custom_domain` is set on **0 of 9** trucks, so condition 1 fails for every truck and `customDomainFor` returns `null` every time (it fails toward our own page by design).

## 1. Where custom-domain config is STORED
**Columns on `public.trucks`** (read in `lib/custom-domain/redirect-target.ts:44-46` via a service-role client). Live probe confirms they exist and are all empty/false-gating:

| column | purpose | set on N/9 trucks |
|---|---|---|
| `custom_domain` | the domain to redirect to | **0** |
| `custom_domain_verified_at` | a machine saw it resolve to us | 0 |
| `custom_domain_confirmed_at` | a person confirmed the page is right | 0 |
| `custom_domain_last_ok_at` | last healthy daily check | 0 |
| `active`, `plan`, `feature_overrides`, `trial_expires_at` | active + plan-gate inputs | 9 active |

Not an env var, not a table, not the Vercel API. (The Vercel API / DNS live in `lib/custom-domain/vercel.ts` + `dns.ts` for *provisioning*; the daily `/api/cron/custom-domain-check` writes `custom_domain_last_ok_at`. The **decider** reads only the `trucks` columns above.)

## 2. The five conditions, verbatim, and their data
From `redirect-target.ts` (the guards, in order; each returns `null` = serve our own page):

```
if (!truck || !truck.active) return null                                              // (0) row + trucks.active
if (!truck.custom_domain) return null                                                 // (1) trucks.custom_domain
if (!truck.custom_domain_verified_at) return null                                     // (2) trucks.custom_domain_verified_at
if (!truck.custom_domain_confirmed_at) return null                                    // (3) trucks.custom_domain_confirmed_at
if (!canAccess(truck.plan, 'embed_schedule', truck.feature_overrides ?? {}, truck.trial_expires_at)) return null   // (4) plan/overrides/trial
const lastOk = truck.custom_domain_last_ok_at ? new Date(...).getTime() : null
if (!lastOk || Date.now() - lastOk > STOPPED_AFTER_MS) return null                     // (5) custom_domain_last_ok_at within cadence
return truck.custom_domain as string
```

- **(1) domain set** → `trucks.custom_domain`.
- **(2) verified** → `trucks.custom_domain_verified_at` (machine resolution seen).
- **(3) confirmed** → `trucks.custom_domain_confirmed_at` (human confirmation — the load-bearing one).
- **(4) plan grants the feature** → `canAccess(plan, 'embed_schedule', feature_overrides, trial_expires_at)`.
- **(5) last check healthy** → `trucks.custom_domain_last_ok_at`, within `STOPPED_AFTER_MS` (derived in `lib/custom-domain/cadence.ts` = `(2 + 0.5) × CHECK_INTERVAL_MS`; the "stopped working" threshold, ~36h). Written by the daily 7am cron.
- (0) precondition: the truck exists and `trucks.active`.

## 3. How many trucks satisfy all five → **ZERO**
`custom_domain` is set on **0 of 9** trucks (and verified/confirmed/last_ok are all 0 too). So **no truck** would be redirected anywhere other than `/trucks/<slug>/order`. **Plainly: zero. The decider is currently a pass-through for every truck.**

## 4. The two QR constructions — both encode `/o/<slug>`
Both are built from one value in `app/dashboard/[token]/page.tsx`:
- `const customerOrderUrl = truck?.slug ? scanUrl(truck.slug, customerUrlBase) : null` — **line 1681**.
- **Manage/dashboard copy-link QR:** `handleCopyOrderLink` copies `customerOrderUrl` (line ~1683).
- **Fullscreen QR (projected at the hatch):** `handleShowQR` → `generateQRWithLogo(orderUrl=customerOrderUrl, …)` — line ~1751/1757.

`scanUrl(slug, origin)` (`lib/custom-domain/copy.ts:276`) = `${origin || NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'}/o/${slug}`. So **both QR codes encode `/o/<slug>`** (e.g. `https://www.hatchgrab.com/o/pizzeria-gusto`). The `customerUrlBase` origin is passed so a **demo** truck keeps the current origin instead of production.

## 5. Every place a customer order URL is constructed (count before renaming)
**Two builders** (`lib/custom-domain/copy.ts`): `scanUrl()` :276 → `/o/<slug>`; `orderPageUrl()` :288 → `/trucks/<slug>/order`.

**Sites that build the path — most INLINE, not via the builders** (these are the silent-skip risk):

| # | File · line | Shape | Via builder? |
|---|---|---|---|
| 1 | `app/dashboard/[token]/page.tsx:1681` (+ copy/QR/DemoWelcome :3283) | `/o/<slug>` | yes (`scanUrl`) |
| 2 | `app/o/[slug]/page.tsx:60` | `/trucks/<slug>/order` (redirect fallback) | inline |
| 3 | `app/api/payments/return/route.ts:132` | `/trucks/<truck>/order` (post-payment return) | inline |
| 4 | `app/api/embed/events/route.ts:~` | `/trucks/<slug>/order` (embed) | inline |
| 5 | `app/api/discovery/events/route.ts:287, 347` | `/trucks/<slug>/order` (VF/discovery order button) | inline |
| 6 | `app/api/admin/provision-demo/route.ts:114` | `/trucks/<slug>/order` | inline |
| 7 | `app/api/admin/create-truck/route.ts:178` | `/trucks/<slug>/order` | inline |
| 8 | `app/api/manage/whatsapp-preview/route.ts:158` | `/trucks/<slug>/order` | inline |
| 9 | `app/api/webhooks/whatsapp/route.ts:81` | `/trucks/<slug>/order` | inline |
| 10 | `app/api/webhooks/meta/whatsapp/route.ts:416, 451` | `/trucks/<slug>/order` | inline |

🔴 **Most sites construct `/trucks/${slug}/order` INLINE, not through `orderPageUrl()`** — so changing the builder alone would leave 8+ call sites encoding the old path with no error (the exact "stale exact-match key skipped silently" trap). `app/compare/CostComparison.tsx:632` is a **code comment**, not a URL — excluded.

**Also, separately (external, in the DB):** `discovery_trucks.order_url` holds each truck's *external* order URL (Hatches Up / own-domain), used by the discovery map; not a hatchgrab `/trucks/…` path, so a hatchgrab-path rename would not touch it — but it is "a customer order URL" and worth listing.

## 6. What is attached to `/trucks/` vs `/o/` (and what a new prefix would NOT inherit)
- **noindex** — `X-Robots-Tag: noindex, noarchive` is set in **`vercel.json` header rules**, scoped per path prefix: separate entries for **`/trucks/(.*)`**, **`/o/(.*)`**, `/embed/(.*)` and `/api/(.*)`. Confirmed live: both `/o/pizzeria-gusto` and `/trucks/pizzeria-gusto/order` return `x-robots-tag: noindex, noarchive`. `/o/` **also** carries route-level `metadata = { robots: { index:false, follow:false } }` (`app/o/[slug]/page.tsx:38`) — belt-and-braces.
- **rate limiting** — **`proxy.ts`** (the request interceptor) `isGeneralPublic(p)` = `p === '/trucks' || p.startsWith('/trucks/') || p === '/o' || p.startsWith('/o/')` (lines 38-39) → **GENERAL tier, 60/min** (`lib/ratelimit.ts`). The `/o/` line was added **explicitly to preserve the metering** that `/trucks/…/order` already had (comment at :31-33).
- **host scoping** — `proxy.ts`: a custom-host allowlist (`isAllowedOnCustomHost`, `lib/custom-host.ts` — covers the ordering flow + `/trucks` and `/trucks/*`), the villagefoodie→hatchgrab redirect for operator routes, and an `isPublic` list that includes `/trucks` (⚠️ note: `/o` is **not** in that `isPublic` list at :309-316, though it is not protected either).

🔴 **A NEW prefix inherits NONE of these** — each is a per-prefix rule in a different file. A new prefix would NOT inherit: (a) the `vercel.json` `X-Robots-Tag` noindex (needs a new `source` entry), (b) the `proxy.ts` GENERAL rate-limit metering (needs adding to `isGeneralPublic`), (c) the `proxy.ts` host-scoping/allowlist behaviour. **This is exactly the V11.51 incident** — moving the scan target to `/o/` silently dropped noindex + rate-limiting until both were restored per-prefix.

## 7. PROPOSAL — serve customers from ONE URL, decider behind it (no change made)
**Today's reality makes the one-URL move low-risk:** 0 trucks have a custom domain, provisioning has never completed (hosting creds unset per the manual), so `/o/` is a pure pass-through right now.

**Recommended shape — collapse to `/trucks/<slug>/order`, keep `/o/` only as a permanent shim:**
1. Point **all QR/link builders at `/trucks/<slug>/order`** — change `scanUrl` (or the dashboard's `customerOrderUrl`) to use `orderPageUrl(slug)`. Because staying **inside `/trucks/`**, the page keeps its `vercel.json` noindex and `proxy.ts` rate-limit with **no new prefix** to wire — the item-6 trap is avoided by construction.
2. **Keep `/o/<slug>` alive as a permanent redirect to `/trucks/<slug>/order`** so any already-printed `/o/` codes still resolve (verify with the operator whether any were printed since V11.51; the manual recorded "no codes printed" then).
3. **Do NOT reintroduce a redirect in `app/trucks/[slug]/order/layout.tsx`.** V11.51 documents why "decider behind the serving URL" cannot live in that layout: a Next 16 layout receives only `params`+`children` (no `searchParams`) and does not re-render on client nav, so it **cannot** tell an inbound scan from a customer returning to buy — that is the exact cycle bug that stranded orders. A page-level `searchParams` check could technically redirect, but redirecting after render is poor UX and still needs a scan-vs-return marker.

**Work:** update the QR/link source (1 builder + the ~8 inline sites in §5 if the path scheme itself changes; only the QR source if merely repointing `/o/`→`/trucks/…/order`); keep `/o/` as a 307/308 shim; update the copy that names both addresses (`lib/custom-domain/copy.ts`).
**Risks:** (a) if a truck ever completes a custom domain later, customers scanning would land on the hatchgrab order page rather than the operator's own domain (acceptable — they can still order; the custom-domain *redirect* is what's being retired, not the domain); (b) any printed `/o/` codes break **unless** the shim (step 2) is kept; (c) reintroducing the decision into the serving layout re-opens the V11.51 cycle — must not be done.
**PROPOSAL ONLY — nothing changed.**

---

**GARBLED SPANS: none** (but see the FLAG at the top: the "no custom-domain column" premise is factually wrong).

*2026-09-04. Diagnosis only.*
