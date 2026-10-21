# ai-search-1 — HatchGrab, readable by AI answer engines

**Date:** 21 October 2026 · **Branch:** main (uncommitted; nothing pushed or deployed) · **No visible UI change** · No
database change (read-only queries only, §10).

## ⚠️ First: six things to know

1. **Today's robots.txt blocks every AI crawler on both hosts.** `www.hatchgrab.com` and `www.villagefoodie.co.uk` both
   serve `Disallow: /` to GPTBot, ClaudeBot, CCBot, Bytespider, FacebookBot, Applebot-Extended, Google-Extended and
   anthropic-ai. That was the 5 June 2026 policy. So ChatGPT and Claude have been told not to train on the site, and
   Google's AI products have been told not to use it for Gemini. The search bots (OAI-SearchBot, Claude-SearchBot,
   PerplexityBot…) fell under `*`, so they were allowed but not named. On the HatchGrab host this stage reverses the
   training block, as you decided.
2. **The brief says "same disallows as today for /manage, /admin, /api, tokens". Today's only private disallows are
   `/api/` and `/trucks/`.** I added the token and signed-in areas (`/manage/`, `/dashboard/`, `/kds/`, `/admin`,
   `/o/`, `/order/`, `/p/`, `/embed/`, `/demo/`, `/setup`, `/auth/`, `/dev/`) for every bot, keeping `/api/` and
   `/trucks/`.
   - All of them are already noindex (vercel.json `X-Robots-Tag`, or the page's own robots meta) or behind sign-in, and
     none is linked from a marketing page.
   - One trade-off to know: a disallowed URL can't be fetched, so a crawler won't see its noindex. If someone links a
     token URL publicly, Google could list the bare URL with no snippet.
   - The unlisted landing preview is deliberately **not** named: a robots.txt line would publish its address.
3. **The Village Foodie host is unchanged:** byte-identical to live. The brief is about HatchGrab's marketing pages, and
   Village Foodie's crawler policy is a separate decision. Bytespider, FacebookBot and `anthropic-ai` (a retired
   Anthropic token, no longer in Anthropic's docs) stay blocked on the HatchGrab host too, as they weren't part of this
   decision.
4. **Two of the allowed agents may ignore robots.txt anyway**, by their vendors' own words: ChatGPT-User ("robots.txt
   rules may not apply") and Perplexity-User ("generally ignores robots.txt rules"). Both are user-initiated fetches.
   Allowing them is a statement of intent, not a control.
5. **The existing JSON-LD had an invalid property.** `areaServed` isn't allowed on a SoftwareApplication; schema.org
   gives it to Organization, Service, Offer and a few others, so validators dropped it. It is replaced by
   `countriesSupported`, the app's own property, listing the switched-on countries. The offline schema.org check (§4)
   found this.
6. **These pages can't get Google's SoftwareApplication rich result.** Google requires `aggregateRating` or `review`;
   HatchGrab has neither, and I didn't invent any. The structured data is still valid and readable by answer engines,
   which is the point of this stage.

Nothing in the brief arrived garbled, and no two instructions contradicted each other: point 2 is a fact about the code,
resolved in the brief's evident intent.

## Summary

- **robots.txt (HatchGrab host):**
  - one explicit group allows the 9 answer / search bots and the 5 training bots, and repeats every private disallow,
    because a named group replaces `*` for that bot;
  - `*` keeps the private disallows;
  - Bytespider, FacebookBot and anthropic-ai stay blocked;
  - Village Foodie is unchanged.
- **Server-rendered:** every key fact on /uk, /us, /uk/features, /us/features, /uk/compare and /us/compare is in the
  initial HTML. Nothing appears only after JavaScript, so nothing needed fixing (§3).
- **JSON-LD:**
  - Organization gains `legalName` "HatchGrab Ltd" and `address.addressCountry` "GB", from `lib/company.ts`;
  - SoftwareApplication gains `operatingSystem` "Web, iOS, Android" and `countriesSupported` (the switched-on
    countries) in place of the invalid `areaServed`;
  - the Offers are as before;
  - it validates offline against the full schema.org vocabulary with 0 errors.
- **/llms.txt:** new, HatchGrab host only (404 on Village Foodie), built from data at request time. Switched-off
  countries never appear.
- **FAQ draft** (10 Q&As, sources given) and **definition-line options** for your approval: §6 and §7.
- **GB/US page HTML is byte-identical except the JSON-LD.** /features, /compare, their metadata and the PDFs are fully
  identical.
- **Checks:**
  - tsc and the build pass, and there are no new lint errors;
  - the new `ai-search-1` harness passes 28/28;
  - **the full sweep passes 149/149**;
  - 5 harness files were re-pinned for the approved changes.

---

## 1 · Robots (item 1)

### 1.1 Audit: what is served today (live, fetched 21 October 2026)

`app/robots.ts` serves the same rules on both hosts; only the Sitemap line differs.

| Agent | www.hatchgrab.com today | www.villagefoodie.co.uk today |
|---|---|---|
| GPTBot, ClaudeBot, CCBot, Applebot-Extended, Google-Extended | **Disallow: /** (named) | **Disallow: /** (named) |
| Bytespider, FacebookBot, anthropic-ai | Disallow: / (named) | Disallow: / (named) |
| OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User | not named → `*`: everything except /api/, /trucks/ | same |
| Googlebot, Bingbot, Applebot | not named → `*`: everything except /api/, /trucks/ | same |
| `*` | Disallow: /api/, /trucks/ | Disallow: /api/, /trucks/ |

### 1.2 Each agent, checked against its vendor's current docs

| Agent | Vendor's description | Source |
|---|---|---|
| OAI-SearchBot | Search: "Sites that are opted out of OAI-SearchBot will not be shown in ChatGPT search answers" | https://developers.openai.com/api/docs/bots (was platform.openai.com/docs/bots, 301) |
| ChatGPT-User | User-initiated visits; "robots.txt rules may not apply" | same |
| GPTBot | Training: "Disallowing GPTBot indicates a site's content should not be used in training generative AI foundation models" | same |
| Claude-SearchBot | "navigates the web to improve search result quality for users" | https://support.claude.com/en/articles/8896518 |
| Claude-User | "supports Claude AI users" (fetches when a person asks Claude) | same |
| ClaudeBot | Training: "collecting web content that could potentially contribute to their training" (`anthropic-ai` is no longer listed) | same |
| PerplexityBot | Surfaces and links sites in Perplexity search; "not used to crawl content for AI foundation models" | https://docs.perplexity.ai/guides/bots |
| Perplexity-User | User-requested fetches; "generally ignores robots.txt rules" | same |
| Googlebot | Google Search's crawler token | https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers |
| Google-Extended | A product token for Gemini training and grounding; "does not impact a site's inclusion in Google Search" | same |
| Bingbot | Bing's standard crawler (`bingbot/2.0`) | https://www.bing.com/webmasters/help/?topicid=8c184ec0 |
| Applebot | Apple's search crawler (Spotlight, Siri, Safari) | https://support.apple.com/en-us/119829 |
| Applebot-Extended | Controls training on Applebot-crawled data; "does not crawl webpages" | same |
| CCBot | Common Crawl's crawler (`CCBot/2.0`) | https://commoncrawl.org/ccbot |

**How a crawler picks its rules.** Google: "the group with the most specific user agent that matches… other groups are
ignored" (https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt). Bing says the same: "If you
have a specific set of directives for the bingbot user agent, BingBot will ignore all the other directives". So a named
group must repeat the private disallows, or naming a bot to allow it would open `/api/` to it.

### 1.3 What it serves now: `next build` + `next start`, curl

**Host www.hatchgrab.com:**
```
User-Agent: OAI-SearchBot
User-Agent: ChatGPT-User
User-Agent: Claude-SearchBot
User-Agent: Claude-User
User-Agent: PerplexityBot
User-Agent: Perplexity-User
User-Agent: Googlebot
User-Agent: Bingbot
User-Agent: Applebot
User-Agent: GPTBot
User-Agent: ClaudeBot
User-Agent: Google-Extended
User-Agent: Applebot-Extended
User-Agent: CCBot
Allow: /
Disallow: /api/
Disallow: /trucks/
Disallow: /manage/
Disallow: /dashboard/
Disallow: /kds/
Disallow: /admin
Disallow: /o/
Disallow: /order/
Disallow: /p/
Disallow: /embed/
Disallow: /demo/
Disallow: /setup
Disallow: /auth/
Disallow: /dev/

User-Agent: Bytespider
Disallow: /

User-Agent: FacebookBot
Disallow: /

User-Agent: anthropic-ai
Disallow: /

User-Agent: *
Disallow: /api/
Disallow: /trucks/
Disallow: /manage/
Disallow: /dashboard/
Disallow: /kds/
Disallow: /admin
Disallow: /o/
Disallow: /order/
Disallow: /p/
Disallow: /embed/
Disallow: /demo/
Disallow: /setup
Disallow: /auth/
Disallow: /dev/

Sitemap: https://www.hatchgrab.com/sitemap.xml
```

**Host www.villagefoodie.co.uk** (identical to live, byte for byte; `diff` is empty):
```
User-Agent: GPTBot
Disallow: /

User-Agent: ClaudeBot
Disallow: /

User-Agent: CCBot
Disallow: /

User-Agent: Bytespider
Disallow: /

User-Agent: FacebookBot
Disallow: /

User-Agent: Applebot-Extended
Disallow: /

User-Agent: Google-Extended
Disallow: /

User-Agent: anthropic-ai
Disallow: /

User-Agent: *
Disallow: /api/
Disallow: /trucks/

Sitemap: https://www.villagefoodie.co.uk/sitemap.xml
```

- **Code:** `app/robots.ts`, with the lists in `lib/robots-policy.ts` (`ANSWER_BOTS`, `TRAINING_BOTS`, `STILL_BLOCKED`,
  `PRIVATE_PATHS`), so the harness proves the same data.
- **Host-aware as before:** the Village Foodie branch returns the 5 June 2026 rules unchanged.

## 2 · /llms.txt (item 4)

- **New:** `app/llms.txt/route.ts` (host-aware: the HatchGrab host only, **404** on Village Foodie), with the body built
  by `lib/llms-text.ts` at request time.
- **The data it reads:**
  - the switched-on countries (`country_settings` through the cached loader, plus `routableCountries`);
  - each country's public plans and prices (`offerPlans`, the rows the pricing cards render);
  - each plan's fee shape;
  - the trial length and fallback plan (`plans`);
  - each country's pricing footnote in its own words ("in the UK", "in Ireland").
- Content-Type `text/markdown; charset=utf-8`; cached for an hour.
- The format follows llmstxt.org: an H1, a one-line summary in a blockquote, then sections.

**Output** (`next start`, Host www.hatchgrab.com; Ireland is switched off live, so it doesn't appear):
```
# HatchGrab

> HatchGrab is online ordering, pre-orders and a kitchen screen for food trucks and mobile catering: customers order ahead and choose a collection time, and the truck sees every order on one screen.

## Who it is for

Food truck and mobile catering operators. Available in: United Kingdom, United States.

## Plans and prices

### United Kingdom (GBP)

- Pay as you go: £0 per truck per month. 0.99% on online card orders.
- Pro: £29 per truck per month. First £4,000 of online orders included each month, then 0.99% on online card orders.
- Unlimited: £69 per truck per month. No HatchGrab fee on online orders.
- Plus Stripe’s card processing on online card orders (currently 1.5% + 20p in the UK), paid to Stripe, not HatchGrab. Walk-up orders use your own card reader — HatchGrab charges 0%.
- Details: https://www.hatchgrab.com/uk#pricing

### United States (USD)

- Pay as you go: $0 per truck per month. 0.99% on online card orders.
- Pro: $29 per truck per month. First $4,000 of online orders included each month, then 0.99% on online card orders.
- Unlimited: $69 per truck per month. No HatchGrab fee on online orders.
- Plus Stripe’s card processing on online card orders (currently 2.9% + 30¢ in the US), paid to Stripe, not HatchGrab. Walk-up orders use your own card reader — HatchGrab charges 0%.
- Details: https://www.hatchgrab.com/us#pricing

## The HatchGrab fee

The HatchGrab fee is 0.99% of online card orders, on the plans that charge one (see each plan above). Plans with an allowance charge it only above the online orders included each month. It never applies to walk-up orders.

## Free trial

The first 3 months are completely free, with every feature unlocked. When the trial ends, a truck moves to Pay as you go (no monthly fee) unless it chooses a plan. No card to start, no contract, cancel anytime.

## Countries

- United Kingdom: https://www.hatchgrab.com/uk
- United States: https://www.hatchgrab.com/us

## Links

- United Kingdom — features and plans compared: https://www.hatchgrab.com/uk/features
- United Kingdom — cost calculator: https://www.hatchgrab.com/uk/compare
- United States — features and plans compared: https://www.hatchgrab.com/us/features
- United States — cost calculator: https://www.hatchgrab.com/us/compare
- Terms: https://www.hatchgrab.com/terms
- Privacy: https://www.hatchgrab.com/privacy
```

- **Every sentence is the site's own:** the plan lines are the pricing cards' terms, the card-processing line is the
  pricing footnote verbatim, and the trial line is the banner's. The opening definition is the landing's own pair, "Ordering, pre-orders
  and a kitchen screen…" (JSON-LD) and "Customers order ahead and pick a collection time" ("What it does").
- **Switched off never appears:** harness §2 shows Ireland absent while off, and present with € prices once switched on
  (fixture).

## 3 · Server-rendered check (item 2)

**The method:** `next build` + `next start`. For each page I compared the raw server HTML (curl; scripts and styles
stripped) with the same page after it ran in Chromium. Every fact found only after JavaScript would be listed as
JS-ONLY.

| Page | What it is | Plan names | Prices (0 / 29 / 69) | 0.99% | Trial ("3 months") | Countries (menu) |
|---|---|---|---|---|---|---|
| /uk, /us | HTML | HTML | HTML | HTML | HTML | HTML |
| /uk/features, /us/features | HTML | HTML | HTML | HTML | — (not on the page) | HTML |
| /uk/compare, /us/compare | HTML | HTML | — (not on the page at its default volume) | HTML | — | HTML |

- **Nothing is JS-only, so no change was needed.**
- The "—" cells are absent with **and** without JavaScript, so they are content choices, not rendering:
  - /features has no trial line since its trial box was removed at your request on 21 October;
  - /compare shows a plan's price only when its calculator suggests that plan.
- The landing carries all of them, and so does `/llms.txt`.

## 4 · Structured data (item 3)

**Changes** (`lib/structured-data.ts`, `lib/company.ts`, `app/landing/page.tsx`); every value is read from data:

| Node | Added or changed | From |
|---|---|---|
| Organization | `legalName: "HatchGrab Ltd"`, `address: { PostalAddress, addressCountry: "GB" }` | `lib/company.ts` (the Companies House record, no. 17381557; `countryCode` added) |
| Organization | `url`, `logo`, `sameAs` = App Store + Google Play (unchanged) | `lib/brand.ts`, `lib/app-badges.ts` |
| SoftwareApplication | `operatingSystem: "Web, iOS, Android"` | the web app plus the two store listings in sameAs |
| SoftwareApplication | `countriesSupported: ["GB","US"]` in place of `areaServed` | the country menu's list (switched-on countries with a page) |
| SoftwareApplication | `applicationCategory: BusinessApplication`, the one-sentence `description`, the Offers (unchanged) | messages; `plan_prices` |

**/uk JSON-LD, as served** (`next start`):
```json
{
 "@context": "https://schema.org",
 "@graph": [
  {
   "@type": "Organization",
   "@id": "https://www.hatchgrab.com/#organization",
   "name": "HatchGrab",
   "legalName": "HatchGrab Ltd",
   "address": {
    "@type": "PostalAddress",
    "addressCountry": "GB"
   },
   "url": "https://www.hatchgrab.com/",
   "logo": "https://www.hatchgrab.com/logos/hatchgrab-logo.png",
   "sameAs": [
    "https://apps.apple.com/gb/app/hatchgrab/id6803543106",
    "https://play.google.com/store/apps/details?id=com.hatchgrab.app&hl=en"
   ]
  },
  {
   "@type": "WebSite",
   "@id": "https://www.hatchgrab.com/#website",
   "name": "HatchGrab",
   "url": "https://www.hatchgrab.com/",
   "publisher": {
    "@id": "https://www.hatchgrab.com/#organization"
   }
  },
  {
   "@type": "SoftwareApplication",
   "name": "HatchGrab",
   "applicationCategory": "BusinessApplication",
   "applicationSubCategory": "Food truck and mobile catering ordering system",
   "description": "Ordering, pre-orders and a kitchen screen for UK food trucks and mobile catering.",
   "inLanguage": "en-GB",
   "countriesSupported": [
    "GB",
    "US"
   ],
   "audience": {
    "@type": "BusinessAudience",
    "audienceType": "Food truck and mobile catering operators"
   },
   "operatingSystem": "Web, iOS, Android",
   "url": "https://www.hatchgrab.com/uk",
   "publisher": {
    "@id": "https://www.hatchgrab.com/#organization"
   },
   "offers": [
    {
     "@type": "Offer",
     "name": "Pay as you go",
     "url": "https://www.hatchgrab.com/uk#pricing",
     "price": "0.00",
     "priceCurrency": "GBP",
     "priceSpecification": {
      "@type": "UnitPriceSpecification",
      "price": "0.00",
      "priceCurrency": "GBP",
      "unitCode": "MON"
     }
    },
    {
     "@type": "Offer",
     "name": "Pro",
     "url": "https://www.hatchgrab.com/uk#pricing",
     "price": "29.00",
     "priceCurrency": "GBP",
     "priceSpecification": {
      "@type": "UnitPriceSpecification",
      "price": "29.00",
      "priceCurrency": "GBP",
      "unitCode": "MON"
     }
    },
    {
     "@type": "Offer",
     "name": "Unlimited",
     "url": "https://www.hatchgrab.com/uk#pricing",
     "price": "69.00",
     "priceCurrency": "GBP",
     "priceSpecification": {
      "@type": "UnitPriceSpecification",
      "price": "69.00",
      "priceCurrency": "GBP",
      "unitCode": "MON"
     }
    }
   ]
  }
 ]
}
```

**/us** differs only where it should: the App Store link is the any-storefront one, the en-US wording ("Food truck and
catering ordering system", "…for US food trucks and catering.", `inLanguage` en-US), `url` /us, and Offers in USD (0 / 29
/ 69). The full output is in the scratch file `jsonld-us.json`; its shape is checked in §9.

**Validation, offline, two ways:**
1. **Against schema.org itself.** I downloaded the current vocabulary
   (https://schema.org/version/latest/schemaorg-current-https.jsonld: 1,016 types, 1,694 properties). A small checker
   confirms that every `@type` exists, every property exists and is allowed on its node's type (`domainIncludes`, through
   `subClassOf`), and every nested typed value is in the property's range.
   - **/uk and /us: 92 property uses, 0 errors.**
   - Before the fix it flagged `areaServed` (point 5 of "First").
   - On a deliberately broken sample it caught a misspelt property (`operatingSystems`), a misplaced one (`price` on
     SoftwareApplication) and a wrong-case one (`legalname`).
2. **Against Google's rich-results rules for SoftwareApplication**
   (https://developers.google.com/search/docs/appearance/structured-data/software-app):
   - required: `name` ✓, `offers.price` ✓, and `aggregateRating` **or** `review` ✗ (none exists, and none was invented);
   - recommended: `applicationCategory` ✓, `operatingSystem` ✓ (new).
   - **So the markup is valid, but there is no rich result until real reviews exist.**
   - Google's Rich Results Test (https://search.google.com/test/rich-results) can be pointed at the live page after
     deploy for a second opinion; I didn't use it, as it needs a public URL.

**TODO, for profiles that don't exist yet** (add each to `sameAs` once it's live):
- LinkedIn company page;
- Facebook page;
- Instagram;
- X (Twitter);
- YouTube;
- G2 listing;
- Capterra listing;
- Trustpilot (a review source that could also unlock `aggregateRating` later, but only from real reviews).

## 5 · Byte-identity: GB / US HTML otherwise unchanged

The same snapshot script as currency-registry rendered the landing, /features and /compare for **uk, us, ie, au and
nz** (fixtures), and the plans PDF for each, before any change and after.

| Compared | Result |
|---|---|
| landing (5 countries) | **identical except the `<script type="application/ld+json">` block**; metadata identical |
| /features (5), /compare (5) | identical, HTML and metadata |
| plans PDF (5) | identical |

## 6 · FAQ draft (item 5): text only, for your approval

- **Plain English throughout.** Each answer's first sentence answers the question, and each fact names its source.
- **Figures** are today's UK data. On a US page the same answer would read from US data ($0 / $29 / $69; Stripe 2.9% +
  30¢). When built, every figure should be read from data, as `/llms.txt` does, never typed.
