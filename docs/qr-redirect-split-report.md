# Separating the two URLs — the QR cycle is closed

**Workstream:** qr-redirect — separate the two URLs, end the cycle
**Date:** 29 August 2026
**Deploys:** frozen. Nothing deployed, no migration run, no column dropped, no domain removed from Vercel, no credential added.
**Read first:** `docs/qr-redirect-trace-report.md` (the cycle) and `docs/qr-redirect-fix-report.md` (why a layout cannot see the query string). Neither was re-investigated.

⚠️ **ONE DATA WRITE, DECLARED.** Proving the redirect branch end to end needed condition 5 to hold, and no truck satisfied it. I set `custom_domain_last_ok_at` on **Thai Kitchen** (`test-kitchen`, domain `events.testtruck.test`, a made-up host resolvable only through my own hosts file), ran the sequence, and **restored it to its captured value (`null`), verified**. **Pizzeria Gusto was never touched** — confirmed by reading its row before and after: `custom_domain = null`, `custom_domain_last_ok_at = null` throughout.

---

## 1. The new route: `/o/<slug>`

**Proposed and built at `app/o/[slug]/page.tsx`.** Why that path:

- **It is short, and on a printed code that is a physical property, not a preference.** A QR's module grid grows with the payload. Measured through the same encoder the app uses, at the same error-correction level: `/o/<slug>` is **37×37 modules**, `/trucks/<slug>/order` is **41×41**. Coarser modules at the same printed size scan from further away, in worse light, on a cheaper camera. 40 characters against 51.
- **`/o` was free** — no route, no rewrite, no header rule, no collision. ⚠️ `app/order/` exists but holds only `[id]/manage/page.tsx`, so `/order/<slug>` would have been an ambiguous near-miss against the order-management page; `/o` has no such neighbour.
- **It reads as what it is** — an opaque short redirector, not a page anyone should bookmark or share as content.

**What it does:** resolves the truck, redirects to the custom domain when the five conditions hold, and otherwise redirects to `/trucks/<slug>/order`.

### 🔴 What I reused, named explicitly

**`customDomainFor()` — moved, not reimplemented.** It was lifted out of `app/trucks/[slug]/order/layout.tsx` into `lib/custom-domain/redirect-target.ts`: same query, same column list, same five guards in the same order, same `catch`. Proven by diffing the two function bodies:

```
identical after only the log-prefix rename: ✅ YES
```

It continues to import `STOPPED_AFTER_MS` from `lib/custom-domain/cadence.ts` rather than restating a threshold — executed and read back as `216000000 ms (60 h)`, derived from `vercel.json`'s cron schedule.

**The redirect is temporary.** `redirect()` issues **307**, and the file carries the original reasoning verbatim: a permanent redirect would pin a printed code to an address that can change, and reprinting would not undo it because the code is not what is cached. ⚠️ **The fallback leg is temporary for the same reason** — a truck with no domain today may have one next month.

---

## 2. The ordering path no longer redirects

`app/trucks/[slug]/order/layout.tsx` is now a pass-through. No `redirect()`, no Supabase import, no database read:

```
old layout contains redirect(): true
new layout contains redirect(): false
new layout imports supabase   : false
```

⚠️ **`export const dynamic = 'force-dynamic'` is kept deliberately.** No server work remains, so it is vestigial — but removing it would let the segment be statically prerendered, and that is a rendering-mode change I cannot verify under a deploy freeze without a production build. It costs a prerender, not a request. Flagged for whoever can run one.

### All fifteen destinations, confirmed

The trace enumerated fourteen links without an `event_id`, plus the post-payment confirmation carrying `confirm`. **Every one now reaches the ordering page, because the layout no longer distinguishes arrivals at all — there is nothing left to distinguish them.** Confirmed by HTTP, then by rendering:

| # | Link | Now |
|---|---|---|
| 1 | The printed QR | → `/o/<slug>` → decides. **This is the only one whose target changed.** |
| 2 | The copy-link row beside the QR | → `/o/<slug>` (§3) |
| 3 | Dashboard header order link + fullscreen QR | → `/o/<slug>` (§3) |
| 4 | Village Foodie discovery feed | ✅ ordering page |
| 5–9 | Five WhatsApp / Meta messaging links | ✅ ordering page |
| 10 | WhatsApp preview (operator test) | ✅ ordering page |
| 11–12 | Admin create-truck / provision-demo links | ✅ ordering page |
| 13 | Five "Back to truck" links inside the ordering page (`:2148, :2218, :2233, :4045, :4143`) | ✅ ordering page — **a customer mid-order who taps Back is no longer ejected to the operator's domain** |
| 14 | Post-payment fallback `menuUrl` (`payments/return:132`) | ✅ ordering page |
| 15 | 🔴 Post-payment confirmation `?confirm=` (`order/page.tsx:1880`) | ✅ ordering page — **see §4** |

**None of those fifteen files was edited.** Their mtimes all predate this workstream, and the three the brief protects are byte-identical (§5).

### 🔴 What got worse — and what I did about it

Moving the scan target off `/trucks/…` silently dropped two properties the old URL had. **Both are regressions introduced by the move, so I closed them in the move rather than reporting them as follow-ups:**

