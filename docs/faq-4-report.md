# faq-4: the FAQ on its own page, and why Admin shows "Translating"

*2 November 2026. Status: **done**, committed on `main`, not pushed or deployed. No migration; nothing written to the database.*

## Why did Admin show "Translating"?

**No translation has ever been written: `faq_translations` is empty, because the only "FAQ translate" run so far was your manual dry run, which by design reads and writes nothing (its Translate step took one second).**

**No hourly run has followed yet: GitHub starts this repository's scheduled runs hours late (the competitor check, set for 02:10, ran at 09:21 today), and by 19:09 UTC none of the four :25 runs due since 15:25 had started. So run the workflow once with `dry_run = false` (or wait for the timer) and the counts will fill in.**

## PART 1 · "Translating": diagnosis, read-only

### The SQL (read-only MCP; nothing was written)

```sql
select locale, status, count(*) n, count(*) filter (where item_id is not null) items, count(*) filter (where section_id is not null) sections, min(translated_at) first_at, max(translated_at) last_at
from public.faq_translations group by locale, status order by locale, status;
-- → []  (0 rows; the same at 19:09 UTC)
```

```sql
select id, question_en, answer_en, answer_single_plan_en, status,
  length(question_en) ql, length(answer_en) al, answer_en <> btrim(answer_en) as answer_has_edge_space, question_en <> btrim(question_en) as question_has_edge_space,
  answer_en ~ '[   ]' as answer_has_nbsp, normalize(answer_en, NFC) <> answer_en as answer_not_nfc, normalize(question_en, NFC) <> question_en as question_not_nfc
from public.faq_items where status = 'published' order by id;
-- → 24 rows; every one of the five flags false on every row
```

```sql
select 'columns' k, string_agg(column_name||':'||data_type||case when is_generated='ALWAYS' then '(generated)' else '' end, ', ' order by ordinal_position) v from information_schema.columns where table_schema='public' and table_name='faq_translations'
union all select 'rls', relrowsecurity::text from pg_class where relname='faq_translations' and relnamespace='public'::regnamespace
union all select 'policies', coalesce(string_agg(policyname, ', '), 'none') from pg_policies where schemaname='public' and tablename='faq_translations'
union all select 'grants', string_agg(distinct coalesce(a.grantee::regrole::text,'PUBLIC'), ', ') from pg_class c cross join lateral aclexplode(c.relacl) a where c.relname='faq_translations' and c.relnamespace='public'::regnamespace
union all select 'pk', pg_get_constraintdef(oid) from pg_constraint where conrelid='public.faq_translations'::regclass and contype='p'
union all select 'rows', count(*)::text from public.faq_translations;
-- → the table as 20261060 made it (RLS on, no policies, postgres + service_role only); rows 0
```

Per published question, the bases with an `ok` row whose source_hash equals the website's hash now: **none, for all 24** (there are no rows to compare). The website's function and the workflow's are the same file, so they agree character for character by construction (faq-4 §2).

**The live data (read-only MCP; the counts read again at 19:09 UTC, unchanged):**
- **`faq_translations`:** 0 rows. No locale, no status, no failed row, no reason.
- **Published questions:** 24. For every one of them, **no language base has an `ok` row**, so every count reads 0/28: "● Translating — within the hour (0/28)".
- **The English, character by character:** no leading or trailing whitespace, no non-breaking or thin spaces, every text already NFC. The typographic ’ and “ ” are stored once and read identically by both sides.

**GitHub, read from its public API** (the repository is public; the run's log needs admin rights, so it couldn't be read):

| Run | Event | Result | Started | Steps |
|---|---|---|---|---|
| 41467450349 | `workflow_dispatch` (you) | **success** | 15:01:06 UTC | `npm ci` 53 s · **Translate 1 s** |

- **No scheduled run exists** (read again at 19:09 UTC: still this one run).
- The workflow file reached GitHub at **14:58:49 UTC** (your "FAQs" push), so the :25 runs at 15:25, 16:25, 17:25 and 18:25 were due.
- This repository's scheduled runs start late as a rule: the competitor check, cron 02:10, started at **09:21**.

**Supabase's own API log** (read-only): one translator run touched the database, at **15:02:21 UTC**.
- It read `competitor_check_settings` (the prices), then `faq_translations`, in the script's order.
- It made **no POST or DELETE on `faq_translations`, ever.**

