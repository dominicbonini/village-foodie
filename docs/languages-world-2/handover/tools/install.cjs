// node install.cjs variant <locale> <parent> [--no-back]   flat $S/var/<locale>.json → messages/<locale>.json (+ back), register
// node install.cjs base <locale>                              register a merged base (messages/<locale>.json already written)
// node install.cjs segment <CC> [<CC> …]                      add COUNTRY_PATH_SEGMENTS entries (ISO code, lower case)
const fs=require('fs'),path=require('path');const REPO='/Users/dominicbonini/dev/village-foodie';const S=path.resolve(__dirname,'..');
const [cmd,...a]=process.argv.slice(2);const LT=`${REPO}/lib/i18n/locales.ts`;
const en=JSON.parse(fs.readFileSync(`${REPO}/messages/en-GB.json`,'utf8'));
const unflat=o=>{const r={};for(const[k,v]of Object.entries(o)){const p=k.split('.');let c=r;for(const x of p.slice(0,-1))c=c[x]??={};c[p.at(-1)]=v}return r};
const order=(e,t)=>{if(typeof t!=='object'||!t)return t;const o={};for(const k of Object.keys(e??{}))if(k in t)o[k]=order(e[k],t[k]);for(const k of Object.keys(t))if(!(k in o))o[k]=order(undefined,t[k]);return o};
function addLocale(loc,parent,base){let s=fs.readFileSync(LT,'utf8');
  if(!new RegExp(`'${loc}'`).test(s.match(/export const LOCALES = \[[^\]]*\]/)[0]))s=s.replace(/(export const LOCALES = \[[^\]]*)\]/,`$1, '${loc}']`);
  if(parent&&parent!=='en-GB'){const m=s.match(/export const LOCALE_PARENT[^{]*\{[^}]*\}/)[0];if(!m.includes(`'${loc}':`))s=s.replace(m,m.replace(/ \}$/,`, '${loc}': '${parent}' }`))}
  if(base){const m=s.match(/export const LANGUAGE_BASES[^=]*= \[[^\]]*\]/)[0];if(!m.includes(`'${loc}'`))s=s.replace(m,m.replace(/\]$/,`, '${loc}']`))}
  fs.writeFileSync(LT,s)}
if(cmd==='variant'){const [loc,parent]=a;const flat=JSON.parse(fs.readFileSync(`${S}/var/${loc}.json`,'utf8'));
  fs.writeFileSync(`${REPO}/messages/${loc}.json`,JSON.stringify(order(en,unflat(flat)),null,2)+'\n');
  if(!a.includes('--no-back')){const b=JSON.parse(fs.readFileSync(`${S}/var/${loc}.back.json`,'utf8'));fs.writeFileSync(`${REPO}/docs/i18n/back/${loc}.json`,JSON.stringify(Object.fromEntries(Object.keys(b).sort().map(k=>[k,b[k]])),null,1)+'\n')}
  addLocale(loc,parent,false);console.log('installed',loc,'over',parent,Object.keys(flat).length,'keys')}
else if(cmd==='base'){addLocale(a[0],null,true);console.log('registered base',a[0])}
else if(cmd==='segment'){const f=`${REPO}/lib/marketing-country.ts`;let s=fs.readFileSync(f,'utf8');const m=s.match(/export const COUNTRY_PATH_SEGMENTS[^{]*\{[\s\S]*?\}\n/)[0];
  const add=a.filter(cc=>!new RegExp(`\\b${cc}: '`).test(m));if(!add.length){console.log('nothing to add');process.exit(0)}
  const line=`,\n  // languages-world-1 (10 November 2026): ${add.join(' ')} — prepared, each at its ISO code. A country with no enabled row 302s to /uk and is in no\n  // router pick, hreflang set, sitemap or menu, so these appear only when the country is switched on.\n  ${add.map(cc=>`${cc}: '${cc.toLowerCase()}'`).join(', ')} }\n`;
  s=s.replace(m,m.replace(/ \}\n$/,line));fs.writeFileSync(f,s);console.log('segments +',add.join(' '))}
