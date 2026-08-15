# Reference manual — measured audit at V11.18

**Read-only. `docs/reference-manual.md` was NOT edited.** No commits, no builds, no `next dev`, no `next build`, no deploys.
**File as audited:** 1,496,028 bytes · 10,346 newlines (10,347 lines counting the last) · `sha256 02bb9d25844e3328c5c57c10b713fe92fd358690b8b944e040213ebf11ee05b2`.

✅ **No instruction in the brief required an edit, so there was nothing to stop for.** No span of the prompt arrived garbled.

⚠️ **`git status` shows `docs/reference-manual.md` as modified. That is LAST turn's V11.18 update, not this audit** — `git diff --numstat` still reads exactly `412 8`, the same figure recorded at the end of that turn. **Nothing in this audit touched the file.** Full status at F4.

---

# 🔴 THE FIVE NUMBERS

| | Measured | |
|---|---|---|
| **Line-reference hit rate** | 🔴 **9 of 19 checkable (47%)** | the manual's `file.ts:NNN` pointers are **more often wrong than right** |
| Dangling `§NN` cross-references | 🔴 **110 of 636 (17.3%)** | pointing at §46–§76, **sections that do not exist** |
| Struck text | **23 lines / 9,546 bytes** | against **35 corrections left ADJACENT and unstruck** — the C7 pattern, still live |
| Backlog surfaces | **27 heading-level lists** | "the backlog" is not a place |
| History as a share of bytes | **40.3% (601,296 bytes)** | 2,218 of which are changelog **read before §1** |

---

# PART A — WHAT IS IN IT, MEASURED

## A1. Every section, its line range and its size

**READ.** Ranges are inclusive; a section runs to the line before the next `# ` heading. Bytes are UTF-8.

| Lines | Count | Bytes | Section |
|---|---|---|---|
| 1–16 | 16 | 1,344 | *(front matter, before the first heading)* |
| 17–2234 | **2,218** | **523,561** | **# Changelog** |
| 2235–2268 | 34 | 6,282 | # 1. Purpose of this document |
| 2269–2318 | 50 | 5,433 | # 2. Architecture overview |
| 2319–2499 | 181 | 20,894 | # 3. DRY |
| 2500–2758 | 259 | 26,700 | # 4. Plan tiers and feature gating |
| 2759–3080 | 322 | 33,710 | # 5. Order management |
| 3081–3215 | 135 | 23,235 | # 6. Prep time and queue logic |
| 3216–3328 | 113 | 15,234 | # 7. Customer order page UX |
| 3329–3389 | 61 | 5,523 | # 8. Deal management |
| 3390–3460 | 71 | 6,761 | # 9. Kitchen Display System (KDS) rules |
| 3461–3666 | 206 | 17,963 | # 10. Add Order panel |
| 3667–4146 | **480** | 47,177 | # 11. Native app and offline architecture |
| 4147–4200 | 54 | 4,168 | # 12. Authentication and access |
| 4201–4339 | 139 | 11,589 | # 13. Operator and multi-truck model |
| 4340–4436 | 97 | 8,632 | # 14. Vehicles |
| 4437–4682 | 246 | 24,584 | # 15. Events and venues |
| 4683–5177 | **495** | 59,875 | # 16. Database schema essentials |
| 5178–5350 | 173 | 12,266 | # 17. Menu API behaviour |
| 5351–5426 | 76 | 5,563 | # 18. Customer communications and email |
| 5427–5491 | 65 | 7,093 | # 19. Reports tab |
| 5492–5575 | 84 | 14,897 | # 20. Social media and WhatsApp auto-replies |
| 5576–5593 | 18 | 1,253 | # 21. Competitive positioning |
| 5594–5678 | 85 | 8,714 | # 22. Development process |
| 5679–5746 | 68 | 5,766 | # 23. Mobile UX patterns |
| 5747–5815 | 69 | 7,981 | # 24. Scraper workflow |
| 5816–5886 | 71 | 9,786 | # 25. Village Foodie Discovery Map |
| 5887–6013 | 127 | 14,699 | # 26. Testing and dev environment |
| 6014–7196 | **1,183** | **201,951** | **# 27. Open backlog (June 2026)** |
| 7197–7222 | 26 | 2,876 | # 28. Anti-scraping and rate limiting |
| 7223–7330 | 108 | 12,191 | # 30. Per-event stock |
| 7331–7451 | 121 | 17,795 | # 31. Slot & Capacity Engine |
| 7452–7528 | 77 | 7,181 | # 32. Discovery shadow linking |
| 7529–7622 | 94 | 10,519 | # 33. Discovery / Visibility model |
| 7623–7630 | 8 | 518 | # 34. Closing note |
| 7631–8205 | **575** | **113,245** | **# 35. Cross-cutting engineering invariants** |
| 8206–8569 | 364 | 26,937 | # 36. Android app platform notes |
| 8570–9702 | **1,133** | **113,065** | **# 37. Payments** |
| 9703–9893 | 191 | 15,076 | # 38. Brand system |
| 9894–10007 | 114 | 10,271 | # 39. Buzzers |
| 10008–10136 | 129 | 9,945 | # 40. iOS App Store — commerce posture |
| 10137–10197 | 61 | 6,170 | # 41. Account deletion |
| 10198–10228 | 31 | 3,512 | # 42. Kitchen ticket printing |
| 10229–10265 | 37 | 4,164 | # 43. Legal, email and domain |
| 10266–10299 | 34 | 4,070 | # 44. Commercial model |
| 10300–10347 | 48 | 5,814 | # 45. Offline payments and the conflict signal |

