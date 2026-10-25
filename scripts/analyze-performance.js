const fs = require('fs');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', ' ⚡ PERFORMANCE & WEB VITALS DIAGNOSTICS (IDE) ');
console.log('\x1b[36m%s\x1b[0m', '==================================================\n');

// 1. Inspect the existing audit report
const reportPath = path.join(__dirname, '../consultoriosalustiano.com.br.report.json');
if (fs.existsSync(reportPath)) {
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    console.log('\x1b[33m%s\x1b[0m', '📊 1. LAST LIGHTHOUSE AUDIT SUMMARY (PRODUCTION)');
    console.log(` Scan date: ${new Date(report.scan_date).toLocaleString('en-GB')}`);
    console.log(` Domain: ${report.target_domain}`);

    if (report.lighthouse) {
      console.log(` Overall score: \x1b[32m${report.lighthouse.score}/100\x1b[0m`);
      const lh = report.lighthouse.full_report_data;
      if (lh && lh.categories) {
        Object.keys(lh.categories).forEach(cat => {
          const score = Math.round((lh.categories[cat].score || 0) * 100);
          const color = score >= 90 ? '\x1b[32m' : score >= 50 ? '\x1b[33m' : '\x1b[31m';
          console.log(`   - ${cat.toUpperCase()}: ${color}${score}/100\x1b[0m`);
        });
      }
      if (lh && lh.audits) {
        console.log('\n \x1b[33m⚡ Key user metrics (Core Web Vitals):\x1b[0m');
        const metrics = [
          { key: 'first-contentful-paint', label: 'FCP (First Contentful Paint)' },
          { key: 'largest-contentful-paint', label: 'LCP (Largest Contentful Paint)' },
          { key: 'total-blocking-time', label: 'TBT (Total Blocking Time)' },
          { key: 'cumulative-layout-shift', label: 'CLS (Layout Stability)' },
          { key: 'speed-index', label: 'Speed Index' }
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
    console.error('Failed to read the report:', err.message);
  }
}

// 2. Static code analysis (HTML / JS / CSS)
console.log('\n\x1b[33m%s\x1b[0m', '🔍 2. OPTIMIZATION SCAN OF THE SOURCE (HTML PAGES)');
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

  // Images without dimension attributes (CLS risk)
  const imgMatches = content.match(/<img[^>]*>/gi) || [];
  let unoptimizedImgs = 0;
  imgMatches.forEach(img => {
    if (!img.includes('width=') || !img.includes('height=')) unoptimizedImgs++;
  });
  if (unoptimizedImgs > 0) {
    console.log(`   ⚠️  \x1b[31m${unoptimizedImgs} image(s) without explicit 'width' or 'height'\x1b[0m (CLS risk).`);
  } else {
    console.log(`   ✅  Every image has 'width' and 'height' set.`);
  }

  // decoding=async on the hero image
  const heroImg = imgMatches.find(img => img.includes('fetchpriority="high"') || img.includes("fetchpriority='high'"));
  if (heroImg) {
    const hasDecodingAsync = heroImg.includes('decoding="async"') || heroImg.includes("decoding='async'");
    console.log(`   ${hasDecodingAsync ? '✅' : '⚠️'}  Hero image decoding=async: ${hasDecodingAsync ? '\x1b[32mset\x1b[0m' : '\x1b[31mmissing\x1b[0m (hurts mobile LCP)'}`);
  }

  // Font preload
  const fontPreload = content.includes('rel="preload"') && content.includes('woff2');
  console.log(`   ${fontPreload ? '✅' : '⚠️'}  Local font preload: ${fontPreload ? '\x1b[32mset\x1b[0m' : '\x1b[31mmissing\x1b[0m'}`);

  // Tracking script (UTMs/conversion). Web Vitals are no longer measured in the
  // browser: they became a CI gate (.github/workflows/perf.yml).
  const trackingScript = content.includes('tracking.js');
  console.log(`   ${trackingScript ? '✅' : '⚠️'}  Tracking script (UTMs/conversion): ${trackingScript ? '\x1b[32mpresent\x1b[0m' : '\x1b[31mmissing\x1b[0m'}`);
});

// 3. Image sizes in the project
console.log('\n\x1b[33m%s\x1b[0m', '🖼️  3. IMAGE REVIEW AND FORMATS (WEBP / JPG)');
const imgDir = path.join(__dirname, '../public/assets/images');
if (fs.existsSync(imgDir)) {
  const images = fs.readdirSync(imgDir);
  images.forEach(img => {
    const filePath = path.join(imgDir, img);
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    const isWebp = img.endsWith('.webp');
    const color = isWebp ? '\x1b[32m' : '\x1b[33m';
    console.log(`   - ${img.padEnd(45)}: ${color}${sizeKB} KB\x1b[0m ${isWebp ? '(optimized WebP)' : '(JPG fallback)'}`);
  });
}

console.log('\n\x1b[36m%s\x1b[0m', '--------------------------------------------------');
console.log('\x1b[36m%s\x1b[0m', ' Tip: run this report again at any time with:');
console.log('\x1b[33m%s\x1b[0m', ' npm run analyze');
console.log('\x1b[36m%s\x1b[0m', '--------------------------------------------------\n');
