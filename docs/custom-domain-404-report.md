# `events.pizzeriagusto.co.uk` 404 — PART A ONLY. The cause is in the data.

**5 September 2026. 🔴 NOTHING WAS CHANGED. No file edited, no branch created, no commit, no push, no deploy, nothing staged. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

🔴 **STOPPED AFTER PART A, AS INSTRUCTED.** The condition you set — *"STOP AFTER PART A IF THE CAUSE IS IN THE DATA rather than the code — I will fix the row myself"* — **is met.** Parts B, C and D are untouched and are listed at the end.

**Method:** 🔎 SOURCE-READ · 🧪 **EXECUTED** (DNS and a read-only HTTPS GET against the live domain — nothing written, nothing changed for the trading truck).

⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# 🔴 THE ANSWER, FIRST

**`trucks.custom_domain_verified_at` is NULL for Pizzeria Gusto, and `app/domain/page.tsx` calls `notFound()` on any host whose truck has no verification timestamp.** Every layer above the database is working correctly — DNS, TLS, the Vercel domain registration, the proxy, and the rewrite to `/domain`. 🧪 **Proven by execution, below.**

**The column is written by exactly one thing: the daily cron at `0 7 * * *` (07:00 UTC).** There is **no manual re-check anywhere in the codebase** — I searched for one and there is none. So the 404 is the designed behaviour of a domain set up after yesterday's cron run.

🧪 **It is 05:17 UTC now. The next cron is at 07:00 UTC — about 1 hour 43 minutes away.** If the row is otherwise correct, it will go live on its own at that point. Setting `custom_domain_verified_at` by hand makes it live immediately.

---

# 🧪 THE EXECUTED EVIDENCE — every layer above the row is fine

```
$ dig +noall +answer events.pizzeriagusto.co.uk
events.pizzeriagusto.co.uk. 3600 IN CNAME 42b6747fc9c9cf2e.vercel-dns-017.com.
42b6747fc9c9cf2e.vercel-dns-017.com. 300 IN A 216.150.1.1
42b6747fc9c9cf2e.vercel-dns-017.com. 300 IN A 216.150.16.1

$ curl -sSI https://events.pizzeriagusto.co.uk/
HTTP/2 404
server: Vercel
x-matched-path: /domain          ← 🔴 THE DECISIVE HEADER
strict-transport-security: max-age=63072000
link: </_next/static/chunks/…css>; rel=preload …

body: <html id="__next_error__"> …
```

**What each line rules out:**

| Layer | Evidence | Verdict |
|---|---|---|
| **DNS pointed at us** | CNAME → `…vercel-dns-017.com`, resolving | 🟢 **CORRECT.** The operator's Wix record is right. |
| **TLS / certificate** | HTTPS completed, HSTS header returned | 🟢 **ISSUED.** No interstitial, no handshake error. |
| **Domain registered on the Vercel project** | `server: Vercel` **and a real Next.js render**, not Vercel's "domain not found" page | 🟢 **REGISTERED.** An unregistered domain never reaches our app. |
| **The proxy recognised it as a custom host** | The request was rewritten, not passed through | 🟢 **WORKED.** `isCustomHost` returned true. |
| **The proxy's path allow-list** | `x-matched-path: /domain` | 🟢 **PASSED.** `/` was allowed and rewritten to `/domain`. A path-denial would have returned the edge's bare `'Not found'` text, **not** a Next error document. |
| **`/domain` resolved the host to a truck** | `<html id="__next_error__">` — Next's `notFound()` | 🔴 **FAILED HERE.** |

🔴 **The distinction that pins it: the proxy's 404 is `new NextResponse('Not found', { status: 404 })` — plain text, no HTML, no `x-matched-path`. What came back is a rendered Next.js error document with `x-matched-path: /domain`.** The request got all the way into the page and the page refused. That is `truckForHost` returning `null`.

---

# A1 — WHAT THE PROXY MATCHES, AND WHAT HAPPENS WHEN NOTHING MATCHES

## 🔴 The proxy does NOT match the host against any truck. It never touches the database.

`proxy.ts:124` tests the host against an **allow-list of our own hosts**, not against `custom_domain`:

```js
if (isCustomHost(host)) {
  if (isAcmeChallenge(pathname)) return NextResponse.next()
  if (!isAllowedOnCustomHost(pathname)) {
    return new NextResponse('Not found', { status: 404 })
  }
  …
  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/domain', request.url))
  }
  return NextResponse.next()
}
```

