# Event-cancel route — a phantom column selected, and its error discarded

**One file changed: `app/api/events/action/route.ts`.** One fetch statement and one email argument.
Nothing else in the repo touched.

🔴 **NO CANCEL WAS EXERCISED AND NO DATABASE WAS QUERIED.** Every behavioural claim below is
**READ-FROM-SOURCE** and **unobserved**. The established facts supplied in the brief were taken as given
and not re-derived.

⚠️ **The reported line numbers still hold.** The defect was at `:181` and the correct pattern at `:265`;
both matched on opening the file. The anchors used throughout are the identifiers — `eventRow`, the string
`village`, the absent `error` binding — not the numbers.

---

# Phase 1 — read only

## 1 · The two fetches, verbatim

### The defective one — cancel branch

```ts
    // Fetch event details before cancelling (for email + reject-memory).
    const { data: eventRow } = await supabase
      .from('truck_events')
      .select('venue_name, village, event_date, scraped_signature')
      .eq('id', eventId)
      .single()
```

**Confirmed, not taken on trust:** `village` is in the select list, and the destructuring binds `data`
only — there is no `error` identifier anywhere in that statement.

### The correct one — `restore_rejected` branch

```ts
    const { data: eventRow } = await supabase
      .from('truck_events')
      .select('venue_name, event_date, scraped_signature')
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .single()
    if (!eventRow) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
```

⚠️ **Two corrections to how this one is usually described.** It does **not** bind the error either — it
also destructures `data` only. What it does is **check its RESULT** (`if (!eventRow) … 404`), which
catches the same outcome by a different route. And it carries **`.eq('truck_id', truck.id)`**, which the
cancel fetch does not — an ownership scope the defective fetch lacks. **Neither difference was changed:**
Phase 3 scopes this task to the error binding, the column and the email, and adding a `truck_id` filter to
the cancel fetch would be a behaviour change outside that scope. **Reported, not acted on.**

## 2 · Which paths reach the defective fetch

**The report's claim is CORRECT, with one clarification.** The fetch sits inside `if (action === 'cancel')`
and is reached by **every** call with `action: 'cancel'`. There is no separate `reject` action — a
scraped-event reject **is** a cancel, distinguished only by a payload flag:

```js
        // suppress: true → server stores the event's scraped signature so it won't re-surface (Stage 3).
        body: JSON.stringify({ token, action: 'cancel', eventId: event.id, payload: { auto_open: false, auto_close: false, suppress: true } }),
```
*(`app/manage/[token]/page.tsx`)*

So the two paths are **one code path with two payloads**: an operator cancelling a real event, and an
operator rejecting a scraped pending event (`suppress: true`). **Both hit the defective fetch every
time.** **READ.**

## 3 · The three downstream effects

| # | Effect | Guard | Null `eventRow`? |
|---|---|---|---|
| 1 | suppression write | `if (payload?.suppress && eventRow) {` | 🔴 **SKIPPED** — **READ** |
| 2 | cancellation email locality/date | `venueName: eventRow?.venue_name ?? null,` etc. | ⚠️ **NOT skipped — degraded** — **READ** |
| 3 | slot-usage rebuild | `if (eventRow?.event_date) {` | 🔴 **SKIPPED** — **READ** |

**1 — the suppression write.**

```ts
    if (payload?.suppress && eventRow) {
      const { error: supErr } = await supabase.from('rejected_event_signatures').insert({
        truck_id: truck.id,
        event_date: eventRow.event_date,
        scraped_signature: eventRow.scraped_signature || eventRow.venue_name || '',
      })
      if (supErr) console.warn('[cancel] suppression write failed:', supErr.message)
    }
```

`eventRow` is the second conjunct. Null ⇒ the block never executes. **READ.**

**2 — the email.** This one is **not skipped**, which matters:

```ts
          await sendEventCancellationEmail({
            to: order.customer_email,
            customerName: order.customer_name,
            orderId: order.id,
            truckName: truck.name ?? '',
            venueName: eventRow?.venue_name ?? null,
            village: eventRow?.village ?? null,
            eventDate: eventRow?.event_date ?? null,
            note: fullNote || null,
            paymentStatus: order.paid_at ? 'paid' : null,
          })
```

