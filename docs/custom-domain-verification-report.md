# On-demand verification, the waiting copy, the admin alert — and a proposal for the third banner state

**5 September 2026. Branch `whatsapp-connections-s1-s3`. NOT COMMITTED, not staged, not pushed, not deployed. No cap sync, native binary untouched. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

**Method:** 🔎 SOURCE-READ · 🧪 EXECUTED. ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**

## 🔴 CONFIRMED: NOTHING HERE CHANGES WHAT `events.pizzeriagusto.co.uk` SERVES

🧪 **Proven by execution against Gusto's actual column shape, with a real DNS lookup — Proof Q, all three outcomes:**

| Check outcome | `custom_domain_verified_at` after | Page |
|---|---|---|
| **A — passes** (DNS correct) | `2026-09-05T06:00:00Z` — **untouched** | 🟢 **STILL SERVES** |
| **B — fails** (a wrong or moved record) | `2026-09-05T06:00:00Z` — **untouched** | 🟢 **STILL SERVES** |
| **C — hosting lookup cannot answer** | `2026-09-05T06:00:00Z` — **untouched** | 🟢 **STILL SERVES** |

In every case: **no never-clear column touched, nothing set to `null`.** 🔎 And `app/domain/page.tsx` is **not modified** (0 changes), `proxy.ts` is **not modified this stage**.

---

# 🔴 HARNESS FRESHNESS — RUN FIRST

```
apex.ts          ✅ IDENTICAL aa2dacfdc4dd5893…   (sha256 vs source)
custom-host.ts   ✅ IDENTICAL 82f30dee296f6ddb…
cadence.ts       one import rewritten (@/vercel.json → ./vercel.json, + a JSON import attribute Node ESM requires and Next's bundler does not)
check.ts / copy.ts / dns.ts   non-import differences: NONE
```
🧪 **`diff` filtered to print any non-import line printed nothing for all four rewritten copies.**

**Marker grep** (a hash proves sameness, not recency):
```
runDomainCheck in harness check.ts:        1
decideAdminAlert in harness check.ts:      3
SETUP_GRACE_IN_CHECKS in harness check.ts: 2
"We are waiting for" in harness copy.ts:   2   (the string + the note above it)
adminDomainAlertEmail in harness copy.ts:  1
```

---

# TASK 1 — ON-DEMAND VERIFICATION ✅

## One lookup, two callers — the shared function, quoted

**`lib/custom-domain/check.ts` → `runDomainCheck(input, now)`.** Every line of it was **extracted** from the cron, not rewritten:

```ts
const [seen, cfg] = await Promise.all([resolveCname(host), getDomainConfig(host)])
const expected = cfg.ok ? cfg.recommendedCNAME : null
if (!seen.reachable) { /* a resolver failure is NOT an outage — stamp checked_at only */ }
const ok = !!seen.value && !!expected && seen.value === expected.toLowerCase().replace(/\.$/, '')
const patch = { custom_domain_last_checked_at: …, custom_domain_last_seen_value: seen.value }
if (ok) patch.custom_domain_last_ok_at = …
const goingLive = ok && !input.verifiedAt
if (goingLive) patch.custom_domain_verified_at = …
```

**Both call sites:**
1. **`app/api/cron/custom-domain-check/route.ts`** — the inline check is gone (🧪 `grep` for `resolveCname|getDomainConfig` in that file → **no matches**), replaced by `const result = await runDomainCheck({ host, verifiedAt, lastOkAt, lastCheckedAt, setupStartedAt }, now)`.
2. **`app/api/manage/route.ts`, action `domain_check`** — the same call, from the operator's request.

🔴 **Two implementations of "is this domain working" would disagree, and the disagreement would present as a dashboard that says live and a cron that says not.**

## Triggered by OPENING THE SETUP BOX

🔎 `components/dashboard/CustomDomainSetup.tsx` — a `useEffect` keyed on `[open, props.customDomain, props.verifiedAt]` fires `call('domain_check')`. ⚠️ **Not at wizard completion**, deliberately: a single check the moment they add the record nearly always fails on propagation and reads as broken. **Opening the box is the gesture that means "has it worked yet".**

