# Outreach screenshot fill: a phone number alone no longer decides the prospect

**Date:** 15 October 2026.

**Branch:** `main`. Your brief said `schedule-graphics`, then you said "everything that's been built should be on main". `schedule-graphics` is a 6 October snapshot, 13 commits behind `main`, and the code that wrote onto Tacoman is `main`'s.

**Not committed.** `main`'s working tree already holds the uncommitted Language Phase 1b work. `scripts/harnesses.json` carries changes from both pieces of work, so one commit cannot cleanly hold only this change. Nothing was pushed or deployed. This change touches six files, listed in §7.

**SQL:** I ran none that writes. My database access was `select` only: through the service-role client in a scratch script, which printed no key. You run the fix in §3.

**Garbled spans:** none found. The branch instruction conflicted with the state of the repo; I asked, and you resolved it.

---

## 1 · What happened

### The code path
The Screenshots tab is `components/admin/ScreenshotsPanel.tsx`, which posts to `app/api/admin/screenshot-events/route.ts`.
- A truck-details screenshot is classified, read, and then matched by `matchProspect` (`lib/admin/truck-details.ts`).
- The fill itself is `planFill` (fill **empty** fields only) and then `applyFill` (`lib/admin/truck-details-write.ts`). The history line is written by `addNote` (`lib/outreach-events.ts`) as an `outreach_events` row with `kind = 'note'`.

### The rule that decided the match (as it was, `lib/admin/truck-details.ts`)
```ts
for (const r of rows) {
  if (d.facebook_url && sameFacebookPage(d.facebook_url, r.facebook_url)) { hits.push({ row: r, on: 'facebook' }); continue }
  const rWeb = bareDomain(r.website)
  if (d.website && rWeb && d.website === rWeb) { hits.push({ row: r, on: 'website' }); continue }
  const ours = [phoneDigits(d.mobile, country), phoneDigits(d.phone, country)].filter(Boolean) as string[]
  const theirs = [phoneDigits(r.mobile, country), phoneDigits(r.phone, country)].filter(Boolean) as string[]
  if (ours.length && theirs.some(t => ours.includes(t))) { hits.push({ row: r, on: 'phone' }); continue }
  …
}
…
if (hits.length === 1 || distinct.length === 1) {
  const h = hits[0]
  return { kind: 'definite', row: h.row, on: h.on, why: `matched on ${KEY_WORDS[h.on]}` }
}
```
- **Any single key was definite**, the phone included.
- **The name was never compared once the phone hit.** The `continue` after the phone check skips it.

### What the data shows (read-only)
**5 Oct 2026, 13:17 — the bad fill.** Smash and Grab's Facebook page was filed on the Tacoman prospect (`f88b3699…`, truck `d7a21372…`), "matched on phone number".
- Tacoman's truck held 07977 469367 in `phone`.
- Its email, mobile and Instagram were **empty**, so all three were filled: `info@smashandgrabfoodtruck.com`, `07977 469367` and `…/smashandgrabfoodtruck`.
- The area line "From screenshot: Cambridge · Saffron Walden · Ely" was appended to Tacoman's notes.

**5 Oct, 13:24 — Tacoman's own page.** It matched on the website and added the Facebook link. Its summary says "email kept (already had one)", so the wrong email was still on the row.

**14 Oct, 11:11 — a real email went to the wrong address.** "Ordering costs for Tacoman" was sent from the Tacoman prospect to **`info@smashandgrabfoodtruck.com`** (not a test send).
- Nine minutes later, at 11:20, the same subject went to `tacoman@tacoman.uk`. The email had been corrected in between.
- At 11:25 the owner **replied from `info@smashandgrabfoodtruck.com`**, and the prospect moved to *replied*.
- These are true history and are left as they are.

**Today:**
- Tacoman's email is already `tacoman@tacoman.uk`.
- **Its Instagram is still Smash and Grab's.**
- Its mobile 07977 469367 is right for both trucks.

**A Smash and Grab prospect already exists:** prospect `e85995c2…`, truck `2840c1fe…`, named "Smash and Grab".
- It is hidden (`show_on_vf` and `show_on_hg` false) with `excluded = true`.
- Its platform is Hatches Up.
- It has no email, mobile or Instagram, and no notes.
- **So the INSERT is not needed;** §3 fills that existing row instead.

