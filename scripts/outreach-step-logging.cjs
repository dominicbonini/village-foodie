#!/usr/bin/env node
// scripts/outreach-step-logging.cjs — the step a send is logged as, the follow-up it schedules, and the
// banner's tense. Fixtures only: NO live prospect, NO send, NO NETWORK, NO DATABASE.
//   node scripts/outreach-step-logging.cjs
//
// ── 🔴 WHAT HAPPENED, AND WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// 🧪 Smother Spudders, 1 October 2026: a Chase 1 send was written to `outreach_contacts` as a SECOND
// `1_first_contact`. The cause was a select naming `email_message_id` on `outreach_contacts` — a column
// that does not exist (it is derived from `outreach_messages.contact_id`) — whose error was discarded by
// destructuring `{ data }` alone. PostgREST answered 42703 with `data: null`, `contacts` became `[]`, and
// an empty ladder is not an error to `nextStep`: it is a prospect who has never been contacted. So the
// server derived the LOWEST rung and `guardAlreadySent` had no priors to refuse against.
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    A REPEATED RUNG WRITTEN SILENTLY — it corrupts the ladder every later step is derived from, and the
//    guard that exists to stop it cannot see the data it needs;
//    an unreadable read deciding a step at all — the empty answer always picks "never contacted";
//    a follow-up scheduled from the step BEFORE the one that was sent (+3 instead of +7);
//    a banner that calls a future date overdue, which sends somebody to do work that is not due.

const fs = require('fs'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const ok = [], bad = []
const t = (n, c) => (c ? ok : bad).push(n)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const FILES = ['lib/outreach-step.ts', 'lib/outreach-sequence.ts', 'lib/outreach-workspace.ts', 'lib/outreach.ts']
function buildLib(root, tag) {
  const c = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already */ }
  return {
    P: c.req('lib/outreach-step.js'), S: c.req('lib/outreach-sequence.js'),
    W: c.req('lib/outreach-workspace.js'), O: c.req('lib/outreach.js'),
  }
}

// 🧪 THE LIVE SHAPE, AS FIXTURES. A hand-logged first contact with NO linked message row — the case the
// phantom column hid — on a frozen hu_map prospect, exactly like Smother Spudders.
const PROSPECT = {
  do_not_contact: false, stage: 'contacted', hatchgrab_truck_id: null,
  contact_email: 'hello@smotherspudders.example', hu_ordering: null, hu_map: true,
  show_on_vf: null, excluded: null, futureEventCount: null,
  lead_type_at_first_contact: 'hu_map',
}
const HAND_LOGGED = [{ contacted_at: '2026-09-16', created_at: '2026-09-16T00:00:00.000Z',
  channel: 'email', direction: 'outbound', kind: '1_first_contact', message: 'first approach' }]
const TODAY = new Date('2026-10-01T13:06:00.000Z')

