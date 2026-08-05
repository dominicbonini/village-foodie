# The name split, two shared-code fixes, and two report-only findings

**Date:** 4 August 2026.
**Migrations:** none. **SQL:** none. **`next dev` / `next build`:** not run.
No garbled spans. Nothing was contradictory; nothing had to stop.

---

## V1. FIRST AND LAST NAME

### (a) Two fields — and no split, anywhere

[components/DemoGetStarted.tsx](components/DemoGetStarted.tsx) step 1 now asks for **First name** and
**Last name** side by side, with `autoComplete="given-name"` / `"family-name"` so a password manager
fills both correctly (a single "name" field made that a guess too).

🔴 **No whitespace split was added and none should be.** "van der Berg" yields first="van";
"Mary Jane Watson" yields last="Jane Watson" or "Watson" depending which end you take; a single-word
name yields an empty last name that renders as a trailing space in every greeting. A lossy split is
worse than a null because it is indistinguishable from a correct one. `operatorName` is now **derived**
from the two fields (`` `${first} ${last}`.trim() ``), never the other way round.

### (b) All three columns written, on the first insert

`first_name` and `last_name` now travel **with `/api/signup`**, so `operators` gets all three columns on
its initial insert rather than being patched afterwards:

```ts
const firstName = String(body.first_name ?? '').trim().slice(0, 80) || null
const lastName  = String(body.last_name  ?? '').trim().slice(0, 80) || null
const operatorName = [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0]
```

The `|| email.split('@')[0]` fallback is what keeps the plain `/signup` page working — its form has no
name fields, sends neither, and lands exactly where it did before.

