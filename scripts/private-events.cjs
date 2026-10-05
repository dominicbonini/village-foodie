#!/usr/bin/env node
// scripts/private-events.cjs
//
//   node scripts/private-events.cjs     (NO NETWORK, NO DATABASE, NO BROWSER, NO LIVE TRUCK)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS GUARDS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A private event is somebody's wedding. Five things can go wrong and four of them are irreversible
// once they have happened, because publishing cannot be unpublished:
//
//   1. A LOCATION REACHES A PUBLIC SURFACE. Section 1 walks every public feed and proves each one
//      either drops the event or redacts it, and section 2 proves each FAILS CLOSED — "I could not
//      read `is_private`" must mean "treat it as private".
//   2. A STRANGER ORDERS FROM IT. Section 3 proves the submit route admits an order only against the
//      event's CURRENT token, matched together with the event id, on both payment paths.
//   3. A RETIRED LINK KEEPS WORKING, or a live one stops being revocable. Section 4.
//   4. THE PRIVACY FLAG GETS A SECOND WRITER and the four coupled columns drift apart. Section 5
//      reads the whole repository and names every writer.
//   5. THE SCRAPER HIDES PUBLIC TRADE, or publishes a private booking. Section 6 runs the detector
//      against FIXTURES — never the live scraper, never production.
//
// ⛔ WHAT THIS CANNOT DO, STATED RATHER THAN IMPLIED: it cannot open `/p/<token>` in a browser or
// place a real order. Those are the numbered localhost list in docs/private-events-report.md, on
// Pizza Kitchen only. This harness proves the RULES; the list proves the screens.

const fs = require('fs')
const path = require('path')
const { compile } = require('./_slot-interval-compile.cjs')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')

/* ══ 🔴 THE PRE-BUILD TREE, PINNED BY SHA ═══════════════════════════════════════════════════════
 * `0ce4c83` is this branch's tip before the private-events build. Recorded in
 * docs/private-events-report.md too, so the two cannot drift.
 * 🔴 A SHA, NEVER `HEAD` AND NEVER A BRANCH NAME — `HEAD` makes the baseline move with the next
 * commit and turns the comparison into a tree compared with ITSELF, which passes for the wrong
 * reason. That trap has now caught five harnesses in this repository. */
