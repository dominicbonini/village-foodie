// node build-style.cjs <locale> <CC> — STYLE.md = STYLE.base.md + research (address, terms, plan row, SEO strings) + glossary section
const fs=require('fs'),path=require('path');const S=path.resolve(__dirname,'..');const [loc,cc]=process.argv.slice(2);
const base=fs.readFileSync(`${S}/tr/${loc}/STYLE.base.md`,'utf8');const r=JSON.parse(fs.readFileSync(`${S}/seo/${loc}.json`,'utf8'));
const g=fs.existsSync(`${S}/seo/${loc}-glossary.md`)?fs.readFileSync(`${S}/seo/${loc}-glossary.md`,'utf8'):'';
const L=[base.trim(),'','## From the country research (seo/'+loc+'.json) — binding where it does not contradict the rules above','',
`- Address form (research): ${r.addressForm}`,
`- "Pay at Hatch": feature name **${r.terms.payAtHatchFeature}**, short label/button **${r.terms.payAtHatchShort}**.`,
`- Plan names (planNames.<key>.name; "Pro" keeps "Pro" and gets NO name key): payg **${r.terms.payAsYouGo}**, unlimited **${r.terms.unlimited}**, trial **${r.terms.freeTrial}** (capitalise as a name), demo and tester: translate "Demo" / "Tester".`,
'- Core terms (use them; TERMS.md records the rest):',...Object.entries(r.terms).map(([k,v])=>`  - ${k}: ${v}`),
'- Research decisions/notes (for context; do not stop on them):',...(r.decisions||[]).map(d=>'  - '+d),'',
'## SEO strings (parts 08 and 09 ONLY): use these for these keys — they carry the researched search terms. Keep placeholders/tags exactly; you may polish wording but keep the primary keyword first in titles, titles ≤60 chars ({country} ≈ 10), descriptions 120–155.','',
`Primary keyword per page: ${JSON.stringify(r.primaryKeyword)}`,'','```json',JSON.stringify(r.seo,null,1),'```','',
'## Glossary (the locked Use terms — headings, buttons and feature names MUST use the bold Use term)','',g.trim(),''];
fs.writeFileSync(`${S}/tr/${loc}/STYLE.md`,L.join('\n'));console.log('STYLE.md',loc,L.join('\n').length);
