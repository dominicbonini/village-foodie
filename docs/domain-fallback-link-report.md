# The lapsed-plan fallback pointed at a dead page

**Workstream:** custom-domain — the fallback link on `app/domain/page.tsx`
**Date:** 29 August 2026
**Deploys:** frozen. Nothing deployed, no migration run, no column dropped, no domain removed from Vercel, no credential added.
**Scope held:** the fallback link only. The discovery feed, `TruckClient`, the `excluded` flag and `/trucks/<slug>` are untouched — evidenced below by file mtimes.

---

## 1. What was wrong

The block at `app/domain/page.tsx:151-172` rendered, for a lapsed plan:

```tsx
href={`${HATCHGRAB_URL}/trucks/${createSlug(truck.name || '')}`}
…
View {truck.name}&apos;s schedule
```

Two independent faults, and the second is the serious one.

**(a) The wrong slug space.** The href built the slug from the *name*; `/trucks/<slug>/order` and `/api/events` resolve against the **`trucks.slug` column** (`app/api/events/route.ts:43` — `.eq('slug', truckSlug)`). These are not the same string. Executing the real `createSlug` from `lib/utils.ts` against every row:

```
12 trucks; 7 where createSlug(name) !== trucks.slug
  Test Truck            column=test-truck-2    createSlug=test-truck
  test truck            column=test-truck-3    createSlug=test-truck
  Apple Tester          column=test-truck-3-2  createSlug=apple-tester
  Thai Kitchen          column=test-kitchen    createSlug=thai-kitchen
  Demo Kitchen (15yy2e) column=demo-jt7xn1b47121by1n0d1yjrrv3k …
  Demo Kitchen (m1y02c) column=demo-qbkqsaayxa87nb9cahhj2ngzpk …
  Demo Kitchen (krh2c8) column=demo-wks3nf2q7dp2tef0hp01n74e8c …
```

Better than half the table. Note the column is *not* derived from the name at all — it carries collision suffixes (`-2`, `-3-2`) and opaque demo identifiers. No amount of name-munging reaches it.

**(b) The destination is a page that says "Truck not found".** `/trucks/<slug>` takes its truck *identity* from `discovery_trucks` only (`app/api/discovery/events/route.ts:336`, "Trucks list (discovery only)"), and a graduated truck's scraped shadow carries `excluded = true` so the duplicate stops appearing in the feed. Every truck that becomes a real customer therefore vanishes from that page. Loaded in a real browser:

```
OLD target  http://localhost:3000/trucks/pizzeria-gusto
  heading: Truck not found
  text   : 🤷‍♂️ Truck not found — We couldn't find any details for this food truck.
           They might have moved or updated their profile. View all trucks …
```

Pizzeria Gusto is a live trading truck. Its own domain, on plan lapse, was handing its customers a Village Foodie page denying it exists — wrapped in a directory of competing trucks and a newsletter sign-up.

⚠️ For Gusto specifically the two slug strings happen to coincide (`pizzeria-gusto`), so fault (a) was not what broke *this* truck — fault (b) was, and it breaks every graduated truck regardless of slug. Both are fixed.

---

## 2. What changed

Two files. Nothing else.

### `app/domain/page.tsx`

```diff
-import { createSlug } from '@/lib/utils'
+import { orderPageUrl } from '@/lib/custom-domain/copy'   // the one builder for the ordering address

-        <a
-          href={`${HATCHGRAB_URL}/trucks/${createSlug(truck.name || '')}`}
-          …
-          View {truck.name}&apos;s schedule
-        </a>
+        {truck.slug && (
+          <a
+            href={orderPageUrl(truck.slug)}
+            …
+            See {truck.name}&apos;s dates and order
+          </a>
+        )}
```

The stale comment that flagged half the problem ("two slug spaces, one URL shape") is replaced by a docblock recording both faults and the reason for each constraint. `createSlug` is no longer imported by this file — the import would otherwise be unused and lint would flag it. The three remaining occurrences of the word in the file are prose inside that docblock, not code.

**No query change was needed** — `:64` already selected `slug` and `:41` already typed it `slug: string | null`.

### `lib/custom-domain/copy.ts`

One judgement, flagged because it reaches beyond the literal scope. The page's own constant carries a fallback the helper did not:

```
page  :  process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'
helper:  process.env.NEXT_PUBLIC_HATCHGRAB_URL
```

Switching this link to the helper would therefore have *removed* a fallback that had always protected it. I added the fallback to the helper rather than composing anything at the call site, so the QR card and the turn-off panel get the same floor. Executed both forms side by side:

```
env SET    before: https://www.hatchgrab.com/trucks/pizzeria-gusto/order   after: (identical)
env UNSET  before: undefined/trucks/pizzeria-gusto/order                   after: https://www.hatchgrab.com/trucks/pizzeria-gusto/order
```

It changes nothing wherever the variable is set, which is everywhere it matters. It only replaces a broken string with a working one. **If you would rather the helper stayed bare and the domain page absorbed the difference, say so and I will move it** — but that reintroduces the divergence this workstream exists to remove.

---

## 3. The label

"View \<name\>'s schedule" describes a page that does not exist. The order page's own framing is "Order from \<name\>" over the heading "CHOOSE WHICH EVENT TO ORDER FOR", above a list of dated events.

**Chosen: "See \<name\>'s dates and order".**

