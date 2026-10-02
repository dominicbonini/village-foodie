#!/usr/bin/env node
// scripts/outreach-send-read-failure.cjs — a failed history read ASKS; it does not block.
//   node scripts/outreach-send-read-failure.cjs   (≈ 4 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//
// ── 🔴 FAILURE MODE, in the order it would hurt ────────────────────────────────────────────────────
//    THE SEND BUTTON DEAD FOR EVERY TRUCK, because one word in one select was not a column. That is
//    what happened: `outreach_messages.preview` → 42703 → "I could not read this prospect's sent
//    emails, so the duplicate checks cannot run. Nothing was sent." on every real send for a day.
//    🧪 3Bros Burgers, 2 October 2026.
//    THE OPPOSITE MISTAKE, which is worse and is the one this must not introduce: proceeding on an
//    unreadable ladder. An empty read is indistinguishable from "never contacted", so `nextStep`
//    derives `1_first_contact` and the send writes that rung — a Chase 1 logged as a second first
//    contact. 🧪 Smother Spudders, 1 October. Asking instead of refusing must not re-open that path.
//    A HARD REFUSAL GOING SOFT. No address, a linked truck, a test with no test recipient and a
//    schema violation in the email itself are not questions, and must stay refusals.
//
// ── WHAT IS ASSERTED ──────────────────────────────────────────────────────────────────────────────
//   1 · the columns — the select lists this build touched, asserted against the SCHEMA CENSUS
//       (scripts/_outreach-schema-census.cjs) rather than against a fixture that would agree with
//       anything;
//   2 · the guard — a read failure produces an ASKING guard, the ladder guards fall silent rather
//       than answering from rows nobody saw, confirming sends, and the override is recorded;
//   3 · the route — the two reads no longer refuse, the rung is not guessed, and every hard refusal
//       is still hard.
const fs = require('fs')
const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const { census, migrationColumns, codeColumns, CODE_DIRS } = require('./_outreach-schema-census.cjs')

let fails = 0
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const SEND = 'app/api/admin/outreach/mail-send/route.ts'
const TIMELINE = 'app/api/admin/outreach/timeline/route.ts'
const SEQ = 'lib/outreach-sequence.ts'

const FILES = ['lib/outreach-sequence.ts', 'lib/outreach-timeline.ts']
function buildLib(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return { S: req('lib/outreach-sequence.js'), T: req('lib/outreach-timeline.js') }
}

// 🧪 THE REAL SENTENCE PostgREST RETURNED, as Dominic read it on 3Bros Burgers.
const REASON_42703 = 'sent emails — 42703 column outreach_messages.preview does not exist'
const REASON_TIMEOUT = 'contact history — 57014 canceling statement due to statement timeout'

const step = (over = {}) => ({
  state: 'due', kind: '2_chase_1', dueOn: null, channel: 'email',
  leadType: 'hu_ordering', leadTypeFrozen: false, stopReason: null, rungsDone: 1, blindRows: 0,
  label: 'Chase 1 — due now', ...over,
})
const guards = (S, over = {}) => S.evaluateGuards({
  isReply: false, step: step(), priors: [], lastEmailAt: null,
  address: 'hello@3brosburgers.example', others: [], now: new Date('2026-10-02T10:00:00Z'), ...over,
})

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE SELECT LISTS, AGAINST THE CENSUS
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * 🔴 ASSERTED AGAINST THE MIGRATIONS, NOT AGAINST A FIXTURE. This is the check that was missing: the
 * recorded-steps build's harness asserted `/preview, sent_copy/` on this very select — it pinned the
 * bug in place and reported green, because a JavaScript fixture has whatever property the code asks of
 * it. Every column below is checked against supabase/migrations/ instead.
 */
