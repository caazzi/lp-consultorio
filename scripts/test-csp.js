const fs = require('fs');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', ' 🧪 EXECUTANDO TESTES DE SEGURANÇA E ESTRUTURA ');
console.log('\x1b[36m%s\x1b[0m', '==================================================\n');

let hasErrors = false;

// 1. Validar netlify.toml e CSP
const netlifyTomlPath = path.join(__dirname, '../netlify.toml');
if (!fs.existsSync(netlifyTomlPath)) {
  console.error('\x1b[31m❌ netlify.toml não foi encontrado.\x1b[0m');
  hasErrors = true;
} else {
  const netlifyContent = fs.readFileSync(netlifyTomlPath, 'utf8');
  console.log('✔ netlify.toml encontrado');

  // Testar CSP connect-src
  const requiredConnectDomains = [
    'https://analytics.google.com',
    'https://*.google-analytics.com',
    'https://www.google-analytics.com'
  ];

  const cspMatch = netlifyContent.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
  if (!cspMatch) {
    console.error('\x1b[31m❌ Content-Security-Policy não foi encontrada no netlify.toml.\x1b[0m');
    hasErrors = true;
  } else {
    const cspValue = cspMatch[1];
    console.log('✔ Content-Security-Policy extraída com sucesso');

    const connectSrcMatch = cspValue.match(/connect-src\s+([^;]+);/);
    if (!connectSrcMatch) {
      console.error('\x1b[31m❌ Diretiva connect-src não foi encontrada na CSP.\x1b[0m');
      hasErrors = true;
    } else {
      const connectSrcValue = connectSrcMatch[1];
      requiredConnectDomains.forEach(domain => {
        if (connectSrcValue.includes(domain)) {
          console.log(`  ✅ connect-src permite: ${domain}`);
        } else {
          console.error(`  ❌ connect-src NÃO permite: ${domain}`);
          hasErrors = true;
        }
      });
    }
  }
}

// 2. Validar arquivos HTML principais
const publicDir = path.join(__dirname, '../public');
const requiredPages = ['index.html', 'cardiologia/index.html', '404.html'];

requiredPages.forEach(page => {
  const pagePath = path.join(publicDir, page);
  if (fs.existsSync(pagePath)) {
    console.log(`✔ Página ${page} existe`);
  } else {
    console.error(`❌ Página ${page} não encontrada em public/`);
    hasErrors = true;
  }
});

// 3. Validar rastreamento: data-track-location em todos os botões de WhatsApp
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '🎯 3. VALIDAÇÃO DE RASTREAMENTO GTM / GA4');
const trackingPages = ['index.html', 'cardiologia/index.html'];
trackingPages.forEach(page => {
  const pagePath = path.join(publicDir, page);
  if (!fs.existsSync(pagePath)) return;
  const content = fs.readFileSync(pagePath, 'utf8');
  const waLinks = content.match(/href="https:\/\/api\.whatsapp\.com[^"]*"/g) || [];
  const untracked = waLinks.filter(link => {
    // Verifica se o elemento adjacente tem data-track-location
    const idx = content.indexOf(link);
    const surrounding = content.substring(idx - 100, idx + link.length + 200);
    return !surrounding.includes('data-track-location');
  });
  if (untracked.length > 0) {
    console.error(`\x1b[31m❌ ${page}: ${untracked.length} botão(ões) de WhatsApp sem data-track-location!\x1b[0m`);
    hasErrors = true;
  } else {
    console.log(`✔ ${page}: Todos os botões de WhatsApp possuem data-track-location`);
  }
});

// 4. Validar presença do botão sticky no tracking.js
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '📌 4. VALIDAÇÃO DO BOTÃO WHATSAPP FLUTUANTE (STICKY)');
const trackingJsPath = path.join(__dirname, '../public/assets/js/tracking.js');
if (!fs.existsSync(trackingJsPath)) {
  console.error('\x1b[31m❌ tracking.js não encontrado.\x1b[0m');
  hasErrors = true;
} else {
  const trackingContent = fs.readFileSync(trackingJsPath, 'utf8');
  if (trackingContent.includes('initStickyWhatsApp') && trackingContent.includes('wa-sticky-btn')) {
    console.log('✔ Botão WhatsApp flutuante sticky implementado e rastreado em tracking.js');
  } else {
    console.error('\x1b[31m❌ Botão WhatsApp flutuante sticky ausente em tracking.js!\x1b[0m');
    hasErrors = true;
  }
}

