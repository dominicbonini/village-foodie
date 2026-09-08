# Google Play badge + URL, and the "Get the app" card

**5 September 2026. Branch `whatsapp-connections-s1-s3`. NOT COMMITTED, not staged, not pushed, not deployed. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

🟢 **Nothing here changes what `events.pizzeriagusto.co.uk` serves.** 🧪 `app/domain/page.tsx`, `app/o/[slug]/page.tsx` and `app/order/[id]/page.tsx` import **zero** of `StoreBadges`, `app-badges` or `LandingFooter`. `app/domain/page.tsx`: **0 changes**.

---

## What landed

| Thing | Where |
|---|---|
| **The badge artwork** | `public/badges/GetItOnGooglePlay_Badge_Web_color_English.svg` — written **byte-for-byte as supplied**, Google's own filename preserved |
| **Both stores' URLs and both badge paths** | 🔴 **`lib/app-badges.ts` — one file, as asked.** Four constants: `APP_STORE_URL`, `APP_STORE_BADGE_SRC`, `GOOGLE_PLAY_URL`, `GOOGLE_PLAY_BADGE_SRC` |
| **The badge pair** | `components/StoreBadges.tsx` — one component, two surfaces |
| **The landing footer** | now renders `<StoreBadges className="foot-apps" linkClassName="foot-badge" />` |
| **Manage → Settings** | a new **"Get the app"** card |

**The URL, pasted verbatim as supplied — including `&hl=en`:**
```
https://play.google.com/store/apps/details?id=com.hatchgrab.app&hl=en
```
⚠️ **One observation, not a change:** `hl=en` pins the listing to English rather than following the visitor's locale. For a UK audience that is indistinguishable from the default, so it is left exactly as given. It was **not** constructed from the package name, not trimmed, not "tidied".

## 🔴 Why the constants moved out of `LandingFooter`

They lived in `components/landing/LandingFooter.tsx`. A second surface now needs them, and a dashboard importing a landing component would drag `landing.css` into the manage bundle to read two strings. `lib/app-badges.ts` imports nothing. 🟢 **`LandingFooter` re-exports all four**, so any existing importer is unaffected.

## 🔴 Why the badges are a component and not two `<a>` tags in each place

**The order and the colour are vendor rules, not styling.** Apple: *"Place the App Store badge first in the lineup of badges"* and *"whenever one or more badges for other app platforms appear in the layout, use the preferred black badge."* A second hand-written copy is a second place those can be got wrong on a surface nobody re-reads.

🟢 **Apple's badge is first in the DOM and the wrapper has no `order` property**, so the rule holds by construction and cannot be undone in CSS. The Apple badge was **already black** — as `public/badges/README.md` predicted on 2 September, adding Google's needed no colour change and no panel.

⚠️ **The wrapper and link classes REPLACE the component's Tailwind defaults rather than appending.** The footer is styled by `landing.css` (`.foot-apps`: flex, a 1.25rem gap satisfying Apple's clear-space rule for a pair, centred below 760px); Settings is styled by Tailwind. Appending would put two `gap` rules on one element and let stylesheet order decide.

## 🧪 Verified by execution

```
freshness: app-badges.ts ✅ IDENTICAL e11a5a2629ea2559…  (copied verbatim, imports nothing)

APP_STORE_URL          https://apps.apple.com/gb/app/hatchgrab/id6803543106
APP_STORE_BADGE_SRC    /badges/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg
GOOGLE_PLAY_URL        https://play.google.com/store/apps/details?id=com.hatchgrab.app&hl=en
GOOGLE_PLAY_BADGE_SRC  /badges/GetItOnGooglePlay_Badge_Web_color_English.svg

🔴 do the badge files actually EXIST on disk?
  ✅  public/badges/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg
  ✅  public/badges/GetItOnGooglePlay_Badge_Web_color_English.svg
```
🔴 **The existence check is the one that matters.** The previous build's constant named a **`.png`** that never existed — a wrong extension is a broken image, and no type check catches it. It is now `.svg` and both files are on disk.

