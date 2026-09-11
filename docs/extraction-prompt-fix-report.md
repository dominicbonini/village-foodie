# The prompt edits — STOPPED before applying, on your own pre-condition

# 🔴 THE PROMPTS WERE NOT EDITED

You wrote: *"If any surface renders badly, SAY SO AND STOP before making the prompt edits — the rendering
fix comes first."* **Two public surfaces render badly with an empty village, so I stopped.**
🧪 `git diff scripts/run-scraper.js` is empty, both `VILLAGE (MANDATORY)` labels are still in place, and
`buildHgPrompt` — the control — is untouched.

⚠️ **The specific defect you predicted is NOT one of the two.** You feared `"Recreation Ground, "` — a
dangling separator on an event card. That does not happen, on any surface, and I measured it at **0 rows**
rather than reasoning it away. The two that do fail are elsewhere and I would not have looked for them
without rendering.

**No schema change, no migration, no database write, no scrape, nothing installed.** `truck_events` was
neither read nor written. The matcher, the dedup gate's rules, the URL guards, the outreach console,
templates, the events tab and the schedule popup were not touched.

**Re-derived live, 12 September 2026:** `discovery_events` **933** · `venues` **819** · future rows
**703** · rows with a null village **28**, of which **8** are also unlinked.

---

## 🔴 THE ONE NUMBER YOU ASKED FOR BEFORE DEPLOYING

> *"Count how many currently-linked future rows could be re-emitted and have their village nulled. If that
> number is not zero, say so before I deploy this."*

**It is not zero. It is 422.**

| | rows |
|---|---|
| future rows | 703 |
| future **and linked** and carrying a village | 462 |
| 🔴 …**and written by one of the two prompts you asked me to edit** | **422** (Manual Entry 119, `URL:` scraper 303) |
| of those, the **venue** also has a village → the public render is unaffected | **421** |
| of those, the venue has **no** village → the public village would go empty | **1** |

**What that means in practice.** The stored `discovery_events.village` on up to 422 linked future rows
could be replaced with `null` the first time the corrected prompts re-emit them and the model declines
where it previously invented. On the public pages **421 of the 422 look identical**, because the feed
reads `e.village || venue.village || ''` and the venue's own village fills the gap. **One row would lose
its village publicly.** The database loses a value on all 422; the customer sees a change on one.

⚠️ It is an upper bound, not a forecast: it counts rows the changed prompts *could* rewrite, not rows the
model will actually decline on. Most of those villages are genuinely in the source text and would come
back unchanged. **I cannot narrow it without running the model, and I have not run it.**

---

# WHAT A NULL VILLAGE RENDERS AS — PROVED BY RENDERING

The feed maps `village: e.village || venue.village || ''`, so a null event village reaches the public as
**the venue's village when the event is linked**, and as **`''` when it is not**. Every case below was
rendered through `react-dom/server` using the surfaces' exact expressions and the repo's real
`getVenueSlug`, in four states: village correct, village null + linked, village null + unlinked, and the
wrong village this change would replace.

## ✅ 1 · Event cards and map popups — SAFE

`components/EventListCard.tsx` builds the venue line as
`ev.village && !ev.venueName.includes(ev.village) ? `${venueName} - ${village}` : venueName`.
**The `ev.village &&` guard is what saves it.**

```
village present        → <span>The Affleck Arms - Dalham</span>        ✅
null + venue LINKED    → <span>The Affleck Arms - Dalham</span>        ✅  (venue's village fills in)
null + venue UNLINKED  → <span>The Affleck Arms</span>                 ✅  no separator, no gap
wrong village (today)  → <span>The Affleck Arms - Recreation Ground</span>
```

🔴 **No dangling separator on any surface, in any state.** The map popup is this same component
(`isMapPopup`), so it is covered by the same proof. This is the surface you were worried about and it is
the one that is fine.

## ⚠️ 2 · Venue page header — DEGRADED

`app/venues/[slug]/VenueClient.tsx` renders, **unguarded**:
`<span>📍</span><span>{venueInfo.village} {venueInfo.postcode && \`• ${postcode}\`}</span>`

```
village present, postcode   → "📍 Dalham • CB8 8TG"
village EMPTY, postcode      → "📍  • CB8 8TG"      ← the dangling bullet
village EMPTY, no postcode   → "📍  "               ← a pin linking to a map, labelled with a space
```

🧪 **The dangling-bullet line is NOT reachable today: 0 rows.** It needs a venue with a postcode *and* no
village, and **0 of the 43 village-less venues have a postcode**. **19 rows already render the empty
"📍 " variant.** So this surface is degraded rather than broken, and it is already degraded before any
prompt change — the change would add to the 19, not introduce the state.

## 🔴 3 · Venue page share text — BROKEN, and customer-facing

Same file, unguarded:
`Check out the upcoming food truck schedule for ${venueInfo.name} in ${venueInfo.village}! 🍔🍻`

```
village present  → "…for The Affleck Arms in Dalham! 🍔🍻"
village EMPTY    → "…for The Affleck Arms in ! 🍔🍻"        🔴
```

**"in ! 🍔🍻" is the dangling-separator defect you described, just in a sentence rather than a card** —
and it is what a customer posts to someone else. Reachable by all 19 rows today.

