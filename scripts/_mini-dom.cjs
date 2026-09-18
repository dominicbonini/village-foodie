// scripts/_mini-dom.cjs — the smallest DOM that lets react-dom/client mount a REAL component tree in Node,
// keep it mounted across re-renders, run its effects, and let a harness read what it rendered and call the
// handlers it attached. Shared by scripts/add-order-refresh.cjs.
//
// WHY THIS EXISTS: renderToString (the other AddOrderPanel harnesses) runs the body once and never runs
// an effect or keeps state. The stale-list bug of 17–18 September 2026 IS state that a later prop change
// failed to refresh, so proving the fix needs a tree that survives from one render to the next. The repo
// has no jsdom / happy-dom / test renderer and this adds no dependency: it is ~150 lines of plain objects
// implementing exactly the surface react-dom 19 touches — nodes, attributes, a style bag, text, the
// select/option value properties, and an event-listener registry that records but never dispatches.
// Handlers are invoked through the props React stores on each node (`__reactProps$…`), which is the same
// object React itself would call, so no synthetic event system is needed.
const ELEMENT = 1, TEXT = 3, DOCUMENT = 9
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

class Style {
  constructor() { Object.defineProperty(this, '_m', { value: new Map(), enumerable: false }) }
  setProperty(k, v) { this._m.set(k, String(v)) }
  removeProperty(k) { this._m.delete(k) }
  get cssText() { return [...this._m].map(([k, v]) => `${k}:${v}`).join(';') }
  set cssText(v) { this._m.clear() }
}
// style.color = '#94a3b8' style writes land as plain properties; cssText/serialisation reads the bag + own props.
const styleText = st => { const own = Object.keys(st).filter(k => k !== '_m' && st[k] !== '' && st[k] != null).map(k => `${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${st[k]}`); return [st.cssText, ...own].filter(Boolean).join(';') }

