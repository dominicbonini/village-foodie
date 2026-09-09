# PostHog scoped off the credential routes

**Date:** 9 September 2026 · **Change:** `app/providers.tsx` only, **+72 / −1**, uncommitted. **No database row inserted, updated or deleted. No Vercel or PostHog setting changed. PostHog neither removed nor re-added** — 🧪 `git diff --stat package.json package-lock.json` is empty. `app/layout.tsx` **untouched**. `scripts/run-scraper.js` **untouched** (its two workstreams are byte-for-byte as I found them). Nothing staged, committed or pushed; `git add` not run.

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED · ⚠️ inference · 🔴 danger.
**Extensions searched:** none scoped. `grep -rn -I` over `app components lib` with `node_modules`/`.next`/`.git`/`docs` excluded, plus `find` for route directories. 🧪 Exit codes read on every sweep; the two link sweeps **exited 0 with hits**, which is what changed the design (§3).

---

## 0. Step 1 — stop conditions

| file | state at START |
|---|---|
| `app/layout.tsx` | 🧪 **CLEAN** (and still untouched at END — the fix needed no change there) |
| `app/providers.tsx` | 🧪 **CLEAN** — the only file I edited |
| `scripts/run-scraper.js` | ⚠️ modified (+491/−74, `SITES_FROM` + auto-exclusion) — **not touched**, and in a different file so no hunk can collide |

**`git status --short`** at END is START plus ` M app/providers.tsx` and this report. `HEAD` = `origin/main` = `9e83a5e`. Row counts unchanged (`trucks` 9, `discovery_trucks` 231, `venues` 814, `discovery_events` 4,300).

---

## 1. Step 2 — the full surface

### Every route whose path carries a credential or identifier

🧪 Found by enumerating dynamic segments, not from the brief's list:

| route | what is in the path | verdict |
|---|---|---|
| `/dashboard/[token]` | **`dashboard_token` — a bearer credential** | 🔴 blocked |
| `/dashboard/[token]/kds` | the same token, **plus `?van_id=&van_name=&event_id=&date=`** 🔎 (`app/dashboard/[token]/page.tsx:1629-1635`) | 🔴 blocked |
| `/manage/[token]` | the same `dashboard_token`, **plus `?import=demo`** | 🔴 blocked |
| `/kds/[kds_token]` | a 48-character `kds_token` | 🔴 blocked |
| `/order/[id]/manage` | an **order id** — a customer capability URL | ⚠️ **found, NOT blocked — reported for your decision** |
| `/admin`, `/admin/outreach` | no token, but **operator emails, phones and prospect notes on screen** | ⚠️ **found, NOT blocked — see below** |
| `/login`, `/signup`, `/reset-password`, `/setup`, `/app` | no credential in the path | ⚠️ left capturing |
| `/trucks/[slug]`, `/venues/[slug]`, `/order/[id]`, `/o/[slug]`, `/embed/[slug]` | public slugs | ✅ untouched (`/embed` already guarded) |

⚠️ **The query string is the part that is easy to miss**, and it is where the manual's *"van ids and event ids alongside"* comes from: 🔎 the in-app KDS link carries `van_id`, `van_name`, `event_id` and `date`. **`$current_url` includes the query string, so those ride along with the token.** Dropping the event drops all of it.

🔴 **I deliberately did not block `/admin` or `/login`, and you should decide on them.** Blocking is free in measurement terms, but `/signup` and `/login` are a funnel someone may want measured, and silently removing that would be the kind of unrequested scope change that is hard to notice. **`/admin` is the strongest candidate for a follow-up** — no token in the path, but autocapture there would record operator names, emails and phone numbers as clicked-element text.

### 🔴 What `$autocapture` collects — why suppressing pageviews would not have been enough

🔎 `app/providers.tsx` sets `disable_session_recording: true` but **autocapture is left on** (the library default, and disclosed in the privacy policy as "clicks and pages viewed"). Autocapture records, for every click: the element's tag, classes, `id`, `href`, **and its text content**, plus `$current_url` on the event.

**On an operator dashboard that means the text of whatever was clicked** — a customer's name on an order card, an order line, a phone number in a contact row, a van name. ⚠️ **And every one of those events carries `$current_url`, so the token rides on the autocapture events too — which is exactly what V12.5 :8477 recorded: the tokens appeared across `$autocapture` *and* `$pageview`.**

🔴 **This is why a pageview-only fix would have failed.** It is also why unmounting the React provider is not sufficient: **`$pageview` and `$autocapture` are driven by global listeners installed by `posthog.init()`, not by the React tree.** Removing the provider stops `usePostHog()` from resolving; it does not stop the library.

### What is lost by blocking these routes: nothing

🔎 Manual V12.5 :8509 — *"there is not one explicit `posthog.capture()` on any operator route — it collects nothing we use while carrying the whole risk."* 🧪 Confirmed: the only `posthog.capture` call sites are `app/page.tsx`, `app/venues/[slug]/VenueClient.tsx`, `app/trucks/[slug]/TruckClient.tsx` and `components/EventListCard.tsx` — **all public**.

