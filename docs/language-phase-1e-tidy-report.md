# Language Phase 1e tidy — static language loading, US truck page, footnotes, sitemap, direct country links, and a live check of the private-event fix

16 October 2026. Source: docs/language-phase-1e-report.md (§§ Part C, 5, 7). Nothing is pushed, deployed or committed beyond Step 0's note below.

## Summary

| Item | Result |
|---|---|
| **1 · Part C → static imports** | Reverted. Every locale's words are static again, on the server and in the browser. The lazy loaders, the provider's wait-for-words switch and the server-words plumbing (`wordsFor`, `<LocaleWords>`, `useSeedWords`, `useLoadedLocale`, `ensureLocale`) are gone. Five runtime and generator files are byte-identical to eb7ed44. Rendered output is identical to the checkpoint for every view, GB and US. Most pages' client JS is **0.2–0.9 KB gz smaller** than the checkpoint; Manage is **+0.7 KB**. |
| **2 · US truck page** | For a truck outside GB, the page now shows none of Village Foodie's prompts: the newsletter, the weekly-schedule button, Hire / Add my Business / Truck Directory, and the claim links. GB is byte-identical. The allow-list entry is removed. |
| **3 · Footnotes** | n1 now says "a supported phone", matching the Tap to Pay row. n5 now says "Get in touch for the list of compatible printers." Both countries. |
| **4 · Sitemap** | `/` and `/features` are dropped. `/uk`, `/uk/features` (and `/us…` while the US is on) stay. |
| **5 · Direct country links** | The legal pages' logo and both demo bounces now go straight to `/uk` or `/us`, by the router's own rule, with no hop. The contact page and the shared footer had no router hop to remove (see §5). |
| **6 · Small items** | "© {year}" is the current year in Europe/London at render. The US screenshot scripts are in `scripts/screenshots/`, with a README. |
| **7 · Private-event fix, live** | No junk venue exists, and no Gusto row has a venue guess. **No import has run since the fix**, so it has not yet been exercised live. No clean-up SQL is needed. |

**Proof:**
- `language-phase-1e-tidy` (new): **60 passed, 0 failed**, over 622 views captured on the checkpoint and on this tree.
- `language-phase-1e`: **1,021 passed**.
- Full sweep: **129 run · 129 passed · 0 failed**.
- `tsc` is clean, `next build` exits 0, and no eslint rule count grew in any existing file.

## Step 0 — checkpoint

- **Nothing was left to commit.** The working tree was clean when this brief arrived, because you had already committed the Phase 1e work yourself:
  - `ff9eeef` "landing page": 231 files, the Phase 1e work;
  - `a858ca5` "landing": 6 files, the testimonial moves and the outreach editor fix.
- Neither commit includes `docs/reference-manual*.md` or `supabase/.temp/cli-latest`.
- **Checkpoint = `a858ca5`** (parent `ff9eeef`, whose parent is `eb7ed44`). I did not make an empty "Language phase 1e (checkpoint)" commit just to carry the name. That was a smaller choice, recorded here.
- **BEFORE was captured on it.** I made a clean `git worktree` of `a858ca5` and copied in only the capture scripts. Every `language-phase-1e` view was captured **twice**, with byte-identical results, into `scripts/fixtures/language-phase-1e-tidy-before/` (622 views).
- **Checkpoint build:** `next build` exited 0. Its client JS is the middle column in §1.

## Garbled spans and contradictions

- **No garbled spans.**
- **One tension, handled the way earlier briefs settled it.** The SQL rule says to "report each with its result inline in the chat reply as fenced blocks". FINALLY says the chat is "only a two-line summary…". Earlier briefs combined the two as "a two-line summary, plus any SQL as fenced blocks", so the chat reply carries the summary plus the read-only queries with their results. The same queries and results are in §7.
- **"Move the US screenshot render scripts".** The scripts were never in the repo; the Phase 1e screenshot work left them in a session scratch folder. They are now in `scripts/screenshots/`, which is the brief's intent.

## 1 · Part C → static imports (option 3)

