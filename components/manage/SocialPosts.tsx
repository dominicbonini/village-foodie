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
import { Btn, Card, Input, Spinner } from '@/components/manage/primitives'
import { SUBCARD_HEADING } from '@/lib/ui-tokens'
import { WeeklyPostApp } from '@/components/manage/WeeklyPost'
import { EventSetupScreen, EventPostModal } from '@/components/manage/EventPost'
import { FeatureGate } from '@/components/FeatureGate'
import { WEEKLY_POST_PLAN_REFUSAL } from '@/lib/copy/weeklyPost'
import { manageSectionHref } from '@/lib/manage-links'
import type { Plan } from '@/lib/features'
import {
  MAKE_POST_FOOTNOTE, WEEKLY_BOX_BLURB, EVENT_BOX_BLURB, PLACE_POST_BOX_BLURB, PRIVATE_EVENT_ROW,
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

/** "17:00–20:00", or "17:00", or ''. */
function timeLabel(start: string | null, end: string | null): string {
  const a = start ? String(start).slice(0, 5) : ''
  const b = end ? String(end).slice(0, 5) : ''
  return a && b ? `${a}–${b}` : a
}

/* 🔴 THE COLOUR BAR ON AN EVENT ROW SAYS WHICH DESIGN THE POST WILL USE, which is the one thing an
 * operator cannot otherwise tell before pressing the button. Orange = this place's own picture, grey =
 * your Standard design. ⚠️ A PRIVATE ROW HAS NO BAR, because it has no post. */
const DESIGN_BAR: Record<PostEvent['design'], string> = {
  own: 'bg-orange-500',
  standard: 'bg-slate-300',
  none: 'bg-transparent',
}

/** A box on either area. ⚠️ `min-w-0` on every one: three equal columns of a grid will not shrink
 *  below their content without it, and a long venue name would push the page sideways. */
function Box({ title, children, className = '' }: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={`flex min-w-0 flex-col p-4 ${className}`}>
      <p className={SUBCARD_HEADING}>{title}</p>
      <div className="mt-2 flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </Card>
  )
}

