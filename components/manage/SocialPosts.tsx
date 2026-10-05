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
  EVENT_DESIGN_FIRST, EVENT_DESIGN_FIRST_LINK,
  WEEKLY_DESIGN_BLURB, EVENT_DESIGN_BLURB, PLACE_DESIGN_BLURB, PLACE_POST_FOOTER_NOTE,
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
   *  that is what keeps the gap between them the same in all six boxes. */
  blurb?: string
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
   * different heights, which is the thing this is here to stop. */
  const ratio = w && h ? w / h : 4 / 5
  const H = 150
  return (
    <div
      data-design-tile
      style={{ height: H, width: Math.round(H * ratio) }}
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

/** "Own design" / "Standard" — a small rounded tag, to the right of the name and before the button. */
function DesignTag({ own }: { own: boolean }) {
  return own
    ? <span data-design-tag className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">Own design</span>
    : <span data-design-tag className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Standard</span>
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

  /* ══ 🔴 "Set up your event design first" — ONE GREY LINE, ON BOXES 2 AND 3 (6 October 2026) ═══════
   *
   * ⛔ THE EXISTING FLOW DOES NOT EXPLAIN THIS. `EventPostModal` asks the server, gets
   * `hasDesign: false`, and calls `onNeedsSetup()` — which here opens the design editor. So the modal
   * flashes and the operator lands somewhere else with no sentence anywhere saying why. That is not
   * "handled clearly"; it is a redirect.
   * ⚠️ THE BUTTONS STAY VISIBLE AND GO DISABLED. A row that lost its button would have the operator
   * wondering what is different about that EVENT; a disabled one under a line above the list says what
   * is different about the TRUCK.
   * 🔴 THE LINK GOES STRAIGHT TO THE EVENT SETUP, not to Designs generally — one press from the
   * sentence to the screen that fixes it. */
  const eventSetupNote = data && !data.standard.ready ? (
    <p data-event-setup-note className="mb-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500">
      {EVENT_DESIGN_FIRST}{' '}
      <button type="button"
        onClick={() => { onArea('designs'); setView({ kind: 'event-design' }) }}
        className="font-semibold text-slate-700 underline hover:no-underline">
        {EVENT_DESIGN_FIRST_LINK}
      </button>
    </p>
  ) : null

  return (
    <div className="space-y-3" data-social-posts>
      {/* ── HEADER ───────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-black text-slate-900">Social posts</p>
          <p className="mt-0.5 text-sm text-slate-500">
            Make a picture for your week, an event or a place — and set up how they look.
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
              {gate(
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
                  {/* ══ 🔴 THE BUTTON SAYS WHAT IT WILL DO (6 October 2026) ═══════════════════════
                    * ⛔ WITH NO WEEKLY DESIGN, "Make this week's post" OPENED THE SETUP SCREEN. The
                    * existing flow does handle it — `WeeklyPostApp` falls back to setup when `load`
                    * returns no design — but it handles it by doing something other than what the
                    * button promised, which is the worst kind of handled.
                    * 🔴 SO THE BUTTON READS "Set up weekly design" AND GOES STRAIGHT TO DESIGNS. Same
                    * destination, honest label. It is still the orange one: setting the design up IS
                    * the thing to do from this box when there is no design. */}
                  <div className="mt-auto pt-3">
                    {data.weekly.ready ? (
                      <button type="button" data-primary className={`${BTN_PRIMARY} w-full`}
                        onClick={() => setView({ kind: 'weekly-post', week })}>
                        Make this week’s post
                      </button>
                    ) : (
                      <button type="button" data-primary className={`${BTN_PRIMARY} w-full`}
                        onClick={() => { onArea('designs'); setView({ kind: 'weekly-design' }) }}>
                        Set up weekly design
                      </button>
                    )}
                  </div>
                </>,
              )}
            </Box>

            {/* ── BOX 2 · SINGLE EVENT ───────────────────────────────────────────────────────── */}
            <Box title="Single event post" blurb={EVENT_BOX_BLURB}>
              {gate(
                <>
                  {eventSetupNote}
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
                            ⚠️ DISABLED, NOT HIDDEN, WHEN THE EVENT DESIGN IS NOT SET UP: the note above
                            the list says why and what to do, and a row that lost its button would make
                            the operator wonder what is different about that event. */}
                        {!ev.isPrivate && (
                          <button type="button" className={`${BTN_OUTLINE} self-center`}
                            disabled={!data.standard.ready}
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
                </>,
              )}
            </Box>

            {/* ── BOX 3 · POST FOR A PLACE ───────────────────────────────────────────────────── */}
            <Box title="Post for a place" blurb={PLACE_POST_BOX_BLURB}>
              {gate(
                <>
                  {eventSetupNote}
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
                              disabled={!data.standard.ready}
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
                </>,
              )}
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
                {/* ⚠️ THE DESIGN'S OWN SHAPE, from the row — not a guessed 4:5. */}
                <DesignTile url={data.weekly.previewUrl} w={data.weekly.width} h={data.weekly.height} />
                <div className="mt-2 flex items-center gap-2">
                  <ReadyBadge ready={data.weekly.ready} />
                </div>
                {/* ⛔ OUTLINED, NOT ORANGE. Editing a design is not making something. */}
                <div className="mt-auto pt-3">
                  <button type="button" className={`${BTN_OUTLINE} w-full`}
                    onClick={() => setView({ kind: 'weekly-design' })}>Edit weekly design</button>
                </div>
              </>,
            )}
          </Box>

          {/* ── BOX 2 · EVENT DESIGN ───────────────────────────────────────────────────────────── */}
          <Box title="Event post design" blurb={EVENT_DESIGN_BLURB}>
            {gate(
              <>
                <DesignTile url={data.standard.previewUrl} w={data.standard.width} h={data.standard.height} />
                <div className="mt-2 flex items-center gap-2">
                  <ReadyBadge ready={data.standard.ready} />
                </div>
                <div className="mt-auto pt-3">
                  <button type="button" className={`${BTN_OUTLINE} w-full`}
                    onClick={() => setView({ kind: 'event-design' })}>Edit event design</button>
                </div>
              </>,
            )}
          </Box>

          {/* ── BOX 3 · DESIGNS FOR A PLACE ────────────────────────────────────────────────────── */}
          <Box title="Designs for a place" blurb={PLACE_DESIGN_BLURB}>
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
                  {designList.map(pl => (
                    <li key={pl.id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2">
                      {/* 🔴 THE THUMBNAIL IS THE SIGNED URL FROM THE ONE READ. No per-place call. */}
                      <PlaceTile url={pl.imageUrl} />
                      <span className="min-w-[8rem] flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900">{pl.name}</span>
                        {pl.area && <span className="block truncate text-sm text-slate-400">{pl.area}</span>}
                      </span>
                      {/* ⛔ THE TAG IS TO THE RIGHT OF THE NAME AND BEFORE THE BUTTON. It used to be a
                        * coloured word inside the sub-line, where it competed with the town for the
                        * same sentence — and a row with no town read "Own design" as the address. */}
                      <DesignTag own={pl.hasPicture} />
                      <button type="button" className={BTN_OUTLINE}
                        onClick={() => setView({ kind: 'place-design', placeId: pl.id })}>
                        {pl.hasPicture ? 'Edit' : 'Give own design'}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-auto pt-2 text-xs text-slate-400">
                  {withOwn} with their own design · {places.length - withOwn} using Standard
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
