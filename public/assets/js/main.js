document.addEventListener('DOMContentLoaded', () => {
    // Atualizar o ano atual no rodapé
    const currentYearEl = document.getElementById('current-year');
    if (currentYearEl) {
        currentYearEl.textContent = new Date().getFullYear();
    }

    // Intersection Observer para Scroll Reveal
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, observerOptions);

    window.requestAnimationFrame(() => {
        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    });

    // Lazy load Elfsight Google Reviews widget when near viewport
    const elfsightWrapper = document.querySelector('.elfsight-wrapper');
    if (elfsightWrapper) {
        const elfsightObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (!document.querySelector('script[src*="elfsightcdn.com"]')) {
                        const script = document.createElement('script');
                        script.src = 'https://elfsightcdn.com/platform.js';
                        script.async = true;
                        document.head.appendChild(script);
                    }
                    obs.disconnect();
                }
            });
        }, { rootMargin: '300px 0px' });
        elfsightObserver.observe(elfsightWrapper);
    }
});

