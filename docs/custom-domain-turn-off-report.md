# Turning it off, and a confirmation after Yes

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every handler, column and string quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean. `npx eslint`: no new rule violated.
- **Execution** — the **real component was transpiled and run** and the card rendered in **nine
  states**, including the turn-off panel and a failed release; the **five QR-redirect conditions were
  lifted verbatim out of `app/trucks/[slug]/order/layout.tsx`, transpiled and executed** against real
  row values; `addDomain`, `getDomainConfig` and the whole `domain_provision` handler were compared
  byte for byte; and the ordering-URL helper was run against the expression it replaced.

**NO DEPLOY. NO MIGRATION. NO SQL. NO DOMAIN REMOVED FROM VERCEL** — `releaseDomain` was moved and
wired, never called. Pizzeria Gusto untouched.
**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 1. THE READ — WHAT TURNING IT OFF REQUIRES

### The hosting removal already existed, in the wrong place

`releaseDomain` — `DELETE /v9/projects/{id}/domains/{domain}` — was a **private function inside
`app/api/cron/custom-domain-check/route.ts`.** Turning off from Settings needs the identical call, so I
**moved it verbatim into `lib/custom-domain/vercel.ts`**, beside `addDomain`, and the cron route now
imports it. **One implementation** — `grep` confirms exactly one `function releaseDomain` in the tree.

Its three verdicts matter and are unchanged:

| Result | Reason | Treated as |
|---|---|---|
| `2xx` | `deleted` | ✅ released |
| **`404`** | `gone` | ✅ **released — this is what makes a retry converge** |
| missing credentials | `not_configured` | 🔴 **failure, and it must stay one** |
| other / timeout / network | `http_403`, `timeout`, `network` | 🔴 failure |

### The columns that clear

`custom_domain`, `custom_domain_verified_at`, `custom_domain_confirmed_at`,
`custom_domain_setup_state`, `custom_domain_setup_started_at`, `custom_domain_last_checked_at`,
`custom_domain_last_ok_at`, `custom_domain_last_seen_value` — **all eight, in one statement.**

⚠️ **`embed_enabled` IS DELIBERATELY LEFT TRUE.** It is what makes `/api/embed/events` return anything,
and its only reader is the custom-domain page — which now 404s, because the host resolves to no truck.
Clearing it would buy nothing and would have to be un-cleared on the next setup.

### What the orphan sweep would otherwise do

**Nothing — and that is by construction.** The sweep selects rows where `custom_domain` is not null;
once cleared, the row is **outside its query entirely.** And its orphan test requires
`!custom_domain_verified_at`, which a live domain never satisfies — so it could never have released
this domain anyway. 🔴 **The sweep's guard is tested first, deliberately, because "a released live
domain takes an operator's page down".**

### 🔴 DOES THE QR REDIRECT FALL BACK? PROVEN, NOT ASSUMED

The five conditions, **lifted verbatim from the layout and executed**:

```
    if (!truck || !truck.active) return null
    if (!truck.custom_domain) return null                    ← this one
    if (!truck.custom_domain_verified_at) return null
    if (!truck.custom_domain_confirmed_at) return null
    if (!canAccess(truck.plan, 'embed_schedule', …)) return null
    const lastOk = …; if (!lastOk || Date.now() - lastOk > STOPPED_AFTER_MS) return null
    return truck.custom_domain
```

```
  ROW STATE                                   customDomainFor() returns
  ARMED — all five conditions hold            "events.testtruck.test"  → redirects
  🔴 AFTER TURN-OFF — every column cleared    null  → NO REDIRECT, our page is served
  only custom_domain cleared (nothing else)   null  → NO REDIRECT, our page is served
```

✅ **CLEARING `custom_domain` ALONE IS SUFFICIENT, AND NOTHING ELSE HAS TO RUN.** The layout resolves
**per request** from the row — no stored target, no cache, no job. The next scan after the write serves
our own page. **No write in between**, because there is nothing in between.

⚠️ **And the redirect is a 307**, deliberately, precisely so a printed code is never pinned to a dead
address. **A permanent redirect would have made this unrecoverable.** That decision, taken earlier, is
what makes turning off safe now.

