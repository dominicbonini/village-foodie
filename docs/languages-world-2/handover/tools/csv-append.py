# python3 csv-append.py CC [CC…] — append each country's csvRows from seo/<CC>.json to docs/seo-geo-1/keywords.csv (skip rows already there)
import csv,json,sys,io,os
S=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));P='/Users/dominicbonini/dev/village-foodie/docs/seo-geo-1/keywords.csv'
raw=open(P,newline='',encoding='utf-8').read();have={tuple(r) for r in csv.reader(io.StringIO(raw))}
out=io.StringIO();w=csv.writer(out,lineterminator='\n');n=0
for cc in sys.argv[1:]:
  d=json.load(open(f'{S}/seo/{cc}.json',encoding='utf-8'));cc=d['country']
  for r in d['csvRows']:
    r=[str(x) for x in r];assert len(r)==7,(cc,r);r[0]=cc
    if tuple(r) in have: continue
    w.writerow(r);have.add(tuple(r));n+=1
if not raw.endswith('\n'): raw+='\n'
open(P,'w',newline='',encoding='utf-8').write(raw+out.getvalue());print('appended',n,'rows for',' '.join(sys.argv[1:]))
