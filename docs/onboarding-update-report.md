# Onboarding flow spec v7 -> v7.1

**Date:** 5 August 2026. **Documentation only** — no code changed, `next dev` / `next build` not run.
File read from disk (`docs/onboarding-flow.md`), never from an attachment.

---

## 🔴 TWO PREMISES IN THE BRIEF ARE WRONG. FLAGGING RATHER THAN BUILDING ON THEM.

**1. The manual is V11.1, not V12.** The brief says *"docs/reference-manual.md is now V12 and was updated FIRST"*. It was updated first — that part is right — but **you asked for 11.1 instead of 12** in the closing line of that same task, and I bumped it to **V11.1**. Every cross-reference I have written in this spec says **V11.1**, and I have updated the four pre-existing `V11` references to match. If you want the manual at V12 after all, it is a three-site bump in that file plus five references here, and I have not done it because you asked for the opposite.

**2. Same for this file: v8 -> v7.1.** Bumped to **v7.1**, per your closing line, not v8. Justified on the file's own conventions and on what actually changed: no build happened this session, and the flow an operator walks is **identical** to v7.

---

## INTEGRITY GATE

### Census BEFORE — 31 distinct non-ASCII characters, 795 occurrences

| U+ | Count | Name |
|---|---|---|
| 2014 | 372 | EM DASH |
| 00A7 | 101 | SECTION SIGN |
| 2192 | 75 | RIGHTWARDS ARROW |
| 1F534 | 47 | LARGE RED CIRCLE |
| 2705 | 39 | WHITE HEAVY CHECK MARK |
| FE0F | 36 | VARIATION SELECTOR-16 |
| 26A0 | 35 | WARNING SIGN |
| 2013 | 20 | EN DASH |
| 00B7 | 18 | MIDDLE DOT |
| 2026 | 8 | HORIZONTAL ELLIPSIS |
| 2713 | 6 | CHECK MARK |
| 00A3 | 5 | POUND SIGN |
| 00D7 | 4 | MULTIPLICATION SIGN |
| 203A | 3 | SINGLE RIGHT-POINTING ANGLE QUOTATION MARK |
| 274C | 3 | CROSS MARK |
| 221E | 2 | INFINITY |
| 2248 | 2 | ALMOST EQUAL TO |
| 2260 | 2 | NOT EQUAL TO |
| 2717 | 2 | BALLOT X |
| 1F4D0 | 2 | TRIANGULAR RULER |
| 1F512 | 2 | LOCK |
| 1F6AB | 2 | NO ENTRY SIGN |
| 2190 | 1 | LEFTWARDS ARROW |
| 2208 | 1 | ELEMENT OF |
| 2212 | 1 | MINUS SIGN |
| 2264 | 1 | LESS-THAN OR EQUAL TO |
| 2265 | 1 | GREATER-THAN OR EQUAL TO |
| 22EF | 1 | MIDLINE HORIZONTAL ELLIPSIS |
| 2B1C | 1 | WHITE LARGE SQUARE |
| 1F17F | 1 | NEGATIVE SQUARED LATIN CAPITAL LETTER P |
| 1F389 | 1 | PARTY POPPER |

**Curly quotes at baseline: U+2018 = 0, U+2019 = 0, U+201C = 0, U+201D = 0. U+FFFD = 0.** Straight-quoted throughout, same as the manual.

### Census AFTER — 31 distinct, 891 occurrences

**NEW characters: NONE. REMOVED: NONE. Curly quotes: 0, 0, 0, 0. U+FFFD: 0.**

| U+ | Char | Before -> After | Delta | Explanation |
|---|---|---|---|---|
| 2014 | — | 372 -> 407 | **+35** | em dashes in new prose |
| 00A7 | § | 101 -> 127 | **+26** | cross-references — §3, §15, §15A, §15B and the manual's §4/§13/§27/§35 |
| 26A0 | (warning) | 35 -> 45 | **+10** | the file's second-tier marker |
| FE0F | (var sel) | 36 -> 46 | **+10** | **matches the warning-sign delta exactly** |
| 1F534 | (red circle) | 47 -> 54 | **+7** | the file's marker for a load-bearing warning |
| 2705 | (check) | 39 -> 45 | **+6** | B10 CLOSED, the two sound-as-designed re-confirmations, the schedule/settings step ticks |
| 2192 | -> | 75 -> 77 | **+2** | `Manage → Settings`, and `NULL or future → show` |

The FE0F / 26A0 pair moving together by the same amount is the check that matters. Baseline had **one more FE0F than 26A0** (36 vs 35) — that asymmetry is pre-existing and **unchanged** after (46 vs 45), so nothing I added disturbed it.

### 🔴 The gate did NOT fire this pass

**No new character was introduced and nothing had to be removed.** Worth noting only because it fired on both previous passes (curly quotes in the manual, `✨` in this file, a stopwatch emoji in the manual yesterday) — I stayed inside the existing character set deliberately rather than by luck.