function run({ P, S, W, O }) {
  // ── 1 · THE STEP AFTER A HAND-LOGGED FIRST CONTACT WITH NO MESSAGE ROW ───────────────────────────
  const step = P.nextStep(PROSPECT, HAND_LOGGED, TODAY)
  t('🔴 a hand-logged first contact with NO message row still counts as a rung',
    step.rungsDone === 1 && step.state !== 'unknown')
  t('🔴 …so the next step is Chase 1, never a second first contact', step.kind === '2_chase_1')
  t('⚠️ …and a midnight-UTC contacted_at is not lost to a date filter', (() => {
    const midnight = [{ ...HAND_LOGGED[0], contacted_at: '2026-09-16T00:00:00+00:00' }]
    return P.nextStep(PROSPECT, midnight, TODAY).kind === '2_chase_1'
  })())
  /* 🔴 THE SERVER'S DERIVATION IS `nextStep` OVER THE CONTACT ROWS, so what matters is that the rows
   * ARRIVE. An empty list is indistinguishable from a never-contacted prospect — which is precisely why
   * the read's error must refuse the send rather than fall through to this. */
  t('🔴 AND THE BUG REPRODUCES: an EMPTY contact list derives a FIRST CONTACT',
    P.nextStep(PROSPECT, [], TODAY).kind === '1_first_contact')

  // ── 2 · THE GUARD REFUSES A REPEATED RUNG ON EXACTLY THIS DATA ──────────────────────────────────
  const priors = HAND_LOGGED.map(c => ({ kind: c.kind, at: c.contacted_at, via: 'log' }))
  t('🔴 guardAlreadySent REFUSES a second 1_first_contact on this prospect\'s own rows', (() => {
    const g = S.guardAlreadySent({ step: '1_first_contact', priors })
    return g && g.kind === 'refuse' && /First contact has already gone/.test(g.message)
  })())
  t('⚠️ …and does NOT refuse the Chase 1 that is actually due',
    S.guardAlreadySent({ step: '2_chase_1', priors }) === null)
  t('🔴 …and with the priors MISSING it refuses nothing — the starved-guard case',
    S.guardAlreadySent({ step: '1_first_contact', priors: [] }) === null)

  // ── 3 · THE FOLLOW-UP IS THE INTERVAL OF THE STEP JUST SENT ─────────────────────────────────────
  // 🔴 `followUpDateFor` IS THE SHARED FUNCTION — the same one `nextStep` uses for `dueOn`, so the date
  // written after a send and the date the ladder expects cannot disagree.
  t('🔴 a Chase 1 send schedules +7, not the +3 that follows a first contact',
    O.followUpDateFor('2_chase_1', '2026-10-01') === '2026-10-08'
    && O.followUpDateFor('1_first_contact', '2026-10-01') === '2026-10-04')
  t('⚠️ …and the rest of the ladder follows FOLLOW_UP_DAYS',
    O.followUpDateFor('3_chase_2', '2026-10-01') === '2026-10-15'
    && O.FOLLOW_UP_DAYS['4_final_chase'] === null)
  t('🔴 …and the ladder AGREES: after a Chase 1 on 1 Oct, Chase 2 is due 8 Oct', (() => {
    const after = [...HAND_LOGGED, { contacted_at: '2026-10-01', created_at: '2026-10-01T13:06:00.000Z',
      channel: 'email', direction: 'outbound', kind: '2_chase_1', message: 'chase' }]
    const s2 = P.nextStep(PROSPECT, after, TODAY)
    return s2.kind === '3_chase_2' && s2.dueOn === '2026-10-08'
  })())
  t('🔴 …and the button then names Chase 2', (() => {
    const after = [...HAND_LOGGED, { contacted_at: '2026-10-01', created_at: '2026-10-01T13:06:00.000Z',
      channel: 'email', direction: 'outbound', kind: '2_chase_1', message: 'chase' }]
    return P.labelFor(P.nextStep(PROSPECT, after, TODAY).kind) === 'Chase 2'
  })())

  // ── 4 · A FUTURE next_action_at IS NEVER DUE OR OVERDUE ─────────────────────────────────────────
  const banner = (nextActionAt, step2) => W.nextAction({
    messages: [], step: step2 ?? null, channel: 'email', nextActionAt,
    linkedTruck: false, now: TODAY, today: '2026-10-01', contactName: null,
  })
  const future = banner('2026-10-08')
  t('🔴 a next_action_at a week out is a follow-up that is NOT due',
    future.kind === 'follow_up' && future.dueNow === false && future.daysOverdue === 0)
  t('🔴 …and its own label says neither "due today" nor "was due"',
    !/due today|was due|overdue/.test(future.label) && /8 Oct/.test(future.label))
  const dueToday = banner('2026-10-01')
  t('⚠️ today IS due, and says so', dueToday.kind === 'follow_up' && dueToday.dueNow === true)
  const late = banner('2026-09-28')
  t('⚠️ …and a past date is overdue, with the count', late.dueNow === true && late.daysOverdue === 3)
  return { ok, bad }
}

