// scripts/_lp1d-named.cjs — THE NAMED CODE CHANGES of Language Phase 1d Part 1 (Manage: Menu, Schedule, Settings). A
// MODULE, read by scripts/language-phase-1d.cjs.
//
// "F" is the AFTER code rendered with the BEFORE words (756ca09's pair + the as-moved overlay). Wherever F differs from
// BEFORE, the CODE changed the output — and every such view must be claimed by an entry below (or be named difference 1,
// an API refusal's added `code`/`params`, which scripts/_lp1d-checks.cjs proves per field):
//   { id, country: 'GB' | 'US' | 'both', what, views: (viewId) => bool, expect?: (beforeValue, viewId) => value }
// • With `expect`, the entry is PRECISE: F must equal expect(BEFORE) byte for byte.
// • Without `expect` (US only), the entry LISTS its views as changed by a named US behaviour; the harness writes each one
//   to scripts/fixtures/language-phase-1d-us-changed.txt and the US-words check still reads every one.
// View ids: `<area>/<GB|US>|…` (area = menu, schedule, settings, copy, api, smoke).
const { mapStrings, mapFields, clock12, applyNamed, pendingCardEntry } = require('./_lp2-named.cjs')
const countryOf = id => (id.split('/').slice(1).join('/').split('|')[0] === 'US' ? 'US' : 'GB')

