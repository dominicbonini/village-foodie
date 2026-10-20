# pricing-tidy — follow-ups to Stage B and the SEO fixes

**Date:** 20 October 2026 · **Branch:** main (uncommitted; nothing pushed or deployed)

**Summary.**
- Terms §4 carries your edits and is signed off: the document's date, `TERMS_UPDATED` and `TERMS_VERSION` all moved to 20 October 2026. Moving the version triggers nothing for existing trucks (§1).
- The two disclosures are restored as footnotes on /features, Manage › Billing and the plans PDF, with row markers.
- Billing's not-started state shows its heading alone.
- `/contact` on the Village Foodie host is self-canonical.

Nothing else visible changed (§5). No SQL changed anything. The only SQL run was read-only: the checks in §1 that nothing in the database reads `terms_version`.

---

## 1 · Terms §4, signed off

### What a TERMS_VERSION bump triggers — checked first

**Nothing an existing truck would see.**
- `TERMS_VERSION` (lib/legal.ts) is **only written**: `app/api/signup/route.ts` stores it as `operators.terms_version` beside `terms_accepted_at`, when a **new** account signs up.
- Nothing reads or compares it anywhere:
  - not in app/, components/ or lib/;
  - not in the edge functions (`auto-event-scheduler`, `heartbeat-monitor`);
  - not in any database function: read-only SQL `select p.proname from pg_proc … where pg_get_functiondef(p.oid) ilike '%terms_version%'` returned no rows;
  - not in any trigger on `operators`: `information_schema.triggers` returned no rows.
- So there is no re-accept prompt, banner or email, for Pizzeria Gusto or anyone. Existing operators keep the version they accepted. New signups record `2026-10-20`.
- `TERMS_UPDATED` is read only by the sitemap (the /terms `lastmod`, now 2026-10-20). The page shows the document's own "Last updated" line.

### The new §4 (as rendered)

> ## 4. Plans, fees and trials
>
> **No contract, cancel anytime.** There is no minimum term and no notice period. You are never tied in.
>
> - **Plans.** Our plans, their monthly prices, the online order value each includes and the fee each charges are shown on our website and in the app. One plan has no monthly fee. Prices are in your local currency. We are not registered for VAT, so no VAT is added to our fees. Where another local tax applies to you, we will tell you before it is added.
> - **Free trial.** New accounts start with a free trial with every feature unlocked. Its length is shown on our website and in the app when you sign up. You do not need a card to start. At the end of the trial your account moves to our plan with no monthly fee unless you have chosen another plan. We will remind you in the app before your trial ends.
> - **Paid in advance, and non-refundable.** Monthly plan fees are billed one month in advance. **Fees already paid are non-refundable**, including if you cancel part-way through a month or stop using the service. This is the trade for there being no contract and no minimum term. Nothing here affects rights you have that cannot lawfully be excluded.
> - **Cancellation.** You can cancel at any time by contacting us or from within the service. Cancellation stops the next payment; it does not refund the month you are in. You keep full access until the end of the period you have paid for, then move to our plan with no monthly fee.
> - **HatchGrab fees on online card orders.** Depending on your plan, we charge a stated percentage of the value of online orders your customers pay for by card — on all of it, on the value above the amount your plan includes each month, or not at all. **We charge no fee on Pay at Hatch orders or on walk-up orders.**
> - **Card processing.** Card processing fees on online card orders are charged by our payment provider (Stripe), are paid to them and not to us, and are separate from our fees. Walk-up orders are taken on your own card reader, under your own agreement with its provider.
> - **Price changes.** We may change our prices, fees or what a plan includes. We will give you at least 30 days' notice before a change affects you, and you may change plan or cancel before it takes effect.
>
> ### If payment is not made
>
> **If a payment fails or is not made, your account moves to our plan with no monthly fee.** We do not lock you out.
>
> - If a payment is not made within **7 days** of its due date, your account moves to the plan with no monthly fee. You keep your account, your menu, your orders and your data, and you can carry on taking orders and using the kitchen screen and dashboard. You lose the features that plan does not include, and that plan's fee on online card orders applies.
> - Paying the outstanding amount restores your plan.
> - Moving plan does not entitle you to a refund of fees already paid, and you remain liable for amounts due up to that date.
>
> ⚠️ **Plan for this.** Some features your service depends on are only on paid plans. Keep the billing contact on your account an address you check, and keep your card details current.

