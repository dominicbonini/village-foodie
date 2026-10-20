# SEO and international audit — hatchgrab.com (UK and US)

**Workstream:** seo-international-audit · **Date:** 20 October 2026 · **Read-only:** no code, config or data changed.
**Branch:** main (with the uncommitted Stage A2 work in the tree).

## 0. What I executed vs read

**Executed (read-only):**
- `curl` GETs against your local server, `http://hatchgrab.localhost:3000` (HatchGrab host) and `http://localhost:3000` (any host without "hatchgrab" acts as the Village Foodie host). Paths:
  - `/`, `/landing`, `/features`, `/compare`;
  - `/uk`, `/us`, `/uk/features`, `/us/features`, `/uk/compare`, `/us/compare`, `/gb`;
  - `/privacy`, `/terms`, `/country-terms`, `/contact`, `/signup`, `/login`, `/hire`;
  - `/sitemap.xml`, `/robots.txt`.

  I also sent `/uk` with the `hg_country` cookie and the `x-vercel-ip-country` header set to US and to GB, and requested `/?country=US`. I parsed the HTML for title, description, canonical, hreflang, robots, Open Graph, Twitter, JSON-LD, h1, `<img>` and the inline RSC payload.
- `curl` GETs against **production**: `https://www.hatchgrab.com` `/`, `/uk`, `/us`, `/features`, `/uk/features`, `/landing`, `/sitemap.xml`, `/robots.txt`; the response headers of `/` and `/uk`; the apex `https://hatchgrab.com/`; and `/` with a Googlebot user-agent string.
- **US-switched-ON rendering:** the US is switched OFF in the live `country_settings`, so `/us…` redirects today. For the US-on view I read the committed harness capture `scripts/fixtures/plans-data-model-before/pages.json.gz`. It holds the landing, /features and /compare HTML and merged metadata for GB and US with the US switched on, rendered by the real page modules. `scripts/plans-data-model.cjs` proves the current tree renders these byte-identically. I diffed GB against US text from it.
- `git log -S` on the proxy matcher.

**Read:** `proxy.ts`, `lib/marketing-country.ts`, `lib/marketing-meta.ts`, `lib/visitor-country.ts`, `app/[country]/*`, `app/landing/page.tsx`, `app/features/page.tsx`, `app/compare/page.tsx`, `app/layout.tsx`, `app/sitemap.ts`, `public/robots.txt`, `vercel.json`, `components/landing/CountryMenu.tsx`, `LandingNav.tsx`, `LandingFooter.tsx`, `components/landing/FeatureComparison.tsx`, the legal, contact, signup, login and hire page heads, and image sources in `public/`.

**Not run:** any SQL (none was needed), Lighthouse or a real browser (no Core Web Vitals field or lab numbers; the CWV notes in §8 are risks visible from the HTML, headers and code), and Google Search Console.

## 1. URL structure