⚠️ It never surfaces an error — a check that cannot run leaves the operator exactly where they were.
🟢 On success the box **immediately** swaps the waiting panel for *"<address> is working. Have a look at it…"*, without a reload — the page loaded with the old `verifiedAt`, so a local `justWentLive` flag carries it.

## The rate limit

**`domainCheckRatelimit` — 6 per hour, keyed on `domain_check:<truck.id>`**, enforced **in the `domain_check` action** in `app/api/manage/route.ts`.

- 🔴 **Keyed on the truck, not the IP** — this is behind a dashboard token, so there is an identity; one operator refreshing cannot exhaust another's budget, and two operators on one venue's WiFi do not collapse into a bucket.
- 🔴 **Enforced in the route, not `proxy.ts`** — that file limits a positive allowlist of public, bulk-scrapeable paths and structurally excludes operator surfaces; its own comment makes the point.
- **Six** because each check is a DNS resolution **plus** a call to a third party's API. The legitimate pattern — add the record, open the box, come back a few times in an hour — fits inside it.
- ⚠️ **A refusal is not an error.** The operator gets the state we already hold; they opened a box, they did not ask for a network call.
- ⚠️ **Fails open** if Redis is unwell. Refusing the check to protect a rate limit would recreate the dead-page bug.
- ⚠️ Dev bypass, mirroring `whatsapp-preview`.

## 🔴 What happens on a domain that is ALREADY live — proven with Gusto's values

🧪 **Proof Q, above.** The mechanism is that **the patch is additive and cannot subtract:**
- `custom_domain_verified_at` — written **only** on the going-live transition, **never cleared**.
- `custom_domain_last_ok_at` — written **only** when the check passes.
- `custom_domain`, `custom_domain_setup_state`, `custom_domain_confirmed_at` — **never touched**.

So a **failing** check on a trading truck records `last_seen_value` and a `last_checked_at` stamp, leaves `last_ok_at` at its old value, and **the page keeps serving**, because `app/domain/page.tsx` reads `custom_domain_verified_at` and nothing here can unset it.

🔴 **A comment at the function says explicitly: do not add a "clear `verified_at` when it stops resolving" branch.** A resolver hiccup would take a trading truck's page down — and the admin alert exists precisely so that is not needed.

---

# TASK 2 — THE WAITING COPY ✅

**Title:** *We are waiting for events.pizzeriagusto.co.uk*
**Body:** *You set this up on 4 September. New web addresses usually start working within a few minutes, and occasionally take up to 24 hours to reach everyone — there is nothing you need to do while that happens. If someone else was adding the line for you, it is worth checking they did.*

🧪 **Vocabulary check, executed:** ✅ absent — `domain`, `subdomain`, `DNS`, `CNAME`, `record `, `not working`, `failed`, `error`. 🧪 ✅ *"usually a few minutes"* appears **before** *"24 hours"*.

🔴 **It was a failure message and now is not.** It read *"<address> is not working yet"* and *"it has not started working"* — telling an operator who did everything right that something is wrong. They then get in touch about a non-problem and learn to distrust a screen that will later say something true.

🔴 **"Up to 24 hours" is now a fact about DNS, not about our schedule — and until today it was both.** The only thing that could mark a domain live was a daily cron, so 24 hours was our cadence wearing DNS's clothes. Task 1 removes that, so the sentence leads with what propagation actually does. ⚠️ A comment at the string says: **if this ever reads "up to 24 hours" without "usually a few minutes" in front of it, someone has quietly re-described our own delay as the internet's.**

**Every surface this copy appears on:** 🧪 **one** — the setup box in Manage → Settings, via `notificationCopy().waiting`. It is no longer in the banner (removed last stage), is not on the dashboard, and is not in any email.

---

# TASK 3 — THE ADMIN ALERT ✅

## The three states

| State | Operator sees | Admin gets |
|---|---|---|
| Waiting, **inside** the grace window | the Task 2 copy | 🟢 **nothing** |
| Waiting, **past** the grace window | the Task 2 copy (unchanged) | 📧 **one** email, `setup_stalled` |
| Was working, **now failing** | *(banner state — Task 4, your decision)* | 📧 **one** email per outage, `stopped_working` |

🟢 **The operator is never shown a failure message in any state.**

## 🔴 The once-per-transition mechanism — and it needs no new column

