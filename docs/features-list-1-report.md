# features-list-1: three new rows on /features; "Advanced reporting" removed

*4 November 2026.*

- **Committed on `main`:** code and words in `7dba813c`, this report in the next commit. Not pushed, not deployed.
- **No migration and no database change.** No landing-page change: /uk, /us, /de and /jp are byte-identical to the commit before.

| # | Item | Outcome |
|---|---|---|
| 1 | Remove "Advanced reporting" | **Done.** The row and its two message keys are gone from en-GB and every language. The `advanced_reporting` plan feature itself is unchanged (lib/features.ts, plans, Admin). |
| 2 | Three new rows, ticked on every public plan | **Done.** "Documents and reminders" follows the `paperwork` plan switch. "Profit per event" and "Reports for your accountant" have no switch, so they are always ticked. |
| 3 | Where they go | **After "Buzzer tracking" in "Running your service".** The two "Coming soon" rows (Tap to pay, Customer display) stay at the bottom of that group, and every other group still ends with its "Coming soon" rows (§1). |
| 4 | Translations | **en-GB and all 28 bases.** Variants only where the wording differs: en-US (2) and es-MX (3) (§2). translation-check: **structural 0 in all 28** (§3). |
| 5 | MARKETING_COPY_UPDATED | **2026-11-04** (35.aj-8). It is read only by the sitemap, so the only effect is each live country's landing and /features `lastmod`. |
| 6 | Checks | **New harness `scripts/features-list-1.cjs`: 16/0.** The identity check against the commit before is 7/7. Ten older harnesses were re-pinned for the planned changes (§4). Full sweep: no failure caused by this change (§5). |

> ⚠️ **/features now claims two features that are still being built.**
> - "Profit per event" and "Reports for your accountant" describe the costs-accounts-1 work, which another session has in progress and has not committed yet.
> - Until that ships, /features, Manage › Billing and the plans PDF promise them as included on every plan.
> - Deploy this commit with or after costs-accounts-1, not before.

## 1 · Where the rows went, and why

"Running your service" now reads:

… · Automated stock countdown · Buzzer tracking · **Documents and reminders** · **Profit per event** · **Reports for your accountant** · Tap to pay *(Coming soon)* · Customer display *(Coming soon)*

**Why this spot:**
- All three are tools for running the business, so they belong in "Running your service". The other groups are about online orders and marketing.
- Placing them after the last built hatch-side row keeps the order "what you use at the hatch, then the back office".
- The two "Coming soon" rows stay last, as you asked.
- "Advanced reporting" was itself a "Coming soon" row in that group. With it gone, the group has two "Coming soon" rows instead of three.

**`lib/feature-table.ts`:**
- `{ id: 'documents_reminders', group: 'run', feature: 'paperwork' }`
- `{ id: 'profit_per_event', group: 'run' }`
- `{ id: 'accountant_reports', group: 'run' }`
- The table goes from 32 rows to 34.

**Where the table shows.** It is one table, so the change reaches every place that renders it:
- /features (every country);
- Manage › Billing (the same `PlanTable`);
- the plans PDF (`/landing/features-pdf`);
- the outreach attachment PDF (`lib/plans-pdf.ts`).

"Documents and reminders" shows ✓ on every plan only while each public plan has `paperwork` switched on. Switching it off for a plan in Admin shows "—" there, like every other switched row.

## 2 · The words

**English (en-GB):**
- **Documents and reminders:** "Save your certificates in one place, such as food hygiene, insurance and gas safety. We remind you before anything expires, and you can send them to an event or market organiser in one tap."
- **Profit per event:** "Add what each dish costs you and see what you actually made at every event, not just your takings."
- **Reports for your accountant:** "Sales, tax and refunds for any month, quarter or tax year, ready to download for your accountant."

**Variants (everywhere else inherits from its base):**
- **en-US:**
  - Documents: "…event or market **organizer** in one tap."
  - Profit per event: "…not just your **sales**." language-phase-1e flagged "takings" on US /features as a UK-only word, so this one was added during the checks.
- **es-MX:**
  - "Reportes para tu **contador**" (es-ES: "Informes para tu gestor").
  - Its description ("contador").
  - Documents: "antes de que algo **venza**".

**Back-translations:** in `docs/i18n/back/` for the 28 bases and es-MX. The two `advanced_reporting` keys are removed everywhere.

## 3 · translation-check (28 bases)

- **Structural: 0 in every base:** nothing missing, nothing extra, no ICU errors.
- **Flags on the new keys are expected:**
  - **Meaning-overlap drift on "Profit per event" (19–45%).** "Takings" back-translates as "revenue" or "turnover", and the check counts shared words.
  - **Accountant drift.** "Reports for your accountant" comes back as "bookkeeper" or "tax adviser", which is the correct local term.
  - **False "English word" hits:**
    - sv "redo" ("ready");
    - sk "hygiene" (a Slovak case form);
    - ro "profit" (a Romanian word);
    - da/nb "marked" ("market").
  - **lt "Pelnas iš kiekvieno renginio" is 1.75× the English length.** That is fine in a table cell that wraps.

