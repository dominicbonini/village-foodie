// node hy03-split.cjs — reads tr/hy-AM/w03/pairs.*.json (leaves = [translation, back]) and writes 03.json + 03.back.json
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..'); const dir = `${S}/tr/hy-AM`; const w = `${dir}/w03`;
const deep = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') deep(a[k], v); else a[k] = v } return a };
const all = {};
for (const f of fs.readdirSync(w).filter(f => /^pairs\..*\.json$/.test(f)).sort()) deep(all, JSON.parse(fs.readFileSync(`${w}/${f}`, 'utf8')));
const tr = {}, back = {};
(function walk(o, t, p) {
  for (const [k, v] of Object.entries(o)) {
    const kk = p ? p + '.' + k : k;
    if (Array.isArray(v)) { t[k] = v[0]; back[kk] = v[1] }
    else { t[k] = {}; walk(v, t[k], kk) }
  }
})(all, tr, '');
// keep the source key order
const src = JSON.parse(fs.readFileSync(`${S}/tr/parts/03.src.json`, 'utf8'));
const order = (s, t) => { if (!t || typeof s !== 'object') return t; const o = {}; for (const k of Object.keys(s)) if (k in t) o[k] = order(s[k], t[k]); for (const k of Object.keys(t)) if (!(k in o)) o[k] = t[k]; return o };
fs.writeFileSync(`${dir}/03.json`, JSON.stringify(order(src, tr), null, 1));
fs.writeFileSync(`${dir}/03.back.json`, JSON.stringify(back, null, 1));
console.log('wrote', Object.keys(back).length, 'keys');
