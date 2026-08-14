# App Store Guideline 2.1 — completeness pass

Date: 14 August 2026
Status: VERIFIED, then EDITED, then a read-only diagnosis. **Four files changed.**
`tsc --noEmit` clean. Non-ASCII census **unchanged in all four**. **0 NUL bytes, 0 control bytes < 0x09.**

No `next dev`, no `next build`, no `cap sync`, no deploy, no commit, no migration.

**Nothing in the prompt arrived garbled. No instruction contradicted another.**

🔴 **THE RULE APPLIED, AND THE ONLY ONE:** *"Coming soon" against a FACT ABOUT A PLAN stays. "Coming
soon" against a CONTROL a user can see and cannot operate goes.* **No roadmap label was removed from the
plan matrix.** The one matrix value that changed (B3) went the other way — from a tick to a roadmap
label, because the tick was the false claim.

🔴 **LIVE CUSTOMERS: nothing Pizzeria Gusto or Tikka Tonic can DO has changed.** Every edit is
display-only. **No gate was touched** — `canAccess`, `hasFeature` and `lib/features.ts` are not in the
diff. Evidence per edit below.

---

# PART A — VERIFICATION, BEFORE ANY EDIT

## A1. The dead rows and the live row, side by side — **READ**

### 🔴 DEAD — Messenger, `app/manage/[token]/page.tsx:9026-9041` (as it was)

```tsx
{/* Messenger */}
<div className="flex items-center gap-2">
  <label className="text-sm text-slate-600 w-20 flex-shrink-0">Messenger</label>
  <input
    type="text"
    disabled
    placeholder="Coming soon"
    className="flex-1 min-w-0 truncate border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
  />
  <button
    disabled
    className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-slate-200 text-slate-400 rounded-xl whitespace-nowrap cursor-not-allowed"
  >
    Connect
  </button>
</div>
```

### 🔴 DEAD — Instagram, `:9043-9059` (as it was)

```tsx
{/* Instagram */}
<div className="flex items-center gap-2">
  <label className="text-sm text-slate-600 w-20 flex-shrink-0">Instagram</label>
  <input
    type="text"
    disabled
    value=""
    placeholder="Coming soon"
    className="flex-1 min-w-0 truncate border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
  />
  <button
    disabled
    className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-slate-200 text-slate-400 rounded-xl whitespace-nowrap cursor-not-allowed"
  >
    Connect
  </button>
</div>
```

**Every element, disabled state and placeholder:**

| Row | `<label>` | `<input>` | `<button>` |
|---|---|---|---|
| Messenger | `Messenger` | `type="text"` · 🔴 **`disabled`** · 🔴 **`placeholder="Coming soon"`** | 🔴 **`disabled`**, label `Connect` |
| Instagram | `Instagram` | `type="text"` · 🔴 **`disabled`** · `value=""` · 🔴 **`placeholder="Coming soon"`** | 🔴 **`disabled`**, label `Connect` |

⚠️ **The Instagram input additionally hardcodes `value=""`** — a controlled input permanently pinned
empty. Neither row has an `onChange`, an `onBlur`, a handler, or a gate.

### ✅ LIVE — WhatsApp, `:8968-9024` (unchanged by this work)

```tsx
{/* WhatsApp */}
<div>
  <div className="flex items-center gap-2">
    <label className="text-sm text-slate-600 w-20 flex-shrink-0">WhatsApp</label>
    {can('whatsapp_replies') ? (
      <>
        <input
          type="tel"
          value={whatsappSender}
          onChange={e => setWhatsappSender(e.target.value)}
          onBlur={saveWhatsappSender}
          placeholder="+447700900000"
          className="flex-1 min-w-0 truncate border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <button
          onClick={saveWhatsappSender}
          className="flex-shrink-0 text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
        >
          Connect
        </button>
      </>
    ) : (
      <>
        <input type="tel" disabled placeholder="+447700900000" className="… bg-slate-50 text-slate-400 cursor-not-allowed" />
        <FeatureGate feature="whatsapp_replies" plan={truck.plan} overrides={truck.feature_overrides} trialExpiresAt={truck.trial_expires_at} showUpgrade={true} />
      </>
    )}
  </div>
  …
</div>
```

