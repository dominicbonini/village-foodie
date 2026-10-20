# US legal draft — one terms, one privacy policy, one country page

19 October 2026. Brief: "US LEGAL, BEST EFFORT", revised the same day to one Terms of Service and one Privacy Policy for
every country, plus ONE separate "Country-specific terms" page for each country's extra rules. This is a best-effort
draft for review, not legal advice. Everything is uncommitted. Nothing was pushed or deployed, and no stored data was changed.

**Result.**
- The two main documents are now country-neutral where the UK wording was only wording. Their dates move to 19 October
  2026, and the earlier privacy date mismatch is fixed. Each gains one sentence pointing to the new page, which forms part
  of it.
- New page **/country-terms** ("Country-specific terms"), with one heading per country. Today it has only
  **United States**.
- The legal footer links to the new page.
- **Checks:** `tsc` is clean; `next build` exits 0 (`/country-terms` is in the route table); the full sweep runs 137 · passes 137 · fails 0, with only the named re-pins below.
- **Step 0 (read-only):** no non-extension function in `public` is executable by anon or authenticated, and the eight
  functions from the polish batch are revoked.

---

## CHECK items (read these first)

These are the points I am not sure are accurate. Each is written conservatively.

1. **🔴 Postal address in marketing emails — must be made true before this goes live.** The page says "every marketing
   email we send … includes our postal address". Today's **outreach** emails carry no postal address: the signature and
   opt-out lines in `outreach_settings` have none. Either add the registered address to the outreach signature, or soften
   the sentence. (Gaps, item 2.)
2. **California all-in pricing** (the "Online service fees" paragraph). I named California's law as an example of a rule
   requiring fees to be in advertised prices.
   - I understand a 2024 amendment lets restaurants show a mandatory fee if it is clearly disclosed on the menu.
   - Confirm whether a food truck's online order qualifies, and what disclosure it needs.
   - The fee can be the truck's or HatchGrab's own, so this is not only the truck's risk.
3. **US privacy requests: 45 days, an agent may act, the chance to ask again.** This is modelled on California-style rules.
   Confirm the response window and process are right for the states that matter.
4. **"Some state privacy laws … may not apply to us. We honor the requests anyway."** Confirm we're happy to commit to
   honouring them for everyone in the US.
5. **"Service provider" / "processor" paragraph for operators' customer data.** CCPA-style laws require specific contract
   terms between a business and its service provider. Confirm the paragraph, read with section 10 of the terms, is enough.
6. **Text messages.** "Only if you agree … you can stop them at any time". No SMS is sent today; order SMS alerts are
   "coming soon". US text-message rules (TCPA and carrier rules) need real opt-in wording before launch.
7. **Precedence.** "If it says something different from them, this page applies for that country." Confirm you want the
   country page to win over the main documents where they differ.
8. **Liability cap: "£100 (or its equivalent in your local currency)".** Confirm the equivalent-amount wording, rather than
   a fixed US figure.
9. **Tips: "we do not take a share of them".** No platform fee is taken on any payment today, and the order page tells
   customers "100% of your tip goes to the truck". But whether the plan's transaction fee on order value **above the
   allowance** counts tips is undecided. Confirm it won't.
10. **US billing: "any tax we must charge on our fees is shown before you pay".** Whether HatchGrab must collect US sales tax
    on its own subscription in any state is unconfirmed. The sentence promises only that, if we must, it is shown.
11. **"We do not sell or share your personal information."** True of our processors as listed. But PostHog product
    analytics runs on the public pages with cookies, and neither policy names it. That is not "selling" or advertising
    sharing, but it contradicts the main policy's "no third-party analytics cookies". (Gaps, item 1.)
12. **Allergy and dietary notes "kept with the order record for the period in section 7".** Section 7 removes a customer's
    name, email and phone after 12 months but keeps anonymised order data. Confirm whether order notes go with the
    personal details or stay with the anonymised order.

---

## 1 · Inventory (every legal document and sentence the product shows)

