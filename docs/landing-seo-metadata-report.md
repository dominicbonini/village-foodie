# Landing page — indexable, with the metadata it lacked

**8 September 2026.** Nothing staged, committed, pushed; **`git add` was not run in any form**. No database row written. 🔴 **No visible body copy or heading changed on any page — proven by rendering both states and diffing (§7.3).** `/compare` untouched.

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED/SERVED · ⚠ qualified.

**No span of the prompt arrived garbled.** ⚠️ **Two of the brief's premises turned out to be false, and one instruction could not be carried out as written — §5. I did the safe thing and am reporting it rather than having chosen silently.**

---

## 0. GIT STATUS

| | START | END |
|---|---|---|
| modified | **30** | **31** *(+`public/robots.txt`)* |
| untracked | **112** | **113** *(+`app/sitemap.ts`; this report replaces one in place)* |
| staged | **0** | **0** |

---

## 1. STEP 1 — STOP CONDITIONS

| file | state at START | workstream already in it |
|---|---|---|
| `app/landing/page.tsx` | ` M` | 🔴 **WhatsApp coming-soon flag + Android go-live** |
| `app/sitemap.ts` | did not exist | — |
| `public/robots.txt` | ⚠️ **existed, unmodified** — §5.1 | — |

### 1.1 🟢 Nothing I touched shares a hunk with the WhatsApp or Android work

**Checked before editing, and re-checked after.** 🧪 The change groups in `app/landing/page.tsx`, with git's 7-line merge distance applied:

```
lines  41– 42   WhatsApp flag import          ← not mine
lines  52–121   METADATA                      ← MINE
lines 179–206   JSON-LD                       ← MINE
lines 275–336   WhatsApp tile + Android tiles ← not mine
lines 477–481   Android bullet                ← not mine
lines 500–518   WhatsApp bullet split         ← not mine
```

🧪 `git diff` reports **six separate hunks**. ⚠️ **The tightest gap is 10 lines** — between the WhatsApp import (`:42`) and my metadata (`:52`). That is above git's 7-line merge threshold, so they stay separable, **but it is close enough that adding three more lines above my block would fuse them.** Flagged so a later edit does not do that by accident.

---

## 2. STEP 2 — THE STALE `noindex`, VERIFIED THEN REMOVED

### 2.1 I checked both readings myself

🔎 **`app/landing/page.tsx:53-57` (before):** *"noindex RESTORED … **the admin gate in layout.tsx is back on** while the Pizzeria Gusto testimonial is unpermissioned and the screenshots are placeholders."*

🔎 **`app/landing/layout.tsx:41-45`:** *"🔴 **THE GATE WAS REMOVED ON 3 SEPTEMBER 2026 — THE PAGE IS PUBLIC.** … **BOTH CONDITIONS THE GATE NAMED ARE MET**: the testimonial has WRITTEN PERMISSION, and the hero screenshots are REAL captures."*

🔴 **I did not take either comment on trust — I read the executing code.** 🧪 The layout's entire component body is:

