#!/usr/bin/env node
// scripts/outreach-recorded-steps.cjs — one rule for "is this email already a recorded step", the
// override on the message row, and "Record as ▾" as a list.
//   node scripts/outreach-recorded-steps.cjs   (≈ 4 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//
// ── 🔴 FAILURE MODE, in the order it would hurt ────────────────────────────────────────────────────
//    AN EMAIL RECORDED TWICE — two rungs on the ladder for one email, which moves every later
//    follow-up date and can send the same chase again;
//    a guard warning about an email that IS recorded (the Guerrilla Kitchen report): a warning that is
//    wrong on correct data is one Dominic learns to wave through, and the next one is real;
//    the Record button naming the PROSPECT'S step rather than the email's, so the same email is offered
//    as Chase 1 before a chase and Chase 2 after it;
//    an override written as a `note`, which puts a record of a decision in the one place that offers
//    Edit and Delete on it.
//
// 🧪 THE SHAPE EVERY CASE HERE IS BUILT FROM is the real one: Guerrilla Kitchen, 15 September 2026 — a
// first contact sent from Outlook and logged BY HAND (a contact row with no linked message), then the
// same email imported later as a message row with `contact_id` null.

const fs = require('fs')
const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const FILES = ['lib/outreach-timeline.ts', 'lib/outreach-sequence.ts']
function buildLib(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return { T: req('lib/outreach-timeline.js'), S: req('lib/outreach-sequence.js') }
}

const KINDS = ['1_first_contact', '2_chase_1', '3_chase_2', '4_final_chase']
const DAY = '2026-09-15'

/** The Guerrilla Kitchen shape: one imported email, one hand-logged contact, same London day. */
function guerrilla() {
  return {
    messages: [{
      id: 'm1', direction: 'outbound', status: 'sent', is_test: false, contact_id: null,
      message_date: `${DAY}T09:12:00.000Z`, preview: 'I run villagefoodie.co.uk and wondered…',
    }],
    contacts: [{
      id: 'c1', direction: 'outbound', channel: 'email', kind: '1_first_contact',
      contacted_at: DAY, created_at: `${DAY}T09:30:00.000Z`,
      message: 'I run villagefoodie.co.uk and wondered…', email_message_id: null,
    }],
  }
}