Every read is optional-chained with a `?? null` fallback, so **the email still sends** — with
`venueName`, `village` and `eventDate` all `null`. **The customer is told an event is cancelled without
being told which event.** **READ.**

**3 — the rebuild.**

```ts
    if (eventRow?.event_date) {
      try {
        await rebuildProductionSlotUsage(supabase, truck.id, eventRow.event_date)
      } catch (err) {
        console.warn('[events/cancel] production_slot_usage rebuild failed (drift risk):', err)
      }
    }
```

Null ⇒ the guard is false ⇒ the rebuild never runs. **READ.** ⚠️ Per the brief's established facts the
effect is **latent, not historical**: all 27 cancelled events have zero live orders, so nothing is
currently bleeding. **No repair was performed and none is needed.**

## 4 · What the email actually consumes

`lib/email.ts`:

```ts
export async function sendEventCancellationEmail({
  to, customerName, orderId, truckName, venueName, village, eventDate, note, paymentStatus,
}: {
  …
  venueName: string | null
  village: string | null
  eventDate: string | null
  …
}): Promise<void> {
  const location = [venueName, village].filter(Boolean).join(', ')
```

🔴 **The property IS called `village`** — and it is consumed **only** as one half of a joined locality
string. It is never compared, matched, stored or rendered as a distinct field; it is a label that ends up
inside `` `event${location ? ` at ${location}` : ''}` ``.

**What it needs to be fed from `town`: nothing but the value.** No rename, no signature change, no
template change — `town` is a `text` locality string and slots into the same `filter(Boolean).join(', ')`.
**READ.**

## 5 · 🔴 Is a null `eventRow` SUFFICIENT to explain zero suppression rows?

**YES. Sufficient, and I could not find a second independent cause. No STOP condition triggered.**

Tested against every failure mode the brief listed:

| Candidate second cause | Finding |
|---|---|
| Wrong table | ❌ `.from('rejected_event_signatures')` — correct. |
| Wrong columns | ❌ Supplies `truck_id`, `event_date`, `scraped_signature` — exactly the three NOT NULL columns. |
| A NOT NULL column never supplied | ❌ All three supplied. `scraped_signature` falls back through `\|\| eventRow.venue_name \|\| ''` to an **empty string**, which satisfies NOT NULL. |
| Missing `await` | ❌ `const { error: supErr } = await supabase…` — awaited. |
| Swallowed error | ❌ The error **is** bound and logged: `if (supErr) console.warn(…)`. **This insert is written correctly** — it is the one place in this area that does bind its error. |
| Unreachable branch (no caller sends `suppress`) | ❌ A caller does: `app/manage/[token]/page.tsx` posts `payload: { …, suppress: true }`. **Reachable.** |
| `truck_id` null | ❌ The route 404s on an unresolved truck long before this point. |

**So the single conjunct `&& eventRow` accounts for it entirely:** the flag arrives true, the insert is
well-formed, and the branch still never runs because `eventRow` is always null. **INFERRED** — from
reading the guard and the caller, not from observing a cancel.

⚠️ **ONE RESIDUAL RISK, WHICH IS NOT A SECOND CAUSE.** `event_date` is written into a NOT NULL column. If
any `truck_events` row has a null `event_date`, that insert will now fail once the fetch starts returning
rows — logged by `supErr`, not fatal. **It cannot be a cause of today's emptiness, because the branch does
not execute at all**, so it does not trigger the Phase 2 stop. It is exactly the kind of thing the first
real cancel after this change will reveal.

## 6 · Repo-wide sweep — executed

**Selects of `village` from `truck_events`, anywhere in the repository:**

```
   app/api/events/action/route.ts:180  venue_name, village, event_date, scraped_signature
   TOTAL: 1
```

🔴 **Exactly one, and it is the defect.** No near-duplicate on the customer side, no second copy on
another operator surface. **The class has exactly one member and it is now fixed.**

