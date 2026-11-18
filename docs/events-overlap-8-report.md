# events-overlap-8: "Approved" badge on approved events

**17 Nov 2026. Done.** This changes the dashboard's Select event list only; nothing customer-facing.
- All checks pass.
- Screenshots are in [docs/events-overlap-8/](events-overlap-8/), from in-memory fixture events. **No database was read or written this round, so there is no SQL.**
- Nothing was committed, pushed or deployed. This builds on commit `3ecdbb35`; the new changes are uncommitted.

## 1. The badge
[components/shared/EventPickerPanel.tsx](../components/shared/EventPickerPanel.tsx), the dashboard's grouped list (`groupByDate`):
- **Every approved card** (confirmed, open or closed) shows a green **"✓ Approved"** badge in the top-right row, to the left of its existing status badge (Not started / ● Live / ● Finished).
  - Style: light green background (`bg-green-50`), dark green text (`text-green-800`), thin green border (`border-green-300`).
  - It is the same size and shape as the status badge: `text-[10px] font-bold rounded px-1.5 py-0.5`.
  - The ✓ sits in the markup, hidden from screen readers; the word comes from the message files.
- **Unapproved cards are unchanged:** the amber "Needs approval" badge only, no status badge. That covers both duplicates and the lone event.
- **Fitting on a phone.** The badges form one group that never shrinks and never breaks inside a badge (`whitespace-nowrap`, `flex-shrink-0`). The time keeps its size and doesn't wrap.
  - The top row is `flex-wrap`, so when the row is too narrow **the whole badge group moves onto its own line under the time**. The text is never shrunk.
  - The offline "Reconnect to load" chip, when shown, sits in the same group.
- **The KDS's flat list is unchanged**, as before.

## 2. Languages
- **New key:** `kitchenModals.picker.approved` = "Approved" (fr "Approuvé", de "Freigegeben", es "Aprobado", ja "承認済み" …), in all 49 files.
  - Each file was re-read right before writing, and **only this key was added**. The en-GB diff is that one line plus the comma on the line above it.
  - split-messages was run.
  - The key is registered in `scripts/_messages-parity-1e.cjs`.
- **Memory:** the incoming languages now need 27 keys.

## 3. Checks (all pass)

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `split-messages --check` | in step (121 namespaces) |
| `messages-parity` | 1,230,859 passed, 0 failed |
| `translation-check`, 48 languages | Structural 0 in every one |
| ESLint, EventPickerPanel.tsx | clean |
| Screenshot text scan (12 screens, en-GB + fr-FR) | no raw key, no "undefined" |
| Wrapping, measured (390 px and 1280 px, en-GB + fr-FR, 8 cards each) | badges beside the time on **8 of 8** cards; no badge broken across lines; no time clipped |

### The fallback, measured in the longest languages
These runs are in the session scratchpad only, not in docs. On 8 cards per run, the badge group moves under the time where it must, and **no badge breaks and no time is clipped anywhere**:

| Width | de-DE | ka-GE | fi-FI | ru-KZ |
|---|---|---|---|---|
| **390 px** | 8 beside | 6 beside, 2 below | 8 beside | 8 beside |
| **320 px** | 4 beside, 4 below | 0 beside, 8 below | 1 beside, 7 below | 4 beside, 4 below |

So at the 390 px phone width asked about, en-GB and fr-FR (and German, Finnish, Russian) fit beside the time. Only Georgian's long words drop to the line below, which is the fallback you asked for.

## Screenshots: [docs/events-overlap-8/](events-overlap-8/), 12 files

Each name exists at `phone390` and `laptop1280`, in en-GB and fr-FR.

**In-memory fixture events** (the test data was deleted; nothing touched the database). This is the same set as before:
- **today:** Harnessville Sports Club, **open**, 3 orders, selected, with two duplicates: HSC (same time) and Harnessville SC (overlaps, 18:00–21:00);
- **tomorrow:** Market Square, confirmed, **not started**;
- **Thu 19:** Riverside Market, **finished**, 1 order; Village Hall, confirmed, 5 orders, with a same-time duplicate (Village Hall Car Park);
- **Fri 20:** a **lone unapproved** event, Lone Field.

The CSS was compiled fresh from the current source (the green classes are new).

| File stem | Shows |
|---|---|
| `01-event-list-top` | Summary "4 events need approval" · TODAY: Harnessville Sports Club with **✓ Approved · ● Live** · its two amber duplicate cards with **Needs approval** only ("same time" and "overlaps") · TOMORROW: Market Square **✓ Approved · Not started** |
| `02-event-list-bottom` | THU 19 NOV: Riverside Market **✓ Approved · ● Finished** · Village Hall **✓ Approved · Not started** with its duplicate · FRI 20 NOV: Lone Field, amber edge, **Needs approval** only |
| `00-event-list-full-height` | The whole list in one image |

## Prompt check
- **Nothing arrived garbled, and no instruction contradicted another.**

## Files changed this round (all uncommitted)
- `components/shared/EventPickerPanel.tsx`.
- 49 `messages/*.json` files plus the 49 generated `messages/ns/<language>/kitchenModals.json`.
- `scripts/_messages-parity-1e.cjs`.
- This report and the screenshots.
