# HATCHGRAB BRAND VALUES + ORANGE DIVERGENCE AUDIT — READ-ONLY

**Date:** 30 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Current branch:** `main`
**Status: 🛑 READ-ONLY. No file changed but this report. No `next dev` / `next build` run.**
Facts only, from the tree. **Nothing proposed, nothing changed.**

**Prompt integrity:** no span read as garbled or truncated.

---

# 🔴 BRANCH NOTE — READ THIS FIRST, IT CHANGES HOW TO READ EVERYTHING BELOW

You said the landing work lives on `landing-v32`. **It did, and it has since been merged.**

```
git rev-list --left-right --count main...landing-v32   →   main ahead: 30   landing-v32 ahead: 0
merge-base = b1ca1fb "final landing" = landing-v32's own tip (18 Jul 2026)
main tip   = 8618e4c "general fixes" (30 Jul 2026)
```

🔴 **`landing-v32` is an ANCESTOR of `main`. It is 0 commits ahead — main contains everything it has, plus 30 commits.**
So `main` is authoritative and `landing-v32` is a **historical snapshot**, not a parallel line of work.

| File | Differs? | Which is newer |
|---|---|---|
| `components/brand/HatchGrabWordmark.tsx` | ❌ **IDENTICAL** on both | — |
| `lib/brand.ts` | ❌ **IDENTICAL** on both | — |
| `app/landing/landing.css` | ✅ differs | **main** (+17 lines) |
| `app/landing/page.tsx` | ✅ differs | **main** (+43 / −26) |
| `app/signup/page.tsx` | ✅ differs | **main** (+128; the file barely existed on `landing-v32`) |

**Both versions are reported where they differ; `main` is labelled as current throughout.** ⚠️ A `git diff --stat main..landing-v32` reads as a huge deletion (−24,987 lines) purely because it is running *backwards* down history — not because landing-v32 removed anything.

---

# PART A — THE ORANGE SWEEP

## A4 (answered first, because it frames everything)

# 🔴 THERE IS NOT ONE PRIMARY ORANGE. THERE ARE THREE VALUES IN PLAY, AND FOUR IF YOU COUNT A DEAD ONE.

| # | Value | Where it is the primary | Status |
|---|---|---|---|
| **1** | **`#ea580c`** — Tailwind `orange-600` | **The entire application**: dashboard, manage, KDS, customer order page, shared components, signup | 🟢 **dominant — 101 `bg-`, 106 `text-`, 13 `border-` uses** |
| **2** | **`#EF8B2C`** — `--orange`, a warm amber-gold | **`app/landing/` only**, via CSS custom property | 🔴 **DIVERGENT — not a Tailwind colour at all** |
| **3** | **`#D9741A`** — `--orange-deep` | landing hover state only | 🔴 divergent (Tailwind `orange-700` is `#c2410c`) |
| **4** | **`#E76F51`** — `--accent` in `app/globals.css:9` | **nowhere** | ⚰️ **DEAD — defined, never referenced outside its own declaration** |

## 🔴 THE THREE PROOFS OF DIVERGENCE

**(i) The landing stylesheet asserts the two oranges are the same colour. They are not.**

