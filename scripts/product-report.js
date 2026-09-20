// scripts/product-report.js — npm run product-report
//
// Relatório MENSAL de INSIGHTS DE PRODUTO (não conversão). Separado do email
// semanal de conversão de propósito: misturar "como o usuário se comporta" com
// "quantos clientes vieram" foi o que gerou confusão antes. Cada relatório tem
// um público e um consumidor diferentes.
//
// Responde perguntas de CRO/produto:
//   - Até onde as pessoas rolam a página? (onde colocar o CTA)
//   - Quais botões de WhatsApp são usados?
//   - De quais origens vem a atenção?
//
// Fonte: first-party (Netlify Blobs via função `insights`). Sem dependência de
// GA4 nem do CLI de Ads (que é local-only). Roda no GitHub Actions.
//
// Uso:
//   node scripts/product-report.js              # texto em stdout
//   node scripts/product-report.js --out <dir>  # body.txt + body.html
//   node scripts/product-report.js --json       # payload cru (debug)

const fs = require('fs');
const path = require('path');

const DEFAULT_INSIGHTS_URL = process.env.ACCESS_INSIGHTS_URL
  || 'https://consultoriosalustiano.com.br/.netlify/functions/insights';

const DAYS = parseInt(process.env.PRODUCT_REPORT_DAYS || '30', 10);

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------

async function fetchFirstParty(days) {
  const res = await fetch(`${DEFAULT_INSIGHTS_URL}?days=${days}`, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`insights ${res.status}: ${await res.text()}`);
  return res.json();
}

function summarize(api) {
  const s = api.summary || {};
  const scrollTotal = Number(s.page_views || 0);
  // scroll_depth vem como { "25": n, "50": n, "75": n, "100": n }.
  // Convertemos para a fração de visits que alcançou cada profundidade.
  const raw = api.scroll_depth || {};
  const scroll = {};
  for (const depth of ['25', '50', '75', '100']) {
    const n = Number(raw[depth] || 0);
    scroll[depth] = {
      count: n,
      pct: scrollTotal > 0 ? Number(((n / scrollTotal) * 100).toFixed(1)) : 0
    };
  }
  return {
    windowDays: api.window_days,
    generatedAt: api.generated_at,
    total: {
      pageViews: scrollTotal,
      whatsappClicks: Number(s.whatsapp_clicks || 0)
    },
    scroll,
    buttons: api.button_location || {},
    sources: api.sources || {},
    specialties: api.specialties || {}
  };
}

// ---------------------------------------------------------------------------
// Apresentação (mesmo tom natural do relatório de conversão)
// ---------------------------------------------------------------------------

function fmt(n) { return Number(n).toLocaleString('pt-BR'); }

function plural(n, singular, pluralForm) {
  return `${fmt(n)} ${Number(n) === 1 ? singular : pluralForm}`;
}

function friendlySource(name) {
  const n = String(name || '').trim();
  if (/direto|org[âa]nico|\(none\)|\(direct\)/i.test(n)) return 'Quem já conhece o site (busca no Google ou digita o endereço)';
  if (/infectolog/i.test(n)) return 'Anúncios pagos no Google (Infectologia)';
  if (/cardio/i.test(n)) return 'Página de Cardiologia';
  return n || 'Outras origens';
}

function friendlyButton(name) {
  const n = String(name || '').trim();
  const map = {
    'Hero Main': 'Botão principal do topo da página',
    'Header': 'Botão no cabeçalho',
    'Floating_Sticky': 'Botão flutuante (fixo na tela)',
    'Floating Button': 'Botão flutuante'
  };
  return map[n] || n;
}

function periodLabel(when) {
  return `Mês encerrado em ${when.split(',')[0]}`;
}

function renderText(p, when) {
  const L = [];
  L.push('COMPORTAMENTO NO SITE (MÊS) | Consultório Salustiano');
  L.push(periodLabel(when));
  L.push('');
  L.push('Uma leitura sobre COMO as pessoas usam o site. Não é sobre quantos clientes vieram (isso fica no email semanal).');
  L.push('');

  L.push('ATÉ ONDE AS PESSOAS ROLAM A PÁGINA');
  if (p.total.pageViews === 0) {
    L.push('- Sem dados de visualização no período.');
  } else {
    for (const depth of ['25', '50', '75', '100']) {
      const d = p.scroll[depth];
      L.push(`- Chegaram a ${depth}% da página: ${plural(d.count, 'visita', 'visitas')} (${d.pct}%)`);
    }
  }
  L.push('');

  if (Object.keys(p.buttons).length) {
    L.push('ONDE AS PESSOAS TOCAM NO WHATSAPP');
    Object.entries(p.buttons)
      .sort((a, b) => b[1] - a[1])
      .forEach(([b, n]) => L.push(`- ${friendlyButton(b)}: ${plural(n, 'toque', 'toques')}`));
    L.push('');
  }

  L.push('DE ONDE VEM A ATENÇÃO');
  Object.entries(p.sources)
    .sort((a, b) => b[1] - a[1])
    .forEach(([src, n]) => L.push(`- ${friendlySource(src)}: ${plural(n, 'visita', 'visitas')}`));
  L.push('');

  L.push('COMO USAR ISTO');
  L.push('- Pouca gente passando de 50%? O conteúdo/CTA importante pode estar baixo demais.');
  L.push('- Muitos toques no botão flutuante? Ele está funcionando como CTA principal.');
  L.push('- Isto orienta onde mexer na página. Resultado de conversão, veja no email semanal.');
  return L.join('\n');
}

