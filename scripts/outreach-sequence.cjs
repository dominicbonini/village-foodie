#!/usr/bin/env node
// scripts/outreach-sequence.cjs — one template per box, and no truck gets the same email twice.
//   node scripts/outreach-sequence.cjs   (≈ 4 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    a truck getting the same step twice — the one thing the operator asked for and the one thing
//    nothing in this codebase checked before today;
//    a box silently resolving to SOME OTHER template (an inactive one, one of the wrong channel, or
//    the default when the truck's own column was deliberately left different), which sends the
//    wrong words to a real business;
//    a double-click sending two emails;
//    a template chosen by the words it carries rather than by the step, which is what
//    `serves_kind` did: picking the chase-1 template for a first contact logged a chase-1 rung and
//    skipped a step of the ladder for ever after;
//    and anything at all writing `outreach_templates` — the wording is Dominic's.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const FILES = ['lib/outreach-sequence.ts']
function buildLib(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return req('lib/outreach-sequence.js')
}

// ── FIXTURES ────────────────────────────────────────────────────────────────────────────────────────
// 🧪 Four templates and a handful of boxes. The uuids are obviously fake and are never sent anywhere.
const T = [
  { uuid: 'u-first-hu', slug: 'hu_rate_email', label: 'HU rate — first contact', channel: 'email', active: true },
  { uuid: 'u-first-gen', slug: 'general_email', label: 'General — first contact', channel: 'email', active: true },
  { uuid: 'u-chase', slug: 'chaser_email', label: 'Chaser', channel: 'email', active: true },
  { uuid: 'u-retired', slug: 'old_email', label: 'Retired words', channel: 'email', active: false },
  { uuid: 'u-wa', slug: 'wa_intro', label: 'WhatsApp intro', channel: 'whatsapp', active: true },
]
const slot = (channel, step, lead_type, template_id) => ({ channel, step, lead_type, template_id })

const step = (over = {}) => ({
  state: 'due', kind: '1_first_contact', dueOn: null, channel: 'email',
  leadType: 'hu_ordering', leadTypeFrozen: false, stopReason: null, rungsDone: 0, blindRows: 0,
  label: 'First contact — due now', ...over,
})

