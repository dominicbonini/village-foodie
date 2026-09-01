# One press, and testing the serving path on localhost

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every string, comparison and attribute quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean. `npx eslint`: no new rule violated.
- **Execution** — the **real `setUp()` was driven through eight pre-flight outcomes** with a stubbed
  `fetch`, and the resulting state inspected; the **real `hostKey`, `isCustomHost`,
  `isAllowedOnCustomHost` and `canAccess` were executed**; and the **real host lookup was replayed
  against the live database, read-only**, for four host forms.

**NO DEPLOY. NO MIGRATION. NO SQL EXECUTED. NO DOMAIN ADDED TO VERCEL.** Pizzeria Gusto's row was read
in a `SELECT` alongside eleven others and **not written**. Tikka Tonic is untouched.
**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**
⚠️ **One item turned out to need no change at all — Part B.2. I have not invented one.**

---

# PART A — ONE PRESS

## What blocks, and what does not

**One button. One action.** `setUp()` runs the client apex guard, then `domain_preflight`, then
`domain_provision`, and lands on the record screen. **Driven by execution, all eight outcomes:**

| Pre-flight result | Phases the operator sees | Lands on | What they see |
|---|---|---|---|
| clean, provider found | `Checking…` → `Setting up…` | **RECORD** | nothing — it goes through |
| clean **+ address already in use** | `Checking…` → `Setting up…` | **RECORD** | nothing — it goes through |
| CAA **unknown** | `Checking…` → `Setting up…` | **RECORD** | nothing — it goes through |
| pre-flight **threw** (network) | `Checking…` → `Setting up…` | **RECORD** | nothing — fail open, unchanged |
| 🔴 **CAA restricted** | `Checking…` → stop | address | **"We have not set this up."** + the padlock reason |
| 🔴 **CAA blocked** | `Checking…` → stop | address | **"We have not set this up."** + the padlock reason |
| pre-flight **refused** (`ok:false`) | `Checking…` → stop | address | its own message, e.g. *"That address will not work."* |
| provisioning **failed** | `Checking…` → `Setting up…` → stop | address | the failure block from the last workstream, button becomes `Try again` |

🔴 **ONLY A CERTIFICATE-AUTHORITY PROBLEM INTERRUPTS, AND BOTH STATES DO.** Whether the domain refuses
every issuer (`blocked`) or refuses ours (`restricted`), **the certificate does not issue as things
stand** — so carrying on would attach a domain to the hosting project that **cannot serve**, and leave
the operator waiting for a padlock that never arrives. It fails silently in production, which is
exactly why it must be loud here.

⚠️ **THIS REVERSES WHAT THE `restricted` COPY USED TO SAY, AND THE COPY IS REWRITTEN TO MATCH.** It read
*"This still works without it"* and let the operator continue. It now reads:

> Whoever looks after your web address has to let us set up the padlock — the little lock customers see
> beside it. **Until they add us it will not appear, so we have stopped rather than leave you waiting
> for it.** Ask them to add us, then try again.

**`blocked`:**

> Your web address currently blocks the padlock completely. Whoever looks after it has to allow it
> before this can work. **Ask them to change that, then try again.**

**Everything else is carried through.** The provider's name is not a decision, it is an instruction —
so it goes to the record screen where they act on it. An address that already answers elsewhere is not
a refusal either; the record screen already says what to do about it.

⚠️ **CONSEQUENCE, STATED: `already_elsewhere` IS NOW NEVER SHOWN TO ANYONE.** It only rendered inside
the `pre` block, and `pre` is now set **only** when the certificate check stops the run. It still
reaches the client and is still logged server-side; it simply has no screen. That follows your
instruction, and it is the one warning that quietly disappeared.

## The button carries the progress

```
Set up this address   →   Checking…   →   Setting up…   →   the record screen
```

**No second screen and no spinner.** A phase rather than a boolean, because the halves take different
times for different reasons: the check is up to five outbound lookups, the setup is one call to the
hosting API. Watching `Checking…` become `Setting up…` tells the operator it is still moving.

**What it replaced:** press `Check this address`, watch **the same screen** re-render with a different
button, press `Set up this address`. With no warnings — the ordinary case — **nothing visible changed
between them**, so the second press read as the first one having failed.

