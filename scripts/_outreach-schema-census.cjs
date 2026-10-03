// scripts/_outreach-schema-census.cjs — every column the code NAMES, against every column the
// migrations DECLARE. A shared module: it parses and reports, and asserts nothing. The harness that
// asserts on it is scripts/outreach-schema-census.cjs.
//
// ── 🔴 WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────
// On 1 October 2026 the recorded-steps build widened the send route's `outreach_messages` select to
// name `preview`. THERE IS NO SUCH COLUMN — the first few lines of an email are DERIVED, by
// `previewOf(text_body)`. PostgREST answers an unknown column with 42703 for the whole query, so from
// that build on every real send hit the route's "I could not read this prospect's sent emails" refusal
// and nothing went out. 🧪 3Bros Burgers, 2 October. It had already happened once, three weeks
// earlier and one table over: `outreach_contacts.email_message_id`, also not a column, which emptied
// the ladder and logged a Chase 1 as a second first contact (🧪 Smother Spudders).
//
// 🔴 EVERY HARNESS PASSED BOTH TIMES, AND THAT IS THE DEFECT THIS MODULE IS ABOUT. A harness builds
// its rows in JavaScript, so a fixture has whatever property the code asks it for: `m.preview` is
// `undefined` rather than an error, the pairing simply finds no opening words, and the suite is green.
// NOTHING IN THE TREE COMPARED A SELECT AGAINST THE SCHEMA. A fixture cannot; only the migrations can.
//
// ── WHAT IT READS ─────────────────────────────────────────────────────────────────────────────────
//   DECLARED: supabase/migrations/*.sql — `create table` bodies and `add column` clauses.
//   NAMED:    app/, lib/, components/ — every .select / .insert / .update / .upsert / .eq / .order /
//             .in / .not / … on one of the census tables, read off the TypeScript AST rather than
//             with a regular expression, so a chain that spans ten lines is one chain.
//
// ── 🔴 THE TWO RULES THAT MAKE IT WORTH HAVING ────────────────────────────────────────────────────
//   1. A SELECT IT CANNOT PARSE IS A FAILURE, NOT A SKIP. The whole value of this check is that it
//      sees every select; one it quietly gives up on is the one the next `preview` hides in. An
//      argument that is not a literal must either resolve (a const, a template, a ternary — the
//      capability-probe idiom this codebase uses everywhere) or be named in `WAIVED` below with the
//      columns it can contribute, which are then checked like any others.
//   2. A COLUMN INSIDE AN EMBED BELONGS TO THE OTHER TABLE. `truck:discovery_trucks!fk (name, …)`
//      names `discovery_trucks` columns, and checking them against `outreach_prospects` would be
//      noise. Embeds are stripped, parens balanced, before anything is split on a comma.
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const REPO = path.resolve(__dirname, '..')

/**
 * The tables this census covers. Everything else in the schema is out of scope on purpose.
 *
 * 🔴 A TABLE MAY ONLY BE ADDED HERE IF `supabase/migrations/` CONTAINS ITS `create table`. Most of this
 * schema predates the migrations directory — `trucks`, `truck_events` and `venues` have no create
 * statement in it — so adding one of those would report every column it names as missing and make the
 * census noise rather than a check. The six outreach tables qualify; so do the two schedule-graphics
 * tables, which were created BY a migration on 3 October 2026 and are therefore fully described there.
 * ⚠️ THE MODULE'S NAME IS NOW NARROWER THAN ITS CONTENTS. Renaming it is a separate change — it is
 * required by two harnesses and named in two reports.
 */
