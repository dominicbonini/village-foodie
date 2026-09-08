# Reaching the main site from a Mac and a phone — PART A ONLY. No code is needed.

**5 September 2026. Branch `whatsapp-connections-s1-s3`. 🔴 NOTHING WAS CHANGED. No file edited, no commit, no push, no deploy, nothing staged. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

🔴 **STOPPED AFTER PART A, AS INSTRUCTED.** The condition you set — *"STOP AFTER PART A IF NO CODE CHANGE IS NEEDED. If a Bonjour name or a tunnel hostname already resolves to the main site, say so plainly and build nothing"* — **is met, for both goals.** Part B was not built. Part C is answered below.

**Method:** 🔎 SOURCE-READ · 🧪 **EXECUTED** — every host result below was produced by sending a `Host:` header at your running dev server on :3000. Nothing was written; every request was a `GET /`.

⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**

## 🔴 CONFIRMED: NOTHING CHANGES WHAT `events.pizzeriagusto.co.uk` OR ANY ORDERING PATH SERVES

**No file was modified.** 🧪 And the live host was exercised read-only during the diagnosis: `Host: events.pizzeriagusto.co.uk` → **200, `<title>Pizzeria Gusto</title>`** — their schedule page, served correctly, from the same production database the dev server reads.

---

# 🔴 THE ANSWER, FIRST

**Both goals are already solvable, today, with no code — because `isOwnHost` matches the substring `hatchgrab` anywhere in the host.**

| Goal | Solution | Proven |
|---|---|---|
| **Mac + phone on one Wi-Fi** | **Rename the Mac so its name contains `hatchgrab`** → System Settings → General → About → Name. Its Bonjour name becomes `hatchgrab….local`, which contains the substring. | 🧪 `Host: hatchgrab.local:3000` → **200, HatchGrab landing**. `Host: hatchgrabs-macbook.local:3000` → **200, HatchGrab landing**. |
| **HTTPS for Embedded Signup** | **Name the tunnel hostname so it contains `hatchgrab`** — ngrok reserved domain, Cloudflare named tunnel, whatever you use. | 🧪 `Host: hatchgrab-dev.ngrok-free.app` → **200, HatchGrab landing**, and `/manage/x` → **307 (reached the app)**. |

🟢 **One tunnel hostname does solve both problems at once, exactly as you hoped — provided its name contains `hatchgrab`.**

---

# A1 — HOW A HOST IS RESOLVED

## The classifier — one file, quoted in full

`lib/custom-host.ts`:

```js
export function isOwnHost(rawHost) {
  if (!rawHost) return false
  const host = hostKey(rawHost)            // lower-cased, port stripped, trimmed, ONE trailing dot stripped
  return (
    host.includes('hatchgrab')     ||      // 🔴 SUBSTRING, ANYWHERE IN THE HOST
    host.includes('villagefoodie') ||      // 🔴 SUBSTRING
    host === 'localhost'           ||
    host.endsWith('.localhost')    ||
    host === '127.0.0.1'           ||
    host === '::1'                 ||
    host.endsWith('.vercel.app')
  )
}

export function isCustomHost(rawHost) {
  return !!rawHost && !isOwnHost(rawHost)
}
```

**Seven recognised forms**, and 🔴 **the first two are `includes`, not equality or suffix tests. That is the whole finding**: any hostname with `hatchgrab` anywhere in it — `hatchgrab.local`, `dominic-hatchgrab.local`, `hatchgrab-dev.ngrok-free.app` — is classified as ours. The file's own comment calls this *"deliberately matching the existing `includes` shape"*.

**The localhost forms:** `localhost` exactly, **any** `*.localhost`, `127.0.0.1`, `::1`.
**The IP forms:** only `127.0.0.1` and `::1`. 🔴 **No LAN IP is recognised** — `192.168.x.x` is not ours.

## What happens after classification — `proxy.ts:124`

```js
if (isCustomHost(host)) {
  if (isAcmeChallenge(pathname)) return NextResponse.next()
  if (!isAllowedOnCustomHost(pathname)) return new NextResponse('Not found', { status: 404 })
  …
  if (pathname === '/') return NextResponse.rewrite(new URL('/domain', request.url))
  return NextResponse.next()
}
```
An unrecognised host reaches an **allow-list of two paths** (`/`, `/api/embed/events`, plus `/_next/static/` and `/.well-known/`). `/` is rewritten to `/domain`, which looks the host up in `trucks.custom_domain`; no match ⇒ `notFound()`.

⚠️ **There is a third distinction beyond ours-vs-theirs, and it is the one that decides what `/` renders:** `proxy.ts:446` — `if (pathname === '/' && isHatchGrab(host))` rewrites to `/landing`. `isHatchGrab` is `host.includes('hatchgrab')`. **So `localhost` is "ours" but is NOT "HatchGrab", and its `/` renders the Village Foodie discovery map.**