```tsx
export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

🧪 A grep for `redirect(`, `verifyAdmin` and `NODE_ENV` outside comments in that file returns **nothing**. **There is no gate. The comment justifying the noindex was false in every clause, and had been for five days.**

### 2.2 What changed and what the new comment says

🔎 `robots: { index: false, follow: false }` → **`robots: { index: true, follow: true }`**, and the comment is replaced. The new one records, in short: that this is the flip the old comment itself demanded (*"FLIP THIS BACK THE SAME DAY THE GATE COMES OFF"*) and which was never carried out; that every clause of the old reason was false by 3 September; that the layout body was **verified** rather than trusted; that the page was therefore **public and unindexed for five days**; and that if the gate ever returns, this returns in the same commit.

✅ 🧪 **`/compare` untouched** — still `robots: { index: false }` at `app/compare/page.tsx:51`.

---

## 3. STEP 3 — TITLE AND DESCRIPTION

### 3.1 Title — options and the pick

| | option | chars |
|---|---|---|
| A | `HatchGrab — Food truck ordering system for UK mobile catering` | 61 |
| **B ✅** | **`Food truck & mobile catering ordering system — HatchGrab UK`** | **59** |
| C | `HatchGrab — Ordering & pre-orders for UK food trucks and mobile catering` | 72 |

**Picked B.** Terms first, brand last — the job of this string is to be *found*, not recognised, and nobody is searching the brand yet. It carries both category terms UK operators use for themselves, plus `UK` (every competitor ranking here is American unless the page says otherwise), and it fits inside Google's ~60-char cut. C is 12 characters too long.

### 3.2 Description — options and the pick

| | option | chars |
|---|---|---|
| **A ✅** | **`Take orders and pre-orders from your pitch without the queue. Ordering and kitchen-screen software for UK food trucks and mobile catering — not a POS.`** | **150** |
| B | `Built for UK food trucks and mobile catering: online ordering, pre-orders and collection times, and a kitchen screen. Works alongside your POS, not instead of it.` | 162 |
| C | `Online ordering, pre-orders and a kitchen screen for UK food trucks and mobile catering. Set up in about 15 minutes. Free to start.` | 131 |

**Picked A.** It opens problem-shaped (`without the queue` — the page's own `Kill the queue` heading), names both category terms, and uses **POS exactly once, in passing, to draw a boundary** — *"not a POS"*. That does two jobs at once: it catches the term without claiming the category, and it lets the wrong buyer self-select out of the click rather than out of the trial. B is 162 chars and would truncate; C reads like a feature list.

### 3.3 🔴 WHAT I LEFT OUT OF THE DESCRIPTION, AND WHY

**The brief listed *"messages going unanswered"* as description material. I did not use it.**

🔎 WhatsApp auto-replies are the **only** feature that answers messages, and they are **coming soon** behind `WHATSAPP_LIVE = false` (`lib/whatsapp-live.ts`). Naming that problem in a description that otherwise lists what the product does reads as a claim to solve it — **in the one place nobody re-reads when a flag flips.** The same brief forbids exactly that.

⚠️ **This is a judgement, and it is reversible in one line if you disagree** — but I would not put it in until the flag is on, and at that point it should go in with the flip, not before it.

🧪 **Verified: no WhatsApp claim reached the metadata** — §7.2 shows title, description and robots byte-identical in both flag states.

---

## 4. STEP 4 — OPEN GRAPH AND TWITTER

**Added; there were none.** 🧪 Both now serve (§7.1).

**Asset: `public/logos/hatchgrab-share-card.png`, an existing file — nothing was generated or commissioned.** 🧪 **Dimensions read from the PNG IHDR header: 1200 × 630**, which matches what `app/layout.tsx:54` declares. 🔎 That file carries a warning about exactly this trap — a previous pair declared 1200×630 over a 2397×1270 image — so I measured rather than copied.

### 4.1 🔴 A conflict that looks real and is not

🧪 `public/robots.txt` blocks **`FacebookBot`**. That looks like it would defeat the point of adding OG tags.

**It does not, and the distinction matters:** `FacebookBot` is Meta's **AI-training** crawler. The fetcher that renders a link preview is **`facebookexternalhit`**, and 🧪 it is **not** in the blocklist — nor is any WhatsApp fetcher. **Link previews in Facebook groups and WhatsApp will render.**

---

## 5. STEP 5 — `robots.ts` AND `sitemap.ts`

### 5.1 🔴 THE BRIEF'S PREMISE WAS WRONG: `public/robots.txt` ALREADY EXISTS

🧪 `public/robots.txt`, dated **5 June 2026**, 358 bytes:

```
User-agent: GPTBot / ClaudeBot / CCBot / Bytespider / FacebookBot /
            Applebot-Extended / Google-Extended / anthropic-ai   → Disallow: /
User-agent: *   Disallow: /api/   Disallow: /trucks/   Crawl-delay: 10
```

🔴 **And my own previous SEO report said no robots.txt existed. That was wrong, and the cause is worth recording:** the check was `ls app/sitemap* app/robots* public/robots.txt || echo "NO ..."`, and in zsh the unmatched glob `app/sitemap*` **aborted the whole command** before `public/robots.txt` was ever tested. **A failed command and a negative result printed the same line.** I have corrected it here.

### 5.2 What I did instead

🔴 **I created `app/robots.ts`, found it returns HTTP 500 — *"A conflicting public file and page file was found for path /robots.txt"* — and removed it.**

**I did not replace `public/robots.txt`, and that was deliberate.** Doing so would have silently dropped an eight-crawler AI-training blocklist that someone added on purpose. **That is a policy decision, not a metadata one, and it is yours.**

✅ **What I did:** appended a `Sitemap:` line and a note. 🧪 The complete diff is **5 added lines, 0 changed** — every existing rule is byte-identical:

```
+ # Added 8 September 2026. PURELY ADDITIVE — no rule above this line was changed. …
+ Sitemap: https://www.hatchgrab.com/sitemap.xml
```

🧪 `/robots.txt` now serves **HTTP 200** with the blocklist intact.

**What it permits and forbids — unchanged from June except the new line:** forbids the eight AI crawlers everything; forbids all crawlers `/api/` and `/trucks/`; sets `Crawl-delay: 10`; **permits everything else.** ⚠️ `Disallow: /trucks/` agrees with the `X-Robots-Tag: noindex` `vercel.json` already sends for that path — **so nothing newly reachable is forbidden, and nothing forbidden is newly reachable.**

### 5.3 `app/sitemap.ts` — and two of the three URLs asked for do not exist

🧪 **Serving now, HTTP 200:**
```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://www.hatchgrab.com/</loc><lastmod>2026-09-08T15:59:54.483Z</lastmod>
     <changefreq>weekly</changefreq><priority>1</priority></url>
</urlset>
```

🔴 **The brief asked for `/`, `/landing` and `/pricing`. Two of those cannot be listed:**

- 🧪 **`/pricing` is not a route.** It is `<section id="pricing">` on the landing page. **A sitemap entry for it would be a 404 — worse than no entry.**
- 🧪 **`/landing` and `/` are the same page.** `proxy.ts:433` **308-redirects** `/landing` → `/` on a hatchgrab host. Listing both would contradict the canonical this page now declares.

**So the HatchGrab sitemap carries exactly one URL. That is honest rather than thin.** Excluded as instructed: `/compare` (still noindex), `/trucks/[slug]` (already `noindex` by header), `/venues/[slug]` (a larger decision).

⚠️ **It is host-aware** — one deployment serves both brands, and a host-blind sitemap would advertise HatchGrab URLs on villagefoodie.co.uk. On the Village Foodie host it returns that site's root only.

---

## 6. STEP 6 — JSON-LD

**One `SoftwareApplication` block on the landing page.** 🧪 It parses (§7.1).

**Included** — only what the page already says: `name`, `applicationCategory: BusinessApplication`, `applicationSubCategory`, `url`, `description`, `inLanguage: en-GB`, `areaServed: United Kingdom`, `audience: BusinessAudience`, `publisher`.

**🔴 Deliberately left out:**

- **`aggregateRating` / `review`** — there are no reviews. A rating no page supports is the claim §44 exists to stop, and Google penalises it.
- **`offers` / `price`** — ⚠️ **this one is a genuine judgement call.** The page *does* show £29 and £49 unmasked, so a price would be "already true on the page". 🔎 But §4 of the reference manual records £29/£49 as having **thirteen literal copies** and drifting, one of them holding them as raw numbers for logic. **A fourteenth copy, in a file nobody reads, that search engines cache and display in results, is the worst possible place for that figure to go stale.** If you want price in schema, it should read from `PLAN_PRICES` rather than be typed.
- Device/OS claims beyond what the page states.

---

## 7. STEP 7 — PROOF, FROM SERVED OUTPUT

**Method:** fetched over HTTPS from the dev server already running (`next dev --experimental-https`). ⚠️ **I did not start, stop or restart your server** — my own attempt failed on its lock and I fetched from yours instead.

### 7.1 The actual served `<head>` — `https://www.hatchgrab.com/`, HTTP 200

```
title       Food truck & mobile catering ordering system — HatchGrab UK      (59 chars)
description Take orders and pre-orders from your pitch without the queue. Ordering and
            kitchen-screen software for UK food trucks and mobile catering — not a POS.
robots      index, follow
canonical   https://www.hatchgrab.com
og:type website · og:site_name HatchGrab · og:url https://www.hatchgrab.com
og:title … · og:description … · og:locale en_GB
og:image https://www.hatchgrab.com/logos/hatchgrab-share-card.png · 1200 × 630
twitter:card summary_large_image · twitter:title … · twitter:description … · twitter:image …
JSON-LD     🟢 PARSES — @type=SoftwareApplication, 11 keys
            rating/review/offers present? False
```

### 7.2 Both WhatsApp flag states

```
FLAG=false  footnotes=1,2,3,4,5    parity violations=0 🟢   tile Coming-soon badge: YES
FLAG=true   footnotes=1,2,3,4,5,6  parity violations=0 🟢   tile Coming-soon badge: NO
```

🟢 **Title, description and robots are IDENTICAL in both states** — the metadata is flag-invariant, so no unshipped WhatsApp claim can leak into it. 🟢 **The tile badge still moves with the flag** — the flag governs exactly what it governed before, no more. 🟢 **The module-load parity guard is clean in both.** Flag restored to `false`.

### 7.3 🟢 No visible copy changed — measured, not asserted

I rendered the **pre-change** file, rendered the **post-change** file, stripped `<script>` and `<style>`, and compared the visible text:

```
before 10,547 chars · after 10,547 chars · 🟢 IDENTICAL
```

🧪 The working file was restored to my post-change version and verified byte-identical before continuing.

### 7.4 🔴 A REAL DEFECT THE SERVED OUTPUT CAUGHT THAT THE SOURCE DID NOT

**The first render came back with the title:**

```
Food truck & mobile catering ordering system — HatchGrab UK | HatchGrab      (75 chars)
```

🔎 `app/layout.tsx` declares `title: { template: '%s | HatchGrab' }`, so a bare string is wrapped — **brand twice, 15 characters past the cut.** Fixed with `title: { absolute: … }`; 🧪 re-rendered at **59 chars, brand once**.

⚠️ **The previous title had the identical defect** (`HatchGrab — … | HatchGrab`). **It is not new. It was simply never looked at in rendered output** — which is exactly why this step required serving the page rather than reading the file.

### 7.5 🔴 What "doing nothing" would have looked like, and how it was ruled out

**Metadata defined but not exported, or defined on a route whose parent's wins, both render as no change — and the source looks correct in both cases.**

- 🧪 **`robots` served as `index, follow`.** Before, it served `noindex`. **A non-exported or overridden block would still show `noindex`.**
- 🧪 **`og:*` and `twitter:*` are present in the served HTML.** They were absent before. **An unexported block would have kept them absent.**
- 🧪 **§7.4 is the strongest evidence of all:** the served title differed from the source string in a way I did not intend. **A page ignoring my metadata could not have produced a title derived from it.**

### 7.6 What this is not

⚠️ 🧪 `npx tsc --noEmit -p tsconfig.json` → **0 errors**. **That is a typecheck, not verification.** The evidence is §7.1–7.5.

🔴 **Nothing takes effect until deployed.** All of this is an uncommitted working tree; it reaches production after you stage, commit, push and Vercel builds. 🔴 **And indexing is not instant: after deploy, expect days to weeks before the page appears in results, longer before it ranks — and a `noindex` that has been served since before 3 September has to be re-crawled and un-learned first.**

---

## 8. WHAT I CHANGED, AND WHAT I DID NOT

| file | change |
|---|---|
| `app/landing/page.tsx` | metadata block replaced (title, description, robots, canonical, OG, Twitter) + a JSON-LD `<script>` |
| `app/sitemap.ts` | **new** — host-aware, one URL per host |
| `public/robots.txt` | **+5 lines only** — a `Sitemap:` pointer and a note. Every existing rule byte-identical |
| ~~`app/robots.ts`~~ | created, found to 500 against the existing file, **removed** |

❌ No visible copy or heading changed. ❌ `/compare` untouched. ❌ `lib/features.ts`, `lib/whatsapp-live.ts`, `lib/plan-features.ts`, `lib/landing-table.ts` untouched. ❌ The AI-crawler blocklist untouched. ❌ Nothing staged, committed, pushed or added.

---

## 9. STATE AT END

`git status --short`:

```
 M .gitignore
 M app/admin/page.tsx
 M app/api/cron/custom-domain-check/route.ts
 M app/api/manage/route.ts
 M app/landing/page.tsx
 M app/manage/[token]/page.tsx
 M app/o/[slug]/page.tsx
 M components/EventListCard.tsx
 M components/dashboard/CustomDomainSetup.tsx
 M components/dashboard/DemoWelcome.tsx
 M components/dashboard/types.ts
 M components/landing/LandingFooter.tsx
 M docs/manual-update-report.md
 M ios/App/App.xcodeproj/project.pbxproj
 M lib/custom-domain/copy.ts
 M lib/custom-domain/dns.ts
 M lib/custom-host.ts
 M lib/landing-table.ts
 M lib/meta/webhook-signature.ts
 M lib/plan-features.ts
 M lib/ratelimit.ts
 M lib/venue-matcher.ts
 M lib/whatsapp/connection-state.ts
 M proxy.ts
 M public/badges/README.md
 M public/robots.txt
 M scripts/backfill-venue-id-low.ts
 M scripts/backfill-venue-id.ts
 M scripts/linking-guards.ts
 M scripts/run-scraper.js
 M vercel.json
?? app/admin/outreach/
?? app/api/admin/outreach/
?? app/api/manage/whatsapp-signup/
?? app/order/[id]/page.tsx
?? app/sitemap.ts
?? components/StoreBadges.tsx
?? components/dashboard/CopyButton.tsx
?? docs/ai-notes-postcode-report.md
?? docs/android-golive-landing-report.md
?? docs/arbitration-validation-report.md
?? docs/copy-button-report.md
?? docs/custom-domain-404-report.md
?? docs/custom-domain-fixes-report.md
?? docs/custom-domain-verification-report.md
?? docs/deletion-rules-report.md
?? docs/demo-provisioning-report.md
?? docs/event-linking-design-report.md
?? docs/exclusion-check-position-report.md
?? docs/exclusions-provenance-report.md
?? docs/geocoder-validation-report.md
?? docs/hatches-up-comparison-report.md
?? docs/hatches-up-import-report.md
?? docs/hatches-up-recheck-report.md
?? docs/hatches-up-reconciliation-report.md
?? docs/hatches-up-source-report.md
?? docs/hatchesup-events.csv
?? docs/hatchesup-online-ordering.csv
?? docs/hatchesup-online-ordering.md
?? docs/hatchesup-ordering.csv
?? docs/hatchesup-trucks-tagged.md
?? docs/hu-columns-build-report.md
?? docs/hu-columns-report.md
?? docs/hu-reconciliation-report.md
?? docs/landing-seo-metadata-report.md
?? docs/landing-seo-review-report.md
?? docs/linking-guards-report.md
?? docs/local-dev-host-report.md
?? docs/order-link-outage-report.md
?? docs/order-route-rename-report.md
?? docs/order-url-routes-report.md
?? docs/outreach-manual-dates-report.md
?? docs/outreach-modal-report.md
?? docs/outreach-modal-v2-report.md
?? docs/outreach-page-report.md
?? docs/outreach-phone-and-sort-report.md
?? docs/outreach-phone-column-report.md
?? docs/outreach-platform-edit-report.md
?? docs/outreach-tab-report.md
?? docs/outreach-ui-fixes-report.md
?? docs/pimp-my-fish-manual-events-report.md
?? docs/pimp-my-fish-source-report.md
?? docs/platform-detection-report.md
?? docs/postcode-flag-guard-report.md
?? docs/pricing-suppression-report.md
?? docs/privacy-policy-processors-report.md
?? docs/rls-policy-report.md
?? docs/rls-verification-report.md
?? docs/saffron-walden-extraction-report.md
?? docs/scraper-audit-report.md
?? docs/scraper-diagnosis-queries.sql
?? docs/scraper-diagnosis-report.md
?? docs/scraper-filter-fixes-report.md
?? docs/scroll-lazy-silence-report.md
?? docs/sheet-migration-audit-report.md
?? docs/sql/
?? docs/store-badges-report.md
?? docs/truck-radius-report.md
?? docs/trucklist.txt
?? docs/venue-consolidation-report.md
?? docs/venue-coords-and-run-log-report.md
?? docs/venue-creation-diagnosis-report.md
?? docs/venue-creation-fix-report.md
?? docs/venue-link-apply-report.md
?? docs/venue-linking-report.md
?? docs/venue-linking-scope-report.md
?? docs/venue-matcher-fix-report.md
?? docs/venue-pipeline-report.md
?? docs/vf-map-events-report.md
?? docs/whatsapp-connections-build-report.md
?? docs/whatsapp-connections-fk-fix-report.md
?? docs/whatsapp-embedded-signup-s4-s5-report.md
?? docs/whatsapp-embedded-signup-scope-report.md
?? docs/whatsapp-embedded-signup-v4-report.md
?? docs/whatsapp-extraction-report.md
?? docs/whatsapp-golive-build-report.md
?? docs/whatsapp-golive-copy-report.md
?? docs/whatsapp-golive-decision-report.md
?? docs/whatsapp-golive-heading-report.md
?? docs/whatsapp-landing-flag-report.md
?? docs/whatsapp-landing-revert-report.md
?? docs/whatsapp-threshold-report.md
?? docs/whatsapp-token-expiry-report.md
?? docs/whatsapp-token-issued-at-report.md
?? docs/whatsapp-v4-landed-report.md
?? lib/app-badges.ts
?? lib/clipboard.ts
?? lib/custom-domain/alert.ts
?? lib/custom-domain/check.ts
?? lib/outreach.ts
?? lib/whatsapp-hint.ts
?? lib/whatsapp-live.ts
?? lib/whatsapp/connection-read.ts
?? lib/whatsapp/embedded-signup.ts
?? lib/whatsapp/token-crypto.ts
?? public/badges/GetItOnGooglePlay_Badge_Web_color_English.svg
?? scripts/geo-validate.js
?? supabase/migrations/20260903_hu_presence_flags.sql
?? supabase/migrations/20260903_outreach_contact_name.sql
?? supabase/migrations/20260903_outreach_dnc_entity.sql
?? supabase/migrations/20260903_outreach_tracking.sql
?? supabase/migrations/20260903_whatsapp_confirmed_nullable.sql
?? supabase/migrations/20260904_whatsapp_connections.sql
?? supabase/migrations/20260904_whatsapp_connections_token_issued_at.sql
?? supabase/migrations/20260907_discovery_run_log.sql
```

**0 staged.** `HEAD = 6820d7b`, `origin/main = 08ac368`.