class Node {
  constructor(doc, type) { this.ownerDocument = doc; this.nodeType = type; this.parentNode = null; this.childNodes = []; this._listeners = new Map() }
  get firstChild() { return this.childNodes[0] || null }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null }
  get nextSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return p.childNodes[i + 1] || null }
  get previousSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return p.childNodes[i - 1] || null }
  get isConnected() { let n = this; while (n) { if (n.nodeType === DOCUMENT) return true; n = n.parentNode } return false }
  getRootNode() { let n = this; while (n.parentNode) n = n.parentNode; return n }
  contains(o) { for (let n = o; n; n = n.parentNode) if (n === this) return true; return false }
  appendChild(c) { return this.insertBefore(c, null) }
  insertBefore(c, ref) {
    if (c.parentNode) c.parentNode.removeChild(c)
    const i = ref ? this.childNodes.indexOf(ref) : -1
    if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c)
    c.parentNode = this; return c
  }
  removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c }
  replaceChild(n, o) { this.insertBefore(n, o); this.removeChild(o); return o }
  addEventListener(t, fn, opts) { if (!this._listeners.has(t)) this._listeners.set(t, []); this._listeners.get(t).push({ fn, opts }) }
  removeEventListener(t, fn) { const l = this._listeners.get(t); if (l) this._listeners.set(t, l.filter(x => x.fn !== fn)) }
  dispatchEvent() { return true }
  get textContent() { return this.nodeType === TEXT ? this.nodeValue : this.childNodes.map(c => c.textContent).join('') }
  set textContent(v) { this.childNodes.splice(0); if (v !== '' && v != null) this.appendChild(this.ownerDocument.createTextNode(String(v))) }
}
class Text extends Node {
  constructor(doc, v) { super(doc, TEXT); this.nodeValue = String(v); this.nodeName = '#text' }
  get data() { return this.nodeValue } set data(v) { this.nodeValue = String(v) }
  get outerHTML() { return esc(this.nodeValue) }
}
class Element extends Node {
  constructor(doc, tag, ns) {
    super(doc, ELEMENT)
    this.tagName = this.nodeName = ns && ns.includes('svg') ? tag : tag.toUpperCase()
    this.localName = tag.toLowerCase(); this.namespaceURI = ns || 'http://www.w3.org/1999/xhtml'
    this.attributes = new Map(); this.style = new Style()
    if (this.localName === 'select') { this.multiple = false }
    if (this.localName === 'option') { this._selected = false; this.defaultSelected = false }
    if (this.localName === 'input') { this._checked = false; this.defaultChecked = false; this._value = '' }
    if (this.localName === 'textarea') { this._value = '' }
  }
  setAttribute(k, v) { this.attributes.set(k, String(v)) }
  setAttributeNS(ns, k, v) { this.attributes.set(k, String(v)) }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null }
  hasAttribute(k) { return this.attributes.has(k) }
  removeAttribute(k) { this.attributes.delete(k) }
  removeAttributeNS(ns, k) { this.attributes.delete(k) }
  get id() { return this.getAttribute('id') || '' }
  get className() { return this.getAttribute('class') || '' } set className(v) { this.setAttribute('class', v) }
  get type() { return this.getAttribute('type') || (this.localName === 'input' ? 'text' : '') } set type(v) { this.setAttribute('type', v) }
  get name() { return this.getAttribute('name') || '' } set name(v) { this.setAttribute('name', v) }
  get disabled() { return this.hasAttribute('disabled') } set disabled(v) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled') }
  // value/checked/selected are PROPERTIES in a browser; React writes them directly.
  get value() {
    if (this.localName === 'option') return this.hasAttribute('value') ? this.getAttribute('value') : this.textContent
    if (this.localName === 'select') { const o = this.options.find(x => x.selected) || this.options[0]; return o ? o.value : '' }
    return this._value ?? ''
  }
  set value(v) {
    if (this.localName === 'select') { for (const o of this.options) o.selected = o.value === String(v); return }
    this._value = String(v)
  }
  get defaultValue() { return this.getAttribute('value') ?? '' } set defaultValue(v) { this.setAttribute('value', v) }
  get checked() { return !!this._checked } set checked(v) { this._checked = !!v }
  get selected() { return !!this._selected } set selected(v) { this._selected = !!v }
  get options() { return this.childNodes.filter(c => c.nodeType === ELEMENT && c.localName === 'option') }
  get selectedIndex() { return this.options.findIndex(o => o.selected) }
  get children() { return this.childNodes.filter(c => c.nodeType === ELEMENT) }
  get form() { return null }
  querySelectorAll() { return [] }
  querySelector() { return null }
  focus() { this.ownerDocument.activeElement = this }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body }
  get innerHTML() { return this.childNodes.map(c => c.outerHTML).join('') }
  set innerHTML(v) { this.childNodes.splice(0); if (v) this.appendChild(this.ownerDocument.createTextNode(String(v))) }   // raw text; no parser
  get outerHTML() {
    const attrs = [...this.attributes].map(([k, v]) => ` ${k}="${esc(v)}"`).join('')
    const st = styleText(this.style); const styleAttr = st ? ` style="${esc(st)}"` : ''
    const open = `<${this.localName}${attrs}${styleAttr}>`
    return VOID.has(this.localName) ? open : `${open}${this.innerHTML}</${this.localName}>`
  }
  /** Every descendant element with this localName. */
  all(tag) { const out = []; const walk = n => { for (const c of n.childNodes) { if (c.nodeType === ELEMENT) { if (c.localName === tag) out.push(c); walk(c) } } }; walk(this); return out }
  /** The props React attached to this node — the exact handlers it would call. */
  get reactProps() { const k = Object.keys(this).find(k => k.startsWith('__reactProps')); return k ? this[k] : null }
}
class Document extends Node {
  constructor() {
    super(null, DOCUMENT); this.ownerDocument = this; this.nodeName = '#document'
    this.documentElement = this.createElement('html'); this.appendChild(this.documentElement)
    this.head = this.createElement('head'); this.body = this.createElement('body')
    this.documentElement.appendChild(this.head); this.documentElement.appendChild(this.body)
    this.activeElement = this.body
  }
  createElement(tag) { return new Element(this, tag) }
  createElementNS(ns, tag) { return new Element(this, tag, ns) }
  createTextNode(v) { return new Text(this, v) }
  createComment(v) { const t = new Text(this, v); t.nodeType = 8; t.nodeName = '#comment'; return t }
  createEvent() { return { initEvent() {} } }
  get defaultView() { return globalThis.window }
  querySelectorAll() { return [] }
  querySelector() { return null }
  getElementById() { return null }
}

/** Installs window/document/navigator globals. Returns { document, container, teardown }. */
function installMiniDom() {
  const document = new Document()
  const window = globalThis
  window.document = document; window.window = window; window.self = window
  window.navigator = window.navigator || { userAgent: 'node', onLine: true, language: 'en-GB' }
  window.HTMLIFrameElement = class {}; window.HTMLElement = Element; window.Node = Node; window.Element = Element; window.Text = Text
  window.getComputedStyle = () => ({ getPropertyValue: () => '' })
  window.requestAnimationFrame = fn => setTimeout(() => fn(Date.now()), 0)
  window.cancelAnimationFrame = h => clearTimeout(h)
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
  window.scrollTo = () => {}
  window.confirm = () => true; window.alert = () => {}
  if (!window.localStorage) { const m = new Map(); window.localStorage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() } }
  const container = document.createElement('div'); document.body.appendChild(container)
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return { document, container, teardown() { container.parentNode && container.parentNode.removeChild(container) } }
}
module.exports = { installMiniDom, Element, Node, Text, Document }
