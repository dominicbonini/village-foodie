# ireland-3 — the Irish section of the Country-specific terms

**Date:** 22 October 2026 (the documents are dated 21 October 2026, as you decided) · **Branch:** `main` (uncommitted, on
top of `7fcd4fc9`) · nothing pushed or deployed · no database change, and no SQL run at all · Ireland's switch was not touched.

> **Corrected 22 October 2026** (address-formats-2 follow-up). This report first said "Ireland is still OFF" and §1
> doubted the allergen column had been added. Both were wrong; I hadn't checked. The live `country_settings` row for IE
> has been `enabled = true` since 21 October, which Dominic confirmed is intended (so search engines can start
> indexing). The `allergen_card_only_allowed` column exists, with IE `false` (`docs/address-formats-2-report.md` §1).
> The lines below are corrected.

**The prompt** arrived intact: nothing was garbled and no two instructions contradicted each other. Two wording points,
neither one blocking:

- **"GB and US sections byte-identical."** The Country-specific terms page has **no GB section**. Its countries are
  the United States and now Ireland. GB's rules are the Terms of Service and the Privacy Policy themselves. So I proved
  these byte-identical: both of those documents, the page's intro, and the whole US section (§3).
- **"The rendered /terms page, or wherever the country-specific terms show."** They show on **`/country-terms`**. That
  is the page in the screenshots.

## Summary

- **The Ireland section is in place,** in `content/legal/country-specific-terms.md`, after the United States section.
  It is the §2.1 draft from `docs/ireland-2-report.md`, paragraph for paragraph, with only your changes:
  - every **[FLAG n]** marker removed;
  - "Our representative in the EU" left out;
  - "Where your data is kept" kept, without its flag;
  - the allergens paragraph rewritten to say what the product does in Ireland (§1).
- **Dates:** the page's "Last updated" and `COUNTRY_TERMS_UPDATED` both moved to **21 October 2026**.
- **`TERMS_VERSION` moved, from `'2026-10-20'` to `'2026-10-21'`** (§2 says why). Nothing reads this value. New
  signups simply record the new version, and no existing truck is asked to accept anything again.
- **Proof:**
  - a new harness, `scripts/ireland-3.cjs`, runs 23 checks and passes (two negative controls fail where they should);
  - the screenshots are in `docs/ireland-3/`;
  - the GB documents and the US section are byte-identical;
  - no "[FLAG" is left in `content/legal`;
  - `tsc` passes, and so does the build;
  - lint is unchanged: 2,445 errors and 378 warnings before and after, and no file has more errors than before;
  - the full sweep passed: **155 run · 155 passed · 0 failed**.

## 1 · The text

The new section has the same shape as the US one: `## Ireland`, then "For food truck operators", then "Privacy, for
everyone in Ireland". It has 18 paragraphs, including the headings, and is written as one paragraph per line like the
rest of the file.

**The allergens paragraph, as published:**

> **Allergens.** You must give allergen information for every dish as Irish and EU law requires: the 14 allergens
> listed in Regulation (EU) No 1169/2011, under the Irish rules the Food Safety Authority of Ireland enforces (S.I. No.
> 489 of 2014, as amended). For orders placed online, that information has to be available in writing before your
> customer orders. In Ireland, HatchGrab shows allergens against each dish on your menu. You can upload an allergen
> card to help fill them in, but the card is not shown on its own in place of them. HatchGrab shows exactly what you
> enter, as section 3 of the Terms of Service says. We do not check it.

The two middle sentences are the only new words. The rest is the draft's paragraph unchanged.

**Why "not shown on its own in place of them" and not "not shown at all":** in Ireland a truck can still pick
"both". That mode shows the dishes' allergens **and** the card. Only "the card on its own" is blocked. That matches
the code, which reads `country_settings.allergen_card_only_allowed` (false for IE) and never checks a country code:

- the order page treats a saved `card` as per dish (`app/api/menu/[truckId]/route.ts:96-99`);
- `/api/manage` refuses a change to `card` (`app/api/manage/route.ts:2089`);
- the allergen wizard and the import's Allergens step open on the card upload, then go to the per-dish review
  (`docs/allergen-card-country-report.md`).

⚠️ **This sentence only becomes true live once allergen-card-country's code is deployed.** Its column is already in
the database, with IE `false` (`docs/address-formats-2-report.md` §1). The code that reads it is still uncommitted
here, like this change. Deploy them together, or the page will promise something the product doesn't yet do.

## 2 · Dates and `TERMS_VERSION`: what I did and why

| Constant / line | Before | After |
|---|---|---|
| `content/legal/country-specific-terms.md` "Last updated" | 19 October 2026 | **21 October 2026** |
| `COUNTRY_TERMS_UPDATED` (`lib/legal.ts`) | `'19 October 2026'` | **`'21 October 2026'`** |
| `TERMS_VERSION` (`lib/legal.ts`) | `'2026-10-20'` | **`'2026-10-21'`** |
| `PRIVACY_UPDATED`, `TERMS_UPDATED` | 19 / 20 October 2026 | unchanged |

