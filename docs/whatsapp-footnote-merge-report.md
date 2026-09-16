# WhatsApp footnote merge — build report

**Workstream:** `whatsapp-footnote-merge` · **Date:** 16 September 2026 · **Branch:** `main`
**HEAD at start:** `a05ecc98b2cfe3294d56473b37cfbbbd72ca8698` · **origin/main:** identical ✓

**No span of the prompt arrived garbled. No instruction contradicted another.** Copy and footnote wiring only — **no SQL, no migration, no logic change.**

---

## 0. Pre-flight

`git status --porcelain=v1` listed 14 modified and 16 untracked paths, **all of them this session's WhatsApp workstreams**. The two whose names do not say "whatsapp" were checked rather than assumed: `lib/email.ts` (the alert sender's boolean return, from background-jobs) and `vercel.json` (the `whatsapp-maintenance` cron entry). **Nothing unrelated to WhatsApp is modified** — no STOP triggered. Built on top, as instructed.

**Mid-workstream instruction:** *"make sure to update the footnote 6 in pricing as well."* Addressed in §4 — every pricing surface was swept, and the answer is that all four render the shared `FOOTNOTES` array generically, so removing footnote 6 clears it from all of them at once. Evidence below.

---

## 1. Item 4 first — the STOP condition, and it did not trigger

Before editing, every footnote reference in the repo was enumerated:

| Number | Referenced by |
|---|---|
| 1 | Walk-up orders, Walk-up order processing, Online ordering — Pay at Hatch, Take payment on your phone |
| 2 | Online orders included, Fee after that, Online payments · **and the `hide_pricing` mask** |
| 3 | iPhone, iPad and Android kitchen app |
| 4 | Messenger & Instagram auto-replies · (now also WhatsApp auto-replies) |
| 5 | Kitchen ticket printing |
| **6** | **WhatsApp auto-replies row (`lib/plan-features.ts`, live branch) and the hand-written `<sup className="f-note">6</sup>` on the landing Pro card — and nothing else.** |

🟢 **Exactly two references, both WhatsApp.** No other row or surface uses 6, so no STOP was needed.

🔴 **Numbering elsewhere is unaffected, and this was the thing worth checking.** `app/manage/[token]/page.tsx` masks the pricing footnote with the magic string `f.number !== '2'` (recorded at `docs/reference-manual.md §44`), so a renumber would silently unmask a hidden price with no error, no type failure and no test. **Removing 6 is safe precisely because it was LAST and CONDITIONAL** — 1–5 do not move, in either flag state. Asserted by execution in §5a and by the harness in §5b.

---

## 2. Footnote 4 now serves both auto-reply rows

`lib/plan-features.ts`, `FOOTNOTES` number `'4'` — the text is now conditional on `WHATSAPP_LIVE`:

| Flag | Rendered text |
|---|---|
| **true** | Auto-replies require a Business account on each platform. Meta, not HatchGrab, bills your WhatsApp account for replies. From **1 October 2026** the first **1,000** a month are free. Correct at **16 September 2026**; Meta may change its prices, so check with Meta. Replies are AI-generated and can occasionally be wrong. |
| **false** | Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong. |

Both captured by executing the module — §5a. The bold values are interpolated from `META_FREE_ALLOWANCE_FROM`, `formatLimit(META_FREE_REPLIES_PER_MONTH)` and `META_PRICING_CHECKED_ON`; **no literals** (§5c). The off branch is **byte-identical** to the previous static string.

### Why one footnote can now carry both rows, when it previously could not

A row carries exactly **one** footnote (`FeatureRow.footnote?: string`), so a shared footnote must be true of *every* row pointing at it. That is what forced the split: while WhatsApp was live and this text was static, putting Meta's charges here would have claimed billing for the Messenger & Instagram row, which is unbuilt and bills nothing.

🟢 **What changed is the condition, not the rule.** The billing sentences now appear only when `WHATSAPP_LIVE` is true — exactly when a row pointing here can actually be billed — and the opening clause was already platform-neutral (*"a Business account on each platform"*), so it stays true of both rows in both states.

⚠️ **It is still slightly over-broad when live, and that is accepted and recorded at the site.** A reader of the Messenger & Instagram row sees a footnote naming WhatsApp billing. It names WhatsApp **explicitly** rather than saying "the platform bills you", so it cannot be read as a claim *about* Messenger or Instagram — and those rows say "Coming soon", so nothing is promised about them anyway.

---

## 3. Footnote 6 removed, markers repointed

