'use client'
// components/admin/RichEmailEditor.tsx — the compose box, showing the email as it will arrive.
//
// 🔴 WHY TipTap/ProseMirror AND NOT `contentEditable` WITH A SANITISER. A bare contentEditable gives
// you whatever the browser and the clipboard decide: a paste from Word arrives as `<span class=…
// style="mso-…">`, a paste from a web page brings links and images, and Safari and Chrome disagree
// about what Enter produces. You then write a sanitiser, which is a BLOCKLIST, for markup that is
// going to be emailed to strangers under Dominic's name. ProseMirror inverts that: the SCHEMA is the
// document, and content that does not fit the schema cannot exist in it — a pasted link is not
// stripped afterwards, it is never representable. The schema here is three nodes and two marks, which
// is also exactly what `lib/outreach-doc.ts#validateDoc` accepts on the server.
//
// ⚠️ THE SERVER STILL VALIDATES. This editor is a convenience, not the guard: the document arrives
// over HTTP and the route re-checks it against the same schema. Nothing here is trusted.
//
// ── 🔴 WHAT IS LOADED, AND WHAT IS STILL DELIBERATELY ABSENT (rewritten 1 October 2026) ────────────
// Pinned exactly at 3.31.3, matching every other @tiptap pin: @tiptap/core, @tiptap/pm, @tiptap/react,
// and these extensions —
//     Document · Paragraph · Text · HardBreak · Bold · Italic
//     BulletList · OrderedList · ListItem · ListKeymap   (from @tiptap/extension-list)
//     Small · Large · Link                              (LOCAL marks, defined in this file)
//
// 🔴 LISTS AND ITALIC ARE NOW DELIBERATELY *IN* (1 October 2026, operator decision). The note that stood
// here said the opposite — "there is no list … to disable and later forget to disable" — and that was a
// real guarantee, so it is replaced rather than quietly edited: the toolbar now offers bulleted and
// numbered lists and italic, so the schema has to carry them. ⚠️ AND THE GUARANTEE'S SHAPE SURVIVES:
// there is STILL no StarterKit. Everything not named above is absent — no heading, image, code block,
// blockquote, horizontal rule, table, mention, task list, text-align, colour or highlight. Adding one is
// a deliberate act in this list, not a side effect of a bundle.
// 🔴 `@tiptap/extension-list` IS THE MAINTAINED v3 FORM — one package exporting BulletList, OrderedList,
// ListItem and ListKeymap (and TaskList/TaskItem/ListKit, which are NOT imported). The v2-era
// per-node packages are not what v3 ships.
// 🔴 AND THE SERVER STILL DOES NOT TRUST ANY OF IT. `validateDoc` in lib/outreach-doc.ts re-checks every
// node and mark on arrival, so the editor's configuration is a convenience and the schema is the guard.
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import { Extension, Mark, mergeAttributes } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import Bold from '@tiptap/extension-bold'
// 🔴 THE OFFICIAL ITALIC, NOT A LOCAL MARK, AND THE REASON IS `parseHTML`. A local `em`-only mark would
// be ~12 lines, but pasted italic arrives as `<i>`, `<em>` OR `font-style: italic` depending on where it
// came from, and the package already handles all three plus the Cmd+I keymap. Small and Large stay local
// because their px values are OURS — they mirror the captured Outlook mail — and no package knows them.
import Italic from '@tiptap/extension-italic'
import { BulletList, OrderedList, ListItem, ListKeymap } from '@tiptap/extension-list'
import {
  P_STYLE, SMALL_STYLE, LARGE_STYLE, paragraphsFromLines, LINK_RE,
  type EmailDoc, type DocLine,
} from '@/lib/outreach-doc'

/**
 * The Small mark — 10pt, the size the captured opt-out line uses.
 * 🔴 IT IS A MARK, NOT A NODE TYPE, so it can apply to a whole paragraph or to three words inside one,
 * and `docToHtml` decides which shape of HTML that becomes (a 10pt div, or a span inside a 12pt div).
 * `parseHTML` lets a paste of already-10pt text keep its size instead of silently growing to 12pt.
 */