**What changed:**
- **Generator.** `scripts/split-messages.cjs` is back to its eb7ed44 form. Every `lib/i18n/catalog/<ns>.ts` imports `messages/ns/en-GB/<ns>.json` and `messages/ns/en-US/<ns>.json` statically: `registerNamespace(ns, base, { 'en-US': enUS })`. All 104 catalogues are regenerated. The only differences from eb7ed44 are the 11 namespaces Phase 1e added.
- **Runtime.** These files are **byte-identical to eb7ed44**: `lib/i18n/registry.ts`, `lib/i18n/use-t.ts`, `lib/i18n/client.tsx`, `lib/i18n/messages.ts` (`overridesFor` gone) and `lib/i18n/namespaces.ts` (the four seeding entries gone). The provider sets the locale directly again, with no waiting for words.
- **Removed:**
  - `lib/i18n/server-words.ts` (`wordsFor`) and `lib/i18n/locale-words.tsx` (`<LocaleWords>`);
  - the `words` props and `useSeedWords` calls in `TruckClient`, `VerifyEmailSuccess` and `CostComparison`, and their pages;
  - `useLoadedLocale` in `DemoGetStarted`, which is back to its eb7ed44 line.
- **Kept and renamed: `<PageLocale>`** (`lib/i18n/page-locale.tsx`). `<LocaleWords>` did two jobs: it seeded words, and it told the marketing pages' client components (country menu, demo modal, CTAs) the page's locale. Only the first existed for lazy loading, so the locale boundary stays, without the words. The three marketing pages use it.
- **Kept:** one source of words, typed keys, the precompile, the merge, `useT`'s fallback, and `messages-split`.
- **Checker.** `scripts/messages-split.cjs` is back to eb7ed44, without its Part C checks 3b, 3c and the seeded-surface walk: **153 passed, 0 failed**.
- **Compile helpers un-pinned.** Part C's JSON fallback is removed from `scripts/_slot-interval-compile.cjs` and `scripts/whatsapp-background-jobs-harness.cjs`; both are byte-identical to eb7ed44. The fallback existed only for Part C's server-side `require`; a static `import` is copied by tsc. The full sweep passes without it.
- **Rule.** `.cursor/rules/language.mdc` gains: *"Per-locale lazy loading was built and reverted in Phase 1e (gain ~1.5 KB gz); revisit when a non-English language is added."*

### Client JS per page (gz KB)

| Page | BEFORE `eb7ed44` | 1e checkpoint `a858ca5` | AFTER | AFTER − checkpoint |
|---|---:|---:|---:|---:|
| /manage/[token] | 512.9 | 513.5 | 514.2 | **+0.7** |
| /dashboard/[token] | 394.0 | 394.0 | 393.8 | −0.2 |
| /dashboard/[token]/kds | 246.6 | 247.1 | 246.4 | −0.7 |
| /trucks/[slug]/order | 244.9 | 245.3 | 244.5 | −0.8 |
| /order/[id]/manage | 151.3 | 151.7 | 151.0 | −0.7 |
| /setup | 179.6 | 180.1 | 179.2 | −0.9 |
| /landing, /[country] | 155.9 | 157.2 | 156.5 | −0.7 |
| /features, /[country]/features | 149.8 | 150.7 | 150.0 | −0.7 |
| /compare, /[country]/compare | 165.1 | 169.2 | 168.3 | −0.9 |
| /trucks/[slug] | 165.6 | 166.6 | 166.1 | −0.5 |
| /privacy, /terms | 144.0 | 147.9 | 147.3 | −0.6 |
| /contact | 144.8 | 144.5 | 144.5 | 0.0 |
| /verify-email | 145.0 | 145.4 | 144.7 | −0.7 |

**The revert is cheaper than the 1e report predicted.** That report expected static imports to *add* 0.1–1.5 KB gz.
- **Most pages got smaller.** Removing the loading machinery (pending loads, listeners, seeding, the version counter, the per-namespace loader stubs) saved more than the few static US overrides cost.
- **Manage is the one page that grew (+0.7 KB):** its US words are many, and they are static again.
- **No other page grew** compared with the checkpoint.
- **The source columns:**
  - BEFORE is the 1e report's eb7ed44 build.
  - Checkpoint and AFTER are fresh `next build`s of `a858ca5` and of this tree, both exit 0.
  - Each is measured the same way: the chunks a page's client-reference manifest names, gzipped.

