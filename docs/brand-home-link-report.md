# `BrandHomeLink` — one component for the native-inert brand link

Date: 14 August 2026
**Created:** `components/shared/BrandHomeLink.tsx`
**Adopted at 3 of 5 sites.** 🔴 **STOPPED at the other 2 — B2's own guard fires there, and it
contradicts C2.**

`tsc --noEmit`: **exit 0, zero output** · **0 NUL, 0 control bytes < 0x09** in every file.
No `next dev`, no `next build`, no `cap sync`, no deploy, no commit.

**No span of the prompt arrived garbled.** One contradiction between instructions is set out in full
before anything else, and I stopped rather than resolving it.

---

# 🔴 READ FIRST — B2 CONTRADICTS C2, AND I DID NOT CHOOSE

**B2 says**, of the `mounted` two-pass it instructs me to use:

> *"That pattern is acceptable ONLY because both branches are visually identical — **if any call site
> would flash a visible difference, STOP and report it**."*

**B3 says** the `control` kind must **render NOTHING** in the app. **C2 says** the dashboard's
access-denied view is a control and *"must not survive this task"*.

🔴 **THOSE CANNOT BOTH HOLD.** A `mounted` two-pass renders the pre-mount branch first, by
construction: `mounted` starts `false`, the effect runs **after** paint, so in the app a `control`
**paints and is then removed**. Its two branches are *not* visually identical — one is the control and
the other is nothing. **B2's stop condition is met at every `control` site.**

**There is no third option that satisfies both.** All three were checked:

| Approach | Native | Web | Verdict |
|---|---|---|---|
| `mounted` two-pass (B2's instruction) | 🔴 control **flashes**, then vanishes | ✅ unchanged | **B2 says STOP** |
| Evaluate `isNativeApp()` inline, no `mounted` | ✅ no flash | ✅ unchanged | 🔴 **hydration mismatch** on any site that is a first paint — `app/contact/page.tsx` is one |
| Render nothing until mounted, then branch | ✅ no flash | 🔴 **control absent for a frame ON THE WEB** | 🔴 breaks *"WEB BEHAVIOUR MUST BE BYTE-IDENTICAL"* |

**So: I built the component with both kinds exactly as B3 specifies, adopted it at all three
`branding` sites — where the two branches genuinely are visually identical and the two-pass is free —
and STOPPED at the two `control` sites.**

⚠️ **CONSEQUENCE, STATED PLAINLY: the residual flagged in the last report SURVIVES.** The dashboard's
access-denied view still renders an inert `← HatchGrab` in the app. **C2 required that to end today and
it has not.** That is the cost of the stop, and it is yours to weigh, not mine.

**What I need from you is one line:** either *"accept the one-frame flash for controls"* (then both
sites adopt `kind="control"` immediately), or *"the dashboard site keeps direct evaluation because it
sits behind a loading early-return"* (which fixes the dashboard flash-free but leaves `/contact`
without an answer, and re-introduces a second mechanism — the thing this task exists to remove).

---

# PART A — SURVEY (READ-ONLY)

## A1. The native branch at each site, before any change

### 1. `components/shared/AppHeader.tsx:86-115` — direct `isNativeApp()`, no `mounted`

```tsx
          {isNativeApp() ? (
            <span className="shrink-0 z-10">
              <img
                src={HATCHGRAB_WORDMARK_WHITE_SVG}
                alt="HatchGrab"
                width={140}
                height={31}
                className="object-contain w-[112px] md:w-[140px] h-auto"
              />
            </span>
          ) : (
          <Link href="/" className="shrink-0 z-10">
            …identical <img>…
          </Link>
          )}
```
**Safe without `mounted`** because all three renderers gate AppHeader behind a `loading` early-return
starting `true` — dashboard `:265`, manage `:200`, admin `:203`. **READ.**

### 2. `app/(legal)/layout.tsx:52-84` — `'use client'` + `mounted` two-pass

```tsx
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const inApp = mounted && isNativeApp()
```
```tsx
          {inApp ? (
            <span className="inline-flex" aria-label="HatchGrab">
              <HatchGrabWordmark variant="dark" className="h-8 w-auto sm:w-[168px] sm:h-auto" />
            </span>
          ) : (
            <Link href="/landing" className="inline-flex hover:opacity-80 transition-opacity" aria-label="HatchGrab home">
              <HatchGrabWordmark variant="dark" className="h-8 w-auto sm:w-[168px] sm:h-auto" />
            </Link>
          )}
```
⚠️ **NOTE, because it shapes the component's API: this site's two branches are NOT class-identical.**
Web carries `hover:opacity-80 transition-opacity` and `aria-label="HatchGrab home"`; native carries
neither. **AppHeader's two branches ARE identical.** A single `className` prop could not reproduce both.

