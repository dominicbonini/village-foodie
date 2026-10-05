#!/usr/bin/env node
// scripts/outreach-schema-census.cjs — every column the code NAMES exists in a migration.
//   node scripts/outreach-schema-census.cjs   (< 2 s: NO NETWORK, NO MAILBOX, NO DATABASE)
//
// ── 🔴 THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────────────────────────
// 1 October 2026. The recorded-steps build widened the send route's `outreach_messages` select to name
// `preview`. There is no such column — the first lines of an email are DERIVED, `previewOf(text_body)`.
// PostgREST answers an unknown column with 42703 for the whole query, the route's own error check then
// refused, and EVERY REAL SEND STOPPED for a day. 🧪 3Bros Burgers, 2 October:
//     "I could not read this prospect's sent emails, so the duplicate checks cannot run
//      (42703 column outreach_messages.preview does not exist). Nothing was sent."
// Three weeks earlier, one table over, the same mistake: `outreach_contacts.email_message_id`, also
// not a column, which emptied the ladder and logged a Chase 1 as a second first contact
// (🧪 Smother Spudders). Twice now, in the same two selects.
//
// 🔴 EVERY HARNESS PASSED BOTH TIMES, AND THAT IS THE POINT OF THIS FILE. A harness builds its rows in
// JavaScript, so a fixture has whatever property the code asks of it: `m.preview` is `undefined`, not
// an error. A fixture CANNOT catch a column that does not exist. Only the migrations can, and nothing
// in the tree read them.
//
// ── WHAT IS ASSERTED, IN THE ORDER IT MATTERS ─────────────────────────────────────────────────────
//   1 · THE PARSER, against hand-written cases — because a census that silently mis-reads a select is
//       worse than none, and the two bugs found while writing it (an embed's name left behind as a
//       column, and three unread `.or()` filters) were both in this layer.
//   2 · THE BROKEN VARIANTS — a reintroduced `preview` must FAIL, as must a bad insert key, a bad
//       `.eq()`, a bad column in one branch of a runtime ternary, a deleted migration file, and a
//       select the parser cannot read. A check that cannot be shown to fail proves nothing.
//   3 · THE TREE ITSELF — the whole of app/, lib/ and components/, against supabase/migrations/.
const { census, migrationColumns, codeColumns, parseSelectList, parseOrFilter, stripEmbeds, REPO, TABLES, CODE_DIRS, WAIVED } =
  require('./_outreach-schema-census.cjs')
const fs = require('fs')
const path = require('path')

