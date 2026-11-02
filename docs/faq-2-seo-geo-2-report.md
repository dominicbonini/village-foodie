# faq-2-seo-geo-2: the FAQ in every language, then the search and AI fixes

*2 November 2026. Status: **built and committed on `main` (Part A and Part B separately), not pushed or deployed.***

- **Migration:** 20261060 ran and is verified.
- **Harnesses:**
  - Part A: `scripts/faq-2.cjs` 142/142. Its sweep was 179 run, 173 passed; the 6 failures all fail at HEAD too.
  - Part B: `scripts/seo-geo-2.cjs` 89/89. The final sweep was 180 run, 174 passed; the 6 failures all fail at HEAD too (§B7).
- **Still for you to do:** the translator and IndexNow workflows can't run until `main` is pushed. Click-by-click steps are in **"What you must click"**.

## Read this first

1. **sameAs (B3): one question for you.** The brief says "Leave sameAs empty until I send profile links", but it isn't empty: the Organization's `sameAs` holds the App Store and Google Play listings (`lib/structured-data.ts`, since seo-fixes).
   - Emptying it would change every landing page's JSON-LD beyond `operatingSystem`, which B7 rules out.
   - So I **left it exactly as it is** and added no profile links.
   - The question is at the end of my chat reply.
2. **"Every {token} present exactly once" (A2).** Some English answers use a token twice: …0001 has `{payg.name}` twice, `{pro.name}` twice and `{unlimited.name}` twice.
   - So the rule is: **each token as many times as the English has it, and none added.** "Exactly once" wherever the English has it once.
   - Read literally, "exactly once" would reject every correct translation of …0001.
3. **The public page wording for an English variant whose row is out of date** (A3 says English pages behave as now): it shows the English. It never hides the question. Non-English pages are strict: no up-to-date translation means hidden.
4. **Nothing could be dispatched from here.** `gh` isn't installed, `main` isn't pushed, and GitHub runs a `workflow_dispatch` only from the default branch on GitHub.

---

## PART A: THE FAQ IN EVERY LANGUAGE (commit `dad7911a`)

### A1 · Data: `public.faq_translations` (migration 20261060, run)

