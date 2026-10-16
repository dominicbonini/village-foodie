# Language Phase 1e — marketing pages into the message files with US words, country addresses (/uk, /us) with a country router at the root, and load only the active language

**Status:** built and proven. Nothing committed, pushed or deployed.

## Step 0
**No commit was needed.** You had already committed and **pushed** the work the brief asked me to checkpoint:
- **`cea794f`** "private event fix": Phase 1d Part 2 plus the pending-card / generic-venue fix (and the V15.9 manual work).
- **`eb7ed44`** "outreach template fix": the composer auto-fill, parent `cea794f`.

The tree was clean and level with `origin/main`. **BEFORE is `eb7ed44`.**

## SQL and data
**SQL:** none to run.

**Supabase MCP (read-only):**

```sql
select country_code, enabled, locale from public.country_settings order by country_code;
```

→ GB enabled en-GB · **US enabled = false** en-US. US checks below use fixtures with the US switched on.

## Garbled spans and contradictions
**Garbled spans:** none.

**Contradictions:** none. One point I've recorded:
- The brief asks for `metadataBase` and og:url on www.hatchgrab.com, and also for UK pages to be byte-identical apart from canonical, og:url and hreflang.
- Moving `metadataBase` is part of that named change. It moves the inherited og:url on every HatchGrab page to `https://www.hatchgrab.com/…`.
- The og:image was already absolute and does not move.

---

## Summary

| Part | Result |
|---|---|
| **A · words** | **376 en-GB messages in 12 namespaces** (landing, landingNav, landingFooter, featuresPage, planFeatures, planMeta, plansPdf, compare, contactPage, siteFooter, legalChrome, truckPage). **65 US overrides.** **38 named GB fixes** (Appendix A1). Plan rows and price words are read **by id**, so Manage › Billing and the marketing pages show the same text. |
| **A · US behaviour** | US Letter plans PDF. Locale-free App Store link. Gusto testimonial on GB only. **Three new US hero images.** US small fees "30¢" / "Cents per order". US dates in the plan footnotes. |
| **B · addresses** | `/uk`, `/us` (+ `/features`, `/compare`) render their country and never redirect. The root, `/landing`, `/features`, `/compare` and the preview route 302 to the visitor's country page. A switched-off country's page 302s to the GB page. Canonical, og:url and hreflang per country. Sitemap. |
| **C · active language only** | A page's client JS now carries the en-GB base plus **no** other language. US words load as small lazy chunks only when a US screen needs them, or arrive with the server render on US pages. **No en-US-only word is left in any page's initial JS** (Manage had 201). |
| **Proof** | `language-phase-1e` **1,021 passed, 0 failed**, deterministic. Every language harness and every re-pinned one passes. tsc clean. next build exit 0. Full sweep: see §5. |

---

## Part A — the marketing words

### What moved

| Namespace | GB | US | Surface |
|---|---:|---:|---|
| `landing` | 90 | 24 | the landing page body, JSON-LD words, title/description/OG/Twitter |
| `landingNav` / `landingFooter` | 8 / 8 | – | nav (and the country menu's labels), footer |
| `featuresPage` | 4 | 1 | /features |
| `planFeatures` | 96 | 14 | **plan rows by id** (`row.<PlanRowId>.{name,detail}`), sections, fees, footnotes, plan sub-labels, **price words by PRICE_WORD id**, cells |
| `planMeta` | 6 | 1 | plan descriptions (small on purpose: `lib/features.ts` reaches the order page, dashboard and API gates) |
| `plansPdf` | +6 | 2 | the plans PDF |
| `compare` | 94 | 16 | /compare and the cost calculator |
| `contactPage` / `siteFooter` / `legalChrome` / `truckPage` | 13 / 11 / 10 / 30 | 8 in all | contact, HatchGrab footer, legal pages' chrome (not the Markdown text), the public truck page's words, share text and meta |

**Plan rows and price words go by id.** Each row in `lib/plan-features.ts` now holds its id and cells. Its words come from messages via `featureSections(locale)`, `rowName/rowDetail/cellLabel(…, locale)`, `planDescriptions(locale)` and `priceText(code, locale)`.
- A cell carries a `PRICE_WORD` code, or the mask code `MASKED_PRICE`. The word is only made at display.
- Code still compares ids, never words (rule 6).

**Billing reads the same messages:**
- Manage › Billing: `priceText(mask(v), cs.locale)`, `featureSections(cs.locale)`, `planDescriptions(cs.locale)`.
- FeatureGate and the van add-on: `priceText` and `planDescription`.

**How the pages pick their language:**
- **Marketing pages:** the page's country (the address on `/uk` and `/us`; the visitor's resolved country on the old paths).
- **The public truck page:** the truck's own country.
- **Legal chrome:** en-GB. None of its words differ in the US.

### US words
These follow the approved table: catering, popping up, "Shorter lines", card reader, tap to pay, serving/operating, general liability insurance, Getting started, fill out the form, get back to you, everything, Book a food truck, inquiry, help center, organize, pickup time slot, at the window ("Pay at Hatch" kept), TBD, combos, "30¢" / "Cents per order". Every key is in Appendix A2.

**Choices beyond the table (recorded):**
- "the pitch" → "your spot";
- "sort" (set up) → "set up";
- "running basket" → "running cart";
- "Weekend traders & walk-up pitches" → "Weekend trucks & walk-up spots";
- "try the lot" → "try it all";
- "Small print" → "Fine print";
- "Correct at" → "Correct as of";
- "How many days a week do you trade?" → "…do you operate?";
- "queue-skippers" → "line-skippers";
- "patchy or no mobile coverage" → "spotty or no cell service".

### US-only behaviour
- **The plans PDF for the US is US Letter.** GB stays A4, with HTML and print options byte-identical (`pdfPaperOf(s)`: US and CA → Letter).
- **App Store link:** US pages use the locale-free `https://apps.apple.com/app/id6803543106`. GB and Manage for a GB truck keep the UK storefront link exactly (`appStoreUrlFor(country)`; `StoreBadges` takes `countryCode`). I kept the GB link unchanged rather than make it locale-free too: that would change a UK page's href.
- **The Pizzeria Gusto testimonial and award show for GB only.** On US pages the section is hidden; nothing else in the layout changes.
- **Plan footnote dates** read "October 1, 2026" in the US (`formatLongDate`). US Billing shows "TBD".
- **The calculator's small fees** come from the existing coin rules: US "2.9% + 30¢", "¢" beside the fee box.

