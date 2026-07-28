const fs = require('fs');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', ' 🧪 EXECUTANDO TESTES DE SEGURANÇA E ESTRUTURA ');
console.log('\x1b[36m%s\x1b[0m', '==================================================\n');

let hasErrors = false;

// 1. Validar netlify.toml e CSP
const netlifyTomlPath = path.join(__dirname, '../netlify.toml');
if (!fs.existsSync(netlifyTomlPath)) {
  console.error('\x1b[31m❌ netlify.toml não foi encontrado.\x1b[0m');
  hasErrors = true;
} else {
  const netlifyContent = fs.readFileSync(netlifyTomlPath, 'utf8');
  console.log('✔ netlify.toml encontrado');

  // Testar CSP connect-src
  const requiredConnectDomains = [
    'https://analytics.google.com',
    'https://*.google-analytics.com',
    'https://www.google-analytics.com'
  ];

  const cspMatch = netlifyContent.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
  if (!cspMatch) {
    console.error('\x1b[31m❌ Content-Security-Policy não foi encontrada no netlify.toml.\x1b[0m');
    hasErrors = true;
  } else {
    const cspValue = cspMatch[1];
    console.log('✔ Content-Security-Policy extraída com sucesso');

    const connectSrcMatch = cspValue.match(/connect-src\s+([^;]+);/);
    if (!connectSrcMatch) {
      console.error('\x1b[31m❌ Diretiva connect-src não foi encontrada na CSP.\x1b[0m');
      hasErrors = true;
    } else {
      const connectSrcValue = connectSrcMatch[1];
      requiredConnectDomains.forEach(domain => {
        if (connectSrcValue.includes(domain)) {
          console.log(`  ✅ connect-src permite: ${domain}`);
        } else {
          console.error(`  ❌ connect-src NÃO permite: ${domain}`);
          hasErrors = true;
        }
      });
    }
  }
}

// 2. Validar arquivos HTML principais
const publicDir = path.join(__dirname, '../public');
const requiredPages = ['index.html', 'cardiologia/index.html', '404.html'];

requiredPages.forEach(page => {
  const pagePath = path.join(publicDir, page);
  if (fs.existsSync(pagePath)) {
    console.log(`✔ Página ${page} existe`);
  } else {
    console.error(`❌ Página ${page} não encontrada em public/`);
    hasErrors = true;
  }
});

console.log('\n--------------------------------------------------');
if (hasErrors) {
  console.error('\x1b[31m❌ ALGUNS TESTES FALHARAM.\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\x1b[32m✅ TODOS OS TESTES PASSARAM COM SUCESSO!\x1b[0m\n');
  process.exit(0);
}
