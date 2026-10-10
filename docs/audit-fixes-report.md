# Audit fixes — discount codes off the public menu (D31), event deal ownership (D32), fixed discount cap (D34), printed accents (D38 option 1)

**10 October 2026 · branch `main` (HEAD `f4bd277` + the uncommitted tree) · not committed · not pushed · not deployed · no SQL written or run · no `.env*` opened · no email sent · Pizzeria Gusto and `outreach_templates` untouched**

All four fixes from `docs/phases-3-6-audit-report.md` are made.
- **The method:** the same as every earlier phase. A BEFORE snapshot was captured on the unchanged code (`scripts/fixtures/audit-fixes-before.json`, deterministic). Every output now matches it except the three named differences, each proven on its own.
- **No SQL was needed.**
- **Brief:** nothing arrived garbled, and no instruction contradicted another.
- **One wording point, flagged rather than chosen:** named difference 3 lists emoji among the things that now "print the plain-letter version instead of '?'". An emoji has no plain-letter form, so it still prints "?". What changes for a line with an emoji is that its price now sits in the right-hand column (below). The table in the brief gave no emoji mapping, so none was invented.

---

## Fix 1 — D31: no discount codes on the public menu

**Every reader of the `codes` field** of `/api/menu/[truckId]`:

| Reader | Used it? |
|---|---|
| Customer order page `app/trucks/[slug]/order/page.tsx` | **No.** Its `applyCode()` (`:1803-1808` before) looked a typed code up in `menu.codes`, but **nothing called it**: there is no code box, and `discountInput` was never set. `appliedCode` is always null |
| Operator dashboard `app/dashboard/[token]/page.tsx:1087` (`/api/menu/…?dashboard=1`) | No. The walk-up panel passes no code (`AddOrderPanel.tsx:551-555`) |
| Native iPad / Android apps | No. They load the hosted web pages; nothing native reads the menu |
| `lib/menu-loader.ts` (an old Google Sheets loader with its own `codes`) | Not a reader of this route, and imported by nothing |

**Because nothing in the browser needed them, they are simply no longer sent:**
- `app/api/menu/[truckId]/route.ts` no longer reads `discount_codes_db` at all (one database read fewer on every menu load) and no longer emits `codes`.
- On the order page:
  - the unused `applyCode`, `discountInput` and `discountError` are removed;
  - `codes` is removed from its `TruckMenu` type, so `tsc` would name any reader left;
  - `appliedCode` stays (always null), so the basket's "Code:" line and the submit field keep their shape.
- A one-line comment says why its setter is unused, keeping lint at its count.

**The server is still the only judge of a code.**
- `app/api/orders/submit/route.ts:434-445` looks the typed code up in `discount_codes_db` for **this truck**, **active only**.
- That database row is what `repriceOrder` prices with. The browser sends only the code's text.

**The operator's own codes:** they come from the Manage GET (`app/api/manage/route.ts:324`), which reads them only after the signed-in access check (`resolveTruckAccess`). It is unchanged.

**Named difference 1:** the `/api/menu` response no longer carries `codes`. The rest of the response is byte-identical.

## Fix 2 — D32: `update_event_deal` ownership

**The fix:**
- `app/api/manage/route.ts` `update_event_deal` now reads the event **scoped to the token's truck** (`truck_events` where `id = eventId` and `truck_id = truck.id`) before writing.
- If there's no such event, it answers `{ error: 'Event not found' }` with status 404 and writes nothing.

**Why that error:** `upsert_event` has no explicit not-found reply; it scopes its writes instead. So the shape is the one the same route already uses for a not-yours event, in `private_link` (`:999`, same query shape, same words, same status).

**Bundle ownership:** the bundle id is still not checked against the truck. The brief named the event only. A follow-up could check `bundles_db.truck_id` the same way; listed under *Left as found*.

## Fix 3 — D34: a fixed discount capped at the subtotal

**The change:** `lib/order-calculations.ts`: `discountAmt = Math.min(discountCode.value, subtotal)` for a fixed code.
- **Totals:** unchanged (they were already floored at zero).
- **Every path:** the stored `discount_amt` can no longer claim more than was taken off. Every order path prices through this one function (via `repriceOrder`): customer orders, walk-ups and operator edits.
- **Percentage codes:** untouched.

**Named difference 2:** `discount_amt` is lower only where a fixed code exceeded the subtotal.

## Fix 4 — D38 option 1: printed accents

**The fold.** `lib/printing/ticket.ts` `printableText` now:
1. normalises to NFC;
2. applies the table: ß→ss, æ→ae, Æ→AE, ø→o, Ø→O, œ→oe, Œ→OE, curly single and double quotes → straight, en and em dash → "-", "…" → "...", € → "EUR";
3. normalises to NFD and strips the combining accents (U+0300–U+036F);
4. prints "?" only for what is still outside plain ASCII.

"£" stays as itself, byte 0xA3. `ESC t 16` is sent exactly as before. No code-page option or setting was added.

**Cleaned before layout.**
- `buildTicketLines` now runs every string of the ticket order through the same fold **before** `wrap()` and `padBetween()` measure anything.
- So an emoji, which is two UTF-16 units but one printed "?", no longer makes a line one column short.
- The layout copy keeps line breaks and tabs, because `wrap()` splits on them. Everything else follows the printing rule exactly.
- `strBytes()` still derives from `printableText`, so there is one rule.

