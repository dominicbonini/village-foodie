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

const STAGE_B = require('./_lp-stage-b.cjs')   // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026)
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
// ⚠️ RE-PINNED (pending-card buttons, 19 October 2026, docs/pending-card-buttons-report.md): from 640px up the card's
// Approve / Edit / Reject sit on the Event type chips' row — the SAME element placed a second time, inside
// `data-pending-actions-row` (`max-sm:hidden`), with the bottom row `sm:hidden`. Where F's card has that row: (iii) it
// has exactly TWO Approve buttons, one in each place, both with BEFORE's `disabled` and `title`; the row's words are
// exactly the bottom row's buttons' words (proven, then expected once more); and the new sentence, when due, is there
// once in each place.
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
      const rowA = inA.filter(x => pcAttr(x, 'data-pending-actions-row') !== null)
      if (rowA.length > 1) problems.push(`${tag}: F has ${rowA.length} chips-row button groups (expected at most 1)`)
      const places = rowA.length ? 2 : 1
      if (apA.length !== places) problems.push(`${tag}: F has ${apA.length} Approve buttons (expected ${places}${places === 2 ? ': the bottom row and the chips row' : ''})`)
      if (rowA.length === 1 && apA.filter(x => pcWithin(x, rowA[0])).length !== 1) problems.push(`${tag}: F's chips row does not hold exactly one Approve`)
      const disB = apB.map(x => pcAttr(x, 'disabled') !== null), titleB = apB.map(x => pcAttr(x, 'title'))
      if (new Set(disB).size > 1 || new Set(titleB).size > 1) problems.push(`${tag}: BEFORE's two Approve buttons disagree on disabled/title`)
      for (const a of apA) if ((pcAttr(a, 'disabled') !== null) !== disB[0] || pcAttr(a, 'title') !== titleB[0]) problems.push(`${tag}: F's Approve changed its disabled/title`)
      // (ii)(b) the desktop duplicate
      const desk = inB.filter(x => pcHas(x, 'hidden', 'sm:flex') && inB.some(y => y.tag === 'button' && pcWithin(y, x)))
      if (desk.length !== 1) problems.push(`${tag}: BEFORE has ${desk.length} desktop (hidden sm:flex) button blocks, expected 1`)
      if (inA.some(x => pcHas(x, 'hidden', 'sm:flex') && inA.some(y => y.tag === 'button' && pcWithin(y, x)))) problems.push(`${tag}: F still has a desktop-only button block`)
      // the chips-row copy: the bottom row's buttons, word for word — and so expected once more
      const rowRuns = rowA.length === 1 ? pcRuns(A.slice(rowA[0].start, rowA[0].end)) : []
      if (rowA.length === 1) {
        const bottom = inA.filter(x => pcAttr(x, 'data-pending-actions') !== null)
        const bottomBtns = bottom.length === 1 ? inA.filter(x => x.tag === 'button' && pcWithin(x, bottom[0])).flatMap(x => pcRuns(A.slice(x.start, x.end))) : null
        if (!bottomBtns || JSON.stringify(bottomBtns) !== JSON.stringify(rowRuns)) problems.push(`${tag}: F's chips-row buttons ${JSON.stringify(rowRuns)} are not the bottom row's ${JSON.stringify(bottomBtns)}`)
      }
      const runsB = pcRuns(B.slice(cb.start, cb.end))
      const deskRuns = desk.flatMap(d => pcRuns(B.slice(d.start, d.end)))
      let { out: expect, missing } = msMinus(runsB, deskRuns)
      expect.push(...rowRuns)
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
      const want = disB[0] && !promptB ? places : 0
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
// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): an entry may carry `proveWith(expected, f, id)` →
// { ok, problems[] } — a STRUCTURAL proof of its own (Billing's data-driven plan card: the comparison table below it
// proven byte for byte, the card proven by what it must say). It runs after every `expect`, like the pending-card proof,
// and both must pass when a view has both. An entry with `proveWith` is never a LISTED one.
function applyNamed(NAMED, us, id, before) {
  const entries = NAMED.filter(e => (e.country === 'both' || (e.country === 'US') === us) && e.views(id))
  const isListed = e => !e.expect && !e.prove && !e.proveWith
  if (entries.some(isListed)) return { entries, listed: true, touched: entries.filter(isListed).map(e => e.id) }
  let v = before; const touched = []
  for (const e of entries.filter(e => e.expect)) { const w = e.expect(v, id); if (JSON.stringify(w) !== JSON.stringify(v)) touched.push(e.id); v = w }
  const provers = entries.filter(e => e.prove && hasPendingCard(before))
  const custom = entries.filter(e => e.proveWith)
  const out = { entries, listed: false, expected: v, touched }
  if (provers.length || custom.length) {
    for (const e of [...provers, ...custom]) touched.push(e.id)
    const exp = v
    // `all` — the whole capture f belongs to ({ id: value }), for a proof that compares with another view of it.
    out.matches = (f, all) => {
      const rs = [...(provers.length ? [pendingCardProof(exp, f)] : []), ...custom.map(e => e.proveWith(exp, f, id, all))]
      return { ok: rs.every(r => r.ok), problems: rs.flatMap(r => r.problems || []) }
    }
  }
  return out
}

