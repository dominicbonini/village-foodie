# demo-2c — the demo privacy text, made strictly true (31 October 2026)

This change applies the decisions on docs/demo-2b-report.md §1. It contains wording changes to the Privacy Policy, one new harness section that ties the wording to the code, and a stale comment fixed.

The date stays **31 October 2026**. `PRIVACY_UPDATED` and `TERMS_VERSION` are unchanged. `demo_events` is unchanged and nothing is hashed. There is no SQL and no Vercel change, and nothing was deployed, pushed or committed. No span of the brief was garbled, and no two instructions contradicted each other.

---

## 1 · The five edits

| # | Where | Change |
|---|---|---|
| 1 | Demo section, counts paragraph | "They contain no email address and cannot identify you." → "They contain no email address, and once your demo is deleted they can no longer be linked to you." |
| 2 | Demo section, deletion paragraph | Added after the expiry sentence: "If you sign up, we keep the demo record for up to 30 days so your menu can move into your account, then delete it." |
| 3 | Section 5, "Cookies and browser storage" | Added to the strictly-necessary examples: "…, and, while you try the demo, which demo orders you placed." |
| 4 | Section 7, "How long we keep data" | A new list line, last in the list: "**Demo data:** 24 hours, or 14 days if you ask us to keep your demo; up to 30 days if you sign up from it, or for demos we prepare for a food truck we have contacted (see section 5)." |
| 5 | Section 5, "Product analytics" | Added, because PostHog **does** load on the demo (see below): "It does run on the HatchGrab demo, which shows a sample kitchen screen." |

### Edit 2 matches `CLAIM_GRACE_DAYS` and the sweep: confirmed

- `app/api/cron/demo-cleanup/route.ts:47`: `const CLAIM_GRACE_DAYS = 30`.
- The expiry sweep skips claimed demos (`.is('claimed_by_operator_id', null)`).
- The claimed-demo sweep (`route.ts:153–157`) deletes a claimed demo only when it is **both** past `expires_at` **and** older than `CLAIM_GRACE_DAYS` from `created_at`. Signup does not extend `expires_at`, and every tier's expiry is 30 days or less (24 h, 14 d, outreach 30 d). So a claimed demo is deleted once it is 30 days old.
- The deletion goes through the same `sweep()` as any other demo. That deletes the truck (cascading to `demo_sessions`, which holds the email) and, since demo-2, the stored menu files.

Precisely, "up to 30 days" counts from **building** the demo, and is therefore also true counted from signing up. The sweep runs **hourly** (`vercel.json`, `0 * * * *`) and handles at most `BATCH_LIMIT = 200` demos per run. So deletion happens within the hour after day 30 unless more than 200 are due at once. That lag is normal for any scheduled deletion and is not stated in the policy.

### Edit 3: why the email pre-fill is NOT named

The walkthrough keeps two things in the tab's **session** storage, keyed by the demo's slug (`lib/demo-board-build.ts`): the keys of the orders the visitor placed, and the email they typed on the landing page, used to pre-fill "Start free".

The sentence is "only where they are strictly necessary to make the sites work —" followed by examples, not a complete list. The pre-filled email is input the visitor typed themselves, carried across the pages of a flow they started, and kept only for that tab's session. That is the same kind of storage as "keeping your basket", the textbook strictly-necessary, user-input case. So the sentence stays true without naming it, and per the brief it is not named. The order keys are different: without them the kitchen screen cannot show the visitor's own order, which is why they are named.

### Edit 5: does PostHog load on `/try/<slug>` and the demo order page? **Yes.**

- `app/layout.tsx:128` wraps every page in `CSPostHogProvider` (`app/providers.tsx`).
- **The deciding lines are `app/providers.tsx:87–88`:** `if (typeof window !== 'undefined' && !IS_EMBED_ENTRY && !IS_CUSTOM_HOST_ENTRY && !IS_CREDENTIAL_ENTRY) { posthog.init(…) }`.
- The only exclusions are:
  - `/embed` (`:35–36`);
  - hosts that are not ours (`IS_CUSTOM_HOST_ENTRY`);
  - credential routes, `CREDENTIAL_ROUTE_RE = /^\/(dashboard|manage|kds)(\/|$)/` (`:71`). The same rule drops events in `before_send` (`:113–119`) and skips the provider (`:161`).
- `/try/<slug>` and `/trucks/<slug>/order` match none of these, so PostHog initialises on both. It does so cookieless (`persistence: 'memory'`, `:135`), as the policy already says. That includes the order page framed inside the laptop walkthrough. The demo's real dashboard and KDS (`/dashboard/<token>…`) are still excluded.

---

## 2 · The final text

### The demo section (end of section 5), in full