```
crossedNow    = now                          - anchor > window
crossedBefore = custom_domain_last_checked_at - anchor > window
send  ⟺  crossedNow AND NOT crossedBefore
```

**The run that steps over the line sends; every run after it sees `crossedBefore` true and stays quiet.**

🔴 **A new column would have been the obvious answer and is not needed.** `last_checked_at` already records "when we last looked", which is exactly the state a once-per-transition rule requires.

**How it resets, with nothing to clear:**
- `stopped_working` is anchored on `custom_domain_last_ok_at`. A domain that recovers gets a fresh `last_ok_at` **from that very check**, moving the anchor and making `crossedBefore` false again — so a second outage sends a second email.
- `setup_stalled` is anchored on `custom_domain_setup_started_at`. Going live ends it permanently: a passing check returns `alert: null` before the decision function is reached.

⚠️ **The on-demand caller evaluates it too, and that is not optional.** It writes `last_checked_at` — so if only the cron sent, an operator opening the box could step the timestamp past the line and **the cron would then never see the transition.** The alert would be swallowed by the very feature meant to help.

## The grace window — one named constant, derived in CHECKS

```ts
export const SETUP_GRACE_IN_CHECKS = 1
export const SETUP_GRACE_MS = SETUP_GRACE_IN_CHECKS * CHECK_INTERVAL_MS
```

🔴 **No hours literal anywhere**, following `cadence.ts`'s existing rule that a threshold in hours encodes an answer whose question lives in `vercel.json`'s schedule. 🧪 **Executed:**

```
cron expression from vercel.json : 0 7 * * *   derived=true
CHECK_INTERVAL_MS                : 24h
SETUP_GRACE  = 1 check(s)        : 24h   ← the same 24h the operator is told
STOPPED_AFTER = (2+0.5) checks   : 60h
```

🟢 **The operator's "24 hours" and the alert's 24 hours are the same number by derivation, not coincidence** — change the schedule and both move. ⚠️ No margin is added here, unlike `STOPPED_AFTER_MS`: that margin stops a late job flipping a *healthy* domain to "problem"; this measures wall-clock since setup and has no such failure mode.

## 🧪 PROOF P — the guards bite, must-not-send and must-send side by side

| Case | Result | |
|---|---|---|
| setup 2h ago, checked 1h ago *(inside grace)* | **NO EMAIL** | ✅ |
| setup 23h ago, checked 1h ago *(inside grace)* | **NO EMAIL** | ✅ |
| **setup 25h ago, last check 23h ago *(CROSSES NOW)*** | **📧 `setup_stalled`** | ✅ |
| setup 49h ago, last check 25h ago *(already sent)* | **NO EMAIL** | ✅ |
| **setup 25h ago, NEVER checked *(first look)*** | **📧 `setup_stalled`** | ✅ |
| no `setup_started_at` at all | **NO EMAIL** | ✅ |
| live, last ok 1h ago *(healthy)* | **NO EMAIL** | ✅ |
| live, last ok 59h ago *(inside window)* | **NO EMAIL** | ✅ |
| **live, last ok 61h, checked 13h ago *(CROSSES NOW)*** | **📧 `stopped_working`** | ✅ |
| live, last ok 85h, checked 13h ago *(already sent)* | **NO EMAIL** | ✅ |

**Mismatches: 0.**

🧪 **And walked forward as a real sequence, not a snapshot** — each run's timestamp becomes the next run's `lastChecked`:
```
+ 1h silent · +12h silent · +24h silent · +25h 📧 EMAIL · +26h silent · +48h silent · +72h silent
🔴 exactly one email in the sequence
```
🧪 **Recovery resets it:** `outage 1 crosses → 📧` · `outage 1 continues → silent` · `RECOVERED → silent` · `outage 2 crosses → 📧`.

## What the email carries — 🧪 every field verified present

```
Subject: Custom domain STOPPED WORKING — events.pizzeriagusto.co.uk (Pizzeria Gusto)
  Truck                 Pizzeria Gusto (pizzeria-gusto)
  Address               events.pizzeriagusto.co.uk
  Resolving to          someone-elses-host.example.com     ← 🔴 the field that decides it
  Should resolve to     42b6747fc9c9cf2e.vercel-dns-017.com
  Setup started         2026-09-04T10:00:00Z
  Last successful check 2026-09-02T07:00:00Z
```

