# france-privacy-1 — account deletion also clears customers' notes; one privacy policy for every country

24 November 2026. Branch `france-vat-1`. Starting commit (START): `ec16f022`. **Committed locally; not pushed, not deployed.**

| Part | Status |
|---|---|
| **Part 1 · Account deletion clears notes** | **DONE.** Proven in memory only; account deletion was never run against the live database. |
| **Part 2 · One simple privacy policy** | **DONE.** English changes A–H are exactly as approved. Translated into all 54 language bases that enabled countries use, with back-translations. The 5 unused bases are untouched. |

- **No database change**, and nothing was written to the database. The only SQL run was read-only SELECTs (§9).
- No `.env` file was opened. The landing page and outreach templates are untouched.
- Only my own files are committed. The other sessions' compare-fix-2 / compare-research work, which is in the same folder and on the branch, is untouched and unstaged.

---

## 0 · Prompt check

- **Garbled spans:** none.
- **Contradictions:** none.
- **Interpretations (say if you want any changed):**
  1. **`lib/legal.ts`:**
     - `PRIVACY_UPDATED` and `COUNTRY_TERMS_UPDATED` → "24 November 2026".
     - `TERMS_VERSION` → `2026-11-24`.
     - The repo's rule says to change BOTH the document's date line and these mirrors, and that `TERMS_VERSION` names the latest of the three documents. It is only written at signup, so nobody is asked to re-accept anything.
     - The sitemap's lastmod for `/privacy` and `/country-terms` moves to 24 November with them.
  2. **The "unchanged sentences stay byte-identical" rule** (my translators' rule, not yours) was relaxed in **8 locales**: ja-JP, ko-KR, zh-HK, zh-TW, id-ID, ar-AE, pl-PL and sl-SI.
     - In those, the country-terms intro's "If it says something different from them…" sentence had been translated naming the Privacy Policy, or as "both of them" / "those documents" (Arabic used a dual pronoun).
     - Keeping it would have kept the old meaning, so it now refers to the Terms alone, following the English.
     - Everywhere else, every unchanged sentence is byte for byte.
  3. **Card drafts:** account deletion now clears their notes, as asked. Their customer name, email and phone are still not cleared, the same as at START (§2, last row). The prompt scoped drafts to notes, so I listed this and did not change it.

---

## 1 · Part 1 — what changed

- **`lib/order-retention.ts`:**
  - New export `notesPatch(row)`: the notes half of retention's patch.
    - `notes` → null.
    - With `line_notes`: blanked with `blankLineNotes`, and items and deals are never written.
    - Without `line_notes`: each item's `specialInstructions` → `''` and each deal's `slotNotes` → `{}`. This is the same `scrubItems` / `scrubDeals` code as before.
  - `retentionPatch` now calls it. Its output is byte-identical to START's, with the keys in the same order; the harness proves this.
- **`lib/account-deletion.ts`:**
  - New step **2b**, after the name/email/phone step. For every truck of the account, it pages through **every order and every card draft** (500 rows a page), applies `notesPatch`, and writes only rows that still hold note text.
  - The patch is imported, not copied.
  - The result gains `notesCleared: { orders, drafts }`. The admin execute route spreads the result, so its JSON answer gains that field. That route is admin-only.
  - Everything else is as before:
    - totals, items, deals and order_payments are kept;
    - nothing is deleted;
    - `deleteTruckCascade` is never called;
    - it is still not transactional, still throws a named step (`clear_notes:<table>:<id>`), and is still safe to re-run.
  - The header comment is updated.
- **Nothing customer-facing changed in Part 1.** No page, email or API code was touched.

## 2 · Every place a customer's free-text or allergy note is stored, and what account deletion does to it now

| Where | What it holds | Account deletion now |
|---|---|---|
| `orders.notes` | the order note | **cleared (null)**, new |
| `orders.line_notes` (new-style orders, since france-notes-1) | dish notes and slot notes | **blanked** with `blankLineNotes` (`''` / `{}`); items and deals not written. New |
| `orders.items[].specialInstructions`, `orders.deals[].slotNotes` (older orders, and every order the deployed code writes) | dish notes and slot notes | **blanked** (`''` / `{}`), exactly retention's old-style patch; every other field of the line is kept. New |
| `order_drafts.notes`, `.line_notes`, `.items`, `.deals` | the same notes on card drafts | **cleared the same way**, new. Live: 13 drafts, 2 with notes |
| `orders.customer_name / email / phone` | identity | `[deleted]`, null, null, as before |
| `action_audit_log.before_state / after_state` | order snapshots | **nothing to clear.** The snapshot is a whitelist with no notes (`lib/audit/order-audit.ts`). Live check: 1,789 rows, 0 with a dish note, slot note, order note or `line_notes`. Unchanged |
| `order_payments.note` | **our** system text ("Online card payment", "Card refund (pi_…)") and the operator's refund note | not a customer note; kept as the accounting record. Unchanged |
| `orders.cancellation_reason`, `rejection_reason` | the **truck's** words (or "Customer cancelled") | not a customer note. Unchanged |
| `orders.modify_data` | legacy column | unused by any code; live: 0 rows hold anything. Unchanged |
| `whatsapp_logs` (message_in, customer_number), `messages` (body) | WhatsApp messages customers send a truck, and our replies | **not cleared by account deletion.** They are deleted at 12 months by the retention job. Different data (correspondence, with its own line in the policy's §7), so listed and not changed. Live: 17 and 0 rows. ⚠️ **Decision for you:** whether account deletion should also delete a truck's `whatsapp_logs` / `messages` rows at once, rather than at 12 months |
| Stripe PaymentIntent metadata | order_key, truck_id, source only | no notes. Nothing to do |
| Push notifications | order number and truck name only | no notes |
| KDS / dashboard | reads `/api/dashboard`, with no store of its own | nothing stored |
| Ticket printing | device-local dedupe keys only (`hg_printed_keys_*`); no print_jobs table | nothing stored server-side |
| The native app's offline outbox (Capacitor Preferences on the operator's device) | walk-up orders typed offline, notes included; never deleted by design ("acknowledgement is not deletion") | **out of reach of a server-side deletion.** Listed, not changed |
| Emails we sent (Brevo delivery logs) | the confirmation email shows the notes | held by Brevo under its own retention (policy §7 already says so). Listed |
| Card drafts' customer name / email / phone | identity on an unpromoted draft | **not cleared**, as at START. Abandoned drafts are deleted within a day of expiry by `purge_order_drafts`, and promoted drafts already have them erased. Live: 0 unpromoted drafts. Listed, not changed (§0.3) |

## 3 · Part 2 — the English

- **`content/legal/privacy-policy.md`:** exactly A–E, checked by the harness against START with the prompt's strings:
  - **A.** The intro paragraph now reads "This policy applies wherever you are."; the link to the country terms is gone.
  - **B.** The "Allergy and dietary notes." paragraph is added before "Allergen information.".
  - **C.** The transfer sentence is changed.
  - **D.** Section 8 is replaced.
  - **E.** The date is 24 November 2026.
- **`content/legal/country-specific-terms.md`:**
  - **F.** All 16 "### Privacy, for everyone in …" parts are deleted. Every country's terms part is byte-identical to START, including all the "Your customers' data" paragraphs.
  - **G.** The three intro paragraphs are replaced.
  - **H.** The date is 24 November 2026.
  - **No country section is left empty:** each keeps its "### For food truck operators" part.
- **`terms-and-conditions.md`:** unchanged.

## 4 · Part 2 — the translations

- **Translated (54 bases, every one an enabled country uses):**
  - ar-AE am-ET az-AZ bg-BG bn-BD bs-BA ca-AD cs-CZ da-DK de-DE el-GR es-ES et-EE fi-FI fr-FR he-IL hr-HR hu-HU hy-AM id-ID is-IS it-IT ja-JP ka-GE kk-KZ km-KH ko-KR lo-LA lt-LT lv-LV mk-MK mn-MN ms-MY nb-NO ne-NP nl-NL pl-PL pt-BR pt-PT ro-RO ru-KZ si-LK sk-SK sl-SI sq-AL sr-RS sv-SE sw-TZ th-TH tr-TR uk-UA uz-UZ zh-HK zh-TW.
  - The list was read live from `country_settings` (210 enabled countries), with variants mapped to their base by `legalBaseOf`. es-MX and the other Spanish variants read es-ES, de-AT/CH/LI read de-DE, and so on.
- **Untouched:** fil-PH, hi-IN, ur-PK, ta-LK and vi-VN, which no enabled country uses. All three of their files are byte-identical to START.
- **Process:** the same as legal-languages-1 and terms-postpay-1.
  - Six parallel translators worked from one brief (`docs/france-privacy-1/apply.py` is the apply-and-check script).
  - They translated only the changed parts. They reused each file's own register and the wording of the per-country privacy parts being removed ("We will check that the request is genuine…", "You can ask someone to make the request for you", marketing emails, text messages).
  - The parts were put in by position from START's text. The privacy parts were deleted mechanically, and each file was re-stamped.
  - The structure checker (`scripts/_legal-translations.cjs`) passes on every file: headings, numbers, links, emails, web addresses and processors.
- **Kept exactly as in the English:** privacy@hatchgrab.com, ico.org.uk, 0303 123 1113 and "Information Commissioner's Office" (Latin script, straight apostrophe). Where the old section 8 had a local gloss of the ICO's name in brackets, the gloss is kept.
- **Back-translations:**
  - For reading: `docs/france-privacy-1/back-translations.md` has all 54, each translator's own back-translation of every new part, plus their notes.
  - For the harness: `docs/france-privacy-1/back/<locale>.json` holds the same, plus the translated text.

**Worth a native read** (every note is in the back-translations file):

- **"The regulator"** has no single term. Each language uses its usual data-protection or supervisory authority term; the GDPR term in EU languages, e.g. fr "autorité de contrôle", de "Aufsichtsbehörde". In "If something goes wrong", "breach" is the GDPR term where one exists. Exceptions: pt-BR "incidente" (LGPD), kk "жылыстау" (leak), and is "persónuverndarbrot".
- **Country-terms intro, paragraph 2** ("If it says something different from them"):
  - Retranslated to name the Terms alone in ja, ko, zh-HK, zh-TW, id, ar, pl and sl (§0.2).
  - Kept byte-identical but plural ("those documents") in nl, is, mn, km, lo and ms. Each still reads correctly for the Terms (a plural noun in nl and is), but a native reader may prefer the singular in mn, km and lo.
- **Register and pronouns:**
  - ca-AD keeps the informal "tu" of the existing Catalan files.
  - ro-RO changed "redactate" → "redactați" in G paragraph 3, so it agrees with "Termenii" alone.
  - it-IT "Anche di questi Lei è titolare" is a little formal; "Anche questi diritti Le spettano" is an alternative.
- **The ICO's name:**
  - In az-AZ a dash keeps the Azerbaijani suffix off the English name.
  - In tr-TR the suffix attaches to the English name ("…Office’tir").
  - In sr-RS and bs-BA the English name now comes first, with the local name in brackets.
- **Other wording choices:**
  - In si-LK the ICO sentence gained a verb ("can be contacted via…").
  - lt and lv render "likely to cause serious harm" as "may / could cause", as in the removed NZ part.
  - In am-ET, si-LK and mn-MN, the old "which provide appropriate safeguards" clause sat mid-sentence. It was removed there and the new clause was added at the end.
  - he-IL keeps "physical address" for "postal address" (the removed US part's wording).

## 5 · Links and anchors to the removed parts

- **Search scope:** pages, components, emails (`lib/email*.ts`), messages (en-GB and every locale), the FAQ (the `faq_items` table, read-only), the sitemap and the legal chrome.
- **What I found:** nothing links to a removed privacy part or to any anchor in the country-terms page. Every link targets the page (`/country-terms` or `/<seg>/country-terms`), and that page still exists and renders.
- **The privacy policy's own link to `/country-terms`:** removed by change A, as written.
- **The country-terms page:** still linked from the Terms of Service (its own sentence and the top-of-page link) and from the legal footer.
- **Fixed:** nothing; no link is broken.
- **Listed and not changed:**
  - The `legalChrome.meta.countryTermsDescription` message ("The extra rules that apply to HatchGrab in some countries.") is still accurate.
  - `lib/legal.ts`'s comment on `COUNTRY_TERMS_PATH` said the page "forms part of the terms and the privacy policy". The comment is updated; it is not visible to anyone.
  - The FAQ has no answer that mentions the country terms, the privacy policy or a reply deadline.

## 6 · The reply deadlines removed from the Country-specific terms (for the manual)

Checked against START's text of each removed part. These are what each country's law requires for answering a privacy request. The policy now says "within one month, or sooner if the law of your country requires it".

| Country | Reply within |
|---|---|
| United States | 45 days |
| Australia | 30 days |
| New Zealand | 20 working days ("as soon as we reasonably can, and within 20 working days") |
| Canada | 30 days |
| Brazil | 15 days |
| Mexico | 20 business days |
| Japan | without delay |
| Singapore | 30 days |
| Hong Kong | 40 days |
| Malaysia | 21 days |
| Thailand | 30 days |
| United Arab Emirates | 30 days |
| EEA and Switzerland, Ireland, France, Gibraltar | one month |

The removed parts also named each country's regulator and complaint route; Australia, for example, said to complain to the OAIC if there is no reply within 30 days. Their full text remains in git: `git show ec16f022:content/legal/country-specific-terms.md`.

## 7 · Proof

**`scripts/france-privacy-1.cjs`** (new, registered after france-notes-1): **47 passed, 0 failed.**

**A · Account deletion, in memory, this tree vs START on the same seed.**
- **The seed:**
  - two trucks of the account plus another account's truck;
  - a new-style order (notes in `line_notes`), an old-style order (notes in items and deals), an order note, an identity-only order, and 1,100 more orders (three pages);
  - a new-style and an old-style card draft;
  - payments.
- **Results:**
  - START leaves notes on 740 rows. This tree leaves no note text on any of them.
  - name/email/phone end exactly as START's.
  - Every other column of every order, and every payment, is byte-identical to START's result.
  - items and deals are byte-identical apart from the note fields of old-style rows; those fields stay in place, blanked.
  - Nothing is deleted, and the other account is untouched.
  - A second run, and a recovery re-run that reaches the notes step again, write nothing.
  - `notesPatch` is imported, not copied. Retention's patches are byte-identical to START's.

**B · The English:**
- the privacy policy is START plus exactly A–E;
- the country terms are START plus exactly F, G and H;
- every country's terms part is byte-identical, and none is empty;
- the date mirrors are right;
- the named re-pin module gives START back byte for byte.

**C · The translations:**
- 54 × 2 files are stamped and structure-clean;
- no per-country privacy heading is left, and every terms part is byte-identical to START;
- the new wording and its back-translations are present;
- each file is START with exactly those parts replaced, byte for byte;
- the address, ICO name, web address and phone are exact;
- the 5 unused bases and every `terms-and-conditions.md` are untouched.

**D · The pages render:** `/privacy` and `/country-terms` in English, and `/fr`, `/de`, `/jp` and `/ae` translated, show the new wording and no privacy part. legal-languages-1 §4 renders every language's three pages too: 407 passed.

**Other checks:**
- `tsc --noEmit` is clean.
- ESLint is clean on every changed code and harness file.

## 8 · Re-pins (by name, with the reason)

- **`scripts/_named-terms-postpay-1.cjs`:** `undoCode` now calls the new `scripts/_named-france-privacy-1.cjs` first.
  - The new module holds exact undo pairs for both English documents and `lib/legal.ts`, in `scripts/fixtures/france-privacy-1-legal-edits.json`. They are generated from the diff against START, give START back byte for byte, and are idempotent.
  - Every older helper in the chain (world-countries-2/3, contact-1, tidy-1, paperwork-1) calls terms-postpay-1's, so the harnesses that pin the legal files' older bytes take this round back by name: newest change first, the chain's own rule.
- **`scripts/legal-languages-1.cjs` §1:** the 5 unused bases' `privacy-policy.md` and `country-specific-terms.md` join `NOT_RETRANSLATED`. They are left on the English from before 24 Nov 2026, like their `terms-and-conditions.md` since terms-postpay-1.

The first sweep found seven more harnesses pinning the old legal text or dates. Each is re-pinned at the failing check, with a dated `⚠️ RE-PINNED (france-privacy-1, …)` comment:

- **`scripts/world-countries-2.cjs`:** its eight sections' checks ("For food truck operators" then "Privacy, for everyone in …") and the date-agreement check now read the country terms and the privacy policy through the exact undo.
- **`scripts/world-countries-3.cjs`:**
  - §1–2 (Mexico's Secretaría sentence, the dates) read the English through the exact undo.
  - §3 checks each translation's Mexico paragraph as it was at `ec16f022`. It also checks that today's used translations have no privacy part left, and skips the stamp check for the 5 unused bases' country terms.
  - §4 now proves the Secretaría is **gone** from `/country-terms` and `/mx/country-terms`, and that START's English and Spanish named it.
- **`scripts/us-legal-draft.cjs`:**
  - `/privacy` and `/country-terms` show "Last updated: 24 November 2026".
  - `/privacy` no longer links the country terms. This is change A, now checked as absent.
- **`scripts/paperwork-1.cjs`:**
  - The PRIVACY_UPDATED / date check reads through the exact undo.
  - The privacy drift check covers the used bases. The unused bases' file is checked byte-identical to `ec16f022`.
- **`scripts/france-notes-1.cjs`:** "the privacy text is not touched" now means two things. Only the two france-privacy-1 documents changed under `content/legal`, and the English, taken back by the exact undo, is START's.
- **`scripts/plans-data-model.cjs`:** the sitemap's `/privacy` and `/country-terms` lastmod is 2026-11-24.
- **`scripts/language-phase-1e-tidy.cjs`:** the named item `france-privacy-1-legal-lastmod` (`scripts/_named-france-privacy-1.cjs` ITEMS) is precise. It must change both HatchGrab sitemap views.
- **`scripts/tidy-1.cjs` and `scripts/contact-1.cjs`** (both fail one check of their own at START; see below):
  - Their per-translation checks of the privacy policy now set aside, by name, the lines this round introduced. `isNewLine` in `scripts/_named-france-privacy-1.cjs` marks a line that is not in the file at `ec16f022`; `scripts/france-privacy-1.cjs` §C proves those lines are exactly the named parts.
  - The 5 unused bases must be `ec16f022`'s bytes.

## 8b · The sweep (`scripts/run-harnesses.cjs`, against this prompt's starting commit)

| Run | Harnesses | Failing |
|---|---|---|
| START `ec16f022` (its own worktree) | 234 | **19** |
| START + only this workstream's files (its own worktree, so the other sessions' later commits and edits are left out) | 235 (+ france-privacy-1) | **19: the same 19** |

**Every one of the 19 fails exactly as at START.** For each, the failing check lines were compared, START against this tree:
- **Identical failing checks (15):** billing-1, costs-accounts-1, country-settings-parity, cwv-2, event-types-render, faq-1, france-1, language-phase-1b, language-phase-1c, language-phase-1d2, legal-languages-1 (407/1, "every fixed-English translator is a named, deliberate one"), loyalty-1, screenshot-truck-details, site-chrome-1, and contact-1 (planTable files).
- **Same counts; only the timing in the summary line differs (3):** language-phase-1d (486/4), language-phase-1e (1020/3) and language-phase-2 (1770/404).
- **Same single check (tidy-1):** "no code reads a trucks.is_test". tidy-1 and contact-1 also briefly failed their translation checks, until the re-pins above; re-run, each fails only its START check.

**The first sweep found 7 more failures,** each a harness pinning the old legal text or dates. All 7 are re-pinned above and pass: language-phase-1e-tidy 61/0, world-countries-2 47/0, world-countries-3 12/0, france-notes-1 44/0, us-legal-draft 36/0, plans-data-model 154/0 and paperwork-1 115/0. france-privacy-1 is 47/0.

**ESLint:** every changed file has the same error and warning counts as at START (us-legal-draft's new `require` carries the file's usual disable comment). The new files are clean.


## 9 · SQL run (all read-only SELECTs; nothing written)

```sql
select table_name, column_name, data_type from information_schema.columns where table_schema='public' and (data_type in ('jsonb','json','text','ARRAY') ) and (column_name ~* '(note|instruction|item|deal|payload|snapshot|state|body|message|metadata|content|text|request|detail|raw|data|cart|order)') order by 1,2;
```
```sql
select count(*) as rows_total,
 count(*) filter (where coalesce(before_state::text,'') ~ '"specialInstructions"\s*:\s*"[^"]' or coalesce(after_state::text,'') ~ '"specialInstructions"\s*:\s*"[^"]') as with_dish_note,
 count(*) filter (where coalesce(before_state::text,'') ~ '"slotNotes"\s*:\s*\{\s*"' or coalesce(after_state::text,'') ~ '"slotNotes"\s*:\s*\{\s*"') as with_slot_notes,
 count(*) filter (where coalesce(before_state::text,'') ~ '"notes"\s*:\s*"[^"]' or coalesce(after_state::text,'') ~ '"notes"\s*:\s*"[^"]') as with_order_note,
 count(*) filter (where coalesce(before_state::text,'') ~ '"line_notes"' or coalesce(after_state::text,'') ~ '"line_notes"') as with_line_notes
from public.action_audit_log;
```
```sql
select (select count(*) from public.messages) as messages, (select count(*) from public.messages where order_id is not null) as messages_with_order, (select count(*) from public.whatsapp_logs) as whatsapp_logs, (select count(*) from public.order_payments where note is not null) as payments_with_note, (select count(*) from public.orders where modify_data is not null) as orders_modify_data, (select count(*) from public.order_drafts) as drafts, (select count(*) from public.order_drafts where promoted_at is null) as drafts_unpromoted, (select count(*) from public.order_drafts where coalesce(notes,'')<>'' or items::text ~ '"specialInstructions"\s*:\s*"[^"]') as drafts_with_notes;
```
```sql
select table_name, string_agg(column_name || ':' || data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name in ('orders','order_drafts','whatsapp_logs','messages') and data_type in ('text','jsonb','json','character varying','ARRAY') group by 1;
```
```sql
select column_name from information_schema.columns where table_schema='public' and table_name='country_settings' order by ordinal_position;
```
```sql
select string_agg(distinct locale, ' ' order by locale) as locales, count(*) as enabled_countries from public.country_settings where enabled;
```
```sql
select column_name from information_schema.columns where table_schema='public' and table_name='faq_items' order by ordinal_position;
```
```sql
select id, status, left(question_en, 80) as q, (answer_en ~* 'country-terms|country-specific|country terms') as links_country_terms, (answer_en ~* '45 days|30 days|one month|20 working|within') as mentions_deadline, (answer_en ~* '/privacy') as links_privacy from public.faq_items where answer_en ~* 'country-terms|country-specific|country terms|/privacy|privacy policy|your rights|data protection|privacy@' or coalesce(answer_single_plan_en,'') ~* 'country-terms|country-specific|/privacy|privacy@';
```

**Results:**
- audit log: 1,789 rows, 0 / 0 / 0 / 0;
- messages 0, whatsapp_logs 17, payments with a note 883, modify_data 0, drafts 13 (0 unpromoted, 2 with notes);
- 210 enabled countries;
- FAQ: no rows.

## 10 · Left undone

- **Decision for you:** should account deletion also delete the truck's `whatsapp_logs` / `messages` rows at once (§2)? Today they go at 12 months.
- **Decision for you:** should account deletion also clear a card draft's name, email and phone (§0.3)? Today: none unpromoted live.
- **A native read** of the points in §4, especially the "regulator" and "breach" terms and the plural "those documents" in mn, km and lo.
- **Not deployed.** The new wording is live only once you deploy. The deployed account-deletion code does not clear notes until then.