| Surface | Where | Audience | Note |
|---|---|---|---|
| Terms of Service | `content/legal/terms-and-conditions.md` → `/terms` | Operators | Business use only; says it does not apply to customers |
| Privacy Policy | `content/legal/privacy-policy.md` → `/privacy` | Everyone | UK controller; section 4 for customers |
| **Country-specific terms (new)** | `content/legal/country-specific-terms.md` → `/country-terms` | Everyone in a listed country | Forms part of both documents |
| Legal chrome | `app/(legal)/layout.tsx`, `components/legal/LegalChrome.tsx`, `LegalPage.tsx`; messages `legalChrome` | Everyone | Footer Privacy · Terms · (new) Country terms · Contact; en-GB only |
| Dates | `lib/legal.ts` `PRIVACY_UPDATED`, `TERMS_UPDATED` (+ new `COUNTRY_TERMS_UPDATED`) | — | **Mismatch fixed**: the privacy page said "5 September 2026" while the constant said "6 August 2026". All read 19 October 2026 now |
| Signup consent | `app/signup/page.tsx`; `auth.json` | Operators | "By creating an account you agree to our Terms and Privacy Policy…"; an unticked marketing opt-in |
| Demo signup consent | `components/DemoGetStarted.tsx`; `demoGetStarted.json` | Prospects → operators | A required "I agree to the Terms and Privacy Policy" box; "see our privacy policy" on the demo-link capture |
| Terms version recorded | `app/api/signup/route.ts` `TERMS_VERSION = 'holding-2026-07-23'`, with `terms_accepted_at` | — | **Stale** (Gaps, item 6) |
| Order page | `app/trucks/[slug]/order/page.tsx`; `order.json` | Customers | "Menu prices don't include {tax}. It's added below." (US); "No service fee."; "100% of your tip goes to the truck…"; allergen cautions. **No terms or privacy link, and no "by placing your order" line** |
| Customer manage page | `app/order/[id]/manage`; `orderStatus.json` | Customers | Refund handled by the truck; cancellation cut-off |
| Cookies | `privacy-policy.md` section 5 only | Everyone | **No banner.** PostHog runs with cookies (Gaps, item 1) |
| Customer emails | `lib/email.ts`; `emailCustomer.json` | Customers | "Powered by HatchGrab · hatchgrab.com"; transactional; no unsubscribe or address (none needed) |
| Operator emails | `emailOperator`, `emailSignup`, `emailAccount` | Operators | Transactional; no footer |
| Outreach emails (code only; rows not read) | `lib/outreach-template-render.ts`, `lib/outreach-signature.ts`, seed `20260929_outreach_settings.sql` | Prospects | The opt-out is data ("reply with "no thanks""); **no postal address, no company number**; a missing opt-out is only a compose warning |
| Plans PDF | `lib/plans-pdf.ts`; `plansPdf.json` | Prospects | "Small print" / US "Fine print": a summary, not a contract; Stripe fees are Stripe's |
| Landing, features, compare footnotes | `landing.json`, `planFeatures.json`, `featuresPage.json`, `compare.json` | Prospects | "Cancel anytime, no contract"; card-fee and platform-fee footnotes; no "prices exclude tax" line |
| In-app links | `components/dashboard/UserMenu.tsx`, landing footer, contact page | Operators / everyone | Privacy and Terms (app-store requirement) |
| Account deletion | `deleteAccount.whatAccounting` | Operators | "kept for six years, as UK law requires" (genuinely ours) |

## 2 · What changed

### Named changes to the UK text (before → after)

**Terms of Service** (`content/legal/terms-and-conditions.md`):

| # | Before | After | Why |
|---|---|---|---|
| T1 | **Last updated:** 6 August 2026 | **Last updated:** 19 October 2026 | The new date |
| T2 | *(new paragraph at the end of section 1)* | **Some countries have extra rules.** Where they apply to you, they're on our Country-specific terms page, which forms part of these terms. | The one sentence; the page name is a link |
| T3 | …and your compliance with food safety and food information law, including allergen disclosure requirements. | …and your compliance with **the** food safety and food information law **where you trade**, including allergen disclosure requirements, **and for any permits or licences you need.** | Country-neutral; permits and licences apply everywhere |
| T4 | …for charging the right amounts, for VAT, and for your own tax affairs. | …for VAT, **sales tax or similar taxes where they apply**, and for your own tax affairs. | VAT is the UK's word |
| T5 | Prices are in pounds sterling and exclude VAT unless stated. | Prices are in **your local currency** and exclude VAT, **sales tax or similar taxes** unless stated. | Country-neutral |
| T6 | …or £100. | …or £100 **(or its equivalent in your local currency)**. | Country-neutral cap (CHECK 8) |

