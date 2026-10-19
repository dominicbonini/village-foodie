# US layout audit — shared brief for every surface group (16 October 2026)

**Purpose.** Find every screen where US formatting wraps, truncates, overflows, clips, misaligns or grows a fixed-height element, compared with the same screen in GB:
- 12-hour times ("12:45 PM");
- ranges ("11:30 AM – 10:45 PM");
- US dates ("Wednesday, September 30");
- sales-tax, tip and service-fee lines on totals.

This is a **diagnosis for mockups. Change NO product code.**

## Hard rules
- **Product code stays byte-identical.** At the end, `git diff --stat -- app components lib hooks messages proxy.ts next.config.ts public supabase` must be empty.
- **Scripts:** write yours under `scripts/us-layout-audit/<group>/`. They are not in the harness sweep; don't add them to `scripts/harnesses.json`.
- **Screenshots:** put them under `docs/us-layout-audit/<group>/`.
- **Fixtures only.** The fixture truck is **Pizza Kitchen** (id `test-truck`, slug `test-kitchen`).
  - **Never** render, test or name Pizzeria Gusto.
  - Nothing reaches a database or the network. The render kit (`scripts/_render-kit.cjs`) stubs Supabase; answer any fetch from fixtures.
  - The US stays switched off in the database. No SQL at all.
- **Builds and servers:**
  - Don't run `next build`. The existing `.next/` matches the committed code, and the other groups share it.
  - Don't start a dev server.
  - A throwaway static server on 127.0.0.1 (e.g. `scripts/screenshots/common.cjs` `serve`) is fine. Close it, and stop anything you start by its own PID. Never kill by name or pattern.
- Never print, cat, grep or sed any `.env*` file or secret. Send no emails. Never touch `outreach_templates`.
- **Keep the PNGs small.** Crop to the relevant region where you can, and use `deviceScaleFactor` 1, or 2 only for small crops. Keep the group's total under ~40 MB.
- **Contact sheets:** each must be under 4 MB. Make them with `sharp` (already in node_modules).

## Methods already in the repo (reuse them; don't copy logic)
- **State-patched static render** of a real page or component, painted in WebKit with the compiled app CSS:
  - `scripts/screenshots/order-us.cjs`, `dash-us.cjs` and `kds-us.cjs`, with `common.cjs` (`appCss`, `fontClasses`, `serve`);
  - `scripts/_render-kit.cjs`: `bundle` with `patches: [{ file, states: [...] }]`, which makes those `useState`s start from `globalThis.__ms`; `setNow`, `setDeviceTz`, `setDeviceLocale`, `renderStatic`.
- **Browser-bundled real components with fetch answered by Playwright:** `scripts/phase3-screens-shots.cjs` (the order sheet with tips, US fixtures), `scripts/pending-card-render.cjs` (Manage › Schedule pending card, measured at several widths), `scripts/event-types-render.cjs`, `scripts/social-posts-render.cjs`, `scripts/countries-screenshots.cjs`.
- **Fixtures:** `scripts/_lp1b-fixtures.cjs`, `scripts/_lp1e-fixtures.cjs`, `scripts/_lp1d2-*.cjs`, `scripts/_fake-pg.cjs`, `scripts/_country-settings-gb.cjs` (GB/US country rows from the seed).
- **Formatting:** `lib/time-format*`, `lib/money-format.ts`, `lib/order-charge-lines.ts`, `lib/order-charges.ts`, `lib/charge-settings.ts`, `lib/truck-time*`.

## The two fixtures (the same truck, the same moment)
- **GB:** Pizza Kitchen, GBP, en-GB, Europe/London, 24-hour clock, dmy dates. Prices include VAT (no tax line), tips off. The service fee is whatever GB allows by default (check `country_settings` seed: `serviceFeeAllowed`); off if not allowed.
- **US:** the same truck and menu, USD, en-US, America/New_York, 12-hour clock, mdy dates, week starts Sunday.
  - **Sales tax 8.875%, exclusive** (prices exclude tax, so a tax line shows).
  - **Tips on** (a tip chosen, e.g. 20%).
  - **Online service fee on** (e.g. 3% + $0.30, within the US caps in the seed).
  - The card fee line wherever the product shows one.
