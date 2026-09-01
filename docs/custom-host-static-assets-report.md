# Static assets were denied, so no page could work

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — the matcher, the allow list and every path quoted here are read from files on disk.
- **Typecheck** — `npx tsc --noEmit`, clean.
- **Execution** — 🔴 **and for the first time in this feature, a REAL BROWSER.** Puppeteer loaded
  `http://events.testtruck.test:3000/` **before and after** the change, recording every network
  response and every page error. Every sub-resource and all 48 application surfaces were also driven
  by `curl` against the running dev server, and the real `isAllowedOnCustomHost` was executed in a `vm`
  over 19 paths.

**NO DEPLOY. NO MIGRATION. NO SQL.** Pizzeria Gusto untouched.
**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**
🔴 **The root cause is not where the brief expected it, and there is a second, larger hole beside it —
§2 and §6.**

---

## 1. WHAT THE BROWSER ACTUALLY REQUESTS

Worked back from the rendered document, not from the allow list. **26 distinct sub-resources**, in
three prefixes:

| Prefix | Count | What | Allowed **before**? |
|---|---|---|---|
| `/_next/static/chunks/` | **23** | 22 `.js` bundles + 1 `.css` | 🔴 **NO — 404** |
| `/_next/static/media/` | **2** | `.woff2` fonts (`next/font`) | 🔴 **NO — 404** |
| `/manifest.json` | 1 | `<link rel="manifest">` | ⚠️ **served 200 — but the policy denies it. §6** |

**The 23 chunks, in full**, from the document itself:

```
[root-of-the-server]__28bc9c2a._.css              node_modules_next_dist_be32b49c._.js
[turbopack]_browser_dev_hmr-client_…_956a0d3a._.js node_modules_next_dist_build_polyfills_polyfill-nomodule.js
_51618601._.js                                     node_modules_next_dist_client_17643121._.js
_a0ff3932._.js                                     node_modules_next_dist_client_components_builtin_global-error_…
_b3b70b57._.js                                     node_modules_next_dist_compiled_a0e4c7b4._.js
app_domain_page_tsx_bca213ff._.js                  node_modules_next_dist_compiled_next-devtools_index_…
app_layout_tsx_1cf6b850._.js                       node_modules_next_dist_compiled_react-dom_1e674e59._.js
node_modules_@capacitor_preferences_…_53f58d83.js  node_modules_next_dist_compiled_react-server-dom-turbopack_…
node_modules_@supabase_auth-js_…_e6c70351._.js     node_modules_next_dist_f3530cac._.js
node_modules_@supabase_postgrest-js_…_55decf9c._.js node_modules_posthog-js_67e5a716._.js
node_modules_@swc_helpers_cjs_d80fb378._.js        turbopack-_23a915ee._.js
node_modules_1b2ad92b._.js
```

**Not one of these is a route.** They are content-hashed files emitted by the build. **No route
enumeration can contain them**, which is why the 47-surface proof was both correct and irrelevant to
this failure.

