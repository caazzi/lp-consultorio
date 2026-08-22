# 🚀 Guia de Configuração da Arquitetura de Conversão

Este guia descreve o passo a passo de como alinhar suas plataformas (Google Ads e GA4) com o novo sistema de rastreamento do código. O nosso código envia para o GA4 o evento customizado **`generate_lead`** contendo variáveis contextuais como `specialty` (Cardiologia ou Infectologia), `button_location` e as UTMs.

> ⚠️ **Nota importante — este projeto usa `gtag.js` diretamente, NÃO GTM.**
> Anteriormente este guia descrevia uma integração com o *Google Tag Manager* (GTM), mas o site
> carrega o snippet nativo do gtag.js (`G-1Q50PEEMVX`) sem container GTM. Não há placeholder de GTM
> no código. Toda a configuração de eventos é feita **em código** (`public/assets/js/tracking.js`) e
> a configuração manual fica no **GA4/Google Ads**, não no GTM. As seções a seguir refletem isso.

---

## 1. Disparo de conversão no código (gtag.js)

Não há tags para criar — o código já envia os eventos. Os scripts relevantes:

- **`public/index.html` / `public/cardiologia/index.html`**: carregam o gtag.js de forma **eager**
  (imediata) e registram a dimensão `campaign_id`.
- **`public/assets/js/tracking.js`**: função `sendGtagConversion('generate_lead', {...})` dispara o
  evento confiável a cada clique em botão de WhatsApp, antes de abrir o link.

Não é preciso criar o evento na UI — ele é enviado pelo código. O GA4 o registra automaticamente.

---

## 2. Google Analytics 4 (GA4)

### Passo 2.1: Registrar as Dimensões Personalizadas
Isso permite que você crie relatórios no GA4 sabendo exatamente qual versão do formulário as pessoas apertaram e para qual médico.
- No GA4, vá em **Administração (Engrenagem) > Definições Personalizadas**.
- Crie uma **Nova Dimensão Personalizada**:
  - Nome da dimensão: `Especialidade` | Parâmetro do evento: `specialty`
  - Nome da dimensão: `Local do Botao` | Parâmetro do evento: `button_location`

### Passo 2.2: Marcar Evento como Conversão Master
- Vá em **Administração > Conversões** (ou Eventos, dependendo da versão do painel).
- Encontre o evento `generate_lead` e marque a chave de alternância para o lado direito (Transformando em **Conversão**).
*(Nota: Se for a primeira vez instalando, pode demorar até 24h para o evento aparecer na lista. Caso demore, você pode criar a conversão manualmente digitando exatamente `generate_lead`).*

---

## 3. Google Ads

Considerando a sua estrutura de 2 campanhas independentes (Infectologia vs Cardiologia).

### Passo 3.1: Importar Conversões
- Garanta que sua conta do GA4 está vinculada ao Google Ads (em *Ferramentas e Configurações > Contas Vinculadas > GA4*).
- Vá em **Metas > Conversões > Nova ação de conversão > Importar > Google Analytics 4 (Web)**.
- Importe o evento `generate_lead`. Mude a atribuição dele para ser sua **Meta Principal**.

### Passo 3.2: Estruturar a Campanha de Infectologia (Dr. Gilberto)
- URL Final do Anúncio: `https://consultoriosalustiano.com.br/`
- Meta de Conversão: A conta inteira vai otimizar para `generate_lead`.
- Palavras-chave Exatas recomendadas: `[infectologista maceio]`, `[consulta com infectologista]`, `[medico hiv maceio]`.

### Passo 3.3: Estruturar a Campanha de Cardiologia (Dra. Anabel)
- URL Final do Anúncio: `https://consultoriosalustiano.com.br/cardiologia/`
- Meta de Conversão: A conta inteira vai otimizar para `generate_lead`. O algoritmo do Google Ads é inteligente o suficiente para saber, via GCLID (ID do Clique), qual campanha originou aquele lead específico. Sendo a mesma ação em URLs diferentes, você não precisa medir as ações no Ads em duplicidade!
- Palavras-chave Exatas recomendadas: `[cardiologista maceio]`, `[medico cardiologista particular]`, `[consulta cardiologista maceio]`.

### Passo 3.4 (Dica Sênior): Lances e Aprendizado (Smart Bidding)
1. Inicie com **Maximizar Cliques** caso queira ganhar tráfego rápido para treinar a tag.
2. Assim que bater ~15 conversões `generate_lead` vindos de anúncios nos últimos 30 dias na conta, altere a estratégia de lances das duas campanhas para **CPA Desejado** ou **Maximizar Conversões**. Isso vai extrair o suco máximo do aprendizado de máquina.

BOA SORTE nas campanhas! Quaisquer alterações no site ou novas páginas de médicos no futuro vão puxar essa mesma base!

---

# 🆕 Atualizações Recentes (rastreamento avançado)

## 4. Dimensão Personalizada `campaign_id` (CVR por campanha)

O código agora anexa as UTMs ao link real do WhatsApp ao clicar, e envia o parâmetro `campaign_id` em eventos de conversão. Isso permite calcular qual campanha do Google Ads **de fato** gera leads.

### Passo 4.1: Registrar a dimensão no GA4
- No GA4, vá em **Administração > Definições Personalizadas**.
- Crie uma **Nova Dimensão Personalizada**:
  - Nome da dimensão: `Campaign ID`
  - Parâmetro do evento: `campaign_id`
  - Escopo: **Evento**

> O evento `generate_lead` e o novo `message_sent` já enviam `campaign_id`. Com isso você cruza o relatório **Eventos > generate_lead** quebrado por **Campaign ID** e descobre qual anúncio converte.

### Passo 4.2: Marcar `message_sent` como conversão (opcional)
- Em **Administração > Conversões**, adicione o evento `message_sent` como **Conversão secundária**.
- `message_sent` é um **proxy**: dispara quando o usuário sai da página rumo ao WhatsApp logo após clicar em um CTA. É um forte indicador de que a conversa foi aberta com o atendente.
- ⚠️ **Limite:** a confirmação definitiva de que a mensagem foi enviada/respondeu exige integração com a API do WhatsApp (fora do escopo atual, o atendente cuida do chat).

## 5. Passagem de UTMs para o link do WhatsApp

Quando um usuário clica em **qualquer** botão de WhatsApp (Hero, Header, Cards ou Sticky), o código reescreve o `href` adicionando `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid` e `gbraid` (quando presentes).

**Por que importa:** agora o atendente vê no próprio WhatsApp qual campanha originou a conversa — sem depender só de relatório. Combine com a dimensão `campaign_id` para fechar o ciclo. Exige apenas o **auto-tagging** do Google Ads ativo (padrão) para preencher `gclid`.

## 6. Consulta de dados via CLI (Netlify Blobs)

Os eventos são persistidos de forma **durável** no Netlify Blobs (não mais em arquivo efêmero local). Para ver acessos e cliques de conversão:

```bash
npm run access-logs
```

E via API (útil para automação/ha-um-cron):

```bash
curl "https://consultoriosalustiano.com.br/.netlify/functions/insights?days=7"
```

A resposta inclui `summary.messages_sent`, `summary.conversion_rate` e a quebra por campanha/especialidade.

---

## 7. Próximos passos

Este guia documenta a arquitetura. Para o **checklist de configuração manual** no GA4/Google Ads
(necessário para `generate_lead` virar conversão e otimizar lances), ver:

- **`docs/passos-ga4-google-ads.md`** — passos obrigatórios + depuração se o evento não aparecer.
