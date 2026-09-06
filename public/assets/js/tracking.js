// 🏥 Arquivo de Rastreamento Avançado - lp-consultorio
// Este script centraliza a lógica de UTMs, disparos de conversão, RUM e inteligência de acessos.

// Consent-light first-party client identity: a per-visit UUID held only in memory
// (no cookies, no persistent storage). Lets Access events be merged into users/sessions
// without adding GDPR consent friction on a medical site.
function generateClientId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
window.__clientId = window.__clientId || generateClientId();

// Forward mapping of known Google Ads campaign IDs to human-readable labels so reports
// show "Infectologia" / "Cardiologia" instead of raw gclid/referer URLs.
const CAMPAIGN_LABELS = {
    '23071806673': 'Infectologia',
    '23747859815': 'Cardiologia'
};
function resolveCampaignLabel(utms) {
    const campaignId = utms.gad_campaignid || utms.campaign;
    if (campaignId && CAMPAIGN_LABELS[campaignId]) return CAMPAIGN_LABELS[campaignId];
    if (utms.campaign) return utms.campaign;
    if (utms.source) return utms.source;
    return 'Direto / Orgânico';
}

// =============================================================================
// GA4 / Google Ads (gtag.js) — CARREGAMENTO DEFERRED (gesture OU load-idle)
// -----------------------------------------------------------------------------
// Objetivo: remover o ~3.5s de trabalho no main-thread (config/GA4 + integração
// com Google Ads) do caminho crítico da página. O gtag real é injetado apenas no
// primeiro gesto do usuário OU num instante ocioso após o evento `load`, o que
// primeiro acontecer. O placeholder síncrono abaixo garante que comandos de
// conversão nunca se percam mesmo antes do gtag real existir: o Googletagman
// processa o dataLayer logo que inicializa.
// Segurança de conversão mantida: garantir que um clique no WhatsApp FORÇA a
// injeção do gtag imediatamente (ver ensureGtagLoaded abaixo).
// =============================================================================
const GA4_MEASUREMENT_ID = 'G-1Q50PEEMVX';

// Placeholder síncrono (criado sempre; nunca é pesado). Garante que window.gtag
// exista para RUM/web_vitals e para o dataLayer, sem esperar o gtag real.
window.dataLayer = window.dataLayer || [];
if ('function' !== typeof window.gtag) {
    window.gtag = function () { window.dataLayer.push(arguments); };
}

// Cria o script real do gtag e dispara o config. Idempotente: só pode rodar uma vez.
function injectGtagAndConfigure() {
    if (window.__gtagInjected) return;
    if (document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
        // Já existe um <script> do gtag no documento (ex.: injetado antes).
        window.__gtagInjected = true;
        return;
    }
    window.__gtagInjected = true;
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_MEASUREMENT_ID;
    g.onload = function () {
        try {
            window.gtag('js', new Date());
            window.gtag('set', { campaign_id: '' });
            window.gtag('config', GA4_MEASUREMENT_ID, {
                'send_page_view': true,
                'linker': { 'domains': ['api.whatsapp.com'] }
            });
        } catch (e) {}
        window.__gtagReady = true;
    };
    g.onerror = function () { window.__gtagInjected = false; };
    document.head.appendChild(g);
}

// Injeta o gtag real o mais cedo que é seguro p/ a conversão, mas o mais tarde
// possível p/ o caminho crítico (TBT/LCP):
//   - primeiro gesto do usuário (pointerdown/keydown/scroll), OU
//   - um instante ocioso logo após o evento `load` (requestIdleCallback), o que
//     vier primeiro.
// Isso move o trabalho de config/Ads (~3.5s no main-thread em mobile) para fora
// da janela de medição, enquanto mantém o gtag pronto antes do usuário agir.
(function armDeferredGtag() {
    var done = false;
    var idleHandle = null;

    function teardown() {
        ['pointerdown', 'keydown', 'scroll'].forEach(function (ev) {
            window.removeEventListener(ev, onInteraction, true);
        });
        window.removeEventListener('load', onDocumentLoad);
        if (idleHandle) {
            if (window.cancelIdleCallback) { try { window.cancelIdleCallback(idleHandle); } catch (e) {} }
            else { clearTimeout(idleHandle); }
            idleHandle = null;
        }
    }

    function armAndLoad() {
        if (done) return;
        done = true;
        teardown();
        injectGtagAndConfigure();
    }

    function onInteraction() { armAndLoad(); }
    function onDocumentLoad() {
        scheduleIdle();
    }

    function scheduleIdle() {
        var fire = function () { armAndLoad(); };
        if (window.requestIdleCallback) {
            idleHandle = window.requestIdleCallback(fire, { timeout: 4000 });
        } else {
            idleHandle = setTimeout(fire, 1500);
        }
    }

    ['pointerdown', 'keydown', 'scroll'].forEach(function (ev) {
        window.addEventListener(ev, onInteraction, { passive: true, capture: true });
    });

    if (document.readyState === 'complete') {
        scheduleIdle();
    } else {
        window.addEventListener('load', onDocumentLoad);
    }
})();

