# gsc-index-2: the translated legal pages' hreflang made reciprocal, listed in the sitemap, and /support redirected

9 November 2026. Follows docs/gsc-index-1-report.md (§1a, §2 and "The code fix"). Committed on main as **ab43bd98** (code + harnesses), plus a second
commit for this report. Not pushed and not deployed. Nothing changes on the live site until you deploy.

## What changed, in one paragraph

Each legal document (Privacy Policy, Terms, Country-specific terms) now has one hreflang cluster: the English page, all 35
translations the site serves, and x-default. **Every member declares the same full set,** so all pairs are reciprocal. Before,
the 105 translated pages named only themselves and the English page, and the English page named nobody, so Google ignored every
pair. The sitemap now lists all **108** legal URLs (3 English + 105 translations) with that cluster as `xhtml:link` alternates.
`/support` now answers **308 → /contact** on HatchGrab hosts, keeping the query string. Nothing else in the sitemap changed, and
nothing on the country, features, FAQ or comparison pages changed. The landing page is untouched.

---

## 1. Fix A: `legalLanguages(doc)`

**components/legal/translated-legal.tsx** gains `legalLanguages(doc)`, beside `legalMetadata`. It returns locale → absolute URL:

- `en-GB` and `x-default` → the English document (`https://www.hatchgrab.com/privacy`, …);
- plus, for every country row in the order the country list returns them, its translated address
  (`/de/privacy`, `/jp/terms`, …), **only where that page actually serves a translation**. These are the same tests that make
  `legalPlace` / `legalPage` redirect to English instead: the country has an address (`COUNTRY_PATH_SEGMENTS`), its row is switched on,
  its language is not English (`legalBaseOf`), and the document has a translation file (`legalDocumentSource(…).translatedInto`);
- **one entry per locale**: a later country with the same locale replaces an earlier one, the rule `countryPageAlternates` uses. No two
  live countries share a locale today, so nothing is dropped.

If the country list can't be read, the set is the English page alone. In that case the translated pages redirect to English
anyway.

Used by:

| Page | Change |
|---|---|
| every translated page (`app/(app)/[country]/(legal)/{privacy,terms,country-terms}`) | `legalMetadata` now sets `languages: await legalLanguages(doc)` instead of the three-entry object. These three page.tsx files needed no edit: they already call `legalMetadata`. |
| English `/privacy`, `/terms`, `/country-terms` (`app/(app)/(legal)/…/page.tsx`) | `alternates: { ...own.alternates, languages: await legalLanguages(doc) }`. **The canonical stays the page's own** (from `ownUrlMetadata`, unchanged). |