**The cause:**
- **The run was a dry run.** A run with 29 questions and sections to translate ends in a second, with exit 0, only on the `--dry-run` path. A real run calls the model (minutes), and a real run whose every call fails exits 1 (red). My faq-2 report told you to run the dry run first, and that is the run on record.
- **Spend:** the translator records spend in its log only, not in the database. A dry run spends $0, so **the $2 cap never applied.**
- **The other causes the brief names were checked and are not it:**
  - **The hash:** the website (Admin and the public page) and the workflow already share one function, `lib/faq/source-hash.ts`. Both hash the raw database strings, with no trim and no normalisation on either side. The harness proves it (faq-4 §2).
  - **Skipped languages:** Admin never counted variants. It counts the 28 language bases.

**What finishes it:** GitHub › Actions › "FAQ translate" › Run workflow, `dry_run = false`.
- At the default $2 cap, the 29 jobs (24 questions, 5 section titles) take an estimated **two runs**. The hourly timer finishes whatever the first leaves.
- I haven't raised the cap.

### Fixed anyway (Part 1.2 and 1.3)

- **Admin's count now uses the public pages' own rule.**
  - **Before:** Admin counted a base as covered when its own row was fresh. A regional variant's page (de-AT, es-MX …) looks at the variant's row first and hides the question if that row is stale, so the two could disagree.
  - **Now:** a base counts only when **every visitor language it serves** would show the question (`coveredBases`). It uses `shownRow`, the function the public page renders with: de-DE serves de-AT, de-CH and de-LI; fr-FR serves fr-LU; es-ES serves es-MX; and so on.
  - "28/28" therefore means every non-English page shows it. English pages always have the English.
  - **Proved:** for every published question and DE, FR, JP and AR, "covered in Admin" ⇔ "shown on every page in that language"; and the US page shows them all. That holds with the fixture translations and with a stale de-AT row added: that row drops German from the count and hides the question in Austria.
- **The translator's output budget (a fix of my own code):**
  - The budget was about one token per 2.5 English characters per locale. Thai and CJK can need roughly one per character, so a long answer in 41 locales could hit the limit and lose every locale of that call.
  - It is now about 1.1 tokens per character per locale (at most 100,000).
  - A reply that stops at the limit is logged as such. Its locales are stored "failed" and retried.

## PART 2 · The FAQ on its own page

**Off every landing page:**
- `app/landing/page.tsx` is back to its pre-faq-3 version (a92f983a), plus only the later deliberate changes:
  - seo-geo-2's per-country `operatingSystem`;
  - store-badges-1's footer app flags;
  - the new footer FAQ link.
- **The FAQPage is gone from the landing `@graph`** (`landingGraph` lost its `faq` option).
- **`MARKETING_COPY_UPDATED`** is already `2026-11-02`, which is today, so the value stands. It drives the sitemap's lastmod, not the landing HTML.

**`/<country>/faq`, for every switched-on country, in its language** (`app/faq/page.tsx`, served through `app/[country]/faq/page.tsx`, as `/features` is):
- **The frame is `/features`' own, extracted into `components/landing/MarketingFrame.tsx`** (fonts, chrome, nav, footer, demo modal) and used by both pages. It is moved, not copied: `/features` renders **byte-identically** through it, apart from the new footer link (proven).
- **The question list** is the shared `<FaqDetails>` in the faq-3 look (`app/faq/faq.css`, moved from `app/landing/`).
- **The heading** is `landing.faq.title`.
- **The title and description** are two new keys, `landing.faq.metaTitle` ("Frequently asked questions | HatchGrab") and `landing.faq.metaDescription`, in en-GB and all 28 bases.
- **`/faq`** goes through the country router to the visitor's country's `/faq`, exactly as `/features` does: `faq` is now a `MarketingPage` (`ROUTER_PATHS`, `countryPageOf`). A switched-off country's `/xx/faq` → 302 to `/uk/faq`.
- **What shows:** only published questions with a fresh translation, by the same rules as before (`lib/faq/public.ts` `faqPage`).
- **A country with nothing to show:** its `/faq` is a **404**. It is left out of the sitemap, the FAQ pages' hreflang and the footer link, because all three read `faqCountries` / `faqHrefFor` from the same module.

