#!/usr/bin/env python3
# france-privacy-1: apply one locale's translation of the two English changes, from the START text (so it can be re-run).
# usage: python3 apply.py <locale> [<locale> ...]
#   reads  fp1/new/<locale>.json  {"A","B","C","D","G","back":{"A","B","C","D","G"},"notes"}
#   writes content/legal/<locale>/privacy-policy.md and country-specific-terms.md (re-stamped), and
#          docs/france-privacy-1/back/<locale>.json (the back-translations and notes), then runs the drift checker.
import json, re, sys, subprocess, hashlib, os
REPO = '/Users/dominicbonini/dev/village-foodie'
FP1 = os.path.dirname(os.path.abspath(__file__))
START = 'ec16f022'
OLD = json.load(open(f'{FP1}/old.json'))
G2_RETRANSLATED = {'ja-JP', 'ko-KR', 'zh-HK', 'zh-TW', 'id-ID', 'pl-PL', 'sl-SI', 'ar-AE'}

def git_show(p): return subprocess.run(['git', 'show', f'{START}:{p}'], cwd=REPO, capture_output=True, text=True, check=True).stdout
def sha(p): return hashlib.sha256(open(f'{REPO}/{p}', 'rb').read()).hexdigest()
def paras(t): return [p for p in t.split('\n\n') if p.strip()]
SENT_END = re.compile(r'(?<=[.!?。．！？।።؟។։])\s*')
def last_sentence(p):
    parts = [x for x in SENT_END.split(p.strip()) if x.strip()]
    return parts[-1] if parts else p

