#!/usr/bin/env node
// Stamps every immutable /assets URL with a hash of the file it points to.
// /assets/** is served with "Cache-Control: immutable" for a year (netlify.toml),
// so a filename alone cannot bust the cache. The hash changes whenever the bytes
// change, which is the only thing that makes a new deploy visible to a returning
// visitor. This used to be a hand-written date (`?v=2026-09-09`) and it drifted:
// tracking.js changed without a new date and nobody noticed.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pages = [
  'public/index.html',
  'public/cardiologia/index.html',
  'public/404.html'
];

const assets = [
  { file: 'public/assets/css/style.css', url: '/assets/css/style.css' },
  { file: 'public/assets/js/tracking.js', url: '/assets/js/tracking.js' },
  { file: 'public/assets/js/main.js', url: '/assets/js/main.js' }
].map((asset) => {
  const absolute = path.join(root, asset.file);
  if (!fs.existsSync(absolute)) {
    console.error(`[stamp-assets] ${asset.file} not found. Build the stylesheet first.`);
    process.exit(1);
  }
  return {
    ...asset,
    hash: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex').slice(0, 10)
  };
});

let updated = 0;
for (const page of pages) {
  const pagePath = path.join(root, page);
  let html = fs.readFileSync(pagePath, 'utf8');
  const before = html;
  for (const asset of assets) {
    const escaped = asset.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`${escaped}(?:\\?v=[^"']*)?`, 'g'), `${asset.url}?v=${asset.hash}`);
  }
  if (html !== before) {
    fs.writeFileSync(pagePath, html);
    updated += 1;
  }
}

for (const asset of assets) {
  console.log(`[stamp-assets] ${asset.url}?v=${asset.hash}`);
}
console.log(`[stamp-assets] ${updated} page(s) updated`);