### 3. `app/dashboard/[token]/page.tsx:2419` — done last task, a third copy

```tsx
  if(error){const _brand=…;return<div …><p …>Access denied</p><p …>{error}</p>{isNativeApp()?<span className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</span>:<Link href="/" className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</Link>}</div></div>}
```

### 4 and 5. `app/contact/page.tsx:39` and `:42` — **NO native branch at all**

```tsx
          <Link href="/" className="text-xl font-bold flex items-center gap-2 hover:opacity-80 transition-opacity">
            Village Foodie <span className="text-2xl">🚚</span>
          </Link>
          <Link href="/" className="text-xs font-bold bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors border border-slate-700">
            ← Back
          </Link>
        </div>
```
🔴 **Both are plain links. Neither has ever had a native branch** — this is the file the sweep report
identified as the real end of the legal-footer chain.

## A2. `app/contact/page.tsx` — ✅ **CLIENT COMPONENT.** Quoted from the top of the file:

```tsx
'use client';

import Script from 'next/script';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
```

⚠️ **`'use client'` DOES NOT MEAN "not server-rendered".** In the App Router a client component is
still rendered to HTML on the server and hydrated, **so this page IS a first paint with no loading gate
in front of it.** 🔴 **The shared component must therefore handle first-paint safety itself** — exactly
as B2 anticipated. A2's answer does not remove the requirement; it confirms it.

## A3. The count has NOT moved — **13 total, 5 in scope. READ, re-swept today.**

**`<Link href="/">` — 12 occurrences** (the sweep's thirteenth was a comment, and my pattern excludes
it, which is why 12 and 13 agree):

| file:line | Reachable in the native shell? |
|---|---|
| 🔴 `components/shared/AppHeader.tsx:97` | **YES** — operator header |
| 🔴 `app/dashboard/[token]/page.tsx:2419` | **YES** — access-denied |
| 🔴 `app/contact/page.tsx:39` | **YES**, indirectly, via the legal footer |
| 🔴 `app/contact/page.tsx:42` | **YES**, same route |
| `app/venues/[slug]/VenueClient.tsx:104`, `:127` | **NO** — consumer venue page |
| `app/hire/page.tsx:16`, `:19` | **NO** — marketing |
| `app/trucks/page.tsx:35`, `:145` | **NO** — consumer truck index |
| `app/trucks/[slug]/TruckClient.tsx:121` | **NO** — consumer truck profile |
| ⚠️ `app/trucks/[slug]/order/page.tsx:4071` | **NO for an operator** — see below |

**`href="/landing"` — exactly 1**: 🔴 `app/(legal)/layout.tsx:80`. **YES**, in scope.
**Programmatic navigation to `/`** (`router.push('/')` / `router.replace('/')` / `href={'/'}`):
**NOT FOUND.**

✅ **12 + 1 = 13, of which exactly 5 are native-reachable. No new site has appeared. Part B covers
those five and no others.**

⚠️ **CUSTOMER-SIDE, REPORTED SEPARATELY AND DELIBERATELY NOT TOUCHED.** `app/trucks/[slug]/order/page.tsx:4071`
is the **customer order page's own header** — a different component with its own `<Link href="/">`.
🔴 **Customers are never in the native shell**; they order in a browser, where a link to the discovery
map is correct behaviour with a working back button. **A fact about the operator header is not a fact
about the customer header, and this component was not applied to it.**

---

# PART B — THE COMPONENT

## B1. Created: `components/shared/BrandHomeLink.tsx`

```tsx
export function BrandHomeLink({ href, kind, className, nativeClassName, ariaLabel, nativeAriaLabel, children }: BrandHomeLinkProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const inApp = mounted && isNativeApp()

  if (inApp) {
    if (kind === 'control') return null
    return (
      <span className={nativeClassName ?? className} aria-label={nativeAriaLabel}>
        {children}
      </span>
    )
  }

  return (
    <Link href={href} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  )
}
```

**Six props, four optional.** `nativeClassName` and `nativeAriaLabel` exist for one reason: A1's site 2
has branches that differ in class and label, and without them that site could not be reproduced exactly.
**They default to `className` and to omitted**, so the two sites that do not need them pass neither.

## B2. First-paint safety — the `mounted` two-pass, and where it is honest