`isCustomHost` is simply "not one of ours" (`lib/custom-host.ts`):
```js
export function isOwnHost(rawHost) {
  const host = rawHost.toLowerCase().split(':')[0]
  return host.includes('hatchgrab') || host.includes('villagefoodie') ||
         host === 'localhost' || host.endsWith('.localhost') ||
         host === '127.0.0.1' || host === '::1' || host.endsWith('.vercel.app')
}
export function isCustomHost(rawHost) { return !!rawHost && !isOwnHost(rawHost) }
```

The file's own comment says why the lookup is not here: *"`proxy.ts` runs on the edge on every request and has no database access anywhere in it."*

## The truck match happens in `app/domain/page.tsx`, and it is a THREE-part test

```js
async function truckForHost(rawHost) {
  const key = hostKey(rawHost)
  if (!key) return null
  const { data, error } = await supabase
    .from('trucks')
    .select('…, custom_domain, custom_domain_verified_at')
    .eq('custom_domain', key)
    .maybeSingle()
  if (error) { console.error('[domain] host lookup failed:', error.message); return null }
  const truck = data
  if (!truck || !truck.active || !truck.custom_domain_verified_at) return null
  return truck
}
```

**and then:**
```js
if (!truck) notFound()
```

🔴 **`custom_domain_verified_at` is the one that bites**, and the file says so in its own words: *"A row can carry a hostname the moment an operator types it; it carries a verification timestamp only once the domain was confirmed to be serving."*