| Item | Today | Where |
|---|---|---|
| Country routes | `app/[country]/page.tsx`, `app/[country]/features/page.tsx`, `app/[country]/compare/page.tsx`. Each re-exports the shared page module (no copies), with `dynamicParams = false` and force-dynamic. | `app/[country]/page.tsx:13-20` (same in `features/`, `compare/`) |
| Slugs | **`/uk`** and **`/us`**, not `/gb`; `/gb` is 404 (executed). Lower case only. The ISO code stays GB internally. | `lib/marketing-country.ts:26` (`COUNTRY_PATH_SEGMENTS = { GB: 'uk', US: 'us' }`) |
| Root | `hatchgrab.com/` is a **302** router to the visitor's country page: `/` → `/uk` (executed, local and production). `/landing`, `/features`, `/compare` and the unlisted preview do the same, to the matching country page. | `proxy.ts:504-517`, `lib/marketing-country.ts:42` (ROUTER_PATHS), `:94` (marketingRedirect) |
| How the root decides | `?country=XX` → the `hg_country` cookie → `x-vercel-ip-country` (IP) → GB, choosing only among switched-on countries that have an address. **Accept-Language is not used.** The query `?country` is remembered in the cookie for a year. | `lib/marketing-country.ts:75-82` (pickMarketingCountry), `proxy.ts:508-515` |
| Crawlers | No special treatment. A Googlebot user-agent gets the same 302 (executed on production). | `proxy.ts:471` (comment), executed |
| Do country pages redirect or rewrite by IP or cookie? | **No.** A switched-on country page renders its ADDRESS's country whatever the cookie or IP. Executed: `/uk` with cookie and IP set to US still renders "HatchGrab UK" with canonical `/uk`. | `lib/visitor-country.ts:82-110` (resolveCountryPage reads no cookie, IP or query) |
| …except a switched-OFF country | `/us`, `/us/features` and `/us/compare` **302 to the UK page while the US is switched off** (executed, local and production). This breaks your rule "country pages never redirect" until the US is switched on; then they render. GB's pages never redirect (GB is the floor). | `lib/marketing-country.ts:94-120`, `proxy.ts:504-506` |
| Apex | `https://hatchgrab.com/` → **307** to `https://www.hatchgrab.com/` (executed). That is temporary; it should be permanent (301 or 308). This is the Vercel domain setting, not code. | production response |
| Other hosts | On villagefoodie.co.uk: `/uk`, `/us`, `/features` and `/compare` are 404, and `/landing` 308s to its root (executed on the local VF host). Custom operator domains return before the router. | `proxy.ts:519-528`, `lib/visitor-country.ts:93` |

## 2. hreflang

| Page | hreflang today (executed / captured) | Verdict |
|---|---|---|
| `/uk` (US off, live) | `en-GB` → `/uk` (self), `x-default` → `https://www.hatchgrab.com` | Correct for one country. |
| `/uk`, `/us` (US on, capture) | Both carry `en-GB` → `/uk`, `en-US` → `/us`, `x-default` → `/` | **Self-referencing and reciprocal ✔** |
| `/uk/features`, `/us/features` | The same pattern; x-default → `/features` | ✔ |
| `/uk/compare`, `/us/compare` | The same pattern; x-default → `/compare` (and the page is noindex) | ✔ (hreflang on a noindex page is harmless) |
| Pricing anchor (`/uk#pricing`) | An anchor, not a URL, so hreflang does not apply | n/a |
| `/privacy`, `/terms`, `/country-terms`, `/contact`, `/signup`, `/login` | **None.** They are single, country-neutral pages. | Fine for one language, but they also lack a canonical (§3). |

**Where it is built:** `lib/marketing-meta.ts:33-40` (countryPageAlternates), used by `app/landing/page.tsx:85-140`, `app/features/page.tsx:54-81` and `app/compare/page.tsx:68-80`.
- **Codes** are each country row's `locale`: exactly `en-GB` and `en-US`.
- **x-default** is the router address.
- **Placement:** only in `<head>` (`<link rel="alternate" hrefLang>`). The sitemap carries no `xhtml:link` alternates. Head-only is valid.
- **Switched-off countries** are left out of hreflang (correct: their address redirects).

⚠️ `<html lang>` is hardcoded `"en"` on every page (`app/layout.tsx:149`), not `en-GB` or `en-US`. It is not a ranking signal for Google, but it is what screen readers, Bing and translation tools read.

## 3. Canonicals

- **Country pages are self-canonical** and never point at another country (executed and captured):
  - `/uk` → `https://www.hatchgrab.com/uk`, `/us` → `/us`;
  - `/uk/features` → itself, `/uk/compare` → itself.

  One host (www) throughout, from `HATCHGRAB_ORIGIN` (`lib/marketing-country.ts:33`).
