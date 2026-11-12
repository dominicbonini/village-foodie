// Variant helpers.
//  node variant.cjs dump <chain…>            write $S/var/base/<last>.flat.json — the merged messages of the chain (en-GB first), flat
//  node variant.cjs grep <base> <regex> [ns] print keys of the merged base whose text matches (case-insensitive)
//  node variant.cjs check <locale> <parentChain comma-sep> <file> [back]  check a sparse override (flat or nested) merged over the chain
const fs=require('fs'),path=require('path');const REPO='/Users/dominicbonini/dev/village-foodie';const S=path.resolve(__dirname,'..');
const tc=require(REPO+'/scripts/translation-check.cjs');const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const unflat=o=>{const r={};for(const[k,v]of Object.entries(o)){const p=k.split('.');let c=r;for(const x of p.slice(0,-1))c=c[x]??={};c[p.at(-1)]=v}return r};
const deep=(a,b)=>{const o={...a};for(const[k,v]of Object.entries(b??{}))o[k]=v&&typeof v==='object'&&o[k]&&typeof o[k]==='object'?deep(o[k],v):v;return o};
const load=f=>{const j=read(f);return Object.values(j).some(v=>typeof v==='string')&&Object.keys(j).some(k=>k.includes('.'))?unflat(j):j};
const merged=chain=>chain.reduce((a,l)=>deep(a,read(`${REPO}/messages/${l}.json`)),{});
const [cmd,...a]=process.argv.slice(2);
if(cmd==='dump'){const m=merged(a);fs.writeFileSync(`${S}/var/base/${a.at(-1)}.flat.json`,JSON.stringify(tc.flat(m),null,1));console.log('wrote',`${S}/var/base/${a.at(-1)}.flat.json`)}
else if(cmd==='grep'){const f=read(`${S}/var/base/${a[0]}.flat.json`);const re=new RegExp(a[1],'iu');let n=0;for(const[k,v]of Object.entries(f))if((!a[2]||k.startsWith(a[2]))&&re.test(v)){n++;console.log(k+' = '+v.replace(/\n/g,'\\n'))}console.error(n+' keys')}
else if(cmd==='check'){const [loc,chainS,file,backF]=a;const chain=chainS.split(',').filter(Boolean);const ov=load(file);const en=read(`${REPO}/messages/en-GB.json`);
  const full=deep(merged(chain),ov);const E=tc.flat(en),O=tc.flat(ov);const P=[];
  for(const k of Object.keys(O))if(!(k in E)&&!/^planNames\./.test(k))P.push('not in en-GB: '+k);
  for(const[k,v]of Object.entries(O)){if(typeof v!=='string'||!v.trim()){P.push('empty '+k);continue}if(/'[{}#|']/.test(v))P.push('straight apostrophe: '+k);
    if(!(k in E))continue;let st,se;try{st=tc.skeleton(v);se=tc.skeleton(E[k])}catch(e){P.push(k+': ICU '+e.message);continue}
    if(st.args.join()!==se.args.join())P.push(`${k}: placeholders ${st.args} ≠ ${se.args}`);
    for(const[n,o]of Object.entries(se.selects))if((st.selects[n]??[]).join()!==o.join())P.push(`${k}: select ${n}`);
    for(const[n,p]of Object.entries(se.plurals)){const q=st.plurals[n];if(!q||q.exact.join()!==p.exact.join()||!q.other)P.push(`${k}: plural ${n}`)}
    if(st.tags.join()!==se.tags.join())P.push(`${k}: tags ${st.tags} ≠ ${se.tags}`);
    for(const m of tc.missingPluralCategories(v,loc))P.push(`${k}: plural lacks ${m.cat}`)}
  const same=Object.entries(O).filter(([k,v])=>tc.flat(merged(chain))[k]===v).map(([k])=>k);
  const hatch=Object.entries(tc.flat(full)).filter(([,v])=>/\bhatch\b/i.test(v.replace(/HatchGrab/g,''))).map(([k])=>k);
  let bm=[];if(backF&&fs.existsSync(backF)){const b=read(backF);bm=Object.keys(O).filter(k=>typeof b[k]!=='string')}
  console.log(`${loc}: ${Object.keys(O).length} overrides; STRUCTURAL ${P.length}; identical-to-parent ${same.length}; "hatch" left in merged ${hatch.length}${backF?'; back missing '+bm.length:''}`);
  for(const p of P.slice(0,60))console.log('  ✗ '+p);if(same.length)console.log('  · identical to parent (drop them): '+same.slice(0,30).join(', '));if(hatch.length)console.log('  · hatch: '+hatch.slice(0,20).join(', '));if(bm.length)console.log('  · back missing: '+bm.slice(0,20).join(', '));
  process.exit(P.length||bm.length?1:0)}