const TABLES = [
  'outreach_messages', 'outreach_contacts', 'outreach_events',
  'outreach_prospects', 'outreach_settings', 'outreach_sequence_slots',
  // Schedule › Places (supabase/migrations/20261003_truck_places.sql + 20261004_…_stage2.sql). Added
  // at creation rather than later, so the feature has never had a column named in a select that does
  // not exist. ⚠️ `truck_place_groups` WAS HERE AND IS GONE — stage 2 drops the table with the
  // Facebook-groups feature, and a censused table that no longer exists is a check with no subject.
  'truck_places',
  /* Per-van category capacity settings (supabase/migrations/20261005_van_category_settings.sql).
   * Added at creation, like truck_places, so the feature can never name a column that does not exist
   * — which on this table would mean the capacity engine reading undefined prep times. */
  'van_category_settings',
  /* The weekly post's design (supabase/migrations/20261006_truck_post_designs.sql) and the
   * single-event post's per-event background (20261007_event_post_backgrounds.sql). Both are created
   * by a migration, so the census can describe them fully.
   * ⚠️ `truck_post_designs` WAS NOT ADDED AT CREATION, and that was recorded as a deliberate deferral
   * in docs/weekly-post-stage1-report.md §9.2 — "the table is brand new and the feature's columns may
   * still move". Stage 2 moved one (`kind` gained a value) and added none, so it is settled enough to
   * censue now, which is what the stage 1 note said to wait for. */
  'truck_post_designs',
  'event_post_backgrounds',
]

const CODE_DIRS = ['app', 'lib', 'components']

/* ── 🔴 THE WAIVER LIST, AND WHY IT IS NOT AN EXEMPTION ─────────────────────────────────────────────
 * A waiver says "the parser cannot read this argument" — it does NOT say "do not check these columns".
 * Each entry carries the columns the site can contribute, and those are censused exactly like a
 * literal select's. It is keyed by the argument's own source text, so editing the call breaks the
 * match and the harness fails rather than silently trusting a stale note. */
const WAIVED = [
  {
    file: 'app/api/admin/outreach/route.ts',
    table: 'outreach_prospects',
    method: 'select',
    arg: 'col',
    why: 'The capability probe `columnExists(col)` passes its PARAMETER straight to .select(), so the '
      + 'column name is at the five call sites rather than here. Those names are listed and censused.',
    columns: [
      'contact_name',
      'contact_first_name', 'contact_last_name',
      'do_not_contact', 'entity_type',
      'lead_type_at_first_contact',
    ],
  },
]

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · WHAT THE MIGRATIONS DECLARE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Strip `--` line comments and `/* *\/` blocks without touching string literals. */
function stripSql(src) {
  let out = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === "'") { // a string literal — copied whole, '' is an escaped quote
      let j = i + 1
      while (j < src.length) {
        if (src[j] === "'" && src[j + 1] === "'") { j += 2; continue }
        if (src[j] === "'") break
        j++
      }
      out += src.slice(i, j + 1); i = j; continue
    }
    if (c === '"') { // a quoted identifier — "references"
      const j = src.indexOf('"', i + 1)
      if (j === -1) { out += src.slice(i); break }
      out += src.slice(i, j + 1); i = j; continue
    }
    if (c === '-' && src[i + 1] === '-') { const j = src.indexOf('\n', i); if (j === -1) break; out += '\n'; i = j; continue }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); if (j === -1) break; i = j + 1; out += ' '; continue }
    out += c
  }
  return out
}

/** The balanced `(...)` that starts at `open`, exclusive of the brackets themselves. */
function balanced(src, open) {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === "'") { let j = i + 1; while (j < src.length && !(src[j] === "'" && src[j + 1] !== "'")) j += src[j] === "'" ? 2 : 1; i = j; continue }
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth === 0) return { body: src.slice(open + 1, i), end: i } }
  }
  return null
}

/** Split on commas that are at paren depth 0 and outside quotes. */
function splitTopLevel(src, sep = ',') {
  const out = []
  let depth = 0, start = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === "'") { let j = i + 1; while (j < src.length && src[j] !== "'") j++; i = j; continue }
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === sep && depth === 0) { out.push(src.slice(start, i)); start = i + 1 }
  }
  out.push(src.slice(start))
  return out
}

/** Table-level constraint clauses, which are not columns however much they look like one. */
const NOT_A_COLUMN = /^(constraint|primary|unique|foreign|check|exclude|like|partition|deferrable)\b/i

