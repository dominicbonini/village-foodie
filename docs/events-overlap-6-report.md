# events-overlap-6: every event its own card, plus two fixes

**17 Nov 2026. Done. Dashboard Select event list only;** the questions are unchanged and nothing customer-facing changed.
- All checks pass.
- Screenshots are in [docs/events-overlap-6/](events-overlap-6/). I checked all 16 for raw keys and "undefined": **none found**.
- No data was created, changed or deleted.
- Nothing was committed, pushed or deployed.

## 1. The two fixes

### What you saw on localhost, and why
- **What you saw:** raw keys (`kitchenModals.picker.approvalSummary`, `approvalSummaryNote`, `duplicateSameTime`), and a badge reading **"Needs approval (undefined)"**.
- **Cause: a stale catalogue on the running dev server, not missing keys.**
  - "Needs approval (undefined)" is the *previous* round's wording for that key, "Needs approval ({count})".
  - It was being rendered by *this* round's code, which passes no count.
  - So your server had hot-reloaded the new component code but was still serving the earlier messages.
  - next-intl **precompiles** the message files (next.config.ts, `experimental.messages.precompile`), and a running `next dev` kept the copy it compiled earlier.
  - The raw keys are the keys that copy didn't have yet.
  - The files themselves were already right on disk, and `split-messages --check` was in step.
- **What to do, on localhost:** stop the dev server, then
  ```
  rm -rf .next/dev
  npm run dev
  ```
  then reload the dashboard.
  - The dashboard's service worker caches only `/api/dashboard` and `/api/events/manage` data, images and fonts, not JS, so it plays no part.
  - A production build compiles the messages fresh, so this is a dev-only effect.
  - It is saved in memory so I flag it after any message edit.

### What I checked
1. **Every key the list and questions use exists in all 49 language files.**
   - That is 22 keys, read from the code itself (`EventPickerPanel.tsx`, `EventGateDialogs.tsx`).
   - The check covers en-GB and the 48 language files, in the generated per-namespace files the app actually loads.
   - **Missing: none.**
2. **Every key renders as words through the app's own pipeline.** I ran next-intl's precompiler (`icu-minify/compile`) and its browser formatter (`icu-minify/format`) on the current generated files, in en-GB and fr-FR, with the values the components pass (singular and plural where relevant). **All render as words, with no "undefined" and no braces.** Some results:
   - "4 events need approval" / "1 event needs approval"; "Customers can't see them yet." / "…see it yet."
   - "Possible duplicate · same time"; **"Needs approval"**; "3 orders" / "1 order" / "No orders"; "3 events" / "1 event"
   - fr: "4 événements à approuver", "Les clients ne le voient pas encore.", "Doublon possible · même horaire", "À approuver", "3 événements"
3. **The badge uses its own key with no count:** `picker.needsApproval` = "Needs approval", called as `t('picker.needsApproval')`. No other count-less call in the list or questions uses a key with a placeholder. The screenshots' full text contains no "undefined".

## 2. Every event is its own card
[components/shared/EventPickerPanel.tsx](../components/shared/EventPickerPanel.tsx), the dashboard's `groupByDate` view. The KDS's flat list is unchanged.

- **Cards:** every event is a separate card with its own border and rounded corners, and 8 px (`gap-2`) between cards. The joined block is gone.
- **A duplicate card:**
  - is indented **22 px** and has an **amber border** on a **light amber background**;
  - is linked to the approved card above by a **2 px amber connector**. The connector drops from the approved card across the gap and curves into the duplicate's left side. With several duplicates, the line carries on down to each one.
  - Its **top line** is a small amber label, **"↑ Possible duplicate · same time"** (or "↑ … · overlaps"). Then the time range with the solid **"Needs approval"** badge, then the venue.
  - It shows an order pill only with 1 or more orders. (The ↑ is markup, not part of the translated label.)
- **Selected:** a **2 px orange border** and **"SELECTED"** on that card only.
- **Date headings** show the day's count on the right in muted grey: **"3 events"**, **"1 event"** (next-intl plurals, new key `picker.dayCount`). Duplicates are counted: today shows 3 (Harnessville Sports Club + 2 duplicates); Thu 19 Nov shows 4.
- **An unapproved event with no approved overlap** stays a normal card with a **4 px amber left border** and the "Needs approval" badge.
- **Unchanged:** the summary box, date grouping, sort order, order pills, and tapping a card (the same handler, so the same question).

