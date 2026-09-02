# /compare — admin gate removed, noindex added, host-gated to HatchGrab

**Built. Not deployed, not committed. No SQL, no migrations. One file changed:
`app/compare/page.tsx`.**

**GARBLED SPANS: none.** No instruction contradicted another.

**VERIFICATION.** Not a typecheck. Every claim below was **measured against a running server**, including
the page fully rendered with the flag on — see "How I rendered it".

---

## 1. The admin gate is gone. What is left, and what a visitor gets today.

**Removed** from `app/compare/page.tsx`:

```ts
if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) redirect('/contact')
```

**Two gates remain, in this order:**

```ts
// 1. BRAND — the page does not exist on Village Foodie
if (!(await onHatchGrab())) notFound()

// 2. PRICING PUBLICATION — unchanged, travelled with the file from /landing/cost
if (!PRICING_PUBLISHED && !(await verifyAdmin())) redirect('/contact')
```

`PRICING_PUBLISHED` is `process.env.NEXT_PUBLIC_PRICING_PUBLISHED === 'true'` (`lib/pricing.ts:7`).

### What an anonymous visitor gets today, with the flag unset — **measured**

| Host | Result |
|---|---|
| `hatchgrab.*` | **307 → /contact** (gate 2: flag off, no admin session) |
| `villagefoodie.*` | **404** (gate 1: wrong brand) |
| `localhost` / anything else | **404** (gate 1 — not a hatchgrab host) |

🔴 **The flag is now the whole answer on hatchgrab.com.** It no longer waits for the landing's embargo
and no longer needs an admin session. ⚠️ **Note what that switch does elsewhere**: flipping
`NEXT_PUBLIC_PRICING_PUBLISHED` to `'true'` publishes this page *and* un-masks prices in Manage →
Billing, FeatureGate and the van add-on at the same instant. One switch, two jobs.

---

## 2. noindex — added, and confirmed in the served HTML

**Added** to `app/compare/page.tsx`:

```ts
export const metadata = {
  robots: { index: false, follow: false },
}
```

**Confirmed in the HTML the server actually sent** (page rendered with the flag on):

```html
<meta name="robots" content="noindex, nofollow">
```

`follow: false` as well as `index: false` — the page links to `/signup` and `/contact`, and there is no
reason to pass crawl signal on while it is not meant to be found.

⚠️ **This does not make it private.** noindex is a request to well-behaved crawlers and nothing more.
Gate 2 is what stops people; this only stops the page turning up in a search result. It also matches the
landing page it belongs beside, which carries `robots: { index: false, follow: false }` at
`app/landing/page.tsx:48` — an indexed `/compare` next to a noindexed landing would have been the one
page Google kept.

---

## 3. Host-gated to HatchGrab

### How the host is resolved server-side

**The same pattern `app/contact/page.tsx:36` already uses** — not a new mechanism:

```ts
import { headers } from 'next/headers'
import { isHatchGrabHost } from '@/lib/brand'

async function onHatchGrab(): Promise<boolean> {
  const headersList = await headers()
  return isHatchGrabHost(headersList.get('host') || '')
}
```

`isHatchGrabHost` (`lib/brand.ts:60`) is `host.includes('hatchgrab')` — the **same predicate**
`proxy.ts:89` deliberately mirrors, so there is no second host test to drift.

⚠️ It must be read from `headers()`, not from `lib/domain.ts`'s `isHatchGrab()`, which **returns false on
the server** and would have made the page 404 on every host.

### What a Village Foodie visitor gets: **404**

`notFound()`, **not a redirect**, and deliberately:

- On that brand the page genuinely does not exist, and a 404 says exactly that.
- A redirect would hint that it exists somewhere else.
- Next renders the 404 in Village Foodie's own chrome, so there is no branding leak in the error either.

**It runs first, before any auth work** — it needs only a request header, so a visitor on the wrong brand
never costs a Supabase round-trip.

**Why it was needed:** `/compare` is a top-level route and nothing in `proxy.ts` scopes it by host, so it
was served on both domains. Village Foodie is the **consumer discovery** brand — someone there is looking
for a food truck, not for operator plan tiers.

### The hatchgrab host is not broken — measured

| | Flag off | Flag on |
|---|---|---|
| `hatchgrab.*` | **307 → /contact** | **200, renders** ✅ |
| `villagefoodie.*` | **404** | **404** ✅ |

---

## 4. Does it still render correctly with the admin gate gone? — **Yes, driven in a browser**