- **`lib/plan-features.ts`** — the entire `...(WHATSAPP_LIVE ? [ { number: '6', … } ] : [])` block deleted (**44 lines**). Replaced by a note recording that numbering stops at 5 in both states, that 6 is free again, and that a future footnote must be **appended, not inserted**.
- **`lib/plan-features.ts`** — the WhatsApp row now reads `footnote: '4'` in **both** branches. 🟢 The only thing the flag changes on that row is the cells, so the marker and the footnote can no longer disagree.
- **`app/landing/page.tsx:548`** — `<sup className="f-note">6</sup>` → `4` on the Pro-card bullet. ⚠️ It is no longer flag-dependent: footnote 4 exists in both states, so this hand-written literal is correct whichever way the flag is set. The comment above it had explicitly warned *"IF FOOTNOTE 6 IS EVER RENUMBERED OR RETIRED, THIS MARKER MUST MOVE WITH IT; it will not error, it will just point at the wrong note"* — this is exactly that move, and the note now records it.

### Two stale comments corrected

| Site | Was | Now |
|---|---|---|
| `lib/landing-table.ts` merge-precondition note | "WhatsApp is now `pro: true, max: true` on footnote 6; Messenger & Instagram is still `coming_soon` on footnote 4" | records that the **footnotes match again but the cells still do not** — and that "same footnote" is **not** permission to re-merge the two rows, because a merged row can only print one set of ticks |
| `app/manage/[token]/page.tsx` AI-footnote provenance note | quoted footnote 4 as *"…you can view every message and reply yourself at any time"* — already stale | marked as provenance-at-the-time, with a note that footnote 4 has since moved on twice and that **none of it reaches this line**, which stays deliberately decoupled |

---

## 4. "Update the footnote 6 in pricing as well" — every pricing surface swept

**Four surfaces render footnotes, and all four map the shared array generically:**

| Surface | Renderer | Hard-coded 6? |
|---|---|---|
| Landing comparison table + footnote list | `app/landing/page.tsx:681` — `FOOTNOTES.map(f => …)` | no |
| Features PDF | `app/landing/features-pdf/route.ts:167` — `FOOTNOTES.map(…)` | no |
| Admin plan matrix | `app/admin/page.tsx:1075` — `FOOTNOTES.map(…)` | no |
| Manage → Billing | `app/manage/[token]/page.tsx:12143` — `FOOTNOTES.map(…)`, with the `f.number !== '2'` price mask | no |

🟢 **So removing footnote 6 from the array removes it from all four at once** — there was no second copy to update. The *only* hand-written footnote marker anywhere was the landing Pro-card `<sup>`, and that is repointed (§3).

Two further checks:

- `FOOTNOTE_TEXT_OVERRIDES` (`app/landing/page.tsx:142`) overrides **footnote 2 only**, so footnote 4 passes through to the landing table unchanged.
- `app/compare/page.tsx` carries **no footnotes at all** — it is the cost-comparison page, not the plan matrix.

**Mechanical proof:** a sweep for `f-note">6`, `<sup>6`, `footnote: '6'`, `number: '6'` and `footnote6` across `app/`, `lib/` and `components/`, excluding comments, returns **zero hits** (§5c).

---

## 5. Proofs

### 5a. Both flag states, executed — in a compiled copy, never by editing the repo file

```
════ FLAG TRUE (real) ════                    ════ FLAG FALSE (compiled copy) ════
WHATSAPP_LIVE = true                          WHATSAPP_LIVE = false

FOOTNOTES rendered:                           FOOTNOTES rendered:
  [1] Walk-up orders: …                         [1] Walk-up orders: …
  [2] Online payments powered by Stripe…        [2] Online payments powered by Stripe…
  [3] Device not supplied. …                    [3] Device not supplied. …
  [4] Auto-replies require a Business           [4] Auto-replies require a Business
      account on each platform. Meta, not           account on each platform. Replies are
      HatchGrab, bills your WhatsApp account        AI-generated and can occasionally be
      for replies. From 1 October 2026 the          wrong.
      first 1,000 a month are free. Correct
      at 16 September 2026; Meta may change
      its prices, so check with Meta.
      Replies are AI-generated and can
      occasionally be wrong.
  [5] Kitchen ticket printing…                  [5] Kitchen ticket printing…

Auto-reply rows:                              Auto-reply rows:
  footnote 4  "WhatsApp auto-replies"           footnote 4  "WhatsApp auto-replies"
              starter=false pro=true max=true               starter=false pro=coming_soon max=coming_soon
  footnote 4  "Messenger & Instagram"           footnote 4  "Messenger & Instagram"
              starter=false pro=coming_soon                 starter=false pro=coming_soon
```

🔴 **No footnote 6 in either state. Numbering stops at 5 in both. Both rows carry 4 in both.**

The off state was produced by copying the **compiled** tree and flipping `exports.WHATSAPP_LIVE`. The repo file was verified unchanged immediately afterwards (`lib/whatsapp-live.ts:41` still `= true`). A harness that edits source files can leave them edited when it crashes.

