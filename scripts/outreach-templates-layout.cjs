#!/usr/bin/env node
// scripts/outreach-templates-layout.cjs — the Templates tab's two views.
//   node scripts/outreach-templates-layout.cjs   (≈ 4 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    a STEP OR A TYPE MISSING FROM THE GRID — a box nobody can see is a box nobody fills, and the
//    composer then suggests nothing for a truck that was due one;
//    red on something that is not a gap, which teaches the eye to ignore red;
//    a second, hand-kept list of tokens — the one that shipped `{{truck name}}` on an active
//    template — instead of the resolver's own vocabulary;
//    and anything but the editor's Save writing `outreach_templates`: the wording is Dominic's.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const FILES = ['lib/outreach-sequence.ts', 'lib/outreach-template-render.ts', 'lib/outreach-doc.ts']
function buildLib(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return {
    S: req('lib/outreach-sequence.js'),
    R: req('lib/outreach-template-render.js'),
    D: req('lib/outreach-doc.js'),
  }
}

function runLibSuite({ S, R, D }) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const DAYS = { '1_first_contact': 3, '2_chase_1': 7, '3_chase_2': 14, '4_final_chase': null }

  // ── THE COLUMN HEADINGS' "WHEN" ──────────────────────────────────────────────────────────────
  t('🔴 first contact is day 0', S.stepOffsetLabel('1_first_contact', DAYS) === 'day 0')
  t('🔴 …and each later step shows the interval that LEADS to it, from FOLLOW_UP_DAYS',
    S.stepOffsetLabel('2_chase_1', DAYS) === '+3 days'
    && S.stepOffsetLabel('3_chase_2', DAYS) === '+7 days'
    && S.stepOffsetLabel('4_final_chase', DAYS) === '+14 days')
  t('⚠️ a step whose predecessor has no interval shows nothing, never "+null days"',
    S.stepOffsetLabel('4_final_chase', { ...DAYS, '3_chase_2': null }) === '')
  t('🔴 the grid has FOUR steps and FIVE rows — the default plus the four types',
    S.SLOT_LEAD_TYPES.length === 5 && S.SLOT_LEAD_TYPES[0] === 'any')

  // ── THE TOKEN VOCABULARY IS THE RESOLVER'S ───────────────────────────────────────────────────
  const tokens = R.resolvedTokenReference()
  t('🔴 the token list comes from the resolver and is not empty', Array.isArray(tokens) && tokens.length > 5)
  t('⚠️ every entry has the syntax a person types and a line saying what it fills in',
    tokens.every(x => /^\{\{[a-z0-9_]+\}\}$/.test(x.syntax) && typeof x.description === 'string' && x.description.length > 0))
  t('⚠️ …including the ones the brief names', ['truck_name', 'demo_link'].every(n => tokens.some(x => x.name === n)))

  /* ── 🔴 THE PREVIEW SHOWS THE SIGNATURE AND THE OPT-OUT, BECAUSE THE EMAIL WILL ────────────────
   * REPORTED: the preview printed the characters `{{signature}}` and `{{opt_out}}`.
   * WHY: `renderWithFills` returns both tokens VERBATIM — they are deferred, not unresolved — and
   * the preview stopped there, while the compose window goes on to call `docFromTemplateText`,
   * which is where they are replaced by the rows from the Signature screen. The preview was one
   * call short of the message.
   * ⚠️ THIS RUNS THE REAL FUNCTIONS, not a regex over the panel. The panel is checked separately
   * for making these two calls; this checks that the two calls actually produce the lines. */
  const SIG = { signatureLines: [{ text: 'Kind regards,' }, { text: '' }, { text: 'Dominic Bonini', bold: true }],
    optOut: 'Reply STOP and I will not contact you again.' }
  const BODY = 'Hi Sam.\n\nWould you like a demo?\n\n{{signature}}\n{{opt_out}}'
  const shown = D.docPlainText(D.docFromTemplateText(BODY, SIG))
  t('🔴 the preview text carries the signature lines', shown.includes('Kind regards,') && shown.includes('Dominic Bonini'))
  t('🔴 …and the opt-out sentence', shown.includes(SIG.optOut))
  t('🔴 …and neither token is left standing in it',
    !/\{\{\s*signature\s*\}\}/.test(shown) && !/\{\{\s*opt_out\s*\}\}/.test(shown))
  t('⚠️ …with the blank line inside the signature kept, not collapsed',
    shown.includes('Kind regards,\n\nDominic Bonini'))
  /* ⚠️ AN ABSENT OPT-OUT ROW EXPANDS TO NOTHING, and the preview must show that rather than the
   * token: "nothing here" is the true state of a settings row nobody has written, and it is what
   * the composer will put in the box. */
  const noOpt = D.docPlainText(D.docFromTemplateText(BODY, { ...SIG, optOut: null }))
  t('⚠️ an unset opt-out row shows nothing, not the token', !/opt_out/.test(noOpt))
  /* 🔴 THE RESOLVER STILL DEFERS THEM, which is what makes the two-call sequence right: if
   * `renderWithFills` ever "resolved" them itself there would be two expansions to keep in step. */
  t('🔴 the resolver still returns both tokens verbatim, and calls neither unresolved', (() => {
    const m = R.renderWithFills({ channel: 'email', subject: 'S', body: BODY },
      R.contextFromProspect({ id: 'p', name: 'Sam', contact_first_name: null, contact_last_name: null }), {})
    return /\{\{signature\}\}/.test(m.body) && /\{\{opt_out\}\}/.test(m.body)
      && !m.unresolved.includes('signature') && !m.unresolved.includes('opt_out')
  })())

  /* ── 🔴 THE CONDITION NOTES, CALLED RATHER THAN GREPPED ─────────────────────────────────────────
   * REPLACED: a red "Half of a conditional pair" on every one-sided condition. The claim being
   * checked here is about produced TEXT — "a one-sided condition produces a grey note and no red" —
   * so it is checked by calling the function that produces it. A regex over the panel would be a
   * claim about markup that happens to sit nearby, and the red warning was never wrong about its
   * markup either: it was wrong about what it meant. */
  const AUD = { total: 105, inNoBox: false, keeping: { next_event: 12, website: 105, contact_name: 3 } }
  const ONE_SIDED = 'Hi there.\n?next_event: I run villagefoodie.co.uk and you are at {{next_event_venue}}.\nBye.'

  const oneSided = R.conditionNotes(ONE_SIDED, AUD)
  t('🔴 a ONE-SIDED condition produces exactly one note, and it is not an error',
    oneSided.length === 1 && !/half|pair|missing|error|wrong/i.test(oneSided[0].text))
  t('🔴 …naming the line by its OPENING WORDS, not by the condition name',
    oneSided[0].text.startsWith('\u201cI run villagefoodie.co.uk and you\u2026\u201d')
    && !oneSided[0].text.includes('?next_event:'))
  t('🔴 …and saying in plain English who sees it',
    oneSided[0].text.includes('only appears for trucks with an upcoming event'))
  t('🔴 …with the count, from the numbers it was handed',
    oneSided[0].text.includes("12 of the 105 trucks this template goes to")
    && oneSided[0].text.includes("the other 93 won't see this line"))
  /* ⚠️ THE COUNT IS OMITTED, NOT GUESSED, BEFORE THE PROSPECT LIST ARRIVES. The fetch is allowed to
   * fail silently, and "0 of 0 trucks" is a wrong answer stated confidently. */
  t('⚠️ …and NO count at all when there is nothing to count from', (() => {
    const n = R.conditionNotes(ONE_SIDED, { total: null, inNoBox: false, keeping: {} })
    return n.length === 1 && n[0].text.includes('only appears for') && !/\d/.test(n[0].text.replace(/villagefoodie\.co\.uk/g, ''))
  })())
  /* ⚠️ THE TWO ENDS OF THE COUNT. A sentence that is arithmetically right and reads as nonsense under
   * a correct template is the same failure as the red box this replaced, so both ends are pinned. */
  t('⚠️ …a ZERO denominator gets its own sentence, not "0 of the 0 trucks"', (() => {
    const n = R.conditionNotes(ONE_SIDED, { total: 0, inNoBox: false, keeping: {} })
    return n.length === 1 && /No contactable truck is in this template/.test(n[0].text)
      && !/0 of the 0/.test(n[0].text)
  })())
  t('⚠️ …and a line every truck sees says that, not "the other 0 won\'t see it"', (() => {
    const n = R.conditionNotes(ONE_SIDED, { total: 105, inNoBox: false, keeping: { next_event: 105 } })
    return /every one of them sees it/.test(n[0].text) && !/the other 0/.test(n[0].text)
  })())
  t('🔴 a template in NO BOX counts across every contactable truck, and SAYS so', (() => {
    const n = R.conditionNotes(ONE_SIDED, { ...AUD, inNoBox: true })
    return n[0].text.includes('in no sequence box')
      && n[0].text.includes('across every contactable truck')
  })())

  const pair = R.conditionNotes('?next_event: you are out on {{next_event_day}}\n?no_next_event: when you are next out', AUD)
  t('🔴 a PAIR produces ONE note saying the wording changes — not one note per half',
    pair.length === 1 && pair[0].text === 'This part changes depending on whether the truck has an upcoming event.')
  t('⚠️ …and a pair plus an unrelated single still gets one note each', (() => {
    const n = R.conditionNotes('?next_event: a\n?no_next_event: b\n?website: see {{website}}', AUD)
    return n.length === 2 && n.some(x => /changes depending on/.test(x.text))
      && n.some(x => /only appears for trucks whose website we hold/.test(x.text))
  })())

  /* 🔴 RED IS KEPT FOR WHAT IS ACTUALLY BROKEN, AND THE TWO CASES ARE DERIVED, NOT LISTED. */
  t('🔴 an UNKNOWN condition name is reported as unknown — the line can never render',
    R.conditionalLinesIn('?next_evnt: oops').every(l => l.known === false)
    && R.conditionalLinesIn('?next_event: fine').every(l => l.known === true))
  t('🔴 …and gets NO grey note, because a note about who reads it would be a lie',
    R.conditionNotes('?next_evnt: oops', AUD).length === 0)
  t('🔴 a marker NOT at the start of a line is reported — those characters would be emailed',
    R.misplacedConditionMarkers('and ?next_event: they are out').includes('next_event')
    && R.misplacedConditionMarkers('?next_event: they are out').length === 0)
  t('⚠️ …and ordinary prose with a question mark is NOT reported', (() => {
    const quiet = R.misplacedConditionMarkers('Fancy a demo? Here is the link: {{demo_link}}')
    return quiet.length === 0
  })())
  t('⚠️ …including a line that opens with a valid marker and REPEATS it later',
    R.misplacedConditionMarkers('?next_event: out on X, ?next_event: again').includes('next_event'))

  /* 🔴 THE COUNTS ARE THE RESOLVER'S OWN DECISION. `conditionHolds` must agree with what
   * `renderTemplate` actually does to the line, or the number under the box describes nothing. */
  const withEvent = R.contextFromProspect({ id: 'a', name: 'A', contact_first_name: null, contact_last_name: null,
    website: null, order_url: null, nextEventDate: '2026-12-01', nextEventVenue: 'The Green',
    hu_ordering: null, hu_map: null })
  const without = R.contextFromProspect({ id: 'b', name: 'B', contact_first_name: null, contact_last_name: null,
    website: null, order_url: null, nextEventDate: null, nextEventVenue: null, hu_ordering: null, hu_map: null })
  t('🔴 `conditionHolds` IS the renderer\'s own check, and agrees with what it drops', (() => {
    const tpl = { channel: 'email', subject: null, body: '?next_event: at {{next_event_venue}}' }
    const kept = R.renderTemplate(tpl, withEvent)
    const gone = R.renderTemplate(tpl, without)
    return R.conditionHolds('next_event', withEvent) === true
      && R.conditionHolds('no_next_event', withEvent) === false
      && R.conditionHolds('next_event', without) === false
      && kept.droppedConditions.length === 0 && gone.droppedConditions.includes('next_event')
  })())
  t('⚠️ …and an unknown condition holds for nobody, as `conditionMet` documents',
    R.conditionHolds('next_evnt', withEvent) === false)

  /* ── 🔴 THE MENU'S WORDING COMES FROM THE RESOLVER, ON THE SAME ENTRY AS THE NAME ──────────── */
  const conds = R.conditionReference()
  t('🔴 every condition the resolver knows carries plain wording for the menu',
    conds.length >= 9 && conds.every(c => typeof c.only === 'string' && /^Only if /.test(c.only))
    && conds.every(c => typeof c.shownTo === 'string' && c.shownTo.length > 0))
  t('🔴 …in the words the brief asked for', (() => {
    const by = Object.fromEntries(conds.map(c => [c.name, c.only]))
    return by.next_event === 'Only if they have an upcoming event'
      && by.no_next_event === 'Only if they have no upcoming event'
      && by.website === 'Only if we have their website'
      && by.contact_name === 'Only if we have their name'
  })())
  t('⚠️ …and the four lead conditions are worded from LEAD_TYPE_LABELS, not a second set of names',
    conds.filter(c => c.name.startsWith('lead_')).length === 4
    && conds.find(c => c.name === 'lead_hu_map').only.includes('Hatches Up \u2014 map only'))
  t('⚠️ only the POSITIVE half of a pair carries the pair wording — `no_` never leads one',
    conds.find(c => c.name === 'next_event').axis === 'whether the truck has an upcoming event'
    && conds.find(c => c.name === 'no_next_event').axis === undefined)

  /* ── 🔴 THE PREVIEW FOOTER, IN WORDS INSTEAD OF `Dropped: next_event` ──────────────────────── */
  const hidden = R.hiddenLineNotes(ONE_SIDED, ['next_event'])
  t('🔴 the preview footer names the LINE and why it is hidden, in plain words',
    hidden.length === 1
    && hidden[0].text.startsWith('Hidden for this truck: \u201cI run villagefoodie.co.uk and you\u2026\u201d')
    && hidden[0].text.includes('it only shows for trucks with an upcoming event'))
  t('🔴 …and the words "Dropped" and the bare condition name are gone from it',
    !/Dropped/.test(hidden[0].text) && !/next_event/.test(hidden[0].text))
  t('⚠️ two lines sharing one condition are counted, not represented by one of them', (() => {
    const n = R.hiddenLineNotes('?next_event: first line\n?next_event: second line', ['next_event'])
    return n.length === 1 && n[0].text.includes('2 lines') && n[0].text.includes('they only show')
  })())
  t('⚠️ …and it reads the RENDERER\'s report, so "Simulate no upcoming event" still drives it', (() => {
    const tpl = { channel: 'email', subject: null, body: ONE_SIDED }
    const forced = R.renderTemplate(tpl, { ...withEvent, nextEventDate: null, nextEventVenue: null })
    return R.hiddenLineNotes(ONE_SIDED, forced.droppedConditions).length === 1
      && R.hiddenLineNotes(ONE_SIDED, R.renderTemplate(tpl, withEvent).droppedConditions).length === 0
  })())

  return { ok, bad }
}

