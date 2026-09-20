// scripts/weekly-report.js — npm run weekly-report
//
// Gera o email semanal de métricas para o Dr./a Dra. (leitor NÃO-técnico).
// Combina duas fontes que rodam sem credencial interativa:
//
//   1. First-party (Netlify Blobs via função `insights`) — a contagem confiável.
//      Sempre disponível (endpoint público).
//   2. GA4 Data API — cross-check do Google. Exige service account; degrada
//      sozinho se faltar.
//
// Princípios de copy (revisão 2026-09):
//   - Linguagem de negócio, não de engenharia: "pessoas que chamaram no WhatsApp",
//     não "whatsapp_click". Zero sigla de infraestrutura no topo.
//   - Resumo em 1 frase + números-chave ANTES de qualquer tabela.
//   - Comparação com a semana anterior (seta ▲/▼) para dar contexto.
//   - Aviso só quando a variação é GRANDE (evita alarme falso).
//   - Detalhes técnicos (GA4, botões, nomes de campanha) ficam recolhidos no fim.
//
// Objetivo: ser a MESMA fonte do email do GitHub Actions (.github/workflows/
// weekly-metrics.yml). Nenhuma lógica de número vive no YAML.
//
// NÃO inclui o Google Ads (custo/R$): o CLI em `ads/` é gitignored e usa OAuth
// interativo; não roda em runner. Para isso, `npm run ads-report` na máquina.
//
// Requisitos:
//   First-party: nenhum (endpoint público).
//   GA4 (opcional): GA4_PROPERTY_ID + credencial em GOOGLE_APPLICATION_CREDENTIALS
//                   (ou ga-credentials.json na raiz).
//
// Uso:
//   node scripts/weekly-report.js              # imprime texto em stdout
//   node scripts/weekly-report.js --out <dir>  # grava body.txt + body.html
//   node scripts/weekly-report.js --json       # payload cru (debug)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const DEFAULT_INSIGHTS_URL = process.env.ACCESS_INSIGHTS_URL
  || 'https://consultoriosalustiano.com.br/.netlify/functions/insights';

const DAYS = parseInt(process.env.ACCESS_INSIGHTS_DAYS || '7', 10);
const PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const CRED_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, '../ga-credentials.json');

const SITE = 'https://consultoriosalustiano.com.br';

// Limiares do aviso ("chama atenção"). Só dispara em mudança grande E quando o
// volume é relevante — 0→1 clique não é notícia, e 1 variação em base pequena
// vira ruído. Conservador de propósito: alerta falso treina o leitor a ignorar.
const NOTICE_MIN_BASE = 4;      // ignora bases pequenas (semana anterior < 4)
const NOTICE_DROP_PCT = 40;     // queda de >= 40% acende o aviso
const NOTICE_ZERO = true;       // zerar uma métrica que existia também acende

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------