✅ **It is the pattern proven in `app/(legal)/layout.tsx`, moved wholesale**, not a reimplementation.
`mounted && isNativeApp()` is `false` on the server **and** on the first client frame, and
`isNativeApp()` is `Capacitor.isNativePlatform()` — false in every browser thereafter.

✅ **For `branding` the two branches are visually identical** — same children, same classes, same size,
differing only in whether a tap navigates. **The two-pass costs nothing a user can see.**

🔴 **For `control` it is NOT identical, and that is the contradiction reported at the top of this
document.** It is recorded in the component's own comments so the next reader meets it before the bug
does.

## B3. Two native behaviours, exposed as an explicit prop

```tsx
export type BrandHomeLinkKind = 'branding' | 'control'
```

| Kind | In the app | Why |
|---|---|---|
| `branding` | the children, unchanged, in a **non-navigating wrapper** | a non-clickable logo is normal in a native app — it reads as identity, not as a control |
| `control` | 🔴 **`return null`** — nothing at all | an inert control that still looks tappable is a **2.1 dead control**, which the completeness sweep just cleared |

✅ **`kind` is REQUIRED — there is no default.** Between "show it" and "hide it" there is no safe
guess, so the type system forces the call site to say which.
✅ **It is NOT inferred from the children**, per B3. An arrow is a glyph inside arbitrary markup; a
heuristic that read `← Back` correctly today would mis-classify the first call site whose affordance is
an icon or a translated string.

### ⚠️ ONE WORDING POINT IN B3, RESOLVED BY C3 RATHER THAN BY ME

B3 says branding should *"render the children, **unwrapped**"*. **Taken literally — a bare fragment —
the wrapper's classes would be lost**: AppHeader's `shrink-0 z-10` and the legal layout's `inline-flex`
are what stop the logo shrinking inside its flex parent. **That would change how the app looks.**

🔴 **C3 settles it: *"BRANDING — unwrapped wordmark, UNCHANGED APPEARANCE."*** The only reading that
satisfies both clauses is **unwrapped from the `<Link>`, still carrying its classes** — which is what
both existing sites already do. **I did not choose between two live options; one reading is excluded by
another explicit instruction.** Flagged rather than done quietly.

## B4. ✅ `purchaseCtaAllowed()` was NOT used, extended, imported or referenced.

The component imports `isNativeApp` and nothing else from the native or policy layers. **Its comments
say why in the file itself**, so a future tidy-up does not merge the 3.1.1 commerce predicate with a 2.1
completeness question.

---

# PART C — ADOPTION

## C1 / C3. ✅ THE THREE `branding` SITES — ALL ADOPTED

### Site 1 — `components/shared/AppHeader.tsx`

```tsx
          <BrandHomeLink href="/" kind="branding" className="shrink-0 z-10">
            {/* …the existing size comment, unchanged… */}
            <img
              src={HATCHGRAB_WORDMARK_WHITE_SVG}
              alt="HatchGrab"
              width={140}
              height={31}
              className="object-contain w-[112px] md:w-[140px] h-auto"
            />
          </BrandHomeLink>
```
**The `<img>` and its comment are byte-identical; the duplicate copy in the old native branch is gone.**
`Link` and `isNativeApp` imports removed — **now unused, and both were only used by the branch that
moved.**

⚠️ **THIS SITE GAINS A `mounted` TWO-PASS IT DID NOT HAVE.** Both branches are visually identical, so
nothing flashes — but it is a real change in mechanism, and the trade is deliberate: **AppHeader's
safety used to depend on a property of three OTHER files** (their loading early-returns). It no longer
does. 🔴 **The comment that said "if any renderer ever drops its early-return this becomes a hydration
mismatch" is now obsolete, and has been replaced rather than left to mislead.**

### Site 2 — `app/(legal)/layout.tsx`

```tsx
          <BrandHomeLink
            href="/landing"
            kind="branding"
            className="inline-flex hover:opacity-80 transition-opacity"
            nativeClassName="inline-flex"
            ariaLabel="HatchGrab home"
            nativeAriaLabel="HatchGrab"
          >
            <HatchGrabWordmark variant="dark" className="h-8 w-auto sm:w-[168px] sm:h-auto" />
          </BrandHomeLink>
```
✅ **Both branches reproduced exactly**, including the class and label asymmetry noted in A1.

### Site 3 — `app/contact/page.tsx:39`

