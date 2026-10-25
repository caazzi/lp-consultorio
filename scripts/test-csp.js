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
  "dispara evento message_sent no gtag": /sendGtagConversion\(['"]message_sent['"]/.test(jsContent),
  "dispara no DataLayer (message_sent)": /event['"]\s*:\s*['"]message_sent['"]/.test(jsContent),
  "beacon de log com message_sent": jsContent.includes("event_type: 'message_sent'"),
  "detecta pagehide com rodada de clique": jsContent.includes('clickGeneration') && jsContent.includes('addEventListener(\'pagehide\''),
  // Regressão: message_sent NÃO pode exceder whatsapp_click. Cada rodada de
  // clique só emite uma vez (consumo atômico antes de qualquer trabalho), senão
  // pagehide + visibilitychange disparavam em duplicidade na mesma saída.
  "consome rodada de clique atomicamente": /clickGeneration === consumedGeneration\)\s*return;[\s\S]{0,40}consumedGeneration = clickGeneration;/.test(jsContent),
  // Regressão: a rodada é armada no PRÓPRIO handler de click do botão (mesma
  // origem do whatsapp_click). O listener global de pointerdown gerava
  // message_sent órfão (sem whatsapp_click correspondente).
  "rodada armada no click do botão": /button\.addEventListener\('click'[\s\S]{0,200}clickGeneration \+= 1;[\s\S]{0,40}trackWhatsAppClick\(/.test(jsContent),
  "não usa pointerdown para armar proxy": !jsContent.includes("addEventListener('pointerdown'") || !/pointerdown[\s\S]{0,120}clickGeneration/.test(jsContent)
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
  "anexa gclid ao link": jsContent.includes("'gclid'") && /gclid: getParamFromStorage\('gclid'\)/.test(jsContent),
  "envia campaign_id no evento generate_lead": jsContent.includes("'campaign_id': utms.campaign"),
  "anexa UTMs ao href do elemento clicado": jsContent.includes('.href = buildWhatsAppUrlWithUtm(')
};
Object.keys(utmChecks).forEach(k => {
  if (utmChecks[k]) console.log(`  ✅ ${k}`);
  else { console.error(`  ❌ ${k}`); hasErrors = true; }
});

// 6b. Validar enriquecimento de atribuição dos eventos de conversão no gtag.
// generate_lead e message_sent devem carregar gclid/gbraid/wbraid/gad_campaignid
// para permitir cruzar a conversão por campanha no GA4 sem depender apenas do
// beacon first-party. gbraid/wbraid cobrem tráfego pago de iOS (sem gclid).
const enrichmentChecks = {
  "generate_lead envia gad_campaignid": /sendGtagConversion\(['"]generate_lead['"][\s\S]*?'gad_campaignid':/.test(jsContent),
  "generate_lead envia gclid": /sendGtagConversion\(['"]generate_lead['"][\s\S]*?'gclid':/.test(jsContent),
  "generate_lead envia gbraid": /sendGtagConversion\(['"]generate_lead['"][\s\S]*?'gbraid':/.test(jsContent),
  "generate_lead envia wbraid": /sendGtagConversion\(['"]generate_lead['"][\s\S]*?'wbraid':/.test(jsContent),
  "generate_lead envia time_on_page_sec": /sendGtagConversion\(['"]generate_lead['"][\s\S]*?'time_on_page_sec':/.test(jsContent),
  "message_sent envia gad_campaignid": /sendGtagConversion\(['"]message_sent['"][\s\S]*?'gad_campaignid':/.test(jsContent),
  "message_sent envia gclid": /sendGtagConversion\(['"]message_sent['"][\s\S]*?'gclid':/.test(jsContent),
  "message_sent envia gbraid": /sendGtagConversion\(['"]message_sent['"][\s\S]*?'gbraid':/.test(jsContent),
  "message_sent envia wbraid": /sendGtagConversion\(['"]message_sent['"][\s\S]*?'wbraid':/.test(jsContent),
  // Regressão: gbraid/wbraid (iOS) precisam ser PERSISTIDOS na sessionStorage.
  // Antes só gclid era gravado, então o tráfego pago de iOS chegava sem atribuição.
  "gbraid persistido na sessionStorage": /const utms = \[[\s\S]*?'gbraid'[\s\S]*?\];/.test(jsContent) && jsContent.includes("sessionStorage.setItem(param"),
  "wbraid persistido na sessionStorage": /const utms = \[[\s\S]*?'wbraid'[\s\S]*?\];/.test(jsContent),
  "gbraid/wbraid lidos via getParamFromStorage": /gbraid: getParamFromStorage\('gbraid'\)/.test(jsContent) && /wbraid: getParamFromStorage\('wbraid'\)/.test(jsContent),
  // Regressão: gad_campaignid NÃO pode usar gad_source como fallback. gad_source
  // carrega o literal "1" (marcador de origem, não id de campanha); usá-lo como
  // fallback corromperia a atribuição (o id precisa casar com CAMPAIGN_LABELS).
  "gad_campaignid não cai em gad_source": !/getParamFromStorage\(\s*['"]gad_campaignid['"]\s*,\s*['"]gad_source['"]/.test(jsContent)
};
Object.keys(enrichmentChecks).forEach(k => {
  if (enrichmentChecks[k]) console.log(`  ✅ ${k}`);
  else { console.error(`  ❌ ${k}`); hasErrors = true; }
});

// 6c. Separação conversão x produto.
// - Web Vitals NÃO podem voltar como RUM no GA4: viraram gate de CI
//   (.github/workflows/perf.yml). RUM disparava web_vitals_* a cada
//   layout-shift/entrada de LCP e poluía a contagem de eventos do GA4.
// - scroll_depth é INSIGHT DE PRODUTO: vai ao first-party (Blobs), nunca ao
//   dataLayer morto nem ao funil de conversão.
const separationChecks = {
  "sem RUM de web_vitals no site": !/web_vitals_|core_web_vitals|initRUMPerformance/.test(jsContent),
  "scroll_depth enviado ao first-party": /sendLogBeacon\(\{[\s\S]{0,120}event_type: 'scroll_depth'/.test(jsContent),
  "scroll_depth fora do dataLayer": !/dataLayer\.push\(\{[^}]*'event': 'scroll_depth'/.test(jsContent)
};
Object.keys(separationChecks).forEach(k => {
  if (separationChecks[k]) console.log(`  ✅ ${k}`);
  else { console.error(`  ❌ ${k}`); hasErrors = true; }
});

// campaign_id configurado no gtag config, agora centralizado no tracking.js
// (config deferred), NÃO mais duplicado inline em cada página HTML.
const trackingDeferredOk = jsContent.includes('gtag(\'set\', { campaign_id: \'\' })')
  && jsContent.includes('send_page_view')
  && (jsContent.includes('function injectGtagAndConfigure(') || jsContent.includes('injectGtagAndConfigure'))
  && (jsContent.includes('ensureGtagLoaded') && jsContent.includes('function sendGtagConversion('));
if (trackingDeferredOk) {
  console.log('  ✅ tracking.js centraliza gtag config deferred (campaign_id + send_page_view)');
} else {
  console.error('  ❌ tracking.js não centraliza a config deferred do gtag.');
  hasErrors = true;
}

// O gtag só pode ser injetado por GESTO do usuário. Um fallback por ociosidade
// (requestIdleCallback/setTimeout pós-load) disparava o timeout em páginas
// ocupadas e injetava o gtag dentro da janela do TBT (~1.2s de long task),
// derrubando o gate de Web Vitals. ensureGtagLoaded cobre o clique direto.
const gtagGestureOnly =
  !/requestIdleCallback/.test(jsContent) &&
  !/scheduleIdle/.test(jsContent) &&
  jsContent.includes("armDeferredGtag") &&
  jsContent.includes("'pointerdown'") &&
  jsContent.includes("ensureGtagLoaded");
if (gtagGestureOnly) {
  console.log('  ✅ gtag carrega só por gesto (sem fallback idle/timeout); ensureGtagLoaded cobre clique direto');
} else {
  console.error('  ❌ tracking.js voltou a carregar gtag por ociosidade (requestIdleCallback/timeout).');
  hasErrors = true;
}
trackingPages.forEach(page => {
  const pagePath = path.join(publicDir, page);
  const pageContent = fs.readFileSync(pagePath, 'utf8');
  // Refactor: páginas NÃO devem mais carregar bloco gtag inline eager.
  const hasInlineEager = pageContent.includes('googletagmanager.com/gtag/js');
  if (!hasInlineEager && pageContent.includes('assets/js/tracking.js')) {
    console.log(`  ✅ ${page}: sem gtag inline eager; rastreamento via tracking.js (deferred)`);
  } else {
    console.error(`  ❌ ${page}: gtag inline eager ainda presente (ou tracking.js ausente)`);
    hasErrors = true;
  }
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
  const logPersistsViaStore = logFn.includes('../access-store') && logFn.includes('getStoreInstance(') && logFn.includes('setJSON');
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

// 8. Validar canonicalização server-side (fonte atribuição limpa p/ métricas honestas)
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '🧮 8. VALIDAÇÃO DA CANONICALIZAÇÃO DE ATRIBUIÇÃO (access-store)');
const accessStorePath = path.join(__dirname, '../netlify/access-store.js');
if (!fs.existsSync(accessStorePath)) {
  console.error('\x1b[31m❌ access-store.js não encontrado para validar canonicalização.\x1b[0m');
  hasErrors = true;
} else {
  const storeSrc = fs.readFileSync(accessStorePath, 'utf8');
  const hasHelpers = ['CAMPAIGN_LABELS', 'canonicalSourceFromEvent', 'resolveCampaignLabelFromEvent', 'isPreviewReferer']
    .every(name => storeSrc.includes(name) && storeSrc.includes(`module.exports`));
  if (hasHelpers) console.log('  ✅ access-store expõe CAMPAIGN_LABELS + helpers canonicos');
  else { console.error('  ❌ access-store está sem os helpers canonicos exigidos'); hasErrors = true; }

  // Comportamento das funções contra amostras realistas.
  const access_store = (() => {
    try { return require(accessStorePath); } catch { return null; }
  })();

  if (access_store && typeof access_store.canonicalSourceFromEvent === 'function') {
    const cases = [
      // { desc, event, expected }
      { d: 'utm source presente vence', e: { utms: { source: 'google' } }, want: 'google' },
      { d: 'referer c/ gclid normaliza p/ Direto', e: { utms: {}, referer: 'https://consultoriosalustiano.com.br/?gad_source=1&gclid=CjwKCAjwwL_UBhAjEiwAEhuT5MEGw44TZX0p_YCaCyMXxuiO3Mzbd720eFEb8EuhP8vrlZlASHDyQBoCB-sQAvD_BwE' }, want: 'Direto / Orgânico' },
      { d: 'referer do própio domínio c/ campanha conhecida (infectio) => label', e: { utms: {}, referer: 'https://consultoriosalustiano.com.br/?gad_source=1&gad_campaignid=23071806673&gclid=CjwKCAjwwL_UBhAjEqFhuT5MEGw44TZX0p_YCaCyMXxuiO3Mzbd720eFEb8EuhP8vrlZlASHDyQBoCB-sQAvD_BwE' }, want: 'Infectologia' },
      { d: 'referer do própio domínio c/ campanha desconhecida => Direto', e: { utms: {}, referer: 'https://consultoriosalustiano.com.br/?gad_source=1&gad_campaignid=999999999&gclid=CjwKCAjwwL_UBhAjEqFhuT5MqFmyQ0u7ftGnzKhgG5SglndoDMQpN8jYH8sqE8Jf6gJXPvmPGLSEb1BBnQBh1NIBOPf_3' }, want: 'Direto / Orgânico' },
      { d: 'referer externo (google) canonical host', e: { utms: {}, referer: 'https://www.google.com/url?q=x' }, want: 'google.com' },
      { d: 'sem fonte nem referer vira Direto', e: { utms: {} }, want: 'Direto / Orgânico' },
      { d: 'referer de deploy-preview vira __preview__', e: { utms: {}, referer: 'https://6a9c6783f3e5a60008061801--consultorio-salustiano.netlify.app/' }, want: '__preview__' }
    ];
    cases.forEach((c) => {
      const got = access_store.canonicalSourceFromEvent(c.e);
      if (got === c.want) console.log(`  ✅ canonicalSourceFromEvent: ${c.d}`);
      else { console.error(`  ❌ canonicalSourceFromEvent: ${c.d} → '${got}' (esperado '${c.want}')`); hasErrors = true; }
    });

    // Campanha legível a partir do campanha id conhecido.
    if (typeof access_store.resolveCampaignLabelFromEvent === 'function') {
      const labelGot = access_store.resolveCampaignLabelFromEvent({ utms: { gad_campaignid: '23071806673' } });
      if (labelGot === 'Infectologia') console.log('  ✅ resolveCampaignLabelFromEvent mapeia 23071806673 → Infectologia');
      else { console.error(`  ❌ resolveCampaignLabelFromEvent → '${labelGot}'`); hasErrors = true; }
    }
    if (typeof access_store.resolveCampaignLabelFromEvent === 'function') {
      // Referer fallback: evento downstream sem utms.gad_campaignid recupera via referer.
      const viaReferer = access_store.resolveCampaignLabelFromEvent({
        utms: {},
        referer: 'https://consultoriosalustiano.com.br/?gad_source=1&gad_campaignid=23747859815&gclid=CjwKCAjwwL_UBhAjEqFhuT5MeLP0R79SnJj6XqLxF9aJ5B3jGV0TvAEdA93blXtV04XfNXB3Cc6O0bBnQBh1NIBOPf_3'
      });
      if (viaReferer === 'Cardiologia') console.log('  ✅ resolveCampaignLabelFromEvent recupera 23747859815 via referer → Cardiologia');
      else { console.error(`  ❌ resolveCampaignLabelFromEvent (referer) → '${viaReferer}'`); hasErrors = true; }
      // id desconhecido via referer não deve vazar / rotular; cai em Direto.
      const unknownRef = access_store.resolveCampaignLabelFromEvent({
        utms: {},
        referer: 'https://consultoriosalustiano.com.br/?gad_source=1&gad_campaignid=1111111111&gclid=CjwKCAjwwL_UBhAjEqFhuT5MqBqx5W3jhdN0z5GiP7vG2yUaRx7WfY80Hs0cO5rQ8yRGXmVGS2If0xBBnQBh1NIBOPf_3'
      });
      if (unknownRef === 'Direto / Orgânico') console.log('  ✅ resolveCampaignLabelFromEvent: referer c/ campanha desconhecida → Direto (raw id não vaza)');
      else { console.error(`  ❌ resolveCampaignLabelFromEvent (ref unknown) → '${unknownRef}'`); hasErrors = true; }
    }
    if (typeof access_store.isPreviewReferer === 'function') {
      const isPrev = access_store.isPreviewReferer('https://6a9c5b87a4aefe0009462a09--consultorio-salustiano.netlify.app/');
      const notPrev = !access_store.isPreviewReferer('https://consultoriosalustiano.com.br/');
      if (isPrev && notPrev) console.log('  ✅ isPreviewReferer classifica dev-preview vs produção');
      else { console.error('  ❌ isPreviewReferer falhou no host'); hasErrors = true; }
    } else {
      console.error('  ❌ isPreviewReferer ausente'); hasErrors = true;
    }
  } else {
    console.error('\x1b[31m❌ Não foi possível carregar access-store para testes comportamentais.\x1b[0m');
    hasErrors = true;
  }

  // insights.js usa os helpers (atribuição server-side, não referer cru)
  const insPath = path.join(__dirname, '../netlify/functions/insights.js');
  if (fs.existsSync(insPath)) {
    const insSrc = fs.readFileSync(insPath, 'utf8');
    const usesHelpers = insSrc.includes('canonicalSourceFromEvent') && insSrc.includes('resolveCampaignLabelFromEvent') && insSrc.includes('isPreviewEvent');
    const noRawReferer = !/e\.referer\s*\|/.test(insSrc); // não deve agrupar por referer cru diretamente
    if (usesHelpers) console.log('  ✅ insights.js agrega via helpers canonicos (sem referer cru)');
    else { console.error('  ❌ insights.js não usa os helpers canonicos'); hasErrors = true; }
    if (noRawReferer) console.log('  ✅ insights.js não cai em raw referer para grouping');
    else { console.error('  ❌ insights.js ainda usa e.referer cru no grouping'); hasErrors = true; }
    // insights.js must also consume the shared visitor-key helper (DRY) and expose
    // the additive estimated_visitors total.
    const usesVisitorKey = insSrc.includes('deriveVisitorGroupKey');
    const exposesEstimate = insSrc.includes('estimated_visitors');
    if (usesVisitorKey && exposesEstimate) {
      console.log('  ✅ insights.js usa deriveVisitorGroupKey e expõe estimated_visitors (additivo)');
    } else {
      console.error('  ❌ insights.js não consome deriveVisitorGroupKey / estimated_visitors');
      hasErrors = true;
    }
  }

  // Visitor-grouping behavior — single DRY source (access-store.deriveVisitorGroupKey)
  // consumed both by insights.js and the local CLI fallback. These tests pin the
  // weak/bounded contract: same ip+UA+window => same key; other signals differ.
  if (access_store && typeof access_store.deriveVisitorGroupKey === 'function') {
    console.log('\n\x1b[33m%s\x1b[0m', '🔗 9. VALIDAÇÃO DO AGRUPAMENTO DE VISITANTES (weak/bounded, server-side)');
    const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120';
    const mk = (ip, ua, tm) => ({ ip, user_agent: ua, timestamp: tm });
    const sameDayLater = mk('1.2.3.4', UA, '2026-09-06T18:30:00Z');
    const visChecks = [
      { d: 'mesmos ip+UA+janela => mesma chave', wantSame: mk('1.2.3.4', UA, '2026-09-06T10:00:00Z'), compare: sameDayLater, same: true },
      { d: 'mesmo ip, UA diferente => chave diferente', wantDiff: mk('1.2.3.4', 'Mozilla/5.0 (iPhone; OS 17_0)', '2026-09-06T10:05:00Z'), compare: sameDayLater, same: false },
      { d: 'same UA, ip diferente => chave diferente', wantDiff: mk('5.6.7.8', UA, '2026-09-06T10:10:00Z'), compare: sameDayLater, same: false },
      { d: 'fora da janela (2 dias) => chave diferente (não durável)', wantDiff: mk('1.2.3.4', UA, '2026-09-08T10:00:00Z'), compare: sameDayLater, same: false }
    ];
    const baseKey = access_store.deriveVisitorGroupKey(sameDayLater);
    visChecks.forEach(c => {
      const keyThatShouldEqual = c.wantSame ? access_store.deriveVisitorGroupKey(c.wantSame) : access_store.deriveVisitorGroupKey(c.wantDiff);
      const okSame = c.same ? (keyThatShouldEqual === baseKey) : (keyThatShouldEqual !== baseKey);
      if (okSame) console.log(`  ✅ deriveVisitorGroupKey: ${c.d}`);
      else { console.error(`  ❌ deriveVisitorGroupKey: ${c.d}`); hasErrors = true; }
    });
    // null-safety: missing identity must not be collapsed into a shared key
    if (access_store.deriveVisitorGroupKey({ user_agent: UA, timestamp: '2026-09-06T10:00:00Z' }) === null
      && access_store.deriveVisitorGroupKey({ ip: '1.2.3.4', timestamp: '2026-09-06T10:00:00Z' }) === null
      && access_store.deriveVisitorGroupKey({ ip: '1.2.3.4', user_agent: UA }) === null) {
      console.log('  ✅ deriveVisitorGroupKey retorna null c/ ip/UA/timestamp ausentes (não colapsa)');
    } else {
      console.error('  ❌ deriveVisitorGroupKey deveria retornar null com inputs ausentes');
      hasErrors = true;
    }
    // determinism + opacity (sha256 digest, no raw ip/ua prefix)
    const g = access_store.deriveVisitorGroupKey(sameDayLater);
    const deterministic = access_store.deriveVisitorGroupKey(sameDayLater) === g;
    const opaque = /^[0-9a-f]{32}$/.test(g);
    if (deterministic && opaque) console.log('  ✅ chave determinística e opaca (digest 32 hex, sem ip/UA crus)');
    else { console.error('  ❌ chave não determinística ou não opaca'); hasErrors = true; }
  } else {
    console.error('\x1b[31m❌ access-store não expõe deriveVisitorGroupKey.\x1b[0m');
    hasErrors = true;
  }

  // Manual smoke-test detection (TESTGCLID) — read-side split so QA events that
  // reached production never enter the reported funnel. Exact-marker match only:
  // real gclids never contain TEST, so there is no false-positive risk.
  if (access_store && typeof access_store.isTestEvent === 'function') {
    console.log('\n\x1b[33m%s\x1b[0m', '🚫 10. VALIDAÇÃO DA EXCLUSÃO DE SMOKE TEST (TESTGCLID)');
    const REAL_GCLID = 'CjwKCAjw-rTUBhAjEiwAEhuT5MEGw44TZX0p_YCaCyMXxuiO3Mzbd720eFEb8EuhP8vrlZlASHDyQBoCB-sQAvD_BwE';
    const testCases = [
      { d: 'utms.gclid TESTGCLID_infecto => teste', e: { utms: { gclid: 'TESTGCLID_infecto' } }, want: true },
      { d: 'utms.gclid TESTGCLID_cardio => teste', e: { utms: { gclid: 'TESTGCLID_cardio' } }, want: true },
      { d: 'referer com gclid=TEST => teste', e: { utms: {}, referer: 'https://consultoriosalustiano.com.br/?gad_source=1&gad_campaignid=TEST&gclid=TEST' }, want: true },
      { d: 'path com marcador => teste', e: { utms: {}, path: '/?gclid=TESTGCLID_infecto' }, want: true },
      { d: 'gclid real NÃO é teste', e: { utms: { gclid: REAL_GCLID } }, want: false },
      { d: 'campanha real (23071806673) NÃO é teste', e: { utms: { gad_campaignid: '23071806673' } }, want: false },
      { d: 'evento vazio NÃO é teste', e: {}, want: false },
      { d: 'null NÃO é teste', e: null, want: false }
    ];
    testCases.forEach(c => {
      const got = access_store.isTestEvent(c.e);
      if (got === c.want) console.log(`  ✅ isTestEvent: ${c.d}`);
      else { console.error(`  ❌ isTestEvent: ${c.d} → ${got} (esperado ${c.want})`); hasErrors = true; }
    });

    // insights.js must consume the shared predicate and expose the additive bucket.
    const insSrc2 = fs.readFileSync(path.join(__dirname, '../netlify/functions/insights.js'), 'utf8');
    if (insSrc2.includes('isTestEvent') && insSrc2.includes('test_traffic')) {
      console.log('  ✅ insights.js exclui teste do funil e expõe test_traffic (aditivo)');
    } else {
      console.error('  ❌ insights.js não consome isTestEvent / test_traffic');
      hasErrors = true;
    }
  } else {
    console.error('\x1b[31m❌ access-store não expõe isTestEvent.\x1b[0m');
    hasErrors = true;
  }
}

// 11. Coleta de eventos do store — o gargalo que derrubou o relatório semanal.
// Regressão (2026-10): o leitor listava TODAS as chaves e fazia um `get` sequencial
// por chave, custando O(histórico). Com ~718 blobs isso passou de 30 s e a função
// `insights` começou a responder 504 (Netlify), matando o job do email. O contrato
// agora tem dois invariantes testáveis: (a) chaves fora da janela NÃO são buscadas;
// (b) as leituras acontecem em paralelo, mas com limite.
async function checkCollectEvents() {
  console.log('\n\x1b[33m%s\x1b[0m', '📦 11. VALIDAÇÃO DA COLETA DE EVENTOS (janela + concorrência limitada)');
  const as = require(path.join(__dirname, '../netlify/access-store.js'));

  if (typeof as.collectEvents !== 'function' || typeof as.keyTimestampMs !== 'function') {
    console.error('  ❌ access-store não expõe collectEvents/keyTimestampMs');
    hasErrors = true;
    return;
  }

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const NOW = Date.parse('2026-10-25T12:00:00.000Z');
  const DAYS = 7;
  const sinceMs = NOW - DAYS * DAY;

  // 300 eventos a cada 6h (~75 dias de histórico) + 1 chave de formato legado.
  const keys = [];
  for (let i = 0; i < 300; i += 1) {
    const ts = new Date(NOW - i * 6 * HOUR).toISOString();
    keys.push(`event/${ts}_${String(i).padStart(8, '0')}`);
  }
  const keyTs = (key) => {
    const m = /^event\/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/.exec(key);
    return m ? Date.parse(m[1]) : null;
  };
  const expectedKeys = keys.filter((k) => keyTs(k) === null || keyTs(k) >= sinceMs);
  // Chave sem timestamp reconhecível: precisa ser buscada (decisão é pelo corpo).
  keys.push('event/legacy-import-0001');
  expectedKeys.push('event/legacy-import-0001');
  // Blob ilegível dentro da janela: conta como falha, não derruba a coleta.
  const brokenKey = `event/${new Date(NOW - HOUR).toISOString()}_broken`;
  keys.push(brokenKey);
  expectedKeys.push(brokenKey);

  const state = { gets: 0, inFlight: 0, maxInFlight: 0 };
  const store = {
    // `list` devolve fora de ordem de propósito: o coletor não pode depender disso.
    async list() { return { blobs: keys.slice().reverse().map((key) => ({ key })) }; },
    async get(key) {
      state.gets += 1;
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      state.inFlight -= 1;
      if (key === brokenKey) throw new Error('blob indisponível');
      return {
        timestamp: keyTs(key) === null ? new Date(NOW - 2 * HOUR).toISOString() : key.slice(6, 30),
        event_type: 'page_view'
      };
    }
  };

  const res = await as.collectEvents(store, sinceMs);

  // (a) só a janela é buscada — o histórico antigo custa zero `get`.
  if (state.gets === expectedKeys.length) {
    console.log(`  ✅ collectEvents busca apenas a janela: ${state.gets} gets para ${keys.length} chaves (7d)`);
  } else {
    console.error(`  ❌ collectEvents fez ${state.gets} gets; esperado ${expectedKeys.length} (chaves na janela)`);
    hasErrors = true;
  }

  // (b) paralelismo limitado (nunca sequencial nem ilimitado).
  if (state.maxInFlight > 1 && state.maxInFlight <= 32) {
    console.log(`  ✅ leituras paralelas com limite: pico de ${state.maxInFlight} gets simultâneos (cap 32)`);
  } else {
    console.error(`  ❌ pico de concorrência fora do contrato: ${state.maxInFlight} (esperado 2..32)`);
    hasErrors = true;
  }

  // (c) blob ilegível não derruba o relatório; é contabilizado.
  if (res.failed === 1 && res.events.length === expectedKeys.length - 1) {
    console.log('  ✅ blob ilegível é contabilizado (failed=1) sem perder os demais eventos');
  } else {
    console.error(`  ❌ falha de blob mascarada: failed=${res.failed}, eventos=${res.events.length} (esperado 1 e ${expectedKeys.length - 1})`);
    hasErrors = true;
  }

  // (d) chave de formato legado não é descartada pelo filtro.
  const legacyIncluded = res.events.some((e) => e && e.timestamp === new Date(NOW - 2 * HOUR).toISOString());
  if (legacyIncluded) console.log('  ✅ chave com formato legado é buscada e decidida pelo corpo');
  else { console.error('  ❌ chave com formato legado foi descartada pelo filtro de janela'); hasErrors = true; }

  // (e) ordem cronológica preservada (o email compara semanas).
  const times = res.events.map((e) => Date.parse(e.timestamp));
  const sorted = times.every((t, i) => i === 0 || times[i - 1] <= t);
  if (sorted) console.log('  ✅ eventos retornados em ordem cronológica');
  else { console.error('  ❌ eventos fora de ordem cronológica'); hasErrors = true; }

  // (f) janela menor custa menos leituras (o custo acompanha a janela, não o histórico).
  const state1 = { gets: 0 };
  const store1 = {
    async list() { return { blobs: keys.map((key) => ({ key })) }; },
    async get(key) {
      state1.gets += 1;
      return { timestamp: keyTs(key) === null ? new Date(NOW - 2 * HOUR).toISOString() : key.slice(6, 30) };
    }
  };
  await as.collectEvents(store1, NOW - 1 * DAY);
  if (state1.gets > 0 && state1.gets < state.gets) {
    console.log(`  ✅ custo proporcional à janela: 1d = ${state1.gets} gets vs 7d = ${state.gets}`);
  } else {
    console.error(`  ❌ custo não acompanha a janela: 1d=${state1.gets}, 7d=${state.gets}`);
    hasErrors = true;
  }

  // (g) chave malformada não vira timestamp válido (nunca inclui lixo na janela).
  if (as.keyTimestampMs('event/legacy-import-0001') === null
    && typeof as.keyTimestampMs(`event/${new Date(NOW).toISOString()}_x`) === 'number') {
    console.log('  ✅ keyTimestampMs: ISO parseia, formato desconhecido => null');
  } else {
    console.error('  ❌ keyTimestampMs não distingue chave ISO de chave legada');
    hasErrors = true;
  }

  // (h) guarda estática: insights.js NÃO pode voltar ao scan sequencial completo.
  const insSrc = fs.readFileSync(path.join(__dirname, '../netlify/functions/insights.js'), 'utf8');
  const usesCollector = insSrc.includes('collectEvents');
  const noSequentialScan = !/for\s*\(\s*const\s*\{?\s*key\s*\}?\s*of\s+blobs/.test(insSrc);
  if (usesCollector && noSequentialScan) {
    console.log('  ✅ insights.js usa collectEvents (sem varredura sequencial de todos os blobs)');
  } else {
    console.error('  ❌ insights.js voltou a varrer o store sequencialmente (regressão de timeout)');
    hasErrors = true;
  }

  // (i) paginação: `list()` SEM `paginate` devolve uma única página (1000 chaves) e
  // truncaria o histórico em silêncio — o store já está em ~718 e cresce ~130/semana.
  const pageKeys = [];
  for (let i = 0; i < 5; i += 1) pageKeys.push(`event/${new Date(NOW - i * HOUR).toISOString()}_p${i}`);
  const pageStore = {
    list() {
      const pages = [pageKeys.slice(0, 2), pageKeys.slice(2, 4), pageKeys.slice(4)];
      return (async function* pages_() {
        for (const page of pages) yield { blobs: page.map((key) => ({ key })) };
      })();
    },
    async get(key) { return { timestamp: key.slice(6, 30), event_type: 'page_view' }; }
  };
  const paged = await as.collectEvents(pageStore, NOW - 1 * DAY);
  if (paged.scanned === 5 && paged.events.length === 5) {
    console.log('  ✅ listagem paginada: segue todas as páginas (nada truncado na 1ª página)');
  } else {
    console.error(`  ❌ paginação truncada: scanned=${paged.scanned}, eventos=${paged.events.length} (esperado 5/5)`);
    hasErrors = true;
  }
}

// 12. Política de retry do cliente `insights` (scripts/lib/insights-api.js).
// Um 5xx transitório do provedor não pode custar a semana de relatório; um 4xx
// é bug de chamada e deve falhar na hora (repetir só atrasa o diagnóstico).
// Testado com um servidor local em loopback — a suíte continua offline.
async function checkInsightsRetry() {
  console.log('\n\x1b[33m%s\x1b[0m', '🔁 12. VALIDAÇÃO DO RETRY DO CLIENTE INSIGHTS (transitório vs 4xx)');
  const http = require('http');
  const { fetchInsights } = require(path.join(__dirname, 'lib/insights-api.js'));

  async function withServer(handler, fn) {
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      return await fn(`http://127.0.0.1:${port}/insights`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  // (a) 503 transitório → nova tentativa até dar certo.
  const transient = { hits: 0 };
  await withServer((req, res) => {
    transient.hits += 1;
    if (transient.hits === 1) {
      res.writeHead(503, { 'Content-Type': 'text/html' });
      res.end('<HTML><BODY>Service Unavailable</BODY></HTML>');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ summary: { events: 42 } }));
  }, async (url) => {
    const payload = await fetchInsights(7, { url, backoffMs: [10, 10], timeoutMs: 2000 });
    if (payload.summary.events === 42 && transient.hits === 2) {
      console.log('  ✅ 503 transitório é repetido e o payload é devolvido');
    } else {
      console.error(`  ❌ retry esperado: hits=${transient.hits}, events=${payload && payload.summary && payload.summary.events}`);
      hasErrors = true;
    }
  });

  // (b) 404 NÃO é repetido.
  const notFound = { hits: 0 };
  await withServer((req, res) => {
    notFound.hits += 1;
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }, async (url) => {
    let err = null;
    try {
      await fetchInsights(7, { url, backoffMs: [10, 10], timeoutMs: 2000 });
    } catch (e) {
      err = e;
    }
    if (err && err.status === 404 && notFound.hits === 1) {
      console.log('  ✅ 404 falha de imediato (sem retry), com status preservado');
    } else {
      console.error(`  ❌ 404 deveria falhar na 1ª tentativa: hits=${notFound.hits}, err=${err && err.message}`);
      hasErrors = true;
    }
  });

  // (c) esgotar as tentativas devolve o erro com `.attempts` (o job imprime isso).
  const always = { hits: 0 };
  await withServer((req, res) => {
    always.hits += 1;
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('bad gateway');
  }, async (url) => {
    let err = null;
    try {
      await fetchInsights(7, { url, attempts: 3, backoffMs: [10, 10], timeoutMs: 2000 });
    } catch (e) {
      err = e;
    }
    if (err && err.status === 502 && always.hits === 3 && err.attempts === 3) {
      console.log('  ✅ esgotou 3 tentativas e reportou status/attempts para o log do job');
    } else {
      console.error(`  ❌ retry não esgotou como esperado: hits=${always.hits}, ${err && err.message}`);
      hasErrors = true;
    }
  });
}

(async () => {
  for (const check of [checkCollectEvents, checkInsightsRetry]) {
    try {
      await check();
    } catch (err) {
      console.error(`\x1b[31m❌ ${check.name} falhou com exceção: ${err.message}\x1b[0m`);
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
})();

