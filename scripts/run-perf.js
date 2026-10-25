// scripts/run-perf.js — npm run perf
// Mobile Lighthouse report (index + cardiologia) for before/after comparison.
// The engine lives in scripts/lib/perf.js (shared with the CI gate
// `npm run perf:check`) so the two can never drift.
//
// Measures the production URL by default. To measure local code before deploy:
//   PERF_BASE_URL=http://localhost:PORT npm run perf
//
// Artifacts go outside the repo (keeps the working tree clean).

const perf = require('./lib/perf');

const { pad } = perf;

function main() {
  console.log('\x1b[36m' + '='.repeat(70) + '\x1b[0m');
  console.log('\x1b[36m 🚀 PERF — Google Lighthouse (mobile) \x1b[0m');
  console.log('\x1b[36m' + '='.repeat(70) + '\x1b[0m\n');
  console.log(`Chrome: ${perf.chromePath()}`);
  console.log(`Output dir (outside the repo): ${perf.outDir()}\n`);

  const results = perf.runAll();

  console.log('\n\x1b[33m📊 RESULTS (mobile)\x1b[0m\n');
  const header = 'Page          | Perf   A11y   BP     SEO   | FCP    LCP    TBT    CLS   SI    ';
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const [k, v] of Object.entries(results)) {
    const s = v.summary;
    const m = s.metrics;
    console.log(
      pad(k.padEnd(13), 14) + '| ' +
      pad(s.perf ?? '-', 6) + pad(s.accessibility ?? '-', 6) + pad(s.bestPractices ?? '-', 6) + pad(s.seo ?? '-', 6) +
      ' | ' + pad(m.FCP.display, 6) + pad(m.LCP.display, 6) + pad(m.TBT.display, 6) + pad(m.CLS.display, 7) + pad(m.SI.display, 6)
    );
    console.log(`  (file: ${v.file})`);
  }

  console.log('\n\x1b[36m💡 Run `npm run perf` after performance changes and compare with the baseline.\x1b[0m');
  console.log('\x1b[36m💡 Automatic CI gate: `npm run perf:check`.\x1b[0m\n');
}

main();