**Privacy Policy** (`content/legal/privacy-policy.md`):

| # | Before | After | Why |
|---|---|---|---|
| P1 | **Last updated:** 5 September 2026 | **Last updated:** 19 October 2026 | The new date; also fixes the mismatch with `PRIVACY_UPDATED` |
| P2 | *(new paragraph after the intro)* | **Some countries have extra rules.** Where they apply to you, they're on our Country-specific terms page, which forms part of this policy. | The one sentence (link) |

**Kept as they are, because they are genuinely ours as a UK company:**
- HatchGrab Ltd, its company number and its address;
- governing law and jurisdiction (England and Wales);
- UK GDPR, Article 28 and the ICO;
- "as UK tax law requires" (our own accounting records);
- "within one month" for UK rights requests (the US window is on the country page).

Nothing else in either document moved. `scripts/us-legal-draft.cjs` proves each file equals its `8a5c4b5a` text with exactly
these changes applied.

### The new page — `/country-terms` (every paragraph, and why it's there)

Page intro (UK English, like the main documents):

> Our Terms of Service and Privacy Policy apply in every country where HatchGrab is used. Some countries have extra rules. This page sets them out, one country at a time.
— *Why:* says what the page is, and links both documents.

> Where a section below applies to you, it forms part of our Terms of Service and our Privacy Policy. If it says something different from them, this page applies for that country.
— *Why:* makes the page binding, and decides which wins (CHECK 7).

> If your country is not listed, there are no extra rules: the Terms of Service and the Privacy Policy apply as written.
— *Why:* keeps one set of documents as the default.

**## United States — ### For food truck operators** (US spelling)

> **You are the seller.** You sell your food, and you are the merchant of record for your card payments, as section 5 of the Terms of Service says. Your customers' order is with you, not with us.
— *Why:* the brief's first US point. It restates section 5 and adds that the order is with the truck, because the terms do not address customers.

> **Sales tax.** You set the sales tax rate that HatchGrab adds to your orders. Menu prices are shown before tax, and tax is shown to the customer as its own line before they pay. You are responsible for registering for, collecting and paying sales tax correctly everywhere you trade. We add tax at the rate you set. We do not check it.
— *Why:* in the US, tax is added on top (true in the product today), and the rate is the truck's.

> **Permits, licenses and food rules.** Your responsibilities in section 3 of the Terms of Service include the federal, state and local rules where you trade, including permits, licenses, health department requirements, and any allergen disclosure rules that apply to you.
— *Why:* names the US layers (federal, state and local) that section 3's country-neutral wording now covers.

> **Tips.** Tips your customers add are yours. They are paid into your own Stripe account with the order, and we do not take a share of them.
— *Why:* tips exist in the US product, and the order page already promises "100% of your tip goes to the truck" (CHECK 9).

> **Online service fees.** An online order may carry a service fee, shown to the customer as its own line before they pay. HatchGrab shows you which kind applies to your account: a fee you add yourself, within the limits shown in HatchGrab, which is yours; or a fee HatchGrab adds, which is ours. Some places require fees like these to be included in the prices you advertise instead of being added at checkout. California's law on all-in pricing is one example. Tell us if you trade somewhere with a rule like this, and do not add a fee of your own where it is not allowed.
— *Why:* the product supports both a truck's fee and a HatchGrab fee, always as a separate line (CHECK 2; Gaps, item 3).

> **Billing in US dollars.** Accounts in the United States are billed in US dollars. Any tax we must charge on our fees is shown before you pay.
— *Why:* the currency, and a cautious tax line (CHECK 10).

> **Your rights under local law.** Nothing in the Terms of Service takes away a right that the law where you are based says cannot be limited or waived.
— *Why:* the brief's "nothing limits rights local law says can't be limited", for state law.

> **Your customers' data.** Under US state privacy laws, section 10 of the Terms of Service means the same thing in their terms: you are the "business" and we are your "service provider" or "processor". We use your customers' personal information only to run HatchGrab for you. We do not sell it, we do not share it for cross-context behavioral advertising, and we do not use it for any other purpose except as those laws allow a service provider to.
— *Why:* maps section 10's UK processor terms onto US state-law roles (CHECK 5).

**### Privacy, for everyone in the United States**

