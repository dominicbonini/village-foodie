# faq-3: the FAQ on the English-language country pages

*2 November 2026. Status: **done**, committed on `main`, not pushed or deployed.*

- Migration 20261059 ran and is verified (§2).
- The check now refuses to publish any answer that mentions paying at the truck.
- The English landing pages show the FAQ from the live rows.
  - It is built from the same component and JSON-LD builder as the comparison pages.
  - It refreshes when Admin saves, with no deploy.
- Every other country, and every comparison page, is byte-identical to HEAD.
- Proof: `scripts/faq-3.cjs` 176/176. `faq-1.cjs` re-pinned, 200/200.
- Sweep: 169/178, the same nine failures as the baseline (§6).

**Changed mid-run, on your instruction:**
- The heading is **"Frequently asked questions"**.
- The sub-line ("Straight answers about…") is gone.
- So there is **one** new message key (`landing.faq.title`), not two. It is translated into all 28 bases.

## 1 · Diagnosis: the missing 26th question (read-only, not recreated)

**The missing row is `fa000002-0000-4000-8000-000000000022`, "Which countries is HatchGrab available in?"**
- It was in section 5 ("About HatchGrab"), position 1.
- Its answer was `HatchGrab is available in {countries}.`
- Its CHECK note was about the United Arab Emirates being in that list.
- Section 5 still has positions 2, 3 and 4. Admin's delete doesn't renumber, so position 1 is simply missing.

**It was deleted through Admin › FAQ, at 11:13:10 UTC today.**
- The Supabase API log has exactly one DELETE against `faq_items`:
  - `DELETE /rest/v1/faq_items?id=eq.fa000002-0000-4000-8000-000000000022&select=id`
  - status 200, `2026-11-02T11:13:10Z`
- That request shape is what `lib/admin/faq-store.ts` `deleteItem` sends: `.delete().eq('id', id).select('id')`.
- That function is called only from `item.delete` in `lib/admin/faq-actions.ts`, behind the admin-only route.

**Could anything else have removed it?** Nothing else in the repo can:

| Path | Can it delete a question? |
|---|---|
| Admin › FAQ "Delete" on a question (`item.delete`) | **Yes. This is what ran.** |
| Admin › FAQ "Delete" on a section (`section.delete`) | Yes, by `ON DELETE CASCADE`, but it takes the whole section. Section 5 and its other three questions are still there. |
| Any migration | No. No migration deletes `faq_items` rows. 20261056 only seeds (`on conflict do nothing`); 20261058 and 20261059 only update by id. |
| Any other code | No. A grep of `app`, `lib`, `components`, `scripts` and `supabase` finds no other delete, truncate or drop on `faq_items` or `faq_sections`. |
| The browser | No. RLS is on, there are no policies, and only `service_role` has grants. |
| Someone with database access (SQL editor, dashboard table editor) | Possible in principle, but it would not show up as that exact REST request. |

`…0017` is also absent. That is by design: faq-1b folded it into `…0007`.

## 2 · FAQ wording (migration 20261059, English only, rows by id)

**Rule (yours):** no FAQ answer mentions Pay at Hatch, paying at the truck or paying on collection.

| Row | Change | Live after |
|---|---|---|
| …0010 "Can customers pay at the truck instead of online?" | `status='draft'`, `published_at=null`. Text untouched. | draft, published_at null, text unchanged |
| …0003 the free-trial answer | "Connect online card payments before your trial ends, because after it pre-orders are paid online." removed from **both** answers | both answers end at "…we’ll switch you." / "…to set up payment." |
| …0007 the equipment answer | your new wording | as written, see the note below |

**About the …0007 text:** your brief has a straight apostrophe ("You don't"). Every FAQ answer uses the typographic ’, so the row says "You don’t". Nothing else differs.

