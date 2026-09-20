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
  - Imagens em formato **WebP** otimizadas (`cardiologia.webp` reduzido para 15 KB / -71% de payload LCP).
  - **LCP Preload** com `fetchpriority="high"` para imagens de hero acima da dobra.
  - **Elfsight Reviews Lazy-Loading:** Carregamento sob demanda do widget do Google Reviews via `IntersectionObserver` apenas quando o usuário se aproxima da seção, eliminando o bloqueio inicial da thread principal (TBT).
  - **gtag.js Deferred Loading:** O rastreamento do Google (GA4/Ads) é inicializado fora do caminho crítico — apenas no primeiro gesto do usuário (pointerdown/scroll/touch/teclado). Não há fallback por ociosidade: em página ocupada o timeout injetava o gtag dentro da janela do TBT (~1.2s de long task em mobile). Um clique no WhatsApp força a injeção na hora (`ensureGtagLoaded`), preservando a confiabilidade de `generate_lead` mesmo sem gesto prévio.
- **Security First:** 
  - Content Security Policy (CSP) rigorosa via `netlify.toml`.
  - HSTS, X-Frame-Options e Permissions Policy configurados.
- **Analytics:** Rastreamento via `gtag.js` + `dataLayer` com pipeline duplo para cliques no WhatsApp: eventos de conversão (`generate_lead`) no GA4 e persistência **first-party** durável em Netlify Blobs (sobrevive a ad-blockers). Captura UTMs, `gclid`/`gad_campaignid` e resolve IDs do Google Ads para nomes de campanha legíveis.

## 🛠️ Stack Tecnológica
- **Linguagens:** HTML5, CSS3, JavaScript (Vanilla).
- **Estilização:** Tailwind CSS (Compilado & Minificado).
- **Deployment:** CI/CD via Netlify.
- **Widgets:** Elfsight (Google Reviews integration).
- **Tracking:** gtag.js (GA4) + Netlify Functions/Blobs para métricas first-party.

---

## 📂 Estrutura do Repositório
```bash
.
├── public/                 # Assets públicos e páginas prontas (Production Root)
│   ├── cardiologia/        # LP Especializada - Dra. Anabel Lima
│   ├── assets/             # Recursos estáticos (CSS compilado, Imagens, JS)
│   ├── 404.html            # Error page customizada
│   ├── index.html          # LP Principal - Dr. Gilberto (Infectologia)
│   ├── llms.txt            # AI Agents summary mapping
│   └── sitemap.xml         # SEO Indexing
├── src/                    # Source files
│   └── css/input.css       # Tailwind entry point
├── netlify/                # Funções serverless (Netlify Functions)
│   └── functions/          # log-access (coleta) e insights (agregação) via Blobs
├── scripts/                # Automação CLI de diagnóstico e relatórios
│   ├── analyze-performance.js   # npm run analyze
│   ├── run-perf.js              # npm run perf (Lighthouse mobile)
│   ├── fetch-ga4-metrics.js     # npm run ga-metrics
│   ├── fetch-access-insights.js # npm run access-logs
│   ├── weekly-report.js         # npm run weekly-report (email do GHA)
│   └── test-csp.js              # npm run test
├── netlify.toml            # Configuração de Headers, Security & Build
├── package.json            # Scripts de automação
└── tailwind.config.js      # Customização do design system (Cores & Fonts)
```

---

## ⚙️ Workflow de Desenvolvimento