### Screenshots
**Three US images**, made by rendering the real order page, dashboard (Add order) and kitchen screen for a US fixture truck (USD, en-US words, 12-hour times, US dates), framed like the GB device captures and at their pixel sizes:

| Image | Size |
|---|---|
| `public/screenshots/customer-order-us.png` | 1284×2778 |
| `dashboard-v4-us.png` | 800×551 |
| `kitchen-us.png` | 640×480 |

- **Verdict:** all three match the GB images convincingly, so they are used on US pages (`lib/landing-screens.ts` `landingScreenshot(name, country)`).
- **The GB images are untouched**, and the GB src paths are unchanged.
- **What was reused:** the status bar and Safari bar are the GB captures' own device pixels, with the clock repainted.
- **Where the render scripts are:** in my scratch folder only, not the repo. Say if you want the recipe kept under `scripts/`.

### GB fixes (38 keys, named; Appendix A1 has every before and after)
- **Straight ' → ’:** throughout compare, landing, contact, the truck page, the footer, legal chrome and plan rows.
- **"..." → "…":** "Loading form…", "Loading Map…", "Loading schedule…".
- **Wording:**
  - "Less queues" → "Fewer queues";
  - "Offline Order Protection" → "Offline order protection";
  - "Instant sold out toggle" → "Instant sold-out toggle";
  - "Subject to {fee} HatchGrab platform fee" → "Subject to **a** {fee}…";
  - "Compatible printers listed…" → "Compatible printers **are** listed…";
  - "Max tier" → "Max plan".
- **A stale fact on /compare:** "the all-in figure in question 4" → "question {n}", which now reads 5. The fee question became card 5 when online orders became question 1.

### Named GB code changes (edge cases, from the calculator)
These come from switching the calculator's small fees to `smallFeeLabel` (as you asked):
- (a) Once the typed fee plus the card fee reaches 100p or more, the "all in" figure shows money: "4.6% + 119p" → "4.6% + £1.19". A typed fractional fee is rounded ("22.5p" → "23p").
- (b) A typed fractional number of free months prints at most 3 decimals: "1.2345" → "1.235".
- An unreachable branch ("You'd pay extra") was removed.

**Proof:** the compare agent rendered 579 calculator states. With the named fixes undone, every GB state is identical except those in (a).

---

## Part B — country addresses and the router

### What was built
**Country pages:**
- One dynamic segment: `app/[country]/page.tsx`, `app/[country]/features/page.tsx`, `app/[country]/compare/page.tsx`.
- Each **re-exports** the existing page module: no second copy of any page.
- uk → GB and us → US, from one table in `lib/marketing-country.ts`.
- `dynamicParams = false`, plus a request-time `notFound()` for anything else. Next 16 does not enforce the static-params 404 on a force-dynamic route by itself.

**The router** (`proxy.ts`, HatchGrab hosts only):
- It reads the switched-on countries through the existing 60-second cached loader (on a failed read: GB only).
- It decides with `marketingRedirect()`: `?country` → `hg_country` cookie → `x-vercel-ip-country` → GB, switched-on countries only. No special case for crawlers.
- The proxy runs on Node in Next 16. The built proxy was loaded and checked: no `server-only` guard in its chunks, and it initialises.

**The country menu** writes `hg_country` and moves to the same page in the chosen country. A visitor's choice beats location. A `?country=` on a router address is also remembered by the 302's Set-Cookie.

**Metadata on country pages:**
- canonical and og:url are the page's own address;
- hreflang lists every switched-on country (en-GB → /uk…, en-US → /us…) plus x-default → / (or /features, /compare);
- og:locale per country; JSON-LD as before;
- `metadataBase` and the layout's og:url are now `https://www.hatchgrab.com`.

**The sitemap:**
- It keeps `/` and `/features` and adds `/uk`, `/uk/features` (and `/us`, `/us/features` while the US is on).
- **/compare stays out for every country**, because the page is robots-noindex; listing it would contradict it (decision recorded).
- ⚠️ `/` and `/features` are now 302s. You may want to drop them later; the brief said to keep every other entry.

**Internal links** in the nav, footer and landing body now point at the country address (`/uk/features`, `/uk/compare`, `/uk#pricing`). They don't hop through the router.

### The router table
It runs the real `proxy` on www.hatchgrab.com with redirects followed. The same answers hold for `/`, `/landing`, `/features`, `/compare` and `/1ng7n4p5omux2gdk9kqvwz` (each to its matching country page):

| Input | US off | US on |
|---|---|---|
| none | 302 /uk | 302 /uk |
| `?country=US` | 302 /uk, no cookie | 302 /us + `hg_country=US` |
| `?country=GB` | 302 /uk + `hg_country=GB` | same |
| `?country=XX` | /uk | /uk |
| cookie US | /uk | /us |
| cookie GB | /uk | /uk |
| IP US | /uk | /us |
| IP GB / FR | /uk | /uk |
| cookie GB + IP US | /uk | /uk |
| cookie US + IP GB | /uk | /us |
| `?country=GB` + cookie US | /uk + cookie GB | same |
| `?country=US&utm_source=mail` | /uk?utm_source=mail | /us?utm_source=mail + cookie |

**Country pages:**
- `/uk…` is always **200 and never redirected**, whatever cookie, IP or query it gets.
- `/us…` is 200 when the US is on.
- `/us…` **302s to the matching `/uk…` page** when the US is off (query kept minus `country`).

**No loops:** every chain ends in at most one hop at a 200.

**Unchanged** (same status, kind, location, rewrite and cookies as BEFORE):
- **Village Foodie host:** `/`, `/landing` (308 → `/`), `/features`, `/compare`, `/uk`, `/us`, `/trucks`, `/venues`, `/contact`, `/api`, the operator redirects to HatchGrab;
- **custom hosts;**
- **on HatchGrab:** `/trucks`, `/order`, `/o`, `/p`, `/manage`, `/dashboard`, `/kds`, `/app`, `/api/*`, `/contact`, `/privacy`, `/terms`, `/login`, `/signup`, `/setup`, `/hire`, `/sitemap.xml`.