## 🔴 4 · Grouping — one venue becomes two pages

`hooks/useVillageData.ts` groups venues by `getVenueSlug(e.venueName, e.village || '')`, and
`VenueClient` filters by the same slug. 🧪 The real function:

```
getVenueSlug('The Affleck Arms', 'Dalham') → the-affleck-arms-dalham
getVenueSlug('The Affleck Arms', '')       → the-affleck-arms
same group? 🔴 NO
```

**So a venue whose events are a mix of "has a village" and "has none" splits into two venue pages and two
map groups, each showing half the schedule.** That is the sharpest of the four, because it is silent: no
broken punctuation, just a page that is missing dates. The prompt change makes mixed rows more likely,
since it nulls some rows for a venue while leaving others.

Sorting and filtering elsewhere are unaffected — `VenueClient`'s map query uses
`[name, village, postcode].filter(Boolean)`, which drops an empty village cleanly.

---

# WHAT HAS TO HAPPEN FIRST

Three small, independent fixes, all in surfaces I was told not to touch in this task and none of which I
have made:

| # | file · surface | fix |
|---|---|---|
| 1 | `VenueClient` — share text | make the location clause conditional, e.g. drop `in ${village}` when the village is empty |
| 2 | `VenueClient` — header | guard the `📍` line so it renders the postcode alone, or nothing, when there is no village |
| 3 | `useVillageData` / `getVenueSlug` | decide how a village-less event groups. Keying the group on `venue_id` where one exists would be stable; keying on the name alone would merge two genuinely different venues that share a name, which the matcher work has just shown is a real shape in this data |

🔴 **Item 3 is a decision, not a patch, and it is yours.** It changes which events appear on which venue
page, and the safe-looking option (group on name alone) is the one that would merge `The Bull` [Bottisham]
with `The Bull` [Burrough Green] — the exact pair last task separated.

---

# THE EDITS I DID NOT MAKE, FOR WHEN YOU WANT THEM

Unchanged from §B2 of `docs/venue-matching-fix-report.md`, quoted so nothing drifts:

**① the rule / manual-schedule prompt — currently:**
> `6. VILLAGE (MANDATORY): Always extract the town, village, or city into a separate "village" field.`

**would become:**
> `6. VILLAGE: Extract the town, village, or city into a separate "village" field. If the town or village truly cannot be determined from the text, use "" (an empty string) — do NOT repeat the venue name and do NOT guess.`

**② the event prompt — currently:**
> `6. **VILLAGE (MANDATORY):** You must extract the town, village, or city name.`

**would become:**
> `6. **VILLAGE:** Extract the town, village, or city name. If it truly cannot be determined from the text, use "" (an empty string) — do NOT repeat the venue name and do NOT guess.`

**③ `buildHgPrompt` — NOT TO BE TOUCHED.** 🧪 Its escape clause is still in place and is the control:
*"Never leave a town buried in venue_name. If the town truly cannot be determined, use ''."*
⚠️ That sentence **wraps across two lines in the file**, so a single-line grep for
`"town truly cannot be determined"` returns **0** and reads like the control has been damaged. It has
not — `truly cannot be` matches once, and `buildHgPrompt` appears twice. I hit this while verifying and
am recording it so the next person does not act on a false negative.

---

# THE BLAST-RADIUS ANSWERS I CAN GIVE NOW

**(a) Does a malformed or empty response fail the run loudly, or is it silently dropped?**
Neither, exactly, and the distinction matters. A row the model returns with an empty village is **valid**
— it is written through the gate with `village: null` and the run stays green. A row is only dropped
before writing if it lacks a date or a truck name. **So a prompt that starts declining villages produces
a green run and a quiet change in the data.** There is no assertion on village coverage anywhere in the
scraper, which is why (c) matters.

**(b) Answered above: 422 linked future rows at risk, 1 visible change.**

**(c) How you would tell the next morning whether it worked.** Two figures, both cheap. The first is the
one that says the fix worked; the second is the one that says it went wrong. SQL is in the chat.

- **Worked:** the count of future rows where `village` equals `venue_name` should fall from **62** toward
  0 as rows are re-emitted, and no new such row should appear with a `created_at` after the deploy.
- **Went wrong:** the count of future rows with a null village should rise roughly in step — that is the
  intended trade. If it rises *far* faster, the model has started declining on rows where the village was
  in the text, and that is the signal to revert.

🔴 **Neither of these can be checked before a scrape runs, and the effect of a prompt edit cannot be
tested without running the model. I have not run it and I am not claiming the wording works — only that
it matches the control's wording, which has produced 0 bad villages in 86 rows.**

---

# HOW I CHECKED

Every render above came from executing the surfaces' exact expressions through `react-dom/server`, with
the repo's real `getVenueSlug` compiled from source, in four village states — not from reading the JSX
and concluding. The counts came from a full read of `discovery_events` and `venues` with the feed's own
fallback (`e.village || venue.village || ''`) applied per row, so they describe what is published rather
than what is stored. The writer attribution comes from `discovery_events.source`. Searches were run
without an extension filter.

**Not done:** no prompt edited, no rendering fixed, no data changed, no scrape, no schema change, no
migration, no database write.
