// scripts/us-layout-audit/B-ops/measure.cjs — the in-browser measurement for group B-ops. `measure` is passed to
// page.evaluate as a function, so it may only use browser globals.
function measure() {
  const TIME = /\b\d{1,2}:\d{2}(?:\s?[AP]M)?\b|\b\d{1,2}(?:am|pm)\b/
  const DATE = /\b(Today|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b|\b(September|Sep)\b/
  const MONEY = /[£$]\s?[\d,]+\.\d{2}/
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
  const norm = s => s.replace(/\s+/g, ' ').trim()
  const txt = el => norm(el.innerText || el.textContent || '').slice(0, 90)
  const ownText = el => norm([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' '))
  // A key that survives GB → US: the region (card # / an id'd ancestor), the tag + classes, and the text with
  // times, money and digits blanked.
  const region = el => {
    const card = el.closest('div.rounded-2xl.overflow-hidden.flex-col')
    if (card) { const sp = [...card.querySelectorAll('span')].find(x => /^#[A-Z]?\d+$/.test((x.textContent || '').trim())); if (sp) return 'card' + sp.textContent.trim() }
    const idd = el.closest('[id]'); return idd ? '#' + idd.id : 'page'
  }
  const blank = s => s.replace(/\b\d{1,2}:\d{2}(?:\s?[AP]M)?/g, 'T').replace(/[£$]\s?[\d,]+\.\d{2}/g, 'M').replace(/\d+/g, 'D')
    .replace(/\b(September|Sep)\b/g, 'MON').replace(/\b(Wednesday|Wed)\b/g, 'WD').replace(/(st|nd|rd|th)\b/g, '').replace(/[ ,]+/g, ' ')
  const cls = el => (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(c => /^(text-|font-|w-|min-w|max-w|truncate|flex|grid|px-|py-|ml-|rounded)/.test(c)).slice(0, 6).join('.')
  const keyOf = el => `${region(el)}|${el.tagName.toLowerCase()}.${cls(el)}|${blank(txt(el)).slice(0, 50)}`
  const lineCount = el => {
    const rg = document.createRange(); rg.selectNodeContents(el)
    const tops = []
    for (const r of rg.getClientRects()) { if (r.width < 1) continue; if (!tops.some(t => Math.abs(t - r.top) < 4 || (r.top > t - 4 && r.top < t + 4))) tops.push(r.top) }
    // collapse rects of different inline boxes on the same line (baseline offsets): tops within half a line
    const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3
    tops.sort((a, b) => a - b); const lines = []; for (const t of tops) if (!lines.length || t - lines[lines.length - 1] > lh * 0.6) lines.push(t)
    return lines.length
  }
  // Natural (max-content) width against the laid-out box, to the sub-pixel: WebKit draws an ellipsis when the
  // text is a fraction of a pixel too wide, which scrollWidth (an integer) does not see.
  const natural = el => {
    const st = el.style; const keep = [st.width, st.flex, st.maxWidth, st.minWidth]
    const box = el.getBoundingClientRect().width
    st.width = 'max-content'; st.flex = 'none'; st.maxWidth = 'none'; st.minWidth = '0'
    const nat = el.getBoundingClientRect().width;
    [st.width, st.flex, st.maxWidth, st.minWidth] = keep
    return { box, nat, over: Math.round((nat - box) * 100) / 100 }
  }
  const out = { vw: innerWidth, vh: innerHeight, docOverflowX: document.documentElement.scrollWidth - innerWidth, flags: [], timeEls: [], cards: [], selects: [], regions: {} }
  const all = [...document.body.querySelectorAll('*')].filter(vis)
  for (const el of all) {
    const cs = getComputedStyle(el)
    let over = el.scrollWidth - el.clientWidth
    if (cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible' && el.clientWidth > 0) { const n = natural(el); over = n.over > 0.05 ? Math.max(over, Math.ceil(n.over), 2) : 0 }
    if (over > 1 && el.clientWidth > 0 && !['HTML', 'BODY', 'SELECT', 'svg'].includes(el.tagName)) {
      const mode = cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible' ? 'truncate' : (cs.overflowX === 'hidden' || cs.overflowX === 'clip') ? 'clipped'
        : (cs.overflowX === 'auto' || cs.overflowX === 'scroll') ? 'scroller' : 'spill'
      // leaf-ish: skip a visible-overflow ancestor whose overflow is only a flagged descendant's
      out.flags.push({ key: keyOf(el), mode, over, text: txt(el), w: el.clientWidth, sw: el.scrollWidth, depth: (() => { let d = 0, p = el; while ((p = p.parentElement)) d++; return d })() })
    }
    const own = ownText(el)
    if (own && (TIME.test(own) || DATE.test(own))) {
      const r = el.getBoundingClientRect(); const p = el.parentElement.getBoundingClientRect()
      const clipAnc = (() => { let a = el.parentElement; while (a && a !== document.body) { const c = getComputedStyle(a); if (c.overflowX === 'hidden' || c.overflowX === 'clip') return a; a = a.parentElement } return null })()
      const ca = clipAnc && clipAnc.getBoundingClientRect()
      // Siblings it collides with (the next element sibling's box overlapping this one's text).
      let overlap = 0; const nx = el.nextElementSibling
      if (nx && vis(nx)) { const nr = nx.getBoundingClientRect(); if (nr.top < r.bottom && nr.bottom > r.top) overlap = Math.max(0, Math.round(Math.min(r.right, el.getBoundingClientRect().left + el.scrollWidth) - nr.left)) }
      out.timeEls.push({ key: keyOf(el), text: own.slice(0, 80), full: txt(el), lines: lineCount(el), w: Math.round(r.width), h: Math.round(r.height), sw: el.scrollWidth, cw: el.clientWidth,
        x: Math.round(r.left), y: Math.round(r.top), rightOfParent: Math.round(r.right - p.right), clippedBy: ca ? Math.max(0, Math.round(r.right - ca.right)) : 0, overlapNext: overlap,
        ellipsis: cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible' && natural(el).over > 0.05 })
    }
  }
  // Order cards / tickets
  for (const c of document.querySelectorAll('div.rounded-2xl.overflow-hidden.flex-col')) {
    if (!vis(c)) continue
    const m = /^#([A-Z]?\d+)$/.exec(([...c.querySelectorAll('span')].find(x => /^#[A-Z]?\d+$/.test((x.textContent || '').trim())) || {}).textContent?.trim() || ''); if (!m) continue
    const r = c.getBoundingClientRect()
    const hdr = [...c.children].find(k => /\bp[xy]-/.test(k.className) && /#\d/.test(k.textContent || ''))
    const rows = hdr ? [...hdr.children].map(k => ({ h: Math.round(k.getBoundingClientRect().height), text: txt(k).slice(0, 60), sw: k.scrollWidth, cw: k.clientWidth })) : []
    const numEl = [...c.querySelectorAll('span')].find(x => /^#[A-Z]?\d+$/.test((x.textContent || '').trim())); const ne = natural(numEl)
    const name = [...c.querySelectorAll('span.truncate')].find(x => x !== numEl); const nn = name && natural(name)
    out.cards.push({ id: m[1], x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), hdrH: hdr ? Math.round(hdr.getBoundingClientRect().height) : null, rows,
      clipped: c.scrollWidth - c.clientWidth, rect: (el => { if (!el) return null; const q = el.getBoundingClientRect(); return { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height) } }),
      numRect: null, nameRect: null, chargeRect: null, num: { shown: Math.round(ne.box), needs: Math.round(ne.nat), over: ne.over }, name: name ? { text: name.textContent, shown: Math.round(nn.box), needs: Math.round(nn.nat), over: nn.over } : null })
  }
  for (const k of out.cards) delete k.rect
  {
    const R = el => { if (!el) return null; const q = el.getBoundingClientRect(); return { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height) } }
    const roots = [...document.querySelectorAll('div.rounded-2xl.overflow-hidden.flex-col')].filter(vis)
    for (const k of out.cards) {
      const c = roots.find(r => { const n = [...r.querySelectorAll('span')].find(x => /^#[A-Z]?\d+$/.test((x.textContent || '').trim())); return n && n.textContent.trim() === '#' + k.id })
      if (!c) continue
      const numEl = [...c.querySelectorAll('span')].find(x => /^#[A-Z]?\d+$/.test((x.textContent || '').trim()))
      k.numRect = R(numEl); k.nameRect = R([...c.querySelectorAll('span.truncate')].find(x => x !== numEl)); k.chargeRect = R(c.querySelector('[data-charge-lines]'))
      const hdr = [...c.children].find(x => /\bp[xy]-/.test(x.className) && /#\d/.test(x.textContent || '')); k.row1Rect = hdr ? R(hdr.children[0]) : null
    }
  }
  // <select>s: the content box against the widest option label, in the select's own font.
  const cv = document.createElement('canvas').getContext('2d')
  for (const s of document.querySelectorAll('select')) {
    if (!vis(s)) continue
    const cs = getComputedStyle(s); cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const content = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const opts = [...s.options].map(o => ({ text: o.text, w: Math.round(cv.measureText(o.text).width) }))
    const sel = s.options[s.selectedIndex]
    out.selects.push({ key: keyOf(s), content: Math.round(content), selected: sel ? { text: sel.text, w: Math.round(cv.measureText(sel.text).width) } : null,
      widest: opts.reduce((a, b) => (b.w > (a?.w ?? 0) ? b : a), null), n: opts.length, font: cv.font, opts: opts.slice(0, 6) })
  }
  const reg = (name, el) => { if (!el || !vis(el)) return; const r = el.getBoundingClientRect(); out.regions[name] = { h: Math.round(r.height), w: Math.round(r.width), text: txt(el), lines: [...el.querySelectorAll('span.block, span.truncate')].map(s => ({ text: txt(s), lines: lineCount(s), over: s.scrollWidth - s.clientWidth })) } }
  reg('dashEventBar', document.getElementById('dashboard-event-bar'))
  return out
}
module.exports = { measure }
