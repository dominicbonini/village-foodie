# Task report — reference manual, five documentation edits · 2026-07-28

**TRANSIENT.** Overwritten every task. `docs/last-report.md` belongs to a separate workstream — not
read, not written, not opened.

**No code was changed.** No `next dev`, no `next build`, no SQL.
One file modified: `docs/reference-manual.md` (4421 → **4454 lines**). This report overwritten.

---

## 0. 🔴 ONE LOCATOR DID NOT MATCH — EDIT 5, and I did not invent a placement

**EDIT 5 asked me to "add a `## V9.2 — 28 July 2026` changelog entry above V9.1, and bump the title,
version line and footer to V9.2."**

**The manual is already at V9.2, and a V9.2 entry dated 28 July already exists** — I created both in the
previous task, which explicitly asked for the bump. Current state:

```
$ head -1 docs/reference-manual.md   →  HatchGrab Engineering Reference Manual · V9.2
$ tail -1 docs/reference-manual.md   →  HatchGrab Engineering Reference Manual · V9.2
$ grep -n "^## V9\." …               →  19: ## V9.2 — 28 July 2026
                                        45: ## V9.1 — 24 July 2026
```

**So applying EDIT 5 literally would have produced two `## V9.2` entries with the same date**, and a
version bump from V9.2 to V9.2.

**What I did instead — and why it is not an invented placement:** the content EDIT 5 lists (roll
deleted, order count scaled, copy object, `demo` block, admin-aware `canSetup`, `extraction_source`
reconciled, four new §35 invariants, landing Android) is **the same session, the same date and the same
version** as the existing entry. Most of it was genuinely missing from it, because the previous task
scoped that entry to the Android workstream. **I extended the existing V9.2 entry** rather than
duplicating the heading:

- Lead reworded: *"the 27–28 July Android workstream"* → *"the 27–28 July **Android + demo/onboarding** workstream"*.
- **Four new bullets** covering the roll deletion, the order-count scaling and stride collapse, the copy
  centralisation + `demo` block + `canSetup`, and the `extraction_source` reconciliation.
- **A status blockquote** closing the entry, as EDIT 5 asked: **VERIFIED LIVE** — the scraper fixes
  (rule-detection loop, day-of-week learner disabled, failure visibility); **BUILT BUT UNVERIFIED** —
  all the demo and signup work, and the Android work.
- **Corrected the invariant count** the previous entry states: *"Seven new §35 invariants"* → **"Eleven"**
  (and the bullet heading likewise), since EDIT 1 adds four. Leaving it would have made the changelog
  contradict the section.

**If you wanted a separate `V9.3` instead, that is the one decision I've left to you** — it is a heading
plus moving four bullets, and I'd rather you make it than have me split a single day's work across two
versions on my own initiative.

---

## 1. Prompt integrity — five garbled spans across the five sends

Each edit arrived as its own message; each lost a different span. All five were recoverable from context
within the same message, so none required cross-referencing this time.

| Edit | As received | Read as | Basis |
| --- | --- | --- | --- |
| 1 | *"right up until **signuorks in production is not evidence** that a migration exists"* | *"right up until **signup silently fell back to a blank upload. That something works in production is not evidence** that a migration exists"* | Two sentences collided: `signu` is the head of `signup`, `orks in production` the tail of `…works in production`. The onboarding spec's #16, which you sent intact yesterday, carries the identical sentence *"right up until signup silently fell back to a blank upload."* |
| 1 | *"renaming the row without renaming the **would have dropped**"* | *"without renaming the **KEY** would have dropped"* | The map is keyed on the row name; the sentence contrasts renaming the row with renaming its key. |
| 2 | *"a per-input fix **ave found** the link"* | *"a per-input fix **would never have** found the link"* | `ave` is the tail of `have`; the clause is the argument for container-level padding, so the missing modal is negative. |
| 3 | *"**A dem`, `slug` and `dashboard_token`** are three INDEPENDENT 130-bit values"* | *"**A demo's `id`, `slug` and `dashboard_token`**"* | `dem` + the backtick that closed `id`. Three values are named; the list needs a third. |
| 3 | *"`ble` (cross-platform, **documentedde as** the budget fallback"* | *"**documented in the code as** the budget fallback"* | `documented` + `de` from `code`. |
| 4 | *"`p-5`/`px-6` **scrollpear** throughout"* | *"`p-5`/`px-6` **scroll containers appear** throughout"* | `scroll` + `…pear` from `appear`. |

---

## 2. Sections changed