- **Wording:** "Pay at Hatch" is en-GB; en-US, en-IE, en-AU and en-NZ say "Pay at the truck".

**1. What is HatchGrab?**
HatchGrab is online ordering and a kitchen screen for food trucks and mobile caterers. Customers order ahead and pick a
collection time, and you see every order, online and walk-up, on one screen.
*Sources:* `landing.jsonLd.description`, `landing.does.slotsBody`; features `walkup_orders` and `kitchen_app` on every
plan (`plan_features` has no exception for them).

**2. How much does it cost?**
There are three plans, each per truck per month: Pay as you go £0, Pro £29 and Unlimited £69. Pay as you go charges
0.99% on online card orders, Pro includes your first £4,000 of online orders each month and then charges 0.99%, and
Unlimited has no HatchGrab fee. Online card payments also carry Stripe's processing fee (currently 1.5% + 20p in the UK),
paid to Stripe, and walk-up orders never carry a HatchGrab fee.
*Sources:* `plan_prices` GB (0 / 2900 / 6900; 0 / 400000 / null included; 99 / 99 / 0 bps); `pricing.fee.*`;
`pricing.footnote`; `country_settings` GB card fee 1.5% + 20p.

**3. Can customers pay at the truck instead of online?**
Yes. With Pay at Hatch, customers order ahead and pay when they collect, so you can take online orders without
connecting a card processor at all. You can add online card payments any time, on any plan.
*Sources:* `pricing.banner.body`; `online_ordering_pay_at_hatch` is on for every public plan (`plan_features` has no
override for it).