**Why `TERMS_VERSION` moved.** The US precedent moved it:

- When the US section went in (us-legal-draft, 19 October 2026), `TERMS_VERSION` was still the stale
  `'holding-2026-07-23'`. That report listed this as Gap 6: "the consent record no longer names the terms shown".
- legal-follow-ups fixed it **the same day**, to `'2026-10-19'`. That was the date of all three documents, the
  US-section page included.
- pricing-tidy moved it again, to `'2026-10-20'`, when the Terms changed.

So it has followed every document change, and `lib/legal.ts` states the rule: "MOVE IT WITH THE DOCUMENTS: it names
the Terms of Service, Privacy Policy and Country-specific terms dated above — the latest of them". The
Country-specific terms form part of the Terms, so the latest of the three dates is now 21 October 2026. I updated the
constant's comment to record this.

**What it changes:**

- **Nothing for existing trucks.** `TERMS_VERSION` is only *written*, as `operators.terms_version` at signup
  (`app/api/signup/route.ts:153`).
- I checked the code again today: nothing in `app/`, `lib/`, `components/` or `supabase/` reads it. The only other
  match is the migration that creates the column.
- The database-function check is pricing-tidy's from 20 October. I didn't repeat it, because no SQL was run this time.

**Knock-on:** the HatchGrab sitemap's `/country-terms` lastmod is now 2026-10-21 (`app/sitemap.ts` reads
`COUNTRY_TERMS_UPDATED`).

## 3 · Proof

**`scripts/ireland-3.cjs`** (new, registered in `scripts/harnesses.json`) runs **23 passed, 0 failed**. It compares
against `7fcd4fc9`, and takes the draft from `docs/ireland-2-report.md` at that commit, so later edits to the report
can't move the target. It checks that:

- everything before `## Ireland` is byte for byte the BEFORE file, with only the "Last updated" line changed;
- the US section is byte-identical (4,766 bytes);
- `terms-and-conditions.md` and `privacy-policy.md` are byte-identical;
- the Ireland section is the draft, paragraph for paragraph, after the named changes are applied;
- its three headings are in order;
- "Where your data is kept" is present without its flag;
- the word "representative" appears nowhere in the section;
- the allergens paragraph says per dish, says the card helps, and says it is never shown on its own;
- UK spelling is used;
- no "[FLAG" appears in any of the three `content/legal` files;
- the four `lib/legal.ts` values are right, and no other code changed;
- the real renderer (`renderLegalMarkdownHtml`) gives BEFORE's HTML with the date changed, followed by the Ireland
  section's HTML;
- every Ireland paragraph is on the page, with the United States heading before Ireland's.

**Negative controls** (the file was restored from a copy after each one, and the harness then passed 23/23):

- changing "honor" to "honour" in the US section fails 3 checks (US byte-identical, prefix, render);
- appending `**[FLAG 9]**` fails 3 checks (no FLAG, draft match, ending).

**Byte-identical, by SHA-256** (working tree = `7fcd4fc9`):

- `terms-and-conditions.md` `52fc845a…4b0a1a`
- `privacy-policy.md` `400c0045…a0e7`

**The rendered page.** I ran a production build (`next start` on :3123, stopped afterwards) and opened
`http://hatchgrab.localhost:3123/country-terms` in headless Chrome. The status was 200 at both 1280 and 390px wide.
In the page as rendered:

- the h2 headings are `["United States","Ireland"]`;
- "Last updated" reads "21 October 2026";
- there is no "[FLAG" and no "representative";
- the allergens sentences appear as above;
- the title is "Country-specific terms — HatchGrab".

The screenshots:

- `docs/ireland-3/country-terms-ireland-desktop.png`: the Ireland section at 1280px;
- `docs/ireland-3/country-terms-ireland-phone.png`: the same at 390px (2×);
- `docs/ireland-3/country-terms-full.png`: the whole page at 1280px, from the date line through US and Ireland.

**Legal harnesses:**

- `us-legal-draft` 36/36;
- `legal-follow-ups` 34/34;
- `outreach-legal-footer` ✅;
- `ireland-3` 23/23;
- `seo-fixes` 86/86.

**Checks:**

- **`tsc --noEmit`:** passes.
- **`npm run build`:** passes, and `/country-terms` is in the route list.
- **Lint:** 2,445 errors and 378 warnings before; the same after. No file has more errors than before (compared file
  by file).
- **Sweep** (`node scripts/run-harnesses.cjs`):
  - baseline before any edit: 154/154;
  - first run after the edits: 154/155 (`plans-data-model` needed a re-pin, §4);
  - final run: **155 run · 155 passed · 0 failed**.

