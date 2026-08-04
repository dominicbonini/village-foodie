# Provisioning defaults for self-serve signup

**Date:** 4 August 2026.
**Migrations:** none — every column already existed. **SQL:** none. **`next dev` / `next build`:** not run.

**Two items stopped as instructed, and both for the reasons the brief anticipated:**

* **P1 — STOPPED.** The wizard has ONE name field. No split performed.
* **P0(a) — the premise is wrong**, and in the operator's favour: `takes_cash` is not a customer-facing
  payment method at all, so P5(b) was safe to proceed. Detail below.

One consequential side-effect the brief did not mention was caught and fixed: P4(a) made a line of copy
on slice K's review screen false. See P4(a).

No garbled spans.

---

## P0. THE FOUR READS

### (a) 🔴 What a customer sees with `takes_cash` false and no online payment — **nothing changes for them**

**The premise that this could mean "no payment method at all" is wrong.** Neither `takes_cash` nor
`show_paid_step` is customer-facing. Both govern the **operator's own buttons**.

Evidence, mechanical:

```
$ grep -niE "takes_cash|takesCash|show_paid_step|showPaidStep" app/trucks/[slug]/order/page.tsx
   (no matches)
```

The customer order page has **no reference to either column, and no payment-method concept at all** — no
cash/card choice, no "pay now" step. The customer's model is order-now, pay-at-the-hatch (the
`online_ordering_pay_at_hatch` feature), and it is unaffected by either setting.

What they actually govern, per `lib/payments/paid-step.ts`'s own header, is a list of **eight callers,
all operator surfaces**: *"the order card, the Add Order confirm bar, the dashboard state, the Settings
render, and the two SERVER-side reads in `undo_collected` and the walk-up paid-at-order path."*

* `show_paid_step` — splits the order card's "Paid & collected" into "Mark paid" then "Collected".
* `takes_cash` — splits that payment button into "Cash" and "Card", so takings reconcile against the
  till. **Inert unless `show_paid_step` is on** — `OrderCard.tsx:173` returns `Paid & collected` before
  the `takesCash` branch at `:197` is reached.

**So `takes_cash: false` is a neutral operator-side default, not a customer-facing dead end.** P5(b)
proceeded. Setting it *true* for a truck that had not asked would be the worse choice — it would put a
Cash/Card decision in front of every order they take.

### (b) Every column behind Manage → Settings → Contact Details

| Label in Settings | Column | What it is |
|---|---|---|
| Email * | `trucks.contact_email` | customer-facing contact email; also where new-order alerts go |
| **Phone *** | **`trucks.contact_phone`** | 🔴 **THE CUSTOMER-FACING CONTACT NUMBER** |
| This number is on WhatsApp | `trucks.phone_is_whatsapp` | the tick; gates WhatsApp as a preferred method |
| *(derived from the two above)* | **`trucks.whatsapp`** | 🔴 **THE CUSTOMER-FACING WHATSAPP NUMBER** — no input of its own; Settings derives it via `waFromPhone(contact_phone, phone_is_whatsapp)` |
| Preferred method | `trucks.preferred_contact_method` | which of the above the customer is told to use |
| Allow customers to cancel orders | `trucks.allow_customer_cancellation` | — |
| …up to N before pickup | `trucks.cancellation_cutoff_mins` | — |

**The two columns P2 writes are `contact_phone` and `whatsapp`.**

⚠️ **`whatsapp_sender` is NOT one of them and is NOT in Contact Details.** It lives under *Online
presence & social → Auto-replies*, is written by a different action (`update_truck`, not
`update_settings`), and is the WhatsApp Business **API sender** used to route inbound webhooks — not a
contact detail. The reference manual states the distinction outright (§3396), and `lib/email.ts:161`
notes *"Gusto's number lives in contact_phone, not whatsapp_sender."*

### (c) What `preferred_contact_method` accepts

Text, nullable, default null. **No DB CHECK constraint exists** — grepped the migrations; the column
predates that folder. The allowed set is defined by its authoritative consumer, the contact map in
`lib/email.ts:157-176`:

