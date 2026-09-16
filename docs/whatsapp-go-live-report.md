# WhatsApp go-live — build report

**Workstream:** `whatsapp-go-live` · **Date:** 16 September 2026 · **Branch:** `main`
**HEAD at start:** `a05ecc98b2cfe3294d56473b37cfbbbd72ca8698` · **origin/main:** identical ✓

**No span of the prompt arrived garbled.** Three premises in the brief did not hold; all three are in §0, and two were put to you before any file was edited.

---

## 0. Premises that did not hold

### 0.1 🔴 There is no 8 September revert commit. `WHATSAPP_LIVE` has never been committed as `true`.

Step 1b asked me to find the commit(s) that reverted WhatsApp from live to coming soon. **They do not exist.** I traced the flag through **all 790 commits** in every ref, reading the declaration out of both locations it has ever lived in:

```
29 commits  app/manage/[token]/page.tsx   const WHATSAPP_LIVE: boolean = false
14 commits  lib/whatsapp-live.ts          export const WHATSAPP_LIVE: boolean = false
 0 commits  either file                   = true
```

`git log -S "WHATSAPP_LIVE: boolean = true" --all` returns exactly one commit, `6fe8634`, and that is a false positive: the string occurs in the **documentation** that commit added, not in source. At `6fe8634^` the flag is `false` in `page.tsx`; at `6fe8634` it is `false` in the new `lib/whatsapp-live.ts`. That commit is **the move, not a revert**.

`docs/whatsapp-landing-revert-report.md` is itself a **read-only investigation**, dated 8 September 2026, whose headline answer was:

> **THE ANSWER: IT IS UNCOMMITTED. NO REVERT IS NEEDED.** Production at `origin/main` (08ac368) already shows "coming soon". The go-live copy exists only in your working tree. You do not need to undo anything — you need to *not stage* certain hunks.

So "the whatsapp-landing-revert" was a decision **not to stage**, and the working-tree copy was later discarded. The reference manual's V12.5 entry names an investigation, not a change.

**Nothing was lost.** Commit `6fe8634` refactored the go-live wording *into the switch* rather than deleting it, so every surface carries both branches. You chose **"Yes — flag flip is 2b"**, and §2 shows that flipping the flag activates all five live branches by construction.

### 0.2 Step 2d has nothing to change — no "unlimited" exists near WhatsApp

`grep -rni "unlimited"` across `app/`, `lib/` and `components/` returns 49 hits and **not one** is near WhatsApp or auto-replies. Every hit is stock counts (`stock_count` null = unlimited), modifier caps (the `99` sentinel), slot capacity (`UNLIMITED = 999`), or the trial fee cell `'Unlimited'` for *online orders included*. **No edit was made, and none was invented.** Proof and positive control in §3c.

### 0.3 Step 2e's exact sentence already existed — in the Settings box

`app/manage/[token]/page.tsx` already renders, verbatim:

> Meta bills your WhatsApp account for replies, not HatchGrab. The first 1,000 each month are free.

So 2e is not new wording; it is **existing house wording being propagated**. The only *other* WhatsApp billing disclosure on a public or plan surface is **footnote 6** in `lib/plan-features.ts`. There are no others — the onboarding wizard's WhatsApp is the operator's *contact number* tick (`app/setup/page.tsx:268`), `app/compare/page.tsx` mentions WhatsApp only in a comment, and no email mentions auto-reply billing.

You chose **"Replace billing clause only"**, so the account prerequisite and the AI disclosure are kept.

### 0.4 ⚠️ The tree was not clean, and you chose to build on it

10 modified and 13 untracked paths carried the five uncommitted WhatsApp workstreams from this session. You answered **"Build on them"**. `app/manage/[token]/page.tsx` and `lib/plan-features.ts` now carry several workstreams' changes and **git cannot separate them** — see §4.

---

## 1. Step 1 — what the reads established

### 1a. Every reader of `WHATSAPP_LIVE`, and its state

