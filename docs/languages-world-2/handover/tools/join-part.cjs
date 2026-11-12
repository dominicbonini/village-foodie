// node join-part.cjs <locale> <NN> — joins <NN>.a.json, <NN>.b.json … into <NN>.json and <NN>.back.a.json … into <NN>.back.json
const fs=require('fs'),path=require('path');const S=path.resolve(__dirname,'..');const [loc,id]=process.argv.slice(2);const dir=`${S}/tr/${loc}`;
const deep=(a,b)=>{for(const[k,v]of Object.entries(b)){if(v&&typeof v==='object'&&a[k]&&typeof a[k]==='object')deep(a[k],v);else a[k]=v}return a};
const fs_=fs.readdirSync(dir);const chunks=fs_.filter(f=>new RegExp(`^${id}\\.[a-z]+\\.json$`).test(f)&&!/\.back\./.test(f)).sort();
const backs=fs_.filter(f=>new RegExp(`^${id}\\.back\\.[a-z]+\\.json$`).test(f)).sort();
if(chunks.length){const o={};for(const f of chunks)deep(o,JSON.parse(fs.readFileSync(`${dir}/${f}`,'utf8')));fs.writeFileSync(`${dir}/${id}.json`,JSON.stringify(o,null,1));console.log('joined',chunks.join(' '))}
if(backs.length){const o={};for(const f of backs)Object.assign(o,JSON.parse(fs.readFileSync(`${dir}/${f}`,'utf8')));fs.writeFileSync(`${dir}/${id}.back.json`,JSON.stringify(o,null,1));console.log('joined',backs.join(' '))}
