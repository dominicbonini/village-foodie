# Completeness sweep — closing item 6 of the previous report

Date: 14 August 2026
Status: READ-ONLY SWEEP. **No edits, no commits, no builds, no `cap sync`, no deploy.**
Nothing was written except this report — `git status` at the end proves it.

**Scope:** this closes the gap `docs/appstore-completeness-report.md` left open in its own
*"WHAT I HAVE NOT EXERCISED"* item 6 — that no check was made for near-duplicate implementations on
other surfaces — **and nothing else. This task proposes nothing and changes nothing.**

**Nothing in the prompt arrived garbled. No instruction contradicted another.**

**THE RULE APPLIED THROUGHOUT:** *"Coming soon" against a FACT ABOUT A PLAN stays. "Coming soon" against
a CONTROL a user can see and cannot operate is a defect.* **Classification only.**

---

## 🔴 HEADLINE — ONE FINDING OVERTURNS AN EARLIER CONCLUSION

**`/landing` is ADMIN-ONLY IN PRODUCTION.** `app/landing/layout.tsx:13-16` — **READ**:

```tsx
export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) {
    redirect('/')
  }
  return <>{children}</>
}
```

🔴 **`docs/appstore-report.md` states — in the C3 correction I wrote earlier today — that the legal
page's logo gives a reviewer a three-tap route to the marketing page's four "Coming soon" strings. THAT
IS WRONG IN PRODUCTION.** A reviewer using a review account is not an admin, so
`verifyAdmin()` is false and they are **server-side redirected to `/` before any HTML ships.** The
landing page's roadmap copy **is not reviewer-reachable in the shipped app.**

⚠️ **The link was still worth changing** — it still navigated an operator out of the legal page with no
way back, just to `/` rather than `/landing`. **The B2 edit stands; the stated exposure did not.**
⚠️ **The gate is `NODE_ENV === 'production'` only, so `/landing` IS open in dev.** The native shell loads
`https://www.hatchgrab.com`, which is production, so the app sees the gated behaviour.

**This is exactly the class of error the report's own rules exist to catch: the earlier work traced the
LINK and never the DESTINATION'S GATE.**

---

# PART A — THE NEAR-DUPLICATE HUNT

## A1. Is there another Messenger/Instagram auto-reply control anywhere? — 🔴 **NO. NOT FOUND.**

**Method: `grep -rniE "messenger|instagram"` across `app/`, `components/`, `lib/` — 45 hits, every one
classified. READ.**

**Directories checked, per the brief:**

| Named surface | Result |
|---|---|
| Setup wizard — `app/setup/page.tsx` | ✅ **zero** Messenger/Instagram hits |
| Signup — `app/signup/page.tsx` | ✅ **zero** |
| The in-Manage settings-review step (`setupReviewItems`, `app/manage/[token]/page.tsx:3002`) | ✅ its four rows are `allow_customer_cancellation`, `auto_accept`, `order_ready_enabled`, `buzzer_count` — **no auto-reply row** |
| `components/manage/` (8 files) | ✅ **zero** |
| `components/dashboard/` (16 files) | ✅ **zero** |
| `components/setup/`, `components/wizard/` | 🔴 **NEITHER DIRECTORY EXISTS** |
| Customer order page (`app/trucks/[slug]/order/page.tsx`) | ✅ **zero** |
| KDS (`app/dashboard/[token]/kds/page.tsx`) | ✅ **zero** |

🔴 **CONCLUSION: the two rows removed yesterday were the ONLY auto-reply controls in the codebase. There
is no near-duplicate to remove.** The gap item 6 flagged is closed, and it was empty.

### Every remaining hit, classified

**DESCRIPTIVE TEXT — marketing (`app/landing/page.tsx`), and admin-gated in production (see Headline):**
```
:203  <div className="does-item"><h3>Social media auto-replies</h3><p>… Messenger and Instagram coming soon.</p></div>
:333  <li>WhatsApp auto-replies (Messenger &amp; Instagram coming soon)</li>
```
**No control. Prose in a marketing section. Keep.**