function renderHtml(p, when) {
  const bar = (label, pct) => {
    const width = Math.max(2, Math.min(100, pct));
    return `
    <tr>
      <td style="padding:6px 8px 6px 0;white-space:nowrap;font-size:13px;color:#555">${label}</td>
      <td style="width:100%;padding:6px 0">
        <div style="background:#e5e7eb;border-radius:4px;height:16px;position:relative">
          <div style="background:#0f766e;width:${width}%;height:16px;border-radius:4px"></div>
        </div>
      </td>
      <td style="padding:6px 0 6px 8px;text-align:right;font-size:13px;font-weight:600;color:#0f766e;white-space:nowrap">${pct}%</td>
    </tr>`;
  };

  const scrollRows = p.total.pageViews === 0
    ? '<p style="color:#666">Sem dados de visualização no período.</p>'
    : `<table style="border-collapse:collapse;width:100%">
        ${bar('25%', p.scroll['25'].pct)}
        ${bar('50%', p.scroll['50'].pct)}
        ${bar('75%', p.scroll['75'].pct)}
        ${bar('100%', p.scroll['100'].pct)}
      </table>`;

  const buttonRows = Object.entries(p.buttons)
    .sort((a, b) => b[1] - a[1])
    .map(([b, n]) => `<tr><td style="padding:4px 0">${friendlyButton(b)}</td><td style="text-align:right;padding-left:12px"><b>${fmt(n)}</b></td></tr>`)
    .join('');

  const sourceRows = Object.entries(p.sources)
    .sort((a, b) => b[1] - a[1])
    .map(([src, n]) => `<tr><td style="padding:4px 0">${friendlySource(src)}</td><td style="text-align:right;padding-left:12px"><b>${fmt(n)}</b></td></tr>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;max-width:640px;margin:auto;padding:8px 16px">

  <h1 style="color:#0f766e;font-size:22px;margin-bottom:2px">Como as pessoas usam o site</h1>
  <p style="color:#666;margin-top:0;font-size:14px">Consultório Salustiano, ${periodLabel(when).toLowerCase()}</p>

  <p style="font-size:15px;line-height:1.5;color:#444">
    Uma leitura sobre <b>como</b> as pessoas navegam a página. Não é sobre quantos contatos chegaram
    (isso fica no relatório semanal de contatos).
  </p>

  <h3 style="margin-bottom:6px">Até onde as pessoas rolam a página</h3>
  ${scrollRows}

  ${buttonRows ? `<h3 style="margin-bottom:6px">Onde tocam no WhatsApp</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${buttonRows}</table>` : ''}

  ${sourceRows ? `<h3 style="margin-bottom:6px">De onde vem a atenção</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${sourceRows}</table>` : ''}

  <div style="background:#f0fdfa;padding:12px 16px;border-radius:6px;margin:16px 0;font-size:13px;color:#334155">
    <b>Como usar isto:</b> pouca gente passando de 50% sugere que o conteúdo ou o botão importante
    estão baixos demais. Muitos toques no botão flutuante indicam que ele virou o CTA principal.
    Isto orienta <i>onde mexer na página</i>; o resultado em contatos fica no email semanal.
  </div>

  <p style="color:#aaa;font-size:11px;margin-top:24px">
    Contagem do próprio site, não afetada por bloqueadores de anúncio. Acessos de teste ficam de fora.
  </p>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

async function main() {
  const jsonOnly = process.argv.includes('--json');
  const outDir = argValue('--out');
  const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  let raw;
  try {
    raw = await fetchFirstParty(DAYS);
  } catch (err) {
    console.error(`[product-report] first-party falhou: ${err.message}`);
    process.exit(1);
  }
  const p = summarize(raw);

  if (jsonOnly) {
    console.log(JSON.stringify({ when, days: DAYS, ...p }, null, 2));
    return;
  }

  const text = renderText(p, when);
  const html = renderHtml(p, when);

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'body.txt'), text);
    fs.writeFileSync(path.join(outDir, 'body.html'), html);
    console.log(text);
    console.error(`[product-report] escrito em ${outDir}/body.{txt,html}`);
    return;
  }

  console.log(text);
}

main().catch((err) => {
  console.error(`[product-report] erro fatal: ${err.message}`);
  process.exit(1);
});
