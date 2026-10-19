// scripts/_lp2-named.cjs — THE NAMED CODE CHANGES of Language Phase 2 (docs/language-phase-2-report.md). A MODULE,
// read by scripts/language-phase-2.cjs.
//
// "F" is the AFTER code rendered with the BEFORE words (HG_MESSAGES_FROZEN). Wherever F differs from BEFORE, the
// CODE changed the output — and every such view must be claimed by exactly the entries below:
//   { id, part, country: 'GB' | 'US' | 'both', what, views: (viewId) => bool, expect?: (beforeValue, viewId) => value }
// • With `expect`, the entry is PRECISE: F must equal expect(BEFORE) byte for byte — the named change is proven to be
//   the only difference in its view. A view it claims whose BEFORE the transform leaves alone must not change.
// • Without `expect` (US only, by the brief), the entry LISTS its views as changed by Part 2; the harness writes each
//   one to scripts/fixtures/language-phase-2-us-changed.txt and the US-words check still reads every one.
// An entry that claims no view that changed is reported (stale or not landed yet), and a view two entries claim
// takes the first. View ids: `1a/<section>/<key>`, `1b/<area>/<key>`, `1c/<area>/<key>`, `2/extra/<key>`.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const longDate = (y, m, d, cc) => (cc === 'US' ? `${MONTHS[m - 1]} ${d}, ${y}` : `${d} ${MONTHS[m - 1]} ${y}`)
/** The US clock after Part 2: "4:30 PM", "12:00 AM" — always minutes, a space, capitals (lib/time-utils.ts clockOf, en-US). */
const clock12 = (hh, mm) => { const h = Number(hh); const s = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 || 12; return `${h12}:${String(mm).padStart(2, '0')} ${s}` }
const isTicketView = id => /^1b\/printing\/(ticket|test|preview)\|US\|/.test(id)
const countryOf = id => (id.split('/').slice(2).join('/').split('|').includes('US') ? 'US' : 'GB')

/** Every string in a captured value through `fn` — including strings that are JSON (a response body), re-serialised
 *  exactly as JSON.stringify writes them (which is how the routes and the captures wrote them). */
function mapStrings(v, fn) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) {
      try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(mapStrings(p, fn)) } catch { /* not JSON */ }
    }
    return fn(v)
  }
  if (Array.isArray(v)) return v.map(x => mapStrings(x, fn))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, fn)]))
  return v
}
/** The same, for strings under the given object keys only (e.g. only an email's `html`). */
function mapFields(v, fields, fn) {
  if (typeof v === 'string' && (v[0] === '{' || v[0] === '[')) {
    try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(mapFields(p, fields, fn)) } catch { /* not JSON */ }
    return v
  }
  if (Array.isArray(v)) return v.map(x => mapFields(x, fields, fn))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fields.includes(k) && typeof x === 'string' ? fn(x) : mapFields(x, fields, fn)]))
  return v
}
const GB_LONG = /\b(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/g

// ══ ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md) ═══════════════════════
// THE PENDING-CARD PROOF — a STRUCTURAL named change, shared by scripts/_lp2-named.cjs, scripts/_lp1d-named.cjs and
// scripts/_lp1d2-named.cjs (entry id `pending-card-layout`, `prove: true`). The fix moved the pending-approval card's
// type chooser out of the main row, deleted the desktop-only duplicate Approve / Edit / Reject block, made the
// phone-only action row the one row at every width, added ONE sentence (manageSchedule.card.approveNeedsTimes) when
// Approve is off for lack of times, and hid the guessed / no-location boxes for a private event. The layout and DOM
// order changed ON PURPOSE (scripts/pending-card-render.cjs measures it, WebKit 320–1440px), so no byte transform can
// say it. Instead, for a view whose BEFORE contains a pending card, F must satisfy ALL of:
//   (i)   every pending card cut out of BOTH (a card = the pending wrapper `border-l-4 border-l-amber-400` element whose
//         subtree holds a pending marker: the Approve button, data-event-type-select, data-pending-type/-actions), the
//         rest of the view is BYTE-IDENTICAL; the same number of cards, each card's own opening tag byte-identical,
//         and no pending marker outside a card;
//   (ii)  each card's TEXT (tags stripped, entities decoded, whitespace collapsed) as a multiset of runs equals
//         BEFORE's, apart from: (a) the one new sentence, exactly once, only when BEFORE's Approve was disabled (no
//         times) and the private "needs times" prompt was not on the card — and then it MUST be there; (b) the words of
//         BEFORE's ONE desktop block (`hidden sm:flex` holding the buttons), each proven a duplicate of a word still on
//         the card, and no such block left in F; (c) a guessed / no-location box may vanish ONLY when the card shows
//         the private chip (🔒) — a box still shown must be byte-identical;
//   (iii) F's card has exactly one Approve button, with BEFORE's `disabled` and `title`.
const PC_VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
/** A tolerant-free HTML tree of React static markup (throws on an unbalanced tag). */
function pcParse(s) {
  const root = { tag: '#root', start: 0, end: s.length, openEnd: 0, attrs: '', children: [], parent: null }
  const all = []
  let cur = root
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s[^>]*?)?)(\/?)>/g
  let m
  while ((m = re.exec(s))) {
    if (m[0].startsWith('<!--')) continue
    if (m[1]) {
      if (cur.tag !== m[1].toLowerCase()) throw new Error(`unbalanced </${m[1]}> at ${m.index} (open: <${cur.tag}>)`)
      cur.end = m.index + m[0].length; cur = cur.parent; continue
    }
    const el = { tag: m[2].toLowerCase(), attrs: m[3] || '', start: m.index, openEnd: m.index + m[0].length, end: m.index + m[0].length, children: [], parent: cur }
    cur.children.push(el); all.push(el)
    if (!m[4] && !PC_VOID.has(el.tag)) cur = el
  }
  if (cur !== root) throw new Error(`unclosed <${cur.tag}> at ${cur.start}`)
  return all
}
const pcClass = el => ((/\bclass="([^"]*)"/.exec(el.attrs) || [])[1] || '').split(/\s+/).filter(Boolean)
const pcHas = (el, ...cs) => { const c = pcClass(el); return cs.every(x => c.includes(x)) }
const pcAttr = (el, a) => { const m = new RegExp(`\\s${a}(?:="([^"]*)")?(?=\\s|/?$)`).exec(el.attrs); return m ? (m[1] ?? '') : null }
const pcDecode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, e) => {
  const l = e.toLowerCase()
  if (l[0] === '#') return String.fromCodePoint(l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10))
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }[l]
})
/** The text runs of a piece of markup: React's `<!-- -->` separators joined, every tag a break. */
const pcRuns = html => html.replace(/<!--[\s\S]*?-->/g, '').split(/<[^>]*>/).map(x => pcDecode(x).replace(/\s+/g, ' ').trim()).filter(Boolean)
const pcIsApprove = el => el.tag === 'button' && pcHas(el, 'text-green-700', 'border', 'border-green-300')
const pcIsMarker = el => pcIsApprove(el) || pcAttr(el, 'data-event-type-select') !== null || pcAttr(el, 'data-pending-type') !== null || pcAttr(el, 'data-pending-actions') !== null
const pcWithin = (el, anc) => { for (let p = el.parent; p; p = p.parent) if (p === anc) return true; return false }
const PC_LOCATION_BOXES = ['mt-3 px-3 py-2.5 bg-orange-50 border border-orange-300 rounded-lg text-sm', 'mt-3 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm']
let PC_SENTENCE = null
/** manageSchedule.card.approveNeedsTimes as F renders it (a key new since every frozen catalogue: the frozen overlay
 *  keeps new keys at today's en-GB text, so F shows the authored words). */