🔴 **THE DIFFERENCE, STATED PRECISELY.** The WhatsApp row is disabled **only when a PLAN GATE says so**
(`can('whatsapp_replies')`), and when disabled it shows a `<FeatureGate>` explaining why and offering the
upgrade. **Its placeholder is a real example number, never "Coming soon".** The Messenger and Instagram
rows are disabled **unconditionally, because the feature does not exist** — no gate, no explanation, no
path to enabling them. **The first is a plan boundary; the second is an unfinished feature.**

## A2. Is `lib/plan-features.ts` display-only? — 🔴 **YES. B3 is permitted.** **READ**

**Direction of dependency, traced both ways:**

- **Nothing gates on it.** Its four importers are `app/landing/page.tsx:21`, `app/admin/page.tsx:9`,
  `app/manage/[token]/page.tsx:24`, `components/manage/PaymentsTab.tsx:35` — **all importing
  `PLAN_PRICES` / `PLAN_DESCRIPTIONS` / `FEATURE_SECTIONS` / `FOOTNOTES` / `TRANSACTION_ROWS` / fee
  labels, i.e. rendering values only.**
- **`lib/features.ts` — the enforcement gate — does NOT import `plan-features`.** Its only mention is a
  comment at `:137`. **The gate cannot see the matrix.**
- **The file says so itself, `:229-232`:**
  > *"This file (PRESENTATION) and lib/features.ts (the ENFORCEMENT gate — PLAN_FEATURES / canAccess) are
  > two hand-maintained records… They LEGITIMATELY differ on 'coming_soon' (no gate equivalent)…"*

⚠️ **It DOES import `canAccess`, and that could be misread as a gate. It is the opposite — a DRIFT
GUARD reading the gate to validate the matrix**, `:267-282`:
```ts
export function findPlanParityViolations(): string[] {
  …
      for (const tier of tiers) {
        if (row[tier] === true && !canAccess(tier, feature)) {
          out.push(`"${row.name}" advertised for ${tier} but canAccess('${tier}','${feature}') is false`)
        }
      }
  …
}
```
**The arrow points matrix ← gate, never matrix → gate.**

✅ **And the guard cannot fire on B3:** it inspects only cells that are hard `true`. Turning `true` into
`'coming_soon'` **removes a check**; it cannot create a violation. **INFERRED** from the condition, which
is quoted above — I did not execute it.

## A3. `AppHeader` — 🔴 **B1 IS PERMITTED. Verified, not assumed.** **READ**

**The component is `'use client'` (`:5`)** and its logo currently reads:
```tsx
<Link href="/" className="shrink-0 z-10">
  <img src={HATCHGRAB_WORDMARK_WHITE_SVG} alt="HatchGrab" width={140} height={31}
       className="object-contain w-[112px] md:w-[140px] h-auto" />
</Link>
```

**Is it rendered on the first paint? — NO, on all three renderers. Each gates it behind a loading
early-return whose state starts `true`:**

| Renderer | State | Initialised | Early-return | `<AppHeader` |
|---|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | `loading` | `useState(true)` **:265** | **:2395** | :2612 |
| `app/manage/[token]/page.tsx` | `loading` | `useState(true)` **:200** | **:508** | :556 |
| `app/admin/page.tsx` | `checkingSession` | `useState(true)` **:203** | **:654** | :717 |

🔴 **CONCLUSION: AppHeader appears in NO server output and on NO first client frame.** The server renders
the spinner, the first client render renders the spinner, and AppHeader mounts only on a later render —
which is not hydration. **A client-only `isNativeApp()` inside it therefore cannot produce an SSR/client
mismatch.** This is exactly the property manual section 40 records for the manage page:

> *"The manage page's `loading` state starts `true` and the component early-returns a spinner before any
> of it. The first client render is therefore already post-mount, so direct inline evaluation of the
> predicate cannot flash a CTA for a frame — and no `mounted` flag is needed."*

⚠️ **This makes B1 the EASY case and B2 the hard one — see B2.**

## A4. The existing helper — **READ**