**4. Do I need a card reader?**
No. You can take orders with no card hardware: customers pay at the truck or by card online. For walk-up orders you keep
using the card machine you already take payment on; taking card payments on your phone (Tap to Pay) is coming soon.
*Sources:* `landing.does.devicesBody`; `pricing.footnote` ("Walk-up orders use your own card reader");
`lib/feature-table.ts:75` (`tap_to_pay` `comingSoon: true`).

**5. What happens if I lose signal?**
Online ordering pauses automatically, so customers can't place orders you won't see. The iPhone, iPad and Android app
keeps taking orders offline; the web dashboard needs a connection.
*Sources:* `landing.does.offlineBody`; `featuresPage.detail.offline_protection`.

**6. Can I stop too many orders arriving at once?**
Yes. You set how much your kitchen can cook at once and how long it takes, and once a collection time is full, customers
can't pick it.
*Sources:* `landing.does.capacityBody`; `featuresPage.detail.kitchen_capacity` (on every plan).

**7. Which countries is HatchGrab available in?**
HatchGrab is available in the United Kingdom and the United States.
*Source:* `country_settings` rows with `enabled = true` and a country address (GB, US; Ireland is off). Build this
answer from data so a newly switched-on country appears by itself.

**8. Is there a free trial, and can I cancel?**
Yes. Your first 3 months are completely free with every feature unlocked, and you don't need a card to start. When the
trial ends you move to Pay as you go, with no monthly fee, unless you choose a plan; there's no contract and you can
cancel anytime.
*Sources:* `plans.trial_months` = 3 (the trial plan); `pricing.banner.title/body`; `landing.trust.*`.

