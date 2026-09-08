# Outreach — phone/WhatsApp diagnosis, Hatches Up tickbox, sortable columns

**GARBLED SPANS: none. No instruction contradicted another** — task 1's findings do not contradict tasks
2/3 (those touch platform and sorting, not phone/WhatsApp), so I built 2 and 3. Task 1 is diagnosis only.

**Files changed:** `app/admin/outreach/page.tsx`, `app/api/admin/outreach/route.ts`. `lib/outreach.ts`
**unchanged** — `canonicalisePlatform` and `isHatchesUp` kept as-is (the sort still uses `isHatchesUp`).
No migration, no schema change, no data written. Nothing deployed. ⚠️ `ios/.../project.pbxproj` shows
modified in git — pre-existing, not mine.

---

## TASK 1 — DIAGNOSIS (report only; nothing wired)

### a. Which phone column the VF call button reads
🔴 **`discovery_trucks.phone` — `mobile` is effectively unused.** Both discovery rendering paths map
`phoneNumber: truck.phone || ''` (`app/api/discovery/events/route.ts:169` and `:346`). `mobile` is read in
**one** place only — the operator-**linked** path — as a last-resort fallback:
`const phoneNumber = opPhone || linked.phone || linked.mobile || null` (`:265`).
**When phone and mobile disagree:** `phone` wins, because `mobile` is never consulted for the button on a
plain discovery truck; it is reached only when a truck is linked to a HatchGrab operator AND both the
operator's phone and the discovery `phone` are null. The button itself is `<a href="tel:${cleanPhone}">`
(`components/EventListCard.tsx:179`), `cleanPhone` derived from `phoneNumber` (`:105`).

### b. 🔴 Where the WhatsApp tag lives — and it is NOT a clean boolean
For **discovery trucks** the WhatsApp button shows when **all three** hold
(`components/EventListCard.tsx:105-127,181`):
1. `hasPhone` — a phone exists;
2. `isMobileNumber` — `waPhone.startsWith('447')`, i.e. **a format derivation** from the number (UK mobile);
3. `acceptsWhatsApp` — **`methodsStr.includes('whatsapp')`, where `methodsStr = accepted_methods.toLowerCase()`**.

🔴 **So the "tag" is `discovery_trucks.accepted_methods` — a free-text, multi-value column — plus a
runtime mobile-format check. There is no boolean.** `trucks.phone_is_whatsapp` is used **only** in the
operator-linked path (`discovery/events/route.ts:268`: `truck.phone_is_whatsapp ? 'Whatsapp' : null`), so
**`phone_is_whatsapp` covers onboarded/operator trucks only — exactly as you suspected. What covers
discovery trucks is `accepted_methods`.**

### c. Read-only counts over non-excluded `discovery_trucks` (120 rows)
| | count |
|---|---|
| has `phone` | **62** |
| has `mobile` | **14** |
| has either | **71** |
| has both | **5** (of which `phone` ≠ `mobile`: **4**) |
| of "either", also have `contact_email` | **32** |
| `accepted_methods` mentions `whatsapp` | **27** |

### d. The two example trucks — every contact column
```
Big Bite Kebab : phone "07378 276220", mobile null, contact_email null,
                 accepted_methods null, order_url null, website https://bigbitehadleigh.com/
Churro Boyz    : phone "07770 642489", mobile null, contact_email null,
                 accepted_methods null, order_url null, website https://www.facebook.com/laflamencachurros
```
⚠️ **Both have a phone but `accepted_methods` is NULL** — so on the live site they show **📞 Call but NOT
💬 Message**, because `acceptsWhatsApp` is false. They are "trucks with a number", not "WhatsApp-tagged
trucks". A WhatsApp-tagged row would additionally have `accepted_methods` containing `whatsapp`.

### 🔴 Which source should be authoritative — reported BEFORE wiring anything (and I wired nothing)
The premise "the WhatsApp tag is a real stored field, so read it rather than duplicate it" **needs
qualifying: there is no single clean field to read.** The discovery signal is `accepted_methods` (messy
free text, shared/anon-readable) + a phone-format check. The outreach page's `whatsapp_number` /
`whatsapp_confirmed` are a **different, cleaner fact** — the outreach operator's own record/confirmation.

**Recommendation:** these are related but not identical facts, so this is a decision for you, not a
mechanical de-dupe:
- If the outreach page should show **"does this truck advertise WhatsApp"** (what the live button uses),
  **read `discovery_trucks.accepted_methods` (contains `whatsapp`) + the `447` mobile check read-only** —
  do not copy it into an outreach column, and treat `discovery_trucks` as authoritative for it.
- If `whatsapp_confirmed` is meant to record **your own confirmation** (distinct from the scraped tag),
  keep it — but then it must be labelled as that, not as "is WhatsApp".
