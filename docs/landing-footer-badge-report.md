# App Store badge in the landing footer — build report

**Built. Not deployed, not committed. No SQL, no migrations. No `maxDuration` or gate touched.**

**VERIFICATION — what I actually did.** I am **not** offering the typecheck as verification (it passes;
it proves only that it compiles). **I rendered this page in a real browser and measured it.** Every
number below is a live `getBoundingClientRect` from Chromium against the running dev server, at
`http://hatchgrab.127.0.0.1.nip.io:3000/` — a **hatchgrab host**, because as your brief noted the landing
renders only on one. Screenshots were taken of the `<footer>` element itself at each width.

🔴 **AND THAT HOST DETAIL BIT ME, WHICH IS WHY I CHECKED.** My first run loaded `localhost:3000/landing`,
got **HTTP 200**, and found no footer. It had silently redirected to `/` and served **Village Foodie**.
A freshness assertion in the harness (is the `.foot-apps` rule actually in the served CSS, is the badge
actually in the DOM) stopped the run rather than letting me measure the wrong page and report it as fact.
The `nip.io` host fixed it. **Anything I state as measured was measured on the real landing page.**

🔴 **THE ADMIN GATE IS STILL ON.** `app/landing/layout.tsx:44` redirects every non-admin to `/contact` in
production. It is untouched. **In production this badge is currently visible to you and nobody else** —
that is not a consequence of this change, but it is the fact that governs how much it is worth.

**GARBLED SPANS: none.** No instruction contradicted another. **One gap, flagged in §4: you wrote "I am
supplying the asset and the App Store URL" — the two SVGs arrived, the URL did not.**

---

## 0. Where the artwork now lives

```
public/badges/
  Download_on_the_App_Store_Badge_US-UK_RGB_wht_092917.svg   ← IN USE (dark footer)
  Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg   ← held for the Android switch
  README.md                                                   ← provenance + Apple's rules + when to swap
```

Both written **byte-for-byte as supplied** and confirmed to parse as XML at Apple's native
`119.66407 × 40`. **Apple's own filenames are kept deliberately** — they encode locale (`US-UK`), colour
(`wht`/`blk`) and Apple's version code (`092917`). The README records what each is, which is live, why
the black one exists, and Apple's constraints, so the next person does not have to re-derive any of it.

⚠️ Not to be confused with `public/apple-touch-icon.png`, which is **our own** web-clip icon.

---

## 1. Placement, and whether it meets Apple's requirements

### Where: the **brand column of `.foot-grid`, directly under `.foot-tag`**

Wordmark → tagline → badge. Not `.foot-links`, not `.foot-base`. Why, in order:

- **`.foot-links` is a text row** on a `1.4rem` gap (`landing.css:459`). A 40px image dropped into it
  breaks that rhythm and could not be given Apple's clear space without distorting the row.
- **`.foot-base` is the legal strip** — © line and the Village Foodie credit. A download control is not
  legal text, and that row is `space-between`, so a third child would redistribute the two existing ones.
- **The brand column is the conventional home** for store badges, and it **inherits the existing mobile
  centring for free**: `@media(max-width:720px)` already turns `.foot-grid` into a centred column
  (`landing.css:466`). One extra line (`justify-content: center` on `.foot-apps`, added inside that same
  existing block) centres the badges themselves. No new breakpoint was introduced.

### Apple compliance — MEASURED, not asserted