## 2 · US truck page — Village Foodie hidden outside GB

**How it works:**
- `app/trucks/[slug]/page.tsx` already looked up the truck's country, to choose its language. It now also passes `discovery={country === VILLAGE_FOODIE_COUNTRY}` (that constant is GB) to `TruckClient`.
- A truck with no HatchGrab row is a discovery truck. Discovery is UK-only, so such a truck keeps everything, as before.

**Hidden when `discovery` is false.** Each is a prompt into Village Foodie:
- the footer's newsletter block (title, line, "Get the Schedule" button, no-spam line);
- the footer's **Hire a Food Truck**, **Add my Business** and **Truck Directory** links;
- the floating weekly-schedule button;
- the "Own this truck?" claim link;
- the no-events page's add-business button;
- the "Are we missing an event?" box, already hidden on an orderable truck.

**Kept for every truck:** General Enquiry, Report Issue and the schedule disclaimer. They are contact and schedule text, not Village Foodie prompts.

**Defaults.** `Footer` and `TruckClient` both take `discovery` defaulting to `true`, so every Village Foodie page is unchanged.

**Allow-list.** The `_lp1e-checks` entry for "Get the village food schedule" on US views is removed. The US-words check passes without it.

**Proof (US fixtures):** the controls in §Proof, and the US views below.
- AFTER's US truck page and footer contain none of the prompt words, and no `/hire`, `/trucks` or add-business link.
- The same views with `discovery` forced on equal the checkpoint byte for byte.
- GB's truck page and footer are byte-identical to the checkpoint.

## 3 · Footnotes (named, both countries)

**What the code already states.** `lib/plan-features.ts` records it at the `tap_to_pay` row: *"A SUPPORTED PHONE", NEVER "PHONE OR TABLET". Tap to Pay on iPhone … is NOT available on iPad — an iPad still needs a physical reader … NO DEVICE OR OS VERSION IS NAMED.* The row reads "Take card payments on a supported phone, so you don't need a separate card machine" (US: "card reader"). So n1 now uses the row's own words and adds no new fact.

| | Before | After |
|---|---|---|
| **n1 GB** | … plus {tapFee} per authorisation if you tap on a phone or tablet without a dedicated reader. | … plus {tapFee} per authorisation if you take the payment on a supported phone instead of a separate card machine. |
| **n1 US** | … plus {tapFee} per authorization if you tap on a phone or tablet without a dedicated reader. | … plus {tapFee} per authorization if you take the payment on a supported phone instead of a separate card reader. |
| **n5 GB** | … (neither supplied). Compatible printers are listed in our help centre. | … (neither supplied). Get in touch for the list of compatible printers. |
| **n5 US** | … (neither supplied). Compatible printers are listed in our help center. | the GB sentence (the en-US override is deleted; nothing in it differs now) |

**The beginnings are unchanged** ("Walk-up orders: HatchGrab charges 0% on every plan. …" and "Kitchen ticket printing requires the HatchGrab kitchen app and a compatible Bluetooth or wired printer").

**Where they show:** /features (both countries), the plans PDF (both), and Manage › Billing's plan matrix (every GB and US Billing state). The proof lists all 46 views.

**n5 has no link.** It is the brief's sentence as plain text. A link would need rich text in every footnote renderer: the /features table, the plans PDF and Billing. The /contact page is one tap away in every footer. Recorded as a smaller choice.

## 4 · Sitemap

`app/sitemap.ts` on a HatchGrab host now lists only the country addresses:
- `https://www.hatchgrab.com/uk` (weekly, 1.0) and `/uk/features` (monthly, 0.8);
- `/us` and `/us/features` too while the US is switched on.

