# competitor-check-4 — report

**30 October 2026.** Written for Dominic.

- Nothing was committed, pushed or deployed.
- No database change was run, and none is needed. Only the two read-only queries in §6 were used.
- **No real Claude API call was made:** every proof uses fixtures.
- No `.env*` file was opened, and no `outreach_templates` row was touched.

**Nothing in the brief arrived garbled, and I found no instruction that contradicts another.**

## 1 · The cause

`record_findings` is the tool every check answers with: the deep, routine and quick-pass checks and the classification read. Its
schema had **17 parameters with unions**:
- 16 nullable fields on each finding, each written as `anyOf: [string|number, null]`;
- the nullable top-level `notes`.

In strict mode the API allows at most 16. So every request carrying the tool was refused before the model ran, with
`400 invalid_request_error … 17 parameters with type arrays or anyOf … limit: 16`.

The read-only queries (§6) show the effect:
- the deep/schedule run of **30 Oct 08:33** checked 0 competitors for $0, with stopped_reason `error` and
  "Every competitor in this run failed (15)";
- the same run submitted pass batch **msgbatch_01Jb6Zv1SGfDfDEsQPh49oqp** (40 items, estimated $1.80) with the same schema,
  so every item in it will come back errored;
- no competitor has a `pass_state` yet, so nothing was wrongly marked as passed.

## 2 · The schemas: union counts before and after

These are the only schemas the checker sends. A grep found no other `input_schema` and no `output_config.format`. The
harness also checks this by collecting the tools from every request a deep, routine, pass, classification and verifier
run actually sends.

| Schema | Used by | Before | After |
|---|---|---|---|
| `record_findings` | the deep, routine and quick-pass checks, and the classification read | **17** | **2** (`amount`, `percent`) |
| `record_verdict` | the verifier (second check) | 3 | **0** |

Strict mode stays on for both tools, and every property is still required.

**The sentinels** (`lib/competitor-check/model.ts`):
- **Text fields** are a plain string, and `""` means "does not apply":
  - on a finding: `plan_name`, `country_code`, `found_value`, `currency`, `feature_key`, `note`, `url`, `quote`,
    `quote_en`, `source_url`;
  - the top-level `notes`;
  - on the verdict: `value`, `quote`, `quote_en`.
- **Choice fields** take an enum with `"none"` added, and `"none"` means "does not apply": `period`, `vat`, `feature`,
  `classification`.
- **`amount` and `percent`** stay nullable numbers. A number has no safe sentinel, since 0 is a real price or percentage.
- The tool descriptions tell the model to write `""` or `"none"` for anything that does not apply.

**The reading code** converts the answer before any check runs:
- `fromWireFindings` and `fromWireVerdict` turn every `""` and `"none"` back into `null`;
- `validateRecordFindings` and `validateRecordVerdict` call them first, then run every existing check unchanged on the
  converted value.

Everything downstream therefore sees exactly the nulls it saw before: the quote check, the second check, the rows written
and the overview. An answer that still sends `null`, such as an old fixture, is accepted as before. `"none"` is never
stored: a missing VAT basis stays `null`, not `"none"`.

## 3 · Recovering the batch

`lib/competitor-check/pass.ts` (`collectBatch`):
- **An item that errored, expired or was cancelled** is reported as failed, with the API's own message, for example
  `batch item errored (invalid_request_error: Schemas contains too many parameters …) — sent again in the next share`.
- **It is not marked passed** in `pass_state`, so it stays pending and goes into the next share.
- **If every item failed**, the run ends with stopped_reason `error`, so the job exits non-zero.
- **A batch where only some items failed** marks the good ones passed and ends `done`.
- **Cost** comes only from the usage of the messages that succeeded, so a rejected item costs $0.

`lib/competitor-check/checker.ts`: in the nightly job, **only a failed login now stops the remaining shares.**
- Before, an all-failed pass batch would also have stopped that night's deep and routine checks.
- Now the night shows a red cross for the pass, and the deep and routine shares still run.

**What happens to msgbatch_01Jb6Zv1SGfDfDEsQPh49oqp after the deploy.** On the first run, the pass:
1. collects it: all 40 items errored, recorded with the API's message, $0;
2. clears it, leaving those 40 still pending;
3. submits the next share, the same 40, now with the fixed schema;
4. ends `error` because the collected batch failed completely, so **expect one red cross** on that run;
5. lets the deep and routine shares run as normal.

## 4 · Files changed

- `lib/competitor-check/model.ts`: the sentinel schemas, `NONE`, `EMPTY_TEXT_FIELDS`, `NONE_CHOICE_FIELDS`,
  `fromWireFinding`, `fromWireFindings`, `fromWireVerdict`; both validators convert first.
- `lib/competitor-check/pass.ts`: an errored batch item keeps the API's error type and message; the batch API's result
  type includes `error`.
- `lib/competitor-check/checker.ts`: only a failed login stops the night's other shares.
- `scripts/competitor-check-1.cjs`: the new section 18 (the guard).

## 5 · The harness

`npx tsc --noEmit -p .`: **clean.** `node scripts/competitor-check-1.cjs`: **✅ 192 passed, 0 failed** (180 before, 12 new).

**Section 18, the guard:**
- **The union count**, made recursively through `properties`, `items` and `anyOf`, over every tool schema actually sent by a
  deep, routine, quick-pass, classification and verifier run:
  - `{"record_findings":2,"record_verdict":0}`; each must be ≤ 12;
  - every request carries the same schema per tool;
  - the old schema counts 17, the API's own number, so the guard would have caught it;
  - strict mode is on and every property is required.
- **The sentinel round-trip:**
  - a finding sent with `""` and `"none"` validates to exactly the same value as the null form;
  - a verdict with `""` maps to nulls;
  - a whole check whose model answers with sentinels stores **byte-identical findings** to one answering with nulls.
- **Batch recovery:**
  - in an all-errored batch, each item is failed with the API's message, none is passed, no finding is stored, $0 is
    recorded, stopped_reason is `error`, and the exit code is 1;
  - the errored items stay pending and are resubmitted, with the fixed schema;
  - in a batch with some errored items, the good one is passed, the bad one stays pending, and the exit is 0;
  - in the nightly job, the all-errored batch gives exit 1, and the deep share still runs.

## 6 · Read-only SQL used

```sql
select mode, trigger, started_at, finished_at, competitors_checked, cost_usd, stopped_reason, left(notes, 300) as notes from public.competitor_check_runs order by started_at desc limit 6;
```

```sql
select pass_requested_at, pass_country, pass_per_day, pass_batch->>'id' as batch_id, pass_batch->>'submittedAt' as submitted_at, jsonb_array_length(coalesce(pass_batch->'items', '[]'::jsonb)) as batch_items, (pass_batch->>'estimateUsd')::numeric as estimate_usd, (select count(*) from public.competitors where pass_state <> '{}'::jsonb) as competitors_with_pass_state from public.competitor_check_settings;
```

There is no NOT RUN SQL: this fix needs no database change.

## 7 · Your steps

1. **Deploy.**
2. **Actions › Competitor check › Run workflow** with mode `single`, competitor `gastro25`, and dry_run `true` to confirm. The
   run should check the competitor without the 400.
3. **Let the nightly run continue.**
   - Its first run collects the old batch, all errored at $0, and shows **one red cross**.
   - It then resubmits the same 40 items with the fixed schema, and the deep and routine shares run as normal.
   - The run after that collects the new batch.

## Undo (only if Dominic asks)

There is no database change to undo. To undo the code, revert the four files in §4.
