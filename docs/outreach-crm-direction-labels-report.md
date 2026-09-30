# One icon and one word on every history row

**30 September 2026 · commit `e42cfef` · deployed and serving on production at 19:27:18Z**

Built on [the polish report](outreach-crm-polish-report.md). One change, everywhere the history is
shown.

---

## What it was

Four vocabularies for one idea:

| Row | Before |
|---|---|
| email I sent | `↗` |
| email they sent | `↙` **and a green row background** (`#ecfdf5`) |
| call | `☎` |
| WhatsApp | `WA` |
| note | `✎` |
| stage change | `·` |
| the reading panel's header | a green **RECEIVED** in its own style |
| Today's replies list | a green row background |

🔴 **Two of those are not labels at all.** The arrows mean "sent" and "received" only once somebody
has told you so, and they render at whatever size and weight the platform's font decides — they are
not even the same width on macOS and Windows. And the green row was a **colour doing the work of a
word**: it is lost in a greyscale print, to a colour-blind reader, and on a phone in sunlight.

## What it is

```
✉  Sent        16 Sep   Re: Ordering costs · Are you still taking orders by phone?
✉ [RECEIVED]   15 Sep   Re: Ordering costs · Yes please — how do I sign up?      Waiting
☎  Call        14 Sep   Call · rang, no answer
✎  Note        14 Sep   Note · he is at Boxpark on Fridays
⇄  Stage       14 Sep   Stage contacted → replied · Reply received
```

| Entry | Icon | Word |
|---|---|---|
| email I sent | envelope | **Sent** |
| email they sent | envelope | **Received** — a small pill, bold dark text |
| call | phone | **Call** |
| WhatsApp | speech bubble | **WhatsApp** |
| note | pencil | **Note** |
| stage change | two arrows | **Stage** |

- **One function**, `rowLabel` in `lib/outreach-timeline.ts`, maps an entry to `{ icon, word, pill }`.
  🔴 It returns an icon **NAME**, not a component: that module is pure and is compiled by a harness
  with no React in it, and it is also what leaves a row **nowhere to put an icon of its own**.
- **One component**, `components/admin/outreach-icons.tsx`, holds the five paths — 14px,
  `stroke="currentColor"`, 2px round joins, `viewBox="0 0 24 24"`: the outline style this app already
  uses (`EventListCard`, `DemoGetStarted`). No emoji, no unicode.
- **One fixed-width column** (`w-[5.5rem]`), set in that component and nowhere else, so the rows line
  up. A row that sized its own label column is a row that does not.
- **"Received" is the only pill**, in bold dark text on grey — a reply is the row you are looking
  for, and it survives everything the green did not.
- **Rows waiting for a reply keep their existing "Waiting" badge**, untouched.
- The **reading panel header** and **Today's replies list** use the same cell, from the same
  function. `messageRowLabel(direction)` serves the two places that have a direction but no timeline
  entry. ⚠️ It is not called `directionLabel` — `lib/outreach.ts` already exports one of those, and
  two functions with one name, one returning an object, is how a file renders `[object Object]`.
- The **contact popout's** green direction chip went the same way, which let `INBOUND_BG` be deleted
  outright rather than left for something to reach for.

🔴 **Display only.** Nothing stored changes, and nothing reads any of this back.

---

## The harness

`scripts/outreach-crm-polish.cjs`, extended — **83 checks**, **12 broken variants**.

```
✓ FAILED as required  V11 🔴 the arrows are back on the email rows
✓ FAILED as required  V12 🔴 one row type draws its own icon outside the function
…
✓ 🔴 an email I sent — envelope, "Sent", plain
✓ 🔴 an email they sent — envelope, "Received", and it is the ONLY pill
✓ 🔴 a call — phone, "Call"        ✓ 🔴 …even when it is stored as `reply`
✓ 🔴 a WhatsApp — chat, "WhatsApp" ✓ 🔴 a note — pencil, "Note"
✓ 🔴 a stage change — arrows, "Stage"
✓ ⚠️ a hand-logged EMAIL contact reads as the email it was
✓ ⚠️ an unrecognised channel is still a contact, and says so
✓ 🔴 every entry type is covered — no row can fall through to nothing
✓ 🔴 no glyph icons anywhere in the history, the panel or Today
✓ 🔴 …and `rowIcon` is gone, so a row has nowhere to reach for one of its own
✓ 🔴 the green row background is gone from every surface
✓ 🔴 every history row renders through the ONE function   (three call sites, all identical)
✓ 🔴 …the reading panel through the same one   ✓ 🔴 …and Today's replies list too
✓ ⚠️ the icons are one size and one stroke, in the style this app already uses
✓ 🔴 …and there are exactly five paths, no emoji and no unicode arrows
✓ 🔴 the label column is a fixed width, in one place
✓ ⚠️ "Received" is a pill in bold dark text, not a colour
✓ ⚠️ a row waiting for a reply keeps its own indicator

✅ all 83 passed
```

⚠️ **The ban is the whole glyph vocabulary, not just the arrows** — `↗ ↙ ☎ ✎ ✉` are all refused in
the markup, because a row reaching for an icon again would reach for one of those. `→` is
deliberately **not** on the list: the stage row reads "Stage contacted → replied", where the arrow is
a word.

### Stale check, restated in place

`outreach-workspace-v4.cjs` — *"the header carries direction, from, to, date and subject"* pinned the
panel's own green `'Received' : 'Sent'`. The rule is unchanged and is stronger for the two screens
agreeing; it now pins the shared cell.

---

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 5.0s` |
| eslint — all six changed/new files | **identical to HEAD** (`outreach-icons.tsx` 0/0) |
| `node scripts/outreach-crm-polish.cjs` | **83 checks, all passed**, 12 variants caught |
| `node scripts/run-harnesses.cjs` | **72 run · 72 passed · 0 failed** |
| goldens | `8bdae817…` and `e3f0a880…` ✅ unchanged |

No SQL, no database change, no template row touched, no email sent. One send path, one contact
writer, one follow-up writer, one `nextStep` per page, every sequence guard, `EMAIL_FRAME_SANDBOX`
unchanged.

Fingerprint `d4cb07b3…` at push → `571be61b…` at **19:27:18Z**.

---

## What to test

**Viewing only** — nothing here writes or sends.

1. **ZZ Test Prospect** — the History rows all start at the same place: an icon, then a word, then
   the date. No arrows anywhere.
2. A **received** email shows **RECEIVED** as a small dark pill, and the row has **no green
   background**. A row still waiting for you keeps its **Waiting** badge beside the subject.
3. Open a received email: the **panel header** shows the same envelope and the same **RECEIVED** pill.
4. **Today** → **Replies waiting**: the same label on each row, and no green rows.
5. A **call** row reads `☎ Call`, a **note** reads `✎ Note`, a **stage change** reads `⇄ Stage` — and
   the columns line up down the whole list.
6. On the **iPhone**, the same labels, and the rows still line up.
