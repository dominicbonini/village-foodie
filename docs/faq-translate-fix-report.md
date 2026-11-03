# faq-translate-fix: the FAQ translator's model call, made to work

*2 November 2026. **Done**, committed on `main`, not pushed. The workflow runs from GitHub's `main`, so push first (see "What to click").*

## The failure, and the cause

**What happened:** on the 2 November run (`dry_run = false`), the sign-in worked, but every call came back 400: *`tool_choice: type "tool" and "any" are not supported for this model`*. The run ended "0 translated · $0.0000", exit 1.

**The cause:** the translator forced its tool with `tool_choice: { type: 'tool', name: 'save_translations' }` (`scripts/faq-translate/main.ts`, the old line 136). Claude Sonnet 5.5 refuses a forced tool choice. The competitor checker never forces one, which is why it works.

**Why every question failed separately:** the run treated each 400 as one question's failure and carried on, so all 29 failed one by one.

## What changed

### 1 · The call is the checker's, reused (DRY)

`lib/faq/translator.ts` **`modelCall(api, prices)`** runs the competitor checker's own conversation, `converse` from `lib/competitor-check/checker.ts`, imported rather than copied, with the translator's tool:
- **no `tool_choice`** (the default, auto);
- **one strict client tool**, as the checker's `record_findings` is: `strict: true`, every property required, `additionalProperties: false`. The API holds the model to the schema;
- **the tool's input validated** by `validateTranslations`: an object with a `translations` array of entries, each with a real locale and text fields, stray keys dropped. A malformed call is sent back once with the reason ("Rejected — fix these and call save_translations again: …");
- **a reply that ends without calling the tool is nudged once** ("Call save_translations now…"), and a reply cut off at `max_tokens` is continued, both exactly as for the checker;
- **the checker's parameters for this model family:** `output_config.effort` (`high`, nearest to the old call's default) and the server-side refusal fallback (`betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`). On a policy decline, the API re-runs the request on its fallback model.
- **cost:** every turn is priced from `competitor_check_settings.prices` (the same `costOf`) and recorded on the run.

**Only one line of the checker changed:** `converse` now declares that it needs only `api`, `meter` and `now`. It is a type change, and both checker harnesses pass unchanged (competitor-check-1 227/227, competitor-check-8 51/51).

**`scripts/faq-translate/main.ts`** passes `modelCall` one function. It calls the SDK's `anthropic.beta.messages.stream(params).finalMessage()`, exactly as `scripts/competitor-check/main.ts` does, with the same keyless Workload Identity Federation login, still checked only when there is something to translate.

**What stays the same:**
- **The model:** `claude-sonnet-5-5`.
- **The output shape:** `{ locale, question, answer, answer_single_plan, title }`. A strict schema has no optional property, so a field that does not apply now comes back as `""`, and the system prompt says so. `rowsFromReply` already reads `""` as null, so the stored rows are exactly as before.
- **Every rejection check, untouched** (`lib/faq/translation.ts` `itemProblem` / `titleProblem`, in `rowsFromReply`): every `{token}` kept, no typed digits, currency symbols or plan names, no paying-at-the-truck wording, a sane length; a base not returned is stored "failed"; de-CH is derived from de-DE.
- **The prompt caching** of every locale's words.

The checker's method expresses this shape without any compromise, so no fallback option was needed.

### 2 · `limit`

- **A new `workflow_dispatch` input, `limit`.** It defaults to blank, which means everything. It reaches the script as an environment variable, and becomes `--limit N` only when set.
- **What it counts:** **translations**, meaning one question (or section title) into one language, in order. `limit = 1` translates **one question into one language**: the first question into the first language base, French. The rest wait for the next run, which the log says in one line.
- **One related change:** questions are now queued before section titles, so `limit = 1` is a question even while titles still need translating too. A full run does both, so the order changes nothing else.

### 3 · A 400 that fails the same way every time stops the run

`isInvalidRequest` recognises a 400 whose error type is `invalid_request_error`. The run stops after the **first** such call, with **one line**:

> `STOPPED: the API refused the request (400 invalid_request_error), so every call would fail the same way — nothing more is sent this run: <the API's message>`

The script then exits 1 ("Stopped: the API refused the request (see the STOPPED line above)."). Any other failure (a 529 overloaded, a timeout) is still logged for that question, which is retried next run while the run goes on.

## Proof

**`scripts/faq-translate-fix.cjs`** (in `harnesses.json`): **42/42**, with no live call.
- **The recorded response** is `scripts/fixtures/faq-translate-fix-reply.json`: one Messages API message in the shape of the checker's fixtures, a client `tool_use` of `save_translations`, hand-built.
- **It runs end to end** through the real `runTranslator` → `modelCall` → the checker's `converse`.

It proves:
1. **The request:**
   - no `tool_choice` anywhere;
   - one strict tool, every property required, the same five fields;
   - `claude-sonnet-5-5`;
   - the cached locale words;
   - the checker's effort and fallback parameters, sent by `converse` itself.
