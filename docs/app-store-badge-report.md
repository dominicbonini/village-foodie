# App Store download badge on the landing page — READ-ONLY report

**Nothing was built.** Item 6 gates the build on your answer about the asset, and item 3 gates it on the
App Store URL, which is **not recorded anywhere in this repository**. Two questions at the end.

**VERIFICATION — what I actually did:** repository **reads** only (no code changed, so there is nothing to
typecheck and I am not offering one as verification), plus **one live fetch of Apple's guidelines page**
so §2's numbers are read rather than recalled. **No render was measured** — and note that
`app/landing/page.tsx` renders only on a hatchgrab host (`proxy.ts:89` rewrites `/` to `/landing` when
`host.includes('hatchgrab')`), and see the gate in §5, which changes who can see this page at all.

**GARBLED SPANS: none.** The closing line has typos ("lkanding", "fiule") but is unambiguous; I read it as
*"if the Apple logo is in the footer on laptop then will need the white version as looks better. Have the
file if you need."* **That reading matters and it points the wrong way — see §2c.** No two instructions
in the brief contradict each other.

---

## 🔴 Two things I found before answering, because they change the answers

### A. There is a standing instruction against exactly this, recorded in the footer

`components/landing/LandingFooter.tsx:56-61`, **READ verbatim**:

> 🔴 THE APP LINE WAS REMOVED HERE — 18 August 2026, **ON REQUEST**. The footer no longer mentions the
> iPhone/iPad apps at all. The rule it used to satisfy still binds anything that brings it back: **TEXT
> ONLY, NO APP STORE OR GOOGLE PLAY BADGE, NO LOGO, NO LINK** — Apple's marketing guidelines require a
> badge to link to a LIVE listing and there is none yet — and "COMING SOON", NEVER "AVAILABLE".

**Half of that rule has expired and half has not.** The stated *reason* — "there is none yet" — is spent:
you say the iOS app is live. But "removed **on request**" is a decision you made, not a consequence of
the missing listing, and your brief asks for a badge without mentioning it. **I am not treating this
brief as silently overriding an instruction you gave on 18 August.** It does not block the placement I
recommend (which is not the footer) — but it does block the footer, which your closing line contemplates.

### B. The landing page is admin-only in production

`app/landing/layout.tsx:44-46`, **READ**:

```ts
if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) {
  redirect('/contact')
}
```

**Every non-admin visitor to hatchgrab.com is redirected to /contact.** The same file records the gate
comes off only when two non-code conditions are met (Gusto's written consent to publish their words, and
"are the screenshots real"). **So a badge placed on this page today is seen by you and no one else.** It
is still worth placing — the gate will come off — but it is the reason §5 matters more than §1.

---

## 1. Where the badge belongs

**RECOMMENDATION: inside the "No signal? Keep serving." block** — `app/landing/page.tsx:194`, the
`does-item` that already reads *"Carry on taking orders with the iPhone and iPad app. Android coming
soon."*

**Why that one, against each candidate:**

