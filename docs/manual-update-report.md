# Manual update pass — 8 September 2026

**Documentation pass only.** The only two files changed are `docs/reference-manual.md` (V12.3 → **V12.4**) and `docs/scraper-reference-manual.md` (V1.1 → **V1.2**). No code touched. **No database row inserted, updated or deleted** — every call was a `select`, a `count(head:true)`, or a `spreadsheets.readonly` read. Nothing staged, committed, pushed; `git add` not run in any form.

**Evidence classes used throughout, as the manuals require:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified · UNREAD/OPEN carried forward.

**No span of the prompt arrived garbled. No instruction contradicted another.** Two of the *facts* supplied in the instructions did not match the database; both are recorded as discrepancies rather than written in as done — §4.

---

## 1. WHAT CHANGED, BY INSTRUCTION ITEM

### A — the thirteen stale pointers and the load-bearing §3.2 correction (scraper manual)

Every reference from `docs/sheet-migration-audit-report.md` §9 was re-checked against the report before writing, and each correction shows what the line **used to say**:

| Manual location | Was | Now |
|---|---|---|
| Data-path diagram | `← 2 of 3 NOT AWAITED`, mirrors at `:1540/:1568/:1616` | `← ALL FOUR AWAITED (V1.2)`, `:792/:1673/:1708/:1833` |
| §2.4 heading | "The three Supabase mirrors" | "The **FOUR** Supabase mirrors" — `excluded_terms` was missing entirely |
| §3.1 reads | `:422-427` | `:436-440` (calls), `:390-396` (function), `:453-509` (columns) |
| §3.1 writes | `:1550`, `:1530`, `:1607`, `:672` | `:1689`, `:1663`, `:1798`, `:784` |
| §3.3 dedup row | Events tab, no line | `:466-472`, plus the FUTURE-ONLY flag |
| §3.3 aliases row | cols 17/15/14 "not from the database" | qualified — DB copies are complete for three of four; only `schedule_url` (26/109) is short |
| §4.3 truck match | `:762-792` | `:871` region — the old range is now the *exclusion write* |
| §4.5 dedup | `:881` | `:988-992` |
| §4.8 exclusions | `:430`, `:744`, `:688` | `:453`, `:851`, `:792` |
| §5.4 `excluded_terms` | 🔴 UNREAD | resolved — and broken; pointer to new §5.6 |
| §7.3 | "which the app's manage route also reads" | corrected — it is a *different* per-`truck_id` feature, not one shared set |
| UNREAD list — the Sheet | "uncountable from the repository" | resolved: ten tabs, 152/933/713/146 |
| UNREAD list — Apps Script | "whether it creates venues is unread" | resolved: it writes `discovery_events` **and** creates `venues`; its code stays UNREAD |
| §2.5 row shape | `:1556-1566` | `:1696-1706` |

🔴 **The §3.2 correction was treated as the headline, because the manual taught the wrong lesson from a real event.** The section is rewritten to lead with the correction: *"Two of the three DB mirrors are not awaited"* is **false** — 🔎 all four are awaited. The three-month gap was real; its cause is the **345-venue divergence** from `onConflict: 'name'` against a `(name, village)` constraint. The manual now states plainly that **a write that is awaited and fails looks, from the Sheet's side, exactly like a write that was never awaited** — which is why the wrong mechanism got written down. The standing conclusion (trust the Sheet on venues) survives with a corrected justification.

⚠️ **Per the standing rule for this pass, the new numbers are marked as perishable.** §2.4 now carries: *"Line numbers re-read 8 September 2026. They move whenever the script is edited — the working tree already holds uncommitted changes to `run-scraper.js`. Treat them as a pointer to the right neighbourhood, not an address."* The same caveat is in the V1.2 changelog.

Also corrected as instructed: the Sheet has **ten** tabs (six Apps-Script/human), the dedup set is **future-only** because of the external pruner, `Manual Entry` is **emitted by the scraper** for `manual`/`manual_single` sites (`:983`) and is not a hand-entered row, and the Sheet is counted at **152/933/713/146**.