def apply(loc):
    errs = []
    n = json.load(open(f'{FP1}/new/{loc}.json'))
    o = OLD[loc]
    for k in 'ABCDG':
        if not isinstance(n.get(k), str) or not n[k].strip(): errs.append(f'{k}: missing')
        if not isinstance(n.get('back', {}).get(k), str) or not n['back'][k].strip(): errs.append(f'back.{k}: missing')
    if errs: return errs
    for k in 'ABCDG': n[k] = n[k].strip('\n')
    pp = git_show(f'content/legal/{loc}/privacy-policy.md')
    cs = git_show(f'content/legal/{loc}/country-specific-terms.md')
    stamp_re = re.compile(r'^<!-- translation-of: [\w.-]+ sha256:[0-9a-f]{64} -->\n')
    pp, cs = stamp_re.sub('', pp), stamp_re.sub('', cs)
    def rep(s, old, new, what):
        c = s.count(old)
        if c != 1: errs.append(f'{what}: the old text occurs {c} times'); return s
        return s.replace(old, new)
    # A, B, C, D
    if '\n\n' in n['A'] or '\n\n' in n['B'] or '\n\n' in n['C']: errs.append('A/B/C must each be ONE paragraph')
    pp = rep(pp, o['A_old'], n['A'], 'A')
    pp = rep(pp, o['B_before'], n['B'] + '\n\n' + o['B_before'], 'B')
    pp = rep(pp, o['C_old'], n['C'], 'C')
    pp = rep(pp, o['D_old'], n['D'], 'D')
    # C: one sentence changed — the text before and after it unchanged
    a, b = o['C_old'], n['C']
    pre = 0
    while pre < min(len(a), len(b)) and a[pre] == b[pre]: pre += 1
    suf = 0
    while suf < min(len(a), len(b)) - pre and a[-1 - suf] == b[-1 - suf]: suf += 1
    if pre < len(a) * 0.3: errs.append(f'C: only the first {pre} characters are unchanged — every sentence but the transfers one must be byte-identical')
    if suf < 10: errs.append(f'C: the closing sentence changed ({suf} characters unchanged at the end)')
    # D: the heading and the 7 bullets byte-identical; "Deleting your account" keeps its old text and adds one sentence
    do, dn = paras(o['D_old']), paras(n['D'])
    if dn[0] != do[0]: errs.append('D: the heading must stay exactly as it was')
    bo = [l for l in o['D_old'].split('\n') if l.startswith('- ')]
    bn = [l for l in n['D'].split('\n') if l.startswith('- ')]
    if bo != bn: errs.append('D: the 7 bullets must stay byte-identical')
    if len(dn) != 9: errs.append(f'D: expected 9 blocks (heading, intro, bullets, names, request, deleting, marketing, breach, complaints), got {len(dn)}')
    elif not dn[5].startswith(do[-2].rstrip()): errs.append('D: the "Deleting your account" paragraph must start with its old text, byte for byte')
    for x in ['privacy@hatchgrab.com', 'ico.org.uk', '0303 123 1113', "Information Commissioner's Office"]:
        if x not in n['D']: errs.append(f'D: "{x}" must appear exactly as in the English')
    # G: three paragraphs; the unchanged sentences kept
    go, gn = paras(o['G_old']), paras(n['G'])
    if len(gn) != 3: errs.append(f'G: expected 3 paragraphs, got {len(gn)}')
    elif loc != 'th-TH':
        for i in (0, 1):
            ls = last_sentence(go[i])
            if i == 1 and loc in G2_RETRANSLATED: continue   # the old sentence named the Privacy Policy ("both"/"those documents"): retranslated to the new English
            if not gn[i].rstrip().endswith(ls.rstrip()): errs.append(f'G: paragraph {i+1} must end with its old last sentence, byte for byte: {ls!r}')
    if gn and '](/terms)' not in gn[0]: errs.append('G: paragraph 1 must link [..](/terms)')
    if len(gn) == 3 and '](/privacy)' not in gn[2]: errs.append('G: paragraph 3 must link [..](/privacy)')
    if len(gn) == 3 and '](/privacy)' in gn[0] + gn[1]: errs.append('G: only paragraph 3 links the Privacy Policy')
    cs = rep(cs, o['G_old'], n['G'], 'G')
    # F: delete the second ### part (the privacy part) of every ## country section
    secs = re.split(r'\n(?=## )', cs)
    out = [secs[0]]
    for s in secs[1:]:
        hs = [m.start() for m in re.finditer(r'^### ', s, re.M)]
        if len(hs) != 2: errs.append('F: a country section without exactly two ### parts'); out.append(s); continue
        if s[hs[1]:].split('\n', 1)[0] not in o['privacy_h3']: errs.append('F: unexpected privacy heading')
        out.append(s[:hs[1]].rstrip('\n') + '\n')
    cs = '\n'.join(out).rstrip('\n') + '\n'
    if errs: return errs
    pp = f'<!-- translation-of: privacy-policy.md sha256:{sha("content/legal/privacy-policy.md")} -->\n' + pp
    cs = f'<!-- translation-of: country-specific-terms.md sha256:{sha("content/legal/country-specific-terms.md")} -->\n' + cs
    open(f'{REPO}/content/legal/{loc}/privacy-policy.md', 'w').write(pp)
    open(f'{REPO}/content/legal/{loc}/country-specific-terms.md', 'w').write(cs)
    os.makedirs(f'{REPO}/docs/france-privacy-1/back', exist_ok=True)
    json.dump({'locale': loc, 'text': {k: n[k] for k in 'ABCDG'}, 'back': n['back'], 'notes': n.get('notes', '')}, open(f'{REPO}/docs/france-privacy-1/back/{loc}.json', 'w'), ensure_ascii=False, indent=1)
    r = subprocess.run(['node', 'scripts/_legal-translations.cjs', loc], cwd=REPO, capture_output=True, text=True)
    if r.returncode != 0: errs.append('drift checker:\n' + r.stdout)
    return errs

if __name__ == '__main__':
    bad = 0
    for loc in sys.argv[1:]:
        e = apply(loc)
        if e: bad += 1; print(f'✗ {loc}'); [print('   - ' + x) for x in e]
        else: print(f'✓ {loc}: applied, re-stamped, drift checker clean')
    sys.exit(1 if bad else 0)