**There is no link between prospects anywhere in the schema.** No column or table relates one prospect to another; `do_not_contact` and `entity_type` describe one business. "Same owner" is therefore recorded as a note on both prospects.

---

## 2 · Read-only SELECTs

```sql
-- (a) Tacoman: the prospect and its contact fields
select p.id as prospect_id, p.stage, p.notes, p.next_action_at,
       t.id as truck_id, t.name, t.contact_email, t.mobile, t.phone, t.website,
       t.facebook_url, t.instagram_url, t.country
from outreach_prospects p
join discovery_trucks t on t.id = p.discovery_truck_id
where t.name ilike '%tacoman%';

-- (b) any separate Smash and Grab truck / prospect (by name, email, Instagram or the shared number)
select t.id as truck_id, t.name, t.contact_email, t.mobile, t.phone, t.instagram_url, t.facebook_url,
       t.show_on_vf, t.show_on_hg, t.excluded, p.id as prospect_id, p.stage, p.platform, p.notes
from discovery_trucks t
left join outreach_prospects p on p.discovery_truck_id = t.id
where t.name ilike '%smash%'
   or t.contact_email ilike '%smashandgrab%'
   or t.instagram_url ilike '%smashandgrab%'
   or t.mobile = '07977 469367' or t.phone = '07977 469367';

-- (c) what the screenshot fills wrote: the prospect history and the screenshot log
select 'outreach_events' as source, e.id, e.created_at, e.kind as what, e.body as text
from outreach_events e
join outreach_prospects p on p.id = e.prospect_id
join discovery_trucks t on t.id = p.discovery_truck_id
where t.name ilike '%tacoman%' and e.body ilike 'Filled from a screenshot%'
union all
select 'screenshot_log', l.id, l.created_at, l.outcome, l.summary
from screenshot_log l
where l.summary ilike '%smashandgrab%'
   or l.truck_id in (select id from discovery_trucks where name ilike '%tacoman%')
order by created_at;

-- (d) mail to or from the Smash and Grab address, and the Tacoman contact log
select m.created_at, m.direction, m.status, m.is_test, m.from_address, m.to_address, m.subject, m.prospect_id
from outreach_messages m
where m.to_address ilike '%smashandgrabfoodtruck.com%' or m.from_address ilike '%smashandgrabfoodtruck.com%'
order by m.created_at;

select c.contacted_at, c.channel, c.direction, c.kind
from outreach_contacts c
join outreach_prospects p on p.id = c.prospect_id
join discovery_trucks t on t.id = p.discovery_truck_id
where t.name ilike '%tacoman%'
order by c.contacted_at;
```

---

## 3 · The data fix — run now (one transaction; a SELECT after each write)

The statements write the shapes the app writes:
- truck columns patched on `discovery_trucks`, without `updated_at`, which the app does not set either;
- **empty fields only** on the Smash and Grab row (the `planFill` rule);
- notes appended once (the `appendNotes` rule);
- history as an `outreach_events` row with `kind = 'note'` (the `addNote` shape).

The history is corrected by **adding** a note; the 5 October lines are kept. Every write is guarded, so running it twice changes nothing.

