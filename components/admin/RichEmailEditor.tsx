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
// Pinned exactly: @tiptap/core, @tiptap/pm, @tiptap/react, and the four extensions, all 3.31.3.
// Only the extensions named below are loaded — there is no StarterKit, so there is no list, heading,
// link, image, code block, blockquote or horizontal rule to disable and later forget to disable.
import { useEffect, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Mark, mergeAttributes } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import Bold from '@tiptap/extension-bold'
import { P_STYLE, SMALL_STYLE, paragraphsFromLines, type EmailDoc, type DocLine } from '@/lib/outreach-doc'

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

export interface RichEmailEditorProps {
  /** The document to show. Replacing it (a new template) resets the editor. */
  value: EmailDoc
  /** Every change, as the document. The parent holds it; this component holds no draft of its own. */
  onChange: (doc: EmailDoc) => void
  signatureLines: DocLine[]
  optOut: string | null
  disabled?: boolean
}

export default function RichEmailEditor({
  value, onChange, signatureLines, optOut, disabled,
}: RichEmailEditorProps) {
  const extensions = useMemo(() => [
    Document, Paragraph, Text, HardBreak, Bold, Small,
  ], [])

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
        style: `${P_STYLE} min-height: 22rem; outline: none;`,
        class: 'px-2 py-1.5',
        'aria-label': 'Message',
      },
    },
    onUpdate: ({ editor: ed }) => { onChange(ed.getJSON() as unknown as EmailDoc) },
  }, [extensions])

  // 🔴 A NEW TEMPLATE REPLACES THE DOCUMENT; A KEYSTROKE MUST NOT. `onUpdate` sends the document up
  // and the parent sends it straight back down, so calling `setContent` on every `value` change would
  // reset the caret to the start on every character typed. Comparing against what the editor already
  // holds distinguishes the two exactly: an echo of a keystroke is equal and is skipped; a different
  // template is not equal and replaces the document.
  // ⚠️ A REF-FREE COMPARISON ON PURPOSE. A "is this a new document" flag passed from the parent was
  // the first attempt, and it made the parent responsible for a detail only this component can see.
  useEffect(() => {
    if (!editor) return
    if (JSON.stringify(editor.getJSON()) === JSON.stringify(value)) return
    editor.commands.setContent(value as unknown as Record<string, unknown>, { emitUpdate: false })
  }, [editor, value])

  useEffect(() => { editor?.setEditable(!disabled) }, [editor, disabled])

  if (!editor) return <div className="border border-slate-200 rounded-lg h-[22rem]" />

  const tbtn = (active: boolean) =>
    `text-xs font-bold px-2 py-1 rounded border focus:outline-none focus:ring-2 focus:ring-slate-400 ${
      active ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`

  /** Insert stored lines at the cursor, as paragraphs. The same builder the template path uses. */
  const insertLines = (lines: DocLine[]) => {
    if (!lines.length) return
    editor.chain().focus().insertContent(paragraphsFromLines(lines) as unknown as Record<string, unknown>[]).run()
  }

  return (
    <div className="border border-slate-200 rounded-lg bg-white">
      <div className="flex items-center gap-1.5 border-b border-slate-200 px-2 py-1.5 flex-wrap">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
          aria-pressed={editor.isActive('bold')} className={tbtn(editor.isActive('bold'))} title="Bold">
          B
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleMark('small').run()}
          aria-pressed={editor.isActive('small')} className={tbtn(editor.isActive('small'))}
          title="Small — 10pt, the size the opt-out line uses">
          Small
        </button>
        <span className="w-px h-4 bg-slate-200 mx-1" />
        <button type="button" onClick={() => insertLines(signatureLines)}
          disabled={!signatureLines.length}
          title="Insert your signature at the cursor, from the Signature tab"
          className={`${tbtn(false)} disabled:opacity-40`}>
          Insert signature
        </button>
        <button type="button" onClick={() => insertLines(optOut ? [{ text: optOut, small: true }] : [])}
          disabled={!optOut}
          title="Insert the opt-out sentence at the cursor, at 10pt"
          className={`${tbtn(false)} disabled:opacity-40`}>
          Insert opt-out
        </button>
        <span className="ml-auto text-[11px] text-slate-400">
          This is the email. Exactly what is here is sent.
        </span>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