function runColumnSuite() {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const declared = migrationColumns(REPO).columns
  const { named } = codeColumns(REPO, CODE_DIRS)

  // Every column either route names on the two tables the broken build widened.
  const touched = named.filter(n => (n.file === SEND || n.file === TIMELINE)
    && (n.table === 'outreach_messages' || n.table === 'outreach_contacts'))
  const unknown = touched.filter(n => !declared.get(n.table).has(n.col))
  t(`🔴 every column the SEND and TIMELINE routes name on messages/contacts exists (${touched.length} references)`,
    unknown.length === 0)
  for (const u of unknown) console.log(`      🔴 ${u.table}.${u.col} — ${u.file}:${u.line} .${u.method}()`)

  const colsAt = (file, re) => {
    const line = read(file).split('\n').findIndex(l => re.test(l)) + 1
    return line === 0 ? null : named.filter(n => n.file === file && n.line === line).map(n => n.col)
  }

  // ── THE ONE THAT BROKE, NAMED COLUMN BY COLUMN ───────────────────────────────────────────────
  const sendMsgs = colsAt(SEND, /\.select\('id, direction, is_test, contact_id, message_date, created_at, status,/)
  t('🔴 the send route\'s outbound-messages select is exactly the eight real columns it needs', sendMsgs
    && sendMsgs.slice().sort().join(',') === ['id', 'direction', 'is_test', 'contact_id', 'message_date', 'created_at', 'status', 'text_body'].sort().join(','))
  t('🔴 …`preview` is not among them, and is declared in no migration',
    sendMsgs && !sendMsgs.includes('preview') && !declared.get('outreach_messages').has('preview'))
  t('⚠️ …nor `sent_copy`, which is a Sent-copy STATE (server_filed|appended|absent), never the words',
    sendMsgs && !sendMsgs.includes('sent_copy'))
  t('🔴 `text_body` IS a column, and is the one the timeline has always derived the preview from',
    declared.get('outreach_messages').has('text_body')
    && /preview: previewOf\(r\.text_body\)/.test(read(TIMELINE)))

  const sendContacts = colsAt(SEND, /\.select\('id, contacted_at, created_at, direction, kind, channel, message'\)/)
  t('🔴 the send route\'s contacts select is the seven real columns the pairing needs', sendContacts
    && sendContacts.slice().sort().join(',') === ['id', 'contacted_at', 'created_at', 'direction', 'kind', 'channel', 'message'].sort().join(','))
  t('🔴 …and `email_message_id` is DERIVED from `messages.contact_id`, never selected',
    sendContacts && !sendContacts.includes('email_message_id')
    && !declared.get('outreach_contacts').has('email_message_id')
    && /email_message_id: messageOfContact\.get\(c\.id\) \?\? null/.test(read(SEND)))

  t('⚠️ the whole tree is clean, not just these two routes', census(REPO, CODE_DIRS).missing.length === 0)
  return { ok, bad }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE GUARD
// ════════════════════════════════════════════════════════════════════════════════════════════════
function runGuardSuite({ S }) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)

  // ── IT ASKS ──────────────────────────────────────────────────────────────────────────────────
  const g = guards(S, { historyUnreadable: REASON_42703 })
  t('🔴 A READ FAILURE PRODUCES A GUARD, AND IT ASKS — `confirm`, not `refuse`',
    g.length === 1 && g[0].id === 'history_unreadable' && g[0].kind === 'confirm')
  t('🔴 …and it is the "not before it is due" shape: it says what it could not check, and asks',
    g[0] && /^I couldn't check this truck's earlier emails, so I can't confirm this step hasn't already gone \(reason: .+\)\. Send anyway\?$/.test(g[0].message))
  t('⚠️ …carrying the REASON, because a 42703 is a build to fix and a timeout is a retry',
    g[0] && g[0].message.includes('42703 column outreach_messages.preview does not exist'))
  t('⚠️ any reason at all, not just a schema one — a timeout reads the same way',
    (() => { const x = guards(S, { historyUnreadable: REASON_TIMEOUT }); return x.length === 1 && x[0].message.includes('statement timeout') })())
  t('🔴 NO guard is a `refuse` on this path — nothing here can block a send',
    g.every(x => x.kind === 'confirm'))

  // ── THE CONTROL: a readable history behaves exactly as it did ────────────────────────────────
  t('🔴 CONTROL · with the history readable, this guard is silent and nothing else moves',
    guards(S, { historyUnreadable: null }).length === 0
    && guards(S, {}).length === 0
    && guards(S, { historyUnreadable: '' }).length === 0
    && guards(S, { historyUnreadable: '   ' }).length === 0)
  t('⚠️ …and `guardHistoryUnreadable` itself returns null for an empty reason rather than an empty sentence',
    S.guardHistoryUnreadable({ reason: null }) === null && S.guardHistoryUnreadable({ reason: undefined }) === null)

  /* ── 🔴 THE LADDER GUARDS FALL SILENT RATHER THAN ANSWERING FROM ROWS NOBODY SAW ──────────────
   * This is the half that is easy to get wrong. With no rows, `priors` is empty and `step` came off
   * an empty ladder, so `already_sent`, `not_due` and `after_final` would ALL return null — and the
   * send would look clean. Three guards saying "no problem" about rows they never read is the defect;
   * one guard saying it could not look is the fix. */
  const withPriors = {
    priors: [{ kind: '2_chase_1', at: '2026-09-28T09:00:00Z', via: 'log' }],
    step: step({ state: 'scheduled', dueOn: '2026-10-20' }),
    lastEmailAt: '2026-09-28T09:00:00Z',
  }
  const clean = guards(S, withPriors)
  t('🧪 CONTROL · those same inputs with a readable history refuse (already_sent) and warn (not_due)',
    clean.some(x => x.id === 'already_sent' && x.kind === 'refuse') && clean.some(x => x.id === 'not_due'))
  const dirty = guards(S, { ...withPriors, historyUnreadable: REASON_42703 })
  t('🔴 …and with the read FAILED, only `history_unreadable` speaks — no ladder guard answers',
    dirty.length === 1 && dirty[0].id === 'history_unreadable')

  t('⚠️ `shared_address` STILL RUNS — it comes from a different read, about a third party', (() => {
    const x = guards(S, {
      historyUnreadable: REASON_42703,
      others: [{ prospectName: 'Pig-Casso\'s', address: 'hello@3brosburgers.example', lastOutboundAt: '2026-09-30T09:00:00Z' }],
    })
    return x.length === 2 && x.some(y => y.id === 'history_unreadable') && x.some(y => y.id === 'shared_address')
  })())

  /* ⚠️ A REPLY IS NOT EXEMPT, unlike the three guards it replaces. `isReply` is derived from the
   * contacts read, so on a failed read it is `false` whatever the truth is — exempting a reply would
   * mean trusting the very read that failed. */
  t('⚠️ it fires on a REPLY too, because `isReply` itself came from the read that failed', (() => {
    const x = guards(S, { isReply: true, historyUnreadable: REASON_42703 })
    return x.length === 1 && x[0].id === 'history_unreadable'
  })())
  t('🧪 CONTROL · a reply with a readable history still skips the ladder guards, as it always did',
    guards(S, { isReply: true, ...withPriors }).length === 0)

  // ── CONFIRMING SENDS, AND THE OVERRIDE IS RECORDED ───────────────────────────────────────────
  /* 🔴 THE ROUTE'S OWN TWO EXPRESSIONS, run against the real guards. The source assertions in §3 are
   * what tie these two lines to the route; this is what they do once tied. */
  const fired = guards(S, { historyUnreadable: REASON_42703 })
  const blocking = (over) => fired.filter(x => !over.includes(x.id))
  t('🔴 unconfirmed, it blocks the send and nothing is written', blocking([]).length === 1)
  t('🔴 CONFIRMED, IT SENDS — `override: [\'history_unreadable\']` leaves nothing blocking',
    blocking(['history_unreadable']).length === 0)
  const waved = fired.filter(x => ['history_unreadable'].includes(x.id))
  const payload = waved.map(x => ({ id: x.id, message: x.message }))
  t('🔴 and the override is RECORDED in `guard_override`, with the sentence that was on screen',
    payload.length === 1 && payload[0].id === 'history_unreadable'
    && payload[0].message.includes('42703 column outreach_messages.preview does not exist'))
  t('⚠️ `parseGuardOverride` accepts it, so the reading panel shows the grey line rather than throwing',
    (() => {
      const { T } = LIBS
      const back = T.parseGuardOverride(JSON.parse(JSON.stringify(payload)))
      return back && back.length === 1 && back[0].id === 'history_unreadable' && back[0].message === payload[0].message
    })())
  t('⚠️ a DIFFERENT guard waved does not carry this one through — the ids are matched, not counted', (() => {
    const x = guards(S, {
      historyUnreadable: REASON_42703,
      others: [{ prospectName: 'Pig-Casso\'s', address: 'hello@3brosburgers.example', lastOutboundAt: '2026-09-30T09:00:00Z' }],
    })
    return x.filter(y => !['shared_address'].includes(y.id)).length === 1
  })())

  t('⚠️ `history_unreadable` is a declared GuardId, so a typo at the call site is a compile error',
    /'history_unreadable'/.test(read(SEQ).match(/export type GuardId =[^\n]*/)[0]))

  return { ok, bad }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE ROUTE
// ════════════════════════════════════════════════════════════════════════════════════════════════
function runRouteSuite() {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const SRC = stripComments(read(SEND))

  // ── THE TWO READS NO LONGER REFUSE ───────────────────────────────────────────────────────────
  t('🔴 NEITHER HISTORY READ RETURNS A REFUSAL ANY MORE — the two sentences are gone',
    !/could not read this prospect's contact history/.test(SRC)
    && !/could not read this prospect's sent emails/.test(SRC))
  t('🔴 both failures are collected as a REASON instead',
    /unreadable\.push\(`contact history — \$\{readFailure\(/.test(SRC)
    && /unreadable\.push\(`sent emails — \$\{readFailure\(/.test(SRC))
  t('⚠️ …from `error` AND from a THROW, because "for any reason" includes a rejected promise',
    (SRC.match(/catch \(e\) \{ unreadable\.push\(/g) || []).length === 2
    && (SRC.match(/if \(r\.error\) unreadable\.push\(/g) || []).length === 2)
  t('🔴 the reason reaches the guards, as one argument', /historyUnreadable,/.test(SRC)
    && /const historyUnreadable = unreadable\.length > 0 \? unreadable\.join\('; '\) : null/.test(SRC))
  t('⚠️ the reason carries PostgREST\'s code when there is one, and an Error\'s message otherwise',
    /const readFailure = \(e: unknown\): string/.test(SRC) && /code \? `\$\{code\} \$\{msg\}` : msg/.test(SRC))

  /* ── 🔴 AND THE RUNG IS NOT GUESSED. The Smother Spudders half. ───────────────────────────── */
  t('🔴 `derivedKind` IS NOT TAKEN FROM A LADDER THAT COULD NOT BE READ',
    /if \(step\.kind && !historyUnreadable && \(!replyParent \|\| !inConversation\)\) derivedKind = step\.kind/.test(SRC))
  t('🔴 …so `loggedKindFor` falls back to the step the OPERATOR chose, not to `1_first_contact`',
    /const sendKind = loggedKindFor\(\{/.test(SRC) && /clientKind: typeof body\.kind === 'string'/.test(SRC)
    && /return input\.stepKind \?\? input\.clientKind \?\? null/.test(stripComments(read(SEQ))))

  // ── THE OVERRIDE PATH IS THE ONE THAT ALREADY EXISTED ────────────────────────────────────────
  t('🔴 the waved guards are filtered by id and stored with their sentences — unchanged',
    /const wavedGuards = firedGuards\.filter\(g => overrides\.includes\(g\.id\)\)/.test(SRC)
    && /guard_override: wavedGuards\.map\(g => \(\{ id: g\.id, message: g\.message \}\)\)/.test(SRC))
  t('🔴 the blocking set is still "fired minus overridden", so confirming sends',
    /const blocking = firedGuards\.filter\(g => !overrides\.includes\(g\.id\)\)/.test(SRC))
  t('⚠️ the override column is still PROBED, so a database without it records nothing rather than 500ing',
    /canStoreOverride = wavedGuards\.length > 0 && await messagesHaveGuardOverride\(\)/.test(SRC))

  // ── THE HARD REFUSALS STAY HARD ──────────────────────────────────────────────────────────────
  /* 🔴 THE LIST THE BRIEF NAMES. These are not questions: there is nothing to send TO, nothing that
   * may be sent to, nowhere for a test to go, and nothing that would survive the frame. */
  t('🔴 no address → still a refusal', /This prospect has no email address on its truck row\./.test(read('lib/outreach-send-rules.ts')))
  t('🔴 a linked/live HatchGrab truck → still a refusal', /linked to a HatchGrab truck, so outreach is never sent to it/.test(read('lib/outreach-send-rules.ts')))
  t('🔴 do-not-contact → still a refusal', /marked do not contact/.test(read('lib/outreach-send-rules.ts')))
  t('🔴 a test with no test recipient → still a refusal',
    /if \(isTest && !testRecipient\) return refuse\('OUTREACH_TEST_RECIPIENT is not set/.test(SRC))
  t('🔴 a schema violation in the email itself → still a refusal (malformed + unresolved tokens)',
    /if \(malformed\.length\) return refuse\(/.test(SRC) && /if \(mustResolve\.length\) return refuse\(/.test(SRC)
    && /if \(literal\) return refuse\(literal\)/.test(SRC))
  t('🔴 and the prospect refusal is still consulted before anything is built',
    /const blocked = prospectRefusal\(\{/.test(SRC) && /if \(blocked\) return refuse\(blocked\.refusal\)/.test(SRC))

  // ── TEST SENDS, AND THE STANDING RULES ───────────────────────────────────────────────────────
  t('🔴 A TEST SEND IS UNAFFECTED — the whole guard block is still inside `if (!isTest)`', (() => {
    const i = SRC.indexOf('let firedGuards: Guard[] = []')
    const j = SRC.indexOf('if (!isTest) {', i)
    const k = SRC.indexOf('historyUnreadable,', j)
    return i > 0 && j > i && k > j
  })())
  /* ⚠️ ONE SEND PATH. `deliver` appears twice — the compose send and the Retry action — and that is
   * the point of it: both go through the ONE function in lib/outreach-mail-deliver.ts that owns the
   * socket. What matters is that this route never talks to a mail server itself. */
  t('⚠️ ONE SEND PATH: every send goes through `deliver`, and this route opens no transport of its own',
    (SRC.match(/await deliver\(/g) || []).length === 2
    && !/nodemailer|createTransport|sendMail/.test(SRC))
  t('⚠️ ONE CONTACT WRITER: `logOutreachContact` only, and nothing inserts outreach_contacts here',
    /logOutreachContact\(/.test(SRC) && !/from\('outreach_contacts'\)\s*\.insert/.test(SRC))
  /* ⚠️ ONE FOLLOW-UP WRITER. The follow-up date is `next_action_at`, written by the ladder
   * side-effects inside `logOutreachContact` (lib/outreach-contact-log.ts) and nowhere else on a send.
   * The send route must not write it directly — that is the duplicate writer the rule is about. */
  t('⚠️ ONE FOLLOW-UP WRITER: the send route never writes `next_action_at` itself',
    !/next_action_at/.test(SRC)
    && /next_action_at: followUpDateFor\(input\.kind, contactedAt\)/.test(read('lib/outreach-contact-log.ts')))
  /* ⚠️ THE SEND'S follow-up writer is the one above. The console also writes `next_action_at` when
   * Dominic picks a date by hand (app/api/admin/outreach/route.ts), which is a different act by a
   * different actor and not a second writer for a send. What must not exist is a THIRD: a send that
   * sets the date beside `logOutreachContact`, so the date depends on which button was pressed. */
  t('⚠️ …and `next_action_at` is written in exactly two places: the log path, and the operator\'s own picker',
    (() => {
      const hits = require('child_process').execFileSync('grep',
        ['-rn', '--include=*.ts', '--include=*.tsx', 'next_action_at =\\|next_action_at:', 'lib', 'app', 'components'],
        { cwd: REPO, encoding: 'utf8' }).trim().split('\n')
      const writes = hits.filter(h => /patch\.next_action_at =|\{ next_action_at: followUpDateFor/.test(h))
      return writes.length === 2
        && writes.some(h => h.startsWith('lib/outreach-contact-log.ts'))
        && writes.some(h => h.startsWith('app/api/admin/outreach/route.ts'))
    })())
  t('🔴 NOTHING WRITES `outreach_templates`', !/from\('outreach_templates'\)\s*\.(insert|update|upsert|delete)/.test(read(SEND)))
  t('🔴 EMAIL_FRAME_SANDBOX IS UNTOUCHED BY THIS BUILD',
    (() => { try { return require('child_process').execFileSync('git', ['diff', 'HEAD', '--', 'lib/outreach-mail-message.ts'], { cwd: REPO, encoding: 'utf8' }).trim() === '' } catch { return true } })())

  return { ok, bad }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE BROKEN VARIANTS — the behavioural ones, on a recompiled lib
// ════════════════════════════════════════════════════════════════════════════════════════════════
function changed(src, from, to, tag) {
  if (!src.includes(from)) { console.log(`🔴 ${tag}: THE ANCHOR IS GONE — \`${from.slice(0, 70)}\``); process.exit(1) }
  return src.split(from).join(to)
}

function runVariants() {
  const os = require('os')
  const SEQ_SRC = read(SEQ)
  const variants = [
    ['W1 🔴 the guard refuses instead of asking', changed(SEQ_SRC,
      "    id: 'history_unreadable', kind: 'confirm',", "    id: 'history_unreadable', kind: 'refuse',", 'W1'),
      S => guards(S, { historyUnreadable: REASON_42703 }).some(g => g.kind === 'refuse')],
    ['W2 🔴 the ladder guards answer from rows nobody read', changed(SEQ_SRC,
      '  if (!isReply && !unreadable) {', '  if (!isReply) {', 'W2'),
      S => {
        const x = S.evaluateGuards({
          isReply: false, step: step({ state: 'scheduled', dueOn: '2026-10-20' }),
          priors: [], lastEmailAt: null, address: null, others: [],
          now: new Date('2026-10-02T10:00:00Z'), historyUnreadable: REASON_42703,
        })
        return x.length > 1
      }],
    ['W3 🔴 the reason is dropped from the sentence', changed(SEQ_SRC,
      '      + ` gone (reason: ${reason}). Send anyway?`,', '      + \' gone. Send anyway?\',', 'W3'),
      S => !guards(S, { historyUnreadable: REASON_42703 })[0].message.includes('42703')],
    ['W4 🔴 an empty reason invents a guard out of nothing', changed(SEQ_SRC,
      '  if (!reason) return null', '  if (reason === undefined) return null', 'W4'),
      S => guards(S, { historyUnreadable: '' }).length > 0],
  ]

  /* ⚠️ THE WHOLE OF `lib/` IS COPIED, not just the two entry files. `outreach-sequence.ts` imports
   * `@/lib/outreach` and `@/lib/outreach-step`, which import further; a root holding only the entries
   * fails to COMPILE, and a compile failure is not the same proof as a guard behaving wrongly. */
  let caughtAll = true
  for (const [label, src, detect] of variants) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readfail-'))
    fs.cpSync(path.join(REPO, 'lib'), path.join(root, 'lib'), { recursive: true })
    fs.writeFileSync(path.join(root, SEQ), src)
    const { S } = buildLib(root, label.slice(0, 2))
    let caught = false
    try { caught = detect(S) } catch { caught = true }
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    if (!caught) caughtAll = false
  }

  // ── AND THE SOURCE VARIANTS, for the route's own two lines ───────────────────────────────────
  const SEND_SRC = read(SEND)
  const srcVariants = [
    ['W5 🔴 the messages read refuses again', changed(SEND_SRC,
      "      if (r.error) unreadable.push(`sent emails — ${readFailure(r.error)}`)",
      "      if (r.error) return refuse(`I could not read this prospect's sent emails. Nothing was sent.`)", 'W5'),
      s => !/could not read this prospect's sent emails/.test(stripComments(s))],
    ['W6 🔴 the rung is derived from a ladder that could not be read', changed(SEND_SRC,
      'if (step.kind && !historyUnreadable && (!replyParent || !inConversation)) derivedKind = step.kind',
      'if (step.kind && (!replyParent || !inConversation)) derivedKind = step.kind', 'W6'),
      s => /if \(step\.kind && !historyUnreadable && \(!replyParent \|\| !inConversation\)\)/.test(stripComments(s))],
    ['W7 🔴 the reason never reaches the guards', changed(SEND_SRC,
      '      historyUnreadable,\n    })', '    })', 'W7'),
      s => /historyUnreadable,/.test(stripComments(s))],
  ]
  for (const [label, src, stillTrue] of srcVariants) {
    const caught = !stillTrue(src)
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    if (!caught) caughtAll = false
  }

  if (!caughtAll) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
let LIBS
;(function main() {
  console.log('── THE BROKEN VARIANTS — each must FAIL ────────────────────────────────────────────────')
  runVariants()

  LIBS = buildLib(REPO, 'real')
  const show = (title, r) => {
    console.log(`\n${title}`)
    for (const n of r.ok) console.log('  ✓ ' + n)
    for (const n of r.bad) console.log('  🔴 ' + n)
    fails += r.bad.length
    return r
  }
  const a = show('── 1 · THE COLUMNS, AGAINST THE MIGRATIONS ─────────────────────────────────────────────', runColumnSuite())
  const b = show('── 2 · THE GUARD THAT ASKS ─────────────────────────────────────────────────────────────', runGuardSuite(LIBS))
  const c = show('── 3 · THE ROUTE, AND WHAT STAYS A REFUSAL ─────────────────────────────────────────────', runRouteSuite())

  console.log(`\n${fails === 0 ? `✅ all ${a.ok.length + b.ok.length + c.ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
