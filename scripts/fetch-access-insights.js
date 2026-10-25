const fs = require('fs');
const path = require('path');
// Reuse the server-side visitor-grouping helper (single DRY source) for the
// offline log fallback so estimates match the production aggregation exactly.
const accessStore = require(path.join(__dirname, '../netlify/access-store.js'));

console.log('\x1b[36m%s\x1b[0m', '=======================================================');
console.log('\x1b[36m%s\x1b[0m', ' 📊 ACCESS & CONVERSION-INTENT REPORT (IDE) ');
console.log('\x1b[36m%s\x1b[0m', '=======================================================\n');

// Configurable endpoint for the production collection (Netlify Blobs).
const INSIGHTS_URL = process.env.ACCESS_INSIGHTS_URL
  || 'https://consultoriosalustiano.com.br/.netlify/functions/insights';

const DEFAULT_DAYS = parseInt(process.env.ACCESS_INSIGHTS_DAYS || '7', 10);

function printCounts(mapObj, pad, suffix) {
  const entries = Object.entries(mapObj || {});
  if (entries.length === 0) return false;
  entries.forEach(([key, value]) => {
    console.log(` - ${String(key).padEnd(pad)}: \x1b[36m${value}\x1b[0m${suffix || ''}`);
  });
  return true;
}

function printSections(api, windowLabel) {
  if (!api.summary) {
    console.warn('⚠️  insights API returned no summary. Check the function deploy.');
    return;
  }
  // Detects the deployed API schema. The current one (server-side canonicalized)
  // returns `sources`/`specialties`/`button_location`/`preview_traffic`. The old one
  // still exposes `by_source`/`by_specialty` with raw referers (gclid), so we ask for
  // a redeploy instead of printing misleading buckets.
  const isNewSchema = Array.isArray(api.events) && typeof api.sources === 'object'
    && typeof api.specialties === 'object' && (api.preview_traffic !== undefined);
  const s = api.summary;
  const labelFmt = (v) => v === undefined || v === null ? '0' : v;
  // Supports both schema field names (new `events`, legacy `total_events`).
  const totalEvents = labelFmt(s.events !== undefined ? s.events : s.total_events);

  console.log(`Analysis window: \x1b[36m${windowLabel}\x1b[0m`);
  console.log(`Total events (production): \x1b[36m${totalEvents}\x1b[0m`);
  console.log(`Unique users            : \x1b[36m${labelFmt(s.unique_users)}\x1b[0m (per page-load; inflated by returning visitors)`);
  if (s.estimated_visitors != null) {
    console.log(`Estimated visitors      : \x1b[36m${labelFmt(s.estimated_visitors)}\x1b[0m (server-side ip+UA grouping, 24h window)`);
  }
  console.log('');

  if (!isNewSchema) {
    console.log('\x1b[33m%s\x1b[0m', '▶ FUNNEL (old deployed schema — totals only)');
  }

  console.log('\x1b[33m%s\x1b[0m', '📈 1. CONVERSION FUNNEL' + (isNewSchema ? ' (PREVIEW/TEST EXCLUDED)' : ''));
  console.log(` - Page views               : \x1b[36m${labelFmt(s.page_views)}\x1b[0m`);
  console.log(` - WhatsApp clicks          : \x1b[32m${labelFmt(s.whatsapp_clicks)}\x1b[0m`);
  console.log(` - WhatsApp exits           : \x1b[36m${labelFmt(s.messages_sent)}\x1b[0m (message-sent proxy)`);
  console.log(` - Engagement (click/pageview): \x1b[35m${s.engagement_rate}%\x1b[0m`);
  console.log(` - Lead rate (proxy/pageview) : \x1b[35m${s.lead_proxy_rate}%\x1b[0m`);
  if (s.conversion_rate != null && s.conversion_rate !== 0) {
    console.log(` - Conversion (message_sent / clicks): \x1b[35m${s.conversion_rate}%\x1b[0m`);
  }

  if (!isNewSchema) {
    console.log('\n\x1b[31m%s\x1b[0m', '⚠️  The deployed insights() function still lacks the canonicalized schema.');
    console.log('\x1b[33m%s\x1b[0m', ' Redeploy `.netlify/functions/insights` + `access-store.js` to get');
    console.log('\x1b[33m%s\x1b[0m', ' clean sources, preview exclusion and readable campaign labels.');
    return;
  }
  console.log('\n');

  console.log('\x1b[33m%s\x1b[0m', '🧪 1b. PREVIEW / TEST TRAFFIC (excluded from the funnel)');
  if (api.preview_traffic && api.preview_traffic.events > 0) {
    console.log(` - Preview: events=${api.preview_traffic.events} | unique=${api.preview_traffic.unique_users} | page views=${api.preview_traffic.page_views} | clicks=${api.preview_traffic.whatsapp_clicks}`);
  } else {
    console.log(' - No preview/test events in the period.');
  }
  if (api.test_traffic && api.test_traffic.events > 0) {
    console.log(`\x1b[31m%s\x1b[0m`, ` - ⚠️  Smoke test (TESTGCLID): events=${api.test_traffic.events} | page views=${api.test_traffic.page_views} | clicks=${api.test_traffic.whatsapp_clicks}`);
    console.log('   Use a deploy preview for smoke tests; never the production URL.');
  }
  console.log('\n');

  console.log('\x1b[33m%s\x1b[0m', '🏥 2. INTEREST BY SPECIALTY (EVENTS)');
  if (!printCounts(api.specialties, 25, ' event(s)')) console.log(' - No events per specialty.');

  console.log('\n\x1b[33m%s\x1b[0m', '🎯 3. MOST-CLICKED BUTTONS (CONVERSION ORIGIN)');
  const buttons = api.button_location || {};
  if (Object.keys(buttons).length > 0) {
    Object.keys(buttons).forEach(loc => console.log(` - Button [${loc}]: \x1b[32m${buttons[loc]} click(s)\x1b[0m`));
  } else {
    console.log(' - No WhatsApp clicks recorded in the period.');
  }

  console.log('\n\x1b[33m%s\x1b[0m', '🌐 4. VISITOR ORIGIN (CANONICAL SOURCE)');
  const sources = api.sources || {};
  Object.keys(sources).forEach(src => {
    const label = src === '__preview__' ? 'Preview / Test' : src;
    console.log(` - ${label.padEnd(28)}: ${sources[src]} visit(s)`);
  });

  console.log('\n\x1b[33m%s\x1b[0m', '📢 5. CLICKS / LEADS (PROXY) BY CAMPAIGN & SPECIALTY');
  const camp = (api.campaigns || {});
  const keys = new Set([...Object.keys(camp.clicks_by_campaign || {}), ...Object.keys(camp.leads_by_campaign || {})]);
  if (keys.size === 0) {
    console.log(' - No clicks recorded in the period.');
  } else {
    [...keys].sort().forEach(c => {
      const [campaign, spec] = c.split(' :: ');
      const clicks = (camp.clicks_by_campaign || {})[c] || 0;
      const leads = (camp.leads_by_campaign || {})[c] || 0;
      console.log(` - ${(campaign || '').padEnd(28)} ${(spec || '').padEnd(15)}: ${clicks} click(s) | ${leads} proxy lead(s)`);
    });
  }
}