> **If you try the HatchGrab demo**
>
> When you build a demo from the HatchGrab website, we ask for your email address. We use it to send you a link to your demo and may contact you about setting up HatchGrab; we do this because it is in our legitimate interest to follow up on a demo you asked for. If you tick "Send me occasional tips and news from HatchGrab", we will also send you occasional tips and news, based on your consent; you can unsubscribe at any time, and not ticking it does not affect your demo.
>
> We also keep the menu you upload (a photo, PDF or pasted text) and the menu we read from it. We send it to Google's Gemini service so it can read the dishes and prices, and we keep it so we can check how well that worked and help you if you go on to set up HatchGrab. It is stored privately; only HatchGrab staff can open it.
>
> We delete your demo email, the menu file and the demo itself when the demo expires: 24 hours after you build it, or 14 days if you ask us to keep it. If you sign up, we keep the demo record for up to 30 days so your menu can move into your account, then delete it. If you sign up, your menu moves into your account, and your account's privacy terms apply from then on.
>
> We keep anonymous counts of how far demos get, such as "a demo was built" or "an order was placed". They contain no email address, and once your demo is deleted they can no longer be linked to you.
>
> Demos we prepare for a food truck we have contacted are kept for up to 30 days and do not ask for an email.

### Every changed sentence outside it

- **Section 5, "Cookies and browser storage":**
  > **Cookies and browser storage.** We use cookies and your browser's local storage only where they are strictly necessary to make the sites work — signing you in, keeping your basket, remembering your preferences, such as your country and postcode, and, while you try the demo, which demo orders you placed. We do not use advertising or tracking cookies, and we do not track you across other websites.
- **Section 5, "Product analytics":**
  > **Product analytics.** We use PostHog to understand which pages and features are used: pages viewed and clicks, with basic browser and device details. It stores nothing in your browser — no cookies and no local storage — so it cannot recognise you from one visit to the next. It does not run on the operator dashboard, kitchen screen or management pages, or on truck pages shown on an operator's own website. It does run on the HatchGrab demo, which shows a sample kitchen screen.
- **Section 7, the new list line** (after "Technical and security logs: 90 days."):
  > - **Demo data:** 24 hours, or 14 days if you ask us to keep your demo; up to 30 days if you sign up from it, or for demos we prepare for a food truck we have contacted (see section 5).
- **Date line, unchanged:** `**Last updated:** 31 October 2026`.

### Two wording points for Dominic (not changed, as the brief gave the exact text)

- The counts paragraph still opens "We keep **anonymous** counts". With the new second sentence the paragraph as a whole is accurate, but "anonymous" on its own is still the word item 1 of demo-2b questioned. "We keep counts of how far demos get…" would remove the tension.
- The inserted sentence makes two sentences in a row start "If you sign up, …". They could be merged into one, for example: "If you sign up, your menu moves into your account and your account's privacy terms apply from then on; we keep the demo record for up to 30 days so it can, then delete it."

---

## 3 · Files changed (demo-2c only)

- `content/legal/privacy-policy.md`: the five edits above. The date is unchanged.
- `scripts/_demo2b-privacy.cjs`: **⚠️ RE-PINNED (demo-2c)**. It now pins the **final** section text (`SECTION`) and the three sentences outside it (`EDITS`, each an old→new pair that must apply exactly once). Every harness that reads it (anz-terms, canada-2, ireland-3, us-legal-draft) proves "the old document + exactly this change" without its own edit.
- `scripts/demo-2.cjs`: a new **§10** (3 checks) that fails if the policy's demo claims and the code drift apart:
  - the 24 h / 14 d / 30 d periods are `RETENTION_NO_EMAIL_HOURS`, `RETENTION_WITH_EMAIL_DAYS` and `RETENTION_OUTREACH_DAYS`;
  - the claimed-demo sentence matches `CLAIM_GRACE_DAYS = 30` and the sweep's both-conditions query;
  - PostHog's credential guard (read from `app/providers.tsx`) excludes neither `/try/…` nor `/trucks/…/order`, and the policy says it runs on the demo.
- `app/api/demo/return/route.ts`: the header comment no longer says the return link re-seeds orders. It now says the fresh service starts empty since demo-2. Comment only.

**Re-pinned because of these edits:** only `scripts/_demo2b-privacy.cjs`. The only other harness that names the changed sentences is `us-legal-draft`, through its own named changes to sections 5 and 7. It applies the module after those changes, so it needed no edit.

---

## 4 · Proof

- `npx tsc --noEmit -p .`: **clean** (exit 0).
- `node scripts/demo-2.cjs`: **69 passed, 0 failed** (66 + §10's 3).
- **The legal-page harnesses from demo-2b §4:**

  | Harness | Result |
  |---|---|
  | legal-follow-ups | 34/0 |
  | seo-fixes | 86/0 |
  | us-legal-draft | 36/0 |
  | anz-terms | 31/0 |
  | anz-1 | 76/0 |
  | canada-2 | 33/0 |
  | ireland-3 | 23/0 |
  | europe-settings | 67/0 |
  | france-1 | 74/0 |
  | about-page | 58/0 |
  | compare-de-1 | 93/0 |
  | plans-data-model | 151/0 |
  | signup-country | 63/63 |
  | language-phase-1e (renders `/privacy`) | 1024/0 |
  | language-phase-1e-tidy | 61/0 |

The deploy order in docs/demo-2b-report.md §5 is unchanged. demo-2, demo-2b and demo-2c ship together, after the migration, the sender fix and the two signup variables, with a redeploy without the build cache.