[app/landing/landing.css:83-84](app/landing/landing.css#L83):
> *"Primary CTA: EXACTLY Billing's 'Upgrade to Max' button — **bg-orange-600 (var(--orange))** white text, hover orange-700 (var(--orange-deep)). ⚠️ CONTRAST: white on orange-600 = **3.56:1**"*

`var(--orange)` is **`#EF8B2C`**. `bg-orange-600` is **`#ea580c`**. **The comment equates them, and the quoted 3.56:1 contrast figure belongs to `#ea580c`, not to the colour the button actually uses.**

**(ii) The landing page itself renders BOTH oranges, in one file.**

Its brand token is `#EF8B2C`, but the inline hero truck SVG is drawn in **`#EA580C`** — hardcoded Tailwind `orange-600`:

- [app/landing/page.tsx:389](app/landing/page.tsx#L389) — `<rect … fill="#EA580C" />` (the truck's roof stripe)
- [app/landing/page.tsx:393](app/landing/page.tsx#L393) — `<rect … fill="#EA580C" />` (the truck's side stripe)

⚠️ **Both occurrences are present on `landing-v32` too (count: 2 on each branch)** — this is not something main introduced.

**(iii) `/signup` and `/landing` sit next to each other in the funnel and use different oranges.**

`app/signup/page.tsx` renders the HatchGrab wordmark and is styled entirely in **Tailwind** oranges — `bg-orange-600`, `hover:bg-orange-700`, `text-orange-500/600`, `ring-orange-400`, `accent-orange-600` — with **no `--orange` anywhere.** The landing page beside it uses `#EF8B2C`.

## ⚠️ A SEPARATE, LARGER FINDING FOUND WHILE ANSWERING THIS

**On `/signup`, the HatchGrab wordmark renders COMPLETELY UNSTYLED.**

- Every wordmark rule is scoped: `.hg-landing .logo`, `.hg-landing .logo .a`, `… .b`, `… .bolt`, `… .swoosh` ([landing.css:73-79](app/landing/landing.css#L73)).
- `landing.css` is imported by **exactly one file** — [app/landing/page.tsx:22](app/landing/page.tsx#L22) `import './landing.css'`.
- `app/signup/page.tsx` has **no `.hg-landing` wrapper** and **does not import `landing.css`**, yet renders `<HatchGrabWordmark />` at [:66](app/signup/page.tsx#L66).

🔴 **So on the signup page there is no Archivo, no italic, no `--head` navy, no orange, and no sizing or fill on either SVG.** The colours come from `var(--orange)` / `var(--head)`, which are **undefined outside `.hg-landing` / `.hg-demo-modal`**. Reported as observed; **not verified in a browser** (see limits).

---

## A1 — EVERY TAILWIND ORANGE UTILITY IN `app/`, `components/`, `lib/`

**718 occurrences across 31 distinct classes.** Full listing, grouped by shade then utility, every `file:line`.

### Shade totals

| Shade | Occurrences | Utilities used |
|---|---|---|
| orange-50 | 70 | `bg-` 69, `ring-` 1 |
| orange-100 | 32 | `bg-` 25, `border-` 6, `text-` 1 |
| orange-200 | 41 | `border-` 30, `text-` 8, `bg-` 2, `ring-` 1 |
| orange-300 | 31 | `border-` 26, `ring-` 3, `text-` 1, `decoration-` 1 |
| orange-400 | **138** | `ring-` 104, `text-` 15, `border-` 15, `decoration-` 1 |
| orange-500 | 80 | `text-` 40, `bg-` 17, `border-` 16, `accent-` 6, `ring-` 1 |
| orange-600 | **228** | `text-` 106, `bg-` 101, `border-` 13, `accent-` 8 |
| orange-700 | 92 | `bg-` 63, `text-` 29 |
| orange-800 | 4 | `text-` 4 |
| orange-900 | 4 | `text-` 4 |
| orange-950 | 0 | — |

⚠️ **`ring-orange-400` (104) is the single most-used orange class** — it is the focus-ring colour, near-universal on inputs. **`bg-orange-600` + `text-orange-600` (207 combined) is the brand primary.**


### orange-50

**`bg-orange-50`** — 69 occurrences

- `app/venues/[slug]/VenueClient.tsx:176`
- `app/venues/[slug]/VenueClient.tsx:182`
- `app/venues/[slug]/VenueClient.tsx:187`
- `app/dashboard/[token]/page.tsx:2399`
- `app/dashboard/[token]/page.tsx:2428`
- `app/dashboard/[token]/page.tsx:3213`
- `app/dashboard/[token]/page.tsx:3424`
- `app/dashboard/[token]/page.tsx:3459`
- `app/dashboard/[token]/page.tsx:3653`
- `app/trucks/page.tsx:70`
- `app/trucks/page.tsx:112`
- `app/trucks/[slug]/order/page.tsx:1272`
- `app/trucks/[slug]/order/page.tsx:1630`
- `app/trucks/[slug]/order/page.tsx:1836`
- `app/trucks/[slug]/order/page.tsx:1961`
- `app/trucks/[slug]/order/page.tsx:2084`
- `app/trucks/[slug]/order/page.tsx:2469`
- `app/trucks/[slug]/order/page.tsx:2631`
- `app/trucks/[slug]/TruckClient.tsx:177`
- `app/login/page.tsx:99`
- `app/login/page.tsx:106`
- `components/DemoModeBanner.tsx:42`
- `components/OptionStockBadge.tsx:21`
- `app/manage/[token]/page.tsx:526`
- `app/manage/[token]/page.tsx:786`
- `app/manage/[token]/page.tsx:2960`
- `app/manage/[token]/page.tsx:3094`
- `app/manage/[token]/page.tsx:3259`
- `app/manage/[token]/page.tsx:3312`
- `app/manage/[token]/page.tsx:3569`
- `app/manage/[token]/page.tsx:3569`
- `app/manage/[token]/page.tsx:4148`
- `app/manage/[token]/page.tsx:4532`
- `app/manage/[token]/page.tsx:4775`
- `app/manage/[token]/page.tsx:6371`
- `app/manage/[token]/page.tsx:6409`
- `app/manage/[token]/page.tsx:6516`
- `app/manage/[token]/page.tsx:6678`
- `app/manage/[token]/page.tsx:6678`
- `app/manage/[token]/page.tsx:6800`
- `app/manage/[token]/page.tsx:6800`
- `app/manage/[token]/page.tsx:7500`
- `app/manage/[token]/page.tsx:7628`
- `app/manage/[token]/page.tsx:7641`
- `app/manage/[token]/page.tsx:8644`
- `app/manage/[token]/page.tsx:8663`
- `app/manage/[token]/page.tsx:8711`
- `app/manage/[token]/page.tsx:9534`
- `app/manage/[token]/page.tsx:9548`
- `components/DemoGetStarted.tsx:815`
- `components/dashboard/DealsModal.tsx:265`
- `components/dashboard/DealsModal.tsx:295`
- `components/dashboard/DemoWelcome.tsx:145`
- `components/manage/primitives.tsx:82`
- `components/manage/primitives.tsx:143`
- `components/menu/MenuUploadFields.tsx:29`
- `components/menu/MenuUploadFields.tsx:30`
- `components/manage/KitchenCapacityEdit.tsx:101`
- `components/manage/ExtrasEditor.tsx:198`
- `components/manage/ExtrasEditor.tsx:269`
- `components/dashboard/AddOrderPanel.tsx:1306`
- `components/dashboard/AddOrderPanel.tsx:1559`
- `components/dashboard/AddOrderPanel.tsx:1571`
- `components/dashboard/AddOrderPanel.tsx:1893`
- `components/dashboard/AddOrderPanel.tsx:1893`
- `components/dashboard/OrderCard.tsx:752`
- `components/dashboard/OrderCard.tsx:752`
- `lib/ui-tokens.ts:41`
- `lib/ui-tokens.ts:68`

**`ring-orange-50`** — 1 occurrence

- `app/page.tsx:250`


### orange-100

**`bg-orange-100`** — 25 occurrences

- `app/admin/page.tsx:175`
- `app/dashboard/[token]/page.tsx:2093`
- `app/dashboard/[token]/page.tsx:3254`
- `app/dashboard/[token]/page.tsx:3337`
- `app/dashboard/[token]/page.tsx:3424`
- `app/dashboard/[token]/page.tsx:3602`
- `app/trucks/[slug]/order/page.tsx:1509`
- `app/trucks/[slug]/order/page.tsx:1915`
- `app/trucks/[slug]/order/page.tsx:1963`
- `app/trucks/[slug]/order/page.tsx:2470`
- `app/trucks/[slug]/order/page.tsx:2578`
- `app/trucks/[slug]/TruckClient.tsx:143`
- `app/trucks/[slug]/TruckClient.tsx:188`
- `components/EventListCard.tsx:333`
- `app/manage/[token]/page.tsx:8442`
- `app/manage/[token]/page.tsx:9564`
- `components/dashboard/UserMenu.tsx:93`
- `components/manage/primitives.tsx:15`
- `components/dashboard/types.ts:213`
- `components/dashboard/AddOrderPanel.tsx:1294`
- `components/dashboard/AddOrderPanel.tsx:1505`
- `components/dashboard/AddOrderPanel.tsx:1525`
- `components/dashboard/AddOrderPanel.tsx:1589`
- `components/dashboard/OrderCard.tsx:806`
- `lib/ui-tokens.ts:68`

**`border-orange-100`** — 6 occurrences

- `app/trucks/[slug]/order/page.tsx:1272`
- `app/trucks/[slug]/order/page.tsx:1630`
- `app/trucks/[slug]/order/page.tsx:1961`
- `app/trucks/[slug]/order/page.tsx:2469`
- `app/manage/[token]/page.tsx:3094`
- `components/manage/KitchenCapacityEdit.tsx:101`

**`text-orange-100`** — 1 occurrence

- `app/trucks/[slug]/order/page.tsx:2092`


### orange-200

**`bg-orange-200`** — 2 occurrences

- `app/dashboard/[token]/page.tsx:2093`
- `app/trucks/[slug]/order/page.tsx:1915`

**`border-orange-200`** — 30 occurrences

- `app/venues/[slug]/VenueClient.tsx:176`
- `app/venues/[slug]/VenueClient.tsx:182`
- `app/venues/[slug]/VenueClient.tsx:187`
- `app/dashboard/[token]/page.tsx:2399`
- `app/dashboard/[token]/page.tsx:2428`
- `app/dashboard/[token]/page.tsx:3213`
- `app/dashboard/[token]/page.tsx:3424`
- `app/trucks/[slug]/order/page.tsx:1592`
- `app/trucks/[slug]/order/page.tsx:1836`
- `app/trucks/[slug]/order/page.tsx:1963`
- `app/trucks/[slug]/TruckClient.tsx:177`
- `components/EventListCard.tsx:333`
- `app/login/page.tsx:99`
- `app/login/page.tsx:106`
- `components/OptionStockBadge.tsx:21`
- `app/manage/[token]/page.tsx:526`
- `app/manage/[token]/page.tsx:2960`
- `app/manage/[token]/page.tsx:6371`
- `app/manage/[token]/page.tsx:6409`
- `app/manage/[token]/page.tsx:8644`
- `app/manage/[token]/page.tsx:8711`
- `components/DemoGetStarted.tsx:815`
- `components/TruckListCard.tsx:75`
- `components/dashboard/DealsModal.tsx:295`
- `components/dashboard/DemoWelcome.tsx:145`
- `components/dashboard/DemoWelcome.tsx:149`
- `components/dashboard/AddOrderPanel.tsx:1306`
- `components/dashboard/AddOrderPanel.tsx:1571`
- `components/dashboard/AddOrderPanel.tsx:1893`
- `lib/ui-tokens.ts:68`

**`ring-orange-200`** — 1 occurrence

- `app/manage/[token]/page.tsx:4148`

**`text-orange-200`** — 8 occurrences

- `app/dashboard/[token]/page.tsx:3580`
- `app/dashboard/[token]/page.tsx:3581`
- `app/dashboard/[token]/page.tsx:3790`
- `app/trucks/[slug]/order/page.tsx:2358`
- `app/trucks/[slug]/order/page.tsx:2388`
- `components/dashboard/DealsModal.tsx:416`
- `components/dashboard/AddOrderPanel.tsx:1440`
- `components/dashboard/AddOrderPanel.tsx:1805`


### orange-300

**`border-orange-300`** — 26 occurrences

- `app/dashboard/[token]/page.tsx:2093`
- `app/dashboard/[token]/page.tsx:2759`
- `app/dashboard/[token]/page.tsx:3459`
- `app/dashboard/[token]/page.tsx:3579`
- `app/dashboard/[token]/page.tsx:3788`
- `app/trucks/[slug]/order/page.tsx:2084`
- `app/trucks/[slug]/order/page.tsx:2127`
- `app/trucks/[slug]/order/page.tsx:2355`
- `app/trucks/[slug]/order/page.tsx:2385`
- `app/manage/[token]/page.tsx:786`
- `app/manage/[token]/page.tsx:3569`
- `app/manage/[token]/page.tsx:4532`
- `app/manage/[token]/page.tsx:6516`
- `app/manage/[token]/page.tsx:6678`
- `app/manage/[token]/page.tsx:6800`
- `app/manage/[token]/page.tsx:8663`
- `components/dashboard/DealsModal.tsx:265`
- `components/dashboard/DealsModal.tsx:413`
- `components/manage/primitives.tsx:82`
- `components/manage/primitives.tsx:143`
- `components/dashboard/DemoLoopComplete.tsx:178`
- `components/menu/MenuUploadFields.tsx:30`
- `components/dashboard/AddOrderPanel.tsx:1427`
- `components/dashboard/AddOrderPanel.tsx:1559`
- `components/dashboard/AddOrderPanel.tsx:1589`
- `components/dashboard/AddOrderPanel.tsx:1803`

**`decoration-orange-300`** — 1 occurrence

- `components/Footer.tsx:30`

**`ring-orange-300`** — 3 occurrences

- `app/trucks/[slug]/order/page.tsx:2525`
- `components/manage/primitives.tsx:82`
- `components/manage/primitives.tsx:143`

**`text-orange-300`** — 1 occurrence

- `components/Footer.tsx:30`


### orange-400

**`border-orange-400`** — 15 occurrences

- `app/trucks/[slug]/order/page.tsx:2631`
- `app/manage/[token]/page.tsx:3569`
- `app/manage/[token]/page.tsx:4077`
- `app/manage/[token]/page.tsx:6678`
- `app/manage/[token]/page.tsx:6800`
- `app/manage/[token]/page.tsx:7628`
- `app/manage/[token]/page.tsx:7641`
- `components/dashboard/DealsModal.tsx:439`
- `components/manage/primitives.tsx:85`
- `components/manage/primitives.tsx:93`
- `components/manage/primitives.tsx:143`
- `components/menu/MenuUploadFields.tsx:29`
- `components/manage/ExtrasEditor.tsx:187`
- `components/dashboard/AddOrderPanel.tsx:1893`
- `components/dashboard/OrderCard.tsx:59`

**`decoration-orange-400`** — 1 occurrence

- `components/Footer.tsx:30`

**`ring-orange-400`** — 104 occurrences

- `app/signup/page.tsx:78`
- `app/signup/page.tsx:84`
- `app/setup/page.tsx:118`
- `app/admin/page.tsx:760`
- `app/admin/page.tsx:765`
- `app/admin/page.tsx:1044`
- `app/admin/page.tsx:1057`
- `app/admin/page.tsx:1686`
- `app/admin/page.tsx:1701`
- `app/admin/page.tsx:1766`
- `app/admin/page.tsx:1776`
- `app/admin/page.tsx:1790`
- `app/admin/page.tsx:1798`
- `app/dashboard/[token]/page.tsx:2097`
- `app/dashboard/[token]/page.tsx:3064`
- `app/dashboard/[token]/page.tsx:3070`
- `app/dashboard/[token]/page.tsx:3107`
- `app/dashboard/[token]/page.tsx:3118`
- `app/dashboard/[token]/page.tsx:3213`
- `app/dashboard/[token]/page.tsx:3279`
- `app/dashboard/[token]/page.tsx:3355`
- `app/dashboard/[token]/page.tsx:3676`
- `app/dashboard/[token]/page.tsx:3678`
- `app/dashboard/[token]/page.tsx:3705`
- `app/dashboard/[token]/page.tsx:3707`
- `app/dashboard/[token]/page.tsx:3709`
- `app/dashboard/[token]/page.tsx:3715`
- `app/dashboard/[token]/page.tsx:3801`
- `app/reset-password/page.tsx:134`
- `app/reset-password/page.tsx:151`
- `app/trucks/[slug]/order/page.tsx:2124`
- `app/trucks/[slug]/order/page.tsx:2215`
- `app/trucks/[slug]/order/page.tsx:2216`
- `app/trucks/[slug]/order/page.tsx:2217`
- `app/trucks/[slug]/order/page.tsx:2224`
- `app/trucks/[slug]/order/page.tsx:2539`
- `app/login/page.tsx:128`
- `app/login/page.tsx:146`
- `app/manage/[token]/page.tsx:711`
- `app/manage/[token]/page.tsx:793`
- `app/manage/[token]/page.tsx:3103`
- `app/manage/[token]/page.tsx:3131`
- `app/manage/[token]/page.tsx:3141`
- `app/manage/[token]/page.tsx:3149`
- `app/manage/[token]/page.tsx:3335`
- `app/manage/[token]/page.tsx:3345`
- `app/manage/[token]/page.tsx:3352`
- `app/manage/[token]/page.tsx:3589`
- `app/manage/[token]/page.tsx:3662`
- `app/manage/[token]/page.tsx:3680`
- `app/manage/[token]/page.tsx:3715`
- `app/manage/[token]/page.tsx:3727`
- `app/manage/[token]/page.tsx:3744`
- `app/manage/[token]/page.tsx:3766`
- `app/manage/[token]/page.tsx:4108`
- `app/manage/[token]/page.tsx:4398`
- `app/manage/[token]/page.tsx:4404`
- `app/manage/[token]/page.tsx:4483`
- `app/manage/[token]/page.tsx:4539`
- `app/manage/[token]/page.tsx:4739`
- `app/manage/[token]/page.tsx:4747`
- `app/manage/[token]/page.tsx:5074`
- `app/manage/[token]/page.tsx:6020`
- `app/manage/[token]/page.tsx:6577`
- `app/manage/[token]/page.tsx:6622`
- `app/manage/[token]/page.tsx:6632`
- `app/manage/[token]/page.tsx:6645`
- `app/manage/[token]/page.tsx:6657`
- `app/manage/[token]/page.tsx:6699`
- `app/manage/[token]/page.tsx:6821`
- `app/manage/[token]/page.tsx:7279`
- `app/manage/[token]/page.tsx:7389`
- `app/manage/[token]/page.tsx:7411`
- `app/manage/[token]/page.tsx:7539`
- `app/manage/[token]/page.tsx:7907`
- `app/manage/[token]/page.tsx:7930`
- `app/manage/[token]/page.tsx:7937`
- `app/manage/[token]/page.tsx:7941`
- `app/manage/[token]/page.tsx:8223`
- `app/manage/[token]/page.tsx:8234`
- `app/manage/[token]/page.tsx:8442`
- `components/DemoGetStarted.tsx:763`
- `components/DemoGetStarted.tsx:775`
- `components/DemoGetStarted.tsx:792`
- `components/DemoGetStarted.tsx:799`
- `components/DemoGetStarted.tsx:903`
- `components/DemoGetStarted.tsx:920`
- `components/DemoGetStarted.tsx:953`
- `components/DemoGetStarted.tsx:1022`
- `components/native/OperatorDeviceConfig.tsx:263`
- `components/native/OperatorDeviceConfig.tsx:266`
- `components/native/AppLockGate.tsx:86`
- `components/dashboard/DealsModal.tsx:349`
- `components/dashboard/DealsModal.tsx:439`
- `components/manage/primitives.tsx:42`
- `components/menu/MenuUploadFields.tsx:31`
- `components/manage/KitchenCapacityEdit.tsx:18`
- `components/manage/ExtrasEditor.tsx:187`
- `components/manage/ExtrasEditor.tsx:247`
- `components/manage/ExtrasEditor.tsx:498`
- `components/manage/ExtrasEditor.tsx:526`
- `components/dashboard/AddOrderPanel.tsx:1825`
- `components/manage/VanFilter.tsx:112`
- `components/manage/KitchenCapacityCategoryRow.tsx:20`

**`text-orange-400`** — 15 occurrences

- `app/page.tsx:198`
- `app/venues/[slug]/VenueClient.tsx:102`
- `app/venues/[slug]/VenueClient.tsx:164`
- `app/dashboard/[token]/page.tsx:2407`
- `app/hire/page.tsx:16`
- `app/trucks/[slug]/order/page.tsx:1645`
- `app/trucks/[slug]/order/page.tsx:2092`
- `components/Footer.tsx:30`
- `app/manage/[token]/page.tsx:389`
- `app/manage/[token]/page.tsx:411`
- `app/manage/[token]/page.tsx:415`
- `app/manage/[token]/page.tsx:9535`
- `components/DemoGetStarted.tsx:818`
- `components/dashboard/AddOrderPanel.tsx:1563`
- `components/dashboard/OrderCard.tsx:67`


### orange-500

**`accent-orange-500`** — 6 occurrences

- `app/admin/page.tsx:774`
- `app/admin/page.tsx:861`
- `app/admin/page.tsx:1020`
- `app/admin/page.tsx:1086`
- `components/manage/ExtrasEditor.tsx:222`
- `components/manage/ExtrasEditor.tsx:516`

**`bg-orange-500`** — 17 occurrences

- `app/page.tsx:211`
- `app/dashboard/[token]/page.tsx:2164`
- `app/dashboard/[token]/page.tsx:2246`
- `app/dashboard/[token]/page.tsx:2259`
- `app/dashboard/[token]/page.tsx:3007`
- `app/dashboard/[token]/page.tsx:3788`
- `components/Footer.tsx:16`
- `app/manage/[token]/page.tsx:541`
- `app/manage/[token]/page.tsx:1188`
- `app/manage/[token]/page.tsx:1189`
- `app/manage/[token]/page.tsx:4070`
- `app/manage/[token]/page.tsx:7504`
- `app/manage/[token]/page.tsx:7630`
- `app/manage/[token]/page.tsx:7643`
- `app/manage/[token]/page.tsx:7949`
- `components/dashboard/DealsModal.tsx:411`
- `components/dashboard/KeepAwakePrompt.tsx:43`

**`border-orange-500`** — 16 occurrences

- `app/page.tsx:210`
- `app/page.tsx:250`
- `app/admin/page.tsx:659`
- `app/dashboard/[token]/page.tsx:2233`
- `app/dashboard/[token]/page.tsx:3007`
- `app/dashboard/[token]/page.tsx:3788`
- `app/manage/[token]/page.tsx:407`
- `app/manage/[token]/page.tsx:4070`
- `app/manage/[token]/page.tsx:4148`
- `app/manage/[token]/page.tsx:7500`
- `app/manage/[token]/page.tsx:7503`
- `app/manage/[token]/page.tsx:7630`
- `app/manage/[token]/page.tsx:7643`
- `app/manage/[token]/page.tsx:7949`
- `app/manage/[token]/page.tsx:8504`
- `components/dashboard/DealsModal.tsx:411`

**`ring-orange-500`** — 1 occurrence

- `app/dashboard/[token]/page.tsx:1964`

**`text-orange-500`** — 40 occurrences

- `app/signup/page.tsx:119`
- `app/admin/page.tsx:1004`
- `app/admin/page.tsx:1069`
- `app/forgot-password/page.tsx:78`
- `app/dashboard/[token]/page.tsx:2400`
- `app/dashboard/[token]/page.tsx:2431`
- `app/dashboard/[token]/page.tsx:2751`
- `app/dashboard/[token]/page.tsx:3196`
- `app/dashboard/[token]/page.tsx:3229`
- `app/dashboard/[token]/page.tsx:3327`
- `app/dashboard/[token]/page.tsx:3790`
- `app/trucks/[slug]/order/page.tsx:1743`
- `app/trucks/[slug]/order/page.tsx:2358`
- `app/trucks/[slug]/order/page.tsx:2388`
- `app/login/page.tsx:169`
- `app/manage/[token]/page.tsx:521`
- `app/manage/[token]/page.tsx:535`
- `app/manage/[token]/page.tsx:3174`
- `app/manage/[token]/page.tsx:4775`
- `app/manage/[token]/page.tsx:7292`
- `app/manage/[token]/page.tsx:8507`
- `app/manage/[token]/page.tsx:8573`
- `app/manage/[token]/page.tsx:9460`
- `components/dashboard/DealsModal.tsx:416`
- `components/dashboard/OrderLineItem.tsx:73`
- `components/manage/ExtrasEditor.tsx:269`
- `components/manage/ExtrasEditor.tsx:327`
- `components/manage/ExtrasEditor.tsx:380`
- `components/dashboard/AddOrderPanel.tsx:1212`
- `components/dashboard/AddOrderPanel.tsx:1273`
- `components/dashboard/AddOrderPanel.tsx:1306`
- `components/dashboard/AddOrderPanel.tsx:1442`
- `components/dashboard/AddOrderPanel.tsx:1497`
- `components/dashboard/AddOrderPanel.tsx:1805`
- `components/dashboard/OrderCard.tsx:544`
- `components/dashboard/OrderCard.tsx:587`
- `components/dashboard/OrderCard.tsx:625`
- `components/dashboard/OrderCard.tsx:642`
- `components/dashboard/OrderCard.tsx:647`
- `components/dashboard/OrderCard.tsx:757`


### orange-600

**`accent-orange-600`** — 8 occurrences

- `app/signup/page.tsx:90`
- `app/dashboard/[token]/page.tsx:3080`
- `app/manage/[token]/page.tsx:7311`
- `app/manage/[token]/page.tsx:8021`
- `components/DemoGetStarted.tsx:906`
- `components/DemoGetStarted.tsx:989`
- `components/manage/KitchenCapacityEdit.tsx:128`
- `components/manage/KitchenCapacityCategoryRow.tsx:67`

**`bg-orange-600`** — 101 occurrences

- `app/page.tsx:211`
- `app/page.tsx:253`
- `app/landing/landing.css:83`
- `app/signup/page.tsx:104`
- `app/setup/page.tsx:135`
- `app/venues/[slug]/VenueClient.tsx:125`
- `app/admin/page.tsx:799`
- `app/admin/page.tsx:1844`
- `app/dashboard/[token]/kds/page.tsx:1188`
- `app/forgot-password/page.tsx:71`
- `app/dashboard/[token]/page.tsx:1966`
- `app/dashboard/[token]/page.tsx:2246`
- `app/dashboard/[token]/page.tsx:2259`
- `app/dashboard/[token]/page.tsx:2377`
- `app/dashboard/[token]/page.tsx:3391`
- `app/dashboard/[token]/page.tsx:3489`
- `app/dashboard/[token]/page.tsx:3579`
- `app/dashboard/[token]/page.tsx:3743`
- `app/dashboard/[token]/page.tsx:3805`
- `app/dashboard/[token]/page.tsx:3849`
- `app/reset-password/page.tsx:162`
- `app/trucks/[slug]/order/page.tsx:1390`
- `app/trucks/[slug]/order/page.tsx:1610`
- `app/trucks/[slug]/order/page.tsx:1693`
- `app/trucks/[slug]/order/page.tsx:1916`
- `app/trucks/[slug]/order/page.tsx:1941`
- `app/trucks/[slug]/order/page.tsx:1966`
- `app/trucks/[slug]/order/page.tsx:2082`
- `app/trucks/[slug]/order/page.tsx:2126`
- `app/trucks/[slug]/order/page.tsx:2250`
- `app/trucks/[slug]/order/page.tsx:2303`
- `app/trucks/[slug]/order/page.tsx:2355`
- `app/trucks/[slug]/order/page.tsx:2385`
- `app/trucks/[slug]/order/page.tsx:2405`
- `app/trucks/[slug]/TruckClient.tsx:222`
- `app/trucks/[slug]/TruckClient.tsx:225`
- `app/trucks/[slug]/TruckClient.tsx:260`
- `app/trucks/[slug]/TruckClient.tsx:273`
- `app/trucks/[slug]/TruckClient.tsx:285`
- `components/EventListCard.tsx:137`
- `app/login/page.tsx:157`
- `components/Footer.tsx:16`
- `app/manage/[token]/page.tsx:541`
- `app/manage/[token]/page.tsx:584`
- `app/manage/[token]/page.tsx:770`
- `app/manage/[token]/page.tsx:2984`
- `app/manage/[token]/page.tsx:3545`
- `app/manage/[token]/page.tsx:3599`
- `app/manage/[token]/page.tsx:3683`
- `app/manage/[token]/page.tsx:4628`
- `app/manage/[token]/page.tsx:5990`
- `app/manage/[token]/page.tsx:6384`
- `app/manage/[token]/page.tsx:6539`
- `app/manage/[token]/page.tsx:6545`
- `app/manage/[token]/page.tsx:6706`
- `app/manage/[token]/page.tsx:6828`
- `app/manage/[token]/page.tsx:7689`
- `app/manage/[token]/page.tsx:7708`
- `app/manage/[token]/page.tsx:7962`
- `app/manage/[token]/page.tsx:8056`
- `app/manage/[token]/page.tsx:8265`
- `app/manage/[token]/page.tsx:8293`
- `app/manage/[token]/page.tsx:8376`
- `app/manage/[token]/page.tsx:8402`
- `app/manage/[token]/page.tsx:8657`
- `app/manage/[token]/page.tsx:8717`
- `app/manage/[token]/page.tsx:8782`
- `app/manage/[token]/page.tsx:9129`
- `app/manage/[token]/page.tsx:9241`
- `app/manage/[token]/page.tsx:9815`
- `app/manage/[token]/page.tsx:9975`
- `app/manage/[token]/page.tsx:10118`
- `components/DemoGetStarted.tsx:604`
- `components/DemoGetStarted.tsx:641`
- `components/DemoGetStarted.tsx:1058`
- `components/DemoGetStarted.tsx:1069`
- `components/DemoGetStarted.tsx:1074`
- `components/DemoGetStarted.tsx:1083`
- `components/DemoGetStarted.tsx:1096`
- `components/TruckListCard.tsx:138`
- `components/native/OperatorDeviceConfig.tsx:85`
- `components/native/OperatorDeviceConfig.tsx:97`
- `components/native/OperatorDeviceConfig.tsx:113`
- `components/native/OperatorDeviceConfig.tsx:129`
- `components/native/OperatorDeviceConfig.tsx:276`
- `components/native/AppLockGate.tsx:72`
- `components/native/AppLockGate.tsx:91`
- `components/dashboard/DealsModal.tsx:480`
- `components/dashboard/DemoWelcome.tsx:153`
- `components/printing/PrintingSettings.tsx:81`
- `components/printing/PrintingSettings.tsx:124`
- `components/manage/primitives.tsx:21`
- `components/dashboard/DemoLoopComplete.tsx:223`
- `components/dashboard/AddOrderPanel.tsx:1200`
- `components/dashboard/AddOrderPanel.tsx:1357`
- `components/dashboard/AddOrderPanel.tsx:1426`
- `components/dashboard/AddOrderPanel.tsx:1598`
- `components/dashboard/AddOrderPanel.tsx:1757`
- `components/dashboard/AddOrderPanel.tsx:1803`
- `components/dashboard/AddOrderPanel.tsx:1833`
- `lib/ui-tokens.ts:36`

**`border-orange-600`** — 13 occurrences

- `app/dashboard/[token]/page.tsx:3579`
- `app/trucks/[slug]/order/page.tsx:2082`
- `app/trucks/[slug]/order/page.tsx:2126`
- `app/trucks/[slug]/order/page.tsx:2355`
- `app/trucks/[slug]/order/page.tsx:2385`
- `app/manage/[token]/page.tsx:770`
- `app/manage/[token]/page.tsx:3477`
- `app/manage/[token]/page.tsx:5990`
- `components/native/OperatorDeviceConfig.tsx:113`
- `components/printing/PrintingSettings.tsx:124`
- `components/dashboard/AddOrderPanel.tsx:1426`
- `components/dashboard/AddOrderPanel.tsx:1803`
- `lib/ui-tokens.ts:41`

**`decoration-orange-600`** — 1 occurrence

- `components/EventListCard.tsx:265`

**`text-orange-600`** — 106 occurrences

- `app/page.tsx:261`
- `app/signup/page.tsx:119`
- `app/venues/[slug]/VenueClient.tsx:176`
- `app/venues/[slug]/VenueClient.tsx:182`
- `app/venues/[slug]/VenueClient.tsx:187`
- `app/admin/page.tsx:1105`
- `app/forgot-password/page.tsx:78`
- `app/verify-email/page.tsx:17`
- `app/verify-email/page.tsx:44`
- `app/verify-email/page.tsx:57`
- `app/verify-email/page.tsx:70`
- `app/dashboard/[token]/page.tsx:1957`
- `app/dashboard/[token]/page.tsx:2407`
- `app/dashboard/[token]/page.tsx:2759`
- `app/dashboard/[token]/page.tsx:3196`
- `app/dashboard/[token]/page.tsx:3254`
- `app/dashboard/[token]/page.tsx:3337`
- `app/dashboard/[token]/page.tsx:3571`
- `app/dashboard/[token]/page.tsx:3602`
- `app/dashboard/[token]/page.tsx:3653`
- `app/dashboard/[token]/page.tsx:3912`
- `app/trucks/page.tsx:70`
- `app/trucks/page.tsx:128`
- `app/reset-password/page.tsx:32`
- `app/trucks/[slug]/order/page.tsx:1204`
- `app/trucks/[slug]/order/page.tsx:1219`
- `app/trucks/[slug]/order/page.tsx:1277`
- `app/trucks/[slug]/order/page.tsx:1279`
- `app/trucks/[slug]/order/page.tsx:1509`
- `app/trucks/[slug]/order/page.tsx:1542`
- `app/trucks/[slug]/order/page.tsx:1552`
- `app/trucks/[slug]/order/page.tsx:1583`
- `app/trucks/[slug]/order/page.tsx:1607`
- `app/trucks/[slug]/order/page.tsx:1645`
- `app/trucks/[slug]/order/page.tsx:1836`
- `app/trucks/[slug]/order/page.tsx:1963`
- `app/trucks/[slug]/order/page.tsx:1983`
- `app/trucks/[slug]/order/page.tsx:2578`
- `app/trucks/[slug]/order/page.tsx:2631`
- `app/trucks/[slug]/TruckClient.tsx:143`
- `app/trucks/[slug]/TruckClient.tsx:177`
- `app/trucks/[slug]/TruckClient.tsx:188`
- `app/trucks/[slug]/TruckClient.tsx:202`
- `app/trucks/[slug]/TruckClient.tsx:311`
- `components/EventListCard.tsx:33`
- `components/EventListCard.tsx:138`
- `components/EventListCard.tsx:221`
- `components/EventListCard.tsx:248`
- `components/EventListCard.tsx:264`
- `components/EventListCard.tsx:294`
- `components/EventListCard.tsx:371`
- `app/login/page.tsx:169`
- `components/DemoModeBanner.tsx:44`
- `components/OptionStockBadge.tsx:21`
- `app/manage/[token]/page.tsx:2960`
- `app/manage/[token]/page.tsx:3197`
- `app/manage/[token]/page.tsx:3259`
- `app/manage/[token]/page.tsx:3304`
- `app/manage/[token]/page.tsx:3312`
- `app/manage/[token]/page.tsx:3665`
- `app/manage/[token]/page.tsx:4092`
- `app/manage/[token]/page.tsx:4125`
- `app/manage/[token]/page.tsx:5030`
- `app/manage/[token]/page.tsx:5652`
- `app/manage/[token]/page.tsx:6371`
- `app/manage/[token]/page.tsx:6409`
- `app/manage/[token]/page.tsx:6431`
- `app/manage/[token]/page.tsx:6522`
- `app/manage/[token]/page.tsx:7292`
- `app/manage/[token]/page.tsx:7612`
- `app/manage/[token]/page.tsx:7975`
- `app/manage/[token]/page.tsx:8000`
- `app/manage/[token]/page.tsx:8002`
- `app/manage/[token]/page.tsx:8013`
- `app/manage/[token]/page.tsx:8510`
- `app/manage/[token]/page.tsx:8540`
- `app/manage/[token]/page.tsx:8663`
- `app/manage/[token]/page.tsx:8711`
- `components/DemoGetStarted.tsx:806`
- `components/DemoGetStarted.tsx:928`
- `components/TruckListCard.tsx:38`
- `components/TruckListCard.tsx:83`
- `components/TruckListCard.tsx:114`
- `components/native/VanMenuChooser.tsx:44`
- `components/dashboard/DealsModal.tsx:245`
- `components/dashboard/DealsModal.tsx:272`
- `components/dashboard/DealsModal.tsx:298`
- `components/printing/PrintingSettings.tsx:95`
- `components/dashboard/DemoLoopComplete.tsx:188`
- `components/manage/KitchenCapacityEdit.tsx:101`
- `components/manage/ExtrasEditor.tsx:198`
- `components/manage/ExtrasEditor.tsx:268`
- `components/manage/ExtrasEditor.tsx:276`
- `components/manage/ExtrasEditor.tsx:319`
- `components/dashboard/AddOrderPanel.tsx:1294`
- `components/dashboard/AddOrderPanel.tsx:1505`
- `components/dashboard/AddOrderPanel.tsx:1525`
- `components/dashboard/AddOrderPanel.tsx:1559`
- `components/dashboard/AddOrderPanel.tsx:1579`
- `components/dashboard/AddOrderPanel.tsx:1589`
- `components/dashboard/AddOrderPanel.tsx:1902`
- `components/dashboard/OrderCard.tsx:642`
- `components/dashboard/OrderCard.tsx:647`
- `components/legal/LegalPage.tsx:38`
- `components/legal/LegalPage.tsx:44`
- `lib/ui-tokens.ts:40`


### orange-700

**`bg-orange-700`** — 63 occurrences

- `app/page.tsx:253`
- `app/signup/page.tsx:104`
- `app/setup/page.tsx:135`
- `app/venues/[slug]/VenueClient.tsx:125`
- `app/admin/page.tsx:799`
- `app/dashboard/[token]/kds/page.tsx:1188`
- `app/forgot-password/page.tsx:71`
- `app/dashboard/[token]/page.tsx:1966`
- `app/dashboard/[token]/page.tsx:2377`
- `app/dashboard/[token]/page.tsx:3391`
- `app/dashboard/[token]/page.tsx:3743`
- `app/dashboard/[token]/page.tsx:3805`
- `app/dashboard/[token]/page.tsx:3849`
- `app/reset-password/page.tsx:162`
- `app/trucks/[slug]/order/page.tsx:1390`
- `app/trucks/[slug]/order/page.tsx:1610`
- `app/trucks/[slug]/order/page.tsx:1916`
- `app/trucks/[slug]/order/page.tsx:1941`
- `app/trucks/[slug]/order/page.tsx:1966`
- `app/trucks/[slug]/order/page.tsx:2250`
- `app/trucks/[slug]/order/page.tsx:2303`
- `app/trucks/[slug]/order/page.tsx:2405`
- `app/trucks/[slug]/TruckClient.tsx:222`
- `app/trucks/[slug]/TruckClient.tsx:225`
- `app/trucks/[slug]/TruckClient.tsx:260`
- `app/trucks/[slug]/TruckClient.tsx:273`
- `app/trucks/[slug]/TruckClient.tsx:285`
- `components/EventListCard.tsx:137`
- `app/login/page.tsx:157`
- `app/manage/[token]/page.tsx:584`
- `app/manage/[token]/page.tsx:2984`
- `app/manage/[token]/page.tsx:3545`
- `app/manage/[token]/page.tsx:3599`
- `app/manage/[token]/page.tsx:4628`
- `app/manage/[token]/page.tsx:7962`
- `app/manage/[token]/page.tsx:8056`
- `app/manage/[token]/page.tsx:8376`
- `app/manage/[token]/page.tsx:8402`
- `app/manage/[token]/page.tsx:8657`
- `app/manage/[token]/page.tsx:8717`
- `app/manage/[token]/page.tsx:8782`
- `app/manage/[token]/page.tsx:9129`
- `app/manage/[token]/page.tsx:9241`
- `app/manage/[token]/page.tsx:9815`
- `app/manage/[token]/page.tsx:10118`
- `components/DemoGetStarted.tsx:604`
- `components/DemoGetStarted.tsx:641`
- `components/DemoGetStarted.tsx:1058`
- `components/DemoGetStarted.tsx:1069`
- `components/DemoGetStarted.tsx:1074`
- `components/DemoGetStarted.tsx:1083`
- `components/DemoGetStarted.tsx:1096`
- `components/TruckListCard.tsx:138`
- `components/dashboard/DealsModal.tsx:480`
- `components/dashboard/DemoWelcome.tsx:153`
- `components/printing/PrintingSettings.tsx:81`
- `components/manage/primitives.tsx:21`
- `components/dashboard/DemoLoopComplete.tsx:223`
- `components/dashboard/AddOrderPanel.tsx:1200`
- `components/dashboard/AddOrderPanel.tsx:1598`
- `components/dashboard/AddOrderPanel.tsx:1757`
- `components/dashboard/AddOrderPanel.tsx:1833`
- `lib/ui-tokens.ts:36`

**`text-orange-700`** — 29 occurrences

- `app/admin/page.tsx:175`
- `app/dashboard/[token]/page.tsx:2093`
- `app/dashboard/[token]/page.tsx:2403`
- `app/dashboard/[token]/page.tsx:2406`
- `app/dashboard/[token]/page.tsx:2428`
- `app/dashboard/[token]/page.tsx:3424`
- `app/trucks/[slug]/order/page.tsx:1634`
- `app/trucks/[slug]/order/page.tsx:1915`
- `app/trucks/[slug]/order/page.tsx:2470`
- `app/trucks/[slug]/TruckClient.tsx:202`
- `app/login/page.tsx:100`
- `app/login/page.tsx:107`
- `app/manage/[token]/page.tsx:530`
- `app/manage/[token]/page.tsx:4125`
- `app/manage/[token]/page.tsx:6371`
- `app/manage/[token]/page.tsx:7612`
- `app/manage/[token]/page.tsx:9564`
- `components/DemoGetStarted.tsx:806`
- `components/DemoGetStarted.tsx:815`
- `components/DemoGetStarted.tsx:818`
- `components/DemoGetStarted.tsx:928`
- `components/dashboard/UserMenu.tsx:93`
- `components/manage/primitives.tsx:15`
- `components/dashboard/types.ts:213`
- `components/manage/ExtrasEditor.tsx:276`
- `components/manage/ExtrasEditor.tsx:319`
- `components/dashboard/OrderCard.tsx:806`
- `lib/ui-tokens.ts:41`
- `lib/ui-tokens.ts:68`


### orange-800

**`text-orange-800`** — 4 occurrences

- `app/dashboard/[token]/page.tsx:2402`
- `app/trucks/[slug]/order/page.tsx:1275`
- `app/manage/[token]/page.tsx:527`
- `components/dashboard/DemoLoopComplete.tsx:194`


### orange-900

**`text-orange-900`** — 4 occurrences

- `components/EventListCard.tsx:333`
- `components/dashboard/DemoWelcome.tsx:146`
- `components/dashboard/DemoWelcome.tsx:158`
- `components/dashboard/AddOrderPanel.tsx:1575`

---

## A2 — BY SURFACE, WITH DIVERGENCE FROM EACH SURFACE'S DOMINANT SHADE

### `app/landing/` — DOMINANT: **`#EF8B2C` via `var(--orange)` (NOT a Tailwind shade)**

Only **one** Tailwind orange class exists in the whole directory, and it is inside a CSS **comment**:

| file:line | Class | Divergence |
|---|---|---|
| [landing.css:83](app/landing/landing.css#L83) | `bg-orange-600` | 🔴 in a comment claiming `var(--orange)` *is* `bg-orange-600` — **it is not** |

Plus **two hardcoded hex divergences** in the truck SVG: [page.tsx:389](app/landing/page.tsx#L389) and [:393](app/landing/page.tsx#L393), both `fill="#EA580C"`.

### `app/signup/` — DOMINANT: **orange-600** (Tailwind)

**Every** occurrence, and 5 of 7 diverge from orange-600:

| file:line | Class | Divergence from orange-600 |
|---|---|---|
| [page.tsx:78](app/signup/page.tsx#L78) | `ring-orange-400` | ⚠️ 400 (focus ring — matches app-wide convention) |
| [page.tsx:84](app/signup/page.tsx#L84) | `ring-orange-400` | ⚠️ 400 (same) |
| [page.tsx:90](app/signup/page.tsx#L90) | `accent-orange-600` | ✅ |
| [page.tsx:104](app/signup/page.tsx#L104) | `bg-orange-600` | ✅ |
| [page.tsx:104](app/signup/page.tsx#L104) | `bg-orange-700` | ⚠️ 700 (hover) |
| [page.tsx:119](app/signup/page.tsx#L119) | `text-orange-500` | 🔴 **500 — the known drift shade** |
| [page.tsx:119](app/signup/page.tsx#L119) | `text-orange-600` | ✅ (hover of the 500) |

### `app/dashboard/[token]/page.tsx` — DOMINANT: **orange-600**

| Shade | Count | Note |
|---|---|---|
| ring-400 | 15 | focus rings |
| **text-600 / bg-600** | 10 / 10 | ✅ dominant |
| **text-500** | **7** | 🔴 diverges |
| bg-700 | 6 | hover |
| bg-50 | 6 · bg-100 5 · border-300 5 · border-200 4 | tints |
| **bg-500** | **5** | 🔴 **the known `bg-orange-500` drift class** |
| text-700 | 5 · text-200 3 | |

### `app/manage/[token]/page.tsx` — DOMINANT: **orange-600**

| Shade | Count | Note |
|---|---|---|
| ring-400 | 43 | focus rings |
| **bg-600 / text-600** | 30 / 24 | ✅ dominant |
| bg-50 | 26 · bg-700 16 | tints / hover |
| **border-500** | **9** | 🔴 diverges |
| **text-500** | **8** | 🔴 diverges |
| **bg-500** | **8** | 🔴 **known drift class — 8 live instances** |
| border-300 7 · border-400 6 · border-200 6 · text-700 5 | | |

### The KDS (`app/dashboard/[token]/kds/`) — DOMINANT: **orange-600**

**Only 2 orange occurrences in the entire surface.** `bg-orange-600` ×1, `bg-orange-700` ×1. **No divergence.** The KDS is the cleanest surface in the codebase.

### The customer order page (`app/trucks/[slug]/order/`) — DOMINANT: **orange-600**

| Shade | Count | Note |
|---|---|---|
| **text-600 / bg-600** | 15 / 13 | ✅ dominant |
| bg-700 | 8 | hover |
| bg-50 7 · ring-400 6 · bg-100 5 · border-600 4 · border-300 4 · border-100 4 · border-200 3 | | |
| **text-500** | **3** | 🔴 diverges |

### `components/` — DOMINANT: **orange-600**

| Shade | Count | Note |
|---|---|---|
| **text-600 / bg-600** | 36 / 30 | ✅ dominant |
| ring-400 23 · bg-50 20 · bg-700 18 | | rings / tints / hover |
| **text-500** | **17** | 🔴 **largest single divergence cluster** |
| text-700 10 · border-300 10 · border-200 10 · bg-100 9 · border-400 8 · text-900 4 | | |

### 🔴 THE `orange-500` CLASS — FULL MEMBERSHIP OF THE KNOWN DRIFT

You asked for the full membership, not another example. **`orange-500` has 80 live occurrences:**

| Utility | Count |
|---|---|
| `text-orange-500` | **40** |
| `bg-orange-500` | **17** |
| `border-orange-500` | **16** |
| `accent-orange-500` | 6 |
| `ring-orange-500` | 1 |

**The manual's "Configure items" fix was one instance of 17 `bg-orange-500` uses.** Sixteen remain, plus 40 `text-` and 16 `border-`. **Every file:line is in the A1 listing above.**

---

## A3 — NON-TAILWIND ORANGES (where class-name greps miss)

| # | Value | file:line | What it is |
|---|---|---|---|
| 1 | **`#EF8B2C`** | [app/landing/landing.css:34](app/landing/landing.css#L34) | `--orange` — the landing primary. Comment: *"THE one orange — warm amber-gold (landing-local…)"*. **Only occurrence in the repo** |
| 2 | **`#D9741A`** | [landing.css:37](app/landing/landing.css#L37) | `--orange-deep` — *"button HOVER only. Not an accent."* |
| 3 | **`#FEF1E7`** | [landing.css:38](app/landing/landing.css#L38) | `--orange-wash` — tint |
| 4 | **`#F6D2B4`** | [landing.css:39](app/landing/landing.css#L39) | `--orange-line` — border tint |
| 5 | **`#EA580C`** | [app/landing/page.tsx:389](app/landing/page.tsx#L389) | SVG `fill=` — truck roof stripe. **Tailwind orange-600 as raw hex** |
| 6 | **`#EA580C`** | [app/landing/page.tsx:393](app/landing/page.tsx#L393) | SVG `fill=` — truck side stripe. Same |
| 7 | **`rgba(234,88,12,0.9)`** | [components/MapView.tsx:22](components/MapView.tsx#L22) | inline `drop-shadow` in a template-literal `style=` on a Leaflet `divIcon`. **= `#ea580c` at 90% — orange-600 in `rgb()` form** |
| 8 | **`#E76F51`** | [app/globals.css:9](app/globals.css#L9) | `--accent` — ⚰️ **DEAD.** Grep for `#E76F51` returns `app/globals.css` **only**; no consumer anywhere |

**Checked and clean:** no Tailwind arbitrary orange values exist — the only `[#…]` arbitrary colours in the repo are `[#111827]` (slate-900-ish) at `forgot-password:28,45`, `login:77`, `reset-password:20,99`, `signup:63`, `trucks/page:34`. **No `hsl()` oranges.** No orange in `app/globals.css` beyond the dead `--accent`.

⚠️ **#7 is the one a class-name grep would never find** and it is *value-consistent* with orange-600 — expressed differently, not a different colour.

---

# PART B — BRAND VALUES

## B1 — `components/brand/HatchGrabWordmark.tsx`

**⚠️ IDENTICAL on `main` and `landing-v32`** — verified by `git diff --quiet`.

```tsx
// ⚠️ APPROXIMATION — a TYPE + SVG stand-in for the HatchGrab wordmark (Archivo italic "HATCH" + a
// lightning bolt, then "Grab" under a sweeping arrow). SWAP FOR THE REAL VECTOR ASSET when it's produced.
//
// This component emits only the markup + class hooks; the visual styling lives in the SCOPED landing
// stylesheet (`app/landing/landing.css`, under `.hg-landing .logo …`). `variant="dark"` renders "HATCH"
// in white for dark backgrounds (the nav + footer bars).
import React from 'react'

export function HatchGrabWordmark({
  variant = 'light',
  className = '',
}: {
  variant?: 'light' | 'dark'
  className?: string
}) {
  return (
    <span
      className={`logo${variant === 'dark' ? ' logo-dark' : ''}${className ? ` ${className}` : ''}`}
      aria-label="HatchGrab"
    >
      <span className="a">HATCH</span>
      <svg className="bolt" viewBox="0 0 14 32" aria-hidden="true">
        <path d="M11 0 L2 18 H6.5 L4 32 L13 13 H8.5 Z" />
      </svg>
      <span className="gwrap">
        <svg className="swoosh" viewBox="0 0 104 32" aria-hidden="true">
          <path d="M1 26 C24 24, 54 18, 76 8 L76 2 L101 13 L76 24 L76 18 C54 24, 24 29, 1 30 Z" />
        </svg>
        <span className="b">Grab</span>
      </span>
    </span>
  )
}
```

🔴 **The file's own first line calls itself an APPROXIMATION and a stand-in, to be swapped for the real vector asset.**

### `variant` — accepts exactly two values

| Value | Effect | Mechanism |
|---|---|---|
| `'light'` (**default**) | "HATCH" renders in `var(--head)` = **`#16314F`** navy | no extra class |
| `'dark'` | "HATCH" renders **`#fff`** | adds `logo-dark` → `.hg-landing .logo.logo-dark .a { color: #fff; }` ([landing.css:76](app/landing/landing.css#L76)) |

⚠️ **`variant` changes ONE property: the colour of "HATCH".** It does **not** touch "Grab", the bolt, or the swoosh — all three stay `var(--orange)` on both variants. Used as `dark` at [landing/page.tsx:106](app/landing/page.tsx#L106) (nav) and [:418](app/landing/page.tsx#L418) (footer); as default `light` at [signup/page.tsx:66](app/signup/page.tsx#L66).

### The two inline SVG paths

| | Shape | viewBox | `d` | Fill source |
|---|---|---|---|---|
| **1** | **Lightning bolt** | `0 0 14 32` | `M11 0 L2 18 H6.5 L4 32 L13 13 H8.5 Z` | CSS `.hg-landing .logo .bolt { fill: var(--orange); }` — [landing.css:77](app/landing/landing.css#L77) |
| **2** | **Swoosh** (a sweeping arrow, tapering left-to-right into an arrowhead) | `0 0 104 32` | `M1 26 C24 24, 54 18, 76 8 L76 2 L101 13 L76 24 L76 18 C54 24, 24 29, 1 30 Z` | CSS `.hg-landing .logo .swoosh { fill: var(--orange); }` — [landing.css:79](app/landing/landing.css#L79) |

**Neither `<path>` carries a `fill` attribute.** Both inherit entirely from the scoped stylesheet, which is why they are unstyled outside `.hg-landing`. The swoosh is positioned `absolute; left:-8%; top:-58%; width:126%` inside `.gwrap`, so it **overlays** "Grab" rather than sitting beside it.

### 🔴 IS THE BOLT A FILLED POSITIVE SHAPE, OR NEGATIVE SPACE? — **A FILLED POSITIVE SHAPE.**

**Unambiguously positive.** The evidence:

1. It is **its own `<svg>` element with its own `<path>`** and its own `viewBox` — a self-contained drawing, not a gap.
2. Its `d` is a **single closed subpath** (one `M`, five line commands, terminal `Z`) tracing a classic bolt outline: down-left to the notch, out, down to the tail, back up-right, close. **One subpath cannot express a hole** — a negative-space cut needs two subpaths and a fill rule.
3. It has **`fill: var(--orange)`** applied to it directly. Negative space is not filled; it is the absence of fill.
4. There is **no `fill-rule`, no `clip-path`, no `mask`** anywhere in the component or its CSS.

✅ **It is a standalone positive shape and can be cut out for an icon.** It is also already isolated in its own `<svg>` with its own coordinate system — the easiest possible starting point. ⚠️ At **14 × 32** its aspect is ~1:2.3; a square icon would need re-framing, not just extraction.

### HATCH and Grab — **LIVE TEXT, not outlined paths**

`<span className="a">HATCH</span>` and `<span className="b">Grab</span>` — real text nodes, selectable, in the DOM, styled by CSS (`font-family: var(--display)`, `font-weight: 800`, `font-style: italic`, `letter-spacing: -.02em`). **No `<text>` element, no converted outlines.** The whole `<span className="logo">` carries `aria-label="HatchGrab"`, and both SVGs are `aria-hidden="true"`.

## B2 — `app/landing/landing.css` — EVERY COLOUR VALUE

⚠️ **This file DIFFERS between branches.** `main` is newer (+17 lines). **The token block below is identical on both**; the difference is structural — `main` splits the selector so the demo modal can borrow the tokens:

| Branch | Selector opening the token block |
|---|---|
| `landing-v32` | `.hg-landing {` |
| **`main` (current)** | `.hg-landing, .hg-demo-modal {` |

Main's added comment explains why: *"the demo upload modal PORTALS to `<body>`, so it sits outside `.hg-landing` and could not otherwise see `--orange`."* Presentation properties were split into a `.hg-landing`-only block because keeping them shared set `background: var(--paper)` on the modal overlay and *"turned the whole screen WHITE behind the popup."*

### Custom properties — `:root`-equivalent token block, lines 28-48

| Line | Property | Value | Styles |
|---|---|---|---|
| 28 | `--paper` | `#FFFFFF` | page background, cards, ticket |
| 29 | `--wash` | `#F5F8FB` | `.band` section background |
| 30 | `--head` | `#16314F` | headings, "HATCH", `.plan-tag` bg — *"lifted navy, landing-local, provisional"* |
| 31 | `--ink` | `#2C4766` | body copy — *"landing-local, provisional"* |
| 32 | `--ink-soft` | `#5F7A99` | muted copy, `.btn-quiet`, hero tagline |
| 33 | `--ink-faint` | `#9AAFC4` | faintest text, `.btn-ghost:hover` border |
| **34** | **`--orange`** | **`#EF8B2C`** | 🔴 **THE PRIMARY ORANGE** — `.btn-primary` bg, "Grab", bolt fill, swoosh fill, `h1 .lean`. Comment: *"THE one orange — warm amber-gold (landing-local; friendlier/appetite-forward than…)"* |
| 37 | `--orange-deep` | `#D9741A` | `.btn-primary:hover` **only** — *"Not an accent."* |
| 38 | `--orange-wash` | `#FEF1E7` | orange tint fill |
| 39 | `--orange-line` | `#F6D2B4` | orange tint border |
| 40 | `--line` | `#DDE5EE` | borders, `.shot` dashed border, rule strokes |

### Literal colours outside the token block

| Line | Value | Selector / use |
|---|---|---|
| 7 | `#0f172a` | comment only — notes `HEADER_BG` = Tailwind `bg-slate-900` |
| 52 | `#FFF` | comment only (the modal-overlay explanation) |
| 76 | `#fff` | `.hg-landing .logo.logo-dark .a` — "HATCH" on dark |
| 86 | `#fff` | `.btn-primary` text |
| 101 | `#C3CAD8` / `#fff` | `nav .btn-quiet` and its `:hover` |
| 102 | `rgba(255,255,255,.24)` / `.55` | `nav .btn-ghost` border, hover |
| 97 | `rgba(255,255,255,.1)` | `nav` bottom border |
| 146 | `#fff` | `.tick svg` stroke |
| 151 | `rgba(15,23,42,.32)` | `.shot` box-shadow |
| 216 | `#fff` | `.ticket` background |
| 238 | `#fff` | `.plan-tag` text |
| 312 | `#fff` | `footer` text |
| 314 | `#8A93A6` | `.foot-tag` |
| 316-317 | `#C3CAD8` / `#fff` | `.foot-links a`, hover |
| 318 | `#7C8698`, `rgba(255,255,255,.12)` | `.foot-base` + its top border |
| 319 | `#C3CAD8` / `#fff` | `.vf`, `.vf b` |

### ✅ ANSWER: primary orange and blue, as values

- **PRIMARY ORANGE: `#EF8B2C`** (hover `#D9741A`).
- **BLUE: there is no blue.** The dark colour is a **navy** — **`#16314F`** (`--head`) — with `#2C4766` / `#5F7A99` / `#9AAFC4` as a desaturated navy-grey ramp for text. The nav/footer bars use Tailwind `bg-slate-900` = **`#0f172a`** via `HEADER_BG` from `lib/brand.ts`, **not** a landing token.

⚠️ **So the landing page's dark surfaces are `#0f172a` (Tailwind slate-900) while its headings are `#16314F` (landing-local navy). Two different darks**, by design — one comes from `lib/brand.ts`, one from the stylesheet.

## B3 — Tailwind config

# 🔴 THERE IS NO `tailwind.config.*` FILE. AT ALL.

`ls tailwind.config.*` → **no matches**. This is **Tailwind v4**, configured in CSS:

- [app/globals.css:1](app/globals.css#L1) — `@import "tailwindcss";`
- `postcss.config.mjs` is the only build config present.

**There is no `theme.extend.colors` to paste — no custom colours, no palette extension.** Every `orange-*` class in the 718 occurrences is **stock Tailwind**. The only theme customisation is [globals.css:12-17](app/globals.css#L12):

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}
```

🔴 **`--primary: #84A98C`, `--secondary: #354F52` and `--accent: #E76F51` are declared at [globals.css:5-9](app/globals.css#L5) but NOT mapped into `@theme`, so no Tailwind class generates from them.** `--accent` (`#E76F51`, a coral-orange) has **zero references** outside its own declaration.

## B4 — `lib/brand.ts`

**⚠️ IDENTICAL on `main` and `landing-v32`** — verified by `git diff --quiet`.

```ts
export const BRANDS = {
  VILLAGE_FOODIE: {
    name: 'Village Foodie',
    domain: 'www.villagefoodie.co.uk',
    logo: '/logos/village-foodie-logo-v2.png',
    focus: 'consumer' as const,
  },
  HATCHGRAB: {
    name: 'HatchGrab',
    domain: 'www.hatchgrab.com',
    logo: '/logos/village-foodie-logo-v2.png', // temporary — replace when HatchGrab logo exists
    focus: 'operator' as const,
  },
} as const

export function getBrandFromHost(host: string) {
  if (host.includes('hatchgrab')) return BRANDS.HATCHGRAB
  return BRANDS.VILLAGE_FOODIE // default
}

export function isHatchGrabHost(host: string): boolean {
  return host.includes('hatchgrab')
}

// ── Operator surface colour tokens ────────────────────────────────
// NOT imported into components directly (Tailwind purges dynamic class strings).
// Use as documentation: when changing operator header colour, update here AND
// every bg-slate-900 in AppHeader.tsx, tabs bars, and any future operator pages.
export const HEADER_BG = 'bg-slate-900'   // AppHeader — all operator headers
export const TABS_BG   = 'bg-slate-900'   // tabs bar below header (must match HEADER_BG)
export const PAGE_BG   = 'bg-slate-50'    // operator page content area
```

🔴 **`BRANDS.HATCHGRAB.logo` points at the Village Foodie logo**, flagged in-file as *"temporary — replace when HatchGrab logo exists"*. **The file defines no orange and no brand colour** — only three Tailwind class-name strings, and its own comment says they are documentation, not imports.

## B5 — TYPEFACE

**"HATCH" and "Grab" render in Archivo, loaded via `next/font/google`.**

| Layer | Value |
|---|---|
| CSS | [landing.css:42](app/landing/landing.css#L42) — `--display: var(--font-archivo), system-ui, sans-serif;` |
| Applied | [landing.css:73](app/landing/landing.css#L73) — `.hg-landing .logo { font-family: var(--display); font-weight: 800; font-style: italic; … }` |
| Loader | [landing/page.tsx:13](app/landing/page.tsx#L13) — `import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'` |
| Config | [landing/page.tsx:26](app/landing/page.tsx#L26) — `Archivo({ subsets: ['latin'], style: ['normal','italic'], variable: '--font-archivo', display: 'swap' })` |

✅ **`next/font/google` — NOT a local font file and NOT a bare system stack** (though `system-ui, sans-serif` is the fallback). **Italic is explicitly loaded**, which the wordmark requires (`font-style: italic`).

The other two landing faces: **Public Sans** (`--body`, [:27](app/landing/page.tsx#L27)) and **Courier Prime** (`--ticket`, weights 400/700, [:28](app/landing/page.tsx#L28)). The rest of the app uses **Geist / Geist Mono** ([app/layout.tsx:8-14](app/layout.tsx#L8)) — **a different family entirely from the landing page.**

⚠️ **All three landing fonts are declared in `app/landing/page.tsx`, so their `--font-*` variables exist only on that route.** On `/signup` the wordmark's `--display` is undefined — consistent with the unstyled-wordmark finding in A4.

---

## What I could NOT verify

- **Nothing was rendered.** No `next dev`/`next build`, so **no colour was observed on screen.** Every value is read from source. In particular the "wordmark is unstyled on `/signup`" finding is derived from selector scope and import graph — **I did not load the page.**
- **Tailwind shade hexes** (`orange-600` = `#ea580c` etc.) are the **published Tailwind v4 defaults**, asserted from knowledge, not read from a generated stylesheet — there is no config file to read them from and I did not build CSS.
- **The 718 count covers `app/`, `components/` and `lib/` only**, matching your scope. It excludes `docs/`, `scripts/`, `supabase/`, `ios/`, `android/` and `public/`. A class built by string concatenation (`` `bg-orange-${n}` ``) would not have matched — though Tailwind would not generate it either.
- **A2's "dominant shade" is by raw occurrence count**, not by visual prominence. A single `bg-orange-600` on a hero CTA outweighs forty `ring-orange-400`s in the eye but not in this table.
- **I did not verify that `--accent: #E76F51` is truly dead beyond a repo-wide grep for the literal** — a consumer reading `var(--accent)` would still resolve it. I checked: `var(--accent)` appears nowhere in `app/`, `components/` or `lib/`.
- **I did not open `landing-v32` in full** — only diffed the five named files and confirmed the branch is an ancestor of `main`.
- **The bolt-is-positive conclusion is from path geometry and CSS**, not from rendering the SVG. It is a single closed subpath with a direct `fill` and no mask/clip anywhere, which I consider conclusive — but it is analysis, not observation.
