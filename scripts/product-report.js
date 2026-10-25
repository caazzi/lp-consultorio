// scripts/product-report.js — npm run product-report
//
// MONTHLY PRODUCT-INSIGHTS report (behaviour, not conversion). Deliberately
// separate from the weekly conversion email: mixing "how users behave" with
// "how many customers came" is what caused confusion before. Each report has a
// different audience and a different consumer.
//
// Answers CRO/product questions:
//   - How far do people scroll? (where to put the CTA)
//   - Which WhatsApp buttons get used?
//   - Which sources bring attention?
//
// Source: first-party (Netlify Blobs via the `insights` function). No GA4 or Ads
// CLI dependency (the latter is local-only). Runs on GitHub Actions.
//
// Language policy: English here; every PT-BR string the owner reads lives in
// `scripts/lib/product-report-copy.pt.js` (`npm run lang:check` enforces it).
//
// Usage:
//   node scripts/product-report.js              # text to stdout
//   node scripts/product-report.js --out <dir>  # body.txt + body.html
//   node scripts/product-report.js --json       # raw payload (debug)

const fs = require('fs');
const path = require('path');
const { fetchInsights } = require('./lib/insights-api');

// Owner-facing copy (PT-BR) is isolated in the copy module; this file is English.
const { renderText, renderHtml } = require('./lib/product-report-copy.pt');

const DAYS = parseInt(process.env.PRODUCT_REPORT_DAYS || '30', 10);

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------

function summarize(api) {
  const s = api.summary || {};
  const scrollTotal = Number(s.page_views || 0);
  // scroll_depth arrives as { "25": n, "50": n, "75": n, "100": n }.
  // Converted into the fraction of visits that reached each depth.
  const raw = api.scroll_depth || {};
  const scroll = {};
  for (const depth of ['25', '50', '75', '100']) {
    const n = Number(raw[depth] || 0);
    scroll[depth] = {
      count: n,
      pct: scrollTotal > 0 ? Number(((n / scrollTotal) * 100).toFixed(1)) : 0
    };
  }
  return {
    windowDays: api.window_days,
    generatedAt: api.generated_at,
    total: {
      pageViews: scrollTotal,
      whatsappClicks: Number(s.whatsapp_clicks || 0)
    },
    scroll,
    buttons: api.button_location || {},
    sources: api.sources || {},
    specialties: api.specialties || {}
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

async function main() {
  const jsonOnly = process.argv.includes('--json');
  const outDir = argValue('--out');
  const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  let raw;
  try {
    raw = await fetchInsights(DAYS);
  } catch (err) {
    console.error(`[product-report] first-party failed after ${err.attempts || 1} attempt(s): ${err.message}`);
    process.exit(1);
  }
  const p = summarize(raw);

  if (jsonOnly) {
    console.log(JSON.stringify({ when, days: DAYS, ...p }, null, 2));
    return;
  }

  const text = renderText(p, when);
  const html = renderHtml(p, when);

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'body.txt'), text);
    fs.writeFileSync(path.join(outDir, 'body.html'), html);
    console.log(text);
    console.error(`[product-report] written to ${outDir}/body.{txt,html}`);
    return;
  }

  console.log(text);
}

main().catch((err) => {
  console.error(`[product-report] fatal error: ${err.message}`);
  process.exit(1);
});
