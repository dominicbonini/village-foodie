# country-picker-1 — report

**23 October 2026.** Written for Dominic. Nothing was committed, pushed or deployed. No database change, and no SQL was
run in this workstream: not even read-only, because nothing needed it.

## 1 · Summary

- **The footer's country picker is now a small "flag GB ▾" trigger**, inline as the last item of the footer link row, in
  the links' muted colour and a touch smaller. On a phone it sits on its own centred line under the 3 + 3 links, 44px
  tall.
- **It opens one box:** a modal dialog centred over a dimmed page.
  - It is titled « Choose your country », with the subline « Prices, language and settings change to match. », both in
    every language.
  - It lists every switched-on country as flag + **its own-language name** + its muted code, the current one highlighted
    with a tick, **sorted by the English name**.
  - Three columns on a laptop (all 36 visible at 1512×945, no scrolling); two on a phone, where the box scrolls inside
    itself and the page behind never moves.
  - It closes with ×, Escape or a click outside. Focus goes into the box and comes back to the trigger.
- **Choosing a country is unchanged:** the same `hg_country` cookie, then the same router call to the same address
  (/uk/features → /de/features). Routing is untouched.
- **SEO:** every country is a real `<a href="/<cc>">` in the server HTML while the box is closed (hidden by CSS). hreflang,
  the sitemap and llms.txt are byte-identical.
- **The old dropdown and its row are gone.** There is no picker anywhere else (it was footer-only already).

## 2 · What changed

