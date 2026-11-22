#!/usr/bin/env node
// Stamps the compiled stylesheet URL with a content hash.
// /assets/** is served with "Cache-Control: immutable" for a year (netlify.toml),
// so the filename alone cannot bust the cache. The hash changes whenever the
// stylesheet bytes change, which is what makes a new deploy visible.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cssPath = path.join(root, 'public/assets/css/style.css');
const pages = [
  'public/index.html',
  'public/cardiologia/index.html',
  'public/404.html'
];

if (!fs.existsSync(cssPath)) {
  console.error('[stamp-css] public/assets/css/style.css not found. Run the Tailwind build first.');
  process.exit(1);
}

const hash = crypto.createHash('sha256').update(fs.readFileSync(cssPath)).digest('hex').slice(0, 10);
const linkPattern = /\/assets\/css\/style\.css(?:\?v=[0-9a-f]+)?/g;
let updated = 0;

for (const page of pages) {
  const pagePath = path.join(root, page);
  const before = fs.readFileSync(pagePath, 'utf8');
  const after = before.replace(linkPattern, `/assets/css/style.css?v=${hash}`);
  if (after !== before) {
    fs.writeFileSync(pagePath, after);
    updated += 1;
  }
}

console.log(`[stamp-css] style.css?v=${hash} (${updated} page(s) updated)`);
