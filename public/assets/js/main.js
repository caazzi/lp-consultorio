document.addEventListener('DOMContentLoaded', () => {
    // Update the current year in the footer
    const currentYearEl = document.getElementById('current-year');
    if (currentYearEl) {
        currentYearEl.textContent = new Date().getFullYear();
    }

    // IntersectionObserver is missing on iOS < 12.1 and can be blocked by
    // extensions. Without a fallback, every .reveal section stays at opacity 0.
    const hasObserver = 'IntersectionObserver' in window;
    const revealAll = () => {
        document.querySelectorAll('.reveal').forEach((el) => el.classList.add('active'));
    };

    if (!hasObserver) {
        revealAll();
    } else {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        window.requestAnimationFrame(() => {
            document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
        });
    }

    // The inline safety net in <head> reveals everything after 4s if main.js never
    // runs. Cancel it now so it cannot override the scroll animation.
    clearTimeout(window.__revealFallback);

    // Lazy load Elfsight Google Reviews widget when near viewport
    const elfsightWrapper = document.querySelector('.elfsight-wrapper');
    const loadElfsight = () => {
        if (document.querySelector('script[src*="elfsightcdn.com"]')) return;
        const script = document.createElement('script');
        script.src = 'https://elfsightcdn.com/platform.js';
        script.async = true;
        document.head.appendChild(script);
    };

    if (elfsightWrapper) {
        if (!hasObserver) {
            loadElfsight();
        } else {
            const elfsightObserver = new IntersectionObserver((entries, obs) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        loadElfsight();
                        obs.disconnect();
                    }
                });
            }, { rootMargin: '300px 0px' });
            elfsightObserver.observe(elfsightWrapper);
        }
    }
});
