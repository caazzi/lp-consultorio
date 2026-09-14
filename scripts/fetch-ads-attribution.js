// scripts/fetch-ads-attribution.js — npm run ads-attribution
// Cross-references Google Ads campaign attribution between GA4 (Data API) and
// the first-party Netlify Blobs pipeline (via the insights function), so paid
// campaigns can be compared on leads-per-session and data-quality issues
// (test pollution, missing utms.source, GA4/first-party parity) are surfaced
// rather than silently averaged in.
//
// Reuses the GA4 auth/report helpers pattern from fetch-ga4-metrics.js and the
// canonical campaign resolution from netlify/access-store.js (single source).
//
// Requires (same as ga-metrics):
//   export GA4_PROPERTY_ID=493028300   (scripts do NOT load .env)
//   ga-credentials.json at repo root (or GOOGLE_APPLICATION_CREDENTIALS)
// Optional:
//   ACCESS_INSIGHTS_URL  (default: production insights function)
//   ACCESS_INSIGHTS_DAYS (default 30)
//
// Scope note: paid Google Ads runs ONLY for infectologia (campaign 23071806673).
// Cardiology's page stays live and keeps receiving organic/direct traffic, and its
// historical campaign id remains in CAMPAIGN_LABELS, but it gets NO ad spend — do
// not read its rows here as a paid campaign to optimize or defund.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const accessStore = require(path.join(__dirname, '../netlify/access-store.js'));

const CRED_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, '../ga-credentials.json');
const PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const INSIGHTS_URL = process.env.ACCESS_INSIGHTS_URL
  || 'https://consultoriosalustiano.com.br/.netlify/functions/insights';
const DAYS = parseInt(process.env.ACCESS_INSIGHTS_DAYS || '30', 10);

// Manual smoke tests that reached production (TESTGCLID) still reach the Blobs, so
// they are excluded from every rate here. Detection is the single shared source in
// access-store (same predicate insights/log-access read-side split uses).
const isTestEvent = accessStore.isTestEvent;

function banner() {
  console.log('\x1b[36m%s\x1b[0m', '='.repeat(70));
  console.log('\x1b[36m%s\x1b[0m', ' 📢 ATRIBUIÇÃO DE GOOGLE ADS — GA4 × FIRST-PARTY');
  console.log('\x1b[36m%s\x1b[0m', '='.repeat(70) + '\n');
}

function getAccessToken(cred) {
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
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${claim}`);
    const jwt = `${header}.${claim}.${signer.sign(cred.private_key, 'base64url')}`;
    const post = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString();
    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(post) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => res.statusCode === 200
        ? resolve(JSON.parse(d).access_token)
        : reject(new Error(`OAuth ${res.statusCode}: ${d}`)));
    });
    req.on('error', reject);
    req.write(post);
    req.end();
  });
}

function runGaReport(accessToken, requestBody) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(requestBody);
    const req = https.request(
      `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => res.statusCode === 200
          ? resolve(JSON.parse(d))
          : reject(new Error(`GA4 ${res.statusCode}: ${d}`)));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function pad(s, n) { return String(s).padEnd(n); }

// --- first-party helpers -----------------------------------------------------

function campaignIdOf(e) {
  const u = e.utms || {};
  return u.gad_campaignid || u.campaign || '(sem campanha)';
}

function campaignLabelOf(e) {
  // Canonical server-side resolution (utms -> referer fallback -> Direto).
  return accessStore.resolveCampaignLabelFromEvent(e);
}

function isPaid(e) {
  const u = e.utms || {};
  return Boolean(u.gad_campaignid || u.gclid || /gad_campaignid|gclid/.test(e.referer || ''));
}

function agg(events) {
  return {
    pageViews: events.filter(e => e.event_type === 'page_view').length,
    whatsappClicks: events.filter(e => e.event_type === 'whatsapp_click').length,
    messagesSent: events.filter(e => e.event_type === 'message_sent').length
  };
}

