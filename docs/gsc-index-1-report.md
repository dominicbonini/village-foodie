# gsc-index-1 — Search Console "Some fixes failed for Page indexing issues": diagnosis

9 November 2026. Read-only: no code, commits, pushes, deploys or database writes. Everything below was fetched live from
www.hatchgrab.com with a Googlebot user agent, without following redirects, between 17:15 and 17:40 UTC.

## Verdict in one paragraph

The site's crawlable surface is healthy. All 139 sitemap URLs return 200, are indexable and canonical to themselves. Every
hreflang set on the country, features, FAQ and comparison pages is reciprocal. The live link graph has no 404s and no orphan
pages. The two "validation failed" results are expected and cannot be fixed. Asset URLs (JS/CSS chunks, a font, the manifest)
can never be indexed. Removed URLs keep returning 404, which is the correct answer. **One real defect turned up:**
the 35 countries' translated legal pages (/xx/privacy, /xx/terms, /xx/country-terms, 105 pages) declare hreflang to the
English pages, but the English pages declare nothing back. That gives 105 one-way pairs, which Google ignores. Those 105
pages are also missing from the sitemap. That is the only code fix I recommend.

---

## 1. robots.txt, the sitemap, and every URL in it

**robots.txt** (200, served by app/robots.ts): one `Sitemap:` line, `https://www.hatchgrab.com/sitemap.xml`.

**sitemap.xml**: 200, `application/xml`, 547 KB. It is a single `<urlset>`, not a sitemap index, so it has no children to follow.
It holds **139 URLs**:

| Group | Count | Status | Robots | Canonical | hreflang |
|---|---|---|---|---|---|
| `/xx` country pages | 44 | all 200 | `index, follow` | self | 45 entries (44 countries + x-default), all reciprocal |
| `/xx/features` | 44 | all 200 | `index, follow` | self | 45 entries, all reciprocal |
| `/xx/faq` | 44 | all 200 | `index, follow` | self | 45 entries, all reciprocal |
| `/uk/comparison/food-truck-ordering-system`, `/de/vergleich/foodtruck-bestellsystem` | 2 | 200 | `index, follow` | self | en-GB ↔ de-DE, reciprocal (no x-default, which is optional) |
| `/privacy`, `/terms`, `/country-terms`, `/contact`, `/about` | 5 | 200 | indexable (no noindex) | self | none (see §1a) |

No X-Robots-Tag header on any of them. The `<xhtml:link>` alternates in the sitemap match the `<head>` alternates on every page,
with one difference: the x-default is written `https://www.hatchgrab.com/` in the sitemap and `https://www.hatchgrab.com`
in the head. **They are the same URL.** An empty path normalises to `/`, so this is not a problem.

Every page also uses the same language code for itself that every other page in its cluster uses for it. No code mismatches.

**Sitemap URLs that are NOT 200 + indexable + self-canonical: none.**

**hreflang alternates that are not 200:** only the x-defaults, which are the routers:

| x-default | Answer |
|---|---|
| `https://www.hatchgrab.com` | 302 → `/uk` |
| `https://www.hatchgrab.com/features` | 302 → `/uk/features` |
| `https://www.hatchgrab.com/faq` | 302 → `/uk/faq` |

The 302 depends on the visitor's country. Pointing x-default at a locale-adaptive redirecting root is the pattern Google
documents for exactly this setup. **Do nothing.**

### 1a. The one real defect: the translated legal pages' hreflang is one-way

These pages are linked from the site and were therefore crawled, but they are not in the sitemap:

- `/xx/privacy`, `/xx/terms`, `/xx/country-terms` for the 35 non-English countries (ae at be bg br ch cy cz de dk ee es fi fr gr
  hk hr hu it jp li lt lu lv mx my nl no pl pt ro se si sk th): **105 pages**, all 200, indexable, self-canonical.
  The nine English countries (au ca gi ie mt nz sg uk us) correctly have no translations: `/uk/privacy` → 307 → `/privacy`.