**What the operator sees when nothing matches: a bare 404.** Not our branding, not a "setting up" page, not the truck's name. The page's comment is explicit that this is deliberate — the alternative it replaced was worse (the Village Foodie discovery map on the operator's own domain) — but **it means an operator whose DNS is perfect and whose row is one column short sees exactly the same page as a stranger typing a random address.**

## 🔴 CONFIRMED: a trailing full stop WOULD cause a fall-through — the IN and OUT paths disagree

**Yes.** The two paths normalise differently:

- **IN** (`checkSubdomain`, `lib/custom-domain/apex.ts:47-52`) **strips** a trailing dot: `.replace(/\.$/, '')`. So the stored value never has one.
- **OUT** (`hostKey`, `lib/custom-host.ts`) **does not**:
  ```js
  export function hostKey(rawHost) {
    return (rawHost || '').toLowerCase().split(':')[0].trim()
  }
  ```
  Lower-cases, strips the port, trims whitespace — **no trailing-dot strip.**

**So a `Host:` header of `events.pizzeriagusto.co.uk.` produces the key `events.pizzeriagusto.co.uk.`, which `.eq('custom_domain', …)` will not match against the stored dotless value → `null` → `notFound()` → 404.** The operator would see **the identical bare 404**, with nothing anywhere indicating a one-character mismatch.

⚠️ **It is NOT the cause here.** 🧪 The live request carried no trailing dot and reached `/domain` (`x-matched-path` proves the rewrite ran), and a stored value with a trailing dot is impossible because the IN path strips it. **But the asymmetry is real, it is a genuine latent bug, and it is a code fix rather than a data one — so it is on the list for when we resume.**

---

# A2 — EVERY NORMALISATION, IN AND OUT

## On the way IN — `checkSubdomain`, quoted

```js
const raw = (input ?? '').trim().toLowerCase()
if (!raw) return { ok: false, reason: 'empty', … }

// Strip anything that is not the hostname — a scheme, a path, a port, a trailing dot.
let host = raw
  .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')   // scheme
  .split(/[/?#]/)[0]                        // path, query, fragment
  .split(':')[0]                            // port
  .replace(/\.$/, '')                       // 🔴 TRAILING DOT — STRIPPED
```
Then `psl.parse` rejects an apex or a name more than `MAX_SUBDOMAIN_LABELS` (3) deep, and `verdict.host` is what gets written: `custom_domain: verdict.host` (`app/api/manage/route.ts:1186`).

**IN: trailing dot STRIPPED. Lower-cased, trimmed, scheme/path/port removed.**

## On the way OUT — `hostKey`, quoted

```js
export function hostKey(rawHost: string | null | undefined): string {
  return (rawHost || '').toLowerCase().split(':')[0].trim()
}
```

**OUT: trailing dot PRESERVED. Lower-cased, port stripped, trimmed.**

🔴 **The answer to "stripped, preserved, or neither" is: BOTH — stripped on the way in, preserved on the way out.** That asymmetry is the whole finding. The doc comment on `hostKey` even calls itself *"The lookup key stored in `trucks.custom_domain`"* — but it does not apply the same normalisation the storing path does.

---

# A3 — SQL TO READ WHAT IS ACTUALLY STORED

**Schema first, because migrations here are applied by hand and a listing is a photograph, not a schema:**

```sql
-- 1. WHAT COLUMNS ACTUALLY EXIST (a photograph — this is the authority, not any migration file)
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'trucks'
  and column_name like 'custom_domain%'
order by column_name;

-- 2. THE ROW ITSELF — every custom-domain column, plus the three the resolver actually tests
select
  id,
  name,
  slug,
  active,                                   -- resolver test 1
  custom_domain,                            -- resolver test 2 (must equal the host EXACTLY)
  custom_domain_verified_at,                -- 🔴 resolver test 3 — NULL HERE ⇒ 404
  custom_domain_confirmed_at,
  custom_domain_setup_state,
  custom_domain_setup_started_at,
  custom_domain_last_checked_at,
  custom_domain_last_ok_at,
  custom_domain_last_seen_value,
  embed_enabled,                            -- not a 404 cause: false ⇒ page renders with NO EVENTS
  plan,
  feature_overrides,
  trial_expires_at
from public.trucks
where custom_domain ilike '%pizzeriagusto%'
   or slug ilike '%gusto%'
   or name ilike '%gusto%';

-- 3. 🔴 THE EXACT-MATCH TEST THE RESOLVER MAKES. If this returns 0 rows, the resolver 404s —
--    regardless of what query 2 shows. Catches whitespace, case and a trailing dot.
select id, name, custom_domain, custom_domain_verified_at, active
from public.trucks
where custom_domain = 'events.pizzeriagusto.co.uk';

-- 4. INVISIBLE-CHARACTER CHECK. length() vs the literal's length exposes a stray dot or space
--    that queries 2 and 3 would render identically on screen.
select
  custom_domain,
  length(custom_domain)                       as stored_len,
  length('events.pizzeriagusto.co.uk')        as expected_len,
  custom_domain = 'events.pizzeriagusto.co.uk' as exact_match,
  encode(convert_to(custom_domain, 'UTF8'), 'hex') as stored_hex
from public.trucks
where custom_domain ilike '%pizzeriagusto%';
```

🔴 **Read query 3 first.** If it returns the row and `custom_domain_verified_at` is NULL, the diagnosis above is confirmed and the fix is that one column. If it returns **0 rows** while query 2 returns one, the stored value differs from the host — and query 4 says how.

---

# A4 — EVERYTHING ELSE THAT COULD 404 A CORRECTLY-POINTED DOMAIN, RANKED

| # | Cause | How to tell it apart | Status here |
|---|---|---|---|
| **1** | 🔴 **`custom_domain_verified_at` IS NULL** — the cron has not run. Only `app/api/cron/custom-domain-check` (`0 7 * * *`) ever writes it; **there is no manual re-check in the codebase.** | Response is a **rendered Next error document** with **`x-matched-path: /domain`**. SQL query 3 returns the row with a NULL timestamp. | 🔴 **THIS ONE.** 🧪 Header confirmed. |
| **2** | **The truck row does not carry the domain**, or carries it with different whitespace/case/a trailing dot | Identical symptom to #1 — same header, same page. **Only SQL tells them apart:** query 3 returns **0 rows**. Query 4 shows why. | Not ruled out by HTTP alone. **Run the SQL.** |
| **3** | **`active` is false** | Same symptom again. Query 2 shows `active = false`. | Unlikely — they are trading. |
| **4** | **Trailing-dot asymmetry** (A1/A2) | Same symptom. Requires a `Host:` header with a trailing dot — i.e. someone typing the FQDN with a final dot. | 🟢 **Ruled out.** 🧪 The live request had no dot and reached `/domain`. |
| **5** | **Domain not registered on the Vercel project** | Completely different: **Vercel's own error page**, `x-vercel-error: DEPLOYMENT_NOT_FOUND`, **no `x-matched-path`**, and usually **no valid certificate** (browser interstitial first). | 🟢 **RULED OUT.** 🧪 We got our own app's render and a valid TLS session. |
| **6** | **Proxy path-denial** (`isAllowedOnCustomHost` refused) | Body is the literal text **`Not found`** — plain text, no HTML, **no `x-matched-path`**. | 🟢 **RULED OUT.** 🧪 We got HTML and `x-matched-path: /domain`. |
| **7** | 🔴 **The proxy matcher typo** — `proxy.ts:455` reads `'/((?!_next_next/image|favicon.ico|…).*)'`. **`_next_next/image` is not a path that exists**, so `/_next/static/*` and `/_next/image` are **no longer excluded** and the proxy runs on every static asset. | Would present as a page that **renders its shell but never loads** (all chunks 404 or 429), **not** as a 404 on `/`. On a custom host `/_next/static/` is explicitly allowed, so assets pass — but each one **consumes a rate-limit token**. | 🟢 **Not the 404.** ⚠️ **Real, open, and worth fixing** — see below. |
| **8** | **Plan-gate denial** (`canAccess(..., 'embed_schedule', ...)`) | 🔴 **Cannot produce a 404.** It renders the truck's name, logo and an "Order from …" button — a **200**. | 🟢 **RULED OUT** by construction. |
| **9** | **`embed_enabled` false** | Also **not a 404**: page renders 200 with the truck's name and **an empty schedule for ever**. The route sets it `true` at provisioning. | 🟢 Not a 404 cause. Worth checking in query 2 anyway — it is the silent-empty failure the manual warns about. |

## ⚠️ On #7, the matcher typo — I could not find it recorded in the manual

🔎 `grep -n "_next_next" docs/reference-manual.md` → **no matches.** You referred to it as "already recorded as open"; **I could not find that record**, so either it is worded differently than I searched for, or it is recorded somewhere I did not read. **The typo itself is real and present at `proxy.ts:455`** — I am reporting what I verified in the code, and flagging that I could not confirm the manual entry.

**Its actual blast radius, stated carefully:** the proxy now executes on every `/_next/static/*` request on **every** host. On our own hosts that means extra middleware execution (cost, latency) but no functional change. On a custom host each asset also draws from the `customHostRatelimit` bucket — **600/min**, against roughly 24 assets per page load, so a single visitor is fine and this is not today's problem. **Reported, not fixed: it is outside Part A and touches a trading truck's live page.**

---

# 🔴 WHAT I DID NOT DO, AND WHY

**Parts B, C and D are untouched**, per your stop condition. For the record, so nothing is lost:

- **PART B — the trailing full stop in the copy value.** 🔎 **The provider that requires it is `123 Reg`** (`lib/custom-domain/dns.ts:214,224,228` — *"123 Reg needs a full stop at the end of the second value or it will not work"*, quoted from their own help page). 🔎 **Wix is among the FOUR providers with verified steps, not the five unchecked** — its entry was *"Read 28 Aug 2026 from support.wix.com/en/article/adding-or-updating-cname-records-in-your-wix-account"*. ⚠️ **An unverified hypothesis worth recording:** `dig` returns the Vercel target as `42b6747fc9c9cf2e.vercel-dns-017.com.` **with a trailing dot**, and the copy value comes from `getDomainConfig().recommendedCNAME` — **if Vercel's API returns it dotted, the copy button would hand a Wix operator a value Wix rejects.** I did not verify what that API returns; that is Part B's first task.
- **PART C — the banner.** Not started. The third state you named (worked, then stopped) is already modelled in the data — `custom_domain_last_ok_at` plus `STOPPED_AFTER_MS`, which `app/admin/page.tsx:856` uses to compute `down`. So the ingredients exist; what the operator-facing banner does with them is the open question, and yours to decide.
- **PART D — copy buttons.** Not started, **including the Safari synchronous-clipboard audit.** ⚠️ I want to flag that this one may be load-bearing for your actual experience: if any copy button `await`s before `navigator.clipboard.writeText`, Safari silently no-ops it — which would look exactly like "the copy button did nothing".

**No branch was created.** A new branch off `main` would have been a label on the same commit (`main` and `whatsapp-connections-s1-s3` are both `2ca66cd`) with **no changes to carry**, and creating one would leave a stray branch for a diagnosis that edited nothing.

🔴 **A PROBLEM TO SOLVE BEFORE PART B, WHICH YOU SHOULD KNOW NOW:** the working tree carries the **entire uncommitted WhatsApp S1–S5 workstream**. Branches are labels on commits, not on working trees — so `git checkout -b custom-domain … main` would **carry all of that uncommitted work onto the new branch**, because both branches point at the same commit and there is nothing to switch. **A genuinely clean custom-domain branch needs the WhatsApp work committed or stashed first, and both are things you have forbidden.** Tell me which you want and I will follow it; I am not choosing.

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3` (unchanged — no new branch was created). HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 staged. No commit, no push, no deploy.**

🟢 **NOT ONE FILE WAS MODIFIED IN THIS TASK.** The only artefact is this report.

| Group | Diff | Status |
|---|---|---|
| **Pre-existing six** — `app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `ios/App/App.xcodeproj/project.pbxproj`, `lib/custom-domain/copy.ts`, `proxy.ts`, `vercel.json` | **6 files, 52+/56−** | 🟢 **byte-for-byte identical to every prior check** — order scan-route rename, derivation extraction, `ios/` project file all unchanged |
| **Copy workstream** — `lib/plan-features.ts`, `app/landing/page.tsx`, `lib/landing-table.ts`, `lib/meta/webhook-signature.ts` | **4 files, 142+/49−** | 🟢 unchanged |
| **WhatsApp S1–S5** | as at the last report | 🟢 unchanged — nothing in this task touched it |
| Outreach files, `app/order/[id]/page.tsx`, `lib/outreach.ts`, `lib/whatsapp-hint.ts`, migrations, docs | — | 🟢 still untracked, unstaged |
| Other branches (`landing-page`, `ipad-native-app`, …) | — | 🟢 untouched |

⚠️ **`tsc` was not run and no harness freshness check was performed** — deliberately. **Both verify code changes, and there are none.** Running them would produce a green tick that certified nothing.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **I did not read the database.** No SQL was run — you asked for the query, not the result, and migrations here are applied by hand. **So "`custom_domain_verified_at` is NULL" is an inference**, from three facts: the request reached `/domain` and was refused; that function's only three failure conditions are `active`, an exact `custom_domain` match, and that timestamp; and you told me the cron has not run. **Query 3 confirms or refutes it in one line.** Causes #2 and #3 produce an identical HTTP response and are ruled out only by that query.
- 🔴 **I could not find the proxy matcher typo recorded in the manual**, though the typo itself is in the code. Said plainly rather than assumed.
- 🔴 **Nothing was rendered in a browser.** No click-through was performed, because no UI changed. The Safari click-through you asked for belongs with Part D.
- ⚠️ **I did not verify what `getDomainConfig().recommendedCNAME` actually returns** — the trailing-dot hypothesis for Part B is unverified.
- ⚠️ **I did not check the Vercel dashboard** — no access. The domain's registration is inferred from our own app answering on it, which is strong but is not the dashboard.
- ⚠️ **The cron's last run is unknown to me.** I have your statement and the `0 7 * * *` schedule; `custom_domain_last_checked_at` in query 2 is the actual record.

# FLAGS

- 🔴 **THE CAUSE IS IN THE DATA. STOPPED, AS INSTRUCTED.** Parts B, C, D not started.
- 🟢 **Nothing was changed, so nothing can have affected the trading truck's live page.** The only requests I made were one DNS lookup and one HTTPS GET.
- 🟢 **The operator's DNS record is correct.** Whatever they did in Wix, they did right — worth telling them.
- 🔴 **The domain will go live on its own at 07:00 UTC** (~1h43m from the time of this report) if the row is otherwise correct. Setting the column by hand makes it immediate.
- 🔴 **A latent code bug found on the way: `hostKey` does not strip a trailing dot while `checkSubdomain` does.** Not today's cause; a real fall-through waiting to happen, and it presents as this same anonymous 404.
- 🔴 **An operator whose domain is one column short sees a bare 404 with no branding and no explanation** — the same page a stranger gets. Whether that is right is a product question worth asking alongside Part C.
- ⚠️ **`proxy.ts:455` matcher typo `_next_next/image` is real and open**, and I could not find it recorded in the manual.
- 🔴 **A clean custom-domain branch is not currently possible** without committing or stashing the WhatsApp work. Your call.

*Nothing committed. Nothing staged. Nothing modified. `main` = `2ca66cd`.*