**9. Does HatchGrab answer WhatsApp messages?**
Yes, on the Pro and Unlimited plans. It auto-replies to WhatsApp questions like "Where are you tonight?" using your own
menu and schedule; Messenger and Instagram replies are coming soon.
*Sources:* `lib/whatsapp-live.ts` (`WHATSAPP_LIVE = true`); `landing.does.whatsappBody`; `plan_features`
(`payg / whatsapp_replies = false`; on for Pro and Unlimited).

**10. How is HatchGrab different from a till or POS like Square?**
HatchGrab is ordering and kitchen-screen software, not a till. It takes pre-orders, online orders and walk-up orders and
shows them on your kitchen screen, and it works alongside the card machine you already take payment on.
*Sources:* `landing.meta.description` ("— not a POS"); `landing.does.devicesBody`. No claim is made about Square
itself.

**The FAQPage JSON-LD to ship with it later** (in the landing's existing `@graph`, built from the same messages and data
when the FAQ section exists; only questions shown on the page):

```json
{
  "@type": "FAQPage",
  "@id": "https://www.hatchgrab.com/uk#faq",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is HatchGrab?",
      "acceptedAnswer": { "@type": "Answer", "text": "HatchGrab is online ordering and a kitchen screen for food trucks and mobile caterers. Customers order ahead and pick a collection time, and you see every order, online and walk-up, on one screen." }
    },
    {
      "@type": "Question",
      "name": "How much does it cost?",
      "acceptedAnswer": { "@type": "Answer", "text": "There are three plans, each per truck per month: Pay as you go £0, Pro £29 and Unlimited £69. …" }
    }
  ]
}
```