const pcSentence = () => {
  if (PC_SENTENCE == null) {
    const m = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../messages/en-GB.json'), 'utf8'))
    PC_SENTENCE = m.manageSchedule.card.approveNeedsTimes
  }
  return PC_SENTENCE
}
/** { cards: [elements], all } of one view's markup. */
function pcCards(s) {
  const all = pcParse(s)
  const cards = all.filter(el => pcHas(el, 'border-l-4', 'border-l-amber-400') && all.some(x => pcIsMarker(x) && pcWithin(x, el)))
  return { all, cards }
}
/** Does this view's markup contain a pending card? (a non-string or unparsable value: no) */
function hasPendingCard(v) {
  if (typeof v === 'string') { if (!/border-l-amber-400/.test(v)) return false; try { return pcCards(v).cards.length > 0 } catch { return false } }
  if (Array.isArray(v)) return v.some(hasPendingCard)
  if (v && typeof v === 'object') return Object.values(v).some(hasPendingCard)
  return false
}
const msDiff = (a, b) => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) || 0) + 1); for (const x of b) m.set(x, (m.get(x) || 0) - 1); return [...m].filter(([, n]) => n !== 0) }
const msMinus = (a, b) => { const out = [...a]; const missing = []; for (const x of b) { const i = out.indexOf(x); if (i < 0) missing.push(x); else out.splice(i, 1) } return { out, missing } }
/** (expected = BEFORE with the view's other named transforms, f = F) → { ok, problems } — the proof described above. */
function pendingCardProof(expected, f) {
  const problems = []
  const walk = (b, a, at) => {
    if (typeof b === 'string' && typeof a === 'string') { if (b !== a) proveString(b, a, at); return }
    if (b && a && typeof b === 'object' && typeof a === 'object' && Array.isArray(b) === Array.isArray(a)) {
      const kb = Object.keys(b), ka = Object.keys(a)
      if (JSON.stringify(kb) !== JSON.stringify(ka)) { problems.push(`${at}: the fields differ (${kb.join(',')} · ${ka.join(',')})`); return }
      for (const k of kb) walk(b[k], a[k], `${at}.${k}`)
      return
    }
    if (JSON.stringify(b) !== JSON.stringify(a)) problems.push(`${at}: differs and is not markup`)
  }
  const proveString = (B, A, at) => {
    let pb, pa
    try { pb = pcCards(B); pa = pcCards(A) } catch (e) { problems.push(`${at}: not parseable markup (${e.message})`); return }
    if (!pb.cards.length) { problems.push(`${at}: differs, and BEFORE has no pending card`); return }
    if (pb.cards.length !== pa.cards.length) { problems.push(`${at}: ${pb.cards.length} pending card(s) BEFORE, ${pa.cards.length} in F`); return }
    for (const [p, nm] of [[pb, 'BEFORE'], [pa, 'F']]) {
      const stray = p.all.filter(x => ['data-event-type-select', 'data-pending-type', 'data-pending-actions'].some(a => pcAttr(x, a) !== null) && !p.cards.some(c => pcWithin(x, c)))
      if (stray.length) problems.push(`${at}: ${nm} has pending markup outside a pending card`)
    }
    // (i) the rest of the view, byte for byte
    const cut = (s, cards) => { let out = '', i = 0; cards.forEach((c, n) => { out += s.slice(i, c.start) + `\u0000PENDING-CARD-${n}\u0000`; i = c.end }); return out + s.slice(i) }
    const rb = cut(B, pb.cards), ra = cut(A, pa.cards)
    if (rb !== ra) { let i = 0; while (i < rb.length && rb[i] === ra[i]) i++; problems.push(`${at}: outside the pending card(s) the view differs @${i}: BEFORE …${JSON.stringify(rb.slice(Math.max(0, i - 80), i + 100))} · F …${JSON.stringify(ra.slice(Math.max(0, i - 80), i + 100))}`) }
    pb.cards.forEach((cb, n) => {
      const ca = pa.cards[n]
      const tag = `${at} card ${n + 1}`
      const inB = pb.all.filter(x => pcWithin(x, cb)), inA = pa.all.filter(x => pcWithin(x, ca))
      if (B.slice(cb.start, cb.openEnd) !== A.slice(ca.start, ca.openEnd)) problems.push(`${tag}: the card's own opening tag changed`)
      // (iii) the one Approve
      const apB = inB.filter(pcIsApprove), apA = inA.filter(pcIsApprove)
      if (apB.length !== 2) problems.push(`${tag}: BEFORE has ${apB.length} Approve buttons (expected 2: the phone row and the desktop duplicate)`)
      if (apA.length !== 1) problems.push(`${tag}: F has ${apA.length} Approve buttons (expected 1)`)
      const disB = apB.map(x => pcAttr(x, 'disabled') !== null), titleB = apB.map(x => pcAttr(x, 'title'))
      if (new Set(disB).size > 1 || new Set(titleB).size > 1) problems.push(`${tag}: BEFORE's two Approve buttons disagree on disabled/title`)
      if (apA[0] && ((pcAttr(apA[0], 'disabled') !== null) !== disB[0] || pcAttr(apA[0], 'title') !== titleB[0])) problems.push(`${tag}: F's Approve changed its disabled/title`)
      // (ii)(b) the desktop duplicate
      const desk = inB.filter(x => pcHas(x, 'hidden', 'sm:flex') && inB.some(y => y.tag === 'button' && pcWithin(y, x)))
      if (desk.length !== 1) problems.push(`${tag}: BEFORE has ${desk.length} desktop (hidden sm:flex) button blocks, expected 1`)
      if (inA.some(x => pcHas(x, 'hidden', 'sm:flex') && inA.some(y => y.tag === 'button' && pcWithin(y, x)))) problems.push(`${tag}: F still has a desktop-only button block`)
      const runsB = pcRuns(B.slice(cb.start, cb.end))
      const deskRuns = desk.flatMap(d => pcRuns(B.slice(d.start, d.end)))
      let { out: expect, missing } = msMinus(runsB, deskRuns)
      if (missing.length) problems.push(`${tag}: internal — desktop words not found on the card: ${missing.join(' | ')}`)
      const notDup = msMinus(expect, deskRuns).missing
      if (notDup.length) problems.push(`${tag}: desktop words that were NOT duplicates (would be lost): ${notDup.join(' | ')}`)
      // (ii)(c) the location boxes
      const priv = inB.some(x => x.tag === 'span' && pcHas(x, 'border-purple-300', 'bg-purple-50') && B.slice(x.start, x.end).includes('🔒'))
      for (const cls of PC_LOCATION_BOXES) {
        const boxB = inB.filter(x => pcClass(x).join(' ') === cls), boxA = inA.filter(x => pcClass(x).join(' ') === cls)
        if (boxA.length > boxB.length) problems.push(`${tag}: F has a location box BEFORE did not (${cls.split(' ')[3]})`)
        else if (boxA.length === boxB.length) boxB.forEach((x, i) => { if (B.slice(x.start, x.end) !== A.slice(boxA[i].start, boxA[i].end)) problems.push(`${tag}: a location box changed (${cls.split(' ')[3]})`) })
        else if (boxA.length === 0 && priv) for (const x of boxB) expect = msMinus(expect, pcRuns(B.slice(x.start, x.end))).out
        else problems.push(`${tag}: a location box (${cls.split(' ')[3]}) vanished on a card that is NOT private`)
      }
      // (ii)(a) the one new sentence
      const promptB = inB.some(x => pcHas(x, 'mt-1.5', 'rounded-lg', 'border-amber-300', 'bg-amber-50'))
      const want = disB[0] && !promptB ? 1 : 0
      const reason = inA.filter(x => pcAttr(x, 'data-approve-reason') !== null)
      if (reason.length !== want) problems.push(`${tag}: ${reason.length} approveNeedsTimes sentence(s) in F, expected ${want} (Approve ${disB[0] ? 'disabled' : 'enabled'} BEFORE${promptB ? ', private times prompt shown' : ''})`)
      for (const x of reason) {
        const r = pcRuns(A.slice(x.start, x.end))
        if (r.length !== 1 || r[0] !== pcSentence()) problems.push(`${tag}: the new sentence reads ${JSON.stringify(r)}, not ${JSON.stringify(pcSentence())}`)
        expect.push(pcSentence())
      }
      const d = msDiff(pcRuns(A.slice(ca.start, ca.end)), expect)
      if (d.length) problems.push(`${tag}: the card's words differ from BEFORE's beyond the named changes: ${d.map(([w, k]) => `${k > 0 ? '+' : ''}${k}× ${JSON.stringify(w)}`).join(' · ')}`)
    })
  }
  walk(expected, f, 'view')
  return { ok: problems.length === 0, problems }
}
/** The `pending-card-layout` entry for a harness's NAMED table: { …, prove: true, views }. */
const pendingCardEntry = views => ({ id: 'pending-card-layout', country: 'both', prove: true, part: 'pending-card fix (16 Oct 2026)',
  what: '⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md): Manage › Schedule’s pending-approval card — the type chooser moved below the main row, the desktop-only duplicate Approve/Edit/Reject block removed, one action row at every width, the new approveNeedsTimes sentence when Approve is off for lack of times, the location boxes hidden on a private event. STRUCTURAL: rest of the view byte-identical with every pending card cut out of both, each card’s words a multiset-equal of BEFORE’s apart from those named words (scripts/_lp2-named.cjs pendingCardProof).',
  views })
