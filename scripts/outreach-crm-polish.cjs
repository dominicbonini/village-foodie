#!/usr/bin/env node
// scripts/outreach-crm-polish.cjs — the follow-up date that stuck, one row per note, the labels, and
// the two controls that did nothing.
//   node scripts/outreach-crm-polish.cjs   (≈ 4 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    a follow-up date that looks saved and is not — the whole queue is built on `next_action_at`, so
//    a date that goes nowhere is work that silently never comes back;
//    a call labelled "reply", which is the page telling you something that did not happen;
//    a demo link that "inserts" nothing and an href that is not checked — a link mark is a hole in
//    an allow-list unless the URL is one;
//    and a note that takes six rows, which stops the history being a list.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const FILES = ['lib/outreach-workspace.ts', 'lib/outreach-timeline.ts', 'lib/outreach-doc.ts']
function buildLib(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return {
    W: req('lib/outreach-workspace.js'),
    T: req('lib/outreach-timeline.js'),
    D: req('lib/outreach-doc.js'),
  }
}

const TODAY = '2026-09-30'

function runLibSuite({ W, T, D }) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)

  // ── 1 · THE STORED DATE IS WHAT THE CHIPS SHOW ───────────────────────────────────────────────
  t('🔴 a stored date wins over the suggestion', (() => {
    const r = W.storedFollowUpChoice('2026-10-07', TODAY)
    return !!r && r.date === '2026-10-07'
  })())
  t('⚠️ …and names the chip when one matches, so "+1 week" does not read as "Pick"',
    W.storedFollowUpChoice('2026-10-07', TODAY)?.choice === '1_week'
    && W.storedFollowUpChoice('2026-10-01', TODAY)?.choice === 'tomorrow')
  t('…and is "Pick" when none does', W.storedFollowUpChoice('2026-11-20', TODAY)?.choice === 'pick')
  t('🔴 nothing stored ⇒ null, so the caller falls back to the suggestion',
    W.storedFollowUpChoice(null, TODAY) === null && W.storedFollowUpChoice('', TODAY) === null)
  t('⚠️ a timestamp is read as its day', W.storedFollowUpChoice('2026-10-07T09:00:00Z', TODAY)?.date === '2026-10-07')

  // ── 1b · THE BANNER SHOWS IT ─────────────────────────────────────────────────────────────────
  const banner = (over = {}) => W.nextAction({
    messages: [], step: null, channel: 'email', nextActionAt: null, linkedTruck: false,
    now: new Date(`${TODAY}T10:00:00Z`), today: TODAY, ...over,
  })
  t('🔴 a FUTURE follow-up is not "No next step" — that was the bug on a replied prospect',
    banner({ nextActionAt: '2026-10-07' }).kind === 'follow_up')
  t('…and it names the day', /Follow up — Wed 7 Oct/.test(banner({ nextActionAt: '2026-10-07' }).label))
  t('🔴 …including for a prospect who has REPLIED and therefore has no rung', (() => {
    const b = banner({ nextActionAt: '2026-10-07', step: { state: 'stopped', kind: null, stopReason: 'replied', dueOn: null, channel: null, leadType: 'on_vf', leadTypeFrozen: false, rungsDone: 1, blindRows: 0, label: 'Replied' } })
    return b.kind === 'follow_up' && /7 Oct/.test(b.label)
  })())
  t('⚠️ a DUE one still says how late it is',
    /2 days overdue/.test(banner({ nextActionAt: '2026-09-28' }).label))
  t('🔴 …and it never outranks a waiting reply', (() => {
    const b = banner({
      nextActionAt: '2026-10-07',
      messages: [{ id: 'm1', direction: 'inbound', status: 'received', is_test: false, handled_at: null, snoozed_until: null, message_date: '2026-09-29T09:00:00Z' }],
    })
    return b.kind === 'reply'
  })())
  t('⚠️ nothing stored and nothing due is still "No next step"', banner().label === 'No next step')
  t('⚠️ the weekday and the date — 7 Oct 2026 is a WEDNESDAY, which is the point of showing it', W.dayAndDate('2026-10-07') === 'Wed 7 Oct')

  // ── 7 · WHAT A CONTACT ROW SAYS ──────────────────────────────────────────────────────────────
  t('🔴 a call logged as `reply` reads as "Call", not "reply"',
    T.contactRowLabel({ channel: 'phone', kind: 'reply' }) === 'Call')
  t('🔴 …and a WhatsApp as "WhatsApp"', T.contactRowLabel({ channel: 'whatsapp', kind: 'reply' }) === 'WhatsApp')
  t('⚠️ an EMAIL keeps the rung wording, because there it is the right word',
    T.contactRowLabel({ channel: 'email', kind: 'reply' }) === 'reply'
    && T.contactRowLabel({ channel: 'email', kind: '2_chase_1' }) === 'chase 1')
  t('⚠️ …and a row with no kind at all says "Contact" rather than nothing',
    T.contactRowLabel({ channel: 'email', kind: null }) === 'Contact')

  // ── ONE LABEL FOR EVERY ROW ──────────────────────────────────────────────────────────────────
  const email = (over = {}) => ({ type: 'email', at: '', id: 'm', message: { id: 'm', direction: 'outbound', ...over } })
  const contactItem = (over = {}) => ({ type: 'contact', at: '', id: 'c', contact: { id: 'c', channel: 'phone', direction: 'outbound', ...over } })
  const eventItem = (kind) => ({ type: 'event', at: '', id: 'e', event: { id: 'e', kind, created_at: '' } })
  const L = T.rowLabel
  t('🔴 an email I sent — envelope, "Sent", plain',
    JSON.stringify(L(email())) === JSON.stringify({ icon: 'envelope', word: 'Sent', pill: false }))
  t('🔴 an email they sent — envelope, "Received", and it is the ONLY pill',
    JSON.stringify(L(email({ direction: 'inbound' }))) === JSON.stringify({ icon: 'envelope', word: 'Received', pill: true }))
  t('🔴 a call — phone, "Call"', JSON.stringify(L(contactItem())) === JSON.stringify({ icon: 'phone', word: 'Call', pill: false }))
  t('🔴 …even when it is stored as `reply`', L(contactItem({ kind: 'reply' })).word === 'Call')
  t('🔴 a WhatsApp — chat, "WhatsApp"', JSON.stringify(L(contactItem({ channel: 'whatsapp' }))) === JSON.stringify({ icon: 'chat', word: 'WhatsApp', pill: false }))
  t('🔴 a note — pencil, "Note"', JSON.stringify(L(eventItem('note'))) === JSON.stringify({ icon: 'pencil', word: 'Note', pill: false }))
  t('🔴 a stage change — arrows, "Stage"', JSON.stringify(L(eventItem('stage_change'))) === JSON.stringify({ icon: 'arrows', word: 'Stage', pill: false }))
  t('⚠️ a hand-logged EMAIL contact reads as the email it was',
    L(contactItem({ channel: 'email' })).word === 'Sent'
    && L(contactItem({ channel: 'email', direction: 'inbound' })).pill === true)
  t('⚠️ an unrecognised channel is still a contact, and says so',
    JSON.stringify(L(contactItem({ channel: 'carrier pigeon', kind: null }))) === JSON.stringify({ icon: 'chat', word: 'Contact', pill: false }))
  t('🔴 every entry type is covered — no row can fall through to nothing',
    ['email', 'contact', 'event'].every(k => {
      const it = k === 'email' ? email() : k === 'contact' ? contactItem() : eventItem('note')
      const r = L(it)
      return !!r && typeof r.word === 'string' && r.word.length > 0 && typeof r.icon === 'string'
    }))
  t('⚠️ the panel and Today use the same two words, from the same module',
    T.messageRowLabel('inbound').word === 'Received' && T.messageRowLabel('outbound').word === 'Sent')

  // ── 2 · A NOTE IS ONE ROW ────────────────────────────────────────────────────────────────────
  t('🔴 runs of blank lines collapse to one break',
    T.tidyNoteText('a\n\n\n\nb') === 'a\nb' && T.tidyNoteText('a\r\n\r\nb') === 'a\nb')
  t('🔴 …and the line breaks themselves are KEPT — this is not "make it one paragraph"',
    T.tidyNoteText('a\nb\nc') === 'a\nb\nc')
  t('⚠️ trailing spaces go, leading text stays', T.tidyNoteText('  a   \n  b') === 'a   \n  b'.replace(/[ \t]+$/gm, ''))
  t('🔴 the collapsed row shows the FIRST line', T.noteFirstLine('rang him\nhe asked for the plans') === 'rang him')
  t('🔴 a note with a second line has more to show', T.noteHasMore('rang him\nand again') === true)
  t('🔴 …and so does a long single line, because the column will cut it',
    T.noteHasMore('x'.repeat(T.NOTE_ONE_LINE_CHARS + 1)) === true)
  t('⚠️ a short one-line note does NOT — a control that does nothing is worse than none',
    T.noteHasMore('rang him') === false && T.noteHasMore('') === false && T.noteHasMore(null) === false)
  t('⚠️ …and blank lines alone never make one "longer"', T.noteHasMore('rang him\n\n\n') === false)
  t('⚠️ …and nothing at all is an empty string, never "undefined"', T.noteFirstLine(null) === '')

  // ── 6 · THE LINK MARK IS AN ALLOW-LIST ───────────────────────────────────────────────────────
  const withLink = href => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the demo', marks: [{ type: 'link', attrs: { href } }] }] }],
  })
  t('🔴 an https demo link is allowed', D.validateDoc(withLink('https://www.hatchgrab.com/demo/abc')).ok === true)
  t('🔴 …and renders as a real anchor',
    /<a href="https:\/\/www\.hatchgrab\.com\/demo\/abc">the demo<\/a>/.test(D.docToHtml(withLink('https://www.hatchgrab.com/demo/abc').content ? D.validateDoc(withLink('https://www.hatchgrab.com/demo/abc')).doc : null)))
  for (const bad of ['javascript:alert(1)', 'http://example.com', '//example.com', 'data:text/html,x', '', 'https://ex ample.com/"onmouseover=x']) {
    t(`🔴 "${bad || '(empty)'}" is REFUSED, not stripped`, D.validateDoc(withLink(bad)).ok === false)
  }
  t('⚠️ the refusal names the link rather than saying "invalid"',
    /is not an https link/.test(D.validateDoc(withLink('javascript:alert(1)')).error ?? ''))
  t('⚠️ an unknown mark is still refused', D.validateDoc({
    type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'strike' }] }] }],
  }).ok === false)
  t('⚠️ …and the two old marks still work', D.validateDoc({
    type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'small' }] }] }],
  }).ok === true)
  return { ok, bad }
}

