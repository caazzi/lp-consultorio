const fs = require('fs');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '=======================================================');
console.log('\x1b[36m%s\x1b[0m', ' 📊 RELATÓRIO DE ACESSOS E INTENÇÃO DE CONVERSÃO (IDE) ');
console.log('\x1b[36m%s\x1b[0m', '=======================================================\n');

// Endpoint configurável da coleta de produção (Netlify Blobs).
const INSIGHTS_URL = process.env.ACCESS_INSIGHTS_URL
  || 'https://consultoriosalustiano.com.br/.netlify/functions/insights';

const DEFAULT_DAYS = parseInt(process.env.ACCESS_INSIGHTS_DAYS || '7', 10);

function printSections(events, windowLabel) {
  const pageViews = events.filter(e => e.event_type === 'page_view');
  const waClicks = events.filter(e => e.event_type === 'whatsapp_click');
  const messagesSent = events.filter(e => e.event_type === 'message_sent');
  const conversionRate = pageViews.length > 0 ? ((waClicks.length / pageViews.length) * 100).toFixed(1) : 0;

  console.log(`Janela de Análise: \x1b[36m${windowLabel}\x1b[0m`);
  console.log(`Total de Eventos   : \x1b[36m${events.length}\x1b[0m\n`);

  console.log('\x1b[33m%s\x1b[0m', '📈 1. RESUMO DE CONVERSÃO');
  console.log(` - Visualizações de Página : \x1b[36m${pageViews.length}\x1b[0m`);
  console.log(` - Cliques no WhatsApp    : \x1b[32m${waClicks.length}\x1b[0m`);
  console.log(` - Saídas p/ WhatsApp     : \x1b[36m${messagesSent.length}\x1b[0m (proxy de mensagem enviada)`);
  console.log(` - Taxa de Conversão      : \x1b[35m${conversionRate}%\x1b[0m (clique / visualização)\n`);

  console.log('\x1b[33m%s\x1b[0m', '🏥 2. INTERESSE POR ESPECIALIDADE');
  const specialties = {};
  events.forEach(e => { specialties[e.specialty] = (specialties[e.specialty] || 0) + 1; });
  Object.keys(specialties).forEach(spec => {
    console.log(` - ${spec.padEnd(25)}: ${specialties[spec]} evento(s)`);
  });

  console.log('\n\x1b[33m%s\x1b[0m', '🎯 3. BOTÕES MAIS CLICADOS (ORIGEM DA CONVERSÃO)');
  const buttons = {};
  waClicks.forEach(c => { buttons[c.button_location || 'Desconhecido'] = (buttons[c.button_location || 'Desconhecido'] || 0) + 1; });
  if (Object.keys(buttons).length > 0) {
    Object.keys(buttons).forEach(loc => console.log(` - Botão [${loc.padEnd(15)}]: \x1b[32m${buttons[loc]} clique(s)\x1b[0m`));
  } else {
    console.log(' - Nenhum clique no WhatsApp registrado no período.');
  }

  console.log('\n\x1b[33m%s\x1b[0m', '🌐 4. ORIGEM DOS VISITANTES (CAMPANHAS E REFERRER)');
  const sources = {};
  events.forEach(e => {
    const src = e.utms?.source || e.referer || 'Direto / Orgânico';
    sources[src] = (sources[src] || 0) + 1;
  });
  Object.keys(sources).forEach(src => console.log(` - ${src.padEnd(30)}: ${sources[src]} acesso(s)`));

  console.log('\n\x1b[33m%s\x1b[0m', '📢 5. CLICKS POR CAMPANHA & ESPECIALIDADE');
  const byCampaign = {};
  const cell = {};
  waClicks.forEach(c => {
    const key = `${c.utms?.campaign || c.utms?.source || 'Direto / Orgânico'}`;
    const spec = c.specialty || 'Geral';
    const row = byCampaign[key] = byCampaign[key] || {};
    row[spec] = (row[spec] || 0) + 1;
    cell[key] = true;
  });
  if (Object.keys(cell).length > 0) {
    Object.keys(byCampaign).forEach(cam => {
      console.log(` - ${cam.padEnd(30)}: ${JSON.stringify(byCampaign[cam])}`);
    });
  } else {
    console.log(' - Nenhum clique registrado no período.');
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

    if (data.summary && Array.isArray(data.events)) {
      if (data.events.length === 0) {
        console.log('\x1b[33m%s\x1b[0m', 'ℹ️  Nenhum evento registrado no período ainda.');
        console.log(' Os eventos coletados são persistidos de forma durável (Netlify Blobs) e');
        console.log(' este relatório consulta a API de produção.\n');
      } else {
        printSections(data.events, `últimos ${data.window_days} dias (gerado em ${new Date(data.generated_at).toLocaleString('pt-BR')})`);
      }
    } else {
      throw new Error('Resposta inesperada da API de insights.');
    }
  } catch (err) {
    // Fallback: log local (modo desenvolvimento)
    const logFile = path.join(__dirname, '../logs/access-events.json');
    if (fs.existsSync(logFile)) {
      console.log('\x1b[33m%s\x1b[0m', `⚠️  Falha ao consultar API (${err.message}). Usando log local:\n`);
      const events = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      printSections(events, 'log local');
    } else {
      console.log('\x1b[31m❌ Não foi possível consultar dados de produção:\x1b[0m', err.message);
      console.log('\x1b[33m%s\x1b[0m', '\n Dicas:');
      console.log('  - Verifique a conexão e o domínio em ACCESS_INSIGHTS_URL.');
      console.log('  - Confirme se a função `.netlify/functions/insights` está publicada.');
    }
  }
}

main();