🔴 **Tasks 2 and 3 do NOT wire phone or WhatsApp, so I changed neither.** The outreach page still shows no
phone. If you want phone surfaced, the authoritative column is **`phone`** (§a); say so and I will add it
read-only. **I did not, to avoid choosing between the two WhatsApp sources without your decision.**

---

## TASK 2 — the Hatches Up tickbox (built)

Replaced the platform picker (`PlatformEditor`, the `Other…` free-text, the three-state glyphs, the
`CLEAR/NONE_OPT/OTHER` constants) with a single **`HatchesUpCheckbox`**.

🔴 **The column type is unchanged and no data was migrated.** `outreach_prospects.platform` stays nullable
text. The checkbox is a rendering over it:
- **ticked → writes the canonical `HATCHES_UP` constant**;
- **unticked → writes `NULL`**;
- **existing non-Hatches-Up values stay in the database, untouched** — and are **shown in the cell** (e.g.
  `pizza-mondo.co.uk`) beside the unticked box, so unticking (which writes NULL and would clear such a
  value) is visible, not silent.

🔴 **No boolean column was added** — that would destroy the NULL-means-nobody-looked distinction the
platform-detection pass established. NULL still reads as "unexamined", and the unticked box is that NULL.
The tick reads via `isHatchesUp` (case-insensitive), so a value seeded as `hatches up` still shows ticked;
saving re-writes the canonical spelling.

**Verified in a browser (stubbed data — see the boundary):** ticked for both `'Hatches Up'` and
`'hatches up'`; unticked for `null` and for a custom host (whose value is shown); ticking a NULL row posts
`platform:'Hatches Up'`; unticking a Hatches Up row posts `platform:null`. No console errors.

---

## TASK 3 — sortable columns (built)

Every column header is now a sort button. Clicking cycles **none → asc → desc → back to default**, and the
active column shows **▲ / ▼ in orange** at a glance. Nulls **always sort last, in both directions** (a
null is "no value", pinned to the bottom regardless of direction).

Per-column sort value: Truck/Email/WhatsApp/Stage = the string (null last); Hatches Up = the tick state;
Schedule = upcoming-event count, with "no schedule at all" (no upcoming and no past) treated as null →
last; Last contacted / Next action = the date string (lexical, null last).

### 🔴 What happens to your sort choice when you edit a row
**The chosen sort HOLDS. It is not reset to the default.** The sort selection lives in its own state that a
row edit does not touch; an optimistic patch re-runs the sort against **that** state.
- If you have chosen a column, an edit re-sorts by **that column only** — predictable, and the active-column
  marker stays put.
- A row moves **only if you edit the field you are sorted by** (e.g. sorted by Stage, then change a Stage) —
  that is correct, it is sorted by that column. Editing any other field leaves the row where it is.
- With **no** explicit sort (the default priority sort), the pre-existing behaviour is unchanged: editing
  platform/stage/email can move a row per the priority rank. Choosing an explicit sort is how you stop that.

**Verified in a browser (stubbed data):** Schedule asc `2,5,9,null`; desc `9,5,2,null` (**null last both
ways**); third click returns to default. Email and Next-action likewise, nulls last both directions.
🟢 **Sort-holds-on-edit: sorted by Next action ascending, edited a row's Stage → order unchanged and the
Next-action header still showed the active ▲.** No console errors.

⚠️ **Housekeeping:** the route no longer returns `platformOptions` and the page no longer reads it — both
were only for the removed picker. Removing dead code, in-scope (the route was already permitted).

---

## Verification boundary — stated plainly

🔴 **I did NOT get a real admin session this time either, so the page has still NOT rendered against the
live 176 rows, and I am not describing it as working against live data.**
- The sole admin is your own account (`dominic@hatchgrab.com`); there is no test credential and no existing
  session. **Minting a session via the service role was blocked by the environment's safety policy, and I
  did not work around it.**
- So every browser check above ran against **STUBBED network data** — the **real page component** in a real
  browser with real interactions (checkbox, header clicks, edits), but the `/api/admin/outreach` GET/POST
  were intercepted with fabricated rows and the POSTs captured rather than sent. **Not the live tables.**
- Read-only, I confirmed the underlying live data is unchanged and the counts in §c are real (service-role
  SELECT). But the page rendering against those 176 rows through the gate is **unverified** — the same gap
  as last time.
- **tsc is clean** (supplementary, not verification). No platform value, phone number or WhatsApp flag was
  written to any row.

**To close it:** open `/admin/outreach` as an admin, confirm the 120 visible rows render, tick a Hatches Up
box on a NULL row and confirm it saves, and sort by a couple of columns to confirm nulls fall last.

**Nothing deployed. No row changed. Only the page and its route edited.**