2. **The reply becomes rows:**
   - de-DE, fr-FR, ja-JP and ar-AE are ok, with `""` read as null;
   - each broken entry fails with its existing check's reason: es-ES (a token dropped), it-IT (paying at the truck), nl-NL (a typed figure), pl-PL (far too short);
   - the bases not returned fail "not returned by the model";
   - the cost is the settings' Sonnet price × the reply's usage, in the report and the log line.
3. **The checker's conversation:** a reply without the tool call is nudged once, then accepted, and both turns are paid for. A malformed call is answered "Rejected — fix these…" and the fixed one is accepted.
4. **`limit`:**
   - 1 → one call, one locale asked, one row, and the remainder in one log line;
   - 1 with section titles pending is still one question;
   - 5 → five locales in one call;
   - blank → every question.
5. **The 400:**
   - three refused calls queued, one sent;
   - one STOPPED line with the API's message, no "model call FAILED" lines, nothing written, non-zero exit;
   - a 529 overloaded is not treated as a refusal: that question is retried next run and the others go ahead.
6. **The workflow and script:** the `limit` input (blank default) and how it's passed; `--limit` validated; no `tool_choice` left in the code; `converse` imported, not copied; the beta stream call; the keyless login.

**Re-pinned:** faq-2 §7 read the prompt-cache marker in `main.ts`, and it moved with the call into `lib/faq/translator.ts`. One named check; faq-2 is 142/142. faq-2 §7's dry run of the real script (bundled, against fixtures) still passes.

## Sweep

`node scripts/run-harnesses.cjs`, all **184** listed harnesses: **179 pass, 5 fail. All 5 also fail at HEAD, on the same check:**

| Harness | The failing check (the same at HEAD) |
|---|---|
| schedule-graphics-places | "…and the Feature gates the tab, the pane, the shortcut and both routes — and nothing else" (1) |
| canada-1 | 1 check (as at HEAD) |
| europe-languages-1 | de-CH: no "ß" anywhere (1) |
| world-countries-1 | 1 check (as at HEAD) |
| world-countries-2 | stops at "Terms edit — expected once, found 0: Last updated: 20 October 2026" (its own baseline) |

**No failure is new.** `tsc --noEmit` is clean, and eslint is clean on every changed file.

## What to click in GitHub

0. **Push `main` first** (`git push`), since I commit only. The workflow runs whatever is on GitHub's `main`.
1. **A test run with `limit = 1`:**
   1. Go to **github.com/dominicbonini/village-foodie** → **Actions**, then **FAQ translate** in the left-hand list.
   2. Click **Run workflow** (the grey button, top right of the runs list).
   3. Set: **Use workflow from:** `Branch: main` · **dry_run:** `false` · **max_usd:** `2` · **limit:** `1`.
   4. Click the green **Run workflow**.
   5. When it finishes, open the run → the **translate** job → the **Translate** step. Expect:
      - `29 to translate (…)`;
      - one line for the first question, ending `1 ok · $0.0…`;
      - `--limit 1: … translation(s) left for the next run`;
      - `Done: 1 translated · 1 rows ok · 0 failed …`;
      - a green tick.

   If it shows a `STOPPED:` line instead, that line is the API's whole answer. Send it to me; nothing else was spent.
2. **The full run:** the same steps, with **limit** left **blank**, **dry_run** `false` and **max_usd** `2`.
   - It translates until the $2 cap. The earlier estimate was about two runs for all 29 (24 questions, 5 section titles).
   - The hourly timer (:25) finishes whatever is left, or you can run it again by hand.
   - Admin › FAQ moves from "Translating" to "✓ Translations n/28" as the questions are covered.

## To know

- **The server-side fallback** is the checker's setting for the Sonnet family, so it's what this proves and sends. The checker's own runs work, but this repository can't show which model those used. If the API refused that parameter for this account, the `limit = 1` run would end on one `STOPPED:` line naming it, at no cost, and dropping it would be a one-line change.
- **No model change.**
- **No database change.**
- **The spend cap is unchanged** ($2 default).

## Files

- **Changed:**
  - `lib/faq/translator.ts` (strict tool, `validateTranslations`, `modelCall`, `isInvalidRequest`, `limit` as translations, questions first, the STOPPED line)
  - `scripts/faq-translate/main.ts` (the call through `modelCall` over the beta stream; `--limit`; exit on STOPPED)
  - `lib/competitor-check/checker.ts` (`converse`'s parameter type only)
  - `.github/workflows/faq-translate.yml` (the `limit` input)
  - `scripts/faq-2.cjs` (one re-pin)
  - `scripts/harnesses.json`
- **New:**
  - `scripts/faq-translate-fix.cjs`
  - `scripts/fixtures/faq-translate-fix-reply.json`
  - this report