function runChoiceSuite(S) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const idx = rows => S.indexSlots(rows)
  const pick = (rows, over = {}) => S.chooseTemplate({
    slots: idx(rows), templates: T, channel: 'email', step: '1_first_contact', leadType: 'hu_ordering', ...over,
  })

  // ── THE CHOICE RULE ──────────────────────────────────────────────────────────────────────────
  t('🔴 the truck\'s OWN column beats the default', pick([
    slot('email', '1_first_contact', 'any', 'u-first-gen'),
    slot('email', '1_first_contact', 'hu_ordering', 'u-first-hu'),
  ]).slug === 'hu_rate_email')
  t('🔴 the default is used when the truck\'s own column is empty', (() => {
    const r = pick([slot('email', '1_first_contact', 'any', 'u-first-gen')])
    return r.slug === 'general_email' && r.inherited === true
  })())
  t('🔴 …and it is marked as inherited, so the grid can say ↳', pick([
    slot('email', '1_first_contact', 'any', 'u-first-gen'),
    slot('email', '1_first_contact', 'hu_ordering', 'u-first-hu'),
  ]).inherited === false)
  t('🔴 nothing in either box is NOTHING, with a reason — never a guess',
    pick([]).slug === null && pick([]).miss === 'empty')
  t('🔴 a RETIRED template in the box sends nothing, and does not fall through to the default',
    (() => {
      const r = pick([
        slot('email', '1_first_contact', 'any', 'u-first-gen'),
        slot('email', '1_first_contact', 'hu_ordering', 'u-retired'),
      ])
      return r.slug === null && r.miss === 'inactive'
    })())
  t('🔴 a WhatsApp template in an email box sends nothing', (() => {
    const r = pick([slot('email', '1_first_contact', 'hu_ordering', 'u-wa')])
    return r.slug === null && r.miss === 'wrong_channel'
  })())
  t('⚠️ the whatsapp grid is a different grid — an email box is not read for it',
    S.chooseTemplate({ slots: idx([slot('email', '1_first_contact', 'any', 'u-first-gen')]),
      templates: T, channel: 'whatsapp', step: '1_first_contact', leadType: 'hu_ordering' }).slug === null)
  t('⚠️ a box pointing at a template that is not in the list reads as empty, not as an error',
    pick([slot('email', '1_first_contact', 'hu_ordering', 'u-gone')]).miss === 'empty')
  t('⚠️ an unknown truck type picks nothing and says so',
    pick([slot('email', '1_first_contact', 'any', 'u-first-gen')], { leadType: 'something_else' }).miss === 'unknown_type')
  t('⚠️ …and so does an unknown step', pick([], { step: 'nonsense' }).miss === 'no_step')

  // ── THE STEP GATE ────────────────────────────────────────────────────────────────────────────
  const rows = [slot('email', '1_first_contact', 'any', 'u-first-gen')]
  t('🔴 a STOPPED prospect has no step and therefore no template — this is why the Email tab opens on Blank',
    S.chooseForStep({ slots: idx(rows), templates: T, step: step({ state: 'stopped', kind: null, stopReason: 'replied' }) }).miss === 'no_step')
  t('🔴 …and an UNREADABLE history picks nothing rather than guessing rung 1',
    S.chooseForStep({ slots: idx(rows), templates: T, step: step({ state: 'unknown', kind: null, blindRows: 2 }) }).miss === 'no_step')
  t('⚠️ a SCHEDULED step still has its template — it is due later, not never',
    S.chooseForStep({ slots: idx(rows), templates: T, step: step({ state: 'scheduled', dueOn: '2026-10-09' }) }).slug === 'general_email')
  t('🔴 a prospect with no channel picks nothing',
    S.chooseForStep({ slots: idx(rows), templates: T, step: step({ channel: null }) }).miss === 'no_channel')
  return { ok, bad }
}