**One byte-level note:** the redirect re-encodes a kept query (`%20` → `+`); the meaning is the same.

### Named visible changes for the UK
1. **Router paths:**
   - **hatchgrab.com/** was a rewrite showing the landing; it is now a **302 to /uk**. ⚠️ **Apple's Marketing URL (`https://www.hatchgrab.com/`) now lands on /uk.**
   - `/landing` (was 308 → /), `/features`, `/compare` and the preview (were 200) now 302 to their `/uk` page.
2. **Metadata:** canonical and og:url are the country address; hreflang is new; `metadataBase`/og:url host is www.
3. **Internal marketing links** go to `/uk…`.
4. **The named word fixes** and the calculator edge cases above.

**Otherwise `/uk` equals BEFORE's `/`.** The harness compares the BEFORE page module's GB render with the `/uk` country page directly. The only other difference is React's empty `<!-- -->` text-node markers, which vanish where pieces became one message. They are invisible, and are normalised by name in the check.

---

## Part C — load only the active language

**What it does:**
- **The generated catalogue module** (`scripts/split-messages.cjs`; all 104 `lib/i18n/catalog/*.ts`) keeps the en-GB base static and makes each other language:
  - **synchronous on the server:** `require` (emails, API routes, server components, SSR);
  - **lazy in the browser:** `() => import(…)`, its own small chunk, or nothing at all when a namespace has no US words.
- `typeof window` is folded at build time on both sides. Checked in the real Turbopack build: the client chunks have 104 lazy loaders, 56 `null`s and **0** `require`; the server chunks have 250 synchronous requires and **0** lazy loaders.
- **The registry** returns the base until a locale's words have loaded, then the merge, exactly as before. `ensureLocale` loads them; `useT`'s fallback is unchanged.
- **The provider switches** a truck's screen to US only after those words arrive, so a screen is never half GB and half US.
- **Pages server-rendered in US English** (the public truck page, the calculator, the verify-email success, and the marketing pages' client parts: country menu and demo modal) get that page's US words in the server render, passed as a prop from the same JSON (`lib/i18n/server-words.ts` `wordsFor`; `<LocaleWords>`). They hydrate with no mismatch. GB pages pass nothing.
  - **Proof:** a browser hydration test, including a control without the words that *does* report the mismatch.
  - messages-split now checks every seeded surface.

**One source of words, typed keys, precompile, the merge and messages-split are all kept.** Nothing is written twice.

### The honest result

| Page (gz KB) | BEFORE `eb7ed44` | 1e without C | AFTER | C's effect gz (raw) | US lazy chunks (gz) |
|---|---:|---:|---:|---:|---|
| /manage/[token] | 512.9 | 515.0 | 513.5 | −1.5 (−17.8 raw) | 37 (15.4) |
| /dashboard/[token] | 394.0 | 394.6 | 394.0 | −0.6 (−9.0) | 14 (5.8) |
| /dashboard/[token]/kds | 246.6 | 247.2 | 247.1 | −0.1 (−2.7) | 11 (3.9) |
| /trucks/[slug]/order | 244.9 | 245.3 | 245.3 | 0.0 (−2.4) | 9 (3.1) |
| /setup | 179.6 | 180.0 | 180.1 | +0.1 (−0.4) | 4 (1.1) |
| /landing, /[country] | 155.9 | 157.1 | 157.2 | 0.0 (−0.4) | 2 (0.7) |
| /features, /[country]/features | 149.8 | 150.5 | 150.7 | +0.2 (−0.3) | 2 (0.7) |
| /compare, /[country]/compare | 165.1 | 169.3 | 169.2 | −0.2 (−3.4) | 5 (2.7) |

**What it does and doesn't save:**
- **Every en-US-only word is gone from every page's initial JS.** Manage had 201 such fragments and now has 0; all pages are at 0.
- **The gzip saving is small**, because US English is a near-copy of the GB text in the same chunk, and gzip had already squeezed it.
- **The "+24 KB" Manage growth in the Part 2 report was mostly the new en-GB words**, not US words.
- **A US truck now pays a little more:** Manage fetches 37 small chunks (15.4 KB gz in total) when it switches to US.
- **The design pays off properly when a real third language arrives**, whose words won't compress against English.

**Options for you:**
1. **Keep it** (what's built).
2. **Keep it, but fetch one US chunk per screen** instead of one per namespace: about 1 request instead of 37. That needs generated per-surface packs, and the same JSON may sit in two chunks.
3. **Go back to static imports.** Today's extra cost on GB pages would be 0.1–1.5 KB gz.

### Client JS for every page (BEFORE → AFTER, gz KB)
**Pages that grew:**
- **Marketing pages:** /landing 155.9 → 157.2; /features 149.8 → 150.7; /compare 165.1 → 169.2. These carry the moved words and the router helpers.
- **Village Foodie and the legal pages:** / 193.1 → 197.1, /venues/[slug] 186.0 → 190.2, /privacy and /terms 144.0 → 147.9. The shared site footer reads its words from messages now, which brings the small translator onto pages that had none.
- **/trucks/[slug]** 165.6 → 166.6.

**Everything else is within ±0.6 KB.**

---

## 5 · Proof

### `scripts/language-phase-1e.cjs` — 1,021 passed, 0 failed (≈2 s; two runs identical)
**Method:**
- BEFORE: `eb7ed44`, captured from a clean worktree twice.
- F: current code with eb7ed44's words plus every as-moved overlay.
- A: current code with current words.

**Views:** 595 BEFORE / 604 AFTER: pages 19, parts 50, Billing 44, router 482.

**GB · F vs BEFORE:**
- 42 byte-identical;
- 19 equal BEFORE plus their named items (metadataBase-www, country canonical, hreflang, country links, sitemap, the two calculator edge cases, the `<!-- -->` separators);
- 0 unexplained.
- `/uk` ignores the visitor: with a US cookie it is identical.

**GB · A vs F:**
- 38 en-GB keys changed; every changed word is explained by its key.
- The list equals `scripts/fixtures/language-phase-1e-gb-named.json`.
- The 2 new `landing.meta.*` keys hold today's text exactly, so they are correctly not in the list.