const Small = Mark.create({
  name: 'small',
  parseHTML() {
    return [
      { tag: 'small' },
      {
        style: 'font-size',
        getAttrs: (value: string) => {
          const px = /([\d.]+)px/.exec(value)
          if (px) return Number(px[1]) < 15 ? {} : false
          const pt = /([\d.]+)pt/.exec(value)
          if (pt) return Number(pt[1]) < 11.5 ? {} : false
          return false
        },
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { style: `font-size: ${SMALL_STYLE.match(/font-size: ([^;]+)/)?.[1] ?? '13.333333px'}` }), 0]
  },
})

/**
 * The Large mark — 14pt, the Size menu's third value.
 *
 * 🔴 A MARK, LIKE `Small`, AND FOR THE SAME REASON: a size applies to a run of words as readily as to a
 * whole line, and `docToHtml` decides which shape of HTML that becomes. 🔴 AND MUTUALLY EXCLUSIVE WITH
 * `Small` — they are two values of ONE property. `validateDoc` refuses a text node carrying both, and
 * the Size menu's commands below always clear the other before setting one, so the refusal is a
 * backstop rather than a behaviour anyone meets.
 * ⚠️ `parseHTML` DELIBERATELY DOES NOT CLAIM EVERY LARGE PASTE. It takes a font-size at or above the
 * threshold; anything smaller stays unmarked and inherits the 12pt body, which is the honest default for
 * text pasted from somewhere with its own type scale.
 */
const Large = Mark.create({
  name: 'large',
  parseHTML() {
    return [
      {
        style: 'font-size',
        getAttrs: (value: string) => {
          // ⚠️ THE SAME TWO UNITS `Small` HANDLES, and the same posture: `false` means "not this mark".
          const px = /([\d.]+)px/.exec(value)
          if (px) return Number(px[1]) >= 17 ? {} : false
          const pt = /([\d.]+)pt/.exec(value)
          if (pt) return Number(pt[1]) >= 13 ? {} : false
          return false
        },
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { style: `font-size: ${LARGE_STYLE.match(/font-size: ([^;]+)/)?.[1] ?? '18.666667px'}` }), 0]
  },
})

/**
 * 🔴 TAB DOES NOT NEST A LIST — AND THE EDITOR NOW CANNOT BUILD WHAT THE SEND REFUSES.
 *
 * `validateDoc` refuses a list nested inside a list item, because an inline-styled nested list is one of
 * the least reliable things in Outlook. But `ListKeymap` binds Tab/Shift-Tab to `sinkListItem`/
 * `liftListItem`, so the EDITOR happily built the one shape the SEND would reject — the operator wrote an
 * email, pressed Send, and was told to go back and unindent. 🔴 THE FIX IS TO MAKE IT IMPOSSIBLE RATHER
 * THAN TO EXPLAIN IT AFTERWARDS (operator decision, 1 October 2026). The refusal stays as a backstop, for
 * a document that arrives over HTTP from something other than this editor.
 *
 * ⚠️ IT RETURNS `true`, WHICH MEANS "HANDLED", AND THAT IS THE WHOLE POINT. Returning `false` would let
 * `ListKeymap` nest, and letting the event through to the browser would move focus out of the editor to
 * the next control — losing the caret mid-sentence, which is worse than nesting. Handled-and-do-nothing
 * is the only behaviour that is neither.
 * ⚠️ OUTSIDE A LIST IT RETURNS `false` ON PURPOSE, so Tab keeps moving focus out of the editor the way it
 * always has and the way a keyboard user expects.
 * 🔴 `priority` ABOVE THE DEFAULT (100) SO IT RUNS BEFORE `ListKeymap`. TipTap composes keymaps in
 * priority order; at the default priority the two would race on array order, which is not a contract.
 */
const NoListIndent = Extension.create({
  name: 'noListIndent',
  priority: 1000,
  addKeyboardShortcuts() {
    const swallowInsideList = () => this.editor.isActive('listItem')
    return { Tab: swallowInsideList, 'Shift-Tab': swallowInsideList }
  },
})

/**
 * The link mark — the only mark that carries a value.
 *
 * 🔴 IT IS DEFINED HERE RATHER THAN INSTALLED. `@tiptap/extension-link` brings autolinking, click
 * handling and a paste rule; what this editor needs is a mark that survives a round trip through
 * `EmailDoc` and renders `<a href>`. The href is validated by `validateDoc` on the way out (https
 * only), so this side is deliberately the dumb half.
 * ⚠️ `inclusive: false` — typing after a link does not extend it, which is what makes "insert the
 * demo link and carry on typing" behave the way a person expects.
 */