## 4 · Re-pins (each named, each gated on the change having landed)

| File | What |
|---|---|
| `scripts/us-legal-draft.cjs` | The Country-specific terms date is 21 October 2026, and the country headings are `["United States","Ireland"]`. The US-spelling check now reads only the US section: Ireland's "recognises" is correct UK spelling. |
| `scripts/legal-follow-ups.cjs` | `TERMS_VERSION` is `'2026-10-21'`. |
| `scripts/_lp-ireland-3.cjs` (new module) | The two named changes, each a precise transform applied after pricing-tidy's: signup `terms_version` 2026-10-20 → 2026-10-21, and the sitemap's `/country-terms` lastmod 2026-10-19 → 2026-10-21. |
| `scripts/_lp-pricing-tidy.cjs` | `LANDED` was "`TERMS_VERSION` is exactly 2026-10-20". It is now "2026-10-20 or later", so its re-pins still apply underneath ireland-3's. |
| `scripts/_lp2-named.cjs` | The `ireland-3-terms-version` entry, for `language-phase-1c` and `-2`. |
| `scripts/_lp1e-named.cjs`, `scripts/language-phase-1e-tidy.cjs` | The sitemap item. |
| `scripts/plans-data-model.cjs` | The expected `/country-terms` lastmod. |
| `scripts/harnesses.json` | `ireland-3.cjs` listed, and `_lp-ireland-3.cjs` added under `shared_modules`. |

**Lint:** each `require` I added carries an `eslint-disable-next-line @typescript-eslint/no-require-imports` with a
reason, and the two new files carry a file-level disable. This is how "no new lint errors" holds. The repo had no such
comments before; its `.cjs` scripts account for most of the existing 2,445.

## 5 · Notes

- **Removing the markers doesn't settle the questions behind them.** `docs/ireland-2-report.md` §2.2 still applies.
  The published text now states as fact these points, which the flags had marked as open:
  - **Flag 1:** "Where your data is kept" says US transfers are "covered by a safeguard the GDPR recognises". But
    Privacy Policy §6 names the **UK** mechanism (IDTA / Addendum). For EU-origin data, the EU one is what counts
    (the Data Privacy Framework or the EU SCCs). Check that each US provider covers it.
    The EU representative question is still open, and the paragraph is left out for now, as you asked.
  - **Flag 2:** "Our prices" says we're not VAT-registered and that VAT-registered trucks self-account. The
    no-VAT-number case, possibly Irish VAT from the first euro, is not covered by the text.
  - **Flags 3, 4, 5, 7, 8** (governing law, the P2B Regulation, what a truck must show before ordering, ePrivacy,
    the truck VAT rate): unchanged.
  - **Flag 6** (allergens) is the one the product has now answered (§1).
- **The page is public on every host.** `/country-terms` isn't country-gated. Once deployed, everyone sees the Ireland
  section. Ireland is already switched on, so that is what you want.
- **Not mine, left alone:** the runner's dry run lists 12 files in `scripts/` that are in neither the list nor an
  excluded group:
  - `_address-formats-1-after.cjs`
  - `_lp-address-formats-1.cjs`
  - `_lp-allergen-card-country.cjs`
  - `_lp2-named-usl.cjs`
  - the seven `_midnight-*.cjs`
  - `allergen-card-country-screens.cjs`

  They came from earlier workstreams and were there before this one.

## 6 · Files

- `content/legal/country-specific-terms.md`: the date, and the Ireland section appended.
- `lib/legal.ts`: `COUNTRY_TERMS_UPDATED`, `TERMS_VERSION`, and its comment.
- `scripts/ireland-3.cjs` (new), `scripts/_lp-ireland-3.cjs` (new).
- `scripts/us-legal-draft.cjs`, `scripts/legal-follow-ups.cjs`, `scripts/_lp-pricing-tidy.cjs`,
  `scripts/_lp2-named.cjs`, `scripts/_lp1e-named.cjs`, `scripts/language-phase-1e-tidy.cjs`,
  `scripts/plans-data-model.cjs`, `scripts/harnesses.json`: re-pins (§4).
- `docs/ireland-3/`: the three screenshots.
- `docs/ireland-3-report.md`: this report.

## Undo (only if Dominic asks)

There's no database change and no SQL to undo.

- **To keep `TERMS_VERSION` at `'2026-10-20'`:** set it back in `lib/legal.ts`, and restore the `legal-follow-ups.cjs`
  pin. The `ireland-3-terms-version` entry switches itself off, because its `LANDED` reads the constant. Then change
  `ireland-3.cjs`'s `TERMS_VERSION` check.
- **To drop the whole change:** remove the `## Ireland` section and put the date back to 19 October 2026, both in the
  file and in `COUNTRY_TERMS_UPDATED`. Then revert the re-pins in §4.