// Garante que o gtag REAL esteja pronto antes de disparar um evento de conversão.
// Se ainda não carregou (nenhum gesto/pós-load), injeta NA HORA — assim um clique
// direto no WhatsApp sem qualquer interação prévia nunca perde o generate_lead.
function ensureGtagLoaded(onReady) {
    if (window.__gtagReady) { onReady(); return; }
    // Força a injeção agora (cobrir clique direto sem gesto prévio).
    injectGtagAndConfigure();
    var tries = 0;
    var timer = setInterval(function () {
        if (window.__gtagReady || tries++ > 30) {
            clearInterval(timer);
            onReady();
        }
    }, 100);
}

// Envia um evento de conversão ao GA4 de forma confiável (placeholder ou real).
function sendGtagConversion(eventName, params) {
    ensureGtagLoaded(function () {
        try {
            window.gtag('event', eventName, params);
        } catch (e) {}
    });
}


// 1. Armazenar UTMs na SessionStorage (Executa no carregamento)
(function storeUTMs() {
    const urlParams = new URLSearchParams(window.location.search);
    const utms = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'];

    utms.forEach(param => {
        if (urlParams.has(param)) {
            sessionStorage.setItem(param, urlParams.get(param));
        }
    });
})();

// 2. Inicialização do DataLayer
window.dataLayer = window.dataLayer || [];

/**
 * Dispara notificação silenciosa de log (Serverless Beacon)
 */
function sendLogBeacon(data) {
    try {
        // Enrich every beacon with the consent-light client identity so the access
        // store can merge events into users/sessions server-side.
        const payload = JSON.stringify(
            Object.assign({}, data, { client_id: window.__clientId })
        );
        if (navigator.sendBeacon) {
            navigator.sendBeacon('/.netlify/functions/log-access', payload);
        } else {
            fetch('/.netlify/functions/log-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true
            }).catch(function() {});
        }
    } catch (e) {}
}

/**
 * Dispara evento de conversão para o GTM, GA4 e Serverless Access Log
 * @param {string} location - Identificador de onde o clique ocorreu (ex: 'Header', 'Hero')
 */
// Converte as UTMs salvas em querystring para anexar ao link do WhatsApp,
// permitindo que o atendente (e o GA4) atribuam cada conversa à campanha certa.
function buildWhatsAppUrlWithUtm(baseUrl, locationOverride) {
    const utmParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid'];
    const parts = [];
    utmParams.forEach(p => {
        const v = sessionStorage.getItem(p);
        if (v) parts.push(`${encodeURIComponent(p)}=${encodeURIComponent(v)}`);
    });
    if (parts.length === 0) return baseUrl;
    // O WhatsApp usa '&text=' já presente na baseUrl (ou para sticky, usamos locationOverride).
    return baseUrl + (baseUrl.includes('?') ? '&' : '?') + parts.join('&');
}

// Verifica se a URL aponta para o host oficial do WhatsApp (host exato, não substring),
// evitando open redirect / concatenação de UTMs em domínios arbitrários.
function isTrustedWhatsAppUrl(url) {
    try {
        const parsed = new URL(url || '');
        return parsed.hostname === 'api.whatsapp.com';
    } catch (e) {
        return false;
    }
}