// ── THE WIRING, READ FROM SOURCE ──────────────────────────────────────────────────────────────────
function census(over = {}) {
  const o = [], b = []
  const tt = (n, c) => (c ? o : b).push(n)
  const SEND = over.SEND ?? stripComments(read('app/api/admin/outreach/mail-send/route.ts'))
  const PAGE = over.PAGE ?? stripComments(read('components/admin/ProspectWorkspace.tsx'))

  tt('🔴 the contacts select names NO phantom column',
    !/from\('outreach_contacts'\)[\s\S]{0,200}email_message_id/.test(SEND)
    && /select\('id, contacted_at, created_at, direction, kind, channel, message'\)/.test(SEND))
  /* 🔴 THE LOAD-BEARING HALF. Without this an unreadable ladder silently becomes "never contacted". */
  tt('🔴 an unreadable contact history REFUSES the send instead of guessing',
    /const \{ data: cRows, error: cErr \}/.test(SEND)
    && /if \(cErr\) \{[\s\S]{0,260}return refuse\(/.test(SEND))
  tt('🔴 …and so does an unreadable message history, which the guards read',
    /const \{ data: mRows, error: mErr \}/.test(SEND)
    && /if \(mErr\) \{[\s\S]{0,260}return refuse\(/.test(SEND))
  tt('🔴 `email_message_id` is DERIVED from messages.contact_id, as the timeline does',
    /const messageOfContact = new Map<string, string>\(\)/.test(SEND)
    && /messageOfContact\.get\(c\.id\) \?\? null/.test(SEND))
  tt('⚠️ …and the pairing is handed the derived rows, not the raw ones',
    /pairing: pairHandLoggedEmails\(\{ messages, contacts: contactsForPairing \}\)/.test(SEND))
  tt('🔴 the follow-up is derived from the kind just logged, through followUpDateFor',
    /followUpDateFor\(kind as LadderKind, today\)/.test(PAGE)
    && /: \(derived \?\? followUpDate\)/.test(PAGE))
  tt('⚠️ …and a deliberate chip choice still wins', /followUp !== null \? followUpDate/.test(PAGE))
  tt('🔴 the banner uses the scheduled label for a future follow-up',
    /if \(!n\.dueNow\) return n\.label/.test(PAGE)
    && /n\.dueNow \? `was due \$\{shortDate\(n\.due\)\}` : `scheduled for/.test(PAGE))
  // ── WHAT MAY NOT CHANGE ────────────────────────────────────────────────────────────────────────
  tt('🔴 one contact writer, one follow-up writer, one nextStep on the page',
    (SEND.match(/logOutreachContact\(/g) || []).length === 2
    && (PAGE.match(/const applyFollowUp = useCallback/g) || []).length === 1
    && (PAGE.match(/nextStep\(/g) || []).length === 1)
  tt('🔴 every sequence guard still runs, in one place', /evaluateGuards\(\{/.test(SEND))
  /* ⚠️ THE CONSTANT IS DEFINED IN lib/outreach-workspace.ts, NOT IN THE COMPONENT THAT USES IT — my
   * first draft of this check looked in outreach-shared.tsx and failed on correct code. The frame's
   * attribute is asserted where it is RENDERED, and the single token where it is DECLARED. */
  tt('🔴 EMAIL_FRAME_SANDBOX is allow-same-origin only, and the frame uses the constant', (() => {
    const W = stripComments(read('lib/outreach-workspace.ts'))
    const SH = stripComments(read('components/admin/outreach-shared.tsx'))
    /* ⚠️ AND IT DOES NOT BAN THE STRING "allow-scripts" FROM THE FILE, which my second draft did and
     * which failed on correct code: `FORBIDDEN_SANDBOX_TOKENS` legitimately LISTS that token as one of
     * the things no frame may carry. Banning the characters would have required deleting the guard that
     * enforces the rule. What must hold is the constant's VALUE and that the token stays forbidden. */
    return /export const EMAIL_FRAME_SANDBOX = 'allow-same-origin'/.test(W)
      && /FORBIDDEN_SANDBOX_TOKENS = \['allow-scripts'/.test(W)
      && /sandbox=\{EMAIL_FRAME_SANDBOX\}/.test(SH)
  })())
  tt('🔴 nothing sets do_not_contact automatically',
    !/do_not_contact: true/.test(SEND) && !/do_not_contact: true/.test(PAGE))
  return { ok: o, bad: b }
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST be caught ─────────────────────────────────────────────────────')
  const SEND0 = stripComments(read('app/api/admin/outreach/mail-send/route.ts'))
  const PAGE0 = stripComments(read('components/admin/ProspectWorkspace.tsx'))
  const variants = [
    ['W1 🔴 the phantom column comes back on the contacts select',
      { SEND: SEND0.replace("select('id, contacted_at, created_at, direction, kind, channel, message')",
        "select('id, contacted_at, created_at, direction, kind, channel, message, email_message_id')") }],
    ['W2 🔴 the contacts read stops checking its error — an empty ladder decides the step',
      { SEND: SEND0.replace('const { data: cRows, error: cErr }', 'const { data: cRows }')
        .replace(/if \(cErr\) \{[\s\S]*?\n    \}\n/, '') }],
    ['W3 🔴 the messages read stops checking its error',
      { SEND: SEND0.replace('const { data: mRows, error: mErr }', 'const { data: mRows }')
        .replace(/if \(mErr\) \{[\s\S]*?\n    \}\n/, '') }],
    ['W4 🔴 the follow-up goes back to the control\'s value whatever was sent',
      { PAGE: PAGE0.replace('      : (derived ?? followUpDate)', '      : followUpDate') }],
    ['W5 🔴 the banner calls a future follow-up "due today" again',
      { PAGE: PAGE0.replace('    if (!n.dueNow) return n.label', '') }],
  ]
  for (const [label, over] of variants) {
    for (const k of Object.keys(over)) {
      if (over[k] === (k === 'SEND' ? SEND0 : PAGE0)) {
        console.log(`🔴 ${label}: THE PATCH DID NOT APPLY — its anchor has drifted`); process.exit(1)
      }
    }
    const r = census(over)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ caught as required' : '🔴 NOT CAUGHT — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) fails++
  }

  const libs = buildLib(REPO, 'real')
  const show = (title, r) => {
    console.log(`\n${title}`)
    for (const n of r.ok) console.log('  ✓ ' + n)
    for (const n of r.bad) console.log('  🔴 ' + n)
    fails += r.bad.length
    return r
  }
  const a = show('── THE LADDER, THE GUARD, THE FOLLOW-UP AND THE BANNER ─────────────────────────────────', run(libs))
  const b = show('── THE WIRING ──────────────────────────────────────────────────────────────────────────', census())
  console.log(`\n${fails === 0 ? `✅ all ${a.ok.length + b.ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
