// scripts/weekly-report.js — npm run weekly-report
//
// Builds the weekly metrics email for the doctor (non-technical reader) from two
// sources that need no interactive credential:
//
//   1. First-party (Netlify Blobs via the `insights` function) — the trustworthy
//      count. Always available (public endpoint).
//   2. GA4 Data API — Google's cross-check. Needs a service account; degrades on
//      its own when the credential is missing.
//
// Copy principles (reviewed 2026-09):
//   - Business language, not engineering: "people who messaged on WhatsApp",
//     never "whatsapp_click". No infrastructure jargon at the top.
//   - One-sentence summary + key numbers BEFORE any table.
//   - Week-over-week comparison (▲/▼ arrows) for context.
//   - Alert only when the change is LARGE (avoids false alarms).
//   - Technical details (GA4, buttons, campaign names) collapsed at the bottom.
//
// Language policy: this file is English. Every Portuguese string the owner reads
// lives in `scripts/lib/weekly-report-copy.pt.js` — see AGENTS.md. Do not add
// PT-BR here; `npm run lang:check` fails the build.
//
// Scope: same source of truth as the GitHub Actions email
// (.github/workflows/weekly-metrics.yml). No number logic lives in the YAML.
//
// Not included: Google Ads (cost/BRL). The `ads/` CLI is gitignored and uses
// interactive OAuth, so it cannot run on a runner — use `npm run ads-report`
// locally.
//
// Requirements:
//   First-party: none (public endpoint).
//   GA4 (optional): GA4_PROPERTY_ID + credential at GOOGLE_APPLICATION_CREDENTIALS
//                   (or ga-credentials.json in the repo root).
//
// Usage:
//   node scripts/weekly-report.js              # print text to stdout
//   node scripts/weekly-report.js --out <dir>  # write body.txt + body.html
//   node scripts/weekly-report.js --json       # raw payload (debug)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { fetchInsights } = require('./lib/insights-api');

const DAYS = parseInt(process.env.ACCESS_INSIGHTS_DAYS || '7', 10);
const PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const CRED_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, '../ga-credentials.json');

const SITE = 'https://consultoriosalustiano.com.br';

// All owner-facing copy (PT-BR) lives in the copy module: this script stays in
// English and the translation surface stays auditable.
const {
  renderText,
  renderHtml
} = require('./lib/weekly-report-copy.pt');

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

function summarizeFirstParty(api) {
  const s = api.summary || {};
  const campaigns = api.campaigns || {};
  const clicksBy = campaigns.clicks_by_campaign || {};
  const leadsBy = campaigns.leads_by_campaign || {};
  const keys = new Set([...Object.keys(clicksBy), ...Object.keys(leadsBy)]);
  const perCampaign = [...keys].map((k) => {
    const [campaign, specialty] = k.split(' :: ');
    return {
      campaign: campaign || '(no campaign)',
      specialty: specialty || '',
      clicks: clicksBy[k] || 0,
      leads: leadsBy[k] || 0
    };
  }).sort((a, b) => b.clicks - a.clicks);

  return {
    windowDays: api.window_days,
    generatedAt: api.generated_at,
    summary: {
      events: s.events ?? 0,
      uniqueUsers: s.unique_users ?? 0,
      estimatedVisitors: s.estimated_visitors ?? null,
      pageViews: s.page_views ?? 0,
      whatsappClicks: s.whatsapp_clicks ?? 0,
      messagesSent: s.messages_sent ?? 0,
      engagementRate: s.engagement_rate ?? 0,
      leadProxyRate: s.lead_proxy_rate ?? 0
    },
    preview: api.preview_traffic || null,
    test: api.test_traffic || null,
    sources: api.sources || {},
    specialties: api.specialties || {},
    buttons: api.button_location || {},
    perCampaign
  };
}

/**
 * Derives the PREVIOUS week as the difference between the 2× window and the
 * current one. Valid for COUNTS only (the function aggregates by summing events).
 * NOT valid for `unique_users`/`estimated_visitors`: those are set cardinalities,
 * so subtracting would overestimate — visitors overlap across the two weeks.
 */