function collectUtmPayload() {
    const utms = {
        source: sessionStorage.getItem('utm_source') || '',
        medium: sessionStorage.getItem('utm_medium') || '',
        campaign: sessionStorage.getItem('utm_campaign') || '',
        term: sessionStorage.getItem('utm_term') || '',
        content: sessionStorage.getItem('utm_content') || '',
        gclid: sessionStorage.getItem('gclid') || '',
        gbraid: sessionStorage.getItem('gbraid') || '',
        gad_campaignid: getParamFromStorage('gad_campaignid', 'gad_source')
    };
    // Attach resolved, human-readable campaign label for reporting (falls back to source/Direto).
    utms.campaign_label = resolveCampaignLabel(utms);
    return utms;
}

// Reads a value by param name from sessionStorage, falling back to reading from
// the window URL query string (covers params never persisted like gad_campaignid).
function getParamFromStorage(...names) {
    for (const n of names) {
        const stored = sessionStorage.getItem(n);
        if (stored) return stored;
        const fromUrl = new URLSearchParams(window.location.search).get(n);
        if (fromUrl) return fromUrl;
    }
    return '';
}

function trackWhatsAppClick(location, element) {
    const isCardio = window.location.pathname.includes('/cardiologia');
    const specialty = isCardio ? 'Cardiologia' : 'Infectologia';
    const startTime = window.__pageStartTime || Date.now();
    const timeOnPageSec = Math.round((Date.now() - startTime) / 1000);
    const utms = collectUtmPayload();

    // Anexa UTMs ao link real que será aberto, para o atendente ver a origem.
    // Valida o host exato (não substring) para não concatenar UTMs em URLs arbitrárias.
    if (element && isTrustedWhatsAppUrl(element.href)) {
        element.href = buildWhatsAppUrlWithUtm(element.href, location);
    }

    // Disparo para o GTM (DataLayer)
    window.dataLayer.push({
        'event': 'generate_lead',
        'button_location': location,
        'specialty': specialty,
        'time_on_page_sec': timeOnPageSec,
        'utm_campaign': utms.campaign,
        'utm_source': utms.source,
        'utm_medium': utms.medium,
        'gclid': utms.gclid
    });

    // Disparo direto para o gtag.js com dimensões customizadas para CVR por campanha.
    // Garante o load do gtag real antes de enviar (evita corrida com o load lazy e
    // perda de conversão em navegações rápidas para o WhatsApp).
    const label = isCardio ? 'WhatsApp Dra Anabel ' + location : 'WhatsApp ' + location;
    sendGtagConversion('generate_lead', {
        'event_category': 'conversion',
        'event_label': label,
        'value': 1,
        'campaign_id': utms.campaign,
        'button_location': location,
        'specialty': specialty
    });

    // Registra log de conversão no servidor Netlify
    sendLogBeacon({
        event_type: 'whatsapp_click',
        specialty: specialty,
        path: window.location.pathname,
        button_location: location,
        time_on_page_sec: timeOnPageSec,
        utms: utms
    });
}

// 3. Rastreamento de Acessos Iniciais & Comportamento (Scroll Depth)
(function initAccessLogging() {
    window.__pageStartTime = Date.now();
    const isCardio = window.location.pathname.includes('/cardiologia');
    const specialty = isCardio ? 'Cardiologia' : 'Infectologia';

    // Log de visualização de página
    sendLogBeacon({
        event_type: 'page_view',
        specialty: specialty,
        path: window.location.pathname,
        utms: collectUtmPayload()
    });

    // Rastreamento de profundidade de rolagem (Scroll Depth: 25%, 50%, 75%, 100%)
    let trackedDepths = {};
    window.addEventListener('scroll', function() {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight <= 0) return;
        const scrollPercent = Math.round((window.scrollY / docHeight) * 100);
        [25, 50, 75, 100].forEach(depth => {
            if (scrollPercent >= depth && !trackedDepths[depth]) {
                trackedDepths[depth] = true;
                window.dataLayer.push({
                    'event': 'scroll_depth',
                    'depth': depth,
                    'specialty': specialty
                });
            }
        });
    }, { passive: true });
})();