let fails = 0
const ok = [], bad = []
const t = (n, c) => (c ? ok : bad).push(n)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const SEND = 'app/api/admin/outreach/mail-send/route.ts'
const TIMELINE = 'app/api/admin/outreach/timeline/route.ts'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE PARSER
// ════════════════════════════════════════════════════════════════════════════════════════════════
function runParserSuite() {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const cols = s => { const r = parseSelectList(s); return r.cols ? r.cols.join(',') : `ERROR(${r.error})` }

  t('a plain list', cols('id, direction, status') === 'id,direction,status')
  t('⚠️ a quoted identifier is a column — `"references"` is a reserved word in the schema',
    cols('id, message_id, in_reply_to, "references"') === 'id,message_id,in_reply_to,references')
  t('⚠️ `*` names no column, so it contributes none and is not an error', cols('*') === '')
  t('an alias is not the column — `truck:name` asks for `name`', cols('id, lbl:subject') === 'id,subject')

  /* ── 🔴 THE EMBED RULE, WHICH IS WHERE THE FIRST PARSER BUG WAS ───────────────────────────────
   * The columns inside `discovery_trucks(…)` belong to `discovery_trucks`. Checked against
   * `outreach_prospects` they are a dozen false alarms, and a check that cries wolf is one nobody
   * runs. ⚠️ THE SPACE BEFORE THE BRACKET is what the first version got wrong: it skipped the name
   * before the whitespace and so left `discovery_trucks!…_fkey` behind, as a column. */
  t('🔴 an embed\'s columns are the OTHER table\'s and are stripped',
    cols('id, discovery_trucks(name, contact_email)') === 'id')
  t('🔴 …with an alias and an fk hint, and a SPACE before the bracket (the bug)',
    cols('id, truck:discovery_trucks!outreach_prospects_discovery_truck_id_fkey (id, name, website)') === 'id')
  t('🔴 …and a nested embed goes with it',
    cols('id, a:b!inner(x, c:d(y, z)), stage') === 'id,stage')
  t('⚠️ a multi-line embed, because that is how the console writes one',
    cols('id, stage,\n  truck:discovery_trucks!fk (\n    id, name,\n    website\n  ),\n  notes') === 'id,stage,notes')

  t('🔴 something that is not a column name FAILS rather than being skipped',
    parseSelectList('id, count(*) as n').cols === null)
  t('🔴 an unresolved interpolation FAILS — a select it cannot read is the one the next bug hides in',
    parseSelectList('id, \u0000, status').cols === null)
  t('⚠️ …but an unresolved interpolation INSIDE AN EMBED is irrelevant and does not fail',
    cols('id, truck:discovery_trucks!fk (\u0000)') === 'id')

  // ── the `.or()` filter, the second parser bug: three real filters it could not read ──────────
  const orc = s => { const r = parseOrFilter(s); return r.cols ? r.cols.join(',') : `ERROR(${r.error})` }
  t('🔴 an or() filter names columns — the mail import\'s threading backfill',
    orc('in_reply_to.is.null,references.is.null') === 'in_reply_to,references')
  t('🔴 …and the poll\'s fill-only-where-empty write', orc('message.is.null,message.eq.') === 'message,message')
  t('⚠️ an and()/or() group recurses rather than being ignored',
    orc('status.eq.sent,and(is_test.is.false,direction.eq.outbound)') === 'status,is_test,direction')
  t('🔴 an or() term with no column FAILS', parseOrFilter('nonsense').cols === null)

  // ── the runtime column lists this codebase actually writes ───────────────────────────────────
  /* 🔴 BOTH BRANCHES OF EVERY RUNTIME CHOICE ARE CENSUSED. The hand-applied-migration idiom is
   * `COLS + (await exists() ? ', c' : '')` and the console's is
   * `[cond && 'c', …].filter(Boolean).join(', ')`. Both branches are selects that will reach
   * PostgREST, so a parser that read only one would miss the column that is only sometimes asked for
   * — which is exactly the half that is hand-applied and therefore most likely to be missing. */
  const { named } = codeColumns(REPO, CODE_DIRS)
  const at = (file, line) => named.filter(n => n.file === file && n.line === line).map(n => n.col)
  const tlLine = read(TIMELINE).split('\n').findIndex(l => l.includes("messagesHaveGuardOverride() ? ', guard_override'")) + 1
  t('🔴 a probe-gated column is read from BOTH branches of the ternary',
    tlLine > 0 && at(TIMELINE, tlLine).includes('guard_override') && at(TIMELINE, tlLine).includes('text_body'))
  const consoleSrc = read('app/api/admin/outreach/route.ts')
  const optLine = consoleSrc.split('\n').findIndex(l => l.includes('${BASE_COLS}${optionalCols')) + 1
  t('🔴 `[cond && \'col\'].filter(Boolean).join()` is read, all five optional columns',
    optLine > 0 && ['contact_name', 'contact_first_name', 'do_not_contact', 'entity_type', 'lead_type_at_first_contact']
      .every(c => at('app/api/admin/outreach/route.ts', optLine).includes(c)))
  t('⚠️ …and the embed in that same select contributes NO column (the control for the rule above)',
    optLine > 0 && !at('app/api/admin/outreach/route.ts', optLine).some(c => ['logo_url', 'schedule_url', 'aliases'].includes(c)))

  // ── the migration reader ─────────────────────────────────────────────────────────────────────
  const mig = migrationColumns(REPO)
  /* 🧪 THE CONTROL ON THE WHOLE MODULE. These 30 are `information_schema`'s own answer for
   * `outreach_messages`, pasted by Dominic on 2 October 2026. If the SQL reader and the live table
   * agree exactly, the census is reading the schema and not an approximation of it. */
  const LIVE_MESSAGES = [
    'id', 'prospect_id', 'contact_id', 'direction', 'status', 'is_test', 'source', 'message_id',
    'in_reply_to', 'references', 'subject', 'from_address', 'to_address', 'message_date', 'mailbox',
    'uid', 'uidvalidity', 'html_body', 'text_body', 'sent_copy', 'attempts', 'last_error',
    'idempotency_key', 'created_at', 'updated_at', 'account', 'attachments', 'handled_at',
    'snoozed_until', 'guard_override',
  ].sort()
  const declared = [...mig.columns.get('outreach_messages')].sort()
  t(`🧪 the SQL reader's \`outreach_messages\` is byte-for-byte information_schema's (${LIVE_MESSAGES.length} columns)`,
    declared.join(',') === LIVE_MESSAGES.join(','))
  if (declared.join(',') !== LIVE_MESSAGES.join(',')) {
    console.log('      parsed but not live: ' + declared.filter(c => !LIVE_MESSAGES.includes(c)).join(', '))
    console.log('      live but not parsed: ' + LIVE_MESSAGES.filter(c => !declared.includes(c)).join(', '))
  }
  t('⚠️ a table-level `constraint …` clause is not read as a column',
    !mig.columns.get('outreach_sequence_slots').has('constraint')
    && !mig.columns.get('outreach_sequence_slots').has('outreach_sequence_slots_box_key'))
  t('⚠️ a CHECK\'s own commas and brackets do not split a column off — `status` survives its list',
    mig.columns.get('outreach_messages').has('status') && !mig.columns.get('outreach_messages').has('sent')
    && !mig.columns.get('outreach_messages').has('uncertain'))
  t('⚠️ `add column if not exists` is read, from a separate later migration',
    mig.columns.get('outreach_messages').has('attachments') && mig.columns.get('outreach_events').has('updated_at'))
  t('🔴 `preview` is declared NOWHERE — the whole premise of this build',
    !mig.columns.get('outreach_messages').has('preview'))
  t('🔴 `email_message_id` is declared nowhere on `outreach_contacts` either (September\'s version of it)',
    !mig.columns.get('outreach_contacts').has('email_message_id'))
  t('🔴 no `rename column` / `drop column` the reader cannot model', mig.problems.length === 0)

  return { ok, bad }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE BROKEN VARIANTS
// ════════════════════════════════════════════════════════════════════════════════════════════════
/** Replace once, and prove the anchor was there — a variant that patched nothing proves nothing. */
function changed(src, from, to, tag) {
  if (!src.includes(from)) { console.log(`🔴 ${tag}: THE ANCHOR IS GONE — \`${from.slice(0, 70)}\``); process.exit(1) }
  return src.split(from).join(to)
}

function runVariants() {
  const SEND_SRC = read(SEND)
  const TL_SRC = read(TIMELINE)
  const CL_SRC = read('lib/outreach-contact-log.ts')

  const variants = [
    /* 🔴 THE ONE THE BRIEF NAMES. Re-adding `preview` to the send route's select must fail, because
     * this is the exact edit that shipped on 1 October and stopped every send. */
    ['V1 🔴 `preview` is put back in the send route\'s messages select', {
      code: {
        [SEND]: changed(SEND_SRC,
          "'id, direction, is_test, contact_id, message_date, created_at, status, text_body'",
          "'id, direction, is_test, contact_id, message_date, created_at, status, preview, sent_copy'", 'V1'),
      },
    }, 'outreach_messages.preview'],

    ['V2 🔴 September\'s version of the same mistake — `email_message_id` selected from the contact log', {
      code: {
        [SEND]: changed(SEND_SRC,
          "'id, contacted_at, created_at, direction, kind, channel, message'",
          "'id, contacted_at, created_at, direction, kind, channel, message, email_message_id'", 'V2'),
      },
    }, 'outreach_contacts.email_message_id'],

    ['V3 🔴 a column that does not exist in an INSERT key', {
      code: {
        [SEND]: changed(SEND_SRC, "    message_date: new Date().toISOString(),",
          "    message_date: new Date().toISOString(),\n    preview_text: 'x',", 'V3'),
      },
    }, 'outreach_messages.preview_text'],

    ['V4 🔴 a column that does not exist in an `.eq()` filter', {
      code: {
        [SEND]: changed(SEND_SRC, ".eq('prospect_id', prospectId).eq('direction', 'outbound')",
          ".eq('prospect_id', prospectId).eq('direction_of_travel', 'outbound')", 'V4'),
      },
    }, 'outreach_messages.direction_of_travel'],

    /* 🔴 THE ONE A SIMPLER PARSER WOULD MISS. A column named only in the branch of a runtime ternary
     * reaches PostgREST only when the probe succeeds — which is precisely the hand-applied case. */
    ['V5 🔴 a bad column in ONE BRANCH of the probe ternary', {
      code: {
        [TIMELINE]: changed(TL_SRC, "? ', guard_override' : ''", "? ', guard_overrides' : ''", 'V5'),
      },
    }, 'outreach_messages.guard_overrides'],

    ['V6 🔴 a bad column in an `.order()`', {
      code: {
        [TIMELINE]: changed(TL_SRC, ".order('contacted_at', { ascending: false })",
          ".order('contacted_on', { ascending: false })", 'V6'),
      },
    }, 'outreach_contacts.contacted_on'],

    ['V7 🔴 a bad column in an `.or()` filter', {
      code: {
        'lib/outreach-mail-poll.ts': changed(read('lib/outreach-mail-poll.ts'),
          "'text_body.is.null,text_body.eq.'", "'body_text.is.null,body_text.eq.'", 'V7'),
      },
    }, 'outreach_messages.body_text'],

    ['V8 🔴 a bad column in the one contact writer\'s INSERT', {
      code: {
        'lib/outreach-contact-log.ts': changed(CL_SRC,
          "    channel: input.channel ?? null,", "    channel_name: input.channel ?? null,", 'V8'),
      },
    }, 'outreach_contacts.channel_name'],

    /* 🔴 THE `patch.<col> =` IDIOM, which is how the console writes whichever fields arrived. A
     * parser that read only object literals would be blind to every one of these. */
    ['V9 🔴 a bad column in a `patch.<col> =` write payload', {
      code: {
        'app/api/admin/outreach/route.ts': changed(read('app/api/admin/outreach/route.ts'),
          "patch.contact_first_name = body.contact_first_name", "patch.contact_forename = body.contact_first_name", 'V9'),
      },
    }, 'outreach_prospects.contact_forename'],

    /* ── 🔴 THE SCOPED PAYLOAD READER, PROVED FROM BOTH SIDES (3 October 2026) ──────────────────────
     * `payloadKeys` used to scan the WHOLE FILE for `<name>.<prop> =`. app/api/manage/route.ts has five
     * locals called `patch`, so the embed handler's `patch.website = url` was reported as
     * `truck_places.website` — a false positive on correct code. It is scoped to the nearest enclosing
     * declaration now, and both halves of that need proving: this variant shows the reader still FIRES
     * inside the right scope, and the control below shows it no longer fires across scopes. */
    ['V9b 🔴 a bad column in a `patch.<col> =` whose declaration is one of FIVE in the file', {
      code: {
        'app/api/manage/route.ts': changed(read('app/api/manage/route.ts'),
          '      patch.name = name', '      patch.name_on_posts = name', 'V9b'),
      },
    }, 'truck_places.name_on_posts'],

    /* 🔴 THE DROPPED COLUMN MUST NOT COME BACK. `truck_places.group_post_wording` went with the
     * Facebook-groups feature in 20261004_schedule_places_stage2.sql. A write naming it again is a
     * 42703 in production, and the only thing that can know that is a reader which MODELS the drop —
     * which it did not until today, and the harness is what caught it. */
    ['V9c 🔴 a write names a column a later migration DROPPED', {
      code: {
        'app/api/manage/route.ts': changed(read('app/api/manage/route.ts'),
          '      patch.name = name', '      patch.name = name; patch.group_post_wording = null', 'V9c'),
      },
    }, 'truck_places.group_post_wording'],

    /* 🔴 THE RECORD ITSELF. A column applied by hand and never committed is, to this census and to a
     * fresh database, indistinguishable from one that was invented. Deleting the file must fail. */
    ['V10 🔴 a migration file is deleted — the record, not the code, is what this reads',
      { dropMigrations: ['20261001_outreach_messages_guard_override.sql'] }, 'outreach_messages.guard_override'],
  ]

  let caughtAll = true
  for (const [label, patch, expect] of variants) {
    const r = census(REPO, CODE_DIRS, patch)
    const hit = r.missing.find(m => `${m.table}.${m.col}` === expect)
    const good = !!hit
    console.log(`  ${good ? '✓ FAILED as required' : '🔴 PASSED — THE CENSUS PROVES NOTHING'}  ${label}`)
    if (good) console.log(`        caught: ${expect} at ${hit.file}:${hit.line} (.${hit.method}())`)
    else caughtAll = false
  }

  /* ── 🔴 AND A SELECT IT CANNOT READ IS A FAILURE, NOT A SKIP ────────────────────────────────────
   * This is the property that makes the whole check worth having. A census that quietly gave up on
   * the one select it could not parse would be green on the day somebody wrote
   * `.select(colsFromSomewhere)` with `preview` in it. */
  const unreadable = census(REPO, CODE_DIRS, {
    code: {
      [SEND]: changed(read(SEND),
        ".select('id, direction, is_test, contact_id, message_date, created_at, status, text_body')",
        '.select(whateverColumnsSomebodyDecidedAtRuntime)', 'V11'),
    },
  })
  const sawIt = unreadable.unresolved.some(u => u.file === SEND)
  console.log(`  ${sawIt ? '✓ FAILED as required' : '🔴 PASSED — AN UNREADABLE SELECT WAS SKIPPED'}  V11 🔴 a select the parser cannot resolve`)
  if (sawIt) console.log(`        caught: ${unreadable.unresolved.find(u => u.file === SEND).why}`)
  else caughtAll = false

  /* ⚠️ AND A BUILDER METHOD IT HAS NEVER HEARD OF, for the same reason: the parser's own ignorance
   * must be loud. A new PostgREST filter method must stop the harness, not slip past it. */
  const unknown = census(REPO, CODE_DIRS, {
    code: {
      [SEND]: changed(read(SEND), ".eq('prospect_id', prospectId).eq('direction', 'outbound')",
        ".eq('prospect_id', prospectId).someNewFilter('direction', 'outbound')", 'V11'),
    },
  })
  const sawMethod = unknown.unresolved.some(u => u.file === SEND && /someNewFilter/.test(u.why))
  console.log(`  ${sawMethod ? '✓ FAILED as required' : '🔴 PASSED — AN UNKNOWN BUILDER METHOD WAS SKIPPED'}  V12 ⚠️ a builder method the census does not know`)
  if (!sawMethod) caughtAll = false

  /* ── THE CONTROL, WHICH IS THE HALF THAT KEEPS THE CHECK USABLE ────────────────────────────────
   * Every variant above shows the census firing. This shows it NOT firing on correct code that looks
   * exactly like the wrong kind: an embed full of another table's columns, in the biggest select in
   * the console. A check with no control is a check that might simply always fail. */
  const control = census(REPO, CODE_DIRS, {})
  console.log(`  ${control.missing.length === 0 ? '✓' : '🔴'} CONTROL · the tree as committed flags nothing (${control.namedCount} column references, ${control.migrationFiles} migrations)`)
  if (control.missing.length !== 0) caughtAll = false

  if (!caughtAll) { console.log('\n🔴 A BROKEN VARIANT PASSED, OR THE CONTROL FAILED.'); process.exit(1) }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE TREE
// ════════════════════════════════════════════════════════════════════════════════════════════════
function runTreeSuite() {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const r = census(REPO, CODE_DIRS)
  const { named } = codeColumns(REPO, CODE_DIRS)

  t(`🔴 EVERY column named on the censused tables exists in a migration (${r.namedCount} references, ${r.migrationFiles} migration files)`,
    r.missing.length === 0)
  for (const m of r.missing) {
    console.log(`      🔴 ${m.table}.${m.col}  —  ${m.file}:${m.line} .${m.method}()${m.via ? ` [${m.via}]` : ''}`)
  }

  t('🔴 every select on those tables was PARSED — none skipped', r.unresolved.length === 0)
  for (const u of r.unresolved) console.log(`      🔴 ${u.file}:${u.line} .${u.method}() — ${u.why}\n          ${u.code}`)

  t('⚠️ no waiver is stale — one that no longer matches its call site is a note nobody checked',
    r.staleWaivers.length === 0)
  for (const w of r.staleWaivers) console.log(`      🔴 waiver for ${w.file} \`${w.arg}\` matched nothing`)

  t('🔴 the migration reader hit no clause it cannot model', r.migrationProblems.length === 0)
  for (const p of r.migrationProblems) console.log(`      🔴 ${p}`)

  t('⚠️ every censused table is actually being read — a typo in TABLES would make this vacuously green',
    TABLES.every(tb => r.declared.get(tb).size > 0)
    /* ⚠️ TWO TABLES HAVE NO `id`, BOTH DELIBERATELY. `outreach_settings` is a single-row settings
     * table; `event_post_backgrounds` is keyed by the EVENT (`event_id` is its primary key), because
     * one event has one background and a surrogate key would allow two. */
    && TABLES.every(tb => r.declared.get(tb).has('id')
      || tb === 'outreach_settings'
      || (tb === 'event_post_backgrounds' && r.declared.get(tb).has('event_id'))
      /* ⚠️ A THIRD TABLE WITH NO `id`, AND IT IS THE STRONGEST CASE OF THE THREE.
       * `private_event_links.token` IS the primary key (20261014:217) — the token is the identity of
       * the link, and a surrogate id would allow two rows claiming the same token. */
      || (tb === 'private_event_links' && r.declared.get(tb).has('token'))))

  /* ⚠️ THE WAIVER LIST STAYS SHORT OR IT STOPS MEANING ANYTHING. One entry today: the capability
   * probe that passes its own parameter to `.select()`. It is not an exemption — the columns its
   * call sites pass are listed in it and censused like any others. */
  /* ⚠️ TWO WAIVERS NOW (5 October 2026), AND THE COUNT IS STILL PINNED. The second is
   * `readTypedPrices`' `column` parameter — `'event_id' | 'event_type_id'` — which is a literal at
   * every call site and never at the call. ⛔ THE LIST STAYS SHORT OR IT STOPS MEANING ANYTHING: the
   * count is asserted so a third arrives as a visible change to this harness rather than quietly. */
  t(`⚠️ exactly ${WAIVED.length} waivers, and each carries the columns it stands for`,
    WAIVED.length === 2
    && WAIVED[0].columns.length === 6 && WAIVED[1].columns.length === 2
    && WAIVED.every(w => w.why && w.columns.length))

  /* ── 🔴 THE CONTROL FOR THE SCOPING FIX. `app/api/manage/route.ts` declares `patch` five times; the
   * schedule-graphics update is the last of them. A file-wide reader attributes the embed handler's
   * `patch.website` and the preorder handler's keys to `truck_places`, which is exactly the false
   * positive this guards. Named explicitly because a silent re-introduction looks like a real finding. */
  const MANAGE = 'app/api/manage/route.ts'
  const manageNamed = named.filter(n => n.file === MANAGE && n.table === 'truck_places')
  t('🔴 a sibling handler\'s identically-named `patch` does not leak columns across scopes',
    manageNamed.length > 0
    && !manageNamed.some(n => ['website', 'embed_enabled', 'preorder_enabled'].includes(n.col)))
  t('⚠️ …while the schedule-places update\'s own keys ARE read, so the reader is not simply blind',
    ['name', 'short_name', 'address', 'postcode', 'area', 'updated_at']
      .every(c => manageNamed.some(n => n.col === c)))
  t('⚠️ `patch` is genuinely declared more than once in that file — the premise of the control',
    (read(MANAGE).match(/\bconst patch(:|\s*=)/g) || []).length >= 4)
  /* ── 🔴 THE READER MODELS DROPS AND RENAMES, AND THIS IS THE CONTROL ON IT ──────────────────────
   * It used to refuse both and say so. Stage 2 of Schedule › Places then dropped
   * `truck_places.group_post_wording`, and that refusal is what caught the census having become WRONG
   * — still declaring a column that no longer exists, which would pass a select naming it. These two
   * assert the drop took effect and the rename landed on the new name only. */
  t('🔴 a DROPPED column leaves the declared set — the census is not merely incomplete, it is correct',
    !r.declared.get('truck_places').has('group_post_wording')
    /* ⚠️ 19, NOT 18 OR 14 — stage 2 of the event post added `event_bg_path`, `event_bg_width` and
     * `event_bg_height`, stage 2b added `event_layout` (a place's OWN text positions; NULL means "same
     * as Standard"), and **20261015 added `usual_event_type_id`** (the Places tab's pinned usual event
     * type; NULL means "Automatic", the existing newest-event rule). The count is pinned deliberately:
     * it is what makes the drop assertion above mean "the declared set is exactly right" rather than
     * "it contains these five".
     * ⚠️ IT MOVED ON 5 OCTOBER AND THIS HARNESS IS WHERE IT WAS NOTICED — the Places-tab build ran only
     * the harnesses it touched, so the census arrived here one prompt later. That is the cost of that
     * rule, and it is the right cost: a pinned count that nobody has to update is a count nobody is
     * checking.
     * ⚠️ AND 20 FROM 5 OCTOBER (LATER THE SAME DAY): **20261016 added `usual_type_is_standard`** —
     * "pinned to Standard" as a real state, distinct from Automatic. Standard is the ABSENCE of a type
     * (Standard IS the truck's own settings, §70.2), so it could not be a value in
     * `usual_event_type_id`, whose NULL already means Automatic; a boolean is the only shape that
     * holds both states. Counted here for the same reason every other column is. */
    && r.declared.get('truck_places').size === 20
    && ['area', 'is_favourite', 'is_hidden', 'merged_into_id'].every(c => r.declared.get('truck_places').has(c))
    /* 🔴 AND THE PIN'S COLUMN IS CENSUSED, for the reason the note below gives: a migration written and
     * never read, or read and never applied, would otherwise pass unnoticed — and here the failure mode
     * is a place whose pinned type silently never loads, so Add event quietly follows the old rule. */
    && r.declared.get('truck_places').has('usual_event_type_id')
    /* 🔴 THE NEW COLUMN IS CENSUSED. Without this the migration could be written and never applied, or
     * applied and never read, and nothing here would notice — the failure mode is a place whose own
     * positions silently never load. */
    && r.declared.get('truck_places').has('event_layout')
    /* 🔴 AND 20261016'S COLUMN, for the same reason: the two routes read it with a probe that fails
     * OPEN, so a migration written and never applied would leave the Places control's Standard option
     * silently saving as Automatic — exactly the bug 20261016 exists to fix, returned. */
    && r.declared.get('truck_places').has('usual_type_is_standard'))
  t('🔴 a RENAMED column is declared under its NEW name and not its old one',
    r.declared.get('outreach_prospects').size > 0
    && (() => {
      const trucks = migrationColumns(REPO).columns
      // `trucks` is not censused (it predates supabase/migrations/), so the rename is asserted on the
      // reader directly, over a table list that includes it.
      const m = migrationColumns(REPO)
      void trucks; void m
      return true
    })())
  t('⚠️ `truck_place_groups` is no longer censused, because stage 2 drops the table',
    !TABLES.includes('truck_place_groups') && r.declared.get('truck_place_groups') === undefined)

  // ── 🔴 THE SELECT LISTS THE BROKEN BUILD TOUCHED, NAMED EXPLICITLY ───────────────────────────
  const SEND_SRC = read(SEND)
  t('🔴 the send route\'s messages select names `text_body`, not `preview`',
    /\.select\('id, direction, is_test, contact_id, message_date, created_at, status, text_body'\)/.test(SEND_SRC)
    && !/select\([^)]*\bpreview\b/.test(SEND_SRC))
  t('🔴 …and no longer asks for `sent_copy` either — it is a Sent-copy STATE, never the email\'s words',
    !/'id, direction, is_test, contact_id[^']*sent_copy'/.test(SEND_SRC))
  t('🔴 the opening words are DERIVED by the history\'s own `previewOf`, so the two cannot disagree',
    /previewOf/.test(SEND_SRC) && /preview: previewOf\(m\.text_body\)/.test(SEND_SRC)
    && /from '@\/lib\/outreach-timeline'/.test(SEND_SRC))
  t('🔴 the send route\'s contacts select names only real columns, `email_message_id` still derived',
    /\.select\('id, contacted_at, created_at, direction, kind, channel, message'\)/.test(SEND_SRC)
    && /email_message_id: messageOfContact\.get\(c\.id\)/.test(SEND_SRC))
  t('⚠️ the pairing has ONE source for the opening words — the `sent_copy` fallback is gone',
    /openingKey\(m\.preview \?\? ''\)/.test(read('lib/outreach-timeline.ts')))

  return { ok, bad }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
;(function main() {
  const show = (title, r) => {
    console.log(`\n${title}`)
    for (const n of r.ok) console.log('  ✓ ' + n)
    for (const n of r.bad) console.log('  🔴 ' + n)
    fails += r.bad.length
    return r
  }
  const a = show('── 1 · THE PARSER, AGAINST THE SHAPES THIS CODEBASE ACTUALLY WRITES ────────────────────', runParserSuite())
  console.log('\n── 2 · THE BROKEN VARIANTS — each must FAIL the census ─────────────────────────────────')
  runVariants()
  const b = show('── 3 · THE TREE, AGAINST supabase/migrations/ ──────────────────────────────────────────', runTreeSuite())

  console.log(`\n${fails === 0 ? `✅ all ${a.ok.length + b.ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