🔴 **`custom_domain_last_seen_value` is the one that actually diagnoses it** — a mistyped record, a record pointing at someone else's host, and a site that has moved provider look identical from the outside and are told apart entirely by what the name currently resolves to. 🧪 It renders **`nothing`** when the name resolves to nothing, which is the most common finding and means the record was never added, or was added on the wrong name.

## Brevo, and it cannot break the cron

**`sendConfirmationEmail` from `lib/email.ts`** — the same Brevo path and the same `senderName: 'HatchGrab'` override the live-domain email already uses. Recipient is a **named constant**, `ADMIN_ALERT_TO = 'admin@hatchgrab.com'` — 🔴 **not an env var**: it is not a secret, not per-environment, and a missing variable would silently route the one email that matters to nobody. A constant fails in code review instead of at 3am.

🟢 **A send failure cannot break the run.** `sendAdminDomainAlert` **swallows every failure and returns a boolean** — it never throws. And ⚠️ **the caller writes the row FIRST and sends SECOND**, deliberately: a dropped alert is recoverable by the next run; a dropped write is not.

---

# TASK 4 — THE BANNER'S THIRD STATE: A PROPOSAL, 🔴 YOURS TO APPROVE

## What it does today: **nothing.** Still silent, unchanged by this build.

`domainNotice` returns `null` once `custom_domain_confirmed_at` is set, so a truck that went live, confirmed, and then broke gets no banner at all.

## The proposal

**Condition** (all four): `custom_domain` set · `custom_domain_verified_at` set · `custom_domain_last_ok_at` older than **`STOPPED_AFTER_MS`** (the existing derived constant, already used by the admin table) · dismissible per session like the other three banners.

**Amber, ⚠️, one sentence:**

> **events.pizzeriagusto.co.uk** has stopped working. **We already know and are looking into it** — you do not need to do anything. Your ordering page is unaffected.

**Why each clause:**
- 🔴 **"We already know"** is the whole point — Task 3 means you are notified, so the banner must not send them hunting for a problem you are already on. Without that clause it is an alarm; with it, it is a courtesy.
- 🔴 **"Your ordering page is unaffected"** is the fear it must answer. An operator seeing "your web address has stopped working" will reasonably assume they are not taking orders. **They are** — `hatchgrab.com/o/<slug>` is untouched by a custom-domain outage, and that is the sentence that stops the phone call.
- **No action, no button.** There is nothing they can usefully do; a "Fix it" button that opens the setup box would be a control that cannot help.
- **Amber, not red.** Red is for a thing they must act on.