## 🔴 THE BUG THIS ALMOST INTRODUCED, AND HOW IT IS AVOIDED

`setProvider()` does **not** update the `provider` variable in the same tick. Calling provisioning
straight after it would have built the record rows from the **previous render's** value — `null` on a
first run — **silently dropping the provider's name and its field labels from the record screen**,
which is the one place your brief says the provider is useful.

**The provider is passed as an argument, not read from state.** Proven by execution with the real
Cloudflare record:

```
  step   : record
  rows   : [ {"label":"Type","value":"CNAME"}, {"label":"Name","value":"events"},
             {"label":"Target","value":"cname.vercel-dns.com"} ]
  provider carried through: Cloudflare
```

**`Target` is Cloudflare's own word for that field** (`recordLabels.value`), not the generic `Value`.
That is the proof the provider reached `recordRows`.

## ⚠️ THE PRE-FLIGHT LIMITER — STILL APPROPRIATE, WITH ONE CHANGED CONSUMER

`Ratelimit.slidingWindow(10, '10 m')`, keyed `preflight:${truck.id}`. **Unchanged, and I did not touch
it.** Its stated sizing is *"the worst LEGITIMATE journey, which is a person typing… five or six
attempts with headroom for a double-submit."*

**The count per attempt is identical.** Before: one pre-flight on press one, provisioning on press two.
Now: one pre-flight and one provisioning on the single press. **The same one call per attempt.**

🔴 **WHAT CHANGED IS RETRIES.** Previously `pre` was cached, so pressing `Set up this address` again
after a provisioning failure re-ran **provisioning only**. Now every retry re-runs the check too. With
the hosting credentials unset **every** provisioning fails, so an operator pressing `Try again` ten
times inside ten minutes now hits the limiter and gets *"Too many checks just now. Try again in a few
minutes."*

**I judge that still appropriate, and it is a judgement rather than a measurement:** ten presses of a
failing button in ten minutes is a person hammering something broken, which is what a ceiling is for,
and the 429 copy is honest. ⚠️ **The alternative — reuse the previous check on an immediate retry —
would save the budget but skip the certificate check on the retry, so a CAA record added between
attempts would go unnoticed. Not done, and recorded so the trade is visible.**

---

# PART B — THE SERVING PATH ON LOCALHOST

## 1. 🔴 READ FIRST: THE PORT **IS** STRIPPED. NOTHING IS BROKEN.

The comparison, quoted exactly — `lib/custom-host.ts:47-50`:

```ts
/** The lookup key stored in `trucks.custom_domain`: lower-cased hostname, no port, no scheme. */
export function hostKey(rawHost: string | null | undefined): string {
  return (rawHost || '').toLowerCase().split(':')[0].trim()
}
```

and its only use on this path — `app/domain/page.tsx:59-66`:

```ts
async function truckForHost(rawHost: string | null): Promise<DomainTruck | null> {
  const key = hostKey(rawHost)
  if (!key) return null
  const { data, error } = await supabase
    .from('trucks')
    .select('…')
    .eq('custom_domain', key)
```

**`.split(':')[0]` is the port strip.** Executed on the real function:

```
  "events.testtruck.test:3000"     → "events.testtruck.test"
  "events.testtruck.test"          → "events.testtruck.test"
  "EVENTS.TestTruck.TEST:3000"     → "events.testtruck.test"
  " events.testtruck.test:3000 "   → "events.testtruck.test"
  → with port === without port: ✅ identical
```

## 2. NO FIX WAS NEEDED, AND I DID NOT MAKE ONE

Your item 2 said *"fix the port handling if needed"*. **It is not needed**, so **`lib/custom-host.ts`
and `app/domain/page.tsx` were not opened.** Inventing a change here would have been the worse
outcome — the matching could only have been loosened, never tightened.

**Proof the exact-match host still resolves identically**, replaying the **real** `SELECT` against the
live database, read-only:

```
  RAW host header                  hostKey() → lookup key      ROW RETURNED
  "events.testtruck.test:3000"     "events.testtruck.test"     null — notFound()
  "events.testtruck.test"          "events.testtruck.test"     null — notFound()
  "EVENTS.TESTTRUCK.TEST:3000"     "events.testtruck.test"     null — notFound()
  "nothing.here.test:3000"         "nothing.here.test"         null — notFound()
```

