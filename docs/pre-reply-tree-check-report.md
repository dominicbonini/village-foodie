# Pre-reply tree check — read-only

**Date:** 25 August 2026
**READ-ONLY. Nothing was changed.** No edit, no commit, no push, no deploy, no build, no `next dev`.

🔴 **I CANNOT SEE VERCEL FROM THE REPOSITORY.** Everything below is about what is **committed and
pushed**. **Deployment is unverified** — whether any of it is live on the device is not a question this
report can answer.

---

# §1 — WORKING TREE STATE

## 1.1 ✅ THE TREE IS COMPLETELY CLEAN

```
  $ git status --porcelain --untracked-files=all
  (no output)
```

✅ **NOTHING modified. NOTHING staged. NOTHING untracked** — not even the report files, which are
committed too.

## 1.2 ✅ BRANCH AND REMOTE

```
  ## main...origin/main
  behind origin/main: 0     ahead of origin/main: 0
```

**Branch `main`, exactly level with `origin/main`.** ✅ **Nothing is sitting locally waiting to be
pushed.** Everything from today is on the remote.

## 1.3 TODAY'S COMMITS

```
  1d85241  11:26  ipad
  08eca98  11:16  ipad changes
  e0fe83f  09:55  cost compare updates
```

## 1.4 ✅ ALL FOUR CHANGES ARE COMMITTED — NONE IS SITTING IN THE WORKING TREE

Attributed by searching for each change's own marker string (`git log -S`):

| # | Change | Commit | Status |
|---|---|---|---|
| 1 | Auto-replies native hide | **`08eca98`** 11:16 | ✅ **committed + pushed** |
| 2 | Billing copy rewrite | **`08eca98`** 11:16 | ✅ **committed + pushed** |
| 3 | Billing block ungate | **`1d85241`** 11:26 | ✅ **committed + pushed** |
| 4 | Deletion auth fix — component header | **`08eca98`** 11:16 | ✅ **committed + pushed** |
| 4 | Deletion auth fix — route Bearer fallback | **`08eca98`** 11:16 | ✅ **committed + pushed** |

🔴 **NOTHING IS UNCOMMITTED. There is no change from today that cannot deploy.**

---

# §2 — NATIVE PROJECT: ✅ **NO. THE CURRENT BINARY IS UNAFFECTED. NO NEW BUILD IS REQUIRED.**

**Every file touched by today's three commits, in full:**

```
  app/api/account/request-deletion/route.ts
  app/contact/HatchGrabContact.tsx
  app/landing/cost/CostComparison.tsx
  app/manage/[token]/page.tsx
  components/manage/DeleteAccountSection.tsx
  docs/  × 8 report files
```

**Checked explicitly, across all three commits AND the working tree:**

| Surface | Result |
|---|---|
| Anything under `ios/` | ✅ **NONE** |
| `Info.plist` | ✅ **NONE** |
| Any `.entitlements` | ✅ **NONE** |
| `capacitor.config.ts` / `.json` | ✅ **NONE** |
| Any `.swift`, `.storyboard`, `.xcassets` | ✅ **NONE** |
| `Podfile`, `.xcodeproj`, `.xcworkspace` | ✅ **NONE** |
| `package.json` / `package-lock.json` | ✅ **NONE — 0 files matched in today's diff** |
| Any `@capacitor/*` version | ✅ **NONE — no capacitor line in any package.json diff** |

✅ **PLAINLY: NO. Nothing today touched the native project.** Five web files and eight documents.
**Your reply does not need a new build on account of anything done today.**

⚠️ **One correction to my own working: an intermediate check printed "package.json ^^ touched".** That
was a false positive from a shell `&&` firing on git's exit code with empty output. **The definitive
count is 0 files.**

---

# §3 — THE FOUR CHANGES, CONFIRMED PRESENT IN THE CODE

## 3.1 ✅ THE AUTO-REPLIES CARD IS WRAPPED

```
  L9251        {!isNativeApp() && (
  L9252        <Card className="p-4 space-y-3">
  …
  L9434        </Card>
  L9435        )}
```

✅ **The wrapper spans the WHOLE card** — verified by matching the exact open/close pair, not by
eyeballing line numbers. ✅ **The "Auto-replies" heading is inside it** (`<p className="text-base
font-bold text-slate-800">Auto-replies</p>` found within the span), and so is `<WhatsAppReplyPreview`.
**No empty bordered box can be left behind on iPad.**

## 3.2 ✅ THE BILLING BLOCK, AND IT IS UNGATED

```tsx
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-amber-500 flex-shrink-0 mt-0.5">⚙️</span>
        <div>
          <p className="text-sm font-medium text-amber-800">Billing is managed by HatchGrab</p>
          <p className="text-xs text-amber-700 mt-0.5">
            During early access we set up and adjust plans manually.
          </p>
        </div>
      </div>
```

✅ **NO `purchaseCtaAllowed()` WRAPPER.** Between `const billingCard = (` and the block, the
comment-aware scanner counts **0** occurrences in code.

⚠️ **A raw grep reports 1** — that occurrence is inside the comment recording the gate's removal.
**The scanner is what settles it; do not read the raw count as a failure.**

## 3.3 ✅ CALL SITES: **ELEVEN** — ten + one, exactly as specified