---

# A2 — EVERY FORM, EXECUTED

🔴 **What this proof would look like if it were proving nothing:** curl could have sent the same default `Host` every time, making every row identical and the whole table meaningless. **Ruled out by including two hosts that MUST disagree** — `localhost` and a LAN IP. They returned 200 and 404 respectively, so the header is being honoured and the classifier is being reached.

🧪 **All eight EXECUTED** against your running dev server, `GET /`:

| `Host:` | Status | What it served | Classification |
|---|---|---|---|
| `hatchgrab.localhost:3000` | **200** | *HatchGrab — The ordering system built for food trucks* | **MAIN SITE** (both `includes('hatchgrab')` and `.localhost`) |
| `localhost:3000` | **200** | **`<title>Village Foodie</title>`** | ours, **but not HatchGrab** — the discovery map |
| `127.0.0.1:3000` | **200** | **`<title>Village Foodie</title>`** | ours, **but not HatchGrab** — the discovery map |
| `dominics-macbook.local:3000` | **404** | Next `notFound()` | 🔴 **truck lookup, no match** |
| `192.168.1.42:3000` | **404** | Next `notFound()` | 🔴 **truck lookup, no match** |
| `random-tunnel-abc123.trycloudflare.com` | **404** | Next `notFound()` | 🔴 **truck lookup, no match** |
| **`hatchgrab-dev.ngrok-free.app`** | **200** | *HatchGrab — The ordering system built for food trucks* | 🟢 **MAIN SITE** |
| `events.pizzeriagusto.co.uk` | **200** | **`<title>Pizzeria Gusto</title>`** | truck lookup, **matched** |

## 🧪 THE DECIDING TEST — is it the substring, or is it `.local`?

🔴 **Failure mode if this proved nothing:** if *every* `.local` name returned 200, the result would be about the suffix, not the substring, and the whole recommendation would be wrong. **Ruled out by testing a `.local` name without the substring alongside — they must disagree.**

| `Host:` | Status | Served |
|---|---|---|
| `hatchgrab.local:3000` | **200** | HatchGrab landing |
| `hatchgrabs-macbook.local:3000` | **200** | HatchGrab landing |
| **`dominics-macbook.local:3000`** | **404** | — |
| `dominic-hatchgrab.local:3000` | **200** | HatchGrab landing |

🟢 **They disagree. It is the substring, not the suffix.** `.local` is not special; `hatchgrab` is.

## And the surface a phone actually needs

🧪 `GET /manage/x`:

| `Host:` | Result |
|---|---|
| `localhost:3000` | **307** — reached the app |
| `hatchgrab-dev.ngrok-free.app` | **307** — reached the app |
| `192.168.1.42:3000` | **404** — bare edge refusal (`/manage` is not on the custom-host allow-list) |
| `dominics-macbook.local:3000` | **404** — bare edge refusal |

⚠️ **Note the two different 404s.** On `/` an unrecognised host gets a **rendered Next `notFound()`** (the truck lookup ran and failed). On `/manage` it gets the proxy's **bare `'Not found'` text** — the path is not on the allow-list, so the request never reaches a route. Both are 404; only one involved a database read.

---

# A3 — 🔴 THE FALL-THROUGH TREATS AN UNRECOGNISED HOST AS A **TRUCK LOOKUP**

**Not as the main site.** `isCustomHost` is the negation of an allow-list, and `lib/custom-host.ts` says so deliberately:

> *"IT IS AN ALLOW-LIST, NOT A DENY-LIST, AND THAT DIRECTION IS DELIBERATE. A host we do not recognise is treated as an operator's, which means default-deny routing and no analytics. The opposite shape … would fail OPEN on a host we had not thought of. This fails closed."*

🟢 **That is the correct direction and must not be reversed.** It is what stopped an unknown host reaching the Village Foodie discovery map on an operator's own domain — the V11.48 finding this whole feature exists to fix.

🔴 **So on the literal question — "does an unrecognised host reach the main site?" — the answer is NO, and by design.** ⚠️ **But that is not the question that decides whether code is needed**, because the hosts you actually want are not unrecognisable: **you get to name them**, and naming one with `hatchgrab` in it makes it recognised. **That is why the stop condition is met despite A3 answering "truck lookup".**

---

# A4 — EVERY NORMALISATION SITE, COUNTED

🧪 **Counted before reporting. ONE normaliser, three exported predicates, five call sites.**

**The normaliser — `hostKey`, `lib/custom-host.ts:77`:** lower-case → strip port → trim → strip **one** trailing dot.