### B — new §8, "Deletion and retention" (scraper manual)

Built from `docs/deletion-rules-report.md` §7, which was written paste-ready. Six subsections: the six sweeps and their spellings (with the extensions listed, and the note that nothing was scoped by extension); the complete live FK table showing every inbound key is `ON DELETE SET NULL` and that `outreach_prospects` *blocks* a delete; the proof that no old-event or duplicate rule has ever run (**3,577 past rows, oldest 2026-05-22, flat by month**); the Sheet-side pruner; `pruneScraperRunLog` at `:1268-1274` as the only scheduled delete in the pipeline and **not** on these tables; and a correction to V1.1's `ignoreDuplicates` note.

🔴 **The Apps Script is recorded as load-bearing and unreadable**, in both the new §8.4 and the UNREAD list: it **writes `discovery_events` directly** and **creates `venues`** — so `run-scraper.js:1833` is not the only venue creator — and its predicate and schedule are UNREAD. ⚠️ Carried forward with the report's own limit: its Logs tab covers ~19 hours and rotates, **so it cannot prove the absence of anything.**

### C — `excluded_terms`, new §5.6 (scraper manual)

States the live shape (🧪 read from the live PostgREST schema, not a migration file): unique on **`(truck_id, term)`**, `truck_id` **NOT NULL**. The scraper supplies `{ term }` with `onConflict: 'term'` → **42P10** and **23502**; 🧪 **0 rows against 146 Sheet terms**.

🔴 **The opposite-failure-mode contrast is the section's spine**, in a table: `onConflict:'name'` kept the wrong row **invisibly** for three months and cost 345 divergent venues; this one is **refused outright** and errors **loudly** into `dbWriteFailures` (`:795`) — **and has been doing so since 4 June 2026, longer than the silent fault ran.** The manual now carries the rule that follows: **"It fails loudly" is only mitigation if someone reads the channel. Nobody read it. Do not cite loud failure as safety anywhere in this manual without naming the reader.**

⚠️ The section also corrects the intuition that a null `truck_id` would cause silent duplication — `NOT NULL` **refuses** the row rather than storing it; same family, opposite direction. The two-features-one-table conflict is recorded as **OPEN with no fix proposed**.

### D — pricing (app manual §4, §44, and the two schema records)

- 🧪 **"Gusto has `hide_pricing = true`, verified live" — false.** Gusto is `false`; **zero of ten trucks hold `true`**; the only one that ever did was `tikka-tonic`. Corrected in §44, in the §4 preamble, at the `trucks.hide_pricing` schema line, and at the tikka-tonic provisioning record (marked as state-at-provisioning, not today).
- 🧪 **"`NEXT_PUBLIC_PRICING_PUBLISHED` is TRUE in production" — false at the time**, which is why Gusto rendered TBC with `hide_pricing = false`; **since corrected, and Gusto now renders real prices.**
- 🔴 **Both were recorded as verified-live and both aged into falsehood**, and this is stated explicitly at both sites, with a new standing rule at §4: *"a verified-live claim is a claim about a moment, not a standing fact — date every live verification."* ⚠️ Plus the trap that makes re-checking impossible: the variable is Vercel type **`sensitive`**, i.e. **write-only, unreadable by API, CLI or dashboard, by anyone.**
- 🔴 **The footnote defect is recorded as still-open-but-DORMANT, not fixed.** 🔎 `f.number !== '2'` is still at `app/manage/[token]/page.tsx:11721`, its guard comment is in a different file, and 🧪 footnote 1 carries `1.4%`/`10p` unmasked while footnote 2 is the only one substituted. **It bites nobody only because nothing is suppressed; the next truck set to `true` re-arms it.**
- ✅ The **mechanism** is separately re-verified and marked correct (the AND at `lib/pricing.ts:34`, asymmetric defaults, one provider at `:659`, every consumer inside its subtree). ⚠️ Admin, landing and **`/compare` — publicly reachable with the real figures in its JS chunk** — render unmasked and call no mask.