Counted with the line-by-line comment-aware scanner, **not a regex**.

```
  app/manage/[token]/page.tsx : 10
     L431    if (truck?.plan === 'trial' && purchaseCtaAllowed()) setActiveTab('billing')
     L444    if (!purchaseCtaAllowed()) return
     L743    {showTrialReminder && truck && purchaseCtaAllowed() && (
     L10608  {purchaseCtaAllowed() && (
     L10996  ? (purchaseCtaAllowed()
     L11005  {purchaseCtaAllowed() && (
     L11038  {truck.trial_expires_at && purchaseCtaAllowed() && (
     L11068  {purchaseCtaAllowed() && (
     L11098  {purchaseCtaAllowed() && (
     L11162  {showUpgradeModal && purchaseCtaAllowed() && (
  components/FeatureGate.tsx  : 1
     L58     {purchaseCtaAllowed() && (

  TOTAL: 11
```

✅ **The number is eleven. There is nothing differing to name.**

## 3.4 ✅ THE DELETION AUTH FIX — BOTH LEGS PRESENT

**Leg 1 — `components/manage/DeleteAccountSection.tsx`:**
```
  L55    import { nativeAuthHeader } from '@/lib/native/session'
  L110   nativeAuthHeader()                                             ← the GET on mount
  L162   headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },   ← the POST
```
✅ **Both fetches carry it.**

**Leg 2 — `app/api/account/request-deletion/route.ts`:**
```
  L51    async function resolveOperator(req: NextRequest) {
  L66    const authz = req.headers.get('authorization')
  L67    const jwt = authz?.startsWith('Bearer ') ? authz.slice(7) : null
  L69    const { data: { user: bearerUser } } = await supabase.auth.getUser(jwt)
  L89    const operator = await resolveOperator(req)
  L144   const authz = req.headers.get('authorization')          ← POST's own inline copy
  L145   const jwt = authz?.startsWith('Bearer ') ? authz.slice(7) : null
  L147   const { data: { user: bearerUser } } = await supabase.auth.getUser(jwt)
```
✅ **Present in BOTH handlers**, because `POST` resolves the caller inline rather than calling
`resolveOperator` — recorded at the time in `docs/deletion-auth-fix-report.md` §3.1.

---

# §4 — 🔴 ANYTHING ELSE RIDING ALONG

✅ **Nothing is uncommitted or half-done — the tree is clean (§1.1).**

🔴 **BUT THE QUESTION BEHIND YOUR QUESTION HAS A DIFFERENT ANSWER, AND YOU SHOULD SEE IT BEFORE YOU
DEPLOY.** Commit **`e0fe83f` (09:55)** is already on `origin/main` and carries **three changes that are
not part of the four**. They will ship in the same deploy:

| File | What it is |
|---|---|
| `app/landing/cost/CostComparison.tsx` | The cost-comparison page — panel rebalance, scroll cue, caption, CTA relabel. **Behind a gate that only opens when pricing publishes or an admin views it.** Not reachable by a reviewer. |
| `app/manage/[token]/page.tsx` (+34/−22) | The Auto-replies **example-chip reorder** — chips moved above the text input. **Inside the card that commit `08eca98` later hides on iPad**, so a reviewer never sees it. |
| `app/contact/HatchGrabContact.tsx` | 🔴 **A `mailto:hello@hatchgrab.com` link added to the contact page — line 114 of HEAD.** |

## 4.1 🔴 THE ONE TO LOOK AT: THE CONTACT PAGE IS THE SUPPORT URL YOU GAVE APPLE

`https://www.hatchgrab.com/contact` is the Support URL on file, and that commit put a live email address
on it. **The repository still records that mailbox as not receiving:**

```
  lib/email-signup.ts:23   ⚠️ NOT LIVE YET. This mailbox must exist, and hatchgrab.com must be
                              SPF/DKIM-verified in Brevo, before the first real send.
  lib/email-config.ts      HATCHGRAB_SENDER = { email: 'hello@villagefoodie.co.uk',
                                                replyTo: 'hello@villagefoodie.co.uk' }
```

🔴 **THIS WAS FLAGGED WHEN IT WAS BUILT** (`docs/contact-email-and-cta-report.md` §2.2) and the check
was never reported back to me. **If that mailbox does not receive, a reviewer who emails it gets
silence — on the support page, during a 2.1 review.** ⚠️ **One test message settles it.** It is
committed and pushed either way; **I have changed nothing.**

---

# §5 — WHAT I RAN AND WHAT I READ

| | |
|---|---|
| **RAN** | `git status --porcelain --untracked-files=all`, `git status -sb`, `git rev-list --left-right --count`, `git log`, `git show --name-status`, `git diff --name-only`, `git log -S<marker>`, and the line-by-line comment-aware scanner over three files. |
| **READ** | The four changed regions in place; `lib/email-signup.ts`; `lib/email-config.ts`. |
| **NOT DONE** | 🔴 **No edit, no commit, no push, no deploy, no build, no `next dev`.** Nothing was tidied, formatted or fixed. |

🔴 **NOTHING IS OBSERVED ON A DEVICE**, and 🔴 **NOTHING HERE CLAIMS ANYTHING IS LIVE.** All four
changes are **committed and pushed to `origin/main`; deployment is unverified from the repository.**
