# Reference manual V11 -> V11.1

**Date:** 5 August 2026. **Documentation only** — no code changed, no migration, no SQL, `next dev` / `next build` not run.
File read from disk (`docs/reference-manual.md`), never from an attachment.

**Version:** bumped to **V11.1**, not V12, per your instruction. Justified on the file's own conventions — every prior point release (V9.1-V9.9) is a delta on one workstream, and this is one gating change plus corrections to entries V11 itself wrote. No new subsystem shipped.

---

## INTEGRITY GATE

### Census BEFORE — 69 distinct non-ASCII characters, 5,613 occurrences

| U+ | Char | Count | Name |
|---|---|---|---|
| 2014 | — | 3035 | EM DASH |
| 2192 | -> | 1131 | RIGHTWARDS ARROW |
| 00A7 | § | 416 | SECTION SIGN |
| 26A0 | (warn) | 134 | WARNING SIGN |
| FE0F | | 132 | VARIATION SELECTOR-16 |
| 1F534 | (red) | 86 | LARGE RED CIRCLE |
| 00B7 | · | 79 | MIDDLE DOT |
| 00D7 | × | 67 | MULTIPLICATION SIGN |
| 2013 | – | 63 | EN DASH |
| 00A3 | £ | 62 | POUND SIGN |
| 2713 | | 59 | CHECK MARK |
| 2026 | … | 55 | HORIZONTAL ELLIPSIS |
| 2260 | ≠ | 46 | NOT EQUAL TO |
| 2212 | − | 40 | MINUS SIGN |
| 2264 | ≤ | 21 | LESS-THAN OR EQUAL TO |
| 21D2 | | 14 | RIGHTWARDS DOUBLE ARROW |
| 2265 | ≥ | 13 | GREATER-THAN OR EQUAL TO |
| 2194 | | 11 | LEFT RIGHT ARROW |
| 221E | ∞ | 10 | INFINITY |
| 2705 | | 9 | WHITE HEAVY CHECK MARK |
| 2208 | ∈ | 8 | ELEMENT OF |
| 25CF | | 7 | BLACK CIRCLE |
| 2190 | | 6 | LEFTWARDS ARROW |
| 1F4B3 | | 6 | CREDIT CARD |
| 1F4B7 | | 6 | BANKNOTE WITH POUND SIGN |
| 03A3 | Σ | 5 | GREEK CAPITAL LETTER SIGMA |
| 270F | | 5 | PENCIL |
| 27FA | | 5 | LONG LEFT RIGHT DOUBLE ARROW |
| 00B0 | ° | 4 | DEGREE SIGN |
| 00B1 | ± | 4 | PLUS-MINUS SIGN |
| 2248 | | 4 | ALMOST EQUAL TO |
| 2728 | | 4 | SPARKLES |
| 2757 | | 4 | HEAVY EXCLAMATION MARK SYMBOL |
| 00E9 | é | 3 | LATIN SMALL LETTER E WITH ACUTE |
| 21A9 | | 3 | LEFTWARDS ARROW WITH HOOK |
| 222A | ∪ | 3 | UNION |
| 26A1 | | 3 | HIGH VOLTAGE SIGN |
| 2715 | | 3 | MULTIPLICATION X |
| 1F355 | | 3 | SLICE OF PIZZA |
| 1F381 | | 3 | WRAPPED PRESENT |

*(29 further characters each appearing 1-2 times: 2016, 2284, 23F3, 23F8, 24D8, 25B6, 2717, 1F44B, 1F4CB, 1F4E4, 1F510, 1F6AB, 00BB, 2032, 203A, 21B3, 226B, 2286, 2699, 27F7, 27F9, 2B07, 1F336, 1F4CD, 1F4DD, 1F4E6, 1F514, 1F528, 1F5D1. Full list captured and diffed mechanically; the tail is omitted here for length, not skipped.)*

**Curly quotes at baseline: U+2018 = 0, U+2019 = 0, U+201C = 0, U+201D = 0.** This file is straight-quoted throughout, as you said.

### Census AFTER — 69 distinct, 5,766 occurrences

**NEW characters: NONE. REMOVED characters: NONE. Curly quotes: still 0, 0, 0, 0.**

Every count change, and what in my edits accounts for it:

