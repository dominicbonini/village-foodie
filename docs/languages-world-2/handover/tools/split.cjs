// split en-GB into parts: node split.cjs  -> scratch/tr/parts/NN.src.json + parts.json
const fs=require('fs'),path=require('path');const REPO='/Users/dominicbonini/dev/village-foodie';const S=path.resolve(__dirname,'..');
const en=JSON.parse(fs.readFileSync(REPO+'/messages/en-GB.json','utf8'));
const SEO_A=['compare','comparison','comparisonSuits'];
const SEO_B=['landing','landingNav','landingFooter','featuresPage','planTable','pricing','planFeatures','planPrompt','faq','aboutPage','legalChrome','truckPage','contactPage','siteFooter','errorPage','embed','planNames'];
const rest=Object.keys(en).filter(k=>!SEO_A.includes(k)&&!SEO_B.includes(k));
const size=k=>JSON.stringify(en[k]).length;const total=rest.reduce((a,k)=>a+size(k),0);const N=7;const target=total/N;
const parts=[];let cur=[],acc=0;for(const k of rest){cur.push(k);acc+=size(k);if(acc>=target&&parts.length<N-1){parts.push(cur);cur=[];acc=0}}if(cur.length)parts.push(cur);
parts.push(SEO_A,SEO_B);
fs.mkdirSync(S+'/tr/parts',{recursive:true});
const meta=parts.map((ns,i)=>{const id=String(i+1).padStart(2,'0');const o=Object.fromEntries(ns.map(k=>[k,en[k]]));fs.writeFileSync(`${S}/tr/parts/${id}.src.json`,JSON.stringify(o,null,1));return{id,ns,bytes:JSON.stringify(o).length,seo:i>=N}});
fs.writeFileSync(S+'/tr/parts/parts.json',JSON.stringify(meta,null,1));for(const m of meta)console.log(m.id,m.bytes,m.seo?'SEO':'',m.ns.join(','));