| Consumer | Where | Routes through `hostKey`? |
|---|---|---|
| `isOwnHost` | `lib/custom-host.ts:22` | 🟢 **yes** — since the 5 September fix |
| `isCustomHost` | `lib/custom-host.ts:47` | 🟢 yes, via `isOwnHost` |
| `proxy.ts:124` | the edge classification | 🟢 yes, via `isCustomHost` |
| `app/domain/page.tsx:60` | `.eq('custom_domain', hostKey(rawHost))` | 🟢 **direct** |
| `app/domain/page.tsx:106` | the metadata base URL | 🟢 direct |
| `app/providers.tsx:51, :75` | client-side, `isCustomHost(window.location.host)` | 🟢 yes, via `isCustomHost` |

🟢 **They all agree after the trailing-dot fix.** 🧪 `grep -rn "toLowerCase().split(':')"` across `app`, `lib` and `proxy.ts` returns **one hit, and it is the comment recording the removal of the second normaliser** — `isOwnHost` used to open-code it, minus the trim and minus the dot strip, which is precisely how `localhost.` came to classify as a customer's domain.

## 🧪 Freshness — the dev server is running THIS working tree

**No harness was built** (nothing was copied, nothing was edited), so the freshness question that applies is whether the server I probed is serving the current source. **Probed with today's own trailing-dot fix, a marker that did not exist this morning:**

```
Host: events.pizzeriagusto.co.uk    → 200  <title>Pizzeria Gusto</title>
Host: events.pizzeriagusto.co.uk.   → 200  <title>Pizzeria Gusto</title>   ← the dotted form
```
🟢 **A pre-fix server would have 404'd the dotted host.** It serves. The server is current.

---

# PART B — NOT BUILT

🔴 **No code change is needed and none was made.** Both goals are reachable by naming, proven by execution above. Building a development-only fall-through would have added a branch to the exact function that returned a bare 404 on a trading truck's live address, to solve a problem that a Settings rename solves for free.

⚠️ **For the record, had it been needed, the guard would have been `process.env.NODE_ENV !== 'production'` combined with `!process.env.VERCEL` — and the reasoning you asked for is that a `NODE_ENV` check in Next.js is not merely a runtime test: Next substitutes `process.env.NODE_ENV` at build time via webpack's DefinePlugin, so in a production bundle the branch becomes `if (false)` and is removed by the minifier — the code is not present, not merely unreachable.** ⚠️ **I did not run a production build to confirm that elimination**, which is exactly why the second, independent runtime guard (`VERCEL` is set in every Vercel build and runtime) would have been there too. **None of this was implemented.**

---

# PART C — THE HTTPS QUESTION

**What would have to be true for an arbitrary stable tunnel hostname to serve the main site in development:** `isOwnHost(host)` must return `true` for it, **and** — if you want `/` to render the HatchGrab landing rather than the Village Foodie map — `isHatchGrab(host)` must also be true. Both are satisfied by the single condition **`host.includes('hatchgrab')`**.

🟢 **So Part A already satisfies it, and Part B is not required.** 🧪 **Proven**: `hatchgrab-dev.ngrok-free.app` served the HatchGrab landing at `/` and reached the app at `/manage/x`, with no code changes.

**What you need from the tunnel provider is a *named* hostname, not a random one:**
- 🔴 A random Cloudflare quick-tunnel name (`random-tunnel-abc123.trycloudflare.com`) 🧪 **returns 404** — tested.
- 🟢 Any provider that lets you choose the subdomain works: an ngrok reserved domain, a Cloudflare **named** tunnel, a Tailscale Funnel name — **as long as `hatchgrab` appears somewhere in it.**

⚠️ **Two things this does not settle, and they are Meta's, not ours:** the tunnel hostname must be added to the app's **allowed domains** in Meta's dashboard, and Embedded Signup requires **HTTPS**, which the tunnel provides and which localhost never can. 🔴 **I installed, configured and ran nothing — that is yours.**

---

# THE CLICK-THROUGHS

## Safari on macOS — 🟢 you can run all of these

1. `http://hatchgrab.localhost:3000/` → **the HatchGrab landing.** (Already works, no rename needed, Mac only.)
2. `http://localhost:3000/` → 🔴 **the Village Foodie map, not HatchGrab.** Expected — `localhost` is "ours" but does not contain `hatchgrab`. **Wrong if you expected the landing; use form 1.**
3. **After renaming the Mac** (System Settings → General → About → Name → something containing `hatchgrab`): `http://hatchgrab.local:3000/` → **the HatchGrab landing.**
4. `http://<your-mac-name>.local:3000/manage/<dashboard_token>` → the Manage app.

## A phone on the same Wi-Fi — 🔴 I CANNOT RUN ANY OF THESE

**I have no phone and no LAN. Every step here is yours.**