Each translated page declares three alternates (code at [components/legal/translated-legal.tsx:55](../components/legal/translated-legal.tsx#L55)):

```
de-DE     → https://www.hatchgrab.com/de/privacy   (itself)
en-GB     → https://www.hatchgrab.com/privacy
x-default → https://www.hatchgrab.com/privacy
```

The English `/privacy`, `/terms` and `/country-terms` declare **no hreflang at all** (their metadata is `ownUrlMetadata(...)` only,
for example app/(app)/(legal)/privacy/page.tsx). Google ignores an hreflang pair unless both pages confirm it. That makes
**105 non-reciprocal pairs**, so today the language annotations on all 105 pages count for nothing. The translations also
do not list each other (de-DE does not name fr-FR, and so on), though Google expects every member of a cluster to list the
whole cluster.

This is the only hreflang problem anywhere on the site.

---

## 2. The three 404s

**The live site links to no 404.** The crawl:

- started at all 44 country homepages and went to depth 3 on www.hatchgrab.com;
- covered every sitemap URL, every hreflang alternate, every URL in `/llms.txt` and every URL inside JSON-LD blocks;
- checked every same-host `<a href>`, `<link href>`, `<script src>`, `<img src>` and `<source src>` it found (badges, icons,
  logos, the manifest, the .md/.json copies of the comparison pages).

That came to 501 distinct URLs fetched: 494 answered 200 and 7 answered 302 (the routers). Off-host links (Flipdish, Gastrodok, App Store, Google Play and
others) were recorded but not fetched. No crawled page links to a robots-blocked URL. `/llms-full.txt` is 404, but nothing
links to it.

So Google's three 404s are URLs it remembers from earlier, not URLs anything points to now. The Search Console summary
does not name them. These are the candidates I confirmed are 404 today and were real URLs at some point:

| URL | Today | History |
|---|---|---|
| `/support` | 404 | app/support/page.tsx deleted 20 Aug 2026 (commit e605bbfa "hg contact"); /contact replaced it |
| `/badges/google/<locale>.png` (27 files, e.g. `/badges/google/de-DE.png`) | 404 | deleted 8 Nov 2026 (c892cb3d, badges-manual-1); pages now use the .svg. Google fetched the PNGs while rendering |
| `/logos/churchviewcampsite.webp`, `/logos/nomadough.png.webp`, `/logos/STEAKANDHONOUR.png.webp` | 404 | deleted March–April 2026 |
| `/_next/static/chunks/<old-hash>.js?dpl=<old>` | 404 | chunks from builds Vercel no longer keeps (see §3) |
| `/pricing` | 404 | never a route (app/sitemap.ts says so), but a plausible guess by a crawler |

If the three turn out to be old chunks, badge PNGs or logos: a 404 is the correct, permanent answer for a deleted file, and
it does not hurt the site. If one is `/support`, a single 308 `/support` → `/contact` would recover any link equity it has
(see §6).

---

## 3. robots.txt vs /_next/static/ and /manifest.json

- robots.txt does **not** block `/_next/static/` or `/manifest.json`, for Googlebot or `*`. Its disallows are only the private
  paths in lib/robots-policy.ts (`/api/`, `/trucks/`, `/manage/`, `/dashboard/`, `/kds/`, `/admin`, `/o/`, `/order/`, `/p/`,
  `/embed/`, `/demo/`, `/setup`, `/auth/`, `/dev/`). That is correct: Google needs these assets to render the pages.
- A current chunk is 200 with `cache-control: public,max-age=31536000,immutable`. The same file under a made-up old `?dpl=` is
  also 200, because the query does not change which file is served. A chunk filename from a retired build is 404.
- The woff2 font (`/_next/static/media/…woff2`) is 200 `font/woff2`, and `/manifest.json` is 200 `application/json`.

**Conclusion:** the 22 chunks, the font and the manifest are listed under "Crawled – currently not indexed" only because
Googlebot fetched them as page resources while rendering, and Search Console files every fetched URL under some status. They are
not pages and will never be indexed. The `?dpl=` ids are Vercel deployment ids, and new ones appear with every deploy. As
old builds expire, some of these URLs will move from "Crawled – currently not indexed" to "Not found (404)". That is
expected and harmless.

---

## 4. The three /venues/<slug> URLs

The export's three slugs were not given to me. Instead I proved the rule is slug-independent: lib/host-redirects.ts matches
`^/venues/[^/]+/?$` on `www.hatchgrab.com` and `hatchgrab.com` and answers 308 to the same path on www.villagefoodie.co.uk,
with no database lookup.

| Request | Answer |
|---|---|
| `https://www.hatchgrab.com/venues/no-such-venue-xyz` | **308** → `https://www.villagefoodie.co.uk/venues/no-such-venue-xyz` |
| `https://www.hatchgrab.com/trucks` | 308 → `https://www.villagefoodie.co.uk/trucks` |
| `https://www.hatchgrab.com/hire` | 308 → `https://www.villagefoodie.co.uk/hire` |

**Confirmed: any /venues/<slug> on HatchGrab returns 308 to Village Foodie,** so the three in the export do too. On their next
recrawl they leave "Crawled – currently not indexed" and appear under "Page with redirect". **Do nothing.**

⚠️ **Side note for the Village Foodie property (not this report's scope):** `https://www.villagefoodie.co.uk/venues/no-such-venue-xyz`
answers **200**, a soft 404. If any of the three venues no longer exists, Google will land on a 200 page with no venue on
it. That property's Search Console would show it as "Soft 404". It is worth a separate workstream if venues get retired.

---

## 5. "Discovered – currently not indexed" (62): orphans

**There are no orphan sitemap URLs.** Every one of the 139 has at least one `<a href>` from another HatchGrab page in the
server-rendered HTML that Google reads first:

| Page type | Linked from (pages) |
|---|---|
| 44 `/xx` homepages | 249 each (the country picker on every page) |
| 44 `/xx/features` | 48–56 each |
| 44 `/xx/faq` | 91–104 each |
| `/uk/comparison/…`, `/de/vergleich/…` | 18 and 14 |
| `/privacy`, `/terms` | 101 each |
| `/country-terms` | 37 |
| `/about` | 421 |
| `/contact` | 3 by its bare address. Every other page links to `/contact?topic=General%20Enquiry`, which canonicalises to `/contact` |

So no country or language group is cut off. The 62 are URLs Google knows but has not yet spent crawl on. For a domain whose
indexed count went from 3 to 35 on 24 October, with 139 sitemap URLs plus 105 unlisted legal pages, that is normal backlog
and will drain over weeks. Two things slow it, and neither is a bug:

- nine English-language country pages (au ca gi ie mt nz sg uk us) carry near-identical copy, so Google tends to crawl and keep
  one or two and defer the rest even with correct hreflang;
- many URLs appeared at once (FAQ pages since 2 Nov, comparison languages since 8 Nov).

Without the 62-URL export I cannot say which ones they are. In Safari, open Page indexing → "Discovered – currently not indexed" →
Export, and the list will show which groups are waiting.

---

## 6. What to do, issue by issue

| Search Console row | What it is | Recommendation |
|---|---|---|
| **Not found (404): 3, validation failed** | Remembered URLs of deleted files or pages; nothing links to them | **Do nothing**, unless one is `/support`. Then the optional **code fix**: add `/support` → `/contact` (308) next to the existing cross-host rule in proxy.ts, or as a `redirects` entry in next.config.ts |
| **Crawled – currently not indexed: 26, validation failed** | 22 chunks + font + manifest (assets) + 3 /venues (now 308) | **Do nothing.** Assets are never indexed. The venues move to "Page with redirect" by themselves |
| **Discovered – currently not indexed: 62** | Crawl backlog; no orphans | **Do nothing** in code. Optional **Search Console action**: URL Inspection → "Request indexing" for a handful of priority non-English pages (e.g. /de, /fr, /es, /de/features). There is a daily quota, so do not try all 62 |
| **Excluded by 'noindex': 2** | Pages that ask not to be indexed. Most likely `/login` and `/signup` (`noindex, follow`, linked from every page), or a `/xx/compare` (`noindex, nofollow`, linked from each homepage) | **Do nothing** (expected) |
| **Alternative page with proper canonical: 1** | Almost certainly `/contact?topic=General%20Enquiry` (linked from 325 pages, canonical `/contact`) or one of the `/contact?country=XX` links | **Do nothing** (expected) |
| **Page with redirect: 3** | The routers `/`, `/features`, `/landing` (302 → `/uk…`), or `hatchgrab.com` / `http://` (308 → https www) | **Do nothing** (expected) |
| *(not yet a row)* translated legal pages: one-way hreflang + missing from sitemap | The real defect in §1a | **Code fix** below |

### The code fix (describe only; not applied)

**A. Make the legal hreflang cluster complete and reciprocal.**

1. Add one helper beside `legalMetadata` in components/legal/translated-legal.tsx, for example
   `legalLanguages(doc): Record<string, string>`. It returns `{ 'en-GB': HATCHGRAB_ORIGIN + LEGAL_DOC_PATH[doc],
   'x-default': HATCHGRAB_ORIGIN + LEGAL_DOC_PATH[doc] }` plus, for every country in `COUNTRY_PATH_SEGMENTS` whose document is
   actually translated (`legalDocumentSource(doc, { country, locale }).translatedInto` is set, the same test that stops the page
   redirecting), `{ [locale]: HATCHGRAB_ORIGIN + legalPath(doc, { country, locale }) }`.
2. In `legalMetadata` (line 55), use `languages: legalLanguages(doc)` instead of the three-entry object.
3. In app/(app)/(legal)/privacy, terms and country-terms page.tsx `generateMetadata`, add
   `alternates.languages = legalLanguages('privacy' | 'terms' | 'country-terms')` alongside what `ownUrlMetadata(...)` already
   returns, merging so the canonical is kept. The URLs are HatchGrab addresses on every host, matching their canonical.

The result: each legal document is one cluster of 36 entries (en-GB, 35 translations, x-default), and every member lists
all the others. One thing to watch: if two countries share a locale, `legalLanguages` must keep one entry per locale (the
same rule `countryPageAlternates` already follows for the country pages).

**B. List the 105 translated legal pages in the sitemap.** In app/sitemap.ts, add one entry per translated
`/xx/privacy|terms|country-terms` with the same `lastModified` as its English document (`legalUpdatedDate(...)`, or the
translation's own date if lib/legal-documents.ts keeps one), `changeFrequency: 'yearly'`, `priority: 0.3`, and
`alternates: { languages: legalLanguages(doc) }`. Give the three English entries the same `alternates`. The
legal-languages-1 report (line 383) already named this as "a small follow-up if wanted". The sitemap grows by about
105 URLs and some hundreds of KB of xhtml:link. It stays far below the 50,000-URL / 50 MB limit.

Neither change touches the landing page.

### "Validate fix": which buttons not to press

- **"Crawled – currently not indexed": do not press.** JS/CSS chunks, a font and a manifest can never be indexed, so
  validation can only fail again.
- **"Not found (404)": do not press** while the URLs are deleted files. A 404 on a deleted URL is the correct answer, and
  "validation" only checks whether they stopped being 404. Press it only if you add a redirect for one of them (e.g. `/support`),
  and only after that has deployed.
- **"Excluded by 'noindex'", "Alternative page with proper canonical", "Page with redirect": nothing to validate.** These are
  the site working as designed.
- **"Discovered – currently not indexed": pressing it does no harm but achieves nothing.** No fix was made, so it only queues
  a recheck.

### Search Console actions you can do by hand (Safari)

1. Page indexing → **Not found (404)** → open the row → read or export the three URLs. If `/support` is among them, ask for
   fix §6 row 1. Otherwise leave them.
2. Page indexing → **Discovered – currently not indexed** → Export, to see which country groups are waiting.
3. Optional: URL Inspection → paste `https://www.hatchgrab.com/de` (and a few other non-English priority pages) →
   **Request indexing**.
4. After fixes A + B have deployed: Sitemaps → confirm `https://www.hatchgrab.com/sitemap.xml` shows the new count
   (about 244) and "Success". There is no need to resubmit; Google rereads it.

---

## Method and limits

- Live checks with curl and a Python crawler (scratchpad only; nothing written to the repo apart from this file). The user agent
  was Googlebot's string. Vercel served the same pages as to a browser (no bot-specific variants seen).
- Search Console exports for the three 404s and the 62 discovered URLs were not available to me. §2 and §5 give the
  candidates and the way to confirm them.
- I did not run the three /venues slugs from the export. The redirect is proved for any slug by the rule's code and a live
  request with a made-up slug.
- Prompt check: nothing in the brief arrived garbled, and no two instructions contradicted each other.