**`lib/faq/check.ts`:**
- New `BANNED_WORDING` list: `{payAtTruck}`, "Pay at Hatch", "pay at the truck", "pay when they collect".
- New `bannedWordingIn()`. It matches either answer, ignoring case.
- `checkItem` adds one sentence when an answer contains any of them, for example: *The answer says “{payAtTruck}” and “pay when they collect”. Published answers can't mention Pay at Hatch, paying at the truck or paying when customers collect.*
- Because it is part of the check, the same rule applies everywhere the check runs:
  - **Publishing** is refused (400) with that sentence plus "It can't be published until it reads correctly in every country."
  - **Saving a published question** with such wording is refused too.
  - Admin › FAQ shows the red message live while typing.
  - The public FAQ leaves such a question out (§3).
- A draft may still hold the wording. …0010 does, and Admin shows it failing.
- Proved in the harness:
  - each phrase, in any case, in either answer;
  - publish refused with nothing written;
  - a save of a published question refused with nothing written.

**The FAQ check, re-run for every switched-on country:** all 24 published rows pass in all 44 switched-on countries, wherever each one shows (`faq-3.cjs` §3). No published answer contains the banned wording, live (verify SQL below) or in the fixture.

## 3 · The public FAQ section

**Where:** on each country landing page, between the pricing section and the final "Upload my menu" CTA (`#try`).

**Which countries:**
- Only countries whose page language is English. `landingFaq` checks `isEnglish(settings.locale)` from `lib/i18n/locales.ts`; no country list is typed.
- Live, that is the switched-on English-locale countries with a page: **AU, CA, GB, GI, IE, MT, NZ, SG, US** (9).
- Every other country gets `null` before anything is read. It renders no section, no heading and no FAQPage.
- DE, FR, BR and JP are proved byte-identical to HEAD with every FAQ row present in the database (§5).

**Content** (`lib/faq/public.ts`, new, server only):
- **Which questions:** published questions only.
  - They are grouped by section in Admin's order (`position`), with each section title as a small label.
  - Each answer is filled for the page's country by the `lib/faq` resolver (`resolveItem`), the one Admin previews with.
- **What is left out, and logged server-side:**
  - a question hidden here by `show_in`: `console.info`, `[faq] US: "…" (id) is hidden here by show_in 'apps'`;
  - a question failing the check: `console.warn` with the check's sentences.
- **Which check:** "failing the check" means `checkItem` over every switched-on country, the same rule that refuses a publish. A published question that has started failing anywhere is therefore left out everywhere until fixed.
- **Empty cases:** an empty section is left out; with nothing visible, the whole section and the FAQPage are left out.
- **A failed read** is logged and the page renders without the FAQ. It never takes the landing page down.

**Reuse (DRY):**
- **Markup:**
  - New `components/faq/FaqDetails.tsx`: `<details><summary>q</summary><p>a</p></details>` for each pair.
  - The comparison page uses it: `<FaqDetails items={v.faq} className="cmp-faq" />`.
  - The landing page uses it: `className="faq-q"`.
- **JSON-LD:**
  - `faqPageLd(id, items)` in `lib/structured-data.ts`.
  - `lib/comparison.ts` uses it in place of its own block.
  - `landingGraph` takes an optional `faq` and appends the FAQPage to the landing page's existing `@graph`.
- **Proof:** every comparison page is byte-identical to HEAD. That covers DE live, live with apps, live with till players, admin, admin with public view, the visitor-404 view, off, the `.md` and `.json` twins, and GB's English comparison page.