⚠️ **One instruction pointer corrected rather than followed.** The item named "§44/§43/§4 — pricing", but **§43 is *Legal, email and domain***. The only pricing reference to §43 is a cross-reference at the `trucks.hide_pricing` schema entry, which is **stale**; it is now corrected to point at §4 (mechanism) and §44 (commercial model). Flagged rather than silently redirected.

### E — what moved in the data (both manuals)

Scraper manual: **new §9**, four subsections. App manual: a preamble block above §33, plus the changelog.

- 🧪 **`venues` 574 → 558.** 15 CERTAIN-tier merges, **16 losers** (set 1 dropped two), **125 events repointed to keepers**. 🔴 The repointing is recorded as **the proof it was a deliberate hand-run merge and not a deleter** — the FK is `ON DELETE SET NULL`, so a bare delete would have orphaned all 125. **PROBABLE tier and all four REFUSED sets recorded as NOT applied**, with set 16's unresolved conflict against a held 29.9 km correction carried forward.
- 🧪 **6 events removed** on the `offthebeatentruck.co.uk` / Saffron Walden double-assignment. ⚠️ **Attribution recorded as OPEN** — see §4 below.
- 🔴 **The tombstone link is written explicitly in both manuals**, at §4.5 and §9.2 of the scraper manual and in the app manual's §33 preamble and changelog: those six stay deleted **only because the Sheet remembers them and the Sheet is the dedup set**; **step 4 un-suppresses them**; a suppression table is a **precondition of that step, not a follow-up**.
- 🧪 **The PMF pack: 4 inserted, 5 REFUSED** by `ON CONFLICT DO NOTHING` nine seconds after a `URL:` scrape wrote the same key. **All nine exist; nothing was deleted.** The pack's own `00-verify-before.sql` would have caught it. ⚠️ Recorded as **correcting the migration audit's §10**.
- 🧪 **Real Thai Food** set public / `show_on_vf` true, **reversing the graduated-truck convention**, deliberately; **Tikka Tonic** left public. ⚠️ **Both rows also carry `excluded = true`**, which is a gate in its own right — **whether either truck actually reaches the public map was not verified. Recorded OPEN in both manuals.**

### F — the unlinked backlog (both manuals)

🧪 **2,237 of 4,301 `discovery_events` (52.0%) have `venue_id IS NULL`.** ⚠️ Recorded alongside the audit's earlier same-day figure of **2,219 of 4,283 (51.8%)** with the note that **both are correct for their moment and the ratio has not moved** — the table has since taken 18 new rows. Pass A writes with no `venue_id`; linking is an emit-only tool that runs only by hand, so **the backlog grows with every scrape**. The audit's breakdown (1,563 linkable now · 729 blocked on Sheet-only venues · 116 neither) is carried across, with the ordering constraint it implies.

🔴 **`updated_at` is recorded as unusable in both manuals** — 🧪 **zero of 4,301 rows have `updated_at ≠ created_at`, including the 125 repointed by today's merge.** Written at insert, never maintained; **it can date nothing and no feature may assume it does.**

---

## 2. VERSIONING

| Manual | Was | Now | Changelog entry |
|---|---|---|---|
| `docs/scraper-reference-manual.md` | V1.1 · 7 Sep 2026 | **V1.2 · 8 Sep 2026** | ✅ house style — delta paragraph, 🔴/⚠️/🧪 bullets, "STANDING LESSONS" close |
| `docs/reference-manual.md` | V12.3 | **V12.4 · 8 Sep 2026** | ✅ same |

⚠️ **The app manual's own standing rule — "the version number is updated in every place it appears" — was followed and checked:** 🧪 `grep -nE "V12\.4|Version 12\."` returns the running header at `:1` and the front matter at `:9`, in agreement. The precedent that rule records (front matter three releases behind the header) did not recur.

---

## 3. WHAT WAS CARRIED FORWARD AS UNRESOLVED, NOT TIDIED AWAY