**The date moved, all three together:**
- the document's `**Last updated:** 20 October 2026`;
- `TERMS_UPDATED = '20 October 2026'`;
- `TERMS_VERSION = '2026-10-20'`.

The Privacy Policy and Country-specific terms keep 19 October 2026: they did not change. The `TERMS_VERSION` comment now records that it is write-only.

**Proof.** The production build's `/terms` (curl, HatchGrab host) renders "Last updated: 20 October 2026" and the §4 above. A word-level diff against the previous capture shows exactly these edits and nothing else.

## 2 · Footnotes restored — /features, Billing, the plans PDF

The two disclosures sit under the existing card-fee footnote (*), in each surface's own footnote style, in the order you gave them:

> ¹ WhatsApp auto-replies need a WhatsApp Business account. Meta may charge for some messages; replies are generated automatically.
> ² Kitchen ticket printing needs a compatible Bluetooth or wired printer (not supplied).

**How it works:**
- **Markers:** the **WhatsApp auto-replies** row carries a superscript ¹ and the **Kitchen ticket printing** row a superscript ². No other row has a marker.
- **One source:** each table row in `lib/feature-table.ts` can carry a `note`, and `planTableNotes()` gives every surface the same marker and words. The words are the messages `planTable.notes.whatsapp` / `.printing`. en-US has the same text, with no override needed.
- **Where it renders:**
  - /features: `price-note` paragraphs, the card-fee note's style;
  - Billing: the `text-xs text-slate-500` lines under its footnote;
  - the PDF: the small-print `<p>`s, with the row labels carrying `<sup>`.
- **Styling:** the row marker is a small superscript (`.pt-sup` in `plan-table.css`).

⚠️ **Marker order vs table order.** The numbers follow your footnote order (WhatsApp ¹, printing ²). The printing row sits higher in the table (Run your service) than WhatsApp (Marketing), so reading down the table you meet ² before ¹. Say if you'd rather number by position, so printing becomes ¹ and its footnote moves first.

**Proof (`scripts/pricing-pages.cjs`, 130/130):**
- /features (GB): the two markers on exactly those two rows, and three footnotes in order (*, ¹, ²).
- Billing, GB and US: the two footnotes under the card-fee one, and the markers on the rows.
- The plans PDF, GB and US: the row markers and both footnotes after the card-fee one.

## 3 · Billing "not started" — heading only

A trial with no end date now shows only **"Your free trial has not started yet"**. The body sentence is removed, and so is its unused message `manageBilling.notStarted.body`. A running trial's lines are unchanged.

**Proof:** `pricing-pages.cjs` renders the not-started view, GB and US. It checks that the heading is the block's only paragraph and that "hasn’t started yet" is gone.

## 4 · /contact on the Village Foodie host is self-canonical

curl heads from the production build, before → after:

| Page (host) | canonical | og:url |
|---|---|---|
| **VF /contact** | https://www.hatchgrab.com/contact → **https://www.villagefoodie.co.uk/contact** | https://www.hatchgrab.com/contact → **https://www.villagefoodie.co.uk/contact** |
| HG /contact | https://www.hatchgrab.com/contact (unchanged) | unchanged |
| VF and HG /privacy, /terms, /country-terms, /signup, /login | https://www.hatchgrab.com/… (unchanged) | unchanged |

A new `hostUrlMetadata()` in `lib/site-metadata.ts` gives a page its **serving host's** URL. Only the VF branch of `/contact` uses it; the HatchGrab branch keeps `ownUrlMetadata()`. `scripts/seo-fixes.cjs` asserts both hosts for all six pages.

**Not done (not asked):** the Village Foodie sitemap still lists only its root, so it does not include `/contact`. Say if you want it there.

## 5 · Nothing else visible changed

