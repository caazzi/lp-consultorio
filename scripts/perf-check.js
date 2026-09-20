// scripts/perf-check.js — npm run perf:check
//
// Gate de Web Vitals no CI. Roda a MESMA engine do `npm run perf`
// (scripts/lib/perf.js) contra um servidor estático local e FALHA (exit 1) se
// qualquer métrica estourar o orçamento de performance.
//
// Substitui o RUM de Web Vitals que ia para o GA4: o laboratório é
// determinístico (mesmo runner, mesmo throttle), mede o código do push ANTES
// do deploy e não polui o relatório de conversão.
//
// Escopo deliberado: mede o estático (HTML/CSS/JS de public/). NÃO mede infra
// (TTFB da Netlify), que é decisão em aberto no AGENTS.md.

const perf = require('./lib/perf');

const { pad } = perf;

// Orçamento de performance (mobile). Frouxo o bastante para não quebrar por
// ruído do runner, apertado o bastante para pegar regressão real (ex.: gtag
// eager que levou o TBT de ~20ms para 4-6s). Ajustar com baseline real.
const BUDGET = {
  perfMin: 70,        // score de Performance (0-100)
  LCP: 2500,          // ms
  TBT: 3000,          // ms
  CLS: 0.1,           // adimensional
  FCP: 2500           // ms
};

function displayValue(key, value) {
  return key === 'CLS' ? value.toFixed(3) : `${Math.round(value)}ms`;
}

function evaluate(name, summary) {
  const m = summary.metrics;
  const failures = [];

  // Score ausente = medição inválida. Nunca tratar como aprovado.
  if (summary.perf == null) {
    return { failures: [`${name}: medição inválida (score de performance ausente)`] };
  }
  if (summary.perf < BUDGET.perfMin) {
    failures.push(`${name}: Performance ${summary.perf} < mínimo ${BUDGET.perfMin}`);
  }
  for (const key of ['LCP', 'TBT', 'CLS', 'FCP']) {
    const value = m[key] && m[key].numeric;
    if (value == null) {
      failures.push(`${name}: ${key} não medido (medição inválida)`);
      continue;
    }
    if (value > BUDGET[key]) {
      failures.push(`${name}: ${key} ${displayValue(key, value)} > orçamento ${displayValue(key, BUDGET[key])}`);
    }
  }
  return { failures };
}

function main() {
  console.log('\x1b[36m' + '='.repeat(70) + '\x1b[0m');
  console.log('\x1b[36m 🚦 PERF GATE — Web Vitals (mobile, servidor local) \x1b[0m');
  console.log('\x1b[36m' + '='.repeat(70) + '\x1b[0m\n');
  console.log(`Chrome: ${perf.chromePath()}`);
  console.log(`Base: ${process.env.PERF_BASE_URL || '(produção)'}`);
  console.log(`Orçamento: Perf >= ${BUDGET.perfMin} | LCP <= ${BUDGET.LCP}ms | TBT <= ${BUDGET.TBT}ms | CLS <= ${BUDGET.CLS} | FCP <= ${BUDGET.FCP}ms\n`);

  const results = perf.runAll();

  console.log('\x1b[33m📊 RESULTADOS\x1b[0m\n');
  const header = 'Pagina        | Perf   | FCP    LCP    TBT    CLS   ';
  console.log(header);
  console.log('-'.repeat(header.length));

  let allFailures = [];
  for (const [k, v] of Object.entries(results)) {
    const s = v.summary;
    const m = s.metrics;
    console.log(
      pad(k.padEnd(13), 14) + '| ' +
      pad(s.perf ?? '-', 7) + '| ' +
      pad(m.FCP.display, 6) + pad(m.LCP.display, 6) + pad(m.TBT.display, 6) + pad(m.CLS.display, 6)
    );
    allFailures = allFailures.concat(evaluate(k, s).failures);
  }

  if (allFailures.length) {
    console.log('\n\x1b[31m❌ ORÇAMENTO DE PERFORMANCE ESTOURADO:\x1b[0m');
    allFailures.forEach((f) => console.log(`  - ${f}`));
    console.log('\n\x1b[33mSe a regressão for aceitável, ajuste BUDGET em scripts/perf-check.js com justificativa.\x1b[0m\n');
    process.exit(1);
  }

  console.log('\n\x1b[32m✅ Web Vitals dentro do orçamento.\x1b[0m\n');
}

main();