5. 🔴 **First, rename the Mac** as in step 3. Without it, every step below 404s — 🧪 proven: `dominics-macbook.local` returned **404**.
6. **Confirm the dev server is listening on the LAN, not just loopback.** Next binds all interfaces by default, but if you started it with `-H 127.0.0.1` the phone cannot connect at all. **A connection refused here is not a host-matching problem** — it is the bind address, and nothing in this report touches it.
7. On the phone, Safari → `http://hatchgrab.local:3000/` → **the HatchGrab landing.** ⚠️ **iOS resolves `.local` over mDNS/Bonjour and both devices must be on the same Wi-Fi** — a guest network or client isolation breaks it, and that is a router setting, not code.
8. `http://hatchgrab.local:3000/manage/<dashboard_token>` → the Manage app on the phone.
9. 🔴 **Embedded Signup will NOT work over `http://.local`.** Meta requires HTTPS. That needs the tunnel, step 10.
10. **With a tunnel named to contain `hatchgrab`:** open `https://<name>.ngrok-free.app/` on either device → **the HatchGrab landing**, then `/manage/<token>` → Settings → **Set up**. ⚠️ **Add that hostname to Meta's allowed domains first**, or the flow will refuse to open.

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 staged. No commit, no push, no deploy.**

🟢 **NOT ONE FILE WAS MODIFIED BY THIS TASK.** The only artefact is this report.

⚠️ **`lib/custom-host.ts` (+37/−4) and `proxy.ts` (+9/−1) do show as modified — those are from EARLIER tasks**, not this one: `custom-host.ts` carries the 5 September trailing-dot fix, and `proxy.ts` is one of the pre-existing five and has not been touched by any task in this session.

🧪 **`tsc` exit 0** — ⚠️ **and it certifies nothing here, because no code changed.** Run for completeness because you asked; a green typecheck on an unmodified tree is not evidence of anything.

## The `git add -p` set — 🟢 UNCHANGED AT SIX. This task adds none.

| # | File | Carries |
|---|---|---|
| 1 | `lib/custom-domain/copy.ts` | custom-domain **+** pre-existing uncommitted work |
| 2 | `app/manage/[token]/page.tsx` | custom-domain **+** WhatsApp S1–S5 |
| 3 | `app/api/manage/route.ts` | custom-domain **+** WhatsApp S1–S5 |
| 4 | `app/landing/page.tsx` | WhatsApp go-live copy **+** Android |
| 5 | `lib/plan-features.ts` | WhatsApp go-live copy **+** Android |
| 6 | `lib/landing-table.ts` | WhatsApp go-live copy **+** Android |

**Everything else unchanged**, verified this run: the pre-existing five, the copy workstream, the WhatsApp libs, the custom-domain group, `app/admin/page.tsx`, `app/domain/page.tsx` (0 changes), and the outreach files. `docs/reference-manual.md` carries the V12.3 merge from the previous task and was not touched by this one.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **I did not test from a phone, or over a LAN, or through a tunnel.** I have neither. **Every result above came from a `Host:` header sent at loopback** — which exercises the classifier exactly, and exercises **nothing** about mDNS resolution, Wi-Fi client isolation, the dev server's bind address, or TLS. **Steps 5–10 are yours.**
- 🔴 **`hatchgrab.local` was proven at the classifier, not at the network.** The 200 says our code would serve it; it does not say your phone can resolve it. Those are different claims and only the first is mine.
- ⚠️ **I did not rename the Mac.** The recommendation rests on the Bonjour name following the computer name, which is standard macOS behaviour I did not verify on this machine.
- ⚠️ **No production build was run**, so the dead-code-elimination reasoning in Part B is stated as mechanism, not observation. **It is moot — nothing was built.**
- ⚠️ **The dev server is yours and I did not restart it.** The freshness probe shows it is current; it does not show which env file it loaded.
- 🔴 **Nothing about Meta's dashboard was checked** — whether a tunnel hostname is on the app's allowed domains is a setting I cannot read.

# FLAGS

- 🟢 **NO CODE WAS NEEDED AND NONE WAS WRITTEN.** Both goals are solved by naming.
- 🔴 **The mechanism is `host.includes('hatchgrab')` — a substring match anywhere in the host.** Name the Mac and the tunnel with it in and both problems disappear.
- 🔴 **`localhost:3000` serves the Village Foodie map, not HatchGrab.** Use `hatchgrab.localhost:3000` on the Mac. This surprises people and is not a bug.
- ⚠️ **The fall-through treats an unknown host as a truck, and that direction must not be reversed** — it is what stops a stranger's domain reaching the discovery map.
- 🟢 **One tunnel hostname does solve both problems**, provided it is a *named* one containing `hatchgrab`. A random quick-tunnel name 404s — tested.
- 🟢 **The `git add -p` set is unchanged at six files.**

*Nothing committed. Nothing staged. Nothing modified. `main` = `2ca66cd`.*