**Screenshots** were taken from production builds (`next start` on :3100) of 7 pages at 1440px and 375px, and compared with the SEO workstream's final capture:
- **/privacy, /signup, /login, /contact:** pixel-identical at both widths.
- **A /contact flake:** one run caught /contact at 1440 before the third-party Tally form iframe had painted. The rerun was pixel-identical.
- **/uk, /uk/features, /terms:** differ. A word-level text diff shows only the intended changes:
  - **/terms:** the §4 edits and the date;
  - **/uk/features:** the two markers and two footnotes;
  - **/uk:** your three copy edits from the end of the SEO workstream, already in this tree and recorded in docs/seo-fixes-report.md §2 and docs/pricing-pages-report.md:
    - "First 3 months completely free, everything unlocked";
    - "Walk-up orders are always free.";
    - "Custom event types & pricing".

## 6 · What was executed

- **Read-only SQL:** the `pg_proc` and `information_schema.triggers` checks in §1.
- **Production build:** passes. curl heads on both hosts; screenshots and word-level text diffs as in §5.
- **tsc:** clean.
- **Lint:** no new errors against the previous baselines (8 changed files compared).
- **Harnesses:**
  - `pricing-pages` 130/130, including new checks for the footnotes on /features, Billing and the PDF (GB and US) and for the heading-only not-started state.
  - `seo-fixes` 86/86, with VF /contact re-pinned to self-canonical.
- **Full sweep (`node scripts/run-harnesses.cjs`, final tree):**
  - **144 of 145 harnesses pass.**
  - The one failure, `demo-rebuild-replace`, fails 1 check only because its fixture date is today. With the clock pinned to 2026-10-19 it passes 36/36, the same as in the last two workstreams.
- **Re-pins for this workstream** (each marked `⚠️ RE-PINNED (pricing-tidy, 20 October 2026)`):
  - **Terms date and version:**
    - `legal-follow-ups`: TERMS_VERSION is now 2026-10-20.
    - `us-legal-draft`: the Terms date is 20 October; four named §4 edits are added.
    - `_lp2-named.cjs`: signup writes `terms_version` 2026-10-20. This covers `language-phase-1c` and `-2`.
    - `_lp1e-named.cjs` and `language-phase-1e-tidy`: the sitemap's /terms lastmod is 2026-10-20.
    - `plans-data-model`: each legal page's own lastmod in the sitemap step.
  - **Row notes and footnotes:**
    - `plan-feature-order`: exactly the two rows carry a `note`.
    - `whatsapp-golive-parity-harness`: its row regex and mutations carry the `note`.
    - `_lp-stage-b.cjs`: positive checks for the markers and footnotes on /features, the PDF and Billing.
  - **Not-started body:**
    - `country-settings-parity` (B3): the body message is deleted and the heading still renders.
    - `_lp1d2-named.cjs`: the heading alone.
    - `schedule-graphics-places`: its "no line lost" guard excuses exactly the two shifted heading lines, while the new form holds.
  - **Messages:** a new fixture, `scripts/fixtures/pricing-tidy-messages.json`, records the removed and added message keys (`messages-parity`, `1d2`, `1e`).
  - **VF /contact:** `seo-fixes`.
  - **New shared module:** `scripts/_lp-pricing-tidy.cjs`, registered under shared modules.
  - **No product bug was found** by any re-pin.

## 7 · Files

**Content and code:**
- `content/legal/terms-and-conditions.md`
- `lib/legal.ts`
- `lib/feature-table.ts`
- `components/pricing/PlanTable.tsx`, `components/pricing/plan-table.css`
- `app/features/page.tsx`
- `app/manage/[token]/page.tsx`
- `lib/plans-pdf.ts`
- `lib/site-metadata.ts`
- `app/contact/page.tsx`
- `messages/en-GB.json` + `en-US.json` (`planTable.notes`, `manageBilling.notStarted.body` removed) + generated files

**Harnesses:** `pricing-pages.cjs`, `seo-fixes.cjs`, `scripts/harnesses.json`, the new `scripts/_lp-pricing-tidy.cjs` and `scripts/fixtures/pricing-tidy-messages.json`, plus the re-pins listed in §6.