/** Returns { columns: Map<table, Set<col>>, sources: Map<"table.col", [files]> }. */
function migrationColumns(root = REPO, patch = {}) {
  const dir = path.join(root, 'supabase/migrations')
  const drop = new Set(patch.dropMigrations || [])
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql') && !drop.has(f)).sort()
  /* ⚠️ `patch.tables` ASKS ABOUT A DIFFERENT TABLE LIST, exactly as it does for `codeColumns`. It is
   * how a harness can read `trucks` — which is NOT censused, because it predates
   * supabase/migrations/ and has no `create table` there — to assert that a RENAME landed. Reading a
   * table is not censusing it: this returns what the migrations declare and checks nothing. */
  const wanted = Array.isArray(patch.tables) && patch.tables.length ? patch.tables : TABLES
  const columns = new Map(wanted.map(t => [t, new Set()]))
  const sources = new Map()
  const problems = []
  const add = (table, col, file) => {
    if (!columns.has(table)) return
    columns.get(table).add(col)
    const k = `${table}.${col}`
    sources.set(k, [...(sources.get(k) || []), file])
  }

  for (const f of files) {
    const src = stripSql(fs.readFileSync(path.join(dir, f), 'utf8'))

    // create table [if not exists] [public.]<t> ( … )
    const createRe = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi
    let m
    while ((m = createRe.exec(src)) !== null) {
      const table = m[1].toLowerCase()
      if (!columns.has(table)) continue
      const b = balanced(src, m.index + m[0].length - 1)
      if (!b) { problems.push(`${f}: unbalanced create table ${table}`); continue }
      for (const item of splitTopLevel(b.body)) {
        const t = item.trim()
        if (!t || NOT_A_COLUMN.test(t)) continue
        const name = t.match(/^"([^"]+)"/) || t.match(/^([a-z_][a-z0-9_]*)/i)
        if (!name) { problems.push(`${f}: cannot read a column name from \`${t.slice(0, 60)}\` in ${table}`); continue }
        add(table, name[1].toLowerCase(), f)
      }
    }

    // alter table [public.]<t> … add column [if not exists] <c>
    const alterRe = /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\b/gi
    while ((m = alterRe.exec(src)) !== null) {
      const table = m[1].toLowerCase()
      if (!columns.has(table)) continue
      const semi = src.indexOf(';', m.index)
      const stmt = src.slice(m.index, semi === -1 ? src.length : semi)
      const addRe = /\badd\s+column\s+(?:if\s+not\s+exists\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))/gi
      let a
      while ((a = addRe.exec(stmt)) !== null) add(table, (a[1] || a[2]).toLowerCase(), f)

      /* ── 🔴 DROPS AND RENAMES ARE MODELLED NOW (3 October 2026) ─────────────────────────────────
       * This used to `problems.push("…which this parser does not model")` and stop. That was right to
       * refuse rather than lie — and then stage 2 of Schedule › Places dropped
       * `truck_places.group_post_wording` and renamed `trucks.default_group_post_wording`, and the
       * census DID start lying: it still declared the dropped column, so a select naming a column
       * that no longer exists would have passed. The harness caught it, which is the whole point of
       * that refusal having been loud.
       * 🔴 ORDER IS WHAT MAKES THIS CORRECT. The files are read in FILENAME ORDER (sorted above), so
       * a drop is applied after the create that added the column and before any later re-add — the
       * same order Postgres will see them in. A reader that processed files in directory order would
       * get a different schema on a different machine.
       * ⚠️ `drop constraint` AND `drop not null` ARE NOT `drop column`; the patterns name the word. */
      const dropRe = /\bdrop\s+column\s+(?:if\s+exists\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))/gi
      let dr
      while ((dr = dropRe.exec(stmt)) !== null) {
        const col = (dr[1] || dr[2]).toLowerCase()
        if (columns.has(table)) columns.get(table).delete(col)
        sources.delete(`${table}.${col}`)
      }
      const renRe = /\brename\s+column\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+to\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))/gi
      let rn
      while ((rn = renRe.exec(stmt)) !== null) {
        const from = (rn[1] || rn[2]).toLowerCase()
        const to = (rn[3] || rn[4]).toLowerCase()
        if (columns.has(table)) {
          columns.get(table).delete(from)
          sources.delete(`${table}.${from}`)
          add(table, to, f)
        }
      }
    }
  }
  return { columns, sources, problems, files }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · WHAT THE CODE NAMES
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** A `${…}` the resolver could not read. It survives into the text so embed-stripping can remove it. */
const UNRESOLVED = '\u0000'
const VARIANT_CAP = 256

const unwrap = (n) => {
  while (n && (ts.isParenthesizedExpression(n) || ts.isAwaitExpression(n)
    || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isTypeAssertionExpression?.(n))) n = n.expression
  return n
}