`/` and `/features` are gone, because they are the router's 302s. They stay each page's hreflang x-default. `/compare` stays out. The Village Foodie sitemap is unchanged. The comment in the file says so.

## 5 · Direct country links

**One decision, reused.** `routedAddress(page, req?)` in `lib/visitor-country.ts` returns the address the router *would* redirect to:
- It **is** the router's decision. It calls `marketingRedirect` (lib/marketing-country.ts) with the same switched-on, routable list proxy.ts reads, and the same sources: `?country`, the `hg_country` cookie, `x-vercel-ip-country`, then GB.
- It returns null off a HatchGrab host, because the router doesn't run there. It never throws: an unreadable list means GB.

**Changed:**
- **Legal layout.** The layout is now a small server component that calls `routedAddress('landing')`. The chrome itself moved, unchanged apart from its logo address, to `components/legal/LegalChrome.tsx` (`git mv`). It had to stay a client component for the native-shell logo. The logo goes to `/uk` or `/us`, and to `/landing` off a HatchGrab host, as before. Every page here was already rendered per request, so reading the request costs nothing new.
- **Demo return.** `/api/demo/return` and `/demo/[ref]` send a refused or expired token straight to `/uk?demo=…#try` (or `/us…`). The checkpoint sent `/landing?demo=…#try`, which the router then 302'd. The `#try` fragment is kept. Village Foodie is unchanged.

**Already direct (nothing to change):**
- **Contact page.** The HatchGrab render has no home link: its wordmark deliberately doesn't link. The Village Foodie render's `/` is Village Foodie's own map, not a router hop.
- **Shared footer.** `LandingFooter` is given country addresses by every page that renders it (`visitor.paths`). The `components/Footer` site footer has no `/` or `/landing` link.

The 1e report's "§7 item 6" overstated these two. Recorded.

## 6 · Small items

- **Year.** `landingFooter.copyright` and `contactPage.copyright` are now "© {year} HatchGrab". There is no US override. `copyrightYear()` (`lib/legal.ts`) is the year in Europe/London at render. The server and the browser use the same zone, so a hydrated footer agrees. Both footers pass it.
- **Screenshots.** `scripts/screenshots/` now holds:
  - `us-screens.cjs`, the entry point;
  - `order-us`, `dash-us` and `kds-us`, which render;
  - `frame-order`, `frame-dash`, `frame-kds` and `frame-ipad`, which frame;
  - `compose` and `bbox`, the helpers;
  - `common`, shared setup;
  - a `README.md`.
- **How the screenshot scripts run.** Each script runs in its own Node process.
  - They need a production build in `.next/` and Playwright WebKit. They don't need a dev server.
  - They write to a folder you name, or a temp folder by default. They refuse any folder inside `public/`.
- **Re-run check.** Re-running them reproduced `customer-order-us.png` and `kitchen-us.png` **byte for byte**. `dashboard-v4-us.png` differed in 215 pixels (max 6/255), all in the pending-orders badge, which pulses. A second run differed from the first in the same spot, so it's run-to-run variation.
- **Outside the sweep.** They are not in `scripts/harnesses.json`, and the runner's drift check reads only the top level of `scripts/`. A scratch inspection helper (`scan.cjs`) was left out.

## 7 · Live check — the private-event fix (read-only)

**The facts:**
- The fix commit `cea794f` is dated 2026-10-16 13:02:29 UTC. I can't see when it was deployed, so I used the commit time as the earliest go-live.
- The generic list is `lib/generic-venue-names.json`, matched after lower-casing and removing everything but letters and digits.

**Q1 — any venue with a generic name (any date, which covers "after 2026-10-14"):**
```sql
select id, name, village, country, latitude, longitude, created_at
from public.venues
where regexp_replace(lower(coalesce(name,'')), '[^a-z0-9]', '', 'g') = any (array[
  'private','privateevent','privateevents','privateparty','privateparties','privatehire','privatebooking',
  'privatefunction','privatefunctions','privatecatering','corporateevent','corporatelunch',
  'closed','tbc','tba','tbd','venuetbc','venuetba','locationtbc','locationtba','event','events'])
order by created_at;
```
Result: **0 rows.** The three junk venues from the fix report (`d89a7a76…` Private Event, `0b40f7bc…` Private Party, `27bc422d…` Corporate Lunch) are also absent when looked up by id, so the earlier clean-up has been run.