| U+ | Char | Before -> After | Delta | Explanation |
|---|---|---|---|---|
| 2014 | — | 3035 -> 3107 | **+72** | em dashes in new prose (the file's dominant punctuation) |
| 00A7 | § | 416 -> 440 | **+24** | cross-references to §4, §13, §16, §27, §35 |
| 1F534 | (red circle) | 86 -> 109 | **+23** | the file's marker for a load-bearing warning |
| 26A0 | (warning) | 134 -> 149 | **+15** | the file's second-tier marker |
| FE0F | (var sel) | 132 -> 147 | **+15** | **matches the warning-sign delta exactly** — each is the emoji-presentation half of a warning sign |
| 00B7 | · | 79 -> 80 | +1 | `Pro · TBC` in the backlog |
| 00D7 | × | 67 -> 68 | +1 | `hidden ×2` in the FeatureGate inventory |
| 2260 | ≠ | 46 -> 47 | +1 | `fix in repo ≠ deployed` |
| 2705 | (check) | 9 -> 10 | +1 | the `canAccess` row of the two-entry-points table |

The FE0F / 26A0 pair moving together by the same amount is the check that matters — a mismatch there is how a warning sign silently loses its emoji presentation. Baseline had 2 bare warning signs (134 vs 132); after, still 2.

### 🔴 THE GATE FIRED ONCE — one new character, caught and removed

My first pass introduced **U+23F1 STOPWATCH (×1)**, not present in the baseline. It came from quoting the live Billing copy verbatim in the backlog item — the string starts with a stopwatch emoji. Census went 69 -> 70 distinct.

**Removed rather than kept**, matching how the `✨` case was handled on the onboarding-flow pass. The quote now reads *"Set up payment before your trial ends to keep access"* with a parenthetical noting the live string carries a stopwatch prefix — the fact is preserved, the character is not imported. Re-censused clean at 69.

This is the third pass in a row where the gate has caught something a read-through would not have. It is earning its cost.

### Already-garbled spans

**None found.** No U+FFFD, no `â€` / `Ã©` / BOM mojibake anywhere in the file. Nothing flagged for repair, nothing repaired.

---

## SECTIONS TOUCHED

| Section | Change |
|---|---|
| Header, title block, running footer | V11 -> V11.1 (3 sites: line 1, `**Version 11.1**`, last line) |
| **Changelog** | New `## V11.1 — 5 August 2026` block, 9 bullets, above the V11 entry |
| **§4** Plan tiers | Trial entry corrected; Demo entry corrected; **2 new subsections**; gating-rules bullet corrected; 2 Billing subsections rewritten/added |
| **§8** Deal management | 🔴 **NO CHANGE — see below** |
| **§13** Operator model | *Provisioning writes plan `demo`* paragraph replaced |
| **§16** Database schema | **New subsection** — *Database maintenance and storage (V11.1) — OPERATIONAL* |
| **§27** Open backlog | New V11.1 block; V11 trial-nomination blocker annotated |
| **§35** Invariants | **3 new invariants** |

File: 5,492 -> 5,643 lines.

### M1 — the plan model (§4, §13)

**New: `## The three trial states (V11.1) — AUTHORITATIVE`** — a table plus the actual `canAccess` branch. NULL = not started (grants), future = running (grants), past = expired (denies everything). Records *why* NULL grants: the failure direction is one-way, and denying locked the product during setup.

**New: `## Two gating entry points, and only one checks expiry (V11.1)`** — see the corroborated-finding note below.

**New: `### 🔴 BillingTab gates on the RAW PLAN STRING and has NO fallback`** — four sibling conditionals, no `else`, so any plan outside them renders an empty div. States plainly that the plan change removed the truck that hit it and **did not fix the tab**, and that `tester` is safe for a different, deliberate reason (the tab is guarded).

**Rewritten: `### Trial column in the billing matrix (V6, CORRECTED V11.1)`** — the entry described `trialActive`, which no longer exists. Now records `showTrialColumn`, and the one-condition-three-readers constraint with the concrete failure (headers one cell out).

**§13** — the *provisioning writes `demo`* paragraph is replaced with the two-profile table (operator -> `trial`, demo -> `demo`), the reason they diverged, and the note that `ProvisionProfile` makes `plan` required so neither can inherit the other's value.

### M2 — new invariants (§35)

- **Fix-in-repo is not deployed, AGAIN** — with the point that matters most: **the symptom was broader than the report.** Only the two gates with a visible lock were noticed; pre-ordering, reporting, printing and the KDS cook screen failed invisibly. Generalised as *a bug report is filtered by what the UI can show*. Cross-linked to the two existing members of the family (V8.6 Edge Functions, and *on localhost the working tree IS the deploy*).
- **A condition with several readers must be ONE condition** — with the tell: a variable named for a *question* rather than a fact, where two names agree on every input but the one that separates them.
- **One source with a divergent presentation layer** — the `SMS order alerts` divergence as the worked example, and the reframing: *the question is not how many definitions there are but how many transformations sit between the definition and each render.*

**M2(c) was already recorded and I added nothing.** *Trace the WRITE layer, not just the READ layer* is in §35 verbatim, written at V11 with the `event_deals` seeding gate named. Re-verified, not rewritten.

### M3 — the deals model: 🔴 NO CHANGE NEEDED

You asked me to record it. **It is already recorded, correctly and in full**, at §8 *Deal visibility - three layers, no overlap (V11, CORRECTED)*. I checked every element of your brief against it:

| Your item | In §8? |
|---|---|
| `bundles_db.is_available` gates `event_deals` SEEDING | yes, with the `upsert_event` query |
| `bundles_db.apply_to_new_events` = seeded active value | yes |
| `event_deals.active` = per event | yes |
| Same expression for operator and customer | yes, named: `eventDeal ? eventDeal.active : bundle.apply_to_new_events` |
| `is_available` is FORWARD-LOOKING | yes, as its own 🔴 block |
| Upsells live-on-save by design, not a gap | yes |

**I wrote nothing there.** Duplicating it into a V11.1 block would create the second copy that §35's own lessons warn about.

### M4 — database maintenance (§16, new subsection)

Placed in §16 rather than §26 — it is a database fact, and §26 is dev-environment setup. Covers: schema sizes first (533MB total, `public` 10MB, `net._http_response` 304MB, `cron.job_run_details` 180MB); pg_net **bloats rather than accumulates** and only `VACUUM FULL` reclaims it, under an ACCESS EXCLUSIVE lock, so run it quiet — roughly quarterly, 10 weeks = ~300MB; `cron.job_run_details` at ~30,000 rows/week from the two jobs; **pg_cron job 5 `prune-cron-history`, `17 4 * * 0`, 7-day retention**, with the verification query.

Two things I added on top of your brief, both grounded in what the manual already says:

- The verification point is tied to the manual's **existing** V8.6 note that a `succeeded` row means `net.http_post` **dispatched** only. Your instruction and that entry are the same lesson; I cross-referenced rather than restating it as new.
- ⚠️ **A caution against over-pruning `net._http_response`** — V8.6 records it as *the only way to see an Edge Function's actual response body and status code*. The retention window is a debugging budget as well as a storage one. Flagging because "prune aggressively" is the obvious response to a 304MB table and would cost the project its only cron-failure forensics.

### M5 — backlog (§27)

New V11.1 block. Three still-blocking items re-confirmed (**trial nomination**, **the four unenforced gates**, **both `SIGNUP_PUBLIC` variables**) — re-stated only where V11.1 changed something, with a pointer to the V11 entries rather than a second copy.

New: **the expiry cliff** as its own 🔴 heading with the two separate decisions and the three live dates; the **`hasFeature` bypass**; **locked-feature UI too heavy**; **`Tooltip.tsx` dead**; **`Pro · TBC`**; **`SMS order alerts`**; **the unguarded countdown line**.

The V11 trial-nomination blocker got an inline `⚠️ UPDATED V11.1` note rather than an edit-in-place — the plan value changed, everything else stands, and the practical consequence is unchanged.

---

## CORRECTIONS MADE (as corrections, not supplements)

| # | Where | Was | Now |
|---|---|---|---|
| 1 | §4, Trial entry | *"A trial row with `trial_expires_at` NULL is in the same state — every feature off"* | Marked **SUPERSEDED IN PART** — NULL now grants. The **expired** half is explicitly preserved as still accurate |
| 2 | §4, Feature gating rules | *"expired trials silently drop to Starter"* | Corrected in place. **This survived from V6 to V11** — V11 corrected it in the Trial entry and left this bullet standing |
| 3 | §4, Demo entry | *"and what self-serve signup provisions"* | *"and no longer what self-serve signup provisions"*, with the two-profile split |
| 4 | §4, Trial column | described `trialActive` | `showTrialColumn`, with why the question changed |
| 5 | §13 | *"Provisioning writes plan `demo`"* | the two-profile table |
| 6 | §27 V11 blocker | *"provisioned on plan `demo` ... never expires"* | annotated: plan value changed, blocker unchanged |

Correction 2 is worth calling out: **V11 fixed this same error in one place and missed the other.** The manual's own standing rule is that documenting a class is not complete until you sweep for other instances — that applies to corrections as well as to bug classes.

---

## 🔴 FINDINGS I CORROBORATED THAT WERE NOT IN YOUR BRIEF

**`hasFeature` bypasses the expiry check entirely, and one consumer is customer-facing.** `lib/features.ts` exports two gates. `canAccess(plan, feature, overrides, trialExpiresAt)` applies the three-state rule; **`hasFeature(plan, feature)` takes no expiry and grants the trial set unconditionally.** It has two live consumers, verified by grep:

- `app/dashboard/[token]/page.tsx:1139` — branded QR
- `app/trucks/[slug]/order/page.tsx:1210` — **`advance_preordering`, on the CUSTOMER order page**

**So an expired trial's customers keep pre-ordering** while the operator's own Manage surfaces are dark. That is a real hole in the expiry cliff, it is not something the brief anticipated, and it changes the shape of the fix — recorded in §4 and flagged in the §27 cliff item. ⚠️ `hasFeature`'s own comment directs callers to *"use `hasFeatureWithContext` instead"*; **no such export exists** — the function it means is `canAccess`. A stale pointer in the one place a reader looks for the rule. Recorded, not fixed (no code changes this task).

---

## ⚠️ FLAGGED — WHAT I COULD NOT CORROBORATE

Written into the manual with explicit provenance rather than as bare fact:

1. **Every figure in M4.** 533MB / 500MB, `public` 10MB, `net._http_response` 304MB, `cron.job_run_details` 180MB, ~30,000 rows/week, 10 weeks -> ~300MB, and **pg_cron job 5 `prune-cron-history` at `17 4 * * 0` with 7-day retention.** None of it is in the repo — the schemas are extension-owned, no migration creates them, and PostgREST does not expose them. The subsection opens with *"measured on the live database by Dominic, 5 August 2026"* and states the figures are **a reading taken on a date, not a property of the system**. The one thing I *could* corroborate is the two job cadences (auto-event-scheduler 1 min, heartbeat-monitor 30s), which the manual already records in §11 and §22.

2. **The three trial dates** — Test Kitchen 23 Aug, Real Thai Food 30 Sep, Pizzeria Gusto 17 Oct. Not derivable from code; they are `trucks.trial_expires_at` values. Recorded as *"live-verified by Dominic, 4 August 2026"*.

3. **That `village-spice` reached plan `trial` at all.** `lib/provision-truck.ts` is **still uncommitted** (` M` as of this write, alongside `lib/features.ts` and `lib/useFeatures.ts`), so the deployed provisioner still writes `demo`. That truck's value came from outside the deployed code path. **Not written into the manual as a fact about provisioning** — the manual records what the code does, plus the standing caution that a live row is not evidence of what provisioning wrote.

4. **The `VACUUM FULL` quarterly cadence.** One observation (10 weeks -> 300MB), recorded as such: *"the only rate this project has measured — treat it as one observation, not a curve."*

---

## VERIFICATION

- **Census:** 69 distinct / 5,613 before; **69 distinct / 5,766 after.** No new characters, none removed, every delta explained above. Curly quotes 0 throughout.
- **Structure:** `# 16` (3150) -> new subsection (3394) -> `# 17` (3434) — the maintenance subsection is inside §16, not orphaned between sections. All new headings at the correct depth (`##` under a `#` section, `###` under a `##`).
- **Version:** V11.1 at all three sites — line 1, the `**Version 11.1**` title block, and the running footer.
- **No code changed.** `git status` shows the three library files that were already modified before this task (`lib/features.ts`, `lib/provision-truck.ts`, `lib/useFeatures.ts`) plus `app/manage/[token]/page.tsx` from the preceding settings-boxes task. **This documentation task added `docs/reference-manual.md` and `docs/manual-update-report.md` and nothing else.**
- `next dev` / `next build` not run. No SQL, no migration.