```tsx
          <BrandHomeLink href="/" kind="branding" className="text-xl font-bold flex items-center gap-2 hover:opacity-80 transition-opacity">
            Village Foodie <span className="text-2xl">🚚</span>
          </BrandHomeLink>
```
**New behaviour — this site had no native branch.** ✅ **`kind="branding"` means nothing disappears,
so B2's guard does not fire here.**

## C2. 🔴 NOT DONE — the dashboard access-denied view

**Unchanged. `app/dashboard/[token]/page.tsx` is byte-identical to how last task left it** (366,542
bytes, confirmed). It still renders the inert `← {_brand}` in the app.

**C2 is correct that it is a CONTROL and correct that the residual should not survive.** I agree with
the classification and did not act on it, **solely because B2 instructs me to stop when a call site
would flash — and `kind="control"` under a `mounted` two-pass flashes.** See the headline.

## C4. `app/contact/page.tsx` — my classification, with reasoning, per link

### `:39` → **`branding`. ADOPTED.**

```tsx
<Link href="/" className="text-xl font-bold flex items-center gap-2 hover:opacity-80 transition-opacity">
  Village Foodie <span className="text-2xl">🚚</span>
</Link>
```
**Reasoning:** it is the **site wordmark in the header bar** — the product name and its mark, in the
left-hand slot, styled as identity (`text-xl font-bold`) with no directional affordance. **It carries no
arrow, no "back", no "home".** It is structurally the same thing as AppHeader's logo, and B3's branding
case describes it exactly. ✅ **Not ambiguous.**

### `:42` → **`control`. NOT ADOPTED — blocked by the headline, not by doubt.**

```tsx
<Link href="/" className="text-xs font-bold bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors border border-slate-700">
  ← Back
</Link>
```
**Reasoning:** it is **a button** — background fill, border, rounded, padded — **labelled `← Back` with
a literal back arrow**. It is the clearest `control` of the five: it promises a specific action, and in
the app there is nowhere for that action to go. ✅ **Not ambiguous either.**

🔴 **Both classifications are firm. Neither is a guess.** What blocked `:42` was B2's guard, not the
classification.

## C5. `app/(legal)/layout.tsx` no longer needs its own `mounted` — SAID, NOT DONE

✅ **Stating it, as instructed, and NOT reverting it.**

After adoption, `const inApp = mounted && isNativeApp()` at `:55` has **no remaining consumer** — it
existed only for the logo branch that is now inside the component. The `mounted` state, the `useEffect`,
the `isNativeApp` import and the `'use client'` directive are all **still present and now unused for
this purpose.**

⚠️ **They are NOT dead weight in general**, and this is why the revert is a separate decision rather
than a tidy-up: **removing `'use client'` would convert a client component back to a server component**,
which changes how the legal pages render and is exactly the change C5 puts out of scope.

⚠️ **ONE MEASURED CONSEQUENCE, REPORTED NOT SUPPRESSED:** `npx eslint` now emits
`'inApp' is assigned a value but never used` (warning) for that file. **It is the visible trace of the
deferred decision**, and clearing it is one line whenever you take that decision.

---

# PART D — THE WEB DID NOT MOVE

## D1. What the web renders at each of the five sites, before and after

| # | Site | WEB before | WEB after | Same? |
|---|---|---|---|---|
| 1 | `AppHeader.tsx` | `<Link href="/" class="shrink-0 z-10">` + `<img>` | `<Link href="/" class="shrink-0 z-10">` + the same `<img>` | ✅ **IDENTICAL** |
| 2 | `(legal)/layout.tsx` | `<Link href="/landing" class="inline-flex hover:opacity-80 transition-opacity" aria-label="HatchGrab home">` + wordmark | the same, from `className` + `ariaLabel` | ✅ **IDENTICAL** |
| 3 | `dashboard/[token]/page.tsx` | `<Link href="/" class="mt-4 inline-block text-orange-600 text-sm hover:underline">← HatchGrab</Link>` | **unchanged — file not touched** | ✅ **IDENTICAL** |
| 4 | `contact/page.tsx:39` | `<Link href="/" class="text-xl font-bold flex items-center gap-2 hover:opacity-80 transition-opacity">Village Foodie 🚚</Link>` | the same, from `className` | ✅ **IDENTICAL** |
| 5 | `contact/page.tsx:42` | `<Link href="/" class="text-xs font-bold bg-slate-800 …">← Back</Link>` | **unchanged — not adopted** | ✅ **IDENTICAL** |