### 5b. `whatsapp-golive-parity-harness.cjs` — 37 assertions, six broken variants

⚠️ **The brief's V1/V2/V3 are implemented as F1/F2/F3.** V1–V3 were already taken by the parity variants from the go-live workstream, and renaming those would make that report's captured output unmatchable. **F1 = the brief's V1, F2 = V2, F3 = V3.**

```
── BROKEN VARIANTS: each MUST be caught by the check that owns its rule ─────────────────
  ✓ FAILED as required  V1 flag TRUE but the WhatsApp matrix cell still says coming_soon
  ✓ FAILED as required  V2 flag TRUE and a plan cell says live where canAccess denies (starter)
  ✓ FAILED as required  V3 flag FALSE but a plan cell still says live
  ✓ FAILED as required  F1 footnote 6 still present (the retired footnote reinstated)
        caught: footnote 6 does not exist
        caught: footnote numbering stops at 5
  ✓ FAILED as required  F2 the WhatsApp row still points at footnote 6
        caught: BOTH auto-reply rows point at footnote 4
  ✓ FAILED as required  F3 footnote 4 carries the billing sentences even when the flag is FALSE
        caught: OFF: footnote 4 is exactly the plain two-sentence version
        caught: OFF: footnote 4 claims nothing about billing
        caught: OFF: no date appears in footnote 4
✅ all 37 passed
```

#### 🔴 A structural fix the variants forced

On first run **F1, F2 and F3 all PASSED** — i.e. proved nothing. The variant loop judged every variant by `findPlanParityViolations()`, which compares advertised cells against the gate and **knows nothing about footnote text**. The footnote assertions lived in a separate list that variants never reached.

Fixed by giving each variant the detector that **owns its rule**: the footnote rules are now a reusable `footnoteChecks(result, expectLive)` function, and `DETECTORS` routes V1–V3 to the violations list and F1–F3 to `footnoteChecks`. 🟢 **The same function now judges the broken trees and the real code**, so a variant cannot be caught by a check the real state is never held to.

#### Every assertion changed

| # | Before | After |
|---|---|---|
| 1 | `t('WhatsApp row points at footnote 6', wa.footnote === '6')` | `t('WhatsApp row points at footnote 4', wa.footnote === '4')` |
| 2 | `t('footnote 6 exists', real.footnotes.includes('6'))` | `t('footnote 4 exists in the rendered list', real.footnotes.includes('4'))` |
| 3 | `t('footnote 6 — prerequisite sentence', footnote6.includes('Auto-replies need a WhatsApp Business account.'))` | replaced by `footnote 4 — platform-neutral opener` → `includes('Auto-replies require a Business account on each platform.')` |
| 4 | `t('footnote 6 — who bills', …)` | `LIVE: footnote 4 — who bills` (same sentence, now gated on the live state) |
| 5 | `t('footnote 6 — allowance start date, rendered', …)` | `LIVE: footnote 4 — allowance start date, rendered` |
| 6 | `t('footnote 6 — checked-on date, rendered', …)` | `LIVE: footnote 4 — checked-on date, rendered` |
| 7 | `t('footnote 6 — AI disclosure', …)` | `footnote 4 — AI disclosure` (unconditional — true in both states) |
| 8 | `t('🔴 footnote 6 has no unrendered interpolation', …)` | `footnote 4 has no unrendered interpolation` |
| 9 | three `footnote 6 no longer says …` absence checks | same three, retargeted to footnote 4, **plus** a new one for the retired `"Auto-replies need a WhatsApp Business account."` |

**Added, so the harness is stricter than before rather than merely repointed:** `footnote 6 does not exist`, `footnote numbering stops at 5`, `BOTH auto-reply rows point at footnote 4`, and **thirteen OFF-STATE assertions** that run the whole rule set against a genuinely flag-false tree — including `OFF: footnote 4 claims nothing about billing` and `OFF: no date appears in footnote 4`.

🔴 **A conditional string needs both branches exercised.** Asserting only the live text is how the off branch quietly acquires a billing claim for a feature that is not live — which is precisely F3.

⚠️ One incidental fix: the harness's `LIVE_ROW` constant still carried `footnote: '6'`, so every mutation silently failed to apply. The runner treats a non-applying mutation as a **hard error**, not a pass, which is why this surfaced immediately instead of as six false greens.

### 5c. Copy check, with positive controls