**Q2 — Pizzeria Gusto's events created or changed since the fix, plus its private events from 14 October:**
```sql
select e.event_date, e.venue_name, e.is_private, e.status, e.source, e.venue_id, e.venue_id_source,
       e.venue_match_confidence, e.latitude, e.longitude, e.postcode, e.created_at, e.updated_at
from public.truck_events e
where e.truck_id = 'pizzeria-gusto'
  and (e.created_at >= '2026-10-16 13:02:29+00' or e.updated_at >= '2026-10-16 13:02:29+00'
       or (e.is_private and e.event_date >= '2026-10-14'))
order by e.event_date, e.created_at;
```
| event_date | venue_name | is_private | status | source | venue_id · source · confidence · lat · lng · postcode | created = updated |
|---|---|---|---|---|---|---|
| 2026-10-14 | Private Event | true | unconfirmed | scraper | all null | 2026-10-13 08:47 |
| 2026-10-15 | Private Event | true | unconfirmed | scraper | all null | 2026-10-13 08:47 |
| 2026-10-16 | Private Event | true | unconfirmed | scraper | all null | 2026-10-13 08:47 |

**None was created or changed since the fix, and none carries a venue guess any more.**

**Q3 — Gusto's discovery rows since the fix, plus every private-titled one:**
```sql
select d.event_date, d.venue_name, d.venue_id, d.village, d.source, d.visibility, d.created_at, d.updated_at
from public.discovery_events d
join public.discovery_trucks t on t.id = d.discovery_truck_id
where t.hatchgrab_truck_id = 'pizzeria-gusto'
  and (d.created_at >= '2026-10-16 13:02:29+00' or d.updated_at >= '2026-10-16 13:02:29+00'
       or regexp_replace(lower(coalesce(d.venue_name,'')), '[^a-z0-9]', '', 'g') like 'private%')
order by d.event_date, d.created_at;
```
Result: **9 rows, all with `venue_id` null, and none since the fix.**
- "Private Hire" on 27 Jun, 18 Jul, 8 Aug, 15 Aug, 22 Aug and 8 Oct;
- "Private Event" on 14, 15 and 16 Oct (created 13 Oct).

All have `visibility` 'public'; see §Listed for you.

**Q4 — has any import run since the fix?**
```sql
select 'truck_events (all trucks)' as what, count(*) as rows_since_fix, max(created_at) as latest from public.truck_events where created_at >= '2026-10-16 13:02:29+00'
union all
select 'discovery_events (all trucks)', count(*), max(created_at) from public.discovery_events where created_at >= '2026-10-16 13:02:29+00'
union all
select 'venues created since 2026-10-14', count(*), max(created_at) from public.venues where created_at >= '2026-10-14';
```
| what | rows | latest |
|---|---:|---|
| truck_events (all trucks), since the fix | 3 | 2026-10-16 14:56:54 UTC |
| discovery_events (all trucks), since the fix | 0 | — |
| venues created since 14 Oct | 10 | 2026-10-16 10:40:59 UTC (before the fix) |

- **The 3 events** are manual "Demo event" rows on `demo-…` trucks.
- **The 10 venues** are real places: Kimbolton Castle Fireworks, Barkway Social Club, Ickleford Fireworks, SHEFFORD MEPPERSHALL, St Faiths Centre, Middle Row Market, Burwash Manor, Mrs Salisburys Carpark, Food Truck Collective and St John's Innovation Park.

**Verdict:**
- **Clean.** No junk venue exists, and no private event has a venue guess. No clean-up SQL is needed, so none is given.
- **The fix has not yet met live data.** No scraper or email import has run since it went live. The next import is the first real test; repeat Q1–Q3 after it.

## Proof

### `scripts/language-phase-1e-tidy.cjs` (new) — 60 passed, 0 failed

