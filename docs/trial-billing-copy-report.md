# Trial billing copy — "automated billing activates" was false

Date: 14 August 2026
Status: DIAGNOSED, then FIXED. **One file changed: `app/manage/[token]/page.tsx`. Copy only.**
`tsc --noEmit` clean. Non-ASCII census **176 → 176, none gained, none lost.**

No `next dev`, no `next build`, no commit, no deploy, no migration, no write of any kind.

🔴 **Pizzeria Gusto reads the corrected sentence on its own Billing tab.** Nothing about its plan, its
`trial_expires_at`, any gate, or any stored value was touched — verified by diff in section 7.

⚠️ **Nothing in the prompt arrived garbled. No instruction contradicted another.** The scope fence held:
neither replacement string says anything about what happens at expiry.

🔴 **TWO THINGS ARE FLAGGED FOR YOUR DECISION AND WERE DELIBERATELY NOT CHANGED** — section 5. One of
them is a live sentence, eleven words below the one I corrected, that **already promises the Starter
fallback your fence says does not exist.** I did not paraphrase it and I did not delete it.

---

## PART 1 — DIAGNOSIS

### a. The current string and its render condition

**Site A — Manage → Billing**, [app/manage/[token]/page.tsx:10387-10398](app/manage/[token]/page.tsx#L10387-L10398)
(line numbers as found, before the edit):

```tsx
{truck.trial_expires_at && purchaseCtaAllowed() && (
  <>
    <p className="text-xs text-center text-slate-500 mt-3">
      🔒 You won&apos;t be charged anything until your trial ends on{' '}
      {formatTrialEndDate(truck.trial_expires_at)}.
      Automated billing activates at the end of your trial — cancel anytime before then at no cost.
    </p>
    <p className="text-xs text-center text-slate-400 mt-1">
      *Standard card processing fees apply on online orders
    </p>
  </>
)}
```

**Three conditions must all hold for it to render:**

| Condition | Meaning |
|---|---|
| The enclosing `plan === 'trial'` block ([:10301](app/manage/[token]/page.tsx#L10301)) | trial trucks only |
| `truck.trial_expires_at` truthy | 🔴 **a NULL expiry hides this paragraph entirely** — the fact that decides question 2a |
| `purchaseCtaAllowed()` | suppressed on iOS (App Store 3.1.1/3.1.3) |

⚠️ **The `truck.trial_expires_at &&` conjunct is load-bearing for the fix.** It is what makes the NULL
case unreachable at this site — see section 4.

### b. Every other place claiming something about expiry, billing, charging or cancelling

**You expected duplication. There is exactly one duplicate, and it is worse than the original.**

| # | Site | Exact wording | Verdict |
|---|---|---|---|
| **A** | [app/manage/[token]/page.tsx:10390-10392](app/manage/[token]/page.tsx#L10390) — **Billing tab** | *"🔒 You won't be charged anything until your trial ends on {date}. Automated billing activates at the end of your trial — cancel anytime before then at no cost."* | 🔴 **FALSE — REPLACED** |
| **B** | [app/manage/[token]/page.tsx:759-760](app/manage/[token]/page.tsx#L759) — **trial reminder popup** | *"You won't be charged anything until your trial ends on **{date}**."* | 🔴 **FALSE (same claim) — REPLACED** |
| **B2** | [app/manage/[token]/page.tsx:761](app/manage/[token]/page.tsx#L761) — same paragraph, next sentence | *"Choose your plan before then — if you don't, access will revert to the free Starter tier and some features will stop working."* | 🔴 **PROMISES THE UNBUILT FALLBACK — NOT CHANGED, see §5.1** |
| C | [content/legal/terms-and-conditions.md:65](content/legal/terms-and-conditions.md#L65) | *"**Free trials.** We may offer a free trial. At the end of a trial your account moves to the free plan unless you have chosen a paid plan. We will tell you before your trial ends."* | 🔴 **SAME UNBUILT PROMISE, IN THE LEGAL TERMS — NOT CHANGED, see §5.2** |
| D | [app/manage/[token]/page.tsx:10406](app/manage/[token]/page.tsx#L10406) | *"⏱ Set up payment before your trial ends to keep access"* | ⚠️ an instruction, not a billing claim. **Unchanged** — §5.3 |
| E | [app/manage/[token]/page.tsx:10346](app/manage/[token]/page.tsx#L10346) | *"You're on Max features. Choose a plan before your trial ends to keep access."* | ✅ **true and makes no billing claim.** Unchanged |
| F | [lib/settings-copy.ts:62-64](lib/settings-copy.ts#L62-L64) `TRIAL_NOT_STARTED_BILLING` | *"You have every Max feature while you set up. You choose which event starts your free trial - until then, nothing is counting down."* | ✅ **the NULL-expiry copy, already correct.** Unchanged — §4 |
| G | [lib/settings-copy.ts:49-50](lib/settings-copy.ts#L49-L50) `TRIAL_NOT_STARTED_BY_EVENTS` | *"Adding events doesn't start your free trial — you choose which event starts it, later."* | ✅ makes no billing claim. Unchanged |
| H | [lib/settings-copy.ts:104-106](lib/settings-copy.ts#L104-L106) `CONNECTING_STRIPE_NOT_A_COMMITMENT` | *"Setting this up doesn't start your subscription or charge you anything today. It's how your customers pay you — your plan is separate."* | ✅ **already says exactly what the new copy says.** Unchanged |
| I | [app/manage/[token]/page.tsx:10304-10305](app/manage/[token]/page.tsx#L10304) | *"We're setting up our payment system. During early access, billing is handled manually. We'll contact you when automated billing is ready."* | ✅ **states billing is NOT automated yet** — corroborates the fix. Unchanged |
| J | [app/manage/[token]/page.tsx:10547](app/manage/[token]/page.tsx#L10547) | *"We're setting up automated billing. To upgrade now, drop us a message and we'll get you set up within 24 hours."* | ✅ same — upgrading is a manual, human step. Unchanged |
| K | [app/landing/page.tsx:298](app/landing/page.tsx#L298) | *"…**adding online payments doesn't start your subscription**. You're only charged when you actively select a paid plan. We'll never charge you without your clear permission. No card to start, cancel anytime."* | ✅ **already the correct model, in public marketing.** Unchanged |
| L | [app/landing/page.tsx:178](app/landing/page.tsx#L178), [:465](app/landing/page.tsx#L465) | *"Cancel anytime, no contract"* | ✅ on the **paid-plan** cards, where a subscription genuinely would exist. Unchanged |
| M | [content/legal/terms-and-conditions.md:62](content/legal/terms-and-conditions.md#L62) | *"**No contract, cancel anytime.** There is no minimum term and no notice period."* | ✅ about paid plans. Unchanged |
| N | [lib/email-signup.ts:167-173](lib/email-signup.ts#L167-L173) | — | ✅ **no email makes any trial-billing claim.** The comment records that the trial paragraph was *deliberately omitted* from the signup email for this exact reason |

🔴 **The one genuinely encouraging finding:** the landing page (K), the Stripe reassurance (H) and the
billing-not-ready notices (I, J) **already describe the correct model** — you are only charged when you
actively pick a paid plan. The two sentences I replaced were the outliers, not the norm.

⚠️ **No email template needed touching**, so item 2c's "stop rather than paraphrase for an email" never
arose.

### c. Shared constant or inline?

🔴 **Inline at both sites, and they are not identical strings — so this was two edits, not one.**

- Site A is a bare JSX literal inside `BillingTab`.
- Site B is a bare JSX literal inside `ManagePage`, ~9,600 lines away, with the date wrapped in
  `<strong>` and a *different* trailing sentence.

**They are not extracted, which is why they drifted:** A says billing *activates automatically*, B says
access *reverts to Starter*. **Two hand-written accounts of the same non-existent mechanism, disagreeing
with each other.**

⚠️ **`lib/settings-copy.ts` exists precisely for this** — its header says *"Two hand-maintained copies of
one sentence is the whole problem. One constant, two readers, is the only arrangement in which they
cannot disagree."* The trial *not-started* copy already lives there (F, G). **The dated copy does not**,
and [lib/settings-copy.ts:56-57](lib/settings-copy.ts#L56-L57) says so explicitly: *"A truck with a real
date keeps the existing dated copy untouched."*

🔴 **I did NOT extract these two into `settings-copy.ts`.** They are now similar but still not identical
(B carries the `<strong>` and the extra sentence), extraction is a structural change rather than a copy
change, and item 2b forbids changing what a surface does. **It is the obvious follow-up and it is not
this task.**

### d. How the date is rendered, and what NULL produces

**One formatter, defined at [app/manage/[token]/page.tsx:10057-10058](app/manage/[token]/page.tsx#L10057-L10058):**

```tsx
const formatTrialEndDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
```

⚠️ There is a **second, unrelated** `formatDate` at [:10102](app/manage/[token]/page.tsx#L10102) used by
the "Trial ends {date}" lines at [:10313](app/manage/[token]/page.tsx#L10313) and
[:10330](app/manage/[token]/page.tsx#L10330). **Neither of those was touched.**

**Traced by execution, not by reading** (`node -e` against the identical expression):

| Input | `formatTrialEndDate` returns |
|---|---|
| `'2026-12-31'` | `31 December 2026` |
| `null` | 🔴 **`1 January 1970`** — `new Date(null)` is the epoch, not invalid |
| `undefined` | `Invalid Date` |
| `''` | `Invalid Date` |

**So what actually happens on a NULL `trial_expires_at`? Neither. The block is hidden.**

| Site | NULL behaviour | Why |
|---|---|---|
| **A — Billing tab** | 🔴 **the whole paragraph is not rendered** | `truck.trial_expires_at &&` at [:10387](app/manage/[token]/page.tsx#L10387) short-circuits. `formatTrialEndDate` is never called, so `1 January 1970` never reaches a screen |
| **B — reminder popup** | 🔴 **the popup itself never opens** | the trigger effect returns early: [:440](app/manage/[token]/page.tsx#L440) `if (!truck.trial_expires_at) return` |

⚠️ **Site B carried a `: 'soon'` fallback** (`{truck.trial_expires_at ? formatTrialEndDate(...) : 'soon'}`)
which would have rendered **"You won't be charged anything until your trial ends on soon."** — broken
English *and* a false claim. **It was unreachable dead code**, guarded by [:440](app/manage/[token]/page.tsx#L440),
and it is now gone (section 3).

**What a NULL-expiry truck sees instead**, and it is already correct: the heading
`TRIAL_NOT_STARTED_HEADING` — *"Your free trial has not started yet"* — and `TRIAL_NOT_STARTED_BILLING`
at [:10331](app/manage/[token]/page.tsx#L10331)/[:10348](app/manage/[token]/page.tsx#L10348).

---

## PART 2 — THE FIX

### 2. Site A — Manage → Billing

**Before:**
```tsx
🔒 You won&apos;t be charged anything until your trial ends on{' '}
{formatTrialEndDate(truck.trial_expires_at)}.
Automated billing activates at the end of your trial — cancel anytime before then at no cost.
```

**After:**
```tsx
🔒 You won&apos;t be charged anything during your trial, which runs until{' '}
{formatTrialEndDate(truck.trial_expires_at)}.
Billing only ever starts when you choose a plan and enter your payment details.
Until then there&apos;s nothing to cancel and nothing to pay.
```

**Renders for Gusto as:** *"🔒 You won't be charged anything during your trial, which runs until
31 December 2026. Billing only ever starts when you choose a plan and enter your payment details. Until
then there's nothing to cancel and nothing to pay."*

⚠️ **Two things preserved deliberately, neither of them a paraphrase:**
- **The 🔒 padlock stays.** Your quoted copy was the prose; the icon is the surface's existing decoration,
  and removing it would be changing what the surface looks like rather than what it says.
- **`&apos;` not `'`.** The file's existing convention (`won&apos;t` was already there). Same rendered
  character, and it keeps the census flat.

**Your string is used verbatim.** Nothing was reworded, reordered or abbreviated.

### 3. Site B — the trial reminder popup

**Before:**
```tsx
<p className="text-sm text-orange-700 mt-1">
  You won&apos;t be charged anything until your trial ends on{' '}
  <strong>{truck.trial_expires_at ? formatTrialEndDate(truck.trial_expires_at) : 'soon'}</strong>.
  Choose your plan before then — if you don&apos;t, access will revert to the free Starter tier and some features will stop working.
</p>
```

**After:**
```tsx
<p className="text-sm text-orange-700 mt-1">
  {truck.trial_expires_at ? (
    <>
      You won&apos;t be charged anything during your trial, which runs until{' '}
      <strong>{formatTrialEndDate(truck.trial_expires_at)}</strong>.
    </>
  ) : (
    <>You won&apos;t be charged anything while you&apos;re on trial.</>
  )}
  {' '}Billing only ever starts when you choose a plan and enter your payment details.
  Until then there&apos;s nothing to cancel and nothing to pay.
  Choose your plan before then — if you don&apos;t, access will revert to the free Starter tier and some features will stop working.
</p>
```

🔴 **This is where BOTH of your strings are used, and the ternary is what makes 2a satisfiable.** The
dated branch takes your dated copy; the NULL branch takes your NULL copy **word for word**, replacing the
`'soon'` fallback that would have produced *"your trial ends on soon"*.

⚠️ **The render condition was NOT touched.** The popup still cannot open on a NULL expiry
([:440](app/manage/[token]/page.tsx#L440) is unchanged), so **the NULL branch is written correctly but
remains unreachable.** I wrote it out anyway because a correct unreachable branch costs nothing and
removes the trap if that guard ever moves — **but it is not a behaviour change, and you should not expect
to see it.**

### 4. 🔴 ANSWERING 2a DIRECTLY — the NULL case, per site

> *"The NULL case must read correctly and must never emit a broken or empty date. If the current code
> cannot distinguish the two cases without a structural change, say so and stop."*

**The two cases are distinguishable at both sites without any structural change, and nothing broken or
empty can be emitted. But the answer differs per site, and one half needs your ruling:**

| Site | Can it distinguish? | NULL copy rendered? |
|---|---|---|
| **B — popup** | ✅ **yes** — a `truck.trial_expires_at` ternary was already in the JSX. Swapping the two full sentences in is pure copy | ✅ **your NULL string is in the code**, on the (unreachable) NULL branch |
| **A — Billing tab** | ✅ **yes** — `truck.trial_expires_at` is the gate itself | ❌ 🔴 **NO, and I stopped rather than force it** |

🔴 **Why site A does not carry your NULL string.** Its paragraph is gated `truck.trial_expires_at && …`.
To render *"You won't be charged anything while you're on trial…"* there, I would have to **remove that
conjunct** — which makes a paragraph appear on a screen where nothing appears today. That is a change to
**what the surface does**, which item 2b forbids, so I did not make it.

**And it would arguably be wrong on the merits:** a NULL-expiry truck already reads
`TRIAL_NOT_STARTED_BILLING` twelve lines above — *"You have every Max feature while you set up. You
choose which event starts your free trial - until then, nothing is counting down."* Adding your NULL
sentence beneath it would give that operator **two reassurances about the same non-charge**.

⚠️ **So: if you want the NULL copy visible on the Billing tab, that is a one-conjunct gate change and a
decision about whether it duplicates `TRIAL_NOT_STARTED_BILLING`. Say the word and it is a two-line edit.
Until then, no NULL-expiry truck can see a broken or empty date on either site — which is what 2a
actually requires.**

### 5. 🔴 WHAT I DID NOT CHANGE, AND WHY — per item 2c, I am telling you rather than paraphrasing

**5.1 — [app/manage/[token]/page.tsx:761](app/manage/[token]/page.tsx#L761), the sentence immediately after the one I fixed:**

> *"Choose your plan before then — if you don't, access will revert to the free Starter tier and some
> features will stop working."*

🔴 **This promises exactly the behaviour your fence says does not exist:** *"A separate piece of work will
later make an expired trial fall back to the free Starter plan. That behaviour does NOT exist yet."*
**This live sentence already promises it, today, to Gusto.**

**Neither of your two replacement strings covers it** — both end at *"nothing to cancel and nothing to
pay"*. Rewriting or deleting it would mean me inventing wording, which 2c forbids. **So it is untouched
and the paragraph now reads:**

> *"You won't be charged anything during your trial, which runs until **31 December 2026**. Billing only
> ever starts when you choose a plan and enter your payment details. Until then there's nothing to cancel
> and nothing to pay. Choose your plan before then — if you don't, access will revert to the free Starter
> tier and some features will stop working."*

⚠️ **Read that whole paragraph before deciding.** The first three sentences are now true; the fourth
describes a downgrade nothing implements. **It needs a ruling from you — delete it, or supply
replacement wording.** I did not choose.

**5.2 — [content/legal/terms-and-conditions.md:65](content/legal/terms-and-conditions.md#L65):**

> *"**Free trials.** We may offer a free trial. At the end of a trial your account moves to the free plan
> unless you have chosen a paid plan. We will tell you before your trial ends."*

🔴 **The same unbuilt promise, in the legal terms.** Unchanged for two reasons: it is **legal copy**, not
product copy, and your brief scoped the fix to *"the billing tab, plan cards, any trial banner, any email
template"*. ⚠️ **Arguably it is the one place the promise SHOULD live ahead of the build** — a term that
commits you to the more generous outcome is safe in a way that a product screen implying billing has
started is not. **Flagged, not touched.**

**5.3 — [app/manage/[token]/page.tsx:10406](app/manage/[token]/page.tsx#L10406):** *"⏱ Set up payment
before your trial ends to keep access"*. An **instruction**, not a claim that billing starts by itself.
It survives the fix's logic (setting up payment is precisely the deliberate act the new copy names).
**Unchanged** — but note it sits directly under the corrected paragraph, so if you rule on 5.1 you may
want to look at this in the same pass.

---

## 6. THE COMMENTS I ADDED

Both edits carry a block comment recording the old string, why it was false, and — at site A — that the
copy **deliberately says nothing about expiry**, so a future reader does not "helpfully" restore a
sentence about what happens at the end.

⚠️ **This is why greps in section 7 still find "Automated billing activates":** it survives **only inside
a comment quoting the removed line**. No operator-visible string contains it.

---

## 7. VERIFICATION

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ **clean, exit 0** |
| Non-ASCII census, `app/manage/[token]/page.tsx` | ✅ **176 classes before, 176 after — byte-identical class list, none gained, none lost** (diff of the two sorted lists is empty) |
| Files changed by this task | ✅ **one** — `app/manage/[token]/page.tsx` |
| Migration written or run | ✅ none |

### Grep-confirm: no claim that automatic billing starts by itself survives

```
grep -rniE "automated billing|billing activates|billing (will start|starts automatically)|automatically billed|auto-?renew" app lib components content
```

**Three hits, all benign:**

| Hit | Status |
|---|---|
| [:10412](app/manage/[token]/page.tsx#L10412) | 🔴 **inside my new comment**, quoting the deleted line. Not rendered |
| [:10305](app/manage/[token]/page.tsx#L10305) *"We'll contact you when automated billing is ready."* | ✅ says billing is **not** automated yet — the opposite claim |
| [:10547](app/manage/[token]/page.tsx#L10547) *"We're setting up automated billing. To upgrade now, drop us a message…"* | ✅ same; upgrading is explicitly a manual, human step |

```
grep -rn "until your trial ends on" app lib components
```
**Two hits, both inside my new comments** quoting the old copy. **Zero live strings.**

### Grep-confirm: no gate, plan value or stored field changed

```
git diff -U0 app/manage/[token]/page.tsx | grep '^[+-]' | grep -iE "canAccess|hasFeature|plan\s*[:=]|trial_expires_at\s*=|setTruck|api\(|fetch\(|update|insert|purchaseCtaAllowed\(\)\s*&&|showTrialReminder\("
→ NONE
```

**No match.** Specifically:
- `canAccess` / `hasFeature` — **not in the diff at all**
- `plan` — not assigned or compared anywhere in the diff
- `trial_expires_at` — appears **only as a read**, in the two ternary conditions and the two
  `formatTrialEndDate(...)` calls. **Never assigned**
- `purchaseCtaAllowed()` — **not in the diff**; site A's gate is byte-identical
- The popup trigger effect ([:437-451](app/manage/[token]/page.tsx#L437-L451)) — **not in the diff**
- No `api()`, `fetch()`, `update` or `insert` anywhere in the diff. **This change cannot write anything**

**The whole diff is +41/−4 lines: two JSX literals and two explanatory comments.**

---

## 8. 🔴 WHAT I HAVE NOT EXERCISED

1. **Nothing was rendered. There is no browser in this loop.** Both "renders as" quotations are the JSX
   read as text. ⚠️ **The JSX whitespace is the specific thing worth a glance:** site B now joins a
   fragment to following text with `{' '}`, and site A relies on JSX collapsing four source lines into
   one spaced sentence. `tsc` proves it compiles; it does not prove there is exactly one space between
   *"31 December 2026."* and *"Billing only ever starts"*.
2. **Gusto's Billing tab was not opened.** The claim that it now reads the corrected sentence follows
   from its `plan = 'trial'` and non-NULL expiry making the unchanged gate truthy — **a boolean argument
   over an untouched condition, not an observation.**
3. **No data was read this turn.** Gusto's trial date is taken from your brief (31 December 2026);
   [lib/settings-copy.ts:73](lib/settings-copy.ts#L73) records 17 October 2026. **I did not query the
   database to resolve that discrepancy** — it does not affect the copy, which interpolates whatever the
   column holds, but the two documents disagree and one of them is stale.
4. **The popup was not triggered.** It needs `plan === 'trial'`, a non-NULL expiry within two months,
   and a `localStorage` key that is not today's date. **I did not verify the corrected paragraph in situ**,
   and its NULL branch is unreachable by construction (§4), so **that branch has never rendered and never
   will under the current guard.**
5. **iOS was not checked.** Site A is `purchaseCtaAllowed()`-gated and I did not exercise the suppressed
   path; the gate is untouched, so the iOS behaviour is whatever it was.
6. **I did not verify that no Starter fallback exists.** §5.1 and §5.2 call that promise unbuilt **on the
   authority of your scope fence**, not from reading `canAccess`'s expired branch — which item 2b told me
   not to touch, and which I therefore did not open.
