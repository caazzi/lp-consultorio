// scripts/lib/perf.js — engine compartilhada de Lighthouse.
//
// Fonte ÚNICA para `npm run perf` (relatório local) e `npm run perf:check`
// (gate do CI). Evita que os dois divirjam sobre o que é uma medição válida —
// mesmo princípio de `ads/lib/report.js` para o funil.
//
// Por que invocar o Lighthouse via shell: sob Node, forkar `npx lighthouse`
// diretamente é não-confiável para descobrir o Chrome em contexto
// não-interativo (WSL/CI). O shell encontra o binário de forma consistente.
//
// Artefatos são gravados FORA do repo por padrão (evita sujar a árvore de
// trabalho com pastas `undefined:`/`lighthouse.*` no Linux runner).

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_OUT_DIR = path.join(os.tmpdir(), 'lh-run');

// Métricas extraídas. O `id` é o audit do Lighthouse; `unit` indica como
// normalizar o valor numérico para comparação com thresholds.
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
 * Páginas medidas por padrão (mobile). `PERF_BASE_URL` troca a base para um
 * servidor local, permitindo medir o código do push sem deploy.
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
 * Extrai score + métricas NORMALIZADAS (número + displayValue).
 * `numeric` é a base para comparação de threshold; `display` é para humanos.
 * CLS não tem unidade; LCP/TBT/FCP/SI vêm em ms.
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
 * Roda o Lighthouse com uma retentativa: alguns runs não produzem os audits de
 * timing (flaky) e devolveriam `perf: null`. Repetir uma vez estabiliza.
 * Se ainda falhar, NÃO inventa número: devolve o resultado incompleto para o
 * chamador decidir (o gate de CI trata como erro, não como "aprovado").
 */
function robustRun(url, name, dir) {
  let out = runLighthouse(url, name, dir);
  let summary = loadSummary(out);
  if (summary.perf == null) {
    console.warn(`[perf] ${name}: timings incompletos, repetindo uma vez...`);
    out = runLighthouse(url, name, dir);
    summary = loadSummary(out);
  }
  return { file: out, summary };
}

/** `{ 'index/mobile': { file, summary } }` para todas as páginas base. */
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