- **No canonical** on `/privacy`, `/terms`, `/country-terms`, `/contact`, `/signup`, `/login` or `/hire` (executed). Their `og:url` is the site root, `https://www.hatchgrab.com`: the root layout's default (`app/layout.tsx:61-71`), not the page's own address.
- **Host clash (shared deployment)** — executed on the local Village Foodie host:
  - **`/privacy` and `/terms` render the HatchGrab policies on villagefoodie.co.uk too**, titled "Privacy Policy — HatchGrab", indexable, with no canonical. Search engines can index the same document on two domains. Add a canonical to the HatchGrab www URL (or noindex on the VF host).
  - `/contact` on the VF host is titled "Village Foodie", so it is host-branded and is fine.
  - The VF root's `og:url` is `https://villagefoodie.co.uk` (apex) while its sitemap lists `https://www.villagefoodie.co.uk/` (www): a minor host inconsistency on the VF side.
  - `/hire` on the HatchGrab host is titled "Hire a Food Truck | Village Foodie | HatchGrab": a VF page reachable on the HG host with a mixed brand (`app/hire/page.tsx:4-5`).
  - The marketing pages (`/uk…`) are 404 on the VF host, so there is no clash there ✔.

## 4. Sitemap and robots

**Sitemap** (`app/sitemap.ts:47-63`; executed locally and on production): it lists `https://www.hatchgrab.com/uk` and `/uk/features` only.
- The US addresses are listed automatically once the US is switched on (the same function). `/`, `/features` and `/compare` are deliberately left out, as redirects or noindex ✔.
- **No `xhtml:link` alternates** in the sitemap. That is optional, since the head carries them.
- **`lastmod` is `new Date()` on every request**, so it always says "changed now". Google learns to ignore an always-current lastmod. It should be a real content date.
- **Not listed:** `/privacy`, `/terms`, `/country-terms`, `/contact` (indexable pages). That is optional, but they are real pages.

**robots.txt** (`public/robots.txt`, static):
- It blocks AI crawlers, `/api/` and `/trucks/` for everyone, sets `Crawl-delay: 10` (Google ignores it; Bing obeys it and crawls slower), and gives `Sitemap: https://www.hatchgrab.com/sitemap.xml`.
- **It is one static file for both hosts:** villagefoodie.co.uk/robots.txt also points at the HatchGrab sitemap. The comment in it says the sitemap is host-aware, but robots.txt itself is not (Next serves `public/` as-is).
- **Nothing important to HatchGrab marketing is blocked** ✔.
  - `X-Robots-Tag: noindex` is sent only for `/api`, `/trucks`, `/o`, `/order`, `/embed` and `/p` (`vercel.json:8-60`).
  - Because `/trucks/` is also disallowed in robots.txt, Google never fetches those pages and never sees their noindex header. A disallowed URL can still be indexed from links (as a bare URL). That is not a HatchGrab-marketing issue.

**/compare is noindex as intended** ✔:
- `/uk/compare` → `<meta name="robots" content="noindex, nofollow">` (executed);
- `/us/compare` → `robots: {index:false, follow:false}` (capture);
- the bare `/compare` is a 302.

Source: `app/compare/page.tsx:68-80`.

**Unintended indexability:** `/signup` and `/login` have **no robots tag** (so they are indexable), generic `<title>HatchGrab</title>`, and no canonical (executed). Login is normally noindex; signup either noindex or a proper title and description. `/contact` is explicitly `index, follow` ✔.

## 5. Localisation (GB vs US)

**Head tags differ per country** (executed GB; captured US):

| | GB | US |
|---|---|---|
| Landing title | "Food truck & mobile catering ordering system — HatchGrab UK" | "Food truck & catering ordering system — HatchGrab US" |
| Landing description | "…from your **pitch** without the **queue**… UK food trucks and **mobile** catering…" | "…from your **spot** without the **line**… US food trucks and catering…" |
| og:locale / og:url | en_GB, /uk | en_US, /us |
| JSON-LD | inLanguage en-GB, areaServed "United Kingdom" | en-US, "United States" |

