// scripts/_lp1d2-social.cjs — Language Phase 1d Part 2, area `social`: Manage › Social media, rendered for a GB and a US
// truck (the US truck has SUNDAY weeks — the "Monday to Sunday" wording shows in the editor's Rows panel and the week
// picker / days fixtures start on Sunday). A MODULE for scripts/language-phase-1d2.cjs (views(ctx) → { key: html }).
//
//   posts|…      SocialPostsPane — the three areas (create / designs / locations): loading, error, ready, a SEPTEMBER
//                week ("Sept" vs "Sep"), next week, nothing set up, no events, only private events, another event
//                chosen, gated by plan, the caption template editor (with a save error), the post modal open, the
//                leave-without-saving dialog; Locations: list, none, filters, no match, one chosen (with / without
//                pictures, a message)
//   event|…      EventSetupScreen (loading, first picture, standard design, a place's own / standard positions,
//                remove confirm, the place picker) and EventPostModal (loading + error, building, ready)
//   share|…      PostShareBar (nothing yet, ready + copied, share available, post-text kind)
//   live|…       LivePoster with the renderer's own weekly / event trees (bundled poster fonts, no network)
//   weekly|…     WeeklyPostApp — loading, missing table, the first-picture card, the week design (editor, kind
//                switch, the week's first day), the post screen (ready, building with error / status / warnings,
//                no events, next week)
//   editor|…     DesignEditor — weekly design (each item chosen: date, heading, days (+ more), place picture, own
//                text, all text, legacy rows "Monday to Sunday"), background / more open, preview open (waiting /
//                ready with warnings and messages), phone sheets, the live poster, zoom; event design (venue, area,
//                own / standard positions read-only)
//   bits|…       DesignEditorBits (Stepper, Slider, ColourField, OptionalColourRow, Switch / CheckRow / Popover)
//   font|…       FontPicker — closed (loading / chosen), open (all, own empty / list, search no match, many → "showing"),
//                library error, choosing + message, the upload card (ticked, added with missing faces)
//   drag|…       DraggableBox (active, locked)
// Static render runs no effects: every state is given through ctx.states (render-kit `states` patches) and two
// one-line seeds (the live fonts, the font library). A state the new code holds as a CODE is given via __after.
const SP = 'components/manage/SocialPosts.tsx'
const EP = 'components/manage/EventPost.tsx'
const WP = 'components/manage/WeeklyPost.tsx'
const DE = 'components/manage/DesignEditor.tsx'
const FP = 'components/manage/FontPicker.tsx'
const PSB = 'components/manage/PostShareBar.tsx'
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
const W = 1080, H = 1350

