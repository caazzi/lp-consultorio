const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

console.log('\x1b[36m%s\x1b[0m', '=======================================================');
console.log('\x1b[36m%s\x1b[0m', ' 📊 RELATÓRIO DO GOOGLE ANALYTICS 4 (GA4 DATA API) ');
console.log('\x1b[36m%s\x1b[0m', '=======================================================\n');

// 1. Localizar arquivo de credenciais da Service Account
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../ga-credentials.json');

if (!fs.existsSync(credPath)) {
  console.log('\x1b[33m%s\x1b[0m', '⚠️  Arquivo de credenciais (ga-credentials.json) não encontrado!');
  console.log('\nPara conectar o terminal diretamente ao seu Google Analytics 4:');
  console.log(' 1. Crie uma Service Account no Google Cloud Console.');
  console.log(' 2. Baixe a chave JSON e salve como ga-credentials.json na raiz do projeto.');
  console.log(' 3. No GA4 (Administração > Gestão de Acesso), adicione o e-mail da Service Account como Leitor.');
  console.log(' 4. Configure o ID numérico da Propriedade no script ou na variável GA4_PROPERTY_ID.\n');
  process.exit(0);
}

let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
} catch (err) {
  console.error('\x1b[31m❌ Erro ao ler o arquivo ga-credentials.json:\x1b[0m', err.message);
  process.exit(1);
}

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '493028300';

/**
 * Função utilitária para assinar JWT e obter Access Token da Service Account
 */
function getAccessToken(cred) {
  return new Promise((resolve, reject) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claimSet = Buffer.from(JSON.stringify({
      iss: cred.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })).toString('base64url');

    const signatureInput = `${header}.${claimSet}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = signer.sign(cred.private_key, 'base64url');

    const jwt = `${signatureInput}.${signature}`;
    const postData = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString();

    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data).access_token);
        } else {
          reject(new Error(`Falha na autenticação OAuth (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Consulta a Google Analytics Data API v1beta
 */
function runGaReport(accessToken, propertyId, requestBody) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(requestBody);

    const req = https.request(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Erro da API GA4 (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  try {
    console.log(`🔑 Autenticando com Service Account: \x1b[32m${credentials.client_email}\x1b[0m...`);
    const token = await getAccessToken(credentials);
    console.log('✅ Token OAuth obtido com sucesso!');

    console.log(`\n📈 Extraindo métricas do GA4 (Propriedade: ${PROPERTY_ID})...\n`);

    // 1. Resumo Geral dos últimos 7 dias
    const overviewReport = await runGaReport(token, PROPERTY_ID, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'eventCount' }
      ]
    });

    if (overviewReport.rows && overviewReport.rows[0]) {
      const vals = overviewReport.rows[0].metricValues;
      console.log('\x1b[33m%s\x1b[0m', '📊 1. VISÃO GERAL (ÚLTIMOS 7 DIAS)');
      console.log(` - Usuários Ativos   : \x1b[36m${vals[0].value}\x1b[0m`);
      console.log(` - Novos Usuários    : \x1b[36m${vals[1].value}\x1b[0m`);
      console.log(` - Sessões Totais    : \x1b[36m${vals[2].value}\x1b[0m`);
      console.log(` - Páginas Vistas    : \x1b[32m${vals[3].value}\x1b[0m`);
      console.log(` - Eventos Disparados: \x1b[35m${vals[4].value}\x1b[0m\n`);
    }

    // 2. Acessos por Rota/Página (Últimos 7 dias)
    const pagesReport = await runGaReport(token, PROPERTY_ID, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'screenPageViews' }
      ],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }]
    });

    console.log('\x1b[33m%s\x1b[0m', '📄 2. PÁGINAS MAIS VISITADAS');
    if (pagesReport.rows && pagesReport.rows.length > 0) {
      pagesReport.rows.forEach(r => {
        const page = r.dimensionValues[0].value;
        const users = r.metricValues[0].value;
        const views = r.metricValues[1].value;
        console.log(` - ${page.padEnd(35)}: \x1b[32m${views} visualização(ões)\x1b[0m (${users} usuário(s))`);
      });
    } else {
      console.log(' - Nenhum dado de página registrado nos últimos 7 dias.');
    }

    // 3. Origem de Tráfego / Canais (Últimos 7 dias)
    const trafficReport = await runGaReport(token, PROPERTY_ID, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'sessionSourceMedium' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
    });

    console.log('\n\x1b[33m%s\x1b[0m', '🌐 3. ORIGEM DO TRÁFEGO (CANAL / MÍDIA)');
    if (trafficReport.rows && trafficReport.rows.length > 0) {
      trafficReport.rows.forEach(r => {
        const source = r.dimensionValues[0].value;
        const sessions = r.metricValues[0].value;
        console.log(` - ${source.padEnd(35)}: \x1b[36m${sessions} sessão(ões)\x1b[0m`);
      });
    } else {
      console.log(' - Nenhuma origem registrada.');
    }

    // 4. Detalhamento por Evento (Últimos 7 dias)
    const eventsReport = await runGaReport(token, PROPERTY_ID, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }]
    });

    console.log('\n\x1b[33m%s\x1b[0m', '🎯 4. EVENTOS E CONVERSÕES REGISTRADAS');
    if (eventsReport.rows && eventsReport.rows.length > 0) {
      eventsReport.rows.forEach(r => {
        const eventName = r.dimensionValues[0].value;
        const count = r.metricValues[0].value;
        const color = eventName === 'generate_lead' ? '\x1b[32m' : '\x1b[37m';
        console.log(` - Evento [${color}${eventName.padEnd(20)}\x1b[0m]: ${count} disparo(s)`);
      });
    } else {
      console.log(' - Nenhum evento registrado.');
    }

    console.log('\n\x1b[36m%s\x1b[0m', '-------------------------------------------------------');
    console.log('\x1b[36m%s\x1b[0m', ' Dica: Para rodar este relatório a qualquer momento:');
    console.log('\x1b[33m%s\x1b[0m', ' npm run ga-metrics');
    console.log('\x1b[36m%s\x1b[0m', '-------------------------------------------------------\n');

  } catch (err) {
    console.error('\x1b[31m❌ Erro durante a execução:\x1b[0m', err.message);
  }
}

main();