**Styles:**
- **Reused from the landing page:** the section wrapper, `.wrap`, the `band` wash, the centred heading block (`.price-head`, as pricing's) and `h2`.
- **New in `app/landing/faq.css`** (only the parts the mockup has and the page didn't, all from landing.css's tokens):
  - the small-capital section labels, in `--hero-grey`, the pricing currency line's AA grey;
  - the question rows with their `--line` rules;
  - the orange +/−.
- **Why a separate file:** landing.css is also imported by the comparison pages. Adding rules there would change their stylesheet.
- **Answers are always in the HTML:** each answer is in the server HTML while its question is closed (no `open` attribute).

**The white/wash sequence:** the page alternates white and wash bands, so the FAQ takes the colour opposite pricing, and the final CTA flips to stay opposite the FAQ.

| Country | Pricing | FAQ | Final CTA |
|---|---|---|---|
| GB | wash | **white** | wash |
| Other English countries | white | **wash** | white |

- GB matches the mockup exactly.
- On /us the FAQ sits on the pale wash, where the mockup's phone shows white. Making it white would have meant two white sections in a row, or changing the pricing section's colour, which the brief told me to leave alone.

**Search and AI:**
- Server-rendered.
- FAQPage is in the landing page's existing `@graph`, with `@id` = the page's canonical address + `#faq` (for example `https://www.hatchgrab.com/uk#faq`).
- Every `name` and `acceptedAnswer.text` equals the visible question and answer exactly, proven for every English page.
- It is only on pages that show the FAQ.
- The landing page's JSON-LD now escapes `<` as `<`, as the comparison pages do. No current page has a `<` in its graph, so this changes no bytes today; it guards admin-written answers.

**Updates without a deploy:**
- This repo has no `revalidateTag`. The landing route is `force-dynamic`, and data is cached in memory for 60 seconds per server instance, with a `clear…Cache()` called after Admin writes, as plans and country settings do.
- The FAQ follows that existing pattern:
  - `clearPublicFaqCache()` runs in a `finally` after **every** POST to `/api/admin/faq`: save, publish, unpublish, reorder, delete.
  - It runs even after a failed POST, which may have written part.
  - That instance shows the change on the next request; other instances show it within a minute.
- The harness proves it with the real route:
  - a change in the database alone does not show inside the cache's minute;
  - after `POST item.unpublish` the question is gone from /uk;
  - after `POST item.publish` it is back;
  - a reorder POST refreshes as well.

**Other items from the brief:**
- **`MARKETING_COPY_UPDATED`:** already `'2026-11-02'` (moved this morning by copy-truth-1). That is today, so the value stands; the comment records faq-3.
- **`/llms.txt`:** unchanged (`git diff` empty for its builder and route).
- **Payments, pricing banner, plans data and other messages:** untouched. The only message change is `landing.faq.title`.

**React ids:** the FAQ and the final CTA share one JSX slot. With no FAQ, the slot holds the final CTA element exactly as before.
- My first version added a separate `{faq && …}` slot.
- That shifted every later sibling by one position, which changed React's generated ids in the footer's country menu on **every** page, German ones included.
- The HEAD comparison caught it.

## 4 · Message key

**`landing.faq.title`** is "Frequently asked questions" in en-GB. It is translated into all 28 bases, with back-translations in `docs/i18n/back/`.

| Locale | Text | Locale | Text |
|---|---|---|---|
| fr-FR | Questions fréquentes | fi-FI | Usein kysytyt kysymykset |
| de-DE | Häufige Fragen | et-EE | Korduma kippuvad küsimused |
| es-ES | Preguntas frecuentes | lv-LV | Biežāk uzdotie jautājumi |
| it-IT | Domande frequenti | lt-LT | Dažniausiai užduodami klausimai |
| pt-PT | Perguntas frequentes | el-GR | Συχνές ερωτήσεις |
| nl-NL | Veelgestelde vragen | bg-BG | Често задавани въпроси |
| sv-SE | Vanliga frågor | pt-BR | Perguntas frequentes |
| da-DK | Ofte stillede spørgsmål | ms-MY | Soalan lazim |
| nb-NO | Ofte stilte spørsmål | ja-JP | よくある質問 |
| pl-PL | Najczęściej zadawane pytania | zh-HK | 常見問題 |
| cs-CZ | Časté dotazy | th-TH | คำถามที่พบบ่อย |
| hu-HU | Gyakori kérdések | ar-AE | الأسئلة الشائعة |
| sk-SK | Časté otázky | ro-RO | Întrebări frecvente |
| hr-HR | Često postavljana pitanja | sl-SI | Pogosta vprašanja |

- **translation-check** for every base:
  - structural is still **3**: the three `faq.phrases.*` keys, English-only by your decision;
  - nothing is flagged on `landing.faq`.
- No non-English page shows the FAQ today; the key is ready for when one does.

## 5 · Proof: `scripts/faq-3.cjs` (in `harnesses.json`), 176/176

1. **GB, US and IE:**
   - the FAQ renders, under "Frequently asked questions" with no sub-line;
   - section labels in Admin order;
   - the cost answer is in £, $ and € respectively, and every amount in it is one the page's pricing cards print;
   - no token is left unfilled;
   - the FAQPage `@id` is canonical + `#faq`;
   - the JSON-LD questions and answers equal the visible ones, in order;
   - no `<details open>`;
   - …0007 has your wording, with the apps sentence in GB only (apps in the UK stores);
   - …0003 no longer has the card-payments sentence.
2. **Every English page** (AU, CA, GB, GI, IE, MT, NZ, SG, US, read from the locale config):
   - the FAQ and FAQPage are present;
   - **…0010 is absent** from the page and the JSON-LD;
   - **no banned wording** in the FAQ or its JSON-LD (the pricing banner's own "Pay at Hatch" is outside the section and untouched);
   - the section sits between pricing and the final CTA;
   - the white/wash alternation holds.
   - DE, with every row published, shows no FAQ, no heading and no FAQPage.
3. **The rules:**
   - a `show_in: 'apps'` question shows in GB, is absent in the US, and the US hiding is logged;
   - …0005 (`plan:payg`) follows its plan;
   - a question with an unknown token is left out and logged;
   - a published answer with banned wording is left out and logged;
   - an empty section has no label;
   - nothing published means no section and no FAQPage, and the final CTA keeps its HEAD band;
   - the fixture holds 24 published rows, …0010 as the only draft, and no …0017 or …0022;
   - no published answer contains the banned wording; …0010 does, which is why it's a draft;
   - **the check passes for all 24 published rows in all 44 switched-on countries**;
   - the check refuses each banned phrase in any case, including in the single-plan answer;
   - Admin publish is refused (400, nothing written), and so is a save of a published question.
4. **Refresh:** the real `POST /api/admin/faq`, with admin stubbed, clears the cache:
   - unpublish → gone;
   - publish → back;
   - reorder → refreshed;
   - a database change alone waits for the cache's minute.
5. **Byte-identical to HEAD** (a92f983a: the migration commit, whose code is bfdc9bb6's):
   - DE, FR, BR and JP landing pages, with the FAQ rows present;
   - all 10 comparison views and twins;
   - GB and US landing pages when nothing is published.
   - The HEAD hashes are `scripts/fixtures/faq-3-identity.json`, captured by this same script in a worktree of a92f983a.
6. **translation-check:** en-GB `landing.faq` = `{title: "Frequently asked questions"}`, and every one of the 28 bases has a translation, structural 3, and no flag.

**Fixtures:** the FAQ rows are `scripts/fixtures/faq-3-rows.json`, read live with the read-only MCP after 20261059 ran.

**Screenshots** are from `scripts/faq-3-screens.cjs`: WebKit, real fonts, by hand, listed with the other build-dependent screen scripts.
- `docs/faq-3/faq-uk-1440.png`: /uk at 1440, first question open, as the mockup's laptop.
- `docs/faq-3/faq-us-430.png`: /us at 430, second question open, as the mockup's phone.
- Both pass these checks:
  - nothing scrolls sideways;
  - the section sits between pricing and the final CTA;
  - the heading is centred;
  - the orange + on every row and − on the open one;
  - the labels are in small capitals.
- **How the CSS got there:** the last build (1 Nov) predates `faq.css`, so the script adds it from the source on top of the build's CSS. I did not run `next build` over a `.next` a dev server may be using.

**faq-1.cjs re-pinned (200/200).** Each re-pin is caused by faq-3, with the reason in the file:
- The seed's …0007 ("pay at the truck") and …0010 (`{payAtTruck}`) now fail the check on wording only. Every other part of the check passes for all 26 seed questions. A new check says these two are the only ones.
- …0010 as 20261058 left it fails only on wording.
- `lib/faq` holds four files (`public.ts`).
- The landing page, `lib/faq/public.ts` and the Admin route now import `lib/faq`.
- 20261059 follows 20261058.
- The Admin tab summary counts 3 failing questions (its fixture plus seed …0007 and …0010).
- §8's landing hashes for GB, US, BR and JP are **unchanged**, because no FAQ rows means a HEAD-identical page.

## 6 · The full sweep

`node scripts/run-harnesses.cjs`: all 178 listed files pass the screen (faq-3.cjs names no payment provider). **178 run,
169 passed, 9 failed. They are the same nine harnesses, with the same counts and the same lines, as the faq-1c-undo baseline.
faq-3 adds no failure.**

**Fail at HEAD too (not faq-3's):**

| Harness | Fails | Why |
|---|---|---|
| schedule-graphics-places | 1 | known, fails at HEAD |
| canada-1 | 1 | "postal code / card terminal" frame check, fails at HEAD |
| world-countries-2 | stops | "Terms edit — expected once, found 0: Last updated: 20 October 2026" (the legal-date guard), fails at HEAD |
| legal-languages-1 | stops | the same error (it calls world-countries-2's module) |
| europe-languages-1 | 1 of 29 | de-CH ß, fails at HEAD |
| world-countries-1 | 1 of 8 | "no source file … still carries the words" (the tagline), fails at HEAD |

**Expected: the three `faq.phrases.*` keys, English-only by your decision:**

| Harness | Fails |
|---|---|
| europe-languages-1 | 28: each base's translation-check is 3 structural, not 0 |
| world-countries-1 | 7: the same |
| france-1 | 1: the same |
| country-picker-1 | 1: the same |
| languages-1 | 1: "every catalog module…": the faq catalog module has no language line |

`landing.faq.title` adds no structural line in any base. faq-3.cjs 176/176 and faq-1.cjs 200/200 were run again after the sweep, with
their final edits. `add-order-refresh-inputs` (timing-flaky) passed this time.

## 7 · Found on the way (not changed)

- **Admin › FAQ's summary line** counts a question that fails only on wording under "… need an answer for some countries". That wording fits the token failures it was written for, not this one. The per-question red message is right. Tell me if you want the summary to name wording failures separately.
- **The comparison pages' FAQ** keeps its native ▶ disclosure marker and its own `cmp-faq` styles. Byte-identical was required, so the +/− look is landing-only.
- **Synthetic POSTs in the harness answer 409** because the fake database doesn't return the updated row. The cache is still cleared, because the clear is in a `finally`, which is what is being proved.

## 8 · Files

- **New:**
  - `lib/faq/public.ts`
  - `components/faq/FaqDetails.tsx`
  - `app/landing/faq.css`
  - `scripts/faq-3.cjs`
  - `scripts/faq-3-screens.cjs`
  - `scripts/fixtures/faq-3-rows.json`
  - `scripts/fixtures/faq-3-identity.json`
  - `docs/faq-3/faq-uk-1440.png`
  - `docs/faq-3/faq-us-430.png`
  - `supabase/migrations/20261059_faq_3.sql`
  - this report
  - Your mockup `docs/faq-3/faq-public-mockup.png` is committed with them.
- **Changed:**
  - `app/landing/page.tsx`
  - `app/[country]/[section]/[slug]/page.tsx`
  - `app/api/admin/faq/route.ts`
  - `lib/faq/check.ts`
  - `lib/structured-data.ts`
  - `lib/comparison.ts`
  - `lib/marketing-meta.ts` (comment only)
  - `messages/en-GB.json` and the 28 bases
  - `docs/i18n/back/*` (28)
  - the generated `messages/ns/**` and `lib/i18n/catalog/**`
  - `scripts/faq-1.cjs`
  - `scripts/harnesses.json`

## Migration as run

`npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261059_faq_3.sql`

```
db-migrate: supabase/migrations/20261059_faq_3.sql · sha256 96454e989b68b9d7 · committed at a92f983a
db-migrate: supabase/migrations/20261059_faq_3.sql applied — one transaction, no error
```

```sql
-- 20261059_faq_3.sql — faq-3 (2 November 2026, docs/faq-3-report.md §2): THE FAQ'S WORDING BEFORE IT GOES PUBLIC. English only,
-- rows by id, public.faq_items only (no protected table, no truck).
--
-- RULE (Dominic): no FAQ answer mentions Pay at Hatch, paying at the truck or paying on collection. lib/faq/check.ts now refuses
-- to publish such an answer; this file brings the three rows that broke it, or led into it, into line.
--   …0010 "Can I take orders without online card payments?" — back to a draft (published_at cleared). Its text is NOT changed.
--   …0003 the free-trial answer — the sentence "Connect online card payments before your trial ends, because after it pre-orders
--         are paid online." comes out of both answers (faq-1c added it; 20261058 kept it).
--   …0007 the equipment answer — Dominic's new wording.
-- Run by Claude with scripts/db-migrate.cjs. Safe to run twice: each step changes only the text it expects, then asserts the end
-- state, and raises on anything it doesn't recognise.

begin;

do $$
declare n integer;
begin
  -- …0010 · a draft again, text untouched
  update public.faq_items set status = 'draft', published_at = null, updated_at = now(), updated_by = 'faq-3'
   where id = 'fa000002-0000-4000-8000-000000000010' and (status <> 'draft' or published_at is not null);
  if not exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000010' and status = 'draft' and published_at is null) then
    raise exception 'faq-3: …0010 is missing or still published';
  end if;

  -- …0003 · the trial answers without the card-payments sentence
  update public.faq_items set
    answer_en = replace(answer_en, $x$ Connect online card payments before your trial ends, because after it pre-orders are paid online.$x$, ''),
    answer_single_plan_en = replace(answer_single_plan_en, $x$ Connect online card payments before your trial ends, because after it pre-orders are paid online.$x$, ''),
    updated_at = now(), updated_by = 'faq-3'
   where id = 'fa000002-0000-4000-8000-000000000003'
     and (answer_en like '%Connect online card payments before your trial ends%' or answer_single_plan_en like '%Connect online card payments before your trial ends%');
  if not exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000003') then
    raise exception 'faq-3: …0003 is missing';
  end if;
  if exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000003'
              and (answer_en like '%Connect online card payments%' or coalesce(answer_single_plan_en, '') like '%Connect online card payments%')) then
    raise exception 'faq-3: …0003 still holds the card-payments sentence (its text is not the one faq-1c wrote)';
  end if;

  -- …0007 · Dominic's wording, over faq-1c's
  if not exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000007' and answer_en = $a$No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: customers can pay for pre-orders online by card, and for walk-up orders you keep using the card machine you already have. {apps.sentence}$a$) then
    update public.faq_items set
      answer_en = $a$No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: customers can pay for pre-orders online by card, and for walk-up orders you keep using the card machine you already have. {apps.sentence}$a$,
      updated_at = now(), updated_by = 'faq-3'
     where id = 'fa000002-0000-4000-8000-000000000007'
       and answer_en = $a$No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: pre-orders are paid online, and for walk-up orders you keep using the card machine you already have. {apps.sentence}$a$;
    get diagnostics n = row_count; if n <> 1 then raise exception 'faq-3: …0007 is neither faq-1c''s text nor the new one'; end if;
  end if;
end $$;

commit;
```

## Verify SQL (read-only MCP) and results

```sql
select right(id::text,4) id, status, published_at, updated_by, answer_en, answer_single_plan_en
from public.faq_items
where id in ('fa000002-0000-4000-8000-000000000003','fa000002-0000-4000-8000-000000000007','fa000002-0000-4000-8000-000000000010')
order by id;
```

| id | status | published_at | updated_by | answer_en (end) | answer_single_plan_en (end) |
|---|---|---|---|---|---|
| 0003 | published | 2026-11-02 11:10:56 | faq-3 | "…If you’d like a different plan, email us and we’ll switch you." | "…We’ll be in touch before then to set up payment." |
| 0007 | published | 2026-11-02 11:11:02 | faq-3 | "…You don’t need a card reader: customers can pay for pre-orders online by card, and for walk-up orders you keep using the card machine you already have. {apps.sentence}" | null |
| 0010 | **draft** | **null** | faq-3 | unchanged ("During your free trial, yes: with {payAtTruck}, …") | null |

```sql
select count(*) total, count(*) filter (where status='published') published, count(*) filter (where status='draft') drafts,
 count(*) filter (where status='published' and (answer_en ilike '%{payAtTruck}%' or answer_en ilike '%pay at hatch%' or answer_en ilike '%pay at the truck%' or answer_en ilike '%pay when they collect%'
   or coalesce(answer_single_plan_en,'') ilike '%{payAtTruck}%' or coalesce(answer_single_plan_en,'') ilike '%pay at hatch%' or coalesce(answer_single_plan_en,'') ilike '%pay at the truck%' or coalesce(answer_single_plan_en,'') ilike '%pay when they collect%')) published_with_banned_wording,
 string_agg(right(id::text,4), ',' order by id) filter (where updated_by='faq-3') touched_by_faq3
from public.faq_items;
```

| total | published | drafts | published_with_banned_wording | touched_by_faq3 |
|---|---|---|---|---|
| 25 | 24 | 1 | **0** | 0003,0007,0010 |

Diagnosis queries (read-only):

```sql
select count(*) total, count(*) filter (where status='published') published, string_agg(right(id::text,4), ',' order by id) ids from public.faq_items;
-- 25 · 25 (before 20261059) · 0001…0016,0018…0021,0023…0027  (no 0017, no 0022)
```

```
-- Supabase API logs (MCP query_logs, edge_logs, last 24 h): every DELETE on a faq_ table
DELETE /rest/v1/faq_items?id=eq.fa000002-0000-4000-8000-000000000022&select=id → 200 at 2026-11-02T11:13:10Z (the only one)
```

## Undo (only if Dominic asks)

Code: `git revert` the faq-3 commits (the report commit, the code commit, then the migration-file commit). The data needs its
own committed migration, run with `scripts/db-migrate.cjs`, because reverting the file does not undo what ran:

```sql
begin;
update public.faq_items set status = 'published', published_at = now(), updated_at = now(), updated_by = 'faq-3-undo'
 where id = 'fa000002-0000-4000-8000-000000000010' and status = 'draft';
update public.faq_items set
  answer_en = answer_en || $x$ Connect online card payments before your trial ends, because after it pre-orders are paid online.$x$,
  answer_single_plan_en = answer_single_plan_en || $x$ Connect online card payments before your trial ends, because after it pre-orders are paid online.$x$,
  updated_at = now(), updated_by = 'faq-3-undo'
 where id = 'fa000002-0000-4000-8000-000000000003' and answer_en not like '%Connect online card payments%';
update public.faq_items set
  answer_en = $a$No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: pre-orders are paid online, and for walk-up orders you keep using the card machine you already have. {apps.sentence}$a$,
  updated_at = now(), updated_by = 'faq-3-undo'
 where id = 'fa000002-0000-4000-8000-000000000007';
commit;
```

…0010's original `published_at` was not recorded before 20261059 cleared it, so an undo stamps it `now()`. Note that republishing
…0010 brings back an answer the check now refuses; with the code reverted too, that no longer applies.
