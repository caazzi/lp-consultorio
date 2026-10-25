// 🏥 Advanced tracking - lp-consultorio
// Centralizes UTM handling, conversion events and access intelligence.

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
    return 'Direct / Organic';
}

// =============================================================================
// GA4 / Google Ads (gtag.js) — CARREGAMENTO DEFERRED (somente por gesto)
// -----------------------------------------------------------------------------
// Goal: keep ~3.5s of main-thread work (gtag config/GA4 + Google Ads integration)
// off the page's critical path. The real gtag is injected only on the user's first
// gesture (pointerdown/keydown/scroll/touchstart). There is NO idle fallback: on a
// busy page the old timeout fired inside the TBT window (see below).
// do TBT (long task de ~1.2s), derrubando o gate de Web Vitals. O placeholder
// The synchronous placeholder below guarantees conversion commands are never lost
// before the real gtag exists: Googletagmanager processes the dataLayer as soon as
// it initializes. Conversion safety is preserved: a WhatsApp click FORCES the gtag
// injection immediately (see ensureGtagLoaded below).
// =============================================================================
const GA4_MEASUREMENT_ID = 'G-1Q50PEEMVX';

// Synchronous placeholder (always created; never heavy). Guarantees window.gtag
// exists for the dataLayer without waiting for the real gtag.
window.dataLayer = window.dataLayer || [];
if ('function' !== typeof window.gtag) {
    window.gtag = function () { window.dataLayer.push(arguments); };
}

// Creates the real gtag script and fires the config. Idempotent: runs at most once.
function injectGtagAndConfigure() {
    if (window.__gtagInjected) return;
    if (document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
        // A gtag <script> already exists in the document (e.g. injected earlier).
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

// Injects the real gtag ONLY on the user's first gesture (pointerdown/keydown/
// scroll/touchstart), never on idle. gtag only matters for GA4/Ads measurement, and
// a visitor who never interacts does not produce a session worth measuring: forcing
// the load at an idle moment after `load` made the timeout fallback fire on busy
// pages (Lighthouse mobile), injecting gtag at ~4s and creating a long task that
// de ~1.2s na janela do TBT.
// Conversion stays safe: a WhatsApp click calls ensureGtagLoaded(), which injects
// IMMEDIATELY — the placeholder buffers the dataLayer and gtag replays it.
(function armDeferredGtag() {
    var EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    var done = false;

    function teardown() {
        EVENTS.forEach(function (ev) {
            window.removeEventListener(ev, onInteraction, true);
        });
    }

    function onInteraction() {
        if (done) return;
        done = true;
        teardown();
        injectGtagAndConfigure();
    }

    EVENTS.forEach(function (ev) {
        window.addEventListener(ev, onInteraction, { passive: true, capture: true });
    });
})();

// Ensures the REAL gtag is ready before firing a conversion event. If it has not
// loaded yet (no gesture), inject it NOW — so a direct WhatsApp click with no prior
// interaction never loses generate_lead.
function ensureGtagLoaded(onReady) {
    if (window.__gtagReady) { onReady(); return; }
    // Force the injection now (covers a direct click with no prior gesture).
    injectGtagAndConfigure();
    var tries = 0;
    var timer = setInterval(function () {
        if (window.__gtagReady || tries++ > 30) {
            clearInterval(timer);
            onReady();
        }
    }, 100);
}

// Sends a conversion event to GA4 reliably (placeholder or real gtag).
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
    // `gad_source`/`gad_campaignid` are sent by Google Ads on paid clicks even without
    // manual utm_*. Persisting them here (like gclid) keeps conversion beacons fired on
    // later navigations (clicks/message_sent) attributable after the landing querystring
    // is gone. `gbraid`/`wbraid` are the iOS click ids (when the app cannot send `gclid`
    // because of App Tracking Transparency) and the web-to-app ids; without persisting
    // them, paid iOS traffic arrives unattributed.
    const utms = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid'];

    utms.forEach(param => {
        if (urlParams.has(param)) {
            sessionStorage.setItem(param, urlParams.get(param));
        }
    });
})();

// 2. DataLayer initialization
window.dataLayer = window.dataLayer || [];

/**
 * Fires a silent log notification (serverless beacon)
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
 * Fires a conversion event to the dataLayer, GA4 and the access log
 * @param {string} location - where the click happened (e.g. 'Header', 'Hero')
 */
