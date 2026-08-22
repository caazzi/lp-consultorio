# 🆕 Próximos Passos — Desbloquear `generate_lead` no GA4/Google Ads

> Status ao voltar a este projeto: o código-fonte **já está pronto e em produção**.
> `generate_lead` é disparado de forma **confiável** via gtag.js, mas ainda **não aparece
> no GA4** até você completar as configurações manuais abaixo (tudo no painel Google).

---

## Contexto rápido (para retomar sem perder tempo)

- O site usa **gtag.js direto** (ID `G-1Q50PEEMVX`) — **não usa GTM**.
  (O doc antigo `SETUP_CONVERSAO.md` menciona GTM, mas **ficou desatualizado**: não há container GTM.)
- Todo clique em WhatsApp dispara `generate_lead` + `message_sent` via `sendGtagConversion()`
  em `public/assets/js/tracking.js`.
- A causa do `generate_lead = 0` era uma **corrida de carregamento**: o gtag era carregado **lazy**
  (só após interação) e o evento se perdia antes do script inicializar. **Corrigido** carregando o
  gtag de forma **eager** em `public/index.html` e `public/cardiologia/index.html`.
- Existe um **beacon first-party** (Netlify Blobs) que **sempre** registra cliques, mesmo quando o
  Google é bloqueado por ad-blocker. É a nossa **fonte de verdade** confiável.

**Por que o `generate_lead` ainda não aparece no GA4?**
GA4 tem latência de processamento (4h–48h). O evento só aparece em **Admin → Eventos** depois de
coletado. Se mesmo após ~48h **não** aparecer, o problema é coleta (ad-blocker bloqueando o gtag) —
veja a seção "Depuração" no fim.

---

## Passo a passo obrigatório (painel Google)

### Passo 1 — Marcar `generate_lead` como Conversão (GA4)
1. [analytics.google.com](https://analytics.google.com) → engrenagem **Administração** (inferior esquerdo).
2. Sua **Propriedade** → menu **Conversões** → **Eventos**.
3. Procure **`generate_lead`** e ative o interruptor (ou menu ⋮ → **Marcar como conversão**).
4. ⚠️ **Não crie o evento manualmente.** Eventos são enviados pelo código. Eles aparecem sozinhos
   depois que o GA4 os processa. Se ainda não apareceu, espere e revise em ~24h.
5. Opcional: marque também **`message_sent`** como conversão **secundária** (proxy de mensagem enviada).

### Passo 2 — Criar a dimensão personalizada "Campaign ID" (GA4)
1. **Administração** → **Definições personalizadas** (em "Displays de dados"/"Coleta de dados").
2. **+ Criar dimensão personalizada**:
   - Nome da dimensão: `Campaign ID`
   - Escopo: **Evento**
   - Parâmetro do evento: `campaign_id`
3. Salvar.

> Isso permite cruzar o relatório de `generate_lead` por campanha e saber qual anúncio converte.

### Passo 3 — Vincular contas Google Ads ↔ GA4
1. **Administração** → **Links de produtos** → **Links do Google Ads**.
2. **Link** → selecionar a conta do Ads → **Confirmar**.

### Passo 4 — Importar a conversão no Google Ads
1. [ads.google.com](https://ads.google.com) → **Ferramentas e configurações** (ícone chave) → **Conversões**.
2. **+ Nova ação de conversão** → **Importar** → **Google Analytics 4** → **Continuar**.
3. Selecionar a propriedade → marcar **`generate_lead`** → **Importar e continuar**.
4. Vai aparecer "Sem atividade recente" no início — **normal** para import recém-feito.

### Passo 5 — Tornar `generate_lead` a meta principal (para lances automáticos)
1. Em **Conversões** (Google Ads), localize **`generate_lead`**.
2. Escolha **Marcar como principal** — o algoritmo de Smart Bidding otimiza para a conversão principal.

### Passo 6 — (Recomendado) Confirmar lances por campanha
- Campanhas: **23071806673** = Infectologia (Dr. Gilberto) · **23747859815** = Cardiologia (Dra. Anabel).
- **Configurações → Lances**: se estiver em **Maximizar conversões** ou **CPA desejado**, confirme que
  a meta referencia `generate_lead`.
- Para ver qual anúncio/palavra-chave converte: na tabela de campanhas, adicione a coluna
  **Conversões → Generate_lead**.

---

## Verificação de ponta a ponta (depois dos Passos 1–6)

1. Clique em um botão de WhatsApp no site (janela anônima, sem ad-blocker).
2. Aguarde ~24h.
3. Do terminal:
   ```bash
   npm run ga-metrics      # deve mostrar generate_lead agora
   npm run access-logs     # mostra campanhas legíveis + funil (client_id/campaign_label)
   ```

---

## Depuração — se `generate_lead` NUNCA aparece no GA4

Se mesmo após 48h e passos acima não houver `generate_lead` em **Admin → Eventos**, o gtag de conversão
está sendo **bloqueado/descartado** no navegador. Como o beacon first-party registra o clique de qualquer
forma, compare os dois:

**Testar no navegador (incognito, ad-blocker OFF):**
1. Abra o site, clique em um botão de WhatsApp.
2. **DevTools → Network**, filtre por `collect` ou `google-analytics`.
3. Procure requisição com `en=generate_lead` (ou `en=generate_lead`).

- ✅ **Viu a requisição** → o GA4 recebeu; é só latência. Aguarde e revise.
- ❌ **Não viu** → gtag bloqueado (ad-blocker, extensão, CSP, etc.). O beacon first-party continua
  funcionando. Decisões sobre confiabilidade do Ads **devem** usar o relatório `access-logs` como fonte.

**Verificar coleta rápida (GA4):**
1. **GA4 → Admin → Fluxo de dados → seu stream**.
2. Clique em "Ver eventos recentes" (ou DebugView) para ver em tempo real se `generate_lead` entra.

---

## Notas importantes

- **Custos/atribuição:** com `campaign_id` + `generate_lead` marcado como conversão, o Google Ads passa
  a otimizar o lance por campanha de verdade (Maximizar Conversões/CPA). Só treine o algoritmo após
  acumular ~15 conversões `generate_lead` em 30 dias na conta.
- **Limite do proxy `message_sent`:** é um proxy (guia o tab para o WhatsApp). A confirmação definitiva de
  envio exige integração com a **WhatsApp Business API / webhooks** (fora do escopo, stubs já comentados
  no código).
- **Deploy:** qualquer alteração em `netlify/functions/` ou nos HTML/JS exige push → o Netlify
  auto-deploya. Os campos novos (`client_id`, `campaign_label`) só valem para eventos **após o deploy**.
