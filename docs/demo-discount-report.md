# Slices G and J — demo dashboard, and discount capture

**Date:** 4 August 2026
**SQL run:** none. **Migration file created:** none — the J1 statement is below, for you to run by hand.
**`next dev` / `next build`:** not run.

No garbled spans in the brief. One 🔴 check fired and is reported in full under G3.

---

## G1. THE ORDER LINK ALONGSIDE THE QR CODE

[components/dashboard/DemoWelcome.tsx](components/dashboard/DemoWelcome.tsx).

### The layout

```
NARROW (< 640px)                    sm: AND WIDER
┌──────────────────────────┐        ┌───────────────────────────────────────┐
│ Or open it on this device│        │ ┌────────┐  ┌──────────────────────┐  │
│ ┌──────────────────────┐ │        │ │        │  │ Or open it on this   │  │
│ │ hatchgrab.com/…/order│ │  ← tap │ │   QR   │  │ device               │  │
│ └──────────────────────┘ │        │ │ 160px  │  │ ┌──────────────────┐ │  │
│ ┌──────────────────────┐ │        │ │        │  │ │ …/order   ← tap  │ │  │
│ │      Copy link       │ │        │ └────────┘  │ └──────────────────┘ │  │
│ └──────────────────────┘ │        │             │ │   Copy link      │ │  │
├──────────────────────────┤        │             │ └──────────────────┘ │  │
│         ┌────────┐       │        │             └──────────────────────┘  │
│         │   QR   │       │        └───────────────────────────────────────┘
│         │ 160px  │       │
│         └────────┘       │
└──────────────────────────┘
```

One flex container: `flex flex-col-reverse sm:flex-row sm:items-center gap-4`.

**Why `flex-col-reverse` and not `flex-col`.** The narrow screen *is* the phone case — the exact visitor
who cannot scan a code displayed on the device they are holding. Putting the link **above** the QR there
is what makes "visible without scrolling" true for the person who needs it, rather than for the person
who does not. DOM order stays QR-then-link, so the reversal is purely visual and tab order still reads
left-to-right on desktop.

**Same visual weight:** the link block is `flex-1` beside the QR's fixed `w-40 h-40`, so it is the wider
of the two columns, in a filled orange-50 panel with its own heading and a full-width solid orange
button. It is not a caption under the QR.

**Tappable:** the URL itself is an `<a href={orderUrl} target="_blank" rel="noopener noreferrer">`. New
tab, deliberately — a same-tab navigation would lose the demo board they are mid-orientation on.
`break-all` rather than `truncate`, because a clipped URL cannot be read off the screen onto another
device.

**Copyable:** the existing `copy()` handler and its "Copied" state are reused unchanged, now as a
full-width `Copy link` button rather than a squeezed side button.

### 🔴 The QR is untouched

Same `w-40 h-40`, same `generateQRWithLogo(orderUrl, null, 320, 'Your logo here')`, same pulsing
placeholder while it generates, same `qrFailed` handling. Nothing was removed or shrunk to make room —
the card gained a column. When the QR fails or is still generating, the link block is unaffected and
stands alone.

### Two consequential edits, both inside G1's scope

1. **The second bullet** said *"Scan the **QR code** with your phone and order as a customer"*. Left
   alone it would instruct half the visitors to do the one thing their device cannot do, with the thing
   it can do sitting unmentioned beside it. Now: *"Scan the **QR code** — or tap the link — and order as
   a customer, then watch it land"*.
