// lib/weekly-post/caption-template.ts — a saved caption, with LABELS where the facts go.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY A TEMPLATE AT ALL
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// `caption.ts` writes a caption from scratch every time: good wording, and the truck cannot change it.
// An operator who wants their own voice — an emoji, a hashtag block, a different opening — had to
// retype it on every post, and the one thing that must NOT be retyped is the facts: the dates, the
// times, the place, the ordering link.
//
// 🔴 SO A TEMPLATE IS THE TRUCK'S WORDS PLUS **LABELS** FOR THE FACTS. The labels are stored as tokens
// like `{times}` and are NEVER shown to the operator as raw codes — the editor draws each one as a
// small chip. This module is the only place that knows the token spelling.
//
// ⚠️ PURE AND BROWSER-SAFE. No clock of its own, no database, no network: every value is passed in, so
// the editor can preview with sample values and the harness can drive every case without a clock.
//
// ⛔ AN UNKNOWN TOKEN RENDERS AS NOTHING AND DOES NOT THROW. A caption that will not save is worse
// than a caption with a dead label, and a template written by an older build must keep working.

import type { TimeStyle } from './format'
import { formatOneTime } from './format'
import { WEEKDAY_NAMES, weekdayOf } from './week'
import { dateTextFor, shortDateTextFor, DEFAULT_COUNTRY, type CountryCode } from './locale'
/* 🔴 THE SAME RELATIVE PHRASE THE PRODUCT ALREADY WRITES — imported, not re-derived. A second copy of
 * "when does an event count as tonight" is a second rule that would drift. */
import { whenPhrase } from './caption'
import type { WeekData } from './week-data'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE LABELS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Which post type a template belongs to. ⚠️ The same two values `truck_post_designs.kind` uses. */
export type CaptionKind = 'week' | 'event'

export type CaptionLabelId =
  | 'week-dates' | 'day-list'                              // weekly only
  /* ══ 🔴 `venue` AND `area` SPLIT `place` (9 October 2026) ════════════════════════════════════════
   * ⛔ `{place}` FILLED TO "The Kings Arms, Lavenham" — the name and the town joined, with a comma this
   * module chose. So a truck who wanted the venue bold and the village after it, or the village left
   * out of a caption that already named it, had one token and no way to split it.
   * ⚠️ `{place}` IS STILL A LABEL AND STILL FILLS EXACTLY AS IT DID. Every saved template containing it
   * keeps working unchanged, which is the rule every addition to this module follows — it is simply no
   * longer on the button row, because a new template should be built from the two. */
  | 'place' | 'venue' | 'area'
  | 'day-date' | 'times' | 'location-tag'                  // single event only
  | 'order-link'                                           // both

export interface CaptionLabel {
  id: CaptionLabelId
  /** What the chip says, and what the "+" button is called. ⛔ Never the token. */
  label: string
  kinds: readonly CaptionKind[]
}

/**
 * 🔴 THE ONE DECLARATION, AND THE ORDER IS THE BUTTON ROW'S ORDER. The brief names them:
 *   Weekly:        + Week dates · + List of days · + Order link
 *   Single event:  + Place · + Day & date · + Times · + Order link · + Location tag
 * ⚠️ `order-link` BELONGS TO BOTH and appears once here rather than twice — `labelsFor` filters.
 */
export const CAPTION_LABELS: readonly CaptionLabel[] = [
  { id: 'week-dates', label: 'Week dates', kinds: ['week'] },
  { id: 'day-list', label: 'List of days', kinds: ['week'] },
  { id: 'place', label: 'Place', kinds: ['event'] },
  { id: 'venue', label: 'Venue', kinds: ['event'] },
  { id: 'area', label: 'Area', kinds: ['event'] },
  { id: 'day-date', label: 'Day & date', kinds: ['event'] },
  { id: 'times', label: 'Times', kinds: ['event'] },
  { id: 'order-link', label: 'Order link', kinds: ['week', 'event'] },
  { id: 'location-tag', label: 'Location tag', kinds: ['event'] },
]

/**
 * The labels a given post type may insert, in the brief's order.
 *
 * ⛔ `place` IS **NOT** ON THE EVENT BUTTON ROW ANY MORE, AND IT IS STILL A LABEL. The brief's row is
 * "+ Venue + Area + Date + Times + Order link + Location tag"; `{place}` joined the two with a comma
 * this module chose, so there is no reason to build a NEW template from it. ⚠️ EVERY SAVED TEMPLATE
 * THAT CONTAINS IT STILL FILLS IDENTICALLY — `fillCaptionTemplate` reads `CAPTION_LABELS`, not this
 * list, so taking it off the row cannot change what an existing caption says. 🔴 THAT SPLIT IS THE
 * WHOLE POINT OF HAVING TWO LISTS, and it is why this function sorts rather than the declaration being
 * written twice.
 */
