// node merge.cjs <locale> [--write]  — merges tr/<locale>/NN.json (all parts in parts.json) into messages/<locale>.json in en-GB key order,
// and NN.back.json into docs/i18n/back/<locale>.json (flat, sorted). Without --write: dry run (reports missing parts/keys).
const fs=require('fs'),path=require('path');const REPO='/Users/dominicbonini/dev/village-foodie';const S=path.resolve(__dirname,'..');
const [loc]=process.argv.slice(2);const W=process.argv.includes('--write');const dir=`${S}/tr/${loc}`;
const parts=JSON.parse(fs.readFileSync(`${S}/tr/parts/parts.json`,'utf8'));const en=JSON.parse(fs.readFileSync(`${REPO}/messages/en-GB.json`,'utf8'));
const all={},back={};const miss=[];
for(const p of parts){const f=`${dir}/${p.id}.json`;if(!fs.existsSync(f)){miss.push(p.id);continue}Object.assign(all,JSON.parse(fs.readFileSync(f,'utf8')));const b=`${dir}/${p.id}.back.json`;if(fs.existsSync(b))Object.assign(back,JSON.parse(fs.readFileSync(b,'utf8')))}
if(fs.existsSync(`${dir}/fix.json`)){const fx=JSON.parse(fs.readFileSync(`${dir}/fix.json`,'utf8'));const setp=(o,k,v)=>{const ps=k.split('.');let c=o;for(const x of ps.slice(0,-1))c=c[x]??=({});c[ps.at(-1)]=v};for(const[k,v]of Object.entries(fx.messages??{}))setp(all,k,v);Object.assign(back,fx.back??{})}
// order like en-GB (planNames' extra keys after)
const order=(e,t)=>{if(typeof t!=='object'||!t)return t;const o={};for(const k of Object.keys(e??{}))if(k in t)o[k]=order(e[k],t[k]);for(const k of Object.keys(t))if(!(k in o))o[k]=order(undefined,t[k]);return o};
const out=order(en,all);
if(miss.length)console.log('missing parts:',miss.join(' '));
const sorted=Object.fromEntries(Object.keys(back).sort().map(k=>[k,back[k]]));
if(W&&!miss.length){fs.writeFileSync(`${REPO}/messages/${loc}.json`,JSON.stringify(out,null,2)+'\n');fs.writeFileSync(`${REPO}/docs/i18n/back/${loc}.json`,JSON.stringify(sorted,null,1)+'\n');console.log('written messages/'+loc+'.json and docs/i18n/back/'+loc+'.json')}
else console.log('dry run:',Object.keys(out).length,'namespaces,',Object.keys(sorted).length,'back keys')
