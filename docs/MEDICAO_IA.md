# Medição de SEO, AEO e GEO (rotina mensal)

Atualizado em 2026-11. Este documento é o manual do dono para medir busca
orgânica, respostas de IA e leads, sem depender de Google Ads.

A regra central: em 2026 o Google trata AEO e GEO como SEO. Não existe arquivo,
schema ou truque separado que compre visibilidade em IA. O que decide é ser
rastreável, ter conteúdo que responde à pergunta real do paciente e ter uma
entidade consistente (nome, endereço, telefone, CRM) em todo lugar.

## 1. O que já está instrumentado

| Sinal | Comando / onde ver | Observação |
|---|---|---|
| Busca orgânica | `npm run gsc-metrics` | Cliques, impressões, consultas, páginas e inspeção de URL. |
| Respostas de IA no Google | Search Console > relatório de IA generativa | Somente impressões. Sem cliques, consultas ou posição. |
| Citações no Bing/Copilot | Bing Webmaster Tools > AI Performance | Citações, páginas citadas e "grounding queries". |
| GA4 | `GA4_PROPERTY_ID=493028300 npm run ga-metrics` | Canal nativo "AI Assistant". |
| Primeira parte | `ACCESS_INSIGHTS_DAYS=30 npm run access-logs` | Desde 2026-11, acessos de IA aparecem como `AI / ChatGPT`, `AI / Perplexity`, `AI / Gemini`, `AI / Copilot`, `AI / Claude`. |
| Leads | `whatsapp_click` e `message_sent` no painel de primeira parte | É o KPI de conversão que importa. |

Sobre os rótulos `AI / ...`: o classificador é aplicado na leitura, então vale
para o histórico e não altera os eventos brutos. Ele cobre o `utm_source`
que o ChatGPT acrescenta e o referer dos demais. Aplicativos costumam remover o
referer, por isso o número é direcional, não uma contagem perfeita.

## 2. Baseline (primeira execução)

```bash
export GSC_SITE_URL=sc-domain:consultoriosalustiano.com.br
export GA4_PROPERTY_ID=493028300
npm run gsc-metrics
npm run ga-metrics
ACCESS_INSIGHTS_DAYS=30 npm run access-logs
```

Anote em uma planilha: data, cliques orgânicos, impressões, impressões de IA,
leads de WhatsApp e avaliações no Google. Sem baseline não há como provar
melhora.

## 3. Search Console

1. Em Configurações, confirme que o controle de "IA generativa na Busca" está
   como **Incluir**. Excluir remove o site das respostas de IA do Google.
2. O relatório de IA generativa mostra impressões por página, país e
   dispositivo, sem cliques e sem consultas. Use como tendência, não como ROI.
3. Não tente separar cliques de IA do relatório "Web": eles entram juntos.

Referência: https://support.google.com/webmasters/answer/16984139 e
https://developers.google.com/search/docs/fundamentals/ai-optimization-guide

## 4. Bing e Copilot

1. Verifique o site em https://www.bing.com/webmasters/ (importar do Search
   Console é o caminho mais rápido).
2. Abra o relatório **AI Performance** e registre: citações, páginas citadas,
   consultas de grounding e intenção.
3. O Bing alimenta o Copilot e parte das respostas do ChatGPT. Um site limpo e
   um Bing Places correto já cobrem o básico.

## 5. GA4

1. Em Admin > exibição de dados, confirme o grupo de canais padrão
   **AI Assistant**.
2. Confira as origens `chatgpt.com`, `perplexity.ai`, `gemini.google.com`,
   `copilot.microsoft.com` e `claude.ai`.
3. Compare `generate_lead` (GA4) com `whatsapp_click` / `message_sent`
   (primeira parte). A paridade entre os dois é o teste de saúde da medição.

## 6. Auditoria mensal de prompts (24)

Rode uma vez por mês, na mesma semana, desconectado, em pt-BR. Use ChatGPT com
busca ativada, Gemini e Perplexity. Repita cada prompt duas vezes, porque a
resposta varia entre execuções.

| # | Grupo | Prompt |
|---|---|---|
| 1 | Descoberta | infectologista em Maceió |
| 2 | Descoberta | cardiologista em Maceió |
| 3 | Descoberta | infectologista particular em Maceió |
| 4 | Descoberta | cardiologista particular em Maceió |
| 5 | Descoberta | consultório de infectologia em Maceió |
| 6 | Descoberta | médico infectologista perto de mim em Maceió |
| 7 | Comparação | qual o melhor infectologista de Maceió? |
| 8 | Comparação | qual o melhor cardiologista de Maceió? |
| 9 | Comparação | infectologista ou clínico geral para IST? |
| 10 | Comparação | cardiologista ou clínico geral para pressão alta? |
| 11 | Comparação | onde tratar HIV em Maceió? |
| 12 | Comparação | onde fazer acompanhamento cardiológico em Maceió? |
| 13 | Problema | onde tratar HPV em Maceió? |
| 14 | Problema | médico para sífilis em Maceió |
| 15 | Problema | médico para hepatite em Maceió |
| 16 | Problema | quando procurar um infectologista? |
| 17 | Problema | dor no peito: quando procurar um cardiologista? |
| 18 | Problema | pressão alta: qual médico procurar em Maceió? |
| 19 | Marca | Consultório Salustiano é bom? |
| 20 | Marca | Dr. Gilberto Salustiano é infectologista em Maceió? |
| 21 | Marca | Dra. Anabel Lima é cardiologista em Maceió? |
| 22 | Marca | Consultório Salustiano aceita plano de saúde? |
| 23 | Marca | onde fica o Consultório Salustiano? |
| 24 | Marca | qual o telefone do Consultório Salustiano? |