| File · symbol | What it governs | State before |
|---|---|---|
| `lib/whatsapp-live.ts` · `WHATSAPP_LIVE` | the single switch | `false` |
| `app/landing/page.tsx:342` / `:360` | the does-item tile — **position moves with the flag**: 5th when live, last when not | coming soon, last |
| `app/landing/page.tsx:539` | Pro-card bullet — split with ⁶ when live, one merged badged line when not | merged + badge |
| `lib/plan-features.ts:299` (now `:313`) · WhatsApp matrix row | `pro/max: true` + footnote 6, vs `coming_soon` + footnote 4 | coming_soon |
| `lib/plan-features.ts:540` · `FOOTNOTES` | footnote 6 **exists only when live** | absent |
| `lib/landing-table.ts:67/82/104` · `DETAIL_OVERRIDES`, `NAME_OVERRIDES`, `HIDDEN_ROWS` | the two-row/merged-row shape for landing + PDF | merged into one row |
| `app/api/manage/route.ts:1667` · `app/api/manage/whatsapp-signup/route.ts:144` | server-side 403 unless live **or** the per-truck preview override | gated |
| `app/manage/[token]/page.tsx:9366` · `whatsAppSetupVisible` | `WHATSAPP_LIVE \|\| hasWhatsAppSetupPreview(...)` | preview only |

🟢 **Every landing, pricing and plan surface was already branched.** Nothing is a hard-coded literal.

### 1b. Covered in §0.1.

### 1c. `findPlanParityViolations` before this change

`lib/plan-features.ts:631-646` tested exactly one condition:

```ts
if (row[tier] === true && !canAccess(tier, feature)) { … }
```

- **One direction only** — advertised-but-not-allowed. It never asked the reverse.
- **Never read `WHATSAPP_LIVE`.**
- **Skipped `coming_soon` cells**, because they are not `=== true`.

🔴 The consequence: the WhatsApp row — the one row in the file carrying an explicit *"FLIP BOTH OR NEITHER"* rule — **passed vacuously**, because while the flag was off its cells read `coming_soon` and the checker could not see them. It reported clean on a state it had never tested. The row's own comment even claimed it was "NOW ARMED"; it was not.

`canAccess('<plan>','whatsapp_replies')`, evaluated (§3d): **pro, max, trial, tester, demo → true; starter → false.** That matches the live row's `starter: false, pro: true, max: true` exactly.

### 1d. Covered in §0.2 and §0.3.

---

## 2. Step 2 — the changes

### 2a. The flag

`lib/whatsapp-live.ts` — `export const WHATSAPP_LIVE: boolean = false` → **`true`**. The `: boolean` annotation was already there so both branches stay type-checked.

### 2b. Satisfied by 2a, verified rather than assumed

No file-by-file re-application was available (§0.1) or needed. Each live branch was **evaluated**, not eyeballed — §3a executes `lib/plan-features.ts` and §3b's table executes `lib/landing-table.ts`.

### 2c. The parity check — both directions, flag-aware, WhatsApp row only

`findPlanParityViolations` keeps direction 1 **unchanged for every row**. For the WhatsApp row it adds:

- **flag true** → a `coming_soon` cell is a violation; and `canAccess(tier) && cell !== true` is a violation (the reverse direction).
- **flag false** → a `true` cell is a violation.

🔴 **Why only this row.** The reverse test is *wrong* as a general rule: a feature can legitimately be gated on and deliberately unadvertised (soft launch, internal capability, a row still being written), and applying it everywhere would turn each of those into a build-breaking throw at module load. This row is different because it has a **published switch** whose entire purpose is to make the gate, the matrix, the landing tile and the Settings control agree. That promise is worth enforcing and is enforceable *because* the switch exists.

**Also hoisted `WHATSAPP_ROW_NAME`.** The row label was simultaneously the rendered name, the `ROW_FEATURE_MAP` key and the checker's test — three hand-kept literals, with the file's own comment warning that renaming one "drops the row from the parity check silently, and the check then reports clean". They now all read one const, so that cannot happen. (`lib/landing-table.ts` still keys its render-only overrides on the same string as separate literals by design; a comment says so.)

### 2d. Nothing to change — see §0.2.

### 2e. Footnote 6

`META_FREE_REPLIES_PER_MONTH` is now **imported** into `lib/plan-features.ts` from `lib/whatsapp/reply-cap.ts`, which has **no imports of its own**, so no cycle is possible. The figure is interpolated, never typed — a literal `1,000` on a public pricing page is a second source of truth for a number Meta can change.

| | Footnote 6 |
|---|---|
| **Before** | Auto-replies require a WhatsApp Business account. **Meta bills you directly for these messages — check Meta's current pricing.** Responses are AI-generated and can occasionally be wrong. |
| **After** | Auto-replies require a WhatsApp Business account. **Meta bills your WhatsApp account for replies, not HatchGrab. The first 1,000 each month are free.** Responses are AI-generated and can occasionally be wrong. |