// ══ ⚠️ RE-PINNED (events that run past midnight + US formats, 17 October 2026, docs/midnight-and-format-fixes-report.md) ══
// Helpers for the `midnight-*` entries that reach the 1b dashboard / KDS views. scripts/_lp1b-dashboard.cjs renders
// every components/** import as <x-stub data-c="Name" data-p="{every prop, JSON, HTML-escaped}">, so a NEW PROP the page
// passes changes the stub's JSON even where nothing rendered changes. These transforms add exactly that prop, with the
// value it must hold, and refuse (leave BEFORE alone, so the view fails) whenever that value cannot be read exactly.
/** React's attribute escaping (escapeTextForBrowser) and its inverse, for a stub's data-p. */
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the trial end a provisioned trial truck now carries.
const A2_TRIAL_MONTHS = () => { const c = require('./_plans-catalog-fixture.cjs').seedCatalog(require('path').resolve(__dirname, '..')); return c && c.plans.some(p => p.trialMonths) ? Object.fromEntries(c.plans.filter(p => p.isTrial && p.trialMonths).map(p => [p.key, p.trialMonths])) : null }
function a2LocalYmd(instant, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
function a2EndOfLocalDay(ymd, tz) {   // the UTC instant whose wall clock in tz reads `ymd 23:59:59` (two passes settle a DST offset)
  const [y, m, d] = ymd.split('-').map(Number), wall = Date.UTC(y, m - 1, d, 23, 59, 59)
  let t = wall
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]))
    t += wall - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  }
  return new Date(t).toISOString()
}
function a2PlusMonths(ymd, n) {   // the same day n months on, clamped to the month's last day
  const [y, m, d] = ymd.split('-').map(Number), mm = m - 1 + n, yy = y + Math.floor(mm / 12), mo = ((mm % 12) + 12) % 12
  return `${yy}-${String(mo + 1).padStart(2, '0')}-${String(Math.min(d, new Date(Date.UTC(yy, mo + 1, 0)).getUTCDate())).padStart(2, '0')}`
}
/** Every truck-shaped object { plan: <a trial key>, timezone, trial_expires_at: null }, at any depth (inside JSON strings too). */
function a2TrialRows(v, months = A2_TRIAL_MONTHS()) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(a2TrialRows(p, months)) } catch { /* not JSON */ } }
    return v
  }
  if (Array.isArray(v)) return v.map(x => a2TrialRows(x, months))
  if (!v || typeof v !== 'object') return v
  const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, a2TrialRows(x, months)]))
  if (months && typeof o.plan === 'string' && months[o.plan] && 'trial_expires_at' in o && o.trial_expires_at === null && typeof o.timezone === 'string') {
    o.trial_expires_at = a2EndOfLocalDay(a2PlusMonths(a2LocalYmd(new Date(require('./_lp1b-fixtures.cjs').NOW), o.timezone), months[o.plan]), o.timezone)
  }
  return o
}
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the tree has the A2 feature resolver (PrintingSettings `features`).
const A2_FEATURES_PROP = require('fs').existsSync(require('path').join(__dirname, '../lib/useFeatures.ts'))
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

  // ── ⚠️ RE-PINNED (US polish batch, 19 October 2026, docs/us-polish-batch-report.md) ────────────────────────────────
  { id: 'us-polish-thousands-separators', part: 'US polish batch (19 Oct 2026)', country: 'both',
    what: 'lib/money-format.ts groups every displayed amount: "£1234.56" → "£1,234.56", "$1234.56" → "$1,234.56" (≥ 1,000 only; below, nothing changes). On a printed ticket the right-aligned figure takes its commas out of the label gap, so the line keeps its width; a row with no room keeps the ungrouped figure (lib/printing/ticket.ts `fitted`). PRECISE (scripts/_us-polish-grouping.cjs). The Reports CSVs are excluded — they keep raw figures.',
    views: id => !/csv/i.test(id),
    expect: b => mapStrings(b, require('./_us-polish-grouping.cjs').groupString) },

  // ── ⚠️ RE-PINNED (legal follow-ups, 19 October 2026, docs/legal-follow-ups-report.md) ───────────────────────────────
  { id: 'legal-followups-privacy-link', part: 'Legal follow-ups (19 Oct 2026)', country: 'both',
    what: 'A "Privacy" link (https://www.hatchgrab.com/privacy) beside "Powered by HatchGrab" in every customer email footer — " · Privacy" in the HTML, "Privacy: <url>" in the text — and a small "Privacy" link (/privacy) under the order page\'s Place order and under the confirmation\'s "Back to …". PRECISE (scripts/_legal-followups-named.cjs). The Reports CSVs are excluded.',
    views: id => !/csv/i.test(id),
    expect: b => mapStrings(b, require('./_legal-followups-named.cjs').both) },
  { id: 'legal-followups-terms-version', part: 'Legal follow-ups (19 Oct 2026)', country: 'both',
    what: 'A new account records the terms it accepted as TERMS_VERSION "2026-10-19" (lib/legal.ts, the 19 October 2026 Terms) where it recorded "holding-2026-07-23". The one value in the operators insert; nothing else. PRECISE.',
    views: id => /^1c\/api\/(GB|US)\|signup\|/.test(id),
    expect: b => mapStrings(b, x => (x === 'holding-2026-07-23' ? '2026-10-19' : x)) },
  { id: 'legal-followups-service-fee-notice', part: 'Legal follow-ups (19 Oct 2026)', country: 'US',
    what: 'Where a truck\'s online card orders carry a service fee, the order page says so beside the tax notice: "Online card orders include a service fee of 3% + 30¢." (the fixture truck\'s 3% + 30¢, lib/fee-phrase feePhrase). A truck with no fee — every UK truck — shows nothing. PRECISE: one <p data-fee-notice> right after each <p data-tax-notice>.',
    views: id => /^1a\/orderPage\/US\|/.test(id),
    expect: b => mapStrings(b, x => x.replace(/(<p class="text-\[11px\] text-slate-500 mb-2" data-tax-notice="true">[^<]*<\/p>)/g,
      '$1<p class="text-[11px] text-slate-500 mb-2" data-fee-notice="true">Online card orders include a service fee of 3% + 30¢.</p>')) },

  // ── ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026, docs/plans-data-model-report.md) ───────────────────────
  // Plans are data (public.plans / public.plan_prices); provisioning resolves the plan by ROLE through the catalogue.
  { id: 'plans-demo-batch-override', part: 'plans-data-model Stage A (19 Oct 2026)', country: 'both',
    what: 'A demo truck is inserted with feature_overrides {"batch_reservations":true} right after "plan":"demo" (lib/provision-truck.ts demo profile): batch reservations used to follow the demo PLAN in resolveBatchReservations, which is override-only now. Operator trucks are byte-identical. PRECISE: one key added to the demo truck row.',
    // (also Phase 2's own provisioning rows: 2/extra …|rows|demo|… and …|rows|truck|demo)
    views: id => /^1c\/setup\/(GB|US)\|provision\|demo(\|seeded)?$/.test(id) || /^1c\/demo\/(GB|US)\|rows\|/.test(id) || /^2\/extra\/(GB|US)\|rows\|(demo\||truck\|demo$)/.test(id),
    // the view is the JSON of { writes, result, error } / { result, error, writes, tables }: the row is an OBJECT inside it,
    // so the key is added on the serialised text, after exactly the demo plan's value.
    expect: b => typeof b === 'string' ? b.split('"plan":"demo","country":').join('"plan":"demo","feature_overrides":{"batch_reservations":true},"country":') : b },
  { id: 'plans-invalid-plan-list', part: 'plans-data-model Stage A (19 Oct 2026)', country: 'both',
    what: 'provisionTruck\'s refusal of an unknown plan lists the ACTIVE plan keys from the catalogue in sort order ("payg, pro, unlimited, trial, demo, tester") where it listed the old VALID_PLANS ("starter, pro, max, trial, demo, tester"). PRECISE: the one list in the one message.',
    views: id => /^1c\/setup\/(GB|US)\|provision\|refuse\|plan$/.test(id),
    expect: b => mapStrings(b, x => x.replace('must be one of starter, pro, max, trial, demo, tester', 'must be one of payg, pro, unlimited, trial, demo, tester')) },
  { id: 'plans-printing-settings-props', part: 'plans-data-model Stage A (19 Oct 2026); plan-features-config Stage A2 (20 Oct 2026)', country: 'both',
    what: 'The dashboard hands PrintingSettings only `featureOverrides` for its gate (canAccess(feature, overrides) — no plan, no trial end): the stub’s props lose "plan" and "trialExpiresAt", every other prop in place. ⚠️ RE-PINNED (Stage A2): and `featureOverrides` is renamed `features` (the FeatureAccessView, recorded as {}), in place. PRECISE (scripts/_lp1b-dashboard.cjs renders components as <x-stub data-p="{props}">).',
    views: id => /^1b\/dashboard\/(GB|US)\|/.test(id),
    expect: b => mapStrings(b, x => x.replace(/<x-stub data-c="PrintingSettings" data-p="([^"]*)"/g, (whole, raw) => {
      const p = JSON.parse(mnDec(raw)); if (mnEsc(JSON.stringify(p)) !== raw) return whole
      const o = { ...p }; delete o.plan; delete o.trialExpiresAt
      // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the gate prop is now `features` (lib/useFeatures.ts
      // FeatureAccessView — override → the effective plan's switch, from the server's plan_blocks) in featureOverrides'
      // place. The view is three functions, which the stub's JSON drops: it records as {}. PRECISE: the key renamed in
      // place, its value {}.
      const o2 = A2_FEATURES_PROP ? Object.fromEntries(Object.entries(o).map(([k, v]) => (k === 'featureOverrides' ? ['features', {}] : [k, v]))) : o
      return `<x-stub data-c="PrintingSettings" data-p="${mnEsc(JSON.stringify(o2))}"`
    })) },
  { id: 'plans-a2-trial-expires-at', part: 'plan-features-config Stage A2 (20 Oct 2026)', country: 'both',
    what: '⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): a truck provisioned on a TRIAL plan gets a dated trial_expires_at (was NULL): plans.trial_months (4, 20261025_plan_features.sql) after the provisioning day, at 23:59:59 in the truck’s own time zone (lib/provision-truck.ts → lib/plans.ts trialEndFor). Every truck row in the view (the insert, the row handed back, the stored table) whose plan the seed marks as a trial: null → that instant, computed HERE independently (Intl, the fixture clock scripts/_lp1b-fixtures.cjs NOW). Other plans (pro, demo) stay NULL. PRECISE.',
    views: id => A2_TRIAL_MONTHS() != null && /^(1c\/setup\/(GB|US)\|provision\||2\/extra\/(GB|US)\|rows\|truck\|)/.test(id),
    expect: b => a2TrialRows(b) },

  // ── ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026, docs/pricing-pages-report.md; scripts/_lp-stage-b.cjs) ─────────
  // (Stage B's welcome-email trial line adds nothing when no trial runs — the HTML is byte-identical for these fixtures,
  // which pass none; no named change. The coordinator's fix of 20 October 2026 removed the blank line the empty slot left.)
  { id: 'pricing-b-verify-signup-trial-months', part: 'pricing-pages Stage B (20 Oct 2026)', country: 'both',
    what: '⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): verify-signup hands the welcome email `trialMonths` — the running trial’s plans.trial_months, null when the truck’s effective plan is not a running trial — as the LAST argument. The fixture trucks carry no trial_expires_at (and okNoTruck has no truck), so it is null. PRECISE: one key added to the recorded call.',
    views: id => STAGE_B.LANDED && /^1c\/api\/(GB|US)\|verify-signup\|/.test(id),
    expect: b => STAGE_B.welcomeTrialArg(b) },

  // ── ⚠️ RE-PINNED (pricing-tidy, 20 October 2026; scripts/_lp-pricing-tidy.cjs) ─────────────────────────────────────────
  { id: 'pricing-tidy-terms-version', part: 'pricing-tidy (20 Oct 2026)', country: 'both',
    what: '⚠️ RE-PINNED (pricing-tidy, 20 October 2026): the Terms were re-dated 20 October 2026 (§4 edited), so a new account records TERMS_VERSION "2026-10-20" (lib/legal.ts) where it recorded "2026-10-19". PRECISE: the operators insert’s `terms_version` only.',
    views: id => require('./_lp-pricing-tidy.cjs').LANDED && /^1c\/api\/(GB|US)\|signup\|/.test(id),
    expect: b => require('./_lp-pricing-tidy.cjs').termsVersion(b) },

  // ── ⚠️ RE-PINNED (ireland-1, 20 October 2026; lib/provision-demo-event.ts demoEventWindow) ─────────────────────────────
  { id: 'ie1-demo-date-from-now', part: 'ireland-1 (20 Oct 2026)', country: 'both',
    what: '⚠️ RE-PINNED (ireland-1, 20 October 2026): demoEventWindow takes the demo event’s DATE from `now` (localDateOfInstant(now, tz)) where it read the real clock (getLocalDateInTz). The return-visit restart passes now = LATER (2026-10-10T11:00Z) while the kit clock is the fixture NOW (2026-10-09), so its event — and every row dated by it — moves from the clock’s date to LATER’s date in the truck’s zone. PRECISE: `"event_date":"<clock date>"` → `"event_date":"<LATER date>"`, nothing else.',
    views: id => /^1c\/demo\/(GB|US)\|rows\|return\|restart$/.test(id),
    expect: (b, id) => ie1ShiftDate(b, id) },
  { id: 'ie1-demo-visit-next-day', part: 'ireland-1 (20 Oct 2026)', country: 'both',
    what: '⚠️ RE-PINNED (ireland-1, 20 October 2026): the same date change on the return VISIT, which clears the demo day it is about to build BY DATE (provisionDemoEvent replaceExisting). The clock’s date used to be the build’s day, so the visit deleted the build’s event, its orders and its production_slot_usage; LATER’s date has none of them, so they now STAY (as on any real next-day return visit, where `now` and the clock already agreed). PRECISE, from the BEFORE visit and the BEFORE build (scripts/fixtures/language-phase-1c-before/demo.json.gz, through the named changes above): the dates shifted as in ie1-demo-date-from-now; the build-day deletes gone (orders and truck_events) or empty (production_slot_usage); the build’s event, orders and slot usage kept ahead of the new ones. ⚠️ FIXTURE ARTEFACT, not product: the harness’s randomUUID stub restarts per run, so the visit’s order_keys repeat the build’s and each reservation update (…eq(\'order_key\').eq(\'truck_id\')) also lands on the build’s order with that key — its ids list that order first and the kept order carries the patch. Real order_keys are random UUIDs.',
    views: id => /^1c\/demo\/(GB|US)\|rows\|return\|visit$/.test(id),
    expect: (b, id) => ie1Visit(b, id) },
]

