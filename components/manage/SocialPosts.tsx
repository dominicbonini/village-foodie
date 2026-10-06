'use client'

// components/manage/SocialPosts.tsx — Schedule › Social posts.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 TWO AREAS, SIX BOXES, AND NOT ONE NEW WAY TO MAKE OR EDIT ANYTHING
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//   Make a post  ·  Weekly post · Single event post · Post for a place
//   Designs      ·  Weekly post design · Event post design · Designs for a place
//
// ⛔ EVERY BOX IS A DOOR, NOT A SCREEN. "Make this week's post" opens `WeeklyPostApp`'s post screen;
// every "Make post" opens `EventPostModal` — the SAME modal the Events list opens; "Edit weekly
// design" and "Edit event design" open `WeeklyPostApp`'s and `EventSetupScreen`'s existing setup
// screens; and the place design editor is `EventSetupScreen` focused on one place, so the drag surface
// whose pointer handling took three fixes exists exactly once in this product.
//
// 🔴 WHAT THIS FILE ADDS IS THE ANSWER TO "WHAT CAN I POST, AND WHAT WILL IT LOOK LIKE?" — which is a
// question nothing answered. Making a post for a pitch meant finding its event in a list of every
// event; giving a pitch its own picture meant a tab that no longer exists.
//
// ⚠️ ONE READ FOR THE WHOLE PAGE. `social_overview` on /api/weekly-post returns the two designs, the
// next six events and every place with ONE signed thumbnail URL each. ⛔ THE ALTERNATIVE WAS A LOOP:
// the only action that signed a place's picture was `event_load`, which also reads up to 200 events in
// each direction — twenty-one copies of that to draw twenty-one 64px squares.
//
// ⚠️ THE PRIVACY RULE IS THE SERVER'S. A private event arrives with `isPrivate: true` and no venue, no
// town and no place; it is drawn greyed, in its date position, with no button. A place's `next` is its
// next PUBLIC event, because that is the event its button would post. Nothing here decides any of that.

import { useCallback, useEffect, useMemo, useState } from 'react'
/* ⛔ `Btn` IS NO LONGER IMPORTED (6 October 2026). Its `colour` palette is the dashboard's, where
 * orange is the ordinary button; on this screen orange MEANS "make something" and nothing else, so the
 * two shapes are `BTN_PRIMARY` and `BTN_OUTLINE` below and there are exactly two primaries. */
import { Card, Input, Spinner } from '@/components/manage/primitives'
/* 🔴 THE ONE TIME-RANGE FORMATTER. See the tombstone where this file had its own. */
import { formatTimeRange } from '@/lib/time-utils'
import { WeeklyPostApp } from '@/components/manage/WeeklyPost'
import { EventSetupScreen, EventPostModal } from '@/components/manage/EventPost'
import { FeatureGate } from '@/components/FeatureGate'
import { WEEKLY_POST_PLAN_REFUSAL } from '@/lib/copy/weeklyPost'
import { manageSectionHref } from '@/lib/manage-links'
import type { Plan } from '@/lib/features'
import {
  MAKE_POST_FOOTNOTE, WEEKLY_BOX_BLURB, EVENT_BOX_BLURB, PLACE_POST_BOX_BLURB, PRIVATE_EVENT_ROW,
  WEEKLY_DESIGN_BLURB, EVENT_DESIGN_BLURB, PLACE_POST_FOOTER_NOTE,
  INTRO_DESIGNS_WORD, INTRO_MAKE_WORD, INTRO_AFTER_DESIGNS, INTRO_AFTER_MAKE,
  WEEKLY_DESIGN_USED_FOR, EVENT_DESIGN_USED_FOR, USED_FOR_LABEL,
  PLACE_DESIGN_BLURB_BEFORE, PLACE_DESIGN_BLURB_BOLD, PLACE_DESIGN_BLURB_AFTER,
  EMPTY_WEEKLY_TITLE, EMPTY_EVENT_TITLE, EMPTY_BODY, EMPTY_BUTTON,
  placeDesignScope, standardDesignConfirm, USE_STANDARD_LINK, POST_NAME_HINT,
} from '@/lib/copy/socialPosts'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SHAPES `social_overview` ANSWERS WITH
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** One event, as the page draws it. ⛔ A private one carries no location of any kind — see the route. */
export interface PostEvent {
  id: string
  date: string
  startTime: string | null
  endTime: string | null
  isPrivate: boolean
  venue: string | null
  town: string | null
  placeId: string | null
  /** Which design this post WILL use. `own` only when the place has a picture of its own. */
  design: 'own' | 'standard' | 'none'
}

export interface PostPlace {
  id: string
  name: string
  shortName: string | null
  area: string | null
  isFavourite: boolean
  hasPicture: boolean
  /** A short-lived signed URL, from the ONE read. Null when the place has no picture of its own. */
  imageUrl: string | null
  width: number | null
  height: number | null
  ownPositions: boolean
  /** The next PUBLIC event here, or null. */
  next: PostEvent | null
  upcoming: PostEvent[]
}

interface Overview {
  weekly: {
    ready: boolean
    previewUrl: string | null
    /** The design's own pixel size, so the preview tile is drawn in its shape rather than a guess. */
    width: number | null
    height: number | null
    thisWeek: { start: string; end: string; events: number }
    nextWeek: { start: string; end: string; events: number }
    defaultWeek: 'this' | 'next'
  }
  standard: { ready: boolean; previewUrl: string | null; width: number | null; height: number | null }
  upcoming: PostEvent[]
  places: PostPlace[]
}

export type SocialArea = 'posts' | 'designs'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SMALL SHARED PIECES
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** "Tue 13 Oct" — built from the 'YYYY-MM-DD' PARTS, never `new Date(str)`, which on a date-only value
 *  is UTC midnight and renders as the previous day west of here. */
