const tc=require('/Users/dominicbonini/dev/village-foodie/scripts/translation-check.cjs');const f=tc.flat(require(process.argv[2]));
for(const [k,v] of Object.entries(f)){if(/['"]|hatch|[בלמהוכש]\{/i.test(v))console.log(k,v)}
