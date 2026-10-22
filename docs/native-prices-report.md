# native-prices: each country's own pages show our prices the way locals write them

**Date:** 22 October 2026 · **Branch:** `main` (uncommitted, on top of `7fcd4fc9`) · nothing pushed or deployed · no
database change and no SQL (none was needed) · Admin › Countries not touched.

**The prompt** arrived intact: nothing was garbled and no two instructions contradicted each other.

## ⚠️ First: five things to know

1. **Admin didn't "still say NZ$ / A$". It said "$".**
   - Admin › Plans formatted every country with its own format (`moneyFormatOf`). So the same table showed Australia
     "$39", New Zealand "$49" and the US "$29": three different dollars, all written "$".
   - Your rule puts Admin among the side-by-side places that keep the international form, so I changed the table and
     the truck modal's "Standard price" line to it.
   - The table now shows "A$39" and "NZ$49" beside "£29", "$29" and "€29". GB, US and IE cells are unchanged (§4).
2. **Canada and Sweden have no page address.** The country routes are a fixed list (uk, us, ie, au, nz).
   - "/ca" and "/se" are fixtures. The real landing, /features, /compare and PDF render for them through a patch of
     the segment list that exists **only inside the harness bundle**. The app's list is untouched.
   - Their prices are illustrative (CAD 39, SEK 29: the brief's own examples), chosen to show the format.
3. **One currency needs the registry override: RON.**
   - Intl in each currency's home locale already gives the native form for 13 of the 14.
   - ro-RO prints "29 RON", but Romanians write "29 lei". So RON carries `homeDisplay: 'narrowSymbol'`, and the
     harness fails if any other currency gains an override or RON stops needing one.
   - No country uses RON today. Say if you'd rather keep "29 RON".
4. **The line's grey is `--ink-soft` (#5F7A99), the cards' own "per truck / month" grey.**
   - It measures 4.44:1 on white, just under the 4.5:1 AA floor for small text. The footnote grey (`--ink-faint`) is
     much lighter, about 2.2:1, so I didn't use it.
   - If you want it to pass AA strictly, `--hero-grey` (#3E5472, 7.73:1) is the step darker. It's a one-word change.
5. **The line needs the currency's name in the plural**, and the registry only had the singular. So each currency now
   has `namePlural` ("New Zealand dollars", "Swedish kronor", "Danish kroner"…). These are English, like `name`. The
   sentence frame is a message: `pricing.currencyLine` = "Prices in {currency} ({code})", en-GB base.

## Summary

- **The rule lives in `lib/currencies.ts`**, for all 14 currencies:
  - `symbol` is now the **home** symbol (£, $, €, kr, kr., zł, Kč, Ft, lei, CHF);
  - `intlSymbol` is the international one (CA$, A$, NZ$, SEK, NOK, DKK, or the home symbol);
  - **`symbolShared`** is justified in a comment beside each entry;
  - `namePlural`;
  - `homeDisplay`, the one override (RON).
  - **`planLocale` is retired.**
- **Two helpers, one per form** (`lib/country-settings-types.ts`):
  - **`planMoneyFormatOf`** is the home form: the country's own locale (what a truck's menu already uses), plus the
    override. It's used by the pricing section, /features, /compare, the plans PDF, Billing, the van add-on price and
    the plan prompts.
  - **`intlMoneyFormatOf`** is the international form, for shared-symbol currencies only. It's used by /llms.txt and
    Admin. "The bare $ that isn't USD" rule is gone.
- **The currency line,** where the symbol is shared:
  - landing and /features: centred and muted above the plans (the approved mockup);
  - /compare: under the intro, before the first question;
  - the plans PDF and Billing: once, opening the small print or footnotes.
  - GB, US and IE get no line.
- **The results:**
  - /nz shows "$49", "$119" and "$7,000"; /au "$39"; /ca "$39"; /se "29 kr" and "4 000 kr".
  - /llms.txt and Admin still name the dollar: A$39, NZ$49.
  - The JSON-LD keeps `priceCurrency` codes and plain-number prices.
- **GB, US and IE are byte-identical:** 9 pages with their metadata, 3 PDFs and /llms.txt, against a snapshot taken
  before any edit (§5). A truck's own menu and order money is unchanged.
- **Proof:**
  - `native-prices` **53/53** (new);
  - `currency-registry` **40/40** (extended to the new fields for all 14);
  - `anz-1` **76/76** (re-pinned);
  - 60 screenshots in WebKit and Chromium, plus 2 printed PDFs;
  - tsc and the build pass;
  - lint is unchanged at 2,445 errors and 378 warnings;
  - full sweep **157 run · 157 passed · 0 failed**.

## 1 · The registry (`lib/currencies.ts`)

| Code | Home form (own pages) | International form (Admin, /llms.txt) | symbolShared | Why | Line |
|---|---|---|---|---|---|
| GBP | £29 | £29 | false | "£" names sterling: the other "£" pounds are local issues at par, and the Egyptian, Lebanese and Syrian pounds write their own signs | — |
| USD | $29 | $29 | false | the bare "$" *is* the US dollar wherever currencies are compared; other dollars qualify themselves against it (CA$, A$, NZ$) | — |
| EUR | €29 | €29 | false | "€" is the euro's alone | — |
| CAD | $29 | CA$29 | **true** | "$" is also the US, Australian and New Zealand dollars' | Prices in Canadian dollars (CAD) |
| AUD | $29 | A$29 | **true** | as CAD | Prices in Australian dollars (AUD) |
| NZD | $29 | NZ$29 | **true** | as CAD | Prices in New Zealand dollars (NZD) |
| CHF | CHF 29 | CHF 29 | false | the franc is written with its own code at home; no other currency writes it | — |
| SEK | 29 kr | SEK 29 | **true** | "kr" is also the Norwegian, Danish and Icelandic crowns' | Prices in Swedish kronor (SEK) |
| NOK | 29 kr | NOK 29 | **true** | as SEK | Prices in Norwegian kroner (NOK) |
| DKK | 29 kr. | DKK 29 | **true** | Danish writes "kr.", the same letters as the other crowns | Prices in Danish kroner (DKK) |
| PLN | 29 zł | 29 zł | false | "zł" is the złoty's alone | — |
| CZK | 29 Kč | 29 Kč | false | "Kč" is the koruna's alone (the Slovak "Sk" ended with the euro) | — |
| HUF | 29 Ft | 29 Ft | false | "Ft" is the forint's alone | — |
| RON | 29 lei *(override)* | 29 lei | false | "lei" is Romania's. The Moldovan leu is also "lei" in speech but writes "L" / "MDL" and isn't ours | — |

- The home form is Intl's own form in the currency's home locale, unchanged by us, except RON.
- The "Why" column is a comment directly above each entry in the file. The harness fails if one is missing.
- The decimals, minor signs, short-fee styles and the eftpos flag are unchanged.

## 2 · Where each form is used

| Surface | Form | Line |
|---|---|---|
| Landing pricing section (`components/pricing/PricingSection.tsx`) | home | `.price-currency`, centred, directly above `.plans`. On a phone it keeps its place above the cards (`order: 2`, with them) |
| /features (`app/features/page.tsx`) | home | the same paragraph above the plan table |
| /compare (`app/compare/page.tsx` → `CostComparison.tsx`) | home | under the intro, `text-sm text-slate-500`. The server page writes the sentence and passes it only when there is one, so GB/US/IE props are unchanged and the calculator loads no extra catalogue |
| Plans PDF (`lib/plans-pdf.ts`) | home | first line of "Small print" |
| Manage › Billing: plan card, plan table, upgrade modal | home | once, opening the footnotes under the table |
| Van modal / add-van label (`vanAddonLabel`) | home | (Billing's line) |
| Plan prompts (`usePlanPriceLabel` → `PlanPrompt`) | home | — |
| Signup / trial wording | no prices: those sentences quote months only (checked: no price parameter in any signup, setup or trial message) | — |
| /llms.txt (`lib/llms-text.ts`) | **international** | — |
| Admin › Plans table and the truck modal's standard price (`app/admin/page.tsx`) | **international** (it was the country's own) | — |
| JSON-LD (`lib/structured-data.ts`) | ISO code + number, unchanged | — |
| A truck's menu, orders, receipts | its own format (`moneyFormatOf`), unchanged | — |

**The formatter:** `MoneyFormat` gained an optional `currencyDisplay`. It's passed to Intl only when the registry sets
it, so every other format's Intl options are the same object as before (same key order, same cache key).

## 3 · Screenshots (`docs/native-prices/`)

- **How they were made:**
  - The real pages are rendered from fixtures (`scripts/_native-prices-fixtures.cjs`) and painted with this tree's
    production build CSS (`.next/static/chunks/*.css`).
  - They are shot at 390 and 1440 in **WebKit** (Playwright 2359, Safari's engine) and **Chromium** (1243).
  - The sticky nav is unstuck for the shots only.
  - The broken logo image in the nav is a fixture artefact (no server for `/` assets).
  - Recipe: `node scripts/native-prices-screens.cjs <before-snapshot>`, after a build.
- **File names:** `<engine>-<au|nz|ca|se>-<landing|features|compare>-<390|1440>.png`
  - landing: the whole pricing section;
  - /features: the top, down into the table;
  - /compare: the top, to the first question.
- **The PDF:** `<engine>-<cc>-pdf-794.png` is its HTML at A4 width, and `plans-nz.pdf` / `plans-se.pdf` are printed by
  Chromium.
- **Before:** `<engine>-before-nz-landing-<w>.png` shows the NZ pricing section before this change ("NZ$49", no line).
- **`measurements.json`:** what each engine measured.
  - The line's text, colour `rgb(95, 122, 153)` (`--ink-soft`), 13.6px and centred on landing and /features.
  - /compare: slate-500, 14px, left-aligned with its intro.
  - PDF: 8px, the small-print style.
  - The first prices.
  - `scrollWidth` equals the viewport in every shot, so there's no horizontal scroll at 390.

## 4 · Admin and /llms.txt keep the international form

- **/llms.txt** (all five countries switched on, as live):
  - "Australia (AUD) — Pay as you go: A$0 … Pro: A$39 …";
  - "New Zealand (NZD) — … NZ$49 … NZ$119";
  - the UK £, the US $, Ireland €.

  It's **byte-identical** to before (§5).
- **Admin › Plans,** rendered (the real page with the five countries' settings and the catalogue pre-loaded):
  - it shows **A$39 / A$99** and **NZ$49 / NZ$119** beside £29, €29 and the US "$";
  - a second render with the table on each country's own format, as it printed before, differs only by the A$ / NZ$
    prefixes.

  So GB, US and IE cells are identical.

## 5 · GB, US and IE byte-identical: proof

A snapshot script (scratchpad, `np/snap.cjs`) rendered, **before any code change** and again on the final tree:
- landing, /features and /compare (HTML and metadata) for GB, US, IE, AU, NZ, CA and SE;
- the plans PDF for all seven;
- /llms.txt for the five live countries;
- every money helper for all 14 currencies, in their home locale and in en-GB.

| Compared | Result |
|---|---|
| GB, US, IE: 9 pages (HTML + metadata), 3 PDFs | **byte-identical** |
| /llms.txt (GB, US, IE, AU, NZ) | **byte-identical** |
| AU, NZ, CA: 9 pages, 3 PDFs | identical once "A$"/"NZ$"/"CA$" → "$" and the one added line are taken out. **Nothing else changed** |
| SE: 3 pages, PDF | "SEK 29" → "29 kr", "SEK 4,000" → "4 000 kr", "SEK 1.80" → "1,80 kr", plus the line |
| Money helpers, every currency | everything a truck's money uses (`moneyFormatOf`, `formatAmount`, `formatMinor`, `smallFeeLabel`, `feeLabel`, `currencySymbol`, …) **identical** |
| Plan-price format | changed only for CAD, AUD, NZD, SEK, NOK, DKK (international → home) and RON (→ "lei") |

- **Billing:** GB and US Billing are compared byte for byte against stored baselines by language-phase-1d2 / -1e /
  -1e-tidy and plans-data-model in the full sweep, and they pass.
- AU/NZ Billing's plan table is rendered by `native-prices` §5 (home form, no line inside the table). The footnote line
  is checked in the page source: it renders once, and only for a shared-symbol currency.

## 6 · Checks

| Check | Result |
|---|---|
| `scripts/native-prices.cjs` (new, in `harnesses.json`) | **53/53**: AU/NZ/CA/SE pages in the home form with one line before the first price; GB/US/IE no line; PDFs; /llms.txt and rendered Admin international; Billing, the van label and plan prompts; truck money unchanged; `planLocale` gone; `intlMoneyFormatOf` used only by /llms.txt and Admin |
| `scripts/currency-registry.cjs` | **40/40**. New for all 14: the plural name, home and international symbols, the flag exactly as decided, a reason comment per entry, both forms pinned, the override only where needed, and the line exactly where the symbol is shared |
| Negative control (NZD's `symbolShared` flipped to false, then restored) | native-prices **9 failures**, currency-registry **5** |
| `scripts/anz-1.cjs` | **76/76** after the re-pin below |
| `tsc --noEmit` | passes |
| `next build` | passes (run twice, the second on the final tree) |
| Lint | **2,445 errors / 378 warnings before and after**. No file has more than before. The new scripts carry the same reasoned `no-require-imports` disable as earlier harnesses |
| Full sweep | **157 run · 157 passed · 0 failed** |

**Re-pinned, for this approved change only:**
- **`scripts/anz-1.cjs`:**
  - AU/NZ pages and /compare's suggestions expect "$39" / "$49" (were "A$39" / "NZ$49"), the bands "$3,900…", and the
    currency line;
  - the money check expects `planMoneyFormatOf` "$39" and `intlMoneyFormatOf` "A$39".
- **`scripts/currency-registry.cjs`:** its "plan price carries A$ / NZ$ / CA$ / SEK" check is replaced by the
  home / international pins above.

**Fixed, not re-pinned:** the first sweep after the change failed `messages-split`. It needs the catalogue import on a
bare line, and mine carried a trailing comment, so I moved the comment to the line above.

**Registered:**
- `native-prices.cjs` (swept);
- `_native-prices-fixtures.cjs` (shared module);
- `native-prices-screens.cjs` (`needs_a_browser`: needs a build and both engines; writes `docs/native-prices/`).

The runner still lists 12 older files in neither group, as before this work.

## 7 · Files

- `lib/currencies.ts`: the new fields, the 14 entries with reasons, and `planLocale` retired.
- `lib/money-format.ts`: the optional `currencyDisplay`.
- `lib/country-settings-types.ts`: `planMoneyFormatOf` (home), `intlMoneyFormatOf`, `currencyLineOf`.
- `messages/en-GB.json`: `pricing.currencyLine` (and the generated `messages/ns/en-GB/pricing.json`).
- `components/pricing/PricingSection.tsx`, `app/landing/landing.css`, `app/features/page.tsx`, `app/compare/page.tsx`,
  `app/compare/CostComparison.tsx`, `lib/plans-pdf.ts`, `app/manage/[token]/page.tsx` (Billing's line, comments),
  `components/pricing/PlanTable.tsx` (comment): the home form and the line.
- `lib/llms-text.ts`, `app/admin/page.tsx`: the international form.
- `scripts/native-prices.cjs`, `scripts/_native-prices-fixtures.cjs`, `scripts/native-prices-screens.cjs` (new);
  `scripts/currency-registry.cjs`, `scripts/anz-1.cjs`, `scripts/harnesses.json`.
- `docs/native-prices/`: 60 PNGs, 2 PDFs, `measurements.json`.

## Follow-up (22 October 2026): the currency line in `--hero-grey`

**Asked:** use `--hero-grey` for the currency line on landing and /features, so it passes AA. Nothing else changes.

- **Done:** `.hg-landing .price-currency` is now `color: var(--hero-grey)`, which is #3E5472.
  - **Contrast:** 7.73:1 on white and 7.25:1 on the pricing band's `--wash` (#F5F8FB). Both pass AA, and AAA too.
  - **Before:** `--ink-soft` measured 4.44:1 and 4.17:1.
- **One thing to know:** `--hero-grey` is declared only on `.hero`, and its note in `landing.css` says it must not
  become a shared `:root` token. A bare `var(--hero-grey)` on the pricing line would resolve to nothing.
  - So the line's rule declares the token for itself, at the hero's own value (`--hero-grey: #3E5472`). The hero is
    untouched.
  - `native-prices.cjs` reads both values and fails if they ever differ. Control: changing the line's copy to #3E5473
    fails 1 check, and the restored file passes.
- **Unchanged:**
  - /compare's line (its own `text-slate-500`; it wasn't in the ask);
  - the PDF and Billing lines (footnote style);
  - every other rule, page and string.
- **Checks:**
  - `native-prices` **53/53** (its CSS check re-pinned to `--hero-grey`);
  - the build passes;
  - lint is unchanged at 2,445 / 378;
  - full sweep **158 run · 158 passed · 0 failed**.
- **Screenshots:** re-shot from the new build, 60 PNGs in `docs/native-prices/` plus `measurements.json`. All 32
  landing and /features shots (AU, NZ, CA, SE × 390 / 1440 × WebKit / Chromium) measure the line at `rgb(62, 84, 114)`,
  which is #3E5472.

## Undo (only if Dominic asks)

There's no database change. Reverting the files above restores A$ / NZ$ on AU/NZ's own pages and the bare "$" in
Admin. The re-pins in §6 would need reverting with them.