The old clause said *who* pays but not *how much*, so a reader could not tell whether this was pennies or a new monthly bill. **Where the sentence now appears: footnote 6 only.** It was not added to any surface that did not already carry a WhatsApp billing statement or footnote.

### 2f. Stale comments corrected — six sites

| File · site | The stale assertion | Now |
|---|---|---|
| `lib/whatsapp-live.ts` header | "grants the feature to Pro and Max" | names pro, max, trial, tester, demo — and **not starter** |
| `app/landing/page.tsx` metadata note | "they are COMING SOON behind WHATSAPP_LIVE" | records that the flag is now true and the exclusion is **editorial**, not a prohibition |
| `app/manage/[token]/page.tsx` preview-heading note | "There is no connect action on this card today" | there is; the forward-looking phrasing still holds for a better reason |
| `app/manage/[token]/page.tsx` preview gate | "`WHATSAPP_LIVE` is false and stays false" | marked **redundant but deliberately kept**, so a revert stays a one-line job |
| `app/manage/[token]/page.tsx` native-hide note | "there is no way to connect a number from it (`WHATSAPP_LIVE` is false…)" | the original reason is gone; the hide stays for a **new, stated** reason (§3g) |
| 🔴 `app/manage/[token]/page.tsx` SDK note | "**Pizzeria Gusto renders the ELSE branch, so this never mounts for it and connect.facebook.net is never contacted from its page**" | **now false and materially so** — see §3d |

### 2g. UK English

No US spellings in any added line (`color`, `behavior`, `authorize`, `organiz`, `recognize`, `license`, `analyze`, `canceled`, `favor`, `labeled`, `catalog` — all absent).

---

## 3. Step 3 — proofs

### 3a. The parity check — passes now, fails on the broken variants

`scripts/whatsapp-golive-parity-harness.cjs` (new). It compiles the repo **once** into a temp directory; each variant is a copy of that compiled tree with one literal swapped, run in its **own child process**. 🔴 **No repo file is ever written, mutated or restored** — a harness that edits sources can leave them edited when it crashes. The mutation is asserted to have applied, so a variant that silently failed to break cannot masquerade as a pass.

```
── BROKEN VARIANTS: each MUST report at least one violation ────────────────
  ✓ FAILED as required  V1 flag TRUE but the WhatsApp matrix cell still says coming_soon
        caught: "WhatsApp auto-replies" is 'coming_soon' for pro but WHATSAPP_LIVE is true
        caught: "WhatsApp auto-replies" is not advertised for pro but canAccess('pro','whatsapp_replies') is true and WHATSAPP_LIVE is true
        caught: "WhatsApp auto-replies" is 'coming_soon' for max but WHATSAPP_LIVE is true
  ✓ FAILED as required  V2 flag TRUE and a plan cell says live where canAccess denies (starter)
        caught: "WhatsApp auto-replies" advertised for starter but canAccess('starter','whatsapp_replies') is false
  ✓ FAILED as required  V3 flag FALSE but a plan cell still says live
        caught: "WhatsApp auto-replies" advertised as live for pro but WHATSAPP_LIVE is false

── THE REAL STATE ─────────────────────────────────────────────────────────
  WHATSAPP_LIVE = true
  row "WhatsApp auto-replies"              footnote 6  starter=false  pro=true         max=true
  row "Messenger & Instagram auto-replies" footnote 4  starter=false  pro=coming_soon  max=coming_soon
  footnotes present: 1, 2, 3, 4, 5, 6
  violations: none ✓
✅ all 13 passed
```

⚠️ **V3 was not asked for.** It is the other half of the rule 2c added, and a one-directional proof of a two-directional check is the vacuous pass all over again.

### 3b. Before / after, by surface

Every "after" below was **executed**, not read off the source.

