# Outreach page — UI fixes + WhatsApp backfill

**Scope:** `app/admin/outreach/page.tsx` and `app/api/admin/outreach/route.ts` only (plus two DB writes you authorised). **Change nothing else** — honoured.
**Verification split:** the **DB** work (schema probe, WhatsApp backfill) was run against live data and **read back**. The **page** is **code only** — no admin session was obtainable (the six prior failures still hold; I did not get a seventh). tsc is clean; per your rule that is not behavioural verification. You said you'll verify the UI on localhost yourself.

---

## 🔴 CORRECTION — I re-checked, and I was wrong before

My last report claimed `whatsapp_confirmed` was nullable and inferred it from "all rows read NULL". **That inference was unsound** — a uniform/empty result is not a schema fact, exactly as you said.

**What I could and could not read now:** a literal `information_schema` read is **not reachable from here** — PostgREST rejects the `information_schema` schema (`Invalid schema: information_schema`), there is no direct Postgres connection in the env (no `DATABASE_URL`/password; the service-role key is a PostgREST JWT), and no `psql`/`pg`. So I could not run `SELECT is_nullable, column_default FROM information_schema.columns`.

**What I did instead — a constraint probe (authoritative for nullability):** updated one row's `whatsapp_confirmed` to NULL and read the outcome, then restored it.
- **Result: the NULL write was ACCEPTED → the column is NULLABLE now** (your hand-applied migration took effect). Distribution at that point: all 231 rows NULL.
- ⚠️ **Limit I'm stating plainly:** the probe proves nullability but **cannot read `column_default`** — I can't confirm the default was dropped, only that NULL is now permitted. If the default still matters to you, that needs a real `information_schema` read from a client that has one.

---

## 1. WhatsApp: "advertises" → confirmed, and the "?" removed

- **Backfill (read back):** set `whatsapp_confirmed = true` for every row whose scraped hint is `advertises` (447 mobile **and** `accepted_methods` contains "whatsapp", via the same `lib/whatsapp-hint.ts` logic). **30 rows set to true.** Read back: **true = 30, null = 201** (231 total). Nothing set to false.
- **UI:** the amber **"?" suggested state is gone**. The WhatsApp box is now **two states only** — ticked (`true`) or empty (`NULL`). Ticking writes `true`; unticking writes `NULL` (nullable now); the route re-enforces `=== true ? true : null` so `false` is never written. So a scraped-WhatsApp truck now simply shows **ticked**.

## 2. Excluded removed from the page

- **No "excluded" chip on any row; header reads the truck count alone** (`{n} trucks`) — the "· N excluded" text is gone. Nothing on the page references `excluded` any more.
- **`discovery_trucks.excluded` is not touched**, and the page that gates the public site is not changed. (The route still *fetches* `excluded` as inbound data; it is simply never rendered — removable later if you want it gone from the payload too, but I left the plumbing untouched to avoid changing anything beyond the ask.)

## 3. Checkboxes centred

All three tick boxes use the SAME orange (`accent-orange-600`) — the WhatsApp box was `accent-emerald-600` and is now orange to match HU map / HU ordering.

WhatsApp, HU map and HU ordering cells are `text-center`, and their **headers** are centred too (so column label and box align). Name/email/schedule etc. stay left.

## 4. Column widths do not change on sort — mechanism

**`table-layout: fixed` (Tailwind `table-fixed`) plus an explicit `<colgroup>` with a fixed `px` width per column.** With fixed layout the widths are taken from the colgroup, **not** from cell content, so re-ordering rows on a sort cannot resize a column. Cells also carry `truncate` so long values are clipped within their fixed width rather than pushing it. This is a layout-level fix, **not** cell padding.

## 5. No pagination — all 231 rows, kept responsive

- Pagination (state, slice, Prev/Next) **removed**; `tbody` renders **all** of `visible`. Paging is not reintroduced.
- **What keeps it responsive:** one **vertical scroll container** (`max-h-[calc(100vh-9rem)] overflow-auto`) with a **sticky `<thead>`**, so the browser manages a single scroll region instead of a growing page; and **`Row` is `React.memo`'d with stable (`useCallback`) `onOpen`/`onPatch`**, so a single-cell edit re-renders only the row whose `p` changed, not all 231. At 231 rows this is well within the DOM's comfort zone, so **no virtualisation** was added.

## 6. "Open" now opens a MODAL — following the project's existing convention

- The inline row-expansion (`<tr>` detail) is gone; **"Open" sets `modalId`**, and a single modal renders the existing `Detail` (email, WhatsApp number + editor, notes, next-action, contact log/history) for that prospect, looked up live by id so optimistic edits show.
- **How the existing modals handle outside-click — I checked, and there are TWO conventions:**
  - **Gate/confirm modals do NOT close on outside click** — `RejectOrderModal`, `EventCancelModal`, `ExtraWaitModal`, `DealsModal`, `PaymentActionsModal` all use a backdrop `<div className="fixed inset-0 …">` with **no `onClick`**; dismissal is an explicit button (and the Android hardware back on native).
  - **Picker/menu modals DO close on outside click** — e.g. `EventActionsModal` / `EventFinishTimeModal` use `onClick={e => e.target === e.currentTarget && onClose()}` on the backdrop.
- **Mine follows the gate/confirm one, as required:** backdrop is `fixed inset-0 bg-black/50 z-50 flex … justify-center` with **no `onClick`**, so **an outside click does nothing** — dismissal is the explicit **✕ Close** button only. It is **conditionally mounted** (fresh mount each open, so `Detail`'s fields reset), and like those modals it adds **no in-component focus-trap or scroll-lock** — matching the pattern rather than inventing a new one. **Confirmed: mine matches `RejectOrderModal`/`EventCancelModal` on the no-outside-click point.**

---

## FLAGS
- **No garbled text; no unresolved contradiction.** The prior nullability contradiction is resolved (column nullable now, confirmed by probe).
- **DB writes this turn (authorised), verified by read-back:** `whatsapp_confirmed = true` on 30 rows (advertises); nothing set to false; one probe row set NULL and restored. `discovery_trucks.excluded` not touched; no rows created; hu_map/hu_ordering not re-touched.
- **Could NOT do as literally asked:** read `information_schema` — unreachable from this environment (explained above); used a constraint probe instead and reported the actual result.
- **Page NOT verified live** — no admin session (six failures still hold, not retried). tsc clean only. You will verify on localhost.

*2026-09-03. DB steps verified by read-back; page steps are code-only and unobserved.*
