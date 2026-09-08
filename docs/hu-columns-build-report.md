# Hatches Up columns — build complete (Part B execution)

**Inputs (not re-derived):** `docs/reference-manual.md` V12.1 and `docs/hu-columns-report.md` (55-truck table + near-matches).
**Verification split — read this first.** The **database** steps (A/B/C) were run against live data via the service-role key and **read back from the tables** — those numbers below are observed, not planned. The **page** (steps D/E) is **code only: no admin session was obtainable (the five prior failures still hold; I did not get a sixth), so the UI is not verified against live data.** tsc is clean, but per your rule that is not verification of behaviour.

---

## STEP A — schema read back (checked before writing)

Selected `hu_map, hu_ordering, whatsapp_confirmed` from `outreach_prospects`:
- **hu_map** and **hu_ordering** — exist (selectable), **nullable** (all 176 rows returned NULL), and **boolean** (confirmed in step C: `true` writes were accepted and read back as `true`, not a string or an error).
- **whatsapp_confirmed** — now **NULL on all 176 rows**. It was `NOT NULL default false` (all-false) last turn, so it is now **nullable** and the defaults were normalised to NULL. This means the `20260903_whatsapp_confirmed_nullable.sql` I proposed for the step-4/E contradiction **was also applied** — so the contradiction I flagged is **resolved**, and step E's "untick → NULL" is now possible. (Observed from the data; flagging it since your message named only the hu_map/hu_ordering migration.)

## STEP B — the 55 created (read back)

| | discovery_trucks | outreach_prospects |
|---|---|---|
| before | 176 | 176 |
| inserted | **55** | **55** |
| **after (read back)** | **231** | **231** |

Each new discovery row was created with **`name` only** — no cuisine, website, contact details, aliases, and **`excluded` not set** (column default). One `outreach_prospects` row created per new truck, so all 231 trucks still have exactly one prospect. **No dedup/merge/alias applied** — created as given, including **Eat Is Greek** (left for you to resolve against the existing *Eat Greek*). Verified: **no duplicate names** exist in `discovery_trucks`.

## STEP C — the backfill (read back from the table)

| column | true | false | null |
|---|---|---|---|
| **hu_map** | **121** | **0** | 110 |
| **hu_ordering** | **19** | **0** | 212 |

- **hu_map = 121** = the 66 (37 matched list entries + 29 existing HU `order_url` rows not on the list) + the 55 newly created rows (every one came off the HU map). Nothing else touched.
- **hu_ordering = 19** = the 15 `uses` trucks that already had a prospect row + the 4 `uses` trucks newly created (Barista Boy Coffee Co, Kerbside Kitchen, Saffron Fish Co, Spice & Rice).
- 🔴 **Nothing set to false.** `listed_only` and everything unseen stays NULL.
- Spot-checks (read back): the 4 new `uses` → `hu_map=true, hu_ordering=true`; a new `listed_only` (TEXBBQZ) and a not-on-list existing row (Burger Art) → `hu_map=true, hu_ordering=null`; existing matched `use` **Tikka Tonic** → `hu_map=true, hu_ordering=true`.

## STEP D — the two HU columns (code)

`app/admin/outreach/page.tsx`: the single "Hatches Up" tickbox (over `platform`) is **retired**; two independent columns **"HU map"** (→ `hu_map`) and **"HU ordering"** (→ `hu_ordering`) via a shared `TriStateBox`. Three states, never collapsed:
- **true** → filled ✓ checkbox.
- **null** → empty box ("not checked").
- **false** → a distinct **rose ✗** beside the box — deliberately *not* the empty box, so NULL (nobody looked) and false (checked, absent) read apart at a glance if false ever appears.
- 🔴 **Ticking writes `true`; unticking writes `null`, never `false`** — enforced in the component (`onChange → checked ? true : null`) **and** re-enforced in the route (`body === true ? true : null`).
- Both columns **sortable, nulls last** (tri-state rank true=2/false=1/null→last, through the existing `compareBySort`).
- **`platform` and its values are left untouched** in the DB (no read, no write) — the earlier scrape's record is preserved; it simply has no control on the page any more.

## STEP E — the WhatsApp tickbox (code)

The WhatsApp column is now **tickable**, writing **`outreach_prospects.whatsapp_confirmed` only** (never a new field, never the scraped hint). Three visible states (`WhatsAppBox`):
- **confirmed** (`whatsapp_confirmed === true`) → solid ticked green box.
- **suggested** (not confirmed **and** scraped hint = `advertises`) → an **amber, dashed/ringed empty box with a "?"** — the scraper's suggestion I have **not** confirmed; visibly distinct, does **not** read as confirmed.
- **plain** (not confirmed, no advertise hint) → plain empty box.
- 🔴 **Tick → `true`; untick → `null`** (component + route). The scraped hint (`discovery_trucks.accepted_methods` → `whatsappHint`) stays read-only and only *styles* the unconfirmed box.
- **`whatsapp_number` and its editor remain in the row detail**, unchanged. The detail "WhatsApp confirmed" checkbox writes the same field, tri-state-consistent.

Route (`app/api/admin/outreach/route.ts`): GET now returns `hu_map`/`hu_ordering`; POST allow-list adds them and switches `whatsapp_confirmed` to the same `true`-or-`null` rule. No CHECK, no schema change from the app.

## COLSPAN / housekeeping
The table now has 10 columns + actions; the empty-state and detail-row `colSpan` were set to 11.

## FLAGS
- **No garbled text; no unresolved contradiction.** The prior step-4 contradiction (whatsapp_confirmed NOT NULL vs untick→NULL) is **resolved** — the column is now nullable (observed).
- **What was written to the DB, and verified by read-back:** 55 discovery_trucks + 55 outreach_prospects created (→ 231/231); hu_map=true on 121 rows, hu_ordering=true on 19; **zero rows set to false**; `discovery_trucks.excluded` not touched; `platform` not touched.
- **What is NOT verified:** the page itself — **no admin session (five failures still hold, not retried)**, so the columns/tickboxes are not confirmed working against live data. Only that the code compiles and reads correctly.

*Part B execution complete, 2026-09-03. DB work verified by read-back; page work is code-only and unobserved.*
