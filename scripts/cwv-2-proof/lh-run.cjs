// scripts/cwv-2-proof/ — cwv-2 (6 November 2026, docs/cwv-2-report.md §7): THE PROOFS THAT NEED BUILDS. By hand, never swept: two production
// builds (HEAD and this work) in worktrees with no .env file, both against the stand-in database (scripts/_perf-1-standin.cjs), each
// `next start`ed, with hostproxy.cjs in front for the HatchGrab host, the Village Foodie host and the native app user agent.
// Nothing here reads a database, the live site or any .env file (lh-run.cjs reads the live site only when given its address).
// Lighthouse 12.8.2 is not a dependency of this repository: install it somewhere else (npm i lighthouse@12.8.2 chrome-launcher) and run
// this file with that node_modules on NODE_PATH.
// node lh-run.cjs <base> <out.json> <runs> path1 path2 ...  — Lighthouse 12.8.2 mobile defaults, cold (fresh profile each run), runs interleaved.
const fs = require('fs');
const chromeLauncher = require('chrome-launcher');
(async () => {
  const lighthouse = (await import('lighthouse')).default;
  const [base, out, runsS, ...paths] = process.argv.slice(2);
  const runs = +runsS || 3;
  const res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
  for (let r = 0; r < runs; r++) for (const p of paths) {
    const chrome = await chromeLauncher.launch({ chromePath: process.env.CHROME_PATH, chromeFlags: ['--headless=new', '--no-first-run'] });
    try {
      const rr = await lighthouse(base + p, { port: chrome.port, output: 'json', onlyCategories: ['performance'], logLevel: 'error',
        blockedUrlPatterns: ['*posthog.com*', '*:54398*'] });
      const a = rr.lhr.audits;
      const bytes = { Script: 0, Stylesheet: 0, Font: 0, Image: 0, Document: 0, total: 0 };
      const counts = { Font: 0 };
      for (const it of a['network-requests'].details.items) {
        bytes.total += it.transferSize || 0;
        if (it.resourceType in bytes) bytes[it.resourceType] += it.transferSize || 0;
        if (it.resourceType === 'Font') counts.Font++;
      }
      const el = a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node;
      const row = { run: r + 1, at: new Date().toISOString(), lcp: a['largest-contentful-paint'].numericValue, fcp: a['first-contentful-paint'].numericValue,
        cls: a['cumulative-layout-shift'].numericValue, tbt: a['total-blocking-time'].numericValue, score: rr.lhr.categories.performance.score,
        ttfb: a['server-response-time']?.numericValue, lcpElement: el ? (el.nodeLabel + ' | ' + el.selector) : null, bytes, fonts: counts.Font,
        warnings: rr.lhr.runWarnings };
      (res[p] ||= []).push(row);
      console.log(p, r + 1, Math.round(row.lcp), Math.round(row.fcp), row.cls, Math.round(row.tbt), JSON.stringify(bytes), row.lcpElement && row.lcpElement.slice(0, 80));
      fs.writeFileSync(out, JSON.stringify(res, null, 1));
    } catch (e) { console.log('ERR', p, e.message); }
    finally { await chrome.kill(); }
  }
})();