async function fetchFirstParty(days) {
  const res = await fetch(`${DEFAULT_INSIGHTS_URL}?days=${days}`, {
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

/**
 * Deriva a semana ANTERIOR pela diferença entre a janela de 2× e a atual.
 * Válido para CONTAGENS (a função agrega somando eventos). NÃO usar para
 * `unique_users`/`estimated_visitors`: são contagens de conjuntos e a subtração
 * superestimaria por causa da sobreposição de visitantes entre as duas semanas.
 */
function previousWeek(current, older) {
  // Recebe DOIS resumos no formato de summarizeFirstParty (summary.pageViews…),
  // não o payload cru da API. A janela de 2× inclui a semana atual, então a
  // anterior é a diferença.
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
// Apresentação (copy para leigo)
// ---------------------------------------------------------------------------

function fmt(n) { return Number(n).toLocaleString('pt-BR'); }

/**
 * Traduz um número de campanha/origem para um rótulo humano. Os nomes internos
 * ('Infectologia', 'Direto / Orgânico', 'Hero Main') não dizem nada a um leigo.
 */
function friendlySource(name) {
  const n = String(name || '').trim();
  if (/direto|org[âa]nico|\(none\)|\(direct\)/i.test(n)) return 'Quem já conhece o site (busca no Google ou digitou o endereço)';
  if (/infectolog/i.test(n)) return 'Anúncios pagos no Google (Infectologia)';
  if (/cardio/i.test(n)) return 'Página de Cardiologia';
  return n || 'Outras origens';
}

function friendlyButton(name) {
  const n = String(name || '').trim();
  const map = {
    'Hero Main': 'Botão principal do topo da página',
    'Header': 'Botão no cabeçalho',
    'Floating_Sticky': 'Botão flutuante (fixo na tela)',
    'Floating Button': 'Botão flutuante'
  };
  return map[n] || n;
}

function friendlyGA4Source(name) {
  const n = String(name || '').trim();
  if (/google\s*\/\s*cpc/i.test(n)) return 'Anúncios do Google (pagos)';
  if (/google\s*\/\s*organic/i.test(n)) return 'Busca do Google (não pago)';
  if (/direct/i.test(n)) return 'Acesso direto';
  return n;
}

/** Texto da comparação: "9 (▲ +2 vs. semana passada)". */
function withTrend(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (previous === undefined || previous === null) return fmt(cur);
  const diff = cur - prev;
  if (diff === 0) return `${fmt(cur)} <span class="flat">(igual à semana passada)</span>`;
  const arrow = diff > 0 ? '▲' : '▼';
  const cls = diff > 0 ? 'up' : 'down';
  const sign = diff > 0 ? '+' : '';
  return `${fmt(cur)} <span class="${cls}">(${arrow} ${sign}${fmt(diff)} vs. semana passada)</span>`;
}

/** Comparação em texto puro (fallback do email). */
function withTrendText(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (previous === undefined || previous === null) return fmt(cur);
  const diff = cur - prev;
  if (diff === 0) return `${fmt(cur)} (igual à semana passada)`;
  const arrow = diff > 0 ? 'para cima' : 'para baixo';
  const sign = diff > 0 ? '+' : '';
  return `${fmt(cur)} (${sign}${fmt(diff)}, ${arrow})`;
}

/**
 * Gera avisos só quando a mudança é grande o bastante para o dono agir.
 * Silêncio quando não há nada relevante — o email não deve "gritar" toda semana.
 */
function buildNotices(cur, prev) {
  const flag = (now, before) => {
    if (before === undefined || before === null) return false;
    if (before < NOTICE_MIN_BASE) return false;   // base pequena = ruído
    if (NOTICE_ZERO && now === 0) return true;     // zerou algo que existia
    return ((before - now) / before) * 100 >= NOTICE_DROP_PCT;
  };

  const droppedClicks = flag(cur.whatsappClicks, prev.whatsappClicks);
  const droppedConvos = flag(cur.messagesSent, prev.messagesSent);

  // Cliques e conversas abertas andam juntos (a conversa é consequência do
  // clique). Se ambos caíram, UM aviso só — repetir parece dois problemas.
  if (droppedClicks) {
    if (cur.whatsappClicks === 0 && prev.whatsappClicks >= NOTICE_MIN_BASE) {
      return [`Ninguém chamou no WhatsApp esta semana (na semana passada foram ${fmt(prev.whatsappClicks)}).`];
    }
    const drop = Math.round(((prev.whatsappClicks - cur.whatsappClicks) / prev.whatsappClicks) * 100);
    return [`Menos gente chamou no WhatsApp: ${fmt(cur.whatsappClicks)} contra ${fmt(prev.whatsappClicks)} na semana passada (queda de ${drop}%).`];
  }
  if (droppedConvos) {
    return [`Menos conversas foram abertas: ${fmt(cur.messagesSent)} contra ${fmt(prev.messagesSent)} na semana passada.`];
  }
  return [];
}

function periodLabel(when) {
  return `Semana encerrada em ${when.split(',')[0]}`;
}

// ---------------------------------------------------------------------------
// Render: texto puro (fallback / clientes sem HTML)
// ---------------------------------------------------------------------------

function renderText(fp, ga, prev, when) {
  const L = [];
  const s = fp.summary;
  const leads = s.whatsappClicks;

  L.push('RESUMO DA SEMANA — Consultório Salustiano');
  L.push(periodLabel(when));
  L.push('');
  L.push(`Nesta semana, ${fmt(leads)} pessoa(s) clicaram para falar no WhatsApp a partir do site.`);
  if (s.messagesSent > 0 && s.messagesSent < leads) {
    L.push(`Dessas, ${fmt(s.messagesSent)} abriram a conversa no WhatsApp.`);
  } else if (s.messagesSent > 0) {
    L.push(`O site registrou ${fmt(s.messagesSent)} aberturas de conversa no WhatsApp.`);
  }
  L.push('');

  L.push('O QUE MAIS IMPORTA');
  L.push(`- Pessoas que chamaram no WhatsApp..: ${withTrendText(leads, prev.whatsappClicks)}`);
  L.push(`- Conversas abertas................: ${withTrendText(s.messagesSent, prev.messagesSent)}`);
  L.push(`- Visitas à página.................: ${withTrendText(s.pageViews, prev.pageViews)}`);
  L.push('');

  const notices = buildNotices(
    { whatsappClicks: leads, messagesSent: s.messagesSent },
    { whatsappClicks: prev.whatsappClicks, messagesSent: prev.messagesSent }
  );
  if (notices.length) {
    L.push('VALE A ATENÇÃO');
    notices.forEach((n) => L.push(`- ${n}`));
    L.push('');
  }

  L.push('DE ONDE VEIO O CONTATO');
  Object.entries(fp.sources).forEach(([src, n]) => L.push(`- ${friendlySource(src)}: ${fmt(n)}`));
  L.push('');

  if (ga.ok) {
    const lead = ga.events.find((e) => e.name === 'generate_lead');
    if (lead) {
      L.push('O GOOGLE TAMBÉM REGISTROU');
      L.push(`- Contatos (WhatsApp) vistos pelo Google: ${fmt(lead.count)}`);
      L.push('  (serve de conferência; o número do site acima é o mais confiável)');
      L.push('');
    }
  }

  L.push('--- DETALHES TÉCNICOS (pode ignorar) ---');
  L.push(`Visitantes estimados: ${s.estimatedVisitors != null ? fmt(s.estimatedVisitors) : 'n/d'}`);
  L.push(`Taxa de clique no WhatsApp: ${s.engagementRate}%`);
  if (fp.perCampaign.length) {
    L.push('Por campanha:');
    fp.perCampaign.forEach((c) => L.push(`  - ${friendlySource(c.campaign)}: ${c.clicks} clique(s), ${c.leads} conversa(s)`));
  }
  if (fp.buttons && Object.keys(fp.buttons).length) {
    L.push('Botões mais clicados:');
    Object.entries(fp.buttons).forEach(([b, n]) => L.push(`  - ${friendlyButton(b)}: ${n}`));
  }
  if (ga.ok) {
    L.push(`GA4 — sessões: ${fmt(ga.overview.sessions)} | usuários: ${fmt(ga.overview.activeUsers)} | páginas: ${fmt(ga.overview.pageViews)}`);
    ga.traffic.forEach((t) => L.push(`  - ${friendlyGA4Source(t.source)}: ${fmt(t.sessions)} sessão(ões)`));
  } else {
    L.push(`GA4 indisponível (${ga.reason})`);
  }
  if (fp.test && fp.test.events > 0) L.push(`Eventos de teste (ignorados): ${fp.test.events}`);
  if (fp.preview && fp.preview.events > 0) L.push(`Acessos de teste/preview (ignorados): ${fp.preview.events}`);
  L.push('');
  L.push(`Relatório detalhado para o técnico: npm run access-logs`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Render: HTML
// ---------------------------------------------------------------------------

function renderHtml(fp, ga, prev, when) {
  const s = fp.summary;
  const leads = s.whatsappClicks;

  const notices = buildNotices(
    { whatsappClicks: leads, messagesSent: s.messagesSent },
    { whatsappClicks: prev.whatsappClicks, messagesSent: prev.messagesSent }
  );

  const kpi = (label, valueHtml, hint) =>
    `<td style="padding:10px 14px;vertical-align:top">
       <div style="font-size:12px;color:#555">${label}</div>
       <div style="font-size:22px;font-weight:700;color:#0f766e;line-height:1.2">${valueHtml}</div>
       ${hint ? `<div style="font-size:11px;color:#888;margin-top:2px">${hint}</div>` : ''}
     </td>`;

  const sourceRows = Object.entries(fp.sources).map(([src, n]) =>
    `<tr><td style="padding:4px 0">${friendlySource(src)}</td><td style="text-align:right;padding-left:12px"><b>${fmt(n)}</b></td></tr>`).join('');

  const noticeHtml = notices.length
    ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:10px 14px;border-radius:4px;margin:16px 0">
         <div style="font-weight:700;color:#92400e;margin-bottom:4px">Vale a atenção</div>
         ${notices.map((n) => `<div style="color:#78350f;font-size:14px">${n}</div>`).join('')}
       </div>`
    : '';

  const details = [];
  details.push(`<li>Visitantes estimados: <b>${s.estimatedVisitors != null ? fmt(s.estimatedVisitors) : 'n/d'}</b></li>`);
  details.push(`<li>Taxa de clique no WhatsApp: <b>${s.engagementRate}%</b></li>`);
  if (fp.perCampaign.length) {
    details.push(`<li>Por campanha:<ul>${fp.perCampaign.map((c) => `<li>${friendlySource(c.campaign)}: ${c.clicks} clique(s), ${c.leads} conversa(s)</li>`).join('')}</ul></li>`);
  }
  if (fp.buttons && Object.keys(fp.buttons).length) {
    details.push(`<li>Botões mais clicados:<ul>${Object.entries(fp.buttons).map(([b, n]) => `<li>${friendlyButton(b)}: ${n}</li>`).join('')}</ul></li>`);
  }
  if (ga.ok) {
    details.push(`<li>GA4 — sessões: <b>${fmt(ga.overview.sessions)}</b>, usuários: <b>${fmt(ga.overview.activeUsers)}</b>, páginas: <b>${fmt(ga.overview.pageViews)}</b>
      <ul>${ga.traffic.map((t) => `<li>${friendlyGA4Source(t.source)}: ${fmt(t.sessions)} sessão(ões)</li>`).join('')}</ul></li>`);
  } else {
    details.push(`<li>GA4 indisponível (${ga.reason})</li>`);
  }
  if (fp.test && fp.test.events > 0) details.push(`<li>Eventos de teste (ignorados): ${fp.test.events}</li>`);
  if (fp.preview && fp.preview.events > 0) details.push(`<li>Acessos de teste/preview (ignorados): ${fp.preview.events}</li>`);

  let googleBlock = '';
  if (ga.ok) {
    const lead = ga.events.find((e) => e.name === 'generate_lead');
    if (lead) {
      googleBlock = `
      <div style="background:#f0fdfa;padding:12px 16px;border-radius:6px;margin:16px 0;font-size:14px">
        <b>O Google também registrou ${fmt(lead.count)} contato(s)</b> pelo WhatsApp.<br>
        <span style="color:#666;font-size:12px">Serve de conferência. O número do site é o mais confiável, porque não é afetado por bloqueadores de anúncio.</span>
      </div>`;
    }
  }

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  a{color:#0f766e}
  .up{color:#15803d;font-size:12px;font-weight:600}
  .down{color:#b91c1c;font-size:12px;font-weight:600}
  .flat{color:#888;font-size:12px}
  details summary{cursor:pointer;color:#0f766e;font-weight:600}
</style></head>
<body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;max-width:640px;margin:auto;padding:8px 16px">

  <h1 style="color:#0f766e;font-size:22px;margin-bottom:2px">Como foi a semana do site</h1>
  <p style="color:#666;margin-top:0;font-size:14px">Consultório Salustiano · ${periodLabel(when)}</p>

  <p style="font-size:16px;line-height:1.5">
    Nesta semana, <b>${fmt(leads)} pessoa(s) clicaram para falar no WhatsApp</b> a partir do site.
    ${s.messagesSent > 0 && s.messagesSent < leads
      ? `Dessas, <b>${fmt(s.messagesSent)}</b> abriram a conversa.`
      : s.messagesSent > 0
        ? `O site registrou <b>${fmt(s.messagesSent)}</b> aberturas de conversa.`
        : ''}
  </p>

  <table style="border-collapse:collapse;background:#f0fdfa;border-radius:8px;width:100%;margin-top:12px">
    <tr>
      ${kpi('Pessoas que chamaram no WhatsApp', withTrend(leads, prev.whatsappClicks), 'tocaram no botão do WhatsApp')}
      ${kpi('Conversas abertas', withTrend(s.messagesSent, prev.messagesSent), 'saíram do site para o WhatsApp')}
    </tr>
    <tr>
      ${kpi('Visitas à página', withTrend(s.pageViews, prev.pageViews), '')}
      ${kpi('Taxa de clique', s.engagementRate + '%', 'de cada 100 visitas, quantas chamam no WhatsApp')}
    </tr>
  </table>

  ${noticeHtml}

  <h3 style="margin-bottom:6px">De onde veio o contato</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${sourceRows}</table>

  ${googleBlock}

  <details style="margin-top:20px;border-top:1px solid #eee;padding-top:10px">
    <summary>Ver detalhes técnicos</summary>
    <ul style="font-size:13px;color:#444;line-height:1.6">${details.join('')}</ul>
    <p style="font-size:12px;color:#888">Para o relatório completo: <code>npm run access-logs</code>.
    Custos de anúncios não entram neste email.</p>
  </details>

  <p style="color:#aaa;font-size:11px;margin-top:24px">
    Contagem do próprio site (não é afetada por bloqueadores de anúncio). Acessos de teste são ignorados.
  </p>
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

  let fpCurrentRaw, fpOlderRaw;
  try {
    // 2× a janela: a diferença (2× − atual) isola a semana anterior.
    [fpCurrentRaw, fpOlderRaw] = await Promise.all([
      fetchFirstParty(DAYS),
      fetchFirstParty(DAYS * 2)
    ]);
  } catch (err) {
    console.error(`[weekly-report] first-party falhou: ${err.message}`);
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
    console.error(`[weekly-report] escrito em ${outDir}/body.{txt,html}`);
    return;
  }

  console.log(text);
}

main().catch((err) => {
  console.error(`[weekly-report] erro fatal: ${err.message}`);
  process.exit(1);
});