const cross = (as, bs) => {
  const out = []
  for (const a of as) for (const b of bs) out.push(a + b)
  return out.length > VARIANT_CAP ? null : out
}
const union = (as, bs) => {
  const out = [...new Set([...as, ...bs])]
  return out.length > VARIANT_CAP ? null : out
}

/**
 * Every string this expression could be, or null when the parser cannot say.
 *
 * 🔴 VARIANTS RATHER THAN ONE STRING, because this codebase chooses column lists at RUNTIME: the
 * hand-applied-migration probe is written `COLS + (await exists() ? ', c' : '')`, and the console's
 * optional columns are `[cond && 'c', …].filter(Boolean).join(', ')`. Both branches of every such
 * choice are real selects that will reach PostgREST, so both are censused.
 */
function variantsOf(node, sf, seen = new Set()) {
  node = unwrap(node)
  if (!node) return null

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text]

  if (ts.isTemplateExpression(node)) {
    let acc = [node.head.text]
    for (const span of node.templateSpans) {
      const v = variantsOf(span.expression, sf, seen) || [UNRESOLVED]
      acc = cross(acc, v); if (!acc) return null
      acc = cross(acc, [span.literal.text]); if (!acc) return null
    }
    return acc
  }

  if (ts.isConditionalExpression(node)) {
    const a = variantsOf(node.whenTrue, sf, seen), b = variantsOf(node.whenFalse, sf, seen)
    return a && b ? union(a, b) : null
  }

  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind
    if (op === ts.SyntaxKind.PlusToken) {
      const a = variantsOf(node.left, sf, seen), b = variantsOf(node.right, sf, seen)
      return a && b ? cross(a, b) : null
    }
    // `cond && 'col'` — the condition is a boolean gate, so the column is there or it is not.
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      const b = variantsOf(node.right, sf, seen)
      return b ? union(b, ['']) : null
    }
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      const a = variantsOf(node.left, sf, seen), b = variantsOf(node.right, sf, seen)
      return a && b ? union(a, b) : null
    }
    return null
  }

  // `[…].filter(Boolean).join(', ')` and `[…].join(', ')`
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const method = node.expression.name.text
    if (method === 'join') {
      const sep = node.arguments.length === 0 ? ',' : null
      const sepNode = node.arguments[0] ? unwrap(node.arguments[0]) : null
      const sepText = sepNode && ts.isStringLiteral(sepNode) ? sepNode.text : sep
      if (sepText == null) return null
      let target = unwrap(node.expression.expression)
      // `.filter(Boolean)` in between is a no-op for this purpose — the empties are dropped below.
      while (ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression)
        && target.expression.name.text === 'filter') target = unwrap(target.expression.expression)
      const arr = arrayLiteralFor(target, sf, seen)
      if (!arr) return null
      let combos = [[]]
      for (const el of arr) {
        const vs = variantsOf(el, sf, seen)
        if (!vs) return null
        const next = []
        for (const c of combos) for (const v of vs) next.push([...c, v])
        if (next.length > VARIANT_CAP) return null
        combos = next
      }
      const out = [...new Set(combos.map(c => c.filter(Boolean).join(sepText)))]
      return out.length > VARIANT_CAP ? null : out
    }
    return null
  }

  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return null
    const decl = soleDeclaration(node.text, sf)
    if (!decl || !decl.initializer) return null
    return variantsOf(decl.initializer, sf, new Set([...seen, node.text]))
  }

  return null
}

/** The array literal an expression stands for, refusing one that is mutated after declaration. */
function arrayLiteralFor(node, sf, seen) {
  node = unwrap(node)
  if (ts.isArrayLiteralExpression(node)) return node.elements
  if (ts.isIdentifier(node)) {
    /* ⚠️ `x.push(…)` MEANS THE LITERAL IS NOT THE WHOLE LIST. Reading the declaration alone would
     * under-report, and an under-report is the one answer this module must never give. */
    if (new RegExp(`\\b${node.text}\\.push\\s*\\(`).test(sf.text)) return null
    if (seen.has(node.text)) return null
    const decl = soleDeclaration(node.text, sf)
    if (!decl || !decl.initializer) return null
    return arrayLiteralFor(decl.initializer, sf, new Set([...seen, node.text]))
  }
  return null
}