- *dates* — what the page actually lists, and the word an operator's customer is looking for when the schedule they expected is gone. "Schedule" is the word this product has been moving away from and it would have re-promised the missing page.
- *and order* — the page is an ordering funnel, not a read-only listing. Every row is a "Pre-order" button. Saying so sets the expectation the page immediately meets, rather than surprising someone who came to check a time.
- It stays third-person and possessive, matching the old label's register — this sits on the operator's own domain and speaks about them to their customers.

It passes the plain-English checker with no exclusion required.

---

## 4. Verification

I performed **parse**, **typecheck** and **execution**. All three, in those words.

**Parse.** `node --check scripts/check-plain-english.mjs` — clean.

**Typecheck.** `npx tsc --noEmit` — clean, no errors, after the import swap and the null guard.

**Execution — the fallback rendered.** The `if (!planGrants)` block was sliced verbatim out of the file, compiled with `ts.transpileModule`, and rendered with `react-dom/server` against the **real** `orderPageUrl` loaded from the real `copy.ts` in a `vm`. Nothing reimplemented.

```
── Pizzeria Gusto        trucks.slug = "pizzeria-gusto"
   href : https://www.hatchgrab.com/trucks/pizzeria-gusto/order
   label: See Pizzeria Gusto's dates and order

── Bob's Burgers & Co    trucks.slug = "bobs-burgers-and-co"
   href : https://www.hatchgrab.com/trucks/bobs-burgers-and-co/order
   label: See Bob's Burgers & Co's dates and order

── No Slug Truck         trucks.slug = null
   NO LINK — identity and brand line only
   <div><h1>No Slug Truck</h1><p>Powered by HatchGrab</p></div>
```

**Execution — the URL loaded for a real truck.** Real browser, real dev server:

```
NEW target  http://localhost:3000/trucks/pizzeria-gusto/order
  heading: Pizzeria Gusto
  text   : Pizzeria Gusto ← Back · Order from Pizzeria Gusto ·
           CHOOSE WHICH EVENT TO ORDER FOR
           Sat 29 Aug 12:00–20:00 · Nethergate Brewery · Long Melford CO10 9HN · Pre-order
           Sun 30 Aug 11:00–17:00 · Street Food Festival · Sudbury IP7 6QU · Pre-order
  "Truck not found"? no
```

Two real events, the truck's own name, no competing directory. The exact failure this workstream was opened for is gone.

**The column and the shared helper, no inline composition.** The only URL construction on this path is `orderPageUrl(truck.slug)`; `truck.slug` is the column, read at `:64`. There is no template literal and no `createSlug` call anywhere on the path:

```
grep 'createSlug' app/domain/page.tsx  →  3 hits, all inside the docblock prose, none executable
orderPageUrl callers: app/manage/[token]/page.tsx:8833, components/dashboard/CustomDomainSetup.tsx:565,
                      app/domain/page.tsx  — the QR card, the turn-off panel and now the fallback, one builder
```

**Serving path, deny list, normal render — unchanged.** Diffed against a snapshot taken immediately before the first edit (not against `HEAD`; the tree carried unrelated uncommitted work, and `git diff` gave a misleading 114-line `proxy.ts` result that belongs to earlier workstreams). Only two files differ, and within `app/domain/page.tsx` only the import line, the comment block and the `<a>` element.

```
proxy.ts                          2026-08-27 10:57   (untouched)
app/api/manage/route.ts           2026-08-28 23:25   (untouched)
app/trucks/[slug]/TruckClient.tsx 2026-08-04 18:04   (untouched)
app/api/discovery/events/route.ts 2026-07-15 18:42   (untouched)
app/api/events/route.ts           2026-06-17 12:31   (untouched)
app/domain/page.tsx               2026-08-29 00:02   ← edited
lib/custom-domain/copy.ts         2026-08-29 00:02   ← edited
```

The normal (plan-granted) render was loaded on the real custom domain in a browser:

```
http://events.testtruck.test:3000/  →  HTTP 200
Thai Kitchen · Mon 31 Aug 12:00–17:30 · Nethergate Brewery & Distillery CO10 9HN · Pre-order · Powered by HatchGrab
fallback link present? no — the normal schedule render, unaffected
```

**The checker.** Corpus updated with the new label as `'fallback link'`, alongside a comment recording why the entry exists and that the name is representative rather than live.

```
PLAIN-ENGLISH CHECK — 112 strings, 27 banned words
  PASS  fallback link
  111/112 pass, 1 known violation(s)      exit: 0
```

The one known violation is the pre-existing `QR: print or display`, unchanged and still reported rather than excluded.

---

## 5. Judgements you may want to overturn

1. **The null guard.** `trucks.slug` is `string | null`. A null slug now renders the identity and the brand line with **no button**, rather than a link to `/trucks//order`. A dead-looking button is worse than no button, but if you would rather it fall back to the plain hatchgrab.com home page, that is a one-line change.
2. **The fallback moved into the helper**, described in §2. It is the one change outside `app/domain/page.tsx`.
3. **"See \<name\>'s dates and order"** produces a double possessive for names already ending in *s* — "See Bob's Burgers & Co's dates and order". It reads acceptably but is not elegant. "Order from \<name\>" would avoid it and match the destination's own heading exactly, at the cost of not mentioning dates.

No contradictions were found in the brief, and no span of it arrived garbled.
