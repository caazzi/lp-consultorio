// scripts/run-perf.js — npm run perf
// Relatório Lighthouse mobile (index + cardiologia) para comparar antes/depois.
// A engine vive em scripts/lib/perf.js (compartilhada com o gate de CI
// `npm run perf:check`) para que os dois nunca divirjam.
//
// Mede a URL de produção por padrão. Para medir o código local sem deploy:
//   PERF_BASE_URL=http://localhost:PORT npm run perf
//
// Artefatos vão para fora do repo (evita sujar a árvore de trabalho).

const perf = require('./lib/perf');

const { pad } = perf;

function main() {
  console.log('\x1b[36m' + '='.repeat(70) + '\x1b[0m');
  console.log('\x1b[36m 🚀 PERF — Google Lighthouse (mobile) \x1b[0m');
  console.log('\x1b[36m' + '='.repeat(70) + '\x1b[0m\n');
  console.log(`Chrome: ${perf.chromePath()}`);
  console.log(`Output dir (fora do repo): ${perf.outDir()}\n`);

  const results = perf.runAll();

  console.log('\n\x1b[33m📊 RESULTADOS (mobile)\x1b[0m\n');
  const header = 'Pagina        | Perf   A11y   BP     SEO   | FCP    LCP    TBT    CLS   SI    ';
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const [k, v] of Object.entries(results)) {
    const s = v.summary;
    const m = s.metrics;
    console.log(
      pad(k.padEnd(13), 14) + '| ' +
      pad(s.perf ?? '-', 6) + pad(s.accessibility ?? '-', 6) + pad(s.bestPractices ?? '-', 6) + pad(s.seo ?? '-', 6) +
      ' | ' + pad(m.FCP.display, 6) + pad(m.LCP.display, 6) + pad(m.TBT.display, 6) + pad(m.CLS.display, 7) + pad(m.SI.display, 6)
    );
    console.log(`  (arquivo: ${v.file})`);
  }

  console.log('\n\x1b[36m💡 Use `npm run perf` após mudanças de performance e compare com a linha de base.\x1b[0m');
  console.log('\x1b[36m💡 Gate automático no CI: `npm run perf:check`.\x1b[0m\n');
}

main();
