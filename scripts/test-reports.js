// scripts/test-reports.js — npm run test:reports
//
// Golden test for the two owner-facing emails. The PT-BR copy is isolated in
// `scripts/lib/*-copy.pt.js`; this test freezes what the owner actually receives
// so a translation, a refactor or a "harmless" string tweak cannot change the
// email silently.
//
// Synthetic input (scripts/__fixtures__/*.json) — no real traffic data, no PII.
//
// Usage:
//   node scripts/test-reports.js           # verify against the goldens
//   node scripts/test-reports.js --update  # rewrite the goldens (review the diff!)

const fs = require('fs');
const path = require('path');

const weeklyCopy = require('./lib/weekly-report-copy.pt');
const productCopy = require('./lib/product-report-copy.pt');

const FIXTURES = path.join(__dirname, '__fixtures__');
const GOLDEN = path.join(FIXTURES, 'expected');
const update = process.argv.includes('--update');

function render(name, renderFn, ...args) {
  const file = path.join(GOLDEN, name);
  const actual = renderFn(...args);
  if (update) {
    fs.mkdirSync(GOLDEN, { recursive: true });
    fs.writeFileSync(file, actual);
    return { name, ok: true, updated: true };
  }
  if (!fs.existsSync(file)) return { name, ok: false, reason: 'golden missing (run with --update)' };
  const expected = fs.readFileSync(file, 'utf8');
  if (expected === actual) return { name, ok: true };
  const at = [...expected].findIndex((ch, i) => ch !== actual[i]);
  return { name, ok: false, reason: `differs at char ${at}` };
}

const weekly = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'weekly-input.json'), 'utf8'));
const product = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'product-input.json'), 'utf8'));

const results = [
  render('weekly-body.txt', weeklyCopy.renderText, weekly.firstParty, weekly.ga4, weekly.previousWeek, weekly.when),
  render('weekly-body.html', weeklyCopy.renderHtml, weekly.firstParty, weekly.ga4, weekly.previousWeek, weekly.when),
  render('product-body.txt', productCopy.renderText, product.product, product.when),
  render('product-body.html', productCopy.renderHtml, product.product, product.when)
];

// Branch coverage that does not deserve a golden: when GA4 is unavailable the
// email must still render and say so in the technical section.
const gaDown = weeklyCopy.renderText(weekly.firstParty, { ok: false, reason: 'sem credencial' }, weekly.previousWeek, weekly.when);
if (!gaDown.includes('GA4 indisponível')) {
  results.push({ name: 'weekly-body.txt (GA4 down)', ok: false, reason: 'missing GA4 fallback line' });
}

console.log('[test-reports] golden checks');
let failed = 0;
for (const r of results) {
  if (r.ok) {
    console.log(`  ✅ ${r.name}${r.updated ? ' (updated)' : ''}`);
  } else {
    console.error(`  ❌ ${r.name}: ${r.reason}`);
    failed += 1;
  }
}
if (failed) {
  console.error(`\n[test-reports] ${failed} failure(s). If the copy change was intentional, run: node scripts/test-reports.js --update`);
  process.exit(1);
}
console.log('[test-reports] all good');
