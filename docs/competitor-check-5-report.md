# competitor-check-5 — report

**30 October 2026.** Written for Dominic.

- Nothing was committed, pushed or deployed.
- No database change was run. One optional migration is written as NOT RUN SQL (§3), and no read-only SQL was used.
- **No real Claude API call was made:** every proof uses fixtures.
- No `.env*` file was opened, and no `outreach_templates` row was touched.

**Nothing in the brief arrived garbled, and I found no instruction that contradicts another.**

## 1 · The cause

Two faults combined in "gastro25: FAILED — the response was cut off (max_tokens)", cost $0.000:

1. **A small, fixed output ceiling for one huge answer.**
   - Every extractor call was sent with `max_tokens: 16000`, the default in `converse`.
   - The deep check had to return everything in **one** `record_findings` call: every plan and fee, plus one finding for
     each of about 45 features.
   - Each finding carries all of its properties, a quote and an English translation.
   - On Sonnet 5.5, adaptive thinking is on by default and spends from the same `max_tokens`.
   - So the answer ran out before the call was complete, and the code treated a `max_tokens` stop as a hard failure.
2. **A failed check's cost was thrown away.**
   - `converse` added up each response's usage, but when it threw, that sum was lost.
   - The run only added the cost of competitors that succeeded, so every token of the failed check was billed but
     recorded as $0. That also means the daily and monthly caps never saw it.

## 2 · The fixes

### max_tokens per model

The source is [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview), "Max output", read
30 Oct 2026. It is the synchronous Messages API limit, and the same as what Message Batches allow without a beta header.

| Model | Max output (docs) | New `max_tokens` (default) | Before |
|---|---|---|---|
| `claude-sonnet-5-5` (extractor and verifier) | 128K | **128,000** | 16,000 |
| `claude-haiku-5-5` (quick pass, its batch and its verifier) | 128K | **128,000** | 6,000 (pass) / 16,000 |
| any other model | not looked up | 32,000 (fallback) | 16,000 |

How the setting works:
- **It is data:** `competitor_check_settings.max_output_tokens` (jsonb, model → tokens), added by the optional migration in §3.
- **It is read tolerantly:** before the migration runs, or for a model it does not name, the code defaults above apply
  (`DEFAULT_MAX_OUTPUT_TOKENS` in `lib/competitor-check/model.ts`). Only whole numbers of at least 1,024 are read.