function previousWeek(current, older) {
  // Takes TWO summaries in the summarizeFirstParty shape (summary.pageViews…),
  // not the raw API payload. The 2× window includes the current week, so the
  // previous one is the difference.
  const dec = (a, b) => Math.max(0, (Number(a) || 0) - (Number(b) || 0));
  const cs = current.summary || {};
  const os = older.summary || {};
  return {
    pageViews: dec(os.pageViews, cs.pageViews),
    whatsappClicks: dec(os.whatsappClicks, cs.whatsappClicks),
    messagesSent: dec(os.messagesSent, cs.messagesSent)
  };
}

// ---------------------------------------------------------------------------
// GA4 (optional — degrades without breaking)
// ---------------------------------------------------------------------------

function gaToken(cred) {
  return new Promise((resolve, reject) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(JSON.stringify({
      iss: cred.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })).toString('base64url');
    const input = `${header}.${claim}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(input);
    const jwt = `${input}.${signer.sign(cred.private_key, 'base64url')}`;
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString();
    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(data).access_token);
        else reject(new Error(`OAuth ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function gaReport(token, propertyId, requestBody) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(requestBody);
    const req = https.request(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(data));
        else reject(new Error(`GA4 ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchGa4() {
  // Both reasons are interpolated into the email's technical section, so they are
  // email copy (PT-BR) — see scripts/lib/weekly-report-copy.pt.js.
  if (!PROPERTY_ID) return { ok: false, reason: 'GA4_PROPERTY_ID não definido' }; // lang:allow (email)
  if (!fs.existsSync(CRED_PATH)) return { ok: false, reason: 'credencial GA4 não encontrada' }; // lang:allow (email)
  try {
    const cred = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
    const token = await gaToken(cred);
    const range = [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }];

    const overview = await gaReport(token, PROPERTY_ID, {
      dateRanges: range,
      metrics: [
        { name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' },
        { name: 'screenPageViews' }, { name: 'eventCount' }
      ]
    });
    const traffic = await gaReport(token, PROPERTY_ID, {
      dateRanges: range,
      dimensions: [{ name: 'sessionSourceMedium' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 15
    });
    const events = await gaReport(token, PROPERTY_ID, {
      dateRanges: range,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 20
    });

    const ov = (overview.rows && overview.rows[0] && overview.rows[0].metricValues) || [];
    return {
      ok: true,
      overview: {
        activeUsers: ov[0] ? ov[0].value : '0',
        newUsers: ov[1] ? ov[1].value : '0',
        sessions: ov[2] ? ov[2].value : '0',
        pageViews: ov[3] ? ov[3].value : '0',
        eventCount: ov[4] ? ov[4].value : '0'
      },
      traffic: (traffic.rows || []).map((r) => ({
        source: r.dimensionValues[0].value,
        sessions: r.metricValues[0].value
      })),
      events: (events.rows || []).map((r) => ({
        name: r.dimensionValues[0].value,
        count: r.metricValues[0].value
      }))
    };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
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

  let fpCurrentRaw, fpOlderRaw;
  try {
    // 2× the window: the difference (2× − current) isolates the previous week.
    // Both go through the retrying client (scripts/lib/insights-api.js).
    [fpCurrentRaw, fpOlderRaw] = await Promise.all([
      fetchInsights(DAYS),
      fetchInsights(DAYS * 2)
    ]);
  } catch (err) {
    console.error(`[weekly-report] first-party failed after ${err.attempts || 1} attempt(s): ${err.message}`);
    process.exit(1);
  }
  const fp = summarizeFirstParty(fpCurrentRaw);
  const older = summarizeFirstParty(fpOlderRaw);
  const prev = previousWeek(fp, older);
  const ga = await fetchGa4();

  if (jsonOnly) {
    console.log(JSON.stringify({ when, days: DAYS, firstParty: fp, previousWeek: prev, ga4: ga }, null, 2));
    return;
  }

  const text = renderText(fp, ga, prev, when);
  const html = renderHtml(fp, ga, prev, when);

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'body.txt'), text);
    fs.writeFileSync(path.join(outDir, 'body.html'), html);
    console.log(text);
    console.error(`[weekly-report] written to ${outDir}/body.{txt,html}`);
    return;
  }

  console.log(text);
}

main().catch((err) => {
  console.error(`[weekly-report] fatal error: ${err.message}`);
  process.exit(1);
});