**THE FIVE LARGEST:**

| Rank | Section | Lines | Bytes | Share of file |
|---|---|---|---|---|
| 1 | **Changelog** | 2,218 | 523,561 | **35.0% of bytes** |
| 2 | **§27 Open backlog** | 1,183 | 201,951 | 13.5% |
| 3 | **§37 Payments** | 1,133 | 113,065 | 7.6% |
| 4 | **§35 Invariants** | 575 | 113,245 | 7.6% |
| 5 | **§16 Database schema** | 495 | 59,875 | 4.0% |

🔴 **THE TOP FIVE ARE 5,604 LINES AND 1,011,697 BYTES — 54% of the lines and 68% of the bytes.** The other 41 sections share the remaining third.

⚠️ **THERE IS NO §29.** Numbering runs 1–28, then 30–45. **Two `§29` references exist** (L6734, L6744) and both are delta residue — L6734 reads `### §29 — Option-stock DISPLAY…`, a delta's own numbering that survived integration. **§1 L2251 forbids exactly this**, so the rule is right and it was broken before the rule existed.

**INFERRED:** the file is 35.5% blank lines (3,670 of 10,347). Byte shares are the honest denominator for anything about reading effort; line shares overstate the short-line sections.

## A2. The three buckets

**Classification rule, stated so it can be disputed:**

1. **Unit = a BLOCK** — a maximal run of non-blank lines. 3,648 blocks. Not the line (prose is hard-wrapped, so a line is a fragment) and not the section (every large section mixes buckets).
2. **HISTORY** if the block is in the Changelog, or contains `~~struck~~` text, or is framed as a past event (a specific date, `STRUCK`, `CORRECTED V…`, `was removed`, `incident`). Test: *is it framed as something that happened?*
3. **CURRENT STATE** if it carries a `file.ext:NNN`, a repo path, or a status word (`BACKLOG`, `UNBUILT`, `blocker`, `schema`, `migration`, `endpoint`, `unresolved`). Test: *could a single commit falsify it?*
4. **DOCTRINE** if it carries rule language (`never`, `always`, `must`, `invariant`, `discipline`, `canonical`, `principle`, `decision rule`, `authoritative`). Test: *would it still be true if the code were rewritten tomorrow?*
5. **Precedence** HISTORY → CURRENT → DOCTRINE, by highest weighted signal count; a tie is not forced.
6. **Headings inherit FORWARD** from the first classified block beneath them; a still-unsignalled block inherits BACKWARD from the nearest classified block in the same section. **1,522 blocks (41.7%) were assigned by inheritance rather than by their own signal** — stated because it is the weakest part of this measurement.

**RESULT:**

| Bucket | Blocks | Lines | % lines | Bytes | % bytes |
|---|---|---|---|---|---|
| **DOCTRINE** | 1,316 | 3,700 | 35.8% | 439,430 | 29.4% |
| **CURRENT STATE** | 1,257 | 3,733 | 36.1% | 441,163 | 29.6% |
| **HISTORY** | 1,024 | 2,798 | 27.0% | **601,296** | **40.3%** |
| **AMBIGUOUS (not forced)** | 51 | 116 | 1.1% | 10,492 | 0.7% |

**Per section, the four biggest:**

| Section | Doctrine | Current | History |
|---|---|---|---|
| Changelog | 0 | 0 | **2,218** |
| §27 Open backlog | 347 | **606** | 230 |
| §37 Payments | **624** | 420 | 89 |
| §35 Invariants | **358** | 213 | 4 |
| §16 Schema | 121 | **361** | 13 |

### 🔴 The classifier's accuracy, measured rather than asserted

**I read a random sample of 24 classified blocks and judged each myself. Agreement: 18 of 24 = 75%.** The six disagreements, so the error is legible:

| Block | Machine | I would say | Why |
|---|---|---|---|
| L3302 *"Phone is collected but never required… the submit guard checks name and email only"* | DOCTRINE | CURRENT | `never` is rule language, but this is a fact about today's guard |
| L4582 `## Add/Edit event form` | DOCTRINE | CURRENT | heading inherited forward from a doctrine-flavoured first block |
| L9186 `---` | DOCTRINE | *structural* | a horizontal rule is not prose |
| L2492 `## DRY audit before every feature` | CURRENT | DOCTRINE | inherited backward across a bucket boundary |
| L4542 `### Saving` | DOCTRINE | CURRENT | same |
| L9292 *"None reads the ledger, none writes a payment field"* | DOCTRINE | CURRENT | a fact about six current call sites |

⚠️ **The error is one-directional and it matters: the classifier over-calls DOCTRINE for rule-shaped statements of current fact.** Every disputed block moves toward CURRENT STATE. **Read the doctrine figure as an upper bound and the current-state figure as a lower bound.**