⚠️ **What the page does NOT request, and therefore what I did not allow:** no `/_next/image` (the truck
logo is a plain `<img>` at the storage bucket, deliberately), no `/_next/data`, no `/_next/server`, no
icon link (this route sets the truck's own logo as its icon, and Thai Kitchen has none), no
`robots.txt`, no `sitemap.xml`.

---

## 2. 🔴 THE ROOT CAUSE IS A TYPO IN THE PROXY MATCHER

```js
matcher: ['/((?!_next_next/image|favicon.ico|apple-touch-icon.png|logos|photos|sw.js|manifest.json|offline.html).*)']
```

Split on `|`, the first alternative is **`_next_next/image`** — 🔴 **`_next` and `_next/image`
concatenated with the separator missing.** Nothing is ever requested at a path beginning
`_next_next/image`, so **that exclusion is inert**, and **every `/_next/*` request runs the proxy** —
where the custom-host branch denies it.

**So the intended design was that `/_next/*` never reaches the deny list at all.** It has been reaching
it since the matcher was written.

⚠️ **I DID NOT FIX THE TYPO, AND THAT IS DELIBERATE.** Repairing it to `_next|_next/image` would fix
the symptom by making all of `/_next/*` invisible to the proxy — on **every** host — which removes
`/_next/image` (a server surface that fetches a caller-named URL) from the deny list as a side effect,
and stops the custom-host limiter counting asset traffic. **That is a widening, and your item 2 forbids
widening.** The allow-list fix is narrower and is the one your brief asked for. **The typo is recorded
here and in §35 of the manual as a separate decision.**

---

## 3. WHAT I ADDED — ONE PREFIX

`lib/custom-host.ts`, purely additive — **0 lines removed, 23 added**:

```ts
/** … */
STATIC: '/_next/static/',
```
```ts
pathname.startsWith(CUSTOM_HOST_ALLOWED.STATIC) ||
```

**Why it is needed:** it is the single prefix under which the framework emits every script, stylesheet
and font the document references. All 25 of them live there.

🔴 **`/_next/static/` AND NOT `/_next/`.** The narrower prefix is the whole point:

| Path | Allowed | Why |
|---|---|---|
| `/_next/static/**` | ✅ | build output — immutable, content-hashed files |
| `/_next/image` | ⛔ | the image optimiser — **a server surface that fetches a URL the caller names.** Not requested by this page |
| `/_next/data/**` | ⛔ | route payloads |
| `/_next/server/**` | ⛔ | server bundles |

⚠️ **THE TRAILING SLASH IS LOad-BEARING.** Without it, `/_next/staticXapi/manage` would pass the prefix
test. Executed: `/_next/static` → **DENY**, `/_next/staticXapi/manage` → **DENY**, `/_next/static/` →
ALLOW.

### Could anything under the added prefix expose application data or an authenticated surface?

**No, and here is the reasoning rather than the assurance.**

- **`/_next/static/` is build output, not a handler.** Every file is a static artefact with a
  content-addressed name. Nothing under it reads a request, a cookie, a session or the database. **It
  cannot return application data because it cannot run.**
- **The bundles contain client code, and that code is already public.** These are the identical files
  any visitor to hatchgrab.com downloads. They may embed `NEXT_PUBLIC_*` values — public by definition
  — and **no server code and no service-role key**, which live only in server bundles under
  `/_next/server/`, still denied.
- ⚠️ **Stated plainly: someone on an operator's domain could fetch a chunk containing our dashboard's
  client code.** That reveals **source, not data** — the same source already served from our own
  domain to anyone who asks. It is not an authenticated surface and it returns nothing about any truck.
- **A traversal cannot escape the prefix.** Executed against the running server:

```
  404  /_next/static/../../api/manage           → normalised to /api/manage, DENIED
  404  /_next/static/chunks/../../../api/manage → normalised to /api/manage, DENIED
  404  /_next/static/%2e%2e/%2e%2e/api/manage   → stays literal, DENIED
  404  /_next/server/app/api/manage/route.js    → DENIED
  404  /_next/image?url=http://localhost:3000/api/dashboard → DENIED
```

`pathname` reaches the policy already normalised, so `..` is resolved **before** the test — a traversal
arrives as its real path and is denied there.

---

## 4. 🔴 THE PROOF — A REAL BROWSER, BEFORE AND AFTER

The same page, the same Puppeteer run, the allow list reverted and restored:

```
── WITH THE OLD ALLOW LIST ──────────────────────────────────────────
  TITLE : Thai Kitchen
  REQUESTS on this host: 27   failures: 24        ← every chunk, every font, the stylesheet
    404  /_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js
    404  /_next/static/media/797e433ab948586e-s.p.29207c2f.woff2
    …22 more

── WITH /_next/static/ ALLOWED ──────────────────────────────────────
  TITLE : Thai Kitchen
  REQUESTS on this host: 30   failures: 0
  PAGE ERRORS: none
  still on the loading state? ✅ NO

  RENDERED TEXT:
    Thai Kitchen  Mon 31 Aug 12:00 – 17:30  Nethergate Brewery & Distillery CO10 9HN
    Pre-order  Powered by HatchGrab
```

🔴 **THAT IS A NON-EMPTY EVENT, WHICH IS THE PROOF V11.49 DEMANDS** — *"non-empty events from the
endpoint, never that the page renders."* The truck's name, a real date, a real venue, a working
Pre-order button and the attribution line. **The custom-domain feature has now been observed working.**

**Every sub-resource by `curl` as well:** `✅ 200: 26    🔴 not 200: 0`.

---

## 5. 🔴 THE DENY STILL BITES — 48/48 REFUSED

Every application surface, re-run against the live custom host **after** the change:

```
  surfaces tested : 48
  ✅ REFUSED (404): 48
  🔴 not refused  : 0
```

Covering `/dashboard` (and a demo token), `/manage`, `/kds`, `/admin` and its children, `/login`,
`/signup`, `/setup`, the password routes, `/trucks` and `/trucks/*/order`, `/venues/*`, `/landing` and
`/landing/cost`, `/embed/*`, `/order/*/manage`, `/contact`, `/hire`, `/privacy`, `/terms`, `/app`,
`/domain` itself, and 18 API families including `/api/manage`, `/api/dashboard`, `/api/admin`,
`/api/orders/submit`, `/api/stripe/connect`, `/api/payments/return`, `/api/webhooks/meta/whatsapp` and
`/api/cron/custom-domain-check`.

**The two existing allowed paths are unchanged** — asserted on the source, not on behaviour:

```
  ✅ ROOT: '/',                              1 → 1     ✅ pathname === …ROOT ||     1 → 1
  ✅ EVENTS: '/api/embed/events',            1 → 1     ✅ pathname === …EVENTS ||   1 → 1
  ✅ isAcmeChallenge(pathname)               1 → 1
  lines removed: 0   lines added: 23
```

**`isOwnHost`, `hostKey` and `isCustomHost` are untouched.**

---

## 6. 🔴 A SECOND HOLE, FOUND WHILE ENUMERATING, AND IT RUNS THE OTHER WAY

The same matcher typo means **eight path families never reach the deny list at all.** They are neither
allowed nor denied — **they are invisible to the policy.** Live, on the operator's domain:

| Path | Live | The policy says |
|---|---|---|
| `/favicon.ico` | **200** | DENY |
| `/apple-touch-icon.png` | **200** | DENY |
| `/manifest.json` | **200** | DENY |
| `/sw.js` | **200** | DENY |
| `/offline.html` | **200** | DENY |
| `/logos/**` — **121 files, including ~120 other trucks' logos** | **200** | DENY |
| `/photos/**` | 404 *(no such directory)* | DENY |

🔴 **SO AN OPERATOR'S DOMAIN CURRENTLY SERVES: OUR BRAND MARK, OUR PWA MANIFEST TITLED "Village Foodie
Kitchen", AND EVERY OTHER TRUCK'S LOGO.** The manifest one is the sharpest — a browser on their site
can be offered an install prompt for our kitchen display.

⚠️ **This is application data reaching a third party's domain, and it is the one thing the deny list
exists to prevent.** It predates this workstream and I have **not** changed it: closing it means
removing entries from the matcher, which makes the proxy run on every static request on every host — a
performance and behaviour change well outside "add the framework's static asset paths". **Recorded in
§27 and §35 as the next thing to decide.**

---

## 7. THE INVARIANT — §35 UPDATED

Added **🔴 ENUMERATE WHAT THE BROWSER REQUESTS, NOT WHAT ROUTES EXIST (V11.50)**, immediately above the
V11.49 verification-requirement entry it belongs beside. It records that the 47-surface proof was
sound, complete and **of the wrong set**; that the rule for anything a browser renders is to work back
from **the rendered document's sub-resources**, not the route table; and — separately — that **a path
excluded by the matcher is neither allowed nor denied but invisible to the policy**, so an enumeration
starting from the policy function will miss every one.

---

## 8. WHAT REMAINS UNOBSERVED

1. ⚠️ **THIS IS `next dev`, NOT A PRODUCTION BUILD.** Chunk names differ between turbopack dev and a
   production build, and dev adds HMR and devtools bundles. **The PREFIX is the same in both**, which
   is what the fix keys on — but the production asset list has not been enumerated, and `next build`
   was not run.
2. ⚠️ **ONE DEV-ONLY REQUEST IS UNRESOLVED.** The HMR client chunk now loads, but its **websocket**
   upgrade was not traced; hot reload on a custom host may still fail. Irrelevant to production.
3. ⚠️ **Only one page was tested** — the custom-domain root. It is the only page allowed on that host,
   so there is no second document to enumerate, **but that is an argument, not an observation.**
4. 🔴 **The `/logos`, `/manifest.json` and `/favicon.ico` bypass is unfixed.** §6.
5. 🔴 **The matcher typo is unfixed and deliberate.** §2.
6. **The truck used has no logo**, so the `TruckIdentity` image path rendered its name-as-text branch;
   the logo branch on a custom host is still unobserved.
