const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', ' 🍎 RUNNING IOS AND CSS INVARIANT TESTS ');
console.log('\x1b[36m%s\x1b[0m', '==================================================\n');

let hasErrors = false;

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const stylePath = path.join(publicDir, 'assets/css/style.css');
const moneyPages = ['index.html', 'cardiologia/index.html'];
const styledPages = [...moneyPages, '404.html'];

if (!fs.existsSync(stylePath)) {
  console.error('\x1b[31m❌ public/assets/css/style.css not found. Run npm run build:css.\x1b[0m');
  process.exit(1);
}

const css = fs.readFileSync(stylePath, 'utf8');

// 1. Every class token in the markup must exist in the compiled stylesheet.
// A stale build is the failure mode this catches: it is invisible otherwise.
console.log('\x1b[33m%s\x1b[0m', '🎨 1. COMPILED CSS COVERS THE MARKUP');
const compiledClasses = new Set(
  [...css.matchAll(/\.((?:\\.|[^\s,{:.>~+()[\]"=])+)/g)]
    .map((match) => match[1].replace(/\\(.)/g, '$1'))
);
// Third-party mount points are injected by their own loader, not by Tailwind.
const classAllowlist = [/^elfsight-app-/];

moneyPages.forEach((page) => {
  const html = fs.readFileSync(path.join(publicDir, page), 'utf8');
  const tokens = new Set();
  for (const match of html.matchAll(/class="([^"]*)"/g)) {
    match[1].split(/\s+/).filter(Boolean).forEach((token) => tokens.add(token));
  }
  const missing = [...tokens].filter((token) =>
    !classAllowlist.some((pattern) => pattern.test(token)) &&
    !compiledClasses.has(token)
  );
  if (missing.length === 0) {
    console.log(`  ✅ ${page}: all ${tokens.size} class tokens are compiled`);
  } else {
    console.error(`  ❌ ${page}: ${missing.length} class(es) missing from the compiled CSS: ${missing.slice(0, 20).join(' ')}`);
    console.error('     Run npm run build:css and commit the regenerated stylesheet.');
    hasErrors = true;
  }
});

// 2. The stylesheet URL must carry a hash matching the current bytes.
// /assets/** is immutable for a year, so a stale stamp freezes the CSS.
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '🏷️  2. STYLESHEET CONTENT STAMP');
const cssHash = crypto.createHash('sha256').update(fs.readFileSync(stylePath)).digest('hex').slice(0, 10);
styledPages.forEach((page) => {
  const html = fs.readFileSync(path.join(publicDir, page), 'utf8');
  const match = html.match(/\/assets\/css\/style\.css\?v=([0-9a-f]+)/);
  if (!match) {
    console.error(`  ❌ ${page}: stylesheet link has no ?v= content hash`);
    hasErrors = true;
  } else if (match[1] !== cssHash) {
    console.error(`  ❌ ${page}: stylesheet stamp ${match[1]} does not match style.css ${cssHash}`);
    hasErrors = true;
  } else {
    console.log(`  ✅ ${page}: style.css?v=${cssHash}`);
  }
});

// 3. Money pages must not size blocks with 100vh. On iOS that maps to the large
// viewport, so content ends up under the URL bar. svh/dvh are allowed.
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '📐 3. NO 100VH ON MONEY PAGES');
const viewportHeightPattern = /(?:\b|["'\s])(?:(?:min-|max-)?h-screen|(?:min-|max-)?h-\[100vh\])(?=["'\s])/;
moneyPages.forEach((page) => {
  const html = fs.readFileSync(path.join(publicDir, page), 'utf8');
  if (viewportHeightPattern.test(html)) {
    console.error(`  ❌ ${page}: h-screen or h-[100vh] found; use min-h-svh or min-h-dvh so the iOS URL bar cannot clip the hero`);
    hasErrors = true;
  } else {
    console.log(`  ✅ ${page}: no 100vh-sized block`);
  }
});

// 4. Hover styles must be gated by @media (hover: hover). Otherwise iOS applies
// them on tap and they stick until the next tap elsewhere.
console.log('\n');
console.log('\x1b[33m%s\x1b[0m', '🖱️  4. HOVER BEHIND @media (hover: hover)');
const tailwindConfig = fs.readFileSync(path.join(root, 'tailwind.config.js'), 'utf8');
const hoverFlag = /hoverOnlyWhenSupported:\s*true/.test(tailwindConfig);
// Collect every block whose @media prelude tests hover. The minified build emits
// `@media (hover:hover)` and an unminified build emits `@media (hover: hover)`, so
// the prelude is matched flexibly instead of by exact string.
const hoverBlocks = [];
const mediaRe = /@media([^{]*)\{/g;
let mediaMatch;
while ((mediaMatch = mediaRe.exec(css)) !== null) {
  if (!/\(\s*hover\s*:\s*hover\s*\)/.test(mediaMatch[1])) continue;
  const start = mediaMatch.index;
  let depth = 0;
  let end = css.length;
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  hoverBlocks.push([start, end]);
  mediaRe.lastIndex = end;
}
let cssWithoutHoverMedia = '';
let cursor = 0;
for (const [start, end] of hoverBlocks) {
  cssWithoutHoverMedia += css.slice(cursor, start);
  cursor = end;
}
cssWithoutHoverMedia += css.slice(cursor);
const bareHover = /:hover/.test(cssWithoutHoverMedia);
if (hoverFlag && hoverBlocks.length > 0 && !bareHover) {
  console.log(`  ✅ hover is emitted inside ${hoverBlocks.length} @media (hover:hover) block(s)`);
} else {
  const reason = !hoverFlag
    ? 'future.hoverOnlyWhenSupported is not enabled in tailwind.config.js'
    : hoverBlocks.length === 0
      ? 'the compiled CSS has no @media (hover:hover) block'
      : 'some :hover rules are outside @media (hover:hover)';
  console.error(`  ❌ ${reason}; sticky :hover breaks touch devices`);
  hasErrors = true;
}

console.log('\n--------------------------------------------------');
if (hasErrors) {
  console.error('\x1b[31m❌ IOS/CSS INVARIANT TESTS FAILED\x1b[0m');
  process.exit(1);
}
console.log('\x1b[32m✅ ALL IOS/CSS INVARIANT TESTS PASSED\x1b[0m');
