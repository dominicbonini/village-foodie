# plans-everywhere-3 — FAQ migration run and live; the translator is broken (since 18 Nov) and needs your decision

19 November 2026, 14:13–14:22 UTC.

- **Run:** `20261119_plans_everywhere_2_faq.sql`, on the live database. It is live on www.hatchgrab.com.
- **Not run:** `20261119_plans_everywhere_1.sql`.
- **No deploy, redeploy or push** (your standing rule, now saved to my memory).
- **Untouched:** `content/legal` and the two named trucks.

## Summary

- **The deploy is live.** Vercel production shows **`1d916cac` Ready** (14:09 UTC); it contains plans-everywhere-1 and -2. Live /jm/features no longer shows "Take payment on your phone" or "Online payments".
- **The FAQ migration ran** (one transaction, no error), and the live checks pass:

  | Page | Card answers (…0002/06/07/11) | Pay-at-truck answers (…1002/06/07/11) |
  |---|---|---|
  | /uk/faq | **4/4** | 0/4 |
  | /jm/faq (English) | **0/4** | **4/4** |
  | /br/faq (billed_online) | **3/4** in Portuguese (…0006, …0007, …0011). …0002 is hidden by a stale translation, as before this change | 0/4 |

- **The FAQ translator has been broken since 18 November.** I triggered it once (the same workflow as the hourly job). It failed like every hourly run since 18 Nov 14:40 UTC:
  - The error: "new row for relation "faq_translations" violates check constraint "faq_translations_locale_check"".
  - The cause: the constraint only allows **two-letter** language codes, and **fil-PH** (Filipino, a base since 18 Nov) has three.
  - The effect: **no FAQ translation has been written for any language since then.** /tz/faq is still a 404, and the fr-FR / es-MX spot-checks can't be done yet.
- **The fix needs two decisions from you** (§4). It involves a schema change, and a small code change that only takes effect after your deploy.

## 0 · Prompt check

- **Garbled:** "FAQW migration" in your note, which I read as the FAQ migration.
- **Contradictions:** none.
- **The standing rule** "I do every deployment myself, by hand…" is saved to my memory. This round, nothing started a build or deployment.
  - The translator trigger is a GitHub Actions run that writes FAQ translations; it is neither a build nor a deploy.

## 1 · The deployment (read-only checks)

| Check | Result |
|---|---|
| origin/main | `1d916cac` ("new plans", docs only) on top of `36d3b5b5` and `1ad9b83b`. The FAQ code and the migration are identical to `1ad9b83b`. |
| GitHub deployment record, `1d916cac` | **success**, 14:09:48 UTC |
| `vercel ls` | the newest production deployment is **● Ready** (the failed `36d3b5b5` one sits below it) |
| Live /jm/features (rendered markup) | "Take payment on your phone": no; "Online payments": no. The new code is serving. |

## 2 · The FAQ migration

**Run with:** `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261119_plans_everywhere_2_faq.sql`