// ── ⚠️ RE-PINNED (ireland-1, 20 October 2026): helpers for the ie1-demo-* entries ─────────────────────────────────────────
const IE1_LATER = '2026-10-10T11:00:00.000Z'                 // scripts/_lp1c-demo.cjs LATER — the `now` both views pass
const IE1_CLOCK = require('./_lp1b-fixtures.cjs').NOW         // the kit clock they run under (the old date's source)
const ie1Zone = id => (countryOf(id) === 'US' ? 'America/Chicago' : 'Europe/London')   // the demo truck's zone in each
const ie1Ymd = (iso, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
/** Every `"event_date":"<clock date>"` → `"event_date":"<LATER date>"`; refuses (BEFORE unchanged → the view fails) when
 *  the two dates are the same or the old date is absent. */
function ie1ShiftDate(b, id) {
  if (typeof b !== 'string') return b
  const z = ie1Zone(id), from = `"event_date":"${ie1Ymd(IE1_CLOCK, z)}"`, to = `"event_date":"${ie1Ymd(IE1_LATER, z)}"`
  return from !== to && b.includes(from) ? b.split(from).join(to) : b
}
let IE1_1C_BEFORE = null
function ie1Visit(b, id) {
  if (typeof b !== 'string') return b
  const buildId = id.replace(/\|visit$/, '|build')
  IE1_1C_BEFORE ??= JSON.parse(require('zlib').gunzipSync(require('fs').readFileSync(require('path').join(__dirname, 'fixtures/language-phase-1c-before/demo.json.gz')))).views
  const raw = IE1_1C_BEFORE[buildId.replace(/^1c\/demo\//, '')]
  const shifted = ie1ShiftDate(b, id)
  if (typeof raw !== 'string' || shifted === b) return b
  const build = JSON.parse(apply(buildId, raw).expected).tables
  const v = JSON.parse(shifted)
  const same = (w, rows) => JSON.stringify(w.ids) === JSON.stringify((rows || []).map(r => r.id))
  // 1 · the clear by date finds nothing of the build's day: its orders / event deletes go, its slot-usage delete is empty
  v.writes = v.writes
    .filter(w => !(w.op === 'delete' && ((w.table === 'orders' && same(w, build.orders)) || (w.table === 'truck_events' && same(w, build.truck_events)))))
    .map(w => (w.op === 'delete' && w.table === 'production_slot_usage' && same(w, build.production_slot_usage) ? { ...w, ids: [] } : w))
  // 2 · the build's rows stay, ahead of the visit's; a reservation update also lands on the build's order with the same
  //     order_key and truck (the fixture's repeating UUID stub — see the entry), in write order, as the fake applies it
  const kept = build.orders.map(o => ({ ...o }))
  for (const w of v.writes) {
    if (w.table !== 'orders' || w.op !== 'update' || !Array.isArray(w.ids) || w.ids.length !== 1) continue
    const mine = v.tables.orders.find(o => o.id === w.ids[0])
    if (!mine) continue
    const hit = kept.filter(o => o.order_key === mine.order_key && o.truck_id === mine.truck_id)
    for (const o of hit) Object.assign(o, w.patch)
    w.ids = [...hit.map(o => o.id), ...w.ids]
  }
  v.tables.truck_events = [...build.truck_events, ...v.tables.truck_events]
  v.tables.orders = [...kept, ...v.tables.orders]
  v.tables.production_slot_usage = [...build.production_slot_usage, ...v.tables.production_slot_usage]
  return JSON.stringify(v)
}

/** The named entries that apply to a view, and what they make of its BEFORE value: { listed: true, entries } when an
 *  entry only LISTS the view; else { expected, touched: [ids of entries whose transform changed something] }. Used by
 *  language-phase-2 and by the 1a / 1b / 1c harnesses (which compare BEFORE + the named changes with their AFTER). */
// ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md): through applyNamed, so a
// `prove` entry (pending-card-layout) is understood; every other view gets exactly what the old loop gave it.
function apply(id, before) {
  return applyNamed(NAMED, countryOf(id) === 'US', id, before)
}

module.exports = { NAMED, apply, applyNamed, pendingCardEntry, pendingCardProof, hasPendingCard, mapStrings, mapFields, longDate, clock12, countryOf }