function runLibSuite({ T, S }) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const recorded = (input) => T.recordedStepsFor({
    ...input, ladderKinds: KINDS, pairing: T.pairHandLoggedEmails(input),
  })

  // ── 1 · ONE RULE FOR "IS THIS EMAIL ALREADY A RECORDED STEP" ─────────────────────────────────
  const g = recorded(guerrilla())
  t('🔴 THE REPORTED SHAPE: the hand-logged first contact + its imported email is RECORDED, as First contact',
    g.get('m1')?.kind === '1_first_contact')
  t('🔴 …and it says HOW, so the panel can add "(logged by hand, 15 Sep)"',
    g.get('m1')?.how === 'paired' && g.get('m1')?.contact?.id === 'c1')
  t('⚠️ …and the pairing is the HISTORY\'s own function, so the two cannot disagree', (() => {
    const input = guerrilla()
    const p = T.pairHandLoggedEmails(input)
    return p.pairs.get('m1')?.id === 'c1' && p.hidden.has('c1')
  })())

  t('🔴 a message with contact_id is recorded as that contact\'s kind', (() => {
    const r = recorded({
      messages: [{ id: 'm1', direction: 'outbound', status: 'sent', is_test: false, contact_id: 'c9' }],
      contacts: [{ id: 'c9', direction: 'outbound', channel: 'email', kind: '2_chase_1', contacted_at: DAY }],
    })
    return r.get('m1')?.kind === '2_chase_1' && r.get('m1')?.how === 'linked'
  })())
  t('🔴 an UNRECORDED Outlook email is absent from the map — the Record button is for exactly these', (() => {
    const r = recorded({
      messages: [{ id: 'm1', direction: 'outbound', status: 'sent', is_test: false, contact_id: null, message_date: `${DAY}T09:00:00Z` }],
      contacts: [],
    })
    return !r.has('m1')
  })())
  /* 🔴 `reply` SITS OUTSIDE THE LADDER ON PURPOSE. An email logged as a reply has had NO rung
   * recorded for it, so it must still be offered one; calling it recorded would strand the ladder. */
  t('🔴 a `reply` contact is NOT a recorded step — it is not a rung', (() => {
    const r = recorded({
      messages: [{ id: 'm1', direction: 'outbound', status: 'sent', is_test: false, contact_id: null, message_date: `${DAY}T09:00:00Z` }],
      contacts: [{ id: 'c1', direction: 'outbound', channel: 'email', kind: 'reply', contacted_at: DAY, message: 'x' }],
    })
    return !r.has('m1')
  })())
  t('⚠️ a test send is never recorded, and never pairs', (() => {
    const i = guerrilla(); i.messages[0].is_test = true
    return !recorded(i).has('m1')
  })())
  t('⚠️ an inbound message is never a recorded STEP', (() => {
    const r = recorded({
      messages: [{ id: 'm1', direction: 'inbound', status: 'received', is_test: false, contact_id: null, message_date: `${DAY}T09:00:00Z` }],
      contacts: [{ id: 'c1', direction: 'inbound', channel: 'email', kind: '1_first_contact', contacted_at: DAY, message: 'x' }],
    })
    return !r.has('m1')
  })())
  /* 🔴 AMBIGUITY PAIRS NOTHING — the history's rule, kept, for the same reason: a wrong pairing hides
   * a record, and here it would ALSO silence a guard about a genuinely unrecorded email. */
  t('🔴 AN AMBIGUOUS DAY COUNTS NOTHING AS PAIRED — two emails, one hand log, different words', (() => {
    const r = recorded({
      messages: [
        { id: 'm1', direction: 'outbound', status: 'sent', is_test: false, contact_id: null, message_date: `${DAY}T09:00:00Z`, preview: 'First approach about the map' },
        { id: 'm2', direction: 'outbound', status: 'sent', is_test: false, contact_id: null, message_date: `${DAY}T17:00:00Z`, preview: 'Something else entirely' },
      ],
      contacts: [{ id: 'c1', direction: 'outbound', channel: 'email', kind: '1_first_contact', contacted_at: DAY, message: 'A third unrelated wording' }],
    })
    return r.size === 0
  })())
  t('⚠️ …but the OPENING WORDS resolve an ambiguous day when they match exactly one email', (() => {
    const r = recorded({
      messages: [
        { id: 'm1', direction: 'outbound', status: 'sent', is_test: false, contact_id: null, message_date: `${DAY}T09:00:00Z`, preview: 'I run villagefoodie.co.uk and wondered…' },
        { id: 'm2', direction: 'outbound', status: 'sent', is_test: false, contact_id: null, message_date: `${DAY}T17:00:00Z`, preview: 'Something else entirely' },
      ],
      contacts: [{ id: 'c1', direction: 'outbound', channel: 'email', kind: '1_first_contact', contacted_at: DAY, message: 'I run villagefoodie.co.uk and wondered…' }],
    })
    return r.get('m1')?.kind === '1_first_contact' && !r.has('m2')
  })())

  // ── 1b · THE GUARDS READ THE SAME ANSWER ─────────────────────────────────────────────────────
  /* 🔴 THE FIX IS ONE LINE AT THE CALL SITE: a paired message's prior carries the rung it was
   * recorded as instead of `null`. Both guards select on `kind`, so neither needed changing —
   * `guardUnattributed` stops seeing it as loose and `guardAlreadySent` counts it as that step. */
  const priorsFor = (input) => {
    const r = recorded(input)
    return [
      ...input.contacts.filter(c => c.direction !== 'inbound')
        .map(c => ({ kind: c.kind ?? null, at: c.contacted_at ?? c.created_at ?? null, via: 'log' })),
      ...input.messages.filter(m => !m.contact_id).map(m => ({
        kind: r.get(m.id)?.kind ?? null, at: m.message_date ?? null, via: 'mailbox', isTest: m.is_test === true,
      })),
    ]
  }
  const now = new Date('2026-10-01T09:00:00Z')
  const gp = priorsFor(guerrilla())
  t('🔴 THE REPORTED WARNING IS GONE: no unattributed warning for the Guerrilla Kitchen shape',
    S.guardUnattributed({ step: '2_chase_1', priors: gp, now, sinceIso: S.lastRungAt(gp) }) === null)
  t('🔴 …and `guardAlreadySent` counts it as the step it was RECORDED as',
    S.guardAlreadySent({ step: '1_first_contact', priors: gp })?.kind === 'refuse'
    && S.guardAlreadySent({ step: '2_chase_1', priors: gp }) === null)
  /* ⚠️ THE GUARD MUST STILL FIRE on an email nothing accounts for — that is what it is FOR, and a fix
   * that silenced it generally would be worse than the false positive it replaced. */
  t('🔴 a genuinely unattributed Outlook email STILL warns', (() => {
    const input = {
      messages: [{ id: 'm1', direction: 'outbound', status: 'sent', is_test: false, contact_id: null, message_date: '2026-09-20T09:00:00Z' }],
      contacts: [{ id: 'c1', direction: 'outbound', channel: 'email', kind: '1_first_contact', contacted_at: '2026-09-10', message: 'x' }],
    }
    const p = priorsFor(input)
    return S.guardUnattributed({ step: '2_chase_1', priors: p, now, sinceIso: S.lastRungAt(p) })?.kind === 'confirm'
  })())
  t('⚠️ …and an ambiguous day still warns, because nothing there is recorded', (() => {
    const input = {
      messages: [
        { id: 'm1', direction: 'outbound', status: 'sent', is_test: false, contact_id: null, message_date: `${DAY}T09:00:00Z`, preview: 'aaa' },
        { id: 'm2', direction: 'outbound', status: 'sent', is_test: false, contact_id: null, message_date: `${DAY}T17:00:00Z`, preview: 'bbb' },
      ],
      contacts: [{ id: 'c1', direction: 'outbound', channel: 'email', kind: '1_first_contact', contacted_at: '2026-09-10', message: 'ccc' }],
    }
    const p = priorsFor(input)
    return S.guardUnattributed({ step: '2_chase_1', priors: p, now, sinceIso: S.lastRungAt(p) })?.kind === 'confirm'
  })())

  // ── 2 · THE OVERRIDE, PARSED BACK FROM A jsonb COLUMN ────────────────────────────────────────
  t('🔴 a stored override reads back as its ids and SENTENCES',
    JSON.stringify(T.parseGuardOverride([{ id: 'already_sent', message: 'An email went to this prospect 15 Sept 2026…' }]))
      === JSON.stringify([{ id: 'already_sent', message: 'An email went to this prospect 15 Sept 2026…' }]))
  /* 🔴 IT IS `jsonb`: the only guarantee is that it is JSON. A malformed value must become null — one
   * grey line missing — rather than reaching the panel and throwing inside a render. */
  t('🔴 anything that is not that shape becomes null, never a throw',
    T.parseGuardOverride(null) === null && T.parseGuardOverride('x') === null
    && T.parseGuardOverride([]) === null && T.parseGuardOverride([{ id: 'a' }]) === null
    && T.parseGuardOverride([{ message: 'b' }]) === null && T.parseGuardOverride([null, 3]) === null)
  t('⚠️ …and a mixed array keeps only the well-formed entries',
    T.parseGuardOverride([{ id: 'a', message: 'A' }, { id: '' }, 7])?.length === 1)
  return { ok, bad }
}