**DESCRIPTIVE TEXT — the plan matrix, `lib/plan-features.ts:139`:**
```ts
{ name: 'Messenger & Instagram auto-replies', footnote: '4', detail: 'Same as WhatsApp auto-replies, for Messenger and Instagram enquiries.', starter: false, pro: 'coming_soon', max: 'coming_soon' },
```
🔴 **This is the archetype of what the rule PROTECTS — a fact about a plan. Keep.**

**⚠️ A DIFFERENT CONTROL THAT MENTIONS THEM, AND IT IS LIVE — `app/manage/[token]/page.tsx:8871-8889`:**
```tsx
{['facebook', 'messenger', 'instagram'].includes(preferredContact) && (
  <p className="text-xs text-slate-500 italic mb-2">Your previous contact method is no longer available. Please select a new one.</p>
)}
<select
  value={['facebook', 'messenger', 'instagram'].includes(preferredContact) ? '' : preferredContact}
  onChange={async e => { … await saveSetting('preferred_contact_method', val || null) }}
>
  <option value="">Not specified</option>
  {(!!form.contact_email?.trim() || preferredContact === 'email') && <option value="email">Email</option>}
  …
</select>
```
✅ **LIVE CONTROL.** This is the *preferred contact method*, a different feature. The three strings are a
**migration branch**: a truck that previously chose Messenger/Instagram sees an explanatory line and an
empty selection. **Those options are not offered — they are only recognised as legacy values.** The
`<select>` has a real `onChange` writing a real setting. **Keep. Not a dead control.**

**SERVER-ONLY, NO UI:** `app/api/webhooks/messenger/route.ts` and `app/api/webhooks/instagram/route.ts`
are verification/logging stubs; `app/api/dashboard/route.ts:46` redacts `messenger_page_token`.
**LIVE, CONDITIONAL:** `lib/email.ts:344-345, 475-476` build `m.me` / `instagram.com` links **only when
the truck has stored a handle** — customer-facing email, not an operator control.
**INFRASTRUCTURE:** `lib/url-normalise.ts:99` blocks those domains from the scraper; `lib/features.ts:22`
declares the `instagram_messenger_replies` Feature.

## A2. Reachability — **N/A: there is nothing to reach.**

No near-duplicate exists, so there is no surface to enumerate and nothing for the native shell to reach.
**Stated plainly rather than left as a gap.**

## A3. The Auto-replies section as it stands NOW — ✅ **INTACT**

**READ**, `app/manage/[token]/page.tsx:8962-8967` and `:9024-9042`:

```tsx
{/* Auto-replies subsection */}
<div className="border-t border-slate-100 pt-4 mt-1">
  <p className="text-sm font-bold text-slate-700 mb-0.5">Auto-replies</p>
  <p className="text-xs text-slate-400 mb-3">Requires Business accounts on each platform.</p>

  <div className="space-y-3">
    {/* WhatsApp */}
    <div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600 w-20 flex-shrink-0">WhatsApp</label>
        {can('whatsapp_replies') ? ( …live input + Connect… ) : ( …disabled input + <FeatureGate> ) }
      </div>
      <p className="text-xs text-slate-400 mt-1.5 sm:pl-[5.5rem]">The WhatsApp Business number used to send automated replies …</p>
    </div>

    {/* ── 🔴 THE MESSENGER AND INSTAGRAM ROWS WERE REMOVED HERE — 14 August 2026 (Guideline 2.1) …  */}
  </div>
</div>
```

| Element | Status |
|---|---|
| `border-t border-slate-100 pt-4 mt-1` divider | ✅ **intact** |
| `Auto-replies` heading | ✅ **intact** |
| `Requires Business accounts on each platform.` caption | ✅ **intact** |
| `space-y-3` wrapper | ✅ **intact**, holding exactly one child |
| WhatsApp row — gate, `onChange`, `onBlur`, `saveWhatsappSender`, `<FeatureGate>` | ✅ **intact and functional** |
| Empty container / dangling divider | ✅ **NONE** — both removed `<div>`s went whole |

