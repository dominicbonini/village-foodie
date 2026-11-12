// node insert-provision.cjs <values.json>  values: { "<locale>": { standardCategories:{...12}, demoEventName } }
// Inserts ONLY these keys into messages/<locale>.json's provisionContent (text insert after the opening line; every other byte kept),
// and the flat keys into docs/i18n/back/<locale>.json when values[locale].back is given.
const fs=require('fs');const REPO='/Users/dominicbonini/dev/village-foodie';
const KEYS=['starters','mains','burgers','pizza','wrapsSandwiches','sides','dipsSauces','desserts','drinks','kidsMenu','specials','other'];
const vals=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
for(const [loc,v] of Object.entries(vals)){
  const f=`${REPO}/messages/${loc}.json`;let s=fs.readFileSync(f,'utf8');const before=JSON.parse(s);
  if(before.provisionContent?.standardCategories){console.log('skip (already there)',loc);continue}
  for(const k of KEYS) if(typeof v.standardCategories[k]!=='string'||!v.standardCategories[k].trim()) throw new Error(loc+' missing '+k);
  const m=/\n(  )"provisionContent": \{\n/.exec(s);
  const ins=(ind)=>{const i2=ind+'  ',i3=i2+'  ';return `${i2}"standardCategories": {\n${KEYS.map(k=>`${i3}"${k}": ${JSON.stringify(v.standardCategories[k])}`).join(',\n')}\n${i2}},\n${i2}"demoEventName": ${JSON.stringify(v.demoEventName)},\n`};
  if(m){const at=m.index+m[0].length;s=s.slice(0,at)+ins(m[1])+s.slice(at)}
  else { // no provisionContent: append a new top-level block before the final }
    if(!/\n}\n$/.test(s)) throw new Error(loc+': unexpected file end');
    const body=ins('').replace(/,\n$/,'\n');s=s.replace(/\n}\n$/,`,\n  "provisionContent": {\n${body}  }\n}\n`)}
  const after=JSON.parse(s);
  // prove nothing else changed
  const strip=o=>{const c=JSON.parse(JSON.stringify(o));if(c.provisionContent){delete c.provisionContent.standardCategories;delete c.provisionContent.demoEventName;if(!Object.keys(c.provisionContent).length&&!before.provisionContent)delete c.provisionContent}return JSON.stringify(c)};
  if(strip(after)!==JSON.stringify(before)) throw new Error(loc+': other content changed');
  fs.writeFileSync(f,s);
  if(v.back){const bf=`${REPO}/docs/i18n/back/${loc}.json`;if(fs.existsSync(bf)){let b=fs.readFileSync(bf,'utf8');const bo=JSON.parse(b);
    const add=Object.entries(v.back).filter(([k])=>!(k in bo));if(add.length){if(!/\n}\n?$/.test(b))throw new Error('back end '+loc);const nl=b.endsWith('\n')?'\n':'';b=b.replace(/\n}\n?$/,',\n'+add.map(([k,x])=>` ${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(',\n')+'\n}'+nl);JSON.parse(b);fs.writeFileSync(bf,b)}}}
  console.log('inserted',loc);
}
