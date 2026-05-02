// 🏥 Arquivo de Rastreamento Avançado - lp-consultorio
// Este script centraliza a lógica de UTMs e disparos de conversão.

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
 * Dispara evento de conversão para o GTM e GA4
 * @param {string} location - Identificador de onde o clique ocorreu (ex: 'Header', 'Hero')
 */
function trackWhatsAppClick(location) {
    const isCardio = window.location.pathname.includes('/cardiologia');
    const specialty = isCardio ? 'Cardiologia' : 'Infectologia';

    // Disparo para o GTM (DataLayer)
    window.dataLayer.push({
        'event': 'generate_lead',
        'button_location': location,
        'specialty': specialty,
        'utm_campaign': sessionStorage.getItem('utm_campaign') || '',
        'utm_source': sessionStorage.getItem('utm_source') || '',
        'utm_medium': sessionStorage.getItem('utm_medium') || '',
        'gclid': sessionStorage.getItem('gclid') || ''
    });

    // Fallback: Disparo direto para o gtag.js (Compatibilidade com tags legadas)
    if (typeof gtag === 'function') {
        const label = isCardio ? 'WhatsApp Dra Anabel ' + location : 'WhatsApp ' + location;
        gtag('event', 'generate_lead', {
            'event_category': 'conversion',
            'event_label': label,
            'value': 1
        });
    }
}

// 3. Sistema de Event Listeners (Removendo onclick do HTML)
document.addEventListener('DOMContentLoaded', () => {
    // Busca todos os links que apontam para o WhatsApp e têm o atributo data-track-location
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