**All measured with the page live and the flag on:**

| Check | Result |
|---|---|
| HTTP | **200**, 44,079 bytes of HTML |
| JavaScript errors | **none** |
| Chrome | LandingNav ✅, LandingFooter ✅, `.hg-landing` scope ✅ |
| Calculator | **5 inputs; the stepped flow works** — selecting trucks unlocked step 2, selecting staff unlocked the rest; visible text grew 1,077 → 1,612 chars as the result appeared |
| **Prices real, not masked** | **£49 and 0.99% rendered. "TBC" appears nowhere.** |
| Plan recommendation | ✅ "We suggest…" present |
| Saving figures | ✅ present |
| **CTA 1 — `/signup`** | ✅ **3 live links** ("Start free →") |
| **CTA 2 — `/contact?topic=Cost Comparison`** | ✅ **1 live link** |
| Small print | ✅ *"Card processing of 1.5% + 20p per order applies whichever provider you use, so it's excluded from both sides."* |

⚠️ **£29 did not appear, and that is correct, not a fault.** I entered 2 trucks and "two or more" staff,
for which the calculator recommends **Max** — so it prints £49. The £29 path is the Pro recommendation.
Nothing is missing.

### How I rendered it — and what I did NOT do

The page cannot render on your dev server (flag unset, no admin session), and I would not restart it.
So I ran an **isolated Next dev server on :3100 from a throwaway copy** of the source in the scratchpad,
with `NEXT_PUBLIC_PRICING_PUBLISHED=true`. **Your server on :3000 and your files were untouched.**

Three things worth recording about that:

- Turbopack **rejected** a symlinked `node_modules` pointing outside its root; `--webpack` worked.
- `proxy.ts` 500'd without Upstash env, so it was left out of the copy. It plays no part in this page's
  own gates — the host check reads the request header directly.
- `lib/auth/admin.ts:9` builds a Supabase client **at module load**, so the import threw even though
  `verifyAdmin()` is never called when the flag is on. 🔴 **I supplied obviously-fake placeholders**
  (`https://placeholder.supabase.co`, `placeholder-not-a-real-key`) purely so the constructor would not
  throw. **No real credential was read, copied or written anywhere**, no `.env` file was created or
  modified in the repo (`git status` confirms), and **the throwaway copy and the server are both deleted**.

---

## 5. What it would take to make it publicly reachable — and where a link would go

**Beyond the flag, one thing: something has to link to it.** Confirmed again — the only matches for
`/compare` or `landing/cost` in code are comments. **Nothing links to it, so even with the flag on it is
reachable only by handing out the URL** (which is what you said you are doing).

**Where a link would go, when you want one — reported, not added:**

1. 🟢 **The landing page's pricing section**, `app/landing/page.tsx`'s `<section id="pricing">` — under
   the three plan cards, where a reader is already weighing cost. **The best home**: it answers the
   question that section raises, at the moment it is raised.
2. **The landing footer**, beside Pricing / Privacy / Terms / Contact — lower attention, but the
   conventional place for a secondary page.
3. ⚠️ **Not the nav.** It is a supporting calculator, not a top-level destination, and the nav is already
   carrying the primary CTA.

⚠️ **Whichever you choose, that link would sit on a page that is itself still admin-gated**, so it would
not make `/compare` publicly discoverable until the landing opens too. And if you do want it found by
search, the `robots` export in §2 has to come off deliberately — it will not lapse on its own.

---

## 6. What was not touched

| | |
|---|---|
| `lib/pricing.ts` (price mask set) | ✅ untouched |
| `lib/features.ts` | ✅ untouched |
| `app/landing/layout.tsx` (landing admin gate) | ✅ untouched |
| The three protected strings | ✅ `'Online ordering — Pay at Hatch'` still **2 occurrences** |
| `app/compare/CostComparison.tsx` | ✅ untouched in this change — the calculator itself is unchanged |
| Any `.env` file | ✅ none created or modified |

---

## Files changed

```
app/compare/page.tsx   admin gate removed; robots:{index:false,follow:false} added;
                       host gate added (notFound() on any non-hatchgrab host)
```

## The one thing to carry forward

🔴 **`NEXT_PUBLIC_PRICING_PUBLISHED` is now the only thing standing between the public and the real price
list on hatchgrab.com** — and the same flag simultaneously un-masks prices across Billing. Confirm its
current value in Vercel before flipping it, because it is now doing more than it was yesterday.

**Nothing deployed. Nothing committed.**