| Surface | Before (flag false) | After (flag true) |
|---|---|---|
| Landing tile — position | **last**, after "No signal? Keep serving." | **5th**, among the shipped capabilities |
| Landing tile — heading | WhatsApp auto-replies `Coming soon` | WhatsApp auto-replies *(no badge)* |
| Landing tile — body | "**Soon** your WhatsApp **will** get answered… Messenger and Instagram **to follow**." | "Your WhatsApp **gets** answered… using your own menu and schedule. **Messenger and Instagram coming soon.**" |
| Pro-card bullets | one line: "WhatsApp, Messenger & Instagram auto-replies `Coming soon`" | two lines: "WhatsApp auto-replies⁶" and "Messenger & Instagram auto-replies `Coming soon`" |
| Matrix row (Billing/Admin/landing/PDF) | `starter ✗ · pro coming soon · max coming soon`, footnote 4 | `starter ✗ · pro ✓ · max ✓`, footnote 6 |
| Footnote 6 | **does not exist** | see §2e |
| Landing table `NAME_OVERRIDES` | `{'WhatsApp auto-replies': 'WhatsApp, Messenger & Instagram auto-replies'}` | `{}` |
| Landing table `HIDDEN_ROWS` | `['Messenger & Instagram auto-replies']` | `[]` |
| Landing table `DETAIL_OVERRIDES` | carries a merged WhatsApp/Messenger/Instagram sentence | no WhatsApp key — falls back to the WhatsApp-specific detail |
| Settings WhatsApp box | preview-override trucks only | every truck whose plan grants the feature |

🔴 The landing table and the PDF therefore print **two rows** again. The merge was only ever permissible while both rows carried identical cells; they now diverge, and the override maps empty themselves in the same flip.

### 3c. Copy check, with a positive control

```
TARGET: 'unlimited' within reach of whatsapp / auto-repl
  ✓ NONE — no 'unlimited' anywhere near WhatsApp or auto-replies

POSITIVE CONTROL: 'unlimited' still present elsewhere (proves the search works)
  hits elsewhere: 49    e.g. lib/slot-availability.ts:55  const UNLIMITED = 999
```

The control fires and the target does not, so the absence is a real absence and not a broken search.

**Instagram and Messenger still show coming soon in every place they did:**

| Site | State |
|---|---|
| `app/landing/page.tsx:345` (live tile) | "Messenger and Instagram coming soon." |
| `app/landing/page.tsx:543` (live Pro bullet) | "Messenger & Instagram auto-replies `Coming soon`" |
| `lib/plan-features.ts:326` (matrix row) | `pro: 'coming_soon', max: 'coming_soon'`, footnote 4 — **byte-identical**, asserted in §3a |

No Instagram or Messenger row, box, badge, webhook or plan cell was touched.

### 3d. Evaluated, not asserted — who sees what

Executed against the real `lib/features.ts` and `lib/whatsapp-live.ts`:

```
plan      canAccess(whatsapp_replies)   whatsAppSetupVisible   -> Settings WhatsApp box
starter   false                         true                   -> ELSE branch (no Set up)
pro       true                          true                   -> LIVE branch (Set up)
max       true                          true                   -> LIVE branch (Set up)
trial     true                          true                   -> LIVE branch (Set up)
tester    true                          true                   -> LIVE branch (Set up)
demo      true                          true                   -> LIVE branch (Set up)
```

The gate is `whatsAppSetupVisible && can('whatsapp_replies')`, and `whatsAppSetupVisible = WHATSAPP_LIVE || hasWhatsAppSetupPreview(...)`.

- **Pizzeria Gusto (plan `trial`) → LIVE branch, Set up visible.** Why, from `canAccess`: `PRO_FEATURES` includes `whatsapp_replies` (`lib/features.ts:51`), `MAX_FEATURES` spreads `PRO_FEATURES` (`:55`), and `TRIAL_FEATURES = [...MAX_FEATURES]` (`:72`). The preview override is now irrelevant — the flag short-circuits it.
- **A starter-plan truck → ELSE branch.** `canAccess('starter','whatsapp_replies')` is `false`, so the `&&` fails regardless of the flag.

🔴 **Two consequences I want on the record, neither of them a defect I introduced:**

1. **Pizzeria Gusto's Settings tab now loads Meta's SDK.** `WhatsAppSetupControl` mounts only on the live branch, and its `useEffect` fetches `connect.facebook.net`. Until today Pizzeria Gusto rendered the else branch and never contacted Meta from that page. This is the intended consequence of going live, but it is a **new outbound request on a live trading truck's page** and the comment asserting the opposite has been corrected (§2f).
2. ⚠️ **A starter truck now sees a disabled number field with no explanation.** The else branch renders "WhatsApp", "Requires a WhatsApp Business account." and a `disabled` `<input>` — **no badge and no sentence saying why it is disabled**. This is **pre-existing and unchanged** (the brief forbids changing the Settings box), but it used to be what most trucks saw and is now starter's only view. Fixing it is a copy decision about what starter should be told; I have flagged it at the site rather than inventing wording.

