#!/usr/bin/env node
// scripts/outreach-send-visible.cjs
//
//   node scripts/outreach-send-visible.cjs     (NO NETWORK, NO DATABASE, NO BROWSER, NO EMAIL)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS GUARDS — three reported defects, and the class each belongs to
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//   1. **A BUTTON THAT DOES NOTHING AND SAYS NOTHING.** Pressing Send with the "Blank" template
//      showed no error and sent no email: `askSend` began `if (!body.trim()) return`, and Blank sets
//      `body` to `''`. The file's own note already said that guard must read the DOCUMENT for an
//      email — the fix had been applied to `hasText` and missed here, and in `logNow`.
//      ⛔ THE CLASS IS WORSE THAN THE BUG: a silent `return` in a click handler is indistinguishable
//      from a broken button, so §1 asserts that **no exit from a send path is silent**.
//
//   2. **BOLD TURNING ITSELF ON.** The caret was left inside a bold run — by `insertLines` (the
//      signature's lines carry `bold: true`) and by the content effect's unconditional
//      `setTextSelection(1)` — and `setStoredMarks(null)` cannot fix that, because `null` means "use
//      the marks AT the caret". §2 proves the mechanism in real ProseMirror and asserts the fix.
//
//   3. **THE BUTTON'S LABEL.** Always "Send". Asserted in `scripts/outreach-sequence.cjs`, together
//      with the server's decisions being untouched; §3 here checks the render site, which is the half
//      that harness cannot see.
//
// ⛔ WHAT THIS CANNOT DO, STATED RATHER THAN IMPLIED: it cannot press a button or type a character.
// §2 runs the real ProseMirror algebra, which is where the bold decision is actually made; the
// screens are the numbered list in docs/outreach-send-fixes-report.md, using "Send test to me" only.

const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')

let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')
/** 🔴 Comments stripped before any source-text claim — a note quoting the old line is not the line. */
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const COMPOSE = read('components/admin/ComposeWindow.tsx')
/* ⚠️ THE PAGE TOO, because a prop is dead only when NEITHER side names it. */
const WORKSPACE = read('components/admin/ProspectWorkspace.tsx')
const EDITOR = read('components/admin/RichEmailEditor.tsx')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · NO SEND PATH EXITS SILENTLY
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · every refusal says something — no silent return in a send path')

