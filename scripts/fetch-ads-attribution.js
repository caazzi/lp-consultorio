// scripts/fetch-ads-attribution.js — npm run ads-attribution
//
// THIN WRAPPER (kept for backwards compatibility). The attribution analysis now
// lives in ONE place: ads/lib/report.js + the `ads audit-attribution` command.
// This script no longer reimplements campaign resolution, GA4 aggregation or the
// first-party funnel — it delegates to those modules so there is a single source
// of truth and the numbers cannot drift between the two entry points.
//
// Prefer: npm run ads-audit -- --days 30   (richer: utms coverage, join-key
// agreement, contamination fingerprint, parity, proxy integrity).
//
// Requires (same as before):
//   export GA4_PROPERTY_ID=493028300   (scripts do NOT load .env)
//   ga-credentials.json at repo root (or GOOGLE_APPLICATION_CREDENTIALS)
// Optional:
//   ACCESS_INSIGHTS_URL, ACCESS_INSIGHTS_DAYS (default 30)
//
// Scope (AGENTS.md): paid Google Ads runs ONLY for infectologia (23071806673).

const path = require('path');

const reportLib = require(path.join(__dirname, '..', 'ads', 'lib', 'report'));
const firstparty = require(path.join(__dirname, '..', 'ads', 'lib', 'firstparty'));
const campaignsLib = require(path.join(__dirname, '..', 'ads', 'lib', 'campaigns'));

const DAYS = parseInt(process.env.ACCESS_INSIGHTS_DAYS || '30', 10);

function pad(s, n) { return String(s).padEnd(n); }

function banner() {
  console.log('\x1b[36m%s\x1b[0m', '='.repeat(70));
  console.log('\x1b[36m%s\x1b[0m', ' 📢 GOOGLE ADS ATTRIBUTION — GA4 × FIRST-PARTY (shared engine)');
  console.log('\x1b[36m%s\x1b[0m', '='.repeat(70) + '\n');
}

async function main() {
  banner();
  console.log(`🗄️  First-party (${DAYS} days) | ${firstparty.DEFAULT_INSIGHTS_URL}\n`);

  let api;
  try {
    api = await firstparty.fetchInsights({ days: DAYS });
  } catch (err) {
    console.error(`\x1b[31m❌ First-party failed: ${err.message}\x1b[0m`);
    process.exitCode = 1;
    return;
  }

  const audit = reportLib.auditFirstParty(api);

  console.log('\x1b[33m%s\x1b[0m', '1. FIRST-PARTY (Netlify Blobs)');
  console.log(` - Clean events : ${audit.counts.clean} (test: ${audit.counts.testEvents} | preview: ${audit.counts.previewEvents})`);
  console.log(` - Paid         : ${audit.counts.paid}`);
  console.log(` - empty utm_source on paid : ${audit.utmSourceEmptyOnPaid} (expected: Ads sends gad_*, not utm_*)`);

  console.log('\n\x1b[33m%s\x1b[0m', '2. PARAMETER COVERAGE (clean events)');
  Object.entries(audit.coverage).forEach(([k, n]) => console.log(` - ${pad(k, 16)}: ${n}/${audit.counts.clean}`));

  console.log('\n\x1b[33m%s\x1b[0m', '3. JOIN KEY (utms vs referer)');
  console.log(` - via utms.gad_campaignid : ${audit.joinKey.viaUtmId}`);
  console.log(` - via referer (fallback)  : ${audit.joinKey.viaReferer}`);
  console.log(` - unresolved              : ${audit.joinKey.unresolved}`);

  if (audit.gadCampaignIdSuspects.length) {
    console.log('\n\x1b[31m%s\x1b[0m', `⚠️  ${audit.gadCampaignIdSuspects.length} event(s) with an invalid gad_campaignid (gad_source contamination).`);
  }

  console.log('\n\x1b[33m%s\x1b[0m', '4. FUNNEL BY CAMPAIGN (first-party, test/preview excluded)');
  const fp = firstparty.summarize(api, { paidOnly: false });
  Object.values(fp.byCampaign)
    .sort((a, b) => b.pageViews - a.pageViews)
    .forEach((c) => {
      const id = c.campaignId || '(no campaign)';
      console.log(` - ${pad(id, 16)} ${pad(c.label, 16)}: ${c.pageViews} pv | ${c.whatsappClicks} clicks | ${c.messagesSent} msg`);
    });

  console.log('\n\x1b[36m%s\x1b[0m', '-------------------------------------------------------');
  console.log('\x1b[33m%s\x1b[0m', ' For the full GA4 cross-check, use:');
  console.log('\x1b[33m%s\x1b[0m', '   npm run ads-audit -- --days 90');
  console.log('\x1b[36m%s\x1b[0m', '-------------------------------------------------------\n');
  console.log(`Paid campaign: ${campaignsLib.PAID_CAMPAIGN_IDS.map(campaignsLib.labelForId).join(', ')}`);
}

main();