/** The grey tile a box shows where a picture would be. */
function Thumb({ url, label, className = '' }: { url: string | null; label: string; className?: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-center text-[9px] font-semibold leading-tight text-slate-400 ${className}`}>
      {url
        /* eslint-disable-next-line @next/next/no-img-element -- a signed, expiring Supabase URL;
           next/image would need the host in `remotePatterns` and would proxy a private object. */
        ? <img src={url} alt="" className="h-full w-full object-cover" />
        : label}
    </div>
  )
}

/** "✓ Set up" / "Not set up". */
function ReadyBadge({ ready }: { ready: boolean }) {
  return ready
    ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">✓ Set up</span>
    : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Not set up</span>
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

  return (
    <div className="space-y-3" data-social-posts>
      {/* ── HEADER ───────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-black text-slate-900">Social posts</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Make a picture for your week, an event or a place — and set up how they look.
          </p>
        </div>
        {/* 🔴 A SEGMENTED CONTROL, AND IT IS IN THE URL. "Send me the designs screen" has to be a link
          * somebody can send, so the choice is `?section=posts` / `?section=designs` through the one
          * builder rather than React state nobody can address. */}
        <div role="tablist" aria-label="Social posts area" data-social-area
          className="inline-flex shrink-0 overflow-hidden rounded-xl border border-slate-200">
          {([['posts', 'Make a post'], ['designs', 'Designs']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={area === k}
              onClick={() => onArea(k)}
              className={`px-3 py-1.5 text-xs font-bold ${area === k
                ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50'}`}>
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
          {/* ── 🔴 THREE EQUAL COLUMNS FROM `lg` UP, ONE BELOW IT ───────────────────────────────
            * ⚠️ `items-stretch` AND `h-full` ON THE BOXES, so three boxes of very different content
            * lengths are the same height — which is what makes them read as three choices of one kind
            * rather than three unrelated cards. */}
          <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-3" data-make-boxes>
            {/* ── BOX 1 · WEEKLY ─────────────────────────────────────────────────────────────── */}
            <Box title="Weekly post">
              {gate(
                <>
                  <div className="flex items-start gap-3">
                    <Thumb url={data.weekly.previewUrl} label="No design" className="h-16 w-12" />
                    <p className="min-w-0 flex-1 text-xs text-slate-500">{WEEKLY_BOX_BLURB}</p>
                  </div>
                  <label className="mt-3 block text-xs font-bold text-slate-600">Which week</label>
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
                  <div className="mt-auto pt-3">
                    <Btn label="Make this week’s post" colour="orange"
                      className="w-full justify-center"
                      onClick={() => setView({ kind: 'weekly-post', week })} />
                  </div>
                </>,
              )}
            </Box>

            {/* ── BOX 2 · SINGLE EVENT ───────────────────────────────────────────────────────── */}
            <Box title="Single event post">
              {gate(
                <>
                  <p className="text-xs text-slate-500">{EVENT_BOX_BLURB}</p>
                  {/* ⛔ `max-h-72` IS NOT DECORATION — IT IS WHAT MAKES THE LIST SCROLL (6 Oct 2026).
                      `flex-1 min-h-0 overflow-y-auto` lets a child be SHORTER than its content only
                      when something above it decides the height. These boxes sit in the page's own
                      flow with nothing capping them, so a truck with twenty places grew the box, and
                      `items-stretch` then dragged the other two boxes to the same height. Measured:
                      scripts/social-posts-render.cjs renders a 20-row list at three widths. */}
                  <ul className="mt-2 max-h-72 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto"
                    data-upcoming-list>
                    {data.upcoming.length === 0 && (
                      <li className="py-3 text-xs text-slate-400">Nothing coming up.</li>
                    )}
                    {data.upcoming.map(ev => (
                      <li key={ev.id} className="flex items-center gap-2 py-2">
                        {/* ⚠️ THE BAR IS `aria-hidden`: it says which design, and the row already says
                            everything a screen reader needs. */}
                        <span aria-hidden="true"
                          className={`h-8 w-1 shrink-0 rounded-full ${DESIGN_BAR[ev.design]}`} />
                        <span className="min-w-0 flex-1">
                          {/* ⛔ A PRIVATE EVENT KEEPS ITS DATE AND LOSES EVERYTHING ELSE. Its venue and
                              town never left the server. */}
                          <span className={`block truncate text-sm font-bold ${ev.isPrivate ? 'text-slate-400' : 'text-slate-900'}`}>
                            {shortDate(ev.date)}
                            <span className="ml-1.5 font-medium text-slate-400">{timeLabel(ev.startTime, ev.endTime)}</span>
                          </span>
                          <span className={`block truncate text-xs ${ev.isPrivate ? 'italic text-slate-400' : 'text-slate-500'}`}>
                            {ev.isPrivate ? PRIVATE_EVENT_ROW : (ev.venue ?? '—')}
                          </span>
                        </span>
                        {/* ⛔ NO BUTTON ON A PRIVATE EVENT, EVER. There is no post for one — the route
                            refuses `event_post` for it — so a button here would be one that cannot work. */}
                        {!ev.isPrivate && (
                          <Btn label="Make post" colour="ghost" size="sm" onClick={() => setPosting(ev.id)} />
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-2">
                    <a href={manageSectionHref('events')}
                      className="text-xs font-bold text-orange-700 underline hover:no-underline">
                      See all upcoming events
                    </a>
                  </div>
                </>,
              )}
            </Box>

            {/* ── BOX 3 · POST FOR A PLACE ───────────────────────────────────────────────────── */}
            <Box title="Post for a place">
              {gate(
                <>
                  <p className="text-xs text-slate-500">{PLACE_POST_BOX_BLURB}</p>
                  <div className="mt-2">
                    <Input label="Search places" value={eventSearch} onChange={setEventSearch}
                      placeholder="Name or area" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                  </div>
                  <ul className="mt-2 max-h-72 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto"
                    data-place-post-list>
                    {postList.length === 0 && (
                      <li className="py-3 text-xs text-slate-400">
                        {places.length === 0 ? 'No places yet.' : 'Nothing matches that.'}
                      </li>
                    )}
                    {postList.map(pl => (
                      <li key={pl.id} className="flex items-center gap-2 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-slate-900">
                            {pl.name}{pl.area ? <span className="font-medium text-slate-400"> · {pl.area}</span> : null}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {pl.next ? `Next: ${shortDate(pl.next.date)}` : 'Nothing booked'}
                          </span>
                        </span>
                        {pl.next
                          ? <Btn label="Make post" colour="ghost" size="sm" onClick={() => setPosting(pl.next!.id)} />
                          /* ⚠️ A DASH, NOT A DISABLED BUTTON. A greyed button invites a press and then
                             explains nothing; a dash says there is nothing to do here. */
                          : <span aria-hidden="true" className="px-2 text-sm text-slate-300">—</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-auto pt-2 text-[11px] text-slate-400">
                    {places.length} place{places.length === 1 ? '' : 's'} · {PLACE_POST_FOOTER_NOTE}
                  </p>
                </>,
              )}
            </Box>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">{MAKE_POST_FOOTNOTE}</p>
        </>
      )}

      {data && area === 'designs' && (
        <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[1fr_1fr_1.4fr]" data-design-boxes>
          {/* ── BOX 1 · WEEKLY DESIGN ──────────────────────────────────────────────────────────── */}
          <Box title="Weekly post design">
            {gate(
              <>
                <Thumb url={data.weekly.previewUrl} label="No picture yet" className="aspect-[4/5] w-full" />
                <div className="mt-2 flex items-center gap-2">
                  <ReadyBadge ready={data.weekly.ready} />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">{WEEKLY_DESIGN_BLURB}</p>
                <div className="mt-auto pt-3">
                  <Btn label="Edit weekly design" colour="orange" className="w-full justify-center"
                    onClick={() => setView({ kind: 'weekly-design' })} />
                </div>
              </>,
            )}
          </Box>

          {/* ── BOX 2 · EVENT DESIGN ───────────────────────────────────────────────────────────── */}
          <Box title="Event post design">
            {gate(
              <>
                <Thumb url={data.standard.previewUrl} label="No picture yet" className="aspect-[4/5] w-full" />
                <div className="mt-2 flex items-center gap-2">
                  <ReadyBadge ready={data.standard.ready} />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">{EVENT_DESIGN_BLURB}</p>
                <div className="mt-auto pt-3">
                  <Btn label="Edit event design" colour="orange" className="w-full justify-center"
                    onClick={() => setView({ kind: 'event-design' })} />
                </div>
              </>,
            )}
          </Box>

          {/* ── BOX 3 · DESIGNS FOR A PLACE ────────────────────────────────────────────────────── */}
          <Box title="Designs for a place">
            {gate(
              <>
                <p className="text-xs text-slate-500">{PLACE_DESIGN_BLURB}</p>
                <div className="mt-2">
                  <Input label="Search places" value={designSearch} onChange={setDesignSearch}
                    placeholder="Name or area" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                </div>
                <ul className="mt-2 max-h-72 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto"
                  data-place-design-list>
                  {designList.length === 0 && (
                    <li className="py-3 text-xs text-slate-400">
                      {places.length === 0 ? 'No places yet.' : 'Nothing matches that.'}
                    </li>
                  )}
                  {designList.map(pl => (
                    <li key={pl.id} className="flex items-center gap-2 py-2">
                      {/* 🔴 THE THUMBNAIL IS THE SIGNED URL FROM THE ONE READ. No per-place call. */}
                      <Thumb url={pl.imageUrl} label="Standard" className="h-12 w-10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900">{pl.name}</span>
                        <span className="block truncate text-xs text-slate-400">
                          {pl.area ? `${pl.area} · ` : ''}
                          {pl.hasPicture
                            ? <span className="font-semibold text-orange-700">Own design</span>
                            : <span className="font-semibold text-slate-500">Standard</span>}
                        </span>
                      </span>
                      <Btn label={pl.hasPicture ? 'Edit' : 'Give own design'} colour="ghost" size="sm"
                        onClick={() => setView({ kind: 'place-design', placeId: pl.id })} />
                    </li>
                  ))}
                </ul>
                <p className="mt-auto pt-2 text-[11px] text-slate-400">
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
                  {shortDate(ev.date)} · {timeLabel(ev.startTime, ev.endTime)}
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
          ? <Btn label={`Make post for ${shortDate(next.date)}`} colour="orange"
              onClick={() => onMakePost(next.id)} />
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