// ══ ⚠️ RE-PINNED (events that run past midnight, 17 October 2026, docs/midnight-and-format-fixes-report.md) ══════════
// Three PRECISE transforms for app/manage/[token]/page.tsx's intended changes (lib/event-window.ts is the rule: an end
// EARLIER than the start is an event that runs past midnight; only an end EQUAL to the start is refused). Shared with
// scripts/_lp1d2-named.cjs (its smoke-schedule views are this harness's Schedule views, re-rendered).
//
// One EventTimeSelect as React renders it: a wrapper div, the hour Select, the ":" span, the minute Select. Each Select
// is <span class="relative inline-flex min-w-0 items-stretch text-sm {className}"><select aria-label=…>options</select>
// <svg …></svg></span> (components/shared/Select). Captures: 1 hour span head, 2 hour aria, 3 hour options, 4 hour tail,
// 5 minute span head, 6 minute aria, 7 minute options, 8 minute tail.
const MN_TS = /<div class="flex items-center gap-1 w-full">(<span class="relative inline-flex min-w-0 items-stretch text-sm [^"]*"><select[^>]*? aria-label="([^"]*)"[^>]*>)((?:<option[^>]*>[^<]*<\/option>)*)(<\/select><svg[^>]*>[\s\S]*?<\/svg><\/span>)<span class="text-slate-400 text-xs flex-shrink-0" aria-hidden="true">:<\/span>(<span class="relative inline-flex min-w-0 items-stretch text-sm [^"]*"><select[^>]*? aria-label="([^"]*)"[^>]*>)((?:<option[^>]*>[^<]*<\/option>)*)(<\/select><svg[^>]*>[\s\S]*?<\/svg><\/span>)<\/div>/g
const MN_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MN_MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
/** The selected option's value of a captured option list ('' when the placeholder is selected, or none is). */
const mnSelected = opts => (/<option value="([^"]*)" selected="">/.exec(opts) || [])[1] || ''
/** page.tsx splitHhMm / hhMmToMins, and lib/time-utils.ts crossesMidnight (both times valid, end strictly earlier). */
const mnMins = v => { const [h = '', m = ''] = String(v ?? '').split(':'); return /^\d{2}$/.test(h) && /^\d{2}$/.test(m) ? Number(h) * 60 + Number(m) : null }
const mnCrosses = (s, e) => { const a = mnMins(s), b = mnMins(e); return a != null && b != null && b < a }
/** EventTimeSelect's hour label: 24h "17"; 12h (US) clockOf(`${h}:00`, '12h', 'en-US') less ":00" — "5 PM", "12 AM". */
const mnHourLabel = (h, us) => (us ? `${Number(h) % 12 || 12} ${Number(h) < 12 ? 'AM' : 'PM'}` : h)
const mnOpt = (v, label, cur) => `<option value="${v}"${v === cur ? ' selected=""' : ''}>${label}</option>`
/** The leading placeholder option(s) (value="") of a list, byte for byte. */
const mnLead = opts => (/^(?:<option value=""[^>]*>[^<]*<\/option>)*/.exec(opts) || [''])[0]
/** Walks every EventTimeSelect in a markup string, the most recent START time (aria "Start …") being the start of the
 *  next END (aria "End …") — the add/edit form's pair and each import row's pair. `fn(m, ctx)` returns the new block. */
function mnEachTimeSelect(s, fn, firstStart = null) {
  let start = firstStart
  return s.replace(MN_TS, (...m) => {
    const isEnd = /^End\b/.test(m[2]), isStart = /^Start\b/.test(m[2])
    const h = mnSelected(m[3]), mi = mnSelected(m[7])
    const value = h ? `${h}:${mi}` : ''
    const out = fn(m, { isEnd, start: isEnd ? start : null, value, h, mi, offset: m[m.length - 2], whole: m[m.length - 1] })
    if (isStart) start = value || null
    else if (isEnd) start = null
    return out
  })
}
/** (1) THE END SELECT'S OPTIONS (prop `notSameAs`, was `minExclusive`): every hour 00–23 (the value's own hour is one
 *  of them), and in the value's hour every 5-minute step EXCEPT the start's own minute when that hour is the start's
 *  hour; an off-grid stored minute is still injected (sorted), `selected` as BEFORE, the placeholder options as BEFORE.
 *  The start is the form's / row's own start select; the component-level views (`timeSelect|…|end`) have no start
 *  select — their fixture passes `notSameAs: '11:30'` (scripts/_lp1d-schedule.cjs), so 11:30 is theirs (`firstStart`). */
function mnEndOptions(s, us, firstStart = null) {
  return mnEachTimeSelect(s, (m, c) => {
    if (!c.isEnd) return m[0]
    const notMins = mnMins(c.start)
    const minutes = notMins === null || !c.h ? MN_MINUTES : MN_MINUTES.filter(x => Number(c.h) * 60 + Number(x) !== notMins)
    const minuteOptions = c.mi && !minutes.includes(c.mi) ? [...minutes, c.mi].sort() : minutes
    const hours = mnLead(m[3]) + MN_HOURS.map(x => mnOpt(x, mnHourLabel(x, us), c.h)).join('')
    const mins = mnLead(m[7]) + minuteOptions.map(x => mnOpt(x, x, c.mi)).join('')
    return `<div class="flex items-center gap-1 w-full">${m[1]}${hours}${m[4]}<span class="text-slate-400 text-xs flex-shrink-0" aria-hidden="true">:</span>${m[5]}${mins}${m[8]}</div>`
  }, firstStart)
}
let MN_NEXT_DAY = null
/** manageScheduleEvent.endsNextDay as F renders it (a key new since every frozen catalogue: the frozen overlay keeps new
 *  keys at today's en-GB text; en-US has no override). */
const mnNextDay = () => {
  if (MN_NEXT_DAY == null) MN_NEXT_DAY = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../messages/en-GB.json'), 'utf8')).manageScheduleEvent.endsNextDay
  return MN_NEXT_DAY
}
/** (2) "ENDS THE NEXT DAY" under an END whose time is EARLIER than its start (crossesMidnight), right after the time
 *  control: in the import table `text-xs text-slate-400 mt-0.5 px-1.5` (its boxes carry the `border-b` cell classes);
 *  elsewhere `text-xs text-slate-400 mt-1` — and in the Add / Edit form NOT when the end field shows its own error
 *  (`{!formErrors.end_time && …}`: the fixture's add|errors view, 21:00–17:00 with an end error, keeps no hint). */
function mnNextDayHint(s) {
  return mnEachTimeSelect(s, (m, c) => {
    if (!c.isEnd || !mnCrosses(c.start, c.value)) return m[0]
    const after = c.whole.slice(c.offset + m[0].length)
    if (/^<p class="text-xs text-red-500 mt-1">/.test(after)) return m[0]
    const cls = /items-stretch text-sm bg-transparent border-b /.test(m[1]) ? 'text-xs text-slate-400 mt-0.5 px-1.5' : 'text-xs text-slate-400 mt-1'
    return `${m[0]}<p class="${cls}">${mnNextDay()}</p>`
  })
}
/** (3) THE IMPORT REVIEW'S LAYOUT. The cards/table switch moves from `md` to `lg` (the cards' `md:hidden` → `lg:hidden`,
 *  the table's `hidden md:block` → `hidden lg:block` — only the one followed by the import table, not Event types'); the
 *  table's <col> widths are refitted (date 130→120, venue 220→auto, area 150→100, postcode 100→84, start / end 100 →
 *  timeColW = 132 GB / 156 US, van 120→110); and the table's TIME boxes take `tci` instead of the text inputs' `ci`
 *  (less `px-1.5`, `w-full` and the focus underline classes) — only on the time Selects' wrappers, every other `ci`
 *  input byte-identical. (The mobile card's time pair — `timeCls` and the `grid-cols-1 sm:grid-cols-2` stacking — is
 *  rendered by NO captured view: the fixture's cards are not open for editing, so no transform claims it.) */
const MN_CI = 'bg-transparent border-b text-sm text-slate-900 px-1.5 py-2 w-full rounded-none focus:outline-none '
const MN_TCI = 'bg-transparent border-b text-sm text-slate-900 py-2 rounded-none focus:outline-none '
const MN_CI_OK = 'border-b-slate-200 hover:border-b-slate-400 hover:bg-slate-50 focus:border-b-orange-500 focus:bg-slate-50 focus:rounded'
const MN_TCI_OK = 'border-b-slate-200 hover:border-b-slate-400 hover:bg-slate-50'
const MN_MISSING = 'border-b-amber-400 bg-amber-50'
function mnImportLayout(s, us) {
  const W = us ? 156 : 132
  const col = w => (w == null ? '<col/>' : `<col style="width:${w}px"/>`)
  s = s.replace('<div class="md:hidden flex flex-col gap-2">', '<div class="lg:hidden flex flex-col gap-2">')
  s = s.replace(/<div class="hidden md:block overflow-x-auto">(<table class="w-full" style="table-layout:fixed"><colgroup>)<col style="width:32px"\/><col style="width:130px"\/><col style="width:220px"\/><col style="width:150px"\/><col style="width:100px"\/><col style="width:100px"\/><col style="width:100px"\/>(<col style="width:120px"\/>)?<col style="width:36px"\/><\/colgroup>/,
    (_, table, van) => `<div class="hidden lg:block overflow-x-auto">${table}${[32, 120, null, 100, 84, W, W].map(col).join('')}${van ? col(110) : ''}${col(36)}</colgroup>`)
  const swap = head => head.replace(`items-stretch text-sm ${MN_CI}${MN_CI_OK}"`, `items-stretch text-sm ${MN_TCI}${MN_TCI_OK}"`)
    .replace(`items-stretch text-sm ${MN_CI}${MN_MISSING}"`, `items-stretch text-sm ${MN_TCI}${MN_MISSING}"`)
  return mnEachTimeSelect(s, m => `<div class="flex items-center gap-1 w-full">${swap(m[1])}${m[3]}${m[4]}<span class="text-slate-400 text-xs flex-shrink-0" aria-hidden="true">:</span>${swap(m[5])}${m[7]}${m[8]}</div>`)
}
// ══ ⚠️ RE-PINNED (US layout fixes, 18 October 2026, docs/us-layout-proposal-report.md) ═════════════════════════════════
// PRECISE transforms for the Manage edits of the US layout work that reach a GB view (every truck): applied to BEFORE,
// F must equal the result byte for byte. Shared with scripts/_lp1d2-named.cjs (its smoke-schedule / settings views are
// this harness's views, re-rendered). Each runs AFTER the midnight transforms (it reads the time-select blocks they
// read, and changes the wrapper class they match on).
//
// (5a) us-layout-fix-5a-phone-time-select — EventTimeSelect: the hour + minute pair's wrapper gains `max-sm:hidden`;
// right after it a `sm:hidden` div with `data-phone-time` holds ONE shared Select: its span class is the caller's
// `phoneClassName ?? className`, aria-label the caller's `label` (else manageScheduleEvent.time.time "Time"), the
// `height` style when the caller passes `phoneHeight`, `disabled` as the hour select's, the chevron as the hour
// select's; options = the hour select's placeholder (selected only when there is no whole value) + every 5-minute time
// 00:00…23:55 EXCEPT the start's own time on an END (notSameAs), a stored off-grid value injected sorted; labels
// clockOf: GB "22:45", US "10:45 PM" (U+00A0 before AM/PM, us-layout-fix-1-nbsp).
// The Add / Edit form passes phoneClassName `w-full [&>select]:rounded-xl [&>select]:text-slate-900 ` (+ the red
// `[&>select]:border-red-400 [&>select]:bg-red-50` when the field has an error) and phoneHeight 42; every other caller
// (the import table, the component-level views) passes neither.
const USL_FORM_CLS = 'w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white '
const uslEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const uslClock = (v, us) => { if (!us) return v; const [h, m] = v.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}\u00a0${h < 12 ? 'AM' : 'PM'}` }
function uslPhoneTimeSelect(s, us, firstStart = null) {
  return mnEachTimeSelect(s, (m, c) => {
    const head = m[1]
    const spanCls = (/^<span class="relative inline-flex min-w-0 items-stretch text-sm ([^"]*)">/.exec(head) || [])[1]
    const aria = (/ aria-label="([^"]*)"/.exec(head) || [])[1]
    if (spanCls == null || aria == null) return m[0]
    let phoneCls = spanCls, height = null
    if (spanCls.startsWith(USL_FORM_CLS)) {
      const rest = spanCls.slice(USL_FORM_CLS.length)
      if (rest !== 'border-slate-200' && rest !== 'border-red-400 bg-red-50') return m[0]
      phoneCls = uslEsc(`w-full [&>select]:rounded-xl [&>select]:text-slate-900 ${rest === 'border-red-400 bg-red-50' ? '[&>select]:border-red-400 [&>select]:bg-red-50' : ''}`)
      height = 42
    }
    // the hour aria is time.hourOf "{label} hour" / time.hour "Hour" (en-GB and en-US alike) — the label is what precedes " hour"
    const label = / hour$/.test(aria) ? aria.slice(0, -' hour'.length) : aria === 'Hour' ? 'Time' : null
    if (label == null) return m[0]
    const lead = (/^<option value=""[^>]*>([^<]*)<\/option>/.exec(m[3]) || [])[1]
    if (lead == null) return m[0]
    const cur = c.h && c.mi ? `${c.h}:${c.mi}` : ''
    const notMins = c.isEnd ? mnMins(c.start) : null
    const all = MN_HOURS.flatMap(h => MN_MINUTES.map(x => `${h}:${x}`)).filter(v => notMins === null || mnMins(v) !== notMins)
    if (cur && !all.includes(cur)) { all.push(cur); all.sort() }
    const phoneHead = head
      .replace(`items-stretch text-sm ${spanCls}">`, `items-stretch text-sm ${phoneCls}">`)
      .replace(` aria-label="${aria}"`, ` aria-label="${label}"${height ? ` style="height:${height}px"` : ''}`)
    const opts = mnOpt('', lead, cur) + all.map(v => mnOpt(v, uslClock(v, us), cur)).join('')
    const pair = m[0].replace('<div class="flex items-center gap-1 w-full">', '<div class="flex items-center gap-1 w-full max-sm:hidden">')
    return `${pair}<div class="flex items-center gap-1 w-full sm:hidden" data-phone-time="true">${phoneHead}${opts}${m[4]}</div>`
  }, firstStart)
}
// (3) us-layout-fix-3-schedule-phone-cards — Manage › Schedule cards: the main row gains the phone grid classes; on a
// card WITH action icons (not "Needs your approval") the divider gains `max-sm:row-span-2`, the time line's " · van"
// is wrapped in a `max-sm:hidden` span and the van gets its own `sm:hidden` line (`data-van-line`) right after the
// time line, and the actions div gains `max-sm:col-start-3 max-sm:flex-wrap` + `data-card-actions`. A pending card's
// divider and inline " · van" are BEFORE's (lead's narrowing, 18 October). The overnight chip (`data-overnight-hint`)
// gains `whitespace-nowrap` on every card.
const USL_ROW = '<div class="flex items-start gap-4"><div class="flex flex-col items-center justify-center w-12 flex-shrink-0 text-center pl-2">'
const USL_ROW_NEW = '<div class="flex items-start gap-4 max-sm:grid max-sm:grid-cols-[3rem_1px_minmax(0,1fr)] max-sm:gap-x-4 max-sm:gap-y-2.5"><div class="flex flex-col items-center justify-center w-12 flex-shrink-0 text-center pl-2">'
const USL_ACTIONS = '<div class="flex items-center gap-1.5 flex-shrink-0 self-start">'
const USL_TIME_VAN = /(<p class="text-sm font-semibold text-slate-700 mt-0\.5">(?:[^<]|<span[^>]*>[^<]*<\/span>)*?) · ([^<·]*)<\/p>/
function uslScheduleCards(s) {
  if (!s.includes(USL_ROW)) return s
  const parts = s.split(USL_ROW)
  const out = [parts[0]]
  for (let seg of parts.slice(1)) {
    const a = seg.indexOf(USL_ACTIONS)
    if (a >= 0) { // a card with action icons: everything up to its actions div is this card's main row
      let row = seg.slice(0, a)
      row = row.replace('<div class="w-px bg-slate-100 self-stretch flex-shrink-0"></div>', '<div class="w-px bg-slate-100 self-stretch flex-shrink-0 max-sm:row-span-2"></div>')
      row = row.replace(USL_TIME_VAN, (_, p, van) => `${p}<span class="max-sm:hidden"> · ${van}</span></p><p class="sm:hidden text-xs font-semibold text-slate-600 mt-0.5" data-van-line="true">${van}</p>`)
      seg = row + '<div class="flex items-center gap-1.5 flex-shrink-0 self-start max-sm:col-start-3 max-sm:flex-wrap" data-card-actions="true">' + seg.slice(a + USL_ACTIONS.length)
    }
    out.push(seg)
  }
  return out.join(USL_ROW_NEW).replace(/(<span class="ml-1\.5 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1\.5 py-0\.5 text-\[11px\] font-bold)(" data-overnight-hint)/g, '$1 whitespace-nowrap$2')
}
// (12) us-layout-fix-12-deadline-row — Manage › Settings › Pre-orders › Deadline: the type select gains `min-w-0`.
const uslDeadlineRow = s => s.replace('<select class="border border-slate-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"><option value="hours_before"',
  '<select class="min-w-0 border border-slate-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"><option value="hours_before"')
// (2) us-layout-fix-2-live-on-date-line — components/TruckListCard.tsx (Manage › Add / Edit event's preview is a compact
// card): the date span is wrapped in a new `flex items-center gap-2 leading-none whitespace-nowrap` span that also holds
// "● Live" (a LiveBadge: `inline-flex` on compact, `hidden sm:inline-flex` on the full card); the range is ONE span of its
// own (`text-[12px] font-bold text-slate-500 leading-none mt-0.5`, the inner <span> gone); the full card repeats the
// badge after the range as `inline-flex sm:hidden mt-0.5` (phones keep date · range · Live). Compact: the column is
// `min-w-[112px]` (was `w-[112px]`), and `pr-20` moves from the venue row (now `… gap-3 ` with the empty branch) to the
// venue <h3> (`line-clamp-1 pr-20`). Date, range and the Live word byte-identical.
const USL_TLC_DATE = '<span class="text-[13px] sm:text-sm font-bold text-orange-600 leading-none">'
const USL_TLC_LIVE_OLD = /<span class="inline-flex items-center gap-1 text-green-600"><span class="w-1\.5 h-1\.5 rounded-full bg-green-500 inline-block"><\/span>([^<]*)<\/span>/
const uslLiveBadge = (cls, label) => `<span class="${cls} items-center gap-1 text-[12px] font-bold leading-none text-green-600"><span class="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>${label}</span>`
const USL_TLC = /<div class="(flex flex-col items-start gap-0\.5 shrink-0 w-\[112px\]|flex flex-row sm:flex-col items-center sm:items-start gap-2 sm:gap-0\.5 shrink-0 sm:w-\[140px\])"><span class="text-\[13px\] sm:text-sm font-bold text-orange-600 leading-none">([^<]*)<\/span><span class="flex items-center gap-2 text-\[12px\] font-bold text-slate-500 leading-none mt-0\.5"><span>([^<]*)<\/span>((?:<span class="inline-flex items-center gap-1 text-green-600"><span class="w-1\.5 h-1\.5 rounded-full bg-green-500 inline-block"><\/span>[^<]*<\/span>)?)<\/span><\/div>(?:(<div class="flex-1 min-w-0 flex flex-row items-center justify-between gap-3) pr-20">((?:(?!<h3 )[\s\S])*?)(<h3 class="[^"]*? line-clamp-1)")?/g
function uslTruckListCard(s) {
  return s.replace(USL_TLC, (whole, colCls, date, range, live, row, between, h3) => {
    const compact = colCls.includes('w-[112px]')
    if (compact !== (row != null)) return whole // a compact column without its venue row (or the reverse): leave it, so the view fails
    const label = live ? USL_TLC_LIVE_OLD.exec(live)[1] : null
    const col = compact ? 'flex flex-col items-start gap-0.5 shrink-0 min-w-[112px]' : colCls
    const dateLine = `<span class="flex items-center gap-2 leading-none whitespace-nowrap">${USL_TLC_DATE}${date}</span>${label != null ? uslLiveBadge(compact ? 'inline-flex' : 'hidden sm:inline-flex', label) : ''}</span>`
    const rangeLine = `<span class="text-[12px] font-bold text-slate-500 leading-none mt-0.5">${range}</span>${label != null && !compact ? uslLiveBadge('inline-flex sm:hidden mt-0.5', label) : ''}`
    const tail = compact ? `${row} ">${between}${h3} pr-20"` : ''
    return `<div class="${col}">${dateLine}${rangeLine}</div>${tail}`
  })
}

/** The US layout entries for a harness: `sched` picks Schedule views (`<area>/<GB|US>|…`), `settings` the Settings page
 *  views. PRECISE on every view they claim (on a US view an existing LISTED entry still wins, as for the midnight ones). */
const uslEntries = (sched, settings, country = 'both', agent = 'US layout fixes (18 Oct 2026)') => [
  { id: 'us-layout-fix-3-schedule-phone-cards', country, agent,
    what: '⚠️ RE-PINNED (18 October 2026, docs/us-layout-proposal-report.md): Manage › Schedule cards, every truck — below 640px a grid (date | divider | details, the icons beneath). PRECISE: the main row gains `max-sm:grid max-sm:grid-cols-[3rem_1px_minmax(0,1fr)] max-sm:gap-x-4 max-sm:gap-y-2.5`; on a card WITH action icons the divider gains `max-sm:row-span-2`, " · van" becomes `<span class="max-sm:hidden"> · van</span>` + a `sm:hidden` `data-van-line` line holding the van, the actions div gains `max-sm:col-start-3 max-sm:flex-wrap` + `data-card-actions`; a pending card keeps BEFORE’s divider and inline " · van"; the overnight chip gains `whitespace-nowrap`. Every word and every other class byte-identical.',
    views: id => sched.test(id) && /\|tab\|/.test(id),
    expect: b => mapStrings(b, uslScheduleCards) },
  { id: 'us-layout-fix-5a-phone-time-select', country, agent,
    what: '⚠️ RE-PINNED (18 October 2026, docs/us-layout-proposal-report.md): EventTimeSelect (Add / Edit event, Import review, the component views), every truck — the hour + minute pair inside `max-sm:hidden`, PLUS a `sm:hidden` `data-phone-time` control: ONE Select per time listing every 5-minute time ("22:45" / "10:45 PM") without the start’s own time on an end, aria-label = the field’s label or "Time" (manageScheduleEvent.time.time); in Add / Edit its box is `w-full [&>select]:rounded-xl [&>select]:text-slate-900` (+ the red pair on an error) at 42px. PRECISE (uslPhoneTimeSelect): the pair byte-identical but its wrapper class.',
    views: id => sched.test(id) && /\|(timeSelect\||tab\|(add|edit|import)\|?)/.test(id),
    expect: (b, id) => mapStrings(b, s => uslPhoneTimeSelect(s, countryOf(id) === 'US', /\|timeSelect\|[^|]+\|end$/.test(id) ? '11:30' : null)) },
  { id: 'us-layout-fix-2-live-on-date-line', country, agent,
    what: '⚠️ RE-PINNED (18 October 2026, docs/us-layout-proposal-report.md): components/TruckListCard.tsx — Manage’s Add / Edit event preview (a compact card): "● Live" moves from the range line to the date line (a LiveBadge in a new flex span around the date), the range is a span of its own; compact column `min-w-[112px]` (was `w-[112px]`), `pr-20` moved from the venue row to the venue <h3>. PRECISE (uslTruckListCard): date, range and the Live word byte-identical.',
    views: id => sched.test(id) && /\|tab\|/.test(id),
    expect: b => mapStrings(b, uslTruckListCard) },
  { id: 'us-layout-fix-12-deadline-row', country, agent,
    what: '⚠️ RE-PINNED (18 October 2026, docs/us-layout-proposal-report.md): Manage › Settings › Pre-orders › Deadline — the type select gains `min-w-0` (the row was 11px too wide at 390px). PRECISE: that one class, on the select whose first option is hours_before.',
    views: id => settings.test(id),
    expect: b => mapStrings(b, uslDeadlineRow) },
]

/** The three as `NAMED` entries for a harness, over the views `re` picks (`<area>/<GB|US>|…`). */
const midnightEntries = (re, agent = 'midnight + format fixes (17 Oct 2026)') => [
  { id: 'midnight-end-select-not-same-as', country: 'both', agent,
    what: '⚠️ RE-PINNED (17 October 2026, docs/midnight-and-format-fixes-report.md): Manage › Add / Edit event and the import review — the END time control (EventTimeSelect `notSameAs`, was `minExclusive`) offers every hour 00–23 and every 5-minute step except the start’s own time (an end before the start is an event that runs past midnight, lib/event-window.ts); it offered only times after the start. PRECISE: the end select’s hour and minute <option> lists rebuilt by that rule from BEFORE’s selected value and the form’s / row’s start; `selected`, the placeholder and an injected off-grid value as BEFORE.',
    views: id => re.test(id) && /\|(timeSelect\|[^|]+\|end|tab\|(add|edit|import)\|?)/.test(id),
    expect: (b, id) => mapStrings(b, s => mnEndOptions(s, countryOf(id) === 'US', /\|timeSelect\|[^|]+\|end$/.test(id) ? '11:30' : null)) },
  { id: 'midnight-ends-next-day-hint', country: 'both', agent,
    what: '⚠️ RE-PINNED (17 October 2026, docs/midnight-and-format-fixes-report.md): Manage › Add / Edit event — "Ends the next day" (manageScheduleEvent.endsNextDay) under End time when the end is EARLIER than the start and the end field shows no error. Shown by edit|times|midnight (20:00–00:00) and edit|private (12:00–00:00); NOT by add|errors (21:00–17:00, but its fixture holds an end_time error). errors.endSameAsStart (end EQUAL to start) is shown by no view: no fixture has an equal pair.',
    views: id => re.test(id) && /\|tab\|(add|edit|import)\|?/.test(id),
    expect: b => mapStrings(b, s => mnNextDayHint(s)) },
  { id: 'midnight-import-review-layout', country: 'both', agent,
    what: '⚠️ RE-PINNED (17 October 2026, docs/midnight-and-format-fixes-report.md): Schedule › Import review — cards below `lg` / the table from `lg` (was `md`); the table’s <col> widths refitted (time columns timeColW 132px GB / 156px US; date 120, venue auto, area 100, postcode 84, van 110); the table’s time boxes take `tci` (no px-1.5 / w-full / focus underline) instead of the text inputs’ `ci`. PRECISE: rows, values, inputs, controls and every other class byte-identical.',
    views: id => re.test(id) && /\|tab\|import\|/.test(id),
    expect: (b, id) => mapStrings(b, s => mnImportLayout(s, countryOf(id) === 'US')) },
]


// ══ ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026, docs/plans-data-model-report.md) ══════════════════════
// Every plan gets every feature now (lib/features.ts canAccess: override-only), so a view rendered for a Starter / Pro /
// trial truck shows EXACTLY what the same view showed the Max fixture truck. PRECISE by substitution: the expected value
// is BEFORE of the sibling view (same state, the Max truck), and every later named change applies on top as usual.
// A FACTORY: Part 1 names these on its own views; scripts/_lp1d2-named.cjs re-uses them on its smoke-<area> copies of
// them (`prefix: 'smoke-'`, BEFORE from its own capture) — one copy of each transform.
const PLANS_SIBLING_BASE = {
  'schedule/|tab|starter': 'schedule/|tab|list',
  'settings/|starter|page': 'settings/|owner|page',
  'settings/|pro|page': 'settings/|twoVans|page',          // pro: two vans, as twoVans
  'settings/|trial|page': 'settings/|owner|page',
  'settings/|vanUpgrade|page': 'settings/|owner|page',      // the van upgrade modal is removed (no van limit by plan)
}
const PLANS_BEFORE = {}
/** BEFORE of a view id (`<area>/<key>`), from a committed capture directory under scripts/fixtures (never recaptured). */
const plansBefore = (dir, id) => {
  const area = id.split('/')[0]
  const key = `${dir}/${area}`
  if (!(key in PLANS_BEFORE)) {
    const f = require('path').join(__dirname, 'fixtures', dir, `${area}.json.gz`)
    PLANS_BEFORE[key] = JSON.parse(require('zlib').gunzipSync(require('fs').readFileSync(f))).views
  }
  const v = PLANS_BEFORE[key][id.slice(area.length + 1)]
  if (v === undefined) throw new Error(`plans re-pin: no BEFORE view ${id} in scripts/fixtures/${dir}`)
  return v
}
/** `<prefix><area>/<GB|US>|…` → the sibling id, or null. */
const plansSibling = (id, prefix) => {
  if (!id.startsWith(prefix)) return null
  const rest = id.slice(prefix.length), m = /^([^/]+)\/(GB|US)(\|.*)$/.exec(rest)
  if (!m) return null
  const sib = PLANS_SIBLING_BASE[`${m[1]}/${m[3]}`]
  return sib ? prefix + sib.replace('/|', `/${m[2]}|`) : null
}
/** The API views whose refusal premise was a plan tier; their fixture now switches the feature off by override. */
const PLANS_REFUSALS = /^api\/(GB|US)\|(manage\|(preorderNotPro|privateLinkNotPro|newLinkNotPro|editPrivateNotPro|createPrivateNotPro)|eventTypes\|(notMax|loadNotEntitled|privateNotPro)|eventsAction\|confirmPrivateNotPro)$/
// (Part 2's BEFORE, 826471a, words the pre-order refusal "Pre-orders are part of the Pro plan." — a Part 2 GB fix.)
const PLANS_PLAN_SENTENCES = ['Pre-orders requires the Pro plan', 'Pre-orders are part of the Pro plan.', 'Private events are part of the Pro plan.', 'Event types are part of the Max plan.']
const SWITCHED_OFF_BODY = JSON.stringify({ error: 'This feature is switched off for your truck.', code: 'feature_switched_off', params: {} })
/** A refusal body that named a plan → the neutral switched-off refusal (status and writes untouched). */
const plansRefusal = sentences => b => {
  if (!b || typeof b !== 'object' || typeof b.body !== 'string') return b
  let body; try { body = JSON.parse(b.body) } catch { return b }
  if (!body || !sentences.includes(body.error)) return b
  return { ...b, body: SWITCHED_OFF_BODY }
}
/** GET /api/manage's body with the seeded catalogue as `plans`, right after `countrySettings`. */
const plansGetCatalogue = b => {
  if (!b || typeof b !== 'object' || typeof b.body !== 'string') return b
  let body; try { body = JSON.parse(b.body) } catch { return b }
  if (!body || !('countrySettings' in body) || 'plans' in body) return b
  const cat = require('./_plans-catalog-fixture.cjs').seedCatalog(require('path').resolve(__dirname, '..'))
  const out = {}
  for (const [k, v] of Object.entries(body)) { out[k] = v; if (k === 'countrySettings') out.plans = cat }
  return { ...b, body: JSON.stringify(out) }
}
const under = (prefix, re) => id => id.startsWith(prefix) && re.test(id.slice(prefix.length))
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the schedule event row's "Make post" shortcut, as BEFORE
// rendered it (one <button> whose label is "Make post").
const MAKE_POST_BUTTON = /<button class="[^"]*"><span class="sm:hidden">▣<\/span><span class="hidden sm:inline">Make post<\/span><\/button>/g
/** The fixture truck's EFFECTIVE plan's extra-van price in the view's country, as Manage words it ("69", "29.50"). */
function fixtureVanPrice(id) {
  const cc = /(^|\/)(GB|US)\|/.exec(id)?.[2] || 'GB'
  const cat = require('./_plans-catalog-fixture.cjs').seedCatalog(require('path').resolve(__dirname, '..'))
  const key = require('./_lp1d-fixtures.cjs').country(cc).truck.plan
  const plan = cat.plans.find(p => p.key === key && p.active) || cat.plans.find(p => p.isExpiryFallback)
  const minor = cat.prices.find(r => r.planKey === plan.key && r.countryCode === cc)?.extraVanMonthlyMinor ?? 0
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2)
}
const plansEntries = ({ prefix = '', beforeDir = 'language-phase-1d-before', smokeOnly = false } = {}) => [
  { id: 'plans-every-plan-every-feature', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): no plan gates a feature (canAccess is override-only). A Starter, Pro or trial truck sees exactly what the Max fixture truck saw: Schedule (tab|starter = tab|list) and Settings (starter / trial / vanUpgrade = owner; pro = twoVans — the van upgrade modal is removed). PRECISE: F = BEFORE of that sibling view (+ the later named changes).',
    views: id => plansSibling(id, prefix) != null,
    expect: (b, id) => plansBefore(beforeDir, plansSibling(id, prefix)) },
  { id: 'plans-van-price-from-catalogue', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the extra-van price is the EFFECTIVE plan’s plan_prices.extra_van_monthly_minor (lib/plans.ts extraVanMonthlyMinor). The fixture truck’s plan "max" is no plan any more, so its effective plan is the expiry fallback (Pay as you go: no extra-van price): "£49/month" → "£0/month" in the van billing modal body and "Add truck — £49/mo" → "£0/mo" on its button (the modal is forced open by the fixture; US: the same in $). The modal’s frozen words (legacyVanBillingVariant) are unchanged. PRECISE: those two amounts.',
    views: under(prefix, /^settings\/(GB|US)\|vanBilling\|page$/),
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the fixture truck is on `unlimited` now (the plan Stage A
    // mapped "max" to — scripts/_lp1d-fixtures.cjs), so its effective plan HAS an extra-van price: the amount is that plan's
    // seeded plan_prices.extra_van_monthly_minor in the view's country (GB £69, US $69 as seeded), read from the seed here,
    // no longer the fallback's 0. Still PRECISE: those two amounts, the modal's frozen words unchanged.
    expect: (b, id) => { const amt = fixtureVanPrice(id); return mapStrings(b, x => x.replace(/costs <strong>([£$])[\d,.]+\/month<\/strong>/, (_, c) => `costs <strong>${c}${amt}/month</strong>`).replace(/>Add truck — ([£$])[\d,.]+\/mo<\/button>/, (_, c) => `>Add truck — ${c}${amt}/mo</button>`)) } },
  { id: 'plans-a2-payg-no-make-post', country: 'both', agent: 'plan-features-config Stage A2 (20 Oct 2026)',
    what: '⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): plans switch features now (public.plan_features; NO ROW = ON). The `tab|starter` view’s truck has plan "starter", no plan key since Stage A, so it resolves to the expiry fallback Pay as you go — WITH payg’s switches, and payg has schedule_graphics OFF. So the event row’s "Make post" shortcut (behind features.can(\'schedule_graphics\')) is gone from that view; everything else is the Stage A sibling (tab|list). PRECISE: every "Make post" button removed (at least one must be).',
    views: under(prefix, /^schedule\/(GB|US)\|tab\|starter$/),
    expect: b => mapStrings(b, x => { const y = x.replace(MAKE_POST_BUTTON, ''); if (typeof x === 'string' && x.includes('Make post') && y === x) throw new Error('plans-a2-payg-no-make-post: no Make post button to remove'); return y }) },
  { id: 'plans-manage-get-catalogue', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): GET /api/manage answers the plan catalogue — a `plans` field ({ plans, prices }, lib/plans.ts PlanCatalog) right after `countrySettings` — which the Manage page reads into its planCatalog state. PRECISE: that one field, equal to the migration’s seed (scripts/_plans-catalog-fixture.cjs); every other field byte-identical.',
    views: under(prefix, /^api\/(GB|US)\|manageGET\|/),
    expect: plansGetCatalogue },
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): CountrySettings lost the plan-price fields (scripts/_lp-stage-b.cjs).
  { id: 'pricing-b-country-settings-fields', country: 'both', agent: 'pricing-pages Stage B (20 Oct 2026)',
    what: '⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): GET /api/manage’s `countrySettings` no longer carries starterMonthlyMinor / proMonthlyMinor / maxMonthlyMinor / proAllowanceMinor / maxAllowanceMinor / platformFeePct (lib/country-settings.ts stopped selecting them; plan prices are plan_prices). PRECISE: exactly those keys leave the country-settings object; every other field byte-identical.',
    views: under(prefix, /^api\/(GB|US)\|manageGET\|/),
    expect: b => require('./_lp-stage-b.cjs').countrySettingsFieldsGone(b) },
  { id: 'pricing-b-catalogue-ignored-features', country: 'both', agent: 'pricing-pages Stage B (20 Oct 2026)',
    what: '⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the plan catalogue GET /api/manage answers (`plans`) ends with `ignoredFeatures` — the plan_features rows naming no code feature, which the loader sets aside for Admin’s warning (lib/plans.ts splitUnknownFeatures); [] on the seed. PRECISE: that one key, last.',
    views: under(prefix, /^api\/(GB|US)\|manageGET\|/),
    expect: b => require('./_lp-stage-b.cjs').catalogueIgnoredFeatures(b) },
  { id: 'plans-refusal-switched-off', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the plan-tier refusals (preorders_pro, private_events_pro, event_types_max) are gone; these views’ fixtures now switch the feature off by OVERRIDE, and the route refuses with refuse(\'feature_switched_off\', 403): body {"error":"<the plan sentence>"(,"upgrade":true)} → {"error":"This feature is switched off for your truck.","code":"feature_switched_off","params":{}}. Status and every write byte-identical. PRECISE.',
    views: under(prefix, PLANS_REFUSALS),
    expect: plansRefusal(PLANS_PLAN_SENTENCES) },
  { id: 'plans-event-types-no-upgrade-message', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): /api/event-types load no longer answers `upgradeMessage` (always null for an entitled truck; the upgrade prompt is gone with the tiers). PRECISE: the one `"upgradeMessage":null,` field removed from the body.',
    views: under(prefix, /^api\/(GB|US)\|eventTypes\|/),
    expect: b => (b && typeof b === 'object' && typeof b.body === 'string' ? { ...b, body: b.body.replace('"upgradeMessage":null,', '') } : b) },
  { id: 'plans-max-badge-gone', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the Private column’s Max badge and its key privateEvents.grid.maxOnly ("Max only") are removed; the copy view records the key’s absence from both message files (scripts/_lp1d-copy.cjs). PRECISE.',
    views: under(prefix, /^copy\/(GB|US)\|privateEvents\|MAX_ONLY_TITLE$/),
    expect: b => (b === 'Max only' ? '[removed in Stage A: privateEvents.grid.maxOnly]' : b) },
].map(e => (smokeOnly ? { ...e, smokeOnly: true } : e))

