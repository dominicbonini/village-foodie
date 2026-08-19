# Provenance: was the card path's omission deliberate?

**READ ONLY. Nothing changed except this file.** No fix, no design, no proposal. `next dev` /
`next build` were not run. **This is history, read from `git log` and `docs/`.**

# 🔴 THE ANSWER: THE HISTORY IS SILENT ON INTENT — BUT THE TWO TERMS HAVE DIFFERENT STORIES, AND ONLY ONE IS CHRONOLOGICAL

| Term | Verdict |
|---|---|
| **The offline marker** | ✅ **CHRONOLOGICAL, ESTABLISHED.** It did not exist anywhere in the codebase when `promote-draft.ts` was written. It could not have been excluded, because there was nothing to exclude |
| 🔴 **Pre-order `force_pending`** | 🔴 **NOT CHRONOLOGICAL. It had existed for seven weeks, and it was in the very same file, in the very same commit, seven hundred lines away.** The history records no reason for it not travelling |

⚠️ **NO COMMIT MESSAGE, COMMENT OR REPORT ANYWHERE SAYS THE CARD PATH WAS CONSIDERED AND EXCLUDED. On
intent I must answer CANNOT DETERMINE.** ⚠️ **AND THAT IS NOT THE SAME AS "NO EVIDENCE":** §4 records a
file header that documents this exact divergence as a hazard that has already cost an order once.

---

## 1 · `git log -S` on each term

### The offline term — `vanOfflineNoAutoAccept`

```
f9c6972 | 2026-08-18 | offline updates
  app/api/orders/submit/route.ts
  docs/offline-protection-modes-build.md
```

🔴 **ONE COMMIT. `lib/payments/promote-draft.ts` IS NOT AMONG THE FILES.** ✅ **READ.**

**And that commit is not small — 26 files, +3,679 lines. Its full list:**

```
 app/api/dashboard/action/route.ts | app/api/dashboard/route.ts | app/api/heartbeat/route.ts
 app/api/manage/route.ts | app/api/orders/submit/route.ts | app/dashboard/[token]/page.tsx
 app/manage/[token]/page.tsx | components/dashboard/AddOrderPanel.tsx
 components/dashboard/CapacityBreachBanner.tsx | components/dashboard/DayLoadStrip.tsx
 lib/copy/offlineProtection.ts | lib/native/orderGate.ts
 supabase/functions/heartbeat-monitor/index.ts
 supabase/migrations/20260818_offline_protection_mode.sql | + 12 docs/*.md
```

⚠️ **`lib/payments/` IS NOT TOUCHED AT ALL BY IT** — not `promote-draft`, not `capture`, not one file in
that directory. **READ.**

### The marker column — `offline_no_autoaccept_until`

```
f9c6972 | 2026-08-18 | offline updates   ← the only commit touching CODE
acb13d1 | 2026-08-18 | offline fixes     ← docs only
6d97476 | 2026-08-18 | offline fix       ← docs only
cf26f1d | 2026-08-18 | ipad banner fix   ← docs only
2bf839f | 2026-08-18 | ipad fixes        ← docs only
```

🔴 **`promote-draft.ts` appears in NONE of them.** ✅ **READ.** **The whole marker mechanism is one day
old and one commit wide, and it never reached `lib/payments`.**

### The pre-order term — `anyForcesPending`

```
dbad192 | 2026-06-24 | V7.8 batch + session work: atomic order placement, pre-order label, …
  app/api/orders/submit/route.ts
  docs/reference-manual.md
```

**Introduced 24 June 2026, into submit, and nowhere else.** Later `-S "force_pending"` hits
(`6fd4b97` 11 Aug, `d38d9aa` 11 Aug, `6fdd9cd` 13 Aug, `f9c6972` 18 Aug) are **docs and other files** —
**none of them is `promote-draft.ts`.** ✅ **READ.**

## 2 · `git log --follow lib/payments/promote-draft.ts`

**The file's ENTIRE history — five commits:**

```
0cb2d2a | 2026-08-12 | payments                 ← CREATED (--diff-filter=A)
961ecd8 | 2026-08-12 | payment fix
d9cf8b5 | 2026-08-12 | another payment fix
ef1358f | 2026-08-12 | refund building
cba706f | 2026-08-13 | refunds
```