### Already-garbled spans — none, but TWO structural oddities flagged, NOT repaired

Both are pre-existing. Neither is corruption; both would mislead a reader.

1. **🔴 The changelog blockquotes are in a broken order.** They run **v2, v3, v4, v7, v6, v5** — ascending for three entries, then descending for three. A reader scanning for the latest change hits v2 first. **Not repaired** — reordering six blockquotes is a whole-file edit outside N1-N4, and it is the kind of tidy that should be a deliberate decision, not a side effect. I inserted **v7.1 immediately above v7**, which keeps it at the head of the descending run and therefore visible.

2. **🔴 §9.4 gap G9 contradicts §15A step 3, inside the same document.** G9 reads *"The import wizard cannot rename or add categories"* and is listed as an open gap; §15A step 3 (written at v7) says categories *"can be renamed, added and deleted"*, with the delete-with-dishes question made compulsory. **G9 is stale — it was closed by the build v7 documented, and never marked.** **Not repaired**, because it is outside N1-N4 and closing a gap entry is a status claim I would rather you make than infer. It is a one-line change to `✅ CLOSED` if you want it.

---

## N1 — THE PLAN DECISION: EVERY REFERENCE UPDATED

Seven sites carried the old decision. All seven now say `trial`; **the reasoning behind the old choice was retained rather than deleted**, because it explains why the change was a `canAccess` fix rather than a workaround.

| Where | Before | After |
|---|---|---|
| **§3** (the decision itself) | *"`plan = 'demo'` covers two states"*, plus a 🔴 blockquote *"Why pre-trial cannot be `plan='trial'`"* | New **`### 🔴 RESOLVED (v7.1)`** subsection heading the section: two profiles, three trial states, why `demo` stopped being right, and what it does **not** fix. Both old paragraphs kept below a *"retained for the reasoning"* marker, with B10 marked **CLOSED** |
| **Stage 5** step 2 | `plan = 'demo'` (§3) | `plan = 'trial'` with `trial_expires_at` NULL (§3 — CORRECTED v7.1) |
| **Stage 7** | `plan = 'demo'` — **not `'trial'`** (§3 / B10) | `plan = 'trial'` with NULL expiry; notes the operator experience is unchanged |
| **Stage 8** consequence 1 | *"Starts the clock (`plan` → `'trial'`, sets `trial_expires_at`)"* | *"sets `trial_expires_at`. The `plan` value is ALREADY `'trial'`"* — **nomination now writes one column, not two** |
| **§9 blockers, B10** | 🔴 open | ~~struck~~ + ✅ **CLOSED (v7.1)**, with why it was closed by changing the gate rather than routing around it |
| **§10 Phase 4** step 2 | `plan = 'demo'` (§3, per B10 — *not* `'trial'`, whose `canAccess()` returns false…) | `plan = 'trial'` with NULL expiry, + ⚠️ the `kind: 'demo'` profile is unchanged |
| **§12 / O15** | *"signup provisions plan `demo`, not `trial`"* | ⚠️ **UPDATED v7.1** appended — see the open-questions table below |

**Left as `demo` deliberately:** §10 Phase 2's live-DB verification record (`plan='demo'` on a *demo* truck — still correct), and B3's constraint note. Changing those would falsify a verification record.

### 🔴 What remains open — recorded in three places, not one

Per your instruction, both remaining unknowns are stated plainly wherever the resolution is claimed, so nobody reads "resolved" as "done":

- **Nomination still does not exist, so a self-serve trial cannot be STARTED.** In the v7.1 changelog entry, in §3's *"What this does NOT fix"* blockquote, and as §15 item 1.
- **What happens at EXPIRY is undecided.** Same three places, and **split out as its own §15 item 4** (below).

---

## N2 — THE FLOW AS IT NOW IS

**§15A needed NO change.** It was written at v7 and already describes the schedule step opening the shared editable event modal *and* enrolling (step 7), and the settings review before Done (step 8). I added one line noting it is unchanged at v7.1, and nothing else. **Restating it would have created the second copy the file's own header warns about.**

**Stage 6 was the problem, and it was worse than stale.** It still carried the original **six-step** spec — identity, menu, allergens, capacity, schedule, done — against **nine** built screens, describing the schedule step as *"Yes: URL, scraper takes over"* and containing no settings review at all. Two sequences for one product, 700 lines apart.

**Fixed by mapping, not by rewriting:** the six-step list is now headed by a 🔴 note that §15A is authoritative, followed by a **spec-step -> as-built table** showing where each step landed — including the two screens the original spec did not have (welcome, settings review) and the one that moved out of the wizard entirely (identity, to the signup modal, per O10). The inclusion reasoning and the capacity rule beneath it are untouched, because they still govern.

Two blockquotes added under it: the schedule step's change of shape (with the ✅ that its first build **never wrote the events it found**), and the settings review screen.

---

## N3 — DESIGN DECISIONS ADDED

New **`### Added v7.1 (5 August)`** block at the end of §15B, three entries:

- **Self-serve provisions `trial`; the demo profile stays `demo`** — with the do-not-tidy-them-back warning, since they were one value until the difference became the launch blocker.
- **A NULL expiry means NOT STARTED, and grants** — with the one-way-failure reasoning, and the explicit note that the **expired branch was deliberately not touched**.
- **The Billing Trial column shows until the trial ENDS** — with why the old question was the wrong one (it hid the column from the audience it exists for) and the one-condition-three-readers constraint.

**Deals and upsells were already in §15B, correctly, from v7.** I did **not** re-write them. Each got a ✅ marker recording that it was re-investigated this session and **found sound** — which is the new information, since a model that has been challenged once and held is worth marking settled or the same read gets re-run.

---

## N4 — WHAT BLOCKS LAUNCH

§15 now cross-references **manual V11.1 §27** under both `🔴 BLOCKING SELF-SERVE LAUNCH` **and** `🔴 THE EXPIRY CLIFF`, and states **four** items:

1. **Trial nomination does not exist** — reworded: the plan value changed, **the consequence did not**. A self-serve operator still holds the full trial feature set indefinitely, because nothing starts the clock.
2. **The four unenforced feature gates** — unchanged.
3. **Both `SIGNUP_PUBLIC` variables** — unchanged.
4. 🔴 **What happens at expiry is undecided** — **newly split out of item 1**, because nomination shipping does not answer it. Two questions that do not answer each other (the feature set, and the plan value plus what writes it), and ⚠️ **it has dates rather than a build dependency**.

Followed by a ✅ blockquote stating what v7.1 **did** settle (the NULL case) so it is not re-litigated.

⚠️ I added one fact to item 4 that came from the manual pass and is not in your brief: **`hasFeature()` skips the expiry check entirely** and gates `advance_preordering` on the customer order page, so an expired trial's **customers keep pre-ordering** while the operator's screens go dark. Corroborated by grep (`app/trucks/[slug]/order/page.tsx`, `app/dashboard/[token]/page.tsx`), and it changes the shape of the expiry decision.

---

## OPEN QUESTIONS AND BLOCKERS WHOSE STATUS CHANGED

| # | Was | Now |
|---|---|---|
| **B10** | 🔴 **OPEN** — pre-trial can't be `plan='trial'` | ✅ **CLOSED** — the gate changed; NULL grants |
| **O15** | **SUPERSEDED by §15** — *"signup provisions `demo`, not `trial`"* | **SUPERSEDED, and half of its (a) is now out of date.** Appended: signup provisions `trial`, NULL grants — **the practical position is identical** (still indefinite, because nothing starts the clock). **(b) is unchanged and is now the sharper half.** The manual-stamping decision stands |
| **§15 item 1** | Trial nomination blocked; signup on `demo` which never expires | **Still blocking**, reworded — consequence unchanged, remaining fix smaller |
| **§15 item 4** | *(did not exist — was a blockquote under item 1)* | 🔴 **Its own numbered blocker** |

**Unchanged, and deliberately not touched:** O3, O4, O5, O7, O8, O13, O14, O17, O18, O19. None was affected by the plan model. **O11** (verification gates nothing — decided, not built) and **O16** (Route A imports) were both settled at v7 and remain as written.

---

## ⚠️ FLAGGED — WHAT I COULD NOT CORROBORATE

1. **That any live truck actually reached `plan = 'trial'` through the deployed path.** `lib/provision-truck.ts` is **still uncommitted** (` M` at time of writing, with `lib/features.ts` and `lib/useFeatures.ts`), so the **deployed** provisioner still writes `demo`. The spec now describes what the code does; it does **not** claim any signup has yet been provisioned that way. This matters here more than in the manual, because this document describes a flow people walk.
2. **The three trial expiry dates** are referenced in §15 item 4 as *"three live trials expire between August and October"* rather than restated. They are `trucks.trial_expires_at` values, live-verified by you on 4 August, not derivable from the repo — and the manual owns them, so this spec points rather than copies.
3. **Whether nomination's eventual design should write the plan value at expiry.** Stated as **an open decision**, not answered. I have deliberately not proposed Starter as the fallback in this document — the manual's backlog notes it is the obvious answer and is not what the code does, and that is the right place for it.

---

## VERIFICATION

- **Census:** 31 distinct / 795 before; **31 distinct / 891 after.** No new characters, none removed, every delta explained. Curly quotes 0 throughout, U+FFFD 0.
- **Version:** `v7.1` in the Status line; companion doc reference updated to `V11.1`. **Zero stale `V11` references remain** (grep-verified: 4 sites updated — the header, §15, §15A, §15B).
- **Structure:** §15's four blockers verified in order 1, 2, 3, 4 after an insertion initially landed item 4 above items 2-3; re-ordered and re-checked. Both new headings sit at the correct depth (`###` under a `##`).
- **File:** 880 -> 914 lines.
- **No code changed.** This task wrote `docs/onboarding-flow.md` and `docs/onboarding-update-report.md` and nothing else.
