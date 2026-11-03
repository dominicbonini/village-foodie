# tidy-1: small outstanding fixes

*3 November 2026. One commit per item, on `main`, not pushed or deployed. No migration, and nothing written to the database. No truck's data, money path, order-page layout or live truck was touched.*

| # | Item | Outcome | Commit |
|---|---|---|---|
| 1 | Village Foodie popup on hatchgrab.com truck pages | **Done.** No Tally on any HatchGrab page now. | 46c31cce, follow-up 19884302 |
| 2 | App claims without a country check | **Not done, by your decision** ("dont do point 2. apps will be available shortly") | — |
| 3 | Privacy wording tidy (demo-2d) | **Done**, in English and all 28 translations | fe34c2cb |
| 4 | The sweep's failures at HEAD | **All settled:** 2 copy fixes, 3 stale tests updated | 80537536 |
| 5 | pricing-check-1.cjs registration | **Already registered** (since 8fd3ba83); passes 82/82. No change. | (in ec853c94's notes) |
| 6 | Dead code | **getSlotIndicator removed.** "page 2.tsx" and a trucks.is_test were already gone. slot_capacity is live, so it stays. | ec853c94 |
| 7 | Node version for Canada's 2026 time-zone changes | **`engines.node` set to "24.x"**; full sweep run under Node 24 | e3a755b3 |

## 1 · No Tally on hatchgrab.com truck pages

**The change:**
- `app/trucks/[slug]/page.tsx` already decided the brand on the server (`isHatchGrabHost(await requestHost())`, the predicate `/contact` uses). It now also passes **`tally: false` on the HatchGrab host only**.
- With `tally` false, `TruckClient` drops:
  - the Tally script (`TruckClient.tsx`, formerly line 158);
  - the floating "Get the weekly schedule" button, which opened Tally form 81xAKx;
  - through the footer's new `newsletter={false}`, the footer's newsletter block (its title, text, button and "no spam" line).

**Unchanged:**
- **Every footer link** (contact, report an issue, and so on).
- **Village Foodie:** the defaults are `tally = true` and `newsletter = true`, so its truck page receives exactly the props it always did. **It is byte-identical to 6c29c2e2** for a UK and a US truck, rendered at that commit in a worktree and compared with today's render (`scripts/fixtures/tidy-1-identity.json`).

**Tally is now only on Village Foodie's pages:** its `/contact` branch and embed, the discovery home page, `/hire`, the venue page, and the truck page behind `tally`. On hatchgrab.com, `/` is the landing page and `/hire` and `/venues/<slug>` redirect to Village Foodie (308). **No HatchGrab page loads tally.so** (proved by rendering both hosts and scanning every source file). contact-1's "known exception" is gone; its check now proves that.

**Named re-pin:** `scripts/_lp-tidy-1.cjs` `hgTruck` takes exactly those pieces out of the HatchGrab-host truck view, and throws if any isn't there. It is used in language-phase-1e, language-phase-1e-tidy (and its "discovery on" and "GB unchanged" checks), plans-data-model, and us-rehearsal-fixes.

**The follow-up commit (19884302):** the Node 24 sweep found one more harness pinning the HatchGrab-host truck page. us-rehearsal-fixes failed on Node 22 too, so this was item 1, not the Node version. Its harness writes the script tag without `data-strategy`, so `hgTruck` now accepts the tag with or without it, still exactly once. I couldn't fold this into item 1's commit, because rewriting history needs an interactive rebase. contact-1's source-closure checks exempt exactly the three files tidy-1 changed, since their Village Foodie render is proven byte-identical.

## 2 · App claims: not done (your decision)

**Found and left as they are:**
- `featuresPage.detail.kitchen_app` ("…the only way to keep taking orders when you lose signal")
- `manageSettings.getApp.body` ("Free with your account, on iPhone, iPad and Android")
- `planFeatures.row.kitchen_app.name` and `pricing.base.app` ("iPhone, iPad and Android kitchen app"; plan and pricing rows)
- the comparison namespace's app rows: `comparison.features.ipad.*`, `comparison.features.android.*`, `comparison.features.tickets.ours`, `comparison.features.offline.ours`
  - these rows are already decided per country by the comparison page's own app flags (`comparison.fit.appClause`, `comparison.admin.check.apps`)
- `landing.does.offlineApps`, `featuresPage.offlineApps` and `faq.phrases.apps*` are already conditional on the app flags (copy-truth-1, faq-1)

## 3 · The Privacy Policy's demo section

**English before:**

> **Last updated:** 2 November 2026
> …
> We delete your demo email, the menu file and the demo itself when the demo expires: 24 hours after you build it, or 14 days if you ask us to keep it. If you sign up, we keep the demo record for up to 30 days so your menu can move into your account, then delete it. If you sign up, your menu moves into your account, and your account's privacy terms apply from then on.
>
> We keep anonymous counts of how far demos get, such as "a demo was built" or "an order was placed". They contain no email address, and once your demo is deleted they can no longer be linked to you.

**English after:**

> **Last updated:** 3 November 2026
> …
> We delete your demo email, the menu file and the demo itself when the demo expires: 24 hours after you build it, or 14 days if you ask us to keep it. If you sign up, your menu moves into your account and your account's privacy terms apply from then on; we keep the demo record for up to 30 days so the menu can move across, then delete it.
>
> We keep simple counts of how far demos get, such as "a demo was built" or "an order was placed". They contain no email address, and once your demo is deleted they can no longer be linked to you.

**The rest of the change:**
- **The merge keeps both facts and the 30 days.** The menu moving and the account's terms applying come first, and the 30-day keep is joined to them.
- **Translations:** the same two edits in **all 28**, in each document's own words and register. Each translation's only change is those two paragraphs, re-stamped, with the drift check clean.
- **legal-languages-1:** 220/220.
- **Dates:** `PRIVACY_UPDATED` is `'3 November 2026'` (and the document's own line). `TERMS_VERSION` is `'2026-11-03'`, because it moves with the latest of the three documents; it is only written at signup, so no one is asked to re-accept. The Terms and Country-specific terms dates are unchanged.
- **demo-2's drift check** read the old "If you sign up, we keep the demo record…" sentence. It now reads the merged one and is still tied to `CLAIM_GRACE_DAYS = 30` (69/69).
- **Named re-pins:**
  - `_lp-tidy-1.cjs` `asBefore`, chained **first** by `_lp-contact-1.cjs` (newest change first), so every harness pinning the older legal bytes takes tidy-1 back exactly;
  - `tidy-1-terms-version` in `_lp2-named.cjs` (language-phase-1c and 2);
  - the sitemap `/privacy` lastmod item (1e, 1e-tidy, plans-data-model);
  - contact-1 (§8's exact-change and per-translation checks), legal-languages-1 and us-legal-draft.

## 4 · The sweep's failures at HEAD: all settled

| Harness | Cause | Fix |
|---|---|---|
| **canada-1** "postal code (not ZIP)…" | **Code wrong.** The postal-code part passed. The failing part was "card terminal, not card reader": en-GB's `comparison.features.terminal.explain` ("…provides a card reader…", 7d879790, 25 Oct) reached Canadian English unchanged. | en-CA override: "The vendor provides a card terminal for payments at the truck." |
| **europe-languages-1** de-CH "ß" | **Code wrong.** de-DE's `comparison.features.options.explain` ("Größen, Soßen und Extras…") reached Swiss German unchanged. | de-CH override: "Grössen, Saucen und Extras, auch Pflichtauswahl." ("Saucen", the Swiss word, rather than a literal "Sossen") |
| **schedule-graphics-places** "the Feature gates the tab…" | **Test stale since a21e868a** (29 Oct, "competitor updates"). That commit removed `KEY_FEATURES` and its "Social media posts" row from `lib/pricing-check.ts`, so the file no longer reads `schedule_graphics`; the code is right. | `lib/pricing-check.ts` out of the expected list, with that note (270/270) |
| **world-countries-1** "the tagline words still in source" | **Test stale since 2b625a66.** That commit added the check together with two harness files that must name the words (`_lp-tagline.cjs` cuts the tagline from older pages; `world-countries-1-hero.cjs` proves it gone). | Both excluded from the source scan, with that note (178/178) |
| **world-countries-2** "Terms edit — expected once, found 0" | **Test stale since 2b625a66.** That commit included this harness with world-countries-2's own changes, so "HEAD" (meaning the tree before them) carried them twice. | "HEAD" is 3240c536 by name, as legal-languages-1 reads it; its Privacy comparison goes through the named chain (47/47) |
| *legal-languages-1* | Settled in contact-1 (the same baseline cause) | 220/220 |

## 5 · pricing-check-1.cjs

It is **already registered** in `scripts/harnesses.json` (in the list since 8fd3ba83, 29 October), passes **82/82** and has run in every sweep. Nothing to add. tidy-1 §5 checks it's listed.

## 6 · Dead code (only what is provably unused)

- **`app/manage/[token]/page 2.tsx`:** it **does not exist**, on disk or in git, so there was nothing to delete.
- **The phantom `is_test`:** **nothing reads a `trucks.is_test`.**
  - Every `is_test` in code is `outreach_messages.is_test`, a real column (`20260928_outreach_messages.sql`; live schema, read-only: the only `is_test` column is `outreach_messages`'s).
  - The rest are a comment saying such a truck column is forbidden, and the payment rows' computed `account_is_test`.
  - Nothing to remove.
- **`getSlotIndicator`: removed.**
  - **The proof:** `git grep` finds no caller in the app, the libraries or the harnesses (manual §27 "Remove dead slot code (V6.4)").
  - **What stays:** `lib/slot-indicator.ts` keeps only the `SlotTone` type, which `lib/slot-availability.ts` and `lib/slot-display.ts` import.
  - **Comments:** two that said "read by getSlotIndicator" now name `lib/slot-display.ts`.
  - **Check:** `tsc --noEmit` is clean.
- **`slot_capacity`: kept, because it is live.** Its callers write truck data:
  - Manage's `save_slot_capacity` action (`app/api/manage/route.ts:822`);
  - the event save (`:1356`);
  - demo provisioning (`lib/provision-demo-event.ts`);
  - demo restart (`lib/demo-restart.ts`);
  - Admin's demo counts.

  Removing it would change a truck's data path, which this brief rules out. The live database read: there is a table of that name, not a column.

## 7 · Node and Canada's 2026 time-zone changes

- **What Vercel builds with:**
  - **nothing in the repository pinned it** (no `engines`, no `.nvmrc`, nothing in `vercel.json`), so Vercel used the project's dashboard setting;
  - **I can't see that setting, or a Vercel build log** (manual §83.1 also has it as unverified).
- **What has the 2026 Canadian data** (`scripts/check-tzdata.cjs`, the build's own check): Node 22.23.4+, 24.22.1+ or 26.11.0+ (tzdb 2026e).
- **Locally:**
  - **Node 22.22.3** (the default): tz data 2026a, **missing**.
  - **Node 24.13.0** (`/usr/local/bin/node`): tz data 2025b, **missing** too, since that patch predates the changes.
- **The change:** `package.json` **`"engines": { "node": "24.x" }`**. Vercel then builds on the newest Node 24 patch, which carries 2026e, whatever the dashboard says. If Vercel was already on 24.x, this changes nothing.
- **Tested:** the full sweep ran under Node 24 (24.13.0), as the brief asked; results below. The local Node 24 is older than the patch Vercel will use, so this tests the major version, not the time-zone data.
- **canada-2** asserted "no engines field or Node pin added" (canada-2, 22 Oct). It is stale on purpose now, and updated: the only pin is `engines` "24.x", there's still no `.nvmrc`, and there's still no app code for it.
- **What you need to do in Vercel:** nothing is required, because `engines` overrides the dashboard. Optionally set **Settings → Build and Deployment → Node.js Version → 24.x** so the two agree.
- **After the next deploy:** check that the build log's first `check-tzdata:` line ends with **"present"**. If it still says "MISSING", the build ran on an older 24 patch: redeploy without the build cache.

## Final sweep: all green

`node scripts/run-harnesses.cjs` under **Node 24.13.0**, after every item: **all 185 listed harnesses pass, 0 failures** ("✅ every listed harness passed").

- **That includes the six that failed at HEAD before tidy-1:** canada-1, europe-languages-1, schedule-graphics-places, world-countries-1, world-countries-2 and legal-languages-1.
- **Nothing is left unsettled.**
- **How it got there:**
  - the first Node 24 sweep found two failures, both fixed: us-rehearsal-fixes (item 1's follow-up) and canada-2's engines check (item 7);
  - this final sweep is the run after those fixes;
  - every harness changed along the way was also run on Node 22.22.3, the local default, and passed.
- **Lint and types:** `tsc --noEmit` is clean. eslint is clean on every changed file, apart from findings that predate tidy-1: `TruckClient.tsx`'s two `(window as any).Tally` lines and `scripts/demo-2.cjs`'s missing require directive.

## Files

- **Item 1:** `app/trucks/[slug]/page.tsx`, `app/trucks/[slug]/TruckClient.tsx`, `components/Footer.tsx`; `scripts/tidy-1.cjs`, `scripts/_lp-tidy-1.cjs`, `scripts/fixtures/tidy-1-identity.json`; re-pins in `scripts/_lp1e-named.cjs`, `scripts/language-phase-1e-tidy.cjs`, `scripts/plans-data-model.cjs`, `scripts/contact-1.cjs`; `scripts/harnesses.json`.
- **Item 3:** `content/legal/privacy-policy.md` + 28 translations; `lib/legal.ts`; `scripts/demo-2.cjs`, `scripts/_lp-tidy-1.cjs`, `scripts/_lp-contact-1.cjs`, `scripts/_lp2-named.cjs`, `scripts/legal-languages-1.cjs`, `scripts/us-legal-draft.cjs`, `scripts/contact-1.cjs`, `scripts/plans-data-model.cjs`, `scripts/_lp1e-named.cjs`, `scripts/language-phase-1e-tidy.cjs`.
- **Item 4:** `messages/en-CA.json`, `messages/de-CH.json` (+ the generated catalogue); `scripts/schedule-graphics-places.cjs`, `scripts/world-countries-1.cjs`, `scripts/world-countries-2.cjs`.
- **Item 6:** `lib/slot-indicator.ts`, `lib/slot-availability.ts`, `components/dashboard/types.ts`.
- **Item 7:** `package.json`.
- **This report.**