const NAMED = [
  // ⚠️ RE-PINNED (plans-data-model, Stage A): FIRST, so the sibling substitution runs before every later transform.
  ...plansEntries(),
  // ── SCHED-A ─────────────────────────────────────────────────────────────────────────────────────────────────
  { id: '1d-places-sept-sep', country: 'GB', agent: 'SCHED-A',
    what: 'Schedule › places (Add event picker, Tidy up, PlaceList / placeSubLine): a short month is "Sep", never Intl’s en-GB "Sept" — SchedulePlaces.shortDay now uses formatShortDate (Phase 2’s P2-sept-sep rule, reaching the places list). "Last: Sat 26 Sept" → "Last: Sat 26 Sep".',
    views: id => /^schedule\/GB\|(tab|places)\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(/\bSept\b/g, 'Sep').replace(/\bSEPT\b/g, 'SEP')) },
  // ── MENU-B ──────────────────────────────────────────────────────────────────────────────────────────────────
  { id: '1d-cancel-row-sentence', country: 'both', agent: 'MENU-B',
    what: 'Setup wizard › settings review › "Allow customers to cancel orders": the prefix, the select and the suffix (three flex items) are ONE sentence now (settingsCopy.allowCancellation.sentence, rule 2), the select a rich tag inside one span; the select’s aria-label is manageMenuImport.settingsReview.cancelAria "How long before pickup customers can cancel" (was "Allow customers to cancel orders — Customers can cancel up to").',
    views: id => /^menu\/(GB|US)\|menuTab\|setup\|settings$/.test(id),
    expect: b => mapStrings(b, s => s
      .replace('<span class="text-xs text-slate-600">Customers can cancel up to</span><select aria-label="Allow customers to cancel orders — Customers can cancel up to" ', '<span class="text-xs text-slate-600">Customers can cancel up to <select aria-label="How long before pickup customers can cancel" ')
      .replace('</select><span class="text-xs text-slate-600">before their pickup ', '</select> before their pickup ')) },
  // ── US BEHAVIOUR (LISTED: each changes many small things in a view — every one of these views is in
  //    scripts/fixtures/language-phase-1d-us-changed.txt, and the US-words check reads them all) ───────────────────
  { id: '1d-us-address-style', country: 'US', agent: 'SCHED-A',
    what: 'US address style (country_settings.address_format = zip_state): "postcode" labels, sentences and example addresses are ZIP code / US examples (ICU selects on {style}); a US ZIP is not upper-cased (no `uppercase`, autoCapitalize="none").',
    views: id => /^schedule\/US\|(tab|places)\|/.test(id) || /^copy\/US\|addressPlaceholders\|addressPlaceholders\|/.test(id) },
  { id: '1d-us-hour-pickers', country: 'US', agent: 'SCHED-A',
    what: 'US 12-hour hour pickers in Add / Edit event and the import review: "12 AM … 11 PM" (were "00" … "23").',
    views: id => /^schedule\/US\|(timeSelect\||tab\|(add|edit|import)\|)/.test(id) },
  { id: '1d-us-paste-example', country: 'US', agent: 'SCHED-A',
    what: 'The paste-a-schedule example in the truck’s own date and clock: US "Saturday, June 14, … 5:00 PM – 9:00 PM" (GB unchanged "Saturday 14th June, …, 5pm-9pm").',
    views: id => /^copy\/US\|addressPlaceholders\|(pastePlaceholder|addressPlaceholders)\|/.test(id) || /^schedule\/US\|tab\|(add|import)\|/.test(id) },
  { id: '1d-us-dates-times', country: 'US', agent: 'SCHED-A / MENU-A / MENU-B',
    what: 'US dates and times on the truck’s clock where they were 24-hour / day-month: excluded-imports dates (formatNumericDate, MM/DD/YYYY), the setup wizard’s schedule read-back ("06/14/2026", "5:00 PM–9:00 PM"), DealsTab times ("11:30 AM – 2:00 PM").',
    views: id => /^menu\/US\|(deals\||menuTab\|setup\|schedule\|)/.test(id) || /^schedule\/US\|tab\|import\|/.test(id) },
  // ⚠️ RE-PINNED (Language Phase 1e): a Phase 1e US-only change reaches Part 1's Settings view — the App Store badge links a
  // US truck to the LOCALE-FREE listing (StoreBadges countryCode, lib/app-badges appStoreUrlFor). LISTED (US), like the
  // clock entry below; GB is unchanged (Part 1's GB views still equal BEFORE). Proven precisely by language-phase-1d2.
  { id: '1e-us-app-store-link', country: 'US', agent: 'CHROME + lead (Language Phase 1e)',
    what: 'Settings › the App Store badge: a US truck links https://apps.apple.com/app/id6803543106 (locale-free) instead of the UK storefront.',
    views: id => /^settings\/US\|[^|]+\|page$/.test(id) },
  { id: '1d-us-settings-clock', country: 'US', agent: 'SETTINGS',
    what: 'Settings on the US clock: the collection-time examples ("Customers can pick 18:00, 18:10, 18:20…" → "6:00 PM, 6:10 PM, 6:20 PM…") and the pre-order rule’s cutoff, via formatSlot; phoneErrorMessage gets the truck’s locale.',
    views: id => /^settings\/US\|[^|]+\|page$/.test(id) },
  // ── ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md) ─────────────────────
  //    Every Schedule tab view renders the pending card of e2 ("Market Square", an unconfirmed scraper event). Its
  //    layout and DOM order changed on purpose (type chooser below the main row, ONE action row, the desktop duplicate
  //    gone, the approveNeedsTimes sentence, location boxes hidden when private): STRUCTURAL, proven by
  //    scripts/_lp2-named.cjs pendingCardProof — the rest of the view byte-identical with the card cut out of both,
  //    the card's words BEFORE's apart from the named ones. Claims a view only when its BEFORE has a pending card.
  //    (US Schedule tab views stay LISTED by 1d-us-address-style, as before — a LISTED view is not byte-proven.)
  pendingCardEntry(id => /^schedule\/(GB|US)\|tab\|/.test(id)),
  // ── ⚠️ RE-PINNED (events that run past midnight, 17 October 2026, docs/midnight-and-format-fixes-report.md) ───────
  //    Three PRECISE transforms (defined above, shared with scripts/_lp1d2-named.cjs): the end select's options
  //    (notSameAs), the "Ends the next day" hint, the import review's layout. US Schedule views stay LISTED by
  //    1d-us-hour-pickers, as before; every GB view they claim must equal BEFORE + them byte for byte (the pending card,
  //    where a view has one, still proven structurally on top).
  ...midnightEntries(/^schedule\/(GB|US)\|/),
  // ── ⚠️ RE-PINNED (US layout fixes, 18 October 2026, docs/us-layout-proposal-report.md) ─────────────────────────────
  //    GB: three PRECISE transforms (defined above, shared with scripts/_lp1d2-named.cjs) — every GB view they claim must
  //    equal BEFORE + them byte for byte. US: this harness's US Schedule / Settings / Menu views are LISTED (above), so the
  //    same changes are LISTED there too, under the same ids, so that scripts/fixtures/language-phase-1d-us-changed.txt
  //    names them; language-phase-1d2 holds the precise US proofs it can.
  ...uslEntries(/^schedule\/GB\|/, /^settings\/GB\|[^|]+\|page$/, 'GB'),
  { id: 'us-layout-fix-1-nbsp', country: 'US', agent: 'US layout fixes (18 Oct 2026)',
    what: '⚠️ RE-PINNED (18 October 2026): lib/time-utils.ts — an en-US clockOf writes U+00A0 before AM/PM ("6:30 PM"), a 12-hour formatTimeRange U+00A0 before the dash ("5:00 PM – 9:30 PM"); 24-hour output byte-identical. LISTED: every US view here that shows a 12-hour time — the setup wizard’s schedule read-back, DealsTab, every Schedule tab / places / time-select view, every Settings page (collection-time examples, pre-order cutoff), the paste-a-schedule example.',
    views: id => /^menu\/US\|(deals\||menuTab\|setup\|schedule\|)/.test(id) || /^schedule\/US\|(tab|places|timeSelect)\|/.test(id) || /^settings\/US\|[^|]+\|page$/.test(id)
      || /^copy\/US\|addressPlaceholders\|(pastePlaceholder|addressPlaceholders)\|/.test(id) },
  { id: 'us-layout-fix-1-manage-join', country: 'US', agent: 'US layout fixes (18 Oct 2026)',
    what: '⚠️ RE-PINNED (18 October 2026): app/manage/[token]/page.tsx DealsTab — a deal’s slot range on a 12-hour truck joins with U+00A0 + "– " ("11:30 AM – 2:00 PM" never breaks before the dash); 24-hour " – " as before. LISTED: the US deals views.',
    views: id => /^menu\/US\|deals\|/.test(id) },
  { id: 'us-layout-fix-3-schedule-phone-cards', country: 'US', agent: 'US layout fixes (18 Oct 2026)',
    what: '⚠️ RE-PINNED (18 October 2026): the Schedule cards’ phone grid (see the GB entry of this id, PRECISE there). LISTED: every US Schedule tab view.',
    views: id => /^schedule\/US\|tab\|/.test(id) },
  { id: 'us-layout-fix-2-live-on-date-line', country: 'US', agent: 'US layout fixes (18 Oct 2026)',
    what: '⚠️ RE-PINNED (18 October 2026): the Add / Edit event preview’s TruckListCard (see the GB entry of this id, PRECISE there). LISTED: the US Schedule tab views.',
    views: id => /^schedule\/US\|tab\|/.test(id) },
  { id: 'us-layout-fix-4-import-heading', country: 'US', agent: 'US layout fixes (18 Oct 2026)',
    what: '⚠️ RE-PINNED (18 October 2026): Manage › Import review, 12-hour trucks only — below 640px the row heading is two block lines (date, time); from 640px the one line as before (`max-sm:hidden` / `sm:hidden block` spans). 24-hour unchanged (no GB view changes). LISTED: the US import review views.',
    views: id => /^schedule\/US\|tab\|import\|(review|reviewEditing|saving)$/.test(id) },
  { id: 'us-layout-fix-5a-phone-time-select', country: 'US', agent: 'US layout fixes (18 Oct 2026)',
    what: '⚠️ RE-PINNED (18 October 2026): EventTimeSelect’s phone control (see the GB entry of this id, PRECISE there). LISTED: the US views that render a time select — the component views, the Add form (picker, phone2, addressOpen, errors, private), every Edit view, the import review (review, reviewEditing, saving).',
    views: id => /^schedule\/US\|(timeSelect\||tab\|(add\|(picker|phone2|addressOpen|errors|private)$|edit$|edit\||import\|(review|reviewEditing|saving)$))/.test(id) },
  { id: 'us-layout-fix-12-deadline-row', country: 'US', agent: 'US layout fixes (18 Oct 2026)',
    what: '⚠️ RE-PINNED (18 October 2026): the pre-order Deadline type select gains `min-w-0` (see the GB entry of this id). LISTED: every US Settings page view.',
    views: id => /^settings\/US\|[^|]+\|page$/.test(id) },
  // ── ⚠️ RE-PINNED (seo-fixes S7, 20 October 2026, docs/seo-fixes-report.md) ─────────────────────────────────────────
  //    components/StoreBadges.tsx: both badge <img>s gain loading="lazy", so React no longer emits their two
  //    <link rel="preload" as="image"> — Manage › Settings shows the badges. GB PRECISE (scripts/_lp-seo-fixes.cjs
  //    badgesLazy, one copy); the US Settings views are LISTED (above), so the change is LISTED there under the same id.
  { id: 'seo-s7-badges-lazy', country: 'GB', agent: 'seo-fixes (20 Oct 2026)',
    what: '⚠️ RE-PINNED (seo-fixes S7, 20 October 2026): Manage › Settings — the App Store / Google Play badges load lazily: loading="lazy" on both <img>s (after height), their two image preload links gone. PRECISE.',
    views: id => /^settings\/GB\|[^|]+\|page$/.test(id),
    expect: b => mapStrings(b, require('./_lp-seo-fixes.cjs').badgesLazy) },
  { id: 'seo-s7-badges-lazy', country: 'US', agent: 'seo-fixes (20 Oct 2026)',
    what: '⚠️ RE-PINNED (seo-fixes S7, 20 October 2026): the store badges load lazily (see the GB entry of this id, PRECISE there). LISTED: every US Settings page view.',
    views: id => /^settings\/US\|[^|]+\|page$/.test(id) },
  // ── TODO: the agents' named code changes land here as they report them (SCHED-A: 12-hour hour pickers and US ZIP
  //    codes; SETTINGS / SCHED-B / MENU-A / MENU-B / API: any GB code change they list). Each one PRECISE where a
  //    transform can say it, LISTED (US only) where it cannot.
]

// ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md): through Phase 2's applyNamed,
// so the structural `pending-card-layout` entry (`prove`) is understood; every other view gets what the old loop gave.
function apply(id, before) {
  return applyNamed(NAMED, countryOf(id) === 'US', id, before)
}

module.exports = { plansEntries, plansBefore, plansRefusal, plansGetCatalogue, SWITCHED_OFF_BODY, NAMED, apply, countryOf, mapStrings, mapFields, clock12, midnightEntries, mnEndOptions, uslEntries, uslPhoneTimeSelect, uslScheduleCards, uslDeadlineRow, uslTruckListCard }
