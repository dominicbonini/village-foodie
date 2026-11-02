# copy-truth-1 — three wrong lines on the live site, fixed in every language

*2 November 2026. On `main`, committed, not pushed, not deployed. Words only. No SQL, no behaviour, default, setting or data
changed, and nothing in the FAQ tables or seed.*

## 0 · Summary

- **The trial:**
  - Before: "your free **month** … begins when you pick your first live event".
  - Now: the trial's real length, `plans.trial_months`, read from data, starting **at signup**.
  - Fixed in `auth.signup.subtitle`, `demoGetStarted.freeMonth` and `demo.signupOffer.heading` / `.sub`.
  - The demo's "Start free for N months, keep my menu" already read its number from data (`demoWalk.startFree` with the
    walkthrough API's `trialMonths`), so it needed no change.
- **Signal loss:**
  - Before: the landing page and /features said online ordering pauses automatically, with no condition.
  - Now: "Switch on offline protection and online ordering pauses automatically if you lose signal…".
  - The apps sentence is kept only where both store flags are on (GB today), read from the flags the comparison pages use.
  - `MARKETING_COPY_UPDATED` moved to 2026-11-02 (35.aj-8).
- **Adding a van:**
  - Before: the confirmation said every van "will be charged … next billing cycle", and the billing modal's note promised a
    confirmation email within 24 hours. Neither is true.
  - Now: the confirmation reads the truck's own plan and country ("free on your plan", or "{price} a month … We’ll be in touch
    before anything is charged"). The modal's body and note say the same.
- **Every changed key is in en-GB and all 28 language bases**, with back-translations. The only English variant changed is
  en-US (its "Continue" moved to the new apps sentence). translation-check: **3 structural in every locale — the three
  English-only `faq.phrases.*` keys only (expected, held back until you approve them)**. None of the changed keys has a
  structural problem or a flag.
- **Proof:**
  - `scripts/copy-truth-1.cjs` **58 / 58**.
  - The landing page for GB, US, BR and JP differs from HEAD only in the offline line. /features (GB, US) differs only in the
    offline description.
  - `/llms.txt` is byte-identical; it never carried any of these claims.
  - The sitemap is identical apart from lastmod.

## 1 · Every key changed — English (en-GB unless marked)