**`truck_events` fetches whose destructure discards the error — 22 found, reported, none changed:**

```
app/api/dashboard/action/route.ts                     1138  data: cur          status
app/api/dashboard/action/route.ts                     1280  data: dateEvents   id
app/api/dashboard/action/route.ts                     2014  data: slotEventRow venue_name, town, postcode
app/api/events/action/route.ts                          48  data: ev           van_id, start_time, end_time
app/api/events/action/route.ts                         120  data: openEv       start_time, end_time
app/api/events/action/route.ts                         179  data: eventRow     venue_name, village, …   <-- PHANTOM COLUMN
app/api/events/action/route.ts                         265  data: eventRow     venue_name, event_date, scraped_signature
app/api/inbound-schedule/route.ts                      186  data: sameDay      id, venue_name, scraped_signature, venue_id
app/api/manage/route.ts                                665  data: cur          status
app/api/manage/route.ts                                768  data: ev           event_date
app/api/manage/route.ts                               1293  data: ev           id, event_date, venue_name, town, van_id
app/api/menu/[truckId]/route.ts                        143  data: explicitEvent id, status
app/api/menu/[truckId]/route.ts                        172  data: unconfirmedEvent id
app/api/orders/[id]/route.ts                            74  data: event        venue_name
app/api/orders/submit/route.ts                         276  data               van_id, status, paused_until, online_paused_until
app/api/orders/submit/route.ts                        1288  data: evVan        van_id
lib/orders/place-in-slot.ts                             48  data               start_time, van_id
lib/provision-demo-event.ts                            111  data: oldEvents    id
lib/slot-bookings.ts                                    94  data               start_time, event_date
supabase/functions/heartbeat-monitor/index.ts            68  data: liveEvents   …
```

⚠️ **Discarding the error is common here and is not itself the defect** — a query that selects only real
columns cannot 42703. **What made this one fatal was the combination: a phantom column AND a discarded
error.** Every other entry selects columns that exist, so each fails only on a genuine outage, where a
null result is a reasonable degradation.

✅ **Two of them independently corroborate the fix:** `dashboard/action:2014` selects
`venue_name, town, postcode` and `manage:1293` selects `id, event_date, venue_name, town, van_id` — **both
already treat `town` as this table's locality column.** The change follows the codebase's own established
pattern rather than introducing one.

---

# Phase 2 — stop conditions

| Condition | Result |
|---|---|
| Fix requires changing behaviour outside this route | ❌ No — one fetch and one argument, both inside `app/api/events/action/route.ts`. |
| A second independent cause of the empty suppression table | ❌ **None found** (§5). Not triggered. |
| Instructions contradict each other | ❌ No. |
| Garbled span | ❌ None. |

**Proceeded.**

---

# Phase 3 — the change

```ts
    const { data: eventRow, error: eventRowErr } = await supabase
      .from('truck_events')
      .select('venue_name, town, event_date, scraped_signature')
      .eq('id', eventId)
      .single()
    if (eventRowErr) console.warn('[cancel] event detail fetch failed — suppression, email locality and slot-usage rebuild will be skipped:', eventRowErr.message)
```

```ts
            village: eventRow?.town ?? null,
```

| Requirement | Done |
|---|---|
| a. Bind the error | ✅ `error: eventRowErr` |
| b. `village` → `town`, nothing else added, no join | ✅ Select list is `venue_name, town, event_date, scraped_signature`. **`venues` not touched.** |
| c. Handle it explicitly; no new error shape; cancel must still succeed | ✅ `console.warn` — **the route's own existing best-effort pattern** (used by the suppression write and the signature delete). No `NextResponse` shape invented; the cancel's own UPDATE keeps its separate checked error and still returns `ok: true`. |
| d. Feed the email's locality from `town`, no rename | ✅ The property is still `village:`; only its source changed. No copy, no template touched. |

⚠️ **On (c) — why `console.warn` and not a failure response.** Phase 3c asks for "whatever failure path
this route already uses" while forbidding the cancel from failing. Those two only reconcile one way: this
route's best-effort failures are `console.warn`, and its fatal failures are 500s reserved for the UPDATE
itself. A 500 here would break the cancel, which is explicitly out of scope. **The log names all three
things that will be skipped**, so the next occurrence is diagnosable from the line alone.