**The preview.** `components/printing/TicketPreview.tsx` still goes through `printableText`; its comment now describes the fold. Since the lines it gets are cleaned before layout, its columns match the paper's too.

**Named difference 3:**
- Tickets with accented letters, curly quotes, dashes or "…" print plain letters instead of "?".
- A line holding an emoji keeps its price in the right-hand column. The emoji itself still prints "?".

## Proof

**New harness:** `scripts/audit-fixes.cjs` (registered), 54 checks. It runs the real menu route, `calculateOrderTotal`, `repriceOrder`, the Manage route's `update_event_deal` (`scripts/_fake-pg.cjs`, real writes) and the ticket renderer.

| Check | Result |
|---|---|
| **Fix 1** | ✅ BEFORE: the Pizza Kitchen menu sent both active codes with their values (`TENOFF` 10 %, `FIVER` £5), on the customer read and on the dashboard read. AFTER: no `codes` field and no code string anywhere in either response, and each response is otherwise **byte-identical** to BEFORE. `/api/menu` no longer reads `discount_codes_db`; the order page no longer reads `menu.codes`. Submit: the code is looked up by the server in `discount_codes_db` (this truck, active only) and that row prices the order; the browser's subtotal, discount and total are never used. `repriceOrder` with the browser sending every line at 1p still prices from its own book, identical to BEFORE for every code. An unknown or inactive code (no active row, so null) takes nothing off. The Manage code list is read only after the access check |
| **Fix 2** | ✅ Own event: the same answer and the same `event_deals` row as BEFORE. Another truck's event id: **404 "Event not found", nothing written**. An unknown id: the same refusal |
| **Fix 3** | ✅ All 10 `calculateOrderTotal` cases are identical to BEFORE except one: a £5 code on a £3 order stored **£5** against a £0 total, and now stores **£3** against £0, with nothing else on that order moved. Normal codes (10 %, £2, £5 and £3 on £15.50; 10 % and £2 on £3) are byte-identical. `repriceOrder` caps the same way |
| **Fix 4** | ✅ A UK ticket of plain ASCII and £ is **byte-identical** to BEFORE at 58 mm and 80 mm, and so is a EUR ticket (still "EUR 7.00"). `printableText`: "Jalapeños"→**"Jalapenos"**, "José"→**"Jose"**, "Crème brûlée"→**"Creme brulee"**; "£12.50" and ASCII untouched (BEFORE: "Jalape?os", "Jos?", "Cr?me br?l?e"). The accented ticket prints "Jose Muller", "1x Jalapenos Poppers", "+ Extra jalapenos", "2x Creme brulee", "\"No sugar\" - thanks...", "Smorrebrod & AEble OEuf Strasse" and "Cafe ole - please!", with no "?", only ASCII bytes plus 0xA3, and `ESC @`, `ESC t 16` unchanged. The emoji ticket: every item line is exactly 32 / 48 columns with its price at the right edge; each emoji prints one "?"; on paper "1x ? Hot wings" ends in "£7.00" at column 32. BEFORE, the two emoji lines printed one and two columns short |
| Client bundles after `next build` | ✅ No chunk holds `discount_codes_db`, "Code not recognised", `menu.codes`, `codes.find`, the fixture codes, `country_settings`, `SUPABASE_SERVICE_ROLE_KEY` or `STRIPE_SECRET_KEY` |
| `tsc --noEmit` | ✅ clean |
| eslint, the 6 touched files vs HEAD | ✅ No rule grew. Errors 73 → 71, warnings 34 → 31 |
| `next build` | ✅ exit 0 |
| Harness sweep (107 files) | ✅ **107 / 107 passed.** The first run failed four existing harnesses, each pinning something these fixes change on purpose; each now names the change and checks everything else exactly (below). The sweep was re-run clean |

**Existing harnesses that pinned what these fixes change on purpose.** Each now names the change and still checks everything else exactly:
- **`event-pricing`** compares the menu route line by line with an older commit. The D31 lines (the code read and its emit) are excused **by count**, with a companion check that the menu neither reads nor sends codes.
- **`event-types`** requires the calculator to be byte-identical to a named parent. The one D34 line is put back to its old form before comparing.
- **`printing-escpos-identity`** compares ticket bytes with HEAD, and its fixture holds "José". HEAD is now fed the folded "Jose" and the working tree the original, and the bytes must be identical. A control proves that without the fold they differ.
- **`money-sweep-parity`** (GB, and the by-hand `--usd` mode) compares ticket leaves. Its fixture's "Jalapeños" is the only change: byte 0x3F → 0x6E. That one fold is put back before comparing. All 3,057 strings and byte streams otherwise identical, and USD still differs from GB by its symbol only.

## Left as found

- **`update_event_deal` doesn't check the bundle.** It accepts any `bundleId` (on the truck's own event). The brief named the event only; the same scoped read on `bundles_db` would close it.
- **No code box on the order page.** Customers can't enter a code anywhere today, which is why nothing broke. If one is added, it should send the typed text and show the server's answer; it must never look codes up in the browser.

## Rules kept

| Rule | |
|---|---|
| No SQL written or run | ✓ none needed |
| main as checked out; never push or deploy; no process killed | ✓ |
| No `.env*` opened; no email; no `outreach_templates`; Pizzeria Gusto untouched | ✓ fixtures only (Pizza Kitchen ids) |
| No visible change except the named differences | ✓ three, each proven the only one |