`lib/native/device.ts:20-23`:
```ts
/** True inside the native iOS shell. */
export function isNativeApp(): boolean {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()
}
```
**Import path: `@/lib/native/device`** — the path already used by `app/app/page.tsx:8`,
`app/dashboard/[token]/page.tsx:52`, `app/dashboard/[token]/kds/page.tsx:34`, `app/login/page.tsx:6`,
`components/WebOfflineBanner.tsx:10`.

✅ **No new platform check was written.**
✅ **`purchaseCtaAllowed()` was NOT used or extended** — it is the 3.1.1 commerce predicate and this is a
2.1 completeness question. Section 40 keeps them separate; the code comments I added say so at both sites.

---

# PART B — THE EDITS

## B1. `components/shared/AppHeader.tsx` — logo non-navigating in the app

**Before** (`:64`): `<Link href="/" className="shrink-0 z-10">` wrapping the `<img>`.

**After:** a ternary. `isNativeApp()` → a `<span className="shrink-0 z-10">` with the **identical
`<img>`**; otherwise the **original `<Link>` element, byte-for-byte**.

```tsx
{isNativeApp() ? (
  <span className="shrink-0 z-10">
    <img src={HATCHGRAB_WORDMARK_WHITE_SVG} alt="HatchGrab" width={140} height={31}
         className="object-contain w-[112px] md:w-[140px] h-auto" />
  </span>
) : (
<Link href="/" className="shrink-0 z-10">
  …unchanged…
</Link>
)}
```

✅ **Web is byte-identical** — `isNativeApp()` is `Capacitor.isNativePlatform()`, false in every browser.
✅ **Same markup, same visual result** — same `<img>`, same `src`, same classes, same 112/140px sizing.
✅ **No `mounted` flag**, per A3, and the code comment records the three early-returns that make that safe
**and** warns that dropping any of them turns this into a hydration mismatch.
✅ **NOT repointed at `/app`**, as instructed.

## B2. `app/(legal)/layout.tsx` — 🔴 SAME GOAL, MATERIALLY DIFFERENT MECHANISM. READ THIS.

**Before** (`:40`):
```tsx
<Link href="/landing" className="inline-flex hover:opacity-80 transition-opacity" aria-label="HatchGrab home">
  <HatchGrabWordmark variant="dark" className="h-8 w-auto sm:w-[168px] sm:h-auto" />
</Link>
```

🔴 **THE BRIEF SAID "same treatment, same reason". THE TREATMENT COULD NOT BE THE SAME, AND THE REASON IS
A3's OWN FINDING.** This layout was a **SERVER component** with no loading gate — **it IS the first paint
of `/privacy` and `/terms`.** A3 explicitly routes on this: a client-only check on a server-rendered
surface is a hydration mismatch. So B1's direct call was not available here.

**Two changes were required, both inside the one named file:**

1. **`'use client'` added.** ⚠️ **This converts the legal chrome from server- to client-rendered.**
   **The documents themselves are unaffected** — `/privacy` and `/terms` remain server components doing
   `fs.readFileSync` at build time and arrive as `children`, which a client layout renders without
   forcing them client-side. All three existing imports (`next/link`, `HatchGrabWordmark`, two string
   constants from `lib/legal`) are client-safe.
2. **A `mounted` two-pass:**
   ```tsx
   const [mounted, setMounted] = useState(false)
   useEffect(() => { setMounted(true) }, [])
   const inApp = mounted && isNativeApp()
   ```

⚠️ **Section 40 REJECTS a `mounted` flag for the manage page's commerce gates** — there it would render
nothing on the first client frame on every platform, i.e. flash *missing* upgrade buttons on the web.
🔴 **That objection does not transfer, and the difference is why this is acceptable:** here the two
branches are **visually identical** — same wordmark, same `variant="dark"`, same classes, same size — and
differ only in whether a tap navigates. **The two-pass costs nothing a user can see.**

**Why this page specifically:** it is the **App-Store-required in-app legal link**, so it is the one page
a reviewer is guaranteed to open — and `/landing` is the marketing page carrying four "Coming soon"
strings. **The shortest route from the compliance surface to the roadmap copy ran through this logo, with
no back button to return.**

## B3. `lib/plan-features.ts` — the ticket-printing tick