const Link = Mark.create({
  name: 'link',
  inclusive: false,
  addAttributes() {
    return { href: { default: null } }
  },
  parseHTML() { return [{ tag: 'a[href]' }] },
  renderHTML({ HTMLAttributes }) { return ['a', mergeAttributes(HTMLAttributes), 0] },
})

/** What a caller can ask the editor to do. Kept to the one thing anybody needs to. */
export interface EditorApi {
  /**
   * Put a clickable link at the caret, or at the end of the text when the editor has never been
   * focused. Returns false only when there is no editor yet.
   */
  insertLink: (url: string, text?: string) => boolean
}

export interface RichEmailEditorProps {
  /** The document to show. Replacing it (a new template) resets the editor. */
  value: EmailDoc
  /** Every change, as the document. The parent holds it; this component holds no draft of its own. */
  onChange: (doc: EmailDoc) => void
  signatureLines: DocLine[]
  optOut: string | null
  disabled?: boolean
  /**
   * 🔴 THE ONLY CEILING, AND IT IS THE WINDOW'S. Passed as a CSS length ('75vh') so the editor
   * grows with its content and starts scrolling only when it would otherwise push the Send buttons
   * off the screen. Absent ⇒ no ceiling at all, which is what the expanded writing view wants.
   */
  maxHeight?: string
  /**
   * 🔴 A FIXED HEIGHT IN CSS PIXELS, WITH THE EDITOR'S OWN SCROLLBAR — and a drag grip at its
   * bottom right. Present ⇒ the box is exactly this tall whatever is in it. Absent ⇒ the old
   * behaviour (grow with the content, `maxHeight` as the only ceiling), which the full-window
   * writing view still wants.
   */
  height?: number
  /** Fired once, when the grip is released and the height actually changed. */
  onHeightChange?: (px: number) => void
  /** Opens the focused full-window writing view. Absent ⇒ no ⤢ button (it is already expanded). */
  onExpand?: () => void
  expanded?: boolean
  /**
   * 🔴 THE ATTACH CONTROLS, ON THE TOOLBAR — after a divider, before ⤢. They used to be rendered
   * BELOW the editor with `-mt-8`, which pulled them back up INSIDE the box, over the last lines of
   * the email and over the resize grip. A control that overlaps the text it belongs to is not
   * placed, it is parked.
   */
  toolbarExtra?: React.ReactNode
  /** The attachment chips, directly under the toolbar, inside the same box. */
  underToolbar?: React.ReactNode
  /**
   * 🔴 THE IMPERATIVE HANDLE, FOR "Insert in email". The Demo card is three components away from
   * this editor and the thing it wants is an edit at the caret — which is state this component owns
   * and nothing else can compute. A ref is the honest shape for that; the alternative was passing a
   * "pending insert" down and clearing it afterwards, which is a second source of truth for the
   * document.
   */
  apiRef?: React.MutableRefObject<EditorApi | null>
}