```sql
begin;

-- 0. before
select id, name, contact_email, mobile, phone, instagram_url
from discovery_trucks
where id in ('d7a21372-79d0-49a7-9113-af1127cef312', '2840c1fe-34de-4968-a9a5-65d519dd93fc');

-- 1. Tacoman: the right email (already set — expect UPDATE 0), and Smash and Grab's Instagram removed. Mobile kept.
update discovery_trucks set contact_email = 'tacoman@tacoman.uk'
where id = 'd7a21372-79d0-49a7-9113-af1127cef312'
  and contact_email is distinct from 'tacoman@tacoman.uk';
update discovery_trucks set instagram_url = null
where id = 'd7a21372-79d0-49a7-9113-af1127cef312'
  and instagram_url = 'https://www.instagram.com/smashandgrabfoodtruck';
select id, name, contact_email, mobile, phone, instagram_url
from discovery_trucks where id = 'd7a21372-79d0-49a7-9113-af1127cef312';

-- 2. Tacoman: a correcting note in its history (the 5 Oct lines stay)
insert into outreach_events (prospect_id, kind, body)
select 'f88b3699-0684-4c62-8ae6-c93158fd4eb6', 'note',
       'Correction to the screenshot fill of 5 Oct 2026 13:17: it matched this prospect on the mobile 07977 469367 alone. '
    || 'The screenshot was Smash and Grab food truck''s Facebook page — same owner as Tacoman, shared mobile. '
    || 'The email info@smashandgrabfoodtruck.com and the Instagram link https://www.instagram.com/smashandgrabfoodtruck it added were Smash and Grab''s: '
    || 'the email has since been set to tacoman@tacoman.uk and the Instagram link was removed on 15 Oct 2026. '
    || 'The mobile is right for both trucks and was kept. The area line "Cambridge · Saffron Walden · Ely" in the notes came from the same screenshot.'
where not exists (
  select 1 from outreach_events
  where prospect_id = 'f88b3699-0684-4c62-8ae6-c93158fd4eb6'
    and body like 'Correction to the screenshot fill of 5 Oct 2026%');
select id, created_at, kind, body
from outreach_events where prospect_id = 'f88b3699-0684-4c62-8ae6-c93158fd4eb6' order by created_at;

-- 3. Smash and Grab (prospect exists: e85995c2…, truck 2840c1fe…): fill its EMPTY fields only
update discovery_trucks set contact_email = 'info@smashandgrabfoodtruck.com'
where id = '2840c1fe-34de-4968-a9a5-65d519dd93fc' and (contact_email is null or btrim(contact_email) = '');
update discovery_trucks set mobile = '07977 469367'
where id = '2840c1fe-34de-4968-a9a5-65d519dd93fc' and (mobile is null or btrim(mobile) = '');
update discovery_trucks set instagram_url = 'https://www.instagram.com/smashandgrabfoodtruck'
where id = '2840c1fe-34de-4968-a9a5-65d519dd93fc' and (instagram_url is null or btrim(instagram_url) = '');
select id, name, contact_email, mobile, phone, instagram_url, show_on_vf, show_on_hg, excluded
from discovery_trucks where id = '2840c1fe-34de-4968-a9a5-65d519dd93fc';

-- 4. Smash and Grab: the area and the same-owner line, appended once
update outreach_prospects
set notes = case when notes is null or btrim(notes) = ''
                 then E'From screenshot: Cambridge / Saffron Walden / Ely\nSame owner as Tacoman (shared mobile)'
                 else btrim(notes) || E'\nFrom screenshot: Cambridge / Saffron Walden / Ely\nSame owner as Tacoman (shared mobile)' end
where id = 'e85995c2-e7d4-4597-8253-7d8b940ca8e9'
  and coalesce(notes, '') not like '%Same owner as Tacoman (shared mobile)%';
select id, notes from outreach_prospects where id = 'e85995c2-e7d4-4597-8253-7d8b940ca8e9';

-- 5. Smash and Grab: a history note saying where its details came from
insert into outreach_events (prospect_id, kind, body)
select 'e85995c2-e7d4-4597-8253-7d8b940ca8e9', 'note',
       'Details added by hand on 15 Oct 2026: email info@smashandgrabfoodtruck.com, mobile 07977 469367, Instagram link https://www.instagram.com/smashandgrabfoodtruck — '
    || 'from this truck''s Facebook screenshot of 5 Oct 2026, which had been filed on Tacoman by a phone-only match. Same owner as Tacoman (shared mobile).'
where not exists (
  select 1 from outreach_events
  where prospect_id = 'e85995c2-e7d4-4597-8253-7d8b940ca8e9' and body like 'Details added by hand on 15 Oct 2026%');
select id, created_at, kind, body
from outreach_events where prospect_id = 'e85995c2-e7d4-4597-8253-7d8b940ca8e9' order by created_at;

commit;
```

