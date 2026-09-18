# "Copy a recent event" offered one template out of 36 — diagnosed and fixed

**Date:** 18 September 2026 · Display only (which events the modal lists) · Localhost only; nothing deployed,
nothing committed, nothing staged.
**File changed:** `app/manage/[token]/page.tsx` — the `recentEvents` memo, 3 lines of logic.
No live truck was touched: the only database access was **read-only PostgREST GETs on test-truck**, shown below.

---

## What Dominic saw

Manage → Schedule → **Add event** → *Copy a recent event* listed a single template —
`Bures Music Festival, Bures · Sun 12 Jul · –` — although Pizza Kitchen has traded many times since July.

## The cause, by symbol

`recentEvents` (the memo feeding the modal) admitted two statuses:

```ts
      .filter(e => e.status === 'confirmed' || e.status === 'open')
```

**`closed` is where every event that has actually happened ends up**, so an event dropped out of the list the
moment it closed. Read-only counts on test-truck:

```sql
SELECT truck_events.status, count(*) FROM truck_events WHERE truck_events.truck_id = 'test-truck' GROUP BY truck_events.status;
-- closed 32 · cancelled 16 · confirmed 4 · open 1 (created today)   → 39 rows reach the page (the API drops cancelled)
```

The four `confirmed` rows are **Bures Music Festival, Bures on 9–12 July**, all with `start_time`/`end_time`
NULL. The dedupe below the filter keys on `venue_name`-`town`, so those four collapse to one — the 12 July row,
rendering as `Sun 12 Jul · –` because it has no times. That is the screenshot exactly. The 32 closed events —
the entire real trading history — were filtered out before the dedupe ever saw them.

`/api/events/manage` was not at fault: it returns every row except `cancelled`, with no date window
(`loadEvents` passes no `upcoming`), so all 39 rows were in the page's `events` array the whole time.

## The fix

```ts
  const recentEvents = useMemo(() => {
    const COPYABLE = new Set(['confirmed', 'open', 'closed'])
    const seen = new Set<string>()
    return [...events]
      .filter(e => COPYABLE.has(e.status))
      …
```

`unconfirmed` (an unapproved scraper find) and `rejected` stay out — the operator never adopted them;
`cancelled` never reaches the page at all. Copying is safe for a closed event: `handleCopyEvent` carries
**venue, town, postcode, address, start/end time and van only**, with `id: undefined` and no status, so it
seeds a blank new-event form.

The dedupe now also picks a **better** row per venue: sorted newest-first, Bures resolves to the 16 September
closed event (16:00–23:00) rather than the July one with no times, so the `· –` disappears too.

## Measured — the modal's list, run over test-truck's real rows

| | Entries |
|---|---|
| **Before** | `Bures Music Festival, Bures · 2026-09-18 · 10:00–22:00` *(1 — and before today's event existed, the 12 July row with no times: the screenshot)* |
| **After** | `Bures Music Festival, Bures · 2026-09-18 · 10:00–22:00` · `Rolling batch test, Localhost · 2026-09-17 · 17:00–23:00` · `Nethergate Brewery & Distillery · 2026-08-31 · 12:00–17:30` · `Old School Community Centre, Great Cornard · 2026-08-24 · 16:30–20:00` · `The White Horse, Edwardstone · 2026-08-21 · 16:30–20:00` **(5)** |

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 4.6s", **true exit code 0** |
| `node scripts/run-harnesses.cjs` | **50 run · 50 passed · 0 failed — true exit code 0** |
| eslint, `app/manage/[token]/page.tsx`, vs a clean HEAD worktree | **no rule count changed** (283 errors / 75 warnings both sides, all pre-existing) |
| goldens | `8bdae817748ad334…` / `ce5550b7ee2a42ce…` — unchanged, not regenerated |
| `git status` | 37 modified, 97 untracked, **0 staged** (134 entries) — unchanged but for this report |

## Localhost check

Manage → Schedule → **+ Add event** on Pizza Kitchen: *Copy a recent event* now lists **five** venues, newest
first, each with real times. Click one and the form fills with its venue, address and times, leaving **Date**
blank for you to set. Nothing else in the modal moved.

## Anything I could not establish

- **The four July `confirmed` rows have NULL `start_time`/`end_time`.** They were created without times (a
  scraper import or an early manual add); nothing in the current form allows that, since both fields are
  required. They are harmless now that closed events outrank them, but if they appear elsewhere with a `–`
  they are the reason.
- **The sort is strictly newest-first by date, which includes the future.** A truck with a long forward
  schedule sees its *furthest-future* events at the top of a list headed "recent". No live truck is far enough
  ahead for that to look wrong today (Gusto's three upcoming are all within days), so I left it alone — say the
  word and I will order it by proximity to today instead.