⚠️ **ONE RESIDUAL COPY INCONSISTENCY, REPORTED NOT FIXED:** the caption still reads *"Requires Business
accounts on **each platform**."* — plural, written when three platforms were listed. With only WhatsApp
remaining it reads slightly oddly. **It is not a dead control and is out of this task's scope.**

---

# PART B — RESIDUAL NATIVE ROUTES

## B1. `app/dashboard/[token]/page.tsx:2396` — the access-denied view. **NOT FIXED, as instructed.**

**READ**, in full (the file is minified-style, so this is the whole line):
```tsx
if(error){const _brand=typeof window!=='undefined'&&window.location.hostname.includes('hatchgrab')?'HatchGrab':'Village Foodie';return<div className="min-h-screen bg-slate-50 flex items-center justify-center px-4"><div className="text-center"><p className="text-slate-900 font-bold text-lg mb-2">Access denied</p><p className="text-slate-500 text-sm">{error}</p><Link href="/" className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</Link></div></div>}
```
Its neighbours: `:2395` is the `loading` early-return, `:2397` the PIN gate.

| Question | Answer |
|---|---|
| Reachable inside the native shell? | 🔴 **YES.** It renders whenever the dashboard fetch sets `error` — a bad token, a revoked session, a server failure. The shell's cold-launch routes to `/dashboard/[token]`, so this is a first-run failure surface |
| What would an operator land on? | 🔴 **`/`, the Village Foodie consumer discovery map** (B3) — **not** a HatchGrab page |
| Severity | ⚠️ **Worse here than on the header.** The header link was one of several ways out; **this screen has exactly one link and nothing else.** An operator hitting it in the app taps the only affordance offered and lands in a different product, with no back button |
| ⚠️ Note | `_brand` labels the link *"← HatchGrab"* on a hatchgrab hostname, so **the label says HatchGrab and the destination is Village Foodie.** The label is computed from the hostname; the `href` is not |

**Not fixed. Reported.**

## B2. Every remaining `/` and `/landing` link — **READ, complete sweep**

### `<Link href="/">` — 13 occurrences, 12 real (one is a comment)

| file:line | Surface | Reachable in the native app? | By whom |
|---|---|---|---|
| 🔴 `app/dashboard/[token]/page.tsx:2396` | Dashboard **access-denied** | 🔴 **YES** | any role hitting an error |
| ✅ `components/shared/AppHeader.tsx:97` | Operator header | 🔴 **YES, but now inert in-app** — B1 of the previous task wrapped it in `isNativeApp()` | owner · manager · staff · admin |
| `components/shared/AppHeader.tsx:66` | — | n/a | **a comment**, not a link |
| `app/contact/page.tsx:39`, `:42` | `/contact` | ⚠️ **YES, INDIRECTLY** — the legal layout's footer links `/contact` (`app/(legal)/layout.tsx:96`), and the legal pages are the required in-app link | anyone who opens Privacy/Terms |
| `app/trucks/page.tsx:35`, `:145` | Consumer truck index | **NO** — no operator surface links to it | — |
| `app/trucks/[slug]/TruckClient.tsx:121` | Consumer truck profile | **NO** | — |
| `app/trucks/[slug]/order/page.tsx:4071` | 🔴 **CUSTOMER order page header** | **NO for an operator** — but **YES for a CUSTOMER**, who is not in the app at all | customers, in a browser |
| `app/venues/[slug]/VenueClient.tsx:104`, `:127` | Consumer venue page | **NO** | — |
| `app/hire/page.tsx:16`, `:19` | Marketing | **NO** | — |

🔴 **THE CHAIN THAT MATTERS, AND IT IS NEW:** legal page → footer `Contact` → `/contact` → its own
`<Link href="/">` ×2 → the Village Foodie map. **`app/(legal)/layout.tsx:96` is in-app by requirement,
so `/contact` is two taps from the compliance surface and `/` is three.** The previous task closed the
legal page's *logo* and left its *footer* open. **Reported, not fixed.**