🔴 **The mechanism guarantees this rather than the diff merely happening to preserve it.** On the web
`mounted && isNativeApp()` is false on the server, false on the first client frame, and false forever
after — **so every browser takes the `<Link>` return path, which passes `href`, `className` and
`ariaLabel` straight through.** There is no browser code path that reaches the `<span>`.

⚠️ **What DID change on the web, and it is not rendered output:** sites 1, 2 and 4 now mount an extra
component with a `useState`/`useEffect` pair, so each performs **one additional render pass** after
hydration. **The painted result of both passes is the same element**, so nothing is visible — but it is
a real difference and is stated rather than claimed away.

## D2. ✅ No route, redirect or `href` value changed

- **`href` values:** site 1 `/`, site 2 `/landing`, site 4 `/` — **all passed through verbatim**, and
  the component does nothing to `href` but hand it to `<Link>`.
- **No `redirect()`, `router.push` or `router.replace` was added, removed or altered anywhere.**
- **No gate, no permission check, no fetch, no data path.** The only conditional added is
  `mounted && isNativeApp()`, which is display-only by construction.
- 🔴 **Nothing an operator or a customer can DO changes on either platform**, on any of the three
  adopted sites.

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census, before and after, per file

| File | Bytes | Lines | Distinct non-ASCII | Classes gained | Classes lost |
|---|---|---|---|---|---|
| `components/shared/AppHeader.tsx` | 10,495 → **10,238** (−257) | 155 → 143 | **7 → 7** | **NONE** | **NONE** |
| `app/(legal)/layout.tsx` | 7,725 → **8,431** (+706) | 102 → 111 | **8 → 8** | **NONE** | **NONE** |
| `app/contact/page.tsx` | 2,716 → **3,657** (+941) | 69 → 79 | **4 → 4** | **NONE** | **NONE** |
| `components/shared/BrandHomeLink.tsx` | **NEW — 6,688** | 112 | 7 | n/a | n/a |
| `app/dashboard/[token]/page.tsx` | 366,542 → **366,542** | — | — | **NOT TOUCHED** | — |

**Every changed count explained:**

- **`AppHeader.tsx`** — `—` 22→21, `→` 6→3, `⚠` 11→10, `FE0F` 11→10, `─` 92→**107 (+15)**. The
  duplicated native branch and its obsolete hydration paragraph were removed; one new box-drawing rule
  was added for the replacement comment. **The `⚠`/`FE0F` pair moved together, so no `⚠️` is
  half-written.** The file shrank, which is the point of the refactor.
- **`(legal)/layout.tsx`** — `—` 15→14, `🔴` 6→7, `─` 76→**91 (+15)**: one new comment rule and one new
  red marker, one em dash lost with the removed branch.
- **`contact/page.tsx`** — 🔴 **ALL FOUR COUNTS UNCHANGED** (`👇`=2, `🚚`=1, `←`=1, `©`=1). The new
  comment is **pure ASCII**, deliberately. See below.
- **`BrandHomeLink.tsx`** — new file: `─`=205, `—`=12, `🔴`=6, `⚠`=3, `FE0F`=3, `←`=1, `…`=1. **All
  seven classes are already standard in `components/shared/`**, and the `⚠`/`FE0F` pair is balanced.

### 🔴 E2 CAUGHT A REAL VIOLATION IN THIS TASK, AND IT WAS FIXED BEFORE FINISHING

**The first version of the `contact/page.tsx` comment gained FOUR codepoint classes that file had never
held** — `U+2014` (—) ×2, `U+26A0` (⚠) ×1, `U+FE0F` ×1, `U+1F534` (🔴) ×1. That file's entire non-ASCII
vocabulary was `👇 🚚 ← ©`; my house-style markers were foreign to it.

✅ **Caught by the after-census, rewritten ASCII-only, and re-censused: 4 → 4 classes, GAINED NONE, LOST
NONE, every count unchanged.** ⚠️ **It compiled, it would have rendered, and nothing but the census
would ever have looked at it** — the third instance of this class in two days, and the second I
introduced myself.

## E3. Byte scan — byte-level tool, never grep

| File | NUL (0x00) | Ctrl < 0x09 | Other C0 (0x0B-0x1F, 0x7F) |
|---|---|---|---|
| `components/shared/BrandHomeLink.tsx` **(created)** | **0** | **0** | **0** |
| `components/shared/AppHeader.tsx` | **0** | **0** | **0** |
| `app/(legal)/layout.tsx` | **0** | **0** | **0** |
| `app/contact/page.tsx` | **0** | **0** | **0** |

## E4. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## E5. `git status` and `git diff --stat`