**Method:**
- Every view `language-phase-1e` captures is captured on the checkpoint (BEFORE, twice, byte-identical) and on this tree (AFTER). That is 622 views: 64 GB, 60 US and 498 router.
- Both sides use their own authored words.
- AFTER must equal BEFORE **with exactly the named items applied**, byte for byte.

**Results:**
- **554 views are byte-identical.** This is the Part C revert's proof: its rendered output is identical for every GB and US view.
- **The named views:**
  - **footnotes:** 46 views (/features GB, US, and GB with the US on or the cookie set; the plans PDF GB and US; Billing, 20 GB and 20 US states);
  - **legal logo:** `parts/legal|GB|chrome` → `/uk`, `parts/legal|US|chrome` → `/us`;
  - **sitemap:** exactly `/uk`, `/uk/features` (GB), plus `/us`, `/us/features` with the US on; Village Foodie unchanged.
- **US Village Foodie prompts.** Two control views (`…-discoveryOn`) are captured on both codes.
  - On the checkpoint, each control equals its view, because the prop didn't exist.
  - AFTER's control equals BEFORE's view byte for byte, so the hidden prompts are the **only** difference.
  - AFTER's US views contain none of the prompt words or links. GB's views are unchanged.
- **Demo bounces.** There are 16 views: two routes, three HatchGrab inputs plus Village Foodie, with the US on and off.
  - BEFORE went to `/landing?demo=invalid#try`, which the real proxy then 302'd to `/uk?demo=invalid`.
  - AFTER goes straight to that same address with `#try`, and the proxy serves it with no redirect.
  - Village Foodie is unchanged.
- **Year:**
  - `copyrightYear` reads Europe/London: 31 Dec 23:59 UTC → 2026; 1 Jan 00:00 UTC → 2027; 23:30 New York on 31 Dec → 2027.
  - Both footers pass it, and both messages are `© {year} HatchGrab` with no US override.
  - The GB landing still renders "© 2026 HatchGrab" at the fixture clock.

### The other checks

| Check | Result |
|---|---|
| `language-phase-1e` | **1,021 passed, 0 failed** |
| `messages-split` | 153 passed, 0 failed (the eb7ed44 checker) |
| `messages-parity` | 25,433 passed, 0 failed |
| `ui-literals` | ✓, with one re-key (see re-pins) |
| `language-phase-0` | 168 passed, 0 failed |
| `marketing-country-parity` | 121/121 |
| Full sweep `node scripts/run-harnesses.cjs` | **129 run · 129 passed · 0 failed** |
| `npx tsc --noEmit -p .` | clean |
| `next build` | exit 0 (checkpoint and AFTER) |
| eslint, every touched file versus its checkpoint version | **no rule count grew in any existing file**. The new `.cjs` files (the tidy harness and `scripts/screenshots/*`) carry only `@typescript-eslint/no-require-imports`, as every `.cjs` script in `scripts/` does. |

**`language-phase-1e` details:**
- Its captures include the new demo and control views, which are "only AFTER" against eb7ed44, so they are reported but not compared.
- The regenerated US list now names the `parts/footer|US|html` and `parts/truck|US|html` changes ("TIDY: Village Foodie's discovery prompts…") and `parts/legal|US|chrome` (legal-logo-country).
- The GB list is regenerated: n1 and n5 were already named Phase 1e fixes, and their "after" text is updated.

### Re-pins (named only)

- **`scripts/_lp1e-named.cjs`:**
  - `sitemap-country` now drops `/` and `/features`;
  - new `legal-logo-country`;
  - a US-behaviour line for the hidden prompts.
- **`scripts/_lp1e-checks.cjs`:**
  - the "Get the village food schedule" allow-list entry is removed, as the brief asked;
  - the US-words check skips the two `-discoveryOn` control views. They put Village Foodie's prompts back on purpose, for the tidy proof, and no visitor sees them. The first sweep caught this: `language-phase-1e` failed 3 checks on the controls, and the fix is this exclusion, not an allow-list entry.
