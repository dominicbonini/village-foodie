// node apply-strings.cjs <values.json> — values: { "<locale>": { "set": { "<flat key>": "text" }, "remove": ["<flat key>"], "back": { "<flat key>": "english" } } }
// Applies ONLY those keys to messages/<locale>.json (+ docs/i18n/back/<locale>.json), keeping every other byte (ja-JP's \u200b escapes too);
// proves nothing else changed.
const fs=require('fs');const REPO='/Users/dominicbonini/dev/village-foodie';
const vals=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const setp=(o,k,v)=>{const p=k.split('.');let c=o;for(const x of p.slice(0,-1)){if(typeof c[x]!=='object')throw new Error('no parent '+k);c=c[x]}c[p.at(-1)]=v};
const delp=(o,k)=>{const p=k.split('.');let c=o;for(const x of p.slice(0,-1))c=c?.[x];if(c&&p.at(-1) in c)delete c[p.at(-1)]};
const flat=(o,p='',out={})=>{for(const[k,v]of Object.entries(o)){const kk=p?p+'.'+k:k;if(v&&typeof v==='object')flat(v,kk,out);else out[kk]=v}return out};
for(const [loc,v] of Object.entries(vals)){
  const f=`${REPO}/messages/${loc}.json`;const src=fs.readFileSync(f,'utf8');const j=JSON.parse(src);const esc=/\\u200b/.test(src);
  if((JSON.stringify(j,null,2)+'\n').replace(/\u200b/g,esc?'\\u200b':'\u200b')!==src)throw new Error(loc+': file does not round-trip');
  const before=flat(j);for(const[k,x]of Object.entries(v.set||{}))setp(j,k,x);for(const k of v.remove||[])delp(j,k);
  const after=flat(j);const touched=new Set([...Object.keys(v.set||{}),...(v.remove||[])]);
  for(const k of new Set([...Object.keys(before),...Object.keys(after)]))if(!touched.has(k)&&before[k]!==after[k])throw new Error(loc+': changed '+k);
  fs.writeFileSync(f,(JSON.stringify(j,null,2)+'\n').replace(/\u200b/g,esc?'\\u200b':'\u200b'));
  const bf=`${REPO}/docs/i18n/back/${loc}.json`;
  if(fs.existsSync(bf)&&(v.back||v.remove)){const b=JSON.parse(fs.readFileSync(bf,'utf8'));for(const[k,x]of Object.entries(v.back||{}))b[k]=x;for(const k of v.remove||[])delete b[k];
    fs.writeFileSync(bf,JSON.stringify(Object.fromEntries(Object.keys(b).sort().map(k=>[k,b[k]])),null,1)+'\n')}
  console.log('applied',loc,Object.keys(v.set||{}).length,'set',(v.remove||[]).length,'removed')
}