export default function RichEmailEditor({
  value, onChange, signatureLines, optOut, disabled, maxHeight, height, onHeightChange, onExpand, expanded,
  toolbarExtra, underToolbar, apiRef,
}: RichEmailEditorProps) {
  /* ⚠️ ORDER IS NOT SIGNIFICANT HERE, but the grouping is kept readable: the document shape, then the
   * marks, then the list nodes and their keymap. `ListKeymap` is what gives Tab / Shift-Tab and the
   * Enter-on-an-empty-item behaviour; without it the list nodes exist and cannot be navigated. */
  const extensions = useMemo(() => [
    Document, Paragraph, Text, HardBreak,
    Bold, Italic, Small, Large, Link,
    BulletList, OrderedList, ListItem, ListKeymap,
    // 🔴 AFTER ListKeymap in the array and ABOVE it in priority — see the note on the extension.
    NoListIndent,
  ], [])
  /** 🔴 A SHORT PROMPT, NOT AN INSTRUCTION MANUAL. Rendered as an overlay rather than as content,
   *  so it can never be mistaken for text and can never be sent. */
  const showPlaceholder = !docHasText(value)
  const boxRef = useRef<HTMLDivElement | null>(null)
  /** 🔴 THE EXACT JSON THIS EDITOR LAST SENT UP — the whole of the revert fix. See the effect below. */
  const lastEmitted = useRef<string | null>(null)
  /** The Size menu's open state. One menu, so one boolean. */
  const [sizeOpen, setSizeOpen] = useState(false)
  const dragFrom = useRef<number | null>(null)
  /* ⚠️ THE DRAGGED HEIGHT IS THE BROWSER'S, AND THE PARENT'S IS THE TRUTH. After a drag the
   * element carries an inline `height` the browser wrote; when the parent then sends a different
   * height back — clamped, or restored from storage — that inline value would win silently. Clearing
   * it hands control back to the style prop. */
  useEffect(() => {
    const el = boxRef.current
    if (el && height != null) el.style.height = ''
  }, [height])

  const editor = useEditor({
    extensions,
    content: value,
    editable: !disabled,
    // 🔴 SSR OFF. Next renders this page on the server; ProseMirror needs a DOM, and rendering it
    // immediately produces a hydration mismatch on every load.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        // Styled to look like the sent email, so "what I see is what arrives" is literally true.
        // 🔴 THE SAME STYLE THE EMAIL USES, from the same constant, so "what I see is what arrives"
        // is literally true rather than approximately true.
        // 🔴 A MINIMUM, NOT A HEIGHT, AND NO MAXIMUM AT ALL. It was `min-height: 22rem` with the
        // surrounding box fixed, so a long email scrolled inside a 352px window while the page
        // below it sat empty — you could not see the email you were sending. The box now grows
        // with the text; the CAP lives on the wrapper (`maxHeight` below), so only an email past
        // three quarters of the window height ever scrolls inside.
        // ⚠️ ~6 LINES AT 12pt IS THE FLOOR — 8.5rem. It was 22rem (about sixteen lines), which on a
        // 1440x800 screen is most of the space below the header: an EMPTY box was pushing the
        // history Dominic needs to read off the bottom of the page. Six lines still reads as
        // "somewhere to write" and leaves the conversation on screen.
        style: `${P_STYLE} min-height: 8.5rem; outline: none;`,
        class: 'px-2 py-1.5',
        'aria-label': 'Message',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON()
      // 🔴 REMEMBER WHAT WE SENT UP. See `lastEmitted`'s declaration — this is half of the fix for the
      // formatting-reverts bug, and it has to be recorded here, at the moment of emission.
      lastEmitted.current = JSON.stringify(json)
      onChange(json as unknown as EmailDoc)
    },
  }, [extensions])

  /* ── 🔴 THE FORMATTING-REVERTS BUG, AND WHY THE OLD GUARD COULD NOT HOLD (1 October 2026) ─────────
   * REPORTED: bold a word, and a moment later it un-bolds itself.
   *
   * What stood here compared the editor's own JSON against the incoming `value`:
   *     if (JSON.stringify(editor.getJSON()) === JSON.stringify(value)) return
   *     editor.commands.setContent(value, { emitUpdate: false })
   * The intent was right — "an echo of a keystroke is equal and is skipped; a different template is not
   * equal and replaces the document" — and the test is not equal to the intent. 🔴 IT ASKS "DOES THE
   * PARENT'S COPY MATCH MINE?" WHEN THE QUESTION IS "DID THIS COME FROM ME?", and those differ whenever
   * the document makes a round trip that is semantically identical and textually not: a different key
   * order, a normalisation, an empty `marks: []`, a re-derived `templateDoc` with the same words. Any of
   * those makes the strings differ, `setContent` runs, and **the user's own mark is overwritten by an
   * older copy of their document**. That is the revert, and it fires on a re-render the user did not
   * cause — which is why it looks spontaneous and arrives "a moment later".
   *
   * 🔴 THE FIX IS TO ANSWER THE REAL QUESTION. `lastEmitted` records the exact JSON this editor last
   * sent up. If the incoming `value` is that string, it is our own echo, however the parent held it —
   * skip, unconditionally. Only a document that is neither our last emission nor what we already hold
   * replaces the content, which is exactly "a template change or an explicit reset".
   * ⚠️ IT IS A REF, NOT STATE: writing it must not re-render, and it must be readable synchronously
   * inside an effect that runs in the same commit as the change that set it.
   * ⚠️ AND IT IS UPDATED WHEN WE APPLY, TOO. After `setContent` the editor holds `value`, so recording
   * it here stops the NEXT render — with the same `value` and a normalised document — from applying it
   * a second time and moving the caret.
   */
  useEffect(() => {
    if (!editor) return
    const incoming = JSON.stringify(value)
    if (incoming === lastEmitted.current) return                      // our own echo
    if (incoming === JSON.stringify(editor.getJSON())) return         // already identical
    editor.commands.setContent(value as unknown as Record<string, unknown>, { emitUpdate: false })
    lastEmitted.current = incoming
    /* ── 🔴 AND THE CARET LANDS AT THE START, WITH NO STORED MARKS (the bold-greeting bug) ──────────
     * REPORTED: choosing a template shows the greeting in bold, B is already active before anything is
     * typed, and new typing is bold.
     * 🔴 THE DOCUMENT IS NOT AT FAULT — proved: `docFromTemplateText` emits a plain greeting, with
     * `bold` only on the signature line that stores `bold: true`. So the bold is in EDITOR STATE, and
     * the two things that put it there are where `setContent` leaves the selection and what ProseMirror
     * keeps in `storedMarks`. A template ends with the signature, whose last line is bold; a selection
     * resting there makes B active and makes the next character bold, with nothing typed.
     * ⚠️ `setTextSelection(1)`, NOT `focus()`. Position 1 is inside the first paragraph; focusing here
     * would steal the caret from whatever the operator was doing — a template can be chosen while the
     * subject field has focus, and this must not pull it away.
     * ⚠️ `setStoredMarks(null)` IS THE PART THAT ACTUALLY FIXES "new typing is bold". Moving the caret
     * does not clear marks ProseMirror has already stored for the next input; this does. */
    editor.commands.setTextSelection(1)
    editor.view.dispatch(editor.state.tr.setStoredMarks(null))
  }, [editor, value])

  /* ── 🔴 THE TOOLBAR'S ACTIVE STATES, AND THE BUG THEY WERE (1 October 2026) ──────────────────────
   * REPORTED: "the B button is already active before anything is typed".
   * 🔴 PROVEN CAUSE: `useEditor`'s `shouldRerenderOnTransaction` **defaults to `false`** in TipTap v3
   * (`@tiptap/react/dist/index.d.ts:18-23`, and the implementation returns no subscription when it is
   * false or undefined). The toolbar read `editor.isActive('bold')` DURING RENDER, so those values were
   * whatever they had been at the last render React happened to do — never updated by moving the caret.
   * 🧪 Caught in a real browser: after leaving a list the document was correct (the caret sat in a
   * `<p>`) while the "• List" button still reported `aria-pressed="true"`.
   * 🔴 `useEditorState`, NOT `shouldRerenderOnTransaction: true`. That flag works and its own docs call
   * it "legacy behavior that will be removed in future versions", and it re-renders the whole editor on
   * every transaction — every keystroke — to keep six booleans fresh. This selector re-renders only when
   * one of the booleans actually changes, which is the maintained v3 answer and the cheaper one.
   * ⚠️ IT RETURNS NULL BEFORE THE EDITOR EXISTS, hence the fallbacks; the toolbar is not rendered then.
   */
  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: !!ed?.isActive('bold'),
      italic: !!ed?.isActive('italic'),
      small: !!ed?.isActive('small'),
      large: !!ed?.isActive('large'),
      bulletList: !!ed?.isActive('bulletList'),
      orderedList: !!ed?.isActive('orderedList'),
      link: !!ed?.isActive('link'),
    }),
  }) ?? { bold: false, italic: false, small: false, large: false, bulletList: false, orderedList: false, link: false }

  useEffect(() => { editor?.setEditable(!disabled) }, [editor, disabled])

  /* 🔴 THE HANDLE IS PUBLISHED IN AN EFFECT, NOT DURING RENDER, and it is torn down with the
   * component so a stale editor can never be written into. ⚠️ `focus()` FIRST: without a selection
   * ProseMirror has nowhere to put the text, which is the difference between "inserted at the
   * cursor" and "did nothing at all". */
  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      insertLink: (url: string, text?: string) => {
        if (!editor) return false
        const label = text ?? url
        const chain = editor.chain().focus()
        // ⚠️ AT THE END WHEN NOTHING IS SELECTED AND THE EDITOR HAS NEVER BEEN FOCUSED. `focus()`
        // restores the last selection if there was one; `'end'` is only the fallback.
        if (editor.state.selection.empty && !editor.isFocused) chain.focus('end')
        chain.insertContent([{ type: 'text', text: label, marks: [{ type: 'link', attrs: { href: url } }] }]).run()
        return true
      },
    }
    return () => { if (apiRef) apiRef.current = null }
  }, [editor, apiRef])

  if (!editor) return <div className="border border-slate-200 rounded-lg" style={{ minHeight: '8.5rem' }} />

  /* ── 🔴 A TOOLBAR BUTTON MUST NOT TAKE THE SELECTION WITH IT ──────────────────────────────────────
   * Found while verifying the bold fix in a real browser (1 October 2026): in **Chromium**, selecting a
   * word and clicking **B** did nothing at all — no mark, and the button's own `aria-pressed` stayed
   * false. In WebKit the same click worked. The cause is the browser default: `mousedown` on a `<button>`
   * blurs the contenteditable and collapses the DOM selection, so by the time the click handler runs
   * `chain().focus()` has nothing to apply the mark to. Safari keeps the selection across that blur;
   * Chrome does not.
   * 🔴 SO EVERY BUTTON THAT ACTS ON THE SELECTION PREVENTS THE DEFAULT ON MOUSEDOWN, which keeps focus
   * in the editor and leaves the selection intact. ⚠️ `onMouseDown`, NOT `onClick` — the damage is done
   * by the time a click fires. ⚠️ AND IT IS NOT `tabIndex={-1}`: the buttons must stay reachable by
   * keyboard, and preventing the default does not affect a keyboard activation.
   * ⚠️ THIS PREDATES THE TOOLBAR WORK — B and Small had the same flaw, so "clicking B does nothing" was
   * already true in Chrome before today. It is reported as part of this task because this is where it
   * was found. */
  const keepSelection = (e: ReactMouseEvent) => e.preventDefault()

  const tbtn = (active: boolean) =>
    `text-xs font-bold px-2 py-1 rounded border focus:outline-none focus:ring-2 focus:ring-slate-400 ${
      active ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`

  /**
   * Ask for a URL and wrap the selection in it; an empty answer removes the link.
   *
   * 🔴 THE CHECK IS `LINK_RE`, IMPORTED FROM THE SCHEMA — not a copy. The editor refuses exactly what
   * `validateDoc` would refuse on the way out, so a link that goes in is a link that can be sent. The
   * alternative — a looser check here — means the operator finds out at send time, having written the
   * email. ⚠️ A SECOND REGEX HERE WOULD BE A SECOND ANSWER to "what is a safe href", and the whole point
   * of that constant is that there is one.
   * ⚠️ `window.prompt`, DELIBERATELY. A modal with its own focus trap is the better control and it is
   * also the thing that would need measuring at two widths in two engines; the brief asks for a URL to
   * be ASKED FOR, and this asks. Worth revisiting; recorded rather than dressed up.
   * ⚠️ IT PREFILLS THE EXISTING HREF when the cursor is already in a link, so "fix the typo in this URL"
   * does not mean retyping it.
   */
  const promptLink = () => {
    const current = (editor.getAttributes('link').href as string | undefined) ?? ''
    const answer = window.prompt('Link to (http://…, https://… or mailto:…) — leave empty to remove', current)
    if (answer === null) return                       // cancelled: change nothing
    const url = answer.trim()
    if (url === '') { editor.chain().focus().unsetMark('link').run(); return }
    if (!LINK_RE.test(url)) {
      window.alert(`“${url}” is not a link this can send.\n\nIt must start with http://, https:// or mailto:.`)
      return
    }
    // ⚠️ NOTHING SELECTED ⇒ INSERT THE URL AS ITS OWN LINKED WORDS, rather than setting a mark on an
    // empty selection, which ProseMirror would store for the next character and surprise the operator.
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent([{ type: 'text', text: url.replace(/^mailto:/i, ''), marks: [{ type: 'link', attrs: { href: url } }] }]).run()
      return
    }
    editor.chain().focus().setMark('link', { href: url }).run()
  }

  /** Insert stored lines at the cursor, as paragraphs. The same builder the template path uses. */
  const insertLines = (lines: DocLine[]) => {
    if (!lines.length) return
    editor.chain().focus().insertContent(paragraphsFromLines(lines) as unknown as Record<string, unknown>[]).run()
  }

  return (
    <div className="border border-slate-200 rounded-lg bg-white">
      <div className="flex items-center gap-1.5 border-b border-slate-200 px-2 py-1.5 flex-wrap">
        <button type="button" onMouseDown={keepSelection} onClick={() => editor.chain().focus().toggleBold().run()}
          aria-pressed={active.bold} className={tbtn(active.bold)} title="Bold (⌘B)">
          B
        </button>
        {/* 🔴 ITALIC, FROM THE OFFICIAL EXTENSION, so Cmd+I comes with it rather than being bound here. */}
        <button type="button" onMouseDown={keepSelection} onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-pressed={active.italic} className={`${tbtn(active.italic)} italic`}
          title="Italic (⌘I)">
          I
        </button>
        {/* ── 🔴 THE SIZE MENU REPLACES THE "Small" BUTTON ────────────────────────────────────────
            Three sizes and no more: Normal (10pt→ no mark at all), Small (10pt) and Large (14pt).
            🔴 NORMAL IS THE ABSENCE OF A MARK, not a third mark meaning "12pt". A document where
            ordinary text carries an explicit size would put a redundant span on every line of every
            email, and `P_STYLE` already says 12pt once, on the line.
            ⚠️ SETTING ONE SIZE CLEARS THE OTHER, in the same chain. They are two values of one
            property; `validateDoc` refuses a node carrying both, and this is why nobody meets that
            refusal. ⚠️ THE LABEL SHOWS THE CURRENT SIZE, so the menu answers "what size is this?"
            without being opened. */}
        <div className="relative">
          <button type="button" onMouseDown={keepSelection} onClick={() => setSizeOpen(o => !o)} aria-expanded={sizeOpen}
            className={tbtn(active.small || active.large)}
            title="Text size">
            {active.small ? 'Small' : active.large ? 'Large' : 'Normal'} ▾
          </button>
          {sizeOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setSizeOpen(false)} role="presentation" />
              <div className="absolute z-30 left-0 mt-1 w-32 rounded-lg border border-slate-300 bg-white shadow-lg p-1">
                {([
                  ['Normal', () => editor.chain().focus().unsetMark('small').unsetMark('large').run(), !active.small && !active.large],
                  ['Small', () => editor.chain().focus().unsetMark('large').setMark('small').run(), active.small],
                  ['Large', () => editor.chain().focus().unsetMark('small').setMark('large').run(), active.large],
                ] as const).map(([label, run, active]) => (
                  <button key={label} type="button" onMouseDown={keepSelection} onClick={() => { run(); setSizeOpen(false) }}
                    className={`w-full text-left px-2 py-1 rounded text-xs ${active ? 'bg-slate-100 font-bold text-slate-900' : 'text-slate-700 hover:bg-slate-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <span className="w-px h-4 bg-slate-200 mx-1" />
        {/* ── 🔴 LISTS. `ListKeymap` CARRIES THE BEHAVIOUR, NOT THESE BUTTONS ──────────────────────
            Enter makes the next item and Enter on an empty item leaves the list; the buttons only
            toggle. 🔴 TAB AND SHIFT-TAB DO NOTHING INSIDE A LIST (1 October 2026) — `NoListIndent`
            swallows them, because a nested list cannot be emailed reliably and the editor must not be
            able to build what the send refuses. `validateDoc` keeps refusing one as a backstop for a
            document that did not come from here. */}
        <button type="button" onMouseDown={keepSelection} onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-pressed={active.bulletList} className={tbtn(active.bulletList)}
          title="Bulleted list">
          • List
        </button>
        <button type="button" onMouseDown={keepSelection} onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-pressed={active.orderedList} className={tbtn(active.orderedList)}
          title="Numbered list">
          1. List
        </button>
        {/* ── 🔴 LINK — WRAPS THE SELECTION, AND THE URL IS CHECKED HERE AND AGAIN ON THE SERVER ───
            `LINK_RE` is imported from the schema module, so the editor refuses exactly what the send
            would refuse: http, https and mailto, and nothing else. A second regex here would be a
            second answer to "what is a safe href".
            ⚠️ IT ASKS, AND AN EMPTY ANSWER REMOVES THE LINK — which is the only way to unlink, so it is
            the same control rather than a second button nobody finds. */}
        <button type="button" onMouseDown={keepSelection} onClick={() => promptLink()}
          aria-pressed={active.link} className={tbtn(active.link)}
          title="Link the selected words (http, https or mailto)">
          Link
        </button>
        <span className="w-px h-4 bg-slate-200 mx-1" />
        <button type="button" onMouseDown={keepSelection} onClick={() => insertLines(signatureLines)}
          disabled={!signatureLines.length}
          title="Insert your signature at the cursor, from the Signature tab"
          className={`${tbtn(false)} disabled:opacity-40`}>
          Insert signature
        </button>
        <button type="button" onMouseDown={keepSelection} onClick={() => insertLines(optOut ? [{ text: optOut, small: true }] : [])}
          disabled={!optOut}
          title="Insert the opt-out sentence at the cursor, at 10pt"
          className={`${tbtn(false)} disabled:opacity-40`}>
          Insert opt-out
        </button>
        {toolbarExtra && (
          <>
            <span className="w-px h-4 bg-slate-200 mx-1" />
            {toolbarExtra}
          </>
        )}
        {/* ⚠️ THE SENTENCE IS THE FIRST THING TO GO when the row is full: it is a reminder, and the
            controls beside it are the work. */}
        <span className="ml-auto text-[11px] text-slate-400 max-xl:hidden">
          This is the email. Exactly what is here is sent.
        </span>
        {onExpand && (
          // 🔴 A WRITING VIEW, NOT A PREVIEW. It opens the same editor and the same Send buttons at
          // full window width with the conversation beside it — for the email that is long enough
          // that a column is the wrong shape to write it in. Escape returns.
          <button type="button" onClick={onExpand} title="Write full screen (Esc returns)"
            className={`${tbtn(false)} ml-1`} aria-label="Expand the editor">⤢</button>
        )}
      </div>
      {/* 🔴 THE CHIPS SIT UNDER THE TOOLBAR, INSIDE THE BOX — between the controls that made them
          and the text they belong to, and above the scroller so they never move with the email. */}
      {underToolbar && (
        <div className="border-b border-slate-200 px-2 py-1">{underToolbar}</div>
      )}
      {/* ⚠️ THE SCROLLER IS THE WRAPPER, NOT THE EDITOR. ProseMirror needs its own box to grow into;
          capping the editor itself would clip the caret out of view at the bottom of a long email.
          🔴 `resize: vertical` NEEDS `overflow` TO BE SOMETHING OTHER THAN `visible` — that is the
          CSS rule, in every engine — which is why the grip and the scrollbar arrive together and
          why this is the element that carries both.
          ⚠️ THE DRAG IS READ ON `pointerup`, NOT FROM A ResizeObserver. The observer fires while
          the window is resized and on first layout too, so it would write a height nobody chose;
          the grip's drag takes implicit pointer capture, so the release lands on this element. */}
      <div ref={boxRef} className="relative"
        /* ⚠️ A FIXED BOX IS TALLER THAN ITS TEXT, and the empty part of it is not the editor: the
           ProseMirror element stops after the last line. Clicking the white space below it would
           otherwise do nothing at all, which reads as a dead box. */
        onMouseDown={e => {
          if (height == null || !editor) return
          const pm = boxRef.current?.querySelector('.ProseMirror')
          if (pm && !pm.contains(e.target as Node)) { e.preventDefault(); editor.commands.focus('end') }
        }}
        onPointerDown={e => { dragFrom.current = e.currentTarget.offsetHeight }}
        onPointerUp={e => {
          const from = dragFrom.current
          dragFrom.current = null
          const now = e.currentTarget.offsetHeight
          if (from != null && now !== from) onHeightChange?.(now)
        }}
        style={height != null
          ? { height, overflowY: 'auto', resize: 'vertical' }
          : (maxHeight && !expanded ? { maxHeight, overflowY: 'auto' } : undefined)}>
        {showPlaceholder && (
          <span aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1.5 text-slate-400"
            style={{ fontFamily: 'Aptos, Arial, Helvetica, sans-serif', fontSize: '12pt' }}>
            Write here, or pick a template
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

/** Is there a character in this document? ⚠️ Cheap and shallow — it only decides a placeholder. */
function docHasText(doc: EmailDoc): boolean {
  const walk = (n: unknown): boolean => {
    const node = n as { text?: unknown; content?: unknown[] } | null
    if (!node || typeof node !== 'object') return false
    if (typeof node.text === 'string' && node.text.trim()) return true
    return Array.isArray(node.content) && node.content.some(walk)
  }
  return walk(doc)
}