/** A named table's `apply`, with the structural entries (`prove`) understood: they never make a view LISTED, they claim
 *  a view only when its BEFORE has a pending card, and they add `matches(f)` — the proof run instead of byte equality
 *  against the transformed BEFORE. Views without a pending card: exactly the old apply. */
function applyNamed(NAMED, us, id, before) {
  const entries = NAMED.filter(e => (e.country === 'both' || (e.country === 'US') === us) && e.views(id))
  if (entries.some(e => !e.expect && !e.prove)) return { entries, listed: true, touched: entries.filter(e => !e.expect && !e.prove).map(e => e.id) }
  let v = before; const touched = []
  for (const e of entries.filter(e => e.expect)) { const w = e.expect(v, id); if (JSON.stringify(w) !== JSON.stringify(v)) touched.push(e.id); v = w }
  const provers = entries.filter(e => e.prove && hasPendingCard(before))
  const out = { entries, listed: false, expected: v, touched }
  if (provers.length) { for (const e of provers) touched.push(e.id); const exp = v; out.matches = f => pendingCardProof(exp, f) }
  return out
}

// ══ ⚠️ RE-PINNED (events that run past midnight + US formats, 17 October 2026, docs/midnight-and-format-fixes-report.md) ══
// Helpers for the `midnight-*` entries that reach the 1b dashboard / KDS views. scripts/_lp1b-dashboard.cjs renders
// every components/** import as <x-stub data-c="Name" data-p="{every prop, JSON, HTML-escaped}">, so a NEW PROP the page
// passes changes the stub's JSON even where nothing rendered changes. These transforms add exactly that prop, with the
// value it must hold, and refuse (leave BEFORE alone, so the view fails) whenever that value cannot be read exactly.
/** React's attribute escaping (escapeTextForBrowser) and its inverse, for a stub's data-p. */
const mnEsc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const mnDec = s => s.replace(/&(quot|#x27|lt|gt|amp);/g, (_, e) => ({ quot: '"', '#x27': "'", lt: '<', gt: '>', amp: '&' })[e])
const mnStubRe = name => new RegExp(`<x-stub data-c="${name}" data-p="([^"]*)"`, 'g')
/** Every `name` stub's props in markup `s` (parsed), or null if any does not round-trip byte for byte. */
const mnStubProps = (s, name) => {
  const out = []
  for (const m of s.matchAll(mnStubRe(name))) { const p = JSON.parse(mnDec(m[1])); if (mnEsc(JSON.stringify(p)) !== m[1]) return null; out.push(p) }
  return out
}
/** Insert prop `key` = `value` right AFTER prop `after` (JSX order) in every `name` stub of `s`. A stub that already has
 *  `key`, lacks `after`, or does not round-trip is left as it is (so the comparison fails rather than guesses). */
const mnAddStubProp = (s, name, after, key, value) => s.replace(mnStubRe(name), (whole, raw) => {
  const props = JSON.parse(mnDec(raw))
  if (mnEsc(JSON.stringify(props)) !== raw || key in props || !(after in props)) return whole
  const out = {}
  for (const [k, v] of Object.entries(props)) { out[k] = v; if (k === after) out[key] = value }
  return `<x-stub data-c="${name}" data-p="${mnEsc(JSON.stringify(out))}"`
})
/** The dashboard's `activeEvent` as BEFORE's own markup serialised it: the page passes activeEvent to AddOrderPanel twice
 *  (todayEvent={activeEvent}, controlledEvent={activeEvent}). Exactly one AddOrderPanel stub, both props present and
 *  identical — else undefined (no guess). */
const mnActiveEvent = s => {
  const panels = mnStubProps(s, 'AddOrderPanel')
  if (!panels || panels.length !== 1) return undefined
  const p = panels[0]
  if (!('todayEvent' in p) || !('controlledEvent' in p) || JSON.stringify(p.todayEvent) !== JSON.stringify(p.controlledEvent)) return undefined
  return { value: p.todayEvent }
}
/** The truck's time settings as BEFORE's own markup serialised them (DayLoadStrip time={truck?.time}; every DayLoadStrip
 *  stub in the view must agree) — else undefined. */
const mnTruckTime = s => {
  const strips = mnStubProps(s, 'DayLoadStrip')
  if (!strips || !strips.length || !strips.every(p => 'time' in p && JSON.stringify(p.time) === JSON.stringify(strips[0].time))) return undefined
  return { value: strips[0].time }
}
/** The UTC instant of wall-clock `date` `hh:mm` in zone `tz` (what lib/time-utils.ts instantOfLocal returns): the
 *  zone's offset read with Intl at a first guess, then corrected once (exact away from a DST jump; none on the fixture date). */
const mnInstantOfLocal = (date, hhmm, tz) => {
  const [y, mo, d] = date.split('-').map(Number), [hh, mm] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y, mo - 1, d, hh, mm)
  const offsetAt = t => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(t)).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]))
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t
  }
  let t = wall - offsetAt(wall)
  t = wall - offsetAt(t)
  return t
}
/** finishTimeOptions' RULE for a normal (not overnight) event: every 15-minute boundary "HH:MM" of `date`, read in
 *  `tz`, that is still ahead of `nowMs`. */