- **The cost is unchanged:** `max_tokens` is only a ceiling. Billing counts the tokens actually produced, and the
  [rate-limits page](https://platform.claude.com/docs/en/api/rate-limits) says "The `max_tokens` parameter does not factor
  into OTPM rate limit calculations, so there is no rate limit downside to setting a higher `max_tokens` value."
- **The live caller now streams** (`scripts/competitor-check/main.ts`: `messages.stream(…).finalMessage()`).
  - Without streaming, the installed SDK (1.3.0) refuses any request whose `max_tokens` could take more than 10 minutes
    (above about 21K tokens), with "Streaming is required…".
  - The client's own 300-second timeout skips that check, but a long non-streamed answer could then hit the timeout.
  - `finalMessage()` returns the same message as `create()`, so nothing else changes.
- **The quick pass's request-size bound is unchanged:** it still counts a 6,000-token answer, so a pass check still reads
  its 3 pages. Only the ceiling sent rose.

### The work is split into groups

- **The deep and routine messages** list numbered groups, and the model calls `record_findings` once per group:
  - group 1, **prices and terms**: plans, fees, the card rate, new and gone plans, the term and trial features, and any
    availability, classification, new URL, or blocked or gone page;
  - then **the features, at most 12 per group** (`FEATURE_GROUP_SIZE`).
  - A 45-feature check is 5 calls.
- **`record_findings` gains a required `more` boolean:** `true` on every call but the last.
  - It is not a union, so the competitor-check-4 guard still counts 2.
  - An answer without it, the older shape, counts as the last call.
- **`converse` merges the calls** (`mergeRecorded`): a finding repeated in a later call is left out, matched on field,
  feature, plan, country, URL and classification. Each call is answered "Recorded", and the conversation ends at the call
  with `more: false`.
- **The quick pass and the classification read** still make one call, with `more: false`.
- **The turn limits rise** by the number of groups and the continuation allowance.

### A cut-off answer is continued

- **When a response stops on `max_tokens`:**
  - its complete `record_findings` calls are kept;
  - the unfinished last call is answered "Cut off (max_tokens) — not recorded";
  - the model is told "Continue with the remaining findings only — not the ones already recorded — calling
    record_findings again with smaller groups".
- **It is continued up to `MAX_CONTINUATIONS` = 2 times.**
- **If it is still cut off after that:**
  - the competitor is reported as **failed**, with the reason and how many findings were kept;
  - the findings from its complete calls are **kept**: written, quote-checked and verified as usual;
  - it is **not marked checked**, so it is tried again.
- **The quick pass** behaves the same way: an incomplete item keeps its findings and stays pending in `pass_state`.
- **The same applies to any other failure** after some groups were recorded, for example an API error on a later turn.

### Shorter findings

- **Quotes are capped at 200 characters** (`QUOTE_MAX`).
  - The prompt and the tool description ask for "the shortest exact passage that proves the value … at most 200
    characters".
  - A longer quote is **cut back to a prefix**, ending at a word break. A prefix is still an exact substring of the page,
    so the quote check still needs an exact match: a made-up quote still fails.
- **`quote_en` is "" when the page is already in English.**
  - The prompt says so, and a "translation" that only repeats the quote is dropped. Both are stored as `null`.
  - A quoted finding still needs its quote and its URL; only the translation became optional.
  - The admin list already shows nothing when `quote_en` is empty or the same as the quote.

### The cost of failed calls

- **A meter per competitor**, and per quick-pass item, adds up every response's usage as it arrives: the extractor, its
  continuations and every verifier call. That includes the calls of a check that then fails or runs out of time.
- **The run adds the meter's total in both cases:** on success and on failure.
- **So a failed check's cost appears** in `cost_usd`, the tokens and the log line, and counts towards the daily and
  monthly caps.
- **Once a check is over, its meter is closed** (after its time limit, for example), so an abandoned check sends no
  further calls.
- **One gap remains:** a response still in flight at the moment the time limit passes is not counted.

## 3 · Database (NOT RUN, optional)

`supabase/migrations/20261050_competitor_check_5.sql`. Until it runs, the code uses the same values.

```sql
begin;
alter table public.competitor_check_settings
  add column if not exists max_output_tokens jsonb not null default '{"claude-haiku-5-5": 128000, "claude-sonnet-5-5": 128000}'::jsonb;
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_max_output_tokens_chk;
alter table public.competitor_check_settings add constraint competitor_check_settings_max_output_tokens_chk check (jsonb_typeof(max_output_tokens) = 'object');
commit;
```

## 4 · Files changed

- `lib/competitor-check/model.ts`:
  - the `more` flag; `QUOTE_MAX` and `capQuote`;
  - `quote_en` may be empty, and one that repeats the quote is dropped;
  - `mergeRecorded`;
  - `DEFAULT_MAX_OUTPUT_TOKENS`, `FALLBACK_MAX_OUTPUT_TOKENS` and `maxOutputTokensFor`.
- `lib/competitor-check/prompts.ts`:
  - rule 3: short quotes, and "" for an English page;
  - rule 6: one call per group, with `more`;
  - `FEATURE_GROUP_SIZE` and `findingGroups`; the groups in the deep and routine message;
  - `more: false` in the pass and classification messages.
- `lib/competitor-check/checker.ts`:
  - `converse`: several calls, continuation, `MAX_CONTINUATIONS`, the meter, and the partial result on failure;
  - `checkCompetitor`: groups, `max_tokens` from the setting, and keeping the partial findings;
  - `secondCheck`: `max_tokens` from the setting;
  - `runOne`: a meter per competitor, and incomplete checks failed but kept;
  - `CheckSettings.maxOutputTokens`.
- `lib/competitor-check/pass.ts`:
  - `max_tokens` from the setting, for the batch and sync requests and the verifier;
  - the bound's own output estimate;
  - a meter per item;
  - incomplete items keep their findings and stay pending.
- `lib/competitor-check/store-supabase.ts`: `maxOutputTokensOut`, which reads `max_output_tokens` tolerantly.
- `scripts/competitor-check/main.ts`: the API is streamed (`stream(…).finalMessage()`).
- `supabase/migrations/20261050_competitor_check_5.sql`: new, NOT RUN, optional.
- `scripts/competitor-check-1.cjs`: the new section 19.

## 5 · The harness

`npx tsc --noEmit -p .`: **clean.** `node scripts/competitor-check-1.cjs`: **✅ 210 passed, 0 failed** (192 before, 18 new).
All earlier checks still pass, including the competitor-check-4 union guard (record_findings still has 2 union parameters).

**Section 19:**
- **A 45-feature deep check** completes across 5 `record_findings` calls (prices and terms, then 4 groups of at most 12):
  - all 45 features and the price are found, quote-checked and marked checked;
  - the message lists the groups, and the system prompt asks for `more`.
- **`max_tokens`:**
  - 128,000 on every request by default; 64,000 when the setting names the model; bad setting entries are ignored;
  - the pass's batch params also carry 128,000, while its bound still keeps 3 pages under 100,000 tokens.
- **A `max_tokens` stop** is continued:
  - the complete call is recorded, and the unfinished call is answered "not recorded" along with the continue
    instruction;
  - the findings merge without duplicates, because the repeated price is stored once.
- **Past the continuation limit:**
  - the 3 complete calls' findings are kept, written and verified;
  - the competitor is reported as failed with the reason, is not marked checked, and the run exits 1;
  - the run's cost equals every response received, cut-off answers and verifier calls included.
- **Failed calls cost:**
  - a competitor whose `record_findings` is malformed twice: both calls are in the run's cost;
  - an API error on the second call: the first call's cost still counts;
  - two failing checks at $0.44 each stop at a $0.30 daily cap after the first.
- **Quotes:**
  - a 300+-character quote is cut to an exact prefix of at most 200 characters, still found on the page, while a made-up
    one still is not;
  - the prompt asks for the short quote.
- **`quote_en`:**
  - "" is accepted and stored as null; a repeat of an English quote is dropped; a German quote keeps its translation;
  - a quoted finding still needs its quote and URL.
- **`mergeRecorded`** leaves out repeats.

## 6 · Read-only SQL used

None.

## 7 · Your steps

1. *(Optional)* Run the SQL in §3. Without it, the code uses the same 128,000 defaults.
2. **Deploy.**
3. **Actions › Competitor check › Run workflow** with mode `single`, competitor `gastro25`, dry_run `true`.
   - Expect a `gastro25 … finding(s) · $x.xxx` line with a cost above zero.
   - If the answer is still cut off, the log says `INCOMPLETE — … finding(s) from its complete calls kept`, with its cost.
   - A dry run writes nothing either way.

**Worth watching on that run.** The deep check now takes a few more turns (one per group), against the per-competitor time
limit of 10 minutes. If gastro25 reports "took longer than 600 s", tell me, and I will raise that limit.

## Undo (only if Dominic asks)

To undo the code, revert the files in §4. The database change only matters if §3 was run:

```sql
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_max_output_tokens_chk;
alter table public.competitor_check_settings drop column if exists max_output_tokens;
```