| File | Change |
|---|---|
| `components/landing/CountryMenu.tsx` | Rewritten. The trigger is a flag image, the code and a chevron, `aria-haspopup="dialog"`, labelled `landingNav.country.button` with the country's own-language name ("Country: United Kingdom. Change country", „Land: Deutschland. Land ändern“). The box is always rendered, closed by `.cc-dlg-closed`. It has `role="dialog"`, `aria-modal`, `aria-labelledby` its `<h2>`, focus on open, a Tab trap, Escape, ×, outside click, and the page scroll locked while open. The list is sorted by English name; each link has `lang` = the row's locale and `aria-current` on the current country. `choose()` (cookie + router) is unchanged, line for line. |
| `components/landing/LandingFooter.tsx` | `<CountryMenu>` moved from under the store badges to the last item of `.foot-links`. |
| `lib/visitor-country.ts`, `lib/visitor-country-types.ts` | Each option gains `ownName` (Intl.DisplayNames in the row's own locale, computed **on the server** so the browser's ICU never re-words a server-rendered link) and `lang` (the row's locale). `name` stays English, and the list is sorted by it. |
| `app/landing/landing.css` | The old `.cc-menu*` rules are replaced by the trigger, `.cc-dlg` (fixed, dimmed), `.cc-box` (max-height = the window, scrolls inside), `.cc-list` (3 columns; 2 at ≤720px) and the item rules. The item rules are scoped `.cc-box a.cc-item`: the box sits inside `.foot-links`, whose link colour, size and white hover would otherwise reach it. |
| `messages/*.json` (en-GB + 22 bases), `messages/ns/*/landingNav.json`, `docs/i18n/back/*.json` (22) | **Two new keys:** `landingNav.country.title` and `landingNav.country.subline`. The regional variants inherit them. |

**The × is labelled with the existing `demoUpload.close`** ("Close" / „Schließen“ / «Κλείσιμο»), the landing's own modal's
close. That keeps the new keys at exactly two.

### The two keys, per language

| Locale | title | subline |
|---|---|---|
| en-GB | Choose your country | Prices, language and settings change to match. |
| fr-FR | Choisissez votre pays | Les prix, la langue et les réglages s’adaptent à votre choix. |
| de-DE | Wählen Sie Ihr Land | Preise, Sprache und Einstellungen passen sich entsprechend an. |
| es-ES | Elige tu país | Los precios, el idioma y la configuración se adaptan a tu elección. |
| it-IT | Scegli il tuo paese | Prezzi, lingua e impostazioni si adattano di conseguenza. |
| pt-PT | Escolha o seu país | Os preços, o idioma e as definições ajustam-se em conformidade. |
| nl-NL | Kies je land | Prijzen, taal en instellingen passen zich daarop aan. |
| sv-SE | Välj ditt land | Priser, språk och inställningar anpassas efter det. |
| da-DK | Vælg dit land | Priser, sprog og indstillinger tilpasses derefter. |
| nb-NO | Velg ditt land | Priser, språk og innstillinger tilpasses deretter. |
| pl-PL | Wybierz swój kraj | Ceny, język i ustawienia dopasują się do wyboru. |
| cs-CZ | Vyberte svou zemi | Ceny, jazyk a nastavení se podle toho přizpůsobí. |
| sk-SK | Vyberte si svoju krajinu | Ceny, jazyk a nastavenia sa tomu prispôsobia. |
| hu-HU | Válassza ki az országát | Az árak, a nyelv és a beállítások ehhez igazodnak. |
| ro-RO | Alegeți țara | Prețurile, limba și setările se vor adapta în consecință. |
| hr-HR | Odaberite svoju zemlju | Cijene, jezik i postavke prilagodit će se tome. |
| sl-SI | Izberite svojo državo | Cene, jezik in nastavitve se bodo ustrezno prilagodili. |
| fi-FI | Valitse maasi | Hinnat, kieli ja asetukset mukautuvat valintasi mukaan. |
| et-EE | Vali oma riik | Hinnad, keel ja seaded kohanduvad vastavalt. |
| lv-LV | Izvēlieties savu valsti | Cenas, valoda un iestatījumi tiks attiecīgi pielāgoti. |
| lt-LT | Pasirinkite savo šalį | Kainos, kalba ir nustatymai bus atitinkamai pritaikyti. |
| el-GR | Επιλέξτε τη χώρα σας | Οι τιμές, η γλώσσα και οι ρυθμίσεις προσαρμόζονται ανάλογα. |
| bg-BG | Изберете Вашата държава | Цените, езикът и настройките се променят съответно. |

Each language's voice follows its STYLE (Sie / tú / formal …; Вие capitalised in Bulgarian), and back-translations are in
`docs/i18n/back/`.

**Lean checks:** translation-check is at **0 structural for all 22 bases and the 6 regional variants**. The en-GB
self-check shows 3 ICU items, which are en-GB's own plurals checked against itself; this work doesn't touch them.

## 3 · Decisions to know

1. **The flag is the existing small SVG image, not an emoji** (the mockup's "🇬🇧").
   - The component's standing rule is "flags are small images, never emoji": emoji flags show as two letters on Windows.
   - The trigger therefore reads [flag] GB ▾ exactly as the mockup lays it out.
2. **Own-language names come from Intl, in each row's locale, on the server.** For example: United Kingdom, Deutschland,
   Österreich, Schweiz, België, España, Ελλάδα, Κύπρος, България, Polska, Magyarország, Luxembourg.
3. **On opening, focus goes to the box itself** rather than to the ticked country.
   - On a phone the ticked country (United Kingdom) is near the end of the list, so focusing it scrolled the title out
     of view.
   - Tab then reaches × and every country, and Tab stays inside the box.
4. **The trigger's label uses the current country's own-language name** ("Land: Deutschland. Land ändern" on /de). Before,
   the English row name was dropped into the page's language.
5. **Phone layout:**
   - the trigger takes its own centred line under the 3 + 3 link grid, since the link row is a three-column grid there;
   - long names wrap rather than being cut ("United Kingdom" over two lines);
   - the empty tick slot and the codes are hidden.

## 4 · Proof

**Screenshots** (`docs/country-picker-1/`, WebKit, real built CSS and fonts; the 36 fixture countries = the live 35 + France
switched on):

| File | What |
|---|---|
| `footer-1512.png`, `footer-390.png` | the footer, closed: the trigger at the end of the link row (laptop) and centred under the links (phone) |
| `box-1512.png`, `box-390.png` | the box open on /uk: three columns, all 36, United Kingdom ticked; on the phone two columns with the title in view |
| `box-390-scrolled.png` | the phone box scrolled to its end inside itself |
| `box-de-1512.png`, `box-gr-1512.png` | /de and /gr: « Wählen Sie Ihr Land » / « Επιλέξτε τη χώρα σας », own-language names, DE / GR ticked |

The page's wordmark and store badges show as placeholder boxes in these shots. That is the render kit's image stub, not
the page.

**`scripts/country-picker-1-screens.cjs`** (WebKit, by hand): **17/17**.
- The browser picker's 36 links equal the server-rendered ones.
- The trigger sits on the links' line, after the last link, in their colour and smaller.
- **Keyboard:**
  - Option+Tab (Safari's link and button Tab) from the last footer link reaches the trigger;
  - Enter opens it, with focus inside;
  - Tab stays inside;
  - Escape closes it, and focus returns.
  - The same walk with a **plain Tab in Chromium** passes too. WebKit, like Safari, Tabs only between form fields by
    default.
- At 1512×945: 36 items, 3 columns, all inside the window, the box not scrolling, and the page locked.
- × closes it (focus back); a click outside closes it; a click inside doesn't.
- **Choosing Deutschland:** the box closes, `hg_country=DE` is set and the router goes to `/de`.
- **At 390:** the trigger is 44px tall, centred and below the links, with no sideways scroll. The box shows two columns
  with codes hidden, scrolls inside itself, and the page stays put while it scrolls. A tap outside closes it.

**`scripts/country-picker-1.cjs`** (swept): **45/45**.
- On /uk landing, features and compare, /de, /gr and /us/features:
  - one trigger as the link row's last item, with flag, code and chevron;
  - no `role="menu"`, `menuitemradio` or `.cc-menu` anywhere, and nothing in the nav;
  - the closed dialog in the HTML (`cc-dlg cc-dlg-closed`, role dialog, aria-modal, labelled by its h2, the trigger's
    aria-controls pointing at it);
  - **exactly the 36 switched-on countries as `<a href="/<cc>">`**, in English-name order, own-language names with
    `lang`, and only the page's country current.
- France switched off → 35 links, no /fr.
- The labels: "Country: United Kingdom. Change country", „Land: Deutschland. Land ändern“, «Χώρα: Ελλάδα. Αλλαγή χώρας».
- The German and Greek title, subline and ×.
- The two keys in en-GB and all 22 bases, with back-translations; 0 structural in 28 locales.
- The CSS rules, and the old rules gone.
- hreflang: 36 + x-default. The sitemap: every country's landing and features page.

### Byte-identity (before = HEAD `0a70ec7e`, after = this work; scratch captures, every one rendered from the repo)

| Capture | Identical | Differs ONLY by the picker block |
|---|---|---|
| Phase captures (every manage / dashboard / order surface, 19,894 leaf values) | 19,882 | the 12 marketing page HTMLs in phase 1e (landing / features / compare × GB, US, usOn, cookieUS) |
| Marketing (GB/US/IE/AU/NZ/CA/FR pages, PDFs, sitemap, llms) | 16 / 39 | 23 |
| Europe (europe-settings fixtures) | 13 / 49 | 36 |
| Every European country on (landing, features, compare, PDF ×29; sitemap; llms) | 31 / 118 | 87 |

"Differs only by the picker block" was checked like this:
- BEFORE holds exactly the old `<div class="cc cc-foot">` (button + closed menu) and AFTER exactly the new
  `<span class="cc cc-foot">` (trigger + closed dialog);
- with each block cut whole, the rest of the artefact is **byte-identical**;
- no artefact differs in any other way;
- every PDF, the sitemaps and llms.txt are identical.

**Messages:** 46 files changed:
- en-GB and the 22 bases, plus their `ns/<locale>/landingNav.json`;
- each gains only `landingNav.country.title` and `.subline`;
- no catalog module changed, and no other key.

### Re-pins (all for this approved change only)

All share one module, `scripts/_lp-country-picker.cjs`. It finds and cuts the old or new picker block whole (verified:
exactly one, inside `<footer>`), checks the new block is the link row's last item, and compares the two blocks' country
links.

| Harness | Why | Re-pin |
|---|---|---|
| `language-phase-1e.cjs` (via `_lp1e-named.cjs`) | the 12 marketing HTML views | the shared normalisation, applied to both sides, now also cuts the picker block (PICKER-footer), alongside React's `<!-- -->` separators. The new block itself is proved by country-picker-1 |
| `language-phase-1e-tidy.cjs` | its 12 marketing HTML views (Stage B's structural proof runs on the raw page) | `pickerPair`: the same verification as language-phase-0, then both blocks cut before Stage B's proof |
| `language-phase-0.cjs` | the landing HTML (GB, US) | `pickerBack`: verified (old in BEFORE, new in AFTER, AFTER's in the link row, same countries, same current), then both cut |
| `plans-data-model.cjs` | SEO-menu verified the old `<ul role="menu">` | with the picker landed, both blocks are verified and cut instead (no menu `<ul>` is left to verify) |
| `seo-fixes.cjs` | the crawlable options and the closed-menu class | the options are the box's `<a href class="cc-item">` (same /uk, /us and /us/features hrefs); closed = `cc-dlg-closed` + its display:none rule |
| `about-page.cjs` | "the footer menu shows United Kingdom" | reads the trigger's code and label: "United Kingdom (GB)", "United States (US)", "Ireland (IE)" |
| `marketing-country-parity.cjs` | the real menu's markup | found whole and stubbed out as before; the trigger shows the code and is the link row's last item; `aria-haspopup="dialog"`; the closed dialog's id = aria-controls, one `/uk` link, current, in en-GB, with code and tick; the US page shows "US" with its "Country: United States" label |

Every other check in these harnesses is unchanged. They pass:
- language-phase-1e 1024/1024;
- language-phase-1e-tidy 61/61;
- language-phase-0 163/163;
- plans-data-model 151/151;
- seo-fixes 86/86;
- about-page 58/58;
- marketing-country-parity 145/145.

`scripts/_real-fonts.cjs` gained an optional `script` (served as /view.js after the view), so the screens harness can bring
the picker to life. Without it, the opener is unchanged.

**Registered:**
- `country-picker-1.cjs` in the sweep;
- `country-picker-1-screens.cjs` under needs_a_browser;
- `_country-picker-1-fixtures.cjs` and `_lp-country-picker.cjs` under shared_modules.

### tsc, build, lint, sweep

- **tsc** `--noEmit`: 0 errors.
- **Build** (`next build`): OK, rebuilt after the last CSS change.
- **Lint:** 2,445 errors / 378 warnings, **identical to the baseline**.
  - One run showed 2,446. The extra one was a `require` in `_lp1e-named.cjs` missing the file's usual
    `eslint-disable-next-line`; it is added.
- **SWEEP STATUS** (`node scripts/run-harnesses.cjs`, 167 harnesses): **165 passed · 2 failed**. Both failures are load
  and timing, and both pass alone:
  - `language-phase-0.cjs` hit a Playwright `TimeoutError` after 742 s in the sweep. Alone it passes 163/163 in a few
    seconds.
  - `add-order-refresh-inputs.cjs` took 2,836 s in the sweep. Alone it passes in 220 s.
  - Every harness this work touched passed in the sweep: country-picker-1 45/45, language-phase-1e, language-phase-1e-tidy
    61/61, plans-data-model, seo-fixes, about-page and marketing-country-parity.
- An earlier sweep failed two of them, and both were fixed:
  - `country-picker-1.cjs`: my regex predated the box's `tabindex="-1"`.
  - `language-phase-1e-tidy.cjs`: it runs Stage B's proof on the raw page, so it now gets the same picker cut. That is a
    re-pin, listed below.

## 5 · Flags

1. **`scripts/signup-landing-screenshots.cjs`** (Chromium, by hand, not swept) opened the old dropdown and requires
   `.cc-menu` in the CSS, so it is now stale for its footer-menu photo. Its footer check is superseded by
   `country-picker-1-screens.cjs`; it was not edited.
2. **Live it will list 35 countries** until France is switched on (admin-countries-1). The proof uses 36 because that
   number is the requirement ("today's 36").
3. **Other sessions' untracked harnesses** (`_midnight-*`, `allergen-card-country-screens.cjs`, `pricing-check-*`) are
   listed by the sweep as unregistered. They are not mine, so they were not registered.

## 6 · Read-only SQL

None was run in this workstream.
