const fs=require('fs');const [W,src,out]=process.argv.slice(2);
const pairs={};for(const f of ['a','b','c'])Object.assign(pairs,JSON.parse(fs.readFileSync(`${W}/${f}.pairs.json`,'utf8')));
const S=JSON.parse(fs.readFileSync(src,'utf8'));const back={};const miss=[];
function walk(s,p,path){const o={};for(const k of Object.keys(s)){const kp=path?path+'.'+k:k;const v=p?p[k]:undefined;
 if(s[k]&&typeof s[k]==='object'){o[k]=walk(s[k],v||{},kp)}else if(Array.isArray(v)){o[k]=v[0];back[kp]=v[1]}else miss.push(kp)}
 if(p)for(const k of Object.keys(p))if(!(k in s))miss.push('EXTRA '+(path?path+'.':'')+k);return o}
const tr=walk(S,pairs,'');if(miss.length)console.log('MISSING',miss);
fs.writeFileSync(`${out}/05.json`,JSON.stringify(tr,null,1));fs.writeFileSync(`${out}/05.back.json`,JSON.stringify(back,null,1));console.log('ok',Object.keys(back).length);