**Before** (`:149`):
```ts
{ name: 'Kitchen ticket printing',  footnote: '5', detail: 'Print order tickets to a thermal printer in the kitchen.', starter: false, pro: false, max: true },
```
**After:** `max: 'coming_soon'`. **Nothing else on the row changed** — same `name`, same `footnote`, same
`detail`, same `starter: false`, same `pro: false`.

🔴 **THE TICK WAS FALSE, AND THE PRODUCT'S OWN SETTINGS CARD ALREADY SAID SO.**
`components/printing/PrintingSettings.tsx:83` — **READ**:
> `// 🔴 NO connect(). It used to write 'Demo printer (Phase A stub)' and manufacture a connected state.`

and `:113-118` renders *"Bluetooth printer pairing isn't available yet"*. **The matrix asserted `true`
for the same capability the settings card calls unbuilt.**

✅ **Display-only, per A2.** ✅ **This is the only matrix value that changed.**

## B4. `app/manage/[token]/page.tsx` — the two dead rows removed

**Both `<div>`s went whole (`:9026-9059`), replaced by a comment.** What remains:

| Element | Kept? |
|---|---|
| `border-t border-slate-100 pt-4 mt-1` divider | ✅ kept |
| `Auto-replies` heading | ✅ kept |
| `Requires Business accounts on each platform.` caption | ✅ kept |
| `space-y-3` wrapper | ✅ kept — now holds exactly **one** child |
| 🔴 **The WhatsApp row** | ✅ **kept, untouched, still functional** |
| Messenger row | 🔴 **removed** |
| Instagram row | 🔴 **removed** |

✅ **No empty bordered box, no orphaned heading, no dangling divider** — the heading and divider still
have the live WhatsApp row beneath them, which is what they label.
✅ **UI removal only.** `git diff` on this file touches **no** type, column or allow-list:
`social_instagram`, `social_facebook`, `whatsapp`, `whatsapp_sender` remain on the `Truck` interface and
are still written by the Contact Details fields above.

---

# PART C — READ-ONLY DIAGNOSIS

## C1. `app/manage/[token]/page.tsx:10465` — ✅ **NOTICE. KEEP.**

```tsx
const billingCard = (
  <div className="bg-white border border-slate-200 rounded-2xl p-6">
    <p className="text-sm font-semibold text-slate-900 mb-4">Billing &amp; payments</p>
    <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-3">
      <span className="text-amber-500 flex-shrink-0 mt-0.5">⚙️</span>
      <div>
        <p className="text-sm font-medium text-amber-800">Payment setup coming soon</p>
        <p className="text-xs text-amber-700 mt-0.5">
          We&apos;re setting up our payment system. During early access, billing is handled manually.
          We&apos;ll contact you when automated billing is ready.
        </p>
      </div>
    </div>
```

🔴 **There is no control here at all** — no `<input>`, no `<button>`, no toggle, no `disabled` anything.
It is an `<p>` inside an amber advisory box explaining that billing is handled manually and that the
operator will be contacted. **It describes a process, and the process it describes is TRUE and currently
in effect.** Under the rule, this is a fact, not a dead control. **Keep.**

## C2. `components/printing/PrintingSettings.tsx:99` — ⚠️ **A BADGE ON A LIVE CARD. KEEP — but it is the closest call of the three.**

```tsx
{enabled && printer && <span className="… text-green-700 bg-green-50 …">● Connected</span>}
{enabled && !printer && <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Coming soon</span>}
<Toggle on={enabled} onToggle={() => setEnabledPref(!enabled)} />
```

**It is a STATUS BADGE, not a label on a dead control**, and the card around it genuinely works —
`:104-119` and the comment at `:105-109`:
> *"THE SETTINGS ARE REACHABLE WHETHER OR NOT A PRINTER IS PAIRED… Paper width and lead minutes are
> device values and the trigger mode is a truck column; none of them needs a printer to be meaningful,
> and all of them can be set up before the hardware arrives."*

**The `<Toggle>` operates, the paper-width and lead-minute settings operate, and the trigger mode writes
a real truck column.** And `:113-118` already states the honest position in prose: *"No printer
connected. Bluetooth printer pairing isn't available yet — you can set your preferences here now."*