> **What we collect and who we share it with.** The same as the Privacy Policy says: account and business details for truck operators; your name, contact details and order details if you order from a truck; and basic technical data if you visit our websites. We share it with the truck you order from and with the service providers listed in section 6 of the Privacy Policy, only to run the service or where the law requires it. It may be processed in the United Kingdom, the European Union and the United States.
— *Why:* the notice-at-collection basics US laws ask for, pointing to the main policy rather than repeating it.

> **We do not sell or share your personal information.** We do not sell personal information, and we do not share it for cross-context behavioral advertising.
— *Why:* the statement US state laws look for (CHECK 11).

> **Allergy and dietary notes.** If you add allergy or dietary notes to an order, we pass them to the truck with your order and keep them with the order record for the period in section 7 of the Privacy Policy. We do not use them for anything else.
— *Why:* health-related notes are "sensitive" under some state laws; this limits their use (CHECK 12).

> **Your requests.** You can ask us what personal information we hold about you, and ask us to correct it or delete it. Email privacy@hatchgrab.com. We will check that the request is genuine before we act on it, and we will reply within 45 days. You can ask someone to make the request for you. We will not treat you differently for making a request. If you ordered from a truck, we may pass your request to that truck, because it decides how your order details are used. If we turn down a request, you can ask us to look at it again by replying to our answer.
— *Why:* access, correct and delete through the same contact route as the main policy (CHECK 3).

> **State privacy laws.** Some state privacy laws only apply to businesses above a certain size, and they may not apply to us. We honor the requests above from anyone in the United States anyway.
— *Why:* the brief's threshold note (CHECK 4).

> **Children.** Our services are not directed at children under 13, and we do not knowingly collect their personal information. If you believe a child has given us their information, contact us and we will delete it.
— *Why:* the US children's privacy rule. The main policy's section 10 says the same, so this is restated for the US reader.

> **Marketing emails.** Every marketing email we send tells you how to stop receiving them and includes our postal address. If you ask us to stop, we will. Emails about an order or your account are not marketing.
— *Why:* US commercial email rules. 🔴 It is not yet true for outreach emails (CHECK 1).

> **Text messages.** If we or a truck offer order updates by text message, you will only get them if you agree to receive them, and you can stop them at any time.
— *Why:* US text-message consent; nothing is sent today (CHECK 6).

> **Contact.** privacy@hatchgrab.com, or by post to HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom.
— *Why:* the postal route, written out because this page has no section 12 of its own.

**Not added, on purpose:** a customer-terms section. The Terms of Service are between HatchGrab and businesses, and say they
do not apply to customers. "Your customers' order is with you" sits in the operator section instead.

### Adding a country later
Add `## <Country>` to `content/legal/country-specific-terms.md`, with its own `### For food truck operators` and
`### Privacy, for everyone in <Country>`, and update the page's date (and `COUNTRY_TERMS_UPDATED`). Nothing else changes:
the main documents already point to the page.

### Code changes (all named)
- **`app/(legal)/country-terms/page.tsx` (new):** the same pattern as /privacy and /terms; reads the Markdown at build
  time; titles from `legalChrome.meta.countryTerms*`.
- **`lib/legal.ts`:**
  - `COUNTRY_TERMS_PATH = '/country-terms'` and `COUNTRY_TERMS_UPDATED`;
  - `PRIVACY_UPDATED` and `TERMS_UPDATED` → '19 October 2026'.
  - `LEGAL_LINKS` (the landing footer and consent lines) is **unchanged**, so the page is reached through the documents
    and the legal footer, as the brief asks.
- **`components/legal/LegalChrome.tsx`:** the footer gains "Country terms" between Terms and Contact.
- **`lib/legal-markdown.tsx`:**
  - the renderer gains `[label](/site-path)` links, so the documents can link the page;
  - only a path starting with "/" is linked; an external or `mailto:` link stays literal text;
  - it still splits and rejoins, so no character can be lost;
  - a document with no link renders byte-identically to before (proved).
- **Messages (`legalChrome`, en-GB only; the legal chrome has no en-US override):**
  - `countryTerms` "Country terms";
  - `meta.countryTermsTitle` "Country-specific terms — HatchGrab";
  - `meta.countryTermsDescription` "The extra rules that apply to HatchGrab in some countries."

## 3 · Gaps outside the documents (listed, not changed)