---

## 2. Step 3 — the fix, and which approach actually prevents transmission

🔴 **The decisive distinction the brief asks for: `posthog.init()` runs at MODULE SCOPE** (🔎 `app/providers.tsx`, and the file's own comment already says so for `/embed`). So:

| approach | does the URL get SENT? |
|---|---|
| a check inside the component | 🔴 **too late** — init has already run, listeners installed, first pageview already fired |
| `posthog.opt_out_capturing()` | ⚠️ init has already run; and opt-out **persists in localStorage**, so it would follow the operator back onto public pages |
| **guarding `init()` itself** | ✅ **nothing is sent, because nothing starts** — no cookie, no listener, no network call |
| **`before_send` returning `null`** | ✅ **dropped inside the capture pipeline, before the request is queued or transmitted** |

**I did not move the provider out of the root layout.** ⚠️ Nested layouts *wrap* the root, so moving it would mean mounting it on `app/landing/layout.tsx`, `app/(legal)/layout.tsx`, `app/trucks/[slug]/order/layout.tsx` and the consumer root — four files, more surface, and it would still not stop the global listeners once init had run somewhere. **The init guard is where `/embed` and the custom-host guard already live; this follows that reviewed pattern.**

### Three layers, and why layer 2 is the load-bearing one

**Layer 1 — don't initialise on a credential entry URL.** `IS_CREDENTIAL_ENTRY` reads `window.location.pathname` once at module evaluation, exactly like `IS_EMBED_ENTRY`. On a direct load or refresh of `/manage/<token>`: **no init at all.**

🔴 **Layer 2 — `before_send`, and it is not redundant.** Layer 1 is decided by the **entry** URL. For `/embed` that is enough because nothing links to it — but here 🧪 **the app really does navigate into these routes client-side, with PostHog already initialised:**

```
app/setup/page.tsx:153            router.push(`/manage/${dashboard_token}?import=demo`)
app/admin/page.tsx:1275, :1279    links to /dashboard/<token> and /manage/<token>
app/dashboard/[token]/page.tsx:1635  router.push(`/dashboard/${token}/kds?…`)
```

On those navigations layer 1 has already passed. `before_send` inspects **the event's own url** (not `window.location`, so a queued event cannot escape by being flushed after the user navigates away) and returns `null` for a credential path — **dropped before queueing, never transmitted.** 🔎 Supported in the installed posthog-js **1.386.6**: `before_send: void 0` is a real config default normalised to `[this.config.before_send]`, and the library's own notice says *"sanitize_properties is deprecated. Use before_send instead."*

**Layer 3 — the provider returns bare children on credential routes.** `usePathname()` is reactive, so this is correct on client-side navigation — but it only removes the React context. **Defence in depth, explicitly not the load-bearing layer**, and the code says so.

✅ **Public pages keep sending pageviews** — the landing page, the consumer map, `/trucks/[slug]` and `/venues/[slug]` are untouched by all three layers.

---

## 3. Step 4 — what is already in PostHog

🔴 **This fix stops NEW leakage and does NOTHING about events already in PostHog's store.** Tokens captured in previous months are still there, in whatever retention the project has.

### 🔴 And at least one leaked token is still a live credential

🧪 Checked against `trucks` today. The manual records `/dashboard/realthaifood-23f80551121b` and `/manage/realthaifood-23f80551121b`:

| truck | active | the leaked token is… |
|---|---|---|
| **Real Thai Food** (`real-thai-food`) | **true**, plan `trial` | 🔴 **STILL THE CURRENT `dashboard_token` — never rotated** |
| Pizza Kitchen (`test-truck`) | true, plan `trial` | 🔴 `test-abc123def456` — still current (a test truck) |

⚠️ **Real Thai Food is a real operator account, not a test truck** — V1.3 §9.4 records it as a graduated truck deliberately left public. **Its dashboard token has been sitting in a third-party analytics store since at least 26 August and it still works today.** Pizzeria Gusto — the truck you describe as the one actually trading — 🧪 does **not** appear in the manual's recorded leak, and its token is a different value.

**The options for the existing data, none of which I have acted on:**

1. **Rotate `real-thai-food`'s `dashboard_token`** (and `test-truck`'s). This is the only action that makes the leaked value worthless. ⚠️ It invalidates any bookmark, saved link or emailed `/manage/<token>` link that operator holds — 🔎 and `app/api/inbound-schedule/route.ts:275` emails those links in plaintext, so old emails would stop working.
2. **Delete the events in PostHog** — via its data-management tooling or a GDPR-style deletion request. Removes the record; does not un-expose a token that was already transmitted and may sit in logs or backups.
3. **Shorten PostHog's retention** so the events age out.
4. **Do nothing** and accept that a live operator credential is in a third-party store.

🔴 **I would rotate first and delete second: deletion without rotation leaves a working credential that merely became harder to look up.** Your call — no row was touched.

