# Signup / onboarding — read-only diagnostic (round 2)

**Date:** 3 August 2026 · **Mode:** read-only. No file changed, nothing fixed, no `next dev` / `next build`.
This **replaces** round 1. T2, T3, T5, T6 and T7 were accepted and are **not repeated** — their findings
are referenced where they matter.

Every claim is **read from code** unless marked **LIVE-VERIFIED (yours)**. I ran **no** database query.
**No mojibake or garbled spans** were found in any file read.

---

## 0. CORRECTION — round 1 §0 was WRONG, and I am withdrawing it

Round 1 concluded `canSetup` was false and the visitor took the email-link → `/signup` → `/setup` path.
**Your production data refutes that**, and the refutation is airtight:

| Evidence (LIVE-VERIFIED, yours) | What it kills |
|---|---|
| `demo_sessions.email` NULL, `email_sent_at` NULL | `/api/demo/save-email` was never called. Round 1's own T1b established that endpoint is the **only** action on the `canSetup === false` arm. |
| Auth 21:34:33.461 → operator .639 → verification row .816 → sign-in 21:34:34.779 → truck 21:34:36.560 | The `runSetup` chain ran end to end in **3.1 s** — that is the in-modal wizard, in one session, with no navigation. |
| Verification clicked 21:35:47.366 | **71 s AFTER the truck already existed.** Verification could not have gated anything that had already happened. |
| Two 24 July signups: `verified_at` NULL, rows expired, **both produced working trucks** | Verification has never gated truck creation. |

**Established: `canSetup` was TRUE, the in-modal wizard ran, and email verification gated nothing.**
Round 1's T1d ("no branch requires an emailed round-trip on the setup path") was correct, and §0
contradicted it. **I built a headline on a hypothesis my own trace had already refuted — that was the
error, not a missing fact.** Nothing below rests on §0.

⚠️ **What that leaves unexplained, and what U1 now answers:** if the wizard ran and finished, why did S1
report a name/truck form appearing *after* verification? The answer is not that verification gated it —
it is that **the verification link's destination *is* that form**.

---

## U1 — THE VERIFICATION FLOW, END TO END

### U1a. The link in the email