The body wording uses the en-US overrides. Words only in GB: collection, hatch, deals, meal, mobile, Pizzeria Gusto testimonial. Words only in US: pickup, spot, spots, window, combos, line, cell, spotty. Currency and fees are localised (£ / $, 20p / 30¢, "authorisation" / "authorization", "enquiries" / "inquiries").

**Prices on the US pages: the risk for launch.**
- The marketing prices are the frozen Stage B display, which reads the retired `country_settings` plan columns. Those are **NULL for the US**, so a live US visitor would see "TBD" for every plan price. The capture shows dollars only because its fixture fills those columns ($39/$59/$99).
- This is the Stage B pricing work: the public pages must move to `plan_prices` before US launch. The /features description also still names "Starter, Pro and Max" and says "Your first month includes everything", while the trial is now 4 months (A2).

**Near-identical text** (normalised visible text, GB vs US, US on, capture):

| Page | Similarity | Note |
|---|---|---|
| `/features` | **98.3%** | Only currency, fees and a few spellings differ. |
| `/compare` | **98.3%** | noindex, so it doesn't matter for search. |
| landing | 93.7% | Wording and testimonial differ. |
| `/privacy`, `/terms`, `/contact` | 100% (one page) | Single country-neutral pages. |

Same-language variants that are near-identical are exactly what hreflang is for: Google picks the right one per country rather than treating them as duplicates. That holds as long as hreflang stays reciprocal (it does) and each page is self-canonical (it is).

`/compare`'s title and description are the generic site defaults ("HatchGrab" / "The food truck management platform") in both countries (`app/compare/page.tsx:68-82` sets none). It is noindex, so this is low priority.

## 6. Structured data

- **Landing:** one `SoftwareApplication` block (`app/landing/page.tsx:271-296`).
  - Fields: name, `applicationCategory: BusinessApplication`, a sub-category, `url`, `description`, `inLanguage`, `areaServed` (per country), a `BusinessAudience`, and `publisher` (Organization, name and url only).
  - ⚠️ **`url` is `https://www.hatchgrab.com/`** (the router) on both countries; it should be the page's own `/uk` or `/us`.
- **No `offers`**, deliberately: the source comment explains that prices were hard-coded in many places and could drift. Since Stage A the prices are data (`plan_prices`), so an `Offer` per plan per currency (GBP on /uk, USD on /us) can now be generated from the same source as the page. It must only describe prices the page actually shows (today the US pages show TBD).
- **`/features`, `/compare`, legal, contact:** no JSON-LD.
- **Missing:** `Organization` with `logo` and `sameAs` (the App Store and Google Play listings, social profiles), `WebSite` (site name), `BreadcrumbList` on /features. **No FAQ content** exists on the pages, so `FAQPage` must not be added.

## 7. Country switcher

**Not crawlable.** `components/landing/CountryMenu.tsx` is rendered in the header (`LandingNav.tsx:151`, hidden below 1024px) and the footer (`LandingFooter.tsx:130`).
- The trigger is a `<button>` (`:82`).
- The country options are `<button role="menuitemradio">` (`:92`) and only exist in the DOM after a click (`{open && (` at `:88`).
- A choice runs `router.push(…)` in JavaScript (`:62-69`).
- Executed: the `/uk` and `/uk/features` HTML contain no link to any other country's page.

With the US on, Google can still find `/us` through the hreflang `<link>` tags and the sitemap. But your rule asks for **real crawlable `<a href>` links**, and today there are none.

## 8. Basics