Today's cluster, 37 entries per document: `en-GB de-AT nl-BE pt-BR bg-BG hr-HR el-CY cs-CZ da-DK et-EE fi-FI fr-FR de-DE el-GR zh-HK
hu-HU it-IT ja-JP lv-LV de-LI lt-LT fr-LU ms-MY es-MX nl-NL nb-NO pl-PL pt-PT ro-RO sk-SK sl-SI es-ES sv-SE de-CH th-TH ar-AE x-default`.
The nine English-speaking countries (uk us ie au nz ca mt gi sg) have no translated address. `/uk/privacy` still redirects to
`/privacy` and is in no cluster.

## 2. Fix B: the sitemap

**app/sitemap.ts** (HatchGrab host only):

- `/privacy`, `/terms` and `/country-terms` keep their place, lastmod, `yearly` and `0.3`, and **gain** `alternates: { languages: <the
  cluster> }`.
- The 105 translations are **appended at the end**. Each has the same cluster, `lastModified` = its English document's date
  (`legalUpdatedDate(PRIVACY_UPDATED | TERMS_UPDATED | COUNTRY_TERMS_UPDATED)`; a translation shows its English document's date per
  lib/legal.ts), `changeFrequency: 'yearly'`, `priority: 0.3`.
- Today that is privacy 2026-11-04, terms and country-terms 2026-11-01.

The sitemap goes from 139 URLs / 547,500 bytes to **244 URLs / 937,394 bytes**, far under the 50,000-URL / 50 MB limit.
The Village Foodie sitemap is unchanged.

## 3. `/support` → `/contact`

**proxy.ts**, directly after the cross-host rule: on any HatchGrab host (`isHatchGrab(host)`: production, previews, local),
`pathname === '/support'` → **308** to `/contact` with the query kept. It is built like the existing `/landing` 308
(`new URL('/contact', request.url)` + `search`), so the `Location` header is relative (`/contact`, `/contact?topic=billing&x=1`).
The Village Foodie host and `/support/<anything>` are not affected.

---

## 4. Proof

### The new harness: `scripts/gsc-index-2.cjs`, against real production builds on localhost

I built two throwaway git worktrees in my scratchpad (HEAD = before, HEAD + these changes = after) with `npm run build`. That kept
the main checkout's `.next` and generated `messages/` untouched while the iOS session works there. The harness starts `next start`
itself on each build (127.0.0.1, a free port), asks as a HatchGrab host, and stops it.

```
node scripts/gsc-index-2.cjs --dir=<after build> --before=<before build>
✅ gsc-index-2: 904 passed, 0 failed
```

| § | What it proves |
|---|---|
| 0 | source: `legalLanguages` exists and applies the redirect tests; `legalMetadata`, the three English pages and the sitemap all use it; the /support rule sits right after the cross-host rule and is a 308 |
| 1 | sitemap: the 3 English URLs are listed; each cluster names en-GB and x-default → English, one URL per locale; the sitemap lists **exactly** the cluster's members (**108**: 3 + 105); every legal entry's `xhtml:link`s are the cluster; lastmod = the English document's; `yearly`, `0.3` |
| 2 | every cluster member answers **200**, is **indexable** (no noindex header or meta), is **canonical to itself**, and its `<head>` hreflang is **exactly** its document's cluster (so it lists itself and every other member); the pairwise test as Google applies it (A names B ⇒ B names A under the same codes) finds **0 one-way pairs**; each translation's code is its own country's (`de-AT` → `/at/…`); `/uk`, `/us`, `/ie`, `/au` `/privacy` redirect to `/privacy` and are in no cluster |
| 3 | the translated languages (35 per document) are exactly the non-English languages the `/uk` page's hreflang names (the switched-on countries) |
| 4 | `/support` → 308 `/contact`; `/support?topic=billing&x=1` → 308 `/contact?topic=billing&x=1`; `/contact` is 200; not on a Village Foodie host; `/support/team` not redirected |
| 5 | before vs after (step 5 of the brief, below) |

**Broken variant:** run against the before build, the harness fails 22 checks: no `legalLanguages`, no cluster, no sitemap entries,
no /support redirect. So it does detect the defect.

**It is not in the sweep.** It needs a completed `next build` and starts a server, so it is registered under `excluded.server` in
scripts/harnesses.json (with perf-1-local.cjs) and run by hand: `npx next build && node scripts/gsc-index-2.cjs`. The file says why:
a sweep that skipped it would show green for something nobody checked.

### Step 5: before vs after, nothing else changed

Part of the harness (§5), both builds running side by side:

- **No URL left the sitemap.** All 105 added URLs are translated legal pages, appended at the end, and the old order is unchanged.
- **Every one of the 136 non-legal sitemap entries is byte-identical** (the country, features, FAQ and comparison pages, /contact,
  /about). The three English legal entries are identical apart from the added `xhtml:link`s.
- **The 136 pages themselves render the same HTML.** Two builds of the same code never match byte for byte, so the harness masks
  exactly what differs between any two builds and compares the rest:
  - each build's own BUILD_ID and `/_next/static/…` asset names / `dpl_…` ids;
  - the order of the streamed React payload: the document with its scripts removed must be identical, and the payload's rows
    identical as a set with stream-order row numbers masked;
  - /contact's per-request form token (`rendered`: the time it was served + its signature).

  I checked first that one build serves the same bytes on repeated requests, so these masks hide build-to-build noise, not changes.

### The existing harnesses

Run alone after the change:

| Harness | Result |
|---|---|
| seo-fixes | 86/86 |
| seo-geo-2, legal-follow-ups, faq-4, site-chrome-1, contact-1, costs-accounts-1, loyalty-1, perf-1 | pass (rc 0) |
| ai-search-1 | 28/28 |
| legal-languages-1 | 220/220 |
| about-page | 58/58 |
| compare-languages-1 | 24/24 |
| compare-de-1 | 93/93 |
| cwv-1 | 27/27 |
| language-phase-1e | 1022/1022 (re-pinned, below) |
| language-phase-1e-tidy | 61/61 (re-pinned) |
| plans-data-model | 154/154 (re-pinned) |
| copy-truth-1 | pass (re-pinned) |
| cwv-2 | 41/43, the **same two failures as unmodified HEAD** (re-pinned for proxy.ts / the legal pages; see §5) |

### Re-pins: older harnesses told about exactly these changes

Seven older harnesses pin these bytes against earlier commits and correctly flagged the change. Each now takes back **exactly**
gsc-index-2's edits, by name, and still compares every other byte. Each re-pin throws if an edit isn't there exactly once.
All of it lives in one module, **scripts/_lp-gsc-index-2.cjs** (registered under `shared_modules`):

| Harness | What it pinned | Re-pin |
|---|---|---|
| language-phase-1e (+ its committed cause list scripts/fixtures/language-phase-1e-us-changed.txt, regenerated by the harness) and language-phase-1e-tidy | legal metadata views and sitemap views | two named items, `gsc-index-2-legal-hreflang` and `gsc-index-2-legal-sitemap`, registered in scripts/_lp1e-named.cjs and language-phase-1e-tidy.cjs after site-chrome-1's |
| plans-data-model, copy-truth-1 | the sitemap (a view / a hash) | `sitemapBack`: the clusters and translated entries taken back exactly before comparing (tested on the real 244-entry sitemap: back to the 139; dropping one translation is caught) |
| cwv-2, and every caller of scripts/_moved-paths.cjs `changedSince` (loyalty-1, perf-1, costs-accounts-1, cwv-1) | proxy.ts and `app/(app)` byte-identical to an older commit | `asBefore(file, text)` takes back the /support block and the English pages' edits (verified: it returns HEAD's bytes exactly for all four files). `changedSince` applies it only when the commit compared against predates this work |

## 5. The full sweep

`node scripts/run-harnesses.cjs` on the final tree: **206 run, 203 passed, 3 failed. None of the three is caused by this work;
each fails the same way without it:**

| Harness | Failure | Without this work |
|---|---|---|
| `cwv-2` | 41/43: "Greek: exactly one value changed — landing.hero.cta" and "no other language file changed" (messages/) | the same two fail on unmodified HEAD (run in the before worktree). This work touches no message file; the change came with recent commits to messages/ |
| `messages-parity` | 597,452 passed, 2 failed: `nativeShell.binary.cameraUsage` (2 checks) | the same two fail on unmodified HEAD: ios-intl-1's new key |
| `event-types-render` | 4 measurements of the dashboard's event-types dialog at 820 px (16 px vs 14 px; line height) | it reads the main checkout's `.next` (built 14:04 today, not by me). It **passes** on both fresh builds, before and after (1,984 checks). Earlier reports list it as failing before (compare-languages-1) |

The first sweep, before I re-pinned plans-data-model and copy-truth-1, had 201/206. Those two were mine, and they now pass.

## 6. What you'll see after you deploy

- `https://www.hatchgrab.com/sitemap.xml`: 244 URLs. Search Console rereads it; there's no need to resubmit. Sitemaps should show the
  new discovered count after its next read.
