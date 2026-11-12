// node check-legal.cjs <locale> <file> [--half 1|2]
//   whole file: $S/legal/<locale>/<file> (or the two halves <file>.1.md + <file>.2.md joined) checked with the repo's own compare()
//   --half N (country-specific-terms.md only): checks just that half's headings/bullets/tables/links/numbers against the English half
const fs=require('fs'),path=require('path');const REPO='/Users/dominicbonini/dev/village-foodie';const S=path.resolve(__dirname,'..');
const L=require(REPO+'/scripts/_legal-translations.cjs');
const [loc,file]=process.argv.slice(2);const hi=process.argv.indexOf('--half');const half=hi>0?Number(process.argv[hi+1]):0;
const dir=`${S}/legal/${loc}`;const SPLIT='\n## European Economic Area and Switzerland\n';
const en=L.english(file);
if(half){
  const i=en.indexOf(SPLIT);const enHalf=half===1?en.slice(0,i+1):en.slice(i+1);
  const tr=fs.readFileSync(`${dir}/${file}.${half}.md`,'utf8');
  const A=L.sectionsOf(enHalf),B=L.sectionsOf(half===1?L.body(tr):tr);const P=[];
  if(A.length!==B.length)P.push(`headings: English half has ${A.length-1}, translation ${B.length-1}`);
  for(let j=0;j<Math.min(A.length,B.length);j++){const a=A[j],b=B[j];const w=`under "${a.heading}"`;
    if(a.level!==b.level)P.push(`${w}: level ${a.level} vs ${b.level}`);if(a.bullets!==b.bullets)P.push(`${w}: ${a.bullets} bullets vs ${b.bullets}`);
    if(JSON.stringify(a.tables)!==JSON.stringify(b.tables))P.push(`${w}: tables ${JSON.stringify(a.tables)} vs ${JSON.stringify(b.tables)}`);
    if(JSON.stringify(a.links)!==JSON.stringify(b.links))P.push(`${w}: links ${JSON.stringify(a.links)} vs ${JSON.stringify(b.links)}`)}
  const ne=L.numbersOf(enHalf),nt=L.numbersOf(tr,ne);const bag=m=>[...m].sort().map(([k,v])=>k+'×'+v).join(' ');
  if(bag(ne.bag)!==bag(nt.bag)){const miss=[...ne.bag].filter(([k,v])=>(nt.bag.get(k)||0)<v).map(([k])=>k),extra=[...nt.bag].filter(([k,v])=>(ne.bag.get(k)||0)<v).map(([k])=>k);P.push(`numbers differ — missing: ${miss.join(', ')||'none'}; extra: ${extra.join(', ')||'none'}`)}
  if(/[０-９]/.test(tr))P.push('full-width digits');
  console.log(P.length?`✗ ${loc}/${file} half ${half}: ${P.length} problem(s)\n - `+P.slice(0,40).join('\n - '):`✓ ${loc}/${file} half ${half} matches its English half`);process.exit(P.length?1:0)}
let tr;const whole=`${dir}/${file}`;
if(fs.existsSync(whole))tr=fs.readFileSync(whole,'utf8');else{tr=fs.readFileSync(`${dir}/${file}.1.md`,'utf8').replace(/\n*$/,'\n')+fs.readFileSync(`${dir}/${file}.2.md`,'utf8')}
const probs=L.compare(file,L.stamp(file,tr),{checkStamp:false});
console.log(probs.length?`✗ ${loc}/${file}: ${probs.length} problem(s)\n - `+probs.slice(0,40).join('\n - '):`✓ ${loc}/${file}: structure, numbers, links, addresses and processors match`);process.exit(probs.length?1:0);
