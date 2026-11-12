// node install-base.cjs <locale> <CC> <guardLang|-> — merge parts+fix → messages + back; legal (stamped) → content/legal/<loc>/; guard json; register; segment
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');const REPO='/Users/dominicbonini/dev/village-foodie';const S=path.resolve(__dirname,'..');
const [loc,cc,g]=process.argv.slice(2);const run=(...a)=>console.log(execFileSync('node',a,{cwd:REPO}).toString().trim());
run(`${S}/tools/merge.cjs`,loc,'--write');
const L=require(REPO+'/scripts/_legal-translations.cjs');const ld=`${S}/legal/${loc}`;fs.mkdirSync(`${REPO}/content/legal/${loc}`,{recursive:true});
for(const f of ['privacy-policy.md','terms-and-conditions.md','country-specific-terms.md']){let t=fs.existsSync(`${ld}/${f}`)?fs.readFileSync(`${ld}/${f}`,'utf8'):fs.readFileSync(`${ld}/${f}.1.md`,'utf8').replace(/\n*$/,'\n')+fs.readFileSync(`${ld}/${f}.2.md`,'utf8');
  const out=L.stamp(f,t.replace(/\n*$/,'\n'));const p=L.compare(f,out);if(p.length)throw new Error(loc+'/'+f+': '+p.join('; '));fs.writeFileSync(`${REPO}/content/legal/${loc}/${f}`,out);console.log('legal ✓',loc,f)}
if(g&&g!=='-'){fs.copyFileSync(`${S}/guard/${g}.json`,`${REPO}/lib/allergen-guard/${g}.json`);console.log('guard',g)}
run(`${S}/tools/install.cjs`,'base',loc);run(`${S}/tools/install.cjs`,'segment',cc);
console.log(execFileSync('python3',[`${S}/tools/csv-append.py`,cc]).toString().trim());