⚠️ **Why it is the closest call:** the card's heading is *"Kitchen ticket printing"* and the printing
itself cannot happen. **A reviewer could read the whole card as an unfinished feature.** But there is no
control here that invites an action and refuses it — the one thing that does not exist (pairing) has no
button, which `:111-112` records as deliberate: *"No 'Connect a printer' button, because there is nothing
behind it."* **Under the stated rule, keep. Flagging it as the one I would re-examine if 2.1 comes back.**

## C3. `components/manage/PaymentsTab.tsx:741` — ✅ **A ROADMAP LABEL IN A NON-INTERACTIVE LIST. KEEP.**

```tsx
<div className="flex items-start gap-2 opacity-60">
  <span className="mt-0.5 w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
  <span className="text-sm min-w-0">
    <span className="font-medium text-slate-700">Through HatchGrab</span>
    <span className="ml-2 align-middle text-[11px] font-bold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">
      Coming soon
    </span>
```

🔴 **The container's own comment settles it — `:719`: `NEITHER ROW IS INTERACTIVE.`** The radio-looking
circle at `:737` is a **`<span>`**, not an input — it is a bullet drawn to look like a radio, in a
two-row comparison of how walk-up payments can be taken. The sibling row ("Your own card terminal")
carries a `Current` badge and is equally non-interactive.

**This is a plan/product comparison — descriptive information — and the rule keeps it.** ⚠️ It is the
same shape as a matrix row, rendered outside the matrix.

## C4. What `/` actually renders — 🔴 **THE VILLAGE FOODIE CONSUMER DISCOVERY MAP.**

**READ** — `app/page.tsx:384` `export default function Home()`, a `'use client'` component whose data
comes from `useVillageData` (`:51`) and which renders `EventListCard` (`:342`) and `Footer` (`:9`). Its
brand mark at `:194` is:
```tsx
<Image src="/logos/village-foodie-logo-v2.png" alt="Village Foodie Logo" width={200} height={60} priority className="object-contain w-[140px] md:w-[170px] h-auto" />
```

🔴 **It is NOT a HatchGrab page, and it is NOT `/landing`.** `grep` for `/landing` or `hg-landing` in
`app/page.tsx`: **no matches.**

**So an operator tapping the brand logo on the WEB lands on a consumer-facing map of food-truck events
in villages, branded Village Foodie — a different product's front door.** ⚠️ **That is arguably wrong on
the web too**, but the web has a back button and browser chrome, so it is a navigation annoyance rather
than a trap. **B1 changed only the native case, as instructed. The web behaviour is unchanged and is
flagged here, not fixed.**

⚠️ **Earlier work traced the LINK and never the DESTINATION** — that is what this item corrects.
🔴 **Note the two destinations differ:** `AppHeader` → `/` (Village Foodie map); legal layout →
`/landing` (HatchGrab marketing). **They were reported as one problem and are two.**

---

# PART D — INTEGRITY

## D1 / D2. Non-ASCII census, before and after

| File | Bytes before → after | Distinct before → after | GAINED | LOST |
|---|---|---|---|---|
| `components/shared/AppHeader.tsx` | 7,928 → **10,495** | 7 → **7** | ✅ none | ✅ none |
| `app/(legal)/layout.tsx` | 4,506 → **7,725** | 8 → **8** | ✅ none | ✅ none |
| `lib/plan-features.ts` | 21,839 → **23,053** | 12 → **12** | ✅ none | ✅ none |
| `app/manage/[token]/page.tsx` | 782,853 → **782,991** | 176 → **176** | ✅ none | ✅ none |

**Every difference explained:** the per-codepoint counts rose only for `—` (U+2014), `─` (U+2500),
`⚠` (U+26A0) + its variation selector (U+FE0F), `🔴` (U+1F534) and `→` (U+2192) — **all of them
characters already present in each file, and all of them in the explanatory comments added by B1–B4.**
`app/manage/[token]/page.tsx` is the only file whose byte count barely moved (+138) because B4 **removed**
34 lines of JSX and added a comment. **No codepoint was lost anywhere, which is the half that would
reveal a mojibake round-trip.**