/**
 * The declaration of `name` that is in scope at `fromNode`, plus the scope it was found in.
 *
 * 🔴 NEAREST ENCLOSING WINS, which is what "in scope" means and is the whole fix for the false
 * positive described in `payloadKeys`. Walking outwards from the USE SITE finds the handler's own
 * `patch` and stops; a file-wide search finds five of them and cannot tell which is meant.
 */
function declarationInScope(name, fromNode) {
  for (let scope = fromNode.parent; scope; scope = scope.parent) {
    let hit = null
    const walk = (n) => {
      if (hit) return
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) { hit = n; return }
      // ⚠️ DO NOT DESCEND INTO A NESTED FUNCTION. A `patch` declared inside a callback is a different
      // variable from the one this scope is looking for, and claiming it would reintroduce the bug.
      if (n !== scope && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)
        || ts.isMethodDeclaration(n) || ts.isClassDeclaration(n))) return
      ts.forEachChild(n, walk)
    }
    ts.forEachChild(scope, walk)
    if (hit) return { decl: hit, scope }
  }
  return null
}

/** The ONE `const`/`let` declaration of this name in the file, or null when there are none or many. */
function soleDeclaration(name, sf) {
  const hits = []
  const walk = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) hits.push(n)
    ts.forEachChild(n, walk)
  }
  walk(sf)
  return hits.length === 1 ? hits[0] : null
}

/**
 * Remove every PostgREST embedded resource — `alias:table!hint(…)`, `table(…)` — brackets balanced.
 *
 * 🔴 THE COLUMNS INSIDE AN EMBED ARE ANOTHER TABLE'S. Left in, every select that joins
 * `discovery_trucks` would report `name`, `website` and `logo_url` as missing from
 * `outreach_prospects`, and a check that cries wolf on a dozen correct selects is a check nobody runs.
 */
function stripEmbeds(text) {
  for (;;) {
    const open = text.indexOf('(')
    if (open === -1) return text
    const b = balanced(text, open)
    if (!b) return text.slice(0, open) // unbalanced: drop the tail rather than guess
    /* Walk back over the embed's own name: letters, digits, _, and the `:` `!` `.` of alias/hint.
     * ⚠️ THE WHITESPACE COMES FIRST. `truck:discovery_trucks!fk (id, name)` puts a space between the
     * name and the bracket, and skipping the name before the space left the name behind — which read
     * as a column called `discovery_trucks!outreach_prospects_…` and failed two correct selects. */
    let start = open
    while (start > 0 && /\s/.test(text[start - 1])) start--
    while (start > 0 && /[A-Za-z0-9_:!.]/.test(text[start - 1])) start--
    text = text.slice(0, start) + text.slice(b.end + 1)
  }
}

/**
 * The columns a PostgREST select string names, or a reason it cannot be read.
 * ⚠️ `*` NAMES NO COLUMN, so it contributes nothing and is not an error: there is no name in it to
 * get wrong, which is precisely why `select('*')` has never been the shape that breaks.
 */
function parseSelectList(raw) {
  const cols = []
  const text = stripEmbeds(String(raw))
  if (text.includes(UNRESOLVED)) return { cols: null, error: 'an interpolation the parser cannot resolve' }
  for (const piece of splitTopLevel(text)) {
    let t = piece.trim()
    if (!t) continue
    if (t === '*') continue
    const colon = t.indexOf(':')            // `alias:column`
    if (colon !== -1) t = t.slice(colon + 1).trim()
    if (t === '*') continue
    const q = t.match(/^"([^"]+)"$/)        // `"references"`
    if (q) { cols.push(q[1].toLowerCase()); continue }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) return { cols: null, error: `cannot read \`${t.slice(0, 48)}\` as a column name` }
    cols.push(t.toLowerCase())
  }
  return { cols, error: null }
}

/** Builder methods whose FIRST argument is a column name. */
const COLUMN_ARG0 = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'likeAllOf', 'likeAnyOf',
  'is', 'in', 'contains', 'containedBy', 'overlaps', 'order', 'not', 'filter',
  'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte', 'rangeAdjacent', 'textSearch',
])
/** Builder methods that name no column at all. */
const NO_COLUMNS = new Set([
  'limit', 'range', 'single', 'maybeSingle', 'csv', 'geojson', 'explain', 'rollback',
  'throwOnError', 'abortSignal', 'returns', 'overrideTypes', 'setHeader', 'delete', 'then', 'catch',
])
/** Methods that name columns in a way this parser deliberately does not model. */
const UNMODELLED = new Set(['match', 'rpc'])