### 🔴 Genuinely ambiguous, flagged rather than forced

- **51 blocks (116 lines) had no signal at all** and are left AMBIGUOUS.
- 🔴 **DOCTRINE IS TRAPPED INSIDE HISTORY.** 118 changelog lines (5.3%, **81,176 bytes**) carry rule language. Examples: **L60 "A NEW RULE FOR MONEY PATHS: safe failure beats root-cause correctness"** and **L63 "the allergen principle applied to money: never under-warn"** — a first-class invariant whose only home is a changelog entry. **Any split by section would strand it.**
- **The reverse is clean:** §35 contains **0** dated-narrative lines. It is the one section that is what it says it is.
- **§27 is not purely current state either:** 60 lines (5.1%) carry a DONE/CLOSED/✅ marker — closed items living in an open backlog.

---

# PART B — THE DECAY SURFACE

## B1. Line-number references

**READ.** Pattern `file.ext:NNN` across the whole file:

- 🔴 **191 references**, to **94 distinct files.**
- **66 distinct targets are written with a path** (137 references). **28 are a bare basename** (54 references) — `OrderCard.tsx:255` with no directory, unresolvable without a repo search.

**TOP TEN FILES BY REFERENCE COUNT:**

| Refs | Written as |
|---|---|
| 10 | `action/route.ts` *(partial path)* |
| 7 | `app/api/manage/route.ts` |
| 7 | `app/api/orders/submit/route.ts` |
| 6 | `app/api/dashboard/action/route.ts` |
| 6 | `lib/slot-availability.ts` |
| 5 | `OrderCard.tsx` *(bare)* |
| 5 | `AddOrderPanel.tsx` *(bare)* |
| 5 | `app/dashboard/[token]/page.tsx` |
| 5 | `submit/route.ts` *(partial)* |
| 5 | `app/manage/[token]/page.tsx` |

⚠️ **`action/route.ts` and `app/api/dashboard/action/route.ts` are the same file counted twice under two spellings** (16 references). **`submit/route.ts` and `app/api/orders/submit/route.ts` likewise** (12).

## B2. 🔴 THE HIT RATE — 20 references, sampled across the file, each opened

**Method:** the file was divided into 20 equal line ranges and one reference drawn at random from each (two ranges contained none; two extra were drawn at random from the whole file). **Each was resolved to a real file and the line printed with two lines of context.** A HIT means the line number still points at what the manual says is there.

| # | Manual | Reference | Claim | At that line today | |
|---|---|---|---|---|---|
| 1 | L270 | `action/route.ts:1060` | comment *"Never client-supplied"* | blank line before `GET ITEM OVERRIDES`; the string is at **:820 and :1460** | ❌ |
| 2 | L950 | `slot-availability.ts:679` | the existing-load fill loop | blank line after `capacityStep`; loops at **:689, :692** | ❌ |
| 3 | L1551 | `kds/page.tsx:513` | the KDS cook-view gate | a realtime `.subscribe()` callback | ❌ |
| 4 | L1696 | `action/route.ts:155` | the cancel email's unescaped `cancellationReason` | `catch (err) { console.error('Email failed') }`; `cancellationReason` is at **:351, :386, :416** | ❌ |
| 5 | L2351 | `app/admin/page.tsx:159` | `PLAN_ORDER` lives here | blank; `PLAN_ORDER` is at **:160** | ❌ *(off by 1)* |
| 6 | L2848 | `app/dashboard/[token]/page.tsx:45` | imports `calculateOrderTotal`, never calls it | `AppLockGate` import; the real import is **:46** | ❌ *(off by 1)* |
| 7 | L4057 | `components/dashboard/UserMenu.tsx:214` | a raw ungated `<a href>`, `sm:hidden` | `href={`/dashboard/${token}`}` with `sm:hidden` on the next line | ✅ |
| 8 | L4224 | `lib/provision-truck.ts:390` | the repo's ONLY insert into `trucks` | a `truckName` const; `.from('trucks')` is at **:396** | ❌ |
| 9 | L4722 | `app/api/manage/route.ts:1248` | channel inferred from `customer_email IS NULL` | `.eq('id', body.memberId)` — a staff-role check | ❌ |
| 10 | L6154 | `lib/useFeatures.ts:39` | exposes `can: (feature) => canAccess(…)` | exactly that line | ✅ |
| 11 | L6400 | `lib/stripe/connect.ts:88` | an `sk_test_` guard | blank; guards at **:58, :92, :110, :123, :442, :473** | ❌ |
| 12 | L6544 | `email-config.ts:12` | `HATCHGRAB_SENDER.email` is `hello@villagefoodie.co.uk` | `email: 'hello@villagefoodie.co.uk',` | ✅ |
| 13 | L6559 | `page.tsx:347` | a stale `truck_vans.paused_until` comment | 🔴 **UNCHECKABLE — 40+ files are named `page.tsx`** | — |
| 14 | L7165 | `lib/native/keepAwake.ts:8` | publishes TRUE state, not intent | `// ── TRUE state, not intent ──` | ✅ |
| 15 | L7721 | `lib/native/statusBar.ts:38` | only one mechanism may own the inset | `// 🚫 DO NOT ADD env(safe-area-inset-top)…` | ✅ |
| 16 | L7830 | `landing.css:67` | `.hg-landing * { … margin: 0; padding: 0 }` | exactly that line | ✅ |
| 17 | L8299 | `Preferences.swift:19` | `UserDefaults.standard` | `return UserDefaults.standard` | ✅ |
| 18 | L9302 | `lib/email.ts:520` | the customer self-cancel refund promise | a `tel:` link; refund copy is at **:586+** | ❌ |
| 19 | L9684 | `authorize.ts:23` | *"no platform fee… absence, never zero"* | exactly that comment | ✅ |
| 20 | L10088 | `components/FeatureGate.tsx:58` | the gated purchase CTA | `{purchaseCtaAllowed() && (` | ✅ |