// 5. Validar evento proxy de conversão message_sent no tracking.js
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '✉️  5. VALIDAÇÃO DO EVENTO PROXY message_sent');
const jsContent = fs.readFileSync(trackingJsPath, 'utf8');
const messageSentChecks = {
  "função trackWhatsAppClick exist": jsContent.includes('function trackWhatsAppClick('),
  "dispara evento message_sent no gtag": /gtag\(['"]event['"],\s*['"]message_sent['"]/.test(jsContent),
  "dispara no DataLayer (message_sent)": /event['"]\s*:\s*['"]message_sent['"]/.test(jsContent),
  "beacon de log com message_sent": jsContent.includes("event_type: 'message_sent'"),
  "detecta pagehide com flag de clique": jsContent.includes('pendingWaClick') && jsContent.includes('addEventListener(\'pagehide\'')
};
Object.keys(messageSentChecks).forEach(k => {
  if (messageSentChecks[k]) console.log(`  ✅ ${k}`);
  else { console.error(`  ❌ ${k}`); hasErrors = true; }
});

// 6. Validar passagem de UTMs para o link do WhatsApp e dimensão campaign_id no GA4
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '📡 6. VALIDAÇÃO DE UTMs NO LINK DO WHATSAPP E campaign_id NO GA4');
const utmChecks = {
  "função buildWhatsAppUrlWithUtm existe": jsContent.includes('function buildWhatsAppUrlWithUtm('),
  "anexa gclid ao link": jsContent.includes("'gclid'") && jsContent.includes("sessionStorage.getItem('gclid')"),
  "envia campaign_id no evento generate_lead": jsContent.includes("'campaign_id': utms.campaign"),
  "anexa UTMs ao href do elemento clicado": jsContent.includes('.href = buildWhatsAppUrlWithUtm(')
};
Object.keys(utmChecks).forEach(k => {
  if (utmChecks[k]) console.log(`  ✅ ${k}`);
  else { console.error(`  ❌ ${k}`); hasErrors = true; }
});

// campaign_id configurado no gtag config das duas páginas (dimensão customizada GA4)
trackingPages.forEach(page => {
  const pagePath = path.join(publicDir, page);
  const pageContent = fs.readFileSync(pagePath, 'utf8');
  const hasCampaignDim = /gtag\(['"]set['"],\s*\{[^}]*campaign_id\s*:/.test(pageContent);
  if (hasCampaignDim) console.log(`  ✅ ${page}: campaign_id registrado no gtag set`);
  else { console.error(`  ❌ ${page}: campaign_id ausente no gtag set`); hasErrors = true; }
});

// 7. Validar pipeline durável de logs (Netlify Blobs) e endpoint de insights
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '🗄️  7. VALIDAÇÃO DO PIPELINE DE LOGS DURÁVEL (NETLIFY BLOBS)');
const pipeChecks = [
  { file: path.join(__dirname, '../netlify/access-store.js'), label: 'helper access-store.js existe' },
  { file: path.join(__dirname, '../netlify/functions/insights.js'), label: 'função insights.js existe' },
  { file: path.join(__dirname, '../netlify/functions/log-access.js'), label: 'função log-access.js existe' }
];
pipeChecks.forEach(pc => {
  if (fs.existsSync(pc.file)) console.log(`  ✅ ${pc.label}`);
  else { console.error(`  ❌ ${pc.label}`); hasErrors = true; }
});
if (fs.existsSync(path.join(__dirname, '../netlify/functions/log-access.js'))) {
  const logFn = fs.readFileSync(path.join(__dirname, '../netlify/functions/log-access.js'), 'utf8');
  const helperPath = path.join(__dirname, '../netlify/access-store.js');
  const helperUsesBlobs = fs.existsSync(helperPath) && fs.readFileSync(helperPath, 'utf8').includes('@netlify/blobs');
  const logPersistsViaStore = logFn.includes('../access-store') && logFn.includes('getStoreInstance()') && logFn.includes('setJSON');
  if (helperUsesBlobs && logPersistsViaStore) {
    console.log('  ✅ log-access.js persiste em Netlify Blobs via access-store (setJSON)');
  } else {
    console.error('  ❌ log-access.js não persiste de forma durável em Netlify Blobs (dados serão perdidos ao redeployar!)');
    hasErrors = true;
  }
}
if (fs.existsSync(path.join(__dirname, '../netlify/functions/insights.js'))) {
  const insFn = fs.readFileSync(path.join(__dirname, '../netlify/functions/insights.js'), 'utf8');
  if (insFn.includes('message_sent') && insFn.includes('conversion_rate')) {
    console.log('  ✅ insights.js agrega message_sent e conversion_rate');
  } else {
    console.error('  ❌ insights.js não agrega as novas conversões');
    hasErrors = true;
  }
}
if (fs.existsSync(path.join(__dirname, '../scripts/fetch-access-insights.js'))) {
  const cli = fs.readFileSync(path.join(__dirname, '../scripts/fetch-access-insights.js'), 'utf8');
  if (cli.includes('message_sent') && cli.includes('.netlify/functions/insights')) {
    console.log('  ✅ CLI consulta a API de insights e exibe message_sent');
  } else {
    console.error('  ❌ CLI não integrada com a API de insights');
    hasErrors = true;
  }
}

console.log('\n--------------------------------------------------');
if (hasErrors) {
  console.error('\x1b[31m❌ ALGUNS TESTES FALHARAM.\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\x1b[32m✅ TODOS OS TESTES PASSARAM COM SUCESSO!\x1b[0m\n');
  process.exit(0);
}