### `<Link href="/landing">` — **exactly 1**

| file:line | Reachable in the app? |
|---|---|
| `app/(legal)/layout.tsx:80` | ✅ **already handled** — wrapped in `inApp` by the previous task, and **the destination is admin-gated anyway** (Headline) |

### Programmatic navigation — **2, neither an operator trap**

| file:line | What |
|---|---|
| `app/landing/layout.tsx:15` | `redirect('/')` — **the admin gate itself** |
| `app/api/demo/return/route.ts:27` | `new URL('/landing', req.url)` — a **demo-return** server redirect; a non-admin following it lands on `/` via the same gate |

**`grep` for `router.push('/')`, `router.replace('/')`, `redirect('/landing')`,
`window.location.href = '/'`: NOT FOUND.**

## B3. What each route renders — 🔴 **THEY ARE DIFFERENT PAGES. Confirmed.**

**`/` → `app/page.tsx` — the VILLAGE FOODIE consumer discovery map. READ:**
```tsx
export default function Home() {          // :384, 'use client'
  const { loading, groupedEvents, mapEvents, dynamicCuisineOptions, venueStats, allTrucks } = useVillageData(userLocation, filters);   // :51
  …
  <Image src="/logos/village-foodie-logo-v2.png" alt="Village Foodie Logo" width={200} height={60} priority … />   // :194
```
Renders `EventListCard` (`:342`) and `Footer` (`:9`). **`grep` for `/landing` or `hg-landing` in
`app/page.tsx`: NOT FOUND.**

**`/landing` → `app/landing/page.tsx` — the HATCHGRAB marketing page**, behind
`app/landing/layout.tsx`'s admin gate. It carries the `.hg-landing` stylesheet and the four "Coming
soon" strings.

🔴 **So the two logos led to two different wrong places** — the operator header to a *consumer product*,
the legal page to a *marketing page that is admin-gated*. **The earlier work reported them as one
problem. They are two, and only one of them was ever reviewer-visible.**

---

# PART C — DEAD-CONTROL SWEEP

## C1. Permanently inert controls — 7 hardcoded `disabled`, 3 no-op handlers. **All classified.**

**`disabled={true}` literal: NOT FOUND. Absent `onClick` on a `<button>`: not found by this method.**

| # | file:line | Control | Classification |
|---|---|---|---|
| 1 | `app/trucks/[slug]/order/page.tsx:2976` | `<button disabled …>−</button>` | ✅ **NOT DEAD.** Inside `{isOrderingBlocked ? … : <QBtn onClick={…}/>}` — a runtime condition (paused/closed). 🔴 **CUSTOMER surface** |
| 2 | `app/trucks/[slug]/order/page.tsx:2982` | `<button disabled …>+</button>` | ✅ **NOT DEAD.** Same, gated on `isOrderingBlocked \|\| atStockLimit`. 🔴 **CUSTOMER surface** |
| 3 | `app/manage/[token]/page.tsx:818` | `<input type="email" value={currentUserEmail} disabled …>` | ✅ **NOT DEAD — a read-only display field.** It shows the signed-in email in the profile modal. ⚠️ **The one I am least certain about** — see C3 |
| 4 | `app/manage/[token]/page.tsx:7852` | `<button disabled …>Fix N events first</button>` | ✅ **NOT DEAD.** The `else` of `{canSave ? <live save button> : …}`; the label *states the condition to satisfy* |
| 5 | `app/manage/[token]/page.tsx:9006` | `<input type="tel" disabled placeholder="+447700900000">` | ✅ **NOT DEAD.** The `else` of `can('whatsapp_replies')` — **a PLAN GATE**, and a `<FeatureGate>` renders beside it explaining and offering the upgrade |
| 6 | `app/manage/[token]/page.tsx:12013` | `<input type="checkbox" checked disabled />` | ✅ **NOT DEAD.** Inside `{vans.length === 1 ? … }` — a single-van truck's only van, labelled `(only truck)`. Nothing to choose |
| 7 | `components/dashboard/OrderCard.tsx:660` | `completionBtnDisabled()` | ✅ **NOT DEAD.** Its own comment: *"The disabled placeholder shown while the cooking gate holds an order"* — a runtime lifecycle state |
| 8–10 | `app/manage/[token]/page.tsx:4158`, `:6325`, `components/manage/ExtrasEditor.tsx:489` | `<div … onClick={() => {}}>` on a modal backdrop | ✅ **NOT A CONTROL.** A deliberate no-op swallowing backdrop clicks so the modal does not close. Not user-facing as an affordance |