function runCensus(over = {}) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const PAGE = stripComments(over.PAGE ?? read('components/admin/ProspectWorkspace.tsx'))
  const CW = stripComments(over.CW ?? read('components/admin/ComposeWindow.tsx'))
  const ED = stripComments(over.ED ?? read('components/admin/RichEmailEditor.tsx'))
  const TL = stripComments(over.TL ?? read('components/admin/ProspectTimeline.tsx'))
  const PANEL = stripComments(over.PANEL ?? read('components/admin/EmailReadingPanel.tsx'))
  const SHARED = stripComments(over.SHARED ?? read('components/admin/outreach-shared.tsx'))

  // ── 1 · THE CHIP SAVES ───────────────────────────────────────────────────────────────────────
  t('🔴 a chip writes immediately, through the one follow-up writer',
    /void onSetFollowUp\(c, date\)/.test(PAGE) && /await applyFollowUp\(null, next\)/.test(PAGE))
  t('🔴 …and so does a picked date', /void onSetFollowUp\('pick', e\.target\.value \|\| null\)/.test(PAGE))
  t('🔴 `next_action_at` is still written in exactly ONE statement',
    (PAGE.match(/next_action_at: /g) || []).length === 2)
  t('⚠️ …and a date chosen on its own never freezes the lead type',
    /if \(kind && prospect && shouldFreezeLeadType/.test(PAGE))
  t('🔴 the chips are seeded from the STORED value first', /storedFollowUpChoice\(prospect\?\.next_action_at \?\? null, today\)/.test(PAGE))
  t('⚠️ there is a receipt and a way back', /Follow-up set for \$\{dayAndDate\(next\)\}/.test(PAGE) && /onUndoFollowUp/.test(PAGE))

  // ── 2 · ONE ROW PER NOTE ─────────────────────────────────────────────────────────────────────
  t('🔴 a note in the history is one row that opens',
    /open=\{expandAll \|\| expandedId === item\.id\}/.test(TL) && /onToggle=\{\(\) => onExpand/.test(TL))
  /* ⚠️ RE-ANCHORED: the collapsed row is its own return now — the date-and-word header it used to
   * share with the Notes card was duplicating the history row's own icon, word and date, which put
   * the text on a second line and printed the date twice. */
  t('…truncated to its first line while closed, and the row carries nothing else',
    /open \? 'whitespace-pre-wrap break-words' : 'truncate'/.test(SHARED)
    && /open \? tidyNoteText\(note\.body\) : noteFirstLine\(note\.body\)/.test(SHARED))
  /* ⚠️ THE SLICE IS BETWEEN TWO PIECES OF CODE, NOT TWO COMMENTS. `SHARED` is stripped before this
   * census, so a boundary written as a comment is not there to find — the first attempt sliced on
   * one and silently measured the whole file. */
  t('🔴 …and the collapsed row prints NO date of its own: the history row already has one', (() => {
    const from = SHARED.indexOf('if (collapsible) {')
    const to = SHARED.indexOf('<li className="text-[13px] group">', from)
    return from > 0 && to > from && !/fmtDate\(note\.created_at\)/.test(SHARED.slice(from, to))
  })())
  t('🔴 a note with more to show says so, with a control that turns',
    /noteHasMore\(note\.body\) && \(/.test(SHARED) && /aria-expanded=\{!!open\}/.test(SHARED)
    && /<RowIcon name="chevron"/.test(SHARED))
  t('🔴 …and the full text never carries the blank lines', /tidyNoteText\(note\.body\)/.test(SHARED))
  t('⚠️ the Notes card still shows every note in full — it IS the notes', /const collapsible = !!onToggle/.test(SHARED))

  // ── 3 · THE MARKER IS GONE ───────────────────────────────────────────────────────────────────
  t('🔴 no "also logged by hand" on a history row', !/also logged by hand/i.test(TL))
  t('🔴 …and no "Also logged by hand" line in the panel', !/Also logged by hand/i.test(PANEL))
  t('🔴 the pairing itself is untouched — still one row per email',
    /pairHandLoggedEmails\(\{/.test(TL) && /pairing,/.test(TL))
  t('⚠️ …and a note logged WITH an email is still reachable when it adds something',
    /Note logged with this email ▸/.test(PANEL) && /!handTextIsRedundant\(handLogged\.message, emailText\)/.test(PANEL))

  // ── 4 · PLANS PDF IS A PLAIN BUTTON ──────────────────────────────────────────────────────────
  t('🔴 nothing in the composer toolbar is orange any more', !/orange/.test(CW.slice(CW.indexOf('toolbarExtra='), CW.indexOf('underToolbar='))))
  t('⚠️ …and Send still is', /bg-orange-600 text-white/.test(CW))

  // ── 5 · PREVIOUS EMAIL OPENS ─────────────────────────────────────────────────────────────────
  t('🔴 the toggle scrolls the block into view', /getElementById\(QUOTE_BLOCK_ID\)\?\.scrollIntoView/.test(CW))
  t('🔴 …and the block is no longer gated on a condition the toggle is not',
    /\{thread && quotedOpen && \(/.test(CW) && !/\{isEmail && thread && quotedOpen/.test(CW))
  t('⚠️ the label says whether it will be sent', /Previous email \(not included\)/.test(CW))

  // ── 6 · THE DEMO LINK IS INSERTED ────────────────────────────────────────────────────────────
  t('🔴 "Insert in email" inserts — it does not ask for a paste',
    /composerApi\.current\?\.insertLink\(url\)/.test(PAGE) && !/⌘V/.test(PAGE))
  t('🔴 …the FULL url, from one place', /const fullUrl = path \? /.test(PAGE) && /onInsert\(fullUrl\)/.test(PAGE))
  t('⚠️ …which Copy uses too', /await navigator\.clipboard\.writeText\(fullUrl\)/.test(PAGE))
  t('🔴 the editor publishes the handle, and takes it away on unmount',
    /insertLink: \(url: string, text\?: string\)/.test(ED) && /return \(\) => \{ if \(apiRef\) apiRef\.current = null \}/.test(ED))
  t('⚠️ …and focuses before inserting, or there is nowhere to put it', /const chain = editor\.chain\(\)\.focus\(\)/.test(ED))
  t('🔴 the link mark is defined with an href attribute and rendered as an anchor',
    /const Link = Mark\.create\(\{/.test(ED) && /return \['a', mergeAttributes\(HTMLAttributes\), 0\]/.test(ED))

  // ── THE LABELS, ON EVERY SURFACE ─────────────────────────────────────────────────────────────
  const PANEL_SRC = stripComments(read('components/admin/EmailReadingPanel.tsx'))
  const LIST = stripComments(read('components/admin/OutreachPanel.tsx'))
  const ICONS = stripComments(read('components/admin/outreach-icons.tsx'))
  /* 🔴 THE WHOLE GLYPH VOCABULARY, NOT JUST THE ARROWS. The history drew its icons with `↗ ↙ ☎ ✎`
   * and a `·`; a row that reaches for one of its own again would reach for one of these, so all of
   * them are banned from the markup at once. ⚠️ `→` is NOT in the list: the stage row reads
   * "Stage contacted → replied", where the arrow is a word, not an icon. */
  t('🔴 no glyph icons anywhere in the history, the panel or Today',
    !/[\u2197\u2199\u260e\u270e\u2709]/.test(TL + PANEL_SRC + LIST))
  t('🔴 …and `rowIcon` is gone, so a row has nowhere to reach for one of its own', !/function rowIcon/.test(TL))
  t('🔴 the green row background is gone from every surface',
    !/INBOUND_BG/.test(TL + PANEL_SRC + LIST + SHARED))
  t('🔴 every history row renders through the ONE function',
    (TL.match(/<RowLabelCell label=\{rowLabel\(item\)\} \/>/g) || []).length === 3)
  t('🔴 …the reading panel through the same one',
    /<RowLabelCell label=\{messageRowLabel\(message\.direction\)\} \/>/.test(PANEL_SRC))
  t("🔴 …and Today's replies list too", /<RowLabelCell label=\{messageRowLabel\('inbound'\)\}/.test(LIST))
  t('⚠️ the icons are one size and one stroke, in the style this app already uses',
    /width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"/.test(ICONS)
    && (ICONS.match(/strokeWidth="2"/g) || []).length === 1)
  /* ⚠️ SIX PATHS NOW, AND THE SIXTH IS NOT A ROW ICON. `chevron` is the "there is more of this"
   * control on a collapsed note; the type (`IconName = RowIconName | 'chevron'`) is what stops a row
   * ever being labelled with it. */
  t('🔴 …and there are exactly six paths, no emoji and no unicode arrows',
    (ICONS.match(/^  [a-z]+: '/gm) || []).length === 6 && !/[\u260e\u270e\u2197\u2199]/.test(ICONS))
  t('🔴 …and the chevron can never become a row label',
    /export type IconName = RowIconName \| 'chevron'/.test(ICONS)
    && /'envelope' \| 'phone' \| 'chat' \| 'pencil' \| 'arrows'/.test(stripComments(read('lib/outreach-timeline.ts'))))
  t('🔴 the label column is a fixed width, in one place', /w-\[5\.5rem\] shrink-0/.test(ICONS))
  t('⚠️ "Received" is a pill in bold dark text, not a colour',
    /font-bold uppercase tracking-wide text-slate-900 bg-slate-100/.test(ICONS) && !/emerald/.test(ICONS))
  t('⚠️ a row waiting for a reply keeps its own indicator', /rowBadges\(m, \{ now, linkedTruck, showTests \}\)/.test(TL))

  // ── WHAT NONE OF THIS MAY TOUCH ──────────────────────────────────────────────────────────────
  t('🔴 still one nextStep call on the page', (PAGE.match(/nextStep\(/g) || []).length === 1)
  t('🔴 still one contact writer', /action: 'log_contact'/.test(PAGE) && !/outreach_contacts/.test(PAGE))
  t('🔴 the sequence guards are still the composer\'s', /json\.needsConfirm === true/.test(CW))
  t('🔴 EMAIL_FRAME_SANDBOX is unchanged',
    /sandbox=\{EMAIL_FRAME_SANDBOX\}/.test(SHARED) && !/allow-scripts/.test(SHARED))
  return { ok, bad }
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const libVariant = (tag, file, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `pol-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, file)
    const src = fs.readFileSync(f, 'utf8')
    const out = patch(src)
    if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return buildLib(tmp, tag)
  }
  for (const [tag, label, file, patch] of [
    ['v1', 'V1 🔴 a stored follow-up is invisible until it falls due — "No next step" over a real date',
      'lib/outreach-workspace.ts', s => s.replace('  if (input.nextActionAt) {\n    return {\n      kind: \'follow_up\',\n      due: input.nextActionAt,\n      label: `Follow up — ${dayAndDate(input.nextActionAt)}`,', '  if (false) {\n    return {\n      kind: \'follow_up\',\n      due: input.nextActionAt,\n      label: `x`,')],
    ['v2', 'V2 🔴 the chips ignore the stored date again', 'lib/outreach-workspace.ts',
      s => s.replace('  const date = (nextActionAt ?? \'\').slice(0, 10)', "  const date = ''")],
    ['v3', 'V3 🔴 a call is labelled by its stored kind — "reply · Spoke to Libby"',
      'lib/outreach-timeline.ts', s => s.replace("  if (channel === 'phone' || channel === 'call') return 'Call'", '')],
    ['v4', 'V4 a note keeps its blank lines and takes six rows', 'lib/outreach-timeline.ts',
      s => s.replace("    .replace(/\\n{2,}/g, '\\n')", '')],
    ['v5', 'V5 🔴 a javascript: href is accepted into an email', 'lib/outreach-doc.ts',
      s => s.replace('            if (!LINK_RE.test(href)) {', '            if (false) {')],
  ]) {
    const libs = libVariant(tag, file, patch)
    const r = runLibSuite(libs)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  const PAGE_SRC = read('components/admin/ProspectWorkspace.tsx')
  const CW_SRC = read('components/admin/ComposeWindow.tsx')
  const TL_SRC = read('components/admin/ProspectTimeline.tsx')
  /* 🔴 A CENSUS VARIANT THAT DID NOT APPLY IS A VARIANT THAT PROVES NOTHING, and it looks exactly
   * like a passing one. `String.replace` returns the SAME STRING when it finds nothing, so a patch
   * whose anchor has drifted silently runs the census over correct source — which then passes, and
   * the harness reports "THE HARNESS PROVES NOTHING" without saying why. Every mutation below is
   * checked for having changed something first. This cost a real minute today. */
  const mutated = (src, out, label) => {
    if (out === src) { console.log(`🔴 ${label}: THE PATCH DID NOT APPLY — its anchor has drifted`); process.exit(1) }
    return out
  }
  for (const [label, over] of [
    ['V6 🔴 a chip saves nothing — it only pre-sets the next log',
      { PAGE: PAGE_SRC.replace('void onSetFollowUp(c, date)', 'setLocalOnly({ choice: c, date })') }],
    ['V7 🔴 the "also logged by hand" marker is back on the row',
      { TL: TL_SRC.replace('{badges.map(b => (', '{"also logged by hand"}{badges.map(b => (') }],
    ['V8 🔴 Plans PDF is orange again',
      { CW: CW_SRC.replace(
        'className="text-xs font-bold px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40">\n                      {fileBusy === \'plans\' ? \'Generating…\' : \'Plans PDF\'}',
        'className="text-xs font-bold px-2 py-1 rounded border border-orange-300 text-orange-800 bg-orange-50">\n                      {fileBusy === \'plans\' ? \'Generating…\' : \'Plans PDF\'}') }],
    ['V9 🔴 "Previous email" opens nothing you can see',
      { CW: CW_SRC.replace(/\s*if \(next\) \{\n\s*window\.setTimeout\(\n\s*\(\) => document\.getElementById\(QUOTE_BLOCK_ID\)\?\.scrollIntoView\(\{ block: 'nearest', behavior: 'smooth' \}\),\n\s*0\)\n\s*\}/, '') }],
    ['V10 🔴 "Insert in email" goes back to asking for a paste',
      { PAGE: PAGE_SRC.replace('const ok = composerApi.current?.insertLink(url) ?? false', 'const ok = false') }],
    ['V11 🔴 the arrows are back on the email rows',
      { TL: TL_SRC.replace('<RowLabelCell label={rowLabel(item)} />',
        '<span>{"\u2197"}</span>') }],
    ['V12 🔴 one row type draws its own icon outside the function',
      { TL: TL_SRC.replace('<NoteRow note={e} prospectId={prospect.id}',
        '<span>{"\u270e"}</span><NoteRow note={e} prospectId={prospect.id}') }],
  ]) {
    // ⚠️ EVERY OVERRIDE IS CHECKED AGAINST THE FILE IT REPLACES, so a drifted anchor is a loud
    // failure rather than a quiet pass.
    for (const [key, src] of Object.entries(over)) {
      const original = { PAGE: PAGE_SRC, CW: CW_SRC, TL: TL_SRC }[key]
      if (original !== undefined) mutated(original, src, label)
    }
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
  const a = show('── THE RULES ───────────────────────────────────────────────────────────────────────────', runLibSuite(libs))
  const b = show('── THE SCREENS ─────────────────────────────────────────────────────────────────────────', runCensus())

  console.log(`\n${fails === 0 ? `✅ all ${a.ok.length + b.ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
