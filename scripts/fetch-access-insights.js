const fs = require('fs');
const path = require('path');
// Reuse the server-side visitor-grouping helper (single DRY source) for the
// offline log fallback so estimates match the production aggregation exactly.
const accessStore = require(path.join(__dirname, '../netlify/access-store.js'));

console.log('\x1b[36m%s\x1b[0m', '=======================================================');
console.log('\x1b[36m%s\x1b[0m', ' 📊 RELATÓRIO DE ACESSOS E INTENÇÃO DE CONVERSÃO (IDE) ');
console.log('\x1b[36m%s\x1b[0m', '=======================================================\n');

// Endpoint configurável da coleta de produção (Netlify Blobs).
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
    console.warn('⚠️  API de insights não retornou summary. Verifique o deploy da função.');
    return;
  }
  // Detecta o schema da API publicada. A versão atual (server-side canonicalizada)
  // retorna `sources`/`specialties`/`button_location`/`preview_traffic`. A versão
  // antiga ainda expõe `by_source`/`by_specialty` com referers crus (gclid). Se for a
  // antiga, orientamos o redeploy em vez de imprimir buckets enganosos.
  const isNewSchema = Array.isArray(api.events) && typeof api.sources === 'object'
    && typeof api.specialties === 'object' && (api.preview_traffic !== undefined);
  const s = api.summary;
  const labelFmt = (v) => v === undefined || v === null ? '0' : v;
  // Suporta nome de campo dos dois schemas (novo `events`, legado `total_events`).
  const totalEvents = labelFmt(s.events !== undefined ? s.events : s.total_events);

  console.log(`Janela de Análise: \x1b[36m${windowLabel}\x1b[0m`);
  console.log(`Total de Eventos (produção) : \x1b[36m${totalEvents}\x1b[0m`);
  console.log(`Usuários Únicos             : \x1b[36m${labelFmt(s.unique_users)}\x1b[0m (por page-load; infla com revisitantes)`);
  if (s.estimated_visitors != null) {
    console.log(`Estimativa de Visitantes      : \x1b[36m${labelFmt(s.estimated_visitors)}\x1b[0m (agrupamento server-side ip+UA, janela 24h)`);
  }
  console.log('');

  if (!isNewSchema) {
    console.log('\x1b[33m%s\x1b[0m', '▶ FUNIL (schema antigo da API publicada — apenas totais confiáveis)');
  }

  console.log('\x1b[33m%s\x1b[0m', '📈 1. FUNIL DE CONVERSÃO' + (isNewSchema ? ' (EXCLUI PREVIEW/TESTE)' : ''));
  console.log(` - Visualizações de Página  : \x1b[36m${labelFmt(s.page_views)}\x1b[0m`);
  console.log(` - Cliques no WhatsApp     : \x1b[32m${labelFmt(s.whatsapp_clicks)}\x1b[0m`);
  console.log(` - Saídas p/ WhatsApp      : \x1b[36m${labelFmt(s.messages_sent)}\x1b[0m (proxy de mensagem enviada)`);
  console.log(` - Engajamento (clique/visualização): \x1b[35m${s.engagement_rate}%\x1b[0m`);
  console.log(` - Taxa de Lead (proxy/visualização): \x1b[35m${s.lead_proxy_rate}%\x1b[0m`);
  if (s.conversion_rate != null && s.conversion_rate !== 0) {
    console.log(` - Conversão (message_sent / cliques): \x1b[35m${s.conversion_rate}%\x1b[0m`);
  }

  if (!isNewSchema) {
    console.log('\n\x1b[31m%s\x1b[0m', '⚠️  A função insights() publicada ainda NÃO contém o schema canonicalizado.');
    console.log('\x1b[33m%s\x1b[0m', ' Redeploy da função `.netlify/functions/insights` + `access-store.js` para');
    console.log('\x1b[33m%s\x1b[0m', ' ver fontes limpas, exclusão de preview e labels legíveis por campanha.');
    return;
  }
  console.log('\n');

  console.log('\x1b[33m%s\x1b[0m', '🧪 1b. TRÁFEGO DE PREVIEW / TESTE (não conta no funil)');
  if (api.preview_traffic && api.preview_traffic.events > 0) {
    console.log(` - Eventos: ${api.preview_traffic.events} | únicos: ${api.preview_traffic.unique_users} | page views: ${api.preview_traffic.page_views} | cliques: ${api.preview_traffic.whatsapp_clicks}`);
  } else {
    console.log(' - Nenhum evento de preview/teste no período.');
  }
  console.log('\n');

  console.log('\x1b[33m%s\x1b[0m', '🏥 2. INTERESSE POR ESPECIALIDADE (EVENTOS)');
  if (!printCounts(api.specialties, 25, ' evento(s)')) console.log(' - Nenhum evento por especialidade.');

  console.log('\n\x1b[33m%s\x1b[0m', '🎯 3. BOTÕES MAIS CLICADOS (ORIGEM DA CONVERSÃO)');
  const buttons = api.button_location || {};
  if (Object.keys(buttons).length > 0) {
    Object.keys(buttons).forEach(loc => console.log(` - Botão [${loc}]: \x1b[32m${buttons[loc]} clique(s)\x1b[0m`));
  } else {
    console.log(' - Nenhum clique no WhatsApp registrado no período.');
  }

  console.log('\n\x1b[33m%s\x1b[0m', '🌐 4. ORIGEM DOS VISITANTES (FONTE CANONICAL)');
  const sources = api.sources || {};
  Object.keys(sources).forEach(src => {
    const label = src === '__preview__' ? 'Preview / Teste' : src;
    console.log(` - ${label.padEnd(28)}: ${sources[src]} acesso(s)`);
  });

  console.log('\n\x1b[33m%s\x1b[0m', '📢 5. CLICKS / LEADS (PROXY) POR CAMPANHA & ESPECIALIDADE');
  const camp = (api.campaigns || {});
  const keys = new Set([...Object.keys(camp.clicks_by_campaign || {}), ...Object.keys(camp.leads_by_campaign || {})]);
  if (keys.size === 0) {
    console.log(' - Nenhum clique registrado no período.');
  } else {
    [...keys].sort().forEach(c => {
      const [campaign, spec] = c.split(' :: ');
      const clicks = (camp.clicks_by_campaign || {})[c] || 0;
      const leads = (camp.leads_by_campaign || {})[c] || 0;
      console.log(` - ${(campaign || '').padEnd(28)} ${(spec || '').padEnd(15)}: ${clicks} clique(s) | ${leads} lead(s) proxy`);
    });
  }
}