// Turns the stored UTMs into a querystring to append to the WhatsApp link, so the
// attendant (and GA4) can attribute each conversation to the right campaign.
function buildWhatsAppUrlWithUtm(baseUrl, locationOverride) {
    const utmParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid'];
    const parts = [];
    utmParams.forEach(p => {
        const v = sessionStorage.getItem(p);
        if (v) parts.push(`${encodeURIComponent(p)}=${encodeURIComponent(v)}`);
    });
    if (parts.length === 0) return baseUrl;
    // WhatsApp already carries '&text=' in baseUrl (or, for the sticky button, we use locationOverride).
    return baseUrl + (baseUrl.includes('?') ? '&' : '?') + parts.join('&');
}

// Checks that the URL points to the official WhatsApp host (exact match, not
// substring), preventing open redirects / UTM concatenation onto arbitrary domains.
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
        // Read click identifiers via getParamFromStorage so they work even if the
        // landing querystring was not persisted (same rule as gad_campaignid).
        gclid: getParamFromStorage('gclid'),
        gbraid: getParamFromStorage('gbraid'),
        wbraid: getParamFromStorage('wbraid'),
        // NOTE: read ONLY gad_campaignid. Do NOT pass gad_source as a fallback name:
        // gad_source carries the literal "1" (a source marker, not a campaign id), so
        // falling back to it would write "1" into gad_campaignid and break attribution
        // (the id must match CAMPAIGN_LABELS). See access-store.knownCampaignIdFromReferer.
        gad_campaignid: getParamFromStorage('gad_campaignid')
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

    // Appends UTMs to the link that will actually open, so the attendant sees the source.
    // Validates the exact host (not substring) to avoid UTM concatenation on arbitrary URLs.
    if (element && isTrustedWhatsAppUrl(element.href)) {
        element.href = buildWhatsAppUrlWithUtm(element.href, location);
    }

    // Push to the dataLayer
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

    // Direct gtag.js event with custom dimensions for per-campaign CVR. Ensures the
    // real gtag is loaded before sending (avoids a race with the lazy load and lost
    // conversions on fast navigations to WhatsApp). Full attribution: besides
    // campaign_id it sends gclid/gad_campaignid and time on page — enough to cross the
    // conversion with the campaign in GA4 without relying on the first-party beacon.
    const label = isCardio ? 'WhatsApp Dra Anabel ' + location : 'WhatsApp ' + location;
    sendGtagConversion('generate_lead', {
        'event_category': 'conversion',
        'event_label': label,
        'value': 1,
        'campaign_id': utms.campaign,
        'gad_campaignid': utms.gad_campaignid,
        'gclid': utms.gclid,
        'gbraid': utms.gbraid,
        'wbraid': utms.wbraid,
        'button_location': location,
        'specialty': specialty,
        'time_on_page_sec': timeOnPageSec
    });

    // Record the conversion in the Netlify function log
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

    // Page-view log
    sendLogBeacon({
        event_type: 'page_view',
        specialty: specialty,
        path: window.location.pathname,
        utms: collectUtmPayload()
    });

    // Profundidade de rolagem (25/50/75/100%). INSIGHT DE PRODUTO (CRO: onde
    // where to place the CTA), not conversion. That is why it goes to the first-party
    // store (Blobs) and is read by the monthly product report, never by the Ads funnel /
    // conversion email. No dataLayer: GTM is not installed, so it would be inert.
    let trackedDepths = {};
    window.addEventListener('scroll', function() {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight <= 0) return;
        const scrollPercent = Math.round((window.scrollY / docHeight) * 100);
        [25, 50, 75, 100].forEach(depth => {
            if (scrollPercent >= depth && !trackedDepths[depth]) {
                trackedDepths[depth] = true;
                sendLogBeacon({
                    event_type: 'scroll_depth',
                    specialty: specialty,
                    path: window.location.pathname,
                    scroll_depth: depth,
                    utms: collectUtmPayload()
                });
            }
        });
    }, { passive: true });
})();

// 4. Web Vitals: measured in CI (.github/workflows/perf.yml via Lighthouse), no
// longer as RUM in GA4. Browser telemetry fired on every layout-shift/LCP entry
// (~19x per visit), polluting the GA4 event count without feeding any conversion
// decision. The CI lab is deterministic (same runner, same throttling), runs on the
// pushed code before deploy and fails the build when the budget is exceeded. See
// scripts/perf-check.js e scripts/lib/perf.js.

