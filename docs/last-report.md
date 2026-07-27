# Last report — Privacy-line trim + displayTruckName in discovery metadata

**Date:** 2026-07-27 · **Files touched:** `components/DemoGetStarted.tsx`, `app/trucks/[slug]/page.tsx`
**Verification:** `npx tsc --noEmit` → **clean, zero errors.** No `next dev`, no `next build`, as
instructed.

This report **overwrites** the previous one (the customer order page demo fixes of 2026-07-27), per
the rolling convention.

**Prompt integrity:** no garbles this time. The prompt arrived intact.

---

# 1. PRIVACY LINE — "and get you set up" removed from the `!canSetup` branch

**Site:** `components/DemoGetStarted.tsx:919` (the ternary inside the landing / email-capture view).

### Before

```jsx
<p className="text-xs text-slate-400">
  We&apos;ll only use this to {canSetup ? 'set up your truck and send your demo link' : 'send your demo link and get you set up'} — see our{' '}
```

### After

```jsx
<p className="text-xs text-slate-400">
  We&apos;ll only use this to {canSetup ? 'set up your truck and send your demo link' : 'send your demo link'} — see our{' '}
```

**The `canSetup` half is byte-identical** — `'set up your truck and send your demo link'`, untouched.
There, setting them up genuinely is what happens next: the wizard's step-1 → step-3 path creates the
account, the operator and the truck. The promise matches the action.

### What the branch reads as now, end to end

On the customer order page (slug, no token → `canSetup` false):

```
Save your demo
We'll keep it for 14 days and email you a link straight back.

[ email input: you@yourtruck.co.uk ]
We'll only use this to send your demo link — see our privacy policy.

[            Send me the link            ]
```

**Heading, body, notice and button now all describe one action.** With the free-month line removed
last task and this clause removed now, there is no remaining reference on this branch to setting up,
signing up, a trial, or a clock. The privacy notice states exactly one use of the address, and it is
the use the button performs.

The reasoning is recorded above the line (`:912–917`) so it doesn't get "improved" back:

```jsx
/* … The !canSetup half names ONLY what actually happens on this surface: we send the
   demo link. It used to add "and get you set up", which — like the free-month line
   removed just above — described a path this branch doesn't offer. A privacy notice
   that overstates what you'll be contacted about is the one line that must not. */
```

That last sentence is the point worth keeping: of everything on this modal, a **privacy notice** is
the one element where overstating the use of a collected address is a compliance problem rather than
a copy problem.

---

# 2. `displayTruckName()` APPLIED TO THE DISCOVERY-PROFILE METADATA

**Site:** `app/trucks/[slug]/page.tsx`, `generateMetadata` — import added at `:4`, the derived name at
`:57`, applied to all six interpolation sites at `:60–79`.