**Search and AI:**
- self-canonical;
- **hreflang only between FAQ pages with content**, plus `x-default` → `/faq`;
- **FAQPage JSON-LD on this page only**: `@id` "<canonical>#faq", every question and answer the visible text exactly (`faqPageLd`, the builder the comparison pages use), alongside the Organization and WebSite;
- **in the sitemap**, with lastmod = the newest publish or translation time the page shows;
- **`/llms.txt`** links `https://www.hatchgrab.com/uk/faq` and keeps its English FAQ list;
- **IndexNow:**
  - the Admin route submits the FAQ pages that still have content after a public change;
  - the translator submits the FAQ pages in the languages it wrote rows for;
  - the automatic refresh is the same 60-second cache, now behind the FAQ pages.

**Footer:**
- An "FAQ" link (`landingFooter.faq`, all 28 bases) sits beside Features and Pricing on every HatchGrab marketing page: landing, features, compare, about, comparison and the FAQ page itself.
- It appears **only where that country's `/faq` has content.**
- Nothing was added to the header.
- **It shares Pricing's JSX slot.** A separate slot would have moved the country menu after it and changed React's generated ids on every page; the HEAD comparison caught that, exactly as it did in faq-3.

**Screenshots** (WebKit, real fonts; `scripts/faq-4-screens.cjs`, by hand):
- `docs/faq-4/faq-uk-1440.png`
- `docs/faq-4/faq-de-430.png` (the fixture German translations: three questions under "Häufige Fragen")
- Both pass these checks:
  - nothing scrolls sideways;
  - the page is in the `/features` frame;
  - the heading is centred;
  - the orange +/−;
  - the labels in small capitals.

## A note on the brief

The brief asks for the landing pages "otherwise identical to before faq-3 except the date". Two later workstreams changed those pages on purpose (seo-geo-2's `operatingSystem`, store-badges-1's footer badges), and this brief itself adds the footer FAQ link. So the comparison with a92f983a is made after those named changes, on both sides, and is otherwise byte for byte.

## Proof: `scripts/faq-4.cjs` (in `harnesses.json`), 80/80

1. **Admin's count equals public visibility** for DE, FR, JP and AR, for every published question, and US shows them all. This holds with and without a stale de-AT row (3/28 vs 4/28 for …0004), and every regional variant is counted with its base.
2. **One shared hash function:**
   - all three callers import `lib/faq/source-hash.ts`;
   - no other code hashes the English;
   - raw strings, so a curly versus a straight apostrophe, or a trailing space, is a different English.
3. **/uk, /us, /de, /jp landing pages:**
   - no FAQ section, heading or FAQPage;
   - identical to a92f983a apart from the named later changes;
   - the landing module no longer reads the FAQ.
4. **/uk/faq (24 questions) and /de/faq (3, in German):**
   - heading, title and description from the keys;
   - self-canonical;
   - FAQPage equal to the visible text;
   - hreflang only between FAQ pages with content (no it-IT, no es-ES);
   - `/uk/features` and `/de/features` byte-identical to a97c2a58 through the shared frame, apart from the footer link.
5. **No content:**
   - `/it/faq` (no Italian translation) and `/uk/faq` with nothing published are 404s;
   - the sitemap lists the FAQ pages with content and not `/it/faq` or `/es/faq`;
   - lastmod is the shown translations' time;
   - the sitemap's hreflang names content pages only.
6. **The footer link:**
   - `/uk`, `/de` and `/jp` have it; `/it` and `/es` don't;
   - the header never does;
   - `/uk/features` has it;
   - it sits in Pricing's slot.
7. **Routing and the rest:**
   - `/faq` → `/de/faq` for a German visitor, as `/features` → `/de/features`;
   - a switched-off `/it/faq` → `/uk/faq`;
   - `/llms.txt` links `/uk/faq` and keeps the list;
   - IndexNow names the FAQ pages;
   - the Admin route submits only pages with content.
8. **translation-check:** the three keys in en-GB and all 28 bases, structural 0, no flag on them.

The HEAD sides are `scripts/fixtures/faq-4-identity.json`, captured by this script in worktrees of a92f983a (landing) and a97c2a58 (features).

## Re-pinned harnesses (by name, each with a ⚠️ RE-PINNED note)

