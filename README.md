# 🏥 Landing Page Médica de Alta Conversão

**Projeto Freelance** | Consultório Dr. Gilberto Salustiano & Dra. Anabel Lima
*Maceió, AL - Brasil*

🔗 **URL Live:** [https://consultoriosalustiano.com.br/](https://consultoriosalustiano.com.br/)

Este repositório contém o código de uma solução web estática desenvolvida para um consultório médico, focada em transformar tráfego de campanhas do **Google Ads** em agendamentos via **WhatsApp**.

---

## 🎯 O Desafio
O cliente necessitava de uma presença digital que fosse extremamente rápida no carregamento (especialmente em conexões móveis) e que transmitisse a autoridade de 40 anos de experiência clínica. O foco principal era a **conversão direta**: cada elemento da página foi desenhado para guiar o usuário ao botão de agendamento.

## 🚀 Solução Técnica
Para garantir performance máxima e custo zero de manutenção de servidor, optei por uma arquitetura **JAMstack**:

-   **Frontend:** HTML5 semântico e **Tailwind CSS** (compilado para produção).
-   **Performance:** Zero dependências de CDNs externas no caminho crítico de renderização, garantindo um LCP (Largest Contentful Paint) baixíssimo.
-   **Segurança:** Configuração rigorosa de cabeçalhos via `netlify.toml` (CSP, HSTS, X-Frame-Options).
-   **Analytics:** Integração profunda com **Google Tag Manager** e **GA4**, com rastreamento customizado de cliques no WhatsApp (`generate_lead`).

## 🛠️ Tecnologias Utilizadas
-   **HTML5 / JavaScript (Vanilla)**
-   **Tailwind CSS 3.4** (estilização moderna e responsiva)
-   **Netlify** (Hospedagem e CI/CD)
-   **Google Tag Manager / Analytics** (Monitoramento de conversão)
-   **Node.js** (Ambiente de build para o CSS)

---

## 📂 Estrutura do Projeto
```bash
.
├── cardiologia/            # Landing Page da Dra. Anabel Lima (Cardiologista)
│   └── index.html
├── css/
│   └── style.css           # CSS final compilado pelo Tailwind
├── dr-gilberto-salustiano-infectologista.webp # Imagem principal otimizada
├── index.html              # Landing Page Principal (Dr. Gilberto - Infectologia)
├── netlify.toml            # Configurações de deploy, segurança e headers
├── package.json            # Scripts de build e dependências de dev
├── tailwind.config.js      # Configurações do framework CSS
└── robots.txt / sitemap.xml # SEO básico configurado
```

---

## ⚙️ Como Executar Localmente

### Pré-requisitos
-   [Node.js](https://nodejs.org/) instalado.

### Instalação
```bash
npm install
```

### Build do CSS (Tailwind)
Para gerar o arquivo `css/style.css` a partir do `input.css` e das classes usadas no HTML:
```bash
npm run build:css
```

---

## 🔐 Segurança e Boas Práticas
O projeto implementa uma **Content Security Policy (CSP)** rigorosa para prevenir ataques XSS, além de forçar conexões via HTTPS (HSTS) e desabilitar recursos desnecessários do navegador via Permissions Policy.

---

## 📈 Resultados Esperados
-   **Mobile First:** Experiência fluida em smartphones, principal origem do tráfego de anúncios.
-   **SEO-Ready:** Microdados e meta-tags Open Graph configurados para compartilhamento profissional em redes sociais e WhatsApp.
-   **Manutenibilidade:** Código limpo e modular, permitindo a adição de novas especialidades (como visto na subpasta `/cardiologia`) com esforço mínimo.

---
*Desenvolvido com foco em resultados reais para a área da saúde.*