async function views(ctx) {
  const { kit, h, html, states, GB, US, inManage, PROVIDERS } = ctx
  const out = {}
  let M
  try {
    M = await kit.bundle('lp1d2-social', [
      "export * as SOC from '@/components/manage/SocialPosts'",
      "export * as EP from '@/components/manage/EventPost'",
      "export * as WP from '@/components/manage/WeeklyPost'",
      "export * as DE from '@/components/manage/DesignEditor'",
      "export * as BITS from '@/components/manage/DesignEditorBits'",
      "export * as FP from '@/components/manage/FontPicker'",
      "export * as DB from '@/components/manage/DraggableBox'",
      "export * as PSB from '@/components/manage/PostShareBar'",
      "export * as LP from '@/components/manage/LivePoster'",
      "export { defaultLayout, defaultEventLayout, defaultNoteBox, fontsUsedBy, fontsUsedByEvent } from '@/lib/weekly-post/layout'",
      "export { buildWeekData, entryFor } from '@/lib/weekly-post/week-data'",
      "export { weeklyTree, eventTree } from '@/lib/weekly-post/draw'",
      "export { bundledFontFiles } from '@/lib/weekly-post/fonts'",
      "export { makeFontBundle } from '@/lib/weekly-post/font-bundle'",
      "export { FALLBACK_FONT_ID } from '@/lib/weekly-post/font-refs'",
      PROVIDERS,
    ].join('\n'), {
      patches: [
        { file: SP, states: states(SP, ['data', 'error', 'view', 'leaveTo', 'posting', 'chosenEventId', 'week', 'editingTemplate', 'saving', 'err', 'search', 'filter', 'selectedId', 'busy', 'msg', 'byKey']) },
        { file: EP, states: states(EP, ['loading', 'standard', 'designs', 'places', 'current', 'pending', 'picking', 'search', 'layout', 'msg', 'flash', 'busy', 'saving', 'confirmRemove',
          'previewEvents', 'previewWith', 'country', 'hasLogo', 'liveEvent', 'info', 'choice', 'alsoSave', 'png', 'pngBlob', 'note']) },
        { file: WP, states: states(WP, ['loading', 'missingTable', 'design', 'mode', 'error', 'weekStart', 'week', 'days', 'orderUrl', 'country', 'hasLogo', 'placesWithout', 'showPrivate',
          'designKind', 'blankUrl', 'size', 'layout', 'uploading', 'saving', 'msg', 'flash', 'previewWith', 'liveWeek', 'excluded', 'note', 'showCancelled', 'png', 'pngBlob', 'warnings',
          'caption', 'perEvent', 'busyMsg', 'rendering', 'postEventId']) },
        { file: DE, states: states(DE, ['hist', 'chosen', 'standOpen', 'moreOpen', 'bgOpen', 'preview', 'previewDarken', 'warnings', 'localMsg', 'stageW', 'area', 'zoomStep', 'previewOpen',
          'sheetFor', 'sheetTab', 'sheetH']) },
        { file: FP, states: states(FP, ['open', 'tab', 'query', 'choosing', 'msg', 'picked', 'ticked', 'busy', 'added']) },
        { file: PSB, states: states(PSB, ['copied']) },
        // The two hooks that load over the network seed from a global instead (a static render runs no effect).
        { file: 'lib/weekly-post/live-fonts.ts', from: 'useState<LiveFonts>({ bundle: null, unavailable: [] })', to: 'useState<LiveFonts>((globalThis as any).__liveFonts ?? { bundle: null, unavailable: [] })' },
        { file: 'components/manage/useFontLibrary.ts', from: "useState<Omit<FontLibrary, 'reload'>>(empty)", to: "useState<Omit<FontLibrary, 'reload'>>((globalThis as any).__fontLib ?? empty)" },
      ],
    })
  } catch (e) { for (const cc of ['GB', 'US']) out[`${cc}|bundle`] = 'ERROR ' + String(e.message).slice(0, 300); return out }
  const noop = () => {}
  const anoop = async () => null

  // ── font bundles for the live poster (the bundled poster fonts, read from assets/ — no network) ──
  const fontCache = new Map()
  const fontsFor = ids => {
    const key = [...new Set([M.FALLBACK_FONT_ID, ...ids])].sort().join(',')
    if (!fontCache.has(key)) fontCache.set(key, M.makeFontBundle(M.bundledFontFiles(key.split(','))))
    return fontCache.get(key)
  }
  const withLiveFonts = (layout, fn) => {
    const used = (layout.rowSpacing !== undefined ? M.fontsUsedBy(layout) : M.fontsUsedByEvent(layout)).map(f => f.id)
    globalThis.__liveFonts = { bundle: fontsFor(used), unavailable: [] }
    try { return fn() } finally { delete globalThis.__liveFonts }
  }
  const withFontLib = (lib, fn) => { globalThis.__fontLib = lib; try { return fn() } finally { delete globalThis.__fontLib } }
  const atClock = (iso, fn) => { kit.setNow(iso); try { return fn() } finally { kit.setNow(ctx.NOW) } }

  // ── the font library ──
  const libFont = (id, family, group, o = {}) => ({ id, family, group, licence: 'OFL', hasBold: true, hasItalic: false, own: false, ...o })
  const LIB_FONTS = [libFont('oswald', 'Oswald', 'bold'), libFont('anton', 'Anton', 'bold'), libFont('pacifico', 'Pacifico', 'hand'), libFont('playfair', 'Playfair Display', 'classic', { hasItalic: true }),
    libFont('inter', 'Inter', 'clean'), libFont('lato', 'Lato', 'clean')]
  const OWN_FONTS = [libFont('own-1', 'BrandSans', 'clean', { own: true, displayName: 'Brand Sans', licence: 'Your own', hasBold: false })]
  const lib = (o = {}) => {
    const own = o.own ?? []
    const all = [...own, ...(o.fonts ?? LIB_FONTS)]
    const byId = new Map(all.map(f => [f.id, f]))
    return { loading: false, error: null, all, byId, count: o.count ?? 1819, own, popular: (o.popular ?? ['oswald', 'pacifico', 'playfair', 'inter']).map(id => byId.get(id)).filter(Boolean),
      recent: (o.recent ?? []).map(id => byId.get(id)).filter(Boolean), ...(o.over || {}) }
  }
  const MANY = Array.from({ length: 70 }, (_, i) => libFont(`bold-${i}`, `Bold Face ${String(i).padStart(2, '0')}`, 'bold'))

  for (const C of [GB, US]) {
    const cc = C.cc
    const isUS = cc === 'US'
    const Wr = el => inManage(M, C, el)
    const safe = (k, fn) => ctx.safe(out, `${cc}|${k}`, fn)
    const truck = { ...C.truck }
    const ymd = (gb, us) => (isUS ? us : gb)

    // ══ posts — SocialPostsPane ════════════════════════════════════════════════════════════════════════════
    const img = (id, o = {}) => ({ id, url: `https://img.example/${id}.png`, width: 1080, height: 1350, fileName: `${id}.png`, legacy: false, ...o })
    const ev = (id, date, o = {}) => ({ id, date, startTime: '17:00', endTime: '20:30', isPrivate: false, venue: 'The Kings Arms', town: 'Lavenham', placeId: 'p1', design: 'standard',
      imageSource: 'standard', placeName: 'The Kings Arms', ...o })
    const UPCOMING = [
      ev('e1', '2026-10-10', { imageSource: 'place-photo', placeId: 'p1' }),
      ev('e2', '2026-10-11', { isPrivate: true, venue: null, town: null, placeId: null, placeName: null, imageSource: 'none', design: 'none' }),
      ev('e3', '2026-10-13', { venue: 'Town Square', town: 'Sudbury', placeId: 'p2', placeName: 'Town Square', imageSource: 'place-poster' }),
      ev('e4', '2026-10-15', { venue: 'Riverside Park', town: null, placeId: null, placeName: null, imageSource: 'standard', startTime: '12:00', endTime: '14:00' }),
    ]
    const SEPT = [
      ev('s1', '2026-09-26', { imageSource: 'place-photo' }),
      ev('s2', '2026-09-29', { venue: 'Town Square', town: 'Sudbury', placeId: 'p2', placeName: 'Town Square', imageSource: 'place-poster' }),
      ev('s3', '2026-09-30', { isPrivate: true, venue: null, town: null, placeId: null, placeName: null, imageSource: 'none', design: 'none' }),
    ]
    const place = (id, name, o = {}) => ({ id, name, shortName: null, area: 'Suffolk', isFavourite: false, isHidden: false, eventPhotoImage: null, eventImage: null, weeklyImage: null,
      socialTag: null, hasPicture: false, imageUrl: null, pictureCount: 0, mainUrl: null, mainLabel: null, width: null, height: null, ownPositions: false, next: null, upcoming: [], ...o })
    const PLACES = [
      place('p1', 'The Kings Arms', { area: 'Lavenham', isFavourite: true, eventPhotoImage: img('ph1'), weeklyImage: img('wk1'), eventImage: img('po1'), socialTag: '@kingsarms', hasPicture: true, pictureCount: 3 }),
      place('p2', 'Town Square', { area: 'Sudbury', weeklyImage: img('wk2'), pictureCount: 1 }),
      place('p3', 'Riverside Park', { area: null }),
      place('p4', 'Old Mill Yard', { area: 'Clare', isHidden: true }),
    ]
    const overview = (o = {}) => ({
      hasLogo: true,
      weekly: { ready: true, previewUrl: 'https://img.example/weekly.png', width: 1080, height: 1350,
        thisWeek: { start: ymd('2026-10-05', '2026-10-04'), end: ymd('2026-10-11', '2026-10-10'), events: 3, privateEvents: 1, caption: 'This week we are at three places — come and say hello!' },
        nextWeek: { start: ymd('2026-10-12', '2026-10-11'), end: ymd('2026-10-18', '2026-10-17'), events: 2, privateEvents: 0 },
        defaultWeek: 'this', ...(o.weekly || {}) },
      standard: { ready: true, previewUrl: 'https://img.example/event.png', width: 1080, height: 1350, photoSpace: true, ...(o.standard || {}) },
      weeklyPictureOn: true,
      captions: { week: { template: 'Where to find us: {week-dates}\n{day-list}\nOrder ahead: {order-link}', saved: false },
        event: { template: 'We are at {place}, {area} on {day-date}, {times}.\nOrder ahead: {order-link} {location-tag}', saved: true } },
      captionBits: { orderUrl: 'https://hatchgrab.test/test-kitchen', timeStyle: isUS ? '12h' : '24h', country: cc },
      upcoming: o.upcoming ?? UPCOMING,
      places: o.places ?? PLACES,
    })
    const pane = (area, o = {}) => Wr(h(M.SOC.SocialPostsPane, { truck: o.truck || truck, token: 'harness', area, onArea: noop, manageApi: anoop, openEventId: null, onOpenedEvent: noop, onRequestArea: noop, onFullWidth: noop }))
    const tiles = { 'w:this': 'blob:week-this', 'w:next': 'blob:week-next', 'e:e1': 'blob:e1', 'e:e3': 'failed', 'e:e4': 'blob:e4', 'e:s1': 'blob:s1', 'e:s2': 'blob:s2' }
    const P = (k, st, area = 'create', o) => safe(`posts|${area}|${k}`, () => html({ byKey: tiles, ...st }, pane(area, o)))
    const errAfter = { when: /'text' in error/, file: SP, set: { error: { code: 'couldNotLoad' } } }
    P('loading', { data: null })
    P('error', { data: null, error: 'Could not load', __after: errAfter })
    P('ready', { data: overview() })
    safe('posts|create|sept', () => atClock('2026-09-25T10:00:00Z', () => html({ byKey: tiles, data: overview({ upcoming: SEPT,
      weekly: { thisWeek: { start: ymd('2026-09-28', '2026-09-27'), end: ymd('2026-10-04', '2026-10-03'), events: 2, privateEvents: 1 },
        nextWeek: { start: ymd('2026-10-05', '2026-10-04'), end: ymd('2026-10-11', '2026-10-10'), events: 0, privateEvents: 0 } } }) }, pane('create'))))
    P('nextWeek', { data: overview(), week: 'next' })
    P('notSetUp', { data: overview({ weekly: { ready: false, previewUrl: null }, standard: { ready: false, previewUrl: null } }) })
    P('noEvents', { data: overview({ upcoming: [], weekly: { thisWeek: { start: ymd('2026-10-05', '2026-10-04'), end: ymd('2026-10-11', '2026-10-10'), events: 0, privateEvents: 0 } } }) })
    P('onlyPrivate', { data: overview({ upcoming: [UPCOMING[1]] }) })
    P('chosenPoster', { data: overview(), chosenEventId: 'e3' })
    P('chosenStandard', { data: overview(), chosenEventId: 'e4' })
    P('starter', { data: overview() }, 'create', { truck: { ...truck, plan: 'starter' } })
    P('editTemplate', { data: overview(), editingTemplate: true, saving: true, err: 'That template could not be saved' })
    P('posting', { data: overview(), posting: 'e1' })
    P('leave', { data: overview(), leaveTo: 'designs' })
    P('ready', { data: overview() }, 'designs')
    P('notSetUp', { data: overview({ weekly: { ready: false, previewUrl: null }, standard: { ready: false, previewUrl: null } }) }, 'designs')
    P('starter', { data: overview() }, 'designs', { truck: { ...truck, plan: 'starter' } })
    P('weeklyDesignOpen', { data: overview(), view: { kind: 'weekly-design' } }, 'designs')
    P('list', { data: overview() }, 'locations')
    P('none', { data: overview({ places: [] }) }, 'locations')
    P('missing', { data: overview(), filter: 'missing' }, 'locations')
    P('hidden', { data: overview(), filter: 'hidden' }, 'locations')
    P('noMatch', { data: overview(), search: 'zzz' }, 'locations')
    P('selected', { data: overview(), selectedId: 'p1', msg: { text: 'Saved — your image is in place.', bad: false } }, 'locations')
    P('selectedEmpty', { data: overview(), selectedId: 'p2', busy: true, msg: { text: 'That picture is too big', bad: true } }, 'locations')
    P('starter', { data: overview(), selectedId: 'p1' }, 'locations', { truck: { ...truck, plan: 'starter' } })
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): AFTER-only twin — the same state on the fixture's own truck. BEFORE has no
    // Max view in this state; the named proof plans-starter-twin requires the Starter view to equal it (no plan gates Social).
    P('starterAsMax', { data: overview(), selectedId: 'p1' }, 'locations')

    // ══ event — EventSetupScreen and EventPostModal ═════════════════════════════════════════════════════════
    const EL = M.defaultEventLayout(W, H)
    const pick = (eventId, label) => ({ eventId, label, substituteName: false })
    const STANDARD = { width: W, height: H, layout: EL, backgroundUrl: BLANK, status: 'Used for every event without its own design', preview: pick('e1', 'Sat 10 Oct · The Kings Arms') }
    const DESIGNS = [
      { placeId: 'p1', name: 'The Kings Arms', fullName: 'The Kings Arms, Lavenham', area: 'Lavenham', mode: 'own', imageUrl: BLANK, width: W, height: H, layout: EL, fitsDefault: true,
        status: 'Own picture · own positions', preview: pick('e1', 'Sat 10 Oct') },
      { placeId: 'p2', name: 'Town Square', fullName: 'Town Square, Sudbury', area: 'Sudbury', mode: 'standard', imageUrl: BLANK, width: W, height: H, layout: null, fitsDefault: true,
        status: 'Own picture · standard positions', preview: pick('e3', 'Tue 13 Oct') },
    ]
    const PLACE_ROWS = [
      { id: 'p1', name: 'The Kings Arms', fullName: 'The Kings Arms, Lavenham', area: 'Lavenham', isFavourite: true, hasDesign: true, preview: pick('e1', 'Sat 10 Oct') },
      { id: 'p2', name: 'Town Square', fullName: 'Town Square, Sudbury', area: 'Sudbury', isFavourite: false, hasDesign: true, preview: pick('e3', 'Tue 13 Oct') },
      { id: 'p3', name: 'Riverside Park', fullName: 'Riverside Park', area: null, isFavourite: false, hasDesign: false, preview: pick(null, null) },
    ]
    const setupBase = { loading: false, standard: STANDARD, designs: DESIGNS, places: PLACE_ROWS, layout: EL, country: cc, hasLogo: true,
      previewEvents: [{ id: 'e1', label: 'Sat 10 Oct · The Kings Arms' }, { id: 'e3', label: 'Tue 13 Oct · Town Square' }], previewWith: 'e1' }
    const setup = (o = {}) => Wr(h(M.EP.EventSetupScreen, { token: 'harness', onCancel: o.noCancel ? undefined : noop, onlyStandard: o.onlyStandard, onDirtyChange: noop, onSaver: noop, onPictureChanged: noop }))
    const E = (k, st, o) => safe(`event|setup|${k}`, () => html(st, setup(o)))
    const epMsgAfter = set => ({ when: /'text' in msg \? msg\.text : t\(msg\.key/, file: EP, set })
    E('loading', {})
    E('first', { loading: false, standard: null, busy: true, msg: { text: 'Could not load', bad: true }, __after: epMsgAfter({ msg: { key: 'error.couldNotLoad', bad: true } }) })
    E('standard', { ...setupBase, current: null, flash: 'Your picture is a new shape, so the boxes went back to where they start.' })
    E('standardOnly', { ...setupBase, current: null }, { onlyStandard: true })
    E('placeOwn', { ...setupBase, current: 'p1', msg: { text: 'Design saved.', bad: false }, __after: epMsgAfter({ msg: { key: 'setup.designSaved', bad: false } }) })
    E('placeStandard', { ...setupBase, current: 'p2', confirmRemove: true, saving: true })
    E('picking', { ...setupBase, current: null, picking: true })
    E('pickingNone', { ...setupBase, places: [], current: null, picking: true, previewWith: '', previewEvents: [] })
    const INFO = { hasDesign: true, event: { date: isUS ? 'Sat, Oct 10' : 'Sat 10 Oct', name: 'The Kings Arms', town: 'Lavenham', time: isUS ? '5–8:30pm' : '17:00–20:30', status: 'confirmed' },
      options: [{ source: 'default', path: 'standard.png', label: 'Standard design' }, { source: 'place', path: 'p1.png', label: 'The Kings Arms picture' }], chosen: 'place',
      layoutSource: 'place', placeName: 'The Kings Arms', text: 'We are at The Kings Arms, Lavenham on Saturday, 5–8:30pm.', placeId: 'p1' }
    const modal = () => Wr(h(M.EP.EventPostModal, { token: 'harness', eventId: 'e1', onClose: noop, onNeedsSetup: noop }))
    safe('event|modal|loadingError', () => html({ loading: true, msg: 'Could not load', __after: epMsgAfter({ msg: { key: 'error.couldNotLoad' } }) }, modal()))
    safe('event|modal|building', () => html({ loading: false, info: { ...INFO, options: [INFO.options[0]], placeId: null }, choice: 'default', png: null }, modal()))
    safe('event|modal|ready', () => html({ loading: false, info: INFO, choice: 'default', png: 'blob:event-png', alsoSave: true }, modal()))

    // ══ share — PostShareBar ═════════════════════════════════════════════════════════════════════════════
    const blob = new Blob(['png'], { type: 'image/png' })
    const bar = o => Wr(h(M.PSB.PostShareBar, { blob: null, url: null, fileName: 'weekly-post-this.png', caption: 'Find us this week!', onStatus: noop, ...o }))
    safe('share|empty', () => html({}, bar()))
    safe('share|readyCopied', () => html({ copied: true }, bar({ blob, url: 'blob:png' })))
    safe('share|canShare', () => {
      const nav = globalThis.navigator
      const had = Object.getOwnPropertyDescriptor(nav, 'share'), had2 = Object.getOwnPropertyDescriptor(nav, 'canShare')
      Object.defineProperty(nav, 'share', { value: async () => {}, configurable: true, writable: true })
      Object.defineProperty(nav, 'canShare', { value: () => true, configurable: true, writable: true })
      try { return html({}, bar({ blob, url: 'blob:png', captionKind: 'postText', captionWord: 'Post text' })) } finally {
        if (had) Object.defineProperty(nav, 'share', had); else delete nav.share
        if (had2) Object.defineProperty(nav, 'canShare', had2); else delete nav.canShare
      }
    })

    // ══ the week's poster data (GB Monday weeks, US Sunday weeks) ═════════════════════════════════════════════
    const days7 = isUS ? ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']
      : ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']
    const range = { which: 'this', start: days7[0], end: days7[6], days: days7 }
    const WEEK_EVENTS = [
      { id: 'w1', event_date: days7[1], start_time: '17:00', end_time: '20:00', venue_name: 'The Kings Arms', town: 'Lavenham', status: 'confirmed' },
      { id: 'w2', event_date: days7[2], start_time: '12:00', end_time: '14:00', venue_name: 'Town Square', town: 'Sudbury', status: 'cancelled' },
      { id: 'w3', event_date: days7[4], start_time: '17:30', end_time: '20:30', venue_name: 'Riverside Park', town: null, status: 'confirmed' },
      { id: 'w4', event_date: days7[5], start_time: '18:00', end_time: '22:00', venue_name: 'Wedding', town: null, status: 'confirmed', is_private: true },
    ]
    const WL = M.defaultLayout(W, H, cc)
    const weekData = M.buildWeekData(range, WEEK_EVENTS, [], { timeStyle: WL.timeStyle, showCancelled: true, showPrivate: true })
    const entry = M.entryFor(WEEK_EVENTS[0], [], '12h')

    // ══ live — LivePoster with the renderer's own trees ═════════════════════════════════════════════════════
    safe('live|week', () => {
      const tree = M.weeklyTree({ layout: WL, week: weekData, fonts: fontsFor(M.fontsUsedBy(WL).map(f => f.id)), country: cc, note: null })
      return html({}, Wr(h(M.LP.LivePoster, { tree: tree.children, W: tree.W, H: tree.H, scale: 0.4, designW: W })))
    })
    safe('live|event', () => {
      const tree = M.eventTree({ layout: EL, entry, date: days7[1], fonts: fontsFor(M.fontsUsedByEvent(EL).map(f => f.id)), country: cc, note: 'Pre-order online' })
      return html({}, Wr(h(M.LP.LivePoster, { tree: tree.children, W: tree.W, H: tree.H, scale: 0.4, designW: W })))
    })

    // ══ weekly — WeeklyPostApp ════════════════════════════════════════════════════════════════════════════
    const DESIGN = { width: W, height: H, layout: WL, blankUrl: BLANK, exampleUrl: null }
    const DAYS_VIEW = days7.map(d => {
      const es = WEEK_EVENTS.filter(e => e.event_date === d)
      return { date: d, isDayOff: es.length === 0, entries: es.map(e => ({ eventId: e.id, name: e.is_private ? 'Private event' : e.venue_name, town: e.town, time: `${e.start_time}–${e.end_time}`, status: e.status })) }
    })
    const PER_EVENT = [{ eventId: 'w1', date: days7[1], name: 'The Kings Arms', status: 'confirmed', text: 'We are at The Kings Arms tonight, 5–8pm.' },
      { eventId: 'w3', date: days7[4], name: 'Riverside Park', status: 'confirmed', text: 'Riverside Park on Thursday, 5:30–8:30pm.' }]
    const app = o => Wr(h(M.WP.WeeklyPostApp, { token: 'harness', truckName: 'Pizza Kitchen', initialMode: 'post', initialWeek: 'this', onBack: noop, onAddPlacePictures: noop, onDirtyChange: noop, onSaver: noop, onPictureChanged: noop, ...o }))
    const wBase = { loading: false, design: DESIGN, country: cc, hasLogo: true, placesWithout: { without: 2, total: 4 }, weekStart: isUS ? 'sunday' : 'monday', days: DAYS_VIEW, orderUrl: 'https://hatchgrab.test/test-kitchen' }
    const wpAfter = set => ({ when: /sayWith/, file: WP, set })
    const Wk = (k, st, o) => safe(`weekly|${k}`, () => html(st, app(o)))
    Wk('loading', {})
    Wk('missingTable', { loading: false, missingTable: true })
    Wk('setupFirst', { ...wBase, design: null, mode: 'setup', designKind: 'week', blankUrl: null, layout: null, size: null, uploading: true, msg: { text: 'Use a PNG or JPG picture.', bad: true } }, { initialMode: 'setup', initialDesignKind: 'week' })
    Wk('setupWeek', { ...wBase, mode: 'setup', designKind: 'week', flash: 'Your picture is a new shape, so the boxes went back to where they start.', msg: { text: 'Design saved.', bad: false } }, { initialMode: 'setup', initialDesignKind: 'week' })
    Wk('setupKinds', { ...wBase, mode: 'setup', designKind: 'event' }, { initialMode: 'setup', onBack: undefined })
    Wk('postReady', { ...wBase, mode: 'post', png: 'blob:week', pngBlob: blob, caption: 'Where to find us this week:\nTue — The Kings Arms', perEvent: PER_EVENT, showCancelled: true })
    Wk('postBuilding', { ...wBase, mode: 'post', png: null, rendering: true, error: 'Could not load', busyMsg: 'Could not build the post',
      warnings: [{ where: 'Location', message: 'Riverside Park was made smaller to fit.' }], __after: wpAfter({ error: { code: 'loadFailed' }, busyMsg: { code: 'buildFailed' } }) })
    Wk('postNoEvents', { ...wBase, mode: 'post', days: DAYS_VIEW.map(d => ({ ...d, entries: [], isDayOff: true })), perEvent: [], orderUrl: null, png: 'blob:week', rendering: true, week: 'next', showPrivate: false, excluded: ['w1'] })

    // ══ editor — DesignEditor ═════════════════════════════════════════════════════════════════════════════
    const WLnote = { ...WL, notes: [M.defaultNoteBox(WL)] }
    const legacy = { ...WL }; delete legacy.days
    const editor = o => Wr(h(M.DE.DesignEditor, { token: 'harness', designName: 'Weekly post design', backLabel: '‹ Designs', onBack: noop, initialLayout: WL, country: cc,
      weekStart: isUS ? 'sunday' : 'monday', background: { url: BLANK, width: W, height: H }, onReplacePicture: noop, replacing: false, pictureNote: 'Your picture, 1080 × 1350.',
      previewOptions: [{ id: 'this', label: 'This week' }, { id: 'next', label: 'Next week' }], previewWith: 'this', onPreviewWith: noop, renderPreview: anoop, liveData: null,
      onSave: noop, saving: false, onCancel: noop, onDirtyChange: noop, onSaver: noop, hasLogo: true, placesWithout: { without: 2, total: 4 }, onAddPlacePictures: noop, ...o }))
    const D = (k, st, o) => safe(`editor|${k}`, () => html(st, editor(o)))
    D('week|date', {})
    D('week|heading', { chosen: 'heading' })
    D('week|days', { chosen: 'days' })
    D('week|daysMore', { chosen: 'days', moreOpen: true })
    D('week|rowsLegacy', { chosen: 'rows', hist: { past: [], present: legacy, future: [] } })
    D('week|picture', { chosen: 'place-picture' })
    D('week|pictureNoLogo', { chosen: 'place-picture' }, { hasLogo: false, placesWithout: null })
    D('week|ownText', { chosen: 'note:0' }, { initialLayout: WLnote })
    D('week|allText', { chosen: 'all-text' })
    D('week|bgMore', { chosen: 'location', bgOpen: true, moreOpen: true, standOpen: false })
    D('week|timeMore', { chosen: 'time', moreOpen: true })
    D('week|dateOwnStyle', { chosen: 'date', moreOpen: true }, { initialLayout: { ...WL, date: { ...WL.date, ownStyle: true } } })
    D('week|previewWait', { previewOpen: true, preview: null }, { saving: true })
    D('week|previewReady', { previewOpen: true, preview: 'blob:preview', warnings: [{ where: 'Location', message: 'Riverside Park was made smaller to fit.' }],
      localMsg: { text: 'Undone.', bad: false }, zoomStep: 2 }, { message: { text: 'Could not save', bad: true } })
    D('week|sheetDate', { sheetFor: 'heading', sheetTab: 'words', sheetH: 320 })
    D('week|sheetDays', { chosen: 'days', sheetFor: 'days', sheetTab: 'daysoff', sheetH: 320 })
    D('week|sheetPicture', { sheetFor: 'background', sheetTab: 'picture', sheetH: 320 })
    safe('editor|week|live', () => withLiveFonts(WL, () => html({ stageW: 432, area: { w: 600, h: 750 } },
      editor({ liveData: { kind: 'week', days: weekData.days, start: range.start, end: range.end, note: null } }))))
    const evProps = { designName: 'Single event post design', initialLayout: EL, previewOptions: [{ id: 'e1', label: 'Sat 10 Oct · The Kings Arms' }], previewWith: 'e1' }
    D('event|date', {}, evProps)
    D('event|venue', { chosen: 'location', moreOpen: true }, evProps)
    D('event|area', { chosen: 'town' }, evProps)
    D('event|sheetTime', { sheetFor: 'time', sheetTab: 'style', sheetH: 320 }, evProps)
    D('event|scopeStandard', {}, { ...evProps, readOnly: true, scope: { mode: 'standard', onMode: noop, busy: false, placeName: 'Town Square' } })
    D('event|scopeOwn', { chosen: 'all-text' }, { ...evProps, scope: { mode: 'own', onMode: noop, busy: true, placeName: 'The Kings Arms' } })
    safe('editor|event|live', () => withLiveFonts(EL, () => html({ stageW: 432, area: { w: 600, h: 750 } },
      editor({ ...evProps, liveData: { kind: 'event', entry, date: days7[1], note: null } }))))

    // ══ bits — DesignEditorBits ════════════════════════════════════════════════════════════════════════════
    const B = M.BITS
    safe('bits|stepper', () => html({}, Wr(h('div', null, h(B.ToolCell, { label: 'Size' }, h(B.Stepper, { value: 48, onChange: noop, min: 6, max: 200, step: 2, suffix: 'px' })),
      h(B.Stepper, { value: 12, onChange: noop, min: 6, max: 200, minusLabel: 'A−', plusLabel: 'A+' })))))
    safe('bits|slider', () => html({}, Wr(h(B.Slider, { label: 'Darken', value: 30, onChange: noop, min: 0, max: 70, step: 5, hint: 'Makes the words easier to read.', format: v => `${v}%` }))))
    safe('bits|colour', () => html({}, Wr(h('div', null, h(B.ColourField, { value: '#f97316', onChange: noop, label: 'Text' }), h(B.ColourField, { value: '#123456', onChange: noop })))))
    safe('bits|optionalColour', () => html({}, Wr(h('div', null, h(B.OptionalColourRow, { label: 'Band', value: '#000000', onChange: noop, hint: 'A band behind the words.' }),
      h(B.OptionalColourRow, { label: 'Outline', value: null, onChange: noop })))))
    safe('bits|popover', () => html({}, Wr(h(B.Popover, { open: true, onClose: noop, title: 'Letters', subtitle: 'How the words look' },
      h(B.GroupHeading, null, 'Style'), h(B.Switch, { on: true, onToggle: noop, label: 'Date' }), h(B.Switch, { on: false, onToggle: noop, label: 'Time' }),
      h(B.CheckRow, { label: 'Capital letters', checked: true, onChange: noop, hint: 'Every letter a capital.' })))))

    // ══ font — FontPicker ════════════════════════════════════════════════════════════════════════════════
    // ⚠️ `sample` is passed, as DesignEditor always passes it (the design's own date wording, in the truck's country) —
    // FontPicker's `country` prop is new, and a view must not rely on a new prop.
    const fontSample = M.DE.dateSampleFor(WL, cc)
    const picker = o => Wr(h(M.FP.FontPicker, { value: 'oswald', onChange: noop, token: 'harness', className: 'w-full', sample: fontSample, onLibraryChanged: noop, ...o }))
    const F = (k, l, st, o) => safe(`font|${k}`, () => withFontLib(l, () => html(st, picker(o))))
    const fontFile = { name: 'BrandSans-Regular.ttf', size: 120000, type: 'font/ttf' }
    F('loading', null, {}, { value: 'mystery-font' })
    F('closed', lib(), {})
    F('openAll', lib({ recent: ['anton', 'lato'] }), { open: true })
    F('openOwnEmpty', lib(), { open: true, tab: 'own' })
    F('openOwn', lib({ own: OWN_FONTS }), { open: true, tab: 'own' }, { value: 'own-1' })
    F('searchNone', lib(), { open: true, query: 'zebra' })
    F('manyBold', lib({ fonts: [...LIB_FONTS, ...MANY] }), { open: true, tab: 'bold' })
    F('error', lib({ fonts: [], popular: [], over: { error: 'The font library could not be loaded' } }), { open: true })
    F('choosing', lib(), { open: true, choosing: 'pacifico', msg: { text: 'That font could not be added', bad: true } })
    F('upload', lib({ own: OWN_FONTS }), { open: true, picked: fontFile, ticked: true, busy: true })
    F('uploadAdded', lib({ own: OWN_FONTS }), { open: true, picked: fontFile, ticked: true, msg: { text: 'Brand Sans added (regular).', bad: false },
      added: { displayName: 'Brand Sans', faceLabel: 'Regular', missing: [{ face: '700', label: 'Bold' }, { face: '400i', label: 'Italic' }] } })

    // ══ drag — DraggableBox ════════════════════════════════════════════════════════════════════════════════
    const box = { x: 60, y: 200, w: 300, h: 90 }
    safe('drag|active', () => html({}, Wr(h(M.DB.DraggableBox, { label: 'Date', box, scale: 0.4, active: true, bounds: { w: W, h: H }, onSelect: noop, onChange: noop, onGuides: noop, tint: true, peers: [] }))))
    safe('drag|locked', () => html({}, Wr(h(M.DB.DraggableBox, { label: 'Place picture', box, scale: 0.4, active: false, bounds: { w: W, h: H }, onSelect: noop, onChange: noop, locked: true }))))
  }
  return out
}

module.exports = { views }