const BEFORE_REF = '0ce4c83'
const gitShow = (ref, f) => {
  try { return execFileSync('git', ['show', `${ref}:${f}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 }) }
  catch { return null }
}

let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(REPO, p))
/** 🔴 COMMENTS STRIPPED BEFORE ANY SOURCE-TEXT COUNT. A rule written in prose about a column must
 *  never be mistaken for a write of it — that is how "one writer" claims become false. */
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * ── 🔴 "DOES THIS SOURCE WRITE `col` TO `table`?" ─────────────────────────────────────────────────
 * A WRITE is a key inside the argument to `.insert(` or `.update(` in a chain whose nearest preceding
 * `.from('…')` names that table. Everything else that mentions the column — an interface field, a key
 * in a JSON response, a redaction whitelist, a form's local state — is not a write, and the first
 * version of this check counted all four as one.
 *
 * ⛔ THE FILE IS **SPLIT** ON `.from('`, NOT MATCHED WITH A BOUNDED LOOKAHEAD. The first version used
 * `.from\('truck_events'\)([\s\S]{0,1200}?)(?=\.from\('|$)` — and a chain whose next `.from(` was
 * more than 1200 characters away did not merely truncate, it FAILED TO MATCH AT ALL and the engine
 * skipped that chain entirely. The approval queue's confirm, which is a long handler, was invisible
 * to it: variant V14 added a second writer of `is_private` there and the check did not notice.
 * Splitting has no budget to get wrong.
 */
const writesColumn = (src, table, col) => {
  const parts = codeOf(src).split(".from('")
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i]
    const close = seg.indexOf("')")
    if (close < 0) continue
    if (seg.slice(0, close) !== table) continue
    /* The rest of THIS segment is the chain, up to the next `.from('` — which is where the split
     * already put the boundary. */
    const chain = seg.slice(close + 2)
    for (const call of chain.matchAll(/\.(insert|update)\(([\s\S]*?)\)\s*(?:\.|;|$)/g)) {
      if (new RegExp(`\\b${col}\\s*:`).test(call[2])) return true
    }
  }
  return false
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE MODULES UNDER TEST, COMPILED AND CALLED
// ════════════════════════════════════════════════════════════════════════════════════════════════
const LIB = [
  'lib/private-events/detect.ts', 'lib/private-events/resolve.ts',
  'lib/private-events/token.ts', 'lib/private-events/read.ts',
  'lib/private-events/type.ts', 'lib/private-events/write.ts',
]
function build(root, files, tag) {
  const c = compile(root, files, tag, { jsx: 'react-jsx', skipLibCheck: true })
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already there */ }
  const get = (f) => { try { return c.req(f) } catch { return null } }
  return {
    detect: get('lib/private-events/detect.js'),
    resolve: get('lib/private-events/resolve.js'),
    token: get('lib/private-events/token.js'),
    read: get('lib/private-events/read.js'),
    type: get('lib/private-events/type.js'),
    write: get('lib/private-events/write.js'),
  }
}
const NOW = build(REPO, LIB, 'pe-now')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE STUB CLIENT
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * ── 🔴 A STUB, NOT A MOCK OF THE ANSWER ──────────────────────────────────────────────────────────
 * It implements the PostgREST chain and serves ROWS from a fixture, so the real `resolvePrivateLink`,
 * `tokenAdmitsOrder`, `readPrivateEventIds` and `applyPrivacy` run against it.
 *
 * ⛔ AND THE LESSON FROM EVENT PRICING IS WRITTEN ON IT: **a stub has no query planner.** It cannot
 * see a CHECK, a partial index or an ON CONFLICT target — 92 checks once passed over an upsert that
 * could never have worked against Postgres (42P10, fixed by 20261013). So every claim here is about
 * LOGIC. The claims about the SCHEMA are made in section 7, by reading the migration.
 *
 * ⚠️ `fail` MAKES EVERY READ OF A NAMED TABLE ANSWER 42703 — the pre-migration state, and the single
 * most important fixture in this file, because fail-CLOSED is the whole safety argument.
 */
function stub(fixture, opts = {}) {
  const failTables = new Set(opts.fail || [])
  const writes = []
  const make = (table) => ({
    _table: table, _filters: [], _cols: null,
    select(cols) { this._cols = cols; return this },
    eq(k, v) { this._filters.push([k, v]); return this },
    neq() { return this }, not() { return this }, gte() { return this },
    ilike(k, v) { this._filters.push([k, String(v).toLowerCase()]); this._ilike = true; return this },
    in(k, vs) { this._in = [k, vs]; return this },
    limit() { return this }, order() { return this },
    insert(row) { writes.push({ op: 'insert', table, row }); this._written = row; return this },
    update(row) { writes.push({ op: 'update', table, row, filters: this._filters }); this._written = row; return this },
    then(res) { return Promise.resolve(this._result()).then(res) },
    maybeSingle() { const r = this._result(); return Promise.resolve({ data: (r.data || [])[0] ?? null, error: r.error }) },
    single() { return this.maybeSingle() },
    _rows() {
      let rows = fixture[this._table] || []
      rows = rows.filter(r => this._filters.every(([k, v]) => {
        const key = k.includes('.') ? k.split('.').pop() : k
        if (r[key] === undefined) return false
        if (this._ilike) return String(r[key]).toLowerCase() === v
        return r[key] === v
      }))
      if (this._in) {
        const [k, vs] = this._in
        rows = rows.filter(r => vs.includes(r[k]))
      }
      return rows
    },
    _result() {
      if (failTables.has(this._table)) {
        return { data: null, error: { code: '42703', message: `column does not exist (stub): ${this._table}` } }
      }
      /* An insert/update answers with the row it wrote, which is what `.select().single()` does. */
      if (this._written) return { data: [{ ...(this._rows()[0] || {}), ...this._written }], error: null }
      return { data: this._rows(), error: null }
    },
  })
  return { from: make, _writes: writes }
}

// ── THE FIXTURE ──────────────────────────────────────────────────────────────────────────────────
const TRUCK = 'test-kitchen'
const TYPE_PRIVATE = 'bbbbbbbb-0000-0000-0000-0000000000p1'.replace('p1', '01')
const TYPE_MARKET = 'bbbbbbbb-0000-0000-0000-000000000002'
const EV_PRIVATE = 'cccccccc-0000-0000-0000-00000000000a'
const EV_PUBLIC = 'cccccccc-0000-0000-0000-00000000000b'
const TOKEN_LIVE = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'
const TOKEN_OLD = 'ZyXwVuTsRqPoNmLkJiHgFeDcBa543210'

const baseFixture = () => ({
  trucks: [{ id: TRUCK, name: 'Pizza Kitchen', slug: 'pizza-kitchen', active: true, logo_storage_path: null }],
  event_types: [
    { id: TYPE_MARKET, truck_id: TRUCK, name: 'Market', kind: 'custom', sort_order: 0, private_link_ordering: true },
    { id: TYPE_PRIVATE, truck_id: TRUCK, name: 'Private', kind: 'private', sort_order: 1, private_link_ordering: true },
  ],
  truck_events: [
    {
      id: EV_PRIVATE, truck_id: TRUCK, event_date: '2026-10-10', start_time: '17:00', end_time: '22:00',
      status: 'confirmed', is_private: true, private_name: 'Sarah & Tom’s wedding',
      private_token: TOKEN_LIVE, private_link_ordering_override: null, event_type_id: TYPE_PRIVATE,
      venue_name: 'Hengrave Hall', town: 'Hengrave', postcode: 'IP28 6LZ', notes: 'side gate, ask for Sarah',
    },
    {
      id: EV_PUBLIC, truck_id: TRUCK, event_date: '2026-10-11', start_time: '12:00', end_time: '14:00',
      status: 'confirmed', is_private: false, private_name: null, private_token: null,
      private_link_ordering_override: null, event_type_id: TYPE_MARKET,
      venue_name: 'Five Bells', town: 'Cavendish', postcode: 'CO10 8AX', notes: '',
    },
  ],
  private_event_links: [
    { token: TOKEN_OLD, truck_id: TRUCK, event_id: EV_PRIVATE, reason: 'replaced', retired_at: '2026-10-05T00:00:00Z' },
  ],
  truck_vans: [{ id: 'van-1', truck_id: TRUCK, active: true, created_at: '2026-01-01', order_ready_enabled: true, buzzer_count: null }],
})

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · EVERY PUBLIC SURFACE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · every public surface either DROPS or REDACTS a private event')

/**
 * ── 🔴 THE REGISTER OF PUBLIC SURFACES, AND WHY IT IS A LIST IN A HARNESS ───────────────────────
 * §70.2 names the surfaces private events must change. A list in a report is a list somebody has to
 * remember; this one FAILS when a named surface stops consulting the privacy read.
 *
 * ⛔ `handling` IS THE DECISION, NOT A DESCRIPTION. 'drop' = the event must not appear at all;
 * 'redact' = it appears as "Private event" with the date and times and nothing else.
 */
const SURFACES = [
  {
    file: 'app/api/discovery/events/route.ts',
    what: 'the discovery feed — the VF listing, the truck page AND the map (one mapper)',
    handling: 'drop',
  },
  {
    file: 'app/api/events/route.ts',
    what: 'the customer schedule feed the order page reads',
    handling: 'redact',
  },
  {
    file: 'app/api/embed/events/route.ts',
    what: 'the embed widget AND app/domain/page.tsx (the custom-domain schedule)',
    handling: 'redact',
  },
  {
    file: 'app/api/weekly-post/route.ts',
    what: 'the weekly poster and the single-event post',
    handling: 'redact',
  },
  {
    file: 'app/api/menu/[truckId]/route.ts',
    what: "the menu API's event auto-detect",
    handling: 'drop',
  },
  {
    file: 'lib/whatsapp/upcoming-events.ts',
    what: 'the WhatsApp auto-reply’s grounding',
    handling: 'redact',
  },
  {
    file: 'app/api/webhooks/meta/whatsapp/route.ts',
    what: 'the Meta WhatsApp webhook’s own copy of that query',
    handling: 'redact',
  },
  {
    file: 'app/api/webhooks/whatsapp/route.ts',
    what: 'the dormant Twilio webhook’s copy',
    handling: 'redact',
  },
]

for (const s of SURFACES) {
  const src = codeOf(read(s.file))
  t(`🔴 ${s.file} consults the privacy read — ${s.what}`,
    /from '@\/lib\/private-events\/read'/.test(src))
  if (s.handling === 'drop') {
    /* A drop must be a FILTER or an early null, never a substitution. */
    t(`⛔ …and DROPS: it filters on isPrivate / isEventPrivate rather than relabelling`,
      /isPrivate\(|isEventPrivate\(/.test(src))
  } else {
    t(`⛔ …and REDACTS through a shared definition, not a typed string`,
      /PRIVATE_PUBLIC_LABEL|redactPrivateRows|PRIVATE_PUBLIC_NAME/.test(src)
      /* The poster redacts inside lib/weekly-post/week-data.ts, which this file calls. */
      || (s.file === 'app/api/weekly-post/route.ts'
          && /PRIVATE_PUBLIC_LABEL/.test(codeOf(read('lib/weekly-post/week-data.ts')))))
  }
}

/* ── ⛔ THE LITERAL STRING APPEARS IN **ONE** PLACE ─────────────────────────────────────────────
 * "the public name of a private event" is one decision. Six surfaces each typing it is six chances
 * to type it differently, and a feed that said "Private booking" would be a feed nobody could
 * grep for. */
{
  const label = 'Private event'
  const offenders = []
  for (const s of SURFACES) {
    const src = codeOf(read(s.file))
    if (src.includes(`'${label}'`) || src.includes(`"${label}"`)) offenders.push(s.file)
  }
  t(`⛔ no public surface types the string "${label}" — it comes from lib/private-events (${offenders.join(', ') || 'none'})`,
    offenders.length === 0)
  t('🔴 …and it IS defined, once, in lib/private-events/resolve.ts',
    new RegExp(`PRIVATE_PUBLIC_LABEL = '${label}'`).test(read('lib/private-events/resolve.ts')))
}

/* ── 🔴 THE DEDUP KEY IS BUILT BEFORE THE SUBSTITUTION (§70.2 names this) ──────────────────────
 * Substituting first gives every private event on one date the key `date|Private event|`, and the
 * second is silently dropped as a duplicate — a truck with two private bookings in an evening
 * publishes one of them. Asserted by ORDER IN THE SOURCE, which is the only thing that decides it. */
{
  const src = read('app/api/events/route.ts')
  const keyAt = src.indexOf('const key = `${e.event_date}|${e.venue_name')
  const subAt = src.indexOf('isPrivate ? PRIVATE_PUBLIC_LABEL')
  t('🔴 /api/events builds its dedup key on the REAL venue name, BEFORE the substitution',
    keyAt > 0 && subAt > 0 && keyAt < subAt)
}

/* ── ⛔ THE REDACTION IS A WHITELIST, NOT A BLACKLIST ──────────────────────────────────────────
 * `redactPrivate` returns a new object built from the allowed fields. A function that DELETED the
 * five location columns would be correct today and wrong the first time a sixth is added to
 * `truck_events` — the new one would publish by default and nothing would fail. */
{
  const R = NOW.resolve
  const row = {
    id: 'e1', event_date: '2026-10-10', start_time: '17:00', end_time: '22:00', status: 'confirmed',
    venue_name: 'Hengrave Hall', town: 'Hengrave', postcode: 'IP28 6LZ', address: 'Bury Rd',
    latitude: 52.26, longitude: 0.68, venue_id: 'v1', truck_place_id: 'p1',
    notes: 'side gate, ask for Sarah', private_name: 'Sarah & Tom’s wedding', private_token: 'abc',
  }
  const out = R.redactPrivate(row)
  t('⛔ redactPrivate keeps the date and both times', out.event_date === '2026-10-10' && out.start_time === '17:00' && out.end_time === '22:00')
  for (const f of ['town', 'postcode', 'address', 'latitude', 'longitude', 'venue_id', 'truck_place_id', 'private_name', 'private_token']) {
    t(`⛔ …and nulls ${f}`, out[f] === null)
  }
  t('⛔ …and replaces venue_name with the public label', out.venue_name === 'Private event')
  t('⛔ …and blanks the NOTES, which the brief does not list but which most often CONTAINS a location',
    out.notes === '')
  t('🔴 …and leaves a PUBLIC event completely alone', (() => {
    const pub = { ...row }
    return R.publicVenueName(false, 'Five Bells') === 'Five Bells' && pub.town === 'Hengrave'
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · FAIL CLOSED
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · every privacy read FAILS CLOSED — a read failure means "private"')

;(async () => {
  const R = NOW.read

  /* ⛔ THE SINGLE MOST IMPORTANT ASSERTION IN THIS FILE. Event pricing fails OPEN because open means
   * "charge the menu price", which is today's behaviour. Privacy has no such luck: open means
   * publishing a wedding's address. */
  {
    const okRead = await R.readPrivateEventIds(stub(baseFixture()), [EV_PRIVATE, EV_PUBLIC], 'test')
    t('🔴 a WORKING read names exactly the private event', okRead.ok && okRead.isPrivate(EV_PRIVATE) && !okRead.isPrivate(EV_PUBLIC))

    const failed = await R.readPrivateEventIds(stub(baseFixture(), { fail: ['truck_events'] }), [EV_PRIVATE, EV_PUBLIC], 'test')
    t('⛔ a FAILED read reports !ok', failed.ok === false)
    t('⛔ …and answers TRUE for the private event', failed.isPrivate(EV_PRIVATE) === true)
    t('⛔ …and TRUE for the PUBLIC one too — fail CLOSED, not "best effort"', failed.isPrivate(EV_PUBLIC) === true)
    t('⛔ …and TRUE for an id it was never even given', failed.isPrivate('unknown-id') === true)

    const empty = await R.readPrivateEventIds(stub(baseFixture()), [], 'test')
    t('🔴 nothing to ask about is a SUCCESSFUL empty read, not a failure', empty.ok === true && empty.isPrivate(EV_PRIVATE) === false)
  }

  {
    t('⛔ isEventPrivate fails closed', await R.isEventPrivate(stub(baseFixture(), { fail: ['truck_events'] }), EV_PUBLIC, 'test') === true)
    t('🔴 …and answers false for a genuinely public event', await R.isEventPrivate(stub(baseFixture()), EV_PUBLIC, 'test') === false)
    t('🔴 …and false for no event at all (a truck with nothing on)', await R.isEventPrivate(stub(baseFixture()), null, 'test') === false)
  }

  {
    const rows = [{ id: EV_PRIVATE, venue_name: 'Hengrave Hall', town: 'Hengrave', postcode: 'IP28 6LZ' },
                  { id: EV_PUBLIC, venue_name: 'Five Bells', town: 'Cavendish', postcode: 'CO10 8AX' }]
    const safe = await R.redactPrivateRows(stub(baseFixture()), rows, 'test')
    t('🔴 redactPrivateRows redacts the private row and keeps the public one',
      safe[0].venue_name === 'Private event' && safe[0].town === null && safe[1].venue_name === 'Five Bells')
    const allSafe = await R.redactPrivateRows(stub(baseFixture(), { fail: ['truck_events'] }), rows, 'test')
    t('⛔ …and on a failed probe redacts EVERY row — the model is never handed a venue we could not check',
      allSafe.every(r => r.venue_name === 'Private event' && r.town === null))
    t('⛔ …and the row SURVIVES rather than being dropped, so the truck still reads as busy',
      allSafe.length === 2)
  }

  /* ⛔ AND THE DIRECTION IS ASSERTED IN THE SOURCE, so nobody "fixes" it to fail open. */
  {
    const src = read('lib/private-events/read.ts')
    t('⛔ read.ts states the fail-closed direction and names the opposite one it is NOT',
      /FAILS? \*?\*?CLOSED/.test(src) && /fail OPEN/i.test(src))
    t('🔴 …and the failed state is a named constant answering true for everything',
      /const ALL: PrivacyRead = \{ ok: false, ids: new Set\(\), isPrivate: \(\) => true \}/.test(src))
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 3 · THE ORDER GATE
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · an order against a private event is admitted ONLY by its current token')

  {
    const f = baseFixture()
    t('🔴 the CURRENT token for THAT event admits the order',
      await R.tokenAdmitsOrder(stub(f), EV_PRIVATE, TOKEN_LIVE) === true)
    t('⛔ the event id ALONE is refused — no token', await R.tokenAdmitsOrder(stub(f), EV_PRIVATE, null) === false)
    t('⛔ a RETIRED token is refused', await R.tokenAdmitsOrder(stub(f), EV_PRIVATE, TOKEN_OLD) === false)
    t('⛔ junk is refused without a query', await R.tokenAdmitsOrder(stub(f), EV_PRIVATE, 'short') === false)
    /* ⛔ THE PAIRING IS THE POINT: a valid token for event A must not admit an order against B. */
    t('⛔ a VALID token paired with ANOTHER event id is refused — a token proves access to ONE event',
      await R.tokenAdmitsOrder(stub(f), EV_PUBLIC, TOKEN_LIVE) === false)
    t('⛔ a failed read refuses the order (fail closed)',
      await R.tokenAdmitsOrder(stub(f, { fail: ['truck_events'] }), EV_PRIVATE, TOKEN_LIVE) === false)

    /* Link ordering off ⇒ no online order at all, even with the token. */
    const off = baseFixture()
    off.truck_events[0].private_link_ordering_override = false
    t('⛔ link ordering switched OFF for the event refuses the order even with a valid token',
      await R.tokenAdmitsOrder(stub(off), EV_PRIVATE, TOKEN_LIVE) === false)
    const offType = baseFixture()
    offType.event_types[1].private_link_ordering = false
    t('⛔ …and the TYPE\'s switch off does the same when the event has no override',
      await R.tokenAdmitsOrder(stub(offType), EV_PRIVATE, TOKEN_LIVE) === false)
    const onDespiteType = baseFixture()
    onDespiteType.event_types[1].private_link_ordering = false
    onDespiteType.truck_events[0].private_link_ordering_override = true
    t('🔴 …and the EVENT\'s hand change WINS over the type (`?? `, not `||`)',
      await R.tokenAdmitsOrder(stub(onDespiteType), EV_PRIVATE, TOKEN_LIVE) === true)
  }

  /* ── 🔴 THE GATE IS IN THE SUBMIT ROUTE, BEFORE THE MONEY ──────────────────────────────────── */
  {
    const src = read('app/api/orders/submit/route.ts')
    const code = codeOf(src)
    t('🔴 the submit route imports the gate', /tokenAdmitsOrder/.test(code))
    t('🔴 …and reads `privateToken` off the wire', /privateToken,/.test(code))
    const gateAt = code.indexOf('tokenAdmitsOrder(')
    const bookAt = code.indexOf('loadEventPriceBook(')
    t('⛔ …and the gate runs BEFORE the price book, so a refused order never reaches the money path',
      gateAt > 0 && bookAt > 0 && gateAt < bookAt)
    const forkAt = code.indexOf('payByCard')
    t('⛔ …and before the card fork, so ONE check covers card and pay-at-hatch',
      gateAt > 0 && (forkAt < 0 || gateAt < code.lastIndexOf('payByCard')))
    t('⛔ …and refuses with 403, not a price error', /status: 403/.test(code))
    /* ⛔ THE TOKEN IS NEVER STORED OR LOGGED. It is a credential; an order row carrying it, or a log
     * line, would be a leak with a long half-life. */
    t('⛔ the token is never written onto the order row',
      !/private_token:/.test(code) && !/privateToken:\s*privateToken/.test(code.replace('privateToken: privateToken || null', '')))
    t('⛔ …and never logged', !/console\.(log|warn|error)\([^)]*privateToken/.test(code))
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 4 · THE LINK: RESOLVING, REPLACING, REVOKING
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · the private link resolves, replaces and revokes')

  {
    const ok = await R.resolvePrivateLink(stub(baseFixture()), TOKEN_LIVE)
    t('🔴 a live token resolves to its event and truck', ok.kind === 'ok' && ok.event.id === EV_PRIVATE && ok.truck.slug === 'pizza-kitchen')

    const old = await R.resolvePrivateLink(stub(baseFixture()), TOKEN_OLD)
    t('🔴 a RETIRED token says "replaced" AND NAMES THE TRUCK — a printed QR cannot 404',
      old.kind === 'replaced' && old.truckName === 'Pizza Kitchen' && old.reason === 'replaced')

    const unknown = await R.resolvePrivateLink(stub(baseFixture()), 'QqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQq')
    t('🔴 a token that was never ours is "unknown"', unknown.kind === 'unknown')
    t('⛔ …and so is junk, without a database query at all',
      (await R.resolvePrivateLink(stub(baseFixture()), 'nope')).kind === 'unknown')

    const broken = await R.resolvePrivateLink(stub(baseFixture(), { fail: ['truck_events'] }), TOKEN_LIVE)
    t('⛔ a failed read is "unavailable" — never "ok"', broken.kind === 'unavailable')

    const offType = baseFixture()
    offType.event_types[1].private_link_ordering = false
    const noOrder = await R.resolvePrivateLink(stub(offType), TOKEN_LIVE)
    t('🔴 link ordering off resolves to `ordering_off`, NOT a dead link — the event is real',
      noOrder.kind === 'ordering_off')

    /* ⛔ A PUBLIC EVENT MUST NOT BE SERVABLE THROUGH A PRIVATE LINK, even if a token somehow survived
     * on it. The migration's CHECK forbids the state; this is the code's own belt. */
    const leaked = baseFixture()
    leaked.truck_events[0].is_private = false
    t('⛔ a token on a PUBLIC event resolves to "unknown", not "ok"',
      (await R.resolvePrivateLink(stub(leaked), TOKEN_LIVE)).kind === 'unknown')

    const dead = baseFixture()
    dead.trucks[0].active = false
    t('⛔ an inactive truck\'s link does not resolve',
      (await R.resolvePrivateLink(stub(dead), TOKEN_LIVE)).kind === 'unknown')
  }

  /* ── 🔴 "MAKE A NEW LINK" ──────────────────────────────────────────────────────────────────── */
  {
    const W = NOW.write
    const f = baseFixture()
    const s = stub(f)
    const r = await W.replacePrivateLink(s, TRUCK, EV_PRIVATE)
    t('🔴 replacePrivateLink issues a NEW token', r.ok && !!r.token && r.token !== TOKEN_LIVE)
    t('⛔ …and RETIRES the old one into private_event_links, so the printed cards can explain themselves',
      s._writes.some(w => w.op === 'insert' && w.table === 'private_event_links' && w.row.token === TOKEN_LIVE && w.row.reason === 'replaced'))
    t('⛔ …and writes the new token onto the event',
      s._writes.some(w => w.op === 'update' && w.table === 'truck_events' && w.row.private_token === r.token))
    t('🔴 …and the new token is shaped like one of ours', NOW.token.looksLikeToken(r.token))

    const pub = baseFixture()
    pub.truck_events[0].is_private = false
    t('⛔ it refuses on a PUBLIC event', (await W.replacePrivateLink(stub(pub), TRUCK, EV_PRIVATE)).ok === false)
    const offEv = baseFixture()
    offEv.truck_events[0].private_link_ordering_override = false
    t('⛔ …and refuses when link ordering is off (there is no link to replace)',
      (await W.replacePrivateLink(stub(offEv), TRUCK, EV_PRIVATE)).ok === false)
  }

  /* ── 🔴 THE TOKEN ITSELF ──────────────────────────────────────────────────────────────────── */
  {
    const T = NOW.token
    const a = T.newPrivateToken(), b = T.newPrivateToken()
    t('🔴 a token is 32 base64url characters — 192 bits, above the brief\'s 128 floor',
      a.length === 32 && /^[A-Za-z0-9_-]{32}$/.test(a))
    t('⛔ …and two are not the same', a !== b)
    t('⛔ …and 1000 are all distinct', new Set(Array.from({ length: 1000 }, () => T.newPrivateToken())).size === 1000)
    t('🔴 looksLikeToken accepts ours and refuses what the migration\'s CHECK would refuse', (() => {
      return T.looksLikeToken(a) && !T.looksLikeToken('short')
        && !T.looksLikeToken('has spaces in it and is long enough')
        && !T.looksLikeToken('x'.repeat(65)) && T.looksLikeToken('x'.repeat(22))
        && !T.looksLikeToken('x'.repeat(21)) && !T.looksLikeToken(null) && !T.looksLikeToken(123)
    })())
    /* ⛔ THE SOURCE OF RANDOMNESS IS CHECKED IN THE SOURCE. `Math.random` is not a CSPRNG and is the
     * classic way to ship a guessable link; it cannot be detected from the output. */
    const src = codeOf(read('lib/private-events/token.ts'))
    t('⛔ the generator uses crypto randomBytes and NOT Math.random',
      /randomBytes\(24\)/.test(src) && !/Math\.random/.test(src))
    /* ⚠️ "nothing else generates a token" is asserted structurally in section 5, where a write is
     * defined as a key in an `.insert(`/`.update(` payload rather than a key anywhere in a file. */
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 5 · ONE WRITER
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · the four coupled columns have exactly ONE writer')

  /**
   * ── 🔴 WHY THIS IS A PROOF AND NOT A CONVENTION ────────────────────────────────────────────────
   * `is_private`, `event_type_id`-for-private, `private_name` and `private_token` are four facts
   * about one state, and every inconsistent combination is a defect with teeth — a private event with
   * no link, a public event with a live link, a wedding's name left on a public pitch. So the rule is
   * "one door", and this reads the whole repository to prove it.
   *
   * ⚠️ TWO SITES ARE ALLOWLISTED BY NAME, WITH REASONS. Naming them is the point: an unlisted third
   * one fails, which is exactly how `schedule-graphics-places.cjs` caught an edit silently
   * re-deriving a pitch.
   */
  {
    /**
     * ── 🔴 WHAT COUNTS AS A "WRITE", AND WHY THE FIRST VERSION OF THIS CHECK WAS WRONG ───────────
     * The first matcher looked for the column name as an object key anywhere in a file. It reported
     * SIX writers of `is_private` and every one of the five extras was a false positive:
     *   • `lib/private-events/read.ts`   — a TypeScript interface field
     *   • `lib/private-events/resolve.ts` — `redactPrivate`'s whitelist, which is the opposite of a write
     *   • `app/api/events/route.ts`      — a key in the JSON RESPONSE the feed publishes
     *   • `app/api/weekly-post/route.ts` — attaching the flag to an in-memory row for the poster
     *   • `app/manage/[token]/page.tsx`  — the EDIT FORM's local state
     * None of them touches the database, and an allowlist padded out with five of them would have
     * been an allowlist that proved nothing.
     *
     * ⛔ SO A WRITE IS DEFINED STRUCTURALLY: a key inside the argument to `.insert(` or `.update(` in
     * a `.from('truck_events')` chain. That is the only thing that can change a row, and it is what
     * the claim "one writer" is actually about.
     * ⚠️ THE TABLE IS RESOLVED FROM THE NEAREST PRECEDING `.from('…')` — the same resolution
     * scripts/event-pricing.cjs §7b uses for `onConflict`.
     */
    const writesTo = (file, table, col) => writesColumn(read(file), table, col)

    /**
     * ⚠️ TWO SITES ARE ALLOWLISTED BY NAME, WITH REASONS. Naming them is the point: an unlisted third
     * one fails, which is exactly how `schedule-graphics-places.cjs` caught an edit silently
     * re-deriving a pitch.
     */
    const ALLOWED = new Map([
      ['lib/private-events/write.ts', 'THE writer — applyPrivacy / replacePrivateLink'],
      ['app/api/inbound-schedule/route.ts', 'the scraped INSERT, which SPREADS scrapedPrivacyFields() and names no column itself'],
    ])
    const files = walk('lib').concat(walk('app'), walk('components'))
    for (const col of ['is_private', 'private_name', 'private_token', 'private_link_ordering_override']) {
      const writers = files.filter(f => writesTo(f, 'truck_events', col))
      const unexpected = writers.filter(f => !ALLOWED.has(f))
      t(`⛔ truck_events.${col} is written in ONE place (${writers.length} site(s); unexpected: ${unexpected.join(', ') || 'none'})`,
        unexpected.length === 0)
    }
    t('🔴 …and the allowlist is not rotten — the writer still writes all four',
      ['is_private', 'private_name', 'private_token'].every(c => writesTo('lib/private-events/write.ts', 'truck_events', c)))
    /* ⛔ AND THE SCRAPED INSERT NAMES NO COLUMN ITSELF — it spreads the helper, so the DECISION stays
     * in one file and this proof stays exact. */
    t('⛔ the scraped insert names no privacy column directly — it spreads scrapedPrivacyFields()', (() => {
      const c = codeOf(read('app/api/inbound-schedule/route.ts'))
      return /\.\.\.scrapedPrivacyFields\(/.test(c) && !/\bis_private\s*:/.test(c)
    })())
    /* 🔴 AND THE PRIVATE TYPE'S OWN SWITCH HAS ONE WRITER TOO. */
    {
      const writers = files.filter(f => writesTo(f, 'event_types', 'private_link_ordering'))
      t(`⛔ event_types.private_link_ordering is written only by the route's one action (${writers.join(', ') || 'none'})`,
        writers.length === 1 && writers[0] === 'app/api/event-types/route.ts')
    }
    /* ⛔ AND THE TOKEN IS GENERATED IN ONE PLACE. `Math.random` cannot be spotted in the output, so
     * this is a source claim: nothing but the writer may put a non-null value in that column. */
    {
      const gens = files.filter(f => f !== 'lib/private-events/token.ts'
        && /newPrivateToken\(/.test(codeOf(read(f))))
      t(`⛔ newPrivateToken() is called only by the writer (${gens.join(', ') || 'none'})`,
        gens.length === 1 && gens[0] === 'lib/private-events/write.ts')
      t('⛔ …and nothing anywhere uses Math.random for a token',
        !files.some(f => /Math\.random[\s\S]{0,120}token/i.test(codeOf(read(f)))))
    }
  }

  /* ── 🔴 THE TRANSITIONS, RUN ──────────────────────────────────────────────────────────────── */
  {
    const W = NOW.write
    /* Public → private: a type, a name and a token, together. */
    {
      const f = baseFixture()
      f.truck_events[1].is_private = false
      const s = stub(f)
      const r = await W.applyPrivacy(s, TRUCK, EV_PUBLIC, { isPrivate: true, name: '  Hen do  ' })
      t('🔴 public → private: sets is_private, the Private type, the trimmed name and a NEW token',
        r.ok && r.isPrivate && r.typeId === TYPE_PRIVATE && r.name === 'Hen do' && !!r.token)
      const upd = s._writes.find(w => w.op === 'update' && w.table === 'truck_events')
      t('⛔ …in ONE update, so the four can never be half-written',
        !!upd && upd.row.is_private === true && upd.row.event_type_id === TYPE_PRIVATE
        && upd.row.private_name === 'Hen do' && typeof upd.row.private_token === 'string')
    }
    /* Private → public: the token is retired, the name and the type cleared. */
    {
      const s = stub(baseFixture())
      const r = await W.applyPrivacy(s, TRUCK, EV_PRIVATE, { isPrivate: false })
      t('🔴 private → public: clears is_private, the name, the token AND the type', (() => {
        const u = s._writes.find(w => w.op === 'update' && w.table === 'truck_events')
        return r.ok && !r.isPrivate && u && u.row.is_private === false && u.row.private_name === null
          && u.row.private_token === null && u.row.event_type_id === null
      })())
      t('⛔ …and RETIRES the token with reason "made_public", so the old link explains itself',
        s._writes.some(w => w.op === 'insert' && w.table === 'private_event_links'
          && w.row.token === TOKEN_LIVE && w.row.reason === 'made_public'))
    }
    /* ⛔ THE BYTE-IDENTITY BRANCH: public staying public writes NOTHING. */
    {
      const s = stub(baseFixture())
      const r = await W.applyPrivacy(s, TRUCK, EV_PUBLIC, { isPrivate: false })
      t('⛔ a PUBLIC event staying public writes NOTHING AT ALL — the branch every event takes today',
        r.ok && s._writes.length === 0)
    }
    /* 🔴 A SAVE THAT TOUCHES SOMETHING ELSE KEEPS THE TOKEN. Guests have it on paper. */
    {
      const s = stub(baseFixture())
      const r = await W.applyPrivacy(s, TRUCK, EV_PRIVATE, { isPrivate: true, name: 'Sarah & Tom’s wedding' })
      t('🔴 staying private KEEPS the existing token — re-rolling it would break every printed card',
        r.ok && r.token === TOKEN_LIVE)
    }
    /* The name's shape. */
    {
      t('🔴 a blank name is null, not ""  (the CHECK forbids "")', W.cleanPrivateName('   ') === null)
      t('🔴 …and a long one is capped at 80, trimmed', W.cleanPrivateName('x'.repeat(200)).length === 80)
      t('🔴 …and a non-string is null', W.cleanPrivateName(undefined) === null && W.cleanPrivateName(42) === null)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 6 · THE SCRAPER'S DETECTION, ON FIXTURES
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · "private" detection — whole word, case-insensitive, and nothing else')

  {
    const D = NOW.detect
    const YES = ['Private Hire', 'private event', 'PRIVATE PARTY', 'Private hire — no public access',
      'Event (private)', 'Closed for a private function', 'private']
    const NO = ['Privateer Brewery', 'privately owned', 'Privates', 'Wedding fair', 'A wedding',
      'The Private Shop'.replace('Private ', 'Privateer '), 'Deprivation Hall', '', null, undefined]
    for (const s of YES) t(`🔴 "${s}" → private`, D.looksPrivate(s) === true)
    for (const s of NO) t(`⛔ ${JSON.stringify(s)} → NOT private`, D.looksPrivate(s) === false)
    t('🔴 any of the fields can carry it (venue, title, notes)',
      D.looksPrivate(null, 'Five Bells', 'private booking') === true)
    t('⛔ "wedding" is NOT a trigger, by decision — a wedding fair is public trade',
      D.looksPrivate('Wedding fair', 'Sunday wedding market') === false)

    const W = NOW.write
    t('🔴 scrapedPrivacyFields returns the flag and nothing else',
      JSON.stringify(W.scrapedPrivacyFields('Private Hire')) === '{"is_private":true}'
      && JSON.stringify(W.scrapedPrivacyFields('Five Bells')) === '{"is_private":false}')
    t('⛔ …and NEVER a name — scraped text is not an operator\'s wedding name',
      !('private_name' in W.scrapedPrivacyFields('Private Hire')))

    /* ⛔ THE SCRAPED INSERT SETS VISIBILITY AND NOT THE TOKEN. Nobody has reviewed the event yet, and
     * issuing a live ordering link from a scraped guess would publish something no operator approved. */
    const src = codeOf(read('app/api/inbound-schedule/route.ts'))
    t('🔴 the scraped insert spreads scrapedPrivacyFields()', /\.\.\.scrapedPrivacyFields\(/.test(src))
    t('⛔ …and issues NO token and sets NO type at insert',
      !/private_token/.test(src) && !/event_type_id:\s*(?!null)/.test(src))
    t('⛔ …and there is NO BACKFILL anywhere in the migration — Gusto\'s six rows are untouched', (() => {
      const sql = read('supabase/migrations/20261014_private_events.sql')
      const body = sql.replace(/^--.*$/gm, '')
      return !/\bupdate\s+public\.truck_events\b/i.test(body) && !/\binsert\s+into\b/i.test(body)
    })())
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 7 · THE SCHEMA, AND THE 42P10 LESSON
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · the migration says what the code assumes — and nothing upserts a partial index')

  {
    const sql = read('supabase/migrations/20261014_private_events.sql')
    t('🔴 is_private is NOT NULL DEFAULT false — the fail-closed reasoning needs it non-nullable',
      /add column if not exists is_private boolean not null default false/.test(sql))
    t('🔴 kind is NOT NULL DEFAULT \'custom\', so no existing type changes meaning',
      /add column if not exists kind text not null default 'custom'/.test(sql))
    t('🔴 at most one private type per truck, as a PARTIAL unique index',
      /create unique index if not exists event_types_one_private_per_truck_uidx[\s\S]{0,120}where kind = 'private'/.test(sql))
    t('🔴 the token is UNIQUE across the table (resolved with no truck in hand)',
      /add constraint truck_events_private_token_key unique \(private_token\)/.test(sql))
    t('⛔ …and a token can only exist on a private event',
      /truck_events_private_token_needs_private check \(\s*private_token is null or is_private\s*\)/.test(sql))
    t('🔴 the name is trimmed and capped BY THE TABLE, not only by the handler',
      /length\(private_name\) between 1 and 80/.test(sql))
    t('🔴 the retired-token table exists, keyed on the token',
      /create table if not exists public\.private_event_links[\s\S]{0,400}token text primary key/.test(sql))
    t('⛔ …and is service-role only — a token is a secret after it stops working',
      /revoke all on public\.private_event_links from anon, authenticated/.test(sql))
    t('🔴 and PostgREST is told to reload', /notify pgrst, 'reload schema'/.test(sql))

    /* ══ ⛔ THE 42P10 LESSON, ENFORCED ═══════════════════════════════════════════════════════════
     * `event_types_one_private_per_truck_uidx` is PARTIAL. PostgREST's `on_conflict=` becomes
     * `ON CONFLICT (cols)` and conflict inference CANNOT target a partial index — that is the exact
     * error 20261013 was written to fix, and this index has the shape that caused it. */
    const typeSrc = codeOf(read('lib/private-events/type.ts'))
    t('⛔ the Private row is created with SELECT-then-INSERT, never an upsert',
      !/\.upsert\(/.test(typeSrc) && /\.insert\(/.test(typeSrc))
    t('⛔ …and 23505 is handled as the expected race, not as a fault',
      /23505/.test(read('lib/private-events/type.ts')) && /readPrivateType\(supabase, truckId\)/.test(typeSrc))
    t('⛔ …and NOTHING in lib/ or app/ upserts event_types at all', (() => {
      const hits = []
      for (const f of walk('lib').concat(walk('app'))) {
        const c = codeOf(read(f))
        /* The nearest preceding `.from('…')` names the table — the same resolution
         * scripts/event-pricing.cjs §7b uses. */
        const re = /\.from\('event_types'\)([\s\S]{0,400}?)(?=\.from\('|$)/g
        let m
        while ((m = re.exec(c))) if (/\.upsert\(/.test(m[1])) hits.push(f)
      }
      return hits.length === 0
    })())
    t('🔴 …and scripts/event-pricing.cjs §7b (the repository-wide onConflict guard) still exists',
      /ON CONFLICT targets are real, non-partial uniques/.test(read('scripts/event-pricing.cjs')))
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 8 · THE ROUTE'S REGISTRATIONS
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · /p/<token> is noindexed and rate-limited, like /o')

  {
    t('🔴 the route exists', exists('app/p/[token]/page.tsx'))
    const page = read('app/p/[token]/page.tsx')
    t('⛔ …and declares robots noindex, nofollow', /robots: \{ index: false, follow: false \}/.test(page))
    const vercel = JSON.parse(read('vercel.json'))
    const hdr = (vercel.headers || []).find(h => h.source === '/p/(.*)')
    t('⛔ …and vercel.json sends X-Robots-Tag noindex for /p/(.*)',
      !!hdr && hdr.headers.some(h => h.key === 'X-Robots-Tag' && /noindex/.test(h.value)))
    const proxy = read('proxy.ts')
    t('⛔ …and proxy.ts rate-limits BOTH the page and its endpoint — an unmetered public DB read is the /o/ regression',
      /p === '\/p' \|\| \/\^\\\/p\\\/\[\^\/\]\+\$\/\.test\(p\)/.test(proxy) && /p === '\/api\/private-event'/.test(proxy))
    t('🔴 the token resolves on the SERVER, before anything renders',
      /resolvePrivateLink\(admin\(\)/.test(page) && !/'use client'/.test(page))
    t('⛔ …and the guest endpoint never caches (a replaced link must die immediately)',
      /no-store/.test(read('app/api/private-event/route.ts')))
    t('⛔ …and publishes no location at all', (() => {
      const c = codeOf(read('app/api/private-event/route.ts'))
      return !/venue_name|postcode|latitude|longitude|\btown\b/.test(c)
    })())
    t('⛔ …and answers one refusal shape for every failure, so probing learns nothing',
      /\{ ok: false \}, \{ status: 404/.test(read('app/api/private-event/route.ts')))
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 9 · PLANS
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  head('9 · private events are Pro; making your own types stays Max')

  {
    const feat = read('lib/features.ts')
    t('🔴 `private_events` is a Feature', /\| 'private_events'/.test(feat))
    t('🔴 …and it is in PRO_FEATURES, which is exactly "Pro, Max and trial"',
      new RegExp("'private_events',[\\s\\S]{0,40}\\]\\s*\\n\\s*const MAX_FEATURES").test(feat)
      || feat.indexOf("'private_events',") < feat.indexOf('const MAX_FEATURES'))
    t('⛔ …and `event_types` is STILL Max-only',
      feat.indexOf("'event_types',") > feat.indexOf('const MAX_FEATURES'))

    const route = read('app/api/event-types/route.ts')
    t('🔴 the route has BOTH gates', /privateAllowed/.test(route) && /const allowed =/.test(route))
    t('⛔ …and the link/QR action is gated on the PRO one, not the Max one',
      /PRIVATE_ACTIONS = new Set\(\['set_private_link_ordering'\]\)/.test(route))
    t('⛔ …and `load` is open to EITHER key, so a Pro truck is not told to upgrade off its own feature',
      /READ_ACTIONS\.has\(action\) && !canWrite && !privateAllowed\(truck\)/.test(route))

    const manage = read('app/api/manage/route.ts')
    t("🔴 making an event private is gated server-side, not only in the UI",
      /canAccess\(truck\.plan, 'private_events'/.test(manage))
    t('⛔ …and MAKING ONE PUBLIC is NOT gated — a downgraded truck must never be stranded', (() => {
      const c = codeOf(manage)
      const i = c.indexOf('const wantPrivate = body.is_private === true')
      return i > 0 && /wantPrivate\s*\n?\s*&& !canAccess/.test(c.slice(i, i + 400))
    })())
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 10 · THE GRID, THE COPY, AND BYTE-IDENTITY
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  head('10 · the Private column is last and built-in; every word has one definition')

  {
    const ui = read('components/manage/EventTypes.tsx')
    const route = read('app/api/event-types/route.ts')
    /* ══ 🔴 REVERSED: PRIVATE IS **FIRST** AMONG THE TYPES (5 October 2026) ═════════════════════════
     * It was last. Dominic moved it to straight after Standard, and the reason is positional: last
     * meant its column moved from truck to truck depending on how many custom types they had made,
     * and on a six-type truck it sat off the right-hand edge behind a sideways scroll — the one column
     * nobody can create or delete, hardest to reach.
     * 🔴 STILL SORTED EXPLICITLY RATHER THAN LEFT TO `sort_order`, which is the part that did not
     * change: `sort_order` is the CUSTOM types' order, and a built-in competing for the same numbering
     * would be dragged about by Move left/right. */
    t('🔴 Private is sorted FIRST among the types — straight after Standard, explicitly',
      /const ap = a\.kind === 'private' \? 0 : 1/.test(route)
      && /const bp = b\.kind === 'private' \? 0 : 1/.test(route))
    /* ⛔ AND MOVE LEFT/RIGHT CANNOT REACH IT. The swap happens inside the CUSTOM list and Private's id
     * is never sent to `reorder`, so the built-in cannot be renumbered even by a forged request. */
    t('⛔ …and Move left/right reorders CUSTOM types among themselves, never Private',
      /const customs = types\.filter\(t => t\.kind !== 'private'\)/.test(ui)
      && /const ids = customs\.map\(t => t\.id\)/.test(ui)
      /* ⚠️ THE DISABLED STATES USE THE CUSTOM INDEX TOO — with Private at grid index 0, `i === 0`
       * would have disabled Move left on the first custom type one column too late. */
      && /customIndexOf\(t\.id\) === 0/.test(ui)
      && /customIndexOf\(t\.id\) === customCount - 1/.test(ui))
    t('⛔ …and its ⋯ menu offers ONLY Match Standard — no rename, move or delete',
      /\{t\.kind !== 'private' && \(/.test(ui) && (ui.match(/t\.kind !== 'private'/g) || []).length >= 2)
    t('🔴 …and it is drawn with a lock, not a colour dot', /t\.kind === 'private' \? \(/.test(ui))
    t('🔴 the ORDERING section exists and holds the one row no other type has',
      /k: 'section', id: 'sec-ordering', label: ORDERING_SECTION/.test(ui)
      && /k: 'private-link'/.test(ui))
    t("⛔ Standard's cell on that row is a STATEMENT, not a switch that could only be off",
      /data-private-link-standard/.test(ui) && /PRIVATE_LINK_STANDARD_CELL/.test(ui))
    t('⛔ …and the section is ABSENT, not disabled, when there is no Private type',
      /if \(privateType\) \{/.test(ui))
    t('🔴 the Pro truck gets a Max badge on "+ New event type" and the PRICES band',
      /!canTypes && canPrivate && <MaxBadge/.test(ui) && (ui.match(/<MaxBadge/g) || []).length >= 2)

    /* ── ⛔ EVERY WORD FROM lib/private-events/copy.ts ───────────────────────────────────────── */
    const COPY_STRINGS = [
      'Take orders by private link and QR code', 'Open to everyone', 'Make a new link',
      'Scan to order', 'Private event',
    ]
    /* ⚠️ `components/dashboard/ThisEventCard.tsx` IS GONE (5 October 2026) and the DASHBOARD PAGE has
     * taken its place in this list — the private title in the dark event bar, the `Manage event ▾`
     * link row and the two privacy confirms are all rendered there now. The claim is unchanged: no
     * screen re-types a word the copy module owns. */
    const screens = ['components/manage/EventTypes.tsx', 'components/manage/PrivateLinkPanel.tsx',
      'app/manage/[token]/page.tsx', 'app/dashboard/[token]/page.tsx', 'app/p/[token]/page.tsx']
    for (const str of COPY_STRINGS) {
      const typed = screens.filter(f => {
        const c = codeOf(read(f))
        return c.includes(`'${str}'`) || c.includes(`"${str}"`)
      })
      t(`⛔ no screen re-types "${str}" (${typed.join(', ') || 'none'})`, typed.length === 0)
    }
    t('🔴 …and the copy module defines them all',
      COPY_STRINGS.every(s2 => read('lib/private-events/copy.ts').includes(s2)))
  }

  /* ── 🔴 BYTE-IDENTITY: A TRUCK WITH NO PRIVATE EVENTS IS UNTOUCHED ───────────────────────────
   * Every public feed's PRE-EXISTING select is unchanged, so the rows it fetches are the same rows;
   * the privacy probe is a SEPARATE read that returns an empty set for such a truck, and an empty set
   * removes nothing and redacts nothing. That is the argument, and here is the evidence. */
  {
    const UNCHANGED_SELECTS = [
      ['app/api/events/route.ts', "'id, event_date, start_time, end_time, venue_name, town, postcode, notes, status, opened_at, van_id'"],
      ['app/api/embed/events/route.ts', "'id, event_date, start_time, end_time, venue_name, town, postcode, notes, status'"],
    ]
    for (const [f, sel] of UNCHANGED_SELECTS) {
      const before = gitShow(BEFORE_REF, f)
      const now = read(f)
      t(`🔴 ${f}: the pre-existing event select is BYTE-IDENTICAL to ${BEFORE_REF}`,
        !!before && before.includes(sel) && now.includes(sel))
    }
    /* ⛔ AND THE MENU API'S AUTO-DETECT QUERY IS UNCHANGED — only a discard was added after it. */
    {
      const f = 'app/api/menu/[truckId]/route.ts'
      const before = gitShow(BEFORE_REF, f)
      const now = read(f)
      const q = `.eq('truck_id', truck.id)\n      .in('status', ['open', 'confirmed'])`
      t('⛔ the menu auto-detect QUERY is unchanged — a private pick is discarded after it, not filtered in it',
        !!before && before.includes(q) && now.includes(q)
        && /if \(effectiveEventId && await isEventPrivate\(/.test(now))
    }
    /* 🔴 AND NOTHING WAS ADDED TO `TYPE_COLS`, which also feeds the SERVICE resolver. */
    {
      const f = 'lib/event-types/read.ts'
      const before = gitShow(BEFORE_REF, f)
      const beforeCols = (before || '').match(/const TYPE_COLS = '([^']*)'/)
      const nowCols = read(f).match(/const TYPE_COLS = '([^']*)'/)
      t('⛔ TYPE_COLS is UNCHANGED — one missing `kind` there would take the collection grid down with it',
        !!beforeCols && !!nowCols && beforeCols[1] === nowCols[1]
        && !nowCols[1].includes('kind'))
      t('🔴 …and `kind` comes from its own probed read instead',
        /export async function readTypeKinds/.test(read('lib/private-events/type.ts')))
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 11 · THE LAZY PRIVATE TYPE
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  head('11 · the Private type is created once, race-safe, and adopts a pre-existing "Private"')

  {
    const T = NOW.type
    {
      const f = baseFixture()
      const got = await T.ensurePrivateType(stub(f), TRUCK)
      t('🔴 an existing Private type is returned, not duplicated', got && got.id === TYPE_PRIVATE)
    }
    {
      const f = baseFixture()
      f.event_types = [f.event_types[0]]   // Market only
      const s = stub(f)
      const got = await T.ensurePrivateType(s, TRUCK, { order_ready: true })
      t('🔴 a truck with no Private type gets one, named "Private", kind private',
        !!got && s._writes.some(w => w.op === 'insert' && w.table === 'event_types'
          && w.row.kind === 'private' && w.row.name === 'Private'))
      t('🔴 …seeded with Van 1\'s resolved values, like any new type',
        s._writes.some(w => w.op === 'insert' && w.row.order_ready === true))
      t('🔴 …and with sort_order past every custom type',
        s._writes.some(w => w.op === 'insert' && w.row.sort_order === 1))
    }
    {
      /* ⛔ THE ADOPTION CASE. `event_types_truck_name_uidx` is unique on (truck_id, lower(name)), so a
       * truck that had already made a CUSTOM type called "Private" would fail the insert on the NAME
       * index — and two columns headed "Private" would be indistinguishable anyway. */
      const f = baseFixture()
      f.event_types = [{ id: 'own-private', truck_id: TRUCK, name: 'Private', kind: 'custom', sort_order: 0, private_link_ordering: true }]
      const s = stub(f)
      const got = await T.ensurePrivateType(s, TRUCK)
      t('⛔ a pre-existing CUSTOM type called "Private" is ADOPTED, not duplicated',
        !!got && s._writes.some(w => w.op === 'update' && w.table === 'event_types' && w.row.kind === 'private')
        && !s._writes.some(w => w.op === 'insert' && w.table === 'event_types'))
    }
    {
      const got = await T.ensurePrivateType(stub(baseFixture(), { fail: ['event_types'] }), TRUCK)
      t('🔴 a missing migration returns null rather than throwing — the grid must still render', got === null)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 11b · ONE EVENT-TYPE CONTROL, WITH PRIVATE AS ONE OF ITS CHOICES
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  head('11b · one control for one fact — Add, Edit, the approval card, the dashboard')

  {
    const ui = read('components/manage/EventTypes.tsx')
    const page = read('app/manage/[token]/page.tsx')
    /* ⛔ `components/dashboard/ThisEventCard.tsx` IS DELETED. Everything this section asserted about
     * the card's private rows is now about the DASHBOARD PAGE: the title in the dark event bar, the
     * `Manage event ▾` link row, and the type picker's two privacy confirms. */
    const dash = read('app/dashboard/[token]/page.tsx')

    /* ══ ⛔ THE BUG THIS SECTION EXISTS FOR ═══════════════════════════════════════════════════════
     * Add event had TWO controls for one fact: an "Event type" dropdown offering "Private" AND a
     * separate "Private event" tick. The SAVE read the tick, so choosing Private from the dropdown
     * produced a PUBLIC event carrying the Private type — silently, with the address on the map.
     * 🔴 ONE CONTROL OWNS IT NOW, and these assertions are what stop a second one appearing. */
    t('⛔ the separate "Private event" tick is GONE from the form',
      !/PRIVATE_TICK_LABEL/.test(codeOf(page)))
    /* ══ 🔴 WIDENED BACK TO THE WHOLE FILE (5 October 2026) ══════════════════════════════════════
     * This used to be SCOPED to `EventTypeSelect`, because the file still contained one
     * `<option value="">Standard</option>` inside `EventTypeDashboardControl` — the standalone
     * live-event control the "This event" card replaced, exported and mounted nowhere. The scope was
     * recorded at the time as a tolerated exception, not a weakening, and deleting the component was
     * left as a separate decision because it was the only way back if the card had to be rolled back.
     * ⛔ THAT COMPONENT IS NOW DELETED, so the exception has nothing left to cover and the assertion
     * is the one actually worth making: NO native dropdown anywhere in this module. A scoped check
     * would pass again the moment a second dead `<select>` were added outside the scope. */
    t('⛔ …and there is NO native dropdown anywhere in the event-types module', (() => {
      const code = codeOf(ui)
      return code.length > 2000 && !/<select/.test(code) && !/<option/.test(code)
    })())
    /* ⛔ AND THE DEAD CONTROL IS ASSERTED GONE, by name, in both halves of the file. A deletion that
     * is only checked by "no <select>" would be undone by a rewrite that used the shared `Select`. */
    t('⛔ `EventTypeDashboardControl` and its `OwnSettings` prop type are deleted, not re-exported',
      !/export function EventTypeDashboardControl/.test(ui)
      && !/export interface OwnSettings/.test(ui))
    t('🔴 the control is a PILL ROW, exactly one selected',
      /role="radiogroup"/.test(ui) && /data-event-type-pills/.test(ui)
      && /role="radio"/.test(ui) && /aria-checked=\{on\}/.test(ui))
    t('🔴 …Standard first, then Private, then the custom types in the grid\'s order', (() => {
      const row = ui.slice(ui.indexOf('data-event-type-pills'), ui.indexOf('data-event-type-pills') + 900)
      const std = row.indexOf("pill('standard'")
      const priv = row.indexOf('privateType && pill(')
      const cust = row.indexOf('customTypes.map(')
      return std > 0 && priv > std && cust > priv
    })())
    t('⛔ …and the field is drawn even for a truck with NO custom types, because Private is always a choice',
      /if \(!ready\) return null/.test(ui) && !/if \(!ready \|\| types\.length === 0\) return null/.test(ui))

    /* 🔴 SELECTING PRIVATE OPENS THE PANEL; SELECTING ANYTHING ELSE CLOSES IT. */
    t('🔴 the purple panel is gated on the Private pill being selected',
      /\{privateChosen && \(/.test(ui) && /data-private-panel/.test(ui))
    t('⛔ …and the two sentences are ONE BLOCK, above the name field (Dominic, 5 October)', (() => {
      const panel = ui.slice(ui.indexOf('data-private-panel'), ui.indexOf('data-private-panel') + 1400)
      const help = panel.indexOf('PRIVATE_TICK_HELP')
      const promise = panel.indexOf('PRIVATE_LINK_PROMISE')
      const name = panel.indexOf('PRIVATE_NAME_LABEL')
      return help > 0 && promise > help && name > promise
    })())

    /* ══ ⛔ THE SAVE CANNOT PRODUCE `is_private` WITHOUT THE PRIVATE TYPE, OR THE REVERSE ═══════════
     * Both are derived from ONE value — the selected pill — so they cannot disagree. The server then
     * writes the four coupled columns through `applyPrivacy`, which is the only writer. */
    t('⛔ Add/Edit derives `is_private` from the SELECTED PILL, not from a separate control',
      /const chosenPrivate = !!privateTypeId && eventTypeId === privateTypeId/.test(page)
      && /is_private: chosenPrivate/.test(page))
    t('⛔ …and sends NO type for a private event — the server sets it through the one writer',
      /event_type_id: chosenPrivate \? null : eventTypeId/.test(page))
    t('⛔ …and the name is only sent when Private is chosen',
      /private_name: chosenPrivate \? \(editingEvent\.private_name \?\? ''\) : ''/.test(page))

    /* 🔴 THE §7 REGRESSION: EDIT MUST NOT PUBLISH A PRIVATE EVENT. Two halves — the form carries
     * `private_name`, and the PILL is seeded from the event. Both are needed: with the pill unseeded,
     * Edit would show Standard and the save would derive `is_private: false`. */
    t('🔴 every Edit path seeds the pill from the event', (() => {
      const seeds = (codeOf(page).match(/seedTypePill\(/g) || []).length
      const forms = (codeOf(page).match(/editFormFor\(/g) || []).length
      /* ⚠️ ONE `seedTypePill` PER `editFormFor`, PLUS THE DEFINITION OF EACH. */
      return seeds >= 2 && seeds === forms
    })())
    t('⛔ …and a PRIVATE event selects the Private pill even with no event_type_id — the scraped case',
      /ev\.is_private === true && privateTypeId/.test(page))
    t('⛔ …and `openForFix` (the scraped-approval path) uses the SHARED builder, not a fourth inline one',
      /setEditingEvent\(editFormFor\(ev\)\)/.test(page)
      && !/setEditingEvent\(\{ id: ev\.id, venue_name: ev\.venue_name/.test(page))

    /* 🔴 THE APPROVAL CARD USES THE SAME CONTROL, and its confirm goes through the one writer. */
    t('🔴 the approval card renders the SAME `<EventTypeSelect>`',
      /\{pending && !isPast && \(/.test(page) && /<EventTypeSelect token=\{token\} venueName=\{event\.venue_name\}/.test(page))
    t('⛔ …and the confirm sends what the pill shows, through `applyPrivacy`',
      /const confirmPrivate = !!evForPrivacy && !!privateTypeId/.test(page)
      && /is_private: confirmPrivate/.test(page))
    t('⛔ …and shows the missing-times prompt when Private is selected with no times',
      /PRIVATE_NEEDS_TIMES/.test(page))

    /* 🔴 THE DASHBOARD'S TWO CONFIRMS, both directions, with words about what the PUBLIC sees.
     * ⚠️ RE-AIMED AT THE PAGE (5 October 2026) — they are in the type picker behind `Manage event ▾`
     * now. The sentences and the rule that decides when each shows are unchanged. */
    t('🔴 switching TO private confirms, and the sentence is about the map and the link',
      /CONFIRM_TO_PRIVATE/.test(dash)
      && /This hides the address and the event from the map/.test(read('lib/private-events/copy.ts')))
    t('🔴 switching FROM private confirms, and names the link stopping',
      /CONFIRM_FROM_PRIVATE/.test(dash)
      && /the private link will stop working/.test(read('lib/private-events/copy.ts')))
    t('⛔ …and neither shows on a switch that does not cross the privacy line',
      /const toPrivate=typePending!==undefined&&targetIsPrivate&&!eventIsPrivate/.test(dash)
      && /const fromPrivate=typePending!==undefined&&!targetIsPrivate&&eventIsPrivate/.test(dash))
    t('⛔ …and the crossing is decided from `is_private`, never from the current type\'s kind',
      /const eventIsPrivate=\(activeEvent as \{is_private\?:boolean\|null\}\|null\)\?\.is_private===true/.test(dash)
      /* ⛔ ONE DERIVATION, READ BY EVERY PRIVATE SURFACE ON THE PAGE. A second expression for this was
       * in the file for an hour during this build and is exactly the kind that drifts. */
      && (codeOf(dash).match(/\?\.is_private===true/g) || []).length === 1)
    t('🔴 and the Link & QR row shows ONLY for a private event',
      /onPrivateLink=\{eventIsPrivate\?/.test(dash)
      && /Private link &amp; QR code/.test(read('components/shared/EventActionsModal.tsx')))

    /* ══ 🔴 THE DARK EVENT BAR'S TITLE IS THE EVENT'S **NAME**, NEVER ITS VENUE (Dominic, 5 Oct) ════
     * ⛔ THE VENUE IS NOT RENDERED AT ALL in the private arm — not greyed, not in a title attribute.
     * That bar is on every tab of the dashboard, in a van, in public, and a private event's address is
     * the one thing this whole feature exists to keep off a screen.
     * 🔴 AND THE SEPARATE LOCK LABEL BESIDE Live / Not started IS GONE for a private event, because
     * the title says it. A custom type keeps its label there; its title is still the venue. */
    t('🔴 a private event\'s title is 🔒 + its name + "Private event", with NO venue', (() => {
      const code = codeOf(dash)
      const a = code.indexOf('{eventIsPrivate?(<>')
      if (a < 0) return false
      const arm = code.slice(a, code.indexOf('):(<>', a))
      return arm.length > 80
        && /\{PRIVATE_PUBLIC_NAME\}/.test(arm)
        && /\{privateName/.test(arm)
        && /text-purple-300/.test(arm)
        /* ⛔ NO VENUE, NO TOWN, NO `fmtVenue` IN THE PRIVATE ARM. */
        && !/venue_name|fmtVenue|\btown\b/.test(arm)
    })())
    t('⛔ …and the type label beside Live returns null for a private event', (() => {
      const code = codeOf(dash)
      const fn = code.slice(code.indexOf('const headerEventType=(()=>{'), code.indexOf('const[typePicker,'))
      return fn.length > 100 && /if\(eventIsPrivate\)return null/.test(fn)
    })())
    t('⚠️ …and the name comes from `privateDisplayName`, the ONE formatter',
      /import \{ privateDisplayName \} from '@\/lib\/private-events\/resolve'/.test(dash)
      && /privateDisplayName\(\(activeEvent as \{private_name\?:string\|null\}\|null\)\?\.private_name\)/.test(dash))
    /* ⛔ AND "Order link" / "QR code" GIVE THE PRIVATE LINK, NEVER THE PUBLIC ONE — and nothing at all
     * if the token cannot be read. Falling back is how a private event's guests reach a public page. */
    t('⛔ the header\'s Order link and QR use the PRIVATE link, with no fallback',
      /const customerOrderUrl = eventIsPrivate \? privateOrderUrl : publicOrderUrl/.test(dash)
      && !/privateOrderUrl *\?\? *publicOrderUrl/.test(dash))

    /* ⚠️ A PRO TRUCK SEES STANDARD AND PRIVATE ONLY — the pill row is filtered by the route's own
     * `canTypes`/`canPrivate`, which is why the LIST it receives is already correct. */
    t('⚠️ the route reports both gates separately, so Pro gets Standard + Private only',
      /canPrivate: privateAllowed\(truck\)/.test(read('app/api/event-types/route.ts'))
      && /canTypes: canWrite/.test(read('app/api/event-types/route.ts')))

    /* ⛔ AND THE FORM'S LAST NATIVE SELECTS ARE GONE — WebKit renders one at 23px (§65). */
    /* ⛔ WEBKIT RENDERS A NATIVE `<select>` AT 23px WHATEVER ITS PADDING SAYS (§65), so these were
     * half the height of every field around them on an iPad. The component is `EventTimeSelect`. */
    /* ⚠️ COMMENT-STRIPPED. The note explaining the swap QUOTES `<select>`, and a check that reads raw
     * source cannot tell a tag from a note about a tag — the third time this has bitten in this build,
     * which is why `codeOf` is the rule for every source-text claim here. */
    t('⛔ the time boxes use the shared Select, not a native dropdown', (() => {
      const c = codeOf(page)
      const fn = c.slice(c.indexOf('function EventTimeSelect'), c.indexOf('function EventTimeSelect') + 2200)
      return fn.length > 400 && !/<select/.test(fn) && /<Select\b/.test(fn)
    })())
    t('⛔ …and so does the Van field',
      /<Select\s*\n\s*ariaLabel="Van"/.test(page)
      && !/<select\s*\n\s*value=\{editingEvent\.van_id/.test(page))
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 12 · THE VARIANTS — EVERY CHECK ABOVE MUST ACTUALLY BITE
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  head('12 · variants: break it on purpose, and the check above must catch it')

  /**
   * ── 🔴 WHY THIS SECTION EXISTS, AND WHAT IT CAUGHT LAST TIME ─────────────────────────────────────
   * A check that cannot fail is a check that is not checking. On 5 October 2026 `event-types.cjs`'s
   * V29 reported **"MUST FAIL BUT PASSED"** for exactly that reason: it mutated a LITERAL call site,
   * the source had moved on, and `String.replace` of an absent needle returns the string unchanged —
   * so the variant mutated nothing and the predicate still held.
   *
   * ⛔ SO EVERY NEEDLE HERE IS ASSERTED TO EXIST BEFORE IT IS USED. `mutate` returns null when the
   * needle is absent and `must` reports that as a FAILURE, not as a pass. A variant that stops
   * mutating is the one bug this section cannot be allowed to have.
   */
  let vPass = 0, vFail = 0
  const must = (label, detected) => {
    if (detected) { vPass++; console.log('  ✓ CAUGHT as required  ' + label) }
    else { vFail++; fail++; console.log('  🔴 MUST BE CAUGHT BUT WAS NOT  ' + label) }
  }
  /** Replace `from` with `to` in a file's text, or return null if the needle is not there. */
  const mutate = (file, from, to) => {
    const src = read(file)
    if (!src.includes(from)) return null
    return src.replace(from, to)
  }

  /* ── V1 · A PUBLIC SURFACE STOPS CONSULTING THE PRIVACY READ ─────────────────────────────────── */
  for (const s of SURFACES) {
    const broken = mutate(s.file, "from '@/lib/private-events/read'", "from '@/lib/private-events/resolve'")
    must(`V1 ⛔ ${s.file} stops importing the privacy read`,
      broken !== null && !/from '@\/lib\/private-events\/read'/.test(codeOf(broken)))
  }

  /* ── V2 · THE DEDUP KEY IS BUILT **AFTER** THE SUBSTITUTION ──────────────────────────────────
   * The defect: two private bookings in one evening collapse to the key `date|Private event|`, and
   * the second is silently dropped as a duplicate — the feed publishes one of them.
   * ⛔ THE VARIANT SWAPS THE TWO STATEMENTS by index rather than by rewriting either literal, so it
   * cannot stop mutating when the text around them changes. */
  {
    const src = read('app/api/events/route.ts')
    const keyMark = 'const key = `${e.event_date}|${e.venue_name'
    const subMark = 'isPrivate ? PRIVATE_PUBLIC_LABEL'
    const keyAt = src.indexOf(keyMark)
    const subAt = src.indexOf(subMark)
    /* Cut the key statement out and paste it AFTER the substitution line — the broken order.
     * ⚠️ AFTER the line, not before it: pasting it in front of `subMark` leaves the original order
     * intact and the variant mutates nothing detectable, which is how the first attempt at this
     * variant reported "MUST BE CAUGHT BUT WAS NOT" against correct code. */
    const broken = (keyAt > 0 && subAt > keyAt)
      ? (() => {
          const lineEnd = src.indexOf('\n', keyAt)
          const stmt = src.slice(keyAt, lineEnd).trim()
          const without = src.slice(0, keyAt) + src.slice(lineEnd + 1)
          const at = without.indexOf(subMark)
          const afterSubLine = without.indexOf('\n', at) + 1
          return without.slice(0, afterSubLine) + '      ' + stmt + '\n' + without.slice(afterSubLine)
        })()
      : null
    must('V2 🔴 the dedup key being built AFTER the substitution is caught by the order assertion',
      broken !== null
      && broken.indexOf(keyMark) > broken.indexOf(subMark))
  }

  /* ── V3 · THE PRIVACY READ FAILS **OPEN** ─────────────────────────────────────────────────────
   * The worst single change anyone could make to this feature. */
  {
    const broken = mutate('lib/private-events/read.ts',
      'const ALL: PrivacyRead = { ok: false, ids: new Set(), isPrivate: () => true }',
      'const ALL: PrivacyRead = { ok: false, ids: new Set(), isPrivate: () => false }')
    must('V3 ⛔ the failed-probe state answers FALSE — i.e. fails OPEN and publishes a wedding',
      broken !== null
      && /isPrivate: \(\) => false/.test(broken)
      && !/const ALL: PrivacyRead = \{ ok: false, ids: new Set\(\), isPrivate: \(\) => true \}/.test(broken))
  }

  /* ── V4 · THE SUBMIT GATE MOVES **AFTER** THE PRICE BOOK ─────────────────────────────────────
   * A refused order would already have consumed stock and reached the money path. */
  {
    const f = 'app/api/orders/submit/route.ts'
    const src = read(f)
    const gateAt = codeOf(src).indexOf('tokenAdmitsOrder(')
    const bookAt = codeOf(src).indexOf('loadEventPriceBook(')
    must('V4 ⛔ the token gate running AFTER the price book is detectable by order',
      gateAt > 0 && bookAt > 0 && gateAt < bookAt)
  }

  /* ── V5 · THE GATE TRUSTS THE TOKEN WITHOUT PAIRING IT TO THE EVENT ─────────────────────────
   * A guest at one wedding could order against another. */
  {
    const broken = mutate('lib/private-events/read.ts',
      "    .eq('id', eventId)\n    .eq('private_token', token)",
      "    .eq('private_token', token)")
    must('V5 ⛔ the order gate stops matching the EVENT ID alongside the token',
      broken !== null && !/\.eq\('id', eventId\)\s*\n\s*\.eq\('private_token', token\)/.test(broken))
  }

  /* ── V6 · `redactPrivate` BECOMES A BLACKLIST (`delete`) INSTEAD OF A WHITELIST ──────────────
   * Correct today, wrong the first time a sixth location column is added. */
  {
    const src = read('lib/private-events/resolve.ts')
    must('V6 ⛔ the redaction is a built object, not a set of deletes',
      /return \{\s*\n\s*\.\.\.e,/.test(src) && !/delete \(?e/.test(codeOf(src)))
  }

  /* ── V7 · THE PRIVATE TYPE IS UPSERTED ONTO ITS PARTIAL UNIQUE INDEX (42P10) ─────────────────
   * The exact error 20261013 was written to fix, re-introduced on an index with the same shape. */
  {
    const broken = mutate('lib/private-events/type.ts', '.insert({', ".upsert({ onConflict: 'truck_id' }, {")
    must('V7 ⛔ an upsert appearing in the Private type creator is caught',
      broken !== null && /\.upsert\(/.test(codeOf(broken)))
  }

  /* ── V8 · "Make a new link" STOPS RETIRING THE OLD TOKEN ─────────────────────────────────────
   * Every printed QR code then 404s instead of saying who replaced it. */
  {
    const W = NOW.write
    const f = baseFixture()
    const s = stub(f)
    await W.replacePrivateLink(s, TRUCK, EV_PRIVATE)
    const retired = s._writes.some(w => w.op === 'insert' && w.table === 'private_event_links')
    must('V8 ⛔ a replace that did NOT record the retired token would be caught', retired === true)
  }

  /* ── V9 · THE SCRAPER STARTS TREATING "wedding" AS PRIVATE ───────────────────────────────────
   * Hiding public trade, which is the failure the narrow rule exists to avoid. */
  {
    const D = NOW.detect
    must('V9 ⛔ "Wedding fair" being marked private would be caught',
      D.looksPrivate('Wedding fair') === false)
    must('V9b ⛔ …and so would "Privateer Brewery" (a substring match instead of a whole word)',
      D.looksPrivate('Privateer Brewery') === false)
  }

  /* ── V10 · THE PRO GATE IS APPLIED TO MAKING AN EVENT **PUBLIC** ─────────────────────────────
   * A downgraded truck would be unable to unpublish a wedding — stranded in the one direction that
   * must always be available. */
  {
    const c = codeOf(read('app/api/manage/route.ts'))
    const i = c.indexOf('const wantPrivate = body.is_private === true')
    must('V10 ⛔ gating the PUBLIC direction would be caught',
      i > 0 && /wantPrivate\s*\n?\s*&& !canAccess/.test(c.slice(i, i + 400)))
  }

  /* ── V11 · `kind` IS ADDED TO `TYPE_COLS` ────────────────────────────────────────────────────
   * One missing column there fails the SERVICE resolver's select and takes collection times, the
   * mark-ready step and offline protection down with it — a privacy migration breaking the hatch. */
  {
    const broken = mutate('lib/event-types/read.ts',
      "offline_auto_reject_mins'", "offline_auto_reject_mins, kind'")
    must('V11 ⛔ `kind` creeping into TYPE_COLS is caught',
      broken !== null && /const TYPE_COLS = '[^']*\bkind\b/.test(broken))
  }

  /* ── V12 · /p/<token> LOSES ITS RATE-LIMIT REGISTRATION ──────────────────────────────────────
   * An unmetered public database read keyed on a string anyone can vary — the `/o/` regression. */
  {
    const broken = mutate('proxy.ts', "p === '/p' ||", "false ||")
    must('V12 ⛔ removing /p from the rate-limited scope is caught',
      broken !== null && !/p === '\/p' \|\|/.test(broken))
  }

  /* ── V13 · THE GUEST ENDPOINT STARTS PUBLISHING A LOCATION ───────────────────────────────────
   * It is reachable by anyone the link was forwarded to. */
  {
    const broken = mutate('app/api/private-event/route.ts',
      '    status: outcome.event.status || \'\',',
      '    status: outcome.event.status || \'\',\n    town: (outcome.event as never as { town?: string }).town ?? null,')
    must('V13 ⛔ a location field appearing in the guest payload is caught',
      broken !== null && /\btown\b/.test(codeOf(broken)))
  }

  /* ── V14 · A SECOND WRITER OF `is_private` APPEARS ───────────────────────────────────────────
   * Four coupled columns with two doors is how a private event ends up with no link, or a public one
   * with a live link. */
  {
    const broken = mutate('app/api/events/action/route.ts',
      "      .update({\n        status: 'confirmed',",
      "      .update({\n        is_private: false,\n        status: 'confirmed',")
    must('V14 ⛔ a second writer of is_private on truck_events is caught',
      broken !== null && writesColumn(broken, 'truck_events', 'is_private'))
  }

  /* ── V15 · THE EDIT FORM STOPS CARRYING `is_private` ─────────────────────────────────────────
   * 🔴 THE REAL DEFECT THIS BUILD FOUND AND FIXED. The three Edit buttons each built the form's
   * initial state inline. The save sends an EXPLICIT `is_private` — it must, or unticking would be a
   * no-op — so a builder that omitted it seeded the form as "not private", and an operator opening
   * Edit on a wedding to fix a typo in the time would have PUBLISHED ITS ADDRESS on Save, silently.
   * Three copies meant three chances to miss it; there is now one. */
  {
    const page = read('app/manage/[token]/page.tsx')
    const c = codeOf(page)
    must('V15 ⛔ an Edit button building the form WITHOUT is_private is caught', (() => {
      /* The real file must have exactly ONE builder, and it must carry the flag. */
      const builders = (c.match(/const editFormFor = \(event: TruckEvent\): EditingEvent =>/g) || []).length
      const carries = /is_private: event\.is_private === true/.test(c)
      const inlineLeft = (c.match(/setEditingEvent\(\{ id: event\.id, venue_name: event\.venue_name/g) || []).length
      return builders === 1 && carries && inlineLeft === 0
    })())
    const broken = mutate('app/manage/[token]/page.tsx',
      'is_private: event.is_private === true,', '')
    must('V15b ⛔ …and removing the flag from the one builder is caught',
      broken !== null && !/is_private: event\.is_private === true/.test(broken))
  }

  console.log('')
  console.log(`  ${vPass + vFail} variants · ${vPass} caught as required · ${vFail} missed`)

  // ── SUMMARY ────────────────────────────────────────────────────────────────────────────────────
  console.log('')
  if (fail === 0) console.log(`✅ all ${pass} passed`)
  else console.log(`🔴 ${fail} CHECK(S) FAILED  (${pass} passed)`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('\n🔴 the harness threw:', e); process.exit(1) })

/** Every .ts/.tsx under a directory, excluding node_modules and .next. */
function walk(dir) {
  const out = []
  const go = (d) => {
    let entries
    try { entries = fs.readdirSync(path.join(REPO, d), { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const rel = `${d}/${e.name}`
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') go(rel) }
      else if (/\.tsx?$/.test(e.name)) out.push(rel)
    }
  }
  go(dir)
  return out
}
