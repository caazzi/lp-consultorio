// scripts/perf-check.js — npm run perf:check
//
// Web Vitals gate for CI. Runs the SAME engine as `npm run perf`
// (scripts/lib/perf.js) against a local static server and FAILS (exit 1) when any
// metric blows the performance budget.
//
// Replaces the Web Vitals RUM that used to go to GA4: the lab is deterministic
// (same runner, same throttling), measures the pushed code BEFORE deploy and does
// not pollute the conversion report.
//
// Deliberate scope: measures the static side (HTML/CSS/JS in public/). It does
// NOT measure infrastructure (Netlify TTFB), which is an open decision in
// AGENTS.md.

const perf = require('./lib/perf');

const { pad } = perf;

// Performance budget (mobile). Loose enough not to break on runner noise, tight
// enough to catch real regressions (e.g. an eager gtag that pushed TBT from ~20ms
// to 4-6s). Adjust together with a real baseline.
const BUDGET = {
  perfMin: 70,        // Performance score (0-100)
  LCP: 2500,          // ms
  TBT: 3000,          // ms
  CLS: 0.1,           // unitless
  FCP: 2500           // ms
};

function displayValue(key, value) {
  return key === 'CLS' ? value.toFixed(3) : `${Math.round(value)}ms`;
}

function evaluate(name, summary) {
  const m = summary.metrics;
  const failures = [];

  // Missing score = invalid measurement. Never treat it as passed.
  if (summary.perf == null) {
    return { failures: [`${name}: invalid measurement (missing performance score)`] };
  }
  if (summary.perf < BUDGET.perfMin) {
    failures.push(`${name}: Performance ${summary.perf} < minimum ${BUDGET.perfMin}`);
  }
  for (const key of ['LCP', 'TBT', 'CLS', 'FCP']) {
    const value = m[key] && m[key].numeric;
    if (value == null) {
      failures.push(`${name}: ${key} not measured (invalid measurement)`);
      continue;
    }
    if (value > BUDGET[key]) {
      failures.push(`${name}: ${key} ${displayValue(key, value)} > budget ${displayValue(key, BUDGET[key])}`);
    }
  }
  return { failures };
}

function main() {
  console.log('\x1b[36m' + '='.repeat(70) + '\x1b[0m');
  console.log('\x1b[36m 🚦 PERF GATE — Web Vitals (mobile, local server) \x1b[0m');
  console.log('\x1b[36m' + '='.repeat(70) + '\x1b[0m\n');
  console.log(`Chrome: ${perf.chromePath()}`);
  console.log(`Base: ${process.env.PERF_BASE_URL || '(production)'}`);
  console.log(`Budget: Perf >= ${BUDGET.perfMin} | LCP <= ${BUDGET.LCP}ms | TBT <= ${BUDGET.TBT}ms | CLS <= ${BUDGET.CLS} | FCP <= ${BUDGET.FCP}ms\n`);

  const results = perf.runAll();

  console.log('\x1b[33m📊 RESULTS\x1b[0m\n');
  const header = 'Page          | Perf   | FCP    LCP    TBT    CLS   ';
  console.log(header);
  console.log('-'.repeat(header.length));

  let allFailures = [];
  for (const [k, v] of Object.entries(results)) {
    const s = v.summary;
    const m = s.metrics;
    console.log(
      pad(k.padEnd(13), 14) + '| ' +
      pad(s.perf ?? '-', 7) + '| ' +
      pad(m.FCP.display, 6) + pad(m.LCP.display, 6) + pad(m.TBT.display, 6) + pad(m.CLS.display, 6)
    );
    allFailures = allFailures.concat(evaluate(k, s).failures);
  }

  if (allFailures.length) {
    console.log('\n\x1b[31m❌ PERFORMANCE BUDGET EXCEEDED:\x1b[0m');
    allFailures.forEach((f) => console.log(`  - ${f}`));
    console.log('\n\x1b[33mIf the regression is acceptable, adjust BUDGET in scripts/perf-check.js with a justification.\x1b[0m\n');
    process.exit(1);
  }

  console.log('\n\x1b[32m✅ Web Vitals within budget.\x1b[0m\n');
}

main();
