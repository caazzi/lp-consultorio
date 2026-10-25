// scripts/lang-check.js — npm run lang:check
//
// Repo language policy: PT-BR is allowed ONLY in the user UI (`public/**` visible
// copy, `public/llms.txt`) and in emails (the `*-copy.pt.js` modules, email
// subjects, the failure-notice body, and the owner-facing manuals under `docs/`).
// Everything else — code, comments, log/error strings, CLI output, test names,
// workflow step names, config comments, engineering docs — must be English.
//
// Why a checker instead of discipline (2026-10): the codebase had ~800 PT-BR lines
// spread across comments, logs and CI config, and every new file added more. A
// rule that lives only in a document rots; this one fails the build.
//
// Escape hatches, both explicit and reviewable:
//   // lang:allow          -> skip that single line
//   #  lang:allow-block    -> skip that line and the block indented below it
//                            (used for the PT-BR failure-email body in YAML)
//
// Usage:
//   node scripts/lang-check.js            # check
//   node scripts/lang-check.js --update   # rewrite the ratchet baseline
//
// The baseline exists only to allow a deliberate, shrinking debt; with a clean tree
// it stays empty and any new PT-BR line fails immediately.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'lang-baseline.json');

// Whole files that are PT-BR by design.
const ALLOWED_FILES = new Set([
  'public/llms.txt',
  'docs/passo-a-passo-anabel.md',
  'docs/google-ads-cardiologia.md',
  'docs/SETUP_CONVERSAO.md',
  'scripts/lang-check.js' // contains the Portuguese stopword list itself
]);

// Binary / generated files, never scanned.
const SKIP_EXT = /\.(png|jpe?g|webp|ico|woff2?|ttf|eot|gif|pdf|zip)$/i;
const SKIP_FILES = new Set(['package-lock.json']);

// Unambiguous Portuguese words (kept short on purpose: only words that never occur
// in English prose). Diacritics alone already catch most of it.
const PT_WORDS = [
  'não', 'para', 'uma', 'dos', 'das', 'são', 'também', 'então', 'apenas', 'sobre',
  'quando', 'porque', 'usuário', 'função', 'evento', 'semana', 'número', 'dados',
  'código', 'arquivo', 'relatório', 'métrica', 'deve', 'pode', 'faz', 'aqui',
  'isso', 'este', 'esta', 'como', 'sem', 'pelo', 'pela', 'já', 'só', 'é',
  'tentativa', 'falhou', 'erro', 'aviso', 'atualizar', 'servidor', 'página',
  'visualização', 'contagem', 'conversão', 'clique', 'visita', 'seção', 'título',
  'descrição', 'imagem', 'caminho', 'primeiro', 'depois', 'antes', 'sempre',
  'nunca', 'todos', 'todas', 'outros', 'outras', 'mesmo', 'mesma', 'acessos'
];
// Proper nouns / brand names that carry Portuguese spelling but are data, not prose.
const PROPER_NOUNS = /Consultório Salustiano|Salustiano|Maceió|Infectologia|Cardiologia|Anabel|Gilberto/g;

const PT_RE = new RegExp(
  `[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔÀ]|\\b(${PT_WORDS.join('|')})\\b`
);

function trackedFiles() {
  const out = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function isAllowedFile(file) {
  if (ALLOWED_FILES.has(file)) return true;
  if (SKIP_FILES.has(file)) return true;
  if (SKIP_EXT.test(file)) return true;
  // Email copy modules and their golden bodies: PT-BR is their whole purpose.
  if (/^scripts\/lib\/.*-copy\.pt\.js$/.test(file)) return true;
  if (file.startsWith('scripts/__fixtures__/expected/')) return true;
  return false;
}

/** Lines of a file that the checker must inspect. */
function scannableLines(file, src) {
  const lines = src.split('\n');

  // Inside public/ the visible copy is PT-BR by design; only HTML comments are
  // code and therefore must be English.
  if (/^public\/.*\.html$/.test(file)) {
    const comments = [];
    const re = /<!--([\s\S]*?)-->/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const before = src.slice(0, m.index);
      const line = before.split('\n').length;
      comments.push({ line, text: m[1] });
    }
    return comments.map((c) => ({ line: c.line, text: `<!--${c.text}-->` }));
  }

  return lines.map((text, i) => ({ line: i + 1, text }));
}

function checkFile(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const hits = [];
  let blockIndent = null;

  for (const { line, text } of scannableLines(file, src)) {
    const indent = text.length - text.trimStart().length;

    if (blockIndent !== null) {
      // Skip the whole block: blank lines and anything indented at least as deep as
      // the marker (covers `body: |` itself and its content). Stop at a shallower line.
      if (text.trim() === '' || indent >= blockIndent) continue;
      blockIndent = null;
    }
    if (/lang:allow-block/.test(text)) {
      blockIndent = indent;
      continue;
    }
    if (/lang:allow/.test(text)) continue;
    if (!PT_RE.test(text.replace(PROPER_NOUNS, ''))) continue;
    hits.push({ line, text: text.trim().slice(0, 110) });
  }
  return hits;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    delete raw._note;
    return raw;
  } catch {
    return {};
  }
}

function main() {
  const update = process.argv.includes('--update');
  const files = trackedFiles().filter((f) => !isAllowedFile(f));

  const found = {};
  for (const file of files) {
    const hits = checkFile(file);
    if (hits.length) found[file] = hits;
  }

  if (update) {
    const baseline = { _note: 'Shrink-only budget for PT-BR lines outside UI/email. Regenerate with: node scripts/lang-check.js --update' };
    for (const [file, hits] of Object.entries(found)) baseline[file] = hits.length;
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`[lang-check] baseline written: ${Object.keys(found).length} file(s) with debt`);
    return;
  }

  const baseline = loadBaseline();
  let failures = 0;
  let debt = 0;

  for (const [file, hits] of Object.entries(found)) {
    const budget = baseline[file] || 0;
    if (hits.length > budget) {
      failures += 1;
      console.error(`\n❌ ${file}: ${hits.length} PT-BR line(s), budget ${budget}`);
      for (const h of hits.slice(0, 8)) console.error(`   ${h.line}: ${h.text}`);
      if (hits.length > 8) console.error(`   ... and ${hits.length - 8} more`);
    } else if (hits.length > 0) {
      debt += 1;
      console.warn(`⚠️  ${file}: ${hits.length} PT-BR line(s) within the baseline budget (${budget})`);
    }
  }

  if (failures) {
    console.error('\n[lang-check] PT-BR is allowed only in the user UI or in emails.');
    console.error('[lang-check] Translate the lines above, or mark one with `lang:allow`');
    console.error('[lang-check] (or a YAML block with `lang:allow-block`) when it is genuinely UI/email.');
    process.exit(1);
  }

  console.log(`[lang-check] ok (${files.length} files scanned${debt ? `, ${debt} file(s) on the baseline` : ''})`);
}

main();
