# competitor-check-7 — report

**30 October 2026.** Written for Dominic.

- Nothing was committed, pushed or deployed.
- No database change was run. One migration is written as NOT RUN SQL (§3), and no read-only SQL was used.
- **No real Claude API call was made:** every proof uses fixtures.
- No `.env*` file was opened, and no `outreach_templates` row was touched.

**Nothing in the brief arrived garbled, and I found no instruction that contradicts another.**

## 1 · The causes

### The `ü` in the quote

**The model wrote it.** The six characters `ü` were already in the `record_findings` input the model produced: it
double-escaped "ü" in its tool call. Every other link in the chain was ruled out:
- **The SDK:** since competitor-check-5, answers are streamed, and the SDK rebuilds a tool's input from the streamed JSON
  with its own parser (`_vendor/partial-json-parser`), which ends in `JSON.parse`. Run on the installed SDK (1.3.0), the
  buffer `"Keine Einrichtungsgebühr…"` comes out as "Keine Einrichtungsgebühr…" — a real ü. Only a buffer the model
  wrote as `Geb\\u00fchr` keeps the backslash.
- **Our code:** the quote goes from the tool input to `rowsFrom` to the stored row as the same string, never serialised
  on the way.
- **The log:** the only `JSON.stringify` in that path is the dry-run log, and it prints "ü" as "ü", not as an escape.

So the stored quote really held `Gebühr`. The page held "Gebühr", and the quote check, rightly, found no exact match.

**The fix, at the source we control:** the moment the model's answer arrives.
- `fromWireFinding`, `fromWireFindings` and `fromWireVerdict` (`lib/competitor-check/model.ts`) now decode `\uXXXX` escapes
  and HTML entities in the free text:
  - on a finding: `quote`, `quote_en`, `found_value`, `note`, `plan_name`, and the run's `notes`;
  - on the verifier's answer: `value`, `quote`, `quote_en`.
- Quotes are therefore **stored as real characters**. Codes and URLs are left as they are.
- Both system prompts now say: write every letter as itself (ü, ß, ř, ł, é), never as a `\u` escape or an HTML entity.

### The empty second check reported as "disagreed"

- The old rule was "confirmed with a quote on its page, else **disagreed**". So "not found", an unreadable page, and the
  competitor-check-4 sentinels (`""`, which become null) all became "disagreed".
- The 30 Oct finding was exactly this: the verifier returned no value and no quote, and it was stored as "disagreed" with
  `second_value` and `second_quote` both null.
- The sentinel mapping itself is right: `""` becomes null, as before. The fault was the rule that read the nulls.

## 2 · The fixes

### The quote check

`normaliseForQuote` in `lib/competitor-check/core.ts` is applied **to the quote and to the page alike**, in this order:
1. **Decode** (`decodeEscapes`), repeated while it changes something, at most three times, so a double-encoded
   `&amp;uuml;` also works:
   - `\uXXXX` escapes, with any number of backslashes, and surrogate pairs joined;
   - named HTML entities, both the common ones (`&uuml; &szlig; &eacute; &nbsp; &shy; &ndash; &bdquo; …`) and every
     letter-plus-mark form (`&rcaron; &ccaron; &eogon; &uring; &ouml; …`), plus `&lstrok;`;
   - decimal and hex character references (`&#252;`, `&#xFC;`).
2. **Compose** the Unicode with **NFKC**:
   - This includes NFC's composition, so "u" plus a combining diaeresis becomes "ü".
   - It also folds compatibility forms, which the check already did before this change.
   - I kept NFKC rather than switching to plain NFC, because NFC alone would stop folding those compatibility forms on
     both sides.
3. **Drop soft hyphens**, which German pages put inside long words.
4. **Normalise** whitespace, non-breaking spaces, quote marks and dashes, and lower-case everything.

After that, the quote must still be found **exactly**.
- "Einrichtungsgebuhr", or the spelled-out "Einrichtungsgebuehr", does not match "Einrichtungsgebühr".
- A changed price does not match.
- Ordinary text is untouched: "Fish & Chips", "R&D", a Windows path, an unknown `&foo;`.

### The second check's verdict

`secondVerdict` in `lib/competitor-check/checker.ts` decides it:

| The verifier answers | Stored `second_check` |
|---|---|
| `confirmed`, its quote found on the page it fetched | `confirmed` |
| `disagreed`, a **different** value **and** its own quote found on its page | `disagreed` |
| anything else: not found, no value, no quote (the `""` sentinels), its quote not on its page, the same value as claimed, or the verifier failed | **`unclear`** (new) |

- **Admin › Automatic checks** (`components/admin/AutomaticChecks.tsx`):
  - `unclear` shows the amber **"Couldn't confirm"** with "The second check couldn't find the value";
  - `disagreed` now has its own red **"Disagrees"** badge, with "Second check found: …" and its quote;
  - a quote not found on the page still reads "Couldn't confirm · Quote not found on the page".
  - Before this change, a real disagreement was also shown as "Couldn't confirm".
- **An unclear finding still goes to review.** Only confirmed, unchanged findings with their quote found skip review, as
  before.