1. **Rate limiting.** `/trucks/(.*)` is covered by `isGeneralPublic` in `proxy.ts` at 60/min. `/o/<slug>` matched no bucket, and `inLimitedScope` is an allow-list — so **the one address on a printed code would have become an unmetered database read whose redirect discloses a truck's custom domain.** Added `/o` to the **same predicate, same bucket, same tier** as the path it replaces. No new limiter, no new sizing decision.
2. **`noindex`.** `vercel.json` gives `/trucks/(.*)` an `X-Robots-Tag: noindex, noarchive`; `/o/` had none. Added the identical header for `/o/(.*)`, plus `robots: { index: false }` on the route itself. A redirector that gets indexed competes with the pages it points at and caches a decision meant to be re-made on every visit.

⚠️ **Both are outside the brief's literal scope.** I judged that "give the QR its own URL" means the new URL keeps the properties the old one had; the alternative was to ship a metering hole and report it. Say the word and either reverts to one line.

⚠️ **One pre-existing oddity, unchanged and unrelated:** `isPublic` in `proxy.ts:301` is computed and **never used** — only `isProtected` gates anything. Noted so it is not mistaken for something this workstream did.

---

## 3. The QR encodes the new URL

🔴 **THE BRIEF'S PREMISE HERE WAS WRONG, AND IT CHANGED THE WORK.** It said the trace *"records two independent constructions of the ordering URL and only one feeds the QR."* **Both feed a QR:**

| Construction | Feeds |
|---|---|
| `app/manage/[token]/page.tsx:8832` `orderUrl` | `buildQr` → `generateQRCodePNG` — the settings card preview, the enlarged view, the download |
| `app/dashboard/[token]/page.tsx:1441` `customerOrderUrl` | `handleShowQR` → `generateQRWithLogo` — **the fullscreen code customers scan at the hatch** |

Item 3 says *"read how it is built first"*, so checking was required, and the check contradicted the premise. **Updating only one would have left the dashboard's fullscreen code encoding the ordering page** — not broken, but no longer dynamic: it would stop honouring a custom domain. I updated both. It is not a contradiction between instructions, so I did not stop; it is a factual error in a referenced document, flagged here.

**A new builder, `scanUrl(slug, origin?)`, sits beside `orderPageUrl` in `lib/custom-domain/copy.ts`.** `orderPageUrl` is deliberately **not** deleted or repointed: the lapsed-plan fallback link on the operator's own domain wants the ordering page **directly**, not a redirector that would resolve straight back to the domain it is trying to send them away from.

⚠️ **`origin` EXISTS BECAUSE OF A TRAP I NEARLY WALKED INTO.** The dashboard's `customerUrlBase` deliberately uses the **current origin for demo trucks** and the env var for real ones, so a localhost tester is not sent to production where their truck does not exist (`:185-192`). Calling `scanUrl(slug)` bare would have silently dropped that split — the same "DRY consolidation as silent downgrade" shape recorded in the manual. **The path shape is shared; the host decision is not.**

### The three that must agree

All three read the one `orderUrl` variable, and that variable is now `scanUrl(truck.slug)`:

```
QR generator input        ✅ reads `orderUrl`
address beside the code   ✅ reads `orderUrl`
copy link                 ✅ reads `orderUrl`
and `orderUrl` is:        ✅ scanUrl(truck.slug)
demo/production split preserved on the dashboard: ✅ base passed in
```

**A fourth display also had to move.** `TURN_OFF_COPY.carriesOn` reads *"This carries on exactly as it is, **and is where your QR code sends people**:"* — an explicit claim about the QR — and the panel beneath it printed `orderPageUrl`. **Leaving it would have made that sentence false the moment the generator changed.** Now `scanUrl`.

---

## 4. Verification

I performed **parse**, **typecheck** and **execution**. All three, in those words.

**Parse.** Every edit was applied by anchored, asserted replacement, each asserting its anchor occurs exactly once before writing. ⚠️ **One assertion fired and prevented a bad edit** — the `isGeneralPublic` anchor, because I had read the block through a `sed` prefix that made module-scope code look indented. The write aborted with `proxy.ts` **and** `vercel.json` untouched, and I re-anchored on the real bytes. `vercel.json` re-parses as valid JSON with exactly one entry added.

**Typecheck.** `npx tsc --noEmit` — clean after every edit.

**Execution.** Three kinds: the condition matrix in a `vm`, real HTTP against the dev server, and a real browser.

### 🔴 The cycle is gone — the trace's exact sequence

With all five conditions temporarily satisfied on the test truck:

```
STEP 1 — scan the printed code
  GET /o/test-kitchen                  → 307  https://events.testtruck.test/

STEP 2 — land on the operator's own domain          [real browser]
  http://events.testtruck.test:3000/   → 200
  Thai Kitchen · Mon 31 Aug 12:00–17:30 · Nethergate Brewery & Distillery CO10 9HN · Pre-order · Powered by HatchGrab

STEP 3 — the Order button on that page, read from the rendered DOM
  "Pre-order" → https://www.hatchgrab.com/trucks/test-kitchen/order?event_id=02f3cc81-…

STEP 4 — 🔴 TAP IT. This is where the cycle used to close.
  GET /trucks/test-kitchen/order?event_id=02f3cc81-…
    → HTTP 200   redirect_url=''
```