**Not done; these are your decisions:**
- **The existing truck is named "Smash and Grab", not "Smash and grab food truck".** Renaming a `discovery_trucks` row changes how the scraper and the Hatches Up match recognise it, so I did not write a rename.
- **The row is `excluded` and hidden.** It still appears in the outreach list, which carries no filter.
- **Tacoman's notes still begin with the Smash and Grab area line.** The app never rewrites notes; the correction note says where that line came from.
- **The `screenshot_log` row for 5 October still names Tacoman.** It is a log of what happened, and has no notes column.

All four ids above were read back from the database (read-only) after writing this SQL: Tacoman truck `d7a21372-79d0-49a7-9113-af1127cef312` / prospect `f88b3699-0684-4c62-8ae6-c93158fd4eb6`; Smash and Grab truck `2840c1fe-34de-4968-a9a5-65d519dd93fc` / prospect `e85995c2-e7d4-4597-8253-7d8b940ca8e9`.

---

## 4 · The fix to the matching rule

**A phone hit alone no longer decides** (`matchProspect`, `lib/admin/truck-details.ts`).
- When the only key that hit a prospect is the phone, the names must also agree. The comparison uses `normalizeVenue`, the same normaliser the name key uses.
- If they differ, or the screenshot shows no name, the result is "Needs a look" with `ask: 'phone_only'`, and **nothing is written**. The row reads, word for word:
  > This number belongs to Tacoman. The screenshot says Smash and Grab. Is this Tacoman, or a different truck?

  The choices are **"Same truck — update Tacoman"**, **"Different truck — add as new"** and **"Cancel"**. Cancel calls nothing.
- **What behaves exactly as before:**
  - a name match;
  - a name-and-phone match;
  - a Facebook or website match (recorded before the phone is looked at);
  - two prospects matching ("Needs a look");
  - a near name;
  - no match (a new hidden truck).

**A different saved email or social link is asked about, never replaced on its own.**
- `planFill` still fills empty fields only.
- When a saved email, Facebook link or Instagram link differs from the screenshot, the row now shows it as "Email: old → new" with **Replace** and **Keep saved**.
- Only Replace writes, through a new `replace_fields` action. The server works out the conflict again from the row as it stands and refuses if the saved value is no longer the one shown. Nothing from the browser is trusted.
- The history line reads "Filled from a screenshot — Replaced email old → new · confirmed by hand".
- Mobile, phone and website keep today's behaviour: kept, and noted in the summary.

**Where the code is:**
- The route's match-and-act step moved into `fileTruckDetails` (with `addAsNewTruck`, `fillConfirmedTruck` and `replaceConfirmed`) in `lib/admin/truck-details-write.ts`, so the harness drives the same code the route runs.
- The route's error wording is unchanged; `classifyFailure` reads it.
- **The panel reuses the existing look:**
  - the question uses the "Needs a look" amber buttons and the "Check country" Dismiss style;
  - the old → new lines sit in an amber box under the row;
  - the route sends each line already written, so the admin page does not bundle the matcher.

**Smaller choices, recorded here:**
- A phone hit with no name on the screenshot also asks, because a phone alone must not decide. The wording then says "The screenshot shows no name."
- Email was **not** given the same rule. The brief names only the phone, and a shared email between two trucks is listed below for later.

---

## 5 · Proof

**New harness: `scripts/screenshot-phone-match.cjs` — 17 checks, all pass.**
- It runs the **real route** end to end, bundled with `_render-kit`, against `_fake-pg`, which records every write.
- Gemini is stubbed, there is no network, and every truck is made up.
- Each case passes on the real code **and fails on a broken variant**: the same route bundled with one plausible mistake patched in.

| Case | Broken variant that must fail it |
|---|---|
| phone matches, name differs → asks the exact question; **no write** to trucks, prospects or history | `phoneDecides` (the old rule) |
| phone matches, no name → asks; no write | `phoneDecides` |
| name and phone match → fills as before ("matched on phone number") | `phoneAlwaysAsks` (over-correction) |
| name matches → fills as before | — (covered by the row above) |
| a differing saved email is not overwritten; shown "Email: old → new" | `overwrites` (fill replaces saved values) |
| Replace writes only the confirmed field; a stale confirmation is refused | `replaceTrustsBrowser` |
| "Different truck — add as new" creates a hidden truck and prospect; the matched one is untouched | `addAsNewFills` |