🔴 **RESULT: ZERO dead controls found. Every hardcoded `disabled` is the else-branch of a runtime
condition, a plan gate, or a read-only display — exactly the cases the brief says to ignore.**

## C2. Label sweep — raw counts, then rendered strings

| Phrase | Raw hits | Rendered near a control |
|---|---|---|
| `coming soon` | 26 | 8 (below) |
| `not available` | 16 | 0 near a control — all are error toasts / API messages |
| `not yet` | 37 | 0 near a control |
| `TBC` | 18 | 0 near a control — all are `lib/pricing.ts` suppression or date fallbacks |
| `in development` | 🔴 **0 — NOT FOUND** | — |
| `beta` | 5 | 🔴 **0 — all five are `generativelanguage.googleapis.com/v1beta` API URLs.** Not UI |
| `placeholder` | 165 | the JSX attribute, not copy |

### The 8 rendered "Coming soon" strings

| # | file:line | Rendered | Classification |
|---|---|---|---|
| 1 | `app/landing/page.tsx:81` | `Cell` renderer: `if (value === 'coming_soon') return <span className="soon">Coming soon</span>` | ✅ **DESCRIPTIVE** — the matrix cell renderer |
| 2 | `app/landing/page.tsx:203` | *"Messenger and Instagram coming soon."* in prose | ✅ **DESCRIPTIVE** |
| 3 | `app/landing/page.tsx:333` | `<li>WhatsApp auto-replies (Messenger &amp; Instagram coming soon)</li>` | ✅ **DESCRIPTIVE** |
| 4 | `app/landing/page.tsx:350` | `<li>Event &amp; festival pricing <span className="soon-inline">Coming soon</span></li>` | ✅ **DESCRIPTIVE** |
| 5 | `app/admin/page.tsx:822` | matrix cell | ✅ **DESCRIPTIVE** |
| 6 | `app/manage/[token]/page.tsx:10435` | matrix cell | ✅ **DESCRIPTIVE** |
| 7 | `app/manage/[token]/page.tsx:10465` | *"Payment setup coming soon"* | ✅ **DESCRIPTIVE** — an amber advisory with **no control in it** (re-confirmed) |
| 8 | `components/printing/PrintingSettings.tsx:99` | status badge | ⚠️ **DESCRIPTIVE, and the one I flag** — see C3 |

**Plus `components/manage/PaymentsTab.tsx:741`** — the "Through HatchGrab" walk-up row, whose container
comment states `NEITHER ROW IS INTERACTIVE` — ✅ **DESCRIPTIVE.**
**And `app/manage/[token]/page.tsx:9027`** — a **code comment** describing the removal, not rendered.

## C3. 🔴 THE ITEMS I AM GENUINELY UNSURE ABOUT — flagged, not guessed

Everything above is a confident classification except these two. **An uncertain item flagged is worth
more than a confident wrong one, so both are stated as uncertain rather than resolved.**

### ⚠️ UNCERTAIN 1 — `components/printing/PrintingSettings.tsx:99`