The modal's existing `/api/auth/update-profile` call now sends all three too. **That route already
accepted `first_name` and `last_name`** ([:25-30](app/api/auth/update-profile/route.ts#L25-L30)) — it
was only ever being sent `name`. No server change was needed there.

⚠️ The columns demonstrably exist: `/api/auth/me` runs a **named** select over them
(`.select('name, email, first_name, last_name, phone, is_admin')`), which would 42703 the whole
statement in production if they did not. So naming them on the insert carries no PGRST204 risk.

### (c) Every reader, and whether it still works

| Reader | What it does | Still works |
|---|---|---|
| [app/api/auth/me:29-38](app/api/auth/me/route.ts#L29-L38) | selects all three, returns `first_name \|\| null` | ✅ |
| [app/api/auth/me:51,54](app/api/auth/me/route.ts#L51) | non-operator branches return `first_name: null, last_name: null` explicitly | ✅ |
| [app/admin/page.tsx:295](app/admin/page.tsx#L295) | `setOperatorName(me.first_name \|\| me.name \|\| null)` | ✅ — falls through to `name` |
| [app/dashboard/[token]/page.tsx:856](app/dashboard/[token]/page.tsx#L856) | `if (d.first_name) setCurrentUserFirstName(...)` | ✅ — guarded |
| [app/manage/[token]/page.tsx:421-422](app/manage/[token]/page.tsx#L421-L422) | `d.first_name ?? null` | ✅ |
| **Team tab — the one that reads the split fields** ([:11044-11045](app/manage/[token]/page.tsx#L11044-L11045)) | `setOwnProfileFirstName(currentUserFirstName \|\| '')` | ✅ — see (d) |
| Team tab save ([:10820-10826](app/manage/[token]/page.tsx#L10820-L10826)) | writes all three, `name` derived from the two | ✅ — already the pattern V1 adopts |
| `UserMenu` ([:505](app/manage/[token]/page.tsx#L505)) | `currentUserName \|\| currentUserFirstName \|\| ''` → `identityLabel \|\| userEmail \|\| null` → renders `'—'` | ✅ |
| `truck_users.name` (update-profile) | written from `name` only; that table has no split columns | ✅ unchanged |
| `lib/email-signup.ts` `firstNameFrom` | see (e) | ✅ |

### (d) 🔴 Existing operators — NULL split fields, and nothing renders "null"

**No backfill was written.** Every reader was checked against the NULL case:

* **`/api/auth/me`** returns `operator.first_name || null` — a NULL becomes `null`, never the string.
* **Team tab** seeds its inputs with `currentUserFirstName || ''`, so the fields render **empty**, not
  "null" or "undefined". Its Save stays disabled until both are filled
  ([:11183](app/manage/[token]/page.tsx#L11183)) — which is the existing behaviour, and is the natural
  place an existing operator fills them in when they next visit.
* **Admin** and **UserMenu** both chain to `name`, which every existing operator has, then to the email
  address, then to `'—'`. Three fallbacks before anything could be blank.
* **The dashboard** only assigns `first_name` inside `if (d.first_name)`.

**No reader renders an empty or literal-null name for a pre-split operator.**

### (e) The email fallback chain

**Identical on both emails: typed `first_name` → first word of `operators.name` → `"there"`.**

| Email | Expression |
|---|---|
| Verification ([app/api/signup/route.ts](app/api/signup/route.ts)) | `firstName ?? firstNameFrom(operatorName)` |
| Welcome ([app/api/auth/verify-signup/route.ts](app/api/auth/verify-signup/route.ts)) | `op?.first_name \|\| firstNameFrom(op?.name)` |

`firstNameFrom` supplies the last link — it returns `null` for empty input, and the template substitutes
`GREETING_FALLBACK` (`"there"`), so `Hi ,` and `Hi undefined` remain impossible.

⚠️ The verification email genuinely improves here. It is sent **inside** `/api/signup`, so before this
change the only name available was the email's local part — every new operator was greeted
"Hi dominicbonini,". Sending the names with the signup request is what lets it use the real one.

### (f) Both fields required — and why

**Both.** `First name` and `Last name` each need ≥2 characters; either missing blocks the step.

Last-name-optional was considered and rejected. This is the name on a real business relationship —
invoices, support, the emails Dominic answers personally — and a first-name-only operator is someone we
cannot address properly the first time it matters. It is also **two words at signup versus a
data-quality problem that can never be repaired**: a missing last name is indistinguishable from one
nobody asked for, so there is no later moment at which it can be chased with confidence.

**Gusto and RTF:** unaffected. This is the signup modal and `/api/signup`, neither of which runs for an
existing operator. Their `operators` rows are untouched and their split fields stay NULL, handled by (d).

---

## V2. THE BLOCKED-DOMAIN GUARD NOW FAILS CLOSED

### 🔴 Every call site, checked before the return changed

There were **two identical copies** of the guard and **three** call sites. All three now pass the output
of `normaliseUrl`:

| # | Call site | What it does with the result | Input |
|---|---|---|---|
| 1 | `schedVerify` — wizard Route A | `if (blocked) { setSchedVerifyError(BLOCKED_DOMAIN_MSG); return }` | `normaliseUrl(schedUrl)`, already non-null |
| 2 | `handleVerifyUrl` — Settings | `if (blocked) { setVerifyError(BLOCKED_DOMAIN_MSG); return }` | `normaliseUrl(form.schedule_url)`, already non-null |
| 3 | Settings schedule-URL blur | `if (blocked) show message; else saveSetting(...)` | `normaliseUrl(raw)`, already non-null |

**No call site would be harmed, and the reason is precise: the fail-closed branch is currently
unreachable.** `normaliseUrl` returns `null` for anything `new URL` would reject, and every call site
returns early on that null — with the accurate *"That doesn't look like a web address"* message. So an
unparseable string never reaches the guard, and changing what the guard does when it cannot parse
changes nothing any present caller sees.

**What changed:** the two copies became one shared `isScraperBlockedDomain` in
[lib/url-normalise.ts](lib/url-normalise.ts), whose `catch` returns **`true`** — cannot read it ⇒ cannot
clear it. Extracting was part of the fix, not tidying: leaving two copies while changing the semantics
of one is how they drift.

**What it protects against:** a future caller that forgets to normalise first. Before, such a caller
would have had `www.facebook.com/mytruck` silently waved through — not because it had been checked and
cleared, but because it could not be read at all.

**Gusto and RTF — before and after:** identical. Both reach call sites 2 and 3 from Settings whenever
they set a schedule URL, and in both cases the value has already been normalised, so the guard behaves
exactly as it did. A Facebook URL is still refused with the same message; a valid URL still saves.

---

## V3. ONE URL RENDER PATCH

Both inline copies now call `hrefFromStoredUrl` from [lib/url-normalise.ts](lib/url-normalise.ts):

```ts
export function hrefFromStoredUrl(value: string | null | undefined): string {
  if (!value) return ''
  return value.startsWith('http') ? value : `https://${value}`
}
```

### 🔴 A separate function from `normaliseUrl`, deliberately

`normaliseUrl` **refuses** anything not plausibly a hostname — right when an operator is typing and can
be told to fix it, **wrong when rendering a value already in the database**. A row stored before
normalisation existed might hold anything, and refusing it would replace a link the customer used to see
with nothing at all. V3 says that is worse than the duplication, and it is.

**Byte-identical to the expressions it replaces**, on purpose: `startsWith('http')` rather than a
stricter regex, and **no trim**. Both were considered and rejected — `/^https?:\/\//` would newly prefix
a value beginning `"httpx…"`, and trimming would change the href for a value stored with leading
whitespace. Both would be improvements in isolation and both would be behaviour changes on a
customer-facing page.

### What each page renders, before and after — identical in all four cases

| Stored `trucks.website` | TruckClient | VenueClient |
|---|---|---|
| `https://x.co.uk` | `href="https://x.co.uk"` — unchanged | `cleanWebsite = 'https://x.co.uk'` — unchanged |
| `www.x.co.uk` | `href="https://www.x.co.uk"` — unchanged | `'https://www.x.co.uk'` — unchanged |
| `''` (empty) | link not rendered (`{truckInfo.websiteUrl && …}` guard, untouched) | `''` — unchanged |
| `null` | link not rendered (same guard) | `''` — unchanged |

The truthiness guards around both call sites were left exactly as they were, so the not-rendered cases
are reached identically.

**Gusto and RTF — before and after:** no visible change on either customer page, for any value. The
inline expression became a function call returning the same string.

⚠️ Flagged, not fixed: a `trucks.website` stored with leading whitespace still produces a broken
`https:// example.com`. Trimming would fix it and would be a behaviour change V3 forbids. Worth doing as
a data fix rather than a render fix.

---

# REPORT ONLY

## V4. DEALS AND UPSELLS PUBLISH ON SAVE

### Deals — the mechanism

1. `DealsTab`'s `emptyBundle` ([:6046](app/manage/[token]/page.tsx#L6046)) creates every new deal with
   **`is_available: true, apply_to_new_events: true`**.
2. The customer menu route filters bundles for an event: if `event_deals` rows exist for it, only
   `active` ones show; **if none exist, it falls back to
   `filteredBundles.filter(b => b.apply_to_new_events)`**
   ([app/api/menu/[truckId]/route.ts:205](app/api/menu/[truckId]/route.ts#L205)).
3. A new deal therefore appears on the next open or confirmed event immediately, subject only to a stock
   check.

### 🔴 The Active/Off badge does NOT gate the customer

`DealsTab` renders `<Badge label={bundle.is_available ? 'Active' : 'Off'}>`
([:6090](app/manage/[token]/page.tsx#L6090)) — but **the customer menu route never filters on
`bundles_db.is_available`**. Its only `is_available` reads are on menu *items* (the stock check at
[:209](app/api/menu/[truckId]/route.ts#L209) and the item mapping at
[:547](app/api/menu/[truckId]/route.ts#L547)), and the bundle output hardcodes `available: true`
([:610](app/api/menu/[truckId]/route.ts#L610)).

**So an operator who sets a deal to "Off" is not hiding it from customers.** That is a bigger finding
than the save-publishes one, and it is worth confirming against a live truck before anything is built on
top of it.

### Existing draft/disabled/scheduled state

| Mechanism | Exists? | Actually gates the customer? |
|---|---|---|
| `bundles_db.is_available` | yes, with UI | **no** — see above |
| `bundles_db.apply_to_new_events` | yes, with UI ("Auto-apply"/"Manual") | **yes** — the fallback filter |
| `event_deals.active` | yes | **yes** — per-event, when rows exist |
| `bundles_db.start_time` / `end_time` | yes (time-of-day window) | out of scope here |
| **Upsells — any of the above** | **none** | — |

### Upsells — no draft state at all

`upsert_upsell_rule` writes exactly `trigger_category`, `suggest_category`, `max_suggestions`,
`show_at_checkout` ([app/api/manage/route.ts:446-462](app/api/manage/route.ts#L446-L462)). The customer
route selects `.from('upsell_rules').select('*').eq('truck_id', …)` with **no visibility filter of any
kind** and emits it straight to the order page. `show_at_checkout` controls *where* a suggestion appears,
not *whether* it is live.

**There is no column that could be repurposed as a draft flag.**

### The smallest change, for each

* **Deals — one line, no migration.** Change `emptyBundle` to `apply_to_new_events: false`. A new deal
  then saves as "Manual" and shows to nobody until the operator turns it on or attaches it to an event.
  It reuses an existing column, an existing filter and an existing badge. (Changing `is_available`
  instead would *not* work — see above.)
* **Upsells — a migration is unavoidable.** There is no column to toggle, so the smallest honest change
  is `alter table upsell_rules add column if not exists is_active boolean not null default true;` plus a
  filter on the customer route and a toggle in the UI. `default true` keeps every existing rule live;
  new rules would need to be inserted `false` to get a draft state. **Not built — that is a schema change
  and a live-behaviour change, and it is Dominic's call.**

---

## V5. THE UNDERSTATED ALLERGEN LINE

### The exact current string

[app/manage/[token]/page.tsx:4096](app/manage/[token]/page.tsx#L4096):

> **{unverifiedCount} dishes need review — customers can't see allergen info until confirmed**

**Render conditions:** inside the Menu tab's "Allergens" section box, in the branch
`needsReview ? … : …`, where:

```ts
const unverifiedCount = localItems.filter(i => i.allergens_verified === false).length
const cardMode = mode === 'card'
const needsReview = !cardMode && unverifiedCount > 0
```

**Where it sits:** the Allergens section is a separate `<h2>` block with `mt-10`, **below the entire
menu** — an operator has to scroll past every category to reach it.

### The slice-I5 banner, for comparison

[app/manage/[token]/page.tsx:3598-3608](app/manage/[token]/page.tsx#L3598-L3608), at the **top** of the
Menu tab:

> **🚫 {n} items are not visible to customers**
> They won't appear on your ordering page until their allergens are confirmed — showing a dish with
> unchecked allergen info would read as "allergen-free". You can still see them here.
> **Confirm allergens →**

Condition: `(truck.allergen_display_mode ?? null) !== 'card' && items.filter(i => i.allergens_verified === false).length > 0`.

### 🔴 They fire on the same condition, and say different things about the same fact

`!cardMode` where `cardMode = mode === 'card'` **is** `mode !== 'card'`; `localItems` is seeded from
`items`; both count `=== false`. **The two conditions are equivalent — whenever one shows, so does the
other.** An operator in this state sees a red "not visible to customers" banner at the top of the page
and, after scrolling past their whole menu, an amber line saying customers merely can't see the allergen
*info*.

**The older line is the wrong one.** In per-dish mode (and `null` counts as per-dish) the customer menu
route drops the item entirely — the dish is gone, not merely un-annotated.

### Merge, differentiate, or leave separate?

**My reading: differentiate, do not merge — and correct the older line.**

* **Not merged.** They serve different jobs at different depths: the top banner is the alarm (you have a
  problem right now), the Allergens box is the status panel (mode, count, card state, the wizard entry).
  Deleting either leaves a gap — an operator who scrolls straight to Allergens would lose the
  consequence, and one who dismisses the top of the page would lose the controls.
* **But the box's line should stop contradicting the banner.** The minimal correction is to replace
  *"customers can't see allergen info until confirmed"* with something that matches the fact and defers
  to the banner for the detail — e.g. *"{n} dishes need review — they're hidden from customers until
  confirmed"*. Same length, same tone, same amber treatment, and no longer a softer contradiction of the
  red banner twelve screens above it.

**Reported only. This is live operator copy on a food-safety surface and Dominic decides.**

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT CODE: 0
```

| File | Baseline | Now |
|---|---|---|
| `app/manage/[token]/page.tsx` | **370** (293 errors, 77 warnings) | **370 (293 errors, 77 warnings)** |
| `lib/url-normalise.ts` | 0 | **0** |
| `components/DemoGetStarted.tsx` | 0 | **0** |
| `app/api/signup/route.ts` | 0 | **0** |
| `app/api/auth/verify-signup/route.ts` | 0 | **0** |
| `app/trucks/[slug]/TruckClient.tsx` | 5 (4 errors, 1 warning) at HEAD | **0** |
| `app/venues/[slug]/VenueClient.tsx` | 10 (9 errors, 1 warning) at HEAD | **0** |

The two customer pages are **below** their HEAD baselines. Both were measured by restoring the HEAD
version, linting, and restoring mine — not assumed. The improvement is incidental: replacing a long
inline ternary removed the lines the rules were firing on.

### Files touched

| File | Reason |
|---|---|
| [components/DemoGetStarted.tsx](components/DemoGetStarted.tsx) | V1a — two name fields, their validation and sending all three values. |
| [app/api/signup/route.ts](app/api/signup/route.ts) | V1b/e — accepts and writes `first_name`/`last_name`, derives `name`, greets by the real first name. |
| [app/api/auth/verify-signup/route.ts](app/api/auth/verify-signup/route.ts) | V1e — welcome email prefers `first_name`, falls back to the old derivation. |
| [lib/url-normalise.ts](lib/url-normalise.ts) | V2 `isScraperBlockedDomain` (fails closed); V3 `hrefFromStoredUrl`. |
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | V2 — both local guard copies replaced by the shared one. |
| [app/trucks/[slug]/TruckClient.tsx](app/trucks/[slug]/TruckClient.tsx) | V3 — the inline href patch replaced by the helper. |
| [app/venues/[slug]/VenueClient.tsx](app/venues/[slug]/VenueClient.tsx) | V3 — the same. |

No migration, no SQL, no backfill.

### Gusto and Real Thai Food, per item

| Item | Before | After |
|---|---|---|
| **V1** | one name field at signup; their `first_name`/`last_name` NULL | **Unaffected** — signup code only. Their rows are untouched, no backfill, and every reader falls back to `name`. The Team tab still lets them fill the split fields whenever they choose. |
| **V2** | the guard could not read an unparseable URL and reported "not blocked" | **No visible change.** Every call site they reach normalises first, so the fail-closed branch is unreachable for them. Facebook URLs still refused, valid URLs still save. |
| **V3** | their `website` link rendered via one of two inline patches | **No visible change** — identical output for a scheme, no scheme, empty and null. One helper instead of two copies. |
| **V4 / V5** | — | **Nothing changed. Report only.** |
