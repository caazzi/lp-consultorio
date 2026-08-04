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

    // Vincular evento de clique ao sistema de rastreamento existente
    btn.addEventListener('click', () => trackWhatsAppClick('Floating_Sticky'));

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