const mnFinishOptions = (date, tz, nowMs) => {
  const out = []
  for (let m = 0; m < 24 * 60; m += 15) {
    const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    if (mnInstantOfLocal(date, t, tz) > nowMs) out.push(t)
  }
  return out
}
/** The modal's <select> body as BEFORE's code rendered it with 24-hour labels, for option list `list` and current finish
 *  `current` ('' = none): the non-submittable "current" option first when current is not in the list, then each option,
 *  the current one selected and labelled "… (current)". (The frozen words: finish.optionCurrent = "{time} (current)".) */
const mnFinishSelectBody = (list, current) =>
  (list.includes(current) ? '' : `<option value="${current}" selected="">${current || '--:--'} (current)</option>`) +
  list.map(o => (o === current ? `<option value="${o}" selected="">${o} (current)</option>` : `<option value="${o}">${o}</option>`)).join('')

const NAMED = [
  // ── PART 2 · DATES ──────────────────────────────────────────────────────────────────────────────────────
  { id: 'P2-deletion-email-date', part: 'Part 2 (dates)', country: 'both',
    what: 'The account-deletion OWNERS’ email writes its date as a long date in the owner’s truck’s style ("2026-11-08" → GB "8 November 2026", US "November 8, 2026"); an owner with NO truck gets the default locale (GB).',
    views: id => /^1c\/api\/(GB|US)\|deletion\|post\|ok(NoTrucks)?$/.test(id),
    // Only the OWNERS' email ("…scheduled for deletion on <strong>…"); the [ACTION] admin email keeps ISO ("Due: <strong>…").
    expect: (b, id) => mapFields(b, ['html'], s => s.replace(/scheduled for deletion on <strong>(\d{4})-(\d{2})-(\d{2})<\/strong>/g, (_, y, m, d) =>
      `scheduled for deletion on <strong>${longDate(+y, +m, +d, /NoTrucks$/.test(id) ? 'GB' : countryOf(id))}</strong>`)) },
  { id: 'P2-save-email-date-US', part: 'Part 2 (dates)', country: 'US',
    what: 'The demo save-email email and its response write the deletion date in the US order ("23 October 2026" → "October 23, 2026"). GB unchanged.',
    views: id => /^1c\/api\/US\|save-email\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(GB_LONG, (_, d, mon, y) => `${mon} ${d}, ${y}`)) },
  { id: 'P2-dashboard-off-since', part: 'Part 2 (dates)', country: 'both',
    what: 'The dashboard’s "Off since …" line shows a long date in the truck’s style, not the raw ISO date ("2026-10-08" → GB "8 October 2026", US "October 8, 2026").',
    views: id => /^1b\/dashboard\/(GB|US)\|/.test(id),
    expect: (b, id) => mapStrings(b, s => s.replace(/Off since (\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) => `Off since ${longDate(+y, +m, +d, countryOf(id))}`)) },
  { id: 'P2-sept-sep', part: 'Part 2 (dates)', country: 'GB',
    what: 'A short month is "Sep", never Intl’s en-GB "Sept" (TruckListCard, the inbound-schedule email, Manage’s schedule cards and Reports picker) — formatYmdShortMonth. Upper-cased on the schedule card: "SEPT" → "SEP".',
    views: id => /^(1a|1b|1c|2)\/[^/]+\/(GB\|)?/.test(id) && countryOf(id) === 'GB',
    expect: b => mapStrings(b, s => s.replace(/\bSept\b/g, 'Sep').replace(/\bSEPT\b/g, 'SEP')) },

  // ── PART 2 · US BEHAVIOUR ─────────────────────────────────────────────────────────────────────────────────
  { id: 'P2-preorder-US', part: 'Part 2 (pre-order labels)', country: 'US',
    what: 'US pre-order labels use the truck’s clock and date order: "Pre-order by 16:30, Sat 10 Oct" → "Pre-order by 4:30 PM, Sat, Oct 10"; "Pre-orders open Sat 10 Oct" → "Pre-orders open Sat, Oct 10".',
    views: id => /^2\/extra\/US\|preorder/.test(id),
    expect: b => mapStrings(b, s => s
      .replace(/^Pre-order by (\d{2}):(\d{2})/, (_, h, m) => `Pre-order by ${clock12(h, m)}`)
      .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (_, wd, d, mo) => `${wd}, ${mo} ${d}`)) },
  { id: 'P2-us-clock', part: 'Part 2 (dates)', country: 'US',
    what: 'The US 12-hour clock is "6:30 PM" / "6:00 PM" / "12:00 AM" — always minutes, a space, capitals (en-US) — where it was "6:30pm" / "6pm". GB untouched.',
    views: id => !isTicketView(id),
    expect: b => mapStrings(b, s => s.replace(/\b(\d{1,2})(?::(\d{2}))?(am|pm)\b/g, (_, h, m, ap) => `${h}:${m || '00'} ${ap.toUpperCase()}`)) },
  { id: 'P2-us-clock-tickets', part: 'Part 2 (dates)', country: 'US',
    what: 'The same US clock on the printed ticket, its test ticket and its on-screen preview. LISTED: a longer time changes the header row\'s padding and wrapping, so the bytes are proven by the ticket-fit check instead of a transform.',
    views: id => isTicketView(id) },
  // ⚠️ NOT A CODE CHANGE IN F: "Truck 1" for a new US truck's first van is a WORD (provisionContent.firstVanName in
  // en-US); with the frozen words F stores "Van 1" exactly as BEFORE. It is in A, listed in the US changes.
  { id: 'P2-demo-US', part: 'Part 2 (provisioning)', country: 'US',
    what: 'A demo asked for in the US is built in the US (provisionDemo `country`): its currency, zone and allergens, its sample menu and its first van in US words. 460ba55 ignored the country and built the GB demo. LISTED — the whole set of rows changes.',
    views: id => /^2\/extra\/US\|rows\|demo\|/.test(id) },

  // ── PART 3 · WRONG-ENGLISH FIXES THAT NEEDED A CODE CHANGE ────────────────────────────────────────────────
  { id: 'P3-buzzer-removed', part: 'Part 3 (buzzer null)', country: 'both',
    what: 'A queued buzzer removal with no number shows `buzzer.removed` ("Buzzer removed") instead of `removedNumber` with an empty number ("Buzzer  removed", two spaces). The other buzzer messages take a has/had flag instead of printing "null" — with the frozen words that is invisible.',
    views: id => /^1b\/(dashboard|kds)\//.test(id),
    expect: b => mapStrings(b, s => s.replace(/Buzzer {2}removed/g, 'Buzzer removed')) },
  // ── LANGUAGE PHASE 1d PART 1 (Manage: Menu, Schedule, Settings — scripts/language-phase-1d.cjs) ─────────────────
  // Re-pins: the 1d code changes that reach a Phase 1a/1b/1c/2 view. The words are frozen (scripts/_lp2-frozen.cjs
  // applies 1d's as-moved overlay too), so only CODE changes show here, each precise.
  { id: '1d-setup-trade-area-codes', part: 'Language Phase 1d (API agent: lib/trade-area.ts codes)', country: 'both',
    what: 'Signup’s trade-area refusals (/api/setup create_truck: country missing / unknown / off, zone, town missing / too long) gain "code" and "params", LAST — named difference 1, with the `tradeArea` codes; `error` and every other field unchanged. (language-phase-1d proves each code’s words are the error, in its copy area.)',
    views: id => /^1c\/api\/(GB|US)\|setup\|(countryMissing|countryUnknown|countryOff|zoneBad|townMissing|townLong)$/.test(id),
    expect: (b, id) => {
      const country = /\/GB\|/.test(id) ? 'United Kingdom' : 'United States'
      const [code, params] = { countryMissing: ['country_missing', {}], countryUnknown: ['country_missing', {}], countryOff: ['country_off', { country }], zoneBad: ['zone_unknown', { country }], townMissing: ['town_missing', {}], townLong: ['town_too_long', {}] }[id.split('|').pop()]
      if (!b || typeof b !== 'object' || typeof b.body !== 'string') return b
      return { ...b, body: b.body.replace(/\}$/, `,"code":${JSON.stringify(code)},"params":${JSON.stringify(params)}}`) }
    } },
  { id: '1d-setup-step-fixture', part: 'Language Phase 1d (fixture re-pin)', country: 'both',
    what: 'FIXTURE, not product: the setup step’s "every error" view handed the step three invented sentences; the step takes trade-area REFUSALS now, so the fixture passes three real ones and the step shows their words ("Choose a country." → "Choose the country your truck is based in.", "Bad zone." → the zone sentence, "Add your town." → "Tell us the town or city you’re based in.").',
    views: id => /^1c\/setup\/(GB|US)\|step\|allErrors$/.test(id),
    expect: b => mapStrings(b, s => s.replace('>Choose a country.<', '>Choose the country your truck is based in.<')
      .replace('>Bad zone.<', '>That time zone isn&#x27;t one we offer in United States. Choose one from the list.<')
      .replace('>Add your town.<', '>Tell us the town or city you’re based in.<')) },
  { id: '1d-us-address-style', part: 'Language Phase 1d (SCHED-A: US address style)', country: 'US',
    what: 'Manage › Schedule’s event card for a US truck (address_format zip_state) says "ZIP code" where it said "postcode" ("Add a postcode with Edit to put it on the map." → "Add a ZIP code with …").',
    views: id => /^2\/extra\/US\|manage\|schedule\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(/Add a postcode with/g, 'Add a ZIP code with')) },
  // ⚠️ NOT AN ENTRY, BECAUSE NO VIEW CHANGES: lib/printing/ticket.ts `padBetween` no longer adds a separating space
  // when there is no left label (Part 2, dates agent). It differs only for a right-aligned value at least as long as
  // the whole line (an absurd 43-character phone at 58 mm); every GB ticket this harness prints (1b printing, ~250 at
  // 58 and 80 mm, including the long-name and long-id hand cases) is byte-identical in F, which is the proof.
  // ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md): the Schedule cards view
  // holds a pending card (e-oct, an unconfirmed scraper event); its layout changed on purpose — proven structurally.
  pendingCardEntry(id => /^2\/extra\/(GB|US)\|manage\|schedule\|/.test(id)),
  // ⚠️ NOT AN ENTRY EITHER: P3-buzzer-removed claims no view today — no 1b fixture reaches the queued no-number
  // removal path. Its transform stays so a fixture that reaches it is proven, not merely allowed.

  // ── ⚠️ RE-PINNED (events that run past midnight + US formats, 17 October 2026, docs/midnight-and-format-fixes-report.md) ──
  // Both AFTER P2-us-clock (entries apply in table order): BEFORE's "5pm" is "5:00 PM" by the time these run.
  { id: 'midnight-card-time-nbsp-US', part: 'Midnight + US formats (17 Oct 2026)', country: 'US',
    what: 'TruckListCard’s time range (cardTimeRange): in a 12-hour range the space between the time and AM/PM is a no-break space (U+00A0), so a narrow card never wraps "11:30 AM – 10:45 PM" inside a time. Only the card’s time span; the en dash and its spaces, and GB’s 24-hour range, unchanged.',
    // The views that render a TruckListCard: the US order page (its event list) and Phase 2's own US card views.
    views: id => /^1a\/orderPage\/US\|/.test(id) || /^2\/extra\/US\|card\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(/(<span class="flex items-center gap-2 text-\[12px\] font-bold text-slate-500 leading-none mt-0\.5"><span>)([^<]*)(<\/span>)/g,
      (_, open, range, close) => open + range.replace(/(\d{1,2}:\d{2}) (AM|PM)\b/g, '$1 $2') + close)) },
  { id: 'midnight-closedAtTime-fixture-GB', part: 'Midnight (fixture re-pin, 17 Oct 2026)', country: 'GB',
    what: 'FIXTURE, not product: the GB order page’s "closed at time" view modelled a closed event as 17:00–15:00 at 16:00. Under lib/event-window.ts an end earlier than the start runs PAST MIDNIGHT (hasValidEventTimes allows it), so that event is OPEN at 16:00. The fixture (scripts/language-phase-1a.cjs opFixtures) is now a normal 12:00–15:00 event whose end has passed: the closed banner ("ended at 15:00") and every other byte are as BEFORE; only the card’s range reads "12:00 – 15:00" where it read "17:00 – 15:00".',
    views: id => id === '1a/orderPage/GB|closedAtTime',
    expect: b => mapStrings(b, s => s.replace('<span class="flex items-center gap-2 text-[12px] font-bold text-slate-500 leading-none mt-0.5"><span>17:00 – 15:00</span>',
      '<span class="flex items-center gap-2 text-[12px] font-bold text-slate-500 leading-none mt-0.5"><span>12:00 – 15:00</span>')) },

  // ── ⚠️ RE-PINNED (events that run past midnight + US formats, 17 October 2026, docs/midnight-and-format-fixes-report.md) ──
  // The 1b dashboard / KDS views (scripts/language-phase-1b.cjs, and the same 1b views in language-phase-2). Helpers:
  // mnAddStubProp / mnActiveEvent / mnTruckTime above. Each entry adds exactly its change and nothing else.
  { id: 'midnight-dayloadstrip-event-prop', part: 'Midnight (17 Oct 2026) — stub props only', country: 'both',
    what: 'app/dashboard/[token]/page.tsx passes event={activeEvent} to BOTH DayLoadStrips (strip + sidebar), so an event that runs past midnight orders its slots on the event’s timeline (components/dashboard/DayLoadStrip.tsx; any other event renders exactly as before — the strip is proven in its own area). In this area DayLoadStrip is a STUB that serialises its props, so the only difference is the stub’s JSON gaining "event" right after "eventDate", holding the active event — read from BEFORE’s own markup, where the page passes the same activeEvent to AddOrderPanel (todayEvent / controlledEvent, which must agree). No rendered byte changes.',
    views: id => /^1b\/dashboard\/(GB|US)\|/.test(id),
    expect: b => mapStrings(b, s => {
      if (!s.includes('<x-stub data-c="DayLoadStrip"')) return s
      const ev = mnActiveEvent(s)
      return ev && ev.value !== undefined ? mnAddStubProp(s, 'DayLoadStrip', 'eventDate', 'event', ev.value) : s
    }) },
  { id: 'midnight-finish-modal-time-prop', part: 'US formats (17 Oct 2026) — stub props only', country: 'both',
    what: 'app/dashboard/[token]/page.tsx passes time={dashTime} to EventFinishTimeModal, so the modal writes times in the truck’s style (US "9:00 PM"; GB "21:00" exactly as before). In this area the modal is a STUB that serialises its props: its JSON gains "time" right after "busy", holding the truck’s time settings — read from BEFORE’s own markup (DayLoadStrip time={truck?.time}; dashTime = timeSettingsOr(truck.time), the same object for the fixture’s complete settings). No rendered byte changes; the modal’s own US output is the KDS entry below.',
    views: id => /^1b\/dashboard\/(GB|US)\|/.test(id),
    expect: b => mapStrings(b, s => {
      if (!s.includes('<x-stub data-c="EventFinishTimeModal"')) return s
      const tm = mnTruckTime(s)
      return tm ? mnAddStubProp(s, 'EventFinishTimeModal', 'busy', 'time', tm.value) : s
    }) },
  { id: 'midnight-completed-slot-US', part: 'US formats (17 Oct 2026)', country: 'US',
    what: 'The dashboard’s Completed list row writes the slot with the truck’s clock (formatSlot(o.slot, dashTime)) where it printed the raw "HH:MM": US "🕐 18:30" → "🕐 6:30 PM". GB’s formatSlot is the "HH:MM" itself — byte-identical (proven: the GB views are not claimed and do not change).',
    views: id => /^1b\/dashboard\/US\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(/(<span class="text-xs text-slate-700">🕐 )(\d{2}):(\d{2})(<\/span>)/g, (_, o, hh, mm, c) => o + clock12(hh, mm) + c)) },
  // ⚠️ BEFORE midnight-finish-modal-format-US in this table on purpose: it rebuilds the option list in BEFORE's 24-hour
  // labels, and the format entry then writes every label in the truck's style — each entry says one change.
  { id: 'midnight-finish-options-truck-zone', part: 'Finish time in the truck’s zone (17 Oct 2026)', country: 'both',
    what: 'The Change finish time modal’s option list (finishTimeOptions) is every 15-minute boundary on the event’s date still ahead of now read in the TRUCK’s zone (instantOfLocal(date, t, truck tz)), where it was read in the DEVICE’s zone (new Date("YYYY-MM-DDTHH:MM")) — the inventory’s device-zone bug; every other "now" has been the truck’s clock since Phase 2B. Differs only where the truck zone ≠ the device zone: in the fixtures the US truck (America/Chicago) on the harness device (Europe/London), so kds · US|finishTime offers 12:30 onwards, not 18:30. GB (truck zone = device zone): byte-identical. COMPUTED FROM THE RULE: BEFORE’s list must be exactly the rule in the device zone (else BEFORE is left alone and the view fails), and is replaced by the rule in the truck’s zone; the current option, the selection and every other byte unchanged. Normal events only — an overnight event’s list is the midnight harness’s.',
    views: id => /^1b\/kds\/(GB|US)\|/.test(id),
    expect: (b, id) => {
      const FIX = require('./_lp1b-fixtures.cjs')
      const C = FIX.country(countryOf(id))
      const DEVICE_TZ = 'Europe/London'   // the harness device (scripts/language-phase-1b.cjs kit.setDeviceTz)
      const now = Date.parse(FIX.NOW), date = C.EVENT.event_date, truckTz = C.TRUCK.time && C.TRUCK.time.timeZone
      if (!truckTz || !date || Number.isNaN(now)) return b
      const devList = mnFinishOptions(date, DEVICE_TZ, now), truckList = mnFinishOptions(date, truckTz, now)
      return mapStrings(b, s => s.replace(/(<h3 class="font-black text-slate-900 text-base mb-1">Change finish time<\/h3>[\s\S]*?<select [^>]*>)([\s\S]*?)(<\/select>)/g, (whole, open, body, close) => {
        const cur = [...body.matchAll(/<option value="([^"]*)" selected="">(?:[^<]*) \(current\)<\/option>/g)]
        if (cur.length !== 1) return whole
        const current = cur[0][1]
        if (body !== mnFinishSelectBody(devList, current)) return whole   // not exactly the device-zone rule: no guess
        return open + mnFinishSelectBody(truckList, current) + close
      }))
    } },
  { id: 'midnight-finish-modal-format-US', part: 'US formats (17 Oct 2026)', country: 'US',
    what: 'The Change finish time modal (components/shared/EventFinishTimeModal.tsx, rendered for real on the KDS) writes every time in the truck’s style: "currently set to finish at 21:00" → "9:00 PM", each option’s TEXT "18:30" → "6:30 PM" and "21:00 (current)" → "9:00 PM (current)". Option VALUES stay "HH:MM". Scoped to the modal (its heading through its </select>). GB unchanged.',
    views: id => /^1b\/kds\/US\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(/(<h3 class="font-black text-slate-900 text-base mb-1">Change finish time<\/h3>)([\s\S]*?<\/select>)/g, (_, h3, body) => h3 + body
      .replace(/(currently set to finish at <span class="font-bold text-slate-900">)(\d{2}):(\d{2})(<\/span>)/, (_, o, hh, mm, c) => o + clock12(hh, mm) + c)
      .replace(/(<option value="(\d{2}):(\d{2})"(?: selected="")?>)\2:\3( \(current\))?<\/option>/g, (_, open, hh, mm, cur) => `${open}${clock12(hh, mm)}${cur || ''}</option>`))) },

  // ── ⚠️ RE-PINNED (US layout fixes, 18 October 2026, docs/us-layout-proposal-report.md; BEFORE 4d72838) ──────────────
  // Each entry is one change of the brief (usl-out/REPIN-BRIEF.md), named by its id, precise (a transform of BEFORE,
  // never a recapture). Helpers: USL below. Table order matters: these run AFTER every entry above, so a US "5pm" is
  // already "5:00 PM" (P2-us-clock) and TruckListCard's range already has its AM/PM no-break spaces
  // (midnight-card-time-nbsp-US) when they run.
  ...require('./_lp2-named-usl.cjs').entries({ mapStrings, mapFields, clock12, isTicketView, countryOf }),

  // ── ⚠️ RE-PINNED (US dress rehearsal fixes, 19 October 2026, docs/us-dress-rehearsal-fixes-report.md) ─────────────────
  { id: 'us-rehearsal-fix-cancel-payment-state', part: 'US dress rehearsal fixes (19 Oct 2026)', country: 'both',
    what: 'POST /api/orders/cancel answers {"ok":true,"paymentState":…} (an ADDED field, last): the cancel page shows "If you paid by card, any refund…" only when a card paid or is held. The fixture order is pay-at-the-truck, so the field reads "hatch". Status, redirect and every email it sends are unchanged. PRECISE.',
    views: id => /^1a\/api\/(GB|US)\|cancel\|ok$/.test(id),
    expect: b => mapFields(b, ['body'], x => (x === '{"ok":true}' ? '{"ok":true,"paymentState":"hatch"}' : x)) },
]

/** The named entries that apply to a view, and what they make of its BEFORE value: { listed: true, entries } when an
 *  entry only LISTS the view; else { expected, touched: [ids of entries whose transform changed something] }. Used by
 *  language-phase-2 and by the 1a / 1b / 1c harnesses (which compare BEFORE + the named changes with their AFTER). */
// ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md): through applyNamed, so a
// `prove` entry (pending-card-layout) is understood; every other view gets exactly what the old loop gave it.
function apply(id, before) {
  return applyNamed(NAMED, countryOf(id) === 'US', id, before)
}

module.exports = { NAMED, apply, applyNamed, pendingCardEntry, pendingCardProof, hasPendingCard, mapStrings, mapFields, longDate, clock12, countryOf }
