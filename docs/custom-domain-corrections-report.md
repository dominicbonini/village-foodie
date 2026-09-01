# Custom domain — Stage 6b: two corrections and one read

**WHICH OF THE THREE I PERFORMED: A TYPECHECK AND TWO EXECUTIONS.** No standalone parse —
`npx tsc --noEmit` subsumes it and **exits 0**. Two harnesses transpile the **real** modules and run
them in a `vm`: **28/28** on the sweep, **22/22** on the threshold. Two assertions inside the second
harness are explicitly labelled **PARSE** (they assert on file text, not on behaviour) and are named as
such in §2.5.

🔴 **Nothing was deployed. No migration was run. No schema change was made — none was needed. No domain
was added or removed against the real Vercel project:** every `fetch` is intercepted inside the vm and
the recorded DELETE went to `prj_TEST`. The six migration files are still unapplied and **no SQL of any
kind was executed.** Pizzeria Gusto and Tikka Tonic are untouched.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

**Files changed — three, and nothing else:**

| File | State |
|---|---|
| `app/api/cron/custom-domain-check/route.ts` | modified (the sweep + `releaseDomain`) |
| `app/admin/page.tsx` | modified (the threshold, at both call sites, plus one footer line) |
| `lib/custom-domain/cadence.ts` | **NEW** |

`proxy.ts`, `app/domain/page.tsx`, `lib/custom-host.ts`, `lib/custom-domain/{apex,dns,vercel,copy}.ts`,
`components/dashboard/CustomDomainSetup.tsx`, `app/api/manage/route.ts`, `vercel.json` and
`lib/features.ts` are **byte-identical** to before this stage — confirmed by mtime, all of which predate
this session's edits.

---

## 1. CORRECTION ONE — RELEASE FIRST, CLEAR ON SUCCESS

### 1.1 What was wrong, stated as the brief states it

The sweep called `releaseDomain(host)` and then cleared the column **unconditionally**, discarding the
return value entirely:

```ts
await releaseDomain(host)                    // return value thrown away
await supabase.from('trucks').update({ custom_domain: null, … })
```

🔴 **That is worse than the orphan it replaced.** `custom_domain_setup_state = 'registered'` at least
left a trace that a domain was attached to the hosting project. After a **failed** release the domain
stayed attached *and* our row was wiped — so the operator's web person, adding it properly six weeks
on, hits *"already assigned to another Vercel project"* with **nothing on our side that explains it**.