```ts
const origin = req.nextUrl.origin
const link = `${origin}/api/auth/verify-signup?token=${token}`
```
— [app/api/signup/route.ts:149-150](app/api/signup/route.ts#L149-L150)

`token` is `randomBytes(32).toString('hex')` ([:140](app/api/signup/route.ts#L140)); `expires_at` is
`VERIFY_TTL_DAYS` out ([:141](app/api/signup/route.ts#L141)). Origin is taken from the request, so the
link is host-relative to whatever served the signup POST.

### U1b. 🔴 What that URL does — and where it lands

`app/api/auth/verify-signup/route.ts` is a **route handler, not a page**. Its entire redirect surface is
one helper:

```ts
const back = (status: string) => NextResponse.redirect(`${origin}/setup?verify=${status}`)
```
— [app/api/auth/verify-signup/route.ts:23](app/api/auth/verify-signup/route.ts#L23)

**Every branch — all five — redirects to `/setup`. There is no other destination in the file:**

| Branch | Line | Redirect |
|---|---|---|
| no `token` param | [:25](app/api/auth/verify-signup/route.ts#L25) | `/setup?verify=invalid` |
| token not found | [:35](app/api/auth/verify-signup/route.ts#L35) | `/setup?verify=invalid` |
| already `verified_at` | [:37](app/api/auth/verify-signup/route.ts#L37) | `/setup?verify=ok` |
| expired | [:38](app/api/auth/verify-signup/route.ts#L38) | `/setup?verify=expired` |
| success (writes `verified_at`) | [:40-46](app/api/auth/verify-signup/route.ts#L40-L46) | `/setup?verify=ok` / `invalid` on write error |

🔴 **This is the answer to S1.** The operator clicked the confirmation email 71 s after their truck
existed, and the link **took them to `/setup`** — a page whose first and only step asks *"What's your
truck called?"* (U1d). The wizard did not appear *because* verification unlocked it; it appeared
*because the verification link's only destination is that wizard*. There is **no branch that considers
whether the operator already has a truck**, and no branch that returns them to `/manage`.

### U1c. Does anything read `verified_at` to gate anything? — **NO. It gates nothing.**

Every reference to the table, exhaustively:

| file:line | Operation |
|---|---|
| [app/api/signup/route.ts:142](app/api/signup/route.ts#L142) | **INSERT** the row |
| [app/api/auth/verify-signup/route.ts:29-31](app/api/auth/verify-signup/route.ts#L29-L31) | **SELECT** `id, expires_at, verified_at` by token |
| [app/api/auth/verify-signup/route.ts:37](app/api/auth/verify-signup/route.ts#L37) | reads `row.verified_at` — only to decide the redirect **status string** |
| [app/api/auth/verify-signup/route.ts:41-43](app/api/auth/verify-signup/route.ts#L41-L43) | **UPDATE** `verified_at` |

**That is the complete list.** Nothing else in `app/` or `lib/` touches `operator_email_verifications`.

⚠️ **Four other `verified_at` hits are a DIFFERENT table** — `operator_email_changes` (the email-*change*
flow): [app/verify-email/page.tsx:33](app/verify-email/page.tsx#L33), [:50](app/verify-email/page.tsx#L50),
[:135](app/verify-email/page.tsx#L135); [app/api/auth/resend-verification/route.ts:30](app/api/auth/resend-verification/route.ts#L30),
[:35](app/api/auth/resend-verification/route.ts#L35); [app/api/auth/cancel-email-change/route.ts:41](app/api/auth/cancel-email-change/route.ts#L41);
[app/api/manage/route.ts:154](app/api/manage/route.ts#L154). None reads the signup table.

#### 🔴 The go-live gate that was supposed to consume it is **not wired at all**

`lib/go-live-checks.ts` defines `email_unverified` ([:33](lib/go-live-checks.ts#L33), [:187-204](lib/go-live-checks.ts#L187-L204))
and exports exactly one function:

```ts
export function checkGoLive(input: GoLiveInput): GoLiveResult   // :75
```

**`checkGoLive` has ZERO call sites.** A repo-wide search for the identifier outside its own file returns
nothing, and the module is `import`ed by no file — the only two references to `go-live-checks` anywhere
are **comments** asserting that it does something:

- [app/api/signup/route.ts:138](app/api/signup/route.ts#L138) — *"lib/go-live-checks.ts is what makes it matter"*
- [app/api/setup/route.ts:72](app/api/setup/route.ts#L72) — *"lib/go-live-checks.ts blocks go-live until it is set"*

**Plainly: `verified_at` gates access to nothing, ordering of nothing, go-live of nothing, and no UI
state.** It is written, read back once to choose a banner colour on `/setup`, and otherwise inert. That
is exactly consistent with your two 24 July signups producing working trucks with `verified_at` NULL.

### U1d. What a signed-in operator with `setup_step 'menu'` sees at `/setup`

**`/setup` renders the truck-name form unconditionally.** It performs no lookup of any kind — no truck
query, no `setup_step` check, no redirect guard. Its state is three `useState`s and a `verify` param
([app/setup/page.tsx:34-42](app/setup/page.tsx#L34-L42)).

What renders:
- a `verify=ok` green banner *"Email confirmed — thank you."* ([:83-87](app/setup/page.tsx#L83-L87)), or the amber `expired` one ([:88-92](app/setup/page.tsx#L88-L92)). ⚠️ **`verify=invalid` renders no banner at all** — that status has no branch.
- a stepper *"1. Your truck › 2. Your menu › 3. First event"* ([:96-106](app/setup/page.tsx#L96-L106))
- **`<h1>What's your truck called?</h1>`** with a required `name` input, `autoFocus` ([:110-122](app/setup/page.tsx#L110-L122))
- a footer button *"Continue"*, disabled until `name.trim().length >= 2` ([:139-142](app/setup/page.tsx#L139-L142))

#### 🔴 What submit does with the typed name: **discards it**

Client sends it ([app/setup/page.tsx:52-56](app/setup/page.tsx#L52-L56)):
```ts
body: JSON.stringify({ action: 'create_truck', name: name.trim() }),
```

Server, [app/api/setup/route.ts:46-59](app/api/setup/route.ts#L46-L59):
```ts
if (body.action === 'create_truck') {
  const name = String(body.name ?? '').trim()
  const contactEmail = String(body.contact_email ?? '').trim() || operator.email || null
  if (name.length < 2) {
    return NextResponse.json({ ok: false, error: 'Give your truck a name.' }, { status: 400 })
  }

  // Idempotence: a double-submit (or a retry after a flaky response) must not mint a second truck.
  const { data: existing } = await supabase
    .from('trucks').select('id, dashboard_token, setup_step')
    .eq('operator_id', operator.id).not('setup_step', 'is', null).neq('setup_step', 'done').limit(1)
  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, truck: existing[0], resumed: true })
  }
```

**`name` is validated and then never used on this path.** `test-truck-3-2` has `setup_step 'menu'`
(LIVE-VERIFIED, yours), which satisfies `not null` + `neq 'done'`, so the guard fires and returns
`resumed: true`. The operator types a truck name, presses Continue, gets `ok:true`, and **the name is
silently dropped**. The client does not read `resumed` ([app/setup/page.tsx:58-61](app/setup/page.tsx#L58-L61))
and pushes on:

```ts
router.push(`/manage/${data.truck.dashboard_token}?import=demo`)
```
— [app/setup/page.tsx:61](app/setup/page.tsx#L61)

### U1e. The reconstructed 2 August sequence

| Time | Event | Code |
|---|---|---|
| 21:34:33.461 | auth user | [signup/route.ts:85](app/api/signup/route.ts#L85) |
| 21:34:33.639 | operator row | [:113](app/api/signup/route.ts#L113) |
| 21:34:33.816 | verification row + Brevo send | [:142](app/api/signup/route.ts#L142), [:152](app/api/signup/route.ts#L152) |
| 21:34:34.779 | sign-in | [DemoGetStarted:470](components/DemoGetStarted.tsx#L470) |
| 21:34:36.560 | truck (`setup_step 'menu'`) | [setup/route.ts:62](app/api/setup/route.ts#L62), [:78](app/api/setup/route.ts#L78) |
| ~21:34:36+ | confirmation beat, then Continue → `/manage/<token>?import=demo` | [DemoGetStarted:580](components/DemoGetStarted.tsx#L580), [:587](components/DemoGetStarted.tsx#L587) |
| **21:35:47.366** | **verification link clicked → `/setup?verify=ok`** | [verify-signup:23](app/api/auth/verify-signup/route.ts#L23) |
| then | truck-name form; Continue → `resumed:true`, name discarded → back to `/manage?import=demo` | [setup/route.ts:57](app/api/setup/route.ts#L57), [app/setup/page.tsx:61](app/setup/page.tsx#L61) |

**S1 is fully explained and it is the reverse of what it looked like**: verification did not gate the
wizard; the verification link *is* a door back into the wizard, and that door does not check whether the
work is already done. It also delivers a **second** full navigation to `/manage?import=demo`, which is an
additional S4 toast on top of the tab-remount mechanism round 1 recorded (T3c).

---

## U2 — DEMO-TRUCK RETIREMENT AT SIGNUP

**It was never wired. There is no retirement code on the signup path to be gated or broken.**

### `deleteTruckCascade` — three callers, none in signup

| file:line | Caller | Trigger |
|---|---|---|
| [app/api/admin/delete-truck/route.ts:132](app/api/admin/delete-truck/route.ts#L132) | admin teardown | manual admin action |
| [app/api/cron/demo-cleanup/route.ts:65](app/api/cron/demo-cleanup/route.ts#L65) | `sweep()` in the hourly cron | scheduled |
| [lib/provision-truck.ts:350](lib/provision-truck.ts#L350) | its own rollback | a failed provision |

**Neither `/api/signup` nor `/api/setup` imports `lib/delete-truck`.** `/api/signup`'s only demo action is
the claim ([signup/route.ts:172-179](app/api/signup/route.ts#L172-L179)):

```ts
if (demoToken && isDemoIdentifier(demoToken)) {
  const { data: demoTruck } = await supabase
    .from('trucks').select('id').eq('dashboard_token', demoToken).maybeSingle()
  if (demoTruck) {
    await supabase.from('demo_sessions')
      .update({ claimed_by_operator_id: operator.id }).eq('truck_id', demoTruck.id)
  }
}
```

It sets `claimed_by_operator_id` and **nothing else** — no `retired_at`, no cascade, no session close.
The comment above it states the claim's purpose is to *stop* deletion, not cause it:
*"it stops the cleanup job deleting a demo mid-migration"* ([:169-170](app/api/signup/route.ts#L169-L170)).

### `retired_at` has **no writer**, and the code says so

Two comments in the cleanup cron record this as a known, deliberate gap:

> *"NOT a `retired_at` mechanism (that has no writer and is its own diff) — see the 1b sweep."*
> — [app/api/cron/demo-cleanup/route.ts:45](app/api/cron/demo-cleanup/route.ts#L45)

> *"This does NOT use `retired_at` (no writer exists; that mechanism is its own future diff) — it keys on
> the claim plus age…"*
> — [app/api/cron/demo-cleanup/route.ts:141-143](app/api/cron/demo-cleanup/route.ts#L141-L143)

A repo-wide search for `retired_at` returns **only those two comments**. There is no write anywhere.

### Why your four demo trucks are all still there

The cron is the only automated deleter, and a claimed session is reclaimed only when **both** conditions
hold ([:144-149](app/api/cron/demo-cleanup/route.ts#L144-L149)):

```ts
.not('claimed_by_operator_id', 'is', null)
.lt('expires_at', new Date().toISOString())
.lt('created_at', claimCutoff)          // CLAIM_GRACE_DAYS = 30
```

`CLAIM_GRACE_DAYS = 30` ([:46](app/api/cron/demo-cleanup/route.ts#L46)). Your two **claimed** demos are
days old, not 30+, so they are correctly excluded. The two **unclaimed** ones fall to the ordinary
retention sweep once `expires_at` passes.

**Verdict: not gated, not broken — never wired.** Production matching "it has never run" is the expected
behaviour of code that does not exist.

**Two queries, to confirm the cron is running at all rather than silently dead:**

```sql
select * from demo_cleanup_log order by created_at desc limit 10;
```

```sql
select ds.truck_id, ds.claimed_by_operator_id, ds.expires_at, ds.created_at,
       (now() > ds.expires_at) as past_retention,
       (ds.created_at < now() - interval '30 days') as past_claim_grace
from demo_sessions ds
order by ds.created_at desc;
```

---

## U3 — WHAT `/manage/<token>?import=demo` ACTUALLY RENDERS

Given LIVE-VERIFIED `plan = 'demo'`, `setup_step = 'menu'`, zero menu items.

### The tab that is selected: **`menu`**

`useState<Tab>('menu')` ([app/manage/[token]/page.tsx:136](app/manage/[token]/page.tsx#L136)). The
`?tab=` override needs a param that is not in the URL ([:270-272](app/manage/[token]/page.tsx#L270-L272));
the billing override needs `plan === 'trial'` ([:277](app/manage/[token]/page.tsx#L277)) and plan is
`'demo'`. **Your refutation of round-1 hypothesis 1 is accepted — nothing selects Schedule.**

### 🔴 Can `ScheduleTab`'s output appear anyway? — **NO**

`ScheduleTab` is the only always-mounted tab ([:484](app/manage/[token]/page.tsx#L484)), but its render is
gated internally. Its fragment has exactly **two** top-level children:

```tsx
return (
  <>
  {isActive && (
  <div className="space-y-4">
    …the entire Schedule UI…
```
— [app/manage/[token]/page.tsx:6399-6402](app/manage/[token]/page.tsx#L6399-L6402), closing at [:6786](app/manage/[token]/page.tsx#L6786)

```tsx
  {showImportModal && (   // :6788 … :6847
```

`showImportModal` starts `false` and is only set by the "✨ Import schedule" button, which lives **inside**
the `isActive` block. So with `activeTab === 'menu'`, **`ScheduleTab` renders nothing visible at all.**

Its *effects* still run — `loadEvents()` and `get_vans` are both guarded on `isActive`
([:5262-5263 region](app/manage/[token]/page.tsx#L5262)) — so it does not even fetch.

**"Schedule content was visible while Menu was selected" is ruled out by the code.** If Schedule was seen,
the tab was selected — by a click, or by a `?tab=schedule` URL I have not found.

### What the page looks like in that state

`MenuTab` root, [app/manage/[token]/page.tsx:2947](app/manage/[token]/page.tsx#L2947):

1. **Header** — `<h2>Menu</h2>` and the count line, which reads **"0 categories · 0 items"** ([:2954-2956](app/manage/[token]/page.tsx#L2954-L2956))
2. **Actions** — "✨ Import menu" + sub-label "photo, PDF or text", and "+ Add category" ([:2959-2969](app/manage/[token]/page.tsx#L2959-L2969))
3. **Empty state** — `categories.length === 0` ([:2974](app/manage/[token]/page.tsx#L2974)):
   - ✨ at `text-5xl`
   - **"Build your menu in seconds"**
   - *"Take a photo of your menu board, screenshot your existing menu, or drag in a PDF — our AI will extract everything and build your digital menu automatically."*
   - *"Works with photos, screenshots, PDFs and plain text…"*
   - a button that sets `importStep('upload')`
4. **The red toast** — *"Your demo menu is no longer available — please upload it again to carry on."*, because the sample extraction is reported as `no_extraction` (round 1 T3)

`importStep` initialises to `'idle'` ([:1629](app/manage/[token]/page.tsx#L1629)) and the bootstrap's
`setImportStep('review')` is never reached, because it sits after the early `return` on
`!data.extraction` ([:2192-2201](app/manage/[token]/page.tsx#L2192-L2201)). **So the import wizard does
not open** — the operator gets the generic empty state plus an error toast contradicting it.

**Net: a Menu tab reading "0 categories · 0 items", a generic "Build your menu in seconds" empty state,
and a red toast saying the demo menu is gone.** No schedule content anywhere.

⚠️ **To distinguish your two readings I need one thing I cannot get from the repo:** whether the URL at
the time carried `?tab=schedule`. Browser history for that session would settle it. Nothing in the code
adds that param.

---

## U4 — IS THERE AN "ACCOUNT IS READY" OPERATOR EMAIL?

**No. For a self-serve operator the only account-creation email is the verification one.**

Every distinct subject line in the repo:

| Subject | file:line | Audience | Account-created-and-ready? |
|---|---|---|---|
| `'Confirm your email address'` | [app/api/signup/route.ts:155](app/api/signup/route.ts#L155) | **self-serve operator** | ❌ asks them to act; says nothing about the account being ready |
| `'Your HatchGrab dashboard is ready 🚚'` | [app/api/admin/create-operator/route.ts:151](app/api/admin/create-operator/route.ts#L151) | operator created **by an admin** | ✅ but **unreachable from self-serve signup** |
| `'Reset your HatchGrab password'` | [app/api/auth/forgot-password/route.ts](app/api/auth/forgot-password/route.ts#L76) | operator | ❌ |
| `'Verify your new HatchGrab email address'` | [app/api/auth/change-email/route.ts](app/api/auth/change-email/route.ts#L69) | operator | ❌ email-change flow |
| `'Your HatchGrab demo — here's your link back'` | [app/api/demo/save-email/route.ts](app/api/demo/save-email/route.ts#L77) | demo visitor | ❌ pre-account |
| `'🛠 Menu build requested (demo)'` | [app/api/demo/build-request/route.ts](app/api/demo/build-request/route.ts#L58) | **internal** | ❌ |
| `` `You've been invited to join ${truck.name} on HatchGrab` `` | [app/api/manage/route.ts:1208](app/api/manage/route.ts#L1208) | staff invitee | ❌ not the owner |
| `` `New events found for ${truck.name} — please review` `` | scraper | operator | ❌ |
| order/cancellation subjects (5) | orders paths | customer / truck | ❌ |

⚠️ **The asymmetry is the finding.** An admin-created operator receives *"Your HatchGrab dashboard is
ready 🚚"* with a getting-started list ([app/api/admin/create-operator/route.ts:130-134](app/api/admin/create-operator/route.ts#L130-L134)).
A **self-serve** operator — who did strictly more work — receives only *"Confirm your email address"*,
whose body explicitly de-emphasises itself: *"You can carry on setting up in the meantime — you'll only
need this done before you go live."* ([app/api/signup/route.ts:160-161](app/api/signup/route.ts#L160-L161)).

**So S6 is confirmed as a real gap, distinct from the delivery question round 1 raised.** Even if Brevo
delivered perfectly, no email tells a self-serve operator their account exists and is ready. The only
"you're set up" confirmation in the entire self-serve flow is the in-modal beat
([DemoGetStarted:862](components/DemoGetStarted.tsx#L862)), which is on-screen only and gone on navigation.

---

## Consolidated: what each symptom now maps to

| Symptom | Cause | Confidence |
|---|---|---|
| **S1** wizard appeared after verifying | `verify-signup` redirects **every** branch to `/setup` ([verify-signup:23](app/api/auth/verify-signup/route.ts#L23)), which renders a truck-name form unconditionally with no already-has-a-truck guard | **Established** — code + your timings |
| **S2** pre-orders already on | `preorders_enabled` never written by provisioning; DB default `true` (round 1 T2) | **Established** |
| **S3** landed on Schedule | **Unresolved.** Default is `menu`; `ScheduleTab` renders nothing when inactive; no code sets `schedule`. Needs the URL from that session | **Open** |
| **S4** red banner repeatedly | `no_extraction` for a template (round 1 T3) × per-mount guard + persistent `?import=demo` + **a second full navigation via `/setup`** (U1e) | **Established** |
| **S5** no confirmation seen | The beat renders only in the modal and is lost on navigation; `/setup` and `/manage` show none | **Established** |
| **S6** no email | No account-ready email exists for self-serve (U4); separately, three console-only delivery failure modes (round 1 T6) | **Established** |

---

## SQL I still need, one query per block

**Did the verification email actually get attempted?** (round 1 T6 delivery question, still open)

```sql
select v.id, v.email, v.created_at, v.expires_at, v.verified_at
from operator_email_verifications v
order by v.created_at desc limit 5;
```

**Did `/setup`'s discarded name path leave any trace — i.e. is the truck named what they typed in the modal, or what they typed at `/setup`?**

```sql
select id, name, slug, plan, setup_step, contact_email, cuisine_type, truck_emoji, created_at
from trucks where id = 'test-truck-3-2';
```

**Was `update_settings` (best-effort step d) applied, or did it fail silently?**

```sql
select id, cuisine_type, truck_emoji, contact_phone, whatsapp, phone_is_whatsapp, logo_storage_path
from trucks where id = 'test-truck-3-2';
```

**Is the demo-cleanup cron running at all?**

```sql
select * from demo_cleanup_log order by created_at desc limit 10;
```

**Which demo sessions are eligible for the claimed-but-abandoned sweep?**

```sql
select ds.truck_id, ds.claimed_by_operator_id, ds.expires_at, ds.created_at,
       (now() > ds.expires_at) as past_retention,
       (ds.created_at < now() - interval '30 days') as past_claim_grace
from demo_sessions ds
order by ds.created_at desc;
```
