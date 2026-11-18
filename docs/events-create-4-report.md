# events-create-4 — "Create event now" only inside the Select event list, plus the wording fix

18 November 2026. **Committed locally on main as `e3c02790`. Not pushed, not deployed.** docs/ is left uncommitted. No database reads or writes, and no SQL was run.

## Summary

- **"Create event now" now appears only inside the Select event list.**
  - It is gone from the dark event bar, the amber "No event selected" box on Add order, the amber box on Orders, and the "Approve an event to take orders" state. Each of these shows **"Select event" only**.
  - In the list it stays where it was: at the **top** when nothing approved is on today, otherwise at the **bottom**.
  - The offline and not-logged-in disabled states are unchanged.
- **Wording:** `errorsKitchen.sign_in_to_create` now reads **"Log in as a team member to create an event."**
  - The same key is used for the server's refusal and for the line under the disabled button, so both now read this.
  - **app-fixes-2 passes: 55/0**, against 54/1 before.
- **Checks:**
  - tsc is clean.
  - The events route/rule checks pass: 85/0, 27/0, 46/0 and 7/0.
  - split-messages `--check` matches.
  - messages-parity has 0 failures.
  - The new screenshot checks pass 114/0; run against HEAD, they fail 29, so they catch the old layout.

## 0 · Prompt check

- **Two versions of the brief arrived in the same message.** The second is the first plus the wording fix (its step 3) and app-fixes-2 in the checks. I followed the second, the fuller one.
  - Nothing in the two conflicts, apart from the first one's "no other changes", which the second version's wording step replaces.
  - Tell me if you meant only the first.
- **"All 49 locales":** **53** locale files now hold this key, not 49.
  - The 49 are en-GB plus the 48 languages from events-create-2.
  - The languages-world-3 session has since added **bs-BA, fil-PH, mk-MK and sq-AL**, each with the key translated.
  - I checked all 53 and changed the ones that needed it (§2). I left nothing out because of the count.
- **Garbled spans:** none.
- **Contradictions:** none found.

## 1 · Where the button is now

| Place | Before (events-create-2) | Now |
|---|---|---|
| Dark event bar under the tabs: "No event selected" | Select event + **Create event now** (tablet and up) | **Select event** only |
| Dark event bar: "Approve an event to take orders" | Select event + **Create event now** | **Select event** only |
| Orders tab amber box (both messages) | Select event + **Create event now** | **Select event** only |
| Add order amber box "No event selected" | Select event + **Create event now** | **Select event** only |
| **Select event list** | + Create event now at the top or bottom | **Unchanged**: top when nothing approved is on today, else bottom. Disabled offline ("Connect to the internet to create an event.") or when not logged in (the new words). |

The Add order box on a phone still shows; events-create-2 fixed that in passing and it is kept. Its layout is the same box, with one button.

**Code:**
- `app/(app)/dashboard/[token]/page.tsx`:
  - the event bar's create button is removed;
  - the Orders box no longer gets the create props;
  - a dated note was added.
  - `createEventAction` still drives the list (via AddOrderPanel) and the sheet.
- `components/dashboard/AddOrderPanel.tsx`: the no-event box no longer gets the create props. The picker's `createAction` is unchanged.
- `components/dashboard/NoEventBox.tsx`: the create button, its disabled note and its four props are removed. It is now message + "Select event".

## 2 · Wording: "Log in", never "Sign in"

**Other new keys checked.**
- The other 26 keys events-create-2 added (`kitchenModals.createEvent.*`, `errorsKitchen.event_details_invalid` and `errorsKitchen.event_overlaps`): none says "Sign in" in en-GB.
- dashboard-auth-2 and -3 added **no** message keys.
- So only `sign_in_to_create` changed.

**What changed, per language.** Most languages already used their own "log in" word, the same one as their Log in button. Their sentence already says "Log in as a team member to create an event", so it is left as it is. Five files changed:

| Locale | Before | Now |
|---|---|---|
| en-GB | Sign in as a team member to create an event. | **Log in as a team member to create an event.** |
| bn-BD | … সাইন ইন করুন। (transliterated "sign in") | … **লগ ইন** করুন। (its Log in button's word) |
| hi-IN | … साइन इन करें। | … **लॉग इन** करें। |
| ur-PK | … سائن ان کریں۔ | … **لاگ اِن** کریں۔ |
| fil-PH | Mag-sign in bilang team member … | **Mag-log in** bilang team member … (its Log in button says "Mag-log in") |

- No English variant (en-US, en-CA and the rest) overrides this key, so they all show the en-GB words.
- **ne-NP is left as साइन इन.** That is Nepali's own word for logging in on its Log in button and landing page. The app-fixes-2 rule names only Bengali, Hindi and Urdu for this. Tell me if Nepali should change too.
- **Not changed (in docs/):** the fil-PH back-translation (`docs/i18n/back/fil-PH.json`) still gives the old meaning, "Sign in as a team member…". It belongs to the languages session's files and docs/ stays uncommitted. It is a note for reviewers only, and nothing reads it at run time.

## 3 · Unused message keys

- **None became unused.** Every key the boxes and the bar used is still used elsewhere: `createEvent.button`, `createEvent.offline` and `sign_in_to_create` are used by the list; the messages and "Select event" by the boxes.
- Each of the 27 events-create-2 keys was checked against `app/`, `components/` and `lib/`, and each is still read.
- So no keys were removed. `split-messages` was run for the wording change: 5 namespace files regenerated, and `--check` matches (121 namespaces).

## 4 · Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| ESLint, the three changed files | same counts as HEAD (page 79/30, AddOrderPanel 7/5); NoEventBox 0/0 |
| Route checks (`ec2-routes`, in-memory Postgres) | **85 passed, 0 failed** (its wording check now expects exactly "Log in as a team member to create an event.") |
| Rule checks `eo2-unit` / routes `eo2-routes` / offline queue `eo2-drain` | 27/0 · 46/0 · 7/0 |
| **`scripts/app-fixes-2.cjs`** | **55 passed, 0 failed** (was failing on this key) |
| `split-messages --check` | matches |
| `messages-parity` | 0 failed |
| `translation-check`: bn-BD, hi-IN, ur-PK, fil-PH | Structural 0 each |
| `event-types` (pins the NoEventBox on Orders) | 192/192 |
| The 34 harnesses that read the dashboard page, AddOrderPanel, NoEventBox, the picker or this key | 31 pass, including money-sweep-parity's 3038 identical. 3 fail exactly as on HEAD: `cwv-2` (43/1, path freeze), `costs-accounts-1` (77/1), `event-types-render` (the same 4 measurement failures) |
| **Screenshot checks (`ec4-shots`)** | **114 passed, 0 failed** |
| …the same checks against HEAD (a temporary worktree, removed afterwards) | **29 failed**, so the checks catch the old button and the old words |

No screenshots under docs/ were rewritten by the harness run; I checked.

## 5 · Screenshots: `docs/events-create-4/`

**How they were made:**
- The **real dashboard page** (`app/(app)/dashboard/[token]/page.tsx`) is rendered from in-memory fixtures (no database, no network): a GB test truck, today Wed 18 Nov 2026 at 14:07 London, and 18 to 21 events over 10 dates. The real page carries the real bar, boxes and list, and the screens are checked automatically.
- Sizes: laptop 1280×800 and phone 390×844. Language: en-GB. 14 files.

| # | Shows |
|---|---|
| 01 | Orders, no event: dark bar "No event selected" + **Select event**; amber box + **Select event** |
| 02 | Orders, today's events all unapproved: bar "Approve an event to take orders" + **Select event**; box the same |
| 03 | Add order, no event: the amber box with **Select event** (phone: under the bar) |
| 04 | Select event list, nothing approved today: **+ Create event now at the top**, fixed under the approval summary |
| 05 | Select event list, an approved event on today: **+ Create event now at the bottom**, above Done (scrolled to the end) |
| 06 | The list when not logged in: the button disabled, with **"Log in as a team member to create an event."** |
| 07 | The list offline: the button disabled, with "Connect to the internet to create an event." |

**Checked on every shot:**
- no raw key or "undefined";
- no "Sign in";
- no sideways scroll;
- every "Create event now" is inside the Select event list.
- Box shots: no create button at all; the bar's only button is "Select event", and its message is right; exactly one amber box, with "Select event" only.
- List shots: exactly one create button, visible, at the expected end, fixed outside the scrolling list; the list scrolls; the enabled or disabled state and note are right.

**Two things in the shots are artefacts of the static render, not the app:**
- the HatchGrab logo shows as broken-image alt text, because there is no asset server;
- the orange "Keep screen on" banner is there because the fixture device has no keep-awake setting.

## 6 · Hard rules

- Pizzeria Gusto and Le Roi du Churrasco were not touched or read.
- No database reads or writes, and no SQL was run, so there is none to show.
- No push or deploy. No landing-page changes. No .env files opened.
- **No other changes:** the commit holds only the three dashboard files, the five locale files and their five namespace files (13 files).
- `docs/languages-world-2/handover/tr/ca-AD/TERMS.md` is modified in the working tree by the parallel languages session. I did not touch or commit it.

## 7 · Click-through on localhost (test-truck)

Restart the dev server after `rm -rf .next/dev`, so the new wording loads.

1. Log in as a team member of test-truck, with no approved event today.
   - Orders: the dark bar and the amber box each show **Select event** only.
   - Add order: the same.
2. Tap **Select event**. "+ Create event now" is at the top of the list.
   - Approve or start an event for today and reopen the list: the button is at the bottom.
3. Open the dashboard link in a private window (token only). In Select event, the button is disabled with "Log in as a team member to create an event."
4. Go offline (devtools → Offline). The button is disabled with "Connect to the internet to create an event."
