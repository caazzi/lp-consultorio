#!/usr/bin/env node
/**
 * Refreshes every <lastmod> in public/sitemap.xml from the last git commit date
 * of the page source file. Runs during the Netlify build, so a stale date can
 * never be published again.
 *
 * Safety rules:
 * - Never exits non-zero: a sitemap problem must not break the deploy.
 * - When a date cannot be resolved (git missing, untracked file, command error)
 *   the existing <lastmod> is kept and a warning is printed.
 * - The file is rewritten only when at least one value actually changes.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP_PATH = path.join(ROOT, 'public', 'sitemap.xml');
const ORIGIN = 'https://consultoriosalustiano.com.br';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Maps a sitemap <loc> to a repo-relative file:
 *   https://host/               -> public/index.html
 *   https://host/cardiologia/   -> public/cardiologia/index.html
 *   https://host/foo.html       -> public/foo.html
 */
function locToRepoFile(loc) {
  let pathname = loc.trim();
  if (pathname.startsWith(ORIGIN)) pathname = pathname.slice(ORIGIN.length);
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  const withoutQuery = pathname.split(/[?#]/)[0];
  return withoutQuery.endsWith('/')
    ? `public${withoutQuery}index.html`
    : `public${withoutQuery}`;
}

/** Returns the last commit date (YYYY-MM-DD) for a tracked file, or null. */
function gitLastModified(repoFile) {
  try {
    const output = execFileSync('git', ['log', '-1', '--format=%cs', '--', repoFile], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    return ISO_DATE.test(output) ? output : null;
  } catch (err) {
    return null;
  }
}

function displayPath(loc) {
  try {
    return new URL(loc).pathname;
  } catch (err) {
    return loc;
  }
}

function main() {
  console.log('\x1b[36m%s\x1b[0m', '🗺️  SITEMAP LASTMOD');
  console.log('\x1b[36m%s\x1b[0m', '-------------------------------------------------------');

  if (!fs.existsSync(SITEMAP_PATH)) {
    console.log('\x1b[33m%s\x1b[0m', '⚠️  public/sitemap.xml not found, nothing to do.');
    return;
  }

  const original = fs.readFileSync(SITEMAP_PATH, 'utf8');
  let changed = 0;
  let skipped = 0;

  const updated = original.replace(/<url>[\s\S]*?<\/url>/g, (block) => {
    const locMatch = block.match(/<loc>([\s\S]*?)<\/loc>/);
    if (!locMatch) return block;

    const loc = locMatch[1].trim();
    const displayed = displayPath(loc);
    const repoFile = locToRepoFile(loc);
    const date = gitLastModified(repoFile);

    const lastmodMatch = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/);
    if (!lastmodMatch) {
      skipped += 1;
      console.log(` \x1b[33m⚠️ \x1b[0m ${displayed} -> no <lastmod> entry, left untouched`);
      return block;
    }

    const current = lastmodMatch[1].trim();
    if (!date) {
      skipped += 1;
      console.log(` \x1b[33m⚠️ \x1b[0m ${displayed} -> kept ${current} (git could not resolve ${repoFile})`);
      return block;
    }

    if (current === date) {
      console.log(` \x1b[36m•\x1b[0m ${displayed} -> ${date} (unchanged)`);
      return block;
    }

    changed += 1;
    console.log(` \x1b[32m✔\x1b[0m ${displayed} -> ${date}`);
    return block.replace(/<lastmod>[\s\S]*?<\/lastmod>/, `<lastmod>${date}</lastmod>`);
  });

  if (updated !== original) {
    fs.writeFileSync(SITEMAP_PATH, updated);
    console.log('\x1b[36m%s\x1b[0m', '-------------------------------------------------------');
    console.log(` ✅ Updated ${changed} lastmod value(s), ${skipped} kept as is.`);
  } else {
    console.log('\x1b[36m%s\x1b[0m', '-------------------------------------------------------');
    const keptNote = skipped > 0 ? ` (${skipped} kept as is)` : '';
    console.log(` ✅ Nothing changed: every lastmod value is already up to date${keptNote}.`);
  }
}

try {
  main();
} catch (err) {
  // A sitemap refresh must never break the build.
  console.log('\x1b[33m%s\x1b[0m', `⚠️  sitemap lastmod skipped: ${err.message}`);
}
