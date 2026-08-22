# 🚀 Guia de Configuração da Arquitetura de Conversão

Este guia alinha suas plataformas (Google Ads e GA4) com o sistema de rastreamento do código. O código envia
para o GA4 o evento customizado **`generate_lead`** contendo variáveis contextuais como `specialty`
(Cardiologia ou Infectologia), `button_location` e as UTMs.

> ⚠️ **Importante — este projeto usa `gtag.js` diretamente, NÃO GTM.**
> Não há *Google Tag Manager* neste projeto. O site carrega o snippet nativo do gtag.js (`G-1Q50PEEMVX`)
> sem container GTM. Toda a configuração de eventos é feita **em código** (`public/assets/js/tracking.js`);
> a configuração manual fica no **GA4/Google Ads** (painel Google).

---

## 1. Como o rastreamento funciona (código já está em produção)

- **`public/index.html` / `public/cardiologia/index.html`**: carregam o gtag.js de forma **eager**
  (imediata) e registram a dimensão `campaign_id`.
- **`public/assets/js/tracking.js`**: a função `sendGtagConversion('generate_lead', {...})` dispara o
  evento de forma confiável a cada clique em botão de WhatsApp, **antes** de abrir o link.
- **Primeira causa histórica do `generate_lead = 0`:** o gtag era carregado **lazy** (só após interação) e o
  evento se perdia antes do script inicializar. **Correção:** carregamento eager + helper que espera o
  gtag real estar pronto antes de disparar.
- Existe um **beacon first-party** (Netlify Blobs) que **sempre** registra cliques, mesmo quando o Google é
  bloqueado por ad-blocker. É a nossa **fonte de verdade** confiável.

**Não é preciso criar o evento na UI** — ele é enviado pelo código e o GA4 o registra automaticamente.

> **Por que o `generate_lead` ainda não aparece?** GA4 tem latência de processamento (4h–48h). O evento só
> aparece em **Admin → Eventos** depois de coletado. Se mesmo após ~48h não aparecer, o problema é coleta
> (ex.: ad-blocker) — veja **Seção 7 (Depuração)**.

---

## 2. Google Analytics 4 (GA4) — Configuração manual

### Passo 2.1: Registrar as dimensões personalizadas
Relatórios com quem e qual versão do botão gerou o lead:
- **Administração (Engrenagem) > Definições Personalizadas**.
- Crie cada dimensão:
  - Nome: `Especialidade` | Parâmetro do evento: `specialty`
  - Nome: `Local do Botao` | Parâmetro do evento: `button_location`
  - Nome: `Campaign ID` (para CVR por campanha) | Parâmetro do evento: `campaign_id` | Escopo: **Evento**

> O evento `generate_lead` e o proxy `message_sent` já enviam `campaign_id`. Com isso você cruza
> **Eventos > generate_lead** por **Campaign ID** e descobre qual anúncio converte.

### Passo 2.2: Marcar `generate_lead` como conversão
- **Administração > Conversões** → **Eventos**.
- Encontre **`generate_lead`** e ative o interruptor (ou ⋮ → **Marcar como conversão**).
- ⚠️ **Não crie o evento manualmente.** Ele aparece sozinho após o GA4 processar (pode levar ~24h).
  Se ainda não apareceu, aguarde e revise.
- Opcional: marque **`message_sent`** como conversão **secundária** (proxy de mensagem enviada).

---

## 3. Google Ads — Configuração manual

Considerando 2 campanhas independentes: **23071806673** = Infectologia (Dr. Gilberto) ·
**23747859815** = Cardiologia (Dra. Anabel).

### Passo 3.1: Vincular contas Google Ads ↔ GA4
- **GA4 > Administração > Links de produtos > Links do Google Ads** → **Link** → selecionar a conta → **Confirmar**.

### Passo 3.2: Importar a conversão
- **Google Ads > Ferramentas e configurações** → **Conversões**.
- **+ Nova ação de conversão** → **Importar** → **Google Analytics 4** → **Continuar**.
- Selecionar a propriedade → marcar **`generate_lead`** → **Importar e continuar**.
- Aparecerá "Sem atividade recente" no início — **normal** para import recém-feito.

### Passo 3.3: Tornar `generate_lead` a meta principal (lances automáticos)
- Em **Conversões**, localize **`generate_lead`** → **Marcar como principal**.

### Passo 3.4: Estruturar as campanhas
**Infectologia (Dr. Gilberto):**
- URL Final: `https://consultoriosalustiano.com.br/`
- Palavras-chave exatas sugeridas: `[infectologista maceio]`, `[consulta com infectologista]`, `[medico hiv maceio]`.