### If the Vercel removal fails

🔴 **RELEASE FIRST, CLEAR ONLY ON SUCCESS — the sweep's lesson, applied a second time.** The three
outcomes, recorded in the handler:

```
release → clear, release FAILS   → the row survives, the operator retries.            RECOVERABLE
release → clear, the CLEAR fails → detached, but our row still names it; the retry
                                   gets `gone` and converges.                          RECOVERABLE
clear → release, release FAILS   → attached at the hosting side with NO row anywhere.
                                   Their web person hits "already assigned to another
                                   project" weeks later and nothing explains why.     UNRECOVERABLE
```

**The failure branch, verbatim, and it writes nothing:**

```ts
if (!release.ok) {
  // 🔴 NOTHING IS WRITTEN. The row still names the domain, so a retry is a retry.
  console.error(`[domain_turn_off] release failed for ${host}: ${release.reason} — row kept`)
  return NextResponse.json({ ok: false, reason: release.reason, message: '…still working…' }, { status: 200 })
}
```

```
  writes inside the failure branch: 0    ✅
  update statements in the whole handler: 1, after the release check
  release at char 244 · the failure return at 274 · the UPDATE at 768   ✅ the only recoverable order
```

### Can they set it up again, and does the DNS record still work?

**Yes.** With `custom_domain` null the card returns to `Set up` and the wizard runs `domain_provision`
again — the same path as a first-time setup.

**And the CNAME they added is untouched: we never had access to it.** It still points at
`cname.vercel-dns.com`, so re-adding the domain to the project should make the address work again
**without them re-adding anything.** The copy says so: *"The line you added at your web address company
can stay where it is."*

🔴 **BUT "STOPS WORKING" IS NOT THE WHOLE TRUTH, AND THIS IS THE ONE THING I WOULD WANT YOU TO SEE.**
Because the CNAME survives, the hostname still resolves to the hosting provider's edge — which no
longer recognises it. **So the operator's address most likely serves a hosting-provider error page
rather than nothing at all.** ⚠️ **UNVERIFIED — I could not test it without removing a real domain,
which you forbade.** The copy avoids promising either way, but if you want it to say *"remove the line
too"* that is a copy change once someone has seen what actually appears.

---

## 2. THE ACKNOWLEDGEMENT AFTER "YES"

The block used to simply vanish. **A control that disappears on click looks like a page that lost the
click.**

```
Thanks — that is all noted.
There is nothing else to do.
```

⚠️ **It shows only when they pressed it THIS session** — `confirmed && !props.confirmedAt` — so an
operator returning to a truck confirmed last week is not thanked again.

✅ **The Yes handler is BYTE-IDENTICAL**, all 326 characters. Nothing about what it records changed.

---

## 3. THE TURN-OFF, AND BOTH ADDRESSES

**Live state only.** Rendered:

```
Turn off your own web address?

This will stop working:
events.testtruck.test

This carries on exactly as it is, and is where your QR code sends people:
https://www.hatchgrab.com/trucks/test-kitchen/order

You can set it up again later. The line you added at your web address company can stay where it is.

[ Keep it on ]   [ Turn it off ]
```

🔴 **BOTH ADDRESSES ARE NAMED, SPELLED OUT.** The ordering one comes from `orderPageUrl(slug)` — and
the manage page's QR card now calls **the same helper** instead of composing the URL inline, so the two
cannot disagree. **Proven identical output** to the expression it replaced.

⚠️ **"Keep it on" is the PRIMARY button and comes first; "Turn it off" is the quiet one.** The
destructive action should not be the one your thumb lands on.

### It cannot be skipped, and cancelling changes nothing