function runCensus(over = {}) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const GRID = stripComments(over.GRID ?? read('components/admin/SequenceGrid.tsx'))
  const TAB = stripComments(over.TAB ?? read('components/admin/TemplatesPanel.tsx'))

  // ── 1 · TWO VIEWS, REMEMBERED ────────────────────────────────────────────────────────────────
  t('🔴 there are two views, and only two in the switch',
    /\[\['sequence', 'Sequence'\], \['templates', 'Templates'\]\] as const/.test(TAB))
  t('🔴 …the last one is remembered, in try/catch',
    /window\.localStorage\.getItem\(TEMPLATES_VIEW_KEY\)/.test(TAB)
    && /window\.localStorage\.setItem\(TEMPLATES_VIEW_KEY, v\)/.test(TAB)
    && (TAB.match(/try \{[^}]*localStorage[^}]*\} catch/g) || []).length >= 2)
  t('⚠️ …and a stored value that is neither is ignored',
    /if \(saved === 'sequence' \|\| saved === 'templates'\) setView\(saved\)/.test(TAB))
  t('🔴 a grid cell opens its template in the Templates view',
    /onOpenTemplate=\{uuid => \{ setHighlightBox\(null\); requestSelect\(uuid\); chooseView\('templates'\) \}\}/.test(TAB))
  t('🔴 …and a "Used in" chip opens the Sequence view with that box outlined',
    /const openBox = \(chipLabel: string\)/.test(TAB) && /setHighlightBox\(slotKey\(/.test(TAB)
    && /highlight=\{highlightBox\}/.test(TAB) && /highlight === key/.test(GRID))

  // ── 2 · THE SEQUENCE VIEW ────────────────────────────────────────────────────────────────────
  t('🔴 columns are the STEPS, all four of them, from CONTACT_KINDS',
    /<thead>[\s\S]{0,400}CONTACT_KINDS\.map\(step =>/.test(GRID))
  t('🔴 rows are the default and the four types, from SLOT_LEAD_TYPES',
    /<tbody>[\s\S]{0,200}SLOT_LEAD_TYPES\.map\(lt =>/.test(GRID))
  t('🔴 …and each column says WHEN, from FOLLOW_UP_DAYS', /stepOffsetLabel\(step, FOLLOW_UP_DAYS\)/.test(GRID))
  t('⚠️ …and each type row says how many trucks it has', /typeCounts\.get\(lt\) \?\? 0\} truck/.test(GRID))
  t('🔴 NO CELL IS AN ALWAYS-OPEN DROPDOWN — there is no <select> in the grid at all',
    !/<select/.test(GRID))
  t('🔴 a cell is a label until it is clicked', /<button type="button" onClick=\{onOpen\}/.test(GRID)
    && /\{open && \(/.test(GRID))
  t('⚠️ …and the one being edited is outlined', /outlined \? 'ring-2 ring-slate-800'/.test(GRID))
  t('⚠️ Esc closes it, and so does a click away',
    /if \(e\.key !== 'Escape'\) return/.test(GRID) && /className="fixed inset-0 z-20" onClick=\{onClose\}/.test(GRID))
  t('🔴 the picker offers "Same as default", the channel\'s templates, and a new one',
    /isDefaultRow \? 'No template' : 'Same as default'/.test(GRID)
    && /\+ Write a new one for this box/.test(GRID))
  t('⚠️ …and the new one CREATES NOTHING until Save: it opens the form',
    /onNewTemplate=\{channel => \{ chooseView\('templates'\); void createTemplate\(channel\) \}\}/.test(TAB))
  t('🔴 a filled cell carries the ↗ that opens its template', /onOpenTemplate\(template\.uuid\)/.test(GRID))
  t('⚠️ …and the name wraps rather than being cut off', /break-words/.test(GRID) && !/truncate/.test(GRID))

  // ── THE DUE PILL AND THE RED ─────────────────────────────────────────────────────────────────
  t('🔴 the due pill renders ONLY above zero — "0 due" appears nowhere',
    /\{due > 0 && \(/.test(GRID) && !/0 due/.test(GRID))
  t('🔴 red is for a gap, and a gap is a box that would suggest nothing',
    /const gap = \(!own && !inherited\) \|\| broken/.test(GRID))
  t('🔴 …and an empty DEFAULT cell that every type covers is not one — it is grey "None"',
    /const matters = gap && \(lt !== ANY_LEAD \|\| due > 0\)/.test(GRID)
    && /text-slate-400">None</.test(GRID))
  t('⚠️ the pill is red only when the box it sits on is a gap',
    /matters \? 'bg-red-100 border-red-300 text-red-800' : 'bg-slate-100/.test(GRID))
  t('⚠️ an inherited cell is dashed and grey, never red',
    /inherited \? 'border-dashed border-slate-300 bg-slate-50'/.test(GRID))
  t('🔴 there is a key under the grid saying what all of that means',
    /red = nothing will be suggested/.test(GRID) && /trucks due at that box now/.test(GRID))

  // ── THE TWO PANELS THAT WENT ─────────────────────────────────────────────────────────────────
  t('🔴 the standing truck-types panel is gone', !/<span className=\{LABEL\}>Truck types<\/span>/.test(GRID)
    && !/Truck types/.test(GRID))
  t('🔴 …its definitions are behind an ⓘ on the row they define, with Rename',
    /aria-label=\{`How \$\{name\(lt as LeadType\)\} is decided`\}/.test(GRID)
    && /function TypePopover/.test(GRID) && /onRename\(type, text\.trim\(\)\)/.test(GRID))
  t('🔴 the changed-type panel is one amber line, and nothing when there is nothing to say',
    /\{changed\.length > 0 && \(/.test(GRID) && /changed type since/.test(GRID))
  t('⚠️ …with the list behind Review', /setReviewOpen\(v => !v\)/.test(GRID))

  // ── 3 · THE TEMPLATES VIEW ───────────────────────────────────────────────────────────────────
  t('🔴 three panes, at the asked-for widths', /gridTemplateColumns: '270px minmax\(0, 1fr\) minmax\(0, 30%\)'/.test(TAB))
  /* ── 🔴 RESTATED (v2 item 4), NOT SILENTLY RE-POINTED ────────────────────────────────────────
   * THIS CHECK USED TO PIN `height: 'calc(100vh - 12rem)'`, and that constant is the very bug
   * v2 item 4 was raised about: 12rem was a GUESS at the admin chrome, the real shell is taller,
   * and so the page scrolled in production Safari while this check sat green. The constant is
   * gone on purpose. The half of this check that is still true — the panes fill the viewport
   * below the switcher and each scrolls on its own — is restated here against the MEASURED
   * height; the measurement itself is checked in the v2 block below, which owns it now.
   * ⚠️ THE SECOND HALF IS RESTATED TOO, AND NOT LOOSENED. It used to count two panes carrying
   * the one class string `flex-1 min-h-0 overflow-y-auto`. Each pane has its own shape now — and
   * RESTATED AGAIN (30 September, the overlap fix): the centre pane's scroller is no longer the
   * pane itself. The editor is a column whose BODY scrolls and whose Save row is pinned outside
   * that scroller, because a Save button inside it scrolled away the moment the editor did. So
   * the centre entry names the inner scroller. Each of the three is named at its real shape. */
  t('🔴 …full height below the switcher, and each pane scrolls on its own',
    /style=\{\{ gridTemplateColumns: '270px minmax\(0, 1fr\) minmax\(0, 30%\)', height: panesHeight \}\}/.test(TAB)
    && /<div className="flex-1 min-h-0 overflow-y-auto">/.test(TAB)
    && /bg-white p-4 h-full min-h-0 flex flex-col/.test(TAB)
    && /<div className="flex-1 min-h-0 overflow-y-auto space-y-3 flex flex-col">/.test(TAB)
    && /<pre className="flex-1 min-h-0 text-base[^"]*overflow-y-auto"/.test(TAB))
  t('🔴 …and NOTHING here locks the page — the v4-fixes bug is not reintroduced',
    !/document\.body\.style/.test(TAB) && !/documentElement\.style/.test(TAB))
  t('🔴 the left pane has New template, a search, and the two libraries at the bottom',
    /\+ New template/.test(TAB) && /placeholder="Search templates…"/.test(TAB)
    && /setView\('snippets'\)/.test(TAB) && /setView\('signature'\)/.test(TAB))
  t('🔴 …templates grouped by channel', /\(\['email', 'whatsapp'\] as const\)\.map\(ch =>/.test(TAB))
  t('🔴 …each saying where it is used', /Used in \$\{usedIn\.length\} box/.test(TAB) && /Not in sequence/.test(TAB))
  t('🔴 …and retired ones collapsed', /Retired \(\{listRows\.filter\(r => !r\.active\)\.length\}\)/.test(TAB))
  t('⚠️ the reorder and retire controls survived the move', /title="Move up"/.test(TAB) && /Retire \(kept/.test(TAB))
  t('🔴 the editor no longer carries the "When to use it" controls',
    !/When to use it/.test(TAB) && !/At which stage/.test(TAB) && !/For which trucks/.test(TAB))
  /* ── 🔴 RESTATED (v2 item 5), NOT SILENTLY RE-POINTED ────────────────────────────────────────
   * THIS CHECK USED TO REQUIRE the read-only line "Older tags on this row, no longer used to
   * choose". v2 item 5 deleted it: it was one of the three "Used in" prose lines the mockup
   * replaces with chips, and it described tags that stopped deciding anything when the sequence
   * grid took over. Requiring it and forbidding it would be a contradiction, so the requirement
   * is INVERTED here rather than left pointing at dead text — and the v2 block below checks the
   * same absence from the other side, together with the two prose lines that went with it. */
  t('⚠️ …and the older-tags line went WITH the rest of the prose, not left behind',
    !/Older tags on this row, no longer used to choose/.test(TAB))

  // ── THE INSERT TOKEN MENU ────────────────────────────────────────────────────────────────────
  t('🔴 the menu reads the RESOLVER\'s vocabulary', /<TokenMenu tokens=\{tokenRef\}/.test(TAB)
    && /const tokenRef = useMemo\(\(\) => resolvedTokenReference\(\), \[\]\)/.test(TAB))
  /* ⚠️ THE BAN IS ON A HAND-WRITTEN ENTRY, NOT ON THE CHARACTERS. The tab legitimately PRINTS
   * `{{truck_name}}` in the sentence that explains why `{{truck name}}` is unreadable — an example
   * in an error message is not a second vocabulary. What must never appear is an entry of the
   * resolver's own shape (`syntax:` / `description:`) written out here. */
  t('🔴 …and there is no second, hand-kept list of token names in the tab',
    !/syntax: '/.test(TAB) && !/const TOKENS = \[/.test(TAB))
  t('🔴 it inserts at the cursor, through the existing caret helper',
    /onInsert=\{syntax => insertAtCaret\(syntax\)\}/.test(TAB) && /function TokenMenu/.test(TAB))
  t('⚠️ …and is disabled until a field has been focused, with the reason',
    /disabled=\{!lastFocus\}/.test(TAB) && /Click into the subject or body first/.test(TAB))
  /* ── 🔴 RESTATED (1 October, the conditions task) — NOT SILENTLY RE-POINTED ───────────────────
   * THIS CHECK USED TO READ "the conditional PAIRS keep their own control — one click writes both
   * halves", and it still PASSED after the menu was rewritten, because both things it actually
   * tested (`function CondMenu`, `ownLines: true`) are still true. Its CLAIM is not: the menu no
   * longer offers pairs and no longer writes two lines per click.
   * 🔴 THE CLAIM WAS ALSO THE PREMISE THIS TASK OVERTURNS. "One click writes both halves" existed
   * because a half-written pair was treated as a mistake — the same belief behind the red warning
   * that is now gone. And it had a cost that was never written down: SEVEN of today's nine conditions
   * were unreachable from that menu — `?website:`, `?contact_name:`, `?order_url:` and the four
   * `?lead_*` lines have no negative half even in principle, so a pairs-only menu could not offer
   * them at all. Only `next_event` / `no_next_event` were, and they came as one both-halves insert.
   * ⚠️ WHAT SURVIVES INTACT IS `ownLines`, and it matters more than before: a marker is recognised
   * only as the first thing on its line, and a mid-line one is now red (`misplacedConditionMarkers`).
   * So the check is restated as "every condition, one marker, still forced onto its own line". */
  t('🔴 the condition menu offers EVERY condition, one marker per click, on its own line',
    /function CondMenu/.test(TAB) && /ownLines: true/.test(TAB)
    && /<CondMenu conds=\{condRef\}/.test(TAB)
    && /onInsert=\{c => insertAtCaret\(`\?\$\{c\}: `, \{ ownLines: true \}\)\}/.test(TAB)
    && !/<CondMenu pairs=/.test(TAB))

  // ── 🔴 THE CONDITION NOTES: GREY FOR A CHOICE, RED FOR A MISTAKE ──────────────────────────────
  /* The wording itself is asserted in the lib suite, by calling `conditionNotes` and
   * `hiddenLineNotes`. What is checked HERE is the wiring: that the panel renders those two, in
   * grey, that the red warning is gone, and that it composes no sentence of its own. */
  t('🔴 the red "Half of a conditional pair" warning is GONE, and so is the derivation behind it',
    !/Half of a conditional/.test(TAB) && !/halfPairs/.test(TAB))
  t('🔴 …replaced by grey notes, one per conditional line, with no heading and no error styling',
    /\{condNotes\.map\(n => \(/.test(TAB)
    && /<p key=\{n\.key\} className="text-\[11px\] leading-snug text-slate-500">\{n\.text\}<\/p>/.test(TAB))
  t('🔴 …and the SENTENCES come from the resolver module, not composed in the panel',
    /const condNotes = conditionNotes\(draft\.body \?\? '', \{/.test(TAB)
    && /const droppedNotes = hiddenLineNotes\(draft\.body \?\? '', preview\?\.droppedConditions \?\? \[\]\)/.test(TAB)
    && !/only appears for/.test(TAB) && !/changes depending on/.test(TAB))
  t('🔴 RED survives for the two things that ARE broken, and each says how to fix it',
    /\{unknownConds\.length > 0 && \(/.test(TAB) && /\{misplaced\.length > 0 && \(/.test(TAB)
    && /Use one from .Insert condition/.test(TAB)
    && /Move it to the start of its own line/.test(TAB))
  t('⚠️ …both read the resolver\'s own derivations, not a regex in the panel',
    /conditionalLinesIn\(draft\.body \?\? ''\)/.test(TAB)
    && /misplacedConditionMarkers\(draft\.body \?\? ''\)/.test(TAB)
    && !/\^\\\\\?/.test(TAB))
  t('⚠️ …and the existing malformed and must-resolve reds are untouched',
    /Unreadable token/.test(TAB) && /Cannot be sent to/.test(TAB))

  // ── 🔴 THE COUNTS COME FROM THE GRID'S OWN DERIVATIONS ───────────────────────────────────────
  t('🔴 contactable is `channelFor` — the predicate that gates the work queue, not a copy',
    /channelFor\(\{ \.\.\.p, waPhone: phoneWhatsApp\(p\.phone \?\? null, null\)\.waPhone \}\)/.test(TAB)
    && /\.filter\(x => x\.ch !== null\)/.test(TAB))
  t('🔴 …a truck\'s type is `effectiveLeadType` — the grid\'s own call, frozen value first',
    /b\.lead_type === effectiveLeadType\(x\.p\)/.test(TAB)
    && /b\.lead_type === ANY_LEAD/.test(TAB))
  t('🔴 …the context is the PREVIEW\'s own builder, so count and preview cannot disagree',
    /ctx: contextFromProspect\(p\)/.test(TAB))
  t('🔴 …and whether a line keeps a truck is `conditionHolds`, the resolver\'s own `conditionMet`',
    /conditionHolds\(l\.cond, x\.ctx\)/.test(TAB))
  t('⚠️ the audience is the template\'s own boxes, and every contactable truck when it is in none',
    /slots\.filter\(s => s\.template_id === selectedId\)/.test(TAB)
    && /audienceBoxes\.length === 0/.test(TAB))
  /* ⚠️ THE COST GUARD. v2 deleted a derivation that walked all 231 prospects on every keystroke to
   * produce a number nothing rendered. This one must not become that: the 231 context builds are
   * memoised on the PROSPECT LIST ALONE, and nothing keyed on the body may hold them. */
  t('🔴 the expensive half is memoised on the prospect list alone — not on the body, not on the grid',
    /const reachable = useMemo\(\s*\(\) => prospects/.test(TAB)
    && /\n    \[prospects\]\)/.test(TAB))
  t('⚠️ …and the slots-dependent half is a PLAIN derivation, as this file requires below `usedIn`',
    /const audienceBoxes = selectedId \? slots\.filter/.test(TAB)
    && !/useMemo\(\(\) => \{\s*const boxes = selectedId/.test(TAB))

  // ── 🔴 THE PREVIEW FOOTER SAYS WHAT WAS HIDDEN, IN WORDS ─────────────────────────────────────
  t('🔴 the `Dropped: next_event` chip is gone, and the footer renders the plain notes',
    !/Dropped: \{preview\.droppedConditions/.test(TAB)
    && /\{droppedNotes\.map\(d => \(/.test(TAB))
  t('⚠️ …and "Simulate no upcoming event" still drives it, unchanged',
    /Simulate no upcoming event/.test(TAB) && /checked=\{forceNoEvent\}/.test(TAB)
    && /forceNoEvent \? \{ \.\.\.base, nextEventDate: null, nextEventVenue: null \} : base/.test(TAB))
  t('🔴 the malformed-token guard is untouched', /malformedTokensIn/.test(TAB))
  t('🔴 the Tokens RAIL is gone, and the right pane is the preview',
    !/RAIL_TABS/.test(TAB) && !/rail === 'tokens'/.test(TAB) && /Preview<\/p>/.test(TAB))
  t('⚠️ the preview still names the prospect it renders against, and what did not fill',
    /pick a prospect/.test(TAB) && /Unresolved:/.test(TAB))

  // ── v2 · THE MOCKUP, TIGHTENED ───────────────────────────────────────────────────────────────
  t('🔴 there is no SECOND tab row — "Templates" appeared twice, two rows apart',
    !/\['templates', 'Templates'\],/.test(TAB) && !/\['signature', 'Signature'\],/.test(TAB))
  t('⚠️ …and Snippets keeps its count, on the left pane\'s link',
    /Snippets\{snippetUses\.length \? ` \(\$\{snippetUses\.length\}\)` : ''\}/.test(TAB))
  t('🔴 the numbered headings are gone, and so are their paragraphs',
    !/Name it<\/h3>/.test(TAB) && !/Write it<\/h3>/.test(TAB)
    && !/This name is for you/.test(TAB) && !/This is what actually gets sent/.test(TAB))
  t('⚠️ the fields are labelled plainly, and the slug is still beside the name',
    /<span className=\{LABEL\}>Template name<\/span>/.test(TAB) && /\{selected\.slug\}/.test(TAB))
  t('⚠️ …and the braces hint survives, under the Message label',
    /double braces/.test(TAB) && /square brackets/.test(TAB))
  t('🔴 the three "Used in" prose lines are gone from the editor',
    !/Not in the sequence — pick it by hand/.test(TAB)
    && !/The sequence sends this to/.test(TAB)
    && !/Older tags on this row/.test(TAB))
  t('🔴 …and the chips render ONLY when the template is in a box', /\{usedInChips\.length > 0 && \(/.test(TAB))
  t('🔴 THE LIST AND THE EDITOR ASK THE SAME FUNCTION WITH THE SAME ID', (() => {
    // 🔴 THE BUG: the editor asked `usedIn(draft.id)`, and `draft` is seeded with the EDITABLE
    // fields only — the id is not one of them — so it was always `usedIn('')` and every template
    // read "Not in the sequence" while the list correctly said "Used in n boxes".
    const listCall = /usedIn=\{usedIn\(r\.id \?\? ''\)\}/.test(TAB)
    const editorCall = /const usedInChips = selectedId \? usedIn\(selectedId\) : \[\]/.test(TAB)
    return listCall && editorCall && !/usedIn\(draft\.id/.test(TAB)
  })())
  t('⚠️ …and `draft` still carries no id, which is why it could never have been the right input',
    !/setDraft\(\{ id:/.test(TAB))
  t('🔴 the panes\' height is MEASURED from their own top, not a constant',
    /el\.getBoundingClientRect\(\)\.top \+ window\.scrollY/.test(TAB)
    && /height: panesHeight/.test(TAB) && !/calc\(100vh - 12rem\)/.test(TAB))
  t('🔴 …including the padding BELOW them, which is what made the page 24px too tall',
    /window\.getComputedStyle\(el\.parentElement \?\? el\)\.paddingBottom/.test(TAB))
  t('⚠️ …and it re-measures when anything above changes height', /new ResizeObserver\(schedule\)/.test(TAB))
  /* ── 🔴 RESTATED (30 September, the overlap fix) ──────────────────────────────────────────────
   * This pinned `mt-auto`, which put Save at the bottom of the editor's own scrolling column —
   * true while the column never scrolled, and false the moment it did. Save is OUTSIDE the
   * scroller now, so what must hold is that it is a non-shrinking row after it, and that no
   * `mt-auto` has crept back to suggest it is still the last thing inside. */
  t('🔴 Save sits at the bottom of the pane, always on screen',
    /<div className="shrink-0 flex justify-end pt-2">/.test(TAB) && !/mt-auto/.test(TAB))
  /* ── 🔴 THE OVERLAP: ONE COLUMN, ONE THING THAT GIVES ─────────────────────────────────────────
   * The two `flex-1 min-h-0` wrappers around the write section are what made `shrink-0` on the
   * leaves useless: an ancestor that may shrink below its content absorbs the shortfall and lets
   * the content spill over whatever follows. They are gone, and the floor on the message is what
   * turns "squeeze the writing box to nothing" into "scroll the editor". */
  t('🔴 the write section is no longer two shrinkable wrappers deep',
    !/pt-3 border-t border-slate-100 flex-1/.test(TAB) && !/space-y-3 flex-1 min-h-0 flex flex-col/.test(TAB))
  t('🔴 …the message is the one item that gives, and it has a floor',
    /<label className="flex-1 min-h-\[7rem\] flex flex-col">/.test(TAB)
    && /\$\{FIELD\} flex-1 min-h-0 resize-none/.test(TAB))
  t('⚠️ …and every other block in the editor refuses to shrink',
    (TAB.match(/className="shrink-0|className=\{`shrink-0|className="block shrink-0/g) || []).length >= 8)
  t('🔴 the preview body fills the pane and scrolls inside',
    /<pre className="flex-1 min-h-0 text-base/.test(TAB) && !/maxHeight: 340/.test(TAB))
  /* ── 🔴 THE PREVIEW IS ONE CALL LONGER THAN IT WAS ────────────────────────────────────────────
   * It ended at `renderWithFills`, which leaves the two send-time tokens standing, so the pane
   * printed `{{signature}}` and `{{opt_out}}` where the sign-off and the PECR line go. */
  t('🔴 the preview expands the signature and the opt-out through the COMPOSER\'s own call',
    /docPlainText\(docFromTemplateText\(m\.body, sendSettings\)\)/.test(TAB))
  /* ⚠️ THE PREVIEW ONLY READS. The one POST to this route is the Signature screen's Save, and it
   * stays below `function SignaturePanel`; the two bare GETs are that screen's load and this one. */
  t('⚠️ …reading the same settings route, with the same two parsers, and writing nothing', (() => {
    const gets = (TAB.match(/fetch\('\/api\/admin\/outreach\/settings'\)/g) || []).length
    const posts = (TAB.match(/fetch\('\/api\/admin\/outreach\/settings', \{/g) || []).length
    const beforePanel = TAB.split('function SignaturePanel')[0]
    return gets === 2 && posts === 1 && !beforePanel.includes("outreach/settings', {")
      && /parseSignature\(j\.signature\)/.test(TAB) && /parseOptOut\(j\.optOut\)/.test(TAB)
  })())
  t('⚠️ …email only, and only once those settings have arrived',
    /tpl\.channel === 'email' && sendSettings/.test(TAB))
  t('🔴 …and there is STILL no substitution written in this file', !/\.replace\(\/\\\{\\\{/.test(TAB))
  t('🔴 NOTHING in this tab is orange any more — orange is Send and the Next banner',
    !/bg-orange-600/.test(TAB))
  t('⚠️ …and the two buttons that were are dark',
    (TAB.match(/rounded-lg bg-slate-900 text-white/g) || []).length >= 2)

  // ── 4 · THE PHONE ────────────────────────────────────────────────────────────────────────────
  t('⚠️ the grid scrolls sideways in its own box, with the row labels pinned',
    /overflow-x-auto/.test(GRID) && (GRID.match(/sticky left-0/g) || []).length === 2)
  t('⚠️ …and the three panes stack', /max-md:grid-cols-1 max-md:h-auto/.test(TAB))

  // ── WHAT MAY NOT CHANGE ──────────────────────────────────────────────────────────────────────
  t('🔴 the only writer of `outreach_templates` is still the editor\'s Save', (() => {
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
    for (const d of ['app', 'lib', 'components']) walk(path.join(REPO, d))
    return writers.every(w => w === 'app/api/admin/outreach-templates/route.ts:insert'
      || w === 'app/api/admin/outreach-templates/route.ts:update')
  })())
  t('🔴 the grid still saves a box through the same two actions',
    /action: 'set_slot'/.test(TAB) && /action: 'clear_slot'/.test(TAB))
  t('⚠️ …with "saved" and an Undo', /say\('saved'\)/.test(GRID) && /setUndo\(\{/.test(GRID))
  return { ok, bad }
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const GRID_SRC = read('components/admin/SequenceGrid.tsx')
  const TAB_SRC = read('components/admin/TemplatesPanel.tsx')
  /* 🔴 A VARIANT THAT DID NOT APPLY PROVES NOTHING AND LOOKS LIKE A PASS — `String.replace` returns
   * the same string when it finds nothing. Every mutation is checked for having changed something. */
  const changed = (before, after, label) => {
    if (before === after) { console.log(`🔴 ${label}: THE PATCH DID NOT APPLY — its anchor has drifted`); process.exit(1) }
    return after
  }
  for (const [label, over] of [
    ['V1 🔴 the Final chase column is dropped from the grid',
      { GRID: changed(GRID_SRC, GRID_SRC.replace('{CONTACT_KINDS.map(step => (\n                  <th key={step}',
        "{CONTACT_KINDS.filter(k => k !== '4_final_chase').map(step => (\n                  <th key={step}"), 'V1') }],
    ['V2 🔴 a red pill on a filled cell — red stops meaning "a gap"',
      { GRID: changed(GRID_SRC, GRID_SRC.replace(
        "matters ? 'bg-red-100 border-red-300 text-red-800' : 'bg-slate-100 border-slate-300 text-slate-600'",
        "'bg-red-100 border-red-300 text-red-800'"), 'V2') }],
    ['V3 🔴 "0 due" is printed on every empty box',
      { GRID: changed(GRID_SRC, GRID_SRC.replace('{due > 0 && (', '{true && ('), 'V3') }],
    ['V4 🔴 the token list is hard-coded beside the resolver instead of read from it',
      { TAB: changed(TAB_SRC, TAB_SRC.replace('<TokenMenu tokens={tokenRef}',
        "<TokenMenu tokens={[{ syntax: '{{truck_name}}', name: 'truck_name', description: 'the name' }]}"), 'V4') }],
    ['V5 🔴 a cell goes back to an always-open dropdown',
      { GRID: changed(GRID_SRC, GRID_SRC.replace('<button type="button" onClick={onOpen}',
        '<select onChange={e => onChoose(e.target.value)} /><button type="button" onClick={onOpen}'), 'V5') }],
    ['V6 🔴 the truck-types panel comes back as a standing block',
      { GRID: changed(GRID_SRC, GRID_SRC.replace('const CARD = ', 'const PANEL_TITLE = "Truck types"\nconst CARD = '), 'V6') }],
    /* ⚠️ RE-ANCHORED (v2): the height is no longer a constant in the source — it is measured from
     * the panes' own top edge, because the constant was the bug. The variant now breaks the
     * measurement itself, which is the same failure one level down. */
    ['V7 🔴 the Templates view scrolls as one page again',
      { TAB: changed(TAB_SRC, TAB_SRC.replace('height: panesHeight', "minHeight: '10rem'"), 'V7') }],
    ['V8 🔴 the second tab row comes back, and "Templates" appears twice',
      { TAB: changed(TAB_SRC, TAB_SRC.replace("const BOTTOM_GUTTER_PX = 4",
        "const OLD_TABS = [['templates', 'Templates'],\n  ['signature', 'Signature'],\n]\nconst BOTTOM_GUTTER_PX = 4"), 'V8') }],
    ['V9 🔴 the editor asks `usedIn(draft.id)` again — the list and the editor disagree',
      { TAB: changed(TAB_SRC, TAB_SRC.replace('const usedInChips = selectedId ? usedIn(selectedId) : []',
        "const usedInChips = usedIn(draft.id ?? '')"), 'V9') }],
    ['V12 🔴 the preview stops at the render again — {{signature}} and {{opt_out}} are printed as text',
      { TAB: changed(TAB_SRC, TAB_SRC.replace(`    const full = tpl.channel === 'email' && sendSettings
      ? docPlainText(docFromTemplateText(m.body, sendSettings))
      : m.body`, '    const full = m.body'), 'V12') }],
    ['V14 🔴 the message loses its floor — the writing box is squeezed towards nothing',
      { TAB: changed(TAB_SRC, TAB_SRC.replace('<label className="flex-1 min-h-[7rem] flex flex-col">',
        '<label className="flex-1 min-h-0 flex flex-col">'), 'V14') }],
    ['V15 🔴 Save goes back inside the scroller on mt-auto — it scrolls away with the editor',
      { TAB: changed(TAB_SRC, TAB_SRC.replace('<div className="shrink-0 flex justify-end pt-2">',
        '<div className="shrink-0 flex justify-end mt-auto pt-2">'), 'V15') }],
    ['V16 🔴 the write section goes back to two shrinkable wrappers — the overlap returns',
      { TAB: changed(TAB_SRC, TAB_SRC.replace('<div className="shrink-0 border-t border-slate-100" />',
        '<div className="pt-3 border-t border-slate-100 flex-1 min-h-0 flex flex-col">'), 'V16') }],
    ['V10 🔴 Save goes back to orange',
      { TAB: changed(TAB_SRC, TAB_SRC.replace('rounded-lg bg-slate-900 text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400">\n                    Save template',
        'rounded-lg bg-orange-600 text-white">\n                    Save template'), 'V10') }],
    /* ── 🔴 THE 1 OCTOBER VARIANTS — THE WHOLE POINT OF THIS TASK, PUT BACK ──────────────────────
     * V17 is the one that matters most: the brief names it ("broken variants must fail: the red
     * half-pair error comes back"). A checklist that says "red is gone" without ever having been
     * shown catching red is not a check. */
    ['V17 🔴 the red "Half of a conditional pair" error comes back on a one-sided condition',
      { TAB: changed(TAB_SRC, TAB_SRC.replace(
        '<p key={n.key} className="text-[11px] leading-snug text-slate-500">{n.text}</p>',
        '<p key={n.key} className="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">'
        + '<span className="font-bold">Half of a conditional pair:</span>{n.text}</p>'), 'V17') }],
    ['V18 🔴 the condition menu goes back to a hand-kept list instead of the resolver\'s own',
      { TAB: changed(TAB_SRC, TAB_SRC.replace('<CondMenu conds={condRef}',
        "<CondMenu conds={[{ syntax: '?next_event: ', name: 'next_event', description: 'd', documented: true,"
        + " only: 'Only if they have an upcoming event', shownTo: 'trucks with an upcoming event' }]}"), 'V18') }],
    ['V19 🔴 "contactable" is re-implemented in the panel instead of asking `channelFor`',
      { TAB: changed(TAB_SRC, TAB_SRC.replace(
        'channelFor({ ...p, waPhone: phoneWhatsApp(p.phone ?? null, null).waPhone })',
        "(p.contact_email ? 'email' : null)"), 'V19') }],
    ['V20 🔴 the count stops asking the resolver and tests the date itself',
      { TAB: changed(TAB_SRC, TAB_SRC.replace('conditionHolds(l.cond, x.ctx)', '!!x.ctx.nextEventDate'), 'V20') }],
    /* ⚠️ `leadTypeOf` IS THE PLAUSIBLE WRONG ANSWER, not a nonsense one: it is the live derivation,
     * and using it would count a truck mid-sequence under today's type rather than the one its
     * sequence was framed in — the exact drift `effectiveLeadType` exists to prevent. */
    ['V21 🔴 the audience counts by `leadTypeOf`, ignoring the type frozen at first contact',
      { TAB: changed(TAB_SRC, TAB_SRC.replace('b.lead_type === effectiveLeadType(x.p)',
        'b.lead_type === leadTypeOf(x.p)'), 'V21') }],
    ['V22 🔴 the preview footer goes back to `Dropped: next_event`',
      { TAB: changed(TAB_SRC, TAB_SRC.replace('{droppedNotes.map(d => (',
        "{preview.droppedConditions.length > 0 && (<span>Dropped: {preview.droppedConditions.join(', ')}</span>)}\n"
        + '                        {false && droppedNotes.map(d => ('), 'V22') }],
    ['V23 🔴 the note wording is composed in the panel again, beside the resolver\'s copy',
      { TAB: changed(TAB_SRC, TAB_SRC.replace("  const condNotes = conditionNotes(draft.body ?? '', {",
        "  const condNotes = condLines.map(l => ({ key: l.cond,\n"
        + "    text: `that line only appears for some trucks` }))\n"
        + "  const unusedNotes = conditionNotes(draft.body ?? '', {"), 'V23') }],
  ]) {
    const r = runCensus(over)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  const libVariant = (tag, patch, file = 'lib/outreach-sequence.ts') => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `tl-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, file)
    const src = fs.readFileSync(f, 'utf8')
    const out = patch(src)
    if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return buildLib(tmp, tag)
  }
  {
    const libs = libVariant('v8', s => s.replace('  const days = followUpDays[before]', '  const days = 5'))
    const r = runLibSuite(libs)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V11 🔴 the column headings invent their own cadence`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  {
    /* V13 — THE SIGNATURE STOPS BEING PLACED. `{{signature}}` on its own line falls through to the
     * prose branch, so the token is emailed as thirteen characters — and the preview, which now
     * runs this same function, would show it. This is the failure the checks above exist for. */
    const libs = libVariant('v13', s2 => s2.replace('      if (SIG_LINE_RE.test(line)) {', '      if (false) {'),
      'lib/outreach-doc.ts')
    const r = runLibSuite(libs)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V13 🔴 {{signature}} stops being expanded — the token would be emailed verbatim`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  {
    /* V24 — THE PAIR RULE BREAKS, AND A WRITTEN PAIR GETS TWO NOTES INSTEAD OF ONE. With both halves
     * written, every truck reads one line or the other, so a per-half note would name an audience for
     * each — "12 of 105 see this" above "93 of 105 see this" — which is true of each line and
     * misleading about the pair. This is the regression the "ONE note" check exists to catch, so it is
     * shown catching it. */
    const libs = libVariant('v24', s2 => s2.replace(
      "  return names.filter(c => !c.startsWith('no_') && names.includes(`no_${c}`))", '  return []'),
      'lib/outreach-template-render.ts')
    const r = runLibSuite(libs)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V24 🔴 a written pair gets a note per half instead of one note`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  {
    /* V25 — THE PLAIN WORDING IS DROPPED AND THE MENU FALLS BACK TO THE MARKER. The menu would still
     * list every condition and still read the resolver — and every entry would say "Only if
     * ?next_event:", which is the reference vocabulary this task exists to replace. A check on the
     * LIST without a check on the WORDS would sit green through that. */
    const libs = libVariant('v25', s2 => s2.replace('const CONDITION_PLAIN: Record<string, ConditionWords> = {',
      'const CONDITION_PLAIN: Record<string, ConditionWords> = {} as Record<string, ConditionWords>\nconst UNUSED_PLAIN = {'),
      'lib/outreach-template-render.ts')
    const r = runLibSuite(libs)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V25 🔴 the plain wording is gone — every condition reads "Only if ?next_event:"`)
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
  const a = show('── THE NUMBERS AND THE VOCABULARY ──────────────────────────────────────────────────────', runLibSuite(libs))
  const b = show('── THE TWO VIEWS ───────────────────────────────────────────────────────────────────────', runCensus())

  console.log('\n── A REAL BROWSER — CHROMIUM AND WEBKIT ────────────────────────────────────────────────')
  if (process.env.HG_RENDER !== '1') {
    console.log('  ⚠️ SKIPPED — set HG_RENDER=1. It needs a build and local browser builds, and the sweep')
    console.log('     must not depend on either. The run, with its numbers, is in the report.')
  } else {
    const { measure } = require('./outreach-templates-render.cjs')
    const res = await measure()
    for (const line of res.lines) console.log('  ' + line)
    fails += res.fails
  }

  console.log(`\n${fails === 0 ? `✅ all ${a.ok.length + b.ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
