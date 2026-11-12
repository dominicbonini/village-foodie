// node check-part.cjs <locale> <NN>   — checks scratch/tr/<locale>/NN.json (+ NN.back.json) against parts/NN.src.json
// Exit 1 on any STRUCTURAL problem (missing/extra keys, ICU, placeholders, selects, plural cases incl. CLDR categories, tags,
// straight apostrophe next to { } # | '). Prints flags (English left, banned words, brand/number changes, drift) for review.
const fs=require('fs'),path=require('path');const REPO='/Users/dominicbonini/dev/village-foodie';const S=path.resolve(__dirname,'..');
const tc=require(REPO+'/scripts/translation-check.cjs');
const [locale,id]=process.argv.slice(2);const dir=`${S}/tr/${locale}`;
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const src=read(`${S}/tr/parts/${id}.src.json`);
let tr;try{tr=read(`${dir}/${id}.json`)}catch(e){console.log('✗ cannot read '+`${dir}/${id}.json: `+e.message);process.exit(1)}
let back=null;try{back=read(`${dir}/${id}.back.json`)}catch(e){console.log('⚠ no/invalid back file: '+e.message)}
const lang=locale.split('-')[0];
const gl=[`${REPO}/lib/i18n/glossary/${locale}.json`,`${REPO}/lib/i18n/glossary/${lang}.json`].find(f=>fs.existsSync(f));
const cat=(()=>{try{return require(REPO+'/scripts/_plans-catalog-fixture.cjs').seedCatalog(REPO).plans}catch{return null}})();
const r=tc.check({locale,messages:tr,en:src,glossary:gl?read(gl):null,back,planKeys:id==='09'&&cat?cat.filter(p=>p.isPublic&&p.active&&p.name!=='Pro').map(p=>p.key):null,knownPlanKeys:cat?cat.filter(p=>p.active).map(p=>p.key):null,guardLanguages:null,sameWords:null,drops:null});
const APOS=/'[{}#|']/;const apos=Object.entries(tc.flat(tr)).filter(([,v])=>APOS.test(v)).map(([k])=>k);
const empty=Object.entries(tc.flat(tr)).filter(([,v])=>!String(v).trim()).map(([k])=>k);
const nonStr=[];(function w(o,p){for(const[k,v]of Object.entries(o)){const kk=p?p+'.'+k:k;if(v&&typeof v==='object')w(v,kk);else if(typeof v!=='string')nonStr.push(kk)}})(tr,'');
const backMissing=back?Object.keys(tc.flat(src)).filter(k=>typeof back[k]!=='string'):[];
const structural=[...r.S.missing.map(k=>'missing '+k),...r.S.extra.map(k=>'extra '+k),...r.S.icu,...apos.map(k=>"straight apostrophe next to { } # | ' in "+k+' (write ’)'),...empty.map(k=>'empty '+k),...nonStr.map(k=>'not a string '+k)];
console.log(`${locale} part ${id}: ${r.counts.translated} keys / ${Object.keys(tc.flat(src)).length}; STRUCTURAL ${structural.length}; back missing ${backMissing.length}`);
for(const s of structural.slice(0,80))console.log('  ✗ '+s);
const F=r.F;const show=(name,rows,n=25)=>{if(rows.length){console.log(`  · ${name} (${rows.length})`);for(const [k,why,t] of rows.slice(0,n))console.log(`      ${k}: ${why} | ${String(t).slice(0,100)}`)}};
show('English left',F.english);show('banned',F.banned);show('brand/plan name changed',F.invariants);show('numbers/brands',F.numbers);show('glossary',F.glossary,10);show('drift',F.drift,10);show('length',F.length,10);
if(backMissing.length)console.log('  · back-translation missing for: '+backMissing.slice(0,20).join(', '));
process.exit(structural.length||backMissing.length?1:0);