🟢 **The pair matches at `height: 40px`, checked rather than assumed.** Some Google badge downloads ship with built-in clear space and read smaller than Apple's at the same height. **This one does not:** its first element is `<rect x="-.11" width="239.17" height="70.87" rx="8.86">` — full-bleed, the same shape as Apple's black badge. Rendered widths: **Apple 120px, Google 135px** — same height, different word count. Forcing them equal would scale one off-ratio, which both vendors forbid.

🧪 `tsc --noEmit` — **exit 0**. 🧪 No hand-written badge markup survives anywhere: `grep -rn "badges/" app components --include="*.tsx"` returns **only** `StoreBadges.tsx`.

---

## 🔴 THE UX DECISION — second card in Settings, and web-only

**Placement: directly under "New to HatchGrab?", above Logo.**

- It is the **same kind of thing** as the walkthrough card — a one-time orientation action a new operator takes once, not a setting they return to adjust. Everything below it (logo, contact, hours, auto-replies, danger zone) is configuration.
- Burying it at the bottom would put the thing an operator most needs on their **first** visit behind fourteen things they need on their fiftieth.
- **Not first**, because the walkthrough earns that slot: someone who does not yet know what the tabs do is not helped by being sent to an app store. Orientation, then the app.
- 🔴 **It is not a setting and must not become one** — no toggle, no state, no write. Two links and a sentence.

**🔴 Web-only (`!isNativeApp()`), and that is not cosmetic:**
1. An operator reading this **inside** the app does not need a link to download the app.
2. 🔴 **Pointing at the other platform's store from inside a native shell is a problem this codebase already has a rule about.** `lib/commerce-policy.ts` exists because Apple restricts steering users out of an iOS app; a Google Play badge rendered inside the iOS build is exactly what App Review looks for, and the reverse is merely absurd. **Hiding on native removes the question rather than answering it.**

**The copy:** *"The kitchen app runs your service on a phone or tablet — and it is the only way to keep taking orders when you lose signal. Free with your account, on iPhone, iPad and Android."* — the one thing the app does that a browser cannot is the reason to install it.

---

## Click-through (Safari, macOS) — 🔴 I rendered none of this

1. **Manage → Settings.** **See:** "New to HatchGrab?" first, then **"Get the app"** with two badges side by side, then Logo. 🔴 **Wrong if either badge is a broken-image icon** — that is the extension bug.
2. **Tap each badge.** **See:** the App Store listing; the Play listing for `com.hatchgrab.app`. 🔴 **The Play link has never been opened by me.**
3. **At 390px.** **See:** the badges wrap and stay legible; Apple's stays **first**.
4. **The landing footer** (needs your admin session — `/landing` is admin-gated). **See:** the same pair, Apple first, both 40px tall, centred at ≤760px.
5. **In the iOS and Android apps** → Manage → Settings. **See: NO "Get the app" card at all.** 🔴 **Wrong if it appears** — that is the review-risk case.

## What I could not verify

- 🔴 **Nothing was rendered in a browser.** Both badges, the card, the pair's alignment and the mobile wrap are **source-read plus arithmetic**. `/landing` is admin-gated and no agent admin session is obtainable.
- 🔴 **Neither store URL has been opened by me.** Apple's was already in the repo; Google's is as you supplied it.
- ⚠️ **The native hide is source-read.** I cannot run either app shell.
- ⚠️ **Google's brand guidelines were not re-read today** — the badge is used unmodified, at the supplied aspect ratio, after Apple's, which satisfies what the README already records.

## The tree

🟢 **`main` `2ca66cd`, HEAD `2ca66cd`, 0 staged.** New: `lib/app-badges.ts`, `components/StoreBadges.tsx`, the SVG. Modified: `components/landing/LandingFooter.tsx`, `app/manage/[token]/page.tsx`, `public/badges/README.md`.

🔴 **`app/manage/[token]/page.tsx` now carries THREE workstreams** — WhatsApp S1–S5, custom-domain, and this. The `git add -p` set is **six files**, unchanged in membership: `lib/custom-domain/copy.ts`, `app/manage/[token]/page.tsx`, `app/api/manage/route.ts`, `app/landing/page.tsx`, `lib/plan-features.ts`, `lib/landing-table.ts`.

🟢 Unchanged: the pre-existing five (46+/53−), `lib/whatsapp/*`, `app/domain/page.tsx` (0 changes), `app/landing/page.tsx` (untouched by this edit).
