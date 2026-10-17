# Events that run past midnight: shared brief for the five surface agents (17 October 2026)

Repo: /Users/dominicbonini/dev/village-foodie (Next.js 16, Supabase; the "HatchGrab" food-truck ordering app). Final report: docs/midnight-and-format-fixes-report.md (the lead writes it).

## The rule (already built: use it, never re-implement it)
An event is `event_date` + `start_time` + `end_time`: wall-clock times in the truck's zone (`TimeSettings.timeZone`; on the server, `lib/truck-time.ts`).
- **An event CROSSES MIDNIGHT when end < start.** Its end is on the next calendar day.
- **On such an event, a clock time earlier than the start is the next day's** (a slot, a finish time).
- **end == start is NOT overnight:** keep today's behaviour exactly.
- **An event with end > start must behave byte-identically to before, everywhere.**

**`lib/event-window.ts`** (client-safe), the ONLY place the rule lives:
- `crossesMidnight(start, end)`, `clockMins(t)`: also in `lib/time-utils.ts`, re-exported here.
- `eventTimeMins(start, end, time)`: a time on the EVENT TIMELINE (minutes after 00:00 of `event_date`; +1440 for a past-midnight time). `eventEndMins(start, end)`.
- `nowOnEvent(eventDate, tz)`: now on that timeline. 0–1439 on `event_date`, 1440+ on the next day, negative before.
- `eventTimeDate(eventDate, start, end, time)`: `'YYYY-MM-DD'` the time falls on. `eventTimeInstant(...)` / `eventEndInstant(...)`: UTC ms.
- `eventDates(eventDate, start, end)`: `[date]` or `[date, next]`.
- **ENGINE CLOCK:**
  - `engineClock(start, end)` → `{ overnight, to, from, rowsTo, rowsFrom, keysTo, keysFrom }`. It maps "00:15" ↔ "24:15" for an overnight event, and is the identity otherwise.
  - The slot/capacity engine (`lib/slot-availability.ts` and friends) parses slot strings as minute-of-day and sorts them as strings. So **hand it an overnight event's times through `engineClock(...).to/rowsTo/keysTo`, and turn what comes out back with `from/rowsFrom/keysFrom` before storing or showing.**
  - **STORAGE AND SCREENS ALWAYS HOLD CANONICAL "HH:MM"** ("00:15", never "24:15").
- **UPCOMING:** `upcomingQueryFloor(tz)` (yesterday) and `isUpcomingOrRunning(e, today, nowMins?)`. Replace every `event_date >= today` query with `>= upcomingQueryFloor(tz)`, then filter with `isUpcomingOrRunning`. **Apply any LIMIT after the filter, never in the query.** For normal events the result must be identical.

