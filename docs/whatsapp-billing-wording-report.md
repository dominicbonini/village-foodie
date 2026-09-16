# WhatsApp billing wording — build report

**Workstream:** `whatsapp-billing-wording` · **Date:** 16 September 2026 · **Branch:** `main`
**HEAD at start:** `a05ecc98b2cfe3294d56473b37cfbbbd72ca8698` · **origin/main:** identical ✓

**No span of the prompt arrived garbled.** One instruction contained an internal tension, resolved by the brief's own tie-breaker and recorded in §1. **Copy only — no SQL, no migration, and the only logic change is the one item 4 asks for.**

---

## 0. Pre-flight

`git status --porcelain=v1` at start listed 13 modified and 15 untracked paths, **all of them this session's earlier WhatsApp workstreams**. The two whose names do not say "whatsapp" were checked rather than assumed:

- `lib/email.ts` — `sendConfirmationEmail` was widened to return `boolean` by the background-jobs workstream, so the alert sender can release a claim on a failed send.
- `vercel.json` — the `0 3 * * *` `whatsapp-maintenance` cron entry.

**Nothing unrelated to WhatsApp is modified**, so no STOP was triggered. Built on top, as instructed.

---

## 1. Constants — and the one instruction that pointed two ways

The brief said: *"next to `META_FREE_REPLIES_PER_MONTH` in `lib/whatsapp/reply-cap.ts` or `lib/whatsapp/copy.ts`, **whichever already holds the copy constants**"*. Those two halves name different files — `META_FREE_REPLIES_PER_MONTH` lives in `reply-cap.ts`, but the copy constants live in `copy.ts`. The trailing clause is the tie-breaker the brief itself supplied, so:

**Both constants went into `lib/whatsapp/copy.ts`**, beside `META_PRICING_URL`, `WHATSAPP_MANAGER_URL` and `formatLimit` — the file whose own header reads *"THE WHATSAPP SETTINGS COPY AND ITS TWO LINKS, IN ONE PLACE"*.

```ts
export const META_PRICING_CHECKED_ON = '16 September 2026'
export const META_FREE_ALLOWANCE_FROM = '1 October 2026'
```

**Why not `reply-cap.ts`:** that module documents itself as *"ONE PURE DECISION, NO DATABASE, NO IMPORTS"* — it is cap arithmetic, and nothing in it would ever read a date string. `META_FREE_REPLIES_PER_MONTH` stays there because it is **also the default the cap enforces**, not only copy. These two are only ever rendered.

**No cycle is possible:** `lib/whatsapp/copy.ts` has **zero imports**, so `lib/plan-features.ts` importing it is safe — the same property that made importing `reply-cap.ts` safe in the previous workstream.

`lib/plan-features.ts` now also imports `formatLimit` and uses it in place of a local `.toLocaleString('en-GB')`. 🔴 Two formatters is exactly how "1,000" and "1000" end up on two surfaces describing one allowance.

---

## 2. Footnote 6 (`lib/plan-features.ts`)

| | Text |
|---|---|
| **Before** | Auto-replies require a WhatsApp Business account. Meta bills your WhatsApp account for replies, not HatchGrab. The first 1,000 each month are free. Responses are AI-generated and can occasionally be wrong. |
| **After** | Auto-replies need a WhatsApp Business account. Meta, not HatchGrab, bills your WhatsApp account for replies. From **1 October 2026** the first **1,000** a month are free. Correct at **16 September 2026**; Meta may change its prices, so check with Meta. Replies are AI-generated and can occasionally be wrong. |

Rendered value captured by executing the module — see §5b. **Nothing in the string is a literal**: all three bold values are interpolated.

🟢 **"Replies are AI-generated" was already the house wording.** Footnote 4 (the Messenger & Instagram row, `lib/plan-features.ts:551`) reads *"Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong."* — so the instruction's "Responses" → "Replies" change **aligns footnote 6 with footnote 4** rather than introducing a new phrasing. This corrected one of my own test expectations (§5a).

⚠️ **Footnote 6 says "check with Meta" and does not link, while the Settings summary does.** That is not drift: this string is also printed into the **features PDF**, where a link cannot be clicked. Same fact, different medium — recorded at the site so it is not "fixed" later.

---

## 3. Settings WhatsApp box, live branch