**US (fixtures, US on):**
- **49 of 52 US views change**, each with its cause (`scripts/fixtures/language-phase-1e-us-changed.txt`).
- **38 US code-behaviour views are listed** under a named behaviour (calculator 12, Billing 20, PDF 2, pages 3, truck meta 1).
- **The US-words check** extends Part 2's list with the marketing words.

**US-words allow-list:** 82 hits, all allowed:

| Allowed | Hits | Reason |
|---|---:|---|
| "Starter" | 54 | plan name |
| "Village Foodie" | 6 | brand |
| "stamp cards — collected" | 19 | loyalty stamps are collected in US English too |
| "collects" in the privacy description | 1 | legal wording |
| "Get the village food schedule" | 2 | the Village Foodie newsletter line in the discovery footer on a truck page |

⚠️ **Your call:** whether that "village food schedule" line may stay on a US truck's page.

**Other checks in 1e:**
- **PDF:** GB A4 and US Letter, from the real `generatePlansPdf` with a recording browser. GB print options are byte-identical.
- **Screenshots:** GB pages reference exactly BEFORE's images; US pages only the three `-us` files, which exist at the GB pixel sizes.
- **App Store:** GB keeps the UK listing; US gets the locale-free link.

### The other checks
- **messages-parity 25,436** (AREAS before: 1a, 1b, 1c, 2, 1d, 1d2; after: **+1e**). messages-split **165** (Part C's seeded-surface checks included).
- **ui-literals:** baseline lowered in 11 files. app/landing/page.tsx 112 → 0, CostComparison 82 → 0, TruckClient 27 → 2, HatchGrabContact 13 → 1, Footer 11 → 0, LandingFooter 10 → 0, LandingNav 8 → 0, legal layout 4 → 1, LegalPage 4 → 0, FeatureComparison 4 → 0, CountryMenu 1 → 0. What's left is brand names.
- **Language harnesses:** language-phase-0 168 · 1a 1,050 · 1b 3,522 · 1c 4,498 · 1d 308 · 1d2 488 · 2 1,124 · 1e 1,021.
- **Marketing and readiness:** marketing-country-parity 121 · us-readiness 50.
- **Plans and pricing:** country-settings-parity · plan-feature-order 29 · whatsapp-golive-parity 37 · compare-no-system 54.
- **Schedule, places and screens:** schedule-graphics-places 270 · places-posts-gating 48 · phase3-screens 88 · event-types 192 · design-fonts 87 · printing-copy.
- **signup-landing-screenshots:** not run (it needs Chromium against a running build).
- **`npx tsc --noEmit`:** clean. **`next build`:** exit 0.
- **ESLint** per rule against HEAD: no rule count grew in any product file. The 7 new harness modules carry only `no-require-imports`, as every CommonJS harness does.
- **Final full sweep** (`node scripts/run-harnesses.cjs`), re-run at the end on the final tree: **128 run · 128 passed · 0 failed**, exit 0. The first final sweep had failed 8 tsc-compiled harnesses; the two compile helpers were re-pinned (§5) and the re-run passes.

### Re-pins (each marked "⚠️ RE-PINNED (Language Phase 1e)")
**Language harnesses:**
- `_lp2-frozen.cjs`: a third as-moved overlay.
- language-phase-1d2: proves Part 2's end state on eb7ed44's words. Two US-only named entries (US footnote dates, App Store link).
- `_messages-parity-1d2`: its own keys only; the new `_messages-parity-1e` covers Phase 1e.
- language-phase-0: named transforms for row ids, US dates, Letter, ¢, the `<!-- -->` separators, and the US landing's images, testimonial and store link.

**Marketing:**
- marketing-country-parity: eb7ed44's words, `<!-- -->` removed from text, BEFORE re-taken at eb7ed44.
- us-readiness: the US landing title now "Food truck & catering…".

**Plans and pricing:**
- country-settings-parity: the GB fixes piece by piece, plus row and section ids.
- plan-feature-order and whatsapp-golive-parity: `resolveJsonModule`; rows found by id.
- printing-copy: scans the marketing messages.
- compare-no-system: the temp tree carries `messages/`; V3/V7 re-anchored; the 7 apostrophe pins follow the GB fixes.

**Other surfaces:**
- schedule-graphics-places: 8 Phase 1e edit claims.
- places-posts-gating: the social row by id.
- `_phase3-screens-us`: the van add-on's `vanMask`.
- event-types: `planMeta` added to its variant tree.

**The two tsc compile helpers** (`scripts/_slot-interval-compile.cjs`, used by 7 harnesses, and `scripts/whatsapp-background-jobs-harness.cjs`):
- **Why they failed:** the first final sweep failed 8 harnesses with `MODULE_NOT_FOUND`. A generated catalog module now loads its en-US words with a plain server-side `require('@/messages/ns/en-US/<ns>.json')` (Part C), and tsc copies a JSON file into its compiled tree only for an `import`.
- **The re-pin:** a `@/…json` file missing from the compiled tree is read from the repo. Only data files can be missing this way; every `.ts` under test is still the compiled one.
- **Result:** all 8 pass again.

**⚠️ Checks that are weaker than before (stated):**
1. The `<!-- -->` normalisation in three harnesses. Only that empty comment is removed.
2. marketing-country-parity's snapshot is now eb7ed44's. It differs from the old Phase 2D-1 snapshot by two seam spaces.
3. language-phase-1d2 now proves Part 2's end state on eb7ed44's words; Billing's Phase 1e words are proven by 1e.
4. The 38 US code-behaviour views are **listed**, not byte-proven (as in Part 2).
5. country-settings-parity excuses GB-fix pieces derived from the gb-named list.
6. 1e's metadata merge is a faithful subset of Next's resolver, not Next's own.

**Not exercised:** Next's real 404 for an unknown country segment (the proof is the request-time `notFound()` check and the proxy itself).

---

## 6 · Decisions recorded
1. **One dynamic segment** re-exports the existing pages; a single table maps uk/us.
2. **The switched-off redirect is a 302 in the proxy.** The page's own fallback is a 307, used only if a proxy instance's cache still says the US is on.
3. **/compare stays out of the sitemap** for every country (noindex).
4. **The GB App Store link is unchanged;** US uses the locale-free link.
5. **Plan words by id**, read through one set of helpers by marketing and Billing.
6. **The public truck page speaks the truck's language;** legal chrome is en-GB.
7. **Part C as built** (options above).

## 7 · Listed for you
1. **Apple's Marketing URL** now 302s to /uk. That's fine for review, but worth knowing.
2. **With the testimonial hidden on US pages**, "How it works" and "Pricing" are both tinted bands and now sit back to back. The page's own band-sequence note warns about this. The layout is otherwise unchanged, as the brief asked.
3. **The US calculator's saving anchors** reuse the UK figures in dollars ("a year’s general liability insurance" for $80–250 is probably low in the US).
4. **Not checked:**
   - Footnote 1 says Tap to Pay works on a "phone or tablet", but its row says it doesn't work on iPad.
   - Footnote 5 points to a help centre I didn't find.
5. **Sitemap:** `/` and `/features` are now 302s. Consider dropping them.
6. **Links that still hop through the router:** the legal layout, the contact page and the shared footer link to `/` or `/landing`; the demo return goes to `/landing?demo=…`. Each costs one extra hop.
7. **Truck page metadata (not changed here):** it still uses the root title template ("X | Village Foodie | HatchGrab") and a villagefoodie.co.uk og:url on the HatchGrab host. Already recorded in `docs/share-preview-report.md`.
8. **"© 2026"** is typed into the footers.
9. **The plan tier names** (Starter/Pro/Max) stay inline as product names.

## 8 · Files
**Product code:**
- **New:**
  - `app/[country]/{page,features/page,compare/page}.tsx`;
  - `lib/marketing-country.ts`, `lib/marketing-meta.ts`, `lib/landing-screens.ts`;
  - `lib/i18n/server-words.ts`, `lib/i18n/locale-words.tsx`;
  - `public/screenshots/{customer-order,dashboard-v4,kitchen}-us.png`.
- **Changed:**
  - **Routing and metadata:** `proxy.ts`, `app/layout.tsx`, `app/sitemap.ts`, `lib/visitor-country.ts`.
  - **Marketing pages:** `app/landing/page.tsx`, `app/features/page.tsx`, `app/compare/page.tsx`, `app/compare/CostComparison.tsx`.
  - **Contact, legal and truck pages:** `app/contact/{page,HatchGrabContact}.tsx`, `app/(legal)/{layout,privacy/page,terms/page}.tsx`, `app/trucks/[slug]/{page,TruckClient}.tsx`, `app/verify-email/{page,VerifyEmailSuccess}.tsx`.
  - **Components:** `components/landing/{LandingNav,LandingFooter,CountryMenu,FeatureComparison}.tsx`, `components/{Footer,StoreBadges,FeatureGate,DemoGetStarted}.tsx`, `components/legal/LegalPage.tsx`.
  - **Plan and pricing libraries:** `lib/plan-features.ts`, `lib/features.ts`, `lib/pricing.ts`, `lib/landing-table.ts`, `lib/plans-pdf.ts`, `lib/app-badges.ts`.
  - **i18n:** `lib/i18n/{registry,use-t,client,messages,namespaces}.ts(x)`.
  - **Manage:** `app/manage/[token]/page.tsx` (Billing, the van add-on, store badges).

**Messages:** `messages/en-GB.json`, `messages/en-US.json`; generated `messages/ns/**` and all 104 `lib/i18n/catalog/*`.

**Harnesses:**
- **New:**
  - `scripts/language-phase-1e.cjs`;
  - `scripts/_lp1e-{fixtures,pages,parts,billing,router,named,words,checks}.cjs`;
  - `scripts/_messages-parity-1e.cjs`;
  - `scripts/fixtures/language-phase-1e-*`.
- **Changed:**
  - `scripts/split-messages.cjs`, `scripts/messages-split.cjs`;
  - `scripts/harnesses.json`, `scripts/fixtures/ui-literals-baseline.json`;
  - the re-pins in §5.

---

## Appendix — generated from the message files, so it matches them exactly

### A1 · GB named word changes (38 keys; both countries)

| key | before | after |
|---|---|---|
| `compare.anchor.counter` | That's a full refit of your serving counter. | That’s a full refit of your serving counter. |
| `compare.anchor.festivalPitches` | That's a couple of festival pitches. | That’s a couple of festival pitches. |
| `compare.anchor.fryer` | That's a new fryer and griddle. | That’s a new fryer and griddle. |
| `compare.anchor.liability` | That's a year's public liability cover. | That’s a year’s public liability cover. |
| `compare.anchor.secondVan` | That's a second van on the road. | That’s a second van on the road. |
| `compare.anchor.vanDeposit` | That's a deposit on a second van. | That’s a deposit on a second van. |
| `compare.anchor.weekendPitch` | That's a weekend pitch at a food festival. | That’s a weekend pitch at a food festival. |
| `compare.breakdown.card` | Card processing — Stripe's {fee} per order, paid to Stripe. You'd pay much the same on a card machine at the window. | Card processing — Stripe’s {fee} per order, paid to Stripe. You’d pay much the same on a card machine at the window. |
| `compare.breakdown.provider` | Your current provider's own fee ({pct}) | Your current provider’s own fee ({pct}) |
| `compare.days.help` | Events, markets, pitches — any day the van's out. | Events, markets, pitches — any day the van’s out. |
| `compare.fee.inclusiveNote` | Card processing of {fee} is inside that, and you'd pay it anywhere. Their own fee is <b>{pct}</b>. | Card processing of {fee} is inside that, and you’d pay it anywhere. Their own fee is <b>{pct}</b>. |
| `compare.intro` | Takes about a minute. Already using a system? We'll compare it. Not yet? We'll show you exactly what it costs. | Takes about a minute. Already using a system? We’ll compare it. Not yet? We’ll show you exactly what it costs. |
| `compare.orders.titleNo` | How much do you think you'd take online, per month, per truck? | How much do you think you’d take online, per month, per truck? |
| `compare.smallPrint.check` | Check your current provider's rates before deciding. | Check your current provider’s rates before deciding. |
| `compare.smallPrint.onTop` | The all-in figure in question 4 includes it — the comparison does not, on either side. | The all-in figure in question {n} includes it — the comparison does not, on either side. |
| `compare.smallPrint.yes` | Estimates based on the figures you enter, assuming an average order of {aov}. Card processing of {fee} per order applies whichever provider you use, so it's excluded from both sides. | Estimates based on the figures you enter, assuming an average order of {aov}. Card processing of {fee} per order applies whichever provider you use, so it’s excluded from both sides. |
| `compare.twoYear` | Over two years that's <b>{amount}</b> saved. | Over two years that’s <b>{amount}</b> saved. |
| `contactPage.loadingForm` | Loading form... | Loading form… |
| `landing.does.slotsBody` | Customers order ahead and pick a collection time. Less queues, and food ready when they arrive. | Customers order ahead and pick a collection time. Fewer queues, and food ready when they arrive. |
| `landing.pricing.summary` | Pro is {proPrice} a month with {proAllowance} of online orders included. Max is {maxPrice} with {maxAllowance}. Anything above that is {platformFee}. Standard card processing fees apply to all online orders (currently {cardFee} on standard {region}), including those within your allowance. Walk-ups carry no HatchGrab platform fee on any plan. Your card terminal's own fees still apply. | Pro is {proPrice} a month with {proAllowance} of online orders included. Max is {maxPrice} with {maxAllowance}. Anything above that is {platformFee}. Standard card processing fees apply to all online orders (currently {cardFee} on standard {region}), including those within your allowance. Walk-ups carry no HatchGrab platform fee on any plan. Your card terminal’s own fees still apply. |
| `legalChrome.questions` | Questions? <link>Get in touch</link> — we're real people. | Questions? <link>Get in touch</link> — we’re real people. |
| `planFeatures.footnote.n1` | Walk-up orders: HatchGrab charges 0% on every plan. Use your own card terminal and only your provider's standard fees apply. Card payments through HatchGrab via Stripe are coming soon — Stripe's own charge, currently around {inPersonFee} on {region}, plus {tapFee} per authorisation if you tap on a phone or tablet without a dedicated reader. | Walk-up orders: HatchGrab charges 0% on every plan. Use your own card terminal and only your provider’s standard fees apply. Card payments through HatchGrab via Stripe are coming soon — Stripe’s own charge, currently around {inPersonFee} on {region}, plus {tapFee} per authorisation if you tap on a phone or tablet without a dedicated reader. |
| `planFeatures.footnote.n2` | Online payments powered by Stripe Connect. Subject to {platformFee} HatchGrab platform fee plus Stripe card processing fees (~{onlineFee} per transaction on standard {region}). | Online payments powered by Stripe Connect. Subject to a {platformFee} HatchGrab platform fee plus Stripe card processing fees (~{onlineFee} per transaction on standard {region}). |
| `planFeatures.footnote.n5` | Kitchen ticket printing requires the HatchGrab kitchen app and a compatible Bluetooth or wired printer (neither supplied). Compatible printers listed in our help centre. | Kitchen ticket printing requires the HatchGrab kitchen app and a compatible Bluetooth or wired printer (neither supplied). Compatible printers are listed in our help centre. |
| `planFeatures.landing.offlineProtectionDetail` | If you lose signal, online ordering pauses so customers can't place orders you won't see. The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection. | If you lose signal, online ordering pauses so customers can’t place orders you won’t see. The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection. |
| `planFeatures.row.offline_protection.detail` | If your internet drops mid-service, orders are held safely and sync when you're back — you never lose one. | If your internet drops mid-service, orders are held safely and sync when you’re back — you never lose one. |
| `planFeatures.row.offline_protection.name` | Offline Order Protection | Offline order protection |
| `planFeatures.row.sms_order_alerts.detail` | Text customers automatically when their order's ready. Will carry an additional charge (price to be confirmed). | Text customers automatically when their order’s ready. Will carry an additional charge (price to be confirmed). |
| `planFeatures.row.sold_out_toggle.name` | Instant sold out toggle | Instant sold-out toggle |
| `planMeta.description.trial` | All features included — Max tier + Pay at Hatch ordering | All features included — Max plan + Pay at Hatch ordering |
| `plansPdf.terms` | Figures are the published plan terms at the date above and may change. Card processing fees are\n      Stripe’s own charge, not HatchGrab’s. This document is a summary, not a contract. | Figures are the published plan terms at the date above and may change. Card processing fees are Stripe’s own charge, not HatchGrab’s. This document is a summary, not a contract. |
| `siteFooter.disclaimer` | Disclaimer: Schedules are subject to change by vendors. We do our best, but we are not responsible for cancelled trucks or sold-out burgers. Always check the vendor's social media for last-minute updates. | Disclaimer: Schedules are subject to change by vendors. We do our best, but we are not responsible for cancelled trucks or sold-out burgers. Always check the vendor’s social media for last-minute updates. |
| `truckPage.loadError.body` | We couldn't load the schedule just now — this is usually a brief hiccup. Please try again. | We couldn’t load the schedule just now — this is usually a brief hiccup. Please try again. |
| `truckPage.loadError.title` | Couldn't load | Couldn’t load |
| `truckPage.loadingMap` | Loading Map... | Loading Map… |
| `truckPage.loadingSchedule` | Loading schedule... | Loading schedule… |
| `truckPage.missingEvent` | <strong>Are we missing an event?</strong> <br></br>If you're the owner of this truck or just a dedicated fan, help us keep this page accurate! <br></br><link>Contact us to add missing details.</link> | <strong>Are we missing an event?</strong> <br></br>If you’re the owner of this truck or just a dedicated fan, help us keep this page accurate! <br></br><link>Contact us to add missing details.</link> |
| `truckPage.notFound.body` | We couldn't find any details for this food truck. They might have moved or updated their profile. | We couldn’t find any details for this food truck. They might have moved or updated their profile. |

### A2 · US overrides added or changed (65)

| key | en-GB | en-US |
|---|---|---|
| `landing.jsonLd.subCategory` | Food truck and mobile catering ordering system | Food truck and catering ordering system |
| `landing.jsonLd.description` | Ordering, pre-orders and a kitchen screen for {country} food trucks and mobile catering. | Ordering, pre-orders and a kitchen screen for {country} food trucks and catering. |
| `landing.jsonLd.audience` | Food truck and mobile catering operators | Food truck and catering operators |
| `landing.shots.dashboardAlt` | Taking an order on HatchGrab: the menu on the left, the running basket and total on the right | Taking an order on HatchGrab: the menu on the left, the running cart and total on the right |
| `landing.shots.phoneAlt` | Ordering from a food truck on HatchGrab: the menu with photos and prices, and a running basket total | Ordering from a food truck on HatchGrab: the menu with photos and prices, and a running cart total |
| `landing.does.lede` | Most ordering systems assume a fixed address, reliable wifi and the same hours every week. You’re somewhere new every week, at different times, on patchy or no mobile coverage. HatchGrab was built for that. | Most ordering systems assume a fixed address, reliable wifi and the same hours every week. You’re somewhere new every week, at different times, with spotty or no cell service. HatchGrab was built for that. |
| `landing.does.slotsTitle` | Customers choose collection times | Customers choose pickup times |
| `landing.does.slotsBody` | Customers order ahead and pick a collection time. Fewer queues, and food ready when they arrive. | Customers order ahead and choose a pickup time. Shorter lines, and food ready when they arrive. |
| `landing.does.capacityBody` | Set how much you can cook at once, and how long it takes. Once a collection time is full, customers can’t pick it. | Set how much you can cook at once, and how long it takes. Once a pickup time is full, customers can’t pick it. |
| `landing.does.devicesBody` | Runs on the phone in your apron, the tablet on the counter, the laptop in the van — and the card machine you already take payment on. | Runs on the phone in your apron, the tablet on the counter, the laptop in the truck — and the card reader you already take payment on. |
| `landing.does.whatsappBody` | “Where are you tonight?” “What desserts do you have?” Your WhatsApp gets answered while you’re driving to the pitch or at the grill, using your own menu and schedule. Messenger and Instagram coming soon. | “Where are you tonight?” “What desserts do you have?” Your WhatsApp gets answered while you’re driving to your spot or at the grill, using your own menu and schedule. Messenger and Instagram coming soon. |
| `landing.does.whatsappSoonBody` | “Where are you tonight?” “What desserts do you have?” Soon your WhatsApp will get answered while you’re driving to the pitch or at the grill. Messenger and Instagram to follow. | “Where are you tonight?” “What desserts do you have?” Soon your WhatsApp will get answered while you’re driving to your spot or at the grill. Messenger and Instagram to follow. |
| `landing.does.offlineBody` | If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Carry on taking orders with the iPhone, iPad and Android app. | If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Continue taking orders with the iPhone, iPad and Android app. |
| `landing.steps.eyebrow` | Getting going | Getting started |
| `landing.steps.lede` | Three things to sort — and two of them just need a photo. | Three things to set up — and two of them just need a photo. |
| `landing.steps.menuBody` | Photograph your board or paste it in. Items, prices and extras all come across on their own. You just check they’re right. | Photograph your board or paste it in. Items, prices and extras all come through on their own. You just check they’re right. |
| `landing.steps.shareBody` | Post it on Facebook, stick the QR on the van. Orders land on your screen, in the order you need to cook them. | Post it on Facebook, stick the QR on the truck. Orders land on your screen, in the order you need to cook them. |
| `landing.pricing.trialBody` | With {brand}, customers order ahead and pay when they collect, so you can take online orders without connecting a card processor at all. Prefer to take payment up front? Add online card payments any time. <bold>Adding online payments doesn’t start your subscription</bold>. You’re only charged when you actively select a paid plan. We’ll never charge you without your clear permission. No card to start, cancel anytime. | With {brand}, customers order ahead and pay when they pick up, so you can take online orders without connecting a card processor at all. Prefer to take payment up front? Add online card payments any time. <bold>Adding online payments doesn’t start your subscription</bold>. You’re only charged when you actively select a paid plan. We’ll never charge you without your clear permission. No card to start, cancel anytime. |
| `landing.pricing.starter.online` | Online ordering, pay at the hatch | Online ordering, pay at the window |
| `landing.pricing.starter.menu` | Menu, meal deals & upsells | Menu, combos & upsells |
| `landing.pricing.pro.preorders` | Pre-orders & collection times | Pre-orders & pickup times |
| `landing.final.lede` | Upload a photo or screenshot of your menu and we’ll turn it into a working ordering page for you to have a play around with in under 60 seconds. Your items, your prices. No sign-up, no card, nothing to install. Have a look, then decide. | Upload a photo or screenshot of your menu and we’ll turn it into a working ordering page for you to try out in under 60 seconds. Your items, your prices. No sign-up, no card, nothing to install. Take a look, then decide. |
| `landing.meta.title` | Food truck & mobile catering ordering system — HatchGrab {country} | Food truck & catering ordering system — HatchGrab {country} |
| `landing.meta.description` | Take orders and pre-orders from your pitch without the queue. Ordering and kitchen-screen software for {country} food trucks and mobile catering — not a POS. | Take orders and pre-orders from your spot without the line. Ordering and kitchen-screen software for {country} food trucks and catering — not a POS. |
| `contactPage.meta.description` | Get help with HatchGrab. Send us a message and we will come back to you by email. | Get help with HatchGrab. Send us a message and we will get back to you by email. |
| `contactPage.lede` | Something not working, or a question about your account? Two ways to reach us — either way we will come back to you by email. | Something not working, or a question about your account? Two ways to reach us — either way we will get back to you by email. |
| `contactPage.formHeading` | Or fill in the form below | Or fill out the form below |
| `siteFooter.hire` | Hire a Food Truck | Book a Food Truck |
| `siteFooter.general` | General Enquiry | General Inquiry |
| `siteFooter.disclaimer` | Disclaimer: Schedules are subject to change by vendors. We do our best, but we are not responsible for cancelled trucks or sold-out burgers. Always check the vendor’s social media for last-minute updates. | Disclaimer: Schedules are subject to change by vendors. We do our best, but we are not responsible for canceled trucks or sold-out burgers. Always check the vendor’s social media for last-minute updates. |
| `truckPage.shareText` | Check out where {truck} is pitching up next! 🚚 | Check out where {truck} is popping up next! 🚚 |
| `truckPage.noEvents.cta` | Drop us a message to update! | Send us a message to update! |
| `planFeatures.row.walkup_orders.detail` | Take and manage orders at the hatch, paid on your own card terminal. | Take and manage orders at the window, paid on your own card terminal. |
| `planFeatures.row.sold_out_toggle.detail` | Mark any item sold out in one tap — it greys out for customers straight away. | Mark any item sold out in one tap — it grays out for customers right away. |
| `planFeatures.row.online_ordering_pay_at_hatch.detail` | Customers order ahead online and pay in person when they collect. | Customers order ahead online and pay in person when they pick up. |
| `planFeatures.row.meal_deals_upsells.name` | Meal deals & upsells | Combos & upsells |
| `planFeatures.row.time_slot_selection.detail` | Customers pick a collection time slot, spreading demand across your service. | Customers choose a pickup time slot, spreading demand across your service. |
| `planFeatures.row.whatsapp_auto_replies.detail` | Auto-reply to WhatsApp enquiries about your menu and schedule. | Auto-reply to WhatsApp inquiries about your menu and schedule. |
| `planFeatures.row.messenger_instagram_replies.detail` | Same as WhatsApp auto-replies, for Messenger and Instagram enquiries. | Same as WhatsApp auto-replies, for Messenger and Instagram inquiries. |
| `planFeatures.row.tap_to_pay.detail` | Take card payments on a supported phone, so you don’t need a separate card machine. | Take card payments on a supported phone, so you don’t need a separate card reader. |
| `planFeatures.landing.mergedAutoRepliesDetail` | Auto-reply to enquiries about your menu and schedule on WhatsApp, Messenger and Instagram. | Auto-reply to inquiries about your menu and schedule on WhatsApp, Messenger and Instagram. |
| `planFeatures.footnote.n1` | Walk-up orders: HatchGrab charges 0% on every plan. Use your own card terminal and only your provider’s standard fees apply. Card payments through HatchGrab via Stripe are coming soon — Stripe’s own charge, currently around {inPersonFee} on {region}, plus {tapFee} per authorisation if you tap on a phone or tablet without a dedicated reader. | Walk-up orders: HatchGrab charges 0% on every plan. Use your own card terminal and only your provider’s standard fees apply. Card payments through HatchGrab via Stripe are coming soon — Stripe’s own charge, currently around {inPersonFee} on {region}, plus {tapFee} per authorization if you tap on a phone or tablet without a dedicated reader. |
| `planFeatures.footnote.n4Live` | Auto-replies require a Business account on each platform. Meta, not HatchGrab, bills your WhatsApp account for replies. From {from} the first {count} a month are free. Correct at {checked}; Meta may change its prices, so check with Meta. Replies are AI-generated and can occasionally be wrong. | Auto-replies require a Business account on each platform. Meta, not HatchGrab, bills your WhatsApp account for replies. From {from}, the first {count} a month are free. Correct as of {checked}; Meta may change its prices, so check with Meta. Replies are AI-generated and can occasionally be wrong. |
| `planFeatures.footnote.n5` | Kitchen ticket printing requires the HatchGrab kitchen app and a compatible Bluetooth or wired printer (neither supplied). Compatible printers are listed in our help centre. | Kitchen ticket printing requires the HatchGrab kitchen app and a compatible Bluetooth or wired printer (neither supplied). Compatible printers are listed in our help center. |
| `planFeatures.priceWord.masked` | TBC | TBD |
| `planMeta.description.starter` | Weekend traders & walk-up pitches | Weekend trucks & walk-up spots |
| `featuresPage.lede` | Your free month includes everything — try the lot before you pick. | Your free month includes everything — try it all before you pick. |
| `plansPdf.smallPrint` | Small print | Fine print |
| `plansPdf.priceNoteMasked` | Prices shown as “TBC” are not yet published. | Prices shown as “TBD” are not yet published. |
| `compare.people.title` | {fleet, plural, one {How many people work the van?} other {How many people work across your vans?}} | {fleet, plural, one {How many people work the truck?} other {How many people work across your trucks?}} |
| `compare.orders.captionNo` | A rough guess is fine — pre-orders and queue-skippers, not cash or card at the window. | A rough guess is fine — pre-orders and line-skippers, not cash or card at the window. |
| `compare.fee.fixedAria` | Pence per order | Cents per order |
| `compare.days.title` | How many days a week do you trade? | How many days a week do you operate? |
| `compare.days.help` | Events, markets, pitches — any day the van’s out. | Events, markets, spots — any day the truck’s out. |
| `compare.noSystem.hero` | <lead>Online ordering, pre-orders and your kitchen screen for</lead><figure>{amount}</figure><unit>a trading day</unit> | <lead>Online ordering, pre-orders and your kitchen screen for</lead><figure>{amount}</figure><unit>a serving day</unit> |
| `compare.noSystem.basedOn` | Based on {days, plural, one {# day} other {# days}} a week · {monthly} a month{fleet, plural, one {} other { per van}} | Based on {days, plural, one {# day} other {# days}} a week · {monthly} a month{fleet, plural, one {} other { per truck}} |
| `compare.breakdown.acrossFleet` | Across {fleet, plural, one {# van} other {# vans}} | Across {fleet, plural, one {# truck} other {# trucks}} |
| `compare.breakdown.card` | Card processing — Stripe’s {fee} per order, paid to Stripe. You’d pay much the same on a card machine at the window. | Card processing — Stripe’s {fee} per order, paid to Stripe. You’d pay much the same on a card reader at the window. |
| `compare.panel.acrossFleet` | across {fleet, plural, one {# van} other {# vans}} | across {fleet, plural, one {# truck} other {# trucks}} |
| `compare.hero.dearerSub` | {fleet, plural, one {{amount} a month more than now} other {{amount} more per van a month than now}} | {fleet, plural, one {{amount} a month more than now} other {{amount} more per truck a month than now}} |
| `compare.anchor.liability` | That’s a year’s public liability cover. | That’s a year’s general liability insurance. |
| `compare.anchor.weekendPitch` | That’s a weekend pitch at a food festival. | That’s a weekend spot at a food festival. |
| `compare.anchor.festivalPitches` | That’s a couple of festival pitches. | That’s a couple of festival spots. |
| `compare.anchor.vanDeposit` | That’s a deposit on a second van. | That’s a deposit on a second truck. |
| `compare.anchor.secondVan` | That’s a second van on the road. | That’s a second truck on the road. |