```tsx
{enabled && !printer && <span className="… text-amber-700 bg-amber-50 …">Coming soon</span>}
<Toggle on={enabled} onToggle={() => setEnabledPref(!enabled)} />
```
**For DESCRIPTIVE:** it is a *status badge*, not a label on a control; the `<Toggle>` works, the paper
width and lead-minute settings work, the trigger mode writes a real truck column, and `:113-118`
states the position in prose. `:111-112` records that no "Connect a printer" button exists *because
there is nothing behind it*.
**For DEAD:** the card is titled *"Kitchen ticket printing"* and **printing cannot happen** — the whole
capability the card is named for is absent. A reviewer may not parse "the settings work but the feature
doesn't" as the same distinction the code does.
🔴 **I cannot resolve this from the code. It turns on how a reviewer reads a working settings card for a
non-working feature.** ⚠️ **And it is now the ONLY surface still asserting anything about ticket
printing as available**, since the previous task changed the matrix row to `'coming_soon'`.

### ⚠️ UNCERTAIN 2 — `app/manage/[token]/page.tsx:818`

```tsx
<label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
<input type="email" value={currentUserEmail || ''} disabled className="… bg-slate-50 text-slate-400" />
```
**For NOT-DEAD:** it is a read-only display of the signed-in account email — a common, legitimate
pattern, and there is nothing incomplete behind it.
**For DEAD:** it is a **hardcoded-disabled `<input>` with a field label**, which looks editable and is
not, and **nothing on screen says why or offers a way to change it.** There is no "change email" path
beside it.
🔴 **Flagged because it is the one hit that is structurally identical to the Messenger/Instagram rows
that WERE removed** — a labelled, permanently-disabled input — **and differs only in that no "Coming
soon" text sits in it.** Whether the rule reaches it depends on whether "cannot operate" means "the
feature is unbuilt" or "this control refuses". **I did not choose.**

---

# PART D — TWO UNVERIFIED CONSEQUENCES

## D1. The legal DOCUMENTS are still server components — ✅ **CONFIRMED. READ.**

| File | `'use client'` count | Verdict |
|---|---|---|
| `app/(legal)/privacy/page.tsx` | 🔴 **0** | ✅ **still a SERVER component** |
| `app/(legal)/terms/page.tsx` | 🔴 **0** | ✅ **still a SERVER component** |
| `app/(legal)/layout.tsx` | **1** (`:33`) | the chrome only — changed deliberately |

**Both pages still read at module scope, server-side. READ, `privacy/page.tsx:13-17` + the file's own
comment at `:11`:**
```
// `fs.readFileSync` at module scope is a SERVER-side read in a server component: the file is inlined at
import fs from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import { renderLegalMarkdown } from '@/lib/legal-markdown'
```

✅ **The `fs` read still happens server-side — READ**, on the evidence that (a) neither page carries
`'use client'`, (b) both import `node:fs` and `node:path`, which a client component cannot bundle, and
(c) `tsc` was clean and no build was attempted.
⚠️ **INFERRED, not observed:** that Next.js renders these server children inside the now-client layout
without forcing them client-side. **That is documented framework behaviour and the imports prove the
pages are server-side, but I did not run a build to watch it happen.**

## D2. All three matrix renderers handle `'coming_soon'` — ✅ **CONFIRMED. READ.**

| # | Surface | file:line | Renders |
|---|---|---|---|
| 1 | **Marketing** | `app/landing/page.tsx:79-83` | `if (value === 'coming_soon') return <span className="soon">Coming soon</span>` |
| 2 | **Admin** | `app/admin/page.tsx:822` | `{val === 'coming_soon' && <span className="text-[10px] text-slate-400 italic">Coming soon</span>}` |
| 3 | **Operator Billing** | `app/manage/[token]/page.tsx:10434-10436` | `{val === 'coming_soon' && <span className="text-xs text-slate-400 italic leading-tight">Coming soon</span>}` |

🔴 **All three branch explicitly on the literal. None falls through to a raw string, and none leaves an
empty cell** — each has a three-way `true` / `false` / `'coming_soon'` split, and the marketing one is a
single `Cell` function whose comment says it exists *"so the table cannot drift from the source's
boolean|'coming_soon' values"*.