async function fetchFromNetlify() {
  const res = await fetch(`${INSIGHTS_URL}?days=${DEFAULT_DAYS}`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`API responded ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  try {
    console.log(`🌐 Querying production data:\n   \x1b[36m${INSIGHTS_URL}\x1b[0m\n\n`);
    const data = await fetchFromNetlify();

    if (data.summary && typeof data.summary === 'object') {
      if (data.summary.events === 0) {
        console.log('\x1b[33m%s\x1b[0m', 'ℹ️  No (production) events recorded in the period yet.');
        console.log(' Collected events are persisted durably (Netlify Blobs) and');
        console.log(' this report queries the production API.\n');
      } else {
        printSections(data, `last ${data.window_days} days (generated at ${new Date(data.generated_at).toLocaleString('en-GB')})`);
      }
    } else {
      console.warn('\x1b[31mUnexpected API response: missing the summary block.\x1b[0m');
      console.log(JSON.stringify(data, null, 2).slice(0, 4000));
    }
  } catch (err) {
    const logFile = path.join(__dirname, '../logs/access-events.json');
    if (fs.existsSync(logFile)) {
      console.log('\x1b[33m%s\x1b[0m', `⚠️  Failed to reach the API (${err.message}). Using the local log:\n`);
      const raw = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      const events = Array.isArray(raw) ? raw : (raw.events || []);
      // Mirror the production split: smoke tests (TESTGCLID) never enter the funnel.
      const testEvents = events.filter(accessStore.isTestEvent);
      const prodEvents = events.filter(e => !accessStore.isTestEvent(e));
      const visitorKeys = new Set();
      prodEvents.forEach(e => {
        const k = accessStore.deriveVisitorGroupKey(e);
        if (k !== null) visitorKeys.add(k);
      });
      const local = {
        summary: {
          events: prodEvents.length,
          unique_users: new Set(prodEvents.map(e => e.client_id || 'a')).size,
          estimated_visitors: visitorKeys.size,
          page_views: prodEvents.filter(e => e.event_type === 'page_view').length,
          whatsapp_clicks: prodEvents.filter(e => e.event_type === 'whatsapp_click').length,
          messages_sent: prodEvents.filter(e => e.event_type === 'message_sent').length,
          engagement_rate: (prodEvents.length ? ((prodEvents.filter(e => e.event_type === 'whatsapp_click').length / prodEvents.filter(e => e.event_type === 'page_view').length) * 100).toFixed(1) : 0),
          lead_proxy_rate: (prodEvents.length && prodEvents.filter(e => e.event_type === 'page_view').length ? ((prodEvents.filter(e => e.event_type === 'message_sent').length / prodEvents.filter(e => e.event_type === 'page_view').length) * 100).toFixed(1) : 0)
        },
        test_traffic: {
          events: testEvents.length,
          page_views: testEvents.filter(e => e.event_type === 'page_view').length,
          whatsapp_clicks: testEvents.filter(e => e.event_type === 'whatsapp_click').length
        }
      };
      printSections(local, 'local log');
    } else {
      console.log('\x1b[31m❌ Could not query production data:\x1b[0m', err.message);
      console.log('\x1b[33m%s\x1b[0m', '\n Hints:');
      console.log('  - If the API is already deployed with the new schema, run npm run access-logs again.');
      console.log('  - Optionally set ACCESS_INSIGHTS_DAYS (default 7).');
    }
  }
}

main();