async function fetchFirstParty() {
  const res = await fetch(`${INSIGHTS_URL}?days=${DAYS}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`insights ${res.status}: ${await res.text()}`);
  return res.json();
}

function printFirstParty(api) {
  const all = Array.isArray(api.events) ? api.events : [];
  const clean = all.filter(e => !isTestEvent(e));
  const tests = all.filter(isTestEvent);

  console.log('\x1b[33m%s\x1b[0m', `🗄️  1. FIRST-PARTY (Netlify Blobs, ${api.window_days} dias)`);
  const s = api.summary || {};
  console.log(` - Eventos totais            : ${s.events ?? 'n/a'} (teste: ${tests.length} | limpo: ${clean.length})`);
  console.log(` - Usuários únicos (page-load): ${s.unique_users ?? 'n/a'}`);
  console.log(` - Visitantes estimados       : ${s.estimated_visitors ?? 'n/a'} (ip+UA, janela 24h)`);
  const funnel = agg(clean);
  console.log(` - Funil limpo               : ${funnel.pageViews} pv | ${funnel.whatsappClicks} cliques | ${funnel.messagesSent} message_sent`);
  if (funnel.pageViews) {
    console.log(` - Engajamento (cliques/pv)  : ${(funnel.whatsappClicks / funnel.pageViews * 100).toFixed(1)}%`);
    console.log(` - Lead proxy (message/pv)   : ${(funnel.messagesSent / funnel.pageViews * 100).toFixed(1)}%`);
  }
  if (tests.length) {
    console.log(`\n \x1b[31m⚠️  ${tests.length} evento(s) de TESTE em produção (TESTGCLID).`);
    console.log('    Não há filtro upstream: eles entram no funil da API e devem ser ignorados.');
    console.log('    Datas: ' + [...new Set(tests.map(e => (e.timestamp || '').slice(0, 10)))].join(', '));
  }

  // Paid vs organic, and per-campaign funnel (test-free).
  const paid = clean.filter(isPaid);
  const organic = clean.filter(e => !isPaid(e));
  console.log('\n\x1b[33m%s\x1b[0m', '💰 2. PAGO vs ORGÂNICO (first-party, sem teste)');
  const pf = agg(paid), of = agg(organic);
  console.log(` - Pago    : ${pf.pageViews} pv | ${pf.whatsappClicks} cliques | ${pf.messagesSent} message_sent`);
  console.log(` - Orgânico: ${of.pageViews} pv | ${of.whatsappClicks} cliques | ${of.messagesSent} message_sent`);

  console.log('\n\x1b[33m%s\x1b[0m', '🏷️  3. FUNIL POR CAMPANHA (first-party, sem teste)');
  const byCamp = {};
  clean.forEach(e => {
    const k = campaignIdOf(e);
    byCamp[k] = byCamp[k] || { events: [], label: campaignLabelOf(e) };
    byCamp[k].events.push(e);
  });
  if (!Object.keys(byCamp).length) {
    console.log(' - Nenhum evento limpo no período.');
  }
  Object.entries(byCamp)
    .sort((a, b) => b[1].events.length - a[1].events.length)
    .forEach(([id, v]) => {
      const a = agg(v.events);
      const label = id === '(sem campanha)' ? v.label : v.label;
      console.log(` - ${pad(id, 16)} ${pad(label, 16)}: ${a.pageViews} pv | ${a.whatsappClicks} cliques | ${a.messagesSent} msg`);
    });

  // Raw attribution signal coverage — exposes the empty utms.source issue.
  const cov = { gclid: 0, gbraid: 0, gad_campaignid: 0, gad_source: 0, utm_source: 0, utm_campaign: 0 };
  all.forEach(e => { const u = e.utms || {}; Object.keys(cov).forEach(k => { if (u[k]) cov[k]++; }); });
  console.log('\n\x1b[33m%s\x1b[0m', '🔎 4. COBERTURA DE PARÂMETROS (utms brutos, todos os eventos)');
  Object.entries(cov).forEach(([k, n]) => console.log(` - ${pad(k, 16)}: ${n}/${all.length}`));
  if (cov.utm_source === 0 && cov.gad_source === 0) {
    console.log('   \x1b[33m(Google Ads manda gad_source; utm_source só existe se passado manualmente)\x1b[0m');
  }
}

async function printGa4(token) {
  console.log('\n\x1b[33m%s\x1b[0m', `📈 5. GA4 — CAMPANHA × SESSÕES × CONVERSÕES (${DAYS} dias)`);
  const range = [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }];
  const rep = await runGaReport(token, {
    dateRanges: range,
    dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionSourceMedium' }],
    metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
  });
  if (!rep.rows || !rep.rows.length) { console.log(' - Sem dados de campanha no GA4.'); return; }

  const header = 'Campanha                       Source/Medium          Sessões  KeyEv  KeyEv/sessão';
  console.log(header);
  console.log('-'.repeat(header.length));
  rep.rows.forEach(r => {
    const camp = r.dimensionValues[0].value;
    const sm = r.dimensionValues[1].value;
    const sessions = Number(r.metricValues[0].value);
    const keyEvents = Number(r.metricValues[1].value);
    const rate = sessions ? ((keyEvents / sessions) * 100).toFixed(1) + '%' : '-';
    console.log(` ${pad(camp, 30)} ${pad(sm, 22)} ${pad(sessions, 8)} ${pad(keyEvents, 6)} ${rate}`);
  });

  console.log('\n\x1b[33m%s\x1b[0m', '🎯 6. CONVERSÕES POR CAMPANHA (GA4)');
  const conv = await runGaReport(token, {
    dateRanges: range,
    dimensions: [{ name: 'eventName' }, { name: 'sessionCampaignName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: ['generate_lead', 'message_sent', 'whatsapp_click'] }
      }
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }]
  });
  if (!conv.rows || !conv.rows.length) { console.log(' - Sem conversões registradas.'); return; }
  conv.rows.forEach(r => {
    console.log(` - ${pad(r.dimensionValues[0].value, 16)} ${pad(r.dimensionValues[1].value, 30)}: ${r.metricValues[0].value}`);
  });
}

function printParity(api, ga4Leads) {
  const clean = (api.events || []).filter(e => !isTestEvent(e));
  const fp = agg(clean);
  console.log('\n\x1b[33m%s\x1b[0m', '⚖️  7. PARIDADE GA4 × FIRST-PARTY (proxy de perda de evento)');
  console.log(` - Cliques WhatsApp (first-party): ${fp.whatsappClicks}`);
  console.log(` - message_sent   (first-party)  : ${fp.messagesSent}`);
  if (ga4Leads != null) {
    console.log(` - Conversões Ads (GA4 keyEvents): ${ga4Leads}`);
    console.log('   \x1b[33m(first-party captura mais: imune a ad-block/consent; divergência esperada)\x1b[0m');
  }
}

async function main() {
  banner();

  let firstParty = null;
  try {
    console.log(`🗄️  Consultando first-party: ${INSIGHTS_URL} (dias=${DAYS})\n`);
    firstParty = await fetchFirstParty();
    printFirstParty(firstParty);
  } catch (err) {
    console.error(`\x1b[31m❌ Falha no first-party: ${err.message}\x1b[0m`);
  }

  if (!PROPERTY_ID) {
    console.log('\n\x1b[33m⚠️  GA4_PROPERTY_ID não definido — pulando cruzamento com GA4.\x1b[0m');
    console.log('   export GA4_PROPERTY_ID=493028300 npm run ads-attribution\n');
    return;
  }
  if (!fs.existsSync(CRED_PATH)) {
    console.log(`\n\x1b[33m⚠️  Credenciais GA4 ausentes (${CRED_PATH}) — pulando GA4.\x1b[0m\n`);
    return;
  }

  try {
    const cred = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
    const token = await getAccessToken(cred);
    await printGa4(token);

    // Sum keyEvents over paid search sessions only (medium = cpc). Uses a
    // contains-filter on sessionSourceMedium because the value is "google / cpc".
    const rep = await runGaReport(token, {
      dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'sessionSourceMedium' }],
      metrics: [{ name: 'keyEvents' }],
      dimensionFilter: {
        filter: { fieldName: 'sessionSourceMedium', stringFilter: { matchType: 'CONTAINS', value: 'cpc' } }
      }
    });
    const ga4Leads = (rep.rows || []).reduce((sum, r) => sum + Number(r.metricValues[0].value), 0);
    if (firstParty) printParity(firstParty, ga4Leads);
  } catch (err) {
    console.error(`\x1b[31m❌ Falha no GA4: ${err.message}\x1b[0m`);
  }

  console.log('\n\x1b[36m%s\x1b[0m', '-------------------------------------------------------');
  console.log('\x1b[36m%s\x1b[0m', ' Rode a qualquer momento: npm run ads-attribution');
  console.log('\x1b[33m%s\x1b[0m', ' Caveats: GA4 não traz CUSTO da campanha; leads/sessão ≠ CPA.');
  console.log('\x1b[33m%s\x1b[0m', ' Os dados de custo/investimento estão no Google Ads, não aqui.');
  console.log('\x1b[36m%s\x1b[0m', '-------------------------------------------------------\n');
}

main();