### 3a. The billing summary

| | Text |
|---|---|
| **Before** | Meta bills your WhatsApp account for replies, not HatchGrab. The first 1,000 each month are free. |
| **After** | Meta, not HatchGrab, bills your WhatsApp account for replies. From **1 October 2026** the first **1,000** a month are free. Correct at **16 September 2026**; check [Meta's pricing](META_PRICING_URL) for changes. |

The link is `META_PRICING_URL`, `target="_blank" rel="noreferrer"` — the same constant and the same attributes the expander's existing "See Meta's pricing" link uses.

🔴 **This sentence and footnote 6 read the same three constants**, so the operator's Settings page and the public page that sold them the plan cannot quote different dates or a different allowance.

### 3b. Inside "How Meta charges"

**Only the named phrase changed.** The rest of the approved paragraph and **both** its links are untouched.

| | Phrase |
|---|---|
| **Before** | Meta **currently includes** 1,000 free replies a month per number |
| **After** | **From 1 October 2026, Meta includes** 1,000 free replies a month per number |

⚠️ "Currently" was true of neither period: before the date the allowance has not started, and after it the word ages silently on a surface nobody re-reads. A date is checkable.

---

## 4. Settings WhatsApp box, else branch

Reached by trucks whose plan does not grant `whatsapp_replies` — i.e. **starter** (§5c).

| | Rendered |
|---|---|
| **Before** | title "WhatsApp" · "Requires a WhatsApp Business account." · a **disabled** `<input type="tel">` showing `whatsapp_sender` |
| **After** | title "WhatsApp" · "WhatsApp auto-replies are included on Pro and Max." · "Upgrade →" |

**🔴 The disabled input is gone.** It showed a greyed field with no badge and no sentence saying why it could not be typed in, so the one thing starter saw was a control that looked broken. A disabled input is not an explanation; it is a question the page refuses to answer. Nothing was lost — the value was read-only there, and the operator's public WhatsApp number is edited in its own field elsewhere on the tab.

**⚠️ "Requires a WhatsApp Business account." went with it, deliberately.** It is a prerequisite for *setting the feature up*, and this truck cannot set it up at any price without changing plan first — leading with Meta's requirement answers a question starter has not reached. It remains on the **live** branch via `view.showRequiresAccountHelper`, where the truck can act on it; asserted in §5a.

### The upgrade link — which pattern, and why not the component

**The pattern is `components/FeatureGate.tsx`'s link:** `href="?tab=billing"`, the text `Upgrade →`, the classes `text-xs font-medium text-teal-600 hover:text-teal-700 whitespace-nowrap`, wrapped in **`purchaseCtaAllowed()`** from `lib/commerce-policy.ts`.

🔴 **That guard is App Store 3.1.1/3.1.3 compliance, not decoration** — a purchase CTA must not render inside the native iOS shell. It is belt and braces here, because the whole auto-replies card already sits inside `!isNativeApp()`, and it stays precisely because the predicate is how this codebase states the rule: a future change to that wrapper must not silently ship an iOS violation. `requiredPlan('whatsapp_replies')` returns `'pro'`, consistent with "included on Pro and Max".

⚠️ **`FeatureGate` itself was not used.** It renders its own bordered panel with its own sentence ("This feature requires the Pro plan"), its own price line and its own layout — which would put a second, different message beside the exact wording this box is required to show, inside a box whose layout is fixed. **The link is the reusable part; the copy is not.**

### Removed state

**`whatsappSender`** — `const [whatsappSender] = useState(truck.whatsapp_sender ?? '')`. A read-only `useState` with **no setter**, whose only consumer was the disabled input. Deleting the input orphaned it, so it was removed. Confirmed by the zero `no-unused-vars` delta in §5d — nothing else referenced it.

⚠️ A comment now records that if `WHATSAPP_LIVE` is ever flipped back to `false`, **every** truck lands on this branch and the plan sentence becomes wrong for Pro and Max. A coming-soon branch must be restored in that change.

---

## 5. Proofs

### 5a. Copy check, with positive controls

The checker **strips comments before counting** — crudely but safely in one direction: it can only ever remove too much, so anything it still reports is genuinely in rendered copy.

```
════ NEW STRINGS — rendered copy, comments stripped ════
  ✓ footnote 6 — full sentence 1                 1 (want 1)
  ✓ shared sentence 2 (footnote + summary)       2 (want 2)
  ✓ footnote 6 — "so check with Meta"            1 (want 1)
  ✓ AI disclosure (footnote 4 + footnote 6)      2 (want 2)
  ✓ summary — trailing "for changes."            1 (want 1)
  ✓ expander — "Meta includes"                   1 (want 1)
  ✓ else branch — plan helper line               1 (want 1)

════ RETIRED STRINGS — must be 0 in rendered copy ════
  ✓ "Meta currently includes"                    0   (still quoted in 1 comment)
  ✓ "The first 1,000 each month are free"        0
  ✓ "Responses are AI-generated"                 0   (still quoted in 1 comment)
  ✓ "bills you directly"                         0   (still quoted in 1 comment)

════ NO LITERALS INSIDE THE COPY — consuming files only ════
  ✓ literal "16 September 2026" in rendered copy: 0
  ✓ literal "1 October 2026"    in rendered copy: 0
  ✓ literal "1,000"             in rendered copy: 0

════ "Requires a WhatsApp Business account." — MOVED, NOT RETIRED ════
  ✓ appears 1x, in the live branch only (showRequiresAccountHelper present)

════ POSITIVE CONTROLS ════
  ✓ finds a string that is present
  ✓ does not find an invented string
  ✓ strips comments (retired wording survives in raw, not in code)
  ✓ the two dates are declared exactly once each in copy.ts

✅ all copy checks passed
```

⚠️ **The retired wording is still quoted in three code comments**, which is deliberate — this codebase documents what a string used to say — and is why the checker measures rendered copy rather than raw bytes. The third control proves the stripper actually works, by requiring that "Meta currently includes" is found in raw source and **not** found in stripped code. Without that control, "0 occurrences" could mean "the search is broken".

🔴 **Two of my own expectations were wrong, and the test was corrected rather than the code:**

1. **AI disclosure, expected 1, found 2.** The second is footnote 4, which already carried the sentence. Asserting 1 would have been asserting a drift into existence. Expectation corrected to 2, with the reason in the file.
2. **"Requires a WhatsApp Business account.", expected 0, found 1.** The survivor is the **live** branch at `app/manage/[token]/page.tsx:10167`. It was only ever to leave the else branch. Moved out of the retired list into its own check, which now also asserts it sits with `showRequiresAccountHelper`.

### 5b. Harnesses — all five pass

| Harness | Result |
|---|---|
| `whatsapp-background-jobs-harness.cjs` | ✅ 48 passed |
| `whatsapp-connection-view-harness.cjs` | ✅ 87 passed |
| `whatsapp-golive-parity-harness.cjs` | ✅ **19** passed (was 13) — 3 broken variants still fail first |
| `whatsapp-settings-row-harness.cjs` | ✅ 131 passed |
| `whatsapp-setup-machine-harness.cjs` | ✅ 30 passed |

**Only copy assertions were touched, in one harness. Both changed because the approved copy changed, not because they failed on their merits:**

| # | Before | After |
|---|---|---|
| 1 | `footnote 6 carries the exact billing sentence` → `includes('Meta bills your WhatsApp account for replies, not HatchGrab. The first 1,000 each month are free.')` | split into `footnote 6 — prerequisite sentence` → `includes('Auto-replies need a WhatsApp Business account.')` and `footnote 6 — who bills` → `includes('Meta, not HatchGrab, bills your WhatsApp account for replies.')` |
| 2 | `footnote 6 keeps the AI disclosure` → `includes('Responses are AI-generated and can occasionally be wrong.')` | `footnote 6 — AI disclosure` → `includes('Replies are AI-generated and can occasionally be wrong.')` |

**Six assertions were added**, so the harness is stricter than before rather than merely re-pointed:

- the two dates asserted **as rendered text** — `'From 1 October 2026 the first 1,000 a month are free.'` and `'Correct at 16 September 2026; Meta may change its prices, so check with Meta.'`
- 🔴 `footnote 6 has no unrendered interpolation` — `!/undefined|\$\{/`. A broken interpolation compiles and type-checks perfectly happily; this is the only check that catches it.
- three assertions that the retired sentences are **absent**, so reinstating any of them fails the build.

The parity harness's own broken variants (V1 flag-true-but-coming-soon, V2 live-cell-where-canAccess-denies, V3 flag-false-but-live) each still report FAILURE first.

### 5c. Evaluated, not asserted — what each truck sees

```
── plan 'starter'  canAccess=false  ->  ELSE branch
   title   : "WhatsApp"
   helper  : "WhatsApp auto-replies are included on Pro and Max."
   link    : "Upgrade →" -> ?tab=billing   (only when purchaseCtaAllowed())
   NO disabled number input, NO "Requires a WhatsApp Business account."

── plan 'trial'  canAccess=true  ->  LIVE branch
   billing summary : Meta, not HatchGrab, bills your WhatsApp account for replies.
                     From 1 October 2026 the first 1,000 a month are free.
                     Correct at 16 September 2026; check Meta's pricing for changes.
   expander line   : From 1 October 2026, Meta includes 1,000 free replies a month
                     per number; after that, each reply is charged at Meta's rate.
```

Executed against the real `lib/features.ts`, `lib/whatsapp-live.ts` and `lib/whatsapp/copy.ts`. A **trial** truck (Pizzeria Gusto) takes the live branch because `TRIAL_FEATURES` spreads `MAX_FEATURES`, which spreads `PRO_FEATURES`, which grants `whatsapp_replies`. **Starter** is denied by `canAccess`, so the `&&` fails regardless of the flag.

### 5d. TypeScript and lint

- `npx tsc --noEmit` — ✅ **clean, whole project.**
- eslint on the three changed source files against a clean `HEAD` worktree (`git worktree add --detach`, symlinked `node_modules`, `-f json`, tallied by rule):

```
HEAD: 283 errors, 75 warnings
NOW : 283 errors, 75 warnings
delta 0 on every rule (12 rules compared)
```

🟢 The `no-unused-vars` count is unchanged at 50, which is the evidence that removing `whatsappSender` left nothing dangling **and** introduced nothing new.

### 5e. Manual checklist

1. **Pricing / compare page** — footnote 6 under the table reads the §2 "After" text. Check the **features PDF** too: same string, and it must say "check with Meta" rather than showing a dead link.
2. **A trial truck's Settings → WhatsApp → Billing** — the summary line reads as §5c, with **Meta's pricing** as a working link opening in a new tab.
3. **Same box, "How Meta charges" expander** — opens; the paragraph now begins "From 1 October 2026, Meta includes 1,000 free replies…"; **both** links still work.
4. **A starter truck's Settings → WhatsApp** — title, one helper line, "Upgrade →" going to `?tab=billing`. **No greyed number field.**
5. **Narrow width (~360px)** — the summary line now runs to four sentences with an inline link; check it wraps without pushing the box wide, and that "Upgrade →" does not wrap mid-arrow (`whitespace-nowrap` is on it).
6. **iPad / iPhone app** — the auto-replies card stays hidden entirely (`!isNativeApp()` untouched), so the upgrade link cannot appear there.

**What I cannot prove from here:** rendered appearance at any width, PDF layout, and whether a CDN-cached `/landing` or compare page still serves the old footnote after deploy.

---

## 6. Finish — the tree

```
 M lib/whatsapp/copy.ts         1: META_PRICING_CHECKED_ON and META_FREE_ALLOWANCE_FROM declared
 M lib/plan-features.ts         2: footnote 6 rewritten; imports the two dates and formatLimit
 M app/manage/[token]/page.tsx  3a/3b/4: billing summary, expander phrase, else branch, whatsappSender removed
 M scripts/whatsapp-golive-parity-harness.cjs   5b: two copy assertions updated, six added
```

`git diff --stat` for the two files this workstream touched alone:

```
 lib/plan-features.ts | 104 +++++++++++++++++++++++++++++++++++++-------
 lib/whatsapp/copy.ts |  28 ++++++++++++
```

⚠️ **`app/manage/[token]/page.tsx` reports 595 changed lines, and almost all of that is earlier workstreams** (box layout, payment row, channel boxes, background jobs, go-live), uncommitted when this one began. **Git cannot separate them.** This workstream's share of that file is three copy edits, the else-branch replacement, one import line and one deleted `useState`.

**No SQL, no migration.** Nothing staged, committed, stashed, checked out, reset or restored; `git add` was not run in any form.