{
  const code = codeOf(COMPOSE)

  /* ⛔ THE EXACT LINE THAT CAUSED IT. Named, so a revert is caught rather than merely counted. */
  t('⛔ `askSend` no longer guards on `body` — the TEMPLATE RENDER, which "Blank" sets to ""',
    !/const askSend[\s\S]{0,200}if \(!body\.trim\(\)\) return/.test(code))
  t('⛔ …and neither does `logNow`',
    !/if \(logging \|\| !body\.trim\(\)\) return/.test(code))
  t('🔴 both guard on `hasText`, the ONE definition of "is there a message"',
    /const askSend[\s\S]{0,400}if \(!hasText\)/.test(code)
    && /logInFlight\.current = true|if \(!hasText\) \{ setSendError/.test(code))
  /* 🔴 `hasText` READS THE DOCUMENT FOR AN EMAIL. That is the property the whole fix rests on. */
  t('🔴 …and `hasText` reads the DOCUMENT for an email, not the template body',
    /const plainForHumans = useMemo\(\s*\n?\s*\(\) => \(isEmail \? docToText\(doc\) : fullText\)/.test(COMPOSE)
    && /const hasText = plainForHumans\.trim\(\)\.length > 0/.test(code))

  /**
   * ══ 🔴 THE CLASS, NOT JUST THE BUG: NO BARE `return` IN A SEND PATH ════════════════════════════
   * Every exit from `askSend` / `logNow` / `sendNow` must either show a sentence (`setSendError`),
   * open a dialog (`setPending` / `setConfirmSend` / `setGuards`), or be a re-entrancy gate.
   * ⛔ A BARE `return` IS THE DEFECT CLASS. The operator cannot tell it from a dead button, and that
   * is precisely what was reported.
   * ⚠️ THE TWO ALLOWED BARE RETURNS ARE THE IN-FLIGHT GATES (`sendInFlight` / `logInFlight`), which
   * are correct to be silent: the first press is already doing the thing, and a second sentence
   * explaining that would be noise on a double-click.
   */
  const bareReturns = (fnName) => {
    const i = code.indexOf(fnName)
    if (i < 0) return ['<function not found>']
    /* The body, to the next top-level `const … =` at the same indent. */
    const body = code.slice(i, code.indexOf('\n  const ', i + 10))
    const out = []
    for (const m of body.matchAll(/^\s*if \(([^)]*)\) return\s*$/gm)) out.push(m[1].trim())
    return out
  }
  for (const [fn, allowed] of [
    ['const askSend', []],
    ['const logNow', ['logInFlight.current', 'logging']],
    ['const sendNow', ['sendInFlight.current']],
  ]) {
    const found = bareReturns(fn)
    const unexpected = found.filter(c => !allowed.includes(c))
    t(`⛔ ${fn.replace('const ', '')} has no silent exit beyond its in-flight gate (${unexpected.join(' | ') || 'none'})`,
      unexpected.length === 0)
  }

  /* 🔴 AND THE SENTENCE IS ALWAYS ON SCREEN, next to the button — not a toast that disappears. */
  t('🔴 `sendError` renders as a visible line beside the buttons',
    /\{sendError && \(/.test(COMPOSE)
    && /text-red-700 bg-red-50 border border-red-200/.test(COMPOSE))

  /* ── 🔴 A FOLLOW-UP DATE IN THE PAST IS POINTED OUT, AND DOES NOT BLOCK ────────────────────────── */
  t('🔴 a follow-up date in the past produces a sentence before sending',
    /if \(followUpInPast\) \{ setSendError\(FOLLOW_UP_PAST_NOTICE\); return \}/.test(code))
  t('🔴 …and it NAMES THE DATE and both ways out',
    /is in the past — pick a new one or clear it/.test(COMPOSE)
    && /\$\{followUpDate \?\? ''\}/.test(COMPOSE))
  /* ⛔ IT IS A WARNING, NOT A REFUSAL: pressing Send again goes through. Asserted by the sentence
   * saying so AND by the check sitting ABOVE the confirm rather than in the hard-refusal set. */
  t('⛔ …and it does not block — the sentence says Send again sends anyway',
    /Press Send again to send anyway/.test(COMPOSE))
  /* 🔴 `isOverdue` IS THE EXISTING DEFINITION, imported — not a second `<` written here. */
  t('🔴 "in the past" is `isOverdue` from lib/outreach, the same rule the Today list uses',
    /import \{ kindLabel, isOverdue \} from '@\/lib\/outreach'/.test(COMPOSE)
    && /isOverdue\(followUpDate \?\? null\)/.test(code))
  t('⛔ …and the composer writes no second date comparison of its own',
    !/followUpDate\s*<\s*/.test(code) && !/new Date\(followUpDate/.test(code))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · BOLD: THE MECHANISM, IN REAL PROSEMIRROR
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · bold cannot turn itself on — proven against the real mark algebra')

{
  /**
   * 🔴 THIS RUNS PROSEMIRROR, NOT A MODEL OF IT. The bold decision is made by
   * `storedMarks ?? $from.marks()`, and that is a line of ProseMirror — so a harness that reasoned
   * about it in JavaScript would be asserting its own reasoning. The packages are already a
   * dependency (`@tiptap/pm` pulls them in), so this costs nothing.
   * ⚠️ A MINIMAL SCHEMA, not the editor's: the question is about marks at a position, and three nodes
   * plus one mark is the smallest document that can ask it.
   */
  const { Schema } = require('prosemirror-model')
  const { EditorState, TextSelection } = require('prosemirror-state')

  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
      text: { group: 'inline' },
    },
    marks: { bold: { toDOM: () => ['strong', 0] } },
  })
  const bold = schema.marks.bold
  const marksFor = (st) => (st.storedMarks || st.selection.$from.marks()).map(m => m.type.name)

  /* A document shaped like a template whose first line is the signature: bold first, plain after. */
  const boldFirst = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Dominic Bonini', [bold.create()])]),
    schema.node('paragraph', null, [schema.text('Village Foodie')]),
  ])

  /* ── 🔴 THE OLD BEHAVIOUR, REPRODUCED: position 1 + storedMarks(null) ⇒ the next character is BOLD */
  {
    let st = EditorState.create({ schema, doc: boldFirst })
    st = st.apply(st.tr.setSelection(TextSelection.create(st.doc, 1)).setStoredMarks(null))
    t('⛔ REPRODUCED: caret at position 1 with storedMarks=null types BOLD — the reported bug',
      marksFor(st).includes('bold'))
    t('⛔ …and `isActive`-equivalent agrees, so the B button was reporting the truth',
      !!bold.isInSet(st.storedMarks || st.selection.$from.marks()))
  }

  /* ── 🔴 WHY `setStoredMarks([])` ALONE IS NOT THE FIX: the next transaction drops it ───────────── */
  {
    let st = EditorState.create({ schema, doc: boldFirst })
    st = st.apply(st.tr.setSelection(TextSelection.create(st.doc, 1)).setStoredMarks([]))
    t('🔴 `setStoredMarks([])` makes the NEXT character plain', !marksFor(st).includes('bold'))
    const later = st.apply(st.tr.setSelection(TextSelection.create(st.doc, 1)))
    t('⛔ …but ANY later transaction drops stored marks and bold returns — "several presses"',
      later.storedMarks === null && marksFor(later).includes('bold'))
  }

  /* ── ✅ THE FIX: the caret goes to a PLAIN position, so the promise holds past one keystroke ──── */
  {
    /* A trailing empty paragraph is what `insertLines` now adds after a marked insertion. */
    const withEscape = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('Dominic Bonini', [bold.create()])]),
      schema.node('paragraph'),
    ])
    let st = EditorState.create({ schema, doc: withEscape })
    /* The empty block's inner position — what `firstPlainPos` prefers. */
    let emptyAt = null
    st.doc.descendants((n, pos) => { if (n.isTextblock && n.content.size === 0 && emptyAt === null) emptyAt = pos + 1 })
    st = st.apply(st.tr.setSelection(TextSelection.create(st.doc, emptyAt)).setStoredMarks([]))
    t('✅ a caret in an EMPTY paragraph types plain', !marksFor(st).includes('bold'))
    const later = st.apply(st.tr.setSelection(TextSelection.create(st.doc, emptyAt)))
    t('✅ …and STILL types plain after a later transaction — the state fix alone could not do this',
      !marksFor(later).includes('bold'))
  }

  /* ── 🔴 ONE PRESS ON, ONE PRESS OFF, over a SELECTION (the durable case) ──────────────────────── */
  {
    const plain = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello there')])])
    let st = EditorState.create({ schema, doc: plain })
    const sel = () => TextSelection.create(st.doc, 1, 6)
    st = st.apply(st.tr.setSelection(sel()).addMark(1, 6, bold.create()))
    t('🔴 one press of B over a selection turns bold ON', !!bold.isInSet(st.doc.resolve(2).marks()))
    st = st.apply(st.tr.setSelection(sel()).removeMark(1, 6, bold))
    t('🔴 …and one press turns it OFF', !bold.isInSet(st.doc.resolve(2).marks()))
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2b · AND THE SOURCE MATCHES THE PROOF
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2b · the editor does what section 2 proved it must')

{
  const code = codeOf(EDITOR)

  t('⛔ `setStoredMarks(null)` is GONE — it meant "use the marks at the caret", which was the bug',
    !/setStoredMarks\(null\)/.test(code))
  t('🔴 …and both places set `[]` instead', (code.match(/setStoredMarks\(\[\]\)/g) || []).length >= 2)

  t('🔴 the content effect puts the caret at the first PLAIN position, not at 1 unconditionally',
    /setTextSelection\(firstPlainPos\(editor\.state\.doc\)\)/.test(code)
    && !/editor\.commands\.setTextSelection\(1\)/.test(code))
  /* ══ ⛔ RE-AIMED, AND THE OLD ASSERTION DESCRIBED A REGRESSION OF MINE (5 October 2026) ══════════
   * It asserted `return emptyBlock ?? unmarked ?? 1` — "prefer an empty block". Measured against a
   * real template (greeting · blank · body · blank · bold signature) that lands the caret at
   * position **14**, the blank spacer after the greeting, instead of at the top of the email.
   * ✅ IT TAKES THE EARLIEST QUALIFYING POSITION NOW, whichever kind it is. */
  t('🔴 …and `firstPlainPos` takes the EARLIEST plain position, not "an empty block first"',
    /function firstPlainPos/.test(code)
    && /const take = \(pos: number\) => \{ if \(best === null \|\| pos < best\) best = pos \}/.test(code)
    && /return best \?\? 1/.test(code)
    && !/return emptyBlock \?\? unmarked \?\? 1/.test(code))

  /* ══ 🔴 AND THE B BUTTON REPORTS THE CARET'S REAL FORMATTING — measured at every position ════════
   * Dominic, 5 October: "when i click on the message body the 'b' button still turns on and off."
   * 🔴 MEASURED IN REAL PROSEMIRROR, position by position, over a real email shape: B is OFF at every
   * position in plain text, ON at every position in the bold signature, and OFF on the blank line
   * after it. So the button follows the caret correctly — the signature IS bold, and clicking into it
   * reports that. What was broken, and is fixed, was TYPING going bold in a fresh or Blank message.
   * ⛔ THIS IS ASSERTED SO THE TWO CANNOT BE CONFUSED AGAIN: a button that did NOT change when the
   * caret entered bold text would be the real defect — the operator could then no longer tell bold
   * from not-bold before sending, which is this editor's one promise. */
  {
    const { Schema } = require('prosemirror-model')
    const { EditorState, TextSelection } = require('prosemirror-state')
    const sc = new Schema({
      nodes: { doc: { content: 'block+' },
        paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
        text: { group: 'inline' } },
      marks: { bold: { toDOM: () => ['strong', 0] } },
    })
    const BM = sc.marks.bold
    const par = (...k) => sc.node('paragraph', null, k)
    const txt = (v, b) => sc.text(v, b ? [BM.create()] : undefined)
    const d = sc.node('doc', null, [
      par(txt('Hi Stephen,')), par(), par(txt('Just following up.')), par(),
      par(txt('Dominic Bonini', true)), par(),
    ])
    const base = EditorState.create({ schema: sc, doc: d })
    const bAt = (pos) => {
      const st2 = base.apply(base.tr.setSelection(TextSelection.create(base.doc, pos)))
      return !!BM.isInSet(st2.storedMarks || st2.selection.$from.marks())
    }
    const plainRange = [], boldRange = []
    d.descendants((n, pos) => {
      if (!n.isTextblock) return
      const isBold = n.textContent === 'Dominic Bonini'
      for (let q = pos + 1; q <= pos + 1 + n.content.size; q++) (isBold ? boldRange : plainRange).push(bAt(q))
    })
    t('🔴 B is OFF at EVERY caret position in plain text (so clicking the body does not turn it on)',
      plainRange.length > 0 && plainRange.every(v => v === false))
    t('🔴 …and ON at every position in the bold signature — the button tells the truth about the caret',
      boldRange.length > 0 && boldRange.every(v => v === true))
    t('⛔ …and OFF on the blank line AFTER the signature, which is where `insertLines` now leaves it',
      bAt(d.content.size) === false)
  }

  /* ── 🔴 THE SIGNATURE INSERT LEAVES SOMEWHERE PLAIN TO TYPE ──────────────────────────────────── */
  t('🔴 `insertLines` adds a plain paragraph after a MARKED insertion',
    /const lastIsMarked = \(\(\) =>/.test(code)
    && /if \(lastIsMarked\) blocks\.push\(\{ type: 'paragraph' \}\)/.test(code))
  /* ⚠️ ASSERTED AS "THERE IS EXACTLY ONE PUSH AND IT IS GUARDED", not as the absence of an unguarded
   * one. The first version tried to prove a negative about the whitespace AFTER the push and failed
   * against correct code — a regex about layout is not a claim about behaviour. */
  t('⚠️ …and does NOT add one after a plain insertion — exactly one push, and it is guarded',
    (code.match(/blocks\.push\(\{ type: 'paragraph' \}\)/g) || []).length === 1
    && /if \(lastIsMarked\) blocks\.push\(\{ type: 'paragraph' \}\)/.test(code))
  t('⛔ …and clears the stored marks after inserting',
    /insertContent\(blocks\)\.run\(\)[\s\S]{0,200}setStoredMarks\(\[\]\)/.test(code))
  /* ⚠️ THE OPT-OUT LINE IS `small`, SO IT TAKES THE SAME PATH — the brief asks for Small to be
   * checked for the same pattern, and it is the same function. */
  t('⚠️ Small takes the same path — the opt-out line is inserted through `insertLines`',
    /insertLines\(optOut \? \[\{ text: optOut, small: true \}\] : \[\]\)/.test(EDITOR)
    && /!!last\.bold \|\| !!last\.small/.test(code))

  /* 🔴 THE BUTTON'S STATE AND THE TYPING READ THE SAME SOURCE. `useEditorState` subscribes, so the
   * toolbar cannot report a stale caret — the 1 October fix, asserted here so it cannot regress. */
  t('🔴 the toolbar subscribes through `useEditorState` rather than reading during render',
    /const active = useEditorState\(\{/.test(code) && /bold: !!ed\?\.isActive\('bold'\)/.test(code))
  t('⛔ …and every toolbar button keeps the selection on mousedown (Chromium blurs it otherwise)',
    (code.match(/onMouseDown=\{keepSelection\}/g) || []).length >= 6
    && /const keepSelection = \(e: ReactMouseEvent\) => e\.preventDefault\(\)/.test(code))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE LABEL, AT THE RENDER SITE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · the button says "Send", and the suffix is not appended')

{
  const code = codeOf(COMPOSE)
  t('🔴 the render calls `sendButtonLabel` with no suffix concatenated',
    /\{sending \? 'Sending…' : sendButtonLabel\(\{ isReply: !!replyTo, step: stepKind \?\? null \}\)\}/.test(code))
  /* ⛔ THE PROP IS GONE ENTIRELY NOW (5 October 2026), not merely unrendered. It was kept for one
   * build as accepted-but-ignored, which left the page computing a string and passing it nowhere.
   * ⚠️ ASSERTED ACROSS BOTH FILES. "Not rendered in ComposeWindow" would still pass while the page
   * built the suffix and handed it over — the dead expression is the half worth deleting. */
  /* ⚠️ `codeOf`, NOT THE RAW FILE. Both files still EXPLAIN the removal in a comment, and a raw
   * search found the explanation and reported the prop as present — the failure mode this repo has
   * met four times now: prose satisfying an assertion about code. */
  t('⛔ …and `sendLabelSuffix` is gone from ComposeWindow entirely — prop, type and render',
    !/sendLabelSuffix/.test(code))
  t('⛔ …and the page no longer computes or passes it',
    !/sendLabelSuffix/.test(codeOf(WORKSPACE)))
  /* ⛔ AND THE CONSEQUENCE IS STILL VISIBLE — in the title, and in the past-date sentence. */
  t('⛔ the follow-up date is still shown, in the button\'s title',
    /Follow-up set for \$\{followUpDate\}/.test(COMPOSE))
  /* 🔴 "Send test to me" IS UNTOUCHED. */
  t('🔴 "Send test to me" is unchanged', /Send test to me/.test(COMPOSE))
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────────────────────────
console.log('')
if (fail === 0) console.log(`✅ all ${pass} passed`)
else console.log(`🔴 ${fail} CHECK(S) FAILED  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
