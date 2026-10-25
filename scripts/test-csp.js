const fs = require('fs');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', ' 🧪 RUNNING SECURITY AND STRUCTURE TESTS ');
console.log('\x1b[36m%s\x1b[0m', '==================================================\n');

let hasErrors = false;

// 1. Validate netlify.toml and the CSP
const netlifyTomlPath = path.join(__dirname, '../netlify.toml');
if (!fs.existsSync(netlifyTomlPath)) {
  console.error('\x1b[31m❌ netlify.toml not found.\x1b[0m');
  hasErrors = true;
} else {
  const netlifyContent = fs.readFileSync(netlifyTomlPath, 'utf8');
  console.log('✔ netlify.toml found');

  // Check the CSP connect-src directive
  const requiredConnectDomains = [
    'https://analytics.google.com',
    'https://*.google-analytics.com',
    'https://www.google-analytics.com'
  ];

  const cspMatch = netlifyContent.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
  if (!cspMatch) {
    console.error('\x1b[31m❌ Content-Security-Policy not found in netlify.toml.\x1b[0m');
    hasErrors = true;
  } else {
    const cspValue = cspMatch[1];
    console.log('✔ Content-Security-Policy extracted');

    const connectSrcMatch = cspValue.match(/connect-src\s+([^;]+);/);
    if (!connectSrcMatch) {
      console.error('\x1b[31m❌ connect-src directive not found in the CSP.\x1b[0m');
      hasErrors = true;
    } else {
      const connectSrcValue = connectSrcMatch[1];
      requiredConnectDomains.forEach(domain => {
        if (connectSrcValue.includes(domain)) {
          console.log(`  ✅ connect-src allows: ${domain}`);
        } else {
          console.error(`  ❌ connect-src does NOT allow: ${domain}`);
          hasErrors = true;
        }
      });
    }
  }
}

// 2. Validate the main HTML files
const publicDir = path.join(__dirname, '../public');
const requiredPages = ['index.html', 'cardiologia/index.html', '404.html'];

requiredPages.forEach(page => {
  const pagePath = path.join(publicDir, page);
  if (fs.existsSync(pagePath)) {
    console.log(`✔ Page ${page} exists`);
  } else {
    console.error(`❌ Page ${page} not found in public/`);
    hasErrors = true;
  }
});

// 3. Validate tracking: data-track-location on every WhatsApp button
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '🎯 3. GTM / GA4 TRACKING VALIDATION');
const trackingPages = ['index.html', 'cardiologia/index.html'];
trackingPages.forEach(page => {
  const pagePath = path.join(publicDir, page);
  if (!fs.existsSync(pagePath)) return;
  const content = fs.readFileSync(pagePath, 'utf8');
  const waLinks = content.match(/href="https:\/\/api\.whatsapp\.com[^"]*"/g) || [];
  const untracked = waLinks.filter(link => {
    // Check whether the adjacent element carries data-track-location
    const idx = content.indexOf(link);
    const surrounding = content.substring(idx - 100, idx + link.length + 200);
    return !surrounding.includes('data-track-location');
  });
  if (untracked.length > 0) {
    console.error(`\x1b[31m❌ ${page}: ${untracked.length} WhatsApp button(s) without data-track-location!\x1b[0m`);
    hasErrors = true;
  } else {
    console.log(`✔ ${page}: every WhatsApp button carries data-track-location`);
  }
});

// 4. Validate the sticky button in tracking.js
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '📌 4. FLOATING (STICKY) WHATSAPP BUTTON VALIDATION');
const trackingJsPath = path.join(__dirname, '../public/assets/js/tracking.js');
if (!fs.existsSync(trackingJsPath)) {
  console.error('\x1b[31m❌ tracking.js not found.\x1b[0m');
  hasErrors = true;
} else {
  const trackingContent = fs.readFileSync(trackingJsPath, 'utf8');
  if (trackingContent.includes('initStickyWhatsApp') && trackingContent.includes('wa-sticky-btn')) {
    console.log('✔ Sticky floating WhatsApp button implemented and tracked in tracking.js');
  } else {
    console.error('\x1b[31m❌ Sticky floating WhatsApp button missing from tracking.js!\x1b[0m');
    hasErrors = true;
  }
}