| Key | Old | New |
|---|---|---|
| `auth.signup.subtitle` | Your free month doesn’t start until you go live. | {months, plural, =0 {Your free trial starts when you sign up.} one {Your first month is free, starting when you sign up.} other {Your first # months are free, starting when you sign up.}} |
| `demoGetStarted.freeMonth` | Setting up won’t start your free month. That begins when you pick your first live event — whenever you’re ready. | {months, plural, =0 {Your free trial starts when you sign up.} one {Your first month is free, starting when you sign up.} other {Your first # months are free, starting when you sign up.}} |
| `demo.signupOffer.heading` | Sign up for your free month now | {months, plural, =0 {Start free} one {Start free for # month} other {Start free for # months}} |
| `demo.signupOffer.sub` | The clock doesn’t start until you decide to go live. | Your free trial starts when you sign up. |
| `landing.does.offlineBody` | If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Carry on taking orders with the iPhone, iPad and Android app. | Switch on offline protection and online ordering pauses automatically if you lose signal, so customers can’t place orders you won’t see. |
| `landing.does.offlineApps` | *(new key)* | Carry on taking orders with the iPhone, iPad and Android app. |
| `featuresPage.detail.offline_protection` | If you lose signal, online ordering pauses so customers can’t place orders you won’t see. The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection. | Switch on offline protection and online ordering pauses automatically if you lose signal, so customers can’t place orders you won’t see. |
| `featuresPage.offlineApps` | *(new key)* | The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection. |
| `manageSettings.vans.addConfirm` | Adding an additional truck will be charged as an add-on to your subscription.⏎⏎This will be reflected in your next billing cycle.⏎⏎Do you want to continue? | {free, select, yes {Adding a van is free on your plan.} other {An extra van is {price} a month on your plan. We’ll be in touch before anything is charged.}}⏎⏎Do you want to continue? |
| `manageSettings.vanBilling.body` | Your {plan} plan includes {vans, plural, one {# truck} other {# trucks}}. Adding an additional truck costs <b>{price}</b> and will be added to your next billing cycle. | Your {plan} plan includes {vans, plural, one {# truck} other {# trucks}}. Adding an additional truck costs <b>{price}</b>. |
| `manageSettings.vanBilling.note` | ⚠️ Note: Billing adjustment is processed manually during early access. You will receive a confirmation email within 24 hours. | ⚠️ We’ll be in touch before anything is charged. |
| `landing.does.offlineBody` (**en-US**) | If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Continue taking orders with the iPhone, iPad and Android app. | *(override removed: the US now reads the en-GB sentence, which is the same in US English)* |
| `landing.does.offlineApps` (**en-US**) | *(new key)* | Continue taking orders with the iPhone, iPad and Android app. |
**Notes on the wording:**
- The trial messages use the brief's wording. The plural has an `=0` case ("Your free trial starts when you sign up." / "Start
  free") for a surface that doesn't know the length. A one-month trial reads "Your first month is free…".
- `demo.signupOffer.heading` / `.sub` are **not rendered anywhere today**: their loop-complete card was deleted on 30 Oct. They
  were fixed anyway, because the brief says every instance.
- The key names (`freeMonth`, `vans.addConfirm`) are kept, so no code path or translation moves.
- **"Do you want to continue?"** stays at the end of the van confirmation. It is a `window.confirm` with OK / Cancel, and the
  question is what those buttons answer.
- **"van" in the confirmation, "truck" in the modal.** The confirmation uses your wording ("Adding a van…"). The modal and the
  section around it say "truck" ("+ Add truck", "Add another truck"), and the section already mixed the two ("Same as the
  first van"). Translations use each language's own word for the vehicle, the one its Manage screens already use (food truck,
  Foodtruck, matbil, busiņš, furgonas, キッチンカー …). If you want one English word throughout, say which.
- **The offline sentence** is true under the default mode. Offline protection has a second mode, "don't auto-accept" instead of
  pausing (`offlineProtection.explainerBody`). The brief's sentence describes the pause mode, which is what a truck gets unless
  it chooses otherwise.

## 2 · How each value is read (no number typed anywhere)

- **Trial length:** `offerTrialMonths(getPlanCatalog())`, the pricing pages' own read of `plans.trial_months`.
  - `/signup`: the page's server layout (`app/signup/layout.tsx`) reads it and hands it down through a tiny client context
    (`lib/trial-months.tsx`, `TrialMonthsProvider` / `useTrialMonths`). The page itself changed by one hook and its import.
    (A first version moved the form into its own file; three older harnesses read `app/signup/page.tsx` for its content, so
    the page stayed where it was.) The layout already rendered per request (it reads headers). A failed read shows the `=0`
    sentence, never an error.
  - Demo: `DemoGetStarted` takes an optional `trialMonths`. The walkthrough passes the API's `trialMonths`. The dashboard and
    kitchen-screen demo banners have no plan data, so they show the `=0` sentence ("Your free trial starts when you sign up.").
- **The apps sentence:** `comparisonFlagsOf(country)`, i.e. `country_settings.ios_app_available` AND `android_app_available`,
  the comparison pages' cached read. No flag value changed.
  - The landing page joins the two sentences into one string, so the HTML holds exactly the text.
  - /features appends it to the offline description.
  - The iOS app targets iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`), so "iPhone, iPad and Android app" is true where the
    flags are on.
- **The van price:** `extraVanMonthlyMinor(truck, catalog, country)`, i.e. the effective plan's
  `plan_prices.extra_van_monthly_minor`.
  - It is formatted with `formatAmount(…, planMoneyFormatOf(country))` (home form) and masked exactly like the billing
    modal's price (`vanPx`).
  - "Free" uses the modal's own test: within the plan's included vans, or a zero extra-van price. So the confirmation and the
    modal can never disagree.

## 3 · Pizzeria Gusto

Pizzeria Gusto (GB, `plan = 'trial'` until 31 Dec 2026, 1 van, 1 included; read-only SQL, 2 Nov) would now see **"Adding a
van is free on your plan. Do you want to continue?"** if they add a van, in place of "will be charged as an add-on … next
billing cycle". Their trial plan has no price row, so the extra-van price is 0 and no billing modal opens, exactly as before.
That stays true after 31 Dec, when they fall back to Pay as you go (extra van £0). Only the text changes.

## 4 · What else changed in the public pages

- **Landing (all countries):** the offline tile's paragraph. GB keeps the apps sentence; the US, BR, JP and every other country
  (flags off) no longer claim the apps.
- **/features (all countries):** offline protection's description, the same rule.
- **Sitemap:** the landing and /features `lastmod` can move to 2026-11-02 (`MARKETING_COPY_UPDATED`); every other byte is
  identical (harness §5).
- **Not changed, noted:** `featuresPage.detail.kitchen_app` ("…the only way to keep taking orders when you lose signal") and
  `manageSettings.getApp.body` ("Free with your account, on iPhone, iPad and Android") describe the apps without a country
  condition. Neither says ordering pauses automatically, so they're outside this brief. The first is a feature-table row (on
  /features in every country); the second is in Manage. Both are worth the same treatment later.

## 5 · Proof

`scripts/copy-truth-1.cjs` — **58 / 58**, registered in `scripts/harnesses.json`.

1. **None of the old wording remains.**
   - All 262 old strings (every changed key, in all 30 locale files that had them, pinned from `82c5adee` in
     `scripts/fixtures/copy-truth-1-old.json`) are in no messages file.
   - These English patterns appear in no English message file and no file under `app/`, `components/` or `lib/`, comments
     included: `\bfree month\b`, `first live event`, `pick your first`, `until you go live`, `decide to go live`,
     `next billing cycle`, `charged as an add-on`, `confirmation email within 24 hours`,
     `online ordering pauses automatically so customers`, `If you lose signal, online ordering pauses`,
     `Start free for 3 months`.
   - Three `DemoGetStarted` comments that quoted the old line were reworded. Tombstones about removed text, and the promo-code
     note ("3 months free applied" — a claim the code deliberately doesn't make), don't match these patterns and were left.
   - The demo's "Start free for N months" reads its number from data.
2. **No typed number:** no digit in any changed key, in any locale (the `=0` case aside). The trial messages take
   `{months}`; the van message takes `{free}` and `{price}`. The signup page and demo pass values read from data.
3. **The trial message for 1 and 3 months** in en-GB, de-DE, pl-PL and ar-AE (both keys), exact strings, plus the `=0` case
   and the heading. Every base renders 0, 1, 2, 3, 5, 11 and 21 months with the number. This caught a real bug before
   commit: in **Croatian and Latvian** the CLDR "one" category also covers 21, 31 …, so their "one" forms now carry the number.
4. **The van confirmation, from the fixture catalogue:** Pro in GB → "An extra van is £29 a month on your plan. We’ll be in
   touch before anything is charged." Pay as you go → "Adding a van is free on your plan." Both versions render in every base.
   Manage's test is the modal's, and the price is the truck's own plan's, home form, masked.
5. **Public pages:** landing GB, US, BR and JP and /features GB and US are identical to a HEAD capture
   (`scripts/fixtures/copy-truth-1-head.json`, made by the same script in a worktree at `82c5adee`) apart from the offline text.
   - GB has the apps sentence; the others don't. With GB's flags off, GB loses it too.
   - `/llms.txt` is byte-identical; the sitemap is identical apart from lastmod; `MARKETING_COPY_UPDATED` = 2026-11-02.

**translation-check (all 28 bases and the 7 regional variants):** 3 structural in every one — `faq.phrases.appsSentence`,
`faq.phrases.appsOffline`, `faq.phrases.webOffline`, English-only by your faq-1 decision. **Expected.** No changed key appears
among the structural problems or the flags. Plurals carry every CLDR category of each locale, plus en-GB's `=0` case.
Placeholders and the `<b>` tag match en-GB.

## 6 · Re-pinned older harnesses (named, exact, the house pattern)

The first full sweep after the change had 20 failures. Twelve were older identity guards that pin the words or pages this
brief changed on purpose. Each is re-pinned the way earlier workstreams did it (world-countries-1's tagline,
world-countries-2's terms dates): with a named, exact transform that throws if its anchor goes stale. No check was weakened
or removed.

- **The message record:** `scripts/fixtures/copy-truth-1-messages.json`, a sixth sibling of the plan-stage records
  (`reworded {key: {before, after}}` for the nine reworded keys, the two apps sentences added, en-US's `offlineBody` override
  removed and its apps sentence added). It is read by `scripts/_lp2-frozen.cjs stageA()` after address-formats-2. This
  cleared `messages-parity` (546,588 / 0), `language-phase-1d` (354 / 0) and the key checks of `language-phase-1e`.
- **The page record:** `scripts/_lp-copy-truth-1.cjs`, with two items:
  - the landing's offline line (the old en-GB / en-US text becomes the new first sentence; no older fixture sets the app
    flags, so no apps sentence);
  - the country pages' sitemap lastmod (at least 2026-11-02).
  It is wired into `_lp1e-named.cjs`, `language-phase-1e-tidy.cjs`, `language-phase-0.cjs` and
  `marketing-country-parity.cjs`. In `plans-data-model.cjs` the offline transform is applied where the old text is present,
  with a new check that it moved at least three landing views, and its seo-fixes sitemap expectation `COPY_LASTMOD` follows
  the new copy date.
- **Manage's line guards:** in `schedule-graphics-places.cjs` (`COPY_TRUTH_1_NOW`) and `_phase3-screens-us.cjs` (the Stage
  A2 van hunk), the billing-modal test is re-pointed to the `vanIsFree` line that now holds it.
- **`scripts/faq-1.cjs` §8** pinned the landing pages as at faq-1. They changed on purpose here, and this harness proves only
  the offline line moved, so `scripts/fixtures/faq-1-identity.json`'s four landing hashes were recaptured. Its `/llms.txt`
  hash didn't move. faq-1: 182 / 182.
- **Re-run individually after the re-pins:**

  | Harness | Result |
  |---|---|
  | `messages-parity` | 546,588 / 0 |
  | `language-phase-0` | 163 / 0 |
  | `language-phase-1c` | 4,402 / 0 |
  | `language-phase-2` | 1,821 / 0 |
  | `language-phase-1d` | 354 / 0 |
  | `language-phase-1e` | 1,024 / 0 |
  | `language-phase-1e-tidy` | 61 / 0 |
  | `marketing-country-parity` | 145 / 145 |
  | `plans-data-model` | 152 / 0 |
  | `phase3-screens` | 95 / 0 |
  | `us-polish-batch` | passes |
  | `schedule-graphics-places` | back to its one HEAD failure |

## 7 · Full sweep (after the re-pins)

`node scripts/run-harnesses.cjs`: **177 run · 168 passed · 9 failed.** None of the 9 is caused by this change. The same 9
failed in the faq-1 sweep, with the same counts:

**Fail at HEAD too (unrelated to this brief):**

| Harness | Failure |
|---|---|
| `schedule-graphics-places` | 1: the files naming `schedule_graphics` no longer match its list |
| `canada-1` | 1 |
| `world-countries-2` | stops on "Terms edit — expected once, found 0: Last updated: 20 October 2026" |
| `legal-languages-1` | the same stop |
| `europe-languages-1` | 1 of its 29: de-CH "ß" |
| `world-countries-1` | 1 of its 8: the tagline words still in source |

**Expected — the three English-only `faq.phrases.*` keys (your faq-1 decision; they clear when you approve and they're
translated):**

| Harness | Failure |
|---|---|
| `france-1` | 1: "translation-check 0 structural" |
| `country-picker-1` | 1: the same, for every base |
| `world-countries-1` | 7 of its 8: one per world language |
| `europe-languages-1` | 28 of its 29: one per European language and variant |
| `languages-1` | 1: the generated `faq` catalog module has no language line yet |

`add-order-refresh-inputs` failed in one earlier sweep (4), and at HEAD (3). It passed in this one: it is timing-sensitive
and touches nothing changed here.

## 8 · Files

- **Words:** `messages/en-GB.json`, `messages/en-US.json`, all 28 base files `messages/<locale>.json`, their back-translations
  `docs/i18n/back/<locale>.json`, and the regenerated `messages/ns/**` and `lib/i18n/catalog/**`.
- **Code (words only):**
  - `app/signup/layout.tsx`, `app/signup/page.tsx` and `lib/trial-months.tsx` (new): the trial's length;
  - `components/DemoGetStarted.tsx` (an optional `trialMonths` prop, and comments) and `components/demo/DemoWalkthrough.tsx`
    (passes it);
  - `app/landing/page.tsx` and `app/features/page.tsx`: the apps sentence by flags;
  - `app/manage/[token]/page.tsx`: the van confirmation's values;
  - `lib/marketing-meta.ts`: the copy date.
- **Harnesses:** `scripts/copy-truth-1.cjs` (new, registered), `scripts/fixtures/copy-truth-1-old.json`,
  `scripts/fixtures/copy-truth-1-head.json`, `scripts/fixtures/copy-truth-1-messages.json`, `scripts/_lp-copy-truth-1.cjs`
  (new), and the re-pins in `_lp2-frozen.cjs`, `_lp1e-named.cjs`, `language-phase-0.cjs`, `language-phase-1e-tidy.cjs`,
  `marketing-country-parity.cjs`, `plans-data-model.cjs`, `schedule-graphics-places.cjs`, `_phase3-screens-us.cjs`,
  `faq-1.cjs` and `scripts/fixtures/faq-1-identity.json`.
- tsc clean. eslint shows no new problem: each touched file has exactly HEAD's count.
- No SQL.