Every item the source reports left open is still open in the manuals:

- 🔴 The Apps Script's code, triggers and Events-tab pruning predicate — **UNREAD**, and now flagged as load-bearing in three reports.
- 🔴 Whether a `pg_cron` job or a non-internal trigger exists that no migration records — **unreachable through PostgREST**; the two settling queries are written into §8.7.
- ⚠️ Whether RLS is enabled on the three discovery tables in production.
- 🔴 `excluded_terms`: the two-feature conflict — **OPEN, no fix proposed**.
- 🔴 The PROBABLE-tier merges, the four REFUSED sets, and set 16's clash with the held 29.9 km correction.
- ⚠️ Whether Real Thai Food and Tikka Tonic actually reach the public map given `excluded = true`.
- ⚠️ `venues_name_village_key`'s `NULLS NOT DISTINCT` status — still unread; `pg_indexes` is unreachable.
- ⚠️ Whether the 46 NULL-village venues are duplicates.
- 🔴 The footnote defect — **dormant, not fixed.**

**Where two reports disagreed, the manual says so rather than choosing** — see §4.

---

## 4. 🔴 TWO SUPPLIED FACTS THAT THE DATABASE DOES NOT SUPPORT

Both were checked read-only before writing, and **neither was written into the manuals as done.**

### 4.1 "4 Pimp My Fish manual/scrape duplicates deleted" — NOT PRESENT IN THE DATA

🧪 All four `Manual entry 2026-09-07` rows are live, with **`created_at = updated_at = 2026-09-07T10:52`** — so they have never been deleted and re-inserted — and 🧪 **all nine PMF future rows exist** (4 `Manual entry` + 5 `URL:`).

**Either that deletion was not applied, or it was applied against a different set.** Recorded in both manuals as **UNRESOLVED**, with the instruction *"do not assume the duplicates are gone."*

*If this evidence proved nothing:* a delete-then-reinsert would reset `created_at`, and a delete alone would leave the rows absent. Neither is observed. The only reading it cannot exclude is a deletion made **after** my read at 10:57Z.

### 4.2 The six deleted events — the fact holds, the attribution does not

🧪 The Sheet lists six rows the database does not: five at `Off The Beaten Truck - The Railway Arms` (Buffalo Joe's, Guerrilla Kitchen, Nomadough, Pizza Mondo, Tikka Tonic) and one at `Saffron Walden (The Common)` (Buffalo Joe's), all dated 2026-09-10. **The gap is real.** But 🧪 the surviving rows for those same trucks sit at `Off The Beaten Truck - The Common` with **`created_at 2026-09-06T10:24:56`, never modified** — so they predate the event and **a venue-string difference alone would produce the same gap.**

🔴 **This also corrects my own `docs/deletion-rules-report.md` §5**, which attributed those six to the Hatches-Up comparison. **That attribution is not proven.** Both manuals now record: **the gap is proven; its cause is OPEN.**

⚠️ **The tombstone consequence does not depend on the attribution** and is stated unconditionally in both manuals — whatever removed them, the Sheet is what is currently keeping them out.

---

## 5. STATE AT END

🧪 Read at 10:57Z: `discovery_events` **4,301** · `venues` **558** · `discovery_trucks` **231** · `excluded_terms` **0**. ⚠️ `discovery_events` was 4,283 earlier today; 🧪 **18 rows were created at 10:46Z** (10 `URL:`, 8 `Manual Entry`) — the pipeline ran during this session. **No deletion is visible in that delta.**

`git status --short` — **only the two manuals and this report are affected, and nothing is staged:**

```
 M docs/reference-manual.md
 M docs/manual-update-report.md     ← this file (it already existed; overwritten as instructed)
?? docs/scraper-reference-manual.md ← untracked: this manual has never been committed
```

**0 staged.** `HEAD = 801de1c`, `origin/main = 08ac368`, local ahead 1 with the previously-committed demo-layout change, still unpushed. **Nothing committed, pushed or added. No database row written. No code file changed.**
