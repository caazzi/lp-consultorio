// Arquivo centralizado de Rastreamento Avançado
// Substitui a necessidade de manter lógicas complexas direto no HTML.

// 1. Armazenar UTMs na Sessão (Executa no carregamento)
(function storeUTMs() {
    const urlParams = new URLSearchParams(window.location.search);
    const utms = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'];

    utms.forEach(param => {
        if (urlParams.has(param)) {
            sessionStorage.setItem(param, urlParams.get(param));
        }
    });
})();

// O texto do WhatsApp é mantido original, pois a secretária não fará a análise dos dados.
// A análise de UTMs e atribuição de conversões acontece no Google Analytics via DataLayer (abaixo).

// 3. Função de Tracking Rica para DataLayer & GA4
window.dataLayer = window.dataLayer || [];

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

    // Fallback: Disparo direto para o gtag.js atual (Mantém a compatibilidade!)
    if (typeof gtag === 'function') {
        const label = isCardio ? 'WhatsApp Dra Anabel ' + location : 'WhatsApp ' + location;
        gtag('event', 'generate_lead', {
            'event_category': 'conversion',
            'event_label': label,
            'value': 1
        });
    }
}
