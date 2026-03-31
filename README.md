# lp-consultorio

Landing Page para o consultório do Dr. Gilberto Salustiano, Médico Infectologista e Clínico Geral em Maceió - AL. O projeto é um site de página única estático otimizado para conversão de pacientes via WhatsApp, com foco em performance visual rápida e segurança, hospedado na plataforma Netlify.

## Estrutura do Site (`index.html`)

O site é construído de forma estática com HTML, CSS e JavaScript simples para maximizar a velocidade e reduzir a complexidade:

- **Ebook/Página Única:** A interface possui seções de Hero, Experiência (Trust Bar), Especialidades, Sobre o Médico, Benefícios de agendar e o CTA Principal.
- **Estilo & Performance:** Utiliza **Tailwind CSS** compilado de forma estática para um arquivo `css/style.css`. Isso elimina as dependências do CDN no cliente, melhorando vertiginosamente o LCP e eliminando tempo de carregamento de telas brancas sem estilo (FOUC).
- **SEO & Social (Open Graph):** Possui tags de compartilhamento configuradas (`og:image`, `og:title`, etc) otimizadas para WhatsApp e Redes Sociais. É necessário apenas modificar a tag indicando o domínio final no `index.html`.
- **Rastreamento de Conversões (Analytics):** Google Tag Manager / Analytics (`gtag.js`) está configurado para monitorar visitas. As interações nos botões do WhatsApp invocam a função `trackWhatsAppClick()`, registrando um evento customizado (`generate_lead`) indicando onde o clique ocorreu.

## Implantação e Deploy (`netlify.toml` e Build Node)

O projeto está configurado para ser publicado e servido pela infraestrutura global do **Netlify**. 

- **Processo de Build Dinâmico:** O Netlify foi instruído a executar o comando `npm run build:css` em todo novo *deploy*. Isso lê o `input.css`, extrai as sintaxes do Tailwind presentes no `index.html` e cospe o CSS minificado final na pasta `.css/style.css` sem intervenção manual.
- **Headers de Segurança Injetados (`netlify.toml`):**
  - `X-Frame-Options: DENY`: Impede o carregamento da página por `<frame>` ou `<iframe>`, prevenindo *clickjacking*.
  - `Strict-Transport-Security` (HSTS): Força todas as conexões via HTTPS.
  - `X-Content-Type-Options: nosniff`: Protege o site contra manipulações de tipos MIME.
  - `Permissions-Policy`: Restringe ativamente o acesso do navegador a recursos locais do usuário (Microfone, Câmera, Geolocalização) ao domínio original.
  - **Content-Security-Policy (CSP):** Rigorosa política que autoriza os scripts, conexões e estilos apenas originários do GTM (`www.googletagmanager.com`), Google Analytics (`region1.google-analytics.com`, `www.google-analytics.com`), Ads e domínios da marca, blindando contra injeções XSS.