**Cardiologia (Dra. Anabel):**
- URL Final: `https://consultoriosalustiano.com.br/cardiologia/`
- Mesma ação de conversão (mesma `generate_lead`); o algoritmo usa o GCLID para atribuir o lead à campanha
  certa — sem precisar duplicar a medição.
- Palavras-chave exatas sugeridas: `[cardiologista maceio]`, `[medico cardiologista particular]`, `[consulta cardiologista maceio]`.

### Passo 3.5: Confirmar lances por campanha
- **Configurações → Lances**: se em **Maximizar conversões** ou **CPA desejado**, confirme que a meta
  referencia `generate_lead`.
- Para ver qual anúncio/palavra-chave converte: adicione a coluna **Conversões → Generate_lead** na tabela.

### Passo 3.6 (Dica sênior): Rampa de Smart Bidding
1. Inicie com **Maximizar cliques** para gerar tráfego rápido e treinar a tag.
2. A partir de ~**15 conversões `generate_lead`** vindas de anúncios em 30 dias, troque para
   **CPA desejado** ou **Maximizar conversões** (aproveita o aprendizado de máquina).

---

## 4. Passagem de UTMs para o link do WhatsApp

Ao clicar em **qualquer** botão de WhatsApp (Hero, Header, Cards ou Sticky), o código reescreve o `href`
adicionando `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid` e `gbraid`
(quando presentes).

**Por que importa:** o atendente vê no próprio WhatsApp qual campanha originou a conversa — sem depender só
de relatório. Combine com a dimensão `campaign_id` para fechar o ciclo. Exige apenas o **auto-tagging** do
Google Ads ativo (padrão) para preencher `gclid`.

---

## 5. Consulta de dados via CLI (Netlify Blobs)

Os eventos são persistidos de forma **durável** no Netlify Blobs. Para ver acessos e conversão:

```bash
npm run access-logs
```

Ou via API (automação/cron):

```bash
curl "https://consultoriosalustiano.com.br/.netlify/functions/insights?days=7"
```

A resposta inclui `summary.messages_sent`, `summary.engagement_rate`, `summary.lead_proxy_rate`,
`summary.unique_users` e a quebra por campanha/especialidade (com nomes legíveis via `campaign_label`).

---

## 6. Verificação ponta a ponta

1. Clique em um botão de WhatsApp no site (janela anônima, sem ad-blocker).
2. Aguarde ~24h.
3. Do terminal:
   ```bash
   npm run ga-metrics      # deve mostrar generate_lead agora
   npm run access-logs     # mostra campanhas legíveis + funil (client_id/campaign_label)
   ```

---

## 7. Depuração — se `generate_lead` NUNCA aparece no GA4

Se mesmo após 48h e passos acima não houver `generate_lead` em **Admin → Eventos**, o gtag de conversão
está sendo **bloqueado/descartado** no navegador. Como o beacon first-party registra o clique de qualquer
forma, compare os dois:

**Testar no navegador (incognito, ad-blocker OFF):**
1. Abra o site e clique em um botão de WhatsApp.
2. **DevTools → Network**, filtre por `collect` ou `google-analytics`.
3. Procure requisição com `en=generate_lead`.

- ✅ **Viu a requisição** → o GA4 recebeu; é só latência. Aguarde e revise.
- ❌ **Não viu** → gtag bloqueado (ad-blocker, extensão, CSP, etc.). O beacon first-party continua
  funcionando. Decisões sobre confiabilidade do Ads **devem** usar o relatório `access-logs` como fonte.

**Verificar coleta rápida (GA4):**
1. **GA4 > Administração > Fluxo de dados > seu stream**.
2. "Ver eventos recentes" (ou DebugView) para ver em tempo real se `generate_lead` entra.

---

## 8. Notas importantes

- **Custos/atribuição:** com `campaign_id` + `generate_lead` marcado como conversão, o Google Ads passa a
  otimizar o lance por campanha de verdade (Maximizar Conversões/CPA). Só treine o algoritmo após ~15
  conversões `generate_lead` em 30 dias.
- **Limite do proxy `message_sent`:** é um proxy (guia o tab para o WhatsApp). A confirmação definitiva de
  envio exige integração com a **WhatsApp Business API / webhooks** (fora do escopo; stubs já comentados no
  código).
- **Deploy:** qualquer alteração em `netlify/functions/` ou nos HTML/JS exige push → o Netlify auto-deploya.
  Campos novos (`client_id`, `campaign_label`) só valem para eventos **após o deploy**.

---

*Qualquer alteração no site ou novas páginas de médicos vão puxar essa mesma base.*
