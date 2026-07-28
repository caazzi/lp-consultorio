const fs = require('fs');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', ' ⚡ DIAGNÓSTICO DE PERFORMANCE E WEB VITALS (IDE) ');
console.log('\x1b[36m%s\x1b[0m', '==================================================\n');

// 1. Inspecionar Relatório de Auditoria Existente
const reportPath = path.join(__dirname, '../consultoriosalustiano.com.br.report.json');
if (fs.existsSync(reportPath)) {
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    console.log('\x1b[33m%s\x1b[0m', '📊 1. RESUMO DA ÚLTIMA AUDITORIA LIGHTHOUSE (PRODUÇÃO)');
    console.log(` Data da Varredura: ${new Date(report.scan_date).toLocaleString('pt-BR')}`);
    console.log(` Domínio: ${report.target_domain}`);
    
    if (report.lighthouse) {
      console.log(` Pontuação Geral: \x1b[32m${report.lighthouse.score}/100\x1b[0m`);
      const lh = report.lighthouse.full_report_data;
      if (lh && lh.categories) {
        Object.keys(lh.categories).forEach(cat => {
          const score = Math.round((lh.categories[cat].score || 0) * 100);
          const color = score >= 90 ? '\x1b[32m' : score >= 50 ? '\x1b[33m' : '\x1b[31m';
          console.log(`   - ${cat.toUpperCase()}: ${color}${score}/100\x1b[0m`);
        });
      }
      if (lh && lh.audits) {
        console.log('\n \x1b[33m⚡ Métricas Chave do Usuário (Core Web Vitals):\x1b[0m');
        const metrics = [
          { key: 'first-contentful-paint', label: 'FCP (Primeira Pintura)' },
          { key: 'largest-contentful-paint', label: 'LCP (Carregamento Principal)' },
          { key: 'total-blocking-time', label: 'TBT (Tempo Bloqueado)' },
          { key: 'cumulative-layout-shift', label: 'CLS (Estabilidade Visual)' },
          { key: 'speed-index', label: 'Speed Index (Índice de Velocidade)' }
        ];
        metrics.forEach(m => {
          const audit = lh.audits[m.key];
          if (audit) {
            const score = Math.round((audit.score || 0) * 100);
            const color = score >= 90 ? '\x1b[32m' : score >= 50 ? '\x1b[33m' : '\x1b[31m';
            console.log(`   - ${m.label.padEnd(35)}: ${color}${audit.displayValue}\x1b[0m (Score: ${score}/100)`);
          }
        });
      }
    }
  } catch (err) {
    console.error('Erro ao ler relatório:', err.message);
  }
}

// 2. Análise de Código Estático (HTML / JS / CSS)
console.log('\n\x1b[33m%s\x1b[0m', '🔍 2. VARREDURA DE OTIMIZAÇÃO NO CÓDIGO FONTE (PÁGINAS HTML)');
const publicDir = path.join(__dirname, '../public');
const htmlFiles = [];

function getHtmlFiles(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getHtmlFiles(fullPath);
    } else if (file.endsWith('.html')) {
      htmlFiles.push(fullPath);
    }
  });
}
getHtmlFiles(publicDir);

htmlFiles.forEach(file => {
  const relPath = path.relative(path.join(__dirname, '..'), file);
  console.log(`\n📄 \x1b[35m[${relPath}]\x1b[0m`);
  const content = fs.readFileSync(file, 'utf8');

  // Checagem de Imagens sem atributos de dimensão / lazy loading
  const imgMatches = content.match(/<img[^>]*>/gi) || [];
  let unoptimizedImgs = 0;
  imgMatches.forEach(img => {
    if (!img.includes('width=') || !img.includes('height=')) unoptimizedImgs++;
  });
  if (unoptimizedImgs > 0) {
    console.log(`   ⚠️  \x1b[31m${unoptimizedImgs} imagem(ns) sem atributos 'width' ou 'height' expressos\x1b[0m (risco de CLS).`);
  } else {
    console.log(`   ✅  Todas as imagens possuem 'width' e 'height' configurados.`);
  }

  // Checagem de Preload de fontes e LCP
  const fontPreload = content.includes('rel="preload"') && content.includes('woff2');
  console.log(`   ${fontPreload ? '✅' : '⚠️'}  Preload de fontes locais: ${fontPreload ? '\x1b[32mConfigurado\x1b[0m' : '\x1b[31mAusente\x1b[0m'}`);

  // Checagem de RUM Web Vitals Tracking
  const trackingScript = content.includes('tracking.js');
  console.log(`   ${trackingScript ? '✅' : '⚠️'}  Script de Rastreamento (UTMs e RUM Web Vitals): ${trackingScript ? '\x1b[32mPresente\x1b[0m' : '\x1b[31mAusente\x1b[0m'}`);
});

// 3. Tamanho de Imagens no Projeto
console.log('\n\x1b[33m%s\x1b[0m', '🖼️  3. REVISÃO DE IMAGENS E FORMATOS (WEBP / JPG)');
const imgDir = path.join(__dirname, '../public/assets/images');
if (fs.existsSync(imgDir)) {
  const images = fs.readdirSync(imgDir);
  images.forEach(img => {
    const filePath = path.join(imgDir, img);
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    const isWebp = img.endsWith('.webp');
    const color = isWebp ? '\x1b[32m' : '\x1b[33m';
    console.log(`   - ${img.padEnd(45)}: ${color}${sizeKB} KB\x1b[0m ${isWebp ? '(Formato Otimizado WebP)' : '(Fallback JPG)'}`);
  });
}

console.log('\n\x1b[36m%s\x1b[0m', '--------------------------------------------------');
console.log('\x1b[36m%s\x1b[0m', ' Dica: Para rodar este relatório a qualquer momento:');
console.log('\x1b[33m%s\x1b[0m', ' npm run analyze');
console.log('\x1b[36m%s\x1b[0m', '--------------------------------------------------\n');