One Question per FAQ item, its `text` exactly the visible answer. Google limited FAQ rich results to well-known
government and health sites in August 2023, so expect no Google snippet. Answer engines still read `FAQPage`, which is
the reason to ship it.

## 7 · Definition line (item 6): options, nothing changed

For the landing's "What it does" section, one sentence an AI could quote as HatchGrab's definition:

1. **"HatchGrab is online ordering and a kitchen screen for food trucks: customers order ahead and pick a collection
   time, and the truck sees every order on one screen."** (the brief's example; closest to the landing's own words, and
   what `/llms.txt` now opens with, with "and mobile catering")
2. **"HatchGrab is ordering software for food trucks and mobile caterers: pre-orders, collection times, walk-up orders and
   a live kitchen screen in one app."** (lists the four things a buyer compares)
3. **"HatchGrab helps food trucks take pre-orders and walk-up orders, give every customer a collection time, and cook
   from one live kitchen screen — it isn't a till."** (answers "is it a POS?" in the same breath)

My pick is **1**: its first clause is a clean "X is Y" an engine can lift, and it matches `/llms.txt` and the FAQ.

## 8 · The harness: `scripts/ai-search-1.cjs` (28 checks, in `scripts/harnesses.json`)

**Robots:**
- the HatchGrab host names exactly the 9 answer / search bots and 5 training bots with `Allow: /` and repeats every
  private disallow;