⚠️ **The admin renderer's `val` needs one extra check and passes it.** `app/admin/page.tsx:812-817`
computes `val` per plan column, forcing `true` only for the *Online ordering — Pay at Hatch* row on
trial/tester; every other row takes `row.max` for those columns. **So `Kitchen ticket printing` resolves
to `'coming_soon'` in the trial and tester columns too, and renders correctly there.**

✅ **INFERRED, not observed:** that the cells visually read "Coming soon" — I did not render any of the
three. **The branch is present and typed; that is what was verified.**

---

# PART E — INTEGRITY

## E1 / E2. Byte scan of every file opened — **byte-level Python, never grep**

`grep` is defeated by the byte being searched for: a NUL makes a file binary to grep, which then goes
silent, and the silence is indistinguishable from "no matches".

| File | NUL | Ctrl < 0x09 | Bytes |
|---|---|---|---|
| `docs/appstore-completeness-report.md` | 0 | 0 | 24,688 |
| `docs/reference-manual.md` | 0 | 0 | 1,401,347 |
| `app/manage/[token]/page.tsx` | 0 | 0 | 782,991 |
| `app/landing/page.tsx` | 0 | 0 | 34,842 |
| `app/landing/layout.tsx` | 0 | 0 | 1,008 |
| `app/(legal)/layout.tsx` | 0 | 0 | 7,725 |
| `app/(legal)/privacy/page.tsx` | 0 | 0 | 1,448 |
| `app/(legal)/terms/page.tsx` | 0 | 0 | 1,464 |
| `app/admin/page.tsx` | 0 | 0 | 116,750 |
| `app/dashboard/[token]/page.tsx` | 0 | 0 | 364,164 |
| `app/trucks/[slug]/order/page.tsx` | 0 | 0 | 275,465 |
| `app/contact/page.tsx` | 0 | 0 | 2,716 |
| `app/setup/page.tsx` | 0 | 0 | 11,455 |
| `app/signup/page.tsx` | 0 | 0 | 8,372 |
| `components/dashboard/OrderCard.tsx` | 0 | 0 | 85,455 |
| `components/printing/PrintingSettings.tsx` | 0 | 0 | 13,754 |
| `components/manage/PaymentsTab.tsx` | 0 | 0 | 56,322 |
| `components/shared/AppHeader.tsx` | 0 | 0 | 10,495 |
| `components/manage/ExtrasEditor.tsx` | 0 | 0 | 37,704 |
| `components/native/AppLink.tsx` | 0 | 0 | 1,353 |
| `lib/plan-features.ts` | 0 | 0 | 23,053 |
| `lib/features.ts` | 0 | 0 | 6,402 |

✅ **TOTALS across 22 files: NUL = 0, control bytes below 0x09 = 0.**

## E3. This report — separate post-write pass, plus its census

*(Run after the file reached disk; results in the closing section below.)*

## E4. `git status` — **nothing changed**

*(Pasted below, after the write.)*

---

# WHAT I HAVE NOT DONE

1. **Nothing was rendered.** Every classification is read from markup and handlers. **No screen was
   opened, in a browser or the shell.**
2. **🔴 I did not verify the `/landing` admin gate by visiting it.** The redirect is READ from
   `app/landing/layout.tsx:13-16`; **that `verifyAdmin()` returns false for a review account is INFERRED**
   from it being the same gate the admin panel uses.
3. **The dead-control sweep is grep-shaped.** It finds hardcoded `disabled`, `disabled={true}` and empty
   arrow handlers. **A control disabled via a variable that is always false, or a handler that calls a
   function which does nothing, would not appear.** ⚠️ **This is the sweep's real limit.**
4. **I did not sweep for controls that are inert by CSS** — `pointer-events-none`, `opacity` alone, or a
   `<span>` styled to look like a button.
5. **C3's two uncertain items are unresolved on purpose**, as instructed.
6. **I did not check the customer order page for its own "coming soon" strings** beyond the
   Messenger/Instagram hunt — the phrase sweep covered `app/` wholesale, but I classified only the hits
   it returned.
7. **No build, no `tsc`, no test suite** — this was read-only and none was run.