The previous report recorded this as accepted debt (§10 item 6, *"Deliberate — the row is the operator's
truth"*). That reasoning was wrong: the row is only the operator's truth if it is **reconciled** with
the side that actually serves the domain.

### 1.2 The ordering, chosen for which failure is recoverable

The brief said to pick the ordering whose failure is recoverable. Working it through:

| Order | If the release fails | Recoverable? |
|---|---|---|
| **clear → release** (the old code) | Domain attached at the hosting side, **no row anywhere naming it**. Nothing to retry from, nothing to display, nothing to search for. | 🔴 **NO** |
| **release → clear** (now) | Release fails, **the row survives untouched**, the next daily sweep re-enters the same branch and tries again. | ✅ **YES** |
| **release → clear**, release OK but the **clear** fails | Domain detached, our row still names it. The next sweep re-releases → **404** → treated as released → clears. | ✅ **YES** (see §1.4) |

**Release first.** The row *is* the retry queue: `custom_domain` stays set, so the orphan predicate
matches again tomorrow. No second queue, no flag column, no schema change.

### 1.3 Where the failure is recorded

Into `custom_domain_last_seen_value`, which is the column the admin table already renders beneath any
non-live row:

```ts
custom_domain_last_seen_value:
  `nothing — release failed (${release.reason}), still attached at the hosting side, will retry`
```

⚠️ **It is phrased to read correctly after that cell's existing `"Resolving to: "` prefix**, which is
why it begins with the word `nothing`. On screen:

> Resolving to: **nothing — release failed (http_403), still attached at the hosting side, will retry** · waiting 20d

**This required no change to `app/admin/page.tsx`'s markup.** The row keeps a non-null `custom_domain`,
so it survives the table's `trucks.filter(t => !!t.custom_domain)`, and ranks 1 (amber, "Waiting")
because it never went live. The reason string is machine-derived (`http_403`, `not_configured`,
`timeout`, `network`) rather than prose, because *"it failed"* is not something anyone can act on.

The run's JSON now separates the two outcomes: `released` counts only actual releases, and
`releaseFailed` / `releaseFailures` carry the rest.

### 1.4 🔴 A 404 COUNTS AS RELEASED — and this is what makes the retry converge

`releaseDomain` was `Promise<boolean>` built on `res.ok`. It is now
`Promise<{ ok: boolean; reason: string }>`, and **`404` maps to `{ ok: true, reason: 'gone' }`**.

Without that, the release→clear ordering introduces a **new permanent-stick bug**: if a run deletes the
domain and then fails to write the column, every later run gets a 404 from the DELETE, a strict
`res.ok` reads that as failure, and **the row is never cleared — flagged red in the admin table every
day for a problem that no longer exists.** The state we want is *"not attached to this project"*, and a
404 **is** that state.

⚠️ **Missing credentials return `not_configured`, which stays a FAILURE.** Treating an absent
`VERCEL_API_TOKEN` as success would clear the column while the domain remained attached — precisely the
bug being removed, reintroduced through the back door.

### 1.5 EXECUTION — the failing release, proven

Harness: the **real** route transpiled and run in a `vm` against an in-memory `trucks` table and an
intercepted `fetch`. The database rows are mutated in place, so **a second run genuinely sees the first
run's writes** — which is how "survives for the next sweep" is proven rather than asserted.

```
  PASS  A1 the hosting side WAS asked to release
          DELETE https://api.vercel.com/v9/projects/prj_TEST/domains/schedule.x.co.uk?teamId=team_TEST
  PASS  A2 🔴 custom_domain is NOT cleared          custom_domain="schedule.x.co.uk"
  PASS  A3 🔴 setup_state and started_at survive    state=awaiting_dns
  PASS  A4 🔴 the failure is recorded where the admin table shows it
          nothing — release failed (http_403), still attached at the hosting side, will retry
  PASS  A5 renders correctly after the table's "Resolving to: " prefix
  PASS  A6 the run reports it as a FAILURE, not a release
          {"released":0,"releaseFailed":1,"why":[{"host":"schedule.x.co.uk","reason":"http_403"}]}
  PASS  A7 checked-at is still stamped

  🔴 THE ROW SURVIVES FOR THE NEXT SWEEP — same database, second run, release now succeeds:
  PASS  A8 the NEXT sweep re-enters the branch and releases it   deletes=1 released=1
  PASS  A9 …and only THEN is the column cleared                  custom_domain=null
```

And the rest of the matrix:

```
  PASS  B1 release ok → column cleared
  PASS  B2 …and the trace is written        "released after 14 days without going live"
  PASS  B3 reported as released
  PASS  C1 🔴 a 404 counts as released, so a stuck row converges     custom_domain=null
  PASS  D1 no token → nothing is sent
  PASS  D2 🔴 …and the column is NOT cleared
  PASS  D3 …reason recorded as not_configured
  PASS  G1 dry → no DELETE      G2 dry → no write      G3 dry → still reports the intended release
  PASS  H1 no credential → 401
```

### 1.6 EXECUTION — a verified, serving domain is still left alone

The guard is unchanged and remains the first thing tested, not an `else` at the bottom.

```
  PASS  E1 🔴 400 days old but VERIFIED AND SERVING → NOT released
  PASS  E2 🔴 …and NOTHING was deleted at the hosting side        deletes=0
  PASS  E3 …the domain is still on the row
  PASS  E4 …and it was checked normally
          {"host":"schedule.x.co.uk","state":"ok","seen":"cname.vercel-dns.com","expected":"cname.vercel-dns.com"}
  PASS  E5 …last_ok_at advanced
  PASS  E6 …no go-live email (it was already live)
  PASS  F1 🔴 never verified but it WORKED once → not released
  PASS  F2 …domain intact
```

**28/28 pass.**

### 1.7 ⚠️ A CORRECTION TO THE PREVIOUS REPORT THAT THE BRIEF DID NOT ASK FOR

`docs/custom-domain-monitoring-report.md` §8 claims of a **successful** release: *"and the release is
RECORDED where the table can show it."* **It is not.** The success path sets `custom_domain: null`, and
the Domains tab opens with `trucks.filter(t => !!t.custom_domain)` — so a successfully released row
**drops out of the table entirely** and its `"released after 14 days without going live"` value is never
rendered anywhere. The value survives in the column as a forensic trace only.

**I have not changed this** — the brief's requirement is that the *failure* be visible, and it is,
precisely because the failing row keeps its domain. Recorded so the earlier claim is not trusted.

---

## 2. CORRECTION TWO — THE THRESHOLD IS DERIVED FROM THE CADENCE

### 2.1 What was wrong

`36 * 3600e3`, written as a literal **twice** in `app/admin/page.tsx` — once in `rank()` and once in
`down`. A literal encodes an **answer** whose **question** lives in a different file: `vercel.json`'s
`crons` entry, `0 7 * * *`. Change the schedule to six-hourly and the label keeps asserting 36 hours
while that now means six missed checks rather than one. Nothing breaks, no test fails, and **the table
quietly lies.**

### 2.2 How they are now connected — stated, as the brief asked

**`lib/custom-domain/cadence.ts` reads `vercel.json` — the same file Vercel obeys — finds the entry by
`path === '/api/cron/custom-domain-check'`, and derives the interval from its cron expression.**

```ts
export const CHECK_CRON_EXPRESSION = vercelConfig.crons?.find(c => c.path === CHECK_CRON_PATH)?.schedule
export const CHECK_INTERVAL_MS     = intervalMsFromCron(CHECK_CRON_EXPRESSION)

export const MISSED_CHECKS_BEFORE_STOPPED = 2      // ← in CHECKS
export const MARGIN_IN_CHECKS             = 0.5    // ← in CHECKS
export const STOPPED_AFTER_MS = (MISSED_CHECKS_BEFORE_STOPPED + MARGIN_IN_CHECKS) * CHECK_INTERVAL_MS
```

🔴 **THERE IS EXACTLY ONE DEFINITION OF THE CADENCE IN THE REPOSITORY AND IT IS THE ONE THE PLATFORM
READS.** Editing the schedule moves the threshold in the same commit, with no second place to remember.

⚠️ **WHY NOT A SHARED CONSTANT.** A `CHECK_INTERVAL_HOURS = 24` sitting next to the cron entry would be
a **restatement** of the schedule, not the schedule — two things that must be kept in agreement, which
is the drift itself rather than a fix for it.

🔴 **AND THE TUNABLES ARE IN CHECKS, NOT HOURS.** *"Two missed checks plus half a check of margin"* is
true at every schedule. *"36 hours"* is true at exactly one.

### 2.3 🔴 THIS MOVES THE NUMBER FROM 36h TO 60h, AND I AM FLAGGING IT RATHER THAN BURYING IT

The brief says the 36-hour label *"is two consecutive daily failures plus margin"*. **Arithmetically it
is not.** With `now - last_ok_at` and a daily job, two consecutive failures is **48 hours**; 36 hours is
**one** failure plus half a cadence. The premise and the literal disagree.

I implemented **your stated rule**, not the literal, because the rule is what the brief asked to be
expressed in terms of the cadence. At the current daily schedule that yields:

> `(2 + 0.5) × 24h` = **60 hours**

**If you want the old 36 hours back, it is one line** in `lib/custom-domain/cadence.ts`:
`MISSED_CHECKS_BEFORE_STOPPED = 1` (giving `(1 + 0.5) × 24h` = 36h). **I have not chosen that**, because
it would encode "one missed check" while the brief says two. **Your call — the constant is named and
sits alone.**

### 2.4 The fallback is loud, not silent

If the cron entry is missing, or its expression is a shape the parser does not cover (a monthly
schedule, say), `CHECK_INTERVAL_MS` falls back to daily **and** `CADENCE_DERIVED` is `false`, which the
Domains tab renders in red:

> ⚠️ The check schedule could not be read from vercel.json. Falling back to a daily cadence, so
> "stopped working" = 60h and may not match the real schedule.

A silent fallback would reintroduce the exact drift being removed, with the added insult of looking
derived. When it *is* derived, the table states the value plainly:

> "Stopped working" = no successful check for 60h — derived from the `0 7 * * *` schedule in vercel.json.

🔴 **A derived number the reader cannot see is worse than a literal** — they would have no way to know
what the label currently means.

### 2.5 EXECUTION — the threshold moves when the cadence does

The **real** `cadence.ts` transpiled and run once per candidate schedule with the `vercel.json` import
substituted, which is exactly what editing `vercel.json` would do:

```
  vercel.json schedule  cadence   "stopped" after   label    meaning
  ------------------------------------------------------------------------------------
  0 7 * * *             24h       60h               60h      daily (the schedule today)
  0 */6 * * *            6h       15h               15h      every 6 hours
  0 */2 * * *            2h        5h                5h      every 2 hours
  0 * * * *              1h        2.5h              2.5h    hourly
  */30 * * * *          30m        1.25h             1.3h    every 30 minutes
  */10 * * * *          10m       25m               25m      every 10 minutes
```

And the **admin verdict follows it**. `rank()` and the `down` expression were **lifted verbatim out of
`app/admin/page.tsx` by source extraction — not retyped — and evaluated** against the derived value:

```
  a domain live for 90 days, last seen working 40 hours ago:
    schedule 0 7 * * *     threshold 60h  → ✅ "Live" (no problem)
    schedule 0 */6 * * *   threshold 15h  → 🔴 "Stopped working" (row ranks first)
```

🔴 **Same row, same 40-hour outage, opposite verdict — because the schedule changed and nothing else.**
That is the property the brief asked for.

```
  PASS  every cadence row above (12 assertions)
  PASS  an unreducible schedule → CADENCE_DERIVED false, falls back to daily, does not crash
  PASS  a MISSING cron entry → CADENCE_DERIVED false
  PASS  🔴 SAME ROW, SAME 40h outage: daily → not stopped
  PASS  🔴 SAME ROW, SAME 40h outage: 6-hourly → STOPPED, sorted first
  PASS  70h outage at daily cadence → stopped
  PASS  10h outage at 6-hourly cadence → not yet stopped
  PASS  never went live → rank 1 (waiting), never "stopped"
  PARSE no `36 * 3600e3` literal remains in the verdict logic
  PARSE both call sites reference STOPPED_AFTER_MS
```

**22/22 pass.** The last two are **parse** assertions on file text and are labelled as such.

⚠️ **`app/admin/page.tsx` is `'use client'`, so `vercel.json` enters the client bundle** — 1.3 KB of
function config, headers and cron paths, holding **no secret**; every value in it is already inferable
from the deployed site's behaviour. Stated as a consequence, not hidden.

---

## 3. READ ONLY — IS THE CUSTOM-DOMAIN PATH PLAN-GATED?

**RECORDED, NOT FIXED. No gate was added, removed or moved.**

### 3.1 The short answer

**Yes, partially — and it is inconsistent.** Three places check a plan; four server actions do not.

🔴 **There is NO `custom_domain` Feature.** `grep -n "custom_domain" lib/features.ts` returns **nothing**.
Every check on this path borrows the **embed** feature.

### 3.2 Which Feature it checks

**`'embed_schedule'`** — in all three places, verbatim:

```ts
// app/domain/page.tsx:144        — THE SERVING PATH
const planGrants = canAccess(truck.plan as never, 'embed_schedule',
                             truck.feature_overrides ?? {}, truck.trial_expires_at)

// components/dashboard/CustomDomainSetup.tsx:48  — THE SETUP SCREEN
const allowed = canAccess(plan, 'embed_schedule', featureOverrides ?? {}, trialExpiresAt)
…
if (!allowed) return null                          // :96

// app/api/manage/route.ts:1085   — THE PROVISIONING ACTION
if (!canAccess(truck.plan, 'embed_schedule', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
  return NextResponse.json({ error: 'Not available on this plan' }, { status: 403 })
}
```

`'embed_schedule'` is in `MAX_FEATURES` only (`lib/features.ts:69`), **not** in `PRO_FEATURES`. Since
`TRIAL_FEATURES = [...MAX_FEATURES]` and `demo`/`tester` mirror it:

| Plan | `canAccess(plan, 'embed_schedule')` |
|---|---|
| `starter` | **false** |
| `pro` | **false** |
| `max` | true |
| `trial` (expiry NULL — what self-serve signup writes) | **true** |
| `trial` (expiry in the past) | false |
| `demo`, `tester` | true |

⚠️ A per-truck `feature_overrides.embed_schedule` **beats all of the above**, in either direction
(`lib/features.ts:117-119`).

### 3.3 Where a plan check runs — and where it does not

| Surface | Plan check? | Evidence |
|---|---|---|
| **Serving** — `app/domain/page.tsx` | ✅ `:144` | lapsed plan → name + one link fallback, not the schedule |
| **Serving** — `proxy.ts` custom-host block | 🔴 **NO** | no `canAccess`/`plan` reference anywhere in the file |
| **Setup screen** — `CustomDomainSetup.tsx` | ✅ `:48`, `:96 return null` | the whole card is unmounted |
| `domain_provision` | ✅ `:1085` → **403** | the only gated action |
| `domain_preflight` | 🔴 **NO** | lines 1025-1057, no `canAccess` |
| `domain_status` | 🔴 **NO** | lines 1058-1083 |
| `domain_confirm` | 🔴 **NO** | lines 1147-1159 |
| `domain_send_instructions` | 🔴 **NO** | lines 1160-1193 |
| The daily cron | 🔴 **NO** | no `canAccess` in the route |

⚠️ **`proxy.ts` is not a gap by design.** It has no database access at all (edge middleware, by
design), so it *cannot* check a plan; `app/domain/page.tsx` is the first place with a row to check. Its
custom-host block is a path allowlist, not a plan gate. Recorded for completeness, not as a hole.

### 3.4 What a truck on `starter` or `pro` can currently do, end to end

**Through the UI: nothing.** `CustomDomainSetup` returns `null` at `:96`, so the card never renders on
the dashboard. There is no other entry point.

**Through the API with a valid `dashboard_token` (which the operator's own browser holds):**

| Action | Result on starter/pro | Side effect |
|---|---|---|
| `domain_preflight` | ✅ **Works** | Runs CAA + NS lookups and a Vercel config read against **any address they name**. Read-only, outbound DoH + one Vercel GET. No write. |
| `domain_provision` | 🔴 **403** | None. **The hosting-side side effect is closed.** |
| `domain_status` | ✅ Works | Returns their own (empty) domain state. Harmless. |
| `domain_confirm` | ✅ Works | Writes `custom_domain_confirmed_at` on their own row. Meaningless without a domain. |
| `domain_send_instructions` | ⚠️ **Gated only by state, not by plan** | Returns 400 *"No address has been set up yet"* when `custom_domain` is null — which it always is for a truck that could never provision. **So it is unreachable in practice for a clean starter/pro truck, but the gate that stops it is the empty column, not the plan.** |

🔴 **THE ONE CASE WHERE IT IS NOT MERELY THEORETICAL: A DOWNGRADE.** A truck that provisioned on `trial`
or `max` and then moves to `starter`/`pro` keeps `custom_domain` populated — nothing clears it. For that
truck:

- **`domain_send_instructions` becomes reachable on a plan that does not include the feature**, and it
  **sends an email** through Brevo **to an arbitrary address the caller supplies**, with the truck as
  the sender name. It is the one ungated action with an external side effect.
- **The daily cron keeps checking their domain** and, on the first successful resolve, **sends the
  go-live email** — for a feature their plan does not include.
- **The serving path does gate**: visitors get the name-and-link fallback, not the schedule. ✅
- The setup card disappears, so they cannot see or undo any of it.

**Summary in one line:** the *expensive* action (attaching a domain at the hosting provider) and the
*serving* surface are both plan-gated; the *reads*, the *acknowledgement*, the *outbound email* and the
*monitoring job* are not.

**I have added nothing. Your decision.**

---

## 4. Verification summary

**A typecheck and two executions.** No standalone parse; two assertions inside the second harness are
labelled PARSE and counted as such.

```
  npx tsc --noEmit                                   exit 0
  sweep      (app/api/cron/custom-domain-check)      28/28 PASS
  cadence    (lib/custom-domain/cadence.ts + the
              real rank()/down lifted from admin)    22/22 PASS
```

The three things the brief required be proven:

1. ✅ **A failing release does not clear the column and the row survives for the next sweep** — A2, A3,
   A4, and A8/A9 which run a *second* sweep over the *same* mutated database and show it clearing only
   once the release succeeds.
2. ✅ **A verified, serving domain is still left alone** — E1-E6 (400 days old, zero DELETEs issued,
   checked normally) and F1-F2 (never verified but worked once).
3. ✅ **The threshold moves when the cadence does** — six schedules, and the same 40-hour outage
   producing opposite verdicts from the real `rank()` at daily versus six-hourly.

---

## 5. What remains unverified

1. **Nothing was rendered in a browser.** No admin table, no footer line, no banner was seen. The
   `"Resolving to: nothing — release failed…"` rendering is reasoned from the JSX and proven only as a
   string.
2. 🔴 **`next build` was NOT run**, per the standing freeze. `tsc --noEmit` is a typecheck, not a build.
   **The claim that `import vercelConfig from '@/vercel.json'` resolves inside a `'use client'` bundle
   is therefore REASONED, not observed** — `resolveJsonModule` is on, `paths` maps `@/*` to `./*`, and
   the typecheck passes, but no bundler has processed it. **This is the single riskiest unobserved thing
   in this stage**: if webpack does not resolve it, the admin page fails to build.
3. **No live hosting call was made.** The 403/404/200 responses are constructed. Vercel's actual status
   code for deleting an unattached domain is taken from its documentation, not from a call — **if it
   returns 400 rather than 404, the convergence in §1.4 does not fire** and such a row would stick.
4. **No cron has ever run**, and nothing here can report that it never ran; a stale
   `custom_domain_last_checked_at` remains the only signal.
5. **The other fifteen harnesses from earlier stages were NOT re-run** this session. Confidence that
   they still pass rests on `tsc --noEmit` plus the mtime evidence that none of their files was touched
   — which is weaker than running them.
6. **Six migrations remain unapplied**, and no schema change was needed for either correction.
7. **The 60-hour threshold has still never been calibrated against a real outage** — the previous
   report's caveat stands, and the number moved.
8. **The plan-gating read is a read.** Nothing in §3 was exercised; the starter/pro behaviour is derived
   from the code and from `canAccess`'s membership sets, not from calls made as a starter truck.
