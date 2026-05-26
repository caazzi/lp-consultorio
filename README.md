# 🏥 Landing Page Médica de Alta Performance

> **Projeto Premium** | Consultório Dr. Gilberto Salustiano & Dra. Anabel Lima
> *Maceió, AL - Brasil*

[![Live Demo](https://img.shields.io/badge/URL-consultoriosalustiano.com.br-blue?style=for-the-badge&logo=google-chrome&logoColor=white)](https://consultoriosalustiano.com.br/)
[![Hosting: Netlify](https://img.shields.io/badge/Netlify-00AD9F?style=for-the-badge&logo=netlify&logoColor=white)](https://www.netlify.com/)
[![Aesthetics: Premium](https://img.shields.io/badge/Design-Glassmorphism-teal?style=for-the-badge)](https://consultoriosalustiano.com.br/)

Esta solução JAMstack de alta performance foi desenvolvida para um consultório médico de elite, focada na conversão direta de tráfego vindo de campanhas do **Google Ads** em agendamentos via **WhatsApp**.

---

## 🎯 Objetivo Estratégico
O projeto resolve a necessidade de uma presença digital que transmita **autoridade (40 anos de experiência)** e **confiança**, garantindo um carregamento instantâneo em conexões móveis (3G/4G).

- **Foco em Conversão:** Layout otimizado para o "Golden Path" do paciente.
- **UX Particular:** Filtragem de leads para atendimento exclusivo/particular.
- **Identidade:** Cores baseadas no "Turquesa Maceió" e estética minimalista/hospitalar.

## 🚀 Arquitetura e Performance
Para atingir scores de 95+ no Lighthouse e garantir custo zero de escala, a arquitetura utiliza:

- **Frontend Core:** HTML5 Semântico + Tailwind CSS 3.4.
- **Asset Optimization:**
  - Imagens em formato **WebP** com fallback automático.
  - **LCP Preload** para imagens de hero acima da dobra.
  - **GTM Lazy-Loading:** Scripts de rastreamento disparados apenas após interação do usuário (scroll/mouse), reduzindo o bloqueio inicial da thread principal.
- **Security First:** 
  - Content Security Policy (CSP) rigorosa via `netlify.toml`.
  - HSTS, X-Frame-Options e Permissions Policy configurados.
- **Analytics:** Rastreamento customizado via `dataLayer` para cliques no WhatsApp, capturando UTMs de campanha para atribuição precisa.

## 🛠️ Stack Tecnológica
- **Linguagens:** HTML5, CSS3, JavaScript (Vanilla).
- **Estilização:** Tailwind CSS (Compilado & Minificado).
- **Deployment:** CI/CD via Netlify.
- **Widgets:** Elfsight (Google Reviews integration).
- **Tracking:** Google Tag Manager + GA4.

---

## 📂 Estrutura do Repositório
```bash
.
├── public/                 # Assets públicos e páginas prontas (Production Root)
│   ├── cardiologia/        # LP Especializada - Dra. Anabel Lima
│   ├── assets/             # Recursos estáticos (CSS compilado, Imagens, JS)
│   ├── 404.html            # Error page customizada
│   ├── index.html          # LP Principal - Dr. Gilberto (Infectologia)
│   └── sitemap.xml         # SEO Indexing
├── src/                    # Source files
│   └── css/input.css       # Tailwind entry point
├── netlify.toml            # Configuração de Headers, Security & Build
├── package.json            # Scripts de automação
└── tailwind.config.js      # Customização do design system (Cores & Fonts)
```

---

## ⚙️ Workflow de Desenvolvimento

### 1. Instalação
```bash
npm install
```

### 2. Build de Produção (CSS)
Gera o arquivo otimizado e minificado para `public/assets/css/style.css`:
```bash
npm run build:css
```

### 3. Preview Local
Recomendado usar o `serve` ou a CLI do Netlify:
```bash
npx serve public
```

---

## 🔐 Segurança e Boas Práticas
O projeto segue as recomendações da **OWASP** para sites estáticos, implementando cabeçalhos de segurança que mitigam ataques de Clickjacking e XSS, garantindo que o site seja um ambiente seguro para informações médicas.

**Implementações Recentes de Hardening:**
- **CSP (Content Security Policy) Otimizada:** Separação do Javascript de UI (Observer, Footer Year) em arquivo externo (`public/assets/js/main.js`), limpando o markup HTML e organizando as diretivas de segurança, enquanto se mantém a compatibilidade vital com ferramentas de marketing (GTM e Google Ads).
- **HSTS Estrito (Preload):** `Strict-Transport-Security` configurado para 1 ano (`max-age=31536000`) com a flag `preload`, instruindo navegadores modernos a forçarem a conexão segura antes mesmo da primeira requisição de rede ser despachada.

---
*Desenvolvido com foco em resultados reais e excelência técnica.*
