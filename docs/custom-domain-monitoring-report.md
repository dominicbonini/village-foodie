# Custom domain — Stage 6, monitoring, notification and admin

**WHICH OF THE THREE I DID: A TYPECHECK AND SEVENTEEN EXECUTIONS. No standalone parse — `tsc --noEmit`
subsumes it.** `npx tsc --noEmit` exits 0. Seventeen harnesses run the **real** transpiled modules in
a `vm`: two new ones for this stage and fifteen from the embed, serving and provisioning workstreams
re-run.

🔴 **Nothing was deployed. No migration was run. No domain was added or removed against the real
Vercel project** — every outbound call is intercepted, and the release call went to `prj_TEST`. Six
migration files now exist and are unapplied; **no SQL of any kind was executed.** Pizzeria Gusto is
untouched.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 1. 🔴 THE EXISTING NOTIFICATION MECHANISM — read first, then extended

**It is `app/manage/[token]/page.tsx`, and it is not what "notification system" usually means.**

| Question | Answer |
|---|---|
| **What creates one?** | **Nothing.** There is no notifications table, no rows, no inserts. A notification is **DERIVED STATE** — a condition computed on the Manage page from data already loaded, rendered as a banner plus a nav badge. |
| **The three that exist today** | `pendingApprovalCount` (`:227`, one fetch of `/api/events/manage` on mount, filtered client-side) · `stripeActionRequired` (`:238`, a server-side boolean fetched on mount) · `allergensUnverified` (`:292`, derived from `items` already in state) |
| **Per-truck or per-operator?** | **Per-truck.** The page is keyed by `dashboard_token`; every source is truck-scoped. **There is no operator-level inbox.** |
| **What clears one?** | The condition ceasing to hold — the count reaching zero, the requirement being satisfied. |
| **What dismisses one?** | A per-banner dismiss: `bannerDismissedAtCount` (`:230`) and `stripeBannerDismissed` (`:239`). |
| **Is dismissal recorded?** | 🔴 **NO.** Both are plain `useState`. Reloading brings the banner back. `bannerDismissedAtCount` is cleverer than a boolean — it stores the count *at* dismissal so the banner **reappears when the count rises**, i.e. when new events arrive. |
| **Inline or scheduled?** | **Inline.** One fetch per mount, derived at render. Nothing scheduled. |

### What I extended, named exactly

**A fourth instance of that same mechanism**, in the same file, in the same shape: a derived condition
(`domainNotice`), a session-only dismiss (`domainBannerDismissed`), and a banner rendered beside the
other three with identical treatment — amber when something needs doing, an icon, one line of plain
English, a `✕`. **No table, no rows, no second system.**

🔴 **AND THAT IS WHY "NO DUPLICATE ON REPEATED RUNS" IS A PROPERTY RATHER THAN A PROMISE.** Nothing is
ever *created*, so nothing can be created twice. The daily job writes truck **columns**; the banner is
an expression that reads them. Running the job a hundred times leaves one row in one state.

The one thing that *is* sent rather than derived — the go-live email — is guarded by the transition
itself and proven single-fire below.

---

## 2. SCHEMA — four columns, and no history table

```sql
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS custom_domain_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS custom_domain_last_ok_at      timestamptz,
  ADD COLUMN IF NOT EXISTS custom_domain_last_seen_value text,
  ADD COLUMN IF NOT EXISTS custom_domain_confirmed_at    timestamptz;
```

🔴 **Outage duration is `now() - custom_domain_last_ok_at`.** That subtraction is the only question a
history table would have been built to answer, so a history table would be a second source for a
derivable fact — and the two would disagree the first time a row was missed. **Nothing counts and
nothing appends.**

⚠️ **`last_seen_value` is text, not a status, and that is the point.** "Not resolving" is one status
covering three different conversations: a mistyped record, a record that conflicts with an existing
one, and a domain that has moved host. The column holds **what is actually there** — an observation,
not a verdict.

---

## 3. THE DAILY CHECK

**Pattern found and followed:** a Next route under `app/api/cron/`, registered in `vercel.json`'s
`crons`, authorised by `Authorization: Bearer $CRON_SECRET` with a `verifyAdmin` fallback for a
by-hand run. That is what the five existing jobs do; this is the sixth, at `0 7 * * *`.

**🔴 NO EMAIL TO YOU.** The existing jobs email on failure because their failure is invisible; this one
writes state and **the admin table is the read path**. An email per run would be a second channel for
a fact already on screen.

### The check bites — constructed, not observed

```
  🔴 A DOMAIN THAT NEVER RESOLVED:
  PASS  reaches "not_resolving"          PASS  records what is ACTUALLY there — nothing
  PASS  never sets verified_at           PASS  never sets last_ok_at        PASS  no email sent

  🔴 A DOMAIN THAT WAS LIVE AND HAS STOPPED:
  PASS  reaches "not_resolving"
  PASS  🔴 records WHERE IT ACTUALLY POINTS — the diagnostic   theiroldsite.wixdns.net
  PASS  last_ok_at is NOT advanced, so the outage clock keeps running
  PASS  verified_at is left alone — it did go live once
```