```
$ git status --porcelain
 M app/(legal)/layout.tsx
 M app/contact/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/shared/AppHeader.tsx
 M docs/reference-manual.md
 M ios/App/App.xcodeproj/project.pbxproj
 M ios/App/App/Info.plist
 M lib/plan-features.ts
 M package.json
?? components/shared/BrandHomeLink.tsx
?? docs/appstore-completeness-report.md
?? docs/appstore-report.md
?? docs/completeness-sweep-report.md
?? docs/dependency-pin-report.md
?? docs/presubmission-housekeeping-report.md
?? docs/privacy-manifest-report.md
?? ios/App/App/PrivacyInfo.xcprivacy

$ git diff --stat
 app/(legal)/layout.tsx                |  54 +++-
 app/contact/page.tsx                  |  12 +-
 app/dashboard/[token]/page.tsx        |  25 +-
 app/manage/[token]/page.tsx           |  50 ++--
 components/shared/AppHeader.tsx       |  28 +-
 docs/reference-manual.md              | 512 +++++++++++++++++++++++++++++++++-
 ios/App/App/Info.plist                |  16 ++
 ios/App/App.xcodeproj/project.pbxproj |   4 +
 lib/plan-features.ts                  |  14 +-
 package.json                          |  24 +-
```

🔴 **THIS TASK TOUCHED FOUR FILES: three modified** (`AppHeader.tsx`, `(legal)/layout.tsx`,
`contact/page.tsx`) **and one created** (`BrandHomeLink.tsx`). ⚠️ **`app/dashboard/[token]/page.tsx`
appears as modified because of the PREVIOUS task — this task did not touch it, which is the substance
of the stop.** Everything else in the list is earlier work.

## E6. ✅ `tsc --noEmit`: **EXIT 0, ZERO OUTPUT** — and that is not verification

🔴 **TSC-CLEAN MEANS IT COMPILES. NOTHING MORE. Stated explicitly:**

- It does **not** prove the native branch renders — **nothing here has been executed**, on any device
  or simulator or browser.
- It does **not** prove the web output is unchanged; that is an argument from `isNativeApp()` being
  false in browsers, **not a measurement**.
- It would not catch a prop passed to the wrong branch, since both are typed identically.
- The same compiler was clean over a file containing a literal NUL earlier this week.

### ⚠️ ESLINT, REPORTED IN FULL BECAUSE IT IS NOT ALL CLEAN

`npx eslint` over the four files: **2 errors, 4 warnings.**

| Finding | New? |
|---|---|
| 🔴 `BrandHomeLink.tsx:85` `react-hooks/set-state-in-effect` — *"Avoid calling setState() directly within an effect"* | ⚠️ **NEW, and unavoidable** — it is the **instructed pattern**. `app/(legal)/layout.tsx:54` produces the **identical error today**, so this is a second instance of a pre-existing one, not a new class. **Any `mounted` flag trips this rule.** |
| `(legal)/layout.tsx:55` `'inApp' is assigned a value but never used` | ⚠️ **NEW** — the deferred C5 cleanup, above |
| `(legal)/layout.tsx:54` same `set-state-in-effect` error | **PRE-EXISTING** |
| `AppHeader.tsx:7` `'Image' is defined but never used` | ✅ **PRE-EXISTING** — verified against `HEAD`, where the same import sits over two deliberate plain `<img>` tags. **Not mine, and not removed, because it is out of scope** |
| `AppHeader.tsx` ×2 `no-img-element` | ✅ **PRE-EXISTING** — deliberate, and the reason is in the file's own comment |

---

# WHAT I HAVE NOT DONE

1. 🔴 **Two of the five sites are not adopted** — both `control` sites. See the headline. **C2 is
   unmet and the dashboard residual survives.**
2. **Nothing was rendered.** No browser, no simulator, no device. **Every claim about appearance is read
   from markup and classes.**
3. **I did not revert `app/(legal)/layout.tsx`'s client conversion or its `mounted` state**, per C5 —
   and its now-unused `inApp` is the visible reminder.
4. **I did not touch the seven consumer-surface `<Link href="/">`s**, none of which is reachable in the
   shell, **nor the customer order page's own header** — a separate implementation on the other side of
   the platform.
5. **I did not remove `AppHeader.tsx`'s pre-existing unused `Image` import**, which is out of scope.
6. **I did not resolve the `set-state-in-effect` lint error** in either file. It is inherent to the
   `mounted` pattern this task specified, and changing the pattern is a decision, not an edit.