- `*` has the same disallows;
- no allowed bot is also blocked;
- Bytespider, FacebookBot and anthropic-ai stay blocked;
- the preview address is never named;
- the Village Foodie host equals the 5 June 2026 rules exactly.

**llms.txt:**
- 200 text/markdown on the HatchGrab host, 404 on Village Foodie;
- the H1 and summary;
- each switched-on country's plans and prices, as the data says;
- the footnote "in the UK";
- the fee rule and the trial from the catalogue;
- the links;
- Ireland absent while off, and present with € once on;
- the body follows the data passed in.

**JSON-LD** (/uk and /us):
- `legalName` and `addressCountry` from `lib/company.ts`;
- url, logo and the two store links;
- BusinessApplication, "Web, iOS, Android", a one-sentence description;
- `countriesSupported` = the switched-on countries, with no `areaServed`;
- the Offers in GBP / USD;
- Ireland switched on adds IE.

## 9 · Checks

- **tsc:** clean. **Build:** `next build` passes, and the route list shows `ƒ /llms.txt` and `ƒ /robots.txt`.
- **Lint:** 0 errors in every changed or new file: `app/robots.ts`, `lib/robots-policy.ts`, `lib/llms-text.ts`,
  `app/llms.txt/route.ts`, `lib/structured-data.ts`, `lib/company.ts`, `app/landing/page.tsx`. HEAD's counts were also 0.
