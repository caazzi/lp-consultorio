// scripts/weekly-report.js — npm run weekly-report
//
// Gera o corpo (Markdown + HTML) do relatório semanal de métricas combinando as
// DUAS fontes que rodam sem credencial interativa:
//
//   1. First-party (Netlify Blobs via função `insights`) — a verdade durável,
//      imune a ad-blockers. Sempre disponível (endpoint público).
//   2. GA4 Data API — overlay de sessões/keyEvents. Exige service account.
//
// Objetivo: ser a MESMA fonte do email do GitHub Actions (.github/workflows/
// weekly-metrics.yml). O workflow só chama este script e manda o stdout como
// corpo do email — nenhuma lógica de número vive no YAML.
//
// NÃO inclui o Google Ads: o CLI em `ads/` é gitignored e depende de OAuth
// interativo + arquivos locais; não roda em runner. Para custo/R$ use
// `npm run ads-report` na máquina. Ver AGENTS.md.
//
// Requisitos:
//   First-party: nenhum (endpoint público).
//   GA4 (opcional): GA4_PROPERTY_ID + credencial em GOOGLE_APPLICATION_CREDENTIALS
//                   (ou ga-credentials.json na raiz). Se faltar, o relatório sai
//                   só com o first-party, sem quebrar.
//
// Uso:
//   node scripts/weekly-report.js              # imprime texto em stdout (humano)
//   node scripts/weekly-report.js --out <dir>  # grava body.txt + body.html no dir
//   node scripts/weekly-report.js --json        # payload cru (debug)
// O workflow do GHA usa --out e envia os dois arquivos por email.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const accessStore = require(path.join(__dirname, '../netlify/access-store.js'));

const DEFAULT_INSIGHTS_URL = process.env.ACCESS_INSIGHTS_URL
  || 'https://consultoriosalustiano.com.br/.netlify/functions/insights';

const DAYS = parseInt(process.env.ACCESS_INSIGHTS_DAYS || '7', 10);
const PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const CRED_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, '../ga-credentials.json');

const SITE = 'https://consultoriosalustiano.com.br';

// ---------------------------------------------------------------------------
// First-party
// ---------------------------------------------------------------------------

async function fetchFirstParty() {
  const res = await fetch(`${DEFAULT_INSIGHTS_URL}?days=${DAYS}`, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`insights ${res.status}: ${await res.text()}`);
  return res.json();
}