/**
 * The columns a PostgREST `.or()` filter string names — `'in_reply_to.is.null,references.is.null'`.
 * 🔴 MODELLED RATHER THAN WAIVED, because these are real column names in real filters (the mail
 * import's threading backfill and the poll's fill-only-where-empty writes), and a census that cannot
 * read them is a census with three blind spots in the table it most needs to see.
 * ⚠️ `and(…)` / `or(…)` GROUPS RECURSE. Nothing in the tree nests today; a parser that silently
 * ignored a group would start lying the moment one did.
 */
function parseOrFilter(raw) {
  const cols = []
  for (const piece of splitTopLevel(String(raw))) {
    const t = piece.trim()
    if (!t) continue
    const group = t.match(/^(?:and|or)\s*\(([\s\S]*)\)$/i)
    if (group) {
      const inner = parseOrFilter(group[1])
      if (!inner.cols) return inner
      cols.push(...inner.cols); continue
    }
    const m = t.match(/^(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))\./)
    if (!m) return { cols: null, error: `cannot read a column from the or() term \`${t.slice(0, 40)}\`` }
    cols.push((m[1] || m[2]).toLowerCase())
  }
  return { cols, error: null }
}

/**
 * Every column named on a census table across the given directories.
 * Returns { named: [{table, col, file, line, method}], unresolved: [...], unreadWrites: [...] }.
 */