⚠️ **THE CENSUS CAUGHT ME, AND IT WAS A REAL VIOLATION.** My first draft of B1's comment cited
*"section 40"* using the **§** symbol. `components/shared/AppHeader.tsx` **has never contained U+00A7**,
so the file went 7 → 8 distinct codepoints. **Both occurrences were rewritten as the words "manual
section 40" before anything else**, and the file is back to its original 7. **Without the census this
would have shipped unnoticed** — it compiles, it renders, and nothing else looks at it.

## D3. Byte-level scan — NUL and control bytes < 0x09

**Tool: Python, reading bytes and counting directly. Never grep** — grep treats a NUL-bearing file as
binary and goes silent, so searching for the byte with grep asks a tool to report the exact condition
under which it stops reporting.

| File | NUL (0x00) | Control < 0x09 | Bytes |
|---|---|---|---|
| `components/shared/AppHeader.tsx` | **0** | **0** | 10,495 |
| `app/(legal)/layout.tsx` | **0** | **0** | 7,725 |
| `lib/plan-features.ts` | **0** | **0** | 23,053 |
| `app/manage/[token]/page.tsx` | **0** | **0** | 782,991 |

**This report is scanned as a separate pass after writing — result at the end.**

## D4. `git status` and `git diff --stat`

```
$ git status --porcelain
 M app/(legal)/layout.tsx
 M app/manage/[token]/page.tsx
 M components/shared/AppHeader.tsx
 M lib/plan-features.ts
?? docs/appstore-report.md

$ git diff --stat
 app/(legal)/layout.tsx          | 49 ++++++++++++++++++++++++++++++++++++----
 app/manage/[token]/page.tsx     | 50 +++++++++++++----------------------------
 components/shared/AppHeader.tsx | 34 ++++++++++++++++++++++++++++
 lib/plan-features.ts            | 14 +++++++++++-
 4 files changed, 108 insertions(+), 39 deletions(-)
```

✅ **Exactly the four files B1–B4 name.** ⚠️ `?? docs/appstore-report.md` is the **untracked report from
the previous task**, not a change from this one.

🔴 **`lib/features.ts` IS NOT IN THE DIFF.** Neither is any API route, migration, or `canAccess` call
site. **No gate changed.**

## D5. tsc

✅ **`npx tsc --noEmit` — clean, exit 0**, after every edit and again at the end.

🔴 **TSC-CLEAN IS NOT VERIFICATION. It means the code COMPILES and nothing more.** It does not prove the
logo renders, that the native branch is ever taken, that the legal layout hydrates without warning, that
the matrix cell reads "Coming soon", or that the Auto-replies section looks right with one row instead of
three. **Nothing here was rendered.**

---

# 🔴 WHAT I HAVE NOT EXERCISED

1. **NOTHING WAS RENDERED. No browser, no simulator, no iPad.** Every claim about appearance is read from
   classes and markup.
2. **🔴 THE NATIVE BRANCH HAS NEVER EXECUTED.** `isNativeApp()` returning `true` is a path I cannot reach
   without the shell. **Both B1 and B2's native renderings are unobserved.**
3. **🔴 B2's HYDRATION IS REASONED, NOT OBSERVED.** The `mounted` two-pass is the standard remedy and the
   two branches are visually identical, **but I did not load `/privacy` and watch for a hydration
   warning** — and I converted a server component to a client one to do it.
4. **I did not verify the legal DOCUMENTS still render server-side after that conversion.** Next.js
   supports server children under a client layout; **INFERRED, not tested.**
5. **The drift guard was not run.** A2's conclusion that B3 cannot trip `findPlanParityViolations()` is
   read from the condition, not from executing it. ⚠️ **It throws in dev on violation, so a dev boot
   would settle it in seconds.**
6. **I did not check whether any OTHER surface renders the Messenger/Instagram rows.** B4 removed them
   from `app/manage/[token]/page.tsx`; **I did not grep the customer side or the setup wizard for a
   near-duplicate.** ⚠️ **This codebase has near-duplicate operator/customer implementations and I did
   not rule one out here.**
7. **C1–C3 are judgements against the stated rule**, not quoted guideline text. C2 is the one I would
   re-open first.
8. **No test suite was run**; I did not look for one covering any of these files.