function summarizeFirstParty(api) {
  const s = api.summary || {};
  const campaigns = api.campaigns || {};
  const clicksBy = campaigns.clicks_by_campaign || {};
  const leadsBy = campaigns.leads_by_campaign || {};
  const keys = new Set([...Object.keys(clicksBy), ...Object.keys(leadsBy)]);
  const perCampaign = [...keys].map((k) => {
    const [campaign, specialty] = k.split(' :: ');
    return {
      campaign: campaign || '(sem campanha)',
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

// ---------------------------------------------------------------------------
// GA4 (opcional — degrada sem quebrar)
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
  if (!PROPERTY_ID) return { ok: false, reason: 'GA4_PROPERTY_ID não definido' };
  if (!fs.existsSync(CRED_PATH)) return { ok: false, reason: 'credencial GA4 não encontrada' };
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
// Render
// ---------------------------------------------------------------------------

function fmt(n) { return Number(n).toLocaleString('pt-BR'); }

function renderText(fp, ga, when) {
  const L = [];
  const s = fp.summary;
  L.push(`RELATÓRIO SEMANAL — Consultório Salustiano`);
  L.push(`Período: últimos ${DAYS} dias | Gerado: ${when}`);
  L.push('');

  L.push('== CONVERSÃO (first-party, sem teste/preview) ==');
  L.push(`Visualizações de página : ${fmt(s.pageViews)}`);
  L.push(`Cliques no WhatsApp     : ${fmt(s.whatsappClicks)}`);
  L.push(`Saídas p/ WhatsApp      : ${fmt(s.messagesSent)} (proxy de msg enviada)`);
  L.push(`Taxa de Lead (proxy/pv) : ${s.leadProxyRate}%`);
  L.push(`Engajamento (clique/pv) : ${s.engagementRate}%`);
  L.push(`Visitantes estimados    : ${s.estimatedVisitors != null ? fmt(s.estimatedVisitors) : 'n/d'}`);
  L.push('');

  L.push('== ORIGEM (first-party) ==');
  Object.entries(fp.sources).forEach(([src, n]) => L.push(`- ${src}: ${fmt(n)} acesso(s)`));
  L.push('');

  if (fp.perCampaign.length) {
    L.push('== CAMPANHAS (first-party) ==');
    fp.perCampaign.forEach((c) => L.push(`- ${c.campaign}: ${c.clicks} clique(s) | ${c.leads} lead(s) proxy`));
    L.push('');
  }

  if (fp.buttons && Object.keys(fp.buttons).length) {
    L.push('== BOTÕES MAIS CLICADOS ==');
    Object.entries(fp.buttons).forEach(([b, n]) => L.push(`- ${b}: ${n}`));
    L.push('');
  }

  if (ga.ok) {
    L.push('== GA4 (Data API) ==');
    L.push(`Sessões: ${fmt(ga.overview.sessions)} | Usuários ativos: ${fmt(ga.overview.activeUsers)} | Páginas vistas: ${fmt(ga.overview.pageViews)}`);
    if (ga.traffic.length) {
      L.push('Tráfego:');
      ga.traffic.forEach((t) => L.push(`  - ${t.source}: ${fmt(t.sessions)} sessão(ões)`));
    }
    const lead = ga.events.find((e) => e.name === 'generate_lead');
    if (lead) L.push(`generate_lead (GA4): ${fmt(lead.count)}`);
    L.push('');
  } else {
    L.push(`== GA4 indisponível == (${ga.reason})`);
    L.push('');
  }

  if (fp.test && fp.test.events > 0) {
    L.push(`[teste] smoke TESTGCLID: ${fp.test.events} evento(s) — fora do funil.`);
  }
  if (fp.preview && fp.preview.events > 0) {
    L.push(`[preview] ${fp.preview.events} evento(s) — fora do funil.`);
  }
  L.push('');
  L.push(`Detalhe local: npm run access-logs && npm run ga-metrics`);
  return L.join('\n');
}

function renderHtml(fp, ga, when) {
  const s = fp.summary;
  const rows = (obj) => Object.entries(obj).map(([k, v]) =>
    `<tr><td>${k}</td><td style="text-align:right">${fmt(v)}</td></tr>`).join('');
  const kpi = (label, value) =>
    `<td style="padding:8px 12px"><div style="font-size:12px;color:#666">${label}</div><div style="font-size:20px;font-weight:700;color:#0f766e">${value}</div></td>`;

  let gaBlock = '<p style="color:#a33">GA4 indisponível: ' + ga.reason + '</p>';
  if (ga.ok) {
    const traffic = ga.traffic.map((t) =>
      `<tr><td>${t.source}</td><td style="text-align:right">${fmt(t.sessions)}</td></tr>`).join('');
    const lead = ga.events.find((e) => e.name === 'generate_lead');
    gaBlock = `
      <p>Sessões <b>${fmt(ga.overview.sessions)}</b> · Usuários ativos <b>${fmt(ga.overview.activeUsers)}</b> · Páginas vistas <b>${fmt(ga.overview.pageViews)}</b>${lead ? ` · <b>generate_lead ${fmt(lead.count)}</b>` : ''}</p>
      <table style="border-collapse:collapse;width:100%;max-width:520px">${traffic}</table>`;
  }

  return `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;max-width:680px;margin:auto">
  <h2 style="color:#0f766e;margin-bottom:0">Relatório semanal — Consultório Salustiano</h2>
  <p style="color:#666;margin-top:4px">Últimos ${DAYS} dias · ${when}</p>

  <table style="border-collapse:collapse;background:#f0fdfa;border-radius:8px"><tr>
    ${kpi('Cliques WhatsApp', fmt(s.whatsappClicks))}
    ${kpi('Saídas p/ WhatsApp', fmt(s.messagesSent))}
    ${kpi('Taxa de Lead', s.leadProxyRate + '%')}
    ${kpi('Página vistas', fmt(s.pageViews))}
  </tr></table>

  <h3>Origem (first-party)</h3>
  <table style="border-collapse:collapse;width:100%;max-width:520px">${rows(fp.sources)}</table>

  ${fp.perCampaign.length ? `<h3>Campanhas (first-party)</h3>
  <table style="border-collapse:collapse;width:100%;max-width:520px">
    ${fp.perCampaign.map((c) => `<tr><td>${c.campaign}</td><td style="text-align:right">${c.clicks} cliques · ${c.leads} leads</td></tr>`).join('')}
  </table>` : ''}

  ${fp.buttons && Object.keys(fp.buttons).length ? `<h3>Botões mais clicados</h3>
  <table style="border-collapse:collapse;width:100%;max-width:520px">${rows(fp.buttons)}</table>` : ''}

  <h3>GA4 (Data API)</h3>
  ${gaBlock}

  <p style="color:#666;font-size:12px;margin-top:24px">
    First-party = Netlify Blobs (durável, imune a ad-block). Exclui preview e smoke tests.
    ${fp.test && fp.test.events > 0 ? `⚠️ ${fp.test.events} evento(s) de teste TESTGCLID separados do funil.` : ''}
  </p>
  <p style="color:#666;font-size:12px">Ads (custo/R$) não entra aqui — rode <code>npm run ads-report</code> localmente.</p>
</body></html>`;
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

  let fpRaw;
  try {
    fpRaw = await fetchFirstParty();
  } catch (err) {
    console.error(`[weekly-report] first-party falhou: ${err.message}`);
    process.exit(1);
  }
  const fp = summarizeFirstParty(fpRaw);
  const ga = await fetchGa4();

  if (jsonOnly) {
    console.log(JSON.stringify({ when, days: DAYS, firstParty: fp, ga4: ga }, null, 2));
    return;
  }

  const text = renderText(fp, ga, when);
  const html = renderHtml(fp, ga, when);

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'body.txt'), text);
    fs.writeFileSync(path.join(outDir, 'body.html'), html);
    console.log(text);
    console.error(`[weekly-report] escrito em ${outDir}/body.{txt,html}`);
    return;
  }

  console.log(text);
}

main().catch((err) => {
  console.error(`[weekly-report] erro fatal: ${err.message}`);
  process.exit(1);
});