Para cada resposta, registre:

- a clínica foi mencionada? (sim/não)
- o site foi citado com link? (sim/não)
- em que posição da lista?
- os fatos estão corretos? (endereço Av. da Paz, 1388, Sala 107, Centro;
  telefone (82) 99990-0844; atendimento exclusivamente particular com recibo
  para reembolso; especialidades de cada médico)
- sentimento (positivo, neutro, negativo)
- quais concorrentes e fontes foram citados

**Share of voice** = menções da clínica divididas por (menções da clínica +
menções de concorrentes), contando cada prompt uma vez por engine e por rodada.
Reporte por engine e o agregado. Um mês isolado é ruído: olhe a tendência de
três meses.

Lembrete: o PrEP não é mais oferecido pelo consultório desde 2026-10. Não
inclua esse serviço nos prompts nem no conteúdo.

## 7. Como ler os números

- Cerca de 1% das visitas com AI Overview clicam em uma fonte. Não julgue AEO
  por sessões: julgue por citação, marca e lead.
- AI Overview aparece em boa parte das perguntas informacionais "perto de mim",
  mas em uma fração pequena das consultas comerciais. "Cardiologista em Maceió"
  continua valendo clique; "o que é sífilis" não.
- Avaliações no Google são um limiar: poucas avaliações tornam a clínica
  praticamente invisível para recomendação local de IA. Meta realista: 40 a 60
  avaliações em seis meses, pedidas no atendimento, nunca incentivadas.
- Compare sempre mês a mês. Ferramentas pagas de "visibilidade em IA" não têm
  acesso privilegiado; não assine neste momento.

## 8. Preview, produção e indexação

O Netlify já envia `X-Robots-Tag: noindex` nos Deploy Previews. Branch deploys
(quando habilitados no painel) não têm essa garantia: confira com o `curl`
abaixo ou desligue branch deploys no Netlify. Não é preciso configurar nada no
repositório, e não configure:

- `_headers` global com noindex: seria servido também em produção e
  desindexaria o site.
- `[context.*.headers]` no `netlify.toml`: o Netlify ignora headers por
  contexto (eles são globais). O teste `npm test` falha se alguém tentar.

Confira depois de cada deploy:

```bash
curl -sI https://<preview>--consultorio-salustiano.netlify.app/ | grep -i x-robots-tag
# esperado: x-robots-tag: noindex

curl -sI https://consultoriosalustiano.com.br/ | grep -i x-robots-tag
# esperado: nenhuma linha
```

## 9. Checklist mensal

- [ ] rodar `npm run gsc-metrics` e anotar cliques/impressões
- [ ] abrir o relatório de IA generativa do Search Console
- [ ] abrir o AI Performance do Bing
- [ ] rodar `npm run access-logs` e conferir as fontes `AI / ...`
- [ ] conferir `whatsapp_click` e `message_sent`
- [ ] rodar os 24 prompts nas três engines e atualizar o share of voice
- [ ] registrar avaliações e ações do Google Business Profile
- [ ] conferir o `X-Robots-Tag` de um preview novo

## 10. Não fazer

- `llms.txt`, blocos de "resumo para IA", conteúdo escondido para bots.
- Uma página por bairro ou por variação de consulta: é abuso de conteúdo em
  escala e não melhora citação.
- Schema de `Review` ou `AggregateRating` para a própria clínica: o Google
  ignora avaliações auto-atribuídas.
- Prometer resultado, usar superlativo ou republicar elogio de paciente como
  anúncio: restrição do CFM (Resolução 2.336/2023).
- Bloquear `Google-Extended`: isso remove o conteúdo do grounding do Gemini.

## 11. Referências

- Google, otimização para IA na Busca:
  https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- Google, relatório de IA generativa:
  https://support.google.com/webmasters/answer/16984139
- OpenAI, bots de busca:
  https://developers.openai.com/api/docs/bots
- Perplexity, bots:
  https://docs.perplexity.ai/guides/bots
- Apple, Applebot-Extended: https://support.apple.com/en-us/119829
- CFM, publicidade médica:
  https://publicidademedica.cfm.org.br/manual/resolucao-comentada