- **`scripts/_lp1e-parts.cjs`:**
  - the footer view passes `discovery` as the truck page does;
  - two control views (`footer|US|html-discoveryOn`, `truck|US|html-discoveryOn`).
- **`scripts/_lp1e-router.cjs`:** the 16 demo-bounce views.
- **`scripts/fixtures/language-phase-1e-gb-named.json` and `-us-changed.txt`:** regenerated.
- **`scripts/fixtures/ui-literals-baseline.json`:** the legal chrome's one counted string (the brand name "HatchGrab") moved with the file. Its entry is re-keyed from `app/(legal)/layout.tsx` to `components/legal/LegalChrome.tsx`. The total is unchanged at 110.
- **`scripts/harnesses.json`:** adds `language-phase-1e-tidy.cjs`.

## Localhost check

**Setup:**
- Plain `localhost:3000` renders as **Village Foodie**: the brand test is a substring check on the host. The router and the country pages exist only on a HatchGrab host, and `/uk` 404s on any other.
- Use the documented alias. Add `127.0.0.1 hatchgrab.localhost` to `/etc/hosts`, run `npm run dev`, and browse **http://hatchgrab.localhost:3000**.
- A local server reads whatever database `.env.local` points at. With the live settings, the US is switched off, so the US pages can't be seen locally unless the US is switched on there.

| Open | You should see |
|---|---|
| `http://hatchgrab.localhost:3000/uk` | **The UK landing.** £ prices; the testimonial "Pizzeria Gusto", then the award, then "Nadia & Bogdan — owners"; footer "© 2026 HatchGrab"; Features and Pricing links to `/uk/features` and `/uk#pricing`. |
| `http://hatchgrab.localhost:3000/` | **The router:** a 302 to `/uk`. With the US off, `/?country=US` also lands on `/uk`. In DevTools › Network, the `/` request shows 302 with `Location: /uk`. |
| `http://hatchgrab.localhost:3000/landing` and `/features` | 302 to `/uk` and `/uk/features`. |
| `http://hatchgrab.localhost:3000/us` | 302 to `/uk` (the US is switched off). |
| **The flag selector:** the country button in the `/uk` header (and footer) | Reads "United Kingdom" with the UK flag. Opening it lists the switched-on countries, only the UK today. Choosing one writes the `hg_country` cookie and stays on the same page in that country. |
| `http://hatchgrab.localhost:3000/uk/features` | **The comparison table.** Footnote 1 ends "…if you take the payment on a supported phone instead of a separate card machine." Footnote 5 ends "Get in touch for the list of compatible printers." |
| **Billing's plan rows:** Pizza Kitchen's Manage link (Admin › trucks › Pizza Kitchen), opened on `hatchgrab.localhost:3000`, then the Billing tab | The plan cards and the "compare plans" matrix with the same footnotes 1 and 5. The plan rows read from the same helpers as /features. |
| **The plans PDF:** Admin (signed in as admin) › the plans PDF download, which fetches `/landing/features-pdf` | An A4 PDF of the plan table with the new footnotes 1 and 5. The route is admin-only. |
| `http://hatchgrab.localhost:3000/privacy` | The legal page. The HatchGrab logo top-left now links to `/uk`. |
| `http://hatchgrab.localhost:3000/api/demo/return?t=nope` | Lands on `/uk?demo=invalid#try` in one hop, scrolled to the landing's demo section. Before, it went `/landing?demo=…` → 302 → `/uk`. |
| `http://hatchgrab.localhost:3000/sitemap.xml` | Exactly two URLs: `…/uk` and `…/uk/features`. |
| `http://hatchgrab.localhost:3000/trucks/test-kitchen` | Pizza Kitchen's public page (GB). The newsletter, the weekly-schedule button and the Hire / Add my Business / Truck Directory links are **still there**, because GB is unchanged. A US truck's page drops them; that is proved on fixtures only. |

## Decisions recorded