🔴 **COMMITS THAT CHANGED ITS `autoAccepted` EXPRESSION: EXACTLY ONE — `0cb2d2a`, the commit that created
the file.** (`git log --follow -S "autoAccepted = true" -- lib/payments/promote-draft.ts`.) ✅ **READ.**

⚠️ **SO THE EXPRESSION HAS NEVER BEEN EDITED SINCE THE DAY IT WAS WRITTEN.** Nothing narrowed it, nothing
widened it, nothing revisited it.

⚠️ **EVERY COMMIT MESSAGE ON THAT FILE HAS AN EMPTY BODY** — `payments`, `payment fix`, `another payment
fix`, `refund building`, `refunds`. **Checked with `--format='%b'`: all five empty.** **There is no commit
message anywhere that could carry a reason.** ✅ **READ.**

## 3 · 🔴 THE DECISIVE CHRONOLOGY — the two terms, at the moment the file was born

**`git show 0cb2d2a:app/api/orders/submit/route.ts` — what submit read THAT DAY:**

```
908:            truck.auto_accept && allItemsAutoAccept && !anyForcesPending
909-            && !((truck as any).notes_require_review !== false && orderHasNotes)
910-          ) {
911-            autoAccepted = true
```

**`git show 0cb2d2a:lib/payments/promote-draft.ts` — what was written in the SAME commit:**

```
247-          const notesRequireReview = (truck as { notes_require_review?: boolean }).notes_require_review !== false
248:          if (truck.auto_accept && allItemsAutoAccept && !(notesRequireReview && orderHasNotes)) {
249-            autoAccepted = true
```

🔴 **THREE OF THE FOUR TERMS TRAVELLED. ONE DID NOT.** `truck.auto_accept`, `allItemsAutoAccept` and the
notes-review term all crossed; **`!anyForcesPending` did not** — on the same day, in the same commit, in a
file the author had open, with the source condition seven hundred lines up. ✅ **READ.**

**And the offline term, on that same date:**

```
$ git log --until=2026-08-12 -S "offline_no_autoaccept_until" --format='%h %ad %s'
(no output)
```

✅ **IT DID NOT EXIST.** The concept was six days in the future. **READ.**

### What that settles, and what it does not

✅ **THE OFFLINE OMISSION IS CHRONOLOGICAL, NOT A DECISION.** A term written on 18 August could not have
been excluded from a file finished on 12 August, and the commit that added it never opened that file.
**This is the strongest statement history can make, and it is a clean one.**

🔴 **THE PRE-ORDER OMISSION IS NOT EXPLAINED BY CHRONOLOGY.** The term was seven weeks old and adjacent.
⚠️ **THAT IS NOT EVIDENCE OF A DECISION EITHER — you told me absence is not evidence, and I am holding to
it.** It removes the innocent explanation the offline term has; it does not supply a guilty one.
**CANNOT DETERMINE.**

## 4 · Every note in the repo about the divergence

**Searched `app lib components supabase docs` for:** `other auto-accept`, `second auto-accept`,
`two auto-accept`, `both auto-accept`, `auto-accept sites`, `auto-accept condition`. **And for `TODO`,
`FIXME`, `XXX` in both files: ZERO hits in either.**

🔴 **ONE REAL FIND, AND IT IS IMPORTANT ENOUGH TO QUOTE WHOLE — `lib/payments/capture.ts`, the file
header:**

```
// ── 🔴 THERE ARE TWO AUTO-ACCEPTS, AND THAT COST ONE ORDER ITS CAPTURE ──────────────────────────
// A PAY-AT-HATCH order is auto-accepted inside place_order_atomic, at app/api/orders/submit. A CARD
// order never reaches that code: its request returns at submit/route.ts:820 with a client secret, and
// the order is created later by lib/payments/promote-draft, which decides auto-accept itself. The first
// build of this file hooked only the first of those, so every auto-accepted CARD order was confirmed and
// never captured — the state this file exists to prevent. `promote_auto_accept` is that second site.
// ⚠️ SO THE TRIGGER LIST IS NOT DECORATION. It is how "which confirmations capture" is answerable by
// grep and by one audit query, instead of by reading two routes and inferring.
```

⚠️ **READ IT FOR WHAT IT SAYS AND NOT FOR WHAT WE WANT IT TO SAY.** It records that **two auto-accepts
exist**, that **the card path "decides auto-accept itself"**, and that **work applied to one and not the
other has already cost an order once**. 🔴 **IT SAYS NOTHING ABOUT THE OFFLINE OR PRE-ORDER TERMS**, and
it does not say either path was deliberately excluded from anything. **It documents the hazard, not a
decision about these two terms.**