### 1. Instalação
```bash
npm install
npm run hooks:install   # ativa o pre-commit de secret scan (.githooks)
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

## 📊 Rotina de Métricas e Logs

Pipeline de conversão em duas camadas:

- **First-party (fonte de verdade confiável):** cliques no WhatsApp e visualizações são enviados via `navigator.sendBeacon` para a função Netlify `log-access`, persistidos de forma durável em **Netlify Blobs** (imune a ad-blockers) e lidos pela função `insights`.
- **Google (GA4):** o mesmo clique dispara `generate_lead` via `gtag.js` para atribuição e otimização de campanhas no Google Ads. Requer configuração no Admin do GA4 (marcar `generate_lead` como conversão e registrar a dimensão `campaign_id`).

**Identidade first-party consent-light:** cada visita gera um UUID mantido apenas em memória (sem cookies), permitindo unir eventos em usuários/sessões sem exigir consentimento de cookies.

**Métricas honestas do funil (relatório `access-logs`):**
- `Engajamento` = cliques no WhatsApp / visualizações (taxa de clique, não conversão).
- `Taxa de Lead (proxy)` = saídas p/ WhatsApp (`message_sent`, tab-hidden) / visualizações.
- `Usuários Únicos` via `client_id`; cliques e leads por campanha/especialidade com nomes legíveis.
- `Estimativa de Visitantes` (`estimated_visitors`): como `client_id` é um UUID por page-load, ele super-conta revisitantes. A estimativa agrupa eventos por uma chave **fraca e não durável** derivada server-side de `ip + user_agent + janela de 24h` (hash opaco), apenas no relatório — sem cookie, sem JS novo, sem alteração de CSP, e sem virar um identificador estável de dispositivo. É uma estimativa, não identidade: IP compartilhado/UA igual pode juntar pessoas distintas; fora da janela o mesmo visitante re-conta de propósito.
- Fontes e campanhas são **canonicalizadas server-side** (labels legíveis dos IDs do Google Ads; sem referers crus com `gclid`). Tráfego de **deploy-preview/teste** é agrupado à parte e excluído do funil de produção.

**Comandos da rotina:**
```bash
npm run analyze        # Diagnóstico de performance/Web Vitals
npm run perf           # Lighthouse mobile (index + cardiologia) p/ comparar antes/depois
npm run perf:check     # Gate de Web Vitals (falha se estourar o orçamento)
npm run access-logs    # Métricas first-party de acesso e conversão (produção)
npm run ga-metrics     # Métricas do Google Analytics 4 (requer GA4_PROPERTY_ID no .env)
npm run weekly-report  # Relatório de conversão (first-party + GA4) - email semanal
npm run product-report # Relatório de produto (rolagem/atenção) - email mensal
npm run test           # Suíte de testes CSP e integridade do pipeline
```

> **Dois relatórios, dois públicos.** O **semanal** responde "quantos contatos
> chegaram" (decisão de mídia). O **mensal** responde "como as pessoas usam o
> site" (decisão de CRO). São separados de propósito: misturar conversão com
> comportamento confunde a leitura.

### Web Vitals: medidos no CI, não no navegador

Os Core Web Vitals saíram do RUM (GA4) e viraram **gate de CI**
(`.github/workflows/perf.yml` + `scripts/perf-check.js`). O laboratório é
determinístico, mede o código do push **antes do deploy** e **falha o build** se
o orçamento de performance estourar. RUM no navegador disparava a cada
layout-shift/entrada de LCP (~19x por visita) e poluía a contagem de eventos do
GA4 sem alimentar nenhuma decisão.

> Observação: as funções `log-access`/`insights` exigem um deploy no Netlify para surtir efeito, e os campos novos (`client_id`, `campaign_label`) valem apenas para eventos ocorridos após o deploy.

### Relatório semanal automático (GitHub Actions)

O workflow `.github/workflows/weekly-metrics.yml` roda **todo sábado às 08:00 (BRT)**
e envia por email o relatório de funil first-party + GA4. A lógica fica em
`scripts/weekly-report.js`; o YAML só coleta, escreve os corpos e envia.

**Secrets necessários** (Settings → Secrets and variables → Actions):

| Secret | Descrição |
|---|---|
| `MAIL_USERNAME` | Endereço Gmail remetente (ex.: `voce@gmail.com`) |
| `MAIL_PASSWORD` | **App Password** de 16 dígitos (requer 2FA ativo no Google) |
| `MAIL_TO` | Destinatário (pode ser o mesmo do remetente) |
| `GA4_CREDENTIALS` | Conteúdo **completo** do `ga-credentials.json` (service account) |

`GA4_PROPERTY_ID` (`493028300`) e a janela não são segredo — estão no `env` do
workflow. Sem `GA4_CREDENTIALS`, o relatório ainda é enviado só com o first-party
(o endpoint `insights` é público). O workflow também publica o relatório como
**artefato** (30 dias), então falha de email não perde os números.

> **Ads (custo/R$) não entra no email.** O CLI em `ads/` é gitignored e usa OAuth
> interativo, incompatível com runner. Para o funil com custo, rode
> `npm run ads-report` na máquina (ver `AGENTS.md`).

### Relatório mensal de produto (GitHub Actions)

O workflow `.github/workflows/monthly-product.yml` roda no **primeiro sábado do
mês** e envia o relatório de comportamento no site (rolagem, botões, origem da
atenção). A lógica fica em `scripts/product-report.js`.

Usa os **mesmos secrets de email** do semanal (`MAIL_USERNAME`, `MAIL_PASSWORD`,
`MAIL_TO`); não precisa de credencial do GA4 (a fonte é o first-party).

> O `scroll_depth` só aparece após o deploy que passou a enviá-lo ao first-party;
> até lá, o relatório mostra zero nas barras de rolagem.

---

## 🔐 Segurança e Boas Práticas
O projeto segue as recomendações da **OWASP** para sites estáticos, implementando cabeçalhos de segurança que mitigam ataques de Clickjacking e XSS, garantindo que o site seja um ambiente seguro para informações médicas.

**Implementações Recentes de Hardening & SEO:**
- **Otimização de SEO & Metadados local**: Inclusão de blocos estruturados de FAQPage e seções de FAQ visuais baseadas em componentes HTML `<details>`. Configuração de Twitter Cards completos e metadados Open Graph.
- **Integração com Agentes de IA (`llms.txt`)**: Adicionado o resumo de serviços estruturado em Markdown (`public/llms.txt`) para facilitação de leituras por LLMs e robôs de busca modernos.
- **CSP (Content Security Policy) Otimizada:** Separação do Javascript de UI (Observer, Footer Year) em arquivo externo (`public/assets/js/main.js`), limpando o markup HTML e organizando as diretivas de segurança, enquanto se mantém a compatibilidade vital com ferramentas de marketing (gtag.js/GA4 e Google Ads).
- **HSTS Estrito (Preload):** `Strict-Transport-Security` configurado para 1 ano (`max-age=31536000`) com a flag `preload`, instruindo navegadores modernos a forçarem a conexão segura antes mesmo da primeira requisição de rede ser despachada.

### Proteção de credenciais (secret scanning)

Segredos nunca devem chegar ao Git. A defesa é em **três camadas independentes**:

| Camada | Ferramenta | Onde age | Cobre |
|---|---|---|---|
| 1. GitHub | Secret Scanning + Push Protection | remoto | ~200 padrões de provedores; **bloqueia o push** |
| 2. CI | `gitleaks` (`.github/workflows/gitleaks.yml`) | push/PR + semanal | histórico completo; regras + entropia; PRs de fork |
| 3. Local | `gitleaks` pre-commit (`.githooks/`) | antes do commit | o que ainda nem saiu da máquina |

> O **Dependabot** cobre dependências (CVEs), **não** segredos. As camadas acima é
> que tratam credenciais vazadas.

**Setup local (uma vez):**
```bash
npm run hooks:install     # core.hooksPath=.githooks
# opcional, proteção completa no commit:
# instale o gitleaks -> https://github.com/gitleaks/gitleaks#installing
npm run secret-scan       # varredura manual do histórico
```

A allowlist de falsos positivos fica em **`.gitleaks.toml`** — é mínima e por
**regex** (ex.: o `client_id` UUID de visitante do first-party, que não é
credencial). Nunca libere um arquivo inteiro: um arquivo que hoje só cita nome de
campo pode amanhã receber uma chave real.

---
*Desenvolvido com foco em resultados reais e excelência técnica.*