⚠️ **THE POSITIVE HALF IS NOT PROVEN AND CANNOT BE FROM HERE.** No truck has `custom_domain` set, so
every lookup correctly returns null. **What is proven is that the two host forms produce a
byte-identical lookup key**, so they must return the same row; **and that an unknown host resolves to
nothing**, which is `notFound()`. The positive case becomes provable the moment you run the SQL in §4 —
§5 gives you the command.

## 3. WHAT ELSE COULD STOP THE PAGE RENDERING OVER PLAIN HTTP — ALL CHECKED

| | Verdict |
|---|---|
| `isCustomHost('events.testtruck.test:3000')` | ✅ **true** — takes the custom-host branch |
| `isAllowedOnCustomHost('/')` and `('/api/embed/events')` | ✅ **both true**; `/dashboard`, `/manage`, `/api/manage` all false |
| The custom-host rate limiter in the proxy | ✅ **skipped in dev** — `process.env.NODE_ENV !== 'production' \|\| !cfIp \|\| clientIp === '127.0.0.1'`, all three true locally |
| An HTTPS redirect or HSTS | ✅ **none** — `vercel.json` has no `redirects` and no `Strict-Transport-Security`; `next.config.ts` has no `redirects` |
| A canonical-host redirect | ✅ **none on this path.** The proxy's villagefoodie→hatchgrab redirect is an exact-host match and never fires here |
| Headers set only in production | ✅ `vercel.json` headers do not apply to `next dev`. **They are not needed for the render** |
| A secure-context API | ✅ **none used** — the page renders server-side and `EmbedSchedule` only calls `fetch` |
| `next/image` needing an https remote pattern | ✅ **not used** — `TruckIdentity` renders a plain `<img>`, deliberately |
| 🔴 `metadataBase` | ⚠️ **HARDCODED TO `https://`** — `app/domain/page.tsx:107`: ``const base = `https://${hostKey(rawHost)}` ``. **It does not stop the page rendering** (it only resolves relative metadata URLs), but on your local run the canonical and OpenGraph URLs will read `https://events.testtruck.test`. **Cosmetic locally, correct in production — left alone.** |
| 🔴 `NEXT_PUBLIC_HATCHGRAB_URL` | ⚠️ Set locally to **`https://www.hatchgrab.com`**. So the **Order button and the "Powered by HatchGrab" link will leave your dev server for production.** Expected, and worth knowing before you click either. |

🔴 **USE A `.test` HOSTNAME, NOT `.local`.** `.local` is reserved for mDNS/Bonjour and macOS resolves it
outside `/etc/hosts`, so a hosts entry there is unreliable. **`.test` is reserved by RFC 6761 for
exactly this** and goes through the hosts file cleanly. Your brief's example used `.local`; I have used
`.test` below and this is why.

## 4. THE EXACT STEPS

**Step 1 — the hosts line.** `sudo nano /etc/hosts`, add:

```
127.0.0.1	events.testtruck.test
```

**Step 2 — the SQL. Truck: `Thai Kitchen`, slug `test-kitchen`.** It is the repo's established test
truck, plan `trial` expiring 2026-12-31, active. 🔴 **NOT Pizzeria Gusto and NOT Tikka Tonic** — the
`WHERE` clause names the slug, so it cannot touch either.

```sql
-- READ IT BACK FIRST. Confirm you are about to change one row, and which.
select id, name, slug, plan, active, embed_enabled, custom_domain, custom_domain_verified_at
from trucks where slug = 'test-kitchen';

-- THE CHANGE. Three columns, one row.
update trucks
   set custom_domain             = 'events.testtruck.test',
       custom_domain_verified_at = now(),   -- the page refuses without this
       embed_enabled             = true     -- the events endpoint returns [] without this
 where slug = 'test-kitchen';
```