### 3e. All WhatsApp harnesses

| Harness | Result |
|---|---|
| `whatsapp-golive-parity-harness.cjs` *(new)* | ✅ 13 passed, 3 variants failed first |
| `whatsapp-background-jobs-harness.cjs` | ✅ 48 passed |
| `whatsapp-connection-view-harness.cjs` | ✅ 87 passed |
| `whatsapp-settings-row-harness.cjs` | ✅ 131 passed |
| `whatsapp-setup-machine-harness.cjs` | ✅ 30 passed |

### 3f. TypeScript and lint

- `npx tsc --noEmit` — ✅ **clean, whole project.**
- eslint on the four changed files against a clean `HEAD` worktree (`git worktree add --detach`, symlinked `node_modules`, `-f json`, tallied by rule):

```
HEAD: 283 errors, 77 warnings
NOW : 283 errors, 77 warnings
delta 0 on every rule (12 rules compared)
```

### 3g. What I cannot prove, and your manual checklist

**Cannot be proved from here:** rendered appearance at any width; that the tile actually *moves* visually rather than merely rendering from the other branch; CDN/ISR-cached copies of `/landing` and the features PDF serving the old text after deploy; that Meta's Embedded Signup pop-up completes for a real truck; anything about the shipped iOS/Android binaries, which are built from a different tree.

**Your checklist:**

1. **Landing page, desktop** — WhatsApp tile is **5th**, no "Coming soon" badge; the sentence ends "Messenger and Instagram coming soon."
2. **Landing page, narrow (~360px)** — the tile still reads correctly in its new position, no overflow.
3. **Pricing / compare table** — **two** auto-replies rows, not one. WhatsApp ✓ under Pro and Max with a ⁶; Messenger & Instagram still "Coming soon". Footnote 6 appears under the table and reads as §2e.
4. **Features PDF** — same two rows (it renders from the same `lib/landing-table.ts`).
5. **A trial truck's Settings (Pizzeria Gusto)** — the WhatsApp box shows the **Set up** control. ⚠️ Confirm the Meta pop-up opens in Safari; this is the first time a trading truck has been able to press it.
6. **A starter truck's Settings** — the WhatsApp box shows the disabled field (§3d.2). Decide whether that is acceptable to ship.
7. **Instagram / Messenger** — still "Coming soon" on the landing tile clause, the Pro-card bullet and the matrix row.
8. **iPad / Android app** — the whole auto-replies card is still hidden (`!isNativeApp()` untouched).

---

## 4. Step 4 — the tree

```
 M app/landing/page.tsx        2f: metadata note corrected — the flag is true, the exclusion is editorial
 M lib/plan-features.ts        2c + 2e + 2f: both-direction parity check, WHATSAPP_ROW_NAME, footnote 6
 M lib/whatsapp-live.ts        2a: WHATSAPP_LIVE = true, plus the header's plan list
 M app/manage/[token]/page.tsx 2f: four stale comments, incl. the false Pizzeria Gusto / SDK claim
?? scripts/whatsapp-golive-parity-harness.cjs   3a: the parity proof and its three broken variants
```

⚠️ **The other nine modified files and twelve untracked paths are the previous workstreams**, uncommitted when this one began (§0.4). `git diff --stat` reports 549 changed lines in `app/manage/[token]/page.tsx`; **this workstream's share is four comment blocks and nothing else — no JSX, no logic, no layout.** `lib/plan-features.ts` is the only shared file where this workstream made behavioural changes.

**No SQL, no migration.** Nothing staged, committed, stashed, checked out, reset or restored; `git add` was not run in any form.

---

## 5. What going live actually changes, in one place

- Every truck on **pro, max, trial, tester or demo** can now see and press **Set up** in Settings → WhatsApp. **Starter cannot**, and the public matrix says so.
- The landing page, pricing table, comparison table and features PDF describe WhatsApp as a shipped capability, with the Meta billing sentence and its 1,000 free replies.
- **Instagram and Messenger are unchanged everywhere** — still coming soon, still unbuilt.
- **Nothing about routing, sending, the reply cap, the alerts, the daily job or the Settings box layout was touched.** Going live is a visibility change; the machinery behind it shipped in the previous workstreams.
- ⚠️ `hasWhatsAppSetupPreview` is now redundant (`true || …`). It is **kept deliberately** so the flag can be switched back without rebuilding the preview path.