The second case is the one the diagnostic exists for: the value recorded is the operator's **old
website host**, which says "the record was replaced" rather than merely "it is down".

### A resolver failure is not an outage

```
  PASS  state is "unknown", not a manufactured outage
  PASS  only the checked-at stamp is written   ["custom_domain_last_checked_at"]
```

Writing "not resolving" when we could not ask would manufacture an outage out of our own network
trouble, and the operator would be told their domain is broken because Cloudflare was slow.

⚠️ **Nothing here can report that it never ran.** `custom_domain_last_checked_at` going stale is the
signal, and only a human reading the admin table sees it — the same residual gap `demo-cleanup`
records.

---

## 4. 🔴 THE SECOND, LIST-INDEPENDENT APEX GUARD

`checkApexViaSoa()` in `lib/custom-domain/dns.ts`, wired into `domain_provision` **before** the hosting
call. **Both guards must pass.**

```
  A SECOND-LEVEL SUFFIX NOT IN THE BUNDLED SNAPSHOT — "theirtruck.trading.uk"
  PASS  🔴 the LIST guard PASSES it   parsed as subdomain="theirtruck" of "trading.uk"
  PASS  🔴 the SOA guard REFUSES it — the zone publishes an SOA at its own name
        {"state":"apex","owner":"theirtruck.trading.uk","section":"answer"}
```

**The guards share no data**: one reads a bundled snapshot, the other asks the zone, which is current
by construction.

⚠️ **MY FIRST DEMONSTRATION CASE PROVED NOTHING AND IS RECORDED RATHER THAN QUIETLY REPLACED.** I began
with an unknown TLD (`theirtruck.newgtld2026`); `psl` treats an unrecognised TLD as itself a suffix, so
the list guard already refused it — safe, but no gap shown. The real permissive gap is a **new
second-level suffix under a TLD the list already knows**, which is the case above.

### Answer versus authority — the distinction that would otherwise invert the guard

```
  PASS  a real subdomain returns SOA in AUTHORITY → not_apex   {"section":"authority"}
    → a naive "did an SOA come back?" test would refuse EVERY valid subdomain.
  PASS  an apex returns SOA in ANSWER → apex
  PASS  owner name compared case- and trailing-dot-insensitively
  PASS  a resolver outage → "unknown", which does not block
  PASS  the SOA lookup names the FULL address (not the parent)
```

🔴 Querying SOA for a name that is *not* an apex still returns an SOA — in the **AUTHORITY** section,
naming the enclosing zone, because that is how NXDOMAIN and NODATA carry their negative-caching TTL.
⚠️ This is also **the one lookup in that file that does not use the parent** — asking the parent would
answer a different question and always say "apex".

---

## 5. THE OPERATOR NOTIFICATION — two states

```tsx
  const domainNotice: 'waiting' | 'ready' | null = !truck?.custom_domain
    ? null
    : truck.custom_domain_verified_at
      ? (truck.custom_domain_confirmed_at ? null : 'ready')
      : 'waiting'
```

**WAITING** names the address and when they started: *"…is not working yet. You started setting it up
on 14 August. If someone else was adding the line for you, it is worth checking they did."*

🔴 **WAITING is the state that earns its keep.** Setup ends with an operator adding a record and
closing the tab. If it never resolves, **nothing happens** — no error, no page, no complaint — and they
wait indefinitely believing it is coming. This is the only thing that turns a silent stall into a
sentence.

**READY** points them to settings to confirm, and clears itself once they do.

### The go-live email, once

```
  PASS  🔴 emails the operator ONCE, on the transition   "schedule.x.co.uk is working"
  PASS  an ALREADY-live domain stays "ok"
  PASS  🔴 and is NOT emailed again — no duplicate on repeated runs
```

Sent through the existing Brevo helper. It fires on the transition (`verified_at` was null and is
about to be set), which is detectable exactly once. ⚠️ A failed email does not roll back a domain that
is genuinely live.

---

## 6. THE CONFIRM STEP

In the dashboard settings card, where the operator set it up. **One button**, above a three-line
checklist:

> **Have a look, then tell us it is right**
> 1. Open your address and let the page load.
> 2. Check the events shown are yours.
> 3. Check the dates and times look right.
>
> *This changes nothing on your page. It just tells us a person has looked.*
> **[ Yes, it looks right ]**
> *Something not right? Email hello@hatchgrab.com and tell us what you are seeing — it helps to say
> what address you opened and what appeared.*

🔴 **The checklist is what makes the column mean anything.** Without it the button records "I saw a
notification" rather than "I looked at my page", and `confirmed_at` in the admin table would be
worthless.

⚠️ **No "something's wrong" branch**, as instructed — nothing sits behind one to triage, and a button
that files a signal nobody reads is worse than a sentence naming who to contact.

✅ **Confirming gates nothing.** `domain_confirm` writes one column and the page is unaffected.

---

## 7. THE ADMIN TABLE

A third tab, `🌐 Domains`. One row per truck with a domain: **truck · address · status · set up · last
checked**, with **problems sorted to the top** (a live domain not seen working for over 36 hours ranks
first, then waiting, then fine; ties broken by longest-broken first).