function codeColumns(root = REPO, dirs = CODE_DIRS, patch = {}) {
  /* ⚠️ `patch.code` SUBSTITUTES ONE FILE'S SOURCE IN MEMORY. It exists for the broken variants: a
   * check that cannot be shown to FAIL on a reintroduced `preview` proves nothing, and copying the
   * whole tree to prove it would make the harness slow enough to skip. Nothing on disk is touched. */
  const override = new Map(Object.entries(patch.code || {}))
  /* ⚠️ `patch.tables` ASKS ABOUT A DIFFERENT TABLE LIST WITHOUT JOINING THE CENSUS. It exists for
   * scripts/schedule-graphics-places.cjs, which needs the AST payload reader over `truck_events` to
   * prove that no update path writes `truck_place_id`. `truck_events` must NOT be added to `TABLES`:
   * it predates supabase/migrations/ and has no `create table` there, so censusing it would report
   * every column it names as missing. This reads the writes; it does not check them against SQL. */
  const tables = Array.isArray(patch.tables) && patch.tables.length ? patch.tables : TABLES
  const named = []
  const unresolved = []
  const unreadWrites = []
  const waiverHits = new Set()

  for (const file of walkFiles(root, dirs)) {
    const rel = path.relative(root, file)
    const text = override.has(rel) ? override.get(rel) : fs.readFileSync(file, 'utf8')
    if (!tables.some(t => text.includes(t))) continue
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true,
      rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
    const srcOf = (n) => n.getText(sf).replace(/\s+/g, ' ').trim()

    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'from' && node.arguments.length === 1) {
        const arg = unwrap(node.arguments[0])
        if (ts.isStringLiteral(arg) && tables.includes(arg.text)) {
          walkChain(node, arg.text)
        }
      }
      ts.forEachChild(node, visit)
    }

    const walkChain = (fromCall, table) => {
      let cur = fromCall
      for (;;) {
        const pa = cur.parent
        if (!pa || !ts.isPropertyAccessExpression(pa) || pa.expression !== cur) return
        const call = pa.parent
        if (!call || !ts.isCallExpression(call) || call.expression !== pa) return
        handle(table, pa.name.text, call, pa.name)
        cur = call
      }
    }

    const handle = (table, method, call, nameNode) => {
      /* ⚠️ THE LINE OF THE METHOD, NOT OF THE CHAIN. `call.getStart()` is `supabase`, which on a
       * ten-line chain points a finding at the wrong line — and a finding at the wrong line is one
       * nobody can act on. */
      const line = lineOf(nameNode || call)
      const at = { table, file: rel, line, method }

      if (NO_COLUMNS.has(method)) return
      if (UNMODELLED.has(method)) {
        unresolved.push({ ...at, code: srcOf(call).slice(0, 90), why: `\`.${method}()\` names columns in a form this parser does not model` })
        return
      }

      if (method === 'select') {
        const argNode = call.arguments[0]
        if (!argNode) return // `.select()` is `*`
        const code = srcOf(argNode)
        const waiver = WAIVED.find(w => w.file === rel && w.table === table && w.method === 'select' && w.arg === code)
        if (waiver) {
          waiverHits.add(waiver)
          for (const c of waiver.columns) named.push({ ...at, col: c.toLowerCase(), via: 'waiver' })
          return
        }
        const vs = variantsOf(argNode, sf)
        if (!vs) { unresolved.push({ ...at, code: code.slice(0, 90), why: 'the select argument is not a literal and could not be resolved' }); return }
        for (const v of vs) {
          const { cols, error } = parseSelectList(v)
          if (!cols) { unresolved.push({ ...at, code: code.slice(0, 90), why: error }); return }
          for (const c of cols) named.push({ ...at, col: c })
        }
        return
      }

      if (method === 'insert' || method === 'update' || method === 'upsert') {
        const argNode = call.arguments[0]
        if (!argNode) return
        const got = payloadKeys(argNode, sf)
        for (const c of got.keys) named.push({ ...at, col: c.toLowerCase() })
        /* ⚠️ A WRITE PAYLOAD IT CANNOT FULLY READ IS REPORTED, NOT FATAL. The brief's hard rule is
         * about selects, and for a reason: a bad column in a WRITE fails that write loudly and at
         * once, while a bad column in a SELECT fails a read the caller may well discard. These are
         * printed so the gap is visible rather than assumed to be empty. */
        if (got.partial.length) unreadWrites.push({ ...at, code: srcOf(argNode).slice(0, 80), parts: got.partial })
        return
      }

      if (method === 'or') {
        const argNode = call.arguments[0]
        if (!argNode) return
        const a = unwrap(argNode)
        if (!ts.isStringLiteral(a) && !ts.isNoSubstitutionTemplateLiteral(a)) {
          unresolved.push({ ...at, code: srcOf(argNode).slice(0, 90), why: '`.or()`\'s filter is not a literal' }); return
        }
        const { cols, error } = parseOrFilter(a.text)
        if (!cols) { unresolved.push({ ...at, code: srcOf(argNode).slice(0, 90), why: error }); return }
        for (const c of cols) named.push({ ...at, col: c })
        return
      }

      if (COLUMN_ARG0.has(method)) {
        const argNode = call.arguments[0]
        if (!argNode) return
        const a = unwrap(argNode)
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
          const { cols } = parseSelectList(a.text)
          if (cols) for (const c of cols) named.push({ ...at, col: c })
          else unresolved.push({ ...at, code: srcOf(argNode).slice(0, 90), why: `cannot read \`.${method}()\`'s column` })
        } else {
          unresolved.push({ ...at, code: srcOf(argNode).slice(0, 90), why: `\`.${method}()\`'s column is not a literal` })
        }
        return
      }

      unresolved.push({ ...at, code: srcOf(call).slice(0, 90), why: `unknown builder method \`.${method}()\` — teach the census about it` })
    }

    visit(sf)
  }

  const staleWaivers = WAIVED.filter(w => !waiverHits.has(w))
  return { named, unresolved, unreadWrites, staleWaivers }
}