function runGuardSuite(S) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const NOW = new Date('2026-09-30T10:00:00Z')
  const prior = (over = {}) => ({ kind: null, at: '2026-09-16T09:00:00Z', via: 'log', ...over })

  // ── 3a · EACH STEP GOES ONCE ─────────────────────────────────────────────────────────────────
  const sent1 = [prior({ kind: '1_first_contact', at: '2026-09-16T09:00:00Z' })]
  t('🔴 a step that has already gone is REFUSED', (() => {
    const g = S.guardAlreadySent({ step: '1_first_contact', priors: sent1 })
    return !!g && g.kind === 'refuse' && /already gone/.test(g.message)
  })())
  /* ⚠️ `?.message ?? ''` ON EVERY GUARD READ, AND IT IS NOT DEFENSIVE STYLE. A broken variant makes
   * these return null; dereferencing would CRASH the harness, and a harness that throws where it
   * should fail teaches whoever hits it to weaken the check. This family has recorded that once
   * already (v9, the attachment guard). */
  t('🔴 …and the refusal names the day it went',
    /16 Sept? 2026/.test(S.guardAlreadySent({ step: '1_first_contact', priors: sent1 })?.message ?? ''))
  t('🔴 a DIFFERENT step is not refused', S.guardAlreadySent({ step: '2_chase_1', priors: sent1 }) === null)
  t('🔴 a TEST send never counts',
    S.guardAlreadySent({ step: '1_first_contact', priors: [prior({ kind: '1_first_contact', isTest: true })] }) === null)
  t('🔴 a send found in the MAILBOX counts, and says where it was found', (() => {
    const g = S.guardAlreadySent({ step: '2_chase_1', priors: [prior({ kind: '2_chase_1', via: 'mailbox' })] })
    return !!g && /Sent folder/.test(g?.message ?? '')
  })())
  t('⚠️ an Outlook email with NO step does not trigger the refusal — it cannot prove which step went',
    S.guardAlreadySent({ step: '2_chase_1', priors: [prior({ kind: null, via: 'mailbox' })] }) === null)
  t('🔴 …it asks instead, naming the date', (() => {
    const g = S.guardUnattributed({ step: '2_chase_1', priors: [prior({ kind: null, via: 'mailbox' })], now: NOW })
    return !!g && g.kind === 'confirm' && /not recorded as a step/.test(g?.message ?? '') && /16 Sept? 2026/.test(g?.message ?? '')
  })())
  t('⚠️ …and only for mail SINCE the last recorded rung', S.guardUnattributed({
    step: '2_chase_1', priors: [prior({ kind: null, via: 'mailbox', at: '2026-08-01T09:00:00Z' })],
    now: NOW, sinceIso: '2026-09-16T09:00:00Z',
  }) === null)

  // ── 3b · NOT BEFORE IT IS DUE ────────────────────────────────────────────────────────────────
  t('🔴 a chaser before its due date asks, naming both dates', (() => {
    const g = S.guardNotDue({ step: step({ state: 'scheduled', kind: '3_chase_2', dueOn: '2026-10-09' }), lastEmailAt: '2026-09-29T09:00:00Z', now: NOW })
    return !!g && g.kind === 'confirm' && /1 day ago/.test(g?.message ?? '') && /9 Oct 2026/.test(g?.message ?? '')
  })())
  t('⚠️ a step that is DUE is not questioned', S.guardNotDue({ step: step({ state: 'due' }), lastEmailAt: null, now: NOW }) === null)
  t('⚠️ …and neither is one whose date has arrived',
    S.guardNotDue({ step: step({ state: 'scheduled', dueOn: '2026-09-30' }), lastEmailAt: null, now: NOW }) === null)

  // ── 3d · SHARED ADDRESS ──────────────────────────────────────────────────────────────────────
  const others = [{ prospectName: 'Pig-Casso 2', address: 'INFO@example.co.uk', lastOutboundAt: '2026-09-25T09:00:00Z' }]
  t('🔴 the same address on another prospect asks, and names it', (() => {
    const g = S.guardSharedAddress({ address: 'info@example.co.uk', others, now: NOW })
    return !!g && /Pig-Casso 2/.test(g?.message ?? '')
  })())
  t('🔴 …case-insensitively, because Info@ and info@ are one mailbox',
    S.guardSharedAddress({ address: 'InFo@ExAmPlE.co.uk', others, now: NOW }) !== null)
  t('⚠️ …and only within 14 days', S.guardSharedAddress({
    address: 'info@example.co.uk', now: NOW,
    others: [{ ...others[0], lastOutboundAt: '2026-09-01T09:00:00Z' }],
  }) === null)
  t('⚠️ a prospect with no address is not warned about', S.guardSharedAddress({ address: null, others, now: NOW }) === null)

  // ── 3e · AFTER THE FINAL CHASE ───────────────────────────────────────────────────────────────
  const final = [prior({ kind: '4_final_chase' })]
  t('🔴 anything after the final chase asks first',
    S.guardAfterFinal({ step: step({ state: 'stopped', kind: null }), priors: final })?.kind === 'confirm')
  t('⚠️ …but the final chase itself, while due, does not',
    S.guardAfterFinal({ step: step({ state: 'due', kind: '4_final_chase' }), priors: final.slice(0, 0) }) === null)

  // ── 3f · A REPLY IS A CONVERSATION ───────────────────────────────────────────────────────────
  const all = S.evaluateGuards({
    isReply: true, step: step({ kind: '1_first_contact' }), priors: sent1, lastEmailAt: '2026-09-29T09:00:00Z',
    address: 'info@example.co.uk', others, now: NOW,
  })
  t('🔴 a reply is not refused for a step that has already gone', !all.some(g => g.id === 'already_sent'))
  t('⚠️ …and is not questioned for being early', !all.some(g => g.id === 'not_due'))
  t('🔴 …but the shared address still warns, because the person at the other end is the point',
    all.some(g => g.id === 'shared_address'))

  // ── 3g · THE BUTTON NAMES THE STEP ───────────────────────────────────────────────────────────
  t('🔴 the Send button names the step', S.sendButtonLabel({ isReply: false, step: '2_chase_1' }) === 'Send · Chase 1')
  t('…and a reply says so', S.sendButtonLabel({ isReply: true, step: '2_chase_1' }) === 'Send reply')
  t('⚠️ …and an unknown step says neither', S.sendButtonLabel({ isReply: false, step: null }) === 'Send')
  return { ok, bad }
}