| # | Surface | Risk | Smallest fix |
|---|---|---|---|
| 1 | **PostHog** (`app/providers.tsx`) runs on public hosts, including the order page, with its default `localStorage+cookie` persistence | The main policy says "We do not use … third-party analytics cookies" and does not list PostHog. That is a mis-statement (US deceptive-practice rules; UK cookie rules), not only a US issue | Set PostHog to cookieless (`persistence: 'memory'`) on public pages, **or** name PostHog in privacy sections 5 and 6 and add consent |
| 2 | **Outreach emails** (`outreach_settings` signature and opt-out; `lib/outreach-doc.ts`) | US commercial email rules need a postal address, and the opt-out is only a warning. The country page now promises an address | Add the registered address to the outreach signature row (Dominic's settings, not `outreach_templates`), or append a fixed address line in the email builder; make a missing opt-out block sending to US prospects |
| 3 | **Online service fee** added as a separate line at checkout (`lib/order-charges.ts`); no all-in mode | California-style all-in pricing. The fee may be HatchGrab's own | A per-country/state "fees must be in prices" flag that turns the fee off; or, at minimum, a fee notice on the menu next to the tax notice |
| 4 | Basket footer folds the fee into "Tax & fees" | Clarity of fee disclosure | Keep the fee line unfolded where a fee applies |
| 5 | **Order page has no privacy link**, though it collects name, email and phone | California's online privacy act expects a conspicuous privacy link on pages collecting personal data | A "Privacy" link near "Place order" (and in customer emails) |
| 6 | `TERMS_VERSION = 'holding-2026-07-23'` (`app/api/signup/route.ts`) | The consent record no longer names the terms shown | Set it to the 19 October 2026 version and export it from `lib/legal.ts` |
| 7 | SMS | None sent; "coming soon" | Real opt-in wording (and STOP handling) before the feature ships |
| 8 | No "Do not sell or share" link, no Global Privacy Control handling | Not needed while nothing is sold or shared for advertising | Revisit if any advertising or analytics sharing is added |
| 9 | Legal page titles read "… — HatchGrab \| HatchGrab" | Cosmetic. It existed before on /terms and /privacy; the new page inherits it | Pass the titles as `absolute` in the three pages |
| 10 | Legal pages render in en-GB only | Fine: the documents are UK English; the US section uses US spelling | — |

## Proof

- **The documents:** `scripts/us-legal-draft.cjs` (36 checks, in the sweep):
  - each main document equals its `8a5c4b5a` text with exactly the named changes T1–T6 and P1–P2 applied;
  - there is no US section left in either;
  - the country page has one `##` per country (United States), US spelling, and each brief item present;
  - all three pages render through the real renderer with every paragraph, the date and the links;
  - the footer link is present;
  - the renderer links only site-relative paths, loses no character, and renders a link-free document byte-identically
    to before.
- **Live (read-only, Dominic's dev server):** `/country-terms`, `/terms` and `/privacy` all return 200, with
  "19 October 2026", the cross-reference links and the United States heading.
- `tsc --noEmit`: clean.
- **Full sweep:** **137 run · 137 passed · 0 failed**.
- `next build`: exit 0; `/country-terms` is in the route table.
- **Named re-pins:**
  - `scripts/_lp1e-named.cjs` and `scripts/language-phase-1e-tidy.cjs`: `legal-country-terms-link`. The legal footer gains
    one anchor after Terms (precise on GB; listed on US).
  - The harness screen refused a test string containing a payment-provider name; it was changed to a neutral example.

**The diff, as git shows it:** the content diff is the before → after tables above, line for line. The code diff is the code
changes listed above.

## Localhost check (Dominic)

- http://hatchgrab.localhost:3000/terms — the new "Some countries have extra rules" line under section 1 links to the page;
  "Last updated: 19 October 2026".
- http://hatchgrab.localhost:3000/privacy — the same line after the intro; "Last updated: 19 October 2026".
- http://hatchgrab.localhost:3000/country-terms — the new page:
  - "United States", with "For food truck operators" and "Privacy, for everyone in the United States";
  - the footer reads Privacy · Terms · Country terms · Contact.

## SQL

Read-only only (Step 0); results are in the chat reply. No database change.

## Undo (only if Dominic asks)

Code and content only:
- revert `content/legal/*.md`, `lib/legal.ts`, `lib/legal-markdown.tsx`, `components/legal/LegalChrome.tsx` and the
  `legalChrome` messages;
- delete `app/(legal)/country-terms/` and `content/legal/country-specific-terms.md`.