## 3. Languages
- **New key:** `kitchenModals.picker.dayCount`, "{n, plural, one {{count} event} other {{count} events}}".
  - It is in all 49 files, each re-read right before writing, and uses each language's own plural categories (e.g. Polish 1 wydarzenie / 3 wydarzenia / 5 wydarzeń; Slovenian dual "2 dogodka").
  - It is registered in `scripts/_messages-parity-1e.cjs`, and split-messages was run.
- **No other key changed this round.**
- **Memory updated:** the incoming languages from the languages job need 26 keys now.

## 4. Checks (all pass)

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| Rule checks | 27/27 |
| Route checks | 46/46 |
| Offline queue | 7/7 |
| `split-messages --check` | in step (121 namespaces) |
| `messages-parity` | 1,230,657 passed, 0 failed |
| `translation-check`, 48 languages | Structural 0 in every one |
| Keys used vs files (49 × 22) | none missing |
| Precompiled rendering, en-GB + fr-FR | every key renders as words |
| Screenshot text scan (16 screens) | no raw key, no "undefined" |
| ESLint, EventPickerPanel.tsx | clean |

## Screenshots: [docs/events-overlap-6/](events-overlap-6/), 16 files

Each name exists at `phone390` and `laptop1280`, in en-GB and fr-FR.

**Data:** test-truck's existing test data, **read only**, unchanged since last round.
- Harnessville Sports Club is started with 3 orders.
- HSC and Harnessville SC are both unapproved, with "Keep" already chosen for each.

**How they were made:** real components, as in the last rounds.
- **The CSS was compiled fresh from today's source** (the project's own `@tailwindcss/postcss`).
- My first render used the 16 Nov build's CSS, which doesn't contain this round's new arbitrary classes (`ml-[22px]`, `h-[calc(50%+8px)]`…). The indent and connectors didn't show there, though they do in the running app.
- Those images were replaced. That pitfall is now in memory too.

| File stem | Shows |
|---|---|
| `01-event-list-top` | Summary "⚠ 4 events need approval / Customers can't see them yet." · **TODAY · TUE 17 NOV** with **3 events** on the right · Harnessville Sports Club (2 px orange border, Live, 3 orders, SELECTED) · two indented amber cards joined by the connector: "↑ POSSIBLE DUPLICATE · SAME TIME", Harnessville SC and HSC, each "Needs approval" · **TOMORROW · WED 18 NOV · 1 event**: Market Square |
| `02-event-list-bottom` | **THU 19 NOV · 4 events**: EO2 check Live (5 orders) with its duplicate EO2 check Dup connected below · EO2 check Other and EO2 check Start (Finished) · **FRI 20 NOV · 1 event**: EO2 check Lone (4 px amber edge, Needs approval, No orders) |
| `00-event-list-full-height` | The whole list in one image |
| `03-tap-HSC-duplicate-card` | "Approve HSC?" / "HSC is a possible duplicate of Harnessville Sports Club, which is already approved. Approve it to take orders? Customers will see it too." · Approve / Cancel (HSC was dismissed, so this is the after-Keep question) |

## Test data
**Unchanged:** 10 events and 13 orders on test-truck. The delete command and the `--rescan` step in docs/events-overlap-3-report.md §2 still apply.

## Prompt check
- **Nothing arrived garbled, and no instruction contradicted another.**
- **"Make sure every new key exists in all 49 locales":** they already did. The fault was the stale dev server described in §1. I proved the keys render through the app's own precompile path, rather than changing files that were already right.

## SQL (this round, read-only, via the Supabase MCP)
```sql
select e.id, e.venue_name, e.town, e.postcode, e.event_date, e.start_time, e.end_time, e.status, e.van_id, e.opened_at, e.overlap_dismissed_at, (select count(*) from orders o where o.event_id=e.id and o.status<>'cancelled') as orders from truck_events e where e.truck_id='test-truck' and e.status<>'cancelled' and e.event_date >= (now() at time zone 'Europe/London')::date - 1 order by e.event_date, e.start_time, e.venue_name;
```

## Files changed this round (all uncommitted)
- `components/shared/EventPickerPanel.tsx`.
- 49 `messages/*.json` files plus the generated `messages/ns/**` and `lib/i18n/catalog/**` (the `dayCount` key).
- `scripts/_messages-parity-1e.cjs`.
- This report and the screenshots.