```jsx
const name = displayTruckName(truck.name);

return {
  title: `${name} | Village Foodie`,
  description: `Check out where ${name} is pitching up next! 🚚`,
  openGraph: {
    title: `${name} Schedule`,
    description: `Check out where ${name} is pitching up next! 🚚`,
    url: `${baseUrl}/trucks/${resolvedParams.slug}`,
    siteName: 'Village Foodie',
    images: imageUrl ? [{ url: imageUrl, alt: `${name} Logo` }] : [],
    locale: 'en_GB',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${name} Schedule`,
    description: `Check out where ${name} is pitching up next! 🚚`,
    images: imageUrl ? [imageUrl] : [],
  },
};
```

### Confirmed: nothing else in that metadata carries the raw name

`grep -n "truck.name" app/trucks/[slug]/page.tsx` returns **exactly one line — `:57`, the strip call
itself.** Every one of the six previous sites is now `${name}`:

| Site | Field |
| --- | --- |
| `:60` | `title` — the browser tab |
| `:61` | `description` — the meta description / search snippet |
| `:63` | `openGraph.title` — the WhatsApp / Facebook card heading |
| `:64` | `openGraph.description` — the card body |
| `:67` | `openGraph.images[].alt` — the card image alt text |
| `:75`, `:76` | `twitter.title`, `twitter.description` |

The only other interpolations in the object are `baseUrl`, `resolvedParams.slug` and `imageUrl` —
none derived from the name. The early return at `:42–44` is the static
`{ title: 'Food Truck | Village Foodie' }` and carries no name at all.

### ⚠️ A correction I owe you on the premise — this was never a reachable leak

**I called this a leak in the last report. It is not one, and I should have checked before saying so.**

`getTruckMeta` (`:9–35`) does not read `trucks.name` from the database. It fetches a **Google Sheets
CSV** (`TRUCKS_CSV_URL`, `:6`) and matches by `createSlug(rawName) === slug`. A demo truck is
provisioned into Postgres and never appears in that sheet, so for any `demo-…` slug `getTruckMeta`
returns `null` and the metadata is the generic `'Food Truck | Village Foodie'`. **The `(ce1kh2)`
suffix could not have reached this page's tab title, OG card or Twitter card by any route.**

Your reasoning for the change — that metadata travels further than on-page text — is exactly right in
general, and it is why the same fix mattered on the order page. It just doesn't bite here, because
the name on this page comes from a different source entirely.

**I applied the change as asked**, and it is defensible as hygiene: if a sheet row ever carried a
trailing parenthetical code, the strip catches it, and the file now can't disagree with the order
page about how a truck name is displayed.

**But there is a real cost to weigh, and it lands on live trucks, not demos.** `displayTruckName`
strips *any* trailing `(...)` — it has no demo check, by design (documented in `lib/demo.ts`). So a
real truck trading as, say, **"Nonna's (Wood Fired)"** now loses that suffix from its browser tab,
its WhatsApp preview and its Twitter card. On the order page that trade-off was worth it because the
demo suffix genuinely arrives there. Here it is pure downside with no upside.

**My recommendation: revert this one.** It is a two-line revert (`:4` and `:57`, then `${name}` →
`${truck.name}` at six sites). I have left it applied because you asked for it explicitly and the
risk is narrow — but you now have the fact I was missing when I flagged it, and the call is yours.

---

# 3. OTHER SERVER-RENDERED METADATA / OG / TITLES USING A RAW TRUCK NAME

I swept every `generateMetadata`, `export const metadata`, `openGraph` block and `document.title`
assignment in the repo.

### The full inventory

| Location | Uses a truck name? | Verdict |
| --- | --- | --- |
| `app/trucks/[slug]/page.tsx:38` | Yes — from the CSV | **Fixed this task** (§2) |
| `app/venues/[slug]/page.tsx:66` | **No** — `venue.name` throughout (`:95–110`) | Not applicable. Venue names have no code suffix and no demo equivalent. |
| `app/layout.tsx:17` | No — `siteName`, host-derived ("HatchGrab" / "Village Foodie") | Clean |
| `app/landing/page.tsx:30` | No — static | Clean |
| `app/privacy/page.tsx:21`, `app/terms/page.tsx:18`, `app/hire/page.tsx:4` | No — static | Clean |

### ⚠️ One title outside the metadata system — the KDS browser tab

`app/dashboard/[token]/kds/page.tsx:335`:

```js
useEffect(() => {
  if (truck?.name) document.title = `${truck.name} Kitchen`
}, [truck?.name])
```

**This one is reachable in demo.** The kitchen screen is part of the demo loop — the welcome popup
sends visitors to it — so a demo visitor's browser tab reads **"Demo Kitchen (ce1kh2) Kitchen"**.

**Not fixed**, for three reasons, and I'd rather you decide than have me widen the task:

1. **It is not server-rendered metadata**, which is what item 3 asked me to report on. It is a
   client-side `document.title` assignment, so it never reaches a link preview or a scraper — it is
   visible only in the tab of the person already looking at the screen.
2. **The KDS is operator-facing.** Unlike "Order from Demo Kitchen (ce1kh2)" on the customer page,
   the audience here is the prospect evaluating the product, not a customer being asked to trust a
   business with a serial number in its name. It reads as untidy rather than as damaging.
3. It also has a mild redundancy independent of demo — `"Demo Kitchen (ce1kh2) Kitchen"` says
   "Kitchen" twice, which stripping the code would only partly fix.

**One line if you want it:** `document.title = \`${displayTruckName(truck.name)} Kitchen\``, plus the
import. Say so and I'll do it.

### Also checked and clear

- **`app/trucks/[slug]/order/page.tsx`** — the page you had me fix last task. It is `'use client'`
  with no `generateMetadata` and there is no `layout.tsx` under `app/trucks/`, so its tab title falls
  through to the root layout's static default. **No truck name in its metadata at all**, which is why
  the on-page strip was the whole fix.
- **No other `document.title` assignment exists** anywhere in `app/` or `components/`.

---

## 4. Files changed

| File | Change |
| --- | --- |
| `components/DemoGetStarted.tsx` | +8/−2 at `:912–919`. `'and get you set up'` dropped from the `!canSetup` half of the privacy ternary; reasoning comment added. `canSetup` half untouched. |
| `app/trucks/[slug]/page.tsx` | +15/−7. `displayTruckName` import at `:4`; derived `name` at `:57`; six metadata sites switched from `truck.name` to `name`. |
| `docs/last-report.md` | This file, overwritten. |

---

## 5. What I could not do / did not do

- **Could not run `next dev` or `next build`** — instructed not to. `npx tsc --noEmit` is clean. Both
  changes are string-level and neither touches layout, so there is little for an eyeball to add;
  the one thing worth a look eventually is a real truck's link preview, if you keep §2 (see below).
- **Flagged rather than reverted §2 myself.** The discovery-profile metadata reads a Google Sheet, not
  `trucks.name`, so no demo truck can ever reach it — the leak I reported last task was not real, and
  the change I just made can only affect live trucks with a legitimate trailing parenthetical. Applied
  as instructed; **I recommend reverting it**, and it's a two-line revert.
- **Did not fix the KDS `document.title`** (`kds/page.tsx:335`) — reported in §3 with the one-line fix
  spelled out. It is client-side, operator-facing, and outside what item 3 scoped.
- **Did not touch `app/venues/[slug]/page.tsx`** — it carries venue names, not truck names.
- **Did not commit anything.** The working tree still carries this session's earlier edits
  (`docs/android.md`, `docs/android-report.md`, `components/dashboard/DemoWelcome.tsx`,
  `app/dashboard/[token]/page.tsx`, `app/trucks/[slug]/order/page.tsx`, `lib/demo.ts`,
  `components/DemoModeBanner.tsx`) — all unstaged.