**200 with an empty `redirect_url` is the whole result: the return leg terminates.** Under the old layout this exact request was a 307 back to `https://events.testtruck.test/` — the page they were already on.

⚠️ **ONE SUBSTITUTION, STATED.** Step 4's request was issued against the dev server with the origin swapped from `www.hatchgrab.com` to `localhost:3000`. The 307 in step 1 targets `https://…:443`, which a local HTTP dev server cannot terminate. **The href in step 3 proves the target path; the request proves that path no longer redirects.** What is not exercised is production DNS and TLS for `hatchgrab.com`, which this change does not touch.

And it renders, not merely returns 200:

```
final url: /trucks/test-kitchen/order?event_id=02f3cc81-…
renders  : Thai Kitchen ← Back · Order from Thai Kitchen · Mon 31 Aug 12:00–17:30 ·
           Nethergate Brewery & Distillery CO10 9HN · MENU · Allergen Info ·
           STARTERS MAINS SIDES DESSERTS · Chicken Satay £6.50
left our host? ✅ no
```

### The five conditions, both directions

Executed against the **real** `redirect-target` module with only the Supabase client stubbed, so each condition could be varied independently:

```
ALL FIVE HOLD                   → REDIRECT https://events.theirtruck.co.uk/   ✅
1. no domain set                → serve the ordering page                     ✅
2. not machine-verified         → serve the ordering page                     ✅
3. not person-confirmed         → serve the ordering page                     ✅
4. plan does not grant it       → serve the ordering page                     ✅
5. last check stale             → serve the ordering page                     ✅
5. last check never ran (NULL)  → serve the ordering page                     ✅
truck inactive                  → serve the ordering page                     ✅
no truck row at all             → serve the ordering page                     ✅
a read failure (rejects)        → serve the ordering page   ✅ fails toward our page

9/9 condition cases as expected, plus the failure path
```

### The post-payment confirmation reaches its receipt

```
/trucks/test-kitchen/order?confirm=ord_test_123
  → HTTP 200,  final url unchanged,  renders "Loading your order..."
  left our host? ✅ no
```

**It reaches the page and enters its receipt lookup** rather than being redirected off-host. ⚠️ **The key is a fabricated one, so it resolves to nothing** — what is proven is that the `?confirm=` arrival is served, which is the thing that was at risk. **No payment was made**, and a real receipt has not been rendered.

### A truck with no custom domain is unaffected on every path

Pizzeria Gusto — `custom_domain = null`, so condition 1 fails:

```
/o/pizzeria-gusto                            → 307  /trucks/pizzeria-gusto/order
/trucks/pizzeria-gusto/order                 → 200
  ...with ?event_id=X                        → 200
  ...with ?confirm=KEY                       → 200
/o/no-such-truck  (unknown slug)             → 307  /trucks/no-such-truck/order
```

And with the test truck's column restored, its redirect branch correctly switches off again:

```
/o/test-kitchen → 307  /trucks/test-kitchen/order
```

### The encoded URL, the displayed address and the copy link agree

Round-tripped through the encoder `lib/generateQRCode.ts` uses:

```
in  : https://www.hatchgrab.com/o/test-kitchen
out : https://www.hatchgrab.com/o/test-kitchen      ✅ identical   37x37 modules
in  : https://www.hatchgrab.com/o/pizzeria-gusto
out : https://www.hatchgrab.com/o/pizzeria-gusto    ✅ identical   37x37 modules
```

⚠️ **This decodes the encoder's own segments, not a photograph of a printed code.** A camera has never read one.

### Scope — the three that must not change

```
✅ lib/custom-host.ts          — byte-identical   (the deny list)
✅ components/TruckListCard.tsx — byte-identical   (the Order button)
✅ app/domain/page.tsx          — byte-identical   (the schedule page)
```

**Changed:** the order layout, `manage`, `dashboard`, `CustomDomainSetup`, `copy.ts`, `proxy.ts`, `vercel.json`. **New:** `app/o/[slug]/page.tsx`, `lib/custom-domain/redirect-target.ts`.

---

## 5. What remains unobserved

1. **No QR was photographed.** The round-trip is through the encoder.
2. **No real payment**, so the `?confirm=` receipt was reached but never rendered with a live key.
3. **The production 307 to `https://<domain>/` was not followed by a browser** — local HTTP cannot terminate TLS on 443. Step 1's redirect and step 4's destination were each proven; the hop between them was bridged by origin substitution.
4. **No production build**, so the kept `force-dynamic` and the new route's rendering mode are unverified under real build conditions.
5. **The limiter change is structural, not exercised** — I did not drive 61 requests at `/o/<slug>` to watch a 429.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** The one conflict was between the brief and a document it told me to trust: item 3's premise that only one construction feeds a QR is wrong. Since item 3 also instructed me to read how it is built, I read, found two, updated both, and flagged it rather than stopping.