```
════ RETIRED footnote-6 sentence — 0 in rendered copy ════
  ✓ "Auto-replies need a WhatsApp Business account."           0 (want 0)

════ NEW footnote 4 ════
  ✓ "Auto-replies require a Business account on each platform." 2 (want 2 — live + off branch)
  ✓ billing clause (shared with the Settings summary)          2 (want 2)
  ✓ "Meta may change its prices, so check with Meta."          1 (want 1)

════ NO LITERALS in footnote 4 ════
  ✓ literal "16 September 2026" in rendered plan-features copy 0
  ✓ literal "1 October 2026"    in rendered plan-features copy 0
  ✓ literal "1,000"             in rendered plan-features copy 0

════ footnote-6 markers gone everywhere ════
  ✓ f-note">6 superscript 0   ✓ footnote: '6' 0   ✓ number: '6' 0   ✓ f-note">4 superscript 1

════ POSITIVE CONTROLS ════
  ✓ finds a string that IS present
  ✓ does not find an invented string
  ✓ comment stripper works ("footnote 6" in raw, 0 in code)
  ✓ retired sentence absent from RAW source too, not just stripped code
```

🔴 **One control had to be rebuilt, and the reason is worth keeping.** It originally tried to prove the comment-stripper worked by showing the retired sentence survived in a comment. It does not — footnote 6 was deleted *with* its comment block, so the sentence is gone from raw source too. That is a **stronger** result than expected but useless as a control, so the stripper is now proved with the phrase "footnote 6" (comment-only: raw finds it, stripped code does not), **and** a converse control asserts the retired sentence is absent from raw as well — so its `0` is a real absence, not an artefact of the stripper removing too much.

### 5d. All five WhatsApp harnesses

| Harness | Result |
|---|---|
| `whatsapp-background-jobs-harness.cjs` | ✅ 48 passed |
| `whatsapp-connection-view-harness.cjs` | ✅ 87 passed |
| `whatsapp-golive-parity-harness.cjs` | ✅ **37** passed (was 19), 6 variants fail first |
| `whatsapp-settings-row-harness.cjs` | ✅ 131 passed |
| `whatsapp-setup-machine-harness.cjs` | ✅ 30 passed |

### 5e. TypeScript and lint

- `npx tsc --noEmit` — ✅ **clean, whole project.**
- eslint on the four changed source files against a clean `HEAD` worktree (`git worktree add --detach`, symlinked `node_modules`, `-f json`, tallied by rule):

```
HEAD: 283 errors, 77 warnings
NOW : 283 errors, 77 warnings
delta 0 on every rule (12 rules compared)
```

### 5f. Manual checklist

1. **Landing page, Pro card** — the WhatsApp bullet's superscript reads **⁴**, not ⁶, and the Messenger & Instagram bullet still carries its "Coming soon" badge.
2. **Landing comparison table** — both auto-reply rows show a **⁴**; the footnote list beneath ends at **5**, with no orphan 6.
3. **Footnote 4 text on the page** — reads the §2 "true" version, including "From 1 October 2026" and "Correct at 16 September 2026".
4. **Features PDF** (`/landing/features-pdf`) — same two ⁴ markers, same footnote 4 text, list ends at 5. ⚠️ Check the footnote actually **fits**: it is now roughly three times longer than the string the PDF layout was last eyeballed with.
5. **Manage → Billing** and **Admin plan matrix** — same footnote list; confirm the pricing mask still hides footnote 2 where it should (it keys on `'2'`, untouched).
6. **Narrow width** — the longer footnote 4 wraps cleanly under the comparison table.

**What I cannot prove from here:** rendered appearance at any width, PDF pagination and whether the longer footnote overflows its page, and whether a CDN-cached `/landing` or PDF still serves footnote 6 after deploy.

---

## 6. Finish — the tree

```
 M lib/plan-features.ts        footnote 4 text conditional on the flag; footnote 6 deleted; WhatsApp row → '4'
 M app/landing/page.tsx        Pro-card superscript 6 → 4, and its warning note updated to record the move
 M lib/landing-table.ts        merge-precondition comment: footnotes match again, cells still do not
 M app/manage/[token]/page.tsx AI-footnote provenance comment marked as historic, not current
 M scripts/whatsapp-golive-parity-harness.cjs   per-variant detectors, 3 footnote variants, 18 new assertions
```

`git diff --stat` for the two files this workstream changed substantively:

```
 lib/plan-features.ts | 170 +++++++++++++++++++++++++-----------------
 lib/landing-table.ts |   6 +-
```

⚠️ **`app/manage/[token]/page.tsx` reports 606 changed lines and `app/landing/page.tsx` 24 — almost all of it earlier workstreams**, uncommitted when this one began. **Git cannot separate them.** This workstream's share of `page.tsx` is a single comment block; of `page.tsx`'s landing sibling, one character and its surrounding note.

**No SQL, no migration, no logic change.** Nothing staged, committed, stashed, checked out, reset or restored; `git add` was not run in any form.