| Candidate | Verdict | Reason |
|---|---|---|
| **"No signal? Keep serving."** | ✅ **RECOMMENDED** | It is the only place on the page where the app is a claim the reader has just been given a reason to care about. The badge is *evidence for that sentence*, not a floating download button. It is on `--paper` (#FFFFFF, the section at `:184` carries no `.band` class) — which §4 shows is the only background that survives Android publishing. |
| **Hero** | ❌ | The hero has exactly one CTA — `DemoCta` "Upload my menu →" (`:130`) — and the whole page converts to that demo. A second, competing call to action in the hero costs conversions. Worse, it is aimed at a reader with **no account**: the app is an operator tool and is useless to them. |
| **Features table** | ❌ | Fully data-driven from `lib/plan-features.ts` via `TRANSACTION_ROWS` / `FEATURE_SECTIONS` (`:432-460`). It is a per-plan comparison grid — a badge is not a plan value, and putting one there means touching the shared data source that Billing and Admin also render. |
| **Footer** | ❌ | Three separate blockers: (a) the 18-August instruction above; (b) it is `bg-slate-900` (`lib/brand.ts:68`) with `color:#fff` (`landing.css:449`), so it needs the **white** badge today and the **black** badge the day a Play badge joins it — see §4 — and black on slate-900 is unreadable; (c) it is the lowest-attention position on the page for something that is currently the product's strongest proof point. |

**⚠️ THE ONE HONEST COST OF MY RECOMMENDATION.** `.does` is a CSS grid (`landing.css:247`) whose items
default to `align-items: stretch`, so a taller cell **makes its whole row taller**. Adding a ~40px badge
plus Apple's required clear space to one card will add roughly 60-70px to that row. On the single-column
mobile layout this is invisible; on the multi-column desktop layout the neighbouring cards in that row
will gain whitespace under their text. **I will measure this in a browser before I claim it is fine, not
assert it.** If you would rather not touch the grid at all, the alternative is a single centred badge row
immediately *below* the `.does` grid inside the same `<section>` — same white background, same context,
no grid deformation, slightly less tightly bound to the sentence. **Say which you prefer.**

**Not scattered:** one placement, one badge, one link.

---

## 2. Apple's requirements

**Source: `https://developer.apple.com/app-store/marketing/guidelines/`, fetched during this task.**
Quoted wording below is Apple's, read from that page — **not recalled**.

### a. The official artwork — and it is NOT in this repository

**🔴 THE ASSET DOES NOT EXIST HERE. I checked.** The only Apple-named file in `public/` is
`public/apple-touch-icon.png`, which is *our own* HatchGrab web-clip icon (regenerated earlier this
session from `public/icons/hatchgrab-icon.svg`) and has nothing to do with the badge. There is no
`appstore`, `app-store`, `badge` or `download` artwork anywhere in the tree.

**I have not drawn, traced or approximated it, and I will not.** Apple: *"Use only the badge artwork
provided in these guidelines."*

**WHAT YOU NEED TO DOWNLOAD, AND FROM WHERE — two options, either is official:**

1. **App Store Marketing Tools — `https://toolbox.marketingtools.apple.com/app-store/`** ← **preferred.**
   You search for your live app, and it generates **both the badge artwork and the correct product-page
   short link together**. That solves §3 at the same time. Apple: *"Generate short links or embeddable
   code that lead to your App Store product page and display your app icon, a QR code, or an App Store
   badge."*
2. **The guidelines page itself**, which offers *"Download Artwork (336 MB)"* — the full kit. Apple:
   *"App Store badges are available in 50 localizations… Versions are available for the App Store for
   iPhone and iPad, the Mac App Store, and Apple TV."* You want the **App Store for iPhone and iPad**
   badge, **en-GB** (or en-US — check which your listing uses), preferably the **SVG**.

### b. Minimum size and clear space — Apple's exact numbers

- **Minimum size:** *"Minimum badge height is 10 mm for use in printed materials"* and **"40 px for use
  onscreen"**. Ours is onscreen → **never below 40px tall**.
- **Clear space:** *"Minimum clear space is equal to **one-quarter the height of the badge**."*
  ⚠️ There is a relaxed case — *"Minimum clear space for very limited layout space is equal to one-tenth
  the height of the badge"* — but that is for things like mobile banners. **A `does-item` card is not
  limited layout space, so we use the one-quarter rule**: at 40px tall, ≥10px clear on all four sides.
  🔴 **I would have got this wrong from memory** — I expected one-tenth. This is why I fetched the page.

### c. 🔴 BLACK OR WHITE — AND YOUR CLOSING LINE ASKS FOR THE WRONG ONE

Apple: *"**Whenever one or more badges for other app platforms appear in the layout, use the preferred
black badge.** Place the App Store badge first in the lineup of badges."*

Your closing line offers the **white** version, conditioned on the badge going **in the footer**. My
recommendation is **not** the footer — it is the white `does` section, where the badge must be **black**
to be legible. And §4 shows that the day Android publishes, Apple *requires* black anyway.

**So: please send the BLACK badge, not the white one.** The white one is only needed if you overrule §1
and put it in the dark footer — and if you do, it will have to be swapped for black when Android
publishes, at which point the footer needs a light panel behind it. That is the whole argument for the
light background.

### d. What is NOT permitted

Apple, verbatim:
- *"**Don't modify, angle, or animate** the App Store badge."*
- *"Use only the badge artwork provided in these guidelines. **Don't use icons, logos, graphics, or
  images from www.apple.com** to promote your app. **Never use the Apple logo in place of the word
  Apple. Don't use the standalone Apple logo.**"*
- On product imagery, and the same spirit binds the badge: no *"reflections, shadows, highlights…
  cropping, tilting, or obstructing any part of the images; animating, flipping, or spinning…"*

**Consequences for our build, concretely:**
- No `transform: rotate()`, no CSS `filter`, no hover animation, no drop-shadow on the badge.
- No recolouring to brand orange. No rounding its corners. No cropping it into a square.
- It must not be rebuilt as HTML/CSS text or an inline SVG we author — it is a supplied file.
- It **must link to the live App Store product page** and nowhere else. Apple's own wording ties the
  badge to *"your App Store product page"*.
- The `alt` text should read "Download on the App Store" — not a paraphrase.

---

## 3. The App Store URL — 🔴 NOT RECORDED ANYWHERE. I need it from you.

**Searched and READ:** every `.ts`, `.tsx`, `.json`, `.md`, `.css`, `.plist` and `.xml` in the repo for
`apps.apple.com`, `itunes.apple`, `appstore`, `app-store` and a 9-10 digit `id…` — **no App Store URL
exists in this repository.** `docs/reference-manual.md` does not record one either; its only two hits are
an unrelated "Apple ID login: BACKLOGGED" note (`:3583`) and an open question about whether the listing
is universal or iPad-only (`:16841`). `content/store-listing.md` holds the listing *text* and explicitly
says (`:125-126`) the App Store copy has **not** been reconciled with what was submitted.

**What IS recorded:** the bundle identifier `com.hatchgrab.app` (`capacitor.config.ts:24`, and
`PRODUCT_BUNDLE_IDENTIFIER` in `ios/App/App.xcodeproj/project.pbxproj:324,348`).

🔴 **A bundle id does not yield a store URL.** The public URL needs Apple's numeric app ID
(`https://apps.apple.com/gb/app/<slug>/id<numeric>`), which is issued by App Store Connect and appears
nowhere here. **I am not constructing one.** Please send it — or use the Marketing Tools link in §2a,
which hands you the canonical short link and the badge in one go.

---

## 4. How the badge area should read while Android is in review

**WHILE ANDROID IS IN REVIEW — one badge, and the existing sentence does the rest:**

- **The Apple badge only.** **No Play badge** — you said so, and independently Google's own brand rules
  do not permit a Play badge for an app that is not published, so there is nothing legitimate to place.
- **Do not add new "coming soon" copy.** The page already says it, twice, in your voice:
  - `page.tsx:194` — *"Carry on taking orders with the iPhone and iPad app. **Android coming soon.**"*
  - `page.tsx:88` — *"The iPhone and iPad app keeps you taking orders offline (**Android coming soon**)…"*
  The badge sits under the first of those. Adding a third "Android coming soon" beside the badge would
  repeat a sentence the reader has just read.
- **Do not write "Also on Android soon" as a fake second badge, greyed-out slot, or dashed placeholder.**
  A disabled-looking Play badge is exactly what Google's rules forbid, and the footer's own recorded rule
  already says **"COMING SOON", NEVER "AVAILABLE"**.
- **Leave room in the layout for a second badge** so adding one later is not a redesign.

**WHAT CHANGES THE DAY ANDROID PUBLISHES — three things, and they are all forced:**

1. **Add the Play badge AFTER the Apple badge.** Apple: *"Place the App Store badge **first** in the
   lineup of badges."*
2. **The Apple badge must be BLACK.** Apple: *"Whenever one or more badges for other app platforms appear
   in the layout, use the preferred black badge."* 🔴 **This is the single reason my §1 recommendation is
   a light background.** Put the badge on the dark footer today and this rule turns into a footer
   redesign later. Put it on white and **nothing has to change** — the badge is already black.
3. **Drop "Android coming soon" from `page.tsx:194` and `:88`.** Both become false the moment it ships,
   and `:88` is a `DETAIL_OVERRIDES` entry on the landing page only — the shared
   `lib/plan-features.ts` text is untouched, so that edit is landing-local.

---

## 5. Other surfaces — 🔴 yes, and they matter more than the landing page

**Reported, not built, as instructed.**

**The evidence, READ:** the app is mentioned in **exactly two places in the entire product**, and both
are on the admin-gated landing page (`page.tsx:88` and `:194`). A third hit,
`components/native/AppLockGate.tsx:96`, is a PIN-recovery line inside the app itself, not a pointer to it.

**So an operator who signs up today is never told the app exists, and if they are, they cannot reach a
download.** Combined with the gate in §B, the landing page is currently the *worst* place to solve this.

| Surface | Verdict | What I read |
|---|---|---|
| **Post-signup welcome email** | 🔴 **THE STRONGEST CASE, AND THERE IS ALREADY A SLOT FOR IT** | `lib/email-signup.ts:175 sendOperatorWelcomeEmail`, sent from `app/api/auth/verify-signup/route.ts:100`. **READ: it does not mention the app at all.** It already contains the line *"Worth bookmarking. It works on any device."* — which is precisely where "and there's an iPhone and iPad app" belongs. This reaches the person who has just signed up and most needs it, at the moment they need it. ⚠️ **A badge in an email is a different problem**: images are commonly blocked, so it wants a text link with the badge as an enhancement, not a bare badge. |
| **Operator dashboard / manage** | **Strong case, second** | **READ: no app mention anywhere in `app/dashboard` or `app/manage`.** This is where an operator already logged in on a phone browser would convert instantly. ⚠️ **It must be suppressed inside the native app** — the existing `App Store 3.1.1/3.1.3` gating pattern in `app/manage/[token]/page.tsx` shows the mechanism. Telling someone already in the app to download the app is a support ticket. |
| **Onboarding flow** | **Weak** | `app/signup/page.tsx` exists but the useful moment is *after* verification, which is the welcome email above. |
| **`/contact`** | **Worth noting, not recommending** | It is the Support URL given to App Store review (`app/contact/page.tsx:3`) **and** where the landing gate sends every non-admin. So today it is the only HatchGrab page a real prospect can load. I am flagging that, not proposing it — a download badge on a support page is the wrong content for the page. |

---

## 6. Build — 🔴 NOT DONE, and blocked on two answers

Item 6 says build "once you have my answer on the asset". I have neither the asset nor the URL, and §2d
means I cannot substitute anything for either. **Nothing was changed. Nothing deployed, nothing
committed, no SQL, no migrations.**

The three protected strings (`'Online ordering — Pay at Hatch'` at `lib/plan-features.ts:185`, the bare
`'—'` glyph, and the Pizzeria Gusto testimonial at `page.tsx:243-280`) are untouched, as is the Gusto
logo's `width={320} height={233}`, `lib/features.ts`, and the landing admin gate in
`app/landing/layout.tsx`.

### What I need from you

1. 🔴 **The BLACK "Download on the App Store" badge**, not the white one — see §2c. SVG preferred, from
   Apple's official kit or the Marketing Tools generator. (The white one is only right if you overrule
   §1 and choose the footer, which also means overriding the 18-August instruction in §A.)
2. 🔴 **The App Store product-page URL.** Not in the repo, not in the manual — see §3. The Marketing
   Tools page at `https://toolbox.marketingtools.apple.com/app-store/` gives you the badge and the
   canonical link together, so one visit settles both.

### Also worth a yes/no when you reply

3. Inside the "No signal?" card, or a centred row directly beneath the `.does` grid? (§1's honest cost.)
4. Does the 18-August footer instruction (§A) still stand? My recommendation does not touch the footer,
   so a "yes, it stands" costs you nothing.
5. Do you want §5's welcome-email and dashboard placements written up as their own brief? They reach
   operators; the landing page currently reaches only you.