| § | Line(s) | Change |
| --- | --- | --- |
| **Changelog V9.2** | `:21`, `:23`, `:38–44` | Lead widened; invariant count 7 → 11; **four new bullets** + a status blockquote (EDIT 5, merged — see §0) |
| **§16** Database schema essentials | `:2958–2966` | **NEW** sub-block `### Live-schema facts — demo, deletion order + printing (V9.2 / 28 July 2026)`, five facts (EDIT 3) |
| **§27** Open backlog | `:4047`, `:4049` | Two items marked ✅ **DONE (28 July)** (EDIT 4) |
| **§27** Android / native | `:4084–4088` | **Five new items** appended (EDIT 4) |
| **§35** Cross-cutting invariants | `:4385` | **Second instance appended** to the `position: fixed` lesson (EDIT 2) |
| **§35** Cross-cutting invariants | `:4404–4411` | **Four new lessons** appended (EDIT 1) |

§35 now carries **17 bolded entries**. Garble sweep of the finished file for every corrupted fragment
(`signuorks`, `renaming the would`, ``A dem` ``, `documentedde`, `scrollpear`, `fix ave found`) returns
**none**.

### Locators that DID match

| Prompt reference | Found | Status |
| --- | --- | --- |
| §35 Cross-cutting engineering invariants | `:4370` | ✅ |
| §35 "position: fixed overlay" lesson | `:4383` | ✅ unique anchor |
| §16 live-schema facts | `:2947` (`## Live-schema facts — signup + schedule (V9 / 24 July 2026)`) | ✅ appended as a dated sibling sub-block rather than into the 24 July list, so the provenance of each set stays clear |
| §27 "Expose a `demo` block" backlog line | `:4036` | ✅ |
| §27 the roll's failure modes | `:4038` (`Customer order page never rolls an elapsed demo event`) | ✅ — the nearest match; see §3 |
| §12 / onboarding-spec O18 cross-references | n/a | ✅ cited, not edited (different file) |

---

## 3. ⚠️ Two judgement calls worth your eye

### 3.1 EDIT 4's "the demo event roll's failure modes" — nearest match, not an exact one

There is **no backlog line by that name.** The closest is `:4038`, *"Customer order page never rolls an
elapsed demo event — the demo's central surface goes dead until someone opens the dashboard"*, which is
the roll-related backlog item and is genuinely resolved by deleting the roll. I marked **that** line
DONE, with a note naming the deletion and pointing at the onboarding spec §10 Phase 2E.

**Flagging it because it is an interpretation**, not a literal match. If you meant a different line, say
which and I'll move the mark.

### 3.2 EDIT 1's fourth lesson overlaps an existing §35 entry

*"Deletion order is load-bearing wherever a foreign key is SET NULL rather than CASCADE"* covers ground
the existing **"Verify the cascade you actually depend on, not an adjacent one"** already touches — that
entry records `menu_items_db.category_id → menu_categories` as SET NULL and notes it makes `clearMenu`'s
delete order load-bearing.

I added the new lesson as instructed, and **cross-referenced the existing one inside it** (*"see 'Verify
the cascade you actually depend on' above, which found that relationship; this is the rule it
generalises to"*) so the two read as a discovery and its generalisation rather than as a duplicate. The
existing entry is unchanged.

---

## 4. What I could not do / did not do

- **Did not create a second `## V9.2` entry, and did not bump the version** — §0. The bump EDIT 5 asks
  for was already applied in the previous task. **The V9.3-vs-extend-V9.2 decision is left to you.**
- **Did not touch any file but `docs/reference-manual.md`** — no code, no `docs/android.md`, no
  `docs/onboarding-flow.md`. Note that §16's printing facts and §27's printing item cross-reference the
  onboarding spec's **O18**, which I wrote there in the previous task; the two agree.
- **Did not run `next dev` or `next build`, and changed no code.** Every code fact recorded here
  (`orders.event_id` SET NULL, `lib/printing/` containing only `createStubTransport`, the three
  independent 130-bit demo values, `ROW_FEATURE_MAP` being row-name-keyed) was verified by reading the
  tree during earlier tasks this session; nothing was re-derived from memory.
- **Did not sweep `app/manage/[token]/page.tsx` for the clipped-focus-ring class** — EDIT 4 explicitly
  records that sweep as not done, and that is now written into the backlog rather than implied.
- **Did not commit anything.** `docs/reference-manual.md` and `docs/android-report.md` are modified and
  unstaged, alongside the session's earlier unstaged work, the untracked
  `supabase/migrations/20260728_demo_sessions_extraction_source.sql`, and the staged deletion of
  `lib/demo-event-refresh.ts`.