| Check | Result (executed) | Where |
|---|---|---|
| One h1 | landing 1 ✔, /uk/compare 1 ✔, legal 1 ✔, contact 1 ✔, signup/login 1 ✔. **`/uk/features`: 0** — its page heading is an `<h2>` ("Every feature, side by side.") | `components/landing/FeatureComparison.tsx:78` |
| Image alt | Every `<img>` has an `alt`. The three product screenshots carry descriptive alts; the flags and the Gusto logo carry `alt=""` (decorative — fine). | `/uk` HTML |
| Images | next/image with srcset and `sizes` ✔. **All three hero screenshots are `priority` preloads**, competing for the LCP slot. `customer-order.png` source is 699 KB (1284×2778), served resized. | `/uk` `<link rel=preload>`, `public/screenshots/` |
| HTML weight | `/uk` 161 KB (118 KB inline RSC payload); **`/uk/features` 466 KB (432 KB RSC payload)**; `/privacy` 320 KB (294 KB RSC); `/terms` 339 KB | executed |
| Fonts | **7 woff2 preloads** in the `Link` header of `/uk` (Geist + Geist Mono from the root layout, Archivo, Public Sans, Courier Prime) | production headers; `app/layout.tsx:2-16`, `app/features/page.tsx:119-121` |
| Caching / TTFB | Country pages are force-dynamic and answered `cache-control: private, no-store` with `x-vercel-cache: MISS` (production): every view is a server render with database reads (country settings cached 60 s in-process). The root is a 302 plus a second request. | `app/[country]/*.tsx`, production headers |
| Proxy on static assets | **The matcher's exclusion is mistyped** — `'/((?!_next_next/image|…)'` instead of `_next/static|_next/image` — since 24 May 2026 (`69faf282 login build`). Every `/_next/static/*` and `/_next/image` request runs the proxy, including `supabase.auth.getUser()` (`proxy.ts:324`): cost on every JS, CSS and image request, worse for signed-in operators. | `proxy.ts:535`, `:302-324` |

**Core Web Vitals risks visible here (no lab numbers taken):**
- **LCP:** three competing hero preloads, seven font preloads, an uncached dynamic render, and the root's extra redirect hop.
- **INP and TBT:** the large RSC payload on /features and legal (hydration and parse).
- **CLS:** not observed (images carry width and height).

## 9. Prioritised fix list

Legend:
- **Visible = YES** — it changes something a visitor sees on the page. It needs your mockup sign-off first.
- **SERP** — it changes only what search results or share cards show (wording sign-off, no mockup).
- **No** — invisible.

### Must-fix before US launch

| # | Fix | Files | Visible? |
|---|---|---|---|
| M1 | **Crawlable country switcher.** Make each menu option an `<a href="/us…">` (`switchCountryPath`) that is also in the server HTML. It can stay hidden in the closed menu (CSS), and the click can still set the cookie and navigate. Optionally add a plain "United Kingdom · United States" link row to the footer. | `components/landing/CountryMenu.tsx`, possibly `LandingFooter.tsx`, `app/landing/landing.css` | Menu as `<a>`, same look: **No**. A visible footer link row: **YES** (mockup). |
| M2 | **US prices from `plan_prices`, not the retired columns** (Stage B). Otherwise every US price reads "TBD", including any Offer markup. This includes the /features description ("Starter, Pro and Max", "Your first month…" vs the 4-month trial). | `lib/legacy-pricing-display.ts` (replaced), `app/landing/page.tsx`, `components/landing/FeatureComparison.tsx`, `app/compare/CostComparison.tsx`, `lib/plans-pdf.ts`, messages | **YES** (Stage B mockup) |
| M3 | **Switch the US on**, so `/us…` stop 302-ing and appear in hreflang and the sitemap. This is data (`country_settings.enabled`). It is gated by M2: the trigger already requires `plan_prices` rows, which exist. | data | **YES** (US pages go live) |
| M4 | **Fix the proxy matcher** to `_next/static|_next/image`, so static assets skip the proxy and the session call. | `proxy.ts:535` | No |
| M5 | **JSON-LD `url` = the page's own country address** (`/uk`, `/us`), not the root. | `app/landing/page.tsx:288` | No |

### Should-fix

| # | Fix | Files | Visible? |
|---|---|---|---|
| S1 | **Canonicals on the legal, contact, signup and login pages**, to their www HatchGrab URL; the legal pages' canonical stays HatchGrab even when served on the VF host (or noindex them there). Also a correct `og:url` per page. | `app/(legal)/privacy|terms|country-terms/page.tsx`, `app/contact/page.tsx`, `app/signup/*`, `app/login/*`, `app/layout.tsx` (default og:url) | No |
| S2 | **`/login` noindex**; `/signup` gets a real title and description, or noindex (your call). | `app/login/*`, `app/signup/*` | SERP |
| S3 | **Host-aware robots** (`app/robots.ts` instead of `public/robots.txt`), so the VF host advertises its own sitemap; keep every current rule. | new `app/robots.ts`, remove `public/robots.txt` | No |
| S4 | **`<html lang>` per country** (en-GB / en-US on the country pages; the visitor's or the default elsewhere). | `app/layout.tsx:149` (needs the country from the segment or header) | No |
| S5 | **Sitemap `lastmod`**: a real content date, not request time. Optionally add the indexable legal and contact pages, and `xhtml:link` alternates. | `app/sitemap.ts` | No |
| S6 | **One h1 on /features** (the heading becomes h1 with the same styling). | `components/landing/FeatureComparison.tsx:78` (+ CSS selector) | No if the CSS is kept |
| S7 | **Page weight:** cut the /features and legal RSC payload (pass only the messages or rows a page renders; render the legal markdown server-only); drop to the font weights in use; one `priority` image (the LCP) instead of three. | `app/features/page.tsx`, `components/landing/FeatureComparison.tsx`, `app/(legal)/*`, `lib/legal-markdown.tsx`, `app/landing/page.tsx`, `app/layout.tsx` | No |
| S8 | **Apex → www as a permanent redirect** (308 or 301) instead of 307. | Vercel project domain settings (not code) | No |
| S9 | **Organization schema** with logo and `sameAs` (the app store listings), plus `WebSite`; an `Offer` per plan per currency from `plan_prices` once M2 lands. | `app/landing/page.tsx` (or a small `lib/structured-data.ts`) | No |

### Nice-to-have

| # | Fix | Files | Visible? |
|---|---|---|---|
| N1 | Titles and descriptions for `/compare` (noindex, but shared links show the generic text). | `app/compare/page.tsx` | SERP |
| N2 | `/hire` on the HatchGrab host: brand-correct title, or keep it VF-only. | `app/hire/page.tsx`, `proxy.ts` | SERP |
| N3 | Remove `Crawl-delay: 10` (Bing obeys it; Google ignores it). | `public/robots.txt` / S3 | No |
| N4 | Use Accept-Language as a tie-break after the cookie and before IP, if you want, e.g. a UK visitor abroad. Today IP decides. | `lib/marketing-country.ts:75-82`, `proxy.ts` | No |
| N5 | Consider caching the country pages (ISR or edge cache keyed by path). They no longer depend on the visitor, only on the address, so they could be cached; today they render on every request. | `app/[country]/*.tsx`, `app/landing/page.tsx` | No |
| N6 | VF host: make `og:url` (apex) and the sitemap (www) agree on one host. | `app/layout.tsx`, `app/sitemap.ts` | No |

### What is already right

- One domain with country folders ✔.
- The root is the x-default and a 302 router by query, cookie and IP ✔.
- Country pages (switched on) never redirect and render their own country regardless of IP or cookie, so Googlebot from US IPs can read `/uk` ✔.
- hreflang en-GB / en-US / x-default is self-referencing and reciprocal ✔.
- Every country page is self-canonical on one host ✔.
- `/compare` is noindex ✔.
- The sitemap lists only canonical, indexable country pages ✔.

### Decisions for you

1. **Country pages while switched off:** today `/us` 302s to `/uk` until the US is switched on. That is consistent with "never list a redirect", but it means a US page can't be previewed or crawled early. Keep it, or let `/us` render (noindex) before launch?
2. **The switcher (M1):** invisible fix only (menu options become real links), or also a visible footer link row (mockup)?
3. **`/signup`:** index it with a proper title and description, or noindex?
4. **Accept-Language (N4):** keep IP-first, or add it?