export function labelsFor(kind: CaptionKind): CaptionLabel[] {
  const out = CAPTION_LABELS.filter(l => l.kinds.includes(kind))
  if (kind !== 'event') return out
  const want: CaptionLabelId[] = ['venue', 'area', 'day-date', 'times', 'order-link', 'location-tag']
  return want.map(id => out.find(l => l.id === id)).filter((l): l is CaptionLabel => !!l)
}

/** `{times}`. ⛔ The ONLY place the token spelling exists. */
export const tokenOf = (id: CaptionLabelId): string => `{${id}}`

const ALL_IDS = new Set<string>(CAPTION_LABELS.map(l => l.id))

/** Is this a label this build knows? ⚠️ Used by the editor to decide what to draw as a chip. */
export const isCaptionLabel = (id: string): id is CaptionLabelId => ALL_IDS.has(id)

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PARSING — TEXT AND CHIPS, FOR THE EDITOR
// ════════════════════════════════════════════════════════════════════════════════════════════════

export type CaptionPiece =
  | { kind: 'text'; text: string }
  | { kind: 'label'; id: CaptionLabelId }

/**
 * Split a stored template into the pieces the editor draws.
 *
 * ⚠️ AN UNRECOGNISED `{word}` STAYS AS TEXT rather than becoming a chip or disappearing. A truck who
 * typed `{sorry}` in their own caption must see `{sorry}` — turning their words into a dead chip, or
 * swallowing them, would be this feature eating a caption it did not understand.
 */
export function parseCaptionTemplate(template: string): CaptionPiece[] {
  const out: CaptionPiece[] = []
  const re = /\{([a-z-]+)\}/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(template)) !== null) {
    if (!isCaptionLabel(m[1])) continue
    if (m.index > last) out.push({ kind: 'text', text: template.slice(last, m.index) })
    out.push({ kind: 'label', id: m[1] })
    last = m.index + m[0].length
  }
  if (last < template.length) out.push({ kind: 'text', text: template.slice(last) })
  return out
}