/** Object-literal keys of a write payload, plus a note for every part it could not read. */
function payloadKeys(node, sf, seen = new Set()) {
  node = unwrap(node)
  const keys = []
  const partial = []

  if (ts.isArrayLiteralExpression(node)) {
    for (const el of node.elements) {
      const r = payloadKeys(el, sf, seen)
      keys.push(...r.keys); partial.push(...r.partial)
    }
    return { keys, partial }
  }

  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (ts.isSpreadAssignment(prop)) {
        const inner = unwrap(prop.expression)
        if (ts.isObjectLiteralExpression(inner) || ts.isIdentifier(inner)) {
          const r = payloadKeys(inner, sf, seen)
          keys.push(...r.keys); partial.push(...r.partial)
        } else {
          partial.push(`spread \`...${prop.expression.getText(sf).replace(/\s+/g, ' ').slice(0, 40)}\``)
        }
        continue
      }
      if (ts.isShorthandPropertyAssignment(prop)) { keys.push(prop.name.text); continue }
      if (!ts.isPropertyAssignment(prop)) { partial.push('a computed or method property'); continue }
      const n = prop.name
      if (ts.isIdentifier(n)) keys.push(n.text)
      else if (ts.isStringLiteral(n)) keys.push(n.text)
      else partial.push(`a computed key \`${n.getText(sf).slice(0, 30)}\``)
    }
    return { keys, partial }
  }

  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return { keys, partial }
    const next = new Set([...seen, node.text])
    /* ── 🔴 RESOLVED BY SCOPE, NOT BY FILE (3 October 2026) ─────────────────────────────────────────
     * This read the declaration with `soleDeclaration` (null whenever a name appeared more than once)
     * and then scanned `sf.text` for EVERY `<name>.<prop> =` in the whole file with a regex. `patch` is
     * a local in five different handlers of app/api/manage/route.ts, so the embed handler's
     * `patch.website = url` was attributed to a `truck_places` update three hundred lines away and
     * reported as `truck_places.website` — a column that does not exist, on a write that never names it.
     * 🔴 A FALSE POSITIVE IS AS BAD AS A MISS HERE. The whole value of this census is that a finding
     * means something; one that cries wolf on correct code is one that gets waived, and the waiver is
     * where the next real `preview` hides. Both halves are now scoped to the nearest enclosing
     * declaration and read off the AST. */
    const found = declarationInScope(node.text, node)
    let read = false
    if (found) {
      if (found.decl.initializer) {
        const r = payloadKeys(found.decl.initializer, sf, next)
        keys.push(...r.keys); partial.push(...r.partial)
      }
      // `patch.contact_first_name = …` — the idiom for a PATCH built from whichever fields arrived.
      // Collected from `found.scope` ONLY, so another handler's identically-named local cannot leak in.
      const walk = (n) => {
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
          && ts.isPropertyAccessExpression(n.left) && ts.isIdentifier(n.left.expression)
          && n.left.expression.text === node.text && ts.isIdentifier(n.left.name)) {
          keys.push(n.left.name.text)
        }
        ts.forEachChild(n, walk)
      }
      walk(found.scope)
      read = true
    }
    if (!read) partial.push(`the payload \`${node.text}\` could not be read`)
    return { keys, partial }
  }

  partial.push(`the payload \`${node.getText(sf).replace(/\s+/g, ' ').slice(0, 40)}\` could not be read`)
  return { keys, partial }
}

function walkFiles(root, dirs) {
  const out = []
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') rec(p); continue }
      if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p)
    }
  }
  for (const d of dirs) { const p = path.join(root, d); if (fs.existsSync(p)) rec(p) }
  return out.sort()
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE CENSUS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Every column the code names that no migration declares.
 * `missing` is the finding; `unresolved` is the parser admitting it could not look, which the harness
 * treats exactly as seriously.
 */
function census(root = REPO, dirs = CODE_DIRS, patch = {}) {
  const mig = migrationColumns(root, patch)
  const code = codeColumns(root, dirs, patch)
  const missing = []
  const seen = new Set()
  for (const n of code.named) {
    const declared = mig.columns.get(n.table)
    if (declared && declared.has(n.col)) continue
    const k = `${n.table}.${n.col}|${n.file}:${n.line}`
    if (seen.has(k)) continue
    seen.add(k)
    missing.push(n)
  }
  return {
    missing,
    unresolved: code.unresolved,
    unreadWrites: code.unreadWrites,
    staleWaivers: code.staleWaivers,
    migrationProblems: mig.problems,
    declared: mig.columns,
    sources: mig.sources,
    namedCount: code.named.length,
    migrationFiles: mig.files.length,
  }
}

module.exports = {
  REPO, TABLES, CODE_DIRS, WAIVED, UNRESOLVED,
  census, migrationColumns, codeColumns,
  parseSelectList, parseOrFilter, stripEmbeds, variantsOf, stripSql, splitTopLevel, soleDeclaration,
  declarationInScope,
}
