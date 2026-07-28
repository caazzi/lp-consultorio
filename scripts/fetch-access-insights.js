const fs = require('fs');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '=======================================================');
console.log('\x1b[36m%s\x1b[0m', ' 📊 RELATÓRIO DE ACESSOS E INTENÇÃO DE CONVERSÃO (IDE) ');
console.log('\x1b[36m%s\x1b[0m', '=======================================================\n');

const logFile = path.join(__dirname, '../logs/access-events.json');

if (!fs.existsSync(logFile)) {
  console.log('\x1b[33m%s\x1b[0m', 'ℹ️  Nenhum log de acesso local registrado até o momento.');
  console.log(' O sistema de rastreamento está ativo e pronto para registrar acessos em produção.');
  console.log(' Para gerar um evento de teste local, acesse a página ou dispare o coletor.\n');
  process.exit(0);
}

try {
  const events = JSON.parse(fs.readFileSync(logFile, 'utf8'));
  console.log(`Total de Eventos Registrados: \x1b[32m${events.length}\x1b[0m\n`);

  // Métricas Principais
  const pageViews = events.filter(e => e.event_type === 'page_view');
  const waClicks = events.filter(e => e.event_type === 'whatsapp_click');
  const conversionRate = pageViews.length > 0 ? ((waClicks.length / pageViews.length) * 100).toFixed(1) : 0;

  console.log('\x1b[33m%s\x1b[0m', '📈 1. RESUMO DE CONVERSÃO');
  console.log(` - Visualizações de Página : \x1b[36m${pageViews.length}\x1b[0m`);
  console.log(` - Cliques no WhatsApp    : \x1b[32m${waClicks.length}\x1b[0m`);
  console.log(` - Taxa de Conversão      : \x1b[35m${conversionRate}%\x1b[0m\n`);

  // Distribuição por Especialidade
  console.log('\x1b[33m%s\x1b[0m', '🏥 2. INTERESSE POR ESPECIALIDADE');
  const specialties = {};
  events.forEach(e => {
    specialties[e.specialty] = (specialties[e.specialty] || 0) + 1;
  });
  Object.keys(specialties).forEach(spec => {
    console.log(` - ${spec.padEnd(25)}: ${specialties[spec]} evento(s)`);
  });

  // Botões de Conversão Mais Clicados
  console.log('\n\x1b[33m%s\x1b[0m', '🎯 3. BOTÕES MAIS CLICADOS (ORIGEM DA CONVERSÃO)');
  const buttons = {};
  waClicks.forEach(c => {
    const loc = c.button_location || 'Desconhecido';
    buttons[loc] = (buttons[loc] || 0) + 1;
  });
  if (Object.keys(buttons).length > 0) {
    Object.keys(buttons).forEach(loc => {
      console.log(` - Botão [${loc.padEnd(15)}]: \x1b[32m${buttons[loc]} clique(s)\x1b[0m`);
    });
  } else {
    console.log(' - Nenhum clique no WhatsApp registrado ainda.');
  }

  // Origens de Tráfego (UTMs)
  console.log('\n\x1b[33m%s\x1b[0m', '🌐 4. ORIGEM DOS VISITANTES (CAMPANHAS E REFERRER)');
  const sources = {};
  events.forEach(e => {
    const src = e.utms?.source || e.referer || 'Direto / Orgânico';
    sources[src] = (sources[src] || 0) + 1;
  });
  Object.keys(sources).forEach(src => {
    console.log(` - ${src.padEnd(30)}: ${sources[src]} acesso(s)`);
  });

} catch (err) {
  console.error('Erro ao processar logs:', err.message);
}

console.log('\n\x1b[36m%s\x1b[0m', '-------------------------------------------------------');
console.log('\x1b[36m%s\x1b[0m', ' Dica: Para visualizar este relatório a qualquer momento:');
console.log('\x1b[33m%s\x1b[0m', ' npm run access-logs');
console.log('\x1b[36m%s\x1b[0m', '-------------------------------------------------------\n');