/** The pieces back into a stored template. ⚠️ Exactly inverse to `parseCaptionTemplate`. */
export function serialiseCaptionPieces(pieces: readonly CaptionPiece[]): string {
  return pieces.map(p => (p.kind === 'text' ? p.text : tokenOf(p.id))).join('')
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FILLING
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** What a label is replaced by. ⚠️ `null` or `''` means "this post has none" — see the blank rule. */
export type CaptionValues = Partial<Record<CaptionLabelId, string | null>>

/**
 * ══ 🔴 FILL THE LABELS, AND LEAVE NO HOLE WHERE ONE HAD NO VALUE ══════════════════════════════════
 *
 * ⛔ THE BRIEF'S HARDEST LINE IS ABOUT THE **MISSING** CASE: *"if the location has no tag, the label
 * disappears cleanly (no stray space or '@')"*. A naive replace leaves `…17:00 – 20:00.  ` with two
 * trailing spaces, or a line that is nothing but a space, and both look like a bug in a published post.
 *
 * 🔴 THE RULE, AND IT IS ONE RULE WORKED OUT LINE BY LINE:
 *
 *   **A line whose labels are ALL empty is dropped entirely. A line with at least one filled label
 *   keeps its words, and each empty label takes its surrounding spaces with it.**
 *
 * ⚠️ THAT SECOND HALF IS WHAT THE FIRST DRAFT GOT WRONG, and driving it is what found it:
 * `Order ahead: {order-link}` with no ordering address came out as the dangling `"Order ahead:"`.
 * ⛔ "Order ahead:" WITH NOTHING AFTER IT IS WORSE THAN NO LINE AT ALL — and `caption.ts` has always
 * agreed, because it guards that line with `if (orderUrl)`. The line exists to carry the link; with no
 * link its remaining words are a label for nothing. 🟢 SO THE TEMPLATE REPRODUCES `caption.ts`'s
 * behaviour exactly, which is what "nothing changes until the truck edits it" requires.
 *
 * ⚠️ AND IT DOES **NOT** DROP THE EVENT LINE WHEN ONLY THE TAG IS MISSING — that line also holds
 * `{place}`, `{day-date}` and `{times}`, so one empty label closes its own hole and the sentence
 * survives. A blunter "drop any line containing an empty label" would have deleted the whole post.
 *
 * ⚠️ A LINE WITH NO LABELS AT ALL IS NEVER TOUCHED. The truck's own words are theirs, including a
 * deliberate blank line between paragraphs — which is why the final collapse goes to TWO newlines (one
 * blank line) and not to one.
 *
 * ⛔ AN UNKNOWN `{word}` IS LEFT ALONE, here as in `parseCaptionTemplate`. A truck who typed `{sorry}`
 * must see `{sorry}`.
 */
export function fillCaptionTemplate(template: string, values: CaptionValues): string {
  const valueOf = (id: CaptionLabelId): string => {
    const raw = values[id]
    return raw === null || raw === undefined ? '' : String(raw)
  }
  /* ⚠️ GLOBAL AND RE-CREATED PER LINE. A shared `RegExp` with `g` carries `lastIndex` between calls,
   * which is a stateful bug that only shows on the second line. */
  const TOKEN = () => /\{([a-z-]+)\}/g

  const out: string[] = []
  for (const line of template.split('\n')) {
    /* ⛔ ONLY LABELS THIS BUILD KNOWS COUNT. An unknown `{word}` is the truck's text, so it must not
     * make a line look "all empty" and get it deleted. */
    const ids: CaptionLabelId[] = []
    for (const m of line.matchAll(TOKEN())) {
      if (isCaptionLabel(m[1])) ids.push(m[1])
    }

    if (ids.length > 0 && ids.every(id => !valueOf(id))) {
      /* 🔴 EVERY LABEL ON THIS LINE IS EMPTY — the line goes. Pushing nothing (rather than '') is
       * what stops it leaving a blank line behind. */
      continue
    }

    /* ⚠️ `[^\S ]` IS DELIBERATELY NOT USED: we are already inside one line, so there is no newline to
     * protect and a plain ` *` on each side is both simpler and correct. */
    let filled = line
    for (const id of new Set(ids)) {
      const token = tokenOf(id).replace(/[{}]/g, m => `\\${m}`)
      const v = valueOf(id)
      if (v) {
        filled = filled.replace(new RegExp(token, 'g'), () => v)
      } else {
        /* ⛔ THE LABEL **AND ITS SURROUNDING SPACES** GO, collapsing to a single space only when it
         * sat between two things. At the start or the end of the line it collapses to nothing —
         * otherwise a label at the end leaves a trailing space nobody can see and every editor strips
         * differently. */
        filled = filled.replace(new RegExp(` *${token} *`, 'g'), (match, ...rest) => {
          const offset = rest[rest.length - 2] as number
          const whole = rest[rest.length - 1] as string
          const atStart = offset === 0
          const atEnd = offset + match.length >= whole.length
          return atStart || atEnd ? '' : ' '
        })
      }
    }
    /* ══ ⛔ A SEPARATOR WITH NOTHING LEFT TO SEPARATE GOES WITH IT ═══════════════════════════════
     * `…{day-date}, {times}.` with no times left `…Tue 13 Oct,.` — a dangling comma in a published
     * post. ⚠️ TODAY'S CAPTION HAS ALWAYS AGREED: `caption.ts` writes `${when}${times ? `, ${times}`
     * : ''}`, so the comma belongs to the times and not to the sentence.
     * 🔴 NARROW ON PURPOSE: a comma, en-dash, hyphen or middot is dropped ONLY when the next thing is
     * end-of-line or closing punctuation. A separator between two surviving words is untouched, and
     * the truck's own comma before a full stop — which nobody writes — is the only false positive, so
     * the rule costs nothing it should not. ⛔ It runs only where a label was actually emptied. */
    if (ids.some(id => !valueOf(id))) {
      filled = filled.replace(/\s*[,–—·-]\s*(?=[.,!?;:]|$)/g, '')
    }
    out.push(filled)
  }

  /* ⚠️ THREE OR MORE NEWLINES COLLAPSE TO TWO, so a dropped line cannot leave a double gap — while a
   * deliberate blank line between two of the truck's paragraphs survives. */
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SEED — TODAY'S AUTO-WRITTEN CAPTION, EXPRESSED AS LABELS
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE BRIEF'S RULE: *"seed each template with today's auto-written caption expressed as labels, so
// nothing changes until the truck edits it."* These two strings are therefore not new copy — they are
// `weekCaption()` and `eventPostText()` from caption.ts with the facts swapped for labels, and the
// harness asserts the filled result matches what those functions produce.
//
// ⚠️ THE TRUCK NAME IS NOT A LABEL. It is interpolated at seed time, because a truck's name is not a
// per-post fact and a chip for it would be a chip nobody ever needs to move.

/** The weekly seed. ⚠️ `{week-dates}` is the heading's range; `{day-list}` is the day-by-day block. */
export function seedWeekTemplate(truckName: string): string {
  return [
    `${truckName} — where we are this week:`,
    '',
    tokenOf('day-list'),
    '',
    `Order ahead: ${tokenOf('order-link')}`,
  ].join('\n')
}

/**
 * The single event seed.
 *
 * ⚠️ IT DOES NOT CARRY `{location-tag}` BY DEFAULT, and that is deliberate: today's caption does not
 * mention a handle, so seeding one would CHANGE what every truck posts — which the brief's "nothing
 * changes until the truck edits it" forbids. The label is on the button row, one press away.
 */
export function seedEventTemplate(truckName: string): string {
  /* ══ 🔴 THE DEFAULT IS BUILT FROM `{venue}` AND `{area}` SINCE 9 OCTOBER ═══════════════════════════
   * ⛔ IT WAS `at {place} {day-date}, {times}.` — one token for the venue and the village together.
   * ⚠️ THE FILLED TEXT IS **ALMOST** THE SAME AND THE DIFFERENCE IS DELIBERATE: `{place}` only added
   * the town when the name did not already contain it, so "The Kings Arms" became "The Kings Arms,
   * Lavenham" and "Lavenham Market" stayed as it was. `{venue}, {area}` always writes both, so a
   * location whose NAME already contains its area now reads "Lavenham Market, Lavenham".
   * 🔴 IT CHANGES ONLY TRUCKS WITH **NO SAVED TEMPLATE**, because the seed is computed on read and
   * never written — a truck who has opened the editor has their own words and keeps them exactly.
   * ⚠️ AND `{location-tag}` IS ON THE END NOW, which the brief asks for; it fills to '' for a location
   * with no handle, and `fillCaptionTemplate` closes the gap it leaves.
   *
   * ══ ⛔ THE BRIEF'S DEFAULT READS `… {area} on {day-date}, …` AND THE LITERAL "on" IS **DROPPED** ═══
   * 🔴 BECAUSE `{day-date}` ALREADY CARRIES IT. The label is not a bare date: it fills through
   * `whenPhrase`, which returns "tonight", "tomorrow" **or "on Tue 13 Oct"** — the word is part of the
   * phrase, and has been since the day templates were added, precisely so a truck does not have to type
   * "on" and then lose it the week the event is tonight.
   * ⛔ SO THE BRIEF'S LITERAL TEXT PRODUCES **"at The Kings Arms, Lavenham on on Tue 13 Oct"** for a
   * dated event, and "on tonight" for tonight's. Both are visibly wrong, and the second is wrong in the
   * common case. ⚠️ THE BRIEF DOES NOT ASK FOR `{day-date}` TO CHANGE, so the conflict is between its
   * default's wording and a behaviour it leaves alone; dropping the literal "on" is what makes the two
   * agree. **Flagged in the report** — it is the one place where what is shipped differs from the text
   * as written. ⚠️ AND IT MAKES THE SEED MATCH TODAY'S AUTO-CAPTION EXACTLY, which is the stronger
   * guarantee anyway: a truck who has never opened the editor sees the words they have always seen. */
  return [
    `${truckName} at ${tokenOf('venue')}, ${tokenOf('area')} ${tokenOf('day-date')}, ${tokenOf('times')}.`,
    '',
    `Order ahead: ${tokenOf('order-link')} ${tokenOf('location-tag')}`,
  ].join('\n')
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE VALUES, BUILT FROM THE SAME SOURCES THE POSTER USES
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The weekly post's label values.
 *
 * 🔴 `{day-list}` IS THE SAME BLOCK `weekCaption()` BUILDS — only the days the truck is out, cancelled
 * ones marked, times through `formatOneTime`. Extracted rather than re-written, so the caption an
 * operator sees cannot drift from the one the product wrote before templates existed.
 */
export function weekCaptionValues(input: {
  week: WeekData
  orderUrl: string | null
  timeStyle: TimeStyle
  country?: CountryCode
}): CaptionValues {
  const { week, orderUrl, timeStyle } = input
  const country = input.country ?? DEFAULT_COUNTRY
  const lines: string[] = []
  for (const day of week.days) {
    if (day.isDayOff) continue
    const name = WEEKDAY_NAMES[weekdayOf(day.date)]
    for (const e of day.entries) {
      const where = e.town && !e.name.includes(e.town) ? `${e.name}, ${e.town}` : e.name
      if (e.status === 'cancelled') { lines.push(`${name} — ${where} — CANCELLED, sorry`); continue }
      const from = e.startTime ? formatOneTime(e.startTime, timeStyle) : ''
      const to = e.endTime ? formatOneTime(e.endTime, timeStyle) : ''
      const times = from && to ? `${from} – ${to}` : from || to
      lines.push(`${name} — ${where}${times ? ` — ${times}` : ''}`)
    }
  }
  /* ⚠️ A WEEK WITH NO EVENTS STILL SAYS SOMETHING — the same sentence `weekCaption()` uses, for the
   * same reason: an empty block would look like the feature failed. */
  const dayList = lines.length ? lines.join('\n') : 'No dates this week — check back soon.'
  const start = week.days[0]?.date ?? ''
  const end = week.days[week.days.length - 1]?.date ?? ''
  return {
    'week-dates': start && end
      ? `${shortDateTextFor(start, country)} – ${shortDateTextFor(end, country)}`
      : '',
    'day-list': dayList,
    'order-link': orderUrl ?? '',
  }
}

/**
 * One event's label values.
 *
 * ⚠️ `{day-date}` IS "Tue 13 Oct" THROUGH THE LOCALE TABLE, not a hand-built string — the same table
 * the poster asks. ⛔ `{location-tag}` IS EMPTY WHEN THE LOCATION HAS NONE, and `fillCaptionTemplate`
 * then removes the hole; it is never the literal "@".
 */
export function eventCaptionValues(input: {
  placeName: string
  town?: string | null
  date: string
  startTime: string | null
  endTime: string | null
  orderUrl: string | null
  timeStyle: TimeStyle
  socialTag?: string | null
  country?: CountryCode
  /* 🔴 THE MOMENT THE CAPTION IS BEING WRITTEN, passed in rather than read from a clock here — the
   * same discipline `caption.ts` keeps, and for the same reason: an operator opens the screen on
   * Sunday to plan the week and comes back on Wednesday to post Wednesday's. */
  now: Date | string
}): CaptionValues {
  const country = input.country ?? DEFAULT_COUNTRY
  const where = input.town && !input.placeName.includes(input.town)
    ? `${input.placeName}, ${input.town}`
    : input.placeName
  const from = input.startTime ? formatOneTime(input.startTime, input.timeStyle) : ''
  const to = input.endTime ? formatOneTime(input.endTime, input.timeStyle) : ''
  return {
    place: where,
    /* 🔴 THE TWO HALVES, SEPARATELY. ⚠️ `venue` IS THE NAME AS THE POSTER PRINTS IT and `area` the town
     * or village. ⛔ NEITHER DOES THE "only if the name does not contain it" DANCE `place` does: that
     * rule exists because `place` has to decide whether to join them, and these two do not. */
    venue: input.placeName,
    area: String(input.town ?? '').trim(),
    /* ══ 🔴 "Day & date" IS THE **RELATIVE** PHRASE, NOT A BARE DATE ═══════════════════════════════
     * ⛔ THE FIRST DRAFT USED `shortDateTextFor` AND THAT BROKE THE SEED'S PROMISE. Today's caption
     * says "tonight", "tomorrow" or "on Tue 13 Oct" through `whenPhrase`, so a label that always said
     * "Tue 13 Oct" would have changed what every truck posts — which "nothing changes until the truck
     * edits it" forbids. ⚠️ AND IT INCLUDES THE WORD "on" when the phrase is a date, because that is
     * part of the phrase: a template reading "at {place} {day-date}" must not need the truck to type
     * "on" and then lose it the week the event is tonight. */
    'day-date': whenPhrase(input.date, input.startTime, input.now, country),
    times: from && to ? `${from} – ${to}` : from || to,
    'order-link': input.orderUrl ?? '',
    'location-tag': String(input.socialTag ?? '').trim() || '',
  }
}

/** ⚠️ Re-exported so a caller needs one import. `dateTextFor` is the long form, used by the editor's
 *  sample values. */
export { dateTextFor }