- **One row per (question, locale) and per (section, locale).**
  - `item_id` / `section_id` are foreign keys to `faq_items` / `faq_sections`, `on delete cascade`. Exactly one is set.
  - `source_id` is generated (the one that's set). The primary key is `(source_id, locale)`.
- **Columns:** `question`, `answer`, `answer_single_plan`, `title`, `source_hash` (sha256 of the exact English, 64 hex), `model`, `translated_at`, `status` (`ok` | `failed`) and `reason`.
- **CHECKs:**
  - a failed row has a reason;
  - an ok question row has its question and answer;
  - an ok section row has its title.
- **Security as `faq_items`:** RLS on, no policies, `revoke all … from anon, authenticated, public`, `grant all … to service_role`. Verified live (below).
- **The hash** (`lib/faq/source-hash.ts`):
  - for a question: sha256 of `["item", question_en, answer_en, answer_single_plan_en or null]`;
  - for a section: sha256 of `["section", title_en]`.
  - Any edit to any of those makes every translation of it out of date.

### A2 · The translator: a GitHub Actions workflow

- **Files:**
  - `.github/workflows/faq-translate.yml`
  - `scripts/faq-translate/main.ts` (run through `scripts/competitor-check/run.mjs`, as the checker is)
  - `lib/faq/translator.ts` (the run)
  - `lib/faq/translation.ts` (the rules)
- **Login:** the same Workload Identity Federation as `competitor-check.yml`:
  - `id-token: write`;
  - the OIDC token for audience `https://api.anthropic.com`, re-fetched every 60 s;
  - the same four repository variables.
  - **No API key anywhere.** The script refuses to run if `ANTHROPIC_API_KEY` is set.
  - Database access uses the same two secrets the checker uses.
- **When:** hourly at :25, plus manual dispatch (inputs: `dry_run`, `max_usd`).
- **What it translates:** every **published** question, and every section holding one, where:
  - the row is missing, or
  - `source_hash` ≠ the current English, or
  - the row failed.
- **Which locales** (from `lib/i18n/locales.ts`; no list typed):
  - **the 28 language bases**, always;
  - **de-CH** derived from de-DE by **ß → ss** (the site's Swiss rule), with no model call. It gets a row only where de-DE has a ß; **de-LI** reads de-CH.
  - **the other variants** are asked of the model with their parent, and it returns one only where the wording truly differs; otherwise there is no row and the page reads the parent (35.am-5):
    - en-US, en-IE, en-AU, en-NZ, en-CA, en-MT, en-GI, en-SG
    - de-AT, nl-BE, el-CY, fr-LU, es-MX
  - A variant is re-decided whenever the English changes. A variant row the model no longer returns is deleted.
- **Model and words:**
  - The model is `claude-sonnet-5-5`, through one forced tool (`save_translations`).
  - Each language gets its own words:
    - its glossary (`lib/i18n/glossary/<lang>.json`: use-terms and notes);
    - its plan names from its own message file;
    - key terms and sample sentences for register (`landing.meta.title`, `meta.description`, `jsonLd.audience`, `does.capacityBody`, `steps.menuBody`, `faq.title`).
  - All locales' words are one **cached** system block. The 29 calls of a full run pay for them once.
- **Cost and the cap:**
  - Each call's cost comes from the model's prices in `competitor_check_settings.prices`, which are data. With no price the run stops.
  - Every call logs its locales, how many were ok or failed (with reasons) and its cost; the run logs a total.
  - **Spend cap per run:** `--max-usd`, default $2. No call starts once the run has spent it, and the rest waits for the next run.
- **Nothing stale:** the run reads three tables, prints one line, and ends **before any login or model call**. In the dry run it took about 0.35 s.
- **Rejected unless** (`itemProblem` / `titleProblem`):
  - every `{token}` from the English appears the same number of times, none is added, and there are no stray braces;
  - **no typed number:** only figures the English itself types outside a token, in ASCII ("60 seconds" in question 6). A digit in any other script is refused.
  - **no currency symbol;**
  - **no plan name** (English or the locale's own, as a whole word);
  - **no Pay at Hatch / pay-at-the-truck / pay-on-collection wording:** the English list, plus the locale's own "Pay at Hatch" words;
  - **length** 0.25–3× the English (0.1× for Japanese and Chinese, which write far fewer characters: "Reaching customers" is 集客), and at most 4000 characters;
  - no token in a question or title.
- **A rejected text** is stored `failed` with its reason. It is never shown and is retried next run. A base the model didn't return is `failed` ("not returned by the model").
- **Expected first-run cost**, from the dry run's sizes: 29 calls, each with about 1–1.5 k characters of question plus a ~61 k-character cached block. That's roughly $2–4 at the stored prices, so the default $2 cap finishes it in **two hourly runs**. After that only edited questions are re-done.

### A3 · What visitors see

- **Every switched-on country's landing page** shows the FAQ in its own language (`lib/faq/public.ts`; `shownRow` in `lib/faq/translation.ts`):
  - **Non-English page:** a question shows only with a translation that is `ok` **and** made from the current English. Otherwise it is hidden: never English, never out of date.
    - On the way down the locale chain (es-MX → es-ES; de-LI → de-CH → de-DE), the **first row found decides**. A stale variant hides the question rather than falling through to its parent's text.
    - A section needs an up-to-date title; a section with nothing visible is left out; with nothing at all, the whole FAQ (and its FAQPage) is left out.
  - **English pages behave as now:** the English, or an English variant's own row where it's up to date. An out-of-date variant row falls back to the English.
- **The FAQPage JSON-LD** is built from the same visible pairs, in the page's language. It is proven equal to the visible text for DE, FR, JP and AR.
- **Arabic pages** keep `dir="rtl"` from `app/layout.tsx` (35.an-24).
- **Live values** are filled in the page's language: plan names from the language's catalogue, the apps sentence in its words, prices from the pricing cards.
- **Logging:** one log line per page lists what has no up-to-date translation yet (the translator's backlog), instead of one line per question.
- **No deploy needed:**
  - A translation run writes the database; every instance shows it within the pages' 60-second cache (the faq-3 mechanism).
  - An Admin save still clears the cache on its own instance at once.
  - (B6 adds the IndexNow submission after both.)
- **Today, live:** no translations exist yet, so every non-English page shows **no FAQ** until the first run.

### A4 · Admin › FAQ: the mockup's translation indicators

- **Per question:**
  - "✓ Translations 28/28 up to date";
  - "● Translating — within the hour (n/28)";
  - "✕ n failed", with each failure's locale and reason on hover;
  - "○ Translates when published" for a draft.
  - Counted on the server against the **current** English (`translationSummaries` in `lib/admin/faq-actions.ts`), and re-read after every save.
- **The summary strip:**
  - "🌍 44 countries · 28 languages";
  - "✓ N published, all translations up to date", or "· ● n translating · ✕ n with failed translations".
- **Preview as:**
  - Each country is labelled in its own language's words: "Germany · Deutsch", "Brazil · Português", "Japan · 日本語".
  - The preview line shows that country's up-to-date translation with its live values. The language's words are loaded in the browser.
  - With no translation it says "no up-to-date Deutsch translation yet, so it is hidden on Germany’s page …".
- **Admin text stays English** (35.an-20).

### A5 · `faq.phrases.*` in all 28 bases

- The three phrases (`appsSentence`, `appsOffline`, `webOffline`) are in every base, using each language's own terms for walk-up orders, the web dashboard and losing signal, and its register.
- Back-translations are in `docs/i18n/back/`.
- **translation-check: 0 structural in all 28.** It was 3 before.
- The German avoids ß ("zusätzlich"), so de-CH needs no override.

### A6 · Proof: `scripts/faq-2.cjs` 142/142

1. **The rejections, with fixtures:**
   - a token missing, doubled, used fewer times than the English, added or misspelt;
   - a typed price, a typed number, a number in Arabic-Indic digits;
   - a currency symbol, a plan name;
   - "Pay at Hatch", `{payAtTruck}`, "pay when they collect", and the locale's own words;
   - too long, too short;
   - a missing single-plan answer, a token in the question, an empty answer.
   - Also: the English's own "60" is allowed, but "٦٠" isn't; 集客 passes for Japanese.
2. **Which locales and what's stored:**
   - full jobs, a single failed base retried alone, nothing to do when fresh;
   - failed rows with reasons; "not returned" bases;
   - an omitted variant gets no row and its old row is removed;
   - de-CH derived where there's a ß and removed where there isn't;
   - a failed row is never shown and is retried.
3. **A run with a fake model:**
   - nothing stale → no call, one line;
   - the cost from the prices, logged;
   - the spend cap (2 calls, then 22 left for the next run);
   - a dry run calls and writes nothing;
   - the cached system block.
4. **The freshness rule:**
   - an English edit hides …0004 on /de, /fr, /jp and /ae (and logs it), while /uk shows the new English at once;
   - re-translated → shown again;
   - a failed row is never shown, and never replaced by English;
   - en-US: an up-to-date row shows, an out-of-date one falls back to the English;
   - es-MX reads es-ES; a stale variant hides.
5. **DE, FR, JP and AR in their own language:**
   - the heading (`landing.faq.title`), the section labels, exactly the three translated questions;
   - no English on the FAQ, live values in the page's words, every amount one the pricing cards print;
   - FAQPage `@id` = canonical + `#faq`, equal to the visible text;
   - `dir="rtl"` for Arabic.
6. **Byte-identical to HEAD (78e16437):**
   - GB, US and IE pages;
   - DE, FR, JP and AE pages with no translations.
7. **A dry run of the workflow's own script against fixtures:**
   - no login or database variables in the environment, exit 0;
   - 29 jobs planned, nothing called;
   - fresh fixture rows not asked again;
   - nothing stale → "Nothing to translate … No model call." in about 0.35 s.
8. **The workflow:** hourly and dispatch, the keyless login, no API key, the cap input, concurrency.
9. **Admin:** every indicator, the summary, Preview as.
10. **translation-check:** 0 structural in all 28.

**Re-pinned for Part A** (each pin names faq-2, with the reason in the file):
- `faq-1.cjs` (206):
  - seven files in `lib/faq`;
  - the summary chip;
  - the indicators now present;
  - 20261060 after 20261058/59;
  - two new importers of `lib/faq`.
- `faq-3.cjs` (176): structural 0, not 3.

**The Part A sweep:** 179 run, 173 passed, 6 failed. All 6 fail at HEAD too:
- schedule-graphics-places (1) and canada-1 (1);
- world-countries-2 and legal-languages-1 (both stop on the "Terms edit … Last updated: 20 October 2026" guard);
- europe-languages-1 (1: de-CH ß);
- world-countries-1 (1: the tagline in source).

The faq.phrases failures expected before now pass: france-1, country-picker-1, languages-1, and 28 + 7 in europe-languages-1 / world-countries-1.

---

## PART B: SEARCH AND AI FIXES (commit `e1c69096`)

### B1 · Every indexable route, both hosts (checked with curl on 2 Nov; one deployment serves both)

**Key to the table:**
- **SM:** in that host's sitemap.
- **Idx:** indexable (no noindex header or meta, 200).
- **Content:** real content in the server HTML. "client" means the page's content arrives by JavaScript after load.

| Path | www.hatchgrab.com | www.villagefoodie.co.uk |
|---|---|---|
| `/` | 302 → /uk (the router, expected) | 200 · SM · Idx · client (the discovery map) |
| `/uk`, `/<cc>` (44) | 200 · SM · Idx · real | 404 |
| `/<cc>/features` (44) | 200 · SM · Idx · real | 404 |
| `/<cc>/compare` | 200 · noindex (by design) | 404 |
| `/features`, `/compare`, `/landing` | 302 → country page (router) | 404 / 404 / 308 → / |
| `/1ng7n4p5omux2gdk9kqvwz` (landing preview) | 302 → /uk | **200 · Idx · canonical → hatchgrab.com** → **now 308 → www.hatchgrab.com** |
| `/about`, `/contact` | 200 · SM · Idx · real | /about 404; /contact 200 · SM · Idx (self-canonical) |
| `/privacy`, `/terms`, `/country-terms` | 200 · SM · Idx | 200 · canonical → hatchgrab.com (not in VF sitemap, correct) |
| `/<cc>/privacy` etc. (translated legal) | 200 · Idx (canonical self) · not in sitemap | 404 |
| `/de/vergleich/…`, `/uk/comparison/…` | 404 noindex (no comparison is live) | 404 |
| `/llms.txt` | 200 | 404 (by design) |
| `/hire` | **200 · Idx · "Hire a Food Truck \| Village Foodie"** → **now 308 → VF** | 200 · Idx · thin (static) |
| `/trucks` (directory) | **200 · Idx · client** → **now 308 → VF** | 200 · Idx · client |
| `/venues/<slug>` | **200 · Idx · client ("Venue \| Village Foodie")** → **now 308 → VF** | 200 · Idx · client → **noindex, follow when no upcoming public event** |
| `/trucks/<slug>` | 200 · noindex (vercel.json) · robots-disallowed | same |
| `/trucks/<slug>/order` (the order page) | 200 · noindex · robots-disallowed | same |
| `/o/<x>`, `/order/<x>`, `/p/<x>`, `/embed/<x>` | noindex (headers) | same |
| `/app` | **200 · Idx · thin** → **now noindex** | same → noindex |
| `/setup`, `/forgot-password`, `/reset-password` | **200 · Idx · thin** → **now noindex** | VF: /setup 200 → noindex; the other two 307 → HG |
| `/login`, `/signup` | 200 · noindex, follow | /login 307 → HG; /signup 200 noindex |
| `/dashboard`, `/manage`, `/kds`, `/admin`, `/verify-email` | 307 → /login (or admin gate, noindex) | 307 → hatchgrab.com |
| `/try/<slug>` | 200 · noindex | same |
| `/domain`, `/dev/*`, `/landing/features-pdf` | 404 | 404 |
| root-level truck slugs (e.g. `/pizzeria-gusto`) | **not a route:** 404 (`app/[country]` accepts only the listed country segments) | 404 |

**What changes, and why** (`lib/host-redirects.ts`, `proxy.ts`, `lib/venue-index.ts`, `vercel.json`):

- **On www.hatchgrab.com (and the apex), 308 to the same path on www.villagefoodie.co.uk, query kept:**
  - `/venues/<slug>` (every venue);
  - `/trucks` (the directory);
  - `/hire`.
  - Each is titled "… | Village Foodie" and exists there.
- **On www.villagefoodie.co.uk, 308 to www.hatchgrab.com:** `/1ng7n4p5omux2gdk9kqvwz`. It was the HatchGrab landing page served on the Village Foodie domain, indexable, with its canonical pointing at hatchgrab.com.
- **Not moved, on purpose:**
  - **`/trucks/<slug>/order`** is HatchGrab's order page. WhatsApp replies, the payment return URL and the printed QR (`/o` → `/order` → here) all land on it, and moving ordering to another domain would change how customers pay.
  - **`/trucks/<slug>`**: whether a truck exists on Village Foodie (UK only) is a database question the edge can't ask.
  - Both already send `X-Robots-Tag: noindex` and are disallowed in robots.txt, which satisfies "otherwise noindex".
- **Village Foodie venue pages:**
  - With no upcoming public event: **`noindex, follow`**. With events: unchanged (indexable).
  - Decided on the server in `generateMetadata`, from the **same** events feed (`app/api/discovery/events`, Village Foodie's host) and the **same** key (`venueGroupKey`) the page's schedule uses, so the two can't disagree.
  - An unreadable feed adds nothing.
  - No route was deleted.
  - **As of 2 Nov:** 992 venue pages in the sheet, 83 with upcoming public events, so **909 become `noindex, follow`**. A further 24 event venues aren't in the sheet; they have events, so they stay indexable.
- **Thin utility pages** `/app`, `/setup`, `/forgot-password`, `/reset-password` get `X-Robots-Tag: noindex` (vercel.json, both hosts).
- **Only the production hosts are affected:** preview, local and custom hosts are untouched (proven through the real proxy).

**Every page whose status changes:**
- the three groups on hatchgrab.com → 308;
- the preview path on villagefoodie.co.uk → 308;
- 909 venue pages → noindex, follow;
- 4 utility paths → noindex;
- the landing pages' JSON-LD `operatingSystem` (B3);
- `/llms.txt`'s content (B4);
- the custom-domain credit's link target (B5).

### B2 · Every sitemap URL, and Google's 7 not-indexed pages

**Both sitemaps, every URL checked** (curl, redirects not followed):

| | hatchgrab.com (93 URLs) | villagefoodie.co.uk (2 URLs) |
|---|---|---|
| answers 200 | 93/93 | 2/2 |
| no redirect | 93/93 | 2/2 |
| indexable | 93/93 | 2/2 |
| self-canonical | 93/93 | /contact self; `/` has **no canonical tag** (allowed; not changed) |
| hreflang alternates answer 200 | every alternate except **`x-default`** | (none) |

- **The x-default:** on each country page it is `https://www.hatchgrab.com` (or `/features`), which is **the `/` router: a 302 to the visitor's country page**. That is the expected router redirect, so **it stays**, as the brief says (Language Phase 1e chose it deliberately).
- **The 93 URLs:** 44 landing pages, 44 features pages, `/privacy`, `/terms`, `/country-terms`, `/contact`, `/about`. No comparison page is live, so none is listed.

**Google's 7 not-indexed pages** (Search Console, 29 Oct: 3 "Crawled – currently not indexed", 3 "Page with redirect", 1 "404"). I can't see Search Console, so this is from what's visible:

- **"Page with redirect" (3) is expected, and stays:**
  - `https://hatchgrab.com/` (308 → www);
  - `https://www.hatchgrab.com/` (302 → /uk);
  - one of `/features`, `/landing` or `/compare` (302 → the country page).
  - All are the router or the apex; none is in a sitemap.
- **"Not found (404)" (1)** is most likely a path that once existed or was guessed:
  - `/pricing` (a section, not a page);
  - `/landing/features-pdf` (404 today);
  - a switched-off country's old address;
  - or a comparison address before it was live.
  - Nothing in either sitemap is a 404.
- **"Crawled – currently not indexed" (3):** Google fetched them and chose not to index them. On www.hatchgrab.com the likeliest are:
  - the Village Foodie pages served on the HatchGrab domain: `/hire`, `/trucks` and `/venues/…`. They're thin or client-rendered, off-brand for the host, and not in the sitemap.
  - This is fixed by B1's 308s.
  - **Or** new country pages that were only days old: they're in the sitemap now, self-canonical and indexable, so time and the IndexNow/Search Console submissions are what's left.
- **Also ours, and fixed:**
  - the preview page indexable on villagefoodie.co.uk;
  - the four thin utility pages.
- **Not ours to fix in code:** `https://villagefoodie.co.uk/` → www answers **307 (temporary)**. That's the Vercel domain setting; Settings › Domains can make it a permanent redirect.

### B3 · `SoftwareApplication.operatingSystem`, true per country

- It is "Web" everywhere, plus "iOS" / "Android" only where that country's `ios_app_available` / `android_app_available` is true (`operatingSystemsOf`, the landing page's existing app flags).
- **Live today:** GB "Web, iOS, Android"; the other 43 "Web". At HEAD every page said "Web, iOS, Android".
- **sameAs is unchanged** (see "Read this first" 1).

### B4 · `/llms.txt`

- **A "Features" section:** the landing's six tiles, in English, in the site's own words (`landing.does.*`):
  - collection times, capacity, any device, social posts;
  - WhatsApp auto-replies (live, per `WHATSAPP_LIVE`);
  - offline protection.
- **"Frequently asked questions":** the published questions exactly as the UK page shows them (24 today, …0010 excluded), resolved for GB, under the section titles.
  - The GB home form **is** the international form for GBP (`intlMoneyFormatOf` equals the home form unless the symbol is shared), so the prices are "£29".
- **Every country's lines are in English, in the side-by-side form:**
  - amounts in the international form written the English way: "€29", "SEK 329", "A$39", "¥1,980", "CZK 699";
  - percentages "0.99%";
  - the card sentence is the pricing footnote in English: the country's own English footnote for English countries ("in the UK", "in Ireland", "EFTPOS"); the English footnote with the English name for the rest ("in Germany", "in the Netherlands", "in the United Arab Emirates");
  - every figure is international.
  - Before, each card sentence was in the country's own language, and German, Swedish and other amounts were "29 €" / "0,99 %".
- **Everything is read from data;** no sentence is invented.
- The route passes the GB FAQ (`landingFaq` for the GB row).

### B5 · Links back

- **Custom-domain pages** (`/domain`): the "Powered by HatchGrab" credit was a plain followable link (no `rel`, no `target`) to the **root**, which is the country router (302 by the visitor's country).
  - It now links to **the truck's own country page** (`/uk`, `/de` …).
  - It is still a plain followable link, with no nofollow.
- **Pages with no such link, for you to decide (with a mockup if you want one):**
  - **The order page** (`/trucks/<slug>/order`):
    - Its header's brand mark links to `/` (relative). On hatchgrab.com that is the router, not the truck's country page. It is followable.
    - Making it the truck's country page would need a host-specific link in the order page's header, which 35.al-3 and your "don't touch the order page's layout" rule out. **Not changed.**
  - **The truck page** (`/trucks/<slug>`): the same `/` brand mark. Not changed.
  - **The embedded schedule widget** (`/embed/<slug>`, on operators' own sites): **no HatchGrab link at all.**
- **No link or text was added anywhere.**

### B6 · IndexNow (Bing, and through it ChatGPT search and Copilot)

- **Key file:** `public/07509b28087e749402ef79858216bd5a.txt`, served at the root of both hosts. The key is public by design.
- **After every production deploy:** `.github/workflows/indexnow.yml` runs on push to `main` (or manually).
  - It **waits for the Vercel production deployment of that commit**, using the GitHub deployment Vercel creates (environment "Production", status success). It waits up to 30 minutes and submits nothing if it doesn't appear.
  - Then `scripts/indexnow/main.ts` reads both sitemaps and **probes every URL** (redirects not followed). It leaves out any that:
    - doesn't answer 200 itself;
    - says noindex (header or meta);
    - names another canonical.
  - It submits the rest, one request per host, and **logs every response** and every left-out URL with its reason.
- **After a FAQ change:** the Admin route, only for a change to what a public page shows (publish, unpublish, delete, a move, a section rename or delete, or a save of a published question's text or Show in), and **only in production**.
  - After the response (`keepAlive`), it submits every switched-on country's landing page.
  - An English edit also hides the question in every other language until it's re-translated, so every page changes.
- **After a translation run that wrote rows:** the switched-on countries whose page language reads a changed locale (a de-DE row → DE, AT, CH, LI), submitted after the pages' 60-second cache. Never in a dry run.
- **Never submitted:** noindex or redirecting URLs.
  - The deploy run probes first.
  - The FAQ and translation runs name only switched-on landing pages, which are 200, self-canonical and indexable.
- **A failed submission** is logged and changes nothing else.

### B7 · Proof: `scripts/seo-geo-2.cjs` 89/89, and the sweep

1. **Redirects through the real proxy:**
   - the five hatchgrab.com cases (query kept) and the apex → Village Foodie;
   - the preview on Village Foodie → hatchgrab.com;
   - 14 hatchgrab.com paths and 5 Village Foodie paths untouched;
   - preview, local and custom hosts untouched.
2. **Venue pages:**
   - events → nothing added; none → `noindex, follow`;
   - an unknown slug → noindex, follow;
   - the venueGroupKey fallback works;
   - the feed down → nothing added;
   - the 4 noindex headers are present.
3. **operatingSystem:**
   - the pure function in four cases;
   - GB / US / DE / JP pages;
   - the flags decide it (US with both, US with iOS only);
   - sameAs unchanged.
4. **Landing pages vs HEAD (dad7911a):** UK, US, IE, DE, FR, JP, AE and BR are identical apart from `operatingSystem`, and GB is fully byte-identical. HEAD said "Web, iOS, Android" everywhere; now only GB does.
5. **/llms.txt (the real route):**
   - the six features;
   - the 24 FAQ answers exactly as the UK page shows them, titles in order, no draft, no banned wording, £ prices;
   - no home-form amount anywhere; €29 / SEK 329 / A$39 / ¥1,980;
   - all 44 card sentences in English, with the English country names and international figures;
   - nothing non-English left.
6. **The credit:**
   - a plain followable link to the truck's country page;
   - `/domain` passes it;
   - the order page isn't extended.
7. **IndexNow:**
   - the key file;
   - a 200 self-canonical page fit; 302, 308, 404, header noindex, meta noindex and another canonical never submitted;
   - payload per host, deduplicated, https only;
   - responses logged; a network failure is a result;
   - the de-DE locale → AT, CH, DE, LI;
   - the FAQ route only for public changes and only in production;
   - the translator only for pages it changed, never in a dry run;
   - the deploy workflow waits for the deployment.

**Re-pinned for Part B**, each by name, in one shared module (`scripts/_lp-seo-geo-2.cjs`, registered with the shared modules). Each transform is precise, and throws if the old value isn't there:
- **The router check** (`_lp1e-checks.cjs`, language-phase-1e-tidy): `/trucks`, `/hire` and `/venues/*` on hatchgrab.com, and the preview on villagefoodie.co.uk, expected as 308 to the other host. Every other untouched path is still compared with its snapshot.
- **The landing JSON-LD's operatingSystem** in the snapshot-comparing harnesses:
  - language-phase-0, language-phase-1e and -1e-tidy, through their named-change registries;
  - plans-data-model (its seo-fixes step builds the expected JSON-LD from BEFORE, so AFTER's "Web" is set back, after checking it's there);
  - pricing-pages and ai-search-1 (their fixture rows set no app flag, so "Web" is expected).
- **The hash-only harnesses** (copy-truth-1, faq-1, faq-2, faq-3): the landing HTML is hashed as HEAD rendered it, with "Web" set back to "Web, iOS, Android". Every other byte is still compared.
- **/llms.txt:** no longer compared with HEAD in copy-truth-1 and faq-1, because B4 rebuilt it on purpose and seo-geo-2.cjs §5 proves its content. copy-truth-1 also checks the new Features section is there.
- **faq-1:** `app/llms.txt/route.ts` and `lib/llms-text.ts` are allowed importers of `lib/faq` (the FAQ in /llms.txt).
- **faq-3:**
  - the route's `finally` now also schedules IndexNow, so the regex checks the clear only;
  - "/llms.txt untouched by faq-3" compares faq-3's own commits (a92f983a..78e16437).

**The full sweep after Part B:** `node scripts/run-harnesses.cjs`, **180 run, 174 passed, 6 failed.** Every listed file passes the screen (no harness names the payment provider).

**Fail at HEAD too (not this work's), the same 6 as the Part A sweep:**

| Harness | Fails | Why |
|---|---|---|
| schedule-graphics-places | 1 | fails at HEAD |
| canada-1 | 1 | the "postal code / card terminal" frame check |
| europe-languages-1 | 1 | de-CH ß |
| world-countries-1 | 1 | "no source file … still carries the words" (the tagline) |
| world-countries-2 | stops | "Terms edit — expected once, found 0: Last updated: 20 October 2026" |
| legal-languages-1 | stops | the same error (it calls world-countries-2's module) |

**Nothing else fails.** The faq.phrases failures expected before faq-2 (france-1, country-picker-1, languages-1, and 35 checks in europe-languages-1 / world-countries-1) are gone, because A5 translated them.

The first Part B sweep, before the re-pins, had these ten failing in addition; each was a named change, now re-pinned as listed above:
- language-phase-0, -1e and -1e-tidy;
- plans-data-model, pricing-pages, ai-search-1;
- copy-truth-1, faq-1, faq-2, faq-3.

---

## What you must click

1. **Push `main` to GitHub.** Vercel deploys it, and `.github/workflows/indexnow.yml` then runs on its own:
   - it waits for the production deployment and submits both sitemaps' fit URLs;
   - its log is in GitHub › Actions › "IndexNow".
2. **GitHub › Actions › "FAQ translate" › Run workflow** (branch `main`):
   - First run it with **dry_run = true** to see the plan and cost estimate without calling the model.
   - Then run it again with dry_run = false (max_usd 2, the default).
   - The first full translation takes **two runs** at the $2 cap (about 29 calls in all). The hourly timer then finishes anything left.
   - It uses the competitor check's existing repository variables (`ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID`) and its two secrets (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Nothing new is needed, provided the federation rule allows any workflow in the repository and not just `competitor-check.yml`. If its first run fails at the login, that rule is the place to look (Anthropic Console › the federation rule's subject or workflow condition).
3. **Optional, Vercel › Settings › Domains:** make `villagefoodie.co.uk` → `www.villagefoodie.co.uk` a permanent (308) redirect. It is 307 today.
4. **Optional, Bing Webmaster Tools:** after the first IndexNow run, Bing › IndexNow should list the submissions.

## Files

- **Part A:**
  - `supabase/migrations/20261060_faq_2_translations.sql`
  - `lib/faq/translation.ts`, `lib/faq/source-hash.ts`, `lib/faq/translator.ts`
  - `scripts/faq-translate/main.ts`
  - `.github/workflows/faq-translate.yml`
  - `lib/faq/public.ts`
  - `app/landing/page.tsx` (comments)
  - `lib/admin/faq-actions.ts`, `lib/admin/faq-store.ts`
  - `components/admin/FaqTab.tsx`
  - `messages/*.json` (28 bases: `faq.phrases`), `docs/i18n/back/*` (28), and the generated catalogue
  - `scripts/faq-2.cjs`, `scripts/fixtures/faq-2-translations.json`, `scripts/fixtures/faq-2-identity.json`
  - `scripts/faq-1.cjs`, `scripts/faq-3.cjs` (re-pins)
  - `scripts/harnesses.json`
- **Part B:**
  - `lib/host-redirects.ts`, `proxy.ts`
  - `lib/venue-index.ts`, `app/venues/[slug]/page.tsx`
  - `vercel.json`
  - `lib/structured-data.ts`
  - `lib/llms-text.ts`, `app/llms.txt/route.ts`
  - `components/embed/EmbedParts.tsx`, `app/domain/page.tsx`
  - `lib/indexnow.ts`, `public/07509b28087e749402ef79858216bd5a.txt`
  - `scripts/indexnow/main.ts`, `.github/workflows/indexnow.yml`
  - `app/api/admin/faq/route.ts`
  - `scripts/faq-translate/main.ts` (the IndexNow hook)
  - `scripts/seo-geo-2.cjs`, `scripts/fixtures/seo-geo-2-identity.json`
  - the re-pins listed in §B7
  - this report

## Migration as run

`npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261060_faq_2_translations.sql`

```
db-migrate: supabase/migrations/20261060_faq_2_translations.sql · sha256 18d7045a0856d562 · committed at 0cfa7f5a
db-migrate: supabase/migrations/20261060_faq_2_translations.sql applied — one transaction, no error
```

```sql
-- 20261060_faq_2_translations.sql — faq-2 (2 November 2026, docs/faq-2-seo-geo-2-report.md Part A): THE FAQ'S TRANSLATIONS.
--
-- One row per (question, locale) and per (section, locale). A row is a language base (fr-FR, de-DE … all 28) or a regional /
-- English variant (en-US, de-CH, es-MX …) holding ONLY wording that truly differs from its parent (35.am-5); with no row a variant
-- reads its parent. Written only by the translator (.github/workflows/faq-translate.yml → scripts/faq-translate/main.ts).
--   source_hash   sha256 of the exact English the row was made from (lib/faq/translation.ts sourceHashOf): a question's
--                 question_en, answer_en and answer_single_plan_en; a section's title_en. A row whose hash differs from the
--                 current English is out of date and is never shown.
--   status        'ok' (passed every check) or 'failed' (kept with its reason, never shown, retried next run).
-- Security as faq_items: RLS on, no policies, no grant to anon or authenticated — the service role only.
-- No existing row is touched; nothing is deleted.

begin;

create table if not exists public.faq_translations (
  item_id            uuid references public.faq_items(id) on delete cascade,
  section_id         uuid references public.faq_sections(id) on delete cascade,
  source_id          uuid generated always as (coalesce(item_id, section_id)) stored,
  locale             text not null check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  question           text,
  answer             text,
  answer_single_plan text,
  title              text,
  source_hash        text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  model              text,
  translated_at      timestamptz not null default now(),
  status             text not null check (status in ('ok', 'failed')),
  reason             text,
  primary key (source_id, locale),
  -- exactly one of a question or a section
  check ((item_id is null) <> (section_id is null)),
  -- a failed row says why; an ok question row has its question and answer; an ok section row has its title
  check (status = 'ok' or reason is not null),
  check (status <> 'ok' or item_id is null or (question is not null and answer is not null)),
  check (status <> 'ok' or section_id is null or title is not null)
);

create index if not exists faq_translations_locale_idx on public.faq_translations (locale);

alter table public.faq_translations enable row level security;
revoke all on public.faq_translations from anon, authenticated, public;
grant all on public.faq_translations to service_role;

commit;
```

## Verify SQL (read-only MCP) and results

```sql
select 'columns' k, string_agg(column_name||':'||data_type||case when is_generated='ALWAYS' then '(generated)' else '' end, ', ' order by ordinal_position) v from information_schema.columns where table_schema='public' and table_name='faq_translations'
union all select 'rls', relrowsecurity::text from pg_class where relname='faq_translations' and relnamespace='public'::regnamespace
union all select 'policies', coalesce(string_agg(policyname, ', '), 'none') from pg_policies where schemaname='public' and tablename='faq_translations'
union all select 'grants', string_agg(distinct coalesce(a.grantee::regrole::text,'PUBLIC'), ', ') from pg_class c cross join lateral aclexplode(c.relacl) a where c.relname='faq_translations' and c.relnamespace='public'::regnamespace
union all select 'pk', pg_get_constraintdef(oid) from pg_constraint where conrelid='public.faq_translations'::regclass and contype='p'
union all select 'rows', count(*)::text from public.faq_translations;
```

| k | v |
|---|---|
| columns | item_id:uuid, section_id:uuid, source_id:uuid(generated), locale:text, question:text, answer:text, answer_single_plan:text, title:text, source_hash:text, model:text, translated_at:timestamp with time zone, status:text, reason:text |
| rls | true |
| policies | none |
| grants | postgres, service_role |
| pk | PRIMARY KEY (source_id, locale) |
| rows | 0 |

## Undo (only if Dominic asks)

- **Code:** `git revert` the Part B commit, then the Part A commit (and `0cfa7f5a`, the migration file).
- **Data:** nothing was written to an existing row. The undo drops the new table (with every translation), as a committed migration run with `scripts/db-migrate.cjs`:

```sql
begin;
drop table if exists public.faq_translations;
commit;
```

- **Workflows:** after the revert the two workflow files are gone, so nothing runs on the timer once pushed.