```
  `turnOff` appears 3 times: 1 definition, 1 comment, 1 CALL SITE
  the call site is at char 33588; `{!offAsking ? (` opens at 32195, its ELSE at 32441
  ✅ the call site is in the ELSE branch — reachable ONLY once offAsking is true

  "Turn this off" link : () => { setOffAsking(true); setOffError(null) }   ← state only
  "Keep it on"         : () => { setOffAsking(false); setOffError(null) }  ← state only
  ✅ neither contains call(), fetch or await
  `domain_turn_off` in the component: 1 code occurrence, inside `turnOff`
```

⚠️ **NO PLAN GATE ON THIS ACTION, DELIBERATELY.** Every other domain action is gated on
`embed_schedule`; removal is not. **An operator whose plan has lapsed must still be able to switch off
a page that is still serving** — gating removal behind the plan that pays for it is how a truck ends up
unable to stop something they no longer want. **Stated because it is a deliberate asymmetry.**

---

## 4. ALL NINE STATES, RENDERED

| # | State | Controls |
|---|---|---|
| 1 | not set up | `Set up` |
| 2 | mid-setup | `Continue` |
| 3 | waiting | `Continue` |
| 4 | live, unanswered | `Yes, it looks right` · `No, there's a problem` · **`Turn this off`** |
| 5 | live, after "No" | `View setup` · both answers · Email us · **`Turn this off`** |
| 6 | 🔴 **just pressed "Yes"** | `View setup` · **`Turn this off`** — and *"Thanks — that is all noted."* |
| 7 | live, confirmed earlier | `View setup` · `Turn this off` — **no thanks line** |
| 8 | 🔴 **the turn-off panel** | `View setup` · `Keep it on` · `Turn it off` |
| 9 | the panel after a **failed** release | the same, plus *"…Nothing has changed — your address is still working."* |

⚠️ **`Turn this off` appears in state 4 as well**, beside the confirm answers. That is arguably one
control too many on an unanswered card — **it was not excluded because your brief says "live state
only", and state 4 is live.** One condition if you want it held back until they have answered.

---

## 5. WHAT IS UNCHANGED

| | |
|---|---|
| 🔴 **THE ENTIRE WIZARD** — `{open && overlay(` to end of file | ✅ **BYTE-IDENTICAL, 22,043 chars** |
| 🔴 **The whole `domain_provision` handler** up to its write | ✅ **BYTE-IDENTICAL, 8,293 chars** |
| `addDomain`, `getDomainConfig` | ✅ **BYTE-IDENTICAL** (1,133 / 924 chars) |
| The `domain_confirm` handler and the Yes button | ✅ **BYTE-IDENTICAL** |
| The plan gate, both limiters, `checkSubdomain` ×3, the SOA guard, both `www` guards | ✅ counts equal |
| The orphan sweep's release-first ordering | ✅ unchanged — it now calls the moved function |
| `lib/custom-domain/apex.ts`, `dns.ts`, `lib/ratelimit.ts` | ✅ **not opened** |

**Five files changed.** The cron route lost 35 lines (the moved function) and gained an import.
**Plain-English checker: `110/111 pass`** — the one is the pre-existing `QR: print or display`.
**11 new strings**, generated from `TURN_OFF_COPY` and `CONFIRMED_COPY` so the corpus cannot drift.

---

## 6. WHAT REMAINS UNOBSERVED

1. 🔴 **`releaseDomain` HAS NEVER BEEN CALLED — NOT BY THE SWEEP, NOT BY THIS.** The hosting
   credentials are unset, so it returns `not_configured` and the row is kept. **The success path of
   turning off is entirely untested**, including whether the eight-column clear behaves as written.
2. 🔴 **WHAT THE OPERATOR'S ADDRESS ACTUALLY SHOWS AFTERWARDS IS UNVERIFIED.** §1 — most likely a
   hosting-provider error page, not nothing, because their CNAME survives.
3. 🔴 **NO BUTTON WAS PRESSED IN A BROWSER.** All nine states were rendered by driving `useState`;
   the transitions were not walked.
4. ⚠️ **The QR proof used the conditions lifted from the layout, not an HTTP request.** The test truck
   has `custom_domain_last_ok_at` null, so its redirect is not armed and the live "on" case could not
   be demonstrated — only the logic, which is the part that decides.
5. ⚠️ **`Turn this off` shows on an unanswered card.** §4.
6. ⚠️ **Re-setup after turn-off is untested** — it follows the ordinary provisioning path, which is
   itself untested end to end for want of credentials.