**And the sibling note inside `promote-draft.ts` itself, already established, says the same thing from the
other side — again about CAPTURE, not about these terms:**

> *"That later phase arrived and hooked the OTHER auto-accept (place_order_atomic, on the pay-at-hatch
> path), not this one, so every auto-accepted card order was confirmed and never captured. Do not restore
> that sentence."*

⚠️ **SO THE REPO CONTAINS A WRITTEN WARNING ABOUT EXACTLY THIS FAILURE MODE, DATED BEFORE THE OFFLINE
WORK — and the offline work happened anyway.** ✅ **READ. That is a fact about the history, not an
inference about anyone's intent.**

## 5 · The reports — what was in scope

### `docs/offline-protection-modes-build.md` (added by `f9c6972`, 18 Aug)

**Its scope table, verbatim and entire:**

```
| File | What |
|---|---|
| 🔴 `supabase/migrations/20260818_offline_protection_mode.sql` | **NEW — WRITTEN, NOT RUN** |
| `lib/copy/offlineProtection.ts` | the switch + both modes, and four constants rewritten |
| `supabase/functions/heartbeat-monitor/index.ts` | resolves the mode; branches the write |
| 🔴 `app/api/heartbeat/route.ts` | the returning ping clears the new marker too |
| 🔴 `app/api/orders/submit/route.ts` | reads the marker; forces `pending` |
| `app/api/manage/route.ts` · `app/api/dashboard/route.ts` · `app/api/dashboard/action/route.ts` | plumbing for the mode |
| 🔴 `app/dashboard/[token]/page.tsx` **(GUSTO'S LIVE PATH)** · `app/manage/[token]/page.tsx` | the switch, then the mode choice |
```

🔴 **`lib/payments/promote-draft.ts` IS NOT IN IT, AND NEITHER IS ANY `lib/payments` FILE.** ✅ **READ.**

⚠️ **AND THE REPORT NEVER MENTIONS THE CARD PATH AT ALL.** A case-insensitive count of
`promote|card order|order_drafts|authoris` across it, and across
`docs/offline-protection-modes-review.md`, returns **0 and 0**. ✅ **EXECUTED.**

**What it does say about the terms — and read this carefully, because it is the closest the history comes
to the question:**

> *"🔴 **NOT ONE OF THE FOUR IS VAN-SCOPED OR TIME-SENSITIVE. Nothing on this path could know the van is
> offline** — which is exactly why 'the monitor does nothing' would have shipped a mode that does
> nothing."*

⚠️ **"THIS PATH" IS SUBMIT.** The report reasons throughout about one path and never asks whether a
second exists. 🔴 **THAT IS NOT A DECISION TO EXCLUDE THE CARD PATH — IT IS A DOCUMENT IN WHICH THE CARD
PATH NEVER COMES UP.**

**Its Q5 is the nearest miss of all:**

> *"✅ **NOTHING RE-EVALUATES IT, CONFIRMED BY SEARCH.** The reconnect path only nulls markers on
> `truck_events`; no code re-runs the auto-accept decision, and no path rewrites an order's status on
> reconnect."*

⚠️ **"no code re-runs the auto-accept decision" was asked about RECONNECT, not about a second creator.**
**It is true as asked and does not cover this.**

### `docs/confirmation-paths-report.md` (added by `6fd4b97`, 11 Aug — the day BEFORE promote-draft existed)

**It enumerates every writer of `'confirmed'` to `orders`. Its table, entire:**

| # | File | Trigger |
|---|---|---|
| 1 | `app/api/orders/submit/route.ts:901` + `:922` | Customer, via auto-accept |
| 2 | `app/api/dashboard/action/route.ts:218` | Operator — `confirm` |
| 3 | `…:368` | Operator — `undo_ready` |
| 4 | `…:1069` | Operator — manual order |
| 5 | `…:1516` | Operator — slot change |
| 6 | `lib/seed-demo-orders.ts:323` | Demo seeding |

🔴 **SIX SITES, AND THE CARD PROMOTION IS NOT ONE OF THEM — BECAUSE IT DID NOT YET EXIST.** ✅ **READ,
and confirmed by date: the audit is 11 August; `promote-draft.ts` was created 12 August.**