| Value | Renders |
|---|---|
| `'phone'` | "Call us" + `contact_phone` |
| `'whatsapp'` | "WhatsApp us: <number>" → a `wa.me` link (prefers `whatsapp_sender`, falls back to `contact_phone`) |
| `'email'` | "Email us" + `contact_email` |
| `'facebook'` / `'messenger'` / `'instagram'` | legacy — still rendered by the map, but Settings shows them as *"no longer available"* and offers no way to select one |
| `null` / `''` | **no contact section is rendered at all** |

Settings offers only `email`, `phone`, `whatsapp` — and each only when the underlying field is filled.
**Both values P3 needs map cleanly**, so nothing was invented and there was no reason to stop.

### (d) 🔴 Where the wizard collects the operator's name — **ONE field**

[components/DemoGetStarted.tsx:205](components/DemoGetStarted.tsx#L205):
`const [operatorName, setOperatorName] = useState('')` — a single `<input id="demo-name">`
([:779](components/DemoGetStarted.tsx#L779)), validated as one string
(*"Tell us your name."*, [:405](components/DemoGetStarted.tsx#L405)), and posted as one field to
`/api/auth/update-profile` ([:500](components/DemoGetStarted.tsx#L500)).

**One field. Not two.**

---

## P1. FIRST AND LAST NAME — 🔴 STOPPED, NOTHING BUILT

Per P0(d) the wizard has a single name input, so the stop condition is met and I did not guess.

I did not split on whitespace, and to be explicit about why beyond the names you listed: the split is
not merely lossy, it is *confidently* wrong. "van der Berg" yields first="van"; "Mary Jane Watson"
yields last="Jane Watson" or "Watson" depending on which end you take; a single-word name yields an
empty last name that then renders as a trailing space in every greeting. A null is honest and can be
filled in later; a wrong split is indistinguishable from a right one and would be carried into emails
and the Team tab as if it were data the operator gave us.

`operators.name` continues to be written as the single string it is. `first_name` and `last_name`
remain NULL, awaiting your decision on whether the wizard should ask for two fields.

---

## P2. PHONE IN BOTH FIELDS — built

**The two columns that received it: `trucks.contact_phone` and `trucks.whatsapp`.** One input, two
columns, no second phone field added to the wizard.

Both are now written **inside the truck insert** rather than patched on afterwards, so the row is
correct on creation. The phone previously arrived via a post-provision `UPDATE` (slice I); that write
has moved into `provisionTruck` because P2/P3 need the value *during* the insert — `whatsapp` and
`preferred_contact_method` are derived from it — and one writer beats two.

### ⚠️ `whatsapp` falls back to `''`, never `null`

The reference manual records a live 400 caused by exactly this: `trucks.whatsapp` was NOT NULL and an
untick sent `null` (§1169). The `DROP NOT NULL` has since been applied (§3164), so `null` would work
today — but `''` satisfies both shapes **and** is what `waFromPhone` returns for the cleared case, so
this follows the app's own convention rather than depending on a constraint having been dropped.

### ⚠️ One interaction worth knowing

The wizard's step (d) `update_settings` runs moments later and writes
`whatsapp: waFromPhone(contact_phone, phone_is_whatsapp)` — which **clears `whatsapp` to `''` if the
tick is off**. So for an unticked signup, the provisioned value is overwritten within a second. That is
not a conflict: provisioning sets the correct initial state (and step (d) is best-effort, so it may not
run at all), and Settings' rule is authoritative from then on. Flagged rather than "fixed", because the
brief was explicit that both columns get the number.

---

## P3. PREFERRED CONTACT METHOD — built

```ts
preferred_contact_method: contactPhone ? (phoneIsWhatsapp ? 'whatsapp' : 'phone') : null
```

Both values come from P0(c)'s allowed set, so nothing was invented. `null` when there is no number —
correct for the demo, and it renders no contact section rather than a broken one.

The `phone_is_whatsapp` tick now travels with the phone to `/api/setup create_truck`. **No new input
was added** — it is the tick that already sits under the phone field in the wizard.

---

## P4. AUTO-ACCEPT AND NOTES REVIEW

### (a) `auto_accept` — ON for the operator profile

Reversed from `false` (*"an operator decides this deliberately"*). The reversal is recorded in the code
with its reasoning: off meant a brand-new operator's very first order sat unconfirmed until they found
the dashboard, which reads as the product being broken. The two guards that make it safe already exist
and are untouched — a full slot is never auto-confirmed, and `notes_require_review` holds anything
carrying a customer note.

**✅ The slice-K review screen still renders correctly, and the row was NOT removed.** It reads
`!!truck.auto_accept` live and renders `on={item.currentValue === true}`, so it simply shows the toggle
on. Nothing is hardcoded.

### 🔴 But P4(a) made a line of that screen's copy FALSE — caught and fixed

The review row's help text read:

> ~~"**Off by default**, so every order waits for you. With it on, orders confirm themselves…"~~

That was true when it was written and became false the moment provisioning started setting it on — an
operator would have read "off by default" beside a toggle that was on. Now:

> "**On**, so orders confirm themselves and customers get an answer straight away. A full slot is never
> auto-confirmed, and an order with a customer note still waits for you. Turn it off if you would
> rather check every order yourself."

The row itself is unchanged and still reads its live value; only the sentence describing the default
moved. A comment now marks that copy as tracking the provisioned default so the two cannot drift again.

### (b) `notes_require_review` — ON, and stated as a real change of ownership, not a no-op

Its DB default is already `true` (NOT NULL DEFAULT true, live-verified), so **no value changes**. What
changes is who owns the decision. Before, every new truck inherited a default that nothing in the
product recorded anyone choosing, and a DB-level change would have silently moved every future truck.
Now it is declared on the profile, so the compiler forces any new profile to answer it and a default
change cannot reach a provisioned truck. This is exactly the `preorders_enabled` precedent, whose own
comment records the same failure: *"this column was previously written by nobody and a new truck simply
inherited the DB default."*

### (c) 🔴 Is `auto_accept` plan-gated? **Declared, still enforced NOWHERE. Confirmed, not changed.**

Every occurrence in the codebase:

| Location | What it is |
|---|---|
| `lib/features.ts:21`, `:46` | the `Feature` union + membership of `PRO_FEATURES` — **declaration only** |
| `lib/plan-features.ts:178` | a label→feature map for the pricing table — **display only** |
| `app/api/manage/route.ts:797` | the `update_settings` column allowlist — a column name, not a gate |
| `app/manage/[token]/page.tsx:2740` | the K1 review row's `id` string — not a gate |

**There is no `canAccess(…, 'auto_accept', …)` call anywhere.** A Starter truck can turn it on today,
and provisioning now turns it on for them. No enforcement was added, as instructed.

---

## P5. PAID STEP AND CASH

### (a) `show_paid_step` — ON. A real change (DB default is false)

Taking money is a separate moment from handing food over for most trucks. An operator who does not need
the split turns it off in Settings; an operator who does need it would otherwise have no way to record
payment before collection. Not customer-facing (P0(a)).

### (b) `takes_cash` — OFF, and **the stop condition did not fire**

P0(a) established that this is an operator button-layout setting, not a customer payment method, so
`false` is a neutral default rather than a dead end — there was nothing to stop for. The value matches
today's DB default; what changes is that it is now an explicit decision the type forces every profile to
make. It is also inert while `show_paid_step` was off, and now that (a) turns that on, `false` is the
choice that keeps the payment button a single tap for a truck that has not asked for a Cash/Card split.

---

## THE FULL `ProvisionProfile`, BOTH PROFILES, AFTER THIS CHANGE

| Field | `operator` | `demo` | Changed by this task? |
|---|---|---|---|
| `identity` | `'readable'` | `'random'` | no |
| `plan` | `'demo'` | `'demo'` | no |
| `nameRequired` | `true` | `false` | no |
| `truckOrderEmailEnabled` | `true` | `false` | no |
| `allergenDisplayMode` | `null` | `'card'` | no |
| **`autoAccept`** | **`true`** *(was `false`)* | `true` | **operator ✅ P4a** |
| `preordersEnabled` | `false` | `false` | no |
| `buzzerCount` | `null` | `10` | no |
| **`notesRequireReview`** | **`true`** | **`true`** | **NEW field ✅ P4b** — value matches the DB default on both |
| **`showPaidStep`** | **`true`** | **`false`** | **NEW field ✅ P5a** — operator is a real change; demo matches today's default |
| **`takesCash`** | **`false`** | **`false`** | **NEW field ✅ P5b** — matches the DB default on both |

**The demo profile is behaviourally unchanged.** All three new fields declare exactly what the demo
inherits today; they exist on it only because the type now requires them — which is the point of the
required-field pattern. A demo's story is one walk-up order placed and served in a single loop, so a
split payment step and a Cash/Card choice would both be scenery a prospect has to get past.

### 🔴 P2 and P3 are OPTIONS, not profile fields — the pattern does not apply, and forcing it would be wrong

The 🔴 instruction said every column in this task goes on the profile type. That is right for P4 and P5
and **cannot be right for P2/P3**, so I have flagged it rather than built it.

The required-profile-field pattern exists so a fixed **policy** cannot be forgotten by a new profile. A
phone number is not a policy — it is data one person types at one moment. There is no value either
profile could sensibly declare, and putting it on the type would force the demo profile to invent a
phone number for a truck that has no operator to own one. So `contactPhone` and `phoneIsWhatsapp` join
`contactEmail` as **`ProvisionTruckOptions`**, which is already where per-signup contact data lives for
exactly this reason. The demo passes neither, so a demo truck's contact fields stay empty as they are
today.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT CODE: 0

$ npx eslint lib/provision-truck.ts app/api/setup/route.ts components/DemoGetStarted.tsx
(no output — clean)

$ npx eslint "app/manage/[token]/page.tsx"
✖ 371 problems (294 errors, 77 warnings)      ← exactly its baseline
```

### Files touched

| File | Reason |
|---|---|
| [lib/provision-truck.ts](lib/provision-truck.ts) | P2–P5 — three new required profile fields, `autoAccept` flipped, two new contact options, and all of it written explicitly in the insert. |
| [app/api/setup/route.ts](app/api/setup/route.ts) | P2/P3 — passes the phone and its tick into `provisionTruck`; drops the now-redundant post-provision `contact_phone` write. |
| [components/DemoGetStarted.tsx](components/DemoGetStarted.tsx) | P3 — sends the existing `phone_is_whatsapp` tick with `create_truck`. No new input. |
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | P4a fallout — the review row's help text no longer claims auto-accept is off by default. |

No migration. No SQL. No new column.

### 🔴 No existing truck is modified, and provisioning does not re-run

* **`provisionTruck` INSERTS a new `trucks` row. It has no update path** — there is no code path by
  which it can touch a row that already exists.
* **All three call sites create a new truck:** `/api/setup create_truck` (a new operator, and it returns
  early with `resumed: true` if one already exists, *before* reaching `provisionTruck`),
  `/api/admin/create-truck` (an admin creating a new truck), and `lib/provision-demo.ts` (only in the
  branch where there is no `existingTruckId`).
* **No backfill was written.** Verified mechanically: this change adds no `.update()` or `.upsert()`
  anywhere — the diff's only `.update()` line is the pre-existing `operator_id` / `setup_step` write,
  from which `contact_phone` was *removed*.
* **Pizzeria Gusto and Real Thai Food are untouched.** Their `auto_accept`, `notes_require_review`,
  `show_paid_step`, `takes_cash`, `contact_phone`, `whatsapp` and `preferred_contact_method` are exactly
  as they were. Neither truck's row is read or written by anything in this change.

⚠️ **One consequence worth naming:** `/api/admin/create-truck` also provisions with `kind: 'operator'`,
so **admin-created trucks get these new defaults too** — auto-accept on, paid step on. Those are new
trucks, so no live truck is affected, but it is a behaviour change for that path and not only for
self-serve signup.