- **Under a problem row:** *"Resolving to: `theiroldsite.wixdns.net` · down for 3d"* — or
  *"Resolving to: nothing · waiting 9d"*.
- **Under a live row:** *"Operator confirmed"* or *"Not confirmed by the operator"*.

🔴 **The diagnostic sits under the row rather than in a column** because it is the thing that separates
three different conversations, and a status column alone would send whoever reads this to run a lookup
by hand — which is the work the table exists to save. Outage duration is computed from
`last_ok_at`; **there is no history table and none may be added.**

---

## 8. THE ORPHAN SWEEP — 14 days

🔴 **This is not housekeeping.** A domain registered against the project and never pointed at us
**blocks that same domain from being added later** — the hosting API returns 409. So the operator's own
web person, doing it properly six weeks on, is refused by our abandoned attempt. **We would be blocking
our own operator with something they cannot see and we forgot about.**

⚠️ **14 days, set by the slowest legitimate path rather than the fastest.** The operator who needs this
is the one who does not hold their own domain login: they email whoever built the site, that person
replies next week, the record goes in the week after. Two days would delete a live-but-slow setup out
from under them; two months would leave the block in place long enough to become the problem it exists
to prevent.

```
  PASS  20 days, never live → RELEASED
  PASS  the column is cleared
  PASS  🔴 and the release is RECORDED where the table can show it
        ("released after 14 days without going live")
  PASS  the hosting side was asked to release it
        DELETE https://api.vercel.com/v9/projects/prj_TEST/domains/schedule.x.co.uk?teamId=team_TEST
  PASS  5 days, never live → NOT released (inside the window)
```

### 🔴 It must never release a domain that is verified or serving

```
  PASS  🔴 400 days old but VERIFIED AND SERVING → LEFT ALONE
  PASS  …and nothing was deleted at the hosting side
  PASS  …and it was checked normally
  PASS  🔴 old, unverified, but it WORKED once → still left alone
```

**The guard is the first thing tested, not an `else` at the bottom** — a released live domain takes an
operator's page down, which is strictly worse than leaving an orphan another day. It requires **both**
`verified_at` and `last_ok_at` to be null, so a domain that ever worked is spared even if it was never
formally verified.

**Auth and dry run:** no credential → 401; `?dry=1` reports a release and **writes nothing, deletes
nothing**.

---

## 9. Verification summary

**Which of the three: a typecheck and seventeen executions.** No standalone parse.

```
  embed-gate PASS   embed-api PASS   posthog PASS   proxy-embed PASS   card-parity-1b PASS
  stamp-throttle PASS   embed-actions PASS   detect PASS   wizard-2b PASS   single-source PASS
  custom-host-deny PASS   domain-route PASS   apex-guard PASS   provisioning PASS
  domain-copy PASS   monitor PASS   soa-guard PASS
```

**Stages 4 and 5, the embed route and both existing hosts are unchanged** — `custom-host-deny` (47
surfaces refused, both our hosts untouched), `domain-route`, `embed-gate`, `apex-guard` and
`provisioning` all still pass, and by mtime this stage touched none of `proxy.ts`, `app/domain/page.tsx`,
`lib/custom-host.ts`, `components/embed/EmbedParts.tsx`, `components/TruckListCard.tsx`,
`lib/custom-domain/apex.ts` or `lib/custom-domain/vercel.ts`.

**Files this stage changed:** the migration · `app/api/cron/custom-domain-check/route.ts` ·
`lib/custom-domain/dns.ts` (SOA guard, `resolveCname`) · `lib/custom-domain/copy.ts` (notification,
live email, confirm copy) · `app/api/manage/route.ts` (SOA guard wired, `domain_confirm`) ·
`app/manage/[token]/page.tsx` (the banner) · `components/dashboard/CustomDomainSetup.tsx` (confirm) ·
`app/admin/page.tsx` + `app/api/admin/route.ts` (the table) · `vercel.json` (the cron) ·
`components/dashboard/types.ts` · `app/dashboard/[token]/page.tsx` (one prop).

---

## 10. What remains unverified

1. **Nothing was rendered in a browser.** No banner, no table, no confirm button was seen; no email was
   sent; no cron has ever run.
2. **No live hosting or DNS call was made.** Request and response shapes come from Vercel's
   documentation and from the DoH JSON schema, not from a call — a field named differently in practice
   would not have been caught.
3. **The SOA behaviour is reasoned from how resolvers carry negative-caching TTLs**, and exercised
   against constructed answers. **No real zone was queried.**
4. **Six migrations are unapplied.** Apply all six before deploying, outside a trading truck's service
   hours with a short `lock_timeout`.
5. **The 36-hour "stopped working" threshold in the admin table is a guess** — one missed daily run
   plus a margin. It has never been calibrated against a real outage.
6. **`releaseDomain` failing leaves the domain attached at the hosting side while our column is
   cleared.** Deliberate — the row is the operator's truth — but it means the orphan can persist there
   until a later sweep, and nothing currently reconciles that direction.
7. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
