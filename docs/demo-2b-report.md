# demo-2b — the demo's privacy text, and G11 (31 October 2026)

What changed: the approved "If you try the HatchGrab demo" wording is now in the Privacy Policy. G11 is closed: the demo's signup button gets the same inputs on every surface. This is meant to ship in one deploy with demo-2 and the signup switch.

Nothing is deployed, pushed or committed. No database change and no SQL in this workstream, and no Vercel variable was changed. No garbled spans and no contradictory instructions were found in the brief.

---

## 1 · The privacy policy

**Where it went.** `content/legal/privacy-policy.md`, which the page renders as its single source. It sits at the end of **section 5, "If you visit our websites"**, as a bold-headed block ("**If you try the HatchGrab demo**") followed by the five approved paragraphs, **word for word**. The policy's own straight quotes and en-GB spelling are kept.

Section 5 is the right home for two reasons:
- The demo is built on the website.
- Section 1 already says "we are the data controller for the personal data described in sections 3 and 5".

Putting it there means no section is renumbered, and every cross-reference ("see section 8", "sections 3 and 5") stays true. A new section 6 would have needed every later number and reference changed.

**Dates (the manual's legal-date rule).** The date moves in the document and in `lib/legal.ts` together:
- the document's line `**Last updated:** 19 October 2026` → **31 October 2026**;
- `PRIVACY_UPDATED` `'19 October 2026'` → `'31 October 2026'` (it mirrors the document's line, and feeds the sitemap's `/privacy` lastmod);
- `TERMS_VERSION` `'2026-10-22'` → **`'2026-10-31'`**. The rule written beside it in `lib/legal.ts` says it is "the latest of" the three documents' dates and must "MOVE IT WITH THE DOCUMENTS". It is **write-only** (recorded on `operators.terms_version` at signup; nothing reads it), so no existing operator is asked to re-accept anything.

The Terms of Service (20 October) and the Country-specific terms (22 October) are unchanged, and so are their dates.

**Processors.** The policy's section 6 table already lists **Google (Gemini)**, "Reading menus you upload, to extract their contents" (United States), and the international-transfers paragraph already says "menu extraction … use[s] a Google service in the United States". So nothing was added. I confirmed the demo really uses it: `/api/demo` → `provisionDemo` → `extractMenu` in `lib/menu-extract.ts` (Gemini). The demo link email goes through Brevo, which is already listed. The new text's retention periods match the code: 24 hours (`RETENTION_NO_EMAIL_HOURS`), 14 days (`RETENTION_WITH_EMAIL_DAYS`), 30 days for outreach demos (`RETENTION_OUTREACH_DAYS`).

**The policy is still en-GB only**, like the other legal pages. No translation was added.

### Existing statements that do not quite match the new text or the product (listed, NOT changed)

1. **"anonymous counts … cannot identify you"** vs `demo_events`. Each count row carries the demo's id (its truck id, `demo-…`). While the demo exists, that id links to `demo_sessions`, which holds the visitor's email. So for the demo's life (24 hours or 14 days) the counts are pseudonymous, not anonymous. Once the demo is deleted they cannot be linked. This is the closest thing to a real mismatch. If you want the sentence strictly true from the first second, the count could store a one-way hash of the id instead. That is a small code change, and I did not make it without your say-so.
2. **"We delete your demo email, the menu file and the demo itself when the demo expires"** vs a demo **claimed by a signup**. The cleanup sweep skips claimed demos until they are past expiry **and** 30 days old (`CLAIM_GRACE_DAYS = 30`, so the menu can carry over). During that window the demo email and file are still on the old demo record. The next sentence ("If you sign up … your account's privacy terms apply from then on") arguably covers it, but the wording is "we delete … when the demo expires".
3. **Section 5 "Cookies and browser storage"** says browser storage is used only where strictly necessary: "signing you in, keeping your basket, and remembering your preferences". The walkthrough keeps two more things in the browser's **session** storage for the tab's life: the keys of the orders the visitor placed (so the kitchen shows only theirs) and the demo email they typed (to pre-fill "Start free"). This is arguably strictly necessary, but it is not one of the three examples given.
4. **Section 7 "How long we keep data"** has no line for demo data. That is not a contradiction, because the new section states its own periods, but the retention list is no longer complete on its own.
5. **Section 5 "Product analytics" (PostHog)** says it "does not run on the operator dashboard, kitchen screen or management pages". The demo walkthrough at `/try/<slug>` is a public page that **shows** a kitchen screen. I did not check whether PostHog runs there. If it does, the sentence is still literally true (it is not the operator's kitchen screen), but a reader may not see it that way.

None of these were changed, as the brief instructs.

---

## 2 · G11 — the demo's signup button, the same on every surface

**The gap** (docs/demo-kds-report.md): the KDS mounted `<DemoGetStarted token={token} />` with neither `isAdmin` nor `extractionSource`. Once `NEXT_PUBLIC_SIGNUP_PUBLIC` is on, the button's variant is `extractionSource === 'template' ? 'sample' : 'upload'`. So on a **sample** demo the KDS would have used the **upload** copy, calling a template menu "your menu" (spec §11 forbids this). And an admin preview there could not open the wizard while the flag is off.

**demo-2 had added two more mounts with the same gap:** the demo order page's banner and the walkthrough's "Start free" (both passed no `extractionSource`). Closing G11 only on the KDS would have left the button inconsistent, so all three now get it:

| Surface | Before | Now |
|---|---|---|
| Dashboard | `isAdmin` + `extractionSource` (unchanged) | unchanged |
| **KDS** | neither | `isAdmin` from `/api/auth/me` (fetched **only on a demo**) and `extractionSource` from the `/api/dashboard` demo block the KDS already fetches |
| **Demo order page** | neither | `extractionSource`, asked once from `/api/demo/walkthrough?slug=…&info=1` (demo only) |
| **Walkthrough** | neither | `extractionSource`, carried on the walkthrough's existing `open` answer |

**Why no `isAdmin` on the order page and walkthrough:** both are public pages, and `isAdmin` only matters while the flag is **off** (it lets an admin preview the wizard). Once signup is on, `canSetup` is true for everyone, and the variant depends only on `extractionSource`, which is now the same everywhere. Admins can still preview through the dashboard and the KDS.

**An operator's KDS and order page are unchanged:** every new read and fetch is behind `isDemo`.

### Does demo-2's walkthrough still reach the KDS code path at all?

**Not directly.** The walkthrough never holds the dashboard token: the landing build, the demo link email and `/demo/<ref>` all go to `/try/<slug>`. Nothing on `/try` links to `/dashboard/<token>` or its `/kds`. The KDS's `DemoGetStarted` is reached only:

- **by an admin**, from the dashboard and KDS links `/api/admin/provision-demo` returns;
- **through "Save my menu"**: its return email links to `/api/demo/return?t=<token>`, which lands on the demo **dashboard**, and the KDS is one tap from there. From the walkthrough this happens only while signup is **off**, because that is when "Start free" falls back to Save my menu. Once signup is on, the walkthrough's button opens the wizard instead;
- **from dashboard links saved before demo-2.**

So G11 was mostly unreachable from the new flow. It is closed anyway, so the button is right wherever a demo is opened.

*(Noticed while checking: `app/api/demo/return/route.ts` still has a header comment saying the restart re-seeds orders. Since demo-2 it starts an empty service. Only the comment is stale. Not changed.)*

---

## 3 · Files changed (demo-2b only)

**Product**
- `content/legal/privacy-policy.md`: the demo section (end of section 5) and the date.
- `lib/legal.ts`: `PRIVACY_UPDATED` → '31 October 2026', `TERMS_VERSION` → '2026-10-31', and its comment.
- `app/dashboard/[token]/kds/page.tsx`: G11: `isAdmin` (demo only) and `extractionSource` into `DemoGetStarted`.
- `app/trucks/[slug]/order/page.tsx`: `extractionSource` for the demo banner's button (demo only).
- `components/demo/DemoWalkthrough.tsx`: `extractionSource` for "Start free".
- `app/api/demo/walkthrough/route.ts`: `GET ?info=1` returns `{ ok, extractionSource }` and nothing else; `open` also returns `extractionSource`.

**Harnesses**
- `scripts/demo-2.cjs`: new **§9 G11** (7 checks):
  - the KDS and the dashboard mount the button with the same inputs;
  - the KDS asks `/api/auth/me` only on a demo;
  - the order page and the walkthrough pass the source;
  - the route's `info=1` and `open` answers;
  - a render with signup ON: a sample demo shows the sample button and an uploaded menu shows the upload button, for both the token and the slug forms.
- New shared modules (registered in `scripts/harnesses.json` › shared_modules):
  - `scripts/_demo2b-privacy.cjs`: **the one named change** to the policy, with the section's words written out, so later edits fail rather than being absorbed;
  - `scripts/_lp-demo2b.cjs`: the named date changes (the sitemap's `/privacy` lastmod 19 → 31 October; signup's `terms_version` 2026-10-22 → 2026-10-31).
- **Re-pinned for the intended change.** Each one now proves "the old document or value plus exactly demo-2b's named change", with a `⚠️ RE-PINNED (demo-2b …)` note, following the anz-terms and ireland-3 precedent:
  - `anz-terms`, `canada-2`, `ireland-3`, `us-legal-draft`: the policy's bytes and `PRIVACY_UPDATED`;
  - `seo-fixes`: its lastmod check had the literal `2026-10-19`, while its label said "the document's own date". It now reads the date from `PRIVACY_UPDATED`;
  - `europe-settings`, `france-1`, `legal-follow-ups`, `canada-2`, `anz-terms`, `ireland-3`: `TERMS_VERSION`;
  - `plans-data-model`, `language-phase-1e-tidy`, `_lp1e-named`: the sitemap;
  - `_lp2-named`: signup's `terms_version`.

---

## 4 · Proof

- **`npx tsc --noEmit -p .`**: clean (exit 0).
- **`node scripts/demo-2.cjs`**: **66 passed, 0 failed** (59 from demo-2 plus 7 for G11).
- **Legal-page harnesses:**

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

- **KDS, order-page and language harnesses:**

  | Harness | Result |
  |---|---|
  | language-phase-0 | 163/0 |
  | language-phase-1a | 1048/0 |
  | language-phase-1b (renders the KDS) | 3504/0 |
  | language-phase-1c | 4402/0 |
  | language-phase-1d2 | 562/0 |
  | language-phase-1e | 1024/0 |
  | language-phase-1e-tidy | 61/0 |
  | language-phase-2 | 1821/0 |
  | messages-parity | 436777/0 |
  | event-types | 192/0 |
  | ui-literals | clean |

  Also passing: audit-fixes, customer-path-identity, currency-registry, money-sweep-parity, native-prices, phone-parity, plan-features-config, slot-interval-grid-routing, slot-interval-event-override, time-dates-parity, us-polish-batch, us-rehearsal-fixes, messages-split, dot-overlap-labels, generic-venue-guess, outreach-crm-today, pricing-check-build-data, private-discovery-rows.
- **Still failing, and failing the same way on a clean worktree of HEAD** (recorded in demo-2):
  - `canada-1`: 1 check;
  - `schedule-graphics-places`: 1 check. The only difference is a line number in `lib/demo-restart.ts` (198 → 167) that demo-2 shortened.
- **Not re-run:** the full sweep (the brief says affected harnesses only), and `demo-2-screens.cjs`, which needs the dev server. The order page now makes one extra demo-only request, which that script's fixture router already answers. The `harnesses.json` dry run lists 12 unregistered helper files; all were there before this change and none is mine.

---

## 5 · Deploy order (confirmed)

The privacy text, demo-2 and the signup switch go out **together in one deploy**, in this order:

1. **Run demo-2's migration** `supabase/migrations/20261052_demo_2.sql` (docs/demo-2-report.md). demo-2b has no SQL.
2. **Fix the signup sender:** set `EMAIL_FROM_ADDRESS` in Vercel (Production, and Preview if you test there) to a Brevo-verified sender, or verify `hatchgrab.com` in Brevo.
3. **Set `SIGNUP_PUBLIC=true` and `NEXT_PUBLIC_SIGNUP_PUBLIC=true`** in Vercel Production (and Preview if wanted).
4. **Deploy this branch** (demo-2 + demo-2b) and **redeploy without the build cache**. `NEXT_PUBLIC_SIGNUP_PUBLIC` is baked in at build time, so a cached build would still show "Save my menu".
5. **Check after the deploy:**
   - `/privacy` shows "Last updated: 31 October 2026" and the demo section;
   - the landing modal's "Privacy policy" link lands on it;
   - a new demo shows "Start free…" in the walkthrough;
   - on a **sample** demo, the dashboard's, the KDS's and the order page's banner buttons all read "Set up my truck →";
   - a throwaway signup from a demo carries the menu over (`?import=demo`). Use your own demo, not a trading truck.

The email step must not go live before the privacy text, because the landing modal links to it. Shipping them in the same deploy guarantees that.

---

## Decisions for Dominic (none blocking the deploy)

- **Counts "anonymous"** (§1, item 1): accept that the counts are pseudonymous for the demo's lifetime, or have me store a hashed id so the sentence is strictly true from the start.
- **Claimed demos** (§1, item 2): fine as worded, or add a clause such as "…or, if you sign up, within 30 days".