- **The temporary production server** (`next start -p 3100`) was used for the curls and the server-HTML check, then
  stopped. Only your dev server on 3000 is left running.
- **Full sweep (`node scripts/run-harnesses.cjs`, 149 harnesses): 149 run, 149 passed, 0 failed.** That includes
  `ai-search-1` (28/28) and every byte-identity harness. The first run had 8 failures:
  - 7 from the approved changes (the JSON-LD and robots), re-pinned below;
  - `add-order-refresh-inputs`, a load flake (see below), which passed in this run in 215 s.
- **Re-pinned for the approved changes only**, each marked `⚠️ RE-PINNED (ai-search-1, 21 October 2026)`:
  - **`_lp-seo-fixes.cjs`** (shared by language-phase-0 / 1e / 1e-tidy and others): the seo-fixes landing graph built
    from a stored "before" now also carries `legalName`, `address`, `operatingSystem`, and `countriesSupported` (the
    view's switched-on countries) in place of `areaServed`. It applies only on a tree with ai-search-1.
  - **`plans-data-model.cjs`, `pricing-pages.cjs`:** their landing JSON-LD checks accept exactly that change (the other
    words are still BEFORE's).
  - **`seo-fixes.cjs`:** on the HatchGrab host, every old robots rule this stage didn't decide is still there (and the
    training bots' blocks are gone). Village Foodie is still checked as "nothing added".
  - **`_us-readiness-us.cjs`** (us-readiness): `countriesSupported` includes US / GB, in place of `areaServed` names.
- **`add-order-refresh-inputs`** failed once in the first sweep, taking 461 s under load. It passed alone afterwards
  (3½ min, all checks), as in earlier workstreams. Nothing here touches Add Order.

## 10 · Read-only SQL run

```sql
select plan_key, feature_key, enabled from public.plan_features
where feature_key in ('whatsapp_replies', 'online_ordering_pay_at_hatch', 'tap_to_pay', 'kitchen_capacity', 'offline_protection', 'online_payments', 'walkup_orders')
order by feature_key, plan_key;
```
This failed: the column is named `feature`.

```sql
select key, name, is_public, active, is_trial, trial_months, sort_order from public.plans order by sort_order;
```
```sql
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'plan_features' order by ordinal_position;
```
```sql
select plan_key, feature, enabled from public.plan_features
where feature in ('whatsapp_replies', 'online_ordering_pay_at_hatch', 'tap_to_pay', 'kitchen_capacity', 'offline_protection', 'online_payments', 'walkup_orders')
  and plan_key in ('payg', 'pro', 'unlimited')
order by feature, plan_key;
```

**Results:**
- the public plans are Pay as you go, Pro and Unlimited;
- the trial plan is 3 months;
- `plan_features` holds exceptions only, and the one among these is `payg / whatsapp_replies = false`.

No NOT RUN SQL: no database change is needed.

## 11 · Files

- **New:**
  - `lib/robots-policy.ts`;
  - `lib/llms-text.ts`;
  - `app/llms.txt/route.ts`;
  - `scripts/ai-search-1.cjs`.
- **Changed:**
  - `app/robots.ts`;
  - `lib/structured-data.ts`;
  - `lib/company.ts` (+ `countryCode: 'GB'`);
  - `app/landing/page.tsx` (`countriesSupported` replaces `areaServed`; nothing visible);
  - `scripts/harnesses.json`.
- **Re-pins:** `scripts/_lp-seo-fixes.cjs`, `scripts/plans-data-model.cjs`, `scripts/pricing-pages.cjs`,
  `scripts/seo-fixes.cjs`, `scripts/_us-readiness-us.cjs`.