// 4. Rastreamento de Real User Monitoring (Core Web Vitals & Navigation Performance)
(function initRUMPerformance() {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    function sendMetric(name, value, rating) {
        const valRounded = Math.round(name === 'CLS' ? value * 1000 : value);
        
        window.dataLayer.push({
            'event': 'core_web_vitals',
            'metric_name': name,
            'metric_value': valRounded,
            'metric_rating': rating || 'good'
        });

        if (typeof gtag === 'function') {
            gtag('event', 'web_vitals_' + name.toLowerCase(), {
                'event_category': 'Web Vitals',
                'event_label': name,
                'value': valRounded,
                'non_interaction': true,
                'metric_rating': rating || 'good'
            });
        }
    }

    try {
        new PerformanceObserver((entryList) => {
            const entries = entryList.getEntries();
            const lastEntry = entries[entries.length - 1];
            if (lastEntry) {
                const val = lastEntry.startTime;
                const rating = val <= 2500 ? 'good' : val <= 4000 ? 'needs-improvement' : 'poor';
                sendMetric('LCP', val, rating);
            }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {}

    try {
        let clsValue = 0;
        new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
                if (!entry.hadRecentInput) {
                    clsValue += entry.value;
                }
            }
            const rating = clsValue <= 0.1 ? 'good' : clsValue <= 0.25 ? 'needs-improvement' : 'poor';
            sendMetric('CLS', clsValue, rating);
        }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) {}

    window.addEventListener('load', () => {
        setTimeout(() => {
            try {
                const nav = performance.getEntriesByType('navigation')[0];
                if (nav) {
                    const ttfb = nav.responseStart;
                    sendMetric('TTFB', ttfb, ttfb <= 800 ? 'good' : 'poor');
                }
                const fcpEntry = performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint');
                if (fcpEntry) {
                    const fcp = fcpEntry.startTime;
                    sendMetric('FCP', fcp, fcp <= 1800 ? 'good' : 'poor');
                }
            } catch (e) {}
        }, 0);
    });
})();

// 5. Sistema de Event Listeners (Removendo onclick do HTML)
document.addEventListener('DOMContentLoaded', () => {
    const waButtons = document.querySelectorAll('a[href*="api.whatsapp.com"][data-track-location]');
    waButtons.forEach(button => {
        button.addEventListener('click', () => {
            const location = button.getAttribute('data-track-location');
            if (location) {
                trackWhatsAppClick(location, button);
            }
        });
    });

    // Proxy de "message_sent": quando o usuário sai da página para o WhatsApp
    // logo após clicar em um CTA, sabemos que ele abriu a conversa com o atendente.
    // (A confirmação definitiva de envio de mensagem depende de integração com a
    // API do WhatsApp / webhooks, que hoje está fora do nosso escopo.)
    let pendingWaClick = false;
    function flagWaProxy() { pendingWaClick = true; }

    document.addEventListener('pointerdown', function (e) {
        const anc = e.target.closest ? e.target.closest('a[href*="api.whatsapp.com"]') : null;
        if (anc) flagWaProxy();
    });

    function maybeFireMessageSent() {
        if (!pendingWaClick) return;
        pendingWaClick = false;
        if (document.hidden) {
            const isCardio = window.location.pathname.includes('/cardiologia');
            const specialty = isCardio ? 'Cardiologia' : 'Infectologia';
            const utms = collectUtmPayload();
            const timeOnPageSec = Math.round((Date.now() - (window.__pageStartTime || Date.now())) / 1000);

            // Dispara via caminho confiável (garante load do gtag real antes de enviar).
            // Em pagehide/visibilitychange o beacom nativo (sendBeacon) é preferível,
            // então registramos o parâmetro e deixamos o sendGtagLead disparar via fetch.
            sendGtagConversion('message_sent', {
                'event_category': 'conversion',
                'specialty': specialty,
                'time_on_page_sec': timeOnPageSec,
                'campaign_id': utms.campaign
            });
            window.dataLayer.push({ 'event': 'message_sent', 'specialty': specialty, 'time_on_page_sec': timeOnPageSec, 'utm_campaign': utms.campaign });

            sendLogBeacon({
                event_type: 'message_sent',
                specialty: specialty,
                path: window.location.pathname,
                time_on_page_sec: timeOnPageSec,
                utms: utms
            });
        }
    }

    window.addEventListener('pagehide', maybeFireMessageSent);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') maybeFireMessageSent(); });
});

// 6. Botão de WhatsApp Flutuante Sticky (CRO: Sempre visível enquanto rola a página)
(function initStickyWhatsApp() {
    const isCardio = window.location.pathname.includes('/cardiologia');
    const specialty = isCardio ? 'Cardiologia' : 'Infectologia';
    const waNumber = '5582999900844';
    const waText = isCardio
        ? 'Olá,%20gostaria%20de%20verificar%20disponibilidade%20para%20uma%20consulta%20com%20a%20Dra.%20Anabel.'
        : 'Olá,%20gostaria%20de%20verificar%20disponibilidade%20para%20uma%20consulta%20com%20o%20Dr.%20Gilberto.';

    // Injetar estilos CSS do botão flutuante
    const style = document.createElement('style');
    style.textContent = `
        #wa-sticky-btn {
            position: fixed;
            bottom: 24px;
            right: 20px;
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 10px;
            background: #1f7a33;
            color: #fff;
            font-family: 'Inter', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
            padding: 12px 20px 12px 14px;
            border-radius: 50px;
            box-shadow: 0 4px 20px rgba(31,122,51,0.45);
            opacity: 0;
            transform: translateY(16px);
            transition: opacity 0.35s ease, transform 0.35s ease, background 0.2s ease;
            pointer-events: none;
            white-space: nowrap;
        }
        #wa-sticky-btn.wa-sticky-visible {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
        }
        #wa-sticky-btn:hover {
            background: #155d27;
        }
        #wa-sticky-btn svg {
            flex-shrink: 0;
        }
        .wa-sticky-status {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 12px;
            font-weight: 500;
            opacity: 0.85;
        }
        .wa-sticky-dot {
            width: 8px;
            height: 8px;
            background: #86efac;
            border-radius: 50%;
            animation: wa-pulse 2s infinite;
            flex-shrink: 0;
        }
        @keyframes wa-pulse {
            0% { box-shadow: 0 0 0 0 rgba(134,239,172,0.6); }
            70% { box-shadow: 0 0 0 7px rgba(134,239,172,0); }
            100% { box-shadow: 0 0 0 0 rgba(134,239,172,0); }
        }
    `;
    document.head.appendChild(style);

    // Criar o elemento do botão flutuante
    const btn = document.createElement('a');
    btn.id = 'wa-sticky-btn';
    btn.href = `https://api.whatsapp.com/send?phone=${waNumber}&text=${waText}`;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.setAttribute('data-track-location', 'Floating_Sticky');
    btn.setAttribute('aria-label', 'Agendar consulta pelo WhatsApp');
    btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.487 5.235 3.487 8.417 0 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.273-.099-.471-.148-.67.15-.197.297-.768.967-.941 1.164-.173.197-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.67-1.611-.916-2.206-.242-.579-.487-.501-.67-.51-.173-.008-.371-.01-.57-.01s-.521.074-.795.372c-.273.296-1.043 1.016-1.043 2.479 0 1.462 1.067 2.869 1.216 3.067.148.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
        </svg>
        <span>
            Agendar consulta
            <span class="wa-sticky-status">
                <span class="wa-sticky-dot"></span>
                Disponível agora
            </span>
        </span>
    `;
    document.body.appendChild(btn);

    // O botão flutuante possui data-track-location="Floating_Sticky" e é capturado
    // pelo seletor genérico do bloco de event listeners; o listener direto foi removido
    // para evitar disparo duplicado de rastreamento.

    // Mostrar botão após scroll de 150px (usuário rolou além do Hero)
    let stickyVisible = false;
    window.addEventListener('scroll', function () {
        const shouldShow = window.scrollY > 150;
        if (shouldShow && !stickyVisible) {
            stickyVisible = true;
            btn.classList.add('wa-sticky-visible');
        } else if (!shouldShow && stickyVisible) {
            stickyVisible = false;
            btn.classList.remove('wa-sticky-visible');
        }
    }, { passive: true });
})();