function runCensus(over = {}) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const TL = over.TL ?? stripComments(read('components/admin/ProspectTimeline.tsx'))
  const SEND = over.SEND ?? stripComments(read('app/api/admin/outreach/mail-send/route.ts'))
  const PANEL = over.PANEL ?? stripComments(read('components/admin/EmailReadingPanel.tsx'))
  const EV = over.EV ?? stripComments(read('lib/outreach-events.ts'))
  const TLR = over.TLR ?? stripComments(read('app/api/admin/outreach/timeline/route.ts'))

  // ── 1 · ONE FUNCTION, THREE READERS ─────────────────────────────────────────────────────────
  t('🔴 the history and the panel read `recordedStepsFor` over the history\'s OWN pairing',
    /const recordedSteps = useMemo\(\(\) => recordedStepsFor\(\{/.test(TL)
    && /pairing, ladderKinds: CONTACT_KINDS/.test(TL))
  /* ⚠️ RE-ANCHORED: the pairing is handed the rows with the DERIVED link on them now
   * (`contactsForPairing`), because `email_message_id` is not a column. Same function, same one rule —
   * the argument is the corrected one. */
  t('🔴 the GUARDS read the same function, over the same pairing — not a second rule on the server',
    /const recordedSteps = recordedStepsFor\(\{/.test(SEND)
    && /pairing: pairHandLoggedEmails\(\{ messages, contacts: contactsForPairing \}\)/.test(SEND))
  /* ⚠️ RESTATED: the select must name only REAL columns, and the link is DERIVED. Pinning
   * `email_message_id` in a select is what this check used to require — and that column does not exist. */
  t('🔴 …and the server reads real columns only, deriving the link from messages.contact_id',
    /select\('id, contacted_at, created_at, direction, kind, channel, message'\)/.test(SEND)
    && /preview, sent_copy/.test(SEND)
    && /email_message_id: messageOfContact\.get\(c\.id\) \?\? null/.test(SEND))
  t('🔴 a paired message\'s prior carries its RECORDED kind, which is the whole fix',
    /kind: recordedSteps\.get\(m\.id\)\?\.kind \?\? null/.test(SEND))
  t('⚠️ …and a LINKED message is still excluded entirely, so a rung is never doubled',
    /messages\.filter\(m => !m\.contact_id && m\.status !== 'failed'\)/.test(SEND))

  // ── 2 · NO NOTE FOR AN OVERRIDE ─────────────────────────────────────────────────────────────
  t('🔴 nothing writes a "Sent anyway" note any more — the writer and the prefix are gone',
    !/recordSendOverride/.test(SEND) && !/recordSendOverride/.test(EV)
    && !/OVERRIDE_PREFIX/.test(EV) && !/Sent anyway/.test(EV))
  t('🔴 the override is written on the SENT MESSAGE\'s own row',
    /guard_override: wavedGuards\.map\(g => \(\{ id: g\.id, message: g\.message \}\)\)/.test(SEND))
  t('🔴 …behind a capability probe, so the send works before the migration is applied',
    /const messagesHaveGuardOverride = async \(\)/.test(SEND)
    && /const canStoreOverride = wavedGuards\.length > 0 && await messagesHaveGuardOverride\(\)/.test(SEND))
  t('⚠️ …and an empty override OMITS the key rather than writing [], so null means one thing',
    /\.\.\.\(canStoreOverride\n?\s*\? \{ guard_override:/.test(SEND))
  t('🔴 the timeline selects it behind the same probe — a missing column must not blank the CRM',
    /const messagesHaveGuardOverride = async \(\)/.test(TLR)
    && /MESSAGE_COLS \+ \(await messagesHaveGuardOverride\(\) \? ', guard_override' : ''\)/.test(TLR)
    && /guard_override: parseGuardOverride\(r\.guard_override\)/.test(TLR))
  t('🔴 it shows in THAT EMAIL\'s panel only, as one grey line',
    /Sent after a warning:/.test(PANEL) && /text-\[11px\] text-slate-500/.test(PANEL))
  t('🔴 …and nothing about it reaches the history LIST',
    !/Sent after a warning/.test(TL) && !/guard_override/.test(TL))

  // ── 3 · "RECORD AS ▾" — A LIST, NOT A GUESS ─────────────────────────────────────────────────
  /* ⚠️ THE CALL SITE IS PINNED, NOT ONLY THE COMPONENT. A first draft of this check required
   * `function RecordAsMenu` and the "Record as ▾" label — both of which survive a patch that leaves
   * the component in the file and goes back to a plain button at the call site. The thing that must
   * hold is that the FOOTER renders the menu. */
  t('🔴 one button opening a list of the four steps, from CONTACT_KINDS',
    /<RecordAsMenu busy=\{actions\.busyId === m\.id\} suggested=\{stepKind\}/.test(TL)
    && /function RecordAsMenu/.test(TL) && /Record as ▾/.test(TL)
    && /CONTACT_KINDS\.map\(k => \{/.test(TL)
    && !/Record as \{STEP_LABELS\[stepKind/.test(TL))
  t('🔴 a step already recorded is DISABLED and says when',
    /disabled=\{already\}/.test(TL) && /recorded \{fmtDate\(at \?\? null\)\}/.test(TL))
  t('🔴 the ladder\'s answer is marked "suggested", not pressed on his behalf',
    /k === suggested && <span[^>]*>suggested</.test(TL) && /suggested=\{stepKind\}/.test(TL))
  t('🔴 skipping an unrecorded earlier step ASKS first, naming that step',
    /isn't recorded yet — record this as/.test(TL) && /window\.confirm\(/.test(TL))
  /* 🔴 `&& !recorded` IS THE WHOLE OF ITEM 3'S LAST RULE, so it is pinned as a string rather than
   * inferred from the grey line being present. Without it the panel shows BOTH — "Recorded as First
   * contact" and a button to record it again — which is the Guerrilla Kitchen defect with a label on. */
  t('🔴 a recorded email shows NO button and one grey line instead',
    /const unrecorded = !inbound && !m\.is_test && m\.status === 'sent' && !m\.contact_id && !recorded/.test(TL)
    && /\{recorded && \(/.test(TL) && /Recorded as \{STEP_LABELS\[recorded\.kind/.test(TL)
    && /\{unrecorded && \(/.test(TL))
  t('⚠️ …and names the hand log only when it was matched by PAIRING',
    /recorded\.how === 'paired'/.test(TL) && /logged by hand, /.test(TL))
  t('🔴 recording still goes through log_only → the one contact writer → applyFollowUp',
    /action: 'log_only', message_row_id: messageId, kind/.test(stripComments(read('components/admin/ProspectWorkspace.tsx'))))
  t('🔴 …and the route\'s three refusals are unchanged',
    /if \(row\.contact_id\) return refuse\('That message is already logged\.'\)/.test(SEND)
    && /if \(row\.is_test\) return refuse/.test(SEND)
    && /if \(recordKind !== null && !\(CONTACT_KINDS as readonly string\[\]\)\.includes\(recordKind\)\)/.test(SEND))

  // ── WHAT MAY NOT CHANGE ─────────────────────────────────────────────────────────────────────
  t('🔴 one send path and one contact writer', (() => {
    const writers = []
    const walk = dir => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue
        const f = path.join(dir, e.name)
        if (e.isDirectory()) { walk(f); continue }
        if (!/\.(ts|tsx)$/.test(e.name)) continue
        const src = stripComments(fs.readFileSync(f, 'utf8'))
        // ⚠️ `.test` ONCE, not an `exec` loop: this records WHICH FILE writes, never the match, so a
        // captured group would be assigned and never read.
        if (/from\('outreach_contacts'\)\s*\.\s*(?:insert|upsert)/.test(src)) writers.push(path.relative(REPO, f))
      }
    }
    for (const d of ['app', 'lib', 'components']) walk(path.join(REPO, d))
    return writers.every(w => w === 'lib/outreach-contact-log.ts')
  })())
  t('🔴 the display pairing still writes NOTHING — no link column is set anywhere',
    !/email_message_id:\s*[^n]/.test(stripComments(read('lib/outreach-timeline.ts'))))
  t('🔴 EMAIL_FRAME_SANDBOX is unchanged',
    /sandbox=\{EMAIL_FRAME_SANDBOX\}/.test(stripComments(read('components/admin/outreach-shared.tsx'))))
  return { ok, bad }
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const TL_SRC = stripComments(read('components/admin/ProspectTimeline.tsx'))
  const SEND_SRC = stripComments(read('app/api/admin/outreach/mail-send/route.ts'))
  const changed = (before, after, label) => {
    if (before === after) { console.log(`🔴 ${label}: THE PATCH DID NOT APPLY — its anchor has drifted`); process.exit(1) }
    return after
  }
  for (const [label, over] of [
    ['W1 🔴 the guard ignores the pairing — it warns about Guerrilla Kitchen again',
      { SEND: changed(SEND_SRC, SEND_SRC.replace('kind: recordedSteps.get(m.id)?.kind ?? null', 'kind: null'), 'W1') }],
    ['W2 🔴 the Record button uses the prospect\'s current step instead of a list',
      { TL: changed(TL_SRC, TL_SRC.replace('<RecordAsMenu busy={actions.busyId === m.id} suggested={stepKind}',
        '<button onClick={() => void actions.onRecordStep(m.id, stepKind)}>Record as {STEP_LABELS[stepKind'), 'W2') }],
    ['W3 🔴 a recorded step is selectable twice',
      { TL: changed(TL_SRC, TL_SRC.replace('disabled={already}', 'disabled={false}'), 'W3') }],
    ['W4 🔴 the override is written as a note again',
      { SEND: changed(SEND_SRC, SEND_SRC.replace(
        'guard_override: wavedGuards.map(g => ({ id: g.id, message: g.message }))',
        'x: await recordSendOverride(supabase, prospectId, wavedGuards)'), 'W4') }],
    ['W5 🔴 a recorded email still offers the button',
      { TL: changed(TL_SRC, TL_SRC.replace(
        "const unrecorded = !inbound && !m.is_test && m.status === 'sent' && !m.contact_id && !recorded",
        "const unrecorded = !inbound && !m.is_test && m.status === 'sent' && !m.contact_id"), 'W5') }],
    /* ⚠️ RE-ANCHORED (1 October 2026), AND THE ANCHOR ITSELF WAS THE BUG. This patched a select that
     * named `email_message_id` — a column that DOES NOT EXIST on `outreach_contacts`. Selecting it made
     * PostgREST answer 42703 with `data: null`, and the route discarded the error, so every send derived
     * its step from an empty ladder and logged a first contact. See docs/outreach-step-logging-report.md.
     * 🔴 THE FIELD IS DERIVED NOW, from `messages.contact_id`, so the variant breaks THAT instead — which
     * is the same failure one level down: the pairing loses the link and cannot see a hand-logged rung. */
    ['W6 🔴 the server stops deriving the link the pairing needs',
      { SEND: changed(SEND_SRC, SEND_SRC.replace(
        'const contactsForPairing = contacts.map(c => ({ ...c, email_message_id: messageOfContact.get(c.id) ?? null }))',
        'const contactsForPairing = contacts'), 'W6') }],
  ]) {
    const r = runCensus(over)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  const libs = buildLib(REPO, 'real')
  const show = (title, r) => {
    console.log(`\n${title}`)
    for (const n of r.ok) console.log('  ✓ ' + n)
    for (const n of r.bad) console.log('  🔴 ' + n)
    fails += r.bad.length
    return r
  }
  const a = show('── 1 · THE ONE RULE, AND THE GUARDS THAT READ IT ───────────────────────────────────────', runLibSuite(libs))
  const b = show('── 1–3 · THE SCREENS, THE ROUTE AND THE WRITERS ────────────────────────────────────────', runCensus())

  console.log(`\n${fails === 0 ? `✅ all ${a.ok.length + b.ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