- **The database** needs the new value: see §3.
  - Until the migration runs, the store writes a refused `unclear` as `not_run`, never as `disagreed`.
  - A dry run writes nothing, so it shows `unclear` either way.

## 3 · Database (NOT RUN)

`supabase/migrations/20261051_competitor_check_7.sql`. The CHECK was declared inline, so the migration drops it by its real
name, whatever that is.

```sql
begin;
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.competitor_check_findings'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%second_check%'
  loop
    execute format('alter table public.competitor_check_findings drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.competitor_check_findings add constraint competitor_check_findings_second_check_check
  check (second_check in ('confirmed', 'disagreed', 'unclear', 'not_run'));
commit;
```

## 4 · Files changed

- `lib/competitor-check/core.ts`: `decodeEscapes`, and the stronger `normaliseForQuote`.
- `lib/competitor-check/model.ts`:
  - the free text is decoded as it arrives (`DECODED_TEXT_FIELDS`, `fromWire*`);
  - the verifier's `value`, `quote` and `quote_en` are decoded too.
- `lib/competitor-check/prompts.ts`:
  - both system prompts: "every letter as itself";
  - the verifier: "not_found" when it can't find or read the value, "disagreed" only for a different value with its quote.
- `lib/competitor-check/checker.ts`: the `SecondCheck` type with `unclear`, `secondVerdict`, and a failed verifier recorded
  as `unclear`.
- `lib/competitor-check/store-supabase.ts`: `unclearRefused`; before the migration, a refused `unclear` is written as
  `not_run`.
- `components/admin/AutomaticChecks.tsx`: "Disagrees" (red) is now separate from "Couldn't confirm" (amber).
- `supabase/migrations/20261051_competitor_check_7.sql`: new, NOT RUN.
- `scripts/competitor-check-1.cjs`:
  - the new section 20;
  - one earlier render check updated: the real disagreement in that fixture now reads "Disagrees", not "Couldn't confirm".

## 5 · The harness

`npx tsc --noEmit -p .`: **clean.** `node scripts/competitor-check-1.cjs`: **✅ 227 passed, 0 failed** (210 before, 17 new).

**Section 20:**
- **The languages tested:**
  - German: "Keine Einrichtungsgebühr, keine Mindestlaufzeit. Straßenverkauf möglich.";
  - Czech: ř č ě ž í;
  - Polish: ł ę ś;
  - French: é à and a curly apostrophe.
- **Each language's quote passes against:**
  - a page with the real letters;
  - a page using HTML entities: named, decimal and hex;
  - decomposed (NFD) letters, on either side.
- **Escaped quotes:**
  - an escaped quote (`Gebühr`) is decoded before the check, against real letters and against entities;
  - it is still an exact match: a different letter, a spelled-out umlaut or a changed number fails;
  - soft hyphens, double-encoded entities and curly quotes are normalised;
  - ordinary text is untouched, and an escaped emoji's surrogate pair is joined.
- **Stored as real characters:**
  - an escaped or entity-encoded answer is stored with real letters (quote, plan name, found value, note, notes), even
    when double-escaped;
  - through a whole run, a model writing `Gäste` gets "Gäste" stored, with `quote_in_page` true;
  - the prompt asks for real letters.
- **The verdict:**
  - an empty verifier answer is **`unclear`**, never `disagreed`: not found, `""` value and quote, no quote, its quote
    not on its page, the same value, or a confirmation without a quote;
  - a real different value with its own quote is **`disagreed`**, and a quoted confirmation is `confirmed`.
- **In a run:**
  - the 30 Oct answer (disagreed, no value, no quote) is stored `unclear`, with nothing invented;
  - a failing verifier gives `unclear`;
  - a real disagreement (49 € claimed, 29 € on the page) stays `disagreed`, with its value and quote;
  - unclear findings still go to review.
- **Admin:** `unclear` reads "Couldn't confirm", and only `disagreed` reads "Disagrees".
- **Before the migration:** a refused `unclear` is written as `not_run`, never `disagreed`.

## 6 · Read-only SQL used

None.

## 7 · Your steps

1. *(Recommended)* Run the SQL in §3. Without it, a real (non-dry) run stores `unclear` as `not_run`.
2. **Deploy.**
3. **Actions › Competitor check › Run workflow** with mode `single`, competitor `gastro25`, dry_run `true`.
4. **In the log, count two numbers and tell me:**
   - the findings with `"quote_in_page": false`;
   - the findings with `"second_check": "disagreed"`.

   The dry run prints every finding as JSON. On the downloaded log, these count them:
   ```
   grep -c '"quote_in_page": false' log.txt
   grep -c '"second_check": "disagreed"' log.txt
   ```
   `grep -c '"second_check": "unclear"' log.txt` shows how many the second check couldn't settle.

## Undo (only if Dominic asks)

To undo the code, revert the files in §4. The database change only matters if §3 was run:

```sql
begin;
update public.competitor_check_findings set second_check = 'not_run' where second_check = 'unclear';
alter table public.competitor_check_findings drop constraint if exists competitor_check_findings_second_check_check;
alter table public.competitor_check_findings add constraint competitor_check_findings_second_check_check
  check (second_check in ('confirmed', 'disagreed', 'not_run'));
commit;
```