## 4 · Checks

**`scripts/features-list-1.cjs`: 16 passed, 0 failed.** It is in the sweep. It checks:
- the order, the "Coming soon" rows last in every group, the feature switches and 34 rows;
- the words in en-GB and all 28 bases;
- that /uk/features and /de/features render the three rows ticked on every plan with their descriptions, and no Advanced reporting row (in German, "Erweiterte Auswertungen" was looked up from the commit before);
- the copy date.

**Identity with the commit before (`capture` in a HEAD worktree, then `compare` here): 7/7 byte-identical to `56250fcd`:**
- landing /uk, /us, /de and /jp;
- /features for /uk, /us and /de, with only the changed rows cut out. Every other byte of the page is unchanged.

**Re-pinned for the planned changes:**
- **`pricing-pages.cjs`:** 32 → 34 rows in three places, including the PDF's row count (145/0).
- **New module `scripts/_lp-features-list-1.cjs`:** the sitemap `lastmod` moves to 2026-11-04. It is precise: it throws if no entry moves. It is wired in after copy-truth-1's item in:
  - `plans-data-model.cjs` (153/0);
  - `language-phase-1e-tidy.cjs` (61/0);
  - `_lp1e-named.cjs` (language-phase-1e 1022/0).
- **`copy-truth-1.cjs` (57/0):**
  - its GB and US /features HEAD pins are dropped, because the table changed on purpose and the identity check above covers the rest of the page;
  - it now checks the new rows are in and Advanced reporting is out;
  - its copy-date check accepts 2026-11-04.
- **`_messages-parity-1e.cjs`:** the six new keys are registered as new wording.
- **Found by the full sweep (§5), re-pinned the same way:**
  - **`plan-feature-order.cjs` (34/0):** its pinned list of every row by name now has the three rows after Buzzer tracking, no Advanced reporting, and 34 rows.
  - **`paperwork-1.cjs` (114/0):** its "no Documents row in the public table" check now allows exactly this one `paperwork` row. It still checks that no card bullet and no landing page mentions Documents.
  - **`faq-4.cjs` (80/0):** /uk and /de/features are still compared with its a97c2a58 pin.
    - First, `featuresRowsBack` (in `_lp-features-list-1.cjs`) puts the old "Advanced reporting" row back in place of the three new ones. It is precise: it throws unless the three rows are there, in order, followed by a "Coming soon" row.
    - The match proves that every other byte of the page is unchanged.
  - **`contact-1.cjs` (191/0):** the truck page bundles the `planFeatures` message files. Each must now match its pinned commit apart from these rows (`nsSameApartFromRows`).
- **Lint:** no new errors in any changed file.

## 5 · Full sweep

`node scripts/run-harnesses.cjs` (192 harnesses) on the shared working tree, which also holds costs-accounts-1's uncommitted work:

- **Six failed on the first run.**
- **Four were this change, each a pin on the old table:** plan-feature-order, paperwork-1, faq-4 and contact-1. All four are re-pinned (§4) and now pass.
- **Two are costs-accounts-1's uncommitted work:**
  - **messages-parity:** its new manageMenu / manageReports keys are not registered yet.
  - **language-phase-1d2:** the Manage shell and Reports-tab views.
- **Proof:** in a clean worktree of HEAD plus exactly what was committed, both pass: language-phase-1d2 645/0 and messages-parity 567,247/0. That session has been told; the fix is theirs to commit.

## Files

- `lib/feature-table.ts`, `lib/marketing-meta.ts`
- `messages/en-GB.json`, the 28 base files, `messages/en-US.json` and `messages/es-MX.json` (only the planFeatures and featuresPage keys above), and the regenerated `messages/ns/*/featuresPage.json` and `planFeatures.json`
- `docs/i18n/back/*.json` (the 28 bases and es-MX)
- `scripts/features-list-1.cjs` and `scripts/_lp-features-list-1.cjs` (new), `scripts/harnesses.json`, `scripts/pricing-pages.cjs`, `scripts/copy-truth-1.cjs`, `scripts/plans-data-model.cjs`, `scripts/language-phase-1e-tidy.cjs`, `scripts/_lp1e-named.cjs`, `scripts/_messages-parity-1e.cjs`, `scripts/plan-feature-order.cjs`, `scripts/paperwork-1.cjs`, `scripts/faq-4.cjs`, `scripts/contact-1.cjs`

**Shared files.** costs-accounts-1 (another session) has uncommitted edits in the same messages, back-translation and harnesses.json files. Only this workstream's lines were staged and committed; theirs are untouched in the working tree. That session was told the commit SHA.