export function shortDate(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

/* ⛔ `timeLabel` WAS A SECOND TIME FORMATTER (6 October 2026). It wrote `17:00–20:00` with no spaces
 * around the dash while the rest of the product writes `17:00 – 20:00`, through `formatTimeRange` —
 * whose own note says "use this everywhere a start–end pair is shown so no surface re-introduces
 * seconds (the recurring bug)". This surface was the next one to re-introduce it. */

/* ══ 🔴 THE COLOUR BAR SAYS WHICH DESIGN THE POST WILL USE ═══════════════════════════════════════
 * It is the one thing an operator cannot otherwise tell before pressing the button.
 * ⛔ IT IS 4px AND FULL ROW HEIGHT (6 October 2026). It was `h-8 w-1` — a 4px stub floating beside a
 * taller row, which read as a bullet rather than as the row's own marker.
 * ⚠️ DARK NAVY FOR STANDARD, NOT GREY. Grey on white at 4px is invisible at arm's length on a laptop,
 * and "which design" is the question the bar exists to answer.
 * ⚠️ A PRIVATE ROW HAS NO BAR AT ALL, because it has no post — `none` is transparent and keeps the
 * row's text aligned with the ones above and below it. */
const DESIGN_BAR: Record<PostEvent['design'], string> = {
  own: 'bg-orange-500',
  standard: 'bg-slate-800',
  none: 'bg-transparent',
}

/* ══ 🔴 A BOX HEADING IS A HEADING, NOT A LABEL (6 October 2026) ══════════════════════════════════
 * ⛔ IT WAS `SUBCARD_HEADING` — `text-xs font-black uppercase tracking-widest`. That treatment is for
 * a label ABOVE a group of controls; on a card that is one of three choices it made the three boxes
 * read as three form sections rather than as three things you can do. Bold, title case, 17px, dark.
 * ⚠️ ASSERTED BY scripts/social-posts-render.cjs AS A COMPUTED `text-transform: none`, which is the
 * only way to tell a title-case string from an uppercased one after the browser has had it. */
const BOX_HEADING = 'text-[17px] font-bold leading-tight text-slate-900'

/** The description line, directly under the heading. */
const BOX_BLURB = 'mt-1 text-sm text-slate-500'

/* ══ 🔴 BUTTON HIERARCHY: ORANGE MEANS "MAKE SOMETHING" ══════════════════════════════════════════
 * ⛔ AND NOTHING ELSE. Two orange buttons in this product now: "Make this week's post" and "Make post
 * for <date>" in the place editor. Every per-row Make post, every Edit, and "Give own design" are
 * OUTLINED — white, grey border, dark text.
 * 🔴 WHY IT MATTERS ON THIS SCREEN IN PARTICULAR: an operator scanning six boxes should be able to see
 * where the irreversible-ish act is. Fourteen orange buttons on one page is no hierarchy at all.
 * ⚠️ `scripts/social-posts-render.cjs` COUNTS THE ORANGE ONES and names which ids may be orange. */
const BTN_PRIMARY =
  'inline-flex items-center justify-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50'
const BTN_OUTLINE =
  'inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'

/** A box on either area. ⚠️ `min-w-0` on every one: a grid column will not shrink below its content
 *  without it, and one long venue name would then push the whole page sideways. */
function Box({ title, blurb, children, className = '' }: {
  title: string
  /** The description line. ⚠️ It belongs to the HEADING, so it is a prop rather than the first child —
   *  that is what keeps the gap between them the same in all six boxes.
   *  ⚠️ A NODE, NOT A STRING, because one of the six has two bold words in it. */
  blurb?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={`flex min-w-0 flex-col p-4 ${className}`}>
      <p className={BOX_HEADING}>{title}</p>
      {blurb && <p className={BOX_BLURB}>{blurb}</p>}
      <div className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </Card>
  )
}

/**
 * ══ 🔴 ONE EMPTY STATE, THE SAME IN EVERY BOX THAT CANNOT WORK YET (6 October 2026, Dominic) ══════
 *
 * ⛔ THERE WERE THREE DIFFERENT ANSWERS TO ONE SITUATION. With no design the weekly box relabelled its
 * orange button, boxes 2 and 3 showed a grey line and left their Make post buttons greyed, and the
 * lists underneath went on listing events nobody could post. Three treatments of "you have not
 * uploaded a picture yet" is three things for an operator to work out, and the greyed buttons were the
 * worst of them: a disabled control is a promise that it will work under some condition the screen
 * does not name.
 * 🔴 THIS REPLACES THE BOX'S BODY AND NOTHING ELSE. The heading and the description stay, which is
 * what makes it read as "not yet" rather than "not available".
 * ⚠️ `flex-1` AND `items-center justify-center`, so the panel fills the box and the three boxes stay
 * the same height whichever of them are empty.
 * ⛔ NO ORANGE. Orange means "make something", and making something is the one thing this box cannot
 * do; the button that leaves is outlined like every other button that goes somewhere.
 */
function EmptyBox({ title, onGo }: { title: string; onGo: () => void }) {
  return (
    <div data-empty-box
      className="flex min-h-[9rem] flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
      <p className="text-sm font-bold text-slate-700">{title}</p>
      <p className="max-w-[20rem] text-sm text-slate-500">{EMPTY_BODY}</p>
      <button type="button" className={`${BTN_OUTLINE} mt-1`} onClick={onGo}>{EMPTY_BUTTON}</button>
    </div>
  )
}

/**
 * The "Used for:" panel under a design's picture.
 *
 * ⛔ IT ANSWERS THE QUESTION THE TWO DESIGN BOXES COULD NOT. They are two pictures with almost
 * identical descriptions; what tells them apart is not what is ON them, it is which posts USE them.
 */
function UsedFor({ text }: { text: string }) {
  return (
    <p data-used-for className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
      <span className="font-bold text-slate-700">{USED_FOR_LABEL}</span> {text}
    </p>
  )
}

/**
 * ══ 🔴 A DESIGN PREVIEW TILE — THE SAME SIZE WHETHER OR NOT THERE IS A PICTURE ════════════════════
 *
 * ⛔ THE EMPTY STATE USED TO BE A DIFFERENT SHAPE. An `aspect-[4/5]` box with no image collapsed to
 * whatever its content needed, so "Not set up" drew a thin bar where a tall tile would be — and the
 * two Designs boxes were then different heights for a reason that had nothing to do with the designs.
 * 🔴 THE SIZE IS FIXED AND IS THE DESIGN'S OWN SHAPE: `width`/`height` come from the row, so an event
 * design that is square previews square. ⚠️ FALLS BACK TO 4:5, which is what the weekly poster is.
 * ⚠️ "No design yet" IS CENTRED IN THE SAME TILE, not beside it — that is the whole point.
 */
function DesignTile({ url, w, h }: { url: string | null; w: number | null; h: number | null }) {
  /* 🔴 A FIXED HEIGHT AND A DERIVED WIDTH, not `aspect-ratio` on a full-width box. Three boxes in a
   * row are different widths; a width-driven aspect ratio would make the three previews three
   * different heights, which is the thing this is here to stop.
   *
   * ══ ⛔ AND THE WIDTH IS CAPPED, BECAUSE A LANDSCAPE DESIGN BURST OUT OF ITS BOX (6 Oct 2026) ══════
   * REPORTED BY DOMINIC: the event post design stretched past the edge of its card. With a fixed
   * height and NO cap, a 1920×1080 design is 220 × 391px — and the column it sits in is between 200
   * and 320px wide. Every design I had measured was portrait, so the fixture never produced a tile
   * wider than its box and the harness could not see it.
   * 🔴 SO THE HEIGHT IS THE TARGET, NOT THE RULE: 220px tall unless that would make it wider than
   * `MAX_W`, in which case the WIDTH caps and the height follows the ratio down. A 4:5 design is
   * exactly 176×220 — the agreed tile — and a landscape one is 176 wide and short, which is what a
   * landscape design actually looks like.
   * ⚠️ `maxWidth: '100%'` IS THE BELT TO THAT BRACES. 176 fits a 200px column with `p-4` (168px of
   * content) to within 8px, and a future column narrower than that must still not overflow. */
  const ratio = w && h ? w / h : 4 / 5
  const H = 220
  const MAX_W = 176
  const width = Math.min(Math.round(H * ratio), MAX_W)
  const height = Math.round(width / ratio)
  return (
    <div
      data-design-tile
      style={{ height, width, maxWidth: '100%' }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-center text-[11px] font-semibold text-slate-400"
    >
      {url
        /* eslint-disable-next-line @next/next/no-img-element -- a signed, expiring Supabase URL;
           next/image would need the host in `remotePatterns` and would proxy a private object. */
        ? <img src={url} alt="" className="h-full w-full object-cover" />
        : 'No design yet'}
    </div>
  )
}

/**
 * A place's tile in "Designs for a place" — 28×35, portrait.
 *
 * ⛔ A PLACE ON STANDARD GETS A PLAIN TILE WITH NO TEXT IN IT. It said "Standard" in 9px inside a
 * 40px box, which is unreadable AND redundant: the tag beside it says the same word at a size somebody
 * can read. A tile is there to show a picture or to show that there is not one.
 */
function PlaceTile({ url }: { url: string | null }) {
  return (
    <div data-place-tile
      className="flex h-[35px] w-[28px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100">
      {url
        /* eslint-disable-next-line @next/next/no-img-element -- a signed, expiring Supabase URL. */
        ? <img src={url} alt="" className="h-full w-full object-cover" />
        : null}
    </div>
  )
}

/**
 * "Own design" — a small rounded tag, to the right of the name and before the button.
 *
 * ══ ⛔ THE "Standard" TAG IS GONE (6 October 2026, Dominic) ═══════════════════════════════════════
 * REPORTED AS "remove the event type from Designs for a place", and that is exactly how it read:
 * **Standard is the name of an EVENT TYPE** in this product — it is the first pill on the Event types
 * grid and on every Add event form — and a grey "Standard" tag on a place row looked like that type
 * having been attached to the place.
 * 🔴 AND IT CARRIED NO INFORMATION. Every place without its own design is on the event design; a tag
 * on all of them says only "this row is a row". What is worth marking is the EXCEPTION, which is the
 * handful of places that have their own — so only that one is drawn.
 * ⚠️ THE DEFAULT IS STILL VISIBLE ON THE ROW, twice over: a blank tile rather than a thumbnail, and a
 * button that reads "Design" rather than "Edit". Nothing was lost with the word.
 */
function DesignTag({ own }: { own: boolean }) {
  if (!own) return null
  return <span data-design-tag className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">Own design</span>
}

/** "✓ Set up" / "Not set up". */
function ReadyBadge({ ready }: { ready: boolean }) {
  return ready
    ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">✓ Set up</span>
    : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Not set up</span>
}

/** The back link at the top of every full-page view this file opens. */
function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="text-xs font-bold text-slate-500 hover:text-slate-800">‹ {label}</button>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE PANE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 THE MOUNT, AND THE GATE ═══════════════════════════════════════════════════════════════════
 *
 * ⚠️ `schedule_graphics` IS CHECKED PER BOX, NOT AROUND THE PAGE, because the brief asks for the
 * locked state INSIDE the weekly box. ⛔ AND THE OTHER TWO BOXES ARE LOCKED THE SAME WAY, which the
 * brief does not say in so many words: /api/weekly-post gates EVERY action on `schedule_graphics`
 * (`gated()` runs once at the top of POST), so a Make post button on a truck without it would open a
 * modal that 403s. A button that cannot work is worse than a locked box that says why.
 * ⚠️ NO TRUCK IS IN THAT STATE TODAY: the preview key is on Pizza Kitchen, which is on `trial`, and
 * TRIAL_FEATURES spreads MAX_FEATURES. See docs/social-posts-report.md.
 *
 * ⚠️ THE PREVIEW KEY IS NOT CHECKED HERE. The page.tsx pill list already filters on it, so a truck
 * without it cannot reach this component at all — and the route refuses it a second time.
 */
export function SocialPostsPane({ truck, token, area, onArea, manageApi }: {
  truck: {
    plan: Plan
    feature_overrides: Record<string, boolean> | null
    trial_expires_at: string | null
    name?: string | null
  } | null
  token: string
  /** Which of the two areas is open. It is in the URL — see lib/manage-links.ts. */
  area: SocialArea
  onArea: (a: SocialArea) => void
  /** /api/manage, for the one field this page writes that is not a design: a place's name on posts. */
  manageApi: (action: string, extra?: Record<string, unknown>) => Promise<unknown>
}) {
  return (
    <SocialPosts truck={truck} token={token} area={area} onArea={onArea} manageApi={manageApi} />
  )
}

type View =
  | { kind: 'boxes' }
  | { kind: 'weekly-post'; week: 'this' | 'next' }
  | { kind: 'weekly-design' }
  | { kind: 'event-design' }
  | { kind: 'place-design'; placeId: string }

function SocialPosts({ truck, token, area, onArea, manageApi }: {
  truck: {
    plan: Plan
    feature_overrides: Record<string, boolean> | null
    trial_expires_at: string | null
    name?: string | null
  } | null
  token: string
  area: SocialArea
  onArea: (a: SocialArea) => void
  manageApi: (action: string, extra?: Record<string, unknown>) => Promise<unknown>
}) {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'boxes' })
  /** The event whose post modal is open. One at a time, closed by setting this to null. */
  const [posting, setPosting] = useState<string | null>(null)
  const [week, setWeek] = useState<'this' | 'next'>('this')
  const [eventSearch, setEventSearch] = useState('')
  const [designSearch, setDesignSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/weekly-post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'social_overview' }),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      /* 🔴 THE SERVER'S OWN SENTENCE, SHOWN AS IT CAME BACK. The refusals here are specific — a truck
       * without the plan is told which plan — and "something went wrong" would strip the only part an
       * operator can act on. */
      if (!r.ok) throw new Error(String(j.error ?? 'That did not work.'))
      setData(j as unknown as Overview)
      setWeek((j as unknown as Overview).weekly.defaultWeek)
      setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [token])

  /* ⚠️ THE DISABLE IS PER-LINE AND NARROW, as everywhere else in Manage. The setState calls are inside
   * `load`, after an await — the rule's own "subscribe and set state in the callback" — and the rule is
   * static and cannot see past the call. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const gate = (children: React.ReactNode) => (
    <FeatureGate
      feature="schedule_graphics"
      plan={truck?.plan}
      overrides={truck?.feature_overrides}
      trialExpiresAt={truck?.trial_expires_at}
      upgradeMessage={WEEKLY_POST_PLAN_REFUSAL}
    >
      {children}
    </FeatureGate>
  )

  const back = () => { setView({ kind: 'boxes' }); void load() }

  // ── THE FULL-PAGE VIEWS ──────────────────────────────────────────────────────────────────────
  if (view.kind === 'weekly-post') {
    return (
      <div className="space-y-3">
        <BackLink label="Social posts" onClick={back} />
        {gate(<WeeklyPostApp token={token} truckName={truck?.name ?? 'Your truck'}
          initialMode="post" initialWeek={view.week} onBack={back} />)}
      </div>
    )
  }
  if (view.kind === 'weekly-design') {
    return (
      <div className="space-y-3">
        <BackLink label="Designs" onClick={back} />
        {gate(<WeeklyPostApp token={token} truckName={truck?.name ?? 'Your truck'}
          initialMode="setup" initialDesignKind="week" hideKindSwitch onBack={back} />)}
      </div>
    )
  }
  if (view.kind === 'event-design') {
    return (
      <div className="space-y-3">
        <BackLink label="Designs" onClick={back} />
        {gate(<EventSetupScreen token={token} onlyStandard onCancel={back} />)}
      </div>
    )
  }
  if (view.kind === 'place-design') {
    const place = data?.places.find(p => p.id === view.placeId) ?? null
    return (
      <PlaceDesignPage
        token={token} manageApi={manageApi} place={place} placeId={view.placeId}
        onBack={back}
        onMakePost={id => setPosting(id)}
        gate={gate}
      />
    )
  }

  // ── THE BOXES ────────────────────────────────────────────────────────────────────────────────
  const places = data?.places ?? []
  const withOwn = places.filter(p => p.hasPicture).length

  const matches = (p: PostPlace, q: string) => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return p.name.toLowerCase().includes(s)
      || String(p.shortName ?? '').toLowerCase().includes(s)
      || String(p.area ?? '').toLowerCase().includes(s)
  }

  /* 🔴 PLACES WITH THEIR OWN DESIGN COME FIRST in Box 3 of Designs — the brief's order, and the right
   * one: the list's job there is "what have I given a picture to, and what is still on Standard?", and
   * a truck with twenty places and two designs should see the two without scrolling. */
  const designList = places.filter(p => matches(p, designSearch))
    .slice()
    .sort((a, b) => (a.hasPicture === b.hasPicture ? 0 : a.hasPicture ? -1 : 1))

  const postList = places.filter(p => matches(p, eventSearch))

  const weekChoice = week === 'this' ? data?.weekly.thisWeek : data?.weekly.nextWeek

  /* ══ ⛔ THE "Set up your event design first" LINE AND THE DISABLED BUTTONS ARE GONE (6 Oct 2026) ═══
   * They were one of THREE different answers to one situation — the weekly box relabelled its orange
   * button, boxes 2 and 3 greyed theirs under a note, and the lists went on listing events nobody
   * could post. ⛔ A DISABLED CONTROL IS A PROMISE that it will work under some condition the screen
   * does not name. `EmptyBox` replaces all three, identically. */

  /* 🔴 "Go to Designs" SWITCHES THE AREA, AND THAT IS ALL IT DOES. It does not open a particular
   * editor: the operator may need the weekly one or the event one, and Designs is where both are.
   * ⚠️ IT GOES THROUGH `onSectionChange`, so the URL becomes `?section=designs` — the area is
   * addressable and a reload stays put. Same path the segmented control takes. */
  const goToDesigns = () => onArea('designs')

  return (
    <div className="space-y-3" data-social-posts>
      {/* ── HEADER ───────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-black text-slate-900">Social posts</p>
          {/* ══ 🔴 THE INTRO NAMES THE TWO AREAS AND THE ORDER THEY GO IN (6 October 2026) ══════════
            * ⛔ IT SAID "Make a picture for your week, an event or a place — and set up how they look."
            * That named the six boxes and said nothing about the choice an operator has to make first:
            * which area they are in, and why there are two.
            * 🔴 Designs is the ONCE; Make a post is the EVERY WEEK. An operator who reads this knows
            * why a Make a post box can be empty before they meet one.
            * ⚠️ THE TWO BOLD WORDS ARE THE SEGMENTED CONTROL'S OWN LABELS, so they read as the control
            * rather than as emphasis. */}
          <p className="mt-0.5 max-w-[46rem] text-sm text-slate-500" data-page-intro>
            <span className="font-bold text-slate-700">{INTRO_DESIGNS_WORD}</span>{INTRO_AFTER_DESIGNS}
            <span className="font-bold text-slate-700">{INTRO_MAKE_WORD}</span>{INTRO_AFTER_MAKE}
          </p>
        </div>
        {/* ══ 🔴 A SEGMENTED CONTROL, AND IT IS IN THE URL ═══════════════════════════════════════
          * "Send me the designs screen" has to be a link somebody can send, so the choice is
          * `?section=posts` / `?section=designs` through the one builder rather than React state
          * nobody can address.
          * ⛔ A LIGHT GREY TRACK WITH A WHITE SELECTED SEGMENT, NOT ORANGE TEXT (6 October 2026). It
          * was an orange-on-pale-orange pill in a bordered box, which is this product's PRIMARY
          * colour — and a view switch is not an action. Orange is reserved for making something. */}
        <div role="tablist" aria-label="Social posts area" data-social-area
          className="inline-flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1">
          {([['posts', 'Make a post'], ['designs', 'Designs']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={area === k}
              onClick={() => onArea(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${area === k
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-red-600">
          {error}
          <button type="button" onClick={() => void load()}
            className="font-semibold underline hover:no-underline">Retry</button>
        </p>
      )}
      {!data && !error && <div className="p-8 text-center"><Spinner /></div>}

      {data && area === 'posts' && (
        <>
          {/* ══ 🔴 THREE EQUAL COLUMNS FROM **900px**, ONE BELOW IT (6 October 2026) ═══════════════
            * ⛔ IT WAS `lg:` — 1024px — AND THAT WAS WRONG ON THE MACHINE THIS IS USED ON. A 16in
            * MacBook Pro in Safari with a normal window is 1000–1100px wide, so the three boxes
            * STACKED on a laptop, which is the width the design was drawn for.
            * ⛔ AND THE RENDER HARNESS COULD NOT SEE IT: it measured 1440 (side by side) and 820
            * (stacked) and never a laptop window. **A breakpoint with no measurement between its two
            * sides is a breakpoint nobody has checked.** It is measured at 1000, 1100, 1280, 1440 and
            * 1728 now, and 900 is below every one of them.
            * ⚠️ `min-[900px]:` IS AN ARBITRARY VARIANT, not a custom screen. Tailwind 4 supports it,
            * and a one-off breakpoint used by exactly two grids does not belong in the theme.
            * ⚠️ `items-stretch`, so three boxes of very different content lengths are the same height —
            * which is what makes them read as three choices of one kind rather than three loose cards. */}
          <div className="grid grid-cols-1 items-stretch gap-3 min-[900px]:grid-cols-3" data-make-boxes>
            {/* ── BOX 1 · WEEKLY ─────────────────────────────────────────────────────────────── */}
            <Box title="Weekly post" blurb={WEEKLY_BOX_BLURB}>
              {gate(!data.weekly.ready ? (
                <EmptyBox title={EMPTY_WEEKLY_TITLE} onGo={goToDesigns} />
              ) : (
                <>
                  <label className="block text-xs font-bold text-slate-600">Which week</label>
                  <select value={week} onChange={e => setWeek(e.target.value as 'this' | 'next')}
                    data-week-select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                    <option value="this">This week · {shortDate(data.weekly.thisWeek.start)} – {shortDate(data.weekly.thisWeek.end)}</option>
                    <option value="next">Next week · {shortDate(data.weekly.nextWeek.start)} – {shortDate(data.weekly.nextWeek.end)}</option>
                  </select>
                  {/* ⛔ NO "last made" — WE DO NOT STORE IT. The brief says to leave it out rather than
                    * invent one, and a date nobody recorded would be a date an operator plans around. */}
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {weekChoice?.events ?? 0} event{(weekChoice?.events ?? 0) === 1 ? '' : 's'}
                  </p>
                  {/* 🔴 THE ONE ORANGE BUTTON ON THIS AREA, and it is only ever drawn when the design
                    * is ready — the empty state above is the other branch. ⛔ IT NO LONGER RELABELS
                    * ITSELF TO "Set up weekly design": a button that changes its own meaning depending
                    * on data the operator cannot see is a button they learn not to trust. */}
                  <div className="mt-auto pt-3">
                    <button type="button" data-primary className={`${BTN_PRIMARY} w-full`}
                      onClick={() => setView({ kind: 'weekly-post', week })}>
                      Make this week’s post
                    </button>
                  </div>
                </>
              ))}
            </Box>

            {/* ── BOX 2 · SINGLE EVENT ───────────────────────────────────────────────────────── */}
            <Box title="Single event post" blurb={EVENT_BOX_BLURB}>
              {gate(!data.standard.ready ? (
                <EmptyBox title={EMPTY_EVENT_TITLE} onGo={goToDesigns} />
              ) : (
                <>
                  {/* ⛔ `max-h-72` IS NOT DECORATION — IT IS WHAT MAKES THE LIST SCROLL (6 Oct 2026).
                      `flex-1 min-h-0 overflow-y-auto` lets a child be SHORTER than its content only
                      when something above it decides the height. These boxes sit in the page's own
                      flow with nothing capping them, so a truck with twenty places grew the box, and
                      `items-stretch` then dragged the other two boxes to the same height. Measured:
                      scripts/social-posts-render.cjs renders a 20-row list at three widths. */}
                  <ul className="mt-2 max-h-72 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto"
                    data-upcoming-list>
                    {data.upcoming.length === 0 && (
                      <li className="py-3 text-sm text-slate-400">Nothing coming up.</li>
                    )}
                    {/* ══ 🔴 THE ROW WRAPS RATHER THAN OVERFLOWS AT A NARROW COLUMN WIDTH ═══════════
                      * `flex-wrap` with the text block at `min-w-[9rem] flex-1`: at a comfortable
                      * width the date, the venue and the button sit on one line; when the column is
                      * too narrow for that the BUTTON drops under the text. ⛔ IT NEVER OVERFLOWS,
                      * which is what a `shrink-0` button in a `nowrap` row would do. */}
                    {data.upcoming.map(ev => (
                      <li key={ev.id} className="flex flex-wrap items-stretch gap-x-2 gap-y-1.5 py-2">
                        {/* ⚠️ `self-stretch` IS WHAT MAKES IT FULL ROW HEIGHT. `aria-hidden` because it
                            says which design, and the row already says everything a reader needs. */}
                        <span aria-hidden="true" data-design-bar
                          className={`w-1 shrink-0 self-stretch rounded-full ${DESIGN_BAR[ev.design]}`} />
                        <span className="min-w-[9rem] flex-1">
                          {/* ⛔ A PRIVATE EVENT KEEPS ITS DATE AND LOSES EVERYTHING ELSE. Its venue and
                              town never left the server. */}
                          <span className={`block truncate text-sm font-bold ${ev.isPrivate ? 'text-slate-400' : 'text-slate-900'}`}>
                            {shortDate(ev.date)}
                            <span className="ml-1.5 font-medium text-slate-400">{formatTimeRange(ev.startTime, ev.endTime)}</span>
                          </span>
                          <span className={`block truncate text-sm ${ev.isPrivate ? 'italic text-slate-400' : 'text-slate-500'}`}>
                            {ev.isPrivate ? PRIVATE_EVENT_ROW : (ev.venue ?? '—')}
                          </span>
                        </span>
                        {/* ⛔ NO BUTTON ON A PRIVATE EVENT, EVER. There is no post for one — the route
                            refuses `event_post` for it — so a button here would be one that cannot work.
                            ⚠️ AND NO `disabled` ARM ANY MORE: this list is only drawn when the design is
                            ready. With no design the whole box is the empty panel, which says what is
                            missing instead of greying six buttons that explain nothing. */}
                        {!ev.isPrivate && (
                          <button type="button" className={`${BTN_OUTLINE} self-center`}
                            onClick={() => setPosting(ev.id)}>Make post</button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-2">
                    <a href={manageSectionHref('events')}
                      className="text-sm font-semibold text-slate-600 underline hover:no-underline">
                      See all upcoming events
                    </a>
                  </div>
                </>
              ))}
            </Box>

            {/* ── BOX 3 · POST FOR A PLACE ───────────────────────────────────────────────────── */}
            <Box title="Post for a place" blurb={PLACE_POST_BOX_BLURB}>
              {gate(!data.standard.ready ? (
                <EmptyBox title={EMPTY_EVENT_TITLE} onGo={goToDesigns} />
              ) : (
                <>
                  <Input label="Search places" value={eventSearch} onChange={setEventSearch}
                    placeholder="Name or area" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                  <ul className="mt-2 max-h-72 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto"
                    data-place-post-list>
                    {postList.length === 0 && (
                      <li className="py-3 text-sm text-slate-400">
                        {places.length === 0 ? 'No places yet.' : 'Nothing matches that.'}
                      </li>
                    )}
                    {postList.map(pl => (
                      <li key={pl.id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2">
                        <span className="min-w-[9rem] flex-1">
                          <span className="block truncate text-sm font-bold text-slate-900">
                            {pl.name}{pl.area ? <span className="font-medium text-slate-400"> · {pl.area}</span> : null}
                          </span>
                          <span className="block truncate text-sm text-slate-500">
                            {pl.next ? `Next: ${shortDate(pl.next.date)}` : 'Nothing booked'}
                          </span>
                        </span>
                        {pl.next
                          ? <button type="button" className={BTN_OUTLINE}
                              onClick={() => setPosting(pl.next!.id)}>Make post</button>
                          /* ⚠️ A DASH, NOT A DISABLED BUTTON. A greyed button invites a press and then
                             explains nothing; a dash says there is nothing to do here. */
                          : <span aria-hidden="true" className="px-2 text-sm text-slate-300">—</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-auto pt-2 text-xs text-slate-400">
                    {places.length} place{places.length === 1 ? '' : 's'} · {PLACE_POST_FOOTER_NOTE}
                  </p>
                </>
              ))}
            </Box>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">{MAKE_POST_FOOTNOTE}</p>
        </>
      )}

      {/* ══ 🔴 TWO FIXED-ISH COLUMNS AND THE REST (6 October 2026) ═════════════════════════════════
        * The two design boxes hold a preview tile and a button; "Designs for a place" holds a list
        * that benefits from every pixel. ⛔ `1fr_1fr_1.4fr` GAVE THE LIST TOO LITTLE at 1000px and the
        * two previews too much at 1728.
        * ⚠️ `minmax(200px, 320px)` IS BOTH HALVES OF THE BRIEF: comfortable at ~320px on a wide
        * screen, and allowed to shrink to 200px below ~1100 **without leaving the row**.
        * ⚠️ AND THIS COMMENT IS OUT HERE RATHER THAN INSIDE THE `&& (` BELOW: a JSX comment cannot be
        * the first thing in a JavaScript parenthesis, only inside JSX. (Writing one out INSIDE a JSX
        * comment does not work either — its closing marker ends the comment it is being quoted in.) */}
      {data && area === 'designs' && (
        <div className="grid grid-cols-1 items-stretch gap-3 min-[900px]:grid-cols-[minmax(200px,320px)_minmax(200px,320px)_minmax(0,1fr)]"
          data-design-boxes>
          {/* ── BOX 1 · WEEKLY DESIGN ──────────────────────────────────────────────────────────── */}
          <Box title="Weekly post design" blurb={WEEKLY_DESIGN_BLURB}>
            {gate(
              <>
                {/* ⚠️ CENTRED, AND THE TILE IS THE SAME SIZE IN BOTH STATES. The badge sits under it,
                  * centred with it — so the two design boxes read as a matched pair whichever of them
                  * is set up. ⛔ `items-center` ON THE WRAPPER, not `mx-auto` on the tile: the badge has
                  * to share the centring or it drifts left when the tile is portrait. */}
                <div className="flex flex-col items-center">
                  <DesignTile url={data.weekly.previewUrl} w={data.weekly.width} h={data.weekly.height} />
                  <div className="mt-2"><ReadyBadge ready={data.weekly.ready} /></div>
                </div>
                <UsedFor text={WEEKLY_DESIGN_USED_FOR} />
                {/* 🔴 ORANGE, AND PINNED TO THE BOTTOM (6 October 2026, Dominic). On Designs, setting a
                  * design up IS the thing to do — these two are the only orange buttons on the area. */}
                <div className="mt-auto pt-3">
                  <button type="button" data-primary className={`${BTN_PRIMARY} w-full`}
                    onClick={() => setView({ kind: 'weekly-design' })}>
                    {data.weekly.ready ? 'Edit weekly design' : 'Set up weekly design'}
                  </button>
                </div>
              </>,
            )}
          </Box>

          {/* ── BOX 2 · EVENT DESIGN ───────────────────────────────────────────────────────────── */}
          <Box title="Event post design" blurb={EVENT_DESIGN_BLURB}>
            {gate(
              <>
                <div className="flex flex-col items-center">
                  <DesignTile url={data.standard.previewUrl} w={data.standard.width} h={data.standard.height} />
                  <div className="mt-2"><ReadyBadge ready={data.standard.ready} /></div>
                </div>
                <UsedFor text={EVENT_DESIGN_USED_FOR} />
                <div className="mt-auto pt-3">
                  <button type="button" data-primary className={`${BTN_PRIMARY} w-full`}
                    onClick={() => setView({ kind: 'event-design' })}>
                    {data.standard.ready ? 'Edit event design' : 'Set up event design'}
                  </button>
                </div>
              </>,
            )}
          </Box>

          {/* ── BOX 3 · DESIGNS FOR A PLACE ────────────────────────────────────────────────────── */}
          {/* ⚠️ TWO BOLD WORDS, AND THEY ARE THE POINT. A place design REPLACES the event design there;
            * an operator who reads "instead of" as "as well as" will give a venue its logo and wonder
            * why the date stopped appearing where it used to. */}
          <Box title="Designs for a place" blurb={
            <>
              {PLACE_DESIGN_BLURB_BEFORE}
              <span className="font-bold text-slate-700">{PLACE_DESIGN_BLURB_BOLD}</span>
              {PLACE_DESIGN_BLURB_AFTER}
            </>
          }>
            {gate(
              <>
                <Input label="Search places" value={designSearch} onChange={setDesignSearch}
                  placeholder="Name or area" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                <ul className="mt-2 max-h-72 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto"
                  data-place-design-list>
                  {designList.length === 0 && (
                    <li className="py-3 text-sm text-slate-400">
                      {places.length === 0 ? 'No places yet.' : 'Nothing matches that.'}
                    </li>
                  )}
                  {/* ══ 🔴 ONE LINE, AT EVERY WIDTH FROM 390px UP (6 October 2026, Dominic) ═════════
                    * ⛔ `flex-wrap` IS GONE FROM THIS ROW. It let the button drop onto a line of its
                    * own in a narrow column, and in a LIST — where every row is the same shape — one
                    * row silently becoming two lines is what makes a list hard to scan.
                    * 🔴 THE NAME IS THE ONLY THING THAT GIVES WAY. `min-w-0` + `truncate` on the text
                    * block and `shrink-0` on the tile, the tag and the button: the row cannot grow, so
                    * the name ellipsises. ⚠️ `min-w-0` IS REQUIRED — a flex child's default
                    * `min-width: auto` refuses to shrink below its content, which is exactly how a
                    * "truncating" name pushes a button out of its box instead.
                    * ⚠️ MEASURED at 390, 1000, 1100, 1280, 1440 and 1728 by the render harness: the
                    * button's top is inside the row and the button is inside the box at all six. */}
                  {designList.map(pl => (
                    <li key={pl.id} className="flex items-center gap-2 py-2">
                      {/* 🔴 THE THUMBNAIL IS THE SIGNED URL FROM THE ONE READ. No per-place call. */}
                      <PlaceTile url={pl.imageUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900">{pl.name}</span>
                        {pl.area && <span className="block truncate text-sm text-slate-400">{pl.area}</span>}
                      </span>
                      {/* ⛔ THE TAG IS TO THE RIGHT OF THE NAME AND BEFORE THE BUTTON. It used to be a
                        * coloured word inside the sub-line, where it competed with the town for the
                        * same sentence — and a row with no town read "Own design" as the address. */}
                      <DesignTag own={pl.hasPicture} />
                      {/* ⚠️ "Design" IS A VERB HERE, and it is the shorter of the two labels — which is
                        * what keeps a one-line row one line in a 200px column. "Give own design" was
                        * three words for the commonest state in the list. */}
                      <button type="button" className={BTN_OUTLINE}
                        onClick={() => setView({ kind: 'place-design', placeId: pl.id })}>
                        {pl.hasPicture ? 'Edit' : 'Design'}
                      </button>
                    </li>
                  ))}
                </ul>
                {/* ⚠️ "its own" / "their own" — ONE PLACE IS NOT "THEY". And the second half names the
                  * design by the name Box 2 gives it, so the footer and the box above it agree. */}
                <p data-design-footer className="mt-auto pt-2 text-xs text-slate-400">
                  {withOwn} with {withOwn === 1 ? 'its' : 'their'} own design · {places.length - withOwn} using your event post design
                </p>
              </>,
            )}
          </Box>
        </div>
      )}

      {/* 🔴 THE SAME MODAL THE EVENTS LIST OPENS. One make flow, opened from four places. */}
      {posting && (
        <EventPostModal token={token} eventId={posting}
          onClose={() => { setPosting(null); void load() }}
          onNeedsSetup={() => { setPosting(null); setView({ kind: 'event-design' }) }} />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE PLACE DESIGN EDITOR
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 ONE PLACE'S EVENT DESIGN, AS A FULL PAGE ══════════════════════════════════════════════════
 *
 * ⛔ THE EDITOR INSIDE IT IS `EventSetupScreen`, FOCUSED. Everything this page adds is CHROME — the
 * back link, the name, the scope sentence, the name-on-posts field, "Make post for …" and the quiet
 * way out. The picture, the drag surface, the fonts, the preview and every save path are the existing
 * screen's, because a second drag surface would be a second set of the three pointer bugs that one had.
 *
 * ⚠️ "Name on posts" IS BOUND TO `short_name`, AND THAT IS NOT A PREFERENCE. `locationName()` in
 * lib/weekly-post/week-data.ts reads `short_name` FIRST and falls back to `name`, so the short one is
 * the field that decides what a poster prints. ⛔ THE "Tidy up places" CARD LABELS `name` "Name on
 * posts", which is the field the renderer uses SECOND — that label is wrong, it is named in
 * docs/social-posts-report.md, and it was left alone because the brief says to leave Tidy up as it is.
 * ⚠️ NO COLUMN WAS ADDED. The field already existed; what is new is a control over it on the screen
 * where it matters.
 */
function PlaceDesignPage({ token, manageApi, place, placeId, onBack, onMakePost, gate }: {
  token: string
  manageApi: (action: string, extra?: Record<string, unknown>) => Promise<unknown>
  place: PostPlace | null
  placeId: string
  onBack: () => void
  onMakePost: (eventId: string) => void
  gate: (children: React.ReactNode) => React.ReactNode
}) {
  const [postName, setPostName] = useState(place?.shortName ?? '')
  const [nameMsg, setNameMsg] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeMsg, setRemoveMsg] = useState<string | null>(null)
  /** Which of this place's upcoming public events the preview is about. */
  const [previewEvent, setPreviewEvent] = useState<string>('')

  const upcoming = useMemo(() => place?.upcoming ?? [], [place])
  useEffect(() => {
    /* ⚠️ THE DEFAULT IS THE NEXT ONE, SET WHEN THE LIST ARRIVES. It is a one-shot seed and not a
     * derivation, because the operator may then choose another and must keep it. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!previewEvent && upcoming.length > 0) setPreviewEvent(upcoming[0].id)
  }, [upcoming, previewEvent])

  const saveName = async () => {
    const next = postName.trim()
    if (next === (place?.shortName ?? '')) return
    setNameMsg(null)
    try {
      /* 🔴 THE EXISTING PLACE WRITE, on /api/manage — the same action "Tidy up places" uses for the
       * same column. No second save path, and no new route. */
      await manageApi('sg_upsert_place', { id: placeId, short_name: next })
      setNameMsg('Saved')
    } catch (e) {
      setNameMsg(e instanceof Error ? e.message : 'Couldn’t save that name.')
    }
  }

  const switchToStandard = async () => {
    if (!window.confirm(standardDesignConfirm(place?.name ?? 'this place'))) return
    setRemoving(true); setRemoveMsg(null)
    try {
      const r = await fetch('/api/weekly-post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'event_remove_place_design', placeId }),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (!r.ok) throw new Error(String(j.error ?? 'That did not work.'))
      onBack()
    } catch (e) {
      setRemoveMsg(e instanceof Error ? e.message : 'Couldn’t remove that picture.')
      setRemoving(false)
    }
  }

  const next = place?.next ?? null

  return (
    <div className="space-y-3" data-place-design-page>
      <BackLink label="Social posts › Designs" onClick={onBack} />
      <div className="min-w-0">
        <p className="truncate text-lg font-black text-slate-900">{place?.name ?? 'This place'}</p>
        <p className="text-xs text-slate-500">
          {place?.area ? `${place.area} · ` : ''}event design for this place
        </p>
      </div>
      <p className="text-xs text-slate-500">{placeDesignScope(place?.name ?? 'this place')}</p>

      {/* 🔴 "Name on posts", AND THE PREVIEW SELECT, ABOVE THE EDITOR. They belong to this page; the
        * editor below is the existing screen and is not reshaped around them. */}
      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Input label="Name on posts" value={postName} onChange={setPostName} onBlur={() => void saveName()}
            hint={POST_NAME_HINT(place?.name ?? 'this place')} />
          {nameMsg && <p className="mt-1 text-[11px] text-slate-500">{nameMsg}</p>}
        </div>
        <div className="min-w-0">
          <label className="mb-1 block text-xs font-bold text-slate-600">Preview with</label>
          {upcoming.length > 0 ? (
            <select value={previewEvent} onChange={e => setPreviewEvent(e.target.value)}
              data-preview-with
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
              {upcoming.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {shortDate(ev.date)} · {formatTimeRange(ev.startTime, ev.endTime)}
                </option>
              ))}
            </select>
          ) : (
            /* ⚠️ SAID OUT LOUD. The editor below previews on a sample rather than on this place's own
             * event, and an operator judging their artwork should know which they are looking at. */
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Nothing booked here yet — the preview uses a sample.
            </p>
          )}
        </div>
      </Card>

      {gate(<EventSetupScreen token={token} onlyPlaceId={placeId} onCancel={onBack} />)}

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        {next
          /* 🔴 ONE OF THE TWO ORANGE BUTTONS IN THIS PRODUCT. Making a post is the act; everything
           * else on these screens edits or opens something. */
          ? <button type="button" data-primary className={BTN_PRIMARY}
              onClick={() => onMakePost(next.id)}>Make post for {shortDate(next.date)}</button>
          /* ⚠️ HIDDEN, NOT DISABLED, when there is nothing to post — the brief's rule and the honest
           * one: there is no event for this button to be about. */
          : <span />}
        <div className="flex flex-col items-end gap-1">
          {place?.hasPicture && (
            <button type="button" disabled={removing} onClick={() => void switchToStandard()}
              data-use-standard
              className="text-xs font-semibold text-slate-500 underline hover:text-slate-800 disabled:opacity-50">
              {removing ? 'Removing…' : USE_STANDARD_LINK}
            </button>
          )}
          {removeMsg && <p className="text-[11px] text-red-600">{removeMsg}</p>}
        </div>
      </Card>
    </div>
  )
}