async function fetchFromNetlify() {
  const res = await fetch(`${INSIGHTS_URL}?days=${DEFAULT_DAYS}`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`API respondeu ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  try {
    console.log(`🌐 Consultando dados de produção:\n   \x1b[36m${INSIGHTS_URL}\x1b[0m\n\n`);
    const data = await fetchFromNetlify();

    if (data.summary && typeof data.summary === 'object') {
      if (data.summary.events === 0) {
        console.log('\x1b[33m%s\x1b[0m', 'ℹ️  Nenhum evento (produção) registrado no período ainda.');
        console.log(' Os eventos coletados são persistidos de forma durável (Netlify Blobs) e');
        console.log(' este relatório consulta a API de produção.\n');
      } else {
        printSections(data, `últimos ${data.window_days} dias (gerado em ${new Date(data.generated_at).toLocaleString('pt-BR')})`);
      }
    } else {
      console.warn('\x1b[31mResposta inesperada da API: falta o bloco summary.\x1b[0m');
      console.log(JSON.stringify(data, null, 2).slice(0, 4000));
    }
  } catch (err) {
    const logFile = path.join(__dirname, '../logs/access-events.json');
    if (fs.existsSync(logFile)) {
      console.log('\x1b[33m%s\x1b[0m', `⚠️  Falha ao consultar API (${err.message}). Usando log local:\n`);
      const raw = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      const events = Array.isArray(raw) ? raw : (raw.events || []);
      const visitorKeys = new Set();
      events.forEach(e => {
        const k = accessStore.deriveVisitorGroupKey(e);
        if (k !== null) visitorKeys.add(k);
      });
      const local = {
        summary: {
          events: events.length,
          unique_users: new Set(events.map(e => e.client_id || 'a')).size,
          estimated_visitors: visitorKeys.size,
          page_views: events.filter(e => e.event_type === 'page_view').length,
          whatsapp_clicks: events.filter(e => e.event_type === 'whatsapp_click').length,
          messages_sent: events.filter(e => e.event_type === 'message_sent').length,
          engagement_rate: (events.length ? ((events.filter(e => e.event_type === 'whatsapp_click').length / events.filter(e => e.event_type === 'page_view').length) * 100).toFixed(1) : 0),
          lead_proxy_rate: (events.length && events.filter(e => e.event_type === 'page_view').length ? ((events.filter(e => e.event_type === 'message_sent').length / events.filter(e => e.event_type === 'page_view').length) * 100).toFixed(1) : 0)
        }
      };
      printSections(local, 'log local');
    } else {
      console.log('\x1b[31m❌ Não foi possível consultar dados de produção:\x1b[0m', err.message);
      console.log('\x1b[33m%s\x1b[0m', '\n Dicas:');
      console.log('  - Se a API já está publicada com o novo schema, rode npm run access-logs novamente.');
      console.log('  - Opcionalmente configure ACCESS_INSIGHTS_DAYS (default 7).');
    }
  }
}

main();