- **The moment:** **Wednesday 30 September 2026, 11:50 local time** in each zone (GB 10:50 UTC, US 15:50 UTC). Use `kit.setNow` and `setDeviceTz` / `setDeviceLocale`.

## Worst-case values (use the longest realistic, in both countries)
- **Pickup slot:** 12:45 (GB) / 12:45 PM (US).
- **Service window:** 11:30–22:45 (GB) / 11:30 AM – 10:45 PM (US).
- **An event spanning midnight**, e.g. 20:00–00:30 (8:00 PM – 12:30 AM).
- **Longest weekday + month:** "Wednesday 30 September" / "Wednesday, September 30" (the fixture date).
- **A 4-digit order total**, e.g. 1,234.56 in either currency (a catering-sized basket).
- **Order numbers at their longest:** find the real format and its maximum in the code.
- **A basket of 6 items with modifiers**, including at least one long modifier list and special instructions.
- **US totals** show subtotal, sales tax, tip and online service fee (and card fee where shown). GB shows its own lines.

## What to record for each issue (JSON, see below)
For each issue:
- surface, size, and the GB and US screenshot paths;
- what happens: `wrap`, `truncate` (ellipsis), `overflow`, `clipped`, `misaligned` or `grows` (a fixed-height element grows);
- the **measured** overflow in px or characters, measured in the browser (e.g. `scrollWidth - clientWidth`, line count from height / line-height, element height GB vs US);
- how often a truck would see it;
- severity:
  - **BROKEN:** unreadable, hidden or overlapping;
  - **UGLY:** wraps or misaligns but readable;
  - **FINE:** not an issue; list it under `fine`.
- a one-line fix direction, with NO code: e.g. drop ":00", drop the space before PM, a smaller time font, a wider column, a two-line slot button.

Also list every surface and size **checked and found FINE**, so nothing is missed.

## Output (each group)
1. **Screenshots** in `docs/us-layout-audit/<group>/`, named `<surface>-<size>-gb.png` and `<surface>-<size>-us.png`. Use pairs at the same size and crop.
2. **`scripts/us-layout-audit/<group>/findings.json`:**
   ```json
   { "group": "A-customer",
     "issues": [ { "id": "A-01", "surface": "Order page › slot picker", "size": 360, "what": "wrap",
                   "detail": "12:45 PM wraps inside the slot button; the button grows 20→40 px tall",
                   "measured": "+20 px height; label 76 px in a 64 px box", "frequency": "every US order with times",
                   "severity": "UGLY", "fix": "drop the space before PM, or a two-line slot button",
                   "gb": "docs/us-layout-audit/A-customer/order-slots-360-gb.png", "us": "docs/us-layout-audit/A-customer/order-slots-360-us.png" } ],
     "fine": [ { "surface": "Order page › menu header", "sizes": [360, 390, 768], "note": "event time range fits on one line" } ],
     "notChecked": [ { "surface": "…", "why": "…" } ],
     "method": "one paragraph: what was rendered, how, and with which fixtures" }
   ```
3. **Contact sheets** in your allotted range, named `docs/us-layout-audit/sheet-NN-<surface>.png`:
   - one per surface (or a group of related shots);
   - GB on the left, US on the right, at the same scale;
   - each issue boxed or arrowed and labelled with its id (e.g. "A-03");
   - a header line naming the surface and size;
   - each under 4 MB.
4. **Clean up** temp files, and the `node_modules/.cache/<your cache tags>` bundles your scripts created.
5. **Report back concisely:**
   - the number of issues by severity;
   - the sheet filenames;
   - anything not checked, and why;
   - confirmation that `git diff --stat` on the product paths above is empty.