**All three are required**, and each for its own reason: `custom_domain` is the lookup key,
`custom_domain_verified_at` is checked by `truckForHost` (*"a row can carry a hostname the moment an
operator types it"*), and `embed_enabled` gates `/api/embed/events`.

**Step 3 — the URL.** With `npm run dev` running:

```
http://events.testtruck.test:3000/
```

**Step 4 — undo.**

```sql
update trucks
   set custom_domain             = null,
       custom_domain_verified_at = null,
       embed_enabled             = false
 where slug = 'test-kitchen';
```
Then remove the `/etc/hosts` line. **Nothing was added to Vercel, so there is nothing to release.**

### 🔴 STEP 2b — OTHERWISE THIS TEST PROVES THE WRONG THING

**`Thai Kitchen` has NO upcoming confirmed or open events.** I checked every candidate truck; none
has any. So the page will render its shell, the truck's name, and **an empty schedule** — which is
**exactly the silent failure V11.49 of the manual warns about**: *"the proof required is NON-EMPTY
EVENTS from the endpoint, never that the page renders."* A green-looking render with no events cannot
tell you the feature works from the feature being dead.

**So give it one event first:**

```sql
insert into events (truck_id, event_date, start_time, end_time, venue_name, town, status)
select id, current_date + 1, '17:00', '20:00', 'Test Green', 'Wickhambrook', 'confirmed'
from trucks where slug = 'test-kitchen';
```
and to undo: `delete from events where venue_name = 'Test Green' and truck_id = (select id from trucks where slug = 'test-kitchen');`

⚠️ **I have not read the `events` table's full column list or its NOT NULL constraints**, so treat that
INSERT as a draft to check rather than something I have verified. The `update` in step 2 names only
columns I have confirmed exist.

## 5. WHAT TO CHECK ONCE IT LOADS

```bash
# the page resolves the truck (expect the truck's name in the title, not "Village Foodie")
curl -s http://events.testtruck.test:3000/ | grep -o '<title>[^<]*</title>'

# 🔴 THE ONE THAT MATTERS — non-empty events, not "the page rendered"
curl -s 'http://events.testtruck.test:3000/api/embed/events?slug=test-kitchen' | head -c 400

# the deny list still denies on this host
curl -s -o /dev/null -w '%{http_code}\n' http://events.testtruck.test:3000/manage/x   # expect 404
curl -s -o /dev/null -w '%{http_code}\n' http://events.testtruck.test:3000/api/manage # expect 404
```

---

## 6. WHAT IS UNCHANGED

| | |
|---|---|
| `lib/custom-host.ts` — the deny list, `hostKey`, `isCustomHost` | ✅ **not opened.** `CUSTOM_HOST_ALLOWED` is still exactly two entries |
| `proxy.ts`, `app/domain/page.tsx`, `EmbedSchedule.tsx`, `api/embed/events`, `EmbedParts.tsx` | ✅ **not opened** |
| `lib/custom-domain/apex.ts` — both apex guards | ✅ **`cmp -s` BYTE-IDENTICAL** |
| `app/api/manage/route.ts` — provisioning, the plan gate, both limiters, the `www` guards | ✅ **not opened this workstream** (its single hunk is the previous one) |
| `lib/ratelimit.ts` | ✅ **not opened** — `slidingWindow(10, '10 m')` unchanged |
| `vercel.ts`, `copy.ts`, `dns.ts`, `features.ts` | ✅ **not opened** |

**Files changed: two.** `components/dashboard/CustomDomainSetup.tsx` (five hunks) and
`scripts/check-plain-english.mjs`. **The checker: 52/53 pass**, the one being the pre-existing
`QR: print or display` entry.

---

## 7. WHAT REMAINS UNOBSERVED

1. 🔴 **THE CUSTOM-DOMAIN PAGE STILL HAS NEVER BEEN RENDERED.** Everything in Part B is a read plus
   module-level execution. **I have made the test runnable; I have not run it**, because it needs the
   `UPDATE` you said you would run yourself.
2. 🔴 **THE ONE-PRESS FLOW WAS DRIVEN WITH A STUBBED `fetch`, NOT A REAL SERVER.** The eight outcomes
   above are the component's real logic against invented responses. **No `domain_preflight` or
   `domain_provision` call was made**, and with the hosting credentials unset none could succeed.
3. ⚠️ **NO BUTTON WAS PRESSED IN A BROWSER**, so the `Checking…` → `Setting up…` transition is proven
   from the state log, not watched.
4. ⚠️ **The limiter judgement in Part A is a judgement**, not a measurement. Nobody has been rate-limited.
5. ⚠️ **`already_elsewhere` now has no screen at all** — §Part A.
6. **The `events` INSERT in §4 step 2b is unverified against the table's constraints.**
