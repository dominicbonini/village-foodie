// node prep-consistency.cjs <locale> — writes tr/<locale>/merged.flat.json and en.flat.json from the 9 parts
const fs=require('fs'),path=require('path');const REPO='/Users/dominicbonini/dev/village-foodie';const S=path.resolve(__dirname,'..');const tc=require(REPO+'/scripts/translation-check.cjs');
const loc=process.argv[2];const dir=`${S}/tr/${loc}`;const parts=require(`${S}/tr/parts/parts.json`);const all={};
for(const p of parts)Object.assign(all,tc.flat(JSON.parse(fs.readFileSync(`${dir}/${p.id}.json`,'utf8'))));
fs.writeFileSync(`${dir}/merged.flat.json`,JSON.stringify(all,null,1));fs.writeFileSync(`${dir}/en.flat.json`,JSON.stringify(tc.flat(JSON.parse(fs.readFileSync(REPO+'/messages/en-GB.json','utf8'))),null,1));console.log(loc,Object.keys(all).length,'keys')