**Already changed by the lead (don't redo):**
- `lib/slot-utils.ts`: `isSlotPast(slot, tz, eventDate, event?)` and `getAsapSlot(slots, eventDate, tz, event?)`. **Pass `event` (`{start_time, end_time}`) at every call site you own.**
- `lib/slot-generation.ts`: `generateCollectionTimes` walks past midnight. Its output is canonical and in chronological order; the engine must get it through `engineClock().rowsTo(rows, ['collection_time','production_slot'])`.
- `lib/prep-utils.ts`: `resolveCollectionTime` takes `end_time` on the event. **Pass it.**
- `lib/time-utils.ts`:
  - `pickDefaultEventByTime` (an overnight end lands on the next date);
  - `hasValidEventTimes`, which now allows end < start and refuses only end == start. This opens the save gates in /api/manage `upsert_event`, /api/events/action and /api/dashboard/action `update_event`.

## Behaviour required for a 20:00–00:30 event (GB and US)
- Ordering stays open until 00:30 on the next day, and its cut-off rules apply to that instant.
- Slots run through 00:30.
- An order for 00:15 is "in 25m" at 23:50, not late.
- Add order offers post-midnight slots.
- Manage keeps it under Upcoming until 00:30 the next day.
- The KDS and dashboard show it as today's event until it ends.

**Moments to prove** (scripts/_midnight-fixtures.cjs `MIDNIGHT_MOMENTS`): 19:00, 23:50, 00:15 (next day), 00:31 (next day), the next afternoon. The normal 11:30–22:45 event (`NORMAL_MOMENTS`) must be byte-identical to BEFORE.

## Proof: your area module
**Write `scripts/_midnight-<area>.cjs`** exporting:
- **`views({ kit, REPO, FIX })`:**
  - returns `{ id: value }` with ids `normal|<GB|US>|<moment>|<what>` and `midnight|<GB|US>|<moment>|<what>`;
  - each value is what the REAL module returns or renders (JSON-serialisable), via `kit.bundle`/`renderStatic`/`setNow`/`setDeviceTz` (`scripts/_render-kit.cjs`), fixtures from `scripts/_midnight-fixtures.cjs` (+ `scripts/_fake-pg.cjs` for routes);
  - **🔴 views must run on BOTH codes**: the BEFORE commit 692adb4 (no `lib/event-window.ts` there) and this tree. Bundle only modules that exist at 692adb4, call functions with arguments both versions accept (extra args are fine), and wrap each view in try/catch, returning `'ERROR …'`.
- **`checks(t, A, B)`:** assertions on the MIDNIGHT views of this tree (A); B = BEFORE, for contrast. `t(name, ok, detail)`. Say what the rule requires at each moment, GB and US.

**Runner:** `node scripts/midnight-events.cjs` (see its header).
- **Your area only:** `--areas=<area>`.
- **BEFORE for your area:** `--recapture --areas=<area>`. It replaces only your BEFORE file; run it whenever you change your module's NORMAL views.

The runner requires every NORMAL view to be byte-identical to BEFORE.

## Rules (hard)
- **No database writes, no SQL, no network.** Fixtures only: Pizza Kitchen (`test-truck`, slug `test-kitchen`). **Never** render, test or name Pizzeria Gusto.
- **Never deploy, push or commit.** No dev server, and **no `next build`** (the lead runs it once at the end). Don't kill processes by name or pattern; stop what you start by its PID.
- Never print, cat, grep or sed any `.env*` file or secret. Send no emails. Never touch `outreach_templates`.
- **Edit ONLY the files your brief lists.** If you need a change in another agent's file or in `lib/event-window.ts` / `lib/slot-utils.ts` / `lib/slot-generation.ts` / `lib/prep-utils.ts` / `lib/time-utils.ts`, STOP and say so in your report (don't edit it).
- **New user-facing words** go in `messages/en-GB.json` (+ `messages/en-US.json` only where US differs). Add them ONLY through the locked helper:
  - **command:** `node /private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/4c8f3b39-c0f3-4916-81cd-95247f75baec/scratchpad/lp1e/msg.cjs <batch.json>`;
  - **batch shape:** `{ "en-GB": { "<ns>": { "<key>": "…" } }, "en-US": {...} }`;
  - it regenerates the catalogue. Follow `.cursor/rules/language.mdc` (curly ’ and “”, spaced en/em dashes as used around them).
- **Code style:** match the surrounding code and comment density. Each changed decision gets a short comment naming `lib/event-window.ts`.
- **Before reporting, run:**
  - `npx tsc --noEmit -p .` (clean);
  - `npx eslint <your touched files>`: report the rule counts against `git show HEAD:<file> | npx eslint --stdin --stdin-filename <file>`, with no rule count growing;
  - your area's runner (all passing);
  - any existing harnesses in `scripts/` that cover your files (find them with `grep -l <file or function> scripts/*.cjs`; `scripts/harnesses.json` lists the sweep). Fix any you break, or explain.

## Report back (concise)
1. Every decision point you changed: file:line, before → after (one line each).
2. Anything left as is, and why.
3. Your module's view count and checks.
4. tsc / eslint / harness results.
5. Anything you need from another file's owner.