---

## 4. Step 5 — proof, served not source

### 🔴 What I could NOT prove, stated first

🧪 `/manage/<token>` and `/dashboard/<token>` return **HTTP 307 to `/login?next=…`** unauthenticated — 🔎 `proxy.ts:312-313` treats both as protected. Their bodies are **41 and 44 bytes**. So a naive "posthog count = 0" on those pages **proves nothing whatsoever**: the page never rendered. I have no operator session, so I cannot serve them.

⚠️ **And the served HTML cannot discriminate anyway.** The posthog bundle is a **static import**, so its `<script>` reference is present on every page regardless of whether `init()` runs — the file already documents this for `/embed` (*"AND THE BUNDLE STILL LOADS… what does not happen is init"*). 🧪 Measured in one run:

| page | bytes | posthog refs in served HTML |
|---|---|---|
| **LANDING** (`Host: hatchgrab.com`) | 495,632 | **8** |
| consumer map `/` | 33,962 | 5 |
| **`/kds/<kds_token>` 🔴 credential** | 34,627 | **5** |
| `/login` (control, not blocked) | 30,117 | 5 |

🔴 **So "no bundle" is not a claim I can make, and I am not making it.** The KDS page renders (200, token-auth not session-auth) and still references the bundle. What changes is that `init()` does not run and events are dropped.

### What I CAN prove, from the served output

**1. The guard ships in the client JavaScript.** 🧪 Fetched `/_next/static/chunks/_b3b70b57._.js` (53,639 bytes) from the running server and stripped comments — the **executable** lines:

```js
const IS_CREDENTIAL_ENTRY = … && isCredentialPath(window.location.pathname);
if (… && !IS_EMBED_ENTRY && !IS_CUSTOM_HOST_ENTRY && !IS_CREDENTIAL_ENTRY) {   // ← init is gated
before_send: (event)=>{ … const props = event.properties ?? {}; … }            // ← the hook ships
const CREDENTIAL_ROUTE_RE = /^\/(dashboard|manage|kds)(\/|$)/;
```

**2. The decision, run against real paths — using the functions extracted from that served chunk, not from the source file:**

```
✅ allow  /                                landing / consumer map
✅ allow  /trucks/pizzeria-gusto           public truck page
✅ allow  /venues/the-bell-bottisham       public venue page
✅ allow  /order/pizzeria-gusto            QR decider (public)
✅ allow  /login                           deliberately NOT blocked
✅ BLOCK  /dashboard/test-abc123def456     🔴 dashboard token
✅ BLOCK  /manage/test-abc123def456        🔴 manage token
✅ BLOCK  /dashboard/test-abc123def456/kds 🔴 in-app KDS
✅ BLOCK  /kds/<48-char token>             🔴 standalone KDS
✅ BLOCK  /dashboard   ·  ✅ BLOCK  /manage   (tokenless entries)
→ 12/12 as expected, 0 wrong
```

**3. `before_send` drops exactly those, and only those** — 12/12, `null` returned for every credential path and the event passed through for every public one. **Including the autocapture case with the full query string:**

```
$autocapture  /dashboard/<token>/kds?van_id=V1&van_name=Main&event_id=E9&date=2026-09-10
   → ✅ DROPPED (the token AND van_id/van_name/event_id go with it)
$autocapture  /trucks/pizzeria-gusto?utm_source=x
   → ✅ sent (measurement preserved)
```

### 🔴 What this would look like if it were doing nothing

**A provider that failed to mount everywhere and one correctly scoped both produce a credential page with no PostHog.** So the discriminator is that **the public pages still have it, measured in the same run**: 🧪 landing **8** refs and rendering at 495 KB, consumer map **5**, and the `before_send` table above shows every public path still `sent`. **A blanket break would have shown the public pages losing capture too. They did not.**

⚠️ **Limits of this proof, stated plainly:** these are dev-server renders, whose chunking differs from a production build; I could not observe an actual network request to the PostHog host because that needs a browser; and `/manage` and `/dashboard` could not be rendered at all without a session.

---

## 5. What has and has not changed

🔴 **Nothing takes effect until this is deployed.** The change is uncommitted; production still runs the old code, initialising PostHog on every route.

🔴 **Pizzeria Gusto uses the manage and KDS pages while trading.** ⚠️ **After deploy those pages stop sending analytics entirely** — which is the intent, loses nothing (no explicit captures there), and is worth knowing before the next service. The pages themselves are otherwise untouched: no layout moved, no provider removed from the root, `app/layout.tsx` not edited.

**Not done, as instructed:** PostHog **not removed** · no Vercel or PostHog setting changed · no database row touched · `scripts/run-scraper.js` not touched · `/admin`, `/login`, `/setup` and `/order/[id]/manage` **found and reported, not blocked** — those are yours to decide.

**No span of the prompt arrived garbled. No instruction contradicted another** — the one point requiring judgement, that the served HTML cannot demonstrate "no bundle", is reported as a limit rather than resolved by quietly redefining the claim.
