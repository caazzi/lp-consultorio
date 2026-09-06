// scripts/run-perf.js — npm run perf
// Runs Lighthouse (mobile) against the live pages and prints a compact summary
// of Performance + Core Web Vitals so changes can be compared against a prior
// run. Artifacts are written OUTSIDE the repo (to a temp dir) to avoid dirtying
// the working tree. Reports to the console only.
//
// Motivation: mobile TBT regressions (eager gtag/Ads) took the pristine load from
// ~20ms TBT to 4-6s. This gives a repeatable before/after measurement.

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
const OUT_DIR = process.env.LH_OUT_DIR || path.join(os.tmpdir(), 'lh-run');
// Default targets the live site; override with PERF_BASE_URL to test a local
// static server (e.g. PERF_BASE_URL=http://localhost:8888) without deploying.
const BASE = (process.env.PERF_BASE_URL || 'https://consultoriosalustiano.com.br').replace(/\/$/, '');
const URLS = [
  { name: 'index', url: `${BASE}/` },
  { name: 'cardiologia', url: `${BASE}/cardiologia/` }
];
const NAVS = ['mobile'];

// Metrics extracted for the compact summary.
const METRIC_KEYS = {
  FCP: 'first-contentful-paint',
  LCP: 'largest-contentful-paint',
  TBT: 'total-blocking-time',
  CLS: 'cumulative-layout-shift',
  SI: 'speed-index',
  INP: 'interaction-to-next-paint'
};

function pad(s, n) { return String(s).padEnd(n); }

function runLighthouse(url, name) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${name}-mobile.json`);
  const chromeFlags = '--headless --no-sandbox --disable-gpu';
  // Invoke via a shell so Lighthouse/Chrome run under the same environment as a
  // normal interactive `npx -y lighthouse ...` (CHROME_PATH exported). Directly
  // spawning `npx lighthouse` from a forked Node child has proven flaky for
  // Chrome discovery in non-interactive contexts.
  const cmd =
    `export CHROME_PATH=${CHROME_PATH}; ` +
    `npx --yes lighthouse ${JSON.stringify(url)} ` +
    `--quiet --chrome-flags=${JSON.stringify(chromeFlags)} ` +
    `--output=json --output-path=${JSON.stringify(outPath)} ` +
    '--only-categories=performance,accessibility,best-practices,seo ' +
    '> /dev/null 2>&1; test -s ' + JSON.stringify(outPath);
  execSync(cmd, { stdio: ['ignore', 'ignore', 'pipe'] });
  return outPath;
}

function loadSummary(file) {
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cat = r.categories || {};
  const a = r.audits || {};
  const perf = cat.performance && cat.performance.score != null
    ? Math.round(cat.performance.score * 100)
    : null;
  const a11y = cat.accessibility ? Math.round(cat.accessibility.score * 100) : null;
  const bp = cat['best-practices'] ? Math.round(cat['best-practices'].score * 100) : null;
  const seo = cat.seo ? Math.round(cat.seo.score * 100) : null;

  const metrics = {};
  for (const [short, id] of Object.entries(METRIC_KEYS)) {
    const av = a[id];
    metrics[short] = av && av.displayValue ? av.displayValue : (av && av.score != null ? String(av.score) : 'n/a');
  }
  return { perf, accessibility: a11y, bestPractices: bp, seo, ...metrics };
}

// Some runs fail to produce timing audits (flaky). Retry once if perf is null.
function robustRun(url, name) {
  let out = runLighthouse(url, name);
  let s = loadSummary(out);
  if (s.perf == null) {
    console.warn(`[perf] ${name}: timings incomplete, retrying once...`);
    out = runLighthouse(url, name);
    s = loadSummary(out);
  }
  return { file: out, summary: s };
}

function main() {
  console.log('\x1b[36m' + '='.repeat(70) + '\x1b[0m');
  console.log('\x1b[36m 🚀 PERF — Google Lighthouse (mobile) \x1b[0m');
  console.log('\x1b[36m' + '='.repeat(70) + '\x1b[0m\n');
  console.log(`Chrome: ${CHROME_PATH}`);
  console.log(`Output dir (outside repo): ${OUT_DIR}\n`);

  const results = {};
  for (const { name, url } of URLS) {
    for (const nav of NAVS) {
      const { file, summary } = robustRun(url, name);
      results[`${name}/${nav}`] = { file, summary: summary };
    }
  }

  console.log('\n\x1b[33m📊 RESULTADOS (mobile)\x1b[0m\n');
  const header = 'Pagina        | Perf   A11y   BP     SEO   | FCP    LCP    TBT    CLS   SI    ';
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const [k, v] of Object.entries(results)) {
    const s = v.summary;
    console.log(
      pad(k.padEnd(13), 14) + '| ' +
      pad(s.perf ?? '-', 6) + pad(s.accessibility ?? '-', 6) + pad(s.bestPractices ?? '-', 6) + pad(s.seo ?? '-', 6) +
      ' | ' + pad(s.FCP, 6) + pad(s.LCP, 6) + pad(s.TBT, 6) + pad(s.CLS, 7) + pad(s.SI, 6)
    );
    console.log(`  (arquivo: ${v.file})`);
  }

  console.log('\n\x1b[36m💡 Use `npm run perf` após mudanças de performance e compare com a linha de base.\x1b[0m\n');
}

main();