- **`scripts/_lp-faq-4.cjs`** (new, listed with the other named modules): `noFaqLink` (the footer's FAQ link) and `noLandingFaq` (faq-3's landing section, its FAQPage node and the final CTA's band flip). Each is a no-op on a page without the thing it removes, so both sides go through it.
- **faq-3:**
  - §1–§4 read `/<country>/faq`; the prices are still checked against the landing page's cards;
  - "between pricing and the final CTA" and the white/wash band became "the landing page carries no FAQ";
  - "nothing published" and "DE with no translation" are 404s;
  - §5's GB comparison page is hashed without the footer link;
  - §6 expects the two new keys beside the title.
  - 167/167.
- **faq-2:**
  - §4–§5 read `/<country>/faq` (prices from the landing page);
  - a language with no translation is a 404;
  - §6 is hashed through `_lp-faq-4.cjs`, with `scripts/fixtures/faq-2-identity.json` **recaptured at its own commit, 78e16437**. Only uk/us/ie changed; de/fr/jp/ae are byte-identical to the old capture.
  - 142/142.
- **seo-geo-2:**
  - §4 the same way, with `seo-geo-2-identity.json` **recaptured at dad7911a** (only uk/us/ie changed);
  - §7 reads `faqUrlsFor` and the FAQ pages: the Admin route sends only those with content, the translator those in the languages it wrote ok rows for.
  - 89/89.
- **faq-1** §8: the FAQ page, the sitemap and the marketing pages that link it may now import `lib/faq`. 205/205.
- **seo-fixes** §9: `/features`' fonts are read from `MarketingFrame.tsx`, where they moved unchanged. 86/86.
- **messages-parity** (`_messages-parity-1e.cjs`): `landingFooter.faq` named as new words. 547,168/547,168.

## Sweep

`node scripts/run-harnesses.cjs`, all **182** listed harnesses, after the re-pins: **176 pass, 6 fail. All six fail at HEAD (a97c2a58) too, with the same check:**

| Harness | The failing check (also at HEAD) |
|---|---|
| schedule-graphics-places | "the Feature gates the tab, the pane, the shortcut and both routes — and nothing else" (1) |
| canada-1 | 1 check (§7–9, as at HEAD) |
| europe-languages-1 | de-CH: no "ß" anywhere (1) |
| world-countries-1 | 1 check (the tagline, as at HEAD) |
| world-countries-2 | stops at "Terms edit — expected once, found 0: Last updated: 20 October 2026" |
| legal-languages-1 | stops at the same Terms date |

**No failure is new.** faq-4.cjs 80/80 and faq-4-screens.cjs 10/10 are in the sweep. `tsc --noEmit` is clean, and eslint is clean on every changed file.

## Files

- **New:**
  - `app/faq/page.tsx`, `app/[country]/faq/page.tsx`
  - `components/landing/MarketingFrame.tsx`
  - `scripts/faq-4.cjs`, `scripts/faq-4-screens.cjs`
  - `scripts/fixtures/faq-4-identity.json`
  - `docs/faq-4/*.png`
  - this report
- **Moved:** `app/landing/faq.css` → `app/faq/faq.css`.
- **Changed:**
  - `app/landing/page.tsx` (back to pre-faq-3, plus the later named changes and the footer link)
  - `app/features/page.tsx` (through the frame)
  - `app/about/page.tsx`, `app/compare/page.tsx`, `app/[country]/[section]/[slug]/page.tsx` (the footer link)
  - `components/landing/LandingFooter.tsx`
  - `lib/faq/public.ts` (`faqPage`, `faqHrefFor`, `faqCountries`), `lib/faq/translation.ts` (`coveredBases`, `VISITOR_LOCALES_OF`), `lib/faq/translator.ts` and `scripts/faq-translate/main.ts` (budget, stop reason, `okLocales`, FAQ-page IndexNow)
  - `lib/indexnow.ts` (`faqUrlsFor`), `app/api/admin/faq/route.ts`
  - `lib/marketing-country.ts`, `lib/visitor-country.ts` (`faq` as a marketing page)
  - `lib/structured-data.ts` (no FAQ option on the landing graph)
  - `app/sitemap.ts`, `lib/llms-text.ts`
  - `messages/*.json` (en-GB + 28 bases), `docs/i18n/back/*` (28), the generated catalogue
  - `scripts/harnesses.json`, `scripts/_lp-faq-4.cjs` and the re-pins above (faq-1, faq-2, faq-3, seo-geo-2, seo-fixes, `_messages-parity-1e.cjs`; the faq-2 and seo-geo-2 identity fixtures)