1. **The checkpoint is your own commit `a858ca5`.** No empty commit was made.
2. **`<PageLocale>` is kept** as the marketing pages' locale boundary, without words.
3. **The discovery test is `country === VILLAGE_FOODIE_COUNTRY`** (GB), decided on the server page. The prop defaults to `true`, so Village Foodie surfaces are untouched.
4. **For a non-GB truck, General Enquiry, Report Issue and the schedule disclaimer stay;** only the Village Foodie prompts go.
5. **n5 is plain text** ("Get in touch for the list of compatible printers."), with no link.
6. **One `routedAddress` helper** wraps the router's own `marketingRedirect`, used by the legal layout and both demo bounces. Off a HatchGrab host, every caller keeps its old address.
7. **The legal chrome moved to `components/legal/LegalChrome.tsx`,** so the layout can be a server component. The chrome itself is unchanged apart from its logo address.
8. **The year is read in Europe/London** on both server and browser.
9. **The screenshot scripts never write into `public/`.** Replacing an image is a manual copy.

## Listed for you

1. **The private-event fix hasn't run against live data yet.** No import since it went live. Re-run §7's Q1–Q3 after the next scraper or email import.
2. **Gusto's 14–16 October private events are still `unconfirmed`** in Manage's pending list. They are in the past now; approving or dismissing them is your call.
3. **Gusto's private discovery rows ("Private Hire" ×6, "Private Event" ×3) are `visibility = 'public'`.** If Village Foodie lists public discovery rows, these private bookings may show there with no place. Not checked further; not changed.
4. **The sitemap no longer lists `https://www.hatchgrab.com/`,** so Search Console may report it as "not in sitemap". Expected for a redirect.
5. **Apple's Marketing URL** (`https://www.hatchgrab.com/`) still answers 302 → `/uk`, as in Phase 1e.
6. **The US can't be seen on localhost** while the database has it switched off. The US proof is on fixtures.
7. **Earlier 1e report:** its "§7 item 6" listed the contact page and shared footer as router hops. They weren't (see §5).

## Files

**Product code:**
- **Reverted to eb7ed44:** `lib/i18n/{registry,use-t,messages,namespaces}.ts`, `lib/i18n/client.tsx`, `scripts/split-messages.cjs`, `scripts/messages-split.cjs`, `scripts/_slot-interval-compile.cjs`, `scripts/whatsapp-background-jobs-harness.cjs`.
- **Deleted:** `lib/i18n/server-words.ts`, `lib/i18n/locale-words.tsx`.
- **New:** `lib/i18n/page-locale.tsx`.
- **Moved:** `app/(legal)/layout.tsx` → `components/legal/LegalChrome.tsx`. There is a new server `app/(legal)/layout.tsx`.
- **Changed:**
  - **Marketing pages:** `app/{landing,features,compare}/page.tsx`, `app/compare/CostComparison.tsx`;
  - **Truck page:** `app/trucks/[slug]/{page,TruckClient}.tsx`, `components/Footer.tsx`;
  - **Verify-email:** `app/verify-email/{page,VerifyEmailSuccess}.tsx`;
  - **Demo:** `components/DemoGetStarted.tsx`, `app/api/demo/return/route.ts`, `app/demo/[ref]/route.ts`;
  - **Sitemap:** `app/sitemap.ts`;
  - **Libraries:** `lib/visitor-country.ts` (`routedAddress`), `lib/legal.ts` (`copyrightYear`);
  - **Copyright footers:** `components/landing/LandingFooter.tsx`, `app/contact/HatchGrabContact.tsx`.
- **Generated:** all 104 `lib/i18n/catalog/*.ts`, plus `messages/ns/**` for the changed keys.
- **Rule:** `.cursor/rules/language.mdc`.

**Messages:**
- `messages/en-GB.json`: `planFeatures.footnote.n1`, `.n5`, `landingFooter.copyright`, `contactPage.copyright`.
- `messages/en-US.json`: `planFeatures.footnote.n1` changed; `planFeatures.footnote.n5` deleted.

**Harnesses and scripts:**
- **New:** `scripts/language-phase-1e-tidy.cjs`, `scripts/fixtures/language-phase-1e-tidy-before/`, `scripts/screenshots/*` with its README.
- **Changed:** see Re-pins.