## Not changed

The second fetch, the suppression insert, `rebuildProductionSlotUsage`, all copy, all status values, every
other route, the missing `.eq('truck_id', …)` on the cancel fetch, and the 21 other error-discarding
fetches.

---

# Phase 4 — verification and honesty

## Verified by EXECUTION

The pre-change file was copied before editing and compared against the result programmatically:

```
1. select list on the cancel fetch
   before: .select('venue_name, village, event_date, scraped_signature')
   after : .select('venue_name, town, event_date, scraped_signature')
   'village' still selected from truck_events anywhere in file: False

2. error binding on that fetch
   before: const { data: eventRow } = await supabase
   after : const { data: eventRow, error: eventRowErr } = await supabase
   error handled: True

3. email locality
   before: village: eventRow?.village ?? null,   → True
   after : village: eventRow?.town ?? null,      → True   (property name still `village`)

4. the SECOND fetch is untouched
   restore_rejected block byte-identical: True

5. non-comment changed lines in the whole file: 9
    -    const { data: eventRow } = await supabase
    -      .from('truck_events')
    -      .select('venue_name, village, event_date, scraped_signature')
    +    const { data: eventRow, error: eventRowErr } = await supabase
    +      .from('truck_events')
    +      .select('venue_name, town, event_date, scraped_signature')
    +    if (eventRowErr) console.warn('[cancel] event detail fetch failed — …', eventRowErr.message)
    -            village: eventRow?.village ?? null,
    +            village: eventRow?.town ?? null,
```

**Nine changed non-comment lines: the fetch statement, its new guard, and the email argument. Nothing
else.**

A grep of the diff for `rejected_event_signatures` and `rebuildProductionSlotUsage` returns **three
matches, all of them comment lines I added** — **no executable line touching either was changed.**

## Not offered as verification

`npx tsc --noEmit` reports nothing for this file. **This is not verification and is not reported as one** —
swapping a string literal inside `.select()` is exactly what a typechecker cannot see: the old select was
equally "clean" for the entire time it was broken. `next dev` and `next build` were not run.

## 🔴 Unobserved, and what remains UNPROVEN

**No cancel was exercised. The live database was not queried. Nothing was written, backfilled or deleted.**

| Claim | Status |
|---|---|
| The select now names `town`, not `village` | ✅ Executed |
| The error is bound and handled | ✅ Executed |
| Everything else in the file is unchanged | ✅ Executed |
| `eventRow` will now be non-null on a real cancel | ⚠️ **READ-FROM-SOURCE, unobserved** |
| The email will carry venue, town and date | ⚠️ **READ-FROM-SOURCE, unobserved** |
| `rebuildProductionSlotUsage` will now run | ⚠️ **READ-FROM-SOURCE, unobserved** |
| 🔴 **A real cancel now writes a suppression row** | 🔴 **UNPROVEN. This is the one that matters.** |

**Why the suppression row specifically is unproven.** `rejected_event_signatures` has never held a row, so
there is no precedent showing the insert works end to end — only a reading that it is well-formed (§5).
Between the fix and a written row lie two things nobody has observed: that the fetch now returns a row for
a real event id, and that the insert's NOT NULL columns are all satisfiable for that row (the
`event_date` risk in §5). **Only an actual reject of a scraped event can settle it**, and that has not
been done. **If it is tried, the thing to look for is the absence of `[cancel] suppression write failed:`
in the logs and one new row in the table.**

---

# Design observation — recorded, not acted on

Suppression is keyed on **(truck_id, event_date, scraped_signature)**. **A rejected event that returns on
a DIFFERENT date is not suppressed by that key, even when the write works.** The `event_date` is part of
the identity, so a scraper that re-emits the same venue and signature for the following week produces a
different key and passes the `inbound-schedule` filter. **Whether that is correct depends on what a
reject is meant to mean** — "not this occurrence" or "not this event, ever" — and the current key answers
only the first. **Noted per the brief; no action taken.**

