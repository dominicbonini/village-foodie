const fs=require('fs');const d=process.argv[2];
const src=JSON.parse(fs.readFileSync(d+'/../parts/04.src.json','utf8'));
let pairs={};for(const p of 'abcd')Object.assign(pairs,JSON.parse(fs.readFileSync(`${d}/04.pairs.${p}.json`,'utf8')));
// fixes
const fix=(k,a,b)=>{if(!pairs[k][0].includes(a))throw new Error('nofix '+k);pairs[k][0]=pairs[k][0].replace(a,b)};
fix('errorsManage.domain_www','주소 {host}에는','{host} 주소에는');
fix('errorsManage.domain_apex','주소 {host}는','{host} 주소는');
for(const k of ['wp_migration_three_pictures','wp_migration_slots','wp_migration_library','wp_migration_fonts']){const K='errorsManage.'+k;pairs[K][0]=pairs[K][0].replace(/먼저 (supabase\/\S+\.sql)을 실행하세요\./,'먼저 다음 파일을 실행하세요: $1');}
fix('tradeArea.region_closed','(아직 지원하지 않는 언어: {language})','(아직 HatchGrab이 지원하지 않는 언어: {language})');
pairs['tradeArea.region_closed'][1]=pairs['tradeArea.region_closed'][1].replace('(language not supported yet: {language})','(language HatchGrab does not support yet: {language})');
fix('errorsManage.charges_rate_decimals','소수점 셋째 자리까지','소수점 이하 3자리까지');
for(const k in pairs)pairs[k][0]=pairs[k][0].replace(/알레르기(?! 유발물질)/g,'알레르기 유발물질');
const out={},back={};const seen=new Set();
(function w(s,o,p){for(const[k,v]of Object.entries(s)){const kk=p?p+'.'+k:k;if(typeof v==='object'){o[k]={};w(v,o[k],kk)}else{const e=pairs[kk];if(!e){console.log('MISSING',kk);continue}seen.add(kk);o[k]=e[0];back[kk]=e[1]}}})(src,out,'');
for(const k of Object.keys(pairs))if(!seen.has(k))console.log('EXTRA',k);
fs.writeFileSync(d+'/04.json',JSON.stringify(out,null,1)+'\n');fs.writeFileSync(d+'/04.back.json',JSON.stringify(back,null,1)+'\n');
console.log('keys',seen.size);