| Requirement (Apple's wording) | Required | **Measured** | |
|---|---|---|---|
| Official artwork, unmodified | — | byte-identical file, served as a plain `<img>` | ✅ |
| *"40 px for use onscreen"* | ≥40px high | **40.00px** at 1280 / 390 / 320 | ✅ exactly at the minimum |
| Undistorted | ratio 2.9916 | **2.9915** (119.66 × 40) | ✅ sub-pixel |
| *"Minimum clear space is equal to **one-quarter** the height of the badge"* | ≥10px all sides | **top 20.0** · bottom **38.3** (desktop) / **84.7** (mobile) · left **40.0** (desktop) / **100.2** (320px) | ✅ 2× the requirement or better |
| *"Don't modify, angle, or animate"* | — | no `filter`, `transform`, `box-shadow`, `border-radius`, `opacity` or hover effect anywhere | ✅ |
| Links to the App Store product page | — | see §4 — **link value not yet supplied** | ⚠️ |

**On the clear space I nearly got wrong:** Apple's rule is **one-quarter** of badge height, not
one-tenth. The one-tenth relaxation is explicitly *"for very limited layout space"* (mobile banners); a
footer is not that. I read this off Apple's page rather than recalling it, and my recollection had been
the wrong number. The CSS uses **20px**, double the 10px requirement, so the rule still holds if anything
is ever nudged — and so the gap between two badges satisfies it from **both** badges at once.

**Why height-only in CSS:** `height: 40px; width: auto` means the artwork can never be scaled off-ratio.
Setting both would risk a stretch, which is a modification.

**Why a plain `<img>` and not `next/image`:** `next/image` will not process an SVG without
`dangerouslyAllowSVG`, and Apple forbids modifying the artwork. Serving the file untouched is both
simpler and the only thing that is certainly compliant.

---

## 2. Two badges — the layout is already sized for it

`.foot-apps` is a **wrapping flex row** with a 20px gap, and the second slot is marked in
`LandingFooter.tsx` with the exact instruction. **I simulated the second badge and measured it:**

| Width | Gap | Wrapped to 2 rows? | Page scrolls sideways? |
|---|---|---|---|
| 1280px | 20px | **no** | no |
| 390px | 20px | **no** | no |
| 320px | 20px | **no** | no |

My simulation cloned the **Apple** badge, so the pair measured **259.3px**. A real Play badge is
646 × 250 native → **103.4px** at 40px tall, so the real pair is **243.0px**. **My measurement is the
worst case; the real thing has ~16px more room.**

### What changes the day Android publishes

1. **Add the Play badge as a sibling `<a>` after the Apple one.** Apple: *"Place the App Store badge
   **first** in the lineup of badges."* After, never before. **No CSS change** — the flex row absorbs it.
2. 🔴 **Swap the white Apple badge for the black one.** Apple: *"**Whenever one or more badges for other
   app platforms appear in the layout, use the preferred black badge.**"* This is a rule, not a taste.
   The black file is already filed for exactly this.
3. **Remove "Android coming soon"** from `app/landing/page.tsx:194` and `:88`. Both become false. `:88` is
   a landing-only `DETAIL_OVERRIDES` entry, so `lib/plan-features.ts` is not involved.

### 🔴 One thing that is NOT free, and I am not going to pretend otherwise

You asked for "a single deploy, not a layout rework". **The layout is genuinely free — nothing moves.**
But step 2 is not cosmetic: **a black badge on `bg-slate-900` is close to invisible.** So that deploy
must also put a light panel behind the badge pair (a `background`, `padding` and `border-radius` on
`.foot-apps` — the badge itself must stay untouched). That is a handful of CSS lines on one existing
selector, not a rework, but it **is** work and it **cannot** be skipped. It is the unavoidable cost of
putting the badge on a dark surface, and it is the one thing my earlier report recommended against.
Flagging it now so it is not a surprise on the day.

---

## 3. Mobile — MEASURED, and it is **not** cramped

Rendered and screenshotted at both widths, one badge and two.

| | 320px | 390px | 1280px |
|---|---|---|---|
| Badge size | 40px high, undistorted | same | same |
| Clear space L/R to wrap edge | **100.2px** each side | **135.2px** each side | 40px left |
| Footer height | 312.7 → **372.7px** | 312.7 → **372.7px** | 236.4 → **296.4px** |
| Horizontal overflow | **none** | **none** | **none** |
| Two badges | fits, no wrap | fits, no wrap | fits, no wrap |

**Verdict: it is comfortable, not cramped.** At 320px the footer is already a centred single column —
wordmark, tagline, links, legal — and the badge slots into that rhythm with 20px above it and 84.7px
below. The screenshot shows generous space either side. **Nothing is tight at either width, and nothing
overflows.** The cost is **+60px of footer height**, on a footer that is already 313px tall on mobile —
a 19% increase on the footer, and **+60px on a 14,102px page (0.4%)**.

**RECOMMENDATION: leave it visible at every width. Change nothing.** The measurements do not support
hiding or shrinking it, and each alternative has a real cost:

| Option | Cost | |
|---|---|---|
| **Leave as built** | +60px footer height on mobile | ✅ **Recommended** |
| Hide below a breakpoint | 🔴 Removes it from **the majority of visitors** — a food-truck audience is phone-first — and hides it from the device that can actually install the app. Self-defeating. | ❌ |
| Stack vertically | Only relevant with two badges, and they **do not need to stack** — measured, they fit side by side at 320px. | ❌ no problem to solve |
| Shrink within Apple's minimum | 🔴 **There is no room.** 40px **is** Apple's onscreen minimum; the badge is already at it. Going smaller breaks the guidelines. | ❌ not available |

**Your call, not mine — but nothing I measured argues for changing it.**

---

## 4. What the badge should link to

### It must be the App Store product page, directly — not a smart URL

Apple ties the badge to *"your App Store product page"*. A router or smart URL puts a redirect between
the badge and the page Apple requires it to reach, and buys nothing here: there is exactly one store
listing today.

### 🔴 THE URL WAS NOT SUPPLIED, AND IT IS THE ONLY THING BLOCKING DEPLOY

Your brief said *"I am supplying the asset and the App Store URL"*. **The two SVGs arrived; no URL did.**
It is recorded **nowhere** in this repository — I searched every `.ts/.tsx/.json/.md/.css/.plist/.xml`
for `apps.apple.com`, `itunes.apple`, `appstore` and a numeric `id…`, and `docs/reference-manual.md`
has none. `com.hatchgrab.app` is the **bundle id**, which does not yield a store URL.

So `LandingFooter.tsx` exports one constant:

```ts
export const APP_STORE_URL = 'APP_STORE_URL_NOT_YET_SUPPLIED'
```

**Deliberately invalid**, so it can never be mistaken for a real link or quietly ship looking correct.
Replace that one string — form `https://apps.apple.com/gb/app/<slug>/id<numeric>` — and nothing else
changes. `https://toolbox.marketingtools.apple.com/app-store/` gives you the canonical link.

### What a visitor sees on each platform, since the footer is on every device

| Visitor | What happens on an `apps.apple.com` link |
|---|---|
| **iPhone/iPad, app NOT installed** | Opens the **App Store app** on the product page. One tap to Get. Correct. |
| **iPhone/iPad, app ALREADY installed** | Opens the **App Store app** on the product page, where the button reads **OPEN** instead of GET. **One extra tap and they are in the app.** |
| **Mac** | Opens the product page in **App Store on Mac** or the browser. An iOS-only app shows as "not available on Mac" — a dead end, but an honest one. |
| **Windows / Linux desktop** | Opens the **web** product page. Informational; they cannot install. |
| **Android** | Opens the **web** App Store page in the browser. 🔴 **A dead end for them today** — and the reason the "Android coming soon" copy at `page.tsx:194` matters: it is the sentence that stops that being a surprise. |

### 🔴 Your follow-up: "it should take them to the HatchGrab app if they have it"

**It cannot today, and this is not a landing-page change.** I checked, and found **none** of the three
things required:

- **No `apple-app-site-association` file** anywhere (no `public/.well-known/`).
- **No `associated-domains` entitlement** in `ios/App` — no `applinks:` entry.
- **No custom URL scheme** (`CFBundleURLSchemes`) in `Info.plist`.

Without an associated domain, no link on hatchgrab.com can open the installed app. Enabling it needs the
entitlement, an AASA file served from the domain, and — because an entitlement is baked into the binary —
**a native rebuild and a new App Store submission.** Unlike `lib/native/*`, this is **not** something a
Vercel deploy can ship.

⚠️ **And it would not belong on the badge anyway.** Apple requires the badge to point at the product
page; pointing it at an app-opening link would break that. The right shape, if you want it, is a
**separate "Open the app" link** beside the badge — a distinct piece of work, worth its own brief.

**The good news:** the store link already does most of what you asked. An iOS visitor with the app
installed lands on a page whose button says **OPEN**. It is one tap more than ideal, not a dead end.

---

## 5. Protected strings and gates

**Verified untouched by `git diff` — all three return no changes:**

- `lib/plan-features.ts` — holds `'Online ordering — Pay at Hatch'` (`:185`) and the `'—'` cell value. **Not modified.**
- `lib/features.ts` — **not modified.**
- `app/landing/layout.tsx` — the admin gate. **Not modified.**
- The Pizzeria Gusto testimonial (`app/landing/page.tsx:243-280`) and the Gusto logo's
  `width={320} height={233}` — **`app/landing/page.tsx` was not touched at all in this task.**

---

## 6. What else moves or reflows — MEASURED at every breakpoint

Measured by rendering the real footer twice, once with `.foot-apps` hidden and once as built, and
diffing every element's box.

| Element | x position | width | Result |
|---|---|---|---|
| `.foot-logo` (wordmark) | **unchanged** | **unchanged** | pushed down only |
| `.foot-tag` | **unchanged** | **unchanged** | pushed down only |
| `.foot-links` | **unchanged** | **unchanged** | pushed down only |
| `.foot-base` | **unchanged** | **unchanged** | pushed down only |
| `footer .wrap` | **unchanged** | **unchanged** | — |

**Identical at 1280px, 390px and 320px. Nothing moved horizontally and nothing changed width.**

**The only reflow is vertical:** the footer grows **+60px** at every width (40px badge + 20px clear
space), and the page grows by the same 60px. On desktop the badge sits in the brand column's own space
and **does not push `.foot-links`**, which is in the opposite column — confirmed in the desktop
screenshot with two badges.

⚠️ **One caveat on my own numbers:** the per-element *y* deltas I captured are relative to a scrolled
viewport and are not independently meaningful. **The trustworthy figures are the x/width results (all
unchanged) and the footer-height delta (+60.0px), which are scroll-independent.**

---

## Files changed

```
public/badges/…wht_092917.svg    NEW — official artwork, byte-identical, in use
public/badges/…blk_092917.svg    NEW — official artwork, byte-identical, held for the Android switch
public/badges/README.md          NEW — provenance, which is live, Apple's rules, when to swap
components/landing/LandingFooter.tsx   +67 lines — badge block, the reversal note, APP_STORE_URL
app/landing/landing.css                +47 lines — .foot-apps / .foot-badge + one mobile centring line
```

The 18 August instruction against footer app badges is **recorded as reversed, with your reason quoted
and the original note left intact beneath it**, as you asked — not deleted.

## 🔴 One thing before this can ship

**The App Store product-page URL.** Everything else is built and measured.
