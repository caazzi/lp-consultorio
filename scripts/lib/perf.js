// scripts/lib/perf.js — shared Lighthouse engine.
//
// Single source for `npm run perf` (local report) and `npm run perf:check` (CI
// gate). Keeps the two from disagreeing about what a valid measurement is — same
// principle as `ads/lib/report.js` for the funnel.
//
// Why invoke Lighthouse through the shell: under Node, forking `npx lighthouse`
// directly is unreliable at discovering Chrome in a non-interactive context
// (WSL/CI). The shell finds the binary consistently.
//
// Artifacts are written OUTSIDE the repo by default (keeps the working tree free
// of `undefined:` / `lighthouse.*` litter on the Linux runner).

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_OUT_DIR = path.join(os.tmpdir(), 'lh-run');

// Extracted metrics. `id` is the Lighthouse audit; the short key is how reports
// and thresholds refer to it.
const METRIC_KEYS = {
  FCP: 'first-contentful-paint',
  LCP: 'largest-contentful-paint',
  TBT: 'total-blocking-time',
  CLS: 'cumulative-layout-shift',
  SI: 'speed-index'
};

function pad(s, n) { return String(s).padEnd(n); }

function chromePath() {
  return process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
}

function outDir() {
  return process.env.LH_OUT_DIR || DEFAULT_OUT_DIR;
}

/**
 * Pages measured by default (mobile). `PERF_BASE_URL` swaps the base for a local
 * server, so the pushed code can be measured before it is deployed.
 */
function targets(baseOverride) {
  const base = (baseOverride || process.env.PERF_BASE_URL || 'https://consultoriosalustiano.com.br').replace(/\/$/, '');
  return [
    { name: 'index', url: `${base}/` },
    { name: 'cardiologia', url: `${base}/cardiologia/` }
  ];
}

function runLighthouse(url, name, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `${name}-mobile.json`);
  const chromeFlags = '--headless --no-sandbox --disable-gpu';
  const cmd =
    `export CHROME_PATH=${chromePath()}; ` +
    `npx --yes lighthouse ${JSON.stringify(url)} ` +
    `--quiet --chrome-flags=${JSON.stringify(chromeFlags)} ` +
    `--output=json --output-path=${JSON.stringify(outPath)} ` +
    '--only-categories=performance,accessibility,best-practices,seo ' +
    '> /dev/null 2>&1; test -s ' + JSON.stringify(outPath);
  execSync(cmd, { stdio: ['ignore', 'ignore', 'pipe'] });
  return outPath;
}

/**
 * Extracts the score + NORMALIZED metrics (numeric value + displayValue).
 * `numeric` is the basis for threshold comparison; `display` is for humans.
 * CLS is unitless; LCP/TBT/FCP/SI come in ms.
 */
function loadSummary(file) {
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cat = r.categories || {};
  const a = r.audits || {};
  const score = (c) => (c && c.score != null ? Math.round(c.score * 100) : null);

  const metrics = {};
  for (const [short, id] of Object.entries(METRIC_KEYS)) {
    const av = a[id];
    metrics[short] = {
      numeric: av && typeof av.numericValue === 'number' ? av.numericValue : null,
      display: av && av.displayValue ? av.displayValue : 'n/a'
    };
  }

  return {
    perf: score(cat.performance),
    accessibility: score(cat.accessibility),
    bestPractices: score(cat['best-practices']),
    seo: score(cat.seo),
    metrics
  };
}

/**
 * Runs Lighthouse with one retry: some runs produce no timing audits (flaky) and
 * would return `perf: null`. Repeating once stabilizes it. If it still fails, do
 * NOT invent a number: return the incomplete result so the caller decides (the CI
 * gate treats it as an error, never as "passed").
 */
function robustRun(url, name, dir) {
  let out = runLighthouse(url, name, dir);
  let summary = loadSummary(out);
  if (summary.perf == null) {
    console.warn(`[perf] ${name}: incomplete timings, retrying once...`);
    out = runLighthouse(url, name, dir);
    summary = loadSummary(out);
  }
  return { file: out, summary };
}

/** `{ 'index/mobile': { file, summary } }` for every base page. */
function runAll(opts = {}) {
  const dir = opts.outDir || outDir();
  const list = opts.targets || targets(opts.base);
  const results = {};
  for (const { name, url } of list) {
    const { file, summary } = robustRun(url, name, dir);
    results[`${name}/mobile`] = { file, summary };
  }
  return results;
}

module.exports = {
  METRIC_KEYS,
  pad,
  chromePath,
  outDir,
  targets,
  runLighthouse,
  loadSummary,
  robustRun,
  runAll
};