> ## 🔴 HIT RATE: 9 of 19 checkable = **47.4%**.
> **With a ±3-line tolerance** (accepting #5 and #6, which are off by one), **11 of 19 = 57.9%.**
> **1 of 20 was not checkable at all**, because the reference is a bare `page.tsx:347`.

⚠️ **THE FAILURE MODE IS WORSE THAN THE RATE SUGGESTS.** Six of the ten misses land on a **blank line or an unrelated statement** that a reader will accept as context and reason from. **Only #5 and #6 fail visibly.** 🔴 **A rotted line number reads exactly like a fresh one — §1 L2259 already says so, and this is the first time it has been measured.**

**INFERRED, not proven:** the 47% figure is a point estimate from n=19. It supports *"roughly half"*, not a second decimal place.

## B3. References to files that no longer exist

**READ.**

- 🔴 **ZERO references point at a file that has vanished from the repository.** Every one of the 94 distinct targets resolves to something that still exists, once bare basenames are searched for.
- **17 distinct targets (39 references) do not exist at the path as written**, because the path is a fragment: `action/route.ts`, `submit/route.ts`, `order/page.tsx`, `manage/page.tsx`, `kds/page.tsx`. **These are legible to a human and invisible to a tool.**
- **ONE genuine dead full path: `app/api/stripe/checkout/route.ts`** (2 references, plus the spellings `checkout/route.ts` and `/api/stripe/checkout/route.ts`). ✅ **The manual already knows** — L6400 says *"`checkout/route.ts` NO LONGER EXISTS — hosted Checkout was deleted in V11.10"* — **but it says so inside a struck block, while the unstruck references elsewhere still name the file.**

## B4. Struck blocks

**READ.**

- **20 contiguous struck runs · 23 lines · 9,546 bytes · 23 inline `~~…~~` spans.**
- **Where:** §27 (12 lines), Changelog (4), §37 (4), §1 (1), §12 (1), §26 (1).
- **0.22% of the file's lines. 0.64% of its bytes.**

🔴 **Set that against C2 below: 35 corrections are written ADJACENT to text that was never struck.** The striking rule was adopted in V11.18; **the 35 predate it and are exactly the shape that produced C7 and C8.**

---

# PART C — DUPLICATION

## C1 / C2. Facts stated in more than one place, and whether the copies agree

### 🔴 1. "Three mechanisms" means two different things, and the manual points at the wrong one — **TWICE**

**READ.** Two tables, both titled around *three mechanisms*, in two different sections:

| Where | Heading | The three |
|---|---|---|
| **§11 L3962** | `## 🔴 THREE OFFLINE DETECTORS, NOT ONE` | `reachability.ts` · `network.ts` · bare `navigator.onLine` |
| **§35 L8153** | `## ⚠️ THE NATIVE-PLATFORM CHECK NOW HAS THREE MECHANISMS` | `AppHeader` direct call · legal-layout two-pass · `proxy.ts` UA marker |

🔴 **DISAGREEMENT, two sites, both mis-pointing:**

- **L4070** — *"no `isOffline`, **none of §35's three mechanisms**"* — the sentence is about **offline detection**, so it means §11's table, not §35's.
- **L9649** — *"Given **§35 records three detectors**"* — same error. **§35 records native checks; §11 records detectors.**

⚠️ **BOTH WERE WRITTEN YESTERDAY, IN THE V11.18 PASS. They are mine.** A reader who follows either lands on the wrong table and finds three plausible mechanisms that answer a different question. **This is the C7 shape forming in real time: not a stale fact, a stale POINTER.**

### 2. `order_key` vs `id` — **57 lines across 12 sections, and they AGREE**

**READ.** §16 L4710 is the authority: *"`order_key` (uuid, **PRIMARY KEY** — the only identifier in any WHERE/URL/FK/dedupe/React key), `id` (text — per-event DISPLAY number, restarts at 1, **NEVER a lookup key**)"*. §15 L4578, §18 L5363, §18 L5382, §3 L2393, §11 L3735 all restate it consistently. ✅ **No drift found.** ⚠️ **INFERRED explanation: it is restated as a RULE every time, never as a fact about a file.** The doctrine copies agree; it is the current-state copies elsewhere that rot.

### 3. The App Store blocker list — **two lists in one section, and they agree**

**READ.** §27 L6091 (a table row: *screenshots — 🔴 OPEN*) and §27 L7173 (V11.18: *"ONE BLOCKER… App Store SCREENSHOTS have never been produced"*), **1,082 lines apart in the same section.** ✅ Consistent today. ⚠️ **Nothing links them, so the next person to close screenshots must find both.**

### 4. 🔴 The C7 pattern itself, counted: **35 unstruck adjacent corrections**

**READ.** Lines carrying a mid-line correction marker (`CORRECTED`, `SUPERSEDED`, `NO LONGER`, `BUILT AND PUBLISHED`, `✅ DONE/BUILT/CLOSED/FIXED`) where the superseded text is **not struck**: **35 lines** — Changelog 15, §27 7, §4 3, §35 2, and one each in §1, §3, §8, §15, §16, §25, §32, §37.

**Worked examples, with line numbers:**

- **§27 L6480** — *"🔴 **PRIVACY POLICY AND TERMS: STILL UNWRITTEN.** *(✅ **BUILT AND PUBLISHED V11.4 — see §43.**)*"* 🔴 **This is C7 exactly**, still standing: a bold red *STILL UNWRITTEN* with the correction in smaller parenthetical italics after it. **§1 L2253 records that a gap analysis already read this one wrong.**
- **§4 L2696** — *"Trial expiry checked against `trucks.trial_expires_at`. ⚠️ **CORRECTED V11.1 — this line used to read…**"* — the correction is clear, but the pattern is *claim, then correction, same line*.
- **§37 L9391** — *"✅ **DECIDED V11.9…** *(Original wording kept for the record:)* **OPEN:** charge-at-order versus…"* — **the word OPEN appears in bold after the word DECIDED.**

### 5. 🔴 Dangling section pointers: **110 of 636 (17.3%)**

**READ.** 636 `§NN` cross-references. **110 point at §29, §46–§76, §510 or §3739 — none of which exist.**

| Where they live | Count |
|---|---|
| Changelog | **97** |
| §27 | 8 |
| §23 | 2 |
| §35, §37, §39 | 1 each |

**Worst offenders: §65 (18 references), §64 (9), §76 (8), §69/§71/§74 (6 each).** ⚠️ **INFERRED: these are delta section numbers that never survived integration** — precisely the failure §1 L2251 names for `§38.4` and `§41.4`. **§510 and §3739 are almost certainly typos for `§5`/`§37` with a line number run together.**

✅ **The most-referenced real sections are §35 (63), §27 (56), §37 (42), §36 (27), §16 (26).** **All five are in the top-eight by size.** INFERRED: the big sections are big *because* everything points at them.

## C3. How many distinct backlog surfaces exist

**READ. 27 heading-level open-items lists**, plus 193 lines carrying a backlog/open marker. The headings:

`L172` · `L202` *(two identically-titled "Corrections carried in this release")* · `L371 ### OPEN` · `L421 ### OPEN — the override one-way door` · `L938 ### Backlog` · `L1037` · `L1120 ### OUTSTANDING backlog (V8.6 additions + carried)` · `L1195 ### OUTSTANDING backlog (V8.5 additions)` · `L1225` · `L1752 ### Open decisions / backlog (post-V7.5)` · `L3184` · `L3233` · `L4550` · `L4664` · **`L6014 # 27. Open backlog`** · `L6444` · `L6608 ### Added V11.4 — open items` · `L6664 ### Smaller, carried forward` · `L6770` · `L7074 ## Open questions` · `L7156` · `L7371` · `L8859 ### ⚠️ Still open on this path` · `L10053` · `L10216 ## 🔴 OPEN` · `L10276` · `L10315 ## 🔴 STILL OPEN — amount pinning`

🔴 **NINE OF THE 27 ARE INSIDE THE CHANGELOG** — historical backlogs, some carried, some silently superseded, none marked as closed. **"Is it still open?" cannot be answered by looking in one place.**

---

# PART D — THE READING PATH

## D1. Lines before the first invariant you must not break

**READ. 14 lines. The first invariant is line 15** — before the table of contents, before §1:

> **⚠️ STANDING RULE — HOW THIS MANUAL IS MAINTAINED (not just what it records).** Documenting a bug *class* does not fix its existing *instances*…

✅ **The front matter does its job.** But the second and third answers matter more:

| Question | Answer |
|---|---|
| First invariant **anywhere** | line 15 — **14 lines in** |
| First invariant in the **doctrine body** (§1 L2249: *"the manual wins… never let them disagree silently"*) | **2,232 lines in** |
| Lines of Changelog crossed before §1 begins | **2,218 (523,561 bytes, 35% of the file)** |

🔴 **A top-to-bottom reader meets 2,218 lines of dated history before the first section of the manual proper.** ⚠️ **And the changelog is not skippable without loss: 118 of those lines carry doctrine** (A2), including *"safe failure beats root-cause correctness"* at L60.

## D2. Does §1 tell a reader which sections are doctrine and which are history?

🔴 **NO. "Not found" is the result.** §1's *"How to use this manual"* (L2241–2267) is quoted **in full** — it is nine bullets and a critical note, and **not one of them maps the document**:

> - Before adding any new feature, search this manual for related rules.
> - When auditing existing code for DRY compliance, this manual defines what should be shared.
> - When making a UX decision, check whether the rule already exists here.
> - When a feature seems to contradict this manual, the manual wins. Either update the code or update the manual — never let them disagree silently.
> - **A delta file written for integration into this manual must NOT cite section numbers**…
> - 🔴 **A SECTION'S CROSS-REFERENCE TO ANOTHER SECTION'S STATUS IS NOT PROVENANCE. Open the code, or mark the claim READ-FROM-MANUAL.**…
> - 🔴 **SOURCE-READ IS NOT BEHAVIOUR-VERIFIED. THE DEVICE IS THE AUTHORITY.**…
> - 🔴 **A SUMMARY OF A REPORT IS NOT THE REPORT.**…
> - ⚠️ **LINE NUMBERS DECAY FASTER THAN THIS MANUAL DOES, AND A ROTTED ONE READS EXACTLY LIKE A FRESH ONE.**…
> - 🔴 **WHEN A CLAIM IS CORRECTED, THE SUPERSEDED TEXT MUST BE STRUCK OR REMOVED — NEVER LEFT ADJACENT.**…
> - 🔴 **A BRIEF BUILT ON A MANUAL CLAIM INHERITS THAT CLAIM'S STALENESS.**…
> - **Every version bump gets a Changelog entry, written in the same pass as the bump.**…
>
> > **CRITICAL** — If a coding session produces code that violates rules in this manual, that is a regression. Either the rule changes (with explicit agreement) or the code changes. The two must never diverge.

**The closest thing to a map is the Changelog bullet at L2265**, which says what the Changelog is *for* — *"the only place the manual records **when** something changed"* — **but never tells a reader they may skip it, or that §35 is where the invariants live, or that §27 decays fastest.** ⚠️ **The nearest thing to a decay warning is the line-number bullet, and it is a caution, not a map.**

## D3. Lines to skip to read only doctrine and current state

**READ / INFERRED (uses the A2 classification, whose measured agreement is 75%):**

- **Skip 2,798 lines — 27.0% of lines, 601,296 bytes, 40.3% of the file.**
- **2,218 of those are one contiguous run** (the Changelog, lines 17–2234). **The remaining 580 are scattered across 41 sections in runs of 1–15 lines.**
- 🔴 **The contiguous 79% of the history is easy to skip. The scattered 21% is not, and it is the part interleaved with live claims.**

---

# PART E — OPTIONS, NOT A PLAN

**No recommendation is made. No winner is named. No edit is proposed.**

## E1. Three options

### Option 1 — Split by decay rate into two files

**Shape:** `reference-manual.md` (doctrine + current state, ~894,700 bytes) and `manual-history.md` (changelog + struck + dated narratives, ~601,300 bytes).

| For | Against |
|---|---|
| Removes 40.3% of bytes from the reading path | 🔴 **118 changelog lines carry doctrine** (81,176 bytes) — a clean cut strands them |
| The big cut is one contiguous run (2,218 lines), so 79% of the move is mechanical | The other 21% is 580 scattered lines needing 41 separate judgements |
| Version markers live in one file, so the eight-version footer drift becomes visible | 🔴 **636 `§NN` references now cross a file boundary**, and 110 are already dangling |
| §35 (0 dated lines) transfers untouched | The split does nothing about the 47% line-reference hit rate |

⚠️ **Does not obviously win. The mechanical 79% is easy; the 21% is where C7 lives.**

### Option 2 — Fix the pointers, leave the structure alone

**Shape:** no move. Convert `file.ts:NNN` to anchors that survive edits (a function name, a `const`, a unique string), resolve the 110 dangling `§NN`, strike the 35 adjacent corrections, and merge the 27 backlog surfaces into one.

| For | Against |
|---|---|
| 🔴 **Attacks the measured failure directly** — 47% hit rate, 17.3% dangling refs | Touches ~330 scattered sites across the whole file: **the highest-risk edit profile of the three** (see E3) |
| Nothing moves, so nothing can be lost in a move | The file stays 1.5 MB and the 2,218-line preamble stays in front of §1 |
| Can be done incrementally, a section at a time, each verifiable | No single checkpoint proves completeness — "did we get them all?" has no cheap answer |

### Option 3 — Split by audience, not by decay

**Shape:** a short **operating document** (§1, §35, and the ~3,700 doctrine lines gathered by rule) plus a **reference volume** (everything else). Doctrine is read every session; the reference is consulted on demand.

| For | Against |
|---|---|
| Puts the first invariant at line 15 **of a file a reader finishes** | 🔴 **Doctrine is the bucket my own sample says is over-counted** — every one of the six disagreements moved out of it |
| Doctrine is the bucket that never decays, so the small file needs no maintenance discipline | Splitting mid-section severs doctrine from the current-state evidence that makes it credible |
| Leaves the current-state volume as the single decaying thing to date-stamp | Requires the finest-grained classification of the three, at 75% measured accuracy |

## E2. What could be LOST, and how move-not-delete would prove nothing was

**What is at risk in any of the three:**

1. **The 118 doctrine lines inside the changelog** — invisible to a section-level move.
2. **The 23 struck lines** — they exist *to* preserve a superseded claim; a tidy-up deletes them by default.
3. **Adjacency meaning** — the App Store blocker at §27 L7173 reads correctly because it sits under a dated V11.18 header.
4. **The 110 dangling `§NN`** — a split renumbers, and a renumber can convert a *visibly* dangling pointer into an *invisibly* wrong one. 🔴 **That is strictly worse than today.**

**The accounting that would prove nothing was lost — every step measurable, none of it judgement:**

| Check | Passes when |
|---|---|
| **Byte conservation** | `bytes(A) + bytes(B) == 1,496,028 + (bytes of new headers, itemised)` |
| **Line conservation** | same, on 10,347 |
| **Non-ASCII census, per class** | all 72 classes present across A+B, **each count summing to its value in F2** — the check that caught three violations already |
| **Block-hash inventory** | sha256 of each of the 3,648 blocks before; every hash appears exactly once after. 🔴 **This is the real proof: a moved block keeps its hash, an edited one does not, and an omission shows as a missing hash.** |
| **Reference conservation** | 191 `file:NNN` and 636 `§NN` still present; the dangling set is **still exactly 110**, not larger |
| **Struck conservation** | 23 struck lines and 23 inline spans present |
| **Byte scan** | NUL 0, control bytes none, in **both** output files |

⚠️ **Block-hash inventory is the only one that distinguishes *moved* from *rewritten*.** Byte counts alone are satisfied by a file that lost a paragraph and gained a different one.

## E3. 🔴 The risk of a mass edit to this file

**READ — the empirical base rate is not zero, and it is recent.**

| Session | Errors introduced by editing |
|---|---|
| 14 August (per the V11.18 record) | **three silent errors**: a codepoint-class violation in `app/contact/page.tsx` (including an **invisible** variation selector), a codepoint-class violation writing the P8 entry into the manual itself, and a stray CJK character in a report |
| **This audit, newly found** | 🔴 **a fourth and fifth: the two mis-pointers at L4070 and L9649**, both written during the V11.18 pass, both surviving a full census and byte scan |

🔴 **THE CENSUS AND THE BYTE SCAN CANNOT SEE A WRONG CROSS-REFERENCE.** `§35` and `§11` are the same character classes and the same byte count. **Every existing integrity check passed on both errors.** ⚠️ **So the measured risk of a mass edit is: character-level corruption is caught, and semantic corruption is not caught by anything currently run.**

**Compounding factors, measured:**

- **3,648 blocks**, of which **1,522 were classified only by inheritance** — an automated split would move them on the weakest evidence in this audit.
- **636 `§NN` references** must all be re-resolved; **110 are already wrong**, so a diff of "dangling before vs after" is the only tractable check.
- The V11.18 edit was **412 insertions / 8 deletions** and still introduced two errors. 🔴 **A restructure is a four-figure line change.**

## E4. No winner is recommended.

**All three options are on the table with their measurements attached. The choice is yours.**

---

# PART F — INTEGRITY

## F1. Byte scan of the manual — byte-level, never `grep`

Read as `bytes`, scanned by ordinal:

```
docs/reference-manual.md
  NUL (0x00)                                          : 0
  control bytes < 0x09, plus 0x0B 0x0C 0x0E-0x1F      : none
  (0x09 TAB, 0x0A LF, 0x0D CR excluded by definition)
```

✅ **Clean.**

## F2. Non-ASCII census — 72 distinct classes, 9,410 characters

| Codepoint | Count | Name |
|---|---|---|
| U+2014 | 4466 | EM DASH |
| U+2192 | 1247 | RIGHTWARDS ARROW |
| U+1F534 | 772 | LARGE RED CIRCLE |
| U+00A7 | 646 | SECTION SIGN |
| U+26A0 | 556 | WARNING SIGN |
| U+FE0F | 556 | VARIATION SELECTOR-16 |
| U+00B7 | 215 | MIDDLE DOT |
| U+00A3 | 169 | POUND SIGN |
| U+2705 | 138 | WHITE HEAVY CHECK MARK |
| U+2026 | 95 | HORIZONTAL ELLIPSIS |
| U+00D7 | 83 | MULTIPLICATION SIGN |
| U+2013 | 76 | EN DASH |
| U+2713 | 64 | CHECK MARK |
| U+2260 | 47 | NOT EQUAL TO |
| U+2212 | 45 | MINUS SIGN |
| U+2264 | 21 | LESS-THAN OR EQUAL TO |
| U+21D2 | 15 | RIGHTWARDS DOUBLE ARROW |
| U+2265 | 14 | GREATER-THAN OR EQUAL TO |
| U+2194 | 12 | LEFT RIGHT ARROW |
| U+1F4B7 | 11 | BANKNOTE WITH POUND SIGN |
| U+1F4B3 | 11 | CREDIT CARD |
| U+2190 | 10 | LEFTWARDS ARROW |
| U+221E | 10 | INFINITY |
| U+2208 | 8 | ELEMENT OF |
| U+25CF | 7 | BLACK CIRCLE |
| U+1F355 | 6 | SLICE OF PIZZA |
| U+00E9 | 6 | LATIN SMALL LETTER E WITH ACUTE |
| U+2715 | 6 | MULTIPLICATION X |
| U+274C | 5 | CROSS MARK |
| U+03A3 | 5 | GREEK CAPITAL LETTER SIGMA |
| U+27FA | 5 | LONG LEFT RIGHT DOUBLE ARROW |
| U+270F | 5 | PENCIL |
| U+21A9 | 5 | LEFTWARDS ARROW WITH HOOK |
| U+2757 | 4 | HEAVY EXCLAMATION MARK SYMBOL |
| U+2248 | 4 | ALMOST EQUAL TO |
| U+00B1 | 4 | PLUS-MINUS SIGN |
| U+26A1 | 4 | HIGH VOLTAGE SIGN |
| U+2728 | 4 | SPARKLES |
| U+00B0 | 4 | DEGREE SIGN |
| U+222A | 3 | UNION |
| U+1F381 | 3 | WRAPPED PRESENT |
| U+23F3 | 2 | HOURGLASS WITH FLOWING SAND |
| U+2016 | 2 | DOUBLE VERTICAL LINE |
| U+24D8 | 2 | CIRCLED LATIN SMALL LETTER I |
| U+25B6 | 2 | BLACK RIGHT-POINTING TRIANGLE |
| U+1F510 | 2 | CLOSED LOCK WITH KEY |
| U+1F4E4 | 2 | OUTBOX TRAY |
| U+23F8 | 2 | DOUBLE VERTICAL BAR |
| U+1F4CB | 2 | CLIPBOARD |
| U+2284 | 2 | NOT A SUBSET OF |
| U+1F44B | 2 | WAVING HAND SIGN |
| U+2717 | 2 | BALLOT X |
| U+1F6AB | 2 | NO ENTRY SIGN |
| U+1F4DD | 1 | MEMO |
| U+2286 | 1 | SUBSET OF OR EQUAL TO |
| U+21B3 | 1 | DOWNWARDS ARROW WITH TIP RIGHTWARDS |
| U+1F336 | 1 | HOT PEPPER |
| U+226B | 1 | MUCH GREATER-THAN |
| U+1F5D1 | 1 | WASTEBASKET |
| U+2699 | 1 | GEAR |
| U+27F9 | 1 | LONG RIGHTWARDS DOUBLE ARROW |
| U+1F4CD | 1 | ROUND PUSHPIN |
| U+1F37D | 1 | FORK AND KNIFE WITH PLATE |
| U+1F4E6 | 1 | PACKAGE |
| U+2B07 | 1 | DOWNWARDS BLACK ARROW |
| U+203A | 1 | SINGLE RIGHT-POINTING ANGLE QUOTATION MARK |
| U+00BB | 1 | RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK |
| U+27F7 | 1 | LONG LEFT RIGHT ARROW |
| U+2032 | 1 | PRIME |
| U+26AA | 1 | MEDIUM WHITE CIRCLE |
| U+1F528 | 1 | HAMMER |
| U+1F514 | 1 | BELL |

✅ **U+26A0 = U+FE0F = 556.** The variation selector still pairs exactly with the warning sign — an unpaired one is invisible and would show as a divergence here.

⚠️ **This audit reproduces no codepoint it did not need to.** Where a character had to be named (F2 is a census, so the table is unavoidable) it is named by **codepoint and Unicode name**, not by the glyph — the P11 rule. **This report's own class count is 14, against the manual's 72** — one of which (BOX DRAWINGS LIGHT HORIZONTAL) arrived only because a code comment had to be quoted verbatim.

## F3. Byte scan of THIS report — separate pass, run AFTER writing

```
docs/manual-audit-report.md   36,602 bytes
  NUL (0x00)                                     : 0
  control bytes < 0x09, plus 0x0B 0x0C 0x0E-0x1F : none
  distinct non-ASCII classes                     : 14
```

✅ **Clean.** Scanned as its own pass after the file was written, byte-level, never `grep`.

## F4. `git status`, pasted

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   docs/reference-manual.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/manual-audit-report.md
	docs/manual-update-v11-18-report.md
```

⚠️ **`manual-update-v11-18-report.md` is last turn's report, also untracked. Neither report is committed.**

```
$ git diff --numstat -- docs/reference-manual.md
412	8	docs/reference-manual.md
```

🔴 **THE `412 8` IS LAST TURN'S V11.18 UPDATE, UNCHANGED.** It was `412 8` before this audit began and it is `412 8` now. ✅ **This audit modified nothing.** The only new path is this report.

---

# PROVENANCE

**READ** — every line count, byte count and range in A1; the classifier's outputs; all 191 line references and their resolution; the 20 sampled references, each opened in the real file with context printed; the 110 dangling `§NN`; the 27 backlog headings; the 35 unstruck corrections; §1 quoted in full; both census runs; both byte scans; `git status` and `git diff --numstat`.

**INFERRED** — the A2 bucket assignment (rule-based, **75% agreement measured against my own reading of a 24-block sample**, with the error one-directional toward DOCTRINE); the claim that `§46`–`§76` are delta residue; that `§510`/`§3739` are typos; the E1/E2/E3 trade-offs, which are reasoning over the measurements, not measurements.

**NOT MEASURED, and it matters** — whether each individual CURRENT STATE claim is *true* today. **This audit measured whether pointers resolve, not whether prose is correct.** The 47% hit rate is about locations. **A section could point perfectly at code that contradicts it.**