---

# Phase 5 — integrity census

## Byte-level NUL / control-byte scan — separate pass per file, after writing, byte tool, never grep

Python `open(path, 'rb')`, integer comparison. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`,
`0x7F`.

| File | | Bytes | NUL | Other flagged | **Total flagged** | TAB / LF / CR |
|---|---|---|---|---|---|---|
| `app/api/events/action/route.ts` | before | 13114 | 0 | 0 | **0** | 0 / 293 / 0 |
| `app/api/events/action/route.ts` | after | 15092 | 0 | 0 | **0** | 0 / 312 / 0 |
| `docs/event-cancel-phantom-column-report.md` | after | *(in chat — self-reference)* | 0 | 0 | **0** | 0 / LF only / 0 |

**Zero NUL bytes and zero other flagged control bytes in every pass.** Exact byte and LF counts are in the
chat reply — this file cannot print its own length inside itself without changing it.

## Non-ASCII census of characters introduced

Into `app/api/events/action/route.ts`. Before/after class census, **changed rows only**:

| Class | Before | After | Δ |
|---|---|---|---|
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 291 | 295 | +4 |
| U+2014 EM DASH | 11 | 15 | +4 |
| U+1F534 LARGE RED CIRCLE | 3 | 5 | +2 |
| U+26A0 WARNING SIGN | 1 | 2 | +1 |
| U+FE0F VARIATION SELECTOR-16 | 1 | 2 | +1 |
| U+2026 HORIZONTAL ELLIPSIS | 0 | 1 | **+1 — new class** |

⚠️ **One new class: U+2026 HORIZONTAL ELLIPSIS ×1**, from `…` inside a comment. Named rather than buried
in a delta. **No class was removed.** U+26A0 and U+FE0F moved together (+1/+1), preserving the pairing.

**Exactly ONE non-ASCII character sits in executable code**, and it is stated rather than hidden — an
em dash inside the `console.warn` message string, found by scanning every non-comment line:

```
  line 199: ['U+2014']  ->  if (eventRowErr) console.warn('[cancel] event detail fetch failed — suppression, …
```

**The `.select('venue_name, town, event_date, scraped_signature')` literal, the `error: eventRowErr`
binding and the `eventRow?.town` expression are pure ASCII.**

## Carrier-aware variation-selector check — per base, bare vs paired

`app/api/events/action/route.ts` — total U+FE0F = 2:

| Base | Bare | +U+FE0F | Name |
|---|---|---|---|
| U+2500 | 295 | 0 | BOX DRAWINGS LIGHT HORIZONTAL |
| U+1F534 | 5 | 0 | LARGE RED CIRCLE |
| U+26A0 | 0 | 2 | WARNING SIGN |

Report file per-base counts are in the chat reply. The rule both satisfy: `Emoji_Presentation=Yes` bases
appear **100% bare** (a VS-16 on them is redundant); the one `Emoji_Presentation=No` base, U+26A0, appears
**100% paired** (without VS-16 it renders as a monochrome text glyph). **Reported per base, not as a
single total. No base appears both bare and paired in either file.**

## `git status --porcelain`

| Entry | Pre-existed this task? |
|---|---|
| `M docs/reference-manual.md` | ✅ **YES** — the V11.29 update, uncommitted. |
| `M app/dashboard/[token]/kds/page.tsx` | ✅ **YES** — the KDS header swap. |
| `M app/landing/landing.css` | ✅ **YES** — the landing trust-strip fix. |
| `?? docs/kds-header-screen-on-swap-report.md` | ✅ **YES** |
| `?? docs/landing-alignment-report.md` | ✅ **YES** |
| `M app/api/events/action/route.ts` | ❌ No — **this task's only code change.** |
| `?? docs/event-cancel-phantom-column-report.md` | ❌ No — this report. |

**Five of the seven entries pre-existed this task**, all from earlier turns in this session. Nothing was
committed, staged, reverted, stashed or cleaned. **No `git stash`, `git checkout` or `git restore`.**