// ── THE CENSUS ──────────────────────────────────────────────────────────────────────────────────────
function runCensus() {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const MIG = read('supabase/migrations/20260930_outreach_sequence_slots.sql')
  const ROUTE = stripComments(read('app/api/admin/outreach-templates/route.ts'))
  const SEND = stripComments(read('app/api/admin/outreach/mail-send/route.ts'))
  const PAGE = stripComments(read('components/admin/ProspectWorkspace.tsx'))
  const CW = stripComments(read('components/admin/ComposeWindow.tsx'))

  // ── TWO TEMPLATES IN ONE BOX IS IMPOSSIBLE ────────────────────────────────────────────────────
  t('🔴 the box is UNIQUE in the database — one template per box is a constraint, not a convention',
    /unique \(channel, step, lead_type\)/.test(MIG))
  t('🔴 …and the route upserts ON THAT KEY, so a save replaces rather than adding a second',
    /onConflict: 'channel,step,lead_type'/.test(ROUTE))
  t('🔴 the channel rule is enforced in the DATABASE too, by a composite foreign key',
    /foreign key \(template_id, channel\) references public\.outreach_templates \(id, channel\)/.test(MIG))
  t('…and in the route, so the answer is a sentence rather than a constraint violation',
    /this box is \$\{channel\}/.test(ROUTE))
  t('⚠️ lead_type is NOT NULL, so "no template" is the absence of a row', /lead_type   text not null/.test(MIG))
  t('🔴 RLS is on, service_role only, anon and authenticated revoked',
    /enable row level security/.test(MIG) && /for all to service_role/.test(MIG)
    && /revoke all on public\.outreach_sequence_slots from anon, authenticated, public/.test(MIG))
  t('⚠️ the migration ends with the schema reload and a verification select',
    /notify pgrst, 'reload schema';/.test(MIG) && /select s\.channel, s\.step/.test(MIG))
  t('🔴 the seed inserts EXACTLY the five rows asked for, by slug', (() => {
    // ⚠️ THE SEED BLOCK ONLY — the verification select at the bottom lists the same five slugs, and a
    // whole-file count would read them twice and call five ten.
    const block = MIG.slice(MIG.indexOf('insert into public.outreach_sequence_slots'), MIG.indexOf('commit;'))
    const seeds = block.match(/\('[1-4]_[a-z_0-9]+',\s*'[a-z_]+',\s*'[a-z_0-9-]+'\)/g) ?? []
    return seeds.length === 5
      && /'1_first_contact', 'hu_ordering', 'hu_rate_email'/.test(MIG)
      && /'1_first_contact', 'hu_map',      'hatches-up-map-only'/.test(MIG)
      && /'1_first_contact', 'on_vf',       'general_email'/.test(MIG)
      && /'2_chase_1',       'any',         'chaser_email'/.test(MIG)
      && /'2_chase_1',       'hu_ordering', 'chase-1'/.test(MIG)
  })())
  t('🔴 …and it never touches a template ROW',
    !/insert into public\.outreach_templates/.test(MIG) && !/update public\.outreach_templates/.test(MIG)
    && !/delete from public\.outreach_templates/.test(MIG))
  t('⚠️ the one thing it does add to that table is a unique constraint, which touches no row',
    /add constraint outreach_templates_id_channel_key unique \(id, channel\)/.test(MIG))

  // ── NOTHING WRITES `outreach_templates` EXCEPT THE EDITOR'S SAVE ──────────────────────────────
  // 🔴 A REPO-WIDE CENSUS. The wording is Dominic's; a build that "helpfully" seeded or retired a
  // row would be rewriting what his prospects read.
  const writers = []
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const f = path.join(dir, e.name)
      if (e.isDirectory()) { walk(f); continue }
      if (!/\.(ts|tsx)$/.test(e.name)) continue
      const src = stripComments(fs.readFileSync(f, 'utf8'))
      const re = /from\('outreach_templates'\)\s*\.\s*(insert|update|delete|upsert)/g
      let m
      while ((m = re.exec(src))) writers.push(`${path.relative(REPO, f)}:${m[1]}`)
    }
  }
  walk(path.join(REPO, 'app'))
  walk(path.join(REPO, 'lib'))
  walk(path.join(REPO, 'components'))
  const allowed = new Set([
    'app/api/admin/outreach-templates/route.ts:insert',   // create_template
    'app/api/admin/outreach-templates/route.ts:update',   // update_template and set_defaults
  ])
  t('🔴 only the templates editor writes `outreach_templates`, and only insert/update',
    writers.every(w => allowed.has(w)))
  if (!writers.every(w => allowed.has(w))) bad.push(`   found: ${writers.join(', ')}`)
  t('⚠️ …and there is no delete anywhere', !writers.some(w => w.endsWith(':delete')))

  // ── THE CHOICE IS THE GRID'S, NOT THE TAGS' ──────────────────────────────────────────────────
  t('🔴 the prospect page chooses with `chooseForStep`', /chooseForStep\(\{ slots, templates: slotTemplates, step \}\)/.test(PAGE))
  t('🔴 …and `templateForStep` is no longer called anywhere in the app',
    !/templateForStep\(/.test(PAGE) && !/templateForStep\(/.test(stripComments(read('components/admin/TemplatesPanel.tsx')))
    && !/templateForStep\(/.test(CW))
    /* 🔴 RESTATED (30 September 2026, reply-to-any): the rule gained one condition and is otherwise
     * the same. `reply` is for ANSWERING SOMEBODY; following up on MY OWN email — which this build
     * makes possible from the reading panel — is not answering anybody, it is the step the ladder is
     * on. So the test is now "has the prospect written back", not "is there a parent message". Both
     * halves still live in one place each: `loggedKindFor` in the lib, called by the route, and the
     * same expression in the composer for what the BUTTON says. */
  t('🔴 the composer logs the STEP, not the template\'s tag',
    /const kindForSend = \(replyTo && inConversation\) \? 'reply' : \(stepKind \?\? logFormKind\)/.test(CW))
  t('🔴 …and the SERVER re-derives it and overrules the client',
    /if \(step\.kind && \(!replyParent \|\| !inConversation\)\) derivedKind = step\.kind/.test(SEND))
  t('🔴 the guards run in the send route, for every path', /evaluateGuards\(\{/.test(SEND))
  t('🔴 …and a blocked send writes NOTHING and sends nothing',
    /return NextResponse\.json\(\{\s*ok: false, needsConfirm: true/.test(SEND))
  t('🔴 an override is recorded in the history before the send', /await recordSendOverride\(supabase, prospectId/.test(SEND))
  t('⚠️ a TEST send skips every guard', /if \(!isTest\) \{/.test(SEND))
  t('🔴 one contact writer and one nextStep call in the route',
    (SEND.match(/logOutreachContact\(/g) || []).length === 2 && (SEND.match(/nextStep\(/g) || []).length === 1)

  // ── ONE CLICK, ONE EMAIL (3c) ────────────────────────────────────────────────────────────────
  t('🔴 the composer keys every message, and the key covers the subject, body, step and attachments',
    /const key = hashKey\(JSON\.stringify\(\[\s*\n\s*finalSubject, isEmail \? doc : fullText, kindForSend, test,/.test(CW))
  t('🔴 the server claims the key BEFORE it builds anything…', /REFUSAL 6 · the idempotency key was already used/.test(read('app/api/admin/outreach/mail-send/route.ts')))
  t('🔴 …and a repeat returns the FIRST result rather than sending again',
    /return NextResponse\.json\(\{ ok: true, duplicate: true/.test(SEND))
  t('⚠️ …and the column that makes it true is unique',
    /idempotency_key text unique/.test(read('supabase/migrations/20260928_outreach_messages.sql')))
  t('🔴 Send is disabled while a send is in flight', /disabled=\{!!sendBlock \|\| sending\}/.test(CW))
  return { ok, bad }
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const libVariant = (tag, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `seq-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, 'lib/outreach-sequence.ts')
    const src = fs.readFileSync(f, 'utf8')
    const out = patch(src)
    if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return buildLib(tmp, tag)
  }
  const variants = [
    ['v1', 'V1 🔴 a second chase 1 is allowed through', 'guards',
      s => s.replace('  if (same.length > 0) {', '  if (false) {')],
    ['v2', 'V2 🔴 an Outlook-sent email is not counted at all', 'guards',
      s => s.replace('  if (loose.length === 0) return null', '  if (true) return null')],
    ['v3', 'V3 🔴 a TEST send counts as a real one', 'guards',
      s => s.replace('  const real = priors.filter(p => p.isTest !== true)', '  const real = priors.slice()')],
    ['v4', 'V4 🔴 a retired template in a box is sent anyway', 'choice',
      s => s.replace("  if (!t.active) return { slug: null, uuid: t.uuid, label: t.label, inherited: !own, miss: 'inactive' }", '')],
    ['v5', 'V5 🔴 an empty own column falls through to the default even when the box is broken', 'choice',
      s => s.replace('  const slot = own ?? fallback', '  const slot = fallback ?? own')],
    ['v6', 'V6 the early-chaser question is skipped', 'guards',
      s => s.replace("  if (step.state !== 'scheduled' || !step.dueOn || !step.kind) return null", '  return null')],
    ['v7', 'V7 the shared-address check is case-sensitive again', 'guards',
      s => s.replace('o.address.trim().toLowerCase() === a', 'o.address.trim() === a')],
  ]
  for (const [tag, label, which, patch] of variants) {
    const S = libVariant(tag, patch)
    const r = which === 'choice' ? runChoiceSuite(S) : runGuardSuite(S)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }
  // ⚠️ A CENSUS VARIANT TOO: the census is the half that cannot be unit-tested, and it has to be
  // shown to catch something. This one is the rule the operator stated first.
  {
    const src = read('app/api/admin/outreach-templates/route.ts')
    const tmp = path.join(os.tmpdir(), `seq-census-${Date.now()}.ts`)
    fs.writeFileSync(tmp, src.replace("from('outreach_templates').update(patch)", "from('outreach_templates').delete()"))
    const writers = /from\('outreach_templates'\)\s*\.\s*delete/.test(fs.readFileSync(tmp, 'utf8'))
    console.log(`  ${writers ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V8 🔴 a delete of a template row appears in the route`)
    if (!writers) process.exit(1)
  }

  const S = buildLib(REPO, 'real')
  const show = (title, r) => {
    console.log(`\n${title}`)
    for (const n of r.ok) console.log('  ✓ ' + n)
    for (const n of r.bad) console.log('  🔴 ' + n)
    fails += r.bad.length
    return r
  }
  const a = show('── THE CHOICE RULE ─────────────────────────────────────────────────────────────────────', runChoiceSuite(S))
  const b = show('── THE SEND-TIME GUARDS ────────────────────────────────────────────────────────────────', runGuardSuite(S))
  const c = show('── THE TABLE, THE ROUTE, AND WHAT MAY NOT BE WRITTEN ───────────────────────────────────', runCensus())

  console.log(`\n${fails === 0 ? `✅ all ${a.ok.length + b.ok.length + c.ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
