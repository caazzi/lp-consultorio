// 🏥 Arquivo de Rastreamento Avançado - lp-consultorio
// Este script centraliza a lógica de UTMs, disparos de conversão, RUM e inteligência de acessos.

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
        const payload = JSON.stringify(data);
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
function trackWhatsAppClick(location) {
    const isCardio = window.location.pathname.includes('/cardiologia');
    const specialty = isCardio ? 'Cardiologia' : 'Infectologia';
    const startTime = window.__pageStartTime || Date.now();
    const timeOnPageSec = Math.round((Date.now() - startTime) / 1000);

    // Disparo para o GTM (DataLayer)
    window.dataLayer.push({
        'event': 'generate_lead',
        'button_location': location,
        'specialty': specialty,
        'time_on_page_sec': timeOnPageSec,
        'utm_campaign': sessionStorage.getItem('utm_campaign') || '',
        'utm_source': sessionStorage.getItem('utm_source') || '',
        'utm_medium': sessionStorage.getItem('utm_medium') || '',
        'gclid': sessionStorage.getItem('gclid') || ''
    });

    // Fallback: Disparo direto para o gtag.js
    if (typeof gtag === 'function') {
        const label = isCardio ? 'WhatsApp Dra Anabel ' + location : 'WhatsApp ' + location;
        gtag('event', 'generate_lead', {
            'event_category': 'conversion',
            'event_label': label,
            'value': 1
        });
    }

    // Registra log de conversão no servidor Netlify
    sendLogBeacon({
        event_type: 'whatsapp_click',
        specialty: specialty,
        path: window.location.pathname,
        button_location: location,
        time_on_page_sec: timeOnPageSec,
        utms: {
            source: sessionStorage.getItem('utm_source') || '',
            medium: sessionStorage.getItem('utm_medium') || '',
            campaign: sessionStorage.getItem('utm_campaign') || '',
            gclid: sessionStorage.getItem('gclid') || ''
        }
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
        utms: {
            source: sessionStorage.getItem('utm_source') || '',
            medium: sessionStorage.getItem('utm_medium') || '',
            campaign: sessionStorage.getItem('utm_campaign') || '',
            gclid: sessionStorage.getItem('gclid') || ''
        }
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
                trackWhatsAppClick(location);
            }
        });
    });
});