- `curl -sI https://www.hatchgrab.com/support` → `308`, `location: /contact`.
- Any translated legal page, e.g. `/de/privacy`: 37 `<link rel="alternate" hreflang>` tags, the same set as `/privacy`.
- Search Console, by hand, after the deploy: if `/support` is one of the three "Not found (404)" URLs, **that** row's "Validate fix"
  can now pass. Leave "Crawled – currently not indexed" alone, as gsc-index-1 said: those are assets and can only fail.

## 7. Files

Committed, by path only, never `git add -A` / `.`:

- code: `components/legal/translated-legal.tsx`, `app/(app)/(legal)/privacy/page.tsx`, `app/(app)/(legal)/terms/page.tsx`,
  `app/(app)/(legal)/country-terms/page.tsx`, `app/sitemap.ts`, `proxy.ts`
- harnesses: `scripts/gsc-index-2.cjs` (new), `scripts/_lp-gsc-index-2.cjs` (new), `scripts/harnesses.json`, `scripts/_lp1e-named.cjs`,
  `scripts/language-phase-1e-tidy.cjs`, `scripts/fixtures/language-phase-1e-us-changed.txt`, `scripts/plans-data-model.cjs`,
  `scripts/copy-truth-1.cjs`, `scripts/cwv-2.cjs`, `scripts/_moved-paths.cjs`
- this report (a second commit)

Not touched: anything under ios/, android/, plugins/, messages/; the landing page; the translated page.tsx files (no change
needed). `docs/gsc-index-1-report.md` stays uncommitted, as that brief said.

Typecheck (`tsc --noEmit`) is clean. ESLint: the six code files have one existing warning (proxy.ts `isPublic`, not mine); the two
new harness files are clean; the edited harness files have exactly the lint counts they had at HEAD.

## 8. Notes

- The English legal pages now read the country list (the same 60-second cache the proxy uses) to build their hreflang. They were
  already rendered per request.
- The English legal pages are also served on the Village Foodie host with a HatchGrab canonical. Their new hreflang names HatchGrab
  addresses, matching that canonical.
- Prompt check: nothing in the brief arrived garbled, and no instructions contradicted each other. One reading choice: the
  brief lists the translated page.tsx files as files I might touch; they needed no edit, because they get the fix through `legalMetadata`.
