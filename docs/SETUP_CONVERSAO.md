# 🚀 Guia de Configuração da Arquitetura de Conversão

Este guia descreve o passo a passo de como alinhar suas plataformas (Google Ads, GTM e GA4) com o novo sistema de rastreamento do código. O nosso código envia para a camada de dados (DataLayer) o evento customizado **`generate_lead`** contendo variáveis contextuais como `specialty` (Cardiologia ou Infectologia), `button_location` e as UTMs.

---

## 1. Google Tag Manager (GTM)

O GTM será a ponte entre o seu site e o GA4. Ele captará o evento gerado pelo clique no WhatsApp e o enviará mastigado para o Analytics.

### Passo 1.1: Instalar o Snippet no Código
- Crie um contêiner no [Google Tag Manager](https://tagmanager.google.com/).
- Copie o snippet do GTM (`<head>` e `<body>`).
- Abra o código fonte em `public/index.html` e `public/cardiologia/index.html`.
- Substitua as seções `<!-- Google Tag Manager (GTM Placeholder) -->` geradas anteriormente pelo seu snippet real.

### Passo 1.2: Criar as Variáveis de DataLayer
No GTM, vá em **Variáveis > Nova > Variável de Camada de Dados** (Data Layer Variable) e crie uma para cada parâmetro que configuramos no JS:
- Nome da Variável: `dlv - specialty` | Nome da Camada de Dados: `specialty`
- Nome da Variável: `dlv - button_location` | Nome da Camada de Dados: `button_location`
- Nome da Variável: `dlv - gclid` | Nome da Camada de Dados: `gclid`

### Passo 1.3: Criar o Acionador (Trigger)
- Vá em **Acionadores > Novo > Evento Personalizado**.
- Nome do Evento: `generate_lead`
- Definir para disparar em "Todos os Eventos Personalizados".

### Passo 1.4: Criar a Tag do GA4
- Certifique-se de que a **Tag de Configuração Básica do GA4** (`Google Tag` com o id `G-1Q50PEEMVX`) já está criada e disparando em *All Pages*.
- Vá em **Tags > Nova > Evento do GA4**.
- Escolha a tag de configuração base do GA4.
- Nome do Evento: `generate_lead`
- **Parâmetros do Evento:** Aqui você conecta as variáveis criadas no Passo 1.2:
  - Adicione a linha: Parâmetro `specialty` | Valor `{{dlv - specialty}}`
  - Adicione a linha: Parâmetro `button_location` | Valor `{{dlv - button_location}}`
- Adicione o Acionador (Trigger) `generate_lead` que criamos no Passo 1.3.
- Publique a versão do GTM!

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