2. **The file header** recorded the earlier decision to *remove* the copy-link box ("copying a URL and
   retyping it into a phone mid-demo is friction nobody actually goes through") and stated the box
   "survives ONLY as a fallback". That is now false, so the note is marked superseded with the reason:
   the old reasoning was right about *copying* and wrong about the *link*, because it assumed a laptop.

The `!showQr` fallback branch is gone as a concept — the link is no longer conditional on the QR being
absent. The genuinely-no-URL case (no slug) keeps its existing note: *"Your ordering page link is in the
menu, top right."*

### Gusto and RTF

**Unaffected, structurally.** `DemoWelcome` is mounted behind `isDemo &&` at
[app/dashboard/[token]/page.tsx:2313](app/dashboard/[token]/page.tsx#L2313), where
`isDemo = token.startsWith('demo-')`. Per R2c that prefix is on a demo truck's id, slug **and**
dashboard_token together, with `assertReservedPrefix()` guaranteeing no operator truck can carry it —
`lib/demo.ts` calls it *"load-bearing security, not a naming convention"*. The component cannot render
for them, and it is on the operator dashboard, not any customer surface. That gate was not touched.

---

## G2. THE SAME ON THE DEMO ORDER PAGE — REPORT ONLY, NOTHING BUILT

**My answer: it does not belong there, and G1 fully covers the need.** Three reasons, in order of
weight:

1. **The audience is already there.** The order page IS the order link resolved. Anyone looking at it
   has, by definition, already reached the customer ordering page — by scanning, by tapping, or by
   typing. Offering them a link to where they are standing solves nothing.
2. **It would be aimed at the wrong person.** That page is a **customer** surface. Its demo affordance —
   the sticky DEMO MODE banner in `<Hdr>` — exists to stop a real customer mistaking a sample for a real
   truck. A "copy this link" control there addresses the *operator*, on a page the operator is only
   visiting as a customer, and would read as an instruction to whoever else opens it.
3. **The problem G1 solves does not exist there.** G1's problem is specific: a QR is unscannable on the
   device displaying it. There is no QR on the order page, so there is nothing to route around.

Where a demo-only addition on that page *would* be justified is the opposite direction — a way **back**
to the dashboard, for a visitor who tapped the link, ordered, and now wants to see it land on the board.
That is the loop G1's bullet promises ("then watch it land"), and it is the only end of it that is
currently one-way. I have not built it, and it is a different item from G2 as written. Your call.

If you do decide something belongs there, R2c's finding still holds: `isDemoIdentifier(slug)` is already
computed inside `Hdr` ([app/trucks/[slug]/order/page.tsx:2555](app/trucks/[slug]/order/page.tsx#L2555)),
and `Hdr` is the one component every state of the page goes through — *"one insertion covers all five and
a future sixth can't miss it"*. No new column, no new fetch, no new prop; Gusto's slug has no `demo-`
prefix so the branch is dead code for them.

---

## G3. BUZZER DEFAULTS FOR DEMO TRUCKS

### 🔴 The ordering check fired. Here is the finding.

**`buzzer_count` belongs on `ProvisionProfile`. `buzzer_prompt` does not, and cannot.**

`provisionTruck` writes exactly two tables — `trucks` ([lib/provision-truck.ts:284](lib/provision-truck.ts#L284))
and `truck_vans` ([:346](lib/provision-truck.ts#L346)). It **creates no `truck_events` row**. So:

* **The van exists** at provision time. `buzzer_count` is a per-van column on a row this function
  inserts → it goes on the profile, exactly as `preordersEnabled` did.
* **The event does not exist** at provision time. A demo's event is created later, by a different
  module — `provisionDemoEvent` ([lib/provision-demo-event.ts:131](lib/provision-demo-event.ts#L131)),
  invoked from `provisionDemo` after the menu is committed (*"ORDERING MATTERS: menu BEFORE event"*).
  There is no row for `buzzer_prompt` to live on when the profile is read.

So `buzzer_prompt` is set **on the insert that brings the event row into existence**, in
`provisionDemoEvent`. That is not restructuring provisioning: it is one field added to an insert that
already exists, in a module only demo trucks reach.

### 🔴 And this is why building only half would have been worse than building nothing

`resolveBuzzerPrompt` ([lib/buzzer.ts:83-90](lib/buzzer.ts#L83-L90)) resolves the prompt as:

```
if (van.buzzer_count == null) → { buzzerCount: null, buzzerPrompt: false }
else                          → { buzzerCount,       buzzerPrompt: event.buzzer_prompt ?? true }
```

**A NULL prompt means ON whenever a pool exists.** Today demos have `buzzer_count: null`, so the
short-circuit keeps the prompt off for free. Setting the pool to 10 and stopping there would have
flipped `buzzerPrompt` to **true** for every demo — every test order stopping to demand a buzzer number,
which is precisely the interruption G3 exists to prevent. The two halves are one change; that is why
both were built, and why each carries a comment pointing at the other.

### What was written

| | Value | Where |
|---|---|---|
| **demo** `truck_vans.buzzer_count` | **10** | `PROVISION_PROFILES.demo.buzzerCount` → the van insert |
| **demo** `truck_events.buzzer_prompt` | **`false`, explicitly** | `provisionDemoEvent`'s insert |
| **operator** `truck_vans.buzzer_count` | **`null` — unchanged** | `PROVISION_PROFILES.operator.buzzerCount` |
| **operator** `truck_events.buzzer_prompt` | **untouched** | no operator event path was opened |

`buzzerCount: number | null` is **required** on `ProvisionProfile`, not optional, so the compiler forces
every profile to state its answer — matching the `preordersEnabled` precedent whose comment explains why
(*"this column was previously written by nobody and a new truck simply inherited the DB default"*).

10 is `BUZZER_DEFAULT_COUNT` — the same number Manage offers an operator when they first switch buzzers
on, so the demo shows what a normal truck looks like rather than a special case.

`buzzer_prompt: false` is written **explicitly, never omitted**: the column is nullable, and omission
resolves to ON.

### Two honest limitations

* **No backfill.** A demo truck provisioned before this deploy keeps `buzzer_count: null`, because the
  returning-visitor branch of `provisionDemo` reuses the existing van rather than re-provisioning
  ([lib/provision-demo.ts:107-110](lib/provision-demo.ts#L107-L110)). Those demos keep today's behaviour
  — feature hidden, no prompt — which is coherent, not broken. New demos get the rack. No migration was
  written, per the brief.
* **`demo-restart.ts`** creates a fresh event through the same `provisionDemoEvent`, so a returning
  visitor's new event gets `buzzer_prompt: false` too. On an old (null-pool) truck that is simply
  redundant, never contradictory.

### Gusto and RTF

**Unaffected on both halves.**

* `provisionTruck` is called for them only with `kind: 'operator'`, whose profile is `buzzerCount: null`.
  The van insert now writes that explicitly, and the column is **nullable with no default**, so an
  explicit `null` is byte-identical to the omission it replaces.
* Provisioning does not re-run for an existing truck at all, so their vans are not rewritten either way.
* `provisionDemoEvent` has exactly two callers — `lib/provision-demo.ts` and `lib/demo-restart.ts`,
  both demo-only. Verified by grep. The two **live** event-insert paths —
  `app/api/manage/route.ts:687` (upsert_event) and `app/api/inbound-schedule/route.ts:211` — were not
  opened and do not send `buzzer_prompt`.
* Their existing buzzer settings, wherever they have any, are untouched: nothing here writes to an
  existing row.

---

## J0. THE NAME

### The three concepts, and why they cannot be confused

| | Table | Column | Type | What it is |
|---|---|---|---|---|
| existing | `discount_codes_db` | `code` | text | **Customer order** discount, per truck, redeemed at checkout. Live. |
| existing | `trucks` | `lifetime_discount_pct` / `_note` | int / text | **Subscription** discount, admin-set, for pre-launch testers. |
| **new** | `operators` | **`signup_promo_code`** | text null | The string an operator typed at signup. Recorded only. |

### 🔴 Confirmed distinct, on three independent axes

1. **Different table.** Neither existing concept lives on `operators`. `discount_codes_db` is
   truck-keyed and customer-facing; `lifetime_discount_*` is on `trucks`. A reader in `\d operators`
   cannot reach either of the others from here.
2. **Different vocabulary.** I picked **`promo`** precisely because it appears **nowhere else in the
   schema or the codebase** — my R6 sweep for `promo|coupon|referral|voucher` returned zero hits outside
   the two systems above. So the token itself is unambiguous by construction.
3. **Different grammar.** `signup_` pins *when* it is captured — before any truck exists — which no
   other discount field can claim.

**Names rejected, and why:**

* `signup_discount_code` — shares the token "discount" with **both** existing systems, which is the one
  thing J0 asks the name to avoid.
* `signup_code` — reads too easily as a *verification* code, and `operator_email_verifications.token`
  already occupies that idea one join away.
* anything on `trucks` — wrong grain; see J1.

---

## J1. THE COLUMN

**On `operators`, not `trucks`**, as specified: an operator may run several trucks on one deal, and the
trial is operator-level. It is also the only row that exists at the moment the code is typed —
`/api/signup` deliberately creates no truck.

**ADDITIVE.** Nullable, no default, no constraint, no index, no backfill. Nothing existing reads or
writes the column, so running it changes no behaviour on its own and it can be run before or after the
deploy in either order. It is **not** deploy-coupled.

Run this by hand:

```sql
alter table operators
  add column if not exists signup_promo_code text;

comment on column operators.signup_promo_code is
  'Nullable. Marketing/promo code the operator typed at self-serve signup, captured by /api/signup before any truck exists. RECORDED ONLY - nothing in the product validates, applies or enforces it; deals are honoured by hand. NOT related to discount_codes_db (customer order discounts, per truck) or trucks.lifetime_discount_pct (subscription discount, admin-set).';
```

### 🔴 How the code tolerates the column being absent

It will be, on preview, until you run the above. Both paths are built for that:

**The WRITE — a separate, best-effort UPDATE, never a field on the insert.**
[app/api/signup/route.ts](app/api/signup/route.ts). PostgREST rejects an insert naming an unknown column
with **PGRST204 and fails the whole statement**. Had `signup_promo_code` gone into the existing
`operators` insert, every signup would have failed its operators row, fired the compensating
`deleteUser`, and returned *"Could not finish creating your account"* — **a marketing field would have
taken signup down**. Instead:

```ts
if (signupPromoCode) {
  const { error: codeErr } = await supabase
    .from('operators').update({ signup_promo_code: signupPromoCode }).eq('id', operator.id)
  if (codeErr) console.error(`[signup] promo code "…" NOT recorded for operator … (${codeErr.message})`)
}
```

The account is already created and committed by this point. A failure logs a named, greppable line and
signup completes exactly as if no code had been typed. When the migration lands, the same code starts
working with no redeploy.

**The READ — its own statement, error swallowed.**
[app/api/admin/route.ts](app/api/admin/route.ts). A named select over a missing column fails the whole
statement with **42703**, so folding `signup_promo_code` into the existing `trucks` query would have
blanked the *entire admin console* on preview. It is a separate query whose error is caught and logged;
`operators` comes back `[]` and the admin page renders exactly as it does today, minus the codes.

The client is equally tolerant: `data.operators ?? []` handles an older API build too.

---

## J2. CAPTURE AT SIGNUP

Added to **both** surfaces, with identical copy and identical (absent) rules:

| Surface | File | Position |
|---|---|---|
| `/signup` | [app/signup/page.tsx](app/signup/page.tsx) | last field, below password, above the marketing tick |
| demo modal wizard | [components/DemoGetStarted.tsx](components/DemoGetStarted.tsx) | details step, below password, above the terms tick |

**Copy:** label `Have a code? (optional)`, placeholder `Enter it here`.

### The three rules, and how each is enforced by absence rather than by a check

* **Optional, never blocks.** No `required` attribute, no entry in `fieldErrors`, and nothing added to
  `validateDetailsStep()` or to `/signup`'s submit path. There is no code path in which a promo code can
  fail.
* **Unrecognised codes are accepted and recorded.** There is no list, no lookup, no regex, and no error
  state anywhere — client or server. `/api/signup` trims, caps the length, and records it. A code that
  means nothing is stored exactly like one that means something.
* **No confirmation of any benefit.** Nothing is echoed back, no summary is rendered, no tick appears,
  and the response body is unchanged. Nothing in the product applies the code — it is recorded for
  tracking and honoured by hand — so any acknowledgement here would be a claim the software cannot keep.
  Both field comments say this in the code so a future edit has to argue with it.

**Storage:** `String(body.signup_code ?? '').trim().slice(0, 40) || null`. Trimmed at both ends;
otherwise stored **exactly as typed**, case preserved, no normalisation. Empty becomes `null`, not `''`.

**Max length: 40 characters**, enforced client-side with `maxLength={40}` and again server-side with
`.slice(0, 40)`. It is a bound on abuse — the column is `text` — not a format rule; no real code is near
it.

One small consistency touch: in the modal, Enter in the code field submits, matching the password field
beside it. A code field that swallowed Enter would be a trap on the last step of a signup.

### Gusto and RTF

**Unaffected.** `/signup` and `DemoGetStarted` are account-creation surfaces they are long past;
`/api/signup` creates auth users and operator rows and is never called for an existing operator. Their
`operators` rows are not written by anything here.

---

## J3. VISIBLE IN ADMIN

`/api/admin` now returns an `operators: [{ id, signup_promo_code }]` array alongside `trucks` (its own
statement — see J1). The admin page maps it to `Record<operator_id, code>` and renders a **read-only**
chip on the operator's row, beside the name:

> 🎟 `AUTUMN25`  — indigo, `title="Code entered at signup — recorded only, not applied"`

**Read-only, as specified.** No input, no PATCH, no entry in the update path — `/api/admin`'s POST still
only writes `trucks` and `discovery_trucks`, and was not touched.

A deliberately different colour from the 💚 lifetime-discount chip next to it, so the two are not read as
one badge: that one is a subscription percentage you set, this one is a marketing string the operator
typed. Keyed on `operator_id`, so every truck belonging to one operator shows the same code without it
being duplicated per row.

Empty until the migration runs — no error, no gap, just no chips.

---

## J4. THE DO-NOT LIST

| Instruction | Status |
|---|---|
| Do not apply, calculate or enforce any discount | **Nothing reads the column.** Its only reader is a read-only admin chip. |
| Do not touch `plan`, `trial_expires_at`, `lifetime_discount_pct`, `lifetime_discount_note` | **Untouched.** None appears in the diff. |
| Do not build a codes table or validation list | **None built.** One nullable text column, no lookups. |
| Do not touch `discount_codes_db` | **Untouched.** Not opened, not queried, not in the diff. |

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT: 0
```

Lint, every touched file against its own baseline:

| File | Baseline (HEAD) | Now |
|---|---|---|
| `components/dashboard/DemoWelcome.tsx` | 0 | **0** |
| `lib/provision-truck.ts` | 0 | **0** |
| `lib/provision-demo-event.ts` | 0 | **0** |
| `app/api/signup/route.ts` | 0 | **0** |
| `app/signup/page.tsx` | 0 | **0** |
| `components/DemoGetStarted.tsx` | 0 | **0** |
| `app/api/admin/route.ts` | 3 (1 error, 2 warnings) | **3 (1 error, 2 warnings)** |
| `app/admin/page.tsx` | 10 (8 errors, 2 warnings) | **10 (8 errors, 2 warnings)** |

The two non-zero baselines were established by restoring each file from `HEAD`, linting, and restoring
my version — not assumed.

### Files touched

| File | Reason |
|---|---|
| [components/dashboard/DemoWelcome.tsx](components/dashboard/DemoWelcome.tsx) | G1 — the order link as a peer of the QR, the bullet naming both routes, the superseded header note. |
| [lib/provision-truck.ts](lib/provision-truck.ts) | G3 — `buzzerCount` on `ProvisionProfile` (demo 10, operator null) and written on the van insert. |
| [lib/provision-demo-event.ts](lib/provision-demo-event.ts) | G3 — `buzzer_prompt: false` on the demo event insert, the only row that can carry it. |
| [app/api/signup/route.ts](app/api/signup/route.ts) | J2 — reads, trims and caps `signup_code`; records it as a separate best-effort update. |
| [app/signup/page.tsx](app/signup/page.tsx) | J2 — the optional code field and sending it. |
| [components/DemoGetStarted.tsx](components/DemoGetStarted.tsx) | J2 — the same field in the modal wizard, and sending it. |
| [app/api/admin/route.ts](app/api/admin/route.ts) | J3 — returns `operators: [{ id, signup_promo_code }]` as a separate tolerant query. |
| [app/admin/page.tsx](app/admin/page.tsx) | J3 — the read-only 🎟 chip on the operator's row. |

No migration file was created. No SQL was run. `app/api/setup/route.ts`, `app/manage/[token]/page.tsx`
and `lib/kitchen-capacity.ts` also appear in `git status` — those are the **previous slice (I)**, still
uncommitted, and are not part of this work.

### Gusto and RTF, at a glance

| Item | Effect |
|---|---|
| G1 order link | **Unaffected** — `DemoWelcome` is `isDemo`-gated on a `demo-` prefix an operator truck cannot carry, on the operator dashboard, not a customer surface. |
| G2 | **Nothing built.** |
| G3 buzzer defaults | **Unaffected** — the operator profile still says `null` (identical to the omission it replaces on a nullable, defaultless column), provisioning does not re-run for an existing truck, and `provisionDemoEvent` has only demo callers. The two live event-insert paths were not opened. |
| J1 column | **Unaffected** — additive, nullable, on `operators`; nothing reads or writes it for an existing operator. |
| J2 capture | **Unaffected** — signup surfaces only; `/api/signup` never runs for an existing operator. |
| J3 admin chip | **Unaffected** — read-only display in the admin console; no customer or operator path involved. |