// 5. Validate the message_sent conversion-proxy event in tracking.js
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '✉️  5. message_sent PROXY EVENT VALIDATION');
const jsContent = fs.readFileSync(trackingJsPath, 'utf8');
const messageSentChecks = {
  "trackWhatsAppClick function exists": jsContent.includes('function trackWhatsAppClick('),
  "fires message_sent on gtag": /sendGtagConversion\(['"]message_sent['"]/.test(jsContent),
  "pushes message_sent to the dataLayer": /event['"]\s*:\s*['"]message_sent['"]/.test(jsContent),
  "log beacon carries message_sent": jsContent.includes("event_type: 'message_sent'"),
  "hooks pagehide with a click round": jsContent.includes('clickGeneration') && jsContent.includes('addEventListener(\'pagehide\''),
  // Regression: message_sent must NOT exceed whatsapp_click. Each click round
  // emits once (atomic consumption before any work); otherwise pagehide +
  // visibilitychange fired twice on the same exit.
  "consumes the click round atomically": /clickGeneration === consumedGeneration\)\s*return;[\s\S]{0,40}consumedGeneration = clickGeneration;/.test(jsContent),
  // Regression: the round is armed in the button's own click handler (same
  // origin as whatsapp_click). The global pointerdown listener produced orphan
  // message_sent events (no matching whatsapp_click).
  "round armed in the button click": /button\.addEventListener\('click'[\s\S]{0,200}clickGeneration \+= 1;[\s\S]{0,40}trackWhatsAppClick\(/.test(jsContent),
  "does not use pointerdown to arm the proxy": !jsContent.includes("addEventListener('pointerdown'") || !/pointerdown[\s\S]{0,120}clickGeneration/.test(jsContent)
};
Object.keys(messageSentChecks).forEach(k => {
  if (messageSentChecks[k]) console.log(`  ✅ ${k}`);
  else { console.error(`  ❌ ${k}`); hasErrors = true; }
});

// 6. Validate UTMs on the WhatsApp link and the campaign_id dimension in GA4
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '📡 6. UTMs ON THE WHATSAPP LINK AND campaign_id IN GA4');
const utmChecks = {
  "buildWhatsAppUrlWithUtm function exists": jsContent.includes('function buildWhatsAppUrlWithUtm('),
  "appends gclid to the link": jsContent.includes("'gclid'") && /gclid: getParamFromStorage\('gclid'\)/.test(jsContent),
  "sends campaign_id on the generate_lead event": jsContent.includes("'campaign_id': utms.campaign"),
  "appends UTMs to the clicked element href": jsContent.includes('.href = buildWhatsAppUrlWithUtm(')
};
Object.keys(utmChecks).forEach(k => {
  if (utmChecks[k]) console.log(`  ✅ ${k}`);
  else { console.error(`  ❌ ${k}`); hasErrors = true; }
});

// 6b. Validate attribution enrichment of the gtag conversion events.
// generate_lead and message_sent must carry gclid/gbraid/wbraid/gad_campaignid so
// the conversion can be crossed by campaign in GA4 without relying on the
// first-party beacon alone. gbraid/wbraid cover paid iOS traffic (no gclid).
const enrichmentChecks = {
  "generate_lead sends gad_campaignid": /sendGtagConversion\(['"]generate_lead['"][\s\S]*?'gad_campaignid':/.test(jsContent),
  "generate_lead sends gclid": /sendGtagConversion\(['"]generate_lead['"][\s\S]*?'gclid':/.test(jsContent),
  "generate_lead sends gbraid": /sendGtagConversion\(['"]generate_lead['"][\s\S]*?'gbraid':/.test(jsContent),
  "generate_lead sends wbraid": /sendGtagConversion\(['"]generate_lead['"][\s\S]*?'wbraid':/.test(jsContent),
  "generate_lead sends time_on_page_sec": /sendGtagConversion\(['"]generate_lead['"][\s\S]*?'time_on_page_sec':/.test(jsContent),
  "message_sent sends gad_campaignid": /sendGtagConversion\(['"]message_sent['"][\s\S]*?'gad_campaignid':/.test(jsContent),
  "message_sent sends gclid": /sendGtagConversion\(['"]message_sent['"][\s\S]*?'gclid':/.test(jsContent),
  "message_sent sends gbraid": /sendGtagConversion\(['"]message_sent['"][\s\S]*?'gbraid':/.test(jsContent),
  "message_sent sends wbraid": /sendGtagConversion\(['"]message_sent['"][\s\S]*?'wbraid':/.test(jsContent),
  // Regression: gbraid/wbraid (iOS) must be PERSISTED in sessionStorage. Before,
  // only gclid was stored, so paid iOS traffic arrived unattributed.
  "gbraid persisted in sessionStorage": /const utms = \[[\s\S]*?'gbraid'[\s\S]*?\];/.test(jsContent) && jsContent.includes("sessionStorage.setItem(param"),
  "wbraid persisted in sessionStorage": /const utms = \[[\s\S]*?'wbraid'[\s\S]*?\];/.test(jsContent),
  "gbraid/wbraid read through getParamFromStorage": /gbraid: getParamFromStorage\('gbraid'\)/.test(jsContent) && /wbraid: getParamFromStorage\('wbraid'\)/.test(jsContent),
  // Regression: gad_campaignid must NOT fall back to gad_source. gad_source carries
  // the literal "1" (a source marker, not a campaign id); using it as a fallback
  // would corrupt attribution (the id has to match CAMPAIGN_LABELS).
  "gad_campaignid does not fall back to gad_source": !/getParamFromStorage\(\s*['"]gad_campaignid['"]\s*,\s*['"]gad_source['"]/.test(jsContent)
};
Object.keys(enrichmentChecks).forEach(k => {
  if (enrichmentChecks[k]) console.log(`  ✅ ${k}`);
  else { console.error(`  ❌ ${k}`); hasErrors = true; }
});

// 6c. Conversion vs product separation.
// - Web Vitals must NOT come back as RUM in GA4: they became a CI gate
//   (.github/workflows/perf.yml). RUM fired web_vitals_* on every layout-shift /
//   LCP entry and polluted the GA4 event count.
// - scroll_depth is a PRODUCT INSIGHT: it goes to the first-party store (Blobs),
//   never to the dead dataLayer nor to the conversion funnel.
const separationChecks = {
  "no web_vitals RUM on the site": !/web_vitals_|core_web_vitals|initRUMPerformance/.test(jsContent),
  "scroll_depth sent to first-party": /sendLogBeacon\(\{[\s\S]{0,120}event_type: 'scroll_depth'/.test(jsContent),
  "scroll_depth kept out of the dataLayer": !/dataLayer\.push\(\{[^}]*'event': 'scroll_depth'/.test(jsContent)
};
Object.keys(separationChecks).forEach(k => {
  if (separationChecks[k]) console.log(`  ✅ ${k}`);
  else { console.error(`  ❌ ${k}`); hasErrors = true; }
});

// campaign_id is set in the gtag config, now centralized in tracking.js (deferred
// config) and no longer duplicated inline in every HTML page.
const trackingDeferredOk = jsContent.includes('gtag(\'set\', { campaign_id: \'\' })')
  && jsContent.includes('send_page_view')
  && (jsContent.includes('function injectGtagAndConfigure(') || jsContent.includes('injectGtagAndConfigure'))
  && (jsContent.includes('ensureGtagLoaded') && jsContent.includes('function sendGtagConversion('));
if (trackingDeferredOk) {
  console.log('  ✅ tracking.js centralizes the deferred gtag config (campaign_id + send_page_view)');
} else {
  console.error('  ❌ tracking.js does not centralize the deferred gtag config.');
  hasErrors = true;
}

// The gtag may only be injected on a USER gesture. An idle fallback
// (requestIdleCallback/setTimeout after load) fired the timeout on busy pages and
// injected gtag inside the TBT window (~1.2s long task), breaking the Web Vitals
// gate. ensureGtagLoaded covers the direct click.
const gtagGestureOnly =
  !/requestIdleCallback/.test(jsContent) &&
  !/scheduleIdle/.test(jsContent) &&
  jsContent.includes("armDeferredGtag") &&
  jsContent.includes("'pointerdown'") &&
  jsContent.includes("ensureGtagLoaded");
if (gtagGestureOnly) {
  console.log('  ✅ gtag loads on gesture only (no idle/timeout fallback); ensureGtagLoaded covers the direct click');
} else {
  console.error('  ❌ tracking.js went back to loading gtag on idle (requestIdleCallback/timeout).');
  hasErrors = true;
}
trackingPages.forEach(page => {
  const pagePath = path.join(publicDir, page);
  const pageContent = fs.readFileSync(pagePath, 'utf8');
  // Refactor: pages must NOT load an eager inline gtag block anymore.
  const hasInlineEager = pageContent.includes('googletagmanager.com/gtag/js');
  if (!hasInlineEager && pageContent.includes('assets/js/tracking.js')) {
    console.log(`  ✅ ${page}: no eager inline gtag; tracking goes through tracking.js (deferred)`);
  } else {
    console.error(`  ❌ ${page}: eager inline gtag still present (or tracking.js missing)`);
    hasErrors = true;
  }
});

// 7. Validate the durable log pipeline (Netlify Blobs) and the insights endpoint
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '🗄️  7. DURABLE LOG PIPELINE VALIDATION (NETLIFY BLOBS)');
const pipeChecks = [
  { file: path.join(__dirname, '../netlify/access-store.js'), label: 'access-store.js helper exists' },
  { file: path.join(__dirname, '../netlify/functions/insights.js'), label: 'insights.js function exists' },
  { file: path.join(__dirname, '../netlify/functions/log-access.js'), label: 'log-access.js function exists' }
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
    console.log('  ✅ log-access.js persists to Netlify Blobs through access-store (setJSON)');
  } else {
    console.error('  ❌ log-access.js does not persist durably in Netlify Blobs (data will be lost on redeploy!)');
    hasErrors = true;
  }
}
if (fs.existsSync(path.join(__dirname, '../netlify/functions/insights.js'))) {
  const insFn = fs.readFileSync(path.join(__dirname, '../netlify/functions/insights.js'), 'utf8');
  if (insFn.includes('message_sent') && insFn.includes('conversion_rate')) {
    console.log('  ✅ insights.js aggregates message_sent and conversion_rate');
  } else {
    console.error('  ❌ insights.js does not aggregate the new conversions');
    hasErrors = true;
  }
}
if (fs.existsSync(path.join(__dirname, '../scripts/fetch-access-insights.js'))) {
  const cli = fs.readFileSync(path.join(__dirname, '../scripts/fetch-access-insights.js'), 'utf8');
  if (cli.includes('message_sent') && cli.includes('.netlify/functions/insights')) {
    console.log('  ✅ CLI queries the insights API and shows message_sent');
  } else {
    console.error('  ❌ CLI is not integrated with the insights API');
    hasErrors = true;
  }
}

// 8. Validate server-side canonicalization (clean attribution source for honest metrics)
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '🧮 8. ATTRIBUTION CANONICALIZATION VALIDATION (access-store)');
const accessStorePath = path.join(__dirname, '../netlify/access-store.js');
if (!fs.existsSync(accessStorePath)) {
  console.error('\x1b[31m❌ access-store.js not found; cannot validate canonicalization.\x1b[0m');
  hasErrors = true;
} else {
  const storeSrc = fs.readFileSync(accessStorePath, 'utf8');
  const hasHelpers = ['CAMPAIGN_LABELS', 'canonicalSourceFromEvent', 'resolveCampaignLabelFromEvent', 'isPreviewReferer']
    .every(name => storeSrc.includes(name) && storeSrc.includes(`module.exports`));
  if (hasHelpers) console.log('  ✅ access-store exposes CAMPAIGN_LABELS + canonical helpers');
  else { console.error('  ❌ access-store is missing the required canonical helpers'); hasErrors = true; }

  // Behaviour of the helpers against realistic samples.
  const access_store = (() => {
    try { return require(accessStorePath); } catch { return null; }
  })();

  if (access_store && typeof access_store.canonicalSourceFromEvent === 'function') {
    const cases = [
      // { desc, event, expected }
      { d: 'present utm source wins', e: { utms: { source: 'google' } }, want: 'google' },
      { d: 'referer with gclid normalizes to Direct', e: { utms: {}, referer: 'https://consultoriosalustiano.com.br/?gad_source=1&gclid=CjwKCAjwwL_UBhAjEiwAEhuT5MEGw44TZX0p_YCaCyMXxuiO3Mzbd720eFEb8EuhP8vrlZlASHDyQBoCB-sQAvD_BwE' }, want: 'Direct / Organic' },
      { d: 'own-domain referer with a known campaign (infectio) => label', e: { utms: {}, referer: 'https://consultoriosalustiano.com.br/?gad_source=1&gad_campaignid=23071806673&gclid=CjwKCAjwwL_UBhAjEqFhuT5MEGw44TZX0p_YCaCyMXxuiO3Mzbd720eFEb8EuhP8vrlZlASHDyQBoCB-sQAvD_BwE' }, want: 'Infectologia' },
      { d: 'own-domain referer with an unknown campaign => Direct', e: { utms: {}, referer: 'https://consultoriosalustiano.com.br/?gad_source=1&gad_campaignid=999999999&gclid=CjwKCAjwwL_UBhAjEqFhuT5MqFmyQ0u7ftGnzKhgG5SglndoDMQpN8jYH8sqE8Jf6gJXPvmPGLSEb1BBnQBh1NIBOPf_3' }, want: 'Direct / Organic' },
      { d: 'external referer (google) => canonical host', e: { utms: {}, referer: 'https://www.google.com/url?q=x' }, want: 'google.com' },
      { d: 'no source and no referer => Direct', e: { utms: {} }, want: 'Direct / Organic' },
      { d: 'deploy-preview referer => __preview__', e: { utms: {}, referer: 'https://6a9c6783f3e5a60008061801--consultorio-salustiano.netlify.app/' }, want: '__preview__' }
    ];
    cases.forEach((c) => {
      const got = access_store.canonicalSourceFromEvent(c.e);
      if (got === c.want) console.log(`  ✅ canonicalSourceFromEvent: ${c.d}`);
      else { console.error(`  ❌ canonicalSourceFromEvent: ${c.d} → '${got}' (expected '${c.want}')`); hasErrors = true; }
    });

    // Readable campaign label from a known campaign id.
    if (typeof access_store.resolveCampaignLabelFromEvent === 'function') {
      const labelGot = access_store.resolveCampaignLabelFromEvent({ utms: { gad_campaignid: '23071806673' } });
      if (labelGot === 'Infectologia') console.log('  ✅ resolveCampaignLabelFromEvent maps 23071806673 → Infectologia');
      else { console.error(`  ❌ resolveCampaignLabelFromEvent → '${labelGot}'`); hasErrors = true; }
    }
    if (typeof access_store.resolveCampaignLabelFromEvent === 'function') {
      // Referer fallback: a downstream event without utms.gad_campaignid recovers it from the referer.
      const viaReferer = access_store.resolveCampaignLabelFromEvent({
        utms: {},
        referer: 'https://consultoriosalustiano.com.br/?gad_source=1&gad_campaignid=23747859815&gclid=CjwKCAjwwL_UBhAjEqFhuT5MeLP0R79SnJj6XqLxF9aJ5B3jGV0TvAEdA93blXtV04XfNXB3Cc6O0bBnQBh1NIBOPf_3'
      });
      if (viaReferer === 'Cardiologia') console.log('  ✅ resolveCampaignLabelFromEvent recovers 23747859815 from the referer → Cardiologia');
      else { console.error(`  ❌ resolveCampaignLabelFromEvent (referer) → '${viaReferer}'`); hasErrors = true; }
      // An unknown id via referer must not leak or label; it falls back to Direct.
      const unknownRef = access_store.resolveCampaignLabelFromEvent({
        utms: {},
        referer: 'https://consultoriosalustiano.com.br/?gad_source=1&gad_campaignid=1111111111&gclid=CjwKCAjwwL_UBhAjEqFhuT5MqBqx5W3jhdN0z5GiP7vG2yUaRx7WfY80Hs0cO5rQ8yRGXmVGS2If0xBBnQBh1NIBOPf_3'
      });
      if (unknownRef === 'Direct / Organic') console.log('  ✅ resolveCampaignLabelFromEvent: unknown campaign via referer → Direct (raw id does not leak)');
      else { console.error(`  ❌ resolveCampaignLabelFromEvent (ref unknown) → '${unknownRef}'`); hasErrors = true; }
    }
    if (typeof access_store.isPreviewReferer === 'function') {
      const isPrev = access_store.isPreviewReferer('https://6a9c5b87a4aefe0009462a09--consultorio-salustiano.netlify.app/');
      const notPrev = !access_store.isPreviewReferer('https://consultoriosalustiano.com.br/');
      if (isPrev && notPrev) console.log('  ✅ isPreviewReferer separates deploy preview from production');
      else { console.error('  ❌ isPreviewReferer failed on the host'); hasErrors = true; }
    } else {
      console.error('  ❌ isPreviewReferer is missing'); hasErrors = true;
    }
  } else {
    console.error('\x1b[31m❌ Could not load access-store for behavioural tests.\x1b[0m');
    hasErrors = true;
  }

  // insights.js uses the helpers (server-side attribution, never the raw referer)
  const insPath = path.join(__dirname, '../netlify/functions/insights.js');
  if (fs.existsSync(insPath)) {
    const insSrc = fs.readFileSync(insPath, 'utf8');
    const usesHelpers = insSrc.includes('canonicalSourceFromEvent') && insSrc.includes('resolveCampaignLabelFromEvent') && insSrc.includes('isPreviewEvent');
    const noRawReferer = !/e\.referer\s*\|/.test(insSrc); // must not group by the raw referer directly
    if (usesHelpers) console.log('  ✅ insights.js aggregates through the canonical helpers (no raw referer)');
    else { console.error('  ❌ insights.js does not use the canonical helpers'); hasErrors = true; }
    if (noRawReferer) console.log('  ✅ insights.js does not fall back to the raw referer for grouping');
    else { console.error('  ❌ insights.js still uses raw e.referer for grouping'); hasErrors = true; }
    // insights.js must also consume the shared visitor-key helper (DRY) and expose
    // the additive estimated_visitors total.
    const usesVisitorKey = insSrc.includes('deriveVisitorGroupKey');
    const exposesEstimate = insSrc.includes('estimated_visitors');
    if (usesVisitorKey && exposesEstimate) {
      console.log('  ✅ insights.js uses deriveVisitorGroupKey and exposes estimated_visitors (additive)');
    } else {
      console.error('  ❌ insights.js does not consume deriveVisitorGroupKey / estimated_visitors');
      hasErrors = true;
    }
  }

  // Visitor-grouping behavior — single DRY source (access-store.deriveVisitorGroupKey)
  // consumed both by insights.js and the local CLI fallback. These tests pin the
  // weak/bounded contract: same ip+UA+window => same key; other signals differ.
  if (access_store && typeof access_store.deriveVisitorGroupKey === 'function') {
    console.log('\n\x1b[33m%s\x1b[0m', '🔗 9. VISITOR GROUPING VALIDATION (weak/bounded, server-side)');
    const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120';
    const mk = (ip, ua, tm) => ({ ip, user_agent: ua, timestamp: tm });
    const sameDayLater = mk('1.2.3.4', UA, '2026-09-06T18:30:00Z');
    const visChecks = [
      { d: 'same ip+UA+window => same key', wantSame: mk('1.2.3.4', UA, '2026-09-06T10:00:00Z'), compare: sameDayLater, same: true },
      { d: 'same ip, different UA => different key', wantDiff: mk('1.2.3.4', 'Mozilla/5.0 (iPhone; OS 17_0)', '2026-09-06T10:05:00Z'), compare: sameDayLater, same: false },
      { d: 'same UA, different ip => different key', wantDiff: mk('5.6.7.8', UA, '2026-09-06T10:10:00Z'), compare: sameDayLater, same: false },
      { d: 'outside the window (2 days) => different key (not durable)', wantDiff: mk('1.2.3.4', UA, '2026-09-08T10:00:00Z'), compare: sameDayLater, same: false }
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
      console.log('  ✅ deriveVisitorGroupKey returns null with missing ip/UA/timestamp (never collapses)');
    } else {
      console.error('  ❌ deriveVisitorGroupKey should return null with missing inputs');
      hasErrors = true;
    }
    // determinism + opacity (sha256 digest, no raw ip/ua prefix)
    const g = access_store.deriveVisitorGroupKey(sameDayLater);
    const deterministic = access_store.deriveVisitorGroupKey(sameDayLater) === g;
    const opaque = /^[0-9a-f]{32}$/.test(g);
    if (deterministic && opaque) console.log('  ✅ deterministic, opaque key (32 hex digest, no raw ip/UA)');
    else { console.error('  ❌ key is not deterministic or not opaque'); hasErrors = true; }
  } else {
    console.error('\x1b[31m❌ access-store does not expose deriveVisitorGroupKey.\x1b[0m');
    hasErrors = true;
  }

  // Manual smoke-test detection (TESTGCLID) — read-side split so QA events that
  // reached production never enter the reported funnel. Exact-marker match only:
  // real gclids never contain TEST, so there is no false-positive risk.
  if (access_store && typeof access_store.isTestEvent === 'function') {
    console.log('\n\x1b[33m%s\x1b[0m', '🚫 10. SMOKE-TEST EXCLUSION VALIDATION (TESTGCLID)');
    const REAL_GCLID = 'CjwKCAjw-rTUBhAjEiwAEhuT5MEGw44TZX0p_YCaCyMXxuiO3Mzbd720eFEb8EuhP8vrlZlASHDyQBoCB-sQAvD_BwE';
    const testCases = [
      { d: 'utms.gclid TESTGCLID_infecto => test', e: { utms: { gclid: 'TESTGCLID_infecto' } }, want: true },
      { d: 'utms.gclid TESTGCLID_cardio => test', e: { utms: { gclid: 'TESTGCLID_cardio' } }, want: true },
      { d: 'referer with gclid=TEST => test', e: { utms: {}, referer: 'https://consultoriosalustiano.com.br/?gad_source=1&gad_campaignid=TEST&gclid=TEST' }, want: true },
      { d: 'path carrying the marker => test', e: { utms: {}, path: '/?gclid=TESTGCLID_infecto' }, want: true },
      { d: 'a real gclid is NOT a test', e: { utms: { gclid: REAL_GCLID } }, want: false },
      { d: 'a real campaign (23071806673) is NOT a test', e: { utms: { gad_campaignid: '23071806673' } }, want: false },
      { d: 'an empty event is NOT a test', e: {}, want: false },
      { d: 'null is NOT a test', e: null, want: false }
    ];
    testCases.forEach(c => {
      const got = access_store.isTestEvent(c.e);
      if (got === c.want) console.log(`  ✅ isTestEvent: ${c.d}`);
      else { console.error(`  ❌ isTestEvent: ${c.d} → ${got} (expected ${c.want})`); hasErrors = true; }
    });

    // insights.js must consume the shared predicate and expose the additive bucket.
    const insSrc2 = fs.readFileSync(path.join(__dirname, '../netlify/functions/insights.js'), 'utf8');
    if (insSrc2.includes('isTestEvent') && insSrc2.includes('test_traffic')) {
      console.log('  ✅ insights.js excludes tests from the funnel and exposes test_traffic (additive)');
    } else {
      console.error('  ❌ insights.js does not consume isTestEvent / test_traffic');
      hasErrors = true;
    }
  } else {
    console.error('\x1b[31m❌ access-store does not expose isTestEvent.\x1b[0m');
    hasErrors = true;
  }
}

// 11. Store collection — the bottleneck that killed the weekly report.
// Regression (2026-10): the reader listed EVERY key and did one sequential `get`
// per key, costing O(history). At ~718 blobs that crossed 30s and the `insights`
// function started answering 504 (Netlify), killing the email job. The contract now
// has two testable invariants: (a) out-of-window keys are NOT fetched; (b) reads
// happen in parallel, but bounded.
async function checkCollectEvents() {
  console.log('\n\x1b[33m%s\x1b[0m', '📦 11. EVENT COLLECTION VALIDATION (window + bounded concurrency)');
  const as = require(path.join(__dirname, '../netlify/access-store.js'));

  if (typeof as.collectEvents !== 'function' || typeof as.keyTimestampMs !== 'function') {
    console.error('  ❌ access-store does not expose collectEvents/keyTimestampMs');
    hasErrors = true;
    return;
  }

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const NOW = Date.parse('2026-10-25T12:00:00.000Z');
  const DAYS = 7;
  const sinceMs = NOW - DAYS * DAY;

  // 300 events every 6h (~75 days of history) + 1 legacy-format key.
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
  // Key without a recognizable timestamp: must be fetched (the body decides).
  keys.push('event/legacy-import-0001');
  expectedKeys.push('event/legacy-import-0001');
  // Unreadable blob inside the window: counted as a failure, does not break the run.
  const brokenKey = `event/${new Date(NOW - HOUR).toISOString()}_broken`;
  keys.push(brokenKey);
  expectedKeys.push(brokenKey);

  const state = { gets: 0, inFlight: 0, maxInFlight: 0 };
  const store = {
    // `list` returns out of order on purpose: the collector cannot depend on it.
    async list() { return { blobs: keys.slice().reverse().map((key) => ({ key })) }; },
    async get(key) {
      state.gets += 1;
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      state.inFlight -= 1;
      if (key === brokenKey) throw new Error('blob unavailable');
      return {
        timestamp: keyTs(key) === null ? new Date(NOW - 2 * HOUR).toISOString() : key.slice(6, 30),
        event_type: 'page_view'
      };
    }
  };

  const res = await as.collectEvents(store, sinceMs);

  // (a) only the window is fetched — old history costs zero `get`.
  if (state.gets === expectedKeys.length) {
    console.log(`  ✅ collectEvents fetches only the window: ${state.gets} gets for ${keys.length} keys (7d)`);
  } else {
    console.error(`  ❌ collectEvents made ${state.gets} gets; expected ${expectedKeys.length} (keys in the window)`);
    hasErrors = true;
  }

  // (b) bounded parallelism (never sequential, never unbounded).
  if (state.maxInFlight > 1 && state.maxInFlight <= 32) {
    console.log(`  ✅ bounded parallel reads: peak of ${state.maxInFlight} concurrent gets (cap 32)`);
  } else {
    console.error(`  ❌ concurrency peak outside the contract: ${state.maxInFlight} (expected 2..32)`);
    hasErrors = true;
  }

  // (c) an unreadable blob does not break the report; it is counted.
  if (res.failed === 1 && res.events.length === expectedKeys.length - 1) {
    console.log('  ✅ unreadable blob is counted (failed=1) without losing the other events');
  } else {
    console.error(`  ❌ blob failure masked: failed=${res.failed}, events=${res.events.length} (expected 1 and ${expectedKeys.length - 1})`);
    hasErrors = true;
  }

  // (d) a legacy-format key is not dropped by the filter.
  const legacyIncluded = res.events.some((e) => e && e.timestamp === new Date(NOW - 2 * HOUR).toISOString());
  if (legacyIncluded) console.log('  ✅ legacy-format key is fetched and decided by its body');
  else { console.error('  ❌ legacy-format key was dropped by the window filter'); hasErrors = true; }

  // (e) chronological order preserved (the email compares weeks).
  const times = res.events.map((e) => Date.parse(e.timestamp));
  const sorted = times.every((t, i) => i === 0 || times[i - 1] <= t);
  if (sorted) console.log('  ✅ events returned in chronological order');
  else { console.error('  ❌ events out of chronological order'); hasErrors = true; }

  // (f) a smaller window costs fewer reads (cost tracks the window, not history).
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
    console.log(`  ✅ cost proportional to the window: 1d = ${state1.gets} gets vs 7d = ${state.gets}`);
  } else {
    console.error(`  ❌ cost does not track the window: 1d=${state1.gets}, 7d=${state.gets}`);
    hasErrors = true;
  }

  // (g) a malformed key never becomes a valid timestamp (no junk enters the window).
  if (as.keyTimestampMs('event/legacy-import-0001') === null
    && typeof as.keyTimestampMs(`event/${new Date(NOW).toISOString()}_x`) === 'number') {
    console.log('  ✅ keyTimestampMs: ISO parses, unknown format => null');
  } else {
    console.error('  ❌ keyTimestampMs does not distinguish an ISO key from a legacy one');
    hasErrors = true;
  }

  // (h) static guard: insights.js must NOT go back to the full sequential scan.
  const insSrc = fs.readFileSync(path.join(__dirname, '../netlify/functions/insights.js'), 'utf8');
  const usesCollector = insSrc.includes('collectEvents');
  const noSequentialScan = !/for\s*\(\s*const\s*\{?\s*key\s*\}?\s*of\s+blobs/.test(insSrc);
  if (usesCollector && noSequentialScan) {
    console.log('  ✅ insights.js uses collectEvents (no sequential scan of every blob)');
  } else {
    console.error('  ❌ insights.js went back to scanning the store sequentially (timeout regression)');
    hasErrors = true;
  }

  // (i) pagination: `list()` WITHOUT `paginate` returns a single page (1000 keys) and
  // would truncate history silently — the store is already at ~718 and grows ~130/week.
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
    console.log('  ✅ paginated listing: follows every page (nothing truncated on page 1)');
  } else {
    console.error(`  ❌ truncated pagination: scanned=${paged.scanned}, events=${paged.events.length} (expected 5/5)`);
    hasErrors = true;
  }
}

// 12. Retry policy of the `insights` client (scripts/lib/insights-api.js).
// A transient 5xx from the provider must not cost a week of reporting; a 4xx is a
// call-site bug and must fail immediately (retrying only delays the diagnosis).
// Tested against a loopback server — the suite stays offline.
async function checkInsightsRetry() {
  console.log('\n\x1b[33m%s\x1b[0m', '🔁 12. INSIGHTS CLIENT RETRY VALIDATION (transient vs 4xx)');
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

  // (a) transient 503 -> retry until it works.
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
      console.log('  ✅ transient 503 is retried and the payload is returned');
    } else {
      console.error(`  ❌ retry expected: hits=${transient.hits}, events=${payload && payload.summary && payload.summary.events}`);
      hasErrors = true;
    }
  });

  // (b) 404 is NOT retried.
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
      console.log('  ✅ 404 fails immediately (no retry), status preserved');
    } else {
      console.error(`  ❌ 404 should fail on the first attempt: hits=${notFound.hits}, err=${err && err.message}`);
      hasErrors = true;
    }
  });

  // (c) exhausting the attempts returns the error with `.attempts` (the job prints it).
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
      console.log('  ✅ exhausted 3 attempts and reported status/attempts for the job log');
    } else {
      console.error(`  ❌ retry did not exhaust as expected: hits=${always.hits}, ${err && err.message}`);
      hasErrors = true;
    }
  });
}

(async () => {
  for (const check of [checkCollectEvents, checkInsightsRetry]) {
    try {
      await check();
    } catch (err) {
      console.error(`\x1b[31m❌ ${check.name} threw: ${err.message}\x1b[0m`);
      hasErrors = true;
    }
  }

  console.log('\n--------------------------------------------------');
  if (hasErrors) {
    console.error('\x1b[31m❌ SOME TESTS FAILED.\x1b[0m\n');
    process.exit(1);
  } else {
    console.log('\x1b[32m✅ ALL TESTS PASSED!\x1b[0m\n');
    process.exit(0);
  }
})();