⚠️ **SO THE ONE AUDIT THAT WOULD HAVE CAUGHT THE DIVERGENCE WAS RUN THE DAY BEFORE THE DIVERGENCE WAS
CREATED, AND WAS NEVER RE-RUN.** **A fact about the sequence, offered as such.**

## 6 · The two terms, separately, as asked

| | Offline marker | Pre-order `force_pending` |
|---|---|---|
| Introduced | **18 Aug 2026**, `f9c6972` | **24 Jun 2026**, `dbad192` |
| `promote-draft.ts` created | **12 Aug 2026**, `0cb2d2a` | same |
| Relationship | 🔴 **term POSTDATES the file by 6 days** | 🔴 **term PREDATES the file by 7 weeks** |
| Did the introducing commit touch `promote-draft.ts`? | ❌ **No** — file did not exist | ❌ **No** — file did not exist |
| Was the term present in submit when `promote-draft.ts` was written? | ❌ **No** | ✅ **YES — same commit, same day** |
| Verdict | ✅ **CHRONOLOGICAL. Not a decision** | ⚠️ **NOT chronological. No recorded reason. CANNOT DETERMINE** |

---

## The answer to your one question

🔴 **THE WORK THAT ADDED THE OFFLINE TERM SIMPLY NEVER REACHED THE CARD PATH.** One commit, 26 files, not
one of them in `lib/payments`, and a build report whose scope table does not list the file and whose prose
never mentions the card path. **There is no exclusion to build over.** ✅ **ESTABLISHED.**

⚠️ **THE PRE-ORDER TERM IS A DIFFERENT AND WEAKER ANSWER.** It was available, adjacent and seven weeks
old when the card path was written, and it did not travel. **No commit message, comment, TODO or report
records why.** 🔴 **THE HISTORY IS SILENT, AND I AM SAYING SO RATHER THAN READING THE SILENCE EITHER WAY.**

⚠️ **ONE THING THE HISTORY IS NOT SILENT ABOUT, and it is the note to weigh before you change anything:**
`lib/payments/capture.ts` already warns, in capitals, that **there are two auto-accepts and that hooking
only one has cost an order before.** ✅ **That is a documented hazard about this exact pair of files —
written by whoever fixed it last time, and dated before the offline work that repeated the pattern.**

---

## Marking summary

| Claim | Status |
|---|---|
| One commit introduced `vanOfflineNoAutoAccept`; it did not touch `promote-draft.ts` | ✅ **READ** — `git log -S`, file list quoted |
| No `lib/payments` file is in that commit | ✅ **READ** — full 26-file stat |
| `promote-draft.ts` has five commits; its condition changed in exactly one | ✅ **READ** — `--follow`, `--diff-filter=A`, `-S` |
| All five commit bodies are empty | ✅ **READ** — `--format='%b'` |
| Submit carried `!anyForcesPending` on the day promote-draft was written | ✅ **READ** — `git show 0cb2d2a:` both files |
| The offline marker did not exist by 12 Aug | ✅ **READ** — `git log --until=2026-08-12 -S` returns nothing |
| The build report's scope table omits the file; the card path is never mentioned | ✅ **READ** + ✅ **EXECUTED** (0 matches in both offline docs) |
| The confirmation-paths audit predates the file by one day | ✅ **READ** — commit dates |
| `capture.ts` documents the two-auto-accept hazard | ✅ **READ** — quoted whole |
| No note anywhere records a deliberate exclusion | ⚠️ **INFERRED FROM ABSENCE** — six phrase searches plus TODO/FIXME/XXX, all named |
| 🔴 **Whether the pre-order omission was intentional** | ⚠️ **CANNOT DETERMINE. The history is silent.** Only the author's memory would settle it |
| Whether an unpushed or squashed history hides more | ⚠️ **CANNOT DETERMINE.** ⚠️ Working tree is dirty with this session's uncommitted work, which is not in any of the above |

⚠️ **I DID NOT INFER INTENT FROM THE CODE'S SHAPE.** Every verdict rests on a date, a file list, a commit
message or a quoted document. **Where those ran out, the answer is CANNOT DETERMINE.**

**No span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. ⚠️ **This report is
the only file written**, so there is no source census — nothing else was touched, and no git state was
changed: only `log`, `show` and `stat` were run. The result, the non-ASCII census and the carrier-aware
per-base variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