It also checks the panel source: the three labels; "Different truck" sends `add_as_new`; Cancel calls nothing; Replace and Keep saved are both offered. The harness is registered in `scripts/harnesses.json`.

**Harnesses that compile a changed file:**
- `screenshot-truck-details` — 174 pass, with **one named re-pin**. "A phone match is definite across formats" asserted the old rule. It now says a phone match *with the same name* is definite, and a phone match with no name is "Needs a look" (phone_only).
- `schedules-country-parity` — 73/73. The GB details match is unchanged byte for byte.
- `schedules-country-screenshots` — 26/26.
- `schedule-graphics-places` — 270.
- `phone-parity` — pass.
- `screenshot-truck-details-render` (Chromium and WebKit, after the build) — layout green.

**Build and lint:**
- **`npx tsc --noEmit`:** clean.
- **`npm run build`:** exit 0.
- **ESLint:** no rule count grew in the four TypeScript files.
  - The new `.cjs` harness has six `no-require-imports`. Every CommonJS harness carries that rule; `screenshot-truck-details.cjs` has 5 and `schedules-country-parity.cjs` has 6.
- **`run-harnesses --dry-run`:** all 119 listed files pass the screen.

**⚠️ A sweep started by mistake.** I called the runner with an `--only` flag it does not support, which started the full sweep you asked me not to run. I stopped it by its task id after about five minutes. It runs fixtures only, and `git status` showed no file changed by it.

---

## 6 · Localhost test list (made-up prospect only; localhost writes to the live database)

⚠️ These steps create two **hidden** test prospects (not on either public map), and they call Gemini.

1. Make an image of a contact panel reading: name **Test Taco Fixture**, phone **07700 900123**, email **hola@testtaco.example**. Drop it on Admin → Screenshots (UK) → **New truck**.
2. Make a second image: name **Test Grab Fixture**, phone **07700 900123**, email **info@testgrab.example**, Instagram **@testgrabfixture**. Drop it → **Needs a look**. The row should read: "This number belongs to Test Taco Fixture. The screenshot says Test Grab Fixture. Is this Test Taco Fixture, or a different truck?" Open Test Taco Fixture: nothing has changed.
3. Press **Cancel** → "Cancelled — nothing added". Nothing changes.
4. Drop image 2 again and press **Different truck — add as new** → a new prospect, Test Grab Fixture, holding the info@ email.
5. Drop image 2 again and press **Same truck — update Test Taco Fixture**. Its empty Instagram is filled, and the row shows "Email: hola@testtaco.example → info@testgrab.example" with Replace and Keep saved.
   - Press **Keep saved**: the email does not change.
   - Repeat, press **Replace**: the email changes, and the history reads "…Replaced email … · confirmed by hand".
6. Drop an image with name **Test Taco Fixture** and the same phone → fills as before ("… · matched on phone number").
7. **Tidy-up:** the two test prospects are hidden. Remove them by hand when done.

---

## 7 · Files

**Changed:**
- `lib/admin/truck-details.ts`: the phone rule, `phoneOnlyQuestion`, `CONFIRM_FIELDS`, `conflictsToConfirm`, `conflictLine`, `planReplace`, `replacedSummary`.
- `lib/admin/truck-details-write.ts`: `fileTruckDetails`, `addAsNewTruck`, `fillConfirmedTruck`, `replaceConfirmed`.
- `app/api/admin/screenshot-events/route.ts`: uses them; adds `ask` and `conflicts` to the result and the `replace_fields` action.
- `components/admin/ScreenshotsPanel.tsx`: the question, Cancel, and the old → new lines.
- `scripts/screenshot-truck-details.cjs`: the named re-pin.
- `scripts/harnesses.json`: registers the new harness.

**New:** `scripts/screenshot-phone-match.cjs`.

**Untouched:**
- `lib/outreach-events.ts` (the one history writer);
- every `outreach_templates` row;
- `lib/admin/screenshot-events.ts` and the schedule path;
- the Phase 1b files.

**Later, not done:**
- **A shared email** could mislead in the same way a shared phone did. The brief named only the phone.
- **The 5 October screenshot-log row** still names Tacoman.
- **Prospects cannot be linked to each other** in the schema; doing so would need a migration.