**The runner's output:**
- "committed at 1ad9b83b · applied — one transaction, no error".
- It could not tell the site to refresh (`REVALIDATE_SECRET` isn't set locally), so the pages picked the change up within their cache window (about 4 minutes here).

The SQL (shown in full in the chat before running):

```sql
set lock_timeout = '3s';
begin;
alter table public.faq_items drop constraint if exists faq_items_show_in_chk;
alter table public.faq_items add constraint faq_items_show_in_chk
  check (show_in = 'all' or show_in = 'apps' or show_in = 'card_payments' or show_in = 'pay_at_truck' or show_in ~ '^plan:[a-z][a-z0-9_]*$');
-- …0002 / …0006 / …0007 / …0011 → 'card_payments' (guarded: exactly 4 published rows on 'all')
update public.faq_items set show_in = 'card_payments', updated_at = now(), updated_by = 'plans-everywhere-2'
 where id in ('fa000002-0000-4000-8000-000000000002', 'fa000002-0000-4000-8000-000000000006',
              'fa000002-0000-4000-8000-000000000007', 'fa000002-0000-4000-8000-000000000011')
   and show_in = 'all' and status = 'published';
-- the four pay-at-the-truck versions, published, in their twin's section and position (then checked: exactly 4)
insert into public.faq_items (id, section_id, position, question_en, answer_en, answer_single_plan_en, show_in, status, published_at, note, updated_by)
select v.id::uuid, t.section_id, t.position, v.question_en, v.answer_en, null, 'pay_at_truck', 'published', now(), v.note, 'plans-everywhere-2'
  from (values …1002 / …1006 / …1007 / …1011, the approved wording…) as v(id, twin, question_en, answer_en, note)
  join public.faq_items t on t.id = v.twin::uuid;
commit;
```

**Read back:**

```sql
select id, show_in, status, position, question_en from faq_items where id in (…the eight ids…) order by position, id;
-- …0002 / …0006 / …0007 / …0011: card_payments, published · …1002 / …1006 / …1007 / …1011: pay_at_truck, published
-- (…1011's question: "How do I get paid?")
```

**The live checks, 14:20 UTC** (rendered markup; English markers on /uk and /jm, the stored pt-BR questions on /br):
- **/uk/faq:** the four card answers, none of the new ones.
- **/jm/faq:** the four pay-at-truck answers ("…so there’s no card processing fee", "check your menu, and add where and when you’re trading", "…take payment the way you do today", "…the money is yours straight away"), and none of the card answers. "Stripe" appears 0 times.
- **/br/faq:**
  - shown: "Como recebo o pagamento dos pedidos online?" (…0011), "Preciso de iPad, maquininha ou algum equipamento especial?" (…0007), "Quanto tempo leva para configurar?" (…0006);
  - no pay-at-truck question.
  - **…0002 ("Quanto pago por pedido?") is not shown.** Brazil offers only Unlimited, so it reads …0002's single-plan answer, and that pt-BR translation is out of date. The build log shows the same "no up-to-date translation — hidden here: …0002" for es-PA, es-EC, es-PE, es-PY, es-UY, es-BO, es-CR, es-DO and zh-HK.
  - This predates this change: show_in isn't part of a translation's hash. It's one more effect of the broken translator (§3).
- **/tz/faq:** still **404**. There are no Swahili FAQ translations at all (§3).

## 3 · The translator (triggered once, failed — like every run since 18 Nov)

- **What I triggered:** `gh workflow run faq-translate.yml --ref main`. That is the workflow's own manual trigger: same job, same login, the default $2 cap.
  - Run 44541894498: "33 to translate (5 section titles, 28 questions) into up to 56 languages and 52 variants", then **"write translations: new row for relation "faq_translations" violates check constraint "faq_translations_locale_check""**, exit 1.
  - The model calls were made (within the $2 cap); nothing was saved.
- **The hourly runs fail the same way:** 13:34 and 03:41 UTC today (the logs say the same). The newest `translated_at` in faq_translations is **18 Nov 14:40 UTC**.
- **The four new questions have 0 translations.**

**The cause** (read-only):

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname = 'faq_translations_locale_check';
-- CHECK ((locale ~ '^[a-z]{2}-[A-Z]{2}$'::text))   — two-letter language codes only; fil-PH has three
select locale, count(*) from faq_translations group by locale order by locale;
-- 56 locales, none of fil-PH, sw-TZ, si-LK, ta-LK, ca-AD, sq-AL, bs-BA, mk-MK (the languages added since)
```

- **The code rule:** the translator also checks locales in code. `lib/faq/translator.ts:122` `validateTranslations` accepts only `^[a-z]{2}-[A-Z]{2}$`. So a reply for fil-PH fails validation.
- **The DB rule:** the translator then records a "failed" row for fil-PH, and **that row** is what the database refuses. The run stops at the first such write, so no other language is saved either.

⚠️ **A second risk in the same code.** The write **deletes** an item's rows for the batch's locales, then **inserts** the new ones, with no transaction (`scripts/faq-translate/main.ts` lines 141–147). Each failed run may therefore have deleted one item's existing translations before failing.
- Two items are short of the full set: …0004 lacks az, bn, hi, hy, ka, mn, ne, ur; …0005 lacks bn, hi, hy, ka, mn, ne, ur.
- Those are all languages-world-2 languages, which probably simply never got them. **I can't prove whether rows were deleted.**

**Also using two-letter codes only:** `contact_messages.locale` (`20261061_contact_1.sql`). I haven't checked whether the contact form writes a locale for a Filipino visitor.

## 4 · What I need from you

**Q1. The database rule.** Should I run `supabase/migrations/20261119_faq_translations_locale_3letter.sql` (written, **not run, not committed**)? It widens `faq_translations_locale_check` to `^[a-z]{2,3}-[A-Z]{2}$`; nothing else.
- Once it runs, the translator's runs succeed again for every language, including Swahili; fil-PH is stored as "failed" until Q2's fix is deployed.
- Then /tz/faq should appear with the pay-at-truck answers, and I can do the fr-FR / es-MX spot-checks.
- It's a schema change your brief didn't cover, hence the question.

**Q2. The code rule.** Should I change `lib/faq/translator.ts:122` to accept a three-letter language code too? I'd also make the translator's replace safe: insert first, then delete only the old rows, so a failed write can't lose translations.
- It would be committed locally for **you** to deploy. The workflow runs the pushed code.

**Order once you say yes:** Q1 migration → trigger the translator once → /tz/faq in Swahili and the fr-FR / es-MX checks → updated report. Q2's code goes to you to deploy.

## 5 · Hard rules

- **Database writes this round:** only the FAQ migration, as briefed. The other migration is written but not run.
- **Nothing started a build or deployment:** no deploy, no redeploy, no push.
- **One GitHub Actions run** (the translator, as briefed).
- Pizzeria Gusto and Le Roi du Churrasco were not touched. `content/legal` is unchanged. No .env file was opened.
- **Read-only queries this round:**
  - the eight FAQ rows;
  - the translations for the new items and the newest `translated_at`;
  - the constraint definition;
  - translations per locale and per item;
  - the …0004 / …0005 gaps;
  - the pt-BR questions.

  Each was shown in the chat.