// 5. Sistema de Event Listeners (Removendo onclick do HTML)
document.addEventListener('DOMContentLoaded', () => {
    // "message_sent" proxy: when the user leaves the page for WhatsApp right after
    // clicking a CTA, we know the conversation was opened. (Definitive send
    // confirmation needs the WhatsApp Business API / webhooks, out of scope today.)
    //
    // Each button click becomes a "round" (generation). message_sent may only be
    // emitido UMA vez por rodada. DUAS garantias importantes:
    //  1. The round is armed in the button's click handler itself — the same origin
    //     do whatsapp_click. Antes era armada num listener global de pointerdown,
    //     it used to fire without a matching click, producing orphan message_sent
    //     (message_sent > whatsapp_click, impossible by definition).
    //  2. Atomic consumption: pagehide + visibilitychange both fire on the same exit;
    //     the old boolean guard was not atomic and counted twice.
    let clickGeneration = 0;
    let consumedGeneration = -1;

    const waButtons = document.querySelectorAll('a[href*="api.whatsapp.com"][data-track-location]');
    waButtons.forEach(button => {
        button.addEventListener('click', () => {
            const location = button.getAttribute('data-track-location');
            if (location) {
                clickGeneration += 1;
                trackWhatsAppClick(location, button);
            }
        });
    });

    function maybeFireMessageSent() {
        // Consume the round atomically: if already consumed, do not re-emit.
        // The check and the flag update are adjacent, before any await/work.
        if (clickGeneration === 0 || clickGeneration === consumedGeneration) return;
        consumedGeneration = clickGeneration;
        if (document.hidden) {
            const isCardio = window.location.pathname.includes('/cardiologia');
            const specialty = isCardio ? 'Cardiologia' : 'Infectologia';
            const utms = collectUtmPayload();
            const timeOnPageSec = Math.round((Date.now() - (window.__pageStartTime || Date.now())) / 1000);

            // Fire through the reliable path (loads the real gtag before sending).
            // On pagehide/visibilitychange the native beacon (sendBeacon) is preferable,
            // so we record the parameter and let sendGtagLead fire through fetch.
            // Full attribution (mirrors generate_lead): gclid/gbraid/wbraid/gad_campaignid
            // make the send proxy crossable by campaign in GA4.
            sendGtagConversion('message_sent', {
                'event_category': 'conversion',
                'event_label': isCardio ? 'Mensagem Dra Anabel' : 'Mensagem Dr Gilberto',
                'campaign_id': utms.campaign,
                'gad_campaignid': utms.gad_campaignid,
                'gclid': utms.gclid,
                'gbraid': utms.gbraid,
                'wbraid': utms.wbraid,
                'specialty': specialty,
                'time_on_page_sec': timeOnPageSec
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

// 6. Floating sticky WhatsApp button (CRO: always visible while scrolling)
(function initStickyWhatsApp() {
    const isCardio = window.location.pathname.includes('/cardiologia');
    const specialty = isCardio ? 'Cardiologia' : 'Infectologia';
    const waNumber = '5582999900844';
    const waText = isCardio
        ? 'Olá,%20gostaria%20de%20verificar%20disponibilidade%20para%20uma%20consulta%20com%20a%20Dra.%20Anabel.' // lang:allow (user-visible copy)
        : 'Olá,%20gostaria%20de%20verificar%20horários%20disponíveis%20para%20uma%20consulta%20com%20o%20Dr.%20Gilberto.'; // lang:allow (user-visible copy)

    // Inject the floating button's CSS
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

    // Create the floating button element
    const btn = document.createElement('a');
    btn.id = 'wa-sticky-btn';
    btn.href = `https://api.whatsapp.com/send?phone=${waNumber}&text=${waText}`;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.setAttribute('data-track-location', 'Floating_Sticky');
    btn.setAttribute('aria-label', 'Agendar consulta pelo WhatsApp'); // lang:allow (user-visible copy)
    // User-visible copy (PT-BR is allowed in the UI).
    const stickyLabel = 'Disponível agora'; // lang:allow (user-visible copy)

    btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.487 5.235 3.487 8.417 0 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.273-.099-.471-.148-.67.15-.197.297-.768.967-.941 1.164-.173.197-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.67-1.611-.916-2.206-.242-.579-.487-.501-.67-.51-.173-.008-.371-.01-.57-.01s-.521.074-.795.372c-.273.296-1.043 1.016-1.043 2.479 0 1.462 1.067 2.869 1.216 3.067.148.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
        </svg>
        <span>
            Agendar consulta
            <span class="wa-sticky-status">
                <span class="wa-sticky-dot"></span>
                ${stickyLabel}
            </span>
        </span>
    `;
    document.body.appendChild(btn);

    // The floating button carries data-track-location="Floating_Sticky" and is caught
    // by the generic selector in the listener block; the direct listener was removed
    // to avoid duplicate tracking.

    // Show the button after 150px of scroll (the user moved past the hero)
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