⚠️ **Open question I am NOT deciding:** whether it should also appear for a truck that is live but **not yet confirmed** (today's Gusto). That truck currently gets the green "is live" banner, and the two conditions can both be true — live-and-unconfirmed and stopped-working. **I would suppress the green one in that case**, but it is a copy decision and it is yours.

🔴 **NOT BUILT.** No code for this state was written.

---

# NOT IN SCOPE — REPORTED AGAIN SO THEY ARE NOT LOST

- 🔴 **`app/admin/page.tsx:1630`** — the temporary-password copy button **signals nothing at all**: no state, no label change, no toast. *A button that signals nothing is indistinguishable from a button that does nothing.*
- 🔴 **`app/admin/page.tsx:576`** (`copyToken`) and **`components/dashboard/DemoWelcome.tsx:78`** — both call `writeText` fire-and-forget and set "copied" **unconditionally**, so a **rejected** copy still shows success.
- ⚠️ **`app/manage/[token]/page.tsx` `copyKdsLink`** — no `try`, so a rejection is an unhandled promise and the operator sees nothing.

**None built, as instructed.**

---

# VERIFICATION

| Check | Method | Result |
|---|---|---|
| **Harness freshness (hash + non-import diff + marker)** | 🧪 **Executed FIRST** | ✅ |
| `npx tsc --noEmit` | 🧪 Executed | **exit 0, clean** |
| **Email threshold, 10 cases (5 must-not-send, 3 must-send, 2 boundary)** | 🧪 **Executed (P)** | ✅ 0 mismatches |
| **Once-per-transition, walked forward over 7 runs** | 🧪 **Executed (P)** | ✅ exactly one email |
| **Recovery resets, second outage re-sends** | 🧪 **Executed (P)** | ✅ |
| **Live row unharmed — pass, fail, and lookup-failure** | 🧪 **Executed (Q)** with a REAL DNS lookup | ✅ page serves in all three |
| **Windows derived from `vercel.json`, no hours literal** | 🧪 **Executed** | 24h / 60h, `derived=true` |
| **Operator copy vocabulary (8 banned terms)** | 🧪 **Executed** | ✅ all absent |
| **"few minutes" precedes "24 hours"** | 🧪 **Executed** | ✅ |
| **Admin email carries all 7 diagnostic fields** | 🧪 **Executed** | ✅ + `nothing` fallback |
| Inline check removed from the cron | 🧪 Executed grep | ✅ no `resolveCname`/`getDomainConfig` left |
| `app/domain/page.tsx` unmodified | 🧪 Executed | ✅ 0 changes |
| Rate limit enforced in the action | 🔎 Source-read | `domain_check:<truck.id>`, 6/h |
| Alert send cannot throw | 🔎 Source-read | try/catch → boolean |
| **Anything rendered in a browser** | ❌ **NOT DONE** | see below |

🔴 **Proof Q was wrong on its first run and I fixed the test, not the claim.** It `break`ed after the passing case, so the load-bearing case — a **failing** check on a live row — never ran. Reported because a proof that silently skips the case it exists for is worse than no proof.

## Safari-on-macOS click-through — localhost:3000, Manage → Settings

⚠️ **I rendered none of this.** ⚠️ **On localhost the rate limit is bypassed** (dev), so every open runs a real check.

1. **Truck with no domain.** **See:** the card, **Set up**, no waiting panel, no green panel.
2. **Truck mid-setup, record not yet added.** Open the box. **See:** the amber ⏳ panel — *"We are waiting for <address>"* and *"…usually start working within a few minutes, and occasionally take up to 24 hours…"*. 🔴 **Wrong if it says "is not working yet"** — that is the old failure wording.
3. 🔴 **The fix itself.** With DNS correct but `custom_domain_verified_at` still null, **open the box.** **See:** the amber panel is **replaced by a green one** — *"<address> is working. Have a look at it, then tell us it is right below."* — **without a page reload.** 🔴 **Wrong if you must reload to see it**: that is the eleven-hour bug in miniature.
4. **Immediately re-open the box.** **See:** the green "Live" pill beside the title, no waiting panel, no second check needed.
5. **The operator's email.** After step 3, check the truck's `contact_email` inbox. **See:** the "your address is live" email, **once**. **Wrong if** it arrives twice — the transition must fire on one check only.
6. **Rate limit** (production only). Open and close the box seven times inside an hour. **See:** the box still opens and still shows the correct state; the 7th makes no network call. **Wrong if** the box errors or blanks.
7. **A truck whose record is wrong.** Open the box. **See:** the waiting panel, **unchanged** — 🔴 **no failure message, no red, no "we couldn't find it".** The admin email is the only thing that fires, and only past 24 hours.
8. **Gusto (live, unconfirmed).** Open the box. **See:** the **Live** pill, the confirm prompt, **no waiting panel**, and — 🔴 critically — **the page still serves at `events.pizzeriagusto.co.uk` afterwards.**
9. **The banner.** Top of any tab: the green ✅ "is live" banner for a live-unconfirmed truck; **nothing** for a confirmed truck; **nothing** for worked-then-stopped (Task 4, unbuilt).

**Cannot be tested on localhost:** the admin alert email (needs `BREVO_API_KEY` and a real threshold crossing), and the rate limit (dev bypass).

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 staged.**

## Custom-domain group

```
lib/custom-domain/check.ts                 NEW (untracked)   the shared check + the alert decision
lib/custom-domain/alert.ts                 NEW (untracked)   the Brevo send, cannot throw
components/dashboard/CopyButton.tsx        NEW (untracked)   (previous stage)
app/api/cron/custom-domain-check/route.ts  +78 / -…
components/dashboard/CustomDomainSetup.tsx +103 / -…
lib/custom-domain/copy.ts                  +139 / -…
lib/custom-domain/dns.ts                   +27
lib/custom-host.ts                         +41 / -…
lib/ratelimit.ts                           +20
                                           6 tracked, 351 insertions(+), 57 deletions(-)
```

## 🔴 THREE FILES CARRY TWO WORKSTREAMS — `git add -p` NEEDED

**One more than last time:**

| File | Carries |
|---|---|
| `lib/custom-domain/copy.ts` | this workstream **+** the pre-existing uncommitted work (~6+/3−) |
| `app/manage/[token]/page.tsx` | this workstream **+** the entire WhatsApp S1–S5 |
| 🆕 **`app/api/manage/route.ts`** | **this build's `domain_check` action + WhatsApp S1–S5's `readWhatsAppConnection`** |

**Staging any of the three stages both workstreams' changes to it.** Reported, not chosen.

## Unchanged, verified this run

| Group | Diff | Status |
|---|---|---|
| **Pre-existing five** — `app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `ios/…/project.pbxproj`, `proxy.ts`, `vercel.json` | **5 files, 46+/53−** | 🟢 **byte-for-byte unchanged** — order rename, derivation extraction, `ios/` file, and **`proxy.ts` untouched** |
| **Copy workstream** — `lib/plan-features.ts`, `app/landing/page.tsx`, `lib/landing-table.ts`, `lib/meta/webhook-signature.ts` | **4 files, 142+/49−** | 🟢 unchanged |
| **WhatsApp libs** — `lib/whatsapp/*` | 1 file, 113+ | 🟢 unchanged |
| `app/domain/page.tsx` | — | 🟢 **not modified** |
| `docs/reference-manual.md` | 565+/4− | 🟢 unchanged — I did not edit the manual |
| Outreach files, `app/order/[id]/page.tsx`, `lib/outreach.ts`, `lib/whatsapp-hint.ts` | — | 🟢 still untracked, unstaged |

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **Nothing was rendered in a browser.** The green "it's working" panel, the waiting panel and the whole click-through are **source-read only**. Step 3 is the one that proves the fix.
- 🔴 **No email was sent.** `BREVO_API_KEY` is not exercised here — the admin alert's *content* and *decision* are proven by execution; **the send itself has never run.** The `sendConfirmationEmail` path is shared with emails that do work in production, which is evidence and not proof.
- 🔴 **`ADMIN_ALERT_TO = 'admin@hatchgrab.com'` is unverified as a deliverable mailbox.** I took the address from your instruction; I cannot check it receives.
- 🔴 **The on-demand check has never run against production.** `getDomainConfig` needs `VERCEL_API_TOKEN`, which is not set locally — ⚠️ **so in the harness it is stubbed.** `resolveCname` **is** the real function and did do a real lookup, which is why Proof Q's `last_seen_value` is Gusto's genuine record. **The hosting half of the comparison is stubbed and the DNS half is real.**
- 🔴 **The rate limiter has never been exercised** — it is bypassed outside production and needs Redis.
- ⚠️ **The `setup_stalled` window (24h) is a judgement.** It is derived rather than literal, and the derivation is the defensible part; the choice of *one* check is not measured against anything observed.
- ⚠️ **I did not verify that the cron still runs correctly end to end** after the extraction — `tsc` passes and the logic is the same lines, but **the cron has not been executed since the change.** `GET /api/cron/custom-domain-check?dry=1` with an admin session would prove it without writing.
- ⚠️ **Task 4 is a proposal, not code.** Nothing about the third banner state has been built or rendered.

# FLAGS

- 🟢 **CONFIRMED: nothing changes what `events.pizzeriagusto.co.uk` serves.** Proven across all three check outcomes with a real DNS lookup.
- 🔴 **The eleven-hour dead page is fixed** — opening the setup box now runs the same check the cron runs and can mark a domain live immediately.
- 🔴 **The on-demand caller must evaluate the admin alert**, or it would swallow the cron's transition. Built that way; the reason is recorded at both call sites.
- 🔴 **Three files now carry two workstreams each** and need `git add -p`.
- 🔴 **The worked-then-stopped banner is still silent** — proposal above, **yours to approve.**
- ⚠️ **The cron has not been run since the check was extracted from it.** A `?dry=1` run is the cheap confirmation.
- ⚠️ **Three copy buttons elsewhere still signal falsely or not at all.** Reported again, unbuilt.

*Nothing committed. Nothing staged. `main` = `2ca66cd`. The live page is untouched.*
